"use client";
// المصروفات: expenses/expenses, expenses-history, expense-refunds, expense-refunds-history, expenses-report, expenses-by-type.
// Ported from docs/nav-preview/app/things/expenses.js. Views: expense history, refund history, expenses report, expenses by type.
// Writes: add expense, add refund (expense-form.tsx: cash and any number of bank rows), delete (record). A saved expense/refund is never
// edited (no PATCH route). Expenses and refunds are the same shape: one factory builds both. No cash-balance check, no editing window.
// Not built (queued jobs, as in the HTML): report print preview and Excel, the Columns picker, the correction-job prefill, add-new-from-picker.
import type { Column, CustomFormProps, FieldConfig, LookupSpec, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { branchSpec, code6, foot } from "./money-shared";
import { useAccess } from "./sales-access";
import { ExpenseForm } from "./expense-form";
import { BankKvs, bankNamesOf } from "./payment-block";

const typeSpec: LookupSpec = { path: "/expense-types", value: "id", label: (r) => `${code6(r.expenseCode)} · ${r.expenseTypeName}` };
type Kind = "expense" | "refund";
const nsOf = (kind: Kind) => (kind === "expense" ? "expenses" : "expenseRefunds");
const baseOf = (kind: Kind) => (kind === "expense" ? "/expenses" : "/expense-refunds");

const build = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const rep = (k: string, v?: Record<string, string>) => t("common", `report.${k}`, v);
  const ALL = rep("all");
  const mk = (kind: Kind) => (k: string, v?: Record<string, string>) => t("expenses", `${nsOf(kind)}.${k}`, v);
  const from = (label: string) => ({ name: "fromDate", label, type: "date" as const });
  const to = (label: string, withCheck?: boolean) => ({ name: "toDate", label, type: "date" as const, validate: withCheck ? (v: any, all: Record<string, any>) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) : undefined });
  const bdi = (x: unknown) => <bdi dir="auto">{String(x ?? "")}</bdi>;
  const red = (v: number) => (Number(v) < 0 ? <span style={{ color: "#b42318" }}>{piastresText(v)}</span> : piastresText(v));

  // ───── the history of one kind ─────
  const history = (kind: Kind): ViewConfig => {
    const m = mk(kind), screens = kind === "expense" ? ["expenses/expenses", "expenses/expenses-history"] : ["expenses/expense-refunds", "expenses/expense-refunds-history"];
    return {
      id: kind === "expense" ? "history" : "refunds",
      label: m("listTitle"),
      keys: [screens[1]],
      create: [{ form: kind === "expense" ? "createExpense" : "createRefund", label: m("add"), keys: [screens[0]] }],
      endpoint: baseOf(kind),
      // The dashboard sends: search, fromDate, toDate, page, deleted=only. (The backend also takes branchId and limit; the screen does not send them.)
      search: { param: "search", placeholder: m("searchPlaceholder") },
      chips: [{ id: "all", label: ALL }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" } }],
      filters: [from(m("fromDate")), to(m("toDate"))],
      paging: { sizeParam: null },
      transform: (rows) => rows.map((r) => ({ ...r, _kind: kind })),
      columns: [
        { key: "documentNumber", label: m("code"), get: (r) => code6(r.documentNumber), render: (r) => <><Ltr>{code6(r.documentNumber)}</Ltr>{r.deletedAt && <> <span className="st off"><i />{m("deletedBadge")}</span></>}</> },
        { key: "date", label: m("date"), type: "date" },
        { key: "expenseTypeName", label: m("expenseTypeName"), render: (r) => bdi(r.expenseTypeName) },
        { key: "total", label: m("total"), type: "money" },   // the backend's total of cash and bank
        { key: "note", label: m("note"), render: (r) => bdi(r.note) },
      ],
      rowClass: (r) => (r.deletedAt ? "deleted" : ""),
      onRow: (row, h) => h.open(row),
    };
  };

  // ───── reports ─────
  const rp = (k: string, v?: Record<string, string>) => t("expenses", `expensesReport.${k}`, v);
  const bt = (k: string, v?: Record<string, string>) => t("expenses", `expensesByType.${k}`, v);
  const branch = (label: string): FieldConfig => ({ name: "branchId", label, type: "select", optionsFrom: branchSpec, placeholder: ALL });
  const repCols: Column[] = [
    { key: "branch", label: rp("columns.branch"), render: (x) => bdi(x.branch) },
    { key: "date", label: rp("columns.date"), type: "date" },
    { key: "expense", label: rp("columns.expense"), render: (x) => bdi(x.expense) },
    { key: "in", label: rp("columns.in"), type: "money" },     // a refund: the whole document (cash and bank)
    { key: "out", label: rp("columns.out"), type: "money" },   // an expense
    { key: "note", label: rp("columns.note"), render: (x) => bdi(x.note) },
    { key: "number", label: rp("columns.number"), render: (x) => <Ltr>{code6(x.number)}</Ltr> },
  ];
  const typeCols: Column[] = [
    { key: "code", label: bt("columns.code"), render: (x) => <Ltr>{code6(x.code)}</Ltr> },
    { key: "name", label: bt("columns.name"), render: (x) => bdi(x.name) },
    { key: "totalOut", label: bt("columns.totalOut"), type: "money" },
    { key: "totalIn", label: bt("columns.totalIn"), type: "money" },
    { key: "net", label: bt("columns.net"), type: "money", render: (x) => red(x.net) },
  ];
  const views: ViewConfig[] = [
    history("expense"), history("refund"),
    {
      id: "report", label: rp("title"), keys: ["expenses/expenses-report"], create: [],
      endpoint: "/reports/expenses-report", rowKey: "id", runLabel: rep("run"),
      filters: [branch(rp("branchId")), { name: "expenseTypeId", label: rp("expenseTypeId"), type: "select", optionsFrom: typeSpec, placeholder: ALL }, from(rp("fromDate")), to(rp("toDate"), true)],
      sort: { default: { key: "date", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      onRow: false,
      columns: repCols,
      // the totals are over the whole result, not this page
      footer: (_rows, a) => (a?.totals ? foot(repCols, rep("total"), { in: piastresText(a.totals.in), out: piastresText(a.totals.out) }) : null),
    },
    {
      id: "by-type", label: bt("title"), keys: ["expenses/expenses-by-type"], create: [],
      endpoint: "/reports/expenses-by-type", rowKey: "expenseTypeId", runLabel: rep("run"),
      filters: [branch(bt("branchId")), from(bt("fromDate")), to(bt("toDate"), true)],
      sort: { default: { key: "code", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      onRow: false,
      columns: typeCols,
      footer: (_rows, a) => (a?.totals ? foot(typeCols, rep("total"), { totalOut: piastresText(a.totals.totalOut), totalIn: piastresText(a.totals.totalIn), net: red(a.totals.net) }) : null),
    },
  ];

  // ───── the record (both kinds) ─────
  // The row's _kind (set by the list) says which endpoint and texts; the fresh read has no _kind, so enrich restores it.
  let openKind: Kind = "expense";
  return {
    id: "expenses",
    title: t("expenses", "expenses.title"),
    unit: L("حركة", "documents"),
    keys: ["expenses/expenses", "expenses/expenses-history", "expenses/expense-refunds", "expenses/expense-refunds-history", "expenses/expenses-report", "expenses/expenses-by-type"],
    views,
    record: {
      title: (r) => `${mk(r._kind ?? openKind)("recordNo")} ${code6(r.documentNumber)}`,
      endpoint: (r) => { openKind = r._kind ?? "expense"; return `${baseOf(openKind)}/${r.id}`; },
      enrich: async (r) => ({ _kind: openKind, bankNames: await bankNamesOf(r.bankPayments) }),
      render: (r) => {
        const m = mk(r._kind ?? openKind);
        return (
          <>
            {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
            <Section title={m("details")}>
              <Kv k={m("documentNumber")}><Ltr>{code6(r.documentNumber)}</Ltr></Kv>
              <Kv k={m("date")}><Ltr>{String(r.date).slice(0, 10)}</Ltr></Kv>
              <Kv k={m("branchName")}>{bdi(r.branchName)}</Kv>
              <Kv k={m("expenseTypeName")}>{bdi(r.expenseTypeName)}</Kv>
              <Kv k={m("note")}>{bdi(r.note)}</Kv>
            </Section>
            <Section title={m("payment")}>
              <Kv k={m("cash")}><Ltr>{piastresText(r.cash)}</Ltr></Kv>
              <BankKvs tr={tr} rows={r.bankPayments} names={r.bankNames} />
              <Kv k={m("total")}><Ltr>{piastresText(r.total)}</Ltr></Kv>
            </Section>
            <div className="note">{m("fixedNote")}</div>
          </>
        );
      },
      // Delete is the whole undo (safe and bank balances sum live documents). No balance check.
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => `${baseOf(r._kind ?? openKind)}/${r.id}`,
        confirm: (r) => ({ title: mk(r._kind ?? openKind)("deleteTitle", { code: code6(r.documentNumber) }), text: mk(r._kind ?? openKind)("deleteBody") }),
      },
    },
    forms: {
      createExpense: { title: mk("expense")("new"), display: "page", fields: [], path: () => "/expenses", custom: (p: CustomFormProps) => <ExpenseForm kind="expense" {...p} /> },
      createRefund: { title: mk("refund")("new"), display: "page", fields: [], path: () => "/expense-refunds", custom: (p: CustomFormProps) => <ExpenseForm kind="refund" {...p} /> },
    },
  };
};

export const makeConfig: MakeConfig = build;

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
