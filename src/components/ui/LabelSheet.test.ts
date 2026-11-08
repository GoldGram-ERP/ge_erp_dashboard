import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { A4_PER_PAGE, Sheet, pageSize } from "./LabelSheet";

// The label sheet is what the print window holds: one label per piece, nothing else (no app markup).
const tr = { t: (_ns: string, k: string, v?: Record<string, string | number>) => `${k}${v ? JSON.stringify(v) : ""}` } as never;
const piece = (i: number) => ({ pieceCode: `P${i}`, labelKind: "qr", itemName: "Ring", karat: "21", weight: 2500, tagPrice: 0 });
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
    expect(pageSize("tag")).toBe("30mm 10mm;margin:0");
    expect(pageSize("a4")).toBe("A4;margin:10.7mm 4.7mm");
  });
});

describe("the text of a label fits its size", () => {
  it("a 30 x 10 mm tag sets its four lines small (5.5pt, tight lines) so the code and the price are not cut off; an A4 label keeps 7pt", () => {
    const tag = html(1, "tag"), a4 = html(1, "a4");
    expect(tag).toContain("width:30mm;height:10mm");
    expect(tag).toContain("font-size:5.5pt");
    expect(tag).toContain("line-height:1.1");
    expect(a4).toContain("font-size:7pt");
    expect(a4).toContain("line-height:1.3");
  });
  it("four lines of 5.5pt at line height 1.1 are at most the 10 mm of the label", () => {
    const mm = (pt: number) => (pt * 25.4) / 72;
    expect(4 * mm(5.5) * 1.1).toBeLessThanOrEqual(10);
    expect(4 * mm(7) * 1.3).toBeGreaterThan(10);   // why the 7pt text was cut off
  });
});
