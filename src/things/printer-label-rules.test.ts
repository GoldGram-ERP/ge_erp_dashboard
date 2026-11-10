import { describe, expect, it } from "vitest";
import { NAV, canOpen, findLeaf } from "@/nav/tree";
import { labelGramsText } from "@/lib/format";
import { BATCH_MAX_JSON, DEFAULTS, STATE_KEY, addLine, buildLines, cleanLogo, clampSettings, defaultState, downscaleSize, effectiveLevel, frameCss, hasContent, labelList, layoutCss, lineCss, loadState, logoFileError, logoCss, partsShown, placePart, nearestPlace, resizePatch, resizeWidth, fitLabel, placeCss, logoTooBigForQr, qrLogoBox, saveState, moveLine, normaliseLines, pageSize, pageSizeCss, parseSettings, place, previewZoom, printCss, removeLine, rotation, rowToItem, updateLine, cleanProfile, pieceLabelItem, profileForPrint, profileFromSettings, sameProfile, settingsFromProfile, type ExtraLine, type Rotate } from "./printer-label-rules";
import { CROSSES, applyProfile, contentAxes, crossCentres, lookKey, nearestCross, syncChoice, toContent, type Cross } from "./printer-label-rules";

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
    expect([s.orientation, s.direction, s.rotate, s.align, s.level]).toEqual(["portrait", "stacked", 0, "center", "M"]);
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
  it("stacked is a column, side by side is a row; the order of the parts is `order`, not a reversed flex", () => {
    expect(layoutCss(S({ direction: "stacked" })).box.flexDirection).toBe("column");
    expect(layoutCss(S({ direction: "side" })).box.flexDirection).toBe("row");
  });
  it("text and extra lines never wrap: one line each, even when long", () => {
    expect(layoutCss(S({})).text.whiteSpace).toBe("pre");
    expect(lineCss(S({}), { text: "x", fontPt: 8, align: "inherit", bold: false }).whiteSpace).toBe("pre");
  });
  it("old stored data (swap, left/middle/right logo) becomes the same order; a bad order falls back", () => {
    expect(clampSettings({ swap: true, logoPlacement: "left" }).order).toEqual(["logo", "qr", "text"]);
    expect(clampSettings({ logoPlacement: "right" }).order).toEqual(["text", "qr", "logo"]);
    expect(clampSettings({ logoPlacement: "middle" }).order).toEqual(["text", "logo", "qr"]);
    expect(S({ order: ["qr", "qr", "text"] }).order).toEqual(["logo", "text", "qr"]);
    expect(S({ order: ["qr", "logo", "text"] }).order).toEqual(["qr", "logo", "text"]);
  });
  it("the logo is drawn as a part only when there is one and it has its own place; placing a part swaps it with the one there", () => {
    const o = { order: ["text", "logo", "qr"] as const };
    expect(partsShown({ ...o, order: [...o.order], logo: "", logoPlacement: "beside" })).toEqual(["text", "qr"]);
    expect(partsShown({ order: [...o.order], logo: PNG, logoPlacement: "inside" })).toEqual(["text", "qr"]);
    const s3 = { order: [...o.order], logo: PNG, logoPlacement: "beside" as const };
    expect(partsShown(s3)).toEqual(["text", "logo", "qr"]);
    expect(placePart(s3, "qr", 0)).toEqual(["qr", "logo", "text"]);
    expect(placePart(s3, "text", 0)).toEqual(["text", "logo", "qr"]);
  });
  it("the layout keeps left-to-right whatever the page language, and the gap, padding, font and align reach the css", () => {
    const l = layoutCss(S({ gapMm: 2, paddingMm: 3, fontPt: 20, align: "right" }));
    expect([l.box.direction, l.box.gap, l.box.padding, l.text.fontSize, l.text.textAlign]).toEqual(["ltr", "2mm", "3mm", "20pt", "right"]);
  });
  it("the QR is always a fixed square: its fitted size", () => {
    const s = S({ qrSizeMm: 25 });
    expect(layoutCss(s, fitLabel(s, { text: "", code: "X" })).qr).toMatchObject({ flex: "none", width: "25mm", height: "25mm" });
  });
});

