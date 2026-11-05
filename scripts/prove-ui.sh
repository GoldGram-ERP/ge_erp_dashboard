#!/bin/bash
# One command to prove a UI change locally: build, start, run the UI e2e on desktop and phone, stop everything.
# Usage (from the dashboard worktree, Git Bash):  bash scripts/prove-ui.sh [e2e files...]   (default: the two layout suites)
# Needs: native Postgres/Redis up (E:/GE/ge_erp/.local/start.sh), a built backend answering on $E2E_API (default http://localhost:8191),
# and E2E_PASSWORD (the super admin password) in the environment. Result lines go to /tmp/prove-ui.txt, logs to /tmp/prove-ui-<target>.log.
# shortcut: backend must already run, start it from its worktree first; fold that in when a second suite needs it.
set -u
# RULE (owner, 2026-11-05): LOCAL ONLY, HEADLESS ONLY. This script never touches production: any non-local API or host is refused,
# and the browser always runs headless (no window opens). A production check is a read-only up-check, never this script, unless the owner says so.
ROOT=$(cd "$(dirname "$0")/.." && pwd); PORT=${E2E_PORT:-3111}; API=${E2E_API:-http://localhost:8191}; OUT=/tmp/prove-ui.txt
FILES=${*:-tests/sales-desk-ui.e2e.ts tests/stocktake-live-ui.e2e.ts}
GREP=${E2E_GREP:-layout|live}   # only the layout/live tests by default; other tests in those files need their own seeds
case "$API" in http://localhost:*|http://127.0.0.1:*|http://\[::1\]:*) ;; *) echo "REFUSED: E2E_API=$API is not local. This script runs on localhost only." | tee "$OUT"; exit 3;; esac
case "$PORT" in ''|*[!0-9]*) echo "REFUSED: bad E2E_PORT" | tee "$OUT"; exit 3;; esac
unset E2E_HEADED E2E_BASE_URL E2E_URL
: "${E2E_PASSWORD:?set E2E_PASSWORD}"; : > "$OUT"
stop_web() { for pid in $(powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue).OwningProcess"); do powershell -NoProfile -Command "Stop-Process -Id $pid -Force"; done; }
trap stop_web EXIT
curl -s -o /dev/null "$API/health" || { echo "backend not answering on $API" | tee -a "$OUT"; exit 2; }
stop_web; cd "$ROOT" || exit 1
API_URL=$API node node_modules/next/dist/bin/next build --webpack > /tmp/prove-ui-build.log 2>&1 && echo "build ok" >> "$OUT" || { echo "build FAILED" >> "$OUT"; exit 1; }
API_URL=$API node node_modules/next/dist/bin/next start -p "$PORT" > /tmp/prove-ui-web.log 2>&1 &
for _ in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/en/sign-in" && break; sleep 2; done
cd e2e-tests || exit 1; export E2E_PORT=$PORT E2E_API=$API E2E_PASSWORD
for t in desktop phone; do
  node node_modules/e2e/dist/cli/bin.js run $FILES --workers 1 --target $t --grep "$GREP" > "/tmp/prove-ui-$t.log" 2>&1; echo "$t exit $?" >> "$OUT"
  sed 's/\x1b\[[0-9;]*m//g' "/tmp/prove-ui-$t.log" | grep -E "Tests " >> "$OUT"
done
echo done >> "$OUT"
