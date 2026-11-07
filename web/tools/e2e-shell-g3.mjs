// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-g3.mjs — arm G3 of the ui-shell gate (GH-668 S5 slice 2, BACKLOG
// rows B-SH05 / ruling R3, B-SH06, KIT_LAW_OK `A2 shell.place.`): the rail's
// settings segment is an ICON segment wearing the toolbar gear's mark, the
// rail sits on the SOLID rung, and the hall re-entry pill LEADS the toolbar
// as a labelled pill on fine pointers / a 44 circle under a finger.
//
// The law judged here (both registers, real-user boots):
//   D1 gear (fine): #ob-shell-settings = .ob-btn.ob-btn--icon.ob-strip__seg,
//      no data-place, NO text, an svg[data-icon="gear"] inside .ob-btn__icon
//      whose markup is BYTE-IDENTICAL to the toolbar #ob-gear's face (one
//      glyph for one verb), aria-label + title = t('shell.settings'), a 44
//      square on the strip rung, the face centred ±0.5 px;
//   D2 roving set unchanged: exactly 4 [data-place] segments, ONE of them
//      the tab stop; a REAL Tab from the current place lands on the gear
//      (a natural tab stop outside the roving set); ArrowRight on the gear
//      moves nothing; ja flip keeps the square + re-names the gear (#821:
//      every flip here AWAITED and its read settled — lib/locale-settle.mjs —
//      and the localized names taken from app/locales/<loc>.json on disk);
//   D3 rail material: no backdrop-filter on #ob-shell-rail, its background
//      == --ob-glass-solid resolved through layout (a probe), alpha >= 0.9;
//      the cards keep their glass lift (the rail alone left the smoke);
//   D4 hall pill (after a real quick-play exit): .ob-btn.ob-btn--glass
//      .ob-toolbar-pill WITHOUT --icon, label == t('shell.hall') painted and
//      unclipped, 34 tall / radius 999 / bg + ink + blur == #ob-gear's (the
//      J3 family laws), tbOrder -1 and LEFT-MOST of the visible toolbar
//      pills (the leading slot), aria-label + title stay t('shell.open');
//      de flip re-paints the label without clipping;
//   P1 phone gear: no text, the inlined gear face, named, height == the
//      place segments' height (the strip's 48 rung) ±0.5, width >= 44, face
//      centred ±0.5;
//   P2 phone pill: --icon, the label does NOT paint, 44 × 44 ±0.5, face
//      centred ±0.5, left-most of the visible toolbar pills, named.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +6 desktop / +5 phone CDP
// slots after arm G2 — PORT_INVENTORY unchanged) and stands alone for a fast
// red proof:  node web/tools/e2e-shell-g3.mjs  (OB_E2E_PORT / _CDP_PORT).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { flipLocale, settledRead, unsettledNote } from './lib/locale-settle.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in several files: e2e-shell imports this leg module; standalone it runs on e2e-shell's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-shell';

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
async function key(c, k, code) {
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: k === 'Tab' ? 9 : 39 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: k === 'Tab' ? 9 : 39 });
}

