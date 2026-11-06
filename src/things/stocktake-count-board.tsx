"use client";
// The live board of one stock count (owner, 2026-11-05: "detailed as much as possible ... so they can see it live").
// Reads GET /stock-counts/:id/live (expected / counted / remaining in pieces, grams and 24K grams; by karat, item, category)
// and GET /stock-counts/:id/pieces (counted, remaining, no longer in stock; paged, searched on the server).
// Live: every few seconds while the page is visible and online (react-query pauses the interval when the tab is hidden and
// when offline), and at once after each scan (the scan invalidates ["stock-count", id]). A closed count is frozen: no polling.
import { Button, Checkbox, DataTable, Input, Seg, TextButton, Td, Tr } from "@/components/ui";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { milligramsText, timeText } from "@/lib/format";
import { useT } from "@/lib/t";
import { Icon } from "@/components/engine";
import { CopyButton } from "@/components/shell/copy-button";

export const LIVE_EVERY_MS = 5000;
type Tally = { pieces: number; weightMg: number; weight24Mg: number };
type Line = { expected: Tally; counted: Tally; remaining: Tally };
type ItemLine = Line & { itemId: string; itemCode: number; itemName: string; categoryId: string; categoryName: string; karat: string };
type CategoryLine = Line & { categoryId: string; categoryName: string };
type KaratLine = Line & { karat: string };
export type Live = { id: string; status: "open" | "closed"; asOf: string; progressPercent: number | null; totals: Line & { outside: Tally }; byKarat: KaratLine[]; byItem: ItemLine[]; byCategory: CategoryLine[] };
export type BoardPiece = { pieceCode: string; itemCode: number; itemName: string; categoryName: string; karat: string; weightMg: number; scannedAt: string | null; scannedByName: string | null };
type PiecesPage = { items: BoardPiece[]; page: number; pageSize: number; total: number };

const useM = () => {
  const tr = useT();
  return { ...tr, m: (k: string, v?: Record<string, string | number>) => tr.t("gold-stocktake", `stockCount.${k}`, v) };
};

export function useLive(id: string, open: boolean) {
  return useQuery({ queryKey: ["stock-count", id, "live"], queryFn: () => api(`/stock-counts/${id}/live`) as Promise<Live>, refetchInterval: open ? LIVE_EVERY_MS : false, placeholderData: keepPreviousData });
}

function Grams({ mg }: { mg: number }) {
  const { m } = useM();
  return <span dir="ltr" className="sc-grams">{m("grams", { w: milligramsText(mg) })}</span>;
}

// ───── Summary: progress, and expected / counted / remaining in pieces, grams and 24K grams ─────
export function Summary({ live, updatedAt, paused }: { live: Live; updatedAt: number; paused: boolean }) {
  const { m, locale } = useM();
  const closed = live.status === "closed";
  const { totals } = live;
  const pct = live.progressPercent;
  const tile = (key: string, label: string, tally: Tally, tone: "" | "good" | "warn" = "") => (
    <div className={`sc-tile ${tone}`} id={`sc-sum-${key}`}>
      <span className="sc-tile-k">{label}</span>
      <strong className="sc-tile-n" dir="ltr">{tally.pieces.toLocaleString("en-US")}</strong>
      <Grams mg={tally.weightMg} />
      {tally.weight24Mg > 0 && <small dir="ltr">{m("grams24", { w: milligramsText(tally.weight24Mg) })}</small>}
    </div>
  );
  const left = totals.remaining.pieces;
  return (
    <section className="sc-summary" aria-labelledby="sc-sum-title" id="sc-summary">
      <div className="sc-sum-head">
        <h3 id="sc-sum-title" className="grp-title">{m("liveTitle")}</h3>
        <span className={`sc-live ${paused ? "off" : closed ? "frozen" : ""}`} role="status" id="sc-updated">
          <i />{paused ? m("livePaused") : m("liveUpdated", { time: timeText(updatedAt, locale, true) })}
        </span>
      </div>
      {pct === null ? <p className="help">{m("noneExpected")}</p> : (
        <div className="sc-progress">
          <div className="sc-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={m("progress", { percent: pct })}>
            <span style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
          <span className="sc-pct" id="sc-pct">{m("progress", { percent: pct })}</span>
        </div>
      )}
      <div className="sc-tiles">
        {tile("expected", m("expected"), totals.expected)}
        {tile("counted", m("counted"), totals.counted, "good")}
        {tile("remaining", closed ? m("missing") : m("remaining"), totals.remaining, left > 0 ? "warn" : "good")}
        {totals.outside.pieces > 0 && tile("outside", m("outside"), totals.outside, "warn")}
      </div>
      {!closed && pct !== null && left === 0 && <p className="sc-alldone" role="status"><Icon name="check" size={16} />{m("allDone")}</p>}
      {totals.outside.pieces > 0 && <p className="help">{m("outsideHelp")}</p>}
    </section>
  );
}

