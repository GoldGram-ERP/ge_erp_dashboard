# Dashboard security scan (2026-11-04)

Scope: `apps/ge_erp_dashboard` (src, scripts, next.config.mjs, both lockfiles, full git history, 85 commits). Local only: no Docker, no production calls. Run in WSL Ubuntu, tools in `~/sec/bin` (home folder).

## Tools (source, version)
| Tool | Version | Source |
|---|---|---|
| Semgrep CE | 1.183.0 | `uv tool install semgrep` (PyPI; uv 0.13.7 from astral.sh, because the WSL has no pip) |
| OSV-Scanner | 2.7.0 | github.com/google/osv-scanner release binary `osv-scanner_linux_amd64` |
| Gitleaks | 8.30.1 | github.com/gitleaks/gitleaks release `gitleaks_8.30.1_linux_x64.tar.gz` |
| SonarQube Community Build | SKIPPED | needs a server; not run |

## 1. Semgrep
- Registry packs `p/typescript p/react p/nextjs p/owasp-top-ten` (registry reachable): `semgrep --config p/typescript --config p/react --config p/nextjs --config p/owasp-top-ten .` on a copy of src, scripts, next.config.mjs: **0 findings, 0 errors**.
- Our rules `.semgrep/ge-erp.yml` (8 rules: dangerouslySetInnerHTML, HTML sinks with non-constants, eval/new Function, unchecked navigation from input, fs/child_process from request input, `$queryRawUnsafe`/`$executeRawUnsafe`, secrets in `NEXT_PUBLIC_*`, `target=_blank` without noopener). Run: `semgrep --config .semgrep/ge-erp.yml src scripts next.config.mjs`. 133 files, **3 findings** (WARNING/ERROR by rule), all proposed false positives:
  - `src/things/report-export.ts:59`, `:71` (`document.write` into the print window): every interpolated label goes through `esc()`; the cell/foot strings are React-rendered markup (`renderToStaticMarkup`), so React already escaped them. Static-analysis cannot see that. Proposed dismissal: values are escaped; reproduced with `esc` test (below).
  - `src/things/sales-invoices-print.ts:72` (`document.write`): title and every field in `header/a4/narrow/payments` use `esc()`/`ltr()` (which escapes). Same proposal.
  - A 4th result in the first run (`Select.tsx:110`, `target="_blank"`) was a bug in our rule (the link has `rel="noopener"`); rule fixed, now 0.

## 2. OSV-Scanner (`osv-scanner scan source -L package-lock.json`)
- Dashboard `package-lock.json`: 3 findings, all `minimatch` (10.2.6, 3.1.5, 5.1.9) GHSA-g3hv-75wg-m249 (DoS via globstar amplification). `npm ls minimatch --omit=dev` is empty: **dev only (eslint/tooling), not in production**. Proposed: no action now; they clear on the next eslint/tooling update.
- `e2e-tests/package-lock.json`: 1 finding, `zod 4.6.1` GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constraints). **Dev tooling, never shipped.** Proposed: bump with the e2e tool when convenient.
- Production-reaching vulnerabilities: **0**.

## 3. Gitleaks (history, `gitleaks git`)
- 6 results, all rule `generic-api-key`, all `password: '...'` literals in `e2e-tests/tests/users-ui.e2e.ts` (l.38, 61) and `e2e-tests/tests/money-api.e2e.ts` (l.11, 232, 238) across commits 04e4bcc9, d978dac9, c9c6f7a1, 80128883. Proposed dismissal for all 6: **local test value, never a real credential** (accounts superadmin/e2eadmin/e2euser and throw-away users on the local WSL database only).
- Extra sweep of the whole history for GitHub tokens (`ghp_`, `github_pat_`), AWS keys, private keys, JWTs, Dokploy/Hostinger strings, `sk-`/`xox` keys, and files named `.env`/`.pem`/`.key`/`secret`/`credential`: **no match**. No real token, Hostinger upload key, Dokploy key or owner password found in the history. (`app.zip` at the folder root is untracked.)

