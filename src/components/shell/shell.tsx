"use client";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api, SESSION_ENDED } from "@/lib/api";
import { isSuper, useForgetMe, useMe } from "@/lib/session";
import { NAV, allLeaves, canOpen } from "@/nav/tree";
import { useUi, type Me } from "@/stores/ui";
import { useTodo } from "@/components/jobs/todo";
import { JobBar } from "@/components/jobs/job-bar";
import { ChangePassword } from "./change-password";
import { Icon } from "./icon";
import { SessionLock } from "./session-lock";

const JOBS_ITEMS = [["", "jobsHome"], ["questions", "jobsQuestions"], ["todo", "jobsTodo"]] as const;
const narrow = () => matchMedia("(max-width:900px)").matches;

export function Shell({ initialMe, children }: { initialMe: Me; children: ReactNode }) {
  const router = useRouter();
  const forget = useForgetMe();
  const { data, error } = useMe(initialMe);
  const me = data ?? initialMe;
  const t = useTranslations();
  const pathname = usePathname();
  const ui = useUi();
  const [drawer, setDrawer] = useState(false);

  const leave = () => { forget(); router.replace("/sign-in"); };
  const signOut = async () => { await api("/auth/sign-out", { method: "POST" }).catch(() => {}); leave(); };
  useEffect(() => { window.addEventListener(SESSION_ENDED, leave); return () => window.removeEventListener(SESSION_ENDED, leave); });
  useEffect(() => { if ((error as { status?: number } | null)?.status === 401) leave(); });

  const collapsedNow = () => document.documentElement.classList.contains("sb-collapsed");
  // The collapsed state lives on <html> (set before paint by the head script) and in the saved interface state.
  useEffect(() => { document.documentElement.classList.toggle("sb-collapsed", ui.collapsed); }, [ui.collapsed]);
  useEffect(() => { document.body.classList.toggle("sb-open", drawer); }, [drawer]);
  const toggleSidebar = () => { if (narrow()) setDrawer((d) => !d); else ui.setCollapsed(!collapsedNow()); };
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); } };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- close the drawer after a navigation
  useEffect(() => { setDrawer(false); if (pathname !== "/sign-in") ui.setLastRoute(pathname); const leaf = allLeaves().find((l) => pathname === l.route || pathname.startsWith(l.route + "/")); if (leaf) ui.recordRecent(me.id, leaf.route); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const [health, setHealth] = useState<"checking" | "ok" | "bad">("checking");
  useEffect(() => {
    const ping = () => fetch("/api/health", { cache: "no-store" }).then((r) => setHealth(r.ok ? "ok" : "bad")).catch(() => setHealth("bad"));
    ping();
    const timer = setInterval(ping, 30000);
    const off = () => setHealth("bad");
    window.addEventListener("online", ping); window.addEventListener("offline", off);
    return () => { clearInterval(timer); window.removeEventListener("online", ping); window.removeEventListener("offline", off); };
  }, []);

  const groups = NAV.filter((g) => !g.superOnly || isSuper(me)).map((g) => ({ ...g, items: g.items.filter((i) => canOpen(me, i.screens)) })).filter((g) => g.items.length);
  const pins = (ui.pins[me.id] ?? []).map((r) => groups.flatMap((g) => g.items).find((i) => i.route === r)).filter((x) => !!x);
  const todo = useTodo(me);
  const isActive = (route: string) => pathname === route || pathname.startsWith(route + "/");
  const jobsActive = pathname === "/jobs" || pathname.startsWith("/jobs/");
  const open = (id: string) => ui.openGroups.includes(id);
  const allIds = [...groups.map((g) => g.id), "jobs"];
  const allOpen = allIds.every(open);
  const toggleLabel = `${ui.collapsed && !drawer ? t("app.expand") : t("app.collapse")} (Ctrl+B)`;
  const locale = useLocale();
  const other = locale === "ar" ? "en" : "ar";
  const statusText = health === "ok" ? t("app.statusOk") : health === "bad" ? t("app.statusBad") : t("app.statusChecking");

  const section = (id: string, icon: string, label: string, active: boolean, isOpen: boolean, items: ReactNode) => (
    <div className={`sec ${isOpen ? "open" : ""} ${active ? "has-active" : ""}`} key={id}>
      <button className="sec-head" aria-expanded={isOpen} title={label}
        onClick={() => { if (ui.collapsed && !narrow()) { ui.setCollapsed(false); if (!isOpen) ui.toggleGroup(id); } else ui.toggleGroup(id); }}>
        <span className="ico"><Icon name={icon} size={19} /></span><span className="name">{label}</span><span className="chev"><Icon name="chev" size={16} /></span>
      </button>
      <div className="things"><div inert={!isOpen}><ul>{items}</ul></div></div>
    </div>
  );
  const row = (leaf: { id: string; route: string }) => {
    const label = t(`nav.item.${leaf.id}`), pinned = (ui.pins[me.id] ?? []).includes(leaf.route);
    const pinLabel = `${pinned ? t("app.unpin") : t("app.pin")} ${label}`;
    return (
      <li className="row" key={leaf.route}>
        <Link className="thing" href={leaf.route} aria-current={isActive(leaf.route) ? "page" : undefined}>{label}</Link>
        <button className="pin" aria-pressed={pinned} title={pinned ? t("app.unpin") : t("app.pin")} aria-label={pinLabel} onClick={() => { ui.togglePin(me.id, leaf.route); if (!open("pins")) ui.toggleGroup("pins"); }}><Icon name="pin" size={15} /></button>
      </li>
    );
  };

  return (
    <>
      <a className="sr-only" href="#ws">{t("shell.skipToContent")}</a>
      {drawer ? <div className="scrim" onClick={() => setDrawer(false)} /> : null}
      <aside id="side"><div className="side-inner">
        <div className="side-head">
          <div className="brand" id="brand">GoldGram</div>
          <button className="ic-btn" id="fold-all" type="button" title={allOpen ? t("app.foldAll") : t("app.unfoldAll")} aria-label={allOpen ? t("app.foldAll") : t("app.unfoldAll")} onClick={() => ui.setGroups(allOpen ? [] : allIds)}><Icon name={allOpen ? "fold" : "unfold"} /></button>
          <button className="ic-btn" id="collapse" type="button" title={toggleLabel} aria-label={toggleLabel} onClick={toggleSidebar}><Icon name="panel" /></button>
        </div>
        <nav id="nav" aria-label="GoldGram">
          <div className={`sec ${pathname === "/" ? "has-active" : ""}`}>
            <Link className="sec-head" href="/" aria-current={pathname === "/" ? "page" : undefined} title={t("nav.home")}><span className="ico"><Icon name="home" size={19} /></span><span className="name">{t("nav.home")}</span></Link>
          </div>
          {section("pins", "pin", t("nav.pinned"), pins.some((p) => p && isActive(p.route)), open("pins"),
            pins.length ? pins.map((p) => p && row(p)) : <li className="hint">{t("app.pinHint")}</li>)}
          {groups.map((g) => section(g.id, g.icon, t(`nav.group.${g.id}`), g.items.some((i) => isActive(i.route)), open(g.id), g.items.map(row)))}
          <div className="divider" />
          {section("jobs", "jobs", t("nav.jobs"), jobsActive, jobsActive || open("jobs"), JOBS_ITEMS.map(([view, key]) => {
            const href = view ? `/jobs/${view}` : "/jobs";
            const current = view ? pathname === href : pathname === "/jobs";
            return <li key={key}><Link className="thing" href={href} aria-current={current ? "page" : undefined}>{t(`nav.${key}`)}{view === "todo" && todo.count ? <span className="dot">{todo.count}</span> : null}</Link></li>;
          }))}
        </nav>
        <div className="side-foot">
          <div className={`status ${health === "ok" ? "ok" : health === "bad" ? "bad" : ""}`} id="status" role="status" aria-live="polite" title={statusText}><i /><div><b>{statusText}</b></div></div>
          <div className="langbar" id="langbar">
            <div className="seg" role="group" aria-label={t("app.language")}>
              <button aria-pressed={locale === "ar"} lang="ar" onClick={() => locale !== "ar" && router.replace(pathname, { locale: "ar" })}>العربية</button>
              <button aria-pressed={locale === "en"} lang="en" onClick={() => locale !== "en" && router.replace(pathname, { locale: "en" })}>English</button>
            </div>
            <button className="ic-btn short" title={other === "en" ? "English" : "العربية"} aria-label={other === "en" ? "English" : "العربية"} onClick={() => router.replace(pathname, { locale: other })}>{other === "en" ? "EN" : "ع"}</button>
          </div>
          <div className="me" id="me">
            <div>{me.name}<small>{t(`app.userType.${me.userType}`)}</small></div>
            <span className="actions">
              <Link className="ic-btn" href="/account" title={t("app.myAccount")} aria-label={t("app.myAccount")}><Icon name="profile" /></Link>
              <button className="ic-btn" type="button" title={t("app.signOut")} aria-label={t("app.signOut")} onClick={signOut}><Icon name="out" /></button>
            </span>
          </div>
        </div>
      </div></aside>
      <div className="main">
        <div className="topbar"><button className="ic-btn" id="trigger" type="button" title={toggleLabel} aria-label={toggleLabel} onClick={toggleSidebar}><Icon name="panel" /></button></div>
        {me.mustChangePassword ? null : <Suspense><JobBar /></Suspense>}
        <section className="ws" id="ws" aria-live="polite">
          {me.mustChangePassword ? <ChangePassword forced /> : children}
        </section>
      </div>
      <SessionLock me={me} onSignOut={signOut} />
    </>
  );
}
