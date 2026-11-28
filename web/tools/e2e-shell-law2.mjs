// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-law2.mjs — LAW 2's SHEET-GATED arrival hold, with a deterministic arm (#1175, the #811 follow-up).
// Its own suite (one desktop browser); it rides the e2e-nightly battery only: a timed browser arm, so not the per-PR
// fastlane (the selection law).
//
// Since #811 the shell links the content places' sheets at boot idle (shell.js preloadSheets), so a rail click almost
// never meets a sheet still in flight and LAW 2's hold (ARRIVAL_HOLD_MS) lost its natural arm: e2e-shell's A3 motion
// pass delays each sheet 120 ms from its REQUEST, long done by the click. This suite holds the destination's sheet
// ACROSS the click instead:
//   construction  every PLACE_SHEETS sheet (read from the served app/shell.js, so the arm follows the table) is held
//                 at the Fetch seam's RESPONSE stage from before the judged boot, with the cache disabled (a cached
//                 copy would skip the seam, #1186): the server has answered, but neither the preload nor the module's
//                 own link gets the bytes before its place's click; one real-user boot (desktop 1440x900, REDUCED
//                 motion: the mover snaps, so a 0.9 s camera move's frames do not compete with the released sheet's
//                 load task inside the 250 ms cap; LAW 2's hold is the same under both registers), then one rail
//                 click per place in table order, each once LAW 1 has settled that import
//   release       the page itself signals the click (a CDP binding call from its capture listener) and then its first
//                 sampled held frame of the arrival (one from the sampler), so neither a busy main thread nor the
//                 input acks can delay the decision behind a poll; the place's held responses are continued at the
//                 held frame, at half the served cap after the click signal at the latest, concurrently with the
//                 press, and never before the click signal; a response-stage release only hands over bytes already
//                 fetched
//   judge         the hold armed by the click; at the hold's release (recorded in that instant by a MutationObserver
//                 on the section's inline style) the card painted by the shell's own predicate AND its sheet loaded
//                 (an unpainted release before the cap, or none at all with no content frame, is RED); no sampled
//                 frame still held after the shell called the card painted (beyond the one frame its rAF release
//                 loop needs); a held frame; 0 stub frames from the click to content; content inside the D6 window
//                 (<= 1000 ms, the A3 motion bound); the first content frame carrying the sheet
//   non-pass      UNJUDGEABLE (a fail line, never a pass) when a construction did not happen or load decided the
//                 outcome: the press not delivered as a click (or the sheet released before its click signal), no
//                 link carrying the sheet before the click, the sheet already loaded (or loaded before the click), no
//                 response of it held, the module import pending or degraded, the released sheet failing, no held
//                 frame sampled at all while the click armed the hold, the cap ending the hold on an unpainted card
//                 before the released sheet landed or while the module's own ready was pending (replays' archive
//                 read), or the release unobserved while content frames came
// The verdict is a pure function (judgeHop); its fixture rows run first on every invocation, and `--selftest` runs
// only them (no browser). Under run-gate: `node web/tools/e2e-shell-law2.mjs [--selftest]` (OB_E2E_PORT /
// OB_E2E_CDP_PORT; OB_E2E_LAW2_PLACES=practice,equipment,replays selects places).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  answerPausedRequest, launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

// one static server + one desktop CDP endpoint
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW (e2e-shell) — the suite's default ports are e2e-shell's (8178/8830); the two never run in parallel in a lane
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const J = (o) => JSON.stringify(o);
// a fallback timer that never keeps the process alive (a race's losing timer would hold node, and run-gate's band, open)
const lapse = (ms) => new Promise((res) => { setTimeout(res, ms, null).unref(); });
const D6_MS = 1000; // the A3 motion pass's content bound (shellmover MOVE_MS 900)
const MIN_FRAMES = 6; // e2e-shell A3_MIN_FRAMES

/** The laws the arm judges, read from the SERVED app/shell.js (never authored here): the hold cap and the
 * PLACE_SHEETS rows (place, link id, sheet file). */
