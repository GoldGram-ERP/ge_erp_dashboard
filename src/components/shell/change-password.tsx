"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { toast } from "@/lib/toast";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";

// POST /access/change-password {currentPassword,newPassword} -> 204; same rules and messages as the mockup's account page.
const NAMES = ["currentPassword", "newPassword", "confirmPassword"] as const;

export function ChangePassword({ forced = false }: { forced?: boolean }) {
  const a = useTranslations("access.password");
  const rules = useTranslations("access.passwordRules");
  const sign = useTranslations("access.signIn");
  const app = useTranslations("app");
  const qc = useQueryClient();
  const [v, setV] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [fail, setFail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [key, setKey] = useState(newSaveKey);
  const set = (n: string, val: string) => { setV((o) => ({ ...o, [n]: val })); setErrs((o) => ({ ...o, [n]: "" })); setKey(newSaveKey()); };

  const n = v.newPassword;
  // A forced change (first sign-in or a temporary password) has no current password: POST /access/forced-password-change {newPassword}.
  const names = forced ? NAMES.filter((x) => x !== "currentPassword") : NAMES;
  const checks: [string, boolean][] = [
    [rules("length"), n.length >= 8 && n.length <= 128],
    ...(forced ? [] : [[rules("differs"), n !== "" && n !== v.currentPassword] as [string, boolean]]),
    [rules("matches"), v.confirmPassword !== "" && v.confirmPassword === n],
  ];
  const label = { currentPassword: a("currentPassword"), newPassword: a("newPassword"), confirmPassword: a("confirmPassword") };

  async function save(e: FormEvent) {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!forced && !v.currentPassword.trim()) er.currentPassword = a("errors.required");
    if (!n.trim()) er.newPassword = a("errors.required");
    else if (n.length < 8) er.newPassword = a("errors.tooShort");
    else if (n.length > 128) er.newPassword = a("errors.tooLong");
    else if (!forced && n === v.currentPassword) er.newPassword = a("errors.sameAsCurrent");
    if (!v.confirmPassword) er.confirmPassword = a("errors.required");
    else if (v.confirmPassword !== n) er.confirmPassword = a("errors.mismatch");
    setErrs(er); setFail("");
    if (Object.keys(er).length) { revealFirstError(); return; }
    setBusy(true);
    try {
      await api(forced ? "/access/forced-password-change" : "/access/change-password", { method: "POST", body: forced ? { newPassword: n } : { currentPassword: v.currentPassword, newPassword: n }, saveKey: key });
      setDone(true); setKey(newSaveKey()); setV({ currentPassword: "", newPassword: "", confirmPassword: "" }); toast(a("saved"));
      if (forced) { await qc.invalidateQueries({ queryKey: ["me"] }); window.location.reload(); }
    } catch (x) {
      if (!(x instanceof ApiFailure)) setFail(a("failed"));
      else if (x.unreachable) setFail(a("unreachable"));
      else {
        const f = x.error?.fields, list: string[] = Array.isArray(f) ? f.map((i) => i.field ?? i.name) : Object.keys(f ?? {});
        const fe: Record<string, string> = {};
        if (list.includes("currentPassword")) fe.currentPassword = a("errors.currentWrong");
        if (list.includes("newPassword")) fe.newPassword = a("errors.sameAsCurrent");
        if (Object.keys(fe).length) setErrs(fe); else setFail(a("failed"));
      }
      revealFirstError();
    } finally { setBusy(false); }
  }
  return (
    <div className={forced ? "forced-change" : undefined}>
      {forced ? <div className="head"><div><h1>{app("mustChange")}</h1></div></div> : null}
      {done && !forced ? <div className="note" role="status">{a("saved")} <Link href="/">{a("toHome")}</Link></div> : null}
      <p className="mute">{a("sub")}</p>
      <form id="pwf" onSubmit={save} noValidate>
        {names.map((name) => (
          <div className="field" key={name} data-err={errs[name] ? "" : undefined}>
            <label htmlFor={`f-${name}`}>{label[name]}</label>
            <Input id={`f-${name}`} name={name} type={shown[name] ? "text" : "password"} value={v[name]} onChange={(e) => set(name, e.target.value)} autoComplete={name === "currentPassword" ? "current-password" : "new-password"} dir="ltr" style={{ textAlign: "start" }} aria-invalid={!!errs[name]} aria-describedby={errs[name] ? `e-${name}` : undefined} />
            <Button size="sm" onClick={() => setShown((s) => ({ ...s, [name]: !s[name] }))}>{shown[name] ? sign("hidePassword") : sign("showPassword")}</Button>
            {errs[name] ? <FieldError id={`e-${name}`}>{errs[name]}</FieldError> : null}
          </div>
        ))}
        <div className="note" id="pw-rules"><b>{rules("title")}</b>
          <div id="pw-rules-list">{checks.map(([txt, ok]) => <div key={txt}>{ok ? "✓" : "○"} {txt} <span className="sr-only">{ok ? rules("met") : rules("unmet")}</span></div>)}</div></div>
        {fail ? <FieldError id="pw-err">{fail}</FieldError> : null}
        <div className="formbar" style={{ position: "static" }}><Button variant="primary" id="pw-save" type="submit" disabled={busy}>{busy ? a("saving") : a("save")}</Button></div>
      </form>
    </div>
  );
}
