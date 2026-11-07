// Copyright (c) Meta Platforms, Inc. and affiliates.

// kit-laws.mjs — GH-668 S5 kit: the twelve e2e-ui --audit predicates
// (the internal S5 design plan, §4, A1–A12). ONE geometry law per
// predicate, exported page-side (template-literal IIFEs evaluated through
// CDP Runtime.evaluate, `window.__auditRoot`-scoped like phoneWalkerJs) so
// the capture tools can reuse the SAME law the gate enforces, plus the
// node-side statics (A9 companion, A10 guard, A11 ladder, A12 hygiene).
//
//   A1  pill = one line (G5 — B-K01 B-K03)      A7  height ladder (B-K11)
//   A2  text-2 ground law (B-K02 B-K14 B-K20)    A8  never ellipsize (B-K21 B-K07)
//   A3  reachability (B-K05)                     A9  focus visible + composed (B-K06)
//   A4  inline clip (B-K04)                      A10 state registers (B-K15)
//   A5  one glow (B-K09 / R1)                    A11 motion ladder (B-K22)
//   A6  pad tracks height (G6 — B-K10)           A12 type roles (B-K13 B-K23)
//   A13 one height per row (uiaudit)             A14 equal cards per row (uiaudit)
//   A15 coarse touch floor (uiaudit; G10)        A3 + edge probes (uiaudit; GH-989)
//
// Every walker returns an ARRAY of violation strings (empty = clean); the
// combined walker returns { A1: [], A3: [], … } from one DOM pass. Rows a
// later slice owns ride the FROZEN `KIT_LAW_OK` ledger (law + name fragment
// + reason + retiring slice); e2e-ui applies it and reports liveness.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const KIT_LAWS = {
  A1: 'pill = one line (G5): a --ob-r-full box paints exactly one line box; a full-width start-aligned pill reads as a field',
  A2: 'text-2 ground law: text < 18 px keeps >= 4.5:1 against its RENDERED ground (sampled from the still)',
  A3: 'reachability: every visible control is hit-testable at its centre and inside the viewport (a staged preview keeps its commit control reachable)',
  A4: 'inline clip: an inline scroller that clips carries the kit fade; a peek-locked rail shows >= 32 px of a clipped card or none',
  A5: 'one glow: at most ONE element per frame wears --ob-glass-glow (the selected strip segment)',
  A6: 'pad tracks height (G6): inline padding / height >= 0.4 on every labelled pill control; strip segments: the fit-aware floor clamp(12, (clip − Σ label) / 2n, 0.4 h) (V-P1); segmented pills: the fit-ladder floor PER RUNG clamp(12 default / 8 tight, (equal track − widest label) / 2, 0.4 h) (kit hunk #3 / #3b)',
  A7: 'height ladder: every kit-bearing control height is a --ob-h-* rung (± 1 px) unless its label wraps under the row pole',
  A8: 'never ellipsize: no computed text-overflow: ellipsis on text; no clipped text box outside a scroller',
  A9: 'focus visible + composed: every Tab stop paints a register that differs from rest, focus never drops to <body> mid-cycle; a selected-state rule that sets box-shadow / outline has a :focus-visible companion',
  A10: 'state registers: forced :hover / :active differ from rest on fine pointers; surface :hover rules ride a hover / fine-pointer guard',
  A11: 'motion ladder: durations reference var(--ob-t-*); a panel that becomes visible enters through the kit (first painted frame is not the rest pose)',
  A12: 'type roles: no kit-bearing control at the UA font size; caps / tracking / line-height literals only inside the roles (token-grep hygiene)',
  A13: 'one height per row: kit controls, segmented wells and r-full badges that share one visual row of a flex / grid box render at ONE height (± 1 px) — a pill-voiced status beside a button is the same row',
  A14: 'equal cards per row: sibling option cards / tiles on one line share one height (± 1 px) — the --card reserve law, never the tallest sibling',
  A15: 'coarse touch floor: on the coarse register every enabled control (instruments excepted) has a hit box >= 44 x 44',
};

// ---- page-side prelude (shared by every walker) ------------------------------
// The documented GAMEPLAY INSTRUMENTS (PLAN §4 allow-list: touch.css / aim
// widgets / scrubber) sit outside the pill / pad / ladder laws (A1 A6 A7) —
// reachability (A3) and never-ellipsize (A8) still judge them. FROZEN.
export const INSTRUMENT_OK = [
  ['#shoot', 'touch.css FIRE thumb pill (64 rung, its own pad law)'],
  ['#ob-power-gauge', 'touch.css vertical power gauge (a pill-shaped track with readouts, not a label pill)'],
  ['#ob-view-btn', 'touch.css view pill (camera instrument)'],
  ['#ob-spin-btn', 'touch.css spin disc launcher (60 px disc)'],
  ['#ob-spin-card', 'touch.css spin card (disc + elevation instrument)'],
  ['#ob-spin-modal', 'touch.css spin modal (disc instrument)'],
  ['#aimw', 'aimwidgets.js aim instruments (massé / elevation)'],
  ['#ob-aimw-warn', 'aimwidgets.js massé warning chip (gameplay instrument flash)'],
  ['#ob-push-btn', 'touch.css push-out button (GH-360 surface, HUD family)'],
  ['.ob-pb-scrub', 'playback scrubber (timeline instrument)'],
];
const PRELUDE = (w, h, coarse) => `
  const W = ${w ?? 'innerWidth'}, HH = ${h ?? 'innerHeight'}, COARSE = ${coarse ? 'true' : 'false'};
  const rootEl = (window.__auditRoot && document.contains(window.__auditRoot)) ? window.__auditRoot : document;
  const cs = (el) => getComputedStyle(el);
  const px = (v) => parseFloat(v) || 0;
  const rect = (el) => el.getBoundingClientRect();
  const vis = (el) => el.getClientRects().length > 0 && cs(el).visibility !== 'hidden';
  const cls = (el) => (typeof el.className === 'string' ? el.className : '').trim();
  // an anonymous control (no id / i18n key / data-ob) is named through its
  // nearest id-bearing ancestor (' @#id') so a ledger row can name ONE host
  // (the decision prompt's pills) without swallowing every default pill
  const host = (el) => { const a = el.parentElement && el.parentElement.closest('[id]'); return a ? ' @#' + a.id : ''; };
  const name = (el) => el.id ? '#' + el.id
    : el.tagName.toLowerCase() + (el.dataset && el.dataset.i18n ? '[' + el.dataset.i18n + ']'
      : el.dataset && el.dataset.ob ? '[data-ob=' + el.dataset.ob + ']'
      : cls(el) ? '.' + cls(el).split(/\\s+/)[0].slice(0, 28) + host(el) : host(el));
  const hasText = (el) => (el.textContent || '').trim().length > 0;
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.data.trim());
  const textLines = (el) => { // TEXT line boxes only (the J9 lab idiom): 1x1 sr-only + hidden runs are not lines
    const tops = []; const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!n.data.trim()) continue; const p = n.parentElement; if (!p || !vis(p)) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of r.getClientRects()) { if (b.width < 1.5 || b.height < 1.5) continue;
        if (!tops.some((t) => Math.abs(t - b.top) < 4)) tops.push(b.top); } }
    return tops.length; };
  const isPill = (el, r) => r.height > 0 && px(cs(el).borderTopLeftRadius) >= r.height / 2 - 0.5;
  const CTRL = 'button, [role="button"], [role="radio"], [role="option"], [role="tab"], [role="switch"], [role="slider"], a[href], input:not([type="hidden"]), select, summary';
  const box = (el) => (el.matches('input, select') ? (el.closest('.ob-toggle, .ob-segmented > label, label, [data-ob="select-button"]') ?? el) : el);
  const scrollers = (el) => { const out = []; for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
    const s = cs(a); const ox = s.overflowX, oy = s.overflowY;
    if (((ox === 'auto' || ox === 'scroll') && a.scrollWidth > a.clientWidth + 1)
      || ((oy === 'auto' || oy === 'scroll') && a.scrollHeight > a.clientHeight + 1)) out.push(a); } return out; };
  // panned out of ANY scrolling ancestor's port = reachable by a scroll (A4 / the block fade judge the affordance), not an A3 case
  const pannedOut = (el, r) => scrollers(el).some((a) => !inRect(r, rect(a), 0.5));
  const inRect = (r, c, t) => r.left >= c.left - t && r.right <= c.right + t && r.top >= c.top - t && r.bottom <= c.bottom + t;
  const inView = (r, t) => r.left >= -t && r.top >= -t && r.right <= W + t && r.bottom <= HH + t;
  const fmt = (r) => '[' + [r.left, r.top, r.right, r.bottom].map((v) => v.toFixed(0)).join(',') + ']';
  const INSTR = ${JSON.stringify(INSTRUMENT_OK.map(([sel]) => sel).join(', '))};
  const instrument = (el) => !!el.closest(INSTR);
  // ONE ROW-GROUPING LAW for every predicate that judges "a row" (A13, A14 — review r2):
  // two boxes share a visual line when they overlap vertically by >= 50 % of the shorter
  // box. That holds under every cross-axis alignment — flex-start, center, flex-end,
  // baseline (each box crosses the shared baseline band) and stretch (equal boxes) — and
  // it keeps WRAPPED rows apart (a wrapped line starts below the previous line's boxes,
  // so the two never overlap). rowsOf() unions the qualifying pairs transitively (a row
  // of three where 1-2 and 2-3 overlap is one row) and returns the groups.
  const sameLine = (a, b) => Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) >= 0.5 * Math.min(a.height, b.height);
  const rowsOf = (items, pairOk) => {
    const par = items.map((_, i) => i); const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      if (sameLine(items[i].r, items[j].r) && pairOk(items[i], items[j])) par[find(i)] = find(j);
    }
    const g = new Map(); items.forEach((it, i) => { const k = find(i); if (!g.has(k)) g.set(k, []); g.get(k).push(it); });
    return [...g.values()];
  };
  const all = [...(rootEl.nodeType === 9 ? rootEl.body : rootEl).querySelectorAll('*')].filter(vis);
  if (rootEl.nodeType !== 9 && vis(rootEl)) all.unshift(rootEl);
`;