// one same-tick read: the gear segment, the rail material (resolved through a
// layout probe — never a token-string compare), the roving set, the hall pill
// and its toolbar neighbours, the toolbar gear's face for the identity check
const READ = `(() => {
  const gear = document.getElementById('ob-shell-settings');
  const rail = document.getElementById('ob-shell-rail');
  const pill = document.getElementById('ob-shell-open');
  const tbGear = document.getElementById('ob-gear');
  const card = document.querySelector('#ob-shell-cards > section:not([hidden])');
  if (!gear || !rail || !pill) return { missing: true, gear: !!gear, rail: !!rail, pill: !!pill };
  const t = (k) => window.__i18n?.t?.(k) ?? null;
  const cs = getComputedStyle;
  const rect = (el) => { const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, top: r.top, left: r.left, right: r.right, bottom: r.bottom }; };
  const centreOff = (el) => { const svg = el.querySelector('svg'); if (!svg) return null;
    const a = el.getBoundingClientRect(), b = svg.getBoundingClientRect();
    return { dx: (b.left + b.width / 2) - (a.left + a.width / 2), dy: (b.top + b.height / 2) - (a.top + a.height / 2) }; };
  let probe = document.getElementById('ob-g3-probe');
  if (!probe) { probe = document.createElement('span'); probe.id = 'ob-g3-probe';
    probe.style.cssText = 'position:fixed;visibility:hidden;background-color:var(--ob-glass-solid)'; document.body.appendChild(probe); }
  const places = [...rail.querySelectorAll('[data-place]')];
  const seg0 = places[0] ? rect(places[0]) : null;
  const lab = pill.querySelector(':scope > .ob-btn__label');
  const tb = pill.parentElement;
  const sib = tb ? [...tb.children].filter((el) => el !== pill && el.getClientRects().length && cs(el).visibility !== 'hidden')
    .map((el) => ({ id: el.id, left: el.getBoundingClientRect().left })) : [];
  // computed colours arrive as oklch(l c h / a) for the tokens and rgb[a]() for
  // legacy literals — read the alpha from either shape (1 when absent)
  const alpha = (bg) => { const sl = /\\/\\s*([0-9.]+)(%?)\\s*\\)\\s*$/.exec(bg); if (sl) return sl[2] ? parseFloat(sl[1]) / 100 : parseFloat(sl[1]);
    const m = /^rgba?\\(([^)]+)\\)/.exec(bg); if (!m) return /^(oklch|oklab|rgb|hsl)\\(/.test(bg) ? 1 : null; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
  return {
    gear: { cls: [...gear.classList], place: gear.dataset.place ?? null, text: gear.textContent.trim(),
      svg: gear.querySelector(':scope > .ob-btn__icon > svg[data-icon="gear"]')?.outerHTML ?? null,
      aria: gear.getAttribute('aria-label'), title: gear.title, r: rect(gear), off: centreOff(gear),
      tabindex: gear.getAttribute('tabindex'), focused: document.activeElement === gear },
    tbGearSvg: tbGear?.querySelector('svg[data-icon="gear"]')?.outerHTML ?? null,
    roving: { n: places.length, stops: places.filter((p) => p.getAttribute('tabindex') === '0').length,
      current: places.find((p) => p.getAttribute('aria-current') === 'true')?.dataset.place ?? null,
      focusedPlace: document.activeElement?.dataset?.place ?? null },
    seg0,
    rail: { bg: cs(rail).backgroundColor, blur: cs(rail).backdropFilter, alpha: alpha(cs(rail).backgroundColor), r: rect(rail) },
    solid: cs(probe).backgroundColor,
    card: card ? { bg: cs(card).backgroundColor, blur: cs(card).backdropFilter } : null,
    practice: (() => { const s = document.querySelector('#ob-shell-cards > section[data-place="practice"]'); return s ? { blur: cs(s).backdropFilter, hidden: s.hidden } : null; })(),
    pill: { cls: [...pill.classList], hidden: pill.hidden, paints: pill.getClientRects().length > 0, r: rect(pill),
      radius: cs(pill).borderRadius, bg: cs(pill).backgroundColor, color: cs(pill).color, blur: cs(pill).backdropFilter,
      tbOrder: pill.dataset.tbOrder ?? null, order: cs(pill).order, aria: pill.getAttribute('aria-label'), title: pill.title,
      icon: pill.querySelector('svg')?.dataset.icon ?? null, off: centreOff(pill),
      lab: lab ? { text: lab.textContent, paints: lab.getClientRects().length > 0, clip: lab.scrollWidth > lab.clientWidth + 1 } : null,
      clip: pill.scrollWidth > pill.clientWidth + 1, sib },
    tbGear: tbGear ? { bg: cs(tbGear).backgroundColor, color: cs(tbGear).color, blur: cs(tbGear).backdropFilter, h: tbGear.getBoundingClientRect().height, radius: cs(tbGear).borderRadius } : null,
    tSettings: t('shell.settings'), tOpen: t('shell.open'), tHall: t('shell.hall'),
    glassOff: document.body.classList.contains('ob-glass-off'), open: !!window.__shell?.isOpen?.(),
    touch: document.documentElement.classList.contains('ob-touch'), vw: innerWidth, vh: innerHeight };
})()`;

// #821: a locale pass's expected names come from the shipped dictionary on disk
// of the tree being served (this file's own; the standalone run's
// OB_G3_WEBDIR, set below) — an oracle re-read from the page moves with the
// page's own fault
let oracleWebDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictOf = (loc) => JSON.parse(fs.readFileSync(path.join(oracleWebDir, 'app', 'locales', `${loc}.json`), 'utf8'));
/** the read with its t() names replaced by the dictionary's (a locale pass is judged against disk; `src` names it) */
const fromDict = (r, D, loc) => ({ ...r, tSettings: D['shell.settings'], tOpen: D['shell.open'], tHall: D['shell.hall'], src: `${loc}.json` });
/** where a judged name came from, for the red's text */
const srcOf = (r, k) => (r.src ? `${r.src} ${k}` : `t(${k})`);
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

