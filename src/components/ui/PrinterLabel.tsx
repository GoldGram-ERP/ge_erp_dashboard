"use client";
// One test-printer label (text + QR code) drawn from the pure rules in things/printer-label-rules.ts, and the print window.
// Like label-print.tsx, printing happens in its OWN window that holds only the labels: the ERP page (sidebar, header) is never printed,
// and the @page rule exists only in that window, so it never touches any other screen.
import { renderToStaticMarkup } from "react-dom/server";
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { esc } from "@/lib/format";
import { QUIET, qrShape } from "@/lib/qr";
import { toast } from "@/components/engine";
import { a4Grid, A4_MARGIN_MM, buildLines, contentAxes, crossCentres, effectiveLevel, fitLabel, placeCss, frameCss, layoutCss, lineCss, logoCss, logoInside, logoInside as logoIn, nearestCross, nearestPlace, pageSize, partsShown, placePart, previewZoom, PX_PER_MM, resizePatch, resizeWidth, printCss, qrLogoBox, toContent, type Cross, type Css, type LabelItem, type Part, type Settings } from "@/things/printer-label-rules";

/** The preview's editing (never set for a printed label). px = one screen pixel in the label's own units (1 / zoom), so rings stay 2 px on screen.
 *  held = the part being dragged and how far (screen px); target = the place it will snap to. */
export type LabelPick = {
  selected: Part | null; px: number; held: { part: Part; dx: number; dy: number } | null; target: Part | null;
  down: (e: ReactPointerEvent<Element>, p: Part) => void; move: (e: ReactPointerEvent<Element>) => void; up: () => void; cancel: () => void;
};

