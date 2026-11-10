"use client";
// Shared by the Users and the Admin accounts pages: who may manage whom, the screen and job names, the record sheet body and the user form.
// Ported from docs/nav-preview/app/things/admin-shared.js. A plain user also has an optional role name, the allowed actions and the allowed sales channels
// (2026-11-10; hidden by default, Admin and Super admin show none of them). Forced password change and the lock after 5 wrong passwords are backend behaviour only
// (the form has no control for them; a locked account shows the locked badge and the Unlock action).
// shortcut: the page's "back" button leaves without the unsaved-changes question (Cancel asks); upgrade when the engine exposes a leave guard.
import { FieldError } from "@/components/fields/FieldError";
import { Button, Checkbox, CheckInput, Input, Select, Status } from "@/components/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, FieldConfig, LookupSpec, Row } from "@/lib/engine-types";
import { rowsOf } from "@/lib/fields";
import { ACTIONS, BUSINESS_ROLES } from "@/lib/actions";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, toast, useConfirm } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { NAV } from "@/nav/tree";
import { NAV_LABELS } from "@/nav/labels.generated";
import { JOBS, SECTIONS, type ScreenName, type Section as Sec } from "./admin-names";

import { code6 } from "@/lib/code6";
export { code6 };   // userCodeText: six digits
export const TYPES = ["user", "admin", "super_admin"] as const;
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
  const chans = useQuery({ enabled: r.userType === "user", queryKey: ["sales-channels", "all"], staleTime: 60_000, queryFn: () => api("/sales-channels").then(rowsOf) });
  const chanNames = ((r.salesChannelIds ?? []) as string[]).map((id) => ((chans.data ?? []) as Row[]).find((c) => c.id === id)?.channelName).filter(Boolean) as string[];
  return (
    <>
      {r.deletedAt ? <div className="note warn">{u("deletedBadge")}</div> : r.locked ? <div className="note warn"><b>{u("lockedBadge")}</b> · {u("lockedNote")}</div> : null}
      <Section title={u("details")}>
        <Kv k={u("userCode")}><Ltr>{code6(r.userCode)}</Ltr></Kv>
        <Kv k={u("branchId")}>{r.branchName ?? ""}</Kv>
        {r.userType === "user" && <Kv k={u("role")}>{r.businessRole ? u(`roles.${r.businessRole}`) : "—"}</Kv>}
        <Kv k={u("username")}><bdi dir="ltr">{r.username}</bdi></Kv>
        <Kv k={u("email")}>{r.needsEmail ? "" : <bdi dir="ltr">{r.email}</bdi>}</Kv>
        <Kv k={u("userType")}>{typeName(tr, r.userType)}</Kv>
      </Section>
      <Section title={u("screens.heading")}>
        {r.userType === "user"
          ? (r.screens?.length ? <div className="chips">{r.screens.map((k: string) => <Status key={k} tone="off">{keyName(tr, k)}</Status>)}</div> : <p className="mute">{u("screens.none")}</p>)
          : <p className="mute">{u(`screens.fixed.${r.userType}`)}</p>}
      </Section>
      {r.userType === "user" && <>
        <Section title={u("actionsHeading")}>
          {(r.actions?.length ? <div className="chips">{(r.actions as string[]).map((k) => <Status key={k} tone="off">{u(`actionLabel.${k}`)}</Status>)}</div> : <p className="mute">{u("actionsNone")}</p>)}
        </Section>
        <Section title={u("channelsHeading")}>
          {(chanNames.length ? <div className="chips">{chanNames.map((n) => <Status key={n} tone="off">{n}</Status>)}</div> : <p className="mute">{u("channelsNone")}</p>)}
        </Section>
      </>}
    </>
  );
}

