"use client";
// The Price board's controls (owner, 2026-11-25): each one an Animate UI primitive, wrapped once here and styled from the app tokens in BoardParts.css.
import type { ReactNode } from "react";
import { Button as AnimButton } from "@animate-ui/react/primitives/buttons/button";
import { ToggleGroup } from "@animate-ui/react/primitives/base-ui/toggle-group";
import { Toggle } from "@animate-ui/react/primitives/base-ui/toggle";
import { Checkbox } from "@animate-ui/react/primitives/base-ui/checkbox";
import "./BoardParts.css";

const calm = { type: "spring", stiffness: 520, damping: 40 } as const;

/** A board action: `strong` is the one primary action of an area, `quiet` the rest. Presses settle with a small tap scale, no hover growth. */
export function BoardAction({ tone = "quiet", small = false, children, onClick, disabled, label }: { tone?: "strong" | "quiet"; small?: boolean; children: ReactNode; onClick?: () => void; disabled?: boolean; label?: string }) {
  return (
    <AnimButton type="button" hoverScale={1} tapScale={0.97} className={`bd-act ${tone}${small ? " sm" : ""}`} onClick={onClick} disabled={disabled} aria-label={label}>
      {children}
    </AnimButton>
  );
}

/** One choice out of a few (stock, brand): a single-value toggle group; pressing the pressed one keeps it. */
export function BoardChoice<T extends string>({ label, value, items, onChange }: { label: string; value: T; items: { id: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <ToggleGroup aria-label={label} className="bd-choice" value={[value]} transition={calm} onValueChange={(v) => { const next = v[0] as T | undefined; if (next) onChange(next); }}>
      {items.map((i) => <Toggle key={i.id} value={i.id} className="bd-choice-item">{i.label}</Toggle>)}
    </ToggleGroup>
  );
}

/** A tick box with its own label (choosing an item for the cart). */
export function BoardTick({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <Checkbox.Root className="bd-tick" checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label}>
      <Checkbox.Indicator className="bd-tick-mark" transition={calm}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}
