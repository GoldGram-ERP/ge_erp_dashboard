"use client";
import "./sales-desk.css";
import { Button, Disclosure, Input, Seg, TextButton } from "@/components/ui";
// The Sales desk draft page (issue #6): ONE page for a new draft, an edit and an Admin opening it. Type -> customer -> item + count lines
// (each price read only, the system's) -> planned payment + cash discount -> totals -> WhatsApp summary -> (Admin) Complete with the real pieces.
// The page STAYS on the saved draft (it shows the number). Locked / completed / deleted drafts are read only; the SERVER decides (`locked`).
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { stockMapOf } from "@/lib/items";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Option, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { dateTimeText, latinNumber, milligramsText, piastresText, timeText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Icon, Ltr, toast, useConfirm } from "@/components/engine";
import { CopyButton } from "@/components/shell/copy-button";
import { revealFirstError } from "@/lib/submit-guard";
import { Section } from "@/components/ui";
import { Link as NavLink, useRouter } from "@/i18n/navigation";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, readDiscount, sentBanks } from "./sales-invoices-math";
import { Choice, DiscountBox, ErrBox, TextBox, allPages, latestPrice, mayDiscount, readPieceCode, sg, type DiscountKind } from "./sales-form-parts";
import { TotalsBar, accountOptions, payErrorTexts, withoutPayErrors } from "./payment-block";
import { DeskPayRows } from "@/components/fields/DeskPayRows";
import { PieceScanner } from "./piece-scanner";
import { LINES_MAX, canCompleteDraft, channelError, channelOptions, defaultChannel, deskTypes, forMath, lineTakesAccount, linesInStock, lockNote, plannedAgainst, readCustomer, readLines, reservationBody, type DeskLine } from "./sales-desk-rules";
import { canOpen } from "@/nav/tree";
import { code6 } from "@/lib/code6";
import { buildDeskMessage } from "./sales-desk-whatsapp";
import { VISA_PERCENT, bankMethodChoices, blankDeskBank, deskChoices, karatFits, manualPrice, messageInput, payRows, quoteBody, quotePayment, restoreChoices, visaChosen, type DeskBank, type Metal, type Operation, type Quote, type Wrapping } from "./sales-desk-quote";

const trimZeros = (t: string) => t.replace(/\.0+$|(\.\d*?)0+$/, "$1");
const INVOICES_KEY = "gold-sales/sales-invoices";
type Scanned = { code: string; itemName: string; karat: string };

