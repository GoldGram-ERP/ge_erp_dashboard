"use client";
// الإعدادات: administration/settings. ONE stored row (shop identity + invoice footer): GET /settings, PUT /settings with all six fields (not PATCH).
// Ported from docs/nav-preview/app/things/settings.js. Admin and Super admin only. Limits: names 200, address 500, phone 500, footer 2000; the logo is kept
// to 90,000 characters (dashboard) although the backend would take more. The logo is a data URL inside the row; null removes it.
// shortcut: the shell's header brand is not refreshed after a save (a reload shows it), as in the HTML.
import { FileInput, Button } from "@/components/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, FieldConfig, MakeConfig, Row, ThingConfig } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { ThingPage, toast } from "@/components/engine";
import { Skeleton } from "@/components/engine/ui";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { useAccess } from "./sales-access";
import { useT } from "@/lib/t";
import { useRouter } from "@/i18n/navigation";
import { useLeaveGuard } from "./leave-guard";

const LOGO_MAX = 90_000;
const EDGES = [512, 384, 256, 192, 128];

const readUrl = (file: File) => new Promise<string>((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(file); });
const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("not an image")); i.src = src; });
/** A chosen file becomes the logo to save: an SVG as it is when it fits, any other picture redrawn (PNG, then WebP, then smaller) until it fits. */
async function logoFromFile(file: File): Promise<{ logo: string } | { refused: "logoNotImage" | "logoTooLarge" }> {
  if (!file.type.startsWith("image/")) return { refused: "logoNotImage" };
  let src: string, img: HTMLImageElement;
  try { src = await readUrl(file); img = await loadImage(src); } catch { return { refused: "logoNotImage" }; }
  if (file.type === "image/svg+xml") return src.length <= LOGO_MAX ? { logo: src } : { refused: "logoTooLarge" };
  const w = img.naturalWidth || 1, h = img.naturalHeight || 1;
  for (const edge of EDGES) {
    const k = Math.min(1, edge / Math.max(w, h)), cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const cx = cv.getContext("2d"); if (!cx) return { refused: "logoNotImage" };
    cx.drawImage(img, 0, 0, cv.width, cv.height);
    for (const ty of ["image/png", "image/webp"]) { const logo = cv.toDataURL(ty, 0.9); if (logo.startsWith(`data:${ty}`) && logo.length <= LOGO_MAX) return { logo }; }
  }
  return { refused: "logoTooLarge" };
}

