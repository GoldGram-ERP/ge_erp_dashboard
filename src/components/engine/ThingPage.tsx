"use client";
// The workspace engine. One config per business thing becomes a working screen on live data:
// views (list/report) with filters, chips, search, group-by, sum, sort, paging; a record sheet; create/edit/delete forms.
// Lists are TanStack queries (the last answer of the same query shows at once while the fresh one loads) and send ONLY the params the config names.
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { usePathname, useRouter } from "@/i18n/navigation";
import { intText, milligramsText, piastresText } from "@/lib/format";
import type { MakeConfig, Row, RowJump, ThingConfig, ViewConfig } from "@/lib/engine-types";
import { otherLayout } from "@/lib/search";
import { buildQuery, initialViewState, rawValues, readFields, rowsOf, type ViewState } from "@/lib/fields";
import { useT } from "@/lib/t";
import { parseDeepLink, pruneParams, withParams } from "./query";
import { Select } from "../fields/Select";
import { FilterFields, useFieldsForm } from "../fields/useFieldsForm";
import { FormPage, FormSheet } from "./FormView";
import { RecordSheet } from "./RecordSheet";
import { Table, sortKeysOf } from "./Table";
import { exportActions } from "@/things/report-export";
import { EmptyState, Icon, Seg, Skeleton, ToastHost, toast, useConfirm } from "./ui";

