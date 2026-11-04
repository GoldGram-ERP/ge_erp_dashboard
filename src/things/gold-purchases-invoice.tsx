"use client";
// The purchase invoice as a full page (forms.create / forms.edit): number, branch, date, lines, totals. Port of gold-purchases-invoice.js.
// The backend gives the number (per branch and year) and works the real totals out; the totals shown while typing are the quantity and the typed weights.
// An invoice is editable only until one line is coded, and for a normal user only 24 hours after the save (admin: any time): the refusals come back as words.
// An Admin or Super admin whose account has no branch picks the branch of a new invoice.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { dateText, milligramsInput, milligramsText, today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { toast, Icon } from "@/components/engine";
import { DatePicker } from "@/components/fields/DatePicker";
import { Select } from "@/components/fields/Select";
import { loadLookup } from "@/components/fields/useLookup";
import { LINES_MAX, readInvoice, totalsOf } from "./purchases-rules";

const code6 = (n: unknown) => String(n).padStart(6, "0");
const itemLabel = (code: unknown, name?: string) => `${code6(code)} · ${name || code6(code)}`;
const FIELD = /^(date|lines\.\d+\.(itemId|quantity|weight))$/;
type Line = { itemId: string; label: string; quantity: string; weight: string };
const blank = (): Line => ({ itemId: "", label: "", quantity: "1", weight: "" });
const ERR = { color: "var(--warn)", fontSize: 12.5, marginTop: 4 } as const;

