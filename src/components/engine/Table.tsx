"use client";
import { Fragment, type ReactNode } from "react";
import { dateText, dateTimeText, intText, milligramsText, piastresText } from "@/lib/format";
import type { Column, Row, ViewConfig } from "@/lib/engine-types";
import type { ViewState } from "@/lib/fields";
import { useT, type Tr } from "@/lib/t";

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

type Props = {
  view: ViewConfig; rows: Row[]; vs: ViewState; answer: unknown; unit: string; selected?: string | null;
  onSort: (key: string) => void; onRow: (row: Row) => void; flashId?: string | null;
};

export function Table({ view, rows, vs, answer, unit, selected, onSort, onRow, flashId }: Props) {
  const tr = useT();
  const cols = view.columns, key = view.rowKey ?? "id";
  const sortable = (c: Column) => (view.sort ? (c.sortKey ?? (c.sortable === false ? null : c.key)) : null);
  const g = vs.group !== "" ? view.groupBy?.[+vs.group] : null;
  const sumIdx = view.sum ? cols.findIndex((c) => c.key === view.sum!.key) : -1;

  const tableRow = (r: Row) => {
    const k = String(r[key]);
    const open = () => view.onRow !== false && onRow(r);
    return (
      <tr key={k} className={`row ${view.rowClass?.(r) ?? ""}${flashId === k ? " flash" : ""}`} tabIndex={view.onRow === false ? undefined : 0} data-k={k} aria-selected={selected === k}
        onClick={open} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}>
        {cols.map((c, i) => <td key={c.key} className={`${isNum(c) ? "num " : ""}${i === 0 ? "id " : ""}${c.className ?? ""}`}>{cellNode(c, r, tr)}</td>)}
      </tr>
    );
  };

  let body: ReactNode;
  if (g) {
    const by = new Map<string, Row[]>();
    rows.forEach((r) => { const k = String(g.get ? g.get(r) : r[g.key!]); (by.get(k) ?? by.set(k, []).get(k)!).push(r); });
    body = [...by].map(([k, rs]) => (
      <Fragment key={k}>
        {sumIdx >= 0 ? (
          <tr className="grp"><td colSpan={sumIdx}>{k}<span className="cnt">{intText(rs.length)} {unit}</span></td><td className="num">{sumText(view.sum!.type, rs.reduce((a, r) => a + Number(r[view.sum!.key] ?? 0), 0))}</td><td colSpan={cols.length - sumIdx - 1} /></tr>
        ) : <tr className="grp"><td colSpan={cols.length}>{k}<span className="cnt">{intText(rs.length)} {unit}</span></td></tr>}
        {rs.map(tableRow)}
      </Fragment>
    ));
  } else body = rows.map(tableRow);

  return (
    <table>
      <thead>
        <tr>
          {cols.map((c) => {
            const sk = sortable(c), on = !!sk && vs.sort?.key === sk;
            return (
              <th key={c.key} className={isNum(c) ? "num" : undefined} data-sort={sk || undefined} aria-sort={on ? (vs.sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                tabIndex={sk ? 0 : undefined} onClick={sk ? () => onSort(sk) : undefined} onKeyDown={sk ? (e) => { if (e.key === "Enter") onSort(sk); } : undefined}>
                {c.label}{on && <span className="arr">{vs.sort!.dir === "asc" ? "▲" : "▼"}</span>}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {body}
        {view.footer && <tr className="foot">{view.footer(rows, answer)}</tr>}
      </tbody>
    </table>
  );
}
