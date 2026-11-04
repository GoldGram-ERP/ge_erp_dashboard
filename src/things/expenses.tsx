"use client";
// المصروفات: expenses/expenses, expenses-history, expense-refunds, expense-refunds-history, expenses-report, expenses-by-type.
// Ported from docs/nav-preview/app/things/expenses.js. Views: expense history, refund history, expenses report, expenses by type.
// Writes: add expense, add refund, delete (record). A saved expense/refund is never edited (no PATCH route). Expenses and refunds are the same
// shape: one factory builds both. No cash-balance check, no editing window.
// Not built (queued jobs, as in the HTML): report print preview and Excel, the Columns picker, the correction-job prefill, add-new-from-picker.
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { Column, FieldConfig, LookupSpec, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { latinNumber, piastresText, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section } from "@/components/engine";
import { branchSpec, code6, foot } from "./money-shared";
import { useAccess } from "./sales-access";

const NOTE_MAX = 250;                    // NOTE_MAX_LENGTH (dashboard = backend)
const MAX_PIASTRES = 9_999_999_999_999;  // the largest amount the backend holds
const typeSpec: LookupSpec = { path: "/expense-types", value: "id", label: (r) => `${code6(r.expenseCode)} · ${r.expenseTypeName}` };
const accountSpec: LookupSpec = { path: "/bank-accounts", value: "id", label: (r) => `${r.accountName} · ${code6(r.code)}`, query: { order: "newest" } };
type Kind = "expense" | "refund";
const nsOf = (kind: Kind) => (kind === "expense" ? "expenses" : "expenseRefunds");
const baseOf = (kind: Kind) => (kind === "expense" ? "/expenses" : "/expense-refunds");

const build = (tr: Tr, ownBranch: string): ThingConfig => {
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
      chips: [{ id: "all", label: ALL }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
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

  // ───── the add form (both kinds) ─────
  // Payload {date, branchId, expenseTypeId, note, cash, bankAccountId|null, bankAmount}; money in whole piastres, empty = 0.
  // Rules (dashboard zod = backend domain): date, branch and type required; cash and bank amount each >= 0, together > 0 (else amountsRequired),
  // together <= MAX_PIASTRES; a bank account exactly when the bank amount > 0. The expense-code box only picks the type (never sent).
  const addForm = (kind: Kind) => {
    const m = mk(kind), exp = kind === "expense", isInt = Number.isInteger;
    return {
      title: m("new"),
      path: () => baseOf(kind),
      method: "POST",
      // A User starts on their own branch.
      load: () => ({ date: today(), branchId: ownBranch }),
      toPayload: (v: Record<string, any>) => ({
        date: v.date, branchId: v.branchId, expenseTypeId: v.expenseTypeId, note: v.note,
        cash: v.cash || 0, bankAccountId: (v.bankAmount || 0) > 0 ? v.bankAccountId : null, bankAmount: v.bankAmount || 0,
      }),
      afterSave: (a: any, h: { toast: (m: string) => void }) => { if (a?.documentNumber) h.toast(m("savedNumber", { code: code6(a.documentNumber) })); },
      // The code box and the type box follow each other: a typed code (after a short pause) picks the type; a picked type writes its code.
      onReady: ({ watch, setValue }: { watch: (cb: (raw: Record<string, any>, changed?: string) => void) => () => void; setValue: (n: string, raw: unknown) => void }) => {
        let timer: ReturnType<typeof setTimeout> | undefined, asked = 0;
        const stop = watch((raw, changed) => {
          if (changed === "expenseCode") {
            clearTimeout(timer); const mine = ++asked;
            timer = setTimeout(async () => {
              const digits = latinNumber(raw.expenseCode ?? "");
              if (digits === "") return;
              let found: any = null;
              if (/^\d{1,9}$/.test(digits)) {
                try { found = (await api("/expense-types", { query: { search: String(Number(digits)) } })).items?.find((x: any) => x.expenseCode === Number(digits)) ?? null; } catch { return; }
              }
              if (mine !== asked) return;
              setValue("expenseTypeId", found ? found.id : "");
            }, 300);
          } else if (changed === "expenseTypeId" && raw.expenseTypeId) {
            const mine = ++asked;
            api(`/expense-types/${raw.expenseTypeId}`).then((row) => { if (mine === asked && String(row.expenseCode) !== latinNumber(raw.expenseCode ?? "")) setValue("expenseCode", String(row.expenseCode)); }).catch(() => {});
          }
        });
        return () => { clearTimeout(timer); stop(); };
      },
      fields: [
        { name: "documentNumber", label: m("documentNumber"), type: "code", documentType: exp ? "expense" : "expense_refund", branchField: "branchId", dateField: "date", hint: m("autoHint"), section: m("details") },
        { name: "date", label: m("date"), type: "date", required: true, section: m("details") },
        { name: "branchId", label: m("branchId"), type: "select", required: true, optionsFrom: branchSpec, section: m("details") },
        { name: "expenseCode", label: m("expenseCode"), type: "text", maxLength: 9, section: m("details"), validate: (v, all) => (v && !all.expenseTypeId ? m("noSuchCode") : null) },
        { name: "expenseTypeId", label: m("expenseTypeId"), type: "select", required: true, optionsFrom: typeSpec, section: m("details") },
        { name: "note", label: m("note"), type: "text", maxLength: NOTE_MAX, section: m("details") },
        {
          name: "cash", label: m("cash"), type: "money", emptyAs: 0, section: exp ? m("paidInCash") : m("inCash"),
          validate: (v, all) => {
            if (!isInt(v) || !isInt(all.bankAmount ?? 0)) return null;
            const sum = v + (all.bankAmount ?? 0);
            return sum === 0 ? m("amountsRequired") : sum > MAX_PIASTRES ? m("amountInvalid") : null;
          },
        },
        {
          name: "bankAccountId", label: m("bankAccountId"), type: "select", optionsFrom: accountSpec, emptyAs: "", section: exp ? m("paidByCard") : m("byCard"),
          validate: (v, all) => (isInt(all.bankAmount) && all.bankAmount > 0 && !v ? t("common", "fieldErrors.required") : null),
        },
        { name: "bankAmount", label: m("bankAmount"), type: "money", emptyAs: 0, section: exp ? m("paidByCard") : m("byCard") },
      ] as FieldConfig[],
    };
  };

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
      enrich: async () => ({ _kind: openKind }),
      render: (r) => {
        const m = mk(r._kind ?? openKind), exp = (r._kind ?? openKind) === "expense";
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
            <Section title={exp ? m("paidInCash") : m("inCash")}><Kv k={m("cash")}><Ltr>{piastresText(r.cash)}</Ltr></Kv></Section>
            <Section title={exp ? m("paidByCard") : m("byCard")}>
              <Kv k={m("bankAccountName")}>{bdi(r.bankAccountName ?? "—")}</Kv>
              <Kv k={m("bankAmount")}><Ltr>{piastresText(r.bankAmount)}</Ltr></Kv>
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
    forms: { createExpense: addForm("expense"), createRefund: addForm("refund") },
  };
};

export const makeConfig: MakeConfig = (tr) => build(tr, "");

export default function Page() {
  const { data: me } = useMe();
  const own = me?.userType === "user" ? (me.branchId ?? "") : "";
  const make = useMemo(() => (tr: Tr) => build(tr, own), [own]);
  return <ThingPage make={make} access={useAccess()} />;
}
