// A translator that is always Arabic, whatever the page language: used by printed documents (invoices), which are Arabic only (owner, 2026-11-10).
import ar from "../../messages/ar.json";
import type { Tr, Values } from "./t";

const find = (path: string): unknown => path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), ar);

/** The same Tr, with every text taken from the Arabic messages ({name} values filled in) and L() always answering its Arabic side. */
export function arabicTr(tr: Tr): Tr {
  const t = (ns: string, key: string, values?: Values) => {
    const text = find(`${ns}.${key}`);
    return typeof text === "string" ? text.replace(/\{(\w+)\}/g, (_, v: string) => String(values?.[v] ?? "")) : key;
  };
  const errorText: Tr["errorText"] = (e) => {
    const key = e?.message ?? "unexpected", text = t("errors", key, e?.values as Values);
    return text === key ? t("errors", "unexpected") : text;
  };
  return { ...tr, locale: "ar", isAr: true, t, L: (a) => a, errorText };
}
