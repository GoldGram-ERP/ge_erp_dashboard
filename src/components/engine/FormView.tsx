"use client";
// A create/edit form as a side sheet (default) or a full page (display "page"; `custom` brings its own UI).
// Save: offline guard, validation (shared rules), one Idempotency-Key per attempt (renewed when the person edits), backend refusals mapped to fields.
import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { FormConfig, Row } from "@/lib/engine-types";
import { backendFieldErrors } from "@/lib/fields";
import { useT } from "@/lib/t";
import { FormFields, useFieldsForm } from "../fields/useFieldsForm";
import { Icon, Sheet, toast, useConfirm } from "./ui";

type Props = { thingTitle: string; form: FormConfig; row: Row | null; onClose: () => void; onSaved: (answer: any) => void };

function useSave({ form, row, onSaved, onClose }: Pick<Props, "form" | "row" | "onSaved" | "onClose">) {
  const tr = useT();
  const { t, L } = tr;
  const values = useMemo(() => (form.load ? form.load(row) : (row ?? {})), [form, row]);
  const fields = form.fields;
  const f = useFieldsForm(fields, values);
  const saveKey = useRef(newSaveKey());
  useEffect(() => { const s = f.watch(() => { saveKey.current = newSaveKey(); }); return () => s.unsubscribe(); }, [f]);   // edited: a new attempt, a new key
  const dirty = f.formState.isDirty;
  const mutation = useMutation({
    mutationFn: (body: unknown) => api(form.path(row), { method: form.method ?? (row ? "PATCH" : "POST"), body, saveKey: saveKey.current }),
    onSuccess: async (answer) => {
      toast(L("تم الحفظ", "Saved"));
      await form.afterSave?.(answer, { toast: (m) => toast(m), row });
      onClose(); onSaved(answer);
    },
    onError: (e) => {
      if (e instanceof ApiFailure) {
        const fe = backendFieldErrors(e.error, tr);
        if (Object.keys(fe).length && f.setErrors(fe)) return;
        toast(tr.errorText(e.error), { error: true });
      } else toast(L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."), { error: true });
    },
  });
  const submit = async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }   // no save without a connection
    const v = await f.read();
    if (!v) return;
    mutation.mutate(form.toPayload ? form.toPayload(v, row) : v);
  };
  // form.onReady: live raw values for derived display fields (e.g. the 24K price follows the sell price)
  useEffect(() => {
    if (!form.onReady) return;
    return form.onReady({
      watch: (cb) => { cb(f.getValues()); const s = f.watch((raw, info) => cb(raw, info.name)); return () => s.unsubscribe(); },
      setValue: (n, raw) => f.setValue(n, raw),
      values,
    }, row) || undefined;
  }, [f, form, row, values]);
  return { f, values, dirty, saving: mutation.isPending, submit };
}

const titleOf = (form: FormConfig, row: Row | null) => (typeof form.title === "function" ? form.title(row) : (form.title ?? form.label ?? ""));

export function FormSheet(props: Props) {
  const { L, t } = useT();
  const { form, row, onClose } = props;
  const { f, values, dirty, saving, submit } = useSave(props);
  const [confirm, dialog] = useConfirm();
  const request = async () => {
    if (!dirty || await confirm({ title: t("common", "unsaved.title"), text: t("common", "unsaved.body"), ok: t("common", "unsaved.leave"), cancel: t("common", "unsaved.keepEditing"), danger: true })) onClose();
  };
  return (
    <>
      <Sheet title={titleOf(form, row)} onRequestClose={request}
        footer={<>
          <button type="button" className="btn primary" id="save" disabled={saving} onClick={submit}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ", "Save")}</button>
          <button type="button" className="btn quiet" onClick={request}>{L("إلغاء", "Cancel")}</button>
        </>}>
        {form.note && <div className="note">{form.note}</div>}
        <form id="form" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <FormFields form={f} fields={form.fields} values={values} />
        </form>
      </Sheet>
      {dialog}
    </>
  );
}

function PlainPage(props: Props) {
  const { L } = useT();
  const { form, row, onClose } = props;
  const { f, values, saving, submit } = useSave(props);
  return (
    <>
      <form id="form" className="card" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {form.note && <div className="note">{form.note}</div>}
        <FormFields form={f} fields={form.fields} values={values} />
      </form>
      <div className="formbar">
        <button type="button" className="btn primary" id="save" disabled={saving} onClick={submit}>{saving ? L("جارٍ الحفظ…", "Saving…") : L("حفظ", "Save")}</button>
        <button type="button" className="btn quiet" id="cancel" onClick={onClose}>{L("إلغاء", "Cancel")}</button>
      </div>
    </>
  );
}

/** A big flow gets the whole workspace: `custom` draws it; `fields` draw a plain page form. */
export function FormPage(props: Props) {
  const tr = useT();
  const { form, row, onClose, thingTitle, onSaved } = props;
  const Custom = form.custom;
  return (
    <div>
      <button type="button" className="back" id="back" onClick={onClose}><Icon name="back" />{thingTitle}</button>
      <div className="head"><div><h1>{titleOf(form, row)}</h1></div></div>
      <div id="page">{Custom ? <Custom row={row} tr={tr} close={onClose} reload={() => { onClose(); onSaved(undefined); }} /> : <PlainPage {...props} />}</div>
    </div>
  );
}
