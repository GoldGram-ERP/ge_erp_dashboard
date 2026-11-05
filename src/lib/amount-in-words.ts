// An amount written in words, for the invoice print ("فقط وقدره ... لا غير"): whole piastres in, pounds and piastres out.
// Pure and exact (no floats). Arabic follows the cheque way of writing: the noun takes its form from the number
// (جنيه واحد، جنيهان، ٣–١٠ جنيهات، ١١–٩٩ جنيهاً، مائة جنيه), and the numbers stay in the nominative (ستون، أربعون).
// The most the system holds is 99,999,999,999.99 (MAX_PIASTRES), so the largest scale is the billion.

const AR_ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
const AR_TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const AR_HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
// one / two / 3–10 / 11–99 (accusative) of each scale
const AR_SCALES = [
  { one: "ألف", two: "ألفان", few: "آلاف", many: "ألفاً" },
  { one: "مليون", two: "مليونان", few: "ملايين", many: "مليوناً" },
  { one: "مليار", two: "ملياران", few: "مليارات", many: "ملياراً" },
];
const AR_POUND = { one: "جنيه واحد", two: "جنيهان", few: "جنيهات", many: "جنيهاً", plain: "جنيه" };
const AR_PIASTRE = { one: "قرش واحد", two: "قرشان", few: "قروش", many: "قرشاً", plain: "قرش" };

const below1000Ar = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(AR_HUNDREDS[h]);
  if (r) parts.push(r < 20 ? AR_ONES[r] : r % 10 ? `${AR_ONES[r % 10]} و${AR_TENS[Math.floor(r / 10)]}` : AR_TENS[r / 10]);
  return parts.join(" و");
};

/** 1 / 2 / 3–10 / 11–99 / the rest (0, 100, 101…): which form of a counted noun a number takes. */
const formOf = (n: number): "one" | "two" | "few" | "many" | "plain" => {
  if (n === 1) return "one";
  if (n === 2) return "two";
  const r = n % 100;
  return r >= 3 && r <= 10 ? "few" : r >= 11 ? "many" : "plain";
};

const groupsOf = (n: number): number[] => {            // [billions, millions, thousands, units]
  const out: number[] = [];
  for (let i = 0; i < 4; i++) { out.unshift(n % 1000); n = Math.floor(n / 1000); }
  return out;                                           // anything above 999 billion is ignored: it cannot be saved
};

const wordsAr = (n: number): string => {
  const g = groupsOf(n), parts: string[] = [];
  for (let i = 0; i < 3; i++) {                         // billions, millions, thousands
    const v = g[i];
    if (!v) continue;
    const s = AR_SCALES[2 - i], f = formOf(v);
    // The last scale before the noun is joined to it ("اثنا عشر ألف جنيه", "ألفا جنيه"); with more words after it, it stands alone ("تسعون ألفاً و...").
    const last = !g.slice(i + 1).some(Boolean);
    const dual = last ? s.two.slice(0, -1) : s.two;
    parts.push(v === 1 ? s.one : v === 2 ? dual : f === "few" ? `${below1000Ar(v)} ${s.few}` : f === "many" && !last ? `${below1000Ar(v)} ${s.many}` : `${below1000Ar(v)} ${s.one}`);
  }
  if (g[3]) parts.push(below1000Ar(g[3]));
  return parts.join(" و");
};

const countedAr = (n: number, noun: typeof AR_POUND): string => {
  const f = formOf(n);
  return f === "one" || f === "two" ? noun[f] : `${wordsAr(n)} ${noun[f]}`;
};

const EN_ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["billion", "million", "thousand"];

const below1000En = (n: number): string => {
  const h = Math.floor(n / 100), r = n % 100, parts: string[] = [];
  if (h) parts.push(`${EN_ONES[h]} hundred`);
  if (r) parts.push(r < 20 ? EN_ONES[r] : r % 10 ? `${EN_TENS[Math.floor(r / 10)]}-${EN_ONES[r % 10]}` : EN_TENS[r / 10]);
  return parts.join(" ");
};
const wordsEn = (n: number): string => {
  const g = groupsOf(n), parts: string[] = [];
  for (let i = 0; i < 3; i++) if (g[i]) parts.push(`${below1000En(g[i])} ${EN_SCALES[i]}`);
  if (g[3]) parts.push(below1000En(g[3]));
  return parts.join(" ");
};

/** `piastres` whole piastres written as pounds and piastres, e.g. 9036344 → "تسعون ألفاً وثلاثمائة وثلاثة وستون جنيهاً وأربعة وأربعون قرشاً". */
export function amountInWords(piastres: number, lang: "ar" | "en"): string {
  const total = Math.max(0, Math.trunc(Number(piastres) || 0));
  const pounds = Math.floor(total / 100), cents = total % 100;
  if (lang === "ar") {
    if (total === 0) return "صفر جنيه";
    return [pounds ? countedAr(pounds, AR_POUND) : "", cents ? countedAr(cents, AR_PIASTRE) : ""].filter(Boolean).join(" و");
  }
  if (total === 0) return "zero pounds";
  const p = pounds ? `${wordsEn(pounds)} ${pounds === 1 ? "pound" : "pounds"}` : "";
  const c = cents ? `${wordsEn(cents)} ${cents === 1 ? "piastre" : "piastres"}` : "";
  return [p, c].filter(Boolean).join(" and ");
}