// ───── Breakdown: by karat, by item, by category; sortable, searchable, the unfinished first ─────
type Tab = "karat" | "item" | "category";
type SortKey = "name" | "code" | "category" | "karat" | "expected" | "counted" | "remaining";
const TEXT_KEYS = ["name", "code", "category", "karat"];
type AnyLine = Line & { key: string; name: ReactNode; text: string; code?: number; karat?: string; category?: string };

export function Breakdown({ live }: { live: Live }) {
  const { m, locale } = useM();
  const closed = live.status === "closed";
  const [tab, setTab] = useState<Tab>("item");
  const [search, setSearch] = useState("");
  const [notDoneFirst, setNotDoneFirst] = useState(true);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "remaining", dir: -1 });
  const leftLabel = closed ? m("missing") : m("remaining");

  const lines: AnyLine[] = useMemo(() => {
    if (tab === "karat") return live.byKarat.map((l) => ({ ...l, key: l.karat, name: <span dir="ltr">{l.karat}</span>, text: l.karat }));
    if (tab === "category") return live.byCategory.map((l) => ({ ...l, key: l.categoryId, name: l.categoryName, text: l.categoryName }));
    return live.byItem.map((l) => ({ ...l, key: `${l.itemId}:${l.karat}`, name: l.itemName, text: `${l.itemCode} ${l.itemName} ${l.categoryName}`, code: l.itemCode, category: l.categoryName }));
  }, [live, tab]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? lines.filter((l) => l.text.toLowerCase().includes(q)) : [...lines];
    const text = (l: AnyLine) => (sort.key === "name" ? l.text : sort.key === "code" ? String(l.code ?? "").padStart(9, "0") : String((sort.key === "category" ? l.category : l.karat) ?? ""));
    const by = (a: AnyLine, b: AnyLine) => (TEXT_KEYS.includes(sort.key) ? text(a).localeCompare(text(b), locale, { numeric: true, sensitivity: "base" }) : a[sort.key as "expected"].pieces - b[sort.key as "expected"].pieces || a[sort.key as "expected"].weightMg - b[sort.key as "expected"].weightMg);
    return list.sort((a, b) =>
      (notDoneFirst ? Number(b.remaining.pieces > 0) - Number(a.remaining.pieces > 0) : 0)
      || sort.dir * by(a, b)
      || (a.code ?? 0) - (b.code ?? 0));
  }, [lines, search, sort, notDoneFirst, locale]);

  const head = (key: SortKey, label: string, span = 1) => {
    const on = sort.key === key;
    return {
      colSpan: span, num: !TEXT_KEYS.includes(key), label,
      sort: { kind: (TEXT_KEYS.includes(key) ? "text" : "number") as "text" | "number", dir: on ? (sort.dir === 1 ? "asc" : "desc") as "asc" | "desc" : null, onSort: () => setSort(on ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: TEXT_KEYS.includes(key) ? 1 : -1 }) },
    };
  };
  const pair = (t: Tally, cls = "") => <><Td num className={cls} dir="ltr">{t.pieces.toLocaleString("en-US")}</Td><Td num className={cls} dir="ltr">{milligramsText(t.weightMg)}</Td></>;
  const leftCells = (l: Line) => l.remaining.pieces > 0 ? pair(l.remaining, "sc-left") : <Td num colSpan={2} className="sc-done"><Icon name="check" size={14} />{m("done")}</Td>;
  const nameCols = tab === "item" ? 4 : 1;

  return (
    <section aria-labelledby="sc-bd-title" id="sc-breakdown">
      <h3 id="sc-bd-title" className="grp-title">{m("breakdown")}</h3>
      <div className="sc-tools">
        <Seg label={m("breakdown")} value={tab} onChange={(k) => { setTab(k); setSearch(""); }}
          items={(["item", "karat", "category"] as Tab[]).map((k) => ({ id: k, label: m(k === "karat" ? "byKarat" : k === "item" ? "byItem" : "byCategory"), attrs: { id: `sc-bd-${k}` } }))} />
        {tab !== "karat" && (
          <label className="search sc-search"><Icon name="search" size={16} />
            <Input id="sc-bd-search" type="search" value={search} placeholder={m("searchBreakdown")} aria-label={m("searchBreakdown")} onChange={(e) => setSearch(e.target.value)} />
          </label>
        )}
        <Checkbox id="sc-bd-notdone" className="sc-check" checked={notDoneFirst} onChange={setNotDoneFirst}>{m("notDoneFirst")}</Checkbox>
      </div>
      <DataTable className="sc-table" tableId="sc-bd-table" subHeadClassName="sc-sub"
        head={[...(tab === "item" ? [head("name", m("item")), head("code", m("itemCode")), head("category", m("category")), head("karat", m("karat"))] : [head("name", tab === "karat" ? m("karat") : m("category"))]), head("expected", m("expected"), 2), head("counted", m("counted"), 2), head("remaining", leftLabel, 2)]}
        subHead={[{ label: null, colSpan: nameCols, sortable: false as const }, ...[0, 1, 2].flatMap(() => [{ label: m("piecesCol"), num: true, sortable: false as const }, { label: m("gramsCol"), num: true, sortable: false as const }])]}   /* the group header above sorts by pieces, then grams */
        foot={shown.length > 0 ? (
          <tr className="foot">
            <Td colSpan={nameCols}>{m("expected")}: {live.totals.expected.pieces.toLocaleString("en-US")}</Td>
            {pair(live.totals.expected)}{pair(live.totals.counted)}{pair(live.totals.remaining, live.totals.remaining.pieces > 0 ? "sc-left" : "")}
          </tr>
        ) : undefined}>
        {shown.length === 0 && <Tr><Td colSpan={nameCols + 6} className="help">{m("noPieces")}</Td></Tr>}
        {shown.map((l) => (
          <Tr key={l.key} className={l.remaining.pieces > 0 ? "sc-row-left" : ""}>
            <Td>{l.name}</Td>
            {tab === "item" && <><Td dir="ltr">{l.code}</Td><Td>{l.category}</Td><Td dir="ltr">{l.karat}</Td></>}
            {pair(l.expected)}{pair(l.counted)}{leftCells(l)}
          </Tr>
        ))}
      </DataTable>
    </section>
  );
}

