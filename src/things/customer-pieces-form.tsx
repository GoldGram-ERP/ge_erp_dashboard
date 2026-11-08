"use client";
// Buy a returned piece (owner, 2026-11-05): a piece a customer brings back is BOUGHT from them. The form takes the branch, the item and the
// count; the price is the backend's (GET /customer-pieces/buy-price, shown as a preview: nobody types a price, a weight or a karat) and is
// paid in full by cash and any number of bank rows (POST /customer-pieces). The answer is one purchase document with its pieces and labels.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { esc, milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { Button } from "@/components/ui";
import { CopyButton } from "@/components/shell/copy-button";
import { useMe } from "@/lib/session";
import { Choice, ErrBox, TextBox, allPages, code6, fe } from "./sales-form-parts";
import { itemProblem } from "./purchases-rules";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { paymentKeyOf } from "./sales-invoices-math";
import { TEXT_MAX, customerLabelHtml, previewLines, readPiece, readQuantity, remainingToPay, type BuyPrice, type CustomerLabel, type PieceForm } from "./customer-pieces-rules";
import { revealFirstError } from "@/lib/submit-guard";

const LAYOUT_KEY = "ge-erp.labelLayout";        // the layout the other label prints remember on this device
const cp = (tr: Pick<Tr, "t">, k: string, v?: Record<string, string>) => tr.t("gold-accounts", `customerPieces.${k}`, v);

/** Opens the print window straight from the click (no pop-up blocker objects), shows "Loading…" while the label is on its way, then the label
 *  and its Print button. When `label` fails the window closes and the error goes back to the caller. */
export async function openLabelPrint(tr: Tr, label: CustomerLabel | Promise<CustomerLabel>): Promise<void> {
  const { t, L, isAr } = tr;
  const w = window.open("", "_blank");
  if (!w) toast(L("اسمح بالنوافذ المنبثقة للطباعة.", "Allow pop-ups to print."), { error: true });
  const layout = localStorage.getItem(LAYOUT_KEY) === "a4" ? "a4" : "tag";
  const title = cp(tr, "labelTitle");
  const page = (body: string) => {
    if (!w) return;
    w.document.open();
    w.document.write(`<!doctype html><html lang="${isAr ? "ar" : "en"}" dir="${isAr ? "rtl" : "ltr"}"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{margin:0;background:#e9e4d8;font-family:system-ui,"Segoe UI",Tahoma,sans-serif;color:#1c1912}.bar{display:flex;gap:12px;align-items:center;justify-content:space-between;background:#fff;border-bottom:1px solid #ddd;padding:10px 16px}.bar button{height:34px;padding:0 16px;border-radius:8px;border:0;background:#7a5710;color:#fff;font-weight:600;cursor:pointer}main{padding:24px}main>div{outline:1px dashed #cfc8b4}@media print{.bar{display:none}body{background:#fff}main{padding:0}main>div{outline:0}}@page{size:${layout === "tag" ? "50mm 12mm;margin:0" : "A4;margin:10.7mm 4.7mm"}}</style></head><body>${body}</body></html>`);
    w.document.close();
  };
  page(`<p style="text-align:center;margin-top:40px">${esc(L("جارٍ التحميل…", "Loading…"))}</p>`);
  try {
    const l = await label;
    page(`<div class="bar"><b>${esc(title)} · <span dir="ltr">${esc(l.pieceCode)}</span></b><button onclick="print()">${esc(t("common", "print"))}</button></div><main>${customerLabelHtml(l, tr, layout)}</main>`);
  } catch (e) {
    w?.close();
    throw e;
  }
}

const blank: PieceForm = { branchId: "", itemId: "", quantity: "1", description: "", customerName: "", customerPhone: "", cash: "", banks: [blankBank()] };
const itemText = (it: Row) => `${code6(it.itemCode)} · ${it.itemName}`;
type Preview = { state: "none" } | { state: "loading" } | { state: "ok"; price: BuyPrice } | { state: "refused"; text: string };
type Answer = { key: string; result: Exclude<Preview, { state: "none" | "loading" }> };
const PAY_KEY = /^(cash|bank\d+(Account|Amount))$/;