describe("fit: nothing ever leaves the label", () => {
  // The owner's case: a 38 x 12.5 roll label in a row, a 23 mm QR and a 10 mm logo.
  const roll = S({ widthMm: 38, heightMm: 12.5, orientation: "landscape", direction: "side", qrSizeMm: 23, logo: PNG, logoPlacement: "beside", logoMm: 10, paddingMm: 1, gapMm: 0.5 });
  const item = { text: "Ingot 5g BTC", code: "GE-000123" };
  it("squares are no bigger than the free height of a row, and with the text they fit the width", () => {
    const f = fitLabel(roll, item);
    expect(f.qrMm).toBeLessThanOrEqual(10.5);
    expect(f.logoMm).toBeLessThanOrEqual(10.5);
    const textW = [...item.text].length * f.fontPt * (25.4 / 72) * 0.6;
    expect(f.qrMm + f.logoMm + textW + 2 * 0.5).toBeLessThanOrEqual(36 + 1e-6);
  });
  it("a long text is made smaller to stay on one line; a short one keeps its size", () => {
    const st = S({ widthMm: 50, heightMm: 30, orientation: "landscape", direction: "stacked", fontPt: 14, paddingMm: 1 });
    expect(fitLabel(st, { text: "Hi", code: "" }).fontPt).toBe(14);
    const long = "A very long product name that cannot fit";
    const f = fitLabel(st, { text: long, code: "" });
    expect(f.fontPt).toBeLessThan(14);
    expect([...long].length * f.fontPt * (25.4 / 72) * 0.6).toBeLessThanOrEqual(48 + 1e-6);
  });
  it("in a column the squares leave the text's height free", () => {
    const st = S({ widthMm: 30, heightMm: 20, orientation: "landscape", direction: "stacked", qrSizeMm: 50, fontPt: 10, paddingMm: 1, gapMm: 1 });
    const f = fitLabel(st, { text: "Ring", code: "X" });
    expect(f.qrMm + 10 * (25.4 / 72) * 1.15 + 1).toBeLessThanOrEqual(18 + 1e-6);
  });
  it("no QR content = no QR space taken", () => {
    expect(fitLabel(roll, { text: "x", code: "" }).qrMm).toBe(0);
  });
});

describe("text box width", () => {
  const st = S({ widthMm: 50, heightMm: 30, orientation: "landscape", direction: "stacked", fontPt: 14, paddingMm: 1 });
  it("old saved data without it loads as 0 (automatic); junk and negatives fall back or clamp", () => {
    expect(clampSettings({ widthMm: 50 }).textWidthMm).toBe(0);
    expect(DEFAULTS.textWidthMm).toBe(0);
    expect(clampSettings({ textWidthMm: "abc" }).textWidthMm).toBe(0);
    expect(clampSettings({ textWidthMm: -5 }).textWidthMm).toBe(0);
    expect(clampSettings({ textWidthMm: 5000 }).textWidthMm).toBe(1000);
    expect(cleanProfile({ v: 1, textWidthMm: 20 })?.textWidthMm).toBe(20);
  });
  it("0 keeps today's automatic box: no fixed width in the css", () => {
    const f = fitLabel(st, { text: "Hi", code: "" });
    expect(f.textMm).toBe(0);
    expect(layoutCss(st, f).text.width).toBeUndefined();
  });
  it("a set width is the drawn width, and the font shrinks to fit inside it", () => {
    const s = S({ ...st, textWidthMm: 20 }), text = "A long name here";
    const f = fitLabel(s, { text, code: "" });
    expect(f.textMm).toBe(20);
    expect(f.fontPt).toBeLessThan(14);
    expect([...text].length * f.fontPt * (25.4 / 72) * 0.6).toBeLessThanOrEqual(20 + 1e-6);
    expect(layoutCss(s, f).text).toMatchObject({ width: "20mm", flex: "none" });
  });
  it("a huge width never leaves the label: it stops at the room the label gives (column and row)", () => {
    expect(fitLabel(S({ ...st, textWidthMm: 1000 }), { text: "Hi", code: "" }).textMm).toBe(48);
    const row = S({ widthMm: 38, heightMm: 12.5, orientation: "landscape", direction: "side", paddingMm: 1, gapMm: 0.5, textWidthMm: 1000 });
    const f = fitLabel(row, { text: "Ring", code: "X" });
    expect(f.textMm + f.qrMm + 0.5).toBeLessThanOrEqual(36 + 1e-6);
  });
  it("lines under the text share its box; lines under the QR do not", () => {
    const s = S({ ...st, textWidthMm: 15, lines: [{ text: "A long extra line here", fontPt: 14, align: "inherit", bold: false, keepBlank: false }] });
    expect(fitLabel(s, { text: "x", code: "" }).linePts[0]).toBeLessThan(fitLabel({ ...s, linesPlacement: "afterQr" }, { text: "x", code: "" }).linePts[0]);
    expect(layoutCss(s, fitLabel(s, { text: "x", code: "" })).group.width).toBe("15mm");
    expect(layoutCss({ ...s, linesPlacement: "afterQr" }, fitLabel(s, { text: "x", code: "" })).group.width).toBeUndefined();
  });
  it("dragging the edge: start width plus the move in mm, snapped to 0.5, at least 1, at most the label's limit", () => {
    const px = 96 / 25.4;
    expect(resizeWidth(20, 10 * px, 1)).toBe(30);
    expect(resizeWidth(20, 10 * px * 4, 4)).toBe(30);
    expect(resizeWidth(20, 1.2 * px, 1)).toBe(21);
    expect(resizeWidth(20, -100 * px, 1)).toBe(1);
    expect(resizeWidth(20, 100 * px, 1, 48)).toBe(48);
    expect(resizeWidth(20, 100 * px, 1, 35.7)).toBe(35.5);
  });
});

