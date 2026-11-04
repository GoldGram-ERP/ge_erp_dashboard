"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, ApiFailure } from "@/lib/api";
import type { Me } from "@/stores/ui";

// Port of the mockup's session-lock.js. Limit: GET /access/session-lock {inactivityMinutes} (re-read every 5 min). Activity is stamped in localStorage
// "ge-erp:last-activity" (at most every 5 s) so work in another tab keeps every tab open. The flag "ge-erp:session-lock" survives reloads.
const LOCK = "ge-erp:session-lock", STAMP = "ge-erp:last-activity";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"];
export const shouldLock = (now: number, last: number, shared: number, limitMinutes: number) => now - Math.max(last, shared || 0) >= limitMinutes * 60000;

export function SessionLock({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const t = useTranslations("access.sessionLock");
  const [locked, setLocked] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const pw = useRef<HTMLInputElement>(null);
  const touch = useRef(() => {});

  useEffect(() => {
    let minutes = 15, minutesAt = 0, last = Date.now(), stamped = 0;
    const isLocked = () => localStorage.getItem(LOCK) === "1";
    const stamp = () => { last = Date.now(); if (last - stamped > 5000) { stamped = last; localStorage.setItem(STAMP, String(last)); } };
    touch.current = stamp;
    const readMinutes = async () => {
      if (Date.now() - minutesAt < 300000) return;
      minutesAt = Date.now();
      try { const m = Number((await api("/access/session-lock"))?.inactivityMinutes); if (m >= 1 && m <= 1440) minutes = m; } catch { minutes = 15; }
    };
    const onStorage = (e: StorageEvent) => { if (e.key === LOCK) setLocked(isLocked()); };
    EVENTS.forEach((ev) => window.addEventListener(ev, stamp, { capture: true, passive: true }));
    window.addEventListener("storage", onStorage);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the stored flag once on mount (not available during SSR)
    stamp(); readMinutes(); setLocked(isLocked());
    const timer = setInterval(() => {
      readMinutes();
      if (!isLocked() && shouldLock(Date.now(), last, Number(localStorage.getItem(STAMP)), minutes)) { localStorage.setItem(LOCK, "1"); setLocked(true); }
    }, 1000);
    return () => { clearInterval(timer); EVENTS.forEach((ev) => window.removeEventListener(ev, stamp, { capture: true })); window.removeEventListener("storage", onStorage); };
  }, []);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (locked && !d.open) { d.showModal(); pw.current?.focus(); } else if (!locked && d.open) d.close();
  }, [locked]);

  async function unlock(ev: React.FormEvent) {
    ev.preventDefault();
    const value = pw.current?.value ?? "";
    if (!value.trim()) { setErr(t("required")); return; }
    setBusy(true); setErr("");
    try {
      await api("/access/session-lock/unlock", { method: "POST", body: { password: value } });
      localStorage.removeItem(LOCK); touch.current(); setLocked(false); setBusy(false);
      if (pw.current) pw.current.value = "";
    } catch (ex) {
      setBusy(false);
      if (!(ex instanceof ApiFailure)) { setErr(t("failed")); return; }
      if (ex.unreachable) { setErr(t("unreachable")); return; }
      if (ex.error?.message === "accountLocked") { onSignOut(); return; }
      const left = ex.error?.values?.count;
      setErr(`${t("wrong")}${left !== undefined ? ` ${t("attemptsLeft", { count: Number(left) })}` : ""}`);
      if (pw.current) { pw.current.value = ""; pw.current.focus(); }
    }
  }
  return (
    <dialog ref={dlg} className="lock" onCancel={(e) => e.preventDefault()} aria-labelledby="lock-title">
      <form onSubmit={unlock} noValidate>
        <h2 id="lock-title">{t("title")}</h2>
        <p>{t("signedInAs")} <b>{me.name}</b></p>
        <p>{t("body")}</p>
        <div className="field"><label htmlFor="lock-pw">{t("password")}</label><input id="lock-pw" ref={pw} type="password" autoComplete="current-password" dir="ltr" style={{ textAlign: "start" }} /></div>
        <div className="err" id="lock-err" role="alert" hidden={!err}>{err}</div>
        <div className="row"><button className="btn primary" id="lock-go" type="submit" disabled={busy}>{busy ? t("unlocking") : t("continue")}</button><button className="btn quiet" id="lock-out" type="button" onClick={onSignOut}>{t("signOut")}</button></div>
      </form>
    </dialog>
  );
}
