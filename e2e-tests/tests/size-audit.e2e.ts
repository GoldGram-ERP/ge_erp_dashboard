import { writeFileSync } from 'node:fs';
import { test, expect, LANGS, NAV, layoutAudit } from './lib.ts';

// Size scale: opens every page of the nav tree as the superadmin and records the real CSS sizes of its text and controls,
// so the size scale is set from numbers. Output: e2e-tests/.shots/size-audit-<lang>-<width>.json and asserts, through layoutAudit (check 6), that every page follows the scale in globals.css (desktop and phone, ar and en).
// Known open defect, owner decision: on the phone the page tab bar (.seg.page, 3 tabs) is wider than the screen and scrolls sideways, so it is skipped here.
// Local and headless only (owner rule): this test only runs on the local stack.
const ROUTES = ['/', '/account', ...NAV.flatMap((g) => g.items.map((i) => i.route))];

for (const lang of LANGS) {
  test(`size audit of every page (${lang})`, { tags: ['audit'], requires: ['browser'] }, async ({ go, browser }) => {
    const out: Record<string, unknown>[] = [], bad: string[] = [];
    for (const r of ROUTES) {
      await go('superadmin', r, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await browser.locator('.table th, .empty').first().waitFor({ timeout: 4_000 }).catch(() => {}); // the list loads after the title
      const m = await browser.evaluate(() => {
        const vis = (e: Element) => { const b = (e as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(e); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
        const px = (e: Element) => Math.round((e as HTMLElement).getBoundingClientRect().height * 10) / 10;
        const fs = (e: Element) => parseFloat(getComputedStyle(e).fontSize);
        const stat = (sel: string, root: ParentNode = document) => {
          const els = Array.from(root.querySelectorAll(sel)).filter(vis);
          if (!els.length) return null;
          const h = els.map(px), f = els.map(fs);
          return { n: els.length, hMin: Math.min(...h), hMax: Math.max(...h), fsMin: Math.min(...f), fsMax: Math.max(...f) };
        };
        const ws = (document.querySelector('#ws') ?? document.body) as HTMLElement;
        // font sizes of the visible text, by size (how many text nodes at each size): what the page reads at
        const sizes: Record<string, number> = {};
        const walker = document.createTreeWalker(ws, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const t = (n.nodeValue ?? '').trim(); const p = n.parentElement;
          if (!t || !p || !vis(p)) continue;
          const k = String(fs(p)); sizes[k] = (sizes[k] ?? 0) + 1;
        }
        return {
          vw: innerWidth, rootFs: fs(document.documentElement), bodyFs: fs(document.body),
          h1: stat('h1', ws), h2: stat('h2', ws), h3: stat('h3', ws),
          tabs: stat('.seg button, [role=tab]', ws),
          fields: stat('.field input:not([type=checkbox]):not([type=radio]):not([type=hidden]), .field textarea', ws),
          selects: stat('.sel-btn, .field select', ws),
          btn: stat('.btn', ws), btnPrimary: stat('.btn.primary', ws),
          th: stat('.table th', ws), td: stat('.table td', ws), row: stat('.table tr.row', ws),
          cards: stat('.card', ws),
          topbarTitle: stat('.head h1, .head h2'),
          sizes,
        };
      });
      out.push({ route: r, ...m });
      for (const d of await layoutAudit(browser, '#ws')) if (!(d.startsWith('scrolls: div.seg.page') && out.length && (out[0] as any).vw <= 640)) bad.push(`${r}: ${d}`);
    }
    writeFileSync(`.shots/size-audit-${lang}-${(out[0] as any).vw}.json`, JSON.stringify(out, null, 1));
    expect(bad, 'pages off the size scale').toEqual([]);
  });
}