export function servedLaws(src) {
  const cap = /\bconst ARRIVAL_HOLD_MS = (\d+);/.exec(src);
  const table = /\bconst PLACE_SHEETS = \[([\s\S]*?)\n\s*\];/.exec(src);
  const rows = table ? [...table[1].matchAll(/\['(\w+)', '([\w-]+)', '\.\/(ui\/[\w.-]+\.css)\?v=[\w.-]+'\]/g)]
    .map(([, place, linkId, file]) => ({ place, linkId, file })) : [];
  return { cap: cap ? Number(cap[1]) : null, rows };
}

/** One hop's verdict: { verdict: 'PASS' | 'RED' | 'UNJUDGEABLE', why: [...] }. Times are ms after the click's own
 * dispatch (the page clock); `cap` is the served ARRIVAL_HOLD_MS (its timer is set after the click, so it never ends
 * a hold earlier than that). */
export function judgeHop(r, { cap, d6 = D6_MS }) {
  if (r.noButton) return { verdict: 'RED', why: [`the rail button for ${r.place} is unreachable`] };
  const u = [];
  if (!r.click) u.push('the press was not delivered as a click on the rail button');
  if (!r.linkBefore) u.push(`no link carried ${r.file} before the click (the preload never linked it)`);
  else if (r.linkBefore.sheet) u.push(`${r.file} had loaded before the click, so nothing gated the arrival`);
  if (!r.heldCount) u.push(`the seam held no response of ${r.file} (a cached or unmatched sheet)`);
  if (!r.importSettled) u.push(`the ${r.place} module import had not settled before the click (the arrival would wait on it, not on the sheet)`);
  if (r.degraded) u.push(`the ${r.place} module degraded (its stubs stand by law; no sheet gate to judge)`);
  if (r.clickBeforeRelease === false) u.push('the sheet was released without a click signal (the press slow or not delivered): no sheet-gated arrival');
  if (r.sheetLoad && r.sheetLoad.t < 0) u.push(`${r.file} loaded at ${r.sheetLoad.t} ms, before the click`);
  if (u.length) return { verdict: 'UNJUDGEABLE', why: u };
  if (!r.settled) return { verdict: 'RED', why: [`never settled at the place (${r.frames} frames, moving ${r.moving})`] };
  if (r.sheetLoad?.type === 'error') return { verdict: 'UNJUDGEABLE', why: [`the released ${r.file} failed to load at +${r.sheetLoad.t} ms (the server, not the law)`] };
  // the presented frames: judged for every gated outcome below
  const frames = [];
  if (r.stubFrames) frames.push(`${r.stubFrames} stub frame(s) from the click to content`);
  if (r.toContent < 0) frames.push('no content frame');
  else {
    if (r.msToContent > d6) frames.push(`content at +${r.msToContent} ms, past the D6 window (${d6} ms)`);
    if (r.firstContentSheet !== true) frames.push('the first content frame was painted without the sheet');
  }
  const armed = !!r.rel || r.clickEnd?.hold === r.place || r.heldFrames > 0;
  if (!armed) return { verdict: 'RED', why: ['the click armed no hold although the sheet was pending (no hold at the click task\'s end, no held frame, no release)', ...frames] };
  if (r.rel && r.rel.painted && !r.rel.sheet) {
    return { verdict: 'RED', why: [`the hold released at +${r.rel.t} ms on a card the shell called painted without its sheet`, ...frames] };
  }
  if (r.rel && !r.rel.painted && r.rel.t < cap - 2) {
    return { verdict: 'RED', why: [`the hold left at +${r.rel.t} ms, before the ${cap} ms cap, on a card the shell did not call painted`, ...frames] };
  }
  if (!r.rel) {
    if (r.toContent < 0) return { verdict: 'RED', why: ['no release of the hold was observed and no content frame came: the card never showed', ...frames] };
    return { verdict: 'UNJUDGEABLE', why: ['the hold\'s release was not observed (the instrument)'] };
  }
  if (r.heldFrames === 0) return { verdict: 'UNJUDGEABLE', why: [`the click armed the hold but no held frame was sampled before it ended (released ${r.releaseBy ? 'at the bound' : 'on the signal'}): frames starved`] };
  if (!r.rel.painted) { // the cap ended the hold on an unpainted card
    if (r.readyEnd && !r.rel.ready) {
      return { verdict: 'UNJUDGEABLE', why: [`the cap ended the hold at +${r.rel.t} ms while the module's own ready was pending (replays' archive read): load`] };
    }
    if (r.sheetLoad && r.sheetLoad.t < r.rel.t) {
      return { verdict: 'RED', why: [`the hold ended at +${r.rel.t} ms on a card the shell did not call painted, although its sheet had loaded at +${r.sheetLoad.t} ms`, ...frames] };
    }
    return { verdict: 'UNJUDGEABLE', why: [`the cap ended the hold at +${r.rel.t} ms on an unpainted card before the released sheet landed (${r.sheetLoad ? `+${r.sheetLoad.t} ms` : 'never'}): load`] };
  }
  const red = [];
  if (r.heldPainted >= 2) red.push(`the hold stayed on for ${r.heldPainted} sampled frames after the shell called the card painted (its paint release did not fire)`);
  red.push(...frames);
  return red.length ? { verdict: 'RED', why: red } : { verdict: 'PASS', why: [] };
}

