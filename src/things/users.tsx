"use client";
// المستخدمين: administration/users (add / edit), administration/users-list (list + record) and "assign jobs" (PUT /users/job-holders/{jobId}).
// Ported from docs/nav-preview/app/things/users.js. List sends only: search, page, order=newest, type, locked=only, deleted=only (Super admin). Page size is the backend's 20.
// Admin: reads every user, manages plain Users only (mayManage). Delete refusals (ownAccount, lastSuperAdmin, isBranchAdmin, notAllowed) show their errors.json text.
import { Checkbox, Button, Input, Status } from "@/components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { ThingPage, Ltr, toast } from "@/components/engine";
import { BUSINESS_ROLES } from "@/lib/actions";
import { TYPES, UserForm, UserRecord, code6, jobName, manageable, typeName } from "./admin-shared";
import { useAccess } from "./sales-access";

// The jobs page: pick who holds a job (whole set), from the plain Users who have every screen of it open.
function Holders({ row, close, reload, tr }: CustomFormProps) {
  const { t } = tr;
  const a = (k: string, v?: Record<string, any>) => t("administration", `jobAssignments.${k}`, v);
  const [people, setPeople] = useState<Row[] | null>(null);
  const [on, setOn] = useState<Set<string>>(new Set());
  const [q, setQ] = useState(""), [err, setErr] = useState(""), [saving, setSaving] = useState(false);
  const key = useRef(newSaveKey());
  useEffect(() => {
    api(`/users/job-holders/${row!.id}`).then((r) => { setPeople([...r.holders, ...r.couldHold]); setOn(new Set(r.holders.map((p: Row) => p.id))); })
      .catch((e) => setErr(e instanceof ApiFailure ? tr.errorText(e.error) : t("common", "couldNotLoad")));
  }, [row, tr, t]);
  const f = q.trim().toLowerCase(), list = (people ?? []).filter((p) => !f || `${p.name} ${p.username}`.toLowerCase().includes(f));
  const save = async () => {
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setSaving(true);
    try { await api(`/users/job-holders/${row!.id}`, { method: "PUT", body: { userIds: [...on] }, saveKey: key.current }); toast(a("saved")); reload(); }
    catch (e) { setSaving(false); toast(e instanceof ApiFailure ? tr.errorText(e.error) : a("saveFailed"), { error: true }); }
  };
  return (
    <>
      <div className="note">{a("hint")}</div>
      <div className="card">
        {err ? <div className="note warn">{err}</div> : !people ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
          : people.length === 0 ? <p className="mute">{a("noUsers")}</p>
          : <>
            <Input id="hp-q" placeholder={a("searchUser")} value={q} onChange={(e) => setQ(e.target.value)} aria-label={a("searchUser")} autoComplete="off" />
            <p dir="ltr" aria-live="polite">{a("count", { on: on.size, all: people.length })}</p>
            {list.map((p) => <Checkbox key={p.id} checked={on.has(p.id)} onChange={(v) => { const n = new Set(on); v ? n.add(p.id) : n.delete(p.id); setOn(n); key.current = newSaveKey(); }}>{p.name} <bdi dir="ltr" className="mute">{p.username}</bdi></Checkbox>)}
          </>}
      </div>
      <div className="formbar"><Button variant="primary" id="hp-save" disabled={!people || saving} onClick={save}>{a("save")}</Button><Button onClick={close}>{t("common", "cancel")}</Button></div>
    </>
  );
}

const CreateUser = (p: CustomFormProps) => <UserForm {...p} path="/users" />;
const EditUser = (p: CustomFormProps) => <UserForm {...p} path="/users" staysAfterAdd={false} />;

