"use client";
import { Button, Combobox, DataTable, Input, Seg, Td, Tr } from "@/components/ui";
// The new sales invoice, a workspace page. System values (number, gold price, date, branch, seller) are the system's and locked;
// steps unlock in order (type + branch -> pieces -> customer -> payment -> save); money is integer piastres.
// Also the invoice made from a reservation: /sales/invoices?reservation=<id> (the page then opens whole). Ported from sales-invoices-form.js.
// With a `row` (issue #175) it is the EDIT of that invoice: the number, date, branch, seller, type and price day stay; the customer, gift, pieces, payment and
// discount are filled in and saved with PUT. A new piece is priced at the invoice's own day (GET /piece-look-up?salesInvoiceId=). On an invoice made from a
// reservation the customer and prices are the reservation's: the pieces must be its items again and the payment is what is left.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { latinNumber, milligramsText, piastresInput, piastresText, today, typedPiastres } from "@/lib/format";
import { isPhone } from "@/lib/phone";
import { backendFieldErrors } from "@/lib/fields";
import { useMe } from "@/lib/session";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { Icon, toast } from "@/components/engine";
import { revealFirstError } from "@/lib/submit-guard";
import { LINES_MAX, makingBase, paymentErrors, paymentKeyOf, readDiscount, sentBanks, totalsOf, type Bank } from "./sales-invoices-math";
import { Choice, DiscountBox, ErrBox, PIECE_CODE, allPages, checkedCustomer, code6, customerFields, customerNameOf, fe, latestPrice, mayDiscount, sg, type DiscountKind } from "./sales-form-parts";
import { Breakdown, PaymentBlock, PriceButton, TotalsBar, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { pricePerGram } from "./item-math";
import { Link as NavLink } from "@/i18n/navigation";
import { GiftFields, checkRecipient, type Recipient, type RecipientErrors } from "./sales-gift";
import { PieceScanner } from "./piece-scanner";

type Line = Row;
const fills = (line: Row, piece: Row) => line.itemName === piece.itemName && line.karat === piece.karat;

export function SalesInvoiceForm({ close, reload, tr, row }: CustomFormProps) {
  const { t, L, errorText } = tr;
  const m = (k: string, v?: Record<string, string | number>) => sg(tr, k, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const edit = row?.id ? row : null;   // a saved invoice: the form starts with its values
  const reservationId: string = edit ? (edit.reservation?.id ?? "") : typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("reservation") ?? "";

  const [type, setType] = useState<string>(edit?.invoiceType ?? "");
  const [branchId, setBranchId] = useState<string>(edit?.branchId ?? me?.branchId ?? "");
  const [branchName, setBranchName] = useState("");
  const [branches, setBranches] = useState<Row[]>([]);
  const [pickBranch, setPickBranch] = useState(false);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [price, setPrice] = useState<Row | null | undefined>(edit ? { date: edit.priceDate, sellPrice: edit.goldPrice21k, silverSellPrice: null } : undefined);   // an edit shows the invoice's own price
  const [next, setNext] = useState<number | undefined>();
  const [chooseBranch, setChooseBranch] = useState(false);
  const [lines, setLines] = useState<Line[]>(edit ? (edit.lines as Row[]).map((l) => ({ pieceCode: l.pieceCode, itemName: l.itemName, karat: l.karat, weight: l.weight, weight24Mg: l.weight24Mg, pricePerGram24: l.pricePerGram24, goldValue: l.goldValue, makingCharge: l.makingCharge, makingChargePerGram: l.makingChargePerGram, linePrice: l.linePrice })) : []);
  const [lineErr, setLineErr] = useState<Record<string, string>>({});
  const [pc, setPc] = useState("");
  const [scanning, setScanning] = useState(false);
  const [pcErr, setPcErr] = useState("");
  const [choices, setChoices] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [cash, setCash] = useState<string>(edit && edit.cash > 0 ? piastresInput(edit.cash) : "");
  const [banks, setBanks] = useState<Bank[]>(edit?.bankPayments?.length ? (edit.bankPayments as Row[]).map((p) => ({ bankAccountId: p.bankAccountId, amount: piastresInput(p.amount) })) : [blankBank()]);
  const [how, setHow] = useState("");   // the piece whose price breakdown is open
  const [kind, setKind] = useState<DiscountKind>("amount");
  const [disc, setDisc] = useState<string>(edit && !reservationId && edit.cashDiscount > 0 ? piastresInput(edit.cashDiscount) : "");   // saved as an amount of piastres
  const [made, setMade] = useState<Row | null>(null);
  const [gone, setGone] = useState(false);
  const [takenBy, setTakenBy] = useState<number | undefined>();
  const [mismatch, setMismatch] = useState<Row[] | null>(null);
  const [refused, setRefused] = useState(false);
  const [payRefusal, setPayRefusal] = useState<{ total: number; paid: number } | null>(null);
  const [general, setGeneral] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [short, setShort] = useState(false);
  const [gift, setGift] = useState(Boolean(edit?.isGift));
  const [recipient, setRecipient] = useState<Recipient>({ name: edit?.giftRecipientName ?? "", phone: edit?.giftRecipientPhone ?? "" });
  const [recipientErr, setRecipientErr] = useState<RecipientErrors>({});
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const edited = () => { saveKey.current = newSaveKey(); setShort(false); setPayRefusal(null); };

  const cust = useFieldsForm(checkedCustomer(tr, customerFields(tr, Boolean(made))), {});
  const custNow = cust.watch() as Record<string, string>;
  const reloadReservation = async () => {
    let r: Row | null = null, g = false;
    try { r = await api(`/reservations/${reservationId}`); g = Boolean(r?.deletedAt); } catch (e) { g = e instanceof ApiFailure && e.status === 404; }
    setMade(r); setGone(g);
    // The invoice made from a reservation sells the pieces it holds (issue #36): they are the lines, read with their prices; nothing is scanned here.
    if (r && !edit && r.pieces?.length) {
      const found = await Promise.all((r.pieces as Row[]).map((p) => api("/piece-look-up", { query: { pieceCode: p.pieceCode } }).catch(() => null)));
      setLines(found.flatMap((piece) => (piece && piece.kind === "piece" ? [{ pieceCode: piece.pieceCode, itemName: piece.itemName, karat: piece.karat, weight: piece.weight, weight24Mg: piece.weight24Mg, pricePerGram24: piece.pricePerGram24, goldValue: piece.goldValue, makingCharge: piece.makingCharge, makingChargePerGram: piece.makingChargePerGram, linePrice: piece.livePrice ?? piece.priceAfterDiscount ?? piece.priceBeforeDiscount ?? ((piece.goldValue ?? 0) + (piece.makingCharge ?? 0)) }] : [])));
    }
    if (r) {
      setBranchId(r.branchId);
      api(`/branches/${r.branchId}`).then((b) => setBranchName(b.branchName)).catch(() => {});
      cust.reset({ customerPhone: r.customerPhone ?? "", customerName: r.customerName ?? "", nationalId: r.nationalId ?? "" });
    }
  };

  // ── start ──
  useEffect(() => {
    if (!edit) latestPrice(today()).then(setPrice).catch(() => setPrice(undefined));   // the latest saved set up to today, always (an edit keeps the invoice's own)
    allPages("/bank-accounts").then(setAccounts).catch(() => {});
    if (edit) {   // a saved invoice: its branch name and, when it has none from a reservation, its customer
      api(`/branches/${edit.branchId}`).then((b) => setBranchName(b.branchName)).catch(() => {});
      if (!reservationId) cust.reset({ customerPhone: edit.customerPhone ?? "", customerName: edit.customerName ?? "", nationalId: edit.nationalId ?? "" });
    }
    if (reservationId) { reloadReservation(); return; }
    if (edit) return;
    (async () => {
      try {
        let b = me?.branchId ?? "";
        if (!b && !isUser) b = (await api(`/users/${me!.id}`).catch(() => null))?.branchId ?? "";
        // An Admin starts on their own branch and may pick another; the Super admin picks one (one branch: nothing to pick).
        if (!isUser) { const all = await allPages("/branches"); setBranches(all); if (!b && all.length === 1) b = all[0].id; setPickBranch(all.length > 1); }
        setBranchId(b);
        if (b) setBranchName((await api(`/branches/${b}`)).branchName);
      } catch { /* the name only */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (edit) return;   // a saved invoice keeps its number
    const read = (b: string) => api("/document-numbers/next", { query: { documentType: "sales_invoice", branchId: b || undefined, year: today().slice(0, 4) } });
    read(branchId).catch((e) => { if (branchId && e instanceof ApiFailure && e.status === 403) return read(""); throw e; })
      .then((r) => { setNext(r.next); setChooseBranch(false); })
      .catch((e) => { setNext(undefined); setChooseBranch(e instanceof ApiFailure && e.status === 400 && (e.error.fields as any[] ?? []).some((f) => f.field === "branchId")); });
  }, [branchId]);
  useEffect(() => {
    if (pc.trim().length < 2) return;
    const h = setTimeout(() => api("/piece-choices", { query: { search: pc.trim(), branchId: branchId || undefined, page: 1 } }).then((r) => setChoices(r.items ?? [])).catch(() => {}), 250);
    return () => clearTimeout(h);
  }, [pc, branchId]);
  const phone = latinNumber(String(custNow.customerPhone ?? "").trim());
  useEffect(() => {   // the phone seen on an earlier invoice fills an empty name
    if (made || !isPhone(phone) || String(custNow.customerName ?? "").trim() !== "") return;
    customerNameOf(phone).then((n) => { if (n && String(cust.getValues("customerName") ?? "").trim() === "") cust.setValue("customerName", n); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, made]);

  // ── the numbers ──
  const base = makingBase(lines);
  // The server prices all the pieces at once and rounds the total to a whole pound (POST /sales-invoices/price), the way a Save checks the payments:
  // adding up the price each piece was shown alone gave 118,284 where the invoice is 118,286 (owner, 2026-11-09). Reservation invoices use the reservation's totals.
  const pricedKey = lines.map((l) => l.pieceCode).join("|");
  useEffect(() => {
    if (made || !pricedKey) return;
    let stale = false;
    api("/sales-invoices/price", { method: "POST", body: { pieceCodes: pricedKey.split("|"), ...(edit ? { salesInvoiceId: edit.id } : {}) } })
      .then((r) => { if (!stale) setLines((ls) => ls.map((l) => { const p = (r.lines as Row[]).find((x) => x.pieceCode === l.pieceCode); return p && (p.linePrice !== l.linePrice || p.goldValue !== l.goldValue || p.makingCharge !== l.makingCharge) ? { ...l, linePrice: p.linePrice, goldValue: p.goldValue, makingCharge: p.makingCharge } : l; })); })
      .catch(() => {});
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pricedKey, Boolean(made), edit?.id]);
  const d = made ? { value: made.totals.discount ?? 0, invalid: false, tooBig: false, sent: undefined } : mayDiscount(me!) ? readDiscount(kind, disc, base) : { value: 0, invalid: false, tooBig: false, sent: undefined };
  const tot = totalsOf({ lines, discount: d.value, made, cash, banks });
  const scannedOf = (ln: Row) => lines.filter((p) => fills(ln, p)).length;
  const allFilled = made ? made.lines.every((ln: Row) => scannedOf(ln) === ln.quantity) && lines.length === made.totals.quantity : true;
  const rules = checkedCustomer(tr);
  const customerValid = Boolean(made) || rules.every((f) => !f.validate?.(String(custNow[f.name] ?? "").trim(), {}));
  const showPieces = Boolean(made) || (Boolean(type) && Boolean(branchId));
  const showCustomer = Boolean(made) || lines.length > 0;
  const showPayment = Boolean(made) || (lines.length > 0 && customerValid);
  const open = !reservationId || Boolean(made && !gone && (!made.salesInvoiceId || made.salesInvoiceId === edit?.id) && takenBy === undefined);   // an edit may keep the reservation its own invoice took
  // A new invoice from a reservation uses the pieces it holds: it waits until every line has all its pieces, and has no piece box (issue #36).
  const fromHolds = Boolean(made) && !edit;
  const waitsForPieces = fromHolds && !made!.piecesComplete;
  const may = open && lines.length > 0 && allFilled && tot.left === 0 && !saving && !d.invalid && !d.tooBig && !waitsForPieces;
  const nothingToPay = Boolean(made) && made!.totals.remaining === 0;

  // ── the piece box ──
  const addPiece = async (scanned?: string) => {
    const typed = (scanned ?? pc).replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660)).trim();
    if (!typed || adding) return;
    if (!PIECE_CODE.test(typed)) { setPcErr(t("gold-sales", "pieceLookUp.notOurCode")); return; }
    if (lines.length >= LINES_MAX) return;
    if (lines.some((l) => l.pieceCode.toLowerCase() === typed.toLowerCase())) { setPcErr(m("pieceAlreadyAdded")); return; }
    setAdding(true); setPcErr("");
    try {
      const piece = await api("/piece-look-up", { query: { pieceCode: typed, ...(edit ? { salesInvoiceId: edit.id } : {}) } }).catch((e) => (e instanceof ApiFailure && e.status === 404 ? undefined : Promise.reject(e)));
      if (!piece || piece.kind !== "piece") { setPcErr(m("pieceNotFound")); return; }
      // A piece sold on this very invoice (taken off and added back) is free for it.
      const ownPiece = Boolean(edit && (edit.lines as Row[]).some((l) => String(l.pieceCode).toLowerCase() === String(piece.pieceCode).toLowerCase()));
      if (piece.sold && !ownPiece) { setPcErr(m("pieceAlreadySold")); return; }
      if (made) {
        const ln = made.lines.find((w: Row) => fills(w, piece));
        if (!ln) { setPcErr(m("notOnReservation", { item: piece.itemName, karat: piece.karat })); return; }
        if (scannedOf(ln) >= ln.quantity) { setPcErr(m("lineFilled", { expected: ln.quantity, item: ln.itemName, karat: ln.karat })); return; }
      }
      setLines((ls) => [...ls, { pieceCode: piece.pieceCode, itemName: piece.itemName, karat: piece.karat, weight: piece.weight, weight24Mg: piece.weight24Mg, pricePerGram24: piece.pricePerGram24, goldValue: piece.goldValue, makingCharge: piece.makingCharge, makingChargePerGram: piece.makingChargePerGram, linePrice: piece.livePrice ?? piece.priceAfterDiscount ?? piece.priceBeforeDiscount ?? ((piece.goldValue ?? 0) + (piece.makingCharge ?? 0)) }]);
      setPc(""); edited();
    } catch (e) {
      // 409: no gold price dated today (kept from the HTML; the owner's rule is "always the latest", the backend decides)
      setPcErr(e instanceof ApiFailure && e.status === 409 ? m("pieceNoGoldPrice") : m("pieceLookupFailed"));
    } finally { setAdding(false); document.getElementById("pc")?.focus(); }
  };

  // ── save ──
  const refusal = (e: unknown) => {
    if (!(e instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
    const key = e.error.message, v: any = e.error.values ?? {};
    const own = key === "reservationAlreadyInvoiced" || key === "reservationItemsMismatch";
    if (key === "reservationAlreadyInvoiced") { setTakenBy(Number(v.invoiceNumber ?? 0)); reloadReservation(); }
    if (key === "reservationItemsMismatch") setMismatch(Array.isArray(v.items) ? v.items.map((i: any) => ({ item: String(i.itemName ?? ""), karat: String(i.karat ?? ""), expected: Number(i.expected ?? 0), scanned: Number(i.scanned ?? 0) })) : []);
    const texts = backendFieldErrors(e.error, tr), out: Record<string, string> = {}, lerr: Record<string, string> = {};
    let pay: { total: number; paid: number } | null = null, ref = false, gen = "";
    for (const f of (e.error.fields as any[]) ?? []) {
      let row: RegExpExecArray | null;
      if (f.field === "payments") pay = { total: Number((made ? v.remaining : v.total) ?? 0), paid: Number(v.paid ?? 0) };
      else if (f.field === "reservationId") ref = true;
      else if (paymentKeyOf(f.field, banks)) out[paymentKeyOf(f.field, banks)!] = texts[f.field];
      else if ((row = /^lines\.(\d+)\.(pieceCode|linePrice)$/.exec(f.field))) { const line = lines[+row[1]]; if (line) lerr[line.pieceCode] = key === "pieceNotForSale" ? errorText({ message: key }) : texts[f.field]; }
      else if (f.field === "giftRecipientName" || f.field === "giftRecipientPhone") setRecipientErr((prev) => ({ ...prev, [f.field === "giftRecipientName" ? "name" : "phone"]: texts[f.field] }));
      else if (f.field === "lines") out.pieceCode = texts[f.field];
      else if (["invoiceType", "branchId", "cashDiscount", "customerPhone", "customerName", "nationalId"].includes(f.field)) {
        if (f.field.startsWith("customer") || f.field === "nationalId") cust.setError(f.field, { type: "server", message: texts[f.field] }); else out[f.field] = texts[f.field];
      } else gen = texts[f.field] ?? errorText(e.error);
    }
    const count = Object.keys(out).length + Object.keys(lerr).length + (pay ? 1 : 0) + (ref ? 1 : 0);
    if (!count && !own && !gen) gen = errorText(e.error);   // no field named: say it once, what was typed stays
    setPayRefusal(pay); setRefused(ref); setLineErr(lerr); setErrs(out); setGeneral(gen); setSubmitted(true); revealFirstError();
  };
  const submit = async () => {
    if (saving) return;
    setGeneral(""); setPayRefusal(null); setMismatch(null); setRefused(false); setLineErr({});
    const e: Record<string, string> = {};
    if (!type) e.invoiceType = fe(tr, "required");
    if (!branchId && !isUser) e.branchId = fe(tr, "required");
    if (!made && !(await cust.read())) e.customer = "x";
    Object.assign(e, payErrorTexts(tr, paymentErrors(cash, banks)));
    if (!lines.length) e.pieceCode = fe(tr, "required");
    const rErr = gift ? checkRecipient(tr, recipient) : {};
    setRecipientErr(rErr);
    if (rErr.name || rErr.phone) e.giftRecipient = "x";
    let gen = "";
    if (made && today() < String(made.date).slice(0, 10)) gen = m("invoiceBeforeReservation", { date: String(made.date).slice(0, 10) });   // the day cannot precede the reservation
    setSubmitted(true); setErrs(e); setGeneral(gen);
    if (Object.keys(e).length || gen) { revealFirstError(); return; }
    if (d.invalid || d.tooBig) { revealFirstError(); return; }
    if (tot.left !== 0) { setShort(true); revealFirstError(); return; }
    if (waitsForPieces) { setGeneral(L("أضف قطع الحجز أولاً ثم أنشئ الفاتورة.", "Add the reservation's pieces first, then make the invoice.")); revealFirstError(); return; }
    if (!allFilled || (reservationId && !made)) { setGeneral(m("fillAll")); revealFirstError(); return; }   // never a silent click
    setSaving(true);
    const c = cust.getValues();
    const body = {
      ...(isUser || edit ? {} : { branchId }),   // an edit never changes the branch, the type or the reservation
      ...(edit ? {} : { invoiceType: type }),
      ...(cash !== "" ? { cash: typedPiastres(cash) } : {}),
      bankPayments: sentBanks(banks),
      ...(d.sent && !made ? { cashDiscount: d.sent } : {}),   // the kind and the number typed; the backend works the discount out itself (a reservation invoice has the reservation's)
      ...(fromHolds ? {} : { lines: lines.map((l) => ({ pieceCode: l.pieceCode })) }),   // from a reservation: the backend sells the held pieces
      ...(gift ? { isGift: true, giftRecipientName: recipient.name.trim(), giftRecipientPhone: latinNumber(recipient.phone.trim()) } : {}),
      ...(made ? (edit ? {} : { reservationId: made.id }) : { customerName: String(c.customerName).trim(), customerPhone: latinNumber(String(c.customerPhone).trim()), nationalId: latinNumber(String(c.nationalId ?? "").trim()) }),
    };
    try {
      const saved = await api(edit ? `/sales-invoices/${edit.id}` : "/sales-invoices", { method: edit ? "PUT" : "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(m("savedNumber", { code: code6(saved.invoiceNumber) }));
      reload();
    } catch (x) { setSaving(false); refusal(x); }
  };

  // ── draw ──
  const banner = (cls: string, body: ReactNode) => <div className={`note ${cls}`} role="alert" data-field-error>{body}</div>;
  const refusedCount = Object.keys(errs).length;
  const invoiced = made?.salesInvoiceId ? { number: made.salesInvoiceNumber ?? takenBy } : takenBy !== undefined ? { number: takenBy } : null;
  const kv = (k: string, v: string) => <div className="kv"><span>{k}</span><span dir="ltr">{v}</span></div>;
  const num = edit ? code6(edit.invoiceNumber) : next !== undefined ? code6(next) : chooseBranch ? t("common", "chooseBranchForNumber") : "";
  const partsOf = (l: Row) => ({ perGram: price ? pricePerGram({ sellPrice: price.sellPrice, silverSellPrice: price.silverSellPrice ?? null }, String(l.karat)) : null, weightMg: l.weight, workPerGram: l.makingChargePerGram ?? 0, count: 1 });
  const paidBefore = made && <div className="field"><label htmlFor="paidOnReservation">{m("paidOnReservation")}</label><Input id="paidOnReservation" disabled dir="ltr" value={piastresText(made.totals.paid)} style={{ textAlign: "end" }} readOnly /></div>;
  const status = saving ? t("common", "savingNote") : lines.length === 0 ? m("saveNeedsPiece") : made ? m("fillAll") : m("saveWaits");

  return (
    <form id="inv" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); submit(); }} onInput={edited}>
      <div id="banners">
        {submitted && refusedCount > 0 && banner("warn", <b>{t("common", "couldNotSave", { count: refusedCount })}</b>)}
        {general && banner("warn", <b>{general}</b>)}
        {reservationId && !made && !gone && <div className="note" role="status">{t("common", "loading")}</div>}
        {gone && banner("warn", <b>{m("reservationNotFound")}</b>)}
        {invoiced && !gone && banner("", <><b>{m("invoicedBy")} <span dir="ltr">{invoiced.number ? code6(invoiced.number) : "—"}</span></b><br />{m("invoicedByNote")}</>)}
        {refused && banner("warn", <b>{m("reservationRefused")}</b>)}
        {mismatch && banner("warn", <><b>{errorText({ message: "reservationItemsMismatch" })}</b><ul>{mismatch.map((i, k) => <li key={k}>{m("mismatchLine", i as any)}</li>)}</ul></>)}
      </div>
      <div className="card"><h3>{edit ? `${t("common", "edit")} · ${code6(edit.invoiceNumber)}` : m("new")}</h3>
        <div id="system">
          {price === null && <div className="note warn">{m("noGoldPriceForDay")}</div>}
          {kv(m("invoiceNumber"), num)}{kv(m("priceKarat"), price ? "21" : "")}{kv(m("priceDate"), price ? String(price.date).slice(0, 10) : "")}
          {kv(m("goldPrice21k"), price ? piastresText(price.sellPrice) : "")}{kv(m("invoiceDate"), edit ? String(edit.invoiceDate).slice(0, 10) : today())}
          {!pickBranch && kv(m("branch"), branchName)}{kv(m("seller"), edit ? (edit.employeeName ?? "") : (me?.name ?? ""))}{edit && kv(m("invoiceType"), m(`invoiceTypes.${edit.invoiceType}`))}
        </div>
      </div>
      {!edit && <div className="card" id="sec-head">
        <div className="field" data-k="invoiceType" data-err={errs.invoiceType ? "" : undefined}><label className="flabel">{m("invoiceType")} *</label>
          <Seg label={m("invoiceType")} value={type} onChange={(k) => { setType(k); edited(); }}
            items={["sale", "delivery"].map((k) => ({ id: k, label: m(`invoiceTypes.${k}`), attrs: { "data-type": k } }))} />
          {errs.invoiceType && <ErrBox>{errs.invoiceType}</ErrBox>}</div>
        {pickBranch && <div className="field" data-k="branchId" style={{ marginTop: 12, maxWidth: 320 }}><label htmlFor="branchId">{m("branch")} *</label>
          <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { setBranchId(v); setBranchName(branches.find((b) => b.id === v)?.branchName ?? ""); edited(); }} />
          {errs.branchId && <ErrBox>{errs.branchId}</ErrBox>}</div>}
      </div>}

      {showPieces && (
        <div className="card" id="sec-pieces">
          {made && <><h3 className="grp-title">{m("fromReservation", { number: code6(made.reservationNumber) })} <small>{m("fromReservationNote")}</small></h3>
            <DataTable fixedOrder bodyId="fillRows" head={[m("item"), m("karat"), { label: m("toFill"), num: true }, { label: m("agreedPrice"), num: true }]}>{made.lines.map((ln: Row, i: number) => <Tr key={i}><Td>{ln.itemName}</Td><Td dir="ltr">{ln.karat}</Td><Td num><b>{m("filledOf", { scanned: scannedOf(ln), expected: ln.quantity })}</b></Td><Td num>{piastresText(ln.linePrice)}</Td></Tr>)}</DataTable></>}
          <h3>{m("pieces")} <small id="pcCount">{m("pieceCount", { count: lines.length })}</small></h3>
          {fromHolds && <div className="note" id="held-note" role="status">{waitsForPieces ? <>{L("أضف قطع الحجز أولاً. ", "Add the reservation's pieces first. ")}<a href={`/${tr.locale}/sales/reservations?open=${made!.id}`}>{L("فتح الحجز", "Open the reservation")}</a></> : L("قطع الفاتورة هي القطع المحجوزة على الحجز.", "The invoice sells the pieces held on the reservation.")}</div>}
          {!fromHolds && <div className="field" data-k="pieceCode" data-err={errs.pieceCode ? "" : undefined} style={{ maxWidth: 560 }}><label htmlFor="pc">{m("pieceCode")} *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <Combobox id="pc" dir="ltr" mono maxLength={20} placeholder={m("pieceCodePlaceholder")} value={pc}
                options={choices.filter((p) => !p.sold && !p.inTransfer && !lines.some((l) => l.pieceCode === p.pieceCode)).map((p) => ({ text: p.pieceCode, hint: `${p.itemName} · ${p.karat} · ${milligramsText(p.weight)}` }))}
                onChange={(v) => { setPc(v); setPcErr(""); }} onPick={(o) => addPiece(o.text)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPiece(); } }} />
              <Button id="scan-piece" onClick={() => setScanning(true)}><Icon name="camera" />{t("gold-sales", "pieceLookUp.scanWithCamera")}</Button>
              <Button id="addPiece" onClick={() => addPiece()}><Icon name="plus" />{m("addPiece")}</Button></div>
            {scanning && <PieceScanner label={m("pieceCode")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setPc(c); setPcErr(""); void addPiece(c); }} />}
            <div className="help">{m("pieceCodeHint")}</div>
            <div id="pcErr">{pcErr && <ErrBox>{pcErr}{pcErr === m("pieceNoGoldPrice") && <> <NavLink href="/setup/gold-prices">{m("enterGoldPrice")}</NavLink></>}</ErrBox>}{errs.pieceCode && <ErrBox>{errs.pieceCode}</ErrBox>}</div></div>}
          <DataTable fixedOrder style={{ marginTop: 12 }} bodyId="lineRows" head={[m("lineHeading"), m("pieceCode"), m("item"), m("karat"), { label: m("weight"), num: true }, { label: m("weight24"), num: true }, { label: m("pricePerGram24"), num: true }, { label: m("goldValue"), num: true }, { label: m("makingCharge"), num: true }, { label: m("linePrice"), num: true }, ""]}>{lines.length === 0 && <Tr id="noPieces"><Td colSpan={11} className="mute" style={{ textAlign: "center", padding: "22px 12px" }}>{m("noPieces")}</Td></Tr>}{lines.map((l, i) => <FragmentRow key={l.pieceCode}>
              <Tr data-line={i}><Td className="num">{i + 1}</Td><Td dir="ltr"><b>{l.pieceCode}</b></Td><Td>{l.itemName}</Td><Td dir="ltr">{l.karat}</Td>
                <Td className="num">{milligramsText(l.weight)}</Td><Td className="num">{l.weight24Mg === null ? "—" : milligramsText(l.weight24Mg)}</Td><Td className="num">{l.pricePerGram24 === null ? "—" : piastresText(l.pricePerGram24)}</Td>
                <Td className="num">{piastresText(l.goldValue)}</Td><Td className="num">{piastresText(l.makingCharge)}</Td><Td className="num">{made ? m("priceByReservation") : <PriceButton tr={tr} id={l.pieceCode} price={l.linePrice} parts={partsOf(l)} open={how === l.pieceCode} onToggle={() => setHow(how === l.pieceCode ? "" : l.pieceCode)} />}</Td>
                <Td>{!fromHolds && <Button size="sm" danger data-rm={i} aria-label={m("removePiece", { code: l.pieceCode })} onClick={() => { setLines(lines.filter((_, j) => j !== i)); edited(); }}><Icon name="trash" size={15} />{m("remove")}</Button>}</Td></Tr>
              {how === l.pieceCode && !made && <Tr><Td colSpan={11} style={{ height: "auto", whiteSpace: "normal" }}><Breakdown tr={tr} id={l.pieceCode} parts={partsOf(l)} price={l.linePrice} /></Td></Tr>}
              {lineErr[l.pieceCode] && <Tr><Td colSpan={11}><ErrBox>{lineErr[l.pieceCode]}</ErrBox></Td></Tr>}
            </FragmentRow>)}</DataTable>
        </div>
      )}

      {showCustomer && <div className="card" id="sec-customer"><h3>{m("customer")}</h3><FormFields form={cust} fields={checkedCustomer(tr, customerFields(tr, Boolean(made)))} />
        <GiftFields tr={tr} on={gift} onToggle={(v) => { setGift(v); setRecipientErr({}); edited(); }} value={recipient} onChange={(v) => { setRecipient(v); setRecipientErr({}); }} errors={recipientErr} /></div>}

      {showPayment && (
        <div className="card" id="sec-payment">
          <h3>{m("payments")} <small>{made ? (nothingToPay ? m("nothingToPay") : m("restToPay")) : m("cashOnly")}</small></h3>
          {nothingToPay ? <div className="formgrid">{paidBefore}</div>
            : <PaymentBlock tr={tr} total={tot.total - (made?.totals.paid ?? 0)} cash={cash} onCash={(v) => { setCash(v); setErrs(withoutPayErrors); }} banks={banks} onBanks={(b) => { edited(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} before={paidBefore} />}
          <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{m("cashDiscount")}</label>
            <DiscountBox tr={tr} may={mayDiscount(me!)} kind={kind} disc={disc} lockedValue={made ? (made.totals.discount ?? 0) : undefined} onKind={setKind} onDisc={setDisc}
              help={m("cashDiscountHint", { max: piastresText(base) })} error={d.tooBig ? <ErrBox>{m("cashDiscountAbove", { max: piastresText(base) })}</ErrBox> : d.invalid ? <ErrBox>{m("cashDiscountInvalid")}</ErrBox> : errs.cashDiscount ? <ErrBox>{errs.cashDiscount}</ErrBox> : null} /></div>
          <TotalsBar tr={tr} bar={tot} />
          <div id="payMsg">
            {short && tot.left !== 0 ? <ErrBox>{tot.left > 0 ? m("paidShort", { left: piastresText(tot.left) }) : m("paidOver", { over: piastresText(-tot.left) })}</ErrBox>
              : payRefusal ? banner("warn", <b>{made ? m("reservationPaymentsMismatch", { remaining: piastresText(payRefusal.total), paid: piastresText(payRefusal.paid) }) : errorText({ message: "paymentsMismatch", values: { total: piastresText(payRefusal.total), paid: piastresText(payRefusal.paid) } })}</b>) : null}
          </div>
        </div>
      )}

      {showPayment && open && (
        <div className="formbar" id="sec-save">
          <Button variant="primary" type="submit" aria-disabled={!may} style={may ? undefined : { opacity: 0.6 }}><Icon name="check" />{saving ? t("common", "saving") : t("common", "save")}</Button>
          <Button id="cancelInv" onClick={close}>{t("common", "cancel")}</Button>
          {!may && <span className="help" role="status">{status}</span>}
        </div>
      )}
    </form>
  );
}

const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;
