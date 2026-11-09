// Test printer: the pure rules of one label (page size, rotation, layout, settings). No React here; printer-label-rules.test.ts pins them.
// One label = free text + a QR code, printed one per page. The label always fills the page exactly.

export type Orientation = "portrait" | "landscape";
export type Direction = "stacked" | "side";
export type Rotate = 0 | 90 | 180 | 270;
export type Align = "left" | "center" | "right";
export type QrLevel = "L" | "M" | "Q" | "H";

/** The logo: "beside" = a part of its own (its place is set in `order`), "inside" = in the middle of the QR, "none" = hidden. */
export type LogoPlacement = "beside" | "inside" | "none";
/** The three things on a label. `order` is the place of each, first to last (left to right, or top to bottom). */
export type Part = "text" | "logo" | "qr";
export const PARTS: readonly Part[] = ["text", "logo", "qr"];

export type LineAlign = Align | "inherit";
export type LinesPlacement = "afterText" | "afterQr";
/** One extra text line: its own text and style. keepBlank = an empty text still takes its row (spacing control). */
export type ExtraLine = { text: string; fontPt: number; align: LineAlign; bold: boolean; keepBlank: boolean };
/** A line as it is drawn: empty ones are already gone (or a non-breaking space when kept). */
export type RenderLine = { text: string; fontPt: number; align: LineAlign; bold: boolean };

export type Settings = {
  widthMm: number; heightMm: number; orientation: Orientation;
  direction: Direction; order: Part[]; rotate: Rotate;
  fontPt: number; align: Align; paddingMm: number; gapMm: number;
  qrTopMm: number; qrSizeMm: number; level: QrLevel; copies: number;
  lines: ExtraLine[]; linesPlacement: LinesPlacement;
  /** The logo as a data URL ("" = none). The places are the physical sides of the printed label. logoMm = the square the logo fits in (left/middle/right); logoPct = % of the QR width (inside). */
  logo: string; logoPlacement: LogoPlacement; logoMm: number; logoPct: number;
};
/** `extra` = the texts of Excel columns C, D, E... of this label; absent for the typed label (its lines come from Settings.lines). */
export type LabelItem = { text: string; code: string; extra?: string[] };
export type Css = Record<string, string | number>;

export const DEFAULTS: Settings = {
  widthMm: 66, heightMm: 61, orientation: "portrait", direction: "stacked", order: ["logo", "text", "qr"], rotate: 0,
  fontPt: 14, align: "center", paddingMm: 1, gapMm: 0.5, qrTopMm: 6, qrSizeMm: 0, level: "M", copies: 1,
  lines: [], linesPlacement: "afterText",
  logo: "", logoPlacement: "beside", logoMm: 10, logoPct: 20,
};
export const PRESETS: [number, number][] = [[66, 61], [50, 30], [40, 30], [38, 12.5], [100, 50]];
export const STORAGE_KEY = "test-printer-settings";

// Wide on purpose (owner, 2026-11-09): the test page must take any size, 1 mm up; a smaller box used to snap back to 10.
const RANGES = { widthMm: [1, 1000], heightMm: [1, 1000], fontPt: [1, 200], paddingMm: [0, 100], gapMm: [0, 100], qrTopMm: [0, 500], qrSizeMm: [0, 1000], copies: [1, 100], logoMm: [0.5, 500], logoPct: [1, 100] } as const;
type NumKey = keyof typeof RANGES;

const num = (v: unknown, key: NumKey): number => {
  const [min, max] = RANGES[key];
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULTS[key];
  const c = Math.min(max, Math.max(min, n));
  return key === "copies" ? Math.round(c) : Math.round(c * 1000) / 1000;
};
const pick = <T extends string | number>(v: unknown, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);

