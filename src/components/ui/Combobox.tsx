"use client";
// The one search-as-you-type field (Animate UI's Base UI combobox, styled from our tokens in globals.css `.cb-*`). It replaces the browser's raw
// <input list> + <datalist> popup everywhere (library-ratchet.test.ts bans both). The text is free: a typed or scanned code that is not in the list stays
// as typed, and Enter / blur are the caller's, so a scanner that types a code and presses Enter keeps working. Arrow keys + Enter pick a row.
// Filtering: by default the list is filtered here (Arabic-normalised, any part of the text or its hint); pass `filtered` when the caller already did it
// (a server search), so the list is shown as given.
import { forwardRef, useMemo, type KeyboardEventHandler, type FocusEventHandler, type Ref } from "react";
import { Combobox as Base } from "@animate-ui/react/primitives/base-ui/combobox";
import { norm } from "@/lib/fields";
import type { InputKind } from "./Input";

/** One row: `text` goes into the field when picked; `hint` is the muted second part (name, karat, weight). */
export type ComboOption = { text: string; hint?: string; key?: string };

type Props = {
  id: string; value: string; onChange: (text: string) => void;
  options: readonly ComboOption[];
  /** A row was picked with the mouse or Enter (not just typed). */
  onPick?: (o: ComboOption) => void;
  /** The list is already filtered by the caller (server search): show it as given. */
  filtered?: boolean;
  placeholder?: string; kind?: InputKind; dir?: "ltr" | "rtl"; maxLength?: number; disabled?: boolean;
  /** Codes and numbers: the field's text in the monospace face. */
  mono?: boolean;
  invalid?: boolean; "aria-label"?: string; "data-f"?: string; autoFocus?: boolean;
  onFocus?: FocusEventHandler<HTMLInputElement>; onBlur?: FocusEventHandler<HTMLInputElement>; onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};

const keyOf = (o: ComboOption) => o.key ?? o.text;

export const Combobox = forwardRef<HTMLInputElement, Props>(function Combobox(
  { id, value, onChange, options, onPick, filtered, placeholder, kind, dir, maxLength, mono, disabled, invalid, onFocus, onBlur, onKeyDown, autoFocus, ...rest }, ref,
) {
  const shown = useMemo(() => {
    if (filtered) return options;
    const q = norm(value);
    return q ? options.filter((o) => norm(`${o.text} ${o.hint ?? ""}`).includes(q)) : options;
  }, [options, value, filtered]);
  // The selected row is the one whose text the field shows (none for free text). Left at null, Base UI clears the text it just filled in on a pick.
  const selected = useMemo(() => options.find((o) => o.text === value) ?? null, [options, value]);
  return (
    <Base.Root
      items={options} filteredItems={shown} value={selected} inputValue={value}
      itemToStringLabel={(o: ComboOption) => o.text} isItemEqualToValue={(a: ComboOption, b: ComboOption) => keyOf(a) === keyOf(b)}
      onInputValueChange={(v) => onChange(v)}
      onValueChange={(o: ComboOption | null) => { if (o) { onChange(o.text); onPick?.(o); } }}
      disabled={disabled} openOnInputClick
    >
      <Base.Input
        ref={ref as Ref<HTMLInputElement>} id={id} className={mono ? "cb-mono" : undefined} placeholder={placeholder} data-kind={kind} dir={dir} maxLength={maxLength}
        autoComplete="off" aria-invalid={invalid || undefined} autoFocus={autoFocus} onFocus={onFocus} onBlur={onBlur} onKeyDown={onKeyDown}
        aria-label={rest["aria-label"]} data-f={rest["data-f"]}
      />
      {shown.length > 0 && (   // nothing to suggest: no popup at all (an empty one draws as a blank bar under the field)
        <Base.Portal>
          <Base.Positioner sideOffset={4} className="cb-pos">
            <Base.Popup className="cb-pop">
              <Base.List className="cb-list">
                {(o: ComboOption) => (
                  <Base.Item key={keyOf(o)} value={o} className="cb-item">
                    <span className="cb-text">{o.text}</span>
                    {o.hint && <span className="cb-hint">{o.hint}</span>}
                  </Base.Item>
                )}
              </Base.List>
            </Base.Popup>
          </Base.Positioner>
        </Base.Portal>
      )}
    </Base.Root>
  );
});
