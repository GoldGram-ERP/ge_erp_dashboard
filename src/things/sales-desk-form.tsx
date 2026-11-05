"use client";
// The Sales desk draft page (issue #6): ONE page for a new draft, an edit and an Admin opening it. Type -> customer -> item + count lines
// (each price read only, the system's) -> planned payment + cash discount -> totals -> WhatsApp summary -> (Admin) Complete with the real pieces.
// The page STAYS on the saved draft (it shows the number). Locked / completed / deleted drafts are read only; the SERVER decides (`locked`).
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber, piastresInput, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Icon, Ltr, toast, useConfirm } from "@/components/engine";
import { CopyButton } from "@/components/shell/copy-button";
import { Link as NavLink } from "@/i18n/navigation";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, readDiscount, sentBanks, type Bank } from "./sales-invoices-math";
import { Choice, DiscountBox, ErrBox, TextBox, allPages, latestPrice, mayDiscount, readPieceCode, sg, type DiscountKind } from "./sales-form-parts";
import { PaymentBlock, TotalsBar, accountOptions, payErrorTexts, withoutPayErrors } from "./payment-block";
import { PieceScanner } from "./piece-scanner";
import { LINES_MAX, lockNote, plannedAgainst, readCustomer, readLines, type DeskLine } from "./sales-desk-rules";
import { buildWhatsappText, type WaLabels } from "./sales-desk-whatsapp";

const INVOICES_KEY = "gold-sales/sales-invoices";
const blank = (): DeskLine => ({ itemId: "", count: "1" });
const banksOf = (d: Row | null): Bank[] => (d?.bankPayments ?? []).map((b: Row) => ({ bankAccountId: b.bankAccountId, amount: piastresInput(b.amount) }));
type Scanned = { code: string; itemName: string; karat: string };

