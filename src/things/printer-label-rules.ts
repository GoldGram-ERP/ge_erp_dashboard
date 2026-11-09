// Test printer: the pure rules of one label (page size, rotation, layout, settings). No React here; printer-label-rules.test.ts pins them.
// One label = free text + a QR code, printed one per page. The label always fills the page exactly.

export type Orientation = "portrait" | "landscape";
export type Direction = "stacked" | "side";
export type Rotate = 0 | 90 | 180 | 270;
export type Align = "left" | "center" | "right";
export type QrLevel = "L" | "M" | "Q" | "H";

export type Settings = {
  widthMm: number; heightMm: number; orientation: Orientation;
  direction: Direction; swap: boolean; rotate: Rotate;
  fontPt: number; align: Align; paddingMm: number; gapMm: number;
  qrTopMm: number; qrSizeMm: number; level: QrLevel; copies: number;
};
export type LabelItem = { text: string; code: string };
export type Css = Record<string, string | number>;

export const DEFAULTS: Settings = {
  widthMm: 66, heightMm: 61, orientation: "portrait", direction: "stacked", swap: false, rotate: 0,
  fontPt: 14, align: "center", paddingMm: 1, gapMm: 0.5, qrTopMm: 6, qrSizeMm: 0, level: "M", copies: 1,
};
export const PRESETS: [number, number][] = [[66, 61], [50, 30], [40, 30], [38, 12.5], [100, 50]];
export const STORAGE_KEY = "test-printer-settings";

const RANGES = { widthMm: [10, 300], heightMm: [10, 300], fontPt: [4, 72], paddingMm: [0, 20], gapMm: [0, 20], qrTopMm: [0, 30], qrSizeMm: [0, 300], copies: [1, 100] } as const;
type NumKey = keyof typeof RANGES;

const num = (v: unknown, key: NumKey): number => {
  const [min, max] = RANGES[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULTS[key];
  const c = Math.min(max, Math.max(min, n));
  return key === "copies" ? Math.round(c) : Math.round(c * 100) / 100;
};
const pick = <T extends string | number>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

/** Any object -> a valid Settings: every field clamped to its range, unknown or wrong values fall back to the default. */
export function clampSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    widthMm: num(r.widthMm, "widthMm"), heightMm: num(r.heightMm, "heightMm"),
    orientation: pick(r.orientation, ["portrait", "landscape"], DEFAULTS.orientation),
    direction: pick(r.direction, ["stacked", "side"], DEFAULTS.direction),
    swap: typeof r.swap === "boolean" ? r.swap : DEFAULTS.swap,
    rotate: pick(r.rotate, [0, 90, 180, 270], DEFAULTS.rotate),
    fontPt: num(r.fontPt, "fontPt"), align: pick(r.align, ["left", "center", "right"], DEFAULTS.align),
    paddingMm: num(r.paddingMm, "paddingMm"), gapMm: num(r.gapMm, "gapMm"), qrTopMm: num(r.qrTopMm, "qrTopMm"), qrSizeMm: num(r.qrSizeMm, "qrSizeMm"),
    level: pick(r.level, ["L", "M", "Q", "H"], DEFAULTS.level), copies: num(r.copies, "copies"),
  };
}

/** The stored JSON text -> Settings. Missing, empty or broken JSON gives the defaults; a partial object is merged over them. */
export function parseSettings(stored: string | null | undefined): Settings {
  try { return clampSettings(stored ? JSON.parse(stored) : {}); } catch { return { ...DEFAULTS }; }
}

/** The printed page: landscape = the longer side horizontal, portrait = the longer side vertical, whatever order width and height were typed in. */
export function pageSize(s: Pick<Settings, "widthMm" | "heightMm" | "orientation">): { w: number; h: number } {
  const long = Math.max(s.widthMm, s.heightMm), short = Math.min(s.widthMm, s.heightMm);
  return s.orientation === "landscape" ? { w: long, h: short } : { w: short, h: long };
}
const mm = (n: number) => `${n}mm`;
export const pageSizeCss = (s: Settings): string => { const p = pageSize(s); return `${mm(p.w)} ${mm(p.h)}`; };

