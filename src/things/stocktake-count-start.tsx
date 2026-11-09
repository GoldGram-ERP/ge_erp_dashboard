"use client";
// Start a stock count: POST /stock-counts {branchId, categoryId?, itemId?, karat?}. Ported from docs/nav-preview/app/things/stocktake-count-start.js.
// The count number is the upcoming 'stock_count' number of the branch (preview only). The count date is the system's, never sent: shown as today in Cairo.
// Category / item / karat appear only after a branch is chosen; changing the category clears the item; the item list follows the category.
// Moves no stock. After the save: toast "Count N started." and the scan page of the new (open) count.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { ItemPicker } from "@/components/fields/ItemPicker";
import { useItems } from "@/lib/items";
import { backendFieldErrors } from "@/lib/fields";
import { today } from "@/lib/format";
import { useMe } from "@/lib/session";
import { FieldError } from "@/components/fields/FieldError";
import { revealFirstError } from "@/lib/submit-guard";
import { toast } from "@/components/engine";
import { Button, Input } from "@/components/ui";
import { Select } from "@/components/fields/Select";
import { code6, type Lists } from "./stocktake-shared";

export function StartForm({ tr, close, lists, onStarted }: CustomFormProps & { lists: Lists; onStarted: (count: Row) => void }) {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("gold-stocktake", `stockCount.${k}`, v);
  const { data: me } = useMe();
  const [branchId, setBranchId] = useState(me?.branchId ?? "");   // own branch first; the Super admin picks one
  const [categoryId, setCategoryId] = useState("");
  const [itemId, setItemId] = useState("");
  const [karat, setKarat] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  useEffect(() => { saveKey.current = newSaveKey(); }, [branchId, categoryId, itemId, karat]);   // edited: a new attempt, a new key

  const { branches, categories } = lists;
  const { items } = useItems(categoryId ? { categoryId } : {});
  const next = useQuery({ queryKey: ["next-number", "stock_count", branchId], retry: false, queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: "stock_count", branchId: branchId || undefined } }) });
  const numberHelp = next.data ? t("common", "upcomingNumber") : branchId ? m("filledBySystem") : t("common", "chooseBranchForNumber");

  async function save() {
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    if (!branchId) { setErr(m("required")); revealFirstError(); return; }
    setSaving(true);
    try {
      const body = Object.fromEntries(Object.entries({ branchId, categoryId, itemId, karat }).filter(([, x]) => x));
      const count = await api("/stock-counts", { method: "POST", body, saveKey: saveKey.current });
      toast(m("started", { code: code6(count.countNumber) }));
      onStarted(count);
    } catch (e) {
      if (e instanceof ApiFailure) {
        const fe = backendFieldErrors(e.error, tr);
        if (fe.branchId) { setErr(fe.branchId); revealFirstError(); } else toast(tr.errorText(e.error), { error: true });
      } else toast(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."), { error: true });
    } finally { setSaving(false); }
  }

  const field = (id: string, label: string, control: React.ReactNode, help?: string, error?: string, required?: boolean) => (
    <div className="field" data-k={id} data-err={error ? "" : undefined}>
      <label htmlFor={`f-${id}-btn`}>{label}{required && <> <span className="req" aria-hidden="true">*</span></>}</label>
      {control}
      {help && <div className="help">{help}</div>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
  return (
    <>
      <form id="form" className="card" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        <div className="formgrid">
          <div className="field" data-k="countNumber">
            <label htmlFor="f-countNumber">{m("countNumber")}</label>
            <Input id="f-countNumber" className="code-box" disabled readOnly dir="ltr" style={{ textAlign: "start" }} value={next.data ? code6(next.data.next) : ""} aria-describedby="f-countNumber-help" />
            <div className="help" id="f-countNumber-help">{numberHelp}</div>
          </div>
          {field("branchId", m("branch"), <Select id="f-branchId" name="branchId" value={branchId} onChange={(v) => { setBranchId(v); setErr(""); }} options={branches} invalid={!!err} />, undefined, err, true)}
          <div className="field" data-k="countDate">
            <label htmlFor="f-countDate">{m("countDate")}</label>
            <Input id="f-countDate" disabled dir="ltr" style={{ textAlign: "start" }} value={today()} />
            <div className="help">{m("filledBySystem")}</div>
          </div>
          {branchId && <>
            {field("categoryId", m("category"), <Select id="f-categoryId" name="categoryId" value={categoryId} onChange={(v) => { setCategoryId(v); setItemId(""); }} options={categories} placeholder={m("allCategories")} />)}
            {field("itemId", m("item"), <ItemPicker id="f-itemId" name="itemId" value={itemId} onChange={setItemId} items={items ?? []} placeholder={m("anyItem")} />)}
            {field("karat", m("karat"), <Select id="f-karat" name="karat" value={karat} onChange={setKarat} options={["18", "21", "24", "999"].map((k) => [k, k])} placeholder={m("anyKarat")} searchable={false} />)}
          </>}
        </div>
      </form>
      <div className="formbar">
        <Button variant="primary" id="save" disabled={saving} onClick={save}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ", "Save")}</Button>
        <Button id="cancel" onClick={close}>{L("إلغاء", "Cancel")}</Button>
      </div>
    </>
  );
}
