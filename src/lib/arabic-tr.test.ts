import { describe, expect, it } from "vitest";
import ar from "../../messages/ar.json";
import { arabicTr } from "./arabic-tr";
import type { Tr } from "./t";

// A printed invoice is Arabic only, even when the page is English (owner, 2026-11-10).
const english: Tr = { locale: "en", isAr: false, t: (_ns, k) => `EN:${k}`, L: (_a, e) => e, errorText: () => "EN error" };

describe("arabicTr", () => {
  const a = arabicTr(english);
  it("is Arabic whatever the page language", () => {
    expect([a.locale, a.isAr]).toEqual(["ar", true]);
    expect(a.t("gold-sales", "prints.title")).toBe((ar as any)["gold-sales"].prints.title);
    expect(a.t("gold-sales", "prints.title")).not.toMatch(/^EN:/);
    expect(a.L("عربي", "English")).toBe("عربي");
  });
  it("fills {values} and answers the key itself for a missing text", () => {
    const withValue = Object.entries((ar as any)["gold-sales"].prints).find(([, v]) => typeof v === "string" && (v as string).includes("{number}"));
    if (withValue) expect(a.t("gold-sales", `prints.${withValue[0]}`, { number: 7 })).toContain("7");
    expect(a.t("gold-sales", "prints.nope")).toBe("prints.nope");
  });
  it("api errors are Arabic too", () => {
    expect(a.errorText({ message: "no-such-error" })).toBe((ar as any).errors.unexpected);
  });
});
