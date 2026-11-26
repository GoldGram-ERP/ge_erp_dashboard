"use client";
import "./desk-one.css";
import { ActionBar, Banner, Button, Chip, Field, Group, Icons, Input, Row as ListRow, Segmented, Select, Skeleton } from "@/components/hallmark";
// The Sales desk draft page (issue #6): ONE page for a new draft, an edit and an Admin opening it. Type -> customer -> item + count lines
// (each price read only, the system's) -> planned payment + cash discount -> totals -> WhatsApp summary -> (Admin) Complete with the real pieces.
// The page STAYS on the saved draft (it shows the number). Locked / completed / deleted drafts are read only; the SERVER decides (`locked`).
import { useEffect, useRef, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { stockMapOf, switchedOff } from "@/lib/items";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Option, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { dateTimeText, latinNumber, milligramsText, piastresText, timeText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { toast, useConfirm } from "@/components/engine";
import { CopyButton } from "@/components/shell/copy-button";
import { revealFirstError } from "@/lib/submit-guard";
import { useRouter } from "@/i18n/navigation";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, readDiscount, sentBanks } from "./sales-invoices-math";
import { TextBox, allPages, latestPrice, mayDiscount, readPieceCode, sg, type DiscountKind } from "./sales-form-parts";
import { accountOptions, payErrorTexts, withoutPayErrors } from "./payment-block";
import { HmPayRows } from "@/components/ui/HmPayRows";
import { HmTotals } from "@/components/ui/HmTotals";
import { PieceScanner } from "./piece-scanner";
import { LINES_MAX, isForeignDraft, mayEditForeignDraft, mayDeleteDraft, canCompleteDraft, canCompleteBuyDraft, canConfirmReservation, channelError, channelOptions, defaultChannel, deskTypes, forMath, lineTakesAccount, lockNote, plannedAgainst, readCustomer, readLines, type DeskLine } from "./sales-desk-rules";
import { useConfirmReservation } from "@/components/fields/ConfirmReservation";
import { HmBoughtPieces, HmCompleteBuy, useCompleteBuy } from "@/components/ui/HmCompleteBuy";
import { PHONE_LENGTH } from "@/lib/phone";
import { canOpen } from "@/nav/tree";
import { pricePerGram } from "./item-math";
import { code6 } from "@/lib/code6";
import { buildDeskMessage } from "./sales-desk-whatsapp";
import { AccountantSeat, HeldStrip, PriceHistory, RollingTotal, completeBlock, completeRefusal, readHeld, useProtection, type Protection } from "@/components/ui/HmPriceProtection";
import { VISA_PERCENT, bankMethodChoices, blankDeskBank, deskChoices, karatFits, manualPrice, messageInput, payRows, quoteBody, quotePayment, restoreChoices, visaChosen, type DeskBank, type Metal, type Operation, type Quote, type Wrapping } from "./sales-desk-quote";

const trimZeros = (t: string) => t.replace(/\.0+$|(\.\d*?)0+$/, "$1");
const INVOICES_KEY = "gold-sales/sales-invoices";
type Scanned = { code: string; itemName: string; karat: string };

export default function DeskOneForm({ row, close, reload, tr }: CustomFormProps) {
  const { t, L } = tr;
  const d = (k: string, v?: Record<string, string | number>) => t("gold-sales", `salesDesk.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const may = me ? mayDiscount(me) : false;
  const [confirm, dialog] = useConfirm();
  const router = useRouter();
  const qc = useQueryClient();
  // A new draft from the Price board holds exactly the board's snapshot (?held=), sent with the first save.
  const [held] = useState(readHeld);

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
  // Price protection: the held price, its windows and the settle (server); re-read when a window ends.
  const pp = useProtection(draft?.id);
  const [sending, setSending] = useState<number | null>(null);
  const [sendBusy, setSendBusy] = useState(false);
  const sendKey = useRef(newSaveKey());
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
    setDirty(false); setErrs({}); setGeneral(""); setPayRefusal(null); setPayTo({});
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
  // A reservation draft (owner, 2026-11-26): saved as a draft like any other, and made a real reservation only when it is confirmed. Any item, in stock
  // or not; paid in full, every line with the account that received it; no typed price, silver priced as wrapped (what a reservation's pricing does).
  const rsv = !buy && type === "reservation";
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
  // The seller box (backend #223): on a new draft, for everyone, the sellers of the draft's branch; nothing preselected, let go when the branch changes.
  useEffect(() => {
    if (!me || draft || !branchId) { setSellers([]); return; }
    let live = true;
    api("/sales-drafts/sellers", { query: isUser ? {} : { branchId } })
      .then((r: Row) => { if (!live) return; const got: Row[] = r.items ?? []; setSellers(got); setSellerId((s) => (got.some((u) => u.id === s) ? s : "")); })
      .catch(() => { if (live) setSellers([]); });
    return () => { live = false; };
  }, [me?.id, branchId, draft?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  const pickable = items.filter((x) => karatFits(metal, String(x.karat)));
  // an item already on the draft stays visible even if it was switched off since
  const onDraft: Option[] = (draft?.lines ?? []).map((l: Row) => [l.itemId, `${l.itemName} · ${l.karat}`]);
  const channels = channelOptions(me?.salesChannels, draft?.salesChannelId ? { id: draft.salesChannelId, name: draft.salesChannelName ?? "" } : null);
  const channelName = channels.find(([id]) => id === channelId)?.[1] ?? "";
  // the live quote wins over the saved totals, so adding or removing a piece re-prices the totals and the remaining amount. A saved Buy draft with
  // nothing changed shows its saved prices instead (`kept`, owner 2026-11-26): Complete pays exactly those.
  const kept = Boolean(draft && draft.operation === "buy" && !dirty);
  const total = (kept ? draft?.totals?.total : quote?.q.totalPiastres) ?? draft?.totals?.total ?? 0;
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
    if (isNew && !sellerId) e.sellerId = fieldErr("required");   // a new draft always names its seller (backend #223)
    const ce = channelError(channelId, channels);
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
    }
    setSaving(true);
    const body = {
      ...(isNew && !isUser && branchId ? { branchId } : {}), ...(isNew ? { sellerId } : {}), invoiceType: type, salesChannelId: channelId, ...c.payload, ...deskChoices(form, payRows(cash, banks), l.payload), ...(payment === "visa" ? { payByVisa: true } : {}),
      ...(cashPaid(cash) > 0 ? { cash: cashPaid(cash) } : {}), bankPayments: sentBanks(rsv ? money : banks), ...(dsc.sent && !buy ? { cashDiscount: dsc.sent } : {}),
      ...(isNew && held ? { heldFromBoard: held } : {}),
    };
    try {
      const saved = await api(isNew ? "/sales-drafts" : `/sales-drafts/${draft!.id}`, { method: isNew ? "POST" : "PUT", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      fill(saved);
      // the address names the draft, so a reload reopens it instead of an empty form
      if (isNew) { const u = new URL(window.location.href); u.searchParams.set("new", "draft"); u.searchParams.set("open", String(saved.id)); u.searchParams.delete("held"); window.history.replaceState(null, "", u); }
      else void pp.refetch();
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
      else if (["customerName", "customerPhone", "nationalId", "cashDiscount", "branchId", "salesChannelId", "sellerId"].includes(f.field)) e[f.field] = texts[f.field];
      else gen = texts[f.field] ?? tr.errorText(err.error);
    }
    if (!Object.keys(e).length && !gen && err.error.message !== "invalidFields") gen = tr.errorText(err.error);
    if (err.error.message === "notAllowed" && !gen && !Object.keys(e).length) gen = tr.errorText(err.error);
    setErrs(e); setGeneral(gen);
    if (draft && ["draftLocked", "draftCompleted", "draftReserved"].includes(err.error.message)) api(`/sales-drafts/${draft.id}`).then(fill).then(() => setGeneral(tr.errorText(err.error))).catch(() => {});
  }

  // ── Confirm of a reservation draft, and Complete of a Buy draft (owner, 2026-11-26) ──
  const confirmation = useConfirmReservation(tr, {
    done: (saved) => { fill(saved); reload(); },
    failed: (text, code) => {
      setGeneral(text); revealFirstError();
      if (draft && ["draftLocked", "draftReserved"].includes(code ?? "")) api(`/sales-drafts/${draft.id}`).then(fill).then(() => setGeneral(text)).catch(() => {});
    },
  });
  const buyDone = useCompleteBuy(tr, { draft, cash, banks, dirty, onPayErrors: (p) => setErrs(payErrorTexts(tr, p)),
    done: (saved) => { fill(saved); reload(); }, stale: () => { if (draft) api(`/sales-drafts/${draft.id}`).then(fill).catch(() => {}); } });

  async function remove() {
    if (!draft || !(await confirm({ title: d("deleteTitle"), text: d("deleteAsk", { number: draft.draftNumber }), danger: true, ok: L("حذف", "Delete") }))) return;
    try { await api(`/sales-drafts/${draft.id}`, { method: "DELETE" }); toast(d("deleted", { number: draft.draftNumber })); close(); }
    catch (err) { setGeneral(err instanceof ApiFailure ? tr.errorText(err.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); }
  }

  // «العميل بعت الفلوس»: 5 s to undo (the pill turns into «تراجع»), then the sales loop stops on the server.
  function customerSent() {
    if (!draft || sending !== null || sendBusy) return;
    const id = window.setTimeout(async () => {
      setSending(null); setSendBusy(true);
      try {
        const out = await api<Protection>(`/sales-drafts/${draft.id}/customer-sent`, { method: "POST", saveKey: sendKey.current });
        sendKey.current = newSaveKey();
        qc.setQueryData(["price-protection", draft.id], out);
        toast(L("اتبعتت للمحاسب على السعر ده", "Sent to the accountant at this price"));
      } catch (err) {
        if (!(err instanceof ApiFailure && (err.status === 0 || err.status >= 500))) sendKey.current = newSaveKey();
        toast(err instanceof ApiFailure && err.error.message === "notInSalesLoop" ? L("المسودة دي مش في مرحلة المبيعات خلاص.", "This draft is no longer with sales.") : L("ماتبعتتش. حاول تاني.", "Not sent. Try again."), { error: true });
        void pp.refetch();
      } finally { setSendBusy(false); }
    }, 5000);
    setSending(id);
    toast(L("هتتبعت للمحاسب بعد ٥ ثواني: دوس «تراجع» لو غلط", "Sending to the accountant in 5 s: press “Undo” if wrong"));
  }
  const undoSent = () => { if (sending !== null) { window.clearTimeout(sending); setSending(null); toast(L("اتلغى", "Cancelled")); } };
  const sendTimer = useRef<number | null>(null);
  sendTimer.current = sending;
  useEffect(() => () => { if (sendTimer.current !== null) window.clearTimeout(sendTimer.current); }, []);

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
      fill(done); setScanned([]); setPayTo({}); void pp.refetch();
      toast(d("completed", { number: done.salesInvoiceNumber }));
    } catch (err) {
      if (!(err instanceof ApiFailure)) { setCompleteMsg(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); }
      else {
        if (!(err.status === 0 || err.status >= 500 || err.error.message === "saveInProgress")) completeKey.current = newSaveKey();
        const v = err.error.values ?? {}, m = err.error.message;
        const ppMsg = completeRefusal(m, v, L);
        if (ppMsg) { setCompleteMsg(ppMsg); void pp.refetch(); }
        else if (m === "draftItemsMismatch") {
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
  // The seller (اسم البائع) and the creator (اسم المستخدم), kept apart since backend #223. A saved draft: its own (an older one's seller is its creator).
  const sellerName = (draft ? draft.sellerName || draft.employeeName : sellers.find((x) => x.id === sellerId)?.name as string | undefined) ?? "";
  const creatorName = (draft ? draft.employeeName : me?.name) ?? "";
  const waText = quote ? buildDeskMessage(messageInput(form, quote.q, quote.cash, { date: today(), branch: branchLabel, channel: channelName, seller: sellerName, customer: cust.customerName.trim(), nationalId: latinNumber(cust.nationalId.trim()), phone: latinNumber(cust.customerPhone.trim()), rows: payRows(cash, banks) })) : "";
  const heldUntil = pp.data?.stage === "sales" && pp.data.current ? timeText(pp.data.current.endsAt, "ar") : "";
  const waShown = waText && heldUntil ? `${waText}\nالسعر ثابت لحد ${heldUntil}` : waText;
  const ppBlock = completeBlock(pp.data, L);
  const typedManual = manualPrice(rsv ? "" : operation === "sell" ? manual.sell : manual.buy);
  const typeLabels: Record<string, string> = { sale: d("typeSale"), delivery: d("typeDelivery"), handover: L("تسليم", "Hand over"), reservation: L("حجز", "Reservation") };
  // The account that received each Instapay or Visa line: asked where the money is really taken (Complete, and a reservation).
  const receivedInto = banks.map((b, i) => (!lineTakesAccount(b.method) && !b.bankAccountId && String(b.amount ?? "").trim() !== "")
    ? <div className="w-64 max-w-full" key={`pt${i}`} data-k={`bank${i}Account`} data-err={errs[`bank${i}Account`] ? "" : undefined}>
        <Field htmlFor={`pt${i}-btn`} error={errs[`bank${i}Account`]} label={L(`الحساب اللي استلم ${d(`desk.pay.${b.method}`)} (${piastresText(typedPiastres(String(b.amount).trim()) ?? 0)})`, `Account that received ${d(`desk.pay.${b.method}`)} (${piastresText(typedPiastres(String(b.amount).trim()) ?? 0)})`)}>
          <Select id={`pt${i}-btn`} options={accountOptions(accounts).map(([v, t]) => ({ value: String(v), label: t }))} value={payTo[i] ?? ""} placeholder={sg(tr, "choose")} onChange={(v: string) => { setPayTo({ ...payTo, [i]: v }); setErrs(withoutPayErrors); }} />
        </Field>
      </div> : null);
  const pick = (patch: () => void) => { touch(); patch(); };
  const bar = draft ? (() => { const tt = draft.totals; const paid = against.planned;
    if (quote && !kept) { const q = quote.q, c = quote.cash ?? q, disc = Math.max(0, c.beforeDiscountPiastres - c.totalPiastres); return { gold: q.beforeDiscountPiastres - q.feeTotalPiastres, making: q.feeTotalPiastres, gross: q.beforeDiscountPiastres, discount: disc, makingLeft: q.feeTotalPiastres - disc, paid, left: q.totalPiastres - paid }; }
    return { gold: tt.goldTotal, making: tt.makingTotal, gross: tt.grossTotal, discount: tt.discount, makingLeft: tt.makingTotal - tt.discount, paid, left: tt.total - paid }; })() : null;
  // Admin / Super admin, a desk-wide role (even on another user's draft), or the action complete-sales-draft (own draft only); hidden until the person is known; a Buy draft is a quote only
  const canComplete = canCompleteDraft(me, draft?.status, buy, draft?.invoiceType) && (!foreign || accountantEdits);
  const canConfirm = canConfirmReservation(me, draft);
  const canCompleteBuy = canCompleteBuyDraft(me, draft) && (!foreign || accountantEdits);
  // Whoever completes takes the payment here: typing it is not a change of the draft.
  const takesPayment = canComplete || canCompleteBuy;
  // Price protection is a sale's: the backend gives a reservation or a Buy draft no price stage.
  const ppOn = !rsv && !buy && Boolean(pp.data?.stage);
  const mayOpenInvoice = Boolean(me?.screens.some((s: string) => s === INVOICES_KEY || s === "gold-sales/sales-invoices-list"));
  const allScanned = draft ? (draft.lines as Row[]).every((l) => need(l) === l.quantity) && scanned.length === draft.totals.quantity : false;

  const rowItem = (id: string) => { const it = items.find((x) => x.id === id) ?? (draft?.lines ?? []).find((x: Row) => x.itemId === id); return { name: String(it?.itemName ?? ""), karat: String(it?.karat ?? "") }; };
  // A piece already on the ticket counts up (one line per item, up to 999); a new piece adds a line.
  const addItem = (id: string) => {
    if (!id) return;
    const at = lines.findIndex((l) => l.itemId === id);
    if (at >= 0) { pick(() => setLines((ls) => ls.map((x, j) => (j === at ? { ...x, count: String(Math.min(999, (parseInt(latinNumber(x.count), 10) || 0) + 1)) } : x)))); return; }
    if (lines.length < LINES_MAX) pick(() => setLines((ls) => [...ls, { itemId: id, count: "1" }]));
  };
  const step = (i: number, by: number) => { const n = Math.min(999, Math.max(1, (parseInt(latinNumber(lines[i].count), 10) || 0) + by)); touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: String(n) } : x))); };
  const dropLine = (i: number) => { touch(); setErrs({}); setLeaving(i); setTimeout(() => { setLines((ls) => ls.filter((_, j) => j !== i)); setLeaving(null); }, 180); };
  const side = buy ? "buy" : "sell";
  const manualOpen = typing || manual[side] !== "";
  const shownPrice = (s: "sell" | "buy") => (price ? piastresText(metal === "silver" ? (s === "sell" ? price.silverSellPrice : price.silverBuyPrice) : s === "sell" ? price.sellPrice : price.buyPrice) : "—");
  // Karat 24 beside karat 21 (owner, 2026-11-18): the 21 price x 24 / 21, half up, the same rule every price uses (pricePerGram).
  const shown24 = (s: "sell" | "buy") => { const p21 = price ? (s === "sell" ? price.sellPrice : price.buyPrice) : null; const p = p21 == null ? null : pricePerGram({ sellPrice: p21, silverSellPrice: null }, "24"); return p === null ? "—" : piastresText(Number(p)); };
  const totalText = kept ? piastresText(total) : quote ? piastresText(quote.q.totalPiastres) : "—";
  const statusText = price ? d("desk.priceOk") : price === null ? d("goldNone") : d("desk.priceReading");
  const custErr = Boolean(errs.customerName || errs.nationalId || errs.customerPhone);
  // Progressive steps (owner, 2026-11-08): the branch first, then the pieces, then the customer and saving. A saved draft, and any error, shows everything.
  const payErr = Object.keys(errs).some((k) => k === "cash" || k === "sum" || k === "cashDiscount" || k.startsWith("bank"));
  const stepBranch = !(isNew && !isUser) || Boolean(branchId);
  const showMore = !isNew || lines.length > 0 || custErr || payErr;


  // ── Desk one: "the counter slip". The work on one side (setup, pieces, then customer, payment and complete as they become relevant) and one slip on the
  // other that always holds the price, the total, the WhatsApp text and Save; on a phone the total, Copy and Save ride in a bar pinned to the bottom.
  const locked = readonly;
  const setupLocked = !isNew || locked;
  const opItems = [{ id: "sell" as Operation, label: L("بيع", "Sell") }, { id: "buy" as Operation, label: L("شراء", "Buy") }];
  const metalItems = [{ id: "gold" as Metal, label: L("دهب", "Gold") }, { id: "silver" as Metal, label: L("فضة", "Silver") }];
  const typeItems = deskTypes(type, isNew).map((k) => ({ id: k, label: typeLabels[k] ?? k }));
  const sellerOptions = sellers.map((u) => ({ value: String(u.id), label: String(u.name ?? "") }));
  const title = draft ? L(`مسودة رقم ${draft.draftNumber}`, `Draft ${draft.draftNumber}`) : rsv ? L("حجز جديد", "New reservation") : L("مسودة جديدة", "New draft");
  const saveText = saving ? L("بنحفظ…", "Saving…") : rsv ? L("احفظ الحجز", "Save reservation") : isNew ? L("احفظ المسودة", "Save the draft") : L("احفظ التعديلات", "Save changes");
  const priceState = price ? "live" : price === null ? "none" : "unknown";
  const quoteLine = (id: string) => quote?.q.lines.find((x) => x.itemId === id);
  const left = (id: string) => stock?.get(id);
  const full = lines.length >= LINES_MAX;
  const tileOff = (id: string) => full || (!buy && !rsv && stock !== undefined && (left(id) ?? 0) <= 0);
  const visual = pickable.length > 0 && pickable.length <= 12;
  const q = quote?.q;
  const base = quote ? quote.cash ?? quote.q : null;
  const discountShown = base ? Math.max(0, base.beforeDiscountPiastres - base.totalPiastres) : 0;
  const visaUplift = q && quote?.cash ? q.totalPiastres - quote.cash.totalPiastres : 0;
  const countOf = (l: DeskLine) => parseInt(latinNumber(l.count), 10) || 0;
  const breakdown: [string, string][] = q ? [
    [L("قبل الخصم", "Before discount"), piastresText(q.beforeDiscountPiastres)],
    [buy ? L("الكاش باك", "Cashback") : L("المصنعية", "Workmanship"), piastresText(q.feeTotalPiastres)],
    ...(!buy ? [[L("الخصم", "Discount"), discountShown ? `− ${piastresText(discountShown)}` : piastresText(0)] as [string, string]] : []),
    ...(payment === "visa" ? [[L(`فيزا +${VISA_PERCENT}٪`, `Visa +${VISA_PERCENT}%`), piastresText(visaUplift)] as [string, string]] : []),
    [L("الوزن", "Weight"), `${milligramsText(q.weightMg)} ${L("جم", "g")}`],
    [L("عدد القطع", "Units"), String(q.units)],
  ] : [];

  const opLabel = opItems.find((o) => o.id === operation)?.label ?? "";
  const metalLabel = metalItems.find((o) => o.id === metal)?.label ?? "";
  // Stock shows a word, never a number (owner, 2026-11-25); the out-of-stock block (tileOff) is unchanged.
  const stockChip = (n: number | undefined) => n === undefined ? null : n <= 0
    ? <Chip tone="carnelian">{L("مش متاح", "Out of stock")}</Chip> : <Chip tone="malachite">{L("متاح", "In stock")}</Chip>;
  const value = (v: string, strong?: boolean) => <span dir="ltr" className={`block text-end tabular-nums ${strong ? "font-semibold text-label" : "text-secondary"}`}>{v}</span>;
  const errLine = (m: string | undefined | false) => m ? <p role="alert" className="text-meta font-medium text-danger">{m}</p> : null;
  const completeReady = Boolean((canComplete && draft && allScanned && !dirty && !completeBlock(pp.data, L)) || ((canCompleteBuy || canConfirm) && !dirty));
  const discOn = (may || accountantEdits) && !locked;

  return (
    <div className={`hallmark one-desk${locked ? " is-locked" : ""}`} data-op={operation} data-metal={metal}>
      {dialog}
      {confirmation.dialog}
      <header id="sd-head" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {rsv && <Chip tone="gold">{draft ? L("حجز", "Reservation") : title}</Chip>}
          {branchLabel && <Chip>{branchLabel}</Chip>}
          {draft && <span data-seller><Chip>{L("اسم البائع", "Seller")}: {sellerName || "—"}</Chip></span>}
          {draft && <span data-creator><Chip>{L("اسم المستخدم", "Typed by")}: {creatorName || "—"}</Chip></span>}
          <Chip><span dir="ltr">{String(draft?.createdDay ?? today())}</span></Chip>
        </div>
        <Button variant="soft" size="sm" icon={<Icons.ArrowLeft aria-hidden className="rtl:rotate-180" />} onClick={close}>{d("backToList")}</Button>
      </header>

      <div className="mb-3 grid gap-2 empty:hidden">
        {note && note.state !== "editable" && (
          <div id="sd-lock">
            <Banner tone={note.state === "completed" || note.state === "reserved" ? "ok" : "warn"} icon={note.state === "completed" || note.state === "reserved" ? <Icons.Check aria-hidden /> : <Icons.TriangleAlert aria-hidden />} live
              action={note.state === "reserved" ? (
                <span className="flex items-center gap-2" id="sd-reserved">
                  {draft?.reservationNumber ? <Chip tone="malachite">{L("حجز", "Reservation")} <span dir="ltr">{code6(draft.reservationNumber)}</span></Chip> : <Chip tone="carnelian">{L("الحجز اللي اتعمل من المسودة دي اتمسح", "The reservation made from this draft was deleted")}</Chip>}
                  {draft?.reservationNumber && canOpen(me, ["gold-sales/reservations-list"]) && <Button variant="soft" size="sm" onClick={() => router.push(`/sales/reservations?open=${draft.reservationId}`)}>{L("افتح الحجز", "Open the reservation")}</Button>}
                </span>) : note.state === "completed" && draft?.salesInvoiceNumber ? (
                <span className="flex items-center gap-2">
                  <Chip tone="malachite">{L("فاتورة", "Invoice")} <span dir="ltr">{code6(draft.salesInvoiceNumber)}</span></Chip>
                  {mayOpenInvoice && draft.salesInvoiceId && <Button variant="soft" size="sm" onClick={() => router.push(`/sales/sales-invoices?open=${draft.salesInvoiceId}`)}>{L("افتح الفاتورة", "Open the invoice")}</Button>}
                </span>) : undefined}>
              {note.text}
            </Banner>
          </div>
        )}
        {foreign && !accountantEdits && <Banner tone="info" icon={<Icons.Eye aria-hidden />} live>{L("دي مسودة زميل: تقدر تشوفها بس.", "Another person's draft: view only.")}</Banner>}
        {buy && draft?.status === "open" && <Banner tone="info" icon={<Icons.Info aria-hidden />} live>{L("الشراء بيتحفظ كمسودة، ولما يتم بيتدفع للعميل وتدخل القطع المخزون.", "A Buy is saved as a draft; on Complete the customer is paid and the pieces go into stock.")}</Banner>}
        {rsv && isNew && <Banner tone="info" icon={<Icons.Info aria-hidden />}>{L("الحجز بيتحفظ كمسودة مدفوعة بالكامل، وتقدر تختار أي قطعة حتى لو مش في المخزون. بيبقى حجز لما المحاسب أو المدير يأكّده.", "A reservation is saved as a draft paid in full, any piece in stock or not. It becomes a reservation once the accountant or a manager confirms it.")}</Banner>}
      </div>

      <div className="one-grid">
        <div className="one-work">
          <Group title={<span id="one-setup-h">{L("العملية", "Operation")}</span>}>
            <div className="grid gap-3 p-3" role="group" aria-labelledby="one-setup-h">
              {setupLocked ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Chip>{opLabel}</Chip><Chip>{metalLabel}</Chip>{!buy && <Chip>{typeLabels[type] ?? type}</Chip>}
                  {metal === "silver" && !rsv && !locked && <Segmented size="sm" label={L("التغليف", "Wrapping")} value={wrapping} onChange={(v) => pick(() => setWrapping(v))}
                    options={[{ value: "wrapped" as Wrapping, label: L("متغلفة", "Wrapped") }, { value: "unwrapped" as Wrapping, label: L("من غير تغليف", "Unwrapped") }]} />}
                  {metal === "silver" && !rsv && locked && <Chip>{wrapping === "wrapped" ? L("متغلفة", "Wrapped") : L("من غير تغليف", "Unwrapped")}</Chip>}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Segmented label={L("بيع ولا شراء", "Sell or buy")} value={operation} options={opItems.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => pick(() => { setOperation(v); if (v === "buy") { setType("sale"); setKind("amount"); setDisc(""); } setBanks([]); })} />
                  <Segmented label={L("المعدن", "Metal")} value={metal} options={metalItems.map((o) => ({ value: o.id, label: o.label }))}
                    onChange={(v) => pick(() => { setMetal(v); setLines([]); })} />
                  {!buy && <Segmented label={L("النوع", "Type")} value={type} options={typeItems.map((o) => ({ value: o.id, label: o.label }))} onChange={(v) => pick(() => setType(v))} />}
                  {metal === "silver" && !rsv && <Segmented label={L("التغليف", "Wrapping")} value={wrapping} onChange={(v) => pick(() => setWrapping(v))}
                    options={[{ value: "wrapped" as Wrapping, label: L("متغلفة", "Wrapped") }, { value: "unwrapped" as Wrapping, label: L("من غير تغليف", "Unwrapped") }]} />}
                </div>
              )}
              <div className="flex flex-wrap items-start gap-3">
                {isNew && !isUser && (
                  <div className="w-56 max-w-full" data-k="branchId" data-err={errs.branchId ? "" : undefined}>
                    <Field label={d("branch")} htmlFor="branchId-btn" error={errs.branchId}>
                      <Select id="branchId-btn" options={branches.map((b) => ({ value: String(b.id), label: String(b.branchName) }))} value={branchId} invalid={!!errs.branchId} placeholder={sg(tr, "choose")}
                        onChange={(v) => pick(() => { setBranchId(v); setLines([]); })} />
                    </Field>
                  </div>
                )}
                {/* The seller: picked by everyone on a new draft, required, nothing preselected; fixed once saved (backend #223). */}
                {isNew && (
                  <div className="w-56 max-w-full" data-k="sellerId" data-seller data-err={errs.sellerId ? "" : undefined}>
                    <Field label={`${L("اسم البائع", "Seller")} *`} htmlFor="sellerId-btn" error={errs.sellerId}
                      hint={branchId && !sellers.length ? L("مفيش بياع في الفرع ده: ادّي مستخدم دور كول سنتر أو مبيعات الفرع من شاشة المستخدمين.", "No seller in this branch: give a user the call center or branch sales role on the Users screen.") : undefined}>
                      <Select id="sellerId-btn" options={sellerOptions} value={sellerId} invalid={!!errs.sellerId} disabled={saving || !sellers.length} placeholder={sg(tr, "choose")}
                        onChange={(v) => { touch(); setSellerId(v); setErrs(({ sellerId: _gone, ...rest }) => rest); }} />
                    </Field>
                  </div>
                )}
                {isNew && (
                  <div className="w-56 max-w-full" data-creator>
                    <Field label={L("اسم المستخدم", "Typed by")} htmlFor="creatorName">
                      <Input id="creatorName" readOnly disabled value={creatorName} />
                    </Field>
                  </div>
                )}
                <div className="w-56 max-w-full" data-k="salesChannelId" data-err={errs.salesChannelId ? "" : undefined}>
                  <Field label={L("قناة البيع", "Sales channel")} htmlFor="salesChannelId-btn" error={errs.salesChannelId}>
                    <Select id="salesChannelId-btn" options={channels.map(([v, t]) => ({ value: String(v), label: t }))} value={channelId} disabled={!isNew || locked} invalid={!!errs.salesChannelId} placeholder={sg(tr, "choose")}
                      onChange={(v) => pick(() => setChannelId(v))} />
                  </Field>
                </div>
              </div>
            </div>
            {!(isNew && !isUser) && <ListRow label={d("branch")}>{value(branchLabel || "—", true)}</ListRow>}
          </Group>

          <div id="lineRows" data-k="lines" data-err={errs.lines ? "" : undefined}>
            <Group title={L("القطع", "Pieces")}
              action={lines.length > 0 && !locked ? <Button variant="soft" size="sm" onClick={() => pick(() => { setLines([]); setErrs({}); })}>{L("امسح الكل", "Clear all")}</Button> : undefined}>
              {!stepBranch ? <div className="meta px-3 py-3">{L("اختار الفرع الأول، وبعدين ضيف القطع.", "Pick the branch first, then add the pieces.")}</div> : !locked && (
                visual ? (
                  <div className="one-tiles p-3" role="group" aria-label={L("ضيف قطعة", "Add a piece")}>
                    {pickable.map((it) => (
                      <Button key={it.id} variant="soft" className="one-tile" disabled={tileOff(it.id)} onClick={() => addItem(it.id)} data-item={it.id}>
                        <span className="text-[0.9375rem] font-semibold tabular-nums" dir="ltr">{milligramsText(it.weight)} g</span>
                        <span className="text-meta text-secondary">{it.itemName}</span>
                        <span className="flex flex-wrap items-center gap-1.5"><Chip><span dir="ltr">{it.karat}K</span></Chip>{stockChip(left(it.id))}</span>
                      </Button>
                    ))}
                  </div>
                ) : (
                  <div className="p-3">
                    <Field label={L("ضيف قطعة", "Add a piece")} htmlFor="sd-item-btn">
                      <ItemPicker id="sd-item" name="sd-item" value="" items={pickable} stock={stock} mode={buy || rsv ? "buy" : "sell"} extra={onDraft} disabled={full} onChange={addItem} />
                    </Field>
                  </div>
                )
              )}
              {full && !locked && <div className="meta px-3 py-2">{L(`وصلت لآخر عدد سطور (${LINES_MAX}).`, `The lines limit (${LINES_MAX}) is reached.`)}</div>}
              {errs.lines && <div className="px-3 py-2">{errLine(errs.lines)}</div>}
              {lines.length === 0 ? (
                stepBranch && <div className="meta px-3 py-3">{locked ? L("مفيش قطع.", "No pieces.") : L("لسه مفيش قطع: دوس على قطعة من فوق تتضاف هنا.", "No pieces yet: press a piece above to add it here.")}</div>
              ) : lines.map((l, i) => {
                const it = rowItem(l.itemId), ql = quoteLine(l.itemId), msg = lineMsg[String(i)] || errs[`line${i}Item`] || errs[`line${i}Count`];
                const n = left(l.itemId);
                return (
                  <div key={`${l.itemId}-${i}`} data-line={i} className={`one-line px-3 py-2${leaving === i ? " leaving" : ""}`}>
                    <div className="grid min-w-0 gap-1">
                      <b className={`font-semibold ${msg ? "text-danger" : "text-label"}`}>{it.name}</b>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <Chip><span dir="ltr">{it.karat}K</span></Chip>
                        {ql && <Chip><span dir="ltr">{milligramsText(ql.weightMg)} g</span></Chip>}
                        {ql && <Chip>{buy ? L("كاش باك", "Cashback") : L("مصنعية", "Making")} <span dir="ltr">{piastresText(ql.feePerGram)}</span> / {L("جم", "g")}</Chip>}
                        {stockChip(n)}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-full bg-fill p-0.5" role="group" aria-label={L("العدد", "Count")}>
                      <Button size="sm" iconOnly label={L("أقل", "Fewer")} icon={<Icons.Minus aria-hidden />} disabled={locked || countOf(l) <= 1} onClick={() => step(i, -1)} />
                      <Input id={`line${i}Count`} inputMode="numeric" dir="ltr" maxLength={3} value={l.count} disabled={locked} aria-label={L("العدد", "Count")} aria-invalid={!!errs[`line${i}Count`]}
                        className="!min-h-7 !w-11 !px-1 text-center tabular-nums !min-h-7 h-7" onChange={(e) => { touch(); const v = e.target.value; setLines((ls) => ls.map((x, j) => (j === i ? { ...x, count: v } : x))); }} />
                      <Button size="sm" iconOnly label={L("أكتر", "More")} icon={<Icons.Plus aria-hidden />} disabled={locked || countOf(l) >= 999} onClick={() => step(i, 1)} />
                    </div>
                    <b className="one-line-price text-end font-semibold tabular-nums" dir="ltr">{kept && draft?.lines?.[i] ? piastresText(draft.lines[i].linePrice) : ql ? piastresText(ql.pricePiastres) : "—"}</b>
                    {!locked && <Button size="sm" variant="quiet" iconOnly label={L(`شيل ${it.name}`, `Remove ${it.name}`)} icon={<Icons.Trash2 aria-hidden />} onClick={() => dropLine(i)} />}
                    {msg && <div className="col-span-full">{errLine(msg)}</div>}
                  </div>
                );
              })}
            </Group>
          </div>

          {showMore && (
            <>
              <Group title={L("الزبون", "Customer")}>
                <div className="flex flex-wrap items-start gap-3 p-3">
                  <TextBox name="customerPhone" kind="phone" label={`${L("الموبايل", "Phone")} *`} value={cust.customerPhone} ltr maxLength={PHONE_LENGTH} disabled={locked} error={errs.customerPhone}
                    help={L("11 رقم يبدأ بـ 010 أو 011 أو 012 أو 015", "11 digits starting 010, 011, 012 or 015")} onChange={(v) => { touch(); setCust({ ...cust, customerPhone: v }); setErrs({ ...errs, customerPhone: "" }); }} />
                  <TextBox name="customerName" label={`${L("الاسم", "Name")} *`} value={cust.customerName} disabled={locked} error={errs.customerName}
                    onChange={(v) => { touch(); setCust({ ...cust, customerName: v }); setErrs({ ...errs, customerName: "" }); }} />
                  <TextBox name="nationalId" label={`${L("الرقم القومي", "National ID")} *`} value={cust.nationalId} ltr maxLength={14} disabled={locked} error={errs.nationalId}
                    help={L("14 رقم بالظبط", "Exactly 14 digits")} onChange={(v) => { touch(); setCust({ ...cust, nationalId: v }); setErrs({ ...errs, nationalId: "" }); }} />
                </div>
              </Group>

              <Group title={rsv ? L("الدفع", "Payment") : L("الدفع المتوقع", "Planned payment")}>
                <div className="grid gap-3 p-3">
                  <HmPayRows tr={tr} cash={cash} onCash={(v) => { if (takesPayment) setGeneral(""); else touch(); setCash(v); setErrs(withoutPayErrors); }} banks={banks} onBanks={(r) => { if (takesPayment) setGeneral(""); else touch(); setBanks(r as DeskBank[]); setErrs(withoutPayErrors); }}
                    accounts={accountOptions(accounts)} methods={bankMethodChoices(operation)} methodLabel={(m) => d(`desk.pay.${m}`)} blank={() => blankDeskBank(operation)}
                    total={quote || kept ? total : undefined} paid={against.planned} errors={errs} disabled={locked} />
                  {rsv && receivedInto}
                  {against.over && errLine(d("plannedOver"))}
                  {payRefusal && <Banner tone="warn" icon={<Icons.TriangleAlert aria-hidden />}>{L(`المدفوع ${piastresText(payRefusal.paid)} والإجمالي ${piastresText(payRefusal.total)}: لازم يبقوا قد بعض.`, `Paid ${piastresText(payRefusal.paid)} against a total of ${piastresText(payRefusal.total)}: they must match.`)}</Banner>}
                </div>
                {!buy && (
                  <div className="grid gap-1.5 p-3" data-k="cashDiscount" data-err={errs.cashDiscount ? "" : undefined}>
                    <label htmlFor="cashDiscount" className="text-body font-semibold text-label">{L("خصم كاش", "Cash discount")}</label>
                    {locked && draft ? (
                      <Input id="cashDiscount" disabled readOnly dir="ltr" className="!w-36 text-end tabular-nums" value={piastresText(Number(draft.totals?.discount ?? 0))} />
                    ) : !discOn ? (
                      <><Input id="cashDiscount" disabled readOnly dir="ltr" className="!w-36 text-end tabular-nums" value={piastresText(0)} /><p className="meta">{sg(tr, "cashDiscountNotAllowed")}</p></>
                    ) : (
                      <>
                        <div className="flex flex-wrap items-center gap-2">
                          <Segmented label={sg(tr, "cashDiscountKind")} value={kind} onChange={(k) => { touch(); setKind(k); }}
                            options={(["amount", "percent"] as const).map((k) => ({ value: k, label: sg(tr, k === "amount" ? "discountAmount" : "discountPercent") }))} />
                          <Input id="cashDiscount" dir="ltr" inputMode="decimal" autoComplete="off" maxLength={13} placeholder="0" value={disc} aria-invalid={!!errs.cashDiscount}
                            className="!w-36 text-end tabular-nums" onChange={(e) => { touch(); setDisc(e.target.value); setErrs({ ...errs, cashDiscount: "" }); }} />
                        </div>
                        <div id="discErr">{errLine(errs.cashDiscount)}</div>
                      </>
                    )}
                  </div>
                )}
              </Group>

              {draft && bar && <HmTotals tr={tr} bar={bar} />}
              {draft && ppOn && pp.data?.stage === "accountant" && <AccountantSeat key={pp.data.customerSentAt ?? ""} draftId={draft.id} pp={pp.data} L={L} methodLabel={(m) => m === "cash" ? L("كاش", "Cash") : d(`desk.pay.${m}`)} mayRecord={Boolean(canComplete && !locked)} />}

              {canComplete && draft && (
                <Group title={<span id="one-done-h">{L("كمّل الفاتورة", "Complete the invoice")}</span>}>
                  {dirty && <div className="p-3"><Banner tone="warn" icon={<Icons.TriangleAlert aria-hidden />} live>{L("المسودة اتغيرت: احفظها الأول عشان الأسعار تبقى مظبوطة.", "The draft changed: save it first so the prices are current.")}</Banner></div>}
                  {(draft.lines as Row[]).map((l, i) => (
                    <ListRow key={i} label={<span>{l.itemName} <span dir="ltr">{l.karat}K</span></span>}>
                      <span className="flex justify-end"><Chip tone={need(l) === l.quantity ? "malachite" : "neutral"}><span dir="ltr">{need(l)} / {l.quantity}</span>{need(l) === l.quantity && <Icons.Check aria-hidden />}</Chip></span>
                    </ListRow>
                  ))}
                  <div className="grid gap-2 p-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="w-48 max-w-full" data-err={pcErr ? "" : undefined}>
                        <Field label={L("كود القطعة", "Piece code")} htmlFor="sd-code">
                          <Input id="sd-code" dir="ltr" value={pc} disabled={adding} aria-invalid={!!pcErr} onChange={(e) => { setPc(e.target.value); setPcErr(""); }}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCode(); } }} />
                        </Field>
                      </div>
                      <Button variant="soft" icon={<Icons.Plus aria-hidden />} pending={adding} disabled={!pc.trim()} onClick={() => void addCode()}>{L("ضيف", "Add")}</Button>
                      <Button variant="soft" icon={<Icons.Camera aria-hidden />} onClick={() => setScanning(true)}>{L("بالكاميرا", "Camera")}</Button>
                    </div>
                    {errLine(pcErr)}
                  </div>
                  {scanning && <PieceScanner label={L("القطعة", "the piece")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); void addCode(c); }} />}
                  {scanned.map((s) => (
                    <div key={s.code} className="flex flex-wrap items-center gap-2 px-3 py-1.5">
                      <Chip tone={codeErr[s.code] ? "carnelian" : "neutral"}><span dir="ltr">{s.code}</span></Chip>
                      <span className="min-w-0 flex-1 text-secondary">{s.itemName} · {s.karat}</span>
                      <Button size="sm" variant="quiet" iconOnly label={L(`شيل ${s.code}`, `Remove ${s.code}`)} icon={<Icons.X aria-hidden />} onClick={() => { setScanned((x) => x.filter((y) => y.code !== s.code)); setCodeErr({}); setMismatch([]); }} />
                      {codeErr[s.code] && <div className="basis-full">{errLine(codeErr[s.code])}</div>}
                    </div>
                  ))}
                  {mismatch.map((m, i) => (
                    <ListRow key={`m${i}`} label={<span className="text-danger">{String(m.itemName ?? "")} · {String(m.karat ?? "")}</span>}>
                      <span className="flex justify-end"><Chip tone="carnelian"><span dir="ltr">{String(m.scanned ?? m.got ?? "")} / {String(m.quantity ?? m.needed ?? "")}</span></Chip></span>
                    </ListRow>
                  ))}
                  {(dirty || !allScanned || ppBlock) && <div className="meta px-3 py-2" id="sd-complete-why">{dirty ? L("احفظ المسودة الأول عشان تقدر تكمّل.", "Save the draft first to complete it.") : ppBlock || L("امسح كود كل القطع الأول عشان تقدر تكمّل.", "Scan every piece's code first to complete it.")}</div>}
                  {(receivedInto.some(Boolean) || completeMsg) && <div className="grid gap-2 p-3">{receivedInto}{errLine(completeMsg)}</div>}
                </Group>
              )}
              {canCompleteBuy && draft && <HmCompleteBuy key={draft.id} tr={tr} draft={draft} state={buyDone} todayTotal={kept && quote && quote.q.totalPiastres !== total ? quote.q.totalPiastres : undefined} />}
              {draft?.status === "completed" && draft.operation === "buy" && <HmBoughtPieces tr={tr} draft={draft} />}
            </>
          )}
        </div>

        <div className="one-slip" role="complementary" aria-label={L("الحساب", "The quote")}>
          {draft ? ppOn && <HeldStrip pp={pp.data} left={pp.left} locale={tr.locale} L={L} silver={metal === "silver"} error={pp.isError} refreshing={pp.isFetching && Boolean(pp.data)} onRetry={() => void pp.refetch()} />
            : held && <Group title={<Chip tone="gold">{L("سعر لوحة الأسعار", "Price board price")}</Chip>}>
                <ListRow label={L(`اتاخد الساعة ${timeText(held.takenAt, tr.locale)}`, `Taken at ${timeText(held.takenAt, tr.locale)}`)}>{value(piastresText(held.sell21), true)}</ListRow>
                <div className="meta px-3 py-2">{L("السعر ده هيتثبت على المسودة أول ما تحفظها.", "This price is held on the draft once you save it.")}</div>
              </Group>}
          <div id="sec-prices" aria-live="polite">
            <Group
              title={<span className="flex flex-wrap items-center gap-1.5"><Chip tone={priceState === "live" ? "malachite" : priceState === "none" ? "amber" : "neutral"}>{statusText}</Chip>{readAt && <Chip><span dir="ltr">{readAt}</span></Chip>}</span>}
              action={<Button size="sm" variant="soft" iconOnly label={L("اقرا السعر تاني", "Read the price again")} icon={<Icons.RefreshCw aria-hidden />} onClick={readPrice} />}>
              {price === undefined && !readAt ? <div className="p-3"><Skeleton lines={4} /></div> : metal === "silver" ? (
                <>
                  <ListRow label={L("فضة · بيع", "Silver · sell")}>{value(shownPrice("sell"), side === "sell")}</ListRow>
                  <ListRow label={L("فضة · شراء", "Silver · buy")}>{value(shownPrice("buy"), side === "buy")}</ListRow>
                </>
              ) : (
                <>
                  <ListRow label={L("عيار 21 · بيع", "Karat 21 · sell")}>{value(shownPrice("sell"), side === "sell")}</ListRow>
                  <ListRow label={L("عيار 21 · شراء", "Karat 21 · buy")}>{value(shownPrice("buy"), side === "buy")}</ListRow>
                  <ListRow label={L("عيار 24 · بيع", "Karat 24 · sell")}>{value(shown24("sell"))}</ListRow>
                  <ListRow label={L("عيار 24 · شراء", "Karat 24 · buy")}>{value(shown24("buy"))}</ListRow>
                </>
              )}
              {!rsv && !locked && (manualOpen ? (
                <div className="p-3" data-err={typedManual.invalid ? "" : undefined}>
                  <Field label={buy ? L("سعر شراء بإيدك", "Typed buy price") : L("سعر بيع بإيدك", "Typed sell price")} htmlFor="sd-manual" error={typedManual.invalid ? d("desk.manualInvalid") : undefined}>
                    <Input id="sd-manual" dir="ltr" inputMode="decimal" value={manual[side]} aria-invalid={typedManual.invalid} autoFocus={typing && manual[side] === ""} className="!w-40 text-end tabular-nums"
                      onChange={(e) => { touch(); setManual({ ...manual, [side]: e.target.value }); }} onBlur={() => setTyping(false)} />
                  </Field>
                </div>
              ) : (
                <div className="flex min-h-[2.375rem] items-center gap-3 px-3 py-1.5">
                  <span className="meta min-w-0 flex-1">{q ? (q.manualPriceUsed ? L("محسوب بالسعر اللي كتبته", "Using the typed price") : L("محسوب بسعر القائمة", "Using the list price")) : L("سعر بإيدك", "Typed price")}
                    {q && <> · <span dir="ltr" className="tabular-nums">{piastresText(q.goldPriceUsed)}</span></>}</span>
                  <Button size="sm" variant="soft" icon={<Icons.Pencil aria-hidden />} onClick={() => setTyping(true)}>{L("اكتب سعر", "Type a price")}</Button>
                </div>
              ))}
            </Group>
          </div>

          <Group>
            <div className="grid gap-1 p-3" id="sd-total" aria-live="polite">
              <span className="meta">{L("الإجمالي", "Total")}</span>
              {quote ? (
                <b className="one-total text-[1.75rem] font-bold leading-tight tracking-[-0.02em] tabular-nums" dir="ltr"><RollingTotal pp={ppOn ? pp.data : undefined}>{totalText}</RollingTotal><small className="ms-1 text-meta font-medium text-tertiary">EGP</small></b>
              ) : <span className="text-secondary">{L("ضيف قطعة عشان يظهر الإجمالي", "Add a piece to see the total")}</span>}
              {q && <span className="meta">{L(`${q.units} قطعة`, `${q.units} units`)}</span>}
            </div>
            {(quoteMsg || general) && <div className="grid gap-2 p-3">
              {quoteMsg && <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live action={<Button size="sm" variant="soft" onClick={readPrice}>{L("حاول تاني", "Try again")}</Button>}>{quoteMsg}</Banner>}
              {general && <Banner tone="warn" icon={<Icons.TriangleAlert aria-hidden />} live action={!locked ? <Button size="sm" variant="soft" pending={saving} onClick={() => void save()}>{L("حاول تاني", "Try again")}</Button> : undefined}>{general}</Banner>}
            </div>}
          </Group>

          {draft && ppOn && <PriceHistory pp={pp.data} locale={tr.locale} L={L} silver={metal === "silver"} />}

          {breakdown.length > 0 && (
            <Group title={L("اتحسب إزاي", "How it is worked out")}>
              {breakdown.map(([k, v]) => <ListRow key={k} label={k}>{value(v)}</ListRow>)}
            </Group>
          )}

          <div id="sec-wa">
            <Group title={L("رسالة الواتساب", "WhatsApp message")}
              action={<CopyButton id="sd-copy" className="one-copy" text={waShown} disabled={!waShown} label={L("انسخ الرسالة", "Copy the message")}>{L("انسخ", "Copy")}</CopyButton>}>
              <div id="wa-text" dir="auto" className={`msg p-3 text-meta leading-relaxed ${waText ? "text-secondary" : "text-tertiary"}`}>
                {waShown || L("الرسالة هتظهر هنا أول ما تضيف قطعة.", "The message shows here once you add a piece.")}
              </div>
            </Group>
          </div>
        </div>
      </div>

      <ActionBar label={L("الإجمالي والحفظ", "Total and save")}
        summary={<span className="flex items-baseline gap-1.5"><span className="meta">{L("الإجمالي", "Total")}</span><b dir="ltr" className="text-title font-bold tabular-nums">{totalText}<small className="ms-1 text-meta font-medium text-tertiary">EGP</small></b></span>}>
        <CopyButton className="one-copy" text={waShown} disabled={!waShown} label={L("انسخ الرسالة", "Copy the message")}>{L("انسخ", "Copy")}</CopyButton>
        {draft && note?.state === "editable" && mayDeleteDraft(me, draft) && <Button variant="danger" icon={<Icons.Trash2 aria-hidden />} onClick={() => void remove()}>{L("امسح المسودة", "Delete")}</Button>}
        {draft && !locked && ppOn && pp.data?.stage === "sales" && (sending !== null
          ? <Button variant="soft" id="pp-undo" icon={<Icons.Undo2 aria-hidden />} onClick={undoSent}>{L("تراجع", "Undo")}</Button>
          : <Button variant="soft" id="pp-sent" pending={sendBusy} icon={<Icons.Send aria-hidden />} onClick={customerSent}>{L("العميل بعت الفلوس", "Customer sent the money")}</Button>)}
        {canComplete && draft && <Button variant={completeReady ? "primary" : "soft"} id="sd-complete" aria-describedby={dirty || !allScanned || ppBlock ? "sd-complete-why" : undefined} pending={completing} disabled={!allScanned || dirty || Boolean(ppBlock)} onClick={() => void complete()}>
          {completing ? L("بنكمّل…", "Completing…") : L("كمّل الفاتورة", "Complete")}</Button>}
        {canConfirm && <Button variant={!dirty ? "primary" : "soft"} id="sd-confirm-reservation" pending={confirmation.confirming} icon={<Icons.Check aria-hidden />} onClick={() => {
          if (dirty) { setGeneral(L("احفظ التعديلات الأول وبعدين أكّد.", "Save the changes first, then confirm.")); revealFirstError(); return; }   // what is confirmed is what was saved
          void confirmation.run(draft!);
        }}>{L("تأكيد الحجز", "Confirm the reservation")}</Button>}
        {canCompleteBuy && <Button variant={!dirty ? "primary" : "soft"} id="sd-complete-buy" pending={buyDone.completing} icon={<Icons.Check aria-hidden />} onClick={() => void buyDone.run()}>
          {buyDone.completing ? L("بنكمّل…", "Completing…") : L("كمّل الشراء", "Complete the purchase")}</Button>}
        {!locked && <Button variant={completeReady ? "soft" : "primary"} id="sd-save" pending={saving} onClick={() => void save()}>{saveText}</Button>}
      </ActionBar>
    </div>
  );
}
