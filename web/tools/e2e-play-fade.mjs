// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-fade.mjs — arm P-FADE-CLEAR of the play-place gate (GH-668 S5 play
// visual audit r1, finding V2 + V3b: the rail's edge fade crossed the CURRENT
// card's leading text; the focused / browsed card parked inside the fade).
//
// The law judged here — on every REST of the rail after a snap (a boot with a
// non-first current card, a keyboard browse, a pointer browse, the End key
// onto the readiness fixture), for the card the rail presents (aria-current /
// aria-selected / data-ob-browsed / the focused card):
//   * FINE (desktop 1440x900, the fixed 168 px slot): the card's TEXT BOX
//     (name + hint + meta + badge rects) sits whole inside the CLEAN band =
//     the scrollport minus the kit's --sf-w fade band on each side that is
//     lit (data-ob-fade-start / -end); the card itself is ≥ 97 % inside the
//     scrollport; the A4 peek law holds at that rest (no neighbour shows a
//     0.5 < w < 31.5 px sliver). The cure = `scroll-snap-align: center` on
//     the fine register (play.css): the proximity snap rests the card where
//     ui/cardrail.js snapTo aims it (centred: 47 px each side, text lead at
//     60 px > the 48 px band), instead of dragging it to the start edge
//     (4 px pad; text lead 17 px → 0.35 of the band).
//   * COARSE (phone 844x390, the kit peek-law slot = clip − 2 × 32): the
//     same whole-card + A4 + TRAILING-text laws; the LEADING edge is
//     measured and LOGGED, not judged — the kit's constants over-constrain
//     the 262 px rail (fitPeek slot 198 + gap 8 leaves 48 px of neighbour
//     for both sides; A4 wants ≥ 32 per visible neighbour, so the only
//     A4-legal rests are the start pad (prev 0 / next 52; text 17 px into
//     the 48 band) or next-hidden (p ≥ 56; the trailing text under the end
//     band) — a centred rest (24 / 24) fires A4). GH-668 kit follow-up
//     (fitPeek slot gap-aware or A4 counting the gap); this arm turns the
//     coarse leading-edge judge on the day the kit resolves it.
//
// Runs INSIDE e2e-play.mjs (imported; after P-HUD — reuses the +0 desktop
// and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone for a
// fast red proof (pre-fix bytes: desktop de snooker current card text lead
// 17 px inside the 48 px start band, alpha 0.35):
//   node web/tools/e2e-play-fade.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd, drag } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitReady(c, tries = (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitShell(c, tries = 60 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try { if (await c.eval('typeof window.__shell === "object" && window.__shell.isOpen()')) return true; } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
async function waitPlay(c, tries = 100 * SCALE) {
  for (let i = 0; i < tries; i++) {
    try {
      if (await c.eval(`(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
        && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`)) return true;
    } catch { /* navigating */ }
    await sleep(150);
  }
  return false;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
const VK = { ArrowRight: 39, End: 35, Home: 36 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}
async function boot(c) {
  if (!(await waitReady(c)) || !(await waitShell(c)) || !(await waitPlay(c))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}
/** boot the play place on `game` in `locale` (the persisted blob + a reload: the rail's first present snaps to the current card) */
async function reboot(c, game, locale) {
  await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: ${JSON.stringify(game)} })), location.reload(), true)`);
  await sleep(1200);
  if (!(await boot(c))) return false;
  await c.eval(`window.__i18n.setLocale(${JSON.stringify(locale)})`);
  await sleep(700);
  return true;
}
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture-Spiel', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);

// page-side: the rail's clip, the lit fade bands, the presented card's text box vs the clean band, the A4 peeks
const RAIL = `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]'); if (!g) return { absent: true };
  const txt = (n) => { if (!n || n.hidden) return null; const rg = document.createRange(); rg.selectNodeContents(n); const rs = [...rg.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    if (!rs.length) return null; return { l: Math.min(...rs.map((r) => r.left)), r: Math.max(...rs.map((r) => r.right)) }; };
  const gr = g.getBoundingClientRect(); const sfW = parseFloat(getComputedStyle(g).getPropertyValue('--sf-w')) || 48;
  const clipL = gr.left + g.clientLeft, clipR = clipL + g.clientWidth;
  const fs = g.dataset.obFadeStart === '1', fe = g.dataset.obFadeEnd === '1';
  const cleanL = clipL + (fs ? sfW : 0), cleanR = clipR - (fe ? sfW : 0);
  const cards = [...g.children].filter((k) => !k.hidden && k.getClientRects().length);
  const peeks = cards.map((k) => { const r = k.getBoundingClientRect(); const v = Math.min(r.right, clipR) - Math.max(r.left, clipL); return { id: k.dataset.game, w: r.width, v }; })
    .filter((p) => p.v > 0.5 && p.v < p.w - 0.5 && p.v < 31.5).map((p) => p.id + ':' + p.v.toFixed(1));
  const card = (k) => { if (!k) return null; const r = k.getBoundingClientRect();
    const parts = ['.ob-card-option__name', '.ob-card-option__hint', '.ob-card-option__meta', '.ob-card-option__badge'].map((s) => txt(k.querySelector(s))).filter(Boolean);
    const lead = parts.length ? Math.min(...parts.map((p) => p.l)) : r.left, trail = parts.length ? Math.max(...parts.map((p) => p.r)) : r.right;
    const a = (d) => +Math.min(1, Math.max(0, d / sfW)).toFixed(2);
    return { id: k.dataset.game, l: +r.left.toFixed(1), r: +r.right.toFixed(1), lead: +lead.toFixed(1), trail: +trail.toFixed(1),
      alphaLead: fs ? a(lead - clipL) : 1, alphaTrail: fe ? a(clipR - trail) : 1,
      textClean: lead >= cleanL - 0.5 && trail <= cleanR + 0.5, leadClean: lead >= cleanL - 0.5, trailClean: trail <= cleanR + 0.5,
      visible: r.width > 0 ? +(Math.max(0, Math.min(r.right, clipR) - Math.max(r.left, clipL)) / r.width).toFixed(3) : 0 }; };
  const q = (s) => g.querySelector(s);
  const presented = q('[data-ob="play-game"][data-ob-browsed="true"]') ?? q('[data-ob="play-game"][aria-selected="true"]') ?? q('[data-ob="play-game"][aria-current="true"]');
  return { locale: window.__i18n?.locale?.(), coarse: matchMedia('(pointer: coarse)').matches, sl: +g.scrollLeft.toFixed(1), clipW: +(clipR - clipL).toFixed(1), sfW, fs, fe,
    snap: getComputedStyle(presented ?? cards[0]).scrollSnapAlign, k: g.dataset.obRailK ?? null, peeks, presented: card(presented), focus: card(document.activeElement?.closest?.('[data-ob="play-game"]') ?? null) };
})()`;
const brief = (m) => JSON.stringify(m);
/** the rail's REST (GH-1085): scrollLeft unchanged over six animation frames
 * AND no scroll event for 300 ms, read PAGE-SIDE — every frame runs after the
 * compositor's scroll progress is applied, where the old wall-clock poll
 * (three 100 ms reads) could sample one frozen value from a starved main
 * thread mid-animation. The quiet window is deliberately LONGER than
 * play.js's own key-rest watch (three frames + 150 ms), so a correction the
 * product makes at rest lands before the arm reads. Capped at 3 s: an
 * unsettled rail is named by the caller, never judged as if it rested. */
async function settle(c) {
  return c.eval(`new Promise((res) => {
    const g = document.querySelector('[data-ob="play-games"]');
    if (!g) { res({ sl: null, settled: false, ms: 0 }); return; }
    let last = g.scrollLeft, same = 0, lastScroll = performance.now();
    const t0 = performance.now();
    const onScroll = () => { lastScroll = performance.now(); };
    g.addEventListener('scroll', onScroll, { passive: true });
    // a frame loop starved past the cap still answers (a timer backstop)
    const backstop = setTimeout(() => {
      g.removeEventListener('scroll', onScroll);
      res({ sl: +g.scrollLeft.toFixed(1), settled: false, ms: Math.round(performance.now() - t0) });
    }, 3500);
    const tick = () => {
      const sl = g.scrollLeft;
      same = sl === last ? same + 1 : 0;
      last = sl;
      const now = performance.now();
      const rested = same >= 6 && now - lastScroll >= 300;
      if (rested || now - t0 > 3000) {
        clearTimeout(backstop);
        g.removeEventListener('scroll', onScroll);
        res({ sl: +sl.toFixed(1), settled: rested, ms: Math.round(now - t0) });
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })`);
}
/** settle, naming a rail that never came to rest inside the cap */
async function restOrFail(c, fail, tag) {
  const q = await settle(c);
  if (!q?.settled) fail(`${tag}: the rail never came to rest within 3 s (${JSON.stringify(q)})`);
  return q;
}
/** scroll events on the rail inside a quiet observation window after a rest
 * (no extra scroll, no jump: a correction must never fire on a lawful rest) */
async function scrollsAfterRest(c, ms = 600) {
  return c.eval(`new Promise((res) => {
    const g = document.querySelector('[data-ob="play-games"]');
    if (!g) { res(-1); return; }
    let n = 0;
    const on = () => { n++; };
    g.addEventListener('scroll', on, { passive: true });
    setTimeout(() => { g.removeEventListener('scroll', on); res(n); }, ${ms});
  })`);
}
/** a spy on the rail's scrollTo (idempotent): every programmatic scroll is
 * logged page-side as { t, b } into window.__obScrollLog — the leaf's own
 * snap is SMOOTH, a key-rest correction (revealBrowsed) is INSTANT ('auto');
 * it sees a correction even when settle() waits it out */
const SCROLL_SPY = `(() => {
  const g = document.querySelector('[data-ob="play-games"]');
  window.__obScrollLog = [];
  if (!g.__obScrollTo0) {
    g.__obScrollTo0 = g.scrollTo.bind(g);
    g.scrollTo = (...a) => {
      const o = a[0] && typeof a[0] === 'object' ? a[0] : null;
      // the caller's first frames ride along, so a red names its writer
      window.__obScrollLog?.push({ t: performance.now(), b: o?.behavior ?? 'auto', from: g.scrollLeft, left: o?.left ?? null,
        by: String(new Error().stack).split('\\n').slice(2, 5).map((s) => s.trim().replace(/^at /, '').replace(/https?:\\/\\/[^/ ]+/, '')).join(' < ') });
      return g.__obScrollTo0(...a);
    };
  }
  return { reduced: matchMedia('(prefers-reduced-motion: reduce)').matches };
})()`;
/** the presented card's 1-based index among the visible cards (k's law) */
const PRESENTED_INDEX = `(() => { const g = document.querySelector('[data-ob="play-games"]'); const q = (s) => g.querySelector('[data-ob="play-game"]' + s);
  const cur = q('[data-ob-browsed="true"]') ?? q('[aria-selected="true"]') ?? q('[aria-current="true"]');
  const cards = [...g.children].filter((k) => !k.hidden && k.getClientRects().length);
  return cur ? cards.indexOf(cur) + 1 : null; })()`;

/** one rest: whole card, A4, the text box vs the clean band (fine judges both edges; coarse judges the trailing edge and logs the leading one) */
function judgeRest(m, fail, tag, { coarse, id = null }) {
  if (m.absent || !m.presented) { fail(`${tag}: no presented card on the rail: ${brief(m)}`); return; }
  const p = m.presented;
  const bad = [];
  if (id && p.id !== id) bad.push(`presented ${p.id}, expected ${id}`);
  if (!(p.visible >= 0.97)) bad.push(`card ${p.id} only ${p.visible} inside the scrollport`);
  if (m.peeks.length) bad.push(`A4 sliver(s) inside the mask: ${m.peeks.join(' / ')}`);
  if (!p.trailClean) bad.push(`the end fade covers ${p.id}'s trailing text (trail ${p.trail}, alpha ${p.alphaTrail})`);
  if (!coarse && !p.leadClean) bad.push(`the start fade covers ${p.id}'s leading text (lead ${p.lead}, alpha ${p.alphaLead}; snap ${m.snap})`);
  if (bad.length) fail(`${tag}: ${bad.join('; ')} — ${brief(m)}`);
  else console.log(`${tag}: ${p.id} rests ${coarse ? 'A4-legal' : 'clean'} (lead ${p.lead} α ${p.alphaLead}${coarse && m.fs ? ' [coarse leading edge: measured, kit follow-up]' : ''}, trail ${p.trail} α ${p.alphaTrail}, sl ${m.sl}, k ${m.k}, snap ${m.snap})`);
}
async function rests(c, fail, tag, { coarse }) {
  // 1. a boot whose current card is the third (de snooker) and the second (en eight_ball)
  if (!(await reboot(c, 'snooker', 'de'))) { fail(`${tag}: reboot snooker/de never mounted play`); return; }
  await settle(c); judgeRest(await c.eval(RAIL), fail, `${tag} boot de snooker`, { coarse, id: 'snooker' });
  if (!(await reboot(c, 'eight_ball', 'en'))) { fail(`${tag}: reboot eight_ball/en never mounted play`); return; }
  await settle(c); judgeRest(await c.eval(RAIL), fail, `${tag} boot en eight_ball`, { coarse, id: 'eight_ball' });
  // 2. a keyboard browse: ArrowRight x2 from the current card (the browser's focus scroll + the leaf's snap)
  await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]').focus({ preventScroll: true }), true)`);
  // GH-1085: each press is judged at REST (no fixed delays) — the rest law
  // for a normal press; the overlapping press is its own leg (5). A normal
  // press ends where the leaf's snap put it: the scrollTo spy, covering
  // keydown through rest, must see at most the leaf's one snap per press and
  // no instant correction (a key-rest correction lands inside settle's quiet
  // window, so a post-rest window alone could never see it)
  const spy = await c.eval(SCROLL_SPY);
  const pressLog = async (label) => {
    await c.eval('(window.__obScrollLog.length = 0, true)');
    await pressKey(c, 'ArrowRight');
    await restOrFail(c, fail, `${tag} ${label}`);
    const n = await scrollsAfterRest(c);
    const log = await c.eval('window.__obScrollLog.slice()');
    const instant = spy.reduced ? Math.max(0, log.length - 1) : log.filter((x) => x.b !== 'smooth').length;
    return { n, calls: log.length, instant, log };
  };
  const p1 = await pressLog('ArrowRight 1');
  const p2 = await pressLog('ArrowRight 2');
  const m2 = await c.eval(RAIL);
  judgeRest(m2, fail, `${tag} ArrowRight x2`, { coarse });
  if (m2.focus && m2.presented && m2.focus.id !== m2.presented.id) fail(`${tag}: the focused card ${m2.focus.id} is not the presented card ${m2.presented.id}`);
  for (const [i, p] of [p1, p2].entries()) {
    if (p.instant || p.calls > 1 || p.n) fail(`${tag} ArrowRight ${i + 1}: a normal press must end where the leaf's snap put it — ${p.calls} scrollTo call(s), ${p.instant} instant correction(s), ${p.n} scroll event(s) after the rest: ${JSON.stringify(p.log)}`);
  }
  // 3. a pointer browse onto the peeking NEXT card (click / tap at its visible strip)
  const pt = await c.eval(`(() => { const g = document.querySelector('[data-ob="play-games"]'); const q = (s) => g.querySelector('[data-ob="play-game"]' + s);
    const cur = q('[data-ob-browsed="true"]') ?? q('[aria-selected="true"]') ?? q('[aria-current="true"]'); // the PRESENTED card, not the first match in DOM order
    const next = cur?.nextElementSibling; if (!next) return null; const r = next.getBoundingClientRect(), gr = g.getBoundingClientRect();
    const x = Math.min(r.right, gr.right) - 6, y = r.top + 20; return { x, y, id: next.dataset.game, hit: document.elementFromPoint(x, y)?.closest('[data-ob="play-game"]')?.dataset.game ?? null }; })()`);
  if (pt && pt.hit === pt.id) {
    if (coarse) { await touchStart(c, [{ x: pt.x, y: pt.y }]); await sleep(60); await touchEnd(c); }
    else { for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 }); }
    await sleep(900); await settle(c);
    // a pointer on a PLAYABLE card commits through the kit confirm (the rail keeps its rest until the
    // answer); a readiness card is browsed in place — either way the rail must REST lawfully now
    judgeRest(await c.eval(RAIL), fail, `${tag} ${coarse ? 'tap' : 'click'} next`, { coarse });
    await c.eval(`(document.querySelector('[data-ob="confirm"] [data-ob="cancel"], [data-ob="confirm"] button')?.click(), true)`).catch(() => {});
    await sleep(200);
  } else console.log(`${tag}: no peeking next card to point at (${JSON.stringify(pt)})`);
  // 4. End onto the readiness fixture (de): the browsed card whole at the rail's end
  if (!(await reboot(c, 'nine_ball', 'de'))) { fail(`${tag}: reboot nine_ball/de never mounted play`); return; }
  await c.eval(`window.__play.previewCatalog(${FIX})`); await sleep(300);
  await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]').focus({ preventScroll: true }), true)`);
  await pressKey(c, 'End'); await sleep(800); await settle(c);
  judgeRest(await c.eval(RAIL), fail, `${tag} End fixture`, { coarse, id: 'fixture_game' });
  await c.eval(`window.__play.previewCatalog(null)`); await sleep(200);
  // 5. GH-1085 THE OVERLAP (both registers; run after the original legs, so
  // their starting states stay as they were): the second press lands while
  // the first press's eased snap is still in flight on a starved main thread
  // (CPU throttled 20x, a 200 ms busy loop between the presses — the CI load
  // shape). Pre-fix the browser's focus scroll jumped on a stale view, the
  // compositor's progress landed on top and the phone rail rested ONE CARD
  // PAST the focused card (sl 711-770 for a 618 rest, 5/5) with nothing ever
  // moving it back; play.js's key-rest law restores the browsed card whole.
  // The leg PROVES its staging: a page-side rest watcher armed at press 1 and
  // a capture keydown stamp say whether press 2 really landed before press
  // 1's snap came to rest; a non-overlapping attempt is re-staged (3 tries)
  // and, if none overlaps, named in the log — never silently judged as the
  // race. Every wait is bounded page-side (the first scroll: 2 s; the rest:
  // settle's own cap) and the throttle reset can never mask the real error.
  const OVERLAP_ARM = `(() => {
    const g = document.querySelector('[data-ob="play-games"]');
    const st = window.__obOverlap = { keys: [], rest1: null, first: null };
    st.first = new Promise((r) => {
      const t = setTimeout(() => r(false), 2000);
      g.addEventListener('scroll', () => { clearTimeout(t); r(true); }, { once: true });
    });
    g.addEventListener('keydown', () => { st.keys.push(performance.now()); }, { capture: true });
    let last = g.scrollLeft, same = 0, lastScroll = performance.now();
    g.addEventListener('scroll', () => { lastScroll = performance.now(); }, { passive: true });
    const tick = () => {
      const sl = g.scrollLeft;
      same = sl === last ? same + 1 : 0;
      last = sl;
      if (st.keys.length >= 1 && same >= 3 && performance.now() - lastScroll >= 150) { st.rest1 = performance.now(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  })()`;
  let mo = null;
  let overlapped = false;
  for (let attempt = 1; attempt <= 3 && !overlapped; attempt++) {
    if (!(await reboot(c, 'eight_ball', 'en'))) { fail(`${tag}: reboot eight_ball/en (overlap) never mounted play`); return; }
    await restOrFail(c, fail, `${tag} overlap boot`);
    await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]').focus({ preventScroll: true }), true)`);
    await restOrFail(c, fail, `${tag} overlap focus`);
    await c.eval(OVERLAP_ARM);
    let q = null;
    let firstScrolled = false;
    await c.send('Emulation.setCPUThrottlingRate', { rate: 20 });
    try {
      await pressKey(c, 'ArrowRight');
      firstScrolled = await c.eval('window.__obOverlap.first');
      c.send('Runtime.evaluate', { expression: 'void (() => { const t = performance.now(); while (performance.now() - t < 200) {} })()' }).catch(() => {});
      await pressKey(c, 'ArrowRight');
      q = await settle(c);
    } finally { await c.send('Emulation.setCPUThrottlingRate', { rate: 1 }).catch(() => {}); }
    if (!firstScrolled) { fail(`${tag} overlap: press 1 never scrolled the rail within 2 s`); return; }
    if (!q?.settled) { fail(`${tag} overlap ArrowRight x2: the rail never came to rest within 3 s (${JSON.stringify(q)})`); return; }
    const st = await c.eval(`(() => { const s = window.__obOverlap; return { keys: s.keys.length, press2: s.keys[1] ?? null, rest1: s.rest1 }; })()`);
    overlapped = st.press2 !== null && (st.rest1 === null || st.press2 < st.rest1);
    mo = await c.eval(RAIL);
    if (!overlapped) console.log(`${tag} overlap note: attempt ${attempt} did not overlap (press 2 at ${st.press2?.toFixed?.(0)}, press 1 rested at ${st.rest1?.toFixed?.(0)}) — re-staged`);
  }
  if (!overlapped) console.log(`${tag} overlap note: no attempt overlapped in 3 tries — the rest below is judged, but it is NOT evidence about the race`);
  const io = await c.eval(PRESENTED_INDEX);
  judgeRest(mo, fail, `${tag} overlap ArrowRight x2`, { coarse, id: 'carom_3cushion' });
  if (mo.focus && mo.presented && mo.focus.id !== mo.presented.id) fail(`${tag} overlap: the focused card ${mo.focus.id} is not the presented card ${mo.presented.id}`);
  if (String(mo.k) !== String(io)) fail(`${tag} overlap: the rail's k ${mo.k} does not name the presented card (index ${io}) — it rested past it: ${brief(mo)}`);
  // 6. a touch PAN (phone) that starts while a key-rest watch is LIVE: press
  // ArrowRight, and on its first scroll event the finger lands and pans. The
  // touchstart must cancel the watch — the rail rests where the pan and the
  // browser's snap leave it, and play.js never issues a correction scroll
  // (a spy on the rail's scrollTo counts calls after the touchstart: 0).
  if (coarse) {
    await c.eval(SCROLL_SPY);
    await c.eval(`(() => {
      const g = document.querySelector('[data-ob="play-games"]');
      const st = window.__obPan = { touch: null, first: null };
      g.addEventListener('touchstart', () => { if (st.touch === null) st.touch = performance.now(); }, { capture: true, passive: true });
      st.first = new Promise((r) => { const t = setTimeout(() => r(false), 2000); g.addEventListener('scroll', () => { clearTimeout(t); r(true); }, { once: true }); });
      return true;
    })()`);
    await pressKey(c, 'ArrowRight');
    if (!(await c.eval('window.__obPan.first'))) { fail(`${tag} touch pan: the ArrowRight never scrolled the rail within 2 s`); return; }
    const gr = await c.eval(`(() => { const r = document.querySelector('[data-ob="play-games"]').getBoundingClientRect(); return { x: r.left + r.width * 0.7, y: r.top + r.height / 2, w: r.width }; })()`);
    await drag(c, { x: gr.x, y: gr.y }, { x: gr.x - gr.w * 0.4, y: gr.y });
    const qs = await restOrFail(c, fail, `${tag} touch pan`);
    const ns = await scrollsAfterRest(c);
    const pan = await c.eval(`(() => { const s = window.__obPan; return { touch: s.touch, after: s.touch === null ? null : window.__obScrollLog.filter((x) => x.t > s.touch).length }; })()`);
    if (pan.touch === null) fail(`${tag} touch pan: the drag never delivered a touchstart to the rail`);
    else if (pan.after) fail(`${tag} touch pan: play.js corrected the rail after the user's pan (${pan.after} scrollTo call(s) after the touchstart) — a pan must cancel the key-rest watch`);
    else if (ns) fail(`${tag} touch pan: the rail scrolled again after the pan came to rest (${ns} scroll event(s), rest sl ${qs?.sl})`);
    else console.log(`${tag} touch pan: the pan cancelled the live key-rest watch — rests at sl ${qs?.sl}, 0 scrollTo after the touchstart, no scroll after the rest`);
  }
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPFade({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  { // ---- desktop 1440x900 (fine): both edges clean
    const errs = [];
    const c = await launchChrome(url('u=fade'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-FADE-CLEAR desktop: the obshell boot never mounted play');
    else { await rests(c, fail, 'P-FADE-CLEAR desktop', { coarse: false }); await gate(c, errs, 'P-FADE-CLEAR desktop', fail); }
    c.close();
  }
  { // ---- phone 844x390 (coarse): whole card + A4 + trailing edge; leading edge logged
    const errs = [];
    const c = await launchPhone(url('u=fadephone'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await boot(c))) fail('P-FADE-CLEAR phone: the phone boot never mounted play');
    else { await rests(c, fail, 'P-FADE-CLEAR phone', { coarse: true }); await gate(c, errs, 'P-FADE-CLEAR phone', fail); }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPFade above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPFade({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-FADE FAIL (${n})` : 'E2E-PLAY-FADE PASS');
}
