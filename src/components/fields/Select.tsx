"use client";
// Select: the app's one dropdown, built on Animate UI's Base UI primitives (positioning, scroll, keyboard, type-ahead, touch and motion are theirs).
// A list long enough to need it (or `searchable`) is Animate UI's Combobox with the search inside the popup; a short list is Animate UI's Select.
// Same look for both (globals.css `.sel-*`). The value lives in <input type="hidden" id name>, so #f-<name> still holds it; the trigger is #<id>-btn.
// Picking the selected option again clears it.
import { useEffect, useMemo, useRef, useState } from "react";
import { Combobox as Cb } from "@animate-ui/react/primitives/base-ui/combobox";
import { Select as Sl } from "@animate-ui/react/primitives/base-ui/select";
import type { Option } from "@/lib/engine-types";
import { useLocale } from "next-intl";
import { filterOptions, type AddNew } from "@/lib/fields";
import { useT } from "@/lib/t";

type Props = {
  id: string; name: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  options: Option[]; placeholder?: string; disabled?: boolean; searchable?: boolean; className?: string;
  labelledBy?: string; describedBy?: string; invalid?: boolean; addNew?: AddNew;
  /** Above the list, under the search (the item picker's brand filter). */
  header?: React.ReactNode;
};
type Item = { value: string; label: string; disabled: boolean; tone?: string; sub?: string };

/** A trigger button whose caller wrote a plain <label for=id> (not our Field) still gets its name: point aria-labelledby at that label. */
export function useLabelFallback(btn: React.RefObject<HTMLButtonElement | null>, id: string, labelledBy?: string, also?: string) {
  useEffect(() => {
    const el = btn.current;
    if (!el || labelledBy) return;
    const lab = document.querySelector<HTMLElement>(`label[for="${id}"], label[for="${id}-btn"]`);
    if (!lab) return;
    lab.id ||= `${id}-lbl`;
    el.setAttribute("aria-labelledby", also ? `${lab.id} ${also}` : lab.id);
  });
}

const Tick = () => <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>;
const Chev = () => <svg className="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>;
const Row = ({ it }: { it: Item }) => <><span className={it.sub ? "lbl two" : "lbl"} title={it.label}>{it.label}{it.sub && <small className="sub">{it.sub}</small>}</span><span className="tick"><Tick /></span></>;

export function Select({ id, name, value, onChange, onBlur, options, placeholder, disabled, searchable, className = "", labelledBy, describedBy, invalid, addNew, header }: Props) {
  const { L } = useT();
  const locale = useLocale();
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useLabelFallback(btn, id, labelledBy);
  const real = useMemo(() => options.filter((o) => String(o[0]) !== ""), [options]);
  const items = useMemo(() => real.map(([v, l, dis, meta]): Item => ({ value: String(v), label: l, disabled: !!dis, tone: meta?.tone, sub: meta?.sub })), [real]);
  const byValue = useMemo(() => new Map(items.map((it) => [it.value, it])), [items]);
  const shown = useMemo(() => filterOptions(real, q).map((o) => byValue.get(String(o[0]))!), [real, q, byValue]);
  const hasSearch = searchable === undefined ? real.length > 8 : searchable;
  const current = byValue.get(value) ?? null;
  const pick = (v: string) => onChange(v === value ? "" : v);   // the same option again clears it
  const changeOpen = (o: boolean) => { setOpen(o); if (!o) setQ(""); };

  const trigger = {
    ref: btn, id: `${id}-btn`, className: `sel-btn${current ? "" : " unset"}`, "aria-labelledby": labelledBy, "aria-describedby": describedBy,
    "aria-invalid": invalid || undefined, onBlur: () => { if (!open) onBlur?.(); },
  };
  const face = <><span className="sel-val">{current ? current.label : (placeholder ?? L("اختر", "Choose"))}</span><Chev /></>;
  const add = addNew && <a className="sel-add" href={`/${locale}${addNew.route}`} target="_blank" rel="noopener" onClick={() => changeOpen(false)}>+ {locale === "ar" ? addNew.ar : addNew.en}</a>;

  return (
    <div className={`sel ${className}`} data-select>
      <input type="hidden" id={id} name={name} value={value} readOnly />
      {hasSearch ? (
        <Cb.Root<Item>
          items={items} filteredItems={shown} value={current} open={open} onOpenChange={changeOpen} inputValue={q} onInputValueChange={setQ}
          onValueChange={(it) => pick(it?.value ?? "")} itemToStringLabel={(it) => it.label} isItemEqualToValue={(a, b) => a.value === b.value} disabled={disabled}
        >
          <Cb.Trigger {...trigger}>{face}</Cb.Trigger>
          <Cb.Portal>
            <Cb.Positioner className="sel-pos" sideOffset={4} align="start">
              <Cb.Popup className="pop sel-pop">
                <div className="sel-search"><Cb.Input placeholder={L("بحث…", "Search…")} aria-label={L("بحث", "Search")} /></div>
                {header}
                <Cb.Empty className="sel-empty">{L("لا توجد نتائج", "No results")}</Cb.Empty>
                <Cb.List className="sel-list">
                  {(it: Item) => <Cb.Item key={it.value} value={it} disabled={it.disabled} data-tone={it.tone} className="sel-item"><Row it={it} /></Cb.Item>}
                </Cb.List>
                {add}
              </Cb.Popup>
            </Cb.Positioner>
          </Cb.Portal>
        </Cb.Root>
      ) : (
        <Sl.Root<string> items={items} value={current ? value : null} open={open} onOpenChange={changeOpen} onValueChange={(v) => pick(v ?? "")} disabled={disabled}>
          <Sl.Trigger {...trigger}>{face}</Sl.Trigger>
          <Sl.Portal>
            <Sl.Positioner className="sel-pos" sideOffset={4} align="start" alignItemWithTrigger={false}>
              <Sl.Popup className="pop sel-pop">
                {header}
                <Sl.List className="sel-list">
                  {items.length ? items.map((it) => <Sl.Item key={it.value} value={it.value} disabled={it.disabled} data-tone={it.tone} className="sel-item"><Row it={it} /></Sl.Item>)
                    : <div className="sel-empty">{L("لا توجد نتائج", "No results")}</div>}
                </Sl.List>
                {add}
              </Sl.Popup>
            </Sl.Positioner>
          </Sl.Portal>
        </Sl.Root>
      )}
    </div>
  );
}
