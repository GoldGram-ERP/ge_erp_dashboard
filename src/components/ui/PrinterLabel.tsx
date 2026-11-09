"use client";
// One test-printer label (text + QR code) drawn from the pure rules in things/printer-label-rules.ts, and the print window.
// Like label-print.tsx, printing happens in its OWN window that holds only the labels: the ERP page (sidebar, header) is never printed,
// and the @page rule exists only in that window, so it never touches any other screen.
import { renderToStaticMarkup } from "react-dom/server";
import { useMemo, type CSSProperties } from "react";
import { esc } from "@/lib/format";
import { qrShape } from "@/lib/qr";
import { toast } from "@/components/engine";
import { buildLines, frameCss, layoutCss, lineCss, pageSize, previewZoom, printCss, type LabelItem, type Settings } from "@/things/printer-label-rules";

/** One label at its real size in mm (the preview zooms it with CSS). */
export function PrinterLabel({ s, item }: { s: Settings; item: LabelItem }) {
  const { outer, inner } = frameCss(s), lay = layoutCss(s);
  const shape = useMemo(() => (item.code ? qrShape(item.code, s.level) : null), [item.code, s.level]);
  const lines = buildLines(s, item), underText = s.linesPlacement === "afterText";
  const textEl = item.text && <p dir="auto" style={(lines.length && underText ? { ...lay.text, flex: "none" } : lay.text) as CSSProperties}>{item.text}</p>;
  const lineEls = lines.map((l, i) => <p key={i} dir="auto" style={lineCss(s, l) as CSSProperties}>{l.text}</p>);
  const qrEl = shape && (
    <svg role="img" aria-label={item.code} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${shape.size} ${shape.size}`} preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" style={lay.qr as CSSProperties}>
      <path d={shape.d} fill="#000" />
    </svg>
  );
  return (
    <div data-printer-label style={outer as CSSProperties}>
      <div style={inner as CSSProperties}>
        <div style={lay.box as CSSProperties}>
          {!lines.length ? <>{textEl}{qrEl}</>
            : underText ? <><div style={lay.group as CSSProperties}>{textEl}{lineEls}</div>{qrEl}</>
            : <>{textEl}<div style={lay.group as CSSProperties}>{qrEl}{lineEls}</div></>}
        </div>
      </div>
    </div>
  );
}

/** A label on screen inside a box of boxW x boxH px, with the page edge drawn. */
export function PrinterLabelPreview({ s, item, boxW, boxH }: { s: Settings; item: LabelItem; boxW: number; boxH: number }) {
  return <div className="tp-paper" style={{ zoom: previewZoom(pageSize(s), boxW, boxH) }}><PrinterLabel s={s} item={item} /></div>;
}

/** Opens the print window from the click and writes only the labels (one per page) and a Print button into it. */
export function printPrinterLabels(s: Settings, labels: LabelItem[], text: { title: string; print: string; popup: string; rtl: boolean }): void {
  const w = window.open("", "_blank");
  if (!w) { toast(text.popup, { error: true }); return; }
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
