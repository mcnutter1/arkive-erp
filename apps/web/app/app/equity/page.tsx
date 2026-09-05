"use client";

import Link from 'next/link';
import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react';

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
  metadata?: Record<string, unknown> | null;
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
  valuation: {
    sourceValuationId: string | null;
    effectiveDate: string | null;
    enterpriseValue: string;
    perShareValue: string;
    denominatorShares: string;
  };
  shares: {
    totalAvailableShares: string;
    issuedCommonShares: string;
    advisorPoolShares: string;
    managementPoolShares: string;
    unassignedOverallShares: string;
    overAllocatedShares: string;
    baseOutstandingShares: string;
    authorizedShares: string;
    outstandingOptions: string;
    outstandingRsus: string;
    equityInstrumentsOutstanding: string;
    fullyDilutedShares: string;
  };
  pools: {
    advisor: {
      configuredShares: string;
      assignedShares: string;
      outstandingShares: string;
      returnedShares: string;
      unassignedShares: string;
      planIds: string[];
    };
    management: {
      configuredShares: string;
      assignedShares: string;
      outstandingShares: string;
      returnedShares: string;
      unassignedShares: string;
      planIds: string[];
    };
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
  ownershipTable: Array<{
    personId: string;
    personName: string;
    shareType: string;
    sharesOwned: string;
    ownershipPercent: string;
    estimatedValue: string;
  }>;
};

