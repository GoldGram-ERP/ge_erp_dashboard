"use client";
// The redesigned Price board (2026-11-25): the logic block below is copied verbatim from price-board.tsx; only the render is new,
// built on the Hallmark kit (the GE ticker's design system, src/components/hallmark) inside a `.hallmark` root.
// لوحة الأسعار / Price board (owner, 2026-11-22): sales/price-board, read only.
// 1. Today's prices (gold 21, gold 24, silver: sell and buy). 2. The brands as cards side by side, each with its items one under the other:
// name, price, workmanship, cashback; green when the item can be sold now (pieces in the branch and the hand switch on), red when not.
// 3. A comparison of two items of different brands with the same karat and weight.
// One request: GET /price-board?branchId=, priced by the backend as the Sales desk prices a cash sale, so the numbers here are the desk's.
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Option } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { allPages } from "./sales-form-parts";
import { useRouter } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { boardTabs, tabFromAddress, type BoardTab } from "./price-requests-rules";
import { BoardRequests, BoardSend } from "./board-requests";
import { dateText, timeText } from "@/lib/format";
import type { BoardPrice } from "./price-board-rules";
import { brandsOf } from "@/lib/items";
import { filterItems, isFiltering, noFilter, weightBounds, type BrandFilter, type StockFilter, clampCount, compareCandidates, differenceOf, entriesOf, netOf, rowOf, toggleId, totalsOf, winner, type Board, type BoardItem, type Entry } from "./price-board-rules";
import { ActionBar, Banner, Button, Checkbox, Chip, Combobox, EmptyState, Field, Group, Icons, Input, PillInput, RangePill, Row, Segmented, Select, Skeleton, Table, Td } from "@/components/hallmark";

const money = (p: number | null | undefined) => (p === null || p === undefined ? "—" : piastresText(p));
const grams = (mg: number) => `${milligramsText(mg)} g`;

