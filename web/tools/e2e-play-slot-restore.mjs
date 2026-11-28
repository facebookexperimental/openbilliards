// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-play-slot-restore.mjs — arm P-SLOT-RESTORE of the play-place gate (GH-668 S5
// play r7: review review r6 P2 on f819c812 + the integrator's ruling R1 + the
// round-7 census (g)).
//
// The law judged here — THE KEEP LAW's SLOT-RESTORE clause: after ANY rail slot
// / scrollport change (the kit's fitPeek re-measures `--sf-slot` on every
// clientWidth change: the shell hide → show of Quick Play → reopen, a place
// switch away and back, a shell exit + the reopen pill, a viewport resize /
// rotate) the COMMITTED card is restored WHOLE inside the rail viewport when no
// browse is live, and the BROWSED card when one is (the r5 law); no snap under a
// held press (the pointer-press guard). On f819c812 the coarse cards take their
// width from `--sf-slot`, so the hidden rail's `0px` collapsed the cards and the
// scroll (scrollLeft → 0 / an anchored 206), the restored `198px` re-widened them
// with the rail parked at the start, the slot observer returned early with
// `browsed === null` and the same-id `rail.select()` never re-snapped — a late
// committed card (10-Ball; one_pocket in the middle too) sat completely
// offscreen after Quick Play → reopen Play (review r6, browser-reproduced; the
// base main 4325a610 keeps it visible).
//
// Legs (844x390 coarse with the LAST playable (ten_ball) committed and with a
// MIDDLE card (one_pocket); 667x375 coarse and 1024x768 fine with ten_ball):
//   (a) Quick Play (`__shell.quickPlay()`) → reopen Play (`openShell({ place:
//       'play' })`), no browse: the committed card whole (≥ 0.97 of its width
//       inside the rail viewport), aria-selected on it, no browse marker;
//   (b) two more Quick Play → reopen cycles: whole again, scrollLeft stable
//       (|Δ| ≤ 1 px against cycle 1);
//   (c) a shell exit + re-enter through the REAL reopen pill (`#ob-shell-open`
//       — a touch on coarse, a mouse click on fine): whole;
//   (d) a synthetic slot collapse without the shell — `--sf-slot: 0px` written
//       on the rail, then the measured value restored: whole;
//   (e) the same synthetic collapse + a Quick Play → reopen under a live
//       READINESS browse (previewCatalog fixture + End): the browsed fixture
//       whole, its marker kept, the leaf's aria-selected unchanged (r5);
//   (f) under a live PLAYABLE browse (ArrowLeft from the committed last card):
//       the browsed card whole, aria-selected on it;
//   (g) the leaf ARRIVAL under a readiness browse (844 + 1024, ten_ball): the
//       pending-leaf recipe (ui/cardrail.js HELD at the network → the rung-1
//       register; previewCatalog + End browses the fixture; the request
//       released) — the browsed fixture whole after the leaf lands (on
//       f819c812 renderRail's reveal ran BEFORE decorateRail had stamped
//       data-ob / data-game on the fresh leaf cards, found no card, and the
//       first present's snap to the committed keep left the fixture out of
//       view: census (g), every position);
//   (h) KF-017 (#1155), 1280x800 fine with a MIDDLE card (one_pocket): an ARRIVAL
//       lands the committed card whole in its OWN task. A shell exit hides #ob-shell
//       and the re-entry lays the rail out at whatever offset it kept through the hide
//       (a pan's, or its start — e2e-settings' carom leg in 6 of 8 runs); the slot-restore
//       above brought the card back only a rAF after the FIRST frame, which painted it
//       outside the scrollport (a click inside that frame hit the scene: e2e-settings'
//       carom pick). A real wheel pans the committed card out of the rail viewport,
//       Quick Play exits, and (h1) the scripted re-entry (e2e-settings' `openShell({})`
//       + `go('play')`, here in one task) / (h2) a real mouse click on the reopen pill
//       is judged in the re-entry's own task, at the first frame's rAF and after the
//       settle; (h3) with no browse live, a re-present of play while it is shown
//       (`go('play')` after a pan) is NOT an arrival: the rail stays where the user
//       panned it (|Δ| ≤ 1 px, in the task and after a settle — the leaf's user-pan
//       law); (h4) a place switch away and back (practice → play, after a pan) IS an
//       arrival: the committed card whole in the return's own task, at its first
//       frame, settled;
//   (f′) #1156, nine_ball committed, at 1280x800 fine and at 844x390 coarse: an ARRIVAL under a live PLAYABLE
//       browse lands the BROWSED card whole. ArrowRight browses eight_ball (index 1) and a pan back to the
//       rail's start (a real wheel on fine, an instant scrollTo on coarse) leaves it straddling the scrollport
//       edge (the rail a re-entry may lay out); Quick Play exits and the scripted re-entry (the (h1) recipe,
//       one task) is judged in its own task, at the first frame and after the settle. renderRail's keep-law
//       reveal and the slot-restore observer read the straddle as the leaf's snap in flight (`whenOutside`),
//       but a same-id select after a hide starts no snap. On coarse the cards take their width from the
//       slot, still `0px` in the re-entry's task and first frame, so the settled read is the one that
//       judges the slot path there;
//   (i-esc), (i) #1160, the same block: a keyboard walk browses snooker (index 2, whole at its centred rest) and a
//       real click on it raises the switch confirm. (i-esc) declines with Escape, whose close-time focus restore runs
//       BEFORE the verdict: focus, aria-selected, Details and the whole card come back to nine_ball. (i) accepts with a
//       real click: from the accept to the shell's exit, every frame, scroll and scrollend keeps the rail where it
//       stood at the arm read (|Δ scrollLeft| <= 1 px), snooker whole and aria-selected, and the last focus on a rail card
//       before the exit is snooker (the snooker transport held 3 s so the restore lands before the table build). The
//       confirm's close-time restore (#992's re-home onto the committed card, no
//       preventScroll) used to scroll the rail back to nine_ball and browse it while the switch applied;
//   (i-home) #1160 (review P1), its own 1280 nine_ball boot: the same walk and accept, with the switch's progress overlay
//       leaf held unanswered (the switch runs without it after settings.js's 250 ms wait) and the snooker transport
//       held 3 s, so the hall stays live while the switch applies; a Home press then lands on nine_ball, and that
//       browse must stand: focus, aria-selected and Details on nine_ball. Only the confirm's own close-time restore
//       (announced by ui/dialog.js as 'ob:restore') is held;
//   the `ob-settings-v1` blob byte-unchanged throughout, except in (i) and (i-home), whose accepted switches persist
//   snooker.
// RED on f819c812 (the 844 / 667 no-browse rows whole 0 + the arrival rows), GREEN ×3 on the fix.
// (h1)/(h2): RED on 19017f5e (whole 0 in the task and at the first frame, both paths), GREEN on the KF-017 fix;
// (h3): GREEN on 19017f5e, RED on an ungated arrival reveal (the rail jumps back to the committed card);
// (h4): RED on 19017f5e and on an arrival gate without its place-switch half, GREEN on the fix.
// Measured on the lane's slot reruns (2026-10-29, first attempt each), as predicted:
// (f′): 1280 RED on 725f8fbb in the task, at the first frame and after the settle (whole ~0.49), 844 RED after the settle
// (whole ~0.26), GREEN on the #1156 fix; (i): RED on 725f8fbb (scrollLeft back to 0, nine_ball selected, the last rail focus
// nine_ball), GREEN on the #1160 fix; (i-esc): GREEN on 725f8fbb and on the fix, RED without settleBack's re-home.
// (i-home), predicted: RED on 77efedd4 (the Home focus moved back to snooker while aria-selected and Details read
// nine_ball), GREEN on the announced-restore fix.
//
// Runs INSIDE e2e-play.mjs (imported; after P-PRESS-COMMIT — re-uses the +0
// desktop and +4 phone CDP slots; PORT_INVENTORY unchanged) and stands alone:
//   node web/tools/e2e-play-slot-restore.mjs   (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { launchChrome, sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 11 };
export const SHARED_DEFAULT_WINDOW = 'e2e-play';

