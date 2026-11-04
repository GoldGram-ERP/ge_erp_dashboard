// Pure rules of the form fields, ported from docs/nav-preview/app/core/fields.js (readForm, backendFieldErrors) and select.js/datepicker.js.
import { latinNumber, milligramsInput, piastresInput, typedMilligrams, typedPiastres } from "./format";
import type { FieldConfig, LookupSpec, Query, Row, ViewConfig } from "./engine-types";
import type { Tr } from "./t";

// The lists every form picks from. Add one line here, use it by name in any field (optionsFrom: "branch").
export const LOOKUPS: Record<string, LookupSpec> = {
  branch: { path: "/branches", value: "id", label: "name" },
  treasury: { path: "/treasuries", value: "id", label: "name", paged: false },   // answers whole and refuses page/limit
  bank: { path: "/banks", value: "id", label: "name" },
  bankAccount: { path: "/bank-accounts", value: "id", label: "name" },
  karat: { path: "/karats", value: "id", label: "name" },
  category: { path: "/categories", value: "id", label: "categoryName", pageOnly: true },
  itemName: { path: "/item-names", value: "id", label: "itemName", pageOnly: true },
  item: { path: "/items", value: "id", label: "itemName", pageOnly: true },
  expenseType: { path: "/expense-types", value: "id", label: "name" },
  user: { path: "/users", value: "id", label: "name" },
};

export const rowsOf = (resp: any, path?: string): Row[] => {
  if (path) return path.split(".").reduce((o: any, k) => o?.[k], resp) ?? [];
  if (Array.isArray(resp)) return resp;
  return resp?.items ?? resp?.rows ?? resp?.data ?? [];
};

/** The text a field starts with: money/weight whole units become typed text, everything else a string. */
export function toRaw(f: FieldConfig, v: unknown): string | boolean {
  if (f.type === "checkbox") return !!v;
  if (v === undefined || v === null) return "";
  if (f.type === "money" && v !== "" && Number.isInteger(+(v as number))) return piastresInput(+(v as number));
  if (f.type === "weight" && v !== "" && Number.isInteger(+(v as number))) return milligramsInput(+(v as number));
  return String(v);
}
export const defaultOf = (f: FieldConfig) => (typeof f.default === "function" ? (f.default as () => unknown)() : f.default);
export function rawValues(fields: FieldConfig[], values: Row = {}): Record<string, string | boolean> {
  return Object.fromEntries(fields.filter((f) => f.type !== "html" && f.type !== "code").map((f) => [f.name, toRaw(f, values[f.name] ?? defaultOf(f))]));
}

/** readForm: raw typed values -> parsed values + one message per bad field. `validate(v, all)` of each field runs last. */
export function readFields(raw: Record<string, unknown>, fields: FieldConfig[], tr: Pick<Tr, "L">): { values: Row; errors: Record<string, string> } {
  const { L } = tr;
  const values: Row = {}, errors: Record<string, string> = {};
  for (const f of fields) {
    if (f.type === "html" || f.type === "code") continue;
    const r = raw[f.name];
    if (r === undefined && f.type !== "checkbox") continue;
    const text = f.type === "checkbox" ? "" : f.type === "password" ? String(r ?? "") : String(r ?? "").trim();
    const empty = f.type !== "checkbox" && text === "";
    let v: any = f.type === "checkbox" ? !!r : text;
    if (!empty && f.type === "money") { v = typedPiastres(text); if (v === undefined) errors[f.name] = L("اكتب مبلغًا صحيحًا، حتى رقمين بعد الفاصلة.", "Type a valid amount, up to two decimals."); }
    else if (!empty && f.type === "weight") { v = typedMilligrams(text); if (v === undefined) errors[f.name] = L("اكتب وزنًا صحيحًا بالجرام، حتى ثلاثة أرقام بعد الفاصلة.", "Type a valid weight in grams, up to three decimals."); }
    else if (!empty && f.type === "number") { const s = latinNumber(text); if (!/^-?\d+$/.test(s)) errors[f.name] = L("اكتب رقمًا صحيحًا.", "Type a whole number."); else v = Number(s); }
    if (!errors[f.name]) {
      if (f.required && f.type !== "checkbox" && empty) errors[f.name] = L("هذا الحقل مطلوب.", "This field is required.");
      else if (!empty && typeof v === "number") {
        if (f.positive && v <= 0) errors[f.name] = L("اكتب قيمة أكبر من صفر.", "Type a value above zero.");
        else if (typeof f.min === "number" && v < f.min) errors[f.name] = L(`الحد الأدنى ${f.min}.`, `Minimum ${f.min}.`);
        else if (typeof f.max === "number" && v > f.max) errors[f.name] = L(`الحد الأقصى ${f.max}.`, `Maximum ${f.max}.`);
      } else if (!empty && typeof v === "string" && f.maxLength && v.length > f.maxLength) errors[f.name] = L(`الحد الأقصى ${f.maxLength} حرفًا.`, `At most ${f.maxLength} characters.`);
      else if (!empty && f.pattern && !f.pattern.test(String(v))) errors[f.name] = f.patternMessage ?? L("الصيغة غير صحيحة.", "The format is not valid.");
    }
    values[f.name] = empty && f.type !== "checkbox" ? (f.emptyAs !== undefined ? f.emptyAs : "") : v;
  }
  for (const f of fields) if (!errors[f.name] && f.validate && f.name in values) { const m = f.validate(values[f.name], values); if (m) errors[f.name] = m; }
  return { values, errors };
}

