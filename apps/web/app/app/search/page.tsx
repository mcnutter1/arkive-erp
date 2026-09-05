"use client";

import { FormEvent, useState } from 'react';

import { Modal } from '../_components/modal';
import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [targetType, setTargetType] = useState('document');
  const [targetId, setTargetId] = useState('');
  const [globalResult, setGlobalResult] = useState<Record<string, unknown> | null>(null);
  const [timelineResult, setTimelineResult] = useState<Record<string, unknown>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);

  async function onGlobalSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/search/global?q=${encodeURIComponent(query)}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to run global search.'));
        return;
      }
      setGlobalResult((await response.json()) as Record<string, unknown>);
      setGlobalModalOpen(false);
    } catch {
      setError('Unable to run global search.');
    }
  }

  async function onTimeline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/search/timeline/${targetType}/${targetId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load timeline.'));
        return;
      }
      setTimelineResult((await response.json()) as Record<string, unknown>[]);
      setTimelineModalOpen(false);
    } catch {
      setError('Unable to load timeline.');
    }
  }

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Discovery"
        title="Search and Timeline"
        description="Run global lookups and timeline traces with cleaner focused inputs."
        actions={
          <>
            <button
              type="button"
              onClick={() => setGlobalModalOpen(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              Global Search
            </button>
            <button
              type="button"
              onClick={() => setTimelineModalOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Timeline Lookup
            </button>
          </>
        }
      />

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Global Search Results</h2>
        <p className="mt-1 text-sm text-slate-600">Use the Global Search action to run a query.</p>
        {globalResult ? (
          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(globalResult, null, 2)}</pre>
        ) : null}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Activity Timeline</h2>
        <p className="mt-1 text-sm text-slate-600">Use Timeline Lookup to query chronological activity.</p>
        {timelineResult ? (
          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(timelineResult, null, 2)}</pre>
        ) : null}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <Modal
        open={globalModalOpen}
        title="Global Search"
        description="Search by name, email, document title, or task."
        onClose={() => setGlobalModalOpen(false)}
      >
        <form className="flex gap-2" onSubmit={onGlobalSearch}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search query" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Search</button>
        </form>
      </Modal>

      <Modal
        open={timelineModalOpen}
        title="Timeline Lookup"
        description="Provide target type and record ID."
        onClose={() => setTimelineModalOpen(false)}
      >
        <form className="grid gap-3" onSubmit={onTimeline}>
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="document">document</option>
            <option value="person">person</option>
            <option value="engagement">engagement</option>
            <option value="task">task</option>
            <option value="grant">grant</option>
            <option value="approval">approval</option>
          </select>
          <input value={targetId} onChange={(e) => setTargetId(e.target.value)} required placeholder="Target record ID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Load Timeline</button>
            <button
              type="button"
              onClick={() => setTimelineModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
