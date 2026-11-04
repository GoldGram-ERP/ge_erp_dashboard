// The jobs registry rules (ported from docs/nav-preview/app/jobs/registry.js). Data: jobs-data.ts.
import { JOB_DATA, QUESTION_DATA } from "./jobs-data";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Lang = "ar" | "en";
export const JOBS = JOB_DATA;
export const QUESTIONS = QUESTION_DATA;
export const JOB_GROUPS = ["sell", "stock", "finance", "people", "control"];
export const findJob = (id?: string) => JOBS.find((j) => j.id === id);
export const jobName = (x: any, lang: Lang) => x[lang] ?? x.ar;

export const isRunnable = (job: any, screens: string[]) => job.steps.every((s: any) => screens.includes(s.screen));
export const isHalf = (job: any, screens: string[], given?: string[]) => !isRunnable(job, screens) && given?.includes(job.id) === true && job.steps.some((s: any) => screens.includes(s.screen));
export const isVisible = (job: any, screens: string[], given?: string[]) => isRunnable(job, screens) || isHalf(job, screens, given);
export const canAsk = (q: any, screens: string[]) => screens.includes(q.screen);
const needsRecord = (step: any) => /\/:\w+/.test(step.href);
export const firstShownStep = (job: any, screens: string[]) => {
  const from = Math.max(0, job.steps.findIndex((s: any) => screens.includes(s.screen)));
  const shown = job.steps.findIndex((s: any, i: number) => i >= from && screens.includes(s.screen) && !needsRecord(s));
  return shown < 0 ? from : shown;
};
export const runHref = (job: any, index: number) => `/jobs/run/${encodeURIComponent(job.id)}?step=${index + 1}`;

// Arabic typed many ways reads as one: no diacritics or tatweel, one alef, ة as ه, ى as ي.
export const normalise = (text: unknown) =>
  String(text ?? "").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").trim();
export const matches = (entry: any, search: string) => {
  const wanted = normalise(search);
  return !wanted || [entry.ar, entry.en, ...entry.keywords.ar, ...entry.keywords.en].some((t) => normalise(t).includes(wanted));
};
