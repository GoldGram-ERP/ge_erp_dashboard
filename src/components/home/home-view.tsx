"use client";
import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { api, ApiFailure } from "@/lib/api";
import { dateText, piastresText, timeText, today } from "@/lib/format";
import { Link, useRouter } from "@/i18n/navigation";
import { Icon } from "@/components/shell/icon";
import { useMe, isSuper } from "@/lib/session";
import { allLeaves, canOpen } from "@/nav/tree";
import { useUi } from "@/stores/ui";

type Price = { sellPrice: number; date: string } | null;
type Leaf = ReturnType<typeof allLeaves>[number];
const tile = (leaf: Leaf, label: string, group: string) => (
  <Link className="tile" key={leaf.route} href={leaf.route}><span className="ico"><Icon name={leaf.group.icon} /></span><span><b>{label}</b><small>{group}</small></span></Link>
);

export function HomeView() {
  const t = useTranslations();
  const h = useTranslations("shell.homeScreen");
  const router = useRouter();
  const { data: me } = useMe();
  const ui = useUi();
  const [q, setQ] = useState("");
  const price = useQuery<Price>({ queryKey: ["gold-price-today"], queryFn: () => api("/gold-prices/today").then((r) => r ?? null, (e) => { if (e instanceof ApiFailure && e.status === 404) return null; throw e; }) });
  const staff = me?.userType !== "user";
  const locked = useQuery({ queryKey: ["locked-count"], enabled: !!me && staff, queryFn: () => api("/users", { query: { locked: "only", limit: 1 } }).then((r) => Number(r?.total) || 0) });
  if (!me) return null;
  const leaves = allLeaves().filter((l) => (!l.group.superOnly || isSuper(me)) && canOpen(me, l.screens));
  const pins = (ui.pins[me.id] ?? []).map((r) => leaves.find((l) => l.route === r)).filter((x): x is Leaf => !!x);
  const recents = (ui.recents[me.id] ?? []).map((r) => ({ ...r, leaf: leaves.find((l) => l.route === r.id) })).filter((r): r is typeof r & { leaf: Leaf } => !!r.leaf);
  const sameDay = (at: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(at) === today();
  const dayOf = (at: number) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit", month: "2-digit" }).format(at);
  const when = (at: number) => (sameDay(at) ? timeText(at) : `${dayOf(at)} ${timeText(at)}`);   // 12-hour clock, as everywhere
  const find = (e: FormEvent) => { e.preventDefault(); if (q.trim()) router.push(`/sales/invoices?q=${encodeURIComponent(q.trim())}`); };
  return (
    <>
      <div className="head"><div><h1>{h("welcome", { name: me.name })}</h1><div className="sub" dir="ltr" style={{ textAlign: "start" }}>{today()}</div></div></div>
      <div className="home">
        <section className="bubble b-price" aria-labelledby="hp-t"><span className="pill" id="hp-t">{t("app.home.price")}</span>
          {price.isPending ? <div className="skeleton"><i /><i /></div> : price.isError ? <p className="quiet-note">{h("priceLoadFailed")}</p> : !price.data ? <p className="quiet-note">{h("priceNeverEntered")}</p> : (
            <div>
              <div className="price" dir="ltr"><b>{piastresText(price.data.sellPrice)}</b><span>{t("app.home.unit")}</span></div>
              <p className="quiet-note">{h("priceEntered", { date: `⁦${dateText(price.data.date)}⁩` })} · {t("app.home.priceNote")}</p>
              <Link className="btn quiet sm" href="/setup/gold-prices">{h("priceHistory")}</Link>
            </div>)}
        </section>
        {staff && locked.data ? (
          <section className="bubble b-alert" aria-labelledby="ha-t"><span className="pill" id="ha-t">{h("alertsTitle")}</span>
            <Link className="alert-row" href={isSuper(me) ? "/control/accounts" : "/setup/users"}><span>{h("alertLocked", { count: locked.data })}</span><b>{h("alertLockedAction")}</b></Link></section>
        ) : null}
        <section className="bubble b-find" aria-labelledby="hf-t"><span className="pill" id="hf-t">{t("app.home.find")}</span>
          <form id="find" className="find" onSubmit={find}><label className="search"><Icon name="search" /><input id="find-q" inputMode="numeric" placeholder={t("app.home.invoiceNo")} aria-label={h("findInvoice")} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} /></label><button className="btn primary" type="submit">{t("app.home.findGo")}</button></form></section>
        <section className="bubble b-pins" aria-labelledby="hs-t"><span className="pill" id="hs-t">{h("shortcutsTitle")}</span>
          <div className="grid" id="pins">{pins.length ? pins.map((l) => tile(l, t(`nav.item.${l.id}`), t(`nav.group.${l.group.id}`))) : <p className="quiet-note">{t("app.home.pinsEmpty")}</p>}</div></section>
        <section className="bubble b-recent" aria-labelledby="hr-t"><span className="pill" id="hr-t">{h("recentTitle")}</span>
          {recents.length ? <ul className="recent-list">{recents.map((r) => <li key={r.id}><Link href={r.leaf.route}><span>{t(`nav.item.${r.leaf.id}`)}</span><small dir="ltr">{when(r.at)}</small></Link></li>)}</ul> : <p className="quiet-note">{h("recentEmpty")}</p>}</section>
      </div>
    </>
  );
}
