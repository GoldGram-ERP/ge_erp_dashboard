// The Sales desk's link to the backend quote (docs/specs/sales-desk-reference.md sections 4 and 6): the request body from the form, and the
// WhatsApp builder's input from the answer. No price arithmetic here: every number shown comes from POST /sales-desk/quote.
import { latinNumber, piastresInput, typedPiastres } from "@/lib/format";
import { cashPaid, filledBanks, type Bank } from "./sales-invoices-math";
import type { DeskMessageInput } from "./sales-desk-whatsapp";

export type Operation = "sell" | "buy";
export type Metal = "gold" | "silver";
export type Payment = "cash" | "instapay" | "bank_transfer" | "visa";
export type Wrapping = "wrapped" | "unwrapped";

/** The reference's method names, as the WhatsApp text writes them (Arabic always). */
export const PAYMENT_NAMES: Record<Payment, string> = { cash: "كاش", instapay: "انستا باي", bank_transfer: "تحويل بنكي", visa: "فيزا" };
/** Same as the backend's DESK_VISA_PERCENT (a constant there today; shortcut: when it becomes a setting the quote must return it). */
export const VISA_PERCENT = 2;
const MANUAL_PRICE = /^\d{1,10}(\.\d{1,2})?$/;

// One payment list (issue #35): the cash box, then rows of a bank account, an amount and the way it is paid. The ways are the labels of the rows,
// never a second plan beside the money: they travel as `paymentMethods`, the cash row first, then each filled bank row, as the backend checks.
/** A bank row is paid by instapay, a bank transfer or Visa (a buy: a bank transfer only); cash is the cash box. */
export type BankMethod = "instapay" | "bank_transfer" | "visa";
export type DeskBank = Bank & { method: BankMethod };
export const bankMethodChoices = (op: Operation): BankMethod[] => (op === "buy" ? ["bank_transfer"] : ["instapay", "bank_transfer", "visa"]);
export const blankDeskBank = (op: Operation): DeskBank => ({ bankAccountId: "", amount: "", method: op === "buy" ? "bank_transfer" : "instapay" });
/** Visa is chosen on a sale: it adds the Visa percent to the total, and it is the only way to pay (the backend refuses Visa with cash or another row). */
export const visaChosen = (op: Operation, banks: readonly DeskBank[]) => op === "sell" && banks.some((b) => b.method === "visa");
/** The payment as the quote prices it: Visa or not. */
export const quotePayment = (op: Operation, banks: readonly DeskBank[]): Payment => (visaChosen(op, banks) ? "visa" : "cash");
export type PayRow = { method: Payment; amountPiastres: number };
/** The payment as one list of rows: the cash row first (when there is cash), then each filled bank row, in order. */
export function payRows(cash: string, banks: readonly DeskBank[]): PayRow[] {
  const c = cashPaid(cash);
  return [...(c > 0 ? [{ method: "cash" as const, amountPiastres: c }] : []), ...filledBanks(banks).map((b) => ({ method: b.method as Payment, amountPiastres: typedPiastres(String(b.amount).trim()) ?? 0 }))];
}
/** The karats an item may have for a metal (the backend refuses others). */
export const karatFits = (metal: Metal, karat: string) => (metal === "silver" ? karat === "999" : karat === "21" || karat === "24");

export type QuoteForm = {
  operation: Operation; metal: Metal; payment: Payment; discount?: { kind: string; value: number }; manualSell: string; manualBuy: string; wrapping: Wrapping;
  lines: { itemId: string; count: string }[];
};
export type QuoteBody = { operation: Operation; metal: Metal; payment: Payment; cashDiscount?: { kind: string; value: number }; manualSellPrice?: string; manualBuyPrice?: string; lines: { itemId: string; quantity: number; wrapping?: Wrapping }[] };
export type Quote = {
  totalPiastres: number; beforeDiscountPiastres: number; feeTotalPiastres: number; units: number; weightMg: number; pricePerGram21: number; goldPriceUsed: number; manualPriceUsed: boolean;
  lines: { itemId: string; itemName: string; karat: string; weightMg: number; quantity: number; feePerGram: number; pricePiastres: number }[];
};

/** A typed price: "" is none, a valid one is sent as typed (Latin digits), anything else is `invalid`. */
export const manualPrice = (typed: string): { value?: string; invalid: boolean } => {
  const t = latinNumber(typed.trim());
  return t === "" ? { invalid: false } : MANUAL_PRICE.test(t) && Number(t) > 0 ? { value: t, invalid: false } : { invalid: true };
};

/** The body of the quote, or null while a line has no item or a count the backend would refuse, or a typed price is invalid. */
export function quoteBody(f: QuoteForm, payment: Payment = f.payment): QuoteBody | null {
  const sell = f.operation === "sell", typed = manualPrice(sell ? f.manualSell : f.manualBuy);
  if (typed.invalid || f.lines.length === 0) return null;
  const lines: QuoteBody["lines"] = [];
  for (const l of f.lines) {
    const n = latinNumber(l.count);
    if (!l.itemId || !/^\d{1,3}$/.test(n) || +n < 1 || +n > 999) return null;
    lines.push({ itemId: l.itemId, quantity: +n, ...(f.metal === "silver" ? { wrapping: f.wrapping } : {}) });
  }
  return { operation: f.operation, metal: f.metal, payment, ...(sell && f.discount && f.discount.value > 0 ? { cashDiscount: f.discount } : {}),
    ...(typed.value ? { [sell ? "manualSellPrice" : "manualBuyPrice"]: typed.value } : {}), lines };
}

