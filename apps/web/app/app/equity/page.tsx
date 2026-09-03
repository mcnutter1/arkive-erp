"use client";

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type Person = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  primaryEmail: string | null;
};

type PeopleResponse = {
  data: Person[];
};

type EquityPlan = {
  id: string;
  code: string;
  name: string;
  reservedShares: string;
  status: string;
  grantedShares?: string;
  remainingShares?: string;
};

type GrantAward = {
  id: string;
  personId: string;
  awardType: 'OPTION_ISO' | 'OPTION_NSO' | 'RSU';
  quantity: string;
  exercisePrice: string | null;
  currency: string;
  grantDate: string | null;
  expirationDate: string | null;
  status: string;
  person: Person;
  plan: { id: string; code: string; name: string } | null;
  vestingSchedule:
    | {
        startDate: string;
        cliffMonths: number;
        durationMonths: number;
        intervalMonths: number;
      }
    | null;
};

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
  grant: {
    id: string;
    awardType: string;
    personId: string;
  } | null;
};

type DashboardResponse = {
  cards: {
    outstandingOptions: string;
    outstandingRsus: string;
    exercised: string;
    forfeited: string;
  };
  timeline: Array<{
    date: string;
    type: string;
    title: string;
    subtitle: string;
  }>;
};

type CapTableResponse = {
  generatedAt: string;
  shares: {
    baseOutstandingShares: string;
    authorizedShares: string;
    outstandingOptions: string;
    outstandingRsus: string;
    equityInstrumentsOutstanding: string;
    fullyDilutedShares: string;
  };
  optionPool: {
    reservedShares: string;
    grantedShares: string;
    remainingShares: string;
  };
  holders: Array<{
    personId: string;
    personName: string;
    outstandingQuantity: string;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
const companyTreasuryValue = '__COMPANY__';

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
      const nestedMessage = payload.error.message;
      if (typeof nestedMessage === 'string' && nestedMessage.trim()) {
        return nestedMessage;
      }

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
    }
  } catch {
    // Ignore parse errors and use fallback.
  }

  return fallback;
}

function dateInputToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNumericInput(value: string): string {
  return value.trim().replaceAll(',', '');
}

