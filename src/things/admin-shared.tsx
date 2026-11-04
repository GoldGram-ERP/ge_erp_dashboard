"use client";
// Shared by the Users and the Admin accounts pages: who may manage whom, the screen and job names, the record sheet body and the user form.
// Ported from docs/nav-preview/app/things/admin-shared.js. Backend wins where it differs: canGiveCashDiscount is not in the backend DTO,
// so it is sent only when the person changed it. Forced password change and the lock after 5 wrong passwords are backend behaviour only
// (the form has no control for them; a locked account shows the locked badge and the Unlock action).
// shortcut: the page's "back" button leaves without the unsaved-changes question (Cancel asks); upgrade when the engine exposes a leave guard.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, FieldConfig, LookupSpec, Row } from "@/lib/engine-types";
import { rowsOf } from "@/lib/fields";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, toast, useConfirm } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { JOBS, SECTIONS, type ScreenName, type Section as Sec } from "./admin-names";

export const code6 = (n: unknown) => String(n).padStart(6, "0");   // userCodeText: six digits
export const TYPES = ["user", "admin", "super_admin"] as const;
export const SHORTCUTS_MAX = 12;
const GROUPS = ["sell", "stock", "finance", "people", "control"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const mayManage = (viewer: string | undefined, type: string) => viewer === "super_admin" || (viewer === "admin" && type === "user");
export const manageable = (viewer: string | undefined) => (r: Row) => !r.deletedAt && mayManage(viewer, r.userType);
export const nameOfUser = (r: Row) => [r.firstName, r.familyName].filter(Boolean).join(" ") || r.username;   // the backend's displayName

const screenName = (tr: Tr, x: ScreenName) => tr.L(x[1], x[2]);
const secName = (tr: Tr, s: Sec) => (tr.locale === "ar" && !s[3] ? s[1] : s[2]);
export const keyName = (tr: Tr, key: string) => { const [sid, id] = key.split("/"); const x = SECTIONS.find((s) => s[0] === sid)?.[4].find((y) => y[0] === id); return x ? screenName(tr, x) : key; };
export const jobName = (tr: Tr, id: string) => { const j = JOBS.find((x) => x[0] === id); return j ? tr.L(j[2], j[3]) : id; };
export const typeName = (tr: Tr, x: string) => tr.t("administration", `users.userTypes.${x}`);

// The screens a user of this type may pin: built ones (with an address) the type may open, by section.
const mayOpen = (type: string, s: Sec, x: ScreenName) => (s[0] !== "super-control" || type === "super_admin") && (!x[4] || type !== "user");
const shortcutChoices = (type: string) => SECTIONS.flatMap((s) => { const list = s[4].filter((x) => x[3] && mayOpen(type, s, x)); return list.length ? [{ s, list }] : []; });
const shortcutIds = (ids: string[], type: string) => ids.filter((id) => shortcutChoices(type).some((g) => g.list.some((x) => x[0] === id)));

type Maps = { modules: { id: string; name: string; list: { key: string; name: string }[] }[]; jobScreens: Record<string, string[]> };
const offeredModules = (tr: Tr, screens: any) => (screens?.modules ?? []).flatMap((m: any) => {
  const s = SECTIONS.find((x) => x[0] === m.id);
  const list = (m.screens ?? []).flatMap(({ key, offeredToUser }: any) => { const x = s?.[4].find((y) => `${s[0]}/${y[0]}` === key); return offeredToUser && x ? [{ key, name: screenName(tr, x) }] : []; });
  return s && list.length ? [{ id: s[0], name: secName(tr, s), list }] : [];
}) as Maps["modules"];

const OWN: Record<string, Record<string, string>> = { username: { taken: "usernameTaken", invalid: "usernameInvalid", tooShort: "usernameTooShort" }, email: { taken: "emailTaken", invalid: "emailInvalid", wrongDomain: "emailWrongDomain" }, password: { tooShort: "passwordTooShort" }, confirmPassword: { mismatch: "passwordMismatch" }, screens: { unknownScreen: "screens.unknown", invalid: "screens.unknown" } };
function refusedFields(tr: Tr, error: any): Record<string, string> {
  const { t } = tr;
  const text = (name: string, key: string) => {
    const own = OWN[name]?.[key]; if (own) return t("administration", `users.${own}`);
    const g = t("common", `fieldErrors.${key}`); return g !== `fieldErrors.${key}` ? g : t("common", "fieldErrors.invalid");
  };
  const out: Record<string, string> = {}, f = error?.fields;
  if (Array.isArray(f)) for (const x of f) out[x.field ?? x.name] = text(x.field ?? x.name, x.message ?? x.key);
  else if (f && typeof f === "object") for (const [k, v] of Object.entries<any>(f)) out[k] = text(k, typeof v === "string" ? v : v?.message);
  if (error?.message === "unknownScreen") out.screens = t("administration", "users.screens.unknown");
  return out;
}

/** The record sheet body shared by Users (full) and Admin accounts. */
export function UserRecord({ r, tr }: { r: Row; tr: Tr }) {
  const u = (k: string) => tr.t("administration", `users.${k}`);
  return (
    <>
      {r.deletedAt ? <div className="note warn">{u("deletedBadge")}</div> : r.locked ? <div className="note warn"><b>{u("lockedBadge")}</b> · {u("lockedNote")}</div> : null}
      <Section title={u("details")}>
        <Kv k={u("userCode")}><Ltr>{code6(r.userCode)}</Ltr></Kv>
        <Kv k={u("branchId")}>{r.branchName ?? ""}</Kv>
        <Kv k={u("username")}><bdi dir="ltr">{r.username}</bdi></Kv>
        <Kv k={u("email")}>{r.needsEmail ? "" : <bdi dir="ltr">{r.email}</bdi>}</Kv>
        <Kv k={u("userType")}>{typeName(tr, r.userType)}</Kv>
        {r.userType === "user" && <Kv k={u("canUseTreasuries")}>{u(r.canUseTreasuries ? "yes" : "no")}</Kv>}
      </Section>
      <Section title={u("screens.heading")}>
        {r.userType === "user"
          ? (r.screens?.length ? <div className="chips">{r.screens.map((k: string) => <span key={k} className="st off"><i />{keyName(tr, k)}</span>)}</div> : <p className="mute">{u("screens.none")}</p>)
          : <p className="mute">{u(`screens.fixed.${r.userType}`)}</p>}
      </Section>
    </>
  );
}

const Check = ({ checked, disabled, onChange, label, ind, ...rest }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: ReactNode; ind?: boolean; [k: string]: any }) => (
  <label className="field check"><input type="checkbox" ref={(el) => { if (el) el.indeterminate = !!ind; }} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} {...rest} /><span>{label}</span></label>
);