export type MessageParts = { date: string; branch: string; channel: string; seller: string; customer: string; nationalId: string; phone: string; rows: PayRow[] };
/** The WhatsApp builder's input from the form and the quote (`cash`: the same quote paid in cash, the "before Visa" total). */
export function messageInput(f: QuoteForm, q: Quote, cash: Quote | null, p: MessageParts): DeskMessageInput {
  const sell = f.operation === "sell", visa = sell && f.payment === "visa";
  return {
    date: p.date, branch: p.branch, channel: p.channel, seller: p.seller, customer: p.customer, nationalId: p.nationalId, phone: p.phone, operation: f.operation, metal: f.metal,
    payment1: PAYMENT_NAMES[p.rows[0]?.method ?? f.payment], ...(p.rows.length > 1 ? { payments: p.rows.map((r) => ({ name: PAYMENT_NAMES[r.method], amount: r.amountPiastres })) } : {}),
    discount: sell && f.discount?.kind === "percent" ? f.discount.value : 0, ...(sell && f.discount?.kind === "amount" ? { discountAmount: f.discount.value } : {}), visa, visaPercent: VISA_PERCENT, basePrice21: q.goldPriceUsed / 100, finalPrice21: q.pricePerGram21 / 100, manual: q.manualPriceUsed,
    lines: q.lines.map((l) => ({ productName: l.itemName, quantity: l.quantity, feePerGram: l.feePerGram / 100, wrapping: f.metal === "silver" ? f.wrapping : undefined })),
    totals: { before: q.beforeDiscountPiastres, final: q.totalPiastres, cashTotal: cash?.totalPiastres },
  };
}

export type Chosen = PayRow;
/** The desk's choices a draft keeps, from the desk state: `rows` is the one payment list (see payRows), `lines` the item + count lines to send.
 *  The discount does not travel here: it is the draft's `cashDiscount`, an amount or a percent, the same one the quote is asked with. */
export function deskChoices(f: QuoteForm, rows: PayRow[], lines: { itemId: string; quantity: number }[]) {
  const sellPrice = manualPrice(f.manualSell).value, buyPrice = manualPrice(f.manualBuy).value;
  return {
    operation: f.operation, metal: f.metal,
    ...(sellPrice ? { manualSellPrice: sellPrice } : {}), ...(buyPrice ? { manualBuyPrice: buyPrice } : {}), ...(rows.length ? { paymentMethods: rows } : {}),
    lines: lines.map((l) => (f.metal === "silver" ? { ...l, wrapping: f.wrapping } : l)),
  };
}

export type DraftChoices = { operation?: Operation; metal?: Metal; discountPercent?: number; manualSellPrice?: string | null; manualBuyPrice?: string | null; payByVisa?: boolean;
  cash?: number; bankPayments?: { bankAccountId: string; amount: number }[]; paymentMethods?: Chosen[] | null;
  totals?: { discount?: number }; lines?: { wrapping?: Wrapping | null }[] };
/** The desk state a saved draft is rebuilt from; an older draft (no desk fields) is a gold sell paid in cash.
 *  The ways of the bank rows come from the draft's methods when they name its rows (cash first, then each bank row); an older draft's methods were a plan
 *  beside the money, so its bank rows are bank transfers (Visa when it was priced by Visa). A Visa draft with no money rows keeps a Visa row, so the total stays. */
export function restoreChoices(x: DraftChoices) {
  const pct = x.discountPercent ?? 0, discount = x.totals?.discount ?? 0, methods = x.paymentMethods ?? [], money = x.bankPayments ?? [];
  const cashRow = Number(x.cash ?? 0) > 0 ? 1 : 0, tags = methods.slice(cashRow);
  // The methods are the rows only when each one is the row's own way and amount (the cash row first); anything else is an older plan.
  const aligned = methods.length === cashRow + money.length && (cashRow === 0 || (methods[0].method === "cash" && methods[0].amountPiastres === Number(x.cash))) &&
    tags.every((t, i) => t.method !== "cash" && t.amountPiastres === money[i].amount);
  const banks: DeskBank[] = money.map((b, i) => ({ bankAccountId: b.bankAccountId, amount: piastresInput(b.amount), method: aligned ? (tags[i].method as BankMethod) : x.payByVisa ? "visa" : "bank_transfer" }));
  if (x.payByVisa && !banks.some((b) => b.method === "visa") && banks.length === 0) banks.push({ bankAccountId: "", amount: "", method: "visa" });
  return {
    operation: x.operation ?? "sell", metal: x.metal ?? "gold", wrapping: x.lines?.[0]?.wrapping ?? "wrapped",
    cash: cashRow ? piastresInput(x.cash) : "", banks,
    kind: pct > 0 ? "percent" : "amount", disc: pct > 0 ? String(pct) : discount > 0 ? piastresInput(discount) : "",
    manual: { sell: x.manualSellPrice ?? "", buy: x.manualBuyPrice ?? "" },
  } as { operation: Operation; metal: Metal; wrapping: Wrapping; cash: string; banks: DeskBank[]; kind: "amount" | "percent"; disc: string; manual: { sell: string; buy: string } };
}
