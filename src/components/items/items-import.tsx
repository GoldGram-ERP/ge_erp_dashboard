"use client";
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { Button } from "@/components/ui";
import { FileInput } from "@/components/ui/FileInput";

const forget = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: ["gold-accounts"] });

// The Excel template of the Items import and the import page (the owner, 2026-11-11). The template follows the
// language of the screen; an import checks every row first, and one bad row saves nothing.
type Problem = { row: number; field: string; message: string };

export async function downloadItemsTemplate(tr: Tr) {
  try {
    const r = await api<Response>("/items/import-template", { query: { language: tr.locale }, blob: true });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = "items-template.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) {
    toast(e instanceof ApiFailure ? tr.errorText(e.error) : tr.L("تعذر تنزيل القالب. حاول مرة أخرى.", "Could not download the template. Try again."), { error: true });
  }
}

export function ItemsImport({ close, reload, tr }: CustomFormProps) {
  const { L } = tr;
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveKey, setSaveKey] = useState(newSaveKey());
  const [problems, setProblems] = useState<Problem[]>([]);
  const [general, setGeneral] = useState("");

  const fieldName = (f: string) => ({ itemName: L("البيان", "Item name"), category: L("المجموعة", "Category"), brand: L("الماركة", "Brand"), itemType: L("نوع الصنف", "Item type"), karat: L("العيار", "Karat"), isCoded: L("تكود", "Coded"), weight: L("الوزن (جم)", "Weight (g)"), workmanship: L("المصنعية", "Workmanship"), cashback: L("الكاش باك", "Cashback"), nickname: L("اسم الشهرة", "Nickname") } as Record<string, string>)[f] ?? f;
  const reason = (m: string) => ({
    required: L("مطلوب", "Required"), invalid: L("قيمة غير صحيحة", "Not a valid value"), notFound: L("غير موجود في النظام", "Not found in the system"),
    duplicate: L("مكرر في الملف", "Repeated in the file"), taken: L("لهذا الاسم صنف بالفعل في المجموعة", "This name already has an item in the category"), tooLong: L("طويل جدًا", "Too long"),
  } as Record<string, string>)[m] ?? m;

  const send = async () => {
    if (!file) return;
    setBusy(true); setProblems([]); setGeneral("");
    const form = new FormData();
    form.append("file", file);
    try {
      const a = await api<{ created: number }>("/items/import", { method: "POST", form, saveKey });
      forget(qc);
      toast(L(`تمت إضافة ${a.created} صنف`, `${a.created} items added`));
      reload();
    } catch (e) {
      if (e instanceof ApiFailure && Array.isArray((e.error as { rows?: Problem[] }).rows)) setProblems((e.error as unknown as { rows: Problem[] }).rows);
      else if (e instanceof ApiFailure && e.error.message === "invalidFields") setGeneral(L("الملف غير صالح: اختر ملف Excel (.xlsx) من القالب، فيه من 1 إلى 500 صف.", "Invalid file: choose the Excel (.xlsx) template with 1 to 500 rows."));
      else setGeneral(e instanceof ApiFailure ? tr.errorText(e.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."));
      setSaveKey(newSaveKey());   // a refused file is a new attempt
      setBusy(false);
    }
  };

  return <>
    <div className="card">
      <p>{L("نزّل القالب، املأ الأصناف فيه، ثم ارفعه هنا. تُراجع كل الصفوف أولًا: لو في صف فيه خطأ لا يُحفظ شيء.", "Download the template, fill in the items, then upload it here. Every row is checked first: if one row has an error, nothing is saved.")}</p>
      <div><Button id="items-template" onClick={() => void downloadItemsTemplate(tr)}>{L("تنزيل قالب Excel", "Download Excel template")}</Button></div>
      <div>
        <FileInput ref={fileRef} accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProblems([]); setGeneral(""); setSaveKey(newSaveKey()); }} />
        <Button id="items-pick" onClick={() => fileRef.current?.click()}>{L("اختيار ملف", "Choose file")}</Button>
        {file && <span dir="auto"> {file.name}</span>}
      </div>
      {general && <div className="note warn" role="alert"><b>{general}</b></div>}
      {problems.length > 0 && <div className="note warn" role="alert" id="items-import-errors">
        <b>{L(`لم يُحفظ شيء. ${problems.length} خطأ في الملف:`, `Nothing was saved. ${problems.length} problems in the file:`)}</b>
        <ul>{problems.map((p, i) => <li key={i}>{L(`صف ${p.row} · ${fieldName(p.field)}: ${reason(p.message)}`, `Row ${p.row} · ${fieldName(p.field)}: ${reason(p.message)}`)}</li>)}</ul>
      </div>}
    </div>
    <div className="formbar">
      <Button variant="primary" id="items-import" disabled={!file || busy} onClick={() => void send()}>{busy ? L("جارٍ الاستيراد…", "Importing…") : L("استيراد", "Import")}</Button>
      <Button id="cancel" onClick={close}>{L("إلغاء", "Cancel")}</Button>
    </div>
  </>;
}