const build = (tr: Tr, viewer: string | undefined): ThingConfig => {
  const { t, L } = tr;
  const u = (k: string, v?: Record<string, any>) => t("administration", `users.${k}`, v);
  const a = (k: string) => t("administration", `jobAssignments.${k}`);
  const can = manageable(viewer);
  return {
    id: "users",
    title: u("title"),
    unit: L("مستخدم", "users"),
    keys: ["administration/users", "administration/users-list"],
    create: [{ form: "create", label: u("add"), keys: ["administration/users"] }],
    views: [{
      id: "list", label: u("listTitle"), keys: ["administration/users-list"],
      endpoint: "/users", query: { order: "newest" },
      search: { param: "search", placeholder: u("searchPlaceholder") },
      filters: [
        // A plain User's business role is a separate backend filter (businessRole), but shown here as one dropdown with
        // the type, matching the Add/Edit form's own "user:<role>" options (admin-shared.tsx). shortcut: picking a role
        // filters the list correctly, but a page reload forgets the role half (only "type" is a declared filter name)
        // and falls back to plain "User"; upgrade if the engine gets a per-filter URL round-trip for combined values.
        { name: "type", label: u("userType"), type: "select", searchable: false,
          options: TYPES.flatMap((x): [string, string][] => (x === "user" ? [["user", typeName(tr, "user")], ...BUSINESS_ROLES.map((k): [string, string] => [`user:${k}`, u(`roles.${k}`)])] : [[x, typeName(tr, x)]])),
          toQuery: (v: string) => (v?.includes(":") ? { type: v.split(":")[0], businessRole: v.split(":")[1] } : { type: v }) },
        { name: "lockedOnly", label: u("lockedOnly"), type: "checkbox", toQuery: (v) => (v ? { locked: "only" } : {}) },
        ...(viewer === "super_admin" ? [{ name: "deletedOnly", label: u("deletedOnly"), type: "checkbox" as const, toQuery: (v: unknown) => (v ? { deleted: "only" } : {}) }] : []),
      ],
      paging: { sizeParam: null },
      serverSort: { on: true, columns: { userCode: "userCode", username: "username", userType: "userType" } },   // the backend takes sort/dir for this list (ge_erp_backend 0.1.23); see ViewConfig.serverSort
      onRow: (row, h) => h.open(row),
      columns: [
        { key: "userCode", label: u("userCode"), render: (r) => <><Ltr>{code6(r.userCode)}</Ltr>{r.deletedAt ? <> <Status tone="off">{u("deletedBadge")}</Status></> : r.locked ? <> <Status tone="warn">{u("lockedBadge")}</Status></> : null}</> },
        { key: "username", label: u("username"), render: (r) => <bdi dir="ltr">{r.username}</bdi> },
        { key: "email", label: u("email"), render: (r) => (r.needsEmail ? "—" : <bdi dir="ltr">{r.email}</bdi>) },
        { key: "userType", label: u("userType"), get: (r) => (r.userType === "user" && r.businessRole ? u(`roles.${r.businessRole}`) : typeName(tr, r.userType)) },
        { key: "branchName", label: u("branchId"), render: (r) => r.branchName || "—" },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    }
    // Hidden (owner, 2026-11-09): the "Assign jobs" tab, same as the By task picker it fed. To bring it back,
    // remove the // below and the comma after "list" above; nothing else was removed.
    /* , {
      id: "jobs", label: a("title"), keys: ["administration/users"],
      load: async () => ({ items: ((await api("/users/jobs")).jobs ?? []).map((j: Row) => ({ id: j.id, screens: j.screens })) }),
      paging: false,
      onRow: (row, h) => h.openForm("holders", row),
      columns: [
        { key: "id", label: a("job"), get: (r) => jobName(tr, r.id) },
        { key: "group", label: L("المجموعة", "Group"), get: (r) => { const j = JOBS.find((x) => x[0] === r.id); return j ? t("jobs", `groups.${j[1]}`) : ""; } },
        { key: "screens", label: u("screens.heading"), type: "int", get: (r) => r.screens.length },
      ],
    } */],
    record: {
      title: (r) => `${u("recordNo")} ${code6(r.userCode)}`,
      endpoint: (r) => `/users/${r.id}`,
      render: (r) => <UserRecord r={r} tr={tr} />,
      actions: [
        { id: "edit", label: t("common", "edit"), icon: "edit", when: can, run: (r, h) => { h.close(); h.openForm("edit", r); } },
        { id: "screens", label: L("تحديد الشاشات", "Assign screens"), icon: "key", when: (r) => can(r) && r.userType === "user", run: (r, h) => { h.close(); h.openForm("edit", { ...r, openTab: "screen" }); } },
        // Hidden (owner, 2026-11-09): the "Assign jobs" button on a user. To bring it back, remove the // below; nothing else was removed.
        // { id: "jobs", label: L("تحديد الوظائف", "Assign jobs"), icon: "key", when: (r) => can(r) && r.userType === "user", run: (r, h) => { h.close(); h.openForm("edit", { ...r, openTab: "job" }); } },
        { id: "print", label: t("common", "print"), icon: "print", run: () => window.print() },
        { id: "unlock", label: u("unlock"), icon: "key", when: (r) => can(r) && !!r.locked, run: async (r, h) => { await api(`/users/${r.id}/unlock`, { method: "POST" }); h.close(); h.toast(u("unlocked")); h.reload(); } },
      ],
      remove: {
        when: can,
        path: (r) => `/users/${r.id}`,
        confirm: (r) => ({ title: u("deleteTitle", { code: code6(r.userCode) }), text: `${u("deleteBody")} ${L("لا يمكن التراجع عن الحذف.", "This cannot be undone.")}` }),
      },
    },
    forms: {
      create: { display: "page", title: u("new"), fields: [], path: () => "/users", custom: CreateUser },
      edit: { display: "page", title: (r) => u("editTitle", { code: code6(r!.userCode) }), fields: [], path: (r) => `/users/${r!.id}`, custom: EditUser },
      holders: { display: "page", title: (r) => `${a("title")} · ${jobName(tr, r!.id)}`, fields: [], path: (r) => `/users/job-holders/${r!.id}`, custom: Holders },
    },
  };
};

export default function Page() {
  const { data: me } = useMe();
  const viewer = me?.userType;
  const make = useMemo<MakeConfig>(() => (tr) => build(tr, viewer), [viewer]);
  return <ThingPage make={make} access={useAccess()} />;
}
