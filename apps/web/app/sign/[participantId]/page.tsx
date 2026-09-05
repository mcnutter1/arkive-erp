"use client";

import { useParams, useSearchParams } from 'next/navigation';
import { PointerEvent, useEffect, useRef, useState } from 'react';

import { readApiError } from '../../app/_utils/read-api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

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

export default function PublicSignerPage() {
  const params = useParams<{ participantId: string }>();
  const searchParams = useSearchParams();
  const participantId = typeof params.participantId === 'string' ? params.participantId.trim() : '';
  const token = searchParams.get('token')?.trim() ?? '';

  const [packet, setPacket] = useState<ParticipantPacket | null>(null);
  const [loadingPacket, setLoadingPacket] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [signatureType, setSignatureType] = useState<'DRAWN' | 'TYPED'>('DRAWN');
  const [typedFullName, setTypedFullName] = useState('');
  const [consentText, setConsentText] = useState(
    'I agree to electronically sign this document and acknowledge this signature is legally binding.',
  );
  const [declineReason, setDeclineReason] = useState('');
  const [savingSignature, setSavingSignature] = useState(false);
  const [decliningSignature, setDecliningSignature] = useState(false);
  const [drawnHasInk, setDrawnHasInk] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  async function loadPacket() {
    if (!participantId || !token) {
      setLoadingPacket(false);
      return;
    }

    setLoadingPacket(true);
    setError(null);

    try {
      const response = await fetch(
        `${apiBaseUrl}/signatures/public/participants/${encodeURIComponent(participantId)}?token=${encodeURIComponent(token)}`,
      );

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to open signing link.'));
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
    } catch {
      setError('Unable to open signing link.');
    } finally {
      setLoadingPacket(false);
    }
  }

  useEffect(() => {
    void loadPacket();
  }, [participantId, token]);

  useEffect(() => {
    if (!packet || signatureType !== 'DRAWN') {
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
  }, [packet, signatureType]);

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
      const response = await fetch(
        `${apiBaseUrl}/signatures/public/participants/${encodeURIComponent(packet.participant.id)}/sign?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
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
        },
      );

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to sign document.'));
        return;
      }

      const payload = (await response.json()) as {
        artifactCaptured?: boolean;
        signedCopyEmails?: {
          sent: number;
          failed: number;
        };
      };

      const emailSummary = payload.signedCopyEmails;
      if (payload.artifactCaptured) {
        if (emailSummary && emailSummary.sent > 0) {
          setNotice(
            `Signature submitted. The fully signed PDF has been generated and emailed to ${emailSummary.sent} participant${emailSummary.sent === 1 ? '' : 's'}.`,
          );
        } else {
          setNotice('Signature submitted. The fully signed PDF was generated.');
        }
      } else {
        setNotice('Signature submitted successfully.');
      }

      await loadPacket();
      clearCanvas();
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
      const response = await fetch(
        `${apiBaseUrl}/signatures/public/participants/${encodeURIComponent(packet.participant.id)}/decline?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ reason: declineReason.trim() }),
        },
      );

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to decline signature request.'));
        return;
      }

      setNotice('Signature request declined.');
      await loadPacket();
    } catch {
      setError('Unable to decline signature request.');
    } finally {
      setDecliningSignature(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900 md:px-8 md:py-8">
      <section className="mx-auto w-full max-w-7xl space-y-5">
        <header className="rounded-3xl border border-cyan-200 bg-gradient-to-r from-cyan-100 via-white to-emerald-100 p-6 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-600">Arkive eSign</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">Secure Signing Packet</h1>
          <p className="mt-2 text-sm text-slate-700">
            No account is required. Review the document, sign visually with your typed or drawn signature, and submit.
          </p>
        </header>

        {!token ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            This signing link is missing a token. Please use the full URL from the email invitation.
          </div>
        ) : null}

        {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div> : null}
        {notice ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div> : null}

        {loadingPacket ? (
          <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-600">Loading signing packet...</p>
          </article>
        ) : null}

        {!loadingPacket && packet ? (
          <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
            <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{packet.request.document.title}</h2>
                  <p className="text-xs text-slate-600">
                    Category: {packet.request.document.category} · Request Status: {packet.request.status}
                  </p>
                </div>
                <a
                  href={packet.documentVersion.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Open PDF in New Tab
                </a>
              </div>

              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                <iframe
                  title="Document preview"
                  src={packet.documentVersion.downloadUrl}
                  className="h-[72vh] w-full bg-white"
                />
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Signing Sequence</p>
                <ul className="mt-2 space-y-2">
                  {packet.request.participants.map((participant) => (
                    <li key={participant.id} className="rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs">
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
            </article>

            <article className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Choose Signature Mode</h3>
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
                  <p className="text-xs text-slate-600">Draw your signature using touch, trackpad, or mouse.</p>
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
                  disabled={savingSignature || packet.participant.status === 'SIGNED'}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingSignature ? 'Submitting...' : packet.participant.status === 'SIGNED' ? 'Already Signed' : 'Sign Document'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadPacket()}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                  Refresh
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
                  disabled={decliningSignature || packet.participant.status === 'DECLINED'}
                  className="mt-2 rounded-lg border border-rose-300 bg-white px-3 py-2 text-xs text-rose-700 hover:bg-rose-100 disabled:opacity-60"
                >
                  {decliningSignature ? 'Declining...' : packet.participant.status === 'DECLINED' ? 'Already Declined' : 'Decline Signature'}
                </button>
              </div>
            </article>
          </div>
        ) : null}
      </section>
    </main>
  );
}
