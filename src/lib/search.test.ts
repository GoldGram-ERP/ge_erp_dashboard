import { describe, expect, it } from "vitest";
import { matchesText, norm, otherLayout, swapLayout } from "./search";

describe("search is forgiving", () => {
  it("reads Arabic spelled loosely as the same word", () => {
    expect(norm("أَحْمَد")).toBe(norm("احمد"));
    expect(matchesText("فاتوره", "الفاتورة")).toBe(true);
    expect(matchesText("٢٠٢٦", "invoice 2026")).toBe(true);
  });
  it("needs every word, in any order, and finds words inside longer ones", () => {
    expect(matchesText("bank masr", "Bank Masr · Bank Masr")).toBe(true);
    expect(matchesText("masr bank", "Bank Masr")).toBe(true);
    expect(matchesText("bank ahly", "Bank Masr")).toBe(false);
  });
  it("finds the thing when the wrong keyboard layout was on", () => {
    expect(swapLayout("ضصث")).toBe("qwe");
    expect(swapLayout("qwe")).toBe("ضصث");
    expect(matchesText("lfduhj", "مبيعات")).toBe(true);        // "مبيعات" typed on an English keyboard
    expect(matchesText("شسي", "asd report")).toBe(true);        // Latin typed on an Arabic keyboard
    expect(matchesText("lfduhj", "treasuries")).toBe(false);
    expect(otherLayout("مبيعات")).toBe("lfduhj");
  });
  it("forgives one wrong letter in a longer word, not in a short one", () => {
    expect(matchesText("invoise", "Invoices")).toBe(true);
    expect(matchesText("ab", "ac")).toBe(false);
  });
  it("an empty query matches everything", () => { expect(matchesText("", "x")).toBe(true); });
});
