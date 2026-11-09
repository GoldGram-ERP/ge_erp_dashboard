import { describe, expect, it } from "vitest";
import { NAV, canOpen, findLeaf } from "@/nav/tree";
import { BATCH_MAX_JSON, DEFAULTS, STATE_KEY, addLine, buildLines, cleanLogo, clampSettings, defaultState, downscaleSize, effectiveLevel, frameCss, hasContent, labelList, layoutCss, lineCss, loadState, logoFileError, logoShellCss, logoTooBigForQr, qrLogoBox, saveState, moveLine, normaliseLines, pageSize, pageSizeCss, parseSettings, place, previewZoom, printCss, removeLine, rotation, rowToItem, updateLine, type ExtraLine, type Rotate } from "./printer-label-rules";

const S = (o: object = {}) => clampSettings({ ...DEFAULTS, ...o });

describe("page size", () => {
  it("landscape is long x short, portrait is short x long, whatever order was typed", () => {
    expect(pageSize(S({ widthMm: 60, heightMm: 40, orientation: "landscape" }))).toEqual({ w: 60, h: 40 });
    expect(pageSize(S({ widthMm: 40, heightMm: 60, orientation: "landscape" }))).toEqual({ w: 60, h: 40 });
    expect(pageSize(S({ widthMm: 60, heightMm: 40, orientation: "portrait" }))).toEqual({ w: 40, h: 60 });
    expect(pageSize(S({ widthMm: 40, heightMm: 60, orientation: "portrait" }))).toEqual({ w: 40, h: 60 });
  });
  it("a square label has the same page both ways, and the @page text carries mm", () => {
    expect(pageSize(S({ widthMm: 50, heightMm: 50, orientation: "landscape" }))).toEqual({ w: 50, h: 50 });
    expect(pageSizeCss(S({ widthMm: 38, heightMm: 12.5, orientation: "landscape" }))).toBe("38mm 12.5mm");
    expect(printCss(S({ widthMm: 60, heightMm: 40, orientation: "landscape" }))).toContain("@page{size:60mm 40mm;margin:0}");
  });
});

describe("rotation fills the page exactly", () => {
  const page = { w: 60, h: 40 };
  for (const deg of [0, 90, 180, 270] as Rotate[]) {
    it(`${deg} degrees: the four corners of the content box land on the four corners of the page`, () => {
      const r = rotation(page, deg);
      const pts = [[0, 0], [r.w, 0], [0, r.h], [r.w, r.h]].map(([x, y]) => place(r, deg, x, y));
      const xs = pts.map((p) => Math.round(p[0] * 1000) / 1000), ys = pts.map((p) => Math.round(p[1] * 1000) / 1000);
      expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, page.w, 0, page.h]);
    });
  }
  it("90 and 270 swap the box, 0 and 180 keep it", () => {
    expect(rotation(page, 90)).toMatchObject({ w: 40, h: 60 });
    expect(rotation(page, 270)).toMatchObject({ w: 40, h: 60 });
    expect(rotation(page, 0)).toMatchObject({ w: 60, h: 40 });
    expect(rotation(page, 180)).toMatchObject({ w: 60, h: 40 });
  });
  it("the css carries the same move and rotation", () => {
    expect(rotation(page, 90).transform).toBe("translate(60mm, 0mm) rotate(90deg)");
    expect(rotation(page, 270).transform).toBe("translate(0mm, 40mm) rotate(270deg)");
    expect(rotation(page, 180).transform).toBe("translate(60mm, 40mm) rotate(180deg)");
    expect(rotation(page, 0).transform).toBe("none");
  });
  it("frameCss sizes the frame as the page and the inner box as the turned box", () => {
    const f = frameCss(S({ widthMm: 60, heightMm: 40, orientation: "landscape", rotate: 90 }));
    expect([f.outer.width, f.outer.height, f.inner.width, f.inner.height]).toEqual(["60mm", "40mm", "40mm", "60mm"]);
  });
});

