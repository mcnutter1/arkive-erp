"use client";

import { FormEvent, useEffect, useState } from 'react';

import { readApiError } from '../_utils/read-api-error';

type Round = {
  id: string;
  name: string;
  stage: string;
  status: string;
  preMoney: string | null;
  postMoney: string | null;
};

type Scenario = {
  id: string;
  name: string;
  assumptions: Record<string, unknown>;
  output?: Record<string, unknown>;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? '/api/v1';

export default function FundraisingPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState<string>('');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadRounds() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/fundraising/rounds`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load rounds.'));
        return;
      }

      const payload = (await response.json()) as Round[];
      setRounds(payload);
      if (!selectedRoundId && payload[0]) {
        setSelectedRoundId(payload[0].id);
      }
    } catch {
      setError('Unable to load rounds.');
    } finally {
      setLoading(false);
    }
  }

  async function loadScenarios(roundId: string) {
    if (!roundId) {
      setScenarios([]);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/fundraising/scenarios/${roundId}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to load scenarios.'));
        return;
      }
      setScenarios((await response.json()) as Scenario[]);
    } catch {
      setError('Unable to load scenarios.');
    }
  }

  useEffect(() => {
    void loadRounds();
  }, []);

  useEffect(() => {
    void loadScenarios(selectedRoundId);
  }, [selectedRoundId]);

  async function onCreateRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const stage = String(form.get('stage') ?? '').trim();
    const preMoney = String(form.get('preMoney') ?? '').trim();

    try {
      const response = await fetch(`${apiBaseUrl}/fundraising/rounds`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          stage,
          preMoney: preMoney || undefined,
        }),
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create round.'));
        return;
      }

      event.currentTarget.reset();
      await loadRounds();
    } catch {
      setError('Unable to create round.');
    }
  }

  async function onCreateScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!selectedRoundId) {
      setError('Select a round first.');
      return;
    }

    const form = new FormData(event.currentTarget);
    const name = String(form.get('name') ?? '').trim();
    const raiseAmount = Number(form.get('raiseAmount') ?? 0);
    const preMoney = Number(form.get('scenarioPreMoney') ?? 0);

    try {
      const response = await fetch(`${apiBaseUrl}/fundraising/scenarios/${selectedRoundId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          assumptions: {
            raiseAmount,
            preMoney,
          },
        }),
      });

      if (!response.ok) {
        setError(await readApiError(response, 'Unable to create scenario.'));
        return;
      }

      event.currentTarget.reset();
      await loadScenarios(selectedRoundId);
    } catch {
      setError('Unable to create scenario.');
    }
  }

  async function simulate(roundId: string, scenarioId: string) {
    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}/fundraising/scenarios/${roundId}/${scenarioId}/simulate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        setError(await readApiError(response, 'Unable to simulate scenario.'));
        return;
      }

      await loadScenarios(roundId);
    } catch {
      setError('Unable to simulate scenario.');
    }
  }

  return (
    <section className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Fundraising</h1>
        <p className="mt-2 text-sm text-slate-600">Create rounds, define scenarios, and run simulations.</p>
      </header>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Round</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreateRound}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Round Name</span>
            <input name="name" required placeholder="Seed 2026" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Stage</span>
            <input name="stage" required placeholder="SEED" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Pre-Money Value</span>
            <input
              name="preMoney"
              placeholder="Optional"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800">
            Create
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Rounds</h2>
        {loading ? (
          <p className="mt-4 text-sm text-slate-600">Loading...</p>
        ) : rounds.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No rounds yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {rounds.map((round) => (
              <li key={round.id} className="flex items-center justify-between gap-3 py-3">
                <button
                  type="button"
                  onClick={() => setSelectedRoundId(round.id)}
                  className={`text-left ${selectedRoundId === round.id ? 'font-semibold text-slate-900' : 'text-slate-700'}`}
                >
                  {round.name} · {round.stage} · {round.status}
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Create Scenario</h2>
        <p className="mt-1 text-sm text-slate-600">Attach financing assumptions to the selected round and run simulations.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={onCreateScenario}>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Scenario Name</span>
            <input name="name" required placeholder="Base Case" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900" />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Raise Amount</span>
            <input
              name="raiseAmount"
              type="number"
              step="0.01"
              min="0"
              placeholder="2500000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Scenario Pre-Money</span>
            <input
              name="scenarioPreMoney"
              type="number"
              step="0.01"
              min="0"
              placeholder="12000000"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <button
            type="submit"
            disabled={!selectedRoundId}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add Scenario
          </button>
        </form>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Scenarios</h2>
        {scenarios.length === 0 ? (
          <p className="mt-4 text-sm text-slate-600">No scenarios for selected round.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-200">
            {scenarios.map((scenario) => (
              <li key={scenario.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{scenario.name}</p>
                  <button
                    type="button"
                    onClick={() => void simulate(selectedRoundId, scenario.id)}
                    className="rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    Simulate
                  </button>
                </div>
                <pre className="mt-2 overflow-x-auto rounded-md bg-slate-50 p-2 text-xs text-slate-700">
                  {JSON.stringify(scenario.output ?? scenario.assumptions, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </article>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
    </section>
  );
}
