"use client";
// The new return, a workspace page. Details (branch, date) -> the sold pieces coming back (one card each) -> refund (cash and any number of bank rows) -> save.
// One return takes back MANY sold pieces (owner, 2026-11-10): a piece is added only when its code is entered (Enter, the add button) or scanned, never while
// typing; each piece shows its own invoice number and customer and has its own remove button. The refund is exactly the total of the sold pieces (the server's
// number: 409 refundNotReturnTotal). Ported from sales-returns-form.js.
// With a `row` (issue #175) it is the EDIT of that return: the branch, date and pieces are shown and stay; only how the refund is paid changes (PUT).
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { milligramsText, piastresInput, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { backendFieldErrors } from "@/lib/fields";
import { DatePicker } from "@/components/fields/DatePicker";
import { Icon, toast } from "@/components/engine";
import { Button, Input } from "@/components/ui";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, sentBanks, type Bank } from "./sales-invoices-math";
import { revealFirstError } from "@/lib/submit-guard";
import { Choice, ErrBox, allPages, code6, fe, readPieceCode, sg } from "./sales-form-parts";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { PieceScanner } from "./piece-scanner";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PIECES_MAX = 50;   // the backend's limit for one return

/** One piece of the return as the screen reads it: what the look-up said, and so whether it can be returned and for how much. */
type Info = { code: string; loading: boolean; unknown: boolean; found: Row | null; sold: boolean; total: number | null; sale: Row | null };