describe("settings", () => {
  it("bad, empty or missing JSON gives the defaults", () => {
    expect(parseSettings("{nope")).toEqual(DEFAULTS);
    expect(parseSettings(null)).toEqual(DEFAULTS);
    expect(parseSettings("")).toEqual(DEFAULTS);
    expect(parseSettings("[1,2]")).toEqual(DEFAULTS);
    expect(parseSettings("null")).toEqual(DEFAULTS);
  });
  it("a partial object merges over the defaults", () => {
    expect(parseSettings('{"widthMm":50,"orientation":"landscape"}')).toEqual({ ...DEFAULTS, widthMm: 50, orientation: "landscape" });
  });
  it("numbers are clamped to their range, copies is a whole number, junk falls back", () => {
    const s = clampSettings({ widthMm: 0.4, heightMm: 5000, fontPt: 0.5, paddingMm: -3, gapMm: 999, qrTopMm: 9999, qrSizeMm: -1, copies: 150.6 });
    expect([s.widthMm, s.heightMm, s.fontPt, s.paddingMm, s.gapMm, s.qrTopMm, s.qrSizeMm, s.copies]).toEqual([1, 1000, 1, 0, 100, 500, 0, 100]);
    expect(clampSettings({ widthMm: 38.25, heightMm: 12.375 })).toMatchObject({ widthMm: 38.25, heightMm: 12.375 });
    expect(clampSettings({ copies: 2.4 }).copies).toBe(2);
    expect(clampSettings({ widthMm: "abc", heightMm: NaN, fontPt: null }).widthMm).toBe(DEFAULTS.widthMm);
    expect(clampSettings({ widthMm: "55" }).widthMm).toBe(55);
  });
  it("words outside the allowed set fall back to the default", () => {
    const s = clampSettings({ orientation: "diagonal", direction: "x", rotate: 45, align: "justify", level: "Z", swap: "yes" });
    expect([s.orientation, s.direction, s.rotate, s.align, s.level, s.swap]).toEqual(["portrait", "stacked", 0, "center", "M", false]);
    expect(clampSettings({ rotate: 270 }).rotate).toBe(270);
  });
});

describe("copies", () => {
  const a = { text: "a", code: "1" }, b = { text: "b", code: "2" };
  it("each label is repeated in a row, clamped to 1..100", () => {
    expect(labelList([a, b], 2)).toEqual([a, a, b, b]);
    expect(labelList([a], 0)).toEqual([a]);
    expect(labelList([a], 500)).toHaveLength(100);
    expect(labelList([], 3)).toEqual([]);
  });
});

describe("layout direction and order", () => {
  it("stacked is a column, side by side is a row, swap reverses", () => {
    expect(layoutCss(S({ direction: "stacked" })).box.flexDirection).toBe("column");
    expect(layoutCss(S({ direction: "stacked", swap: true })).box.flexDirection).toBe("column-reverse");
    expect(layoutCss(S({ direction: "side" })).box.flexDirection).toBe("row");
    expect(layoutCss(S({ direction: "side", swap: true })).box.flexDirection).toBe("row-reverse");
  });
  it("the layout keeps left-to-right whatever the page language, and the gap, padding, font, align and top offset reach the css", () => {
    const l = layoutCss(S({ gapMm: 2, paddingMm: 3, fontPt: 20, align: "right", qrTopMm: 4 }));
    expect([l.box.direction, l.box.gap, l.box.padding, l.text.fontSize, l.text.textAlign, l.qr.marginTop]).toEqual(["ltr", "2mm", "3mm", "20pt", "right", "4mm"]);
  });
  it("QR size 0 fills the space, a size fixes it", () => {
    expect(layoutCss(S({ qrSizeMm: 0 })).qr).toMatchObject({ flex: "1 1 0", width: "100%" });
    expect(layoutCss(S({ qrSizeMm: 25 })).qr).toMatchObject({ flex: "none", width: "25mm", height: "25mm" });
  });
});

describe("preview", () => {
  it("fits the box on the tighter side and never passes 4x", () => {
    const z = previewZoom({ w: 100, h: 10 }, 360, 300);
    expect(z).toBeCloseTo(360 / (100 * (96 / 25.4)), 5);
    expect(previewZoom({ w: 10, h: 10 }, 5000, 5000)).toBe(4);
  });
});

