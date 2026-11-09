import { describe, expect, it } from "vitest";
import { NAV, canOpen, findLeaf } from "@/nav/tree";
import { DEFAULTS, clampSettings, frameCss, labelList, layoutCss, pageSize, pageSizeCss, parseSettings, place, previewZoom, printCss, rotation, type Rotate } from "./printer-label-rules";

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
    const s = clampSettings({ widthMm: 5, heightMm: 999, fontPt: 1, paddingMm: -3, gapMm: 99, qrTopMm: 500, qrSizeMm: -1, copies: 150.6 });
    expect([s.widthMm, s.heightMm, s.fontPt, s.paddingMm, s.gapMm, s.qrTopMm, s.qrSizeMm, s.copies]).toEqual([10, 300, 4, 0, 20, 30, 0, 100]);
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
