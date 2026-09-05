"use client";

import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../_components/modal';
import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

type Valuation = {
  id: string;
  valuationType: string;
  effectiveDate: string;
  commonFmv: string | null;
  enterpriseValue: string | null;
};

type CapTableRow = {
  personId: string;
  personName: string;
  shareType: string;
  sharesOwned: string;
  ownershipPercent: string;
  estimatedValue: string;
};

type CapTableResponse = {
  generatedAt: string;
  valuation: {
    enterpriseValue: string;
    perShareValue: string;
    denominatorShares: string;
  };
  ownershipTable: CapTableRow[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

function normalizeNumericInput(value: string): string {
  return value.trim().replaceAll(',', '');
}

function toDayStartIso(dateInput: string): string | undefined {
  const normalized = dateInput.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }

  const parsed = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

export default function ValuationsReportsPage() {
  const [valuations, setValuations] = useState<Valuation[]>([]);
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError(null);

    try {
      const [valuationsResp, capResp] = await Promise.all([
        fetch(`${apiBaseUrl}/valuations`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/cap-table`, { credentials: 'include' }),
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
    const effectiveDateInput = String(form.get('effectiveDate') ?? '').trim();
    const effectiveDate = toDayStartIso(effectiveDateInput);
    const commonFmv = normalizeNumericInput(String(form.get('commonFmv') ?? ''));
    const enterpriseValue = normalizeNumericInput(String(form.get('enterpriseValue') ?? ''));

    if (!valuationType) {
      setError('Valuation type is required.');
      return;
    }

    if (!effectiveDate) {
      setError('Effective date must be a valid date.');
      return;
    }

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
      setCreateOpen(false);
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
      <PageHero
        eyebrow="Finance"
        title="Valuations and Reports"
        description="Capture valuation events and export board and audit reporting assets."
        actions={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              New Valuation
            </button>
            <button
              type="button"
              onClick={() => void loadAll()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Refresh
            </button>
          </>
        }
      />

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
        {!capTable || capTable.ownershipTable.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No cap table holdings yet.</p>
        ) : (
          <>
            <p className="mt-2 text-xs text-slate-500">
              EV per share ${Number(capTable.valuation.perShareValue).toFixed(6)} using {Number(capTable.valuation.denominatorShares).toLocaleString()} shares.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">Holder</th>
                    <th className="pb-2 pr-4">Type</th>
                    <th className="pb-2 pr-4">Shares</th>
                    <th className="pb-2 pr-4">Ownership %</th>
                    <th className="pb-2 pr-4">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {capTable.ownershipTable.map((row) => (
                    <tr key={`${row.personId}-${row.shareType}`} className="border-t border-slate-200">
                      <td className="py-2 pr-4 font-medium text-slate-900">{row.personName}</td>
                      <td className="py-2 pr-4 text-slate-700">{row.shareType}</td>
                      <td className="py-2 pr-4 text-slate-700">{Number(row.sharesOwned).toLocaleString()}</td>
                      <td className="py-2 pr-4 text-slate-700">{Number(row.ownershipPercent).toFixed(2)}%</td>
                      <td className="py-2 pr-4 text-slate-700">${Number(row.estimatedValue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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

      <Modal
        open={createOpen}
        title="Create Valuation"
        description="Record valuation details for pricing and compliance workflows."
        onClose={() => setCreateOpen(false)}
      >
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onCreateValuation}>
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
          <div className="md:col-span-2 flex gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              Save Valuation
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
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
