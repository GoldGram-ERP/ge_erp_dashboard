import { describe, expect, it } from "vitest";
import { amountInWords } from "./amount-in-words";

describe("amount in words, Arabic", () => {
  it("writes the sample of the preprinted invoice exactly", () => {
    expect(amountInWords(9_036_344, "ar")).toBe("تسعون ألفاً وثلاثمائة وثلاثة وستون جنيهاً وأربعة وأربعون قرشاً");
  });
  it("gives the noun the form of its number", () => {
    expect(amountInWords(100, "ar")).toBe("جنيه واحد");
    expect(amountInWords(200, "ar")).toBe("جنيهان");
    expect(amountInWords(500, "ar")).toBe("خمسة جنيهات");
    expect(amountInWords(1_100, "ar")).toBe("أحد عشر جنيهاً");
    expect(amountInWords(10_000, "ar")).toBe("مائة جنيه");
    expect(amountInWords(25_000, "ar")).toBe("مائتان وخمسون جنيهاً");
  });
  it("writes thousands and millions in their own forms", () => {
    expect(amountInWords(100_000, "ar")).toBe("ألف جنيه");
    expect(amountInWords(200_000, "ar")).toBe("ألفا جنيه");
    expect(amountInWords(300_000, "ar")).toBe("ثلاثة آلاف جنيه");
    expect(amountInWords(1_200_000, "ar")).toBe("اثنا عشر ألف جنيه");
    expect(amountInWords(1_210_000, "ar")).toBe("اثنا عشر ألفاً ومائة جنيه");
    expect(amountInWords(100_000_000, "ar")).toBe("مليون جنيه");
    expect(amountInWords(250_000_000, "ar")).toBe("مليونان وخمسمائة ألف جنيه");
  });
  it("writes piastres alone, and zero", () => {
    expect(amountInWords(1, "ar")).toBe("قرش واحد");
    expect(amountInWords(50, "ar")).toBe("خمسون قرشاً");
    expect(amountInWords(105, "ar")).toBe("جنيه واحد وخمسة قروش");
    expect(amountInWords(0, "ar")).toBe("صفر جنيه");
  });
  it("reaches the largest amount the system holds", () => {
    expect(amountInWords(9_999_999_999_999, "ar")).toBe("تسعة وتسعون ملياراً وتسعمائة وتسعة وتسعون مليوناً وتسعمائة وتسعة وتسعون ألفاً وتسعمائة وتسعة وتسعون جنيهاً وتسعة وتسعون قرشاً");
  });
});

describe("amount in words, English", () => {
  it("writes pounds and piastres", () => {
    expect(amountInWords(9_036_344, "en")).toBe("ninety thousand three hundred sixty-three pounds and forty-four piastres");
    expect(amountInWords(100, "en")).toBe("one pound");
    expect(amountInWords(101, "en")).toBe("one pound and one piastre");
    expect(amountInWords(50, "en")).toBe("fifty piastres");
    expect(amountInWords(0, "en")).toBe("zero pounds");
    expect(amountInWords(250_000_000, "en")).toBe("two million five hundred thousand pounds");
  });
});