export type Access = { canOpen?: (keys?: string[]) => boolean; isSuper?: boolean };
type Memory = { view: string; per: Record<string, ViewState>; applied?: string };
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
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const dl = useMemo(() => parseDeepLink(search), [search]);
  const seen = (keys?: string[]) => !keys || keys.length === 0 || (access?.canOpen?.(keys) ?? true);
  const isSuper = access?.isSuper ?? false;
  const views = cfg.views.filter((v) => seen(v.keys ?? cfg.keys));

  // The address is the single source of truth for view, create form and open record. `addr` is the address as last written (router.replace lands a tick later).
  const addr = useRef(search);
  useEffect(() => { addr.current = search; }, [search]);
  const edit = (fn: (s: string) => string) => {
    const next = fn(addr.current);
    if (next === addr.current) return;
    addr.current = next;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  };
  const go = (patch: Record<string, string | null | undefined>, fresh = false) => edit((s) => withParams(s, patch, fresh));

  const mem = memoryOf(cfg.id);
  const [, bump] = useState(0);
  const view = views.find((v) => v.id === (dl.view ?? initial?.view ?? mem.view)) ?? views[0];
  const [editing, setEditing] = useState<{ id: string; row: Row } | null>(null);   // an edit form; a create form lives in the address (?new=)
  const [picked, setPicked] = useState<Row | null>(null);                            // the row clicked for the record sheet; the sheet itself lives in the address (?open=)
  const [flashId, setFlashId] = useState<string | null>(null);
  const unit = cfg.unit ?? L("سجل", "records");
  const filterNames = useMemo(() => ["sort", "dir", ...cfg.views.flatMap((v) => (v.filters ?? []).map((f) => f.name))], [cfg]);

  let vs: ViewState | null = null;
  if (view) {
    pickView(cfg.id, view.id);
    vs = mem.per[view.id] ?? null;
    if (!vs) {
      vs = initialViewState(view);
      for (const [k, v] of Object.entries(initial?.query ?? {})) { if (k === "q") vs.q = v; else if (k === "chip") vs.chip = v; else if (k in vs.filters) vs.filters[k] = v; }
      if (initial?.query && Object.keys(initial.query).length && view.runLabel) vs.ran = true;
      patchView(cfg.id, view.id, vs);
    }
  }
  // address values prefill the view (q, chip, a filter's name), once per address
  let rel = "";
  if (view && vs) {
    const hit = Object.entries(dl.query).filter(([k]) => k === "q" || k === "chip" || k in vs!.filters);
    rel = JSON.stringify(hit);
    if (mem.applied !== search) {
      mem.applied = search;
      // ?sort=<column>&dir=asc|desc: the sorted column survives a refresh, like the filters do (a key the view cannot sort by is ignored)
      const sk = dl.query.sort, sd = dl.query.dir;
      if (sk && (sd === "asc" || sd === "desc") && sortKeysOf(view).includes(sk)) vs.sort = { key: sk, dir: sd };
      if (hit.length) {
        for (const [k, v] of hit) { if (k === "q") vs.q = v; else if (k === "chip") vs.chip = v; else vs.filters[k] = v; }
        vs.page = 1;
        if (view.runLabel) vs.ran = true;
      }
    }
  }
  const set = (patch: Partial<ViewState>) => { patchView(cfg.id, view!.id, { ...vs!, ...patch }); bump((n) => n + 1); };
  const reload = () => qc.invalidateQueries({ queryKey: ["thing", cfg.id] });

  const creates = view ? (view.create ?? cfg.create ?? []).filter((c) => seen(c.keys ?? cfg.keys)) : [];
  const allCreates = [...(cfg.create ?? []), ...cfg.views.flatMap((v) => v.create ?? [])].filter((c) => seen(c.keys ?? cfg.keys));
  // ?new=<form id>; anything else (a view id, "1") means this view's first create button
  const newId = !dl.newForm ? undefined : allCreates.some((c) => c.form === dl.newForm) ? dl.newForm : cfg.forms?.[dl.newForm] ? undefined : creates[0]?.form;
  const form = editing ?? (newId && cfg.forms?.[newId] ? { id: newId, row: (cfg.forms[newId].byId && dl.open ? { id: dl.open } : null) as Row | null } : null);

  const openForm = (id: string, row: Row | null = null) => {
    if (!cfg.forms?.[id]) throw new Error(`Unknown form ${id} in ${cfg.id}`);
    if (row) { setEditing({ id, row }); go(cfg.forms[id].byId && row.id ? { open: String(row.id), new: id } : { open: null, new: null }); } else go({ open: null, new: id });
  };
  const closeForm = () => { setEditing(null); edit((s) => pruneParams(s, filterNames)); };
  const closeRecord = () => go({ open: null });
  const openRecord = (row: Row) => { if (view?.record ?? cfg.record) { setPicked(row); go({ open: String(row[view?.rowKey ?? "id"] ?? "") }); } };

  // the record sheet: its id is in the address; the full record is fetched fresh each time it opens
  const rec = view?.record ?? cfg.record;   // a view may carry its own record sheet (a tab of another kind of row)
  const rowKey = view?.rowKey ?? "id";
  const openRow = dl.open && rec && !form ? (picked && String(picked[rowKey]) === dl.open ? picked : rec.endpoint ? { [rowKey]: dl.open } : null) : null;
  const recQ = useQuery({
    queryKey: ["thing", cfg.id, "record", dl.open],
    enabled: !!openRow, gcTime: 0, refetchOnWindowFocus: false, retry: false,
    queryFn: async () => {
      let full: Row = openRow!;
      if (rec!.endpoint) full = await api(rec!.endpoint(openRow!));
      if (rec!.enrich) full = { ...full, ...(await rec!.enrich(full)) };
      return full;
    },
  });
  const recFailed = recQ.error;
  useEffect(() => {
    if (!recFailed) return;
    toast(tr.errorText((recFailed as any)?.error ?? { message: "unexpected" }), { error: true });
    go({ open: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recFailed]);
  const opened = openRow && recQ.data ? { row: openRow, full: recQ.data } : null;

  if (!view || !vs) return <EmptyState title={L("لا تملك صلاحية هذه الصفحة", "You do not have access to this page")} />;

  // A page-display form takes the whole workspace
  const pageForm = form && cfg.forms?.[form.id]?.display === "page" ? cfg.forms[form.id] : null;
  if (pageForm) {
    return <div className="thing-root" style={{ position: "relative" }}><FormPage thingTitle={cfg.title} form={pageForm} row={form!.row} onClose={closeForm} onOpen={openRecord} onSaved={() => { set({ page: 1 }); reload(); }} /><ToastHost /></div>;
  }

  const actions = [...(view.actions ?? []), ...exportActions(view, tr)].filter((a) => seen(a.keys ?? view.keys ?? cfg.keys));
  const chips = (view.chips ?? []).filter((c) => seen(c.keys) && (!c.superOnly || isSuper));
  const sheetForm = form && !pageForm ? cfg.forms![form.id] : null;

  return (
    <div className="thing-root fill" style={{ position: "relative", display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
      <Header cfg={cfg} creates={creates} actions={actions} view={view} vs={vs} onCreate={(id) => openForm(id)} reload={reload} />
      {views.length > 1 && <Seg className="page" label={L("العرض", "View")} items={views.map((v) => ({ id: v.id, label: v.label }))} value={view.id} onChange={(id) => { pickView(cfg.id, id); bump((n) => n + 1); go({ view: id }, true); }} />}
      <ViewBody key={view.id + rel} cfg={cfg} view={view} vs={vs} set={set} sortToUrl={(k, d) => go({ sort: k, dir: d })} chips={chips} unit={unit} flashId={flashId} onRow={openRecord} openForm={openForm}
        jump={(j) => go({ view: j.view, ...Object.fromEntries(Object.entries(j.filters ?? {}).map(([k, v]) => [k, v === undefined || v === null ? null : String(v)])) }, true)} />
      {opened && rec && (
        <RecordSheet rec={rec} full={opened.full} row={opened.row} onClose={closeRecord} reload={reload} openForm={openForm} />
      )}
      {sheetForm && (
        <FormSheet key={form!.id + String(form!.row?.id ?? "")} thingTitle={cfg.title} form={sheetForm} row={form!.row} onClose={closeForm} onOpen={openRecord}
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
  const [confirm, confirmDialog] = useConfirm();
  return (
    <div className="head">
      <div><h1>{cfg.title}</h1><div className="sub" id="sub" ref={sub} aria-live="polite">&nbsp;</div></div>
      <div className="actions">
        {creates.map((c) => <button key={c.form + c.label} type="button" className="btn primary" onClick={() => onCreate(c.form)}><Icon name="plus" />{c.label}</button>)}
        {actions.map((a) => (
          <button key={a.label} type="button" className="btn quiet" onClick={() => a.run({ query: buildQuery(view, vs), rows: [], reload, toast, confirm })}>{a.icon && <Icon name={a.icon} />}{a.label}</button>
        ))}
        {confirmDialog}
      </div>
    </div>
  );
}

function ViewBody({ cfg, view, vs, set, sortToUrl, chips, unit, flashId, onRow, openForm, jump }: {
  cfg: ThingConfig; view: ViewConfig; vs: ViewState; set: (p: Partial<ViewState>) => void; sortToUrl: (key: string, dir: "asc" | "desc") => void; chips: NonNullable<ViewConfig["chips"]>;
  unit: string; flashId: string | null; onRow: (row: Row) => void; openForm: (id: string, row?: Row | null) => void; jump: (j: RowJump) => void;
}) {
  const tr = useT();
  const { L, errorText } = tr;
  const query = buildQuery(view, vs);
  const q = useQuery({
    queryKey: ["thing", cfg.id, view.id, query],
    enabled: vs.ran,
    placeholderData: keepPreviousData,
    // A search that finds nothing is tried once more as the same keys on the other language's keyboard ("lfduhj" is "مبيعات").
    queryFn: async ({ signal }) => {
      const run = (qq: typeof query) => (view.load ? view.load(qq, { signal }) : api(view.endpoint!, { query: qq, signal }));
      const first = await run(query);
      const key = view.search?.param ?? "search", typed = query[key];
      if (typeof typed === "string" && typed.trim() && rowsOf(first, view.rowsPath).length === 0) {
        const alt = otherLayout(typed);
        if (alt) { const second = await run({ ...query, [key]: alt }); if (rowsOf(second, view.rowsPath).length) return second; }
      }
      return first;
    },
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

      <div className={view.narrow ? "table narrow" : "table"} id="tbl">
        {!vs.ran ? <EmptyState title={L("اختر الفلاتر ثم اضغط «" + view.runLabel + "»", "Pick the filters, then press “" + view.runLabel + "”")} />
          : q.isError ? (
            <div className="empty"><Icon name="alert" size={20} /><strong>{(q.error as any)?.error ? errorText((q.error as any).error) : L("حدث خطأ. حاول مرة أخرى.", "Something went wrong. Try again.")}</strong>
              {/* what the server answered, so a failure can be told apart without opening the network tab */}
              {(q.error as any)?.status !== undefined && <span className="help" dir="ltr" id="list-error-detail">{`HTTP ${(q.error as any).status} · ${(q.error as any).error?.message ?? ""}`}</span>}
              <button type="button" className="btn quiet" id="retry" onClick={() => q.refetch()}><Icon name="refresh" />{L("إعادة المحاولة", "Try again")}</button></div>
          ) : !answer ? <Skeleton />
          : !rows.length ? (
            <EmptyState title={filtered ? L("لا توجد نتائج", "No results") : L("لا توجد سجلات بعد", "No records yet")} text={filtered ? L("جرّب كلمة أخرى أو غيّر الفلاتر.", "Try another word or change the filters.") : ""}>
              {filtered && <button type="button" className="btn quiet" id="clear" onClick={clear}>{L("مسح البحث والفلاتر", "Clear search and filters")}</button>}
            </EmptyState>
          ) : <Table view={view} rows={rows} vs={vs} answer={answer} unit={unit} flashId={flashId} whole={!paging || (Number.isFinite(total) && total <= rows.length && vs.page === 1)}
              onSort={(k, dir) => { set({ sort: { key: k, dir }, page: 1 }); sortToUrl(k, dir); }}
              onRow={(r) => {
                if (typeof view.onRow !== "function") return onRow(r);
                const j = view.onRow(r, { open: onRow, openForm, filters: vs.filters });
                if (j && typeof j === "object" && j.view) jump(j);
              }} />}
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
