"use client";
// Buy a returned piece (owner, 2026-11-05): a piece a customer brings back is BOUGHT from them. The form takes the branch, the item and the
// count; the price is the backend's (GET /customer-pieces/buy-price, shown as a preview: nobody types a price, a weight or a karat) and is
// paid in full by cash and any number of bank rows (POST /customer-pieces). The answer is one purchase document with its pieces and labels.
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { esc, milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { Icon, toast } from "@/components/engine";
import { Button } from "@/components/ui";
import { CopyButton } from "@/components/shell/copy-button";
import { useMe } from "@/lib/session";
import { Choice, ErrBox, TextBox, allPages, code6, fe, sg } from "./sales-form-parts";
import { itemProblem } from "./purchases-rules";
import { PaymentBlock, accountOptions, blankBank, payErrorTexts, withoutPayErrors } from "./payment-block";
import { paymentKeyOf } from "./sales-invoices-math";
import { ITEMS_MAX, TEXT_MAX, blankItem, customerLabelHtml, previewLines, previewTotals, readItems, readPiece, remainingToPay, type BuyPrice, type CustomerLabel, type PieceForm } from "./customer-pieces-rules";
import { revealFirstError } from "@/lib/submit-guard";
import { profileItem } from "@/components/ui/label-print";
import { writePrinterLabels } from "@/components/ui/PrinterLabel";
import { loadPrintProfile } from "./label-settings";
import { profileForPrint, settingsFromProfile } from "./printer-label-rules";

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
    const [l, saved] = await Promise.all([label, loadPrintProfile()]);
    // A returned piece is always a QR label: on the tag roll it takes the look saved from the Test printer (same renderer as that page).
    const profile = profileForPrint(layout, saved, ["qr"]);
    if (profile && w) {
      try { writePrinterLabels(w, settingsFromProfile(profile), [profileItem(tr, l)], { title, print: t("common", "print"), rtl: isAr }); return; } catch { /* the old label below */ }
    }
    page(`<div class="bar"><b>${esc(title)} · <span dir="ltr">${esc(l.pieceCode)}</span></b><button onclick="print()">${esc(t("common", "print"))}</button></div><main>${customerLabelHtml(l, tr, layout)}</main>`);
  } catch (e) {
    w?.close();
    throw e;
  }
}

