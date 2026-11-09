"use client";
// One test-printer label (text + QR code) drawn from the pure rules in things/printer-label-rules.ts, and the print window.
// Like label-print.tsx, printing happens in its OWN window that holds only the labels: the ERP page (sidebar, header) is never printed,
// and the @page rule exists only in that window, so it never touches any other screen.
import { renderToStaticMarkup } from "react-dom/server";
import { Fragment, useMemo, type CSSProperties, type ReactNode } from "react";
import { esc } from "@/lib/format";
import { QUIET, qrShape } from "@/lib/qr";
import { toast } from "@/components/engine";
import { buildLines, effectiveLevel, frameCss, layoutCss, lineCss, logoCss, logoInside, pageSize, partsShown, previewZoom, printCss, qrLogoBox, type LabelItem, type Part, type Settings } from "@/things/printer-label-rules";

/** One label at its real size in mm (the preview zooms it with CSS). */
export function PrinterLabel({ s, item }: { s: Settings; item: LabelItem }) {
  const { outer, inner } = frameCss(s), lay = layoutCss(s);
  const level = effectiveLevel(s), shape = useMemo(() => (item.code ? qrShape(item.code, level) : null), [item.code, level]);
  const inside = shape && logoInside(s) ? qrLogoBox(shape.size, QUIET, s.logoPct) : null;
  const lines = buildLines(s, item), underText = s.linesPlacement === "afterText";
  const textEl = item.text && <p dir="auto" style={(lines.length && underText ? { ...lay.text, flex: "none" } : lay.text) as CSSProperties}>{item.text}</p>;
  const lineEls = lines.map((l, i) => <p key={i} dir="auto" style={lineCss(s, l) as CSSProperties}>{l.text}</p>);
  const qrEl = shape && (
    <svg role="img" aria-label={item.code} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${shape.size} ${shape.size}`} preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" style={lay.qr as CSSProperties}>
      <path d={shape.d} fill="#000" />
      {inside && <><rect x={inside.backX} y={inside.backX} width={inside.backSide} height={inside.backSide} fill="#fff" /><image href={s.logo} x={inside.x} y={inside.y} width={inside.side} height={inside.side} preserveAspectRatio="xMidYMid meet" /></>}
    </svg>
  );
  // Every part sits where `order` puts it; the extra lines stay glued to the text or to the QR.
  const blocks: Record<Part, ReactNode> = {
    text: lines.length && underText ? <div style={lay.group as CSSProperties}>{textEl}{lineEls}</div> : textEl,
    qr: lines.length && !underText ? <div style={lay.group as CSSProperties}>{qrEl}{lineEls}</div> : qrEl,
    logo: <img src={s.logo} alt="" style={logoCss(s) as CSSProperties} />,
  };
  return (
    <div data-printer-label style={outer as CSSProperties}>
      <div style={inner as CSSProperties}>
        <div style={lay.box as CSSProperties}>{partsShown(s).map((p) => <Fragment key={p}>{blocks[p]}</Fragment>)}</div>
      </div>
    </div>
  );
}

/** A label on screen inside a box of boxW x boxH px, with the page edge drawn. */
export function PrinterLabelPreview({ s, item, boxW, boxH }: { s: Settings; item: LabelItem; boxW: number; boxH: number }) {
  return <div className="tp-paper" style={{ zoom: previewZoom(pageSize(s), boxW, boxH) }}><PrinterLabel s={s} item={item} /></div>;
}

type PrintText = { title: string; print: string; popup: string; rtl: boolean };

/** Writes only the labels (one per page) and a Print button into an open print window. The Test printer and every QR label of the ERP go through this one function. */
export function writePrinterLabels(w: Window, s: Settings, labels: LabelItem[], text: Pick<PrintText, "title" | "print" | "rtl">): void {
  const body = labels.map((item) => `<div class="sheet">${renderToStaticMarkup(<PrinterLabel s={s} item={item} />)}</div>`).join("");
  w.document.open();
  w.document.write(`<!doctype html><html dir="${text.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(text.title)}</title><style>`
    + `body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif}`
    + `.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px}`
    + `.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}`
    + `.sheet{margin:12px;box-shadow:0 0 0 1px #ccc;width:max-content}`
    + `@media print{.bar{display:none}.sheet{margin:0;box-shadow:none}}`
    + printCss(s)
    + `@media print{.sheet{margin:0}}`
    + `</style></head><body><div class="bar"><b>${esc(text.title)} · ${labels.length}</b><button onclick="print()">${esc(text.print)}</button></div>${body}</body></html>`);
  w.document.close();
}

/** Opens the print window from the click and writes only the labels (one per page) and a Print button into it. */
export function printPrinterLabels(s: Settings, labels: LabelItem[], text: PrintText): void {
  const w = window.open("", "_blank");
  if (!w) { toast(text.popup, { error: true }); return; }
  writePrinterLabels(w, s, labels, text);
}
