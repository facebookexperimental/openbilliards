// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-userboot-firstframe.mjs — BOOT-FIRSTFRAME arm (GH-668 S5 slice 2 G6;
// B-SH03 / owner Q1 default B). The boot overlay is the hall's FIRST FRAME:
// it must paint AT REST the moment it exists — the pre-slice-2 register
// started every element at opacity 0 under a rise+fade ladder, so a phone's
// first painted frame was BLACK (critique S-03, bootreal sheet), and its
// hero-lockup wordmark (clamp 44–168 px caps) could leave the viewport.
//   at the first rAF after #ob-boot exists (desktop 1440×900, phone 844×390):
//     (a) the overlay AND the wordmark compute opacity 1 / transform none;
//     (b) the wordmark's rect sits inside the viewport (no clip) — judged
//         BEFORE the web font settles when the box lets us (document.fonts
//         status recorded), i.e. in the swap-in fallback font too;
//     (c) exactly ONE .ob-boot__row paints and it is the current stage;
//     (d) no keyframe animation (CSSAnimation) and no effect longer than the
//         --ob-t-med rung (200 ms) on any boot node;
//   at every data-stage advance: (c) + (d) again;
//   at the exit (.ob-boot--out): the fade is the t-med rung (0.2 s), still
//     no keyframes; and (review r2 P2-1, r2v) the overlay leaves the DOM only
//     AFTER its OWN opacity transitionend, at which instant its COMPUTED
//     opacity is 0 — read in the capture-phase listener (before the driver's
//     own listener can remove it) and recorded; the judge fails a removal
//     with no own end OR a recorded computed opacity > 0. Never removed on a
//     child's bubbling transitionend (the rung fill / the stage row run
//     their t-med effects ~2 frames ahead of the fade). The per-rAF opacity
//     samples are DIAGNOSTICS only (60 fps sampling vs a 200 ms fade: the
//     last painted sample can legitimately read 0.15 — the r2 verifier's
//     "<= 0.05 last sample" parenthetical is retired). The HOLD law (shell.md §9 entry 22) is not re-judged
//     here — e2e-userboot arms 1b / 2b / 12 own WHEN the field leaves; this
//     arm owns HOW it looks while it stands.
//   OB_E2E_FF_OUT=<dir> also writes stills per leg (first observation, each
//   stage, the exit) for the sign-off pack — approximate timing (CDP
//   round-trip), the in-page probe is the judge.
//   node web/tools/e2e-userboot-firstframe.mjs   (standalone: the red-proof
//   runner; e2e-userboot.mjs imports runBootFirstFrameArm)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { runBootFadeCleanupArm } from './test-boot-fade-cleanup.mjs';
import { envTailState } from './lib/lighting-guard.mjs';

// standalone band sizing (run-gate reads this literal): one static server +
// ONE CDP endpoint (both legs ride the same target, metrics re-emulated)
export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-userboot imports runBootFirstFrameArm; standalone it runs on userboot's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-userboot';
const OUT_DIR = process.env.OB_E2E_FF_OUT || '';
const LADDER_MS = 200; // --ob-t-med: the only rung the boot may use

