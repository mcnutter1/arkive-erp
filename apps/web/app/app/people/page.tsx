"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Modal } from '../_components/modal';
import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

type Address = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
};

type EmergencyContact = {
  name?: string;
  relationship?: string;
  phone?: string;
  email?: string;
};

type Compensation = {
  payFrequency?: string;
  annualSalary?: string;
  hourlyRate?: string;
  currency?: string;
};

type GovernmentIds = {
  employeeId?: string;
  nationalIdLast4?: string;
  taxIdLast4?: string;
};

type WorkInfo = {
  jobTitle?: string;
  department?: string;
  managerName?: string;
  workLocation?: string;
  companySignatory?: boolean;
};

type PersonHrisProfile = {
  legalMiddleName?: string;
  displayName?: string;
  personalEmail?: string;
  phoneNumber?: string;
  dateOfBirth?: string;
  gender?: string;
  maritalStatus?: string;
  nationality?: string;
  citizenshipStatus?: string;
  homeAddress?: Address;
  mailingAddress?: Address;
  emergencyContact?: EmergencyContact;
  compensation?: Compensation;
  governmentIds?: GovernmentIds;
  workInfo?: WorkInfo;
  skills?: string[];
  notes?: string;
};

type Person = {
  id: string;
  legalFirstName: string;
  legalLastName: string;
  preferredName: string | null;
  primaryEmail: string | null;
  businessEmail: string | null;
  timezone: string;
  classification: string | null;
  employmentStatus: string | null;
  hrisProfile: unknown;
};

type PeopleResponse = {
  data: Person[];
  page: number;
  pageSize: number;
  total: number;
};

