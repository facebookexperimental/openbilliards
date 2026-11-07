// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-press-commit.mjs — arm P-PRESS-COMMIT of the play-place gate
// (GH-668 S5 play r6b; the round-6 checker's P1 on 17f4d9f4 + the integrator's
// ruling R1 + the round-6b census (c) of every POINTER entry into the browse).
//
// THE LAW JUDGED — a POINTER press never moves the rail under the pointer.
// Focus on any card is a browse (the common browse-state contract, r6) and a
// press is a focus; on 17f4d9f4 the browse's snap (browseTo → rail.select →
// the leaf's smooth centering) ran DURING the press: a mouse press on the
// trailing half-visible leaf card (1024 fine) scrolled the rail 90 → 133 px
// under the held pointer within 250 ms and a release after that landed on the
// scrollfade — no click, no confirm, no commit. The cure (play.js, the
// pointer-press guard around the ONE browseTo): while a pointer is held inside
// the rail the browse STATE updates and the leaf's select is deferred to one
// task after the release — after the click's activation.
//
// P-PRESS-COMMIT (1024x768 fine MOUSE — Input.dispatchMouseEvent; 844x390
// coarse TOUCH — Input.dispatchTouchEvent; the leaf register, nine_ball
// committed, en), three card positions each — WHOLE (the next playable card
// scrolled whole by a user pan; the rail's own snap settles it), TRAILING
// half-visible (the boot pose: the card after the committed one peeks at the
// far edge) and LEADING half-visible (two snap points on; the card before the
// centered one peeks at the near edge):
//   (i)   pointerdown at the card's VISIBLE centre, held 400 ms: the rail's
//         scrollLeft and the card's rect are UNCHANGED at 80 / 250 / 400 ms,
//         the card holds focus (browse state may update);
//   (ii)  release at the same point → the activation fires EXACTLY once (one
//         confirm rose: the changeGame confirm; the persisted game unchanged
//         while it stands);
//   (iii) the same on the half-visible cards (the RED positions on 17f4d9f4);
//   (iv)  the confirm DECLINED by a real pointer on its cancel button → the
//         COMMITTED card is the selection again (focus, aria-selected,
//         Details on it, no marker), the game unchanged, still ONE confirm,
//         and the committed card rests WHOLE inside the rail (#992 ruling,
//         build 20 — spec 034 FR-006; until then this leg pinned r6b's
//         re-browse of the pressed card).
//   (v)   SYNC DURING THE HOLD (GH-668 S5 play r6c; the round-6b checker's
//         P2 on 8dc48580 + the integrator's ruling R1 + the round-6c census
//         (e)): the same three positions held 400 ms while the page fires
//         `ob:settings` (a paint-only rebroadcast — the wire playback.js /
//         flow.js / the rerackKind probe ride), `ob:perftier` and
//         `__play.refresh()` at 150 / 250 / 350 ms into the hold: scrollLeft
//         + the card rect UNCHANGED at 80 / 200 / 300 / 400 ms, focus on the
//         card, release → EXACTLY one confirm, the decline as (iv). On
//         8dc48580 renderRail's keep law took the browsed id as its keep on
//         every sync and `rail.select(browsed)` ran the very snap the guard
//         had deferred — the rail moved 0 → 90 → 133 px under the held
//         mouse and the release activated nothing. The cure: while a press
//         holds a deferred browse the keep is the leaf's LIVE selection (no
//         select, no reveal, no snap); the deferred browse still runs one
//         task after the release. RED on 8dc48580 (the 1024 mouse trailing
//         + leading sync legs at least), GREEN ×3 on the fix.
//   (vi)  SYNC IN THE HOLD ON THE FALLBACK REGISTER (GH-668 S5 play r6d; the
//         round-6c checker's P2 on 235a2dab + the integrator's ruling R1):
//         the P-FOCUS-BROWSE pending-leaf recipe (every `ui/cardrail.js`
//         request of the document HELD at the network and never answered, so
//         the RUNG-1 button register mounts after RAIL_LEAF_WAIT_MS) — the
//         1024 mouse press held 400 ms on the TRAILING and the LEADING
//         half-visible fallback button while the page fires `ob:settings` at
//         150 ms and `__play.refresh()` at 250 ms: scrollLeft + the button
//         rect UNCHANGED at 80 / 200 / 300 / 400 ms, focus on the button,
//         release → EXACTLY one confirm, the decline → the button stays
//         browsed (focus, the mirrored aria-selected, Details), the game
//         unchanged (no leaf snap exists on this register: the button's rest
//         after the decline is LOGGED, not judged). On 235a2dab renderRail's
//         rung-1 branch ran its keep-law reveal (`revealBrowsed(browsed,
//         { whenOutside: false })`) with no pressHeld guard — the leaf branch
//         had been cured in r6c — so a sync landing inside the hold scrolled
//         the half-visible button whole under the pointer (0 → 133 px) and
//         the release landed on the scrollfade (0 confirms). The cure: the
//         rung-1 reveal is skipped under a held press too (`!pressHeld`, the
//         keep clause's "under ANY held press" now true on both registers).
//         RED on 235a2dab (the two 1024 mouse rows at least), GREEN ×3 on
//         the fix; 844 touch for the record (the compat focus follows the
//         touchend).
// RED on 17f4d9f4 (1024 mouse: trailing + leading rows — the rail moved under
// the held pointer and the release activated nothing), GREEN ×3 on the fix;
// the 844 touch rows are green on both trees (the compat focus follows the
// touchend) and pin that the guard leaves the touch path alone. The coarse
// register snaps cards to START (a trailing peek only), so its LEADING row
// is staged by a mid-pan and recorded as not applicable when the rail's own
// proximity snap takes that pan away.
//
// Runs INSIDE e2e-play.mjs (imported after P-FOCUS-BROWSE — the +0 desktop and
// +4 phone CDP slots after their owners closed; PORT_INVENTORY unchanged) and
// stands alone for a fast red proof:
//   node web/tools/e2e-play-press-commit.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';

