import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { TextButton } from "./Button";
import { nextDir, sortRows, type SortDir, type SortKind } from "@/lib/sort";

/** The one table shape: the rounded `.table` card, header row, one row style. A screen writes `<DataTable head={[...]}>` and rows of `<Tr><Td/></Tr>`; it never writes <table>, <th> or <td>. Numbers pass `num`. */
/** `sort` makes the header a button: `dir` is the column's current direction (null = not the sorted column), `onSort` is called on tap, Enter and Space. A header with `sortable: false` is a declared plain label (an actions, checkbox, image or input column); a header with neither is a dead title and the layout audit fails it. */
export type HeadSort = { dir: "asc" | "desc" | null; onSort: () => void; kind?: SortKind };
type Col = { label: ReactNode; num?: boolean; className?: string; colSpan?: number; ariaSort?: "ascending" | "descending" | "none"; sort?: HeadSort; sortable?: false };
export type Head = Col | ReactNode;
const isCol = (h: Head): h is Col => typeof h === "object" && h !== null && "label" in (h as object);

// 12 px arrow: quiet up/down pair while idle, one gold triangle when this column is the sorted one.
const Arrow = ({ dir }: { dir: "asc" | "desc" | null }) => (
  <svg className="sort-arrow" data-dir={dir ?? "idle"} width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
    {dir === null ? <path d="M6 1.5 9 5H3zM6 10.5 3 7h6z" fill="currentColor" /> : <path d={dir === "asc" ? "M6 2 10 8.5H2z" : "M6 10 2 3.5h8z"} fill="currentColor" />}
  </svg>
);

export function DataTable({ bare, fixedOrder, head, subHead, subHeadClassName, foot, bodyId, tableId, tableClassName, children, className = "", ...rest }: { bare?: boolean; /** Every header of this table is declared non-sortable (an editable line list, or rows whose order is the document's): say why at the call site. */ fixedOrder?: boolean; head: Head[]; subHead?: Head[]; subHeadClassName?: string; foot?: ReactNode; bodyId?: string; tableId?: string; tableClassName?: string; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const row = (hs: Head[], cls?: string) => (
    <tr className={cls}>{hs.map((h, i) => { const c = isCol(h) ? h : { label: h }; const cls = `${c.num ? "num" : ""}${c.className ? ` ${c.className}` : ""}`.trim() || undefined;
      if (!c.sort) return <th key={i} scope="col" colSpan={c.colSpan} aria-sort={c.ariaSort} data-sort={c.sortable === false || fixedOrder ? "off" : "dead"} className={cls}>{c.label}</th>;
      return <th key={i} scope="col" colSpan={c.colSpan} aria-sort={c.sort.dir === "asc" ? "ascending" : c.sort.dir === "desc" ? "descending" : "none"} data-sort="on" data-kind={c.sort.kind} className={cls}>
        <TextButton className="th-sort" onClick={c.sort.onSort}><span className="th-label">{c.label}</span><Arrow dir={c.sort.dir} /></TextButton>
      </th>; })}</tr>
  );
  const table = <table id={tableId} className={tableClassName}><thead>{row(head)}{subHead && row(subHead, subHeadClassName)}</thead><tbody id={bodyId}>{children}</tbody>{foot && <tfoot>{foot}</tfoot>}</table>;
  if (bare) return table;   // the engine's own card (loading, empty and error states) already surrounds it
  return (
    <div className={`table${className ? ` ${className}` : ""}`} {...rest}>
      {table}
    </div>
  );
}
export function Tr({ children, className = "", ...rest }: { children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLTableRowElement>, "children">) {
  // `row` (pointer and hover) only for a clickable row; a plain row keeps the plain look.
  return <tr className={`${rest.onClick ? "row" : ""}${className ? ` ${className}` : ""}`.trim() || undefined} {...rest}>{children}</tr>;
}
export function Td({ num, className = "", ...rest }: { num?: boolean } & TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={`${num ? "num" : ""}${className ? ` ${className}` : ""}`.trim() || undefined} {...rest} />;
}
export function Th({ num, className = "", ...rest }: { num?: boolean } & ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={`${num ? "num" : ""}${className ? ` ${className}` : ""}`.trim() || undefined} {...rest} />;
}

/** Sort a list that is fully in the browser. `cols` names each sortable column once: its kind and how to read a row's value. `col(key, label)` is the header to put in `head`. */
export function useTableSort<T>(rows: readonly T[], cols: Record<string, { kind: SortKind; get: (row: T) => unknown }>, initial: { key: string; dir: SortDir } | null = null) {
  const lang = useLocale();
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => (sort && cols[sort.key] ? sortRows(rows, cols[sort.key].get, cols[sort.key].kind, sort.dir, lang) : [...rows]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, sort, lang]);
  const col = (key: string, label: ReactNode, o: { num?: boolean; className?: string } = {}): Exclude<Head, ReactNode> => ({
    label, ...o,
    sort: { kind: cols[key].kind, dir: sort?.key === key ? sort.dir : null, onSort: () => setSort({ key, dir: nextDir(cols[key].kind, sort?.key === key ? sort.dir : null) }) },
  });
  return { rows: sorted, col, sort };
}