describe("the Test printer page is Admin only (the address uses the nav leaf's screens)", () => {
  const leaf = findLeaf("/setup/test-printer");
  it("the leaf exists under setup and holds exactly the Settings screen key", () => {
    expect(leaf?.id).toBe("test-printer");
    expect(leaf?.group.id).toBe("setup");
    expect(leaf?.screens).toEqual(["administration/settings"]);
    expect(NAV.find((g) => g.id === "setup")?.items.map((i) => i.id)).toContain("test-printer");
  });
  it("a person without that key is refused, one with it may open (same check as the sidebar and the address)", () => {
    expect(canOpen({ screens: ["sales/invoices", "money/cash"] }, leaf!.screens)).toBe(false);
    expect(canOpen({ screens: ["administration/settings"] }, leaf!.screens)).toBe(true);
    expect(canOpen(null, leaf!.screens)).toBe(false);
  });
  it("its screen key is the one the Workmanship and cashback leaf uses, so both are given to the same people", () => {
    expect(findLeaf("/setup/item-fees")?.screens).toEqual(leaf?.screens);
  });
});

describe("extra lines", () => {
  const L = (o: object = {}): ExtraLine => ({ text: "x", fontPt: 10, align: "inherit", bold: false, keepBlank: false, ...o });
  it("old stored JSON without lines loads with none; bad data falls back", () => {
    expect(parseSettings(JSON.stringify({ widthMm: 50 })).lines).toEqual([]);
    expect(parseSettings(JSON.stringify({ lines: "nope", linesPlacement: "sideways" }))).toMatchObject({ lines: [], linesPlacement: "afterText" });
  });
  it("any count is kept; junk entries are dropped; each value is clamped or defaulted", () => {
    const many = Array.from({ length: 250 }, (_, i) => L({ text: `t${i}` }));
    expect(normaliseLines(many)).toHaveLength(250);
    const got = normaliseLines([null, 5, "s", [1], L({ fontPt: 9999, align: "up", bold: "yes", text: 7 }), { fontPt: "12.375", text: "k" }]);
    expect(got).toEqual([
      { text: "", fontPt: 200, align: "inherit", bold: false, keepBlank: false },
      { text: "k", fontPt: 12.375, align: "inherit", bold: false, keepBlank: false },
    ]);
    expect(normaliseLines([L({ fontPt: 0 })])[0].fontPt).toBe(1);
    expect(normaliseLines([L({ text: "a".repeat(500) })])[0].text).toHaveLength(200);
  });
  it("the list survives a round trip through the stored text, with the placement", () => {
    const s = S({ lines: [L({ text: "a", bold: true, align: "right", keepBlank: true })], linesPlacement: "afterQr" });
    expect(parseSettings(JSON.stringify(s))).toEqual(s);
  });
  it("add, remove, update and move", () => {
    const a = L({ text: "a" }), b = L({ text: "b" }), c = L({ text: "c" });
    expect(addLine([a], 9)).toEqual([a, { text: "", fontPt: 9, align: "inherit", bold: false, keepBlank: false }]);
    expect(removeLine([a, b, c], 1)).toEqual([a, c]);
    expect(updateLine([a, b], 1, { bold: true })).toEqual([a, { ...b, bold: true }]);
    expect(moveLine([a, b, c], 1, -1)).toEqual([b, a, c]);
    expect(moveLine([a, b, c], 1, 1)).toEqual([a, c, b]);
    expect(moveLine([a, b, c], 0, -1)).toEqual([a, b, c]);
    expect(moveLine([a, b, c], 2, 1)).toEqual([a, b, c]);
  });
  it("a typed label prints its lines in order, each with its own style; an empty one prints nothing", () => {
    const s = S({ fontPt: 14, lines: [L({ text: "one", fontPt: 8.5, bold: true, align: "left" }), L({ text: "  " }), L({ text: "three" })] });
    expect(buildLines(s, { text: "t", code: "" })).toEqual([
      { text: "one", fontPt: 8.5, align: "left", bold: true },
      { text: "three", fontPt: 10, align: "inherit", bold: false },
    ]);
  });
  it("keep blank keeps the row (a non-breaking space) so spacing can be controlled", () => {
    const s = S({ lines: [L({ text: "", keepBlank: true })] });
    expect(buildLines(s, { text: "", code: "" })).toEqual([{ text: " ", fontPt: 10, align: "inherit", bold: false }]);
  });
  it("an Excel label uses the cells for the text and the list for the style by index; beyond the list the defaults", () => {
    const s = S({ fontPt: 14, lines: [L({ text: "typed ignored", fontPt: 6, bold: true })] });
    expect(buildLines(s, { text: "", code: "", extra: ["c1", "", "e1"] })).toEqual([
      { text: "c1", fontPt: 6, align: "inherit", bold: true },
      { text: "e1", fontPt: 14, align: "inherit", bold: false },
    ]);
    expect(buildLines(S(), { text: "", code: "" })).toEqual([]);
  });
  it("Excel rows: A text, B code, C onward extra lines; a row with only extra cells still counts", () => {
    expect(rowToItem([" a ", 7, "c", null, "e"])).toEqual({ text: "a", code: "7", extra: ["c", "", "e"] });
    expect(rowToItem(["a"])).toEqual({ text: "a", code: "" });
    expect(hasContent(rowToItem([null, null, "only"]))).toBe(true);
    expect(hasContent(rowToItem([null, null, ""]))).toBe(false);
  });
  it("placement decides what the group wraps; lines take their own size, weight and alignment (inherit = the label's)", () => {
    expect(layoutCss(S({ direction: "stacked", linesPlacement: "afterText" })).group.flex).toBe("none");
    expect(layoutCss(S({ direction: "side", linesPlacement: "afterText" })).group.flex).toBe("1 1 0");
    expect(layoutCss(S({ qrSizeMm: 20, linesPlacement: "afterQr" })).group.flex).toBe("none");
    expect(layoutCss(S({ qrSizeMm: 0, linesPlacement: "afterQr" })).group.flex).toBe("1 1 0");
    const s = S({ align: "right" });
    expect(lineCss(s, { text: "x", fontPt: 7.25, align: "inherit", bold: true })).toMatchObject({ fontSize: "7.25pt", fontWeight: 700, textAlign: "right" });
    expect(lineCss(s, { text: "x", fontPt: 7, align: "left", bold: false })).toMatchObject({ fontWeight: 400, textAlign: "left" });
  });
});

