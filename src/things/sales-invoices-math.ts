// The sums of the money forms, pure and exact: money is whole piastres, never a float.
// The backend recomputes everything on Save (these numbers only guide the typing).
import { latinNumber, typedPiastres } from "@/lib/format";
import { onePiece } from "./item-math";

export type Bank = { bankAccountId: string; amount: string };

// Decision (open question "line limit 200 vs 100"): the backend's domain/sales-invoice.ts says LINES_MAX = 100
// and its DTO refuses more (ArrayMaxSize); the dashboard form says 200 "like the backend" but is wrong. 100 here.
export const LINES_MAX = 100;
export const MAX_PIASTRES = 9_999_999_999_999;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// The most a cash discount may take: the lines' making charges, never the gold.
export const makingBase = (lines: any[]) => sum(lines.map((l) => l.makingCharge));

// kind "amount": typed money (piastres). kind "percent": a whole percent 0..100 of the making charge,
// half up on whole piastres: (2 x base x percent + 100) / 200, in BigInt so no float ever sees it.
// -> { invalid, value (piastres taken off), tooBig, sent: {kind, value}|undefined }
export function readDiscount(kind: string, typed: unknown, base: number): { invalid: boolean; value: number; tooBig: boolean; sent?: { kind: string; value: number } } {
  const text = String(typed ?? "").trim();
  if (text === "") return { invalid: false, value: 0, tooBig: false, sent: undefined };
  let invalid: boolean, value: number, raw: number | undefined;
  if (kind === "percent") {
    const s = latinNumber(text);
    invalid = !/^\d+$/.test(s) || Number(s) > 100;
    raw = invalid ? 0 : Number(s);
    value = invalid ? 0 : Number((BigInt(2) * BigInt(base) * BigInt(raw) + BigInt(100)) / BigInt(200));
  } else {
    raw = typedPiastres(text);
    invalid = raw === undefined || raw <= 0;
    value = invalid ? 0 : raw!;
  }
  return { invalid, value, tooBig: !invalid && value > base, sent: !invalid && value !== 0 ? { kind, value: raw! } : undefined };
}

export const bankPaid = (rows: Bank[]) => sum(rows.map((r) => typedPiastres(String(r.amount ?? "").trim()) ?? 0));
export const cashPaid = (typed: unknown) => typedPiastres(String(typed ?? "").trim()) ?? 0;

// The totals bar (owner, 2026-11-05): without workmanship (gold), workmanship, with workmanship (gross), cash discount, paid, remaining.
// lines: [{linePrice, goldValue}] ; discount: piastres taken off the workmanship ; made: the reservation an invoice fills (its totals rule) ;
// cash: typed text ; banks: rows. making = gross - gold exactly, so the three always add up; makingLeft is the workmanship after the discount.
export function totalsOf({ lines, discount, made, cash, banks }: { lines: any[]; discount: number; made?: any; cash: string; banks: Bank[] }) {
  const gross = made ? made.totals.grossTotal : sum(lines.map((l) => l.linePrice));
  const gold = made ? made.totals.goldTotal : sum(lines.map((l) => l.goldValue));
  const total = gross - discount;
  const paid = (made?.totals.paid ?? 0) + cashPaid(cash) + bankPaid(banks);
  return { gold, making: gross - gold, gross, discount, makingLeft: gross - gold - discount, total, paid, left: total - paid };
}

// One row of bank payment: nothing typed = not sent; half a row needs the other half; an account once.
// -> [{ account?: key, amount?: key }] aligned with rows (keys are common.fieldErrors names)
export function bankRowErrors(rows: Bank[]) {
  return rows.map((row, i) => {
    const e: { account?: string; amount?: string } = {}, text = String(row.amount ?? "").trim();
    let amount: number | undefined;
    if (text !== "") { amount = typedPiastres(text); if (amount === undefined || amount <= 0 || amount > MAX_PIASTRES) e.amount = "invalid"; }
    if (text !== "" && !row.bankAccountId) e.account = "required";
    if (row.bankAccountId && text === "") e.amount = "required";
    if (row.bankAccountId && rows.findIndex((o: Bank) => o.bankAccountId === row.bankAccountId) < i) e.account = "duplicateAccount";
    return e;
  });
}

// The whole payment block (cash box + bank rows), checked as the backend checks it.
// -> { [key]: fieldErrors key } with keys "cash", "bank<i>Account", "bank<i>Amount", "sum".
// need: "any" = cash and banks together above 0 (expense, refund, return); "none" = may be all empty (sale, reservation: the total decides).
export function paymentErrors(cash: string, banks: Bank[], need: "any" | "none" = "none"): Record<string, string> {
  const e: Record<string, string> = {}, text = String(cash ?? "").trim();
  if (text !== "") { const c = typedPiastres(text); if (c === undefined || c <= 0 || c > MAX_PIASTRES) e.cash = "invalid"; }
  bankRowErrors(banks).forEach((r, i) => { if (r.account) e[`bank${i}Account`] = r.account; if (r.amount) e[`bank${i}Amount`] = r.amount; });
  const total = cashPaid(cash) + bankPaid(banks);
  if (!Object.keys(e).length) {
    if (need === "any" && total === 0) e.sum = "required";
    else if (total > MAX_PIASTRES) e.sum = "invalid";
  }
  return e;
}

// What the backend takes: the filled rows only, amounts as piastres.
const filled = (r: Bank) => Boolean(r.bankAccountId) && String(r.amount ?? "").trim() !== "";
export const sentBanks = (rows: Bank[]) => rows.flatMap((r) => (filled(r) ? [{ bankAccountId: r.bankAccountId, amount: typedPiastres(String(r.amount).trim()) }] : []));

// The backend counts only the rows sent: its "bankPayments.N.x" is the Nth sent row of the form.
export function formRowOfRefusal(rows: Bank[], n: number) {
  const sent = rows.flatMap((r, i): number[] => (filled(r) ? [i] : []));
  return sent[n] ?? 0;
}

// A backend refusal of the payment block -> the key of the box it belongs under (see paymentErrors), or undefined when not ours.
// cashField: "cash" (sale, reservation, expense, refund) or "cashRefund" (return).
export function paymentKeyOf(field: string, rows: Bank[], cashField = "cash"): string | undefined {
  if (field === cashField) return "cash";
  if (field === "bankPayments") return "sum";
  const row = /^bankPayments\.(\d+)\.(bankAccountId|amount)$/.exec(field);
  return row ? `bank${formRowOfRefusal(rows, +row[1])}${row[2] === "amount" ? "Amount" : "Account"}` : undefined;
}

// The one price of Sales and Reservation (owner, 2026-11-05): ((karat price + workmanship per gram) x weight) x count.
// The gold and the workmanship of ONE piece are each half up to the piastre, then times the count (backend livePriceOf).
// perGram and workPerGram in piastres per gram, weightMg in milligrams.
export function linePriceOf(perGram: bigint, weightMg: bigint, workPerGram: bigint, count: number) {
  const one = onePiece(perGram, weightMg, "per_gram", workPerGram), n = BigInt(count);
  return { pieceGold: one.gold, pieceMaking: one.charge, piece: one.total, gold: one.gold * n, making: one.charge * n, line: one.total * n };
}
