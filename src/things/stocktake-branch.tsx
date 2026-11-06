"use client";
import { DataTable, Td, Tr as TRow, useTableSort } from "@/components/ui";
// جرد الفرع: stock/branch-stock (stock-by-category, stock-by-item, sales-by-item). READ ONLY. Ported from docs/nav-preview/app/things/stocktake-branch.js.
// Stock by category / by item: one row per category or item, a weight and a count per karat that has stock, then totals and the weight as 21 karat.
// An item row opens its pieces (the branch-stock report filtered by the item, first 100 by code). Sales by item: sold lines grouped by item name and karat.
import { useMemo } from "react";
import { api } from "@/lib/api";
import type { Column, FilterConfig, MakeConfig, RecordConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Ltr, ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { useJobIntent } from "./job-intent";
import { KARATS, code6, footerOf, useGoldTreasuries, useLists, type GoldTreasury, type Lists } from "./stocktake-shared";

let lastQuery: Record<string, string> = {};      // the filters of the last stock run: the pieces of an item are asked with them
const PIECES = 100;

function StockPieces({ rows, m, karatName }: { rows: Row[]; m: (k: string) => string; karatName: (k: string) => string }) {
  const s = useTableSort(rows, { code: { kind: "text", get: (x) => x.pieceCode }, karat: { kind: "number", get: (x) => x.karat }, weight: { kind: "number", get: (x) => x.weightMg }, tag: { kind: "number", get: (x) => x.tagPrice } });
  return (
    <DataTable tableId="stock-pieces" style={{ overflowX: "auto" }} head={[s.col("code", m("branchStock.columns.code")), s.col("karat", m("branchStock.karat")), s.col("weight", m("branchStock.columns.weight"), { num: true }), s.col("tag", m("branchStock.columns.tagPrice"), { num: true })]}>
      {s.rows.map((x) => <TRow key={x.pieceCode}><Td dir="ltr">{x.pieceCode}</Td><Td dir="ltr">{karatName(x.karat)}</Td><Td num>{milligramsText(x.weightMg)}</Td><Td num>{piastresText(x.tagPrice)}</Td></TRow>)}
    </DataTable>
  );
}

export const makeConfigWith = (treasuries: GoldTreasury[], lists: Lists): MakeConfig => (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-stocktake", k, v);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const karatName = (k: string) => m(`branchStock.karats.${k}`);
  const codeField = (name: string, label: string): FilterConfig => ({ name, label, type: "number", min: 1, max: 999999999999999, positive: true });

  const stockFilters = (): FilterConfig[] => [
    { name: "branchId", label: m("branchStock.branchId"), type: "select", options: lists.branches, placeholder: ALL },
    { name: "treasuryId", label: m("branchStock.treasuryId"), type: "select", options: treasuries.map((x) => [x.id, `${x.branchName} · ${x.treasuryName}`]), placeholder: ALL },
    { name: "karat", label: m("branchStock.karat"), type: "select", options: KARATS.slice().reverse().map((k) => [k, karatName(k)]), placeholder: ALL },
    { name: "untilDate", label: m("branchStock.untilDate"), type: "date", placeholder: m("branchStock.today") },
    codeField("fromCode", m("branchStock.fromCode")),
    { ...codeField("toCode", m("branchStock.toCode")), validate: (v, all) => (v !== "" && all.fromCode !== "" && v < all.fromCode ? m("branchStock.toCodeBelowFrom") : null) },
    { name: "categoryId", label: m("branchStock.categoryId"), type: "select", options: lists.categories, placeholder: ALL },
    { name: "itemId", label: m("branchStock.itemId"), type: "select", options: lists.items, placeholder: ALL },
  ];

  // ───── stock by category / by item ─────
  const stockView = (item: boolean): ViewConfig => {
    let karats = KARATS.slice();                   // the karats that have stock in the whole result (the answer says which)
    const kcell = (r: Row, k: string) => (r.byKarat as Row[]).find((x) => x.karat === k);
    const cols = (): Column[] => [
      { key: "code", label: m("branchStock.columns.code"), get: (r) => r.code, render: (r) => <Ltr>{code6(r.code)}</Ltr> },
      { key: "name", label: item ? m("branchStock.columns.item") : m("branchStock.columns.category"), get: (r) => r.name, ...(item ? { render: (r: Row) => <span className="link">{r.name}</span> } : {}) },
      ...(item ? [{ key: "category", label: m("branchStock.columns.category"), get: (r: Row) => r.categoryName, sortable: false }] : []),
      ...karats.flatMap((k): Column[] => [
        { key: `weight-${k}`, label: m("branchStock.columns.weightOf", { karat: karatName(k) }), type: "weight", get: (r) => kcell(r, k)?.weightMg ?? 0, sortable: false },
        { key: `count-${k}`, label: m("branchStock.columns.countOf", { karat: karatName(k) }), type: "int", get: (r) => kcell(r, k)?.count ?? 0, sortable: false },
      ]),
      { key: "count", label: m("branchStock.columns.totalCount"), type: "int", get: (r) => r.count },
      { key: "weight", label: m("branchStock.columns.totalWeight"), type: "weight", get: (r) => r.weightMg },
      { key: "weight21", label: m("branchStock.columns.weight21"), type: "weight", get: (r) => r.weight21Mg },
    ];
    const path = item ? "/reports/stock-by-item" : "/reports/stock-by-category";
    return {
      id: item ? "by-item" : "by-category",
      label: m(item ? "titles.stock-by-item" : "titles.stock-by-category"),
      keys: [item ? "gold-stocktake/stock-by-item" : "gold-stocktake/stock-by-category"],
      rowKey: "id",
      exportPath: path,
      runLabel: rep("run"),
      filters: stockFilters(),
      sort: { default: { key: "code", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      get columns() { return cols(); },
      load: (query, { signal }) => {
        const { page, pageSize, sort, order, ...filters } = query;
        void page; void pageSize; void sort; void order;
        lastQuery = filters as Record<string, string>;
        return api(path, { query, signal });
      },
      transform: (rows, a) => { karats = KARATS.filter((k) => (a?.karats ?? []).includes(k)); return rows; },   // the columns follow the answer
      onRow: item ? undefined : false,
      footer: (_rows, a) => {
        const tot = a.totals, byK = (k: string) => (tot.byKarat as Row[]).find((x) => x.karat === k);
        return footerOf(cols(), rep("total"), { ...Object.fromEntries(karats.flatMap((k) => [[`weight-${k}`, byK(k)?.weightMg ?? 0], [`count-${k}`, byK(k)?.count ?? 0]])), count: tot.count, weight: tot.weightMg, weight21: tot.weight21Mg }, tr);
      },
    };
  };

  // ───── sales by item ─────
  const salesView = (): ViewConfig => {
    const c = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: m(`salesByItem.columns.${key}`), type, get, ...extra });
    const cols: Column[] = [c("item", undefined, (r) => r.itemName), c("karat", undefined, (r) => r.karat, { render: (r) => <Ltr>{r.karat}</Ltr> }), c("quantity", "int", (r) => r.quantity), c("weight", "weight", (r) => r.weightMg), c("discount", "money", (r) => r.discount, { sortable: false }), c("amount", "money", (r) => r.amount)];
    const invoice = (name: string, label: string): FilterConfig => ({ name, label, type: "number", min: 1, max: 9999999 });
    return {
      id: "sales-by-item",
      label: m("salesByItem.title"),
      keys: ["gold-stocktake/sales-by-item"],
      endpoint: "/reports/sales-by-item",
      rowKey: "_k",
      transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.itemName}|${r.karat}` })),   // grouped by item name and karat
      runLabel: rep("run"),
      filters: [
        { name: "branchId", label: m("salesByItem.branchId"), type: "select", options: lists.branches, placeholder: ALL },
        { name: "fromDate", label: m("salesByItem.fromDate"), type: "date" },
        { name: "toDate", label: m("salesByItem.toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) },
        invoice("fromInvoice", m("salesByItem.fromInvoice")),
        { ...invoice("toInvoice", m("salesByItem.toInvoice")), validate: (v, all) => (v !== "" && all.fromInvoice !== "" && v < all.fromInvoice ? m("salesByItem.toInvoiceBelowFrom") : null) },
      ],
      sort: { default: { key: "item", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      columns: cols,
      onRow: false,
      footer: (_rows, a) => footerOf(cols, rep("total"), { quantity: a.totals?.quantity ?? 0, weight: a.totals?.weightMg ?? 0, amount: a.totals?.amount ?? 0 }, tr),
    };
  };

  // ───── the pieces behind an item row (record sheet): the branch-stock report with the report's filters plus the item, first 100 by piece code ─────
  const record: RecordConfig = {
    title: (r) => `${m("branchStock.piecesTitle")} · ${r.name}`,
    enrich: async (r) => ({ pieces: await api("/reports/branch-stock", { query: { ...lastQuery, itemId: r.id, sort: "pieceCode", order: "asc", page: 1, pageSize: PIECES } }) }),
    render: (r) => {
      const p = r.pieces, rows: Row[] = p.items ?? [];
      const line = p.total > rows.length ? m("branchStock.piecesFirst", { shown: rows.length, total: p.total }) : m("branchStock.pieces", { count: p.total, shown: String(p.total) });
      return <>
        <h3 className="grp-title">{m("branchStock.piecesTitle")} · {r.name}</h3><div className="help">{line}</div>
        <StockPieces rows={rows} m={m} karatName={karatName} />
      </>;
    },
    actions: [],
  };

  return {
    id: "branch-stock",
    title: L("جرد الفرع", "Branch stock"),
    unit: L("سجل", "rows"),
    keys: ["gold-stocktake/stock-by-category", "gold-stocktake/stock-by-item", "gold-stocktake/sales-by-item"],
    views: [stockView(false), stockView(true), salesView()],
    record,
  };
};

export default function Page() {
  const treasuries = useGoldTreasuries();
  const initial = useJobIntent();
  const lists = useLists();
  const make = useMemo(() => makeConfigWith(treasuries, lists), [treasuries, lists]);
  return <ThingPage make={make} access={useAccess()} initial={initial} />;
}