// ---- the DOM laws (each body pushes onto its own array) ----------------------
const LAW_BODY = {
  A1: `
  for (const el of all) {
    if (!hasText(el) || el.matches('.ob-segmented, .ob-strip, .ob-progress, svg, svg *') || instrument(el)) continue;
    const r = rect(el); if (r.width < 8 || r.height < 8 || !isPill(el, r)) continue;
    const n = textLines(el);
    if (n > 1) { out.push(name(el) + ' pill paints ' + n + ' line boxes (r ' + px(cs(el).borderTopLeftRadius).toFixed(0) + ' on h ' + r.height.toFixed(0) + ')'); continue; }
    if (!el.matches('button, [role="button"], a[href]')) continue;
    const s = cs(el); const flex = /flex/.test(s.display);
    const start = flex ? /^(normal|flex-start|start|left)$/.test(s.justifyContent) : /^(start|left)$/.test(s.textAlign);
    const p = el.parentElement; const pw = p ? p.clientWidth - px(cs(p).paddingLeft) - px(cs(p).paddingRight) : 0;
    if (start && pw > 0 && r.width >= 0.9 * pw && r.width >= 160) out.push(name(el) + ' full-width pill start-aligned (' + r.width.toFixed(0) + ' of ' + pw.toFixed(0) + ') — a row, not a pill');
  }`,
  A3: `
  const seen = new Set();
  for (const el of all) {
    if (!el.matches(CTRL)) continue;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true' || el.matches('input[type="radio"], input[type="checkbox"]')) continue;
    const b = box(el); if (seen.has(b)) continue; seen.add(b);
    const r = rect(b); if (r.width < 1 || r.height < 1) continue;
    const commit = el.matches('[data-ob="atelier-keep"]'); // a staged preview's commit control is judged against the VIEWPORT (B-K05)
    if (!commit && pannedOut(b, r)) continue; // the practice group / a strip pans it into view
    const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18);
    const who = name(el) + (label ? ' "' + label + '"' : '');
    if (!inView(r, 0.5)) { out.push(who + ' leaves the viewport ' + fmt(r) + (commit ? ' (staged commit control)' : '')); continue; }
    const lab = el.closest('label');
    const mine = (hit) => hit && (b.contains(hit) || hit.contains(b) || el.contains(hit) || (lab && lab.contains(hit)));
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!mine(hit)) { out.push(who + ' ' + fmt(r) + ' centre covered by ' + (hit ? name(hit) : 'nothing') + (commit ? ' (staged commit control)' : '')); continue; }
    // EDGE PROBES (uiaudit, GH-989): the centre can be clear while a neighbour covers an end of
    // the control (the de hall at 1024 x 640: the gear's right 8 px under the remember row).
    // Probe 6 px inside each edge on the centre lines — inside a pill's rounded shape too.
    if (r.width >= 16 && r.height >= 16) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      for (const [x, y, edge] of [[r.left + 6, cy, 'left'], [r.right - 6, cy, 'right'], [cx, r.top + 6, 'top'], [cx, r.bottom - 6, 'bottom']]) {
        if (x < 0 || y < 0 || x > W || y > HH) continue;
        const e = document.elementFromPoint(x, y);
        if (!mine(e) && e && !e.contains(b)) { out.push(who + ' ' + fmt(r) + ' ' + edge + ' edge covered by ' + name(e)); break; }
      }
    }
  }`,
  A4: `
  for (const el of all) {
    const s = cs(el); const ox = s.overflowX;
    if (!(ox === 'auto' || ox === 'scroll') || el.scrollWidth <= el.clientWidth + 8) continue; // < 8 px = a block scroller's rounding, not a clipped card
    const fade = el.hasAttribute('data-ob-fade-start') || el.hasAttribute('data-ob-fade-end')
      || el.matches('.ob-scrollfade--inline') || !!el.closest('[data-ob-fade-start], [data-ob-fade-end]');
    if (!fade) { out.push(name(el) + ' inline scroller clips ' + (el.scrollWidth - el.clientWidth) + ' px with no fade'); continue; }
    if (!el.hasAttribute('data-ob-rail-n')) continue; // the peek lock (fitPeek) is the card rail's law; strips pan
    const c = rect(el); let kids = [...el.children].filter(vis);
    if (kids.length === 1 && kids[0].children.length > 1) kids = [...kids[0].children].filter(vis);
    for (const k of kids) { const kr = rect(k); const w = Math.min(kr.right, c.right) - Math.max(kr.left, c.left);
      if (w > 0.5 && w < kr.width - 0.5 && w < 31.5) out.push(name(k) + ' peeks ' + w.toFixed(0) + ' px inside the mask (< 32)'); }
  }`,
  A5: `
  const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:1px;height:1px;box-shadow:var(--ob-glass-glow)';
  document.body.appendChild(probe); const sig = cs(probe).boxShadow; probe.remove();
  if (sig && sig !== 'none') {
    const glow = [...document.querySelectorAll('body *')].filter((el) => vis(el) && cs(el).boxShadow.includes(sig));
    if (glow.length > 1) out.push(glow.length + ' elements wear --ob-glass-glow: ' + glow.map(name).join(', '));
  }`,
  A6: `
  // THE FIT-AWARE PAD (GH-668 visual audit r2 P1, ruling V-P1): a strip segment's floor is
  // clamp(12, (clip − Σ label) / (2 n), 0.4 h) — judged from the STRIP's own geometry (label
  // inline = the segment's width minus its pads), never from the leaf's property
  const stripFit = new Map();
  const segFloor = (seg, h) => {
    const strip = seg.closest('.ob-strip'); if (!strip) return 0.4 * h;
    if (!stripFit.has(strip)) {
      const kids = [...strip.children].filter(vis); const segs = kids.filter((k) => k.matches('.ob-strip__seg'));
      const ss = cs(strip); let others = 0, labels = 0;
      for (const k of kids) { const kr = rect(k); if (!segs.includes(k)) { others += kr.width; continue; }
        const ks = cs(k); labels += kr.width - px(ks.paddingLeft) - px(ks.paddingRight); }
      const free = strip.clientWidth - px(ss.paddingLeft) - px(ss.paddingRight) - (px(ss.columnGap) || 0) * (kids.length - 1) - others - labels;
      stripFit.set(strip, segs.length ? free / (2 * segs.length) : Infinity);
    }
    return Math.max(12, Math.min(0.4 * h, stripFit.get(strip)));
  };
  // THE SEGMENTED's FIT LADDER (GH-668 S5 slice 4 round 2, kit hunk #3 — controls.js
  // fitSegmented publishes --seg-pad only when the default overflows an equal track): a pill
  // segment's floor is clamp(base, (track − widest label text) / 2, 0.4 h) with the base PER
  // RUNG — 12 (sp-3) on the default type rung, 8 (sp-2) on the tight rung
  // (data-ob-seg-fit="tight", kit hunk #3b, ruling R-PR-3b, round 3) — judged from the
  // GROUP's own geometry — the track = the equal share of the room the group is clamped to
  // (its parent's content box) or, when the group sits at its intrinsic width inside that
  // room, the room's equal share (a pad shrunk with room to spare is a red); never from
  // the leaf's property. Stack rows are not pills (skipped by isPill).
  const segGroupFit = new Map();
  const segRungBase = (g) => g.getAttribute('data-ob-seg-fit') === 'tight' ? 8 : 12;
  const segmentFloor = (label, h) => {
    const g = label.closest('.ob-segmented'); if (!g) return 0.4 * h;
    if (!segGroupFit.has(g)) {
      const labs = [...g.querySelectorAll(':scope > label')].filter(vis); const n = labs.length || 1;
      const gs = cs(g); const gr = rect(g); const p = g.parentElement; const ps = p ? cs(p) : null;
      const room = p ? p.clientWidth - px(ps.paddingLeft) - px(ps.paddingRight) : gr.width;
      const chrome = px(gs.borderLeftWidth) + px(gs.borderRightWidth) + px(gs.paddingLeft) + px(gs.paddingRight) + (px(gs.columnGap) || 0) * (n - 1);
      const track = gr.width >= room - 1 ? Math.max(...labs.map((l) => rect(l).width)) : (room - chrome) / n;
      const text = Math.max(...labs.map((l) => { const ls = cs(l); return rect(l).width - px(ls.paddingLeft) - px(ls.paddingRight); }));
      segGroupFit.set(g, (track - text) / 2);
    }
    return Math.max(segRungBase(g), Math.min(0.4 * h, segGroupFit.get(g)));
  };
  for (const el of all) {
    if (!el.matches(CTRL + ', label') || el.matches('input, select') || !hasText(el) || instrument(el)) continue;
    const r = rect(el); if (r.height < 8 || !isPill(el, r)) continue;
    if (textLines(el) === 0) continue; // icon-only (sr-only label): no inline pad law
    const s = cs(el); const pad = Math.min(px(s.paddingLeft), px(s.paddingRight));
    if (el.matches('.ob-strip__seg')) {
      const floor = segFloor(el, r.height);
      if (pad < floor - 0.5) out.push(name(el) + ' strip segment inline pad ' + pad.toFixed(1) + ' on h ' + r.height.toFixed(1) + ' under the fit-aware floor ' + floor.toFixed(1) + ' (clamp(12, fit, 0.4 h))');
      continue;
    }
    if (el.matches('.ob-segmented > label')) {
      const floor = segmentFloor(el, r.height);
      if (pad < floor - 0.5) out.push(name(el) + ' segment inline pad ' + pad.toFixed(1) + ' on h ' + r.height.toFixed(1) + ' under the fit-ladder floor ' + floor.toFixed(1) + ' (clamp(' + segRungBase(el.closest('.ob-segmented')) + ', (track − widest label) / 2, 0.4 h) on the ' + (segRungBase(el.closest('.ob-segmented')) === 8 ? 'tight' : 'default') + ' rung)');
      continue;
    }
    if (pad / r.height < 0.39) out.push(name(el) + ' inline pad ' + pad.toFixed(1) + ' on h ' + r.height.toFixed(1) + ' = ' + (pad / r.height).toFixed(2) + ' (< 0.4)');
  }`,
  A7: `
  const LADDER = __LADDER__; const seen = new Set();
  for (const el of all) {
    if (!el.matches(CTRL) || instrument(el)) continue;
    const b = box(el); if (seen.has(b)) continue; seen.add(b);
    if (!/(^|\\s)ob-/.test(cls(b)) && !/(^|\\s)ob-/.test(cls(el))) continue; // the kit's ladder judges kit-bearing controls
    if (b.matches('.ob-btn--row, .ob-segmented--stack > label, .ob-btn--tile, .ob-card-option, textarea, input[type="range"], input[type="radio"], input[type="checkbox"], [role="slider"], .ob-range, a:not(.ob-btn), summary, .ob-toggle, .ob-toggle *, .ob-segmented, .ob-strip')) continue; // rows / text lines (summary = a disclosure text row), not rungs
    const r = rect(b); if (r.height < 1) continue;
    if (textLines(b) > 1) continue; // a wrapped label grows the box under the row pole (A1 / A8 judge the wrap)
    if (!LADDER.some((h) => Math.abs(r.height - h) <= 1)) out.push(name(el) + ' h ' + r.height.toFixed(1) + ' off the ladder ' + LADDER.join('/'));
  }`,
  A8: `
  for (const el of all) {
    const s = cs(el);
    // the sr-only idiom (a 1 x 1 clip-path box: the kit .ob-navmodal__pane-title on the coarse sheet, B-K19) is OFF the paint by design — not a clipped text box
    { const r = rect(el); if (r.width <= 1 && r.height <= 1 && s.clipPath !== 'none') continue; }
    if (s.textOverflow === 'ellipsis' && hasText(el) && s.display !== 'inline') out.push(name(el) + ' text-overflow: ellipsis');
    if (!ownText(el) || s.display === 'inline' || s.overflowX === 'visible' || s.overflowX === 'auto' || s.overflowX === 'scroll') continue;
    if (el.scrollWidth > el.clientWidth + 1) out.push(name(el) + ' text clipped inline (' + el.scrollWidth + ' > ' + el.clientWidth + ')');
    else if (el.scrollHeight > el.clientHeight + 1 && s.overflowY !== 'auto' && s.overflowY !== 'scroll') out.push(name(el) + ' text clipped block (' + el.scrollHeight + ' > ' + el.clientHeight + ')');
  }`,
  A12: `
  for (const el of all) {
    if (!el.matches('button, input:not([type="hidden"]), select, textarea, [role="button"]') || !el.closest('[class*="ob-"]')) continue;
    const fs = px(cs(el).fontSize); if (Math.abs(fs - 13.3333) < 0.01) out.push(name(el) + ' at the UA font size (13.333 px)');
  }`,
  A13: `
  // ONE HEIGHT PER ROW (uiaudit, the design charter "Button / pill": no two buttons in one row
  // differ in height). Members: kit controls + segmented WELLS (the painted box, not the
  // 28 px labels inside it) + pill-voiced non-controls (an r-full .ob-badge reads as a
  // button beside one — the keep-bar "Previewing" vs "Keep" class). A row = members on
  // one visual line (centres within 4 px OR shared top / bottom edge, >= 50 % vertical
  // overlap) whose nearest common ancestor is a flex / grid box no more than 2 levels
  // above each.
  const m13 = []; const s13 = new Set();
  for (const el of all) {
    if (instrument(el)) continue;
    let b = null, ctl = true;
    if (el.matches('.ob-segmented')) b = el;
    else if (el.matches(CTRL)) {
      b = box(el);
      if (b.matches('.ob-segmented > label, .ob-segmented--stack > label, .ob-strip, .ob-strip__seg, .ob-toggle, .ob-toggle *, input[type="range"], [role="slider"], .ob-range, input[type="radio"], input[type="checkbox"], textarea, summary, a:not(.ob-btn), .ob-card-option, .ob-btn--tile')) continue;
      if (!/(^|\\s)ob-/.test(cls(b)) && !/(^|\\s)ob-/.test(cls(el))) continue;
    } else if (el.matches('.ob-badge')) { b = el; ctl = false; }
    else continue;
    if (s13.has(b)) continue; s13.add(b);
    const r = rect(b); if (r.width < 8 || r.height < 8 || pannedOut(b, r)) continue;
    if (!ctl && !isPill(b, r)) continue;
    m13.push({ b, r, ctl });
  }
  const up13 = (el) => { const a = []; for (let p = el.parentElement, d = 1; p && d <= 2; p = p.parentElement, d++) a.push(p); return a; };
  // the shared row law (rowsOf / sameLine, prelude) + A13's own pairing condition: neither
  // box contains the other and their nearest common ancestor within 2 levels lays out a row
  const rows13 = rowsOf(m13, (a, b) => {
    if (a.b.contains(b.b) || b.b.contains(a.b)) return false;
    const ua = up13(a.b), ub = up13(b.b); const host = ua.find((p) => ub.includes(p));
    return !!host && /(flex|grid)/.test(cs(host).display);
  });
  for (const g of rows13) {
    if (g.length < 2 || !g.some((m) => m.ctl)) continue;
    const hs = g.map((m) => m.r.height); if (Math.max(...hs) - Math.min(...hs) <= 1) continue;
    out.push('row mixes heights: ' + g.map((m) => name(m.b) + (m.ctl ? '' : ' [badge]') + ' ' + m.r.height.toFixed(0)).join(' / '));
  }`,
  A14: `
  // EQUAL CARDS PER ROW (uiaudit): sibling option cards / tiles laid out on one line share
  // one height (the --card reserve law, kit.css .ob-card-option) — a ragged rail reads as
  // broken layout (owner reports: equipment carousel on phone + macOS).
  const CARD14 = '.ob-card-option, .ob-cardrail-card, .ob-btn--tile, .ob-drills__card';
  const c14 = [];
  for (const el of all) {
    if (!el.matches(CARD14)) continue;
    const r = rect(el); if (r.width < 24 || r.height < 24 || pannedOut(el, r)) continue;
    if (el.parentElement) c14.push({ el, r });
  }
  // the shared row law (rowsOf / sameLine, prelude): siblings of one parent on one visual
  // line under any alignment — a top-only grouping split a centred / bottom-aligned row of
  // unequal cards into separate "lines" and judged nothing (review r2)
  for (const ln of rowsOf(c14, (a, b) => a.el.parentElement === b.el.parentElement)) {
    if (ln.length < 2) continue;
    const hs = ln.map((c) => c.r.height); if (Math.max(...hs) - Math.min(...hs) <= 1) continue;
    out.push(name(ln[0].el.parentElement) + ' cards on one row differ: ' + ln.map((c) => c.r.height.toFixed(0)).join(' / '));
  }`,
  A15: `
  // COARSE TOUCH FLOOR (uiaudit; the design charter G10 — 44 pt under a finger): on the coarse
  // register every enabled control's hit box is >= 44 x 44. Instruments keep their own
  // floors (INSTRUMENT_OK); a slider's hit box is its row (judged there).
  if (COARSE) {
    const s15 = new Set();
    for (const el of all) {
      if (!el.matches(CTRL) || instrument(el)) continue;
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
      if (el.matches('input[type="range"], [role="slider"], .ob-range')) continue;
      const b = box(el); if (s15.has(b)) continue; s15.add(b);
      const r = rect(b); if (r.width < 2 || r.height < 2 || pannedOut(b, r) || !inView(r, 0.5)) continue;
      if (r.width < 43.5 || r.height < 43.5) {
        const label = (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 18);
        out.push(name(b) + (label ? ' "' + label + '"' : '') + ' ' + r.width.toFixed(0) + 'x' + r.height.toFixed(0) + ' under the 44 coarse floor');
      }
    }
  }`,
};
export const DOM_LAW_IDS = Object.keys(LAW_BODY);

