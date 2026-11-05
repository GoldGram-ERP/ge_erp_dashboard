"use client";
// A new expense or expense refund, a workspace page: details (date, branch, expense code or type, note) -> cash and any number of
// bank rows (owner, 2026-11-05; backend #166) -> save. The two kinds are the same shape. The expense code only picks the type (never sent).
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { DatePicker } from "@/components/fields/DatePicker";
import { Icon, toast } from "@/components/engine";
import { Button } from "@/components/ui";
import { paymentErrors, paymentKeyOf, sentBanks, type Bank } from "./sales-invoices-math";
import { Choice, ErrBox, TextBox, allPages, code6, fe } from "./sales-form-parts";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";

const NOTE_MAX = 250;                    // NOTE_MAX_LENGTH (dashboard = backend)
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export type ExpenseKind = "expense" | "refund";

export function ExpenseForm({ kind, close, reload, tr }: CustomFormProps & { kind: ExpenseKind }) {
  const { t, L, errorText } = tr;
  const exp = kind === "expense";
  const m = (k: string, v?: Record<string, string>) => t("expenses", `${exp ? "expenses" : "expenseRefunds"}.${k}`, v);
  const { data: me } = useMe();
  const [branches, setBranches] = useState<Row[]>([]);
  const [types, setTypes] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [date, setDate] = useState(today());
  const [branchId, setBranchId] = useState(me?.branchId ?? "");   // a User or an Admin starts on their own branch; the Super admin has none and picks one
  const [code, setCode] = useState("");
  const [typeId, setTypeId] = useState("");
  const [note, setNote] = useState("");
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<Bank[]>([blankBank()]);
  const [next, setNext] = useState<number | undefined>();
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const edited = () => { saveKey.current = newSaveKey(); };

  useEffect(() => {
    Promise.all([allPages("/branches").catch(() => []), allPages("/expense-types").catch(() => []), allPages("/bank-accounts").catch(() => [])])
      .then(([b, ty, a]) => { setBranches(b); setTypes(ty); setAccounts(a); setBranchId((cur) => cur || (b.length === 1 ? b[0].id : "")); });
  }, []);
  useEffect(() => {
    if (!branchId || !DAY.test(date)) return;
    api("/document-numbers/next", { query: { documentType: exp ? "expense" : "expense_refund", branchId, year: date.slice(0, 4) } }).then((r) => setNext(r.next)).catch(() => setNext(undefined));
  }, [branchId, date, exp]);

  // The code box and the type box follow each other: a typed code picks its type, a picked type writes its code.
  const typeOfCode = (typed: string) => { const d = latinNumber(typed.trim()); return /^\d{1,9}$/.test(d) ? types.find((x) => x.expenseCode === Number(d)) : undefined; };
  const onCode = (v: string) => { edited(); setCode(v); setTypeId(typeOfCode(v)?.id ?? ""); };
  const onType = (id: string) => { edited(); setTypeId(id); const ty = types.find((x) => x.id === id); setCode(ty ? String(ty.expenseCode) : ""); };

  const submit = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral("");
    const e: Record<string, string> = {};
    if (!DAY.test(date)) e.date = m("dateInvalid");
    if (!branchId) e.branchId = fe(tr, "required");
    if (code.trim() && !typeId) e.expenseCode = m("noSuchCode");
    if (!typeId) e.expenseTypeId = fe(tr, "required");
    if (note.trim().length > NOTE_MAX) e.note = fe(tr, "tooLong");
    Object.assign(e, payErrorTexts(tr, paymentErrors(cash, banks, "any"), m("amountsRequired")));
    setErrs(e);
    if (Object.keys(e).length) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); return; }
    setSaving(true);
    const body = { date, branchId, expenseTypeId: typeId, note: note.trim(), ...(cash.trim() !== "" ? { cash: typedPiastres(cash.trim()) } : {}), bankPayments: sentBanks(banks) };
    try {
      const saved = await api(exp ? "/expenses" : "/expense-refunds", { method: "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(m("savedNumber", { code: code6(saved.documentNumber) }));
      reload();
    } catch (x) {
      setSaving(false);
      if (!(x instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(x.error, tr), own: Record<string, string> = {};
      for (const f of (x.error.fields as { field: string; message?: string }[]) ?? []) {
        const payKey = paymentKeyOf(f.field, banks);
        // no money at all: the backend names cash "required"; say it once, under the block
        if (payKey === "cash" && f.message === "required") own.sum = m("amountsRequired");
        else if (payKey) own[payKey] = texts[f.field];
        else if (f.field === "branchId") own.branchId = f.message === "invalid" ? m("branchInvalid") : texts[f.field];
        else if (f.field === "expenseTypeId") own.expenseTypeId = f.message === "invalid" ? m("expenseTypeInvalid") : texts[f.field];
        else if (["date", "note"].includes(f.field)) own[f.field] = texts[f.field];
      }
      if (!Object.keys(own).length) setGeneral(errorText(x.error));   // no field named: say it once, what was typed stays
      setErrs(own);
    }
  };
  const field = (name: string, htmlFor: string, label: string, body: React.ReactNode) => (
    <div className="field" data-k={name} data-err={errs[name] ? "" : undefined}><label htmlFor={htmlFor}>{label}</label>{body}{errs[name] && <ErrBox>{errs[name]}</ErrBox>}</div>
  );

  return (
    <form id="exp" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div id="banners">{general && <div className="note warn" role="alert"><b>{general}</b></div>}</div>
      <div className="card" id="sec-details"><h3>{m("details")}</h3>
        <div className="kv"><span>{m("documentNumber")}</span><span dir="ltr">{branchId && next !== undefined ? code6(next) : m("autoHint")}</span></div>
        <div className="formgrid" style={{ marginTop: 12 }}>
          {field("date", "f-date-btn", `${m("date")} *`, <DatePicker id="f-date" name="date" value={date} onChange={(v) => { edited(); setDate(v || date); }} required />)}
          {field("branchId", "branchId", `${m("branchId")} *`, <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { edited(); setBranchId(v); }} />)}
          <TextBox name="expenseCode" label={m("expenseCode")} value={code} maxLength={9} ltr error={errs.expenseCode} onChange={onCode} />
          {field("expenseTypeId", "expenseTypeId", `${m("expenseTypeId")} *`, <Choice tr={tr} id="expenseTypeId" options={types.map((x) => [x.id, `${code6(x.expenseCode)} · ${x.expenseTypeName}`])} value={typeId} onChange={onType} />)}
          <TextBox name="note" label={m("note")} value={note} maxLength={NOTE_MAX} error={errs.note} onChange={(v) => { edited(); setNote(v); }} />
        </div>
      </div>
      <div className="card" id="sec-payment"><h3>{m("payment")}</h3>
        <PaymentBlock tr={tr} cash={cash} sumLabel={m("total")} onCash={(v) => { edited(); setCash(v); setErrs(withoutPayErrors); }}
          banks={banks} onBanks={(b) => { edited(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
      </div>
      <div className="formbar" id="sec-save">
        <Button type="submit" variant="primary" id="save"><Icon name="check" />{saving ? t("common", "saving") : t("common", "save")}</Button>
        <Button id="cancel" onClick={close}>{t("common", "cancel")}</Button>
      </div>
    </form>
  );
}
