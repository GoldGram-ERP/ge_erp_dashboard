// Print of a saved sales invoice: GET /sales-invoices/{id}/print?layout=, drawn in a new window with a Print button.
// Layouts: a4, gift (no amounts unless asked), star (amounts as stars) on A4; thermal and receipt on 80 mm paper. A backend refusal is shown in its own words.
// A gift prints the recipient where the customer goes, never the real buyer; no layout prints the seller (backend #169).
import { api, ApiFailure } from "@/lib/api";
import { amountInWords } from "@/lib/amount-in-words";
import { esc, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";

export const LAYOUTS = ["a4", "thermal", "receipt", "gift", "star"];
// shortcut: module-level translator set by openPrint (the print window is plain HTML, outside React)
let p: (k: string, v?: any) => string = (k) => k;
let inArabic = true;

// An amount as printed: piastres as money, the stars as given, nothing at all on gift (null).
const amountText = (a: any) => (a === null || a === undefined ? null : typeof a === "number" ? piastresText(a) : String(a));
const gramsText = (mg: number) => `${Math.trunc(mg / 1000)}.${String(mg % 1000).padStart(3, "0")}`;
const ltr = (x: any) => `<span dir="ltr">${esc(x)}</span>`;

const CSS = `body{margin:0;background:#e9e4d8;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;color:#1c1912}
.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px}
.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}
main{padding:24px;overflow-x:auto}
article{margin:0 auto;background:#fff;font-size:11px;box-shadow:0 2px 12px rgba(28,25,18,.12)}
article.a4{width:190mm;padding:10mm}article.narrow{width:80mm;max-width:100%;padding:3mm;line-height:1.35}
.head{border-bottom:2px solid #1c1912;padding-bottom:6px}.head p{margin:0;font-size:15px;font-weight:600}.head h2{margin:2px 0 0;font-size:16px}
dl.facts{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:8px 0}dl.facts dt{font-weight:600}dl.facts dd{margin:0}
table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:5px 4px;vertical-align:top;text-align:start}
th{border-bottom:1px solid #1c1912}td{border-bottom:1px solid #e3dccb}.e{text-align:end;white-space:nowrap}tfoot td{font-weight:600;border:0;padding-top:8px}
section{margin-top:10px;border-top:1px solid #1c1912;padding-top:6px}section h3{margin:0 0 4px;font-size:12px}
li{display:flex;justify-content:space-between;gap:12px;padding:2px 0;list-style:none}ul{margin:0;padding:0}li.sum{border-top:1px solid #e3dccb;font-weight:600}
ol{margin:10px 0 0;padding:0;border-top:1px solid #1c1912}ol li{display:block;border-bottom:1px dashed #c9c0aa;padding:5px 0}ol p{margin:0;display:flex;flex-wrap:wrap;justify-content:space-between;gap:2px 12px}
.err{max-width:420px;margin:30px auto;background:#fdf1f0;border:1px solid #b3261e;color:#7a1a14;padding:14px 18px;border-radius:8px;font-weight:600}
article.pre{width:148mm;min-height:210mm;box-sizing:border-box;padding:0 12mm 8mm;font-size:10.5px;line-height:1.45;color:#1c1912}
.pre .top{height:38mm}
.pre .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:8px;border-bottom:2px solid #1b2a5a}
.pre .doc b{display:block;font-size:19px;color:#1b2a5a}.pre .doc span{display:block;font-size:8.5px;letter-spacing:.2em;color:#b08d3c}
.pre .meta{display:grid;grid-template-columns:auto auto;gap:1px 8px;margin:0;font-size:10px}.pre .meta dt{font-weight:700;color:#1b2a5a}.pre .meta dd{margin:0}
.pre .cust{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px;margin:14px 0 12px}
.pre .fld{display:flex;gap:6px;align-items:flex-end;min-height:16px}.pre .fld span{color:#777;white-space:nowrap}.pre .fld b{font-weight:500}
.pre .blank{flex:1;min-width:30px;border-bottom:1px dotted #999;height:12px}
.pre table{margin-top:6px}.pre th{background:#1b2a5a;color:#fff;border:0;padding:6px 5px;font-weight:600}.pre td{padding:6px 5px;border-bottom:1px solid #e3dccb}
.pre td.it small{display:block;color:#888;font-size:9px}.pre td.pr{font-weight:700;color:#1b2a5a}.pre tfoot td{border:0;color:#777;font-weight:400}
.pre .tot{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-top:12px}
.pre .gbox{border:1px solid #c9b27c;border-inline-end:3px solid #b08d3c;padding:6px 10px;font-size:10.5px}.pre .gbox div{white-space:nowrap}.pre .gbox span{color:#444}.pre .gbox b{color:#1b2a5a}
.pre .sums{min-width:46%}.pre .sums dl{display:grid;grid-template-columns:1fr auto;gap:2px 14px;margin:0 0 4px;padding-bottom:6px;border-bottom:2px solid #1b2a5a}.pre .sums dd{margin:0;text-align:end}
.pre .grand{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:15px;color:#1b2a5a}.pre .grand b{font-size:16px}
.pre .words{margin:10px 0 0;font-size:11px}.pre .words span{color:#777}
.pre .pay{margin:8px 0 0;color:#555}.pre .pay .tick{margin-inline-start:12px;white-space:nowrap}
.pre .sigs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin-top:34px}.pre .sigs i{display:block;border-top:1.5px solid #1b2a5a;margin-bottom:4px}.pre .sigs span{color:#777;font-size:9.5px}
.pre .pfoot{margin-top:18px;padding-top:6px;border-top:1px solid #c9b27c;font-size:8.5px;color:#777}.pre .pfoot b{display:block;color:#1b2a5a;font-size:9.5px}.pre .pfoot span{display:block}
@media print{article.pre{width:auto;min-height:0;padding:0 12mm}.bar{display:none}body{background:#fff}main{padding:0;overflow:visible}article{box-shadow:none}article.a4{width:auto;padding:0}article.narrow{width:100%;padding:0}}`;

function payments(d: any) {
  const rows = d.payments.filter((x: any) => amountText(x.amount) !== null);
  if (!rows.length) return "";
  return `<section><h3>${esc(p("payments"))}</h3><ul>${rows.map((x: any) => `<li><span>${esc(x.kind === "reservation" ? p("reservation", { number: x.label ?? "" }) : x.kind === "cash" ? p("cash") : x.label ?? p("bank"))}</span>${ltr(amountText(x.amount))}</li>`).join("")}<li class="sum"><span>${esc(p("paid"))}</span>${ltr(amountText(d.totals.paid) ?? "")}</li></ul></section>`;
}

function header(d: any) {
  const facts = [[p("invoiceNumber"), ltr(d.invoiceNumber)], [p("date"), ltr(String(d.invoiceDate).slice(0, 10))], [p("branch"), esc(d.branchName)], [d.isGift ? p("recipient") : p("customer"), esc(d.customerName)], [p("phone"), ltr(d.customerPhone)]];
  return `<div class="head"><p>${esc(d.shopName || "GoldGram")}</p><h2>${esc(d.layout === "receipt" ? p("receiptTitle") : p("title"))}</h2></div>
    <dl class="facts">${facts.map(([k, v]: any) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
}

// The invoice on A5 preprinted paper (the shop's letterhead is already on the sheet, so the top stays empty): number, date and time; the
// customer block filled from the invoice (a dotted line where there is nothing to fill); the lines; the price of each karat the invoice
// holds; gold, making and the total, and the total in words; how it was paid; signatures; the shop's foot note. The a4, gift and star
// layouts all use it. A gift prints the recipient in the buyer's place with no National ID, and no prices unless asked at the print.
const money = (a: any) => { const t = amountText(a); return t === null ? "" : typeof a === "number" ? "LE " + t : t; };
const blankLine = '<span class="blank"></span>';
const fld = (label: string, html: string) => `<div class="fld"><span>${esc(label)}</span>${html || blankLine}</div>`;
const karatLabel = (k: string) => (k === "999" ? p("silverPrice") : p("karatPrice", { karat: k }));
const dmy = (iso: string) => { const [y, m, dd] = String(iso).slice(0, 10).split("-"); return `${dd} / ${m} / ${y}`; };
const methodLabel = (x: any) => (x.kind === "reservation" ? p("reservation", { number: x.label ?? "" }) : x.kind === "cash" ? p("cash") : x.label ?? p("bank"));

function a4(d: any) {
  const withPrice = d.layout !== "gift" || (d.totals.total !== null && d.totals.total !== undefined);   // gift: prices only when asked
  const money1 = (a: any) => ltr(money(a));
  const perGram = (l: any) => (typeof l.goldValue === "number" && l.weight > 0 ? amountText(Math.round((l.goldValue * 1000) / l.weight)) : amountText(l.goldValue));
  const th = (k: string) => `<th>${esc(p(k))}</th>`;
  const rows = d.lines.map((l: any) => `<tr><td class="it">${esc(l.itemName)}<small>${ltr(l.pieceCode)}</small></td><td>${ltr(gramsText(l.weight))}</td><td>${esc(l.karat)}</td>${withPrice ? `<td>${ltr(perGram(l) ?? "")}</td><td>${ltr(amountText(l.makingCharge) ?? "")}</td><td class="pr">${ltr(amountText(l.linePrice) ?? "")}</td>` : ""}</tr>`).join("");
  const year = String(d.invoiceDate).slice(0, 4);
  const customer = [
    fld(d.isGift ? p("recipient") : p("name"), d.customerName ? esc(d.customerName) : ""),
    ...(d.isGift ? [] : [fld(p("nationalId"), d.nationalId ? `<b dir="ltr">${esc(d.nationalId)}</b>` : "")]),
    fld(p("mobile"), d.customerPhone ? `<b dir="ltr">${esc(d.customerPhone)}</b>` : ""),
    fld(p("branch"), d.branchName ? esc(d.branchName) : ""),
  ].join("");
  const prices = withPrice ? (d.karatPrices ?? []).filter((x: any) => amountText(x.pricePerGram) !== null) : [];
  const box = prices.length ? `<div class="gbox">${prices.map((x: any) => `<div><span>${esc(karatLabel(x.karat))}:</span> <b>${money1(x.pricePerGram)}</b></div>`).join("")}</div>` : "<div></div>";
  const discount = typeof d.totals.discount === "number" && d.totals.discount > 0 ? `<dt>${esc(p("cashDiscount"))}</dt><dd>${money1(-d.totals.discount)}</dd>` : "";
  const sums = withPrice ? `<div class="sums"><dl><dt>${esc(p("goldValue"))}</dt><dd>${money1(d.totals.goldTotal)}</dd><dt>${esc(p("makingCharge"))}</dt><dd>${money1(d.totals.makingTotal)}</dd>${discount}</dl><div class="grand"><span>${esc(p("total"))}</span><b>${money1(d.totals.total)}</b></div></div>` : "";
  const words = withPrice && typeof d.totals.total === "number" ? `<p class="words"><span>${esc(p("totalInWords"))}</span> ${esc([p("onlyPrefix"), amountInWords(d.totals.total, inArabic ? "ar" : "en"), p("onlySuffix")].filter(Boolean).join(" "))}</p>` : "";
  const paid = d.payments.filter((x: any) => amountText(x.amount) !== null);
  const how = withPrice && paid.length ? `<p class="pay"><span>${esc(p("paymentMethod"))}:</span>${paid.map((x: any) => `<span class="tick">☑ ${esc(methodLabel(x))} ${ltr(money(x.amount))}</span>`).join("")}</p>` : "";
  const foot = String(d.footer ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return `<article class="pre" data-layout="${esc(d.layout)}"><div class="top"></div>
    <div class="phead"><div class="doc"><b>${esc(p("title"))}</b><span>${esc(p("titleSub"))}</span></div>
      <dl class="meta"><dt>${esc(p("invoiceNumber"))}</dt><dd>${ltr(`INV/${year}/${String(d.invoiceNumber).padStart(6, "0")}`)}</dd><dt>${esc(p("date"))}</dt><dd>${ltr(`${d.invoiceTime ? d.invoiceTime + " · " : ""}${dmy(d.invoiceDate)}`)}</dd></dl></div>
    <div class="cust">${customer}</div>
    <table><thead><tr>${th("item")}${th("weight")}${th("karat")}${withPrice ? th("pricePerGram") + th("makingCharge") + th("price") : ""}</tr></thead><tbody>${rows}</tbody>
      <tfoot><tr><td>${esc(p("total"))} · ${esc(p("lines"))}: ${ltr(d.totals.lineCount)}</td><td>${ltr(gramsText(d.totals.weight))}</td><td colspan="${withPrice ? 4 : 1}"></td></tr></tfoot></table>
    ${withPrice ? `<div class="tot">${box}${sums}</div>` : ""}${words}${how}
    <div class="sigs"><div><i></i><span>${esc(p("receiver"))}</span></div><div><i></i><span>${esc(p("sellerCode"))}</span></div><div><i></i><span>${esc(p("stamp"))}</span></div></div>
    ${foot.length ? `<footer class="pfoot"><b>${esc(foot[0])}</b>${foot.slice(1).map((x) => `<span>${esc(x)}</span>`).join("")}</footer>` : ""}</article>`;
}

// 80 mm paper: every line a small block that wraps; the receipt keeps the header, the total and the payments.
function narrow(d: any) {
  const receipt = d.layout === "receipt";
  const items = receipt ? "" : `<ol>${d.lines.map((l: any) => `<li><b>${esc(l.itemName)}</b><p><span>${ltr(l.pieceCode)}</span><span>${esc(l.karat)}K · ${ltr(gramsText(l.weight) + " g")}</span>${amountText(l.linePrice) !== null ? `<b>${ltr(amountText(l.linePrice))}</b>` : ""}</p></li>`).join("")}</ol>`;
  return `<article class="narrow" data-layout="${esc(d.layout)}">${header(d)}${items}<p style="display:flex;justify-content:space-between;font-weight:600;margin:8px 0 0"><span>${esc(p("total"))} · ${ltr(d.totals.lineCount)}</span>${ltr(amountText(d.totals.total) ?? "")}</p>${payments(d)}</article>`;
}

// Must be called straight from the click (the window is opened before the answer, so no pop-up blocker objects).
// `choices` (gift layout): the recipient of this print and whether the prices show.
export type PrintChoices = { recipientName?: string; recipientPhone?: string; showPrices?: boolean };
export async function openPrint(id: string, layout: string, tr: Tr, choices: PrintChoices = {}) {
  const { t, L, isAr: ar } = tr;
  p = (k, v) => t("gold-sales", `prints.${k}`, v);
  inArabic = ar;
  const w = window.open("", "_blank");
  if (!w) { toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true }); return; }
  const dir = ar ? "rtl" : "ltr";
  const page = (title: string, body: string, size: string) => { w.document.open(); w.document.write(`<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}@page{size:${size};margin:${size === "A5" ? "0" : size === "A4" ? "10mm" : "3mm"}}</style></head><body>${body}</body></html>`); w.document.close(); };
  page(p("title"), `<p style="text-align:center;margin-top:40px">${esc(L("جارٍ التحميل…", "Loading…"))}</p>`, "A4");
  try {
    const d = await api(`/sales-invoices/${id}/print`, { query: { layout, ...(choices.recipientName ? { recipientName: choices.recipientName } : {}), ...(choices.recipientPhone ? { recipientPhone: choices.recipientPhone } : {}), ...(choices.showPrices !== undefined ? { showPrices: String(choices.showPrices) } : {}) } });
    const isNarrow = layout === "thermal" || layout === "receipt";
    const bar = `<div class="bar"><b>${esc(t("common", "report.printPreview"))} · ${esc(p(`layouts.${layout}`))}</b><span>${esc(isNarrow ? p("sizes.thermal") : p("sizes.a4"))}</span><button onclick="print()">${esc(t("common", "print"))}</button></div>`;
    page(`${p("title")} ${d.invoiceNumber}`, `${bar}<main>${isNarrow ? narrow(d) : a4(d)}</main>`, isNarrow ? "80mm auto" : "A5");
  } catch (e: any) {
    // A refusal of the backend (not found, not paid) is the answer, said in its own words.
    page(p("title"), `<main><div class="err">${esc(e instanceof ApiFailure ? tr.errorText(e.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."))}</div></main>`, "A4");
  }
}

/** The print of one invoice as HTML (styles included), for tests: the same drawing as the print window, without the window. */
export function renderInvoice(d: any, t: Tr["t"], arabic: boolean): string {
  p = (k, v) => t("gold-sales", `prints.${k}`, v);
  inArabic = arabic;
  const isNarrow = d.layout === "thermal" || d.layout === "receipt";
  return `<!doctype html><html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${CSS}@page{size:${isNarrow ? "80mm auto" : "A5"};margin:0}</style></head><body><main>${isNarrow ? narrow(d) : a4(d)}</main></body></html>`;
}