export default function Page() {
  const { L } = useT();
  const title = useTranslations("nav.item")("price-board");
  const { data: me } = useMe();
  const isUser = me?.userType === "user";
  const [picked, setPicked] = useState("");
  const branches = useQuery({ queryKey: ["price-board-branches"], enabled: !!me && !isUser, staleTime: 60_000, queryFn: () => allPages("/branches") });
  // A User always reads their own branch; an Admin picks one (their own, or the first, until they do).
  const branchId = picked || (isUser ? me?.branchId ?? "" : String(me?.branchId ?? branches.data?.[0]?.id ?? ""));
  const board = useQuery<Board>({
    queryKey: ["price-board", branchId], enabled: Boolean(branchId), staleTime: 10_000,
    refetchInterval: 15_000, refetchIntervalInBackground: false,
    queryFn: () => api("/price-board", { query: { branchId } }),
  });

  // The pieces of each item (page state, by item id: it survives the refresh). 1 until a person presses +.
  const [counts, setCounts] = useState<Record<string, number>>({});
  const countOf = (id: string) => counts[id] ?? 1;
  const bump = (id: string, by: number) => setCounts((c) => ({ ...c, [id]: clampCount((c[id] ?? 1) + by) }));
  void countOf; void bump;   // copied state the board's cards do not show yet

  // The cards a person selected (owner, 2026-11-23), in the order they were chosen, and the pieces of each in the list below: separate from the card's own count.
  // What each brand card is narrowed by (name, weight from / to): page state by brand, so it survives the refresh.
  const [filters, setFilters] = useState<Record<string, BrandFilter>>({});
  const setFilter = (brandId: string, patch: Partial<BrandFilter>) => setFilters((all) => ({ ...all, [brandId]: { ...(all[brandId] ?? noFilter), ...patch } }));
  const [selected, setSelected] = useState<string[]>([]);
  const [picks, setPicks] = useState<Record<string, number>>({});
  const toggle = (id: string) => setSelected((s) => toggleId(s, id));
  const pickOf = (id: string) => picks[id] ?? 1;
  const pickBump = (id: string, by: number) => setPicks((c) => ({ ...c, [id]: clampCount((c[id] ?? 1) + by) }));

  const entries = useMemo(() => entriesOf(board.data?.brands ?? []), [board.data]);
  const chosen = selected.flatMap((id) => entries.find((e) => e.id === id) ?? []);   // an item that left the board drops out
  const pickedRows = chosen.map((e) => rowOf(e, pickOf(e.id)));
  const totals = totalsOf(pickedRows);
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const a = entries.find((e) => e.id === aId);
  const candidates = useMemo(() => compareCandidates(entries, a), [entries, a]);
  const b = candidates.find((e) => e.id === bId);

  const optionOf = (e: Entry): Option => [e.id, `${e.itemName} · ${e.karat} · ${grams(e.weightMg)}`, false, { sub: e.brandName, search: `${e.itemName} ${e.nickname ?? ""} ${e.brandName} ${e.karat}`, tone: e.sellable ? "good" : "bad", group: e.brandId }];
  // Each select can be narrowed to one brand (the brand filter on top of the list).
  const [brandA, setBrandA] = useState("");
  const [brandB, setBrandB] = useState("");
  const optionsA = useMemo(() => entries.map(optionOf), [entries]);
  const optionsB = useMemo(() => candidates.map(optionOf), [candidates]);

  // Stock shows a word only, never a count (owner, 2026-11-25): in stock or not.
  const stockText = (e: BoardItem) => (e.sellable ? L("متاح", "In stock") : L("مش متاح", "Out of stock"));

  const price = board.data?.price;

  const { locale } = useT();
  const router = useRouter();
  // «اعمل مسودة بالسعر ده» (price protection): the redesigned desk opens a new draft carrying the board's exact snapshot (the second it was read
  // and its prices); the desk sends it as heldFromBoard with the first save, since a draft needs its customer and pieces before it exists.
  const openDraft = () => {
    if (!price) return;
    const held = { takenAt: new Date(board.dataUpdatedAt || Date.now()).toISOString(), sell21: price.sell21, buy21: price.buy21, silverSell: price.silverSell, silverBuy: price.silverBuy };
    router.push(`/redesignedsales/one?new=draft&held=${encodeURIComponent(JSON.stringify(held))}`);
  };
  const shared = filters.all ?? noFilter;   // one filter bar narrows every brand (the copied per-brand state, under one key)
  const setShared = (patch: Partial<BrandFilter>) => setFilter("all", patch);
  const [brandShown, setBrandShown] = useState("all");
  const bounds = weightBounds(shared);
  const brandList = board.data?.brands ?? [];
  const shownBrands = brandList.filter((x) => brandShown === "all" || x.id === brandShown);
  const refreshed = board.dataUpdatedAt ? timeText(new Date(board.dataUpdatedAt).toISOString(), locale) : "";
  const branchOptions: Option[] = (branches.data ?? []).map((x) => [String(x.id), String(x.branchName)] as Option);
  const shownA = optionsA.filter((o) => !brandA || o[3]?.group === brandA);
  const shownB = optionsB.filter((o) => !brandB || o[3]?.group === brandB);
  const netA = a ? netOf(a) : null;
  const netB = b ? netOf(b) : null;

  // The direction each sell price moved since the last refresh (no number is made: only up, down or same).
  const last = useRef<BoardPrice | null>(null);
  const [moves, setMoves] = useState<Record<string, "up" | "down">>({});
  useEffect(() => {
    if (!price) return;
    const was = last.current;
    last.current = price;
    if (!was || was.date !== price.date) return;
    const dir = (now: number | null, before: number | null): "up" | "down" | undefined => (now === null || before === null || now === before ? undefined : now > before ? "up" : "down");
    const next: Record<string, "up" | "down"> = {};
    for (const [k, n, o] of [["21", price.sell21, was.sell21], ["24", price.sell24, was.sell24], ["ag", price.silverSell, was.silverSell]] as const) { const d = dir(n, o); if (d) next[k] = d; }
    if (Object.keys(next).length) setMoves(next);
  }, [price]);
  // The tabs (owner, 2026-11-25, backend #228), as main's old board: the board, Send a request and Requests; a notification link opens ?tab=requests&open=<id>.
  const search = useSearchParams();
  const [wantedTab, setTab] = useState<string>(() => search.get("tab") ?? "board");
  const pageTabs = boardTabs();
  const tab: BoardTab = tabFromAddress(wantedTab);
  const lean = winner(netA, netB, "lower");
  const gap = differenceOf(netA, netB);

  // ───── The Hallmark render. Everything below only shows what the copied logic above and the rules computed. ─────
  const asCombo = (o: Option) => ({ value: String(o[0]), label: o[1], hint: o[3]?.sub });
  const brandOptions = (items: Entry[]) => [{ value: "", label: L("كل الماركات", "All brands") }, ...brandsOf(items).map((x) => ({ value: x.id, label: x.name }))];
  const metal = (key: string, label: string, sell: number | null | undefined, buy: number | null | undefined) => (
    <Row key={key} label={label}>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="text-title font-bold" dir="ltr">{money(sell)}</b>
        <span className="meta">{L("شراء", "Buy")} <span dir="ltr">{money(buy)}</span></span>
        {moves[key] && <Chip tone={moves[key] === "up" ? "malachite" : "carnelian"}>{moves[key] === "up" ? L("طلع", "Up") : L("نزل", "Down")}</Chip>}
      </span>
    </Row>
  );
  const compareLine = (label: string, va: number | null, vb: number | null, better: "lower" | "higher") => {
    const w = winner(va, vb, better);
    const d = differenceOf(va, vb);
    const best = <Chip tone="malachite">{L("أحسن", "Better")}</Chip>;
    return (
      <tr key={label}>
        <Td className="text-tertiary">{label}</Td>
        <Td><span className="inline-flex items-center gap-1.5"><span dir="ltr" className="font-semibold">{money(va)}</span>{w === "a" && best}</span></Td>
        <Td className="text-secondary"><span dir="ltr">{d === null ? "—" : `${d > 0 ? "+" : ""}${money(d)}`}</span></Td>
        <Td><span className="inline-flex items-center gap-1.5"><span dir="ltr" className="font-semibold">{money(vb)}</span>{w === "b" && best}</span></Td>
      </tr>
    );
  };
  const brandCount = brandList.length;

  return (
    <div className="hallmark mx-auto flex w-full max-w-[80rem] flex-col gap-5 pt-1" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        {price ? <Chip tone="gold">{L("أسعار يوم", "Prices of")} <span dir="ltr">{dateText(price.date)}</span></Chip> : <Chip tone="amber">{L("مفيش سعر دهب النهارده", "No gold price today")}</Chip>}
        {refreshed && <Chip>{L("اتحدّث", "Refreshed")} <span dir="ltr">{refreshed}</span></Chip>}
        {!isUser && tab === "board" && branchOptions.length > 1 && (
          <span className="ms-auto">
            <Select id="branchId" ariaLabel={L("الفرع", "Branch")} value={branchId} onChange={(v) => v && setPicked(v)} options={branchOptions.map((o) => ({ value: String(o[0]), label: o[1] }))} />
          </span>
        )}
      </div>
      {pageTabs.length > 1 && (
        <Segmented<BoardTab> label={title} value={tab} onChange={setTab}
          options={([["board", L("لوحة الأسعار", "Price board")], ["send", L("إرسال طلب", "Send a request")], ["requests", L("الطلبات", "Requests")]] as [BoardTab, string][]).filter(([id]) => pageTabs.includes(id)).map(([value, label]) => ({ value, label }))} />
      )}
      {tab === "send" && <BoardSend picked={chosen.map((e) => ({ id: e.id, itemName: e.itemName, brandName: e.brandName, weightMg: e.weightMg, quantity: pickOf(e.id) }))} boardBranchId={branchId}
        onStep={pickBump} onRemove={toggle} onPickMore={() => setTab("board")} onSent={() => { setSelected([]); setPicks({}); setTab("requests"); }} />}
      {tab === "requests" && <BoardRequests openId={search.get("open")} />}

      {tab === "board" && <>
      {board.isError && <Banner tone="warn" live>{L("مش قادر أحدّث دلوقتي، الأسعار دي آخر حاجة وصلت", "Can't refresh now; these are the last prices received")}</Banner>}

      <div className="grid items-start gap-5 wide:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Group title={L("أسعار النهارده · بيع", "Today's prices · sell")}>
            {metal("21", L("دهب ٢١", "Gold 21"), price?.sell21, price?.buy21)}
            {metal("24", L("دهب ٢٤", "Gold 24"), price?.sell24, price?.buy24)}
            {metal("ag", L("فضة", "Silver"), price?.silverSell, price?.silverBuy)}
          </Group>

          <div role="search" className="flex flex-wrap items-center gap-2">
            {brandCount > 1 && (brandCount <= 3
              ? <Segmented label={L("الماركة", "Brand")} value={brandShown} onChange={setBrandShown} options={[{ value: "all", label: L("كل الماركات", "All brands") }, ...brandList.map((x) => ({ value: x.id, label: x.name }))]} />
              : <span><Select prefix={L("الماركة", "Brand")} ariaLabel={L("الماركة", "Brand")} value={brandShown} onChange={setBrandShown} options={[{ value: "all", label: L("كل الماركات", "All brands") }, ...brandList.map((x) => ({ value: x.id, label: x.name }))]} /></span>)}
            <Segmented<StockFilter> label={L("المخزون", "Stock")} value={shared.stock} onChange={(v) => setShared({ stock: v })} options={[{ value: "all", label: L("الكل", "All") }, { value: "in", label: L("متاح", "In stock") }, { value: "out", label: L("مش متاح", "Out of stock") }]} />
            <RangePill label={L("الوزن", "Weight")} unit={L("جم", "g")} fromLabel={L("الوزن من", "Weight from")} toLabel={L("الوزن لحد", "Weight to")}
              from={shared.from} to={shared.to} onFrom={(v) => setShared({ from: v })} onTo={(v) => setShared({ to: v })} invalid={bounds.invalid || undefined} />
            <PillInput search width="14rem" placeholder={L("دوّر بالاسم", "Search by name")} ariaLabel={L("دوّر بالاسم", "Search by name")} value={shared.q} onChange={(v) => setShared({ q: v })} />
            {isFiltering(shared) && <Button variant="soft" size="sm" icon={<Icons.X aria-hidden />} onClick={() => setFilter("all", noFilter)}>{L("شيل الفلتر", "Clear filters")}</Button>}
          </div>
          {bounds.invalid && <Banner tone="error" live>{L("«من» أكبر من «لحد»: صلّح الوزن", "“From” is more than “to”: fix the weight")}</Banner>}

          {board.isPending && branchId !== "" && <Skeleton lines={4} />}
          <div className="grid items-start gap-5 reg:grid-cols-2">
            {shownBrands.map((br) => {
              const items = filterItems(br.items, shared);
              return (
                <Group key={br.id} title={br.name} action={<Chip><span dir="ltr">{items.length}/{br.items.length}</span></Chip>}>
                  {items.length === 0 ? <Row><span className="text-tertiary">{L("مفيش أصناف بالفلتر ده", "No items match these filters")}</span></Row> : items.map((it) => (
                    <Row key={it.id} className={selected.includes(it.id) ? "bg-selected" : undefined}>
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                        <Checkbox checked={selected.includes(it.id)} onChange={() => toggle(it.id)} label={it.itemName}
                          hint={<><span dir="ltr">{grams(it.weightMg)}</span> · {L("عيار", "Karat")} <span dir="ltr">{it.karat}</span>{it.nickname ? ` · ${it.nickname}` : ""}</>} />
                        <span className="flex flex-col items-end gap-1">
                          <b className="text-[0.9375rem] font-bold" dir="ltr">{money(it.total)}</b>
                          <Chip tone={it.sellable ? "malachite" : "carnelian"}>{stockText(it)}</Chip>
                        </span>
                      </div>
                      <div className="meta mt-0.5 flex flex-wrap gap-x-3 ps-[2.125rem]">
                        <span>{L("مصنعية", "Workmanship")} <span dir="ltr">{money(it.workmanship)}</span></span>
                        <span>{L("كاش باك", "Cashback")} <span dir="ltr">{money(it.cashback)}</span></span>
                      </div>
                    </Row>
                  ))}
                </Group>
              );
            })}
          </div>

          <Group title={L("قارن صنفين · نفس العيار ونفس الوزن، من ماركتين مختلفين", "Compare two items · same karat and weight, two brands")}>
            <div className="grid gap-3 p-3 reg:grid-cols-2">
              <Field label={L("الصنف الأول", "First item")} htmlFor="bn-a">
                {brandsOf(entries).length > 1 && <Select prefix={L("الماركة", "Brand")} ariaLabel={L("ماركة الصنف الأول", "First item's brand")} value={brandA} onChange={setBrandA} options={brandOptions(entries)} />}
                <Combobox id="bn-a" value={aId || null} onChange={(v) => { setAId(v ?? ""); setBId(""); }} options={shownA.map(asCombo)} placeholder={L("اختار صنف", "Pick an item")} />
              </Field>
              <Field label={L("الصنف التاني", "Second item")} htmlFor="bn-b" hint={!a ? L("اختار الأول الأول", "Pick the first one first") : candidates.length ? undefined : L("مفيش صنف زيه في ماركة تانية", "No match in another brand")}>
                {brandsOf(candidates).length > 1 && <Select prefix={L("الماركة", "Brand")} ariaLabel={L("ماركة الصنف التاني", "Second item's brand")} value={brandB} onChange={setBrandB} options={brandOptions(candidates)} />}
                {a && candidates.length > 0 && <Combobox id="bn-b" value={bId || null} onChange={(v) => setBId(v ?? "")} options={shownB.map(asCombo)} placeholder={L("اختار صنف", "Pick an item")} />}
              </Field>
            </div>
            {a && b && (
              <div className="flex flex-col gap-3 p-3">
                <Banner tone="ok" live>
                  {lean === null ? L("الاتنين نفس الصافي بعد الكاش باك", "Both net the same after cashback")
                    : <>{L(`${(lean === "a" ? a : b).brandName} أرخص في الصافي بـ`, `${(lean === "a" ? a : b).brandName} nets cheaper by`)} <b dir="ltr">{money(gap === null ? null : Math.abs(gap))}</b></>}
                </Banner>
                <Table head={[L("البند", "Line"), `${a.brandName} · ${a.itemName}`, L("الفرق", "Difference"), `${b.brandName} · ${b.itemName}`]}>
                  {compareLine(L("السعر", "Price"), a.total, b.total, "lower")}
                  {compareLine(L("المصنعية", "Workmanship"), a.workmanship, b.workmanship, "lower")}
                  {compareLine(L("الكاش باك", "Cashback"), a.cashback, b.cashback, "higher")}
                  {compareLine(L("الصافي", "Net"), netA, netB, "lower")}
                </Table>
              </div>
            )}
          </Group>
        </div>

        <section className="flex flex-col gap-4 wide:sticky wide:top-2" aria-label={L("اللي اخترته", "Chosen")}>
          {chosen.length === 0 ? <EmptyState icon={<Icons.ListChecks aria-hidden />} title={L("اللي اخترته", "Chosen")} body={L("علّم على الأصناف اللي العميل عايزها، تتجمع هنا", "Tick the items the customer wants; they add up here")} /> : (
            <>
              <Group title={L("اللي اخترته", "Chosen")} action={<Chip><span dir="ltr">{chosen.length}</span></Chip>}>
                {chosen.map((e, i) => (
                  <Row key={e.id}>
                    <div className="flex items-center gap-2">
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-medium">{e.itemName}</span>
                        <span className="meta">{e.brandName} · <span dir="ltr">{grams(e.weightMg)}</span></span>
                      </span>
                      <Button iconOnly size="sm" variant="plain" icon={<Icons.X aria-hidden />} label={L(`شيل ${e.itemName}`, `Remove ${e.itemName}`)} onClick={() => toggle(e.id)} />
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-fill p-[3px]">
                        <Button iconOnly size="sm" variant="plain" icon={<Icons.Minus aria-hidden />} label={L("قطعة أقل", "One less")} disabled={pickOf(e.id) <= 1} onClick={() => pickBump(e.id, -1)} />
                        <b className="min-w-6 text-center" dir="ltr" aria-live="polite">{pickOf(e.id)}</b>
                        <Button iconOnly size="sm" variant="plain" icon={<Icons.Plus aria-hidden />} label={L("قطعة زيادة", "One more")} onClick={() => pickBump(e.id, 1)} />
                      </span>
                      <b dir="ltr">{money(pickedRows[i].total)}</b>
                    </div>
                  </Row>
                ))}
              </Group>
              <Group title={L("الحساب", "Totals")}>
                <Row label={L("قيمة الدهب", "Gold value")}><span className="block text-end" dir="ltr">{totals.incomplete ? "—" : money(totals.goldValue)}</span></Row>
                <Row label={L("المصنعية", "Workmanship")}><span className="block text-end" dir="ltr">{totals.incomplete ? "—" : money(totals.workmanship)}</span></Row>
                <Row label={L("الكاش باك", "Cashback")}><span className="block text-end" dir="ltr">{totals.incomplete ? "—" : money(totals.cashback)}</span></Row>
                <Row label={L("الإجمالي", "Total")}><b className="block text-end text-title" dir="ltr">{totals.incomplete ? "—" : money(totals.total)}</b></Row>
              </Group>
            </>
          )}
        </section>
      </div>

      <ActionBar label={L("الخطوة الجاية", "Next step")} summary={chosen.length > 0
        ? <span className="flex flex-col"><span className="meta">{L("الإجمالي", "Total")}</span><b className="text-title font-bold" dir="ltr">{totals.incomplete ? "—" : money(totals.total)}</b></span>
        : <span className="flex flex-col"><span className="meta">{L("دهب ٢١ · بيع", "Gold 21 · sell")}</span><b className="text-title font-bold" dir="ltr">{money(price?.sell21)}</b></span>}>
        {chosen.length > 0 && pageTabs.includes("send") && <Button variant="soft" id="ask-approval" onClick={() => setTab("send")}>{L("اطلب موافقة", "Ask for approval")}</Button>}
        <Button variant="primary" onClick={() => openDraft()} disabled={!price}>{L("اعمل مسودة بالسعر ده", "Create draft at this price")}</Button>
      </ActionBar>
      </>}
    </div>
  );
}
