"use client";
// القطع والأرصدة: sales/pieces (piece look-up = a piece's whole story, gold stock totals, gold stock pieces) + reprint label. Ported from docs/nav-preview/app/things/sales-pieces.js.
// /treasuries takes only branchId and answers { items } with no paging, so the gold treasuries are read once by the Page (useQuery) and handed to makeConfig.
// Reprint label is the one write: POST /reprint-label records one "reprint" activity row, nothing else.
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import { dateText } from "@/lib/format";
import type { Column, CustomFormProps, MakeConfig, Row, ThingConfig, ViewAction, ViewConfig } from "@/lib/engine-types";
import { esc, milligramsText } from "@/lib/format";
import { canOpen } from "@/nav/tree";
import { useMe } from "@/lib/session";
import { Td } from "@/components/ui";
import { useT, type Tr } from "@/lib/t";
import { useRouter } from "@/i18n/navigation";
import { ThingPage, cellNode } from "@/components/engine";
import { ReprintForm } from "./sales-reprint-form";
import { code6, readPieceCode } from "./sales-form-parts";
import { PieceStory } from "./sales-piece-story";
import { PieceScanner } from "./piece-scanner";
import { downloadExcel, printReport, type PrintTable } from "./report-export";

type Treasury = { id: string; kind: string; treasuryName: string; branchName?: string };
// The gold treasuries only (an EGP treasury is never a choice in Gold stock), named as the dashboard names them.
const treasuryText = (x: Treasury) => (!x.branchName ? x.treasuryName : x.treasuryName.includes(x.branchName) ? x.branchName : `${x.treasuryName} · ${x.branchName}`);
// Whole milligrams as the grams the backend reads: 2500 is "2.500".
const gramsQuery = (mg: number) => `${Math.floor(mg / 1000)}.${String(mg % 1000).padStart(3, "0")}`;

