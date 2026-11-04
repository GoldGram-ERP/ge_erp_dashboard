"use client";
// The workspace engine. One config per business thing becomes a working screen on live data:
// views (list/report) with filters, chips, search, group-by, sum, sort, paging; a record sheet; create/edit/delete forms.
// Lists are TanStack queries (the last answer of the same query shows at once while the fresh one loads) and send ONLY the params the config names.
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { intText, milligramsText, piastresText } from "@/lib/format";
import type { MakeConfig, Row, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { buildQuery, initialViewState, rawValues, readFields, rowsOf, type ViewState } from "@/lib/fields";
import { useT } from "@/lib/t";
import { Select } from "../fields/Select";
import { FilterFields, useFieldsForm } from "../fields/useFieldsForm";
import { FormPage, FormSheet } from "./FormView";
import { RecordSheet } from "./RecordSheet";
import { Table } from "./Table";
import { EmptyState, Icon, Seg, Skeleton, ToastHost, toast } from "./ui";

export type Access = { canOpen?: (keys?: string[]) => boolean; isSuper?: boolean };
type Memory = { view: string; per: Record<string, ViewState> };
const memory = new Map<string, Memory>();                  // thing id -> view state, kept while the app stays open
const memoryOf = (id: string): Memory => { let m = memory.get(id); if (!m) memory.set(id, (m = { view: "", per: {} })); return m; };
const patchView = (id: string, viewId: string, next: ViewState) => { memoryOf(id).per[viewId] = next; };
const pickView = (id: string, viewId: string) => { memoryOf(id).view = viewId; };
export const resetThing = (id: string) => memory.delete(id);

/** The page component of a thing: `export default function Page() { return <ThingPage make={makeConfig} /> }` */
export function ThingPage({ make, access, initial }: { make: MakeConfig; access?: Access; initial?: { view?: string; query?: Record<string, string> } }) {
  const tr = useT();
  const cfg = useMemo(() => make(tr), [make, tr]);
  return <Engine key={cfg.id} cfg={cfg} access={access} initial={initial} />;
}

function Engine({ cfg, access, initial }: { cfg: ThingConfig; access?: Access; initial?: { view?: string; query?: Record<string, string> } }) {
  const tr = useT();
  const { L } = tr;
  const qc = useQueryClient();
  const seen = (keys?: string[]) => !keys || keys.length === 0 || (access?.canOpen?.(keys) ?? true);
  const isSuper = access?.isSuper ?? false;
  const views = cfg.views.filter((v) => seen(v.keys ?? cfg.keys));

  const mem = memoryOf(cfg.id);
  const [, bump] = useState(0);
  const view = views.find((v) => v.id === (initial?.view ?? mem.view)) ?? views[0];
  const [form, setForm] = useState<{ id: string; row: Row | null } | null>(null);
  const [opened, setOpened] = useState<{ row: Row; full: Row } | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);
  const unit = cfg.unit ?? L("سجل", "records");

  if (!view) return <EmptyState title={L("لا تملك صلاحية هذه الصفحة", "You do not have access to this page")} />;
  pickView(cfg.id, view.id);
  let vs = mem.per[view.id];
  if (!vs) {
    vs = initialViewState(view);
    for (const [k, v] of Object.entries(initial?.query ?? {})) { if (k === "q") vs.q = v; else if (k === "chip") vs.chip = v; else if (k in vs.filters) vs.filters[k] = v; }
    if (initial?.query && Object.keys(initial.query).length && view.runLabel) vs.ran = true;
    patchView(cfg.id, view.id, vs);
  }
  const set = (patch: Partial<ViewState>) => { patchView(cfg.id, view.id, { ...vs, ...patch }); bump((n) => n + 1); };
  const reload = () => qc.invalidateQueries({ queryKey: ["thing", cfg.id] });

  const openForm = (id: string, row: Row | null = null) => {
    if (!cfg.forms?.[id]) throw new Error(`Unknown form ${id} in ${cfg.id}`);
    setOpened(null); setForm({ id, row });
  };
  const openRecord = async (row: Row) => {
    const rec = cfg.record;
    if (!rec) return;
    try {
      let full = row;
      if (rec.endpoint) full = await api(rec.endpoint(row));
      if (rec.enrich) full = { ...full, ...(await rec.enrich(full)) };
      setOpened({ row, full });
    } catch (e: any) { toast(tr.errorText(e?.error ?? { message: "unexpected" }), { error: true }); }
  };

  // A page-display form takes the whole workspace
  const pageForm = form && cfg.forms?.[form.id]?.display === "page" ? cfg.forms[form.id] : null;
  if (pageForm) {
    return <div className="thing-root" style={{ position: "relative" }}><FormPage thingTitle={cfg.title} form={pageForm} row={form!.row} onClose={() => setForm(null)} onSaved={() => { set({ page: 1 }); reload(); }} /><ToastHost /></div>;
  }

  const creates = (view.create ?? cfg.create ?? []).filter((c) => seen(c.keys ?? cfg.keys));
  const actions = (view.actions ?? []).filter((a) => seen(a.keys ?? view.keys ?? cfg.keys));
  const chips = (view.chips ?? []).filter((c) => seen(c.keys) && (!c.superOnly || isSuper));
  const sheetForm = form && !pageForm ? cfg.forms![form.id] : null;

  return (
    <div className="thing-root fill" style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <Header cfg={cfg} creates={creates} actions={actions} view={view} vs={vs} onCreate={(id) => openForm(id)} reload={reload} />
      {views.length > 1 && <Seg className="page" label={L("العرض", "View")} items={views.map((v) => ({ id: v.id, label: v.label }))} value={view.id} onChange={(id) => { pickView(cfg.id, id); bump((n) => n + 1); }} />}
      <ViewBody key={view.id} cfg={cfg} view={view} vs={vs} set={set} chips={chips} unit={unit} flashId={flashId} onRow={openRecord} openForm={openForm} />
      {opened && cfg.record && (
        <RecordSheet rec={cfg.record} full={opened.full} row={opened.row} onClose={() => setOpened(null)} reload={reload} openForm={openForm} />
      )}
      {sheetForm && (
        <FormSheet key={form!.id + String(form!.row?.id ?? "")} thingTitle={cfg.title} form={sheetForm} row={form!.row} onClose={() => setForm(null)}
          onSaved={(answer) => {
            set({ page: 1 }); reload();
            const id = answer?.id ?? answer?.[view.rowKey ?? "id"];
            if (id) { setFlashId(String(id)); setTimeout(() => setFlashId(null), 2500); }
          }} />
      )}
      <ToastHost />
    </div>
  );
}

