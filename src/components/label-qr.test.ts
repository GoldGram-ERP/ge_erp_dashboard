import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LabelQr } from "./label-qr";

describe("LabelQr", () => {
  it("renders the piece code as an SVG QR (viewBox square, a path, labelled for screen readers), not a text box", () => {
    const html = renderToStaticMarkup(createElement(LabelQr, { value: "88" }));
    expect(html).toMatch(/<svg[^>]*data-qr-code[^>]*viewBox="0 0 (\d+) \1"/);
    expect(html).toContain('aria-label="88"');
    expect(html).toMatch(/<path d="M\d+ \d+h/);
    expect(html).not.toContain(">QR<");
  });
});
