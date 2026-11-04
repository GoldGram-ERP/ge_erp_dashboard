import { setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { JobsPage } from "@/components/jobs/jobs-pages";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <Suspense><JobsPage kind="jobs" /></Suspense>;
}
