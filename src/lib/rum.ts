// Better Stack real user monitoring: page speed (web vitals), browser errors, page views and masked session
// replays. What is collected and what is masked is set in Better Stack (application "GoldGramERP Dashboard",
// Frontend tab), never here: changing it needs no release.
//
// The token is public by design (every page sends it), so it lives in the code, not in the host's variables.
export const RUM_TOKEN = "xnnRRiwudLNc29ojnZLEWR9G";

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