function judgeGear(r, { square }) { // D1 / P1 shared: the icon segment
  const bad = [];
  for (const k of ['ob-btn', 'ob-strip__seg']) if (!r.gear.cls.includes(k)) bad.push(`gear lacks .${k}`);
  if (r.gear.place !== null) bad.push('gear carries data-place (it must stay outside the roving set)');
  if (r.gear.text) bad.push(`gear still paints a word '${r.gear.text}' (R3: one glyph for one verb)`);
  if (!r.gear.svg) bad.push('gear has no svg[data-icon="gear"] in its .ob-btn__icon slot');
  else if (r.tbGearSvg && r.gear.svg !== r.tbGearSvg) bad.push('gear face differs from the toolbar #ob-gear face (must be the SAME glyph, byte-identical)');
  if (!r.tSettings || r.gear.aria !== r.tSettings || r.gear.title !== r.tSettings) bad.push(`gear name aria '${r.gear.aria}' / title '${r.gear.title}' (want ${srcOf(r, 'shell.settings')} = '${r.tSettings}')`);
  if (!r.gear.off || Math.abs(r.gear.off.dx) > 0.5 || Math.abs(r.gear.off.dy) > 0.5) bad.push(`gear face off-centre ${JSON.stringify(r.gear.off)}`);
  if (square) {
    if (!r.gear.cls.includes('ob-btn--icon')) bad.push('gear lacks .ob-btn--icon on a fine pointer');
    if (Math.abs(r.gear.r.w - 44) > 1 || Math.abs(r.gear.r.h - 44) > 1) bad.push(`gear ${r.gear.r.w.toFixed(1)}x${r.gear.r.h.toFixed(1)} is not the 44 square`);
  } else {
    if (!r.seg0 || Math.abs(r.gear.r.h - r.seg0.h) > 0.5) bad.push(`gear h ${r.gear.r.h.toFixed(1)} != place segment h ${r.seg0?.h?.toFixed(1)} (one strip rung)`);
    if (r.gear.r.w < 43.5 || r.gear.r.h < 43.5) bad.push(`gear ${r.gear.r.w.toFixed(1)}x${r.gear.r.h.toFixed(1)} under the 44 floor`);
  }
  return bad;
}

function judgePill(r, { icon }) { // D4 / P2 shared: the leading hall pill
  const bad = [];
  if (r.pill.hidden || !r.pill.paints) { bad.push('the hall pill does not paint after the exit'); return bad; }
  for (const k of ['ob-btn', 'ob-btn--glass', 'ob-toolbar-pill']) if (!r.pill.cls.includes(k)) bad.push(`pill lacks .${k}`);
  if (r.pill.icon !== 'shell-places') bad.push(`pill face data-icon ${r.pill.icon} (want the shell's shell-places mark)`);
  if (!r.tOpen || r.pill.aria !== r.tOpen || r.pill.title !== r.tOpen) bad.push(`pill name aria '${r.pill.aria}' / title '${r.pill.title}' (want ${srcOf(r, 'shell.open')} = '${r.tOpen}')`);
  if (r.pill.tbOrder !== '-1' || r.pill.order !== '-1') bad.push(`pill tbOrder ${r.pill.tbOrder} / order ${r.pill.order} (want -1: the leading slot)`);
  const notLeading = r.pill.sib.filter((s) => s.left <= r.pill.r.left + 0.5);
  if (!r.pill.sib.length) bad.push('no visible toolbar sibling to lead');
  else if (notLeading.length) bad.push(`pill is not left-most: ${notLeading.map((s) => '#' + s.id).join(', ')} sit(s) at or left of it`);
  if (r.pill.clip) bad.push('pill clips its content');
  if (icon) {
    if (!r.pill.cls.includes('ob-btn--icon')) bad.push('coarse pill lacks .ob-btn--icon');
    if (r.pill.lab && r.pill.lab.paints) bad.push(`coarse pill still paints the label '${r.pill.lab.text}' (icon-only under a finger)`);
    if (Math.abs(r.pill.r.w - 44) > 0.5 || Math.abs(r.pill.r.h - 44) > 0.5) bad.push(`coarse pill ${r.pill.r.w.toFixed(1)}x${r.pill.r.h.toFixed(1)} (want the 44 circle)`);
    if (!r.pill.off || Math.abs(r.pill.off.dx) > 0.5 || Math.abs(r.pill.off.dy) > 0.5) bad.push(`coarse pill face off-centre ${JSON.stringify(r.pill.off)}`);
  } else {
    if (r.pill.cls.includes('ob-btn--icon')) bad.push('fine-pointer pill wears .ob-btn--icon (the text register must lead)');
    if (!r.pill.lab || !r.pill.lab.paints) bad.push('fine-pointer pill paints no label');
    else if (!r.tHall || r.pill.lab.text !== r.tHall) bad.push(`pill label '${r.pill.lab?.text}' != ${srcOf(r, 'shell.hall')} '${r.tHall}'`);
    else if (r.pill.lab.clip) bad.push(`pill label '${r.pill.lab.text}' clips (never ellipsize)`);
    if (Math.abs(r.pill.r.h - 34) > 0.5) bad.push(`pill h ${r.pill.r.h.toFixed(2)} (J3: 34)`);
    if (r.pill.radius !== '999px') bad.push(`pill radius ${r.pill.radius} (J3: 999px)`);
    if (r.tbGear && (r.pill.bg !== r.tbGear.bg || r.pill.color !== r.tbGear.color || r.pill.blur !== r.tbGear.blur)) {
      bad.push(`pill material ${r.pill.bg}/${r.pill.color}/${r.pill.blur} != #ob-gear ${r.tbGear.bg}/${r.tbGear.color}/${r.tbGear.blur} (J3: one material)`);
    }
  }
  return bad;
}

