"use client";
// The one dropdown every item is picked with (issue #34). It is the Select (popover, keyboard, search) with the item's rows:
// the name and karat, and under them the code, the group and the brand; the search always on, finding the code, name, nickname,
// group and brand; and a brand filter on top when the items carry two brands or more.
// Stock colours exist only where the caller passes a stock map (the Sales desk): an item with pieces in the branch is green, one without
// is red and cannot be picked. Every other page passes none, so every item can be picked and none is coloured.
import { useMemo, useState } from "react";
import type { Option, Row } from "@/lib/engine-types";
import { brandsOf, inBrand, itemOption, type StockMap } from "@/lib/items";
import { useT } from "@/lib/t";
import { Button } from "@/components/ui";
import { Select } from "./Select";

type Props = {
  id: string; name: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  items: Row[];
  /** Pieces in stock per item, for the Sales desk only. Left out: nothing is coloured or blocked. */
  stock?: StockMap;
  /** The option's first line. Default: the name and the karat. */
  label?: (it: Row) => string;
  /** Options that stay offered whatever the list says (an item already on a draft that was switched off since). */
  extra?: Option[];
  placeholder?: string; disabled?: boolean; invalid?: boolean; labelledBy?: string; describedBy?: string; className?: string;
};

export function ItemPicker({ items, stock, label, extra, ...select }: Props) {
  const { L } = useT();
  const [brand, setBrand] = useState("");
  const base = useMemo(() => items.map((it) => itemOption(it, { stock, label })), [items, stock, label]);
  const brands = useMemo(() => brandsOf(items), [items]);
  const all = useMemo(() => {
    const out = [...base];
    for (const e of extra ?? []) if (!out.some((o) => String(o[0]) === String(e[0]))) out.push(e);
    return out;
  }, [base, extra]);
  const header = brands.length >= 2 ? (
    <div className="sel-brands" role="group" aria-label={L("الماركة", "Brand")} onMouseDown={(e) => e.preventDefault()}>{/* a tab click keeps the typing in the search box */}
      <Button size="sm" variant={brand === "" ? "primary" : "quiet"} aria-pressed={brand === ""} onClick={() => setBrand("")}>{L("كل الماركات", "All brands")}</Button>
      {brands.map((b) => (
        <Button size="sm" key={b.id} variant={brand === b.id ? "primary" : "quiet"} aria-pressed={brand === b.id} onClick={() => setBrand(brand === b.id ? "" : b.id)}>{b.name}</Button>
      ))}
    </div>
  ) : undefined;
  return <Select {...select} options={inBrand(all, brand, select.value)} searchable header={header} />;
}
