"use client";
// The two panels of a merchant's record sheet (docs/designs/merchants.md): his account statement with a running balance in money
// and in gold, and his making-charge (مصنعية التاجر) rules. Both are made of library parts only (DataTable, FormFields, Button).
// A balance is always an amount and a word: له (we owe him) or عليه (he owes us); never a bare sign.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, DataTable, Td, Tr as TableRow } from "@/components/ui";
import { Ltr, Section, toast, useConfirm } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { FieldConfig, LookupSpec, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { milligramsText, piastresText } from "@/lib/format";
import type { Tr } from "@/lib/t";

type Bal = { owedPiastres: number; owedKaratMg: number; owed21Mg: number };

/** An amount of money owed, as "1,000.00 له": the word says who owes whom. */
export const moneyOwed = (piastres: number, tr: Tr): ReactNode => (piastres === 0 ? <Ltr>0.00</Ltr> : <><Ltr>{piastresText(Math.abs(piastres))}</Ltr> <span className="mute">{piastres > 0 ? tr.L("له", "we owe") : tr.L("عليه", "he owes")}</span></>);
/** Gold owed, as its 21 karat equivalent: "8.571 جم عيار 21 له". */
export const goldOwed = (owed21Mg: number, tr: Tr): ReactNode => (owed21Mg === 0 ? <Ltr>0.000</Ltr> : <><Ltr>{milligramsText(Math.abs(owed21Mg))}</Ltr> <span className="mute">{tr.L("جم عيار 21", "g 21K")} {owed21Mg > 0 ? tr.L("له", "we owe") : tr.L("عليه", "he owes")}</span></>);

const TYPES: Record<string, [string, string]> = {
  purchase_invoice: ["فاتورة شراء", "Purchase invoice"],
  merchant_payment: ["دفعة للتاجر", "Payment to merchant"],
  merchant_receipt: ["استلام من التاجر", "Receipt from merchant"],
  merchant_adjustment: ["تسوية", "Adjustment"],
};
const DELETE_PATH: Record<string, string> = { merchant_payment: "settlements", merchant_receipt: "settlements", merchant_adjustment: "adjustments" };

/** The account, document by document: what each did, and the balance after it. A payment or an adjustment can be deleted here. */
export function StatementPanel({ merchantId, tr }: { merchantId: string; tr: Tr }) {
  const { L } = tr;
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const q = useQuery({ queryKey: ["merchant-statement", merchantId], gcTime: 0, queryFn: () => api<any>(`/merchants/${merchantId}/statement`) });
  const remove = async (line: Row) => {
    const label = L(...(TYPES[line.type] ?? [line.type, line.type]));
    if (!(await confirm({ title: L(`حذف ${label} رقم ${line.documentNumber}؟`, `Delete ${label} no. ${line.documentNumber}?`), text: L("بيتشال أثره من حساب التاجر ومن الخزنة والبنك.", "Its effect leaves the merchant account and the safe and bank."), danger: true }))) return;
    try {
      await api(`/merchants/${merchantId}/${DELETE_PATH[line.type]}/${line.id}`, { method: "DELETE", saveKey: newSaveKey() });
      toast(L("اتحذف.", "Deleted."));
      qc.invalidateQueries({ queryKey: ["merchant-statement", merchantId] });
    } catch (e) {
      toast(e instanceof ApiFailure ? tr.errorText(e.error) : L("ماحصلش حذف.", "Could not delete."), { error: true });
    }
  };
  const s = q.data;
  const bal = (b: Bal) => <>{moneyOwed(b.owedPiastres, tr)}<br />{goldOwed(b.owed21Mg, tr)}</>;
  return (
    <Section title={L("كشف الحساب", "Account statement")}>
      {dialog}
      {q.isError ? <div className="note warn">{L("تعذر تحميل كشف الحساب.", "The statement could not be loaded.")} <Button size="sm" onClick={() => q.refetch()}>{L("إعادة المحاولة", "Retry")}</Button></div>
        : !s ? <div className="skeleton" aria-busy="true"><i /><i /></div>
        : <>
          <p className="actions"><b>{L("الرصيد الحالي", "Balance now")}</b> {moneyOwed(s.closing.owedPiastres, tr)} <span className="mute">·</span> {goldOwed(s.closing.owed21Mg, tr)}</p>
          <DataTable head={[L("التاريخ", "Date"), L("المستند", "Document"), { label: L("الأثر على الحساب", "Effect on the account"), num: true }, { label: L("الرصيد بعده", "Balance after"), num: true }, ""]}
            foot={s.lines.length === 0 ? <TableRow><Td colSpan={5} className="mute">{L("مفيش حركات لسه.", "No movements yet.")}</Td></TableRow> : null}>
            <TableRow><Td><span className="mute">{L("رصيد أول المدة", "Opening balance")}</span></Td><Td /><Td num /><Td num>{bal(s.opening)}</Td><Td /></TableRow>
            {s.lines.map((l: Row) => (
              <TableRow key={`${l.type}-${l.id}`}>
                <Td><Ltr>{l.date}</Ltr></Td>
                <Td>{L(...(TYPES[l.type] ?? [l.type, l.type]))} <Ltr>#{l.documentNumber}</Ltr></Td>
                <Td num>{l.owedPiastres !== 0 && moneyOwed(l.owedPiastres, tr)}{l.owedPiastres !== 0 && l.owedKaratMg !== 0 && <br />}{l.owedKaratMg !== 0 && goldOwed(l.owed21Mg, tr)}</Td>
                <Td num>{bal(l.balance)}</Td>
                <Td>{DELETE_PATH[l.type] && <Button size="sm" onClick={() => remove(l)}>{L("حذف", "Delete")}</Button>}</Td>
              </TableRow>
            ))}
          </DataTable>
        </>}
    </Section>
  );
}

const categorySpec: LookupSpec = { path: "/categories", value: "id", label: "categoryName", paged: true };

/** The merchant's own making charge per gram: by item, category or karat, or one default for all. The first that fits a line wins: item, category, karat, default. */
export function RulesPanel({ merchantId, tr }: { merchantId: string; tr: Tr }) {
  const { L } = tr;
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const q = useQuery({ queryKey: ["merchant-rules", merchantId], gcTime: 0, queryFn: () => api<any>(`/merchants/${merchantId}/making-rules`) });
  const SCOPES = { all: L("كل الأصناف (الافتراضي)", "Everything (default)"), karat: L("عيار", "Karat"), category: L("تصنيف", "Category"), item: L("صنف", "Item") } as const;
  const fields = useMemo<FieldConfig[]>(() => [
    { name: "scope", label: L("القاعدة على", "Applies to"), type: "select", required: true, options: (Object.keys(SCOPES) as (keyof typeof SCOPES)[]).map((k) => [k, SCOPES[k]]) },
    { name: "karat", label: L("العيار", "Karat"), type: "select", options: [["18", "18"], ["21", "21"], ["24", "24"]], help: L("لقاعدة العيار فقط", "For a karat rule only") },
    { name: "categoryId", label: L("التصنيف", "Category"), type: "select", optionsFrom: categorySpec, help: L("لقاعدة التصنيف فقط", "For a category rule only") },
    { name: "itemId", label: L("الصنف", "Item"), type: "select", picker: "item", help: L("لقاعدة الصنف فقط", "For an item rule only") },
    { name: "perGramPiastres", label: L("المصنعية للجرام", "Making charge per gram"), type: "money", required: true },
    { name: "paidIn", label: L("تتدفع", "Paid in"), type: "select", required: true, default: "egp", options: [["egp", L("جنيه", "Money (EGP)")], ["gold", L("ذهب", "Gold")]] },
  ], [L]);   // eslint-disable-line react-hooks/exhaustive-deps
  const values = useMemo(() => ({ scope: "all", paidIn: "egp" }), []);
  const f = useFieldsForm(fields, values);
  const saveKey = useRef(newSaveKey());
  const [saving, setSaving] = useState(false);
  const add = async () => {
    const v = await f.read();
    if (!v) return;
    setSaving(true);
    try {
      await api(`/merchants/${merchantId}/making-rules`, { method: "POST", saveKey: saveKey.current, body: { scope: v.scope, perGramPiastres: v.perGramPiastres, paidIn: v.paidIn, ...(v.scope === "karat" ? { karat: v.karat } : {}), ...(v.scope === "category" ? { categoryId: v.categoryId } : {}), ...(v.scope === "item" ? { itemId: v.itemId } : {}) } });
      saveKey.current = newSaveKey();
      toast(L("اتضافت القاعدة.", "Rule added."));
      qc.invalidateQueries({ queryKey: ["merchant-rules", merchantId] });
    } catch (e) {
      saveKey.current = newSaveKey();
      if (e instanceof ApiFailure) { const fe = backendFieldErrors(e.error, tr); if (Object.keys(fe).length) f.setErrors(fe); else toast(tr.errorText(e.error), { error: true }); }
      else toast(L("ماحصلش حفظ.", "Could not save."), { error: true });
    } finally { setSaving(false); }
  };
  const remove = async (r: Row) => {
    if (!(await confirm({ title: L("حذف القاعدة؟", "Delete this rule?"), text: L("الفواتير اللي اتسجلت قبل كده بتفضل زي ما هي.", "Invoices already saved stay as they are."), danger: true }))) return;
    try {
      await api(`/merchants/${merchantId}/making-rules/${r.id}`, { method: "DELETE", saveKey: newSaveKey() });
      qc.invalidateQueries({ queryKey: ["merchant-rules", merchantId] });
    } catch (e) { toast(e instanceof ApiFailure ? tr.errorText(e.error) : L("ماحصلش حذف.", "Could not delete."), { error: true }); }
  };
  const target = (r: Row) => (r.scope === "karat" ? `${r.karat}K` : r.scope === "item" ? r.itemName : r.scope === "category" ? r.categoryName : "");
  const rules: Row[] = q.data?.items ?? [];
  return (
    <Section title={L("مصنعية التاجر", "Merchant making charge")}>
      {dialog}
      <p className="mute">{L("بتتطبق على فواتير الشراء من التاجر ده بس. أول قاعدة تنطبق على السطر بتكسب: الصنف ثم التصنيف ثم العيار ثم الافتراضي.", "Applies to purchases from this merchant only. The first rule that fits a line wins: item, category, karat, then the default.")}</p>
      {q.isError ? <div className="note warn">{L("تعذر تحميل القواعد.", "The rules could not be loaded.")}</div> : (
        <DataTable head={[L("القاعدة على", "Applies to"), { label: L("للجرام", "Per gram"), num: true }, L("تتدفع", "Paid in"), ""]}
          foot={rules.length === 0 ? <TableRow><Td colSpan={4} className="mute">{L("مفيش قواعد. المصنعية صفر.", "No rules. The charge is zero.")}</Td></TableRow> : null}>
          {rules.map((r) => (
            <TableRow key={r.id}>
              <Td>{(SCOPES as Record<string, string>)[r.scope]} {target(r) && <b>{target(r)}</b>}</Td>
              <Td num><Ltr>{piastresText(r.perGramPiastres)}</Ltr></Td>
              <Td>{r.paidIn === "gold" ? L("ذهب", "Gold") : L("جنيه", "Money (EGP)")}</Td>
              <Td><Button size="sm" onClick={() => remove(r)}>{L("حذف", "Delete")}</Button></Td>
            </TableRow>
          ))}
        </DataTable>
      )}
      <FormFields form={f} fields={fields} values={values} />
      <p><Button variant="primary" disabled={saving} onClick={add}>{saving ? L("جاري الحفظ…", "Saving…") : L("إضافة قاعدة", "Add rule")}</Button></p>
    </Section>
  );
}

