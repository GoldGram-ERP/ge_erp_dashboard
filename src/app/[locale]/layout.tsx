import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing, dirOf } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/shell/toaster";
import "../globals.css";

export const metadata: Metadata = { title: "GoldGram" };
export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }));

// Runs before the first paint: sidebar state and text size from the saved interface state (key ge-erp:ui), so nothing jumps after load.
const BEFORE_PAINT = `try{var s=JSON.parse(localStorage.getItem("ge-erp:ui")).state,d=document.documentElement;if(s.collapsed)d.classList.add("sb-collapsed");var z=[0.9,1,1.1,1.25,1.4][s.textStep];if(z&&z!==1)d.style.zoom=z}catch(e){}`;

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <head><script>{BEFORE_PAINT}</script></head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}<Toaster /></Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
