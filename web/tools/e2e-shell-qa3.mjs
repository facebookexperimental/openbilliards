// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-qa3.mjs — S4 journey-QA round 3 shell arms, a LEG MODULE of
// e2e-shell.mjs (the e2e-userboot-3g precedent): the suite calls
// runQa3ShellArms with its band; standalone (`node web/tools/e2e-shell-qa3.mjs`
// under run-gate) runs the same arms in isolation for red/green proofs.
//
//   711. Hall over a FINISHED shared replay (GH-711): a recipient boots a
//        link that ends on a pending decision, waits for the finished bar,
//        REAL-presses the pill. The in-shell prompt must render its LOCKED
//        face — the question, NO answer buttons ([data-choice]), the reason
//        line, ONE primary "Continue from here" — and a REAL press on that
//        primary resolves the replay KEEPING the shared position: hall
//        closed, replay.active false, pendingDecision still set, the hud
//        decision dialog presented with hit-testable answers, hash wiped,
//        every ball where the replay left it. Desktop 1440x900 + phone
//        844x390 coarse. Red on the pre-fix bytes: three enabled answers
//        mounted under the lock (a REAL press on one changes nothing).
//   713. Post-activation tap shield (GH-713; ledger #686 L1): phone 844x390
//        de heyball + 667x375 fr snooker, decision pending, hall at
//        Equipment with the `balls` station selected so the table-bed prop
//        sits behind the first answer (`__shell.propAt(pt) === 'play'`, the
//        verifier's precondition). Two REAL touch taps 90 ms apart: the
//        first at the first answer's centre — the decision resolves, the
//        prompt leaves — and the SECOND one on the table bed beside it, at
//        the answer's height right of the atelier rail (card 32 v2's tall
//        phone rail rises into the band the prompt vacates, so the answer's
//        own point lies on a rail card once the prompt is gone; the shield
//        is time-only by design, so the drifted continuation is its case):
//        it navigates nowhere — place equipment, station balls, hall open.
//        Control: a deliberate tap at that bed point >= 1 s later (no
//        chrome activation between) still navigates to Play (the prop
//        mapping is lawful; the shield is short); the canvas must be what
//        sits under the point by then, else the staging is void. Red on the
//        pre-fix bytes: place equipment -> play, station -> null. #1130: the taps are
//        STAGED 90 ms apart on the input clock (explicit CDP timestamps), and
//        the gap is judged on the page's own stamps (tap 2's touchstart minus
//        the answering click); a measured gap at or past the shield window is
//        INVALID and staged again (<= 3 tries, never a pass). The arm assumes
//        the batch-4 continuation guard (event stamps, f78aa441); on a shell
//        whose shield reads the handling clock it reports that defect under
//        load.
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';

