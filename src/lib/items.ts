// The item pickers' shared part (issue #34): one loader for the items, and the pure rules that turn an item into a row of the
// picker (its label, its second line, its search text, its colour when the Sales desk knows the stock) and filter by brand.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Option, OptionMeta, Row } from "@/lib/engine-types";
import { code6 } from "@/lib/code6";

// Every row of a paged list (the backend gives 20 at a time).
async function allPages(path: string, query: Record<string, unknown> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await api(path, { query: { ...query, page } });
    const rows: Row[] = r?.items ?? [];
    out.push(...rows);
    if (!rows.length || out.length >= (r?.total ?? 0)) break;
  }
  return out;
}

export const ITEMS_KEY = ["gold-accounts", "items-all"];
/** Every live item (the registry's list, paged whole), read once and kept for a minute. */
export function useItems(query: Record<string, unknown> = {}, enabled = true) {
  const q = useQuery({ queryKey: [...ITEMS_KEY, query], queryFn: () => allPages("/items", query), staleTime: 60_000, enabled });
  return { items: q.data, failed: q.isError };
}

/** What the Sales desk knows of the stock in its branch: pieces per item. Absent: the desk has not heard, so nothing is blocked. */
export type StockMap = ReadonlyMap<string, number>;
export const stockMapOf = (answer: { items?: { itemId: string; count: number }[] } | null | undefined): StockMap | undefined =>
  answer?.items ? new Map(answer.items.map((r) => [r.itemId, r.count])) : undefined;

/** An item with stock is green, one without is red; with no stock map there is no colour at all. */
export const stockTone = (stock: StockMap | undefined, itemId: string): "good" | "bad" | undefined =>
  stock === undefined ? undefined : (stock.get(itemId) ?? 0) > 0 ? "good" : "bad";

/** The text a search matches: the code, the name, the nickname, the karat, the group and the brand. */
export const itemSearchText = (it: Row): string =>
  [it.itemCode, code6(it.itemCode), it.itemName, it.nickname, it.karat, it.categoryName, it.brandName].filter((x) => x !== null && x !== undefined && x !== "").join(" ");

/** The second line of a row: code, group, brand. */
export const itemSubText = (it: Row): string =>
  [code6(it.itemCode), it.categoryName, it.brandName].filter((x) => x !== null && x !== undefined && x !== "").join(" · ");

/** An item the Items form switched to "no stock" by hand (owner, 2026-11-22). Only an explicit false: an item without the field is on. */
export const switchedOff = (it: Row): boolean => it.stockAvailable === false;

/** The pieces left are shown only when they are few: 1 to 3 (owner, 2026-11-22). More, or none, show no number. */
export const LOW_STOCK_MAX = 3;
export const lowStockOf = (count: number): number | null => (count >= 1 && count <= LOW_STOCK_MAX ? count : null);

/**
 * One option of the picker. With a stock map (the Sales desk) an item that has pieces and is switched on is green; any other is red.
 * A sale cannot pick a red one; a buy can pick any item and shows no colour at all (owner, 2026-11-22). Few pieces left (1 to 3) are named under the item.
 */
export function itemOption(it: Row, o: { stock?: StockMap; label?: (it: Row) => string; mode?: "sell" | "buy"; left?: (count: number) => string } = {}): Option {
  const id = String(it.id);
  const count = o.stock?.get(id) ?? 0;
  const tone = o.stock === undefined || o.mode === "buy" ? undefined : count > 0 && !switchedOff(it) ? "good" : "bad";
  const few = o.stock !== undefined && !switchedOff(it) ? lowStockOf(count) : null;
  const sub = [itemSubText(it), few !== null && o.left ? o.left(few) : ""].filter(Boolean).join(" · ");
  const meta: OptionMeta = { sub, search: itemSearchText(it), group: it.brandId ?? "", ...(tone ? { tone } : {}) };
  return [it.id, o.label ? o.label(it) : `${it.itemName} · ${it.karat ?? ""}`, tone === "bad" && o.mode !== "buy", meta];
}

/** The brands that the items carry, once each, by name: what the brand filter offers. */
export function brandsOf(items: readonly Row[]): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const it of items) if (it.brandId && !seen.has(it.brandId)) seen.set(String(it.brandId), String(it.brandName ?? ""));
  return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

/** The options of one brand (all when none is chosen). The picked option always stays, so the box can still name it. */
export function inBrand(options: Option[], brandId: string, keep = ""): Option[] {
  return brandId ? options.filter((o) => String(o[0]) === keep || o[3]?.group === brandId) : options;
}
