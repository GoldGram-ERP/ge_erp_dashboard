"use client";
// The new return, a workspace page. Details (branch, date, the sold piece) -> refund (cash and any number of bank rows) -> save.
// One sold piece per return; the refund limit is the server's (409 refundAboveLinePrice). Ported from sales-returns-form.js.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { backendFieldErrors } from "@/lib/fields";
import { DatePicker } from "@/components/fields/DatePicker";
import { Icon, toast } from "@/components/engine";
import { Button, Input } from "@/components/ui";
import { paymentErrors, paymentKeyOf, sentBanks, type Bank } from "./sales-invoices-math";
import { Choice, ErrBox, allPages, code6, fe, pieceChoices, readPieceCode, sg } from "./sales-form-parts";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { PieceScanner } from "./piece-scanner";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function ReturnForm({ close, reload, tr }: CustomFormProps) {
  const { t, L, errorText } = tr;
  const rt = (k: string, v?: Record<string, string>) => t("gold-sales", `returns.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const [branches, setBranches] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState(me?.branchId ?? "");
  const [date, setDate] = useState(today());
  const [piece, setPiece] = useState("");
  const [scanning, setScanning] = useState(false);
  const [choices, setChoices] = useState<Row[]>([]);
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<Bank[]>([blankBank()]);
  const [next, setNext] = useState<number | undefined>();
  const [chooseBranch, setChooseBranch] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [above, setAbove] = useState(false);
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const edited = () => { saveKey.current = newSaveKey(); setAbove(false); };

  useEffect(() => {
    Promise.all([allPages("/branches").catch(() => []), allPages("/bank-accounts").catch(() => [])]).then(([b, a]) => { setBranches(b); setAccounts(a); setBranchId((cur) => cur || (b.length === 1 ? b[0].id : "")); });
  }, []);
  useEffect(() => {
    const read = (b: string) => api("/document-numbers/next", { query: { documentType: "sales_return", branchId: b || undefined, year: date.slice(0, 4) } });
    read(branchId).catch((e) => { if (branchId && e instanceof ApiFailure && e.status === 403) return read(""); throw e; })
      .then((r) => { setNext(r.next); setChooseBranch(false); })
      .catch((e) => { setNext(undefined); setChooseBranch(e instanceof ApiFailure && e.status === 400 && (e.error.fields as any[] ?? []).some((f) => f.field === "branchId")); });
  }, [branchId, date]);
  useEffect(() => {   // the latest SOLD pieces of the chosen branch
    if (piece.trim().length < 2) return;
    const h = setTimeout(() => pieceChoices(piece, { state: "sold", branchId }).then(setChoices).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [piece, branchId]);

  const pc = readPieceCode(tr, piece);
  const refundShown = Boolean(branchId) && DAY.test(date) && piece.trim() !== "" && !pc.error;
  const payCodes = paymentErrors(cash, banks, "any");
  const may = refundShown && !Object.keys(payCodes).length && !saving;

  const submit = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral(""); setAbove(false);
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = fe(tr, "required");
    if (!DAY.test(date)) e.date = sg(tr, "dateInvalid");
    else if (isUser && date > today()) e.date = fe(tr, "invalid");        // a User cannot date a return after today (the backend refuses it too)
    if (piece.trim() === "") e.pieceCode = fe(tr, "required"); else if (pc.error) e.pieceCode = pc.error;
    Object.assign(e, payErrorTexts(tr, payCodes, rt("refundRequired")));
    setErrs(e);
    if (Object.keys(e).length) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); return; }
    setSaving(true);
    const body = { branchId, date, pieceCode: pc.code, ...(cash.trim() !== "" ? { cashRefund: typedPiastres(cash.trim()) } : {}), bankPayments: sentBanks(banks) };
    try {
      const saved = await api("/returns", { method: "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(rt("savedNumber", { code: code6(saved.returnNumber) }));
      reload();
    } catch (x) {
      setSaving(false);
      if (!(x instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const key = x.error.message, texts = backendFieldErrors(x.error, tr), own: Record<string, string> = {};
      if (key === "refundAboveLinePrice") setAbove(true);
      else if (key === "pieceNotReturnable") own.pieceCode = rt("pieceNotReturnable");
      else for (const f of (x.error.fields as any[]) ?? []) {
        const payKey = paymentKeyOf(f.field, banks, "cashRefund");
        if (payKey) own[payKey] = payKey === "sum" && f.message === "required" ? rt("refundRequired") : texts[f.field];
        else if (["branchId", "date", "pieceCode"].includes(f.field)) own[f.field] = texts[f.field];
      }
      if (key !== "refundAboveLinePrice" && !Object.keys(own).length) setGeneral(errorText(x.error));   // no field named: say it once
      setErrs(own);
    }
  };
  const field = (name: string, htmlFor: string, label: string, body: ReactNode, help?: string) => (
    <div className="field" data-k={name} data-err={errs[name] ? "" : undefined}><label htmlFor={htmlFor}>{label}</label>{body}{help && <div className="help">{help}</div>}{errs[name] && <ErrBox>{errs[name]}</ErrBox>}</div>
  );
  const num = next !== undefined ? code6(next) : chooseBranch ? t("common", "chooseBranchForNumber") : "";

  return (
    <form id="ret" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div id="banners">
        {above && <div className="note warn" role="alert"><b>{rt("refundAboveLinePrice")}</b></div>}
        {general && <div className="note warn" role="alert"><b>{general}</b></div>}
      </div>
      <div className="card"><h3>{rt("new")}</h3>
        <div id="system"><div className="kv"><span>{rt("returnNumber")}</span><span dir="ltr">{num}</span></div></div>
        <div className="formgrid" id="detailsGrid">
          {field("branchId", "branchId", `${sg(tr, "branch")} *`, <Choice tr={tr} id="branchId" options={branches.map((x) => [x.id, x.branchName])} value={branchId} onChange={(v) => { edited(); setBranchId(v); }} />)}
          {field("date", "f-date-btn", `${rt("date")} *`, <DatePicker id="f-date" name="date" value={date} onChange={(v) => { edited(); setDate(v || date); }} max={isUser ? today() : undefined} required />)}
          {field("pieceCode", "pc", `${rt("pieceCode")} *`, <>
            <div style={{ display: "flex", gap: 8 }}>
              <Input id="pc" dir="ltr" list="pcl" maxLength={20} autoComplete="off" value={piece} onChange={(e) => { edited(); setPiece(e.target.value); }} style={{ fontFamily: "monospace", flex: 1, minWidth: 0 }} />
              <Button id="scan-piece" style={{ width: 42, padding: 0, flex: "none" }} title={t("gold-sales", "pieceLookUp.scanWithCamera")} aria-label={t("gold-sales", "pieceLookUp.scanWithCamera")} onClick={() => setScanning(true)}><Icon name="camera" size={18} /></Button>
            </div>
            {scanning && <PieceScanner label={rt("pieceCode")} onClose={() => setScanning(false)} onCode={(c) => { edited(); setPiece(c); setScanning(false); }} />}
            <datalist id="pcl">{choices.map((p) => <option key={p.pieceCode} value={p.pieceCode}>{`${p.itemName ?? ""} · ${p.karat ?? ""}`}</option>)}</datalist></>, rt("pieceCodeHint"))}
        </div>
      </div>
      {refundShown && (
        <div className="card" id="sec-refund"><h3>{rt("refund")}</h3>
          <PaymentBlock tr={tr} cashName="cashRefund" cashLabel={rt("cashRefund")} sumLabel={rt("refundTotal")} cash={cash} onCash={(v) => { edited(); setCash(v); setErrs(withoutPayErrors); }}
            banks={banks} onBanks={(b) => { edited(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
        </div>
      )}
      {refundShown && (
        <div className="formbar" id="sec-save">
          <Button type="submit" variant="primary" aria-disabled={!may} style={may ? undefined : { opacity: 0.6 }}><Icon name="check" />{saving ? t("common", "saving") : t("common", "save")}</Button>
          <Button id="cancelRet" onClick={close}>{t("common", "cancel")}</Button>
        </div>
      )}
    </form>
  );
}