const PNG = "data:image/png;base64,iVBORw0KGgo=";
describe("logo", () => {
  it("only a small image data URL is kept; links, other types and huge strings fall back to no logo", () => {
    expect(cleanLogo(PNG)).toBe(PNG);
    expect(cleanLogo("https://x.test/a.png")).toBe("");
    expect(cleanLogo("data:text/html;base64,PHNjcmlwdD4=")).toBe("");
    expect(cleanLogo(`data:image/png;base64,${"A".repeat(4_000_001)}`)).toBe("");
    expect(cleanLogo(5)).toBe("");
  });
  it("placement falls back to Left; the size is clamped in mm (left/middle/right) and in % (inside), decimals kept", () => {
    expect(S({ logoPlacement: "inside" }).logoPlacement).toBe("inside");
    expect(S({ logoPlacement: "top" }).logoPlacement).toBe("left");
    expect(S({ logoMm: 12.5 }).logoMm).toBe(12.5);
    expect(S({ logoMm: 99999 }).logoMm).toBe(500);
    expect(S({ logoMm: -3 }).logoMm).toBe(0.5);
    expect(S({ logoPct: 22.5 }).logoPct).toBe(22.5);
    expect(S({ logoPct: 400 }).logoPct).toBe(100);
    expect(DEFAULTS.logoPct).toBe(20);
  });
  it("the QR level is forced to H only while a logo is inside the code", () => {
    expect(effectiveLevel(S({ level: "L", logo: PNG, logoPlacement: "inside" }))).toBe("H");
    expect(effectiveLevel(S({ level: "L", logo: PNG, logoPlacement: "left" }))).toBe("L");
    expect(effectiveLevel(S({ level: "L", logo: "", logoPlacement: "inside" }))).toBe("L");
    expect(effectiveLevel(S({ level: "Q", logo: PNG, logoPlacement: "none" }))).toBe("Q");
  });
  it("warns above 30 percent, only when the logo is inside", () => {
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "inside", logoPct: 30 }))).toBe(false);
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "inside", logoPct: 30.5 }))).toBe(true);
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "left", logoPct: 90 }))).toBe(false);
  });
  it("files: png, jpg, webp, svg pass; others and over 3 MB are refused with a plain key", () => {
    expect(logoFileError({ type: "image/png", size: 1000 })).toBeNull();
    expect(logoFileError({ type: "image/svg+xml", size: 3 * 1024 * 1024 })).toBeNull();
    expect(logoFileError({ type: "image/gif", size: 10 })).toBe("logoBadType");
    expect(logoFileError({ type: "application/pdf", size: 10 })).toBe("logoBadType");
    expect(logoFileError({ type: "image/png", size: 3 * 1024 * 1024 + 1 })).toBe("logoTooBig");
  });
  it("downscale: longest side at most 600, ratio kept, never enlarged", () => {
    expect(downscaleSize(1200, 600)).toEqual({ w: 600, h: 300 });
    expect(downscaleSize(300, 1500)).toEqual({ w: 120, h: 600 });
    expect(downscaleSize(200, 100)).toEqual({ w: 200, h: 100 });
    expect(downscaleSize(600, 600)).toEqual({ w: 600, h: 600 });
    expect(downscaleSize(5000, 1)).toEqual({ w: 600, h: 1 });
  });
  it("inside the QR: a centred square of pct of the module area, with a slightly bigger backing square", () => {
    const b = qrLogoBox(29, 2, 20);
    expect(b.side).toBeCloseTo(5, 6);
    expect(b.x).toBeCloseTo(12, 6);
    expect(b.backSide).toBeGreaterThan(b.side);
    expect(b.backX + b.backSide / 2).toBeCloseTo(14.5, 6);
  });
  it("Left and Right are physical (row / row-reverse, direction ltr); Middle is a column", () => {
    expect(logoShellCss(S({ logoPlacement: "left" })).shell).toMatchObject({ flexDirection: "row", direction: "ltr" });
    expect(logoShellCss(S({ logoPlacement: "right" })).shell).toMatchObject({ flexDirection: "row-reverse", direction: "ltr" });
    expect(logoShellCss(S({ logoPlacement: "middle" })).shell).toMatchObject({ flexDirection: "column" });
    expect(logoShellCss(S({ logoMm: 7.5 })).logo).toMatchObject({ width: "7.5mm", height: "7.5mm" });
  });
});

