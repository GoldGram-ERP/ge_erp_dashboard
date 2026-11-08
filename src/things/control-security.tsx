"use client";
import { Button, Input } from "@/components/ui";
// الأمان والبيانات (Super admin only): super-control/security-policy, data-reset, activity-log. Ported from docs/nav-preview/app/things/control-security.js.
// Security policy: only inactivityMinutes (whole 1..1440, default 15) is edited (PUT /security-policy {inactivityMinutes}); the other three boxes are shown, not edited.
// Data reset: GET /data-reset {enabled, username}; off => info card, no form. On => warning + the typed username + the password; the button stays disabled until
//   typed.trim().toLowerCase() === username, the password is not empty and the browser is online. POST /data-reset {username, password} (no save key). THE TESTS NEVER PRESS IT.
// Activity log: GET /reports/activity-log?fromDate&toDate&userId&screen&page&pageSize (10|25|50|100, default 25), newest first, no sorting, no totals.
// Not built (queued export jobs, as on the other report pages): Print preview and Excel.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import { timeText } from "@/lib/format";
import type { CustomFormProps, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";
import { ThingPage, toast } from "@/components/engine";
import { Skeleton } from "@/components/engine/ui";
import { useAccess } from "./sales-access";
import { useLeaveGuard } from "./leave-guard";

const MIN = 1, MAX = 1440, DEFAULT_MINUTES = 15;
const SCREENS: Record<string, string> = { access: "access", bank: "bank", bankAccount: "bankAccount", bank_movement: "bankMovement", bank_transfer: "bankTransfer", branch: "branch", cash_movement: "cashMovement", category: "category", expense: "expense", expenseType: "expenseType", expense_refund: "expenseRefund", gold_price_set: "goldPrices", item: "item", piece: "piece", "purchase-coding": "purchaseCoding", "purchase-invoice": "purchaseInvoice", "reprint-label": "reprintLabel", reservation: "reservation", "sales-invoice": "salesInvoice", "sales-return": "salesReturn", security_policy: "securityPolicy", settings: "settings", "stock-count": "stockCount", user: "user" };
const ACTIONS = ["create", "update", "delete", "lock", "unlock", "reprint", "signIn", "signInFailed"];
const typeOf = (r: Row) => String(r.record).split(":")[0];
const idOf = (r: Row) => String(r.record).split(":").slice(1).join(":");
const cairo = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "Africa/Cairo" }).format(new Date(iso));
const dash = "—";
const vals = (x: unknown): Row | null => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Row) : null);
const changedFields = (r: Row) => { const b = vals(r.before), a = vals(r.after); return [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])].filter((f) => f !== "createdAt" && f !== "updatedAt" && JSON.stringify(b?.[f]) !== JSON.stringify(a?.[f])); };
const side = (r: Row, s: "before" | "after") => { const v = vals(r[s]); if (!v) return dash; const f = changedFields(r); return f.length === 0 ? dash : f.map((k) => `${k}: ${v[k] === undefined || v[k] === null ? dash : typeof v[k] === "object" ? JSON.stringify(v[k]) : String(v[k])}`).join(" · "); };
const mono = (s: string) => <bdi dir="ltr" title={s} style={{ fontFamily: "monospace", fontSize: 12 }}>{s}</bdi>;

