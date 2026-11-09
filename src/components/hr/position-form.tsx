"use client";
// The Position form and the channel-name cell used by the Positions screen (kept out of src/things: screens define no components of their own).
import { Button, Checkbox, Input } from "@/components/ui";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { CustomFormProps, Row } from "@/lib/engine-types";
import { Section, toast } from "@/components/engine";
import { FieldError } from "@/components/fields/FieldError";
import { allPages } from "@/things/sales-form-parts";

/** The live channels, newest first; null while loading. */
function useChannels(): Row[] | null {
  const q = useQuery({ queryKey: ["sales-channels", "all"], staleTime: 30_000, queryFn: () => allPages("/sales-channels", { order: "newest" }) });
  return q.isError ? [] : q.data ?? null;
}

export function ChannelNames({ ids, none }: { ids: string[]; none: string }) {
  const all = useChannels();
  if (!ids.length) return <>{none}</>;
  return <>{ids.map((id) => all?.find((c) => c.id === id)?.channelName ?? "…").join("، ")}</>;
}

export function PositionForm({ row, close, reload, tr }: CustomFormProps) {
  const { t } = tr;
  const p = (k: string, v?: Record<string, string>) => t("hr", `positions.${k}`, v);
  const channels = useChannels();
  const [full, setFull] = useState<Row | null | undefined>(row ? undefined : null);
  const [name, setName] = useState(row?.positionName ?? "");
  const [on, setOn] = useState<Set<string>>(new Set(row?.salesChannelIds ?? []));
  const [err, setErr] = useState(""), [general, setGeneral] = useState(""), [saving, setSaving] = useState(false);
  const key = useRef(newSaveKey());
  useEffect(() => {
    if (row) api(`/positions/${row.id}`).then((r: Row) => { setFull(r); setName(r.positionName); setOn(new Set(r.salesChannelIds ?? [])); }).catch(() => setFull(row));
  }, [row]);
  if (full === undefined) return <div className="skeleton" aria-busy="true"><i /><i /><i /></div>;
  const save = async () => {
    setErr(""); setGeneral("");
    if (!navigator.onLine) { toast(t("common", "offline"), { error: true }); return; }
    const n = name.trim();
    if (!n) { setErr(t("common", "fieldErrors.required")); return; }
    if (n.length > 100) { setErr(t("common", "fieldErrors.tooLong")); return; }
    setSaving(true);
    try {
      const saved = await api(row ? `/positions/${row.id}` : "/positions", { method: row ? "PATCH" : "POST", body: { positionName: n }, saveKey: key.current });
      await api(`/positions/${saved.id}/sales-channels`, { method: "PUT", body: { salesChannelIds: [...on] } });
      key.current = newSaveKey();
      toast(p("saved")); reload();
    } catch (e) {
      setSaving(false);
      if (!(e instanceof ApiFailure)) { setGeneral(t("errors", "saveFailed")); return; }
      key.current = newSaveKey();
      if (e.error.message === "positionNameTaken") setErr(tr.errorText(e.error)); else setGeneral(tr.errorText(e.error));
    }
  };
  return (
    <form noValidate aria-busy={saving} onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {general && <div className="note warn" role="alert">{general}</div>}
      <Section title={p("details")}>
        <div className="field" data-k="positionName" data-err={err ? "" : undefined}>
          <label htmlFor="f-positionName">{p("positionName")} *</label>
          <Input id="f-positionName" name="positionName" value={name} maxLength={100} autoComplete="off" aria-invalid={!!err} aria-describedby={err ? "f-positionName-err" : undefined} onChange={(e) => setName(e.target.value)} />
          {err && <FieldError id="f-positionName-err">{err}</FieldError>}
        </div>
      </Section>
      <Section title={p("channels")}>
        <p className="help">{p("channelsHint")}</p>
        {channels === null ? <div className="skeleton" aria-busy="true"><i /><i /></div>
          : channels.length === 0 ? <p className="mute">{p("noChannels")}</p>
          : channels.map((c) => <Checkbox key={c.id} checked={on.has(c.id)} onChange={(v) => { const n = new Set(on); if (v) n.add(c.id); else n.delete(c.id); setOn(n); key.current = newSaveKey(); }}>{c.channelName}</Checkbox>)}
      </Section>
      <div className="formbar"><Button variant="primary" type="submit" id="pos-save" disabled={saving}>{t("common", "save")}</Button><Button onClick={close}>{t("common", "cancel")}</Button></div>
    </form>
  );
}