/** One law, one IIFE — returns the violation array (capture tools reuse it). */
export const kitLawJs = (id, { w = null, h = null, coarse = false, ladder = DEFAULT_LADDER } = {}) => {
  if (!LAW_BODY[id]) throw new Error('kit-laws: no DOM law ' + id);
  return `(() => { ${PRELUDE(w, h, coarse)} const out = []; ${LAW_BODY[id].replace('__LADDER__', JSON.stringify(ladder))} return out; })()`;
};

/** All DOM laws from ONE pass — returns { A1: [...], A3: [...], … }. */
export const kitLawsWalkerJs = ({ w = null, h = null, coarse = false, ladder = DEFAULT_LADDER, laws = DOM_LAW_IDS } = {}) => `(() => {
  ${PRELUDE(w, h, coarse)}
  const res = {};
  ${laws.map((id) => `{ const out = []; try { ${LAW_BODY[id].replace('__LADDER__', JSON.stringify(ladder))} } catch (e) { out.push('walker threw: ' + (e && e.message)); } res.${id} = [...new Set(out)].slice(0, 12); }`).join('\n  ')}
  return res;
})()`;

export const DEFAULT_LADDER = [20, 28, 34, 40, 44, 48, 64];
/** The ladder as tokens.css declares it (--ob-h-*), so the gate follows the kit. */
export function readLadder(webDir) {
  const tok = fs.readFileSync(path.join(webDir, 'app/ui/tokens.css'), 'utf8');
  const rungs = [...tok.matchAll(/--ob-h-[a-z]+:\s*([\d.]+)px/g)].map((m) => parseFloat(m[1]));
  return rungs.length ? [...new Set(rungs)].sort((a, b) => a - b) : DEFAULT_LADDER;
}