const Check = ({ checked, disabled, onChange, label, ind, ...rest }: { checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: ReactNode; ind?: boolean; [k: string]: any }) => (
  <Checkbox checked={checked} disabled={disabled} onChange={onChange} indeterminate={ind} {...rest}>{label}</Checkbox>
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
  ];
  const fields = useMemo(() => all.filter((f) => !f.only || (f.only === "user" ? ty === "user" : ty !== "super_admin")), [ty]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = useMemo(() => ({ userCode: row?.userCode, branchId: row?.branchId ?? "", username: row?.username ?? "", email: row && !row.needsEmail ? row.email : "", userType: row?.userType ?? onlyType, password: "", confirmPassword: "" }), [row, onlyType]);
  const f = useFieldsForm(fields, values);
  const saveKey = useRef(newSaveKey());
  const [dirty, setDirty] = useState(false);
  const mark = () => { saveKey.current = newSaveKey(); setDirty(true); };
  useEffect(() => { const s = f.watch((v, info) => { mark(); if (info.name === "userType") setTy(String(v.userType ?? "")); }); return () => s.unsubscribe(); }, [f]);
  // a lone branch is the one (not an unsaved change)
  useEffect(() => { if (adding) api("/branches", { query: { limit: 20 } }).then((r) => { const rows = rowsOf(r); if (rows.length === 1 && !f.getValues("branchId")) f.setValue("branchId", rows[0].id); }).catch(() => {}); }, [adding, f]);

  const [screens, setScreens] = useState<Set<string>>(new Set(row?.screens ?? []));
  // A plain user's role name, actions and sales channels (nothing ticked on a new user: hidden by default)
  const [role, setRole] = useState<string>(row?.businessRole ?? "");
  const [actions, setActions] = useState<Set<string>>(new Set(row?.actions ?? []));
  const [channels, setChannels] = useState<Set<string>>(new Set(row?.salesChannelIds ?? []));
  const channelsQ = useQuery({ enabled: ty === "user", queryKey: ["sales-channels", "all"], staleTime: 60_000, queryFn: () => api("/sales-channels").then(rowsOf) });
  const flip = (set: Set<string>, put: (s: Set<string>) => void) => (k: string, on: boolean) => { const n = new Set(set); on ? n.add(k) : n.delete(k); put(n); mark(); };
  const [jobs, setJobs] = useState<Set<string>>(new Set());
  const [jobsInit, setJobsInit] = useState("[]");
  // "By task" is hidden for now (owner, 2026-11-09): screens are the only way to give access. The task code stays for when it returns.
  const [, setTab] = useState<"job" | "screen">("screen");
  const [q, setQ] = useState("");
  const [permErr, setPermErr] = useState(""), [alert, setAlert] = useState(""), [note, setNote] = useState(""), [saving, setSaving] = useState(false);
  const permQ = useQuery({ queryKey: ["users", "screens-jobs"], staleTime: Infinity, queryFn: async () => { const [s, j] = await Promise.all([api("/users/screens"), api("/users/jobs")]); return { screens: s, jobScreens: Object.fromEntries((j.jobs ?? []).map((x: any) => [x.id, x.screens as string[]])) as Record<string, string[]> }; } });
  const savedJobs = useQuery({ enabled: row?.userType === "user", queryKey: ["users", "jobs", row?.id], gcTime: 0, queryFn: () => api(`/users/${row!.id}/jobs`).catch(() => ({ jobIds: [] })) });
  useEffect(() => { if (savedJobs.data) { setJobs(new Set<string>(savedJobs.data.jobIds)); setJobsInit(JSON.stringify([...savedJobs.data.jobIds].sort())); } }, [savedJobs.data]);
  const jobScreens = (id: string) => permQ.data?.jobScreens[id] ?? [];
  const mods = useMemo(() => offeredModules(tr, permQ.data?.screens), [tr, permQ.data]);
  const offered = mods.flatMap((m) => m.list.map((x) => x.key)), offSet = new Set(offered);
  const navGroups = (() => {
    const lab = (kind: "group" | "item", id: string) => { const x = (NAV_LABELS[kind] as Record<string, [string, string]>)[id]; return x ? L(x[0], x[1]) : id; };
    const groups = NAV.filter((g) => !g.superOnly).map((g) => ({ id: g.id, name: lab("group", g.id), items: g.items.map((i) => ({ id: i.id, name: lab("item", i.id), keys: i.screens.filter((k) => offSet.has(k)) })).filter((i) => i.keys.length) })).filter((g) => g.items.length);
    const used = new Set(groups.flatMap((g) => g.items.flatMap((i) => i.keys)));
    const rest = offered.filter((k) => !used.has(k));
    return rest.length ? [...groups, { id: "other", name: L("أخرى", "Other"), items: rest.map((k) => ({ id: k, name: keyName(tr, k), keys: [k] })) }] : groups;
  })();
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

  const leave = async () => { if (!dirty || await confirm({ title: c("unsaved.title"), text: c("unsaved.body"), ok: c("unsaved.leave"), cancel: c("unsaved.keepEditing"), danger: true })) close(); };
  const save = async () => {
    setAlert(""); setPermErr("");
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const v = await f.read();
    if (!v) { setAlert(c("couldNotSave", { count: Object.keys(f.formState.errors).length || 1 })); return; }
    if (ty === "user" && permQ.data && screens.size === 0 && !(await confirm({ title: u("screens.noneTitle"), text: u("screens.noneBody"), ok: c("save"), cancel: c("cancel") }))) return;
    const body = { ...(ty === "super_admin" ? {} : { branchId: v.branchId }), username: v.username, ...(v.email === "" ? {} : { email: v.email }), userType: ty,
      ...(ty === "user" ? { screens: [...screens], actions: [...actions], salesChannelIds: [...channels], businessRole: role || null } : {}),
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
      if (Object.keys(fe).length) { f.setErrors(fe); setAlert(c("couldNotSave", { count: Object.keys(fe).length })); return; }
      toast(tr.errorText(e.error), { error: true });
    }
  };

  const ql = q.trim().toLowerCase();
  const loaded = !!permQ.data, shownTab: "job" | "screen" = "screen";
  const summary = L(`${screens.size} شاشة`, `${screens.size} screens`);
  const box = (on: boolean, off = false): React.CSSProperties => ({ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 14, border: `1px solid ${on ? "var(--gold)" : "var(--line)"}`, background: on ? "var(--gold-wash)" : "var(--surface)", cursor: off ? "default" : "pointer", opacity: off ? 0.6 : 1 });
  const grid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 8 };
  const small: React.CSSProperties = { display: "block", fontSize: 12, color: "var(--mute)", marginTop: 2, lineHeight: 1.45 };
  const jobCards = (preview: boolean) => {
    const list = JOBS.filter((j) => permQ.data?.jobScreens[j[0]]);
    return GROUPS.map((g) => { const inG = list.filter((j) => j[1] === g); if (!inG.length) return null;
      const ids = inG.map((j) => j[0]).filter(givable), on = ids.filter((id) => jobs.has(id)).length, gname = t("jobs", `groups.${g}`);
      return <div key={g} style={{ marginTop: 12 }}>
        <div className="actions"><b>{gname}</b> <span dir="ltr" className="mute">{on}/{ids.length}</span>
          {!preview && <><Button size="sm" disabled={on === ids.length} onClick={() => toggleJobs(ids, true)}>{u("jobs.selectAll")}</Button>
          <Button size="sm" disabled={on === 0} onClick={() => toggleJobs(ids, false)}>{u("jobs.unselectAll")}</Button></>}</div>
        <div style={grid}>{inG.map((j) => { const id = j[0], can = givable(id), keys = jobScreens(id), has = can && jobs.has(id), missing = keys.filter((k) => !screens.has(k));
          return <label key={id} style={box(has, preview || !can)}>
            <CheckInput data-job={id} checked={has} disabled={preview || !can} onChange={(v) => toggleJobs([id], v, false)} style={{ marginTop: 3 }} />
            <span><b style={{ fontWeight: 600 }}>{L(j[2], j[3])}</b>{!can && <> <span className="mute">{u("jobs.adminOnly")}</span></>}
              <span style={small}>{keys.map((k) => keyName(tr, k)).join(tr.isAr ? "، " : ", ")}</span>
              {has && missing.length > 0 && !preview && <span className="note warn" style={{ display: "block", marginTop: 4 }}>{u("jobs.partMissing", { names: missing.map((k) => keyName(tr, k)).join(tr.isAr ? "، " : ", ") })} <Button size="sm" onClick={(e) => { e.preventDefault(); keys.forEach((k) => screens.add(k)); setScreens(new Set(screens)); mark(); }}>{u("jobs.giveMissing")}</Button></span>}</span>
          </label>; })}</div></div>; });
  };
  const perm = ty !== "user" && ty
    ? <p className="mute">{u(`screens.fixed.${ty}`)}</p>
    : permQ.isError ? <><div className="note warn">{c("couldNotLoad")}</div><Button onClick={() => permQ.refetch()}>{c("retry")}</Button></>
    : !loaded ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
    : !ty ? <><p className="mute">{L("اختر نوع المستخدم لتحديد شاشاته.", "Choose a user type to give it screens.")}</p></>
    : <>
      <div className="actions" style={{ justifyContent: "flex-end" }}><b dir="auto" aria-live="polite">{summary}</b></div>
      {shownTab === "screen" ? (() => { const open = offered.filter((k) => screens.has(k)).length; return <>
        <div className="actions"><span dir="ltr" aria-live="polite">{u("screens.count", { open, all: offered.length })}</span>
          <Button size="sm" disabled={open === offered.length} onClick={() => toggleScreens(offered, true)}>{u("screens.selectAll")}</Button>
          <Button size="sm" disabled={open === 0} onClick={() => toggleScreens(offered, false)}>{u("screens.unselectAll")}</Button></div>
        <Input id="screen-q" placeholder={L("ابحث عن شاشة", "Search screens")} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" aria-label={L("ابحث عن شاشة", "Search screens")} />
        {navGroups.map((g0) => { const g = { ...g0, items: g0.items.filter((x) => !ql || `${x.name} ${g0.name}`.toLowerCase().includes(ql)) }; if (!g.items.length) return null; const keys = g.items.flatMap((x) => x.keys), on = keys.filter((k) => screens.has(k)).length;
          return <div key={g.id} style={{ marginTop: 12 }}>
            <Check checked={on === keys.length} ind={on > 0 && on < keys.length} onChange={(v) => toggleScreens(keys, v)} aria-label={u("screens.module", { name: g.name })} label={<><b>{g.name}</b> <span dir="ltr" className="mute">{on}/{keys.length}</span> <span className="mute">· {u("screens.selectAll")}</span></>} />
            <div style={grid}>{g.items.map((x) => { const all = x.keys.every((k) => screens.has(k)), some = x.keys.some((k) => screens.has(k));
              return <label key={x.id} style={box(all)}><CheckInput data-screen={x.keys[0]} checked={all} indeterminate={some && !all} onChange={(v) => toggleScreens(x.keys, v)} style={{ marginTop: 3 }} /><span>{x.name}</span></label>; })}</div></div>; })}
      </>; })() : jobCards(false)}
    </>;

  return (
    <>
      {dialog}
      <div className="card"><FormFields form={f} fields={fields} values={values} /></div>
      {ty === "user" && <Section title={u("role")} wide>
        <div className="field">
          <Select id="f-businessRole" name="businessRole" value={role} onChange={(v) => { setRole(v); mark(); }} searchable={false} placeholder={u("roleNone")} options={BUSINESS_ROLES.map((k) => [k, u(`roles.${k}`)])} />
          <div className="help">{u("roleHint")}</div>
        </div>
      </Section>}
      <Section title={u("screens.heading")} wide>{perm}{permErr && <FieldError>{permErr}</FieldError>}</Section>
      {ty === "user" && <Section title={u("actionsHeading")} wide>
        <div className="help">{u("actionsHint")}</div>
        {ACTIONS.map((k) => <Checkbox key={k} data-action={k} checked={actions.has(k)} onChange={(v) => flip(actions, setActions)(k, v)}><b>{u(`actionLabel.${k}`)}</b> <span className="help">{u(`actionHint.${k}`)}</span></Checkbox>)}
      </Section>}
      {ty === "user" && <Section title={u("channelsHeading")} wide>
        <div className="help">{u("channelsHint")}</div>
        {channelsQ.data?.length === 0 && <p className="mute">{u("channelsNone")}</p>}
        {(channelsQ.data ?? []).map((c: Row) => <Checkbox key={c.id} data-channel={c.id} checked={channels.has(c.id)} onChange={(v) => flip(channels, setChannels)(c.id, v)}>{c.channelName ?? c.name}</Checkbox>)}
      </Section>}
      {alert && <FieldError>{alert}</FieldError>}
      <div className="formbar">
        <Button variant="primary" id="save" disabled={saving} onClick={save}>{saving ? c("saving") : adding ? c("save") : c("saveChanges")}</Button>
        <Button id="cancel" onClick={leave}>{c("cancel")}</Button>
        <span className="mute">{note || (dirty ? c("unsavedChanges") : "")}</span>
      </div>
    </>
  );
}
