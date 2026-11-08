"use client";
// The drawing of a piece label and of a sheet of them (kept free of app imports so it can be unit-tested). Printing: label-print.tsx.
// Printed in its OWN window (label-print.tsx), never as the app page: hiding the app with `visibility:hidden` keeps its layout,
// which at the label page size stretched into ~25 blank sheets.
// "tag" = one 30 x 10 mm label per page (its four text lines are set small, 5.5pt, so the code and the price are not cut off), "a4" = 5 x 13 labels of 38.1 x 21.2 mm.
import type { Row } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { LabelQr } from "@/components/label-qr";

export const LAYOUT_KEY = "ge-erp.labelLayout";        // the layout chosen is remembered on this device
export type Layout = "tag" | "a4";
export const A4_PER_PAGE = 65;
export const pageSize = (layout: Layout) => (layout === "tag" ? "30mm 10mm;margin:0" : "A4;margin:10.7mm 4.7mm");
const pc = (tr: Pick<Tr, "t">, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

// label = { pieceCode, labelKind: "qr"|"barcode", itemName or categoryName, karat, weight (mg), tagPrice (piastres, 0 = none) }
export function Label({ l, layout, tr }: { l: Row; layout: Layout; tr: Pick<Tr, "t"> }) {
  const tag = layout === "tag", qr = l.labelKind === "qr";
  const name = l.itemName ?? l.categoryName;       // a returned customer piece prints its category
  const text = (
    <>
      <span dir="ltr" data-label-code style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.pieceCode}</span>
      {name && <span data-label-item style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingBlock: tag ? 0 : "0.15mm" }}>{name}</span>}
      <span dir="ltr" style={{ whiteSpace: "nowrap" }}>{pc(tr, "karatValue", { karat: l.karat })} · {milligramsText(l.weight)} {pc(tr, "gram")}</span>
      {l.tagPrice ? <span dir="ltr" style={{ fontWeight: 600 }}>{piastresText(l.tagPrice)}</span> : null}   {/* a tag price of 0 prints nothing */}
    </>
  );
  const mark = qr
    ? <LabelQr value={l.pieceCode} />
    : <span data-bars style={{ display: "block", width: tag ? "40mm" : "34mm", height: tag ? "4mm" : "7mm", borderBlock: "1px solid #1c1912", textAlign: "center", fontSize: "5pt", lineHeight: tag ? "4mm" : "7mm" }}>Code 128</span>;
  return (
    <div data-label data-label-kind={l.labelKind} style={{ width: tag ? "30mm" : "38.1mm", height: tag ? "10mm" : "21.2mm", display: "flex", ...(qr ? { alignItems: "center", gap: "1mm" } : { flexDirection: "column", alignItems: "center", justifyContent: "center" }), overflow: "hidden", background: "#fff", color: "#1c1912", fontSize: tag ? "5.5pt" : "7pt", breakInside: "avoid", breakAfter: tag ? "page" : undefined, border: "1px dashed #cfc8b4" }}>
      {qr ? <>{mark}<span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, paddingInlineEnd: "1mm", lineHeight: tag ? 1.1 : 1.3 }}>{text}</span></>
        : <>{mark}<span style={{ display: "flex", flexWrap: "wrap", gap: "0 2mm", justifyContent: "center", lineHeight: 1.3 }}>{text}</span></>}
    </div>
  );
}

export function Sheet({ labels, layout, tr }: { labels: Row[]; layout: Layout; tr: Pick<Tr, "t"> }) {
  if (layout === "tag") return <>{labels.map((l, i) => <Label key={i} l={l} layout="tag" tr={tr} />)}</>;
  const pages: Row[][] = [];
  for (let i = 0; i < labels.length; i += A4_PER_PAGE) pages.push(labels.slice(i, i + A4_PER_PAGE));
  return <>{pages.map((p, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(5,38.1mm)", gridAutoRows: "21.2mm", gap: "0 2.5mm", breakAfter: "page" }}>{p.map((l, j) => <Label key={j} l={l} layout="a4" tr={tr} />)}</div>)}</>;
}

