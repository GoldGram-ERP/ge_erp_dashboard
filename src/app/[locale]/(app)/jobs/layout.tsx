import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { JOBS_ENABLED } from "@/lib/jobs/enabled";

// Jobs are hidden for now (src/lib/jobs/enabled.ts): any /jobs address goes to Home.
export default async function JobsLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  if (!JOBS_ENABLED) redirect(`/${(await params).locale}`);
  return children;
}
