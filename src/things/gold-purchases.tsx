"use client";
import { DataTable, Td, Tr } from "@/components/ui";
// المشتريات: purchase-invoices (+ list), purchase-coding, pieces-list. ONE page, three tabs: purchase invoices (history; "new" and edit are a full page),
// pieces (GET /pieces), purchase coding (find an invoice by number, code its lines). Port of docs/nav-preview/app/things/gold-purchases.js.
// Decisions (specs/gold-accounts.json): the list takes no branch filter and no `order`; delete is offered on every live invoice and the backend refuses with
// invoiceCoded / editWindowClosed / notYourInvoice; edit only while the backend says canEdit. Piece prices: weight and making charge only.
// Job bar: `new=create` opens the invoice form, `open=<id>` an invoice, a carried invoiceNumber opens the coding tab (`view=pieces` the piece list).
import { api, ApiFailure } from "@/lib/api";
import type { Column, CustomFormProps, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { dateTimeText, dateText, milligramsText, piastresText } from "@/lib/format";
import { Kv, Ltr, Section, ThingPage } from "@/components/engine";
import { InvoiceForm } from "./gold-purchases-invoice";
import { CodingForm } from "./gold-purchases-coding";
import { LabelsCard } from "./purchases-labels";
import { useJobIntent } from "./job-intent";
import { useAccess } from "./sales-access";

// A returned customer piece has no purchase invoice (invoiceNumber null since #167): show a dash, never "00null".
import { code6 as pad } from "@/lib/code6";
const code6 = (n: unknown) => pad(n, "—");
const isPiece = (r: Row) => r.pieceCode !== undefined;

// The invoice a typed number names: the backend searches the user's branch, newest first; the first exact match.
async function findInvoice(number: number, signal?: AbortSignal): Promise<Row | undefined> {
  const found = await api("/purchase-invoices", { query: { search: String(number) }, signal });
  return ((found.items ?? []) as Row[]).find((i) => i.invoiceNumber === number);
}

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-accounts", k, v);
  const c = (k: string) => t("common", k);
  const statusCol = (): Column => ({ key: "deletedAt", label: c("recordStatus"), type: "status", get: (r) => (r.deletedAt ? "deleted" : "active"), statuses: { active: [c("active"), "good"], deleted: [m("purchaseInvoices.deletedBadge"), "off"] } });
  const chips = (ns: string) => [{ id: "all", label: c("report.all") }, { id: "deleted", label: m(`${ns}.deletedOnly`), query: { deleted: "only" }, superOnly: true }];   // backend: Super admin only
  const itemCell = (r: Row) => <>{r.itemName} <span className="sub" dir="ltr">{code6(r.itemCode)}</span></>;
  const goPieces = (n: unknown) => window.location.assign(`/${tr.locale}/buy/purchases?view=pieces&invoiceNumber=${n}`);

  const invoiceRecord = (r: Row) => (
    <>
      {r.deletedAt ? <div className="note warn">{m("purchaseInvoices.deletedBadge")} · {dateTimeText(r.deletedAt)}</div> : !r.canEdit ? <div className="note">{m("purchaseInvoices.cannotEdit")}</div> : null}
      <Section title={m("purchaseInvoices.details")}>
        <Kv k={m("purchaseInvoices.invoiceNumber")}><Ltr>{code6(r.invoiceNumber)}</Ltr></Kv><Kv k={m("purchaseInvoices.branch")}>{r.branchName ?? ""}</Kv>
        <Kv k={m("purchaseInvoices.date")}><Ltr>{dateText(r.date)}</Ltr></Kv><Kv k={L("تاريخ الإضافة", "Created")}><Ltr>{dateTimeText(r.createdAt)}</Ltr></Kv>
      </Section>
      <Section title={m("purchaseInvoices.lines")} wide>
        <DataTable head={[{ label: m("purchaseInvoices.lineHeading"), num: true }, m("purchaseInvoices.item"), { label: m("purchaseInvoices.quantity"), num: true }, { label: m("purchaseInvoices.weight"), num: true }, m("purchaseCoding.title")]}>
          {((r.lines ?? []) as Row[]).map((l) => (
            <Tr key={l.lineNumber}><Td num>{l.lineNumber}</Td><Td>{itemCell(l)}</Td><Td num>{l.quantity}</Td><Td num>{milligramsText(l.weight)}</Td><Td>{l.coded ? L("مكوّد", "Coded") : L("بانتظار التكويد", "Waiting")}</Td></Tr>))}
        </DataTable>
      </Section>
      <Section title={m("purchaseInvoices.totals")}>
        <Kv k={m("purchaseInvoices.totalQuantity")}><Ltr>{r.totals?.totalQuantity}</Ltr></Kv><Kv k={m("purchaseInvoices.totalWeight")}><Ltr>{milligramsText(r.totals?.totalWeight)}</Ltr></Kv>
      </Section>
    </>
  );   // the totals are the backend's own
  const pieceRecord = (r: Row) => (
    <>
      {r.deletedAt ? <div className="note warn">{m("purchaseCoding.deletedBadge")} · {dateTimeText(r.deletedAt)}</div> : null}
      <Section title={m("purchaseCoding.pieceNo")}>
        <Kv k={m("purchaseCoding.pieceCode")}><Ltr>{r.pieceCode}</Ltr></Kv><Kv k={m("purchaseCoding.item")}>{r.itemName}</Kv><Kv k={m("purchaseCoding.itemCode")}><Ltr>{code6(r.itemCode)}</Ltr></Kv><Kv k={m("purchaseCoding.karat")}><Ltr>{r.karat}</Ltr></Kv>
        <Kv k={m("purchaseCoding.weight")}><Ltr>{milligramsText(r.weight)}</Ltr></Kv><Kv k={m("purchaseCoding.makingChargePerGram")}><Ltr>{r.makingChargePerGram == null ? "" : piastresText(r.makingChargePerGram)}</Ltr></Kv>
        <Kv k={m("purchaseCoding.weight21")}><Ltr>{r.weight21 == null ? "" : milligramsText(r.weight21)}</Ltr></Kv><Kv k={m("purchaseCoding.totalWage")}><Ltr>{r.totalWage == null ? "" : piastresText(r.totalWage)}</Ltr></Kv>
        <Kv k={m("purchaseCoding.invoiceNumber")}><Ltr>{code6(r.invoiceNumber)}</Ltr></Kv>
      </Section>
      {r.label && <div id="rec-label" style={{ marginTop: 14 }}><LabelsCard tr={tr} title={m("purchaseCoding.pieceLabel")} labels={[r.label]} /></div>}
    </>
  );

  const invoicesView: ViewConfig = {
    id: "invoices", label: m("purchaseInvoices.title"), keys: ["gold-accounts/purchase-invoices", "gold-accounts/purchase-invoices-list"],
    endpoint: "/purchase-invoices",
    transform: (rows) => rows.map((r) => ({ ...r, totalQuantity: r.totals.totalQuantity, totalWeight: r.totals.totalWeight })),
    search: { param: "search", placeholder: m("purchaseInvoices.searchPlaceholder") },
    filters: [
      { name: "fromDate", label: m("purchaseInvoices.fromDate"), type: "date" },
      { name: "toDate", label: m("purchaseInvoices.toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? t("common", "report.toBeforeFrom") : null) },
    ],
    chips: chips("purchaseInvoices"),
    paging: { sizeParam: null },   // `page` only: a page is 20 rows, fixed by the backend
    sum: { key: "totalWeight", label: m("purchaseInvoices.totalWeight"), type: "weight" },
    columns: [
      { key: "invoiceNumber", label: m("purchaseInvoices.invoiceNumber"), get: (r) => code6(r.invoiceNumber) },
      { key: "date", label: m("purchaseInvoices.date"), type: "date" },
      { key: "lineCount", label: m("purchaseInvoices.lines"), type: "int" },
      { key: "totalQuantity", label: m("purchaseInvoices.quantity"), type: "int" },
      { key: "totalWeight", label: m("purchaseInvoices.weight"), type: "weight" },
      statusCol(),
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
  };
  const piecesView: ViewConfig = {
    id: "pieces", label: m("purchaseCoding.pieceListTitle"), keys: ["gold-accounts/pieces-list"],
    // ?invoiceNumber=12 (from the coding tab or an invoice) keeps one invoice's pieces: the number is turned into the invoice id the API takes
    load: async (query, { signal }) => {
      const { _invoiceNumber: n, ...q } = query;
      if (n) { const inv = await findInvoice(Number(n), signal); if (!inv) return { items: [], total: 0 }; q.invoiceId = inv.id; }
      return api("/pieces", { query: q, signal });
    },
    search: { param: "search", placeholder: m("purchaseCoding.searchPlaceholder") },
    filters: [{ name: "invoiceNumber", label: m("purchaseCoding.invoiceNo"), type: "number", positive: true, toQuery: (v) => (v ? { _invoiceNumber: v } : {}) }],
    chips: chips("purchaseCoding"),
    paging: { sizeParam: null },
    columns: [
      { key: "pieceCode", label: m("purchaseCoding.pieceCode") },
      { key: "itemName", label: m("purchaseCoding.item"), render: itemCell },
      { key: "karat", label: m("purchaseCoding.karat") },
      { key: "weight", label: m("purchaseCoding.weight"), type: "weight" },
      { key: "invoiceNumber", label: m("purchaseCoding.invoiceNumber"), get: (r) => code6(r.invoiceNumber) },
      statusCol(),
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
  };
  const codingView: ViewConfig = {
    id: "coding", label: m("purchaseCoding.title"), keys: ["gold-accounts/purchase-coding"],
    runLabel: m("purchaseCoding.openLines"),
    filters: [{ name: "invoiceNumber", label: m("purchaseCoding.invoiceNumber"), type: "number", required: true, positive: true }],
    paging: false, rowKey: "lineId",
    load: async (q, { signal }) => {
      const inv = await findInvoice(Number(q.invoiceNumber), signal);
      if (!inv) throw new ApiFailure(404, { message: "purchaseInvoiceNotFound" });
      const coding = await api(`/purchase-coding/invoices/${inv.id}`, { signal });
      return { items: (coding.lines as Row[]).map((l) => ({ ...l, invoiceId: coding.id, invoiceNumber: coding.invoiceNumber, pieceCount: l.pieces.length })), total: coding.lines.length };
    },
    sum: { key: "weight", label: m("purchaseCoding.lineWeight"), type: "weight" },
    columns: [
      { key: "lineNumber", label: m("purchaseInvoices.lineHeading"), type: "int" },
      { key: "itemName", label: m("purchaseInvoices.item"), render: itemCell },
      { key: "karat", label: m("purchaseCoding.karat") },
      { key: "quantity", label: m("purchaseInvoices.quantity"), type: "int" },
      { key: "weight", label: m("purchaseInvoices.weight"), type: "weight" },
      { key: "coded", label: m("purchaseCoding.title"), type: "status", get: (r) => (r.coded ? "coded" : "open"), statuses: { coded: [L("مكوّد", "Coded"), "good"], open: [L("بانتظار التكويد", "Waiting"), "warn"] } },
      { key: "pieceCount", label: m("purchaseCoding.pieceListTitle"), type: "int" },
    ],
    onRow: (row, h) => h.openForm("code", { invoiceId: row.invoiceId }),   // the whole invoice is coded on its own page
  };

  return {
    id: "purchases",
    title: L("المشتريات", "Purchases"),
    unit: L("سجل", "record"),
    keys: ["gold-accounts/purchase-invoices", "gold-accounts/purchase-invoices-list", "gold-accounts/purchase-coding", "gold-accounts/pieces-list"],
    create: [{ form: "create", label: m("purchaseInvoices.add"), keys: ["gold-accounts/purchase-invoices"] }],
    views: [invoicesView, piecesView, codingView],
    record: {
      title: (r) => (isPiece(r) ? `${m("purchaseCoding.pieceNo")} · ${r.pieceCode}` : `${m("purchaseInvoices.recordNo")} ${code6(r.invoiceNumber)}`),
      endpoint: (r) => (r.pieceCode !== undefined || r.itemCode !== undefined ? `/pieces/${r.id}` : `/purchase-invoices/${r.id}`),
      enrich: async (r) => { try { return r.branchId ? { branchName: (await api(`/branches/${r.branchId}`)).branchName } : {}; } catch { return {}; } },
      render: (r) => (isPiece(r) ? pieceRecord(r) : invoiceRecord(r)),
      actions: [
        { id: "edit", label: c("edit"), icon: "edit", when: (r) => !isPiece(r) && !!r.canEdit && !r.deletedAt, run: (r, h) => { h.close(); h.openForm("edit", r); } },   // until coded; user 24 h, admin any time
        { id: "code", label: m("purchaseCoding.title"), icon: "gem", when: (r) => !isPiece(r) && !r.deletedAt && ((r.lines ?? []) as Row[]).some((l) => !l.coded), run: (r, h) => { h.close(); h.openForm("code", { invoiceId: r.id }); } },
        { id: "pieces", label: m("purchaseCoding.invoicePieces"), icon: "gem", when: (r) => !isPiece(r) && ((r.lines ?? []) as Row[]).some((l) => l.coded), run: (r) => goPieces(r.invoiceNumber) },
      ],
      // marks the row; pieceSold / invoiceCoded / editWindowClosed ... refuse and the refusal is shown
      remove: {
        when: (r) => !r.deletedAt,
        path: (r) => (isPiece(r) ? `/pieces/${r.id}` : `/purchase-invoices/${r.id}`),
        confirm: (r) => (isPiece(r)
          ? { title: m("purchaseCoding.deleteTitle", { code: r.pieceCode }), text: m("purchaseCoding.deleteBody") }
          : { title: m("purchaseInvoices.deleteTitle", { code: code6(r.invoiceNumber) }), text: m("purchaseInvoices.deleteBody") }),
      },
    },
    forms: {
      create: { display: "page", title: m("purchaseInvoices.new"), fields: [], path: () => "/purchase-invoices", custom: (p: CustomFormProps) => <InvoiceForm {...p} /> },
      edit: { display: "page", title: (r) => m("purchaseInvoices.editTitle", { code: code6(r?.invoiceNumber) }), fields: [], path: (r) => `/purchase-invoices/${r?.id}`, custom: (p: CustomFormProps) => <InvoiceForm {...p} /> },
      code: { display: "page", title: m("purchaseCoding.title"), fields: [], path: () => "/purchase-coding", custom: (p: CustomFormProps) => <CodingForm {...p} /> },
    },
  };
};

export default function Page() {
  const intent = useJobIntent();
  const view = intent.view ?? (intent.query.invoiceNumber ? "coding" : undefined);
  return <ThingPage make={makeConfig} access={useAccess()} initial={view || Object.keys(intent.query).length ? { view, query: intent.query } : undefined} />;
}
