// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-shell-g4.mjs — arm G4 of the ui-shell gate (GH-668 S5 slice 2, BACKLOG
// rows B-SH08 + B-PL05, ruling R6): the shell's two TRANSIENT panels are the
// kit `.ob-prompt` registers — the notice (`--notice`) and the routed
// decision prompt (`--routed`) — instead of shell-drawn geometry.
//
// The law judged here (both registers, real-user boots):
//   N1 refusal notice (shell closed, a shot in flight): #ob-shell-note =
//      div.ob-prompt.ob-prompt--notice, role=status, text == t(key) for the
//      key it was raised with, the --ob-info-line top edge (resolved through
//      a probe), text-wrap balance, pointer-events none, bottom edge at the
//      kit's 84 px (no lift while the hall is closed); a locale flip WHILE
//      IT IS UP re-composes the text (the key is stored, not the string;
//      #821: every flip in this arm is AWAITED and its read settled —
//      lib/locale-settle.mjs — and a locale pass's expected strings come from
//      app/locales/<loc>.json on disk, never from the page under test);
//      MATERIAL on every notice read (vfix, B-SH08 / A2): under glass on,
//      computed backdrop-filter none + background alpha >= 0.9, background
//      == --ob-glass-solid (a probe) — the kit.css solid-rung hunk, judged
//      like G3's rail;
//   N2 notice with the hall OPEN (the replays place's honest register):
//      rect ∩ rail = ∅ with >= 10 px clearance, ∩ card column = ∅, no lift;
//   N3 notice at 700 x 500 (fine, the stack ABOVE the rail in the notice's
//      column): the seam lift — exactly 10 px above the stack, the lift
//      class rides; the invariant lift ⇔ (stacked ∧ shared column) holds
//      on every read (the notice never floats off its rail register);
//   D1 decision prompt (carom boot → break_spot): #ob-shell-decision =
//      div.ob-prompt.ob-prompt--routed (no .ob-panel), h2.ob-prompt__title
//      #ob-shell-decision-title == t('decision.q.break_spot') (<= 40 ch in
//      en), span.ob-prompt__hint == chooser + ' · ' + t('decision.cite.
//      break_spot') in the caps role, .ob-prompt__actions.osd-btns (the
//      e2e-play alias) holds the two options: every one a NEUTRAL .ob-btn
//      (zero --primary), option 0 carries data-ob-present-focus; the box
//      is start-aligned, fit-content (>= its widest option, <= 560), top
//      centred on 1440; at 1024 × 768 it sits in the band right of the
//      card column (right edge = vw - 12, ∩ card = ∅); a de flip re-titles;
//      answering through option 0 resolves and keeps the hall open;
//   P1 phone notice (the G2 long-press on quick-play, 844 × 390 AND
//      667 × 375): classes, ∩ rail = ∅, ∩ quick-play stack = ∅, >= 10 px
//      above the stack (the --ob-prompt-lift from the B-K05 seam), width
//      <= 56vw; ja flip while up re-composes and leaves no one-glyph
//      orphan line;
//   P2 phone decision prompt at 667 × 375: neutral pills each >= 44 tall,
//      none wider than the prompt box, right edge in the band, ∩ card = ∅.
//   P3 the PENDING controls leaf (review r1 P2 on PR #726): ui/controls.js
//      held through Fetch past the prompt build at 667 × 375 under the notch
//      insets, the de answer swapped for the dictionary's longest (SYNTHETIC)
//      → no overflow at any moment, the shell belt on the long answer;
//      import failed → the belt stays; released → the kit takes it over.
//
// Runs INSIDE e2e-shell.mjs (imported; reuses its +6 desktop / +5 phone CDP
// slots after arm G3 — PORT_INVENTORY unchanged) and stands alone for a fast
// red proof:  node web/tools/e2e-shell-g4.mjs  (OB_E2E_PORT / _CDP_PORT).
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { launchPhone, setPhoneMetrics, setSafeAreaInsets, touchStart, touchEnd } from './touch-cdp.mjs';
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

// one same-tick read of the notice: classes / role / text / material cue
// (the --ob-info-line probe) / wrap / geometry against the rail, the card
// column and the quick-play stack (the B-K05 seam's truth: computed rects)
const READ_NOTE = `(() => {
  const n = document.getElementById('ob-shell-note');
  const t = (k, p) => window.__i18n?.t?.(k, p) ?? null;
  const cs = getComputedStyle;
  const box = (el) => { if (!el || el.hidden || !el.getClientRects().length || cs(el).visibility === 'hidden') return null;
    const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const ovl = (a, b) => a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0;
  let probe = document.getElementById('ob-g4-probe');
  if (!probe) { probe = document.createElement('span'); probe.id = 'ob-g4-probe';
    probe.style.cssText = 'position:fixed;visibility:hidden;border-top:1px solid var(--ob-info-line)'; document.body.appendChild(probe); }
  // MATERIAL (S5 slice-2 vfix, B-SH08 / A2): the notice sits on the SOLID rung
  // under glass too (kit.css states it at the smoke rule's own specificity) —
  // resolved through a --ob-glass-solid probe, mirroring G3's rail check
  let solid = document.getElementById('ob-g4-solid');
  if (!solid) { solid = document.createElement('span'); solid.id = 'ob-g4-solid';
    solid.style.cssText = 'position:fixed;visibility:hidden;background-color:var(--ob-glass-solid)'; document.body.appendChild(solid); }
  // computed colours arrive as oklch(l c h / a) for the tokens and rgb[a]() for
  // legacy literals — read the alpha from either shape (1 when absent)
  const alpha = (bg) => { const sl = /\\/\\s*([0-9.]+)(%?)\\s*\\)\\s*$/.exec(bg); if (sl) return sl[2] ? parseFloat(sl[1]) / 100 : parseFloat(sl[1]);
    const m = /^rgba?\\(([^)]+)\\)/.exec(bg); if (!m) return /^(oklch|oklab|rgb|hsl)\\(/.test(bg) ? 1 : null; const p = m[1].split(',').map((x) => parseFloat(x)); return p.length > 3 ? p[3] : 1; };
  if (!n || !n.isConnected) return { up: false, vw: innerWidth, vh: innerHeight };
  // line boxes of the text (Range rects grouped by top) — the ja orphan law
  const range = document.createRange(); range.selectNodeContents(n);
  const lines = []; for (const r of range.getClientRects()) { if (r.width <= 0) continue;
    const L = lines.find((x) => Math.abs(x.top - r.top) < 2); if (L) { L.w += r.width; L.l = Math.min(L.l, r.left); L.r = Math.max(L.r, r.right); }
    else lines.push({ top: r.top, w: r.width, l: r.left, r: r.right }); }
  const fs = parseFloat(cs(n).fontSize) || 14;
  // CASCADE (review r2v P3): under a LIVE kit the kit's .ob-prompt--notice
  // register must be the cascade WINNER — the shell.css stale-kit belt is
  // :where()-wrapped (zero specificity). Proven two ways in one task: the
  // computed max-width equals the kit's own declaration (the last kit rule
  // matching the notice under the live media, resolved on a probe box), and
  // PERTURBING the belt's max-width in the CSSOM (restored before any paint)
  // does not move the computed value. RED on a bare #ob-shell-note belt.
  const cascade = (() => {
    const out = { beltSel: null, beltMw: null, kitSel: null, kitMw: null, kitResolved: null, mw: cs(n).maxWidth, perturbed: null, err: '' };
    try {
      const walk = (rules, acc) => { for (const r of rules) {
        if (r.type === 4) { if (!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules, acc); }
        else if (r.selectorText && r.style) acc.push(r); } return acc; };
      const sheet = (re) => { for (const sh of document.styleSheets) { if (!re.test(sh.href || '')) continue; try { return walk(sh.cssRules, []); } catch { return []; } } return []; };
      const belt = sheet(/ui\\/shell\\.css/).filter((r) => /#ob-shell-note\\)?$/.test(r.selectorText) && r.style.maxWidth).pop();
      const kit = sheet(/ui\\/kit\\.css/).filter((r) => r.style.maxWidth && (() => { try { return n.matches(r.selectorText); } catch { return false; } })()).pop();
      if (belt) { out.beltSel = belt.selectorText; out.beltMw = belt.style.maxWidth; }
      if (kit) { out.kitSel = kit.selectorText; out.kitMw = kit.style.maxWidth;
        const p = document.createElement('div'); p.style.cssText = 'position:fixed;visibility:hidden;left:0;right:0;width:fit-content'; p.style.maxWidth = kit.style.maxWidth;
        document.body.appendChild(p); out.kitResolved = cs(p).maxWidth; p.remove(); }
      if (belt) { const was = belt.style.maxWidth; belt.style.setProperty('max-width', '333px'); out.perturbed = cs(n).maxWidth; belt.style.setProperty('max-width', was); }
    } catch (e) { out.err = String(e); }
    return out;
  })();
  return { up: true, vw: innerWidth, vh: innerHeight, touch: document.documentElement.classList.contains('ob-touch'), cascade,
    cls: [...n.classList], lift: n.classList.contains('ob-shell-note--lift'), role: n.getAttribute('role'), live: n.getAttribute('aria-live'), text: n.textContent,
    edge: cs(n).borderTopColor, info: cs(probe).borderTopColor, edgeW: cs(n).borderTopWidth,
    bg: cs(n).backgroundColor, blur: cs(n).backdropFilter, alpha: alpha(cs(n).backgroundColor), solid: cs(solid).backgroundColor,
    glassOff: document.body.classList.contains('ob-glass-off'),
    wrap: cs(n).textWrapStyle || cs(n).textWrap || null, pe: cs(n).pointerEvents, align: cs(n).textAlign,
    r: box(n), rail: box(document.getElementById('ob-shell-rail')), cards: box(document.getElementById('ob-shell-cards')),
    qp: box(document.getElementById('ob-shell-quickplay-wrap')), stacked: document.body.classList.contains('ob-shell-stacked'),
    lines: lines.map((L) => ({ w: L.w, l: L.l, r: L.r })), fs, glyphs: (n.textContent || '').length,
    ovlRail: ovl(box(n), box(document.getElementById('ob-shell-rail'))), ovlQp: ovl(box(n), box(document.getElementById('ob-shell-quickplay-wrap'))),
    ovlCards: ovl(box(n), box(document.getElementById('ob-shell-cards'))),
    open: !!window.__shell?.isOpen?.(), T: { busy: t('shell.notice.busy'), gone: t('shell.place.replays.notice.gone'),
      on: t('shell.rememberOn'), off: t('shell.rememberOff') } };
})()`;

