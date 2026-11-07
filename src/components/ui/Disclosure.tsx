"use client";
import { useState, type ReactNode } from "react";

/** The one disclosure (show / hide): a real button row with a trailing chevron, never a native <details> (its browser triangle and focus ring are raw chrome). Look lives in globals.css (.disc-*). */
export function Disclosure({ id, className = "", summary, children, defaultOpen = false }: { id?: string; className?: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className={`disc${className ? ` ${className}` : ""}`}>
      <button type="button" className="disc-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="disc-label">{summary}</span>
        <svg className="disc-chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && <div className="disc-body"><div>{children}</div></div>}
    </div>
  );
}
