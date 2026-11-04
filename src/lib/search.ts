// One way to search, everywhere (pages, jobs, questions, select lists, list boxes).
// A person types however comes first, and finds the thing:
//  - Arabic spelled loosely: diacritics, tatweel, أ إ آ ا, ى ي ئ, ة ه, ؤ و, Arabic digits and punctuation do not matter;
//  - several words in any order: every word must be found (and is found inside a longer word too);
//  - the wrong keyboard layout: "ضصث" typed on an English keyboard shows as "qwe", and Arabic typed on an Arabic layout while the
//    keyboard was English gives "sdhra"-style text: both read as the other language's letters;
//  - a typo: one letter more, less or different in a word of five or more letters.

export const norm = (s: unknown): string =>
  String(s ?? "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ئ/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[‎‏‪-‮]/g, "")
    .replace(/[^\p{L}\p{N}\s.]/gu, " ")
    .replace(/\s+/g, " ").trim();

// The standard Arabic keyboard (the Arabic 101 layout) against the US layout, key by key.
const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,./`";
const AR = "ضصثقفغعهخحجدشسيبلاتنمكطئءؤرلاىةوزظذ";
const ENKEYS = [...EN], ARKEYS = ["ض", "ص", "ث", "ق", "ف", "غ", "ع", "ه", "خ", "ح", "ج", "د", "ش", "س", "ي", "ب", "ل", "ا", "ت", "ن", "م", "ك", "ط", "ئ", "ء", "ؤ", "ر", "لا", "ى", "ة", "و", "ز", "ظ", "ذ"];
void AR;
const toAr = new Map(ENKEYS.map((k, i) => [k, ARKEYS[i]]));
const toEn = new Map<string, string>();
ARKEYS.forEach((a, i) => { if (!toEn.has(a)) toEn.set(a, ENKEYS[i]); });
toEn.set("أ", "h"); toEn.set("إ", "h"); toEn.set("آ", "h"); toEn.set("ي", "d"); toEn.set("ى", "n");

/** Text typed on the other language's keyboard, read as that language: "ضصث" <-> "qwe". */
export const swapLayout = (s: string): string => {
  const src = String(s ?? "").toLowerCase();
  const arabic = /[؀-ۿ]/.test(src);
  return arabic ? [...src].map((c) => toEn.get(c) ?? c).join("") : [...src].map((c) => toAr.get(c) ?? c).join("");
};

// One edit apart (insert, delete or replace one letter), for words of five letters or more.
const near = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

const hasWord = (hay: string, words: string[], token: string): boolean =>
  hay.includes(token) || (token.length >= 5 && words.some((w) => near(w, token) || (w.length > token.length && near(w.slice(0, token.length), token))));

const allFound = (hay: string, query: string): boolean => {
  const tokens = norm(query).split(" ").filter(Boolean);
  if (!tokens.length) return true;
  const words = hay.split(" ");
  return tokens.every((t) => hasWord(hay, words, t));
};

/** Does `text` (or any of `texts`) answer what was typed? Empty query matches everything. */
export const matchesText = (query: unknown, ...texts: unknown[]): boolean => {
  const q = String(query ?? "").trim();
  if (!q) return true;
  const hay = norm(texts.flat().filter((t) => t !== undefined && t !== null).join(" "));
  if (allFound(hay, q)) return true;
  const swapped = swapLayout(q);
  return swapped !== q.toLowerCase() && allFound(hay, swapped);
};

/** The other reading of a typed query (wrong keyboard layout), or "" when it reads the same. */
export const otherLayout = (query: string): string => { const s = swapLayout(query); return s !== query.toLowerCase() ? s : ""; };

export const filterBy = <T>(items: T[], query: string, text: (item: T) => unknown): T[] => (query.trim() ? items.filter((i) => matchesText(query, text(i))) : items);
