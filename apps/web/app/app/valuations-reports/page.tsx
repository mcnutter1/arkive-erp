"use client";

import { FormEvent, useEffect, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

type Valuation = {
  id: string;
  valuationType: string;
  effectiveDate: string;
  commonFmv: string | null;
  enterpriseValue: string | null;
};

type CapTableHolding = {
  personId: string;
  personName: string;
  netQuantity: string;
};

type CapTableResponse = {
  generatedAt: string;
  holdings: CapTableHolding[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function ValuationsReportsPage() {
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [valuationsResp, capResp] = await Promise.all([
        fetch(`${apiBaseUrl}/valuations`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/reports/cap-table-summary`, { credentials: 'include' }),
      ]);

      if (!valuationsResp.ok || !capResp.ok) {
        const failure = !valuationsResp.ok
          ? await readApiError(valuationsResp, 'Unable to load valuation/report data.')
          : await readApiError(capResp, 'Unable to load valuation/report data.');
        setError(failure);
        return;
      }

      setValuations((await valuationsResp.json()) as Valuation[]);
      setCapTable((await capResp.json()) as CapTableResponse);
    } catch {
      setError('Unable to load valuation/report data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAll();
  }, []);

  async function onCreateValuation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const valuationType = String(form.get('valuationType') ?? '').trim();
    const effectiveDate = String(form.get('effectiveDate') ?? '').trim();
    const commonFmv = String(form.get('commonFmv') ?? '').trim();
    const enterpriseValue = String(form.get('enterpriseValue') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/valuations`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          valuationType,
          effectiveDate,
          commonFmv: commonFmv || undefined,
          enterpriseValue: enterpriseValue || undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create valuation.'));
        return;
      }

      event.currentTarget.reset();
      await loadAll();
    } catch {
      setError('Unable to create valuation.');
    }
  }

  function downloadCsv(path: string) {
    window.open(`${apiBaseUrl}${path}`, '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Valuations & Reports</h1>
        <p className="mt-2 text-sm text-slate-600">Capture valuations and export audit-facing report outputs.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Valuation</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreateValuation}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Valuation Type</span>
            <input
              name="valuationType"
              required
              placeholder="409A"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Effective Date</span>
            <input
              name="effectiveDate"
              required
              type="date"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Common FMV</span>
            <input
              name="commonFmv"
              placeholder="Optional"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Enterprise Value</span>
            <input
              name="enterpriseValue"
              placeholder="Optional"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <button type="submit" className="md:col-span-4 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Save Valuation
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Valuation History</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : valuations.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No valuations yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {valuations.map((valuation) => (
              <li key={valuation.id} className="py-3 text-sm">
                <p className="font-medium text-slate-900">{valuation.valuationType}</p>
                <p className="text-slate-600">Effective: {new Date(valuation.effectiveDate).toLocaleDateString()}</p>
                <p className="text-slate-600">
                  Common FMV: {valuation.commonFmv ?? '-'} · Enterprise Value: {valuation.enterpriseValue ?? '-'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cap Table Summary</h2>
        {!capTable || capTable.holdings.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No cap table holdings yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {capTable.holdings.map((holding) => (
              <li key={holding.personId} className="py-2 text-sm">
                <span className="font-medium text-slate-900">{holding.personName}</span>
                <span className="text-slate-600"> · {holding.netQuantity}</span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">CSV Exports</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => downloadCsv('/reports/people-roster.csv')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Download People Roster CSV
          </button>
          <button
            type="button"
            onClick={() => downloadCsv('/reports/equity-ledger.csv')}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            Download Equity Ledger CSV
          </button>
        </div>
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