// #821: a locale pass's expected strings come from the shipped dictionary on
// disk of the tree being served (this file's own; the standalone run's
// OB_G4_WEBDIR, set below) — an oracle re-read from the page moves with the
// page's own fault
let oracleWebDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dictOf = (loc) => JSON.parse(fs.readFileSync(path.join(oracleWebDir, 'app', 'locales', `${loc}.json`), 'utf8'));
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
// shell.js note(): a notice removes itself NOTE_DWELL_MS after it is raised — a read that comes later cannot judge it
const NOTE_DWELL_MS = 4000;
/** the words for a notice that is gone after a locale flip: a defect while its dwell still held (it was raised no
 * earlier than `t0`, so it owed presence until t0 + NOTE_DWELL_MS), no verdict once the dwell can have run out */
const goneNote = (t0, flip, loc) => {
  const ms = Date.now() - t0;
  return ms < NOTE_DWELL_MS ? `the notice vanished under the ${loc} flip (${ms} ms after it was raised; the switch took ${flip?.ms ?? '?'} ms)`
    : `UNJUDGEABLE — the notice's ${NOTE_DWELL_MS} ms dwell may have run out before the ${loc} read (${ms} ms since it was raised; the switch took ${flip?.ms ?? '?'} ms)`;
};
/** a decision read's T, composed from <loc>.json the way i18n.t() composes it (a key the locale lacks falls back to
 * en.json, then to the key itself; {name} params filled) — `src` names the dictionary for the red's text */
const decisionT = (r, loc) => {
  const D = dictOf(loc), E = dictOf('en');
  const t = (k, p = {}) => (D[k] ?? E[k] ?? k).replace(/\{(\w+)\}/g, (m, n) => (p[n] !== undefined ? String(p[n]) : m));
  const ch = r?.pend?.chooser;
  return { ...r?.T, q: t('decision.q.break_spot'), cite: t('decision.cite.break_spot'), title: t('decision.title.break_spot'),
    chooser: ch == null ? null : (ch === 'both' ? t('decision.chooserBoth') : t('decision.chooser', { player: ch })), src: `${loc}.json` };
};

// one same-tick read of the decision prompt
const READ_DEC = `(() => {
  const p = document.getElementById('ob-shell-decision');
  const t = (k, o) => window.__i18n?.t?.(k, o) ?? null;
  const cs = getComputedStyle;
  const box = (el) => { if (!el || el.hidden || !el.getClientRects().length || cs(el).visibility === 'hidden') return null;
    const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; };
  const ovl = (a, b) => a && b ? Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t)) : 0;
  const pend = window.__rules?.matchState?.()?.pendingDecision ?? null;
  if (!p || !p.isConnected) return { up: false, pend, open: !!window.__shell?.isOpen?.(), vw: innerWidth, vh: innerHeight };
  const title = p.querySelector('#ob-shell-decision-title');
  const hint = p.querySelector('.ob-prompt__hint');
  const acts = p.querySelector('.ob-prompt__actions');
  const alias = p.querySelectorAll('.osd-btns button');
  const btns = [...p.querySelectorAll('button')].map((b) => ({ cls: [...b.classList], choice: b.dataset.choice,
    text: b.textContent, r: box(b), anchor: b.hasAttribute('data-ob-present-focus'), autorow: b.hasAttribute('data-ob-autorow'),
    focused: document.activeElement === b, lines: (() => { const rg = document.createRange(); rg.selectNodeContents(b);
      const tops = new Set(); for (const r of rg.getClientRects()) if (r.width > 0) tops.add(Math.round(r.top)); return tops.size; })() }));
  const chooser = pend ? (pend.chooser === 'both' ? t('decision.chooserBoth') : t('decision.chooser', { player: pend.chooser })) : null;
  const sa = (() => { const s = document.createElement('div'); s.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
    document.body.appendChild(s); const c = cs(s); const o = { t: parseFloat(c.paddingTop), r: parseFloat(c.paddingRight), b: parseFloat(c.paddingBottom), l: parseFloat(c.paddingLeft) }; s.remove(); return o; })();
  return { up: true, pend, open: !!window.__shell?.isOpen?.(), vw: innerWidth, vh: innerHeight, sa,
    touch: document.documentElement.classList.contains('ob-touch'), cls: [...p.classList], role: p.getAttribute('role'),
    labelledby: p.getAttribute('aria-labelledby'), align: cs(p).textAlign, r: box(p), maxW: cs(p).maxWidth,
    // GH-738 CASCADE (the notice's review r2v P3 probe on the prompt's own
    // signature property): under a LIVE kit the kit .ob-prompt--routed rule
    // must WIN top — the shell.css stale-kit belt (:where(#ob-shell-decision),
    // zero specificity) EXISTS and declares top, the computed top equals the
    // kit's own declaration (resolved on a probe box) and perturbing the
    // belt's top in the CSSOM (restored in the same task) does not move the
    // box. RED on main 0120202e (no belt) and on a bare #ob-shell-decision belt.
    cascade: (() => { const out = { beltSel: null, beltTop: null, kitSel: null, kitTop: null, kitResolved: null, top: cs(p).top, perturbed: null, err: '' };
      try { const walk = (rules, acc) => { for (const x of rules) { if (x.type === 4) { if (!x.media || matchMedia(x.media.mediaText).matches) walk(x.cssRules, acc); } else if (x.selectorText && x.style) acc.push(x); } return acc; };
        const sheet = (re) => { for (const sh of document.styleSheets) { if (!re.test(sh.href || '')) continue; try { return walk(sh.cssRules, []); } catch { return []; } } return []; };
        const belt = sheet(/ui\\/shell\\.css/).filter((x) => /#ob-shell-decision\\)$/.test(x.selectorText) && x.style.top).pop();
        const kit = sheet(/ui\\/kit\\.css/).filter((x) => x.style.top && (() => { try { return p.matches(x.selectorText); } catch { return false; } })()).pop();
        if (belt) { out.beltSel = belt.selectorText; out.beltTop = belt.style.top; }
        if (kit) { out.kitSel = kit.selectorText; out.kitTop = kit.style.top; const q = document.createElement('div'); q.style.cssText = 'position:fixed;visibility:hidden;left:0;width:1px;height:1px'; q.style.top = kit.style.top; document.body.appendChild(q); out.kitResolved = cs(q).top; q.remove(); }
        if (belt) { const was = belt.style.top; belt.style.setProperty('top', '333px'); out.perturbed = cs(p).top; belt.style.setProperty('top', was); }
      } catch (e) { out.err = String(e); } return out; })(),
    title: title ? { tag: title.tagName, cls: [...title.classList], text: title.textContent, fs: cs(title).fontSize } : null,
    hint: hint ? { cls: [...hint.classList], text: hint.textContent, tt: cs(hint).textTransform, fs: cs(hint).fontSize } : null,
    acts: acts ? { cls: [...acts.classList], n: acts.children.length } : null, aliasN: alias.length, btns,
    card: box(document.querySelector('#ob-shell-cards > section:not([hidden])')),
    ovlCard: ovl(box(p), box(document.querySelector('#ob-shell-cards > section:not([hidden])'))),
    qp: box(document.getElementById('ob-shell-quickplay-wrap')),
    T: { q: t('decision.q.break_spot'), cite: t('decision.cite.break_spot'), chooser, title: t('decision.title.break_spot') },
    locale: window.__i18n?.locale?.() ?? null };
})()`;

