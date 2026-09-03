import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

import { AppNav } from './app-nav';

const serverApiBaseUrl =
  process.env.INTERNAL_API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'http://api:4000/api/v1';

type SessionResponse = {
  user: {
    id: string;
    email: string;
    organizationId: string;
    permissions: string[];
    isLocalAdmin?: boolean;
  };
  sessionId?: string;
};

async function getSession(): Promise<SessionResponse | null> {
  const cookieHeader = headers().get('cookie') ?? '';

  const response = await fetch(`${serverApiBaseUrl}/auth/session`, {
    headers: {
      cookie: cookieHeader,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    return null;
  }

  return (await response.json()) as SessionResponse;
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session) {
    redirect('/');
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <AppNav userEmail={session.user.email} />
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</div>
    </main>
  );
}
