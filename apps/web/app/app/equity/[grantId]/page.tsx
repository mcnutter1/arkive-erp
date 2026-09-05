"use client";

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Modal } from '../../_components/modal';
import { PageHero } from '../../_components/page-hero';
import { readApiError } from '../../_utils/read-api-error';

type GrantDetailResponse = {
  grant: {
    id: string;
    personId: string;
    awardType: string;
    quantity: string;
    exercisePrice: string | null;
    currency: string;
    grantDate: string | null;
    expirationDate: string | null;
    status: string;
    person: {
      id: string;
      legalFirstName: string;
      legalLastName: string;
      primaryEmail: string | null;
    };
    plan: {
      id: string;
      code: string;
      name: string;
      reservedShares: string;
    } | null;
    vestingSchedules: Array<{
      id: string;
      startDate: string;
      cliffMonths: number;
      durationMonths: number;
      intervalMonths: number;
      paused: boolean;
    }>;
    exerciseRequests: Array<{
      id: string;
      quantity: string;
      status: string;
      requestedAt: string;
      approvedAt: string | null;
      completedAt: string | null;
      notes: string | null;
    }>;
    equityTxns: Array<{
      id: string;
      type: string;
      quantity: string;
      effectiveAt: string;
      reason: string | null;
      ledgerSequence: string;
    }>;
    terminations: Array<{
      id: string;
      terminatedAt: string;
      vestedQuantityAtEnd: string | null;
      unvestedQuantityAtEnd: string | null;
      postTerminationExerciseBy: string | null;
      overrideReason: string | null;
    }>;
  };
  vestingPreview:
    | {
        vestedQuantity: string;
        unvestedQuantity: string;
        elapsedIntervals: number;
        totalIntervals: number;
      }
    | null;
  exercisedQuantity: string;
  remainingQuantity: string;
};

type LetterPayload = {
  title: string;
  fileName: string;
  mimeType: string;
  content: string;
  defaultParticipants: Array<{
    personId: string;
    role: string;
    signingOrder: number;
  }>;
  eSignConfigured: boolean;
};