describe("saved state", () => {
  const full = () => ({ ...defaultState(), settings: S({ widthMm: 50, logo: PNG, logoPlacement: "inside", logoPct: 25 }), text: "hi", code: "c1", batch: [{ text: "a", code: "b", extra: ["x"] }], batchName: "f.xlsx" });
  it("what is saved loads back the same", () => {
    expect(loadState(saveState(full()).json, null)).toEqual(full());
  });
  it("missing or broken data gives the defaults; the old settings-only key still loads", () => {
    expect(loadState(null, null)).toEqual(defaultState());
    expect(loadState("{not json", "also bad")).toEqual(defaultState());
    expect(loadState(JSON.stringify({ v: 2 }), null)).toEqual(defaultState());
    expect(loadState(JSON.stringify([1, 2]), null)).toEqual(defaultState());
    const old = loadState(null, JSON.stringify({ widthMm: 40, heightMm: 30, orientation: "landscape", level: "Q" }));
    expect(old.settings).toMatchObject({ widthMm: 40, heightMm: 30, orientation: "landscape", level: "Q", logo: "", logoPlacement: "left" });
    expect(old.text).toBe("");
  });
  it("the new key wins over the old one; wrong field types fall back field by field", () => {
    const st = loadState(JSON.stringify({ v: 2, settings: { widthMm: "abc", level: "H" }, text: 5, code: "k", batch: "no" }), JSON.stringify({ widthMm: 11 }));
    expect(st.settings).toMatchObject({ widthMm: DEFAULTS.widthMm, level: "H" });
    expect(st).toMatchObject({ text: "", code: "k", batch: [] });
  });
  it("a batch over about 1.5 MB is left out and flagged; a small one is kept", () => {
    const big = { ...full(), batch: Array.from({ length: 200 }, (_, i) => ({ text: `${i}`.repeat(10), code: "x".repeat(BATCH_MAX_JSON / 100) })) };
    const out = saveState(big);
    expect(out.batchDropped).toBe(true);
    expect(loadState(out.json, null).batch).toEqual([]);
    expect(loadState(out.json, null).settings.logo).toBe(PNG);
    expect(saveState(full()).batchDropped).toBe(false);
    expect(STATE_KEY).toBe("test-printer-state-v2");
  });
  it("reset gives exactly the defaults: no logo, no texts, no batch, default settings", () => {
    const d = defaultState();
    expect(d.settings).toEqual(clampSettings(DEFAULTS));
    expect(d).toEqual({ settings: DEFAULTS, text: "", code: "", batch: [], batchName: "" });
    expect(d.settings.logo).toBe("");
  });
});