function Header({ cfg, creates, actions, view, vs, onCreate, reload }: { cfg: ThingConfig; creates: { form: string; label: string }[]; actions: NonNullable<ViewConfig["actions"]>; view: ViewConfig; vs: ViewState; onCreate: (id: string) => void; reload: () => void }) {
  const sub = useRef<HTMLDivElement>(null);
  return (
    <div className="head">
      <div><h1>{cfg.title}</h1><div className="sub" id="sub" ref={sub} aria-live="polite">&nbsp;</div></div>
      <div className="actions">
        {creates.map((c) => <button key={c.form + c.label} type="button" className="btn primary" onClick={() => onCreate(c.form)}><Icon name="plus" />{c.label}</button>)}
        {actions.map((a) => (
          <button key={a.label} type="button" className="btn quiet" onClick={() => a.run({ query: buildQuery(view, vs), rows: [], reload, toast })}>{a.icon && <Icon name={a.icon} />}{a.label}</button>
        ))}
      </div>
    </div>
  );
}

function ViewBody({ cfg, view, vs, set, chips, unit, flashId, onRow, openForm }: {
  cfg: ThingConfig; view: ViewConfig; vs: ViewState; set: (p: Partial<ViewState>) => void; chips: NonNullable<ViewConfig["chips"]>;
  unit: string; flashId: string | null; onRow: (row: Row) => void; openForm: (id: string, row?: Row | null) => void;
}) {
  const tr = useT();
  const { L, errorText } = tr;
  const query = buildQuery(view, vs);
  const q = useQuery({
    queryKey: ["thing", cfg.id, view.id, query],
    enabled: vs.ran,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => (view.load ? view.load(query, { signal }) : api(view.endpoint!, { query, signal })),
  });
  const answer = q.data;
  let rows: Row[] = answer ? rowsOf(answer, view.rowsPath) : [];
  if (answer && view.transform) rows = view.transform(rows, answer);
  const total = answer ? (view.totalPath ? Number(view.totalPath.split(".").reduce((o: any, k) => o?.[k], answer)) : (answer.total ?? answer.count ?? rows.length)) : NaN;

  // the sub line under the title: count, sum, extra
  let sub = " ";
  if (answer) {
    sub = `${intText(Number.isFinite(total) ? total : rows.length)} ${unit}`;
    if (view.sum) {
      const s = rows.reduce((a, r) => a + Number(r[view.sum!.key] ?? 0), 0), t = view.sum.type;
      sub += ` · ${view.sum.label} ${t === "weight" ? milligramsText(s) : t === "int" ? intText(s) : piastresText(s)}${t === "money" ? L(" ج.م", " EGP") : t === "weight" ? L(" جم", " g") : ""}${view.paging ? L(" (هذه الصفحة)", " (this page)") : ""}`;
    }
    if (view.answerExtra) sub += ` · ${view.answerExtra(answer)}`;
  }
  useEffect(() => { const el = document.getElementById("sub"); if (el) el.textContent = sub; }, [sub]);

  // search, debounced
  const [qText, setQText] = useState(vs.q);
  useEffect(() => { if (qText.trim() === vs.q) return; const t = setTimeout(() => set({ q: qText.trim(), page: 1 }), 280); return () => clearTimeout(t); });

  // filters: a plain filter applies when it changes, a report's on Run; invalid filters (until before from) show their message and do not apply
  const filters = view.filters ?? [];
  const ff = useFieldsForm(filters, vs.filters);
  const apply = async (run: boolean) => {
    const r = readFields(ff.getValues(), filters, tr);
    ff.clearErrors();
    if (Object.keys(r.errors).length) { ff.setErrors(r.errors); return false; }
    set({ filters: { ...vs.filters, ...r.values }, page: 1, ...(run ? { ran: true } : {}) });
    return true;
  };
  useEffect(() => {
    if (view.runLabel || !filters.length) return;
    const s = ff.watch(() => { apply(false); });
    return () => s.unsubscribe();
  });

  const paging = view.paging || null;
  const pageSize = paging ? (paging.sizeParam === null ? (paging.size ?? 20) : vs.size) : 0;   // fixed-size lists page at the backend's own size
  const pages = Number.isFinite(total) && pageSize ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const filtered = !!vs.q || (view.chips && vs.chip !== view.chips[0].id) || Object.values(vs.filters).some((v) => v && v !== true);

  const clear = () => {
    const s = initialViewState(view);
    setQText(""); ff.reset(rawValues(filters, s.filters));
    set({ q: "", chip: s.chip, filters: s.filters, page: 1 });
  };

  return (
    <>
      {(filters.length > 0 || view.runLabel) && (
        <div className="filters" id="filters" onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).matches("input")) { e.preventDefault(); apply(true); } }}>
          <FilterFields form={ff} fields={filters} />
          {view.runLabel && <button type="button" className="btn primary" id="run" onClick={() => apply(true)}>{view.runLabel}</button>}
        </div>
      )}
      <div className="tools">
        {view.search && (
          <label className="search">
            <Icon name="search" />
            <input id="q" placeholder={view.search.placeholder ?? L("بحث", "Search")} value={qText} aria-label={L("بحث", "Search")} autoComplete="off" onChange={(e) => setQText(e.target.value)} />
          </label>
        )}
        {chips.length > 1 && <Seg label={L("تصفية", "Filter")} items={chips} value={vs.chip} onChange={(id) => set({ chip: id, page: 1 })} />}
        {view.groupBy?.length ? (
          <>
            <span className="lbl">{L("قسّم حسب", "Group by")}</span>
            <Seg label={L("قسّم حسب", "Group by")} items={[{ id: "", label: L("بدون", "None") }, ...view.groupBy.map((g, i) => ({ id: String(i), label: g.label }))]} value={vs.group} onChange={(id) => set({ group: id })} />
          </>
        ) : null}
      </div>

      <div className="table" id="tbl">
        {!vs.ran ? <EmptyState title={L("اختر الفلاتر ثم اضغط «" + view.runLabel + "»", "Pick the filters, then press “" + view.runLabel + "”")} />
          : q.isError ? (
            <div className="empty"><Icon name="alert" size={36} /><strong>{(q.error as any)?.error ? errorText((q.error as any).error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")}</strong>
              <button type="button" className="btn quiet" id="retry" onClick={() => q.refetch()}><Icon name="refresh" />{L("إعادة المحاولة", "Try again")}</button></div>
          ) : !answer ? <Skeleton />
          : !rows.length ? (
            <EmptyState title={filtered ? L("لا توجد نتائج", "No results") : L("لا توجد سجلات بعد", "No records yet")} text={filtered ? L("جرّب كلمة أخرى أو غيّر الفلاتر.", "Try another word or change the filters.") : ""}>
              {filtered && <button type="button" className="btn quiet" id="clear" onClick={clear}>{L("مسح البحث والفلاتر", "Clear search and filters")}</button>}
            </EmptyState>
          ) : <Table view={view} rows={rows} vs={vs} answer={answer} unit={unit} flashId={flashId}
              onSort={(k) => set({ sort: { key: k, dir: vs.sort?.key === k && vs.sort.dir === "asc" ? "desc" : "asc" }, page: 1 })}
              onRow={(r) => (typeof view.onRow === "function" ? view.onRow(r, { open: onRow, openForm }) : onRow(r))} />}
      </div>

      {paging && answer && rows.length > 0 && Number.isFinite(total) && (
        <div className="pager" id="pager">
          <span>{L("الصفحة", "Page")} {intText(vs.page)} {L("من", "of")} {intText(pages)}</span>
          <span className="actions">
            {paging.sizeParam !== null && (
              <label className="lbl">{L("في الصفحة", "Per page")}{" "}
                <Select id="size" name="size" className="sm" searchable={false} value={String(vs.size)} onChange={(v) => v && set({ size: +v, page: 1 })}
                  options={(paging.sizes ?? [25, 50, 100]).map((n) => [String(n), String(n)] as [string, string])} />
              </label>
            )}
            <button type="button" className="btn quiet sm" id="prev" disabled={vs.page <= 1} onClick={() => set({ page: vs.page - 1 })}>{L("السابق", "Previous")}</button>
            <button type="button" className="btn quiet sm" id="next" disabled={vs.page >= pages} onClick={() => set({ page: vs.page + 1 })}>{L("التالي", "Next")}</button>
          </span>
        </div>
      )}
    </>
  );
}