// one static server + CDP endpoints CDP_PORT (desktop) / CDP_PORT + 1 (phone)
export const PORT_INVENTORY = { http: 1, cdp: 2 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-shell imports runQa3ShellArms; standalone this leg runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const J = (o) => JSON.stringify(o);
async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitFor(c, expr, tries = 60, ms = 100) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
}
const centre = (c, sel) => c.eval(`(() => {
  const el = document.querySelector(${J(sel)});
  if (!el || !el.getClientRects().length) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
async function tapAt(c, pt) {
  await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
  await sleep(40);
  await touchEnd(c);
}
async function clickAt(c, pt) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent',
    { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
}
function watchErrors(c, sink) {
  c.onEvent((method, params) => {
    if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
      sink.push(params.args.map((a) => a.value ?? a.description).join(' '));
    } else if (method === 'Runtime.exceptionThrown') {
      sink.push(params.exceptionDetails.exception?.description
        ?? params.exceptionDetails.text);
    }
  });
}
const gateErrors = async (c, sink, tag, fail) => {
  if (await c.eval('__test.errors.length').catch(() => 0)) {
    fail(`${tag}: app errors: ` + J(await c.eval('__test.errors')));
  }
  if (sink.length) fail(`${tag}: console errors: ` + sink.slice(0, 3).join(' | '));
};
/** Raise a heyball `illegal_break` (a soft straight break — one shot, no
 * randomness at seed 1) or a snooker `foul_and_a_miss` (break, then a
 * no-contact shot). Returns the pending kind or null. */
async function raiseDecision(c, game) {
  const pend = () => c.eval(`window.__rules?.matchState?.()?.pendingDecision?.kind ?? null`).catch(() => null);
  if (game === 'heyball') {
    if (await c.eval(`__test.state()`) === 'BALL_IN_HAND') await c.eval(`__test.placeCue(0, -0.6), true`);
    await c.eval(`window.__test.shoot({ v0: 1.0 }), true`);
    for (let i = 0; i < 150 && !(await pend()); i++) await sleep(200);
    return pend();
  }
  // snooker: break, then a no-contact shot back toward baulk (the verifier's
  // recipe) — retried across a few angles: the after-break cue-ball spot
  // decides what the return path crosses
  for (const [phi, v0] of [[Math.PI, 1.5], [-Math.PI / 2 + 0.3, 2.0], [Math.PI, 1.0]]) {
    if (await c.eval(`__test.state()`) === 'BALL_IN_HAND') await c.eval(`__test.placeCue(0, -0.6), true`);
    await c.eval(`window.__test.shoot({ v0: 5 }), true`);
    if (!(await waitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 150, 200))) continue;
    if (await pend()) return pend(); // the break itself pended (a foul)
    if (await c.eval(`__test.state()`) === 'BALL_IN_HAND') await c.eval(`__test.placeCue(0, -0.6), true`);
    await c.eval(`window.__test.shoot({ v0: ${v0}, phi: ${phi} }), true`);
    if (!(await waitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 150, 200))) continue;
    const k = await pend();
    if (k) return k;
    await c.eval(`__test.rerack(), true`);
    await sleep(600);
  }
  return null;
}

// ---- 711 ------------------------------------------------------------------
const BALLS = `JSON.stringify(__test.balls().map((b) => [b.pos[0], b.pos[1], b.pos[2] ?? 0, !!b.pocketed]))`;
const PROMPT = `(() => {
  const sd = document.getElementById('ob-shell-decision');
  const r = window.__share?.replay?.() ?? null;
  return { open: window.__shell?.isOpen?.() === true, mounted: !!sd,
    answers: sd ? sd.querySelectorAll('.osd-btns button[data-choice]').length : 0,
    primary: sd ? sd.querySelectorAll('.osd-btns button[data-ob="shell-decision-continue"]').length : 0,
    lock: sd ? (sd.querySelector('.osd-lock')?.textContent ?? '').trim().length : 0,
    disabled: sd ? [...sd.querySelectorAll('.osd-btns button')].some((b) => b.disabled) : null,
    pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null,
    active: r?.active ?? null, done: r?.done ?? null,
    hud: (document.getElementById('hud-decision')?.getClientRects().length ?? 0) > 0,
    hash: location.hash.length }; })()`;
async function arm711({ PORT, CDP_PORT, fail, log }) {
  let link = null, kind = null;
  { // sender: real-user desktop boot -> quick-play -> heyball -> soft break -> Share URL
    const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1&u=q711send`,
      { port: CDP_PORT, width: 1440, height: 900, tool: false });
    // a persisted heyball profile + straight-to-table (the 713 seed idiom;
    // the codec carries the pinned wpa-heyball variant, so a FRESH recipient
    // profile replays heyball)
    if (!(await waitReady(c))) fail('711: sender pre-boot never became ready');
    else {
      // GH-1090: the fresh pre-boot shell writes ob-shell-v1 ONCE (startAtTable
      // false) 24-34 ms after __test.ready; a seed that lands before that write
      // is overwritten and the reload opens the hall — seed only after it
      if (!(await waitFor(c, `localStorage.getItem('ob-shell-v1') !== null`, 50, 100))) fail('711: staging — the pre-boot shell never wrote ob-shell-v1');
      await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'heyball' })),
        localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true })), location.reload(), true)`);
      await sleep(1200);
    }
    if (!(await waitReady(c)) || !(await waitFor(c, `typeof window.__shell === 'object' && !window.__shell.isOpen() && window.__rules?.ready?.() === true`, 80, 150))) {
      fail('711: sender heyball boot never settled at the table');
    } else {
      await waitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 50, 200);
      await sleep(800);
      kind = await raiseDecision(c, 'heyball');
      if (kind !== 'illegal_break') fail(`711: the sender's soft break must pend illegal_break, got ${J(kind)}`);
      else link = await c.eval('window.__share.encode()');
    }
    c.close();
    await sleep(1200);
  }
  if (typeof link !== 'string' || !link.includes('#r=')) { fail('711: no share link: ' + J(link)); return; }
  log(`711: link minted with ${kind} pending (${link.length} chars)`);
  const rLink = (tag) => { const u = new URL(link); u.searchParams.set('u', tag); return u.toString(); };
  for (const leg of ['desktop', 'phone']) {
    const tag = `711/${leg}`;
    const errs = [];
    const c = leg === 'phone'
      ? await launchPhone(rLink('q711p'), { cdpPort: CDP_PORT + 1, tool: false })
      : await launchChrome(rLink('q711d'), { port: CDP_PORT, width: 1440, height: 900, tool: false });
    watchErrors(c, errs);
    const press = (pt) => (leg === 'phone' ? tapAt(c, pt) : clickAt(c, pt));
    if (!(await waitReady(c)) || !(await waitFor(c, 'typeof window.__shell === "object"', 40, 150))) {
      fail(`${tag}: recipient boot never became ready`);
    } else if (!(await waitFor(c, `(() => { const r = window.__share?.replay?.(); return !!r && r.active === true && r.done === true; })()`, 300, 200))) {
      fail(`${tag}: the shared replay never finished: ` + J(await c.eval('window.__share.replay()').catch(() => null)));
    } else if (!(await waitFor(c, `(window.__rules?.matchState?.()?.pendingDecision?.kind ?? null) === ${J(kind)}`, 30, 200))) {
      fail(`${tag}: the finished replay must land with ${kind} pending: ` + J(await c.eval(PROMPT)));
    } else {
      await sleep(600);
      const balls0 = await c.eval(BALLS);
      const pill = await centre(c, '#ob-shell-open');
      if (!pill) fail(`${tag}: no reopen pill`);
      else {
        await press(pill); // REAL pill press: the hall over the finished replay
        if (!(await waitFor(c, `window.__shell.isOpen() === true && !!document.getElementById('ob-shell-decision')`, 40, 150))) {
          fail(`${tag}: the hall never opened with the prompt: ` + J(await c.eval(PROMPT)));
        } else {
          await sleep(500);
          const face = await c.eval(PROMPT);
          // the LOCKED face: no answers, one primary, the reason line
          if (face.answers !== 0 || face.primary !== 1 || !(face.lock > 0) || face.disabled) {
            fail(`${tag}: under the replay lock the prompt must render its LOCKED face `
              + `(no [data-choice] answers, one primary Continue, a reason line): ` + J(face));
          } else {
            const cont = await centre(c, '#ob-shell-decision .osd-btns button[data-ob="shell-decision-continue"]');
            const hit = await c.eval(`(() => { const e = document.elementFromPoint(${cont.x}, ${cont.y}); return !!e && !!e.closest('#ob-shell-decision'); })()`);
            if (!hit) fail(`${tag}: the Continue primary must be hit-testable at its centre`);
            await press(cont); // REAL press: resolve KEEPING the position, hall closes
            if (!(await waitFor(c, `window.__shell.isOpen() === false && window.__share.replay().active === false`, 40, 150))) {
              fail(`${tag}: Continue must close the hall and resolve the replay: ` + J(await c.eval(PROMPT)));
            } else {
              if (!(await waitFor(c, `(document.getElementById('hud-decision')?.getClientRects().length ?? 0) > 0`, 30, 200))) {
                fail(`${tag}: the table's own decision dialog must present after Continue`);
              }
              const after = await c.eval(PROMPT);
              const balls1 = await c.eval(BALLS);
              const hudBtns = await c.eval(`[...document.querySelectorAll('#hud-decision button')].filter((b) => {
                const r = b.getBoundingClientRect(); if (!r.width) return false;
                const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === b || b.contains(e); }).length`);
              if (after.pend !== kind || after.mounted || after.hash !== 0 || balls1 !== balls0 || !(hudBtns >= 1)) {
                fail(`${tag}: after Continue the decision must still pend at the SHARED position `
                  + `(pend ${J(after.pend)} want ${kind}; balls ${balls1 === balls0 ? 'kept' : 'MOVED'}; hash ${after.hash}; `
                  + `hud answers hit-testable ${hudBtns}; shell prompt mounted ${after.mounted})`);
              } else {
                log(`${tag} OK: locked face (0 answers, 1 primary, reason line) -> Continue kept the shared `
                  + `position, ${kind} pending at the table, ${hudBtns} hud answers hit-testable, hash wiped`);
              }
            }
          }
        }
      }
    }
    await gateErrors(c, errs, tag, fail);
    c.close();
    await sleep(1000);
  }
}

