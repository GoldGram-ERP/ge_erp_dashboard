import { setRequestLocale } from "next-intl/server";
import { WhatsNewView } from "@/components/shell/whats-new";

export default async function WhatsNewPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <WhatsNewView />;
}
