"use client";
// لوحة الأسعار / Price board (owner, 2026-11-22): sales/price-board, read only.
// 1. Today's prices (gold 21, gold 24, silver: sell and buy). 2. The brands as cards side by side, each with its items one under the other:
// name, price, workmanship, cashback; green when the item can be sold now (pieces in the branch and the hand switch on), red when not.
// 3. A comparison of two items of different brands with the same karat and weight.
// One request: GET /price-board?branchId=, priced by the backend as the Sales desk prices a cash sale, so the numbers here are the desk's.
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Option } from "@/lib/engine-types";
import { milligramsText, piastresText } from "@/lib/format";
import { useMe } from "@/lib/session";
import { useT } from "@/lib/t";
import { Select } from "@/components/fields/Select";
import { Button, Checkbox, DataTable, Td, Th, Tr } from "@/components/ui";
import { allPages } from "./sales-form-parts";
import { LOW_STOCK_MAX, brandsOf, inBrand } from "@/lib/items";
import { clampCount, compareCandidates, differenceOf, entriesOf, netOf, rowOf, times, toggleId, totalsOf, winner, type Board, type BoardItem, type Entry } from "./price-board-rules";

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

  // The cards a person selected (owner, 2026-11-23), in the order they were chosen, and the pieces of each in the list below: separate from the card's own count.
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
  // Each select can be narrowed to one brand with the same tabs as the item picker (the brand filter row on top of the list).
  const [brandA, setBrandA] = useState("");
  const [brandB, setBrandB] = useState("");
  const optionsA = useMemo(() => entries.map(optionOf), [entries]);
  const optionsB = useMemo(() => candidates.map(optionOf), [candidates]);
  const tabs = (items: Entry[], brand: string, setBrand: (id: string) => void) => {
    const brands = brandsOf(items);
    if (brands.length < 2) return undefined;
    return (
      <div className="sel-brands" role="group" aria-label={L("الماركة", "Brand")} onMouseDown={(e) => e.preventDefault()}>{/* a tab click keeps the typing in the search box */}
        <Button size="sm" variant={brand === "" ? "primary" : "quiet"} aria-pressed={brand === ""} onClick={() => setBrand("")}>{L("كل الماركات", "All brands")}</Button>
        {brands.map((x) => <Button size="sm" key={x.id} variant={brand === x.id ? "primary" : "quiet"} aria-pressed={brand === x.id} onClick={() => setBrand(brand === x.id ? "" : x.id)}>{x.name}</Button>)}
      </div>
    );
  };

  const stockText = (e: BoardItem) =>
    !e.sellable ? L("غير متوفر", "Out of stock")
      : e.stockCount <= LOW_STOCK_MAX ? L(`متوفر (متبقي ${e.stockCount})`, `In stock (${e.stockCount} left)`)
      : L("متوفر", "In stock");

  const price = board.data?.price;
  const priceCard = (label: string, sell: number | null | undefined, buy: number | null | undefined) => (
    <section className="bubble pb-price" aria-label={label}>
      <span className="pill">{label}</span>
      <div className="pb-sides">
        <div><small>{L("بيع", "Sell")}</small><b dir="ltr">{money(sell)}</b></div>
        <div><small>{L("شراء", "Buy")}</small><b dir="ltr">{money(buy)}</b></div>
      </div>
    </section>
  );

  return (
    <>
      <div className="head">
        <div><h1>{title}</h1><div className="sub">{price ? L(`أسعار الجرام بتاريخ ${price.date.slice(0, 10)}`, `Per-gram prices dated ${price.date.slice(0, 10)}`) : ""}</div></div>
        {!isUser && (
          <div className="field pb-branch">
            <label htmlFor="pb-branch">{L("الفرع", "Branch")}</label>
            <Select id="pb-branch" name="branch" value={branchId} onChange={(v) => v && setPicked(v)} options={(branches.data ?? []).map((x) => [String(x.id), String(x.branchName)] as Option)} />
          </div>
        )}
      </div>

      {board.isError && <p className="quiet-note" role="alert">{L("تعذّر تحميل الأسعار. حاول مرة أخرى.", "Could not load the prices. Try again.")}</p>}
      {board.isPending && branchId && <div className="skeleton" aria-busy="true"><i /><i /></div>}

      {board.data && (<>
        {/* 1. Today's prices */}
        {price ? (
          <div className="pb-prices">
            {priceCard(L("ذهب عيار 21", "Gold 21"), price.sell21, price.buy21)}
            {priceCard(L("ذهب عيار 24", "Gold 24"), price.sell24, price.buy24)}
            {priceCard(L("الفضة", "Silver"), price.silverSell, price.silverBuy)}
          </div>
        ) : <p className="quiet-note">{L("لم يتم تسجيل سعر الذهب بعد.", "No gold price has been saved yet.")}</p>}

        {/* 2. The brands, side by side */}
        <h2 className="pb-h">{L("الماركات", "Brands")}</h2>
        {board.data.brands.length === 0 ? <p className="quiet-note">{L("لا توجد أصناف.", "There are no items.")}</p> : (
          <div className="pb-brands">
            {board.data.brands.map((brand) => (
              <section className="card pb-brand" key={brand.id} aria-label={brand.name}>
                <h3>{brand.name}<span className="pb-count">{brand.items.length}</span></h3>
                <ul>
                  {brand.items.map((it) => {
                    const n = countOf(it.id);
                    return (
                      <li key={it.id} data-tone={it.sellable ? "good" : "bad"} data-selected={selected.includes(it.id) || undefined}
                        onClick={(e) => { if (!(e.target as HTMLElement).closest("button,input,label")) toggle(it.id); }}>{/* a click on the card selects it; its own buttons and the box do their own */}
                        <div className="pb-top">
                          <Checkbox checked={selected.includes(it.id)} onChange={() => toggle(it.id)} aria-label={L("اختيار الصنف", "Select item")} />
                          <div className="pb-name"><b>{it.itemName}</b><small>{it.karat} · {grams(it.weightMg)}</small></div>
                          <div className="pb-price"><span className="pb-total" dir="ltr">{money(times(it.total, n))}</span>{n > 1 && <small dir="ltr">{n} × {money(it.total)}</small>}</div>
                        </div>
                        <div className="pb-chips">
                          <span><small>{L("المصنعية", "Workmanship")}</small><b dir="ltr">{money(times(it.workmanship, n))}</b></span>
                          <span><small>{L("الكاش باك", "Cashback")}</small><b dir="ltr">{money(times(it.cashback, n))}</b></span>
                        </div>
                        <div className="pb-foot">
                          <span className="pb-pill">{stockText(it)}</span>
                          <div className="pb-step" role="group" aria-label={L("الكمية", "Quantity")}>
                            <Button size="sm" aria-label={L("تقليل الكمية", "Decrease quantity")} disabled={n <= 1} onClick={() => bump(it.id, -1)}>−</Button>
                            <output aria-live="polite" dir="ltr">{n}</output>
                            <Button size="sm" aria-label={L("زيادة الكمية", "Increase quantity")} disabled={n >= 99} onClick={() => bump(it.id, 1)}>+</Button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}

        {/* 2b. The selected cards: one row each, with its own count, and the foot totals */}
        <h2 className="pb-h">{L("الأصناف المختارة", "Selected items")}<span className="pb-count">{chosen.length}</span>
          {chosen.length > 0 && <Button size="sm" className="pb-clear" onClick={() => setSelected([])}>{L("إلغاء الاختيار", "Clear selection")}</Button>}</h2>
        {chosen.length === 0 ? <p className="quiet-note">{L("اضغط على بطاقة صنف لاختياره.", "Click an item card to select it.")}</p> : (
          <DataTable className="pb-picked" fixedOrder
            head={[L("الصنف", "Item"), { label: L("السعر", "Price"), num: true }, L("الكمية", "Quantity"), { label: L("المصنعية", "Workmanship"), num: true }, { label: L("الكاش باك", "Cashback"), num: true }]}
            foot={<Tr><Th scope="row">{L("الإجمالي", "Total")}</Th><Td num><bdi dir="ltr"><b>{totals.incomplete ? "—" : money(totals.total)}</b></bdi></Td><Td /><Td num><bdi dir="ltr">{totals.incomplete ? "—" : money(totals.workmanship)}</bdi></Td><Td num><bdi dir="ltr">{totals.incomplete ? "—" : money(totals.cashback)}</bdi></Td></Tr>}>
            {chosen.map((e, i) => {
              const n = pickOf(e.id);
              return (
                <Tr key={e.id}>
                  <Td><b>{e.itemName}</b><small className="pb-sub">{e.brandName} · {e.karat} · {grams(e.weightMg)}</small><span className="pb-pill" data-tone={e.sellable ? "good" : "bad"}>{stockText(e)}</span></Td>
                  <Td num><bdi dir="ltr"><b>{money(pickedRows[i].total)}</b></bdi></Td>
                  <Td>
                    <div className="pb-step" role="group" aria-label={L("الكمية", "Quantity")}>
                      <Button size="sm" aria-label={L("تقليل الكمية", "Decrease quantity")} disabled={n <= 1} onClick={() => pickBump(e.id, -1)}>−</Button>
                      <output aria-live="polite" dir="ltr">{n}</output>
                      <Button size="sm" aria-label={L("زيادة الكمية", "Increase quantity")} disabled={n >= 99} onClick={() => pickBump(e.id, 1)}>+</Button>
                    </div>
                  </Td>
                  <Td num><bdi dir="ltr">{money(pickedRows[i].workmanship)}</bdi></Td>
                  <Td num><bdi dir="ltr">{money(pickedRows[i].cashback)}</bdi></Td>
                </Tr>
              );
            })}
          </DataTable>
        )}
        {chosen.length > 0 && (
          <div className="pb-chips pb-summary" role="group" aria-label={L("ملخص الأصناف المختارة", "Selected items summary")}>
            <span><small>{L("قيمة الذهب", "Gold value")}</small><b dir="ltr">{totals.incomplete ? "—" : money(totals.goldValue)}</b></span>
            <span><small>{L("المصنعية", "Workmanship")}</small><b dir="ltr">{totals.incomplete ? "—" : money(totals.workmanship)}</b></span>
            <span><small>{L("الإجمالي شامل المصنعية", "Total with workmanship")}</small><b dir="ltr">{totals.incomplete ? "—" : money(totals.total)}</b></span>
          </div>
        )}

        {/* 3. The comparison */}
        <h2 className="pb-h">{L("مقارنة بين صنفين", "Compare two items")}</h2>
        <div className="card pb-compare">
          <div className="pb-pick">
            <div className="field"><label htmlFor="pb-a">{L("الصنف الأول", "First item")}</label>
              <Select id="pb-a" name="a" value={aId} onChange={(v) => { setAId(v); setBId(""); }} options={inBrand(optionsA, brandA, aId)} header={tabs(entries, brandA, setBrandA)} searchable placeholder={L("اختر صنفًا", "Pick an item")} /></div>
            <div className="field"><label htmlFor="pb-b">{L("الصنف الثاني (ماركة أخرى، نفس العيار والوزن)", "Second item (another brand, same karat and weight)")}</label>
              <Select id="pb-b" name="b" value={b ? bId : ""} onChange={setBId} options={inBrand(optionsB, brandB, bId)} header={tabs(candidates, brandB, setBrandB)} searchable disabled={!a} placeholder={a ? L("اختر صنفًا", "Pick an item") : L("اختر الصنف الأول أولًا", "Pick the first item first")} /></div>
          </div>
          {a && candidates.length === 0 && <p className="quiet-note" role="status">{L("لا يوجد صنف من ماركة أخرى بنفس العيار والوزن.", "No item of another brand has the same karat and weight.")}</p>}
          {a && b && compareTable(a, b, L, stockText)}
        </div>
      </>)}
    </>
  );
}

// The comparison table: the two items side by side, and the second less the first. The cell that wins a row is marked.
function compareTable(a: Entry, b: Entry, L: (ar: string, en: string) => string, stockText: (e: BoardItem) => string) {
  const row = (label: string, va: number | null, vb: number | null, better?: "lower" | "higher", sub?: [string, string]) => {
    const w = better ? winner(va, vb, better) : null;
    const d = differenceOf(va, vb);
    return (
      <Tr key={label}>
        <Th scope="row">{label}</Th>
        <Td data-win={w === "a" || undefined}><bdi dir="ltr">{money(va)}</bdi>{sub && <small>{sub[0]}</small>}</Td>
        <Td data-win={w === "b" || undefined}><bdi dir="ltr">{money(vb)}</bdi>{sub && <small>{sub[1]}</small>}</Td>
        <Td><bdi dir="ltr">{d === null ? "—" : `${d > 0 ? "+" : ""}${piastresText(d)}`}</bdi></Td>
      </Tr>
    );
  };
  const text = (label: string, va: string, vb: string) => <Tr key={label}><Th scope="row">{label}</Th><Td>{va}</Td><Td>{vb}</Td><Td /></Tr>;
  const perGram = (p: number) => `${piastresText(p)} / g`;
  return (
    <DataTable className="pb-table" fixedOrder head={["", a.brandName, b.brandName, L("الفرق (الثاني − الأول)", "Difference (second − first)")]}>
      {text(L("الصنف", "Item"), a.itemName, b.itemName)}
      {text(L("العيار", "Karat"), a.karat, b.karat)}
      {text(L("الوزن", "Weight"), grams(a.weightMg), grams(b.weightMg))}
      {row(L("قيمة الذهب", "Gold value"), a.goldValue, b.goldValue, "lower")}
      {row(L("المصنعية", "Workmanship"), a.workmanship, b.workmanship, "lower", [perGram(a.workmanshipPerGram), perGram(b.workmanshipPerGram)])}
      {row(L("الكاش باك", "Cashback"), a.cashback, b.cashback, "higher", [perGram(a.cashbackPerGram), perGram(b.cashbackPerGram)])}
      {row(L("السعر الإجمالي", "Total price"), a.total, b.total, "lower")}
      {row(L("الصافي بعد الكاش باك", "Net after cashback"), netOf(a), netOf(b), "lower")}
      {text(L("المخزون", "Stock"), stockText(a), stockText(b))}
    </DataTable>
  );
}
