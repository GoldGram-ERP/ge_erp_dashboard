"use client";
// أسعار الذهب: system-codes/gold-prices (add), gold-prices-history (list). Ported from docs/nav-preview/app/things/gold-prices.js.
// OWNER RULE: the gold price is ALWAYS the latest saved set, even if the day ended with no new one. No "no price today" refusal anywhere:
// the "latest price" view reads GET /gold-prices/today (the newest set whatever its date) and shows its date; a 404 only means nothing
// was ever saved (an empty list, never a warning).
// Add: POST /gold-prices {date, sellPrice, buyPrice, silverSellPrice, silverBuyPrice} in whole piastres, all four required and above zero.
// Prices are 21K sell/buy per gram + silver sell/buy (silver sells at the first and is bought at the second, issue #184); the 24K sell price is derived: floor((p21 x 48 + 21) / 42) (display only).
// A saved set is never edited or deleted. The list takes only fromDate, toDate and page (fixed size).
import { api, ApiFailure } from "@/lib/api";
import type { Column, MakeConfig, ThingConfig } from "@/lib/engine-types";
import { piastresText, today, typedPiastres } from "@/lib/format";
import { prefillFromLatest } from "@/lib/price-step";
import { ThingPage, Ltr } from "@/components/engine";

import { code6 as code6 } from "@/lib/code6";
const PRICE_FIELDS = ["sellPrice", "buyPrice", "silverSellPrice", "silverBuyPrice"];
const KARAT = "21";   // pricedKarat: the typed prices are the 21K ones
const price = (r: unknown) => (r === null || r === undefined ? "—" : piastresText(r));

export const makeConfig: MakeConfig = (tr): ThingConfig => {
  const { t, L } = tr;
  const m = (k: string, v?: Record<string, string>) => t("system-codes", `goldPrices.${k}`, v);

  const columns = (): Column[] => [
    { key: "documentNumber", label: m("code"), render: (r) => <Ltr>{code6(r.documentNumber)}</Ltr> },
    { key: "date", label: m("date"), type: "date" },
    { key: "sellPrice", label: m("sellPrice"), type: "money" },
    { key: "buyPrice", label: m("buyPrice"), type: "money", render: (r) => <Ltr>{price(r.buyPrice)}</Ltr> },
    { key: "silverSellPrice", label: m("silverSellPrice"), type: "money", render: (r) => <Ltr>{price(r.silverSellPrice)}</Ltr> },
    { key: "silverBuyPrice", label: m("silverBuyPrice"), type: "money", render: (r) => <Ltr>{price(r.silverBuyPrice)}</Ltr> },
    { key: "createdByName", label: m("createdByName"), render: (r) => <bdi dir="auto">{r.createdByName ?? ""}</bdi> },
    { key: "createdAt", label: m("createdAt"), type: "datetime" },
  ];
  const priceField = (name: string) => ({
    name, label: m(name), type: "money" as const, required: true, step: 5,
    validate: (v: unknown) => (typeof v === "number" && v > 0 ? null : m("priceInvalid")),   // above zero, like the backend's rule
  });

  return {
    id: "gold-prices",
    title: m("title"),
    unit: L("سجل", "records"),
    keys: ["system-codes/gold-prices", "system-codes/gold-prices-history"],
    create: [{ form: "create", label: m("add"), keys: ["system-codes/gold-prices"] }],
    views: [
      {
        id: "history", label: m("listTitle"), keys: ["system-codes/gold-prices-history"],
        endpoint: "/gold-prices",
        filters: [{ name: "fromDate", label: m("fromDate"), type: "date" }, { name: "toDate", label: m("toDate"), type: "date" }],
        paging: { sizeParam: null },   // `page` only
        serverSort: { on: true, columns: { date: "date", sellPrice: "sellPrice", buyPrice: "buyPrice", silverSellPrice: "silverSellPrice", silverBuyPrice: "silverBuyPrice" } },   // backend GOLD_PRICE_SORT
        onRow: false,                  // a saved set is not opened, edited or deleted
        columns: columns(),
        answerExtra: () => m("fixedNote"),
      },
      {
        // The newest set, whatever its date (owner rule). Also what a person who may only add prices sees.
        id: "latest", label: L("آخر سعر", "Latest price"), keys: ["system-codes/gold-prices", "system-codes/gold-prices-history"],
        load: async (_q, { signal }) => {
          try { return { items: [await api("/gold-prices/today", { signal })] }; }
          catch (e) { if (e instanceof ApiFailure && e.status === 404) return { items: [] }; throw e; }   // 404 goldPriceNotSet = nothing saved yet, not a refusal
        },
        paging: false,
        onRow: false,
        answerExtra: (a) => (a?.items?.[0] ? `${L("آخر سعر بتاريخ", "Latest price dated")} ${String(a.items[0].date).slice(0, 10)}` : m("emptyTitle")),
        columns: [...columns().slice(0, 6), { key: "sellPrice24", label: m("sellPrice24"), type: "money", get: (r) => r.sellPrice24 ?? (r.sellPrice == null ? null : Math.floor((r.sellPrice * 48 + 21) / 42)) }],
      },
    ],
    forms: {
      create: {
        title: m("new"),
        path: () => "/gold-prices",
        method: "POST",
        load: () => ({ date: today(), karat: KARAT }),
        toPayload: (v) => ({ date: v.date, sellPrice: v.sellPrice, buyPrice: v.buyPrice, silverSellPrice: v.silverSellPrice, silverBuyPrice: v.silverBuyPrice }),
        afterSave: (a, h) => { if (a?.documentNumber) h.toast(m("savedNumber", { code: code6(a.documentNumber) })); },
        // The 24K price follows the typed sell price as it is typed (display only).
        // A new set starts with the last saved set's prices (GET /gold-prices/today, the newest set); the person changes only what moved.
        onReady: ({ watch, setValue }) => {
          let now: Record<string, unknown> = {};
          const stop = watch((raw, changed) => {
            now = raw;
            if (changed && changed !== "sellPrice") return;   // setValue below must not re-trigger itself
            const p = typedPiastres(String(raw.sellPrice ?? "").trim());
            setValue("sellPrice24", p === undefined ? "" : piastresText(Math.floor((p * 48 + 21) / 42)));
          });
          const ctl = new AbortController();
          api("/gold-prices/today", { signal: ctl.signal }).then((last) => {
            for (const [k, v] of Object.entries(prefillFromLatest(last as Record<string, unknown>, now, PRICE_FIELDS))) setValue(k, v);
          }).catch(() => {});   // none saved yet (404) or unreachable: the fields stay empty, as before
          return () => { ctl.abort(); stop(); };
        },
        fields: [
          { name: "documentNumber", label: m("documentNumber"), type: "code", documentType: "gold_price", hint: m("autoHint"), section: m("details") },
          { name: "date", label: m("date"), type: "date", required: true, section: m("details") },
          { name: "karat", label: m("karat"), type: "text", disabled: true, help: m("karatHint", { karat: KARAT }), section: m("details") },
          { ...priceField("sellPrice"), section: m("prices") },
          { ...priceField("buyPrice"), section: m("prices") },
          { ...priceField("silverSellPrice"), section: m("prices") },
          { ...priceField("silverBuyPrice"), section: m("prices") },
          { name: "sellPrice24", label: m("sellPrice24"), type: "text", disabled: true, section: m("prices") },
        ],
      },
    },
  };
};

export default function Page() { return <ThingPage make={makeConfig} />; }
