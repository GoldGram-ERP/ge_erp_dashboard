"use client";
// Select: a trigger button + a popover listbox (no native <select>). The value lives in <input type="hidden" id name>,
// so #f-<name> still holds the value; picking the selected option again clears it. Keyboard: arrows, Home/End, Enter/Space, Esc, type-ahead.
import { useEffect, useId, useRef, useState } from "react";
import type { Option } from "@/lib/engine-types";
import { useLocale } from "next-intl";
import { filterOptions, norm, type AddNew } from "@/lib/fields";
import { useT } from "@/lib/t";
import { Popover } from "./Popover";

type Props = {
  id: string; name: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  options: Option[]; placeholder?: string; disabled?: boolean; searchable?: boolean; className?: string;
  labelledBy?: string; describedBy?: string; invalid?: boolean; addNew?: AddNew;
};

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

export function Select({ id, name, value, onChange, onBlur, options, placeholder, disabled, searchable, className = "", labelledBy, describedBy, invalid, addNew }: Props) {
  const { L } = useT();
  const locale = useLocale();
  const real = options.filter((o) => String(o[0]) !== "");
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const btn = useRef<HTMLButtonElement>(null), searchEl = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  const buf = useRef({ s: "", at: 0 });
  const pid = useId();
  useLabelFallback(btn, id, labelledBy);
  const hasSearch = searchable === undefined ? real.length > 8 : searchable;
  const shown = filterOptions(real, q);
  const current = real.find(([v]) => String(v) === value);

  const show = () => {
    if (open || disabled) return;
    setQ(""); setActive(Math.max(0, real.findIndex(([v]) => String(v) === value))); setOpen(true);
    setTimeout(() => searchEl.current?.focus());
  };
  const shut = (back = true) => { setOpen(false); if (back) btn.current?.focus(); };
  const pick = (k: number) => {
    const o = shown[k]; if (!o || o[2]) return;
    onChange(value === String(o[0]) ? "" : String(o[0]));   // the same option again clears it
    shut();
  };
  const ahead = (ch: string) => {
    const now = Date.now(); buf.current = { s: now - buf.current.at > 700 ? ch : buf.current.s + ch, at: now };
    const k = shown.findIndex(([, l]) => norm(l).startsWith(norm(buf.current.s)));
    if (k >= 0) setActive(k);
  };
  const keys = (e: React.KeyboardEvent) => {
    const k = e.key;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); show(); }
      else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { show(); ahead(k); }
      return;
    }
    const n = shown.length;
    if (k === "ArrowDown") setActive((a) => Math.min(n - 1, a + 1));
    else if (k === "ArrowUp") setActive((a) => Math.max(0, a - 1));
    else if ((k === "Home" || k === "End") && !hasSearch) setActive(k === "Home" ? 0 : n - 1);
    else if (k === "Enter" || (k === " " && !hasSearch)) pick(active);
    else if (k === "Escape") shut();
    else if (k === "Tab") { shut(false); return; }
    else if (!hasSearch && k.length === 1 && !e.ctrlKey && !e.metaKey) { ahead(k); e.preventDefault(); return; }
    else return;
    e.preventDefault();
    setTimeout(() => list.current?.children[Math.min(active, n - 1)]?.scrollIntoView?.({ block: "nearest" }));
  };
  const focusId = shown[active] ? `${pid}-${active}` : undefined;

  return (
    <div className={`sel ${className}`} data-select>
      <input type="hidden" id={id} name={name} value={value} readOnly />
      <button
        ref={btn} type="button" id={`${id}-btn`} className={`sel-btn${current ? "" : " empty"}`} role="combobox" aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? pid : undefined} aria-activedescendant={open && !hasSearch ? focusId : undefined}
        aria-labelledby={labelledBy} aria-describedby={describedBy} aria-invalid={invalid || undefined} disabled={disabled}
        onClick={() => (open ? shut() : show())} onKeyDown={keys} onKeyUp={(e) => { if (e.key === " ") e.preventDefault(); }} onBlur={() => { if (!open) onBlur?.(); }}
      >
        <span className="sel-val">{current ? current[1] : (placeholder ?? L("اختر", "Choose"))}</span>
        <svg className="chev" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <Popover trigger={btn} onClose={() => shut(false)} className="sel-pop" watch={shown.length}>
          {hasSearch && (
            <div className="sel-search">
              <input ref={searchEl} type="text" role="searchbox" autoComplete="off" placeholder={L("بحث…", "Search…")} aria-label={L("بحث", "Search")} aria-activedescendant={focusId}
                value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={keys} />
            </div>
          )}
          <ul ref={list} role="listbox" id={pid}>
            {shown.length ? shown.map(([v, l, dis], k) => (
              <li key={String(v)} role="option" id={`${pid}-${k}`} className={k === active ? "active" : undefined} aria-disabled={dis || undefined} aria-selected={String(v) === value}
                onPointerUp={() => pick(k)} onPointerMove={() => k !== active && setActive(k)}>
                {l}
                <span className="tick"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg></span>
              </li>
            )) : <li className="sel-empty" role="presentation">{L("لا توجد نتائج", "No results")}</li>}
          </ul>
          {addNew && <a className="sel-add" role="option" aria-selected={false} href={`/${locale}${addNew.route}`} target="_blank" rel="noopener" onClick={() => shut(false)}>+ {locale === "ar" ? addNew.ar : addNew.en}</a>}
        </Popover>
      )}
    </div>
  );
}
