// Print of a saved sales invoice: GET /sales-invoices/{id}/print?layout=, drawn in a new window with a Print button.
// Layouts: a4, gift (no amounts unless asked), star (amounts as stars) on A4; thermal and receipt on 80 mm paper. A backend refusal is shown in its own words.
// A gift prints the recipient where the customer goes, never the real buyer; no layout prints the seller (backend #169).
import { api, ApiFailure } from "@/lib/api";
import { esc, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { arabicTr } from "@/lib/arabic-tr";

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
article.pre{width:148mm;min-height:210mm;box-sizing:border-box;padding:0 12mm 8mm;font-size:10.5px;line-height:1.45;color:#1c1912;display:flex;flex-direction:column;font-family:"PlexPrint","Segoe UI",system-ui,Tahoma,sans-serif}
.pre .top{height:12mm}
.pre .phead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding-bottom:9px;border-bottom:2px solid #192e5d}
.pre .doc b{display:block;font-size:24px;line-height:1.1;color:#192e5d}.pre .doc span{display:block;font-size:8px;letter-spacing:.3em;color:#c2a56e;margin-top:3px}
.pre .meta{display:grid;grid-template-columns:auto auto;gap:3px 10px;margin:0;font-size:11.5px}.pre .meta dt{font-weight:700;color:#a98446}.pre .meta dd{margin:0;color:#192e5d}
.pre .cust{display:grid;grid-template-columns:1fr 1fr;gap:14px 28px;margin:16px 0 18px}
.pre .fld{display:flex;gap:10px;align-items:baseline;min-height:16px;font-size:12px;color:#192e5d}.pre .fld span{color:#a98446;font-weight:700;white-space:nowrap}.pre .fld b{font-weight:700}
.pre .blank{flex:1;min-width:30px;border-bottom:1px dotted #999;height:12px}
.pre table{margin-top:4px;border-collapse:collapse}.pre th{background:#192e5d;color:#fff;border:0;padding:9px 4px;font-weight:700;font-size:10px;white-space:nowrap}.pre td{padding:9px 4px;border:0;color:#192e5d;font-size:11px}.pre td.it{width:34%}
.pre tbody td{border-bottom:1px solid #d5d9e2}
.pre td.it small{display:block;color:#8a93a8;font-size:8.5px}.pre td.pr{font-weight:700}
.pre .tot{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin-top:18px}
.pre .boxes{display:flex;flex-direction:column;gap:10px}
.pre .gbox{border:1px solid #c2a56e;padding:9px 14px;font-size:12px;color:#192e5d}.pre .gbox div{white-space:nowrap}.pre .gbox b{font-weight:700}
.pre .sums{min-width:46%}.pre .sums dl{display:grid;grid-template-columns:1fr auto;gap:8px 14px;margin:0 0 8px;padding-bottom:10px;border-bottom:2px solid #192e5d;font-size:11.5px;color:#192e5d}.pre .sums dd{margin:0;text-align:end}.pre .sums dt{font-weight:500}
.pre .grand{display:flex;justify-content:space-between;align-items:baseline;gap:12px;font-size:16px;color:#192e5d;font-weight:700}.pre .grand b{font-size:17px}
.pre .pfoot{margin-top:48px;padding-top:10px;border-top:1.5px solid #c2a56e;font-size:9.5px;color:#5d6b8a;line-height:1.7}.pre .pfoot span{display:block}
.pre .contact{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding-top:14px;font-size:10px;color:#192e5d}
.pre .contact .crow{display:flex;gap:22px;margin-bottom:6px}.pre .contact span{display:inline-flex;align-items:center;gap:7px}.pre .contact b{font-weight:700}.pre .contact .cr{display:flex;flex-direction:column;gap:6px}
.pre .contact svg{width:14px;height:14px;flex:none;color:#c2a56e}
/* Print the colours as drawn (the blue table head has white text: without its background the head reads blank), whatever the "Background graphics" option of the print window says. */
article.pre,article.pre *{-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media print{article.pre{width:auto;min-height:208mm;padding:0 12mm 8mm}.bar{display:none}body{background:#fff}main{padding:0;overflow:visible}article{box-shadow:none}article.a4{width:auto;padding:0}article.narrow{width:100%;padding:0}}`;

// The print window is plain HTML: it loads the dashboard's IBM Plex Sans Arabic (Arabic and Latin) from /fonts, so the weights are the ones drawn, not the system's.
const FONT_FILES = [400, 600, 700];
const fontCss = (origin: string) => FONT_FILES.flatMap((w) => [
  `@font-face{font-family:"PlexPrint";font-weight:${w};src:url(${origin}/fonts/ibm-plex-sans-arabic-arabic-${w}-normal-v5.3.0.woff2) format("woff2");unicode-range:U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF}`,
  `@font-face{font-family:"PlexPrint";font-weight:${w};src:url(${origin}/fonts/ibm-plex-sans-arabic-latin-${w}-normal-v5.3.0.woff2) format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}`,
]).join("");

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
// holds; gold, making and the total; the shop's foot note (the look of the owner's screenshot of 2026-11-23: no words, payments or signatures). The a4, gift and star
// layouts all use it. A gift prints the recipient in the buyer's place with no National ID, and no prices unless asked at the print.
// The foot of the invoice (owner's screenshot, 2026-11-23): two lines, in the language of the invoice. The Arabic text is always right to left and the
// English left to right, whatever the language of the screen it was opened from. A footer saved in Settings (invoiceFooter) replaces it, line for line.
export const DEFAULT_FOOTER = {
  ar: [
    "برجاء الاحتفاظ بهذه الفاتورة وتقديمها في حالة الاسترداد والرغبة في بيع المنتجات المذكورة أعلاه.",
    "الذهب المباع لا يُرد ولا يُستبدل.",
  ],
  en: [
    "Please keep this invoice and present it for a refund or when you wish to sell back the items listed above.",
    "Sold gold cannot be returned or exchanged.",
  ],
};
// Numbers keep their own direction inside Arabic text (346-088-774 must not read backwards).
const footLine = (x: string) => esc(x).replace(/[0-9][0-9\-/.]*[0-9]|[0-9]/g, (m) => `<bdi dir="ltr">${m}</bdi>`);
const money = (a: any) => { const t = amountText(a); return t === null ? "" : typeof a === "number" ? "LE " + t : t; };
const blankLine = '<span class="blank"></span>';
const fld = (label: string, html: string) => `<div class="fld"><span>${esc(label)}</span>${html || blankLine}</div>`;
const karatLabel = (k: string) => (k === "999" ? p("silverPrice") : p("karatPrice", { karat: k }));
const dmy = (iso: string) => { const [y, m, dd] = String(iso).slice(0, 10).split("-"); return `${dd} / ${m} / ${y}`; };

// The rows of the A5 table: the backend's merged groups; an older answer without them is one row per piece (count 1).
const groupsOf = (d: any): any[] =>
  d.groups ?? d.lines.map((l: any) => ({ itemName: l.itemName, karat: l.karat, count: 1, weight: l.weight, makingCharge: l.makingCharge, piecePrice: l.linePrice, rowTotal: l.linePrice, cashbackPerGram: null, pieceCodes: [l.pieceCode] }));

// The contact strip at the foot of the page (owner's screenshot, 2026-11-23): short number, WhatsApp, site and address on the left; the commercial register and the tax file on the right.
export const CONTACT = { short: "17937", whatsapp: "01282011114", site: "goldgram.eg", register: "295852", tax: "774-088-346", address: "Cairo Business Plaza, North Tower, Unit 401, New Cairo" };
const svg = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  phone: svg('<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
  whatsapp: svg('<path d="M3 21l1.6-4.7A8.5 8.5 0 1 1 8 19.5L3 21z"/><path d="M9 8.5c0 3 3 6 6 6l1.2-1.4-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2L9 8.5z"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>'),
  pin: svg('<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  doc: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>'),
  card: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>'),
};
const contactStrip = () => `<div class="contact" dir="ltr"><div><div class="crow"><span>${ICON.phone}<b>${CONTACT.short}</b></span><span>${ICON.whatsapp}<b>${CONTACT.whatsapp}</b></span><span>${ICON.globe}<b>${CONTACT.site}</b></span></div><div class="crow"><span>${ICON.pin}${esc(CONTACT.address)}</span></div></div><div class="cr"><span>${ICON.doc}<b>${CONTACT.register}</b></span><span>${ICON.card}<b>${CONTACT.tax}</b></span></div></div>`;

function a4(d: any) {
  const withPrice = d.layout !== "gift" || (d.totals.total !== null && d.totals.total !== undefined);   // gift: prices only when asked
  const money1 = (a: any) => ltr(money(a));
  const th = (k: string) => `<th>${esc(p(k))}</th>`;
  // The rows (owner, 2026-11-23): identical pieces merged with a count; weight, workmanship and price are of ONE piece, the amount is count x piece price.
  const rows = groupsOf(d).map((g: any) => `<tr><td class="it">${esc(g.itemName)}<small>${(g.pieceCodes ?? []).map((c: string) => ltr(c)).join(" · ")}</small></td><td>${ltr(g.count)}</td><td>${ltr(gramsText(g.weight))}</td><td>${esc(g.karat)}</td>${withPrice ? `<td>${ltr(amountText(g.makingCharge) ?? "")}</td><td>${ltr(amountText(g.piecePrice) ?? "")}</td><td class="pr">${ltr(amountText(g.rowTotal) ?? "")}</td><td>${ltr(amountText(g.cashbackPerGram) ?? "—")}</td>` : ""}</tr>`).join("");
  const year = String(d.invoiceDate).slice(0, 4);
  const customer = [
    fld(d.isGift ? p("recipient") : p("name"), d.customerName ? esc(d.customerName) : ""),
    ...(d.isGift ? [] : [fld(p("nationalId"), d.nationalId ? `<b dir="ltr">${esc(d.nationalId)}</b>` : "")]),
    fld(p("mobile"), d.customerPhone ? `<b dir="ltr">${esc(d.customerPhone)}</b>` : ""),
    fld(p("branch"), d.branchName ? esc(d.branchName) : ""),
  ].join("");
  const prices = withPrice ? (d.karatPrices ?? []).filter((x: any) => amountText(x.pricePerGram) !== null) : [];
  const priceBox = prices.length ? `<div class="gbox">${prices.map((x: any) => `<div><span>${esc(karatLabel(x.karat))}:</span> <b>${money1(x.pricePerGram)}</b></div>`).join("")}</div>` : "";
  // The weight box: one line for an invoice of one karat, a line per karat for two (owner, 2026-11-23). Weights are not money, so a gift keeps them.
  const weights = d.weightsByKarat ?? [];
  const unit = esc(p("gramUnit"));
  const weightBox = weights.length === 1 ? `<div class="gbox"><div><span>${esc(p("invoiceWeight"))}:</span> <b>${ltr(gramsText(weights[0].weight))} ${unit}</b></div></div>`
    : weights.length > 1 ? `<div class="gbox">${weights.map((x: any) => `<div><span>${esc(p("weightKarat", { karat: x.karat }))}:</span> <b>${ltr(gramsText(x.weight))} ${unit}</b></div>`).join("")}</div>`
    : `<div class="gbox"><div><span>${esc(p("invoiceWeight"))}:</span> <b>${ltr(gramsText(d.totals.weight))} ${unit}</b></div></div>`;
  const box = `<div class="boxes">${priceBox}${weightBox}</div>`;
  const discount = typeof d.totals.discount === "number" && d.totals.discount > 0 ? `<dt>${esc(p("cashDiscount"))}</dt><dd>${money1(-d.totals.discount)}</dd>` : "";
  const sums = withPrice ? `<div class="sums"><dl><dt>${esc(p("goldValue"))}</dt><dd>${money1(d.totals.goldTotal)}</dd><dt>${esc(p("makingCharge"))}</dt><dd>${money1(d.totals.makingTotal)}</dd>${discount}</dl><div class="grand"><span>${esc(p("total"))}</span><b>${money1(d.totals.total)}</b></div></div>` : "";
  const saved = String(d.footer ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const foot = saved.length ? saved : inArabic ? DEFAULT_FOOTER.ar : DEFAULT_FOOTER.en;
  const footDir = saved.length ? "auto" : inArabic ? "rtl" : "ltr";
  return `<article class="pre" data-layout="${esc(d.layout)}"><div class="top"></div>
    <div class="phead"><div class="doc"><b>${esc(p("title"))}</b><span>${esc(p("titleSub"))}</span></div>
      <dl class="meta"><dt>${esc(p("invoiceNumber"))}</dt><dd>${ltr(`INV/${year}/${String(d.invoiceNumber).padStart(6, "0")}`)}</dd><dt>${esc(p("date"))}</dt><dd>${ltr(`${dmy(d.invoiceDate)}${d.invoiceTime ? " · " + d.invoiceTime : ""}`)}</dd></dl></div>
    <div class="cust">${customer}</div>
    <table><thead><tr>${th("item")}${th("count")}${th("weightColumn")}${th("karat")}${withPrice ? th("pieceMaking") + th("piecePrice") + th("rowTotal") + th("cashbackPerGram") : ""}</tr></thead><tbody>${rows}</tbody></table>
    <div class="tot">${box}${sums}</div>
        <footer class="pfoot" dir="${footDir}" lang="${inArabic ? "ar" : "en"}">${foot.map((x) => `<span>${footLine(x)}</span>`).join("")}</footer>${contactStrip()}</article>`;
}

// 80 mm paper: every line a small block that wraps; the receipt keeps the header, the total and the payments.
function narrow(d: any) {
  const receipt = d.layout === "receipt";
  const items = receipt ? "" : `<ol>${d.lines.map((l: any) => `<li><b>${esc(l.itemName)}</b><p><span>${ltr(l.pieceCode)}</span><span>${esc(l.karat)}K · ${ltr(gramsText(l.weight) + " g")}</span>${amountText(l.linePrice) !== null ? `<b>${ltr(amountText(l.linePrice))}</b>` : ""}</p></li>`).join("")}</ol>`;
  return `<article class="narrow" data-layout="${esc(d.layout)}">${header(d)}${items}<p style="display:flex;justify-content:space-between;font-weight:600;margin:8px 0 0"><span>${esc(p("total"))} · ${ltr(d.totals.lineCount)}</span>${ltr(amountText(d.totals.total) ?? "")}</p>${payments(d)}</article>`;
}

// Must be called straight from the click (the window is opened before the answer, so no pop-up blocker objects).
// `choices` (gift layout): the recipient of this print and whether the prices show.
// `lines`: print only these pieces (their line numbers); left out, the whole invoice (owner, 2026-11-23).
export type PrintChoices = { recipientName?: string; recipientPhone?: string; showPrices?: boolean; lines?: number[] };
// An invoice is printed in Arabic ONLY, whatever the language of the page (owner, 2026-11-10): the translator is forced to Arabic here.
export async function openPrint(id: string, layout: string, pageTr: Tr, choices: PrintChoices = {}) {
  const tr = arabicTr(pageTr);
  const { t, L, isAr: ar } = tr;
  p = (k, v) => t("gold-sales", `prints.${k}`, v);
  inArabic = ar;
  const w = window.open("", "_blank");
  if (!w) { toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true }); return; }
  const dir = ar ? "rtl" : "ltr";
  const page = (title: string, body: string, size: string) => { w.document.open(); w.document.write(`<!doctype html><html lang="${ar ? "ar" : "en"}" dir="${dir}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${fontCss(window.location.origin)}${CSS}@page{size:${size};margin:${size === "A5" ? "0" : size === "A4" ? "10mm" : "3mm"}}</style></head><body>${body}</body></html>`); w.document.close(); };
  page(p("title"), `<p style="text-align:center;margin-top:40px">${esc(L("جارٍ التحميل…", "Loading…"))}</p>`, "A4");
  try {
    const d = await api(`/sales-invoices/${id}/print`, { query: { layout, ...(choices.recipientName ? { recipientName: choices.recipientName } : {}), ...(choices.recipientPhone ? { recipientPhone: choices.recipientPhone } : {}), ...(choices.showPrices !== undefined ? { showPrices: String(choices.showPrices) } : {}), ...(choices.lines?.length ? { lines: choices.lines.join(",") } : {}) } });
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
  return `<!doctype html><html lang="${arabic ? "ar" : "en"}" dir="${arabic ? "rtl" : "ltr"}"><head><meta charset="utf-8"><style>${fontCss("")}${CSS}@page{size:${isNarrow ? "80mm auto" : "A5"};margin:0}</style></head><body><main>${isNarrow ? narrow(d) : a4(d)}</main></body></html>`;
}