export function InvoiceForm({ row, close, reload, tr }: CustomFormProps) {
  const { t } = tr;
  const m = (k: string, v?: Record<string, string | number>) => t("gold-accounts", `purchaseInvoices.${k}`, v);
  const c = (k: string) => t("common", k);
  const { data: me } = useMe();
  const editing = Boolean(row);
  const picksBranch = !editing && !!me && me.userType !== "user" && !me.branchId;
  const [date, setDate] = useState(editing ? dateText(row!.date) : today());
  const [branchId, setBranchId] = useState("");
  const [lines, setLines] = useState<Line[]>(editing ? (row!.lines as Row[]).map((l) => ({ itemId: l.itemId, label: itemLabel(l.itemCode, l.itemName), quantity: String(l.quantity), weight: milligramsInput(l.weight) })) : [blank()]);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);
  const [branches, setBranches] = useState<[string, string][]>([]);
  const [choices, setChoices] = useState<[string, string][]>([]);
  const known = useRef(new Map<string, string>());       // datalist label -> item id
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); };   // what is typed after a Save is another Save

  const fieldText = (name: string, key: string) => {
    const kind = name.split(".").pop();
    if (key === "invalid" && kind === "date") return m("dateInvalid");
    if (key === "invalid" && kind === "quantity") return m("quantityInvalid");
    if (key === "invalid" && kind === "weight") return m("weightInvalid");
    return t("common", `fieldErrors.${key}`);
  };

  const branchName = useQuery({ enabled: editing, queryKey: ["branch-name", row?.branchId], queryFn: () => api(`/branches/${row!.branchId}`).then((b) => b.branchName as string) });
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
        const r = await api("/items", { query: { search: text || undefined, order: "newest" } });
        const items = (r.items ?? []) as Row[];
        for (const it of items) known.current.set(itemLabel(it.itemCode, it.itemName), it.id);
        setChoices(items.map((it) => [it.id, itemLabel(it.itemCode, it.itemName)]));
        setLines((ls) => ls.map((l) => (!l.itemId && known.current.has(l.label) ? { ...l, itemId: known.current.get(l.label)! } : l)));
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
    if (picksBranch && !branchId) e.branchId = m("branchRequired");
    setBanner(""); setErrs(e);
    if (Object.keys(e).length || !r.payload) return;
    setSaving(true);
    try {
      const body = editing ? { ...r.payload, version: row!.version } : { ...r.payload, ...(picksBranch ? { branchId } : {}) };
      const saved = await api(editing ? `/purchase-invoices/${row!.id}` : "/purchase-invoices", { method: editing ? "PATCH" : "POST", body, saveKey: saveKey.current });
      toast(editing ? m("changesSaved") : m("savedNumber", { code: code6(saved.invoiceNumber) }));
      reload();
    } catch (err) {
      setSaving(false);
      if (!(err instanceof ApiFailure)) { setBanner(tr.errorText({ message: "serverUnreachable" })); return; }
      const fields = (Array.isArray(err.error.fields) ? err.error.fields : []) as { field: string; message: string }[];
      const refused = Object.fromEntries(fields.filter((f) => FIELD.test(f.field) || f.field === "branch" || f.field === "branchId")
        .map((f) => [FIELD.test(f.field) ? f.field : "branchId", f.field === "branch" || f.field === "branchId" ? m("branchRequired") : fieldText(f.field, f.message)]));
      if (Object.keys(refused).length) setErrs(refused); else setBanner(tr.errorText(err.error));   // editWindowClosed, invoiceCoded, notYourInvoice, changedByAnother ...
    }
  }

  const err = (k: string) => errs[k] && <div className="err" role="alert" style={ERR}>{errs[k]}</div>;
  const numberText = editing ? code6(row!.invoiceNumber) : next.data ? code6(next.data.next) : "";
  return (
    <>
      <datalist id="inv-items">{choices.map(([id, l]) => <option key={id} value={l} />)}</datalist>
      <form id="inv" className="card" noValidate onSubmit={(ev) => { ev.preventDefault(); save(); }}>
        {banner && <div id="inv-alert"><div className="note warn" role="alert">{banner}</div></div>}
        <h3>{m("details")}</h3>
        <div className="formgrid">
          <div className="field"><label htmlFor="inv-no">{m("invoiceNumber")}</label>
            <input id="inv-no" disabled dir="ltr" style={{ textAlign: "start" }} value={numberText} readOnly />
            <div className="help">{editing ? "" : next.data ? c("upcomingNumber") : m("autoHint")}</div></div>
          {editing ? (
            <div className="field"><label htmlFor="inv-branch">{m("branch")}</label><input id="inv-branch" disabled value={branchName.data ?? ""} readOnly /></div>
          ) : picksBranch ? (
            <div className="field" data-k="branchId"><label htmlFor="inv-branch-btn">{m("branch")} *</label>
              <Select id="inv-branch" name="inv-branch" value={branchId} options={branches} placeholder={c("choose")} onChange={(v) => { touch(); setBranchId(v); }} />{err("branchId")}</div>
          ) : (
            <div className="field"><label>{m("branch")}</label><div className="help">{m("yourBranch")}</div></div>
          )}
          <div className="field" data-k="date"><label htmlFor="inv-date-btn">{m("date")} *</label>
            <DatePicker id="inv-date" name="inv-date" value={date} required onChange={(v) => { touch(); setDate(v); }} />{err("date")}</div>
        </div>
      </form>
      <div className="card">
        <h3>{m("lines")} <span className="sub">{m("linesOf", { count: lines.length })}</span></h3>
        <div className="table"><table className="lines">
          <thead><tr><th className="num">#</th><th>{m("item")} *</th><th>{m("quantity")} *</th><th>{m("weight")}</th><th /></tr></thead>
          <tbody id="inv-lines">{lines.map((l, i) => (
            <tr key={i} data-i={i}>
              <td className="num">{i + 1}</td>
              <td><div className="field" data-k={`lines.${i}.itemId`}>
                <input data-f="item" list="inv-items" autoComplete="off" aria-label={m("item")} placeholder={m("itemSearchPlaceholder")} value={l.label}
                  onFocus={() => { if (!choices.length) searchItems(""); }}
                  onChange={(ev) => { const label = ev.target.value; setLine(i, { label, itemId: known.current.get(label) ?? "" }); searchItems(label); }} />{err(`lines.${i}.itemId`)}</div></td>
              <td><div className="field" data-k={`lines.${i}.quantity`}><input data-f="quantity" dir="ltr" inputMode="numeric" aria-label={m("quantity")} value={l.quantity} onChange={(ev) => setLine(i, { quantity: ev.target.value })} />{err(`lines.${i}.quantity`)}</div></td>
              <td><div className="field" data-k={`lines.${i}.weight`}><input data-f="weight" dir="ltr" inputMode="decimal" placeholder="0.000" aria-label={m("weight")} value={l.weight} onChange={(ev) => setLine(i, { weight: ev.target.value })} />{err(`lines.${i}.weight`)}</div></td>
              <td><button type="button" className="btn quiet sm" data-remove={i} disabled={lines.length === 1} aria-label={m("removeLine", { number: i + 1 })} onClick={() => { touch(); setLines((ls) => ls.filter((_, j) => j !== i)); }}>{m("remove")}</button></td>
            </tr>))}</tbody>
        </table></div>
        <div style={{ marginTop: 12 }}><button type="button" className="btn quiet" id="inv-add" disabled={lines.length >= LINES_MAX} onClick={() => { touch(); setLines((ls) => [...ls, blank()]); }}><Icon name="plus" />{m("addLine")}</button></div>
      </div>
      <div className="card"><h3>{m("totals")}</h3>
        <div className="totals" id="inv-totals">
          <div className="kv"><span>{m("totalQuantity")}</span><span dir="ltr">{tot.quantity}</span></div>
          <div className="kv"><span>{m("totalWeight")}</span><span dir="ltr">{milligramsText(tot.weight)}</span></div>
          {tot.weightMissing > 0 && <div className="help" style={{ color: "var(--mute)", fontSize: 12.5 }}>{m("weightHint")}</div>}
        </div></div>
      <div className="formbar">
        <button type="button" className="btn primary" id="inv-save" disabled={saving} onClick={save}>{saving ? c("saving") : editing ? c("saveChanges") : c("save")}</button>
        <button type="button" className="btn quiet" id="inv-cancel" onClick={close}>{c("cancel")}</button>
      </div>
    </>
  );
}
