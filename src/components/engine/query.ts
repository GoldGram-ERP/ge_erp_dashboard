// The address of a thing page is its single source of truth: ?view=<viewId> &new=<formId> &open=<recordId> and every other key
// (q, chip, a filter's name) prefills the view. Other keys (e.g. reservation=<id>) stay while the create form is open and are read by it.
export type DeepLink = { view?: string; newForm?: string; open?: string; query: Record<string, string> };
const RESERVED = new Set(["view", "new", "open"]);

export function parseDeepLink(search: string): DeepLink {
  const p = new URLSearchParams(search);
  const query: Record<string, string> = {};
  p.forEach((v, k) => { if (!RESERVED.has(k) && v !== "") query[k] = v; });
  return { view: p.get("view") || undefined, newForm: p.get("new") || undefined, open: p.get("open") || undefined, query };
}

/** The address search string after a change: `replace` starts from nothing, otherwise from the current one; null/undefined removes a key. */
export function withParams(search: string, patch: Record<string, string | null | undefined>, replace = false): string {
  const p = new URLSearchParams(replace ? "" : search);
  for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined || v === "") p.delete(k); else p.set(k, v); }
  return p.toString();
}

/** Keeps only view and the keys that mean something to the view (q, chip, filter names); drops new, open and form-only extras. */
export function pruneParams(search: string, keep: string[]): string {
  const p = new URLSearchParams(search);
  for (const k of [...p.keys()]) if (k !== "view" && k !== "q" && k !== "chip" && !keep.includes(k)) p.delete(k);
  return p.toString();
}
