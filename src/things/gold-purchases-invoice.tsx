"use client";
// The purchase invoice as a full page (forms.create / forms.edit): number, branch, date, lines, totals. Port of gold-purchases-invoice.js.
// The backend gives the number (per branch and year) and the weights. A line's weight is the item weight x the count, read only (one source: the Items screen).
// An invoice is editable only until one line is coded, and for a normal user only 24 hours after the save (admin: any time): the refusals come back as words.
// An Admin or Super admin whose account has no branch picks the branch of a new invoice.
import { useEffect, useRef, useState } from "react";
import { Button, DataTable, Input, Td, Tr } from "@/components/ui";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { dateText, milligramsText, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { toast, Icon } from "@/components/engine";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";
import { DatePicker } from "@/components/fields/DatePicker";
import { Select } from "@/components/fields/Select";
import { loadLookup } from "@/components/fields/useLookup";
import { LINES_MAX, itemProblem, lineWeightOf, readInvoice, totalsOf } from "./purchases-rules";

import { code6 as code6 } from "@/lib/code6";
const itemLabel = (code: unknown, name?: string) => `${code6(code)} · ${name || code6(code)}`;
const FIELD = /^(date|lines\.\d+\.(itemId|quantity))$/;
type Line = { itemId: string; label: string; quantity: string; itemWeight: number | null };
const blank = (): Line => ({ itemId: "", label: "", quantity: "1", itemWeight: null });

/** The items of these ids, read in full (weight, workmanship, Active), by id. One that fails to load is left out. */
// Items read a moment ago are reused (the coding page re-reads them after every save); `fresh` reads them again, for when the answer must be current.
const ITEM_CACHE_MS = 20_000;
const itemCache = new Map<string, { at: number; row: Row }>();
export async function itemsById(ids: string[], fresh = false): Promise<Map<string, Row>> {
  const now = Date.now();
  const rows = await Promise.all([...new Set(ids)].map(async (id) => {
    const hit = itemCache.get(id);
    if (!fresh && hit && now - hit.at < ITEM_CACHE_MS) return hit.row;
    const row = await api(`/items/${id}`).catch(() => null);
    if (row) itemCache.set(id, { at: Date.now(), row }); else itemCache.delete(id);
    return row;
  }));
  return new Map(rows.filter((r): r is Row => !!r).map((r) => [r.id, r]));
}
const milligramsOrEmpty = (mg: number | undefined) => (mg === undefined ? "" : milligramsText(mg));

export function InvoiceForm({ row, close, reload, tr }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-accounts", `purchaseInvoices.${k}`, v);
  const c = (k: string) => t("common", k);
  const { data: me } = useMe();
  const editing = Boolean(row);
  const picksBranch = !editing && !!me && me.userType !== "user";   // an Admin starts on their own branch and may pick another; the Super admin picks one
  const [date, setDate] = useState(editing ? dateText(row!.date) : today());
  const [branchId, setBranchId] = useState(me?.userType === "user" ? "" : (me?.branchId ?? ""));
  const [lines, setLines] = useState<Line[]>(editing ? (row!.lines as Row[]).map((l) => ({ itemId: l.itemId, label: itemLabel(l.itemCode, l.itemName), quantity: String(l.quantity), itemWeight: l.weight % l.quantity === 0 ? l.weight / l.quantity : null })) : [blank()]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<[string, string][]>([]);
  const [choices, setChoices] = useState<[string, string][]>([]);
  const known = useRef(new Map<string, Row>());          // datalist label -> item
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); };   // what is typed after a Save is another Save

  const fieldText = (name: string, key: string, label = "") => {
    const kind = name.split(".").pop();
    if (key === "invalid" && kind === "date") return m("dateInvalid");
    if (key === "invalid" && kind === "quantity") return m("quantityInvalid");
    if (kind === "itemId" && (key === "inactive" || key === "incomplete")) return m(key === "inactive" ? "itemInactive" : "itemIncomplete", { item: label });
    return t("common", `fieldErrors.${key}`);
  };
  const lineErr = (i: number, text?: string) => setErrs((e) => { const n = { ...e }; if (text) n[`lines.${i}.itemId`] = text; else delete n[`lines.${i}.itemId`]; return n; });
  // A chosen item fills the line weight; an inactive or incomplete one is not taken and says why.
  const pick = (l: Line, it: Row | undefined): Line => (it && !itemProblem(it) ? { ...l, itemId: it.id, itemWeight: it.weight } : { ...l, itemId: "", itemWeight: null });
  const problemText = (i: number, label: string, it: Row | undefined) => { const p = it && itemProblem(it); lineErr(i, p ? fieldText(`lines.${i}.itemId`, p, label) : undefined); };

  const branchName = useQuery({ enabled: editing, queryKey: ["branch-name", row?.branchId], queryFn: () => api(`/branches/${row!.branchId}`).then((b) => b.branchName as string) });
  // Editing: the weight follows the item as it is now (the backend works it out the same way on Save).
  useEffect(() => {
    if (!editing) return;
    itemsById((row!.lines as Row[]).map((l) => l.itemId), true).then((items) => {
      setLines((ls) => ls.map((l) => { const it = items.get(l.itemId); return it ? { ...l, itemWeight: it.weight ?? null } : l; }));
      (row!.lines as Row[]).forEach((l, i) => problemText(i, itemLabel(l.itemCode, l.itemName), items.get(l.itemId)));
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (picksBranch) loadLookup({ path: "/branches", value: "id", label: "branchName" }).then((o) => setBranches(o as [string, string][])).catch(() => {}); }, [picksBranch]);
  const next = useQuery({
    enabled: !editing && (!picksBranch || !!branchId), retry: false,
    queryKey: ["next-number", "purchase_invoice", branchId, date.slice(0, 4)],
    queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "purchase_invoice", branchId: branchId || undefined, year: date.slice(0, 4) || undefined } }),
  });

  const search = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchItems = (text: string) => {
    clearTimeout(search.current);
    search.current = setTimeout(async () => {
      try {
        const r = await api("/items", { query: { search: text || undefined, order: "newest", active: "true" } });
        const items = (r.items ?? []) as Row[];
        for (const it of items) known.current.set(itemLabel(it.itemCode, it.itemName), it);
        setChoices(items.filter((it) => !itemProblem(it)).map((it) => [it.id, itemLabel(it.itemCode, it.itemName)]));   // only items with their weight and workmanship are offered
        setLines((ls) => ls.map((l, i) => { if (l.itemId || !known.current.has(l.label)) return l; const it = known.current.get(l.label); problemText(i, l.label, it); return pick(l, it); }));
      } catch { /* the box still takes a typed code or name; the backend refuses an unknown item */ }
    }, 250);
  };
  useEffect(() => () => clearTimeout(search.current), []);

  const setLine = (i: number, patch: Partial<Line>) => { touch(); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l))); };
  const tot = totalsOf(lines);

  async function save() {
    if (saving) return;
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    const r = readInvoice({ date, lines });
    const e = Object.fromEntries(Object.entries(r.errors).map(([k, v]) => [k, fieldText(k, v)]));
    lines.forEach((l, i) => { const it = known.current.get(l.label), p = !l.itemId && it && itemProblem(it); if (p) e[`lines.${i}.itemId`] = fieldText(`lines.${i}.itemId`, p, l.label); });   // why, not just "required"
    if (picksBranch && !branchId) e.branchId = m("branchRequired");
    setBanner(""); setErrs(e);
    if (Object.keys(e).length) { revealFirstError(); return; }
    if (!r.payload) { setBanner(tr.L("راجع بيانات الفاتورة", "Check the invoice details")); revealFirstError(); return; }
    setSaving(true);
    try {
      const body = editing ? { ...r.payload, version: row!.version } : { ...r.payload, ...(picksBranch ? { branchId } : {}) };
      const saved = await api(editing ? `/purchase-invoices/${row!.id}` : "/purchase-invoices", { method: editing ? "PATCH" : "POST", body, saveKey: saveKey.current });
      toast(editing ? m("changesSaved") : m("savedNumber", { code: code6(saved.invoiceNumber) }));
      reload();
    } catch (err) {
      setSaving(false);
      if (!(err instanceof ApiFailure)) { setBanner(tr.errorText({ message: "serverUnreachable" })); revealFirstError(); return; }
      const fields = (Array.isArray(err.error.fields) ? err.error.fields : []) as { field: string; message: string }[];
      const refused = Object.fromEntries(fields.filter((f) => FIELD.test(f.field) || f.field === "branch" || f.field === "branchId")
        .map((f) => [FIELD.test(f.field) ? f.field : "branchId", f.field === "branch" || f.field === "branchId" ? m("branchRequired") : fieldText(f.field, f.message, lines[Number(f.field.split(".")[1])]?.label)]));
      if (Object.keys(refused).length) setErrs(refused); else setBanner(tr.errorText(err.error));
      revealFirstError();   // editWindowClosed, invoiceCoded, notYourInvoice, changedByAnother ...
    }
  }

  const err = (k: string) => errs[k] && <FieldError>{errs[k]}</FieldError>;
  const numberText = editing ? code6(row!.invoiceNumber) : next.data ? code6(next.data.next) : "";
  return (
    <>
      <datalist id="inv-items">{choices.map(([id, l]) => <option key={id} value={l} />)}</datalist>
      <form id="inv" className="card" noValidate onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        {banner && <div id="inv-alert"><div className="note warn" role="alert" data-field-error>{banner}</div></div>}
        <h3>{m("details")}</h3>
        <div className="formgrid">
          <div className="field"><label htmlFor="inv-no">{m("invoiceNumber")}</label>
            <Input id="inv-no" disabled dir="ltr" style={{ textAlign: "start" }} value={numberText} readOnly />
            <div className="help">{editing ? "" : next.data ? c("upcomingNumber") : m("autoHint")}</div></div>
          {editing ? (
            <div className="field"><label htmlFor="inv-branch">{m("branch")}</label><Input id="inv-branch" disabled value={branchName.data ?? ""} readOnly /></div>
          ) : picksBranch ? (
            <div className="field" data-k="branchId" data-err={errs.branchId ? "" : undefined}><label htmlFor="inv-branch-btn">{m("branch")} *</label>
              <Select id="inv-branch" name="inv-branch" value={branchId} options={branches} placeholder={c("choose")} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
          ) : (
            <div className="field"><label>{m("branch")}</label><div className="help">{m("yourBranch")}</div></div>
          )}
          <div className="field" data-k="date" data-err={errs.date ? "" : undefined}><label htmlFor="inv-date-btn">{m("date")} *</label>
            <DatePicker id="inv-date" name="inv-date" value={date} required onChange={(v) => { touch(); setDate(v); }} />{err("date")}</div>
        </div>
      </form>
      <div className="card">
        <h3>{m("lines")} <span className="sub">{m("linesOf", { count: lines.length })}</span></h3>
        <DataTable fixedOrder tableClassName="lines" bodyId="inv-lines" head={[{ label: "#", num: true }, <>{m("item")} *</>, <>{m("quantity")} *</>, m("weight"), ""]}>{lines.map((l, i) => (
            <Tr key={i} data-i={i}>
              <Td num>{i + 1}</Td>
              <Td><div className="field" data-k={`lines.${i}.itemId`} data-err={errs[`lines.${i}.itemId`] ? "" : undefined}>
                <Input data-f="item" list="inv-items" autoComplete="off" aria-label={m("item")} placeholder={m("itemSearchPlaceholder")} value={l.label}
                  onFocus={() => { if (!choices.length) searchItems(""); }}
                  onChange={(ev) => { const label = ev.target.value, it = known.current.get(label); touch(); setLines((ls) => ls.map((x, j) => (j === i ? pick({ ...x, label }, it) : x))); problemText(i, label, it); searchItems(label); }} />{err(`lines.${i}.itemId`)}</div></Td>
              <Td><div className="field" data-k={`lines.${i}.quantity`} data-err={errs[`lines.${i}.quantity`] ? "" : undefined}><Input data-f="quantity" dir="ltr" inputMode="numeric" aria-label={m("quantity")} value={l.quantity} onChange={(ev) => setLine(i, { quantity: ev.target.value })} />{err(`lines.${i}.quantity`)}</div></Td>
              <Td><div className="field"><Input data-f="weight" dir="ltr" readOnly aria-label={m("weight")} aria-describedby="inv-weight-help" placeholder="—" value={milligramsOrEmpty(lineWeightOf(l.itemWeight, l.quantity))} /></div></Td>
              <Td><Button size="sm" data-remove={i} disabled={lines.length === 1} aria-label={m("removeLine", { number: i + 1 })} onClick={() => { touch(); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{m("remove")}</Button></Td>
            </Tr>))}</DataTable>
        <div className="help" id="inv-weight-help" style={{ marginTop: 8 }}>{m("weightFromItem")}</div>
        <div style={{ marginTop: 12 }}><Button id="inv-add" disabled={lines.length >= LINES_MAX} onClick={() => { touch(); setLines((ls) => [...ls, blank()]); }}><Icon name="plus" />{m("addLine")}</Button></div>
      </div>
      <div className="card"><h3>{m("totals")}</h3>
        <div className="totals" id="inv-totals">
          <div className="kv"><span>{m("totalQuantity")}</span><span dir="ltr">{tot.quantity}</span></div>
          <div className="kv"><span>{m("totalWeight")}</span><span dir="ltr">{milligramsText(tot.weight)}</span></div>
        </div></div>
      <div className="formbar">
        <Button variant="primary" id="inv-save" disabled={saving} onClick={save}>{saving ? c("saving") : editing ? c("saveChanges") : c("save")}</Button>
        <Button id="inv-cancel" onClick={close}>{c("cancel")}</Button>
      </div>
    </>
  );
}
