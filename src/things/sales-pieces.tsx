"use client";
// القطع والأرصدة: sales/pieces (piece look-up, gold stock totals, gold stock pieces) + reprint label. Ported from docs/nav-preview/app/things/sales-pieces.js.
// /treasuries takes only branchId and answers { items } with no paging, so the gold treasuries are read once by the Page (useQuery) and handed to makeConfig.
// Reprint label is the one write: POST /reprint-label records one "reprint" activity row, nothing else.
import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import type { Column, CustomFormProps, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { intText, latinNumber, milligramsText, piastresText } from "@/lib/format";
import { canOpen } from "@/nav/tree";
import { useMe } from "@/lib/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage, cellNode } from "@/components/engine";
import { ReprintForm } from "./sales-reprint-form";
import { code6 } from "./sales-form-parts";

type Treasury = { id: string; kind: string; treasuryName: string; branchName?: string };
// The gold treasuries only (an EGP treasury is never a choice in Gold stock), named as the dashboard names them.
const treasuryText = (x: Treasury) => (!x.branchName ? x.treasuryName : x.treasuryName.includes(x.branchName) ? x.branchName : `${x.treasuryName} · ${x.branchName}`);
// Whole milligrams as the grams the backend reads: 2500 is "2.500".
const gramsQuery = (mg: number) => `${Math.floor(mg / 1000)}.${String(mg % 1000).padStart(3, "0")}`;
const stateOf = (r: Row) => (r.kind === "customerPiece" ? "customer" : r.sold ? "sold" : r.inTransit ? "transit" : "stock");
// The dashboard's livePrice; an older backend still answers priceAfterDiscount / priceBeforeDiscount.
const livePrice = (r: Row) => (r.kind === "customerPiece" ? undefined : r.livePrice ?? r.priceAfterDiscount ?? r.priceBeforeDiscount);

export const makeConfigWith = (treasuries: Treasury[]): MakeConfig => (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const lk = (k: string) => t("gold-sales", `pieceLookUp.${k}`);
  const gs = (k: string) => t("gold-sales", `goldStock.${k}`);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };
  const categorySpec = { path: "/categories", value: "id", label: "categoryName", query: { pageSize: undefined } };
  const itemSpec = { path: "/items", value: "id", label: "itemName", query: { pageSize: undefined } };

  // One code, one piece: the stock piece with its price today, or a customer's own piece (no price). 404 = none.
  const lookupView: ViewConfig = {
    id: "lookup", label: lk("title"), keys: ["gold-sales/piece-lookup"], rowKey: "_k", runLabel: t("common", "search"),
    filters: [{
      name: "pieceCode", label: lk("pieceCode"), type: "text", maxLength: 20, required: true,
      validate: (v) => (v && !/^[A-Za-z0-9 .]{1,20}$/.test(latinNumber(v)) ? lk("notOurCode") : null),
      toQuery: (v) => ({ pieceCode: latinNumber(String(v ?? "").trim()) }),
    }],
    async load(query, { signal }) {
      try {
        const r = await api("/piece-look-up", { query: { pieceCode: query.pieceCode }, signal });
        return { items: [{ ...r, _k: r.pieceCode }], total: 1 };
      } catch (e) {
        if (e instanceof ApiFailure && e.status === 404) return { items: [], total: 0 };
        throw e;                  // 409 = no gold price yet: the backend's own words show
      }
    },
    paging: false,
    columns: [
      { key: "pieceCode", label: lk("pieceCode"), render: (r) => <Ltr>{r.pieceCode}</Ltr> },
      { key: "itemName", label: lk("description"), get: (r) => r.itemName ?? r.description },
      { key: "karat", label: lk("karat") },
      { key: "weight", label: lk("weight"), type: "weight" },
      { key: "status", label: L("الحالة", "Status"), type: "status", get: stateOf, statuses: {
        customer: [L("قطعة عميل", "Customer piece"), "info"], sold: [L("مباعة", "Sold"), "off"], transit: [L("في الطريق", "In transit"), "warn"], stock: [L("في المخزون", "In stock"), "good"] } },
      { key: "treasury", label: gs("treasuryId"), get: (r) => r.treasury?.treasuryName ?? "" },
      { key: "livePrice", label: lk("livePrice"), type: "money", get: livePrice },
    ],
  };

  const money = (v: unknown) => (v === null || v === undefined ? "" : <Ltr>{piastresText(v)}</Ltr>);
  const grams = (v: unknown) => (v === null || v === undefined ? "" : <Ltr>{milligramsText(v)}</Ltr>);
  const renderPiece = (r: Row) => {
    if (r.kind === "customerPiece") {
      return (
        <>
          <div className="note">{lk("notStock")}</div>
          <Section title={lk("customerPieceTitle")}>
            <Kv k={lk("pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv><Kv k={lk("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={lk("weight")}>{grams(r.weight)}</Kv><Kv k={lk("description")}>{r.description ?? ""}</Kv>
          </Section>
        </>
      );
    }
    const where = r.inTransit ? <>{L("في الطريق · تحويل", "In transit · transfer")} <Ltr>{code6(r.inTransit.documentNumber)}</Ltr></> : (r.treasury?.treasuryName ?? "");
    return (
      <>
        <Section title={lk("piece")}>
          <Kv k={lk("pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv><Kv k={lk("description")}>{r.itemName ?? ""}</Kv>
          <Kv k={L("الحالة", "Status")}>{r.sold ? L("مباعة", "Sold") : r.inTransit ? L("في الطريق", "In transit") : L("في المخزون", "In stock")}</Kv><Kv k={gs("treasuryId")}>{where}</Kv>
        </Section>
        <Section title={lk("goldPrice")}>
          <Kv k={lk("priceKarat")}><Ltr>{r.priceKarat}</Ltr></Kv><Kv k={lk("priceDate")}><Ltr>{String(r.priceDate).slice(0, 10)}</Ltr></Kv><Kv k={lk("goldPrice21k")}>{money(r.goldPrice21k)}</Kv>
        </Section>
        <Section title={lk("breakdown")}>
          <Kv k={lk("karat")}><Ltr>{r.karat}</Ltr></Kv><Kv k={lk("weight")}>{grams(r.weight)}</Kv><Kv k={lk("weight24")}>{grams(r.weight24Mg)}</Kv><Kv k={lk("pricePerGram24")}>{money(r.pricePerGram24)}</Kv>
          <Kv k={lk("goldValue")}>{money(r.goldValue)}</Kv><Kv k={lk("makingChargePerGram")}>{money(r.makingChargePerGram)}</Kv><Kv k={lk("makingCharge")}>{money(r.makingCharge)}</Kv>
        </Section>
        <Section title={lk("price")}><Kv k={lk("livePrice")}>{money(livePrice(r))}</Kv></Section>
      </>
    );
  };

  // Gold stock: two views, the same filters.
  const stockFilters = (): ViewConfig["filters"] => [
    { name: "branchId", label: gs("branchId"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
    { name: "treasuryId", label: gs("treasuryId"), type: "select", options: treasuries.map((x) => [x.id, treasuryText(x)]), placeholder: ALL },
    { name: "karat", label: gs("karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, k]), placeholder: ALL },
    { name: "itemType", label: gs("itemType"), type: "select", options: ["gold", "other_or_silver"].map((k) => [k, t("gold-accounts", `items.itemTypes.${k}`)]), placeholder: ALL },
    { name: "categoryId", label: gs("categoryId"), type: "select", optionsFrom: categorySpec, placeholder: ALL },
    { name: "itemId", label: gs("itemId"), type: "select", optionsFrom: itemSpec, placeholder: ALL },
    { name: "untilDate", label: gs("untilDate"), type: "date", placeholder: gs("today") },
    { name: "fromWeight", label: gs("fromWeight"), type: "weight", toQuery: (v) => (v === "" || v === undefined ? {} : { fromWeight: gramsQuery(v) }) },
    { name: "toWeight", label: gs("toWeight"), type: "weight", toQuery: (v) => (v === "" || v === undefined ? {} : { toWeight: gramsQuery(v) }),
      validate: (v, all) => (v !== "" && v !== undefined && all.fromWeight !== "" && all.fromWeight !== undefined && v < all.fromWeight ? gs("toWeightBelowFrom") : null) },
  ];
  const totalOf = (cols: Column[]) => (_rows: Row[], answer: any) => {
    const tot = answer?.totals;
    if (!tot) return null;
    const vals: Record<string, unknown> = { count: tot.count, weight: tot.weightMg };
    return cols.map((c, i) => <td key={c.key} className={["money", "weight", "int"].includes(c.type ?? "") ? "num" : ""}>{i === 0 ? rep("total") : vals[c.key] === undefined ? "" : cellNode({ key: "v", type: c.type }, { v: vals[c.key] }, tr)}</td>);
  };
  const c = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: gs(`columns.${key}`), type, get, ...extra });
  const totalsCols = [c("branch", undefined, (r) => r.branchName), c("karat", undefined, (r) => r.karat), c("count", "int", (r) => r.count), c("weight", "weight", (r) => r.weightMg)];
  const piecesCols = [
    c("invoiceNumber", undefined, (r) => code6(r.invoiceNumber)), c("purchaseDate", "date", (r) => r.purchaseDate), c("pieceCode", undefined, (r) => r.pieceCode),
    c("item", undefined, (r) => r.itemName), c("count", "int", (r) => r.count, { sortable: false }), c("karat", undefined, (r) => r.karat), c("weight", "weight", (r) => r.weightMg),
  ];
  const stockTotalsView: ViewConfig = {
    id: "stock-totals", label: `${gs("title")} · ${gs("views.totals")}`, keys: ["gold-sales/gold-stock"],
    endpoint: "/reports/gold-stock", query: { view: "totals" }, rowKey: "_k",
    transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.branchId}|${r.karat}` })),
    runLabel: rep("run"), filters: stockFilters(),
    sort: { default: { key: "branch", dir: "asc" } }, paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: totalsCols, onRow: false, footer: totalOf(totalsCols),
  };
  const stockPiecesView: ViewConfig = {
    id: "stock-pieces", label: `${gs("title")} · ${gs("views.pieces")}`, keys: ["gold-sales/gold-stock"],
    endpoint: "/reports/gold-stock", query: { view: "pieces" }, rowKey: "pieceCode",
    runLabel: rep("run"), filters: stockFilters(),
    sort: { default: { key: "purchaseDate", dir: "desc" } }, paging: { sizes: [10, 25, 50, 100], size: 25 },
    columns: piecesCols, footer: totalOf(piecesCols),
    // A piece opens in the look-up.
    onRow: (row) => window.location.assign(`/${tr.locale}/sales/pieces?view=lookup&pieceCode=${encodeURIComponent(row.pieceCode)}`),
  };

  return {
    id: "pieces",
    title: L("القطع والأرصدة", "Pieces and balances"),
    unit: L("سجل", "rows"),
    keys: ["gold-sales/piece-lookup", "gold-sales/reprint-label", "gold-sales/gold-stock"],
    views: [lookupView, stockTotalsView, stockPiecesView].map((v) => (v.onRow === undefined ? { ...v, onRow: (row: Row, h: { open: (r: Row) => void }) => h.open(row) } : v)),
    create: [{ form: "reprint", label: t("gold-sales", "reprintLabel.title"), keys: ["gold-sales/reprint-label"] }],
    forms: { reprint: { title: t("gold-sales", "reprintLabel.title"), display: "page", path: () => "/reprint-label", fields: [], custom: (p: CustomFormProps) => <ReprintForm {...p} /> } },
    record: { title: (r) => `${lk("piece")} ${r.pieceCode}`, render: renderPiece, actions: [] },
  };
};
export const makeConfig: MakeConfig = makeConfigWith([]);

export default function Page() {
  const { data: me } = useMe();
  const sp = useSearchParams();
  const gold = useQuery({ queryKey: ["gold-treasuries"], staleTime: 5 * 60_000, queryFn: () => api("/treasuries").then((r) => ((r?.items ?? []) as Treasury[]).filter((x) => x.kind === "gold")).catch(() => [] as Treasury[]) });
  const make = useCallback<MakeConfig>((tr) => makeConfigWith(gold.data ?? [])(tr), [gold.data]);
  const access = { canOpen: (keys?: string[]) => !keys || canOpen(me, keys), isSuper: me?.userType === "super_admin" };
  const code = sp.get("pieceCode");
  return <ThingPage make={make} access={access} initial={code ? { view: "lookup", query: { pieceCode: code } } : undefined} />;
}