// ---- A2: text-2 ground law (page-side sample list + node-side still) --------
// The page lists every painted text run < 18 px (first line box, ink as an
// sRGB tuple through a canvas so oklch tokens need no parser); node samples
// the RENDERED ground from a Page.captureScreenshot still in a 3 px band
// just outside the run's start edge (inside the same box: padding or the
// parent's paint — whatever the eye sees the glyphs against) and judges
// WCAG contrast >= 4.5:1. Disabled / dimmed (effective opacity < 0.99)
// text is exempt like WCAG's inactive-control clause.
export const a2TextRunsJs = ({ w = null, h = null, coarse = false, max = 200 } = {}) => `(() => {
  ${PRELUDE(w, h, coarse)}
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
  const ink = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data]; };
  const eff = (el) => { let o = 1; for (let a = el; a && a.nodeType === 1; a = a.parentElement) o *= px(cs(a).opacity); return o; };
  const out = []; const walk = document.createTreeWalker(rootEl.nodeType === 9 ? document.body : rootEl, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n && out.length < ${max}; n = walk.nextNode()) {
    if (!n.data.trim()) continue; const p = n.parentElement; if (!p || !vis(p)) continue;
    if (p.closest('script, style, svg, [disabled], [aria-disabled="true"], option, input, textarea')) continue;
    const s = cs(p); const fs = px(s.fontSize); if (fs >= 18 || fs < 6 || eff(p) < 0.99) continue;
    const r = document.createRange(); r.selectNodeContents(n);
    const b = [...r.getClientRects()].find((q) => q.width > 3 && q.height > 3); if (!b) continue;
    if (b.left < 6 || b.top < 1 || b.right > W || b.bottom > HH - 1) continue;
    const hit = document.elementFromPoint(b.left + Math.min(3, b.width / 2), b.top + b.height / 2);
    if (!hit || !(p.contains(hit) || hit.contains(p))) continue; // covered / clipped: not this law
    out.push({ name: name(p), text: n.data.trim().slice(0, 28), fs: +fs.toFixed(2), ink: ink(s.color), x: b.left, y: b.top, w: b.width, h: b.height });
  }
  return out;
})()`;

