import { describe, expect, test } from "vitest";
import { csp } from "../../next.config.mjs";
import { RUM_DATA_ORIGIN, RUM_SCRIPT_ORIGIN, RUM_TOKEN, rumSnippet } from "./rum";

describe("Better Stack real user monitoring tag", () => {
  test("is added to production builds, with the token and the dashboard version", () => {
    const tag = rumSnippet("abc123", "1.0.38+b652472", "production");
    expect(tag).toContain('"betterstack","abc123"');
    expect(tag).toContain(`${RUM_SCRIPT_ORIGIN}/b.js?t=`);
    expect(tag).toContain('"release":"1.0.38+b652472"');
    expect(tag).toContain('"environment":"production"');
  });

  test("is left out of development and test runs, and when there is no token", () => {
    expect(rumSnippet("abc123", "1.0.38", "development")).toBeNull();
    expect(rumSnippet("abc123", "1.0.38", "test")).toBeNull();
    expect(rumSnippet(undefined, "1.0.38", "production")).toBeNull();
    expect(rumSnippet("", "1.0.38", "production")).toBeNull();
  });

  test("refuses a token that could break out of the script", () => {
    expect(rumSnippet('abc");alert(1);//', "1.0.38", "production")).toBeNull();
  });

  test("the shipped token is a plain token", () => {
    expect(rumSnippet(RUM_TOKEN, "1.0.38", "production")).not.toBeNull();
  });
});

describe("the security policy lets the tag work and nothing more", () => {
  const directive = (name: string) => csp.split("; ").find((d: string) => d.startsWith(`${name} `)) ?? "";

  test("scripts may load from Better Stack's tag address", () => {
    expect(directive("script-src")).toContain(RUM_SCRIPT_ORIGIN);
  });

  test("the browser may send what it collects to Better Stack", () => {
    expect(directive("connect-src")).toContain(RUM_SCRIPT_ORIGIN);
    expect(directive("connect-src")).toContain(RUM_DATA_ORIGIN);
  });

  test("no other outside origin is allowed and frames stay closed", () => {
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("frame-src")).toBe("frame-src 'none'");
    expect(directive("img-src")).not.toContain("https:");
  });
});
