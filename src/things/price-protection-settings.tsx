"use client";
// حماية السعر / Price protection settings (setup/price-protection, docs/price-protection/price-protection.md): the sales window, the
// accountant window (minutes here, seconds on the server) and the tolerance (EGP here, piastres on the server). Everyone reads them;
// an Admin or the Super admin changes them (PUT, the backend refuses anyone else). A change applies to the next window only.
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionBar, Banner, Button, Chip, Group, Icons, PillInput, Row, Skeleton, toast } from "@/components/hallmark";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { latinNumber, piastresText, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";

type Settings = { salesWindowSeconds: number; accountantWindowSeconds: number; tolerancePiastres: number };
const settingsKey = ["price-protection-settings"];
const minutesText = (s: number) => String(Math.round((s / 60) * 100) / 100);
// minutes as typed (2.5, ٢٫٥) -> whole seconds, 30 s to 60 min (the server's range); anything else is invalid
const seconds = (typed: string) => { const t = latinNumber(typed).replace("٫", ".").trim(); if (!/^\d+(\.\d+)?$/.test(t)) return null; const s = Math.round(Number(t) * 60); return s >= 30 && s <= 3600 ? s : null; };

export default function Page() {
  const { L } = useT();
  const { data: me } = useMe();
  const mayEdit = me?.userType === "admin" || me?.userType === "super_admin";
  const qc = useQueryClient();
  const q = useQuery<Settings>({ queryKey: settingsKey, queryFn: () => api("/price-protection/settings") });
  const [form, setForm] = useState({ sales: "", accountant: "", tolerance: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const key = useRef(newSaveKey());
  useEffect(() => { if (q.data) setForm({ sales: minutesText(q.data.salesWindowSeconds), accountant: minutesText(q.data.accountantWindowSeconds), tolerance: piastresText(q.data.tolerancePiastres).replace(/,/g, "") }); }, [q.data]);

  const s = seconds(form.sales), a = seconds(form.accountant), t = typedPiastres(form.tolerance.replace(/,/g, ""));
  const tolOk = t !== undefined && t <= 10_000_000;
  const valid = s !== null && a !== null && tolOk;
  const dirty = Boolean(q.data && valid && (s !== q.data.salesWindowSeconds || a !== q.data.accountantWindowSeconds || t !== q.data.tolerancePiastres));

  async function save() {
    if (busy || !valid || !dirty) return;
    setBusy(true); setMsg("");
    try {
      const out = await api<Settings>("/price-protection/settings", { method: "PUT", body: { salesWindowSeconds: s, accountantWindowSeconds: a, tolerancePiastres: t }, saveKey: key.current });
      key.current = newSaveKey();
      qc.setQueryData(settingsKey, out);
      toast(L("اتحفظت إعدادات حماية السعر: هتشتغل من الفترة الجاية", "Price protection saved: it applies from the next window"), { tone: "ok" });
    } catch (err) {
      if (!keepsKey(err)) key.current = newSaveKey();
      setMsg(err instanceof ApiFailure && err.error.message === "notAllowed" ? L("محتاج صلاحية أدمن عشان تغيّر الإعدادات دي.", "Only an Admin changes these settings.") : L("ماتحفظتش. حاول تاني.", "Not saved. Try again."));
    } finally { setBusy(false); }
  }

  const fact = (v: string) => <span dir="ltr" className="block text-end font-semibold tabular-nums text-label">{v}</span>;
  const field = (k: keyof typeof form, unit: string, label: string, bad: boolean) => (
    <Row label={label}>
      <span className="flex flex-col items-end gap-1">
        <PillInput ariaLabel={label} unit={unit} width="8rem" inputMode="decimal" dir="ltr" invalid={bad || undefined} value={form[k]} onChange={(v) => { setForm({ ...form, [k]: v }); setMsg(""); }} />
        {bad && <span className="meta text-danger">{k === "tolerance" ? L("رقم من 0 لـ 100,000 جنيه", "A number from 0 to 100,000 EGP") : L("من نص دقيقة لـ 60 دقيقة", "From half a minute to 60 minutes")}</span>}
      </span>
    </Row>
  );

  return (
    <div className="hallmark mx-auto flex w-full max-w-[40rem] flex-col gap-4 pt-1">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="gold">{L("بتشتغل من الفترة الجاية", "Applies from the next window")}</Chip>
        {!mayEdit && <Chip>{L("للعرض بس", "View only")}</Chip>}
        {dirty && <Chip tone="amber">{L("فيه تعديلات مش محفوظة", "Unsaved changes")}</Chip>}
      </div>
      {q.isError && !q.data ? (
        <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live action={<Button size="sm" variant="soft" onClick={() => void q.refetch()}>{L("حاول تاني", "Try again")}</Button>}>{L("مش قادر أقرا الإعدادات", "Could not read the settings")}</Banner>
      ) : !q.data ? <Group><div className="p-3"><Skeleton lines={3} /></div></Group> : (
        <Group title={L("حماية السعر", "Price protection")}>
          {mayEdit ? (
            <>
              {field("sales", L("دقيقة", "min"), L("مدة المبيعات", "Sales window"), s === null)}
              {field("accountant", L("دقيقة", "min"), L("مدة المحاسب", "Accountant window"), a === null)}
              {field("tolerance", "EGP", L("الفرق المسموح", "Tolerance"), !tolOk)}
            </>
          ) : (
            <>
              <Row label={L("مدة المبيعات", "Sales window")}>{fact(`${minutesText(q.data.salesWindowSeconds)} ${L("دقيقة", "min")}`)}</Row>
              <Row label={L("مدة المحاسب", "Accountant window")}>{fact(`${minutesText(q.data.accountantWindowSeconds)} ${L("دقيقة", "min")}`)}</Row>
              <Row label={L("الفرق المسموح", "Tolerance")}>{fact(`${piastresText(q.data.tolerancePiastres)} EGP`)}</Row>
            </>
          )}
        </Group>
      )}
      {msg && <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live action={<Button size="sm" variant="soft" pending={busy} onClick={() => void save()}>{L("حاول تاني", "Try again")}</Button>}>{msg}</Banner>}
      {mayEdit && q.data && (
        <ActionBar label={L("الحفظ", "Save")}>
          {!dirty && <span className="meta">{valid ? L("مفيش تعديلات", "No changes") : L("صلّح الأرقام الأول", "Fix the numbers first")}</span>}
          <Button variant="primary" id="pp-save" pending={busy} disabled={!dirty} onClick={() => void save()}>{busy ? L("بنحفظ…", "Saving…") : L("احفظ", "Save")}</Button>
        </ActionBar>
      )}
    </div>
  );
}