const CLEAR = 10; // px of breathing between the notice and any shell band
function judgeNote(r, { want, coarse }) { // the kit notice register + its geometry
  const bad = [];
  if (!r.up) { bad.push('no #ob-shell-note is up'); return bad; }
  for (const k of ['ob-prompt', 'ob-prompt--notice']) if (!r.cls.includes(k)) bad.push(`notice lacks .${k}`);
  if (r.role !== 'status' || r.live !== 'polite') bad.push(`notice role ${r.role} / aria-live ${r.live} (want status / polite)`);
  if (want !== undefined && r.text !== want) bad.push(`notice text '${r.text}' != '${want}'`);
  if (!r.info || r.edge !== r.info) bad.push(`notice top edge ${r.edge} != --ob-info-line ${r.info} (the register cue)`);
  if (parseFloat(r.edgeW) < 1) bad.push(`notice top edge width ${r.edgeW} (want >= 1px)`);
  if (r.wrap !== 'balance') bad.push(`notice text-wrap ${r.wrap} (want balance)`);
  // MATERIAL (vfix, B-SH08 / A2 — the kit.css solid-rung hunk): under glass ON
  // the notice carries NO backdrop blur and an opaque (>= 0.9) ground that
  // resolves to --ob-glass-solid; red with the kit hunk reverted (family smoke)
  if (!r.glassOff) {
    if (r.blur !== 'none') bad.push(`notice backdrop-filter ${r.blur} (want none: the solid rung under glass)`);
    if (r.alpha === null || r.alpha < 0.9) bad.push(`notice background alpha ${r.alpha} (< 0.9: the family smoke, not the solid rung)`);
  }
  if (!r.solid || r.bg !== r.solid) bad.push(`notice background ${r.bg} != --ob-glass-solid ${r.solid}`);
  if (r.pe !== 'none') bad.push(`notice pointer-events ${r.pe} (informational: none)`);
  // CASCADE (review r2v P3): with kit.css present the KIT register wins — the
  // computed max-width is the kit's own declaration and a perturbed shell.css
  // belt value does not move it (the belt is :where()-wrapped, zero
  // specificity). RED on a bare `#ob-shell-note` belt (1,0,0 outranks the kit).
  const c = r.cascade;
  if (!c || c.err) bad.push(`cascade probe failed: ${c ? c.err : 'no record'}`);
  else {
    if (!c.beltSel) bad.push('shell.css carries no #ob-shell-note stale-kit belt (the ownership ledger mixed-cache rule)');
    else if (!/^:where\(/.test(c.beltSel)) bad.push(`shell.css belt selector '${c.beltSel}' is not :where()-wrapped — it outranks the kit's .ob-prompt--notice`);
    if (!c.kitMw) bad.push('kit.css declares no max-width on a rule matching the notice (.ob-prompt--notice)');
    else if (c.mw !== c.kitResolved) bad.push(`notice max-width ${c.mw} != the kit's '${c.kitMw}' (${c.kitResolved}) from '${c.kitSel}'`);
    if (c.beltSel && c.perturbed !== c.mw) bad.push(`perturbing the shell.css belt max-width moved the notice's computed max-width ${c.mw} → ${c.perturbed} (the belt outranks the LIVE kit)`);
  }
  if (!r.r) { bad.push('notice does not paint'); return bad; }
  if (r.ovlRail > 0) bad.push(`notice ∩ rail = ${r.ovlRail.toFixed(0)} px²`);
  if (r.ovlQp > 0) bad.push(`notice ∩ quick-play stack = ${r.ovlQp.toFixed(0)} px²`);
  if (r.ovlCards > 0) bad.push(`notice ∩ card column = ${r.ovlCards.toFixed(0)} px²`);
  // vertical breathing is owed only where the bands share columns (the
  // side-by-side desktop stack sits right of a bottom-centred notice)
  const shares = (b) => b && r.r.l < b.r && b.l < r.r.r;
  if (shares(r.rail) && r.rail.t - r.r.b < CLEAR - 0.5 && r.r.t < r.rail.b) bad.push(`notice clears the rail by ${(r.rail.t - r.r.b).toFixed(1)} px (< ${CLEAR})`);
  if (shares(r.qp) && r.qp.t - r.r.b < CLEAR - 0.5 && r.r.t < r.qp.b) bad.push(`notice clears the quick-play stack by ${(r.qp.t - r.r.b).toFixed(1)} px (< ${CLEAR})`);
  // the lift invariant: the class rides exactly when the stack is stacked AND shares the column
  const wantLift = !!(r.stacked && shares(r.qp));
  if (r.lift !== wantLift) bad.push(`lift class ${r.lift} while stacked ${r.stacked} / shares column ${shares(r.qp)} (want ${wantLift}: never float the notice off its rail register)`);
  if (r.r.l < -0.5 || r.r.r > r.vw + 0.5 || r.r.t < -0.5 || r.r.b > r.vh + 0.5) bad.push(`notice leaves the viewport ${JSON.stringify(r.r)}`);
  if (coarse && r.r.w > r.vw * 0.56 + 0.5 && r.r.w > 480.5) bad.push(`coarse notice ${r.r.w.toFixed(0)} px wide (> min(480, 56vw))`);
  // no one-glyph orphan line: a wrapped notice's last line paints >= 2 glyphs
  if (r.lines.length > 1) { const last = r.lines[r.lines.length - 1]; if (last.w < r.fs * 1.6) bad.push(`orphan last line ${last.w.toFixed(1)} px wide (< 2 glyphs of ${r.fs}px) over ${r.lines.length} lines`); }
  return bad;
}

function judgeDecision(r, { coarse }) { // the kit routed register + R6 anatomy
  const bad = [];
  if (!r.up) { bad.push(`no #ob-shell-decision is up (pending ${JSON.stringify(r.pend)}, open ${r.open})`); return bad; }
  for (const k of ['ob-prompt', 'ob-prompt--routed']) if (!r.cls.includes(k)) bad.push(`prompt lacks .${k}`);
  if (r.cls.includes('ob-panel')) bad.push('prompt still wears .ob-panel (an instrument panel, not place chrome)');
  if (r.role !== 'group' || r.labelledby !== 'ob-shell-decision-title') bad.push(`prompt role ${r.role} / labelledby ${r.labelledby}`);
  if (!['start', 'left'].includes(r.align)) bad.push(`prompt text-align ${r.align} (the only centred panel in the shell)`);
  if (!r.title) bad.push('no #ob-shell-decision-title');
  else {
    if (r.title.tag !== 'H2' || !r.title.cls.includes('ob-prompt__title')) bad.push(`title is <${r.title.tag.toLowerCase()} class="${r.title.cls.join(' ')}"> (want h2.ob-prompt__title)`);
    if (!r.T.q || r.title.text !== r.T.q) bad.push(`title '${r.title.text}' != ${r.T.src ? `${r.T.src} ` : 't('}decision.q.break_spot${r.T.src ? '' : ')'} '${r.T.q}'`);
    if (r.locale === 'en' && r.title.text.length > 40) bad.push(`en title is ${r.title.text.length} ch (> 40)`);
    if (/\(.*\)\s*$/.test(r.title.text)) bad.push(`title still carries the citation: '${r.title.text}'`);
  }
  if (!r.hint) bad.push('no .ob-prompt__hint (chooser · citation)');
  else {
    const want = r.T.chooser && r.T.cite ? `${r.T.chooser} · ${r.T.cite}` : null;
    if (!want || r.hint.text !== want) bad.push(`hint '${r.hint.text}' != '${want}' (${r.T.src ?? 't()'} decision.chooser · decision.cite.break_spot)`);
    if (!['ja', 'ko', 'zh-CN'].includes(r.locale) && r.hint.tt !== 'uppercase') bad.push(`hint text-transform ${r.hint.tt} (the caps role)`);
  }
  if (!r.acts || !r.acts.cls.includes('osd-btns')) bad.push('actions row lacks the .osd-btns alias (e2e-play pins it)');
  if (r.aliasN !== 2 || r.btns.length !== 2) bad.push(`${r.btns.length} options / ${r.aliasN} via the alias (want 2 / 2)`);
  r.btns.forEach((b, i) => {
    if (!b.cls.includes('ob-btn')) bad.push(`option ${i} lacks .ob-btn`);
    if (b.cls.includes('ob-btn--primary')) bad.push(`option ${i} '${b.text}' wears --primary (R6: equal choices, no false default)`);
    if (i === 0 && !b.anchor) bad.push('option 0 is not the focus-on-present anchor (data-ob-present-focus)');
    if (!b.r) bad.push(`option ${i} does not paint`);
    else {
      if (coarse && b.r.h < 43.5) bad.push(`option ${i} ${b.r.h.toFixed(1)} px tall under a finger (< 44)`);
      if (r.r && b.r.r > r.r.r + 0.5) bad.push(`option ${i} '${b.text}' overflows the prompt box by ${(b.r.r - r.r.r).toFixed(1)} px`);
      if (b.lines > 1 && !b.cls.includes('ob-btn--row')) bad.push(`option ${i} '${b.text}' paints ${b.lines} lines as a PILL (G5: a wrapping label becomes --row)`);
    }
  });
  if (r.r) {
    const widest = Math.max(...r.btns.map((b) => b.r?.w ?? 0));
    if (r.r.w > 560.5) bad.push(`prompt ${r.r.w.toFixed(0)} px wide (> 560)`);
    if (r.r.w < widest) bad.push(`prompt ${r.r.w.toFixed(0)} px narrower than its widest option ${widest.toFixed(0)}`);
    if (r.ovlCard > 0) bad.push(`prompt ∩ card = ${r.ovlCard.toFixed(0)} px²`);
    if (r.r.l < r.sa.l - 0.5 || r.r.r > r.vw - r.sa.r + 0.5) bad.push(`prompt outside the horizontal safe region ${JSON.stringify(r.r)}`);
  }
  return bad;
}

const CAROM_BOOT = `(() => {
  localStorage.setItem('ob-settings-v1', JSON.stringify({ game: 'carom_3cushion' }));
  localStorage.setItem('ob-shell-v1', JSON.stringify({ v: 1, lastPlace: 'play', startAtTable: false }));
  location.reload(); return true; })()`;
const PROMPT_UP = `document.querySelectorAll('#ob-shell-decision .osd-btns button').length === 2`;
async function bootCaromPrompt(c, tag, fail) { // → true when the break_spot prompt is up inside the open hall
  await c.eval(CAROM_BOOT);
  await sleep(1200);
  if (!(await waitReady(c))) { fail(`${tag}: carom boot never became ready`); return false; }
  if (!(await waitFor(c, `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`, 40, 250))) { fail(`${tag}: carom boot never raised break_spot`); return false; }
  // the shell module lands after __test.ready on a loaded box (G7 e2e-shell r7: `__shell is not defined` right after the reload) — wait for it, never assume it
  if (!(await waitFor(c, `typeof window.__shell?.openShell === 'function'`, 40, 250))) { fail(`${tag}: window.__shell never landed after the carom reload`); return false; }
  if (!(await c.eval('__shell.isOpen() || __shell.openShell() === true'))) { fail(`${tag}: entry under the pending decision refused`); return false; }
  if (!(await waitFor(c, PROMPT_UP, 30, 200))) { fail(`${tag}: the in-shell prompt never presented`); return false; }
  await sleep(350); // the kit auto-row judge (rAF) + the band write
  return true;
}
async function answerFirst(c, tag, fail) {
  await c.eval(`(document.querySelector('#ob-shell-decision .osd-btns button')?.click(), true)`);
  const gone = await waitFor(c, `!document.getElementById('ob-shell-decision') && !window.__rules?.matchState?.()?.pendingDecision`, 30, 100);
  const open = await c.eval('__shell.isOpen()');
  if (!gone || !open) fail(`${tag}: answering through option 0 must resolve the decision and keep the hall open (gone ${gone}, open ${open})`);
  return gone && open;
}

async function desktop({ PORT, CDP_PORT, fail }) {
  const tag = 'G4 desktop'; const errs = [];
  const c = await launchChrome(`http://127.0.0.1:${PORT}/app.html`, { port: CDP_PORT + 6, width: 1440, height: 900, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    // ---- N1: the refusal notice with the hall CLOSED (a shot in flight) ----
    await c.eval('__shell.quickPlay(), true');
    if (!(await waitFor(c, '__shell.isOpen() === false'))) fail(`${tag} N1: quick-play did not close the hall`);
    const rej = await c.eval('__test.shoot({ power: 5 })');
    if (rej) fail(`${tag} N1: probe shot rejected: ${rej}`);
    await sleep(150);
    const tRaise = Date.now(); // the refusal notice is raised no earlier than this
    const opened = await c.eval('__shell.openShell()');
    let r = await c.eval(READ_NOTE);
    const b1 = opened === false ? judgeNote(r, { want: r.T.busy, coarse: false }) : [`entry was not refused during the live shot (${opened})`];
    if (r.up && r.r && Math.abs((r.vh - r.r.b) - 84) > 1.5) b1.push(`closed-hall notice bottom at ${(r.vh - r.r.b).toFixed(1)} px (kit: 84, no lift)`);
    if (r.up && r.stacked) b1.push('body.ob-shell-stacked while the hall is closed');
    const DE = dictOf('de');
    b1.push(...unjudgeable('de', ['shell.notice.busy']), ...(await preFlip(c, 'de')));
    const fde = await flipLocale(c, 'de');
    if (!fde?.applied) b1.push(`the de switch did not land cleanly (${JSON.stringify(fde)})`);
    const sde = await settledRead(c, READ_NOTE);
    if (!sde.settled) console.log(`${tag} N1 note: the de read did not settle (${unsettledNote(sde)}) — judged as read`);
    const de = sde.value;
    if (!de.up) b1.push(goneNote(tRaise, fde, 'de'));
    else if (de.text !== DE['shell.notice.busy']) b1.push(`notice did not re-compose on the locale flip: '${de.text}' (want de.json shell.notice.busy '${DE['shell.notice.busy']}'; the page's t() reads '${de.T.busy}')`);
    const fen = await flipLocale(c, 'en');
    if (!fen?.applied) b1.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
    if (b1.length) fail(`${tag} N1: ` + b1.join('; '));
    else console.log(`${tag} N1 OK: '${r.text}' → '${de.text}', ${r.r.w.toFixed(0)}x${r.r.h.toFixed(0)} at bottom ${(r.vh - r.r.b).toFixed(0)}, edge ${r.edge}, ${r.wrap}`);
    await waitFor(c, `!['SIMULATING', 'PLAYBACK'].includes(__test.state())`, 150, 200);
    await waitFor(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
    // ---- N2: the notice with the hall OPEN at the replays place -------------
    const b2 = [];
    if (await c.eval('__shell.openShell() === true || __shell.isOpen()')) {
      await waitOpenAt(c, 'play');
      await c.eval(`__shell.go('replays'), true`);
      if (!(await waitOpenAt(c, 'replays'))) b2.push('never landed at replays');
      else {
        await sleep(300);
        await c.eval(`window.__replays?.open?.('no-such-session'), true`).catch(() => {});
        await sleep(350);
        r = await c.eval(READ_NOTE);
        b2.push(...judgeNote(r, { want: r.T.gone, coarse: false }));
        if (r.up && r.r && r.rail && r.r.b > r.rail.t) b2.push(`open-hall notice bottom ${r.r.b.toFixed(1)} below the rail top ${r.rail.t.toFixed(1)}`);
        if (!b2.length) console.log(`${tag} N2 OK: '${r.text}' ${r.r.w.toFixed(0)}x${r.r.h.toFixed(0)}, rail clearance ${(r.rail.t - r.r.b).toFixed(1)} px, cards/qp overlap 0, no lift`);
        await waitFor(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
        // ---- N3: the fine <= 700 px register — the stack IS in the column: the seam lift
        await c.send('Emulation.setDeviceMetricsOverride', { width: 700, height: 500, deviceScaleFactor: 1, mobile: false });
        await sleep(500);
        await c.eval(`window.__replays?.open?.('no-such-session'), true`).catch(() => {});
        await sleep(350);
        const n3 = await c.eval(READ_NOTE);
        const b3 = judgeNote(n3, { want: n3.T?.gone, coarse: false });
        if (n3.vw !== 700) b3.push(`staging: vw ${n3.vw} (want 700)`);
        if (n3.up && !n3.stacked) b3.push('body.ob-shell-stacked absent at 700 x 500 (the stack sits above the rail here)');
        if (n3.up && n3.r && n3.qp && !(n3.r.l < n3.qp.r && n3.qp.l < n3.r.r)) b3.push(`staging: the stack ${JSON.stringify(n3.qp)} shares no column with the notice ${JSON.stringify(n3.r)} at 700`);
        else if (n3.up && n3.r && n3.qp && Math.abs((n3.qp.t - n3.r.b) - CLEAR) > 1) b3.push(`700: notice bottom ${n3.r.b.toFixed(1)} vs stack top ${n3.qp.t.toFixed(1)} (want the seam lift: exactly ${CLEAR} px)`);
        if (n3.up && !n3.lift) b3.push('the lift class is absent while the stack shares the column');
        if (b3.length) fail(`${tag} N3: ` + b3.join('; '));
        else console.log(`${tag} N3 OK (700x500): '${n3.text}' ${n3.r.w.toFixed(0)}x${n3.r.h.toFixed(0)} lifted ${(n3.qp.t - n3.r.b).toFixed(1)} px above the ${n3.qp.w.toFixed(0)} px stack, rail/cards overlap 0`);
        await waitFor(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
        await c.send('Emulation.clearDeviceMetricsOverride');
        await sleep(400);
        await c.eval(`__shell.go('play'), true`); await waitOpenAt(c, 'play');
      }
    } else b2.push('the hall would not re-open after the shot settled');
    if (b2.length) fail(`${tag} N2: ` + b2.join('; '));
    await d1(c, tag, fail);
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

async function d1(c, tag, fail) { // ---- D1: the routed decision prompt (fine pointer) ----
  if (!(await bootCaromPrompt(c, `${tag} D1`, fail))) return;
  let r = await c.eval(READ_DEC);
  const b = judgeDecision(r, { coarse: false });
  // GH-738: the kit is the cascade WINNER for the routed prompt's placement
  // while a shell.css stale-kit belt exists beneath it (e2e-ui's stale-kit
  // lab proves the belt side under kit.css 404)
  const kc = r.up ? r.cascade : null;
  if (r.up && (!kc || kc.err)) b.push(`GH-738 cascade probe failed: ${kc ? kc.err : 'no record'}`);
  else if (kc) {
    if (!kc.beltSel || !/^:where\(/.test(kc.beltSel)) b.push(`GH-738: no :where()-wrapped shell.css belt declares top for #ob-shell-decision (found ${kc.beltSel})`);
    if (!kc.kitSel) b.push('GH-738: no live kit rule declares the routed prompt\'s top');
    if (kc.kitResolved && kc.top !== kc.kitResolved) b.push(`GH-738: computed top ${kc.top} != the kit's own declaration ${kc.kitTop} (${kc.kitResolved})`);
    if (kc.beltSel && kc.perturbed !== kc.top) b.push(`GH-738: perturbing the shell.css belt top moved the prompt's computed top ${kc.top} -> ${kc.perturbed} (the belt outranks the LIVE kit)`);
  }
  if (r.up && r.r) {
    const mid = (r.r.l + r.r.r) / 2;
    if (Math.abs(mid - r.vw / 2) > 1) b.push(`prompt centre ${mid.toFixed(1)} != vw/2 ${(r.vw / 2).toFixed(1)} at ${r.vw} (the top-centre law)`);
    if (Math.abs(r.r.t - 12) > 1) b.push(`prompt top ${r.r.t.toFixed(1)} (want sp-3 = 12)`);
  }
  // the <= 1180 px register: the band right of the card column
  await c.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 768, deviceScaleFactor: 1, mobile: false });
  await sleep(450);
  const n = await c.eval(READ_DEC);
  if (n.vw !== 1024) b.push(`staging: the 1024 register did not take (vw ${n.vw})`);
  else {
    const bn = judgeDecision(n, { coarse: false });
    if (n.up && n.r && Math.abs((n.vw - n.r.r) - 12) > 1) bn.push(`at 1024 the prompt's right edge sits ${(n.vw - n.r.r).toFixed(1)} px from the edge (want the 12 px band)`);
    if (n.up && n.card && n.r && n.r.l < n.card.r + 11.5) bn.push(`at 1024 the prompt's left ${n.r.l.toFixed(1)} is inside the 12 px band right of the card column (${n.card.r.toFixed(1)})`);
    if (bn.length) b.push('1024x768: ' + bn.join('; '));
  }
  await c.send('Emulation.clearDeviceMetricsOverride');
  await sleep(350);
  // a locale flip re-titles (the sig carries the translated question)
  b.push(...unjudgeable('de', ['decision.q.break_spot', 'decision.cite.break_spot', 'decision.chooser', 'decision.chooserBoth']), ...(await preFlip(c, 'de')));
  const fde = await flipLocale(c, 'de');
  if (!fde?.applied) b.push(`the de switch did not land cleanly (${JSON.stringify(fde)})`);
  const sde = await settledRead(c, READ_DEC);
  if (!sde.settled) console.log(`${tag} D1 note: the de read did not settle (${unsettledNote(sde)}) — judged as read`);
  const de = { ...sde.value, T: decisionT(sde.value, 'de') };
  const bde = judgeDecision(de, { coarse: false });
  if (bde.length) b.push('de: ' + bde.join('; '));
  const fen = await flipLocale(c, 'en');
  if (!fen?.applied) b.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
  // the en re-title lands on the machine's frame hook (shell.js syncDecisionPrompt rebuilds the prompt): settle on
  // it before the keyboard probe, so the probe focuses the prompt the en pass built, never the de one it replaces
  const sen = await settledRead(c, READ_DEC);
  if (!sen.settled) console.log(`${tag} D1 note: the en read did not settle (${unsettledNote(sen)}) — probed as read`);
  const enQ = dictOf('en')['decision.q.break_spot'];
  if (sen.value?.up && sen.value.title?.text !== enQ) b.push(`the en restore did not re-title the prompt: '${sen.value.title?.text}' (want en.json decision.q.break_spot '${enQ}')`);
  // keyboard: option 0 is where a Tab from the title lands; the prompt never
  // steals focus on present (non-modal law) — probe the anchor, not a trap
  const focus = await c.eval(`(() => { const b = document.querySelector('#ob-shell-decision [data-ob-present-focus]'); if (!b) return null;
    b.focus({ preventScroll: true }); return document.activeElement === b; })()`);
  if (focus !== true) b.push(`option 0 could not take focus (${focus})`);
  if (b.length) fail(`${tag} D1: ` + b.join('; '));
  else console.log(`${tag} D1 OK: '${r.title.text}' / '${r.hint.text}' ${r.r.w.toFixed(0)}x${r.r.h.toFixed(0)} centred, 1024 right band ${n.r ? (n.vw - n.r.r).toFixed(0) : '?'} px, de '${de.title?.text}', ${r.btns.length} neutral options`);
  // ---- D2 (GH-1053, settings-modal.md §7 D18): the hall rail's Settings
  // segment opens the settings modal with the in-shell decision prompt up
  // (RED pre-fix: showThenOpen clicked the gear into decisionLocked()'s
  // silent return — nothing opened), and closing it returns to the hall
  // with the prompt still up and the decision untouched. A REAL click.
  {
    const bd = [];
    const before = await c.eval(`JSON.stringify(window.__rules.matchState()?.pendingDecision ?? null)`);
    const seg = await c.eval(`(() => { const el = document.getElementById('ob-shell-settings'); if (!el) return null;
      const r = el.getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2;
      const hit = document.elementFromPoint(x, y); return { x, y, hit: !!hit && (hit === el || el.contains(hit)) }; })()`);
    if (!seg) bd.push('no #ob-shell-settings rail segment');
    else if (!seg.hit) bd.push('the rail Settings segment is occluded at its centre');
    else {
      for (const type of ['mousePressed', 'mouseReleased']) {
        await c.send('Input.dispatchMouseEvent', { type, x: seg.x, y: seg.y, button: 'left', clickCount: 1 });
      }
      const opened = await waitFor(c, `document.getElementById('ob-gear')?.getAttribute('aria-expanded') === 'true'
        && document.getElementById('ob-settings')?.getClientRects().length > 0`, 30, 150);
      if (!opened) bd.push('the rail Settings segment did not open settings under the pending decision');
      else {
        await c.eval(`(document.getElementById('ob-settings-close')?.click(), true)`);
        const closed = await waitFor(c, `!(document.getElementById('ob-settings')?.getClientRects().length > 0)`, 30, 150);
        if (!closed) bd.push('settings did not close');
        await sleep(300);
        const after = await c.eval(`({ pd: JSON.stringify(window.__rules.matchState()?.pendingDecision ?? null),
          open: __shell.isOpen(), prompt: ${PROMPT_UP} })`);
        if (after.pd !== before) bd.push(`the decision changed across the round trip (${before} → ${after.pd})`);
        if (!after.open) bd.push('the hall closed across the round trip');
        if (!after.prompt) bd.push('the in-shell decision prompt is gone after the round trip');
      }
    }
    if (bd.length) fail(`${tag} D2 GH-1053: ` + bd.join('; '));
    else console.log(`${tag} D2 OK (GH-1053): the rail Settings segment opens settings under break_spot; close returns to the hall, prompt up, decision unchanged`);
  }
  await answerFirst(c, `${tag} D1`, fail);
}

async function holdQuickPlay(c) { // the G2 long-press: toggles remember + speaks the notice, no exit
  const pt = await c.eval(`(() => { const r = document.getElementById('ob-shell-quickplay').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await touchStart(c, [{ x: pt.x, y: pt.y, id: 1 }]); await sleep(800); await touchEnd(c); await sleep(320);
}
async function phone({ PORT, CDP_PORT, fail }) {
  const tag = 'G4 phone'; const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`, { cdpPort: CDP_PORT + 5, tool: false });
  watchErrors(c, errs);
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if (!(await waitOpenAt(c, 'play'))) { fail(`${tag}: the boot settle never landed at play`); return; }
    await sleep(300);
    // ---- P1: the notice over the folded stack at 844x390, then 667x375 ------
    await holdQuickPlay(c);
    let r = await c.eval(READ_NOTE);
    const b1 = judgeNote(r, { want: r.T?.on, coarse: true });
    if (r.up && !r.touch) b1.push('html.ob-touch absent — not the coarse register');
    if (r.up && !r.stacked) b1.push('body.ob-shell-stacked absent with the stack above the rail');
    if (r.up && r.r && r.qp && r.r.l < r.qp.r && r.qp.l < r.r.r && r.r.b > r.qp.t - (CLEAR - 0.5)) b1.push(`844: notice bottom ${r.r.b.toFixed(1)} vs stack top ${r.qp.t.toFixed(1)} (want >= ${CLEAR} px above: the --ob-prompt-lift)`);
    if (b1.length) fail(`${tag} P1 (844x390): ` + b1.join('; '));
    else console.log(`${tag} P1 OK (844x390): '${r.text}' ${r.r.w.toFixed(0)}x${r.r.h.toFixed(0)}, ${r.lift ? (r.qp.t - r.r.b).toFixed(1) + ' px above the stack (lifted)' : 'beside the stack on the rail register (no lift)'}, rail/cards overlap 0`);
    await waitFor(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
    await setPhoneMetrics(c, { width: 667, height: 375 });
    await sleep(400);
    if (!(await c.eval('__shell.isOpen()'))) await c.eval('__shell.openShell(), true');
    if (!(await waitOpenAt(c, 'play'))) fail(`${tag} P1: 667x375 never settled at play`);
    else {
      const tHold = Date.now(); // the remember notice is raised no earlier than the hold's start
      await holdQuickPlay(c); // the second hold flips remember back OFF
      r = await c.eval(READ_NOTE);
      const b = judgeNote(r, { want: r.T?.off, coarse: true });
      if (r.up && r.vw !== 667) b.push(`staging: vw ${r.vw} (want 667)`);
      if (r.up && r.r && r.qp && r.r.l < r.qp.r && r.qp.l < r.r.r && r.r.b > r.qp.t - (CLEAR - 0.5)) b.push(`667: notice bottom ${r.r.b.toFixed(1)} vs stack top ${r.qp.t.toFixed(1)} (want >= ${CLEAR} px above)`);
      const JA = dictOf('ja');
      b.push(...unjudgeable('ja', ['shell.rememberOff']), ...(await preFlip(c, 'ja')));
      const fja = await flipLocale(c, 'ja');
      if (!fja?.applied) b.push(`the ja switch did not land cleanly (${JSON.stringify(fja)})`);
      const sja = await settledRead(c, READ_NOTE);
      if (!sja.settled) console.log(`${tag} P1 note: the ja read did not settle (${unsettledNote(sja)}) — judged as read`);
      const ja = sja.value;
      if (!ja.up) b.push(goneNote(tHold, fja, 'ja'));
      else { const bj = judgeNote(ja, { want: JA['shell.rememberOff'], coarse: true }); if (bj.length) b.push('ja (want ja.json shell.rememberOff): ' + bj.join('; ')); }
      const fen = await flipLocale(c, 'en');
      if (!fen?.applied) b.push(`the restoring en switch did not land cleanly (${JSON.stringify(fen)})`);
      if (b.length) fail(`${tag} P1 (667x375): ` + b.join('; '));
      else console.log(`${tag} P1 OK (667x375): '${r.text}' → ja '${ja.text}' (${ja.lines.length} line(s)), ${r.lift ? (r.qp.t - r.r.b).toFixed(1) + ' px above the stack (lifted)' : 'beside the stack on the rail register (no lift)'}`);
    }
    await waitFor(c, `!document.getElementById('ob-shell-note')?.isConnected`, 60, 100);
    // ---- P2: the routed prompt under a finger at 667x375 ---------------------
    if (await bootCaromPrompt(c, `${tag} P2`, fail)) {
      r = await c.eval(READ_DEC);
      const b2 = judgeDecision(r, { coarse: true });
      if (r.up && r.r && Math.abs((r.vw - r.sa.r - r.r.r) - 12) > 1) b2.push(`right edge ${(r.vw - r.sa.r - r.r.r).toFixed(1)} px from the safe edge (want the 12 px band)`);
      if (b2.length) fail(`${tag} P2: ` + b2.join('; '));
      else console.log(`${tag} P2 OK: ${r.btns.map((x) => `${x.r.w.toFixed(0)}x${x.r.h.toFixed(0)}${x.autorow ? ' row' : ''}`).join(' / ')} in a ${r.r.w.toFixed(0)} px prompt, card overlap 0`);
      await answerFirst(c, `${tag} P2`, fail);
    }
    if (await c.eval('__test.errors.length').catch(() => 0)) fail(`${tag}: app errors: ` + JSON.stringify(await c.eval('__test.errors')));
    if (errs.length) fail(`${tag}: console errors: ` + errs.slice(0, 3).join(' | '));
  } finally { c.close(); await sleep(800); }
}

// ---- P3: the controls leaf HELD / FAILED / RELEASED (review r1 P2 on PR #726)
// ui/controls.js is intercepted through Fetch (renderer + disk caches
// disabled for the carom reload — a cached module never pauses; the SW is
// off under navigator.webdriver) and the de dictionary is served with
// break_spot answer 2 swapped for the dictionary's OWN longest German answer
// (decision.opt.eight_break_foul.1 — SYNTHETIC copy swap: break_spot's real
// de copy fits every register) at 667 x 375 under the P2p-sa notch insets
// (prompt bound 255 px), so the long answer MUST wrap or overflow:
//   P3a HELD     — main.js boot() awaits the kit (`await import('./ui/
//                  controls.js')`, try/catch) BEFORE __test.ready, and the
//                  shell builds its prompt only after ready: while the module
//                  is held, ready never flips and no #ob-shell-decision
//                  exists — the "pending at build" window CANNOT open on a
//                  real boot (the finding's scenario is foreclosed by the boot
//                  order; the shell's belt — beltPendingOptions — is the
//                  contract-correct guard for a boot order that stops
//                  awaiting the kit, and is unreachable today: DISCLOSED);
//       RELEASED — the held request continues → ready → the prompt under de:
//                  the kit is LIVE, the long answer wears .ob-btn--row +
//                  data-ob-autorow (the kit judge), no shell belt, and the
//                  short answer — one line on its own — joins the long one's
//                  row pole, stamped by the same judge (ONE pole per group,
//                  the uiaudit A13 law, #1002), nothing paints past its
//                  box/prompt, no label is clipped;
//   P3b FAILED   — the request fails → boot continues (uiKit null) → the
//                  shell's import rejects → controlsLeaf null at build → the
//                  options take --row outright (no belt, no autorow), no
//                  overflow; the prompt still answers.
// No red on a4fc33a9 is possible for this arm (the vfix-era null path already
// wore --row; the pending window never opens) — it is a fence on the boot
// order + the failed-leaf law, not a red-proof of the belt.
const LONG_KEY = 'decision.opt.eight_break_foul.1';
const READ_BELT = `(() => {
  const p = document.getElementById('ob-shell-decision'); if (!p) return { up: false, ready: window.__test?.ready === true };
  const pr = p.getBoundingClientRect();
  const btns = [...p.querySelectorAll('.ob-prompt__actions .ob-btn')].map((b) => { const r = b.getBoundingClientRect();
    const rg = document.createRange(); rg.selectNodeContents(b); const tops = new Set(); for (const x of rg.getClientRects()) if (x.width > 0) tops.add(Math.round(x.top));
    return { text: b.textContent, row: b.classList.contains('ob-btn--row'), belt: b.hasAttribute('data-ob-shell-belt'), autorow: b.hasAttribute('data-ob-autorow'),
      over: Math.round((b.scrollWidth - b.clientWidth) * 10) / 10, clip: Math.round((b.scrollHeight - b.clientHeight) * 10) / 10,
      past: Math.round((r.right - pr.right) * 10) / 10, w: Math.round(r.width), h: Math.round(r.height), lines: tops.size }; });
  return { up: true, ready: window.__test?.ready === true, vw: innerWidth, locale: window.__i18n?.locale?.() ?? null, promptW: Math.round(pr.width), btns };
})()`;
function judgeBelt(r, { stage, long }) { // the no-overflow law at one moment + the stage's register
  const bad = [];
  if (!r.up) { bad.push(`${stage}: no #ob-shell-decision`); return bad; }
  if (r.locale !== 'de') bad.push(`${stage}: staging — locale ${r.locale} (want de)`);
  const L = r.btns.find((b) => b.text === long); const S = r.btns.find((b) => b.text !== long);
  if (r.btns.length !== 2 || !L || !S) { bad.push(`${stage}: staging — options ${JSON.stringify(r.btns.map((b) => b.text))} (want the swapped long de answer + one short)`); return bad; }
  for (const b of r.btns) {
    if (b.over > 1) bad.push(`${stage}: '${b.text.slice(0, 24)}…' paints ${b.over} px past its pill (scrollWidth > clientWidth)`);
    if (b.clip > 1) bad.push(`${stage}: '${b.text.slice(0, 24)}…' is clipped ${b.clip} px below its box (scrollHeight > clientHeight — a truncated label)`);
    if (b.past > 0.5) bad.push(`${stage}: '${b.text.slice(0, 24)}…' paints ${b.past} px past the prompt`);
    if (b.lines > 1 && !b.row) bad.push(`${stage}: '${b.text.slice(0, 24)}…' paints ${b.lines} lines as a PILL`);
  }
  if (!L.row) bad.push(`${stage}: the long answer has no .ob-btn--row (${L.w} px wide in a ${r.promptW} px prompt)`);
  if (L.belt || S.belt) bad.push(`${stage}: a shell belt is marked (data-ob-shell-belt) — the leaf was never PENDING at build here`);
  // P3a: the kit judge (controls.js) owns the pole, and it decides ONE pole per GROUP (the
  // uiaudit A13 law, #1002): the long answer's row pole carries its short sibling too, both
  // stamped by the same judge — a short answer left a pill beside the row (two shapes and two
  // heights in one prompt) is the per-pill law this replaced, and stays red
  if (stage === 'P3a released') {
    if (!L.autorow) bad.push(`${stage}: the kit judge did not stamp data-ob-autorow on the long answer (auto-row observer not live?)`);
    if (!S.row) bad.push(`${stage}: the short answer '${S.text}' stayed a PILL beside the long answer's row (${S.w}x${S.h} in a ${r.promptW} px prompt) — one pole per group (A13)`);
    else if (!S.autorow) bad.push(`${stage}: the short answer wears --row but no data-ob-autorow — the group pole was not the kit judge's`);
    // staging: the short answer must FIT one line on its own, or a per-pill kit would row it
    // too and this stage would stop proving the GROUP pole (a longer de copy breaks the fixture)
    if (S.lines > 1) bad.push(`${stage}: staging — the short answer wraps on its own (${S.lines} lines): it no longer proves the group pole`);
  }
  if (stage === 'P3b failed') { if (L.autorow || S.autorow) bad.push(`${stage}: data-ob-autorow present with the kit leaf FAILED`); }
  return bad;
}
async function pendingLeaf({ PORT, CDP_PORT, fail }) {
  const tag = 'G4 P3'; const errs = [];
  const c = await launchPhone(`http://127.0.0.1:${PORT}/app.html`, { cdpPort: CDP_PORT + 5, width: 667, height: 375, tool: false });
  watchErrors(c, errs);
  const fetchCtl = { mode: 'hold', held: [], seen: 0, dict: 0 };
  try {
    if (!(await waitReady(c))) { fail(`${tag}: real-user boot never became ready`); return; }
    if ((await setSafeAreaInsets(c, { top: 0, left: 47, right: 47, bottom: 21 })) === null) { fail(`${tag}: Emulation.setSafeAreaInsetsOverride is unavailable — the leg needs the pinned chrome-headless-shell`); return; }
    // the SYNTHETIC de dictionary: the tree's own de.json with answer 2 swapped for its longest German answer
    const de = await (await fetch(`http://127.0.0.1:${PORT}/app/locales/de.json`)).json();
    const long = de[LONG_KEY]; if (!long || long.length < 40) { fail(`${tag}: staging — ${LONG_KEY} missing or short in de.json ('${long}')`); return; }
    const body = Buffer.from(JSON.stringify({ ...de, 'decision.opt.break_spot.2': long }), 'utf8').toString('base64');
    c.onEvent((method, params) => {
      if (method !== 'Fetch.requestPaused') return;
      const url = params.request.url;
      if (/\/locales\/de\.json/.test(url)) { fetchCtl.dict++; c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Cache-Control', value: 'no-store' }], body }).catch(() => {}); return; }
      if (/\/ui\/controls\.js/.test(url)) { fetchCtl.seen++;
        if (fetchCtl.mode === 'hold') fetchCtl.held.push(params.requestId);
        else if (fetchCtl.mode === 'fail') c.send('Fetch.failRequest', { requestId: params.requestId, errorReason: 'ConnectionRefused' }).catch(() => {});
        else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
        return; }
      c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    // the reload must reach the NETWORK: the first load already fetched the module and the static server sends no
    // Cache-Control (heuristic freshness) — a cached module never pauses in Fetch; the SW is off under webdriver
    await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    await c.send('Fetch.enable', { patterns: [{ urlPattern: '*ui/controls.js*' }, { urlPattern: '*locales/de.json*' }] });
    const reload = async () => { await c.eval(CAROM_BOOT); await sleep(1200); };
    const promptDe = async (leg) => { // ready → break_spot → the hall → the prompt → the de swap → one read
      if (!(await waitReady(c))) { fail(`${tag}${leg}: carom boot never became ready`); return null; }
      if (!(await waitFor(c, `window.__rules?.matchState?.()?.pendingDecision?.kind === 'break_spot'`, 40, 250))) { fail(`${tag}${leg}: no break_spot`); return null; }
      if (!(await waitFor(c, `typeof window.__shell?.openShell === 'function'`, 40, 250))) { fail(`${tag}${leg}: window.__shell never landed`); return null; }
      if (!(await c.eval('__shell.isOpen() || __shell.openShell() === true'))) { fail(`${tag}${leg}: entry refused`); return null; }
      if (!(await waitFor(c, PROMPT_UP, 30, 200))) { fail(`${tag}${leg}: the in-shell prompt never presented`); return null; }
      const fde = await flipLocale(c, 'de');
      if (!fde?.applied) { fail(`${tag}${leg}: the de switch did not land cleanly (${JSON.stringify(fde)})`); return null; }
      const sb = await settledRead(c, READ_BELT);
      if (!sb.settled) console.log(`${tag}${leg} note: the de read did not settle (${unsettledNote(sb)}) — judged as read`);
      return sb.value;
    };
    // ---- P3a: HELD — the boot awaits the kit before ready: no prompt can be built pending; then RELEASED
    fetchCtl.mode = 'hold'; fetchCtl.held.length = 0; fetchCtl.seen = 0;
    await reload();
    const ba = [];
    let readyWhileHeld = false; for (let i = 0; i < 12; i++) { if (await c.eval('window.__test?.ready === true').catch(() => false)) { readyWhileHeld = true; break; } await sleep(500); }
    const heldState = await c.eval(`({ ready: window.__test?.ready === true, prompt: !!document.getElementById('ob-shell-decision'), shell: typeof window.__shell, stage: document.getElementById('ob-boot')?.getAttribute('data-stage') ?? null })`).catch((e) => ({ e: String(e) }));
    if (!fetchCtl.held.length) ba.push(`staging — ui/controls.js was never paused (seen ${fetchCtl.seen}): the module did not reach the network`);
    if (readyWhileHeld || heldState.ready) ba.push(`__test.ready flipped while ui/controls.js was HELD (${JSON.stringify(heldState)}) — main.js boot() no longer awaits the kit: the pending-at-build window is OPEN and the shell belt must now be red-proven`);
    if (heldState.prompt) ba.push(`#ob-shell-decision exists while the kit is held (${JSON.stringify(heldState)})`);
    const heldIds = fetchCtl.held.splice(0); fetchCtl.mode = 'continue';
    for (const id of heldIds) await c.send('Fetch.continueRequest', { requestId: id }).catch(() => {});
    const nRel = heldIds.length;
    const ra = await promptDe(' P3a');
    if (ra) ba.push(...judgeBelt(ra, { stage: 'P3a released', long }));
    if (ba.length) fail(`${tag} P3a: ` + ba.join('; ')); else if (ra) console.log(`${tag} P3a OK: held ${(12 * 0.5).toFixed(0)} s → ready stayed false, no prompt (stage ${heldState.stage}); released ${nRel}x → de swap ${fetchCtl.dict}x, ${ra.btns.map((b) => `${b.w}x${b.h}${b.row ? ' row' : ''}${b.autorow ? ' autorow' : ''}`).join(' / ')} in a ${ra.promptW} px prompt`);
    if (ra) await answerFirst(c, `${tag} P3a`, fail);
    // ---- P3b: FAILED — the import rejects → controlsLeaf null → --row outright, no overflow
    fetchCtl.mode = 'fail'; fetchCtl.seen = 0;
    await reload();
    const rb = await promptDe(' P3b');
    if (rb) {
      const bb = judgeBelt(rb, { stage: 'P3b failed', long });
      if (!fetchCtl.seen) bb.push('staging — ui/controls.js was never requested on the failed boot');
      if (bb.length) fail(`${tag} P3b: ` + bb.join('; ')); else console.log(`${tag} P3b OK (import failed ${fetchCtl.seen}x): --row outright — ${rb.btns.map((b) => `${b.w}x${b.h}${b.row ? ' row' : ''}`).join(' / ')} in a ${rb.promptW} px prompt`);
      await answerFirst(c, `${tag} P3b`, fail);
    }
    const appErrs = await c.eval('__test.errors').catch(() => []);
    if (appErrs.length) fail(`${tag}: app errors: ` + JSON.stringify(appErrs));
    const hard = errs.filter((e) => !/controls\.js|kit unavailable|Failed to fetch dynamically imported module/i.test(e));
    if (hard.length) fail(`${tag}: console errors: ` + hard.slice(0, 3).join(' | '));
  } finally {
    await c.send('Fetch.disable').catch(() => {}); await c.send('Network.setCacheDisabled', { cacheDisabled: false }).catch(() => {});
    c.close(); await sleep(800);
  }
}
export async function armG4(ctx) { await desktop(ctx); await phone(ctx); await pendingLeaf(ctx); }

// ---- standalone (the red-proof runner; the gate imports armG4 above) ------
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) {
  const webDir = process.env.OB_G4_WEBDIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  oracleWebDir = webDir; // the oracle reads the tree this run serves
  const PORT = Number(process.env.OB_E2E_PORT ?? 8178);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 8830);
  const fail = (msg) => { console.error('E2E-SHELL FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await armG4({ PORT, CDP_PORT, fail }); } finally { await stopStaticServer(server); }
  console.log(process.exitCode ? 'E2E-SHELL-G4 FAIL' : 'E2E-SHELL-G4 PASS');
}
