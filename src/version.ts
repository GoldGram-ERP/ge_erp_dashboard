// The dashboard's own version, stamped at build time by scripts/set-version.mjs: the release in package.json plus the commit
// it was built from (1.0.0+ab12cd3). The backend has its own version; it is internal and never written on screen.
export const DASHBOARD_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
