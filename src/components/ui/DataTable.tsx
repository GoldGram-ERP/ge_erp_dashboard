import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/** The one table shape: the rounded `.table` card, header row, one row style. A screen writes `<DataTable head={[...]}>` and rows of `<Tr><Td/></Tr>`; it never writes <table>, <th> or <td>. Numbers pass `num`. */
export type Head = { label: ReactNode; num?: boolean; className?: string; colSpan?: number; ariaSort?: "ascending" | "descending" | "none" } | ReactNode;
const isCol = (h: Head): h is { label: ReactNode; num?: boolean; className?: string; colSpan?: number; ariaSort?: "ascending" | "descending" | "none" } => typeof h === "object" && h !== null && "label" in (h as object);

export function DataTable({ head, subHead, subHeadClassName, foot, bodyId, tableId, tableClassName, children, className = "", ...rest }: { head: Head[]; subHead?: Head[]; subHeadClassName?: string; foot?: ReactNode; bodyId?: string; tableId?: string; tableClassName?: string; children: ReactNode; className?: string } & Omit<HTMLAttributes<HTMLDivElement>, "children">) {
  const row = (hs: Head[], cls?: string) => (
    <tr className={cls}>{hs.map((h, i) => { const c = isCol(h) ? h : { label: h }; return <th key={i} scope="col" colSpan={c.colSpan} aria-sort={c.ariaSort} className={`${c.num ? "num" : ""}${c.className ? ` ${c.className}` : ""}`.trim() || undefined}>{c.label}</th>; })}</tr>
  );
  return (
    <div className={`table${className ? ` ${className}` : ""}`} {...rest}>
      <table id={tableId} className={tableClassName}><thead>{row(head)}{subHead && row(subHead, subHeadClassName)}</thead><tbody id={bodyId}>{children}</tbody>{foot && <tfoot>{foot}</tfoot>}</table>
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
