// Pure rules of the purchase invoice form (port of gold-purchases-lines.js): no DOM, no network, exact integers only.
// One source (owner, 2026-11-04): weight and workmanship are typed on the Items screen only. A line's weight is the item weight x the count.
import { latinNumber } from "@/lib/format";

export const QUANTITY_MAX = 100_000;
export const LINES_MAX = 200;

export type InvoiceLine = { itemId: string; quantity: string; itemWeight: number | null };
export type ItemFacts = { isActive?: boolean; weight?: number | null; workmanshipValue?: string | null; cashbackValue?: string | null };

export function readQuantity(text: string): number | undefined {
  const d = latinNumber(text);
  const n = /^\d{1,6}$/.test(d) ? Number(d) : 0;
  return n >= 1 && n <= QUANTITY_MAX ? n : undefined;
}
export function readDay(text: string): string | undefined {
  const s = String(text ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : s;
}

/** Why an item cannot go on a purchase line or be coded (the backend's words), or null when it can. */
export function itemProblem(item: ItemFacts): "inactive" | "incomplete" | null {
  if (item.isActive === false) return "inactive";
  const empty = (v: unknown) => v === null || v === undefined || v === "";
  return empty(item.weight) || Number(item.weight) <= 0 || empty(item.workmanshipValue) || empty(item.cashbackValue) ? "incomplete" : null;
}

/** The line weight in whole milligrams: the item weight x the count; undefined until both are known. */
export function lineWeightOf(itemWeight: number | null | undefined, quantity: string): number | undefined {
  const q = readQuantity(quantity);
  if (!itemWeight || itemWeight <= 0 || q === undefined) return undefined;
  const w = itemWeight * q;
  return Number.isSafeInteger(w) ? w : undefined;   // shortcut: past 9e15 mg (9,000 tonnes) the box stays empty and the backend's total stands; BigInt if that ever matters
}

/** errors: { date?, lines?, "lines.N.itemId|quantity": "required"|"invalid" }. The weight is never sent: the backend works it out. */
export function readInvoice(form: { date: string; lines: Pick<InvoiceLine, "itemId" | "quantity">[] }) {
  const errors: Record<string, string> = {};
  const date = readDay(form.date);
  if (!String(form.date ?? "").trim()) errors.date = "required"; else if (!date) errors.date = "invalid";
  if (form.lines.length < 1) errors.lines = "required";
  if (form.lines.length > LINES_MAX) errors.lines = "invalid";
  const lines = form.lines.map((l, i) => {
    if (!l.itemId) errors[`lines.${i}.itemId`] = "required";
    const quantity = readQuantity(l.quantity);
    if (String(l.quantity ?? "").trim() === "") errors[`lines.${i}.quantity`] = "required"; else if (quantity === undefined) errors[`lines.${i}.quantity`] = "invalid";
    return { itemId: l.itemId, quantity };
  });
  return Object.keys(errors).length ? { errors } : { errors, payload: { date, lines } };
}

export function totalsOf(lines: Pick<InvoiceLine, "quantity" | "itemWeight">[]) {
  let quantity = 0, weight = 0;
  for (const l of lines) {
    quantity += readQuantity(l.quantity) ?? 0;
    weight += lineWeightOf(l.itemWeight, l.quantity) ?? 0;
  }
  return { quantity, weight };
}
