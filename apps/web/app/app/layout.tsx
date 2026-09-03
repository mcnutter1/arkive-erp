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

type NavItem = {
  href: string;
  label: string;
};

function NavGroup({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <details className="group relative">
      <summary className="list-none cursor-pointer rounded-md px-3 py-1.5 text-sm hover:bg-slate-100">
        {label}
      </summary>
      <div className="mt-2 min-w-52 rounded-md border border-slate-200 bg-white p-1 shadow-sm md:absolute md:left-0 md:z-20 md:mt-1">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="block rounded-md px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

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
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link href="/app" className="rounded-md px-3 py-1.5 hover:bg-slate-100">
              Dashboard
            </Link>
            <NavGroup
              label="People Ops"
              items={[
                { href: '/app/people', label: 'People' },
                { href: '/app/tasks', label: 'Tasks' },
                { href: '/app/approvals', label: 'Approvals' },
                { href: '/app/portal', label: 'Portal' },
              ]}
            />
            <NavGroup
              label="Equity & Finance"
              items={[
                { href: '/app/equity', label: 'Equity' },
                { href: '/app/fundraising', label: 'Fundraising' },
                { href: '/app/valuations-reports', label: 'Valuations & Reports' },
              ]}
            />
            <NavGroup
              label="Documents & Search"
              items={[
                { href: '/app/documents', label: 'Documents' },
                { href: '/app/search', label: 'Search' },
                { href: '/app/m365', label: 'M365' },
              ]}
            />
            <NavGroup
              label="Admin"
              items={[
                { href: '/app/admin-settings', label: 'Admin Settings' },
                { href: '/app/setup-security', label: 'Security' },
                { href: '/docs', label: 'API Docs' },
              ]}
            />
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</div>
    </main>
  );
}
