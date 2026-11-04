// Print of a saved sales invoice: GET /sales-invoices/{id}/print?layout=, drawn in a new window with a Print button.
// Layouts: a4, gift (no amounts unless asked), star (amounts as stars) on A4; thermal and receipt on 80 mm paper. A backend refusal is shown in its own words.
// A gift prints the recipient where the customer goes, never the real buyer; no layout prints the seller (backend #169).
import { api, ApiFailure } from "@/lib/api";
import { esc, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";

export const LAYOUTS = ["a4", "thermal", "receipt", "gift", "star"];
// shortcut: module-level translator set by openPrint (the print window is plain HTML, outside React)
let p: (k: string, v?: any) => string = (k) => k;

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
@media print{.bar{display:none}body{background:#fff}main{padding:0;overflow:visible}article{box-shadow:none}article.a4{width:auto;padding:0}article.narrow{width:100%;padding:0}}`;

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

// A4: the whole invoice as a table, then totals and payments. Gift leaves prices out; star prints the stars.
function a4(d: any) {
  const withPrice = d.layout !== "gift" || (d.totals.total !== null && d.totals.total !== undefined);   // gift: prices only when asked
  const split = withPrice && d.lines.every((l: any) => l.goldValue !== undefined);
  const th = (k: string, end?: any) => `<th class="${end ? "e" : ""}">${esc(p(k))}</th>`;
  const tr = d.lines.map((l: any) => `<tr><td>${ltr(l.pieceCode)}</td><td>${esc(l.itemName)}</td><td>${esc(l.karat)}</td><td class="e">${ltr(gramsText(l.weight))}</td>${split ? `<td class="e">${ltr(amountText(l.goldValue) ?? "")}</td><td class="e">${ltr(amountText(l.makingCharge) ?? "")}</td><td class="e">${ltr(amountText(l.discount ?? 0) ?? "")}</td>` : ""}${withPrice ? `<td class="e">${ltr(amountText(l.linePrice) ?? "")}</td>` : ""}</tr>`).join("");
  return `<article class="a4" data-layout="${esc(d.layout)}">${header(d)}<table><thead><tr>${th("pieceCode")}${th("item")}${th("karat")}${th("weight", 1)}${split ? th("goldValue", 1) + th("makingCharge", 1) + th("cashDiscount", 1) : ""}${withPrice ? th("price", 1) : ""}</tr></thead><tbody>${tr}</tbody>
    <tfoot><tr><td colspan="3">${esc(p("total"))} · ${esc(p("lines"))}: ${ltr(d.totals.lineCount)}</td><td class="e">${ltr(gramsText(d.totals.weight))}</td>${split ? `<td></td><td class="e">${ltr(amountText(d.totals.discount) ?? "")}</td>` : ""}${withPrice ? `<td class="e">${ltr(amountText(d.totals.total) ?? "")}</td>` : ""}</tr></tfoot></table>${withPrice ? payments(d) : ""}</article>`;
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
  const w = window.open("", "_blank");
  if (!w) { toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true }); return; }
  const dir = ar ? "rtl" : "ltr";
  const page = (title: string, body: string, size: string) => { w.document.open(); w.document.write(`<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${CSS}@page{size:${size};margin:${size === "A4" ? "10mm" : "3mm"}}</style></head><body>${body}</body></html>`); w.document.close(); };
  page(p("title"), `<p style="text-align:center;margin-top:40px">${esc(L("جارٍ التحميل…", "Loading…"))}</p>`, "A4");
  try {
    const d = await api(`/sales-invoices/${id}/print`, { query: { layout, ...(choices.recipientName ? { recipientName: choices.recipientName } : {}), ...(choices.recipientPhone ? { recipientPhone: choices.recipientPhone } : {}), ...(choices.showPrices !== undefined ? { showPrices: String(choices.showPrices) } : {}) } });
    const isNarrow = layout === "thermal" || layout === "receipt";
    const bar = `<div class="bar"><b>${esc(t("common", "report.printPreview"))} · ${esc(p(`layouts.${layout}`))}</b><span>${esc(isNarrow ? p("sizes.thermal") : p("sizes.a4"))}</span><button onclick="print()">${esc(t("common", "print"))}</button></div>`;
    page(`${p("title")} ${d.invoiceNumber}`, `${bar}<main>${isNarrow ? narrow(d) : a4(d)}</main>`, isNarrow ? "80mm auto" : "A4");
  } catch (e: any) {
    // A refusal of the backend (not found, not paid) is the answer, said in its own words.
    page(p("title"), `<main><div class="err">${esc(e instanceof ApiFailure ? tr.errorText(e.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."))}</div></main>`, "A4");
  }
}
