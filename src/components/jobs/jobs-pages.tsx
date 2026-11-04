"use client";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon, jobIconName } from "@/components/shell/icon";
import { useMe } from "@/lib/session";
import { JOBS, QUESTIONS, JOB_GROUPS, canAsk, firstShownStep, isVisible, jobName, matches, runHref, type Lang } from "@/nav/jobs";
import { TodoPanel } from "./todo";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function JobsPage({ kind }: { kind: "jobs" | "questions" | "todo" }) {
  const t = useTranslations("jobs");
  const lang = useLocale() as Lang;
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  if (!me) return null;
  if (kind === "todo") return (
    <div className="jobs-page"><div className="head"><div><h1 className="jobs-title">{t("todo.title")}</h1></div>
      <Link className="btn quiet" href="/jobs"><Icon name="jobs" />{t("home.title")}</Link></div><TodoPanel me={me} always /></div>
  );
  const isJobs = kind === "jobs";
  const items: any[] = isJobs ? JOBS.filter((j) => isVisible(j, me.screens, me.jobs)) : QUESTIONS.filter((x) => canAsk(x, me.screens));
  const hrefOf = (x: any) => (isJobs ? runHref(x, firstShownStep(x, me.screens)) : `/jobs/ask/${encodeURIComponent(x.id)}`);
  const found = items.filter((x) => matches(x, q));
  const label = t(isJobs ? "home.search" : "questions.search");
  return (
    <div className="jobs-page">
      {isJobs ? <TodoPanel me={me} /> : null}
      <div className="head"><div><h1 className="jobs-title" id="jobs-title">{t(isJobs ? "home.title" : "questions.title")}</h1></div>
        <Link className="btn quiet" href={isJobs ? "/jobs/questions" : "/jobs"}><Icon name={isJobs ? "ask" : "jobs"} />{t(isJobs ? "home.know" : "home.title")}</Link></div>
      <label className="search jobs-search"><Icon name="search" /><input type="search" id="jobs-q" placeholder={label} aria-label={label} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
      <div id="jobs-groups" className="jobs-groups">
        {found.length === 0 ? <p className="quiet-note" role="status">{items.length === 0 ? t(isJobs ? "home.none" : "questions.none") : t(isJobs ? "home.noResults" : "questions.noResults")}</p> :
          JOB_GROUPS.map((g) => {
            const inGroup = found.filter((x) => x.group === g);
            return inGroup.length ? (
              <section className="bubble b-purpose" key={g} aria-labelledby={`jobs-${g}`}><h3 className="pill" id={`jobs-${g}`}>{t(`groups.${g}`)}</h3>
                <div className="grid">{inGroup.map((x) => <Link className="tile" key={x.id} href={hrefOf(x)} data-job={x.id}><span className="ico"><Icon name={jobIconName(x.icon)} size={22} /></span><b>{jobName(x, lang)}</b></Link>)}</div></section>
            ) : null;
          })}
      </div>
    </div>
  );
}
