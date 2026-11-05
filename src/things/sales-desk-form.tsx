"use client";
import "./sales-desk.css";
import { Button, Checkbox, Input, Seg, copyText } from "@/components/ui";
// The Sales desk draft page (issue #6): ONE page for a new draft, an edit and an Admin opening it. Type -> customer -> item + count lines
// (each price read only, the system's) -> planned payment + cash discount -> totals -> WhatsApp summary -> (Admin) Complete with the real pieces.
// The page STAYS on the saved draft (it shows the number). Locked / completed / deleted drafts are read only; the SERVER decides (`locked`).
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber, milligramsText, piastresInput, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Icon, Ltr, toast, useConfirm } from "@/components/engine";
import { CopyButton } from "@/components/shell/copy-button";
import { Link as NavLink } from "@/i18n/navigation";
import { bankPaid, cashPaid, paymentErrors, paymentKeyOf, readDiscount, sentBanks, type Bank } from "./sales-invoices-math";
import { Choice, DiscountBox, ErrBox, TextBox, allPages, latestPrice, mayDiscount, readPieceCode, sg, type DiscountKind } from "./sales-form-parts";
import { PaymentBlock, TotalsBar, accountOptions, payErrorTexts, withoutPayErrors } from "./payment-block";
import { PieceScanner } from "./piece-scanner";
import { LINES_MAX, lockNote, plannedAgainst, readCustomer, readLines, type DeskLine } from "./sales-desk-rules";
import { buildDeskMessage } from "./sales-desk-whatsapp";
import { DISCOUNTS, PAYMENT_NAMES, karatFits, manualPrice, messageInput, paymentChoices, quoteBody, secondChoices, splitProblem, type Metal, type Operation, type Payment, type Quote, type Wrapping } from "./sales-desk-quote";

