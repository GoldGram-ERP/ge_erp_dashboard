"use client";
// المرتجعات: sales/returns (returns, returns-list, find-return). Ported from docs/nav-preview/app/things/sales-returns.js.
// The list takes only search, fromDate, toDate, deleted, page (20 a page). /find-return takes pieceCode, or branchId + returnNumber.
import { api, ApiFailure } from "@/lib/api";
import type { Column, MakeConfig, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { latinNumber, piastresText } from "@/lib/format";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { ReturnForm } from "./sales-returns-form";
import { useAccess } from "./sales-access";

const code6 = (n: unknown) => String(n).padStart(6, "0");
const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-sales", `returns.${k}`, v);
  const si = (k: string) => t("gold-sales", `salesInvoices.${k}`);
  const fr = (k: string) => t("gold-sales", `findReturn.${k}`);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");

  const columns = (): Column[] => [
    { key: "returnNumber", label: m("returnNumber"), render: (r) => <><Ltr>{code6(r.returnNumber)}</Ltr>{r.deletedAt && <> <span className="st off"><i />{si("deletedBadge")}</span></>}</> },
    { key: "date", label: m("date"), type: "date" },
    { key: "pieceCode", label: m("pieceCode"), render: (r) => <Ltr>{r.pieceCode}</Ltr> },
    { key: "refundTotal", label: m("refundTotal"), type: "money" },
  ];
  const history: ViewConfig = {
    id: "list", label: m("listTitle"), keys: ["gold-sales/returns-list"],
    endpoint: "/returns", rowKey: "id",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: ALL }, { id: "deleted", label: si("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
    filters: [{ name: "fromDate", label: si("fromDate"), type: "date" }, { name: "toDate", label: si("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) }],
    paging: { sizeParam: null, sizes: [20], size: 20 },
    columns: columns(),
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
  };
  // Find return: one return by the piece it took back, or by branch + return number. 404 = none.
  const find: ViewConfig = {
    id: "find", label: fr("title"), keys: ["gold-sales/find-return"], rowKey: "id", runLabel: rep("run"),
    filters: [
      { name: "pieceCode", label: fr("pieceCode"), type: "text", maxLength: 20, validate: (v, all) => (v || (all.branchId && all.returnNumber) ? null : fr("needCriteria")) },
      { name: "branchId", label: si("branch"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
      { name: "returnNumber", label: fr("returnNumber"), type: "number", min: 1, max: 9999999, toQuery: (v) => (v ? { returnNumber: v } : {}) },
    ],
    async load(query, { signal }) {
      const q = { pieceCode: query.pieceCode ? latinNumber(String(query.pieceCode)) : undefined, branchId: query.branchId, returnNumber: query.returnNumber };
      try { return { items: [await api("/find-return", { query: q, signal })], total: 1 }; }
      catch (e) { if (e instanceof ApiFailure && e.status === 404) return { items: [], total: 0 }; throw e; }
    },
    paging: false,
    columns: columns(),
  };

  return {
    id: "returns",
    title: m("title"),
    unit: L("مرتجع", "return"),
    keys: ["gold-sales/returns", "gold-sales/returns-list", "gold-sales/find-return"],
    views: [history, find],
    create: [{ form: "create", label: m("add"), keys: ["gold-sales/returns"] }],
    forms: { create: { title: m("new"), display: "page", fields: [], path: () => "/returns", custom: ReturnForm } },
    record: {
      title: (r) => `${m("recordNo")} ${r.returnNumber === undefined ? "" : code6(r.returnNumber)}`,
      endpoint: (r) => `/returns/${r.id}`,
      enrich: async (r) => ({
        branchName: await api(`/branches/${r.branchId}`).then((b) => b.branchName).catch(() => ""),
        bankName: r.bankAccountId ? await api(`/bank-accounts/${r.bankAccountId}`).then((a) => a.accountName).catch(() => "") : "",
      }),
      render: (r) => <>
        {r.deletedAt && <div className="note warn">{si("deletedBadge")}</div>}
        <Section title={m("details")}>
          <Kv k={m("returnNumber")}><Ltr>{code6(r.returnNumber)}</Ltr></Kv><Kv k={si("branch")}>{r.branchName ?? ""}</Kv>
          <Kv k={m("date")}><Ltr>{String(r.date).slice(0, 10)}</Ltr></Kv><Kv k={m("pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv>
        </Section>
        <Section title={m("refund")}>
          <Kv k={m("cashRefund")}><Ltr>{piastresText(r.cashRefund)}</Ltr></Kv>
          {r.bankAccountId && <><Kv k={si("bankAccount")}>{r.bankName ?? ""}</Kv><Kv k={si("bankAmount")}><Ltr>{piastresText(r.bankRefund)}</Ltr></Kv></>}
          <Kv k={m("refundTotal")}><Ltr>{piastresText(r.refundTotal)}</Ltr></Kv>
        </Section>
      </>,
      // Delete undoes the return; the backend refuses with returnSaleDeleted / returnPieceNotFree (409) and the engine shows that.
      remove: { when: (r) => !r.deletedAt, path: (r) => `/returns/${r.id}`, confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.returnNumber) }), text: m("deleteBody") }) },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
