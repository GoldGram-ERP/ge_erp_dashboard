// The WhatsApp summary of a Sales desk draft. `buildDeskMessage` is the reference calculator's text, line by line (docs/specs/sales-desk-reference.md section 3).
// `buildWhatsappText` below is the old summary, kept only until the desk screen (D2) switches its single caller to `buildDeskMessage`.
import { dateTimeText, milligramsText, piastresText } from "@/lib/format";

export type WaDraft = {
  createdAt: string; branchName: string; customerName: string; customerPhone: string; nationalId: string | null; goldPrice21k: number;
  lines: { itemName: string; karat: string; weightMg: number; quantity: number; linePrice: number }[];
  totals: { discount: number; total: number };
  cash: number; bankPayments: { bankAccountId: string; amount: number }[];
};
/** The words, already in the user's language (messages gold-sales.salesDesk.wa.*). `piece` is a template: {count} {item} {karat} {weight} {price}. */
export type WaLabels = { date: string; branch: string; customer: string; phone: string; nationalId: string; pieces: string; piece: string; goldPrice: string; discount: string; total: string; payment: string; cash: string; bank: string };

const fill = (template: string, v: Record<string, string | number>) => template.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ""));

/** bankNames: account names by id (the draft holds ids only). Weight shown is the line's whole weight (piece weight x count). */
export function buildWhatsappText(d: WaDraft, labels: WaLabels, lang = "en", bankNames: Record<string, string> = {}): string {
  const out = [
    `${labels.date}: ${dateTimeText(d.createdAt, lang)}`,
    `${labels.branch}: ${d.branchName}`,
    `${labels.customer}: ${d.customerName}`,
    `${labels.phone}: ${d.customerPhone}`,
    ...(d.nationalId ? [`${labels.nationalId}: ${d.nationalId}`] : []),
    "",
    `${labels.pieces}:`,
    ...d.lines.map((l, i) => `${i + 1}) ${fill(labels.piece, { count: l.quantity, item: l.itemName, karat: l.karat, weight: milligramsText(l.weightMg * l.quantity), price: piastresText(l.linePrice) })}`),
    "",
    `${labels.goldPrice}: ${piastresText(d.goldPrice21k)}`,
    ...(d.totals.discount > 0 ? [`${labels.discount}: ${piastresText(d.totals.discount)}`] : []),
    `${labels.total}: ${piastresText(d.totals.total)}`,
  ];
  const pays = [...(d.cash > 0 ? [`${labels.cash}: ${piastresText(d.cash)}`] : []),
    ...d.bankPayments.map((b) => `${labels.bank}${bankNames[b.bankAccountId] ? ` ${bankNames[b.bankAccountId]}` : ""}: ${piastresText(b.amount)}`)];
  if (pays.length) out.push("", `${labels.payment}:`, ...pays);
  return out.join("\n");
}

const VISA = "فيزا";
const moneyFmt = new Intl.NumberFormat("en-EG", { maximumFractionDigits: 2 });
const money = (v: number | string) => moneyFmt.format(Number(v));
const cents = (c: number | bigint) => money(Number(c) / 100);

export type DeskLine = {
  productName: string; quantity: number;
  /** The fee per gram exactly as it is printed (workmanship for a sale, cashback for a purchase), one per item. */
  feePerGram: string | number;
  /** Silver only. */
  wrapping?: "wrapped" | "unwrapped";
};
export type DeskMessageInput = {
  /** Cairo date, yyyy-mm-dd. */
  date: string; branch: string; channel?: string; seller: string; customer: string; nationalId: string; phone: string;
  operation: "sell" | "buy"; metal: "gold" | "silver";
  /** The names of the payment methods, as the reference writes them (Arabic). */
  payment1: string; payment2?: string;
  /** Piastres of the first method when there are two methods. */
  split?: number | bigint;
  /** Discount percent on the workmanship (0 = none). */
  discount: number;
  /** The first payment is Visa. */
  visa: boolean; visaPercent: number;
  /** Pounds per gram before Visa (the base) and the final price after Visa. */
  basePrice21: number | string; finalPrice21: number;
  /** Pounds per gram of the Visa price when it differs from `finalPrice21` (the reference's override path). */
  visaPrice21?: number;
  /** A manual (approved) price was typed: the reference prints an extra "approved" line. */
  manual?: boolean; finalPrice24?: number | null;
  lines: DeskLine[];
  /** Piastres, worked out by the backend quote: before the discount, final, and the cash total before Visa. */
  totals: { before: number | bigint; final: number | bigint; cashTotal?: number | bigint };
};

/** The reference calculator's WhatsApp text, in Arabic whatever the screen language. Pure formatting: no arithmetic on prices. */
export function buildDeskMessage(d: DeskMessageInput): string {
  const group = new Map<string, DeskLine>();
  for (const l of d.lines) {
    const key = `${l.productName}:${l.feePerGram}:${l.wrapping}`;
    const old = group.get(key);
    if (old) old.quantity += l.quantity; else group.set(key, { ...l });
  }
  const lines = [...group.values()];
  const silver = d.metal === "silver", sell = d.operation === "sell", pct = d.visaPercent;
  const visaTotals = sell && d.payment1 === VISA;
  const price = d.visa
    ? `${silver ? "سعر الجرام: " : "سعر جرام 21: "}${money(d.basePrice21)}\nسعر الجرام بعد ${pct}%: ${money(d.visaPrice21 ?? d.finalPrice21)}`
    : `سعر الجرام: ${money(d.finalPrice21)}`;
  const manual = d.manual || d.finalPrice24 != null;
  const t = d.totals;
  const totals = visaTotals
    ? `إجمالي السعر قبل ${pct}%: ${cents(t.cashTotal ?? 0)}\nإجمالي السعر بعد ${pct}%: ${cents(t.final)}${d.discount ? `\nإجمالى سعر قبل خصم (بعد ${pct}%): ${cents(t.before)}` : ""}`
    : d.discount ? `إجمالى سعر قبل خصم: ${cents(t.before)}\nإجمالى سعر بعد خصم: ${cents(t.final)}` : `إجمالي السعر: ${cents(t.final)}`;
  const split = Number(d.split ?? 0);
  const payment = d.payment2
    ? `${d.payment1}: ${cents(split)} جنيه\n${d.payment2}: ${cents(Number(t.final) - split)} جنيه`
    : `طريقة الدفع: ${d.payment1}`;
  return `التاريخ: ${d.date}\nالفرع: ${d.branch}\nقناة البيع: ${d.channel || "قطاعي"}${silver ? " قطعة فضه" : ""}\nاسم البائع: ${d.seller}\nاسم العميل: ${d.customer}\nرقم البطاقة: ${d.nationalId}\nرقم العميل: ${d.phone}\nتفاصيل القطع: ${sell ? "بيع" : "شراء"}\n${price}${manual ? `\nسعر جرام 21 المعتمد: ${money(d.finalPrice21)}` : ""}\n${d.finalPrice24 != null ? `سعر عيار 24 المعتمد: ${money(d.finalPrice24)}\n` : ""}${sell ? "مصنعية" : "كاش باك"}: ${lines.map((l) => l.feePerGram).join(" + ")}\n${d.discount ? `خصم ${d.discount}% على المصنعية\n` : ""}الأوزان:\n${lines.map((l) => `${l.quantity} ${l.productName}${silver ? ` ${l.wrapping === "unwrapped" ? "غير مغلف" : "مغلف"}` : ""}`).join("\n")}\n${totals}\n${payment}`;
}