export function DraftForm({ row, close, tr }: CustomFormProps) {
  const { t, L } = tr;
  const d = (k: string, v?: Record<string, string | number>) => t("gold-sales", `salesDesk.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const may = me ? mayDiscount(me) : false;
  const [confirm, dialog] = useConfirm();
  const router = useRouter();

  const [draft, setDraft] = useState<Row | null>(null);
  const [loaded, setLoaded] = useState(!row?.id);
  const [gone, setGone] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branches, setBranches] = useState<Row[]>([]);
  const [price, setPrice] = useState<Row | null | undefined>(undefined);
  const [type, setType] = useState("sale");
  const [operation, setOperation] = useState<Operation>("sell");
  const [metal, setMetal] = useState<Metal>("gold");
  const [wrapping, setWrapping] = useState<Wrapping>("wrapped");
  const [manual, setManual] = useState({ sell: "", buy: "" });
  const [sellers, setSellers] = useState<Row[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [ownBranch, setOwnBranch] = useState("");
  const [quote, setQuote] = useState<{ q: Quote; cash: Quote | null } | null>(null);
  const [quoteMsg, setQuoteMsg] = useState("");
  const [lineMsg, setLineMsg] = useState<Record<string, string>>({});
  const [readAt, setReadAt] = useState("");
  const [tick, setTick] = useState(0);
  const [typing, setTyping] = useState(false);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [branchId, setBranchId] = useState("");
  // The items in stock in the desk's branch (issue #188): the picker shows them green, and the others red and not pickable. This page only.
  // Not heard (loading, or the read failed): nothing is coloured or blocked here; the backend still refuses a piece that is not in stock when the invoice is completed.
  const stockAnswer = useQuery({ queryKey: ["sales-desk-item-stock", branchId], enabled: Boolean(branchId), staleTime: 15_000, queryFn: () => api("/sales-desk/item-stock", { query: { branchId } }) });
  const stock = stockMapOf(stockAnswer.data);
  const [channelId, setChannelId] = useState("");
  const [cust, setCust] = useState({ customerName: "", customerPhone: "", nationalId: "" });
  const [lines, setLines] = useState<DeskLine[]>([]);
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<DeskBank[]>([]);
  // At Complete only: the account that received an Instapay or Visa line (row index -> account). A draft line never carries one (a bank transfer alone picks its account).
  const [payTo, setPayTo] = useState<Record<number, string>>({});
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
    setDraft(x); setType(x.invoiceType ?? "sale"); setBranchId(x.branchId ?? ""); setChannelId(x.salesChannelId ?? "");
    setCust({ customerName: x.customerName ?? "", customerPhone: x.customerPhone ?? "", nationalId: x.nationalId ?? "" });
    setLines(x.lines?.length ? x.lines.map((l: Row) => ({ itemId: l.itemId, count: String(l.quantity) })) : []);
    const r = restoreChoices(x);   // the desk's choices come back exactly as saved
    setCash(r.cash); setBanks(r.banks);
    setOperation(r.operation); setMetal(r.metal); setWrapping(r.wrapping); setManual(r.manual);
    setKind(r.kind); setDisc(r.disc);
    setDirty(false); setErrs({}); setGeneral(""); setPayRefusal(null);
  };

  useEffect(() => {
    (async () => {
      const [i, a, b] = await Promise.all([
        allPages("/items", { active: true }).catch(() => []), allPages("/bank-accounts").catch(() => []), isUser ? [] : allPages("/branches").catch(() => []),
      ]);
      // only active, complete items (the backend refuses the others)
      setItems(i.filter((x) => x.isCoded !== false && x.isActive !== false && !x.deletedAt && Number(x.weight ?? 0) > 0 && x.workmanshipMode === "per_gram" && x.workmanshipValue != null));
      setAccounts(a); setBranches(b);
      if (row?.id) {
        try { fill(await api(`/sales-drafts/${row.id}`)); } catch { setGone(true); }
        setLoaded(true);
      } else { if (me?.branchId) setBranchId(me.branchId); setChannelId(defaultChannel(me?.salesChannels)); }
    })();
    if (me?.branchId) api(`/branches/${me.branchId}`).then((b: Row) => setOwnBranch(b.branchName)).catch(() => {});
    if (me && !isUser) allPages("/users").then(setSellers).catch(() => {});
    readPrice();
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The list price: read now, then every 15 s while the tab is visible ("read a new price now" forces it); a new read re-quotes.
  function readPrice() {
    latestPrice(today()).then((p) => { setPrice(p); setReadAt(timeText(Date.now(), tr.locale, true)); setTick((n) => n + 1); }).catch(() => setPrice(undefined));
  }
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) readPrice(); }, 15000);
    return () => clearInterval(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The price of everything on the screen is the backend's quote (debounced); nothing is worked out here.
  // One payment list and one discount (issue #35): Visa is what a Visa row says; the discount is an amount or a percent, the same one the draft saves.
  const buy = operation === "buy";
  const dsc = may ? readDiscount(kind, disc, Number.MAX_SAFE_INTEGER / 4) : { invalid: false, value: 0, tooBig: false, sent: undefined };
  const payment = quotePayment(operation, banks);
  // Reservation (owner, 2026-11-18): the desk saves a real reservation (POST /reservations) instead of a draft. Any item, in stock or not; paid in full;
  // no channel, no typed price, silver priced as wrapped (what the reservation's own pricing does), so the quote shown is the total the Save checks.
  const rsv = !draft && !buy && type === "reservation";
  const form = { operation, metal, payment, discount: !buy ? dsc.sent : undefined, manualSell: rsv ? "" : manual.sell, manualBuy: manual.buy, wrapping: rsv ? "wrapped" as const : wrapping, lines };
  // The bank lines with the account that received each Instapay or Visa line (asked at Complete, and on a reservation).
  const paidInto = () => banks.map((b, i) => (!b.bankAccountId && !lineTakesAccount(b.method) && String(b.amount ?? "").trim() !== "" ? { ...b, bankAccountId: payTo[i] ?? "" } : b));
  const body = quoteBody(form);
  const quoteKey = `${JSON.stringify(body)}|${tick}`;
  useEffect(() => {
    setLineMsg({});
    if (!body) { setQuote(null); setQuoteMsg(""); return; }
    let live = true;
    const h = setTimeout(async () => {
      try {
        const ask = (b: unknown) => api<Quote>("/sales-desk/quote", { method: "POST", body: b });
        const [q, cash] = await Promise.all([ask(body), operation === "sell" && payment === "visa" ? ask({ ...body, payment: "cash" }) : null]);
        if (live) { setQuote({ q, cash }); setQuoteMsg(""); }
      } catch (err) {
        if (!live) return;
        setQuote(null);
        if (!(err instanceof ApiFailure)) { setQuoteMsg(L("تعذر حساب السعر. حاول مرة أخرى.", "Could not work out the price. Try again.")); return; }
        const texts = backendFieldErrors(err.error, tr), lm: Record<string, string> = {};
        let msg = "";
        for (const [f, text] of Object.entries(texts)) { const r = /^lines\.(\d+)\.itemId$/.exec(f); if (r) lm[r[1]] = text; else msg = text; }
        setLineMsg(lm);
        setQuoteMsg(msg || (Object.keys(lm).length ? "" : tr.errorText(err.error)));
      }
    }, 150);
    return () => { live = false; clearTimeout(h); };
  }, [quoteKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const note = draft ? lockNote(draft as never, tr) : null;
  const readonly = Boolean(draft && note && note.state !== "editable");
  const isNew = !draft;
  const pickable = items.filter((x) => karatFits(metal, String(x.karat)));
  // an item already on the draft stays visible even if it was switched off since
  const onDraft: Option[] = (draft?.lines ?? []).map((l: Row) => [l.itemId, `${l.itemName} · ${l.karat}`]);
  const channels = channelOptions(me?.salesChannels, draft?.salesChannelId ? { id: draft.salesChannelId, name: draft.salesChannelName ?? "" } : null);
  const channelName = channels.find(([id]) => id === channelId)?.[1] ?? "";
  // the live quote wins over the saved totals, so adding or removing a piece re-prices the totals and the remaining amount
  const total = quote?.q.totalPiastres ?? draft?.totals?.total ?? 0;
  const against = plannedAgainst(total, cash, banks);

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
    const ce = rsv ? null : channelError(channelId, channels);
    if (ce) e.salesChannelId = fieldErr(ce);
    const money = paidInto();
    Object.assign(e, payErrorTexts(tr, paymentErrors(cash, rsv ? money : forMath(banks))));
    if (dsc.invalid && !buy) e.cashDiscount = sg(tr, "cashDiscountInvalid");
    setErrs(e);
    if (Object.keys(e).length || !c.payload || !l.payload) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length })); revealFirstError(); return; }
    // the draft keeps the desk's choices and the methods' amounts of the quote: no quote (a typed price that is not valid, a refused price) means nothing to save
    if (!quote || (!rsv && (manualPrice(manual.sell).invalid || manualPrice(manual.buy).invalid))) { setGeneral(quoteMsg || d("desk.manualInvalid")); revealFirstError(); return; }
    if (rsv) {
      // paid in full, as the reservations page: never a silent click, the note says both amounts
      const paid = cashPaid(cash) + bankPaid(banks);
      if (paid !== quote.q.totalPiastres) { setPayRefusal({ total: quote.q.totalPiastres, paid }); revealFirstError(); return; }
      setSaving(true);
      try {
        const saved = await api("/reservations", { method: "POST", saveKey: saveKey.current, body: reservationBody({
          branchId: (isUser ? me?.branchId : branchId) ?? "", date: today(), employeeId: (isUser ? me?.id : sellerId || me?.id) ?? "",
          customer: c.payload, lines: l.payload, cash, banks: money, discount: dsc.sent, visa: payment === "visa" }) });
        saveKey.current = newSaveKey();
        toast(t("gold-sales", "reservations.savedNumber", { code: code6(saved.reservationNumber) }));
        if (canOpen(me, ["gold-sales/reservations-list"])) router.push(`/sales/reservations?open=${saved.id}`); else close();
      } catch (err) { refusal(err); } finally { setSaving(false); }
      return;
    }
    setSaving(true);
    const body = {
      ...(isNew && !isUser && branchId ? { branchId } : {}), invoiceType: type, salesChannelId: channelId, ...c.payload, ...deskChoices(form, payRows(cash, banks), l.payload), ...(payment === "visa" ? { payByVisa: true } : {}),
      ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(banks), ...(dsc.sent && !buy ? { cashDiscount: dsc.sent } : {}),
    };
    try {
      const saved = await api(isNew ? "/sales-drafts" : `/sales-drafts/${draft!.id}`, { method: isNew ? "POST" : "PUT", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      fill(saved);
      // the address names the draft, so a reload reopens it instead of an empty form
      if (isNew) { const u = new URL(window.location.href); u.searchParams.set("new", "draft"); u.searchParams.set("open", String(saved.id)); window.history.replaceState(null, "", u); }
      toast(d("saved", { number: saved.draftNumber }));
      requestAnimationFrame(() => document.getElementById("sd-head")?.scrollIntoView({ block: "start", behavior: "auto" }));
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
      if (f.field === "cashDiscount" && f.message === "notAllowed" && (dsc.sent?.value ?? 0) > 0) gen = d("refused.discountNotAllowed");
      else if (f.field === "payments" && v.total === undefined) gen = d("refused.visaAlone");   // Visa with planned cash or bank rows: no amounts come with this refusal
      else if (f.field === "payments") setPayRefusal({ total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) });
      else if (["discountPercent", "paymentMethods", "payByVisa"].includes(f.field)) gen = d(`refused.${f.field}`);
      else if (f.field === "manualSellPrice" || f.field === "manualBuyPrice") gen = d("desk.manualInvalid");
      else if (payKey) e[payKey] = texts[f.field];
      else if ((r = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field))) e[`line${r[1]}${r[2] === "itemId" ? "Item" : "Count"}`] = texts[f.field];
      else if (["customerName", "customerPhone", "nationalId", "cashDiscount", "branchId", "salesChannelId"].includes(f.field)) e[f.field] = texts[f.field];
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
    const money = paidInto();
    const p = paymentErrors(cash, money);
    if (Object.keys(p).length) { setErrs(payErrorTexts(tr, p)); revealFirstError(); return; }
    setCompleting(true); setCompleteMsg(""); setMismatch([]); setCodeErr({}); setPayRefusal(null);
    try {
      const done = await api(`/sales-drafts/${draft.id}/complete`, { method: "POST", saveKey: completeKey.current,
        body: { lines: scanned.map((s) => ({ pieceCode: s.code })), ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(money) } });
      completeKey.current = newSaveKey();
      fill(done); setScanned([]); setPayTo({});
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
        } else if (((err.error.fields ?? []) as { field: string }[]).some((f) => f.field === "operation")) setCompleteMsg(d("refused.operation"));
        else if (((err.error.fields ?? []) as { field: string }[]).some((f) => f.field === "payments")) setPayRefusal({ total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) });
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

  const branchLabel = draft?.branchName ?? (isUser ? ownBranch : branches.find((b) => b.id === branchId)?.branchName) ?? "";
  const sellerName = draft?.employeeName ?? (isUser ? me?.name : (([u]) => u && ([u.firstName, u.familyName].filter(Boolean).join(" ") || u.username))(sellers.filter((x) => x.id === sellerId)) ?? me?.name) ?? "";
  const waText = quote ? buildDeskMessage(messageInput(form, quote.q, quote.cash, { date: today(), branch: branchLabel, channel: channelName, seller: sellerName, customer: cust.customerName.trim(), nationalId: latinNumber(cust.nationalId.trim()), phone: latinNumber(cust.customerPhone.trim()), rows: payRows(cash, banks) })) : "";
  const typedManual = manualPrice(rsv ? "" : operation === "sell" ? manual.sell : manual.buy);
  const mayReserve = canOpen(me, ["gold-sales/reservations"]);
  const typeLabels: Record<string, string> = { sale: d("typeSale"), delivery: d("typeDelivery"), handover: L("تسليم", "Hand over"), reservation: L("حجز", "Reservation") };
  // The account that received each Instapay or Visa line: asked where the money is really taken (Complete, and a reservation).
  const receivedInto = banks.map((b, i) => (!lineTakesAccount(b.method) && !b.bankAccountId && String(b.amount ?? "").trim() !== "")
    ? <div className="field" key={`pt${i}`} data-k={`bank${i}Account`} data-err={errs[`bank${i}Account`] ? "" : undefined}>
        <label htmlFor={`pt${i}-btn`}>{L(`الحساب اللي استلم ${d(`desk.pay.${b.method}`)} (${piastresText(typedPiastres(String(b.amount).trim()) ?? 0)})`, `Account that received ${d(`desk.pay.${b.method}`)} (${piastresText(typedPiastres(String(b.amount).trim()) ?? 0)})`)}</label>
        <Choice tr={tr} id={`pt${i}`} options={accountOptions(accounts)} value={payTo[i] ?? ""} onChange={(v: string) => { setPayTo({ ...payTo, [i]: v }); setErrs(withoutPayErrors); }} />
        {errs[`bank${i}Account`] && <ErrBox>{errs[`bank${i}Account`]}</ErrBox>}
      </div> : null);
  const pick = (patch: () => void) => { touch(); patch(); };
  const bar = draft ? (() => { const tt = draft.totals; const paid = against.planned;
    if (quote) { const q = quote.q, c = quote.cash ?? q, disc = Math.max(0, c.beforeDiscountPiastres - c.totalPiastres); return { gold: q.beforeDiscountPiastres - q.feeTotalPiastres, making: q.feeTotalPiastres, gross: q.beforeDiscountPiastres, discount: disc, makingLeft: q.feeTotalPiastres - disc, paid, left: q.totalPiastres - paid }; }
    return { gold: tt.goldTotal, making: tt.makingTotal, gross: tt.grossTotal, discount: tt.discount, makingLeft: tt.makingTotal - tt.discount, paid, left: tt.total - paid }; })() : null;
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  const canComplete = canCompleteDraft(me, draft?.status, buy);   // Admin / Super admin, or the action complete-sales-draft; hidden until the person is known; a Buy draft is a quote only
  const mayOpenInvoice = Boolean(me?.screens.some((s: string) => s === INVOICES_KEY || s === "gold-sales/sales-invoices-list"));
  const allScanned = draft ? (draft.lines as Row[]).every((l) => need(l) === l.quantity) && scanned.length === draft.totals.quantity : false;

  const rowItem = (id: string) => { const it = items.find((x) => x.id === id) ?? (draft?.lines ?? []).find((x: Row) => x.itemId === id); return { name: String(it?.itemName ?? ""), karat: String(it?.karat ?? "") }; };
  const addItem = (id: string) => { if (id && lines.length < LINES_MAX) pick(() => setLines((ls) => [...ls, { itemId: id, count: "1" }])); };
  const step = (i: number, by: number) => { const n = Math.min(999, Math.max(1, (parseInt(latinNumber(lines[i].count), 10) || 0) + by)); touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: String(n) } : x))); };
  const dropLine = (i: number) => { touch(); setErrs({}); setLeaving(i); setTimeout(() => { setLines((ls) => ls.filter((_, j) => j !== i)); setLeaving(null); }, 180); };
  const side = buy ? "buy" : "sell";
  const manualOpen = typing || manual[side] !== "";
  const shownPrice = (s: "sell" | "buy") => (price ? piastresText(metal === "silver" ? (s === "sell" ? price.silverSellPrice : price.silverBuyPrice) : s === "sell" ? price.sellPrice : price.buyPrice) : "—");
  const totalText = quote ? piastresText(quote.q.totalPiastres) : "—";
  const statusText = price ? d("desk.priceOk") : price === null ? d("goldNone") : d("desk.priceReading");
  const custErr = Boolean(errs.customerName || errs.nationalId || errs.customerPhone);
  // Progressive steps (owner, 2026-11-08): the branch first, then the pieces, then the customer and saving. A saved draft, and any error, shows everything.
  const payErr = Object.keys(errs).some((k) => k === "cash" || k === "sum" || k === "cashDiscount" || k.startsWith("bank"));
  const stepBranch = !(isNew && !isUser) || Boolean(branchId);
  const showMore = !isNew || lines.length > 0 || custErr || payErr;

  return (
    <form id="sd" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {dialog}
      <div id="banners">{general && <div className="note warn" role="alert" data-field-error><b>{general}</b></div>}</div>
      <div className="tk">
        <header className="tk-head" id="sd-head" aria-live="polite">
          <div className="tk-title">
            {draft && <><span className="tk-quiet">{d("draftNumberShort")}</span><b data-draft-number={draft.draftNumber} dir="ltr">{draft.draftNumber}</b></>}
          </div>
          <div className="tk-chips">
            {isNew && !isUser ? <>
              <div className="field" data-k="branchId"><label htmlFor="branchId">{d("branch")}</label>
                <Choice tr={tr} id="branchId" searchable={false} options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
              <div className="field" data-seller><label htmlFor="sellerId">{d("desk.seller")}</label>
                <Choice tr={tr} id="sellerId" searchable={false} options={sellers.filter((u) => u.branchId === branchId && u.userType === "user").map((u) => [u.id, [u.firstName, u.familyName].filter(Boolean).join(" ") || u.username])} value={sellerId} onChange={(v) => setSellerId(v)} /></div>
            </> : <>
              <span className="tk-chip" data-k="branchId"><i>{d("branch")}</i>{branchLabel}</span>
              <span className="tk-chip" data-seller><i>{d("desk.seller")}</i>{sellerName}</span>
            </>}
            {!rsv && <div className="field" data-k="salesChannelId"><label htmlFor="salesChannelId">{d("channel")}</label>
              <Choice tr={tr} id="salesChannelId" searchable={false} options={channels} value={channelId} disabled={!isNew || saving} invalid={!!errs.salesChannelId} onChange={(v) => { touch(); setChannelId(v); }} />{err("salesChannelId")}</div>}
            <span className="tk-chip"><i>{L("التاريخ", "Date")}</i><Ltr>{draft?.createdDay ?? today()}</Ltr></span>
          </div>
          {/* Owner, 2026-11-16: the sales channel and these three choices are picked once, on the new draft; a saved draft shows them read only. */}
          <fieldset disabled={!isNew || saving} className="tk-segs">
            <Seg label={d("desk.operation")} value={operation}
              onChange={(k) => pick(() => { setOperation(k); setBanks((bs) => bs.map((b) => (bankMethodChoices(k).includes(b.method) ? b : { ...b, method: "bank_transfer" }))); if (k === "buy") { setKind("amount"); setDisc(""); } setType("sale"); })}
              items={(["sell", "buy"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-op": k } }))} />
            <Seg label={d("desk.metal")} value={metal} onChange={(k) => pick(() => { setMetal(k); setLines([]); })}
              items={(["gold", "silver"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-metal": k } }))} />
            {!buy && <Seg label={d("typeLabel")} value={type} onChange={(k) => { touch(); if (type === "reservation" && k !== "reservation") setLines((ls) => linesInStock(ls, stock)); setType(k); setErrs({}); if (k === "reservation") setTyping(false); }}
              items={deskTypes(type, isNew, mayReserve).map((k) => ({ id: k, label: typeLabels[k], attrs: { "data-type": k } }))} />}
          </fieldset>
          {lines.length > 0 && <Button size="sm" id="sd-clear" className="tk-clear" disabled={readonly || saving} onClick={() => { touch(); setLines([]); setDisc(""); setManual({ sell: "", buy: "" }); }}>{d("desk.clear")}</Button>}
          {!draft && <p className="tk-quiet tk-intro" id="sd-intro">{rsv ? L("الحجز بيتسجّل مدفوع بالكامل، وتقدر تختار أي قطعة حتى لو مش موجودة في المخزون.", "A reservation is saved paid in full, and any piece can be picked, in stock or not.") : L("سجّل طلب العميل كمسودة برقم، وعدّلها حتى منتصف الليل.", "Save the order as a numbered draft and edit it until midnight.")}</p>}
          {note && (note.state !== "editable" || isUser) && <div className={`note ${note.state === "editable" ? "" : "warn"}`} id="sd-lock" data-lock={note.state}><b>{note.state === "locked" ? `${d("lock.locked")}: ` : ""}</b>{note.text}</div>}
        </header>

        <div className="tk-grid">
          <fieldset disabled={readonly || saving} className="tk-a">
            {!stepBranch ? <p className="tk-step-hint" id="sd-step-branch">{L("اختار الفرع الأول عشان تضيف قطع.", "Choose the branch first to add pieces.")}</p> : <Section title={L("القطع", "Pieces")}><section id="sec-items" className="tk-ticket tk-reveal">
              <div className="field tk-add"><label htmlFor="itadd">{L("إضافة قطعة", "Add a piece")}</label>
                <ItemPicker id="itadd" name="itadd" items={pickable} stock={rsv ? undefined : stock} extra={onDraft} value="" placeholder={L("ابحث عن قطعة ثم Enter", "Search a piece, then Enter")} onChange={addItem} /></div>
              {errs.lines && <ErrBox>{errs.lines}</ErrBox>}
              {metal === "silver" && !rsv && lines.length > 0 && <div className="tk-wrap"><span className="tk-quiet">{d("desk.wrapping")}</span>
                <Seg label={d("desk.wrapping")} value={wrapping} onChange={(k) => pick(() => setWrapping(k))}
                  items={(["wrapped", "unwrapped"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-wrap": k } }))} /></div>}
              {lines.length === 0 ? <p className="tk-empty" id="lineRows">{L("لا توجد قطع بعد. ابحث عن قطعة لإضافتها.", "No pieces yet. Search for one to add it.")}</p> :
                <ul id="lineRows" className="tk-rows">
                  {lines.map((l, i) => {
                    const info = rowItem(l.itemId), priced = quote?.q.lines[i];
                    return (
                      <li data-line={i} key={i} data-p={priced ? priced.pricePiastres : undefined} className={`tk-row${leaving === i ? " is-leaving" : ""}`}>
                        <div className="tk-clip">
                          <div className="tk-in" data-k={`line${i}Item`}>
                            <div className="tk-item"><b className="tk-name">{info.name}</b>
                              {info.karat && <span className="tk-chip"><Ltr>{info.karat}</Ltr></span>}
                              {priced && <span className="tk-w"><Ltr>{trimZeros(milligramsText(priced.weightMg))}</Ltr> {d("desk.gram")}</span>}</div>
                            <div className="tk-qty" role="group" aria-label={d("count")}>
                              <Button size="sm" aria-label={L("أنقص", "Less")} disabled={l.count === "1"} onClick={() => step(i, -1)}>−</Button>
                              <Input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" aria-label={d("count")} aria-invalid={!!errs[`line${i}Count`]} value={l.count} onChange={(e) => { touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: e.target.value } : x))); }} />
                              <Button size="sm" aria-label={L("زِد", "More")} onClick={() => step(i, 1)}><Icon name="plus" size={14} /></Button>
                            </div>
                            <b className="tk-lp" dir="ltr">{priced ? piastresText(priced.pricePiastres) : "—"}</b>
                            <Button size="sm" variant="plain" aria-label={d("removeLine")} data-rmline={i} onClick={() => dropLine(i)}><Icon name="trash" size={14} /></Button>
                          </div>
                          {err(`line${i}Item`)}{err(`line${i}Count`)}{lineMsg[i] && <ErrBox>{lineMsg[i]}</ErrBox>}
                        </div>
                      </li>
                    );
                  })}
                </ul>}
            </section></Section>}
            {!showMore ? (stepBranch && <p className="tk-step-hint" id="sd-step-more">{L("ضيف قطعة عشان تكمّل بيانات العميل والحفظ.", "Add a piece to continue with the customer and saving.")}</p>) : <Section id="sd-customer" collapsible title={L("بيانات العميل", "Customer")} defaultOpen hasError={custErr}>
              <div className="tk-cgrid">
                <TextBox kind="text" name="customerName" label={d("customerName")} placeholder={d("desk.phName")} value={cust.customerName} maxLength={100} error={errs.customerName} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerName: v })); }} />
                <TextBox kind="code" name="nationalId" label={d("nationalId")} placeholder={d("desk.phNid")} value={cust.nationalId} ltr maxLength={14} help={d("nationalIdHelp")} error={errs.nationalId} onChange={(v) => { touch(); setCust((c) => ({ ...c, nationalId: v })); }} />
                <TextBox kind="phone" name="customerPhone" label={d("customerPhone")} placeholder="01xxxxxxxxx" value={cust.customerPhone} ltr maxLength={15} help={d("phoneHelp")} error={errs.customerPhone} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerPhone: v })); }} />
              </div>
            </Section>}
          </fieldset>

          <div className="tk-b"><div className="tk-sticky">
            <section className="tk-card" id="sec-prices">
              <div className="tk-prices">
                {(["sell", "buy"] as const).map((s) => (
                  <div className="tk-pcell" key={s}><span className="tk-quiet">{d(metal === "silver" ? `desk.${s}Silver` : `desk.${s}Price`)}</span><b id={`sd-${s}price`} dir="ltr">{shownPrice(s)}</b></div>
                ))}
              </div>
              <div className="tk-meta">
                <span className={`tk-dot ${price ? "ok" : price === null ? "bad" : ""}`} id="sd-status" role="img" aria-label={statusText} title={statusText} />
                <span className="tk-quiet" id="sd-readat">{readAt ? d("desk.readAt", { time: readAt }) : d("desk.noRead")}</span>
                <Button size="sm" variant="plain" id="sd-refresh" aria-label={d("desk.refresh")} title={d("desk.refresh")} onClick={readPrice}><Icon name="refresh" size={14} /></Button>
                {!rsv && <TextButton id="sd-typeprice" aria-expanded={manualOpen} onClick={() => setTyping((x) => !x)}>{L("اكتب سعرًا", "Type a price")}</TextButton>}
              </div>
              {manualOpen && !rsv && <div className="tk-manual"><div className="field"><label htmlFor={`f-manual${side}`}>{d(buy ? "desk.manualBuy" : "desk.manualSell")}</label>
                <Input kind="money" id={`f-manual${side}`} inputMode="decimal" autoComplete="off" dir="ltr" value={manual[side]} onChange={(e) => setManual((m) => ({ ...m, [side]: e.target.value }))} /></div>
                <small className={`tk-quiet${quote?.q.manualPriceUsed ? " tk-good" : ""}`} id={`sd-${side}mode`}>{quote?.q.manualPriceUsed ? d("desk.manualUsed") : d("desk.listUsed")}</small></div>}
              {quoteMsg && <div className="note warn" role="alert" id="sd-quotemsg"><b>{quoteMsg}</b></div>}
              {typedManual.invalid && <div className="note warn" role="alert" id="sd-manualmsg"><b>{d("desk.manualInvalid")}</b></div>}
            </section>

            <section className="tk-card tk-total" id="sec-total">
              <span className="tk-quiet">{d("desk.total")}</span>
              <div className="tk-nrow"><strong className="tk-n" id="sd-total" dir="ltr" key={totalText}>{totalText}</strong><span className="tk-quiet">{d("desk.egp")}</span></div>
              <Disclosure id="sd-how" summary={L("كيف حُسب", "How it is worked out")}>
                <dl className="tk-how">
                  {quote && <><dt>{d("desk.before")}</dt><dd id="sd-before" dir="ltr">{piastresText(quote.q.beforeDiscountPiastres)}</dd>
                    <dt>{d(buy ? "desk.cashback" : "desk.workmanship")}</dt><dd id="sd-fees" dir="ltr">{piastresText(quote.q.feeTotalPiastres)}</dd>
                    {dsc.sent && !buy && <><dt>{d("desk.discountPercent")}</dt><dd dir="ltr">{dsc.sent.kind === "percent" ? `${dsc.sent.value}%` : piastresText(dsc.sent.value)}</dd></>}
                    {!buy && payment === "visa" && quote.cash && <><dt>{d("desk.pay.visa")} +{VISA_PERCENT}%</dt><dd dir="ltr">{piastresText(quote.q.totalPiastres)}</dd></>}
                    <dt>{d("desk.weight")}</dt><dd id="sd-weight" dir="ltr">{trimZeros(milligramsText(quote.q.weightMg))}</dd>
                    <dt>{d("desk.units")}</dt><dd id="sd-units" dir="ltr">{quote.q.units}</dd></>}
                </dl>
              </Disclosure>
            </section>

          {/* Inside the sticky group, so the group can never slide over it; no max-height, so it never scrolls inside itself. */}
          <section className="tk-card tk-wa" id="sec-wa">
            <p id="wa-text" className="tk-bubble" dir="rtl">{waText || d("desk.waEmpty")}</p>
            <CopyButton id="sd-copy" text={waText} disabled={!waText} label={d("desk.copy")}>{d("desk.copy")}</CopyButton>
          </section></div></div>

          <div className="tk-c">
            <fieldset disabled={readonly || saving} className="tk-save">
              {showMore && <Section id="sec-payment" collapsible title={L("الدفع والحفظ", "Payment and saving")} defaultOpen hasError={payErr}>
                <div className="tk-draft"><p className="tk-quiet">{rsv ? t("gold-sales", "reservations.paymentNote") : d("plannedHelp")}</p>
                  <DeskPayRows tr={tr} cash={cash} onCash={(v) => { if (canComplete) setGeneral(""); else touch(); setCash(v); setErrs(withoutPayErrors); }}
                    banks={banks} onBanks={(b) => { if (canComplete) setGeneral(""); else touch(); setBanks(b as DeskBank[]); if (visaChosen(operation, b as DeskBank[])) setCash(""); setErrs(withoutPayErrors); }}
                    accounts={accountOptions(accounts)} methods={bankMethodChoices(operation)} methodLabel={(m) => d(`desk.pay.${m}`)} blank={() => blankDeskBank(operation)}
                    total={quote?.q.totalPiastres} paid={cashPaid(cash) + bankPaid(banks)} errors={errs} />
                  {rsv && receivedInto}
                  {rsv && payRefusal && <div className="note warn" role="alert" data-field-error id="sd-rsvpay"><b>{t("gold-sales", "reservations.paidInvalid", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}
                  {!buy && payment === "visa" && <p className="tk-quiet">{L(`الفيزا تضيف ${VISA_PERCENT}% على الإجمالي.`, `Visa adds ${VISA_PERCENT}% to the total.`)}</p>}
                  {!buy && <div className="field" data-k="cashDiscount"><label htmlFor="cashDiscount">{d("discount")}</label>
                    <DiscountBox tr={tr} may={may} kind={kind} disc={disc} onKind={(k) => { touch(); setKind(k); }} onDisc={(v) => { touch(); setDisc(v); }}
                      error={dsc.invalid ? <ErrBox>{sg(tr, "cashDiscountInvalid")}</ErrBox> : errs.cashDiscount ? <ErrBox>{errs.cashDiscount}</ErrBox> : null} /></div>}
                </div>
              </Section>}
            </fieldset>

            {bar && <div className="tk-card" id="sec-totals"><TotalsBar tr={tr} bar={bar} />
              {against.over && <ErrBox>{d("plannedOver")}</ErrBox>}
              {payRefusal && !canComplete && <div className="note warn" role="alert"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}</div>}

            {canComplete && <div className="grp-block wide" id="sec-complete"><h3 className="grp-title">{L("إتمام الفاتورة", "Complete invoice")}</h3><div className="tk-card"><div className="help">{d("completeIntro")}</div><div className="help">{d("completePayHelp")}</div>
              <div className="field tk-code" data-k="pieceCode"><label htmlFor="sd-code">{d("scan")}</label>
                <div className="tk-codeRow">
                  <div className="field"><Input kind="code" id="sd-code" dir="ltr" maxLength={20} autoComplete="off" placeholder={d("scanHelp")} value={pc}
                    onChange={(e) => { setPc(e.target.value); setPcErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCode(); } }} /></div>
                  <Button id="sd-add" onClick={() => void addCode()}>{d("codeAdd")}</Button>
                  <Button id="scan-piece" onClick={() => setScanning(true)}><Icon name="camera" />{t("gold-sales", "pieceLookUp.scanWithCamera")}</Button>
                </div>
                {scanning && <PieceScanner label={d("codeLabel")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setPc(c); void addCode(c); }} />}
                <div className="help">{d("scanHelp")}</div>{pcErr && <ErrBox>{pcErr}</ErrBox>}</div>
              <ul id="sd-need" className="tk-list">
                {(draft!.lines as Row[]).map((l) => <li key={l.lineNumber} className="kv" data-need={l.itemName}><span>{l.itemName} · <Ltr>{l.karat}</Ltr></span><b dir="ltr">{d("scanned", { scanned: need(l), total: l.quantity })}</b></li>)}
              </ul>
              {scanned.length > 0 && <><div className="help">{d("scannedList")}</div>
                <ul id="sd-codes" className="tk-list">{scanned.map((s) => <li key={s.code} className="kv" data-code={s.code} data-bad={codeErr[s.code] ? "" : undefined}>
                  <span><Ltr>{s.code}</Ltr> · {s.itemName}{codeErr[s.code] && <ErrBox>{codeErr[s.code]}</ErrBox>}</span>
                  <Button size="sm" danger aria-label={d("codeRemove", { code: s.code })} onClick={() => { setScanned((x) => x.filter((y) => y.code !== s.code)); setMismatch([]); setCodeErr({}); completeKey.current = newSaveKey(); }}><Icon name="trash" size={15} /></Button></li>)}</ul></>}
              {mismatch.length > 0 && <ul id="sd-mismatch" className="note warn" role="alert">{mismatch.map((m, i) => <li key={i}>{d("mismatchRow", { item: String(m.itemName), karat: String(m.karat), expected: Number(m.expected), scanned: Number(m.scanned) })}</li>)}</ul>}
              {receivedInto}
              {payRefusal && <div className="note warn" role="alert" id="sd-payrefused"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}
              {completeMsg && <div className="note warn" role="alert" data-field-error id="sd-completemsg"><b>{completeMsg}</b></div>}
              <Button variant="primary" id="sd-complete" aria-busy={completing} onClick={() => {
                if (completing) return;
                if (dirty) { setCompleteMsg(d("pricesStale")); revealFirstError(); return; }   // never a silent click: say what is missing and go there
                if (!allScanned) { setCompleteMsg(L("اعمل مسح لكل القطع المطلوبة الأول.", "Scan every required piece first.")); revealFirstError(); return; }
                void complete();
              }}><Icon name="check" size={15} />{completing ? d("completing") : d("complete")}</Button>
              {dirty && <div className="help" role="status">{d("pricesStale")}</div>}
            </div></div>}

            {draft?.status === "completed" && <div className="tk-card" id="sd-done" role="status"><b>{d("completed", { number: draft.salesInvoiceNumber })}</b>
              {mayOpenInvoice ? <NavLink href={`/sales/invoices?open=${draft.salesInvoiceId}`} className="btn primary">{d("openInvoice")}</NavLink> : <div className="help">{d("invoiceNoAccess")}</div>}</div>}

            {buy && <p className="tk-quiet" id="sd-buynote">{d("buyQuoteNote")}</p>}
            <div className="tk-actions" id="sec-save">
              {!readonly && <Button variant="primary" type="submit" aria-disabled={saving} id="sd-save"><Icon name="check" size={15} />{saving ? d("saving") : rsv ? L("حفظ الحجز", "Save reservation") : isNew ? d("saveDraft") : d("saveChanges")}</Button>}
              {draft && draft.status === "open" && <Button danger id="sd-delete" onClick={() => void remove()}><Icon name="trash" size={15} />{d("delete")}</Button>}
              <Button id="sd-back" onClick={close}><Icon name="back" size={15} />{d("backToList")}</Button>
            </div>
          </div>
        </div>
      </div>
      <div className="tk-dock" id="sd-mobilebar"><div className="tk-dtotal"><span className="tk-quiet">{d("desk.mobileTotal")}</span><b className="tk-n" id="sd-mobiletotal" dir="ltr" key={totalText}>{quote ? `${totalText} ${d("desk.egp")}` : "—"}</b></div>
        <CopyButton id="sd-mobilecopy" text={waText} disabled={!waText} label={d("desk.copy")}>{d("desk.copy")}</CopyButton></div>
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
        <div className="row" style={{ marginTop: 12 }}><Button variant="primary" type="submit" id="sd-open">{d("openGo")}</Button>
          <Button onClick={close}>{d("backToList")}</Button></div>
      </div>
    </form>
  );
}
