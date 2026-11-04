"use client";
// Small helpers the stocktake pages share (Branch stock, Stock count).
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Column } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { cellNode } from "@/components/engine";

export const code6 = (n: unknown) => String(n ?? "").padStart(6, "0");
export const nameOf = (path: string, id: string | null | undefined, key: string): Promise<string> => (id ? api(`${path}/${id}`).then((r) => r[key] as string).catch(() => "") : Promise.resolve(""));
export const KARATS = ["24", "21", "18", "999"];     // the order the design draws the karat columns

export const branchSpec = { path: "/branches", value: "id", label: "branchName" };
export const categorySpec = { path: "/categories", value: "id", label: "categoryName" };
export const itemSpec = { path: "/items", value: "id", label: "itemName" };

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
    return <td key={c.key} className={num ? "num" : ""}>{i === 0 && v === undefined ? name : cell}</td>;
  });
}
