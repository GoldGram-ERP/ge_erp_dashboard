import { describe, expect, it, vi } from "vitest";
import config, { csp } from "../../next.config.mjs";
import { clearRemembered } from "./session";
import { esc } from "./format";

describe("response headers", () => {
  it("serves a Content-Security-Policy that limits scripts, frames and forms to this site", async () => {
    const rules = await (config as any).headers();
    const h = Object.fromEntries(rules[0].headers.map((x: any) => [x.key, x.value]));
    expect(h["Content-Security-Policy"]).toBe(csp);
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/script-src[^;]*https?:/);
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "connect-src 'self'"]) expect(csp).toContain(d);
    expect(h["Strict-Transport-Security"]).toMatch(/max-age=\d{7,}/);
    expect(h["Permissions-Policy"]).toContain("camera=(self)");
    expect(h["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });
});

describe("what a signed-out browser keeps", () => {
  it("removes the remembered person and the persisted query cache", () => {
    const removeItem = vi.fn();
    clearRemembered({ removeItem });
    expect(removeItem.mock.calls.map((c) => c[0]).sort()).toEqual(["ge-erp:last-activity", "ge-erp:me", "ge-erp:query", "ge-erp:session-lock"]);
  });
});

describe("print pages escape backend text", () => {
  it("esc neutralises markup and attribute breakouts", () => {
    expect(esc(`<img src=x onerror=alert(1)>"'&`)).toBe("&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;");
  });
});
