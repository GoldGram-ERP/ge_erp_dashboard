"use client";
// Enter a returned piece (issue #4): a piece a customer brought that we did not sell enters our stock at no cost and gets its label in one step.
// The form sends category, item, description, customer name and phone (POST /customer-pieces, backend #167); karat, weight and workmanship
// per gram are the item's, shown read only. Save opens the print window straight from the click and fills it with the label the answer holds.
import { useEffect, useRef, useState } from "react";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { esc, milligramsText } from "@/lib/format";
import type { Tr } from "@/lib/t";
import { toast } from "@/components/engine";
import { Choice, ErrBox, TextBox, allPages, code6, fe } from "./sales-form-parts";
import { itemProblem } from "./purchases-rules";
import { TEXT_MAX, customerLabelHtml, readPiece, type CustomerLabel, type PieceForm } from "./customer-pieces-rules";

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

const blank: PieceForm = { categoryId: "", itemId: "", description: "", customerName: "", customerPhone: "" };
const itemText = (it: Row) => `${code6(it.itemCode)} · ${it.itemName}`;

export function CustomerPieceForm({ close, reload, tr }: CustomFormProps) {
  const { t, L } = tr;
  const c = (k: string) => t("common", k);
  const [v, setV] = useState<PieceForm>(blank);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Row | null>(null);
  const [categories, setCategories] = useState<[string, string][]>([]);
  const [loaded, setLoaded] = useState<{ categoryId: string; items: Row[] } | null>(null);
  const items = loaded && loaded.categoryId === v.categoryId ? loaded.items : null;       // null = no category yet, or its items still loading
  const saveKey = useRef(newSaveKey());
  const set = (k: keyof PieceForm, val: string) => { saveKey.current = newSaveKey(); setV((o) => ({ ...o, [k]: val })); setErrs((e) => { const n = { ...e }; delete n[k]; return n; }); };

  useEffect(() => { allPages("/categories").then((r) => setCategories(r.map((x) => [x.id, x.categoryName]))).catch(() => { /* the field says required */ }); }, []);
  // The items of the category: only those switched on and complete are offered (the backend refuses the others with itemInactive).
  useEffect(() => {
    const categoryId = v.categoryId;
    if (!categoryId) return;
    allPages("/items", { categoryId, active: "true" }).then((r) => r.filter((it) => !itemProblem(it)), () => [] as Row[]).then((list) => setLoaded({ categoryId, items: list }));
  }, [v.categoryId]);
  const item = items?.find((it) => it.id === v.itemId);

  // A refusal goes under its field, in words; anything else is the banner.
  const refusal = (err: ApiFailure) => {
    const fields = (Array.isArray(err.error.fields) ? err.error.fields : []) as { field: string; message: string }[];
    const named = items?.find((it) => it.id === v.itemId);
    const itemName = String(err.error.values?.itemName ?? named?.itemName ?? "");
    const out: Record<string, string> = {};
    for (const f of fields) {
      if (f.field === "categoryId") out.categoryId = cp(tr, "categoryInvalid");
      else if (f.field === "itemId") out.itemId = f.message === "inactive" ? cp(tr, "itemInactive", { item: itemName }) : f.message === "incomplete" ? cp(tr, "itemIncomplete", { item: itemName }) : cp(tr, "itemInvalid");
      else if (f.field === "customerPhone") out.customerPhone = cp(tr, "phoneInvalid");
      else if (f.field === "description" || f.field === "customerName") out[f.field] = fe(tr, f.message === "maxLength" ? "tooLong" : "required");
      else if (f.field === "branch") setBanner(cp(tr, "branchInvalid"));
    }
    if (Object.keys(out).length) setErrs(out);
    else if (!fields.some((f) => f.field === "branch")) setBanner(tr.errorText(err.error));
  };

  function save() {
    if (saving) return;
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const r = readPiece(v);
    setBanner("");
    setErrs(Object.fromEntries(Object.entries(r.errors).map(([k, key]) => [k, key === "phoneInvalid" ? cp(tr, "phoneInvalid") : fe(tr, key)])));
    if (!r.payload) return;
    setSaving(true);
    const answer = api("/customer-pieces", { method: "POST", body: r.payload, saveKey: saveKey.current });
    // the window opens now, inside the click; it shows the label once the answer is in
    openLabelPrint(tr, answer.then((x) => x.label as CustomerLabel)).catch(() => { /* said below */ });
    answer.then((x) => {
      saveKey.current = newSaveKey();
      setSaved(x);
      toast(cp(tr, "saved", { code: x.code }));
      reload();
    }, (err) => {
      // a refusal ends the attempt (the next Save is a new one); a lost or failed answer keeps its key, so a retry cannot save twice
      if (err instanceof ApiFailure && !err.unreachable && err.status < 500) { saveKey.current = newSaveKey(); refusal(err); }
      else setBanner(tr.errorText(err instanceof ApiFailure && !err.unreachable ? err.error : { message: "serverUnreachable" }));
    }).finally(() => setSaving(false));
  }

  const err = (k: string) => errs[k] && <ErrBox>{errs[k]}</ErrBox>;
  if (saved) {
    return (
      <div className="card" id="cp-saved" role="status">
        <h3>{cp(tr, "saved", { code: saved.code })}</h3>
        <div className="kv"><span>{cp(tr, "category")}</span><span>{saved.categoryName}</span></div>
        <div className="kv"><span>{cp(tr, "item")}</span><span>{saved.itemName}</span></div>
        <div className="kv"><span>{cp(tr, "karat")}</span><span dir="ltr">{saved.karat}</span></div>
        <div className="kv"><span>{cp(tr, "weight")}</span><span dir="ltr">{milligramsText(saved.weight)}</span></div>
        <div className="formbar">
          <button type="button" className="btn primary" id="cp-print" onClick={() => { openLabelPrint(tr, saved.label).catch(() => {}); }}>{cp(tr, "printAgain")}</button>
          <button type="button" className="btn quiet" id="cp-another" onClick={() => { setSaved(null); setV(blank); }}>{cp(tr, "another")}</button>
          <button type="button" className="btn quiet" id="cp-done" onClick={close}>{L("تم", "Done")}</button>
        </div>
      </div>
    );
  }
  const itemOptions: [string, string][] = (items ?? []).map((it) => [it.id, itemText(it)]);
  return (
    <form id="cp" className="card" noValidate aria-busy={saving} onSubmit={(ev) => { ev.preventDefault(); save(); }}>
      {banner && <div className="note warn" role="alert" id="cp-alert">{banner}</div>}
      <p className="help" style={{ marginTop: 0 }}>{cp(tr, "intro")}</p>
      <div className="formgrid">
        <div className="field" data-k="categoryId"><label htmlFor="categoryId">{cp(tr, "category")} *</label>
          <Choice tr={tr} id="categoryId" options={categories} value={v.categoryId} onChange={(x) => { set("categoryId", x); set("itemId", ""); }} />{err("categoryId")}</div>
        <div className="field" data-k="itemId"><label htmlFor="itemId">{cp(tr, "item")} *</label>
          <Choice tr={tr} id="itemId" options={itemOptions} value={v.itemId} disabled={!v.categoryId} placeholder={!v.categoryId ? cp(tr, "chooseCategoryFirst") : undefined} onChange={(x) => set("itemId", x)} />
          {v.categoryId && items && !items.length && <div className="help" id="cp-no-items">{cp(tr, "noItems")}</div>}
          {err("itemId")}</div>
      </div>
      <div className="formgrid" id="cp-from-item">
        <div className="field"><label htmlFor="cp-karat">{cp(tr, "karat")}</label><input id="cp-karat" dir="ltr" readOnly aria-describedby="cp-from-item-help" placeholder="—" value={item?.karat ?? ""} /></div>
        <div className="field"><label htmlFor="cp-weight">{cp(tr, "weight")}</label><input id="cp-weight" dir="ltr" readOnly aria-describedby="cp-from-item-help" placeholder="—" value={item ? milligramsText(item.weight) : ""} /></div>
        <div className="field"><label htmlFor="cp-workmanship">{cp(tr, "workmanship")}</label><input id="cp-workmanship" dir="ltr" readOnly aria-describedby="cp-from-item-help" placeholder="—" value={item?.workmanshipValue ?? ""} /></div>
      </div>
      <div className="help" id="cp-from-item-help">{cp(tr, "fromItem")}</div>
      <div className="formgrid" style={{ marginTop: 12 }}>
        <TextBox name="description" label={`${cp(tr, "description")} *`} help={cp(tr, "descriptionHelp")} value={v.description} maxLength={TEXT_MAX} error={errs.description} onChange={(x) => set("description", x)} />
        <TextBox name="customerName" label={`${cp(tr, "customerName")} *`} value={v.customerName} maxLength={TEXT_MAX} error={errs.customerName} onChange={(x) => set("customerName", x)} />
        <TextBox name="customerPhone" label={`${cp(tr, "customerPhone")} *`} help={cp(tr, "phoneHelp")} value={v.customerPhone} maxLength={15} ltr error={errs.customerPhone} onChange={(x) => set("customerPhone", x)} />
      </div>
      <div className="note" style={{ marginTop: 12 }}>{cp(tr, "noCost")}</div>
      <div className="formbar">
        <button type="submit" className="btn primary" id="cp-save" disabled={saving}>{saving ? c("saving") : cp(tr, "saveAndPrint")}</button>
        <button type="button" className="btn quiet" id="cp-cancel" onClick={close}>{c("cancel")}</button>
      </div>
    </form>
  );
}