// new-document probe: records the first rAF after #ob-boot exists, every
// data-stage advance and the exit class — all read in-page, same task
const PROBE = `(() => {
  const R = window.__obFF = { seen: -1, raf: null, stages: [], out: null, err: '' };
  const painted = (el) => el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
  const animsOf = (root) => { const out = []; try {
    for (const el of [root, ...root.querySelectorAll('*')]) for (const a of el.getAnimations()) {
      const t = (a.effect && a.effect.getTiming) ? a.effect.getTiming() : {};
      out.push({ kind: a.constructor.name, name: a.animationName || a.transitionProperty || '', dur: Number(t.duration) || 0, iter: t.iterations }); }
  } catch (e) { out.push({ kind: 'ERR', name: String(e), dur: 0 }); } return out; };
  const rows = (b) => [...b.querySelectorAll('.ob-boot__row')].filter(painted).map((r) => r.getAttribute('data-bs'));
  const fill = (b) => { const f = b.querySelector('.ob-progress__fill'); return f ? getComputedStyle(f).transform : ''; };
  // review r2 P2-1 / r2v exit leg: once .ob-boot--out lands, record the
  // overlay's OWN opacity transitionend in the CAPTURE phase on document
  // (it runs before the driver's own target-phase listener can remove the
  // node) and READ getComputedStyle(b).opacity right there — the law says
  // that value is '0' (the transition has ended) at the removal instant.
  // The per-rAF samples until the node leaves the DOM are diagnostics.
  const watchExit = (b) => {
    const X = R.exit = { samples: 0, lastOpacity: -1, lastT: 0, goneAt: 0, ownEnd: null, childEnds: [] };
    document.addEventListener('transitionend', (e) => {
      if (e.target === b && e.propertyName === 'opacity') {
        const computed = getComputedStyle(b).opacity;
        X.ownEnd = { t: performance.now(), computed, opacity: parseFloat(computed), connected: b.isConnected };
      } else if (b.contains(e.target)) X.childEnds.push({ t: performance.now(), prop: e.propertyName, node: String(e.target.className || e.target.tagName) });
    }, true);
    const tick = () => {
      if (!b.isConnected) { X.goneAt = performance.now(); return; }
      X.samples += 1; X.lastOpacity = parseFloat(getComputedStyle(b).opacity); X.lastT = performance.now();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  let armed = false;
  const mo = new MutationObserver(() => {
    const b = document.getElementById('ob-boot');
    if (!b || armed) return;
    armed = true; R.seen = performance.now(); mo.disconnect();
    requestAnimationFrame(() => { try {
      const m = b.querySelector('.ob-boot__mark'); const cs = getComputedStyle(b);
      const ms = m ? getComputedStyle(m) : null; const mr = m ? m.getBoundingClientRect() : null;
      R.raf = { t: performance.now(), stage: b.getAttribute('data-stage'), bootOpacity: parseFloat(cs.opacity),
        bootDisplay: cs.display, bootVisibility: cs.visibility, markOpacity: ms ? parseFloat(ms.opacity) : -1,
        markTransform: ms ? ms.transform : 'missing', markFont: ms ? ms.fontFamily.split(',')[0] : '',
        markPx: ms ? parseFloat(ms.fontSize) : 0, markCase: ms ? ms.textTransform : '',
        mark: mr ? { l: mr.left, t: mr.top, r: mr.right, b: mr.bottom, w: mr.width, h: mr.height } : null,
        vw: innerWidth, vh: innerHeight, fonts: document.fonts ? document.fonts.status : 'n/a',
        rows: rows(b), anims: animsOf(b), fill: fill(b) };
    } catch (e) { R.err = String(e); } });
    new MutationObserver((recs) => { for (const r of recs) {
      if (r.attributeName === 'data-stage') R.stages.push({ t: performance.now(), stage: b.getAttribute('data-stage'), rows: rows(b), anims: animsOf(b), fill: fill(b) });
      if (r.attributeName === 'class' && b.classList.contains('ob-boot--out') && !R.out) { R.out = { t: performance.now(), transition: getComputedStyle(b).transitionDuration, anims: animsOf(b) }; watchExit(b); }
    } }).observe(b, { attributes: true, attributeFilter: ['data-stage', 'class'] });
  });
  mo.observe(document, { childList: true, subtree: true });
})()`;

const LEGS = [
  { tag: 'desktop', metrics: { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false } },
  { tag: 'phone', metrics: { width: 844, height: 390, deviceScaleFactor: 3, mobile: true } },
];
const badAnims = (anims) => anims.filter((a) => a.kind !== 'CSSTransition' || a.dur > LADDER_MS)
  .map((a) => `${a.kind}:${a.name}:${a.dur}ms${a.iter === Infinity ? ':inf' : ''}`);

async function still(c, dir, name) {
  if (!dir) return;
  try {
    const { data } = await c.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, 'base64'));
  } catch { /* the target may be mid-navigation */ }
}

/** One leg: navigate, poll the probe (stills at each stage while it stands),
 * wait for ready + the overlay's exit, then judge the recorded frames. */