/** Any object -> a valid Settings: every field clamped to its range, unknown or wrong values fall back to the default. */
export function clampSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    widthMm: num(r.widthMm, "widthMm"), heightMm: num(r.heightMm, "heightMm"),
    orientation: pick(r.orientation, ["portrait", "landscape"], DEFAULTS.orientation),
    direction: pick(r.direction, ["stacked", "side"], DEFAULTS.direction),
    order: cleanOrder(r),
    rotate: pick(r.rotate, [0, 90, 180, 270], DEFAULTS.rotate),
    fontPt: num(r.fontPt, "fontPt"), align: pick(r.align, ["left", "center", "right"], DEFAULTS.align),
    paddingMm: num(r.paddingMm, "paddingMm"), gapMm: num(r.gapMm, "gapMm"), qrTopMm: num(r.qrTopMm, "qrTopMm"), qrSizeMm: num(r.qrSizeMm, "qrSizeMm"),
    level: pick(r.level, ["L", "M", "Q", "H"], DEFAULTS.level), copies: num(r.copies, "copies"),
    lines: normaliseLines(r.lines), linesPlacement: pick(r.linesPlacement, ["afterText", "afterQr"], DEFAULTS.linesPlacement),
    logo: cleanLogo(r.logo), logoPlacement: cleanLogoPlacement(r.logoPlacement),
    logoMm: num(r.logoMm, "logoMm"), logoPct: num(r.logoPct, "logoPct"),
  };
}

// ───── Logo ─────
const cleanLogoPlacement = (v: unknown): LogoPlacement => (v === "inside" || v === "none" ? v : v === "beside" || v === "left" || v === "middle" || v === "right" ? "beside" : DEFAULTS.logoPlacement);
/** A valid order of the three parts. Old stored data had `swap` and a left/middle/right logo: they become the same order. */
function cleanOrder(r: Record<string, unknown>): Part[] {
  const o = r.order;
  if (Array.isArray(o) && o.length === 3 && PARTS.every((p) => o.includes(p))) return [...o] as Part[];
  const base: Part[] = r.swap === true ? ["qr", "text"] : ["text", "qr"];
  return r.logoPlacement === "middle" ? [base[0], "logo", base[1]] : r.logoPlacement === "right" ? [...base, "logo"] : ["logo", ...base];
}
/** Free drag, fixed places: the place a dragged part snaps to is the place whose centre is nearest to where the part's centre now is.
 *  centres = the parts' centres along the row (or column) in order, from = the dragged one, delta = how far it moved along it. */
export function nearestPlace(centres: number[], from: number, delta: number): number {
  const at = centres[from] + delta;
  return centres.reduce((best, c, i) => (Math.abs(c - at) < Math.abs(centres[best] - at) ? i : best), from);
}
/** Resizing a part on the canvas: the part's size at pick-up times ratio, snapped to clean steps (text 0.5 pt, mm 0.5, % 1). start.qrMm = the QR's drawn size
 *  in mm at pick-up (when its size is automatic). The result goes through clampSettings like every other change. */
export function resizePatch(part: Part, start: { fontPt: number; logoMm: number; logoPct: number; qrMm: number }, inside: boolean, ratio: number): Partial<Settings> {
  const snap = (v: number, step: number) => Math.max(step, Math.round((v * ratio) / step) * step);
  return part === "text" ? { fontPt: snap(start.fontPt, 0.5) } : part === "qr" ? { qrSizeMm: snap(start.qrMm, 0.5) } : inside ? { logoPct: snap(start.logoPct, 1) } : { logoMm: snap(start.logoMm, 0.5) };
}
/** The parts that are drawn, in their places: the logo only when it is a part of its own. */
export const partsShown = (s: Pick<Settings, "order" | "logo" | "logoPlacement">): Part[] => s.order.filter((p) => p !== "logo" || (!!s.logo && s.logoPlacement === "beside"));
/** Put `part` at place `to` of the drawn parts; the part that was there takes its old place (never two in one place). */
export function placePart(s: Pick<Settings, "order" | "logo" | "logoPlacement">, part: Part, to: number): Part[] {
  const target = partsShown(s)[to], out = [...s.order];
  if (!target || target === part) return out;
  const a = out.indexOf(part), b = out.indexOf(target);
  [out[a], out[b]] = [out[b], out[a]];
  return out;
}
export const LOGO_MAX_FILE = 3 * 1024 * 1024, LOGO_MAX_SIDE = 600, LOGO_WARN_PCT = 30, LOGO_DATA_MAX = 4_000_000;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
/** Only an image data URL of a sane size is kept; anything else (a link, text, a huge string) is dropped, so stored data can never inject markup. */
export const cleanLogo = (v: unknown): string => (typeof v === "string" && /^data:image\/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= LOGO_DATA_MAX ? v : "");
/** A chosen file -> the plain message key to show, or null when it is fine. */
export const logoFileError = (f: { type: string; size: number }): "logoBadType" | "logoTooBig" | null =>
  !LOGO_TYPES.includes(f.type) ? "logoBadType" : f.size > LOGO_MAX_FILE ? "logoTooBig" : null;
