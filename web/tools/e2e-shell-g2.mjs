// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-g2.mjs — arm G2 of the ui-shell gate (GH-668 S5 slice 2, BACKLOG
// rows B-SH04 / R4, B-SH09 / R16, B-SH10, B-SH02): the quick-play stack
// CONSUMES kit parts, the remember toggle is a hint row on fine pointers and
// a long-press fold on coarse, the quick-play verb follows the match, and
// the card hold hint stands only where a hold can act.
//
// The law judged here (both registers, real-user boots):
//   D1 quick-play = .ob-btn.ob-btn--primary.ob-btn--lg on the 48 rung with
//      the pad-primary inline pad (>= 0.39 h); remember =
//      .ob-btn.ob-shell-remember carrying the kit switch track (release ruling
//      D1 replaced R4's .ob-btn--row.ob-btn--toggle tick row), no .ob-shell-tick span, label key
//      shell.rememberNext painted as t(key), rest ink = --ob-text-1 (hint
//      role), one stack width (quick-play width == remember width);
//   D2 remember click writes startAtTable (the ONLY writer), the pressed
//      row never wears the primary register (background != quick-play's) and
//      its switch track reads ON (thumb at +14 px, track on the accent-dim
//      ground resolved through layout);
//   D5 mixed cache (b20 UI audit, review r1 P2): a fresh shell beside a CACHED
//      pre-D1 kit.css — derived from the served kit.css by removing its two
//      `[aria-pressed="true"] > .ob-toggle__track` rules, staged to remove
//      exactly two — still paints the pressed track ON (the shell.css belt)
//      and off again on the opt-out; the same boot keeps the PRE-BELT sheet
//      in play for its own URL (shell.css?v=025, the last version without the
//      belt — derived by removing the belt's two rules), so a SHELL_CSS_V
//      left at 025 would hand the returning no-SW user that cached sheet and
//      the track would read off (review r2 P2, the ?v= cache-bust law);
//   D3 verb: shell.toTable at a fresh rack; after one REAL shot
//      (__test.shoot) and a re-open, shell.backToTable — key AND text; ja
//      flip re-paints the verb without clipping (#821: the flip AWAITED and
//      the read settled — lib/locale-settle.mjs — and the ja strings taken
//      from app/locales/ja.json on disk, never from the page under test);
//   D4 hold hint: hidden on the play card once play.js (no `primary`) owns
//      it, visible on the practice card (its module reports a primary);
//   P1 phone: the remember row does not paint (folded), quick-play >= 44;
//   P2 phone shell reserve (bands().reserve.bottom) <= 150 px at 844x390
//      and 667x375 (was 212);
//   P3 phone long-press on quick-play toggles startAtTable WITHOUT exiting
//      the hall and speaks through #ob-shell-note (rememberOn / rememberOff);
//      a plain tap still exits.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +6 desktop / +5 phone CDP
// slots after arm K05 — PORT_INVENTORY unchanged) and stands alone for a fast
// red proof:  node web/tools/e2e-shell-g2.mjs  (OB_E2E_PORT / _CDP_PORT).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics, touchStart, touchEnd } from './touch-cdp.mjs';
import { flipLocale, settledRead, unsettledNote } from './lib/locale-settle.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

const RESERVE_MAX = 150; // px — the coarse shell reserve budget (B-SH04 / B-PL02)
// #821: a locale pass's expected strings come from the shipped dictionary on
// disk — an oracle re-read from the page moves with the page's own fault
const dictOf = (loc) => JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app', 'locales', `${loc}.json`), 'utf8'));
/** a locale pass that cannot be judged: a key <loc>.json lacks, or NONE of the pass's keys translated apart from
 * en.json (then the flip cannot be told from no flip) */
