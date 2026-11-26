"use client";
import "./desk-two.css";
import { TwoToggleGroup } from "@/components/ui/TwoToggleGroup";
import { TwoCollapsible } from "@/components/ui/TwoCollapsible";
import { Button, Disclosure, Input, Seg, TextButton } from "@/components/ui";
// The Sales desk draft page (issue #6): ONE page for a new draft, an edit and an Admin opening it. Type -> customer -> item + count lines
// (each price read only, the system's) -> planned payment + cash discount -> totals -> WhatsApp summary -> (Admin) Complete with the real pieces.
// The page STAYS on the saved draft (it shows the number). Locked / completed / deleted drafts are read only; the SERVER decides (`locked`).
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { stockMapOf, switchedOff } from "@/lib/items";
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
import { LINES_MAX, isForeignDraft, mayEditForeignDraft, mayDeleteDraft, seesEveryBranchDrafts, canCompleteDraft, channelError, channelOptions, defaultChannel, deskTypes, forMath, lineTakesAccount, linesInStock, lockNote, plannedAgainst, readCustomer, readLines, type DeskLine } from "./sales-desk-rules";
import { canOpen } from "@/nav/tree";
import { pricePerGram } from "./item-math";
import { code6 } from "@/lib/code6";
import { buildDeskMessage } from "./sales-desk-whatsapp";
import { VISA_PERCENT, bankMethodChoices, blankDeskBank, deskChoices, karatFits, manualPrice, messageInput, payRows, quoteBody, quotePayment, restoreChoices, visaChosen, type DeskBank, type Metal, type Operation, type Quote, type Wrapping } from "./sales-desk-quote";

const trimZeros = (t: string) => t.replace(/\.0+$|(\.\d*?)0+$/, "$1");
const INVOICES_KEY = "gold-sales/sales-invoices";
type Scanned = { code: string; itemName: string; karat: string };