/** The backend refuses fields as { fields: { name: key } } or [{ field, message }]; map to this form's field names. */
export function backendFieldErrors(error: any, tr: Pick<Tr, "t" | "errorText">): Record<string, string> {
  const out: Record<string, string> = {}, f = error?.fields;
  const text = (key: string, values?: any) => { const t1 = tr.t("common", `fieldErrors.${key}`); return t1 !== `fieldErrors.${key}` ? t1 : tr.errorText({ message: key, values }); };
  if (Array.isArray(f)) for (const x of f) out[x.field ?? x.name] = text(x.message ?? x.key, x.values);
  else if (f && typeof f === "object") for (const [k, v] of Object.entries<any>(f)) out[k] = text(typeof v === "string" ? v : v.message, v?.values);
  if (error?.message === "adminTaken" && !out.adminUserId) out.adminUserId = text("adminTaken");
  return out;
}

// ───── the list query: exactly what the HTML config sends, nothing more ─────
export type ViewState = {
  chip: string; q: string; filters: Row; sort: { key: string; dir: "asc" | "desc" } | null;
  page: number; size: number; group: string; ran: boolean;
};
export function initialViewState(view: ViewConfig): ViewState {
  return {
    chip: view.chips?.[0]?.id ?? "", q: "",
    filters: Object.fromEntries((view.filters ?? []).map((f) => [f.name, defaultOf(f) ?? ""])),
    sort: view.sort?.default ?? null, page: 1,
    size: view.paging ? (view.paging.size ?? view.paging.sizes?.[0] ?? (view.paging.sizeParam === null ? 20 : 25)) : 25,
    group: "", ran: !view.runLabel,
  };
}
export function buildQuery(view: ViewConfig, vs: ViewState): Query {
  const q: Query = { ...(view.query ?? {}) };
  const chip = view.chips?.find((c) => c.id === vs.chip);
  Object.assign(q, chip?.query ?? {});
  if (vs.q && view.search) q[view.search.param ?? "search"] = vs.q;
  for (const f of view.filters ?? []) {
    const v = vs.filters[f.name];
    if (f.toQuery) Object.assign(q, f.toQuery(v, vs.filters) ?? {});
    else if (v !== "" && v !== undefined && v !== false) q[f.param ?? f.name] = v === true ? "true" : v;
  }
  if (view.paging) { q[view.paging.param ?? "page"] = vs.page; if (view.paging.sizeParam !== null) q[view.paging.sizeParam ?? "pageSize"] = vs.size; }
  if (vs.sort && view.sort) { q[view.sort.param ?? "sort"] = vs.sort.key; q[view.sort.orderParam ?? "order"] = vs.sort.dir; }
  return q;
}

// ───── select search and the calendar ─────
// Arabic-normalised text for searching: no diacritics or tatweel, alef/yeh/heh variants merged, Arabic digits -> Latin.
export const norm = (s: unknown) => String(s ?? "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ئ/g, "ي").replace(/ؤ/g, "و").replace(/ة/g, "ه")
  .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).trim();
export const filterOptions = <T extends [unknown, string, ...unknown[]]>(opts: T[], q: string) => { const n = norm(q); return n ? opts.filter(([, l]) => norm(l).includes(n)) : opts; };

const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;           // m is 0-11
export const parseDay = (s: string) => ({ y: +s.slice(0, 4), m: +s.slice(5, 7) - 1, d: +s.slice(8, 10) });
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Always 6 weeks of cells for month m of year y; weekStart 0 = Sunday ... 6 = Saturday. */
export function monthGrid(y: number, m: number, weekStart: number) {
  const lead = (new Date(Date.UTC(y, m, 1)).getUTCDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const t = new Date(Date.UTC(y, m, 1 - lead + i));
    return { iso: isoDay(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()), day: t.getUTCDate(), inMonth: t.getUTCMonth() === m };
  });
}
export const shiftDay = (s: string, n: number) => { const { y, m, d } = parseDay(s), t = new Date(Date.UTC(y, m, d + n)); return isoDay(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()); };
export const shiftMonth = (s: string, n: number) => { const { y, m, d } = parseDay(s), t = y * 12 + m + n; return isoDay(Math.floor(t / 12), t % 12, Math.min(d, daysIn(Math.floor(t / 12), t % 12))); };
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// An option list that can grow from its own screen: the select always offers "Add ..." as its last entry (opens that screen's create form in a new tab, so the form being filled is kept).
export type AddNew = { ar: string; en: string; route: string };
export const addNewFor = (path?: string): AddNew | undefined =>
  path === "/bank-accounts" ? { ar: "إضافة حساب بنكي جديد", en: "Add a bank account", route: "/money/banks?new=createAccount" }
  : path === "/banks" ? { ar: "إضافة بنك جديد", en: "Add a bank", route: "/money/banks?new=createBank" }
  : undefined;
