// Better Stack real user monitoring: page speed (web vitals), browser errors, page views and masked session
// replays. What is collected and what is masked is set in Better Stack (application "GoldGramERP Dashboard",
// Frontend tab), never here: changing it needs no release.
//
// The token is public by design (every page sends it), so it lives in the code, not in the host's variables.
// The JavaScript tag token of Better Stack application "GoldGramERP Dashboard" (2827821, Frontend tab). It is not the DSN token.
export const RUM_TOKEN = "49TF4JndrqGb8bjDcrLyfdA6";

// Who a session belongs to, as Better Stack sees it: the internal user id and the role only. Never a name,
// a username or an email: staff personal data does not leave the ERP. The id is looked up in the ERP.
export function rumIdentity(me: { id: string; userType: string }): { id: string; user_type: string } {
  return { id: me.id, user_type: me.userType };
}

type Tag = (command: string, data: unknown) => void;

// Ties the session to the signed-in person, once the tag has loaded (it queues calls until then).
export function identifyForRum(me: { id: string; userType: string } | null | undefined, w: { betterstack?: Tag } = globalThis as { betterstack?: Tag }): void {
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