// standalone band shape = e2e-play's (the arm sits on its +0 / +4 slots)
export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(stepMs); }
  return false;
}
async function bootLeaf(c) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200))) return false;
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150))) return false;
  if (!(await waitExpr(c, `(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
    && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`, 100 * SCALE, 150))) return false;
  await waitExpr(c, `!!document.querySelector('section[data-place="play"] .ob-cardrail-card')`, 60 * SCALE, 150);
  await sleep(1200); // the first present's instant snap + the fold-snap settle
  return true;
}
/** leg (vi): the P-FOCUS-BROWSE hold idiom on an OPEN connection — from now on EVERY `ui/cardrail.js` request of
 * this Chrome is paused and NEVER answered (Network.enable BEFORE setCacheDisabled, else the next document reuses
 * the leaf from the renderer MemoryCache; the worker bypassed; then Fetch.enable). Installed once, after the leaf legs. */
async function holdLeaf(c) {
  const st = { held: 0 };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/\/app\/ui\/cardrail\.js(\?|$)/.test(params.request.url)) { st.held += 1; return; } // held — never continued
    c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
  return st;
}
/** leg (vi): the boot under the hold — the RUNG-1 register lands RAIL_LEAF_WAIT_MS (2000) after the sheet */
async function bootFallback(c) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200))) return null;
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150))) return null;
  if (!(await waitExpr(c, `(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
    && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`, 100 * SCALE, 150))) return null;
  if (!(await waitExpr(c, `document.querySelectorAll('section[data-place="play"] [data-ob="play-game"]').length > 0`, 60 * SCALE, 150))) return null;
  await sleep(1200); // the register's first paint + the fold-snap settle
  return c.eval(`(() => { const ks = [...document.querySelectorAll('section[data-place="play"] [data-ob="play-game"]')];
    return { n: ks.length, leaf: ks.some((k) => k.classList.contains('ob-cardrail-card')),
      rung1: ks.length > 0 && ks.every((k) => k.tagName === 'BUTTON' && k.classList.contains('ob-play-card') && !k.classList.contains('ob-cardrail-card')) }; })()`);
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
const seedLS = (c, s) => c.eval(`(() => { const o = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}'); Object.assign(o, ${JSON.stringify(s)}); localStorage.setItem('ob-settings-v1', JSON.stringify(o)); return true; })()`);
const G = `document.querySelector('section[data-place="play"] [data-ob="play-games"]')`;
/** POSITION → the target card id: 'whole' / 'leading' pan the rail instantly (a user pan; the rail's snap settles it) */
const PLACE = (pos) => `(() => { const g = ${G}; if (!g) return null; const mr = g.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(g).paddingLeft) || 0;
  const all = [...g.querySelectorAll('[data-ob="play-game"]')]; const cur = all.find((k) => k.getAttribute('aria-current') === 'true');
  const i0 = all.indexOf(cur); const pl = (k) => k && k.dataset.playable === 'true' && k.getAttribute('aria-disabled') !== 'true';
  const next = all[i0 + 1], third = all[i0 + 2]; if (!pl(next) || !pl(third)) return null;
  const pos = ${JSON.stringify(pos)};
  if (pos === 'trailing') return next.dataset.game;
  if (pos === 'whole') { const r = next.getBoundingClientRect(); g.scrollTo({ left: g.scrollLeft + (r.left - mr.left) - pad, behavior: 'auto' }); return next.dataset.game; }
  if (pos === 'leading') { const r = third.getBoundingClientRect(); g.scrollTo({ left: g.scrollLeft + (r.left - mr.left) - pad, behavior: 'auto' }); return next.dataset.game; }
  return null; })()`;