export function ReturnForm({ close, reload, tr, row }: CustomFormProps) {
  const { t, L, errorText } = tr;
  const rt = (k: string, v?: Record<string, string>) => t("gold-sales", `returns.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const edit = row?.id ? row : null;   // a saved return: only the refund can change
  const editLines: Row[] = edit ? (edit.lines ?? []) : [];
  const [branches, setBranches] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState<string>(edit?.branchId ?? me?.branchId ?? "");
  const [date, setDate] = useState<string>(edit ? String(edit.date).slice(0, 10) : today());
  const [piece, setPiece] = useState<string>("");                                   // what is typed in the code box (nothing is looked up until it is added)
  const [pieces, setPieces] = useState<string[]>(editLines.map((l) => String(l.pieceCode)));   // the codes added, in the order added
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);   // a code is being looked up
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

  // Each ADDED piece is read once (the piece look-up): its name, karat, weight, today's buy price and cashback, what the shop pays back for it, whether it was sold,
  // and the sale it came from. The server works the number out: (buy price + cashback) x weight.
  const lookUp = (code: string) => api("/piece-look-up", { query: { pieceCode: code } }) as Promise<Row>;
  const looks = useQueries({ queries: pieces.map((code) => ({ queryKey: ["piece-look-up", code], retry: false, staleTime: 30_000, queryFn: () => lookUp(code) })) });
  const infos: Info[] = pieces.map((code, i) => {
    const q = looks[i], d = q?.data;
    const found = d?.kind === "piece" ? d : null;
    const line = editLines.find((l) => String(l.pieceCode) === code);
    // The sale it came from: the newest live sale of a sold piece; on a saved return the very sale it was returned from.
    const sale = (found?.sales ?? []).find((s: Row) => s.kind === "sale" && (line ? s.id === line.sourceSalesInvoiceId : found?.sold && !s.deleted)) ?? null;
    const total = line ? Number(line.refundTotal) : found?.sold && typeof found.returnTotal === "number" ? found.returnTotal : null;
    return { code, loading: !!q?.isPending, unknown: !!q && !q.isPending && !found, found, sold: !!found?.sold, total, sale };
  });
  // The total is the sold pieces only; a piece that was not sold (or is unknown) adds nothing and blocks the save until it is removed.
  const returnTotal: number | null = infos.length === 0 ? null : infos.reduce((sum, i) => sum + (i.sold && i.total !== null ? i.total : 0), 0);
  const blocked = !edit && infos.some((i) => i.loading || i.unknown || !i.sold || i.total === null);
  const paidNow = cashPaid(cash) + bankPaid(banks);
  // The refund is exactly the total (the owner, 2026-11-09): the sum of (today's buy price + cashback) x weight on a new return; an edit changes only how it is paid, so its total is what it refunded.
  const requiredTotal: number | null = edit ? Number(edit.refundTotal) : returnTotal;
  const notEqual = requiredTotal !== null && paidNow !== requiredTotal;
  const mustEqual = (total: number, refund: number) => L(`المبلغ المسترد ${piastresText(refund)} لا يساوي إجمالي المرتجع ${piastresText(total)}: يجب أن يتساويا تماماً.`, `The refund ${piastresText(refund)} is not the return total ${piastresText(total)}: they must be exactly equal.`);
  const refundShown = Boolean(branchId) && DAY.test(date) && pieces.length > 0;   // an edit has all three already
  const payCodes = paymentErrors(cash, banks, "any");
  const may = refundShown && !blocked && !Object.keys(payCodes).length && !notEqual && !saving;

  // A piece is added only by the user's own act: Enter in the code box, the add button, or a scan. Never while typing.
  // The piece is looked up as it is added (never while typing). One that does not exist or was not sold is not added: its message shows under the code box
  // and the box keeps what was typed. The look-up is kept, so the piece's card reads it again at once.
  const addPiece = async (scanned?: string) => {
    if (adding) return;
    const r = readPieceCode(tr, scanned ?? piece);
    const fail = (text: string) => setErrs((o) => ({ ...o, pieceCode: text }));
    if (!r.code) { fail(r.error ?? fe(tr, "required")); return; }
    if (pieces.some((p) => p.toLowerCase() === r.code.toLowerCase())) { fail(L("هذه القطعة مضافة بالفعل.", "This piece is already added.")); return; }
    if (pieces.length >= PIECES_MAX) { fail(L(`لا يزيد المرتجع عن ${PIECES_MAX} قطعة.`, `A return holds at most ${PIECES_MAX} pieces.`)); return; }
    setAdding(true);
    let found: Row | null = null, failed = false;
    try {
      const data = await qc.fetchQuery({ queryKey: ["piece-look-up", r.code], queryFn: () => lookUp(r.code), staleTime: 30_000, retry: false });
      found = data?.kind === "piece" ? data : null;
    } catch (e) { failed = !(e instanceof ApiFailure && e.status === 404); }
    setAdding(false);
    if (failed) { fail(L("تعذّر البحث عن القطعة. حاول من جديد.", "Could not look the piece up. Try again.")); return; }
    if (!found) { fail(L("لا توجد قطعة بهذا الكود.", "No piece has this code.")); return; }
    if (!found.sold) { fail(L("هذه القطعة لم تُبع، فلا يمكن إرجاعها.", "This piece was not sold, so it cannot be returned.")); return; }
    edited();
    setPieces((o) => (o.includes(r.code) ? o : [...o, r.code]));
    setPiece("");
    setErrs((o) => { const n = { ...o }; delete n.pieceCode; delete n.pieces; delete n.sum; return n; });
  };
  const removePiece = (code: string) => {
    edited();
    setPieces((o) => o.filter((p) => p !== code));
    setErrs((o) => { const n = { ...o }; delete n[`piece:${code}`]; delete n.pieces; delete n.sum; return n; });
  };

  const submit = async () => {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral(""); setAbove(false);
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = fe(tr, "required");
    if (!DAY.test(date)) e.date = sg(tr, "dateInvalid");
    else if (isUser && date > today()) e.date = fe(tr, "invalid");        // a User cannot date a return after today (the backend refuses it too)
    if (pieces.length === 0) e.pieceCode = fe(tr, "required");
    else if (blocked) e.pieces = L("احذف القطع التي لم تُبَع أو غير الموجودة قبل الحفظ، وانتظر انتهاء التحميل.", "Remove the pieces that were not sold or do not exist before saving, and wait for loading to finish.");
    if (refundShown) Object.assign(e, payErrorTexts(tr, payCodes, rt("refundRequired")));
    if (refundShown && !blocked && notEqual && !Object.keys(payCodes).length) e.sum = mustEqual(requiredTotal!, paidNow);   // not higher and not lower: the server refuses it too   // the refund block shows only once branch, date and a piece are right: an error nobody can see is never counted
    setErrs(e);
    if (Object.keys(e).length) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); revealFirstError(); return; }
    setSaving(true);
    const refund = { ...(cash.trim() !== "" ? { cashRefund: typedPiastres(cash.trim()) } : {}), bankPayments: sentBanks(banks) };
    const body = edit ? refund : { branchId, date, pieceCodes: pieces, ...refund };   // an edit sends only the refund
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
      else if (key === "pieceNotReturnable") { const code = String(x.error.values?.pieceCode ?? ""); if (code) own[`piece:${code}`] = rt("pieceNotReturnable"); else own.pieces = rt("pieceNotReturnable"); }
      else if (key === "refundNotReturnTotal") own.sum = mustEqual(Number(x.error.values?.total ?? 0), Number(x.error.values?.refund ?? 0));
      else for (const f of (x.error.fields as any[]) ?? []) {
        const payKey = paymentKeyOf(f.field, banks, "cashRefund");
        if (payKey) own[payKey] = payKey === "sum" && f.message === "required" ? rt("refundRequired") : texts[f.field];
        else if (["branchId", "date"].includes(f.field)) own[f.field] = texts[f.field];
        else if (f.field === "pieceCodes") own.pieces = texts[f.field];
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
          </div>
        ) : (
        <div className="formgrid" id="detailsGrid">
          {field("branchId", "branchId", `${sg(tr, "branch")} *`, <Choice tr={tr} id="branchId" options={branches.map((x) => [x.id, x.branchName])} value={branchId} onChange={(v) => { edited(); setBranchId(v); }} />)}
          {field("date", "f-date-btn", `${rt("date")} *`, <DatePicker id="f-date" name="date" value={date} onChange={(v) => { edited(); setDate(v || date); }} max={isUser ? today() : undefined} required />)}
          {field("pieceCode", "pc", `${rt("pieceCode")} *`, <>
            <div style={{ display: "flex", gap: 8 }}>
              <Input id="pc" kind="code" dir="ltr" maxLength={20} autoComplete="off" value={piece} placeholder={L("اكتب الكود ثم Enter، أو امسحه", "Type the code then press Enter, or scan it")}
                onChange={(e) => { setPiece(e.target.value); setErrs((o) => { if (!o.pieceCode) return o; const n = { ...o }; delete n.pieceCode; return n; }); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPiece(); } }} />
              <Button id="add-piece" title={L("إضافة القطعة", "Add the piece")} aria-label={L("إضافة القطعة", "Add the piece")} disabled={adding} onClick={() => addPiece()}><Icon name="plus" size={18} /></Button>
              <Button id="scan-piece" style={{ width: 42, padding: 0, flex: "none" }} title={t("gold-sales", "pieceLookUp.scanWithCamera")} aria-label={t("gold-sales", "pieceLookUp.scanWithCamera")} onClick={() => setScanning(true)}><Icon name="camera" size={18} /></Button>
            </div>
            {scanning && <PieceScanner label={rt("pieceCode")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); addPiece(c); }} />}
</>, L("اكتب كود القطعة المباعة المرتجعة واضغط Enter، أو امسحه بالكاميرا. كل قطعة لها بطاقتها.", "Type the code of a sold piece coming back and press Enter, or scan it. Every piece gets its own card."))}
        </div>
        )}
      </div>
      {infos.map((info, n) => (
        <div className="card" id={n === 0 ? "sec-piece" : undefined} key={info.code} data-piece-card={info.code}>
          <div className="card-head">
            <h3>{L("تفاصيل القطعة", "Piece details")} {infos.length > 1 ? n + 1 : ""} · <span dir="ltr">{info.code}</span></h3>
            {!edit && <Button size="sm" danger data-rmpiece={info.code} aria-label={L(`إزالة القطعة ${info.code}`, `Remove piece ${info.code}`)} onClick={() => removePiece(info.code)}><Icon name="trash" size={15} />{sg(tr, "remove")}</Button>}
          </div>
          {info.loading && <p className="help" role="status">{t("common", "loading")}</p>}
          {info.unknown && <p className="help" id="piece-unknown">{L("لا توجد قطعة بهذا الكود.", "No piece has this code.")}</p>}
          {info.found && <div id={n === 0 ? "pieceDetails" : undefined}>
            <div className="kv"><span>{L("الاسم", "Name")}</span><span dir="ltr">{info.found.itemName}</span></div>
            {info.sale && <div className="kv"><span>{L("رقم فاتورة البيع", "Sales invoice number")}</span><span dir="ltr" id={n === 0 ? "piece-invoice" : undefined}>{code6(info.sale.documentNumber)}</span></div>}
            {info.sale && <div className="kv"><span>{L("اسم العميل", "Customer name")}</span><span dir="ltr" id={n === 0 ? "piece-customer" : undefined}>{info.sale.customerName || "—"}</span></div>}
            <div className="kv"><span>{L("العيار", "Karat")}</span><span dir="ltr">{info.found.karat}</span></div>
            <div className="kv"><span>{L("الوزن (جم)", "Weight (g)")}</span><span dir="ltr">{milligramsText(info.found.weight)}</span></div>
            <div className="kv"><span>{L("سعر الشراء للجرام", "Buy price per gram")}</span><span dir="ltr">{info.found.buyPricePerGram === null ? "—" : piastresText(info.found.buyPricePerGram)}</span></div>
            <div className="kv"><span>{L("الكاش باك للجرام", "Cashback per gram")}</span><span dir="ltr">{info.found.cashbackPerGram === null ? "—" : piastresText(info.found.cashbackPerGram)}</span></div>
            <div className="kv"><b>{rt("refundTotal")}</b><b dir="ltr" id={n === 0 ? "piece-total" : undefined}>{info.total === null ? "—" : piastresText(info.total)}</b></div>
            {info.found.cashbackPerGram === null && <p className="help">{L("لا يوجد كاش باك محفوظ لهذا الصنف، فالإجمالي بدونه.", "This item has no cashback saved, so the total is without it.")}</p>}
            {info.found.buyPricePerGram === null && <p className="help">{L("لا يوجد سعر شراء لهذا العيار في أسعار اليوم.", "There is no buy price for this karat in today's prices.")}</p>}
            {/* a piece never sold (or already back in stock) cannot be returned; its price is NOT in the total. On a saved return the piece is back in stock by design. */}
            {!edit && !info.sold && <div className="note warn" role="alert">{L("هذه القطعة لم تُبع، فلا يمكن إرجاعها. لا تدخل في الإجمالي؛ احذفها قبل الحفظ.", "This piece was not sold, so it cannot be returned. It is not in the total; remove it before saving.")}</div>}
          </div>}
          {errs[`piece:${info.code}`] && <ErrBox>{errs[`piece:${info.code}`]}</ErrBox>}
        </div>
      ))}
      {errs.pieces && <ErrBox>{errs.pieces}</ErrBox>}
      {refundShown && (
        <div className="card" id="sec-refund"><h3>{rt("refund")}</h3>
          {requiredTotal !== null && <div className="pay-sum" id="ret-total"><span className="help">{rt("refundTotal")}</span><b dir="ltr" data-summary>{piastresText(requiredTotal)}</b></div>}
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
