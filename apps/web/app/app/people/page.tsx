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

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        setError('Unable to load people.');
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
    setSaving(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const legalFirstName = String(form.get('legalFirstName') ?? '').trim();
    const legalLastName = String(form.get('legalLastName') ?? '').trim();
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
          primaryEmail: primaryEmail || undefined,
        }),
      });

      if (!response.ok) {
        setError('Unable to create person.');
        return;
      }

      event.currentTarget.reset();
      await loadPeople();
    } catch {
      setError('Unable to create person.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">People</h1>
        <p className="mt-2 text-sm text-slate-600">Create and view people records.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Person</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={onCreatePerson}>
          <input
            name="legalFirstName"
            required
            placeholder="First name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="legalLastName"
            required
            placeholder="Last name"
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
            disabled={saving}
            className="md:col-span-3 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create Person'}
          </button>
        </form>
      </article>

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
