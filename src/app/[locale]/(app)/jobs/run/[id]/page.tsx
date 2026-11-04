import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { JobRun } from "@/components/jobs/job-run";

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <Suspense><JobRun id={decodeURIComponent(id)} /></Suspense>;
}
