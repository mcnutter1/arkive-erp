export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-50 p-10 text-slate-900">
      <section className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-sm uppercase tracking-[0.2em] text-slate-500">Arkive</p>
        <h1 className="mt-3 text-3xl font-semibold">Operations Platform</h1>
        <p className="mt-4 max-w-2xl text-slate-600">
          Phase 0 foundation is scaffolded. Identity, People, Documents, Equity, Fundraising, and
          Governance modules will be added incrementally under a modular monolith architecture.
        </p>
      </section>
    </main>
  );
}
