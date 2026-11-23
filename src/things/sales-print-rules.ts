// The pure rules of the custom print dialog (owner, 2026-11-23): which pieces of an invoice go on the printed copy.

/** What the print asks the backend for: null when no piece is chosen (nothing to print), undefined when every piece is (the whole invoice), else the chosen line numbers in invoice order. */
export function printLines(all: readonly number[], chosen: ReadonlySet<number>): number[] | undefined | null {
  const picked = all.filter((n) => chosen.has(n));
  if (picked.length === 0) return null;
  return picked.length === all.length ? undefined : picked;
}

/** One piece ticked or unticked. */
export function toggled(chosen: ReadonlySet<number>, n: number): Set<number> {
  const next = new Set(chosen);
  if (next.has(n)) next.delete(n); else next.add(n);
  return next;
}