// ───── security policy ─────
function PolicyPage({ row, tr, close }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("super-control", `securityPolicy.${k}`, v as never);
  const c = (k: string, v?: Record<string, string | number>) => t("common", k, v as never);
  const qc = useQueryClient();
  const [pol, setPol] = useState<Row | null>(row && "inactivityMinutes" in row ? row : null);
  const [failed, setFailed] = useState("");
  useEffect(() => { if (pol) return; api("/security-policy").then(setPol).catch((e) => setFailed(e instanceof ApiFailure ? tr.errorText(e.error) : c("couldNotLoad"))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pol]);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const key = useRef(newSaveKey());
  const { leave, dialog } = useLeaveGuard(tr, dirty, close);
  useEffect(() => { if (pol) { setText(String(pol.inactivityMinutes ?? DEFAULT_MINUTES)); setDirty(false); setNote(""); } }, [pol]);
  if (failed) return <div className="note warn">{failed}</div>;
  if (!pol) return <Skeleton rows={3} />;

  const locked = (label: string, value: string, kind: "number" | "text" = "text") => <div className="field"><label>{label}</label><Input kind={kind} disabled value={value} style={{ borderStyle: "dashed" }} readOnly /></div>;
  async function save() {
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const typed = text.trim().replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
    const n = /^\d+$/.test(typed) ? Number(typed) : NaN;
    if (typed === "") { setErr(c("fieldErrors.required")); revealFirstError(); return; }
    if (!(n >= MIN && n <= MAX)) { setErr(m("inactivityRange", { min: MIN, max: MAX })); revealFirstError(); return; }
    setSaving(true);
    try {
      const next = await api("/security-policy", { method: "PUT", body: { inactivityMinutes: n }, saveKey: key.current });
      key.current = newSaveKey(); toast(m("saved")); setSaving(false); setPol(next); void qc.invalidateQueries({ queryKey: ["thing", "security"] });
    } catch (e) {
      setSaving(false);
      if (!(e instanceof ApiFailure)) { toast(t("errors", "saveFailed"), { error: true }); return; }
      if (!e.unreachable && e.error.message !== "saveInProgress") key.current = newSaveKey();
      const f = e.error?.fields as unknown, bad = Array.isArray(f) ? f.some((x: any) => (x.field ?? x.name) === "inactivityMinutes") : !!(f as Row | undefined)?.inactivityMinutes;
      if (bad) { setErr(m("inactivityRange", { min: MIN, max: MAX })); revealFirstError(); } else toast(tr.errorText(e.error), { error: true });
    }
  }
  return (
    <>
      <div className="card">
        <h3 className="grp-title">{m("signIn")}</h3>
        <div className="formgrid">
          {locked(m("maxFailedSignIns"), String(pol.maxFailedSignIns ?? 5), "number")}
          {locked(m("lockMode"), m("lockModeValue"))}
          {locked(m("passwordLength"), m("passwordLengthValue", { min: pol.passwordMinLength ?? 8, max: pol.passwordMaxLength ?? 128 }))}
        </div>
        <p className="mute">{m("fixedHint")}</p>
        <h3 className="grp-title">{m("session")}</h3>
        <form id="sp" noValidate onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <div className="field" data-k="inactivityMinutes" data-err={err ? "" : undefined}>
            <label htmlFor="f-inactivityMinutes">{m("inactivityMinutes")} <span className="req" aria-hidden="true">*</span></label>
            <Input id="f-inactivityMinutes" kind="number" inputMode="numeric" dir="ltr" maxLength={5} autoComplete="off" value={text} aria-invalid={!!err} style={{ textAlign: "end" }}
              onChange={(e) => { setText(e.target.value); setErr(""); setDirty(true); key.current = newSaveKey(); setNote(c("unsavedChanges")); }} />
            <div className="help">{m("inactivityHint")}</div>
            {err && <FieldError>{err}</FieldError>}
          </div>
        </form>
      </div>
      <div className="formbar">
        <Button variant="primary" id="sp-save" disabled={saving} onClick={() => void save()}>{saving ? c("saving") : c("saveChanges")}</Button>
        <Button id="sp-cancel" onClick={() => void leave()}>{c("cancel")}</Button>
        <span className="mute" id="sp-note">{note}</span>
      </div>
      {dialog}
    </>
  );
}

// ───── data reset ─────
function ResetPage({ tr }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string>) => t("super-control", `dataReset.${k}`, v);
  const [state, setState] = useState<Row | null>(null);
  const [failed, setFailed] = useState("");
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [online, setOnline] = useState(true);
  const [passErr, setPassErr] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { api("/data-reset").then(setState).catch((e) => setFailed(e instanceof ApiFailure ? tr.errorText(e.error) : t("common", "couldNotLoad"))); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  if (failed) return <div className="note warn">{failed}</div>;
  if (!state) return <Skeleton rows={2} />;
  if (!state.enabled) return <section className="card" role="status"><h2>{m("offTitle")}</h2><p className="mute">{m("offBody")}</p></section>;
  const ready = user.trim().toLowerCase() === state.username && state.username !== "" && pass.length > 0 && online && !busy;
  async function go() {
    if (!ready) return;
    setBusy(true); setErr(""); setPassErr("");
    try { await api("/data-reset", { method: "POST", body: { username: user, password: pass } }); location.reload(); }   // every session is gone: the app lands on sign-in
    catch (e) {
      setBusy(false);
      if (e instanceof ApiFailure && e.error.message === "wrongEmailOrPassword") { setPassErr(m("wrongPassword")); revealFirstError(); return; }
      setErr(e instanceof ApiFailure ? tr.errorText(e.error) : t("errors", "saveFailed"));
      revealFirstError();
    }
  }
  return (
    <>
      <div className="note warn" role="alert"><b>{m("warningTitle")}</b><br />{m("warningBody")}</div>
      <form id="dr" className="card" noValidate autoComplete="off" onSubmit={(e) => e.preventDefault()}>
        <div className="field" data-k="username">
          <label htmlFor="f-username">{m("typeUsername", { username: state.username })}</label>
          <Input id="f-username" dir="ltr" maxLength={100} autoComplete="off" autoCapitalize="none" spellCheck={false} value={user} onChange={(e) => setUser(e.target.value)} />
        </div>
        <div className="field" data-k="password" data-err={passErr ? "" : undefined}>
          <label htmlFor="f-password">{m("password")}</label>
          <Input id="f-password" type="password" maxLength={200} autoComplete="new-password" value={pass} aria-invalid={!!passErr} onChange={(e) => { setPass(e.target.value); setPassErr(""); }} />
          {passErr && <FieldError>{passErr}</FieldError>}
        </div>
        {err && <FieldError id="dr-err">{err}</FieldError>}
      </form>
      <div className="formbar"><Button variant="plain" danger id="dr-go" disabled={!ready} onClick={() => void go()}>{busy ? m("resetting") : m("reset")}</Button></div>
      {!ready && !busy && <div className="help" id="dr-why">{tr.L("اكتب اسم المستخدم الصحيح وكلمة المرور (وكن متصل بالإنترنت) عشان الزرار يشتغل.", "Type the exact username and the password (and be online) to enable the button.")}</div>}
    </>
  );
}

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("super-control", k, v as never);
  const c = (k: string) => t("common", k);
  const screenText = (type: string) => (SCREENS[type] ? m(`activityLog.screens.${SCREENS[type]}`) : type);
  const actionText = (a: string) => (ACTIONS.includes(a) ? m(`activityLog.actions.${a}`) : a);
  return {
    id: "security",
    title: m("securityPolicy.title"),
    unit: L("سجل", "records"),
    keys: ["super-control/security-policy", "super-control/data-reset", "super-control/activity-log"],
    views: [
      {
        id: "policy", label: m("securityPolicy.title"), keys: ["super-control/security-policy"],
        create: [{ form: "policy", label: c("edit") }],
        load: async () => ({ items: [{ id: "policy", ...(await api("/security-policy")) }] }),
        paging: false,
        onRow: (row, h) => h.openForm("policy", row),
        columns: [
          { key: "maxFailedSignIns", label: m("securityPolicy.maxFailedSignIns"), type: "int" },
          { key: "lockMode", label: m("securityPolicy.lockMode"), get: () => m("securityPolicy.lockModeValue") },
          { key: "passwordLength", label: m("securityPolicy.passwordLength"), get: (r) => m("securityPolicy.passwordLengthValue", { min: r.passwordMinLength, max: r.passwordMaxLength }) },
          { key: "inactivityMinutes", label: m("securityPolicy.inactivityMinutes"), type: "int" },
        ],
      },
      {
        id: "reset", label: m("dataReset.title"), keys: ["super-control/data-reset"], create: [],
        load: async () => ({ items: [{ id: "reset", ...(await api("/data-reset")) }] }),
        paging: false,
        onRow: (row, h) => h.openForm("reset", row),
        columns: [
          { key: "id", label: m("dataReset.title"), get: () => m("dataReset.title") },
          { key: "enabled", label: L("الحالة", "Status"), type: "status", get: (r) => (r.enabled ? "on" : "off"), statuses: { on: [L("متاح", "Available"), "warn"], off: [m("dataReset.offTitle"), "off"] } },
        ],
      },
      {
        id: "log", label: m("activityLog.title"), keys: ["super-control/activity-log"], create: [],
        endpoint: "/reports/activity-log", runLabel: t("common", "report.run"),
        paging: { param: "page", sizeParam: "pageSize", sizes: [10, 25, 50, 100], size: 25 },
        filters: [
          { name: "fromDate", label: m("activityLog.fromDate"), type: "date" },
          { name: "toDate", label: m("activityLog.toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? t("common", "report.toBeforeFrom") : null) },
          { name: "userId", label: m("activityLog.user"), type: "select", optionsFrom: { path: "/users", value: "id", label: "username" }, placeholder: t("common", "report.all") },
          { name: "screen", label: m("activityLog.screen"), type: "select", options: Object.keys(SCREENS).map((k) => [k, screenText(k)]), placeholder: t("common", "report.all") },
        ],
        columns: [
          { key: "date", label: m("activityLog.columns.date"), sortable: false, render: (r) => <span dir="ltr">{cairo(r.at, { day: "2-digit", month: "2-digit", year: "numeric" })}</span> },
          { key: "time", label: m("activityLog.columns.time"), sortable: false, render: (r) => <span dir="ltr">{timeText(r.at, undefined, true)}</span> },
          { key: "user", label: m("activityLog.columns.user"), sortable: false, render: (r) => (r.userName ? <bdi dir="auto">{r.userName}</bdi> : r.userId ? mono(r.userId) : m("activityLog.system")) },
          { key: "screen", label: m("activityLog.columns.screen"), sortable: false, get: (r) => screenText(typeOf(r)) },
          { key: "action", label: m("activityLog.columns.action"), sortable: false, get: (r) => actionText(r.action) },
          { key: "record", label: m("activityLog.columns.record"), sortable: false, render: (r) => (idOf(r) ? mono(idOf(r)) : dash) },
          { key: "changed", label: m("activityLog.columns.changed"), sortable: false, render: (r) => { const f = changedFields(r); return f.length ? mono(f.join(", ")) : dash; } },
          { key: "before", label: m("activityLog.columns.before"), sortable: false, render: (r) => mono(side(r, "before")) },
          { key: "after", label: m("activityLog.columns.after"), sortable: false, render: (r) => mono(side(r, "after")) },
        ],
        onRow: false,
      },
    ],
    forms: {
      policy: { display: "page", title: () => m("securityPolicy.title"), fields: [], path: () => "/security-policy", custom: PolicyPage },
      reset: { display: "page", title: () => m("dataReset.title"), fields: [], path: () => "/data-reset", custom: ResetPage },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
