"use client";

import { useSearchParams } from 'next/navigation';
import { PointerEvent, useEffect, useRef, useState } from 'react';

import { Modal } from '../_components/modal';
import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

type PortalSummary = Record<string, unknown>;

type MySignatureParticipant = {
  id: string;
  role: string;
  status: string;
  signingOrder: number;
  signatureRequest: {
    id: string;
    title: string;
    status: string;
    expiresAt: string | null;
    document: {
      id: string;
      title: string;
      category: string;
    };
  };
};

type ParticipantPacket = {
  participant: {
    id: string;
    role: string;
    status: string;
    signingOrder: number;
  };
  request: {
    id: string;
    title: string;
    status: string;
    expiresAt: string | null;
    signingOrderRequired: boolean;
    document: {
      id: string;
      title: string;
      category: string;
    };
    participants: Array<{
      id: string;
      role: string;
      signingOrder: number;
      status: string;
      signedAt: string | null;
      person: {
        id: string;
        legalFirstName: string;
        legalLastName: string;
        primaryEmail: string | null;
      };
    }>;
  };
  documentVersion: {
    id: string;
    mimeType: string;
    byteSize: number;
    sha256: string;
    downloadUrl: string;
  };
};

export default function PortalPage() {
  const searchParams = useSearchParams();
  const participantIdFromQuery = searchParams.get('participantId')?.trim() ?? '';

  const [data, setData] = useState<PortalSummary | null>(null);
  const [signatureRequests, setSignatureRequests] = useState<MySignatureParticipant[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingPacket, setLoadingPacket] = useState(false);
  const [packet, setPacket] = useState<ParticipantPacket | null>(null);
  const [signatureType, setSignatureType] = useState<'DRAWN' | 'TYPED'>('DRAWN');
  const [typedFullName, setTypedFullName] = useState('');
  const [consentText, setConsentText] = useState(
    'I agree to electronically sign this document and acknowledge this signature is legally binding.',
  );
  const [declineReason, setDeclineReason] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [decliningSignature, setDecliningSignature] = useState(false);
  const [drawnHasInk, setDrawnHasInk] = useState(false);
  const [openedDeepLinkParticipantId, setOpenedDeepLinkParticipantId] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  async function loadSummary() {
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/portal/me`, { credentials: 'include' });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load portal summary.'));
        return;
      }
      setData((await response.json()) as PortalSummary);
    } catch {
      setError('Unable to load portal summary.');
    }
  }

  async function loadSignatureRequests() {
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/signatures/my-requests`, { credentials: 'include' });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load signature requests.'));
        return;
      }
      setSignatureRequests((await response.json()) as MySignatureParticipant[]);
    } catch {
      setError('Unable to load signature requests.');
    }
  }

  useEffect(() => {
    void loadSummary();
    void loadSignatureRequests();
  }, []);

  useEffect(() => {
    if (!participantIdFromQuery) {
      return;
    }

    if (openedDeepLinkParticipantId === participantIdFromQuery) {
      return;
    }

    setOpenedDeepLinkParticipantId(participantIdFromQuery);
    void openSigningPacket(participantIdFromQuery);
  }, [participantIdFromQuery, openedDeepLinkParticipantId]);

  useEffect(() => {
    if (!modalOpen || signatureType !== 'DRAWN') {
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(Math.floor(rect.width * dpr), 1);
    canvas.height = Math.max(Math.floor(rect.height * dpr), 1);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.5;
    ctx.clearRect(0, 0, rect.width, rect.height);
    setDrawnHasInk(false);
  }, [modalOpen, signatureType]);

  function closeSigningModal() {
    setModalOpen(false);
    setPacket(null);
    setTypedFullName('');
    setSignatureType('DRAWN');
    setDeclineReason('');
    setDrawnHasInk(false);
    drawingRef.current = false;
  }

  async function openSigningPacket(participantId: string) {
    setLoadingPacket(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/signatures/participants/${participantId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load signature packet.'));
        return;
      }

      const payload = (await response.json()) as ParticipantPacket;
      setPacket(payload);
      const myself = payload.request.participants.find(
        (participant) => participant.id === payload.participant.id,
      );
      setTypedFullName(
        myself ? `${myself.person.legalFirstName} ${myself.person.legalLastName}`.trim() : '',
      );
      setModalOpen(true);
    } catch {
      setError('Unable to load signature packet.');
    } finally {
      setLoadingPacket(false);
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDrawnHasInk(false);
  }

  function pointOnCanvas(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return { x: 0, y: 0 };
    }

    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  function onSignaturePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    const pt = pointOnCanvas(event);
    ctx.beginPath();
    ctx.moveTo(pt.x, pt.y);
  }

  function onSignaturePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) {
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const pt = pointOnCanvas(event);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    setDrawnHasInk(true);
  }

  function onSignaturePointerUp(event: PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  }

  async function submitSignature() {
    if (!packet) {
      return;
    }

    if (!consentText.trim()) {
      setError('Consent text is required.');
      return;
    }

    if (signatureType === 'TYPED' && !typedFullName.trim()) {
      setError('Typed full name is required for typed signatures.');
      return;
    }

    const drawnSignatureDataUrl =
      signatureType === 'DRAWN'
        ? (() => {
            const canvas = canvasRef.current;
            if (!canvas || !drawnHasInk) {
              return null;
            }
            return canvas.toDataURL('image/png');
          })()
        : null;

    if (signatureType === 'DRAWN' && !drawnSignatureDataUrl) {
      setError('Draw a signature before submitting.');
      return;
    }

    setSavingSignature(true);
    setError(null);
    setNotice(null);

    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const locale = navigator.language;
      const response = await fetch(`${apiBaseUrl}/signatures/participants/${packet.participant.id}/sign`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          consentText: consentText.trim(),
          signatureType,
          typedFullName: signatureType === 'TYPED' ? typedFullName.trim() : undefined,
          drawnSignatureDataUrl: signatureType === 'DRAWN' ? drawnSignatureDataUrl : undefined,
          signerLocale: locale,
          signerTimezone: timezone,
          signerDevice: navigator.userAgent,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to sign document.'));
        return;
      }

      const payload = (await response.json()) as {
        artifactCaptured?: boolean;
      };

      setNotice(
        payload.artifactCaptured
          ? 'Signature submitted. Signed document artifact captured in platform records.'
          : 'Signature submitted successfully.',
      );
      closeSigningModal();
      await loadSummary();
      await loadSignatureRequests();
    } catch {
      setError('Unable to sign document.');
    } finally {
      setSavingSignature(false);
    }
  }

  async function declineSignature() {
    if (!packet) {
      return;
    }

    if (!declineReason.trim()) {
      setError('Decline reason is required.');
      return;
    }

    setDecliningSignature(true);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`${apiBaseUrl}/signatures/participants/${packet.participant.id}/decline`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: declineReason.trim() }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to decline signature request.'));
        return;
      }

      setNotice('Signature request declined.');
      closeSigningModal();
      await loadSummary();
      await loadSignatureRequests();
    } catch {
      setError('Unable to decline signature request.');
    } finally {
      setDecliningSignature(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Self Service"
        title="My Portal"
        description="Review pending packets and sign from phone or desktop using typed or drawn signatures."
        actions={
          <button
            type="button"
            onClick={() => {
              void loadSummary();
              void loadSignatureRequests();
            }}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
          >
            Refresh
          </button>
        }
      />

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      {notice ? <p className="text-sm text-emerald-700">{notice}</p> : null}

      <div className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Signature Inbox</h2>
          <p className="mt-1 text-sm text-slate-600">Sign requests in order. Evidence records include IP and locale binding signals.</p>

          <div className="mt-4 space-y-3">
            {signatureRequests.length === 0 ? (
              <p className="text-sm text-slate-600">No signature requests assigned to you.</p>
            ) : (
              signatureRequests.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-semibold text-slate-900">{item.signatureRequest.title}</p>
                  <p className="mt-1 text-xs text-slate-600">
                    Role: {item.role} · Status: {item.status} · Document: {item.signatureRequest.document.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Request Status: {item.signatureRequest.status}
                    {item.signatureRequest.expiresAt ? ` · Expires ${new Date(item.signatureRequest.expiresAt).toLocaleString()}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={loadingPacket || item.status === 'SIGNED' || item.status === 'DECLINED'}
                      onClick={() => void openSigningPacket(item.id)}
                      className="rounded-lg bg-slate-900 px-3 py-2 text-xs text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {loadingPacket ? 'Loading...' : item.status === 'SIGNED' ? 'Signed' : 'Open and Sign'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Portal Snapshot</h2>
          {!data ? (
            <p className="mt-3 text-sm text-slate-600">Loading...</p>
          ) : (
            <pre className="mt-3 overflow-x-auto rounded-md bg-slate-50 p-3 text-xs text-slate-700">
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </article>
      </div>

      <Modal
        open={modalOpen}
        title={packet ? `Sign Packet - ${packet.request.title}` : 'Sign Packet'}
        description="Select signature mode, provide consent, and submit your legally binding e-signature."
        onClose={closeSigningModal}
        widthClassName="max-w-5xl"
      >
        {!packet ? null : (
          <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{packet.request.document.title}</p>
                <p className="mt-1 text-xs text-slate-600">
                  Category: {packet.request.document.category} · Packet Status: {packet.request.status}
                </p>
                <a
                  href={packet.documentVersion.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Open Document Version
                </a>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Participants</p>
                <ul className="mt-2 space-y-2">
                  {packet.request.participants.map((participant) => (
                    <li key={participant.id} className="rounded-lg border border-slate-200 p-2 text-xs">
                      <p className="font-medium text-slate-900">
                        {participant.signingOrder}. {participant.person.legalFirstName} {participant.person.legalLastName} ({participant.role})
                      </p>
                      <p className="text-slate-600">
                        {participant.status}
                        {participant.signedAt ? ` · ${new Date(participant.signedAt).toLocaleString()}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Signature Mode</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSignatureType('DRAWN')}
                    className={`rounded-lg px-3 py-2 text-xs ${signatureType === 'DRAWN' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                  >
                    Draw Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignatureType('TYPED')}
                    className={`rounded-lg px-3 py-2 text-xs ${signatureType === 'TYPED' ? 'bg-slate-900 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-100'}`}
                  >
                    Type Name
                  </button>
                </div>
              </div>

              {signatureType === 'DRAWN' ? (
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-xs text-slate-600">Draw signature using touch, trackpad, or mouse.</p>
                  <canvas
                    ref={canvasRef}
                    className="mt-2 h-44 w-full rounded-lg border border-slate-300 bg-white touch-none"
                    onPointerDown={onSignaturePointerDown}
                    onPointerMove={onSignaturePointerMove}
                    onPointerUp={onSignaturePointerUp}
                    onPointerCancel={onSignaturePointerUp}
                  />
                  <button
                    type="button"
                    onClick={clearCanvas}
                    className="mt-2 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Typed Full Name</span>
                  <input
                    value={typedFullName}
                    onChange={(event) => setTypedFullName(event.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                    placeholder="Type your legal full name"
                  />
                </label>
              )}

              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                <span>Consent Text</span>
                <textarea
                  value={consentText}
                  onChange={(event) => setConsentText(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
                />
              </label>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void submitSignature()}
                  disabled={savingSignature}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {savingSignature ? 'Submitting...' : 'Sign Document'}
                </button>
                <button
                  type="button"
                  onClick={closeSigningModal}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Decline Request</p>
                <textarea
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="Reason required if declining"
                  className="mt-2 min-h-20 w-full rounded-lg border border-rose-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={() => void declineSignature()}
                  disabled={decliningSignature}
                  className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                >
                  {decliningSignature ? 'Declining...' : 'Decline Signature'}
                </button>
              </div>
            </section>
          </div>
        )}
      </Modal>
    </section>
  );
}
