"use client";
// The "add movement" pages of money/cash (EGP: POST /cash-movements, gold: POST /gold-movements). Ported from docs/nav-preview/app/things/cash-movement-page.js.
// The dashboard has ONE form with an Asset toggle; the owner asked for two header buttons, so each page is one asset.
// A page of its own because the form stays on screen after a save (toast with the number, fields cleared, branch and treasury kept)
// and shows "not enough gold" with the available grams under the Weight field.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, FieldConfig, Row } from "@/lib/engine-types";
import { backendFieldErrors, readFields } from "@/lib/fields";
import { milligramsText, piastresText, today, typedMilligrams, typedPiastres } from "@/lib/format";
import { useMe } from "@/lib/session";
import { Icon, toast } from "@/components/engine";
import { FormFields, useFieldsForm } from "@/components/fields/useFieldsForm";
import { useLookup } from "@/components/fields/useLookup";
import { branchSpec, code6 } from "./money-shared";

const KARATS = ["18", "21", "24", "999"];
const AMOUNT_MAX = 9_999_999_999_999;   // piastres, backend cap
// shortcut: the dashboard lets a weight reach 9,999,999,999.999 g, the backend refuses above 9,999,999,999 mg; follow the BACKEND.
const WEIGHT_MAX_MG = 9_999_999_999;

export const EgpMovementForm = (p: CustomFormProps) => <MovementForm kind="egp" {...p} />;
export const GoldMovementForm = (p: CustomFormProps) => <MovementForm kind="gold" {...p} />;

