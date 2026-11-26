"use client";
// The hand-over of an invoiced reservation to the customer (owner, 2026-11-26): "Deliver" on a row of the ready-for-delivery tab, for whoever has the
// list; "Undo delivery" on a row of the delivered tab, for an Admin and the Super admin. One question, one call; the backend keeps who and when.
import { useRef, useState, type SyntheticEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon, toast, useConfirm } from "@/components/engine";
import { Button } from "@/components/ui";
import { api, ApiFailure, keepsKey, newSaveKey } from "@/lib/api";
import { code6 } from "@/lib/code6";
import type { Row } from "@/lib/engine-types";
import type { Tr } from "@/lib/t";

/** Its clicks and keys, the dialog's too, stay inside it: the row would open the reservation. */
export function DeliveryButton({ row, tr, undo }: { row: Row; tr: Tr; undo?: boolean }) {
  const { L } = tr;
  const [ask, dialog] = useConfirm();
  const [busy, setBusy] = useState(false);
  const saveKey = useRef(newSaveKey());
  const qc = useQueryClient();
  const stop = (e: SyntheticEvent) => e.stopPropagation();
  const code = code6(row.reservationNumber);

  async function run() {
    if (busy) return;
    const question = undo
      ? { title: L("إلغاء التسليم", "Undo the delivery"), text: L(`إرجاع الحجز رقم ${code} إلى «جاهزة للتسليم»؟`, `Return reservation number ${code} to "Ready for delivery"?`), ok: L("إلغاء التسليم", "Undo delivery") }
      : { title: L("تسليم الحجز", "Deliver the reservation"), text: L(`تم تسليم الحجز رقم ${code} للعميل ${row.customerName}؟`, `Mark reservation number ${code} as delivered to ${row.customerName}?`), ok: L("تسليم", "Deliver") };
    if (!(await ask(question))) return;
    setBusy(true);
    try {
      await api(`/reservations/${row.id}/${undo ? "undo-delivery" : "deliver"}`, { method: "POST", saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(undo ? L(`أُلغي تسليم الحجز رقم ${code}`, `Delivery of reservation number ${code} undone`) : L(`تم تسليم الحجز رقم ${code}`, `Reservation number ${code} delivered`));
    } catch (err) {
      if (!keepsKey(err)) saveKey.current = newSaveKey();
      toast(err instanceof ApiFailure ? tr.errorText(err.error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again."), { error: true });
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["thing", "reservations"] });
    }
  }

  return (
    <span onClick={stop} onPointerDown={stop} onKeyDown={stop}>
      <Button size="sm" variant={undo ? undefined : "primary"} data-deliver={undo ? undefined : code} data-undo-delivery={undo ? code : undefined} aria-busy={busy} disabled={busy} onClick={() => void run()}>
        <Icon name={undo ? "back" : "check"} size={14} />{undo ? L("إلغاء التسليم", "Undo delivery") : L("تسليم", "Deliver")}
      </Button>
      {dialog}
    </span>
  );
}