// the verdict's fixture rows: one per branch, each isolating the clause it names (a regression in judgeHop fails
// before any browser starts)
const GOOD = { place: 'practice', file: 'ui/practice.css', click: true, clickBeforeRelease: true, importSettled: true, degraded: false,
  linkBefore: { id: 'ob-practice-css', sheet: false }, heldCount: 1, settled: true, frames: 20, moving: false,
  clickEnd: { t: 4, hold: 'practice' }, heldFrames: 2, firstHeldMs: 9, releaseBy: false, heldPainted: 0,
  rel: { t: 30, painted: true, sheet: true, ready: false }, readyEnd: false, sheetLoad: { t: 27, type: 'load' },
  stubFrames: 0, toContent: 2, msToContent: 33, firstContentSheet: true };
const NO_HOLD = { clickEnd: { t: 4, hold: null }, rel: null, heldFrames: 0, firstHeldMs: null };
const CAP_UNPAINTED = { rel: { t: 251, painted: false, sheet: false, ready: false } };
export const SELFTEST_ROWS = [
  ['S1 the sheet held across the click, the card lands whole with it', {}, 'PASS'],
  ['S2 the hold removed: nothing armed, the stub paints', { ...NO_HOLD, stubFrames: 4, toContent: 6, msToContent: 120 }, 'RED'],
  ['S3 nothing armed, the presented frames clean (the not-armed clause alone)', { ...NO_HOLD }, 'RED'],
  ['S4 the reveal ungated in the click task: released on a card without its sheet', { ...NO_HOLD, rel: { t: 1, painted: true, sheet: false, ready: false }, toContent: 0, msToContent: 12, firstContentSheet: false }, 'RED'],
  ['S5 the reveal a frame later: released without the sheet, the next frame styled', { heldFrames: 1, rel: { t: 18, painted: true, sheet: false, ready: false } }, 'RED'],
  ['S6 the paint release removed: held after the card painted, to the cap', { heldFrames: 15, heldPainted: 12, rel: { t: 251, painted: true, sheet: true, ready: false } }, 'RED'],
  ['S7 the card unpainted at the cap although its sheet had loaded', { rel: { t: 251, painted: false, sheet: true, ready: false }, sheetLoad: { t: 90, type: 'load' } }, 'RED'],
  ['S8 the hold left early on an unpainted card, after a held frame', { heldFrames: 1, rel: { t: 40, painted: false, sheet: false, ready: false }, stubFrames: 3 }, 'RED'],
  ['S9 the hold left in the click task on an unpainted card (released on the mount), no held frame', { heldFrames: 0, releaseBy: true, rel: { t: 1, painted: false, sheet: false, ready: false } }, 'RED'],
  ['S10 no release observed and no content frame: the card never showed', { rel: null, toContent: -1, msToContent: -1, firstContentSheet: null }, 'RED'],
  ['S11 a stub frame after the hold', { stubFrames: 1 }, 'RED'],
  ['S12 content past the D6 window', { msToContent: 1200 }, 'RED'],
  ['S13 no content frame', { toContent: -1, msToContent: -1, firstContentSheet: null }, 'RED'],
  ['S14 the first content frame without the sheet', { firstContentSheet: false }, 'RED'],
  ['S15 never settled at the place', { settled: false }, 'RED'],
  ['S16 the rail button unreachable', { noButton: true }, 'RED'],
  ['S17 the seam held nothing (a cached copy)', { heldCount: 0 }, 'UNJUDGEABLE'],
  ['S18 the sheet loaded before the click', { linkBefore: { id: 'ob-practice-css', sheet: true } }, 'UNJUDGEABLE'],
  ['S19 no link before the click', { linkBefore: null }, 'UNJUDGEABLE'],
  ['S20 the press never reached the page as a click', { click: false }, 'UNJUDGEABLE'],
  ['S21 the module import still pending at the click', { importSettled: false }, 'UNJUDGEABLE'],
  ['S22 the module degraded', { degraded: true }, 'UNJUDGEABLE'],
  ['S23 the released sheet failed', { sheetLoad: { t: 30, type: 'error' } }, 'UNJUDGEABLE'],
  ['S24 armed, released at the bound, no held frame sampled before the hold ended', { heldFrames: 0, firstHeldMs: null, releaseBy: true, rel: { t: 140, painted: true, sheet: true, ready: false } }, 'UNJUDGEABLE'],
  ['S25 the cap ended the hold before the released sheet landed', { ...CAP_UNPAINTED, sheetLoad: { t: 260, type: 'load' } }, 'UNJUDGEABLE'],
  ['S26 the cap ended the hold, the sheet never landed', { ...CAP_UNPAINTED, sheetLoad: null }, 'UNJUDGEABLE'],
  ['S27 the cap ended the hold while the module\'s ready was pending (the sheet in)', { rel: { t: 252, painted: false, sheet: true, ready: false }, readyEnd: true, sheetLoad: { t: 40, type: 'load' } }, 'UNJUDGEABLE'],
  ['S28 armed and held, the release unobserved, content frames clean', { rel: null }, 'UNJUDGEABLE'],
  ['S29 the sheet released before the click signal came', { clickBeforeRelease: false }, 'UNJUDGEABLE'],
  ['S30 the sheet loaded before the click', { sheetLoad: { t: -40, type: 'load' } }, 'UNJUDGEABLE'],
];
export function selftest() {
  const bad = [];
  for (const [name, patch, want] of SELFTEST_ROWS) {
    const got = judgeHop({ ...GOOD, ...patch }, { cap: 250 });
    if (got.verdict !== want) bad.push(`${name}: ${got.verdict} (wanted ${want}; ${got.why.join('; ')})`);
  }
  return bad;
}

