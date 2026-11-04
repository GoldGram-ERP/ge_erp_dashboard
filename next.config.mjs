import createNextIntlPlugin from "next-intl/plugin";

// Plain JS config on purpose: Hostinger web hosting has glibc 2.28, so Next's native compiler cannot load there;
// the host builds with `next build --webpack`, which needs no native binary.
// The browser calls this site's own /api; API_URL (read at build time) is where it is forwarded, so the session cookie stays on this domain.
const apiUrl = process.env.API_URL?.replace(/\/$/, "");

const nextConfig = {
  output: "standalone",
  cacheComponents: true,
  poweredByHeader: false,
  async rewrites() {
    return apiUrl ? [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }] : [];
  },
  async headers() {
    return [{
      source: "/((?!api/).*)",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
      ],
    }];
  },
};

export default createNextIntlPlugin("./src/i18n/request.ts")(nextConfig);
