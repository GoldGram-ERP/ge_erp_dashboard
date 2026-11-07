import { test, expect, LANGS, NAV } from './lib.ts';

// Every open dropdown (Select) sits under, or flipped above, its field: its START edge (right in Arabic, left in English) is within 1 px of the
// field's, it is at least as wide as the field, it stays inside the screen, and its rows are at most 34 px (36 on a phone).
// A list may be WIDER than its field (long labels stay on one line with an ellipsis). Rule for the start edge: flush with the field's start edge
// (within 1 px) when the list fits on screen from that edge (8 px margin); otherwise the list is shifted just enough to stay inside the screen,
// so it must reach past the field's start edge (left edge <= the field's in English, right edge >= the field's in Arabic). Run over every page of
// the nav tree, for the first selects of each page AND the pager's size select (#size, at the bottom of every paged list), once with the field where
// it is and once scrolled to the bottom edge so the list has to flip above. Owner screenshots: the Sales desk list ~230 px to the right of its field
// (RTL, popup measured before its min-width), then the pager's 95 px list ~105 px to the left and above (still measured before the min-width).
const ROUTES = [...NAV.flatMap((g) => g.items.map((i) => i.route)), '/sales/desk?new=draft', '/control/security?view=log'];

const CHUNKS: string[][] = []; for (let i = 0; i < ROUTES.length; i += 4) CHUNKS.push(ROUTES.slice(i, i + 4));   // a test lasts two minutes at most
for (const lang of LANGS) for (const [ci, chunk] of CHUNKS.entries()) {
  test(`dropdown lists open at their field, below and flipped above (${lang}, part ${ci + 1}/${CHUNKS.length})`, { tags: ['e2e', 'popover'], requires: ['browser'] }, async ({ go, browser, shot }) => {
    const bad: string[] = [];
    let checked = 0, pager = 0;
    for (const route of chunk) {
      await go('superadmin', route, lang);
      await browser.locator('h1, h2').first().waitFor({ timeout: 20_000 }).catch(() => {});
      await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500)));
      // a report list shows its pager only after Run: run it so the pager's size select exists
      if (await browser.locator('#run').count()) { await browser.locator('#run').tap().catch(() => {}); await browser.evaluate(() => new Promise((r) => setTimeout(r, 1500))); }
      const count = await browser.evaluate(() => {
        document.querySelectorAll('[data-pp]').forEach((e) => e.removeAttribute('data-pp'));
        const all = [...document.querySelectorAll<HTMLElement>('.sel-btn')].filter((b) => !(b as HTMLButtonElement).disabled && b.getBoundingClientRect().width > 0);
        const size = all.find((b) => b.id === 'size-btn' || b.closest('.pager, #pager') || b.id.startsWith('size'));
        const take = [...new Set([...(size ? [size] : []), ...all.slice(0, 3)])];
        take.forEach((b, n) => b.setAttribute('data-pp', String(n)));
        return take.length;
      });
      for (let i = 0; i < count; i++) {
        for (const placement of ['as-is', 'bottom'] as const) {
          await browser.evaluate(({ n, placement }) => {
            const el = document.querySelector(`[data-pp="${n}"]`) as HTMLElement;
            el.scrollIntoView({ block: placement === 'bottom' ? 'end' : 'center' });
            if (placement === 'bottom') { const r = el.getBoundingClientRect(); const room = innerHeight - r.bottom; if (room > 60) window.scrollBy(0, room - 40); }
          }, { n: i, placement });
          // a real pointer press on the field (it closes any other open list the way a person does); a sticky bar over a phone's field falls back to a click on it
          try { await browser.locator(`[data-pp="${i}"]`).tap(); } catch { await browser.evaluate((n) => (document.querySelector(`[data-pp="${n}"]`) as HTMLElement).click(), i); }
          await expect.poll(() => browser.evaluate(() => document.querySelectorAll('.pop').length > 0), { timeout: 5_000 }).toBe(true);
          // the list opens with a small scale-in: read its box once it stops moving (two equal reads in a row)
          await expect.poll(() => browser.evaluate(async () => {
            const last = () => ([...document.querySelectorAll('.pop')].at(-1) as HTMLElement).getBoundingClientRect();
            const a = last(); await new Promise((r) => setTimeout(r, 120)); const b = last();
            return a.width === b.width && a.left === b.left && a.top === b.top;
          }), { timeout: 5_000 }).toBe(true);
          const m = await browser.evaluate((n) => {
            const el = document.querySelector(`[data-pp="${n}"]`) as HTMLElement, t = el.getBoundingClientRect();
            const pop = [...document.querySelectorAll('.pop')].at(-1) as HTMLElement, p = pop.getBoundingClientRect();
            const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
            const rows = [...pop.querySelectorAll<HTMLElement>('li[role=option]')].map((li) => li.getBoundingClientRect().height);
            return { id: el.id, fits: rtl ? t.right - p.width >= 8 - 0.5 : t.left + p.width <= innerWidth - 8 + 0.5, past: rtl ? p.right >= t.right - 1 : p.left <= t.left + 1, startGap: Math.round((rtl ? p.right - t.right : p.left - t.left) * 10) / 10, widthShort: Math.round((t.width - p.width) * 10) / 10, left: p.left, right: p.right, top: p.top, bottom: p.bottom, vw: innerWidth, vh: innerHeight, above: p.bottom <= t.top + 1, maxRow: rows.length ? Math.max(...rows) : 0 };
          }, i);
          checked++; if (m.id.startsWith('size')) pager++;
          const where = `${route} ${m.id || '#' + i} (${placement}${m.above ? ', flipped above' : ''})`;
          if (m.fits ? Math.abs(m.startGap) > 1 : !m.past) bad.push(`${where}: start edge ${m.startGap}px off its field`);
          if (m.widthShort > 1) bad.push(`${where}: ${m.widthShort}px narrower than its field`);
          if (m.left < -0.5 || m.right > m.vw + 0.5 || m.top < -0.5 || m.bottom > m.vh + 0.5) bad.push(`${where}: outside the screen (${Math.round(m.left)}..${Math.round(m.right)} x ${Math.round(m.top)}..${Math.round(m.bottom)} of ${m.vw}x${m.vh})`);
          if (m.maxRow > (m.vw < 700 ? 36 : 34) + 0.5) bad.push(`${where}: option rows ${m.maxRow}px high`);
          if (i === 0 && placement === 'bottom') await shot(`popover-${lang}-${route.replace(/[^a-z]+/gi, '-')}`);
          // closed the way a person does: a press outside it (Escape closes a select's list, not every popover)
          await browser.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true })));
          await expect.poll(() => browser.evaluate(() => document.querySelectorAll('.pop').length), { timeout: 3_000 }).toBe(0);
        }
      }
    }
    expect(checked, 'dropdowns measured').toBeGreaterThanOrEqual(chunk.length);
    if (chunk.includes('/control/security?view=log')) expect(pager, 'the activity log pager size select was measured').toBeGreaterThanOrEqual(1);
    expect(bad, 'dropdowns not at their field').toEqual([]);
  });
}
