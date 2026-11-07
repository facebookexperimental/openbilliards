#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-785-stall-probe.mjs — GH-785 main-thread stall probe (the issue's instrument, published).
//
// Boots the app N times (each launch = a FRESH Chrome profile → a cold per-profile GPU shader cache; the boot order is printed so a
// warm OS-level cache shows as later boots) with the fixture under test and samples the page every 100 ms over CDP:
//   programs = renderer.info.programs.length, rect = visible RectAreaLight count, lights = all lights by type,
//   gi = __gi.state {ready, baked}, venue = __lighting.state().venue.applied?.derived, ready = __test.ready,
//   held = __test.heldFrames() (GH-785: frames the loop ran without a render before the lighting leaf landed; null on a main.js without the gate),
//   rendered = __test.renderedFrames() (delivered frames; null on a main.js without the counter),
//   spot = SpotLight count, shellOpen = body.ob-shell-open, mode = the page's own boot mode: 'tool' when ?obtool/?cinema is on or sessionStorage
//   ob-scripted is set (main.js's rule — a tool boot never constructs the shell), else 'real'. The record prints the mode per boot and in the
//   summary: numbers from the two modes are not comparable (the measurement-in-one-boot-state law).
// A sample whose wall-clock gap to the previous sample exceeds --stall-ms (400) means the main thread was blocked (CDP evaluate
// could not run). Every such gap is printed with what changed across it (programs a→b, rect x→y, spot, shell, gi, venue) and classified:
//   boot-compile = the gap ends on the FIRST DELIVERED FRAME — no frame had been delivered before it (`rendered` 0; on a main.js without
//                  the counter: no program yet) — whatever the light census did across it (the gate holds the boot fixture's lights inside
//                  that frame; `programs` alone is not first-frame evidence: boot() runs cubeCam.update before publishing __dbg, so the
//                  program cache can be > 0 before the first delivered frame — review b19l3 P2); also programs growing BEFORE ready with the
//                  light census unchanged (three.js compiles per material on first use behind the #ob-boot overlay)
//   boot-compile? = AMBIGUOUS (review b19l4 P2): the gap starts at `rendered` 0 but ends with `rendered` > 1 AND a light-count change, or
//                  (review b19l6 P2) the interval has NO baseline sample at all and its first app sample already shows `rendered` > 1 —
//                  at 100 ms polling the counts cannot tell whether the join sat in frame 1 (the gate's own compile) or in frame 2 (a
//                  join after the first delivered frame); printed as `boot-compile? (ambiguous: rendered 0→N, rect a→b, spot x→y)`,
//                  counted per boot and in the summary (`ambiguous boots N`), NOT judged; the STALL-785 line then reads
//                  `PASS (ambiguous N)`, never a silent PASS. The honest split needs a page-side per-frame recorder (b19 follow-up).
//   fixture-join = the visible RectAreaLight count changed across the gap after a delivered frame (the #785 transition)
//   hall-key     = the SpotLight count changed across a gap with the shell open on either side (the hall's SHELL_KEYS join on a REAL boot's
//                  openShell after the #ob-boot handoff re-keys every lit material) — named in the row and counted in the census, NOT judged
//                  under GH-785 (a b19 issue of its own; a tool boot never shows it)
//   venue / gi   = the venue applied/derived state / the GI baked state changed across the gap
//   other        = programs changed with none of the above, or any un-named gap (mid-session — named, never hidden)
// JUDGED under GH-785 (the probe's own criterion): fixture-join at ANY time; every other class except boot-compile / hall-key only AFTER
// readiness (the recorded preReady flag of each gap — review b19l3 P2). Verdict per boot: PASS only for a COMPLETED boot (ready flipped,
// programs seen, the sampler alive to the window end) with no judged gap above --stall-ms. A rejected evaluation after the first app
// sample (closed / poisoned CDP client) is TERMINAL: the boot is `cdp-lost` (named with the sample count and the lost-at ms), never a
// PASS — review b19l3 P2; so is a null / counter-less sample after the first app sample (a reload or navigation took `__dbg` away):
// `obs-lost` — review b19l4 P2; and the window bounds the navigation and every evaluation — a result arriving after --seconds is
// discarded and the boot is `deadline-expired` (incomplete, never a PASS) — review b19l7 P2 — with a poll issued only when the remaining
// window fits its budget and one poll budget of grace for an evaluation in flight (b19l8: the verdict never depends on the polling phase);
// and every app sample carries the document identity (performance.timeOrigin): a change after the first app sample is `doc-replaced`
// (a reload between two successful evaluations; incomplete, never a PASS) — review b19l8 P2-2. Before the first app sample both are the navigation and tolerated. The record's "last sample" is the
// last SUCCESSFUL app sample. The sampler starts before the app navigation (origin bootstrap) so the first ticks are inside the window. The run's
// verdict = every boot PASS.
// Usage: node tools/render/lighting-785-stall-probe.mjs --webdir <export>/web --fixture pendant_bar [--table predator_apex_9ft]
//          [--boots 3] [--seconds 60] [--stall-ms 400] --port <http> --cdp <cdp> [--label base]
//        node tools/render/lighting-785-stall-probe.mjs --selftest      (node-only: the sampler driven by scripted samples + a fake clock;
//          no launcher import, no browser — it never exercises the launch path, so one live boot is still owed after any change)
// Ports: --port / --cdp are REQUIRED and carry no default (ci-bands law: a tool default inside a declared lane band is a lint
// problem; PORT_FLAGS declares the two flags' roles) — the launcher claims the lane band's tail and passes both explicitly.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const PORT_FLAGS = { '--port': 'http', '--cdp': 'cdp' };
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] != null ? process.argv[i + 1] : d; };
const SELFTEST = process.argv.includes('--selftest');
const WEBDIR = path.resolve(argOf('--webdir', 'web'));
const FIXTURE = argOf('--fixture', 'pendant_bar'), TABLE = argOf('--table', 'predator_apex_9ft'), LOOK = argOf('--look', 'default');
const BOOTS = Number(argOf('--boots', 3)), SECONDS = Number(argOf('--seconds', 60)), STALL_MS = Number(argOf('--stall-ms', 400));
const PORT = Number(argOf('--port', NaN)); // http (static server)
const CDPPORT = Number(argOf('--cdp', NaN)); // cdp (Chrome remote debugging)
const LABEL = argOf('--label', path.basename(path.dirname(WEBDIR)));
const SAMPLE = `(() => {
  const d = window.__dbg; if (!d || !d.scene) return null;
  let programs = -1; try { programs = d.renderer.info.programs.length; } catch (e) {}
  const lights = {}; let rect = 0;
  d.scene.traverse((o) => { if (!o.isLight) return; const t = o.type || '?'; lights[t] = (lights[t] || 0) + 1; if (o.isRectAreaLight && o.visible) rect += 1; });
  const spot = lights.SpotLight || 0; const shellOpen = !!(document.body && document.body.classList.contains('ob-shell-open'));
  let mode = 'real'; try { const q = new URLSearchParams(location.search); const on = (k) => q.has(k) && q.get(k) !== '0'; if (on('obtool') || on('cinema') || sessionStorage.getItem('ob-scripted') === '1') mode = 'tool'; } catch (e) {}
  let gi = null; try { const s = window.__gi && window.__gi.state; gi = s ? { ready: !!s.ready, baked: !!s.baked } : null; } catch (e) {}
  let venue = null; try { const L = window.__lighting && window.__lighting.state && window.__lighting.state(); venue = L && L.venue ? { on: !!L.venue.on, derived: !!(L.venue.applied && L.venue.applied.derived), applied: !!L.venue.applied } : null; } catch (e) {}
  let held = null, capped = null, rendered = null; try { const T = window.__test; held = T && typeof T.heldFrames === 'function' ? T.heldFrames() : null; capped = T && typeof T.holdCapped === 'function' ? T.holdCapped() : null; rendered = T && typeof T.renderedFrames === 'function' ? T.renderedFrames() : null; } catch (e) {}
  return { t: Math.round(performance.now()), origin: Math.round(performance.timeOrigin), programs, rect, spot, shellOpen, mode, lights, gi, venue, held, capped, rendered, ready: !!(window.__test && window.__test.ready) };
})()`;
const sig = (s) => JSON.stringify([s.programs, s.rect, s.lights, s.gi, s.venue, s.ready, s.shellOpen]);
// first-frame evidence (review b19l3 P2): no DELIVERED frame before the gap — the sampled `rendered` counter; on a main.js without the
// counter (rendered null) the only evidence left is an empty program cache
const noFrameYet = (a) => !a || (a.rendered != null ? a.rendered === 0 : a.programs <= 0);
const lightsChanged = (a, b) => !!(a && b && (a.rect !== b.rect || (a.spot || 0) !== (b.spot || 0)));
export const classify = (a, b, readyBefore) => {
  if (noFrameYet(a)) {
    // the gap ends on the first delivered frame — the light census may change across it (the gate). Ambiguous when the gap swallowed MORE
    // than one delivered frame and the lights changed: the join may sit in frame 2 (review b19l4 P2) — named, counted, not judged.
    // With NO baseline at all (the first app sample arrives after the gap) a multi-frame interval is ambiguous by construction: there is
    // no census to compare (review b19l5 (b) / b19l6 P2); the plain missing-baseline first frame (rendered 1 or unknown) stays boot-compile
    if (!a) return (b && b.rendered != null && b.rendered > 1) ? 'boot-compile?' : 'boot-compile';
    if (a.rendered === 0 && b && b.rendered != null && b.rendered > 1 && lightsChanged(a, b)) return 'boot-compile?';
    return 'boot-compile';
  }
  if (a && b && a.rect !== b.rect) return 'fixture-join';
  if (!readyBefore && b && b.programs > a.programs) return 'boot-compile';
  if (a && b && (a.spot || 0) !== (b.spot || 0) && (a.shellOpen || b.shellOpen)) return 'hall-key'; // the hall's SHELL_KEYS joining on a real boot — named, not judged
  if (a && b && JSON.stringify(a.venue) !== JSON.stringify(b.venue)) return 'venue';
  if (a && b && JSON.stringify(a.gi) !== JSON.stringify(b.gi)) return 'gi';
  return 'other';
};
const EXEMPT = new Set(['boot-compile', 'boot-compile?', 'hall-key']); // named + counted, never judged under GH-785
// the judged set (review b19l3 P2): fixture joins at ANY time; every other non-exempt class only after readiness (the gap's own preReady flag)
export const judged = (stalls) => stalls.filter((x) => x.cls === 'fixture-join' || (!x.preReady && !EXEMPT.has(x.cls)));
export const verdictOf = (w, stallMs) => {
  const post = judged(w.stalls);
  const worst = post.length ? Math.max(...post.map((x) => x.ms)) : 0;
  const complete = w.readyAt !== null && w.firstProgAt !== null && !w.cdpLost && !w.obsLost && !w.expired && !w.replaced; // no PASS without a completed boot, one document, a sampler alive to the end
  const ambiguous = w.stalls.filter((x) => x.cls === 'boot-compile?').length;
  return { post, worst, complete, ambiguous, ok: complete && worst <= stallMs };
};
/** The sampler window. `evaluate` returns a SAMPLE object (or null before __dbg exists) or rejects; `now`/`sleep` are injectable so the
 *  selftest drives the same loop with scripted samples and a fake clock. After the first APP sample (an object carrying the counters),
 *  a rejected evaluation is terminal (`cdpLost`) and so is a null / counter-less result (`obsLost`: a reload or navigation took `__dbg`
 *  away); before any app sample both are the navigation (tolerated, bounded by the window). */