const unjudgeable = (loc, keys) => {
  const D = dictOf(loc), E = dictOf('en');
  const missing = keys.filter((k) => D[k] === undefined);
  const out = missing.length ? [`UNJUDGEABLE — ${loc}.json has no ${missing.join(', ')}`] : [];
  if (!keys.some((k) => D[k] !== undefined && D[k] !== E[k])) out.push(`UNJUDGEABLE — ${loc}.json translates none of ${keys.join(', ')} apart from en.json (the flip cannot be told from none)`);
  return out;
};
/** the page's locale before an away-flip: a flip to the locale the page is already in proves nothing */
const preFlip = async (c, loc) => { const pre = await c.eval('window.__i18n?.locale?.() ?? null'); return pre === 'en' ? [] : [`staging — the page is in '${pre}' before the ${loc} flip (want en)`]; };

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
  }
  return false;
}
async function waitOpenAt(c, id, tries = 100) {
  for (let i = 0; i < tries; i++) {
    const ok = await c.eval(`(() => { const s = window.__shell;
      return !!s && s.isOpen() && !s.moving() && s.place() === '${id}'; })()`).catch(() => false);
    if (ok) return true;
    await sleep(150);
  }
  return false;
}
async function waitFor(c, expr, tries = 40, ms = 100) {
  for (let i = 0; i < tries; i++) {
    if (await c.eval(expr).catch(() => false)) return true;
    await sleep(ms);
  }
  return false;
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
const centre = (c, sel) => c.eval(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
async function mouseClick(c, pt) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', buttons: 1, clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', buttons: 0, clickCount: 1 });
}

