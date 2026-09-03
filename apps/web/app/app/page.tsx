import Link from 'next/link';

export default function AppHomePage() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="mt-2 text-sm text-slate-600">
          Core platform is online. Use the modules below to begin configuration and operations.
        </p>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/app/people" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            Manage People
          </Link>
          <Link href="/app/tasks" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            Manage Tasks
          </Link>
          <Link href="/app/documents" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            Manage Documents
          </Link>
          <Link href="/app/fundraising" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            Fundraising Scenarios
          </Link>
          <Link href="/app/valuations-reports" className="rounded-lg bg-slate-900 px-3 py-2 text-white hover:bg-slate-800">
            Valuations & Reports
          </Link>
          <Link href="/docs" className="rounded-lg border border-slate-300 px-3 py-2 hover:bg-slate-50">
            Open API Docs
          </Link>
        </div>
      </article>
    </section>
  );
}