/** One label at its real size in mm (the preview zooms it with CSS). */
export function PrinterLabel({ s, item, pick }: { s: Settings; item: LabelItem; pick?: LabelPick }) {
  const { outer, inner } = frameCss(s), f = fitLabel(s, item), lay = layoutCss(s, f);
  const level = effectiveLevel(s), shape = useMemo(() => (item.code ? qrShape(item.code, level) : null), [item.code, level]);
  const inside = shape && logoInside(s) ? qrLogoBox(shape.size, QUIET, s.logoPct) : null;
  const lines = buildLines(s, item), underText = s.linesPlacement === "afterText";
  const grouped = (part: Part) => lines.length > 0 && (part === "text" ? underText : !underText);
  // The QR's words (its content) above or below the code; the QR and its words then travel together as one block.
  const captioned = !!shape && !!item.code && s.qrCaption !== "none", qrBlock = grouped("qr") || captioned;
  const caption = captioned && <p dir="auto" style={lay.caption as CSSProperties}>{item.code}</p>;
  // Editing: each part can be grabbed (touch-action none so a finger drags instead of scrolling). The held part follows the pointer 1:1;
  // the place it will snap to gets a dashed ring, the picked part a solid one (both 2 screen px).
  const tap = (part: Part) => pick ? { "data-part": part, onPointerDown: (e: ReactPointerEvent<Element>) => pick.down(e, part), onPointerMove: pick.move, onPointerUp: pick.up, onPointerCancel: pick.cancel } : {};
  const ring = (part: Part): Css => {
    if (!pick) return {};
    const px = pick.px, held = pick.held?.part === part ? pick.held : null;
    const line = held ? null : pick.target === part ? "dashed" : pick.selected === part && !pick.held ? "solid" : null;
    return {
      cursor: held ? "grabbing" : "grab", touchAction: "none", userSelect: "none",
      ...(line ? { outline: `${2 * px}px ${line} #7a5710`, outlineOffset: `${2 * px}px`, borderRadius: `${2 * px}px` } : {}),
      ...(held ? { transform: `translate(${held.dx * px}px, ${held.dy * px}px)`, opacity: 0.85, position: "relative", zIndex: 2, boxShadow: `0 ${4 * px}px ${14 * px}px rgba(0,0,0,.25)` } : {}),
    };
  };
  const textEl = item.text && <p dir="auto" style={{ ...(grouped("text") ? { ...lay.text, flex: "none" } : { ...lay.text, ...ring("text") }) } as CSSProperties} {...(grouped("text") ? {} : tap("text"))}>{item.text}</p>;
  const lineEls = lines.map((l, i) => <p key={i} dir="auto" style={lineCss(s, l, f.linePts[i]) as CSSProperties}>{l.text}</p>);
  const qrEl = shape && (
    <svg role="img" aria-label={item.code} xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${shape.size} ${shape.size}`} preserveAspectRatio="xMidYMid meet" shapeRendering="crispEdges" style={{ ...lay.qr, ...(qrBlock ? { alignSelf: "center" } : ring("qr")) } as CSSProperties} {...(qrBlock ? {} : tap("qr"))}>
      <path d={shape.d} fill="#000" />
      {inside && <><rect x={inside.backX} y={inside.backX} width={inside.backSide} height={inside.backSide} fill="#fff" /><image href={s.logo} x={inside.x} y={inside.y} width={inside.side} height={inside.side} preserveAspectRatio="xMidYMid meet" /></>}
    </svg>
  );
  const shown = partsShown(s).filter((p) => p !== "qr" || !!item.code);
  // Every part sits where `order` puts it; the extra lines stay glued to the text or to the QR.
  const blocks: Record<Part, ReactNode> = {
    text: grouped("text") ? <div style={{ ...lay.group, ...ring("text") } as CSSProperties} {...tap("text")}>{textEl}{lineEls}</div> : textEl,
    qr: qrBlock ? <div style={{ ...(grouped("qr") ? lay.group : lay.qrGroup), ...ring("qr") } as CSSProperties} {...tap("qr")}>{s.qrCaption === "above" && caption}{qrEl}{s.qrCaption === "below" && caption}{grouped("qr") ? lineEls : null}</div> : qrEl,
    logo: <img src={s.logo} alt="" draggable={false} style={{ ...logoCss(s, f), ...ring("logo") } as CSSProperties} {...tap("logo")} />,
  };
  return (
    <div data-printer-label style={outer as CSSProperties}>
      <div style={inner as CSSProperties}>
        <div data-box style={lay.box as CSSProperties}>{shown.map((p, i) => { const pin = placeCss(s, f, i, p); return Object.keys(pin).length ? <div key={p} style={{ ...pin, display: "flex", minWidth: 0, maxWidth: "100%" } as CSSProperties}>{blocks[p]}</div> : <Fragment key={p}>{blocks[p]}</Fragment>; })}</div>
      </div>
    </div>
  );
}

/** A label on screen, zoomed to fit. With boxW/boxH it fits that fixed box (thumbnails); without, it fills its parent and follows its size.
 *  With onOrder: drag any part freely; on release it snaps to the nearest place and swaps with the part there. A tap (no drag) picks the part. */
export function PrinterLabelPreview({ s, item, boxW, boxH, selected = null, onPick, onOrder, onPlace, onResize }: {
  s: Settings; item: LabelItem; boxW?: number; boxH?: number; selected?: Part | null; onPick?: (p: Part) => void; onOrder?: (order: Part[]) => void;
  /** A drag mostly across the row: the part now sits at this across place (top / middle / bottom, or start / middle / end when stacked). */
  onPlace?: (part: Part, cross: Cross) => void;
  onResize?: (patch: Partial<Settings>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  // The resize handle sits on the picked part's bottom-right corner, in screen px (measured after every render that can move it).
  const [frame, setFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [sizing, setSizing] = useState<{ x: number; y: number; w: number; h: number; start: Parameters<typeof resizePatch>[1] } | null>(null);
  const [widening, setWidening] = useState<{ x: number; y: number; startMm: number; max: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  // dx/dy = the move in the label's own axes (so a turned label follows the pointer); centres = the places along the row; slots + at = the three across places and where the part is now.
  const [drag, setDrag] = useState<{ part: Part; from: number; x: number; y: number; dx: number; dy: number; moved: boolean; centres: number[]; slots: number[]; at: number } | null>(null);
  useEffect(() => {
    const host = wrap.current?.parentElement;
    if (boxW || !host) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(host);
    return () => ro.disconnect();
  }, [boxW]);
  const zoom = previewZoom(pageSize(s), boxW ?? box?.w ?? 0, boxH ?? box?.h ?? 0) || 1;
  const shown = partsShown(s), vertical = s.direction === "stacked";
  // One drag, one change: whichever way the pointer moved more decides it (along the row = swap places, across = top / middle / bottom).
  const alongMove = drag ? (vertical ? drag.dy : drag.dx) : 0, acrossMove = drag ? (vertical ? drag.dx : drag.dy) : 0, acrossWins = Math.abs(acrossMove) > Math.abs(alongMove);
  const to = drag?.moved && !acrossWins ? nearestPlace(drag.centres, drag.from, alongMove) : -1;
  const pick: LabelPick | undefined = onPick || onOrder || onPlace ? {
    selected, px: 1 / zoom, held: drag?.moved ? { part: drag.part, dx: drag.dx, dy: drag.dy } : null, target: to >= 0 && to !== drag?.from ? shown[to] : null,
    down: (e, part) => {
      if (e.button !== 0) return;
      // The places are where the parts are now, measured on screen once at pick-up and projected on the label's own axes (the label may be turned).
      const ax = contentAxes(s.rotate), along = vertical ? ax.y : ax.x, across = vertical ? ax.x : ax.y;
      const span = (r: DOMRect, v: [number, number]): [number, number] => (v[0] ? (v[0] > 0 ? [r.left, r.right] : [-r.right, -r.left]) : v[1] > 0 ? [r.top, r.bottom] : [-r.bottom, -r.top]);
      const els = [...(ref.current?.querySelectorAll<HTMLElement>("[data-part]") ?? [])];
      const rectOf = (p: Part) => els.find((el) => el.dataset.part === p)?.getBoundingClientRect();
      const centres = shown.map((p) => { const r = rectOf(p); if (!r) return 0; const [a, b] = span(r, along); return (a + b) / 2; });
      const box = ref.current?.querySelector<HTMLElement>("[data-box]")?.getBoundingClientRect(), mine = rectOf(part);
      let slots: number[] = [], at = 0;
      if (box && mine) {
        const [bl, bh] = span(box, across), [pl, ph] = span(mine, across), pad = s.paddingMm * PX_PER_MM * zoom;
        slots = crossCentres(bl + pad, bh - pad, ph - pl); at = (pl + ph) / 2;
      }
      e.currentTarget.setPointerCapture(e.pointerId);
      setDrag({ part, from: shown.indexOf(part), x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false, centres, slots, at });
    },
    move: (e) => { if (drag) { const c = toContent(s.rotate, e.clientX - drag.x, e.clientY - drag.y); setDrag({ ...drag, dx: c.x, dy: c.y, moved: drag.moved || Math.hypot(c.x, c.y) > 6 }); } },
    up: () => {
      if (!drag) return;
      if (!drag.moved) onPick?.(drag.part);
      else if (acrossWins) { if (drag.slots.length) { const c = nearestCross(drag.slots, drag.at + acrossMove); if (c !== s.cross[drag.part]) onPlace?.(drag.part, c); } }
      else if (to >= 0 && to !== drag.from) onOrder?.(placePart(s, drag.part, to));
      setDrag(null);
    },
    cancel: () => setDrag(null),
  } : undefined;
  useLayoutEffect(() => {
    const el = selected && !drag?.moved ? wrap.current?.querySelector<HTMLElement>(`[data-part="${selected}"]`) : null, base = wrap.current?.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    const next = r && base ? { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height } : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrame((old) => (old && next && old.x === next.x && old.y === next.y && old.w === next.w && old.h === next.h ? old : next));
  });
  const handle = onResize && frame && selected && (
    <span className="tp-resize" role="presentation" style={{ left: frame.x + frame.w - 7, top: frame.y + frame.h - 7 }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setSizing({ x: e.clientX, y: e.clientY, w: frame.w, h: frame.h, start: { fontPt: s.fontPt, logoMm: s.logoMm, logoPct: s.logoPct, qrMm: s.qrSizeMm > 0 ? s.qrSizeMm : frame.w / zoom / PX_PER_MM } });
      }}
      onPointerMove={(e) => {
        if (!sizing) return;
        const ratio = 1 + ((e.clientX - sizing.x) + (e.clientY - sizing.y)) / (sizing.w + sizing.h);
        onResize(resizePatch(selected, sizing.start, logoIn(s), ratio));
      }}
      onPointerUp={() => setSizing(null)} onPointerCancel={() => setSizing(null)} />
  );
  // The text box's width: a pill on its end edge, physical like the label (always left-to-right inside, then turned). axis = where the content's
  // +x points on screen after the turn; a right-aligned column keeps its end edge, so its handle sits on the start edge and pulls the other way.
  // A centred box grows on both sides, so the move counts twice (the edge stays under the pointer).
  const flip = s.direction === "stacked" && s.align === "right", sideways = s.rotate === 90 || s.rotate === 270;
  const axis = ({ 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] } as const)[s.rotate].map((v) => (flip ? -v : v));
  const scale = s.direction === "stacked" && s.align !== "center" ? 1 : 2;
  const wHandle = onResize && frame && selected === "text" && (
    <span className={sideways ? "tp-width across" : "tp-width"} role="presentation"
      style={{ left: frame.x + (axis[0] > 0 ? frame.w : axis[0] < 0 ? 0 : frame.w / 2) - (sideways ? 9 : 3), top: frame.y + (axis[1] > 0 ? frame.h : axis[1] < 0 ? 0 : frame.h / 2) - (sideways ? 3 : 9) }}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setWidening({ x: e.clientX, y: e.clientY, startMm: (sideways ? frame.h : frame.w) / zoom / PX_PER_MM, max: fitLabel({ ...s, textWidthMm: 1000 }, item).textMm });
      }}
      onPointerMove={(e) => {
        if (!widening) return;
        onResize({ textWidthMm: resizeWidth(widening.startMm, ((e.clientX - widening.x) * axis[0] + (e.clientY - widening.y) * axis[1]) * scale, zoom, widening.max) });
      }}
      onPointerUp={() => setWidening(null)} onPointerCancel={() => setWidening(null)} />
  );
  return (
    <div ref={wrap} className="tp-fit">
      <div ref={ref} className="tp-paper" style={{ zoom, visibility: boxW || box ? "visible" : "hidden" }}>
        <PrinterLabel s={s} item={item} pick={pick} />
      </div>
      {wHandle}
      {handle}
    </div>
  );
}

type PrintText = { title: string; print: string; popup: string; rtl: boolean };

/** The A4 sheet of one saved label: a grid per page (no gap), as many as fit, in order (the maths: a4Grid). `preview` = on screen: a white page with the print margin. */
export function A4Pages({ s, items, kinds, preview = false }: { s: Settings; items: LabelItem[]; kinds?: unknown[]; preview?: boolean }) {
  const p = pageSize(s), g = a4Grid(p, items.length);
  let at = 0;
  return <>{g.pages.map((n, i) => {
    const from = at; at += n;
    return (
      <div key={i} data-a4-page style={{ display: "grid", gridTemplateColumns: `repeat(${g.cols}, ${p.w}mm)`, gridAutoRows: `${p.h}mm`, width: "max-content", breakAfter: i < g.pages.length - 1 ? "page" : "auto", ...(preview ? { background: "#fff", padding: `${A4_MARGIN_MM}mm`, boxShadow: "0 0 0 1px #ccc", marginBottom: 10 } : {}) }}>
        {items.slice(from, from + n).map((item, j) => <div key={j} data-label data-label-kind={kinds?.[from + j] as string | undefined} style={{ width: `${p.w}mm`, height: `${p.h}mm`, overflow: "hidden" }}><PrinterLabel s={s} item={item} /></div>)}
      </div>
    );
  })}</>;
}

/** On screen at real size, scaled down only when the room is narrower than `widthMm`. */
export function FitWidth({ widthMm, children }: { widthMm: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [z, setZ] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setZ(Math.min(1, e.contentRect.width / (widthMm * PX_PER_MM)) || 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [widthMm]);
  return <div ref={ref} style={{ width: `${widthMm}mm`, maxWidth: "100%" }}><div style={{ zoom: z, width: "max-content" }}>{children}</div></div>;
}

/** Writes only the labels and a Print button into an open print window. Tag roll: one label per page. A4: the saved label tiled on A4 portrait with a 5 mm margin.
 *  The Test printer and every label of the ERP go through this one function. */
export function writePrinterLabels(w: Window, s: Settings, labels: LabelItem[], text: Pick<PrintText, "title" | "print" | "rtl">, layout: "tag" | "a4" = "tag"): void {
  const a4 = layout === "a4";
  const body = a4 ? renderToStaticMarkup(<A4Pages s={s} items={labels} />) : labels.map((item) => `<div class="sheet">${renderToStaticMarkup(<PrinterLabel s={s} item={item} />)}</div>`).join("");
  w.document.open();
  w.document.write(`<!doctype html><html dir="${text.rtl ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(text.title)}</title><style>`
    + `body{font-family:system-ui,"Segoe UI",Tahoma,sans-serif}`
    + `.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px}`
    + `.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}`
    + `.sheet{margin:12px;box-shadow:0 0 0 1px #ccc;width:max-content}`
    + `[data-a4-page]{margin:12px;box-shadow:0 0 0 1px #ccc}`
    + `@media print{.bar{display:none}.sheet{margin:0;box-shadow:none}[data-a4-page]{margin:0;box-shadow:none}}`
    + (a4 ? `@page{size:A4 portrait;margin:${A4_MARGIN_MM}mm}html,body{margin:0;padding:0;background:#fff}` : printCss(s))
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
