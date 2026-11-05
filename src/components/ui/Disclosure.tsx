"use client";
import { useState, type ReactNode } from "react";
import { Icon } from "../engine/ui";

/** The one disclosure (show / hide): a small button with a chevron, never a native <details> (its browser triangle and focus ring are raw chrome). */
export function Disclosure({ id, className = "", summary, children, defaultOpen = false }: { id?: string; className?: string; summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div id={id} className={`disc${className ? ` ${className}` : ""}`}>
      <button type="button" className="disc-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="chev" size={14} />
        <span>{summary}</span>
      </button>
      {open && <div className="disc-body">{children}</div>}
    </div>
  );
}