const SCALE = Number(process.env.OB_E2E_POLL_SCALE) || 1;
async function waitExpr(c, expr, tries, stepMs) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(stepMs); }
  return false;
}
async function boot(c) {
  if (!(await waitExpr(c, 'window.__test?.ready === true', (Number(process.env.OB_E2E_READY_TRIES) || 200) * SCALE, 200))) return false;
  if (!(await waitExpr(c, 'typeof window.__shell === "object" && window.__shell.isOpen()', 60 * SCALE, 150))) return false;
  if (!(await waitExpr(c, `(() => document.querySelector('section[data-place="play"]')?.classList.contains('ob-play-host') === true
    && typeof window.__play === 'object' && !!document.getElementById('ob-play-css')?.sheet)()`, 100 * SCALE, 150))) return false;
  await sleep(700); // fitPeek's first sync + the fold-snap's deferred re-settle
  return true;
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    else if (method === 'Runtime.exceptionThrown') sink.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
}
const VK = { ArrowLeft: 37, ArrowRight: 39, End: 35, Home: 36, Escape: 27 };
async function pressKey(c, key) {
  for (const type of ['keyDown', 'keyUp']) await c.send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: VK[key] ?? 0, nativeVirtualKeyCode: VK[key] ?? 0 });
}
const FIX = JSON.stringify([{ id: 'fixture_game', display_name: 'Fixture Game', readiness: 'config_ready',
  prerequisites: [{ id: 'fixture-rules', kind: 'ruleset', description: 'Fixture rulebook (synthetic)' }],
  provenance: { body: 'FIX', rulebook: 'Fixture Rules', edition: '2026' } }]);
