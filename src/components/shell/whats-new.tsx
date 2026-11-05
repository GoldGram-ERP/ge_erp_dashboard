"use client";
import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { useMe } from "@/lib/session";
import { CHANGELOG, SEEN_KEY, canSeeChangelog, latestVersion, type Change } from "@/lib/changelog";
import { findLeaf } from "@/nav/tree";

// What's new, version by version, for the Admin and the Super admin (src/lib/changelog.ts holds the words).
// "Where" is Group > Screen from the real menu names; the button opens that screen.
export function WhatsNewView() {
  const t = useTranslations();
  const w = useTranslations("app.whatsNew");
  const lang = useLocale() === "ar" ? "ar" : "en";
  const router = useRouter();
  const { data: me } = useMe();
  const allowed = canSeeChangelog(me?.userType);

  // Someone who may not see it goes Home; whoever may, has now seen the newest version (the dot in the menu goes).
  useEffect(() => {
    if (!me) return;
    if (!allowed) { router.replace("/"); return; }
    try { localStorage.setItem(SEEN_KEY, latestVersion()); window.dispatchEvent(new Event("ge-erp:whats-new-seen")); } catch { /* private mode: the dot stays */ }
  }, [me, allowed, router]);

  if (!me || !allowed) return null;
  const where = (c: Change): string | null => {
    if (!c.route) return null;
    if (c.route === "/") return t("nav.home");
    const leaf = findLeaf(c.route);
    return leaf ? `${t(`nav.group.${leaf.group.id}`)} › ${t(`nav.item.${leaf.id}`)}` : null;
  };
  return (
    <>
      <div className="head"><div><h1>{w("title")}</h1><div className="sub">{w("sub")}</div></div></div>
      <div id="whats-new" className="wn">
        {CHANGELOG.map((r, i) => (
          <section className="wn-release" key={r.version} aria-labelledby={`wn-${r.version}`}>
            <h2 id={`wn-${r.version}`}><span dir="ltr">v{r.version}</span>{i === 0 ? <span className="wn-latest">{w("latest")}</span> : null}<small dir="ltr">{r.date}</small></h2>
            <ul>
              {r.changes.map((c, j) => {
                const place = where(c);
                return (
                  <li className="wn-change" key={j} data-kind={c.kind}>
                    <span className={`wn-kind ${c.kind}`}>{w(`kind.${c.kind}`)}</span>
                    <div className="wn-text">
                      <p>{c[lang]}</p>
                      {place && <div className="wn-where"><span>{w("where")}: <b>{place}</b></span>{c.route ? <Link className="btn quiet sm" href={c.route}>{w("open")}</Link> : null}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}
