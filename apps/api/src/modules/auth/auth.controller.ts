import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from './current-user.decorator.js';
import { AuthenticatedUser } from './auth.types.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { clearSessionCookie } from './cookie.util.js';

@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('login')
  @Public()
  async login(
    @Query('returnTo') returnTo: string | undefined,
    @Res() res: { redirect: (url: string) => void },
  ): Promise<void> {
    const redirectUrl = await this.authService.buildAuthorizeRedirect(returnTo);
    res.redirect(redirectUrl);
  }

  @Get('callback')
  @Public()
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: { ip?: string; headers: Record<string, string | undefined> },
    @Res() res: { header: (name: string, value: string) => void; redirect: (url: string) => void },
  ): Promise<void> {
    if (!code || !state) {
      throw new UnauthorizedException('Missing code/state');
    }

    const completed = await this.authService.completeAuthorizationCodeFlow(
      code,
      state,
      req.ip,
      req.headers['user-agent'],
    );

    res.header('Set-Cookie', completed.cookie);
    res.redirect(completed.redirectTo);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  async logout(
    @CurrentUser() actor: AuthenticatedUser,
    @Req() req: { headers: Record<string, string | undefined> },
    @Res() res: { header: (name: string, value: string) => void; send: (body: unknown) => void },
  ): Promise<void> {
    await this.authService.revokeCurrentSession(actor, req.headers.cookie);
    res.header('Set-Cookie', clearSessionCookie());
    res.send({ ok: true });
  }

  @Get('session')
  @UseGuards(AuthGuard)
  session(@CurrentUser() actor: AuthenticatedUser) {
    return {
      user: {
        id: actor.id,
        email: actor.email,
        organizationId: actor.organizationId,
        permissions: actor.permissions,
      },
      sessionId: actor.sessionId,
    };
  }
}