const TARGET = (id) => `(() => { const g = ${G}; const mr = g.getBoundingClientRect(); const k = g.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(id)}]'); if (!k) return null; const r = k.getBoundingClientRect();
  const l = Math.max(r.left, mr.left), rt = Math.min(r.right, mr.right); const pad = parseFloat(getComputedStyle(g).paddingLeft) || 0;
  return { id: ${JSON.stringify(id)}, x: Math.round((l + rt) / 2), y: Math.round(r.top + r.height / 2), frac: Math.round(Math.max(0, rt - l) / r.width * 100) / 100, whole: r.left >= mr.left + pad - 0.5 && r.right <= mr.right - pad + 0.5,
    sel: k.getAttribute('aria-selected'), cur: k.getAttribute('aria-current'), sl: Math.round(g.scrollLeft), committed: g.querySelector('[data-ob="play-game"][aria-current="true"]')?.dataset.game ?? null }; })()`;
const ARM = `(() => { window.__obPressConfirms = 0; if (window.__obPressMo) window.__obPressMo.disconnect();
  window.__obPressMo = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (n?.nodeType === 1 && (n.matches?.('[data-ob="confirm"]') || n.querySelector?.('[data-ob="confirm"]'))) window.__obPressConfirms += 1; } });
  window.__obPressMo.observe(document.body, { childList: true, subtree: true }); return true; })()`;
const READ = (id, x, y) => `(() => { const g = ${G}; const mr = g.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(g).paddingLeft) || 0; const el = document.elementFromPoint(${x}, ${y}); const k = el?.closest?.('[data-ob="play-game"]');
  const card = g.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(id)}]'); const r = card?.getBoundingClientRect();
  return { under: k ? k.dataset.game : (el ? el.tagName + '.' + String(el.className).slice(0, 30) : null), sl: Math.round(g.scrollLeft * 10) / 10, left: r ? Math.round(r.left * 10) / 10 : null,
    whole: !!r && r.left >= mr.left + pad - 0.5 && r.right <= mr.right - pad + 0.5,
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? (document.activeElement?.dataset?.ob ?? document.activeElement?.tagName ?? null),
    sel: [...g.querySelectorAll('[data-ob="play-game"][aria-selected="true"]')].map((k) => k.dataset.game), marker: [...g.querySelectorAll('[data-ob="play-game"][data-ob-browsed="true"]')].map((k) => k.dataset.game),
    body: document.querySelector('section[data-place="play"] [data-ob="play-details-body"]')?.dataset.game ?? null, game: window.__settings?.get?.().game ?? null,
    confirms: window.__obPressConfirms ?? null, confirmOpen: !!document.querySelector('[data-ob="confirm"]') }; })()`;
