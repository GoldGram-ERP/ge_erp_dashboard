import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const intl = createMiddleware(routing);
// better-auth names the cookie "better-auth.session_token", with "__Secure-" in front on https.
const hasSession = (req: NextRequest) => req.cookies.getAll().some((c) => /(^|__Secure-)better-auth\.session_token$/.test(c.name) && c.value);

// Without the session cookie every page but sign-in goes to sign-in (in the visitor's language). The cookie is only checked for presence here;
// the app layout asks GET /access/me, so a stale cookie still ends at sign-in.
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const m = /^\/(ar|en)(\/.*)?$/.exec(pathname);
  if (m && m[2]?.replace(/\/$/, "") !== "/sign-in" && !hasSession(req)) {
    const url = req.nextUrl.clone();
    url.pathname = `/${m[1]}/sign-in`;
    url.search = "";
    return NextResponse.redirect(url);
  }
  return intl(req);
}

export const config = { matcher: ["/((?!api|_next|_vercel|.*\..*).*)"] };
