"use client";
// المرتجعات: sales/returns (returns, returns-list, find-return). Ported from docs/nav-preview/app/things/sales-returns.js.
// The list takes only search, fromDate, toDate, deleted, page (20 a page). /find-return takes pieceCode, or branchId + returnNumber.
import { api, ApiFailure } from "@/lib/api";
import type { Column, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { latinNumber, piastresText } from "@/lib/format";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { ReturnForm } from "./sales-returns-form";
import { useAccess } from "./sales-access";
import { BankKvs, bankNamesOf } from "./payment-block";
import { makeConfig as makeReturnedPieces } from "./customer-pieces";

import { code6 as code6 } from "@/lib/code6";
const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };

const RETURNED_PIECES_KEYS = ["gold-accounts/purchase-coding"];

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-sales", `returns.${k}`, v);
  const si = (k: string) => t("gold-sales", `salesInvoices.${k}`);
  const fr = (k: string) => t("gold-sales", `findReturn.${k}`);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");

  // A return holds many pieces (owner, 2026-11-10): the list sends their codes, the one-return answers (record, find) send the lines.
  const codesOf = (r: Row): string[] => (r.pieceCodes ?? (r.lines ?? []).map((l: Row) => l.pieceCode)) as string[];
  const columns = (): Column[] => [
    { key: "returnNumber", label: m("returnNumber"), render: (r) => <><Ltr>{code6(r.returnNumber)}</Ltr>{r.deletedAt && <> <span className="st off"><i />{si("deletedBadge")}</span></>}</> },
    { key: "date", label: m("date"), type: "date" },
    { key: "pieceCode", label: m("pieceCode"), render: (r) => <Ltr>{codesOf(r).join("، ")}</Ltr> },
    { key: "refundTotal", label: m("refundTotal"), type: "money" },
  ];
  const history: ViewConfig = {
    id: "list", label: m("listTitle"), keys: ["gold-sales/returns-list"],
    endpoint: "/returns", rowKey: "id",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: ALL }, { id: "deleted", label: si("deletedOnly"), query: { deleted: "only" } }],
    filters: [{ name: "fromDate", label: si("fromDate"), type: "date" }, { name: "toDate", label: si("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) }],
    paging: { sizeParam: null, sizes: [20], size: 20 },
    serverSort: { on: true, columns: { date: "date", returnNumber: "returnNumber", refundTotal: "refundTotal" } },   // backend SALES_RETURN_SORT
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

  // The third tab: a customer's piece we did not sell (the Returned pieces screen), composed whole from its own config: its list, its record sheet, its form.
  // Only people holding the screen the backend gates it under (Purchase coding) see it. Its Add button replaces the page's Add return on that tab.
  const returnedPieces = makeReturnedPieces(tr);
  const piecesView: ViewConfig = {
    ...returnedPieces.views[0], id: "returned-pieces", label: t("nav", "item.returned-pieces"), keys: RETURNED_PIECES_KEYS,
    record: returnedPieces.record,
    create: (returnedPieces.create ?? []).map((c) => ({ ...c, form: "createReturnedPiece" })),
  };

  return {
    id: "returns",
    title: m("title"),
    unit: L("مرتجع", "return"),
    keys: ["gold-sales/returns", "gold-sales/returns-list", "gold-sales/find-return", ...RETURNED_PIECES_KEYS],
    views: [history, find, piecesView],
    create: [{ form: "create", label: m("add"), keys: ["gold-sales/returns"] }],
    forms: {
      create: { title: m("new"), display: "page", fields: [], path: () => "/returns", custom: ReturnForm },
      // Edit (issue #175): how the refund is paid; the piece, branch and date stay. The same form with the saved return.
      edit: { title: m("new"), display: "page", fields: [], path: (r) => `/returns/${r?.id}`, method: "PUT", custom: (p) => <ReturnForm {...p} /> },
      createReturnedPiece: returnedPieces.forms!.create,
    },
    record: {
      title: (r) => `${m("recordNo")} ${r.returnNumber === undefined ? "" : code6(r.returnNumber)}`,
      // The Edit button shows only when the server says this user may edit it now (not deleted, the day lock does not hold them).
      actions: [{ id: "edit", label: t("common", "edit"), icon: "edit", when: (r) => !!r.editable && !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } }],
      endpoint: (r) => `/returns/${r.id}`,
      enrich: async (r) => ({
        branchName: await api(`/branches/${r.branchId}`).then((b) => b.branchName).catch(() => ""),
        bankNames: await bankNamesOf(r.bankPayments),
      }),
      render: (r) => <>
        {r.deletedAt && <div className="note warn">{si("deletedBadge")}</div>}
        <Section title={m("details")}>
          <Kv k={m("returnNumber")}><Ltr>{code6(r.returnNumber)}</Ltr></Kv><Kv k={si("branch")}>{r.branchName ?? ""}</Kv>
          <Kv k={m("date")}><Ltr>{String(r.date).slice(0, 10)}</Ltr></Kv>
        </Section>
        <Section title={L("القطع المرتجعة", "Returned pieces")}>
          {codesOf(r).map((code, i) => <Kv key={code} k={`${m("pieceCode")} ${codesOf(r).length > 1 ? i + 1 : ""}`}><Ltr>{code}</Ltr>{r.lines?.[i] ? <> · <Ltr>{piastresText(r.lines[i].refundTotal)}</Ltr></> : null}</Kv>)}
        </Section>
        <Section title={m("refund")}>
          <Kv k={m("cashRefund")}><Ltr>{piastresText(r.cashRefund)}</Ltr></Kv>
          <BankKvs tr={tr} rows={r.bankPayments} names={r.bankNames} />
          <Kv k={m("refundTotal")}><Ltr>{piastresText(r.refundTotal)}</Ltr></Kv>
        </Section>
      </>,
      // Delete undoes the return; the backend refuses with returnSaleDeleted / returnPieceNotFree (409) and the engine shows that.
      remove: { when: (r) => !r.deletedAt, path: (r) => `/returns/${r.id}`, confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.returnNumber) }), text: m("deleteBody") }) },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