function isDecimalLike(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

function toDayStartIso(dateInput: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return null;
  }
  const parsed = new Date(`${dateInput}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
}

export default function EquityPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [plans, setPlans] = useState<EquityPlan[]>([]);
  const [grants, setGrants] = useState<GrantAward[]>([]);
  const [txns, setTxns] = useState<EquityTxn[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGrant, setSavingGrant] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingCapTableBase, setSavingCapTableBase] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [grantAwardType, setGrantAwardType] = useState<'OPTION_ISO' | 'OPTION_NSO' | 'RSU'>('OPTION_NSO');

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      const [peopleResp, plansResp, grantsResp, ledgerResp, dashboardResp, capTableResp] = await Promise.all([
        fetch(`${apiBaseUrl}/people?page=1&pageSize=100`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/plans`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/grants`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/ledger`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/dashboard`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/cap-table`, { credentials: 'include' }),
      ]);

      if (!peopleResp.ok) {
        setError(await readApiError(peopleResp, 'Unable to load people.'));
        return;
      }
      if (!plansResp.ok) {
        setError(await readApiError(plansResp, 'Unable to load equity plans.'));
        return;
      }
      if (!grantsResp.ok) {
        setError(await readApiError(grantsResp, 'Unable to load grant awards.'));
        return;
      }
      if (!ledgerResp.ok) {
        setError(await readApiError(ledgerResp, 'Unable to load equity ledger.'));
        return;
      }
      if (!dashboardResp.ok) {
        setError(await readApiError(dashboardResp, 'Unable to load equity dashboard.'));
        return;
      }
      if (!capTableResp.ok) {
        setError(await readApiError(capTableResp, 'Unable to load cap table.'));
        return;
      }

      const peoplePayload = (await peopleResp.json()) as PeopleResponse;
      setPeople(peoplePayload.data);
      setPlans((await plansResp.json()) as EquityPlan[]);
      setGrants((await grantsResp.json()) as GrantAward[]);
      setTxns((await ledgerResp.json()) as EquityTxn[]);
      setDashboard((await dashboardResp.json()) as DashboardResponse);
      setCapTable((await capTableResp.json()) as CapTableResponse);
    } catch {
      setError('Unable to load equity workspace.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function onCreateGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGrant(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const awardType = String(form.get('awardType') ?? 'OPTION_NSO') as 'OPTION_ISO' | 'OPTION_NSO' | 'RSU';
    const grantDate = String(form.get('grantDate') ?? '').trim();
    const vestingStartDate = String(form.get('vestingStartDate') ?? '').trim();
    const expirationDate = String(form.get('expirationDate') ?? '').trim();
    const exercisePrice = normalizeNumericInput(String(form.get('exercisePrice') ?? ''));
    const quantity = normalizeNumericInput(String(form.get('quantity') ?? ''));
    const currency = String(form.get('currency') ?? 'USD').trim() || 'USD';

    if (!quantity || !isDecimalLike(quantity)) {
      setError('Grant quantity must be a valid positive number (e.g. 25000 or 25000.5).');
      setSavingGrant(false);
      return;
    }

    const grantDateIso = toDayStartIso(grantDate);
    if (!grantDateIso) {
      setError('Grant date is invalid. Use YYYY-MM-DD.');
      setSavingGrant(false);
      return;
    }

    const vestingStartDateIso = toDayStartIso(vestingStartDate);
    if (!vestingStartDateIso) {
      setError('Vesting start date is invalid. Use YYYY-MM-DD.');
      setSavingGrant(false);
      return;
    }

    let expirationDateIso: string | undefined;
    if (expirationDate) {
      expirationDateIso = toDayStartIso(expirationDate) ?? undefined;
      if (!expirationDateIso) {
        setError('Expiration date is invalid. Use YYYY-MM-DD.');
        setSavingGrant(false);
        return;
      }
    }

    if ((awardType === 'OPTION_ISO' || awardType === 'OPTION_NSO') && (!exercisePrice || !isDecimalLike(exercisePrice))) {
      setError('Exercise price is required for option grants and must be a valid number.');
      setSavingGrant(false);
      return;
    }

    if (awardType === 'RSU' && exercisePrice) {
      setError('Exercise price is not applicable for RSU awards.');
      setSavingGrant(false);
      return;
    }

    const cliffMonths = Number(form.get('cliffMonths') ?? 12);
    const durationMonths = Number(form.get('durationMonths') ?? 48);
    const intervalMonths = Number(form.get('intervalMonths') ?? 1);

    if (!Number.isInteger(cliffMonths) || cliffMonths < 0) {
      setError('Cliff months must be a whole number greater than or equal to 0.');
      setSavingGrant(false);
      return;
    }

    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      setError('Vesting duration months must be a whole number greater than or equal to 1.');
      setSavingGrant(false);
      return;
    }

    if (!Number.isInteger(intervalMonths) || intervalMonths < 1) {
      setError('Vesting interval months must be a whole number greater than or equal to 1.');
      setSavingGrant(false);
      return;
    }

    const payload = {
      personId: String(form.get('personId') ?? '').trim(),
      awardType,
      quantity,
      exercisePrice:
        awardType === 'OPTION_ISO' || awardType === 'OPTION_NSO' ? exercisePrice || undefined : undefined,
      planId: String(form.get('planId') ?? '').trim() || undefined,
      currency,
      grantDate: grantDateIso,
      expirationDate: expirationDateIso,
      vestingStartDate: vestingStartDateIso,
      cliffMonths,
      durationMonths,
      intervalMonths,
      notes: String(form.get('notes') ?? '').trim() || undefined,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/equity/grants`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create grant award.'));
        return;
      }

      event.currentTarget.reset();
      setGrantAwardType('OPTION_NSO');
      setNotice('Grant recorded successfully. A GRANT ledger entry was also created.');
      await loadData();
    } catch {
      setError('Unable to create grant award.');
    } finally {
      setSavingGrant(false);
    }
  }

  async function onUpdateCapTableBase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingCapTableBase(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const outstandingShares = normalizeNumericInput(String(form.get('outstandingShares') ?? ''));

    if (!outstandingShares || !isDecimalLike(outstandingShares)) {
      setError('Base outstanding shares must be a valid non-negative number.');
      setSavingCapTableBase(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/equity/cap-table/base`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outstandingShares }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to update base outstanding shares.'));
        return;
      }

      setCapTable((await response.json()) as CapTableResponse);
      setNotice('Base outstanding shares updated.');
    } catch {
      setError('Unable to update base outstanding shares.');
    } finally {
      setSavingCapTableBase(false);
    }
  }

  async function onCreateManualTxn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTxn(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const fromHolder = String(form.get('fromPersonId') ?? companyTreasuryValue);
    const toHolder = String(form.get('toPersonId') ?? companyTreasuryValue);
    const effectiveAtRaw = String(form.get('effectiveAt') ?? '').trim();

    const payload = {
      type: String(form.get('type') ?? ''),
      effectiveAt: new Date(effectiveAtRaw).toISOString(),
      quantity: normalizeNumericInput(String(form.get('quantity') ?? '')),
      unitPrice: normalizeNumericInput(String(form.get('unitPrice') ?? '').trim()) || undefined,
      fromPersonId: fromHolder === companyTreasuryValue ? undefined : fromHolder,
      toPersonId: toHolder === companyTreasuryValue ? undefined : toHolder,
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
        setError(await readApiError(response, 'Unable to create ledger transaction.'));
        return;
      }

      event.currentTarget.reset();
      setNotice('Manual ledger transaction recorded.');
      await loadData();
    } catch {
      setError('Unable to create ledger transaction.');
    } finally {
      setSavingTxn(false);
    }
  }

  async function onCreatePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPlan(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);

    const payload = {
      code: String(form.get('code') ?? '').trim(),
      name: String(form.get('name') ?? '').trim(),
      reservedShares: normalizeNumericInput(String(form.get('reservedShares') ?? '').trim()),
      effectiveDate: String(form.get('effectiveDate') ?? '').trim()
        ? new Date(`${String(form.get('effectiveDate'))}T00:00:00.000Z`).toISOString()
        : undefined,
      expiryDate: String(form.get('expiryDate') ?? '').trim()
        ? new Date(`${String(form.get('expiryDate'))}T00:00:00.000Z`).toISOString()
        : undefined,
      status: String(form.get('status') ?? 'DRAFT').trim(),
    };

    try {
      const response = await fetch(`${apiBaseUrl}/equity/plans`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create equity plan.'));
        return;
      }

      event.currentTarget.reset();
      setNotice('Equity plan created successfully.');
      await loadData();
    } catch {
      setError('Unable to create equity plan.');
    } finally {
      setSavingPlan(false);
    }
  }

  function renderHolder(personId: string | null): string {
    if (!personId) {
      return 'Company Treasury';
    }

    const person = peopleById.get(personId);
    if (!person) {
      return personId;
    }

    return `${person.legalFirstName} ${person.legalLastName}`;
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Equity Grants and Ledger</h1>
        <p className="mt-2 text-sm text-slate-600">
          Issue grants from company treasury, define vesting, and maintain a clean audit trail.
        </p>
      </header>

      {dashboard ? (
        <article className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding Options</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard.cards.outstandingOptions}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding RSUs</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard.cards.outstandingRsus}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Exercised</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard.cards.exercised}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Forfeited</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{dashboard.cards.forfeited}</p>
          </div>
        </article>
      ) : null}

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Cap Table and Share Base</h2>
        <p className="mt-1 text-sm text-slate-600">
          Define your base outstanding shares and monitor option-pool utilization plus holder-level outstanding balances.
        </p>

        {capTable ? (
          <>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Base Outstanding Shares</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{capTable.shares.baseOutstandingShares}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding Equity Instruments</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{capTable.shares.equityInstrumentsOutstanding}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Fully Diluted Shares</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{capTable.shares.fullyDilutedShares}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Authorized Shares</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{capTable.shares.authorizedShares}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Reserved</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{capTable.optionPool.reservedShares}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Granted</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{capTable.optionPool.grantedShares}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Remaining</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{capTable.optionPool.remainingShares}</p>
              </div>
            </div>

            <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onUpdateCapTableBase}>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:col-span-2">
                <span>Set Base Outstanding Shares</span>
                <input
                  name="outstandingShares"
                  defaultValue={capTable.shares.baseOutstandingShares}
                  placeholder="10000000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>
              <div className="md:col-span-2 flex items-end">
                <button
                  type="submit"
                  disabled={savingCapTableBase}
                  className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingCapTableBase ? 'Saving...' : 'Update Share Base'}
                </button>
              </div>
            </form>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Outstanding by Holder</h3>
              {capTable.holders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No holder balances recorded yet.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-2 pr-4">Holder</th>
                        <th className="pb-2 pr-4">Outstanding Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capTable.holders.map((holder) => (
                        <tr key={holder.personId} className="border-t border-slate-200">
                          <td className="py-2 pr-4 font-medium text-slate-900">{holder.personName}</td>
                          <td className="py-2 pr-4 text-slate-700">{holder.outstandingQuantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        ) : loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading cap table...</p>
        ) : (
          <p className="mt-4 text-sm text-slate-600">No cap-table data available yet.</p>
        )}
      </article>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Equity Plans</h2>
          <p className="mt-1 text-sm text-slate-600">Create plans and track reserves against granted awards.</p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreatePlan}>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Plan Code</span>
              <input name="code" required placeholder="2026-OP" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Plan Name</span>
              <input name="name" required placeholder="2026 Stock Option Plan" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Reserved Shares</span>
              <input name="reservedShares" required placeholder="1000000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Status</span>
              <select name="status" defaultValue="DRAFT" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
                <option value="DRAFT">DRAFT</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PAUSED">PAUSED</option>
                <option value="RETIRED">RETIRED</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Effective Date</span>
              <input name="effectiveDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Expiry Date</span>
              <input name="expiryDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <button type="submit" disabled={savingPlan} className="md:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
              {savingPlan ? 'Saving...' : 'Create Plan'}
            </button>
          </form>
          {plans.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="pb-2 pr-4">Plan</th>
                    <th className="pb-2 pr-4">Reserved</th>
                    <th className="pb-2 pr-4">Granted</th>
                    <th className="pb-2 pr-4">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.id} className="border-t border-slate-200">
                      <td className="py-2 pr-4">
                        <p className="font-medium text-slate-900">{plan.code}</p>
                        <p className="text-xs text-slate-500">{plan.name} · {plan.status}</p>
                      </td>
                      <td className="py-2 pr-4">{plan.reservedShares}</td>
                      <td className="py-2 pr-4">{plan.grantedShares ?? '0.000000'}</td>
                      <td className="py-2 pr-4">{plan.remainingShares ?? plan.reservedShares}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Lifecycle Timeline</h2>
          <p className="mt-1 text-sm text-slate-600">Recent grant, exercise, and termination events.</p>
          {loading ? (
            <p className="mt-4 text-sm text-slate-600">Loading timeline...</p>
          ) : !dashboard || dashboard.timeline.length === 0 ? (
            <p className="mt-4 text-sm text-slate-600">No lifecycle events yet.</p>
          ) : (
            <ul className="mt-4 max-h-[360px] divide-y divide-slate-200 overflow-y-auto">
              {dashboard.timeline.map((event, index) => (
                <li key={`${event.type}-${event.date}-${index}`} className="py-3">
                  <p className="text-sm font-medium text-slate-900">{event.title}</p>
                  <p className="text-xs text-slate-500">{new Date(event.date).toLocaleString()} · {event.type}</p>
                  <p className="text-sm text-slate-600">{event.subtitle}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Grant</h2>
        <p className="mt-1 text-sm text-slate-600">Use this flow for company-issued option and RSU awards.</p>
        <p className="mt-1 text-xs text-slate-500">All fields below are labeled. For RSU awards, exercise price is disabled by design.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreateGrant}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Recipient</span>
            <select name="personId" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              <option value="" disabled>
                Select recipient
              </option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.legalFirstName} {person.legalLastName}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Award Type</span>
            <select
              name="awardType"
              value={grantAwardType}
              onChange={(event) => setGrantAwardType(event.target.value as 'OPTION_ISO' | 'OPTION_NSO' | 'RSU')}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            >
              <option value="OPTION_NSO">Option - NSO</option>
              <option value="OPTION_ISO">Option - ISO</option>
              <option value="RSU">RSU</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Grant Quantity</span>
            <input
              name="quantity"
              required
              placeholder="25000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Source Plan</span>
            <select name="planId" defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              <option value="">No plan selected</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.code} - {plan.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Grant Date</span>
            <input name="grantDate" type="date" required defaultValue={dateInputToday()} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Currency</span>
            <input
              name="currency"
              defaultValue="USD"
              required
              maxLength={3}
              placeholder="USD"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>

          {(grantAwardType === 'OPTION_NSO' || grantAwardType === 'OPTION_ISO') ? (
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Exercise Price</span>
              <input
                name="exercisePrice"
                required
                placeholder="1.50"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          ) : (
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Exercise Price</span>
              <input
                disabled
                value="No exercise price for RSU"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-500"
                readOnly
              />
            </label>
          )}

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Expiration Date</span>
            <input name="expirationDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Vesting Start Date</span>
            <input
              name="vestingStartDate"
              type="date"
              required
              defaultValue={dateInputToday()}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Cliff (Months)</span>
            <input name="cliffMonths" type="number" min={0} max={120} defaultValue={12} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Vesting Duration (Months)</span>
            <input name="durationMonths" type="number" min={1} max={240} defaultValue={48} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Vesting Interval (Months)</span>
            <input name="intervalMonths" type="number" min={1} max={60} defaultValue={1} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:col-span-3">
            <span>Grant Notes</span>
            <input
              name="notes"
              placeholder="Optional notes for legal/admin context"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>

          <button
            type="submit"
            disabled={savingGrant || people.length === 0}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingGrant ? 'Saving...' : 'Create Grant'}
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Grant Registry</h2>
        <p className="mt-1 text-sm text-slate-600">Live register of option and RSU awards with vesting terms.</p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : grants.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No grants recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">Recipient</th>
                  <th className="pb-2 pr-4">Award</th>
                  <th className="pb-2 pr-4">Quantity</th>
                  <th className="pb-2 pr-4">Grant Date</th>
                  <th className="pb-2 pr-4">Vesting</th>
                  <th className="pb-2 pr-4">Plan</th>
                </tr>
              </thead>
              <tbody>
                {grants.map((grant) => (
                  <tr key={grant.id} className="border-t border-slate-200">
                    <td className="py-3 pr-4">
                      <p className="font-medium text-slate-900">
                        {grant.person.legalFirstName} {grant.person.legalLastName}
                      </p>
                      <p className="text-xs text-slate-500">{grant.person.primaryEmail ?? 'No primary email'}</p>
                      <Link href={`/app/equity/${grant.id}`} className="mt-1 inline-block text-xs font-medium text-slate-700 underline-offset-2 hover:underline">
                        Open grant details
                      </Link>
                    </td>
                    <td className="py-3 pr-4">
                      <p>{grant.awardType}</p>
                      <p className="text-xs text-slate-500">
                        {grant.exercisePrice ? `${grant.exercisePrice} ${grant.currency}` : 'No exercise price'}
                      </p>
                    </td>
                    <td className="py-3 pr-4">{grant.quantity}</td>
                    <td className="py-3 pr-4">
                      {grant.grantDate ? new Date(grant.grantDate).toLocaleDateString() : '-'}
                    </td>
                    <td className="py-3 pr-4">
                      {grant.vestingSchedule
                        ? `${grant.vestingSchedule.cliffMonths}m cliff / ${grant.vestingSchedule.durationMonths}m total / ${grant.vestingSchedule.intervalMonths}m interval`
                        : 'No schedule'}
                    </td>
                    <td className="py-3 pr-4">{grant.plan ? `${grant.plan.code} - ${grant.plan.name}` : 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Ledger</h2>
        {loading ? <p className="mt-4 text-sm text-slate-600">Loading...</p> : (
          <ul className="mt-3 divide-y divide-slate-200">
            {txns.map((txn) => (
              <li key={txn.id} className="py-3 text-sm">
                <p className="font-medium text-slate-900">#{txn.ledgerSequence} {txn.type} {txn.quantity}</p>
                <p className="text-slate-600">
                  {new Date(txn.effectiveAt).toLocaleString()} ·
                  {' '}From: {renderHolder(txn.fromPersonId)} · To: {renderHolder(txn.toPersonId)}
                </p>
                <p className="text-slate-500">{txn.reason ?? 'No reason'}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <details className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-lg font-semibold">Advanced: Manual Ledger Entry</summary>
        <p className="mt-2 text-sm text-slate-600">
          Use for corrective, transfer, or special events. Company treasury can be selected as either side.
        </p>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={onCreateManualTxn}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Transaction Type</span>
            <select name="type" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              {['ISSUE', 'VEST', 'EXERCISE', 'CANCEL', 'TRANSFER', 'CONVERT', 'SPLIT', 'REVERSE', 'CORRECT'].map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Effective Date & Time</span>
            <input name="effectiveAt" type="datetime-local" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Quantity</span>
            <input name="quantity" required placeholder="1000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Unit Price</span>
            <input name="unitPrice" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>From Holder</span>
            <select name="fromPersonId" defaultValue={companyTreasuryValue} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              <option value={companyTreasuryValue}>Company Treasury</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.legalFirstName} {person.legalLastName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>To Holder</span>
            <select name="toPersonId" defaultValue={companyTreasuryValue} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              <option value={companyTreasuryValue}>Company Treasury</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.legalFirstName} {person.legalLastName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:col-span-2">
            <span>Reason</span>
            <input name="reason" placeholder="Why this transaction is being recorded" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <button type="submit" disabled={savingTxn} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {savingTxn ? 'Saving...' : 'Record Transaction'}
          </button>
        </form>
      </details>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
    </section>
  );
}
