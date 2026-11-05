"use client";
// The new reservation, one workspace page (forms.create.display "page" + custom). Ported from docs/nav-preview/app/things/sales-reservations-form.js.
// details (branch, date, seller) -> customer -> items (item, quantity; the price is the system's) -> payment (paid in full) -> save.
// A reservation records no gold and moves no stock. Each line is priced by the backend at the gold price in force on the reservation date
// (GET /reservations/line-price, the same formula as a sale: issue #166), read only here; the Save prices it again and refuses a typed price.
// Money is whole piastres. Cash discount: base = the lines' workmanship; sent only when typed.
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { latinNumber, piastresText, today, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { DatePicker } from "@/components/fields/DatePicker";
import { toast } from "@/components/engine";
import { Button, Input } from "@/components/ui";
import { LINES_MAX, makingBase, paymentErrors, paymentKeyOf, readDiscount, sentBanks, totalsOf, type Bank } from "./sales-invoices-math";
import { Choice, CustomerBoxes, DiscountBox, ErrBox, allPages, code6, customerRules, fe, latestPrice, ltrStyle, mayDiscount, sg, type DiscountKind } from "./sales-form-parts";
import { Breakdown, PaymentBlock, PriceButton, TotalsBar, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { pricePerGram, typedHundredths } from "./item-math";

const PIECES_MAX = 100;       // pieces on one reservation, all items together (dashboard and backend agree)
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
type Line = { itemId: string; quantity: string };
const blankLine = (): Line => ({ itemId: "", quantity: "1" });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const qOf = (l: Line) => { const s = latinNumber(l.quantity); const n = /^\d{1,3}$/.test(s) ? Number(s) : 0; return n >= 1 && n <= PIECES_MAX ? n : undefined; };
// One line's price from the backend: ok (its answer), or why not ("incomplete" | "invalid" | "noGoldPriceToday" | "failed").
type Priced = { ok: Row } | { why: string } | { loading: true };
const keyOf = (l: Line, date: string) => (l.itemId && qOf(l) && DAY.test(date) ? `${l.itemId}|${qOf(l)}|${date}` : "");

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
  const [priced, setPriced] = useState<Record<string, Priced>>({});
  const [how, setHow] = useState(-1);   // the line whose price breakdown is open
  const [cash, setCash] = useState("");
  const [banks, setBanks] = useState<Bank[]>([blankBank()]);
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
  // Each line's price, asked again whenever its item, count or the date changes (a short pause while typing the count).
  const wanted = lines.map((l) => keyOf(l, date)).filter((k) => k && !priced[k]);
  useEffect(() => {
    if (!wanted.length) return;
    const h = setTimeout(() => {
      for (const k of new Set(wanted)) {
        const [itemId, quantity, day] = k.split("|");
        setPriced((p) => ({ ...p, [k]: { loading: true } }));
        api("/reservations/line-price", { query: { itemId, quantity, date: day } })
          .then((ok) => setPriced((p) => ({ ...p, [k]: { ok } })))
          .catch((e) => setPriced((p) => ({ ...p, [k]: { why: e instanceof ApiFailure ? (e.status === 409 ? "noGoldPriceToday" : (e.error.fields as any[] ?? []).find((f) => f.field === "itemId")?.message ?? "failed") : "failed" } })));
      }
    }, 250);
    return () => clearTimeout(h);
  }, [wanted.join(",")]);   // eslint-disable-line react-hooks/exhaustive-deps

  const lineOf = (l: Line) => priced[keyOf(l, date)];
  const okOf = (l: Line) => { const p = lineOf(l); return p && "ok" in p ? p.ok : undefined; };
  const rows = lines.map(okOf).filter((x): x is Row => Boolean(x));
  const rules = customerRules(tr);
  const customerValid = !rules.customerPhone(cust.customerPhone.trim()) && !rules.customerName(cust.customerName.trim()) && !rules.nationalId(cust.nationalId.trim());
  const detailsDone = Boolean(branchId && employeeId && DAY.test(date));
  const itemsDone = lines.length > 0 && rows.length === lines.length;
  const base = makingBase(rows);
  const d = may ? readDiscount(kind, disc, base) : { value: 0, invalid: false, tooBig: false, sent: undefined };   // base = the lines' workmanship
  const tot = totalsOf({ lines: rows, discount: d.value, cash, banks });
  const need = { customer: detailsDone, items: detailsDone && customerValid, payment: detailsDone && customerValid && itemsDone };
  // Sections unlock in order and stay open once shown.
  useEffect(() => { setShown((s) => (s.customer === (s.customer || need.customer) && s.items === (s.items || need.items) && s.payment === (s.payment || need.payment) ? s : { customer: s.customer || need.customer, items: s.items || need.items, payment: s.payment || need.payment })); }, [need.customer, need.items, need.payment]);
  const valid = itemsDone && tot.total > 0 && tot.left === 0 && !d.invalid && !d.tooBig;

  const itemOf = (id: string) => items.find((i) => i.id === id);
  const setLine = (i: number, patch: Partial<Line>) => { touch(); setHow(-1); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  const whyText = (why: string) => (why === "incomplete" ? rm("itemIncomplete") : why === "invalid" ? rm("itemInvalid") : why === "noGoldPriceToday" ? sg(tr, "noGoldPriceForDay") : rm("linePriceFailed"));

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
      const p = lineOf(l);
      if (!l.itemId) e[`line${i}Item`] = fe(tr, "required");
      else if (seen.has(l.itemId)) e[`line${i}Item`] = fe(tr, "duplicateItem");
      else if (p && "why" in p) e[`line${i}Item`] = whyText(p.why);
      seen.add(l.itemId);
      if (!qOf(l)) e[`line${i}Quantity`] = String(l.quantity).trim() === "" ? fe(tr, "required") : rm("quantityInvalid");
    });
    const root = sum(lines.map((l) => qOf(l) ?? 0)) > PIECES_MAX ? rm("tooManyPieces") : "";
    Object.assign(e, payErrorTexts(tr, paymentErrors(cash, banks)));
    setErrs(e); setRootErr(root);
    if (Object.keys(e).length || root) { setGeneral(t("common", "couldNotSave", { count: Object.keys(e).length + (root ? 1 : 0) })); return; }
    if (!itemsDone || d.invalid || d.tooBig) return;
    if (tot.left !== 0) { setShort(true); return; }
    setSaving(true);
    const body = {
      branchId, date, employeeId,
      customerName: cust.customerName.trim(), customerPhone: latinNumber(cust.customerPhone.trim()),
      ...(cust.nationalId.trim() ? { nationalId: latinNumber(cust.nationalId.trim()) } : {}),
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: qOf(l) })),
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
    if (err.error.message === "noGoldPriceToday") { setGeneral(sg(tr, "noGoldPriceForDay")); return; }
    const v = err.error.values ?? {}, texts = backendFieldErrors(err.error, tr), e: Record<string, string> = {};
    let gen = "", root = "", pay: { total: number; paid: number } | null = null;
    for (const f of ((err.error.fields ?? []) as { field: string; message?: string }[])) {
      let r: RegExpExecArray | null;
      const payKey = paymentKeyOf(f.field, banks);
      if (f.field === "payments") pay = { total: Number(v.total ?? 0), paid: Number(v.paid ?? 0) };
      else if (f.field === "lines") root = rm("tooManyPieces");
      else if (payKey) e[payKey] = texts[f.field];
      else if ((r = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field))) e[`line${r[1]}${r[2] === "itemId" ? "Item" : "Quantity"}`] = r[2] === "quantity" ? rm("quantityInvalid") : f.message === "duplicateItem" ? fe(tr, "duplicateItem") : whyText(f.message ?? "invalid");
      else if (["branchId", "employeeId", "date", "customerName", "customerPhone", "nationalId"].includes(f.field)) e[f.field] = texts[f.field];
      else gen = texts[f.field] ?? tr.errorText(err.error);
    }
    if (!Object.keys(e).length && !pay && !root && !gen) gen = tr.errorText(err.error);   // no field named: say it once
    setErrs(e); setPayRefusal(pay); setRootErr(root); setGeneral(gen);
    if (pay || Object.keys(e).some((k) => k.startsWith("line"))) setPriced({});   // the item or the gold price may have changed: ask the prices again
  }

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
            <DatePicker id="f-date" name="date" value={date} onChange={(v) => { touch(); setHow(-1); setDate(v || date); }} disabled={isUser} required />{err("date")}</div>
          <div className="field" data-k="employeeId"><label htmlFor="employeeId">{rm("employee")} *</label>
            {isUser ? <Input disabled value={me?.name ?? ""} readOnly />
              : <Choice tr={tr} id="employeeId" options={users.map((u) => [u.id, u.name ?? u.username ?? u.id])} value={employeeId} onChange={(v) => { touch(); setEmployeeId(v); }} />}{err("employeeId")}</div>
        </div>
      </div>
      {shown.customer && <div className="card" id="sec-customer"><h3>{sg(tr, "customer")}</h3>
        <CustomerBoxes tr={tr} v={cust} set={(k, val) => { touch(); setCust((c) => ({ ...c, [k]: val })); }} errors={errs} /></div>}
      {shown.items && <div className="card" id="sec-items"><h3>{rm("items")}</h3><div className="help">{rm("itemsNote")}</div>
        <div className="field" data-k="lines"><div id="lineRows" style={{ marginTop: 10 }}>
          {lines.map((l, i) => {
            const it = itemOf(l.itemId), p = lineOf(l), ok = okOf(l);
            const parts = ok && it ? { perGram: pricePerGram({ sellPrice: ok.goldPrice21k, silverPrice: null }, String(it.karat)), weightMg: Number(it.weight ?? 0), workPerGram: typedHundredths(it.workmanshipValue) ?? BigInt(0), count: qOf(l) ?? 1 } : null;
            return (
              <div className="formgrid" data-line={i} key={i} style={{ marginBottom: 10 }}>
                <div className="field" data-k={`line${i}Item`} data-err={errs[`line${i}Item`] ? "" : undefined}><label htmlFor={`it${i}`}>{rm("itemNumber", { number: String(i + 1) })} *</label>
                  <Choice tr={tr} id={`it${i}`} options={items.map((x) => [x.id, `${x.itemName} · ${x.karat ?? ""}`])} value={l.itemId} onChange={(v) => setLine(i, { itemId: v })} />
                  <div className="help" data-karat={i}>{it?.karat ? sg(tr, "karatOf", { karat: it.karat }) : ""}</div>{err(`line${i}Item`)}</div>
                <div className="field" data-k={`line${i}Quantity`} data-err={errs[`line${i}Quantity`] ? "" : undefined}><label htmlFor={`iq${i}`}>{rm("quantity")} *</label>
                  <Input id={`iq${i}`} data-q={i} dir="ltr" inputMode="numeric" maxLength={3} autoComplete="off" value={l.quantity} style={ltrStyle} onChange={(e) => setLine(i, { quantity: e.target.value })} />{err(`line${i}Quantity`)}</div>
                <div className="field" data-k={`line${i}Price`}><span className="flabel" id={`ipl${i}`}>{rm("linePrice")}</span>
                  <output id={`ip${i}`} data-p={i} className="price-out" aria-labelledby={`ipl${i}`} aria-live="polite">
                    {ok && parts ? <PriceButton tr={tr} id={`l${i}`} price={ok.linePrice} parts={parts} open={how === i} onToggle={() => setHow(how === i ? -1 : i)} />
                      : <span className="mute">{p && "loading" in p ? t("common", "loading") : "—"}</span>}
                  </output>
                  {ok ? <div className="help">{rm("priceOfDay", { date: String(ok.priceDate).slice(0, 10) })}</div>
                    : p && "why" in p ? <ErrBox>{whyText(p.why)}</ErrBox> : <div className="help">{rm("priceBySystem")}</div>}
                  {how === i && ok && parts && <Breakdown tr={tr} id={`l${i}`} parts={parts} price={ok.linePrice} />}
                </div>
                {lines.length > 1 && <div style={{ alignSelf: "end" }}><Button size="sm" danger data-rmline={i} aria-label={rm("removeItem", { number: String(i + 1) })} onClick={() => { touch(); setErrs({}); setHow(-1); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{rm("remove")}</Button></div>}
              </div>
            );
          })}
        </div>{rootErr && <ErrBox>{rootErr}</ErrBox>}</div>
        <Button size="sm" data-addline aria-disabled={lines.length >= LINES_MAX} onClick={() => { if (lines.length < LINES_MAX) setLines((ls) => [...ls, blankLine()]); }}>{rm("addItem")}</Button>
      </div>}
      {shown.payment && <div className="card" id="sec-payment"><h3>{rm("payment")} <small>{rm("paymentNote")}</small></h3>
        <PaymentBlock tr={tr} cash={cash} onCash={(v) => { touch(); setCash(v); setErrs(withoutPayErrors); }} banks={banks} onBanks={(b) => { touch(); setBanks(b); setErrs(withoutPayErrors); }} accounts={accountOptions(accounts)} errors={errs} />
        <div className="field" data-k="cashDiscount" style={{ maxWidth: 420, marginTop: 14 }}><label htmlFor="cashDiscount">{sg(tr, "cashDiscount")}</label>
          <DiscountBox tr={tr} may={may} kind={kind} disc={disc} onKind={(k) => { touch(); setKind(k); }} onDisc={(v) => { touch(); setDisc(v); }}
            help={sg(tr, "cashDiscountHint", { max: piastresText(base) })} error={d.tooBig ? <ErrBox>{sg(tr, "cashDiscountAbove", { max: piastresText(base) })}</ErrBox> : d.invalid ? <ErrBox>{sg(tr, "cashDiscountInvalid")}</ErrBox> : null} /></div>
        <TotalsBar tr={tr} bar={tot} />
        <div id="payMsg">{short && tot.left !== 0 ? <ErrBox>{tot.left > 0 ? sg(tr, "paidShort", { left: piastresText(tot.left) }) : sg(tr, "paidOver", { over: piastresText(-tot.left) })}</ErrBox>
          : payRefusal ? <div className="note warn" role="alert"><b>{rm("paidInvalid", { paid: piastresText(payRefusal.paid), total: piastresText(payRefusal.total) })}</b></div> : null}</div>
      </div>}
      {shown.payment && <div className="formbar" id="sec-save">
        <Button type="submit" variant="primary" aria-disabled={!valid || saving} style={{ opacity: valid && !saving ? undefined : 0.6 }}>{saving ? t("common", "saving") : t("common", "save")}</Button>
        <Button id="cancelRsv" onClick={close}>{t("common", "cancel")}</Button>
        {!(valid && !saving) && <span className="help" role="status">{saving ? t("common", "savingNote") : rm("saveWaits")}</span>}
      </div>}
    </form>
  );
}