const CANCEL = `(() => { const b = document.querySelector('[data-ob="confirm"] [data-ob="confirm-cancel"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`;
async function down(c, touch, x, y) {
  if (touch) await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  else { await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); }
}
async function up(c, touch, x, y) {
  if (touch) await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  else await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
/** the three syncs of leg (v), fired from the page at 150 / 250 / 350 ms into the hold (a paint-only ob:settings rebroadcast, the perf-tier announce, the scripted refresh) */
const SYNCS_IN_HOLD = [
  `window.dispatchEvent(new CustomEvent('ob:settings', { detail: {} })); true`,
  `window.dispatchEvent(new Event('ob:perftier')); true`,
  `window.__play.refresh(); true`,
];
/** the two syncs of leg (vi), fired from the page at 150 / 250 ms into the hold on the fallback register (the paint-only rebroadcast, the scripted refresh) */
const SYNCS_IN_HOLD_FALLBACK = [
  `window.dispatchEvent(new CustomEvent('ob:settings', { detail: {} })); true`,
  `window.__play.refresh(); true`,
];
const brief = (s) => JSON.stringify({ sl: s.sl, left: s.left, under: s.under, focus: s.focus, sel: s.sel, marker: s.marker, body: s.body, game: s.game, confirms: s.confirms, whole: s.whole });
/** ONE press: place the card, hold 400 ms (samples at 80 / 250 / 400; leg (v) `syncs`: a sync at 150 / 250 / 350 ms, samples at
 * 80 / 200 / 300 / 400; leg (vi) `fallback` (+ `syncs`): the rung-1 register under the hold, ob:settings at 150 + refresh at
 * 250 ms, samples at 80 / 200 / 300 / 400), release, count the activation, decline, read the rest */
async function pressCase(c, fail, tag, { touch, pos, url, syncs = false, fallback = null }) {
  await seedLS(c, { game: 'nine_ball', language: 'en' });
  await c.send('Page.navigate', { url });
  if (fallback) {
    const s0 = await bootFallback(c);
    if (!s0) { fail(`${tag}: the held-leaf boot never mounted the rung-1 register`); return; }
    if (fallback.held < 1) { fail(`${tag}: staging — no cardrail.js request was held (${JSON.stringify(fallback)})`); return; }
    if (s0.leaf || !s0.rung1) { fail(`${tag}: staging — the held leaf must leave the rung-1 register (leaf ${s0.leaf}, rung1 ${s0.rung1}, n ${s0.n})`); return; }
  } else if (!(await bootLeaf(c))) { fail(`${tag}: the obshell boot never mounted the leaf rail`); return; }
  const id = await c.eval(PLACE(pos));
  if (!id) { fail(`${tag}: staging — no playable card pair after the committed card`); return; }
  await sleep(500); // the pan's snap settle
  let t = await c.eval(TARGET(id));
  if (pos === 'leading' && t && t.frac === 0) {
    // the coarse register snaps cards to START (play.css: the peek-law slot leaves a TRAILING peek only), so no
    // leading peek exists at a rest position there; a mid-pan that leaves 48 px of the card at the near edge is
    // tried once — if the rail's proximity snap takes it away, the geometry has no leading peek and the row is
    // recorded as such (not a failure: on that register the compat focus follows the touchend anyway)
    await c.eval(`(() => { const g = ${G}; const mr = g.getBoundingClientRect(); const pad = parseFloat(getComputedStyle(g).paddingLeft) || 0;
      const r = g.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(id)}]').getBoundingClientRect(); g.scrollTo({ left: g.scrollLeft + (r.right - mr.left) - pad - 48, behavior: 'auto' }); return true; })()`);
    await sleep(500);
    t = await c.eval(TARGET(id));
    if (t && t.frac === 0) { console.log(`${tag}: no leading peek at rest in this geometry (start-aligned snap; the mid-pan re-snapped to sl ${t.sl}) — row not applicable`); return; }
  }
  if (!t || t.cur === 'true' || t.sel === 'true') { fail(`${tag}: staging — the target must be a non-committed, non-selected playable card: ${JSON.stringify(t)}`); return; }
  if (pos === 'whole' ? !t.whole : !(t.frac > 0.08 && t.frac < 0.92)) { fail(`${tag}: staging — the ${pos} card must stand ${pos === 'whole' ? 'whole' : 'partly visible'}: ${JSON.stringify(t)}`); return; }
  await c.eval(ARM);
  const before = await c.eval(READ(id, t.x, t.y));
  await down(c, touch, t.x, t.y);
  const samples = [];
  let stamps = '80 / 250 / 400 ms';
  if (syncs && fallback) { // leg (vi): sample at 80, ob:settings at 150, sample at 200, refresh at 250, samples at 300 / 400
    stamps = '80 / 200 / 300 / 400 ms (ob:settings at 150, refresh at 250)';
    await sleep(80); samples.push(await c.eval(READ(id, t.x, t.y)));
    await sleep(70); await c.eval(SYNCS_IN_HOLD_FALLBACK[0]); await sleep(50); samples.push(await c.eval(READ(id, t.x, t.y)));
    await sleep(50); await c.eval(SYNCS_IN_HOLD_FALLBACK[1]); await sleep(50); samples.push(await c.eval(READ(id, t.x, t.y)));
    await sleep(100); samples.push(await c.eval(READ(id, t.x, t.y)));
  } else if (syncs) { // leg (v): sample, then sync at 150 / 250 / 350, sampling 50 ms after each
    stamps = '80 / 200 / 300 / 400 ms (syncs at 150 / 250 / 350)';
    await sleep(80); samples.push(await c.eval(READ(id, t.x, t.y)));
    for (const expr of SYNCS_IN_HOLD) { await sleep(70); await c.eval(expr); await sleep(30); samples.push(await c.eval(READ(id, t.x, t.y))); }
  } else {
    for (const wait of [80, 170, 150]) { await sleep(wait); samples.push(await c.eval(READ(id, t.x, t.y))); }
  }
  const last = samples[samples.length - 1];
  const moved = samples.filter((s) => s.sl !== before.sl || s.left !== before.left);
  if (moved.length) fail(`${tag}: the rail moved under the HELD pointer (sl ${before.sl} → ${samples.map((s) => s.sl).join(' / ')} at ${stamps}; card left ${before.left} → ${samples.map((s) => s.left).join(' / ')}; under the pointer at 400 ms: ${last.under})`);
  if (!touch && last.focus !== id) fail(`${tag}: the pressed card must hold focus during the press (focus ${last.focus})`);
  await up(c, touch, t.x, t.y);
  await waitExpr(c, `!!document.querySelector('[data-ob="confirm"]')`, 12 * SCALE, 100);
  await sleep(300);
  const after = await c.eval(READ(id, t.x, t.y));
  if (after.confirms !== 1 || !after.confirmOpen) fail(`${tag}: the release must activate the card EXACTLY once (one changeGame confirm): confirms ${after.confirms}, open ${after.confirmOpen}, under the pointer ${after.under} — ${brief(after)}`);
  if (after.game !== t.committed) fail(`${tag}: the persisted game must not change while the confirm stands (${after.game})`);
  if (!after.confirmOpen) return;
  const cb = await c.eval(CANCEL);
  if (!cb) { fail(`${tag}: the confirm has no cancel button`); return; }
  await down(c, touch, cb.x, cb.y); await sleep(40); await up(c, touch, cb.x, cb.y);
  await waitExpr(c, `!document.querySelector('[data-ob="confirm"]')`, 20 * SCALE, 100);
  await sleep(900); // the dialog's focus restore (onto the committed card) + the re-sync reveal
  const d = await c.eval(READ(t.committed, t.x, t.y));
  const bad = [];
  if (d.confirmOpen || d.confirms !== 1) bad.push(`the decline must close the ONE confirm (open ${d.confirmOpen}, confirms ${d.confirms})`);
  if (d.game !== t.committed) bad.push(`the game changed (${d.game})`);
  // #992: the decline re-selects the COMMITTED card (focus, aria-selected, Details) and reveals it whole
  if (d.focus !== t.committed) bad.push(`focus must return to the committed card ${t.committed} (${d.focus})`);
  if (!(d.sel.length === 1 && d.sel[0] === t.committed)) bad.push(`the committed card must be the one selection — aria-selected ${JSON.stringify(d.sel)}`);
  if (d.marker.length) bad.push(`no readiness marker (${JSON.stringify(d.marker)})`);
  if (d.body !== t.committed) bad.push(`Details must read the committed card (${d.body})`);
  // the leaf register reveals the committed card whole; on the rung-1 register the rest is logged, not judged
  if (!fallback && !d.whole) bad.push(`the committed card must rest whole inside the rail (sl ${d.sl}, left ${d.left})`);
  if (bad.length) fail(`${tag}: after the decline — ${bad.join('; ')} — ${brief(d)}`);
  const how = fallback ? ` on the rung-1 register (${fallback.held} cardrail request(s) held)${syncs ? ' with ob:settings / refresh at 150 / 250' : ''}`
    : (syncs ? ' with ob:settings / ob:perftier / refresh at 150 / 250 / 350' : '');
  console.log(`${tag}: ${id} ${pos} (frac ${t.frac}) held 400 ms${how}: sl ${before.sl} → ${samples.map((s) => s.sl).join(' / ')}, focus ${last.focus}; release → confirms ${after.confirms}; decline → ${brief(d)}`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
export async function armPPressCommit({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&sw=0&${q}`;
  { // ---- desktop 1024x768 (fine): real mouse presses
    const errs = [];
    const c = await launchChrome(url('u=ppress0'), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    await waitExpr(c, 'window.__test?.ready === true', 200 * SCALE, 200);
    for (const pos of ['whole', 'trailing', 'leading']) {
      await pressCase(c, fail, `P-PRESS-COMMIT 1024 mouse ${pos}`, { touch: false, pos, url: url(`u=ppress-${pos}`) });
      await gate(c, errs, `P-PRESS-COMMIT 1024 mouse ${pos}`, fail);
      await pressCase(c, fail, `P-PRESS-COMMIT 1024 mouse ${pos} sync-in-hold`, { touch: false, pos, url: url(`u=ppress-sync-${pos}`), syncs: true });
      await gate(c, errs, `P-PRESS-COMMIT 1024 mouse ${pos} sync-in-hold`, fail);
    }
    // leg (vi): the fallback register (the leaf held from here on — last in this Chrome)
    const st = await holdLeaf(c);
    for (const pos of ['trailing', 'leading']) {
      await pressCase(c, fail, `P-PRESS-COMMIT 1024 mouse ${pos} fallback sync-in-hold`, { touch: false, pos, url: url(`u=ppress-fb-${pos}`), syncs: true, fallback: st });
      await gate(c, errs, `P-PRESS-COMMIT 1024 mouse ${pos} fallback sync-in-hold`, fail);
    }
    c.close();
  }
  { // ---- phone 844x390 (coarse): real touch presses
    const errs = [];
    const c = await launchPhone(url('u=ppressphone0'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    await waitExpr(c, 'window.__test?.ready === true', 200 * SCALE, 200);
    for (const pos of ['whole', 'trailing', 'leading']) {
      await pressCase(c, fail, `P-PRESS-COMMIT 844 touch ${pos}`, { touch: true, pos, url: url(`u=ppressphone-${pos}`) });
      await gate(c, errs, `P-PRESS-COMMIT 844 touch ${pos}`, fail);
      await pressCase(c, fail, `P-PRESS-COMMIT 844 touch ${pos} sync-in-hold`, { touch: true, pos, url: url(`u=ppressphone-sync-${pos}`), syncs: true });
      await gate(c, errs, `P-PRESS-COMMIT 844 touch ${pos} sync-in-hold`, fail);
    }
    // leg (vi) for the record on touch (the compat focus follows the touchend; the guard is already released)
    const st = await holdLeaf(c);
    for (const pos of ['trailing', 'leading']) {
      await pressCase(c, fail, `P-PRESS-COMMIT 844 touch ${pos} fallback sync-in-hold`, { touch: true, pos, url: url(`u=ppressphone-fb-${pos}`), syncs: true, fallback: st });
      await gate(c, errs, `P-PRESS-COMMIT 844 touch ${pos} fallback sync-in-hold`, fail);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPPressCommit above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPPressCommit({ PORT, CDP_PORT, fail, webDir }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-PRESS-COMMIT FAIL (${n})` : 'E2E-PLAY-PRESS-COMMIT PASS');
}