export const makeConfigWith = (treasuries: Treasury[], scan?: () => void): MakeConfig => (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const lk = (k: string) => t("gold-sales", `pieceLookUp.${k}`);
  const gs = (k: string) => t("gold-sales", `goldStock.${k}`);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };
  const categorySpec = { path: "/categories", value: "id", label: "categoryName", query: { pageSize: undefined } };
  const itemSpec = { path: "/items", value: "id", label: "itemName", query: { pageSize: undefined } };

  // One code, one piece: its whole story (where it is, how it was coded, every sale, return and transfer), or a customer's own piece (no price). 404 = none.
  // The story is one cell of one row: read only, inline, no record sheet, nothing here carries the piece to an invoice.
  const lookupView: ViewConfig = {
    id: "lookup", label: lk("title"), keys: ["gold-sales/piece-lookup"], rowKey: "_k", runLabel: t("common", "search"),
    filters: [{
      name: "pieceCode", label: lk("pieceCode"), type: "text", maxLength: 20, required: true,
      validate: (v) => (v ? readPieceCode(tr, v).error ?? null : null),
      toQuery: (v) => ({ pieceCode: readPieceCode(tr, v).code ?? String(v ?? "").trim() }),
    }],
    async load(query, { signal }) {
      try {
        const r = await api("/piece-look-up", { query: { pieceCode: query.pieceCode }, signal });
        return { items: [{ ...r, _k: r.pieceCode }], total: 1 };
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 404) return { items: [], total: 0 };
        throw e;                  // 409 = no gold price saved yet: the backend's own words show
      }
    },
    paging: false, onRow: false,
    actions: scan ? [{ label: lk("scanWithCamera"), icon: "search", keys: ["gold-sales/piece-lookup"], run: scan }] : [],
    columns: [{ key: "story", label: lk("title"), render: (r) => <PieceStory r={r} /> }],
  };

  // Gold stock: two views, the same filters.
  const stockFilters = (): ViewConfig["filters"] => [
    { name: "branchId", label: gs("branchId"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
    { name: "treasuryId", label: gs("treasuryId"), type: "select", options: treasuries.map((x) => [x.id, treasuryText(x)]), placeholder: ALL },
    { name: "karat", label: gs("karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, k]), placeholder: ALL },
    { name: "itemType", label: gs("itemType"), type: "select", options: ["gold", "other_or_silver"].map((k) => [k, t("gold-accounts", `items.itemTypes.${k}`)]), placeholder: ALL },
    { name: "categoryId", label: gs("categoryId"), type: "select", optionsFrom: categorySpec, placeholder: ALL },
    { name: "itemId", label: gs("itemId"), type: "select", picker: "item", optionsFrom: itemSpec, placeholder: ALL },
    { name: "untilDate", label: gs("untilDate"), type: "date", placeholder: gs("today") },
    { name: "fromWeight", label: gs("fromWeight"), type: "weight", toQuery: (v) => (v === "" || v === undefined ? {} : { fromWeight: gramsQuery(v) }) },
    { name: "toWeight", label: gs("toWeight"), type: "weight", toQuery: (v) => (v === "" || v === undefined ? {} : { toWeight: gramsQuery(v) }),
      validate: (v, all) => (v !== "" && v !== undefined && all.fromWeight !== "" && all.fromWeight !== undefined && v < all.fromWeight ? gs("toWeightBelowFrom") : null) },
  ];
  const totalOf = (cols: Column[]) => (_rows: Row[], answer: any) => {
    const tot = answer?.totals;
    if (!tot) return null;
    const vals: Record<string, unknown> = { count: tot.count, weight: tot.weightMg };
    return cols.map((c, i) => <Td key={c.key} num={["money", "weight", "int"].includes(c.type ?? "")}>{i === 0 ? rep("total") : vals[c.key] === undefined ? "" : cellNode({ key: "v", type: c.type }, { v: vals[c.key] }, tr)}</Td>);
  };
  const c = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: gs(`columns.${key}`), type, get, ...extra });
  const totalsCols = [c("branch", undefined, (r) => r.branchName), c("karat", undefined, (r) => r.karat), c("count", "int", (r) => r.count), c("weight", "weight", (r) => r.weightMg)];
  const piecesCols = [
    c("invoiceNumber", undefined, (r) => code6(r.invoiceNumber)), c("purchaseDate", "date", (r) => r.purchaseDate), c("pieceCode", undefined, (r) => r.pieceCode),
    c("item", undefined, (r) => r.itemName), c("count", "int", (r) => r.count, { sortable: false }), c("karat", undefined, (r) => r.karat), c("weight", "weight", (r) => r.weightMg),
  ];
  // Print and Excel take every row of the result through the export queue; the print shows the filters it was asked with.
  const named = async (path: string, id: unknown, key: string) => (id ? api(`${path}/${id}`).then((r) => r?.[key] as string).catch(() => String(id)) : undefined);
  const printTable = async (data: any, query: Record<string, any>, pieces: boolean): Promise<PrintTable> => {
    const [branch, category, item] = await Promise.all([named("/branches", query.branchId, "branchName"), named("/categories", query.categoryId, "categoryName"), named("/items", query.itemId, "itemName")]);
    const treasury = treasuries.find((x) => x.id === query.treasuryId);
    const line = (k: string, v: unknown): [string, string][] => (v ? [[gs(k), esc(v)]] : []);
    const cols = pieces ? piecesCols : totalsCols;
    return {
      title: pieces ? `${gs("title")} · ${gs("views.pieces")}` : gs("title"),
      filters: [[gs("branchId"), esc(branch ?? ALL)], [gs("untilDate"), esc(query.untilDate ? dateText(query.untilDate) : gs("today"))],
        ...line("treasuryId", treasury && treasuryText(treasury)), ...line("karat", query.karat), ...line("itemType", query.itemType && t("gold-accounts", `items.itemTypes.${query.itemType}`)),
        ...line("categoryId", category), ...line("itemId", item), ...line("fromWeight", query.fromWeight), ...line("toWeight", query.toWeight)],
      heads: cols.map((c) => ({ label: c.label, end: ["int", "weight"].includes(c.type ?? "") })),
      rows: (data.items as Row[]).map((r) => cols.map((c) => esc(c.type === "weight" ? milligramsText(c.get!(r)) : c.type === "date" ? dateText(c.get!(r)) : c.get!(r)))),
      foot: cols.map((c, i) => (i === 0 ? esc(rep("total")) : c.key === "count" ? esc(data.totals.count) : c.key === "weight" ? esc(milligramsText(data.totals.weightMg)) : "")),
    };
  };
  const stockActions = (pieces: boolean): ViewAction[] => [
    { label: rep("excel"), icon: "download", keys: ["gold-sales/gold-stock"], run: ({ query }) => downloadExcel("/reports/gold-stock", query, tr) },
    { label: t("common", "print"), icon: "print", keys: ["gold-sales/gold-stock"], run: ({ query }) => printReport("/reports/gold-stock", query, tr, (d) => printTable(d, query, pieces)) },
  ];
  const stockTotalsView: ViewConfig = {
    id: "totals", label: `${gs("title")} · ${gs("views.totals")}`, keys: ["gold-sales/gold-stock"],
    endpoint: "/reports/gold-stock", query: { view: "totals" }, rowKey: "_k",
    transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.branchId}|${r.karat}` })),
    runLabel: rep("run"), filters: stockFilters(),
    sort: { default: { key: "branch", dir: "asc" } }, paging: { sizes: [10, 25, 50, 100], size: 25 },
    // A branch and karat row opens exactly its pieces: the pieces view with the same filters, narrowed to that branch and karat.
    columns: totalsCols, onRow: (row, h) => ({ view: "pieces", filters: { ...h.filters, branchId: row.branchId, karat: row.karat } }), footer: totalOf(totalsCols), actions: stockActions(false),
  };
  const stockPiecesView: ViewConfig = {
    id: "pieces", label: `${gs("title")} · ${gs("views.pieces")}`, keys: ["gold-sales/gold-stock"],
    endpoint: "/reports/gold-stock", query: { view: "pieces" }, rowKey: "pieceCode",
    runLabel: rep("run"), filters: stockFilters(),
    sort: { default: { key: "purchaseDate", dir: "desc" } }, paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: piecesCols, footer: totalOf(piecesCols), actions: stockActions(true),
    onRow: (row) => ({ view: "lookup", filters: { pieceCode: row.pieceCode } }),     // a piece opens in the look-up
  };

  return {
    id: "pieces",
    title: L("القطع والأرصدة", "Pieces and balances"),
    unit: L("سجل", "rows"),
    keys: ["gold-sales/piece-lookup", "gold-sales/reprint-label", "gold-sales/gold-stock"],
    views: [lookupView, stockTotalsView, stockPiecesView],
    create: [{ form: "reprint", label: t("gold-sales", "reprintLabel.title"), keys: ["gold-sales/reprint-label"] }],
    forms: { reprint: { title: t("gold-sales", "reprintLabel.title"), display: "page", path: () => "/reprint-label", fields: [], custom: (p: CustomFormProps) => <ReprintForm {...p} /> } },
  };
};
export const makeConfig: MakeConfig = makeConfigWith([]);

export default function Page() {
  const tr = useT();
  const { data: me } = useMe();
  const sp = useSearchParams();
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const gold = useQuery({ queryKey: ["gold-treasuries"], staleTime: 5 * 60_000, queryFn: () => api("/treasuries").then((r) => ((r?.items ?? []) as Treasury[]).filter((x) => x.kind === "gold")).catch(() => [] as Treasury[]) });
  const make = useCallback<MakeConfig>((tr) => makeConfigWith(gold.data ?? [], () => setScanning(true))(tr), [gold.data]);
  const access = { canOpen: (keys?: string[]) => !keys || canOpen(me, keys), isSuper: me?.userType === "super_admin" };
  const code = sp.get("pieceCode");
  return (
    <>
      <ThingPage make={make} access={access} initial={code ? { view: "lookup", query: { pieceCode: code } } : undefined} />
      {/* a code read closes the camera and looks the piece up through the address, as a deep link does */}
      {scanning && <PieceScanner label={tr.t("gold-sales", "pieceLookUp.pieceCode")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); router.replace(`/sales/pieces?view=lookup&pieceCode=${encodeURIComponent(c)}`); }} />}
    </>
  );
}
