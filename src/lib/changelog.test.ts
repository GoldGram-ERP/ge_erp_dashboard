import { describe, expect, it } from "vitest";
import { CHANGELOG, canSeeChangelog, compareVersions, latestVersion, unseenCount } from "./changelog";
import { allLeaves } from "@/nav/tree";
import pkg from "../../package.json";
import raw from "../../changelog/changelog.json";
import { addChange, problemsOfChange, stampNext } from "../../scripts/changelog.mjs";

const ARABIC = /[؀-ۿ]/;

describe("What's new data", () => {
  it("lists versions newest first, once each, with a date that never goes forward in time", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version), `${CHANGELOG[i - 1].version} before ${CHANGELOG[i].version}`).toBeGreaterThan(0);
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date, `${CHANGELOG[i].version} date`).toBe(true);
    }
    for (const r of CHANGELOG) { expect(r.version).toMatch(/^\d+\.\d+\.\d+$/); expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(r.changes.length).toBeGreaterThan(0); }
  });

  it("writes every line in both languages: Arabic with Arabic letters, English with none", () => {
    for (const r of CHANGELOG) for (const c of r.changes) {
      expect(["new", "better", "fixed"]).toContain(c.kind);
      expect(c.en.trim().length, `${r.version} en`).toBeGreaterThan(10);
      expect(ARABIC.test(c.en), `${r.version} en has Arabic: ${c.en.slice(0, 30)}`).toBe(false);
      expect(ARABIC.test(c.ar), `${r.version} ar has no Arabic: ${c.en.slice(0, 30)}`).toBe(true);
    }
  });

  it("every 'open the screen' address is a real menu page, Home or the page itself", () => {
    const routes = new Set([...allLeaves().map((l) => l.route), "/", "/whats-new"]);
    for (const r of CHANGELOG) for (const c of r.changes) if (c.route) expect(routes.has(c.route), `${r.version}: ${c.route}`).toBe(true);
  });
});

describe("who sees it, and what is unseen", () => {
  it("only the Admin and the Super admin", () => {
    expect(canSeeChangelog("admin")).toBe(true);
    expect(canSeeChangelog("super_admin")).toBe(true);
    expect(canSeeChangelog("user")).toBe(false);
    expect(canSeeChangelog(undefined)).toBe(false);
    expect(canSeeChangelog(null)).toBe(false);
  });

  it("compares versions as numbers, not text", () => {
    expect(compareVersions("1.0.16", "1.0.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.9", "1.0.16")).toBeLessThan(0);
    expect(compareVersions("1.0.5", "1.0.5")).toBe(0);
    expect(compareVersions("1.1.0", "1.0.99")).toBeGreaterThan(0);
  });

  it("counts the versions a person has not looked at", () => {
    expect(unseenCount(null)).toBe(CHANGELOG.length);
    expect(unseenCount(latestVersion())).toBe(0);
    expect(unseenCount("1.0.14")).toBe(CHANGELOG.filter((r) => compareVersions(r.version, "1.0.14") > 0).length);
    expect(unseenCount("0.0.1")).toBe(CHANGELOG.length);
  });
});

describe("the system that adds lines (scripts/changelog.mjs)", () => {
  const line = { kind: "new", en: "A line about something new.", ar: "سطر عن شيء جديد." };
  it("the file is valid, with at most one unreleased block, first", () => {
    const r = raw as { version: string; changes: unknown[] }[];
    expect(r.filter((x) => x.version === "next").length).toBeLessThanOrEqual(1);
    expect(r.findIndex((x) => x.version === "next")).toBeLessThanOrEqual(0);
    for (const x of r) for (const c of x.changes) expect(problemsOfChange(c), x.version).toEqual([]);
  });
  it("the newest released version is the package version, or one behind while the release is being cut", () => {
    expect(compareVersions(pkg.version, latestVersion())).toBeGreaterThanOrEqual(0);
  });
  it("add creates the unreleased block once and refuses a bad line", () => {
    const d = addChange(addChange([{ version: "1.0.1", date: "2026-11-04", changes: [] }], line), { ...line, kind: "fixed" });
    expect(d[0].version).toBe("next");
    expect(d[0].changes).toHaveLength(2);
    expect(d).toHaveLength(2);
    expect(() => addChange([], { ...line, en: "Arabic عربي here ok" })).toThrow();
    expect(() => addChange([], { ...line, kind: "other" })).toThrow();
    expect(() => addChange([], { ...line, ar: "english only here" })).toThrow();
    expect(() => addChange([], { ...line, route: "sales" })).toThrow();
  });
  it("the release stamps the version and date, and is refused without lines", () => {
    const d = stampNext(addChange([], line), "1.0.17", "2026-11-06");
    expect(d[0]).toMatchObject({ version: "1.0.17", date: "2026-11-06" });
    expect(() => stampNext([], "1.0.17", "2026-11-06")).toThrow();
    expect(() => stampNext([{ version: "1.0.16", date: "2026-11-05", changes: [line] }], "1.0.17", "2026-11-06")).toThrow();
  });
});