function SettingsBody({ tr, saved, onSaved, close }: { tr: CustomFormProps["tr"]; saved: Row; onSaved: (r: Row) => void; close: () => void }) {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("administration", `settings.${k}`, v);
  const c = (k: string, v?: Record<string, string | number>) => t("common", k, v);
  const tooLong = (n: number) => (v: string) => (v.length > n ? c("fieldErrors.tooLong") : null);
  const fields = useMemo<FieldConfig[]>(() => [
    { name: "shopNameAr", label: m("shopNameAr"), type: "text", required: true, maxLength: 201, placeholder: m("shopNamePlaceholder"), section: m("shopIdentity"), validate: tooLong(200) },
    { name: "shopNameEn", label: m("shopNameEn"), type: "text", required: true, maxLength: 201, placeholder: "[Shop name]", section: m("shopIdentity"), validate: tooLong(200) },
    { name: "address", label: m("address"), type: "text", wide: true, maxLength: 501, placeholder: m("addressPlaceholder"), section: m("shopIdentity"), validate: tooLong(500) },
    { name: "phone", label: m("phone"), type: "text", maxLength: 501, section: m("shopIdentity"), validate: tooLong(500) },
    { name: "invoiceFooter", label: m("invoiceFooter"), type: "textarea", wide: true, section: m("printing"), validate: tooLong(2000) },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [tr]);
  const values = useMemo(() => ({ shopNameAr: saved.shopNameAr, shopNameEn: saved.shopNameEn, address: saved.address ?? "", phone: saved.phone ?? "", invoiceFooter: saved.invoiceFooter ?? "" }), [saved]);
  const form = useFieldsForm(fields, values);
  const [logo, setLogo] = useState<string | null>(saved.logo ?? null);
  const [logoName, setLogoName] = useState("");
  const [logoErr, setLogoErr] = useState("");
  const [alert, setAlert] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [logoDirty, setLogoDirty] = useState(false);
  const key = useRef(newSaveKey());
  const fileRef = useRef<HTMLInputElement>(null);
  const dirty = form.formState.isDirty || logoDirty;
  const { leave, dialog } = useLeaveGuard(tr, dirty, close);
  useEffect(() => { const s = form.watch(() => { key.current = newSaveKey(); setNote(c("unsavedChanges")); }); return () => s.unsubscribe(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);

  const shown = form.watch();
  const name = (tr.isAr ? shown.shopNameAr : shown.shopNameEn)?.trim() || m("shopNamePlaceholder");
  const empty = saved.shopNameAr === "" && saved.shopNameEn === "";

  async function pick(file?: File) {
    if (!file) return;
    const r = await logoFromFile(file);
    if ("refused" in r) { setLogoErr(m(r.refused)); return; }
    setLogoErr(""); setLogo(r.logo); setLogoName(file.name); setLogoDirty(true); key.current = newSaveKey();
  }
  async function submit() {
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    setAlert("");
    const v = await form.read();
    if (!v) { setAlert(c("couldNotSave", { count: Object.keys(form.formState.errors).length || 1 })); return; }
    setSaving(true); setNote(c("savingNote"));
    try {
      const row = await api("/settings", { method: "PUT", body: { shopNameAr: v.shopNameAr, shopNameEn: v.shopNameEn, address: v.address || null, phone: v.phone || null, invoiceFooter: v.invoiceFooter || null, logo }, saveKey: key.current });
      key.current = newSaveKey(); toast(m("saved")); onSaved(row);
    } catch (e) {
      setSaving(false); setNote("");
      if (!(e instanceof ApiFailure)) { toast(L("تعذّر الحفظ. حاول مرة أخرى.", "Could not save. Try again."), { error: true }); return; }
      if (!e.unreachable && e.error.message !== "saveInProgress") key.current = newSaveKey();
      const fe = backendFieldErrors(e.error, tr);
      if (Object.keys(fe).length && form.setErrors(fe)) { setAlert(c("couldNotSave", { count: Object.keys(fe).length })); return; }
      toast(tr.errorText(e.error), { error: true });
    }
  }

  return (
    <>
      <div className="mute"><span className="req">*</span> {c("required")}</div>
      {empty && <div className="note">{m("emptyNote")}</div>}
      <div className="st-grid">
        <form id="st" className="st-main" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <div className="grp-block"><h3 className="grp-title">{m("logo")}</h3><div className="grp-panel"><div className="field" data-k="logo">
            <div id="logo-box">
              <div>{logo ? <img src={logo} alt={m("logoAlt")} style={{ maxHeight: 72, maxWidth: 160 }} /> : <span className="mute">{m("noLogo")}</span>}</div>
              <div className="actions">
                <Button size="sm" id="logo-pick" onClick={() => fileRef.current?.click()}>{logo ? m("changeLogo") : m("uploadLogo")}</Button>
                {logo && <Button size="sm" danger id="logo-rm" onClick={() => { setLogo(null); setLogoName(""); setLogoDirty(true); key.current = newSaveKey(); }}>{m("removeLogo")}</Button>}
              </div>
              <FileInput ref={fileRef} id="logo-file" accept="image/*" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
              <div className="mute">{logoName ? m("logoChosen", { name: logoName }) : logo ? m("logoKept") : ""}</div>
            </div>
            <div className="help">{m("logoHint")}</div>
            {logoErr && <div className="err" id="logo-err" role="alert">{logoErr}</div>}
          </div></div></div>
          <FormFields form={form} fields={fields} values={values} />
        </form>
        <div className="st-prev grp-block" id="st-prev" role="complementary" aria-label={m("previewTitle")}>
          <h3 className="grp-title">{m("previewTitle")}</h3>
          <div className="grp-panel st-card">
            {logo ? <img src={logo} alt={m("logoAlt")} style={{ maxHeight: 72, maxWidth: 160 }} /> : <div className="mute">{m("logoPlaceholder")}</div>}
            <h2>{name}</h2>
            <div>{shown.address?.trim() || m("addressPlaceholder")}</div>
            {shown.phone?.trim() && <div dir="ltr">{m("previewPhone")} {shown.phone.trim()}</div>}
            <div className="mute">{m("previewInvoiceNo")} 000001</div>
            <p className="mute">{m("previewNote")}</p>
          </div>
        </div>
      </div>
      {alert && <div className="err" id="st-alert" role="alert">{alert}</div>}
      <div className="formbar">
        <Button variant="primary" id="st-save" disabled={saving} onClick={() => void submit()}>{saving ? c("saving") : c("saveChanges")}</Button>
        <Button id="st-cancel" onClick={() => void leave()}>{c("cancel")}</Button>
        <span className="mute" id="st-note">{note}</span>
      </div>
      {dialog}
    </>
  );
}

function SettingsPage({ row, close, tr }: CustomFormProps) {
  const qc = useQueryClient();
  const [saved, setSaved] = useState<Row | null>(row && "shopNameAr" in row ? row : null);
  const [failed, setFailed] = useState("");
  useEffect(() => { if (saved) return; api("/settings").then(setSaved).catch((e) => setFailed(e instanceof ApiFailure ? tr.errorText(e.error) : tr.t("common", "couldNotLoad"))); }, [saved, tr]);
  if (failed) return <div className="note warn">{failed}</div>;
  if (!saved) return <Skeleton rows={3} />;
  // a saved row is shown again in place (as the HTML did); the list behind refreshes
  return <SettingsBody key={String(saved.updatedAt ?? "")} tr={tr} saved={saved} close={close} onSaved={(r) => { setSaved(r); void qc.invalidateQueries({ queryKey: ["thing", "settings"] }); }} />;
}

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string) => t("administration", `settings.${k}`);
  return {
    id: "settings",
    title: m("title"),
    unit: L("إعداد", "settings"),
    keys: ["administration/settings"],
    create: [{ form: "edit", label: t("common", "edit") }],
    views: [{
      id: "shop", label: m("formTitle"),
      load: async () => ({ items: [{ id: "shop", ...(await api("/settings")) }] }),
      paging: false,
      onRow: (row, h) => h.openForm("edit", row),
      columns: [
        { key: "shopNameAr", label: m("shopNameAr") },
        { key: "shopNameEn", label: m("shopNameEn"), className: "ltr" },
        { key: "address", label: m("address") },
        { key: "phone", label: m("phone"), render: (r) => (r.phone ? <bdi dir="ltr">{r.phone}</bdi> : "") },
        { key: "logo", label: m("logo"), type: "bool", get: (r) => !!r.logo },
      ],
    }],
    forms: { edit: { display: "page", title: () => m("formTitle"), fields: [], path: () => "/settings", custom: SettingsPage } },
  };
};

export default function Page() {
  const tr = useT(), access = useAccess(), router = useRouter();
  const { t, L } = tr;
  if (access.canOpen && !access.canOpen(["administration/settings"])) return <div className="empty"><strong>{L("غير مسموح لك بفتح هذه الصفحة.", "You are not allowed to open this page.")}</strong></div>;
  return (
    <div className="st-page">
      <div className="head"><div><h1>{t("administration", "settings.title")}</h1><div className="sub">{L("هوية المتجر وما يُطبع على الفاتورة", "The shop's identity and what prints on the invoice")}</div></div></div>
      <SettingsPage row={null} reload={() => {}} close={() => router.push("/")} tr={tr} />
    </div>
  );
}