async function waitFor(c, expr, ms = 20000, step = 100) {
  const t0 = Date.now();
  for (;;) {
    let v = null;
    try { v = await c.eval(expr); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t0 > ms) return null;
    await sleep(step);
  }
}

// The page side, registered before the judged boot:
//   samples  one rAF sampler (the frame's FIRST callback) recording every open-shell frame: the place, the e2e-shell
//            A3_CARD paint truth restated, the shell's hold and its own painted verdict, and whether the place's
//            sheet has loaded; its first held frame of the armed hop calls the __law2Held binding (the release)
//   rel      the hold's release, recorded IN THAT INSTANT: a MutationObserver on the place sections' inline style
//            (LAW 2 holds with visibility:hidden) notes the card's state when the section leaves it
//   clicks   every click on a rail place (a hop's clock starts at its dispatch) and, in a timer queued from it, the
//            hold at the end of the click task (the cap timer, set inside that task, fires later)
//   loads    every link's load / error (capture: neither bubbles)
const PAGE = (rows) => `(() => {
  const L = (window.__law2 = { samples: [], rel: [], clicks: [], ends: [], loads: [], mark: 0, markT: 0, armFor: null });
  const LINK = ${J(Object.fromEntries(rows.map((r) => [r.place, r.linkId])))};
  const sheetOf = (place) => {
    const id = LINK[place];
    const l = id && (document.getElementById(id) || document.getElementById(id + '-pre'));
    return !!(l && l.sheet);
  };
  const paints = (el) => getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  // stub = an S1 stub node paints in the visible section; content = the visible section carries the module's host
  // class, no stub node paints and a module-owned direct child (not the H2 / hold hint / stubs) is laid out
  const card = (place) => {
    const sec = document.querySelector('#ob-shell-cards > section[data-place="' + place + '"]');
    if (!sec) return { secVis: false, stub: false, content: false };
    const cs = getComputedStyle(sec);
    const secVis = !sec.hidden && cs.visibility !== 'hidden' && cs.display !== 'none';
    const stubs = [...sec.querySelectorAll(':scope > p.ob-shell-line, :scope > .ob-shell-actions')];
    const host = sec.classList.contains('ob-' + place + '-host')
      || (place === 'equipment' && sec.classList.contains('ob-atelier-host'));
    const laid = [...sec.children].some((el) => el.tagName !== 'H2' && !el.classList.contains('ob-shell-hold')
      && !stubs.includes(el) && !el.hidden && getComputedStyle(el).display !== 'none'
      && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
    return { secVis, stub: secVis && stubs.some(paints),
      content: secVis && host && stubs.length > 0 && !stubs.some(paints) && laid };
  };
  let mo = null;
  const tick = () => {
    const s = window.__shell;
    const cards = !mo && document.getElementById('ob-shell-cards');
    if (cards) {
      mo = new MutationObserver((recs) => {
        const left = new Set();
        for (const r of recs) {
          const el = r.target;
          if (el.parentElement === cards && el.dataset.place && /visibility:\\s*hidden/.test(r.oldValue || '')) left.add(el);
        }
        for (const el of left) {
          if (el.style.visibility === 'hidden') continue; // another style change while still held
          const p = el.dataset.place;
          const st = window.__shell && window.__shell.contentState && window.__shell.contentState();
          L.rel.push({ place: p, t: performance.now(), painted: !!st && st.painted.includes(p),
            ready: !!st && st.ready.includes(p), sheet: sheetOf(p), ...card(p) });
        }
      });
      mo.observe(cards, { subtree: true, attributes: true, attributeFilter: ['style'], attributeOldValue: true });
    }
    if (s && s.isOpen()) {
      const p = s.place();
      const st = s.contentState?.(); // one readout per frame: hold and the shell's own painted verdict
      const q = { place: p, moving: s.moving(), t: performance.now(), ...card(p), sheet: sheetOf(p),
        held: !!st && st.hold === p, painted: !!st && st.painted.includes(p) };
      L.samples.push(q);
      if (q.held && p === L.armFor && typeof window.__law2Held === 'function') {
        L.armFor = null;
        window.__law2Held(JSON.stringify({ place: p, t: q.t }));
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('#ob-shell-rail [data-place]');
    if (!b) return;
    const place = b.dataset.place;
    L.clicks.push({ place, t: performance.now() });
    if (place === L.armFor && typeof window.__law2Held === 'function') window.__law2Held(JSON.stringify({ kind: 'click', place, t: performance.now() }));
    setTimeout(() => { const st = window.__shell && window.__shell.contentState && window.__shell.contentState();
      L.ends.push({ place, t: performance.now(), hold: st ? st.hold : null }); }, 0);
  }, true);
  for (const type of ['load', 'error']) {
    document.addEventListener(type, (e) => {
      const n = e.target;
      if (n && n.tagName === 'LINK') L.loads.push({ id: n.id, type, t: performance.now() });
    }, true);
  }
})()`;

