// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-settings-g5.mjs — arm G5 of the settings-modal gate (GH-668 S5 slice 2,
// BACKLOG rows B-SH01 + B-SH07, rulings R2 / R5): the settings surface rides
// the KIT parts instead of its own chrome — the ledger rows (`.ob-navmodal__row`
// + `ob-control` labels), the toggles (kit `.ob-toggle` with the localized
// `.ob-toggle__state` word at the START of the control column), the About
// actions (`ob-btn ob-btn--ghost` on the control rung), the nav rail on the
// caps role, the pane title on the kit title role, and — on the phone sheet —
// the Share / Re-rack rows as intrinsic pills in the kit `.ob-navmodal__bar`
// (an in-flow footer under the elected scroller; hidden while the hall is open,
// FR-017).
//
// The law judged here (real-user boots, own browsers):
//   D1 desktop rows: every visible `#ob-settings-body .ob-set-row` wears
//      `ob-navmodal__row`, its label wears `ob-control` (14 px, no uppercase),
//      the grid resolves to `<label> 320px` (the kit's, not the sheet's);
//   D2 toggles: each checkbox sits in a `label.ob-toggle` inside the row's
//      control cell, carries a `.ob-toggle__state` == t('settings.on'|'off')
//      by its checked state, the track starts at the control column's left
//      edge (± 2 px), a click flips the word, a de flip re-labels it;
//   D3 About actions: `#ob-about-bugreport`, `#ob-about-licences` (and
//      `#ob-about-help` while __help exists) = `ob-btn ob-btn--ghost`, no
//      inline style, 40 ± 1 on the ladder, inline pad / height >= 0.39, pill
//      radius; the repo anchor keeps the dashed info voice;
//   D4 voices: nav rows wear `ob-caps` (uppercase in en, none in ja, 13 px);
//      `#ob-settings-section-title` wears `ob-title ob-navmodal__pane-title`,
//      16 px, no uppercase, visible on desktop;
//   P1 phone 844×390 sheet: `#ob-settings-actions` = `.ob-navmodal__bar`,
//      a child of `#ob-settings-pane` AFTER `#ob-settings-body` (in flow:
//      bar.top >= body.bottom − 1), holds exactly two `.ob-btn` rows (Share
//      first, no `.ob-touch-row`), each 44 ± 1 tall, pad / h >= 0.39, narrower
//      than 60 % of the bar, trailing (last right edge = bar content right
//      ± 2), both hit-testable at their centres;
//   P2 VOLUME reachable: at the display pane the range is inside the body's
//      port, or the body scrolls (scrollHeight > clientHeight) with the kit
//      block fade attached (`.ob-scrollfade`) and one scroll brings it in;
//   P3 the pane title is sr-only on coarse (1 × 1 clip-path box, text kept);
//   P4 FR-017: with the hall OPEN the rail gear opens this modal over it and
//      the bar computes display:none; close the hall → the rows return.
//
// Runs INSIDE e2e-settings.mjs (imported; own browsers on CDP_PORT + 6 /
// + 5 against the suite's static server) and stands alone for a fast red
// proof:  node web/tools/e2e-settings-g5.mjs  (OB_E2E_PORT / _CDP_PORT;
// OB_G5_WEBDIR serves another tree — the red-proof scratch archive).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone } from './touch-cdp.mjs';
import { flipLocale, settledRead, unsettledNote } from './lib/locale-settle.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 7 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-settings imports this leg module; standalone it runs on e2e-settings' own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-settings';

