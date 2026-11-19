// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-movedhold.mjs — arm MOVED-HOLD of the ui-shell gate (#1168): a
// card hold that the column's own motion cancels releases INERT, and a hold
// that only an unrelated scroller disarms still delivers its tap.
//
// The practice column's fold-snap settle (or landing) can move the column
// under a still finger. The card hold disarms on any document scroll, and
// before the fix the release then clicked whatever had slid under the
// finger (the native lab: "Free practice", which exited to the table).
// shell.js now swallows that release's click as it swallows a commit's,
// when the scroll was the document's or a scroller's that contains the
// pressed element (shell.md §9 entry 39).
//
// Construction (phone 844x390 coarse, REAL-user boot, REAL CDP touch):
//   * the practice place is landed by a REAL rail tap; the first of Q4(3)'s
//     hold targets inside the column that RESTS (rect unchanged across 4
//     frames and >= 150 ms since the last document scroll), hit-tests to
//     itself inside #ob-practice's scrollport and has a control the column
//     can carry under it is the press point;
//   * a still touch lands there; 100 ms later the column moves by an instant
//     scroll of #ob-practice (it stands in for a settle: the shell cannot
//     tell them apart) until the nearest such control's centre stands under
//     the finger, and the arm waits one frame so the scroll event is out;
//   * two bands, each on a fresh landing: SHORT, the finger lifts 250 ms
//     after the press, and LONG, 700 ms after it. The band is judged on the
//     page's own clock: pointerup.timeStamp - pointerdown.timeStamp must be
//     under shell.js's HOLD_MS (read from this tree's app/shell.js) for
//     SHORT, and at or past it for LONG. An attempt outside its band is
//     logged and retried, at most 3 attempts per band; a band with no
//     attempt inside it is UNJUDGEABLE.
// Judged per release, 500 ms after the lift: no click reached the page after
// the touchstart (a capture counter behind the shell's own swallow, as
// Q4(3)'s), the shell is still open, no drill picker or drill, the settings
// blob unchanged. UNJUDGEABLE (a fail line, never a pass): no target rested
// with a control in reach, the touch never reached the page on its target,
// the lift never reached the page, no attempt inside the band, no document
// scroll while the finger was down, no control under the finger just before
// the lift.
// UNRELATED SCROLLER (the scope of the mark): a still touch on the same kind
// of hold target; 100 ms later a test-made overflow element outside the
// section (fixed, pointer-events none, removed after) scrolls by an instant
// scroll while the column stays still; the finger lifts in the SHORT band
// (same clock, same 3 attempts). Judged: exactly 1 click, on the pressed
// element, the shell open, no picker or drill, the settings unchanged.
// UNJUDGEABLE: as above, plus no scroll of that element while the finger was
// down, or any scroll of the column or the document.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +5 phone slot after Q4L —
// PORT_INVENTORY unchanged) and stands alone for a fast red proof:
//   node web/tools/e2e-shell-movedhold.mjs  (OB_E2E_PORT / OB_E2E_CDP_PORT)
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { sleep, spawnStaticServer, stopStaticServer } from './cdp.mjs';
import { launchPhone, touchStart, touchEnd } from './touch-cdp.mjs';

