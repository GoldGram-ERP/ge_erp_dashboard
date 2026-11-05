"use client";
import { Button, Seg } from "@/components/ui";
// Piece labels as the dashboard prints them: "tag" = one 50 x 12 mm label per page, "a4" = 5 x 13 labels of 38.1 x 21.2 mm; the layout is remembered on this device.
// The QR symbol is a real, scannable QR code of the piece code (src/lib/qr.ts); the Code 128 bars stay a labelled box (shortcut: draw them with JsBarcode when a barcode label is needed).
import { useEffect, useState } from "react";
import type { Row } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Icon } from "@/components/engine";
import { LabelQr } from "@/components/label-qr";

const KEY = "ge-erp.labelLayout";
const A4_PER_PAGE = 65;
type Layout = "tag" | "a4";
const pc = (tr: Tr, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

// label = { pieceCode, labelKind: "qr"|"barcode", itemName, karat, weight (mg), tagPrice (piastres, 0 = none) }
export const labelOf = (p: Row) => ({ pieceCode: p.pieceCode, labelKind: p.labelKind, itemName: p.itemName, karat: p.karat, weight: p.weight, tagPrice: p.tagPrice });

function One({ l, layout, tr }: { l: Row; layout: Layout; tr: Tr }) {
  const tag = layout === "tag", qr = l.labelKind === "qr";
  const text = (
    <>
      <span dir="ltr" data-label-code style={{ fontFamily: "monospace", fontWeight: 700 }}>{l.pieceCode}</span>
      {l.itemName && <span data-label-item style={{ maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingBlock: "0.15mm" }}>{l.itemName}</span>}
      <span dir="ltr" style={{ whiteSpace: "nowrap" }}>{pc(tr, "karatValue", { karat: l.karat })} · {milligramsText(l.weight)} {pc(tr, "gram")}</span>
      {l.tagPrice ? <span dir="ltr" style={{ fontWeight: 600 }}>{piastresText(l.tagPrice)}</span> : null}   {/* a tag price of 0 prints nothing */}
    </>
  );
  const mark = qr
    ? <LabelQr value={l.pieceCode} />
    : <span data-bars style={{ display: "block", width: tag ? "40mm" : "34mm", height: tag ? "4mm" : "7mm", borderBlock: "1px solid #1c1912", textAlign: "center", fontSize: "5pt", lineHeight: tag ? "4mm" : "7mm" }}>Code 128</span>;
  return (
    <div data-label data-label-kind={l.labelKind} style={{ width: tag ? "50mm" : "38.1mm", height: tag ? "12mm" : "21.2mm", display: "flex", ...(qr ? { alignItems: "center", gap: "1mm" } : { flexDirection: "column", alignItems: "center", justifyContent: "center" }), overflow: "hidden", background: "#fff", color: "#1c1912", fontSize: "7pt", breakInside: "avoid", breakAfter: tag ? "page" : undefined, border: "1px dashed #cfc8b4" }}>
      {qr ? <>{mark}<span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, paddingInlineEnd: "1mm", lineHeight: 1.3 }}>{text}</span></>
        : <>{mark}<span style={{ display: "flex", flexWrap: "wrap", gap: "0 2mm", justifyContent: "center", lineHeight: 1.3 }}>{text}</span></>}
    </div>
  );
}

function Sheet({ labels, layout, tr }: { labels: Row[]; layout: Layout; tr: Tr }) {
  if (layout === "tag") return <>{labels.map((l, i) => <One key={i} l={l} layout="tag" tr={tr} />)}</>;
  const pages: Row[][] = [];
  for (let i = 0; i < labels.length; i += A4_PER_PAGE) pages.push(labels.slice(i, i + A4_PER_PAGE));
  return <>{pages.map((p, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "repeat(5,38.1mm)", gridAutoRows: "21.2mm", gap: "0 2.5mm", breakAfter: "page" }}>{p.map((l, j) => <One key={j} l={l} layout="a4" tr={tr} />)}</div>)}</>;
}

/** The labels card: title, count, layout choice, Print. */
export function LabelsCard({ title, labels, tr }: { title: string; labels: Row[]; tr: Tr }) {
  const [layout, setLayout] = useState<Layout>("tag");
  useEffect(() => { setLayout(localStorage.getItem(KEY) === "a4" ? "a4" : "tag"); }, []);
  const pick = (l: Layout) => { setLayout(l); localStorage.setItem(KEY, l); };
  return (
    <div className="card">
      <style>{`@media print{body *{visibility:hidden}[data-print-labels],[data-print-labels] *{visibility:visible}[data-print-labels]{position:absolute;inset:0 auto auto 0;max-height:none!important;overflow:visible!important;background:#fff!important}}@page{size:${layout === "tag" ? "50mm 12mm;margin:0" : "A4;margin:10.7mm 4.7mm"}}`}</style>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{title} <span className="sub">{pc(tr, "labelCount", { count: labels.length })}</span></h3>
        <div className="actions">
          <Seg label={pc(tr, "layout")} value={layout} onChange={pick}
            items={[{ id: "tag", label: pc(tr, "layoutTag"), attrs: { "data-layout": "tag" } }, { id: "a4", label: pc(tr, "layoutA4"), attrs: { "data-layout": "a4" } }]} />
          <Button variant="primary" data-print onClick={() => window.print()}><Icon name="print" />{tr.t("common", "print")}</Button>
        </div>
      </div>
      <div data-labels data-print-labels style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: "60vh", overflow: "auto", background: "var(--bg)", padding: 12, borderRadius: 10 }}>
        <Sheet labels={labels} layout={layout} tr={tr} />
      </div>
    </div>
  );
}
