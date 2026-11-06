// The one sort rule for every table. Pure: no React, no DOM.
// Kinds: number (money, weight, int; decimal strings stay exact), date (ISO text or Date), text (locale collation, digits by value).
// Empty values (null, undefined, "", "—") always come last, in both directions. The sort is stable: ties keep their order.
export type SortKind = "number" | "date" | "text";
export type SortDir = "asc" | "desc";

export const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || v === "—" || (typeof v === "number" && Number.isNaN(v));
/** The first tap: text A to Z, numbers and dates newest or biggest first. */
export const naturalDir = (kind: SortKind): SortDir => (kind === "text" ? "asc" : "desc");
export const kindOfType = (type?: string): SortKind => (type === "money" || type === "weight" || type === "int" || type === "number" ? "number" : type === "date" || type === "datetime" ? "date" : "text");
/** asc, then desc, then asc again; a column not yet sorted starts at its natural direction. */
export const nextDir = (kind: SortKind, current: SortDir | null): SortDir => (current === null ? naturalDir(kind) : current === "asc" ? "desc" : "asc");

// A decimal as an exact BigInt scaled by 10^9 (no float rounding for money or gold weight).
const SCALE = 9;
function exact(v: unknown): bigint | null {
  const s = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(SCALE) : "") : String(v).trim().replace(/,/g, "");
  const m = /^([+-])?(\d+)(?:\.(\d*))?$/.exec(s);
  if (!m) return null;
  const n = BigInt(m[2] + (m[3] ?? "").padEnd(SCALE, "0").slice(0, SCALE));
  return m[1] === "-" ? -n : n;
}
const cmpNum = (a: unknown, b: unknown) => { const x = exact(a), y = exact(b); return x === null || y === null ? (x === null ? (y === null ? 0 : 1) : -1) : x < y ? -1 : x > y ? 1 : 0; };
const time = (v: unknown) => (v instanceof Date ? v.getTime() : Date.parse(String(v)));
const cmpDate = (a: unknown, b: unknown) => { const x = time(a), y = time(b); return Number.isNaN(x) || Number.isNaN(y) ? (Number.isNaN(x) ? (Number.isNaN(y) ? 0 : 1) : -1) : x - y; };
const collators = new Map<string, Intl.Collator>();
const collator = (lang: string) => { let c = collators.get(lang); if (!c) collators.set(lang, (c = new Intl.Collator(lang, { numeric: true, sensitivity: "base" }))); return c; };

export function compareValues(kind: SortKind, a: unknown, b: unknown, lang = "ar"): number {
  return kind === "number" ? cmpNum(a, b) : kind === "date" ? cmpDate(a, b) : collator(lang).compare(String(a), String(b));
}

/** A sorted copy. `get` reads a row's value for the column. */
export function sortRows<T>(rows: readonly T[], get: (row: T) => unknown, kind: SortKind, dir: SortDir, lang = "ar"): T[] {
  const sign = dir === "asc" ? 1 : -1;
  return rows.map((row, i) => ({ row, i, v: get(row) })).sort((x, y) => {
    const ex = isEmpty(x.v), ey = isEmpty(y.v);
    if (ex || ey) return ex === ey ? x.i - y.i : ex ? 1 : -1;      // empties last whatever the direction
    return sign * compareValues(kind, x.v, y.v, lang) || x.i - y.i;
  }).map((x) => x.row);
}
