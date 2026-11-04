"use client";
// The new reservation, one workspace page (forms.create.display "page" + custom). Ported from docs/nav-preview/app/things/sales-reservations-form.js.
// details (branch, date, seller) -> customer -> items (item, quantity, agreed total price) -> payment (paid in full) -> save.
// A reservation records no gold and moves no stock; the gold price shown is the latest saved one, display only, never sent.
// Money is whole piastres. Cash discount: base = the whole agreed price; sent only when typed.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { DatePicker } from "@/components/fields/DatePicker";
import { toast } from "@/components/engine";
import { LINES_MAX, MAX_PIASTRES, bankPaid, bankRowErrors, cashPaid, formRowOfRefusal, readDiscount, sentBanks } from "./sales-invoices-math";
import type { Bank } from "./sales-invoices-math";
import { BankRows, Choice, CustomerBoxes, DiscountBox, ErrBox, TextBox, accountOptions, allPages, code6, customerRules, fe, latestPrice, ltrStyle, mayDiscount, sg, type DiscountKind } from "./sales-form-parts";

const PIECES_MAX = 100;       // pieces on one reservation, all items together (dashboard and backend agree)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type Line = { itemId: string; quantity: string; price: string };
const blankLine = (): Line => ({ itemId: "", quantity: "1", price: "" });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const lineState = (l: Line) => {
  const qn = /^\d{1,3}$/.test(latinNumber(l.quantity)) ? Number(latinNumber(l.quantity)) : undefined;
  const p = typedPiastres(String(l.price ?? "").trim());
  return { q: qn !== undefined && qn >= 1 && qn <= PIECES_MAX ? qn : undefined, p: p !== undefined && p > 0 && p <= MAX_PIASTRES ? p : undefined };
};