type PeopleResponse = {
  data: Array<{
    id: string;
    legalFirstName: string;
    legalLastName: string;
    primaryEmail: string | null;
  }>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

function formatShares(value: string | null | undefined): string {
  if (!value) {
    return '0';
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

async function sha256HexBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function GrantDetailPage() {
  const params = useParams<{ grantId: string }>();
  const grantId = String(params.grantId ?? '');

  const [detail, setDetail] = useState<GrantDetailResponse | null>(null);
  const [people, setPeople] = useState<PeopleResponse['data']>([]);
  const [letter, setLetter] = useState<LetterPayload | null>(null);
  const [asOf, setAsOf] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [signatoryPersonId, setSignatoryPersonId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingExercise, setSavingExercise] = useState(false);
  const [savingLetter, setSavingLetter] = useState(false);
  const [savingESign, setSavingESign] = useState(false);
  const [exerciseModalOpen, setExerciseModalOpen] = useState(false);
  const [vestingModalOpen, setVestingModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const recipientName = useMemo(() => {
    if (!detail) {
      return '';
    }
    return `${detail.grant.person.legalFirstName} ${detail.grant.person.legalLastName}`;
  }, [detail]);

  const signatoryOptions = useMemo(
    () => people.filter((person) => person.id !== detail?.grant.personId),
    [people, detail?.grant.personId],
  );

  async function loadPageData() {
    if (!grantId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const query = asOf ? `?asOf=${encodeURIComponent(new Date(`${asOf}T00:00:00.000Z`).toISOString())}` : '';
      const [detailResp, peopleResp] = await Promise.all([
        fetch(`${apiBaseUrl}/equity/grants/${grantId}${query}`, { credentials: 'include' }),
        fetch(`${apiBaseUrl}/people?page=1&pageSize=100`, { credentials: 'include' }),
      ]);

      if (!detailResp.ok) {
        setError(await readApiError(detailResp, 'Unable to load grant details.'));
        return;
      }

      if (!peopleResp.ok) {
        setError(await readApiError(peopleResp, 'Unable to load people.'));
        return;
      }

      const detailPayload = (await detailResp.json()) as GrantDetailResponse;
      const peoplePayload = (await peopleResp.json()) as PeopleResponse;

      setDetail(detailPayload);
      setPeople(peoplePayload.data);
    } catch {
      setError('Unable to load grant details.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPageData();
  }, [grantId]);

  async function refreshVesting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await loadPageData();
    setVestingModalOpen(false);
  }

  async function createExerciseRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) {
      return;
    }

    setSavingExercise(true);
    setError(null);
    setNotice(null);

    const form = new FormData(event.currentTarget);
    const quantity = String(form.get('quantity') ?? '').trim();
    const notes = String(form.get('notes') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/equity/lifecycle/exercise-requests`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          grantId: detail.grant.id,
          quantity,
          notes: notes || undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create exercise request.'));
        return;
      }

      event.currentTarget.reset();
      setExerciseModalOpen(false);
      setNotice('Exercise request submitted.');
      await loadPageData();
    } catch {
      setError('Unable to create exercise request.');
    } finally {
      setSavingExercise(false);
    }
  }

  async function runExerciseAction(requestId: string, action: 'approve' | 'decline' | 'cancel' | 'complete') {
    setError(null);
    setNotice(null);

    try {
      let response: Response;
      if (action === 'complete') {
        response = await fetch(`${apiBaseUrl}/equity/lifecycle/exercise-requests/${requestId}/complete`, {
          method: 'POST',
          credentials: 'include',
        });
      } else {
        response = await fetch(`${apiBaseUrl}/equity/lifecycle/exercise-requests/${requestId}/${action}`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: 'Updated from grant workflow panel' }),
        });
      }

      if (!response.ok) {
        setError(await readApiError(response, `Unable to ${action} exercise request.`));
        return;
      }

      const actionLabel =
        action === 'approve'
          ? 'approved'
          : action === 'decline'
            ? 'declined'
            : action === 'cancel'
              ? 'canceled'
              : 'completed';
      setNotice(`Exercise request ${actionLabel}.`);
      await loadPageData();
    } catch {
      setError(`Unable to ${action} exercise request.`);
    }
  }

  async function generateLetter() {
    if (!detail) {
      return;
    }

    setSavingLetter(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/equity/grants/${detail.grant.id}/letter`, {
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to generate grant letter.'));
        return;
      }

      const payload = (await response.json()) as LetterPayload;
      setLetter(payload);

      const signatory = payload.defaultParticipants.find((p) => p.role === 'Company Signatory');
      if (signatory) {
        setSignatoryPersonId(signatory.personId);
      }

      setNotice('Grant letter generated.');
    } catch {
      setError('Unable to generate grant letter.');
    } finally {
      setSavingLetter(false);
    }
  }

  function downloadLetter() {
    if (!letter) {
      return;
    }

    const blob = new Blob([letter.content], { type: letter.mimeType || 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = letter.fileName || 'grant-letter.md';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function createESignPackage() {
    if (!detail) {
      return;
    }

    if (!letter) {
      setError('Generate a grant letter first.');
      return;
    }

    if (!signatoryPersonId) {
      setError('Select a company signatory.');
      return;
    }

    setSavingESign(true);
    setError(null);
    setNotice(null);

    try {
      const letterBlob = new Blob([letter.content], { type: letter.mimeType || 'text/markdown' });

      const createDocResp = await fetch(`${apiBaseUrl}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: letter.title,
          category: 'grant-letter',
          personId: detail.grant.personId,
        }),
      });

      if (!createDocResp.ok) {
        setError(await readApiError(createDocResp, 'Unable to create grant-letter document.'));
        return;
      }

      const documentPayload = (await createDocResp.json()) as { id: string };

      const uploadUrlResp = await fetch(`${apiBaseUrl}/documents/upload-url`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mimeType: letter.mimeType || 'text/markdown', byteSize: letterBlob.size }),
      });

      if (!uploadUrlResp.ok) {
        setError(await readApiError(uploadUrlResp, 'Unable to create upload URL for grant letter.'));
        return;
      }

      const uploadPayload = (await uploadUrlResp.json()) as { key: string; url: string };
      const putResp = await fetch(uploadPayload.url, {
        method: 'PUT',
        headers: {
          'Content-Type': letter.mimeType || 'text/markdown',
        },
        body: letterBlob,
      });

      if (!putResp.ok) {
        setError('Grant-letter file upload failed.');
        return;
      }

      const hash = await sha256HexBlob(letterBlob);
      const finalizeResp = await fetch(`${apiBaseUrl}/documents/${documentPayload.id}/versions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          storageKey: uploadPayload.key,
          sha256: hash,
          mimeType: letter.mimeType || 'text/markdown',
          byteSize: letterBlob.size,
        }),
      });

      if (!finalizeResp.ok) {
        setError(await readApiError(finalizeResp, 'Unable to finalize grant-letter version.'));
        return;
      }

      const versionPayload = (await finalizeResp.json()) as { id: string };

      const signatureResp = await fetch(`${apiBaseUrl}/signatures/requests`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: documentPayload.id,
          documentVersionId: versionPayload.id,
          title: `${letter.title} - Signature Packet`,
          signingOrderRequired: true,
          participants: [
            {
              personId: detail.grant.personId,
              role: 'Recipient',
              signingOrder: 1,
            },
            {
              personId: signatoryPersonId,
              role: 'Company Signatory',
              signingOrder: 2,
            },
          ],
        }),
      });

      if (!signatureResp.ok) {
        setError(await readApiError(signatureResp, 'Unable to create e-sign request.'));
        return;
      }

      setNotice('Grant letter document and e-sign request created. Signers can complete signatures from the Portal inbox.');
    } catch {
      setError('Unable to create e-sign package for grant letter.');
    } finally {
      setSavingESign(false);
    }
  }

  if (loading) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-slate-600">Loading grant details...</section>;
  }

  if (!detail) {
    return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm text-sm text-rose-700">{error ?? 'Grant not found.'}</section>;
  }

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Grant Lifecycle"
        title="Grant Detail"
        description={`${detail.grant.awardType} award for ${recipientName}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setExerciseModalOpen(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              New Exercise Request
            </button>
            <button
              type="button"
              onClick={() => void generateLetter()}
              disabled={savingLetter}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {savingLetter ? 'Generating...' : 'Generate Letter'}
            </button>
            <button
              type="button"
              onClick={() => setVestingModalOpen(true)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Recalculate Vesting
            </button>
            <Link href="/app/equity" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100">
              Back to Equity
            </Link>
          </>
        }
      />

      <article className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2 xl:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Granted</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(detail.grant.quantity)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Exercised</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(detail.exercisedQuantity)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Remaining</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShares(detail.remainingQuantity)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">Exercise Price</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">
            {detail.grant.exercisePrice ? `${formatShares(detail.grant.exercisePrice)} ${detail.grant.currency}` : 'N/A'}
          </p>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Vesting Preview</h2>
          <button
            type="button"
            onClick={() => setVestingModalOpen(true)}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Adjust As Of Date
          </button>

          {detail.vestingPreview ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Vested</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(detail.vestingPreview.vestedQuantity)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs uppercase tracking-wide text-slate-500">Unvested</p>
                <p className="mt-1 text-lg font-semibold text-slate-900">{formatShares(detail.vestingPreview.unvestedQuantity)}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 md:col-span-2">
                <p className="text-xs uppercase tracking-wide text-slate-500">Intervals</p>
                <p className="mt-1 text-sm font-medium text-slate-900">
                  {detail.vestingPreview.elapsedIntervals} of {detail.vestingPreview.totalIntervals}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-600">No vesting schedule found.</p>
          )}
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Exercise Workflow</h2>
          <p className="mt-1 text-xs text-slate-500">Submit quantity and optional notes, then manage approvals from the request list.</p>
          <button
            type="button"
            onClick={() => setExerciseModalOpen(true)}
            className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Create Exercise Request
          </button>

          <div className="mt-4 space-y-3">
            {detail.grant.exerciseRequests.length === 0 ? (
              <p className="text-sm text-slate-600">No exercise requests for this grant.</p>
            ) : (
              detail.grant.exerciseRequests.map((request) => (
                <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">{formatShares(request.quantity)} · {request.status}</p>
                  <p className="text-xs text-slate-500">Requested {new Date(request.requestedAt).toLocaleString()}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {request.status === 'SUBMITTED' ? (
                      <>
                        <button type="button" onClick={() => void runExerciseAction(request.id, 'approve')} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Approve</button>
                        <button type="button" onClick={() => void runExerciseAction(request.id, 'decline')} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Decline</button>
                      </>
                    ) : null}
                    {(request.status === 'SUBMITTED' || request.status === 'APPROVED') ? (
                      <button type="button" onClick={() => void runExerciseAction(request.id, 'cancel')} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Cancel</button>
                    ) : null}
                    {request.status === 'APPROVED' ? (
                      <button type="button" onClick={() => void runExerciseAction(request.id, 'complete')} className="rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50">Complete</button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </div>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Grant Letter and E-Sign</h2>
        <p className="mt-1 text-sm text-slate-600">
          Generate a letter for this grant, then create a document and signature request packet.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => void generateLetter()} disabled={savingLetter} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {savingLetter ? 'Generating...' : 'Generate Grant Letter'}
          </button>
          <button type="button" onClick={downloadLetter} disabled={!letter} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-60">
            Download Letter
          </button>
        </div>

        {letter ? (
          <>
            <p className="mt-3 text-xs text-slate-600">
              E-sign integration status: {letter.eSignConfigured ? 'configured' : 'not configured (native flow still available)'}.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Company Signatory</label>
                <select
                  value={signatoryPersonId}
                  onChange={(event) => setSignatoryPersonId(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select signatory</option>
                  {signatoryOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.legalFirstName} {person.legalLastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="button" onClick={() => void createESignPackage()} disabled={savingESign || !signatoryPersonId} className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
                  {savingESign ? 'Creating...' : 'Create E-Sign Packet'}
                </button>
              </div>
            </div>
            <textarea value={letter.content} readOnly className="mt-4 min-h-64 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
          </>
        ) : null}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Ledger Entries for This Grant</h2>
        {detail.grant.equityTxns.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No transactions yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {detail.grant.equityTxns.map((txn) => (
              <li key={txn.id} className="py-2 text-sm">
                <p className="font-medium text-slate-900">#{txn.ledgerSequence} {txn.type} {txn.quantity}</p>
                <p className="text-slate-600">{new Date(txn.effectiveAt).toLocaleString()} · {txn.reason ?? 'No reason'}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <Modal
        open={exerciseModalOpen}
        title="Create Exercise Request"
        description="Submit quantity and optional notes for this grant."
        onClose={() => setExerciseModalOpen(false)}
      >
        <form className="grid gap-3" onSubmit={createExerciseRequest}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Exercise Quantity</span>
            <input name="quantity" required placeholder="1000" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Notes</span>
            <input name="notes" placeholder="Optional context" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <div className="flex gap-2">
            <button type="submit" disabled={savingExercise} className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
              {savingExercise ? 'Submitting...' : 'Create Exercise Request'}
            </button>
            <button
              type="button"
              onClick={() => setExerciseModalOpen(false)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        open={vestingModalOpen}
        title="Recalculate Vesting"
        description="Set an as-of date to refresh vested and unvested quantities."
        onClose={() => setVestingModalOpen(false)}
      >
        <form className="grid gap-3" onSubmit={refreshVesting}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>As Of Date</span>
            <input
              type="date"
              value={asOf}
              onChange={(event) => setAsOf(event.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
              Recalculate
            </button>
            <button
              type="button"
              onClick={() => setVestingModalOpen(false)}
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
