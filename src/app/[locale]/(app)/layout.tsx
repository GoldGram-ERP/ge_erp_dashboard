import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { api, ApiFailure } from "@/lib/api";
import type { Me } from "@/stores/ui";
import { Shell } from "@/components/shell/shell";

// Asks the backend who this is with the visitor's cookie; a missing or stale session ends at sign-in.
export default async function AppLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  let me: Me;
  try {
    me = await api<Me>("/access/me", { cookie: (await cookies()).toString() });
  } catch (e) {
    if (e instanceof ApiFailure && e.status === 401) redirect(`/${locale}/sign-in`);
    throw e;
  }
  return <Shell initialMe={me}>{children}</Shell>;
}
