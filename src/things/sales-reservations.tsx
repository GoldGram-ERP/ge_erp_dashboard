"use client";
// الحجوزات: sales/reservations (history, reserved pieces, cancelled reservations). Ported from docs/nav-preview/app/things/sales-reservations.js (+ the form).
// Parity: a reservation has exactly two actions, Create sales invoice and Delete (Delete = cancel; no refund screen, no stock moves).
// The list takes only search, fromDate, toDate, deleted, page (20 a page); the reports take their filters, sort, order, page, pageSize.
import { api } from "@/lib/api";
import { DataTable, SortedTable, Td, Tr as TRow } from "@/components/ui";
import type { Column, CustomFormProps, MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { intText, latinNumber, piastresText } from "@/lib/format";
import { canOpen } from "@/nav/tree";
import { useMe } from "@/lib/session";
import { useSession } from "@/stores/session";
import type { Tr } from "@/lib/t";
import { Kv, Ltr, Section, ThingPage, cellNode } from "@/components/engine";
import { ReservationForm } from "./sales-reservation-form";
import { ReservationPiecesForm } from "@/components/fields/ReservationPieces";
import { code6 } from "./sales-form-parts";
import { BankKvs, TotalsBar, bankNamesOf, savedBar } from "./payment-block";

export const makeConfig: MakeConfig = (tr: Tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-sales", `reservations.${k}`, v);
  const si = (k: string, v?: Record<string, string>) => t("gold-sales", `salesInvoices.${k}`, v);
  const rr = (k: string, v?: Record<string, string>) => t("gold-sales", `reservationReport.${k}`, v);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };
  const categorySpec = { path: "/categories", value: "id", label: "categoryName", query: { pageSize: undefined } };
  const itemSpec = { path: "/items", value: "id", label: "itemName", query: { pageSize: undefined } };
  const badge = (cls: string, label: string) => <span className={`st ${cls}`}><i />{label}</span>;

  const from = () => ({ name: "fromDate", label: rr("fromDate"), type: "date" as const });
  const to = () => ({ name: "toDate", label: rr("toDate"), type: "date" as const, validate: (v: any, all: any) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) });
  const footerOf = (cols: Column[], name: string, map: (tot: any) => Record<string, unknown>) => (_rows: Row[], answer: any) => {
    const totals = answer?.totals;
    if (!totals) return null;
    const vals = map(totals);
    return cols.map((c, i) => <Td key={c.key} num={["money", "weight", "int"].includes(c.type ?? "")}>{i === 0 ? name : vals[c.key] === undefined ? "" : cellNode({ key: "v", type: c.type }, { v: vals[c.key] }, tr)}</Td>);
  };

  const historyView: ViewConfig = {
    id: "list", label: m("listTitle"), keys: ["gold-sales/reservations-list"],
    endpoint: "/reservations", rowKey: "id",
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: ALL }, { id: "deleted", label: si("deletedOnly"), query: { deleted: "only" }, superOnly: true }],
    filters: [{ name: "fromDate", label: si("fromDate"), type: "date" }, { name: "toDate", label: si("toDate"), type: "date", validate: (v, all) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) }],
    paging: { sizeParam: null, sizes: [20], size: 20 },
    columns: [
      { key: "reservationNumber", label: m("reservationNumber"), render: (r) => <><Ltr>{code6(r.reservationNumber)}</Ltr>{r.deletedAt ? <> {badge("off", si("deletedBadge"))}</> : r.salesInvoiceId ? <> {badge("info", m("invoicedBadge"))}</> : null}</> },
      { key: "date", label: m("date"), type: "date" },
      { key: "customerName", label: si("customerName") },
      { key: "customerPhone", label: si("customerPhone") },
      { key: "quantity", label: si("lineCount"), type: "int", get: (r) => r.totals.quantity },
      { key: "held", label: L("القطع المحجوزة", "Pieces held"), render: (r) => <Ltr>{`${r.piecesHeld} / ${r.piecesTotal}`}</Ltr> },
      { key: "total", label: si("total"), type: "money", get: (r) => r.totals.total },
      { key: "paid", label: m("paid"), type: "money", get: (r) => r.totals.paid },
    ],
    rowClass: (r) => (r.deletedAt ? "deleted" : ""),
  };

  // The reservations that still miss pieces (issue #36): a click opens the step of adding them.
  const needsPiecesView: ViewConfig = {
    id: "needs-pieces", label: L("حجوزات بدون قطع", "Reservations without pieces"), keys: ["gold-sales/reservations-list"],
    endpoint: "/reservations", rowKey: "id", query: { needsPieces: "true", order: undefined },
    search: { param: "search", placeholder: m("searchPlaceholder") },
    chips: [{ id: "all", label: ALL }],
    filters: historyView.filters,
    paging: { sizeParam: null, sizes: [20], size: 20 },
    columns: [
      { key: "reservationNumber", label: m("reservationNumber"), render: (r) => <Ltr>{code6(r.reservationNumber)}</Ltr> },
      { key: "date", label: m("date"), type: "date" },
      { key: "customerName", label: si("customerName") },
      { key: "customerPhone", label: si("customerPhone") },
      { key: "held", label: L("القطع المحجوزة", "Pieces held"), render: (r) => <Ltr>{`${r.piecesHeld} / ${r.piecesTotal}`}</Ltr> },
      { key: "total", label: si("total"), type: "money", get: (r) => r.totals.total },
    ],
    onRow: (row, h) => h.openForm("assignPieces", row),
  };

  // The two reports: one row per reservation line.
  const reportView = (id: string, keyName: string, endpoint: string, own: (c: (key: string, type: Column["type"], get: (r: Row) => unknown) => Column) => Column): ViewConfig => {
    const c = (key: string, type: Column["type"], get: (r: Row) => unknown): Column => ({ key, label: rr(`columns.${key}`), type, get });
    const cols: Column[] = [
      c("reservationNumber", undefined, (r) => code6(r.reservationNumber)), c("reservationDate", "date", (r) => r.reservationDate), c("description", undefined, (r) => r.description),
      c("karat", undefined, (r) => r.karat), c("quantity", "int", (r) => r.quantity), c("customerPhone", undefined, (r) => r.customerPhone),
      c("paidCash", "money", (r) => r.paidCash), c("paidCard", "money", (r) => r.paidCard), c("totalPaid", "money", (r) => r.totalPaid),
      c("customerName", undefined, (r) => r.customerName), c("linePrice", "money", (r) => r.linePrice), own(c),
    ];
    return {
      id, label: t("gold-sales", `${keyName}.title`), keys: [`gold-sales/${id}`],
      endpoint, rowKey: "_k",
      transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.reservationId}|${r.lineNumber}` })),
      runLabel: rep("run"),
      filters: [
        { name: "branchId", label: rr("branchId"), type: "select", optionsFrom: branchSpec, placeholder: ALL },
        { name: "karat", label: rr("karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, k]), placeholder: ALL },
        { name: "itemType", label: rr("itemType"), type: "select", options: ["gold", "other_or_silver"].map((k) => [k, t("gold-accounts", `items.itemTypes.${k}`)]), placeholder: ALL },
        { name: "itemId", label: rr("itemId"), type: "select", picker: "item", optionsFrom: itemSpec, placeholder: ALL },
        { name: "categoryId", label: rr("categoryId"), type: "select", optionsFrom: categorySpec, placeholder: ALL },
        { name: "customerName", label: rr("customerName"), type: "text", maxLength: 100 },
        { name: "customerPhone", label: rr("customerPhone"), type: "text", maxLength: 20, validate: (v) => (v && !/^\d{1,20}$/.test(latinNumber(v)) ? rr("phoneInvalid") : null), toQuery: (v) => (v ? { customerPhone: latinNumber(v) } : {}) },
        from(), to(),
      ],
      sort: { default: { key: "reservationDate", dir: "asc" } },
      paging: { sizes: [10, 25, 50, 100], size: 25 },
      columns: cols,
      onRow: (row, h) => h.open({ id: row.reservationId }),     // a line opens its reservation
      footer: footerOf(cols, rep("total"), (tot) => ({ quantity: tot.quantity, paidCash: tot.paidCash, paidCard: tot.paidCard, totalPaid: tot.totalPaid, linePrice: tot.linePrice })),
    };
  };

  return {
    id: "reservations",
    title: m("title"),
    unit: L("حجز", "reservation"),
    keys: ["gold-sales/reservations", "gold-sales/reservations-list", "gold-sales/reserved-pieces", "gold-sales/cancelled-reservations"],
    create: [{ form: "create", label: m("add"), keys: ["gold-sales/reservations"] }],
    views: [
      historyView,
      needsPiecesView,
      reportView("reserved-pieces", "reservedPieces", "/reports/reserved-pieces", (c) => c("daysReserved", "int", (r) => r.daysReserved)),
      reportView("cancelled-reservations", "cancelledReservations", "/reports/cancelled-reservations", (c) => c("cancelledDate", "date", (r) => r.cancelledDate)),
    ].map((v) => (v.onRow === undefined ? { ...v, onRow: (row: Row, h: { open: (r: Row) => void }) => h.open(row) } : v)),
    record: {
      title: (r) => `${m("recordNo")} ${r.reservationNumber === undefined ? "" : code6(r.reservationNumber)}`,
      endpoint: (r) => `/reservations/${r.id}`,
      // The names behind the ids: branch, seller (when the backend does not send it) and each bank account.
      enrich: async (r) => ({
        branchName: await api(`/branches/${r.branchId}`).then((b) => b.branchName).catch(() => ""),
        employeeName: r.employeeName || await api(`/users/${r.employeeId}`).then((u) => u.username).catch(() => ""),
        bankNames: await bankNamesOf(r.bankPayments),
      }),
      render: (r) => {
        const tot = r.totals;
        return (
          <>
            {r.deletedAt && <div className="note warn">{si("deletedBadge")}</div>}
            {r.salesInvoiceId && <div className="note">{m("invoicedBy")} <a href={`/${tr.locale}/sales/invoices?open=${r.salesInvoiceId}`} dir="ltr">{r.salesInvoiceNumber === null ? "" : code6(r.salesInvoiceNumber)}</a>{!r.deletedAt && <><br />{m("invoicedNote")}</>}</div>}
            <Section title={m("details")}>
              <Kv k={m("reservationNumber")}><Ltr>{code6(r.reservationNumber)}</Ltr></Kv><Kv k={si("branch")}>{r.branchName ?? ""}</Kv>
              <Kv k={m("date")}><Ltr>{String(r.date).slice(0, 10)}</Ltr></Kv><Kv k={m("employee")}>{r.employeeName ?? ""}</Kv>
            </Section>
            <Section title={si("customer")}>
              <Kv k={si("customerName")}>{r.customerName ?? ""}</Kv><Kv k={si("customerPhone")}><Ltr>{r.customerPhone ?? ""}</Ltr></Kv><Kv k={si("nationalId")}><Ltr>{r.nationalId ?? ""}</Ltr></Kv>
            </Section>
            <Section title={m("items")} wide>
              <SortedTable tableId="reservation-lines" rows={r.lines as Row[]} rowKey={(l) => String(l.lineNumber)} cols={[
                { key: "n", label: si("lineHeading"), kind: "number", get: (l) => l.lineNumber, show: (l) => l.lineNumber },
                { key: "item", label: m("item"), kind: "text", get: (l) => l.itemName, show: (l) => l.itemName },
                { key: "karat", label: si("karat"), kind: "text", get: (l) => l.karat, show: (l) => l.karat, ltr: true },
                { key: "qty", label: m("quantity"), kind: "number", get: (l) => l.quantity, show: (l) => intText(l.quantity), num: true },
                { key: "price", label: m("linePrice"), kind: "number", get: (l) => l.linePrice, show: (l) => piastresText(l.linePrice), num: true },
                { key: "disc", label: si("cashDiscount"), kind: "number", get: (l) => l.cashDiscount ?? 0, show: (l) => piastresText(l.cashDiscount ?? 0), num: true }]} />
            </Section>
            <Section title={L("القطع المحجوزة", "Held pieces")} wide>
              <Kv k={L("المحجوز", "Held")}><Ltr>{`${r.piecesHeld} / ${r.piecesTotal}`}</Ltr></Kv>
              {r.pieces?.length > 0 && <SortedTable tableId="reservation-pieces" rows={r.pieces as Row[]} rowKey={(p) => String(p.pieceCode)} cols={[
                { key: "code", label: si("pieceCode"), kind: "text", get: (p) => p.pieceCode, show: (p) => p.pieceCode, ltr: true },
                { key: "item", label: m("item"), kind: "text", get: (p) => (r.lines as Row[]).find((l) => l.itemId === p.itemId)?.itemName ?? "", show: (p) => (r.lines as Row[]).find((l) => l.itemId === p.itemId)?.itemName ?? "" },
                { key: "karat", label: si("karat"), kind: "text", get: (p) => p.karat, show: (p) => p.karat, ltr: true }]} />}
              {!r.deletedAt && !r.salesInvoiceId && !r.piecesComplete && <div className="note" role="status">{L("أضف قطع الحجز أولاً لإنشاء الفاتورة.", "Add the reservation's pieces first to make the invoice.")}</div>}
            </Section>
            <Section title={m("payment")}>
              <Kv k={si("cash")}><Ltr>{piastresText(r.cash)}</Ltr></Kv>
              <BankKvs tr={tr} rows={r.bankPayments} names={r.bankNames} />
            </Section>
            <Section title={si("totals")}>
              <Kv k={m("lineCount")}><Ltr>{intText(tot.lineCount)}</Ltr></Kv><Kv k={m("pieces")}><Ltr>{intText(tot.quantity)}</Ltr></Kv>
            </Section>
            <Section title={si("amounts")} wide><TotalsBar tr={tr} bar={savedBar(tot)} /></Section>
          </>
        );
      },
      // Create sales invoice: only a live reservation no invoice took, for a person who has the sales-invoices screen.
      actions: [{
        // The step of adding pieces (issue #36): while no invoice took the reservation; pieces can be added a few at a time.
        id: "assignPieces", icon: "plus", label: L("إضافة القطع", "Add pieces"),
        when: (r) => !r.deletedAt && !r.salesInvoiceId && canOpen(useSession.getState().me, ["gold-sales/reservations"]),
        run: (r, h) => { h.close(); h.openForm("assignPieces", r); },
      }, {
        // Edit (issue #175): only when the server says this user may edit it now (not deleted, no invoice took it, the day lock does not hold them).
        id: "edit", icon: "edit", label: t("common", "edit"),
        when: (r) => !!r.editable && !r.deletedAt,
        run: (r, h) => { h.close(); h.openForm("edit", r); },
      }, {
        id: "createInvoice", icon: "plus", label: m("createInvoice"),
        // Only once every line has all its pieces (issue #36): the invoice uses them, with no piece entry.
        when: (r) => !r.deletedAt && !r.salesInvoiceId && Boolean(r.piecesComplete) && canOpen(useSession.getState().me, ["gold-sales/sales-invoices"]),
        run: (r, h) => { h.close(); window.location.assign(`/${tr.locale}/sales/invoices?new=create&reservation=${r.id}`); },
      }],
      // Delete = cancel. The backend refuses it (409 reservationInvoiced) once an invoice took it, so the button is hidden then.
      remove: {
        when: (r) => !r.deletedAt && !r.salesInvoiceId,
        path: (r) => `/reservations/${r.id}`,
        confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.reservationNumber) }), text: m("deleteBody") }),
      },
    },
    forms: {
      create: { title: m("new"), display: "page", path: () => "/reservations", fields: [], custom: (p: CustomFormProps) => <ReservationForm {...p} /> },
      // The same form with the saved reservation: the branch, date and number stay.
      edit: { title: m("new"), display: "page", path: (r) => `/reservations/${r?.id}`, method: "PUT", fields: [], custom: (p: CustomFormProps) => <ReservationForm {...p} /> },
      // Add the pieces to a reservation (issue #36): the whole set it holds, saved with PUT /reservations/:id/pieces.
      assignPieces: { title: L("إضافة قطع إلى الحجز", "Add pieces to the reservation"), display: "page", path: (r) => `/reservations/${r?.id}/pieces`, method: "PUT", fields: [], custom: (p: CustomFormProps) => <ReservationPiecesForm {...p} /> },
    },
  };
};

export default function Page() {
  const { data: me } = useMe();
  const access = { canOpen: (keys?: string[]) => !keys || canOpen(me, keys), isSuper: me?.userType === "super_admin" };
  return <ThingPage make={makeConfig} access={access} />;
}
