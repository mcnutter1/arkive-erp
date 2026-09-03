"use client";

import { FormEvent, useState } from 'react';

type Setting = {
  id: string;
  section: string;
  key: string;
  value: Record<string, unknown>;
  updatedAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function AdminSettingsPage() {
  const [section, setSection] = useState('general');
  const [settings, setSettings] = useState<Setting[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function loadSettings(event?: FormEvent<HTMLFormElement>) {
    if (event) {
      event.preventDefault();
    }

    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/admin/settings/${section}`, { credentials: 'include' });
      if (!response.ok) {
        setError('Unable to load settings.');
        return;
      }
      setSettings((await response.json()) as Setting[]);
    } catch {
      setError('Unable to load settings.');
    }
  }

  async function upsertSetting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const key = String(form.get('key') ?? '').trim();
    const valueRaw = String(form.get('valueJson') ?? '').trim();

    let value: Record<string, unknown>;
    try {
      value = JSON.parse(valueRaw) as Record<string, unknown>;
    } catch {
      setError('Value must be valid JSON object.');
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/admin/settings`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, key, value }),
      });

      if (!response.ok) {
        setError('Unable to save setting.');
        return;
      }

      event.currentTarget.reset();
      await loadSettings();
    } catch {
      setError('Unable to save setting.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Admin Settings</h1>
        <p className="mt-2 text-sm text-slate-600">Load and upsert JSON settings by section.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Load Section</h2>
        <form className="mt-4 flex gap-2" onSubmit={loadSettings}>
          <input value={section} onChange={(e) => setSection(e.target.value)} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Load</button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Upsert Setting</h2>
        <form className="mt-4 space-y-3" onSubmit={upsertSetting}>
          <input name="key" required placeholder="settingKey" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <textarea name="valueJson" required placeholder='{"enabled": true}' className="min-h-28 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">Save</button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Current Settings</h2>
        {settings.length === 0 ? <p className="mt-3 text-sm text-slate-600">No settings loaded.</p> : (
          <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">{JSON.stringify(settings, null, 2)}</pre>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