export function ReservationForm({ close, reload, tr }: CustomFormProps) {
  const { t, L } = tr;
  const rm = (k: string, v?: Record<string, string>) => t("gold-sales", `reservations.${k}`, v);
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const may = me ? mayDiscount(me) : false;

  const [branches, setBranches] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [branchId, setBranchId] = useState(me?.branchId ?? "");
  const [employeeId, setEmployeeId] = useState(me?.id ?? "");
  const [date, setDate] = useState(today());
  const [cust, setCust] = useState<Record<string, string>>({ customerPhone: "", customerName: "", nationalId: "" });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<Bank[]>([{ bankAccountId: "", amount: "" }]);
  const [kind, setKind] = useState<DiscountKind>("amount");
  const [disc, setDisc] = useState("");
  const [price, setPrice] = useState<Row | null | undefined>(undefined);
  const [next, setNext] = useState<number | undefined>();
  const [chooseBranch, setChooseBranch] = useState(false);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [rootErr, setRootErr] = useState("");
  const [short, setShort] = useState(false);
  const [payRefusal, setPayRefusal] = useState<{ total: number; paid: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [shown, setShown] = useState({ customer: false, items: false, payment: false });
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); setShort(false); setPayRefusal(null); setRootErr(""); };

  // start
  useEffect(() => {
    (async () => {
      const [b, u, i, a] = await Promise.all([allPages("/branches").catch(() => []), isUser ? [] : allPages("/users").catch(() => []), allPages("/items").catch(() => []), allPages("/bank-accounts").catch(() => [])]);
      setBranches(b); setUsers(u); setAccounts(a);
      setItems(i.filter((x) => x.isCoded !== false && !x.deletedAt));    // an item not coded yet is hidden (the backend refuses it)
      if (!branchId && me) {
        // The branch: a User's own; an Admin's own user-record branch; else the only one; else they pick.
        const own = isUser ? "" : (await api(`/users/${me.id}`).catch(() => null))?.branchId ?? "";
        setBranchId(own || (b.length === 1 ? b[0].id : ""));
      }
    })();
  }, [me?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { latestPrice(date).then(setPrice).catch(() => setPrice(undefined)); }, [date]);
  useEffect(() => {
    const read = (b: string) => api("/document-numbers/next", { query: { documentType: "reservation", branchId: b || undefined, year: date.slice(0, 4) } });
    read(branchId).catch((e) => { if (branchId && e instanceof ApiFailure && e.status === 403) return read(""); throw e; })
      .then((r) => { setNext(r.next); setChooseBranch(false); })
      .catch((e) => { setNext(undefined); setChooseBranch(e instanceof ApiFailure && e.status === 400 && ((e.error.fields ?? []) as { field: string }[]).some((f) => f.field === "branchId")); });
  }, [branchId, date]);

  const rules = customerRules(tr);
  const customerValid = !rules.customerPhone(cust.customerPhone.trim()) && !rules.customerName(cust.customerName.trim()) && !rules.nationalId(cust.nationalId.trim());
  const detailsDone = Boolean(branchId && employeeId && DAY.test(date));
  const itemsDone = lines.length > 0 && lines.every((l) => { const s = lineState(l); return l.itemId && s.q && s.p && s.p >= s.q; });
  const gross = sum(lines.map((l) => lineState(l).p ?? 0));
  const d = may ? readDiscount(kind, disc, gross) : { value: 0, invalid: false, tooBig: false, sent: undefined };   // base = the whole agreed price
  const total = gross - d.value, paid = cashPaid(cash) + bankPaid(banks), left = total - paid;
  const need = { customer: detailsDone, items: detailsDone && customerValid, payment: detailsDone && customerValid && itemsDone };
  // Sections unlock in order and stay open once shown.
  useEffect(() => { setShown((s) => (s.customer === (s.customer || need.customer) && s.items === (s.items || need.items) && s.payment === (s.payment || need.payment) ? s : { customer: s.customer || need.customer, items: s.items || need.items, payment: s.payment || need.payment })); }, [need.customer, need.items, need.payment]);
  const valid = itemsDone && total > 0 && left === 0 && !d.invalid && !d.tooBig;

  const karatOf = (id: string) => items.find((i) => i.id === id)?.karat;
  const setLine = (i: number, patch: Partial<Line>) => { touch(); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };

  async function submit() {
    if (saving) return;
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    setGeneral(""); setPayRefusal(null); setRootErr("");
    const e: Record<string, string> = {};
    if (!branchId) e.branchId = fe(tr, "required");
    if (!employeeId) e.employeeId = fe(tr, "required");
    if (!DAY.test(date)) e.date = sg(tr, "dateInvalid");
    if (shown.customer) for (const k of ["customerPhone", "customerName", "nationalId"]) { const r = rules[k](cust[k].trim()); if (r) e[k] = r; }
    const seen = new Set<string>();
    lines.forEach((l, i) => {
      const s = lineState(l);
      if (!l.itemId) e[`line${i}Item`] = fe(tr, "required");
      else if (seen.has(l.itemId)) e[`line${i}Item`] = fe(tr, "duplicateItem");
      seen.add(l.itemId);
      if (!s.q) e[`line${i}Quantity`] = String(l.quantity).trim() === "" ? fe(tr, "required") : rm("quantityInvalid");
      if (!s.p || (s.q && s.p < s.q)) e[`line${i}Price`] = String(l.price).trim() === "" ? fe(tr, "required") : rm("linePriceInvalid");
    });
    const root = sum(lines.map((l) => lineState(l).q ?? 0)) > PIECES_MAX ? rm("tooManyPieces") : "";
    if (cash !== "") { const c = typedPiastres(cash); if (c === undefined || c <= 0 || c > MAX_PIASTRES) e.cash = sg(tr, "amountInvalid"); }
    bankRowErrors(banks).forEach((r: any, i: number) => {
      if (r.account) e[`bank${i}Account`] = fe(tr, r.account);
      if (r.amount) e[`bank${i}Amount`] = r.amount === "invalid" ? sg(tr, "amountInvalid") : fe(tr, r.amount);
    });
    setErrs(e); setRootErr(root);
    if (Object.keys(e).length || root) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length + (root ? 1 : 0) })); return; }
    if (d.invalid || d.tooBig) return;
    if (left !== 0) { setShort(true); return; }
    setSaving(true);
    const body = {
      branchId, date, employeeId,
      customerName: cust.customerName.trim(), customerPhone: latinNumber(cust.customerPhone.trim()),
      ...(cust.nationalId.trim() ? { nationalId: latinNumber(cust.nationalId.trim()) } : {}),
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: Number(latinNumber(l.quantity)), linePrice: typedPiastres(String(l.price).trim()) })),
      ...(cash !== "" ? { cash: typedPiastres(cash) } : {}),
      bankPayments: sentBanks(banks),
      ...(d.sent ? { cashDiscount: d.sent } : {}),   // only when typed
    };
    try {
      const saved = await api("/reservations", { method: "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(rm("savedNumber", { code: code6(saved.reservationNumber) }));
      reload();
    } catch (err) { setSaving(false); refusal(err); }
  }
  function refusal(err: unknown) {
    if (!(err instanceof ApiFailure)) { setGeneral(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")); return; }
    const v = err.error.values ?? {}, texts = backendFieldErrors(err.error, tr), e: Record<string, string> = {};
    let gen = "", root = "", pay: { total: number; paid: number } | null = null;
    for (const f of ((err.error.fields ?? []) as { field: string }[])) {
      let r: RegExpExecArray | null;
      if (f.field === "payments") pay = { total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) };
      else if (f.field === "lines") root = rm("tooManyPieces");
      else if ((r = /^bankPayments\.(\d+)\.(bankAccountId|amount)$/.exec(f.field))) e[`bank${formRowOfRefusal(banks, +r[1])}${r[2] === "amount" ? "Amount" : "Account"}`] = texts[f.field];
      else if ((r = /^lines\.(\d+)\.(itemId|quantity|linePrice)$/.exec(f.field))) e[`line${r[1]}${r[2] === "itemId" ? "Item" : r[2] === "quantity" ? "Quantity" : "Price"}`] = r[2] === "itemId" ? rm("itemInvalid") : r[2] === "quantity" ? rm("quantityInvalid") : rm("linePriceInvalid");
      else if (["branchId", "employeeId", "date", "customerName", "customerPhone", "nationalId", "cash"].includes(f.field)) e[f.field] = texts[f.field];
      else gen = texts[f.field] ?? tr.errorText(err.error);
    }
    if (!Object.keys(e).length && !pay && !root && !gen) gen = tr.errorText(err.error);   // no field named: say it once
    setErrs(e); setPayRefusal(pay); setRootErr(root); setGeneral(gen);
  }

  const cell = (k: string, v: number, bad?: boolean) => <div key={k}><div className="help">{k}</div><b dir="ltr" style={{ fontVariantNumeric: "tabular-nums", color: bad ? "var(--warn)" : undefined }} data-summary>{piastresText(v)}</b></div>;
  const accOpts = accountOptions(accounts);
  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;

  return (
    <form id="rsv" noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); submit(); }} onInput={() => { saveKey.current = newSaveKey(); }}>
      <div id="banners">{general && <div className="note warn" role="alert"><b>{general}</b></div>}</div>
      <div className="card"><h3>{rm("new")}</h3>
        {price === null && <div className="note warn">{sg(tr, "noGoldPriceForDay")}</div>}
        {([[rm("reservationNumber"), next !== undefined ? code6(next) : chooseBranch ? t("common", "chooseBranchForNumber") : ""], [sg(tr, "priceKarat"), price ? "21" : ""], [sg(tr, "priceDate"), price ? String(price.date).slice(0, 10) : ""], [sg(tr, "goldPrice21k"), price ? piastresText(price.sellPrice) : ""]] as const)
          .map(([k, v]) => <div className="kv" key={k}><span>{k}</span><span dir="ltr">{v}</span></div>)}
      </div>
      <div className="card" id="sec-details"><h3>{rm("details")}</h3>
        <div className="formgrid">
          <div className="field" data-k="branchId"><label htmlFor="branchId">{sg(tr, "branch")} *</label>
            <Choice tr={tr} id="branchId" options={branches.map((b) => [b.id, b.branchName])} value={branchId} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
          <div className="field" data-k="date"><label htmlFor="f-date">{rm("date")} *</label>
            <DatePicker id="f-date" name="date" value={date} onChange={(v) => { touch(); setDate(v || date); }} disabled={isUser} required />{err("date")}</div>
          <div className="field" data-k="employeeId"><label htmlFor="employeeId">{rm("employee")} *</label>
            {isUser ? <input disabled value={me?.name ?? ""} readOnly />
              : <Choice tr={tr} id="employeeId" options={users.map((u) => [u.id, u.name ?? u.username ?? u.id])} value={employeeId} onChange={(v) => { touch(); setEmployeeId(v); }} />}{err("employeeId")}</div>
        </div>
      </div>
      {shown.customer && <div className="card" id="sec-customer"><h3>{sg(tr, "customer")}</h3>
        <CustomerBoxes tr={tr} v={cust} set={(k, val) => { touch(); setCust((c) => ({ ...c, [k]: val })); }} errors={errs} /></div>}
      {shown.items && <div className="card" id="sec-items"><h3>{rm("items")}</h3><div className="help">{rm("itemsNote")}</div>
        <div className="field" data-k="lines"><div id="lineRows" style={{ marginTop: 10 }}>
          {lines.map((l, i) => (
            <div className="formgrid" data-line={i} key={i} style={{ marginBottom: 10 }}>
              <div className="field" data-k={`line${i}Item`}><label htmlFor={`it${i}`}>{rm("itemNumber", { number: String(i + 1) })} *</label>
                <Choice tr={tr} id={`it${i}`} options={items.map((x) => [x.id, `${x.itemName} · ${x.karat ?? ""}`])} value={l.itemId} onChange={(v) => setLine(i, { itemId: v })} />
                <div className="help" data-karat={i}>{karatOf(l.itemId) ? sg(tr, "karatOf", { karat: karatOf(l.itemId) }) : ""}</div>{err(`line${i}Item`)}</div>
              <div className="field" data-k={`line${i}Quantity`}><label htmlFor={`iq${i}`}>{rm("quantity")} *</label>
                <input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" value={l.quantity} style={ltrStyle} onChange={(e) => setLine(i, { quantity: e.target.value })} />{err(`line${i}Quantity`)}</div>
              <div className="field" data-k={`line${i}Price`}><label htmlFor={`ip${i}`}>{rm("linePrice")} *</label>
                <input id={`ip${i}`} data-p={i} dir="ltr" inputMode="decimal" maxLength={17} autoComplete="off" placeholder="0.00" value={l.price} style={ltrStyle} onChange={(e) => setLine(i, { price: e.target.value })} />{err(`line${i}Price`)}</div>
              {lines.length > 1 && <div style={{ alignSelf: "end" }}><button type="button" className="btn quiet sm danger" data-rmline={i} aria-label={rm("removeItem", { number: String(i + 1) })} onClick={() => { touch(); setErrs({}); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{rm("remove")}</button></div>}
            </div>
          ))}
        </div>{rootErr && <ErrBox>{rootErr}</ErrBox>}</div>
        <button type="button" className="btn quiet sm" data-addline aria-disabled={lines.length >= LINES_MAX} onClick={() => { if (lines.length < LINES_MAX) setLines((ls) => [...ls, blankLine()]); }}>{rm("addItem")}</button>
      </div>}
      {shown.payment && <div className="card" id="sec-payment"><h3>{rm("payment")} <small>{rm("paymentNote")}</small></h3>
        <div className="formgrid"><TextBox name="cash" label={sg(tr, "cash")} value={cash} maxLength={17} ltr error={errs.cash} onChange={(v) => { touch(); setCash(v); }} /></div>
        <div id="banks" style={{ marginTop: 12 }}><BankRows tr={tr} banks={banks} accounts={accOpts} onChange={(b) => { touch(); setBanks(b); }} />
          {Object.entries(errs).filter(([k]) => /^bank\d+(Account|Amount)$/.test(k)).map(([k, v]) => <ErrBox key={k}>{v}</ErrBox>)}</div>
        <button type="button" className="btn quiet sm" data-addbank onClick={() => setBanks((b) => [...b, { bankAccountId: "", amount: "" }])}>{sg(tr, "addBankRow")}</button>
        <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{sg(tr, "cashDiscount")}</label>
          <DiscountBox tr={tr} may={may} kind={kind} disc={disc} onKind={(k) => { touch(); setKind(k); }} onDisc={(v) => { touch(); setDisc(v); }}
            help={sg(tr, "cashDiscountHint", { max: piastresText(gross) })} error={d.tooBig ? <ErrBox>{sg(tr, "cashDiscountAbove", { max: piastresText(gross) })}</ErrBox> : d.invalid ? <ErrBox>{sg(tr, "cashDiscountInvalid")}</ErrBox> : null} /></div>
        <div id="tot" className="card" style={{ display: "flex", gap: 36, flexWrap: "wrap", margin: "14px 0 0", background: "var(--side)" }}>
          {cell(sg(tr, "total"), total)}{cell(sg(tr, "cashDiscount"), d.value)}{cell(rm("paid"), paid)}{cell(left < 0 ? sg(tr, "overPaid") : rm("remaining"), Math.abs(left), left !== 0)}
        </div>
        <div id="payMsg">{short && left !== 0 ? <ErrBox>{left > 0 ? sg(tr, "paidShort", { left: piastresText(left) }) : sg(tr, "paidOver", { over: piastresText(-left) })}</ErrBox>
          : payRefusal ? <div className="note warn" role="alert"><b>{rm("paidInvalid", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div> : null}</div>
      </div>}
      {shown.payment && <div className="formbar" id="sec-save">
        <button type="submit" className="btn primary" aria-disabled={!valid || saving} style={{ opacity: valid && !saving ? undefined : 0.6 }}>{saving ? t("common", "saving") : t("common", "save")}</button>
        <button type="button" className="btn quiet" id="cancelRsv" onClick={close}>{t("common", "cancel")}</button>
        {!(valid && !saving) && <span className="help" role="status">{saving ? t("common", "savingNote") : rm("saveWaits")}</span>}
      </div>}
    </form>
  );
}
