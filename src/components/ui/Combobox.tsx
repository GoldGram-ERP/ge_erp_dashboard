"use client";
// The one search-as-you-type field. Its popup is the app's one dropdown: the shared Popover with the Select's list (`.sel-pop`), so it looks,
// moves and scrolls like every other dropdown. It replaces the browser's raw <input list> + <datalist> popup everywhere (library-ratchet.test.ts bans both).
// The text is free: a typed or scanned code that is not in the list stays as typed, and Enter / blur are the caller's, so a scanner that types a code and
// presses Enter keeps working. Arrow keys move through the rows; Enter on a highlighted row picks it.
// Filtering: by default the list is filtered here (Arabic-normalised, any part of the text or its hint); pass `filtered` when the caller already did it
// (a server search), so the list is shown as given.
import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEventHandler, type FocusEventHandler } from "react";
import { norm } from "@/lib/fields";
import { Popover } from "../fields/Popover";
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
  const box = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  useImperativeHandle(ref, () => box.current!, []);
  const pid = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);   // -1: no row highlighted, so Enter stays the caller's (a scanner's Enter)
  const shown = useMemo(() => {
    if (filtered) return options;
    const q = norm(value);
    return q ? options.filter((o) => norm(`${o.text} ${o.hint ?? ""}`).includes(q)) : options;
  }, [options, value, filtered]);
  const showing = open && !disabled && shown.length > 0;   // nothing to suggest: no popup at all
  useEffect(() => { if (active >= 0) list.current?.children[active]?.scrollIntoView?.({ block: "nearest" }); }, [active]);

  const shut = () => { setOpen(false); setActive(-1); };
  const pick = (o: ComboOption) => { onChange(o.text); onPick?.(o); shut(); };
  const keys: KeyboardEventHandler<HTMLInputElement> = (e) => {
    const n = shown.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n) {
      e.preventDefault();
      const down = e.key === "ArrowDown";
      if (!showing) { setOpen(true); setActive(down ? 0 : n - 1); return; }
      setActive((a) => (down ? Math.min(n - 1, a + 1) : Math.max(0, a < 0 ? n - 1 : a - 1)));
      return;
    }
    if (e.key === "Enter" && showing && shown[active]) { e.preventDefault(); pick(shown[active]); return; }
    if (e.key === "Escape" && showing) { e.preventDefault(); shut(); return; }
    if (e.key === "Tab") shut();
    onKeyDown?.(e);
  };

  return (
    <>
      <input
        ref={box} id={id} type="text" role="combobox" aria-autocomplete="list" aria-expanded={showing} aria-controls={showing ? pid : undefined}
        aria-activedescendant={showing && active >= 0 ? `${pid}-${active}` : undefined}
        className={mono ? "cb-mono" : undefined} placeholder={placeholder} data-kind={kind} dir={dir} maxLength={maxLength} disabled={disabled}
        autoComplete="off" aria-invalid={invalid || undefined} autoFocus={autoFocus} aria-label={rest["aria-label"]} data-f={rest["data-f"]}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(-1); }}
        onClick={() => setOpen(true)} onFocus={onFocus} onKeyDown={keys}
        onBlur={(e) => { shut(); onBlur?.(e); }}
      />
      {showing && (
        <Popover trigger={box} onClose={shut} className="sel-pop" watch={shown.length}>
          <ul ref={list} role="listbox" id={pid}>
            {shown.map((o, k) => (
              <li key={keyOf(o)} role="option" id={`${pid}-${k}`} className={k === active ? "active" : undefined} aria-selected={o.text === value} onPointerUp={() => pick(o)}>
                <span className="lbl cb-row" title={o.hint ? `${o.text} · ${o.hint}` : o.text}><b className="cb-text">{o.text}</b>{o.hint && <span className="cb-hint">{o.hint}</span>}</span>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </>
  );
});
