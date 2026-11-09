// The api client: session cookie, one error shape {message, values?, fields?}, an Idempotency-Key on every save.
// Paths are the backend's own (/access/me, /sales-invoices ...). The browser calls this site's /api; Next forwards it (next.config.mjs).
import { noteError } from "./recent-errors";
export const SESSION_ENDED = "ge-erp:session-ended";
const BASE = "/api";

export type ApiError = { message: string; values?: Record<string, unknown>; fields?: unknown };
export class ApiFailure extends Error {
  constructor(public status: number, public error: ApiError) {
    super(error.message);
    this.name = "ApiFailure";
  }
  get unreachable() { return this.status === 0; }
}

export const newSaveKey = () => crypto.randomUUID();

// A write that passes no saveKey still gets ONE key per user attempt (rule G1 idempotency): the same method+path+body shares one
// in-flight request (a double click sends once) and keeps its key while the answer is lost or still running (unreachable, saveInProgress, 5xx),
// so a retry is a repeat the backend answers with the first result. Any definite answer (done or refused) ends the attempt.
const attempts = new Map<string, { key: string; inflight?: Promise<any> }>();
export const keepsKey = (e: unknown) => e instanceof ApiFailure && (e.unreachable || e.status >= 500 || e.error.message === "saveInProgress");

type Query = Record<string, string | number | boolean | undefined | null | (string | number)[]>;
/** form: a multipart body (files); the browser sets its boundary, so no content-type is sent. */
export type Call = { method?: string; body?: unknown; form?: FormData; query?: Query; saveKey?: string; signal?: AbortSignal; blob?: boolean; cookie?: string };

function toQuery(url: URL, query?: Query) {
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, String(x)));
    else url.searchParams.set(k, String(v));
  }
}

// api("/branches", {query}) -> parsed JSON (undefined for 204). blob:true returns the Response (downloads, prints).
// On the server (SSR prefetch) pass the visitor's cookie header and set API_URL; in the browser the cookie travels by itself.
export function api<T = any>(path: string, call: Call = {}): Promise<T> {
  const m = call.method ?? "GET";
  if (m === "GET" || m === "HEAD" || call.saveKey) return send<T>(path, call);
  const id = `${m} ${path} ${JSON.stringify(call.query ?? "")} ${JSON.stringify(call.body ?? "")}`;
  const a = attempts.get(id) ?? { key: newSaveKey() };
  attempts.set(id, a);
  if (a.inflight) return a.inflight;
  a.inflight = send<T>(path, { ...call, saveKey: a.key }).then(
    (r) => { attempts.delete(id); return r; },
    (e) => { if (keepsKey(e)) a.inflight = undefined; else attempts.delete(id); throw e; },
  );
  return a.inflight;
}

async function send<T>(path: string, call: Call): Promise<T> {
  const method = call.method ?? "GET";
  const server = typeof window === "undefined";
  const base = server ? (process.env.API_URL ?? "").replace(/\/$/, "") : BASE;
  const url = server ? new URL(base + path) : new URL(BASE + path, location.origin);
  toQuery(url, call.query);
  const headers: Record<string, string> = { accept: "application/json" };
  if (call.body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET" && method !== "HEAD") headers["idempotency-key"] = call.saveKey ?? newSaveKey();
  if (server && call.cookie) headers.cookie = call.cookie;
  let response: Response;
  try {
    response = await fetch(url, { method, headers, credentials: "same-origin", signal: call.signal, body: call.form ?? (call.body === undefined ? undefined : JSON.stringify(call.body)), cache: "no-store" });
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    if (!server) noteError(path, 0, "serverUnreachable");
    throw new ApiFailure(0, { message: "serverUnreachable" });
  }
  if (!response.ok) {
    let body: any = null;
    try { body = await response.json(); } catch { /* not json */ }
    const error: ApiError = body && typeof body.message === "string" ? body : { message: "unexpected" };
    if (!server) noteError(path, response.status, error.message);
    if (!server && response.status === 401 && error.message === "signInRequired") window.dispatchEvent(new Event(SESSION_ENDED));
    throw new ApiFailure(response.status, error);
  }
  if (call.blob) return response as T;
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
