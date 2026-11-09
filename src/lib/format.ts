// Exact numbers, as the dashboard does them (src/lib/money.ts, src/lib/weight.ts).
// Money travels as whole piastres (512550 = 5,125.50 EGP); gold weight as whole milligrams
// (12345 = 12.345 g). A fraction exists only as text. No amount or weight is ever a float.

// "٥١٢٫٥٠" -> "512.50": Arabic-Indic digits and the Arabic decimal mark become Latin.
export function latinNumber(typed: unknown): string {
  return String(typed ?? "").trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".");
}

const AMOUNT = /^(\d{1,11})(?:\.(\d{1,2}))?$/;
const WEIGHT = /^(\d{1,10})(?:\.(\d{1,3}))?$/;
const group = (s: string) => s.replace(/\B(?=(\d{3})+$)/g, ",");

export function typedPiastres(typed: unknown): number | undefined {
  const m = AMOUNT.exec(latinNumber(typed));
  if (!m) return undefined;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
export function piastresText(p: unknown): string {
  if (p === null || p === undefined || p === "" || !Number.isFinite(Number(p))) return "—";   // a missing number is a dash, never "N.aN"
  const n = Number(p);
  const neg = n < 0, d = String(Math.abs(n)).padStart(3, "0");
  return `${neg ? "-" : ""}${group(d.slice(0, -2))}.${d.slice(-2)}`;
}
export function typedMilligrams(typed: unknown): number | undefined {
  const m = WEIGHT.exec(latinNumber(typed));
  if (!m) return undefined;
  return Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
}
export function milligramsText(mg: unknown): string {
  if (mg === null || mg === undefined || mg === "" || !Number.isFinite(Number(mg))) return "—";
  const n = Number(mg);
  const neg = n < 0, d = String(Math.abs(n)).padStart(4, "0");
  return `${neg ? "-" : ""}${group(d.slice(0, -3))}.${d.slice(-3)}`;
}
// The weight as printed on a label: grams to 2 decimals, the third digit rounded half up (3005 -> "3.01", 3004 -> "3.00").
export function labelGramsText(mg: unknown): string {
  if (mg === null || mg === undefined || mg === "" || !Number.isFinite(Number(mg))) return "—";
  const n = Number(mg);
  const d = String(Math.round(Math.abs(n) / 10)).padStart(3, "0");
  return `${n < 0 ? "-" : ""}${group(d.slice(0, -2))}.${d.slice(-2)}`;
}
// Whole piastres as the text a form field starts with (no thousands marks): 512550 -> "5125.50".
export const piastresInput = (p: unknown) => piastresText(p).replace(/,/g, "");
export const milligramsInput = (mg: unknown) => milligramsText(mg).replace(/,/g, "");

export const intText = (n: unknown) => group(String(Math.trunc(Number(n))));

// Dates: the backend sends ISO strings. The business day is Cairo's.
const cairo = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" });
// 12-hour clock everywhere (owner, 2026-11-04): "1:51 PM" in English, "1:51 م" in Arabic; the business day is Cairo's.
const cairoParts = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", hour12: true });
const cairoPartsSec = new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true });
/** The Cairo clock, 12-hour ("1:51 PM", "1:51:07 PM" with seconds). Every time on screen goes through this. A number is a timestamp in milliseconds. */
export const timeText = (iso: unknown, lang?: string, seconds = false) => {
  if (!iso) return "";
  const parts = (seconds ? cairoPartsSec : cairoParts).formatToParts(new Date(typeof iso === "number" ? iso : (iso as string)));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const l = lang ?? (typeof document !== "undefined" ? document.documentElement.lang : "en");
  const mark = get("dayPeriod").toUpperCase() === "AM" ? (l === "ar" ? "ص" : "AM") : (l === "ar" ? "م" : "PM");
  return `${get("hour")}:${get("minute")}${seconds ? `:${get("second")}` : ""} ${mark}`;
};
export const today = () => cairo.format(new Date());                       // "2026-11-04"
export const dateText = (iso: unknown) => (iso ? String(iso).slice(0, 10) : "");    // date-only values stay as written
export const dateTimeText = (iso: unknown, lang?: string) => { if (!iso) return ""; return `${cairo.format(new Date(iso as string))} ${timeText(iso, lang)}`; };
export function addDays(ymd: string, n: number) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export const monthStart = () => `${today().slice(0, 8)}01`;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" } as Record<string,string>)[c]);
