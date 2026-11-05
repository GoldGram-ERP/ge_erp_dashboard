import { setRequestLocale } from "next-intl/server";
import { notFound, redirect } from "next/navigation";
import { findLeaf } from "@/nav/tree";
import { ThingHost } from "@/components/shell/thing-host";

// Any leaf of the nav tree: renders the page registered in src/things/registry.ts, else <ComingSoon/>. Unknown paths are 404.
// Screens that moved: the old address sends the person to the new one (bookmarks, links, old pins). `new=create` is carried over to the tab's own form id.
const MOVED: Record<string, { to: string; params: Record<string, string>; form?: string }> = {
  "/buy/returned-pieces": { to: "/sales/returns", params: { view: "returned-pieces" }, form: "createReturnedPiece" },
};

export default async function ThingPage({ params, searchParams }: { params: Promise<{ locale: string; path: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { locale, path } = await params;
  setRequestLocale(locale);
  const route = "/" + path.slice(0, 2).map(decodeURIComponent).join("/");
  const moved = MOVED[route];
  if (moved) {
    const q = new URLSearchParams(moved.params);
    for (const [k, v] of Object.entries(await searchParams)) if (typeof v === "string" && k !== "view") q.set(k, k === "new" && moved.form ? moved.form : v);
    redirect(`/${locale}${moved.to}?${q.toString()}`);
  }
  if (!findLeaf(route)) notFound();
  return <ThingHost route={route} />;
}
