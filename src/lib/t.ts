"use client";
// The HTML's t(ns, key, values) and L(ar, en), on next-intl. Messages are generated into messages/{ar,en}.json by the shell builder.
import { useCallback, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { ApiError } from "./api";

export type Values = Record<string, string | number | undefined>;
export type Tr = {
  locale: string;
  isAr: boolean;
  /** t("bank-accounts", "banks.listTitle", {code}) - a missing key answers the key itself, like the HTML. */
  t: (ns: string, key: string, values?: Values) => string;
  /** L("عربي", "English") - the text for the current language. */
  L: (ar: string, en: string) => string;
  /** The message of an api error from the "errors" namespace; unknown keys fall back to errors.unexpected. */
  errorText: (e?: Partial<ApiError> | null) => string;
};

export function useT(): Tr {
  const locale = useLocale();
  const tx = useTranslations();
  const t = useCallback((ns: string, key: string, values?: Values) => {
    const path = `${ns}.${key}`;
    return tx.has(path) ? tx(path, values as never) : key;
  }, [tx]);
  return useMemo<Tr>(() => {
    const L = (ar: string, en: string) => (locale === "ar" ? ar : en);
    const errorText = (e?: Partial<ApiError> | null) => {
      const key = e?.message ?? "unexpected";
      const text = t("errors", key, e?.values as Values);
      return text === key ? t("errors", "unexpected") : text;
    };
    return { locale, isAr: locale === "ar", t, L, errorText };
  }, [locale, t]);
}
