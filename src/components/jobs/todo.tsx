"use client";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { api, newSaveKey } from "@/lib/api";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/shell/icon";
import { findJob, firstShownStep, isVisible, jobName, runHref, type Lang } from "@/nav/jobs";
import type { Me } from "@/stores/ui";

// Port of jobs/todo.js. OWNER RULE: the gold price is always the latest saved price, so there is no "today's price is missing" line.
const TODO_JOBS: Record<string, string> = { purchaseInvoicesNotCoded: "J-K2", transfersToAccept: "J-K8", transfersInTransit: "J-12", lockedAccounts: "J-21", openReservations: "J-S14" };

export async function loadTodo(me: Me) {
  const staff = me.userType !== "user";
  const [todo, locked] = await Promise.all([
    api("/access/me/todo").catch(() => null),
    staff ? api("/users", { query: { locked: "only", limit: 1 } }).then((r) => Number(r?.total) || 0).catch(() => 0) : 0,
  ]);
  const alerts = locked ? [{ key: "locked", count: locked as number, href: me.userType === "super_admin" ? "/setup/users" : "/setup/users?locked=only" }] : [];
  const lines = Object.entries(TODO_JOBS).flatMap(([key, jobId]) => {
    const value = todo?.[key], job = findJob(jobId);
    if (!value || !job || (key === "lockedAccounts" && alerts.length) || !isVisible(job, me.screens, me.jobs)) return [];
    return [{ key, count: typeof value === "number" ? value : 1, jobId, href: runHref(job, firstShownStep(job, me.screens)) }];
  });
  const handOvers = ((todo?.handOvers ?? []) as { id: string; jobId: string; step: number; from: string }[]).flatMap((row) => {
    const job = findJob(row.jobId);
    return job ? [{ row, jobId: row.jobId, href: runHref(job, row.step) }] : [];
  });
  return { hasData: !!todo, alerts, lines, handOvers, count: alerts.length + lines.length + handOvers.length };
}
export const useTodo = (me: Me) => {
  const q = useQuery({ queryKey: ["todo", me.id], queryFn: () => loadTodo(me), staleTime: 30_000, refetchInterval: 120_000 });
  return q.data ?? { hasData: false, alerts: [], lines: [], handOvers: [], count: 0 };
};

export function TodoPanel({ me, always }: { me: Me; always?: boolean }) {
  const t = useTranslations("jobs");
  const home = useTranslations("shell.homeScreen");
  const lang = useLocale() as Lang;
  const q = useQuery({ queryKey: ["todo", me.id], queryFn: () => loadTodo(me), staleTime: 30_000 });
  const data = q.data;
  if (!data) return always ? <div className="skeleton" aria-busy="true"><i /><i /></div> : null;
  if (!data.hasData && data.alerts.length === 0 && !always) return null;
  const empty = !data.lines.length && !data.alerts.length && !data.handOvers.length;
  const done = async (id: string) => { await api(`/access/me/todo/hand-overs/${id}/done`, { method: "POST", saveKey: newSaveKey() }).catch(() => {}); q.refetch(); };
  return (
    <section className="bubble b-todo" aria-labelledby="todo-title">
      <h2 className="pill" id="todo-title">{t("todo.title")}</h2>
      {empty ? <p className="quiet-note" data-todo-empty>{t("todo.empty")}</p> : (
        <ul className="jt-list">
          {data.alerts.map((a) => (
            <li className="jt-row warn" key={a.key} data-alert={a.key}><span className="jt-ico"><Icon name="alert" size={18} /></span><span className="jt-text">{home("alertLocked", { count: a.count })}</span>
              <Link className="jt-go" href={a.href}>{home("alertLockedAction")}<span className="jt-arrow"><Icon name="back" size={16} /></span></Link></li>
          ))}
          {data.lines.map((l) => (
            <li className="jt-row" key={l.key} data-todo={l.key}><span className="jt-text">{t(`todo.${l.key}`, { count: l.count })}</span>
              <Link className="jt-go" href={l.href}>{jobName(findJob(l.jobId), lang)}<span className="jt-arrow"><Icon name="back" size={16} /></span></Link></li>
          ))}
          {data.handOvers.map(({ row, jobId, href }) => (
            <li className="jt-row" key={row.id} data-hand-over={jobId}><span className="jt-text">{t("todo.handOver", { job: jobName(findJob(jobId), lang), from: row.from })}</span>
              <Link className="jt-go" href={href}>{jobName(findJob(jobId), lang)}<span className="jt-arrow"><Icon name="back" size={16} /></span></Link>
              <button type="button" className="btn quiet sm" onClick={() => done(row.id)}>{t("todo.handOverDone")}</button></li>
          ))}
        </ul>
      )}
    </section>
  );
}
