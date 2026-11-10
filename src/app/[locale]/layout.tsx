import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ServerScript } from "@/components/server-script";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { routing, dirOf } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import { Toaster } from "@/components/shell/toaster";
import { RUM_TOKEN, rumSnippet } from "@/lib/rum";
import { DASHBOARD_VERSION } from "@/version";
import "../globals.css";

export const metadata: Metadata = { title: "GoldGram" };
export const generateStaticParams = () => routing.locales.map((locale) => ({ locale }));

// Runs before the first paint: sidebar state and text size from the saved interface state (key ge-erp:ui), so nothing jumps after load.
const BEFORE_PAINT = `try{var s=JSON.parse(localStorage.getItem("ge-erp:ui")).state,d=document.documentElement;if(s.collapsed)d.classList.add("sb-collapsed");var z=[0.9,1,1.1,1.25,1.4][s.textStep];if(z&&z!==1)d.style.zoom=z}catch(e){}`;

// Better Stack real user monitoring (src/lib/rum.ts): production builds only.
const rumTag = rumSnippet(RUM_TOKEN, DASHBOARD_VERSION, process.env.NODE_ENV);

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} dir={dirOf(locale)} suppressHydrationWarning>
      <head>
        {/* Inline scripts through ServerScript (server HTML only): a <script> or <Script> that the client renders makes React 19 warn in development. */}
        <ServerScript id="before-paint" code={BEFORE_PAINT} />
        {rumTag ? <ServerScript id="rum-tag" code={rumTag} /> : null}
      </head>
      <body>
        <NextIntlClientProvider>
          <Providers>{children}<Toaster /></Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
