// Completing a Buy draft when some of its pieces are ones we sold before (owner, 2026-11-26): one row per piece of the draft, what each of ours is paid
// back, and whether a looked-up code can stand for a row. The backend holds the same rules (sales-drafts/domain/buy-completion.ts).
export type BuyLine = { lineNumber: number; itemName: string; karat: string; quantity: number; linePrice: number; cashDiscount?: number };
export type PieceRow = { key: string; lineNumber: number; itemName: string; karat: string; number: number; of: number };

export const pieceRows = (lines: readonly BuyLine[]): PieceRow[] =>
  lines.flatMap((l) => Array.from({ length: Number(l.quantity) }, (_, i) => ({ key: `${l.lineNumber}-${i + 1}`, lineNumber: l.lineNumber, itemName: l.itemName, karat: l.karat, number: i + 1, of: Number(l.quantity) })));

/** What is paid back for the pieces of ours and what is paid for the new ones: a returned piece takes its share of its line's price (the lower shares first,
 *  when the price does not divide), the new pieces keep the rest, so the two are always the draft's total. */
export function splitAmounts(lines: readonly BuyLine[], ours: readonly { lineNumber: number }[]): { returned: number; bought: number; newQuantities: number[] } {
  let returned = 0, total = 0;
  const newQuantities = lines.map((l) => {
    const price = Number(l.linePrice) - Number(l.cashDiscount ?? 0), count = Number(l.quantity);
    const mine = Math.min(count, ours.filter((o) => o.lineNumber === l.lineNumber).length);
    const low = Math.floor(price / count), lows = count - (price % count);
    returned += low * mine + Math.max(0, mine - lows);
    total += price;
    return count - mine;
  });
  return { returned, bought: total - returned, newQuantities };
}

export type LookedUp = { kind?: string; sold?: boolean; itemName?: string; karat?: string; branchName?: string; sales?: { kind: string; deleted?: boolean; documentNumber: number; customerName?: string | null }[] } | null;
export type OldPieceProblem = "notFound" | "notSold" | "otherBranch" | "mismatch";

/** Why a looked-up piece cannot stand for a row of the draft, or null when it can: it must be a sold piece of the draft's branch, of the row's item and karat. */
export function oldPieceProblem(found: LookedUp, row: { itemName: string; karat: string }, branchName: string): OldPieceProblem | null {
  if (!found || found.kind !== "piece") return "notFound";
  if (!found.sold) return "notSold";
  if (found.branchName !== branchName) return "otherBranch";
  return found.itemName === row.itemName && found.karat === row.karat ? null : "mismatch";
}

/** The sale the piece is on now: the newest invoice that is not deleted (the history comes newest first). */
export const saleOf = (found: LookedUp) => found?.sales?.find((s) => s.kind === "sale" && !s.deleted) ?? null;
