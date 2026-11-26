"use client";
// The one inset group (iOS "grouped list"): a small title with an optional action, then rows on one rounded surface with hairline separators.
// Every label → value fact on a screen (prices, totals, metadata, a breakdown) is an InsetRow inside an InsetGroup; never loose spans.
import type { ReactNode } from "react";
import "./InsetGroup.css";

export function InsetGroup({ title, action, children, id, className = "", live }: { title?: ReactNode; action?: ReactNode; children: ReactNode; id?: string; className?: string; live?: boolean }) {
  return (
    <section className={`ig${className ? ` ${className}` : ""}`} id={id} aria-live={live ? "polite" : undefined}>
      {(title || action) && <div className="ig-head">{title && <h3 className="ig-title">{title}</h3>}{action && <div className="ig-action">{action}</div>}</div>}
      <div className="ig-body">{children}</div>
    </section>
  );
}

/** One row: a label on the start side, the value on the end side (tabular when it is a number), an optional trailing control. `tone` colours the value only. */
export function InsetRow({ label, value, trailing, tone, strong, numeric = true, id }: { label: ReactNode; value?: ReactNode; trailing?: ReactNode; tone?: "good" | "warn" | "mute"; strong?: boolean; numeric?: boolean; id?: string }) {
  return (
    <div className={`ig-row${strong ? " is-strong" : ""}`} id={id}>
      <span className="ig-label">{label}</span>
      {value !== undefined && <span className={`ig-value${numeric ? " is-num" : ""}${tone ? ` is-${tone}` : ""}`} dir={numeric ? "ltr" : undefined}>{value}</span>}
      {trailing && <span className="ig-trailing">{trailing}</span>}
    </div>
  );
}

/** A block of text inside a group (a message preview, a note): wraps, keeps line breaks, quiet when empty. */
export function InsetText({ children, empty, id }: { children: ReactNode; empty?: boolean; id?: string }) {
  return <div className={`ig-text${empty ? " is-empty" : ""}`} id={id} dir="auto">{children}</div>;
}