export function CustomerPieceForm({ close, tr }: CustomFormProps) {
  const qc = useQueryClient();
  const { t, L } = tr;
  const c = (k: string) => t("common", k);
  const { data: me } = useMe();
  // The Super admin has every branch (and every future one); an Admin is assigned one but may oversee the others and change it. Both choose
  // the branch, as on an expense (an Admin starts on their own). A plain User has one, which the backend uses.
  const needsBranch = !!me && me.userType !== "user";
  const [branches, setBranches] = useState<[string, string][]>([]);
  const [accounts, setAccounts] = useState<Row[]>([]);
  const [items, setItems] = useState<Row[] | null>(null);
  const [v, setV] = useState<PieceForm>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Row | null>(null);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const saveKey = useRef(newSaveKey());
  const set = (patch: Partial<PieceForm>) => {
    saveKey.current = newSaveKey();
    setV((o) => ({ ...o, ...patch }));
    setErrs((e) => { const n = withoutPayErrors(e); delete n.sum; for (const k of Object.keys(patch)) delete n[k]; return n; });
  };

  useEffect(() => {
    if (!needsBranch) return;
    allPages("/branches").then((r) => { setBranches(r.map((x) => [x.id, x.branchName])); setV((o) => (o.branchId ? o : { ...o, branchId: r.length === 1 ? r[0].id : String(me?.branchId ?? "") })); }).catch(() => { /* the field says required */ });
  }, [needsBranch, me?.branchId]);
  useEffect(() => { allPages("/bank-accounts").then(setAccounts).catch(() => { /* the bank rows stay empty */ }); }, []);
  // Only the items switched on and complete are offered (the backend refuses the others with itemInactive).
  useEffect(() => { allPages("/items", { active: "true" }).then((r) => setItems(r.filter((it) => !itemProblem(it))), () => setItems([])); }, []);

  // The price preview follows the item and the count (the same code as the save). A slower answer for an earlier choice must not overwrite the current one.
  const quantity = readQuantity(v.quantity);
  const askKey = v.itemId && quantity !== null ? `${v.itemId}|${quantity}` : "";
  const preview: Preview = !askKey ? { state: "none" } : answer?.key === askKey ? answer.result : { state: "loading" };
  useEffect(() => {
    if (!askKey) return;
    let stale = false;
    api("/customer-pieces/buy-price", { query: { itemId: v.itemId, quantity } }).then((price) => { if (!stale) setAnswer({ key: askKey, result: { state: "ok", price: price as BuyPrice } }); }, (err) => {
      if (stale) return;
      const e = err instanceof ApiFailure ? err.error : { message: "serverUnreachable" };
      const field = (Array.isArray(e.fields) ? e.fields : []).find((f: { field: string }) => f.field === "itemId") as { message?: string } | undefined;
      const name = String(e.values?.itemName ?? items?.find((it) => it.id === v.itemId)?.itemName ?? "");
      const text = e.message === "noGoldPriceToday" ? cp(tr, "noGoldPrice") : e.message === "itemInactive" ? cp(tr, field?.message === "incomplete" ? "itemIncomplete" : "itemInactive", { item: name }) : tr.errorText(e);
      setAnswer({ key: askKey, result: { state: "refused", text } });
    });
    return () => { stale = true; };
  }, [askKey]);   // eslint-disable-line react-hooks/exhaustive-deps -- the item, the count, tr and items only build the request and word the refusal
  const total = preview.state === "ok" ? preview.price.total : null;

  // A refusal goes under its field, in words; anything else is the banner.
  const refusal = (err: ApiFailure) => {
    const fields = (Array.isArray(err.error.fields) ? err.error.fields : []) as { field: string; message: string }[];
    const itemName = String(err.error.values?.itemName ?? items?.find((it) => it.id === v.itemId)?.itemName ?? "");
    const out: Record<string, string> = {};
    if (err.error.message === "noGoldPriceToday") { setBanner(cp(tr, "noGoldPrice")); return; }
    if (err.error.message === "itemInactive") out.itemId = cp(tr, fields.some((f) => f.message === "incomplete") ? "itemIncomplete" : "itemInactive", { item: itemName });
    for (const f of fields) {
      const pay = paymentKeyOf(f.field, v.banks);
      if (pay && err.error.values?.total !== undefined) out.sum = cp(tr, "payMismatch", { total: piastresText(err.error.values.total), paid: piastresText(err.error.values.paid) });
      else if (pay) out[pay] = fe(tr, f.message === "duplicateAccount" ? "duplicateAccount" : f.message === "required" ? "required" : "invalid");
      else if (f.field === "itemId") { if (!out.itemId) out.itemId = cp(tr, "itemInvalid"); }
      else if (f.field === "quantity") out.quantity = cp(tr, "quantityInvalid");
      else if (f.field === "customerPhone") out.customerPhone = cp(tr, "phoneInvalid");
      else if (f.field === "description" || f.field === "customerName") out[f.field] = fe(tr, "tooLong");
      else if (f.field === "branch") { if (needsBranch) out.branchId = cp(tr, "branchChooseAnother"); else setBanner(cp(tr, "branchInvalid")); }
    }
    if (Object.keys(out).length) setErrs(out);
    else if (!fields.some((f) => f.field === "branch")) setBanner(tr.errorText(err.error));
  };

  function save() {
    if (saving) return;
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const r = readPiece(v, needsBranch, total);
    setBanner("");
    // the payment block's own codes get its words; the sum says what is due and what was typed
    const payCodes = Object.fromEntries(Object.entries(r.errors).filter(([k, key]) => PAY_KEY.test(k) || (k === "sum" && key === "required")));
    const paid = total === null ? 0 : total - remainingToPay(total, v.cash, v.banks);
    const words = (k: string, key: string) => (k === "sum" ? cp(tr, key === "noPrice" ? "payNoPrice" : "payMismatch", { total: piastresText(total), paid: piastresText(paid) }) : key === "phoneInvalid" ? cp(tr, "phoneInvalid") : key === "quantityInvalid" ? cp(tr, "quantityInvalid") : fe(tr, key));
    setErrs({ ...Object.fromEntries(Object.entries(r.errors).filter(([k]) => !(k in payCodes)).map(([k, key]) => [k, words(k, key)])), ...payErrorTexts(tr, payCodes, cp(tr, "amountsRequired")) });
    if (!r.payload) { revealFirstError(); return; }
    setSaving(true);
    api("/customer-pieces", { method: "POST", body: r.payload, saveKey: saveKey.current }).then((x) => {
      saveKey.current = newSaveKey();
      setSaved(x);
      // The page stays on the saved purchase, so `reload` (which closes it) is not used: refresh the cached lists and the next code by hand.
      qc.invalidateQueries({ queryKey: ["thing"] });
      qc.invalidateQueries({ queryKey: ["next-number"] });
      toast(cp(tr, "saved", { number: code6(x.documentNumber) }));
    }, (err) => {
      // a refusal ends the attempt (the next Save is a new one); a lost or failed answer, or a 409 saveInProgress, keeps its key, so a retry cannot save twice
      if (err instanceof ApiFailure && !keepsKey(err)) { saveKey.current = newSaveKey(); refusal(err); }
      else setBanner(tr.errorText(err instanceof ApiFailure && !err.unreachable ? err.error : { message: "serverUnreachable" }));
      revealFirstError();
    }).finally(() => setSaving(false));
  }

  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  if (saved) {
    const pieces = (saved.pieces ?? []) as Row[];
    return (
      <div className="card bpr" id="cp-saved" role="status">
        <h3>{cp(tr, "saved", { number: code6(saved.documentNumber) })}</h3>
        <div className="kv"><span>{cp(tr, "purchaseNumber")}</span><span dir="ltr" data-doc-number>{code6(saved.documentNumber)}</span></div>
        <div className="kv"><span>{cp(tr, "item")}</span><span>{saved.itemName}</span></div>
        <div className="kv"><span>{cp(tr, "karat")}</span><span dir="ltr">{saved.karat}</span></div>
        <div className="kv"><span>{cp(tr, "weight")}</span><span dir="ltr">{milligramsText(saved.weight)}</span></div>
        <div className="kv"><span>{cp(tr, "quantity")}</span><span dir="ltr">{saved.quantity}</span></div>
        <div className="kv"><span>{cp(tr, "total")}</span><span dir="ltr"><b data-saved-total>{piastresText(saved.total)}</b></span></div>
        <h4 style={{ marginBottom: 8 }}>{cp(tr, "piecesTitle")}</h4>
        <ul id="cp-pieces" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {pieces.map((p) => (
            <li key={p.code} data-piece-code={p.code} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b dir="ltr">{p.code}</b><CopyButton text={String(p.code)} />
              <span className="help" dir="ltr">{p.categoryName} · {p.karat} · {milligramsText(p.weight)}</span>
              <Button size="sm" data-print={p.code} aria-label={cp(tr, "reprintCode", { code: p.code })} onClick={() => { openLabelPrint(tr, p.label).catch(() => {}); }}>{cp(tr, "printLabel")}</Button>
            </li>
          ))}
        </ul>
        <div className="formbar">
          <Button id="cp-another" onClick={() => { setSaved(null); setV({ ...blank, branchId: v.branchId, banks: [blankBank()] }); }}>{cp(tr, "another")}</Button>
          <Button variant="primary" id="cp-done" onClick={close}>{L("تم", "Done")}</Button>
        </div>
      </div>
    );
  }
  const itemOptions: [string, string][] = (items ?? []).map((it) => [it.id, itemText(it)]);
  const left = total === null ? null : remainingToPay(total, v.cash, v.banks);
  const pv = preview.state === "ok" ? previewLines(preview.price) : null;
  return (
    <form id="cp" className="bpr" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); save(); }}>
      {banner && <div className="note warn" role="alert" id="cp-alert" data-field-error>{banner}</div>}
      <div className="card">
        <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>{cp(tr, "intro")}</p>
        <div className="formgrid">
          {needsBranch && <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}><label htmlFor="branchId">{cp(tr, "branch")} *</label>
            <Choice tr={tr} id="branchId" invalid={!!errs.branchId} options={branches} value={v.branchId ?? ""} onChange={(x) => set({ branchId: x })} />{err("branchId")}</div>}
          <div className="field" data-k="itemId" data-err={errs.itemId ? "" : undefined}><label htmlFor="itemId">{cp(tr, "item")} *</label>
            <Choice tr={tr} id="itemId" invalid={!!errs.itemId} options={itemOptions} value={v.itemId} onChange={(x) => set({ itemId: x })} />
            {items && !items.length && <div className="help" id="cp-no-items">{cp(tr, "noItems")}</div>}
            {err("itemId")}</div>
          <TextBox name="quantity" label={`${cp(tr, "quantity")} *`} value={v.quantity} maxLength={3} ltr error={errs.quantity} onChange={(x) => set({ quantity: x })} />
        </div>
      </div>
      <div className="card" id="cp-preview" data-state={preview.state} aria-live="polite">
        <h3>{cp(tr, "priceTitle")}</h3>
        {preview.state === "none" && <div className="help">{cp(tr, "pricePending")}</div>}
        {preview.state === "loading" && <div className="help">{L("جارٍ التحميل…", "Loading…")}</div>}
        {preview.state === "refused" && <div className="note warn" role="alert" id="cp-preview-error">{preview.text}</div>}
        {pv && <>
          <div className="kv"><span>{cp(tr, "buyPerGram")}</span><span dir="ltr" data-preview="buyPerGram">{pv.buyPerGram}</span></div>
          <div className="kv"><span>{cp(tr, "cashbackPerGram")}</span><span dir="ltr" data-preview="cashbackPerGram">{pv.cashbackPerGram}</span></div>
          <div className="kv"><span>{cp(tr, "onePiece")}</span><span dir="ltr" data-preview="onePiece">{pv.onePiece}</span></div>
          <div className="kv"><span>{cp(tr, "total")}</span><span dir="ltr"><b data-preview="total">{pv.total}</b></span></div>
          <div className="help">{cp(tr, "priceDate", { date: pv.priceDate })}</div>
        </>}
      </div>
      <div className="card" id="sec-payment">
        <h3>{cp(tr, "payTitle")}</h3>
        <PaymentBlock tr={tr} cash={v.cash} sumLabel={cp(tr, "paid")} onCash={(x) => set({ cash: x })} banks={v.banks} onBanks={(b) => set({ banks: b })} accounts={accountOptions(accounts)} errors={errs} />
        {left !== null && <div className="pay-sum"><span className="help">{cp(tr, "leftToPay")}</span><b dir="ltr" id="payLeft" data-left>{piastresText(left)}</b></div>}
      </div>
      <div className="card">
        <div className="formgrid">
          <TextBox name="customerName" label={cp(tr, "customerName")} value={v.customerName} maxLength={TEXT_MAX} error={errs.customerName} onChange={(x) => set({ customerName: x })} />
          <TextBox name="customerPhone" label={cp(tr, "customerPhone")} help={cp(tr, "phoneHelp")} value={v.customerPhone} maxLength={15} ltr error={errs.customerPhone} onChange={(x) => set({ customerPhone: x })} />
          <TextBox name="description" label={cp(tr, "description")} help={cp(tr, "descriptionHelp")} value={v.description} maxLength={TEXT_MAX} error={errs.description} onChange={(x) => set({ description: x })} />
        </div>
        <div className="formbar">
          <Button type="submit" variant="primary" id="cp-save" disabled={saving}>{saving ? c("saving") : cp(tr, "buy")}</Button>
          <Button id="cp-cancel" onClick={close}>{c("cancel")}</Button>
        </div>
      </div>
    </form>
  );
}
