"use client";
// الحسابات والجلسات (Super admin only): super-control/admin-accounts, locked-accounts, active-sessions.
// Ported from docs/nav-preview/app/things/control-accounts.js. Admin accounts: the Users form with types admin + super_admin
// (POST /admin-accounts, PATCH /admin-accounts/{id}), delete = DELETE /admin-accounts/{id}. Active sessions open on everyone; the search box narrows (same endpoint).
// The page is hidden for everyone but the Super admin by the nav (superOnly group) and refused by the server.
// shortcut: "end other sessions" asks with window.confirm (the view actions have no dialog hook); swap for the engine's confirm when it passes one.
import { api, ApiFailure } from "@/lib/api";
import type { Column, CustomFormProps, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { dateTimeText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section, toast } from "@/components/engine";
import { UserForm, UserRecord, code6, nameOfUser, typeName } from "./admin-shared";
import { useAccess } from "./sales-access";

const ADMIN_TYPES = ["admin", "super_admin"] as const;
const MAX_FAILED = 5;   // MAX_FAILED_SIGN_INS, the number the locked list shows as the reason

// A temporary password is shown once, in a dialog with Copy and Done; it is kept nowhere.
function tempDialog(m: (k: string, v?: Record<string, any>) => string, name: string, password: string): Promise<void> {
  return new Promise((resolve) => {
    const d = document.createElement("dialog");
    const h2 = document.createElement("h2"); h2.textContent = m("lockedAccounts.tempTitle", { name });
    const p1 = document.createElement("p"); p1.textContent = m("lockedAccounts.tempBody");
    const p2 = document.createElement("p"), code = document.createElement("code");
    code.dir = "ltr"; code.id = "tp"; code.style.cssText = "font-size:1.2em;user-select:all"; code.textContent = password; p2.append(code);
    const p3 = document.createElement("p"); p3.className = "mute"; p3.textContent = m("lockedAccounts.tempNote");
    const row = document.createElement("div"); row.className = "row";
    const copy = document.createElement("button"); copy.className = "btn quiet"; copy.textContent = m("lockedAccounts.copy");
    const done = document.createElement("button"); done.className = "btn primary"; done.textContent = m("lockedAccounts.done");
    row.append(copy, done); d.append(h2, p1, p2, p3, row); document.body.appendChild(d);
    const end = () => { d.close(); d.remove(); resolve(); };
    done.onclick = end;
    d.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    copy.onclick = async () => { try { await navigator.clipboard.writeText(password); copy.textContent = m("lockedAccounts.copied"); } catch { /* the text is selectable */ } };
    d.showModal();
  });
}

const CreateAdmin = (p: CustomFormProps) => <UserForm {...p} onlyTypes={ADMIN_TYPES} path="/admin-accounts" staysAfterAdd={false} />;
const EditAdmin = (p: CustomFormProps) => <UserForm {...p} onlyTypes={ADMIN_TYPES} path="/admin-accounts" staysAfterAdd={false} />;

const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, any>) => t("super-control", k, v);
  const open = (row: Row, h: { open: (r: Row) => void }) => h.open(row);
  const baseCols = (): Column[] => [
    { key: "username", label: m("adminAccounts.username"), render: (r) => <bdi dir="ltr">{r.username}</bdi> },
    { key: "name", label: m("adminAccounts.name"), get: nameOfUser, render: (r) => <bdi dir="auto">{nameOfUser(r)}</bdi> },
    { key: "userType", label: m("adminAccounts.type"), get: (r) => typeName(tr, r.userType) },
    { key: "branchName", label: m("adminAccounts.branch"), render: (r) => r.branchName || "—" },
  ];
  const adminOnly = (r: Row) => !r.lastSeenAt && !r.deletedAt && (ADMIN_TYPES as readonly string[]).includes(r.userType);
  return {
    id: "accounts",
    title: m("adminAccounts.title"),
    unit: L("حساب", "accounts"),
    keys: ["super-control/admin-accounts", "super-control/locked-accounts", "super-control/active-sessions"],
    create: [{ form: "create", label: m("adminAccounts.add"), keys: ["super-control/admin-accounts"] }],
    views: [{
      id: "admins", label: m("adminAccounts.listTitle"), keys: ["super-control/admin-accounts"],
      endpoint: "/admin-accounts", query: { order: "newest" },
      search: { param: "search", placeholder: m("adminAccounts.searchPlaceholder") },
      paging: { sizeParam: null },
      columns: [...baseCols(), { key: "locked", label: m("adminAccounts.status"), type: "status", get: (r) => (r.locked ? "locked" : "active"), statuses: { active: [m("adminAccounts.active"), "good"], locked: [m("adminAccounts.locked"), "warn"] } }],
      answerExtra: () => m("adminAccounts.rule"),
      onRow: open,
    }, {
      id: "locked", label: m("lockedAccounts.listTitle"), keys: ["super-control/locked-accounts"], create: [],
      endpoint: "/locked-accounts", query: { order: "newest" },
      search: { param: "search", placeholder: m("lockedAccounts.searchPlaceholder") },
      paging: { sizeParam: null },
      columns: [...baseCols(), { key: "reason", label: m("lockedAccounts.reason"), sortable: false, get: () => m("lockedAccounts.reasonValue", { count: MAX_FAILED }) },
        { key: "locked", label: m("adminAccounts.status"), type: "status", get: () => "locked", statuses: { locked: [m("lockedAccounts.lockedBadge"), "warn"] } }],
      answerExtra: () => m("lockedAccounts.rule"),
      onRow: open,
    }, {
      id: "sessions", label: m("activeSessions.title"), keys: ["super-control/active-sessions"], create: [],
      endpoint: "/active-sessions",
      search: { param: "search", placeholder: m("activeSessions.searchPlaceholder") },
      paging: false,
      columns: [
        { key: "username", label: m("activeSessions.columns.username"), render: (r) => <><bdi dir="ltr">{r.username}</bdi>{r.current && <> <span className="st info"><i />{m("activeSessions.thisSession")}</span></>}</> },
        { key: "userCode", label: m("activeSessions.columns.userCode"), render: (r) => <Ltr>{code6(r.userCode)}</Ltr> },
        { key: "branchName", label: m("activeSessions.columns.branch"), get: (r) => r.branchName || m("activeSessions.allBranches") },
        { key: "signedInAt", label: m("activeSessions.columns.signedInAt"), type: "datetime" },
        { key: "lastSeenAt", label: m("activeSessions.columns.lastSeenAt"), type: "datetime" },
      ],
      answerExtra: () => m("activeSessions.rule"),
      onRow: open,
      actions: [{
        label: m("activeSessions.endOthers"), icon: "out",
        run: async ({ reload }) => {
          if (!window.confirm(`${m("activeSessions.endOthersTitle")}\n${m("activeSessions.endOthersBody")}`)) return;
          try { const r = await api("/active-sessions/end-others", { method: "POST" }); toast(m("activeSessions.othersEnded", { count: r?.ended ?? 0 })); reload(); }
          catch (e) { toast(e instanceof ApiFailure ? tr.errorText(e.error) : m("activeSessions.endFailed"), { error: true }); }
        },
      }],
    }],
    // One record sheet for the three lists; what it shows and offers follows the row.
    record: {
      title: (r) => (r.lastSeenAt ? `${m("activeSessions.title")} · ${r.username}` : `${t("administration", "users.recordNo")} ${code6(r.userCode)}`),
      render: (r) => (r.lastSeenAt
        ? <Section title={m("activeSessions.listTitle")}>
          <Kv k={m("activeSessions.columns.username")}><bdi dir="ltr">{r.username}</bdi></Kv>
          <Kv k={m("activeSessions.columns.userCode")}><Ltr>{code6(r.userCode)}</Ltr></Kv>
          <Kv k={m("activeSessions.columns.branch")}>{r.branchName || m("activeSessions.allBranches")}</Kv>
          <Kv k={m("activeSessions.columns.signedInAt")}>{dateTimeText(r.signedInAt)}</Kv>
          <Kv k={m("activeSessions.columns.lastSeenAt")}>{dateTimeText(r.lastSeenAt)}</Kv>
        </Section>
        : <UserRecord r={r} tr={tr} />),
      actions: [
        { id: "edit", label: t("common", "edit"), icon: "edit", when: adminOnly, run: (r, h) => { h.close(); h.openForm("edit", r); } },
        { id: "unlock", label: m("lockedAccounts.unlock"), icon: "key", when: (r) => !r.lastSeenAt && !!r.locked, run: async (r, h) => { await api(`/users/${r.id}/unlock`, { method: "POST" }); h.close(); h.toast(m("lockedAccounts.unlocked", { name: nameOfUser(r) })); h.reload(); } },
        { id: "temp", label: m("lockedAccounts.tempPassword"), icon: "lock", when: (r) => !r.lastSeenAt && !!r.locked, run: async (r, h) => {
          let a; try { a = await api(`/locked-accounts/${r.id}/temp-password`, { method: "POST" }); } catch (e) { toast(e instanceof ApiFailure && e.error.message === "userNotFound" ? tr.errorText(e.error) : m("lockedAccounts.tempFailed"), { error: true }); return; }
          h.close(); await tempDialog(m, nameOfUser(r), a.tempPassword); h.reload();
        } },
        { id: "end", label: m("activeSessions.end"), icon: "out", danger: true, when: (r) => !!r.lastSeenAt && !r.current,
          confirm: { title: m("activeSessions.endTitle", { username: "" }).replace(/\s+$/, ""), text: m("activeSessions.endBody") },
          run: async (r, h) => {
            try { await api(`/active-sessions/${r.id}`, { method: "DELETE" }); toast(m("activeSessions.ended", { username: r.username })); }
            catch (e) { if (e instanceof ApiFailure && e.status === 404) toast(m("activeSessions.alreadyEnded"), { error: true }); else toast(e instanceof ApiFailure ? tr.errorText(e.error) : m("activeSessions.endFailed"), { error: true }); }
            h.close(); h.reload();
          } },
      ],
      remove: {
        when: adminOnly,
        path: (r) => `/admin-accounts/${r.id}`,
        confirm: (r) => ({ title: m("adminAccounts.deleteTitle", { name: nameOfUser(r) }), text: `${m("adminAccounts.deleteBody")} ${L("لا يمكن التراجع عن الحذف.", "This cannot be undone.")}` }),
      },
    },
    forms: {
      create: { display: "page", title: m("adminAccounts.newTitle"), fields: [], path: () => "/admin-accounts", custom: CreateAdmin },
      edit: { display: "page", title: m("adminAccounts.editTitle"), fields: [], path: (r) => `/admin-accounts/${r!.id}`, custom: EditAdmin },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
