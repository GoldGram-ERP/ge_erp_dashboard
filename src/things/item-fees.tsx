"use client";
// المصنعية والكاش باك: setup/item-fees. A bulk table of every active, complete item with its workmanship and cashback per gram (both editable
// in place), a search and category/karat filters, a bulk "set this value for the filtered rows", one Save for all changes: PATCH /items/fees
// { changes: [{ id, workmanshipValue, cashbackValue }] } in one transaction (a refused row saves nothing). Admin and Super admin only (the backend refuses anyone else).
// The rules (diff, bulk, validation, payload, refusals) are in item-fees-rules.ts and tested there.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, DataTable, Input, Select, Seg, Status, Td, Tr, EmptyState, Skeleton, Ltr, ToastHost, toast, useConfirm } from "@/components/ui";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import type { Option } from "@/lib/engine-types";
import { milligramsText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { useAccess } from "./sales-access";
import { typedHundredths } from "./item-math";
import { applyBulk, changesOf, CONFIRM_ABOVE, filterRows, invalidCount, MAX_CHANGES, refusals, rowState, setEdit, shown, toRows, cellState, type Edits, type Field, type FeeItem, type Filters, type Refusal } from "./item-fees-rules";

// Every active item of the paged list (the backend gives 20 at a time).
async function loadItems(): Promise<FeeItem[]> {
  const out: FeeItem[] = [];
  for (let page = 1; page <= 200; page++) {
    const r = await api("/items", { query: { active: "true", page } });
    const got: FeeItem[] = r?.items ?? [];
    out.push(...got);
    if (!got.length || out.length >= (r?.total ?? 0)) break;
  }
  return out;
}

export default function Page() {
  const tr = useT(), { t, L } = tr;
  const m = (k: string) => t("gold-accounts", `items.${k}`);
  const c = (k: string, v?: Record<string, string | number>) => t("common", k, v);
  const access = useAccess();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [confirm, dialog] = useConfirm();
  const items = useQuery({ queryKey: ["item-fees"], queryFn: loadItems, staleTime: 0, refetchOnWindowFocus: false });
  const rows = useMemo(() => toRows(items.data ?? []), [items.data]);
  const [edits, setEditsState] = useState<Edits>({});
  const [filters, setFilters] = useState<Filters>({ q: "", categoryId: "", karat: "" });
  const [bulkField, setBulkField] = useState<Field>("workmanship");
  const [bulkValue, setBulkValue] = useState("");
  const [problems, setProblems] = useState<Refusal[]>([]);
  const [saving, setSaving] = useState(false);
  const key = useRef(newSaveKey());
  const skipGuard = useRef(false);

  // every edit is another attempt: a new save key, and the old refusal list is stale
  const setEdits = (next: Edits) => { key.current = newSaveKey(); setProblems([]); setEditsState(next); };
  const shownRows = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const changes = useMemo(() => changesOf(rows, edits), [rows, edits]);
  const invalid = invalidCount(rows, edits);
  const dirty = changes.length > 0 || invalid > 0;
  const bulkOk = typedHundredths(bulkValue) !== undefined && shownRows.length > 0;
  const word = (f: Field) => (f === "workmanship" ? m("workmanship") : m("cashback"));

  const categories = useMemo<Option[]>(() => [...new Map(rows.map((r) => [r.categoryId, r.categoryName])).entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => [id, name]), [rows]);
  const karats = useMemo<Option[]>(() => [...new Set(rows.map((r) => r.karat))].sort((a, b) => Number(a) - Number(b)).map((k) => [k, k]), [rows]);

  const countText = (n: number) => (n === 0 ? L("لا تعديلات", "No changes") : tr.isAr ? (n === 1 ? "تعديل واحد" : n === 2 ? "تعديلان" : n <= 10 ? `${n} تعديلات` : `${n} تعديلًا`) : `${n} ${n === 1 ? "change" : "changes"}`);
  const why = (message: string) => { const x = t("common", `fieldErrors.${message}`); return x !== `fieldErrors.${message}` ? x : tr.errorText({ message }); };

  // Leaving with unsaved changes asks first: closing the tab or reloading (the browser's own question), and any link inside the app.
  const ask = useRef(confirm);
  useEffect(() => { ask.current = confirm; });
  useEffect(() => {
    if (!dirty) return;
    const bye = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    const click = async (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || skipGuard.current || e.defaultPrevented) return;
      e.preventDefault(); e.stopPropagation();
      if (await ask.current({ title: c("unsaved.title"), text: c("unsaved.body"), ok: c("unsaved.leave"), cancel: c("unsaved.keepEditing"), danger: true })) { skipGuard.current = true; a.click(); }
    };
    window.addEventListener("beforeunload", bye);
    document.addEventListener("click", click, true);
    return () => { window.removeEventListener("beforeunload", bye); document.removeEventListener("click", click, true); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty]);

  async function save() {
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    if (invalid || !changes.length) return;
    if (changes.length > MAX_CHANGES) { toast(L(`احفظ ${MAX_CHANGES} صنف على الأكثر في المرة الواحدة.`, `Save ${MAX_CHANGES} items at most at a time.`), { error: true }); return; }
    if (changes.length > CONFIRM_ABOVE && !(await confirm({ title: L("حفظ التعديلات؟", "Save the changes?"), text: L(`سيتم تعديل ${changes.length} صنفاً. هل تريد المتابعة؟`, `${changes.length} items will change. Save them all?`), ok: c("saveChanges"), cancel: c("cancel") }))) return;
    setSaving(true); setProblems([]);
    try {
      const r = await api("/items/fees", { method: "PATCH", body: { changes }, saveKey: key.current });
      key.current = newSaveKey();
      toast(L(`تم حفظ ${r.changed} صنف.`, `Saved ${r.changed} ${r.changed === 1 ? "item" : "items"}.`));
      setEditsState({});
      await qc.invalidateQueries({ queryKey: ["item-fees"] });   // reload: the table shows what is saved
      void qc.invalidateQueries({ queryKey: ["gold-accounts"] });
    } catch (e) {
      if (!(e instanceof ApiFailure)) { toast(L("تعذّر الحفظ. حاول مرة أخرى.", "Could not save. Try again."), { error: true }); return; }
      if (!keepsKey(e)) key.current = newSaveKey();
      const list = refusals(e.error, changes, rows);
      if (list.length) { setProblems(list); toast(L("لم يُحفظ شيء: راجع الأصناف المرفوضة.", "Nothing was saved: check the refused items."), { error: true }); }
      else toast(e.error.message === "itemNotFound" ? L("لم يُحفظ شيء: صنف محذوف أو غير موجود. أعد تحميل الصفحة.", "Nothing was saved: an item was deleted or is missing. Reload the page.") : tr.errorText(e.error), { error: true });
    } finally { setSaving(false); }
  }

  if (me && !(me.userType === "admin" || me.userType === "super_admin") || (access.canOpen && me && !access.canOpen(["administration/settings"]))) return <div className="empty"><strong>{L("غير مسموح لك بفتح هذه الصفحة.", "You are not allowed to open this page.")}</strong></div>;
  const cellProblem = (id: string, f: Field) => problems.some((p) => p.id === id && p.field === f);

  return (
    <div className="st-page" id="fees-page">
      <div className="head"><div><h1>{L("المصنعية والكاش باك", "Workmanship and cashback")}</h1><div className="sub">{L("عدّل المصنعية والكاش باك لكل جرام في أي صنف، ثم احفظ كل التعديلات دفعة واحدة.", "Edit the workmanship and cashback per gram of any item, then save all the changes at once.")}</div></div></div>
      {items.isPending && <Skeleton rows={6} />}
      {items.isError && <div className="note warn" role="alert">{c("couldNotLoad")}</div>}
      {items.data && (
        <>
          <div className="filters" id="fees-filters">
            <div className="field"><label htmlFor="fee-q">{c("search")}</label><Input id="fee-q" type="search" autoComplete="off" placeholder={m("searchPlaceholder")} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
            <div className="field"><label htmlFor="fee-category-btn">{m("cols.categoryName")}</label><Select id="fee-category" name="category" value={filters.categoryId} onChange={(v) => setFilters({ ...filters, categoryId: v })} options={categories} placeholder={c("report.all")} /></div>
            <div className="field"><label htmlFor="fee-karat-btn">{m("cols.karat")}</label><Select id="fee-karat" name="karat" value={filters.karat} onChange={(v) => setFilters({ ...filters, karat: v })} options={karats} placeholder={c("report.all")} searchable={false} /></div>
          </div>
          <div className="filters" id="fees-bulk">
            <div className="field"><label id="fee-bulk-field-label">{L("القيمة المراد ضبطها", "Value to set")}</label>
              <Seg label={L("القيمة المراد ضبطها", "Value to set")} value={bulkField} onChange={setBulkField} items={[{ id: "workmanship", label: m("workmanship"), attrs: { "data-f": "workmanship" } }, { id: "cashback", label: m("cashback"), attrs: { "data-f": "cashback" } }]} /></div>
            <div className="field"><label htmlFor="fee-bulk-value">{L("القيمة لكل جرام (ج.م)", "Value per gram (EGP)")}</label>
              <Input id="fee-bulk-value" kind="money" dir="ltr" inputMode="decimal" autoComplete="off" placeholder="0.00" aria-invalid={bulkValue !== "" && typedHundredths(bulkValue) === undefined} value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} />
              {bulkValue !== "" && typedHundredths(bulkValue) === undefined && <div className="err" role="alert">{m("commissionInvalid")}</div>}</div>
            <Button id="fee-bulk-apply" disabled={!bulkOk} onClick={() => setEdits(applyBulk(edits, shownRows, bulkField, bulkValue))}>{L(`تطبيق على الصفوف المصفّاة (${shownRows.length})`, `Apply to filtered rows (${shownRows.length})`)}</Button>
          </div>
          {problems.length > 0 && (
            <div className="note warn" id="fee-errors" role="alert"><strong>{L("لم يُحفظ شيء. صحّح الأصناف التالية ثم احفظ مرة أخرى:", "Nothing was saved. Fix these items and save again:")}</strong>
              <ul>{problems.map((p, i) => <li key={i}><bdi dir="auto">{p.itemName}</bdi>{p.field ? ` (${word(p.field)})` : ""}: {why(p.message)}</li>)}</ul></div>
          )}
          {rows.length === 0
            ? <EmptyState title={L("لا توجد أصناف نشطة مكتملة", "No active, complete items")} text={L("أكمل الوزن والمصنعية في صفحة الأصناف أولاً.", "Complete the weight and fees on the Items screen first.")} />
            : shownRows.length === 0
              ? <EmptyState title={L("لا توجد أصناف مطابقة", "No matching items")} text={L("غيّر البحث أو المرشحات.", "Change the search or the filters.")} />
              : (
                <DataTable fixedOrder tableId="fees-table" bodyId="fees-body" head={[m("cols.itemName"), m("cols.categoryName"), m("cols.karat"), { label: m("weightG"), num: true }, { label: m("workmanshipValue"), num: true }, { label: m("cashbackValue"), num: true }]}>
                  {shownRows.map((r) => {
                    const rs = rowState(r, edits);
                    const cell = (f: Field) => {
                      const st = cellState(r, edits, f), bad = st === "invalid" || cellProblem(r.id, f);
                      return (
                        <Td num data-state={st} data-f={f}>
                          <div className="field" data-k={`${r.id}.${f}`}>
                            <Input id={`fee-${f === "workmanship" ? "w" : "c"}-${r.id}`} kind="money" dir="ltr" inputMode="decimal" autoComplete="off" aria-label={`${word(f)}: ${r.itemName}`} aria-invalid={bad}
                              value={shown(r, edits, f)} onChange={(e) => setEdits(setEdit(edits, r, f, e.target.value))} />
                            {st === "changed" && <div className="help"><Status tone="warn">{L("كانت", "was")} <Ltr>{r[f]}</Ltr></Status></div>}
                            {st === "invalid" && <div className="err" role="alert">{L("٠ أو أكثر، بخانتين عشريتين", "0 or more, 2 decimals")}</div>}
                          </div>
                        </Td>
                      );
                    };
                    return (
                      <Tr key={r.id} className={rs === "same" ? "" : "row"} aria-selected={rs === "changed"} data-row={r.id} data-state={rs}>
                        <Td><bdi dir="auto">{r.itemName}</bdi></Td>
                        <Td><bdi dir="auto">{r.categoryName}</bdi></Td>
                        <Td dir="ltr">{r.karat}</Td>
                        <Td num dir="ltr">{milligramsText(r.weight)}</Td>
                        {cell("workmanship")}
                        {cell("cashback")}
                      </Tr>
                    );
                  })}
                </DataTable>
              )}
          <div className="formbar">
            <Button variant="primary" id="fee-save" disabled={saving || changes.length === 0 || invalid > 0} onClick={() => void save()}>{saving ? c("saving") : c("saveChanges")}</Button>
            <Button id="fee-discard" disabled={saving || !dirty} onClick={() => setEdits({})}>{L("تراجع عن التعديلات", "Discard changes")}</Button>
            <span className="mute" id="fee-count" role="status">{changes.length > 0 || invalid > 0 ? `${countText(changes.length)}${invalid ? ` · ${L(`${invalid} خطأ`, `${invalid} to fix`)}` : ""}` : ""}</span>
          </div>
        </>
      )}
      {dialog}
      <ToastHost />
    </div>
  );
}
