// Pure rules of the purchase invoice form and of purchase coding (port of gold-purchases-lines.js): no DOM, no network, exact integers only.
import { latinNumber, milligramsInput, typedMilligrams, typedPiastres } from "@/lib/format";

export const QUANTITY_MAX = 100_000;
export const LINES_MAX = 200;
export const MAX_MILLIGRAMS = 9_999_999_999_999;
export const MAX_PIASTRES = 9_999_999_999_999;

export type InvoiceLine = { itemId: string; quantity: string; weight: string };
export type PieceBox = { weight: string; makingChargePerGram: string };
export type CodingLine = { lineId: string; weight: number; pieces: PieceBox[] };

export function readQuantity(text: string): number | undefined {
  const d = latinNumber(text);
  const n = /^\d{1,6}$/.test(d) ? Number(d) : 0;
  return n >= 1 && n <= QUANTITY_MAX ? n : undefined;
}
/** "" -> null (optional on the invoice); not acceptable -> undefined. */
export function readWeight(text: string): number | null | undefined {
  const s = String(text ?? "").trim();
  if (s === "") return null;
  const v = typedMilligrams(s);
  return v !== undefined && v > 0 && v <= MAX_MILLIGRAMS ? v : undefined;
}
export function readDay(text: string): string | undefined {
  const s = String(text ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? undefined : s;
}

/** errors: { date?, lines?, "lines.N.itemId|quantity|weight": "required"|"invalid" } */
export function readInvoice(form: { date: string; lines: InvoiceLine[] }) {
  const errors: Record<string, string> = {};
  const date = readDay(form.date);
  if (!String(form.date ?? "").trim()) errors.date = "required"; else if (!date) errors.date = "invalid";
  if (form.lines.length < 1) errors.lines = "required";
  if (form.lines.length > LINES_MAX) errors.lines = "invalid";
  const lines = form.lines.map((l, i) => {
    if (!l.itemId) errors[`lines.${i}.itemId`] = "required";
    const quantity = readQuantity(l.quantity);
    if (String(l.quantity ?? "").trim() === "") errors[`lines.${i}.quantity`] = "required"; else if (quantity === undefined) errors[`lines.${i}.quantity`] = "invalid";
    const weight = readWeight(l.weight);
    if (weight === undefined) errors[`lines.${i}.weight`] = "invalid";
    return { itemId: l.itemId, quantity, ...(weight ? { weight } : {}) };   // an empty weight is left out: the backend then uses the item's standard weight
  });
  return Object.keys(errors).length ? { errors } : { errors, payload: { date, lines } };
}

export function totalsOf(lines: Pick<InvoiceLine, "quantity" | "weight">[]) {
  let quantity = 0, weight = 0, weightMissing = 0;
  for (const l of lines) {
    const q = readQuantity(l.quantity);
    if (q !== undefined) quantity += q;
    const w = readWeight(l.weight);
    if (typeof w === "number") weight += w; else if (w === null) weightMissing++;
  }
  return { quantity, weight, weightMissing };
}

// ───── purchase coding ─────
export const readPieceWeight = (text: string) => { const v = typedMilligrams(String(text ?? "").trim()); return v !== undefined && v > 0 && v <= MAX_MILLIGRAMS ? v : undefined; };
export const readMaking = (text: string) => { const v = typedPiastres(String(text ?? "").trim()); return v !== undefined && v > 0 && v <= MAX_PIASTRES ? v : undefined; };

export function remainingOf(lineWeight: number, weightTexts: string[]) {
  const ws = weightTexts.map(readPieceWeight);
  return { remaining: lineWeight - ws.reduce<number>((s, w) => s + (w ?? 0), 0), complete: ws.every((w) => w !== undefined) };
}
/** When exactly one box of a line is still not typed by hand, it holds what remains (if more than zero). */
export function autoRemainder(lineWeight: number, pieces: { weight: string; typed: boolean }[]) {
  const open = pieces.flatMap((p, i) => (p.typed ? [] : [i]));
  if (open.length !== 1) return null;
  const { remaining } = remainingOf(lineWeight, pieces.map((p, i) => (i === open[0] ? "" : p.weight)));
  return { index: open[0], text: remaining > 0 ? milligramsInput(remaining) : "" };
}
/** -> { payload } | { errors: { "lines.I.pieces.J.weight|makingChargePerGram": key }, off: [line indexes whose weights do not add up] } */
export function readCoding(lines: CodingLine[]) {
  const errors: Record<string, string> = {}, off: number[] = [];
  const out = lines.map((l, i) => {
    const pieces = l.pieces.map((p, j) => {
      const weight = readPieceWeight(p.weight), making = readMaking(p.makingChargePerGram);
      if (weight === undefined) errors[`lines.${i}.pieces.${j}.weight`] = String(p.weight ?? "").trim() === "" ? "required" : "invalid";
      if (making === undefined) errors[`lines.${i}.pieces.${j}.makingChargePerGram`] = String(p.makingChargePerGram ?? "").trim() === "" ? "required" : "invalid";
      return { weight, makingChargePerGram: making };
    });
    if (pieces.every((p) => p.weight !== undefined) && pieces.reduce((s, p) => s + p.weight!, 0) !== l.weight) off.push(i);
    return { lineId: l.lineId, pieces };
  });
  return Object.keys(errors).length || off.length ? { errors, off } : { payload: { lines: out }, errors, off };
}
