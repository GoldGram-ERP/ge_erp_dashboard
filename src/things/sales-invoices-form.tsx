"use client";
// The new sales invoice, a workspace page. System values (number, gold price, date, branch, seller) are the system's and locked;
// steps unlock in order (type + branch -> pieces -> customer -> payment -> save); money is integer piastres.
// Also the invoice made from a reservation: /sales/invoices?reservation=<id> (the page then opens whole). Ported from sales-invoices-form.js.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { latinNumber, milligramsText, piastresText, today, typedPiastres } from "@/lib/format";
import { backendFieldErrors } from "@/lib/fields";
import { useMe } from "@/lib/session";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { Icon, toast } from "@/components/engine";
import { LINES_MAX, MAX_PIASTRES, bankRowErrors, formRowOfRefusal, makingBase, readDiscount, sentBanks, totalsOf } from "./sales-invoices-math";
import { BankRows, Choice, DiscountBox, ErrBox, PIECE_CODE, allPages, accountOptions, checkedCustomer, code6, customerFields, customerNameOf, fe, latestPrice, ltrStyle, mayDiscount, sg, type BankRow, type DiscountKind } from "./sales-form-parts";

type Line = Row;
const fills = (line: Row, piece: Row) => line.itemName === piece.itemName && line.karat === piece.karat;

