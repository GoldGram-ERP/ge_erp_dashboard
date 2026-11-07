import { test, expect, signInApi, LANGS, NAV, WEB, layoutAudit } from './lib.ts';

// Owner bugs, 2026-11-07 (sales desk, build 1.0.32):
//  1. one vertical scroll per screen: the summary column and the WhatsApp bubble had their own scrollbars inside the page scroll;
//  2. the Disclosure rows ("Customer (optional)", "Save as draft") looked like dead text: now a tappable button row with a trailing chevron.
// Run on its own stack (desktop + phone targets): E2E_PORT / E2E_API, desk seed from scripts/desk-d2b-seed.mjs.
const PASS = 'Correct-Horse-9';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function as(user: string, browser: any) {
  const s = await signInApi(user, user === 'superadmin' ? undefined : PASS);
  await browser.setCookies([{ url: WEB, name: s.name, value: s.value, httpOnly: true, sameSite: 'Lax' }]);
}
const ROUTES = NAV.flatMap((g) => g.items.map((i) => i.route));

for (const lang of LANGS) {
  test(`one vertical scroll per screen: every nav page has no nested scroll (${lang})`, { tags: ['e2e', 'audit'], requires: ['browser'] }, async ({ app, browser }) => {
    await as('superadmin', browser);
    const bad: string[] = [];
    for (const r of ['/', ...ROUTES]) {
      await app.open(`/${lang}${r}`);
      await browser.locator('h1, h2').first().waitFor({ timeout: 25_000 }).catch(() => {});
      await sleep(600);
      for (const m of await layoutAudit(browser, 'body', { scroll: true })) if (m.startsWith('nested scroll')) bad.push(`${r}: ${m}`);
    }
    expect(bad).toEqual([]);
  });

  test(`sales desk: the summary and the message bubble never scroll inside the page (${lang})`, { tags: ['e2e', 'desk'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    await as('agent1', browser);
    await app.open(`/${lang}/sales/desk?new=draft`);
    await browser.locator('#sd #itadd-btn').waitFor({ timeout: 25_000 });
    for (const name of ['Desk gold bar 21', 'Desk ring']) {
      await browser.locator('#sd #itadd-btn').tap();
      await browser.locator(`[role=option]:has-text("${name}")`).first().tap();
    }
    await browser.locator('#sd #sd-customer .disc-head').tap();
    await browser.locator('#sd #f-customerName').fill('Scroll check');
    await sleep(700);
    await shot(`ux-desk-${lang}-1`);
    const m = await browser.evaluate(() => {
      const css = (sel: string) => { const e = document.querySelector(sel); return e ? getComputedStyle(e) : null; };
      const sticky = document.querySelector('#sd .tk-sticky') as HTMLElement | null, bub = css('#wa-text'), st = sticky ? getComputedStyle(sticky) : null;
      return { stickyY: st?.overflowY ?? null, stickyMax: st?.maxHeight ?? null, pos: st?.position ?? null, fit: sticky?.dataset.fit ?? null, h: sticky?.offsetHeight ?? null, vh: window.innerHeight, bubY: bub?.overflowY ?? null, bubMax: bub?.maxHeight ?? null, wide: document.querySelector('#sd .tk')!.clientWidth };
    });
    expect(m.stickyY).not.toMatch(/auto|scroll/); expect(m.stickyMax).toBe('none');
    expect(m.bubY).not.toMatch(/auto|scroll/); expect(m.bubMax).toBe('none');
    expect(m.fit).not.toBeNull();   // the summary measures itself even though it mounts after the draft loads
    if (m.wide >= 1024) expect(m.pos).toBe(m.h! + 24 <= m.vh ? 'sticky' : 'static');   // sticks only while it fits the screen
    const bad = (await layoutAudit(browser, '#sd', { scroll: true })).filter((x) => x.startsWith('nested scroll'));
    expect(bad).toEqual([]);
  });

  test(`Disclosure is a tappable button row with a turning chevron (${lang})`, { tags: ['e2e', 'ui'], requires: ['browser'] }, async ({ app, browser, shot }) => {
    await as('agent1', browser);
    await app.open(`/${lang}/sales/desk?new=draft`);
    const head = browser.locator('#sd #sec-payment > .disc-head');
    await head.waitFor({ timeout: 25_000 });
    const read = () => browser.evaluate(() => {
      const h = document.querySelector('#sd #sec-payment > .disc-head') as HTMLElement, c = h.querySelector('.disc-chev') as Element, l = h.querySelector('.disc-label') as HTMLElement, cs = getComputedStyle(h);
      return { tag: h.tagName, expanded: h.getAttribute('aria-expanded'), transform: getComputedStyle(c).transform, h: h.getBoundingClientRect().height, w: h.getBoundingClientRect().width, parentW: h.parentElement!.getBoundingClientRect().width, bg: cs.backgroundColor, ring: cs.boxShadow, radius: cs.borderTopLeftRadius, fs: parseFloat(cs.fontSize), fw: parseFloat(cs.fontWeight), clipped: l.scrollWidth > l.clientWidth + 1, outline: cs.outlineStyle, body: !!document.querySelector('#sd #sec-payment > .disc-body'), cw: c.getBoundingClientRect().width, chevAfterLabel: (h.querySelector('.disc-label') as HTMLElement).getBoundingClientRect().left !== c.getBoundingClientRect().left };
    });
    const closed = await read();
    expect(closed.tag).toBe('BUTTON'); expect(closed.expanded).toBe('false'); expect(closed.body).toBe(false);
    expect(closed.h).toBeGreaterThanOrEqual(32); expect(closed.clipped).toBe(false);
    expect(closed.cw).toBeGreaterThanOrEqual(14); expect(closed.cw).toBeLessThanOrEqual(16);
    expect(closed.fs).toBeGreaterThanOrEqual(13); expect(closed.fs).toBeLessThanOrEqual(14); expect(closed.fw).toBeGreaterThanOrEqual(500); expect(closed.fw).toBeLessThanOrEqual(600);
    expect(parseFloat(closed.radius)).toBeGreaterThanOrEqual(8); expect(closed.ring).not.toBe('none');
    expect(closed.w).toBeLessThan(260);   // hugs its label, not a full bar
    await shot(`ux-disc-${lang}-closed`);
    await head.hover(); await sleep(300);
    const hover = await read(); expect(hover.bg).not.toBe(closed.bg);
    await shot(`ux-disc-${lang}-hover`);
    await head.tap(); await sleep(400);
    const open = await read();
    expect(open.expanded).toBe('true'); expect(open.body).toBe(true); expect(open.transform).not.toBe(closed.transform);
    await shot(`ux-disc-${lang}-open`);
    // keyboard: Enter closes, Space opens, the focus ring shows
    await head.focus(); await browser.keyboard.press('Enter'); await sleep(300);
    expect((await read()).expanded).toBe('false');
    await browser.keyboard.press('Space'); await sleep(300);
    const kb = await read(); expect(kb.expanded).toBe('true'); expect(kb.outline).not.toBe('none');
    // reduced motion (the engine cannot emulate the media query, so read the stylesheet): the chevron and the body have no transition / animation under it
    const rm = await browser.evaluate(() => {
      for (const sh of Array.from(document.styleSheets)) { let rules: CSSRuleList; try { rules = sh.cssRules; } catch { continue; } for (const r of Array.from(rules)) if (r instanceof CSSMediaRule && /prefers-reduced-motion:\s*reduce/.test(r.conditionText) && r.cssText.includes('.disc-chev')) return r.cssText; }
      return '';
    });
    expect(rm).toMatch(/\.disc-chev\s*\{[^}]*transition:\s*none/); expect(rm).toMatch(/\.disc-body\s*\{[^}]*animation:[^;]*\bnone\b/);
    // every Disclosure in the app is the library one (no per-screen look): a .disc-head is a button with the chevron
    const all = await browser.evaluate(() => Array.from(document.querySelectorAll('.disc-head')).every((b) => b.tagName === 'BUTTON' && !!b.querySelector('.disc-chev')));
    expect(all).toBe(true);
  });
}
