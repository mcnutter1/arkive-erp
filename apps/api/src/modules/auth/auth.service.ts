import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { PrismaService } from '../common/prisma.service.js';
import { AuthenticatedUser } from './auth.types.js';
import { makeSessionCookie, parseCookie, SESSION_COOKIE_NAME } from './cookie.util.js';

type LocalAdminSetting = {
  username?: string;
  email?: string;
  passwordHash?: string;
  passwordSalt?: string;
  rotatedAt?: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }

  private isLocalLoginEnabled(): boolean {
    return (this.config.get<string>('AUTH_LOCAL_LOGIN_ENABLED') ?? 'true') === 'true';
  }

  private getLocalAdminUsername(): string {
    return this.config.get<string>('AUTH_LOCAL_ADMIN_USERNAME') ?? 'admin';
  }

  private getLocalAdminPassword(): string {
    return this.config.get<string>('AUTH_LOCAL_ADMIN_PASSWORD') ?? 'admin';
  }

  private getLocalAdminEmail(): string {
    return this.config.get<string>('AUTH_LOCAL_ADMIN_EMAIL') ?? 'admin@local.arkive';
  }

  private getLocalAdminStoredSettingKey() {
    return {
      section: 'auth',
      key: 'localAdmin',
    };
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private passwordMatches(password: string, salt: string, expectedHash: string): boolean {
    const actualHash = this.hashPassword(password, salt);
    const actualBuffer = Buffer.from(actualHash, 'hex');
    const expectedBuffer = Buffer.from(expectedHash, 'hex');

    if (actualBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private async getLocalAdminSetting(organizationId: string): Promise<LocalAdminSetting | null> {
    const selector = this.getLocalAdminStoredSettingKey();
    const setting = await this.prisma.systemSetting.findFirst({
      where: {
        organizationId,
        section: selector.section,
        key: selector.key,
      },
      select: {
        value: true,
      },
    });

    if (!setting || typeof setting.value !== 'object' || !setting.value) {
      return null;
    }

    return setting.value as unknown as LocalAdminSetting;
  }

  private async saveLocalAdminSetting(
    organizationId: string,
    updatedByUserId: string,
    value: LocalAdminSetting,
  ): Promise<void> {
    const selector = this.getLocalAdminStoredSettingKey();

    await this.prisma.systemSetting.upsert({
      where: {
        organizationId_section_key: {
          organizationId,
          section: selector.section,
          key: selector.key,
        },
      },
      update: {
        value,
        updatedByUserId,
      },
      create: {
        organizationId,
        section: selector.section,
        key: selector.key,
        value,
        updatedByUserId,
      },
    });
  }

  private async getLocalAdminCredentials(organizationId: string): Promise<{
    username: string;
    email: string;
    plainPassword?: string;
    passwordHash?: string;
    passwordSalt?: string;
    mustRotatePassword: boolean;
  }> {
    const stored = await this.getLocalAdminSetting(organizationId);
    const defaultUsername = this.getLocalAdminUsername();
    const defaultPassword = this.getLocalAdminPassword();
    const defaultEmail = this.getLocalAdminEmail();

    const username = stored?.username ?? defaultUsername;
    const email = stored?.email ?? defaultEmail;
    const hasStoredHash = typeof stored?.passwordHash === 'string' && typeof stored?.passwordSalt === 'string';

    return {
      username,
      email,
      plainPassword: hasStoredHash ? undefined : defaultPassword,
      passwordHash: hasStoredHash ? stored?.passwordHash : undefined,
      passwordSalt: hasStoredHash ? stored?.passwordSalt : undefined,
      mustRotatePassword: !hasStoredHash && defaultUsername === 'admin' && defaultPassword === 'admin',
    };
  }

  private isLocalAdminEmail(email: string): boolean {
    return this.isLocalLoginEnabled() && email.toLowerCase() === this.getLocalAdminEmail().toLowerCase();
  }

  private async isLocalAdminUser(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, archivedAt: null },
      select: { organizationId: true, email: true },
    });

    if (!user || !this.isLocalLoginEnabled()) {
      return false;
    }

    const local = await this.getLocalAdminCredentials(user.organizationId);
    return user.email.toLowerCase() === local.email.toLowerCase();
  }

  private getAllowedTenants(): string[] {
    const allowedTenantsRaw = this.config.get<string>('ENTRA_ALLOWED_TENANTS') ?? '';
    return allowedTenantsRaw
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }

  private getTenantForOidc(): string {
    const allowedTenants = this.getAllowedTenants();
    const tenant = allowedTenants[0];
    if (!tenant) {
      throw new UnauthorizedException('No allowed Entra tenants configured');
    }
    return tenant;
  }

  private async loadAuthenticatedUserByUserId(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, archivedAt: null },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User is not registered');
    }

    const permissions = user.userRoles
      .flatMap((ur) => ur.role.rolePermissions.map((rp) => rp.permission.code))
      .filter((value, index, self) => self.indexOf(value) === index);

    const userEmail = user.email;
    const localAdmin = this.isLocalAdminEmail(userEmail);
    let mustRotatePassword = false;

    if (localAdmin) {
      const local = await this.getLocalAdminCredentials(user.organizationId);
      mustRotatePassword = local.mustRotatePassword;
    }

    return {
      id: user.id,
      organizationId: user.organizationId,
      personId: user.personId ?? undefined,
      email: userEmail,
      permissions: localAdmin ? ['*', ...permissions] : permissions,
      isLocalAdmin: localAdmin,
      mustRotatePassword,
    };
  }

  private async createSessionForUser(
    user: { id: string; organizationId: string },
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ cookie: string }> {
    const sessionTtlHours = Number(this.config.get<string>('SESSION_TTL_HOURS') ?? '8');
    const maxAgeSeconds = Math.max(3600, sessionTtlHours * 3600);
    const sessionToken = randomUUID();
    const sessionTokenHash = this.sha256(sessionToken);
    const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

    await this.prisma.$transaction([
      this.prisma.authSession.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          sessionTokenHash,
          expiresAt,
          ipAddress,
          userAgent,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), status: 'ACTIVE' },
      }),
    ]);

    return {
      cookie: makeSessionCookie(sessionToken, maxAgeSeconds),
    };
  }

  async buildAuthorizeRedirect(returnTo?: string): Promise<string> {
    const tenant = this.getTenantForOidc();
    const clientId = this.config.get<string>('ENTRA_CLIENT_ID');
    const redirectUri = this.config.get<string>('ENTRA_REDIRECT_URI');

    if (!clientId || !redirectUri) {
      throw new UnauthorizedException('Entra auth is not configured');
    }

    const org = await this.prisma.organization.findFirst({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (!org) {
      throw new UnauthorizedException('No organization configured');
    }

    const state = randomUUID();
    const nonce = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await this.prisma.oidcAuthState.create({
      data: {
        organizationId: org.id,
        stateHash: this.sha256(state),
        nonceHash: this.sha256(nonce),
        returnTo,
        expiresAt,
      },
    });

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      response_mode: 'query',
      scope: 'openid profile email offline_access',
      state,
      nonce,
      prompt: 'select_account',
    });

    return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
  }

  async completeAuthorizationCodeFlow(
    code: string,
    state: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ cookie: string; redirectTo: string }> {
    const stateHash = this.sha256(state);
    const stored = await this.prisma.oidcAuthState.findFirst({
      where: {
        stateHash,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!stored) {
      throw new UnauthorizedException('OIDC state is invalid or expired');
    }

    const tenant = this.getTenantForOidc();
    const clientId = this.config.get<string>('ENTRA_CLIENT_ID');
    const clientSecret = this.config.get<string>('ENTRA_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('ENTRA_REDIRECT_URI');

    if (!clientId || !clientSecret || !redirectUri) {
      throw new UnauthorizedException('Entra auth configuration is incomplete');
    }

    const tokenEndpoint = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResp.ok) {
      throw new UnauthorizedException('Code exchange failed');
    }

    const tokenJson = (await tokenResp.json()) as {
      id_token?: string;
    };

    if (!tokenJson.id_token) {
      throw new UnauthorizedException('ID token missing in token response');
    }

    const jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`),
    );
    const verified = await jwtVerify(tokenJson.id_token, jwks, {
      audience: clientId,
      issuer: [`https://login.microsoftonline.com/${tenant}/v2.0`],
    });

    const tid = verified.payload.tid;
    const oid = verified.payload.oid;
    const nonce = verified.payload.nonce;
    const email = verified.payload.preferred_username;

    if (
      typeof tid !== 'string' ||
      typeof oid !== 'string' ||
      typeof nonce !== 'string' ||
      typeof email !== 'string'
    ) {
      throw new UnauthorizedException('Required ID token claims missing');
    }

    if (!this.getAllowedTenants().includes(tid)) {
      throw new UnauthorizedException('Tenant is not allowed');
    }

    if (this.sha256(nonce) !== stored.nonceHash) {
      throw new UnauthorizedException('Nonce validation failed');
    }

    let user = await this.prisma.user.findFirst({
      where: {
        microsoftUserId: oid,
        archivedAt: null,
      },
    });

    if (!user && (this.config.get<string>('AUTH_JIT_ENABLED') ?? 'false') === 'true') {
      user = await this.prisma.user.create({
        data: {
          organizationId: stored.organizationId,
          microsoftUserId: oid,
          email,
          status: 'ACTIVE',
        },
      });
    }

    if (!user) {
      throw new UnauthorizedException('User is not registered');
    }

    await this.prisma.$transaction([
      this.prisma.oidcAuthState.update({
        where: { id: stored.id },
        data: { consumedAt: new Date() },
      }),
    ]);

    const session = await this.createSessionForUser(user, ipAddress, userAgent);

    return {
      cookie: session.cookie,
      redirectTo: stored.returnTo ?? this.config.get<string>('APP_BASE_URL') ?? '/',
    };
  }

  async localAdminLogin(
    username: string,
    password: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ cookie: string; redirectTo: string }> {
    if (!this.isLocalLoginEnabled()) {
      throw new UnauthorizedException('Local login is disabled');
    }

    let org = await this.prisma.organization.findFirst({
      where: { archivedAt: null },
      orderBy: { createdAt: 'asc' },
    });

    if (!org) {
      org = await this.prisma.organization.create({
        data: {
          code: 'default',
          name: 'Default Organization',
        },
      });
    }

    const localAdmin = await this.getLocalAdminCredentials(org.id);

    if (username !== localAdmin.username) {
      throw new UnauthorizedException('Invalid username or password');
    }

    if (localAdmin.passwordHash && localAdmin.passwordSalt) {
      if (!this.passwordMatches(password, localAdmin.passwordSalt, localAdmin.passwordHash)) {
        throw new UnauthorizedException('Invalid username or password');
      }
    } else if (password !== (localAdmin.plainPassword ?? '')) {
      throw new UnauthorizedException('Invalid username or password');
    }

    let user = await this.prisma.user.findFirst({
      where: {
        organizationId: org.id,
        email: localAdmin.email,
        archivedAt: null,
      },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          organizationId: org.id,
          email: localAdminEmail,
          status: 'ACTIVE',
        },
      });
    }

    const session = await this.createSessionForUser(user, ipAddress, userAgent);

    return {
      cookie: session.cookie,
      redirectTo: this.config.get<string>('APP_BASE_URL') ?? '/',
      mustRotatePassword: localAdmin.mustRotatePassword,
    };
  }

  async rotateLocalAdminPassword(
    actor: AuthenticatedUser,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (!actor.isLocalAdmin || !(await this.isLocalAdminUser(actor.id))) {
      throw new UnauthorizedException('Local admin access required');
    }

    const local = await this.getLocalAdminCredentials(actor.organizationId);

    const currentMatches =
      local.passwordHash && local.passwordSalt
        ? this.passwordMatches(currentPassword, local.passwordSalt, local.passwordHash)
        : currentPassword === (local.plainPassword ?? '');

    if (!currentMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const salt = randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(newPassword, salt);

    await this.saveLocalAdminSetting(actor.organizationId, actor.id, {
      username: local.username,
      email: local.email,
      passwordHash,
      passwordSalt: salt,
      rotatedAt: new Date().toISOString(),
    });
  }

  async verifyAccessToken(token: string): Promise<Record<string, unknown>> {
    const allowedTenants = this.getAllowedTenants();
    const tenantForJwks = this.getTenantForOidc();
    const jwks = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantForJwks}/discovery/v2.0/keys`),
    );

    const audience = this.config.get<string>('ENTRA_CLIENT_ID');
    if (!audience) {
      throw new UnauthorizedException('ENTRA_CLIENT_ID is missing');
    }

    const { payload } = await jwtVerify(token, jwks, {
      audience,
      issuer: [
        `https://login.microsoftonline.com/${tenantForJwks}/v2.0`,
        `https://sts.windows.net/${tenantForJwks}/`,
      ],
    });

    const tid = payload.tid;
    if (!tid || typeof tid !== 'string' || !allowedTenants.includes(tid)) {
      throw new UnauthorizedException('Tenant is not allowed');
    }

    return payload as Record<string, unknown>;
  }

  async getAuthenticatedUserFromBearer(token: string): Promise<AuthenticatedUser> {
    const claims = await this.verifyAccessToken(token);
    const oid = claims.oid;
    const email = claims.preferred_username;

    if (typeof oid !== 'string' || typeof email !== 'string') {
      throw new UnauthorizedException('Required claims missing');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        microsoftUserId: oid,
        archivedAt: null,
      },
      select: { id: true },
    });

    if (!user) {
      throw new UnauthorizedException('User is not registered');
    }

    const authenticated = await this.loadAuthenticatedUserByUserId(user.id);
    authenticated.email = email;
    return authenticated;
  }

  async getAuthenticatedUserFromCookie(cookieHeader: string | undefined): Promise<AuthenticatedUser | null> {
    const sessionToken = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
    if (!sessionToken) {
      return null;
    }

    const sessionTokenHash = this.sha256(sessionToken);
    const session = await this.prisma.authSession.findFirst({
      where: {
        sessionTokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: {
        id: true,
        userId: true,
      },
    });

    if (!session) {
      return null;
    }

    const user = await this.loadAuthenticatedUserByUserId(session.userId);
    await this.prisma.authSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
    user.sessionId = session.id;
    return user;
  }

  async revokeCurrentSession(actor: AuthenticatedUser, cookieHeader: string | undefined): Promise<void> {
    const sessionToken = parseCookie(cookieHeader, SESSION_COOKIE_NAME);
    if (!sessionToken) {
      return;
    }

    const sessionTokenHash = this.sha256(sessionToken);
    await this.prisma.authSession.updateMany({
      where: {
        sessionTokenHash,
        userId: actor.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
