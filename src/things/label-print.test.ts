import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { A4_PER_PAGE, Sheet, pageSize } from "./label-sheet";

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
