import { createHmac, timingSafeEqual } from 'node:crypto';

type SignatureLinkClaims = {
  participantId: string;
  organizationId: string;
  exp: number;
};

function readSecret(): string {
  const secret = (process.env.SIGNATURE_LINK_SECRET ?? process.env.COOKIE_SECRET ?? '').trim();
  if (!secret) {
    throw new Error('SIGNATURE_LINK_SECRET or COOKIE_SECRET must be configured for public signer links');
  }
  return secret;
}

function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(encodedPayload: string): string {
  return createHmac('sha256', readSecret()).update(encodedPayload).digest('base64url');
}

function safeCompare(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function createSignerLinkToken(input: {
  participantId: string;
  organizationId: string;
  expiresAt?: Date;
  ttlSeconds?: number;
}): string {
  const ttlSeconds = Math.max(Math.floor(input.ttlSeconds ?? 60 * 60 * 24 * 14), 60);
  const exp = input.expiresAt
    ? Math.floor(input.expiresAt.getTime() / 1000)
    : Math.floor(Date.now() / 1000) + ttlSeconds;

  const payload: SignatureLinkClaims = {
    participantId: input.participantId,
    organizationId: input.organizationId,
    exp,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

export function verifySignerLinkToken(
  token: string | undefined,
  expected: { participantId: string; organizationId: string },
): { valid: boolean; reason?: string; expiresAt?: Date } {
  if (!token) {
    return { valid: false, reason: 'missing-token' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { valid: false, reason: 'invalid-token-format' };
  }

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) {
    return { valid: false, reason: 'invalid-token-format' };
  }

  const expectedSignature = sign(encodedPayload);
  if (!safeCompare(signature, expectedSignature)) {
    return { valid: false, reason: 'invalid-token-signature' };
  }

  let claims: SignatureLinkClaims;
  try {
    claims = JSON.parse(fromBase64Url(encodedPayload)) as SignatureLinkClaims;
  } catch {
    return { valid: false, reason: 'invalid-token-payload' };
  }

  if (claims.participantId !== expected.participantId || claims.organizationId !== expected.organizationId) {
    return { valid: false, reason: 'token-scope-mismatch' };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp < nowSeconds) {
    return { valid: false, reason: 'token-expired' };
  }

  return {
    valid: true,
    expiresAt: new Date(claims.exp * 1000),
  };
}
