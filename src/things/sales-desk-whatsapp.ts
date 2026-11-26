// The WhatsApp text of a Sales desk quote: `buildDeskMessage` is the reference calculator's text, line by line (docs/specs/sales-desk-reference.md section 3).
// The one builder; the desk screen feeds it with the backend quote (sales-desk-quote.ts).

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
  date: string; branch: string; /** The stored sales channel name, printed as is. */
  channel: string; seller: string; customer: string; nationalId: string; phone: string;
  operation: "sell" | "buy"; metal: "gold" | "silver";
  /** The names of the payment methods, as the reference writes them (Arabic). */
  payment1: string; payment2?: string;
  /** Piastres of the first method when there are two methods. */
  split?: number | bigint;
  /** The desk's one payment list (issue #35): a line for each row, when there are two or more. Wins over payment2 / split. */
  payments?: { name: string; amount: number | bigint }[];
  /** Discount percent on the workmanship (0 = none). */
  discount: number;
  /** A discount typed as an amount, in piastres (0 or left out = none): printed as money, with the totals before and after it. */
  discountAmount?: number | bigint;
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
  /** A shipping sale only (owner, 2026-11-26): the governorate's Arabic name and its price in piastres. The totals above stay the pieces';
   *  two more lines give the delivery and the total with it. */
  delivery?: { name: string; amount: number };
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
  const discounted = Boolean(d.discount) || Number(d.discountAmount ?? 0) > 0;
  const totals = visaTotals
    ? `إجمالي السعر قبل ${pct}%: ${cents(t.cashTotal ?? 0)}\nإجمالي السعر بعد ${pct}%: ${cents(t.final)}${discounted ? `\nإجمالى سعر قبل خصم (بعد ${pct}%): ${cents(t.before)}` : ""}`
    : discounted ? `إجمالى سعر قبل خصم: ${cents(t.before)}\nإجمالى سعر بعد خصم: ${cents(t.final)}` : `إجمالي السعر: ${cents(t.final)}`;
  const split = Number(d.split ?? 0);
  const payment = d.payments && d.payments.length > 1
    ? d.payments.map((p) => `${p.name}: ${cents(Number(p.amount))} جنيه`).join("\n")
    : d.payment2
    ? `${d.payment1}: ${cents(split)} جنيه\n${d.payment2}: ${cents(Number(t.final) - split)} جنيه`
    : `طريقة الدفع: ${d.payment1}`;
  return `التاريخ: ${d.date}\nالفرع: ${d.branch}\nقناة البيع: ${d.channel}${silver ? " قطعة فضه" : ""}\nاسم البائع: ${d.seller}\nاسم العميل: ${d.customer}\nرقم البطاقة: ${d.nationalId}\nرقم العميل: ${d.phone}\nتفاصيل القطع: ${sell ? "بيع" : "شراء"}\n${price}${manual ? `\nسعر جرام 21 المعتمد: ${money(d.finalPrice21)}` : ""}\n${d.finalPrice24 != null ? `سعر عيار 24 المعتمد: ${money(d.finalPrice24)}\n` : ""}${sell ? "مصنعية" : "كاش باك"}: ${lines.map((l) => l.feePerGram).join(" + ")}\n${d.discount ? `خصم ${d.discount}% على المصنعية\n` : Number(d.discountAmount ?? 0) > 0 ? `خصم ${cents(Number(d.discountAmount))} جنيه على المصنعية\n` : ""}الأوزان:\n${lines.map((l) => `${l.quantity} ${l.productName}${silver ? ` ${l.wrapping === "unwrapped" ? "غير مغلف" : "مغلف"}` : ""}`).join("\n")}\n${totals}${d.delivery ? `\nالتوصيل (${d.delivery.name}): ${cents(d.delivery.amount)}\nالإجمالي شامل التوصيل: ${cents(Number(t.final) + d.delivery.amount)}` : ""}\n${payment}`;
}