// one same-tick read of the stack: kit-part membership, geometry, the painted
// keys vs t(key), the hint-role ink resolved THROUGH layout (a probe on
// --ob-text-1, never a token-string compare), the stored flag, the notice
const READ = `(() => {
  const qp = document.getElementById('ob-shell-quickplay');
  const rem = document.querySelector('[data-ob="shell-remember"]');
  const wrap = document.getElementById('ob-shell-quickplay-wrap');
  const rail = document.getElementById('ob-shell-rail');
  if (!qp || !rem || !wrap || !rail) return { missing: true };
  const t = (k) => window.__i18n?.t?.(k) ?? null;
  const cs = getComputedStyle;
  const rect = (el) => { const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, left: r.left, bottom: r.bottom, right: r.right }; };
  let probe = document.getElementById('ob-g2-probe');
  if (!probe) { probe = document.createElement('span'); probe.id = 'ob-g2-probe';
    probe.style.cssText = 'position:fixed;visibility:hidden;color:var(--ob-text-1)'; document.body.appendChild(probe); }
  const lab = qp.querySelector('.ob-btn__label') ?? qp;
  const rlab = rem.querySelector('.ob-btn__label') ?? rem;
  const s = window.__shell;
  return {
    qp: { cls: [...qp.classList], r: rect(qp), padL: parseFloat(cs(qp).paddingLeft), padR: parseFloat(cs(qp).paddingRight),
      bg: cs(qp).backgroundColor, key: lab.dataset.i18n ?? null, text: lab.textContent, want: t(lab.dataset.i18n ?? ''),
      clip: qp.scrollWidth > qp.clientWidth + 1, paints: qp.getClientRects().length > 0 },
    rem: { cls: [...rem.classList], r: rect(rem), tick: !!rem.querySelector('.ob-shell-tick'), track: !!rem.querySelector(':scope > .ob-toggle__track'), pressed: rem.getAttribute('aria-pressed'),
      autorow: rem.hasAttribute('data-ob-autorow'),
      color: cs(rem).color, bg: cs(rem).backgroundColor, key: rlab.dataset.i18n ?? null, text: rlab.textContent, want: t(rlab.dataset.i18n ?? ''),
      // review r4 P2: on coarse the fold is the COLLAPSED focus-reveal row (the
      // kit sr-only box: 1 x 1, clip-path, opacity 0 — still in the tab order),
      // never display:none; "paints" = on the paint as a control
      collapsed: rem.hasAttribute('data-ob-focus-reveal') && cs(rem).opacity === '0'
        && rem.getBoundingClientRect().width <= 1 && rem.getBoundingClientRect().height <= 1 && cs(rem).clipPath !== 'none',
      focusable: rem.getClientRects().length > 0 && cs(rem).display !== 'none' && cs(rem).visibility !== 'hidden',
      paints: rem.getClientRects().length > 0 && !(rem.hasAttribute('data-ob-focus-reveal') && cs(rem).opacity === '0'),
      clip: rem.scrollWidth > rem.clientWidth + 1 },
    hintInk: cs(probe).color, wrap: rect(wrap), rail: rect(rail),
    stored: (() => { try { return JSON.parse(localStorage.getItem('ob-shell-v1'))?.startAtTable ?? null; } catch { return null; } })(),
    open: !!s && s.isOpen(), place: s?.place?.() ?? null,
    reserve: (typeof s?.bands === 'function' ? s.bands().reserve : null),
    note: document.getElementById('ob-shell-note')?.textContent ?? null,
    tOn: t('shell.rememberOn'), tOff: t('shell.rememberOff'), tTo: t('shell.toTable'), tBack: t('shell.backToTable'),
    touch: document.documentElement.classList.contains('ob-touch'), vw: innerWidth, vh: innerHeight };
})()`;
// the remember track's ON look, resolved through layout: the thumb's x offset
// (the ::after transform) and the track ground against a probe that paints
// --ob-accent-dim (never a token-string compare)
const TRACK = `(() => {
  const rem = document.querySelector('[data-ob="shell-remember"]');
  const tr = rem?.querySelector(':scope > .ob-toggle__track');
  if (!rem || !tr) return null;
  let p = document.getElementById('ob-g2-on-probe');
  if (!p) { p = document.createElement('span'); p.id = 'ob-g2-on-probe';
    p.style.cssText = 'position:fixed;visibility:hidden;background-color:var(--ob-accent-dim)'; document.body.appendChild(p); }
  const m = getComputedStyle(tr, '::after').transform;
  const tx = m && m !== 'none' ? Number(m.slice(m.indexOf('(') + 1, -1).split(',')[4]) : 0;
  return { pressed: rem.getAttribute('aria-pressed'), bg: getComputedStyle(tr).backgroundColor,
    onBg: getComputedStyle(p).backgroundColor, tx, w: tr.getBoundingClientRect().width };
})()`;
const trackOn = (t) => !!t && t.pressed === 'true' && Math.abs(t.tx - 14) <= 0.5 && t.bg === t.onBg;
const trackOff = (t) => !!t && t.pressed === 'false' && Math.abs(t.tx) <= 0.5 && t.bg !== t.onBg;
const HINT = (id) => `(() => {
  const sec = document.querySelector('#ob-shell-cards > section[data-place="${id}"]');
  const h = sec?.querySelector(':scope > p.ob-shell-hold'); if (!sec || !h) return null;
  return { host: sec.classList.contains('ob-${id}-host'), hidden: h.hidden, paints: h.getClientRects().length > 0, key: h.dataset.i18n ?? null }; })()`;

