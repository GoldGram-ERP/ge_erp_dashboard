// Half jobs: the steps a person cannot do go to the to-do of whoever holds those screens (port of jobs/todo.api + registry.handOverSteps).
import { api, newSaveKey } from "@/lib/api";

/* eslint-disable @typescript-eslint/no-explicit-any */
// What a half job leaves undone: steps on screens closed for this person (an optional step is nobody's work).
export const handOverSteps = (job: any, screens: string[]): { step: number; screen: string; title: any }[] =>
  job.steps.flatMap((s: any, i: number) => (!s.optional && !screens.includes(s.screen) ? [{ step: i, screen: s.screen, title: s.title }] : []));

export const sendHandOvers = (jobId: string, steps: { step: number; screen: string }[], carried: Record<string, string>) =>
  api("/access/me/todo/hand-overs", { method: "POST", body: { jobId, steps, carried } });
export const handOverDone = (id: string) => api(`/access/me/todo/hand-overs/${id}/done`, { method: "POST", saveKey: newSaveKey() });
