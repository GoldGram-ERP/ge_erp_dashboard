"use client";
// One form field by type, with the HTML's ids (#f-<name>), labels tied with htmlFor, red star on required, errors with role="alert".
import { useState } from "react";
import { useController, useFormContext, useWatch } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { FieldConfig, Option, Row } from "@/lib/engine-types";
import { useT } from "@/lib/t";
import { addNewFor } from "@/lib/fields";
import { stepAmount } from "@/lib/price-step";
import { useLookup } from "./useLookup";
import { Select } from "./Select";
import { DatePicker } from "./DatePicker";

export const fieldId = (f: { name: string }) => `f-${f.name}`;
import { code6 as pad6 } from "@/lib/code6";
const NUMERIC = ["number", "money", "weight"];

function Label({ f, htmlFor, id }: { f: FieldConfig; htmlFor: string; id: string }) {
  return (
    <label id={id} htmlFor={htmlFor}>
      {f.label}
      {f.required && <> <span className="req" aria-hidden="true">*</span><span className="sr-only">(mandatory)</span></>}
    </label>
  );
}

function CodeField({ f, values }: { f: FieldConfig; values: Row }) {
  const { t } = useT();
  const { control } = useFormContext();
  const saved = values[f.name];
  const branch = useWatch({ control, name: f.branchField ?? "_" });
  const date = useWatch({ control, name: f.dateField ?? "_" });
  const preview = useQuery({
    enabled: !saved,
    queryKey: ["next-number", f.documentType, f.branchField ? branch : null, f.dateField ? String(date ?? "").slice(0, 4) : null],
    retry: false,
    queryFn: () => api<{ next: number }>("/document-numbers/next", { query: { documentType: f.documentType, branchId: f.branchField ? branch || undefined : undefined, year: f.dateField ? String(date ?? "").slice(0, 4) || undefined : undefined } }),
  });
  const needsBranch = (preview.error as any)?.status === 400 && ((preview.error as any)?.error?.fields ?? []).some((x: any) => x.field === "branchId");
  const value = saved ? pad6(saved) : preview.data ? pad6(preview.data.next) : "";
  const help = saved ? "" : preview.data ? t("common", "upcomingNumber") : needsBranch ? t("common", "chooseBranchForNumber") : f.hint ?? "";
  const id = fieldId(f);
  return (
    <div className={`field${f.wide ? " wide" : ""}`} data-k={f.name}>
      <label htmlFor={id}>{f.label}</label>
      <input id={id} className="code-box" disabled dir="ltr" style={{ textAlign: "start" }} value={value} readOnly aria-describedby={`${id}-help`} />
      <div className="help" id={`${id}-help`}>{help}</div>
    </div>
  );
}

export function Field({ f, values = {} }: { f: FieldConfig; values?: Row }) {
  const { control, clearErrors } = useFormContext();
  if (f.type === "code") return <CodeField f={f} values={values} />;
  if (f.type === "html") return <div className={`field${f.wide ? " wide" : ""}`} data-k={f.name}>{f.html?.(values)}</div>;
  return <Controlled f={f} control={control} clearErrors={clearErrors} />;
}