// ---- 713 ------------------------------------------------------------------
const STATE = `(() => ({ open: window.__shell?.isOpen?.() === true, place: window.__shell?.place?.() ?? null,
  station: window.__atelier?.station?.() ?? null, pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null,
  prompt: !!document.getElementById('ob-shell-decision'), state: __test.state() }))()`;
// #1130 the double-tap's own stamps, recorded in the page: listeners added
// after the shell's guard still see the answering click (shell chrome
// passes every guard) and tap 2's touchstart (no shell guard reads
// touchstart, and it carries tap 2's pointerdown stamp), so the arrival is
// measured whether or not tap 2's pointerdown is swallowed. The bubble read
// is the state right after the answer's own handler.
const REC713 = `(() => {
  const inPage = (ts) => { const now = performance.now(); return ts > now - 60000 && ts <= now + 50; };
  if (!window.__q713r) {
    const R = window.__q713r = {};
    const answer = (e) => e.target instanceof Element && !!e.target.closest('[data-choice]');
    window.addEventListener('click', (e) => {
      if (R.on && !R.click && answer(e)) R.click = { ts: e.timeStamp, inPage: inPage(e.timeStamp), origin: performance.timeOrigin };
    }, true);
    window.addEventListener('click', (e) => {
      if (R.on && R.click && !R.mid && answer(e)) R.mid = { prompt: !!document.getElementById('ob-shell-decision'),
        pend: window.__rules?.matchState?.()?.pendingDecision?.kind ?? null };
    }, false);
    window.addEventListener('touchstart', (e) => {
      if (R.on && R.click && !R.tap2) R.tap2 = { ts: e.timeStamp, inPage: inPage(e.timeStamp),
        canvas: e.target === document.querySelector('body > canvas') };
    }, true);
  }
  Object.assign(window.__q713r, { on: true, click: null, mid: null, tap2: null });
  return true; })()`;
