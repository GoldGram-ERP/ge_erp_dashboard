"use client";
// الخزن: money/treasuries = treasuries/{treasuries, treasury-balances} + cash-accounts/treasury-statement. Ported from docs/nav-preview/app/things/treasuries.js.
// Read only (no screen creates, edits or deletes a treasury). Views: the treasuries by branch, the balances report, the statement of one treasury.
// Decision (as in the HTML): the one treasury list names branch, treasury and kind, so the statement filter needs no separate kind choice.
import type { Column, FilterConfig, LookupSpec, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { intText, milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { ThingPage, Ltr } from "@/components/engine";
import { useAccess } from "./sales-access";
import { branchSpec, code6, dict, foot, goldNode, KIND_TONE, lines, moneyNode } from "./money-shared";

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string) => t("treasuries", `treasuries.${k}`);
  const { rep, tr: trr, kindText } = dict(tr);
  const ALL = rep("all");
  const branch = (): FilterConfig => ({ name: "branchId", label: trr("branch"), type: "select", optionsFrom: branchSpec, placeholder: ALL });
  const kindStatuses: Column["statuses"] = Object.fromEntries(["egp", "gold", "secondary"].map((k) => [k, [kindText(k), KIND_TONE[k]]]));

  // One list, no pages; grouped by branch on request, as the dashboard draws a card per branch.
  const list: ViewConfig = {
    id: "list", label: m("title"), keys: ["treasuries/treasuries"],
    endpoint: "/treasuries", rowKey: "id",
    filters: [branch(), { name: "handledByMe", label: L("الخزن التي أتعامل معها فقط", "Treasuries I handle only"), type: "checkbox" }],
    paging: false,
    groupBy: [{ get: (r) => r.branchName, label: trr("branch") }],
    onRow: false,
    columns: [
      { key: "treasuryCode", label: trr("columns.code"), render: (r) => <Ltr>{code6(r.treasuryCode)}</Ltr> },
      { key: "treasuryName", label: trr("columns.treasury") },
      { key: "branchName", label: trr("columns.branch") },
      { key: "kind", label: trr("columns.kind"), type: "status", statuses: kindStatuses },
      { key: "handledByMe", label: L("أتعامل معها", "I handle it"), type: "bool" },
    ],
  };

  // Treasury balances: cash, bulk gold, pieces held and what is on its way, per treasury. Every row at once.
  const bc = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: trr(`columns.${key}`), type, ...extra });
  const transit = (x: any) => (x.pieceCount === 0 && x.amountPiastres === 0 && x.gold.length === 0 ? "—" : lines([
    ...(x.amountPiastres ? [piastresText(x.amountPiastres)] : []),
    ...(x.pieceCount ? [`${intText(x.pieceCount)} · ${milligramsText(x.pieceWeightMg)}`] : []),
    ...x.gold.map((l: any) => `${l.karat}K ${milligramsText(l.weightMg)}`),
  ]));
  const balCols: Column[] = [
    bc("code", undefined, { render: (r) => <Ltr>{code6(r.treasury.treasuryCode)}</Ltr> }),
    bc("treasury", undefined, { get: (r) => r.treasury.treasuryName }),
    bc("branch", undefined, { get: (r) => r.treasury.branchName }),
    bc("kind", undefined, { render: (r) => kindText(r.treasury.kind) }),
    bc("cash", "money", { render: (r) => moneyNode(r.amountPiastres, piastresText(r.amountPiastres)) }),
    bc("gold", undefined, { className: "num", render: (r) => goldNode(r.gold) }),
    bc("pieces", undefined, { className: "num", render: (r) => lines(r.pieces.map((l: any) => `${l.karat}K ${intText(l.count)} · ${milligramsText(l.weightMg)}`)) }),
    bc("inTransitOut", undefined, { className: "num", render: (r) => transit(r.inTransitOut) }),
    bc("inTransitIn", undefined, { className: "num", render: (r) => transit(r.inTransitIn) }),
  ];
  const balances: ViewConfig = {
    id: "balances", label: t("treasury-reports", "balances.title"), keys: ["treasuries/treasury-balances"],
    endpoint: "/reports/treasury-balances", rowKey: "_k",
    transform: (rows) => rows.map((r) => ({ ...r, _k: r.treasury.id })),
    runLabel: rep("run"),
    filters: [branch()],
    paging: false, onRow: false, columns: balCols,
    footer: (_rows, a) => foot(balCols, rep("total"), a?.totals ? {
      cash: piastresText(a.totals.amountPiastres), pieces: intText(a.totals.pieceCount),
      inTransitOut: `${intText(a.totals.inTransitPieceCount)} · ${piastresText(a.totals.inTransitAmountPiastres)}`,
    } : {}),
  };

  // Treasury statement: every movement of one treasury in a period, between the opening and the closing balance.
  const sc = (key: string, type?: Column["type"], extra: Partial<Column> = {}): Column => ({ key, label: trr(`columns.${key === "kind" ? "movementKind" : key}`), type, ...extra });
  const stCols: Column[] = [
    sc("date", "date"),
    sc("kind", undefined, { render: (r) => trr(`lineKinds.${r.kind}`) }),
    sc("documentNumber", undefined, { render: (r) => <Ltr>{code6(r.documentNumber)}</Ltr> }),
    sc("in", "money", { get: (r) => r.amountIn }),
    sc("out", "money", { get: (r) => r.amountOut }),
    sc("balance", "money", { get: (r) => r.balanceAfter, render: (r) => moneyNode(r.balanceAfter, piastresText(r.balanceAfter)) }),   // the EGP balance after this line
    sc("gold", undefined, { className: "num", render: (r) => lines(r.gold.map((g: any) => `${g.karat}K ${g.inMg > 0 ? `+${milligramsText(g.inMg)}` : ""}${g.inMg > 0 && g.outMg > 0 ? " " : ""}${g.outMg > 0 ? `-${milligramsText(g.outMg)}` : ""}`)) }),
    sc("pieceCount", "int"),
  ];
  const side = (b: any) => `${piastresText(b.amountPiastres)}${b.gold.length ? ` · ${b.gold.map((g: any) => `${g.karat}K ${milligramsText(g.weightMg)}`).join(" · ")}` : ""}`;
  // The treasury list answers whole and refuses page/limit (paged: false).
  const treasurySpec: LookupSpec = { path: "/treasuries", value: "id", label: (r) => `${r.branchName} · ${r.treasuryName} · ${kindText(r.kind)}`, paged: false };
  const statement: ViewConfig = {
    id: "statement", label: t("treasury-reports", "statement.title"), keys: ["cash-accounts/treasury-statement"],
    endpoint: "/reports/treasury-statement", rowsPath: "lines", rowKey: "_k",
    transform: (rows) => rows.map((r, i) => ({ ...r, _k: `${r.documentNumber}|${r.kind}|${i}` })),
    runLabel: rep("run"),
    filters: [
      { name: "treasuryId", label: trr("treasury"), type: "select", optionsFrom: treasurySpec, placeholder: L("اختر الخزنة", "Choose the treasury"), required: true, searchable: true },
      { name: "fromDate", label: trr("fromDate"), type: "date" },
      { name: "toDate", label: trr("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) },
    ],
    paging: false, onRow: false, columns: stCols,
    answerExtra: (a) => `${trr("statement.opening")} ${side(a.opening)} · ${trr("statement.net")} ${piastresText(a.totals?.net ?? 0)} · ${trr("statement.closing")} ${side(a.closing)}`,
    // In and out are the server's totals of the whole period; the balance cell is the closing balance (opening + net).
    footer: (rows, a) => foot(stCols, rep("total"), { in: piastresText(a?.totals?.amountIn ?? 0), out: piastresText(a?.totals?.amountOut ?? 0), balance: moneyNode(a?.closing?.amountPiastres ?? 0, piastresText(a?.closing?.amountPiastres ?? 0)), pieceCount: intText(rows.reduce((s, r) => s + r.pieceCount, 0)) }),
  };

  return {
    id: "treasuries",
    title: m("title"),
    unit: L("خزنة", "treasury"),
    keys: ["treasuries/treasuries", "treasuries/treasury-balances", "cash-accounts/treasury-statement"],
    views: [list, balances, statement],
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