const trimZeros = (t: string) => t.replace(/\.0+$|(\.\d*?)0+$/, "$1");
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
  const [operation, setOperation] = useState<Operation>("sell");
  const [metal, setMetal] = useState<Metal>("gold");
  const [wrapping, setWrapping] = useState<Wrapping>("wrapped");
  const [payment, setPayment] = useState<Payment>("cash");
  const [payment2, setPayment2] = useState<Payment | "">("");
  const [split, setSplit] = useState("");
  const [pct, setPct] = useState(0);
  const [manual, setManual] = useState({ sell: "", buy: "" });
  const [sellers, setSellers] = useState<Row[]>([]);
  const [sellerId, setSellerId] = useState("");
  const [ownBranch, setOwnBranch] = useState("");
  const [quote, setQuote] = useState<{ q: Quote; cash: Quote | null } | null>(null);
  const [quoteMsg, setQuoteMsg] = useState("");
  const [lineMsg, setLineMsg] = useState<Record<string, string>>({});
  const [readAt, setReadAt] = useState("");
  const [tick, setTick] = useState(0);
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("ge-erp:desk-theme") === "dark");
  useEffect(() => { document.documentElement.dataset.deskTheme = dark ? "dark" : "light"; return () => { delete document.documentElement.dataset.deskTheme; }; }, [dark]);
  const flipTheme = () => setDark((x) => { window.localStorage.setItem("ge-erp:desk-theme", x ? "light" : "dark"); return !x; });
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
      setItems(i.filter((x) => x.isCoded !== false && x.isActive !== false && !x.deletedAt && Number(x.weight ?? 0) > 0 && x.workmanshipMode === "per_gram" && x.workmanshipValue != null));
      setAccounts(a); setBranches(b);
      if (row?.id) {
        try { fill(await api(`/sales-drafts/${row.id}`)); } catch { setGone(true); }
        setLoaded(true);
      } else if (me?.branchId) setBranchId(me.branchId);
    })();
    if (me?.branchId) api(`/branches/${me.branchId}`).then((b: Row) => setOwnBranch(b.branchName)).catch(() => {});
    if (me && !isUser) allPages("/users").then(setSellers).catch(() => {});
    readPrice();
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  // The list price: read now, then every 15 s while the tab is visible ("read a new price now" forces it); a new read re-quotes.
  function readPrice() {
    latestPrice(today()).then((p) => { setPrice(p); setReadAt(new Date().toLocaleTimeString(tr.locale)); setTick((n) => n + 1); }).catch(() => setPrice(undefined));
  }
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) readPrice(); }, 15000);
    return () => clearInterval(id);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The price of everything on the screen is the backend's quote (debounced); nothing is worked out here.
  const form = { operation, metal, payment, discountPercent: pct, manualSell: manual.sell, manualBuy: manual.buy, wrapping, lines };
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
  const itemOptions: [string, string][] = items.filter((x) => karatFits(metal, String(x.karat))).map((x) => [x.id, `${x.itemName} · ${x.karat ?? ""}`]);
  // an item already on the draft stays visible even if it was switched off since
  for (const l of draft?.lines ?? []) if (!itemOptions.some(([id]) => id === l.itemId)) itemOptions.push([l.itemId, `${l.itemName} · ${l.karat}`]);
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

  const branchLabel = draft?.branchName ?? (isUser ? ownBranch : branches.find((b) => b.id === branchId)?.branchName) ?? "";
  const sellerName = draft?.employeeName ?? (isUser ? me?.name : (([u]) => u && ([u.firstName, u.familyName].filter(Boolean).join(" ") || u.username))(sellers.filter((x) => x.id === sellerId)) ?? me?.name) ?? "";
  const second = payment2 ? payment2 : undefined;
  const splitErr = second && quote ? splitProblem(split, quote.q.totalPiastres) : "";
  const waText = quote ? buildDeskMessage(messageInput(form, quote.q, quote.cash, { date: today(), branch: branchLabel, seller: sellerName, customer: cust.customerName.trim(), nationalId: latinNumber(cust.nationalId.trim()), phone: latinNumber(cust.customerPhone.trim()), payment2: second, split })) : "";
  const typedManual = manualPrice(operation === "sell" ? manual.sell : manual.buy);
  const buy = operation === "buy";
  const copy = async () => toast((await copyText(waText)) ? d("desk.copied") : t("common", "offline"), { error: false });
  const pick = (patch: () => void) => { touch(); patch(); };
  const bar = draft ? (() => { const tt = draft.totals; const paid = against.planned; return { gold: tt.goldTotal, making: tt.makingTotal, gross: tt.grossTotal, discount: tt.discount, makingLeft: tt.makingTotal - tt.discount, paid, left: tt.total - paid }; })() : null;
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  const canComplete = !isUser && draft?.status === "open";
  const mayOpenInvoice = Boolean(me?.screens.some((s: string) => s === INVOICES_KEY || s === "gold-sales/sales-invoices-list"));
  const allScanned = draft ? (draft.lines as Row[]).every((l) => need(l) === l.quantity) && scanned.length === draft.totals.quantity : false;

  return (
    <form id="sd" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="desk-ref" data-theme={dark ? "dark" : "light"}>
      {dialog}
      <div id="banners">{general && <div className="note warn" role="alert"><b>{general}</b></div>}</div>

      <div className="card" id="sd-head" aria-live="polite">
        {draft ? <>
          <div className="help">{d("draftNumberShort")}</div>
          <div data-draft-number={draft.draftNumber} dir="ltr" style={{ fontSize: 26, fontWeight: 650, lineHeight: 1.15, letterSpacing: "-0.02em" }}>{draft.draftNumber}</div>
          <div className="help" style={{ marginTop: 6 }}>{draft.branchName} · <Ltr>{draft.createdDay}</Ltr></div>
          {note && (note.state !== "editable" || isUser) && <div className={`note ${note.state === "editable" ? "" : "warn"}`} id="sd-lock" data-lock={note.state} style={{ marginTop: 10 }}><b>{note.state === "locked" ? `${d("lock.locked")}: ` : ""}</b>{note.text}</div>}
        </> : <>
          <h3 style={{ margin: 0 }}>{d("newDraft")}</h3>
          <div className="help">{d("intro")}</div>
          {isUser && <div className="help">{d("ownOnly")}</div>}
        </>}
        <Button size="sm" id="sd-theme" onClick={flipTheme}>{dark ? d("desk.light") : d("desk.dark")}</Button>
        <div className="kv"><span>{d("goldPriceToday", { price: "" }).replace(/:\s*$/, "")}</span><span dir="ltr">{draft ? piastresText(draft.goldPrice21k) : price ? piastresText(price.sellPrice) : price === null ? d("goldNone") : ""}</span></div>
      </div>

      <div className="desk-cols layout">
      <fieldset disabled={readonly || saving} className="desk-col">
        <div className="card panel" id="sec-customer"><h3>{d("desk.operationData")}</h3>
          <div className="operation-switches">
            <div className="field"><span className="flabel" id="sd-op-l">{d("desk.operation")}</span>
              <Seg label={d("desk.operation")} attrs={{ "aria-labelledby": "sd-op-l" }} value={operation}
                onChange={(k) => pick(() => { setOperation(k); setPayment("cash"); setPayment2(""); setSplit(""); setPct(0); setType("sale"); })}
                items={(["sell", "buy"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-op": k } }))} /></div>
            <div className="field"><span className="flabel" id="sd-metal-l">{d("desk.metal")}</span>
              <Seg label={d("desk.metal")} attrs={{ "aria-labelledby": "sd-metal-l" }} value={metal}
                onChange={(k) => pick(() => { setMetal(k); setLines([blank()]); })}
                items={(["gold", "silver"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-metal": k } }))} /></div>
          </div>
          <div className="sales-identity">
            <div className="field" data-k="branchId"><label htmlFor="branchId">{d("branch")}</label>
              <Choice tr={tr} id="branchId" searchable={false} disabled={!isNew || isUser} options={isNew && !isUser ? branches.map((b) => [b.id, b.branchName]) : [[draft?.branchId ?? me?.branchId ?? "", branchLabel]]}
                value={isNew && !isUser ? branchId : (draft?.branchId ?? me?.branchId ?? "")} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
            <div className="field" data-seller><label htmlFor="sellerId">{d("desk.seller")}</label>
              <Choice tr={tr} id="sellerId" searchable={false} disabled={isUser || !!draft}
                options={isUser || draft ? [["me", sellerName]] : sellers.filter((u) => u.branchId === branchId && u.userType === "user").map((u) => [u.id, [u.firstName, u.familyName].filter(Boolean).join(" ") || u.username])}
                value={isUser || draft ? "me" : sellerId} onChange={(v) => setSellerId(v)} /></div>
          </div>
          <TextBox name="customerName" label={d("customerName")} placeholder={d("desk.phName")} value={cust.customerName} maxLength={100} error={errs.customerName} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerName: v })); }} />
          <TextBox name="nationalId" label={d("nationalId")} placeholder={d("desk.phNid")} value={cust.nationalId} ltr maxLength={14} help={d("nationalIdHelp")} error={errs.nationalId} onChange={(v) => { touch(); setCust((c) => ({ ...c, nationalId: v })); }} />
          <TextBox name="customerPhone" label={d("customerPhone")} placeholder="01xxxxxxxxx" value={cust.customerPhone} ltr maxLength={15} help={d("phoneHelp")} error={errs.customerPhone} onChange={(v) => { touch(); setCust((c) => ({ ...c, customerPhone: v })); }} />
          <div className="field"><label htmlFor="payment">{d("desk.payment")}</label>
            <Choice tr={tr} id="payment" searchable={false} options={paymentChoices(operation).map((k) => [k, d(`desk.pay.${k}`)])} value={payment}
              onChange={(k) => pick(() => { setPayment((k || "cash") as Payment); if (k === "visa" || k === payment2) { setPayment2(""); setSplit(""); } })} /></div>
          {secondChoices(operation, payment).length > 0 && <div className="field"><label htmlFor="payment2">{d("desk.payment2")}</label>
            <Choice tr={tr} id="payment2" searchable={false} placeholder={d("desk.none")} options={secondChoices(operation, payment).map((k) => [k, d(`desk.pay.${k}`)])} value={payment2} onChange={(v) => pick(() => setPayment2(v as Payment | ""))} /></div>}
          {second && <TextBox name="splitAmount" label={d("desk.split", { method: d(`desk.pay.${payment}`) })} value={split} ltr maxLength={14}
            error={splitErr ? d(`desk.splitErr.${splitErr}`) : undefined} onChange={(v) => { touch(); setSplit(v); }} />}
          {second && quote && !splitErr && <div className="payment-remaining"><span>{d(`desk.pay.${second}`)}</span><b dir="ltr" id="sd-remaining">{piastresText(quote.q.totalPiastres - (typedPiastres(split) ?? 0))}</b></div>}
          {!buy && <div className="field"><span className="flabel" id="sd-type-l">{d("typeLabel")}</span>
            <Seg label={d("typeLabel")} attrs={{ "aria-labelledby": "sd-type-l" }} value={type} onChange={(k) => { touch(); setType(k); }}
              items={(["sale", "delivery"] as const).map((k) => ({ id: k, label: d(k === "sale" ? "typeSale" : "typeDelivery"), attrs: { "data-type": k } }))} /></div>}
        </div>
      </fieldset>

      <fieldset disabled={readonly || saving} className="desk-col">
        <div className="card panel" id="sec-items"><div className="topline"><h3>{d("pieces")}</h3><span className="dr-pill">{d("desk.autoFees")}</span></div>
          {metal === "silver" && <div className="wrapping-controls"><span id="sd-wrap-l">{d("desk.wrapping")}</span>
            <Seg label={d("desk.wrapping")} attrs={{ "aria-labelledby": "sd-wrap-l" }} value={wrapping} onChange={(k) => pick(() => setWrapping(k))}
              items={(["wrapped", "unwrapped"] as const).map((k) => ({ id: k, label: d(`desk.${k}`), attrs: { "data-wrap": k } }))} /></div>}
          <div id="lineRows">
            {lines.map((l, i) => {
              const set = (patch: Partial<DeskLine>) => { touch(); setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x))); };
              const priced = quote?.q.lines[i];
              return (
                <div data-line={i} key={i} data-p={priced ? priced.pricePiastres : undefined}>
                  <div className="dr-row" data-k={`line${i}Item`}>
                    <Choice tr={tr} id={`it${i}`} options={itemOptions} value={l.itemId} onChange={(v) => set({ itemId: v })} invalid={!!(errs[`line${i}Item`] || lineMsg[i])} />
                    <Input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" aria-label={d("count")} aria-invalid={!!errs[`line${i}Count`]} value={l.count} onChange={(e) => set({ count: e.target.value })} />
                    <Button className="remove" aria-label={d("removeLine")} disabled={lines.length === 1} data-rmline={i} onClick={() => { touch(); setErrs({}); setLines((ls) => ls.filter((_, j) => j !== i)); }}>×</Button>
                  </div>
                  {err(`line${i}Item`)}{err(`line${i}Count`)}{lineMsg[i] && <ErrBox>{lineMsg[i]}</ErrBox>}
                </div>
              );
            })}
          </div>
          {errs.lines && <ErrBox>{errs.lines}</ErrBox>}
          <Button className="secondary-full" data-addline aria-disabled={lines.length >= LINES_MAX} onClick={() => { if (lines.length < LINES_MAX) { touch(); setLines((ls) => [...ls, blank()]); } }}>+ {d("addLine")}</Button>
          <Button className="clear-all" id="sd-clear" onClick={() => { touch(); setLines([blank()]); setPct(0); setManual({ sell: "", buy: "" }); setSplit(""); setPayment2(""); }}>{d("desk.clear")}</Button>
          <h4>{d("desk.calc")}</h4>
          {quoteMsg && <div className="note warn" role="alert" id="sd-quotemsg"><b>{quoteMsg}</b></div>}
          {typedManual.invalid && <div className="note warn" role="alert" id="sd-manualmsg"><b>{d("desk.manualInvalid")}</b></div>}
          <div className="field"><label htmlFor="sd-fees">{d("desk.fees", { kind: d(buy ? "desk.cashback" : "desk.workmanship") })}</label>
            <Input id="sd-fees" readOnly dir="rtl" value={quote ? `${[...new Set(quote.q.lines.map((x) => trimZeros(piastresText(x.feePerGram))))].join(" + ")} = ${trimZeros(piastresText(quote.q.feeTotalPiastres))} ${d("desk.egp")}` : "—"} />
            <div className="fee-small" id="sd-feeweights">{quote ? quote.q.lines.map((x) => `${trimZeros(milligramsText(x.weightMg))} ${d("desk.gram")} × ${x.quantity}`).join(" ، ") : ""}</div></div>
          <div className="two">
            <div className="dr-price"><small>{d("desk.weight")}</small><b id="sd-weight">{quote ? trimZeros(milligramsText(quote.q.weightMg)) : "0"}</b><small>{d("desk.gram")}</small></div>
            <div className="dr-price"><small>{d("desk.units")}</small><b id="sd-units">{quote ? quote.q.units : "0"}</b><small>{d("desk.piece")}</small></div>
          </div>
          {!buy && <div className="discount">
            <Checkbox checked={pct > 0} onChange={(on) => pick(() => setPct(on ? 5 : 0))} id="sd-disc-on">{d("desk.discountOn")}</Checkbox>
            {pct > 0 && <Seg label={d("desk.discountPercent")} value={String(pct)} onChange={(k) => pick(() => setPct(Number(k)))}
              items={DISCOUNTS.filter((n) => n > 0).map((n) => ({ id: String(n), label: `${n}%`, attrs: { "data-disc": String(n) } }))} />}
          </div>}
          <div className="summary"><span>{d("desk.total")}</span>
            {quote && pct > 0 && !buy && <div className="muted" id="sd-before">{d("desk.before")}: {piastresText(quote.q.beforeDiscountPiastres)}</div>}
            <strong id="sd-total" dir="ltr">{quote ? piastresText(quote.q.totalPiastres) : "—"}</strong><small>{d("desk.currency")}</small></div>
        </div>
      </fieldset>

      <div className="desk-col preview-col">
        <div className="card panel" id="sec-prices"><div className="topline"><h3>{d("desk.prices")}</h3><span className="dr-pill">{d("desk.every15")}</span></div>
          <div className={`dr-status ${price ? "ok" : price === null ? "bad" : ""}`} id="sd-status">{price ? d("desk.priceOk") : price === null ? d("goldNone") : d("desk.priceReading")}</div>
          <div className="price-grid">
            {(["sell", "buy"] as const).map((side) => (
              <div className="dr-price" key={side}>
                <small>{d(metal === "silver" ? `desk.${side}Silver` : `desk.${side}Price`)}</small>
                <b id={`sd-${side}price`} dir="ltr">{price ? piastresText(metal === "silver" ? price.silverPrice : side === "sell" ? price.sellPrice : price.buyPrice) : "—"}</b>
                <label className="override-label" htmlFor={`f-manual${side}`}>{d(side === "sell" ? "desk.manualSell" : "desk.manualBuy")}</label>
                <Input id={`f-manual${side}`} className="manual-price" inputMode="decimal" autoComplete="off" dir="ltr" value={manual[side]} onChange={(e) => setManual((m) => ({ ...m, [side]: e.target.value }))} />
                <small className={`mode${(side === "sell") === !buy && quote?.q.manualPriceUsed ? " manual-active" : ""}`} id={`sd-${side}mode`}>{(side === "sell") === !buy && quote?.q.manualPriceUsed ? d("desk.manualUsed") : d("desk.listUsed")}</small>
              </div>
            ))}
          </div>
          <p className="muted" id="sd-readat">{readAt ? d("desk.readAt", { time: readAt }) : d("desk.noRead")}</p>
          <Button className="secondary-full" id="sd-refresh" onClick={readPrice}>↻ {d("desk.refresh")}</Button>
        </div>
        <div className="card panel" id="sec-wa"><div className="topline"><h3>{d("wa.title")}</h3><span className="dr-pill">{d("desk.live")}</span></div>
          <pre id="wa-text" className="preview" dir="rtl">{waText || d("desk.waEmpty")}</pre>
          <p className="muted">{d("wa.help")}</p>
          <Button variant="primary" className="copy-full" id="sd-copy" disabled={!waText} onClick={() => void copy()}>{d("desk.copy")}</Button></div>
      </div>
      </div>
      <div className="mobile-bar" id="sd-mobilebar"><div className="mobile-total"><span>{d("desk.mobileTotal")}</span><b id="sd-mobiletotal" dir="ltr">{quote ? `${piastresText(quote.q.totalPiastres)} ${d("desk.egp")}` : "—"}</b></div>
        <Button className="mobile-copy" id="sd-mobilecopy" disabled={!waText} onClick={() => void copy()}>{d("desk.copy")}</Button></div>

      <fieldset disabled={readonly || saving} className="desk-pay">
        <div className="card" id="sec-payment"><h3>{d("plannedPayment")}</h3><div className="help">{d("plannedHelp")}</div>
          <PaymentBlock tr={tr} cash={cash} onCash={(v) => { if (canComplete) setGeneral(""); else touch(); setCash(v); setErrs(withoutPayErrors); }} banks={banks} onBanks={(b) => { if (canComplete) setGeneral(""); else touch(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
          <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{d("discount")}</label>
            <DiscountBox tr={tr} may={may} kind={kind} disc={disc} onKind={(k) => { touch(); setKind(k); }} onDisc={(v) => { touch(); setDisc(v); }}
              error={dsc.invalid ? <ErrBox>{sg(tr, "cashDiscountInvalid")}</ErrBox> : errs.cashDiscount ? <ErrBox>{errs.cashDiscount}</ErrBox> : null} /></div>
        </div>
      </fieldset>

      {bar && <div className="card" id="sec-totals"><TotalsBar tr={tr} bar={bar} />
        {against.over && <ErrBox>{d("plannedOver")}</ErrBox>}
        {payRefusal && !canComplete && <div className="note warn" role="alert"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}</div>}

      {canComplete && <div className="card" id="sec-complete"><h3>{d("complete")}</h3><div className="help">{d("completeIntro")}</div><div className="help">{d("completePayHelp")}</div>
        <div className="field" data-k="pieceCode" style={{ marginTop: 10 }}><label htmlFor="sd-code">{d("scan")}</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input id="sd-code" dir="ltr" maxLength={20} autoComplete="off" placeholder={d("scanHelp")} value={pc} style={{ flex: "1 1 180px", fontFamily: "monospace" }}
              onChange={(e) => { setPc(e.target.value); setPcErr(""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addCode(); } }} />
            <Button id="sd-add" onClick={() => void addCode()}>{d("codeAdd")}</Button>
            <Button id="scan-piece" onClick={() => setScanning(true)}><Icon name="camera" />{t("gold-sales", "pieceLookUp.scanWithCamera")}</Button>
          </div>
          {scanning && <PieceScanner label={d("codeLabel")} onClose={() => setScanning(false)} onCode={(c) => { setScanning(false); setPc(c); void addCode(c); }} />}
          <div className="help">{d("scanHelp")}</div>{pcErr && <ErrBox>{pcErr}</ErrBox>}</div>
        <ul id="sd-need" style={{ listStyle: "none", padding: 0, margin: "10px 0" }}>
          {(draft!.lines as Row[]).map((l) => <li key={l.lineNumber} className="kv" data-need={l.itemName}><span>{l.itemName} · <Ltr>{l.karat}</Ltr></span><b dir="ltr">{d("scanned", { scanned: need(l), total: l.quantity })}</b></li>)}
        </ul>
        {scanned.length > 0 && <><div className="help">{d("scannedList")}</div>
          <ul id="sd-codes" style={{ listStyle: "none", padding: 0, margin: "6px 0" }}>{scanned.map((s) => <li key={s.code} className="kv" data-code={s.code} style={codeErr[s.code] ? { color: "var(--warn)" } : undefined}>
            <span><Ltr>{s.code}</Ltr> · {s.itemName}{codeErr[s.code] && <ErrBox>{codeErr[s.code]}</ErrBox>}</span>
            <Button size="sm" danger aria-label={d("codeRemove", { code: s.code })} onClick={() => { setScanned((x) => x.filter((y) => y.code !== s.code)); setMismatch([]); setCodeErr({}); completeKey.current = newSaveKey(); }}><Icon name="trash" size={15} /></Button></li>)}</ul></>}
        {mismatch.length > 0 && <ul id="sd-mismatch" className="note warn" role="alert">{mismatch.map((m, i) => <li key={i}>{d("mismatchRow", { item: String(m.itemName), karat: String(m.karat), expected: Number(m.expected), scanned: Number(m.scanned) })}</li>)}</ul>}
        {payRefusal && <div className="note warn" role="alert" id="sd-payrefused"><b>{d("payRefused", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div>}
        {completeMsg && <div className="note warn" role="alert" id="sd-completemsg"><b>{completeMsg}</b></div>}
        <Button variant="primary" style={{ marginTop: 8 }} id="sd-complete" aria-disabled={!allScanned || completing || dirty} onClick={() => { if (allScanned && !dirty) void complete(); }}>{completing ? d("completing") : d("complete")}</Button>
        {dirty && <div className="help" role="status">{d("pricesStale")}</div>}
      </div>}

      {draft?.status === "completed" && <div className="card" id="sd-done" role="status"><h3>{d("completed", { number: draft.salesInvoiceNumber })}</h3>
        {mayOpenInvoice ? <NavLink href="/sales/invoices" className="btn primary">{d("openInvoice")}</NavLink> : <div className="help">{d("invoiceNoAccess")}</div>}</div>}

      <div className="formbar" id="sec-save">
        {!readonly && !buy && <Button variant="primary" type="submit" aria-disabled={saving} id="sd-save">{saving ? d("saving") : isNew ? d("saveDraft") : d("saveChanges")}</Button>}
        {draft && draft.status === "open" && <Button danger id="sd-delete" onClick={() => void remove()}><Icon name="trash" size={15} />{d("delete")}</Button>}
        <Button id="sd-back" onClick={close}>{d("backToList")}</Button>
      </div>
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
        <div className="row" style={{ marginTop: 12 }}><Button variant="primary" type="submit" id="sd-open">{d("openGo")}</Button>
          <Button onClick={close}>{d("backToList")}</Button></div>
      </div>
    </form>
  );
}
