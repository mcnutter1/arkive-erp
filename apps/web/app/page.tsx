"use client";

import { FormEvent, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
const loginUrl = `${apiBaseUrl}/auth/login?returnTo=${encodeURIComponent('/app')}`;

export default function HomePage() {
  const [localError, setLocalError] = useState<string | null>(null);
  const [submittingLocal, setSubmittingLocal] = useState(false);

  async function handleLocalLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    setSubmittingLocal(true);

    const form = new FormData(event.currentTarget);
    const username = String(form.get('username') ?? '');
    const password = String(form.get('password') ?? '');

    try {
      const resp = await fetch(`${apiBaseUrl}/auth/local-login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password, returnTo: '/app' }),
      });

      if (!resp.ok) {
        setLocalError('Local login failed. Verify username/password.');
        return;
      }

      const data = (await resp.json()) as { redirectTo?: string; mustRotatePassword?: boolean };
      if (data.mustRotatePassword) {
        window.location.href = '/app/setup-security';
        return;
      }
      window.location.href = data.redirectTo ?? '/app';
    } catch {
      setLocalError('Unable to reach authentication service.');
    } finally {
      setSubmittingLocal(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6 text-slate-900 md:p-10">
      <section className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center rounded-3xl border border-slate-200 bg-white shadow-xl md:grid-cols-2 md:overflow-hidden">
        <div className="h-full bg-gradient-to-b from-slate-900 via-slate-800 to-slate-700 p-8 text-slate-100 md:p-10">
          <p className="text-xs uppercase tracking-[0.25em] text-slate-300">Arkive Internal</p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">Operations Platform</h1>
          <p className="mt-4 max-w-md text-sm text-slate-200 md:text-base">
            Secure workspace for identity, people operations, equity workflows, fundraising, and
            governance.
          </p>
        </div>

        <div className="p-8 md:p-10">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-2 text-sm text-slate-600">
            Continue with Microsoft Entra to access your organization workspace.
          </p>

          <a
            href={loginUrl}
            className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            Sign in with Microsoft
          </a>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Local Admin</span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form className="space-y-3" onSubmit={handleLocalLogin}>
            <input
              name="username"
              type="text"
              defaultValue="admin"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
            />
            <input
              name="password"
              type="password"
              defaultValue="admin"
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-slate-300 focus:ring-2"
            />
            <button
              type="submit"
              disabled={submittingLocal}
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submittingLocal ? 'Signing in...' : 'Sign in locally (admin/admin)'}
            </button>
          </form>

          {localError ? <p className="mt-3 text-sm text-rose-700">{localError}</p> : null}
        </div>
      </section>
    </main>
  );
}
