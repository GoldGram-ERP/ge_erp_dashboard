// The Price board's pure rules (owner, 2026-11-22): what the comparison offers as the second item, and the numbers of its table.
// Money is whole piastres, weight whole milligrams, as the API sends them.
export type BoardItem = {
  id: string; itemCode: number; itemName: string; nickname: string | null; karat: string; weightMg: number;
  workmanshipPerGram: number; cashbackPerGram: number;
  goldValue: number | null; workmanship: number | null; cashback: number | null; total: number | null;
  stockCount: number; stockAvailable: boolean; sellable: boolean;
};
export type BoardBrand = { id: string; name: string; items: BoardItem[] };
export type BoardPrice = { date: string; sell21: number; buy21: number | null; sell24: number; buy24: number | null; silverSell: number | null; silverBuy: number | null };
export type Board = { price: BoardPrice | null; brands: BoardBrand[] };

export type Entry = BoardItem & { brandId: string; brandName: string };

/** Every item of the board, each with its brand. */
export const entriesOf = (brands: readonly BoardBrand[]): Entry[] => brands.flatMap((b) => b.items.map((i) => ({ ...i, brandId: b.id, brandName: b.name })));

/** The second item of the comparison: of another brand, with the same karat and the same weight as the first. No first item: none. */
export const compareCandidates = (all: readonly Entry[], first: Entry | undefined): Entry[] =>
  first ? all.filter((e) => e.brandId !== first.brandId && e.karat === first.karat && e.weightMg === first.weightMg) : [];

/** What the customer really pays: the total less the cashback. Null when there is no price. */
export const netOf = (e: Pick<BoardItem, "total" | "cashback">): number | null => (e.total === null || e.cashback === null ? null : e.total - e.cashback);

/** The second less the first: negative when the second is cheaper. Null when either is missing. */
export const differenceOf = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : b - a);

/** Which side wins a row: "a", "b", or null for a tie or a missing number. `lower` is better for prices, higher for cashback. */
export function winner(a: number | null, b: number | null, better: "lower" | "higher"): "a" | "b" | null {
  if (a === null || b === null || a === b) return null;
  return (better === "lower" ? a < b : a > b) ? "a" : "b";
}

/** The pieces of one item on the board: 1 to 99. */
export const COUNT_MAX = 99;
export const clampCount = (n: number): number => (Number.isFinite(n) ? Math.min(COUNT_MAX, Math.max(1, Math.trunc(n))) : 1);

/** A price for n pieces; no price stays no price. */
export const times = (value: number | null, n: number): number | null => (value === null ? null : value * clampCount(n));

/** A card selected or freed: added at the end of the selection, or removed. */
export const toggleId = (ids: readonly string[], id: string): string[] => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

/** One row of the selected list for n pieces: the price of one piece, and workmanship, cashback and total for all n. */
export type SelectedRow = { price: number | null; workmanship: number | null; cashback: number | null; total: number | null };
export const rowOf = (e: Pick<BoardItem, "total" | "workmanship" | "cashback">, n: number): SelectedRow => ({
  price: e.total, workmanship: times(e.workmanship, n), cashback: times(e.cashback, n), total: times(e.total, n),
});

/** The foot of the selected list. `incomplete` when some row has no price (no gold price today): then the sums would be wrong and the screen shows a dash. */
export function totalsOf(rows: readonly SelectedRow[]): { workmanship: number; cashback: number; total: number; goldValue: number; incomplete: boolean } {
  const sum = (pick: (r: SelectedRow) => number | null) => rows.reduce((s, r) => s + (pick(r) ?? 0), 0);
  return {
    workmanship: sum((r) => r.workmanship), cashback: sum((r) => r.cashback), total: sum((r) => r.total),
    // A piece's price already holds its workmanship, so the gold alone is the total less the workmanship (never total + workmanship).
    goldValue: sum((r) => r.total) - sum((r) => r.workmanship),
    incomplete: rows.some((r) => r.total === null || r.workmanship === null || r.cashback === null),
  };
}
