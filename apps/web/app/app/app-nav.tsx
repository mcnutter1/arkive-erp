"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { LogoutButton } from './logout-button';

type NavItem = {
  href: string;
  label: string;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

type AppNavProps = {
  userEmail: string;
};

const navGroups: NavGroup[] = [
  {
    id: 'people',
    label: 'People Ops',
    items: [
      { href: '/app/people', label: 'People' },
      { href: '/app/tasks', label: 'Tasks' },
      { href: '/app/approvals', label: 'Approvals' },
      { href: '/app/portal', label: 'Portal' },
    ],
  },
  {
    id: 'equity',
    label: 'Equity and Finance',
    items: [
      { href: '/app/equity', label: 'Equity' },
      { href: '/app/fundraising', label: 'Fundraising' },
      { href: '/app/valuations-reports', label: 'Valuations and Reports' },
    ],
  },
  {
    id: 'docs',
    label: 'Documents and Search',
    items: [
      { href: '/app/documents', label: 'Documents' },
      { href: '/app/search', label: 'Search' },
      { href: '/app/m365', label: 'M365' },
    ],
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      { href: '/app/admin-settings', label: 'Admin Settings' },
      { href: '/app/setup-security', label: 'Security' },
      { href: '/docs', label: 'API Docs' },
    ],
  },
];

export function AppNav({ userEmail }: AppNavProps) {
  const pathname = usePathname();
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOpenGroupId(null);
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!navRef.current) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!navRef.current.contains(target)) {
        setOpenGroupId(null);
      }
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpenGroupId(null);
        setMobileOpen(false);
      }
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, []);

  const quickLinks = useMemo(
    () => [
      { href: '/app', label: 'Dashboard' },
      { href: '/app/equity', label: 'Equity' },
      { href: '/app/people', label: 'People' },
    ],
    [],
  );

  return (
    <header className="border-b border-slate-200 bg-gradient-to-r from-amber-50 via-white to-cyan-50">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Arkive ERP</p>
            <p className="truncate text-sm text-slate-700">{userEmail}</p>
          </div>

          <div className="flex items-center gap-2 md:hidden">
            <LogoutButton />
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm"
              aria-expanded={mobileOpen}
              aria-controls="mobile-app-nav"
            >
              Menu
            </button>
          </div>
        </div>

        <nav ref={navRef} className="mt-3 hidden items-center justify-between gap-3 md:flex">
          <div className="flex items-center gap-2">
            {quickLinks.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-3 py-1.5 text-sm transition ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-white hover:shadow-sm'}`}
                >
                  {item.label}
                </Link>
              );
            })}

            {navGroups.map((group) => {
              const isOpen = openGroupId === group.id;
              return (
                <div key={group.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenGroupId((prev) => (prev === group.id ? null : group.id))}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${isOpen ? 'bg-white shadow-sm' : 'text-slate-700 hover:bg-white hover:shadow-sm'}`}
                    aria-expanded={isOpen}
                  >
                    {group.label}
                  </button>

                  {isOpen ? (
                    <div className="absolute left-0 top-10 z-30 min-w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
                      {group.items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setOpenGroupId(null)}
                            className={`block rounded-lg px-3 py-2 text-sm ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                          >
                            {item.label}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          <LogoutButton />
        </nav>

        {mobileOpen ? (
          <nav id="mobile-app-nav" className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:hidden">
            <div className="grid grid-cols-3 gap-2">
              {quickLinks.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`rounded-lg px-2 py-2 text-center text-xs ${active ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700'}`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>

            {navGroups.map((group) => (
              <div key={group.id}>
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{group.label}</p>
                <div className="mt-1 grid gap-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`rounded-md px-3 py-2 text-sm ${active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                      >
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        ) : null}
      </div>
    </header>
  );
}
