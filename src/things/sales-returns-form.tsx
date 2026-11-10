"use client";
// The new return, a workspace page. Details (branch, date, the sold piece) -> refund (cash and any number of bank rows) -> save.
// One sold piece per return; the refund limit is the server's (409 refundAboveLinePrice). Ported from sales-returns-form.js.
// With a `row` (issue #175) it is the EDIT of that return: the branch, date and piece are shown and stay; only how the refund is paid changes (PUT).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { milligramsText, piastresInput, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { backendFieldErrors } from "@/lib/fields";
import { DatePicker } from "@/components/fields/DatePicker";
import { Icon, toast } from "@/components/engine";
import { Button, Combobox, Input } from "@/components/ui";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, sentBanks, type Bank } from "./sales-invoices-math";
import { revealFirstError } from "@/lib/submit-guard";
import { Choice, ErrBox, allPages, code6, fe, pieceChoices, readPieceCode, sg } from "./sales-form-parts";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { PieceScanner } from "./piece-scanner";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function ReturnForm({ close, reload, tr, row }: CustomFormProps) {
  const { t, L, errorText } = tr;
  const rt = (k: string, v?: Record<string, string>) => t("gold-sales", `returns.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const edit = row?.id ? row : null;   // a saved return: only the refund can change
  const [branches, setBranches] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState<string>(edit?.branchId ?? me?.branchId ?? "");
  const [date, setDate] = useState<string>(edit ? String(edit.date).slice(0, 10) : today());
  const [piece, setPiece] = useState<string>(edit?.pieceCode ?? "");
  const [scanning, setScanning] = useState(false);
  const [choices, setChoices] = useState<Row[]>([]);
  const [cash, setCash] = useState<string>(edit && edit.cashRefund > 0 ? piastresInput(edit.cashRefund) : "");
  const [banks, setBanks] = useState<Bank[]>(edit?.bankPayments?.length ? edit.bankPayments.map((p: Row) => ({ bankAccountId: p.bankAccountId, amount: piastresInput(p.amount) })) : [blankBank()]);
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
    if (edit) return;   // a saved return keeps its number
    const read = (b: string) => api("/document-numbers/next", { query: { documentType: "sales_return", branchId: b || undefined, year: date.slice(0, 4) } });
    read(branchId).catch((e) => { if (branchId && e instanceof ApiFailure && e.status === 403) return read(""); throw e; })
      .then((r) => { setNext(r.next); setChooseBranch(false); })
      .catch((e) => { setNext(undefined); setChooseBranch(e instanceof ApiFailure && e.status === 400 && (e.error.fields as any[] ?? []).some((f) => f.field === "branchId")); });
  }, [branchId, date]);
  useEffect(() => {   // the latest SOLD pieces of the chosen branch
    if (edit || piece.trim().length < 2) return;
    const h = setTimeout(() => pieceChoices(piece, { state: "sold", branchId }).then(setChoices).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [piece, branchId]);

  const pc = readPieceCode(tr, piece);
  // The piece typed, read with its buy price per gram, its cashback and what the shop pays back for it (the server works the number out: (buy price + cashback) x weight).
  const [lookCode, setLookCode] = useState("");
  useEffect(() => { const h = setTimeout(() => setLookCode(pc.code ?? ""), 300); return () => clearTimeout(h); }, [pc.code]);
  const look = useQuery({ queryKey: ["piece-look-up", lookCode], enabled: Boolean(lookCode), retry: false, staleTime: 30_000, queryFn: () => api("/piece-look-up", { query: { pieceCode: lookCode } }) as Promise<Row> });
  const found = look.data?.kind === "piece" ? look.data : null;
  // The sale this return would undo: the piece's newest live sales invoice. A piece never sold has none, so no invoice number or customer is shown.
  const sale: Row | null = found?.sold ? ((found.sales ?? []) as Row[]).find((s) => s.kind === "sale" && !s.deleted) ?? null : null;
  const returnTotal: number | null = found && typeof found.returnTotal === "number" ? found.returnTotal : null;
  const paidNow = cashPaid(cash) + bankPaid(banks);
  // The refund is exactly the total (the owner, 2026-11-09): (today's buy price + cashback) x weight on a new return; an edit changes only how it is paid, so its total is what it refunded.
  const requiredTotal: number | null = edit ? Number(edit.refundTotal) : returnTotal;
  const notEqual = requiredTotal !== null && paidNow !== requiredTotal;
  const mustEqual = (total: number, refund: number) => L(`المبلغ المسترد ${piastresText(refund)} لا يساوي إجمالي المرتجع ${piastresText(total)}: يجب أن يتساويا تماماً.`, `The refund ${piastresText(refund)} is not the return total ${piastresText(total)}: they must be exactly equal.`);
  const refundShown = Boolean(branchId) && DAY.test(date) && piece.trim() !== "" && !pc.error;   // an edit has all three already
  const payCodes = paymentErrors(cash, banks, "any");
  const may = refundShown && !Object.keys(payCodes).length && !notEqual && !saving;

  const submit = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral(""); setAbove(false);
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = fe(tr, "required");
    if (!DAY.test(date)) e.date = sg(tr, "dateInvalid");
    else if (isUser && date > today()) e.date = fe(tr, "invalid");        // a User cannot date a return after today (the backend refuses it too)
    if (piece.trim() === "") e.pieceCode = fe(tr, "required"); else if (pc.error) e.pieceCode = pc.error;
    if (refundShown) Object.assign(e, payErrorTexts(tr, payCodes, rt("refundRequired")));
    if (refundShown && notEqual && !Object.keys(payCodes).length) e.sum = mustEqual(requiredTotal!, paidNow);   // not higher and not lower: the server refuses it too   // the refund block shows only once branch, date and piece are right: an error nobody can see is never counted
    setErrs(e);
    if (Object.keys(e).length) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); revealFirstError(); return; }
    setSaving(true);
    const refund = { ...(cash.trim() !== "" ? { cashRefund: typedPiastres(cash.trim()) } : {}), bankPayments: sentBanks(banks) };
    const body = edit ? refund : { branchId, date, pieceCode: pc.code, ...refund };   // an edit sends only the refund
    try {
      const saved = await api(edit ? `/returns/${edit.id}` : "/returns", { method: edit ? "PUT" : "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(rt("savedNumber", { code: code6(saved.returnNumber) }));
      reload();
    } catch (x) {
      setSaving(false);
      if (!(x instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
      const key = x.error.message, texts = backendFieldErrors(x.error, tr), own: Record<string, string> = {};
      if (key === "refundAboveLinePrice") setAbove(true);
      else if (key === "pieceNotReturnable") own.pieceCode = rt("pieceNotReturnable");
      else if (key === "refundNotReturnTotal") own.sum = mustEqual(Number(x.error.values?.total ?? 0), Number(x.error.values?.refund ?? 0));
      else for (const f of (x.error.fields as any[]) ?? []) {
        const payKey = paymentKeyOf(f.field, banks, "cashRefund");
        if (payKey) own[payKey] = payKey === "sum" && f.message === "required" ? rt("refundRequired") : texts[f.field];
        else if (["branchId", "date", "pieceCode"].includes(f.field)) own[f.field] = texts[f.field];
      }
      if (key !== "refundAboveLinePrice" && !Object.keys(own).length) setGeneral(errorText(x.error));   // no field named: say it once
      setErrs(own); revealFirstError();
    }
  };
  const field = (name: string, htmlFor: string, label: string, body: ReactNode, help?: string) => (
    <div className="field" data-k={name} data-err={errs[name] ? "" : undefined}><label htmlFor={htmlFor}>{label}</label>{body}{help && <div className="help">{help}</div>}{errs[name] && <ErrBox>{errs[name]}</ErrBox>}</div>
  );
  const num = edit ? code6(edit.returnNumber) : next !== undefined ? code6(next) : chooseBranch ? t("common", "chooseBranchForNumber") : "";

  return (
    <form id="ret" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div id="banners">
        {above && <div className="note warn" role="alert" data-field-error><b>{rt("refundAboveLinePrice")}</b></div>}
        {general && <div className="note warn" role="alert" data-field-error><b>{general}</b></div>}
      </div>
      <div className="card"><h3>{edit ? `${t("common", "edit")} · ${code6(edit.returnNumber)}` : rt("new")}</h3>
        <div id="system"><div className="kv"><span>{rt("returnNumber")}</span><span dir="ltr">{num}</span></div></div>
        {edit ? (
          <div id="detailsFixed">
            <div className="kv"><span>{sg(tr, "branch")}</span><span>{branches.find((x) => x.id === branchId)?.branchName ?? ""}</span></div>
            <div className="kv"><span>{rt("date")}</span><span dir="ltr">{date}</span></div>
            <div className="kv"><span>{rt("pieceCode")}</span><span dir="ltr">{piece}</span></div>
          </div>
        ) : (
        <div className="formgrid" id="detailsGrid">
          {field("branchId", "branchId", `${sg(tr, "branch")} *`, <Choice tr={tr} id="branchId" options={branches.map((x) => [x.id, x.branchName])} value={branchId} onChange={(v) => { edited(); setBranchId(v); }} />)}
          {field("date", "f-date-btn", `${rt("date")} *`, <DatePicker id="f-date" name="date" value={date} onChange={(v) => { edited(); setDate(v || date); }} max={isUser ? today() : undefined} required />)}
          {field("pieceCode", "pc", `${rt("pieceCode")} *`, <>
            <div style={{ display: "flex", gap: 8 }}>
              <Combobox id="pc" kind="code" dir="ltr" mono maxLength={20} value={piece} onChange={(v) => { edited(); setPiece(v); }}
                options={choices.map((p) => ({ text: p.pieceCode, hint: `${p.itemName ?? ""} · ${p.karat ?? ""}` }))} />
              <Button id="scan-piece" style={{ width: 42, padding: 0, flex: "none" }} title={t("gold-sales", "pieceLookUp.scanWithCamera")} aria-label={t("gold-sales", "pieceLookUp.scanWithCamera")} onClick={() => setScanning(true)}><Icon name="camera" size={18} /></Button>
            </div>
            {scanning && <PieceScanner label={rt("pieceCode")} onClose={() => setScanning(false)} onCode={(c) => { edited(); setPiece(c); setScanning(false); }} />}
</>, rt("pieceCodeHint"))}
        </div>
        )}
      </div>
      {refundShown && lookCode && (
        <div className="card" id="sec-piece"><h3>{L("تفاصيل القطعة", "Piece details")}</h3>
          {look.isPending && <p className="help" role="status">{t("common", "loading")}</p>}
          {look.isError && <p className="help" id="piece-unknown">{L("لا توجد قطعة بهذا الكود.", "No piece has this code.")}</p>}
          {found && <div id="pieceDetails">
            <div className="kv"><span>{L("الاسم", "Name")}</span><span dir="ltr">{found.itemName}</span></div>
            {sale && <div className="kv"><span>{L("رقم فاتورة البيع", "Sales invoice number")}</span><span dir="ltr" id="piece-invoice">{code6(sale.documentNumber)}</span></div>}
            {sale && <div className="kv"><span>{L("اسم العميل", "Customer name")}</span><span id="piece-customer">{sale.customerName || "—"}</span></div>}
            <div className="kv"><span>{L("العيار", "Karat")}</span><span dir="ltr">{found.karat}</span></div>
            <div className="kv"><span>{L("الوزن (جم)", "Weight (g)")}</span><span dir="ltr">{milligramsText(found.weight)}</span></div>
            <div className="kv"><span>{L("سعر الشراء للجرام", "Buy price per gram")}</span><span dir="ltr">{found.buyPricePerGram === null ? "—" : piastresText(found.buyPricePerGram)}</span></div>
            <div className="kv"><span>{L("الكاش باك للجرام", "Cashback per gram")}</span><span dir="ltr">{found.cashbackPerGram === null ? "—" : piastresText(found.cashbackPerGram)}</span></div>
            <div className="kv"><b>{rt("refundTotal")}</b><b dir="ltr" id="piece-total">{requiredTotal === null ? "—" : piastresText(requiredTotal)}</b></div>
            {found.cashbackPerGram === null && <p className="help">{L("لا يوجد كاش باك محفوظ لهذا الصنف، فالإجمالي بدونه.", "This item has no cashback saved, so the total is without it.")}</p>}
            {found.buyPricePerGram === null && <p className="help">{L("لا يوجد سعر شراء لهذا العيار في أسعار اليوم.", "There is no buy price for this karat in today's prices.")}</p>}
            {!found.sold && <div className="note warn" role="alert">{L("هذه القطعة لم تُبع، فلا يمكن إرجاعها.", "This piece was not sold, so it cannot be returned.")}</div>}
          </div>}
        </div>
      )}
      {refundShown && (
        <div className="card" id="sec-refund"><h3>{rt("refund")}</h3>
          {found && <div className="pay-sum" id="ret-total"><span className="help">{rt("refundTotal")}</span><b dir="ltr" data-summary>{requiredTotal === null ? "—" : piastresText(requiredTotal)}</b></div>}
          <PaymentBlock tr={tr} cashName="cashRefund" cashLabel={rt("cashRefund")} sumLabel={L("المدفوع", "Paid")} cash={cash} onCash={(v) => { edited(); setCash(v); setErrs(withoutPayErrors); }}
            banks={banks} onBanks={(b) => { edited(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
          {requiredTotal !== null && <div className="pay-sum" id="ret-left"><span className="help">{requiredTotal - paidNow < 0 ? L("زيادة", "Over") : L("المتبقي", "Remaining")}</span><b dir="ltr" data-summary>{piastresText(Math.abs(requiredTotal - paidNow))}</b></div>}
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
