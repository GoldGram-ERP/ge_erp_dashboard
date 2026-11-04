// The sums of the new sales invoice, pure and exact: money is whole piastres, never a float.
// Same rules as the dashboard's sales-invoice-form.tsx and bank-payment-rows.tsx; the backend recomputes
// everything on Save (these numbers only guide the typing).
import { latinNumber, typedPiastres } from "@/lib/format";

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

// lines: [{linePrice}] ; discount: piastres taken off ; made: the reservation (its totals rule) ; cash: typed text ; banks: rows
export function totalsOf({ lines, discount, made, cash, banks }: { lines: any[]; discount: number; made?: any; cash: string; banks: Bank[] }) {
  // The deployed reservation sends totals.total (sum of its line prices) and no grossTotal / discount: fall back to those.
  const gross = made ? (made.totals.grossTotal ?? made.totals.total) : sum(lines.map((l) => l.linePrice));
  const total = gross - discount;
  const paid = (made?.totals.paid ?? 0) + cashPaid(cash) + bankPaid(banks);
  return { gross, discount, total, paid, left: total - paid };
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

// What the backend takes: the filled rows only, amounts as piastres.
export const sentBanks = (rows: Bank[]) => rows.flatMap((r) => (r.bankAccountId && String(r.amount ?? "").trim() !== "" ? [{ bankAccountId: r.bankAccountId, amount: typedPiastres(String(r.amount).trim()) }] : []));

// The backend counts only the filled rows: its "bankPayments.N.x" is the Nth filled row of the form.
export function formRowOfRefusal(rows: Bank[], n: number) {
  const filled = rows.flatMap((r, i): number[] => (r.bankAccountId ? [i] : []));
  return filled[n] ?? 0;
}
