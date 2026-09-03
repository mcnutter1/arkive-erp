"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

type DocumentRecord = {
  id: string;
  category: string;
  title: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

type DocumentVersion = {
  id: string;
  versionNumber: number;
  mimeType: string;
  byteSize: number;
  sha256: string;
  storageKey: string;
  createdAt: string;
};

type DocumentsResponse = {
  data: DocumentRecord[];
  page: number;
  pageSize: number;
  total: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string>('');
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (search.trim()) {
      params.set('search', search.trim());
    }
    return params.toString();
  }, [search]);

  async function loadDocuments() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/documents?${queryString}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError('Unable to load documents.');
        return;
      }

      const payload = (await response.json()) as DocumentsResponse;
      setDocuments(payload.data);

      if (!selectedDocumentId && payload.data[0]) {
        setSelectedDocumentId(payload.data[0].id);
      }
    } catch {
      setError('Unable to load documents.');
    } finally {
      setLoading(false);
    }
  }

  async function loadVersions(documentId: string) {
    if (!documentId) {
      setVersions([]);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/documents/${documentId}/versions`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError('Unable to load document versions.');
        return;
      }
      setVersions((await response.json()) as DocumentVersion[]);
    } catch {
      setError('Unable to load document versions.');
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, [queryString]);

  useEffect(() => {
    void loadVersions(selectedDocumentId);
  }, [selectedDocumentId]);

  async function onCreateDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const category = String(form.get('category') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/documents`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, category }),
      });

      if (!response.ok) {
        setError('Unable to create document.');
        return;
      }

      event.currentTarget.reset();
      await loadDocuments();
    } catch {
      setError('Unable to create document.');
    }
  }

  async function onUploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedDocumentId) {
      setError('Select a document first.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const file = form.get('file');
    if (!(file instanceof File)) {
      setError('Select a file to upload.');
      return;
    }

    setUploading(true);
    try {
      const uploadUrlResp = await fetch(`${apiBaseUrl}/documents/upload-url`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mimeType: file.type || 'application/octet-stream', byteSize: file.size }),
      });

      if (!uploadUrlResp.ok) {
        setError('Unable to create upload URL.');
        return;
      }

      const uploadUrlPayload = (await uploadUrlResp.json()) as { key: string; url: string };
      const putResp = await fetch(uploadUrlPayload.url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
        },
        body: file,
      });

      if (!putResp.ok) {
        setError('File upload failed.');
        return;
      }

      const hash = await sha256Hex(file);

      const finalizeResp = await fetch(`${apiBaseUrl}/documents/${selectedDocumentId}/versions`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storageKey: uploadUrlPayload.key,
          sha256: hash,
          mimeType: file.type || 'application/octet-stream',
          byteSize: file.size,
        }),
      });

      if (!finalizeResp.ok) {
        setError('Unable to finalize document version.');
        return;
      }

      event.currentTarget.reset();
      await loadVersions(selectedDocumentId);
      await loadDocuments();
    } catch {
      setError('Unable to upload document version.');
    } finally {
      setUploading(false);
    }
  }

  async function openDownload(versionId: string) {
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/documents/versions/${versionId}/download-url`, {
        credentials: 'include',
      });

      if (!response.ok) {
        setError('Unable to create download URL.');
        return;
      }

      const payload = (await response.json()) as { url: string };
      window.open(payload.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('Unable to create download URL.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Documents</h1>
        <p className="mt-2 text-sm text-slate-600">Create records, upload versions, and fetch download URLs.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Document</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={onCreateDocument}>
          <input name="title" required placeholder="Title" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <input
            name="category"
            required
            placeholder="Category (policy, offer, agreement)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800" type="submit">
            Create
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Directory</h2>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search documents"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : documents.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No documents yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th className="py-2 pr-4">Title</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Version</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr
                    key={doc.id}
                    className={`cursor-pointer border-b border-slate-100 ${selectedDocumentId === doc.id ? 'bg-slate-50' : ''}`}
                    onClick={() => setSelectedDocumentId(doc.id)}
                  >
                    <td className="py-2 pr-4">{doc.title}</td>
                    <td className="py-2 pr-4">{doc.category}</td>
                    <td className="py-2 pr-4">{doc.status}</td>
                    <td className="py-2 pr-4">{doc.version}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Upload New Version</h2>
        <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-center" onSubmit={onUploadVersion}>
          <input type="file" name="file" className="text-sm" />
          <button
            type="submit"
            disabled={uploading || !selectedDocumentId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? 'Uploading...' : 'Upload Version'}
          </button>
        </form>
        {!selectedDocumentId ? (
          <p className="mt-3 text-xs text-amber-700">Select a document in the directory first.</p>
        ) : null}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Versions</h2>
        {versions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No versions for selected document.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-900">v{version.versionNumber}</p>
                  <p className="text-xs text-slate-600">
                    {version.mimeType} · {version.byteSize} bytes
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void openDownload(version.id)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                >
                  Download URL
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