export function DraftForm({ row, close, tr }: CustomFormProps) {
  const { t, L } = tr;
  const d = (k: string, v?: Record<string, string | number>) => t("gold-sales", `salesDesk.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const may = me ? mayDiscount(me) : false;
  const [confirm, dialog] = useConfirm();

  const [draft, setDraft] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(!row?.id);
  const [gone, setGone] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branches, setBranches] = useState<Row[]>([]);
  const [price, setPrice] = useState<Row | null | undefined>(undefined);
  const [type, setType] = useState("sale");
  const [branchId, setBranchId] = useState("");
  const [cust, setCust] = useState({ customerName: "", customerPhone: "", nationalId: "" });
  const [lines, setLines] = useState<DeskLine[]>([blank()]);
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [kind, setKind] = useState<DiscountKind>("amount");
  const [disc, setDisc] = useState("");
  const [dirty, setDirty] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [payRefusal, setPayRefusal] = useState<{ total: number; paid: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); setDirty(true); setGeneral(""); setPayRefusal(null); };

  // Complete (Admin / Super admin)
  const [scanned, setScanned] = useState<Scanned[]>([]);
  const [pc, setPc] = useState("");
  const [pcErr, setPcErr] = useState("");
  const [scanning, setScanning] = useState(false);
  const [adding, setAdding] = useState(false);
  const [codeErr, setCodeErr] = useState<Record<string, string>>({});
  const [mismatch, setMismatch] = useState<Row[]>([]);
  const [completeMsg, setCompleteMsg] = useState("");
  const [completing, setCompleting] = useState(false);
  const completeKey = useRef(newSaveKey());

  const fill = (x: Row) => {
    setDraft(x); setType(x.invoiceType ?? "sale"); setBranchId(x.branchId ?? "");
    setCust({ customerName: x.customerName ?? "", customerPhone: x.customerPhone ?? "", nationalId: x.nationalId ?? "" });
    setLines(x.lines?.length ? x.lines.map((l: Row) => ({ itemId: l.itemId, count: String(l.quantity) })) : [blank()]);
    setCash(x.cash ? piastresInput(x.cash) : ""); setBanks(banksOf(x));
    setKind("amount"); setDisc(x.totals?.discount > 0 ? piastresInput(x.totals.discount) : "");
    setDirty(false); setErrs({}); setGeneral(""); setPayRefusal(null);
  };

  useEffect(() => {
    (async () => {
      const [i, a, b] = await Promise.all([
        allPages("/items", { active: true }).catch(() => []), allPages("/bank-accounts").catch(() => []), isUser ? [] : allPages("/branches").catch(() => []),
      ]);
      // only active, complete items (the backend refuses the others)
      setItems(i.filter((x) => x.isCoded !== false && x.isActive !== false && !x.deletedAt && Number(x.weight ?? 0) > 0));
      setAccounts(a); setBranches(b);
      if (row?.id) {
        try { fill(await api(`/sales-drafts/${row.id}`)); } catch { setGone(true); }
        setLoaded(true);
      } else if (me?.branchId) setBranchId(me.branchId);
    })();
    latestPrice(today()).then(setPrice).catch(() => setPrice(undefined));
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  const note = draft ? lockNote(draft as never, tr) : null;
  const readonly = Boolean(draft && note && note.state !== "editable");
  const isNew = !draft;
  const itemOptions: [string, string][] = items.map((x) => [x.id, `${x.itemName} · ${x.karat ?? ""}`]);
  // an item already on the draft stays visible even if it was switched off since
  for (const l of draft?.lines ?? []) if (!itemOptions.some(([id]) => id === l.itemId)) itemOptions.push([l.itemId, `${l.itemName} · ${l.karat}`]);
  const bankNames = Object.fromEntries(accounts.map((a) => [a.id, a.accountName as string]));
  const total = draft?.totals?.total ?? 0;
  const against = plannedAgainst(total, cash, banks);
  const dsc = may ? readDiscount(kind, disc, Number.MAX_SAFE_INTEGER / 4) : { invalid: false, value: 0, tooBig: false, sent: undefined };

  async function save() {
    if (saving || readonly) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral(""); setPayRefusal(null);
    const c = readCustomer(tr, cust), l = readLines(lines), e: Record<string, string> = { ...c.errors };
    const fieldErr = (code: string) => tr.t("common", `fieldErrors.${code}`);
    for (const [k, code] of Object.entries(l.errors)) {
      if (k === "lines") e.lines = fieldErr(code);
      else if (k.endsWith("Item")) e[k] = fieldErr(code);
      else e[k] = fieldErr(code);
    }
    Object.assign(e, payErrorTexts(tr, paymentErrors(cash, banks)));
    if (dsc.invalid) e.cashDiscount = sg(tr, "cashDiscountInvalid");
    setErrs(e);
    if (Object.keys(e).length || !c.payload || !l.payload) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); return; }
    setSaving(true);
    const body = {
      ...(isNew && !isUser && branchId ? { branchId } : {}), invoiceType: type, ...c.payload, lines: l.payload,
      ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks), ...(dsc.sent ? { cashDiscount: dsc.sent } : {}),
    };
    try {
      const saved = await api(isNew ? "/sales-drafts" : `/sales-drafts/${draft!.id}`, { method: isNew ? "POST" : "PUT", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      fill(saved);
      toast(d("saved", { number: saved.draftNumber }));
    } catch (err) { refusal(err); } finally { setSaving(false); }
  }
  function refusal(err: unknown) {
    if (!(err instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
    if (!(err.status === 0 || err.status >= 500 || err.error.message === "saveInProgress")) saveKey.current = newSaveKey();   // a definite refusal ends the attempt
    const texts = backendFieldErrors(err.error, tr), e: Record<string, string> = {}, v = err.error.values ?? {};
    let gen = "";
    for (const f of ((err.error.fields ?? []) as { field: string; message?: string }[])) {
      let r: RegExpExecArray | null;
      const payKey = paymentKeyOf(f.field, banks);
      if (f.field === "payments") setPayRefusal({ total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) });
      else if (payKey) e[payKey] = texts[f.field];
      else if ((r = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field))) e[`line${r[1]}${r[2] === "itemId" ? "Item" : "Count"}`] = texts[f.field];
      else if (["customerName", "customerPhone", "nationalId", "cashDiscount", "branchId"].includes(f.field)) e[f.field] = texts[f.field];
      else gen = texts[f.field] ?? tr.errorText(err.error);
    }
    if (!Object.keys(e).length && !gen && err.error.message !== "invalidFields") gen = tr.errorText(err.error);
    if (err.error.message === "notAllowed" && !gen && !Object.keys(e).length) gen = tr.errorText(err.error);
    setErrs(e); setGeneral(gen);
    if (draft && ["draftLocked", "draftCompleted"].includes(err.error.message)) api(`/sales-drafts/${draft.id}`).then(fill).then(() => setGeneral(tr.errorText(err.error))).catch(() => {});
  }

  async function remove() {
    if (!draft || !(await confirm({ title: d("deleteTitle"), text: d("deleteAsk", { number: draft.draftNumber }), danger: true, ok: L("حذف", "Delete") }))) return;
    try { await api(`/sales-drafts/${draft.id}`, { method: "DELETE" }); toast(d("deleted", { number: draft.draftNumber })); close(); }
    catch (err) { setGeneral(err instanceof ApiFailure ? tr.errorText(err.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); }
  }

  // ── Complete ──
  const need = (l: Row) => scanned.filter((s) => s.itemName === l.itemName && s.karat === l.karat).length;
  const addCode = async (typed?: string) => {
    const r = readPieceCode(tr, typed ?? pc);
    if (!(typed ?? pc).trim() || adding) return;
    if (r.error !== undefined) { setPcErr(r.error); return; }
    if (scanned.some((s) => s.code.toLowerCase() === r.code.toLowerCase())) { setPcErr(d("codeDuplicate")); return; }
    setAdding(true); setPcErr("");
    try {
      const found = ((await api("/piece-choices", { query: { search: r.code, page: 1 } })).items ?? []) as Row[];
      const p = found.find((x) => String(x.pieceCode).toLowerCase() === r.code.toLowerCase());
      if (!p) { setPcErr(d("codeNotFound")); return; }
      if (p.sold || p.inTransfer) { setPcErr(d("codeUnavailable")); return; }
      const ln = (draft?.lines ?? []).find((x: Row) => x.itemName === p.itemName && x.karat === p.karat);
      if (!ln) { setPcErr(d("codeNotOnDraft", { item: p.itemName, karat: p.karat })); return; }
      if (need(ln) >= ln.quantity) { setPcErr(d("codeItemFull", { item: ln.itemName })); return; }
      setScanned((s) => [...s, { code: p.pieceCode, itemName: p.itemName, karat: p.karat }]); setPc(""); setMismatch([]); setCodeErr({}); setCompleteMsg("");
      completeKey.current = newSaveKey();
    } catch (err) { setPcErr(err instanceof ApiFailure ? tr.errorText(err.error) : d("codeNotFound")); }
    finally { setAdding(false); document.getElementById("sd-code")?.focus(); }
  };
  async function complete() {
    if (!draft || completing) return;
    const p = paymentErrors(cash, banks);
    if (Object.keys(p).length) { setErrs(payErrorTexts(tr, p)); return; }
    setCompleting(true); setCompleteMsg(""); setMismatch([]); setCodeErr({}); setPayRefusal(null);
    try {
      const done = await api(`/sales-drafts/${draft.id}/complete`, { method: "POST", saveKey: completeKey.current,
        body: { lines: scanned.map((s) => ({ pieceCode: s.code })), ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks) } });
      completeKey.current = newSaveKey();
      fill(done); setScanned([]);
      toast(d("completed", { number: done.salesInvoiceNumber }));
    } catch (err) {
      if (!(err instanceof ApiFailure)) { setCompleteMsg(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); }
      else {
        if (!(err.status === 0 || err.status >= 500 || err.error.message === "saveInProgress")) completeKey.current = newSaveKey();
        const v = err.error.values ?? {}, m = err.error.message;
        if (m === "draftItemsMismatch") {
          setMismatch(Array.isArray(v.items) ? (v.items as Row[]) : []);
          const ce: Record<string, string> = {};
          for (const f of ((err.error.fields ?? []) as { field: string }[])) { const r = /^lines\.(\d+)\.pieceCode$/.exec(f.field); if (r && scanned[+r[1]]) ce[scanned[+r[1]].code] = tr.errorText({ message: m }); }
          setCodeErr(ce); setCompleteMsg(tr.errorText(err.error));
        } else if (((err.error.fields ?? []) as { field: string }[]).some((f) => f.field === "payments")) setPayRefusal({ total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) });
        else {
          const ce: Record<string, string> = {};
          for (const f of ((err.error.fields ?? []) as { field: string }[])) { const r = /^lines\.(\d+)\.pieceCode$/.exec(f.field); if (r && scanned[+r[1]]) ce[scanned[+r[1]].code] = tr.errorText(err.error); }
          setCodeErr(ce); setCompleteMsg(tr.errorText(err.error));
          if (m === "draftCompleted" || m === "draftLocked") api(`/sales-drafts/${draft.id}`).then(fill).catch(() => {});
        }
      }
    } finally { setCompleting(false); }
  }

  if (!loaded) return <p className="help" role="status">{t("common", "loading")}</p>;
  if (gone) return <div className="note warn" role="alert">{tr.errorText({ message: "salesDraftNotFound" })}</div>;

  const wa: WaLabels = { date: d("wa.date"), branch: d("wa.branch"), customer: d("wa.customer"), phone: d("wa.phone"), nationalId: d("wa.nationalId"), pieces: d("wa.pieces"), piece: d("wa.piece"), goldPrice: d("wa.goldPrice"), discount: d("wa.discount"), total: d("wa.total"), payment: d("wa.payment"), cash: d("wa.cash"), bank: d("wa.bank") };
  const waText = draft ? buildWhatsappText({ ...draft, customerName: cust.customerName.trim() || draft.customerName, customerPhone: latinNumber(cust.customerPhone.trim()) || draft.customerPhone, nationalId: cust.nationalId.trim() ? latinNumber(cust.nationalId.trim()) : null } as never, wa, tr.locale, bankNames) : "";
  const bar = draft ? (() => { const tt = draft.totals; const paid = against.planned; return { gold: tt.goldTotal, making: tt.makingTotal, gross: tt.grossTotal, discount: tt.discount, makingLeft: tt.makingTotal - tt.discount, paid, left: tt.total - paid }; })() : null;
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  const canComplete = !isUser && draft?.status === "open";
  const mayOpenInvoice = Boolean(me?.screens.some((s: string) => s === INVOICES_KEY || s === "gold-sales/sales-invoices-list"));
  const allScanned = draft ? (draft.lines as Row[]).every((l) => need(l) === l.quantity) && scanned.length === draft.totals.quantity : false;
  const touchBox = { minHeight: 44 } as const;

  return (
    <form id="sd" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); void save(); }} style={{ maxWidth: 760 }}>
      {dialog}
      <div id="banners">{general && <div className="note warn" role="alert"><b>{general}</b></div>}</div>

      <div className="card" id="sd-head" aria-live="polite">
        {draft ? <>
          <div className="help">{d("draftNumberShort")}</div>
          <div data-draft-number={draft.draftNumber} dir="ltr" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, letterSpacing: "-0.02em" }}>{draft.draftNumber}</div>
          <div className="help" style={{ marginTop: 6 }}>{draft.branchName} · <Ltr>{draft.createdDay}</Ltr></div>
          {note && <div className={`note ${note.state === "editable" ? "" : "warn"}`} id="sd-lock" data-lock={note.state} style={{ marginTop: 10 }}><b>{note.state === "locked" ? `${d("lock.locked")}: ` : ""}</b>{note.text}</div>}
        </> : <>
          <h3 style={{ margin: 0 }}>{d("newDraft")}</h3>
          <div className="help">{d("intro")}</div>
          {isUser && <div className="help">{d("ownOnly")}</div>}
        </>}
        <div className="kv"><span>{d("goldPriceToday", { price: "" }).replace(/:\s*$/, "")}</span><span dir="ltr">{draft ? piastresText(draft.goldPrice21k) : price ? piastresText(price.sellPrice) : price === null ? d("goldNone") : ""}</span></div>
      </div>

      <fieldset disabled={readonly || saving} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="card" id="sec-customer"><h3>{sg(tr, "customer")}</h3>
          <div className="field"><span className="flabel" id="sd-type-l">{d("typeLabel")}</span>
            <div className="seg" role="group" aria-labelledby="sd-type-l">
              {(["sale", "delivery"] as const).map((k) => <button type="button" key={k} data-type={k} aria-pressed={type === k} style={touchBox} onClick={() => { touch(); setType(k); }}>{d(k === "sale" ? "typeSale" : "typeDelivery")}</button>)}
            </div></div>
          {isNew && !isUser && <div className="field" data-k="branchId" style={{ marginTop: 12 }}><label htmlFor="branchId">{d("branch")}</label>
            <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>}
          {isNew && isUser && <div className="help" style={{ marginTop: 8 }}>{d("branchHelp")}</div>}
          <div className="formgrid" style={{ marginTop: 12 }}>
            <TextBox name="customerPhone" label={`${d("customerPhone")} *`} value={cust.customerPhone} ltr maxLength={15} help={d("phoneHelp")} error={errs.customerPhone} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerPhone: v })); }} />
            <TextBox name="customerName" label={`${d("customerName")} *`} value={cust.customerName} maxLength={100} error={errs.customerName} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerName: v })); }} />
            <TextBox name="nationalId" label={d("nationalId")} value={cust.nationalId} ltr maxLength={14} help={d("nationalIdHelp")} error={errs.nationalId} onChange={(v) => { touch(); setCust((c) => ({ ...c, nationalId: v })); }} />
          </div>
        </div>

        <div className="card" id="sec-items"><h3>{d("pieces")}</h3><div className="help">{d("itemHelp")}</div>
          {dirty && !isNew && <div className="help" role="status">{d("pricesStale")}</div>}
          <div id="lineRows" style={{ marginTop: 10 }}>
            {lines.map((l, i) => {
              const saved = !dirty && (draft?.lines as Row[] | undefined)?.find((x) => x.itemId === l.itemId && String(x.quantity) === l.count);
              const set = (patch: Partial<DeskLine>) => { touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
              const n = Number(latinNumber(l.count)) || 0;
              return (
                <div className="formgrid" data-line={i} key={i} style={{ marginBottom: 12, gridTemplateColumns: "minmax(0,1fr)" }}>
                  <div className="field" data-k={`line${i}Item`}><label htmlFor={`it${i}`}>{d("lineN", { number: i + 1 })} *</label>
                    <Choice tr={tr} id={`it${i}`} options={itemOptions} value={l.itemId} onChange={(v) => set({ itemId: v })} />{err(`line${i}Item`)}</div>
                  <div style={{ display: "flex", gap: 10, alignItems: "end", flexWrap: "wrap" }}>
                    <div className="field" data-k={`line${i}Count`}><label htmlFor={`iq${i}`}>{d("count")} *</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <button type="button" className="btn quiet" style={{ minWidth: 44, minHeight: 44 }} aria-label={`${d("count")} −`} onClick={() => set({ count: String(Math.max(1, n - 1)) })}>−</button>
                        <input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" aria-invalid={!!errs[`line${i}Count`]} value={l.count} style={{ width: 70, textAlign: "center", minHeight: 44 }} onChange={(e) => set({ count: e.target.value })} />
                        <button type="button" className="btn quiet" style={{ minWidth: 44, minHeight: 44 }} aria-label={`${d("count")} +`} onClick={() => set({ count: String(Math.min(LINES_MAX, n + 1)) })}>+</button>
                      </div>{err(`line${i}Count`)}</div>
                    <div className="field"><span className="flabel" id={`ipl${i}`}>{d("linePrice")}</span>
                      <output id={`ip${i}`} data-p={i} className="price-out" aria-labelledby={`ipl${i}`} dir="ltr">{saved ? piastresText(saved.linePrice) : "—"}</output>
                      {!saved && <div className="help">{d("priceAfterSave")}</div>}</div>
                    {lines.length > 1 && <button type="button" className="btn quiet sm danger" style={{ minHeight: 44 }} data-rmline={i} aria-label={d("removeLine")} onClick={() => { touch(); setErrs({}); setLines((ls) => ls.filter((_, j) => j !== i)); }}><Icon name="trash" size={15} />{d("removeLine")}</button>}
                  </div>
                </div>
              );
            })}
          </div>
          {errs.lines && <ErrBox>{errs.lines}</ErrBox>}
          <button type="button" className="btn quiet" style={{ minHeight: 44 }} data-addline aria-disabled={lines.length >= LINES_MAX} onClick={() => { if (lines.length < LINES_MAX) { touch(); setLines((ls) => [...ls, blank()]); } }}><Icon name="plus" size={15} />{d("addLine")}</button>
        </div>

        <div className="card" id="sec-payment"><h3>{d("plannedPayment")}</h3><div className="help">{d("plannedHelp")}</div>
          <PaymentBlock tr={tr} cash={cash} onCash={(v) => { touch(); setCash(v); setErrs(withoutPayErrors); }} banks={banks} onBanks={(b) => { touch(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
          <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{d("discount")}</label>
            <DiscountBox tr={tr} may={may} kind={kind} disc={disc} onKind={(k) => { touch(); setKind(k); }} onDisc={(v) => { touch(); setDisc(v); }}
              error={dsc.invalid ? <ErrBox>{sg(tr, "cashDiscountInvalid")}</ErrBox> : errs.cashDiscount ? <ErrBox>{errs.cashDiscount}</ErrBox> : null} /></div>
        </div>
      </fieldset>

      {bar && <div className="card" id="sec-totals"><TotalsBar tr={tr} bar={bar} />
        {against.over && <ErrBox>{d("plannedOver")}</ErrBox>}
        {payRefusal && !canComplete && <div className="note warn" role="alert"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}</div>}

      {draft && <div className="card" id="sec-wa"><h3>{d("wa.title")}</h3><div className="help">{d("wa.help")}</div>
        <pre id="wa-text" dir="auto" aria-label={d("wa.title")} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "10px 0", padding: 12, borderRadius: 12, background: "var(--bg)", font: "inherit", fontSize: 14, maxHeight: 320, overflow: "auto" }}>{waText}</pre>
        <CopyButton text={waText} label={d("wa.copy")} /> <span className="help">{d("wa.copy")}</span></div>}

      {canComplete && <div className="card" id="sec-complete"><h3>{d("complete")}</h3><div className="help">{d("completeIntro")}</div><div className="help">{d("completePayHelp")}</div>
        <div className="field" data-k="pieceCode" style={{ marginTop: 10 }}><label htmlFor="sd-code">{d("scan")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input id="sd-code" dir="ltr" maxLength={20} autoComplete="off" placeholder={d("scanHelp")} value={pc} style={{ flex: "1 1 180px", minHeight: 44, fontFamily: "monospace" }}
              onChange={(e) => { setPc(e.target.value); setPcErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCode(); } }} />
            <button type="button" className="btn quiet" style={{ minHeight: 44 }} id="sd-add" onClick={() => void addCode()}>{d("codeAdd")}</button>
            <button type="button" className="btn quiet" style={{ minHeight: 44 }} id="scan-piece" onClick={() => setScanning(true)}><Icon name="camera" />{t("gold-sales", "pieceLookUp.scanWithCamera")}</button>
          </div>
          {scanning && <PieceScanner label={d("codeLabel")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setPc(c); void addCode(c); }} />}
          <div className="help">{d("scanHelp")}</div>{pcErr && <ErrBox>{pcErr}</ErrBox>}</div>
        <ul id="sd-need" style={{ listStyle: "none", padding: 0, margin: "10px 0" }}>
          {(draft!.lines as Row[]).map((l) => <li key={l.lineNumber} className="kv" data-need={l.itemName}><span>{l.itemName} · <Ltr>{l.karat}</Ltr></span><b dir="ltr">{d("scanned", { scanned: need(l), total: l.quantity })}</b></li>)}
        </ul>
        {scanned.length > 0 && <><div className="help">{d("scannedList")}</div>
          <ul id="sd-codes" style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>{scanned.map((s) => <li key={s.code} className="kv" data-code={s.code} style={codeErr[s.code] ? { color: "var(--warn)" } : undefined}>
            <span><Ltr>{s.code}</Ltr> · {s.itemName}{codeErr[s.code] && <ErrBox>{codeErr[s.code]}</ErrBox>}</span>
            <button type="button" className="btn quiet sm danger" style={{ minHeight: 44 }} aria-label={d("codeRemove", { code: s.code })} onClick={() => { setScanned((x) => x.filter((y) => y.code !== s.code)); setMismatch([]); setCodeErr({}); completeKey.current = newSaveKey(); }}><Icon name="trash" size={15} /></button></li>)}</ul></>}
        {mismatch.length > 0 && <ul id="sd-mismatch" className="note warn" role="alert">{mismatch.map((m, i) => <li key={i}>{d("mismatchRow", { item: String(m.itemName), karat: String(m.karat), expected: Number(m.expected), scanned: Number(m.scanned) })}</li>)}</ul>}
        {payRefusal && <div className="note warn" role="alert" id="sd-payrefused"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}
        {completeMsg && <div className="note warn" role="alert" id="sd-completemsg"><b>{completeMsg}</b></div>}
        <button type="button" className="btn primary" style={{ minHeight: 44, marginTop: 8 }} id="sd-complete" aria-disabled={!allScanned || completing || dirty} onClick={() => { if (allScanned && !dirty) void complete(); }}>{completing ? d("completing") : d("complete")}</button>
        {dirty && <div className="help" role="status">{d("pricesStale")}</div>}
      </div>}

      {draft?.status === "completed" && <div className="card" id="sd-done" role="status"><h3>{d("completed", { number: draft.salesInvoiceNumber })}</h3>
        {mayOpenInvoice ? <NavLink href="/sales/invoices" className="btn primary" style={{ minHeight: 44 }}>{d("openInvoice")}</NavLink> : <div className="help">{d("invoiceNoAccess")}</div>}</div>}

      <div className="formbar" id="sec-save">
        {!readonly && <button type="submit" className="btn primary" style={{ minHeight: 44 }} aria-disabled={saving} id="sd-save">{saving ? d("saving") : isNew ? d("saveDraft") : d("saveChanges")}</button>}
        {draft && draft.status === "open" && <button type="button" className="btn quiet danger" style={{ minHeight: 44 }} id="sd-delete" onClick={() => void remove()}><Icon name="trash" size={15} />{d("delete")}</button>}
        <button type="button" className="btn quiet" style={{ minHeight: 44 }} id="sd-back" onClick={close}>{d("backToList")}</button>
      </div>
    </form>
  );
}

/** "Open a draft by its number": the number (and the branch, when the person has several), then the draft opens on its own page. */
export function OpenByNumber({ close, tr, reload }: CustomFormProps) {
  const { t } = tr;
  const d = (k: string, v?: Record<string, string | number>) => t("gold-sales", `salesDesk.${k}`, v);
  const { data: me } = useMe();
  const [branches, setBranches] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState(me?.branchId ?? "");
  const [num, setNum] = useState("");
  const [msg, setMsg] = useState("");
  const [found, setFound] = useState<Row | null>(null);
  useEffect(() => { if (me && me.userType !== "user") allPages("/branches").then(setBranches).catch(() => {}); }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  async function go() {
    const n = latinNumber(num.trim());
    if (!/^\d{1,7}$/.test(n)) { setMsg(d("openNotFound")); return; }
    setMsg("");
    try {
      const r = await api("/sales-drafts", { query: { search: n, branchId: branchId || undefined, page: 1 } });
      const hit = ((r.items ?? []) as Row[]).find((x) => String(x.draftNumber) === n);
      if (hit) setFound(hit); else setMsg(d("openNotFound"));
    } catch (e) { setMsg(e instanceof ApiFailure ? tr.errorText(e.error) : d("openNotFound")); }
  }
  if (found) return <DraftForm row={found} close={close} reload={reload} tr={tr} />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); void go(); }} noValidate style={{ maxWidth: 420 }}>
      <div className="card">
        {branches.length > 1 && <div className="field"><label htmlFor="sd-branch">{d("branch")}</label><Choice tr={tr} id="sd-branch" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={setBranchId} /></div>}
        <TextBox name="draftNumber" label={d("openNumberLabel")} value={num} ltr maxLength={7} error={msg} onChange={(v) => { setNum(v); setMsg(""); }} />
        <div className="row" style={{ marginTop: 12 }}><button type="submit" className="btn primary" style={{ minHeight: 44 }} id="sd-open">{d("openGo")}</button>
          <button type="button" className="btn quiet" style={{ minHeight: 44 }} onClick={close}>{d("backToList")}</button></div>
      </div>
    </form>
  );
}