async function waitReady(c, tries = Number(process.env.OB_E2E_READY_TRIES) || 200) {
  for (let i = 0; i < tries; i++) {
    await sleep(200);
    try { if (await c.eval('window.__test?.ready === true')) return true; } catch { /* navigating */ }
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
const SHELL_UP = `!!document.getElementById('ob-settings') && !!document.getElementById('ob-settings-body')`;
const OPEN = `(() => { const el = document.getElementById('ob-settings'); return !!el && el.getClientRects().length > 0 && getComputedStyle(el).opacity === '1'; })()`;
const GONE = `(() => { const el = document.getElementById('ob-settings'); return !el || el.getClientRects().length === 0; })()`;

// one same-tick read of the modal's kit anatomy (both registers)
const READ = `(() => {
  const cs = getComputedStyle;
  const t = (k) => window.__i18n?.t?.(k) ?? null;
  const vis = (el) => !!el && el.getClientRects().length > 0 && cs(el).visibility !== 'hidden';
  const box = (el) => { if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const px = (v) => parseFloat(v) || 0;
  const modal = document.getElementById('ob-settings');
  if (!modal || !vis(modal)) return { up: false };
  const body = document.getElementById('ob-settings-body');
  const pane = document.getElementById('ob-settings-pane');
  const rows = [...modal.querySelectorAll('#ob-settings-body .ob-set-row')].filter(vis).map((row) => {
    const lab = row.querySelector(':scope > label'); const ctl = row.querySelector(':scope > .ob-set-ctl');
    const ls = lab ? cs(lab) : null;
    return { cls: [...row.classList], grid: cs(row).gridTemplateColumns, display: cs(row).display,
      lab: lab ? { cls: [...lab.classList], fs: px(ls.fontSize), tt: ls.textTransform, text: lab.textContent.trim(), for: lab.getAttribute('for'), r: box(lab) } : null,
      ctl: ctl ? box(ctl) : null };
  });
  const toggles = [...modal.querySelectorAll('input[type="checkbox"]')].filter((i) => vis(i.closest('label') || i)).map((i) => {
    const wrap = i.closest('label'); const row = i.closest('.ob-set-row'); const ctl = i.closest('.ob-set-ctl');
    const track = wrap?.querySelector(':scope > .ob-toggle__track'); const word = wrap?.querySelector(':scope > .ob-toggle__state');
    return { id: i.id, checked: i.checked, wrapCls: wrap ? [...wrap.classList] : null, inCtl: !!ctl && !!row && row.contains(ctl),
      rowIsKit: !!row && row.classList.contains('ob-navmodal__row'), track: box(track), word: word ? { text: word.textContent, hidden: word.getAttribute('aria-hidden'), r: box(word) } : null,
      ctl: box(ctl), disabled: i.disabled };
  });
  const about = ['ob-about-help', 'ob-about-bugreport', 'ob-about-licences'].map((id) => { const b = document.getElementById(id); if (!b) return { id, present: false };
    const s = cs(b); const r = box(b); return { id, present: true, hidden: b.hidden, visible: !!r, cls: [...b.classList], style: b.getAttribute('style'),
      r, pad: Math.min(px(s.paddingLeft), px(s.paddingRight)), radius: px(s.borderTopLeftRadius), fs: px(s.fontSize), lines: r ? Math.round(r.h / (px(s.lineHeight) || 20)) : 0 }; });
  const repo = document.getElementById('ob-about-repo');
  const nav = [...modal.querySelectorAll('.ob-set-nav')].filter(vis).map((b) => { const s = cs(b); return { cls: [...b.classList], tt: s.textTransform, fs: px(s.fontSize), fw: s.fontWeight, text: b.textContent.trim(), h: box(b)?.h ?? 0, current: b.getAttribute('aria-current') }; });
  const title = document.getElementById('ob-settings-section-title');
  const ts = title ? cs(title) : null;
  const actions = document.getElementById('ob-settings-actions');
  const bar = actions ? { cls: [...actions.classList], display: cs(actions).display, parent: actions.parentElement?.id ?? null,
    prev: actions.previousElementSibling?.id ?? null, r: box(actions), justify: cs(actions).justifyContent,
    padR: px(cs(actions).paddingRight), padL: px(cs(actions).paddingLeft),
    rows: [...actions.querySelectorAll('#ob-touch-drawer-rows > button')].map((b) => { const s = cs(b); const r = box(b);
      const hit = r ? document.elementFromPoint(r.l + r.w / 2, r.t + r.h / 2) : null;
      return { key: b.dataset.i18n, cls: [...b.classList], r, pad: Math.min(px(s.paddingLeft), px(s.paddingRight)), radius: px(s.borderTopLeftRadius),
        hitOk: !!hit && (b === hit || b.contains(hit)), disabled: b.disabled }; }) } : null;
  const vol = document.getElementById('ob-set-volume');
  const range = vol ? (vol.closest('.ob-range') ?? vol) : null;
  return { up: true, vw: innerWidth, vh: innerHeight, touch: document.documentElement.classList.contains('ob-touch'),
    shellOpen: document.body.classList.contains('ob-shell-open'), locale: window.__i18n?.locale?.() ?? null,
    active: window.__settings?.activeSection?.() ?? null,
    rows, toggles, about, repo: repo ? { cls: [...repo.classList], borderBottom: cs(repo).borderBottomStyle, deco: cs(repo).textDecorationLine } : null,
    nav, title: title ? { cls: [...title.classList], fs: px(ts.fontSize), tt: ts.textTransform, text: title.textContent, r: box(title), clip: ts.clipPath, w: title.getBoundingClientRect().width, h: title.getBoundingClientRect().height } : null,
    body: body ? { r: box(body), sh: body.scrollHeight, ch: body.clientHeight, st: body.scrollTop, fade: body.classList.contains('ob-scrollfade'), fadeB: body.getAttribute('data-ob-fade-bottom') } : null,
    pane: box(pane), bar, range: box(range),
    T: { on: t('settings.on'), off: t('settings.off') } };
})()`;

// ---- judges ------------------------------------------------------------------
function judgeRows(r, { coarse }) {
  const b = [];
  if (!r.rows.length) { b.push('no visible .ob-set-row in the body'); return b; }
  for (const row of r.rows) {
    if (!row.cls.includes('ob-navmodal__row')) b.push(`row '${row.lab?.text}' lacks .ob-navmodal__row`);
    if (row.display !== 'grid') b.push(`row '${row.lab?.text}' display ${row.display}`);
    if (!row.lab) { b.push('a row has no label child'); continue; }
    if (!row.lab.cls.includes('ob-control')) b.push(`label '${row.lab.text}' lacks .ob-control`);
    if (Math.abs(row.lab.fs - 14) > 0.5) b.push(`label '${row.lab.text}' ${row.lab.fs}px (control role = 14)`);
    if (row.lab.tt === 'uppercase') b.push(`label '${row.lab.text}' still uppercase`);
    const cols = row.grid.split(' ');
    if (!coarse && (cols.length !== 2 || Math.abs(parseFloat(cols[1]) - 320) > 0.5)) b.push(`row '${row.lab.text}' grid ${row.grid} (kit: <label> 320px)`);
    if (coarse && cols.length !== 2) b.push(`row '${row.lab.text}' grid ${row.grid} (kit coarse: 1fr / minmax(200px, 46%))`);
  }
  return [...new Set(b)];
}
function judgeToggles(r) {
  const b = [];
  if (r.toggles.length < 3) b.push(`only ${r.toggles.length} toggles visible (sound + cue path + wrong ball expected)`);
  for (const tg of r.toggles) {
    if (!tg.wrapCls?.includes('ob-toggle')) b.push(`#${tg.id} not wrapped in label.ob-toggle`);
    if (!tg.inCtl || !tg.rowIsKit) b.push(`#${tg.id} toggle is not inside a .ob-navmodal__row control cell`);
    if (!tg.track) b.push(`#${tg.id} has no visible .ob-toggle__track`);
    if (!tg.word) b.push(`#${tg.id} has no .ob-toggle__state word`);
    else {
      const want = tg.checked ? r.T.on : r.T.off;
      if (tg.word.text !== want) b.push(`#${tg.id} state word '${tg.word.text}' (want '${want}' for checked=${tg.checked})`);
      if (tg.word.hidden !== 'true') b.push(`#${tg.id} state word is not aria-hidden`);
    }
    if (tg.track && tg.ctl && Math.abs(tg.track.l - tg.ctl.l) > 2) b.push(`#${tg.id} track starts ${(tg.track.l - tg.ctl.l).toFixed(1)} px into the control column (kit: at its START)`);
    if (tg.track && tg.word?.r && tg.word.r.l < tg.track.r - 0.5) b.push(`#${tg.id} state word does not follow the track`);
  }
  return b;
}
function judgeAbout(r, { coarse }) {
  const b = [];
  for (const a of r.about) {
    if (!a.present) { b.push(`#${a.id} missing`); continue; }
    if (!a.cls.includes('ob-btn') || !a.cls.includes('ob-btn--ghost')) b.push(`#${a.id} lacks ob-btn ob-btn--ghost (${a.cls.join(' ')})`);
    if (a.style) b.push(`#${a.id} still carries an inline style (${a.style.slice(0, 40)})`);
    if (a.hidden) continue; // the help row hides without __help (024 law)
    if (!a.r) { b.push(`#${a.id} not painted`); continue; }
    const rung = coarse ? 44 : 40;
    if (Math.abs(a.r.h - rung) > 1) b.push(`#${a.id} h ${a.r.h.toFixed(1)} (want the ${rung} rung)`);
    if (a.pad / a.r.h < 0.39) b.push(`#${a.id} inline pad ${a.pad.toFixed(1)} on h ${a.r.h.toFixed(1)} = ${(a.pad / a.r.h).toFixed(2)} (< 0.4)`);
    if (a.radius < a.r.h / 2 - 0.5) b.push(`#${a.id} radius ${a.radius} is not the pill`);
    if (a.r.w > 0.9 * (r.pane?.w ?? 1e9)) b.push(`#${a.id} stretches across the plate (${a.r.w.toFixed(0)} px)`);
  }
  if (!r.repo) b.push('#ob-about-repo missing');
  else if (!r.repo.cls.includes('ob-about__repo') || (r.repo.borderBottom !== 'dashed' && !/underline/.test(r.repo.deco))) b.push('the repo link lost its dashed info voice');
  return b;
}
function judgeVoices(r, { coarse, cjk }) {
  const b = [];
  if (!r.nav.length) b.push('no visible nav rows');
  for (const n of r.nav) {
    if (!n.cls.includes('ob-caps')) b.push(`nav '${n.text}' lacks .ob-caps`);
    if (cjk ? n.tt === 'uppercase' : n.tt !== 'uppercase') b.push(`nav '${n.text}' text-transform ${n.tt} in ${r.locale}`);
    if (Math.abs(n.fs - (cjk ? 13 : 12)) > 0.5) b.push(`nav '${n.text}' ${n.fs}px (caps role: ${cjk ? 13 : 12})`);
    if (!coarse && Math.abs(n.h - 40) > 1) b.push(`nav '${n.text}' h ${n.h.toFixed(1)} (kit item rung 40)`);
  }
  if (!r.title) b.push('#ob-settings-section-title missing');
  else {
    if (!r.title.cls.includes('ob-title') || !r.title.cls.includes('ob-navmodal__pane-title')) b.push(`title lacks ob-title / ob-navmodal__pane-title (${r.title.cls.join(' ')})`);
    if (r.title.tt === 'uppercase') b.push('title still uppercase');
    if (!r.title.text) b.push('title has no text');
    if (!coarse && (Math.abs(r.title.fs - 16) > 0.5 || !r.title.r)) b.push(`title ${r.title.fs}px / painted ${!!r.title.r} (desktop: 16, visible)`);
    if (coarse && !(r.title.w <= 1 && r.title.h <= 1 && r.title.clip !== 'none')) b.push(`title on coarse is not sr-only (${r.title.w}x${r.title.h}, clip ${r.title.clip})`);
  }
  return b;
}

// ---- drivers -----------------------------------------------------------------
async function desktop({ PORT, CDP_PORT, fail }) {
  const tag = 'G5 desktop'; const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`, { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitFor(c, SHELL_UP, 100, 100))) { fail(`${tag}: the settings shell never mounted`); return; }
    await c.eval(`window.__shell?.isOpen?.() && window.__shell.quickPlay(), true`).catch(() => {});
    await waitFor(c, `!window.__shell?.isOpen?.()`, 40, 100);
    await c.eval(`document.getElementById('ob-gear').click(), true`);
    if (!(await waitFor(c, OPEN, 40, 100))) { fail(`${tag}: the modal did not open from the gear`); return; }
    await sleep(350);
    // ---- D1 + D2 at the display pane (rows + the sound toggle) --------------
    await c.eval(`window.__settings.show('display'), true`); await sleep(150);
    let r = await c.eval(READ);
    const b1 = judgeRows(r, { coarse: false });
    if (b1.length) fail(`${tag} D1: ` + b1.join('; ')); else console.log(`${tag} D1 OK: ${r.rows.length} rows on the kit grid (${r.rows[0].grid}), labels ${r.rows[0].lab.fs}px ${r.rows[0].lab.tt}`);
    await c.eval(`window.__settings.show('assists'), true`); await sleep(150);
    const ra = await c.eval(READ);
    r.toggles = [...r.toggles, ...ra.toggles];
    const b2 = judgeToggles(r);
    const snd = r.toggles.find((x) => x.id === 'ob-set-sound');
    if (snd) {
      await c.eval(`window.__settings.show('display'), true`); await sleep(120);
      await c.eval(`document.getElementById('ob-set-sound').click(), true`); await sleep(120);
      const after = (await c.eval(READ)).toggles.find((x) => x.id === 'ob-set-sound');
      if (!after || after.checked === snd.checked) b2.push('clicking the sound checkbox did not flip it');
      else if (after.word?.text !== (after.checked ? r.T.on : r.T.off)) b2.push(`state word did not follow the flip ('${after.word?.text}')`);
      await c.eval(`document.getElementById('ob-set-sound').click(), true`); await sleep(120); // restore
      // #860: the flip is AWAITED (dictionary fetch + every onLocaleChange
      // listener) and the read SETTLED — never a fixed 350 ms sleep
      const fde = await flipLocale(c, 'de');
      if (!fde?.applied) b2.push(`the de switch did not land cleanly (${JSON.stringify(fde)})`);
      const sde = await settledRead(c, READ);
      if (!sde.settled) console.log(`${tag} D2 note: the de read did not settle (${unsettledNote(sde)}) — judged as read`);
      const de = sde.value; const sd = de.toggles.find((x) => x.id === 'ob-set-sound');
      if (!sd?.word || sd.word.text !== (sd.checked ? de.T.on : de.T.off) || de.T.off === r.T.off) b2.push(`de flip did not re-label the state word ('${sd?.word?.text}', want '${sd?.checked ? de.T.on : de.T.off}')`);
      const fen = await flipLocale(c, 'en');
      if (!fen?.applied) b2.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
    }
    if (b2.length) fail(`${tag} D2: ` + b2.join('; ')); else console.log(`${tag} D2 OK: ${r.toggles.length} toggles, track at the control column start, word '${snd?.word?.text}' flips + re-labels in de`);
    // ---- D3 About actions -----------------------------------------------------
    await c.eval(`window.__settings.show('about'), true`); await sleep(150);
    r = await c.eval(READ);
    const b3 = judgeAbout(r, { coarse: false });
    if (b3.length) fail(`${tag} D3: ` + b3.join('; ')); else console.log(`${tag} D3 OK: ${r.about.filter((a) => a.r).map((a) => `#${a.id} ${a.r.w.toFixed(0)}x${a.r.h.toFixed(0)} pad ${a.pad}`).join(', ')}`);
    // ---- D4 voices: nav caps (en / ja) + the title role --------------------
    const b4 = judgeVoices(r, { coarse: false, cjk: false });
    const fja = await flipLocale(c, 'ja'); // #860: awaited + settled, as D2
    if (!fja?.applied) b4.push(`the ja switch did not land cleanly (${JSON.stringify(fja)})`);
    const sja = await settledRead(c, READ);
    if (!sja.settled) console.log(`${tag} D4 note: the ja read did not settle (${unsettledNote(sja)}) — judged as read`);
    const ja = sja.value;
    b4.push(...judgeVoices(ja, { coarse: false, cjk: true }).map((x) => 'ja: ' + x));
    const fen4 = await flipLocale(c, 'en');
    if (!fen4?.applied) b4.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen4)})`);
    if (b4.length) fail(`${tag} D4: ` + b4.join('; ')); else console.log(`${tag} D4 OK: nav '${r.nav[0].text}' ${r.nav[0].fs}px ${r.nav[0].tt} / ja '${ja.nav[0].text}' ${ja.nav[0].fs}px ${ja.nav[0].tt}; title '${r.title.text}' ${r.title.fs}px`);
    await c.eval(`window.__settings.show('assists'), true`);
    await c.eval(`document.getElementById('ob-settings-close').click(), true`);
    await waitFor(c, GONE, 30, 100);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

async function phone({ PORT, CDP_PORT, fail }) {
  const tag = 'G5 phone'; const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`, { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitFor(c, SHELL_UP, 100, 100))) { fail(`${tag}: the settings shell never mounted`); return; }
    if (!(await waitFor(c, `document.documentElement.classList.contains('ob-touch')`, 50, 100))) { fail(`${tag}: touch leaf never installed`); return; }
    // ---- P4 first: the hall is OPEN at boot — the rail gear opens the modal over it (FR-017) ----
    const b4 = [];
    if (!(await waitFor(c, `!!window.__shell?.isOpen?.() && !window.__shell.moving()`, 60, 150))) b4.push('the hall never settled open at boot');
    else {
      await c.eval(`document.getElementById('ob-shell-settings')?.click(), true`);
      if (!(await waitFor(c, OPEN, 40, 100))) b4.push('the rail gear did not open the modal');
      else {
        await sleep(400);
        const r4 = await c.eval(READ);
        if (!r4.shellOpen) b4.push('body.ob-shell-open absent with the modal over the hall');
        if (!r4.bar) b4.push('#ob-settings-actions missing');
        else if (r4.bar.display !== 'none' || r4.bar.r) b4.push(`the action bar paints while the hall is open (display ${r4.bar.display}) — FR-017`);
        await c.eval(`document.getElementById('ob-settings-close').click(), true`);
        await waitFor(c, GONE, 30, 100);
      }
    }
    if (b4.length) fail(`${tag} P4: ` + b4.join('; ')); else console.log(`${tag} P4 OK: bar hidden under the open hall (FR-017)`);
    // ---- P1–P3 with the hall CLOSED (the HUD gear) ---------------------------
    await c.eval(`window.__shell?.isOpen?.() && window.__shell.quickPlay(), true`).catch(() => {});
    await waitFor(c, `!window.__shell?.isOpen?.()`, 40, 100);
    await sleep(300);
    await c.eval(`document.getElementById('ob-gear').click(), true`);
    if (!(await waitFor(c, OPEN, 40, 100))) { fail(`${tag}: the modal did not open from the HUD gear`); return; }
    await waitFor(c, `document.querySelectorAll('#ob-touch-drawer-rows > button').length >= 2`, 30, 100);
    await sleep(400);
    let r = await c.eval(READ);
    const b1 = [];
    if (!r.touch) b1.push('html.ob-touch absent');
    if (!r.bar) b1.push('#ob-settings-actions missing');
    else {
      if (!r.bar.cls.includes('ob-navmodal__bar')) b1.push('bar lacks .ob-navmodal__bar');
      if (r.bar.parent !== 'ob-settings-pane' || r.bar.prev !== 'ob-settings-body') b1.push(`bar is not the pane's footer after the body (parent ${r.bar.parent}, prev ${r.bar.prev})`);
      if (!r.bar.r) b1.push(`bar not painted (display ${r.bar.display})`);
      else {
        if (r.body?.r && r.bar.r.t < r.body.r.b - 1) b1.push(`bar top ${r.bar.r.t.toFixed(1)} overlaps the body (bottom ${r.body.r.b.toFixed(1)}) — not in flow`);
        if (r.bar.rows.length !== 2) b1.push(`${r.bar.rows.length} rows (want Share + Re-rack)`);
        if (r.bar.rows[0]?.key !== 'share.button') b1.push(`row 0 is '${r.bar.rows[0]?.key}' (Share-first order contract)`);
        for (const row of r.bar.rows) {
          if (!row.cls.includes('ob-btn') || row.cls.includes('ob-touch-row')) b1.push(`${row.key} classes ${row.cls.join(' ')} (want an intrinsic ob-btn, no .ob-touch-row)`);
          if (!row.r) { b1.push(`${row.key} not painted`); continue; }
          if (Math.abs(row.r.h - 44) > 1) b1.push(`${row.key} h ${row.r.h.toFixed(1)} (coarse rung 44)`);
          if (row.pad / row.r.h < 0.39) b1.push(`${row.key} pad ${row.pad.toFixed(1)} / ${row.r.h.toFixed(1)} = ${(row.pad / row.r.h).toFixed(2)} (< 0.4)`);
          if (row.r.w > 0.6 * r.bar.r.w) b1.push(`${row.key} ${row.r.w.toFixed(0)} px wide stretches the bar (${r.bar.r.w.toFixed(0)})`);
          if (row.radius < row.r.h / 2 - 0.5) b1.push(`${row.key} is not a pill`);
          if (!row.hitOk) b1.push(`${row.key} centre is covered`);
        }
        const last = r.bar.rows[r.bar.rows.length - 1];
        if (last?.r && Math.abs((r.bar.r.r - r.bar.padR) - last.r.r) > 2) b1.push(`rows do not trail (last right ${last.r.r.toFixed(1)} vs bar content right ${(r.bar.r.r - r.bar.padR).toFixed(1)})`);
      }
    }
    if (b1.length) fail(`${tag} P1 (844x390): ` + b1.join('; ')); else console.log(`${tag} P1 OK: bar ${r.bar.r.w.toFixed(0)}x${r.bar.r.h.toFixed(0)} under the body, rows ${r.bar.rows.map((x) => `${x.key} ${x.r.w.toFixed(0)}x${x.r.h.toFixed(0)} pad ${x.pad.toFixed(1)}`).join(' / ')}`);
    // ---- P2 VOLUME reachable at the display pane ----------------------------
    await c.eval(`window.__settings.show('display'), true`); await sleep(250);
    r = await c.eval(READ);
    const b2 = [];
    const inPort = (x, p) => !!x && !!p && x.t >= p.t - 0.5 && x.b <= p.b + 0.5;
    if (!r.range || !r.body?.r) b2.push('volume range / body not painted');
    else if (!inPort(r.range, r.body.r)) {
      if (r.body.sh <= r.body.ch + 1) b2.push(`range at ${r.range.t.toFixed(0)}..${r.range.b.toFixed(0)} outside the body ${r.body.r.t.toFixed(0)}..${r.body.r.b.toFixed(0)} and the body does not scroll`);
      // scrollfade.js publishes data-ob-fade-bottom as a truthy flag ('1'); absent / '0' = no band painted
      if (!r.body.fade || !r.body.fadeB || r.body.fadeB === '0' || r.body.fadeB === 'false') b2.push(`the body clips below with no kit fade cue (ob-scrollfade ${r.body.fade}, fade-bottom ${r.body.fadeB})`);
      await c.eval(`(() => { const b = document.getElementById('ob-settings-body'); b.scrollTop = b.scrollHeight; return true; })()`); await sleep(200);
      const r2 = await c.eval(READ);
      if (!inPort(r2.range, r2.body.r)) b2.push(`one scroll does not bring the range in (${r2.range?.t.toFixed(0)}..${r2.range?.b.toFixed(0)} vs body ${r2.body.r.t.toFixed(0)}..${r2.body.r.b.toFixed(0)})`);
      if (r2.bar?.r && r2.range && r2.range.b > r2.bar.r.t + 0.5) b2.push('the range sits under the bar');
    }
    const rowsC = judgeRows(r, { coarse: true }); if (rowsC.length) b2.push('coarse rows: ' + rowsC.join('; '));
    if (b2.length) fail(`${tag} P2: ` + b2.join('; ')); else console.log(`${tag} P2 OK: range ${r.range.t.toFixed(0)}..${r.range.b.toFixed(0)} vs body ${r.body.r.t.toFixed(0)}..${r.body.r.b.toFixed(0)} (scroll ${r.body.sh}/${r.body.ch}, fade ${r.body.fade}/${r.body.fadeB}), rows ${r.rows[0].grid}`);
    // ---- P3 title sr-only + the coarse About pills --------------------------
    const b3 = judgeVoices(r, { coarse: true, cjk: false });
    await c.eval(`window.__settings.show('about'), true`); await sleep(200);
    const ra = await c.eval(READ); b3.push(...judgeAbout(ra, { coarse: true }));
    if (b3.length) fail(`${tag} P3: ` + b3.join('; ')); else console.log(`${tag} P3 OK: title '${r.title.text}' ${r.title.w}x${r.title.h} clip ${r.title.clip}; about ${ra.about.filter((a) => a.r).map((a) => `${a.r.w.toFixed(0)}x${a.r.h.toFixed(0)}`).join(' / ')}`);
    await c.eval(`window.__settings.show('assists'), true`);
    await c.eval(`document.getElementById('ob-settings-close').click(), true`);
    await waitFor(c, GONE, 30, 100);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

export async function armG5(ctx) { await desktop(ctx); await phone(ctx); }

// ---- standalone (the red-proof runner; the gate imports armG5 above) ------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_G5_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8201);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16301);
  const fail = (msg) => { console.error('E2E-SETTINGS FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armG5({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SETTINGS-G5 FAIL' : 'E2E-SETTINGS-G5 PASS');
}
