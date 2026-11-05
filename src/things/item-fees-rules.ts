// The pure rules of the Workmanship and cashback bulk screen: which items it lists, what an edit changes, the bulk "set this value",
// the payload of PATCH /items/fees and how a refusal maps back to rows. No React here, so Vitest runs it as it is.
// Fees are exact decimals (text with two decimals, hundredths as BigInt): never a float. A typed value follows the item form's rule (typedHundredths).
import { code6 } from "@/lib/code6";
import { matchesText } from "@/lib/search";
import { typedHundredths, valueText } from "./item-math";

export type Field = "workmanship" | "cashback";
export const FIELDS: Field[] = ["workmanship", "cashback"];
export const MAX_CHANGES = 500;       // the backend's limit for one save (invalidFields above it)
export const CONFIRM_ABOVE = 20;      // more rows than this ask first

/** An item as GET /items gives it (the fields this screen reads). */
export type FeeItem = {
  id: string; itemCode: number; itemName: string; categoryId: string; categoryName: string; karat: string; weight: number | null;
  workmanshipValue: string | null; cashbackValue: string | null; isActive: boolean; deletedAt: string | null;
};
/** One line of the table: the saved fees as two-decimal text. */
export type FeeRow = { id: string; itemCode: number; itemName: string; categoryId: string; categoryName: string; karat: string; weight: number; workmanship: string; cashback: string };
/** What was typed, per item and field; an entry exists only while it differs from the saved text. */
export type Edits = Record<string, Partial<Record<Field, string>>>;
export type FeeChange = { id: string; workmanshipValue: string; cashbackValue: string };
export type Filters = { q: string; categoryId: string; karat: string };

const two = (v: string) => valueText(typedHundredths(v)!);

/** Every active, complete item: it has a weight and both fees (an older item without them is edited on the Items screen first). */
export function toRows(items: FeeItem[]): FeeRow[] {
  return items
    .filter((i) => i.isActive && !i.deletedAt && i.weight != null && i.workmanshipValue != null && i.cashbackValue != null && typedHundredths(i.workmanshipValue) !== undefined && typedHundredths(i.cashbackValue) !== undefined)
    .map((i) => ({ id: i.id, itemCode: i.itemCode, itemName: i.itemName, categoryId: i.categoryId, categoryName: i.categoryName, karat: i.karat, weight: i.weight!, workmanship: two(i.workmanshipValue!), cashback: two(i.cashbackValue!) }));
}

export function filterRows(rows: FeeRow[], f: Filters): FeeRow[] {
  return rows.filter((r) => (!f.categoryId || r.categoryId === f.categoryId) && (!f.karat || r.karat === f.karat) && (!f.q.trim() || matchesText(f.q, r.itemName, code6(r.itemCode), r.categoryName)));
}

/** The text a cell shows: what was typed, else the saved value. */
export const shown = (row: FeeRow, edits: Edits, f: Field): string => edits[row.id]?.[f] ?? row[f];

/** same = nothing typed or typed the saved value; invalid = cannot be saved (empty, negative, letters, 3 decimals); changed = a different value. */
export function cellState(row: FeeRow, edits: Edits, f: Field): "same" | "changed" | "invalid" {
  const typed = edits[row.id]?.[f];
  if (typed === undefined) return "same";
  const h = typedHundredths(typed);
  if (h === undefined) return "invalid";
  return h === typedHundredths(row[f]) ? "same" : "changed";
}
export const rowState = (row: FeeRow, edits: Edits): "same" | "changed" | "invalid" => {
  const s = FIELDS.map((f) => cellState(row, edits, f));
  return s.includes("invalid") ? "invalid" : s.includes("changed") ? "changed" : "same";
};

/** One typed value for one cell; typing the saved text again drops the entry. */
export function setEdit(edits: Edits, row: FeeRow, f: Field, typed: string): Edits {
  const next = { ...edits };
  const entry = { ...next[row.id] };
  if (typed === row[f]) delete entry[f]; else entry[f] = typed;
  if (Object.keys(entry).length) next[row.id] = entry; else delete next[row.id];
  return next;
}

/** The bulk action: one value for one field on the given (filtered) rows. A value that is not valid changes nothing. */
export function applyBulk(edits: Edits, rows: FeeRow[], f: Field, typed: string): Edits {
  const h = typedHundredths(typed);
  if (h === undefined) return edits;
  return rows.reduce((acc, r) => setEdit(acc, r, f, valueText(h)), edits);
}

/** The rows that really change, as the API takes them: both values of the row, two decimals. */
export function changesOf(rows: FeeRow[], edits: Edits): FeeChange[] {
  return rows.filter((r) => rowState(r, edits) === "changed").map((r) => ({ id: r.id, workmanshipValue: two(shown(r, edits, "workmanship")), cashbackValue: two(shown(r, edits, "cashback")) }));
}
export const invalidCount = (rows: FeeRow[], edits: Edits) => rows.filter((r) => rowState(r, edits) === "invalid").length;

/** The save's answer to a refusal: `fields` as [{field:"changes.2.workmanshipValue", message}] (or an object of the same), mapped to the item sent at that index. */
export type Refusal = { id: string; itemName: string; field: Field | null; message: string };
export function refusals(error: { fields?: unknown } | undefined, sent: FeeChange[], rows: FeeRow[]): Refusal[] {
  const f = error?.fields;
  const list: { field: string; message: string }[] = Array.isArray(f)
    ? f.map((x: any) => ({ field: String(x.field ?? x.name ?? ""), message: String(x.message ?? x.key ?? "") }))
    : f && typeof f === "object" ? Object.entries<any>(f).map(([field, v]) => ({ field, message: typeof v === "string" ? v : String(v?.message ?? "") })) : [];
  return list.flatMap((x) => {
    const m = /^changes\.(\d+)\.(id|workmanshipValue|cashbackValue)$/.exec(x.field);
    const change = m ? sent[Number(m[1])] : undefined;
    if (!m || !change) return [];
    return [{ id: change.id, itemName: rows.find((r) => r.id === change.id)?.itemName ?? change.id, field: m[2] === "workmanshipValue" ? "workmanship" : m[2] === "cashbackValue" ? "cashback" : null, message: x.message }];
  });
}