/** #1130 review P2: the double-tap is STAGED on the input clock. Each touch event carries an explicit CDP timestamp
 * (seconds since the epoch; Chromium stamps e.timeStamp from it), and tap 2 starts gapMs after tap 1's release. So a
 * busy renderer cannot stretch the gap the page stamps: Input.dispatch* returns only once the page has handled the
 * event, so a loaded renderer delays when tap 2 is SENT, never its stamp. The gesture is stamped in the recent past,
 * never ahead of the page's clock, and after the previous gesture. Returns the staged tap-1 release time (epoch ms). */
const STAGE_GAP_MS = 90;
async function doubleTapStamped(c, a, b, gapMs = STAGE_GAP_MS) {
  const at = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  const t0 = Date.now() / 1000 - (0.25 + 0.08 + gapMs / 1000);
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(a), timestamp: t0 });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: at(a), timestamp: t0 + 0.04 });
  await sleep(20); // arrival order only; the page reads the stamps
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(b), timestamp: t0 + 0.04 + gapMs / 1000 });
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: at(b), timestamp: t0 + 0.08 + gapMs / 1000 });
  return Math.round((t0 + 0.04) * 1000);
}
/** The served shell's GH-713 window (its time-only clause), or null. */
async function shieldWindowMs(PORT) {
  const src = await fetch(`http://127.0.0.1:${PORT}/app/shell.js`).then((r) => r.text()).catch(() => '');
  const m = /const TAP_SHIELD_MS = (\d+)/.exec(src);
  return m ? Number(m[1]) : null;
}
/** Decision pending, hall open at Equipment with the balls station, a
 * table-bed point beside the first answer: { kind, ans, pt } or { staging }. */