function MovementForm({ kind, tr, close }: CustomFormProps & { kind: "egp" | "gold" }) {
  const { t, L } = tr;
  const gold = kind === "gold";
  const m = (k: string, v?: Record<string, string>) => t("cash-accounts", `cashMovements.${k}`, v);
  const c = (k: string, v?: Record<string, string>) => t("common", k, v);
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [alert, setAlert] = useState("");
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());

  // Money / weight are text fields so the dashboard's own wrong-value texts show.
  const [treasuries, setTreasuries] = useState<[string, string][]>([]);
  const fieldsOf = (branchId: string): FieldConfig[] => [
    { name: "number", label: m("documentNumber"), type: "code", documentType: gold ? "goldMovement" : "cash_movement", branchField: "branchId", dateField: "date", hint: m("autoHint") },
    { name: "branchId", label: m("branchId"), type: "select", required: true, optionsFrom: branchSpec },
    { name: "treasuryId", label: m("treasuryId"), type: "select", required: gold, options: treasuries, placeholder: branchId ? m("choose") : m("chooseBranchFirst"), disabled: !branchId },
    { name: "movementType", label: m("movementType"), type: "select", required: true, options: [["withdraw", m("withdraw")], ["deposit", m("deposit")]] },
    { name: "date", label: m("date"), type: "date", required: true },
    ...(gold
      ? [
        { name: "karat", label: m("karat"), type: "select", required: true, options: KARATS.map((k) => [k, k] as [string, string]) } as FieldConfig,
        // named weightMg like the backend field, so a refusal on weightMg lands on this box
        { name: "weightMg", label: m("weight"), type: "text", required: true, maxLength: 14, help: "0.000",
          validate: (v) => { const mg = typedMilligrams(v); return mg === undefined || mg <= 0 || mg > WEIGHT_MAX_MG ? m("weightInvalid") : null; } } as FieldConfig,
      ]
      : [{ name: "amount", label: m("amount"), type: "text", required: true, maxLength: 17, help: "0.00",
        validate: (v) => { const p = typedPiastres(v); return p === undefined || p <= 0 || p > AMOUNT_MAX ? m("amountInvalid") : null; } } as FieldConfig]),
    { name: "note", label: m("note"), type: "text", required: true, maxLength: 250, wide: true },
  ];

  const start = { branchId: me?.branchId ?? "", treasuryId: "", movementType: "", date: today() };
  const [branchNow, setBranchNow] = useState(String(start.branchId));
  const fields = useMemo(() => fieldsOf(branchNow), [treasuries, branchNow, gold, tr]);   // eslint-disable-line react-hooks/exhaustive-deps
  const f = useFieldsForm(fields, start);

  // follow the branch: its treasury of this asset's kind is picked, nothing to choose
  useEffect(() => { const s = f.watch((raw, info) => { saveKey.current = newSaveKey(); setAlert(""); if (info.name === "branchId") setBranchNow(String(raw.branchId ?? "")); }); return () => s.unsubscribe(); }, [f]);
  const branches = useLookup(branchSpec).options;
  useEffect(() => { if (!f.getValues("branchId") && branches?.length === 1) { f.setValue("branchId", String(branches[0][0])); setBranchNow(String(branches[0][0])); } }, [branches, f]);
  const tq = useQuery({ enabled: !!branchNow, queryKey: ["cash-form-treasuries", branchNow], queryFn: () => api("/treasuries", { query: { branchId: branchNow } }) });
  useEffect(() => {
    if (!branchNow) { setTreasuries([]); f.setValue("treasuryId", ""); return; }
    if (!tq.data) return;
    const items = ((tq.data.items ?? []) as Row[]).filter((x) => x.kind === (gold ? "gold" : "egp"));
    setTreasuries(items.map((x) => [x.id, `${code6(x.treasuryCode)} ${x.treasuryName}`] as [string, string]));
    f.setValue("treasuryId", items[0]?.id ?? "");
  }, [tq.data, branchNow, gold, f]);

  // Backend fields refused with "invalid" get the dashboard's own sentence for that field.
  const refused = (error: any) => {
    const out = backendFieldErrors(error, tr);
    const specific: Record<string, string> = { branchId: m("branchInvalid"), date: m("dateInvalid"), amount: m("amountInvalid"), weightMg: m("weightInvalid") };
    const list: { field?: string; name?: string; message?: string }[] = Array.isArray(error?.fields) ? error.fields : [];
    for (const x of list) { const k = x.field ?? x.name ?? ""; if (x.message === "invalid" && specific[k]) out[k] = specific[k]; }
    return out;
  };
  const failed = (errors: Record<string, string>) => {
    const n = Object.keys(errors).length;
    if (n && f.setErrors(errors)) { setAlert(c("couldNotSave", { count: String(n) })); return true; }
    return false;
  };

  async function submit() {
    if (!navigator.onLine) { toast(c("offline"), { error: true }); return; }
    setAlert("");
    const raw = f.getValues();
    const r = readFields(raw, fields, tr);
    if (Object.keys(r.errors).length) { f.clearErrors(); failed(r.errors); return; }
    const v = r.values;
    // Exactly the dashboard's body; the EGP treasury may be left out (the backend takes the branch's), gold needs it.
    const body = gold
      ? { branchId: v.branchId, treasuryId: v.treasuryId, movementType: v.movementType, date: v.date, karat: v.karat, weightMg: typedMilligrams(v.weightMg), note: v.note }
      : { branchId: v.branchId, treasuryId: v.treasuryId || undefined, movementType: v.movementType, date: v.date, amount: typedPiastres(v.amount), note: v.note };
    setSaving(true);
    try {
      const a = await api(gold ? "/gold-movements" : "/cash-movements", { method: "POST", body, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(m("savedNumber", { code: code6(a?.documentNumber ?? "") }));
      qc.invalidateQueries({ queryKey: ["thing", "cash"] }); qc.invalidateQueries({ queryKey: ["cash-recent"] });
      // branch and treasury stay; everything else starts again
      f.reset({ branchId: v.branchId, treasuryId: v.treasuryId ?? "", movementType: "", date: today(), amount: "", weightMg: "", karat: "", note: "" });
    } catch (e) {
      if (!(e instanceof ApiFailure)) { toast(L("تعذّر الحفظ. حاول مرة أخرى.", "Could not save. Try again."), { error: true }); return; }
      if (!e.unreachable && e.error.message !== "saveInProgress") saveKey.current = newSaveKey();   // a refusal is final for this content
      if (e.error.message === "notEnoughGold") {
        const mg = String(e.error.values?.availableMg ?? "");
        f.setErrors({ weightMg: m("notEnoughGold", { karat: String(e.error.values?.karat ?? v.karat), available: /^\d+$/.test(mg) ? milligramsText(Number(mg)) : "0.000" }) });
        return;
      }
      if (!failed(refused(e.error))) toast(tr.errorText(e.error), { error: true });
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: "1 1 420px", minWidth: 0 }}>
        <div className="note">{m("fixedNote")}</div>
        <form id="mv" className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <FormFields form={f} fields={fields} values={start} />
        </form>
        {alert && <div id="mv-alert" role="alert" className="err">{alert}</div>}
        <div className="formbar">
          <button type="button" className="btn primary" id="mv-save" disabled={saving} onClick={submit}>{saving ? c("saving") : L("حفظ", "Save")}</button>
          <button type="button" className="btn quiet" id="mv-history" onClick={close}><Icon name="file" />{m("listTitle")}</button>
        </div>
      </div>
      {!gold && <Recent m={m} />}
    </div>
  );
}

// The five latest EGP movements, beside the form.
function Recent({ m }: { m: (k: string) => string }) {
  const q = useQuery({ queryKey: ["cash-recent"], retry: false, queryFn: () => api("/cash-movements") });
  const rows = (((q.data?.items ?? []) as Row[]).slice(0, 5));
  return (
    <aside id="mv-recent" className="card" style={{ flex: "0 1 340px" }}>
      <h3 className="grp-title">{m("latest")}</h3>
      {q.isLoading ? <div className="skeleton" aria-busy="true"><i /><i /><i /></div>
        : q.isError ? null
        : rows.length ? rows.map((x) => <div className="kv" key={x.id}><span dir="ltr">{code6(x.documentNumber)} · {String(x.date).slice(0, 10)}</span><span dir="ltr">{piastresText(x.amount)}</span></div>)
        : <div className="mute">{m("emptyTitle")}</div>}
    </aside>
  );
}
