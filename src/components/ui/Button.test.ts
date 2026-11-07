import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChromeButton } from "./Button";

const html = (props: Parameters<typeof ChromeButton>[0]) => renderToStaticMarkup(createElement(ChromeButton, props));

describe("ChromeButton", () => {
  it("icon is ic-btn, keeps id/aria/title, and never submits a form", () => {
    expect(html({ id: "x", "aria-label": "L", "aria-expanded": false, title: "T", className: "short" })).toBe('<button type="button" class="ic-btn short" id="x" aria-label="L" aria-expanded="false" title="T"></button>');
  });
  it("each kind maps to its existing class; bare has no class attribute", () => {
    expect(html({ kind: "pin", "aria-pressed": true })).toContain('class="pin" aria-pressed="true"');
    expect(html({ kind: "kbd" })).toContain('class="kbd-btn"');
    expect(html({ kind: "item", role: "option" })).toContain('class="pal-item"');
    expect(html({ kind: "more" })).toContain('class="pal-more"');
    expect(html({ kind: "sec" })).toContain('class="sec-head"');
    expect(html({ kind: "bare" })).not.toContain("class=");
  });
});