async function stage713(c, game) {
  const kind = await raiseDecision(c, game);
  if (!kind) return { staging: 'no pending decision could be raised' };
  await sleep(400);
  const pill = await centre(c, '#ob-shell-open');
  if (!pill) return { staging: 'no reopen pill to open the hall with' };
  await tapAt(c, pill); // REAL: the hall
  if (!(await waitFor(c, `window.__shell.isOpen() === true && !!document.getElementById('ob-shell-decision')`, 40, 150))) {
    return { staging: 'the hall never opened with the prompt' };
  }
  await sleep(800);
  const eq = await centre(c, '#ob-shell-rail .ob-shell-place[data-place="equipment"]');
  if (!eq) return { staging: 'no Equipment rail segment' };
  await tapAt(c, eq); // REAL: Equipment
  if (!(await waitFor(c, `window.__shell.place() === 'equipment' && typeof window.__atelier === 'object'
      && [...document.querySelectorAll('.ob-atelier-host button[data-station="balls"]')].some((b) => b.getBoundingClientRect().width > 0)`, 60, 150))) {
    return { staging: 'the atelier never presented at Equipment' };
  }
  await sleep(800);
  const balls = await centre(c, '.ob-atelier-host button[data-station="balls"]');
  if (!balls) return { staging: 'no balls station pill' };
  await tapAt(c, balls); // REAL: balls station
  if (!(await waitFor(c, `window.__atelier.station() === 'balls' && !window.__shell.moving()`, 60, 150))) {
    return { staging: 'the balls station never presented' };
  }
  await sleep(600);
  const ans = await centre(c, '#ob-shell-decision .osd-btns button');
  // the continuation point: at the answer's height, right of the atelier rail (its x-range is the same with and
  // without the prompt; only its top moves), inside the prompt's footprint, off the quick-play stack and the place
  // rail, the table-bed prop behind it
  const pt = ans && await c.eval(`(() => {
    const box = (e) => (e && e.getClientRects().length ? e.getBoundingClientRect() : null);
    const rail = box(document.getElementById('ob-atelier-rail')), sd = box(document.getElementById('ob-shell-decision'));
    const avoid = ['ob-shell-quickplay-wrap', 'ob-shell-rail'].map((id) => box(document.getElementById(id))).filter(Boolean);
    if (!sd) return null;
    const y = ${ans.y};
    for (let x = Math.max(rail ? rail.right + 16 : sd.left + 16, sd.left + 16); x <= sd.right - 16; x += 8) {
      if (avoid.some((a) => x >= a.left && x <= a.right && y >= a.top && y <= a.bottom)) continue;
      if (window.__shell.propAt(x, y) === 'play') return { x, y };
    }
    return null; })()`);
  const prop = pt ? await c.eval(`window.__shell.propAt(${pt.x}, ${pt.y})`) : null;
  if (!ans || !pt || prop !== 'play') {
    return { staging: 'staging — no point at the first answer\'s height right of the atelier rail has the table-bed '
      + `prop behind it at the balls station (answer ${J(ans)}, propAt ${J(prop)} at ${J(pt)})` };
  }
  return { kind, ans, pt };
}
/** Back to the table on a fresh rack, ready to raise the decision again:
 * null, or the staging reason the reset failed. */
