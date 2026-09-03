"use client";

import { FormEvent, useEffect, useState } from 'react';

type EquityTxn = {
  id: string;
  type: string;
  effectiveAt: string;
  quantity: string;
  unitPrice: string | null;
  fromPersonId: string | null;
  toPersonId: string | null;
  ledgerSequence: string;
  reason: string | null;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function EquityPage() {
  const [txns, setTxns] = useState<EquityTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLedger() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/equity/ledger`, { credentials: 'include' });
      if (!response.ok) {
        setError('Unable to load equity ledger.');
        return;
      }
      setTxns((await response.json()) as EquityTxn[]);
    } catch {
      setError('Unable to load equity ledger.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadLedger();
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload = {
      type: String(form.get('type') ?? ''),
      effectiveAt: new Date(String(form.get('effectiveAt') ?? '')).toISOString(),
      quantity: String(form.get('quantity') ?? ''),
      unitPrice: String(form.get('unitPrice') ?? '').trim() || undefined,
      fromPersonId: String(form.get('fromPersonId') ?? '').trim() || undefined,
      toPersonId: String(form.get('toPersonId') ?? '').trim() || undefined,
      reason: String(form.get('reason') ?? '').trim() || undefined,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/equity/ledger`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const msg = await response.text();
        setError(`Unable to create transaction. ${msg}`);
        return;
      }

      event.currentTarget.reset();
      await loadLedger();
    } catch {
      setError('Unable to create transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Equity Ledger</h1>
        <p className="mt-2 text-sm text-slate-600">Record transactions and review ledger sequence.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">New Transaction</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={onCreate}>
          <select name="type" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
            {['ISSUE', 'GRANT', 'VEST', 'EXERCISE', 'CANCEL', 'TRANSFER', 'CONVERT', 'SPLIT', 'REVERSE', 'CORRECT'].map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <input name="effectiveAt" type="datetime-local" required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="quantity" required placeholder="Quantity" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="unitPrice" placeholder="Unit price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="fromPersonId" placeholder="From person UUID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="toPersonId" placeholder="To person UUID" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input name="reason" placeholder="Reason" className="md:col-span-2 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <button type="submit" disabled={saving} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {saving ? 'Saving...' : 'Record Transaction'}
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Ledger</h2>
        {loading ? <p className="mt-4 text-sm text-slate-600">Loading...</p> : (
          <ul className="mt-3 divide-y divide-slate-200">
            {txns.map((txn) => (
              <li key={txn.id} className="py-3 text-sm">
                <p className="font-medium text-slate-900">#{txn.ledgerSequence} {txn.type} {txn.quantity}</p>
                <p className="text-slate-600">{new Date(txn.effectiveAt).toLocaleString()} · {txn.reason ?? 'No reason'}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
