"use client";
// The one big-number readout (a total, a price shown large): a label, the number in tabular figures with its unit, a caption, and a designed empty state.
// The number re-keys on change so it eases in (opacity + 4px, 200 ms); reduced motion keeps a plain fade.
import type { ReactNode } from "react";
import "./Readout.css";

export function Readout({ label, value, unit, caption, empty, size = "lg", id }: { label: ReactNode; value?: string | null; unit?: ReactNode; caption?: ReactNode; empty: ReactNode; size?: "md" | "lg"; id?: string }) {
  const has = value !== undefined && value !== null && value !== "" && value !== "—";
  return (
    <div className={`ro ro-${size}`} id={id} aria-live="polite">
      <span className="ro-label">{label}</span>
      {has
        ? <span className="ro-num" key={value} dir="ltr"><b>{value}</b>{unit && <small>{unit}</small>}</span>
        : <span className="ro-empty">{empty}</span>}
      {caption && <span className="ro-caption">{caption}</span>}
    </div>
  );
}
