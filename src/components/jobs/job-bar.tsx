"use client";
// The bar above a page that is a step of a job (port of docs/nav-preview/app/jobs/bar.js + dashboard job-bar.tsx).
// Home · step n of m · tracker · hint · Back · Skip (optional steps) · Next or Finish. Alt+Left / Alt+Right = Back / Next.
// Carried values live in the address (?job&step&<carried>). A page that saved something says so with
//   window.dispatchEvent(new CustomEvent("ge-erp:job-carry", { detail: { invoice: "..." } }))
// and the bar keeps it for the next step. Finish hands the steps left undone to whoever holds their screens.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Icon } from "@/components/shell/icon";
import { Button } from "@/components/ui";
import { useMe } from "@/lib/session";
import { toast } from "@/lib/toast";
import { findJob, isHalf, jobName, type Lang } from "@/nav/jobs";
import { carriedOf, pathOf, routeForStep, stepNames } from "@/lib/jobs/route";
import { handOverSteps, sendHandOvers } from "@/lib/jobs/hand-over";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Held = { saved?: boolean; skipped?: boolean; passed?: boolean };
// What each step of the running job holds, in memory only (a refresh clears it).
const memory: Record<string, Held> = {};
const keyOf = (jobId: string, i: number) => `${jobId}:${i}`;
export const runMemory = () => ({ ...memory });
export const clearRunMemory = () => { for (const k of Object.keys(memory)) delete memory[k]; };

export function JobBar() {
  const sp = useSearchParams();
  const job = findJob(sp.get("job") ?? undefined);
  const index = Number(sp.get("step")) - 1;
  if (!job || !Number.isInteger(index) || index < 0 || index >= job.steps.length) return null;
  return <Bar key={job.id} job={job} index={index} />;
}