/** Minimal PNG decoder (8-bit RGB / RGBA, non-interlaced — what Chrome emits). */
export function decodePng(buf) {
  let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9];
      if (data[8] !== 8 || data[12] !== 0) throw new Error('png: only 8-bit non-interlaced'); }
    else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('png: colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * bpp; const px = Buffer.alloc(w * h * bpp);
  let prev = Buffer.alloc(stride), p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++]; const line = raw.subarray(p, p + stride); p += stride; const cur = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let x = line[i];
      if (f === 1) x += a; else if (f === 2) x += b; else if (f === 3) x += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); x += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = x & 255;
    }
    prev = cur;
  }
  return { w, h, bpp, px };
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
export const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };

// ---- A2 sampler: ONE STATE FOR INK AND GROUND (GH-877) ----------------------
// Ink (a2TextRunsJs, Runtime.evaluate) and ground (Page.captureScreenshot)
// used to come from two separate CDP moments; a colour/background transition
// in flight across a pose flip (kit .ob-btn, --ob-t-fast 120 ms) made the
// verdict a timing lottery. a2Sample is the only A2 sampling path: it waits
// (bounded) for animations to settle, reads runs, captures the still, re-reads
// runs, and returns a still only when both reads agree on every run's ink and
// box. On disagreement it retries within A2_SAMPLE_BUDGET, then returns an
// unsettled instrument row — never a contrast verdict, never a pass.
export const A2_SAMPLE_BUDGET = { attempts: 3, settlePolls: 40, settlePollMs: 25 };
/** Page-side settle probe (STEER-1 scope): returns RAW facts per running
 * animation — its target box, and per run whether the target is the element
 * under that run box's centre or an ancestor of it. The node-side rule
 * (a2BlockingAnimations) decides blocking; the probe itself judges nothing.
 * A targetless animation reports hits all-true (fail closed). */
export const a2SettleJs = (runs = []) => `(() => {
  const runs = ${JSON.stringify((Array.isArray(runs) ? runs : []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })))};
  const anims = document.getAnimations ? document.getAnimations() : [];
  const facts = [];
  for (const a of anims) { if (a.playState !== 'running') continue;
    const t = a.effect && a.effect.target;
    if (!t || !t.getBoundingClientRect) { facts.push({ box: null, hits: runs.map(() => true) }); continue; }
    const r = t.getBoundingClientRect(); const box = { x: r.left, y: r.top, w: r.width, h: r.height };
    const hits = runs.map((run) => { const el = document.elementFromPoint(run.x + run.w / 2, run.y + run.h / 2); return !!el && (t === el || t.contains(el)); });
    facts.push({ box, hits }); }
  return { running: facts.length, facts };
})()`;
/** STEER-1 rule, pure node side: a running animation BLOCKS the sample only
 * if it can change a judged run's ink or ground — its target (a) is a run's
 * element or an ancestor of it (the probe's hits), OR (b) has a box that
 * intersects a run's box (a sibling overlay/wash repaints the ground; the
 * GH-877 cause itself was a ground wash, so ancestor-only is not enough).
 * An unrelated infinite animation (e.g. a cardrail spin turntable whose box
 * touches no run) therefore never blocks. Facts-less probe replies fall back
 * to their raw running count. */
export function a2BlockingAnimations(facts, runs) {
  if (!Array.isArray(facts)) return null;
  const boxes = Array.isArray(runs) ? runs : [];
  let n = 0;
  for (const f of facts) {
    if (Array.isArray(f?.hits) && f.hits.some(Boolean)) { n++; continue; }
    const b = f?.box; if (!b) continue;
    if (boxes.some((r) => b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y)) n++;
  }
  return n;
}
const a2BlockingOf = (probe, runs) => a2BlockingAnimations(probe?.facts, runs) ?? (typeof probe === 'number' ? probe : (probe?.running ?? 0));
const a2MovedCount = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return Math.max(a?.length ?? 0, b?.length ?? 0);
  let moved = Math.abs(a.length - b.length);
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    const inkDiff = !Array.isArray(x.ink) || !Array.isArray(y.ink) || x.ink.length !== y.ink.length || x.ink.some((v, k) => v !== y.ink[k]);
    const boxDiff = ['x', 'y', 'w', 'h'].some((k) => Math.abs((x[k] ?? 0) - (y[k] ?? 0)) > 0.5);
    if (inkDiff || boxDiff || x.name !== y.name || x.text !== y.text || x.fs !== y.fs) moved++;
  }
  return moved;
};
const a2Sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/**
 * Sample one settled A2 state. `client` is a CDP client with eval(js) and
 * send('Page.captureScreenshot', params). Options: { w, h, coarse, dpr, max,
 * runsJs (defaults to a2TextRunsJs), attempts, settlePolls, settlePollMs, sleep }.
 * Flow: read the runs once for their boxes, poll the scoped settle probe
 * (STEER-1 rule) until no BLOCKING animation runs, then per attempt read
 * runs, capture the still, re-read runs and accept only on full agreement.
 * Returns { settled:true, runs, img, buf, attemptsUsed, settlePollsUsed, moved:0 } or
 * { settled:false, reason:'moved', unsettled:'A2 unsettled: <n> runs moved', … } or
 * { settled:false, reason:'animating', unsettled:'A2 unsettled: animating (<k> running on judged runs)', … }
 * — the animating text states only what was measured (nothing was compared).
 * Screenshot/eval errors propagate (callers keep their 'still unreadable' arm).
 */
export async function a2Sample(client, { w = null, h = null, coarse = false, dpr = 1, max = 200, runsJs = null,
  attempts = A2_SAMPLE_BUDGET.attempts, settlePolls = A2_SAMPLE_BUDGET.settlePolls,
  settlePollMs = A2_SAMPLE_BUDGET.settlePollMs, sleep = a2Sleep } = {}) {
  if (!client || typeof client.eval !== 'function' || typeof client.send !== 'function') throw new Error('a2Sample: client needs eval + send');
  const js = runsJs ?? a2TextRunsJs({ w, h, coarse, max });
  let pollsUsed = 0;
  const waitScoped = async (scopeRuns) => { // bounded poll; returns blocking count (0 = settled)
    let blocking = 0;
    for (let p = 0; p < settlePolls; p++) {
      const s = await client.eval(a2SettleJs(scopeRuns)); pollsUsed++;
      blocking = a2BlockingOf(s, scopeRuns);
      if (!blocking) return 0;
      if (p + 1 < settlePolls) await sleep(settlePollMs);
    }
    return blocking;
  };
  const scope = await client.eval(js); // boxes first, so the probe can scope to the judged runs
  const blocking0 = await waitScoped(Array.isArray(scope) ? scope : []);
  if (blocking0) return { settled: false, reason: 'animating', unsettled: `A2 unsettled: animating (${blocking0} running on judged runs)`, animating: blocking0, moved: 0, runs: null, img: null, attemptsUsed: 0, settlePollsUsed: pollsUsed, running: blocking0 };
  let lastMoved = 0;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const runs1 = await client.eval(js);
    const shot = await client.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: w, height: h, scale: 1 / (dpr || 1) } });
    const img = decodePng(Buffer.from(shot.data, 'base64'));
    const runs2 = await client.eval(js);
    lastMoved = a2MovedCount(runs1, runs2);
    if (!lastMoved) return { settled: true, runs: runs2, img, buf: Buffer.from(shot.data, 'base64'), attemptsUsed: attempt, settlePollsUsed: pollsUsed, moved: 0 };
    if (attempt < attempts) { const b = await waitScoped(Array.isArray(runs2) ? runs2 : []); // re-wait scoped to the latest boxes
      if (b) return { settled: false, reason: 'animating', unsettled: `A2 unsettled: animating (${b} running on judged runs)`, animating: b, moved: lastMoved, runs: null, img: null, attemptsUsed: attempt, settlePollsUsed: pollsUsed, running: b }; }
  }
  return { settled: false, reason: 'moved', unsettled: `A2 unsettled: ${lastMoved} runs moved`, moved: lastMoved, runs: null, img: null, attemptsUsed: attempts, settlePollsUsed: pollsUsed, running: 0 };
}

