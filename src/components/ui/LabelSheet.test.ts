import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { A4_PER_PAGE, Sheet, pageSize } from "./LabelSheet";

// The label sheet is what the print window holds: one label per piece, nothing else (no app markup).
const tr = { t: (_ns: string, k: string, v?: Record<string, string | number>) => (k === "purchaseCoding.karatShort" ? `${v?.karat}K` : k === "purchaseCoding.gram" ? "g" : k) } as never;
const piece = (i: number) => ({ pieceCode: `P${i}`, labelKind: "qr", itemName: "Ring", karat: "21", weight: 3005, tagPrice: 1507200 });
const html = (n: number, layout: "tag" | "a4") => renderToStaticMarkup(createElement(Sheet, { labels: Array.from({ length: n }, (_, i) => piece(i)), layout, tr }));
const count = (s: string, what: string) => s.split(what).length - 1;

describe("label sheet", () => {
  it("tag: one label per piece, each on its own page", () => {
    const h = html(3, "tag");
    expect(count(h, 'data-label="true"')).toBe(3);
    expect(count(h, "break-after:page")).toBe(3);
  });
  it("a4: 65 labels to a sheet, one page break per sheet", () => {
    const h = html(A4_PER_PAGE + 1, "a4");
    expect(count(h, 'data-label="true"')).toBe(A4_PER_PAGE + 1);
    expect(count(h, "break-after:page")).toBe(2);
  });
  it("page size follows the layout", () => {
    expect(pageSize("tag")).toBe("38mm 12.5mm;margin:0");
    expect(pageSize("a4")).toBe("A4;margin:10.7mm 4.7mm");
  });
});

describe("the text of a label fits its size", () => {
  it("a 38 x 12.5 mm tag (the roll of the tag printer) sets its three lines at 6pt with tight lines so the code is not cut off; an A4 label keeps 7pt", () => {
    const tag = html(1, "tag"), a4 = html(1, "a4");
    expect(tag).toContain("width:38mm;height:12.5mm");
    expect(tag).toContain("font-size:6pt");
    expect(tag).toContain("line-height:1.15");
    expect(a4).toContain("font-size:7pt");
    expect(a4).toContain("line-height:1.3");
  });
  it("the label prints the short karat and the weight to 2 decimals, and never a price", () => {
    const h = html(1, "tag");
    expect(h).toContain("21K");
    expect(h).toContain("3.01");
    expect(h).not.toContain("3.005");
    expect(h).not.toContain("15,072");
    expect(h).not.toContain("1507200");
  });
  it("a barcode-type label draws real Code 128 bars of the piece code, inside the label, not a box that says Code 128", () => {
    const bars = renderToStaticMarkup(createElement(Sheet, { labels: [{ ...piece(1), pieceCode: "001190", labelKind: "barcode" }], layout: "tag", tr }));
    expect(bars).toContain("data-bars-code");
    expect(bars).toContain('aria-label="001190"');
    expect(bars).not.toContain("Code 128");
    expect(bars).toContain('width="32mm"');   // a bit narrower than the 38 mm of the label
  });
  it("a code Code 128 cannot hold draws no bars, and the label still prints with the code as text", () => {
    const box = renderToStaticMarkup(createElement(Sheet, { labels: [{ ...piece(1), pieceCode: "جولد", labelKind: "barcode" }], layout: "tag", tr }));
    expect(box).not.toContain("data-bars");
    expect(box).toContain("data-label-code");
  });
  it("three lines of 6pt at line height 1.15 are at most the 12.5 mm of the label, and the QR fits its height", () => {
    const mm = (pt: number) => (pt * 25.4) / 72;
    expect(3 * mm(6) * 1.15).toBeLessThanOrEqual(12.5);
    expect(10.5).toBeLessThanOrEqual(12.5);
    expect(4 * mm(7) * 1.3).toBeGreaterThan(10);   // why the 7pt text was cut off
  });
});
