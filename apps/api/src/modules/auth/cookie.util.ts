export const SESSION_COOKIE_NAME = 'arkive_session';

export function parseCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  const pairs = cookieHeader.split(';').map((part) => part.trim());
  for (const pair of pairs) {
    const [k, ...rest] = pair.split('=');
    if (k === name) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return undefined;
}

export function makeSessionCookie(token: string, maxAgeSeconds: number): string {
  const secure = (process.env.NODE_ENV ?? 'development') === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = (process.env.NODE_ENV ?? 'development') === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