/** A2 judge: runs (from a2TextRunsJs) × still (decodePng) → violation strings. */
export function judgeTextGround(runs, img, { cssW, min = 4.5 } = {}) {
  const sx = img.w / cssW; const out = [];
  const at = (x, y) => { const i = (Math.min(img.h - 1, Math.max(0, Math.round(y))) * img.w + Math.min(img.w - 1, Math.max(0, Math.round(x)))) * img.bpp;
    return [img.px[i], img.px[i + 1], img.px[i + 2]]; };
  for (const t of runs) {
    // the RENDERED ground = the modal colour (5-bit bins) of the run's own line box:
    // glyph ink covers a minority of a text box, so the mode is the paint the eye
    // reads the glyphs against — whatever composited it (glass over the scene, a
    // card rung, a chip) — and a neighbouring inline run or face never enters
    const bins = new Map(); let n = 0;
    for (let y = Math.floor(t.y * sx); y < (t.y + t.h) * sx; y++) for (let x = Math.floor(t.x * sx); x < (t.x + t.w) * sx; x++) {
      const c = at(x, y); const k = (c[0] >> 3) * 1024 + (c[1] >> 3) * 32 + (c[2] >> 3);
      const b = bins.get(k) ?? [0, 0, 0, 0]; b[0]++; b[1] += c[0]; b[2] += c[1]; b[3] += c[2]; bins.set(k, b); n++; }
    if (n < 24) continue;
    // bins near the ink colour are glyph pixels (heavy readouts / bold CJK can out-vote a felt ground) — the ground is the top NON-ink bin
    const inkNear = (b) => Math.abs(b[1] / b[0] - t.ink[0]) + Math.abs(b[2] / b[0] - t.ink[1]) + Math.abs(b[3] / b[0] - t.ink[2]) < 60;
    const ranked = [...bins.values()].sort((a, b) => b[0] - a[0]);
    const top = ranked.find((b) => !inkNear(b)); if (!top || top[0] < n * 0.15) continue; // no readable ground (all ink-like) → not this law's sample
    const ground = [Math.round(top[1] / top[0]), Math.round(top[2] / top[0]), Math.round(top[3] / top[0])];
    const a = (t.ink[3] ?? 255) / 255; const ink = t.ink.slice(0, 3).map((v, k) => Math.round(v * a + ground[k] * (1 - a)));
    const c = contrast(ink, ground);
    if (c < min) out.push(`${t.name} "${t.text}" ${t.fs}px ${c.toFixed(2)}:1 (ink rgb(${ink}) on rgb(${ground}))`);
  }
  return out;
}

// ---- A9: focus visible + composed (runtime half) -----------------------------
// Snapshot the REST register of every tab stop in the frame (window.__obA9),
// then the driver presses real Tabs (Input.dispatchKeyEvent — the only way
// :focus-visible is honestly true) and reads the focused element against its
// rest register: identical = an invisible ring (the play committed card's
// glow swallowing the ring, B-K06); <body> before the last stop = a dead
// tab stop / focus dropped (the atelier pane, the sheet).
const REGISTER = `(el) => { const s = cs(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.borderColor, s.backgroundColor, s.backgroundImage, s.color].join('|'); }`;
export const a9RestSnapshotJs = ({ w = null, h = null } = {}) => `(() => {
  ${PRELUDE(w, h, false)}
  const reg = ${REGISTER};
  const focusable = all.filter((el) => el.matches(CTRL + ', [tabindex], [contenteditable="true"]') && !el.disabled
    && el.tabIndex >= 0 && el.getAttribute('aria-hidden') !== 'true' && !el.matches('input[type="radio"]:not(:checked)') && rect(el).width > 0);
  const rest = new Map(); focusable.forEach((el, i) => rest.set(el, { i, reg: reg(el), name: name(el) }));
  window.__obA9 = { rest, order: focusable, root: rootEl.nodeType === 9 ? document.body : rootEl };
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  return { stops: focusable.length, names: focusable.slice(0, 40).map(name) };
})()`;
export const a9FocusReadJs = () => `(() => {
  const S = window.__obA9; const el = document.activeElement;
  if (!el || el === document.body) return { body: true };
  const cs = (e) => getComputedStyle(e); const reg = ${REGISTER};
  const known = S && S.rest.get(el);
  const inRoot = S ? S.root.contains(el) : true;
  return { body: false, name: known ? known.name : (el.id ? '#' + el.id : el.tagName.toLowerCase()), inRoot, idx: known ? known.i : -1,
    last: !!known && known.i === S.order.length - 1, fv: el.matches(':focus-visible'), changed: known ? reg(el) !== known.reg : null };
})()`;

// ---- A10: state registers (runtime half) ------------------------------------
// The driver tags one representative per kit control class-set (bounded),
// forces :hover then :active through CSS.forcePseudoState and reads the
// register through a10ReadJs — a forced state that leaves the register
// byte-identical is a missing rung (B-K15: rail card hover Δ 0.9 %, no
// :active; variant rows no hover; select hover one hairline).
export const a10TagJs = ({ w = null, h = null, max = 14 } = {}) => `(() => {
  ${PRELUDE(w, h, false)}
  const reg = ${REGISTER};
  document.querySelectorAll('[data-ob-a10]').forEach((e) => e.removeAttribute('data-ob-a10'));
  // the forced-state read must see the END register, not a 120 ms transition's first frame (a load-dependent read flipped the practice act's :active between runs): transitions off on the tagged nodes for the arm's lifetime
  if (!document.getElementById('ob-a10-notrans')) { const st = document.createElement('style'); st.id = 'ob-a10-notrans'; st.textContent = '[data-ob-a10], [data-ob-a10] * { transition: none !important; animation: none !important; }'; document.head.appendChild(st); }
  const HOVER = '.ob-btn, .ob-strip__seg, .ob-option, .ob-select, .ob-card-option, .ob-navmodal__item, .ob-segmented > label, .ob-toggle, .ob-shell-place, .ob-cardrail-card, [data-ob="play-games"] > button, .ob-eq-prov-row, .ob-practice-act';
  const bySig = new Map();
  for (const el of all) {
    if (!el.matches(HOVER) || el.disabled || el.matches('[aria-disabled="true"], [aria-current], [aria-pressed="true"], [aria-selected="true"], [aria-checked="true"]') || el.querySelector('input:checked')) continue; // a selected register may lawfully absorb hover
    const sig = cls(el).split(/\\s+/).filter((c) => /^ob-/.test(c)).sort().join(' ') || el.tagName;
    if (!bySig.has(sig)) bySig.set(sig, el);
    if (bySig.size >= ${max}) break;
  }
  const rows = []; let i = 0;
  for (const [sig, el] of bySig) { el.setAttribute('data-ob-a10', String(i)); rows.push({ i, sig, name: name(el), rest: reg(el) }); i++; }
  return rows;
})()`;
export const a10ReadJs = (i) => `(() => { const el = document.querySelector('[data-ob-a10="${i}"]'); if (!el) return null;
  const cs = (e) => getComputedStyle(e); const reg = ${REGISTER}; const s = cs(el);
  return reg(el) + '|' + s.transform + '|' + s.opacity + '|' + s.filter; })()`;
export const a10UntagJs = () => `(() => { document.querySelectorAll('[data-ob-a10]').forEach((e) => e.removeAttribute('data-ob-a10')); document.getElementById('ob-a10-notrans')?.remove(); return true; })()`;

