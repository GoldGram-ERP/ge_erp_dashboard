// Price helpers for the Gold prices form. Money is whole piastres (integers); a fraction exists only as text, never a float.
import { piastresInput, typedPiastres } from "./format";

/** Typed amount +/- a step in piastres, as typed text with two decimals ("4050.00" + 500 -> "4055.00"). Empty counts as 0; never below 0; unreadable text stays as it is. */
export function stepAmount(typed: unknown, deltaPiastres: number): string {
  const text = String(typed ?? "").trim();
  const p = text === "" ? 0 : typedPiastres(text);
  if (p === undefined) return text;
  return piastresInput(Math.max(0, p + deltaPiastres));
}

/** The fields a new price set starts with: the last saved set's values, only for fields still empty (a person who already typed keeps what they typed). */
export function prefillFromLatest(latest: Record<string, unknown> | null | undefined, current: Record<string, unknown>, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!latest) return out;
  for (const n of names) {
    const v = latest[n];
    if (v === null || v === undefined || v === "" || String(current[n] ?? "").trim() !== "") continue;
    out[n] = piastresInput(v);
  }
  return out;
}
