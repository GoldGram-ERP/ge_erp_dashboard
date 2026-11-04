import { defineRouting } from "next-intl/routing";

// Arabic is the default. The chosen language is remembered in the NEXT_LOCALE cookie, so "/" lands in the right one.
export const routing = defineRouting({ locales: ["ar", "en"], defaultLocale: "ar", localePrefix: "always" });
export type Locale = (typeof routing.locales)[number];
export const dirOf = (l: string) => (l === "ar" ? "rtl" : "ltr");