// page-side state around ONE target card: its visible fraction inside the rail viewport, the rail scroll + slot, the registers
const STATE = (id) => `(() => {
  const sec = document.querySelector('section[data-place="play"]'); const g = sec?.querySelector('[data-ob="play-games"]');
  if (!sec || !g) return { absent: true };
  const cards = [...g.querySelectorAll('[data-ob="play-game"]')];
  const k = cards.find((c) => c.dataset.game === ${JSON.stringify(id)}) ?? null;
  const gr = g.getBoundingClientRect(); const r = k ? k.getBoundingClientRect() : null;
  const whole = r && r.width > 0 && gr.width > 0 ? Math.max(0, Math.min(r.right, gr.right) - Math.max(r.left, gr.left)) / r.width : null;
  return { found: !!k, leaf: cards.some((c) => c.classList.contains('ob-cardrail-card')), n: cards.length,
    whole: whole === null ? null : Math.round(whole * 100) / 100, card: r ? [Math.round(r.left), Math.round(r.right)] : null, rail: [Math.round(gr.left), Math.round(gr.right)],
    sl: Math.round(g.scrollLeft * 10) / 10, cw: g.clientWidth, slot: g.style.getPropertyValue('--sf-slot') || null,
    selected: cards.filter((c) => c.getAttribute('aria-selected') === 'true').map((c) => c.dataset.game),
    browsedIds: cards.filter((c) => c.getAttribute('data-ob-browsed') === 'true').map((c) => c.dataset.game),
    committed: cards.find((c) => c.getAttribute('aria-current') === 'true')?.dataset.game ?? null,
    focus: document.activeElement?.closest?.('[data-ob="play-game"]')?.dataset.game ?? null,
    open: window.__shell.isOpen(), hidden: !!sec.hidden, game: window.__settings?.get?.().game ?? null, blob: localStorage.getItem('ob-settings-v1') };
})()`;
const brief = (s) => JSON.stringify({ whole: s.whole, card: s.card, rail: s.rail, sl: s.sl, slot: s.slot, sel: s.selected, browsed: s.browsedIds, focus: s.focus, game: s.game, open: s.open });
async function reopenSettled(c) {
  await waitExpr(c, 'window.__shell.isOpen() && !window.__shell.moving()', 60 * SCALE, 100);
  await sleep(1200); // fitPeek's slot restore (+50 ms on the phone) + the fold-snap settle + any proximity re-snap
}
async function quickPlayReopen(c, fail, tag) {
  const exited = await c.eval('window.__shell.quickPlay()');
  if (exited !== true) fail(`${tag}: quickPlay must exit the shell (${exited})`);
  await waitExpr(c, '!window.__shell.isOpen()', 30 * SCALE, 100); await sleep(900);
  const reopened = await c.eval(`window.__shell.openShell({ place: 'play' })`);
  if (reopened !== true) fail(`${tag}: openShell({ place: 'play' }) must re-enter (${reopened})`);
  await reopenSettled(c);
}
async function pillReenter(c, fail, tag, coarse) {
  await c.eval('window.__shell.quickPlay()');
  await waitExpr(c, '!window.__shell.isOpen()', 30 * SCALE, 100); await sleep(900);
  const pt = await c.eval(`(() => { const el = document.getElementById('ob-shell-open'); if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!pt) { fail(`${tag}: the reopen pill #ob-shell-open must be on the page after Quick Play`); await c.eval(`window.__shell.openShell({ place: 'play' })`); await reopenSettled(c); return; }
  if (coarse) { await touchStart(c, [pt]); await sleep(40); await touchEnd(c); }
  else {
    await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
    await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  }
  await reopenSettled(c); await sleep(600); // the pill's animated ramp
}
/** the synthetic collapse: --sf-slot 0px written on the rail, then the measured value restored (the kit's own write on a re-measure) */
async function syntheticSlot(c, fail, tag) {
  const v = await c.eval(`document.querySelector('section[data-place="play"] [data-ob="play-games"]').style.getPropertyValue('--sf-slot')`);
  if (!v) { console.log(`${tag}: no --sf-slot on the rail (a kit without fitPeek) — the synthetic leg is not applicable`); return false; }
  await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-games"]').style.setProperty('--sf-slot', '0px'), true)`); await sleep(300);
  await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-games"]').style.setProperty('--sf-slot', ${JSON.stringify(v)}), true)`); await sleep(900);
  return true;
}
function judgeWhole(s, fail, tag, { target, committed, selectedOn = committed, marker = null }) {
  const bad = [];
  if (!s.found) bad.push(`the target card ${target} is not on the rail`);
  else if (!(s.whole >= 0.97)) bad.push(`the ${target === committed ? 'COMMITTED' : 'BROWSED'} card ${target} must stand whole inside the rail viewport (whole ${s.whole}, card ${JSON.stringify(s.card)} vs rail ${JSON.stringify(s.rail)}, scrollLeft ${s.sl}, slot ${s.slot})`);
  if (!s.open || s.hidden) bad.push(`the play place must be open and shown (open ${s.open}, hidden ${s.hidden})`);
  if (s.committed !== committed) bad.push(`aria-current must stay on ${committed} (${s.committed})`);
  if (!(s.selected.length === 1 && s.selected[0] === selectedOn)) bad.push(`aria-selected must be on ${selectedOn} (${JSON.stringify(s.selected)})`);
  if (marker === null ? s.browsedIds.length !== 0 : !(s.browsedIds.length === 1 && s.browsedIds[0] === marker)) bad.push(`the browse marker must be ${marker === null ? 'absent' : 'on ' + marker} (${JSON.stringify(s.browsedIds)})`);
  if (s.game !== committed) bad.push(`the persisted game changed: ${s.game}`);
  if (bad.length) { fail(`${tag}: ${bad.join('; ')} — ${brief(s)}`); return false; }
  return true;
}
const focusCommitted = `(() => { const k = document.querySelector('section[data-place="play"] [data-ob="play-game"][aria-current="true"]'); if (!k) return false; k.focus({ preventScroll: true }); return true; })()`;
/** leg (g) — the leaf ARRIVAL under a readiness browse (the P-FOCUS-BROWSE pending-leaf recipe on the warm client):
 * every ui/cardrail.js request of the next document is HELD, the rung-1 register mounts, the fixture is browsed
 * (previewCatalog + End), the held request is released and the leaf lands over the register — the browsed fixture
 * must stand whole after the arrival (on f819c812 the first present's instant snap to the committed keep won: the
 * reveal ran before decorateRail had stamped data-ob / data-game on the fresh leaf cards and found no card). */
async function arrivalLeg(c, fail, tag, { committed, url2 }) {
  const held = { ids: [] };
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/\/app\/ui\/cardrail\.js(\?|$)/.test(params.request.url)) { held.ids.push(params.requestId); return; } // held until the release below
    c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Network.setBypassServiceWorker', { bypass: true }).catch(() => {});
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*cardrail.js*' }] });
  await c.send('Page.navigate', { url: url2 });
  if (!(await boot(c))) { fail(`${tag} (g): the held-leaf boot never mounted play`); return; }
  const rung1 = await waitExpr(c, `document.querySelectorAll('section[data-place="play"] [data-ob="play-game"]').length > 0 && document.querySelector('section[data-place="play"] .ob-cardrail-card') === null`, 60 * SCALE, 150);
  await sleep(600);
  if (!rung1 || held.ids.length === 0) { fail(`${tag} (g) staging: the rung-1 register must mount under the held leaf (rung1 ${rung1}, held ${held.ids.length})`); held.ids.splice(0).forEach((id) => c.send('Fetch.continueRequest', { requestId: id }).catch(() => {})); return; }
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag} (g): previewCatalog must render the fixture button`); return; }
  await sleep(400);
  await c.eval(focusCommitted); await pressKey(c, 'End'); await sleep(800);
  const s0 = await c.eval(STATE('fixture_game'));
  if (s0.browsedIds[0] !== 'fixture_game' || s0.focus !== 'fixture_game' || s0.committed !== committed) { fail(`${tag} (g) staging: End must browse the fixture on the rung-1 register of a ${committed} boot — ${brief(s0)}`); return; }
  const ids = held.ids.splice(0);
  for (const id of ids) c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
  const landed = await waitExpr(c, `document.querySelector('section[data-place="play"] .ob-cardrail-card') !== null`, 60 * SCALE, 100);
  await sleep(1500);
  const s1 = await c.eval(STATE('fixture_game'));
  if (!landed) fail(`${tag} (g): the released leaf never landed (${ids.length} request(s) released)`);
  else judgeWhole(s1, fail, `${tag} (g) readiness browse after the leaf ARRIVAL`, { target: 'fixture_game', committed, marker: 'fixture_game' });
  await c.eval('window.__play.previewCatalog(null)');
  console.log(`${tag} (g): rung-1 End → ${brief(s0)}; arrival (released ${ids.length}, landed ${landed}) → ${brief(s1)}`);
}
/** leg (h) — KF-017 (#1155): an arrival (a re-entry, a place switch back) lands the COMMITTED card whole in its own
 * task, before any frame, and with no browse live a re-present never moves a user's pan (the header's (h)). The pan is staged with a real wheel so the card stands
 * outside the scrollport whether or not a browser keeps the offset across the hide; the in-task read rides the
 * re-entry's own evaluate (h1, h3, h4) or a click listener queued after the shell's own on the pill (h2), the
 * first-frame read a rAF queued in that same task. */
const RAIL_AT = `(() => { const r = document.querySelector('section[data-place="play"] [data-ob="play-games"]')
  ?.getBoundingClientRect(); return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`;
async function reentryLeg(c, fail, tag, { committed }) {
  const S = () => c.eval(STATE(committed));
  const s0 = await S();
  if (s0.absent) { fail(`${tag} (h): play rail absent`); return; }
  if (s0.committed !== committed || !(s0.whole >= 0.97)) { fail(`${tag} (h) staging: the committed card ${committed} must rest whole at boot — ${brief(s0)}`); return; }
  const blob = s0.blob;
  const rows = [];
  for (const [leg, label] of [['h1', 'the scripted re-entry (openShell + go, one task)'], ['h2', 'a real click on the reopen pill']]) {
    const at = await c.eval(RAIL_AT);
    if (at) await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 4000, deltaY: 0 });
    await sleep(900);
    const sP = await S();
    if (!(sP.whole !== null && sP.whole < 0.5) || sP.browsedIds.length !== 0) {
      fail(`${tag} (${leg}) staging: a wheel pan must move the committed card ${committed} out of the rail viewport without a browse — ${brief(sP)}`);
      continue;
    }
    await c.eval('window.__shell.quickPlay()');
    await waitExpr(c, '!window.__shell.isOpen()', 30 * SCALE, 100); await sleep(900);
    let inTask = null;
    if (leg === 'h1') {
      inTask = await c.eval(`(() => { window.__kfFirst = null; window.__shell.openShell({}); window.__shell.go('play');
        requestAnimationFrame(() => { window.__kfFirst = ${STATE(committed)}; }); return ${STATE(committed)}; })()`);
    } else {
      const pt = await c.eval(`(() => { const el = document.getElementById('ob-shell-open');
        if (!el || el.hidden || !el.getClientRects().length) return null;
        window.__kfFirst = null; window.__kfTask = null;
        el.addEventListener('click', () => { window.__kfTask = ${STATE(committed)};
          requestAnimationFrame(() => { window.__kfFirst = ${STATE(committed)}; }); }, { once: true });
        const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
      if (!pt) { fail(`${tag} (h2): the reopen pill #ob-shell-open must be on the page after Quick Play`); await c.eval(`window.__shell.openShell({ place: 'play' })`); await reopenSettled(c); continue; }
      await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      if (await waitExpr(c, 'window.__kfTask !== null', 50 * SCALE, 100)) inTask = await c.eval('window.__kfTask');
    }
    const first = (await waitExpr(c, 'window.__kfFirst !== null', 50 * SCALE, 100)) ? await c.eval('window.__kfFirst') : null;
    if (!inTask) fail(`${tag} (${leg}): ${label} — the in-task read never ran`);
    else judgeWhole(inTask, fail, `${tag} (${leg}) ${label}, in the re-entry's own task`, { target: committed, committed });
    if (!first) fail(`${tag} (${leg}): ${label} — the first-frame read never ran`);
    else judgeWhole(first, fail, `${tag} (${leg}) ${label}, at the first frame`, { target: committed, committed });
    await reopenSettled(c);
    const sZ = await S();
    judgeWhole(sZ, fail, `${tag} (${leg}) ${label}, after the settle`, { target: committed, committed });
    rows.push(`(${leg}) pan → sl ${sP.sl} whole ${sP.whole}; task → sl ${inTask?.sl} whole ${inTask?.whole}; first frame → sl ${first?.sl} whole ${first?.whole}; settled → sl ${sZ.sl} whole ${sZ.whole}`);
  }
  { // (h3) with no browse live, a re-present of play while it is shown is not an arrival: the user's pan stands
    const at = await c.eval(RAIL_AT);
    if (at) await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 4000, deltaY: 0 });
    await sleep(900);
    const sP = await S();
    if (!(sP.whole !== null && sP.whole < 0.5) || sP.browsedIds.length !== 0 || !sP.open) {
      fail(`${tag} (h3) staging: a wheel pan must move the committed card ${committed} out of the open rail without a browse — ${brief(sP)}`);
    } else {
      const inTask = await c.eval(`(() => { window.__shell.go('play'); return ${STATE(committed)}; })()`);
      await sleep(900);
      const sZ = await S();
      for (const [when, s] of [['in the re-present\'s own task', inTask], ['after a settle', sZ]]) {
        if (Math.abs(s.sl - sP.sl) > 1 || s.whole === null || !(s.whole < 0.5)) {
          fail(`${tag} (h3) a re-present of play while it is shown (go('play')), ${when}: the rail must stay where the user panned it (scrollLeft ${sP.sl} → ${s.sl}, whole ${sP.whole} → ${s.whole}) — ${brief(s)}`);
        }
      }
      rows.push(`(h3) pan → sl ${sP.sl} whole ${sP.whole}; re-present task → sl ${inTask.sl}; settled → sl ${sZ.sl} whole ${sZ.whole}`);
    }
  }
  { // (h4) a place switch away and back is an arrival: the committed card whole in the return's own task
    const at = await c.eval(RAIL_AT);
    if (at) await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: 4000, deltaY: 0 });
    await sleep(900);
    const sP = await S();
    const away = await c.eval(`(() => { window.__shell.go('practice'); return window.__shell.place(); })()`);
    if (!(sP.whole !== null && sP.whole < 0.5) || sP.browsedIds.length !== 0 || !sP.open || away !== 'practice') {
      fail(`${tag} (h4) staging: a wheel pan must move the committed card ${committed} out of the open rail without a browse, then go('practice') must present practice (${away}) — ${brief(sP)}`);
    } else {
      await sleep(900); // practice presented: the play section is hidden for these frames
      const inTask = await c.eval(`(() => { window.__kfFirst = null; window.__shell.go('play');
        requestAnimationFrame(() => { window.__kfFirst = ${STATE(committed)}; }); return ${STATE(committed)}; })()`);
      const first = (await waitExpr(c, 'window.__kfFirst !== null', 50 * SCALE, 100)) ? await c.eval('window.__kfFirst') : null;
      const label = 'a place switch away and back (practice → play)';
      judgeWhole(inTask, fail, `${tag} (h4) ${label}, in the return's own task`, { target: committed, committed });
      if (!first) fail(`${tag} (h4): ${label} — the first-frame read never ran`);
      else judgeWhole(first, fail, `${tag} (h4) ${label}, at the first frame`, { target: committed, committed });
      await reopenSettled(c);
      const sZ = await S();
      judgeWhole(sZ, fail, `${tag} (h4) ${label}, after the settle`, { target: committed, committed });
      rows.push(`(h4) pan → sl ${sP.sl} whole ${sP.whole}; return task → sl ${inTask.sl} whole ${inTask.whole}; first frame → sl ${first?.sl} whole ${first?.whole}; settled → sl ${sZ.sl} whole ${sZ.whole}`);
    }
  }
  if ((await S()).blob !== blob) fail(`${tag} (h): the ob-settings-v1 blob must be byte-unchanged (law 5)`);
  console.log(`${tag} (h): boot sl ${s0.sl} whole ${s0.whole} leaf ${s0.leaf}; ${rows.join('; ')}`);
}
/** leg (f′) — #1156: an ARRIVAL under a live PLAYABLE browse lands the BROWSED card whole in its own task (the
 * header's (f′)). The straddle is staged with a real wheel back to the rail's start, so the card stands across the
 * scrollport edge whether or not a browser keeps the offset across the hide; the reads ride the re-entry's own
 * evaluate (in the task) and a rAF queued in that same task (the first frame), as in (h1). */
