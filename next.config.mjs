import createNextIntlPlugin from "next-intl/plugin";

// Plain JS config on purpose: Hostinger web hosting has glibc 2.28, so Next's native compiler cannot load there;
// the host builds with `next build --webpack`, which needs no native binary.
// The browser calls this site's own /api; API_URL (read at build time) is where it is forwarded, so the session cookie stays on this domain.
const apiUrl = process.env.API_URL?.replace(/\/$/, "");

// CSP: scripts only from this site. 'unsafe-inline' stays for script-src because Next's hydration data and the before-paint snippet are inline
// and the print windows (about:blank, they inherit this policy) use onclick; shortcut: move to a per-request nonce in proxy.ts to drop it.
// The one outside party is Better Stack real user monitoring (src/lib/rum.ts): its tag script, and where it sends what it collects.
export const RUM_SCRIPT_ORIGIN = "https://betterstack.net";
export const RUM_DATA_ORIGIN = "https://*.betterstackdata.com";
export const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${RUM_SCRIPT_ORIGIN}${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${RUM_SCRIPT_ORIGIN} ${RUM_DATA_ORIGIN}`,
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig = {
  output: "standalone",
  // A bug report carries up to 5 files of 25 MB: the proxy that forwards /api buffers a request body up to this size (the default is 10 MB).
  experimental: { proxyClientMaxBodySize: "140mb" },
  poweredByHeader: false,
  // dev only: the e2e screenshots and traces are written inside the project; they must not make the dev server rebuild mid-test.
  webpack(config, { dev }) {
    if (dev) config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.git/**", "**/e2e-tests/.shots/**", "**/e2e-tests/.e2e/**", "**/.shots/**"] };
    return config;
  },
  async rewrites() {
    return apiUrl ? [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }] : [];
  },
  async headers() {
    return [{
      source: "/((?!api/).*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