/** The box the content is laid out in, and the move that turns it onto the page. 90 and 270 swap the box (page height x page width)
 *  so the turned content still covers the page exactly. The matrix is [rotate, then move by (tx, ty)] with the origin at the top-left corner. */
export function rotation(page: { w: number; h: number }, deg: Rotate): { w: number; h: number; tx: number; ty: number; transform: string } {
  const sideways = deg === 90 || deg === 270;
  const w = sideways ? page.h : page.w, h = sideways ? page.w : page.h;
  const tx = deg === 90 ? page.w : deg === 180 ? page.w : 0;
  const ty = deg === 270 ? page.h : deg === 180 ? page.h : 0;
  return { w, h, tx, ty, transform: deg === 0 ? "none" : `translate(${mm(tx)}, ${mm(ty)}) rotate(${deg}deg)` };
}

/** Where a point of the content box lands on the page after the rotation (used by the tests to prove nothing is clipped). */
export function place(r: { tx: number; ty: number }, deg: Rotate, x: number, y: number): [number, number] {
  const t = (deg * Math.PI) / 180, c = Math.round(Math.cos(t)), s = Math.round(Math.sin(t));
  return [c * x - s * y + r.tx, s * x + c * y + r.ty];
}

/** The page frame (page size, clips) and the turned inner box. */
export function frameCss(s: Settings): { outer: Css; inner: Css } {
  const p = pageSize(s), r = rotation(p, s.rotate);
  return {
    outer: { position: "relative", width: mm(p.w), height: mm(p.h), overflow: "hidden", background: "#fff", color: "#000", boxSizing: "border-box" },
    inner: { position: "absolute", top: 0, left: 0, width: mm(r.w), height: mm(r.h), transformOrigin: "0 0", transform: r.transform },
  };
}

/** The row/column of the two layers: stacked = text above the QR, side = text and QR in a row; swap puts the QR first. */
export function layoutCss(s: Settings): { box: Css; text: Css; qr: Css } {
  const stacked = s.direction === "stacked";
  const dir = `${stacked ? "column" : "row"}${s.swap ? "-reverse" : ""}`;
  const self = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  const fixed = s.qrSizeMm > 0;
  return {
    box: { display: "flex", flexDirection: dir, alignItems: stacked ? "stretch" : "center", justifyContent: "center", gap: mm(s.gapMm), padding: mm(s.paddingMm), width: "100%", height: "100%", boxSizing: "border-box", direction: "ltr", overflow: "hidden" },
    text: { margin: 0, fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${s.fontPt}pt`, lineHeight: 1.15, textAlign: s.align, whiteSpace: "pre-wrap", overflowWrap: "anywhere", minWidth: 0, flex: stacked ? "none" : "1 1 0", maxWidth: "100%" },
    qr: {
      display: "block", minWidth: 0, minHeight: 0, marginTop: mm(s.qrTopMm),
      ...(fixed ? { flex: "none", width: mm(s.qrSizeMm), height: mm(s.qrSizeMm), alignSelf: stacked ? self : "center" } : { flex: "1 1 0", width: "100%", height: "100%" }),
    },
  };
}

/** The stylesheet of the print window: the page size, no margin, one label per page. */
export function printCss(s: Settings): string {
  return `@page{size:${pageSizeCss(s)};margin:0}html,body{margin:0;padding:0;background:#fff}.sheet{break-after:page;page-break-after:always;overflow:hidden}.sheet:last-child{break-after:auto;page-break-after:auto}`;
}

/** What is printed, in order: every label `copies` times in a row. */
export function labelList(items: LabelItem[], copies: number): LabelItem[] {
  const n = Math.min(100, Math.max(1, Math.round(copies) || 1));
  return items.flatMap((it) => Array.from({ length: n }, () => it));
}

export const describe = (s: Settings): { w: number; h: number; orientation: Orientation } => ({ ...pageSize(s), orientation: s.orientation });

const PX_PER_MM = 96 / 25.4;
/** How much to enlarge or shrink a label (mm sized) to fit a preview box of boxW x boxH px, never above 4x. */
export const previewZoom = (p: { w: number; h: number }, boxW: number, boxH: number): number =>
  Math.min(4, boxW / (p.w * PX_PER_MM), boxH / (p.h * PX_PER_MM));
