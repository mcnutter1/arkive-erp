"use client";

import { FormEvent, useState } from 'react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function SetupSecurityPage() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(null);

    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('currentPassword') ?? '');
    const newPassword = String(form.get('newPassword') ?? '');
    const confirmPassword = String(form.get('confirmPassword') ?? '');

    if (newPassword.length < 12) {
      setError('New password must be at least 12 characters.');
      setSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation must match.');
      setSaving(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/auth/local-admin/password`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!response.ok) {
        setError('Unable to update password. Verify current password and try again.');
        return;
      }

      setSuccess('Password updated. Redirecting to app...');
      window.setTimeout(() => {
        window.location.href = '/app';
      }, 900);
    } catch {
      setError('Unable to update password right now.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.18em] text-amber-700">Security Required</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Rotate Default Admin Password</h1>
      <p className="mt-2 text-sm text-slate-600">
        Default bootstrap credentials are active. Change the local admin password before continuing.
      </p>

      <form className="mt-5 space-y-3" onSubmit={onSubmit}>
        <input
          name="currentPassword"
          type="password"
          required
          placeholder="Current password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="newPassword"
          type="password"
          required
          placeholder="New password (min 12 chars)"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <input
          name="confirmPassword"
          type="password"
          required
          placeholder="Confirm new password"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Update Password'}
        </button>
      </form>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}
      {success ? <p className="mt-3 text-sm text-emerald-700">{success}</p> : null}
    </section>
  );
}