async function restage713(c) {
  await c.eval('window.__shell.isOpen() && window.__shell.quickPlay(), true').catch(() => {});
  if (!(await waitFor(c, '!window.__shell.isOpen() && !window.__shell.moving()', 40, 150))) return 'the hall never closed';
  await c.eval('__test.rerack(), true').catch(() => {});
  if (!(await waitFor(c, `['AIM', 'BALL_IN_HAND'].includes(__test.state())`, 50, 200))) return 'the rerack never settled';
  await sleep(800);
  return null;
}
async function arm713({ PORT, CDP_PORT, fail, log }) {
  for (const [w, h, game, lang] of [[844, 390, 'heyball', 'de'], [667, 375, 'snooker', 'fr']]) {
    const tag = `713/${w}x${h} ${game}/${lang}`;
    const errs = [];
    const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html?seed=1&u=q713_${w}`,
      { cdpPort: CDP_PORT + 1, width: w, height: h, tool: false });
    watchErrors(c, errs);
    if (!(await waitReady(c))) { fail(`${tag}: phone pre-boot never became ready`); c.close(); continue; }
    // GH-1090: seed only after the pre-boot shell's own first ob-shell-v1 write (the 711 note)
    if (!(await waitFor(c, `localStorage.getItem('ob-shell-v1') !== null`, 50, 100))) { fail(`${tag}: staging — the pre-boot shell never wrote ob-shell-v1`); c.close(); continue; }
    await c.eval(`(localStorage.setItem('ob-settings-v1', JSON.stringify({ game: ${J(game)}, language: ${J(lang)} })),
      localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: true })), location.reload(), true)`);
    await sleep(1200);
    if (!(await waitReady(c)) || !(await waitFor(c, `typeof window.__shell === 'object' && !window.__shell.isOpen() && window.__rules?.ready?.() === true`, 80, 150))) {
      fail(`${tag}: seeded straight-to-table boot never settled`); c.close(); continue;
    }
    await sleep(600);
    // #1130: the double-tap is staged and judged on the INPUT clock — the
    // page's own stamps of the answering click and of tap 2 — never the
    // node-side sleep (review P2: Input.dispatch* returns once the page has
    // handled the event, so a loaded renderer would have stretched a sent
    // gap). A measured gap at or past the shield window is INVALID and
    // staged again in-page (<= 3 tries); three never pass. No eval between
    // the taps.
    const shieldMs = await shieldWindowMs(PORT);
    if (!shieldMs) { fail(`${tag}: UNJUDGEABLE — the served app/shell.js names no TAP_SHIELD_MS`); c.close(); continue; }
    if (shieldMs < 350) { // the validity bound comes from the subject; the floor from the contract (shell.md (f))
      fail(`${tag}: the served TAP_SHIELD_MS ${shieldMs} is below GH-713's 350 ms window`); c.close(); continue;
    }
    let kind = null, ans = null, pt = null, before = null, after = null, verdict = null;
    const gaps = [];
    for (let t = 1; t <= 3 && !verdict; t++) {
      const again = t > 1 ? ` (re-stage ${t - 1} after INVALID gaps ${gaps.join(', ')} ms)` : '';
      const reset = t > 1 ? await restage713(c) : null;
      const s = reset ? { staging: reset } : await stage713(c, game);
      if (s.staging) { verdict = { staging: `${tag}: ${s.staging}${again}` }; break; }
      ({ kind, ans, pt } = s);
      before = await c.eval(STATE);
      await c.eval(REC713);
      await sleep(700); // the staged stamps must postdate the balls-station tap
      // the rude gesture: two REAL taps STAGED 90 ms apart on the input clock — the answer, then the bed beside it
      const staged = await doubleTapStamped(c, ans, pt);
      await sleep(900);
      after = await c.eval(STATE);
      const r = await c.eval('JSON.stringify(window.__q713r ?? {})').then(JSON.parse);
      if (!r.click) verdict = { fail: `${tag}: UNJUDGEABLE — the answering click was not seen: ${J(r)}` };
      else if (!r.mid) verdict = { fail: `${tag}: UNJUDGEABLE — the answering click never bubbled to window: ${J(r)}` };
      else if (r.mid.pend !== null || r.mid.prompt) {
        verdict = { fail: `${tag}: staging — the first tap must resolve the decision synchronously: ` + J(r.mid) };
      } else if (!r.tap2) {
        verdict = { fail: `${tag}: UNJUDGEABLE — tap 2's touchstart never reached the page after the answering click: ${J(r)}` };
      } else if (!r.click.inPage || !r.tap2.inPage) {
        verdict = { fail: `${tag}: UNJUDGEABLE — tap 2 and the answer must both carry the page's own clock: ${J(r)}` };
      } else if (r.tap2.ts < r.click.ts) {
        verdict = { fail: `${tag}: UNJUDGEABLE — tap 2 was stamped before the answering click: ${J(r)}` };
      } else if (!r.tap2.canvas) {
        verdict = { fail: `${tag}: UNJUDGEABLE — tap 2 must land on the scene canvas beside the answer: ${J(r)}` };
      } else {
        const gap = Math.round(r.tap2.ts - r.click.ts);
        const skew = Math.round(r.click.origin + r.click.ts - staged); // the page's click stamp vs the staged release
        gaps.push(gap);
        if (gap >= shieldMs) {
          log(`${tag}: try ${t}: tap 2 reached the page ${gap} ms after the answer (>= the ${shieldMs} ms shield) `
            + `— INVALID${t < 3 ? ', staged again' : ''}`);
        } else verdict = { gap, skew };
      }
    }
    if (verdict?.staging) { fail(verdict.staging); c.close(); continue; }
    if (!verdict) {
      fail(`${tag}: INVALID — every second tap reached the page after the ${shieldMs} ms shield window `
        + `(gaps ${gaps.join(', ')} ms on the page's clock, 3 tries); the arm judged nothing`);
    } else if (verdict.fail) fail(verdict.fail);
    else if (!after.open || after.place !== 'equipment' || after.station !== 'balls' || after.pend !== null) {
      fail(`${tag}: the SECOND tap of the double-tap must navigate nowhere (place equipment, station balls, `
        + `hall open; tap 2 reached the page ${verdict.gap} ms after the answer): before ${J(before)} -> after ${J(after)}`);
    } else {
      // control: a deliberate tap >= 1 s later at the same point (no chrome
      // activation between) is a lawful table-bed prop tap -> Play
      await sleep(1100);
      const under = await c.eval(`document.elementFromPoint(${pt.x}, ${pt.y})?.matches?.('body > canvas') === true`);
      if (!under) {
        fail(`${tag}: staging — the bed point ${J(pt)} is covered once the prompt leaves: `
          + `${await c.eval(`(() => { const e = document.elementFromPoint(${pt.x}, ${pt.y}); return e ? e.tagName + '#' + e.id + '.' + e.className : null; })()`)}`);
      } else {
        await tapAt(c, pt);
        const late = await waitFor(c, `window.__shell.place() === 'play'`, 30, 100);
        if (!late) fail(`${tag}: control — a deliberate tap >= 1 s after the answer must still navigate to Play: ` + J(await c.eval(STATE)));
        else log(`${tag} OK: ${kind} answered by tap 1; tap 2 on the bed (${Math.round(pt.x)},${Math.round(pt.y)}) reached the page ${verdict.gap} ms after it (staged ${STAGE_GAP_MS}; click stamp ${verdict.skew} ms off the staged release) and was swallowed (equipment/balls kept); a deliberate tap there at +1.1 s navigated to Play`);
      }
    }
    await gateErrors(c, errs, tag, fail);
    c.close();
    await sleep(1000);
  }
}

export async function runQa3ShellArms({ PORT, CDP_PORT, fail, log = console.log }) {
  const arms = (process.env.OB_E2E_QA3_ARMS || '711,713').split(',');
  if (arms.includes('711')) await arm711({ PORT, CDP_PORT, fail, log });
  if (arms.includes('713')) await arm713({ PORT, CDP_PORT, fail, log });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL-QA3 FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runQa3ShellArms({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-SHELL-QA3 FAIL' : 'E2E-SHELL-QA3 PASS');
}
