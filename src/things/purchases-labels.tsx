"use client";
import { Button, Seg } from "@/components/ui";
// Piece labels as the dashboard prints them: "tag" = one 30 x 10 mm label per page, "a4" = 5 x 13 labels of 38.1 x 21.2 mm; the layout is remembered on this device.
// The QR symbol is a real, scannable QR code of the piece code (src/lib/qr.ts); the Code 128 bars stay a labelled box (shortcut: draw them with JsBarcode when a barcode label is needed).
import { useEffect, useState } from "react";
import type { Row } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { Icon } from "@/components/engine";
import { LAYOUT_KEY as KEY, Sheet, type Layout } from "./label-sheet";
import { printLabels } from "./label-print";

const pc = (tr: Tr, k: string, v?: Record<string, string | number>) => tr.t("gold-accounts", `purchaseCoding.${k}`, v);

// label = { pieceCode, labelKind: "qr"|"barcode", itemName, karat, weight (mg), tagPrice (piastres, 0 = none) }
export const labelOf = (p: Row) => ({ pieceCode: p.pieceCode, labelKind: p.labelKind, itemName: p.itemName, karat: p.karat, weight: p.weight, tagPrice: p.tagPrice });

/** The labels card: title, count, layout choice, Print (the print happens in its own window: see label-print.tsx). */
export function LabelsCard({ title, labels, tr }: { title: string; labels: Row[]; tr: Tr }) {
  const [layout, setLayout] = useState<Layout>("tag");
  useEffect(() => { setLayout(localStorage.getItem(KEY) === "a4" ? "a4" : "tag"); }, []);
  const pick = (l: Layout) => { setLayout(l); localStorage.setItem(KEY, l); };
  return (
    <div className="card">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>{title} <span className="sub">{pc(tr, "labelCount", { count: labels.length })}</span></h3>
        <div className="actions">
          <Seg label={pc(tr, "layout")} value={layout} onChange={pick}
            items={[{ id: "tag", label: pc(tr, "layoutTag"), attrs: { "data-layout": "tag" } }, { id: "a4", label: pc(tr, "layoutA4"), attrs: { "data-layout": "a4" } }]} />
          <Button variant="primary" data-print onClick={() => printLabels(tr, labels, layout)}><Icon name="print" />{tr.t("common", "print")}</Button>
        </div>
      </div>
      <div data-labels data-print-labels style={{ display: "flex", flexWrap: "wrap", gap: 10, maxHeight: "60vh", overflow: "auto", background: "var(--bg)", padding: 12, borderRadius: 10 }}>
        <Sheet labels={labels} layout={layout} tr={tr} />
      </div>
    </div>
  );
}
