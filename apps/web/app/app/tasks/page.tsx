"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

import { Modal } from '../_components/modal';
import { PageHero } from '../_components/page-hero';
import { readApiError } from '../_utils/read-api-error';

type Task = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  dueAt: string | null;
};

type TasksResponse = {
  data: Task[];
  page: number;
  pageSize: number;
  total: number;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

function formatDueDate(value: string | null): string {
  if (!value) {
    return 'No due date';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'No due date';
  }

  return date.toLocaleString();
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: '1', pageSize: '50' });
    if (query.trim()) {
      params.set('search', query.trim());
    }
    return params.toString();
  }, [query]);

  async function loadTasks() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/tasks?${queryString}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load tasks.'));
        return;
      }

      const payload = (await response.json()) as TasksResponse;
      setTasks(payload.data);
    } catch {
      setError('Unable to load tasks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTasks();
  }, [queryString]);

  async function onCreateTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const title = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim();
    const dueAt = String(form.get('dueAt') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/tasks`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title,
          description: description || undefined,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create task.'));
        return;
      }

      event.currentTarget.reset();
      setCreateOpen(false);
      await loadTasks();
    } catch {
      setError('Unable to create task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Operations"
        title="Tasks"
        description="Track operational work with less noise and faster data entry."
        actions={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              Create Task
            </button>
            <button
              type="button"
              onClick={() => void loadTasks()}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
            >
              Refresh
            </button>
          </>
        }
      />

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-semibold">Task List</h2>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : tasks.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No tasks found.</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200">
            {tasks.map((task) => (
              <li key={task.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-slate-900">{task.title}</p>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                    {task.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{task.description ?? 'No description'}</p>
                <p className="mt-1 text-xs text-slate-500">Due: {formatDueDate(task.dueAt)}</p>
              </li>
            ))}
          </ul>
        )}
      </article>

      <Modal
        open={createOpen}
        title="Create Task"
        description="Capture title, due date, and context."
        onClose={() => setCreateOpen(false)}
      >
        <form className="grid gap-3" onSubmit={onCreateTask}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Task Title</span>
            <input
              name="title"
              required
              placeholder="Prepare monthly payroll report"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Due Date and Time</span>
            <input
              name="dueAt"
              type="datetime-local"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Description</span>
            <textarea
              name="description"
              placeholder="Add context, owners, and expected outcome"
              className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Saving...' : 'Create Task'}
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