/** one real mouse press + release at p (CDP Input, the e2e-shell clickEl idiom) */
async function press(c, p) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', buttons: 0, clickCount: 1 });
}

/** One rail hop with its sheet held across the click; returns the record judgeHop reads. */
async function hop(c, row, { held, open, releaseBy, signals, fail }) {
  const P = J(row.place);
  const ids = J([row.linkId, `${row.linkId}-pre`]);
  const rec = { place: row.place, file: row.file };
  const release = () => {
    open.delete(row.place);
    return Promise.all(held.filter((h) => h.place === row.place)
      .map((h) => answerPausedRequest(c, 'Fetch.continueRequest', h.params, null, { fail })));
  };
  rec.linkBefore = await c.eval(`(() => { const l = ${ids}.map((id) => document.getElementById(id)).find(Boolean);
    return l ? { id: l.id, sheet: !!l.sheet } : null; })()`);
  rec.importSettled = await c.eval(`!!window.__shell.contentState?.().settled.includes(${P})`);
  const pt = await c.eval(`(() => { const e = document.querySelector(${J(`#ob-shell-rail [data-place="${row.place}"]`)});
    if (!e || e.hidden) return null; const b = e.getBoundingClientRect();
    return b.width && b.height ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null; })()`);
  if (!pt) { rec.heldCount = held.filter((h) => h.place === row.place).length; rec.noButton = true; await release(); return rec; }
  // the construction at the press: a response the server answers after the hop began still counts, so wait (bounded)
  // for this place's paused response and take the count at the press
  const tw = Date.now();
  while (!held.some((h) => h.place === row.place) && Date.now() - tw < 5000) await sleep(20);
  // the release, decided concurrently with the input acks: the page's click signal starts the bound, its first
  // sampled held frame releases at once (binding calls, so no poll waits behind a busy main thread or an ack)
  const clickSeen = new Promise((res) => signals.set(`click:${row.place}`, res));
  const heldSeen = new Promise((res) => signals.set(row.place, res));
  await c.eval(`window.__law2.mark = window.__law2.samples.length, window.__law2.markT = performance.now(), window.__law2.armFor = ${P}, true`);
  rec.heldCount = held.filter((h) => h.place === row.place).length;
  const t0 = Date.now();
  let pressDone = null;
  const pressed = press(c, pt).then(() => { pressDone = Date.now(); });
  const decided = (async () => {
    // never before the click: the response stays held until the page's click signal; a press whose acks all came
    // back (or failed) without one, after 500 ms grace, or no signal in 15 s releases anyway, and the hop reads
    // UNJUDGEABLE
    const clk = await Promise.race([clickSeen, pressed.then(() => lapse(500), () => null), lapse(15000)]);
    rec.clickBeforeRelease = !!clk;
    const tc = Date.now();
    const got = clk ? await Promise.race([heldSeen, lapse(releaseBy)]) : null;
    rec.releaseBy = !got;
    rec.releaseAfterClickMs = clk ? Date.now() - tc : null;
    rec.releaseAfterPressMs = Date.now() - t0;
    await release();
    return got;
  })();
  // both branches settle before either outcome is used, so a failed press ends as this hop's named failure
  const [pr, dr] = await Promise.allSettled([pressed, decided]);
  signals.delete(row.place);
  signals.delete(`click:${row.place}`);
  if (pr.status === 'rejected') throw new Error(`the press failed: ${pr.reason?.message ?? pr.reason}`);
  if (dr.status === 'rejected') throw dr.reason;
  const got = dr.value;
  rec.pressMs = pressDone - t0; // the three input acks
  // the move runs ~0.9 s: stillness at the place with the module's host class, then MIN_FRAMES frames there
  const host = J(row.place === 'equipment' ? 'ob-atelier-host' : `ob-${row.place}-host`);
  await waitFor(c, `(() => { const s = window.__shell; const sec = document.querySelector(${J(`#ob-shell-cards > section[data-place="${row.place}"]`)});
    return s.place() === ${P} && !s.moving() && !!sec && sec.classList.contains(${host}); })()`, 5000);
  await sleep(250);
  await waitFor(c, `window.__law2.samples.slice(window.__law2.mark).filter((q) => q.place === ${P}).length >= ${MIN_FRAMES}`, 10000, 50);
  Object.assign(rec, await c.eval(`(() => {
    const L = window.__law2, mine = L.samples.slice(L.mark).filter((q) => q.place === ${P});
    const click = L.clicks.find((k) => k.place === ${P} && k.t >= L.markT);
    const t0 = click ? click.t : L.markT;
    const at = (q) => Math.round(q.t - t0);
    const first = mine.find((q) => q.content), firstHeld = mine.find((q) => q.held);
    const end = click ? L.ends.find((x) => x.place === ${P} && x.t >= click.t) : null;
    const rel = L.rel.find((x) => x.place === ${P} && x.t >= t0);
    const load = L.loads.find((x) => ${ids}.includes(x.id) && x.t >= L.markT);
    L.armFor = null;
    const st = window.__shell.contentState();
    return { click: !!click, clickT: click ? click.t : null, frames: mine.length, moving: window.__shell.moving(),
      degraded: st.degraded.includes(${P}), readyEnd: st.ready.includes(${P}),
      settled: window.__shell.place() === ${P} && !window.__shell.moving() && mine.length >= ${MIN_FRAMES},
      clickEnd: end ? { t: at(end), hold: end.hold } : null,
      heldFrames: mine.filter((q) => q.held).length, firstHeldMs: firstHeld ? at(firstHeld) : null,
      heldPainted: mine.filter((q) => q.held && q.painted).length,
      rel: rel ? { t: at(rel), painted: rel.painted, ready: rel.ready, sheet: rel.sheet, content: rel.content, stub: rel.stub } : null,
      stubFrames: mine.filter((q) => q.stub).length, toContent: mine.findIndex((q) => q.content),
      msToContent: first ? at(first) : -1, firstContentSheet: first ? first.sheet : null,
      sheetLoad: load ? { t: at(load), type: load.type } : null,
      seq: mine.slice(0, 16).map((q) => (q.held ? (q.painted ? 'p' : 'h') : q.stub ? 'S' : q.content ? (q.sheet ? 'C' : 'u') : q.secVis ? 'v' : '_')).join('') };
  })()`));
  if (got && rec.clickT !== null) rec.signalMs = Math.round(got.t - rec.clickT); // the release signal, after the click
  return rec;
}

export async function armLaw2({ PORT, CDP_PORT, fail, log = console.log }) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const { cap, rows: all } = servedLaws(fs.readFileSync(path.join(webDir, 'app', 'shell.js'), 'utf8'));
  if (!cap || !all.length) {
    fail(`LAW2: UNJUDGEABLE — the served app/shell.js carries no ARRIVAL_HOLD_MS (${cap}) or no PLACE_SHEETS row (${all.length})`);
    return 0;
  }
  const pick = (process.env.OB_E2E_LAW2_PLACES || '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = pick.filter((p) => !all.some((r) => r.place === p));
  if (unknown.length) {
    fail(`LAW2: unknown place(s) ${unknown.join(', ')} — PLACE_SHEETS holds ${all.map((r) => r.place).join(', ')}`);
    return 0;
  }
  const rows = pick.length ? all.filter((r) => pick.includes(r.place)) : all;
  const releaseBy = Math.floor(cap / 2);
  const origin = `http://127.0.0.1:${PORT}/`;
  const c = await launchChrome(origin, { port: CDP_PORT, tool: false, width: 1440, height: 900 });
  const errs = [];
  let passed = 0;
  try {
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
        errs.push(params.args.map((a) => a.value ?? a.description).join(' '));
      } else if (method === 'Runtime.exceptionThrown') {
        errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      }
    });
    // the seam, armed before the judged boot: a place's sheet response waits until that place's release
    const held = [];
    const signals = new Map(); // place / 'click:'+place -> the hop's resolvers, called by the page's __law2Held binding
    c.onEvent((method, params) => {
      if (method !== 'Runtime.bindingCalled' || params.name !== '__law2Held') return;
      let m = null;
      try { m = JSON.parse(params.payload); } catch { /* not ours */ }
      const res = m && signals.get(m.kind === 'click' ? `click:${m.place}` : m.place);
      if (res) res(m);
    });
    const open = new Set(rows.map((r) => r.place));
    const sheetRe = rows.map((r) => [r.place, new RegExp(`/app/${r.file.replace(/\./g, '\\.')}(\\?|$)`)]);
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const hit = sheetRe.find(([place, re]) => open.has(place) && re.test(params.request.url));
      if (hit) held.push({ place: hit[0], url: params.request.url, params });
      else answerPausedRequest(c, 'Fetch.continueRequest', params, null, { fail });
    });
    if (!(await waitFor(c, `location.protocol === 'http:' && document.readyState === 'complete'`, 60000))) {
      throw new Error(`the first document never landed at ${origin}`);
    }
    // Network.enable FIRST, or the agent never applies the cache flag (#1186)
    await c.send('Network.enable');
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Fetch.enable', { patterns: rows.map((r) => ({ urlPattern: `*/app/${r.file}*`, requestStage: 'Response' })) });
    await c.send('Runtime.addBinding', { name: '__law2Held' });
    // reduced motion: the mover snaps, so no camera move's frames compete with the released sheet's load task
    await c.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE(rows) });
    await c.send('Page.navigate', { url: `${origin}app.html?u=law2` });
    if (!(await waitFor(c, 'window.__test?.ready === true && !!window.__shell && !!window.__law2', 90000, 200))) {
      fail('LAW2: the judged boot never became ready');
      return 0;
    }
    if (!(await waitFor(c, `(() => { const s = window.__shell; return s.isOpen() && s.place() === 'play' && !s.moving(); })()`, 60000, 150))) {
      fail('LAW2: the fresh boot never landed play');
      return 0;
    }
    if (!(await c.eval(`typeof window.__law2Held === 'function'`))) {
      fail('LAW2: UNJUDGEABLE — the __law2Held binding is absent from the page (every release would fall back to the bound)');
      return 0;
    }
    // LAW 1 settles every module import (so the judged frames are the hold's, not the import's) and the preload links
    // every place's sheet; a hop whose import or link is missing at its click is UNJUDGEABLE there
    const t0 = Date.now();
    const ready = await waitFor(c, `(() => { const st = window.__shell.contentState?.(); if (!st) return false;
      return ${J(rows.map((r) => r.place))}.every((p) => st.settled.includes(p))
        && ${J(rows.map((r) => r.linkId))}.every((id) => document.getElementById(id) || document.getElementById(id + '-pre')); })()`, 30000);
    log(`LAW2: cap ${cap} ms, release bound +${releaseBy} ms; every import settled and every sheet linked = ${!!ready} after ${Date.now() - t0} ms; held ${J(rows.map((r) => [r.place, held.filter((h) => h.place === r.place).length]))}`);
    for (const row of rows) {
      const tag = `LAW2 rail → ${row.place}`;
      let r;
      // a hop that breaks off (a CDP failure) is its own named fail line; the run goes on to its cleanup and verdict
      try { r = await hop(c, row, { held, open, releaseBy, signals, fail }); } catch (e) {
        fail(`${tag}: the hop broke off: ${e?.message ?? e}`);
        continue;
      }
      const v = judgeHop(r, { cap });
      const facts = `held responses ${r.heldCount}; click task end ${J(r.clickEnd)}; released ${r.releaseBy ? 'at the bound' : `on the first held frame (+${r.signalMs} ms page)`} +${r.releaseAfterClickMs} ms after the click signal (bound ${releaseBy}), press acked +${r.pressMs} ms; ${r.frames} frames: held ${r.heldFrames}`
        + ` (first +${r.firstHeldMs} ms, after painted ${r.heldPainted}), stub ${r.stubFrames}, content at frame ${r.toContent} (+${r.msToContent} ms, sheet ${r.firstContentSheet});`
        + ` hold released ${J(r.rel)}; sheet ${J(r.sheetLoad)}; seq ${r.seq}`;
      if (v.verdict === 'PASS') { passed += 1; log(`${tag} OK: ${facts}`); }
      else fail(`${tag}: ${v.verdict === 'UNJUDGEABLE' ? 'UNJUDGEABLE — ' : ''}${v.why.join('; ')} (${facts})`);
    }
    const appErrs = await c.eval('(window.__test?.errors ?? []).slice(0, 3)').catch(() => ['errors unreadable']);
    if (appErrs.length) fail(`LAW2: app errors ${J(appErrs)}`);
    if (errs.length) fail(`LAW2: console errors: ${errs.slice(0, 3).join(' | ')}`);
  } finally {
    try { c.close(); } catch { /* gone */ }
    await sleep(1000);
  }
  return passed;
}

// the entry guard resolves symlinks (a symlinked path, e.g. macOS /tmp, must not turn the run into a silent no-op)
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const fail = (msg) => { console.error('E2E-SHELL-LAW2 FAIL:', msg); process.exitCode = 1; };
  const bad = selftest();
  for (const b of bad) fail(`selftest ${b}`);
  if (process.argv.includes('--selftest')) {
    console.log(bad.length ? 'E2E-SHELL-LAW2 SELFTEST FAIL' : `E2E-SHELL-LAW2 SELFTEST PASS (${SELFTEST_ROWS.length} rows)`);
  } else if (!bad.length) {
    const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
    const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
    const server = spawnStaticServer(webDir, PORT);
    await sleep(700);
    let n = 0;
    try { n = await armLaw2({ PORT, CDP_PORT, fail }); } catch (e) { fail(e?.stack || String(e)); }
    await stopStaticServer(server);
    console.log(process.exitCode ? 'E2E-SHELL-LAW2 FAIL' : `E2E-SHELL-LAW2 PASS (${n} hops)`);
  }
}
