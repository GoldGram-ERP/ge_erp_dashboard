"use client";
// readForm / showErrors / clearOnInput as a hook on react-hook-form: the resolver is the shared readFields rule
// (parsed money in piastres, weight in milligrams, per-field validate(v, all)), so the HTML configs keep working.
import { useMemo, type ReactNode } from "react";
import { FormProvider, useForm, useWatch, type FieldErrors, type Resolver, type UseFormReturn } from "react-hook-form";
import type { FieldConfig, FilterConfig, Row } from "@/lib/engine-types";
import { rawValues, readFields } from "@/lib/fields";
import { useT } from "@/lib/t";
import { Field, fieldId } from "./Field";

export type FieldsForm = UseFormReturn<any> & {
  /** Validate and hand over the parsed values; false when a field is wrong (the first wrong field gets focus). */
  read: () => Promise<Row | null>;
  setErrors: (errors: Record<string, string>) => boolean;
};

export function useFieldsForm(fields: FieldConfig[], values: Row = {}): FieldsForm {
  const tr = useT();
  const resolver = useMemo<Resolver<any>>(() => async (raw) => {
    const r = readFields(raw, fields, tr);
    const errs: FieldErrors<any> = {};
    for (const [k, message] of Object.entries(r.errors)) errs[k] = { type: "validate", message };
    return Object.keys(errs).length ? { values: {}, errors: errs } : { values: r.values, errors: {} };
  }, [fields, tr]);
  const form = useForm<any>({ defaultValues: rawValues(fields, values), resolver, shouldFocusError: false, reValidateMode: "onSubmit" });
  const focusFirst = (names: string[]) => {
    for (const n of fields.map((f) => f.name).filter((n) => names.includes(n))) {
      const el = document.getElementById(`f-${n}-btn`) ?? document.getElementById(`f-${n}`);
      if (el) { (el as HTMLElement).focus(); return; }
    }
  };
  return Object.assign(form, {
    read: () => new Promise<Row | null>((resolve) => {
      form.handleSubmit((v) => resolve(v), (e) => { focusFirst(Object.keys(e)); resolve(null); })();
    }),
    setErrors: (errors: Record<string, string>) => {
      const names = Object.keys(errors).filter((n) => fields.some((f) => f.name === n));
      names.forEach((n) => form.setError(n, { type: "server", message: errors[n] }));
      if (names.length) focusFirst(names);
      return names.length > 0;
    },
  });
}

const sectionName = (f: FieldConfig, L: (a: string, b: string) => string) => (f.section ? (typeof f.section === "string" ? f.section : L(f.section.ar, f.section.en)) : "");

/** A form is sections like a record: title bubble + soft panel; fields without a section share one untitled panel. */
export function FormFields({ form, fields, values = {} }: { form: FieldsForm; fields: FieldConfig[]; values?: Row }) {
  const { L } = useT();
  const secs: { k: string; list: FieldConfig[] }[] = [];
  for (const f of fields) {
    const k = sectionName(f, L);
    let s = secs.find((x) => x.k === k);
    if (!s) secs.push((s = { k, list: [] }));
    s.list.push(f);
  }
  return (
    <FormProvider {...form}>
      <div className="sections">
        {secs.map((s) => (
          <div key={s.k} className={`grp-block${secs.length === 1 ? " wide" : ""}`}>
            {s.k && <h3 className="grp-title">{s.k}</h3>}
            <div className="grp-panel formgrid">{s.list.map((f) => <Field key={f.name} f={f} values={values} />)}</div>
          </div>
        ))}
      </div>
    </FormProvider>
  );
}

/** Filters: the same fields in a row, no stars. */
export function FilterFields({ form, fields }: { form: FieldsForm; fields: FilterConfig[] }): ReactNode {
  const values = useWatch({ control: form.control }) as Row;   // a filter with `when` follows the others as they change
  return <FormProvider {...form}>{fields.filter((f) => !f.when || f.when(values)).map((f) => <Field key={f.name} f={{ ...f, required: false }} />)}</FormProvider>;
}
export { fieldId };