function judgeParts(r) { // D1 / P1 shared: the kit-part membership + copy
  const bad = [];
  for (const k of ['ob-btn', 'ob-btn--primary', 'ob-btn--lg']) if (!r.qp.cls.includes(k)) bad.push(`quick-play lacks .${k}`);
  if (Math.abs(r.qp.r.h - 48) > 1) bad.push(`quick-play h ${r.qp.r.h.toFixed(1)} off the 48 rung`);
  const pad = Math.min(r.qp.padL, r.qp.padR);
  if (pad / r.qp.r.h < 0.39) bad.push(`quick-play inline pad ${pad.toFixed(1)} on ${r.qp.r.h.toFixed(1)} = ${(pad / r.qp.r.h).toFixed(2)} (< 0.4)`);
  for (const k of ['ob-btn', 'ob-shell-remember']) if (!r.rem.cls.includes(k)) bad.push(`remember lacks .${k}`);
  // release ruling D1: a quiet SETTING row — the kit switch track, never the
  // R4 tick row (.ob-btn--toggle + its tick). A label that wraps beside the
  // 34 px track (en at the 240 px stack) puts the row on the kit's row pole —
  // .ob-btn--row stamped data-ob-autorow by the kit judge: that is the row
  // form, not R4; a DECLARED row (no stamp) would be
  if (!r.rem.track) bad.push('remember lacks the kit switch track (.ob-toggle__track)');
  if (r.rem.cls.includes('ob-btn--toggle')) bad.push('remember still wears .ob-btn--toggle (R4 tick row; ruling D1)');
  if (r.rem.cls.includes('ob-btn--row') && !r.rem.autorow) bad.push('remember wears a declared .ob-btn--row (no kit data-ob-autorow stamp — the R4 row; ruling D1)');
  if (r.rem.tick) bad.push('remember still carries the .ob-shell-tick span');
  if (r.rem.key !== 'shell.rememberNext') bad.push(`remember key ${r.rem.key} (want shell.rememberNext)`);
  if (r.rem.text !== r.rem.want) bad.push(`remember text '${r.rem.text}' != t(${r.rem.key})`);
  if (!r.qp.text || r.qp.text !== r.qp.want) bad.push(`quick-play text '${r.qp.text}' != t(${r.qp.key})`);
  if (r.qp.clip) bad.push('quick-play label clips');
  return bad;
}

