"use client";
// أنواع المصروفات: expenses/expense-types, expense-types-list. Ported from docs/nav-preview/app/things/expense-types.js.
// List sends only: search, page, order=newest, deleted=only (Super admin). Create POST {expenseTypeName}; edit PATCH the same; delete = soft delete.
import type { FieldConfig, MakeConfig, ThingConfig } from "@/lib/engine-types";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { useAccess } from "./sales-access";

const code6 = (n: unknown) => String(n).padStart(6, "0");
const NAME_MAX = 100;   // EXPENSE_TYPE_NAME_MAX_LENGTH (dashboard = backend)

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("expenses", `expenseTypes.${k}`, v);
  const deleted = <span className="st off"><i />{m("deletedBadge")}</span>;
  // The code is the system's to give: shown read only.
  const fields = (): FieldConfig[] => [
    { name: "expenseCode", label: m("expenseCode"), type: "code", documentType: "expense_type", hint: m("autoHint") },
    { name: "expenseTypeName", label: m("expenseTypeName"), type: "text", required: true, maxLength: NAME_MAX },
  ];
  return {
    id: "expense-types",
    title: m("title"),
    unit: L("نوع", "types"),
    keys: ["expenses/expense-types", "expenses/expense-types-list"],
    create: [{ form: "create", label: m("add"), keys: ["expenses/expense-types"] }],
    views: [{
      id: "list", label: m("listTitle"), keys: ["expenses/expense-types-list"],
      endpoint: "/expense-types", query: { order: "newest" },
      search: { param: "search", placeholder: m("searchPlaceholder") },
      chips: [{ id: "all", label: L("الكل", "All") }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
      paging: { sizeParam: null },   // the list takes `page` only (size fixed at 20)
      columns: [
        { key: "expenseCode", label: m("expenseCode"), get: (r) => code6(r.expenseCode), render: (r) => <><Ltr>{code6(r.expenseCode)}</Ltr>{r.deletedAt && <> {deleted}</>}</> },
        { key: "expenseTypeName", label: m("expenseTypeName"), render: (r) => <bdi dir="auto">{r.expenseTypeName}</bdi> },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    }],
    record: {
      title: (r) => `${m("recordNo")} ${code6(r.expenseCode)}`,
      endpoint: (r) => `/expense-types/${r.id}`,
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
          <Section title={m("details")}>
            <Kv k={m("expenseCode")}><Ltr>{code6(r.expenseCode)}</Ltr></Kv>
            <Kv k={m("expenseTypeName")}><bdi dir="auto">{r.expenseTypeName}</bdi></Kv>
          </Section>
        </>
      ),
      // Edit only a live one.
      actions: [{ id: "edit", label: L("تعديل", "Edit"), icon: "edit", when: (r) => !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `/expense-types/${r.id}`,
        confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.expenseCode) }), text: m("deleteBody") }),
      },
    },
    forms: {
      create: { title: m("new"), path: () => "/expense-types", method: "POST", load: () => ({}), toPayload: (v) => ({ expenseTypeName: v.expenseTypeName }), fields: fields() },
      edit: {
        title: (r) => m("editTitle", { code: code6(r!.expenseCode) }), path: (r) => `/expense-types/${r!.id}`, method: "PATCH",
        load: (r) => ({ expenseCode: code6(r!.expenseCode), expenseTypeName: r!.expenseTypeName }),
        toPayload: (v) => ({ expenseTypeName: v.expenseTypeName }), fields: fields(),
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
