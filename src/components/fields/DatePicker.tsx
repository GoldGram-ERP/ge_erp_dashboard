"use client";
// Date picker: a trigger button + a calendar popover (no native date input). The value is the ISO day YYYY-MM-DD in
// <input type="hidden" id name>. Week starts Saturday in Arabic, Sunday in English. Names use Latin digits. "Today" is Cairo's.
import { useRef, useState } from "react";
import { today } from "@/lib/format";
import { ISO_DAY, isoDay, monthGrid, parseDay, shiftDay, shiftMonth } from "@/lib/fields";
import { useT } from "@/lib/t";
import { Popover } from "./Popover";
import { useLabelFallback } from "./Select";

type Props = {
  id: string; name: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  min?: string; max?: string; required?: boolean; placeholder?: string; disabled?: boolean;
  labelledBy?: string; describedBy?: string; invalid?: boolean;
};
type Mode = "days" | "months" | "years";
const ARROW = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
const ICON = <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2v4M16 2v4M3 10h18" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>;

export function DatePicker({ id, name, value, onChange, onBlur, min = "", max = "", required, placeholder, disabled, labelledBy, describedBy, invalid }: Props) {
  const { L, isAr } = useT();
  const val = ISO_DAY.test(value) ? value : "";
  const btn = useRef<HTMLButtonElement>(null);
  useLabelFallback(btn, id, labelledBy, `${id}-val`);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("days");
  const [cursor, setCursor] = useState("");
  const [shown, setShown] = useState("");
  const ok = (s: string) => (!min || s >= min) && (!max || s <= max);
  const clamp = (s: string) => (min && s < min ? min : max && s > max ? max : s);
  const ws = isAr ? 6 : 0, t = today();
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(`${isAr ? "ar" : "en"}-u-nu-latn`, { timeZone: "UTC", ...o });
  const monthName = (m: number, style: "long" | "short" = "long") => fmt({ month: style }).format(Date.UTC(2024, m, 1));
  const weekday = (wd: number) => fmt({ weekday: isAr ? "narrow" : "short" }).format(Date.UTC(2023, 0, 1 + wd));   // 2023-01-01 is a Sunday

  const show = () => {
    if (open || disabled) return;
    const c = clamp(ISO_DAY.test(val) ? val : t);
    setCursor(c); setShown(`${c.slice(0, 8)}01`); setMode("days"); setOpen(true);
  };
  const shut = (back = true) => { setOpen(false); if (back) btn.current?.focus(); };
  const pick = (s: string) => { if (s !== val) onChange(s); shut(); };
  const go = (n: number, unit: "month" | "year") => {
    const by = (unit === "year" ? 12 : 1) * n;
    setShown(shiftMonth(shown, by)); if (mode === "days") setCursor(clamp(shiftMonth(cursor, by)));
  };
  const { y, m } = shown ? parseDay(shown) : { y: 2000, m: 0 };
  const from = y - (y % 12);
  const [title, prev, next] = mode === "days" ? [`${monthName(m)} ${y}`, -1, 1] : mode === "months" ? [String(y), -1, 1] : [`${from} - ${from + 11}`, -12, 12];
  const unit = mode === "days" ? "month" : "year";
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); shut(); return; }
    if (mode !== "days" || !(e.target as HTMLElement).closest(".dp-day")) return;
    const rtl = btn.current ? getComputedStyle(btn.current).direction === "rtl" : false, h = rtl ? -1 : 1, k = e.key;
    const step = ({ ArrowRight: h, ArrowLeft: -h, ArrowDown: 7, ArrowUp: -7 } as Record<string, number>)[k];
    const to = step ? shiftDay(cursor, step) : k === "PageDown" ? shiftMonth(cursor, e.shiftKey ? 12 : 1) : k === "PageUp" ? shiftMonth(cursor, e.shiftKey ? -12 : -1) : null;
    if (to) { e.preventDefault(); const c = clamp(to); setCursor(c); setShown(`${c.slice(0, 8)}01`); setTimeout(() => document.querySelector<HTMLElement>(".dp-pop .dp-day[tabindex='0']")?.focus()); }
  };

  return (
    <div className="sel dp" data-date>
      <input type="hidden" id={id} name={name} value={val} readOnly />
      <button ref={btn} type="button" id={`${id}-btn`} className={`sel-btn dp-btn${val ? "" : " empty"}`} aria-haspopup="dialog" aria-expanded={open} aria-labelledby={labelledBy ? `${labelledBy} ${id}-val` : undefined} aria-describedby={describedBy} aria-invalid={invalid || undefined}
        disabled={disabled} onClick={() => (open ? shut() : show())} onKeyDown={(e) => { if (!open && e.key === "ArrowDown") { e.preventDefault(); show(); } }} onBlur={() => { if (!open) onBlur?.(); }}>
        <span className="sel-val" id={`${id}-val`} dir="ltr">{val || placeholder || L("اختر التاريخ", "Pick a date")}</span>{ICON}
      </button>
      {open && (
        <Popover trigger={btn} onClose={() => shut(false)} className="dp-pop" role="dialog" label={L("اختيار التاريخ", "Choose a date")} watch={`${mode}${shown}`}>
          <div onKeyDown={onKey}>
            <div className="dp-head">
              <button type="button" className="dp-nav" aria-label={L("السابق", "Previous")} onClick={() => go(prev, unit)}>{ARROW}</button>
              <button type="button" className="dp-title" aria-live="polite" onClick={() => setMode(mode === "days" ? "months" : "years")}>{title}</button>
              <button type="button" className="dp-nav next" aria-label={L("التالي", "Next")} onClick={() => go(next, unit)}>{ARROW}</button>
            </div>
            {mode === "days" && (
              <div className="dp-grid" role="group" aria-label={title}>
                {Array.from({ length: 7 }, (_, i) => <span key={i} className="dp-wd" aria-hidden="true">{weekday((ws + i) % 7)}</span>)}
                {monthGrid(y, m, ws).map((c) => (
                  <button key={c.iso} type="button" ref={(el) => { if (el && c.iso === cursor && open) el.focus({ preventScroll: true }); }}
                    className={`dp-day${c.inMonth ? "" : " out"}${c.iso === t ? " today" : ""}${c.iso === val ? " sel" : ""}`} data-d={c.iso} tabIndex={c.iso === cursor ? 0 : -1}
                    aria-label={`${c.day} ${c.iso}`} aria-current={c.iso === t ? "date" : undefined} aria-pressed={c.iso === val} disabled={!ok(c.iso)} onClick={() => pick(c.iso)}>{c.day}</button>
                ))}
              </div>
            )}
            {mode === "months" && (
              <div className="dp-pick">
                {Array.from({ length: 12 }, (_, i) => <button key={i} type="button" className={i === m ? "sel" : ""} onClick={() => { const s = isoDay(y, i, 1); setShown(s); setCursor(clamp(s)); setMode("days"); }}>{monthName(i, "short")}</button>)}
              </div>
            )}
            {mode === "years" && (
              <div className="dp-pick">
                {Array.from({ length: 12 }, (_, i) => <button key={i} type="button" className={from + i === y ? "sel" : ""} onClick={() => { setShown(isoDay(from + i, m, 1)); setMode("months"); }}>{from + i}</button>)}
              </div>
            )}
            <div className="dp-foot">
              <button type="button" disabled={!ok(t)} onClick={() => pick(clamp(t))}>{L("اليوم", "Today")}</button>
              {!required && <button type="button" onClick={() => pick("")}>{L("مسح", "Clear")}</button>}
            </div>
          </div>
        </Popover>
      )}
    </div>
  );
}