// ---- A11: mount law (runtime half) -----------------------------------------
// A MutationObserver on the frame records every watched panel that goes
// from display:none to painted with the computed opacity / transform it
// carries in the SAME task (motion.mount / enter set the hidden pose
// synchronously — B-K22 mount law): a reveal whose first pose is already the
// rest pose is a hard cut. Reduced motion is exempt (instant by law).
export const A11_WATCH = '.ob-panel, .ob-prompt, .ob-confirm, .ob-navmodal, #ob-shell-cards > section, #ob-replays-rail, #ob-practice, #ob-atelier, #ob-atelier-cue, .ob-play-host';
export const a11InstallJs = () => `(() => {
  if (window.__obA11) { window.__obA11.log.length = 0; return 'armed'; }
  const S = { log: [], shown: new WeakMap() };
  // PAINTED = has boxes AND is visible: computed visibility inherits, so content that lands
  // under the shell's arrival hold (section visibility:hidden, LAW 2) is judged when the
  // hold releases it — the release's own kit enter (motion.enter) is the pose it reveals
  // with; the old test logged the hold-time pose (the section at rest, invisible) one
  // microtask before that enter (S5 slice 4 round 2 P2-a, gates/r2/lab-a11-arrival-*.log)
  const painted = (el) => { if (!el.getClientRects().length) return false; const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden'; };
  const seed = () => document.querySelectorAll(${JSON.stringify(A11_WATCH)}).forEach((el) => S.shown.set(el, painted(el)));
  seed();
  const nm = (el) => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.dataset && el.dataset.place ? '[data-place=' + el.dataset.place + ']' : '.' + String(el.className).split(' ')[0]);
  const moving = (el) => { for (let a = el; a && a.nodeType === 1; a = a.parentElement) { if (a.getAnimations().length) return true; const s = getComputedStyle(a); if (parseFloat(s.opacity) < 0.99 || (s.transform !== 'none' && !/matrix\\(1, 0, 0, 1, 0, 0\\)/.test(s.transform))) return true; } return false; };
  const rm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const judge = (el) => { const now = painted(el); const was = S.shown.get(el) === true; S.shown.set(el, now);
    if (now && !was) { const s = getComputedStyle(el);
      S.log.push({ name: nm(el), opacity: parseFloat(s.opacity), transform: s.transform, transition: s.transitionDuration, moving: moving(el), rm }); } };
  const mo = new MutationObserver((recs) => { const seen = new Set();
    for (const r of recs) { const t = r.target.nodeType === 1 ? r.target : r.target.parentElement; if (!t) continue;
      for (const el of [t, ...t.querySelectorAll(${JSON.stringify(A11_WATCH)})]) { if (el.matches(${JSON.stringify(A11_WATCH)}) && !seen.has(el)) { seen.add(el); judge(el); } }
      for (const n of r.addedNodes) if (n.nodeType === 1) for (const el of [n, ...n.querySelectorAll(${JSON.stringify(A11_WATCH)})]) if (el.matches(${JSON.stringify(A11_WATCH)}) && !seen.has(el)) { seen.add(el); judge(el); } } });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['hidden', 'class', 'style', 'aria-hidden'], subtree: true, childList: true });
  window.__obA11 = S; return 'installed';
})()`;
export const a11DrainJs = () => `(() => { const S = window.__obA11; if (!S) return null; const out = S.log.splice(0); return out; })()`;
export const judgeReveals = (log) => log.filter((r) => !r.rm && !r.moving && r.opacity >= 0.99 && (r.transform === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(r.transform)))
  .map((r) => `${r.name} revealed at the rest pose (opacity ${r.opacity}, transform ${r.transform}) — no kit enter`);

// ---- statics (node side; comment-stripped sources) ---------------------------
const stripSrc = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
/** app.html + web/app/*.js style blocks + web/app/ui/*.{css,js} (the J15 file set). */
export function styleSources(webDir) {
  const rels = ['app.html',
    ...fs.readdirSync(path.join(webDir, 'app')).filter((n) => n.endsWith('.js')),
    ...fs.readdirSync(path.join(webDir, 'app/ui')).filter((n) => /\.(css|js)$/.test(n)).map((n) => 'ui/' + n)];
  return rels.map((rel) => ({ rel, abs: rel === 'app.html' ? path.join(webDir, rel) : path.join(webDir, 'app', rel),
    src: stripSrc(fs.readFileSync(rel === 'app.html' ? path.join(webDir, rel) : path.join(webDir, 'app', rel), 'utf8')) }));
}
const blocks = (src) => { const out = []; const re = /([^{}]*)\{([^{}]*)\}/g; let m;
  while ((m = re.exec(src))) { // a JS style block's first selector trails the template opener — keep the selector only
    const raw = m[1].split(';').pop(); out.push({ sel: raw.slice(raw.lastIndexOf('`') + 1).trim().replace(/\s+/g, ' '), body: m[2], at: m.index }); }
  return out; };
const spansOf = (src, open) => { const spans = []; let m; const re = new RegExp(open.source, 'g');
  while ((m = re.exec(src))) { let d = 1, i = m.index + m[0].length; while (i < src.length && d) { if (src[i] === '{') d++; else if (src[i] === '}') d--; i++; } spans.push([m.index, i]); }
  return spans; };

// A11 static — the motion LADDER grep (moved here from e2e-ui J13 so the
// audit and the behaviour lab judge ONE ledger). FROZEN, shrink-only.
export const MOTION_OK = [
  ['app.html', /^200ms$/,
    'boot overlay (B-SH03 / owner Q1 default B, S5 slice 2 G6): the token FALLBACK at first paint — var(--ob-t-med, 200ms) on the rung fill, the stage-word crossfade and the exit; tokens.css is a [data-optional] link, so the inline sheet must carry the literal (shrunk from the pre-slice-2 0.6/0.8/0.9/1.4 s + 250–450 ms entrance ladder)'],
  ['ui/atelier.css', /^2\.4s$/,
    'ob-cardrail-turn 2.4 s steps(29) = sprite-sheet turntable playback rate (29 frames × 83 ms; content, not chrome motion) — the cue-spec morph + stat flash literals left with GH-668 S5 G8 (B-EQ09: both var(--ob-t-med))'],
  ['aimwidgets.js', /^0\.9s$/, 'gameplay instrument: massé warning flash aw-flash (PLAN §4 allow-list — aim widgets)'],
];
export function scanMotionDurations(webDir, ledger = MOTION_OK) {
  const decl = /(?:^|[;{\s])((?:transition|animation)(?:-duration|-delay)?)\s*:\s*([^;}]*)/g;
  const lit = /(?:^|[\s,(])(\d*\.?\d+)(ms|s)\b/g;
  const rows = []; const seen = new Set();
  for (const { rel, src } of styleSources(webDir)) {
    const hits = [];
    for (const m of src.matchAll(decl)) {
      const val = m[2].replace(/var\(--ob-t-[a-z]+\)/g, '');
      const lits = [...val.matchAll(lit)].map((x) => x[1] + x[2]).filter((l) => parseFloat(l) !== 0); // 0s = the visibility hold idiom
      if (lits.length) hits.push({ prop: m[1], value: m[2].trim().slice(0, 80), lits });
    }
    if (!hits.length) continue;
    const row = ledger.find(([n]) => n === rel); if (row) seen.add(rel);
    const ok = !!row && hits.every((h) => h.lits.every((l) => row[1].test(l)));
    rows.push({ rel, hits, ok, why: row?.[2] ?? 'UNLISTED — use var(--ob-t-fast|med|slow) or add a frozen ledger row with a reason' });
  }
  const dead = ledger.filter(([n]) => !seen.has(n)).map(([n]) => n);
  const kitRows = rows.filter((r) => r.rel === 'ui/kit.css' || r.rel === 'ui/tokens.css');
  return { rows, red: rows.filter((r) => !r.ok), dead, kitRows, ledgered: rows.filter((r) => r.ok).map((r) => r.rel) };
}

// A9 static — the COMPOSITION law: a selected-state rule that sets box-shadow
// or outline needs a :focus-visible companion in the same sheet (the ring
// composes over the selected register instead of being swallowed — B-K06).
export const FOCUS_OK = [ // [file, selector fragment, reason + retiring slice] — FROZEN, shrink-only
];
export function scanFocusCompanions(webDir, ledger = FOCUS_OK) {
  const seen = new Set();
  const STATE = /(\[aria-(?:current|selected|checked|pressed)[^\]]*\]|:checked|\[data-selected|\.is-selected|\.selected\b)/;
  const red = [];
  for (const { rel, src } of styleSources(webDir)) {
    const bl = blocks(src);
    for (const b of bl) {
      const st = b.sel.match(STATE); if (!st || /:focus-visible/.test(b.sel)) continue;
      if (!/(^|[;\s])(box-shadow|outline)\s*:/.test(b.body)) continue;
      const tok = st[1].replace(/=.*$/, '').replace(/\]$/, '');
      const companion = bl.some((c) => /:focus-visible/.test(c.sel) && c.sel.includes(tok) && /(box-shadow|outline)\s*:/.test(c.body));
      if (companion) continue;
      const row = ledger.find(([f, frag]) => f === rel && b.sel.includes(frag));
      if (row) { seen.add(row); continue; }
      red.push(`${rel}: ${b.sel} sets ${/box-shadow/.test(b.body) ? 'box-shadow' : 'outline'} with no ${tok}…:focus-visible companion`);
    }
  }
  return { red, dead: ledger.filter((r) => !seen.has(r)).map((r) => `${r[0]} ${r[1]}`) };
}