export default function DeskTwoForm({ row, close, tr }: CustomFormProps) {
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
  // Someone else's draft (an accountant edits it; no other plain user can): its saved discount travels back as it is, so saving never drops it.
  const foreign = isForeignDraft(me, draft);
  const accountantEdits = foreign && mayEditForeignDraft(me);
  const dsc = may || accountantEdits ? readDiscount(kind, disc, Number.MAX_SAFE_INTEGER / 4) : { invalid: false, value: 0, tooBig: false, sent: undefined };
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
  // A plain user may open a draft of someone else only when they are an accountant of that branch (owner, 2026-11-24): they read it, never change it.
  const readonly = Boolean((draft && note && note.state !== "editable") || (foreign && !accountantEdits));
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
    // A reservation saves as a normal draft with invoiceType "reservation" (main, 2026-11-26), still paid in full.
    if (rsv) {
      // paid in full, as the reservations page: never a silent click, the note says both amounts
      const paid = cashPaid(cash) + bankPaid(banks);
      if (paid !== quote.q.totalPiastres) { setPayRefusal({ total: quote.q.totalPiastres, paid }); revealFirstError(); return; }
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
  // Admin / Super admin, a desk-wide role (even on another user's draft), or the action complete-sales-draft (own draft only); hidden until the person is known; a Buy draft is a quote only
  const canComplete = canCompleteDraft(me, draft?.status, buy) && (!foreign || accountantEdits);
  const mayOpenInvoice = Boolean(me?.screens.some((s: string) => s === INVOICES_KEY || s === "gold-sales/sales-invoices-list"));
  const allScanned = draft ? (draft.lines as Row[]).every((l) => need(l) === l.quantity) && scanned.length === draft.totals.quantity : false;

  const rowItem = (id: string) => { const it = items.find((x) => x.id === id) ?? (draft?.lines ?? []).find((x: Row) => x.itemId === id); return { name: String(it?.itemName ?? ""), karat: String(it?.karat ?? "") }; };
  const addItem = (id: string) => { if (id && lines.length < LINES_MAX) pick(() => setLines((ls) => [...ls, { itemId: id, count: "1" }])); };
  const step = (i: number, by: number) => { const n = Math.min(999, Math.max(1, (parseInt(latinNumber(lines[i].count), 10) || 0) + by)); touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: String(n) } : x))); };
  const dropLine = (i: number) => { touch(); setErrs({}); setLeaving(i); setTimeout(() => { setLines((ls) => ls.filter((_, j) => j !== i)); setLeaving(null); }, 180); };
  const side = buy ? "buy" : "sell";
  const manualOpen = typing || manual[side] !== "";
  const shownPrice = (s: "sell" | "buy") => (price ? piastresText(metal === "silver" ? (s === "sell" ? price.silverSellPrice : price.silverBuyPrice) : s === "sell" ? price.sellPrice : price.buyPrice) : "—");
  // Karat 24 beside karat 21 (owner, 2026-11-18): the 21 price x 24 / 21, half up, the same rule every price uses (pricePerGram).
  const shown24 = (s: "sell" | "buy") => { const p21 = price ? (s === "sell" ? price.sellPrice : price.buyPrice) : null; const p = p21 == null ? null : pricePerGram({ sellPrice: p21, silverSellPrice: null }, "24"); return p === null ? "—" : piastresText(Number(p)); };
  const totalText = quote ? piastresText(quote.q.totalPiastres) : "—";
  const statusText = price ? d("desk.priceOk") : price === null ? d("goldNone") : d("desk.priceReading");
  const custErr = Boolean(errs.customerName || errs.nationalId || errs.customerPhone);
  // Progressive steps (owner, 2026-11-08): the branch first, then the pieces, then the customer and saving. A saved draft, and any error, shows everything.
  const payErr = Object.keys(errs).some((k) => k === "cash" || k === "sum" || k === "cashDiscount" || k.startsWith("bank"));
  const stepBranch = !(isNew && !isUser) || Boolean(branchId);
  const showMore = !isNew || lines.length > 0 || custErr || payErr;

  // ── Desk two render ("Tally"): the work column on one side, the running tally (total, how it is made, WhatsApp, Save) on the other; on a phone the tally docks at the bottom.
  const egp = d("desk.egp");
  const stockLeft = (id: string) => (stock ? stock.get(id) ?? 0 : undefined);
  const blocked = (id: string) => !buy && !rsv && stock !== undefined && (stockLeft(id) ?? 0) <= 0;
  const q = quote?.q, qc = quote?.cash ?? null;
  const pending = Boolean(body) && !quote && !quoteMsg;
  const saveText = saving ? d("saving") : rsv ? L("احفظ الحجز", "Save reservation") : isNew ? d("saveDraft") : d("saveChanges");
  const kindLabel = buy ? d("desk.cashback") : d("desk.workmanship");
  const custSummary = [cust.customerName.trim(), cust.customerPhone.trim()].filter(Boolean).join(" · ") || L("مطلوب وقت الحفظ", "Needed when you save");
  const paySummary = quote ? (against.left === 0 ? L("مدفوع بالكامل", "Paid in full") : `${L("المتبقي", "Left")} ${piastresText(Math.abs(against.left))} ${egp}`) : L("كاش أو بنك", "Cash or bank");
  const setupText = [buy ? d("desk.buy") : d("desk.sell"), metal === "silver" ? d("desk.silver") : d("desk.gold"), !buy ? typeLabels[type] : "", branchLabel, sellerName, !rsv ? channelName : ""].filter(Boolean).join(" · ");
  const clearAll = () => pick(() => { setLines([]); setCust({ customerName: "", customerPhone: "", nationalId: "" }); setCash(""); setBanks([]); setDisc(""); setManual({ sell: "", buy: "" }); setTyping(false); setErrs({}); });
  const shown = pickable.filter((it) => !blocked(it.id)).concat(pickable.filter((it) => blocked(it.id))).slice(0, 12);
  const saveBtn = (id?: string) => !readonly && <Button variant="primary" id={id} onClick={save} disabled={saving} aria-busy={saving || undefined} className="d2-save">{saveText}</Button>;
  const count = (l: DeskLine) => parseInt(latinNumber(l.count), 10) || 0;

  return (
    <div className="d2" id="sd-head" data-state={note?.state ?? "new"}>
      {dialog}
      <header className="d2-head">
        <div className="d2-title">
          {note && <span className={`d2-pill is-${note.state}`}>{note.state === "editable" ? d("status.open") : note.state === "completed" ? d("status.completed") : note.state === "deleted" ? d("status.deleted") : L("مقفولة", "Locked")}</span>}
          {dirty && !readonly && <span className="d2-pill is-dirty">{L("فيه تعديلات مش محفوظة", "Unsaved changes")}</span>}
        </div>
        <Button size="sm" onClick={close}>{d("backToList")}</Button>
      </header>

      {note && note.state !== "editable" && <div className="note" role="status">{note.text}</div>}
      {foreign && !accountantEdits && <div className="note" role="status">{d("readOnly")}</div>}
      {buy && <div className="note">{d("buyQuoteNote")}</div>}
      {draft?.status === "completed" && (
        <div className="d2-done" role="status">
          <b>{d("invoiceNumber", { number: draft.salesInvoiceNumber })}</b>
          {mayOpenInvoice && draft.salesInvoiceId ? <NavLink href={`/sales/invoices?open=${draft.salesInvoiceId}`} className="btn primary sm">{d("openInvoice")}</NavLink> : <span className="help">{d("invoiceNoAccess")}</span>}
        </div>
      )}

      <div className="d2-grid">
        <div className="d2-work">
          <section className="d2-price" aria-label={d("desk.prices")}>
            <div className="d2-price-head">
              <span className={`d2-live ${price ? "is-ok" : price === null ? "is-none" : "is-wait"}`} role="status"><i aria-hidden="true" />{statusText}</span>
              <span className="d2-read">{readAt ? d("desk.readAt", { time: readAt }) : d("desk.noRead")}</span>
              <Button size="sm" onClick={readPrice} aria-label={d("desk.refresh")} title={d("desk.refresh")}><Icon name="refresh" size={16} /></Button>
            </div>
            <dl className="d2-rates">
              {metal === "silver" ? <>
                <div data-on={!buy || undefined}><dt>{d("desk.sellSilver")}</dt><dd><Ltr>{shownPrice("sell")}</Ltr></dd></div>
                <div data-on={buy || undefined}><dt>{d("desk.buySilver")}</dt><dd><Ltr>{shownPrice("buy")}</Ltr></dd></div>
              </> : <>
                <div data-on={!buy || undefined}><dt>{d("desk.sellPrice")}</dt><dd><Ltr>{shownPrice("sell")}</Ltr></dd></div>
                <div data-on={buy || undefined}><dt>{d("desk.buyPrice")}</dt><dd><Ltr>{shownPrice("buy")}</Ltr></dd></div>
                <div><dt>{L("بيع، عيار 24", "Sell, karat 24")}</dt><dd><Ltr>{shown24("sell")}</Ltr></dd></div>
                <div><dt>{L("شراء، عيار 24", "Buy, karat 24")}</dt><dd><Ltr>{shown24("buy")}</Ltr></dd></div>
              </>}
            </dl>
            {!rsv && !readonly && (manualOpen ? (
              <div className="d2-manual">
                <TextBox name={`manual-${side}`} label={buy ? d("desk.manualBuy") : d("desk.manualSell")} value={manual[side]} ltr kind="money"
                  onChange={(v) => pick(() => setManual({ ...manual, [side]: v }))} error={typedManual.invalid ? d("desk.manualInvalid") : undefined}
                  help={q ? (q.manualPriceUsed ? d("desk.manualUsed") : d("desk.listUsed")) : undefined} />
                <TextButton onClick={() => { pick(() => setManual({ ...manual, [side]: "" })); setTyping(false); }}>{L("رجّع سعر الشاشة", "Use the list price")}</TextButton>
              </div>
            ) : <TextButton className="d2-link" onClick={() => setTyping(true)}>{L("اكتب سعر بإيدك", "Type a price")}</TextButton>)}
            {quoteMsg && <ErrBox>{quoteMsg}</ErrBox>}
          </section>

          {isNew && !readonly ? (
            <section className="d2-setup" aria-label={d("desk.operationData")}>
              <div className="d2-row">
                <TwoToggleGroup label={d("desk.operation")} value={operation} items={[{ id: "sell" as Operation, label: d("desk.sell") }, { id: "buy" as Operation, label: d("desk.buy") }]}
                  onChange={(v) => pick(() => { setOperation(v); setBanks([]); if (v === "buy" && type === "reservation") setType("sale"); })} />
                <TwoToggleGroup label={d("desk.metal")} value={metal} items={[{ id: "gold" as Metal, label: d("desk.gold") }, { id: "silver" as Metal, label: d("desk.silver") }]}
                  onChange={(v) => pick(() => { setMetal(v); setLines([]); })} />
                {!buy && <TwoToggleGroup label={d("type")} value={type} items={deskTypes(type, isNew).map((k) => ({ id: k, label: typeLabels[k] }))} onChange={(v) => pick(() => setType(v))} />}
                {metal === "silver" && !rsv && <TwoToggleGroup label={d("desk.wrapping")} value={wrapping} items={[{ id: "wrapped" as Wrapping, label: d("desk.wrapped") }, { id: "unwrapped" as Wrapping, label: d("desk.unwrapped") }]} onChange={(v) => pick(() => setWrapping(v))} />}
              </div>
              <div className="d2-fields">
                {!isUser ? <>
                  <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}>
                    <label htmlFor="branchId-btn">{d("branch")}</label>
                    <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => pick(() => setBranchId(v))} invalid={Boolean(errs.branchId)} />
                    {err("branchId")}
                  </div>
                  <div className="field" data-k="sellerId">
                    <label htmlFor="sellerId-btn">{d("desk.seller")}</label>
                    <Choice tr={tr} id="sellerId" options={sellers.map((u) => [u.id, [u.firstName, u.familyName].filter(Boolean).join(" ") || u.username])} value={sellerId} onChange={(v) => pick(() => setSellerId(v))} placeholder={me?.name} />
                  </div>
                </> : <div className="d2-fact"><span>{d("branch")}</span><b>{branchLabel}</b><span>{d("desk.seller")}</span><b>{sellerName}</b></div>}
                {!rsv && (
                  <div className="field" data-k="salesChannelId" data-err={errs.salesChannelId ? "" : undefined}>
                    <label htmlFor="salesChannelId-btn">{d("channel")}</label>
                    <Choice tr={tr} id="salesChannelId" options={channels} value={channelId} onChange={(v) => pick(() => setChannelId(v))} invalid={Boolean(errs.salesChannelId)} />
                    {err("salesChannelId")}
                  </div>
                )}
                <div className="d2-fact"><span>{d("day")}</span><b><Ltr>{today()}</Ltr></b></div>
              </div>
            </section>
          ) : <p className="d2-setline">{setupText} · <Ltr>{String(draft?.createdDay ?? today())}</Ltr></p>}

          <section className="d2-pieces" aria-labelledby="d2-pieces-h">
            <div className="d2-sec-head">
              <h2 id="d2-pieces-h">{d("pieces")}</h2>
              {!readonly && lines.length > 0 && <TextButton onClick={clearAll}>{d("desk.clear")}</TextButton>}
            </div>
            {!stepBranch ? <p className="d2-empty">{L("اختار الفرع الأول، وبعدها القطع هتظهر هنا.", "Pick the branch first; the pieces show up here after.")}</p> : <>
              {!readonly && (
                <div className="d2-tiles">
                  {shown.map((it) => { const n = stockLeft(it.id), off = blocked(it.id) || lines.length >= LINES_MAX;
                    return (
                      <Button key={it.id} className="d2-tile" disabled={off} onClick={() => addItem(it.id)} aria-label={`${L("أضف", "Add")} ${it.itemName} · ${it.karat}`}>
                        <span className="d2-tile-w"><Ltr>{trimZeros(String(it.weight))}</Ltr><small>{d("desk.gram")}</small></span>
                        <span className="d2-tile-k">{L(`عيار ${it.karat}`, `Karat ${it.karat}`)}</span>
                        <span className="d2-tile-n">{it.itemName}</span>
                        {n !== undefined && <span className={`d2-tile-s${n === 0 ? " is-out" : n <= 3 ? " is-low" : ""}`}>{n === 0 ? L("مفيش في الفرع", "None in branch") : n <= 3 ? L(`فاضل ${n}`, `${n} left`) : L(`${n} في الفرع`, `${n} in branch`)}</span>}
                      </Button>
                    ); })}
                </div>
              )}
              {!readonly && lines.length < LINES_MAX && (
                <div className="field d2-picker" data-k="addItem">
                  <label htmlFor="addItem-btn">{L("أو دوّر على صنف", "Or find an item")}</label>
                  <ItemPicker id="addItem" name="addItem" value="" onChange={addItem} items={pickable} stock={stock} mode={buy || rsv ? "buy" : "sell"} extra={onDraft} placeholder={d("addLine")} />
                </div>
              )}
              {lines.length === 0 ? <p className="d2-empty">{L("دوس على قطعة عشان تضيفها، والإجمالي بيتحسب لوحده.", "Tap a piece to add it; the total works itself out.")}</p> : (
                <ol className="d2-lines" id="lineRows">
                  {lines.map((l, i) => { const it = rowItem(l.itemId), ql = q?.lines[i], m = lineMsg[String(i)] ?? errs[`line${i}Item`] ?? errs[`line${i}Count`];
                    return (
                      <li key={`${l.itemId}-${i}`} data-line={i} className={`d2-line${leaving === i ? " is-leaving" : ""}${m ? " is-bad" : ""}`}>
                        <div className="d2-line-name"><b>{it.name}</b><span>{L(`عيار ${it.karat}`, `Karat ${it.karat}`)}{ql ? <> · <Ltr>{milligramsText(ql.weightMg)}</Ltr> {d("desk.gram")} · {kindLabel} <Ltr>{piastresText(ql.feePerGram)}</Ltr>/{d("desk.gram")}</> : null}</span></div>
                        <div className="d2-step" role="group" aria-label={d("count")}>
                          <Button variant="plain" size="sm" onClick={() => step(i, -1)} disabled={readonly || count(l) <= 1} aria-label={L("أقل", "Less")}>−</Button>
                          <Input id={`line${i}Count`} inputMode="numeric" dir="ltr" maxLength={3} value={l.count} disabled={readonly} aria-label={d("count")}
                            onChange={(e) => { const v = e.target.value; touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: v } : x))); }} />
                          <Button variant="plain" size="sm" onClick={() => step(i, 1)} disabled={readonly || count(l) >= 999} aria-label={L("أكتر", "More")}><Icon name="plus" size={14} /></Button>
                        </div>
                        <div className="d2-line-price"><Ltr>{ql ? piastresText(ql.pricePiastres) : pending ? "…" : "—"}</Ltr></div>
                        {!readonly && <Button size="sm" onClick={() => dropLine(i)} aria-label={d("removeLine")} title={d("removeLine")}><Icon name="x" size={16} /></Button>}
                        {m && <div className="d2-line-err"><ErrBox>{m}</ErrBox></div>}
                      </li>
                    ); })}
                </ol>
              )}
              {err("lines")}
            </>}
          </section>

          {showMore && <>
            <TwoCollapsible key={`c${custErr}`} id="d2-customer" title={L("العميل", "Customer")} summary={custSummary} defaultOpen={custErr || (!isNew && Boolean(cust.customerPhone))} invalid={custErr}>
              <div className="d2-fields">
                <TextBox name="customerPhone" label={d("customerPhone")} value={cust.customerPhone} ltr disabled={readonly} help={d("phoneHelp")} error={errs.customerPhone} onChange={(v) => pick(() => setCust({ ...cust, customerPhone: v }))} />
                <TextBox name="customerName" label={d("customerName")} value={cust.customerName} disabled={readonly} placeholder={d("desk.phName")} error={errs.customerName} onChange={(v) => pick(() => setCust({ ...cust, customerName: v }))} />
                <TextBox name="nationalId" label={d("nationalId")} value={cust.nationalId} ltr disabled={readonly} maxLength={14} placeholder={d("desk.phNid")} help={d("nationalIdHelp")} error={errs.nationalId} onChange={(v) => pick(() => setCust({ ...cust, nationalId: v }))} />
              </div>
            </TwoCollapsible>

            <TwoCollapsible key={`p${payErr}${Boolean(payRefusal)}`} id="d2-payment" title={rsv ? L("الدفع", "Payment") : d("plannedPayment")} summary={paySummary} defaultOpen={payErr || Boolean(payRefusal) || rsv} invalid={payErr || Boolean(payRefusal)}>
              {!rsv && <p className="help">{d("plannedHelp")}</p>}
              <DeskPayRows tr={tr} cash={cash} onCash={(v) => pick(() => setCash(v))} banks={banks} onBanks={(b) => pick(() => setBanks(b as DeskBank[]))} accounts={accountOptions(accounts)}
                methods={bankMethodChoices(operation)} methodLabel={(m) => d(`desk.pay.${m}`)} blank={() => blankDeskBank(operation)} total={q?.totalPiastres} paid={against.planned} errors={errs} disabled={readonly} />
              {rsv && receivedInto}
              {against.over && !rsv && <ErrBox>{d("plannedOver")}</ErrBox>}
              {payRefusal && <ErrBox>{L(`المدفوع ${piastresText(payRefusal.paid)} والإجمالي ${piastresText(payRefusal.total)}: لازم يبقوا زي بعض.`, `Paid ${piastresText(payRefusal.paid)} against a total of ${piastresText(payRefusal.total)}: they must match.`)}</ErrBox>}
              {!buy && (
                <div className="field" data-k="cashDiscount" data-err={errs.cashDiscount ? "" : undefined}>
                  <label htmlFor="cashDiscount">{d("discount")}</label>
                  <DiscountBox tr={tr} may={(may || accountantEdits) && !readonly} kind={kind} disc={disc} onKind={(k) => pick(() => setKind(k))} onDisc={(v) => pick(() => setDisc(v))} error={err("cashDiscount")} />
                </div>
              )}
            </TwoCollapsible>
          </>}

          {canComplete && draft && !readonly && (
            <section className="d2-complete" aria-labelledby="d2-complete-h">
              <div className="d2-sec-head"><h2 id="d2-complete-h">{d("complete")}</h2><span className="d2-count"><Ltr>{scanned.length}/{draft.totals.quantity}</Ltr></span></div>
              <p className="help">{d("completeIntro")}</p>
              {dirty && <div className="note" role="status">{d("pricesStale")}</div>}
              <ul className="d2-need">
                {(draft.lines as Row[]).map((l, i) => <li key={i} data-full={need(l) === l.quantity || undefined}><span>{l.itemName} · {l.karat}</span><b><Ltr>{need(l)}/{l.quantity}</Ltr></b></li>)}
              </ul>
              <div className="field" data-k="sd-code">
                <label htmlFor="sd-code">{d("scan")}</label>
                <div className="d2-scan">
                  <Input id="sd-code" dir="ltr" value={pc} autoComplete="off" onChange={(e) => { setPc(e.target.value); setPcErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCode(); } }} placeholder={d("codeLabel")} aria-invalid={Boolean(pcErr) || undefined} />
                  <Button onClick={() => addCode()} disabled={adding || !pc.trim()} aria-busy={adding || undefined}>{d("codeAdd")}</Button>
                  <Button onClick={() => setScanning(true)} aria-label={L("امسح بالكاميرا", "Scan with the camera")}><Icon name="camera" size={18} /></Button>
                </div>
                <div className="help">{d("scanHelp")}</div>
                {pcErr && <ErrBox>{pcErr}</ErrBox>}
              </div>
              {scanned.length > 0 && (
                <ul className="d2-codes">
                  {scanned.map((s) => <li key={s.code} data-bad={codeErr[s.code] ? "" : undefined}><Ltr>{s.code}</Ltr><span>{s.itemName} · {s.karat}</span>
                    <Button size="sm" aria-label={d("codeRemove", { code: s.code })} onClick={() => { setScanned((x) => x.filter((y) => y.code !== s.code)); setMismatch([]); setCodeErr({}); completeKey.current = newSaveKey(); }}><Icon name="x" size={14} /></Button>
                    {codeErr[s.code] && <ErrBox>{codeErr[s.code]}</ErrBox>}</li>)}
                </ul>
              )}
              {mismatch.length > 0 && <div className="d2-mis" role="alert">{mismatch.map((r, i) => <p key={i}>{d("mismatchRow", { item: r.itemName, karat: r.karat, expected: r.expected, scanned: r.scanned })}</p>)}</div>}
              {receivedInto}
              {bar && <TotalsBar tr={tr} bar={bar} />}
              {completeMsg && <ErrBox>{completeMsg}</ErrBox>}
              <Button variant="primary" onClick={complete} disabled={!allScanned || completing || dirty} aria-busy={completing || undefined}>{d("complete")}</Button>
            </section>
          )}
        </div>

        <div className="d2-tally" role="region" aria-label={d("total")}>
          <div className="d2-total" aria-live="polite">
            <span>{d("desk.total")}</span>
            <b id="sd-total" className={pending ? "is-busy" : undefined}><Ltr>{totalText}</Ltr></b>
            {q && <small>{q.units} {d("desk.piece")} · <Ltr>{milligramsText(q.weightMg)}</Ltr> {d("desk.gram")}</small>}
          </div>
          {q && (
            <dl className="d2-break" aria-label={d("desk.calc")}>
              <div><dt>{d("desk.before")}</dt><dd><Ltr>{piastresText((qc ?? q).beforeDiscountPiastres)}</Ltr></dd></div>
              <div><dt>{kindLabel}</dt><dd><Ltr>{piastresText(q.feeTotalPiastres)}</Ltr></dd></div>
              {!buy && (qc ?? q).beforeDiscountPiastres > (qc ?? q).totalPiastres && <div><dt>{L("الخصم", "Discount")}</dt><dd><Ltr>−{piastresText((qc ?? q).beforeDiscountPiastres - (qc ?? q).totalPiastres)}</Ltr></dd></div>}
              {qc && <div><dt>{L(`فيزا +${VISA_PERCENT}%`, `Visa +${VISA_PERCENT}%`)}</dt><dd><Ltr>+{piastresText(q.totalPiastres - qc.totalPiastres)}</Ltr></dd></div>}
              <div><dt>{d("desk.weight")}</dt><dd><Ltr>{milligramsText(q.weightMg)}</Ltr></dd></div>
              <div><dt>{d("desk.units")}</dt><dd><Ltr>{q.units}</Ltr></dd></div>
            </dl>
          )}
          <div className="d2-wa">
            <div className="d2-sec-head"><h2>{d("wa.title")}</h2><CopyButton id="sd-copy" text={waText} label={d("wa.copy")} disabled={!waText}>{d("desk.copy")}</CopyButton></div>
            <div id="wa-text" className={`d2-wa-text${waText ? "" : " is-empty"}`} dir="auto">{waText || d("desk.waEmpty")}</div>
          </div>
          {general && <div role="alert"><ErrBox>{general}</ErrBox></div>}
          {saveBtn("sd-save")}
          {draft && mayDeleteDraft(me, draft) && !readonly && <Button danger size="sm" onClick={remove}><Icon name="trash" size={15} />{d("delete")}</Button>}
        </div>
      </div>

      <div className="d2-dock">
        <div className="d2-dock-total"><span>{d("desk.mobileTotal")}</span><b><Ltr>{totalText}</Ltr></b></div>
        <CopyButton text={waText} label={d("wa.copy")} disabled={!waText} />
        {saveBtn()}
      </div>

      {scanning && <PieceScanner label={d("codeLabel")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); addCode(c); }} />}
    </div>
  );
}

