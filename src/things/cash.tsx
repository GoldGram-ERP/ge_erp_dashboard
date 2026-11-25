"use client";
// حركات النقدية: money/cash = cash-accounts/{cash-movements, cash-movements-history, safe-statement, safe-balances}. Ported from docs/nav-preview/app/things/cash.js.
// Views: movement history EGP (dates, search, deleted-only for the Super admin), safe statement, safe balances. No gold movements screen.
// A row of the history opens the movement. Add page: cash-movement-form.tsx (EGP). Delete: cash movements only.
import type { Column, FilterConfig, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateTimeText, dateText, milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Kv, Ltr, Section, cellNode } from "@/components/engine";
import { useAccess } from "./sales-access";
import { EgpMovementForm } from "./cash-movement-form";
import { branchSpec, code6, dict, foot, moneyNode } from "./money-shared";

export function buildConfig(tr: Tr): ThingConfig {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("cash-accounts", `cashMovements.${k}`, v);
  const sb = (k: string) => t("cash-accounts", `safeStatement.${k}`);
  const bal = (k: string) => t("cash-accounts", `safeBalances.${k}`);
  const { rep } = dict(tr);
  const ALL = rep("all");
  const typeBadge: Column["statuses"] = { deposit: [m("deposit"), "good"], withdraw: [m("withdraw"), "warn"] };
  const deleted = <span className="st off"><i />{m("deletedBadge")}</span>;
  const num = (r: Record<string, any>) => <><Ltr>{code6(r.documentNumber)}</Ltr>{r.deletedAt && <> {deleted}</>}</>;
  const note = (r: Record<string, any>) => <bdi dir="auto">{r.note}</bdi>;

  const from = (label: string): FilterConfig => ({ name: "fromDate", label, type: "date" });
  const to = (label: string): FilterConfig => ({ name: "toDate", label, type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) });
  const branch = (label: string): FilterConfig => ({ name: "branchId", label, type: "select", optionsFrom: branchSpec, placeholder: ALL });
  // The deleted rows are read by everyone who has the screen (owner, 2026-11-25), read only.
  const deletedBox = (): FilterConfig[] => [{ name: "deleted", label: m("deletedOnly"), type: "checkbox", toQuery: (v) => (v ? { deleted: "only" } : {}) }];

  // The EGP movements as the dashboard's history lists them: newest first; the list takes only these parameters and `page`.
  const egp: ViewConfig = {
    id: "list", label: `${m("listTitle")} · ${m("egp")}`, keys: ["cash-accounts/cash-movements-history"],
    endpoint: "/cash-movements", rowKey: "id",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    filters: [from(m("fromDate")), to(m("toDate")), ...deletedBox()],
    paging: { sizeParam: null, sizes: [20], size: 20 },
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    columns: [
      { key: "documentNumber", label: m("documentNumber"), render: num },
      { key: "branchName", label: m("branchName") },
      { key: "movementType", label: m("movementType"), type: "status", statuses: typeBadge },
      { key: "date", label: m("date"), type: "date" },
      { key: "note", label: m("note"), render: note },
      { key: "amount", label: m("amount"), type: "money" },
    ],
  };

  // Safe statement (EGP): the lines of the safes with the running balance; totals in/out are over the whole result.
  const sc = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: sb(`columns.${key}`), type, ...extra });
  const stCols: Column[] = [
    sc("date", "date"), sc("in", "money"), sc("out", "money"),
    sc("balance", "money", { render: (r) => moneyNode(r.balance, piastresText(r.balance)) }),
    sc("movementType", undefined, { render: (r) => sb(`types.${r.movementType}`) }),
    sc("note", undefined, { render: note }),
    sc("movementNumber", undefined, { render: (r) => (r.movementNumber === null ? "—" : <Ltr>{code6(r.movementNumber)}</Ltr>) }),
    sc("invoiceNumber", undefined, { render: (r) => (r.invoiceNumber === null ? "—" : <Ltr>{code6(r.invoiceNumber)}</Ltr>) }),
  ];
  const statement: ViewConfig = {
    id: "safe-statement", label: sb("title"), keys: ["cash-accounts/safe-statement"],
    endpoint: "/reports/safe-statement", rowKey: "_k",
    transform: (rows) => rows.map((r, i) => ({ ...r, _k: `${r.id}|${r.movementType}|${i}` })),   // one document can give two lines
    runLabel: rep("run"),
    filters: [
      branch(sb("branchId")), from(sb("fromDate")), to(sb("toDate")),
      { name: "movementType", label: sb("movementType"), type: "select", options: ["deposit", "withdraw", "expense", "expenseRefund", "salesInvoice", "salesReturn", "reservation", "transferOut", "transferIn"].map((k) => [k, sb(`types.${k}`)] as [string, string]), placeholder: ALL },
      { name: "accountingType", label: rep("accountingType"), type: "select", options: ["debit", "credit"].map((k) => [k, rep(k)] as [string, string]), placeholder: ALL },
    ],
    sort: { default: { key: "date", dir: "asc" } },
    paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: stCols, onRow: false,
    answerExtra: (a) => `${sb("balanceBefore")} ${piastresText(a?.balanceBefore ?? 0)}`,
    footer: (_rows, a) => foot(stCols, rep("total"), a?.totals ? { in: piastresText(a.totals.in), out: piastresText(a.totals.out) } : {}),
  };

  // Safe balances (EGP): one row per branch, as of a day.
  const bc = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: bal(`columns.${key}`), type, ...extra });
  const balCols: Column[] = [bc("code", undefined, { render: (r) => <Ltr>{code6(r.code)}</Ltr> }), bc("branch"), bc("total", "money", { render: (r) => moneyNode(r.total, piastresText(r.total)) })];
  const balances: ViewConfig = {
    id: "safe-balances", label: bal("title"), keys: ["cash-accounts/safe-balances"],
    endpoint: "/reports/safe-balances", rowKey: "branchId", runLabel: rep("run"),
    filters: [{ name: "untilDate", label: bal("untilDate"), type: "date" }],
    sort: { default: { key: "code", dir: "asc" } },
    paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: balCols, onRow: false,
    footer: (_rows, a) => foot(balCols, rep("total"), a?.totals ? { total: piastresText(a.totals.total) } : {}),
  };

  const withRow = (v: ViewConfig): ViewConfig => (v.onRow === undefined ? { ...v, onRow: (row, h) => h.open(row) } : v);

  return {
    id: "cash",
    title: m("title"),
    unit: L("حركة", "movement"),
    keys: ["cash-accounts/cash-movements", "cash-accounts/cash-movements-history", "cash-accounts/safe-statement", "cash-accounts/safe-balances"],
    views: [egp, statement, balances].map(withRow),
    // One header button: the EGP movement. There is no gold movement screen or button (the business has cash only).
    create: [
      { form: "createEgp", label: `${m("add")} · ${m("egp")}`, keys: ["cash-accounts/cash-movements"] },
    ],
    record: {
      title: (r) => `${m("recordNo")} ${code6(r.documentNumber)}`,
      // A Super admin reads a deleted one too. shortcut: a gold movement opened by an address with only its id reads the cash route (the engine knows the kind from the row).
      endpoint: (r) => (r.karat ? `/gold-movements/${r.id}` : `/cash-movements/${r.id}`),
      render: (r) => (
        <>
          {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
          <Section title={L("التفاصيل", "Details")}>
            <Kv k={m("documentNumber")}><Ltr>{code6(r.documentNumber)}</Ltr></Kv>
            <Kv k={m("branchName")}>{r.branchName}</Kv>
            <Kv k={m("treasury")}>{r.treasuryName} <Ltr>{code6(r.treasuryCode)}</Ltr></Kv>
            <Kv k={m("movementType")}>{cellNode({ key: "movementType", type: "status", statuses: typeBadge }, r, tr)}</Kv>
            <Kv k={m("date")}><Ltr>{dateText(r.date)}</Ltr></Kv>
            {r.karat ? <><Kv k={m("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={m("weight")}><Ltr>{milligramsText(r.weightMg)}</Ltr></Kv></> : <Kv k={m("amount")}><Ltr>{piastresText(r.amount)}</Ltr></Kv>}
            <Kv k={m("note")}>{note(r)}</Kv>
            <Kv k={L("تاريخ الحفظ", "Saved on")}><Ltr>{dateTimeText(r.createdAt)}</Ltr></Kv>
          </Section>
        </>
      ),
      // Delete = soft delete (the safe balance stops counting it). Cash movements only: the dashboard has no delete for a gold movement.
      // Never edited (no edit route). The backend answers 403 notAllowed to a User without the treasury switch; the button shows to everyone, as in the dashboard.
      remove: {
        when: (r) => !r.deletedAt && !r.karat,
        path: (r) => `/cash-movements/${r.id}`,
        confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.documentNumber) }), text: m("deleteBody") }),
      },
    },
    forms: {
      createEgp: { display: "page", title: `${m("new")} · ${m("egp")}`, fields: [], path: () => "/cash-movements", custom: EgpMovementForm },
    },
  };
}

export const makeConfig: MakeConfig = (tr) => buildConfig(tr);

export default function Page() { return <ThingPage make={buildConfig} access={useAccess()} />; }