// standalone band shape = e2e-shell's (the arm sits on its +5 slot)
export const PORT_INVENTORY = { http: 1, cdp: 6 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

// Q4(3)'s hold targets inside the practice column (the module's own text: a
// press there arms the card hold; the section h2 sits above the scrollport,
// where no column motion can carry a control under it)
const TARGETS = ['#ob-practice-assist-title', '[data-ob="practice-last"] p'];
// what the release would act on
const CONTROL = 'button, a[href], input, select, textarea, summary, label, [role="button"], [role="radio"], '
  + '[role="link"], [role="tab"], [role="switch"], [role="checkbox"], [role="option"], [role="menuitem"]';
const EPS = 1e-9;
// the hold threshold the bands are judged against: shell.js's own constant
const HOLD_MS = Number(/\bHOLD_MS = (\d+)/.exec(fs.readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app/shell.js'), 'utf8'))?.[1]);
const OTHER = 'ob-e2e-mh-other'; // the unrelated scroller's id (test-made, removed after)

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
// the shell open, settled, at `id`'s anchor pose (e2e-shell's waitLanded)
async function waitLanded(c, id, tries = 100) {
  return waitFor(c, `(() => {
    const s = window.__shell;
    if (!s || !s.isOpen() || s.moving() || s.place() !== '${id}') return false;
    const a = s.registry().find((p) => p.id === '${id}').anchor;
    const p = s.pose();
    return Math.abs(p.radius - a.radius) < ${EPS} && Math.abs(p.theta - a.theta) < ${EPS}
      && Math.abs(p.phi - a.phi) < ${EPS} && Math.abs(p.target[0] - a.tx) < ${EPS}
      && Math.abs(p.target[2] - a.tz) < ${EPS};
  })()`, tries, 150);
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

/** the first target that rests, hit-tests to itself and has a control the
 * column can carry under its centre: { x, y, sel, d, want } or { miss } */
const PRESS_POINT = `(async () => {
  const root = document.getElementById('ob-practice');
  if (!root) return { miss: 'no #ob-practice' };
  const CONTROL = ${JSON.stringify(CONTROL)};
  const misses = [];
  for (const sel of ${JSON.stringify(TARGETS)}) {
    const el = document.querySelector(sel);
    if (!el) { misses.push(sel + ': absent'); continue; }
    let lastScroll = performance.now();
    const onScroll = () => { lastScroll = performance.now(); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    const t0 = performance.now();
    let prev = null;
    let same = 0;
    const rested = () => same >= 4 && performance.now() - lastScroll >= 150;
    while (!rested() && performance.now() - t0 < 4000) {
      await new Promise((res) => requestAnimationFrame(res));
      const r = el.getBoundingClientRect();
      const key = r.x.toFixed(1) + ',' + r.y.toFixed(1);
      same = key === prev ? same + 1 : 0;
      prev = key;
    }
    document.removeEventListener('scroll', onScroll, true);
    if (!rested()) { misses.push(sel + ': never rested in 4 s'); continue; }
    const b = el.getBoundingClientRect();
    const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit)) || hit.closest(CONTROL)) {
      misses.push(sel + ': hit ' + (hit ? hit.tagName : 'nothing')); continue;
    }
    const port = root.getBoundingClientRect(), portTop = port.top + root.clientTop;
    if (y < portTop || y > portTop + root.clientHeight) { misses.push(sel + ': outside the #ob-practice scrollport'); continue; }
    const top = root.scrollTop, max = root.scrollHeight - root.clientHeight;
    let best = null;
    for (const ctl of root.querySelectorAll(CONTROL)) {
      if (!ctl.checkVisibility?.({ visibilityProperty: true })) continue;
      const r = ctl.getBoundingClientRect();
      if (r.width < 8 || r.height < 8 || x < r.left + 2 || x > r.right - 2) continue;
      const d = Math.round(r.top + r.height / 2 - y); // > 0: the control is below, the column moves up
      if (Math.abs(d) < 6 || top + d < 0 || top + d > max) continue;
      if (!best || Math.abs(d) < Math.abs(best.d)) best = { ctl, d };
    }
    if (!best) { misses.push(sel + ': no control in reach (scrollTop ' + top + ' of ' + max + ')'); continue; }
    const owner = best.ctl.closest('[data-ob]');
    return { x, y, sel, d: best.d, top, max,
      want: best.ctl.tagName + (best.ctl.dataset.assist ? '[data-assist=' + best.ctl.dataset.assist + ']' : '')
        + (owner ? ' in ' + owner.dataset.ob : '') };
  }
  return { miss: misses.join('; ') };
})()`;
// a passive record of the press: its pointerdown target (on the press
// point's own element?) and page-clock timestamp, the scrolls while it is
// down (count and targets), its lift and timestamp, and every click that
// reached the page after it
const ARM = (sel) => `(() => {
  window.__mhOff?.();
  const CONTROL = ${JSON.stringify(CONTROL)};
  const target = document.querySelector(${JSON.stringify(sel)});
  const L = window.__mh = { down: null, up: null, scrolls: 0, on: [], clicks: [] };
  const desc = (el) => (el instanceof Element ? { tag: el.tagName, id: el.id || null,
    ob: el.closest('[data-ob]')?.dataset.ob ?? null, control: !!el.closest(CONTROL),
    onTarget: !!target && (el === target || target.contains(el)) } : null);
  const onDown = (e) => { if (!L.down && e.pointerType === 'touch') L.down = { ...desc(e.target), t: e.timeStamp }; };
  const onUp = (e) => { if (L.down && !L.up && e.pointerType === 'touch') L.up = { t: e.timeStamp }; };
  const onScroll = (e) => { if (L.down && !L.up) {
    L.scrolls += 1;
    if (L.on.length < 8) L.on.push(e.target === document ? 'document' : (e.target.id || e.target.tagName));
  } };
  const onClick = (e) => { if (L.down) L.clicks.push({ ...desc(e.target), detail: e.detail }); };
  addEventListener('pointerdown', onDown, true);
  addEventListener('pointerup', onUp, true);
  document.addEventListener('scroll', onScroll, { capture: true, passive: true });
  addEventListener('click', onClick, true);
  window.__mhOff = () => {
    removeEventListener('pointerdown', onDown, true);
    removeEventListener('pointerup', onUp, true);
    document.removeEventListener('scroll', onScroll, true);
    removeEventListener('click', onClick, true);
    window.__mhOff = null;
  };
  return true;
})()`;
// the column's own motion: an instant scroll by d (the finger stays down);
// resolves after the next frame's callbacks, so the update that dispatches
// the scroll event (its scroll steps run before the frame callbacks) is done
const MOVE = (d) => `(async () => {
  const root = document.getElementById('ob-practice');
  root.scrollTo({ top: root.scrollTop + ${d}, behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => r()));
  return root.scrollTop;
})()`;
const UNDER = (pt) => `(() => {
  const hit = document.elementFromPoint(${pt.x}, ${pt.y});
  const ctl = hit?.closest(${JSON.stringify(CONTROL)}) ?? null;
  return { hit: hit ? hit.tagName : null, control: ctl ? ctl.tagName : null,
    ob: ctl?.closest('[data-ob]')?.dataset.ob ?? null };
})()`;
const STATE = `({ open: window.__shell.isOpen(), picker: window.__drills?.isOpen?.() ?? null,
  drill: window.__drills?.state?.()?.id ?? null, settings: JSON.stringify(window.__settings?.get?.() ?? null),
  column: document.getElementById('ob-practice')?.scrollTop ?? null,
  mh: window.__mh ? JSON.parse(JSON.stringify(window.__mh)) : null })`;
// the unrelated scroller: a small fixed overflow box in a corner, outside
// every card section, that no touch can land on (pointer-events none)
const OTHER_SETUP = `(() => {
  document.getElementById('${OTHER}')?.remove();
  const o = document.createElement('div');
  o.id = '${OTHER}';
  o.style.cssText = 'position:fixed;left:0;bottom:0;width:40px;height:40px;overflow:auto;pointer-events:none;opacity:0';
  o.appendChild(document.createElement('div')).style.height = '400px';
  document.body.appendChild(o);
  return o.scrollHeight > o.clientHeight && !o.closest('section');
})()`;
// its scroll while the finger stays down; resolves after the next frame's
// callbacks, so the scroll event is out (as MOVE)
const OTHER_MOVE = `(async () => {
  const o = document.getElementById('${OTHER}');
  o.scrollTo({ top: 120, behavior: 'instant' });
  await new Promise((r) => requestAnimationFrame(() => r()));
  return o.scrollTop;
})()`;
const OTHER_REMOVE = `(document.getElementById('${OTHER}')?.remove(), true)`;

export async function armMovedHold({ PORT, CDP_PORT, fail }) {
  const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`,
    { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  const toPractice = async () => {
    await c.eval(`window.__drills?.close?.(), true`); await sleep(200);
    await c.eval(`__shell.isOpen() || __shell.openShell(), true`); await sleep(300);
    const r = await c.eval(`(() => { const el = document.querySelector('#ob-shell-rail [data-place="practice"]');
      if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    if (!r) return false;
    await touchStart(c, [{ x: r.x, y: r.y, id: 1 }]); // REAL rail tap
    await sleep(40);
    await touchEnd(c);
    if (!(await waitLanded(c, 'practice'))) return false;
    return waitFor(c, `!!document.querySelector('#ob-practice-assist-title') && window.__shell.contentState().mounted.includes('practice')`, 60);
  };
  if (!(await waitReady(c))) fail('MOVED-HOLD: real-user boot never became ready');
  else if (!(await waitLanded(c, 'play'))) fail('MOVED-HOLD: the boot settle never landed at play');
  else {
    await waitFor(c, `window.__obShellArrival === 'done'`, 50);
    // the page-clock hold length of a press (null when either event is missing)
    const heldOf = (mh) => (mh.down && mh.up ? Math.round(mh.up.t - mh.down.t) : null);
    if (!Number.isFinite(HOLD_MS)) fail('MOVED-HOLD: UNJUDGEABLE — HOLD_MS not readable from app/shell.js');
    else {
      for (const band of [{ name: 'short', liftMs: 250, inBand: (h) => h < HOLD_MS, rule: `< ${HOLD_MS}` },
        { name: 'long', liftMs: 700, inBand: (h) => h >= HOLD_MS, rule: `>= ${HOLD_MS}` }]) {
        const tag = `MOVED-HOLD ${band.name} (lift ${band.liftMs} ms)`;
        for (let attempt = 1; attempt <= 3; attempt++) {
          if (!(await toPractice())) { fail(`${tag}: practice never landed`); break; }
          const pt = await c.eval(PRESS_POINT);
          if (!pt || pt.miss) { fail(`${tag}: UNJUDGEABLE — no press point: ` + JSON.stringify(pt)); break; }
          const s0 = await c.eval(STATE);
          await c.eval(ARM(pt.sel));
          await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
          const tDown = Date.now();
          await sleep(100);
          const top1 = await c.eval(MOVE(pt.d));
          await sleep(Math.max(0, band.liftMs - (Date.now() - tDown)));
          const under = await c.eval(UNDER(pt)); // what the release would click
          await touchEnd(c);
          await sleep(500);
          const s = await c.eval(STATE);
          await c.eval(`(window.__mhOff?.(), true)`);
          const mh = s.mh ?? {};
          const held = heldOf(mh);
          const seen = { attempt, press: pt, top1, under, held, down: mh.down, scrolls: mh.scrolls, on: mh.on, up: mh.up, clicks: mh.clicks };
          if (!mh.down || mh.down.control || !mh.down.onTarget) { fail(`${tag}: UNJUDGEABLE — the touch never reached the page on its target: ` + JSON.stringify(seen)); break; }
          if (!mh.up) { fail(`${tag}: UNJUDGEABLE — the lift never reached the page: ` + JSON.stringify(seen)); break; }
          if (!band.inBand(held)) {
            console.log(`${tag} attempt ${attempt}: held ${held} ms on the page clock, outside the band (${band.rule}) — not judged: ` + JSON.stringify(seen));
            if (attempt === 3) fail(`${tag}: UNJUDGEABLE — no attempt inside the band (${band.rule}) in 3`);
            continue;
          }
          if (!(mh.scrolls > 0)) fail(`${tag}: UNJUDGEABLE — no document scroll while the finger was down: ` + JSON.stringify(seen));
          else if (!under?.control) fail(`${tag}: UNJUDGEABLE — no control under the finger before the lift: ` + JSON.stringify(seen));
          else if (mh.clicks.length !== 0 || s.open !== true || s.picker === true || s.drill !== null || s.settings !== s0.settings) {
            fail(`${tag}: the release of a hold the column's motion cancelled acted: ` + JSON.stringify({ ...seen,
              open: s.open, picker: s.picker, drill: s.drill, settingsSame: s.settings === s0.settings }));
          } else {
            console.log(`${tag} OK (attempt ${attempt}): ${pt.sel} pressed, the column moved ${pt.d} px (${pt.want} under the finger), `
              + `${mh.scrolls} scroll event(s) while down, held ${held} ms on the page clock (${band.rule}) → 0 clicks, shell open, no picker, settings unchanged`);
          }
          break;
        }
      }
      // UNRELATED SCROLLER: only the scroll of the document or of a scroller
      // that contains the pressed element marks the hold; any other scroll
      // only disarms it, so the tap lands (once, on the pressed element)
      const tag = 'MOVED-HOLD unrelated scroller';
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!(await toPractice())) { fail(`${tag}: practice never landed`); break; }
        const pt = await c.eval(PRESS_POINT);
        if (!pt || pt.miss) { fail(`${tag}: UNJUDGEABLE — no press point: ` + JSON.stringify(pt)); break; }
        if (!(await c.eval(OTHER_SETUP))) { fail(`${tag}: UNJUDGEABLE — the test scroller could not overflow outside the sections`); await c.eval(OTHER_REMOVE); break; }
        const s0 = await c.eval(STATE);
        await c.eval(ARM(pt.sel));
        await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
        const tDown = Date.now();
        await sleep(100);
        const otherTop = await c.eval(OTHER_MOVE);
        await sleep(Math.max(0, 250 - (Date.now() - tDown)));
        await touchEnd(c);
        await sleep(500);
        const s = await c.eval(STATE);
        await c.eval(`(window.__mhOff?.(), true)`);
        await c.eval(OTHER_REMOVE);
        const mh = s.mh ?? {};
        const held = heldOf(mh);
        const on = mh.on ?? [];
        const seen = { attempt, press: pt, otherTop, column: [s0.column, s.column], held, down: mh.down, scrolls: mh.scrolls, on, up: mh.up, clicks: mh.clicks };
        if (!mh.down || mh.down.control || !mh.down.onTarget) { fail(`${tag}: UNJUDGEABLE — the touch never reached the page on its target: ` + JSON.stringify(seen)); break; }
        if (!mh.up) { fail(`${tag}: UNJUDGEABLE — the lift never reached the page: ` + JSON.stringify(seen)); break; }
        if (!(held < HOLD_MS)) {
          console.log(`${tag} attempt ${attempt}: held ${held} ms on the page clock, outside the band (< ${HOLD_MS}) — not judged: ` + JSON.stringify(seen));
          if (attempt === 3) fail(`${tag}: UNJUDGEABLE — no attempt inside the band (< ${HOLD_MS}) in 3`);
          continue;
        }
        if (!on.includes(OTHER)) fail(`${tag}: UNJUDGEABLE — the test scroller never scrolled while the finger was down: ` + JSON.stringify(seen));
        else if (on.some((w) => w !== OTHER) || s.column !== s0.column) fail(`${tag}: UNJUDGEABLE — the column or the document scrolled too: ` + JSON.stringify(seen));
        else if (mh.clicks.length !== 1 || !mh.clicks[0].onTarget || s.open !== true || s.picker === true || s.drill !== null || s.settings !== s0.settings) {
          fail(`${tag}: the tap of a hold that only an unrelated scroller disarmed did not land once on the pressed element: ` + JSON.stringify({ ...seen,
            open: s.open, picker: s.picker, drill: s.drill, settingsSame: s.settings === s0.settings }));
        } else {
          console.log(`${tag} OK (attempt ${attempt}): ${pt.sel} pressed, ${OTHER} scrolled to ${otherTop} with the column still, `
            + `held ${held} ms on the page clock (< ${HOLD_MS}) → 1 click on the pressed element, shell open, no picker, settings unchanged`);
        }
        break;
      }
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail('MOVED-HOLD: app errors: ' + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail('MOVED-HOLD: console errors: ' + errs.slice(0, 3).join(' | '));
  }
  c.close();
  await sleep(800);
}

// ---- standalone (the red-proof runner; the gate imports armMovedHold above)
// (realpath both sides: node realpaths the entry module, so a /tmp scratch
// copy would otherwise never match its own argv[1] and silently do nothing)
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armMovedHold({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-MOVEDHOLD FAIL' : 'E2E-SHELL-MOVEDHOLD PASS');
}
