"use client";
// Small helpers the stocktake pages share (Branch stock, Stock count).
import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Column, Option, Row } from "@/lib/engine-types";
import { rowsOf } from "@/lib/fields";
import type { Tr } from "@/lib/t";
import { Td } from "@/components/ui";
import { cellNode } from "@/components/engine";

import { code6 as code6 } from "@/lib/code6";
export { code6 };
export const nameOf = (path: string, id: string | null | undefined, key: string): Promise<string> => (id ? api(`${path}/${id}`).then((r) => r[key] as string).catch(() => "") : Promise.resolve(""));
export const KARATS = ["24", "21", "18", "999"];     // the order the design draws the karat columns

// The pick lists. The lists page at 20 and refuse the lookup's `limit` param (categories, items answer 400), so every page is read here with `page` only.
export async function allPages(path: string, query: Record<string, string> = {}): Promise<Row[]> {
  const out: Row[] = [];
  for (let page = 1; page <= 100; page++) {
    const r = await api(path, { query: { ...query, page } });
    const got = rowsOf(r);
    out.push(...got);
    if (!got.length || out.length >= (r?.total ?? got.length)) break;
  }
  return out;
}
const NO_OPTIONS: Option[] = [];
export function useOptions(path: string, label: string, query?: Record<string, string>): Option[] {
  const q = useQuery({ queryKey: ["stocktake-options", path, query], staleTime: 5 * 60_000, queryFn: () => allPages(path, query).then((rows) => rows.map((r) => [r.id, String(r[label])] as Option)) });
  return q.data ?? NO_OPTIONS;
}
export type Lists = { branches: Option[]; categories: Option[]; items: Option[] };
export function useLists(): Lists {
  const branches = useOptions("/branches", "branchName"), categories = useOptions("/categories", "categoryName"), items = useOptions("/items", "itemName");
  return useMemo(() => ({ branches, categories, items }), [branches, categories, items]);
}

export type GoldTreasury = { id: string; kind: string; treasuryName: string; branchName?: string };
/** /treasuries answers the whole list and takes no filter: the reports ask for gold treasuries only, so the list is read here. */
export function useGoldTreasuries(): GoldTreasury[] {
  const q = useQuery({ queryKey: ["gold-treasuries"], staleTime: 5 * 60_000, queryFn: () => api("/treasuries").then((r) => ((r?.items ?? []) as GoldTreasury[]).filter((x) => x.kind === "gold")).catch(() => [] as GoldTreasury[]) });
  return q.data ?? NONE;
}
const NONE: GoldTreasury[] = [];

/** A totals row: `map` gives, per column key, a raw value typed as the column (or { node }); the first cell without a value names the row. */
export function footerOf(cols: Column[], name: string, map: Record<string, unknown>, tr: Tr): ReactNode {
  return cols.map((c, i) => {
    const v = map[c.key];
    const num = ["money", "weight", "int"].includes(c.type ?? "");
    const cell = v === undefined ? "" : v && typeof v === "object" && "node" in v ? (v as { node: ReactNode }).node : cellNode({ key: "v", type: c.type }, { v }, tr);
    return <Td key={c.key} num={num}>{i === 0 && v === undefined ? name : cell}</Td>;
  });
}
