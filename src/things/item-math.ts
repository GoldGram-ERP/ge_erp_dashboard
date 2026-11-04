// The Items form's example box: what one piece costs today with the typed workmanship or cashback.
// Exact, in BigInt piastres; every step half up to the piastre, as the backend's sales rules do
// (gold-sales/sales-invoices/domain/sales-invoice.ts: pricePerGramOf, goldValueOf).
import { latinNumber, typedMilligrams, typedPiastres } from "@/lib/format";

const B = BigInt;   // the build targets ES2017: no 1n literals

export type ChargeMode = "per_gram" | "percent" | "per_piece";
export const CHARGE_MODES: ChargeMode[] = ["per_gram", "percent", "per_piece"];
export type PriceSet = { sellPrice: number; silverPrice: number | null };

// A setting's value as typed: up to two decimals, Arabic digits accepted. "4.5" -> 450 (hundredths).
const VALUE = /^\d{1,10}(\.\d{1,2})?$/;
export function typedHundredths(typed: unknown): bigint | undefined {
  const s = latinNumber(typed);
  return VALUE.test(s) ? BigInt(typedPiastres(s)!) : undefined;
}
// The value as the API takes it: a two-decimal string.
export const valueText = (h: bigint) => `${h / B(100)}.${String(h % B(100)).padStart(2, "0")}`;

// One gram of a karat today: 21 is the saved price, 18 and 24 are x karat / 21 half up, 999 is the silver price.
export function pricePerGram(price: PriceSet, karat: string): bigint | null {
  if (karat === "999") return price.silverPrice == null ? null : BigInt(price.silverPrice);
  if (!["18", "21", "24"].includes(karat)) return null;
  return (B(2) * BigInt(price.sellPrice) * BigInt(karat) + B(21)) / B(42);
}

// gold = price per gram x weight; per_gram: W x weight; percent: gold x W / 100; per_piece: W. All piastres.
export function onePiece(perGram: bigint, weightMg: bigint, mode: ChargeMode, value: bigint): { gold: bigint; charge: bigint; total: bigint } {
  const gold = (perGram * weightMg + B(500)) / B(1000);
  const charge = mode === "per_gram" ? (value * weightMg + B(500)) / B(1000)
    : mode === "percent" ? (gold * value + B(5000)) / B(10000)
    : value;
  return { gold, charge, total: gold + charge };
}

// Everything the box needs from the typed form, or why it cannot show a number yet.
export type Example = { ok: true; gold: bigint; charge: bigint; total: bigint } | { ok: false; why: "noPrice" | "fill" };
export function exampleOf(price: PriceSet | null | undefined, form: { karat?: unknown; weight?: unknown; mode?: unknown; value?: unknown }): Example {
  const weight = typedMilligrams(form.weight), value = typedHundredths(form.value), mode = form.mode as ChargeMode;
  if (!form.karat || weight === undefined || value === undefined || !CHARGE_MODES.includes(mode)) return { ok: false, why: "fill" };
  const perGram = price ? pricePerGram(price, String(form.karat)) : null;
  if (perGram === null) return { ok: false, why: "noPrice" };
  return { ok: true, ...onePiece(perGram, BigInt(weight), mode, value) };
}