async function desktop({ PORT, CDP_PORT, fail }) {
  const tag = 'G2 desktop'; const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    let r = await c.eval(READ);
    if (!r || r.missing) { fail(`${tag}: the quick-play stack is missing`); return; }
    // ---- D1: kit parts, hint-role row, one stack width -----------------------
    const bad = judgeParts(r);
    if (!r.rem.paints) bad.push('the remember row does not paint on a fine pointer');
    if (r.rem.color !== r.hintInk) bad.push(`remember rest ink ${r.rem.color} != --ob-text-1 ${r.hintInk} (hint role)`);
    if (Math.abs(r.qp.r.w - r.rem.r.w) > 0.5) bad.push(`stack widths differ: quick-play ${r.qp.r.w.toFixed(1)} vs remember ${r.rem.r.w.toFixed(1)} (one stack width)`);
    if (r.rem.r.h < 39.5) bad.push(`remember row h ${r.rem.r.h.toFixed(1)} under the control rung (40, ruling D1)`);
    if (r.rem.clip) bad.push('remember label clips');
    if (r.rem.pressed !== 'false') bad.push(`remember pressed at a fresh boot: ${r.rem.pressed}`);
    if (bad.length) fail(`${tag} D1: ` + bad.join('; '));
    else console.log(`${tag} D1 OK: quick-play ${r.qp.r.w.toFixed(0)}x${r.qp.r.h.toFixed(0)} pad ${Math.min(r.qp.padL, r.qp.padR).toFixed(1)}; remember row ${r.rem.r.w.toFixed(0)}x${r.rem.r.h.toFixed(0)} text-1`);
    // ---- D2: the toggle writes startAtTable; pressed != primary register -----
    const qpBg = r.qp.bg;
    await mouseClick(c, await centre(c, '[data-ob="shell-remember"]'));
    await sleep(150);
    r = await c.eval(READ);
    const b2 = [];
    if (r.rem.pressed !== 'true' || r.stored !== true) b2.push(`opt-in: pressed ${r.rem.pressed}, stored ${r.stored}`);
    if (!r.open) b2.push('the remember click exited the hall');
    if (r.rem.bg === qpBg) b2.push(`pressed row wears the quick-play background (${qpBg})`);
    // the kit path of the ON look (the transition settles inside the wait)
    if (!(await waitFor(c, `(${trackOn.toString()})(${TRACK})`, 30, 100))) b2.push(`pressed track does not read ON with the fresh kit: ${JSON.stringify(await c.eval(TRACK))}`);
    await mouseClick(c, await centre(c, '[data-ob="shell-remember"]'));
    await sleep(150);
    r = await c.eval(READ);
    if (r.rem.pressed !== 'false' || r.stored !== false) b2.push(`opt-out: pressed ${r.rem.pressed}, stored ${r.stored}`);
    if (b2.length) fail(`${tag} D2: ` + b2.join('; ')); else console.log(`${tag} D2 OK: remember toggles startAtTable true -> false, hall stays open`);
    // ---- D3: the verb — fresh rack "To the table", live match "Back to the table"
    const b3 = [];
    if (r.qp.key !== 'shell.toTable' || r.qp.text !== r.tTo) b3.push(`fresh rack: key ${r.qp.key} text '${r.qp.text}' (want shell.toTable = '${r.tTo}')`);
    const JA = dictOf('ja');
    b3.push(...unjudgeable('ja', ['shell.toTable', 'shell.rememberNext']), ...(await preFlip(c, 'ja')));
    const fja = await flipLocale(c, 'ja');
    if (!fja?.applied) b3.push(`the ja switch did not land cleanly (${JSON.stringify(fja)})`);
    const sja = await settledRead(c, READ);
    if (!sja.settled) console.log(`${tag} D3 note: the ja read did not settle (${unsettledNote(sja)}) — judged as read`);
    const ja = sja.value;
    if (ja.qp.text !== JA['shell.toTable'] || ja.qp.clip) b3.push(`ja: verb '${ja.qp.text}' (want ja.json shell.toTable '${JA['shell.toTable']}') clip ${ja.qp.clip}`);
    if (ja.rem.text !== JA['shell.rememberNext'] || ja.rem.clip || /：/.test(ja.rem.text)) b3.push(`ja remember '${ja.rem.text}' (want ja.json shell.rememberNext '${JA['shell.rememberNext']}'; B-SH10: no full-width colon, no clip)`);
    const fen = await flipLocale(c, 'en');
    if (!fen?.applied) b3.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
    await c.eval('__shell.quickPlay(), true');
    if (!(await waitFor(c, '__shell.isOpen() === false'))) b3.push('quick-play did not close the hall');
    else {
      const rej = await c.eval('__test.shoot({ power: 1.6 })');
      if (rej) b3.push('the scripted shot was refused: ' + JSON.stringify(rej));
      else if (!(await waitFor(c, '__shell.openShell() === true', 200, 200))) b3.push('the hall never re-opened after the shot (table busy > 40 s)');
      else if (!(await waitOpenAt(c, 'play'))) b3.push('the re-open never settled at play');
      else {
        await sleep(300);
        r = await c.eval(READ);
        if (r.qp.key !== 'shell.backToTable' || r.qp.text !== r.tBack) b3.push(`live match: key ${r.qp.key} text '${r.qp.text}' (want shell.backToTable = '${r.tBack}')`);
      }
    }
    if (b3.length) fail(`${tag} D3: ` + b3.join('; ')); else console.log(`${tag} D3 OK: verb '${ja.qp.text}' (ja) / '${r.tTo}' -> '${r.qp.text}' after one shot`);
    // ---- D4: the hold hint stands only where a hold can act ------------------
    const b4 = [];
    const hp = await c.eval(HINT('play'));
    if (!hp) b4.push('play card / hint missing');
    else if (!hp.host) b4.push('play.js did not mount (ob-play-host absent) — the fixture cannot judge the module report');
    else if (!hp.hidden || hp.paints) b4.push(`play card: play.js reports no primary, yet the hint paints (hidden ${hp.hidden}, paints ${hp.paints})`);
    // the positive: replays keeps its RE-KEYED hint (035a — replays.js owns a
    // primary and the hint; e2e-replays pins it visible), so the shell's
    // hide-only law must not have touched it
    await c.eval(`__shell.go('replays'), true`);
    if (!(await waitOpenAt(c, 'replays'))) b4.push('replays never landed');
    else {
      await sleep(900); // the module import + first sweep settle
      const hq = await c.eval(HINT('replays'));
      if (!hq) b4.push('replays card / hint missing');
      else if (!hq.host) b4.push('replays.js did not mount — the fixture cannot judge the module report');
      // release ruling D3: on a fine pointer the re-keyed hint STANDS (not
      // [hidden], re-keyed) but leaves the paint — the hold is a touch idiom
      else if (hq.hidden || hq.paints || hq.key !== 'shell.place.replays.hold') b4.push(`replays card: the 035a re-keyed hint must stand off the paint on a fine pointer (hidden ${hq.hidden}, paints ${hq.paints}, key ${hq.key})`);
    }
    if (b4.length) fail(`${tag} D4: ` + b4.join('; ')); else console.log(`${tag} D4 OK: hint hidden on play (no module primary), the 035a re-keyed hint stands off the paint on replays (fine pointer, ruling D3)`);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

async function phone({ PORT, CDP_PORT, fail }) {
  const tag = 'G2 phone'; const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`, { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  const reserveOf = (r) => ({ seam: r.reserve?.bottom ?? null, measured: r.vh - Math.min(r.rail.top, r.wrap.top) + 8 });
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    let r = await c.eval(READ);
    if (!r || r.missing) { fail(`${tag}: the quick-play stack is missing`); return; }
    if (!r.touch) { fail(`${tag}: html.ob-touch absent — not the coarse register`); return; }
    // ---- P1: the fold — the row does not paint; quick-play on the coarse floor
    const b1 = judgeParts(r);
    if (r.rem.paints) b1.push(`the remember row still paints on coarse (${r.rem.r.w.toFixed(0)}x${r.rem.r.h.toFixed(0)}) — R4 folds it into quick-play`);
    // review r4 P2: folded = the collapsed focus-reveal box, STILL focusable (the keyboard path; e2e-shell F walks it)
    if (!r.rem.collapsed || !r.rem.focusable) b1.push(`the folded remember row must be the collapsed focus-reveal box and stay focusable (collapsed ${r.rem.collapsed}, focusable ${r.rem.focusable}) — review r4 P2`);
    if (!r.qp.paints || r.qp.r.h < 43.5 || r.qp.r.w < 43.5) b1.push(`quick-play ${r.qp.r.w.toFixed(1)}x${r.qp.r.h.toFixed(1)} under the 44 floor`);
    if (b1.length) fail(`${tag} P1: ` + b1.join('; ')); else console.log(`${tag} P1 OK: remember folded, quick-play ${r.qp.r.w.toFixed(0)}x${r.qp.r.h.toFixed(0)}`);
    // ---- P2: the shell reserve budget at 844x390 ----------------------------
    let res = reserveOf(r);
    if (res.seam === null) fail(`${tag} P2: window.__shell.bands() is missing (the K05 seam)`);
    else if (res.seam > RESERVE_MAX || res.measured > RESERVE_MAX) fail(`${tag} P2: coarse shell reserve ${res.seam} px (measured ${res.measured.toFixed(1)}) > ${RESERVE_MAX} at ${r.vw}x${r.vh}`);
    else console.log(`${tag} P2 OK: reserve ${res.seam} px (measured ${res.measured.toFixed(1)}) <= ${RESERVE_MAX} at ${r.vw}x${r.vh}`);
    // ---- P3: long-press toggles startAtTable WITHOUT exiting; a tap exits ----
    const b3 = [];
    const holdOnce = async () => {
      const pt = await centre(c, '#ob-shell-quickplay');
      await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]);
      await sleep(800);
      await touchEnd(c);
      await sleep(300);
      return c.eval(READ);
    };
    r = await holdOnce();
    if (!r.open) b3.push('the long-press exited the hall (the trailing click was not swallowed)');
    if (r.rem.pressed !== 'true' || r.stored !== true) b3.push(`hold 1: pressed ${r.rem.pressed}, stored ${r.stored} (want true)`);
    if (r.note !== r.tOn) b3.push(`hold 1 notice '${r.note}' (want '${r.tOn}')`);
    r = await holdOnce();
    if (!r.open) b3.push('the second long-press exited the hall');
    if (r.rem.pressed !== 'false' || r.stored !== false) b3.push(`hold 2: pressed ${r.rem.pressed}, stored ${r.stored} (want false)`);
    if (r.note !== r.tOff) b3.push(`hold 2 notice '${r.note}' (want '${r.tOff}')`);
    const pt = await centre(c, '#ob-shell-quickplay');
    await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(40); await touchEnd(c);
    if (!(await waitFor(c, '__shell.isOpen() === false', 30, 100))) b3.push('a plain tap on quick-play no longer exits');
    if (b3.length) fail(`${tag} P3: ` + b3.join('; ')); else console.log(`${tag} P3 OK: long-press toggles (on / off, notice spoken), tap exits`);
    // ---- P2 at 667x375 --------------------------------------------------------
    await setPhoneMetrics(c, { width: 667, height: 375 });
    await c.eval('__shell.openShell(), true');
    if (!(await waitOpenAt(c, 'play'))) fail(`${tag} P2b: re-open at 667x375 never settled`);
    else {
      await sleep(400);
      r = await c.eval(READ); res = reserveOf(r);
      if (r.rem.paints) fail(`${tag} P2b: the remember row paints at ${r.vw}x${r.vh}`);
      if (!r.rem.collapsed || !r.rem.focusable) fail(`${tag} P2b: the folded remember row must be the collapsed focus-reveal box and stay focusable at ${r.vw}x${r.vh} (collapsed ${r.rem.collapsed}, focusable ${r.rem.focusable})`);
      if (res.seam === null || res.seam > RESERVE_MAX || res.measured > RESERVE_MAX) fail(`${tag} P2b: reserve ${res.seam} (measured ${res.measured?.toFixed(1)}) > ${RESERVE_MAX} at ${r.vw}x${r.vh}`);
      else console.log(`${tag} P2b OK: reserve ${res.seam} px at ${r.vw}x${r.vh}`);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

// ---- D5: fresh shell + a cached pre-D1 kit.css (the mixed-cache law) -------
const STALE_KIT_RULES = /\[aria-pressed="true"\] > \.ob-toggle__track(?:::after)? \{[^}]*\}\s*/g;
const BELT_RULES = /:where\(#ob-shell-quickplay-wrap \[data-ob="shell-remember"\]\[aria-pressed="true"\]\) > \.ob-toggle__track(?:::after)? \{[^}]*\}\s*/g;
const PRE_BELT_SHELL_V = '025'; // the last SHELL_CSS_V whose shell.css had no belt
async function staleKit({ PORT, CDP_PORT, fail }) {
  const tag = 'G2 desktop D5 (cached pre-D1 kit.css)'; const errs = [];
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const fresh = fs.readFileSync(path.join(webDir, 'app/ui/kit.css'), 'utf8');
  const removed = (fresh.match(STALE_KIT_RULES) || []).length;
  const stale = fresh.replace(STALE_KIT_RULES, '');
  if (removed !== 2) { fail(`${tag}: staging — the derived pre-D1 kit removed ${removed} rule(s), want the two aria-pressed track rules`); return; }
  const shellFresh = fs.readFileSync(path.join(webDir, 'app/ui/shell.css'), 'utf8');
  const beltRules = (shellFresh.match(BELT_RULES) || []).length;
  const preBelt = shellFresh.replace(BELT_RULES, '');
  if (beltRules !== 2) { fail(`${tag}: staging — the derived pre-belt shell.css removed ${beltRules} rule(s), want the belt's two`); return; }
  // the warm-up-then-navigate idiom (e2e-shell's poison legs): the judged boot
  // is a second navigation with the cache disabled AND the service worker
  // bypassed, so the warm-up's kit.css (HTTP cache or the SW precache) never
  // reaches the page without a Fetch event — the staging guard below counts it
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html?u=g2-stale-warm`,
    { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  let served = 0, shellUrls = [], preBeltServed = 0;
  const cssBody = (text) => ({ responseCode: 200,
    responseHeaders: [{ name: 'Content-Type', value: 'text/css; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
    body: Buffer.from(text).toString('base64') });
  try {
    if (!(await waitReady(c))) { fail(`${tag}: the warm-up boot never became ready`); return; }
    watchErrors(c, errs);
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const url = params.request.url;
      if (/\/app\/ui\/kit\.css/.test(url)) {
        served += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, ...cssBody(stale) }).catch(() => {});
      } else if (/\/app\/ui\/shell\.css/.test(url)) {
        // the HTTP cache of a returning no-SW user holds the pre-belt sheet
        // under ITS url; any other version is a fresh fetch
        const v = new URL(url).searchParams.get('v');
        shellUrls.push(v);
        if (v === PRE_BELT_SHELL_V) {
          preBeltServed += 1;
          c.send('Fetch.fulfillRequest', { requestId: params.requestId, ...cssBody(preBelt) }).catch(() => {});
        } else {
          c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        }
      } else {
        c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
      }
    });
    await c.send('Network.enable');
    await c.send('Network.setBypassServiceWorker', { bypass: true });
    await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*app/ui/kit.css*', requestStage: 'Request' },
      { urlPattern: '*app/ui/shell.css*', requestStage: 'Request' }] });
    await c.eval('localStorage.removeItem("ob-shell-v1"), true');
    await c.send('Page.navigate', { url: `http://127.0.0.1:${PORT}/app.html?u=g2-stale-kit` });
    await sleep(500);
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    if (!served) { fail(`${tag}: staging — kit.css never came through the stale-kit intercept`); return; }
    const b5 = [];
    if (!shellUrls.length) b5.push('staging: shell.css never came through the intercept');
    if (preBeltServed) b5.push(`the fresh shell requested shell.css?v=${PRE_BELT_SHELL_V} — the pre-belt URL, so a returning user without a service worker keeps the cached pre-belt sheet (bump SHELL_CSS_V; ?v= cache-bust law)`);
    const t0 = await c.eval(TRACK);
    if (!trackOff(t0)) b5.push(`rest: the track must read off (${JSON.stringify(t0)})`);
    await mouseClick(c, await centre(c, '[data-ob="shell-remember"]'));
    if (!(await waitFor(c, `(${trackOn.toString()})(${TRACK})`, 30, 100))) b5.push(`opt-in: the pressed track reads off beside the cached kit (${JSON.stringify(await c.eval(TRACK))}) — startAtTable ${await c.eval('JSON.parse(localStorage.getItem("ob-shell-v1") ?? "{}").startAtTable ?? null')}`);
    await mouseClick(c, await centre(c, '[data-ob="shell-remember"]'));
    if (!(await waitFor(c, `(${trackOff.toString()})(${TRACK})`, 30, 100))) b5.push(`opt-out: the track must read off again (${JSON.stringify(await c.eval(TRACK))})`);
    if (b5.length) fail(`${tag}: ` + b5.join('; '));
    else console.log(`${tag} OK: the derived pre-D1 kit (2 aria-pressed track rules removed, served ${served}x) still paints the pressed track ON via the shell.css belt, off again on opt-out; shell.css requested at ?v=${shellUrls.join(',')} (never the pre-belt ?v=${PRE_BELT_SHELL_V})`);
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

export async function armG2(ctx) { await desktop(ctx); await staleKit(ctx); await phone(ctx); }

// ---- standalone (the red-proof runner; the gate imports armG2 above) ------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armG2({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-G2 FAIL' : 'E2E-SHELL-G2 PASS');
}