/** The size a raster logo is redrawn at: the longest side at most 600 px, the ratio kept, never enlarged. */
export function downscaleSize(w: number, h: number, max: number = LOGO_MAX_SIDE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
/** The logo shows only when there is one and the choice is not "No logo". */
export const logoShown = (s: Pick<Settings, "logo" | "logoPlacement">): boolean => !!s.logo && s.logoPlacement !== "none";
export const logoInside = (s: Pick<Settings, "logo" | "logoPlacement">): boolean => !!s.logo && s.logoPlacement === "inside";
/** The QR error level really used: H while a logo sits inside the code (the logo hides part of it), else the person's choice. */
export const effectiveLevel = (s: Pick<Settings, "logo" | "logoPlacement" | "level">): QrLevel => (logoInside(s) ? "H" : s.level);
/** Plain warning when the inside logo is so big the code may stop scanning. */
export const logoTooBigForQr = (s: Pick<Settings, "logo" | "logoPlacement" | "logoPct">): boolean => logoInside(s) && s.logoPct > LOGO_WARN_PCT;
/** The logo and its white backing square inside the QR svg box (size = modules + quiet zone, same units as the viewBox). pct is % of the module area width. */
export function qrLogoBox(size: number, quiet: number, pct: number): { x: number; y: number; side: number; backX: number; backSide: number } {
  const side = ((size - 2 * quiet) * pct) / 100, backSide = side * 1.1;
  return { x: (size - side) / 2, y: (size - side) / 2, side, backX: (size - backSide) / 2, backSide };
}

const LINE_TEXT_MAX = 200;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
/** Any value -> a valid list of extra lines, any count: non-objects are dropped, each field is clamped or falls back (old stored JSON has no list: empty). */
export function normaliseLines(raw: unknown): ExtraLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((r) => ({
    text: typeof r.text === "string" ? r.text.slice(0, LINE_TEXT_MAX) : "",
    fontPt: num(r.fontPt, "fontPt"), align: pick(r.align, ["inherit", "left", "center", "right"], "inherit"),
    bold: r.bold === true, keepBlank: r.keepBlank === true,
  }));
}
/** A fresh line (the label's own size until the person changes it). */
export const newLine = (fontPt: number = DEFAULTS.fontPt): ExtraLine => ({ text: "", fontPt, align: "inherit", bold: false, keepBlank: false });
export const addLine = (lines: ExtraLine[], fontPt?: number): ExtraLine[] => [...lines, newLine(fontPt)];
export const removeLine = (lines: ExtraLine[], i: number): ExtraLine[] => lines.filter((_, j) => j !== i);
export const updateLine = (lines: ExtraLine[], i: number, patch: Partial<ExtraLine>): ExtraLine[] => lines.map((l, j) => (j === i ? { ...l, ...patch } : l));
/** Move line i up (-1) or down (+1); at an end it stays where it is. */
export function moveLine(lines: ExtraLine[], i: number, dir: -1 | 1): ExtraLine[] {
  const j = i + dir;
  if (i < 0 || i >= lines.length || j < 0 || j >= lines.length) return lines;
  const out = [...lines];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** The extra lines of one label, in order. Typed label: the list's own texts. Excel label: the cells of columns C onward, styled by the line at the same
 *  index in the list (the label's own size and defaults when the list is shorter). An empty text prints nothing, unless that line says keepBlank. */
export function buildLines(s: Pick<Settings, "lines" | "fontPt">, item: LabelItem): RenderLine[] {
  const texts = item.extra ?? s.lines.map((l) => l.text);
  const out: RenderLine[] = [];
  texts.forEach((raw, i) => {
    const st = s.lines[i] ?? newLine(s.fontPt), text = (raw ?? "").trim();
    if (!text && !st.keepBlank) return;
    out.push({ text: text || "\u00A0", fontPt: st.fontPt, align: st.align, bold: st.bold });
  });
  return out;
}

/** One Excel row -> a label: A = free text, B = QR content, C onward = extra line texts (all trimmed, empty cells kept as empty strings). */
export function rowToItem(row: unknown[]): LabelItem {
  const c = (v: unknown) => String(v ?? "").trim();
  const extra = row.slice(2).map(c);
  return { text: c(row[0]), code: c(row[1]), ...(extra.length ? { extra } : {}) };
}
export const hasContent = (i: LabelItem): boolean => !!(i.text || i.code || i.extra?.some(Boolean));

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

// ───── Saved state: everything on the page, in one versioned key ─────
export const STATE_KEY = "test-printer-state-v2", BATCH_MAX_JSON = 1_500_000;
export type SavedState = { settings: Settings; text: string; code: string; batch: LabelItem[]; batchName: string };
export const defaultState = (): SavedState => ({ settings: clampSettings({}), text: "", code: "", batch: [], batchName: "" });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
function cleanBatch(raw: unknown): LabelItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isObj).map((r) => ({
    text: str(r.text, 2000), code: str(r.code, 2000),
    ...(Array.isArray(r.extra) ? { extra: r.extra.map((x) => str(x, LINE_TEXT_MAX)) } : {}),
  })).filter(hasContent);
}
/** The stored texts -> a valid state. v2 wins; else the old settings-only key; broken or missing data gives the defaults field by field. */
export function loadState(v2: string | null | undefined, legacy: string | null | undefined): SavedState {
  let o: unknown;
  try { o = v2 ? JSON.parse(v2) : null; } catch { o = null; }
  if (isObj(o) && o.v === 2) {
    return { settings: clampSettings(o.settings), text: str(o.text, 200), code: str(o.code, 500), batch: cleanBatch(o.batch), batchName: str(o.batchName, 200) };
  }
  return { ...defaultState(), settings: parseSettings(legacy) };
}
/** The state -> the JSON to store. A batch whose JSON is over about 1.5 MB is left out (batchDropped = tell the person). */
export function saveState(st: SavedState): { json: string; batchDropped: boolean } {
  const big = JSON.stringify(st.batch).length > BATCH_MAX_JSON;
  return { json: JSON.stringify({ v: 2, ...st, ...(big ? { batch: [], batchName: "" } : {}) }), batchDropped: big };
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
export function layoutCss(s: Settings): { box: Css; text: Css; qr: Css; group: Css } {
  const stacked = s.direction === "stacked";
  const dir = stacked ? "column" : "row";
  const self = s.align === "left" ? "flex-start" : s.align === "right" ? "flex-end" : "center";
  const fixed = s.qrSizeMm > 0;
  return {
    box: { display: "flex", flexDirection: dir, alignItems: "center", justifyContent: "center", gap: mm(s.gapMm), padding: mm(s.paddingMm), width: "100%", height: "100%", boxSizing: "border-box", direction: "ltr", overflow: "hidden" },
    text: { margin: 0, fontFamily: "Arial, Helvetica, sans-serif", fontSize: `${s.fontPt}pt`, lineHeight: 1.15, textAlign: s.align, whiteSpace: "pre", minWidth: 0, flex: stacked ? "none" : "1 1 0", maxWidth: "100%" },
    qr: {
      display: "block", minWidth: 0, minHeight: 0, marginTop: mm(s.qrTopMm),
      ...(fixed ? { flex: "none", width: mm(s.qrSizeMm), height: mm(s.qrSizeMm), alignSelf: stacked ? self : "center" } : { flex: "1 1 0", width: "100%", height: "100%" }),
    },
    // Used only when extra lines exist: text+lines (afterText) or QR+lines (afterQr) share one column so the lines stay glued to what they go under, swap or not.
    group: { display: "flex", flexDirection: "column", alignItems: "stretch", minWidth: 0, minHeight: 0, maxWidth: "100%", flex: (s.linesPlacement === "afterText" ? stacked : fixed) ? "none" : "1 1 0" },
  };
}

/** The logo as a part of its own: a square it fits in, never shrunk by the other parts. */
export const logoCss = (s: Pick<Settings, "logoMm">): Css => ({ display: "block", flex: "none", width: mm(s.logoMm), height: mm(s.logoMm), objectFit: "contain", alignSelf: "center" });

/** The style of one extra line: the text style with its own size, alignment (inherit = the label's) and weight. */
export function lineCss(s: Settings, l: RenderLine): Css {
  return { ...layoutCss(s).text, flex: "none", fontSize: `${l.fontPt}pt`, textAlign: l.align === "inherit" ? s.align : l.align, fontWeight: l.bold ? 700 : 400 };
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

export const PX_PER_MM = 96 / 25.4;
/** How much to enlarge or shrink a label (mm sized) to fit a preview box of boxW x boxH px, never above 8x (a 38 mm roll label still fills the canvas). */
export const previewZoom = (p: { w: number; h: number }, boxW: number, boxH: number): number =>
  Math.max(0, Math.min(8, boxW / (p.w * PX_PER_MM), boxH / (p.h * PX_PER_MM)));

// ───── The saved profile: the Test printer's look, applied to every QR label the ERP prints (owner, 2026-11-09) ─────
/** Only the print styling of the page's Settings. Never the test content (free text, QR content, Excel batch, copies) and never the texts of the extra lines (their size, alignment and weight are kept). */
export type LabelProfile = { v: 1 } & Omit<Settings, "copies" | "lines"> & { lines: ExtraLine[] };

export function profileFromSettings(s: Settings): LabelProfile {
  const style: Partial<Settings> = { ...s };
  delete style.copies;
  return { v: 1, ...(style as Omit<Settings, "copies" | "lines">), lines: s.lines.map((l) => ({ ...l, text: "", keepBlank: false })) };
}
/** The profile as the Settings the one label renderer takes (one copy; the ERP lists every label itself). */
export const settingsFromProfile = (p: LabelProfile): Settings => clampSettings({ ...p, copies: 1 });

/** Anything from the server is untrusted: not an object or not version 1 gives null; else every field is clamped like the page does and the logo must pass cleanLogo. */
export function cleanProfile(raw: unknown): LabelProfile | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  return profileFromSettings(clampSettings(raw));
}
/** Same look? (compares the cleaned forms, so a field order or an out-of-range value never makes a false difference) */
export const sameProfile = (a: LabelProfile | null, b: LabelProfile | null): boolean =>
  a === b || (!!a && !!b && JSON.stringify(cleanProfile(a)) === JSON.stringify(cleanProfile(b)));

/** The ERP label to draw: its name is the text line, its code is the QR, and the printed data follow as extra lines (code in words, then karat and weight). */
export function pieceLabelItem(l: { pieceCode?: unknown; itemName?: unknown; categoryName?: unknown; karat?: unknown; weight?: unknown }, fmt: { karat: (karat: unknown) => string; weight: (mg: unknown) => string; gram: string }): LabelItem {
  const code = String(l.pieceCode ?? "").trim(), name = String(l.itemName ?? l.categoryName ?? "").trim();
  return { text: name, code, extra: [code, `${fmt.karat(l.karat)} · ${fmt.weight(l.weight)} ${fmt.gram}`] };
}

/** The one decision: the profile is used only for the tag roll (QR labels) and only when a valid profile exists and every label of the print is a QR label (a barcode label keeps the old sheet). */
export function profileForPrint(layout: "tag" | "a4", profile: unknown, kinds: unknown[]): LabelProfile | null {
  return layout === "tag" && kinds.length > 0 && kinds.every((k) => k === "qr") ? cleanProfile(profile) : null;
}