async function browseArrivalLeg(c, fail, tag, { committed, browse, coarse = false }) {
  const S = () => c.eval(STATE(browse));
  const s0 = await c.eval(STATE(committed));
  if (s0.absent) { fail(`${tag} (f′): play rail absent`); return; }
  if (s0.committed !== committed || !(s0.whole >= 0.97)) { fail(`${tag} (f′) staging: the committed card ${committed} must rest whole at boot — ${brief(s0)}`); return; }
  const blob = s0.blob;
  await c.eval(focusCommitted); await pressKey(c, 'ArrowRight'); await sleep(800);
  const sB = await S();
  if (!(sB.selected.length === 1 && sB.selected[0] === browse && sB.whole >= 0.97)) {
    fail(`${tag} (f′) staging: ArrowRight from ${committed} must browse ${browse} (index 1) whole onto the leaf's aria-selected — ${brief(sB)}`);
    return;
  }
  if (coarse) {
    // unlike the fine register's wheel, this programmatic pan does not cancel play's key-rest watch, which reveals the
    // browsed card whole once the rail rests (3 frames + 150 ms) and would undo the straddle: rest longer first (review P2)
    const rest = await c.eval(RAIL_REST);
    if (!rest?.settled) { fail(`${tag} (f′) UNJUDGEABLE: the rail never rested after the ArrowRight — ${JSON.stringify(rest)}`); return; }
    await c.eval(`(document.querySelector('section[data-place="play"] [data-ob="play-games"]').scrollTo({ left: 0, behavior: 'instant' }), true)`);
  } else {
    const at = await c.eval(RAIL_AT);
    if (at) await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: at.x, y: at.y, deltaX: -4000, deltaY: 0 });
  }
  await sleep(900);
  const sP = await S();
  if (!(sP.sl <= 1 && sP.whole > 0 && sP.whole < 0.97 && sP.selected.length === 1 && sP.selected[0] === browse && sP.browsedIds.length === 0)) {
    fail(`${tag} (f′) UNJUDGEABLE: a wheel back to the rail's start must leave the browsed ${browse} straddling the scrollport edge (0 < whole < 0.97), still aria-selected, with no marker — ${brief(sP)}`);
    return;
  }
  const exited = await c.eval('window.__shell.quickPlay()');
  if (exited !== true || !(await waitExpr(c, '!window.__shell.isOpen()', 30 * SCALE, 100))) {
    fail(`${tag} (f′) UNJUDGEABLE: Quick Play must exit the shell (quickPlay ${exited}, open ${await c.eval('window.__shell.isOpen()')})`);
    return;
  }
  await sleep(900);
  const inTask = await c.eval(`(() => { window.__kfFirst = null; window.__shell.openShell({}); window.__shell.go('play');
    requestAnimationFrame(() => { window.__kfFirst = ${STATE(browse)}; }); return ${STATE(browse)}; })()`);
  const first = (await waitExpr(c, 'window.__kfFirst !== null', 50 * SCALE, 100)) ? await c.eval('window.__kfFirst') : null;
  const label = 'playable browse at index 1 after Quick Play → reopen Play';
  const want = { target: browse, committed, selectedOn: browse };
  judgeWhole(inTask, fail, `${tag} (f′) ${label}, in the re-entry's own task`, want);
  if (!first) fail(`${tag} (f′): ${label} — the first-frame read never ran`);
  else judgeWhole(first, fail, `${tag} (f′) ${label}, at the first frame`, want);
  await reopenSettled(c);
  const sZ = await S();
  judgeWhole(sZ, fail, `${tag} (f′) ${label}, after the settle`, want);
  if (sZ.blob !== blob) fail(`${tag} (f′): the ob-settings-v1 blob must be byte-unchanged (law 5)`);
  console.log(`${tag} (f′): boot sl ${s0.sl}; browse → sl ${sB.sl} whole ${sB.whole}; wheel → sl ${sP.sl} whole ${sP.whole} card ${JSON.stringify(sP.card)} rail ${JSON.stringify(sP.rail)}; task → sl ${inTask.sl} whole ${inTask.whole}; first frame → sl ${first?.sl} whole ${first?.whole}; settled → sl ${sZ.sl} whole ${sZ.whole}`);
}
/** legs (i-esc) and (i) — #1160 (the header's (i-esc) / (i)): a keyboard walk to the target, a real click on its
 * resting centre raises the switch confirm; Escape declines, a real click on the accept switches. */
