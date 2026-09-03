"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

type Person = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  primaryEmail: string | null;
};

type PeopleResponse = {
  data: Person[];
  page: number;
  pageSize: number;
  total: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

const engagementKinds = ['EMPLOYEE', 'CONTRACTOR', 'ADVISOR', 'DIRECTOR', 'INTERN', 'CONSULTANT', 'OTHER'];
const engagementStatuses = ['DRAFT', 'PREBOARDING', 'ACTIVE', 'PAUSED', 'OFFBOARDING', 'TERMINATED', 'ALUMNI'];

function toDayStartIso(dateInput: string): string | undefined {
  const trimmed = dateInput.trim();
  if (!trimmed) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return undefined;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as
      | {
          message?: string | string[];
          error?:
            | string
            | {
                message?: string;
                details?: unknown;
              };
        }
      | undefined;

    if (!payload) {
      return fallback;
    }

    if (Array.isArray(payload.message) && payload.message.length > 0) {
      return payload.message.join(', ');
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.error === 'string' && payload.error.trim()) {
      return payload.error;
    }

    if (payload.error && typeof payload.error === 'object') {
      const details = payload.error.details as
        | string
        | { message?: string | string[] }
        | undefined;
      if (typeof details === 'string' && details.trim()) {
        return details;
      }
      if (details && typeof details === 'object') {
        if (Array.isArray(details.message) && details.message.length > 0) {
          return details.message.join(', ');
        }
        if (typeof details.message === 'string' && details.message.trim()) {
          return details.message;
        }
      }

      const nestedMessage = payload.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        if (nestedMessage === 'Request failed' || nestedMessage === 'Internal server error') {
          return fallback;
        }
        return nestedMessage;
      }
    }
  } catch {
    // Ignore parse errors and fall back to generic text.
  }

  return fallback;
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingPerson, setSavingPerson] = useState(false);
  const [savingEngagement, setSavingEngagement] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (query.trim()) {
      params.set('search', query.trim());
    }
    return params.toString();
  }, [query]);

  async function loadPeople() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people?${queryString}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load people.'));
        return;
      }

      const payload = (await response.json()) as PeopleResponse;
      setPeople(payload.data);
    } catch {
      setError('Unable to load people.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPeople();
  }, [queryString]);

  async function onCreatePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPerson(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const legalFirstName = String(form.get('legalFirstName') ?? '').trim();
    const legalLastName = String(form.get('legalLastName') ?? '').trim();
    const preferredName = String(form.get('preferredName') ?? '').trim();
    const primaryEmail = String(form.get('primaryEmail') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/people`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          legalFirstName,
          legalLastName,
          preferredName: preferredName || undefined,
          primaryEmail: primaryEmail || undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create person.'));
        return;
      }

      event.currentTarget.reset();
      await loadPeople();
      setNotice('Person created successfully.');
    } catch {
      setError('Unable to create person.');
    } finally {
      setSavingPerson(false);
    }
  }

  async function onCreateEngagement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingEngagement(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const personId = String(form.get('personId') ?? '').trim();
    const kind = String(form.get('kind') ?? '').trim();
    const status = String(form.get('status') ?? '').trim();
    const department = String(form.get('department') ?? '').trim();
    const title = String(form.get('title') ?? '').trim();
    const startDate = String(form.get('startDate') ?? '').trim();
    const endDate = String(form.get('endDate') ?? '').trim();
    const startDateIso = toDayStartIso(startDate);
    const endDateIso = toDayStartIso(endDate);

    if (startDate && !startDateIso) {
      setError('Start date is invalid. Use YYYY-MM-DD.');
      setSavingEngagement(false);
      return;
    }

    if (endDate && !endDateIso) {
      setError('End date is invalid. Use YYYY-MM-DD.');
      setSavingEngagement(false);
      return;
    }

    if (startDateIso && endDateIso && new Date(endDateIso).getTime() < new Date(startDateIso).getTime()) {
      setError('End date cannot be earlier than start date.');
      setSavingEngagement(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/people/engagements`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personId,
          kind,
          status,
          department: department || undefined,
          title: title || undefined,
          startDate: startDateIso,
          endDate: endDateIso,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create engagement.'));
        return;
      }

      event.currentTarget.reset();
      setNotice('Engagement created successfully.');
    } catch {
      setError('Unable to create engagement.');
    } finally {
      setSavingEngagement(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">People</h1>
        <p className="mt-2 text-sm text-slate-600">Create and view people records.</p>
      </header>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create Person</h2>
          <p className="mt-1 text-sm text-slate-600">Add a person profile before assigning an engagement.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreatePerson}>
            <input
              name="legalFirstName"
              required
              placeholder="Legal first name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="legalLastName"
              required
              placeholder="Legal last name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="preferredName"
              placeholder="Preferred name (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="primaryEmail"
              type="email"
              placeholder="email@company.com"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={savingPerson}
              className="md:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPerson ? 'Saving...' : 'Create Person'}
            </button>
          </form>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create Engagement</h2>
          <p className="mt-1 text-sm text-slate-600">
            Select an existing person and define their working relationship.
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreateEngagement}>
            <select
              name="personId"
              required
              defaultValue=""
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="" disabled>
                Select person
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.legalFirstName} {person.legalLastName}
                </option>
              ))}
            </select>

            <select name="kind" required defaultValue="EMPLOYEE" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {engagementKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>

            <select name="status" defaultValue="ACTIVE" className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {engagementStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>

            <input name="department" placeholder="Department" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="title" placeholder="Title" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="startDate" type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="endDate" type="date" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />

            <button
              type="submit"
              disabled={savingEngagement || people.length === 0}
              className="md:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingEngagement ? 'Saving...' : 'Create Engagement'}
            </button>
          </form>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search people"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
        {notice ? <p className="mt-3 text-sm text-emerald-700">{notice}</p> : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : people.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No people found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {people.map((person) => (
              <li key={person.id} className="py-3">
                <p className="font-medium text-slate-900">
                  {person.legalFirstName} {person.legalLastName}
                </p>
                <p className="text-sm text-slate-600">{person.primaryEmail ?? 'No primary email'}</p>
              </li>
            ))}
          </ul>
        )}
      </article>
    </section>
  );
}