function Controlled({ f, control, clearErrors }: { f: FieldConfig; control: any; clearErrors: (n: string) => void }) {
  const { field: rhf, fieldState } = useController({ name: f.name, control });
  const { onChange: rhfChange, onBlur, value: rhfValue } = rhf;
  const { L } = useT();
  const [shown, setShown] = useState(false);
  const lookup = useLookup(f.type === "select" ? f.optionsFrom : undefined);
  const id = fieldId(f), lid = `${id}-label`, err = fieldState.error?.message;
  const describedBy = [f.help && `${id}-help`, err && `${id}-err`].filter(Boolean).join(" ") || undefined;
  const onChange = (v: unknown) => { clearErrors(f.name); rhfChange(v); };   // typing in a field clears its own error
  const cls = `field${f.type === "checkbox" ? " check" : ""}${f.wide ? " wide" : ""}`;
  const help = f.help ? <div className="help" id={`${id}-help`}>{f.help}</div> : null;
  const error = err ? <div className="err" id={`${id}-err`} role="alert">{err}</div> : null;
  const label = <Label f={f} htmlFor={f.type === "select" || f.type === "date" ? `${id}-btn` : id} id={lid} />;
  const wrap = (body: React.ReactNode) => <div className={cls} data-k={f.name} data-err={err ? "" : undefined}>{body}{error}</div>;
  const value = rhfValue ?? "";

  if (f.type === "checkbox") {
    return wrap(<><input id={id} type="checkbox" checked={!!value} disabled={f.disabled} aria-describedby={describedBy} onBlur={onBlur} onChange={(e) => onChange(e.target.checked)} />{label}{help}</>);
  }
  if (f.type === "select") {
    const options: Option[] = f.options ?? lookup.options ?? [];
    return wrap(<>
      {label}
      <Select id={id} name={f.name} value={String(value)} onChange={onChange} onBlur={onBlur} options={options} placeholder={f.placeholder}
        disabled={f.disabled} searchable={f.searchable} labelledBy={lid} describedBy={describedBy} invalid={!!err}
        addNew={typeof f.optionsFrom === "object" ? addNewFor(f.optionsFrom.path) : undefined} />
      {lookup.failed && <div className="help">{L("تعذّر تحميل القائمة", "Could not load the list")}</div>}
      {help}
    </>);
  }
  if (f.type === "date") {
    return wrap(<>{label}<DatePicker id={id} name={f.name} value={String(value)} onChange={onChange} onBlur={onBlur} min={f.min as string} max={f.max as string} required={f.required}
      placeholder={f.placeholder} disabled={f.disabled} labelledBy={lid} describedBy={describedBy} invalid={!!err} />{help}</>);
  }
  if (f.type === "textarea") {
    return wrap(<>{label}<textarea id={id} value={String(value)} disabled={f.disabled} maxLength={f.maxLength} aria-invalid={!!err || undefined} aria-describedby={describedBy}
      onBlur={onBlur} onChange={(e) => onChange(e.target.value)} />{help}</>);
  }
  const numeric = NUMERIC.includes(f.type);
  const password = f.type === "password";
  const input = (
    <input id={id} type={password && !shown ? "password" : "text"} value={String(value)} disabled={f.disabled} maxLength={f.maxLength}
      {...(numeric ? { inputMode: "decimal" as const, dir: "ltr" } : {})}
      placeholder={f.placeholder} autoComplete={f.autocomplete ?? "off"} aria-invalid={!!err || undefined} aria-describedby={describedBy}
      onBlur={onBlur} onChange={(e) => onChange(e.target.value)} />
  );
  const stepper = f.type === "money" && f.step && !f.disabled ? (
    <div className="stepper">
      <StepBtn dir={-1} f={f} value={value} onChange={onChange} />{input}<StepBtn dir={1} f={f} value={value} onChange={onChange} />
    </div>
  ) : null;
  return wrap(<>
    {label}
    {stepper ?? (password ? <div style={{ position: "relative" }}>{input}<ShowHide shown={shown} toggle={() => setShown((s) => !s)} /></div> : input)}
    {help}
  </>);
}

function ShowHide({ shown, toggle }: { shown: boolean; toggle: () => void }) {
  const { L } = useT();
  return (
    <button type="button" className="ic-btn" aria-pressed={shown} aria-label={shown ? L("إخفاء كلمة المرور", "Hide password") : L("إظهار كلمة المرور", "Show password")}
      style={{ position: "absolute", insetInlineEnd: 6, top: "50%", transform: "translateY(-50%)" }} onClick={toggle}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {shown ? <path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6a9.7 9.7 0 0 0 4.3-1" /> : <><path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z" /><circle cx="12" cy="12" r="3" /></>}
      </svg>
    </button>
  );
}

/** A "-5" / "+5" pound step for a money field: it edits the text like typing does (exact piastres, never below 0). */
function StepBtn({ dir, f, value, onChange }: { dir: 1 | -1; f: FieldConfig; value: unknown; onChange: (v: unknown) => void }) {
  const { L } = useT();
  const n = f.step ?? 0;
  const label = dir > 0 ? L(`زيادة ${n} جنيهات في ${f.label}`, `Add ${n} pounds to ${f.label}`) : L(`إنقاص ${n} جنيهات من ${f.label}`, `Subtract ${n} pounds from ${f.label}`);
  return (
    <button type="button" className="step-btn" dir="ltr" aria-label={label} onClick={() => onChange(stepAmount(value, dir * n * 100))}>
      {dir > 0 ? "+" : "−"}{n}
    </button>
  );
}
