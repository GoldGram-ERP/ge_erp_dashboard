"use client";
// The live board of one stock count (owner, 2026-11-05: "detailed as much as possible ... so they can see it live").
// Reads GET /stock-counts/:id/live (expected / counted / remaining in pieces, grams and 24K grams; by karat, item, category)
// and GET /stock-counts/:id/pieces (counted, remaining, no longer in stock; paged, searched on the server).
// Live: every few seconds while the page is visible and online (react-query pauses the interval when the tab is hidden and
// when offline), and at once after each scan (the scan invalidates ["stock-count", id]). A closed count is frozen: no polling.
import { Checkbox } from "@/components/ui";
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
type SortKey = "name" | "expected" | "counted" | "remaining";
type AnyLine = Line & { key: string; name: ReactNode; text: string; code?: number; karat?: string; category?: string };

export function Breakdown({ live }: { live: Live }) {
  const { m } = useM();
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
    const by = (a: AnyLine, b: AnyLine) => (sort.key === "name" ? a.text.localeCompare(b.text) : a[sort.key].pieces - b[sort.key].pieces || a[sort.key].weightMg - b[sort.key].weightMg);
    return list.sort((a, b) =>
      (notDoneFirst ? Number(b.remaining.pieces > 0) - Number(a.remaining.pieces > 0) : 0)
      || sort.dir * by(a, b)
      || (a.code ?? 0) - (b.code ?? 0));
  }, [lines, search, sort, notDoneFirst]);

  const head = (key: SortKey, label: string, span = 1) => {
    const on = sort.key === key;
    return (
      <th colSpan={span} className={key === "name" ? "" : "num"} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
        <button type="button" className="sc-sort" aria-label={m("sortBy", { col: label })} onClick={() => setSort(on ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: key === "name" ? 1 : -1 })}>
          {label}{on && <span className="arr" aria-hidden>{sort.dir === 1 ? "↑" : "↓"}</span>}
        </button>
      </th>
    );
  };
  const pair = (t: Tally, cls = "") => <><td className={`num ${cls}`} dir="ltr">{t.pieces.toLocaleString("en-US")}</td><td className={`num ${cls}`} dir="ltr">{milligramsText(t.weightMg)}</td></>;
  const leftCells = (l: Line) => l.remaining.pieces > 0 ? pair(l.remaining, "sc-left") : <td colSpan={2} className="num sc-done"><Icon name="check" size={14} />{m("done")}</td>;
  const nameCols = tab === "item" ? 4 : 1;

  return (
    <section aria-labelledby="sc-bd-title" id="sc-breakdown">
      <h3 id="sc-bd-title" className="grp-title">{m("breakdown")}</h3>
      <div className="sc-tools">
        <div className="seg" role="group" aria-label={m("breakdown")}>
          {(["item", "karat", "category"] as Tab[]).map((k) => (
            <button key={k} type="button" id={`sc-bd-${k}`} aria-pressed={tab === k} onClick={() => { setTab(k); setSearch(""); }}>
              {m(k === "karat" ? "byKarat" : k === "item" ? "byItem" : "byCategory")}
            </button>
          ))}
        </div>
        {tab !== "karat" && (
          <label className="search sc-search"><Icon name="search" size={16} />
            <input id="sc-bd-search" type="search" value={search} placeholder={m("searchBreakdown")} aria-label={m("searchBreakdown")} onChange={(e) => setSearch(e.target.value)} />
          </label>
        )}
        <Checkbox id="sc-bd-notdone" className="sc-check" checked={notDoneFirst} onChange={setNotDoneFirst}>{m("notDoneFirst")}</Checkbox>
      </div>
      <div className="table sc-table">
        <table id="sc-bd-table">
          <thead>
            <tr>
              {tab === "item" ? <>{head("name", m("item"))}<th>{m("itemCode")}</th><th>{m("category")}</th><th>{m("karat")}</th></> : head("name", tab === "karat" ? m("karat") : m("category"))}
              {head("expected", m("expected"), 2)}{head("counted", m("counted"), 2)}{head("remaining", leftLabel, 2)}
            </tr>
            <tr className="sc-sub">
              <th colSpan={nameCols} />
              {[0, 1, 2].flatMap((i) => [<th key={`p${i}`} className="num">{m("piecesCol")}</th>, <th key={`g${i}`} className="num">{m("gramsCol")}</th>])}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && <tr><td colSpan={nameCols + 6} className="help">{m("noPieces")}</td></tr>}
            {shown.map((l) => (
              <tr key={l.key} className={l.remaining.pieces > 0 ? "sc-row-left" : ""}>
                <td>{l.name}</td>
                {tab === "item" && <><td dir="ltr">{l.code}</td><td>{l.category}</td><td dir="ltr">{l.karat}</td></>}
                {pair(l.expected)}{pair(l.counted)}{leftCells(l)}
              </tr>
            ))}
          </tbody>
          {shown.length > 0 && (
            <tfoot>
              <tr className="foot">
                <td colSpan={nameCols}>{m("expected")}: {live.totals.expected.pieces.toLocaleString("en-US")}</td>
                {pair(live.totals.expected)}{pair(live.totals.counted)}{pair(live.totals.remaining, live.totals.remaining.pieces > 0 ? "sc-left" : "")}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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
        <div className="seg" role="group" aria-label={m("piecesTitle")}>
          {tabs.map(([k, label]) => <button key={k} type="button" id={`sc-pl-${k}`} aria-pressed={list === k} onClick={() => { setList(k); setPage(1); }}>{label}</button>)}
        </div>
        <label className="search sc-search"><Icon name="search" size={16} />
          <input id="sc-pl-search" type="search" value={typed} placeholder={m("searchPieces")} aria-label={m("searchPieces")} onChange={(e) => setTyped(e.target.value)} />
        </label>
      </div>
      <div className="table sc-table" aria-busy={q.isFetching}>
        <table id="sc-pl-table">
          <thead>
            <tr>
              <th>{m("pieceCode")}</th><th>{m("item")}</th><th>{m("category")}</th><th>{m("karat")}</th><th className="num">{m("weight")}</th>
              {scanned && <><th>{m("scannedAt")}</th><th>{m("scannedBy")}</th></>}
            </tr>
          </thead>
          <tbody>
            {data && data.items.length === 0 && <tr><td colSpan={scanned ? 7 : 5} className="help">{m("noPieces")}</td></tr>}
            {data?.items.map((p) => (
              <tr key={p.pieceCode}>
                <td><span className="sc-code"><span dir="ltr">{p.pieceCode}</span><CopyButton text={p.pieceCode} size={16} /></span></td>
                <td><span dir="ltr" className="sc-mute">{p.itemCode}</span> {p.itemName}</td>
                <td>{p.categoryName}</td>
                <td dir="ltr">{p.karat}</td>
                <td className="num" dir="ltr">{milligramsText(p.weightMg)}</td>
                {scanned && <><td dir="ltr">{timeText(p.scannedAt, locale, true)}</td><td>{p.scannedByName ?? "—"}</td></>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="pager">
          <span>{m("pageOf", { page, pages })}</span>
          <span>
            <button type="button" className="btn quiet" id="sc-pl-prev" disabled={page <= 1} onClick={() => setPage(page - 1)}>{m("prevPage")}</button>
            <button type="button" className="btn quiet" id="sc-pl-next" disabled={page >= pages} onClick={() => setPage(page + 1)}>{m("nextPage")}</button>
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
      <div className="table sc-table"><table>
        <thead><tr><th>{m("karat")}</th><th className="num">{m("piecesCol")}</th><th className="num">{m("gramsCol")}</th></tr></thead>
        <tbody>{karats.map((l) => <tr key={l.karat}><td dir="ltr">{l.karat}</td><td className="num">{l.remaining.pieces}</td><td className="num" dir="ltr">{milligramsText(l.remaining.weightMg)}</td></tr>)}</tbody>
      </table></div>
      <div className="table sc-table sc-preview-items"><table>
        <thead><tr><th>{m("item")}</th><th>{m("karat")}</th><th className="num">{m("piecesCol")}</th><th className="num">{m("gramsCol")}</th></tr></thead>
        <tbody>{items.map((l) => <tr key={`${l.itemId}:${l.karat}`}><td><span dir="ltr" className="sc-mute">{l.itemCode}</span> {l.itemName}</td><td dir="ltr">{l.karat}</td><td className="num">{l.remaining.pieces}</td><td className="num" dir="ltr">{milligramsText(l.remaining.weightMg)}</td></tr>)}</tbody>
      </table></div>
      <p className="help">{m("saveFinal")}</p>
    </div>
  );
}
