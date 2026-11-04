"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Icon, jobIconName } from "@/components/shell/icon";
import { useMe } from "@/lib/session";
import { JOBS, QUESTIONS, JOB_GROUPS, canAsk, findJob, firstShownStep, isHalf, isRunnable, isVisible, jobName, matches, runHref, type Lang } from "@/nav/jobs";
import { handOverSteps } from "@/lib/jobs/hand-over";
import { clearRunMemory, runMemory } from "./job-bar";
import { TodoPanel } from "./todo";

/* eslint-disable @typescript-eslint/no-explicit-any */
export function JobsPage({ kind }: { kind: "jobs" | "questions" | "todo" }) {
  const t = useTranslations("jobs");
  const lang = useLocale() as Lang;
  const { data: me } = useMe();
  const [q, setQ] = useState("");
  const doneId = useSearchParams().get("done");
  // How the finished job went, read once before the home clears the run's memory: starting a job is a new run.
  const [held] = useState(() => { const d = findJob(doneId ?? undefined); const m = runMemory(); return d ? d.steps.map((step: any, i: number) => ({ step, mem: m[`${d.id}:${i}`] })) : []; });
  useEffect(() => { if (kind === "jobs") clearRunMemory(); }, [kind]);
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
  const done = isJobs ? findJob(doneId ?? undefined) : undefined;
  const sep = lang === "ar" ? "، " : ", ";
  const savedCount = held.filter((r: any) => r.mem?.saved).length;
  const skipped = held.filter((r: any) => r.mem?.skipped && !r.mem.saved).map((r: any) => jobName(r.step.title, lang));
  const notYours = done && isHalf(done, me.screens, me.jobs) ? handOverSteps(done, me.screens).map((r: any) => jobName(r.title, lang)) : [];
  const then = (done?.then ?? []).flatMap((id: string) => { const j = findJob(id); return j && isRunnable(j, me.screens) ? [j] : []; });
  const tile = (x: any) => <Link className="tile" key={x.id} href={hrefOf(x)} data-job={x.id}><span className="ico"><Icon name={jobIconName(x.icon)} size={22} /></span><b>{jobName(x, lang)}</b></Link>;
  return (
    <div className="jobs-page">
      {done ? (
        <section className="bubble b-done" aria-labelledby="done-title">
          <h2 className="pill" id="done-title" role="status"><Icon name="check" size={18} /> {t("home.done", { job: jobName(done, lang) })}</h2>
          {savedCount + skipped.length > 0 ? <p className="quiet-note" data-done-summary>{t("home.summary", { saved: savedCount, skipped: skipped.length })}{skipped.length ? ` · ${t("home.skippedNames", { names: skipped.join(sep) })}` : ""}</p> : null}
          {notYours.length ? <p className="quiet-note warn" data-done-not-yours><Icon name="lock" size={14} /> {t("home.notYours", { names: notYours.join(sep) })}</p> : null}
          {then.length ? <><h3 className="grp-title">{t("home.whatNext")}</h3><div className="grid" data-then>{then.map(tile)}</div></> : null}
        </section>
      ) : null}
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
                <div className="grid">{inGroup.map(tile)}</div></section>
            ) : null;
          })}
      </div>
    </div>
  );
}