type PoolConfigFormState = {
  advisorPoolShares: string;
  managementPoolShares: string;
  advisorPlanIds: string[];
  managementPlanIds: string[];
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

type ModalView = 'grant' | 'plan' | 'openingBalance' | 'manualTxn' | 'baseShares' | 'poolConfig' | null;

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

function defaultExercisePriceFromPerShare(perShareValue: string): string {
  const normalized = normalizeNumericInput(String(perShareValue ?? ''));
  if (!normalized || !isDecimalLike(normalized)) {
    return '';
  }
  return normalized;
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

function formatShareType(value: string): string {
  return value
    .split('_')
    .map((part) => part.slice(0, 1) + part.slice(1).toLowerCase())
    .join(' ');
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

function defaultPoolConfigForm(): PoolConfigFormState {
  return {
    advisorPoolShares: '0',
    managementPoolShares: '0',
    advisorPlanIds: [],
    managementPlanIds: [],
  };
}

function Modal({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('keydown', onEscape);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
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
  const [poolConfigForm, setPoolConfigForm] = useState<PoolConfigFormState>(defaultPoolConfigForm());
  const [savingGrant, setSavingGrant] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingPoolConfig, setSavingPoolConfig] = useState(false);
  const [savingCapTableBase, setSavingCapTableBase] = useState(false);
  const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);
  const [savingTxn, setSavingTxn] = useState(false);
  const [showBaseEditor, setShowBaseEditor] = useState(false);
  const [modalView, setModalView] = useState<ModalView>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const capTableView: CapTableResponse =
    capTable ?? {
      generatedAt: new Date().toISOString(),
      valuation: {
        sourceValuationId: null,
        effectiveDate: null,
        enterpriseValue: '0',
        perShareValue: '0',
        denominatorShares: '0',
      },
      shares: {
        totalAvailableShares: '0',
        issuedCommonShares: '0',
        advisorPoolShares: '0',
        managementPoolShares: '0',
        unassignedOverallShares: '0',
        overAllocatedShares: '0',
        baseOutstandingShares: '0',
        authorizedShares: '0',
        outstandingOptions: '0',
        outstandingRsus: '0',
        equityInstrumentsOutstanding: '0',
        fullyDilutedShares: '0',
      },
      pools: {
        advisor: {
          configuredShares: '0',
          assignedShares: '0',
          outstandingShares: '0',
          returnedShares: '0',
          unassignedShares: '0',
          planIds: [],
        },
        management: {
          configuredShares: '0',
          assignedShares: '0',
          outstandingShares: '0',
          returnedShares: '0',
          unassignedShares: '0',
          planIds: [],
        },
      },
      optionPool: {
        reservedShares: '0',
        grantedShares: '0',
        remainingShares: '0',
      },
      holders: [],
      ownershipTable: [],
    };

  const hasBaseShares = Number(capTableView.shares.totalAvailableShares) > 0;
  const advisorPoolPlanIds = useMemo(() => new Set(capTableView.pools.advisor.planIds), [capTableView.pools.advisor.planIds]);
  const managementPoolPlanIds = useMemo(
    () => new Set(capTableView.pools.management.planIds),
    [capTableView.pools.management.planIds],
  );
  const configuredPoolPlanIds = useMemo(
    () => new Set([...advisorPoolPlanIds, ...managementPoolPlanIds]),
    [advisorPoolPlanIds, managementPoolPlanIds],
  );
  const availableGrantPlans = useMemo(() => {
    if (configuredPoolPlanIds.size === 0) {
      return plans;
    }

    const configured = plans.filter((plan) => configuredPoolPlanIds.has(plan.id));
    if (!grantForm.planId || configured.some((plan) => plan.id === grantForm.planId)) {
      return configured;
    }

    const selectedPlan = plans.find((plan) => plan.id === grantForm.planId);
    if (!selectedPlan) {
      return configured;
    }

    return [selectedPlan, ...configured];
  }, [configuredPoolPlanIds, grantForm.planId, plans]);

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
        setPoolConfigForm({
          advisorPoolShares: capPayload.pools.advisor.configuredShares,
          managementPoolShares: capPayload.pools.management.configuredShares,
          advisorPlanIds: capPayload.pools.advisor.planIds,
          managementPlanIds: capPayload.pools.management.planIds,
        });
        setShowBaseEditor(Number(capPayload.shares.totalAvailableShares) <= 0);
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

  useEffect(() => {
    if (!modalView) {
      return;
    }

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [modalView]);

  function openCreateGrantModal() {
    setEditingGrantId(null);
    const defaults = defaultGrantForm();
    setGrantForm({
      ...defaults,
      exercisePrice:
        defaults.awardType === 'RSU' ? '' : defaultExercisePriceFromPerShare(capTableView.valuation.perShareValue),
    });
    setModalView('grant');
    setActiveTab('grants');
    setError(null);
    setNotice(null);
  }

  function openCreatePlanModal() {
    setPlanForm(defaultPlanForm());
    setModalView('plan');
    setActiveTab('operations');
    setError(null);
    setNotice(null);
  }

  function openOpeningBalanceModal() {
    setModalView('openingBalance');
    setActiveTab('operations');
    setError(null);
    setNotice(null);
  }

  function openManualTxnModal() {
    setModalView('manualTxn');
    setActiveTab('operations');
    setError(null);
    setNotice(null);
  }

  function openBaseSharesModal() {
    setModalView('baseShares');
    setActiveTab('overview');
    setError(null);
    setNotice(null);
  }

  function openPoolConfigModal() {
    setModalView('poolConfig');
    setActiveTab('overview');
    setError(null);
    setNotice(null);
  }

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

    if (!grantForm.planId) {
      setError('Select an advisor or management pool plan for this grant.');
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
      setModalView(null);
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
    setModalView('grant');
    setError(null);
    setNotice('Editing grant. Save to apply changes.');
  }

  function cancelGrantEdit() {
    setEditingGrantId(null);
    setGrantForm(defaultGrantForm());
    setModalView(null);
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
      setError('Total available shares must be numeric.');
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
        setError(await readApiError(response, 'Unable to update total available shares.'));
        return;
      }

      const payload = (await response.json()) as CapTableResponse;
      setCapTable(payload);
      setPoolConfigForm({
        advisorPoolShares: payload.pools.advisor.configuredShares,
        managementPoolShares: payload.pools.management.configuredShares,
        advisorPlanIds: payload.pools.advisor.planIds,
        managementPlanIds: payload.pools.management.planIds,
      });
      setShowBaseEditor(false);
      setModalView(null);
      setNotice('Total available shares saved.');
    } catch {
      setError('Unable to update total available shares.');
    } finally {
      setSavingCapTableBase(false);
    }
  }

  async function onSavePoolConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingPoolConfig(true);
    setError(null);
    setNotice(null);

    const advisorPoolShares = normalizeNumericInput(poolConfigForm.advisorPoolShares);
    const managementPoolShares = normalizeNumericInput(poolConfigForm.managementPoolShares);

    if (!isDecimalLike(advisorPoolShares) || Number(advisorPoolShares) < 0) {
      setError('Advisor pool shares must be a non-negative number.');
      setSavingPoolConfig(false);
      return;
    }

    if (!isDecimalLike(managementPoolShares) || Number(managementPoolShares) < 0) {
      setError('Management pool shares must be a non-negative number.');
      setSavingPoolConfig(false);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/equity/cap-table/pools`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          advisorPoolShares,
          managementPoolShares,
          advisorPlanIds: poolConfigForm.advisorPlanIds,
          managementPlanIds: poolConfigForm.managementPlanIds,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to save pool configuration.'));
        return;
      }

      const payload = (await response.json()) as CapTableResponse;
      setCapTable(payload);
      setPoolConfigForm({
        advisorPoolShares: payload.pools.advisor.configuredShares,
        managementPoolShares: payload.pools.management.configuredShares,
        advisorPlanIds: payload.pools.advisor.planIds,
        managementPlanIds: payload.pools.management.planIds,
      });
      setModalView(null);
      setNotice('Cap table pools updated.');
    } catch {
      setError('Unable to save pool configuration.');
    } finally {
      setSavingPoolConfig(false);
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
    const commonStockType = String(form.get('commonStockType') ?? 'FOUNDER').trim();

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
          instrumentType: `COMMON_${commonStockType}`,
          reason: reason || 'Opening cap table balance',
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to record opening balance.'));
        return;
      }

      setNotice('Opening holder balance recorded.');
      event.currentTarget.reset();
      setModalView(null);
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
      setModalView(null);
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
    setModalView('plan');
    setError(null);
    setNotice('Editing option pool details for selected plan.');
  }

  function resetPlanEditor() {
    setPlanForm(defaultPlanForm());
    setModalView(null);
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
    const instrumentType = String(form.get('instrumentType') ?? 'COMMON_OTHER').trim();

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
      instrumentType,
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
      setModalView(null);
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
    <section className="space-y-6">
      <header className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-100 via-white to-cyan-100 p-5 shadow-sm md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Equity Control Center</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-900">Equity Workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-700">
              Keep the cap table reliable with clean grant workflows, controlled pool edits, and a full ledger trail.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreateGrantModal}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              New Grant
            </button>
            <button
              type="button"
              onClick={openCreatePlanModal}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Manage Pool
            </button>
            <button
              type="button"
              onClick={openManualTxnModal}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Record Entry
            </button>
            <button
              type="button"
              onClick={() => void loadData()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>
      ) : null}

      <nav className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'overview' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('grants')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'grants' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            Grant Registry
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('operations')}
            className={`rounded-lg px-3 py-1.5 text-sm ${activeTab === 'operations' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
          >
            Operations
          </button>
        </div>
      </nav>

      {activeTab === 'overview' ? (
        <div className="space-y-5">
          {dashboard ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
            </div>
          ) : null}

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Cap Table Snapshot</h2>
                <p className="mt-1 text-sm text-slate-600">Structured as available shares, issued common, advisor pool, and management pool with ownership value.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={openBaseSharesModal}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  {hasBaseShares ? 'Update Total Shares' : 'Set Total Shares'}
                </button>
                <button
                  type="button"
                  onClick={openPoolConfigModal}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Configure Pools
                </button>
              </div>
            </div>

            {capTableLoadError ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {capTableLoadError}
              </p>
            ) : null}

            {showBaseEditor ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Total available shares are not configured yet.
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Total Available Shares</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.totalAvailableShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Common Stock Issued</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.issuedCommonShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Advisor Pool</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.advisorPoolShares)}</p>
                <p className="text-xs text-slate-500">Unassigned: {formatShares(capTableView.pools.advisor.unassignedShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Management Pool</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(capTableView.shares.managementPoolShares)}</p>
                <p className="text-xs text-slate-500">Unassigned: {formatShares(capTableView.pools.management.unassignedShares)}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Unassigned Overall</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.shares.unassignedOverallShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">EV Per Share</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">${formatShares(capTableView.valuation.perShareValue)}</p>
                <p className="text-xs text-slate-500">Enterprise Value: ${formatShares(capTableView.valuation.enterpriseValue)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Over Allocation</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.shares.overAllocatedShares)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Options + RSU Outstanding</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{formatShares(capTableView.shares.equityInstrumentsOutstanding)}</p>
              </div>
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-slate-900">Ownership Table</h3>
              {capTableView.ownershipTable.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No ownership rows yet. Record common stock issuance and grants from Operations.</p>
              ) : (
                <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3 pr-4">Holder</th>
                        <th className="px-4 py-3 pr-4">Type</th>
                        <th className="px-4 py-3 pr-4">Shares Owned</th>
                        <th className="px-4 py-3 pr-4">Ownership %</th>
                        <th className="px-4 py-3 pr-4">Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {capTableView.ownershipTable.map((row) => (
                        <tr key={`${row.personId}-${row.shareType}`} className="border-t border-slate-200">
                          <td className="px-4 py-3 pr-4 font-medium text-slate-900">{row.personName}</td>
                          <td className="px-4 py-3 pr-4 text-slate-700">{formatShareType(row.shareType)}</td>
                          <td className="px-4 py-3 pr-4 text-slate-700">{formatShares(row.sharesOwned)}</td>
                          <td className="px-4 py-3 pr-4 text-slate-700">{Number(row.ownershipPercent).toFixed(2)}%</td>
                          <td className="px-4 py-3 pr-4 text-slate-700">${formatShares(row.estimatedValue)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Latest Activity</h3>
            {!dashboard || dashboard.timeline.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No activity yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2 md:grid-cols-2">
                {dashboard.timeline.slice(0, 8).map((event, index) => (
                  <li key={`${event.date}-${event.type}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-slate-500">{event.type}</p>
                    <p className="mt-1 text-sm font-medium text-slate-900">{event.title}</p>
                    <p className="text-xs text-slate-600">{event.subtitle}</p>
                  </li>
                ))}
              </ul>
            )}
          </article>
        </div>
      ) : null}

      {activeTab === 'grants' ? (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Grant Registry</h2>
              <p className="mt-1 text-sm text-slate-600">{grants.length} grants recorded across all plans.</p>
            </div>
            <button
              type="button"
              onClick={openCreateGrantModal}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              Create Grant
            </button>
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
                        <p className="font-medium text-slate-900">
                          {grant.person.legalFirstName} {grant.person.legalLastName}
                        </p>
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
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
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
                          <Link
                            href={`/app/equity/${grant.id}`}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                          >
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
      ) : null}

      {activeTab === 'operations' ? (
        <div className="grid gap-5 xl:grid-cols-[1.2fr_1fr]">
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Pool Plan Management</h2>
                <p className="mt-1 text-sm text-slate-600">Create advisor and management plans and map them in pool configuration.</p>
              </div>
              <button
                type="button"
                onClick={openCreatePlanModal}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
              >
                Add Plan
              </button>
            </div>

            {plans.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">No equity plans yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="pb-2 pr-4">Plan</th>
                      <th className="pb-2 pr-4">Reserved</th>
                      <th className="pb-2 pr-4">Granted</th>
                      <th className="pb-2 pr-4">Remaining</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id} className="border-t border-slate-200">
                        <td className="py-2 pr-4">
                          <p className="font-medium text-slate-900">{plan.code}</p>
                          <p className="text-xs text-slate-500">{plan.name}</p>
                        </td>
                        <td className="py-2 pr-4">{formatShares(plan.reservedShares)}</td>
                        <td className="py-2 pr-4">{formatShares(plan.grantedShares)}</td>
                        <td className="py-2 pr-4">{formatShares(plan.remainingShares ?? plan.reservedShares)}</td>
                        <td className="py-2 pr-4">{plan.status}</td>
                        <td className="py-2 pr-4">
                          <button
                            type="button"
                            onClick={() => startPlanEdit(plan)}
                            className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Ledger Operations</h2>
            <p className="mt-1 text-sm text-slate-600">Record opening balances, stock sales via TRANSFER entries, and corrective transactions through focused dialogs.</p>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={openOpeningBalanceModal}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Add Opening Balance
              </button>
              <button
                type="button"
                onClick={openManualTxnModal}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
              >
                Manual Ledger Entry
              </button>
            </div>

            <div className="mt-4">
              <h3 className="text-sm font-semibold text-slate-900">Recent Ledger Entries</h3>
              {txns.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No ledger entries yet.</p>
              ) : (
                <ul className="mt-2 max-h-[460px] divide-y divide-slate-200 overflow-y-auto">
                  {txns.slice(-40).reverse().map((txn) => (
                    <li key={txn.id} className="py-2 text-sm">
                      <p className="font-medium text-slate-900">
                        #{txn.ledgerSequence} {txn.type} {formatShares(txn.quantity)}
                      </p>
                      <p className="text-slate-600">
                        {new Date(txn.effectiveAt).toLocaleString()} · From: {renderHolder(txn.fromPersonId)} · To:{' '}
                        {renderHolder(txn.toPersonId)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        </div>
      ) : null}

      <Modal
        open={modalView === 'baseShares'}
        title={hasBaseShares ? 'Update Total Available Shares' : 'Set Total Available Shares'}
        description="This sets the overall capitalization denominator for ownership and valuation reporting."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onUpdateCapTableBase}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Total Available Shares</span>
            <input
              name="outstandingShares"
              defaultValue={capTableView.shares.totalAvailableShares}
              placeholder="10000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <button
            type="submit"
            disabled={savingCapTableBase}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {savingCapTableBase ? 'Saving...' : hasBaseShares ? 'Update Total Shares' : 'Set Total Shares'}
          </button>
        </form>
      </Modal>

      <Modal
        open={modalView === 'grant'}
        title={editingGrantId ? 'Edit Grant' : 'Create Grant'}
        description="Manage issuance terms without leaving the registry."
        onClose={cancelGrantEdit}
      >
        <form className="grid gap-3" onSubmit={onSubmitGrant}>
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
                  setGrantForm((prev) => {
                    const nextAwardType = event.target.value as 'OPTION_ISO' | 'OPTION_NSO' | 'RSU';
                    if (nextAwardType === 'RSU') {
                      return {
                        ...prev,
                        awardType: nextAwardType,
                        exercisePrice: '',
                      };
                    }

                    if (prev.exercisePrice.trim()) {
                      return {
                        ...prev,
                        awardType: nextAwardType,
                      };
                    }

                    return {
                      ...prev,
                      awardType: nextAwardType,
                      exercisePrice: defaultExercisePriceFromPerShare(capTableView.valuation.perShareValue),
                    };
                  })
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
                <option value="">Select advisor or management plan</option>
                {availableGrantPlans.map((plan) => {
                  const inAdvisorPool = advisorPoolPlanIds.has(plan.id);
                  const inManagementPool = managementPoolPlanIds.has(plan.id);
                  const poolLabel = inAdvisorPool
                    ? inManagementPool
                      ? 'Advisor + Management'
                      : 'Advisor'
                    : inManagementPool
                      ? 'Management'
                      : 'Unmapped';

                  return (
                    <option key={plan.id} value={plan.id}>
                      {plan.code} - {plan.name}
                      {configuredPoolPlanIds.size > 0 ? ` (${poolLabel})` : ''}
                    </option>
                  );
                })}
              </select>
              {configuredPoolPlanIds.size > 0 && availableGrantPlans.length === 0 ? (
                <p className="text-[11px] normal-case tracking-normal text-amber-700">
                  No plans are mapped to advisor or management pools. Update Pool Configuration first.
                </p>
              ) : null}
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

          {grantForm.awardType === 'OPTION_NSO' || grantForm.awardType === 'OPTION_ISO' ? (
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Exercise Price</span>
              <input
                value={grantForm.exercisePrice}
                onChange={(event) => setGrantForm((prev) => ({ ...prev, exercisePrice: event.target.value }))}
                placeholder="1.50"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
              <p className="text-[11px] normal-case tracking-normal text-slate-500">
                Defaulted from current EV/share ({formatShares(capTableView.valuation.perShareValue)}).
              </p>
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

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingGrant || people.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingGrant ? 'Saving...' : editingGrantId ? 'Update Grant' : 'Create Grant'}
            </button>
            <button
              type="button"
              onClick={cancelGrantEdit}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalView === 'poolConfig'}
        title="Pool Configuration"
        description="Define advisor and management pool sizes, then map plans. Grants can use either advisor or management plans."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onSavePoolConfig}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Advisor Pool Shares</span>
              <input
                value={poolConfigForm.advisorPoolShares}
                onChange={(event) =>
                  setPoolConfigForm((prev) => ({
                    ...prev,
                    advisorPoolShares: event.target.value,
                  }))
                }
                placeholder="1000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Management Pool Shares</span>
              <input
                value={poolConfigForm.managementPoolShares}
                onChange={(event) =>
                  setPoolConfigForm((prev) => ({
                    ...prev,
                    managementPoolShares: event.target.value,
                  }))
                }
                placeholder="1000000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Advisor Plans</p>
            <div className="mt-2 grid gap-2">
              {plans.length === 0 ? (
                <p className="text-xs text-slate-500">No plans yet.</p>
              ) : (
                plans.map((plan) => (
                  <label key={`advisor-${plan.id}`} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={poolConfigForm.advisorPlanIds.includes(plan.id)}
                      onChange={(event) =>
                        setPoolConfigForm((prev) => ({
                          ...prev,
                          advisorPlanIds: event.target.checked
                            ? [...prev.advisorPlanIds, plan.id]
                            : prev.advisorPlanIds.filter((id) => id !== plan.id),
                        }))
                      }
                    />
                    <span>{plan.code} - {plan.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Management Plans</p>
            <div className="mt-2 grid gap-2">
              {plans.length === 0 ? (
                <p className="text-xs text-slate-500">No plans yet.</p>
              ) : (
                plans.map((plan) => (
                  <label key={`mgmt-${plan.id}`} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={poolConfigForm.managementPlanIds.includes(plan.id)}
                      onChange={(event) =>
                        setPoolConfigForm((prev) => ({
                          ...prev,
                          managementPlanIds: event.target.checked
                            ? [...prev.managementPlanIds, plan.id]
                            : prev.managementPlanIds.filter((id) => id !== plan.id),
                        }))
                      }
                    />
                    <span>{plan.code} - {plan.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingPoolConfig}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingPoolConfig ? 'Saving...' : 'Save Pool Configuration'}
            </button>
            <button
              type="button"
              onClick={() => setModalView(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalView === 'plan'}
        title={planForm.planId ? 'Edit Option Pool' : 'Create Option Pool'}
        description="Adjust reserved share capacity and plan status."
        onClose={resetPlanEditor}
      >
        <form className="grid gap-3" onSubmit={onSavePlan}>
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
            <button
              type="button"
              onClick={resetPlanEditor}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalView === 'openingBalance'}
        title="Add Opening Holder Balance"
        description="Use this for initial cap table onboarding values."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onRecordOpeningBalance}>
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
              <input
                name="quantity"
                placeholder="500000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Effective Date</span>
              <input
                name="effectiveDate"
                type="date"
                defaultValue={dateInputToday()}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Common Stock Type</span>
            <select
              name="commonStockType"
              defaultValue="FOUNDER"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            >
              <option value="FOUNDER">Founder Common</option>
              <option value="SAFE">SAFE Conversion</option>
              <option value="PREFERRED">Preferred Conversion</option>
              <option value="OTHER">Other Common</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Reason</span>
            <input
              name="reason"
              placeholder="Opening cap table balance"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingOpeningBalance || people.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingOpeningBalance ? 'Saving...' : 'Record Opening Balance'}
            </button>
            <button
              type="button"
              onClick={() => setModalView(null)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={modalView === 'manualTxn'}
        title="Manual Ledger Entry"
        description="Use this for corrective entries and edge-case adjustments."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onCreateManualTxn}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Transaction Type</span>
              <select
                name="type"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
                {['ISSUE', 'VEST', 'EXERCISE', 'CANCEL', 'TRANSFER', 'CONVERT', 'SPLIT', 'REVERSE', 'CORRECT'].map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Effective Date and Time</span>
              <input
                name="effectiveAt"
                type="datetime-local"
                defaultValue={new Date().toISOString().slice(0, 16)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Quantity</span>
              <input
                name="quantity"
                placeholder="1000"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Unit Price</span>
              <input
                name="unitPrice"
                placeholder="Optional"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>From Holder</span>
              <select
                name="fromPersonId"
                defaultValue={companyTreasuryValue}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
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
              <select
                name="toPersonId"
                defaultValue={companyTreasuryValue}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
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
            <span>Instrument Type</span>
            <select
              name="instrumentType"
              defaultValue="COMMON_OTHER"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            >
              <option value="COMMON_FOUNDER">Common - Founder</option>
              <option value="COMMON_SAFE">Common - SAFE Conversion</option>
              <option value="COMMON_PREFERRED">Common - Preferred Conversion</option>
              <option value="COMMON_OTHER">Common - Other</option>
              <option value="OPTION_ISO">Option - ISO</option>
              <option value="OPTION_NSO">Option - NSO</option>
              <option value="RSU">RSU</option>
            </select>
          </label>

          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Reason</span>
            <input
              name="reason"
              placeholder="Why this entry is needed"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={savingTxn}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {savingTxn ? 'Saving...' : 'Record Transaction'}
            </button>
            <button
              type="button"
              onClick={() => setModalView(null)}
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
