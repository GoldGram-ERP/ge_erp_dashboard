import { setRequestLocale } from "next-intl/server";
import { AccountView } from "@/components/shell/account-view";

export default async function AccountPage({ params }: { params: Promise<{ locale: string }> }) {
  setRequestLocale((await params).locale);
  return <AccountView />;
}
