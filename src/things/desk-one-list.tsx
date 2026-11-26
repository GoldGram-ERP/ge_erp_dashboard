"use client";
// The redesigned Sales desk's drafts list on the Hallmark kit: the engine's `list` slot. The data, the address (?q, ?chip, ?branchId, ?sort) and the row opener are
// the engine's (useViewRows, the same query the old table read); this file only draws it: actions, one filter row, one inset group of rows, paging, every state.
import { useEffect, useState } from "react";
import type { ListSlotProps, Row } from "@/lib/engine-types";
import { initialViewState } from "@/lib/fields";
import { dateText, intText, piastresText } from "@/lib/format";
import { kindOfType, sortRows } from "@/lib/sort";
import { useT } from "@/lib/t";
import { Ltr, useViewRows } from "@/components/engine";
import { useLookup } from "@/components/fields/useLookup";
import { Banner, Button, Chip, EmptyState, Icons, Picker, SearchPill, Segmented, TapRow } from "@/components/hallmark";

// The sort choices of the page (only when the whole list is on it, as the old table did): key, direction, how it reads, the value it sorts by.
const SORTS: { id: string; key: string; dir: "asc" | "desc"; type?: string; get: (r: Row) => unknown }[] = [
  { id: "draftNumber:desc", key: "draftNumber", dir: "desc", type: "int", get: (r) => Number(r.draftNumber) },
  { id: "customerName:asc", key: "customerName", dir: "asc", get: (r) => r.customerName },
  { id: "total:desc", key: "total", dir: "desc", type: "money", get: (r) => Number(r.totals?.total ?? 0) },
  { id: "createdDay:desc", key: "createdDay", dir: "desc", type: "date", get: (r) => r.createdDay },
];

