// The Sales desk's link to the backend quote (docs/specs/sales-desk-reference.md sections 4 and 6): the request body from the form, and the
// WhatsApp builder's input from the answer. No price arithmetic here: every number shown comes from POST /sales-desk/quote.
import { latinNumber, piastresInput, typedPiastres } from "@/lib/format";
import type { DeskMessageInput } from "./sales-desk-whatsapp";

export type Operation = "sell" | "buy";
export type Metal = "gold" | "silver";
export type Payment = "cash" | "instapay" | "bank_transfer" | "visa";
export type Wrapping = "wrapped" | "unwrapped";

/** The reference's method names, as the WhatsApp text writes them (Arabic always). */
export const PAYMENT_NAMES: Record<Payment, string> = { cash: "كاش", instapay: "انستا باي", bank_transfer: "تحويل بنكي", visa: "فيزا" };
export const DISCOUNTS = [0, 5, 10] as const;
/** Same as the backend's DESK_VISA_PERCENT (a constant there today; shortcut: when it becomes a setting the quote must return it). */
export const VISA_PERCENT = 2;
const MANUAL_PRICE = /^\d{1,10}(\.\d{1,2})?$/;

/** A buy is paid by cash or bank transfer only. */
export const paymentChoices = (op: Operation): Payment[] => (op === "buy" ? ["cash", "bank_transfer"] : ["cash", "instapay", "bank_transfer", "visa"]);
/** The second method: sell only, never with Visa, never the same as the first. */
export const secondChoices = (op: Operation, first: Payment): Payment[] => (op === "buy" || first === "visa" ? [] : paymentChoices(op).filter((p) => p !== first && p !== "visa"));
/** The karats an item may have for a metal (the backend refuses others). */
export const karatFits = (metal: Metal, karat: string) => (metal === "silver" ? karat === "999" : karat === "21" || karat === "24");

export type QuoteForm = {
  operation: Operation; metal: Metal; payment: Payment; discountPercent: number; manualSell: string; manualBuy: string; wrapping: Wrapping;
  lines: { itemId: string; count: string }[];
};
export type QuoteBody = { operation: Operation; metal: Metal; payment: Payment; discountPercent?: number; manualSellPrice?: string; manualBuyPrice?: string; lines: { itemId: string; quantity: number; wrapping?: Wrapping }[] };
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
  return { operation: f.operation, metal: f.metal, payment, ...(sell && f.discountPercent ? { discountPercent: f.discountPercent } : {}),
    ...(typed.value ? { [sell ? "manualSellPrice" : "manualBuyPrice"]: typed.value } : {}), lines };
}

export type MessageParts = { date: string; branch: string; seller: string; customer: string; nationalId: string; phone: string; payment2?: Payment; split: string };
/** The WhatsApp builder's input from the form and the quote (`cash`: the same quote paid in cash, the "before Visa" total). */
export function messageInput(f: QuoteForm, q: Quote, cash: Quote | null, p: MessageParts): DeskMessageInput {
  const sell = f.operation === "sell", visa = sell && f.payment === "visa";
  return {
    date: p.date, branch: p.branch, seller: p.seller, customer: p.customer, nationalId: p.nationalId, phone: p.phone, operation: f.operation, metal: f.metal,
    payment1: PAYMENT_NAMES[f.payment], ...(p.payment2 ? { payment2: PAYMENT_NAMES[p.payment2], split: typedPiastres(p.split) ?? 0 } : {}),
    discount: sell ? f.discountPercent : 0, visa, visaPercent: VISA_PERCENT, basePrice21: q.goldPriceUsed / 100, finalPrice21: q.pricePerGram21 / 100, manual: q.manualPriceUsed,
    lines: q.lines.map((l) => ({ productName: l.itemName, quantity: l.quantity, feePerGram: l.feePerGram / 100, wrapping: f.metal === "silver" ? f.wrapping : undefined })),
    totals: { before: q.beforeDiscountPiastres, final: q.totalPiastres, cashTotal: cash?.totalPiastres },
  };
}

/** What is wrong with the split amount (the first method's share): "" when fine. */
export function splitProblem(split: string, total: number): "" | "required" | "invalid" | "tooBig" {
  if (split.trim() === "") return "required";
  const v = typedPiastres(split);
  return v === undefined || v <= 0 ? "invalid" : v >= total ? "tooBig" : "";   // the second method must be left something
}

export type Chosen = { method: Payment; amountPiastres: number };
/** The desk's choices a draft keeps (backend 0.1.22), from the desk state: `total` is the quote's total (the one method takes all of it), `lines` the item + count lines to send. */
export function deskChoices(f: QuoteForm, total: number, p: { payment2?: Payment; split: string }, lines: { itemId: string; quantity: number }[]) {
  const sell = f.operation === "sell", sellPrice = manualPrice(f.manualSell).value, buyPrice = manualPrice(f.manualBuy).value;
  const first = p.payment2 ? typedPiastres(p.split) ?? 0 : total;
  const paymentMethods: Chosen[] = [{ method: f.payment, amountPiastres: first }, ...(p.payment2 ? [{ method: p.payment2, amountPiastres: total - first }] : [])];
  return {
    operation: f.operation, metal: f.metal, ...(sell && f.discountPercent ? { discountPercent: f.discountPercent } : {}),
    ...(sellPrice ? { manualSellPrice: sellPrice } : {}), ...(buyPrice ? { manualBuyPrice: buyPrice } : {}), paymentMethods,
    lines: lines.map((l) => (f.metal === "silver" ? { ...l, wrapping: f.wrapping } : l)),
  };
}

export type DraftChoices = { operation?: Operation; metal?: Metal; discountPercent?: number; manualSellPrice?: string | null; manualBuyPrice?: string | null; payByVisa?: boolean; paymentMethods?: Chosen[] | null;
  totals?: { discount?: number }; lines?: { wrapping?: Wrapping | null }[] };
/** The desk state a saved draft is rebuilt from; an older draft (no desk fields) is a gold sell paid in cash. */
export function restoreChoices(x: DraftChoices) {
  const methods = x.paymentMethods ?? [], pct = x.discountPercent ?? 0, discount = x.totals?.discount ?? 0;
  return {
    operation: x.operation ?? "sell", metal: x.metal ?? "gold", wrapping: x.lines?.[0]?.wrapping ?? "wrapped",
    payment: methods[0]?.method ?? (x.payByVisa ? "visa" : "cash"), payment2: methods[1]?.method ?? "", split: methods[1] ? piastresInput(methods[0].amountPiastres) : "",
    pct, manual: { sell: x.manualSellPrice ?? "", buy: x.manualBuyPrice ?? "" }, typedDiscount: pct === 0 && discount > 0 ? piastresInput(discount) : "",
  } as { operation: Operation; metal: Metal; wrapping: Wrapping; payment: Payment; payment2: Payment | ""; split: string; pct: number; manual: { sell: string; buy: string }; typedDiscount: string };
}
