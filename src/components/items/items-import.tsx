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
type Problem = { row: number; field: string; message: string; value?: string };

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

  const fieldName = (f: string) => ({ itemName: L("البيان", "Item name"), category: L("المجموعة", "Category"), brand: L("الماركة", "Brand"), itemType: L("نوع الصنف", "Item type"), karat: L("العيار", "Karat"), weight: L("الوزن (جم)", "Weight (g)"), workmanship: L("المصنعية", "Workmanship"), cashback: L("الكاش باك", "Cashback"), nickname: L("اسم الشهرة", "Nickname") } as Record<string, string>)[f] ?? f;
  // The cause of a bad cell, in words: what is wrong and what to put instead.
  const reason = (p: Problem) => {
    const v = p.value ?? "";
    switch (p.message) {
      case "required": return L("الخلية فارغة وهي مطلوبة", "This cell is empty and it is required");
      case "notFound": return L(`"${v}" غير موجود في النظام. اختر من القائمة المنسدلة`, `"${v}" is not in the system. Choose it from the dropdown list`);
      case "karatChoice": return L(`"${v}" ليس عيارًا مقبولًا. اختر 18 أو 21 أو 24 أو 999`, `"${v}" is not an allowed karat. Choose 18, 21, 24 or 999`);
      case "karatType": return L(`العيار ونوع الصنف لا يتوافقان (${v}). الذهب يقبل 18 أو 21 أو 24، وأخرى أو فضة تقبل 999 فقط`, `The karat and the item type do not fit (${v}). Gold takes 18, 21 or 24; other or silver takes 999 only`);
      case "duplicate": return L(`"${v}" مكرر في الملف في نفس المجموعة`, `"${v}" is repeated in the file in the same category`);
      case "taken": return L(`"${v}" له صنف بالفعل في هذه المجموعة`, `"${v}" already has an item in this category`);
      case "tooLong": return L("النص أطول من 100 حرف", "The text is longer than 100 characters");
      case "invalid":
        if (p.field === "itemType") return L(`"${v}" ليس نوعًا صحيحًا. اختر ذهب أو أخرى أو فضة`, `"${v}" is not a valid type. Choose Gold or Other or silver`);
        if (p.field === "weight") return L(`"${v}" ليس وزنًا صحيحًا. اكتب رقمًا أكبر من 0 بحد أقصى 3 أرقام عشرية`, `"${v}" is not a valid weight. Use a number above 0 with up to 3 decimals`);
        if (p.field === "workmanship" || p.field === "cashback") return L(`"${v}" ليس مبلغًا صحيحًا. اكتب رقمًا بحد أقصى رقمين عشريين`, `"${v}" is not a valid amount. Use a number with up to 2 decimals`);
        return L("قيمة غير صحيحة", "Not a valid value");
      default: return p.message;
    }
  };
  // A refusal of the whole file (no rows, too many, not an .xlsx).
  const fileReason = (m?: string) => m === "required" ? L("الملف لا يحتوي على أي صفوف أصناف.", "The file has no item rows.") : m === "tooLong" ? L("الملف فيه أكثر من 500 صف. قسّمه إلى ملفات أصغر.", "The file has more than 500 rows. Split it into smaller files.") : L("الملف غير صالح: اختر ملف Excel (.xlsx) من القالب.", "Invalid file: choose the Excel (.xlsx) template.");

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
      else if (e instanceof ApiFailure && e.error.message === "invalidFields") setGeneral(fileReason((e.error as unknown as { fields?: { message?: string }[] }).fields?.[0]?.message));
      else setGeneral(e instanceof ApiFailure ? tr.errorText(e.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."));
      setSaveKey(newSaveKey());   // a refused file is a new attempt
      setBusy(false);
    }
  };

  return <>
    <div className="card imp">
      <p className="imp-lead">{L("استورد عدة أصناف دفعة واحدة من ملف Excel. تُراجع كل الصفوف أولًا: لو في صف فيه خطأ لا يُحفظ شيء. الأصناف المستوردة تُحفظ مُكوَّدة ونشطة.", "Add many items at once from an Excel file. Every row is checked first: if one row has an error, nothing is saved. Imported items are saved as coded and active.")}</p>
      <section className="imp-step">
        <h4>{L("١. نزّل القالب واملأه", "1. Download the template and fill it in")}</h4>
        <div className="imp-row"><Button id="items-template" onClick={() => void downloadItemsTemplate(tr)}>{L("تنزيل قالب Excel", "Download Excel template")}</Button></div>
      </section>
      <section className="imp-step">
        <h4>{L("٢. ارفع الملف بعد ما تملأه", "2. Upload the filled file")}</h4>
        <div className="imp-row">
          <FileInput ref={fileRef} accept=".xlsx" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setProblems([]); setGeneral(""); setSaveKey(newSaveKey()); }} />
          <Button id="items-pick" onClick={() => fileRef.current?.click()}>{L("اختيار ملف", "Choose file")}</Button>
          <span className="imp-file" dir="auto">{file ? file.name : L("لم يُختر ملف بعد", "No file chosen yet")}</span>
        </div>
      </section>
      {general && <div className="note warn" role="alert"><b>{general}</b></div>}
      {problems.length > 0 && <div className="note warn imp-errors" role="alert" id="items-import-errors">
        <b>{L(`لم يُحفظ شيء. ${problems.length} خطأ في الملف:`, `Nothing was saved. ${problems.length} problems in the file:`)}</b>
        <ul>{problems.map((p, i) => <li key={i}>{L(`صف ${p.row} · ${fieldName(p.field)}: ${reason(p)}`, `Row ${p.row} · ${fieldName(p.field)}: ${reason(p)}`)}</li>)}</ul>
      </div>}
    </div>
    <div className="formbar">
      <Button variant="primary" id="items-import" disabled={!file || busy} onClick={() => void send()}>{busy ? L("جارٍ الاستيراد…", "Importing…") : L("استيراد", "Import")}</Button>
      <Button id="cancel" onClick={close}>{L("إلغاء", "Cancel")}</Button>
    </div>
  </>;
}