// ───── Piece lists: counted (newest first), remaining (by code), no longer in stock; paged and searched on the server ─────
type ListKey = "counted" | "remaining" | "outside";

export function PieceLists({ id, live }: { id: string; live: Live }) {
  const { m, locale } = useM();
  const closed = live.status === "closed";
  const [list, setList] = useState<ListKey>("counted");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => { const t = setTimeout(() => { setSearch(typed.trim()); setPage(1); }, 250); return () => clearTimeout(t); }, [typed]);
  const q = useQuery({
    queryKey: ["stock-count", id, "pieces", list, search, page],
    queryFn: () => api(`/stock-counts/${id}/pieces`, { query: { list, page, ...(search ? { search } : {}) } }) as Promise<PiecesPage>,
    refetchInterval: closed ? false : LIVE_EVERY_MS,
    placeholderData: keepPreviousData,
  });
  const showOutside = !closed && (live.totals.outside.pieces > 0 || list === "outside");
  const tabs: [ListKey, string][] = [
    ["counted", m("listCounted", { count: live.totals.counted.pieces })],
    ["remaining", m(closed ? "listMissing" : "listRemaining", { count: live.totals.remaining.pieces })],
    ...(showOutside ? [["outside", m("listOutside", { count: live.totals.outside.pieces })] as [ListKey, string]] : []),
  ];
  const data = q.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const scanned = list !== "remaining";
  return (
    <section aria-labelledby="sc-pl-title" id="sc-pieces">
      <h3 id="sc-pl-title" className="grp-title">{m("piecesTitle")}</h3>
      <div className="sc-tools">
        <Seg label={m("piecesTitle")} value={list} onChange={(k) => { setList(k); setPage(1); }}
          items={tabs.map(([k, label]) => ({ id: k, label, attrs: { id: `sc-pl-${k}` } }))} />
        <label className="search sc-search"><Icon name="search" size={16} />
          <Input id="sc-pl-search" type="search" value={typed} placeholder={m("searchPieces")} aria-label={m("searchPieces")} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </div>
      <DataTable fixedOrder id="sc-pl-table" className="sc-table" aria-busy={q.isFetching}
        head={[m("pieceCode"), m("item"), m("category"), m("karat"), { label: m("weight"), num: true }, ...(scanned ? [m("scannedAt"), m("scannedBy")] : [])]}>
        {data && data.items.length === 0 && <Tr><Td colSpan={scanned ? 7 : 5} className="help">{m("noPieces")}</Td></Tr>}
        {data?.items.map((p) => (
          <Tr key={p.pieceCode}>
            <Td><span className="sc-code"><span dir="ltr">{p.pieceCode}</span><CopyButton text={p.pieceCode} size={16} /></span></Td>
            <Td><span dir="ltr" className="sc-mute">{p.itemCode}</span> {p.itemName}</Td>
            <Td>{p.categoryName}</Td>
            <Td dir="ltr">{p.karat}</Td>
            <Td num dir="ltr">{milligramsText(p.weightMg)}</Td>
            {scanned && <><Td dir="ltr">{timeText(p.scannedAt, locale, true)}</Td><Td>{p.scannedByName ?? "—"}</Td></>}
          </Tr>
        ))}
      </DataTable>
      {pages > 1 && (
        <div className="pager">
          <span>{m("pageOf", { page, pages })}</span>
          <span>
            <Button id="sc-pl-prev" disabled={page <= 1} onClick={() => setPage(page - 1)}>{m("prevPage")}</Button>
            <Button id="sc-pl-next" disabled={page >= pages} onClick={() => setPage(page + 1)}>{m("nextPage")}</Button>
          </span>
        </div>
      )}
    </section>
  );
}

