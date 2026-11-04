"use client";
// فواتير المبيعات: sales/invoices (sales-invoices, sales-invoices-list, sales-report, sales-by-period, unpaid-invoices, find-invoice).
// Ported from docs/nav-preview/app/things/sales-invoices.js. History first (find-invoice is its search box), three reports as views,
// "new" opens the invoice form as a page, a row opens the invoice (lines, payments, totals, print, delete).
// Decisions kept from the HTML: cash discount sent as cashDiscount {kind,value}; line limit 100; a saved invoice is never edited;
// the list pages at 20 and refuses unknown params (the history strips pageSize/sort/order before asking).
import { api, ApiFailure } from "@/lib/api";
import type { Column, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { addDays, intText, latinNumber, milligramsText, monthStart, piastresText, today } from "@/lib/format";
import { useSession } from "@/stores/session";
import { Kv, Ltr, Section, ThingPage, cellNode } from "@/components/engine";
import { LAYOUTS, openPrint } from "./sales-invoices-print";
import { GiftPrintBox } from "./sales-gift";
import { SalesInvoiceForm } from "./sales-invoices-form";
import { PIECE_CODE } from "./sales-form-parts";
import { useAccess } from "./sales-access";

const code6 = (n: unknown) => String(n).padStart(6, "0");
const branchSpec = { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } };
const userSpec = { path: "/users", value: "id", label: (r: Row) => [r.firstName, r.familyName].filter(Boolean).join(" ") || r.username, query: { pageSize: undefined } };
const bankAccountSpec = { path: "/bank-accounts", value: "id", label: (r: Row) => `${r.accountName} · ${r.bankName}`, query: { pageSize: undefined } };
const categorySpec = { path: "/categories", value: "id", label: "categoryName", query: { pageSize: undefined } };

