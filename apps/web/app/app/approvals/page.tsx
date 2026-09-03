"use client";

import { FormEvent, useEffect, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

type Decision = {
  id: string;
  decision: string;
  comment: string | null;
  approverPersonId: string | null;
  decidedAt: string;
};

type Approval = {
  id: string;
  requestType: string;
  title: string;
  status: string;
  requiredCount: number;
  createdAt: string;
  decisions: Decision[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function ApprovalsPage() {
  const [items, setItems] = useState<Approval[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/approvals/requests`, { credentials: 'include' });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load approvals.'));
        return;
      }
      setItems((await response.json()) as Approval[]);
    } catch {
      setError('Unable to load approvals.');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch(`${apiBaseUrl}/approvals/requests`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: String(form.get('requestType') ?? ''),
          title: String(form.get('title') ?? ''),
          requiredCount: Number(form.get('requiredCount') ?? 1),
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create approval request.'));
        return;
      }

      event.currentTarget.reset();
      await load();
    } catch {
      setError('Unable to create approval request.');
    }
  }

  async function decide(approvalId: string, decision: 'APPROVED' | 'REJECTED') {
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/approvals/requests/${approvalId}/decide`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to submit decision.'));
        return;
      }

      await load();
    } catch {
      setError('Unable to submit decision.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Approvals</h1>
        <p className="mt-2 text-sm text-slate-600">Create approval requests and submit decisions.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">New Request</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Request Type</span>
            <input name="requestType" required placeholder="PROCUREMENT" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Title</span>
            <input name="title" required placeholder="Approve equipment budget" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Required Approvals</span>
            <input name="requiredCount" type="number" min="1" defaultValue="1" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800" type="submit">Create</button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Requests</h2>
        {items.length === 0 ? <p className="mt-4 text-sm text-slate-600">No approval requests yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-200">
            {items.map((item) => (
              <li key={item.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs">{item.status}</span>
                </div>
                <p className="mt-1 text-slate-600">{item.requestType} · required approvals: {item.requiredCount}</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void decide(item.id, 'APPROVED')} className="rounded-md border border-emerald-300 px-2 py-1 text-xs hover:bg-emerald-50">Approve</button>
                  <button type="button" onClick={() => void decide(item.id, 'REJECTED')} className="rounded-md border border-rose-300 px-2 py-1 text-xs hover:bg-rose-50">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
