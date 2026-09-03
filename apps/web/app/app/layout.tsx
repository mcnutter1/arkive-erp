import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';

import { LogoutButton } from './logout-button';

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
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Arkive ERP</p>
            <p className="text-sm text-slate-700">{session.user.email}</p>
          </div>
          <nav className="flex items-center gap-3 text-sm">
            <Link href="/app" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Dashboard
            </Link>
            <Link href="/app/people" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              People
            </Link>
            <Link href="/app/tasks" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Tasks
            </Link>
            <Link href="/app/equity" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Equity
            </Link>
            <Link href="/app/documents" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Documents
            </Link>
            <Link href="/app/approvals" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Approvals
            </Link>
            <Link href="/app/m365" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              M365
            </Link>
            <Link href="/app/portal" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Portal
            </Link>
            <Link href="/app/search" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Search
            </Link>
            <Link href="/app/admin-settings" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Admin
            </Link>
            <Link href="/app/fundraising" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Fundraising
            </Link>
            <Link href="/app/valuations-reports" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Valuations & Reports
            </Link>
            <Link href="/app/setup-security" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Security
            </Link>
            <Link href="/docs" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              API Docs
            </Link>
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</div>
    </main>
  );
}