async function leg(c, { PORT, fail, tag, metrics }) {
  const pre = `BOOT-FIRSTFRAME ${tag} ${metrics.width}x${metrics.height}`;
  await c.send('Emulation.setDeviceMetricsOverride', metrics);
  const dir = OUT_DIR ? path.join(OUT_DIR, tag) : '';
  if (dir) fs.mkdirSync(dir, { recursive: true });
  await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=ff-${tag}` });
  // poll: first observation → still; each stage advance → still; the exit
  let lastStage = '', seenOut = false, ready = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    let s = null;
    try { s = await c.eval('(() => { const R = window.__obFF; if (!R) return null; const b = document.getElementById("ob-boot"); return { seen: R.seen, stage: b ? b.getAttribute("data-stage") : null, out: !!R.out, gone: !b, ready: window.__test?.ready === true }; })()'); } catch { /* navigating */ }
    if (s) {
      if (s.seen >= 0 && s.stage && s.stage !== lastStage) { lastStage = s.stage; await still(c, dir, `${tag}-${s.stage}.png`); }
      if (s.out && !seenOut) { seenOut = true; await still(c, dir, `${tag}-out.png`); }
      ready = s.ready;
      if (s.gone && ready) break;
    }
    await sleep(40);
  }
  // GH-971 (review r4): the boot's env tail is part of `ready` — a latched tail failure is never settled and is named,
  // both when it kept the boot from ready and when it latched afterwards (lib/lighting-guard.mjs envTailState)
  const env = envTailState(await c.eval('window.__rebakeEnv?.tail?.() ?? null').catch(() => undefined));
  if (!ready) { fail(`${pre}: boot never became ready (the arm cannot judge the exit)${env.failed ? ` — ${env.why}` : ''}`); return; }
  if (env.failed) fail(`${pre}: ${env.why}`);
  // the exit sampler stamps goneAt on its next rAF after the removal — give
  // it up to 500 ms so the judge reads a settled record (never a race)
  for (let i = 0; i < 12; i++) {
    const done = await c.eval('!!(window.__obFF && (!window.__obFF.out || (window.__obFF.exit && window.__obFF.exit.goneAt)))').catch(() => false);
    if (done) break;
    await sleep(40);
  }
  const R = await c.eval('window.__obFF').catch(() => null);
  if (!R || R.seen < 0 || !R.raf) { fail(`${pre}: the probe never saw #ob-boot (${JSON.stringify(R && { seen: R.seen, err: R.err })})`); return; }
  if (R.err) fail(`${pre}: probe error ${R.err}`);
  const f = R.raf;
  const restMark = f.markOpacity >= 0.99 && (f.markTransform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(f.markTransform));
  if (!(f.bootOpacity >= 0.99 && f.bootDisplay !== 'none' && f.bootVisibility === 'visible')) {
    fail(`${pre}: first frame not at rest — overlay opacity ${f.bootOpacity} display ${f.bootDisplay} visibility ${f.bootVisibility}`);
  }
  if (!restMark) fail(`${pre}: wordmark not at rest on the first frame — opacity ${f.markOpacity} transform ${f.markTransform} (the black first frame)`);
  const m = f.mark;
  if (!m || !(m.w > 0 && m.h > 0) || m.l < 0 || m.t < 0 || m.r > f.vw + 0.5 || m.b > f.vh + 0.5) {
    fail(`${pre}: wordmark leaves the viewport ${f.vw}x${f.vh}: ${JSON.stringify(m)} (font ${f.markFont} ${f.markPx}px, fonts ${f.fonts})`);
  }
  if (f.markCase && f.markCase !== 'none') fail(`${pre}: wordmark text-transform ${f.markCase} (sentence case, Q1 default B)`);
  if (!(f.rows.length === 1 && f.rows[0] === f.stage)) fail(`${pre}: first frame paints ${JSON.stringify(f.rows)} stage rows (want exactly [${f.stage}])`);
  const ba = badAnims(f.anims);
  if (ba.length) fail(`${pre}: first frame carries keyframe / over-ladder motion: ${ba.join(', ')}`);
  for (const st of R.stages) {
    if (!(st.rows.length === 1 && st.rows[0] === st.stage)) fail(`${pre}: stage '${st.stage}' paints ${JSON.stringify(st.rows)} rows (want exactly one, the current)`);
    const b2 = badAnims(st.anims);
    if (b2.length) fail(`${pre}: stage '${st.stage}' carries keyframe / over-ladder motion: ${b2.join(', ')}`);
  }
  if (!R.out) fail(`${pre}: the exit class never appeared while the probe watched (reduced motion is not emulated here)`);
  else {
    const dur = parseFloat(R.out.transition) * (/ms$/.test(R.out.transition) ? 1 : 1000);
    if (!(Math.abs(dur - LADDER_MS) < 1)) fail(`${pre}: exit fade ${R.out.transition} (want the t-med rung ${LADDER_MS} ms)`);
    const b3 = badAnims(R.out.anims);
    if (b3.length) fail(`${pre}: exit carries keyframe / over-ladder motion: ${b3.join(', ')}`);
    // review r2 P2-1 / r2v: the operative law is the overlay's OWN opacity
    // transitionend — the removal must follow it, and at that instant the
    // overlay's COMPUTED opacity is 0 (the transition has ended). Two
    // failures: (a) no own end was seen before the node left the DOM (RED on
    // the unfiltered listener: the rung fill's bubbling transitionend, started
    // ~2 frames earlier, removed the field at opacity ~0.3); (b) an own end
    // whose recorded computed opacity read > 0 (or unreadable). The last
    // per-rAF sample is reported for diagnosis only — never judged (60 fps
    // sampling vs a 200 ms fade legitimately paints a last sample of 0.15).
    const X = R.exit;
    const last = X && X.samples ? `last rAF sample opacity ${X.lastOpacity} at +${(X.lastT - R.out.t).toFixed(0)} ms into the fade` : 'no rAF sample landed before the removal (boot frames are long)';
    if (!X || !X.goneAt) fail(`${pre}: exit leg — the overlay never left the DOM while the sampler watched (${JSON.stringify(X && { samples: X.samples, lastOpacity: X.lastOpacity })})`);
    else if (!X.ownEnd) {
      fail(`${pre}: exit leg — the overlay was removed BEFORE its own opacity transition ended: ${last}, gone at +${(X.goneAt - R.out.t).toFixed(0)} ms, ${X.samples} sample(s); child transitionends seen: ${JSON.stringify(X.childEnds.slice(0, 3))} (review r2 P2-1: a child's bubbling transitionend cut the fade)`);
    } else if (!(X.ownEnd.opacity <= 0)) {
      fail(`${pre}: exit leg — at the overlay's own opacity transitionend (+${(X.ownEnd.t - R.out.t).toFixed(0)} ms) its computed opacity read '${X.ownEnd.computed}' (want '0': the transition has ended at the removal instant; review r2v); ${last}, gone at +${(X.goneAt - R.out.t).toFixed(0)} ms`);
    }
  }
  if (dir) fs.writeFileSync(path.join(dir, `${tag}-probe.json`), JSON.stringify(R, null, 1));
  console.log(`${pre}: first rAF +${(f.t - R.seen).toFixed(1)} ms (stage ${f.stage}, fonts ${f.fonts}, ${f.markFont} ${f.markPx}px, `
    + `mark ${m ? `${m.l.toFixed(0)},${m.t.toFixed(0)} ${m.w.toFixed(0)}x${m.h.toFixed(0)}` : 'none'}), `
    + `${R.stages.length} stage advances, exit ${R.out ? R.out.transition : 'unseen'}`
    + (R.exit ? `, removal ${R.exit.ownEnd ? `after the overlay's own opacity end (+${(R.exit.ownEnd.t - R.out.t).toFixed(0)} ms, computed opacity '${R.exit.ownEnd.computed}' there)` : 'WITHOUT the overlay\'s own opacity end'}, `
      + `last sample opacity ${R.exit.lastOpacity} (${R.exit.samples} samples, diagnostic), gone +${(R.exit.goneAt - R.out.t).toFixed(0)} ms, ${R.exit.childEnds.length} child transitionend(s)` : ''));
}

/** The arm: one real-user (tool:false) target on CDP_PORT, the probe installed
 * before any HTML parses, the two metric legs in sequence. */
export async function runBootFirstFrameArm({ PORT, CDP_PORT, fail }) {
  runBootFadeCleanupArm({ fail });
  const errs = [];
  // boot on the origin root so the new-document probe is registered before
  // app.html ever parses (the 3G arm's recipe)
  const c = await launchChrome(`http://127.0.0.1:${PORT}/`, { port: CDP_PORT, tool: false });
  c.onEvent((method, params) => {
    if (method === 'Runtime.exceptionThrown') errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
  });
  try {
    await c.send('Page.addScriptToEvaluateOnNewDocument', { source: PROBE });
    for (const l of LEGS) {
      await leg(c, { PORT, fail, ...l });
      await sleep(300);
    }
    if (errs.length) fail(`BOOT-FIRSTFRAME: page exceptions during the legs: ${errs.slice(0, 2).join(' | ')}`);
  } finally {
    try { await c.send('Emulation.clearDeviceMetricsOverride'); } catch { /* closing */ }
    c.close();
  }
}

// ---- standalone (the red-proof runner; the gate imports the arm above) ----
// (realpath both sides: node realpaths the entry module, so a /tmp scratch
// copy would otherwise never match its own argv[1] and silently do nothing)
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8149);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9374);
  const fail = (msg) => { console.error('E2E-USERBOOT FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runBootFirstFrameArm({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-USERBOOT-FIRSTFRAME FAIL' : 'E2E-USERBOOT-FIRSTFRAME PASS');
}
