"use client";
// Desk two: a single-choice segmented control on Animate UI's Base UI toggle group (arrows, roving focus and the pressed state are Base UI's).
import { ToggleGroup } from "@animate-ui/react/primitives/base-ui/toggle-group";
import { Toggle } from "@animate-ui/react/primitives/base-ui/toggle";
import "./TwoToggleGroup.css";

type Props<T extends string> = { label: string; value: T; items: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; id?: string };

export function TwoToggleGroup<T extends string>({ label, value, items, onChange, disabled, id }: Props<T>) {
  return (
    <ToggleGroup id={id} role="group" aria-label={label} className="two-tg" value={[value]} disabled={disabled}
      onValueChange={(v: string[]) => { const next = v[v.length - 1] as T | undefined; if (next && next !== value) onChange(next); }}>
      {items.map((it) => <Toggle key={it.id} value={it.id} className="two-tg-item" data-id={it.id}>{it.label}</Toggle>)}
    </ToggleGroup>
  );
}
