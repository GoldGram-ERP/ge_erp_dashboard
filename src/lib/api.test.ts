import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import errorsEn from "../../messages/en.json";
import errorsAr from "../../messages/ar.json";
import { api, ApiFailure } from "./api";

// fetch is the only boundary replaced; api.ts is the real code.
let calls: { key: string | null; body: string }[] = [];
const answer = (...rs: (() => Response | Promise<Response>)[]) => {
  let i = 0;
  vi.stubGlobal("fetch", (_u: unknown, init: RequestInit) => {
    calls.push({ key: (init.headers as Record<string, string>)["idempotency-key"] ?? null, body: String(init.body ?? "") });
    return Promise.resolve(rs[Math.min(i++, rs.length - 1)]());
  });
};
const json = (status: number, body: unknown) => () => new Response(JSON.stringify(body), { status });
const down = () => { throw new TypeError("failed to fetch"); };

beforeEach(() => { calls = []; process.env.API_URL = "http://x"; });
afterEach(() => vi.unstubAllGlobals());

describe("one Idempotency-Key per user attempt", () => {
  it("a double click sends one request", async () => {
    answer(json(200, { ok: 1 }));
    const [a, b] = await Promise.all([api("/x/1", { method: "DELETE" }), api("/x/1", { method: "DELETE" })]);
    expect(calls).toHaveLength(1);
    expect(a).toEqual(b);
  });
  it("a lost answer is retried with the same key; a final answer renews it", async () => {
    answer(down, json(200, {}), json(200, {}));
    await expect(api("/x", { method: "POST", body: { a: 1 } })).rejects.toMatchObject({ status: 0 });
    await api("/x", { method: "POST", body: { a: 1 } });
    await api("/x", { method: "POST", body: { a: 1 } });
    expect(calls[1].key).toBe(calls[0].key);
    expect(calls[2].key).not.toBe(calls[0].key);
  });
  it("saveInProgress and 5xx keep the key; a 400 and a changed body renew it", async () => {
    answer(json(409, { message: "saveInProgress" }), json(502, {}), json(400, { message: "invalidFields" }), json(200, {}), json(200, {}));
    for (let i = 0; i < 3; i++) await api("/y", { method: "POST", body: 1 }).catch(() => {});
    await api("/y", { method: "POST", body: 1 });
    await api("/y", { method: "POST", body: 2 });
    const k = calls.map((c) => c.key);
    expect(k[1]).toBe(k[0]); expect(k[2]).toBe(k[0]); expect(k[3]).not.toBe(k[0]); expect(k[4]).not.toBe(k[3]);
  });
  it("a given saveKey is used as it is; GET carries none", async () => {
    answer(json(200, {}));
    await api("/z", { method: "POST", saveKey: "mine" }); await api("/z");
    expect(calls.map((c) => c.key)).toEqual(["mine", null]);
  });
});

describe("error mapping", () => {
  it("unreachable server and non-JSON failures become known keys", async () => {
    answer(down); await expect(api("/q")).rejects.toMatchObject({ error: { message: "serverUnreachable" } });
    answer(() => new Response("<html>", { status: 500 })); await expect(api("/q")).rejects.toMatchObject({ error: { message: "unexpected" } });
  });
  it("every error key the backend can throw has a message in both languages", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "../../../ge_erp_backend/src");
    const files: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) { if (f !== "generated") walk(p); } else if (p.endsWith(".ts") && !p.endsWith(".spec.ts")) files.push(p); } };
    walk(root);
    const keys = new Set<string>();
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      for (const m of s.matchAll(/(?:Exception|Error)\(\s*\{?\s*(?:message:\s*)?'([a-zA-Z]+)'/g)) keys.add(m[1]);
      for (const m of s.matchAll(/message:\s*'([a-zA-Z]+)'/g)) keys.add(m[1]);
    }
    // field-level keys (common.fieldErrors) are worded there; the rest in errors; "someKey" is a doc example
    const fieldLevel = new Set(["required", "invalid", "taken", "unknownField", "duplicateAccount", "duplicateItem", "duplicatePiece"]);
    for (const [lang, m] of [["en", errorsEn], ["ar", errorsAr]] as const) {
      const missing = [...keys].filter((k) => k !== "someKey" && !(m as any).errors[k] && !(fieldLevel.has(k) && (m as any).common.fieldErrors[k]));
      expect(missing, lang).toEqual([]);
    }
  });
  it("ApiFailure marks status 0 as unreachable", () => expect(new ApiFailure(0, { message: "serverUnreachable" }).unreachable).toBe(true));
});
