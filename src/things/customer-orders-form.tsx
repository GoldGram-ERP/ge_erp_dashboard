"use client";
// A customer order, one workspace page (forms.create / forms.edit with display "page" + custom). Backend #226.
// details (branch, date, who records it) -> customer -> what they will buy (an item and a count, or an undefined item) -> a first note -> save.
// With a `row` it is the EDIT of that order: the branch, the date and the number stay; the customer and the items are saved with PUT. The notes and the status have their own buttons on the record.
import { PHONE_LENGTH } from "@/lib/phone";
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { DatePicker } from "@/components/fields/DatePicker";
import { backendFieldErrors } from "@/lib/fields";
import { today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { toast } from "@/components/engine";
import { Button, Input, Textarea } from "@/components/ui";
import { revealFirstError } from "@/lib/submit-guard";
import { Choice, ErrBox, TextBox, allPages, code6 } from "./sales-form-parts";
import { ORDER_LINES_MAX, ORDER_NOTE_MAX, blankOrderLine, readOrderForm, seesEveryOrder, type OrderLineForm } from "./customer-orders-rules";

export default function CustomerOrderForm({ close, reload, tr, row }: CustomFormProps) {
  const { t, L } = tr;
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const edit = row?.id ? row : null;                       // a saved order: the form starts with its values
  const mayPickDate = seesEveryOrder(me);                  // an Admin, the Super admin and a desk-wide role may name an earlier day; anyone else records it for today

  const [branches, setBranches] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [ownBranch, setOwnBranch] = useState("");
  const [branchId, setBranchId] = useState<string>(edit?.branchId ?? me?.branchId ?? "");
  const [date, setDate] = useState<string>(edit ? String(edit.date).slice(0, 10) : today());
  const [customerName, setCustomerName] = useState<string>(edit?.customerName ?? "");
  const [customerPhone, setCustomerPhone] = useState<string>(edit?.customerPhone ?? "");
  const [lines, setLines] = useState<OrderLineForm[]>(
    edit && Array.isArray(edit.lines) && edit.lines.length ? edit.lines.map((l: Row) => ({ itemId: l.itemId ?? "", quantity: String(l.quantity) })) : [blankOrderLine()],
  );
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
    if (me?.branchId) api(`/branches/${me.branchId}`).then((b: Row) => setOwnBranch(b.branchName)).catch(() => {});
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const setLine = (i: number, patch: Partial<OrderLineForm>) => { touch(); setErrs((e) => ({ ...e, [`line${i}Item`]: "", [`line${i}Quantity`]: "", lines: "" })); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  const undefinedLabel = L("غير محدد (العميل لا يعرف بعد)", "Undefined (the customer does not know yet)");

  async function submit() {
    if (saving) return;
    const r = readOrderForm(tr, { customerName, customerPhone, lines });
    const e = { ...r.errors };
    if (!edit && !isUser && !branchId) e.branchId = L("اختر الفرع.", "Pick the branch.");
    setErrs(e);
    if (!r.payload || Object.keys(e).length > 0) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); revealFirstError(); return; }
    setSaving(true);
    const body = {
      ...r.payload,
      // an edit never changes the branch or the date; a User never names the branch (their own is used) and records it for today unless they may name a day
      ...(edit ? {} : { ...(isUser ? {} : { branchId }), ...(mayPickDate ? { date } : {}), ...(note.trim() ? { note: note.trim() } : {}) }),
    };
    try {
      const saved = await api(edit ? `/customer-orders/${edit.id}` : "/customer-orders", { method: edit ? "PUT" : "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(L(`تم حفظ الطلب رقم ${code6(saved.orderNumber)}`, `Order ${code6(saved.orderNumber)} saved`));
      reload();
    } catch (error) { setSaving(false); refusal(error); }
  }

  function refusal(error: unknown) {
    if (!(error instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
    const texts = backendFieldErrors(error.error, tr), e: Record<string, string> = {};
    let gen = "";
    for (const f of ((error.error.fields ?? []) as { field: string; message?: string }[])) {
      const m = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field);
      if (m) e[`line${m[1]}${m[2] === "itemId" ? "Item" : "Quantity"}`] = f.message === "duplicateItem" ? L("هذا الصنف مضاف بالفعل.", "This item is already added.") : (texts[f.field] ?? L("غير صالح.", "Not valid."));
      else if (f.field === "lines") e.lines = L("أضف صنفًا واحدًا على الأقل.", "Add at least one item.");
      else if (["branchId", "date", "customerName", "customerPhone", "note"].includes(f.field)) e[f.field] = texts[f.field];
      else gen = texts[f.field] ?? tr.errorText(error.error);
    }
    if (!Object.keys(e).length && !gen) gen = tr.errorText(error.error);   // no field named: say it once
    setErrs(e); setGeneral(gen); revealFirstError();
  }

  return (
    <form id="co" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); void submit(); }}>
      <div id="banners">{general && <div className="note warn" role="alert" data-field-error><b>{general}</b></div>}</div>
      <div className="card"><h3>{edit ? `${t("common", "edit")} · ${code6(edit.orderNumber)}` : L("طلب عميل جديد", "New customer order")}</h3>
        <div className="help">{L("سجّل العميل اللي اتصل وقال إنه جاي يشتري، وإيه اللي ناوي يشتريه (أو صنف غير محدد لو لسه مش عارف).", "Record the customer who phoned to say they are coming, and what they plan to buy (or an undefined item if they do not know yet).")}</div>
        <div className="formgrid">
          <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}><label htmlFor="branchId">{L("الفرع", "Branch")} *</label>
            {isUser || edit
              ? <output id="branchId" className="price-out">{edit ? (edit.branchName ?? "") : ownBranch}</output>
              : <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { touch(); setBranchId(v); }} />}{err("branchId")}</div>
          <div className="field" data-k="date" data-err={errs.date ? "" : undefined}><label htmlFor="f-date">{L("التاريخ", "Date")} *</label>
            <DatePicker id="f-date" name="date" value={date} onChange={(v) => { touch(); setDate(v || date); }} disabled={!mayPickDate || Boolean(edit)} required />{err("date")}</div>
          <div className="field"><span className="flabel" id="seller-l">{L("المسجّل", "Recorded by")}</span>
            <output id="seller" className="price-out" aria-labelledby="seller-l">{edit ? (edit.sellerName ?? "") : (me?.name ?? "")}</output></div>
        </div>
      </div>

      <div className="card" id="sec-customer"><h3>{L("العميل", "Customer")}</h3>
        <div className="formgrid">
          <TextBox name="customerPhone" label={`${L("رقم الهاتف", "Phone")} *`} value={customerPhone} ltr maxLength={PHONE_LENGTH} error={errs.customerPhone} onChange={(v) => { touch(); setCustomerPhone(v); setErrs((e) => ({ ...e, customerPhone: "" })); }} />
          <TextBox name="customerName" label={`${L("اسم العميل", "Customer name")} *`} value={customerName} maxLength={100} error={errs.customerName} onChange={(v) => { touch(); setCustomerName(v); setErrs((e) => ({ ...e, customerName: "" })); }} />
        </div>
      </div>

      <div className="card" id="sec-items"><h3>{L("اللي ناوي يشتريه", "What they will buy")}</h3>
        <div className="help">{L("اختر الصنف والعدد، أو اترك الصنف فاضي لو العميل لسه مش عارف.", "Pick the item and the count, or leave the item empty when the customer does not know yet.")}</div>
        <div className="field" data-k="lines">
          {lines.map((l, i) => (
            <div className="formgrid co-line" data-line={i} key={i}>
              <div className="field" data-k={`line${i}Item`} data-err={errs[`line${i}Item`] ? "" : undefined}><label htmlFor={`it${i}`}>{L(`الصنف ${i + 1}`, `Item ${i + 1}`)}</label>
                <ItemPicker id={`it${i}`} name={`it${i}`} items={items} value={l.itemId} placeholder={undefinedLabel} onChange={(v) => setLine(i, { itemId: v })} />
                {l.itemId !== "" && <Button size="sm" variant="plain" data-undefined={i} onClick={() => setLine(i, { itemId: "" })}>{L("صنف غير محدد", "Make it undefined")}</Button>}{err(`line${i}Item`)}</div>
              <div className="field" data-k={`line${i}Quantity`} data-err={errs[`line${i}Quantity`] ? "" : undefined}><label htmlFor={`iq${i}`}>{L("العدد", "Count")} *</label>
                <Input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" value={l.quantity} onChange={(ev) => setLine(i, { quantity: ev.target.value })} />{err(`line${i}Quantity`)}</div>
              {lines.length > 1 && <div className="co-rm"><Button size="sm" danger data-rmline={i} aria-label={L(`حذف الصنف ${i + 1}`, `Remove item ${i + 1}`)} onClick={() => { touch(); setErrs({}); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{L("حذف", "Remove")}</Button></div>}
            </div>
          ))}
          {err("lines")}
        </div>
        <Button size="sm" className="co-add" data-addline aria-disabled={lines.length >= ORDER_LINES_MAX} onClick={() => { if (lines.length < ORDER_LINES_MAX) { touch(); setLines((ls) => [...ls, blankOrderLine()]); } }}>{L("إضافة صنف", "Add an item")}</Button>
      </div>

      {!edit && (
        <div className="card" id="sec-note"><h3>{L("ملاحظة (اختياري)", "Note (optional)")}</h3>
          <div className="field" data-k="note" data-err={errs.note ? "" : undefined}><label htmlFor="co-note">{L("أول ملاحظة على الطلب", "The first note on the order")}</label>
            <Textarea id="co-note" value={note} maxLength={ORDER_NOTE_MAX} onChange={(ev) => { touch(); setNote(ev.target.value); }} />{err("note")}</div>
          <div className="help">{L("تقدر تضيف ملاحظات تانية بعد الحفظ، وكل ملاحظة بتتسجل باسم اللي كتبها ووقتها.", "You can add more notes after saving; each one keeps who wrote it and when.")}</div>
        </div>
      )}

      <div className="formbar" id="sec-save">
        <Button variant="primary" type="submit" id="co-save" aria-busy={saving}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ الطلب", "Save the order")}</Button>
        <Button id="co-cancel" onClick={close}>{L("إلغاء", "Cancel")}</Button>
      </div>
    </form>
  );
}