async function desktop({ PORT, CDP_PORT, fail }) {
  const tag = 'G3 desktop'; const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`,
    { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    let r = await c.eval(READ);
    if (!r || r.missing) { fail(`${tag}: rail / gear / pill missing: ${JSON.stringify(r)}`); return; }
    // ---- D1: the icon segment ----------------------------------------------
    const b1 = judgeGear(r, { square: true });
    if (b1.length) fail(`${tag} D1: ` + b1.join('; '));
    else console.log(`${tag} D1 OK: gear ${r.gear.r.w.toFixed(0)}x${r.gear.r.h.toFixed(0)} icon segment, named '${r.gear.aria}', face == #ob-gear`);
    // ---- D2: roving set unchanged; a real Tab lands on the gear -------------
    const b2 = [];
    if (r.roving.n !== 4) b2.push(`${r.roving.n} [data-place] segments (want 4)`);
    if (r.roving.stops !== 1) b2.push(`${r.roving.stops} place tab stops (want exactly 1)`);
    await c.eval(`document.querySelector('#ob-shell-rail [data-place][tabindex="0"]')?.focus(), true`);
    await sleep(80);
    await key(c, 'Tab', 'Tab');
    await sleep(120);
    r = await c.eval(READ);
    if (!r.gear.focused) b2.push(`Tab from the current place landed on ${r.roving.focusedPlace ?? 'elsewhere'}, not the gear`);
    const before = r.roving.current;
    await key(c, 'ArrowRight', 'ArrowRight');
    await sleep(150);
    r = await c.eval(READ);
    if (r.roving.current !== before || !r.gear.focused) b2.push(`ArrowRight on the gear moved the place ${before} -> ${r.roving.current} / focus left the gear`);
    b2.push(...unjudgeable('ja', ['shell.settings']), ...(await preFlip(c, 'ja')));
    const fja = await flipLocale(c, 'ja');
    if (!fja?.applied) b2.push(`the ja switch did not land cleanly (${JSON.stringify(fja)})`);
    const sja = await settledRead(c, READ);
    if (!sja.settled) console.log(`${tag} D2 note: the ja read did not settle (${unsettledNote(sja)}) — judged as read`);
    const bja = judgeGear(fromDict(sja.value, dictOf('ja'), 'ja'), { square: true });
    if (bja.length) b2.push('ja: ' + bja.join('; '));
    const fen = await flipLocale(c, 'en');
    if (!fen?.applied) b2.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
    if (b2.length) fail(`${tag} D2: ` + b2.join('; ')); else console.log(`${tag} D2 OK: 4 places / 1 stop, Tab -> gear, ArrowRight inert on the gear, ja keeps the square`);
    // ---- D3: the rail's solid rung ------------------------------------------
    r = await c.eval(READ);
    const b3 = [];
    if (r.rail.blur !== 'none') b3.push(`rail backdrop-filter ${r.rail.blur} (want none: the solid rung)`);
    if (r.rail.bg !== r.solid) b3.push(`rail background ${r.rail.bg} != --ob-glass-solid ${r.solid}`);
    if (r.rail.alpha === null || r.rail.alpha < 0.9) b3.push(`rail background alpha ${r.rail.alpha} (< 0.9)`);
    // BY SURFACE (ORDER-LIGHT-C2-FIX21 / FIX24; GH-668 kit-owner concurrence 2026-09-16 17:35Z, rider 2): the play and replays hosts left the lift
    // with the rail (text-dense chrome over the scene takes the SOLID rung); the practice host still blurs under glass — glass mode stays gated
    const solidPlace = r.roving.current === 'play' || r.roving.current === 'replays';
    if (!r.glassOff && r.card && solidPlace && (r.card.blur !== 'none' || r.card.bg !== r.solid)) b3.push(`the ${r.roving.current} host card must sit on the solid rung (blur ${r.card.blur}, bg ${r.card.bg} vs --ob-glass-solid ${r.solid})`);
    if (!r.glassOff && (!r.practice || r.practice.blur === 'none')) b3.push(`the practice host LOST its glass lift under glass (section[data-place="practice"] backdrop-filter ${r.practice ? r.practice.blur : 'absent'})`);
    if (b3.length) fail(`${tag} D3: ` + b3.join('; ')); else console.log(`${tag} D3 OK: rail ${r.rail.bg} no blur; ${r.roving.current} host ${solidPlace ? 'on the solid rung ' + r.card?.bg : 'keeps ' + (r.card?.blur ?? 'n/a')}; practice host keeps ${r.practice?.blur ?? 'n/a'}`);
    // ---- D4: the leading labelled pill after a real quick-play exit ----------
    await c.eval('__shell.quickPlay(), true');
    if (!(await waitFor(c, '__shell.isOpen() === false'))) fail(`${tag} D4: quick-play did not close the hall`);
    else {
      await sleep(400);
      r = await c.eval(READ);
      const b4 = judgePill(r, { icon: false });
      b4.push(...unjudgeable('de', ['shell.open', 'shell.hall']), ...(await preFlip(c, 'de')));
      const fde = await flipLocale(c, 'de');
      if (!fde?.applied) b4.push(`the de switch did not land cleanly (${JSON.stringify(fde)})`);
      const sde = await settledRead(c, READ);
      if (!sde.settled) console.log(`${tag} D4 note: the de read did not settle (${unsettledNote(sde)}) — judged as read`);
      const de = fromDict(sde.value, dictOf('de'), 'de');
      const bde = judgePill(de, { icon: false });
      if (bde.length) b4.push('de: ' + bde.join('; '));
      const fen4 = await flipLocale(c, 'en');
      if (!fen4?.applied) b4.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen4)})`);
      if (b4.length) fail(`${tag} D4: ` + b4.join('; '));
      else console.log(`${tag} D4 OK: leading pill '${r.pill.lab.text}' / '${de.pill.lab.text}' ${r.pill.r.w.toFixed(0)}x${r.pill.r.h.toFixed(0)} r ${r.pill.radius}, material == #ob-gear, left of ${r.pill.sib.map((s) => '#' + s.id).join(' ')}`);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

