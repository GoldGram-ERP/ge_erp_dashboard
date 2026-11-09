// The label look saved on the server (GET/PUT/DELETE /label-settings): one profile for the whole ERP. The rules are in printer-label-rules.ts.
import { api } from "@/lib/api";
import { cleanProfile, type LabelProfile } from "./printer-label-rules";

export type SavedLabelSettings = { profile: LabelProfile | null; updatedAt: string | null; updatedByName: string | null };
type Answer = { settings?: unknown; updatedAt?: string | null; updatedByName?: string | null } | undefined;
const read = (a: Answer): SavedLabelSettings => ({ profile: cleanProfile(a?.settings), updatedAt: a?.updatedAt ?? null, updatedByName: a?.updatedByName ?? null });

export const fetchLabelSettings = (signal?: AbortSignal) => api<Answer>("/label-settings", { signal }).then(read);
export const saveLabelSettings = (profile: LabelProfile) => api<Answer>("/label-settings", { method: "PUT", body: { settings: profile } }).then(read);
export const resetLabelSettings = () => api("/label-settings", { method: "DELETE" });

export const PROFILE_WAIT_MS = 3000;
/** The profile a print should use, or null. Never throws and never waits more than about 3 s: a slow or down server, a 401/403 or no profile all give null (the old label), so printing is never blocked. */
export async function loadPrintProfile(ms: number = PROFILE_WAIT_MS): Promise<LabelProfile | null> {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), ms);
  try { return (await fetchLabelSettings(ctl.signal)).profile; } catch { return null; } finally { clearTimeout(timer); }
}
