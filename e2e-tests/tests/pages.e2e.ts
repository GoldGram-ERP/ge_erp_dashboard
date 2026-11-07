import { test, expect, LANGS, NAV, M } from './lib.ts';

// Every page of the nav tree (+ Home, Account; Jobs are hidden for now: src/lib/jobs/enabled.ts) opens for the superadmin in ar and en: heading, not the placeholder, no console errors, dir matches. One file, loops the routes.
const ROUTES = ['/', '/account', ...NAV.flatMap((g) => g.items.map((i) => i.route))];

for (const lang of LANGS) {
  test(`every page opens for the superadmin (${lang})`, { tags: ['smoke'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    await browser.addInitScript(`window.__errs=[];const oe=console.error;console.error=(...a)=>{window.__errs.push(a.map(String).join(' ').slice(0,300));oe(...a)};window.addEventListener('error',e=>window.__errs.push('uncaught '+e.message));`);
    expect(ROUTES.length).toBe(26);   // Home + Account + 24 nav pages (Jobs hidden; Returned pieces is a tab of Returns; Workmanship and cashback added)
    const problems: string[] = [];
    for (const r of ROUTES) {
      await go('superadmin', r, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      const s = await browser.evaluate(() => ({
        heading: (document.querySelector('h1, h2') as HTMLElement | null)?.innerText?.trim() ?? '',
        soon: !!document.querySelector('[data-testid="coming-soon"]'),
        text: document.body.innerText,
        dir: document.documentElement.dir,
        errs: (window as any).__errs ?? [],
        path: location.pathname,
      }));
      if (!s.heading) problems.push(`${r}: no heading`);
      if (s.soon) problems.push(`${r}: placeholder`);
      if (/Application error|This page could not be found|Internal Server Error|حدث خطأ/.test(s.text)) problems.push(`${r}: error page`);
      if (s.text.includes(M(lang, 'app', 'noAccess'))) problems.push(`${r}: no access`);
      if (s.dir !== (lang === 'ar' ? 'rtl' : 'ltr')) problems.push(`${r}: dir ${s.dir}`);
      if (!s.path.startsWith(`/${lang}`)) problems.push(`${r}: landed on ${s.path}`);
      if (s.errs.length) problems.push(`${r}: console ${s.errs.join(' | ')}`);
      await shot(`page-${lang}-${r === '/' ? 'home' : r.slice(1).replace(/\//g, '-')}`);
    }
    expect(problems).toEqual([]);
  });
}
