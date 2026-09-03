"use client";

import { FormEvent, useEffect, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

type Job = {
  id: string;
  personId: string;
  operation: string;
  status: string;
  requestedEmail: string | null;
  requestedUsername: string | null;
  lastError: string | null;
  createdAt: string;
};

type PersonOption = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
};

type PeopleResponse = {
  data: PersonOption[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function M365Page() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const [jobsResp, peopleResp] = await Promise.all([
        fetch(`${apiBaseUrl}/m365/jobs`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/people?page=1&pageSize=100`, { credentials: 'include' }),
      ]);

      if (!jobsResp.ok) {
        setError(await readApiError(jobsResp, 'Unable to load jobs.'));
        return;
      }

      setJobs((await jobsResp.json()) as Job[]);

      if (peopleResp.ok) {
        const payload = (await peopleResp.json()) as PeopleResponse;
        setPeople(payload.data);
      }
    } catch {
      setError('Unable to load jobs.');
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
      const response = await fetch(`${apiBaseUrl}/m365/jobs`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId: selectedPersonId || String(form.get('personIdManual') ?? ''),
          operation: String(form.get('operation') ?? ''),
          requestedUsername: String(form.get('requestedUsername') ?? '').trim() || undefined,
          requestedEmail: String(form.get('requestedEmail') ?? '').trim() || undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create provisioning job.'));
        return;
      }

      event.currentTarget.reset();
      await load();
    } catch {
      setError('Unable to create provisioning job.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Microsoft 365 Provisioning</h1>
        <p className="mt-2 text-sm text-slate-600">Queue provisioning, deprovisioning, and reconciliation jobs.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">New Job</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreate}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:col-span-2">
            <span>Person</span>
            {people.length > 0 ? (
              <select
                value={selectedPersonId}
                onChange={(event) => setSelectedPersonId(event.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
                <option value="">Select person</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.legalFirstName} {person.legalLastName}
                  </option>
                ))}
              </select>
            ) : (
              <input name="personIdManual" required placeholder="Person UUID" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            )}
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Operation</span>
            <select name="operation" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
            <option value="PROVISION">PROVISION</option>
            <option value="DEPROVISION">DEPROVISION</option>
            <option value="RECONCILE">RECONCILE</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Requested Username</span>
            <input name="requestedUsername" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Requested Email</span>
            <input name="requestedEmail" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <button
            className="md:col-span-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={people.length > 0 && !selectedPersonId}
          >
            Queue Job
          </button>
        </form>
        {people.length > 0 && !selectedPersonId ? (
          <p className="mt-2 text-xs text-slate-600">Select a person before queuing a job.</p>
        ) : null}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Jobs</h2>
        {jobs.length === 0 ? <p className="mt-4 text-sm text-slate-600">No jobs yet.</p> : (
          <ul className="mt-3 divide-y divide-slate-200">
            {jobs.map((job) => (
              <li key={job.id} className="py-3 text-sm">
                <p className="font-medium text-slate-900">{job.operation} · {job.status}</p>
                <p className="text-slate-600">person: {job.personId}</p>
                {job.lastError ? <p className="text-rose-700">{job.lastError}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
