"use client";
// /jobs/run/<id>?step=n and /jobs/ask/<id>: both land on the page that owns the screen, with ?job=&step= (run) or the period filters (ask).
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRouter, Link } from "@/i18n/navigation";
import { Icon } from "@/components/shell/icon";
import { useMe } from "@/lib/session";
import { QUESTIONS, canAsk, findJob, firstShownStep, isVisible } from "@/nav/jobs";
import { carriedOf, routeForQuestion, routeForStep } from "@/lib/jobs/route";

function Unavailable({ title }: { title: string }) {
  const t = useTranslations("jobs");
  return <div className="empty" role="status" data-job-unavailable><Icon name="lock" size={36} /><strong>{title}</strong><Link className="btn quiet" href="/jobs"><Icon name="jobs" />{t("home.title")}</Link></div>;
}
const Waiting = () => <div className="skeleton" aria-busy="true"><i /><i /></div>;

export function JobRun({ id }: { id: string }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const sp = useSearchParams();
  const { data: me } = useMe();
  const job = findJob(id);
  const ok = !!me && !!job && isVisible(job, me.screens, me.jobs);
  const asked = Number(sp.get("step")) - 1;
  const index = !job ? 0 : Number.isInteger(asked) && asked >= 0 && asked < job.steps.length ? asked : me ? firstShownStep(job, me.screens) : 0;
  const to = ok ? routeForStep(job!.steps[index], { job, n: index + 1, carried: carriedOf(sp) }) : null;
  useEffect(() => { if (to) router.replace(to); }, [to, router]);   // replace: Back from the page never returns to this redirect
  if (!me) return null;
  if (!ok) return <Unavailable title={t("run.unavailable")} />;
  return to ? <Waiting /> : <Unavailable title={t("run.noScreen")} />;
}

export function AskRun({ id }: { id: string }) {
  const t = useTranslations("jobs");
  const router = useRouter();
  const { data: me } = useMe();
  const q = QUESTIONS.find((x) => x.id === id);
  const ok = !!me && !!q && canAsk(q, me.screens);
  const to = ok ? routeForQuestion(q) : null;
  useEffect(() => { if (to) router.replace(to); }, [to, router]);
  if (!me) return null;
  if (!ok) return <Unavailable title={t("ask.unavailable")} />;
  return to ? <Waiting /> : <Unavailable title={t("run.noScreen")} />;
}