export const isAppSample = (s) => !!(s && typeof s === 'object' && Number.isFinite(s.programs) && Number.isFinite(s.rect));
const EXPIRED = Symbol('expired');
const POLL_MS = 100; // the sampler's poll interval — also the budget a poll must fit into the remaining window, and the grace an in-flight evaluation gets past the deadline
export async function sampleWindow({ evaluate, now, sleep, seconds, stallMs, onFirstTick = null, timer = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const stalls = []; const trans = []; const modesSeen = new Set();
  let last = null; let lastWall = null; let lastAppWall = null; let lastSig = ''; let firstProgAt = null; let readyAt = null; let samples = 0; let cdpLost = null; let obsLost = null; let expired = null; let replaced = null; let firstOrigin = null;
  const t0 = now(); const deadline = t0 + seconds * 1000; let navigated = false;
  // review b19l7 P2 + b19l8 P2-1: the window bounds the navigation and EVERY evaluation. A poll is issued only if the remaining window fits its
  // budget (POLL_MS); below that the window is COMPLETE (a normal end — the verdict must not depend on the polling phase). An evaluation in
  // flight gets one poll budget of grace past the deadline; one still blocked after that (a stall that outlives the window) is discarded and
  // the boot is `deadline-expired` (incomplete, never a PASS). Before b19l7 a first ready sample landing at 65 s of a 60 s window was accepted.
  const bounded = async (p) => { const remaining = deadline + POLL_MS - now(); if (remaining <= 0) return EXPIRED; const r = await Promise.race([p.then((v) => ({ v })), timer(remaining).then(() => EXPIRED)]); if (r === EXPIRED || now() > deadline + POLL_MS) return EXPIRED; return r.v; };
  while (deadline - now() >= POLL_MS) {
    if (!navigated) { navigated = true; lastWall = now(); if (onFirstTick) { const r = await bounded(onFirstTick()); if (r === EXPIRED) { expired = { atMs: now() - t0, samples, during: 'navigation' }; break; } } }
    let s = null; let err = null;
    try { s = await bounded(evaluate()); } catch (e) { err = e; }
    if (s === EXPIRED) { expired = { atMs: now() - t0, samples, during: samples ? 'sampling' : 'the first sample' }; break; }
    const wall = now();
    if (err && samples > 0) { cdpLost = { atMs: wall - t0, samples, error: String((err && err.message) || err).slice(0, 120) }; break; }
    if (!err && !isAppSample(s) && samples > 0) { obsLost = { atMs: wall - t0, samples, got: s === null ? 'null' : (s === undefined ? 'undefined' : 'a sample without the counters') }; break; }
    // review b19l8 P2-2: every app sample carries the document identity (performance.timeOrigin); a reload between two successful evaluations
    // yields a sample that already has __dbg while readyAt / firstProgAt still belong to the OLD document — a changed origin after the first
    // app sample is `doc-replaced` (incomplete, never a PASS)
    if (!err && isAppSample(s) && s.origin != null) { if (firstOrigin === null) firstOrigin = s.origin; else if (s.origin !== firstOrigin) { replaced = { atMs: wall - t0, samples, from: firstOrigin, to: s.origin }; break; } }
    if (!isAppSample(s)) s = null; // before the first app sample: not yet the app (the navigation)
    if (lastWall !== null && wall - lastWall > stallMs) {
      const cls = classify(last, s || last, readyAt !== null);
      stalls.push({ ms: wall - lastWall, endT: +((wall - t0) / 1000).toFixed(1), cls, preReady: readyAt === null, rendered: `${last ? last.rendered : '?'}→${s ? s.rendered : '?'}`, programs: `${last ? last.programs : '?'}→${s ? s.programs : '?'}`, rect: `${last ? last.rect : '?'}→${s ? s.rect : '?'}`, spot: `${last ? last.spot : '?'}→${s ? s.spot : '?'}`, shell: `${last ? (last.shellOpen ? 'open' : 'closed') : '?'}→${s ? (s.shellOpen ? 'open' : 'closed') : '?'}` });
    }
    lastWall = wall;
    if (s) {
      samples += 1; lastAppWall = wall;
      if (s.programs > 0 && firstProgAt === null) firstProgAt = +((wall - t0) / 1000).toFixed(1);
      if (s.ready && readyAt === null) readyAt = +((wall - t0) / 1000).toFixed(1);
      if (s.mode) modesSeen.add(s.mode);
      const g = sig(s);
      if (g !== lastSig) { lastSig = g; trans.push(`t=${((wall - t0) / 1000).toFixed(1)}s programs ${s.programs} rect ${s.rect} lights ${JSON.stringify(s.lights)} gi ${JSON.stringify(s.gi)} venue ${JSON.stringify(s.venue)} ready ${s.ready} shell ${s.shellOpen ? 'open' : 'closed'}`); }
      last = s;
    }
    await sleep(POLL_MS);
    // review b19l9 P2: a sleep that resumes beyond the deadline + one poll budget left an UNOBSERVED tail (the loop would have exited normally
    // with the tail unsampled — one ready sample at 0 s, a resume at 65 s, ok) — the boot is deadline-expired during sleep
    if (now() > deadline + POLL_MS) { expired = { atMs: now() - t0, samples, during: 'sleep' }; break; }
  }
  // review b19l10 P2 (the completion of b19l9's predicate): at EVERY loop exit — the normal boundary included — the time since the last
  // successful app sample is checked against one poll budget plus the grace; a longer gap is an unobserved tail (a sleep that resumed INSIDE
  // the final polling interval, e.g. ready at 0 ms and a resume at 59,950 ms of 60 s, left the loop complete with nothing classified)
  if (!expired && !cdpLost && !obsLost && !replaced && lastAppWall !== null && now() - lastAppWall > 2 * POLL_MS) expired = { atMs: now() - t0, samples, during: 'sleep', tailMs: now() - lastAppWall };
  return { stalls, trans, last, firstProgAt, readyAt, samples, cdpLost, obsLost, expired, replaced, modesSeen, lastSampleAtMs: lastAppWall !== null ? lastAppWall - t0 : null, windowMs: now() - t0 };
}
// ---- --selftest: the sampler on scripted samples + a fake clock; no launcher, no browser (the launch path stays owed to one live boot) ----
if (SELFTEST) {
  const base = { origin: 1000, programs: 30, rect: 1, spot: 8, shellOpen: false, mode: 'real', lights: { SpotLight: 8, RectAreaLight: 1 }, gi: { ready: true, baked: false }, venue: { on: true, derived: false, applied: false }, held: 4, capped: false, rendered: 0, ready: false };
  const run = async (script, seconds = 2) => { // script = array of steps: { gapMs?, sample | throw }; the last step repeats until the window ends
    let t = 0; let i = 0; let sleepAdvance = null;
    const tail = script[script.length - 1];
    // review b19l9 P3: a repeated tail step carries its per-evaluation LATENCY (`latencyMs`) — case 19's 31 ms evaluations delay EVERY
    // evaluation, not only the first; `gapMs` stays a one-shot blocked interval before that sample (never repeated: the stall cases script
    // one gap); `sleepMs` on a step scripts a late resume of the sleep that follows it (an unobserved tail)
    const evaluate = async () => { const step = i < script.length ? script[i] : (tail.throw ? tail : { sample: tail.sample, latencyMs: tail.latencyMs }); i += 1; if (step.gapMs) t += step.gapMs; if (step.latencyMs) t += step.latencyMs; if (step.sleepMs != null) sleepAdvance = step.sleepMs; if (step.throw) throw new Error(step.throw); return step.sample; };
    return sampleWindow({ evaluate, now: () => t, sleep: async (ms) => { t += (sleepAdvance != null ? sleepAdvance : ms); sleepAdvance = null; }, seconds, stallMs: 400, timer: () => new Promise(() => {}) });
  };
  const cases = [];
  const check = (name, cond, detail) => { cases.push({ name, ok: !!cond }); console.log(`[785] SELFTEST ${cases.length}: ${cond ? 'PASS' : 'FAIL'} — ${name}${detail ? ' — ' + detail : ''}`); };
  // 1 (A1, false green): one ready sample, then the client rejects every evaluation → cdp-lost, never PASS
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: readyS }, { throw: 'CDP client is poisoned: websocket closed' }]);
    const v = verdictOf(w, 400);
    check('ready sample then CDP rejections → cdp-lost, not complete, not PASS', w.cdpLost && w.cdpLost.samples === 1 && !v.complete && !v.ok, `cdpLost ${JSON.stringify(w.cdpLost)} samples ${w.samples}`); }
  // 2 (A2, false red): programs already > 0 before the first delivered frame (cubeCam.update), the fixture lands inside a > 400 ms first frame → boot-compile, not fixture-join
  { const a = { ...base, programs: 30, rect: 1, rendered: 0 }; const b = { ...base, programs: 60, rect: 3, rendered: 1 }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 600, sample: b }, { sample: c }]);
    const v = verdictOf(w, 400); const g = w.stalls[0];
    check('> 400 ms first delivered frame with programs already > 0 and rect 1→3 → boot-compile, PASS', g && g.cls === 'boot-compile' && v.ok, `stalls ${JSON.stringify(w.stalls.map((x) => [x.ms, x.cls, x.rect]))}`); }
  // 2b (the documented fallback): a main.js WITHOUT the rendered counter — only an empty program cache is first-frame evidence
  { const a = { ...base, programs: 30, rect: 1, rendered: null }; const b = { ...base, programs: 60, rect: 3, rendered: null }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 600, sample: b }, { sample: c }]);
    const g = w.stalls[0];
    check('same gap with rendered null (no counter) and programs 30 → fixture-join (fallback keeps the old rule)', g && g.cls === 'fixture-join' && !verdictOf(w, 400).ok, `cls ${g && g.cls}`); }
  // 3 (A3, false red): a pre-ready venue gap is NOT judged; the same gap after ready IS
  { const a = { ...base, programs: 60, rect: 3, rendered: 2, ready: false }; const b = { ...a, venue: { on: true, derived: true, applied: true } }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 500, sample: b }, { sample: c }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('pre-ready venue gap → class venue, preReady, NOT judged → PASS', g && g.cls === 'venue' && g.preReady && v.post.length === 0 && v.ok, `stalls ${JSON.stringify(w.stalls.map((x) => [x.ms, x.cls, x.preReady]))}`);
    const a2 = { ...a, ready: true }; const b2 = { ...b, ready: true };
    const w2 = await run([{ sample: a2 }, { gapMs: 500, sample: b2 }]);
    const g2 = w2.stalls[0]; const v2 = verdictOf(w2, 400);
    check('the same venue gap after ready → judged → FAIL', g2 && g2.cls === 'venue' && !g2.preReady && v2.post.length === 1 && !v2.ok, `stalls ${JSON.stringify(w2.stalls.map((x) => [x.ms, x.cls, x.preReady]))}`); }
  // 4: the hall's key spots joining after ready on a real boot → hall-key, named, not judged
  { const a = { ...base, programs: 61, rect: 3, rendered: 40, ready: true, shellOpen: true }; const b = { ...a, programs: 81, spot: 10, lights: { SpotLight: 10, RectAreaLight: 4 } };
    const w = await run([{ sample: a }, { gapMs: 450, sample: b }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('post-ready SpotLight 8→10 with the shell open → hall-key, not judged → PASS', g && g.cls === 'hall-key' && v.post.length === 0 && v.ok, `cls ${g && g.cls}`); }
  // 5: a fixture join after a delivered frame is judged at any time (pre-ready too)
  { const a = { ...base, programs: 60, rect: 1, rendered: 3, ready: false }; const b = { ...a, rect: 3, programs: 80 };
    const w = await run([{ sample: a }, { gapMs: 500, sample: b }, { sample: { ...b, ready: true } }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('pre-ready RectAreaLight 1→3 after a delivered frame → fixture-join, judged → FAIL', g && g.cls === 'fixture-join' && v.post.length === 1 && !v.ok, `cls ${g && g.cls}`); }
  // 6: rejections BEFORE any sample are the navigation, tolerated; the window then completes normally
  { const s = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ throw: 'Execution context was destroyed' }, { throw: 'Execution context was destroyed' }, { sample: s }]);
    check('rejections before the first sample are tolerated; the boot completes → PASS', !w.cdpLost && verdictOf(w, 400).ok, `samples ${w.samples}`); }
  // 9 (A1', review b19l4): one ready app sample, then null results (a reload took __dbg away) → obs-lost, not complete, not PASS
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: readyS }, { sample: null }]);
    const v = verdictOf(w, 400);
    check('ready sample then null samples → obs-lost, not complete, not PASS; last sample = the ready one', w.obsLost && w.obsLost.samples === 1 && !v.complete && !v.ok && w.lastSampleAtMs === 0, `obsLost ${JSON.stringify(w.obsLost)} lastSampleAtMs ${w.lastSampleAtMs}`); }
  // 10: nulls before the first app sample are the navigation; then a ready sample → PASS
  { const s = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: null }, { sample: null }, { sample: s }]);
    check('null samples before the first app sample tolerated; the boot completes → PASS', !w.obsLost && !w.cdpLost && verdictOf(w, 400).ok, `samples ${w.samples}`); }
  // 11: a sample WITHOUT the counters after the first app sample → obs-lost
  { const s = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: s }, { sample: { ready: true } }]);
    check('a counter-less sample after the first app sample → obs-lost', w.obsLost && w.obsLost.got === 'a sample without the counters' && !verdictOf(w, 400).ok, `obsLost ${JSON.stringify(w.obsLost)}`); }
  // 12 (A2', review b19l4): the 1300 ms gap from rendered 0 to rendered 2 with rect 1→3 → boot-compile? (ambiguous), counted, not judged
  { const a = { ...base, programs: 30, rect: 1, rendered: 0 }; const b = { ...base, programs: 60, rect: 3, rendered: 2 }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 1300, sample: b }, { sample: c }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('1300 ms gap rendered 0→2 with rect 1→3 → boot-compile? (ambiguous), counted 1, not judged, still complete', g && g.cls === 'boot-compile?' && v.ambiguous === 1 && v.post.length === 0 && v.ok, `stalls ${JSON.stringify(w.stalls.map((x) => [x.ms, x.cls, x.rendered, x.rect]))}`); }
  // 13: the plain first frame (rendered 0→1, no light change) → boot-compile, not ambiguous
  { const a = { ...base, programs: 30, rect: 3, rendered: 0 }; const b = { ...base, programs: 60, rect: 3, rendered: 1 }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 900, sample: b }, { sample: c }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('900 ms first frame rendered 0→1 with no light change → boot-compile, ambiguous 0', g && g.cls === 'boot-compile' && v.ambiguous === 0 && v.ok, `cls ${g && g.cls}`); }
  // 15 (review b19l6 P2): NO baseline (nulls) → a 1300 ms gap → the first app sample at rendered 2 → boot-compile? (ambiguous), counted, not judged, complete
  { const b = { ...base, programs: 60, rect: 3, rendered: 2 }; const c = { ...b, ready: true };
    const w = await run([{ sample: null }, { gapMs: 1300, sample: b }, { sample: c }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('missing baseline: null → 1300 ms gap → first app sample rendered 2 → boot-compile? (ambiguous 1), not judged, complete', g && g.cls === 'boot-compile?' && v.ambiguous === 1 && v.post.length === 0 && v.ok, `stalls ${JSON.stringify(w.stalls.map((x) => [x.ms, x.cls, x.rendered]))}`); }
  // 16: the plain missing-baseline first frame (rendered 1) stays boot-compile
  { const b = { ...base, programs: 60, rect: 3, rendered: 1 }; const c = { ...b, ready: true };
    const w = await run([{ sample: null }, { gapMs: 900, sample: b }, { sample: c }]);
    const g = w.stalls[0]; const v = verdictOf(w, 400);
    check('missing baseline: null → 900 ms gap → first app sample rendered 1 → boot-compile, ambiguous 0', g && g.cls === 'boot-compile' && v.ambiguous === 0 && v.ok, `cls ${g && g.cls}`); }
  // 14: rendered 0→3 with NO light change → boot-compile (a long first frame followed by quick frames; nothing to attribute)
  { const a = { ...base, programs: 30, rect: 3, rendered: 0 }; const b = { ...base, programs: 60, rect: 3, rendered: 3 }; const c = { ...b, ready: true };
    const w = await run([{ sample: a }, { gapMs: 900, sample: b }, { sample: c }]);
    const g = w.stalls[0];
    check('900 ms gap rendered 0→3 with no light change → boot-compile (not ambiguous)', g && g.cls === 'boot-compile' && verdictOf(w, 400).ambiguous === 0, `cls ${g && g.cls}`); }
  // 17 (review b19l7 P2): the first (ready) sample arrives at 65 s of a 60 s window → discarded, deadline-expired, incomplete, not PASS
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ gapMs: 65000, sample: readyS }], 60);
    const v = verdictOf(w, 400);
    check('first sample at 65 s of a 60 s window → deadline-expired, samples 0, not complete, not PASS', w.expired && w.samples === 0 && !v.complete && !v.ok && w.readyAt === null, `expired ${JSON.stringify(w.expired)}`); }
  // 18: the first sample at 55 s of a 60 s window → judged normally: a missing-baseline gap ending at rendered 1 = the plain first frame
  //     (boot-compile), then ready → complete, PASS (with rendered ≥ 2 it would be the b19l6 ambiguous case — still complete)
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 1, ready: true };
    const w = await run([{ gapMs: 55000, sample: readyS }, { sample: readyS }], 60);
    const v = verdictOf(w, 400);
    check('first sample at 55 s of a 60 s window → accepted, boot-compile pre-ready, complete, PASS', !w.expired && w.samples >= 1 && v.complete && v.ok && w.stalls[0] && w.stalls[0].cls === 'boot-compile', `stalls ${JSON.stringify(w.stalls.map((x) => [x.ms, x.cls]))}`); }
  // 19 (review b19l8 P2-1): normal 31 ms evaluations across a whole 60 s window → the last poll is simply not issued; complete, ok, not expired
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ latencyMs: 31, sample: readyS }], 60);
    const v = verdictOf(w, 400);
    // INVERSE CHECK: at the window's end the remaining time (60000 − windowMs) is positive but shorter than one evaluation (31 ms) — the pre-b19l8 loop
    // (`while (now() < deadline)`) would have issued that poll and discarded its post-deadline result: deadline-expired; this rule does not issue it
    const remainingAtEnd = 60000 - w.windowMs; const inverse = remainingAtEnd > 0 && remainingAtEnd < 31;
    check('31 ms evaluations across a 60 s window → complete, ok, expired null (the verdict does not depend on the polling phase)', !w.expired && v.complete && v.ok && w.samples > 400 && inverse, `samples ${w.samples} windowMs ${w.windowMs} (remaining at the end ${remainingAtEnd} ms < one 31 ms evaluation → the pre-b19l8 rule would have polled and expired: inverse check ${inverse ? 'holds' : 'DOES NOT HOLD'})`); }
  // 20 (review b19l8 P2-2): a reload between two successful evaluations — the new document's samples carry another timeOrigin and reset counters → doc-replaced, not ok
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true }; const fresh = { ...base, origin: 2000, programs: 14, rect: 1, rendered: 0, ready: false };
    const w = await run([{ sample: readyS }, { sample: readyS }, { sample: fresh }, { sample: fresh }]);
    const v = verdictOf(w, 400);
    check('ready sample, then samples from a NEW document (timeOrigin 1000 → 2000, counters reset) → doc-replaced, not complete, not PASS', w.replaced && w.replaced.from === 1000 && w.replaced.to === 2000 && w.replaced.samples === 2 && !v.complete && !v.ok, `replaced ${JSON.stringify(w.replaced)}`); }
  // 21: the same timeOrigin throughout → unaffected
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: readyS }]);
    check('one document throughout → not replaced, complete, PASS', !w.replaced && verdictOf(w, 400).ok, `samples ${w.samples}`); }
  // 22 (review b19l9 P2-B): one ready sample at 0 s, then the sleep resumes at 65 s → an unobserved tail → deadline-expired during sleep, not PASS
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: readyS, sleepMs: 65000 }, { sample: readyS }], 60);
    const v = verdictOf(w, 400);
    check('one ready sample, then the sleep resumes at 65 s of a 60 s window → deadline-expired during sleep, samples 1, not PASS', w.expired && w.expired.during === 'sleep' && w.samples === 1 && !v.ok, `expired ${JSON.stringify(w.expired)}`); }
  // 23 (review b19l10 P2): ready at 0 ms, the sleep resumes INSIDE the final polling interval (59,950 ms of 60 s) → the loop exits at the boundary;
  //    the tail since the last app sample (59,950 ms) is unobserved → deadline-expired during sleep, not ok
  { const readyS = { ...base, programs: 60, rect: 3, rendered: 5, ready: true };
    const w = await run([{ sample: readyS, sleepMs: 59950 }, { sample: readyS }], 60);
    const v = verdictOf(w, 400);
    check('ready at 0 ms, sleep resumes at 59,950 ms of 60 s (inside the last poll interval) → deadline-expired during sleep (tail 59,950 ms), samples 1, not PASS', w.expired && w.expired.during === 'sleep' && w.expired.tailMs === 59950 && w.samples === 1 && !v.ok, `expired ${JSON.stringify(w.expired)}`); }
  const okN = cases.filter((c) => c.ok).length;
  console.log(`[785] SELFTEST: launcher not imported (the selftest branch runs before the launcher import statement); no browser`);
  console.log(`SELFTEST-785 ${okN === cases.length ? 'PASS' : 'FAIL'} ${okN}/${cases.length}`);
  process.exit(okN === cases.length ? 0 : 1);
}
if (!Number.isInteger(PORT) || !Number.isInteger(CDPPORT)) { console.error('[785] REFUSED: --port <http> and --cdp <cdp> are required (no defaults — ci-bands law)'); process.exit(2); }
if (!fs.existsSync(path.join(WEBDIR, 'app.html'))) { console.error(`[785] REFUSED: no app.html under --webdir ${WEBDIR}`); process.exit(2); }
const launcher = await import(pathToFileURL(path.join(WEBDIR, 'tools/cdp.mjs')).href); // the tree under test's own launcher (its preflight matches the served tree)
const server = launcher.spawnStaticServer(WEBDIR, PORT); await launcher.sleep(700);
const url = `http://127.0.0.1:${PORT}/app.html?table=${TABLE}&look=${LOOK}&fixture=${FIXTURE}&seed=7`;
console.log(`[785] START ${new Date().toISOString()} label ${LABEL} webdir ${WEBDIR} fixture ${FIXTURE} table ${TABLE} boots ${BOOTS} seconds ${SECONDS} stall>${STALL_MS}ms ports http ${PORT} cdp ${CDPPORT}`);
const allPost = []; const allHK = []; const allModes = new Set(); let passBoots = 0; let lostBoots = 0; let obsLostBoots = 0; let ambiguousBoots = 0; let expiredBoots = 0; let replacedBoots = 0;
try {
  for (let b = 1; b <= BOOTS; b++) {
    // review b19l P2: the sampler runs BEFORE the measured navigation — the client boots on the origin, the loop starts, then the app
    // URL is navigated, so the boot's first hundreds of ms (the held ticks, the first compile) are inside the sampled window
    const chrome = await launcher.launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDPPORT, width: 1280, height: 800, preflight: false });
    const t0 = Date.now();
    let w;
    try {
      w = await sampleWindow({ evaluate: () => chrome.eval(SAMPLE), now: Date.now, sleep: launcher.sleep, seconds: SECONDS, stallMs: STALL_MS,
        onFirstTick: async () => { await chrome.send('Page.navigate', { url }); console.log(`[785] boot ${b}: navigated to the app at t=${((Date.now() - t0) / 1000).toFixed(2)}s (sampler already running)`); } });
    } finally { try { const r = chrome.close?.(); if (r && typeof r.then === 'function') await r.catch(() => {}); } catch { /* the launcher's own teardown reaps the child */ } }
    const { stalls, trans, last, firstProgAt, readyAt, samples, cdpLost, obsLost, expired, replaced, modesSeen } = w;
    const v = verdictOf(w, STALL_MS); const post = v.post; const worst = v.worst; const complete = v.complete; const ok = v.ok;
    if (ok) passBoots += 1; if (cdpLost) lostBoots += 1; if (obsLost) obsLostBoots += 1; if (expired) expiredBoots += 1; if (replaced) replacedBoots += 1; if (v.ambiguous) ambiguousBoots += 1; allPost.push(...post.map((x) => x.ms));
    const ff = stalls.filter((x) => x.cls === 'boot-compile').map((x) => x.ms);
    const hk = stalls.filter((x) => x.cls === 'hall-key').map((x) => x.ms); allHK.push(...hk); // named + counted, not judged under GH-785
    const preOther = stalls.filter((x) => x.preReady && !EXEMPT.has(x.cls) && x.cls !== 'fixture-join').map((x) => `${x.cls} ${x.ms}`); // pre-ready venue/gi/other: named, not judged
    for (const m of modesSeen) allModes.add(m);
    const mode = modesSeen.size ? [...modesSeen].join('+') : 'unknown';
    console.log(`[785] boot ${b}/${BOOTS} (${LABEL}): boot mode ${mode}; samples ${samples} (last at ${w.lastSampleAtMs == null ? 'n/a' : (w.lastSampleAtMs / 1000).toFixed(1) + 's'} of a ${(w.windowMs / 1000).toFixed(1)}s window)${cdpLost ? `; CDP-LOST at ${(cdpLost.atMs / 1000).toFixed(1)}s after ${cdpLost.samples} samples (${cdpLost.error})` : ''}${obsLost ? `; OBS-LOST at ${(obsLost.atMs / 1000).toFixed(1)}s after ${obsLost.samples} samples (got ${obsLost.got})` : ''}${expired ? `; DEADLINE-EXPIRED at ${(expired.atMs / 1000).toFixed(1)}s during ${expired.during} after ${expired.samples} samples${expired.tailMs != null ? ` (unobserved tail ${(expired.tailMs / 1000).toFixed(1)}s since the last app sample)` : ' (a late result discarded)'}` : ''}${replaced ? `; DOC-REPLACED at ${(replaced.atMs / 1000).toFixed(1)}s after ${replaced.samples} samples (timeOrigin ${replaced.from} → ${replaced.to})` : ''}${v.ambiguous ? `; AMBIGUOUS first-frame gaps ${v.ambiguous} (counted, not judged)` : ''}; first programs at t=${firstProgAt}s ready at t=${readyAt}s; heldFrames ${last && last.held != null ? last.held : 'n/a'} holdCapped ${last && last.capped != null ? last.capped : 'n/a'} renderedFrames ${last && last.rendered != null ? last.rendered : 'n/a'}; boot-compile gaps (pre-ready, allowed) ${JSON.stringify(ff)} ms; hall-key gaps (named, not judged under GH-785) ${JSON.stringify(hk)} ms; pre-ready named gaps (not judged) ${JSON.stringify(preOther)}; final ${last ? `programs ${last.programs} rect ${last.rect} gi ${JSON.stringify(last.gi)} venue ${JSON.stringify(last.venue)}` : 'no sample'}`);
    for (const l of trans) console.log(`[785]   ${l}`);
    for (const x of stalls.sort((p, q) => q.ms - p.ms)) console.log(`[785]   STALL ${x.ms} ms ending t=${x.endT}s class ${x.cls}${x.cls === 'boot-compile?' ? ` (ambiguous: rendered ${x.rendered}, rect ${x.rect}, spot ${x.spot})` : ''}${x.preReady ? ' (pre-ready)' : ' (after ready)'} programs ${x.programs} rect ${x.rect} spot ${x.spot} shell ${x.shell} rendered ${x.rendered}`);
    console.log(`[785] boot ${b} verdict: judged stalls (fixture-join any time + non-exempt classes after ready) sorted ${JSON.stringify(post.map((x) => x.ms).sort((p, q) => p - q))} max ${worst} ms → ${ok ? (v.ambiguous ? `PASS (ambiguous ${v.ambiguous})` : 'PASS') : (cdpLost ? `CDP-LOST at ${(cdpLost.atMs / 1000).toFixed(1)}s after ${cdpLost.samples} samples — not a PASS` : (obsLost ? `OBS-LOST at ${(obsLost.atMs / 1000).toFixed(1)}s after ${obsLost.samples} samples — not a PASS` : (expired ? `DEADLINE-EXPIRED at ${(expired.atMs / 1000).toFixed(1)}s during ${expired.during} — not a PASS` : (replaced ? `DOC-REPLACED at ${(replaced.atMs / 1000).toFixed(1)}s after ${replaced.samples} samples — not a PASS` : (!complete ? 'INCOMPLETE (ready ' + (readyAt === null ? 'never flipped' : 'at ' + readyAt + 's') + ', programs ' + (firstProgAt === null ? 'never seen' : 'at ' + firstProgAt + 's') + ') — not a PASS' : 'FAIL (' + post.filter((x) => x.ms > STALL_MS).map((x) => x.cls + ' ' + x.ms + 'ms').join(', ') + ')')))))}`);
  }
} finally { await launcher.stopStaticServer(server); }
console.log(`[785] SUMMARY ${LABEL} fixture ${FIXTURE} table ${TABLE}: boot mode ${allModes.size ? [...allModes].join('+') : 'unknown'}; boots PASS ${passBoots}/${BOOTS}; cdp-lost boots ${lostBoots}; obs-lost boots ${obsLostBoots}; expired boots ${expiredBoots}; replaced boots ${replacedBoots}; ambiguous boots ${ambiguousBoots}; all judged stall samples sorted ${JSON.stringify(allPost.sort((p, q) => p - q))}; hall-key gaps (named, not judged) ${allHK.length} sorted ${JSON.stringify(allHK.sort((p, q) => p - q))} ms`);
console.log(`STALL-785 ${passBoots === BOOTS ? (ambiguousBoots ? `PASS (ambiguous ${ambiguousBoots})` : 'PASS') : 'FAIL'} (${LABEL} ${FIXTURE} ${TABLE}: ${passBoots}/${BOOTS} boots complete without a fixture-join or non-exempt post-ready stall > ${STALL_MS} ms; cdp-lost ${lostBoots}; obs-lost ${obsLostBoots}; expired ${expiredBoots}; replaced ${replacedBoots}; ambiguous ${ambiguousBoots}; boot mode ${allModes.size ? [...allModes].join('+') : 'unknown'})`);
process.exit(passBoots === BOOTS ? 0 : 1);
