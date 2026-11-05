"use client";
// الفروع: system-codes/branches + branches-list. Ported from docs/nav-preview/app/things/branches.js.
// The backend's branch list takes only `page`; create/edit send {branchName, adminUserId} (branchCode is the system's).
import { api } from "@/lib/api";
import type { FieldConfig, MakeConfig, ThingConfig } from "@/lib/engine-types";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { useAccess } from "./sales-access";

import { code6 as code } from "@/lib/code6"; // branchCodeText: six digits

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("system-codes", `branches.${k}`, v);
  const fields = (): FieldConfig[] => [
    { name: "branchCode", label: m("branchCode"), type: "code", documentType: "branch", hint: m("autoHint") },
    { name: "branchName", label: m("branchName"), type: "text", required: true, maxLength: 100 },
    { name: "adminUserId", label: m("adminUserId"), type: "select", required: true, optionsFrom: { path: "/users", query: { type: "admin" }, value: "id", label: "username" }, help: m("adminHint") },
  ];
  const payload = (v: Record<string, any>) => ({ branchName: v.branchName, adminUserId: v.adminUserId });
  const stamp = (x: unknown) => (x ? <Ltr>{String(x).slice(0, 19).replace("T", " ")}</Ltr> : "");
  return {
    id: "branches",
    title: m("title"),
    unit: L("فرع", "branches"),
    keys: ["system-codes/branches", "system-codes/branches-list"],
    create: [{ form: "create", label: m("add"), keys: ["system-codes/branches"] }],
    views: [{
      id: "list", label: m("listTitle"), keys: ["system-codes/branches-list"],
      endpoint: "/branches", query: { order: "newest" },
      search: { param: "search", placeholder: m("searchPlaceholder") },
      chips: [{ id: "all", label: L("الكل", "All") }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
      paging: { sizeParam: null },
      columns: [
        { key: "branchCode", label: m("branchCode"), get: (r) => code(r.branchCode) },
        { key: "branchName", label: m("branchName") },
        { key: "createdAt", label: L("تاريخ الإضافة", "Created"), type: "date" },
        { key: "deletedAt", label: L("الحالة", "Status"), type: "status", get: (r) => (r.deletedAt ? "deleted" : "active"), statuses: { active: [L("نشط", "Active"), "good"], deleted: [m("deletedBadge"), "off"] } },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    }],
    record: {
      title: (r) => `${m("title")} · ${code(r.branchCode)}`,
      endpoint: (r) => `/branches/${r.id}`,
      // the admin's name comes from the user record (a dash when it can't be read)
      enrich: async (r) => {
        if (!r.adminUserId) return { adminName: "—" };
        try { return { adminName: (await api(`/users/${r.adminUserId}`)).username }; } catch { return { adminName: "—" }; }
      },
      render: (r) => (
        <Section title={m("title")}>
          <Kv k={m("branchCode")}><Ltr>{code(r.branchCode)}</Ltr></Kv>
          <Kv k={m("branchName")}>{r.branchName}</Kv>
          <Kv k={m("adminUserId")}>{r.adminName}</Kv>
          <Kv k={L("تاريخ الإضافة", "Created")}>{stamp(r.createdAt)}</Kv>
          <Kv k={L("آخر تعديل", "Updated")}>{stamp(r.updatedAt)}</Kv>
        </Section>
      ),
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/branches/${r.id}`,
        confirm: (r) => ({ title: m("deleteTitle", { code: code(r.branchCode) }), text: m("deleteBody") }),
      },
    },
    forms: {
      create: { title: m("new"), note: m("twoTreasuries"), path: () => "/branches", method: "POST", toPayload: payload, fields: fields() },
      edit: {
        title: (r) => m("editTitle", { code: code(r!.branchCode) }), path: (r) => `/branches/${r!.id}`, method: "PATCH", toPayload: payload,
        load: (r) => ({ branchCode: r!.branchCode, branchName: r!.branchName, adminUserId: r!.adminUserId }), fields: fields(),
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
