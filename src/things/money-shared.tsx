"use client";
// Shared bits of the money pages (cash, treasuries, transfers): number format, gold lines, the totals row, the branch look-up.
// Ported from docs/nav-preview/app/things/treasuries-parts.js. Read only: nothing here writes.
import type { ReactNode } from "react";
import { useMemo } from "react";
import type { Column, LookupSpec, Row } from "@/lib/engine-types";
import { milligramsText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Td } from "@/components/ui";
import { useMe } from "@/lib/session";

import { code6 } from "@/lib/code6";
export { code6 };
export const KIND_TONE: Record<string, "good" | "warn" | "off"> = { egp: "good", gold: "warn", secondary: "off" };
// The branch filter: the branch list accepts page + limit.
export const branchSpec: LookupSpec = { path: "/branches", value: "id", label: "branchName" };

/** Pieces of the dictionary every money page reads. */
export const dict = (tr: Tr) => ({
  rep: (k: string, v?: Record<string, string>) => tr.t("common", `report.${k}`, v),
  tr: (k: string, v?: Record<string, string>) => tr.t("treasury-reports", k, v),
  kindText: (kind: string) => tr.t("treasury-reports", `kinds.${kind}`),
});

const NEG = { color: "#b42318" };
/** A money cell that turns red below zero. */
export const moneyNode = (piastres: number, text: string): ReactNode => (piastres < 0 ? <span style={NEG}>{text}</span> : text);

const stack = { display: "inline-flex", flexDirection: "column" } as const;
/** Lines of one karat each, one under the other, left-to-right. A dash when there are none. */
export function lines(items: ReactNode[]): ReactNode {
  return items.length === 0 ? "—" : <span dir="ltr" style={stack}>{items.map((x, i) => <span key={i}>{x}</span>)}</span>;
}
/** Gold per karat, one karat a line ("21K 12.345"). items: [{karat, weightMg}]. */
export const goldNode = (items: Row[] = []): ReactNode => lines(items.map((l) => `${l.karat}K ${milligramsText(l.weightMg)}`));

/** Totals row under a table: `cells` gives the ready text of the columns that add up; the first cell names the row. */
export function foot(cols: Column[], name: string, cells: Record<string, ReactNode>): ReactNode {
  return cols.map((c, i) => (
    <Td key={c.key} num={["money", "weight", "int"].includes(c.type ?? "") || c.className === "num"}>{i === 0 ? name : (cells[c.key] ?? "")}</Td>
  ));
}

/** Whether the signed-in person is the Super admin (the "deleted only" boxes are drawn for them alone). */
export function useIsSuper(): boolean {
  const { data: me } = useMe();
  return me?.userType === "super_admin";
}
export function useMakeConfig(build: (tr: Tr, isSuper: boolean) => import("@/lib/engine-types").ThingConfig) {
  const isSuper = useIsSuper();
  return useMemo(() => (tr: Tr) => build(tr, isSuper), [build, isSuper]);
}