type CreatePersonForm = {
  legalFirstName: string;
  legalLastName: string;
  preferredName: string;
  primaryEmail: string;
  businessEmail: string;
  classification: string;
  employmentStatus: string;
  timezone: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

const engagementKinds = ['EMPLOYEE', 'CONTRACTOR', 'ADVISOR', 'DIRECTOR', 'INTERN', 'CONSULTANT', 'OTHER'];
const engagementStatuses = ['DRAFT', 'PREBOARDING', 'ACTIVE', 'PAUSED', 'OFFBOARDING', 'TERMINATED', 'ALUMNI'];
type PeopleModalView = 'createPerson' | 'createEngagement' | 'editProfile' | null;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function readArray(record: Record<string, unknown>, key: string): string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function readBoolean(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

function compactObject(input: Record<string, unknown>): Record<string, unknown> | undefined {
  const entries = Object.entries(input).filter(([, value]) => {
    if (value === undefined || value === null || value === '') {
      return false;
    }

    if (Array.isArray(value)) {
      return value.length > 0;
    }

    if (typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).length > 0;
    }

    return true;
  });

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

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

function defaultCreatePersonForm(): CreatePersonForm {
  return {
    legalFirstName: '',
    legalLastName: '',
    preferredName: '',
    primaryEmail: '',
    businessEmail: '',
    classification: '',
    employmentStatus: 'ACTIVE',
    timezone: 'UTC',
  };
}

export default function PeoplePage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [query, setQuery] = useState('');
  const [selectedPersonId, setSelectedPersonId] = useState('');

  const [createPersonForm, setCreatePersonForm] = useState<CreatePersonForm>(defaultCreatePersonForm());

  const [loading, setLoading] = useState(false);
  const [savingPerson, setSavingPerson] = useState(false);
  const [savingEngagement, setSavingEngagement] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [deletingPersonId, setDeletingPersonId] = useState<string | null>(null);
  const [modalView, setModalView] = useState<PeopleModalView>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (query.trim()) {
      params.set('search', query.trim());
    }
    return params.toString();
  }, [query]);

  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedPersonId) ?? null,
    [people, selectedPersonId],
  );

  const selectedProfile = useMemo<PersonHrisProfile>(() => {
    if (!selectedPerson) {
      return {};
    }

    const raw = asObject(selectedPerson.hrisProfile);
    return {
      legalMiddleName: readString(raw, 'legalMiddleName'),
      displayName: readString(raw, 'displayName'),
      personalEmail: readString(raw, 'personalEmail'),
      phoneNumber: readString(raw, 'phoneNumber'),
      dateOfBirth: readString(raw, 'dateOfBirth'),
      gender: readString(raw, 'gender'),
      maritalStatus: readString(raw, 'maritalStatus'),
      nationality: readString(raw, 'nationality'),
      citizenshipStatus: readString(raw, 'citizenshipStatus'),
      homeAddress: asObject(raw.homeAddress),
      mailingAddress: asObject(raw.mailingAddress),
      emergencyContact: asObject(raw.emergencyContact),
      compensation: asObject(raw.compensation),
      governmentIds: asObject(raw.governmentIds),
      workInfo: {
        jobTitle: readString(asObject(raw.workInfo), 'jobTitle'),
        department: readString(asObject(raw.workInfo), 'department'),
        managerName: readString(asObject(raw.workInfo), 'managerName'),
        workLocation: readString(asObject(raw.workInfo), 'workLocation'),
        companySignatory: readBoolean(asObject(raw.workInfo), 'companySignatory'),
      },
      skills: readArray(raw, 'skills'),
      notes: readString(raw, 'notes'),
    };
  }, [selectedPerson]);

  async function loadPeople(preferredSelectionId?: string) {
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

      if (payload.data.length === 0) {
        setSelectedPersonId('');
        return;
      }

      const candidate = preferredSelectionId || selectedPersonId;
      if (candidate && payload.data.some((person) => person.id === candidate)) {
        setSelectedPersonId(candidate);
      } else {
        const firstPerson = payload.data[0];
        setSelectedPersonId(firstPerson ? firstPerson.id : '');
      }
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

    try {
      const payload = {
        legalFirstName: createPersonForm.legalFirstName.trim(),
        legalLastName: createPersonForm.legalLastName.trim(),
        preferredName: createPersonForm.preferredName.trim() || undefined,
        primaryEmail: createPersonForm.primaryEmail.trim() || undefined,
        businessEmail: createPersonForm.businessEmail.trim() || undefined,
        classification: createPersonForm.classification.trim() || undefined,
        employmentStatus: createPersonForm.employmentStatus.trim() || undefined,
        timezone: createPersonForm.timezone.trim() || 'UTC',
      };

      const response = await fetch(`${apiBaseUrl}/people`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create person.'));
        return;
      }

      const created = (await response.json()) as { id: string };
      setCreatePersonForm(defaultCreatePersonForm());
      setNotice('Person created. Complete profile details in the profile panel.');
      setModalView(null);
      await loadPeople(created.id);
    } catch {
      setError('Unable to create person.');
    } finally {
      setSavingPerson(false);
    }
  }

  async function onUpdateSelectedPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedPerson) {
      return;
    }

    setSavingProfile(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();

    const skills = read('skills')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    const homeAddress = compactObject({
      line1: read('homeAddressLine1') || undefined,
      line2: read('homeAddressLine2') || undefined,
      city: read('homeAddressCity') || undefined,
      state: read('homeAddressState') || undefined,
      postalCode: read('homeAddressPostalCode') || undefined,
      country: read('homeAddressCountry') || undefined,
    });

    const mailingAddress = compactObject({
      line1: read('mailingAddressLine1') || undefined,
      line2: read('mailingAddressLine2') || undefined,
      city: read('mailingAddressCity') || undefined,
      state: read('mailingAddressState') || undefined,
      postalCode: read('mailingAddressPostalCode') || undefined,
      country: read('mailingAddressCountry') || undefined,
    });

    const emergencyContact = compactObject({
      name: read('emergencyName') || undefined,
      relationship: read('emergencyRelationship') || undefined,
      phone: read('emergencyPhone') || undefined,
      email: read('emergencyEmail') || undefined,
    });

    const compensation = compactObject({
      payFrequency: read('compPayFrequency') || undefined,
      annualSalary: read('compAnnualSalary') || undefined,
      hourlyRate: read('compHourlyRate') || undefined,
      currency: read('compCurrency') || undefined,
    });

    const governmentIds = compactObject({
      employeeId: read('govEmployeeId') || undefined,
      nationalIdLast4: read('govNationalIdLast4') || undefined,
      taxIdLast4: read('govTaxIdLast4') || undefined,
    });

    const workInfo = compactObject({
      jobTitle: read('workJobTitle') || undefined,
      department: read('workDepartment') || undefined,
      managerName: read('workManagerName') || undefined,
      workLocation: read('workLocation') || undefined,
      companySignatory: form.get('workCompanySignatory') === 'on',
    });

    const hrisProfile = compactObject({
      legalMiddleName: read('legalMiddleName') || undefined,
      displayName: read('displayName') || undefined,
      personalEmail: read('personalEmail') || undefined,
      phoneNumber: read('phoneNumber') || undefined,
      dateOfBirth: read('dateOfBirth') || undefined,
      gender: read('gender') || undefined,
      maritalStatus: read('maritalStatus') || undefined,
      nationality: read('nationality') || undefined,
      citizenshipStatus: read('citizenshipStatus') || undefined,
      homeAddress,
      mailingAddress,
      emergencyContact,
      compensation,
      governmentIds,
      workInfo,
      skills,
      notes: read('notes') || undefined,
    });

    const payload = {
      legalFirstName: read('legalFirstName'),
      legalLastName: read('legalLastName'),
      preferredName: read('preferredName') || undefined,
      primaryEmail: read('primaryEmail') || undefined,
      businessEmail: read('businessEmail') || undefined,
      timezone: read('timezone') || undefined,
      classification: read('classification') || undefined,
      employmentStatus: read('employmentStatus') || undefined,
      hrisProfile,
    };

    try {
      const response = await fetch(`${apiBaseUrl}/people/${selectedPerson.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to update person profile.'));
        return;
      }

      setNotice('Person profile updated.');
      setModalView(null);
      await loadPeople(selectedPerson.id);
    } catch {
      setError('Unable to update person profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function onDeletePerson(personId: string) {
    const confirmed = window.confirm('Delete this person record? This only works when no related history exists.');
    if (!confirmed) {
      return;
    }

    setDeletingPersonId(personId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people/${personId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to delete person.'));
        return;
      }

      setNotice('Person archived successfully.');
      await loadPeople();
    } catch {
      setError('Unable to delete person.');
    } finally {
      setDeletingPersonId(null);
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
      setNotice('Engagement created.');
      setModalView(null);
    } catch {
      setError('Unable to create engagement.');
    } finally {
      setSavingEngagement(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="People Ops"
        title="People and HRIS"
        description="Manage directory records, complete HR profiles, and create employment engagements in focused workflows."
        actions={
          <>
            <button
              type="button"
              onClick={() => setModalView('createPerson')}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              New Person
            </button>
            <button
              type="button"
              onClick={() => setModalView('createEngagement')}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              New Engagement
            </button>
            <button
              type="button"
              onClick={() => void loadPeople()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </>
        }
      />

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">People Actions</h2>
          <p className="mt-1 text-sm text-slate-600">
            Launch guided editors for person onboarding, engagement setup, and profile updates.
          </p>

          <div className="mt-4 grid gap-3">
            <button
              type="button"
              onClick={() => setModalView('createPerson')}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800"
            >
              Create Person
            </button>
            <button
              type="button"
              onClick={() => setModalView('createEngagement')}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Create Engagement
            </button>
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Use Edit in the directory table to open the full HRIS profile editor.
            </p>
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-semibold">Person Profile</h2>
            <div className="flex items-center gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <button
                type="button"
                onClick={() => void loadPeople()}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-50"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="pb-2 pr-4">Person</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id} className={`border-t border-slate-200 ${selectedPersonId === person.id ? 'bg-slate-50' : ''}`}>
                    <td className="py-2 pr-4">
                      <p className="font-medium text-slate-900">{person.legalFirstName} {person.legalLastName}</p>
                      <p className="text-xs text-slate-500">{person.primaryEmail ?? person.businessEmail ?? 'No email'}</p>
                    </td>
                    <td className="py-2 pr-4">{person.employmentStatus ?? 'N/A'}</td>
                    <td className="py-2 pr-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPersonId(person.id);
                            setModalView('editProfile');
                          }}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeletePerson(person.id)}
                          disabled={deletingPersonId === person.id}
                          className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                        >
                          {deletingPersonId === person.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!selectedPerson ? (
            <p className="mt-4 text-sm text-slate-600">Select a person to manage full profile details.</p>
          ) : (
            <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Select a person and click Edit to open the full profile editor in a modal.
            </p>
          )}
        </article>
      </div>

      <Modal
        open={modalView === 'createPerson'}
        title="Create Person"
        description="Start a record, then complete full HR profile details."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onCreatePerson}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Legal First Name</span>
              <input
                value={createPersonForm.legalFirstName}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, legalFirstName: event.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Legal Last Name</span>
              <input
                value={createPersonForm.legalLastName}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, legalLastName: event.target.value }))}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Preferred Name</span>
              <input
                value={createPersonForm.preferredName}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, preferredName: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Primary Email</span>
              <input
                type="email"
                value={createPersonForm.primaryEmail}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, primaryEmail: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Business Email</span>
              <input
                type="email"
                value={createPersonForm.businessEmail}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, businessEmail: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Timezone</span>
              <input
                value={createPersonForm.timezone}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, timezone: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Classification</span>
              <input
                value={createPersonForm.classification}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, classification: event.target.value }))}
                placeholder="Full-time, part-time, contractor"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Employment Status</span>
              <input
                value={createPersonForm.employmentStatus}
                onChange={(event) => setCreatePersonForm((prev) => ({ ...prev, employmentStatus: event.target.value }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingPerson}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingPerson ? 'Saving...' : 'Create Person'}
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
        open={modalView === 'createEngagement'}
        title="Create Engagement"
        description="Add an employment or contractor lifecycle record."
        onClose={() => setModalView(null)}
      >
        <form className="grid gap-3" onSubmit={onCreateEngagement}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Person</span>
            <select name="personId" required defaultValue="" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
              <option value="" disabled>
                Select person
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
              <span>Kind</span>
              <select name="kind" defaultValue="EMPLOYEE" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
                {engagementKinds.map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Status</span>
              <select name="status" defaultValue="ACTIVE" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900">
                {engagementStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Department</span>
              <input name="department" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Title</span>
              <input name="title" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Start Date</span>
              <input name="startDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>End Date</span>
              <input name="endDate" type="date" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={savingEngagement || people.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savingEngagement ? 'Saving...' : 'Create Engagement'}
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
        open={modalView === 'editProfile' && Boolean(selectedPerson)}
        title={selectedPerson ? `Edit Profile - ${selectedPerson.legalFirstName} ${selectedPerson.legalLastName}` : 'Edit Profile'}
        description="Update full HRIS, compliance, and compensation details."
        onClose={() => setModalView(null)}
        widthClassName="max-w-6xl"
      >
        {selectedPerson ? (
          <form key={selectedPerson.id} className="grid gap-4" onSubmit={onUpdateSelectedPerson}>
            <h3 className="text-sm font-semibold text-slate-900">Core Identity</h3>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Legal First Name</span>
                <input name="legalFirstName" required defaultValue={selectedPerson.legalFirstName} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Legal Middle Name</span>
                <input name="legalMiddleName" defaultValue={selectedProfile.legalMiddleName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Legal Last Name</span>
                <input name="legalLastName" required defaultValue={selectedPerson.legalLastName} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Preferred Name</span>
                <input name="preferredName" defaultValue={selectedPerson.preferredName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Display Name</span>
                <input name="displayName" defaultValue={selectedProfile.displayName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Date of Birth</span>
                <input name="dateOfBirth" type="date" defaultValue={selectedProfile.dateOfBirth ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <h3 className="text-sm font-semibold text-slate-900">Contact</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Primary Email</span>
                <input name="primaryEmail" type="email" defaultValue={selectedPerson.primaryEmail ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Business Email</span>
                <input name="businessEmail" type="email" defaultValue={selectedPerson.businessEmail ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Personal Email</span>
                <input name="personalEmail" type="email" defaultValue={selectedProfile.personalEmail ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Phone</span>
                <input name="phoneNumber" defaultValue={selectedProfile.phoneNumber ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Timezone</span>
                <input name="timezone" defaultValue={selectedPerson.timezone ?? 'UTC'} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Gender</span>
                <input name="gender" defaultValue={selectedProfile.gender ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <h3 className="text-sm font-semibold text-slate-900">Employment</h3>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Classification</span>
                <input name="classification" defaultValue={selectedPerson.classification ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Employment Status</span>
                <input name="employmentStatus" defaultValue={selectedPerson.employmentStatus ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Employee ID</span>
                <input name="govEmployeeId" defaultValue={selectedProfile.governmentIds?.employeeId ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Job Title</span>
                <input name="workJobTitle" defaultValue={selectedProfile.workInfo?.jobTitle ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Department</span>
                <input name="workDepartment" defaultValue={selectedProfile.workInfo?.department ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Manager Name</span>
                <input name="workManagerName" defaultValue={selectedProfile.workInfo?.managerName ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Work Location</span>
                <input name="workLocation" defaultValue={selectedProfile.workInfo?.workLocation ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              <input
                name="workCompanySignatory"
                type="checkbox"
                defaultChecked={Boolean(selectedProfile.workInfo?.companySignatory)}
              />
              <span>Company Signatory (eligible for company acceptance signatures)</span>
            </label>

            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Pay Frequency</span>
                <input name="compPayFrequency" defaultValue={selectedProfile.compensation?.payFrequency ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Annual Salary</span>
                <input name="compAnnualSalary" defaultValue={selectedProfile.compensation?.annualSalary ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Hourly Rate</span>
                <input name="compHourlyRate" defaultValue={selectedProfile.compensation?.hourlyRate ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Comp Currency</span>
                <input name="compCurrency" defaultValue={selectedProfile.compensation?.currency ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
              </label>
            </div>

            <h3 className="text-sm font-semibold text-slate-900">Address and Emergency</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Home Address</p>
                <input name="homeAddressLine1" defaultValue={selectedProfile.homeAddress?.line1 ?? ''} placeholder="Line 1" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input name="homeAddressLine2" defaultValue={selectedProfile.homeAddress?.line2 ?? ''} placeholder="Line 2" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="homeAddressCity" defaultValue={selectedProfile.homeAddress?.city ?? ''} placeholder="City" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input name="homeAddressState" defaultValue={selectedProfile.homeAddress?.state ?? ''} placeholder="State" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input name="homeAddressPostalCode" defaultValue={selectedProfile.homeAddress?.postalCode ?? ''} placeholder="Postal Code" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                  <input name="homeAddressCountry" defaultValue={selectedProfile.homeAddress?.country ?? ''} placeholder="Country" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                </div>
              </div>

              <div className="grid gap-3 rounded-lg border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emergency Contact</p>
                <input name="emergencyName" defaultValue={selectedProfile.emergencyContact?.name ?? ''} placeholder="Name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input name="emergencyRelationship" defaultValue={selectedProfile.emergencyContact?.relationship ?? ''} placeholder="Relationship" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input name="emergencyPhone" defaultValue={selectedProfile.emergencyContact?.phone ?? ''} placeholder="Phone" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <input name="emergencyEmail" defaultValue={selectedProfile.emergencyContact?.email ?? ''} placeholder="Email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>

            <h3 className="text-sm font-semibold text-slate-900">Compliance and Notes</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Nationality</span>
                <input name="nationality" defaultValue={selectedProfile.nationality ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Citizenship Status</span>
                <input name="citizenshipStatus" defaultValue={selectedProfile.citizenshipStatus ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>National ID Last 4</span>
                <input name="govNationalIdLast4" defaultValue={selectedProfile.governmentIds?.nationalIdLast4 ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Tax ID Last 4</span>
                <input name="govTaxIdLast4" defaultValue={selectedProfile.governmentIds?.taxIdLast4 ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Skills (comma-separated)</span>
              <input name="skills" defaultValue={selectedProfile.skills?.join(', ') ?? ''} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>

            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Notes</span>
              <textarea name="notes" defaultValue={selectedProfile.notes ?? ''} className="min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={savingProfile}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingProfile ? 'Saving...' : 'Save Profile'}
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
        ) : null}
      </Modal>
    </section>
  );
}