type Props = CustomFormProps & { onlyTypes?: readonly string[]; path: string; staysAfterAdd?: boolean };

/** The user form (page): Users (/users, all manageable types) and Admin accounts (/admin-accounts, admin + super admin). */
export function UserForm(props: Props) {
  const [n, setN] = useState(0);
  const [full, setFull] = useState<Row | null | undefined>(props.row ? undefined : null);
  useEffect(() => { if (props.row) api(`/users/${props.row.id}`).then(setFull).catch(() => setFull(props.row)); }, [props.row]);
  if (full === undefined) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>;
  return <UserFormBody key={n} {...props} row={full} again={() => setN((x) => x + 1)} />;
}

function UserFormBody({ row, close, reload, tr, onlyTypes, path, staysAfterAdd = true, again }: Props & { again: () => void }) {
  const { t, L } = tr;
  const u = (k: string, v?: Record<string, any>) => t("administration", `users.${k}`, v);
  const c = (k: string, v?: Record<string, any>) => t("common", k, v);
  const qc = useQueryClient();
  const { data: me } = useMe();
  const adding = !row;
  const types = (onlyTypes ?? TYPES).filter((x) => mayManage(me?.userType, x));
  const onlyType = onlyTypes?.[0] ?? (types.length === 1 ? types[0] : "");
  const initialDiscount = !!(row as Row | null)?.canGiveCashDiscount;
  const [ty, setTy] = useState<string>(row?.userType ?? onlyType);
  const [confirm, dialog] = useConfirm();

  const branchSpec: LookupSpec = useMemo(() => ({ path: "/branches", value: "id", label: (r: Row) => `${code6(r.branchCode)} · ${r.branchName}` }), []);
  const all: (FieldConfig & { only?: string })[] = [
    { name: "userCode", label: u("userCode"), type: "code", documentType: "user", hint: u("autoHint"), section: u("details") },
    { name: "branchId", label: u("branchId"), type: "select", optionsFrom: branchSpec, searchable: true, placeholder: u("branchSearchPlaceholder"), required: true, section: u("details"), only: "!super_admin" },
    { name: "username", label: u("username"), type: "text", required: true, maxLength: 31, autocomplete: "off", section: u("details"),
      validate: (v) => (!/^[A-Za-z0-9_.]+$/.test(v) ? u("usernameInvalid") : v.length < 3 ? u("usernameTooShort") : v.length > 30 ? c("fieldErrors.tooLong") : null) },
    { name: "email", label: u("email"), type: "text", maxLength: 255, section: u("details"), help: !adding && !row.needsEmail ? u("emailKeepHint") : "",
      validate: (v) => (v === "" ? null : !EMAIL.test(v) ? u("emailInvalid") : v.length > 254 ? c("fieldErrors.tooLong") : null) },
    { name: "userType", label: u("userType"), type: "select", required: true, section: u("details"), searchable: false, options: types.map((x) => [x, typeName(tr, x)]), default: onlyType },
    { name: "password", label: u("password"), type: "password", required: adding, maxLength: 129, autocomplete: "new-password", section: u("details"), help: !adding ? u("passwordKeepHint") : "",
      validate: (v) => (v === "" ? null : v.trim() === "" ? (adding ? c("fieldErrors.required") : c("fieldErrors.invalid")) : v.length < 8 ? u("passwordTooShort") : v.length > 128 ? c("fieldErrors.tooLong") : null) },
    { name: "confirmPassword", label: u("confirmPassword"), type: "password", required: adding, maxLength: 129, autocomplete: "new-password", section: u("details"),
      validate: (v, a) => (adding && v === "" ? c("fieldErrors.required") : v !== a.password ? u("passwordMismatch") : null) },
    { name: "canUseTreasuries", label: u("canUseTreasuries"), type: "checkbox", help: u("canUseTreasuriesHint"), wide: true, section: u("details"), only: "user" },
    { name: "canGiveCashDiscount", label: u("canGiveCashDiscount"), type: "checkbox", help: u("canGiveCashDiscountHint"), wide: true, section: u("details"), only: "user" },
  ];
  const fields = useMemo(() => all.filter((f) => !f.only || (f.only === "user" ? ty === "user" : ty !== "super_admin")), [ty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = useMemo(() => ({ userCode: row?.userCode, branchId: row?.branchId ?? "", username: row?.username ?? "", email: row && !row.needsEmail ? row.email : "", userType: row?.userType ?? onlyType, password: "", confirmPassword: "",
    canUseTreasuries: row?.canUseTreasuries ?? false, canGiveCashDiscount: row?.canGiveCashDiscount ?? false }), [row, onlyType]);
  const f = useFieldsForm(fields, values);
  const saveKey = useRef(newSaveKey());
  const [dirty, setDirty] = useState(false);
  const mark = () => { saveKey.current = newSaveKey(); setDirty(true); };
  useEffect(() => { const s = f.watch((v, info) => { mark(); if (info.name === "userType") setTy(String(v.userType ?? "")); }); return () => s.unsubscribe(); }, [f]);
  // a lone branch is the one (not an unsaved change)
  useEffect(() => { if (adding) api("/branches", { query: { limit: 20 } }).then((r) => { const rows = rowsOf(r); if (rows.length === 1 && !f.getValues("branchId")) f.setValue("branchId", rows[0].id); }).catch(() => {}); }, [adding, f]);

  // shortcuts, screens, jobs
  const [short, setShort] = useState<string[]>([...(row?.shortcutScreens ?? [])]);
  const [screens, setScreens] = useState<Set<string>>(new Set(row?.screens ?? []));
  const [jobs, setJobs] = useState<Set<string>>(new Set());
  const [jobsInit, setJobsInit] = useState("[]");
  const [tab, setTab] = useState<"job" | "screen">((row as Row | null)?.openTab === "screen" ? "screen" : "job");
  const [openShort, setOpenShort] = useState(false);
  const [q, setQ] = useState("");
  const [permErr, setPermErr] = useState(""), [shortErr, setShortErr] = useState(""), [alert, setAlert] = useState(""), [note, setNote] = useState(""), [saving, setSaving] = useState(false);
  const permQ = useQuery({ queryKey: ["users", "screens-jobs"], staleTime: Infinity, queryFn: async () => { const [s, j] = await Promise.all([api("/users/screens"), api("/users/jobs")]); return { screens: s, jobScreens: Object.fromEntries((j.jobs ?? []).map((x: any) => [x.id, x.screens as string[]])) as Record<string, string[]> }; } });
  const savedJobs = useQuery({ enabled: row?.userType === "user", queryKey: ["users", "jobs", row?.id], gcTime: 0, queryFn: () => api(`/users/${row!.id}/jobs`).catch(() => ({ jobIds: [] })) });
  useEffect(() => { if (savedJobs.data) { setJobs(new Set<string>(savedJobs.data.jobIds)); setJobsInit(JSON.stringify([...savedJobs.data.jobIds].sort())); } }, [savedJobs.data]);
  const jobScreens = (id: string) => permQ.data?.jobScreens[id] ?? [];
  const mods = useMemo(() => offeredModules(tr, permQ.data?.screens), [tr, permQ.data]);
  const offered = mods.flatMap((m) => m.list.map((x) => x.key)), offSet = new Set(offered);
  const jobsOpenFor = (ids: string[], scr: Iterable<string>) => { const open = new Set(scr); return ids.filter((id) => jobScreens(id).some((k) => open.has(k))); };
  const givable = (id: string) => jobScreens(id).every((k) => offSet.has(k));
  const offeredJobs = () => JOBS.map((j) => j[0]).filter((id) => permQ.data?.jobScreens[id] && givable(id));

  const toggleScreens = (keys: string[], on: boolean) => {
    const before = new Set(screens), now = new Set(screens);
    for (const k of keys) on ? now.add(k) : now.delete(k);
    // a job stays only while a screen of it is open, and a job made whole by this change keeps its tick
    setJobs(new Set(jobsOpenFor([...jobs], now).filter((id) => { const ks = jobScreens(id); return !ks.every((k) => before.has(k)) || ks.every((k) => now.has(k)); })));
    setScreens(now); mark();
  };
  const toggleJobs = (ids: string[], on: boolean, opens = true) => {
    const nj = new Set(jobs), ns = new Set(screens);
    for (const id of ids) {
      if (!on) { nj.delete(id); continue; }
      nj.add(id);
      const keys = jobScreens(id);
      if (opens || !keys.some((k) => ns.has(k))) keys.forEach((k) => ns.add(k));
    }
    setJobs(nj); setScreens(ns); mark();
  };
  const groups = shortcutChoices(ty || "user");
  const shortNow = shortcutIds(short, ty || "user");   // a type changed after choosing drops the others
  const nm = (id: string) => { for (const g of groups) { const x = g.list.find((y) => y[0] === id); if (x) return screenName(tr, x); } return id; };

  const leave = async () => { if (!dirty || await confirm({ title: c("unsaved.title"), text: c("unsaved.body"), ok: c("unsaved.leave"), cancel: c("unsaved.keepEditing"), danger: true })) close(); };
  const save = async () => {
    setAlert(""); setPermErr(""); setShortErr("");
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const v = await f.read();
    if (!v) { setAlert(c("couldNotSave", { count: Object.keys(f.formState.errors).length || 1 })); return; }
    if (ty === "user" && permQ.data && screens.size === 0 && !(await confirm({ title: u("screens.noneTitle"), text: u("screens.noneBody"), ok: c("save"), cancel: c("cancel") }))) return;
    const discount = !!v.canGiveCashDiscount;
    const body = { ...(ty === "super_admin" ? {} : { branchId: v.branchId }), username: v.username, ...(v.email === "" ? {} : { email: v.email }), userType: ty,
      shortcutScreens: shortNow,
      ...(ty === "user" ? { screens: [...screens], canUseTreasuries: !!v.canUseTreasuries, ...(discount !== initialDiscount ? { canGiveCashDiscount: discount } : {}) } : {}),
      ...(v.password === "" ? {} : { password: v.password }) };
    setSaving(true); setNote(c("savingNote"));
    try {
      const saved = await api(adding ? path : `${path}/${row.id}`, { method: adding ? "POST" : "PATCH", body, saveKey: saveKey.current });
      if (ty === "user" && JSON.stringify([...jobs].sort()) !== jobsInit) await api(`/users/${saved.id}/jobs`, { method: "PUT", body: { jobIds: jobsOpenFor([...jobs], screens) } });
      saveKey.current = newSaveKey(); setDirty(false);
      if (saved.id === me?.id) qc.invalidateQueries({ queryKey: ["me"] });
      toast(adding ? u("savedNumber", { code: code6(saved.userCode) }) : u("changesSaved"));
      if (adding && staysAfterAdd) { again(); return; }   // the dashboard stays on the empty form so the next number shows
      reload();
    } catch (e: any) {
      setSaving(false); setNote("");
      if (!(e instanceof ApiFailure)) { toast(t("errors", "saveFailed"), { error: true }); return; }
      if (e.status === 404) { toast(u("notFound"), { error: true }); close(); return; }
      if (!e.unreachable && e.error.message !== "saveInProgress") saveKey.current = newSaveKey();
      const fe = refusedFields(tr, e.error);
      if (fe.screens) { setTab("screen"); setPermErr(fe.screens); }
      if (fe.shortcutScreens) setShortErr(fe.shortcutScreens);
      if (Object.keys(fe).length) { f.setErrors(fe); setAlert(c("couldNotSave", { count: Object.keys(fe).length })); return; }
      toast(tr.errorText(e.error), { error: true });
    }
  };

  const loaded = !!permQ.data, shownTab = permErr ? "screen" : tab;
  const perm = ty !== "user"
    ? <><p className="mute">{ty ? u(`screens.fixed.${ty}`) : u("screens.chooseType")}</p>{ty && <p className="mute">{u("jobs.all")}</p>}</>
    : permQ.isError ? <><div className="note warn">{c("couldNotLoad")}</div><button type="button" className="btn quiet" onClick={() => permQ.refetch()}>{c("retry")}</button></>
    : !loaded ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
    : <>
      <div className="seg" role="tablist" aria-label={u("jobs.tabs")}>{(["job", "screen"] as const).map((k) => <button key={k} type="button" role="tab" aria-pressed={shownTab === k} aria-selected={shownTab === k} onClick={() => setTab(k)}>{u(k === "job" ? "jobs.byJob" : "jobs.byScreen")}</button>)}</div>
      {shownTab === "screen" ? (() => { const open = offered.filter((k) => screens.has(k)).length; return <>
        <div className="actions"><span dir="ltr" aria-live="polite">{u("screens.count", { open, all: offered.length })}</span>
          <button type="button" className="btn quiet sm" disabled={open === offered.length} onClick={() => toggleScreens(offered, true)}>{u("screens.selectAll")}</button>
          <button type="button" className="btn quiet sm" disabled={open === 0} onClick={() => toggleScreens(offered, false)}>{u("screens.unselectAll")}</button></div>
        <p className="mute">{u("screens.note")}</p>
        {mods.map((m) => { const keys = m.list.map((x) => x.key), on = keys.filter((k) => screens.has(k)).length;
          return <fieldset key={m.id}><legend>{m.name}</legend>
            <Check checked={on === keys.length} ind={on > 0 && on < keys.length} onChange={(v) => toggleScreens(keys, v)} aria-label={u("screens.module", { name: m.name })} label={<><b>{m.name}</b> <span dir="ltr" className="mute">{on}/{keys.length}</span></>} />
            {m.list.map((x) => <Check key={x.key} checked={screens.has(x.key)} onChange={(v) => toggleScreens([x.key], v)} label={x.name} data-screen={x.key} />)}</fieldset>; })}
      </>; })() : (() => {
        const list = JOBS.filter((j) => permQ.data!.jobScreens[j[0]]), allIds = list.map((j) => j[0]).filter(givable), given = allIds.filter((id) => jobs.has(id)).length;
        return <>
          <div className="actions"><span dir="ltr" aria-live="polite">{u("jobs.count", { given, all: allIds.length })}</span>
            <button type="button" className="btn quiet sm" disabled={given === allIds.length} onClick={() => toggleJobs(offeredJobs(), true)}>{u("jobs.selectAll")}</button>
            <button type="button" className="btn quiet sm" disabled={given === 0} onClick={() => toggleJobs(offeredJobs(), false)}>{u("jobs.unselectAll")}</button></div>
          <p className="mute">{u("jobs.note")}</p>
          {GROUPS.map((g) => { const inG = list.filter((j) => j[1] === g); if (!inG.length) return null;
            const ids = inG.map((j) => j[0]).filter(givable), on = ids.filter((id) => jobs.has(id)).length, gname = t("jobs", `groups.${g}`);
            return <fieldset key={g}><legend>{gname}</legend>
              <Check checked={ids.length > 0 && on === ids.length} ind={on > 0 && on < ids.length} disabled={!ids.length} onChange={(v) => toggleJobs(ids, v)} aria-label={u("jobs.group", { name: gname })} label={<><b>{gname}</b> <span dir="ltr" className="mute">{on}/{ids.length}</span></>} />
              {inG.map((j) => { const id = j[0], can = givable(id), keys = jobScreens(id), missing = keys.filter((k) => !screens.has(k)), part = can && missing.length > 0 && missing.length < keys.length, half = part && jobs.has(id);
                return <div key={id}><Check checked={can && jobs.has(id)} disabled={!can} onChange={(v) => toggleJobs([id], v, false)} data-job={id} label={<>{L(j[2], j[3])}{!can && <> <span className="mute">{u("jobs.adminOnly")}</span></>}</>} />
                  {part && <div className={half ? "note warn" : "mute"}><b>{u("jobs.partCount", { open: keys.length - missing.length, all: keys.length })}</b> {u("jobs.partMissing", { names: missing.map((k) => keyName(tr, k)).join(tr.isAr ? "، " : ", ") })}
                    {half && <> <button type="button" className="btn quiet sm" onClick={() => { keys.forEach((k) => screens.add(k)); setScreens(new Set(screens)); mark(); }}>{u("jobs.giveMissing")}</button></>}</div>}</div>; })}</fieldset>; })}
        </>; })()}
    </>;

  const ql = q.trim().toLowerCase();
  return (
    <>
      {dialog}
      <div className="card"><FormFields form={f} fields={fields} values={values} /></div>
      <Section title={u("shortcuts")}>
        <label>{u("shortcutScreens")} <span className="mute">· {u("optional")}</span></label>
        <div className="chips">{shortNow.map((id) => <span key={id} className="st off"><i />{nm(id)} <button type="button" className="btn quiet sm" aria-label={u("removeShortcut", { name: nm(id) })} onClick={() => { setShort(shortNow.filter((x) => x !== id)); mark(); }}>×</button></span>)}</div>
        <button type="button" className="btn quiet sm" aria-expanded={openShort} onClick={() => setOpenShort(!openShort)}>{shortNow.length === 0 ? u("shortcutsChoose") : u("shortcutsCount", { count: shortNow.length, max: SHORTCUTS_MAX })}</button>
        {openShort && <div className="card"><input id="short-q" placeholder={u("shortcutsSearch")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label={u("shortcutsSearch")} />
          {groups.map((g) => { const items = g.list.filter((x) => !ql || [x[0], x[1], x[2], secName(tr, g.s)].some((s) => s.toLowerCase().includes(ql))); const full = shortNow.length >= SHORTCUTS_MAX;
            return items.length ? <div key={g.s[0]}><h4>{secName(tr, g.s)}</h4>{items.map((x) => { const on = shortNow.includes(x[0]); return <Check key={x[0]} checked={on} disabled={full && !on} data-short={x[0]} label={screenName(tr, x)} onChange={(v) => { setShort(v ? [...shortNow, x[0]] : shortNow.filter((y) => y !== x[0])); mark(); }} />; })}</div> : null; })}
          {shortNow.length >= SHORTCUTS_MAX && <p className="mute">{u("shortcutsFull", { max: SHORTCUTS_MAX })}</p>}</div>}
        <div className="help">{u("shortcutsHint", { max: SHORTCUTS_MAX })}</div>
        {shortErr && <div className="err" role="alert">{shortErr}</div>}
      </Section>
      <Section title={u("screens.heading")} wide>{perm}{permErr && <div className="err" role="alert">{permErr}</div>}</Section>
      {alert && <div className="err" role="alert">{alert}</div>}
      <div className="formbar">
        <button type="button" className="btn primary" id="save" disabled={saving} onClick={save}>{saving ? c("saving") : adding ? c("save") : c("saveChanges")}</button>
        <button type="button" className="btn quiet" id="cancel" onClick={leave}>{c("cancel")}</button>
        <span className="mute">{note || (dirty ? c("unsavedChanges") : "")}</span>
      </div>
    </>
  );
}
