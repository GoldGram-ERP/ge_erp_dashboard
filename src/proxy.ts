import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);

// /api/* goes on to the backend (API_URL ends in /api), so the session cookie stays on this domain. Done here with fetch, not a next.config
// rewrite: on Cloudflare Workers a rewrite re-sends the visitor's Host and cf-* headers, which Cloudflare refuses (error 1003).
// Only end-to-end headers go out; redirects and Set-Cookie come back untouched.
const HOP = /^(host|connection|keep-alive|transfer-encoding|upgrade|te|trailer|proxy-.*|cf-.*|cdn-loop|x-forwarded-.*|x-real-ip)$/i;
async function toApi(req: NextRequest): Promise<Response> {
  const headers = new Headers();
  req.headers.forEach((value, name) => { if (!HOP.test(name)) headers.set(name, value); });
  // The visitor's IP, as Vercel's rewrite passed it: Cloudflare sets cf-connecting-ip, Vercel x-forwarded-for.
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  if (ip) headers.set("x-forwarded-for", ip);
  const target = (process.env.API_URL ?? "").replace(/\/$/, "") + req.nextUrl.pathname.slice("/api".length) + req.nextUrl.search;
  const init: RequestInit & { duplex?: "half" } = { method: req.method, headers, redirect: "manual" };
  if (req.method !== "GET" && req.method !== "HEAD") { init.body = req.body; init.duplex = "half"; }
  // A fresh Response: fetch's own has immutable headers, and Next's dev server (Node) adds its own to what the proxy returns.
  const res = await fetch(target, init);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: new Headers(res.headers) });
}
// better-auth names the cookie "better-auth.session_token", with "__Secure-" in front on https.
const hasSession = (req: NextRequest) => req.cookies.getAll().some((c) => /(^|__Secure-)better-auth\.session_token$/.test(c.name) && c.value);

// Without the session cookie every page but sign-in goes to sign-in (in the visitor's language). The cookie is only checked for presence here;
// the app layout asks GET /access/me, so a stale cookie still ends at sign-in.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/api" || pathname.startsWith("/api/")) return toApi(req);
  const m = /^\/(ar|en)(\/.*)?$/.exec(pathname);
  if (m && m[2]?.replace(/\/$/, "") !== "/sign-in" && !hasSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${m[1]}/sign-in`;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return intl(req);
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\..*).*)", "/api/:path*"] };
