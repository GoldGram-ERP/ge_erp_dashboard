import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import { HomeView } from "@/components/home/home-view";

// Server: prefetch the gold price with the visitor's cookie and hand it to TanStack Query (no spinner on first paint).
export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  const cookie = (await cookies()).toString();
  const qc = new QueryClient();
  await qc.prefetchQuery({ queryKey: ["gold-price-today"], queryFn: () => api("/gold-prices/today", { cookie }) }).catch(() => {});
  return <HydrationBoundary state={dehydrate(qc)}><HomeView /></HydrationBoundary>;
}
