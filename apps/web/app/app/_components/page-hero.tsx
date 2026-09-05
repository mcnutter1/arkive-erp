import { ReactNode } from 'react';

type PageHeroProps = {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHero({ eyebrow, title, description, actions }: PageHeroProps) {
  return (
    <header className="overflow-hidden rounded-3xl border border-amber-200 bg-gradient-to-r from-amber-100 via-white to-cyan-100 p-5 shadow-sm md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-600">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-700 md:text-base">{description}</p>
        </div>
        {actions ? <div className="flex w-full flex-wrap items-center gap-2 pt-1 sm:w-auto sm:justify-end">{actions}</div> : null}
      </div>
    </header>
  );
}