async function phone({ PORT, CDP_PORT, fail }) {
  const tag = 'G3 phone'; const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`, { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    let r = await c.eval(READ);
    if (!r || r.missing) { fail(`${tag}: rail / gear / pill missing: ${JSON.stringify(r)}`); return; }
    if (!r.touch) { fail(`${tag}: html.ob-touch absent — not the coarse register`); return; }
    // ---- P1: the icon segment on the strip's coarse rung --------------------
    const b1 = judgeGear(r, { square: false });
    if (r.rail.blur !== 'none' || r.rail.bg !== r.solid) b1.push(`rail material ${r.rail.bg} / ${r.rail.blur} (want the solid rung, no blur)`);
    if (b1.length) fail(`${tag} P1: ` + b1.join('; '));
    else console.log(`${tag} P1 OK: gear ${r.gear.r.w.toFixed(0)}x${r.gear.r.h.toFixed(0)} on the ${r.seg0.h.toFixed(0)} rung, named '${r.gear.aria}', rail solid`);
    // ---- P2: the 44 icon-only leading pill after the exit -------------------
    await c.eval('__shell.quickPlay(), true');
    if (!(await waitFor(c, '__shell.isOpen() === false'))) fail(`${tag} P2: quick-play did not close the hall`);
    else {
      await sleep(400);
      r = await c.eval(READ);
      const b2 = judgePill(r, { icon: true });
      if (b2.length) fail(`${tag} P2: ` + b2.join('; '));
      else console.log(`${tag} P2 OK: pill ${r.pill.r.w.toFixed(0)}x${r.pill.r.h.toFixed(0)} icon-only, left of ${r.pill.sib.map((s) => '#' + s.id).join(' ')}`);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

export async function armG3(ctx) { await desktop(ctx); await phone(ctx); }

// ---- standalone (the red-proof runner; the gate imports armG3 above) ------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_G3_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  oracleWebDir = webDir; // the oracle reads the tree this run serves
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armG3({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-G3 FAIL' : 'E2E-SHELL-G3 PASS');
}
