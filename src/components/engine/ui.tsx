"use client";
// Small UI pieces of the engine: icons, toast, confirm dialog, side sheet, record blocks, segmented control.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/t";

// One stroke width and style for every icon (lucide-like geometry).
const I: Record<string, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />, check: <path d="M5 12.5l4.5 4.5L19 7" />, x: <path d="M18 6 6 18M6 6l12 12" />,
  camera: <><path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z" /><circle cx="12" cy="13" r="3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  trash: <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />, edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></>,
  back: <path d="m9 18 6-6-6-6" />, inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" /></>,
  alert: <><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>,
  download: <><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M4 21h16" /></>, print: <><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>,
};
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{I[name] ?? I.inbox}</svg>;
}

// ───── Toast: toast("Saved") from anywhere; <ToastHost/> draws it ─────
type ToastState = { id: number; msg: string; error: boolean; action?: string; run?: () => void } | null;
let current: ToastState = null, seq = 0, timer: ReturnType<typeof setTimeout>;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
export function toast(msg: string, { action, run, error = false, ms = 4200 }: { action?: string; run?: () => void; error?: boolean; ms?: number } = {}) {
  clearTimeout(timer);
  current = { id: ++seq, msg, error, action, run };
  emit();
  timer = setTimeout(() => { current = null; emit(); }, ms);
}
export function ToastHost() {
  const t = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
  return (
    <div id="toast" className={`toast${t ? ` show${t.error ? " error" : ""}` : ""}`} role="status" aria-live="polite">
      {t && <><span>{t.msg}</span>{t.action && <button type="button" onClick={() => { current = null; emit(); t.run?.(); }}>{t.action}</button>}</>}
    </div>
  );
}

// ───── Confirm dialog: const [confirm, dialog] = useConfirm(); if (await confirm({title, text, danger})) ... ─────
export type ConfirmOptions = { title: string; text?: string; body?: ReactNode; ok?: string; cancel?: string; danger?: boolean };
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = (o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve }));
  return [confirm, state && <ConfirmDialog key={state.title} {...state} onDone={(v) => { state.resolve(v); setState(null); }} />];
}
export function ConfirmDialog({ title, text, body, ok, cancel, danger, onDone }: ConfirmOptions & { onDone: (v: boolean) => void }) {
  const { L } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (d && !d.open) d.showModal(); }, []);
  return createPortal(
    <dialog ref={ref} aria-labelledby="confirm-title" onCancel={(e) => { e.preventDefault(); onDone(false); }}>
      <h2 id="confirm-title">{title}</h2>
      {text && <p>{text}</p>}
      {body}
      <div className="row">
        <button type="button" className={`btn ${danger ? "quiet danger" : "primary"}`} autoFocus={!danger} onClick={() => onDone(true)}>{ok ?? L("تأكيد", "Confirm")}</button>
        <button type="button" className="btn quiet" autoFocus={danger} onClick={() => onDone(false)}>{cancel ?? L("إلغاء", "Cancel")}</button>
      </div>
    </dialog>,
    document.body,
  );
}

// ───── Side sheet. Asked before it closes by the person (X, Esc): onRequestClose; the page decides (unsaved-changes guard). ─────
export function Sheet({ title, footer, children, onRequestClose }: { title: string; footer?: ReactNode; children: ReactNode; onRequestClose: () => void }) {
  const { L } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const close = useRef(onRequestClose);
  useEffect(() => { close.current = onRequestClose; });
  useEffect(() => {
    const last = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => setShow(true));
    const t = setTimeout(() => (ref.current?.querySelector<HTMLElement>("input:not([disabled]):not([type=hidden]),textarea,.sel-btn:not([disabled]),[data-close]"))?.focus({ preventScroll: true }), 60);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]") && !document.querySelector(".pop")) close.current(); };
    document.addEventListener("keydown", key);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); document.removeEventListener("keydown", key); if (last && document.body.contains(last)) last.focus({ preventScroll: true }); };
  }, []);
  return (
    <div ref={ref} className={`sheet${show ? " show" : ""}`} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <header>
        <h2 id="sheet-title">{title}</h2>
        <button type="button" className="ic-btn" data-close aria-label={L("إغلاق", "Close")} onClick={() => close.current()}><Icon name="x" /></button>
      </header>
      <div className="body">{children}</div>
      {footer && <footer>{footer}</footer>}
    </div>
  );
}

// ───── Record blocks: a section is a title bubble + a soft panel; a Kv row is label and value ─────
export function Section({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return <div className={`grp-block${wide ? " wide" : " kv-block"}`}><h3 className="grp-title">{title}</h3><div className="grp-panel">{children}</div></div>;
}
export function Kv({ k, children }: { k: string; children?: ReactNode }) {
  return <div className="kv"><span>{k}</span><span>{children === "" || children === null || children === undefined ? "—" : children}</span></div>;
}
export const Ltr = ({ children }: { children: ReactNode }) => <span dir="ltr">{children}</span>;

// ───── Segmented control with a sliding highlight ─────
export function Seg<T extends string>({ label, items, value, onChange, className = "", attrs }: { label: string; items: { id: T; label: ReactNode; attrs?: Record<string, string> }[]; value: T; onChange: (v: T) => void; className?: string; attrs?: Record<string, string> }) {
  const box = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const on = box.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    setThumb(on ? { x: on.offsetLeft, w: on.offsetWidth } : null);
  }, [value, items.length]);
  return (
    <div ref={box} className={`seg ${className}`} role="group" aria-label={label} {...attrs}>
      {thumb && <span className="thumb" style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }} />}
      {items.map((i) => <button key={i.id} type="button" aria-pressed={i.id === value} onClick={() => onChange(i.id)} {...i.attrs}>{i.label}</button>)}
    </div>
  );
}

export function Skeleton({ rows = 6 }: { rows?: number }) {
  const { L } = useT();
  return <div className="skeleton" role="status" aria-busy="true" aria-label={L("جارٍ التحميل", "Loading")}>{Array.from({ length: rows }, (_, i) => <i key={i} />)}</div>;
}
export function EmptyState({ title, text, children, icon = "inbox" }: { title: string; text?: string; children?: ReactNode; icon?: string }) {
  return <div className="empty"><Icon name={icon} size={20} /><strong>{title}</strong>{text && <span>{text}</span>}{children}</div>;
}