export function SalesInvoiceForm({ close, reload, tr }: CustomFormProps) {
  const { t, L, errorText } = tr;
  const m = (k: string, v?: Record<string, string | number>) => sg(tr, k, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const reservationId = typeof location === "undefined" ? "" : new URLSearchParams(location.search).get("reservation") ?? "";

  const [type, setType] = useState("");
  const [branchId, setBranchId] = useState(me?.branchId ?? "");
  const [branchName, setBranchName] = useState("");
  const [branches, setBranches] = useState<Row[]>([]);
  const [pickBranch, setPickBranch] = useState(false);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [price, setPrice] = useState<Row | null | undefined>(undefined);
  const [next, setNext] = useState<number | undefined>();
  const [chooseBranch, setChooseBranch] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [lineErr, setLineErr] = useState<Record<string, string>>({});
  const [pc, setPc] = useState("");
  const [pcErr, setPcErr] = useState("");
  const [choices, setChoices] = useState<Row[]>([]);
  const [adding, setAdding] = useState(false);
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<BankRow[]>([{ bankAccountId: "", amount: "" }]);
  const [kind, setKind] = useState<DiscountKind>("amount");
  const [disc, setDisc] = useState("");
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
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const edited = () => { saveKey.current = newSaveKey(); setShort(false); setPayRefusal(null); };

  const cust = useFieldsForm(checkedCustomer(tr, customerFields(tr, Boolean(made))), {});
  const custNow = cust.watch() as Record<string, string>;
  const reloadReservation = async () => {
    let r: Row | null = null, g = false;
    try { r = await api(`/reservations/${reservationId}`); g = Boolean(r?.deletedAt); } catch (e) { g = e instanceof ApiFailure && e.status === 404; }
    setMade(r); setGone(g);
    if (r) {
      setBranchId(r.branchId);
      api(`/branches/${r.branchId}`).then((b) => setBranchName(b.branchName)).catch(() => {});
      cust.reset({ customerPhone: r.customerPhone ?? "", customerName: r.customerName ?? "", nationalId: r.nationalId ?? "" });
    }
  };

  // ── start ──
  useEffect(() => {
    latestPrice(today()).then(setPrice).catch(() => setPrice(undefined));   // the latest saved set up to today, always
    allPages("/bank-accounts").then(setAccounts).catch(() => {});
    if (reservationId) { reloadReservation(); return; }
    (async () => {
      try {
        let b = me?.branchId ?? "";
        if (!b && !isUser) b = (await api(`/users/${me!.id}`).catch(() => null))?.branchId ?? "";
        if (!b && !isUser) { const all = await allPages("/branches"); setBranches(all); if (all.length === 1) b = all[0].id; else setPickBranch(true); }
        setBranchId(b);
        if (b) setBranchName((await api(`/branches/${b}`)).branchName);
      } catch { /* the name only */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
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
    if (made || !/^\d{8,15}$/.test(phone) || String(custNow.customerName ?? "").trim() !== "") return;
    customerNameOf(phone).then((n) => { if (n && String(cust.getValues("customerName") ?? "").trim() === "") cust.setValue("customerName", n); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone, made]);

  // ── the numbers ──
  const base = makingBase(lines);
  const d = made ? { value: made.totals.discount ?? 0, invalid: false, tooBig: false, sent: undefined } : mayDiscount(me!) ? readDiscount(kind, disc, base) : { value: 0, invalid: false, tooBig: false, sent: undefined };
  const tot = totalsOf({ lines, discount: d.value, made, cash, banks });
  const scannedOf = (ln: Row) => lines.filter((p) => fills(ln, p)).length;
  const allFilled = made ? made.lines.every((ln: Row) => scannedOf(ln) === ln.quantity) && lines.length === made.totals.quantity : true;
  const rules = checkedCustomer(tr);
  const customerValid = Boolean(made) || rules.every((f) => !f.validate?.(String(custNow[f.name] ?? "").trim(), {}));
  const showPieces = Boolean(made) || (Boolean(type) && Boolean(branchId));
  const showCustomer = Boolean(made) || lines.length > 0;
  const showPayment = Boolean(made) || (lines.length > 0 && customerValid);
  const open = !reservationId || Boolean(made && !gone && !made.salesInvoiceId && takenBy === undefined);
  const may = open && lines.length > 0 && allFilled && tot.left === 0 && !saving && !d.invalid && !d.tooBig;
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
      const piece = await api("/piece-look-up", { query: { pieceCode: typed } }).catch((e) => (e instanceof ApiFailure && e.status === 404 ? undefined : Promise.reject(e)));
      if (!piece || piece.kind !== "piece") { setPcErr(m("pieceNotFound")); return; }
      if (piece.sold) { setPcErr(m("pieceAlreadySold")); return; }
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
      else if ((row = /^bankPayments\.(\d+)\.(bankAccountId|amount)$/.exec(f.field))) out[`bank${formRowOfRefusal(banks, +row[1])}${row[2] === "amount" ? "Amount" : "Account"}`] = texts[f.field];
      else if ((row = /^lines\.(\d+)\.(pieceCode|linePrice)$/.exec(f.field))) { const line = lines[+row[1]]; if (line) lerr[line.pieceCode] = key === "pieceNotForSale" ? errorText({ message: key }) : texts[f.field]; }
      else if (f.field === "lines") out.pieceCode = texts[f.field];
      else if (["invoiceType", "branchId", "cash", "cashDiscount", "customerPhone", "customerName", "nationalId"].includes(f.field)) {
        if (f.field.startsWith("customer") || f.field === "nationalId") cust.setError(f.field, { type: "server", message: texts[f.field] }); else out[f.field] = texts[f.field];
      } else gen = texts[f.field] ?? errorText(e.error);
    }
    const count = Object.keys(out).length + Object.keys(lerr).length + (pay ? 1 : 0) + (ref ? 1 : 0);
    if (!count && !own && !gen) gen = errorText(e.error);   // no field named: say it once, what was typed stays
    setPayRefusal(pay); setRefused(ref); setLineErr(lerr); setErrs(out); setGeneral(gen); setSubmitted(true);
  };
  const submit = async () => {
    if (saving) return;
    setGeneral(""); setPayRefusal(null); setMismatch(null); setRefused(false); setLineErr({});
    const e: Record<string, string> = {};
    if (!type) e.invoiceType = fe(tr, "required");
    if (!branchId && !isUser) e.branchId = fe(tr, "required");
    if (!made && !(await cust.read())) e.customer = "x";
    if (cash !== "") { const c = typedPiastres(cash); if (c === undefined || c <= 0 || c > MAX_PIASTRES) e.cash = m("amountInvalid"); }
    bankRowErrors(banks).forEach((r, i) => {
      if (r.account) e[`bank${i}Account`] = fe(tr, r.account);
      if (r.amount) e[`bank${i}Amount`] = r.amount === "invalid" ? m("amountInvalid") : fe(tr, r.amount);
    });
    if (!lines.length) e.pieceCode = fe(tr, "required");
    let gen = "";
    if (made && today() < String(made.date).slice(0, 10)) gen = m("invoiceBeforeReservation", { date: String(made.date).slice(0, 10) });   // the day cannot precede the reservation
    setSubmitted(true); setErrs(e); setGeneral(gen);
    if (Object.keys(e).length || gen) return;
    if (d.invalid || d.tooBig) return;
    if (tot.left !== 0) { setShort(true); return; }
    if (!allFilled || (reservationId && !made)) return;
    setSaving(true);
    const c = cust.getValues();
    const body = {
      ...(isUser ? {} : { branchId }),
      invoiceType: type,
      ...(cash !== "" ? { cash: typedPiastres(cash) } : {}),
      bankPayments: sentBanks(banks),
      ...(d.sent ? { cashDiscount: d.sent } : {}),   // the kind and the number typed; the backend works the discount out itself
      lines: lines.map((l) => ({ pieceCode: l.pieceCode })),
      ...(made ? { reservationId: made.id } : { customerName: String(c.customerName).trim(), customerPhone: latinNumber(String(c.customerPhone).trim()), ...(String(c.nationalId ?? "").trim() ? { nationalId: latinNumber(String(c.nationalId).trim()) } : {}) }),
    };
    try {
      const saved = await api("/sales-invoices", { method: "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(m("savedNumber", { code: code6(saved.invoiceNumber) }));
      reload();
    } catch (x) { setSaving(false); refusal(x); }
  };

  // ── draw ──
  const banner = (cls: string, body: ReactNode) => <div className={`note ${cls}`} role="alert">{body}</div>;
  const refusedCount = Object.keys(errs).length;
  const invoiced = made?.salesInvoiceId ? { number: made.salesInvoiceNumber ?? takenBy } : takenBy !== undefined ? { number: takenBy } : null;
  const kv = (k: string, v: string) => <div className="kv"><span>{k}</span><span dir="ltr">{v}</span></div>;
  const num = next !== undefined ? code6(next) : chooseBranch ? t("common", "chooseBranchForNumber") : "";
  const cell = (k: string, v: number, bad?: boolean) => <div key={k}><div className="help">{k}</div><b dir="ltr" style={{ fontVariantNumeric: "tabular-nums", color: bad ? "var(--warn)" : undefined }} data-summary>{piastresText(v)}</b></div>;
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
      <div className="card"><h3>{m("new")}</h3>
        <div id="system">
          {price === null && <div className="note warn">{m("noGoldPriceForDay")}</div>}
          {kv(m("invoiceNumber"), num)}{kv(m("priceKarat"), price ? "21" : "")}{kv(m("priceDate"), price ? String(price.date).slice(0, 10) : "")}
          {kv(m("goldPrice21k"), price ? piastresText(price.sellPrice) : "")}{kv(m("invoiceDate"), today())}
          {!pickBranch && kv(m("branch"), branchName)}{kv(m("seller"), me?.name ?? "")}
        </div>
      </div>
      <div className="card" id="sec-head">
        <div className="field" data-k="invoiceType" data-err={errs.invoiceType ? "" : undefined}><label className="flabel">{m("invoiceType")} *</label>
          <div className="seg" role="group" aria-label={m("invoiceType")}>
            {["sale", "delivery"].map((k) => <button type="button" key={k} data-type={k} aria-pressed={type === k} onClick={() => { setType(k); edited(); }}>{m(`invoiceTypes.${k}`)}</button>)}
          </div>
          {errs.invoiceType && <ErrBox>{errs.invoiceType}</ErrBox>}</div>
        {pickBranch && <div className="field" data-k="branchId" style={{ marginTop: 12, maxWidth: 320 }}><label htmlFor="branchId">{m("branch")} *</label>
          <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { setBranchId(v); setBranchName(branches.find((b) => b.id === v)?.branchName ?? ""); edited(); }} />
          {errs.branchId && <ErrBox>{errs.branchId}</ErrBox>}</div>}
      </div>

      {showPieces && (
        <div className="card" id="sec-pieces">
          {made && <><h3 className="grp-title">{m("fromReservation", { number: code6(made.reservationNumber) })} <small>{m("fromReservationNote")}</small></h3>
            <div className="table"><table><thead><tr><th>{m("item")}</th><th>{m("karat")}</th><th className="num">{m("toFill")}</th><th className="num">{m("agreedPrice")}</th></tr></thead>
              <tbody id="fillRows">{made.lines.map((ln: Row, i: number) => <tr key={i}><td>{ln.itemName}</td><td dir="ltr">{ln.karat}</td><td className="num"><b>{m("filledOf", { scanned: scannedOf(ln), expected: ln.quantity })}</b></td><td className="num">{piastresText(ln.linePrice)}</td></tr>)}</tbody></table></div></>}
          <h3>{m("pieces")} <small id="pcCount">{m("pieceCount", { count: lines.length })}</small></h3>
          <div className="field" data-k="pieceCode" data-err={errs.pieceCode ? "" : undefined} style={{ maxWidth: 560 }}><label htmlFor="pc">{m("pieceCode")} *</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input id="pc" dir="ltr" list="pcl" maxLength={20} autoComplete="off" placeholder={m("pieceCodePlaceholder")} style={{ fontFamily: "monospace" }} value={pc}
                onChange={(e) => { setPc(e.target.value); setPcErr(""); const hit = choices.some((c) => c.pieceCode === e.target.value && !c.sold && !c.inTransfer); if (hit && (e.nativeEvent as InputEvent).inputType === "insertReplacementText") addPiece(e.target.value); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPiece(); } }} />
              <datalist id="pcl">{choices.filter((p) => !p.sold && !p.inTransfer && !lines.some((l) => l.pieceCode === p.pieceCode)).map((p) => <option key={p.pieceCode} value={p.pieceCode}>{`${p.itemName} · ${p.karat} · ${milligramsText(p.weight)}`}</option>)}</datalist>
              <button type="button" className="btn quiet" id="addPiece" onClick={() => addPiece()}><Icon name="plus" />{m("addPiece")}</button></div>
            <div className="help">{m("pieceCodeHint")}</div>
            <div id="pcErr">{pcErr && <ErrBox>{pcErr}{pcErr === m("pieceNoGoldPrice") && <> <a href="/system-codes/gold-prices">{m("enterGoldPrice")}</a></>}</ErrBox>}{errs.pieceCode && <ErrBox>{errs.pieceCode}</ErrBox>}</div></div>
          <div className="table" style={{ marginTop: 12 }}><table>
            <thead><tr><th>{m("lineHeading")}</th><th>{m("pieceCode")}</th><th>{m("item")}</th><th>{m("karat")}</th><th className="num">{m("weight")}</th><th className="num">{m("weight24")}</th><th className="num">{m("pricePerGram24")}</th><th className="num">{m("goldValue")}</th><th className="num">{m("makingCharge")}</th><th className="num">{m("linePrice")}</th><th /></tr></thead>
            <tbody id="lineRows">{lines.map((l, i) => <FragmentRow key={l.pieceCode}>
              <tr data-line={i}><td className="num">{i + 1}</td><td dir="ltr"><b>{l.pieceCode}</b></td><td>{l.itemName}</td><td dir="ltr">{l.karat}</td>
                <td className="num">{milligramsText(l.weight)}</td><td className="num">{l.weight24Mg === null ? "—" : milligramsText(l.weight24Mg)}</td><td className="num">{l.pricePerGram24 === null ? "—" : piastresText(l.pricePerGram24)}</td>
                <td className="num">{piastresText(l.goldValue)}</td><td className="num">{piastresText(l.makingCharge)}</td><td className="num">{made ? m("priceByReservation") : piastresText(l.linePrice)}</td>
                <td><button type="button" className="btn quiet sm danger" data-rm={i} aria-label={m("removePiece", { code: l.pieceCode })} onClick={() => { setLines(lines.filter((_, j) => j !== i)); edited(); }}><Icon name="trash" size={15} />{m("remove")}</button></td></tr>
              {lineErr[l.pieceCode] && <tr><td colSpan={11}><ErrBox>{lineErr[l.pieceCode]}</ErrBox></td></tr>}
            </FragmentRow>)}</tbody></table></div>
        </div>
      )}

      {showCustomer && <div className="card" id="sec-customer"><h3>{m("customer")}</h3><FormFields form={cust} fields={checkedCustomer(tr, customerFields(tr, Boolean(made)))} /></div>}

      {showPayment && (
        <div className="card" id="sec-payment">
          <h3>{m("payments")} <small>{made ? (nothingToPay ? m("nothingToPay") : m("restToPay")) : m("cashOnly")}</small></h3>
          <div className="formgrid">
            {made && <div className="field"><label htmlFor="paidOnReservation">{m("paidOnReservation")}</label><input id="paidOnReservation" disabled dir="ltr" value={piastresText(made.totals.paid)} style={{ textAlign: "end" }} readOnly /></div>}
            {!nothingToPay && <div className="field" data-k="cash" data-err={errs.cash ? "" : undefined}><label htmlFor="f-cash">{m("cash")}</label>
              <input id="f-cash" dir="ltr" inputMode="decimal" maxLength={17} autoComplete="off" value={cash} style={ltrStyle} onChange={(e) => setCash(e.target.value)} />{errs.cash && <ErrBox>{errs.cash}</ErrBox>}</div>}
          </div>
          {!nothingToPay && <div id="banks" style={{ marginTop: 12 }}>
            <BankRows tr={tr} banks={banks} accounts={accountOptions(accounts)} onChange={setBanks} />
            {banks.map((_, i) => (errs[`bank${i}Account`] || errs[`bank${i}Amount`]) && <ErrBox key={i}>{errs[`bank${i}Account`] ?? errs[`bank${i}Amount`]}</ErrBox>)}
          </div>}
          {!nothingToPay && <button type="button" className="btn quiet sm" data-addbank onClick={() => setBanks([...banks, { bankAccountId: "", amount: "" }])}><Icon name="plus" size={15} />{m("addBankRow")}</button>}
          <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{m("cashDiscount")}</label>
            <DiscountBox tr={tr} may={mayDiscount(me!)} kind={kind} disc={disc} lockedValue={made ? (made.totals.discount ?? 0) : undefined} onKind={setKind} onDisc={setDisc}
              help={m("cashDiscountHint", { max: piastresText(base) })} error={d.tooBig ? <ErrBox>{m("cashDiscountAbove", { max: piastresText(base) })}</ErrBox> : d.invalid ? <ErrBox>{m("cashDiscountInvalid")}</ErrBox> : null} /></div>
          <div id="tot" className="card" style={{ display: "flex", gap: 36, flexWrap: "wrap", margin: "14px 0 0", background: "var(--side)" }}>
            {cell(m("total"), tot.total)}{cell(m("cashDiscount"), tot.discount)}{cell(m("paid"), tot.paid)}{cell(tot.left < 0 ? m("overPaid") : m("leftToPay"), Math.abs(tot.left), tot.left !== 0)}
          </div>
          <div id="payMsg">
            {short && tot.left !== 0 ? <ErrBox>{tot.left > 0 ? m("paidShort", { left: piastresText(tot.left) }) : m("paidOver", { over: piastresText(-tot.left) })}</ErrBox>
              : payRefusal ? banner("warn", <b>{made ? m("reservationPaymentsMismatch", { remaining: piastresText(payRefusal.total), paid: piastresText(payRefusal.paid) }) : errorText({ message: "paymentsMismatch", values: { total: piastresText(payRefusal.total), paid: piastresText(payRefusal.paid) } })}</b>) : null}
          </div>
        </div>
      )}

      {showPayment && open && (
        <div className="formbar" id="sec-save">
          <button type="submit" className="btn primary" aria-disabled={!may} style={may ? undefined : { opacity: 0.6 }}><Icon name="check" />{saving ? t("common", "saving") : t("common", "save")}</button>
          <button type="button" className="btn quiet" id="cancelInv" onClick={close}>{t("common", "cancel")}</button>
          {!may && <span className="help" role="status">{status}</span>}
        </div>
      )}
    </form>
  );
}

const FragmentRow = ({ children }: { children: ReactNode }) => <>{children}</>;
