"use client";
// The "Send a request" tab of the price board (owner, 2026-11-25, backend #228): the items to sell and their counts, and a first note, sent to the accountant for
// approval. A plain user sends for their own branch; an Admin picks the branch. Every accountant, Admin and the Super admin are told at once.
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { Row } from "@/lib/engine-types";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { backendFieldErrors } from "@/lib/fields";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { toast } from "@/components/engine";
import { Button, Input, Textarea } from "@/components/ui";
import { revealFirstError } from "@/lib/submit-guard";
import { Choice, ErrBox, allPages, code6 } from "./sales-form-parts";
import { REQUEST_KINDS, REQUEST_LINES_MAX, REQUEST_NOTE_MAX, blankRequestLine, readRequestForm, requestKindText, type RequestLineForm } from "./price-requests-rules";

export default function PriceRequestForm({ onSent }: { onSent: () => void }) {
  const tr = useT();
  const { L } = tr;
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const [items, setItems] = useState<Row[]>([]);
  const [branches, setBranches] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState<string>(me?.branchId ?? "");
  const [kind, setKind] = useState("");
  const [lines, setLines] = useState<RequestLineForm[]>([blankRequestLine()]);
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); setGeneral(""); };

  useEffect(() => {
    (async () => {
      const [i, b] = await Promise.all([allPages("/items", { active: true }).catch(() => []), isUser ? [] : allPages("/branches").catch(() => [])]);
      setItems(i); setBranches(b);
    })();
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, patch: Partial<RequestLineForm>) => { touch(); setErrs((e) => ({ ...e, [`line${i}Item`]: "", [`line${i}Quantity`]: "", lines: "" })); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;

  async function submit() {
    if (saving) return;
    const r = readRequestForm(L, kind, lines);
    const e = { ...r.errors };
    if (!isUser && !branchId) e.branchId = L("اختر الفرع.", "Pick the branch.");
    setErrs(e);
    if (!r.payload || Object.keys(e).length > 0) { setGeneral(tr.t("common", "couldNotSave", { count: Object.keys(e).length })); revealFirstError(); return; }
    setSaving(true);
    try {
      const sent = await api<Row>("/price-requests", { method: "POST", body: { ...r.payload, ...(isUser ? {} : { branchId }), ...(note.trim() ? { note: note.trim() } : {}) }, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(L(`تم إرسال الطلب رقم ${code6(sent.requestNumber)} للمحاسب`, `Request ${code6(sent.requestNumber)} sent to the accountant`));
      setKind(""); setLines([blankRequestLine()]); setNote(""); setErrs({}); setSaving(false);
      onSent();
    } catch (error) {
      setSaving(false);
      if (!(error instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(error.error, tr), fe: Record<string, string> = {};
      let gen = "";
      for (const f of ((error.error.fields ?? []) as { field: string; message?: string }[])) {
        const m = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field);
        if (m) fe[`line${m[1]}${m[2] === "itemId" ? "Item" : "Quantity"}`] = f.message === "duplicateItem" ? L("هذا الصنف مضاف بالفعل.", "This item is already added.") : (texts[f.field] ?? L("غير صالح.", "Not valid."));
        else if (["branchId", "kind", "note", "lines"].includes(f.field)) fe[f.field] = texts[f.field] ?? L("غير صالح.", "Not valid.");
        else gen = texts[f.field] ?? tr.errorText(error.error);
      }
      if (!Object.keys(fe).length && !gen) gen = tr.errorText(error.error);
      setErrs(fe); setGeneral(gen); revealFirstError();
    }
  }

  return (
    <form id="prq" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
      <div id="banners">{general && <div className="note warn" role="alert" data-field-error><b>{general}</b></div>}</div>
      <div className="card"><h3>{L("طلب موافقة", "Ask for approval")}</h3>
        <div className="help">{L("اختر الأصناف والعدد اللي عايز تبيعه، والطلب هيوصل للمحاسب فورًا. هيوصلك إشعار لما يتقبل أو يترفض.", "Pick the items and counts you want to sell; the accountant is told at once. You are notified when it is accepted or rejected.")}</div>
        <div className="formgrid">
          <div className="field" data-k="kind" data-err={errs.kind ? "" : undefined}><label htmlFor="prq-kind">{L("نوع الطلب", "Request type")} *</label>
            <Choice tr={tr} id="prq-kind" searchable={false} options={REQUEST_KINDS.map((k) => [k, requestKindText(L, k)])} value={kind} invalid={Boolean(errs.kind)} onChange={(v) => { touch(); setErrs((e) => ({ ...e, kind: "" })); setKind(v); }} />{err("kind")}</div>
        </div>
        {!isUser && (
          <div className="formgrid">
            <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}><label htmlFor="prq-branch">{L("الفرع", "Branch")} *</label>
              <Choice tr={tr} id="prq-branch" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
          </div>
        )}
        <div className="field" data-k="lines">
          {lines.map((l, i) => (
            <div className="formgrid co-line" data-line={i} key={i}>
              <div className="field" data-k={`line${i}Item`} data-err={errs[`line${i}Item`] ? "" : undefined}><label htmlFor={`prq-it${i}`}>{L(`الصنف ${i + 1}`, `Item ${i + 1}`)} *</label>
                <ItemPicker id={`prq-it${i}`} name={`prq-it${i}`} items={items} value={l.itemId} placeholder={L("اختر", "Choose")} onChange={(v) => setLine(i, { itemId: v })} />{err(`line${i}Item`)}</div>
              <div className="field" data-k={`line${i}Quantity`} data-err={errs[`line${i}Quantity`] ? "" : undefined}><label htmlFor={`prq-q${i}`}>{L("العدد", "Count")} *</label>
                <Input id={`prq-q${i}`} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" value={l.quantity} onChange={(ev) => setLine(i, { quantity: ev.target.value })} />{err(`line${i}Quantity`)}</div>
              {lines.length > 1 && <div className="co-rm"><Button size="sm" danger aria-label={L(`حذف الصنف ${i + 1}`, `Remove item ${i + 1}`)} onClick={() => { touch(); setErrs({}); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{L("حذف", "Remove")}</Button></div>}
            </div>
          ))}
          {err("lines")}
        </div>
        <Button size="sm" className="co-add" aria-disabled={lines.length >= REQUEST_LINES_MAX} onClick={() => { if (lines.length < REQUEST_LINES_MAX) { touch(); setLines((ls) => [...ls, blankRequestLine()]); } }}>{L("إضافة صنف", "Add an item")}</Button>
        <div className="field" data-k="note" data-err={errs.note ? "" : undefined}><label htmlFor="prq-note">{L("ملاحظة (اختياري)", "Note (optional)")}</label>
          <Textarea id="prq-note" value={note} maxLength={REQUEST_NOTE_MAX} onChange={(ev) => { touch(); setNote(ev.target.value); }} />{err("note")}</div>
      </div>
      <div className="formbar"><Button variant="primary" type="submit" id="prq-send" aria-busy={saving}>{saving ? L("جارٍ الإرسال…", "Sending…") : L("إرسال الطلب", "Send the request")}</Button></div>
    </form>
  );
}
