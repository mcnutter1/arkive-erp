"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Modal } from '../../_components/modal';
import { PageHero } from '../../_components/page-hero';
import { readApiError } from '../../_utils/read-api-error';

type PersonDetailsResponse = {
  person: {
    id: string;
    legalFirstName: string;
    legalLastName: string;
    preferredName: string | null;
    primaryEmail: string | null;
    businessEmail: string | null;
    classification: string | null;
    employmentStatus: string | null;
    timezone: string;
  };
  account: {
    id: string;
    email: string;
    status: string;
    localUsername: string | null;
    microsoftUserId: string | null;
    roleCodes: string[];
    roleNames: string[];
  } | null;
  blockers: {
    engagements: number;
    grants: number;
    exerciseRequests: number;
    documents: number;
    signatureParticipants: number;
    provisioningJobs: number;
  };
  canDeletePerson: boolean;
  related: {
    engagements: Array<{
      id: string;
      kind: string;
      status: string;
      title: string | null;
      department: string | null;
      startDate: string | null;
      endDate: string | null;
      workLocation: string | null;
      createdAt: string;
      updatedAt: string;
    }>;
    documents: Array<{
      id: string;
      title: string;
      category: string;
      status: string;
      legalHold: boolean;
      signatureRequestCount: number;
      canArchive: boolean;
      createdAt: string;
      updatedAt: string;
    }>;
    grants: Array<{
      id: string;
      awardType: string;
      quantity: string | null;
      status: string;
      grantDate: string | null;
      expirationDate: string | null;
      createdAt: string;
      plan: {
        id: string;
        code: string;
        name: string;
      } | null;
    }>;
    exerciseRequests: Array<{
      id: string;
      grantId: string;
      quantity: string | null;
      status: string;
      requestedAt: string;
      approvedAt: string | null;
      completedAt: string | null;
      notes: string | null;
    }>;
    signatureParticipants: Array<{
      id: string;
      role: string;
      status: string;
      signingOrder: number;
      signedAt: string | null;
      createdAt: string;
      signatureRequest: {
        id: string;
        title: string;
        status: string;
        createdAt: string;
      };
    }>;
    provisioningJobs: Array<{
      id: string;
      operation: string;
      status: string;
      requestedUsername: string | null;
      requestedEmail: string | null;
      attempts: number;
      lastError: string | null;
      createdAt: string;
      updatedAt: string;
      canRemove: boolean;
    }>;
  };
};

