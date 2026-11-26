"use client";
// The redesigned price board's two request tabs on the Hallmark kit (owner, 2026-11-25, backend #228): «إرسال طلب» and «الطلبات».
// The rules, the list's query (chips, search, filters, paging) and the API calls are main's (price-requests-rules.ts, buildRequestsConfig in price-requests.tsx,
// price-request-form.tsx); only the drawing is new. The send form's items are the cards picked on the board, with the board's own counts.
// The list reads the engine's query key ["thing", "price-requests", …], so the live refresh topic "price-requests" reloads it as it reloads main's tab.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiFailure, newSaveKey } from "@/lib/api";
import type { Row as Rec } from "@/lib/engine-types";
import { code6 } from "@/lib/code6";
import { backendFieldErrors, initialViewState } from "@/lib/fields";
import { dateTimeText, intText, milligramsText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { Ltr, toast, useViewRows } from "@/components/engine";
import { useLookup } from "@/components/fields/useLookup";
import { ActionBar, Banner, Button, Chip, EmptyState, Field, Group, Icons, Input, Picker, Row, SearchPill, Segmented, Sheet, TapRow, TextArea } from "@/components/hallmark";
import { REQUEST_KINDS, REQUEST_NOTE_MAX, isRequestDecider, readRequestForm, requestKindText, requestLinesSummary, requestStatusText, requestStatusTone } from "./price-requests-rules";
import { buildRequestsConfig } from "./price-requests";

type Picked = { id: string; itemName: string; brandName: string; weightMg: number; quantity: number };
const toneOf = (status: string) => ({ good: "malachite", warn: "amber", off: "carnelian" } as const)[requestStatusTone(status)];

/** «إرسال طلب»: the board's picked items and counts, the type, the branch (an Admin), a first note; sent to the accountant. */
export function BoardSend({ picked, boardBranchId, onStep, onRemove, onPickMore, onSent }: {
  picked: Picked[]; boardBranchId: string; onStep: (id: string, by: number) => void; onRemove: (id: string) => void; onPickMore: () => void; onSent: () => void;
}) {
  const tr = useT();
  const { L } = tr;
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const branches = useLookup(isUser ? undefined : { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } }).options ?? [];
  const [branchId, setBranchId] = useState("");
  const branch = branchId || boardBranchId;
  const [kind, setKind] = useState("");
  const [note, setNote] = useState("");
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [general, setGeneral] = useState("");
  const [saving, setSaving] = useState(false);
  const saveKey = useRef(newSaveKey());
  const touch = () => { saveKey.current = newSaveKey(); setGeneral(""); };
  useEffect(touch, [picked.map((p) => `${p.id}:${p.quantity}`).join()]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    if (saving) return;
    const r = readRequestForm(L, kind, picked.map((p) => ({ itemId: p.id, quantity: String(p.quantity) })));
    const e = { ...r.errors };
    if (!isUser && !branch) e.branchId = L("اختار الفرع.", "Pick the branch.");
    setErrs(e);
    if (!r.payload || Object.keys(e).length > 0) { setGeneral(e.lines ?? L("في حاجة ناقصة، بصّ على اللي باللون الأحمر.", "Something is missing; check what is in red.")); return; }
    setSaving(true);
    try {
      const sent = await api<Rec>("/price-requests", { method: "POST", body: { ...r.payload, ...(isUser ? {} : { branchId: branch }), ...(note.trim() ? { note: note.trim() } : {}) }, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      toast(L(`تم إرسال الطلب رقم ${code6(sent.requestNumber)} للمحاسب`, `Request ${code6(sent.requestNumber)} sent to the accountant`));
      setKind(""); setNote(""); setErrs({}); setSaving(false);
      onSent();
    } catch (error) {
      setSaving(false);
      if (!(error instanceof ApiFailure)) { setGeneral(L("حصلت مشكلة، حاول تاني.", "Something went wrong. Try again.")); return; }
      const texts = backendFieldErrors(error.error, tr), fe: Record<string, string> = {};
      let gen = "";
      for (const f of ((error.error.fields ?? []) as { field: string; message?: string }[])) {
        const m = /^lines\.(\d+)\.(itemId|quantity)$/.exec(f.field);
        if (m) fe[`line${m[1]}${m[2] === "itemId" ? "Item" : "Quantity"}`] = f.message === "duplicateItem" ? L("الصنف ده متضاف قبل كده.", "This item is already added.") : (texts[f.field] ?? L("مش صالح.", "Not valid."));
        else if (["branchId", "kind", "note", "lines"].includes(f.field)) fe[f.field] = texts[f.field] ?? L("مش صالح.", "Not valid.");
        else gen = texts[f.field] ?? tr.errorText(error.error);
      }
      if (!Object.keys(fe).length && !gen) gen = tr.errorText(error.error);
      setErrs(fe); setGeneral(gen);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {general && <Banner tone="error" live>{general}</Banner>}
      <Banner>{L("علّم على الأصناف من لوحة الأسعار واختار العدد، والطلب هيوصل للمحاسب على طول. هيجيلك إشعار لما يتقبل أو يترفض.", "Tick the items on the price board and set the counts; the accountant is told at once. You are notified when it is accepted or rejected.")}</Banner>
      <div className="grid gap-3 reg:grid-cols-2">
        <Field label={L("نوع الطلب", "Request type")} required htmlFor="prq-kind" error={errs.kind || undefined}>
          <Picker id="prq-kind" ariaLabel={L("نوع الطلب", "Request type")} placeholder={L("اختار", "Choose")} value={kind || null} invalid={Boolean(errs.kind)}
            onChange={(v) => { touch(); setErrs((x) => ({ ...x, kind: "" })); setKind(v); }} options={REQUEST_KINDS.map((k) => ({ value: k, label: requestKindText(L, k) }))} />
        </Field>
        {!isUser && (
          <Field label={L("الفرع", "Branch")} required htmlFor="prq-branch" error={errs.branchId || undefined}>
            <Picker id="prq-branch" ariaLabel={L("الفرع", "Branch")} placeholder={L("اختار", "Choose")} value={branch || null} invalid={Boolean(errs.branchId)}
              onChange={(v) => { touch(); setErrs((x) => ({ ...x, branchId: "" })); setBranchId(v); }} options={branches.map((o) => ({ value: String(o[0]), label: o[1] }))} />
          </Field>
        )}
      </div>

      {picked.length === 0 ? (
        <EmptyState icon={<Icons.ListChecks aria-hidden />} title={L("لسه ما اخترتش أصناف", "No items picked yet")} body={L("ارجع للوحة وعلّم على الأصناف اللي عايز توافق عليها.", "Go back to the board and tick the items to ask about.")}
          action={<Button variant="soft" id="prq-pick" onClick={onPickMore}>{L("اختار من اللوحة", "Pick from the board")}</Button>} />
      ) : (
        <Group title={L("الأصناف", "Items")} action={<Button size="sm" variant="soft" id="prq-pick" icon={<Icons.Plus aria-hidden />} onClick={onPickMore}>{L("زوّد أصناف", "Add items")}</Button>}>
          {picked.map((p, i) => (
            <Row key={p.id}>
              <div className="flex items-center gap-2" data-line={i}>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{p.itemName}</span>
                  <span className="meta">{p.brandName} · <span dir="ltr">{milligramsText(p.weightMg)} g</span></span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-fill p-[3px]">
                  <Button iconOnly size="sm" variant="plain" icon={<Icons.Minus aria-hidden />} label={L("قطعة أقل", "One less")} disabled={p.quantity <= 1} onClick={() => onStep(p.id, -1)} />
                  <b className="min-w-6 text-center" dir="ltr" aria-live="polite">{p.quantity}</b>
                  <Button iconOnly size="sm" variant="plain" icon={<Icons.Plus aria-hidden />} label={L("قطعة زيادة", "One more")} onClick={() => onStep(p.id, 1)} />
                </span>
                <Button iconOnly size="sm" variant="plain" icon={<Icons.X aria-hidden />} label={L(`شيل ${p.itemName}`, `Remove ${p.itemName}`)} onClick={() => onRemove(p.id)} />
              </div>
              {(errs[`line${i}Item`] || errs[`line${i}Quantity`]) && <p className="mt-1 text-danger" role="alert">{errs[`line${i}Item`] || errs[`line${i}Quantity`]}</p>}
            </Row>
          ))}
        </Group>
      )}

      <Field label={L("ملاحظة", "Note")} optional htmlFor="prq-note" error={errs.note || undefined}>
        <TextArea id="prq-note" value={note} maxLength={REQUEST_NOTE_MAX} onChange={(ev) => { touch(); setNote(ev.target.value); }} />
      </Field>

      <ActionBar label={L("إرسال الطلب", "Send the request")} summary={<span className="flex flex-col"><span className="meta">{L("الأصناف", "Items")}</span><b className="text-title font-bold" dir="ltr">{intText(picked.length)}</b></span>}>
        <Button variant="primary" id="prq-send" pending={saving} disabled={picked.length === 0} onClick={() => void submit()}>{saving ? L("بيتبعت…", "Sending…") : L("ابعت الطلب", "Send the request")}</Button>
      </ActionBar>
    </div>
  );
}

/** «الطلبات»: own requests for a plain user, every branch's for a decider; the record in a sheet with its items, notes and the decision. */
export function BoardRequests({ openId }: { openId?: string | null }) {
  const tr = useT();
  const { L, errorText } = tr;
  const { data: me } = useMe();
  const decider = isRequestDecider(me);
  const view = useMemo(() => buildRequestsConfig(tr, decider).views[0], [tr, decider]);
  const [vs, setVs] = useState(() => initialViewState(view));
  const set = (p: Partial<typeof vs>) => setVs((s) => ({ ...s, ...p }));
  const setFilter = (name: string, v: string) => set({ filters: { ...vs.filters, [name]: v }, page: 1 });
  const { q, answer, rows, total, pages, filtered } = useViewRows("price-requests", view, vs);
  const [qText, setQText] = useState("");
  useEffect(() => { if (qText.trim() === vs.q) return; const t = setTimeout(() => set({ q: qText.trim(), page: 1 }), 280); return () => clearTimeout(t); });
  const branches = useLookup(decider ? { path: "/branches", value: "id", label: "branchName", query: { pageSize: undefined } } : undefined).options ?? [];
  const datesWrong = Boolean(vs.filters.fromDate && vs.filters.toDate && vs.filters.toDate < vs.filters.fromDate);
  const [open, setOpen] = useState<Rec | null>(openId ? { id: openId } : null);
  const count = Number.isFinite(total) ? total : rows.length;
  const clear = () => { setQText(""); setVs(initialViewState(view)); };

  return (
    <div className="flex flex-col gap-3 pb-6">
      <div className="flex flex-wrap items-center gap-2" id="filters">
        <Segmented size="sm" label={L("الحالة", "Status")} value={vs.chip} onChange={(id) => set({ chip: id, page: 1 })} options={(view.chips ?? []).map((c) => ({ value: c.id, label: c.label }))} />
        <SearchPill id="q" value={qText} onChange={setQText} label={L("دوّر", "Search")} placeholder={L("رقم الطلب أو اسم اللي بعته", "Request number or sender")} />
        <Picker id="kind" prefix={L("النوع", "Type")} value={String(vs.filters.kind ?? "")} onChange={(v) => setFilter("kind", v)}
          options={[{ value: "", label: L("كل الأنواع", "All types") }, ...REQUEST_KINDS.map((k) => ({ value: k, label: requestKindText(L, k) }))]} />
        {decider && (
          <Picker id="branchId" prefix={L("الفرع", "Branch")} value={String(vs.filters.branchId ?? "")} onChange={(v) => setFilter("branchId", v)}
            options={[{ value: "", label: L("كل الفروع", "All branches") }, ...branches.map((o) => ({ value: String(o[0]), label: o[1] }))]} />
        )}
        <label className="inline-flex items-center gap-1.5"><span className="meta">{L("من", "From")}</span>
          <Input type="date" id="fromDate" className="w-auto" value={String(vs.filters.fromDate ?? "")} aria-label={L("من تاريخ", "From date")} onChange={(e) => setFilter("fromDate", e.target.value)} /></label>
        <label className="inline-flex items-center gap-1.5"><span className="meta">{L("لحد", "To")}</span>
          <Input type="date" id="toDate" className="w-auto" value={String(vs.filters.toDate ?? "")} aria-label={L("إلى تاريخ", "To date")} aria-invalid={datesWrong || undefined} onChange={(e) => setFilter("toDate", e.target.value)} /></label>
        {filtered && <Button size="sm" variant="soft" id="clear" icon={<Icons.X aria-hidden />} onClick={clear}>{L("شيل الفلتر", "Clear filters")}</Button>}
        {answer && <Chip className="ms-auto">{intText(count)} {L("طلب", "requests")}</Chip>}
      </div>
      {datesWrong && <Banner tone="error" live>{L("«لحد» قبل «من»: صلّح التاريخ", "“To” is before “From”: fix the dates")}</Banner>}

      {q.isError ? (
        <Banner tone="error" live action={<Button size="sm" variant="soft" icon={<Icons.RotateCw aria-hidden />} pending={q.isFetching} onClick={() => q.refetch()}>{L("حاول تاني", "Try again")}</Button>}>
          {(q.error as any)?.error ? errorText((q.error as any).error) : L("ماعرفناش نجيب الطلبات.", "Couldn't load the requests.")}
        </Banner>
      ) : !answer ? (
        <div className="hm-grp" role="status" aria-label={L("بيحمّل", "Loading")}><Row><span className="meta">{L("بيحمّل…", "Loading…")}</span></Row></div>
      ) : !rows.length ? (
        <EmptyState icon={<Icons.Inbox aria-hidden />} title={filtered ? L("مفيش طلبات بالفلتر ده", "No requests match this filter") : L("لسه مفيش طلبات", "No requests yet")}
          action={filtered ? <Button variant="soft" icon={<Icons.X aria-hidden />} onClick={clear}>{L("شيل الفلتر", "Clear filters")}</Button> : undefined} />
      ) : (
        <div className="hm-grp" role="list" id="requests">
          {rows.map((r) => (
            <div role="listitem" key={String(r.id)}>
              <TapRow onClick={() => setOpen(r)} data-k={String(r.id)} aria-label={`${L("طلب", "Request")} ${code6(r.requestNumber)}`} className="flex items-center gap-3">
                <Chip><Ltr>{code6(r.requestNumber)}</Ltr></Chip>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold">{requestKindText(L, String(r.kind ?? ""))} · {r.requesterName}{decider && r.branchName ? ` · ${r.branchName}` : ""}</span>
                  <span className="meta truncate">{requestLinesSummary(r.lines)}</span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <Chip tone={toneOf(String(r.status))}>{requestStatusText(L, String(r.status))}</Chip>
                  <span className="meta whitespace-nowrap"><Ltr>{dateTimeText(r.createdAt)}</Ltr>{Number(r.notesCount) > 0 && <> · <Icons.MessageSquare aria-label={L("ملاحظات", "Notes")} className="inline size-3" /> <Ltr>{intText(Number(r.notesCount))}</Ltr></>}</span>
                </span>
              </TapRow>
            </div>
          ))}
        </div>
      )}

      {answer && rows.length > 0 && (pages > 1 || vs.page > 1) && (
        <div className="flex items-center justify-center gap-2" id="pager">
          <Button size="sm" variant="soft" disabled={vs.page <= 1} icon={<Icons.ChevronLeft aria-hidden className="rtl:rotate-180" />} onClick={() => set({ page: vs.page - 1 })}>{L("اللي قبلها", "Previous")}</Button>
          <Chip>{L("صفحة", "Page")} {intText(vs.page)} {L("من", "of")} {intText(pages)}</Chip>
          <Button size="sm" variant="soft" disabled={vs.page >= pages} onClick={() => set({ page: vs.page + 1 })}>{L("اللي بعدها", "Next")}<Icons.ChevronRight aria-hidden className="rtl:rotate-180" /></Button>
        </div>
      )}

      {open && <RequestSheet row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function RequestSheet({ row, onClose }: { row: Rec; onClose: () => void }) {
  const tr = useT();
  const { L, errorText } = tr;
  const qc = useQueryClient();
  const key = ["thing", "price-requests", "record", String(row.id)];
  const rec = useQuery<Rec>({ queryKey: key, queryFn: () => api(`/price-requests/${row.id}`) });
  const full: Rec = { ...row, ...(rec.data ?? {}) };
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "accepted" | "rejected" | "note">("");
  const [fail, setFail] = useState("");
  const saveKey = useRef(newSaveKey());
  const notes: Rec[] = Array.isArray(full.notes) ? full.notes : [];
  const lines: Rec[] = Array.isArray(full.lines) ? full.lines : [];

  async function act(what: "accepted" | "rejected" | "note") {
    if (busy) return;
    if (what === "note" && !text.trim()) { setFail(L("اكتب الملاحظة الأول.", "Write the note first.")); return; }
    setBusy(what); setFail("");
    try {
      const answer = what === "note"
        ? await api<Rec>(`/price-requests/${row.id}/notes`, { method: "POST", body: { note: text.trim() }, saveKey: saveKey.current })
        : await api<Rec>(`/price-requests/${row.id}/decision`, { method: "PUT", body: { status: what, ...(text.trim() ? { note: text.trim() } : {}) }, saveKey: saveKey.current });
      saveKey.current = newSaveKey();
      qc.setQueryData(key, answer);
      void qc.invalidateQueries({ queryKey: ["thing", "price-requests"] });
      toast(what === "accepted" ? L("الطلب اتقبل.", "Request accepted.") : what === "rejected" ? L("الطلب اترفض.", "Request rejected.") : L("الملاحظة اتضافت.", "Note added."));
      setText("");
    } catch (error) {
      setFail(error instanceof ApiFailure ? errorText(error.error) : L("حصلت مشكلة، حاول تاني.", "Something went wrong. Try again."));
    } finally { setBusy(""); }
  }

  const canDecide = Boolean(full.canDecide), canNote = Boolean(full.canAddNote);
  const footer = (canDecide || canNote) ? (
    <div className="flex w-full flex-col gap-2">
      <TextArea id="prq-sheet-note" aria-label={canDecide ? L("ملاحظة (اختياري مع القرار)", "Note (optional with the decision)") : L("الملاحظة", "Note")} placeholder={L("اكتب ملاحظة…", "Write a note…")}
        value={text} maxLength={REQUEST_NOTE_MAX} onChange={(e) => { saveKey.current = newSaveKey(); setFail(""); setText(e.target.value); }} />
      <div className="flex flex-wrap justify-end gap-2">
        {canNote && <Button variant="soft" id="prq-add-note" pending={busy === "note"} onClick={() => void act("note")}>{L("ضيف ملاحظة", "Add a note")}</Button>}
        {canDecide && <Button variant="danger" id="prq-reject" pending={busy === "rejected"} onClick={() => void act("rejected")}>{L("رفض", "Reject")}</Button>}
        {canDecide && <Button variant="primary" id="prq-accept" pending={busy === "accepted"} onClick={() => void act("accepted")}>{L("قبول", "Accept")}</Button>}
      </div>
    </div>
  ) : undefined;

  return (
    <Sheet open onOpenChange={(o) => { if (!o) onClose(); }} kind="side" width="md" title={<>{L("طلب", "Request")} <Ltr>{code6(full.requestNumber)}</Ltr></>} footer={footer}>
      <div className="flex flex-col gap-4">
        {fail && <Banner tone="error" live>{fail}</Banner>}
        {rec.isError && <Banner tone="warn" live>{L("ماعرفناش نجيب تفاصيل الطلب.", "Couldn't load the request.")}</Banner>}
        <Group>
          <Row label={L("الحالة", "Status")}><Chip tone={toneOf(String(full.status))}>{requestStatusText(L, String(full.status))}</Chip></Row>
          <Row label={L("نوع الطلب", "Request type")}>{requestKindText(L, String(full.kind ?? ""))}</Row>
          <Row label={L("الفرع", "Branch")}>{full.branchName ?? "—"}</Row>
          <Row label={L("بعته", "Sent by")}>{full.requesterName ?? "—"}</Row>
          <Row label={L("الوقت", "Time")}><Ltr>{dateTimeText(full.createdAt)}</Ltr></Row>
          {full.decidedByName ? <Row label={L("القرار", "Decision")}>{full.decidedByName} · <Ltr>{dateTimeText(full.decidedAt)}</Ltr></Row> : null}
          {full.decisionNote ? <Row label={L("ملاحظة القرار", "Decision note")}>{full.decisionNote}</Row> : null}
        </Group>
        <Group title={L("الأصناف", "Items")}>
          {lines.map((l, i) => <Row key={i}><span className="flex justify-between gap-2"><b>{l.itemName}</b><span dir="ltr">× {l.quantity}</span></span></Row>)}
        </Group>
        <Group title={<>{L("الملاحظات", "Notes")} <Ltr>({notes.length})</Ltr></>}>
          {notes.length === 0 ? <Row><span className="text-tertiary">{L("مفيش ملاحظات.", "No notes.")}</span></Row>
            : [...notes].reverse().map((n) => (
              <Row key={String(n.id)}>
                <span className="flex justify-between gap-2"><b>{n.authorName}</b><small className="meta" dir="ltr">{dateTimeText(n.createdAt)}</small></span>
                <p className="mt-0.5 whitespace-pre-wrap">{n.note}</p>
              </Row>
            ))}
        </Group>
      </div>
    </Sheet>
  );
}
