import Link from 'next/link';

import { PageHero } from './_components/page-hero';

export default function AppHomePage() {
  return (
    <section className="space-y-5">
      <PageHero
        eyebrow="Workspace"
        title="Operations Console"
        description="Core platform is online. Launch modules below to configure teams, equity, and controls."
      />

      <div className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Startup Checklist</h2>
        <p className="mt-2 text-sm text-slate-600">Follow this sequence for a clean first-time rollout.</p>
        <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Create people and engagements in People Ops.</li>
          <li>Set base shares and opening balances in Equity.</li>
          <li>Configure admin integrations and signatory defaults.</li>
          <li>Create grants, tasks, and approvals for operating workflows.</li>
          <li>Use Documents, Search, and Reports for audit trails.</li>
        </ol>
      </article>

      <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold">Quick Actions</h2>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
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
      </div>
    </section>
  );
}