type EditableEngagement = {
  id: string;
  status: string;
  department: string;
  title: string;
  startDate: string;
  endDate: string;
  workLocation: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';
const engagementStatuses = ['DRAFT', 'PREBOARDING', 'ACTIVE', 'PAUSED', 'OFFBOARDING', 'TERMINATED', 'ALUMNI'];

function labelFromToken(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  return value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'N/A';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString();
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

function toDayStartIso(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }

  return parsed.toISOString();
}

export default function PersonDetailsPage() {
  const params = useParams<{ personId: string }>();
  const personId = String(params.personId ?? '');

  const [details, setDetails] = useState<PersonDetailsResponse | null>(null);
  const [editingEngagement, setEditingEngagement] = useState<EditableEngagement | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingEngagement, setSavingEngagement] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const blockerRows = useMemo(() => {
    if (!details) {
      return [];
    }

    return [
      { key: 'engagements', label: 'Engagements', count: details.blockers.engagements },
      { key: 'grants', label: 'Grants', count: details.blockers.grants },
      { key: 'exerciseRequests', label: 'Exercise Requests', count: details.blockers.exerciseRequests },
      { key: 'documents', label: 'Documents', count: details.blockers.documents },
      { key: 'signatureParticipants', label: 'Signature Participants', count: details.blockers.signatureParticipants },
      { key: 'provisioningJobs', label: 'M365 Provisioning Jobs', count: details.blockers.provisioningJobs },
    ];
  }, [details]);

  async function loadDetails(options?: { silent?: boolean }) {
    if (!personId) {
      return;
    }

    if (options?.silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people/${personId}/details`, {
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load person details.'));
        setDetails(null);
        return;
      }

      const payload = (await response.json()) as PersonDetailsResponse;
      setDetails(payload);
    } catch {
      setError('Unable to load person details.');
      setDetails(null);
    } finally {
      if (options?.silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    void loadDetails();
  }, [personId]);

  function openEditEngagement(engagement: PersonDetailsResponse['related']['engagements'][number]) {
    setEditingEngagement({
      id: engagement.id,
      status: engagement.status,
      department: engagement.department ?? '',
      title: engagement.title ?? '',
      startDate: toDateInputValue(engagement.startDate),
      endDate: toDateInputValue(engagement.endDate),
      workLocation: engagement.workLocation ?? '',
    });
  }

  async function onSaveEngagement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingEngagement) {
      return;
    }

    setSavingEngagement(true);
    setError(null);
    setNotice(null);

    const payload = {
      status: editingEngagement.status,
      department: editingEngagement.department,
      title: editingEngagement.title,
      startDate: toDayStartIso(editingEngagement.startDate),
      endDate: toDayStartIso(editingEngagement.endDate),
      workLocation: editingEngagement.workLocation,
    };

    try {
      const response = await fetch(
        `${apiBaseUrl}/people/${personId}/engagements/${editingEngagement.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to update engagement.'));
        return;
      }

      setNotice('Engagement updated.');
      setEditingEngagement(null);
      await loadDetails({ silent: true });
    } catch {
      setError('Unable to update engagement.');
    } finally {
      setSavingEngagement(false);
    }
  }

  async function onArchiveEngagement(engagementId: string) {
    const confirmed = window.confirm('Archive this engagement?');
    if (!confirmed) {
      return;
    }

    setBusyKey(`engagement:${engagementId}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people/${personId}/engagements/${engagementId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to archive engagement.'));
        return;
      }

      setNotice('Engagement archived.');
      await loadDetails({ silent: true });
    } catch {
      setError('Unable to archive engagement.');
    } finally {
      setBusyKey(null);
    }
  }

  async function onArchiveDocument(documentId: string) {
    const confirmed = window.confirm('Archive this document?');
    if (!confirmed) {
      return;
    }

    setBusyKey(`document:${documentId}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people/${personId}/documents/${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to archive document.'));
        return;
      }

      setNotice('Document archived.');
      await loadDetails({ silent: true });
    } catch {
      setError('Unable to archive document.');
    } finally {
      setBusyKey(null);
    }
  }

  async function onRemoveProvisioningJob(jobId: string) {
    const confirmed = window.confirm('Remove this provisioning job record?');
    if (!confirmed) {
      return;
    }

    setBusyKey(`job:${jobId}`);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/people/${personId}/provisioning-jobs/${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to remove provisioning job.'));
        return;
      }

      setNotice('Provisioning job removed.');
      await loadDetails({ silent: true });
    } catch {
      setError('Unable to remove provisioning job.');
    } finally {
      setBusyKey(null);
    }
  }

  if (loading) {
    return <section className="space-y-4"><p className="text-sm text-slate-600">Loading person details...</p></section>;
  }

  if (!details) {
    return (
      <section className="space-y-4">
        <PageHero
          eyebrow="People"
          title="Person Details"
          description="Review related records and cleanup blockers before deletion or archival."
          actions={<Link href="/app/people" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">Back to People</Link>}
        />
        {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      </section>
    );
  }

  const displayName = details.person.preferredName?.trim() || `${details.person.legalFirstName} ${details.person.legalLastName}`;

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="People"
        title={displayName}
        description="Related records, history blockers, and safe remediation actions for administrators."
        actions={
          <>
            <Link
              href="/app/people"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Back to People
            </Link>
            <button
              type="button"
              onClick={() => void loadDetails({ silent: true })}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </>
        }
      />

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Profile</h2>
          <dl className="mt-3 space-y-2 text-sm text-slate-700">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Legal Name</dt>
              <dd>{details.person.legalFirstName} {details.person.legalLastName}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Primary Email</dt>
              <dd>{details.person.primaryEmail ?? 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Business Email</dt>
              <dd>{details.person.businessEmail ?? 'N/A'}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Classification</dt>
              <dd>{labelFromToken(details.person.classification)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Employment Status</dt>
              <dd>{labelFromToken(details.person.employmentStatus)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Timezone</dt>
              <dd>{details.person.timezone}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Account</h2>
          {details.account ? (
            <dl className="mt-3 space-y-2 text-sm text-slate-700">
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                <dd>{details.account.email}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Status</dt>
                <dd>{labelFromToken(details.account.status)}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Login</dt>
                <dd>{details.account.localUsername ? `Local (${details.account.localUsername})` : details.account.microsoftUserId ? 'Microsoft 365' : 'N/A'}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-slate-500">Roles</dt>
                <dd>{details.account.roleCodes.join(', ') || 'N/A'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-slate-600">No account is linked.</p>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Deletion Readiness</h2>
          <p className={`mt-2 rounded-lg px-3 py-2 text-sm ${details.canDeletePerson ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            {details.canDeletePerson
              ? 'No blockers remain. Person can be deleted.'
              : 'Related records still exist. Archive or resolve them before deleting this person.'}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {blockerRows.map((item) => (
              <li key={item.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                <span>{item.label}</span>
                <span className={`rounded px-2 py-0.5 text-xs font-semibold ${item.count > 0 ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Engagements</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Editable</span>
        </div>
        {details.related.engagements.length === 0 ? <p className="mt-3 text-sm text-slate-600">No engagements.</p> : (
          <ul className="mt-3 space-y-3">
            {details.related.engagements.map((engagement) => (
              <li key={engagement.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      {labelFromToken(engagement.kind)} · {labelFromToken(engagement.status)}
                    </p>
                    <p className="text-slate-600">
                      {engagement.title || 'No title'} · {engagement.department || 'No department'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatDate(engagement.startDate)} - {formatDate(engagement.endDate)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => openEditEngagement(engagement)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void onArchiveEngagement(engagement.id)}
                      disabled={busyKey === `engagement:${engagement.id}`}
                      className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {busyKey === `engagement:${engagement.id}` ? 'Archiving...' : 'Archive'}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Documents</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Archive Only</span>
        </div>
        {details.related.documents.length === 0 ? <p className="mt-3 text-sm text-slate-600">No documents.</p> : (
          <ul className="mt-3 space-y-3">
            {details.related.documents.map((document) => {
              const blockingReason = document.legalHold
                ? 'Legal hold is active.'
                : document.signatureRequestCount > 0
                  ? 'Linked signature requests exist.'
                  : '';

              return (
                <li key={document.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{document.title}</p>
                      <p className="text-slate-600">
                        {document.category} · {labelFromToken(document.status)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Signature requests: {document.signatureRequestCount}
                        {document.legalHold ? ' · Legal hold' : ''}
                      </p>
                      {blockingReason ? <p className="text-xs text-amber-700">{blockingReason}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void onArchiveDocument(document.id)}
                      disabled={!document.canArchive || busyKey === `document:${document.id}`}
                      className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {busyKey === `document:${document.id}` ? 'Archiving...' : 'Archive'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">M365 Provisioning Jobs</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Cleanup Allowed For Draft/Failed/Canceled</span>
        </div>
        {details.related.provisioningJobs.length === 0 ? <p className="mt-3 text-sm text-slate-600">No provisioning jobs.</p> : (
          <ul className="mt-3 space-y-3">
            {details.related.provisioningJobs.map((job) => (
              <li key={job.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">{labelFromToken(job.operation)} · {labelFromToken(job.status)}</p>
                    <p className="text-xs text-slate-500">
                      Requested username: {job.requestedUsername ?? 'N/A'} · Requested email: {job.requestedEmail ?? 'N/A'}
                    </p>
                    {job.lastError ? <p className="text-xs text-rose-700">{job.lastError}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void onRemoveProvisioningJob(job.id)}
                    disabled={!job.canRemove || busyKey === `job:${job.id}`}
                    className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {busyKey === `job:${job.id}` ? 'Removing...' : 'Remove'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Grant Awards</h2>
          <p className="mt-1 text-xs text-slate-500">History records are read-only in this view.</p>
          {details.related.grants.length === 0 ? <p className="mt-3 text-sm text-slate-600">No grants.</p> : (
            <ul className="mt-3 space-y-3">
              {details.related.grants.map((grant) => (
                <li key={grant.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">{labelFromToken(grant.awardType)} · {labelFromToken(grant.status)}</p>
                      <p className="text-slate-600">Quantity: {grant.quantity ?? 'N/A'}</p>
                      <p className="text-xs text-slate-500">Grant date: {formatDate(grant.grantDate)}</p>
                    </div>
                    <Link
                      href={`/app/equity/${grant.id}`}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      Open Grant
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Exercise Requests</h2>
          <p className="mt-1 text-xs text-slate-500">Use Equity workflows to change lifecycle state.</p>
          {details.related.exerciseRequests.length === 0 ? <p className="mt-3 text-sm text-slate-600">No exercise requests.</p> : (
            <ul className="mt-3 space-y-3">
              {details.related.exerciseRequests.map((request) => (
                <li key={request.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">{labelFromToken(request.status)} · {request.quantity ?? 'N/A'} shares</p>
                  <p className="text-xs text-slate-500">Requested: {formatDate(request.requestedAt)} · Grant: {request.grantId}</p>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Signature Participants</h2>
        <p className="mt-1 text-xs text-slate-500">Signed packet history is immutable from people management.</p>
        {details.related.signatureParticipants.length === 0 ? <p className="mt-3 text-sm text-slate-600">No signature participant records.</p> : (
          <ul className="mt-3 space-y-3">
            {details.related.signatureParticipants.map((participant) => (
              <li key={participant.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-medium text-slate-900">{participant.signatureRequest.title}</p>
                <p className="text-slate-600">
                  {labelFromToken(participant.role)} · {labelFromToken(participant.status)} · Order {participant.signingOrder}
                </p>
                <p className="text-xs text-slate-500">Signed at: {formatDate(participant.signedAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <Modal
        open={Boolean(editingEngagement)}
        title="Edit Engagement"
        description="Update engagement profile fields or archive it from this screen."
        onClose={() => setEditingEngagement(null)}
      >
        {editingEngagement ? (
          <form className="grid gap-3" onSubmit={onSaveEngagement}>
            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Status</span>
              <select
                value={editingEngagement.status}
                onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, status: event.target.value } : previous)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              >
                {engagementStatuses.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Title</span>
              <input
                value={editingEngagement.title}
                onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, title: event.target.value } : previous)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>

            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Department</span>
              <input
                value={editingEngagement.department}
                onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, department: event.target.value } : previous)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>

            <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
              <span>Work Location</span>
              <input
                value={editingEngagement.workLocation}
                onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, workLocation: event.target.value } : previous)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Start Date</span>
                <input
                  type="date"
                  value={editingEngagement.startDate}
                  onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, startDate: event.target.value } : previous)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>
              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>End Date</span>
                <input
                  type="date"
                  value={editingEngagement.endDate}
                  onChange={(event) => setEditingEngagement((previous) => previous ? { ...previous, endDate: event.target.value } : previous)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={savingEngagement}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {savingEngagement ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditingEngagement(null)}
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
