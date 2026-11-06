"use client";
import { Fragment, type ReactNode } from "react";
import { dateText, dateTimeText, intText, milligramsText, piastresText } from "@/lib/format";
import type { Column, Row, ViewConfig } from "@/lib/engine-types";
import type { ViewState } from "@/lib/fields";
import { useT, type Tr } from "@/lib/t";
import { DataTable, Td, Tr as TableRow } from "@/components/ui/DataTable";
import { kindOfType, nextDir, sortRows } from "@/lib/sort";

const isNum = (c: Pick<Column, "type">) => c.type === "money" || c.type === "weight" || c.type === "int";
const TONES = ["good", "warn", "info", "off"];

/** The content of one cell, by column type (money in piastres, weight in milligrams). */
export function cellNode(col: Pick<Column, "key" | "type" | "get" | "render" | "statuses">, row: Row, tr: Pick<Tr, "L">): ReactNode {
  const v = col.get ? col.get(row) : row[col.key];
  if (col.render) return col.render(row, v);
  if (v === null || v === undefined || v === "") return "";
  switch (col.type) {
    case "money": return piastresText(Number(v));
    case "weight": return milligramsText(Number(v));
    case "int": return intText(v);
    case "date": return dateText(v);
    case "datetime": return dateTimeText(v);
    case "bool": return v ? tr.L("نعم", "Yes") : tr.L("لا", "No");
    case "status": {
      const s = col.statuses?.[String(v)];
      const [label, tone] = Array.isArray(s) ? s : [s ?? String(v), "off"];
      return <span className={`st ${TONES.includes(tone) ? tone : "off"}`}><i />{label}</span>;
    }
    default: return String(v);
  }
}
const sumText = (type: "money" | "weight" | "int", n: number) => (type === "weight" ? milligramsText(n) : type === "int" ? intText(n) : piastresText(n));

/** How a column sorts: on the server through the view's sort param, in the browser when the whole list is loaded, or not at all (a paged list whose backend takes no sort for it). */
export const sortKeyOf = (view: ViewConfig, c: Column, whole: boolean): string | null => {
  if (c.sortable === false && !c.sortKey) return null;
  if (view.sort) return c.sortKey ?? c.key;
  return whole ? c.sortKey ?? c.key : null;   // a paged list with no sort param on its backend is sorted here only when its one page is the whole list
};
export const sortKeysOf = (view: ViewConfig) => view.columns.map((c) => sortKeyOf(view, c, true)).filter((k): k is string => !!k);

type Props = {
  view: ViewConfig; rows: Row[]; vs: ViewState; answer: unknown; unit: string; whole: boolean; selected?: string | null;
  onSort: (key: string, dir: "asc" | "desc") => void; onRow: (row: Row) => void; flashId?: string | null;
};

export function Table({ view, rows: given, vs, answer, unit, whole, selected, onSort, onRow, flashId }: Props) {
  const tr = useT();
  let rows = given;
  const cols = view.columns, key = view.rowKey ?? "id";
  const sortable = (c: Column) => sortKeyOf(view, c, whole);
  if (!view.sort && whole && vs.sort) {   // the whole list is here: sort it here
    const sc = cols.find((c) => c.key === vs.sort!.key);
    if (sc) rows = sortRows(rows, (r) => (sc.get ? sc.get(r) : r[sc.key]), kindOfType(sc.type), vs.sort.dir, tr.locale);
  }
  const g = vs.group !== "" ? view.groupBy?.[+vs.group] : null;
  const sumIdx = view.sum ? cols.findIndex((c) => c.key === view.sum!.key) : -1;

  const tableRow = (r: Row) => {
    const k = String(r[key]);
    const open = () => view.onRow !== false && onRow(r);
    return (
      <TableRow key={k} className={`row ${view.rowClass?.(r) ?? ""}${flashId === k ? " flash" : ""}`} tabIndex={view.onRow === false ? undefined : 0} data-k={k} aria-selected={selected === k}
        onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
        {cols.map((c, i) => <Td key={c.key} className={`${isNum(c) ? "num " : ""}${i === 0 ? "id " : ""}${c.className ?? ""}`.trim()}>{cellNode(c, r, tr)}</Td>)}
      </TableRow>
    );
  };

  let body: ReactNode;
  if (g) {
    const by = new Map<string, Row[]>();
    rows.forEach((r) => { const k = String(g.get ? g.get(r) : r[g.key!]); (by.get(k) ?? by.set(k, []).get(k)!).push(r); });
    body = [...by].map(([k, rs]) => (
      <Fragment key={k}>
        {sumIdx >= 0 ? (
          <TableRow className="grp"><Td colSpan={sumIdx}>{k}<span className="cnt">{intText(rs.length)} {unit}</span></Td><Td num>{sumText(view.sum!.type, rs.reduce((a, r) => a + Number(r[view.sum!.key] ?? 0), 0))}</Td><Td colSpan={cols.length - sumIdx - 1} /></TableRow>
        ) : <TableRow className="grp"><Td colSpan={cols.length}>{k}<span className="cnt">{intText(rs.length)} {unit}</span></Td></TableRow>}
        {rs.map(tableRow)}
      </Fragment>
    ));
  } else body = rows.map(tableRow);

  const head = cols.map((c) => {
    const sk = sortable(c), on = !!sk && vs.sort?.key === sk;
    return { label: c.label, num: isNum(c), ...(!sk ? { sortable: false as const } :  { sort: { kind: kindOfType(c.type), dir: on ? vs.sort!.dir : null, onSort: () => onSort(sk, nextDir(kindOfType(c.type), on ? vs.sort!.dir : null)) } }) };
  });
  return (
    <DataTable bare head={head}>
      {body}
      {view.footer && <TableRow className="foot">{view.footer(rows, answer)}</TableRow>}
    </DataTable>
  );
}