describe("spread: together, to the edges, equal gaps", () => {
  const row = S({ widthMm: 60, heightMm: 15, orientation: "landscape", direction: "side", logo: PNG, logoPlacement: "beside", logoMm: 10, qrSizeMm: 10, paddingMm: 1, gapMm: 1, order: ["logo", "text", "qr"] });
  const item = { text: "test", code: "GE-1" };
  it("defaults to together and falls back to it for unknown words", () => {
    expect(S({}).spread).toBe("together");
    expect(S({ spread: "sideways" }).spread).toBe("together");
  });
  it("three parts to the edges: a [1fr auto 1fr] grid with the first at the start, the middle centred, the last at the end", () => {
    const s = { ...row, spread: "edges" as const }, f = fitLabel(s, item);
    expect(f.count).toBe(3);
    expect(layoutCss(s, f).box).toMatchObject({ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)" });
    expect([0, 1, 2].map((i) => placeCss(s, f, i).justifySelf)).toEqual(["start", "center", "end"]);
    expect(placeCss({ ...s, direction: "stacked" }, f, 2)).toEqual({ alignSelf: "end" });
  });
  it("two parts to the edges and equal gaps are a flex row; together stays centred; spread out, the text hugs its words", () => {
    const two = { ...row, logo: "", spread: "edges" as const };
    const f2 = fitLabel(two, item);
    expect(f2.count).toBe(2);
    expect(layoutCss(two, f2).box).toMatchObject({ display: "flex", justifyContent: "space-between" });
    expect(placeCss(two, f2, 0)).toEqual({});
    expect(layoutCss({ ...row, spread: "even" }, fitLabel({ ...row, spread: "even" }, item)).box.justifyContent).toBe("space-evenly");
    expect(layoutCss(row, fitLabel(row, item)).box.justifyContent).toBe("center");
    expect(layoutCss({ ...row, spread: "even" }).text.flex).toBe("0 1 auto");
    expect(layoutCss(row).text.flex).toBe("1 1 0");
  });
  it("to the edges keeps everything inside: with the text in the middle it gets the room between the two edge columns", () => {
    const s = { ...row, spread: "edges" as const }, f = fitLabel(s, { text: "A long product name here", code: "X" });
    const free = 58 - 2;
    const textW = [..."A long product name here"].length * f.fontPt * (25.4 / 72) * 0.6;
    expect(textW).toBeLessThanOrEqual(free - 2 * Math.max(f.qrMm, f.logoMm) + 1e-6);
  });
  it("with the text at an edge, the far square still fits its half and the text fits its column", () => {
    const s = { ...row, spread: "edges" as const, order: ["text", "logo", "qr"] as ("text" | "logo" | "qr")[] }, f = fitLabel(s, item);
    const free = 58 - 2;
    expect(f.logoMm + 2 * f.qrMm).toBeLessThanOrEqual(free * 0.8 + 1e-6);
  });
});

describe("free drag, fixed places", () => {
  it("a dragged part snaps to the place whose centre is nearest, staying put until it is nearer another", () => {
    const c = [50, 150, 250];
    expect(nearestPlace(c, 0, 0)).toBe(0);
    expect(nearestPlace(c, 0, 49)).toBe(0);
    expect(nearestPlace(c, 0, 51)).toBe(1);
    expect(nearestPlace(c, 0, 400)).toBe(2);
    expect(nearestPlace(c, 2, -120)).toBe(1);
    expect(nearestPlace(c, 2, -500)).toBe(0);
    expect(nearestPlace([50, 150], 1, -40)).toBe(1);
  });
});

describe("resize on the canvas", () => {
  const st = { fontPt: 10, logoMm: 8, logoPct: 20, qrMm: 11.3 };
  it("scales the picked part from its size at pick-up and snaps to clean steps", () => {
    expect(resizePatch("text", st, false, 1.26)).toEqual({ fontPt: 12.5 });
    expect(resizePatch("qr", st, false, 1)).toEqual({ qrSizeMm: 11.5 });
    expect(resizePatch("logo", st, false, 0.5)).toEqual({ logoMm: 4 });
    expect(resizePatch("logo", st, true, 1.13)).toEqual({ logoPct: 23 });
  });
  it("never reaches zero, however far it is shrunk", () => {
    expect(resizePatch("text", st, false, 0)).toEqual({ fontPt: 0.5 });
    expect(resizePatch("qr", st, false, -3)).toEqual({ qrSizeMm: 0.5 });
  });
});

describe("preview", () => {
  it("fits the box on the tighter side and never passes 8x", () => {
    const z = previewZoom({ w: 100, h: 10 }, 360, 300);
    expect(z).toBeCloseTo(360 / (100 * (96 / 25.4)), 5);
    expect(previewZoom({ w: 10, h: 10 }, 5000, 5000)).toBe(8);
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
  it("placement falls back to its own place; the size is clamped in mm (left/middle/right) and in % (inside), decimals kept", () => {
    expect(S({ logoPlacement: "inside" }).logoPlacement).toBe("inside");
    expect(S({ logoPlacement: "top" }).logoPlacement).toBe("beside");
    expect(S({ logoMm: 12.5 }).logoMm).toBe(12.5);
    expect(S({ logoMm: 99999 }).logoMm).toBe(500);
    expect(S({ logoMm: -3 }).logoMm).toBe(0.5);
    expect(S({ logoPct: 22.5 }).logoPct).toBe(22.5);
    expect(S({ logoPct: 400 }).logoPct).toBe(100);
    expect(DEFAULTS.logoPct).toBe(20);
  });
  it("the QR level is forced to H only while a logo is inside the code", () => {
    expect(effectiveLevel(S({ level: "L", logo: PNG, logoPlacement: "inside" }))).toBe("H");
    expect(effectiveLevel(S({ level: "L", logo: PNG, logoPlacement: "beside" }))).toBe("L");
    expect(effectiveLevel(S({ level: "L", logo: "", logoPlacement: "inside" }))).toBe("L");
    expect(effectiveLevel(S({ level: "Q", logo: PNG, logoPlacement: "none" }))).toBe("Q");
  });
  it("warns above 30 percent, only when the logo is inside", () => {
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "inside", logoPct: 30 }))).toBe(false);
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "inside", logoPct: 30.5 }))).toBe(true);
    expect(logoTooBigForQr(S({ logo: PNG, logoPlacement: "beside", logoPct: 90 }))).toBe(false);
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
  it("the logo part is a fixed square in mm that the other parts never shrink", () => {
    expect(logoCss(S({ logoMm: 7.5 }))).toMatchObject({ width: "7.5mm", height: "7.5mm", flex: "none" });
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
    expect(old.settings).toMatchObject({ widthMm: 40, heightMm: 30, orientation: "landscape", level: "Q", logo: "", logoPlacement: "beside" });
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

describe("the saved label profile", () => {
  const LOGO = "data:image/png;base64,AAAA";
  const tuned = S({ widthMm: 38, heightMm: 12.5, orientation: "landscape", direction: "side", order: ["qr", "text", "logo"], rotate: 90, fontPt: 6, align: "left", paddingMm: 0.5, gapMm: 1, qrTopMm: 0, qrSizeMm: 10.5, level: "Q", logo: LOGO, logoPlacement: "inside", logoPct: 18, copies: 5, linesPlacement: "afterQr", lines: [{ text: "secret", fontPt: 5, align: "right", bold: true, keepBlank: true }] });

  it("keeps the print styling and drops the test content (copies, line texts)", () => {
    const p = profileFromSettings(tuned);
    expect(p).toMatchObject({ v: 1, widthMm: 38, heightMm: 12.5, orientation: "landscape", direction: "side", order: ["qr", "text", "logo"], rotate: 90, fontPt: 6, align: "left", paddingMm: 0.5, gapMm: 1, qrTopMm: 0, qrSizeMm: 10.5, level: "Q", logo: LOGO, logoPlacement: "inside", logoPct: 18, linesPlacement: "afterQr" });
    expect("copies" in p).toBe(false);
    expect(p.lines).toEqual([{ text: "", fontPt: 5, align: "right", bold: true, keepBlank: false }]);
    expect(JSON.stringify(p)).not.toContain("secret");
  });
  it("survives the server round trip unchanged", () => {
    const p = profileFromSettings(tuned);
    expect(cleanProfile(JSON.parse(JSON.stringify(p)))).toEqual(p);
    expect(settingsFromProfile(p)).toEqual({ ...tuned, copies: 1, lines: p.lines });
  });
  it("junk from the server is null, never a half label", () => {
    for (const junk of [null, undefined, 5, "x", [], {}, { v: 2 }, { v: "1" }, { widthMm: 40 }]) expect(cleanProfile(junk)).toBeNull();
  });
  it("clamps like the page and drops a bad logo", () => {
    const p = cleanProfile({ v: 1, widthMm: -5, heightMm: 99999, fontPt: "abc", rotate: 45, level: "Z", orientation: "diagonal", logo: "https://evil/x.png", logoPlacement: "beside" });
    expect(p).toMatchObject({ widthMm: 1, heightMm: 1000, fontPt: DEFAULTS.fontPt, rotate: 0, level: "M", orientation: "portrait", logo: "" });
    expect(cleanProfile({ v: 1, logo: "data:image/svg+xml;base64,PHN2Zz4=" })!.logo).toBe("data:image/svg+xml;base64,PHN2Zz4=");
    expect(cleanProfile({ v: 1, logo: 'data:image/png;base64,AA"onerror="x' })!.logo).toBe("");
  });
  it("sameProfile tells a real change from none", () => {
    const a = profileFromSettings(tuned);
    expect(sameProfile(a, cleanProfile(JSON.parse(JSON.stringify(a))))).toBe(true);
    expect(sameProfile(a, profileFromSettings({ ...tuned, qrSizeMm: 9 }))).toBe(false);
    expect(sameProfile(a, null)).toBe(false);
    expect(sameProfile(null, null)).toBe(true);
  });

  const fmt = { karat: (k: unknown) => `${k}K`, weight: labelGramsText, gram: "g" };
  it("maps a piece: name -> text line, code -> QR, then code and karat/weight as extra lines in order", () => {
    const item = pieceLabelItem({ pieceCode: "001190", itemName: "Ring", categoryName: "Rings", karat: "21", weight: 3005 }, fmt);
    expect(item).toEqual({ text: "Ring", code: "001190", extra: ["001190", "21K · 3.01 g"] });
    const drawn = buildLines(S({ lines: [] }), item).map((l) => l.text);
    expect(drawn).toEqual(["001190", "21K · 3.01 g"]);
  });
  it("a returned customer piece prints its category as the name; no name leaves the text empty", () => {
    expect(pieceLabelItem({ pieceCode: "7", itemName: null, categoryName: "Bracelets", karat: "18", weight: 1000 }, fmt).text).toBe("Bracelets");
    expect(pieceLabelItem({ pieceCode: "7", karat: "18", weight: 1000 }, fmt).text).toBe("");
  });
  it("the extra lines take the saved style by position", () => {
    const s = settingsFromProfile(profileFromSettings(S({ lines: [{ text: "", fontPt: 4, align: "left", bold: true, keepBlank: false }, { text: "", fontPt: 5, align: "right", bold: false, keepBlank: false }] })));
    const lines = buildLines(s, pieceLabelItem({ pieceCode: "A1", itemName: "N", karat: "21", weight: 100 }, fmt));
    expect(lines.map((l) => [l.fontPt, l.align, l.bold])).toEqual([[4, "left", true], [5, "right", false]]);
  });

  it("is used only for the tag roll, QR labels and a valid profile", () => {
    const p = profileFromSettings(tuned);
    expect(profileForPrint("tag", p, ["qr", "qr"])).toEqual(p);
    expect(profileForPrint("a4", p, ["qr"])).toBeNull();
    expect(profileForPrint("tag", p, ["qr", "barcode"])).toBeNull();
    expect(profileForPrint("tag", p, [])).toBeNull();
    expect(profileForPrint("tag", null, ["qr"])).toBeNull();
    expect(profileForPrint("tag", { v: 9 }, ["qr"])).toBeNull();
  });
});

describe("across places: each part sits at the start, middle or end of the row (owner, 2026-11-10)", () => {
  const item = { text: "t", code: "X" };
  const css = (o: object, part: "text" | "qr" | "logo") => { const s = S({ logo: PNG, ...o }), l = layoutCss(s, fitLabel(s, item)); return part === "text" ? l.text.alignSelf : part === "qr" ? l.qr.alignSelf : logoCss(s).alignSelf; };
  it("a new label sits every part in the middle", () => {
    for (const p of ["text", "qr", "logo"] as const) expect(css({}, p)).toBe("center");
  });
  it("each part has its own place, side by side (top / middle / bottom) and stacked (start / middle / end)", () => {
    for (const direction of ["side", "stacked"]) {
      expect(css({ direction, cross: { text: "start", qr: "end", logo: "center" } }, "text")).toBe("flex-start");
      expect(css({ direction, cross: { text: "start", qr: "end", logo: "center" } }, "qr")).toBe("flex-end");
      expect(css({ direction, cross: { text: "start", qr: "end", logo: "center" } }, "logo")).toBe("center");
    }
  });
  it("the extra lines follow the part they sit under", () => {
    const s = S({ lines: [{ text: "a", fontPt: 8, align: "inherit", bold: false, keepBlank: false }], cross: { text: "end", qr: "start", logo: "center" } });
    expect(layoutCss(s).group.alignSelf).toBe("flex-end");
    expect(layoutCss({ ...s, linesPlacement: "afterQr" }).group.alignSelf).toBe("flex-start");
  });
  it("a wrong place falls back to the middle; a part left out too", () => {
    expect(S({ cross: { text: "left", qr: 3 } }).cross).toEqual({ text: "center", logo: "center", qr: "center" });
  });
  it("an old look (no places) prints as it did: the QR followed the alignment when stacked, the text only with a set width, side by side all middle", () => {
    const old = (o: object) => clampSettings(o).cross;
    expect(old({ direction: "stacked", align: "left" })).toEqual({ text: "center", logo: "center", qr: "start" });
    expect(old({ direction: "stacked", align: "right", textWidthMm: 20 })).toEqual({ text: "end", logo: "center", qr: "end" });
    expect(old({ direction: "stacked", align: "center", textWidthMm: 20 })).toEqual({ text: "center", logo: "center", qr: "center" });
    expect(old({ direction: "side", align: "right", textWidthMm: 20 })).toEqual({ text: "center", logo: "center", qr: "center" });
    expect(old({})).toEqual({ text: "center", logo: "center", qr: "center" });
  });
  it("a saved look keeps its places through the profile and back", () => {
    const s = S({ cross: { text: "start", qr: "end", logo: "center" } });
    expect(cleanProfile(profileFromSettings(s))?.cross).toEqual(s.cross);
    expect(settingsFromProfile(profileFromSettings(s)).cross).toEqual(s.cross);
  });
  it("to the edges with three parts, the grid cell is placed across as well as along", () => {
    const s = S({ spread: "edges", direction: "side", logo: PNG, cross: { text: "start", qr: "end", logo: "center" } }), f = fitLabel(s, item);
    expect(placeCss(s, f, 0, "logo")).toEqual({ justifySelf: "start", alignSelf: "center" });
    expect(placeCss(s, f, 2, "qr")).toEqual({ justifySelf: "end", alignSelf: "end" });
    expect(placeCss({ ...s, direction: "stacked" }, f, 2, "qr")).toEqual({ alignSelf: "end", justifySelf: "end" });
  });
});

describe("dragging across the row", () => {
  it("the three places of a part in the free room: start, middle, end", () => {
    expect(crossCentres(10, 110, 20)).toEqual([20, 60, 100]);
  });
  it("the nearest place wins; the part's own centre plus the move decides", () => {
    const c = crossCentres(0, 100, 20);
    expect(nearestCross(c, 12)).toBe("start");
    expect(nearestCross(c, 49)).toBe("center");
    expect(nearestCross(c, 95)).toBe("end");
    expect(nearestCross(c, 30 + 40)).toBe("center");
  });
  it("a turned label: a screen move becomes a move along the label's own axes", () => {
    expect(toContent(0, 5, 7)).toEqual({ x: 5, y: 7 });
    expect(toContent(90, 5, 7)).toEqual({ x: 7, y: -5 });
    expect(toContent(180, 5, 7)).toEqual({ x: -5, y: -7 });
    expect(toContent(270, 5, 7)).toEqual({ x: -7, y: 5 });
    expect(contentAxes(90)).toEqual({ x: [0, 1], y: [-1, 0] });
  });
});

describe("keeping the page and the saved look in step", () => {
  const A = S({ fontPt: 10 }), B = S({ fontPt: 22 }), C = S({ fontPt: 30 });
  const key = (x: ReturnType<typeof S>) => lookKey(profileFromSettings(x));
  const ask = (o: { serverKey: string; serverAt: string | null; styleKey: string; aligned: string | null; base: string | null }) => syncChoice(o);
  it("nothing saved: the page keeps what it has", () => {
    expect(ask({ serverKey: "", serverAt: null, styleKey: key(A), aligned: key(B), base: "t1" })).toBe("keep");
  });
  it("the page already shows the saved look", () => {
    expect(ask({ serverKey: key(B), serverAt: "t2", styleKey: key(B), aligned: key(A), base: "t1" })).toBe("same");
  });
  it("another Admin saved and this page has no changes of its own: the new look is shown without asking", () => {
    expect(ask({ serverKey: key(B), serverAt: "t2", styleKey: key(A), aligned: key(A), base: "t1" })).toBe("server");
  });
  it("an old copy kept by an earlier version (never matched a saved look): the saved look wins", () => {
    expect(ask({ serverKey: key(B), serverAt: "t2", styleKey: key(A), aligned: null, base: null })).toBe("server");
  });
  it("this page has unsaved changes and the saved look is the one they started from: keep them", () => {
    expect(ask({ serverKey: key(B), serverAt: "t2", styleKey: key(C), aligned: key(B), base: "t2" })).toBe("keep");
  });
  it("this page has unsaved changes and somebody saved a newer look: ask", () => {
    expect(ask({ serverKey: key(B), serverAt: "t3", styleKey: key(C), aligned: key(A), base: "t1" })).toBe("ask");
  });
  it("a change that was changed back is not a change", () => {
    expect(ask({ serverKey: key(B), serverAt: "t3", styleKey: key(A), aligned: key(A), base: "t1" })).toBe("server");
  });
  it("the key tells looks apart, logo included, and ignores nothing that prints", () => {
    expect(key(A)).not.toBe(key(B));
    expect(key(S({ logo: PNG }))).not.toBe(key(S({ logo: PNG.replace("iVBOR", "jVBOR") })));
    expect(key(S({ cross: { text: "start", qr: "center", logo: "center" } }))).not.toBe(key(S({})));
    expect(key(A)).toBe(key(S({ fontPt: 10, copies: 7 })));
  });
  it("showing the saved look keeps what was typed on the page (copies, the texts of the extra lines)", () => {
    const mine = S({ copies: 5, lines: [{ text: "typed", fontPt: 9, align: "inherit", bold: false, keepBlank: false }] });
    const saved = profileFromSettings(S({ fontPt: 33, lines: [{ text: "", fontPt: 12, align: "center", bold: true, keepBlank: false }] }));
    const out = applyProfile(mine, saved);
    expect([out.fontPt, out.copies, out.lines[0].text, out.lines[0].fontPt, out.lines[0].bold]).toEqual([33, 5, "typed", 12, true]);
    expect(key(out)).toBe(lookKey(cleanProfile(saved)));
  });
  it("every across place is one of the three", () => { expect(CROSSES.length).toBe(3); const c: Cross = "end"; expect(CROSSES).toContain(c); });
});

describe("the QR's words (its content) above or below the code", () => {
  const side = { direction: "side", orientation: "landscape", widthMm: 50, heightMm: 20, paddingMm: 1, qrSizeMm: 0 };
  const item = { text: "", code: "GE-0001" };
  const fit = (o: object, it = item) => { const s = S({ ...side, ...o }); return fitLabel(s, it); };
  it("a new label and an old look show no words", () => {
    expect(S({}).qrCaption).toBe("none");
    expect(clampSettings({ v: 1, widthMm: 40 }).qrCaption).toBe("none");
    expect(clampSettings({ qrCaption: "left", qrCaptionPt: "x", qrCaptionBold: 1 })).toMatchObject({ qrCaption: "none", qrCaptionPt: 6, qrCaptionBold: false });
    expect(S({ qrCaptionPt: 0 }).qrCaptionPt).toBe(1);
  });
  it("without words the QR is as big as it was; with them the code gives up one line of room so nothing leaves the label", () => {
    const none = fit({}), below = fit({ qrCaption: "below", qrCaptionPt: 6 }), above = fit({ qrCaption: "above", qrCaptionPt: 6 });
    const line = 6 * (25.4 / 72) * 1.15;
    expect(none.qrMm).toBe(18);
    expect(below.qrMm).toBeCloseTo(18 - line, 2);
    expect(above.qrMm).toBeCloseTo(18 - line, 2);
    expect(below.qrMm + line).toBeLessThanOrEqual(18.001);
  });
  it("stacked, the words take their line out of the height the parts share", () => {
    const st = { direction: "stacked", orientation: "portrait", widthMm: 30, heightMm: 30, paddingMm: 1, qrSizeMm: 0 };
    const a = fitLabel(S({ ...st }), item), b = fitLabel(S({ ...st, qrCaption: "below", qrCaptionPt: 8 }), item);
    expect(b.qrMm).toBeLessThan(a.qrMm);
    expect(b.qrMm + 8 * (25.4 / 72) * 1.15).toBeLessThanOrEqual(28.001);
  });
  it("no code, no words: nothing is taken from the QR", () => {
    expect(fit({ qrCaption: "below" }, { text: "t", code: "" }).qrMm).toBe(fit({}, { text: "t", code: "" }).qrMm);
  });
  it("a long text shrinks to the QR width and the size the person set is kept when it fits", () => {
    expect(fit({ qrCaption: "below", qrCaptionPt: 6 }).capPt).toBe(6);
    expect(fit({ qrCaption: "below", qrCaptionPt: 6 }, { text: "", code: "https://example.com/a/very/long/address/that/does/not/fit" }).capPt).toBeLessThan(6);
  });
  it("the css: centred under the code, as wide as the code, bold only when asked", () => {
    const s = S({ ...side, qrCaption: "below", qrCaptionPt: 7, qrCaptionBold: true }), f = fitLabel(s, item), l = layoutCss(s, f);
    expect(l.caption).toMatchObject({ width: `${f.qrMm}mm`, fontSize: "7pt", fontWeight: 700, textAlign: "center" });
    expect(layoutCss(S({ ...side, qrCaption: "below" })).caption.fontWeight).toBe(400);
    expect(l.qrGroup).toMatchObject({ flexDirection: "column", flex: "none" });
  });
  it("it is a part of the saved look", () => {
    const s = S({ qrCaption: "above", qrCaptionPt: 9, qrCaptionBold: true });
    expect(cleanProfile(profileFromSettings(s))).toMatchObject({ qrCaption: "above", qrCaptionPt: 9, qrCaptionBold: true });
    expect(lookKey(profileFromSettings(s))).not.toBe(lookKey(profileFromSettings(S({}))));
  });
});
