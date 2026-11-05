// What's new, version by version, in plain words, for the Admin and the Super admin only (owner, 2026-11-05).
// One entry per released dashboard version, newest first. Write for a person who runs the shop, not for a developer:
// what they can now do or no longer have to worry about, and where to see it. Every line is in Arabic and English.
//
// How to add one: `node scripts/changelog.mjs add --kind new --en "..." --ar "..." --route /menu/address` (scripts/changelog.mjs explains it).
// The release (scripts/release.mjs) stamps the version and date. Never edit this file or the JSON by hand to add a line.
import type { Me } from "@/stores/ui";

export type ChangeKind = "new" | "better" | "fixed";
export type Change = { kind: ChangeKind; ar: string; en: string; route?: string };
export type Release = { version: string; date: string; changes: Change[] };

// The data lives in changelog/changelog.json (see scripts/changelog.mjs). The first block, version "next", is the unreleased one: it is not shown.
import data from "../../changelog/changelog.json";
export const CHANGELOG: Release[] = (data as { version: string; date?: string; changes: Change[] }[]).filter((r): r is Release => r.version !== "next");

// Only the Admin and the Super admin see it (owner, 2026-11-05).
export const canSeeChangelog = (userType: Me["userType"] | undefined | null): boolean => userType === "admin" || userType === "super_admin";

export const latestVersion = (): string => CHANGELOG[0].version;

// "1.0.16" > "1.0.9": numbers, not text.
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d) return d; }
  return 0;
}

// The versions a person has not looked at yet: everything newer than the last one they saw (nothing seen: all).
export const unseenCount = (seen: string | null | undefined): number => CHANGELOG.filter((r) => !seen || compareVersions(r.version, seen) > 0).length;

export const SEEN_KEY = "ge-erp:whats-new-seen";
