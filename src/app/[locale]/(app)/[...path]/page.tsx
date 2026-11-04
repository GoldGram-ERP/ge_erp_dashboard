import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { findLeaf } from "@/nav/tree";
import { ThingHost } from "@/components/shell/thing-host";

// Any leaf of the nav tree: renders the page registered in src/things/registry.ts, else <ComingSoon/>. Unknown paths are 404.
export default async function ThingPage({ params }: { params: Promise<{ locale: string; path: string[] }> }) {
  const { locale, path } = await params;
  setRequestLocale(locale);
  const route = "/" + path.slice(0, 2).map(decodeURIComponent).join("/");
  if (!findLeaf(route)) notFound();
  return <ThingHost route={route} />;
}