## 4. Manual logic review
| Area | Result |
|---|---|
| `src/proxy.ts` | Redirects to sign-in when the better-auth session cookie is absent (name matched with and without `__Secure-`); presence-only check, the app layout verifies with `/access/me`. No `next` parameter exists, so **no open redirect**. OK. |
| `src/lib/api.ts` | Browser calls same-origin `/api`; server-side `API_URL` is env only; SSR forwards the visitor's own cookie only. Idempotency-Key on every write, kept across retries. OK. |
| Print pages | `esc()` on every interpolated string; table cells are React-escaped. No XSS found. No `dangerouslySetInnerHTML`/`innerHTML` in src. |
| CSRF | Backend (read only): better-auth `trustedOrigins` + origin check on, CORS limited to `DASHBOARD_ORIGIN`, cookie HttpOnly. OK for the browser path; see backend notes. |
| Headers (**fixed**) | Only `frame-ancestors/base-uri/object-src` existed; no script/connect policy. |
| Browser storage (**fixed**) | The persisted query cache (`ge-erp:query`, 24 h) and `ge-erp:me` were cleared only on sign-out and on 401 in the app. After an expired session or a closed tab they stayed in the browser and the next person to sign in on that PC started from them. |

## Fixed (commit 49f40b5 + this one)
1. **Content-Security-Policy** added in `next.config.mjs` (`default-src/connect-src/form-action 'self'`, `script-src 'self' 'unsafe-inline'` (plus `'unsafe-eval'` in dev only), `frame-src 'none'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`). HSTS, Permissions-Policy `camera=(self)`, Referrer-Policy were already present. Verified on a real `next build` + `next start` of the commit on localhost: the sign-in page answers 200 with all headers. Test: `src/lib/security.test.ts` "response headers" (fails before: no `csp` export / no script-src).
2. **Sign-in page clears the last person's browser data** (`useForgetMe` on mount; `clearRemembered()` in `src/lib/session.ts`). Test: `src/lib/security.test.ts` "what a signed-out browser keeps".
3. Escaping regression test for the print pages: "print pages escape backend text" (guards `esc`).
Checks: `npm run typecheck` clean; `npx vitest run` 11 files / 56 tests pass; `next build --webpack` in a temp worktree OK (worktree removed).

## Proposed dismissals (owner/lead decides; nothing was dismissed)
1. Semgrep own-rule x3 (report-export.ts:59, :71; sales-invoices-print.ts:72): values escaped.
2. Gitleaks x6: local test passwords in e2e tests.
3. OSV minimatch x3: dev-only. OSV zod (e2e-tests): dev-only.

## Open items
- CSP still allows `'unsafe-inline'` scripts (Next hydration, the before-paint snippet in the layout, `onclick="print()"` in print windows). Upgrade: per-request nonce from `proxy.ts` and move the print button to `addEventListener`. Not done (risk to every page within the time limit).
- The CSP was checked by header only, not by loading every page in a browser; run the local e2e suite once before the next deploy to confirm nothing is blocked.
- Local drafts (`treasury-transfer` draft keys, `ge-erp:ui`) are not in the clear list; no money data, low risk.
- `window.location.assign(...invoiceNumber=${n})` (gold-purchases*.tsx) puts a backend value in a query string without `encodeURIComponent`; path is fixed, so low risk.

## Not covered
SonarQube (needs a server); any dynamic scan/DAST or production check; the backend and its dependencies (read only); the e2e tests' own code beyond the scanners.

## Backend notes (not touched)
- Non-auth routes rely on SameSite cookies + CORS + JSON-only bodies; no explicit Origin check outside better-auth. Worth a test that a cross-origin form POST (text/plain) to a write route is refused.
- Backend uses `$queryRawUnsafe`? Not checked here; run `.semgrep/ge-erp.yml` on the backend.