function Bar({ job, index }: { job: any; index: number }) {
  const t = useTranslations("jobs");
  const lang = useLocale() as Lang;
  const router = useRouter();
  const sp = useSearchParams();
  const { data: me } = useMe();
  const [live, setLive] = useState<Record<string, string>>({});   // values a page handed over by "ge-erp:job-carry"
  const [, bump] = useState(0);
  const busy = useRef(false);
  const L = (x: any) => x[lang] ?? x.ar;
  const carried = useMemo(() => ({ ...carriedOf(sp), ...live }), [sp, live]);
  const step = job.steps[index];
  const count = job.steps.length;
  const screens = me?.screens ?? [];
  const plainUser = me?.userType === "user";
  const lockedAt = useCallback((at: number) => plainUser && !screens.includes(job.steps[at].screen), [plainUser, screens, job]);
  const firstOpenAfter = (from: number) => { let x = from + 1; while (x < count && lockedAt(x)) x++; return x; };
  const canOpen = (at: number, all: Record<string, string>) => stepNames(job.steps[at].href).every((n) => Boolean(all[n]));
  const nextOpen = firstOpenAfter(index);
  const isLast = nextOpen >= count;
  const mine = lockedAt(index);
  const waiting = !mine && [...stepNames(step.href), ...(step.needs ?? [])].some((n: string) => !carried[n]) && job.steps.slice(0, index).some((_: any, at: number) => lockedAt(at));

  // A page says what it saved: the step is marked saved and the value goes on the address.
  useEffect(() => {
    const onCarry = (e: Event) => {
      const detail = ((e as CustomEvent).detail ?? {}) as Record<string, string>;
      setLive((l) => ({ ...l, ...detail }));
      memory[keyOf(job.id, index)] = { ...memory[keyOf(job.id, index)], saved: true, skipped: false };
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(detail)) p.set(k, String(v));
      window.history.replaceState(null, "", `${window.location.pathname}?${p}`);
      bump((n) => n + 1);
    };
    window.addEventListener("ge-erp:job-carry", onCarry);
    return () => window.removeEventListener("ge-erp:job-carry", onCarry);
  }, [job.id, index]);

  const goStep = useCallback((target: number, all: Record<string, string>) => {
    const to = routeForStep(job.steps[target], { job, n: target + 1, carried: all });
    if (!to) toast(t("bar.noScreen"), true); else router.push(to);
  }, [job, router, t]);
  const finish = (all: Record<string, string>) => {
    // Finish hands the steps left undone to whoever holds their screens, with everything the run carried.
    const left = me && isHalf(job, screens, me.jobs) ? handOverSteps(job, screens) : [];
    if (left.length) sendHandOvers(job.id, left.map(({ step: s, screen }) => ({ step: s, screen })), all).catch(() => toast(t("bar.handOverFailed"), true));
    router.push(`/jobs?done=${encodeURIComponent(job.id)}`);
  };
  // A step whose address needs a record nobody made or picked is no destination; the step that makes or picks it comes first.
  const next = (more: Record<string, string> = {}) => {
    const all = { ...carried, ...more };
    const here = pathOf(step, carried);
    let target = nextOpen;
    while (target < count && (!canOpen(target, all) || pathOf(job.steps[target], all) === here)) target = firstOpenAfter(target);
    return target >= count ? finish(all) : goStep(target, all);
  };
  const runNext = () => {
    if (busy.current) return;
    busy.current = true;
    const k = keyOf(job.id, index);
    if (!memory[k]?.saved) memory[k] = { ...memory[k], passed: true };
    try { next(); } finally { busy.current = false; }
  };
  const back = () => {
    let target = index - 1;
    while (target >= 0 && (lockedAt(target) || !canOpen(target, carried))) target--;
    if (target < 0) router.push("/jobs"); else goStep(target, carried);
  };
  const skip = () => { memory[keyOf(job.id, index)] = { ...memory[keyOf(job.id, index)], skipped: true }; next(); };

  const nextRef = useRef(runNext), backRef = useRef(back);
  nextRef.current = runNext; backRef.current = back;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      if (document.querySelector("dialog[open]")) return;
      e.preventDefault();                                              // Alt+Left is the browser's own Back otherwise
      if (e.key === "ArrowRight") nextRef.current(); else backRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A plain User who types the address of a later step without what the earlier steps carried goes to the first save step.
  const firstSave = plainUser && stepNames(step.href).some((n: string) => !carried[n]) ? job.steps.findIndex((s: any, i: number) => i < index && s.action === "save" && !s.optional && !lockedAt(i)) : -1;
  useEffect(() => {
    if (firstSave < 0) return;
    const to = routeForStep(job.steps[firstSave], { job, n: firstSave + 1, carried: {} });
    if (to) router.replace(to);
  }, [firstSave, job, router]);

  if (!me) return null;
  const names = (list: any[]) => list.map(L).join(lang === "ar" ? "، " : ", ");
  const notYours = job.steps.filter((_: any, i: number) => lockedAt(i)).map((s: any) => s.title);
  const held = memory[keyOf(job.id, index)];
  const gateNames = names(job.steps.slice(0, index).filter((_: any, at: number) => lockedAt(at)).map((s: any) => s.title));
  return (
    <>
      <nav className="jobbar" data-job-bar aria-label={t("bar.label", { job: jobName(job, lang) })}>
        <Button size="sm" data-jb="home" onClick={() => router.push("/jobs")}><Icon name="home" size={16} />{t("bar.home")}</Button>
        <div className="jb-main" aria-live="polite">
          <h2 className="jb-title" data-job-title>{t("bar.stepOf", { n: index + 1, m: count })} · {L(step.title)}</h2>
          {!waiting && !mine ? <span className="hint" data-job-hint>{L(step.hint)}</span> : null}
          {held?.saved ? <span className="jb-saved" role="status">{t("bar.alreadySaved")}</span> : null}
          <ol className="steps" data-job-tracker aria-label={t("bar.trackerLabel")}>
            {job.steps.map((s: any, i: number) => {
              const h = memory[keyOf(job.id, i)];
              const mark = lockedAt(i) ? "locked" : i === index ? "current" : h?.saved ? "saved" : h?.skipped ? "skipped" : h?.passed ? "passed" : "left";
              const words = t("bar.trackerStep", { n: i + 1, title: L(s.title), status: t(`bar.mark.${mark}`) });
              return <li key={i} className={`m-${mark}`} data-step-mark={mark} title={words}><span className="sr-only">{words}</span></li>;
            })}
          </ol>
          {notYours.length ? <span className="jb-locked" data-job-locked><Icon name="lock" size={14} /> {t("bar.notYours", { names: names(notYours) })}</span> : null}
        </div>
        <div className="jb-btns">
          <Button size="sm" data-jb="back" onClick={back}><Icon name="chev" size={16} />{t("bar.back")}</Button>
          {step.optional ? <Button size="sm" data-jb="skip" onClick={skip}>{t("bar.skip")}</Button> : null}
          <Button variant="primary" size="sm" data-jb="next" onClick={runNext}>{t(isLast ? "bar.finish" : "bar.next")}<Icon name={isLast ? "check" : "back"} size={16} /></Button>
        </div>
      </nav>
      {mine || waiting ? (
        <div className="empty jobs-gate" role="status" {...(mine ? { "data-job-not-yours": "" } : { "data-job-waiting": "" })}><Icon name="lock" size={40} />
          <strong>{t(mine ? "bar.lockedTitle" : "bar.waitingTitle")}</strong><span>{mine ? t("bar.lockedBody") : t("bar.waitingBody", { names: gateNames })}</span></div>
      ) : null}
    </>
  );
}
