"use client";

import { useEffect, useState } from 'react';

import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function PortalPage() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadSummary() {
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

  useEffect(() => {
    void loadSummary();
  }, []);

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Self Service"
        title="My Portal"
        description="Personal summary for tasks, signatures, and grants in one clean view."
        actions={
          <button
            type="button"
            onClick={() => void loadSummary()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Refresh
          </button>
        }
      />

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
