"use client";

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

type Person = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
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
  effectiveDate?: string | null;
  expiryDate?: string | null;
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

type GrantFormState = {
  personId: string;
  awardType: 'OPTION_ISO' | 'OPTION_NSO' | 'RSU';
  quantity: string;
  exercisePrice: string;
  planId: string;
  currency: string;
  grantDate: string;
  expirationDate: string;
  vestingStartDate: string;
  cliffMonths: string;
  durationMonths: string;
  intervalMonths: string;
  notes: string;
};

type PlanFormState = {
  planId: string;
  code: string;
  name: string;
  reservedShares: string;
  status: string;
  effectiveDate: string;
  expiryDate: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
const companyTreasuryValue = '__COMPANY__';

function dateInputToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeNumericInput(value: string): string {
  return value.trim().replaceAll(',', '');
}

function isDecimalLike(value: string): boolean {
  return /^\d+(\.\d+)?$/.test(value);
}

function toDayStartIso(dateInput: string): string | undefined {
  if (!dateInput.trim()) {
    return undefined;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    return undefined;
  }

  const parsed = new Date(`${dateInput}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return parsed.toISOString().slice(0, 10);
}

function formatShares(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '0';
  }

  const num = Number(value);
  if (!Number.isFinite(num)) {
    return String(value);
  }

  return num.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function defaultGrantForm(): GrantFormState {
  const today = dateInputToday();
  return {
    personId: '',
    awardType: 'OPTION_NSO',
    quantity: '',
    exercisePrice: '',
    planId: '',
    currency: 'USD',
    grantDate: today,
    expirationDate: '',
    vestingStartDate: today,
    cliffMonths: '12',
    durationMonths: '48',
    intervalMonths: '1',
    notes: '',
  };
}

function defaultPlanForm(): PlanFormState {
  return {
    planId: '',
    code: '',
    name: '',
    reservedShares: '',
    status: 'DRAFT',
    effectiveDate: '',
    expiryDate: '',
  };
}

export default function EquityPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'grants' | 'operations'>('overview');
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [plans, setPlans] = useState<EquityPlan[]>([]);
  const [grants, setGrants] = useState<GrantAward[]>([]);
  const [txns, setTxns] = useState<EquityTxn[]>([]);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null);
  const [capTableLoadError, setCapTableLoadError] = useState<string | null>(null);

  const [grantForm, setGrantForm] = useState<GrantFormState>(defaultGrantForm());
  const [editingGrantId, setEditingGrantId] = useState<string | null>(null);

  const [planForm, setPlanForm] = useState<PlanFormState>(defaultPlanForm());
  const [savingGrant, setSavingGrant] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingCapTableBase, setSavingCapTableBase] = useState(false);
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [showBaseEditor, setShowBaseEditor] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const capTableView: CapTableResponse =
    capTable ?? {
      generatedAt: new Date().toISOString(),
      shares: {
        baseOutstandingShares: '0',
        authorizedShares: '0',
        outstandingOptions: '0',
        outstandingRsus: '0',
        equityInstrumentsOutstanding: '0',
        fullyDilutedShares: '0',
      },
      optionPool: {
        reservedShares: '0',
        grantedShares: '0',
        remainingShares: '0',
      },
      holders: [],
    };

  const hasBaseShares = Number(capTableView.shares.baseOutstandingShares) > 0;

  async function loadData() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setCapTableLoadError(null);

    try {
      const [peopleResp, plansResp, grantsResp, ledgerResp, dashboardResp, capTableResp] = await Promise.all([
        fetch(`${apiBaseUrl}/people?page=1&pageSize=100`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/plans`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/grants`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/ledger`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/dashboard`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/equity/cap-table`, { credentials: 'include' }),
      ]);

      const failures: string[] = [];

      if (peopleResp.ok) {
        const peoplePayload = (await peopleResp.json()) as PeopleResponse;
        setPeople(peoplePayload.data);
      } else {
        failures.push(await readApiError(peopleResp, 'Unable to load people.'));
      }

      if (plansResp.ok) {
        setPlans((await plansResp.json()) as EquityPlan[]);
      } else {
        failures.push(await readApiError(plansResp, 'Unable to load equity plans.'));
      }

      if (grantsResp.ok) {
        setGrants((await grantsResp.json()) as GrantAward[]);
      } else {
        failures.push(await readApiError(grantsResp, 'Unable to load grant awards.'));
      }

      if (ledgerResp.ok) {
        setTxns((await ledgerResp.json()) as EquityTxn[]);
      } else {
        failures.push(await readApiError(ledgerResp, 'Unable to load equity ledger.'));
      }

      if (dashboardResp.ok) {
        setDashboard((await dashboardResp.json()) as DashboardResponse);
      } else {
        failures.push(await readApiError(dashboardResp, 'Unable to load equity dashboard.'));
      }

      if (capTableResp.ok) {
        const capPayload = (await capTableResp.json()) as CapTableResponse;
        setCapTable(capPayload);
        setShowBaseEditor(Number(capPayload.shares.baseOutstandingShares) <= 0);
      } else {
        setCapTable(null);
        setCapTableLoadError(await readApiError(capTableResp, 'Cap table is unavailable right now.'));
      }

      if (failures.length > 0) {
        setError(failures.join(' '));
      }
    } catch {
      setError('Unable to load equity workspace.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function onSubmitGrant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingGrant(true);
    setError(null);
    setNotice(null);

    const quantity = normalizeNumericInput(grantForm.quantity);
    const exercisePrice = normalizeNumericInput(grantForm.exercisePrice);

    if (!grantForm.personId) {
      setError('Select a recipient.');
      setSavingGrant(false);
      return;
    }

    if (!quantity || !isDecimalLike(quantity) || Number(quantity) <= 0) {
      setError('Grant quantity must be a valid positive number.');
      setSavingGrant(false);
      return;
    }

    const grantDateIso = toDayStartIso(grantForm.grantDate);
    if (!grantDateIso) {
      setError('Grant date is invalid.');
      setSavingGrant(false);
      return;
    }

    const vestingStartDateIso = toDayStartIso(grantForm.vestingStartDate);
    if (!vestingStartDateIso) {
      setError('Vesting start date is invalid.');
      setSavingGrant(false);
      return;
    }

    const expirationDateIso = grantForm.expirationDate ? toDayStartIso(grantForm.expirationDate) : undefined;
    if (grantForm.expirationDate && !expirationDateIso) {
      setError('Expiration date is invalid.');
      setSavingGrant(false);
      return;
    }

    if (
      (grantForm.awardType === 'OPTION_ISO' || grantForm.awardType === 'OPTION_NSO') &&
      (!exercisePrice || !isDecimalLike(exercisePrice))
    ) {
      setError('Exercise price is required for option grants and must be numeric.');
      setSavingGrant(false);
      return;
    }

    if (grantForm.awardType === 'RSU' && exercisePrice) {
      setError('Exercise price should be blank for RSU grants.');
      setSavingGrant(false);
      return;
    }

    const cliffMonths = Number(grantForm.cliffMonths);
    const durationMonths = Number(grantForm.durationMonths);
    const intervalMonths = Number(grantForm.intervalMonths);

    if (!Number.isInteger(cliffMonths) || cliffMonths < 0) {
      setError('Cliff months must be a whole number >= 0.');
      setSavingGrant(false);
      return;
    }

    if (!Number.isInteger(durationMonths) || durationMonths < 1) {
      setError('Duration months must be a whole number >= 1.');
      setSavingGrant(false);
      return;
    }

    if (!Number.isInteger(intervalMonths) || intervalMonths < 1) {
      setError('Interval months must be a whole number >= 1.');
      setSavingGrant(false);
      return;
    }

    const payload = {
      personId: grantForm.personId,
      awardType: grantForm.awardType,
      quantity,
      exercisePrice:
        grantForm.awardType === 'OPTION_ISO' || grantForm.awardType === 'OPTION_NSO'
          ? exercisePrice || undefined
          : undefined,
      planId: grantForm.planId || undefined,
      currency: grantForm.currency.trim().toUpperCase() || 'USD',
      grantDate: grantDateIso,
      expirationDate: expirationDateIso,
      vestingStartDate: vestingStartDateIso,
      cliffMonths,
      durationMonths,
      intervalMonths,
      notes: grantForm.notes.trim() || undefined,
    };

    const endpoint = editingGrantId ? `${apiBaseUrl}/equity/grants/${editingGrantId}` : `${apiBaseUrl}/equity/grants`;
    const method = editingGrantId ? 'PATCH' : 'POST';

    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(
          await readApiError(
            response,
            editingGrantId ? 'Unable to update grant.' : 'Unable to create grant.',
          ),
        );
        return;
      }

      setNotice(editingGrantId ? 'Grant updated successfully.' : 'Grant created successfully.');
      setEditingGrantId(null);
      setGrantForm(defaultGrantForm());
      await loadData();
    } catch {
      setError(editingGrantId ? 'Unable to update grant.' : 'Unable to create grant.');
    } finally {
      setSavingGrant(false);
    }
  }

  function startGrantEdit(grant: GrantAward) {
    setEditingGrantId(grant.id);
    setGrantForm({
      personId: grant.personId,
      awardType: grant.awardType,
      quantity: String(grant.quantity ?? ''),
      exercisePrice: grant.exercisePrice ?? '',
      planId: grant.plan?.id ?? '',
      currency: grant.currency || 'USD',
      grantDate: toDateInputValue(grant.grantDate),
      expirationDate: toDateInputValue(grant.expirationDate),
      vestingStartDate: toDateInputValue(grant.vestingSchedule?.startDate),
      cliffMonths: String(grant.vestingSchedule?.cliffMonths ?? 12),
      durationMonths: String(grant.vestingSchedule?.durationMonths ?? 48),
      intervalMonths: String(grant.vestingSchedule?.intervalMonths ?? 1),
      notes: '',
    });
    setActiveTab('grants');
    setError(null);
    setNotice('Editing grant. Save to apply changes.');
  }

  function cancelGrantEdit() {
    setEditingGrantId(null);
    setGrantForm(defaultGrantForm());
    setError(null);
  }

  async function deleteGrant(grantId: string) {
    const confirmed = window.confirm('Delete this grant? This only works if the grant has no lifecycle events.');
    if (!confirmed) {
      return;
    }

    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/equity/grants/${grantId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to delete grant.'));
        return;
      }

      if (editingGrantId === grantId) {
        cancelGrantEdit();
      }
      setNotice('Grant deleted.');
      await loadData();
    } catch {
      setError('Unable to delete grant.');
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
      setError('Base outstanding shares must be numeric.');
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

      const payload = (await response.json()) as CapTableResponse;
      setCapTable(payload);
      setShowBaseEditor(false);
      setNotice('Base outstanding shares saved.');
    } catch {
      setError('Unable to update base outstanding shares.');
    } finally {
      setSavingCapTableBase(false);
    }
  }

  async function onRecordOpeningBalance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingOpeningBalance(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const personId = String(form.get('personId') ?? '').trim();
    const quantity = normalizeNumericInput(String(form.get('quantity') ?? ''));
    const effectiveDate = String(form.get('effectiveDate') ?? '').trim();
    const reason = String(form.get('reason') ?? '').trim();

    if (!personId) {
      setError('Select a holder.');
      setSavingOpeningBalance(false);
      return;
    }

    if (!quantity || !isDecimalLike(quantity) || Number(quantity) <= 0) {
      setError('Opening balance quantity must be a valid positive number.');
      setSavingOpeningBalance(false);
      return;
    }

    const effectiveAt = toDayStartIso(effectiveDate);
    if (!effectiveAt) {
      setError('Effective date is invalid.');
      setSavingOpeningBalance(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/equity/ledger`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'ISSUE',
          effectiveAt,
          quantity,
          toPersonId: personId,
          reason: reason || 'Opening cap table balance',
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to record opening balance.'));
        return;
      }

      setNotice('Opening holder balance recorded.');
      event.currentTarget.reset();
      await loadData();
    } catch {
      setError('Unable to record opening balance.');
    } finally {
      setSavingOpeningBalance(false);
    }
  }

  async function onSavePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPlan(true);
    setError(null);
    setNotice(null);

    const reservedShares = normalizeNumericInput(planForm.reservedShares);
    if (!planForm.name.trim()) {
      setError('Plan name is required.');
      setSavingPlan(false);
      return;
    }
    if (!reservedShares || !isDecimalLike(reservedShares) || Number(reservedShares) <= 0) {
      setError('Reserved shares must be a valid positive number.');
      setSavingPlan(false);
      return;
    }

    const payloadBase = {
      name: planForm.name.trim(),
      reservedShares,
      status: planForm.status,
      effectiveDate: toDayStartIso(planForm.effectiveDate),
      expiryDate: toDayStartIso(planForm.expiryDate),
    };

    const isEditing = Boolean(planForm.planId);
    const endpoint = isEditing ? `${apiBaseUrl}/equity/plans/${planForm.planId}` : `${apiBaseUrl}/equity/plans`;
    const method = isEditing ? 'PATCH' : 'POST';

    const payload = isEditing
      ? payloadBase
      : {
          code: planForm.code.trim().toUpperCase(),
          ...payloadBase,
        };

    if (!isEditing && !planForm.code.trim()) {
      setError('Plan code is required for a new plan.');
      setSavingPlan(false);
      return;
    }

    try {
      const response = await fetch(endpoint, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response, isEditing ? 'Unable to update plan.' : 'Unable to create plan.'));
        return;
      }

      setNotice(isEditing ? 'Plan pool updated.' : 'Plan created.');
      setPlanForm(defaultPlanForm());
      await loadData();
    } catch {
      setError(isEditing ? 'Unable to update plan.' : 'Unable to create plan.');
    } finally {
      setSavingPlan(false);
    }
  }

  function startPlanEdit(plan: EquityPlan) {
    setPlanForm({
      planId: plan.id,
      code: plan.code,
      name: plan.name,
      reservedShares: plan.reservedShares,
      status: plan.status,
      effectiveDate: toDateInputValue(plan.effectiveDate),
      expiryDate: toDateInputValue(plan.expiryDate),
    });
    setActiveTab('operations');
    setError(null);
    setNotice('Editing option pool details for selected plan.');
  }

  function resetPlanEditor() {
    setPlanForm(defaultPlanForm());
    setError(null);
  }

  async function onCreateManualTxn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingTxn(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const type = String(form.get('type') ?? '').trim();
    const quantity = normalizeNumericInput(String(form.get('quantity') ?? ''));
    const unitPrice = normalizeNumericInput(String(form.get('unitPrice') ?? ''));
    const effectiveAtRaw = String(form.get('effectiveAt') ?? '').trim();
    const fromHolder = String(form.get('fromPersonId') ?? companyTreasuryValue);
    const toHolder = String(form.get('toPersonId') ?? companyTreasuryValue);

    if (!type) {
      setError('Transaction type is required.');
      setSavingTxn(false);
      return;
    }

    if (!quantity || !isDecimalLike(quantity) || Number(quantity) <= 0) {
      setError('Transaction quantity must be a valid positive number.');
      setSavingTxn(false);
      return;
    }

    const effectiveAt = new Date(effectiveAtRaw);
    if (Number.isNaN(effectiveAt.getTime())) {
      setError('Effective date and time is invalid.');
      setSavingTxn(false);
      return;
    }

    const payload = {
      type,
      effectiveAt: effectiveAt.toISOString(),
      quantity,
      unitPrice: unitPrice || undefined,
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

      setNotice('Manual ledger transaction recorded.');
      event.currentTarget.reset();
      await loadData();
    } catch {
      setError('Unable to create ledger transaction.');
    } finally {
      setSavingTxn(false);
    }
  }

  function renderHolder(personId: string | null): string {
    if (!personId) {
      return 'Company Treasury';
    }
    const person = peopleById.get(personId);
    return person ? `${person.legalFirstName} ${person.legalLastName}` : personId;
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Equity Workspace</h1>
            <p className="mt-1 text-sm text-slate-600">Cap table, grants, and pool management in one streamlined workspace.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'overview' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('grants')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'grants' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Grant Registry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('operations')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'operations' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            Operations
          </button>
        </div>
      </header>

      {activeTab === 'overview' ? (
        <>
          {dashboard ? (
            <article className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding Options</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(dashboard.cards.outstandingOptions)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding RSUs</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(dashboard.cards.outstandingRsus)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Exercised</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(dashboard.cards.exercised)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs uppercase tracking-wide text-slate-500">Forfeited</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(dashboard.cards.forfeited)}</p>
              </div>
            </article>
          ) : null}

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Cap Table</h2>
            <p className="mt-1 text-sm text-slate-600">Live shares, dilution, option pool, and holder balances.</p>

            {capTableLoadError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {capTableLoadError}
              </p>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Base Outstanding Shares</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.baseOutstandingShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Outstanding Instruments</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.equityInstrumentsOutstanding)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Fully Diluted Shares</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.fullyDilutedShares)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Authorized</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.shares.authorizedShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Reserved</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.optionPool.reservedShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Granted</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.optionPool.grantedShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Pool Remaining</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.optionPool.remainingShares)}</p>
              </div>
            </div>

            {hasBaseShares && !showBaseEditor ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <p className="text-sm text-emerald-900">Base outstanding shares are configured.</p>
                <button
                  type="button"
                  onClick={() => setShowBaseEditor(true)}
                  className="rounded-md border border-emerald-300 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-100"
                >
                  Change Base Shares
                </button>
              </div>
            ) : (
              <form className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-3" onSubmit={onUpdateCapTableBase}>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:col-span-2">
                  <span>Base Outstanding Shares</span>
                  <input
                    name="outstandingShares"
                    defaultValue={capTableView.shares.baseOutstandingShares}
                    placeholder="10000000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingCapTableBase}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingCapTableBase ? 'Saving...' : hasBaseShares ? 'Update Base' : 'Set Base'}
                </button>
              </form>
            )}

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Outstanding by Holder</h3>
              {capTableView.holders.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No holder balances yet. Use the Operations tab to add opening balances.</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="pb-2 pr-4">Holder</th>
                        <th className="pb-2 pr-4">Outstanding</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capTableView.holders.map((holder) => (
                        <tr key={holder.personId} className="border-t border-slate-200">
                          <td className="py-2 pr-4 font-medium text-slate-900">{holder.personName}</td>
                          <td className="py-2 pr-4 text-slate-700">{formatShares(holder.outstandingQuantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </article>
        </>
      ) : null}

      {activeTab === 'grants' ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">Grant Registry</h2>
                <p className="mt-1 text-sm text-slate-600">{grants.length} grants recorded.</p>
              </div>
            </div>

            {grants.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No grants recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-2 pr-4">Recipient</th>
                      <th className="pb-2 pr-4">Award</th>
                      <th className="pb-2 pr-4">Quantity</th>
                      <th className="pb-2 pr-4">Plan</th>
                      <th className="pb-2 pr-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grants.map((grant) => (
                      <tr key={grant.id} className="border-t border-slate-200">
                        <td className="py-3 pr-4">
                          <p className="font-medium text-slate-900">{grant.person.legalFirstName} {grant.person.legalLastName}</p>
                          <p className="text-xs text-slate-500">{grant.person.primaryEmail ?? 'No email'}</p>
                        </td>
                        <td className="py-3 pr-4">
                          <p>{grant.awardType}</p>
                          <p className="text-xs text-slate-500">
                            {grant.exercisePrice ? `${formatShares(grant.exercisePrice)} ${grant.currency}` : 'No exercise price'}
                          </p>
                        </td>
                        <td className="py-3 pr-4">{formatShares(grant.quantity)}</td>
                        <td className="py-3 pr-4">{grant.plan ? `${grant.plan.code} - ${grant.plan.name}` : 'Unassigned'}</td>
                        <td className="py-3 pr-4">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => startGrantEdit(grant)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteGrant(grant.id)}
                              className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
                            >
                              Delete
                            </button>
                            <Link href={`/app/equity/${grant.id}`} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">
                              Details
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{editingGrantId ? 'Edit Grant' : 'Create Grant'}</h2>
              {editingGrantId ? (
                <button
                  type="button"
                  onClick={cancelGrantEdit}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                >
                  Cancel Edit
                </button>
              ) : null}
            </div>

            <form className="mt-4 grid gap-3" onSubmit={onSubmitGrant}>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Recipient</span>
                <select
                  value={grantForm.personId}
                  onChange={(event) => setGrantForm((prev) => ({ ...prev, personId: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                >
                  <option value="">Select recipient</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.legalFirstName} {person.legalLastName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Award Type</span>
                  <select
                    value={grantForm.awardType}
                    onChange={(event) =>
                      setGrantForm((prev) => ({
                        ...prev,
                        awardType: event.target.value as 'OPTION_ISO' | 'OPTION_NSO' | 'RSU',
                        exercisePrice: event.target.value === 'RSU' ? '' : prev.exercisePrice,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  >
                    <option value="OPTION_NSO">Option - NSO</option>
                    <option value="OPTION_ISO">Option - ISO</option>
                    <option value="RSU">RSU</option>
                  </select>
                </label>

                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Quantity</span>
                  <input
                    value={grantForm.quantity}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, quantity: event.target.value }))}
                    placeholder="25000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Source Plan</span>
                  <select
                    value={grantForm.planId}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, planId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  >
                    <option value="">No plan selected</option>
                    {plans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.code} - {plan.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Currency</span>
                  <input
                    maxLength={3}
                    value={grantForm.currency}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, currency: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              {(grantForm.awardType === 'OPTION_NSO' || grantForm.awardType === 'OPTION_ISO') ? (
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Exercise Price</span>
                  <input
                    value={grantForm.exercisePrice}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, exercisePrice: event.target.value }))}
                    placeholder="1.50"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Grant Date</span>
                  <input
                    type="date"
                    value={grantForm.grantDate}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, grantDate: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Expiration Date</span>
                  <input
                    type="date"
                    value={grantForm.expirationDate}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, expirationDate: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Vesting Start Date</span>
                <input
                  type="date"
                  value={grantForm.vestingStartDate}
                  onChange={(event) => setGrantForm((prev) => ({ ...prev, vestingStartDate: event.target.value }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Cliff Months</span>
                  <input
                    value={grantForm.cliffMonths}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, cliffMonths: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Duration Months</span>
                  <input
                    value={grantForm.durationMonths}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, durationMonths: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Interval Months</span>
                  <input
                    value={grantForm.intervalMonths}
                    onChange={(event) => setGrantForm((prev) => ({ ...prev, intervalMonths: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Notes</span>
                <input
                  value={grantForm.notes}
                  onChange={(event) => setGrantForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Optional internal notes"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>

              <button
                type="submit"
                disabled={savingGrant || people.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingGrant ? 'Saving...' : editingGrantId ? 'Update Grant' : 'Create Grant'}
              </button>
            </form>
          </article>
        </div>
      ) : null}

      {activeTab === 'operations' ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Option Pool Management</h2>
            <p className="mt-1 text-sm text-slate-600">Create or update plan reserve pools.</p>

            <form className="mt-4 grid gap-3" onSubmit={onSavePlan}>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Plan Code</span>
                  <input
                    value={planForm.code}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))}
                    disabled={Boolean(planForm.planId)}
                    placeholder="2026-OP"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900 disabled:bg-slate-100"
                  />
                </label>

                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Name</span>
                  <input
                    value={planForm.name}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
                    placeholder="Employee Option Pool"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Reserved Shares</span>
                  <input
                    value={planForm.reservedShares}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, reservedShares: event.target.value }))}
                    placeholder="1000000"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Status</span>
                  <select
                    value={planForm.status}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, status: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PAUSED">PAUSED</option>
                    <option value="RETIRED">RETIRED</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Effective Date</span>
                  <input
                    type="date"
                    value={planForm.effectiveDate}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, effectiveDate: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Expiry Date</span>
                  <input
                    type="date"
                    value={planForm.expiryDate}
                    onChange={(event) => setPlanForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                  />
                </label>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingPlan ? 'Saving...' : planForm.planId ? 'Update Pool' : 'Create Pool'}
                </button>
                {planForm.planId ? (
                  <button
                    type="button"
                    onClick={resetPlanEditor}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50"
                  >
                    Cancel Edit
                  </button>
                ) : null}
              </div>
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
                      <th className="pb-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id} className="border-t border-slate-200">
                        <td className="py-2 pr-4">
                          <p className="font-medium text-slate-900">{plan.code}</p>
                          <p className="text-xs text-slate-500">{plan.name} · {plan.status}</p>
                        </td>
                        <td className="py-2 pr-4">{formatShares(plan.reservedShares)}</td>
                        <td className="py-2 pr-4">{formatShares(plan.grantedShares)}</td>
                        <td className="py-2 pr-4">{formatShares(plan.remainingShares ?? plan.reservedShares)}</td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => startPlanEdit(plan)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Cap Table Operations</h2>
            <p className="mt-1 text-sm text-slate-600">Onboard holder balances and post manual corrective entries.</p>

            <form className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4" onSubmit={onRecordOpeningBalance}>
              <h3 className="text-sm font-semibold text-slate-900">Add Opening Holder Balance</h3>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Holder</span>
                <select
                  name="personId"
                  required
                  defaultValue=""
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                >
                  <option value="" disabled>
                    Select holder
                  </option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.legalFirstName} {person.legalLastName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Quantity</span>
                  <input name="quantity" placeholder="500000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Effective Date</span>
                  <input name="effectiveDate" type="date" defaultValue={dateInputToday()} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                </label>
              </div>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Reason</span>
                <input
                  name="reason"
                  placeholder="Opening cap table balance"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>
              <button
                type="submit"
                disabled={savingOpeningBalance || people.length === 0}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingOpeningBalance ? 'Saving...' : 'Record Opening Balance'}
              </button>
            </form>

            <details className="mt-4 rounded-xl border border-slate-200 p-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">Manual Ledger Entry</summary>
              <form className="mt-3 grid gap-3" onSubmit={onCreateManualTxn}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <span>Transaction Type</span>
                    <select name="type" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
                      {['ISSUE', 'VEST', 'EXERCISE', 'CANCEL', 'TRANSFER', 'CONVERT', 'SPLIT', 'REVERSE', 'CORRECT'].map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <span>Effective Date & Time</span>
                    <input name="effectiveAt" type="datetime-local" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <span>Quantity</span>
                    <input name="quantity" placeholder="1000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                  </label>
                  <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <span>Unit Price</span>
                    <input name="unitPrice" placeholder="Optional" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                  </label>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
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
                </div>

                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Reason</span>
                  <input name="reason" placeholder="Why this is needed" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
                </label>

                <button
                  type="submit"
                  disabled={savingTxn}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingTxn ? 'Saving...' : 'Record Transaction'}
                </button>
              </form>
            </details>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">Recent Ledger Entries</h3>
              {txns.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No ledger entries yet.</p>
              ) : (
                <ul className="mt-2 max-h-[260px] divide-y divide-slate-200 overflow-y-auto">
                  {txns.slice(-25).reverse().map((txn) => (
                    <li key={txn.id} className="py-2 text-sm">
                      <p className="font-medium text-slate-900">#{txn.ledgerSequence} {txn.type} {formatShares(txn.quantity)}</p>
                      <p className="text-slate-600">
                        {new Date(txn.effectiveAt).toLocaleString()} · From: {renderHolder(txn.fromPersonId)} · To: {renderHolder(txn.toPersonId)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      ) : null}

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}
    </section>
  );
}