// The history: a number (1-7 digits) or a phone (8+) goes to the list; a piece code (a letter in it, or digits the list does not know) to /find-invoice.
const asListItem = (inv: Row) => ({ id: inv.id, invoiceType: inv.invoiceType, employeeId: inv.employeeId, sellerName: inv.employeeName, invoiceNumber: inv.invoiceNumber, branchId: inv.branchId, invoiceDate: inv.invoiceDate, customerName: inv.customerName, customerPhone: inv.customerPhone, isGift: inv.isGift, lineCount: inv.totals.lineCount, cashTotal: inv.cashTotal, createdAt: inv.createdAt, deletedAt: inv.deletedAt });
async function findByPiece(code: string, signal?: AbortSignal) {
  try {
    const inv = await api("/find-invoice", { query: { pieceCode: code }, signal });
    return { items: [asListItem(inv)], page: 1, pageSize: 20, total: 1, totals: { invoices: 1, pieces: inv.totals.lineCount, totalPiastres: inv.cashTotal } };
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 404) return { items: [], page: 1, pageSize: 20, total: 0, totals: { invoices: 0, pieces: 0, totalPiastres: 0 } };
    throw e;
  }
}
async function loadHistory(query: Record<string, any>, { signal }: { signal?: AbortSignal }) {
  const { pageSize: _p, sort: _s, order: _o, ...q } = query;          // the list takes none of them: its page is fixed
  const s = String(q.search ?? "").trim();
  const code = PIECE_CODE.test(latinNumber(s)) ? latinNumber(s) : "";
  if (code && /[A-Za-z]/.test(code)) return findByPiece(code, signal);
  const list = await api("/sales-invoices", { query: q, signal });
  return list.total === 0 && code && s ? findByPiece(code, signal).then((f) => (f.total ? f : list)) : list;
}

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-sales", `salesInvoices.${k}`, v);
  const rep = (k: string) => t("common", `report.${k}`);
  const ALL = rep("all");
  const isPlainUser = useSession.getState().me?.userType === "user";

  const from = () => ({ name: "fromDate", label: m("fromDate"), type: "date" as const });
  const to = () => ({ name: "toDate", label: m("toDate"), type: "date" as const, validate: (v: any, all: Record<string, any>) => (v && all.fromDate && v < all.fromDate ? rep("toBeforeFrom") : null) });
  const branch = () => ({ name: "branchId", label: m("branch"), type: "select" as const, optionsFrom: branchSpec, placeholder: ALL });
  const bankAccount = (label: string) => ({ name: "bankAccountId", label, type: "select" as const, optionsFrom: bankAccountSpec, placeholder: ALL });
  const d = today();
  const quick: Record<string, Record<string, string>> = { today: { fromDate: d, toDate: d }, yesterday: { fromDate: addDays(d, -1), toDate: addDays(d, -1) }, last7: { fromDate: addDays(d, -6), toDate: d }, thisMonth: { fromDate: monthStart(), toDate: d } };
  const quickChips = () => [{ id: "all", label: ALL }, ...Object.keys(quick).map((id) => ({ id, label: t("gold-sales", `salesReport.quick.${id}`), query: quick[id] }))];

  // A totals row under the table: `map` gives the value of the columns that add up; the first cell names it.
  const footerOf = (cols: Column[], name: string, map: (tot: any) => Record<string, unknown>) => (_rows: Row[], answer: any) => {
    const totals = answer?.totals;
    if (!totals) return null;
    const vals = map(totals);
    return cols.map((c, i) => <td key={c.key} className={["money", "weight", "int"].includes(c.type ?? "") ? "num" : ""}>{i === 0 ? name : vals[c.key] === undefined ? "" : cellNode({ type: c.type, key: "v" }, { v: vals[c.key] }, tr)}</td>);
  };

  const historyCols: Column[] = [
    { key: "invoiceNumber", label: m("invoiceNumber"), render: (r) => <><Ltr>{code6(r.invoiceNumber)}</Ltr>{r.isGift && <> <span className="st" data-gift><i />{m("giftBadge")}</span></>}{r.deletedAt && <> <span className="st off"><i />{m("deletedBadge")}</span></>}</> },
    { key: "invoiceDate", label: m("invoiceDate"), type: "date" },
    { key: "invoiceType", label: m("invoiceType"), get: (r) => m(`invoiceTypes.${r.invoiceType}`) },
    { key: "customerName", label: m("customerName") },
    { key: "customerPhone", label: m("customerPhone") },
    { key: "sellerName", label: m("seller") },
    { key: "lineCount", label: m("lineCount"), type: "int" },
    { key: "cashTotal", label: m("cashTotal"), type: "money" },
  ];

  const sc = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: t("gold-sales", `salesReport.columns.${key}`), type, get, ...extra });
  const salesCols: Column[] = [
    sc("branch", undefined, (r) => r.branchName), sc("invoiceNumber", undefined, (r) => code6(r.invoiceNumber)), sc("saleDate", "date", (r) => r.saleDate), sc("saleTime", undefined, (r) => r.saleTime),
    sc("employee", undefined, (r) => r.employeeName), sc("pieceCode", undefined, (r) => r.pieceCode), sc("category", undefined, (r) => r.categoryName), sc("description", undefined, (r) => r.description),
    sc("tagPrice", "money", (r) => r.tagPrice), sc("shortCode", undefined, (r) => r.shortCode), sc("karat", undefined, (r) => r.karat), sc("count", "int", (r) => r.count),
    sc("weightBefore", "weight", (r) => r.weightBeforeMg), sc("difference", "weight", (r) => r.differenceMg), sc("weightAfter", "weight", (r) => r.weightAfterMg),
    sc("customerName", undefined, (r) => r.customerName), sc("customerPhone", undefined, (r) => r.customerPhone), sc("nationalId", undefined, (r) => r.nationalId),
    sc("averagePricePerGram", "money", (r) => r.averagePricePerGram), sc("goldPricePerGram", "money", (r) => r.goldPricePerGram),
    sc("discount", "money", (r) => r.discount, { sortable: false }),             // not a sort column of the backend
    sc("totalSalePrice", "money", (r) => r.totalSalePrice),
  ];
  const pc = (key: string, type: Column["type"], get: (r: Row) => unknown): Column => ({ key, label: t("gold-sales", `salesByPeriod.columns.${key}`), type, get });
  const periodCols: Column[] = [pc("date", "date", (r) => r.date), pc("invoices", "int", (r) => r.invoices), pc("pieces", "int", (r) => r.pieces), pc("weight", "weight", (r) => r.weightMg), pc("cash", "money", (r) => r.cash), pc("bank", "money", (r) => r.bank), { ...pc("discount", "money", (r) => r.discount), sortable: false }, pc("total", "money", (r) => r.total)];
  const uc = (key: string, type: Column["type"], get: (r: Row) => unknown, extra: Partial<Column> = {}): Column => ({ key, label: t("gold-sales", `unpaidInvoices.columns.${key}`), type, get, ...extra });
  const unpaidCols: Column[] = [
    uc("branch", undefined, (r) => r.branchName), uc("date", "date", (r) => r.date), uc("invoiceNumber", undefined, (r) => code6(r.invoiceNumber)), uc("customer", undefined, (r) => r.customerName),
    uc("weight", "weight", (r) => r.weightMg), uc("invoiceTotal", "money", (r) => r.invoiceTotal), uc("totalPaid", "money", (r) => r.totalPaid), uc("paidCash", "money", (r) => r.paidCash), uc("paidBank", "money", (r) => r.paidBank),
    uc("remaining", "money", (r) => r.remaining, { render: (r) => <b>{piastresText(r.remaining)}</b> }),     // the column the report is for
  ];
  const paging = { sizes: [10, 25, 50, 100], size: 25 };

  return {
    id: "invoices",
    title: m("title"),
    unit: L("فاتورة", "invoice"),
    keys: ["gold-sales/sales-invoices", "gold-sales/sales-invoices-list", "gold-sales/sales-report", "gold-sales/sales-by-period", "gold-sales/unpaid-invoices", "gold-sales/find-invoice"],
    create: [{ form: "create", label: m("add"), keys: ["gold-sales/sales-invoices"] }],
    views: [
      {
        id: "list", label: m("listTitle"), keys: ["gold-sales/sales-invoices-list", "gold-sales/find-invoice"],
        load: loadHistory, rowKey: "id",
        search: { param: "search", placeholder: `${m("searchPlaceholder")} · ${t("gold-sales", "findInvoice.pieceCode")}` },
        chips: [{ id: "all", label: ALL }, { id: "deleted", label: m("deletedOnly"), query: { deleted: "only" }, superOnly: true }],   // deleted=only answers a Super admin only
        // The branch filter is for an Admin and the Super admin; a User sells in their own branch.
        filters: [from(), to(), ...(isPlainUser ? [] : [branch()]), { name: "invoiceType", label: m("invoiceType"), type: "select", options: ["sale", "delivery"].map((k) => [k, m(`invoiceTypes.${k}`)] as [string, string]), placeholder: ALL }, { name: "employeeId", label: m("seller"), type: "select", optionsFrom: userSpec, placeholder: ALL }],
        paging: { sizeParam: null, sizes: [20], size: 20 },
        columns: historyCols,
        rowClass: (r) => (r.deletedAt ? "deleted" : ""),
        footer: footerOf(historyCols, m("invoicesCount"), (tot) => ({ lineCount: tot.pieces, cashTotal: tot.totalPiastres })),
        answerExtra: (a) => `${m("invoicesCount")} ${intText(a?.totals?.invoices ?? 0)}`,
      },
      {
        id: "sales-report", label: t("gold-sales", "salesReport.title"), keys: ["gold-sales/sales-report"],
        endpoint: "/reports/sales-report", rowKey: "_k",
        transform: (rows) => rows.map((r) => ({ ...r, _k: `${r.invoiceId}|${r.lineNumber}` })),   // a sold piece is one line of one invoice
        runLabel: rep("run"), chips: quickChips(),
        filters: [from(), to(), branch(), { name: "userId", label: t("gold-sales", "salesReport.userId"), type: "select", optionsFrom: userSpec, placeholder: ALL },
          { name: "karat", label: t("gold-sales", "salesReport.karat"), type: "select", options: ["18", "21", "24", "999"].map((k) => [k, k] as [string, string]), placeholder: ALL },
          { name: "itemType", label: t("gold-sales", "salesReport.itemType"), type: "select", options: ["gold", "other_or_silver"].map((k) => [k, t("gold-accounts", `items.itemTypes.${k}`)] as [string, string]), placeholder: ALL },
          { name: "categoryId", label: t("gold-sales", "salesReport.categoryId"), type: "select", optionsFrom: categorySpec, placeholder: ALL },
          { name: "customerName", label: t("gold-sales", "salesReport.customerName"), type: "text", maxLength: 100 },
          { name: "customerPhone", label: t("gold-sales", "salesReport.customerPhone"), type: "text", maxLength: 20, validate: (v) => (v && !/^\d{1,20}$/.test(latinNumber(v)) ? t("gold-sales", "salesReport.phoneInvalid") : null), toQuery: (v) => (v ? { customerPhone: latinNumber(v) } : {}) }],
        sort: { default: { key: "saleDate", dir: "asc" } }, paging, columns: salesCols,
        // a line opens its invoice
        onRow: (row, h) => h.open({ id: row.invoiceId, _k: row._k }),
        footer: footerOf(salesCols, rep("total"), (tot) => ({ count: tot.count, weightBefore: tot.weightBeforeMg, difference: tot.differenceMg, weightAfter: tot.weightAfterMg, discount: tot.discount, totalSalePrice: tot.totalSalePrice })),
      },
      {
        id: "by-period", label: t("gold-sales", "salesByPeriod.title"), keys: ["gold-sales/sales-by-period"],
        endpoint: "/reports/sales-by-period", rowKey: "date", runLabel: rep("run"),
        filters: [from(), to(), branch(), bankAccount(t("gold-sales", "salesByPeriod.bankAccountId"))],
        sort: { default: { key: "date", dir: "asc" } }, paging, columns: periodCols,
        // a day opens that day's list (same branch)
        onRow: (row, h) => ({ view: "list", filters: { fromDate: row.date, toDate: row.date, branchId: h.filters.branchId || undefined } }),
        footer: footerOf(periodCols, rep("total"), (tot) => ({ invoices: tot.invoices, pieces: tot.pieces, weight: tot.weightMg, cash: tot.cash, bank: tot.bank, discount: tot.discount, total: tot.total })),
      },
      {
        id: "unpaid", label: t("gold-sales", "unpaidInvoices.title"), keys: ["gold-sales/unpaid-invoices"],
        endpoint: "/reports/unpaid-invoices", rowKey: "id", runLabel: rep("run"),
        filters: [branch(), from(), to(), bankAccount(t("gold-sales", "unpaidInvoices.bankAccountId"))],
        sort: { default: { key: "date", dir: "asc" } }, paging, columns: unpaidCols,
        footer: footerOf(unpaidCols, rep("total"), (tot) => ({ weight: tot.weightMg, invoiceTotal: tot.invoiceTotal, totalPaid: tot.totalPaid, paidCash: tot.paidCash, paidBank: tot.paidBank, remaining: tot.remaining })),
      },
    ],
    forms: { create: { title: m("new"), display: "page", fields: [], path: () => "/sales-invoices", custom: SalesInvoiceForm } },
    record: {
      title: (r) => `${m("recordNo")} ${code6(r.invoiceNumber)}`,
      endpoint: (r) => `/sales-invoices/${r.id}`,        // a Super admin reads a deleted one too
      // The names behind the ids: the branch and each bank account (shown by name when the user may read them).
      enrich: async (r) => ({
        branchName: await api(`/branches/${r.branchId}`).then((b) => b.branchName).catch(() => ""),
        bankNames: await Promise.all((r.bankPayments ?? []).map((p: Row) => api(`/bank-accounts/${p.bankAccountId}`).then((a) => a.accountName).catch(() => ""))),
      }),
      render: (r) => {
        const tot = r.totals;
        const heads: [string, boolean?][] = [["lineHeading"], ["pieceCode"], ["item"], ["karat"], ["weight", true], ["weight24", true], ["pricePerGram24", true], ["goldValue", true], ["makingCharge", true], ["cashDiscount", true], ["linePrice", true]];
        const dash = (v: unknown, f: (x: any) => string) => (v === null || v === undefined ? "—" : f(v));
        return <>
          {r.deletedAt && <div className="note warn">{m("deletedBadge")}</div>}
          <Section title={m("details")}>
            <Kv k={m("invoiceNumber")}><Ltr>{code6(r.invoiceNumber)}</Ltr></Kv><Kv k={m("branch")}>{r.branchName ?? ""}</Kv>
            <Kv k={m("invoiceDate")}><Ltr>{String(r.invoiceDate).slice(0, 10)}</Ltr></Kv><Kv k={m("seller")}>{r.employeeName ?? ""}</Kv>
            <Kv k={m("invoiceType")}>{m(`invoiceTypes.${r.invoiceType}`)}</Kv>
            {r.isGift && <Kv k={m("gift")}><span className="st" data-gift><i />{m("giftBadge")}</span></Kv>}
            <Kv k={m("priceKarat")}><Ltr>{r.priceKarat}</Ltr></Kv><Kv k={m("priceDate")}><Ltr>{String(r.priceDate).slice(0, 10)}</Ltr></Kv><Kv k={m("goldPrice21k")}><Ltr>{piastresText(r.goldPrice21k)}</Ltr></Kv>
          </Section>
          {r.isGift && <Section title={m("giftRecipient")}>
            <Kv k={m("recipientName")}>{r.giftRecipientName ?? ""}</Kv><Kv k={m("recipientPhone")}><Ltr>{r.giftRecipientPhone ?? ""}</Ltr></Kv>
          </Section>}
          <Section title={r.isGift ? m("buyerInternal") : m("customer")}>
            <Kv k={m("customerName")}>{r.customerName ?? ""}</Kv><Kv k={m("customerPhone")}><Ltr>{r.customerPhone ?? ""}</Ltr></Kv><Kv k={m("nationalId")}><Ltr>{r.nationalId ?? ""}</Ltr></Kv>
          </Section>
          <Section title={m("pieces")} wide>
            <div className="table" style={{ overflowX: "auto" }}><table>
              <thead><tr>{heads.map(([k, n]) => <th key={k} className={n ? "num" : undefined}>{m(k)}</th>)}</tr></thead>
              <tbody>{(r.lines as Row[]).map((l) => (
                <tr key={l.lineNumber}>
                  <td>{l.lineNumber}</td><td dir="ltr">{l.pieceCode}</td><td>{l.itemName}</td><td dir="ltr">{l.karat}</td>
                  <td className="num">{milligramsText(l.weight)}</td><td className="num">{dash(l.weight24Mg, milligramsText)}</td><td className="num">{dash(l.pricePerGram24, piastresText)}</td>
                  <td className="num">{piastresText(l.goldValue)}</td><td className="num">{piastresText(l.makingCharge)}</td><td className="num">{piastresText(l.cashDiscount)}</td><td className="num">{piastresText(l.linePrice)}</td>
                </tr>))}</tbody>
            </table></div>
          </Section>
          <Section title={m("payments")}>
            {r.reservation && <><Kv k={m("reservation")}><Ltr>{code6(r.reservation.reservationNumber)}</Ltr></Kv><Kv k={m("paidAhead")}><Ltr>{piastresText(r.reservation.paid)}</Ltr></Kv></>}
            <Kv k={m("cash")}><Ltr>{piastresText(r.cash)}</Ltr></Kv>
            {(r.bankPayments as Row[]).map((p, i) => <div key={i}>
              <Kv k={i === 0 ? m("bankAccount") : m("bankAccountN", { number: String(i + 1) })}>{r.bankNames?.[i] ?? ""}</Kv>
              <Kv k={i === 0 ? m("bankAmount") : m("bankAmountN", { number: String(i + 1) })}><Ltr>{piastresText(p.amount)}</Ltr></Kv></div>)}
          </Section>
          <Section title={m("totals")}>
            <Kv k={m("lineCount")}><Ltr>{tot.lineCount}</Ltr></Kv><Kv k={m("totalWeight")}><Ltr>{milligramsText(tot.weight)}</Ltr></Kv><Kv k={m("cashDiscount")}><Ltr>{piastresText(tot.discount)}</Ltr></Kv>
            <Kv k={m("total")}><Ltr>{piastresText(tot.total)}</Ltr></Kv><Kv k={m("paid")}><Ltr>{piastresText(tot.paid)}</Ltr></Kv>
          </Section>
          {!r.deletedAt && <GiftPrintBox key={r.id} row={r} tr={tr} />}
        </>;
      },
      // Print: one button per layout in a new window; the gift layout has its own box above (recipient and prices), so it is not one of them.
      actions: LAYOUTS.filter((layout) => layout !== "gift").map((layout) => ({ id: `print-${layout}`, label: t("gold-sales", `prints.layouts.${layout}`), icon: "print", when: (r: Row) => !r.deletedAt, run: (r: Row) => { openPrint(r.id, layout, tr); } })),
      // No edit: a saved sales invoice is never changed. Delete marks it, puts its pieces back for sale and gives back cash and bank.
      remove: { when: (r) => !r.deletedAt, path: (r) => `/sales-invoices/${r.id}`, confirm: (r) => ({ title: m("deleteTitle", { code: code6(r.invoiceNumber) }), text: m("deleteBody") }) },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} access={useAccess()} />; }
