"use client";
// جرد الذهب: stock/count (stock-count, previous-counts, missing-pieces, missing-pieces-previous). Ported from docs/nav-preview/app/things/stocktake-count.js.
// Views: the history of counts (button "Start a count"; an open or closed count opens its board (scan page; a closed one frozen), a deleted one its record sheet), the look-up of one previous
// count (counters per karat), and the two missing-pieces reports (read only). Writes: start (stocktake-count-start), scan / camera / Save and close / Delete
// (stocktake-count-scan), and Delete from the record sheet (soft; no stock moves). The stock-counts list takes search, fromDate, toDate, page, deleted (size fixed at 20).
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import type { Column, CustomFormProps, FilterConfig, MakeConfig, RecordConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { intText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { useAccess } from "./sales-access";
import { useJobIntent } from "./job-intent";
import { ScanPage } from "./stocktake-count-scan";
import { StartForm } from "./stocktake-count-start";
import { code6, footerOf, nameOf, useLists, type Lists } from "./stocktake-shared";

const CHIPS_MAX = 1000;

export const makeConfigWith = (onScan: (id: string) => void, lists: Lists): MakeConfig => (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-stocktake", k, v);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const karatName = (k: string) => m(`branchStock.karats.${k}`);
  const deletedBadge = t("gold-sales", "salesInvoices.deletedBadge");

  const from = (ns: string): FilterConfig => ({ name: "fromDate", label: m(`${ns}.fromDate`), type: "date" });
  const to = (ns: string): FilterConfig => ({ name: "toDate", label: m(`${ns}.toDate`), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) });
  const countNo = (label: string, required: boolean): FilterConfig => ({ name: "countNumber", label, type: "number", required, min: 1, max: 9999999 });

  // ───── the history ─────
  const history: ViewConfig = {
    id: "list",
    label: m("stockCount.listTitle"),
    keys: ["gold-stocktake/stock-count"],
    endpoint: "/stock-counts",
    rowKey: "id",
    search: { param: "search", placeholder: m("stockCount.searchPlaceholder") },
    chips: [{ id: "all", label: ALL }, { id: "deleted", label: t("gold-sales", "salesInvoices.deletedOnly"), query: { deleted: "only" }, superOnly: true }],
    filters: [from("missingPieces"), to("missingPieces")],
    paging: { sizeParam: null, sizes: [20], size: 20 },     // the list takes only page; its size is fixed
    columns: [
      { key: "countNumber", label: m("stockCount.countNumber"), render: (r) => <Ltr>{code6(r.countNumber)}</Ltr> },
      { key: "countDate", label: m("stockCount.countDate"), type: "date" },
      { key: "status", label: `${m("stockCount.statusOpen")} / ${m("stockCount.statusClosed")}`, type: "status", get: (r) => (r.deletedAt ? "deleted" : r.status),
        statuses: { deleted: [deletedBadge, "off"], open: [m("stockCount.statusOpen"), "good"], closed: [m("stockCount.statusClosed"), "off"] } },
      { key: "scannedCount", label: m("stockCount.scanned"), type: "int" },
      { key: "missingCount", label: m("stockCount.missing"), render: (r) => (r.status === "closed" ? intText(r.missingCount) : "") },
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
    create: [{ form: "start", label: m("stockCount.add") }],
    onRow: (row, h) => (!row.deletedAt ? onScan(row.id) : h.open(row)),   // open or closed: the live board (a closed one frozen)
  };

  // ───── one previous count (counters per karat) ─────
  const previous = (): ViewConfig => {
    const c = (key: string, type?: Column["type"]): Column => ({ key, label: m(`previousCounts.columns.${key}`), type, ...(key === "karat" ? { render: (r: Row) => <Ltr>{karatName(r.karat)}</Ltr> } : {}) });
    const cols = [c("karat"), c("atStartPieces", "int"), c("countedPieces", "int"), c("notCountedPieces", "int"), c("atStartWeightMg", "weight"), c("countedWeightMg", "weight"), c("notCountedWeightMg", "weight")];
    return {
      id: "previous",
      label: m("previousCounts.title"),
      keys: ["gold-stocktake/previous-counts"],
      rowKey: "karat",
      runLabel: m("previousCounts.lookUp"),
      filters: [{ name: "branchId", label: m("previousCounts.branch"), type: "select", options: lists.branches, required: true, placeholder: m("previousCounts.needBranch") }, countNo(m("previousCounts.countNumber"), true)],
      paging: false,
      columns: cols,
      onRow: false,
      // The dashboard sends only { branchId, countNumber }.
      async load(query, { signal }) {
        let r;
        try { r = await api("/reports/previous-count", { query: { branchId: query.branchId, countNumber: query.countNumber }, signal }); }
        catch (e) { if (e instanceof ApiFailure && e.status === 404) return { items: [], total: 0 }; throw e; }
        const [cat, item] = await Promise.all([nameOf("/categories", r.categoryId, "categoryName"), nameOf("/items", r.itemId, "itemName")]);
        return { items: r.rows, total: r.rows.length, totals: r.totals, meta: { ...r, cat, item } };
      },
      answerExtra: (a) => (a.meta
        ? `${m("previousCounts.countNumber")} ${code6(a.meta.countNumber)} · ${String(a.meta.countDate).slice(0, 10)} · ${m("previousCounts.category")}: ${a.meta.cat || m("previousCounts.allCategories")} · ${m("previousCounts.item")}: ${a.meta.item || m("previousCounts.anyItem")} · ${m("previousCounts.karat")}: ${a.meta.karat ? karatName(a.meta.karat) : m("previousCounts.anyKarat")}`
        : ""),
      footer: (_rows, a) => footerOf(cols, m("previousCounts.total"), Object.fromEntries(cols.slice(1).map((x) => [x.key, a.totals?.[x.key]])), tr),
    };
  };

  // ───── missing pieces (all closed counts) and of one previous count ─────
  const missing = (prev: boolean): ViewConfig => {
    const c = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: m(`missingPieces.columns.${key}`), type, get, ...extra });
    const cols: Column[] = [
      c("countNumber", undefined, (r) => code6(r.countNumber), { render: (r) => <Ltr>{code6(r.countNumber)}</Ltr> }), c("countDate", "date", (r) => r.countDate), c("branch", undefined, (r) => r.branchName),
      c("pieceCode", undefined, (r) => r.pieceCode, { render: (r) => <Ltr>{r.pieceCode}</Ltr> }), c("category", undefined, (r) => r.categoryName), c("item", undefined, (r) => r.itemName),
      c("karat", undefined, (r) => r.karat, { render: (r) => <Ltr>{r.karat}</Ltr> }), c("weight", "weight", (r) => r.weightMg),
    ];
    return {
      id: prev ? "missing-previous" : "missing",
      label: m(prev ? "titles.missing-pieces-previous" : "titles.missing-pieces"),
      keys: [prev ? "gold-stocktake/missing-pieces-previous" : "gold-stocktake/missing-pieces"],
      endpoint: prev ? "/reports/missing-pieces-previous" : "/reports/missing-pieces",
      rowKey: "_k",
      transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.branchId}|${r.countNumber}|${r.id}` })),   // a piece missing from two counts shows twice
      runLabel: rep("run"),
      filters: [
        countNo(m("missingPieces.countNumber"), prev), { name: "branchId", label: m("missingPieces.branchId"), type: "select", options: lists.branches, placeholder: ALL },
        { name: "karat", label: m("missingPieces.karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, karatName(k)]), placeholder: ALL },
        { name: "itemType", label: m("missingPieces.itemType"), type: "select", options: ["gold", "other_or_silver"].map((k) => [k, t("gold-accounts", `items.itemTypes.${k}`)]), placeholder: ALL },
        { name: "categoryId", label: m("missingPieces.categoryId"), type: "select", options: lists.categories, placeholder: ALL },
        { name: "itemId", label: m("missingPieces.itemId"), type: "select", options: lists.items, placeholder: ALL },
        from("missingPieces"), to("missingPieces"),
      ],
      sort: { default: { key: "countNumber", dir: "desc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      columns: cols,
      onRow: false,
      footer: (_rows, a) => footerOf(cols, rep("total"), { pieceCode: { node: m("missingPieces.pieces", { count: a.totals?.pieces ?? 0 }) }, weight: a.totals?.weightMg }, tr),
    };
  };

  // ───── the count (record sheet) ─────
  const chips = (codes: string[], red: boolean) => (codes.length === 0 ? "—" : (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{codes.slice(0, CHIPS_MAX).map((c) => <span key={c} dir="ltr" className={`st ${red ? "warn" : "off"}`}><i />{c}</span>)}</div>
      {codes.length > CHIPS_MAX && <div className="help">{L(`أول ${CHIPS_MAX} من ${codes.length} قطعة.`, `The first ${CHIPS_MAX} of ${codes.length} pieces.`)}</div>}
    </>
  ));
  const record: RecordConfig = {
    title: (r) => `${m("stockCount.recordNo")} ${code6(r.countNumber)}`,
    endpoint: (r) => `/stock-counts/${r.id}`,
    enrich: async (r) => {
      const [branchName, categoryName, itemName] = await Promise.all([nameOf("/branches", r.branchId, "branchName"), nameOf("/categories", r.categoryId, "categoryName"), nameOf("/items", r.itemId, "itemName")]);
      return { branchName, categoryName, itemName };
    },
    render: (r) => {
      const closed = r.status === "closed";
      return <>
        {r.deletedAt && <div className="note warn">{deletedBadge}</div>}
        <Section title={m("stockCount.recordNo")}>
          <Kv k={m("stockCount.countNumber")}><Ltr>{code6(r.countNumber)}</Ltr></Kv>
          <Kv k={`${m("stockCount.statusOpen")} / ${m("stockCount.statusClosed")}`}>{closed ? m("stockCount.statusClosed") : m("stockCount.statusOpen")}</Kv>
        </Section>
        <Section title={m("stockCount.details")}>
          <Kv k={m("stockCount.branch")}>{r.branchName ?? ""}</Kv><Kv k={m("stockCount.countDate")}><Ltr>{String(r.countDate).slice(0, 10)}</Ltr></Kv>
          <Kv k={m("stockCount.category")}>{r.categoryName || m("stockCount.allCategories")}</Kv><Kv k={m("stockCount.item")}>{r.itemName || m("stockCount.anyItem")}</Kv>
          <Kv k={m("stockCount.karat")}>{r.karat ? <Ltr>{karatName(r.karat)}</Ltr> : m("stockCount.anyKarat")}</Kv>
          <Kv k={m("stockCount.scanned")}><Ltr>{intText(r.scannedCount)}</Ltr></Kv>{closed && <Kv k={m("stockCount.missing")}><Ltr>{intText(r.missingCount)}</Ltr></Kv>}
        </Section>
        <Section title={m("stockCount.scannedCodes")}>{chips(r.scannedPieceCodes ?? [], false)}</Section>
        {closed && <Section title={m("stockCount.missingCodes")}>{chips(r.missingPieceCodes ?? [], true)}</Section>}
      </>;
    },
    // an open count is worked on its scan page
    actions: [{ id: "scan", label: m("stockCount.scanTitle"), when: (r) => r.status === "open" && !r.deletedAt, run: (r, h) => { h.close(); onScan(r.id); } }],
    // Delete: any non-deleted count, open or closed, no time window; soft delete, moves no stock
    remove: { path: (r) => `/stock-counts/${r.id}`, when: (r) => !r.deletedAt, confirm: (r) => ({ title: m("stockCount.deleteTitle", { code: code6(r.countNumber) }), text: m("stockCount.deleteBody") }) },
  };

  return {
    id: "count",
    title: m("stockCount.title"),
    unit: L("جرد", "count"),
    keys: ["gold-stocktake/stock-count", "gold-stocktake/previous-counts", "gold-stocktake/missing-pieces", "gold-stocktake/missing-pieces-previous"],
    views: [history, previous(), missing(false), missing(true)],
    record,
    forms: { start: { title: m("stockCount.add"), display: "page", fields: [], path: () => "/stock-counts", method: "POST", custom: (p: CustomFormProps) => <StartForm {...p} lists={lists} onStarted={(count) => onScan(count.id)} /> } },
  };
};

export default function Page() {
  const [scan, setScan] = useState<string | null>(null);   // the open count being worked on
  const qc = useQueryClient();
  const lists = useLists();
  const make = useMemo(() => makeConfigWith(setScan, lists), [lists]);
  const initial = useJobIntent();
  const access = useAccess();
  if (scan) return <ScanPage id={scan} onClose={() => { setScan(null); qc.invalidateQueries({ queryKey: ["thing", "count"] }); }} />;
  return <ThingPage make={make} access={access} initial={initial} />;
}
