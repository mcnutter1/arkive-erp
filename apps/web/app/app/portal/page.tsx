"use client";

import { useEffect, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function PortalPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function run() {
      setError(null);
      try {
        const response = await fetch(`${apiBaseUrl}/portal/me`, { credentials: 'include' });
        if (!response.ok) {
          setError(await readApiError(response, 'Unable to load portal summary.'));
          return;
        }
        setData((await response.json()) as Record<string, unknown>);
      } catch {
        setError('Unable to load portal summary.');
      }
    }

    void run();
  }, []);

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">My Portal</h1>
        <p className="mt-2 text-sm text-slate-600">Self-service summary for person, tasks, signatures, and grants.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
        {!error && !data ? <p className="text-sm text-slate-600">Loading...</p> : null}
        {data ? (
          <pre className="overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
            {JSON.stringify(data, null, 2)}
          </pre>
        ) : null}
      </article>
    </section>
  );
}
