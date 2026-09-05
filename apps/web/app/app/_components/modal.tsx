"use client";

import { ReactNode, useEffect } from 'react';

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  widthClassName?: string;
};

export function Modal({ open, title, description, onClose, children, widthClassName }: ModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    document.addEventListener('keydown', onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className={`w-full ${widthClassName ?? 'max-w-3xl'} overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
            {description ? <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-700 hover:bg-slate-100"
          >
            Close
          </button>
        </div>
        <div className="max-h-[80vh] overflow-y-auto p-6">{children}</div>
      </div>
    </div>
  );
}
