"use client";
// "Report a bug": every signed-in person, of any type, sends the developers a type, a text and any files, or an image pasted from the
// clipboard. The reporter gets a thank-you and nothing else: no list of their reports, no status, no follow-up (owner, 2026-11-09).
// The server records who they are, their branch and session; here we add the screen, the version and the last errors the screen got.
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, FileInput, Sheet } from "@/components/ui";
import { ChromeButton } from "@/components/ui/Button";
import { toast } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import type { FieldConfig } from "@/lib/engine-types";
import { api, ApiFailure } from "@/lib/api";
import { recentErrors } from "@/lib/recent-errors";
import { useT } from "@/lib/t";
import { DASHBOARD_VERSION } from "@/version";
import { Icon } from "./icon";

const FILES_MAX = 5;
const FILE_MAX_BYTES = 25 * 1024 * 1024;
const megabytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

export function ReportBug() {
  const tr = useT();
  const { L } = tr;
  const [open, setOpen] = useState(false);
  return (
    <>
      <ChromeButton title={L("ابلّغ عن مشكلة", "Report a bug")} aria-label={L("ابلّغ عن مشكلة", "Report a bug")} onClick={() => setOpen(true)}><Icon name="alert" /></ChromeButton>
      {/* The sheet is a side panel placed against .main (position:relative), like every other sheet: mounted here in the sidebar it would anchor to the footer. */}
      {open && (() => { const sheet = <ReportSheet onClose={() => setOpen(false)} />; const host = document.querySelector<HTMLElement>(".main"); return host ? createPortal(sheet, host) : sheet; })()}
    </>
  );
}

function ReportSheet({ onClose }: { onClose: () => void }) {
  const tr = useT();
  const { L } = tr;
  const fields = useMemo<FieldConfig[]>(() => [
    { name: "type", label: L("نوع المشكلة", "Type of problem"), type: "select", required: true, wide: true, options: [
      ["wrong_number", L("رقم أو حساب غلط", "A wrong number or calculation")],
      ["broken_screen", L("شاشة بايظة أو مش بتفتح", "A screen that is broken or will not open")],
      ["printing", L("مشكلة في الطباعة", "Printing")],
      ["slow", L("بطيء أو واقف", "Slow or stuck")],
      ["wrong_text", L("كلمة أو ترجمة غلط", "Wrong text or translation")],
      ["no_access", L("مش قادر أدخل شاشة", "I cannot open a screen")],
      ["other", L("حاجة تانية", "Something else")],
    ] },
    { name: "description", label: L("اكتب المشكلة", "Describe the problem"), type: "textarea", required: true, wide: true, maxLength: 4000 },
    { name: "doing", label: L("كنت بتعمل إيه؟ (اختياري)", "What were you doing? (optional)"), type: "text", wide: true, maxLength: 500 },
  ], [L]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = useMemo(() => ({ type: "", description: "", doing: "" }), []);
  const f = useFieldsForm(fields, values);
  const picker = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const add = (list: File[]) => {
    const next = [...files];
    for (const file of list) {
      if (next.length >= FILES_MAX) { toast(L(`أقصى عدد ${FILES_MAX} ملفات.`, `At most ${FILES_MAX} files.`), { error: true }); break; }
      if (file.size > FILE_MAX_BYTES) { toast(L(`الملف ${file.name} أكبر من 25 ميجا.`, `${file.name} is larger than 25 MB.`), { error: true }); continue; }
      next.push(file);
    }
    setFiles(next);
  };
  // A picture pasted from the clipboard is taken only once the type of problem is chosen (owner, 2026-11-09).
  const paste = (e: React.ClipboardEvent) => {
    const pasted = [...e.clipboardData.items].filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter((x): x is File => !!x);
    if (pasted.length === 0) return;
    e.preventDefault();
    if (!f.getValues("type")) { toast(L("اختار نوع المشكلة الأول، وبعدين الصق الصورة.", "Choose the type of problem first, then paste the image."), { error: true }); return; }
    add(pasted.map((file, i) => (file.name && file.name !== "image.png" ? file : new File([file], `screenshot-${Date.now()}-${i + 1}.${(file.type.split("/")[1] || "png").replace("jpeg", "jpg")}`, { type: file.type }))));
  };

  const send = async () => {
    if (sending) return;
    if (!navigator.onLine) { toast(L("مفيش اتصال بالإنترنت.", "You are offline."), { error: true }); return; }
    const v = await f.read();
    if (!v) return;
    const form = new FormData();
    form.append("type", String(v.type));
    form.append("description", String(v.description));
    if (v.doing) form.append("doing", String(v.doing));
    form.append("screenPath", `${location.pathname}${location.search}`.slice(0, 300));
    form.append("appVersion", DASHBOARD_VERSION);
    form.append("language", tr.locale);
    form.append("viewport", `${window.innerWidth}x${window.innerHeight}`);
    form.append("clientTime", new Date().toISOString());
    form.append("recentErrors", JSON.stringify(recentErrors()));
    for (const file of files) form.append("files", file, file.name);
    setSending(true);
    try {
      await api("/bug-report", { method: "POST", form });
      toast(L("شكراً على ملاحظاتك.", "Thank you for your feedback."));
      onClose();
    } catch (e) {
      setSending(false);
      toast(e instanceof ApiFailure ? tr.errorText(e.error) : L("ماتبعتش. حاول تاني.", "It was not sent. Try again."), { error: true });
    }
  };

  return (
    <Sheet title={L("ابلّغ عن مشكلة", "Report a bug")} onRequestClose={onClose}
      footer={<>
        <Button variant="primary" disabled={sending} onClick={send}>{sending ? L("جارٍ الإرسال…", "Sending…") : L("إرسال", "Send")}</Button>
        <Button onClick={onClose}>{L("إلغاء", "Cancel")}</Button>
      </>}>
      <div onPaste={paste}>
        <form noValidate onSubmit={(e) => { e.preventDefault(); send(); }}>
          <FormFields form={f} fields={fields} values={values} />
        </form>
        <p className="mute">{L("تقدر تضيف صور أو ملفات، أو تلصق صورة (Ctrl+V) بعد ما تختار نوع المشكلة. الحد 5 ملفات، كل ملف لحد 25 ميجا.", "You can add images or files, or paste an image (Ctrl+V) once you have chosen the type. Up to 5 files, 25 MB each.")}</p>
        <FileInput ref={picker} multiple onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = ""; }} />
        <p className="actions"><Button size="sm" onClick={() => picker.current?.click()}>{L("إضافة ملفات", "Add files")}</Button></p>
        {files.map((file, i) => (
          <p key={`${file.name}-${i}`} className="actions"><span dir="auto">{file.name}</span> <span className="mute" dir="ltr">{megabytes(file.size)}</span> <Button size="sm" onClick={() => setFiles(files.filter((_, j) => j !== i))}>{L("شيل", "Remove")}</Button></p>
        ))}
      </div>
    </Sheet>
  );
}