// A10 static — every :hover rule rides a hover / fine-pointer guard.
export const HOVER_OK = [ // [file, selector regex, reason + retiring slice] — FROZEN, shrink-only (B-K15: surfaces guard or drop their hovers in their slices)
  ['ui/help.css', /^\.ob-help__(disclose|guide|site):hover/, 'help overlay hovers (ui/help.css, its own owner) — a guard, not a slice-3 file: S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8)'],
  ['ui/modes.css', /^\.ob-mode-chip-btn(\[aria-pressed="true"\])?:hover:not\(:disabled\)/, 'mode chips (ui/modes.css, its own owner) — S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8)'],
];
export function scanUnguardedHover(webDir, ledger = HOVER_OK) {
  const red = []; const seen = new Set();
  for (const { rel, src } of styleSources(webDir)) {
    const guarded = spansOf(src, /@media[^{]*\((hover:\s*hover|pointer:\s*fine|any-hover:\s*hover)\)[^{]*\{/);
    for (const b of blocks(src)) {
      if (!/:hover/.test(b.sel) || /:not\([^)]*:hover/.test(b.sel)) continue;
      if (guarded.some(([a, z]) => b.at > a && b.at < z)) continue;
      const row = ledger.find(([f, re]) => f === rel && re.test(b.sel));
      if (row) { seen.add(row); continue; }
      red.push(`${rel}: ${b.sel.slice(0, 90)}`);
    }
  }
  return { red, dead: ledger.filter((r) => !seen.has(r)).map((r) => `${r[0]} ${r[1]}`) };
}

// A12 static — the token-grep hygiene law over the same file set.
export async function scanTypeHygiene(webDir) {
  const tg = await import('./token-grep.mjs');
  const perFile = new Map();
  for (const { rel, abs } of styleSources(webDir)) {
    if (/tokens\.css$/.test(rel)) continue;
    const key = 'web/' + (rel === 'app.html' ? 'app.html' : 'app/' + rel);
    perFile.set(key, tg.scanHygiene(key, fs.readFileSync(abs, 'utf8')));
  }
  return tg.judgeHygiene(perFile);
}

// ---- the runtime ledger (rows a later slice owns; FROZEN, shrink-only) ------
// A 4th field 'soft' marks a row whose ground is the LIVE 3D scene (glass over
// the felt / table): the measured ratio moves with the camera pose and the GPU,
// so the row is excused from liveness (it may or may not be hit in a run) —
// the cure is still the named slice's (a solid rung under the text).
// 'unposed' (fix round 2, verifier P3) marks a DATA readout that no --audit
// frame can pose without session data (an archived playback session chip, a
// generated share link): the exception is DECLARED here instead of resting on
// the element's absence, the row applies the moment a frame shows it, and it
// is excused from liveness for the same reason as 'soft'.
export const KIT_LAW_OK = [ // [law, name fragment (includes-match on the violation), reason + retiring slice, 'soft'?]
  ['A1', '#hud-call', 'HUD call pill fills its band slot start-aligned (icon + verb; touch.css §3.11 band pill) — re-set on the kit toolbar part by the S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8) (slice 3 G6 touched hud.js only)'],
  ['A2', '#ob-azimuth', 'HUD azimuth readout paints text-1 straight over the felt (3.5:1 at 667 × 375; app.html readout) — a HUD readout rung (B-K02 / B-K14 HUD material) with the S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8)', 'soft'],
  ['A2', 'atelier.station.', 'B-K14 atelier station strip: the band is on the kit solid rung since GH-668 S5 G2 (was the 52 % smoke, 4.42:1 in ko); the residual 4.38:1 in es / ja / de is the edge pill under the kit scroll-fade mask of the OVERFLOWING DESKTOP strip (the scene reads through the mask). G4 (S5 slice 5) rest-fitted the PHONE strip only (the coarse host width law); the desktop column keeps its width; the measured residual at this tip is ONE frame — the 1440x900 de strip pans by 12 px (es / ja rest-fit there; S5 vfix2 re-verifier clean-tree audit, 3479 rows / 264 atelier rows OK) — retired by the desktop strip rest-fit (GH-668 follow-up K-14)', 'soft'],
  ['A6', '#hud-call', 'HUD call pill 12 px on 44 (0.27; touch.css §3.11 band pill) — the coarse pad rung with the S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8)'],
  ['A6', '#replay', 'ACCEPTED HUD-density deviation (#1180, maintainer ruling, 2026-10-28): the HUD Shoot / Replay / Re-rack row keeps app.html `#hud button:not(.ob-select)` (12 px text, 4 px inline pad on the control rung: 0.10). The kit voice (14 px on the 16 px pill pad) needs about 245 px for the three pills in en against the panel\'s 204 px content box, so the row would wrap in every locale; a change of this face goes to maintainer sign-off with measurements'],
  ['A6', '#rerack', 'ACCEPTED HUD-density deviation (re-rack): the same ruling and reason as #replay (#1180)'],
  ['A15', '.ob-pb-strip-block', 'ACCEPTED coarse-floor deviation (#1180 item 2, maintainer ruling, 2026-10-29): the replay director-strip block\'s coarse hit box runs from the scrub track\'s edge to 10 px above the player shelf\'s edge (29 px on the phone, 38 px on a wider coarse viewport), not 44: the browser\'s touch adjustment snaps a touch whose contact is 20 px or less up to 9 px from a tappable edge onto it (measured in 1 px steps), so a 44 px box would take touches from the scene under the shelf. A wider contact reaches up to 15 px, so such a finger can still land on a block from within 5 px below the shelf\'s edge (a box clearing it fails WCAG 2.5.8\'s spacing exception against the track). No audit frame poses the strip on coarse; e2e-pbcoarse PB-STRIP judges it', 'unposed'],
  ['A8', '#state', 'HUD state line ellipsizes / clips at 667 × 375 (touch.css `html.ob-touch #hud #state { text-overflow: ellipsis }` — the sanctioned ellipsis vs the never-ellipsize law needs a DESIGN ruling: wrap to 2 lines inside the band or a marquee-free shortener) — the S5 slice 3b — HUD family follow-up (GH-668; issue filed at PR-open of the play slice, sites in its §8)'],
];
export function applyLedger(law, violations, seen = new Set(), ledger = KIT_LAW_OK) {
  const red = [], ledgered = [];
  for (const v of violations) {
    const row = ledger.find(([l, frag]) => l === law && v.includes(frag));
    if (row) { seen.add(row); ledgered.push(v); } else red.push(v);
  }
  return { red, ledgered };
}
export const deadLedgerRows = (seen, ledger = KIT_LAW_OK) => ledger.filter((r) => !seen.has(r) && r[3] !== 'soft' && r[3] !== 'unposed').map((r) => `${r[0]} ${r[1]}`);
