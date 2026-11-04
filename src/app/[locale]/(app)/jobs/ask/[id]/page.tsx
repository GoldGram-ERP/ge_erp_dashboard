import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { AskRun } from "@/components/jobs/job-run";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Suspense><AskRun id={decodeURIComponent(id)} /></Suspense>;
}