// ───── The last scan, big, next to the scan box ─────
export type LastScan = { at: number; code: string; kind: "ok" | "already" | "refused"; piece?: BoardPiece | null; reason?: string };

export function ScanFeedback({ last }: { last: LastScan }) {
  const { m, locale } = useM();
  const title = last.kind === "ok" ? m("scanOk") : last.kind === "already" ? m("scanAlready") : m("scanRefused");
  const p = last.piece;
  return (
    <div key={last.at} className={`sc-last ${last.kind}`} id="sc-last" role="status" aria-live="polite">
      <Icon name={last.kind === "ok" ? "check" : "alert"} size={18} />
      <div>
        <span className="sc-last-k">{m("lastScan")} · {title}</span>
        <strong dir="ltr" className="sc-last-code">{last.code}</strong>
        {p && <span className="sc-last-d">{p.itemName} · {p.categoryName} · <span dir="ltr">{p.karat}</span> · <Grams mg={p.weightMg} /></span>}
        {last.kind === "already" && p?.scannedAt && <span className="sc-last-d">{m("scanAlreadyAt", { time: timeText(p.scannedAt, locale), name: p.scannedByName ?? "—" })}</span>}
        {last.reason && <span className="sc-last-d">{last.reason}</span>}
      </div>
    </div>
  );
}

// ───── What Save will record as missing, for the confirmation ─────
export function MissingPreview({ live }: { live: Live }) {
  const { m } = useM();
  const left = live.totals.remaining;
  if (left.pieces === 0) return <p id="sc-save-none">{m("saveNothingMissing")}</p>;
  const karats = live.byKarat.filter((l) => l.remaining.pieces > 0);
  const items = live.byItem.filter((l) => l.remaining.pieces > 0);
  return (
    <div id="sc-save-preview" className="sc-preview">
      <p><strong>{m("saveMissing", { count: m("scannedCount", { count: left.pieces }), w: milligramsText(left.weightMg) })}</strong></p>
      <DataTable fixedOrder className="sc-table" head={[m("karat"), { label: m("piecesCol"), num: true }, { label: m("gramsCol"), num: true }]}>
        {karats.map((l) => <Tr key={l.karat}><Td dir="ltr">{l.karat}</Td><Td num>{l.remaining.pieces}</Td><Td num dir="ltr">{milligramsText(l.remaining.weightMg)}</Td></Tr>)}
      </DataTable>
      <DataTable fixedOrder className="sc-table sc-preview-items" head={[m("item"), m("karat"), { label: m("piecesCol"), num: true }, { label: m("gramsCol"), num: true }]}>
        {items.map((l) => <Tr key={`${l.itemId}:${l.karat}`}><Td><span dir="ltr" className="sc-mute">{l.itemCode}</span> {l.itemName}</Td><Td dir="ltr">{l.karat}</Td><Td num>{l.remaining.pieces}</Td><Td num dir="ltr">{milligramsText(l.remaining.weightMg)}</Td></Tr>)}
      </DataTable>
      <p className="help">{m("saveFinal")}</p>
    </div>
  );
}
