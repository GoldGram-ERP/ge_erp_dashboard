"use client";
// Desk one: a single-choice segmented control on Animate UI's Base UI toggle group (keyboard arrows, roving focus and pressed state are Base UI's).
import { ToggleGroup } from "@animate-ui/react/primitives/base-ui/toggle-group";
import { Toggle } from "@animate-ui/react/primitives/base-ui/toggle";
import "./OneToggleGroup.css";

type Props<T extends string> = { label: string; value: T; items: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean; id?: string };

export function OneToggleGroup<T extends string>({ label, value, items, onChange, disabled, id }: Props<T>) {
  return (
    <ToggleGroup id={id} aria-label={label} className="one-tg" value={[value]} disabled={disabled}
      onValueChange={(v: string[]) => { const next = v[v.length - 1] as T | undefined; if (next && next !== value) onChange(next); }}>
      {items.map((it) => <Toggle key={it.id} value={it.id} className="one-tg-item" data-id={it.id}>{it.label}</Toggle>)}
    </ToggleGroup>
  );
}
