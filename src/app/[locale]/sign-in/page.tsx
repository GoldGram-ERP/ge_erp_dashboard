"use client";
import { Button, Input } from "@/components/ui";
import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import { useRouter, usePathname } from "@/i18n/navigation";
import { useSession } from "@/stores/session";
import { useForgetMe } from "@/lib/session";
import { revealFirstError } from "@/lib/submit-guard";
import type { Me } from "@/stores/ui";

export default function SignInPage() {
  const t = useTranslations("access.signIn");
  const app = useTranslations("app");
  const e = useTranslations("errors");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { document.title = `${t("title")} - GoldGram`; }, [t]);
  const qc = useQueryClient();
  // The sign-in page means nobody is signed in: drop what the last person left on this browser (expired session, closed tab).
  const forget = useForgetMe();
  useEffect(() => { forget(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const email = String(f.get("email") ?? "").trim(), password = String(f.get("password") ?? "");
    if (!email || !password) { setError(t("required")); revealFirstError(); return; }
    setBusy(true); setError("");
    try {
      await api("/access/sign-in", { method: "POST", body: { email, password } });
      const me = await api<Me>("/access/me");
      useSession.getState().setMe(me);
      localStorage.setItem("ge-erp:last-activity", String(Date.now()));
      localStorage.removeItem("ge-erp:session-lock");
      qc.setQueryData(["me"], me);
      router.replace("/");
      router.refresh();
    } catch (x) {
      setBusy(false);
      if (x instanceof ApiFailure) {
        const key = x.error.message;
        setError(x.unreachable ? t("unreachable") : key === "accountLocked" ? t("lockedTitle") : x.status === 401 ? t("errorTitle") + (typeof x.error.values?.attemptsLeft === "number" ? " " + t("attemptsLeft", { count: x.error.values.attemptsLeft }) : "") : e.has(key) ? e(key, x.error.values as never) : t("failed"));
      } else setError(app("signIn.cookie"));
      revealFirstError();
    }
  }
  const other = locale === "ar" ? "en" : "ar";
  return (
    <div className="signin">
      <form onSubmit={submit} noValidate>
        <img className="signin-logo" src="/goldgram-logo.png" alt="GoldGram" width={88} height={88} />
        <h1>{t("title")}</h1>
        {error ? <div className="note warn" role="alert" data-field-error>{error}</div> : null}
        <div className="field"><label htmlFor="f-email">{t("email")}</label><Input id="f-email" name="email" autoComplete="username" dir="ltr" style={{ textAlign: "start" }} autoFocus /></div>
        <div className="field"><label htmlFor="f-password">{t("password")}</label>
          <Input id="f-password" name="password" type={show ? "text" : "password"} autoComplete="current-password" dir="ltr" style={{ textAlign: "start" }} />
          <Button size="sm" onClick={() => setShow(!show)}>{show ? t("hidePassword") : t("showPassword")}</Button>
        </div>
        <Button variant="primary" id="si-go" type="submit" disabled={busy}>{busy ? t("signingIn") : t("submit")}</Button>
        <Button onClick={() => router.replace(pathname, { locale: other })}>{other === "en" ? "English" : "العربية"}</Button>
      </form>
    </div>
  );
}