const CARD_AT = (id) => `new Promise((res) => { const g = document.querySelector('section[data-place="play"] [data-ob="play-games"]');
  const k = g?.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(id)}]'); if (!k) { res(null); return; } const a = k.getBoundingClientRect();
  requestAnimationFrame(() => requestAnimationFrame(() => { const b = k.getBoundingClientRect();
    res(Math.abs(a.left - b.left) < 0.5 && b.width > 0 ? { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } : null); })); })`;
/** page-side rest: the rail's scrollLeft unchanged over 6 frames and no scroll event for 300 ms, longer than play's
 * key-rest watch (3 frames + 150 ms), so a watch still alive has fired (and its reveal has moved the rail) by then;
 * capped at 3.5 s, past the watch's own 3 s give-up */
const RAIL_REST = `new Promise((res) => {
  const g = document.querySelector('section[data-place="play"] [data-ob="play-games"]');
  if (!g) { res({ settled: false, why: 'no rail' }); return; }
  let last = g.scrollLeft, same = 0, lastScroll = performance.now(); const t0 = lastScroll;
  const on = () => { lastScroll = performance.now(); };
  g.addEventListener('scroll', on, { passive: true });
  const tick = () => { const sl = g.scrollLeft; same = sl === last ? same + 1 : 0; last = sl; const now = performance.now();
    const settled = same >= 6 && now - lastScroll >= 300;
    if (settled || now - t0 > 3500) { g.removeEventListener('scroll', on); res({ settled, sl: Math.round(sl * 10) / 10, ms: Math.round(now - t0) }); return; }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick); })`;
const CONFIRM_UP = `!!document.querySelector('[data-ob="confirm"] [data-ob="confirm-accept"]')`;
const DETAILS_ON = `document.querySelector('section[data-place="play"] [data-ob="play-details-body"]')?.dataset.game ?? null`;
async function mouseClick(c, { x, y }) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await sleep(40);
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
}
/** a keyboard walk of `steps` ArrowRight from the committed card, then a real click on the target's resting centre;
 * resolves the resting state once the switch confirm is up (600 ms more: past the continuation guard's 500 ms), or null */
async function walkAndPick(c, fail, tag, { committed, target, steps }) {
  await c.eval(focusCommitted); await sleep(300);
  for (let i = 0; i < steps; i++) { await pressKey(c, 'ArrowRight'); await sleep(250); }
  await sleep(800);
  const s = await c.eval(STATE(target));
  if (!(s.selected.length === 1 && s.selected[0] === target && s.whole >= 0.97 && s.committed === committed && s.game === committed)) {
    fail(`${tag} staging: ${steps} ArrowRight from ${committed} must browse ${target} whole onto aria-selected — ${brief(s)}`); return null;
  }
  const at = await c.eval(CARD_AT(target));
  if (!at) { fail(`${tag} staging: ${target} has no resting rect`); return null; }
  await mouseClick(c, at);
  if (!(await waitExpr(c, CONFIRM_UP, 60 * SCALE, 100))) { fail(`${tag}: no switch confirm after the click on ${target}`); return null; }
  await sleep(600);
  return s;
}
async function escDeclineLeg(c, fail, tag, { committed, target }) {
  const s0 = await walkAndPick(c, fail, `${tag} (i-esc)`, { committed, target, steps: 2 });
  if (!s0) return;
  // the focusin trail of the decline: the restore-before-verdict order shows as the target between two committed foci
  await c.eval(`(() => { const tr = window.__iesc = []; const on = (e) => { const t = e.target;
    tr.push(t?.closest?.('[data-ob="play-game"]')?.dataset.game ?? t?.dataset?.ob ?? t?.tagName ?? null); };
    document.addEventListener('focusin', on, true); window.__iescOff = () => document.removeEventListener('focusin', on, true); return true; })()`);
  await pressKey(c, 'Escape');
  if (!(await waitExpr(c, `!document.querySelector('[data-ob="confirm"]')`, 50 * SCALE, 100))) {
    fail(`${tag} (i-esc) UNJUDGEABLE: the confirm must close on Escape`);
    return;
  }
  await sleep(900);
  const trail = await c.eval('(window.__iescOff?.(), window.__iesc ?? null)');
  const s = await c.eval(STATE(committed));
  const body = await c.eval(DETAILS_ON);
  const bad = [];
  if (s.game !== committed) bad.push(`the game changed (${s.game})`);
  if (s.focus !== committed) bad.push(`focus on ${s.focus}, not the committed card ${committed}`);
  if (!(s.selected.length === 1 && s.selected[0] === committed)) bad.push(`aria-selected ${JSON.stringify(s.selected)}, not only ${committed}`);
  if (body !== committed) bad.push(`Details reads ${body}`);
  if (!(s.whole >= 0.97)) bad.push(`the committed card is not whole (whole ${s.whole})`);
  if (bad.length) fail(`${tag} (i-esc) an Escape decline of ${committed} → ${target}: ${bad.join('; ')} — ${brief(s)}`);
  console.log(`${tag} (i-esc): walk → sl ${s0.sl}; after Escape → ${brief(s)} details ${body}; focusin trail ${JSON.stringify(trail)}`);
}
/** leg (i-home) — #1160 review P1: only the confirm's own close-time restore is held. An accepted switch whose progress
 * overlay never comes (its leaf held unanswered past settings.js's 250 ms wait) leaves the hall live while the switch
 * applies (every snooker transport request held 3 s); a Home press then lands on the committed card, and that browse
 * must stand: focus, aria-selected and Details all on the committed card (the held-restore copy that caught every focus
 * on it moved focus back to the target, splitting the selection from Enter's card). It runs in its own boot: it
 * switches the game. */
