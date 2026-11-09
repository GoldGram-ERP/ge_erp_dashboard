"use client";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { LEVELS, percentOf } from "@/lib/text-size";
import { useMe } from "@/lib/session";
import { useUi } from "@/stores/ui";
import { ChangePassword } from "./change-password";

const Kv = ({ k, v }: { k: string; v: string }) => <div className="kv"><span>{k}</span><span>{v}</span></div>;

export function AccountView() {
  const t = useTranslations();
  const a = useTranslations("app.account");
  const { data: me } = useMe();
  const { textStep, setTextStep } = useUi();
  const branch = useQuery({ queryKey: ["branch", me?.branchId], enabled: !!me?.branchId, queryFn: () => api(`/branches/${me?.branchId}`).then((b) => b.branchName as string) });
  if (!me) return null;
  return (
    <>
      <div className="head"><div><h1>{a("title")}</h1><div className="sub">{me.name}</div></div></div>
      <div id="acct" className="sections">
        <div className="grp-block kv-block"><h3 className="grp-title">{a("group")}</h3><div className="grp-panel">
          <Kv k={a("name")} v={me.name} /><Kv k={a("username")} v={me.username} /><Kv k={a("type")} v={t(`app.userType.${me.userType}`)} />{me.userType === "super_admin" ? null : <><Kv k={a("branch")} v={branch.data ?? "—"} /><Kv k={a("position")} v={me.positionName ?? "—"} /></>}</div></div>
        {me.userType === "super_admin" ? null : (<div className="grp-block kv-block"><h3 className="grp-title">{a("access")}</h3><div className="grp-panel">
          <Kv k={a("pages")} v={String(me.screens.length)} /><Kv k={a("cashDiscount")} v={me.canGiveCashDiscount ? a("allowed") : a("notAllowed")} /></div></div>)}
        <div className="grp-block kv-block"><h3 className="grp-title">{t("shell.userMenu.textSize")}</h3><div className="grp-panel">
          <div className="ts-row" role="group" aria-label={t("shell.userMenu.textSize")}>
            <Button size="sm" id="ts-down" aria-disabled={textStep === 0} onClick={() => setTextStep(textStep - 1)}>{t("shell.userMenu.smallerText")}</Button>
            <b dir="ltr" id="ts-now">{percentOf(textStep)}</b>
            <Button size="sm" id="ts-up" aria-disabled={textStep === LEVELS.length - 1} onClick={() => setTextStep(textStep + 1)}>{t("shell.userMenu.largerText")}</Button>
          </div></div></div>
        <div className="grp-block kv-block"><h3 className="grp-title">{t("access.password.title")}</h3><div className="grp-panel"><ChangePassword /></div></div>
      </div>
    </>
  );
}