export default function DeskOneList({ cfgId, view, vs, set, sortToUrl, chips, unit, creates, onCreate, onRow }: ListSlotProps) {
  const tr = useT();
  const { L, errorText } = tr;
  const { q, answer, rows: got, total, pages, filtered, whole } = useViewRows(cfgId, view, vs);

  // search, debounced (as the engine's table)
  const [qText, setQText] = useState(vs.q);
  useEffect(() => { if (qText.trim() === vs.q) return; const t = setTimeout(() => set({ q: qText.trim(), page: 1 }), 280); return () => clearTimeout(t); });

  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    on(); window.addEventListener("online", on); window.addEventListener("offline", on);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", on); };
  }, []);

  const branchFilter = view.filters?.find((f) => f.name === "branchId");   // present only for a person who sees every branch
  const branches = useLookup(branchFilter?.optionsFrom).options ?? [];
  const sort = SORTS.find((s) => vs.sort && s.key === vs.sort.key && s.dir === vs.sort.dir);
  const rows = whole && sort ? sortRows(got, sort.get, kindOfType(sort.type), sort.dir, tr.locale) : got;
  const count = Number.isFinite(total) ? total : rows.length;
  const hasCreate = (id: string) => creates.some((c) => c.form === id);

  const clear = () => { const s = initialViewState(view); setQText(""); set({ q: "", chip: s.chip, filters: s.filters, page: 1 }); };
  const status = (r: Row) => (r.status === "deleted" ? <Chip tone="carnelian">{L("محذوفة", "Deleted")}</Chip>
    : r.status === "completed" ? <Chip tone="malachite">{L("مكتملة", "Completed")}</Chip>
    : r.locked ? <Chip tone="amber">{L("مقفولة", "Locked")}</Chip>
    : <Chip tone="lapis">{L("مفتوحة", "Open")}</Chip>);
  const newDraft = hasCreate("draft") && <Button variant="primary" id="new-draft" icon={<Icons.Plus aria-hidden />} onClick={() => onCreate("draft")}>{L("مسودة جديدة", "New draft")}</Button>;

  return (
    <div className="hallmark mx-auto flex w-full max-w-[60rem] flex-col gap-3 pb-6 pt-1">
      {!online && <Banner tone="warn" icon={<Icons.WifiOff aria-hidden />} live>{L("مفيش إنترنت · بنعرض آخر حاجة اتحمّلت", "You're offline · showing what loaded last")}</Banner>}

      <div className="flex flex-wrap items-center gap-2">
        {answer && <Chip>{intText(count)} {tr.isAr && count >= 3 && count <= 10 ? "مسودات" : unit}</Chip>}
        {answer && q.isFetching && <Chip tone="neutral" icon={<Icons.LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />}>{L("بيتحدّث…", "Updating…")}</Chip>}
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {hasCreate("open") && <Button variant="soft" id="open-by-number" icon={<Icons.Hash aria-hidden />} onClick={() => onCreate("open")}>{L("افتح مسودة برقمها", "Open a draft by number")}</Button>}
          {newDraft}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" id="filters">
        {branchFilter && (
          <Picker id="branchId" prefix={L("الفرع", "Branch")} value={String(vs.filters.branchId ?? "")} onChange={(v) => set({ filters: { ...vs.filters, branchId: v }, page: 1 })}
            options={[{ value: "", label: L("كل الفروع", "All branches") }, ...branches.map((o) => ({ value: String(o[0]), label: o[1] }))]} />
        )}
        {view.search && <SearchPill id="q" value={qText} onChange={setQText} label={L("دوّر", "Search")} placeholder={L("رقم المسودة أو العميل أو التليفون", "Draft number, customer or phone")} />}
        {chips.length > 1 && <Segmented size="sm" label={L("الحالة", "Status")} value={vs.chip} onChange={(id) => set({ chip: id, page: 1 })} options={chips.map((c) => ({ value: c.id, label: c.label }))} />}
        {whole && rows.length > 1 && (
          <Picker id="sort" prefix={L("الترتيب", "Sort")} value={sort?.id ?? ""}
            onChange={(v) => { const s = SORTS.find((x) => x.id === v); set({ sort: s ? { key: s.key, dir: s.dir } : null }); if (s) sortToUrl(s.key, s.dir); }}
            options={[{ value: "", label: L("زي ما هي", "As listed") }, { value: SORTS[0].id, label: L("الرقم", "Number") }, { value: SORTS[1].id, label: L("العميل", "Customer") },
              { value: SORTS[2].id, label: L("الإجمالي", "Total") }, { value: SORTS[3].id, label: L("اليوم", "Day") }]} />
        )}
      </div>

      {q.isError ? (
        <Banner tone="error" icon={<Icons.TriangleAlert aria-hidden />} live
          action={<Button size="sm" variant="soft" id="retry" className="bg-content" icon={<Icons.RotateCw aria-hidden />} pending={q.isFetching} onClick={() => q.refetch()}>{L("حاول تاني", "Try again")}</Button>}>
          {(q.error as any)?.error ? errorText((q.error as any).error) : L("ماعرفناش نجيب المسودات.", "Couldn't load the drafts.")}
        </Banner>
      ) : !answer ? (
        <div className="hm-grp" role="status" aria-label={L("بيحمّل", "Loading")}>
          {["w-2/3", "w-1/2", "w-3/4", "w-3/5", "w-2/5", "w-3/5"].map((w, i) => (
            <div key={i} className="flex min-h-[2.75rem] items-center gap-3 px-3 py-2">
              <span className="h-5 w-12 animate-pulse rounded-full bg-fill-strong motion-reduce:animate-none" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5"><span className={`h-3 animate-pulse rounded-full bg-fill-strong motion-reduce:animate-none ${w}`} /><span className="h-2.5 w-20 animate-pulse rounded-full bg-fill motion-reduce:animate-none" /></span>
              <span className="h-3 w-16 animate-pulse rounded-full bg-fill-strong motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      ) : !rows.length ? (
        filtered ? (
          <EmptyState icon={<Icons.SearchX aria-hidden />} title={L("مفيش مسودات بالفلتر ده", "No drafts match this filter")} body={L("جرّب كلمة تانية أو امسح الفلتر.", "Try another word or clear the filter.")}
            action={<Button variant="soft" id="clear" icon={<Icons.X aria-hidden />} onClick={clear}>{L("امسح الفلتر", "Clear the filter")}</Button>} />
        ) : (
          <EmptyState icon={<Icons.FileText aria-hidden />} title={L("لسه مفيش مسودات", "No drafts yet")} body={L("اعمل أول واحدة: اختار القطع واكتب العميل، وهتتحفظ برقم.", "Make the first one: pick the pieces, add the customer, and it saves with a number.")} action={newDraft} />
        )
      ) : (
        <div className="hm-grp @container" role="list" id="drafts">
          {rows.map((r) => (
            <div role="listitem" key={String(r.id)} className={r.deletedAt ? "opacity-60" : undefined}>
              <TapRow onClick={() => onRow(r)} data-k={String(r.id)} aria-label={`${L("مسودة", "Draft")} ${r.draftNumber} · ${r.customerName ?? ""}`}
                className={branchFilter
                  ? "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 [grid-template-areas:'n_c_t'_'n_m_s'] @min-[44rem]:grid-cols-[5.5rem_minmax(0,1fr)_7.5rem_6.5rem_7.5rem_5.5rem_5.5rem] @min-[44rem]:[grid-template-areas:'n_c_p_b_t_s_d']"
                  : "grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 [grid-template-areas:'n_c_t'_'n_m_s'] @min-[44rem]:grid-cols-[5.5rem_minmax(0,1fr)_7.5rem_7.5rem_5.5rem_5.5rem] @min-[44rem]:[grid-template-areas:'n_c_p_t_s_d']"}>
                <span className="flex flex-col items-start gap-1 self-center [grid-area:n]">
                  <Chip><Ltr>{r.draftNumber}</Ltr></Chip>
                  {r.operation === "buy" && <Chip tone="amber">{L("شراء", "Buy")}</Chip>}
                </span>
                <span className="truncate font-semibold [grid-area:c]" title={r.customerName ?? ""}>{r.customerName || "—"}</span>
                <span className="meta flex min-w-0 items-center gap-1.5 [grid-area:m] @min-[44rem]:contents">
                  <span className="shrink-0 whitespace-nowrap @min-[44rem]:[grid-area:p]"><Ltr>{r.customerPhone || "—"}</Ltr></span>
                  {branchFilter && <span className="min-w-0 truncate before:me-1.5 before:content-['·'] @min-[44rem]:[grid-area:b] @min-[44rem]:before:content-none" title={r.branchName ?? ""}>{r.branchName || "—"}</span>}
                  <span className="hidden whitespace-nowrap @min-[44rem]:inline @min-[44rem]:[grid-area:d] @min-[44rem]:text-end"><Ltr>{dateText(r.createdDay)}</Ltr></span>
                </span>
                <span className="whitespace-nowrap text-end font-semibold tabular-nums [grid-area:t]"><Ltr>{piastresText(r.totals?.total ?? 0)}</Ltr> <span className="meta">{L("ج.م", "EGP")}</span></span>
                <span className="justify-self-end @min-[44rem]:justify-self-start [grid-area:s]">{status(r)}</span>
              </TapRow>
            </div>
          ))}
        </div>
      )}

      {answer && rows.length > 0 && (pages > 1 || vs.page > 1) && (
        <div className="flex items-center justify-center gap-2" id="pager">
          <Button size="sm" variant="soft" id="prev" disabled={vs.page <= 1} icon={<Icons.ChevronLeft aria-hidden className="rtl:rotate-180" />} onClick={() => set({ page: vs.page - 1 })}>{L("اللي قبلها", "Previous")}</Button>
          <Chip>{L("صفحة", "Page")} {intText(vs.page)} {L("من", "of")} {intText(pages)}</Chip>
          <Button size="sm" variant="soft" id="next" disabled={vs.page >= pages} onClick={() => set({ page: vs.page + 1 })}>{L("اللي بعدها", "Next")}<Icons.ChevronRight aria-hidden className="rtl:rotate-180" /></Button>
        </div>
      )}
    </div>
  );
}
