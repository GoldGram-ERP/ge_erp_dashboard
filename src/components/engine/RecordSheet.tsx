"use client";
// What a click on a row opens: the record in a side sheet, with Edit, the record actions and Delete.
// Delete marks the row (who and when); it is never worded as a hard delete.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { RecordConfig, Row } from "@/lib/engine-types";
import { useT } from "@/lib/t";
import { cellNode } from "./Table";
import { Icon, Kv, Section, Sheet, toast, useConfirm } from "./ui";

type Props = {
  rec: RecordConfig; full: Row; row: Row;
  onClose: () => void; reload: () => void; openForm: (formId: string, row?: Row | null) => void;
};

export function RecordSheet({ rec, full, row, onClose, reload, openForm }: Props) {
  const tr = useT();
  const { L } = tr;
  const [confirm, dialog] = useConfirm();
  const acts = (rec.actions ?? []).filter((a) => !a.when || a.when(full));
  const remove = rec.remove && (!rec.remove.when || rec.remove.when(full)) ? rec.remove : null;
  const [busy, setBusy] = useState(false);   // one record action at a time: a second click while one runs does nothing
  const del = useMutation({
    mutationFn: () => api(remove!.path(full), { method: "DELETE" }),
    onSuccess: () => { onClose(); toast(L("تم الحذف", "Deleted")); reload(); },
    onError: (e: any) => toast(tr.errorText(e?.error ?? { message: "deleteFailed" }), { error: true }),
  });

  const sectionTitle = (s: unknown) => (s ? (typeof s === "string" ? s : L((s as any).ar, (s as any).en)) : L("التفاصيل", "Details"));
  let body;
  if (rec.render) body = rec.render(full, row);
  else {
    const secs: { k: string; list: NonNullable<RecordConfig["fields"]> }[] = [];
    for (const f of rec.fields ?? []) {
      const k = sectionTitle(f.section);
      (secs.find((s) => s.k === k) ?? secs[secs.push({ k, list: [] }) - 1]).list.push(f);
    }
    body = secs.map((s) => <Section key={s.k} title={s.k}>{s.list.map((f) => <Kv key={f.label} k={f.label}>{cellNode({ key: f.key ?? "", type: f.type, get: f.get, statuses: f.statuses, render: f.render }, full, tr) || "—"}</Kv>)}</Section>);
  }

  const onDelete = async () => {
    const c = remove!.confirm?.(full) ?? { title: L("حذف هذا السجل؟", "Delete this record?"), text: L("يُعلَّم السجل محذوفًا ويُسجَّل من حذفه ومتى، ولا يراه إلا المدير الأعلى.", "The record is marked deleted (who and when); only the Super admin can still see it.") };
    if (busy || del.isPending) return;
    setBusy(true);
    try { if (await confirm({ ...c, ok: L("حذف", "Delete"), danger: true })) await del.mutateAsync().catch(() => {}); } finally { setBusy(false); }
  };

  return (
    <>
      <Sheet title={rec.title(full)} onRequestClose={onClose}
        footer={<>
          {rec.edit && <button type="button" className="btn primary" data-edit onClick={() => { onClose(); openForm(rec.edit!, full); }}><Icon name="edit" />{L("تعديل", "Edit")}</button>}
          {acts.map((a) => (
            <button key={a.id} type="button" className={`btn quiet${a.danger ? " danger" : ""}`} disabled={busy || del.isPending} onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                if (a.confirm && !(await confirm({ ...a.confirm, danger: a.danger }))) return;
                await a.run(full, { reload, close: onClose, toast, openForm });
              } catch (e: any) { toast(tr.errorText(e?.error ?? { message: "unexpected" }), { error: true }); } finally { setBusy(false); }
            }}>{a.icon && <Icon name={a.icon} />}{a.label}</button>
          ))}
          {remove && <button type="button" className="btn quiet danger" data-remove disabled={del.isPending || busy} onClick={onDelete}><Icon name="trash" />{L("حذف", "Delete")}</button>}
        </>}>
        <div className="sections">{body}</div>
      </Sheet>
      {dialog}
    </>
  );
}