async function homeDuringSwitchLeg(c, fail, tag, { committed, target }) {
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/switchprogress\.js/.test(params.request.url)) return; // held unanswered: the switch runs without its overlay
    if (/snktransport/.test(params.request.url)) setTimeout(() => { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); }, 3000);
    else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Network.enable');
  await c.send('Network.setCacheDisabled', { cacheDisabled: true });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*switchprogress.js*' }, { urlPattern: '*snktransport*' }] });
  const s0 = await walkAndPick(c, fail, `${tag} (i-home)`, { committed, target, steps: 2 });
  if (!s0) return;
  const acc = await c.eval(`(() => { const b = document.querySelector('[data-ob="confirm"] [data-ob="confirm-accept"]'); const r = b?.getBoundingClientRect();
    return r && r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null; })()`);
  if (!acc) { fail(`${tag} (i-home): the confirm's accept button has no rect`); return; }
  await mouseClick(c, acc);
  if (!(await waitExpr(c, `!document.querySelector('[data-ob="confirm"]')`, 50 * SCALE, 100))) {
    fail(`${tag} (i-home) UNJUDGEABLE: the confirm must close on the accept`);
    return;
  }
  await sleep(500); // the exit motion and the restore
  // the switch is pending while the hall stays open: play's verdict (and the exit) waits for the held snooker build
  const pre = await c.eval(`(() => ({ overlay: !!document.querySelector('[data-ob="switch-progress"]'), open: window.__shell.isOpen() }))()`);
  const sA = await c.eval(STATE(target));
  if (pre.overlay || !pre.open || sA.focus !== target) {
    fail(`${tag} (i-home) UNJUDGEABLE: after the accept the hall must stay open with no switch overlay (the switch pending) and the restore held on ${target} — ${JSON.stringify(pre)} ${brief(sA)}`);
    return;
  }
  await pressKey(c, 'Home');
  await sleep(300);
  const s = await c.eval(STATE(committed));
  const body = await c.eval(DETAILS_ON);
  if (!(await c.eval('window.__shell.isOpen()'))) { fail(`${tag} (i-home) UNJUDGEABLE: the switch applied before the Home press could be read`); return; }
  const bad = [];
  if (s.focus !== committed) bad.push(`focus on ${s.focus}, not ${committed}`);
  if (!(s.selected.length === 1 && s.selected[0] === committed)) bad.push(`aria-selected ${JSON.stringify(s.selected)}, not only ${committed}`);
  if (body !== committed) bad.push(`Details reads ${body}`);
  if (bad.length) fail(`${tag} (i-home) #1160: a Home press during a pending switch with no overlay must browse ${committed}: ${bad.join('; ')} — ${brief(s)}`);
  console.log(`${tag} (i-home): walk → sl ${s0.sl}; after the accept focus ${sA.focus}; after Home → ${brief(s)} details ${body}`);
}
async function acceptHoldLeg(c, fail, tag, { committed, target }) {
  const s0 = await walkAndPick(c, fail, `${tag} (i)`, { committed, target, steps: 2 });
  if (!s0) return;
  const arm = await c.eval(`(() => {
    const g = document.querySelector('section[data-place="play"] [data-ob="play-games"]');
    const shell = document.getElementById('ob-shell');
    const rail = [...g.querySelectorAll('[data-ob="play-game"]')].map((x) => x.dataset.game);
    const rec = window.__i1160 = { recs: [], focusins: [], done: false, rail };
    const read = (kind) => { const k = g.querySelector('[data-ob="play-game"][data-game=${JSON.stringify(target)}]');
      const gr = g.getBoundingClientRect(), r = k ? k.getBoundingClientRect() : null;
      const whole = r && r.width > 0 ? Math.round(Math.max(0, Math.min(r.right, gr.right) - Math.max(r.left, gr.left)) / r.width * 100) / 100 : null;
      const ae = document.activeElement;
      return { kind, t: Math.round(performance.now()), sl: Math.round(g.scrollLeft * 10) / 10, whole,
        sel: [...g.querySelectorAll('[data-ob="play-game"][aria-selected="true"]')].map((x) => x.dataset.game),
        focus: ae?.closest?.('[data-ob="play-game"]')?.dataset.game ?? ae?.dataset?.ob ?? ae?.tagName ?? null,
        shown: !!shell && !shell.hidden && shell.getClientRects().length > 0, open: window.__shell.isOpen() }; };
    const onScroll = (e) => rec.recs.push(read(e.type));
    const onFocus = (e) => { const t = e.target; rec.focusins.push({ t: Math.round(performance.now()),
      id: t?.closest?.('[data-ob="play-game"]')?.dataset.game ?? t?.dataset?.ob ?? t?.tagName ?? null }); };
    g.addEventListener('scroll', onScroll); g.addEventListener('scrollend', onScroll);
    document.addEventListener('focusin', onFocus, true);
    const tick = () => { const r = read('frame'); rec.recs.push(r);
      if (!r.shown) { rec.done = true; g.removeEventListener('scroll', onScroll); g.removeEventListener('scrollend', onScroll);
        document.removeEventListener('focusin', onFocus, true); return; }
      requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return read('arm'); })()`);
  if (!(arm.sel.length === 1 && arm.sel[0] === target && arm.whole >= 0.97 && arm.focus === 'confirm-cancel')) {
    fail(`${tag} (i) UNJUDGEABLE: the arm read must show ${target} aria-selected and whole with focus on the confirm's Cancel — ${JSON.stringify(arm)}`);
    return;
  }
  const acc = await c.eval(`(() => { const b = document.querySelector('[data-ob="confirm"] [data-ob="confirm-accept"]'); const r = b?.getBoundingClientRect();
    return r && r.width > 0 ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null; })()`);
  if (!acc) { fail(`${tag} (i): the confirm's accept button has no rect`); return; }
  // The race this leg judges: the confirm's close-time restore lands about 0.2 s after the accept, while the switch's
  // snooker table build can block the main thread from about 0.18 s and hide the shell before the restore ever runs (no
  // defect to judge then). Hold every snooker transport request 3 s so the build waits and the restore lands first
  // (the KF-017 / (g) staging idiom; the switch still completes, about 6 s later).
  c.onEvent((method, params) => {
    if (method !== 'Fetch.requestPaused') return;
    if (/snktransport/.test(params.request.url)) setTimeout(() => { c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {}); }, 3000);
    else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
  });
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*snktransport*' }] });
  await mouseClick(c, acc);
  const settled = await waitExpr(c, `window.__i1160?.done === true && window.__settings.get().game === ${JSON.stringify(target)} && !window.__shell.isOpen()`, 400 * SCALE, 100);
  await c.send('Fetch.disable').catch(() => {});
  const rec = await c.eval('window.__i1160');
  if (!settled) { fail(`${tag} (i): the accepted switch ${committed} → ${target} never reached the table with the recorder done — ${JSON.stringify({ n: rec?.recs?.length, last: rec?.recs?.at?.(-1), focusins: rec?.focusins })}`); return; }
  const restoreAt = rec.focusins.find((f) => f.id === committed)?.t ?? null;
  if (restoreAt === null) { fail(`${tag} (i) UNJUDGEABLE: the confirm's close-time restore never reached a rail card before the shell exit — focusin trail ${JSON.stringify(rec.focusins.map((f) => f.id))}`); return; }
  const judged = rec.recs.filter((r) => r.kind !== 'arm' && r.shown && r.open);
  if (!judged.some((r) => r.t > restoreAt)) { fail(`${tag} (i) UNJUDGEABLE: no frame, scroll or scrollend was recorded after the restore and before the shell exit`); return; }
  const badRecs = judged.filter((r) => Math.abs(r.sl - arm.sl) > 1 || !(r.whole >= 0.97) || !(r.sel.length === 1 && r.sel[0] === target));
  if (judged.length === 0) fail(`${tag} (i) UNJUDGEABLE: no frame, scroll or scrollend was recorded between the accept and the shell's exit`);
  else if (badRecs.length) {
    const b = badRecs[0];
    fail(`${tag} (i) #1160 accepted switch ${committed} → ${target}: the rail must hold the newly committed card ${target} from the accept to the shell exit — ${badRecs.length}/${judged.length} records off, first +${b.t - judged[0].t} ms ${b.kind}: scrollLeft ${arm.sl} → ${b.sl}, ${target} whole ${b.whole}, aria-selected ${JSON.stringify(b.sel)}, focus ${b.focus}`);
  }
  const railFocus = rec.focusins.filter((f) => rec.rail.includes(f.id));
  const lastRail = railFocus.at(-1)?.id ?? null;
  if (lastRail !== target) fail(`${tag} (i) #1160: the last rail focus before the shell exit must be the newly committed card ${target} (${lastRail}) — focusin trail ${JSON.stringify(rec.focusins.map((f) => f.id))}`);
  console.log(`${tag} (i): arm sl ${arm.sl} whole ${arm.whole}; ${judged.length} judged records (${badRecs.length} off); focusin trail ${JSON.stringify(rec.focusins.map((f) => f.id))}`);
}
async function register(c, fail, tag, { coarse, committed }) {
  const S = (id) => c.eval(STATE(id));
  const s0 = await S(committed);
  if (s0.absent) { fail(`${tag}: play rail absent`); return; }
  if (!s0.leaf) { console.log(`${tag}: rung-1 register (no cardrail leaf) — the slot-restore law is judged on the leaf; skipped`); return; }
  if (s0.committed !== committed) { fail(`${tag}: staging — the committed card must be ${committed} (${s0.committed})`); return; }
  const blob = s0.blob;
  if (!(s0.whole >= 0.97)) fail(`${tag}: staging — the committed card must rest whole at boot: ${brief(s0)}`);
  // (a) Quick Play → reopen Play, no browse
  await quickPlayReopen(c, fail, tag);
  const sA = await S(committed);
  judgeWhole(sA, fail, `${tag} (a) after Quick Play → reopen Play`, { target: committed, committed });
  // (b) two more cycles: whole, scrollLeft stable
  const cycles = [];
  for (let i = 2; i <= 3; i++) {
    await quickPlayReopen(c, fail, tag);
    const s = await S(committed); cycles.push(s.sl);
    if (judgeWhole(s, fail, `${tag} (b) reopen cycle ${i}`, { target: committed, committed }) && Math.abs(s.sl - sA.sl) > 1)
      fail(`${tag} (b) reopen cycle ${i}: scrollLeft must be stable across reopen cycles (${sA.sl} → ${s.sl})`);
  }
  // (c) the REAL reopen pill
  await pillReenter(c, fail, tag, coarse);
  const sC = await S(committed);
  judgeWhole(sC, fail, `${tag} (c) after Quick Play → the reopen pill`, { target: committed, committed });
  // (d) the synthetic collapse, no browse
  const synth = await syntheticSlot(c, fail, tag);
  const sD = await S(committed);
  if (synth) judgeWhole(sD, fail, `${tag} (d) after a synthetic --sf-slot 0px → restore`, { target: committed, committed });
  // (e) under a live READINESS browse (the r5 law): the browsed fixture whole, the marker kept, the leaf's selection unchanged
  if (!(await c.eval(`window.__play.previewCatalog(${FIX})`))) { fail(`${tag}: previewCatalog must render the fixture card`); return; }
  await sleep(300);
  await c.eval(focusCommitted);
  await pressKey(c, 'End'); await sleep(700);
  const sE0 = await S('fixture_game');
  if (!judgeWhole(sE0, fail, `${tag} (e) staging after End`, { target: 'fixture_game', committed, marker: 'fixture_game' })) { await c.eval('window.__play.previewCatalog(null)'); return; }
  if (synth) { await syntheticSlot(c, fail, tag); judgeWhole(await S('fixture_game'), fail, `${tag} (e) readiness browse after a synthetic slot 0px → restore`, { target: 'fixture_game', committed, marker: 'fixture_game' }); }
  await quickPlayReopen(c, fail, tag);
  const sE = await S('fixture_game');
  judgeWhole(sE, fail, `${tag} (e) readiness browse after Quick Play → reopen Play`, { target: 'fixture_game', committed, marker: 'fixture_game' });
  await c.eval('window.__play.previewCatalog(null)'); await sleep(300);
  // (f) under a live PLAYABLE browse: ArrowLeft from the committed card (the last playable; the previous card is playable)
  await c.eval(focusCommitted);
  await pressKey(c, 'ArrowLeft'); await sleep(800);
  const left = (await S(committed)).selected[0] ?? null;
  if (!left || left === committed) fail(`${tag} (f) staging: ArrowLeft must browse the previous PLAYABLE card onto the leaf's aria-selected (${left})`);
  else {
    if (synth) { await syntheticSlot(c, fail, tag); judgeWhole(await S(left), fail, `${tag} (f) playable browse after a synthetic slot 0px → restore`, { target: left, committed, selectedOn: left }); }
    await quickPlayReopen(c, fail, tag);
    judgeWhole(await S(left), fail, `${tag} (f) playable browse after Quick Play → reopen Play`, { target: left, committed, selectedOn: left });
  }
  const sZ = await S(committed);
  if (sZ.blob !== blob) fail(`${tag}: the ob-settings-v1 blob must be byte-unchanged (law 5)`);
  console.log(`${tag}: boot sl ${s0.sl} whole ${s0.whole}; (a) reopen → sl ${sA.sl} whole ${sA.whole} card ${JSON.stringify(sA.card)} rail ${JSON.stringify(sA.rail)} slot ${sA.slot}; (b) cycles sl ${JSON.stringify(cycles)}; (c) pill → sl ${sC.sl} whole ${sC.whole}; (d) synthetic → sl ${sD.sl} whole ${sD.whole}; (e) readiness reopen → sl ${sE.sl} whole ${sE.whole} browsed ${JSON.stringify(sE.browsedIds)}; (f) playable ${left}`);
}
async function gate(c, errs, tag, fail) {
  await sleep(200);
  if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
  if (errs.length) fail(`${tag}: console errors: ${errs.slice(0, 4).join(' | ')}`);
  errs.length = 0;
}
/** boot with `committed` persisted (the blob written on the warm document, then a reload) */
async function bootWith(c, committed) {
  if (!(await boot(c))) return false;
  await c.eval(`(() => { const s = JSON.parse(localStorage.getItem('ob-settings-v1') || '{}'); s.game = ${JSON.stringify(committed)}; s.language = 'en'; localStorage.setItem('ob-settings-v1', JSON.stringify(s)); location.reload(); return true; })()`);
  await sleep(500);
  return boot(c);
}
export async function armPSlotRestore({ PORT, CDP_PORT, fail }) {
  const url = (q) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&${q}`;
  for (const [w, h, committed] of [[844, 390, 'ten_ball'], [844, 390, 'one_pocket'], [667, 375, 'ten_ball']]) { // ---- coarse (phone) rows
    const tag = `P-SLOT-RESTORE ${w} ${committed}`;
    const errs = [];
    const c = await launchPhone(url(`u=slotrestore${w}${committed}`), { cdpPort: CDP_PORT + 4, width: w, height: h });
    watchErrors(c, errs);
    if (!(await bootWith(c, committed))) fail(`${tag}: the phone boot never mounted play`);
    else {
      await register(c, fail, tag, { coarse: true, committed });
      if (w === 844 && committed === 'ten_ball') await arrivalLeg(c, fail, tag, { committed, url2: url(`u=slotrestorearrival${w}`) });
      await gate(c, errs, tag, fail);
    }
    c.close();
    await sleep(400);
  }
  { // ---- coarse 844x390, nine_ball committed: #1156's arrival under a live playable browse (f′), the slot path
    const tag = 'P-SLOT-RESTORE 844 nine_ball';
    const errs = [];
    const c = await launchPhone(url('u=slotrestore844nb'), { cdpPort: CDP_PORT + 4, width: 844, height: 390 });
    watchErrors(c, errs);
    if (!(await bootWith(c, 'nine_ball'))) fail(`${tag}: the phone boot never mounted play`);
    else {
      await browseArrivalLeg(c, fail, tag, { committed: 'nine_ball', browse: 'eight_ball', coarse: true });
      await gate(c, errs, tag, fail);
    }
    c.close();
    await sleep(400);
  }
  { // ---- desktop 1024x768 (fine)
    const tag = 'P-SLOT-RESTORE 1024 ten_ball';
    const errs = [];
    const c = await launchChrome(url('u=slotrestore1024'), { port: CDP_PORT, width: 1024, height: 768, tool: false });
    watchErrors(c, errs);
    if (!(await bootWith(c, 'ten_ball'))) fail(`${tag}: the obshell boot never mounted play`);
    else {
      await register(c, fail, tag, { coarse: false, committed: 'ten_ball' });
      await arrivalLeg(c, fail, tag, { committed: 'ten_ball', url2: url('u=slotrestorearrival1024') });
      await gate(c, errs, tag, fail);
    }
    c.close();
    await sleep(400);
  }
  { // ---- desktop 1280x800 (fine): the KF-017 re-entry leg (h)
    const tag = 'P-SLOT-RESTORE 1280 one_pocket';
    const errs = [];
    const c = await launchChrome(url('u=slotrestore1280'), { port: CDP_PORT, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    if (!(await bootWith(c, 'one_pocket'))) fail(`${tag}: the obshell boot never mounted play`);
    else {
      await reentryLeg(c, fail, tag, { committed: 'one_pocket' });
      await gate(c, errs, tag, fail);
    }
    c.close();
    await sleep(400);
  }
  { // ---- desktop 1280x800 (fine), nine_ball committed: #1156's arrival under a live playable browse (f′), #1160 (i-esc) and (i)
    const tag = 'P-SLOT-RESTORE 1280 nine_ball';
    const errs = [];
    const c = await launchChrome(url('u=slotrestore1280nb'), { port: CDP_PORT, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    if (!(await bootWith(c, 'nine_ball'))) fail(`${tag}: the obshell boot never mounted play`);
    else {
      await browseArrivalLeg(c, fail, tag, { committed: 'nine_ball', browse: 'eight_ball' });
      await escDeclineLeg(c, fail, tag, { committed: 'nine_ball', target: 'snooker' });
      await acceptHoldLeg(c, fail, tag, { committed: 'nine_ball', target: 'snooker' }); // last: it switches the game
      await gate(c, errs, tag, fail);
    }
    c.close();
  }
  { // ---- desktop 1280x800 (fine), nine_ball committed: #1160 (i-home) in its own boot (it switches the game)
    const tag = 'P-SLOT-RESTORE 1280 nine_ball';
    const errs = [];
    const c = await launchChrome(url('u=slotrestore1280home'), { port: CDP_PORT, width: 1280, height: 800, tool: false });
    watchErrors(c, errs);
    if (!(await bootWith(c, 'nine_ball'))) fail(`${tag} (i-home): the obshell boot never mounted play`);
    else {
      await homeDuringSwitchLeg(c, fail, tag, { committed: 'nine_ball', target: 'snooker' });
      await gate(c, errs, tag, fail);
    }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports armPSlotRestore above) ----
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8600);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8615);
  let n = 0;
  const fail = (msg) => { console.error('E2E-PLAY FAIL:', msg); process.exitCode = 1; n += 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armPSlotRestore({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? `E2E-PLAY-SLOT-RESTORE FAIL (${n})` : 'E2E-PLAY-SLOT-RESTORE PASS');
}
