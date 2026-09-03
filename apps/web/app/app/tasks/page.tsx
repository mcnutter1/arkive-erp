"use client";

import { FormEvent, useEffect, useMemo, useState } from 'react';

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
        setError('Unable to load tasks.');
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
        setError('Unable to create task.');
        return;
      }

      event.currentTarget.reset();
      await loadTasks();
    } catch {
      setError('Unable to create task.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <p className="mt-2 text-sm text-slate-600">Create and track operational work items.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Task</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={onCreateTask}>
          <input
            name="title"
            required
            placeholder="Task title"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="dueAt"
            type="datetime-local"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <textarea
            name="description"
            placeholder="Description"
            className="md:col-span-2 min-h-24 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={saving}
            className="md:col-span-2 rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Create Task'}
          </button>
        </form>
      </article>

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
    </section>
  );
}