const blank: PieceForm = { branchId: "", items: [blankItem()], description: "", customerName: "", customerPhone: "", cash: "", banks: [blankBank()] };
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

  // The price preview follows the items and their counts (the same code as the save). A slower answer for an earlier choice must not overwrite the current one.
  // It waits until every row has an item and a count; the same item twice waits too (the Save refuses it, and says which row).
  const asked = readItems(v.items);
  const twice = new Set(v.items.map((row) => row.itemId)).size !== v.items.length;
  const askKey = asked && !twice ? JSON.stringify(asked) : "";
  const setItem = (i: number, patch: Partial<PieceForm["items"][number]>) => set({ items: v.items.map((row, j) => (j === i ? { ...row, ...patch } : row)) });
  const itemName = (id: string) => String(items?.find((it) => it.id === id)?.itemName ?? "");
  // The item's weight in whole milligrams (one piece), from the items list; null while unknown.
  const itemWeight = (id: string): number | null => { const w = items?.find((it) => it.id === id)?.weight; return w === undefined || w === null || w === "" ? null : Number(w); };
  const preview: Preview = !askKey ? { state: "none" } : answer?.key === askKey ? answer.result : { state: "loading" };
  useEffect(() => {
    if (!askKey) return;
    let stale = false;
    api("/customer-pieces/buy-price", { query: { items: askKey } }).then((price) => { if (!stale) setAnswer({ key: askKey, result: { state: "ok", price: price as BuyPrice } }); }, (err) => {
      if (stale) return;
      const e = err instanceof ApiFailure ? err.error : { message: "serverUnreachable" };
      const field = (Array.isArray(e.fields) ? e.fields : []).find((f: { field: string }) => /^items\.\d+\.itemId$/.test(f.field)) as { field: string; message?: string } | undefined;
      const name = String(e.values?.itemName ?? itemName(asked?.[Number(field?.field.split(".")[1])]?.itemId ?? "") ?? "");
      const text = e.message === "noGoldPriceToday" ? cp(tr, "noGoldPrice") : e.message === "itemInactive" ? cp(tr, field?.message === "incomplete" ? "itemIncomplete" : "itemInactive", { item: name }) : tr.errorText(e);
      setAnswer({ key: askKey, result: { state: "refused", text } });
    });
    return () => { stale = true; };
  }, [askKey]);   // eslint-disable-line react-hooks/exhaustive-deps -- the item, the count, tr and items only build the request and word the refusal
  const total = preview.state === "ok" ? preview.price.total : null;

  // A refusal goes under its field, in words; anything else is the banner.
  const refusal = (err: ApiFailure) => {
    const fields = (Array.isArray(err.error.fields) ? err.error.fields : []) as { field: string; message: string }[];
    const out: Record<string, string> = {};
    if (err.error.message === "noGoldPriceToday") { setBanner(cp(tr, "noGoldPrice")); return; }
    if (err.error.message === "itemInactive") {
      const bad = fields.find((f) => /^items\.\d+\.itemId$/.test(f.field));
      const row = Number(bad?.field.split(".")[1] ?? 0);
      out[bad?.field ?? "items.0.itemId"] = cp(tr, bad?.message === "incomplete" ? "itemIncomplete" : "itemInactive", { item: String(err.error.values?.itemName ?? itemName(v.items[row]?.itemId ?? "")) });
    }
    for (const f of fields) {
      const pay = paymentKeyOf(f.field, v.banks);
      if (pay && err.error.values?.total !== undefined) out.sum = cp(tr, "payMismatch", { total: piastresText(err.error.values.total), paid: piastresText(err.error.values.paid) });
      else if (pay) out[pay] = fe(tr, f.message === "duplicateAccount" ? "duplicateAccount" : f.message === "required" ? "required" : "invalid");
      else if (/^items\.\d+\.itemId$/.test(f.field)) { if (!out[f.field]) out[f.field] = cp(tr, "itemInvalid"); }
      else if (/^items\.\d+\.quantity$/.test(f.field)) out[f.field] = cp(tr, "quantityInvalid");
      else if (f.field === "items") out.items = L("اختر كل صنف مرة واحدة، ولا تزيد القطع كلها عن 100.", "Pick each item once, and keep all the pieces together to 100 or fewer.");
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
    const words = (k: string, key: string) => (key === "itemTwice" ? L("هذا الصنف مكرر: زد عدده بدل تكراره.", "This item is already in the list: raise its count instead.") : key === "tooManyPieces" ? L("اختر كل صنف مرة واحدة، ولا تزيد القطع كلها عن 100.", "Pick each item once, and keep all the pieces together to 100 or fewer.") : k === "sum" ? cp(tr, key === "noPrice" ? "payNoPrice" : "payMismatch", { total: piastresText(total), paid: piastresText(paid) }) : key === "phoneInvalid" ? cp(tr, "phoneInvalid") : key === "quantityInvalid" ? cp(tr, "quantityInvalid") : fe(tr, key));
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
        {((saved.lines ?? []) as Row[]).map((line, i) => (
          <div key={line.itemId ?? i} data-saved-line={i} className="saved-line">
            <div className="kv"><span>{cp(tr, "item")}</span><span>{line.itemName}</span></div>
            <div className="kv"><span>{cp(tr, "karat")}</span><span dir="ltr">{line.karat}</span></div>
            <div className="kv"><span>{cp(tr, "weight")}</span><span dir="ltr">{milligramsText(line.weight)}</span></div>
            <div className="kv"><span>{cp(tr, "quantity")}</span><span dir="ltr">{line.quantity}</span></div>
            <div className="kv"><span>{cp(tr, "total")}</span><span dir="ltr">{piastresText(line.total)}</span></div>
          </div>
        ))}
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
  const left = total === null ? null : remainingToPay(total, v.cash, v.banks);
  const pv = preview.state === "ok" ? previewTotals(preview.price) : null;
  return (
    <form id="cp" className="bpr" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); save(); }}>
      {banner && <div className="note warn" role="alert" id="cp-alert" data-field-error>{banner}</div>}
      <div className="card">
        <p className="help" style={{ marginTop: 0, marginBottom: 10 }}>{cp(tr, "intro")}</p>
        <div className="formgrid">
          {needsBranch && <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}><label htmlFor="branchId">{cp(tr, "branch")} *</label>
            <Choice tr={tr} id="branchId" invalid={!!errs.branchId} options={branches} value={v.branchId ?? ""} onChange={(x) => set({ branchId: x })} />{err("branchId")}</div>}
        </div>
        {v.items.map((row, i) => (
          <div key={i} className="formgrid item-row" data-item-row={i}>
            <div className="field" data-k={`items.${i}.itemId`} data-err={errs[`items.${i}.itemId`] ? "" : undefined}><label htmlFor={`itemId${i}`}>{cp(tr, "item")} {v.items.length > 1 ? i + 1 : ""} *</label>
              <ItemPicker id={`itemId${i}`} name={`itemId${i}`} invalid={!!errs[`items.${i}.itemId`]} items={items ?? []} label={itemText} value={row.itemId} placeholder={sg(tr, "choose")} onChange={(x) => setItem(i, { itemId: x })} />
              {i === 0 && items && !items.length && <div className="help" id="cp-no-items">{cp(tr, "noItems")}</div>}
              {err(`items.${i}.itemId`)}</div>
            <TextBox name={`quantity${i}`} label={`${cp(tr, "quantity")} *`} value={row.quantity} maxLength={3} ltr error={errs[`items.${i}.quantity`]} onChange={(x) => setItem(i, { quantity: x })} />
            {v.items.length > 1 && <div className="field"><Button size="sm" danger data-rmitem={i} aria-label={L(`إزالة الصنف ${i + 1}`, `Remove item ${i + 1}`)} onClick={() => set({ items: v.items.filter((_, j) => j !== i) })}><Icon name="trash" size={15} />{sg(tr, "remove")}</Button></div>}
          </div>
        ))}
        {err("items")}
        {v.items.length < ITEMS_MAX && <div className="add-row"><Button size="sm" id="cp-add-item" data-additem onClick={() => set({ items: [...v.items, blankItem()] })}><Icon name="plus" size={15} />{L("إضافة صنف آخر", "Add another item")}</Button></div>}
      </div>
      <div className="card" id="cp-preview" data-state={preview.state} aria-live="polite">
        <h3>{cp(tr, "priceTitle")}</h3>
        {preview.state === "none" && <div className="help">{cp(tr, "pricePending")}</div>}
        {preview.state === "loading" && <div className="help">{L("جارٍ التحميل…", "Loading…")}</div>}
        {preview.state === "refused" && <div className="note warn" role="alert" id="cp-preview-error">{preview.text}</div>}
        {pv && preview.state === "ok" && <>
          {preview.price.lines.map((line, i) => {
            const pl = previewLines(line);
            return (
              <div key={line.itemId} data-preview-line={i} className="preview-line">
                {preview.price.lines.length > 1 && <div><b>{itemName(line.itemId)}</b> <span className="help">×</span> <span className="help" dir="ltr">{line.quantity}</span></div>}
                {itemWeight(line.itemId) !== null && <div className="kv"><span>{L("وزن القطعة (جم)", "Weight per piece (g)")}</span><span dir="ltr" data-preview="weight">{milligramsText(itemWeight(line.itemId))}</span></div>}
                {itemWeight(line.itemId) !== null && line.quantity > 1 && <div className="kv"><span>{L("الوزن الإجمالي (جم)", "Total weight (g)")}</span><span dir="ltr" data-preview="totalWeight">{milligramsText(itemWeight(line.itemId)! * line.quantity)}</span></div>}
                <div className="kv"><span>{cp(tr, "buyPerGram")}</span><span dir="ltr" data-preview="buyPerGram">{pl.buyPerGram}</span></div>
                <div className="kv"><span>{cp(tr, "cashbackPerGram")}</span><span dir="ltr" data-preview="cashbackPerGram">{pl.cashbackPerGram}</span></div>
                <div className="kv"><span>{cp(tr, "onePiece")}</span><span dir="ltr" data-preview="onePiece">{pl.onePiece}</span></div>
                {preview.price.lines.length > 1 && <div className="kv"><span>{L("إجمالي الصنف", "Item total")}</span><span dir="ltr" data-preview="lineTotal">{pl.total}</span></div>}
              </div>
            );
          })}
          <div className="kv"><span>{cp(tr, "total")}</span><span dir="ltr"><b data-preview="total">{pv.total}</b></span></div>
          <div className="help">{cp(tr, "priceDate", { date: pv.priceDate })}</div>
        </>}
      </div>
      <div className="card" id="sec-payment">
        <h3>{cp(tr, "payTitle")}</h3>
        <PaymentBlock tr={tr} total={total ?? undefined} cash={v.cash} sumLabel={cp(tr, "paid")} onCash={(x) => set({ cash: x })} banks={v.banks} onBanks={(b) => set({ banks: b })} accounts={accountOptions(accounts)} errors={errs} />
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
