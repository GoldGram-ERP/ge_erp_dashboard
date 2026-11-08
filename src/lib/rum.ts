// Better Stack real user monitoring: page speed (web vitals), browser errors, page views and masked session
// replays. What is collected and what is masked is set in Better Stack (application "GoldGramERP Dashboard",
// Frontend tab), never here: changing it needs no release.
//
// The token is public by design (every page sends it), so it lives in the code, not in the host's variables.
// The JavaScript tag token of Better Stack application "GoldGramERP Dashboard" (2827821, Frontend tab). It is not the DSN token.
export const RUM_TOKEN = "49TF4JndrqGb8bjDcrLyfdA6";

// Who a session belongs to, as Better Stack sees it: the internal id, the login username, the user code
// (Users screen, once the API sends it) and the role (the owner, 2026-11-08). Never the full name, an email
// or a phone: those stay in the ERP.
type RumUser = { id: string; username: string; user_code?: number; user_type: string };
export function rumIdentity(me: { id: string; username?: string; userCode?: number | null; userType: string }): RumUser {
  const identity: RumUser = { id: me.id, username: me.username ?? "", user_type: me.userType };
  if (typeof me.userCode === "number") identity.user_code = me.userCode;
  return identity;
}

type Tag = (command: string, data: unknown) => void;

// Ties the session to the signed-in person, once the tag has loaded (it queues calls until then).
export function identifyForRum(me: { id: string; username?: string; userCode?: number | null; userType: string } | null | undefined, w: { betterstack?: Tag } = globalThis as { betterstack?: Tag }): void {
  if (!me?.id || typeof w.betterstack !== "function") return;
  w.betterstack("user", rumIdentity(me));
}

// The domains the browser must reach: the tag itself, and where it sends what it collects.
export const RUM_SCRIPT_ORIGIN = "https://betterstack.net";
export const RUM_DATA_ORIGIN = "https://*.betterstackdata.com";

// The inline tag for the page head, or null: only production builds report, so local runs and tests stay out.
export function rumSnippet(token: string | undefined, release: string, nodeEnv: string | undefined): string | null {
  if (!token || nodeEnv !== "production") return null;
  if (!/^[A-Za-z0-9]+$/.test(token)) return null;
  const init = JSON.stringify({ environment: "production", release });
  return `!function(b,e,t,r){b[t]=b[t]||function(...a){(b[t].q=b[t].q||[]).push(a)};b[t].l=+new Date;var s=e.createElement("script");s.async=1;s.crossOrigin="anonymous";s.src="${RUM_SCRIPT_ORIGIN}/b.js?t="+r;(e.head||e.getElementsByTagName("head")[0]).appendChild(s)}(window,document,"betterstack","${token}");betterstack("init",${init});`;
}
