import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The saved server answers (localStorage "ge-erp:query") must not outlive the build that saved them, and no list may be marked fresh forever: after a deploy
// the Users form still offered the old screens, without the new Customer orders one, for up to a day (owner, 2026-11-25).
describe("the saved query cache", () => {
  it("is tied to the build's version, so a new deploy starts clean", () => {
    const source = readFileSync("src/components/providers.tsx", "utf8");
    expect(source).toMatch(/buster: DASHBOARD_VERSION/);
    expect(source).not.toMatch(/buster: "[^"]*"/);
  });
  it("no query is marked fresh forever", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && /staleTime:\s*Infinity/.test(readFileSync(path, "utf8"))) hits.push(path);
      }
    };
    walk("src");
    expect(hits).toEqual([]);
  });
});
