// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-atelier-s5hf.mjs — GH-668 S5 review review r6 (0 P1 / 1 P2,
// browser-reproduced on 9611f435 with the BASE module + the tip stylesheet).
// ONE LEG MODULE of e2e-atelier.mjs (the e2e-atelier-s5r5 precedent) with one
// arm; the suite calls runS5HF with its band; standalone
// (`node web/tools/e2e-atelier-s5hf.mjs [--pairing A|B|C]` under run-gate) runs
// the same cells in isolation for red/green proofs.
//
// S5-HF (host fold; "S5-K" already names the Keep-reachable arm of e2e-atelier-s5.mjs)
//       (review r6 P2) THE COARSE HOST FOLD IS KEYED ON A MARKER ONLY THE NEW
//       MODULE SUPPLIES. Pre-fix (9611f435) atelier.css folded `#ob-atelier-
//       cards` on the coarse register whenever the rail host did not wear
//       `ob-atelier-host--line` — and a cached pre-S5 atelier.js (the
//       SUPPORTED fresh-CSS / stale-JS pairing of the cache-poison contract,
//       the ownership ledger) never sets that class while it still homes the
//       brightness slider + the table Advanced disclosure in that box → both
//       controls unreachable. Fix: the module marks the host `ob-atelier-
//       host--rehomed` exactly while homeSecondary has moved the station's
//       secondary controls into the rail row (set at mount in the rail
//       branch, re-judged on a pointer flip); the fold selector requires the
//       marker; a host without it (the legacy module) keeps its cards box.
//
//       THE STALE MODULE is DERIVED from the SERVED (live) atelier.js by ONE
//       documented transform — the r2 stale-dictionary derivation style
//       (e2e-atelier-stale.mjs); never git history (CI checkouts are shallow):
//         T1  `section.classList.toggle('ob-atelier-host--line', line);`
//             → `section.classList.toggle('ob-atelier-host--line', false);`
//             (the legacy host never wears the arrival-line class)
//         T2  `const toRail = !!cardRail && eqCoarse();`
//             → `const toRail = false;`
//             (the legacy module never re-homes the secondary controls — they
//             stay in the host's station sections; on the tip the marker
//             rides toRail, so the derived module never sets it either)
//       Each pattern must match EXACTLY once — a drift of the live source
//       that breaks the derivation is a thrown error, never a silently
//       different stale fixture (both transforms live in the PURE
//       e2e-atelier-stale.mjs, re-exported here). THE STALE STYLESHEET (pairing B) is DERIVED
//       from the served atelier.css: the ONE marker-gated fold selector line
//       removed (exactly one match; the h2 rule kept) — a sheet from before
//       the r6 rule.
//
//       Pairing A  stale module + fresh CSS (Fetch.fulfillRequest on
//                  */app/atelier.js over a cache-disabled document after a
//                  warm boot — the S5-D idiom) at 844x390 + 667x375, en + de:
//         1 HOST      the host section and `#ob-atelier-cards` laid out
//                     (display ≠ none, box height > 0) at the lighting station;
//         2 SLIDER    `[data-ob="atelier-brightness"]` laid out and SELF-HIT
//                     (elementFromPoint at its centre is the slider, a node of
//                     its row, or the kit slider's own overlay);
//         3 DRAG      a REAL touch drag along the track changes the value AND
//                     stages the brightness preview (`__settings.preview
//                     .active().scalars.brightness` = the axis's committed
//                     base held by the transaction, the bar up); Put back
//                     (a real press on the bar's revert, else the api) clears;
//         4 ADVANCED  at the table station `details[data-ob="atelier-
//                     advanced"] > summary` laid out and SELF-HIT; a REAL tap
//                     opens the disclosure, a second closes it.
//       Pairing B  fresh module + stale CSS (Fetch.fulfillRequest on
//                  */ui/atelier.css*) at 844x390, en + de: the host section
//                  renders (laid out), the rail live, rows 2–4 through the
//                  RE-HOMED controls in the rail row.
//       Control C  fresh + fresh at 844x390 en: rows 2–4 through the rail —
//                  the fix moved nothing for the live pairing.
//
//       5 SITES (review r7, P2 + the integrator's CENSUS): THE
//         SHEET MOVED FACES ONTO KIT CLASSES THE LEGACY MODULE NEVER STAMPS.
//         The T1 / T2 module still stamped every kit class slice 5 added, so
//         the arm read those sites as fresh; the derived module now carries
//         the census transforms (e2e-atelier-stale.mjs CENSUS_T T3–T11 over
//         atelier.js, CENSUS_U U1–U5 over ateliercue.js — the per-site
//         className diff of every pre-existing element that gained a kit
//         class on the branch, each pattern at its exact count). Measured
//         served on a64f80f1 (844×390 coarse en + de): the Table → Advanced
//         pick rows on the UA button face (inline-block, buttonface under
//         the ivory ink, 2 px outset, min-height 0, cursor default — the host
//         sits in no .ob-panel, so the kit's panel-button recipe never
//         reaches it), the cue-sheet dismiss a 36×32 UA button, the rail
//         cards with radius 0 and their class chip / equipped tick as plain
//         text. Fix: atelier.css LEGACY-MODULE BELT — the kit face restated
//         under `.local:not(.kit)`, narrow, at the kit's tokens (V050).
//         Pairing A, every cell: (a) PICKS every Advanced pick row laid out,
//         ≥ 44 tall with a ≥ 44 min-height, NOT the UA face, self-hit; a
//         REAL tap on a non-current pick stages it (the row current, the
//         bar up), Put back after; (b) RAIL every card radius ≠ 0, the name
//         at the control weight, every visible chip a bordered pill smaller
//         than the name; (c) FENCED (reads fine served, recorded): the
//         Advanced summary ≥ 44, the cloth name line laid out with ink at
//         ≥ 12 px; (d) CLOSE at cues a real tap on a rail card opens the
//         sheet; the dismiss ≥ 44 × 44 on the coarse register, NOT the UA
//         face, self-hit; a real tap dismisses the sheet; (e) CONTAINERS
//         (review r9 P2-2, + the integrator's CONTAINER census
//         over 5f07282a: the r7 census walked controls; the sheet had moved
//         four CONTAINER surfaces onto the kit .ob-mat-solid rung the pre-G2
//         module never stamps — measured served on 5f07282a, pairing A
//         844×390 en: the station strip 498×57 sticky over the scene with
//         background rgba(0, 0, 0, 0), the rail's cloth row 288×78
//         transparent under its chips, the Advanced pane 474×266 a bordered
//         hole in the host at the table station; the provenance block is not
//         laid out on this register): at the table station (Advanced open)
//         the strip AND the Advanced pane, at the cloth station the strip AND
//         the secondary row are laid out with the computed background-color
//         EQUAL to the kit solid rung resolved in-page and a background-image
//         (the belt's two paint declarations; the rung's border-top-color
//         loses to the local border shorthand on both pairings, so it is not
//         judged); the derived module carries T12–T14 (the three class adds
//         stripped, count 1 each) so the row is red-provable.
//         Pairings B + C (the fresh module): NO node matches a legacy
//         selector (the belt is inert on the live pairing — the G8 face is
//         byte-for-byte the r5 / r6 P-EQ captions'); C records the fresh
//         pick face (the kit ghost row pill: .ob-btn--row, ≥ 44, transparent);
//         B + C judge the same CONTAINER rows on the fresh module (the rung
//         stands there by the kit class — the control reading).
//       SITES (f) HOST-CAP (review r11, P2 + the integrator's
//         CENSUS of the PUBLISHED-VARIABLE GEOMETRY): THE PUBLISHER-FALLBACK
//         LAW — a sheet geometry derived from a module-published variable
//         keeps its legacy value when the publisher is absent. Pre-fix
//         (fc5721d0) the coarse rail host's cap was the shell-band cap alone
//         (G2 retired the pre-S5 --rail / --railsub caps: "the rail yields to
//         the host through --ob-eq-host-b"), so a cached pre-S5 atelier.js —
//         which publishes NOTHING — kept its tall station sections while the
//         rail fell to its 78px host-band literal: 844x390 Table host 14–246
//         over the rail 150–230, every card centre hit-testing the host
//         (the merge-base module; census (f), five stations × four
//         registers). Fix: --ob-eq-host-cap is the S5 cap only while
//         --ob-eq-host-b resolves (a 0px term of the variable, invalid at
//         computed-value time without it) and max-height falls back to the
//         pre-S5 caps verbatim (max(64px, 62vh − 178px − insets); --railsub
//         62vh − 205px). The derived module carries T15 (the ONE publisher
//         write site stripped) so pairing A publishes nothing, exactly as the
//         cached module. Rows: at the Table and Cloth stations on every
//         coarse cell (A 844 / 667 en + de; B; C) the host bottom is at or
//         above the rail top and every VISIBLE card centre (inside the rail's
//         box — the rail is a horizontal scroller) hit-tests to its card;
//         pairing A publishes no --ob-eq-host-b (T15 live), B / C publish it.
//         CLOTH under pairing A is judged by the BASE sheet's own law there
//         (the floor-yield register: the pre-S5 rail is content-sized and its
//         chip sub-row's top half sits under the 64px-floored host at the
//         landscape phone — e2e-ui asserted "card centres clear of the host,
//         chips keep an 11.25px sliver"): every visible card centre its card,
//         at least one card centre visible, the overlap logged; the strict
//         host-bottom law holds at Table (the station review measured) and on
//         B / C everywhere. Census (f) rows 2 + 3 (the same law): the rail's
//         bottom fallback is the pre-S5 anchor (62vh − 8px, not − 12) and its
//         max-height fallback is `none` (the pre-S5 rail had no cap; the G2
//         literal rail-b − 78 − sp-2 turned the 156.7px Cloth band into a
//         scroller with NO visible card centre under the 21px inset).
//         The fine registers (800x600 / 1024x768, pairing A, Table + Cloth)
//         are RECORDED in the same law at Table; at Cloth the fine rail is
//         bottom-anchored and content-sized, and its chip sub-row sat under
//         the pre-S5 host in the base sheet too (85 px at 800x600) — the
//         cards row is judged, the overlap is logged (legacy geometry, not a
//         regression of this round).
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';
import { sleep, spawnStaticServer, stopStaticServer, launchChrome } from './cdp.mjs';
import { launchPhone, setSafeAreaInsets, drag, tap } from './touch-cdp.mjs';

export const PORT_INVENTORY = { http: 1, cdp: 1 };
// SHARED_DEFAULT_WINDOW — one suite in two files: e2e-atelier imports the arm; standalone this leg runs on atelier's own default ports
export const SHARED_DEFAULT_WINDOW = 'e2e-atelier';

const J = (o) => JSON.stringify(o);
const SA = { top: 0, left: 47, right: 47, bottom: 21 }; // the e2e-ui coarse insets

// the stale module / sheet's ONE truth lives in the pure e2e-atelier-stale.mjs (the r5 law: no browser import from a capture module): re-exported here for the record's readers
export { staleModule, staleSheet, staleCueModule, CENSUS_T, CENSUS_U, R6_FOLD_LINE } from './e2e-atelier-stale.mjs';
// an `export … from` binds NOTHING locally (the r5 tooling red) — the local import beside it
import { staleModule, staleSheet, staleCueModule } from './e2e-atelier-stale.mjs';

async function waitPortFree(port, ms = 15000) {
  const t0 = Date.now();
  for (;;) {
    const busy = await new Promise((res) => { const s = net.connect({ port, host: '127.0.0.1' }); s.once('connect', () => { s.destroy(); res(true); }); s.once('error', () => res(false)); });
    if (!busy) return true;
    if (Date.now() - t0 > ms) return false;
    await sleep(250);
  }
}
async function waitExpr(c, expr, tries = 60, ms = 150) {
  for (let i = 0; i < tries; i++) { try { if (await c.eval(expr)) return true; } catch { /* navigating */ } await sleep(ms); }
  return false;
}
const appErrs = (errs) => errs.filter((e) => !/favicon/i.test(String(e)));

/** the host + a control's geometry and self-hit (after a user-like pan into view) */
const GEO = (sel, rowSel) => `(() => {
  const rr = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const host = document.querySelector('#ob-shell-cards > section.ob-atelier-host');
  const cards = document.getElementById('ob-atelier-cards');
  const el = document.querySelector(${J(sel)});
  const row = el ? el.closest(${J(rowSel)}) : null;
  if (el && !el.hidden) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* no layout */ } }
  const box = rr(el);
  let hit = null, self = null;
  if (box) {
    const at = document.elementFromPoint(box.l + box.w / 2, box.t + box.h / 2);
    hit = at ? (at.dataset?.ob || at.id || at.className || at.tagName) : null;
    self = !!at && (at === el || (row && row.contains(at)) || at.contains(el));
    var inHost = !!at && !!host && host.contains(at) && !self;
  }
  return { vw: innerWidth, vh: innerHeight, host: { cls: host?.className ?? null, box: rr(host), display: host ? getComputedStyle(host).display : null, maxH: host ? getComputedStyle(host).maxHeight : null },
    cards: { box: rr(cards), display: cards ? getComputedStyle(cards).display : null },
    ctl: { box, inRail: !!el && !!el.closest('#ob-atelier-rail'), hit, self, inHost: typeof inHost === 'boolean' ? inHost : false } };
})()`;
const BRIGHT = '[data-ob="atelier-brightness"]';
const ADV = 'details[data-ob="atelier-advanced"] > summary';
const PREVIEW = `(() => { const a = window.__settings?.preview?.active?.() ?? null; const bar = document.querySelector('[data-ob="atelier-txbar"]'); const s = document.querySelector(${J(BRIGHT)}); return { brightness: a?.scalars?.brightness ?? null, barUp: !!bar && !bar.hidden, value: s ? s.value : null }; })()`;

/** the computed FACE of every node matching sel (instant scroll into view, then rect + elementFromPoint self-hit) */
const FACES = (sel) => `(() => { const out = []; let idx = 0; for (const el of document.querySelectorAll(${J(sel)})) {
  const i = idx++; const laid = !el.hidden && !!el.getClientRects().length; const cs = getComputedStyle(el);
  let r = null, hit = null, self = null;
  if (laid) { try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch { /* no layout */ }
    r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    hit = at ? (at.dataset?.ob || at.id || (typeof at.className === 'string' ? at.className : at.tagName)) : null; self = !!at && (at === el || el.contains(at)); }
  const inHost = !!laid && !self && !!document.querySelector('#ob-shell-cards > section.ob-atelier-host')?.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2));
  out.push({ idx: i, cls: el.className, laid, inHost, w: r ? +r.width.toFixed(1) : 0, h: r ? +r.height.toFixed(1) : 0, display: cs.display, minH: cs.minHeight, bg: cs.backgroundColor, ink: cs.color, fs: cs.fontSize, fw: cs.fontWeight,
    border: cs.borderTopWidth + ' ' + cs.borderTopStyle, radius: cs.borderTopLeftRadius, cursor: cs.cursor, disabled: !!el.disabled, cur: el.closest('[aria-current]')?.getAttribute('aria-current') ?? null, hit, self, text: (el.textContent || '').trim().slice(0, 24) }); }
  return out; })()`;
/** the viewport centre of the idx-th node matching sel (instant scroll to the scroller's CENTRE first — the host's
 * station strip is sticky at its top edge, so 'nearest' from above would park the node under it) + its row id +
 * what elementFromPoint finds there (the tap goes where the probe looked) */
const CENTRE = (sel, idx) => `(() => { const el = document.querySelectorAll(${J(sel)})[${idx}]; if (!el) return null; try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); } catch { /* no layout */ }
  const r = el.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, id: el.closest('[data-id]')?.dataset.id ?? null, self: !!at && (at === el || el.contains(at)), hit: at ? (at.dataset?.ob || at.id || (typeof at.className === 'string' ? at.className : at.tagName)) : null }; })()`;
const STAGED = `(() => { const bar = document.querySelector('[data-ob="atelier-txbar"]'); return { barUp: !!bar && !bar.hidden, cur: document.querySelector('details[data-ob="atelier-advanced"] .ob-eq-prov-row[aria-current="true"]')?.dataset.id ?? null }; })()`;
/** the UA button face the legacy module fell onto pre-fix (any ONE mark is the finding) */
const UA_FACE = (p) => p.display === 'inline-block' || /outset|inset/.test(p.border) || p.bg === 'rgb(239, 239, 239)' || (!p.disabled && p.cursor === 'default');
/** the legacy-module belt's selectors (atelier.css V050) — INERT on the fresh module by construction */
const LEGACY_SELECTORS = '.ob-eq-prov-row__pick:not(.ob-btn--row), #ob-atelier-cue .ob-atelier-cue-close:not(.ob-btn--icon), #ob-atelier-rail .ob-cardrail-card:not(.ob-card-option), #ob-atelier-rail .ob-cardrail-name:not(.ob-control), #ob-atelier-rail .ob-cardrail-chip:not(.ob-badge), #ob-atelier-rail .ob-cardrail-tick:not(.ob-badge):not(.ob-status)' // GH-1001: the fresh tick is the .ob-status marker
  // r9 (review r9 P2-2): the CONTAINER belt (atelier.css V052) — inert on the fresh module by construction
  + ', #ob-atelier-carousel:not(.ob-mat-solid), #ob-atelier-rail [data-ob="atelier-rail-sub"]:not(.ob-mat-solid), #ob-atelier details.ob-atelier-adv:not(.ob-mat-solid), #ob-atelier [data-ob="atelier-prov"]:not(.ob-mat-solid)';
/** r9 (review r9 P2-2): the CONTAINER surfaces — the kit solid rung resolved IN-PAGE (a probe box on the rung's own tokens)
 * beside each container's computed paint; laid = painted on this register (hidden / display none = not judged here) */
const CONTAINERS = `(() => { const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;background-color:var(--ob-glass-solid);background-image:var(--ob-glass-noise)'; document.body.appendChild(probe); const pcs = getComputedStyle(probe); const rung = { bg: pcs.backgroundColor, img: pcs.backgroundImage !== 'none' }; probe.remove();
  const one = (name, sel) => { const el = document.querySelector(sel); if (!el) return { name, absent: true }; const laid = !el.hidden && !!el.getClientRects().length; const cs = getComputedStyle(el); const r = laid ? el.getBoundingClientRect() : null;
    return { name, cls: el.className, laid, w: r ? +r.width.toFixed(1) : 0, h: r ? +r.height.toFixed(1) : 0, bg: cs.backgroundColor, img: cs.backgroundImage !== 'none', onRung: cs.backgroundColor === rung.bg && cs.backgroundImage !== 'none' }; };
  return { rung, station: window.__atelier?.station?.() ?? null, containers: [one('strip', '#ob-atelier-carousel'), one('rail-sub', '#ob-atelier-rail [data-ob="atelier-rail-sub"]'), one('advanced', ':is(#ob-atelier, #ob-atelier-rail) details.ob-atelier-adv'), one('prov', '#ob-atelier [data-ob="atelier-prov"]')] }; })()`;
/** r11 HOST-CAP: the host section vs the rail box + every VISIBLE card centre's hit (inside the card scroller's port ∩ the rail's box, and the viewport — card 32 v4's rail also holds the side column, where a panned card is clipped by the scroller) */
const HOSTCAP = `(() => {
  const rr = (el) => { if (!el || el.hidden || !el.getClientRects().length) return null; const r = el.getBoundingClientRect(); return { l: +r.left.toFixed(1), t: +r.top.toFixed(1), r: +r.right.toFixed(1), b: +r.bottom.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
  const host = document.querySelector('#ob-shell-cards > section.ob-atelier-host'); const rail = document.getElementById('ob-atelier-rail');
  const hb = rr(host), rb = rr(rail); const name = (at) => at ? (at.dataset?.ob || at.id || (typeof at.className === 'string' ? at.className.split(' ')[0] : at.tagName)) : null;
  let overlap = 0; if (hb && rb && Math.min(hb.r, rb.r) > Math.max(hb.l, rb.l)) overlap = +Math.max(0, Math.min(hb.b, rb.b) - Math.max(hb.t, rb.t)).toFixed(1);
  const pb = rr(rail?.querySelector('[data-ob="atelier-rail-cards"]')) ?? rb; const vb = rb && pb ? { l: Math.max(rb.l, pb.l), t: Math.max(rb.t, pb.t), r: Math.min(rb.r, pb.r), b: Math.min(rb.b, pb.b) } : null;
  const selEl = document.querySelector('#ob-atelier-rail .ob-cardrail-card[aria-selected="true"]'); let selSeen = false; // the looked-at card is pinned before the filter
  // the card the station must look at, from the staged ring / the equipped tick (store-derived flags, not aria-selected)
  const allCards = [...document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')];
  const pinEl = allCards.find((b) => b.classList.contains('ob-cardrail-card--staged')) ?? allCards.find((b) => { const t = b.querySelector('.ob-cardrail-tick'); return !!t && !t.hidden; }) ?? null;
  const cards = []; if (vb) for (const el of document.querySelectorAll('#ob-atelier-rail .ob-cardrail-card')) { const r = rr(el); if (!r) continue; const cx = r.l + r.w / 2, cy = r.t + r.h / 2;
    if (!(cx > vb.l && cx < vb.r && cy > vb.t && cy < vb.b && cx > 0 && cx < innerWidth && cy > 0 && cy < innerHeight)) continue;
    if (el === selEl) selSeen = true;
    const at = document.elementFromPoint(cx, cy); cards.push({ x: +cx.toFixed(1), y: +cy.toFixed(1), self: !!at && (at === el || el.contains(at)), hit: name(at) }); }
  return { station: window.__atelier?.station?.() ?? null, hostCls: host?.className ?? null, hostMaxH: host ? getComputedStyle(host).maxHeight : null, host: hb, rail: rb,
    railMaxH: rail ? getComputedStyle(rail).maxHeight : null, overlap, gap: hb && rb ? +(rb.t - hb.b).toFixed(1) : null, cards: cards.length, covered: cards.filter((k) => !k.self),
    first: cards[0] ?? null, sel: selEl ? (selEl.dataset.id ?? '?') : null, pin: pinEl ? (pinEl.dataset.id ?? '?') : null, selSeen, pub: document.documentElement.style.getPropertyValue('--ob-eq-host-b') || null }; })()`;
const SHEET_UP = `(() => { const s = document.getElementById('ob-atelier-cue'); return !!s && !s.hidden && s.getClientRects().length > 0; })()`;

export async function runS5HF({ PORT, CDP_PORT, fail: failIn, log = console.log, only = null }) {
  const fail = (m) => failIn(`S5-HF ${m}`);
  // r9 (e) CONTAINERS: the named containers must be laid out ON the kit solid rung; the rest are recorded
  const judgeContainers = (tag, res, must) => {
    log(`S5-HF ${tag}: SITES CONTAINERS @${res.station} rung ${J(res.rung)} ${J(res.containers.map((k) => (k.absent ? { name: k.name, absent: true } : { name: k.name, cls: k.cls, laid: k.laid, box: [k.w, k.h], bg: k.bg, img: k.img, onRung: k.onRung })))}`);
    for (const name of must) {
      const k = res.containers.find((x) => x.name === name);
      if (!k || k.absent) { fail(`${tag}: SITES CONTAINERS the ${name} container is absent`); continue; }
      if (!k.laid) { fail(`${tag}: SITES CONTAINERS the ${name} container is not laid out at the ${res.station} station`); continue; }
      if (!k.onRung) fail(`${tag}: SITES CONTAINERS the ${name} container (${k.w}×${k.h}, class "${k.cls}") paints background ${k.bg} / image ${k.img} — not the kit solid rung ${res.rung.bg} (a cached pre-G2 module under this sheet leaves it transparent)`);
    }
  };
  // r11 (f) HOST-CAP: the host never paints over the rail — bottom at or above the rail top, every visible card centre its card
  const judgeHostCap = (tag, pairing, res, { strict = true } = {}) => {
    log(`S5-HF ${tag}: HOST-CAP @${res.station} host ${J(res.host)} max ${res.hostMaxH} cls "${res.hostCls}" | rail ${J(res.rail)} max ${res.railMaxH} | gap ${res.gap} overlap ${res.overlap} | cards ${res.cards} covered ${J(res.covered)} first ${J(res.first)} | --ob-eq-host-b ${J(res.pub)}`);
    if (!res.host) { fail(`${tag}: HOST-CAP the host section is not laid out at ${res.station}`); return; }
    if (!res.rail) { fail(`${tag}: HOST-CAP the rail is not laid out at ${res.station}`); return; }
    if (pairing === 'A' && res.pub !== null) fail(`${tag}: HOST-CAP the DERIVED stale module still publishes --ob-eq-host-b = ${res.pub} (T15 is inert)`);
    if (pairing !== 'A' && res.pub === null) fail(`${tag}: HOST-CAP the fresh module published no --ob-eq-host-b at ${res.station}`);
    if (strict && res.host.b > res.rail.t + 0.5) fail(`${tag}: HOST-CAP at ${res.station} the host bottom ${res.host.b} is below the rail top ${res.rail.t} (overlap ${res.overlap} px; host max-height ${res.hostMaxH}) — the legacy host cap is missing under this pairing`);
    if (res.cards === 0) fail(`${tag}: HOST-CAP no visible rail card at ${res.station} (rail ${J(res.rail)})`);
    // the looked-at card must exist and be the staged / equipped one (the v5final review review: a lost aria-selected
    // let a visible neighbour stand in)
    if (res.sel === null) fail(`${tag}: HOST-CAP at ${res.station} no card is looked at (no aria-selected card; staged / equipped ${res.pin}) — the census cannot pin it`);
    else if (res.pin !== null && res.sel !== res.pin) fail(`${tag}: HOST-CAP at ${res.station} the looked-at card ${res.sel} is not the staged / equipped card ${res.pin}`);
    else if (!res.selSeen) fail(`${tag}: HOST-CAP at ${res.station} the looked-at card ${res.sel} is not inside the card scroller's port ∩ the rail — the census cannot judge it`);
    for (const k of res.covered) fail(`${tag}: HOST-CAP at ${res.station} the card centre ${k.x},${k.y} hit-tests to ${J(k.hit)}, not the card`);
  };
  let cells = 0;
  // the live bytes, staled once (fetched from the suite's own static server)
  let staleJs = null, staleCue = null, staleCss = null;
  try {
    const js = await fetch(`http://127.0.0.1:${PORT}/app/atelier.js`); if (!js.ok) throw new Error(`atelier.js HTTP ${js.status}`);
    staleJs = Buffer.from(staleModule(await js.text()), 'utf8').toString('base64');
    const cue = await fetch(`http://127.0.0.1:${PORT}/app/ateliercue.js`); if (!cue.ok) throw new Error(`ateliercue.js HTTP ${cue.status}`);
    staleCue = Buffer.from(staleCueModule(await cue.text()), 'utf8').toString('base64');
  } catch (e) { fail(`could not derive the stale modules: ${e.message}`); return; }
  try {
    const css = await fetch(`http://127.0.0.1:${PORT}/app/ui/atelier.css`); if (!css.ok) throw new Error(`atelier.css HTTP ${css.status}`);
    staleCss = Buffer.from(staleSheet(await css.text()), 'utf8').toString('base64');
  } catch (e) { log(`S5-HF stale sheet: ${e.message} (pairing B judged only where the r6 rule exists)`); }
  // the literal tuple list bounds the cells (cdp 1: sequential)
  const CELLS = [
    ['A', 844, 390, 'en'], ['A', 844, 390, 'de'], ['A', 667, 375, 'en'], ['A', 667, 375, 'de'],
    ['B', 844, 390, 'en'], ['B', 844, 390, 'de'],
    ['C', 844, 390, 'en'],
  ].filter(([p]) => !only || p === only);
  for (const [pairing, w, h, loc] of CELLS) {
    const tag = `${pairing} ${w}x${h} ${loc}`;
    if (pairing === 'B' && !staleCss) { fail(`${tag}: no stale sheet derived (the r6 fold line is absent from the served atelier.css)`); continue; }
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5hf_${pairing}_${w}_${loc}_${u}`;
    const c = await launchPhone(url('warm'), { cdpPort: CDP_PORT, width: w, height: h, tool: false });
    const errs = [];
    let stalePhase = false; const served = { js: 0, cue: 0, css: 0 };
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') { if (stalePhase) errs.push(params.args.map((a) => a.value ?? a.description).join(' ')); return; }
      if (method === 'Runtime.exceptionThrown') { if (stalePhase) errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text); return; }
      if (method !== 'Fetch.requestPaused') return;
      const u = params.request.url;
      if (pairing === 'A' && /\/app\/atelier\.js(\?|$)/.test(u)) {
        served.js += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: staleJs }).catch(() => {});
      } else if (pairing === 'A' && /\/app\/ateliercue\.js(\?|$)/.test(u)) {
        served.cue += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: staleCue }).catch(() => {});
      } else if (pairing === 'B' && /\/ui\/atelier\.css(\?|$)/.test(u)) {
        served.css += 1;
        c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: staleCss }).catch(() => {});
      } else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    try {
      await setSafeAreaInsets(c, SA);
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: warm boot never ready`); continue; }
      await c.send('Network.enable');
      await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      if (pairing !== 'C') await c.send('Fetch.enable', { patterns: pairing === 'A' ? [{ urlPattern: '*/app/atelier.js*' }, { urlPattern: '*/app/ateliercue.js*' }] : [{ urlPattern: '*/ui/atelier.css*' }] });
      stalePhase = true;
      await c.send('Page.navigate', { url: url('stale') });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: stale boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'typeof window.__atelier === "object"', 60))) { fail(`${tag}: atelier never mounted (served ${J(served)})`); continue; }
      if (!(await waitExpr(c, 'window.__atelier.rail().live === true', 60))) { fail(`${tag}: rail never live (served ${J(served)})`); continue; }
      if (pairing === 'A' && served.js === 0) { fail(`${tag}: the stale module was never served`); continue; }
      if (pairing === 'B' && served.css === 0) { fail(`${tag}: the stale sheet was never served`); continue; }
      if (loc !== 'en') { await c.eval(`window.__i18n.setLocale(${J(loc)}), true`); await waitExpr(c, `window.__i18n.locale() === ${J(loc)}`, 30, 100); }
      const coarse = await c.eval(`matchMedia('(pointer: coarse)').matches`);
      if (!coarse) { fail(`${tag}: the register is not coarse`); continue; }
      const goSt = async (st) => { await c.eval(`__atelier.go(${J(st)}, { force: true }), true`); return waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()`, 80); };
      // ---- 1 HOST + 2 SLIDER at the lighting station
      if (!(await goSt('lighting'))) { fail(`${tag}: lighting never presented`); continue; }
      await sleep(500);
      const g1 = await c.eval(GEO(BRIGHT, '.ob-atelier-brightrow'));
      log(`S5-HF ${tag}: ${g1.vw}x${g1.vh} served ${J(served)} host ${J(g1.host)} cards ${J(g1.cards)} slider ${J(g1.ctl)}`);
      cells += 1;
      const marker = /\bob-atelier-host--rehomed\b/.test(g1.host.cls || '');
      if (pairing === 'A' && marker) fail(`${tag}: the DERIVED stale module wears the marker (the derivation is inert)`);
      if (pairing !== 'A' && !marker) fail(`${tag}: the fresh module did not mark the host (class ${J(g1.host.cls)})`);
      if (!g1.host.box || g1.host.display === 'none') fail(`${tag}: HOST the host section is not laid out (${J(g1.host)})`);
      if (pairing === 'A') {
        if (!g1.cards.box || g1.cards.display === 'none' || g1.cards.box.h <= 0) fail(`${tag}: HOST the legacy cards box is folded away (${J(g1.cards)}) — the fold must key on the marker`);
        if (g1.ctl.inRail) fail(`${tag}: the derived stale module re-homed the slider into the rail (the derivation is inert)`);
      } else if (!g1.ctl.inRail) fail(`${tag}: the fresh module did not re-home the slider into the rail`);
      // r11 RESTATEMENT (THE PUBLISHER-FALLBACK LAW): under pairing A the host wears the pre-S5 cap again (64 px at
      // 844x390 / 667x375 — the base sheet's floor-yield register, "the STRIP WINS"), so a host-homed control sits in
      // the host scroller UNDER its pinned station strip exactly as it did on the base sheet + base module (census (f):
      // BASE slider hit = a station pill at both coarse registers). The r6 law stands as: the control is laid out
      // inside the host's cards box (never folded away) and its centre hit-tests to ITSELF or to the HOST's own
      // pinned strip — a hit outside the host (the rail, the shell) is the failure; the DRAG row runs when self-hit.
      if (!g1.ctl.box) fail(`${tag}: SLIDER the brightness slider is not laid out`);
      else if (!g1.ctl.self && !(pairing === 'A' && g1.ctl.inHost)) fail(`${tag}: SLIDER the brightness slider is covered — elementFromPoint at its centre is ${J(g1.ctl.hit)} (box ${J(g1.ctl.box)})`);
      else if (!g1.ctl.self) log(`S5-HF ${tag}: SLIDER under the host's pinned strip (hit ${J(g1.ctl.hit)}; host max-height ${g1.host.maxH}) — the legacy floor-yield register (r11 restatement); DRAG not judged here`);
      // ---- 3 DRAG: a REAL touch drag along the track stages the brightness preview
      if (g1.ctl.box && g1.ctl.self) {
        const p0 = await c.eval(PREVIEW);
        const y = g1.ctl.box.t + g1.ctl.box.h / 2;
        const x0 = g1.ctl.box.l + g1.ctl.box.w * 0.25, x1 = g1.ctl.box.l + g1.ctl.box.w * 0.7;
        await drag(c, { x: x0, y }, { x: x1, y }, { steps: 20, stepMs: 16 });
        await sleep(500);
        const p1 = await c.eval(PREVIEW);
        log(`S5-HF ${tag}: DRAG ${x0.toFixed(1)}→${x1.toFixed(1)} @ ${y.toFixed(1)}: value ${p0.value} → ${p1.value}, brightness axis staged ${p1.brightness !== null} (transaction base ${J(p1.brightness)}), bar up ${p1.barUp}`);
        cells += 1;
        if (p1.value === p0.value) fail(`${tag}: DRAG a real touch drag moved nothing (value ${p0.value})`);
        if (p1.brightness === null) fail(`${tag}: DRAG the drag staged no brightness preview (${J(p1)})`);
        // put back: a real press on the bar's revert, else the api (cleanup, not a verdict)
        const pb = await c.eval(`(() => { const b = document.querySelector('[data-ob="atelier-revert"]'); if (!b || b.hidden || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
        if (pb) await tap(c, pb.x, pb.y);
        if (!(await waitExpr(c, `(window.__settings?.preview?.active?.() ?? null) === null`, 30))) await c.eval(`window.__settings?.preview?.revert?.(), true`).catch(() => {});
        await sleep(300);
      }
      // ---- 4 ADVANCED at the table station: laid out, self-hit, a REAL tap toggles it
      if (!(await goSt('table'))) { fail(`${tag}: table never presented`); continue; }
      await sleep(500);
      const g2 = await c.eval(GEO(ADV, 'details[data-ob="atelier-advanced"]'));
      log(`S5-HF ${tag}: cards ${J(g2.cards)} advanced ${J(g2.ctl)}`);
      cells += 1;
      // r11 (f) HOST-CAP at the table station (every pairing)
      cells += 1;
      judgeHostCap(tag, pairing, await c.eval(HOSTCAP));
      if (pairing === 'A' && (!g2.cards.box || g2.cards.display === 'none')) fail(`${tag}: HOST the legacy cards box is folded away at the table station (${J(g2.cards)})`);
      if (pairing === 'A' && g2.ctl.inRail) fail(`${tag}: the derived stale module re-homed Advanced into the rail (the derivation is inert)`);
      if (pairing !== 'A' && g2.ctl.box && !g2.ctl.inRail) fail(`${tag}: the fresh module did not re-home Advanced into the rail`);
      if (!g2.ctl.box) fail(`${tag}: ADVANCED the summary is not laid out`);
      else if (!g2.ctl.self && !(pairing === 'A' && g2.ctl.inHost)) fail(`${tag}: ADVANCED the summary is covered — elementFromPoint at its centre is ${J(g2.ctl.hit)} (box ${J(g2.ctl.box)})`);
      else if (!g2.ctl.self) log(`S5-HF ${tag}: ADVANCED under the host's pinned strip (hit ${J(g2.ctl.hit)}; host max-height ${g2.host.maxH}) — the legacy floor-yield register (r11 restatement); the toggle taps not judged here`);
      else {
        const open = () => c.eval(`document.querySelector('details[data-ob="atelier-advanced"]')?.open === true`);
        const o0 = await open();
        await tap(c, g2.ctl.box.l + g2.ctl.box.w / 2, g2.ctl.box.t + g2.ctl.box.h / 2);
        await sleep(400);
        const o1 = await open();
        const g3 = await c.eval(GEO(ADV, 'details[data-ob="atelier-advanced"]'));
        if (g3.ctl.box && g3.ctl.self) await tap(c, g3.ctl.box.l + g3.ctl.box.w / 2, g3.ctl.box.t + g3.ctl.box.h / 2);
        await sleep(400);
        const o2 = await open();
        log(`S5-HF ${tag}: ADVANCED open ${o0} → tap ${o1} → tap ${o2}`);
        if (o1 === o0) fail(`${tag}: ADVANCED a real tap on the summary did not toggle it (open ${o0} → ${o1})`);
        if (o2 !== o0) fail(`${tag}: ADVANCED the second tap did not toggle it back (open ${o1} → ${o2})`);
      }
      // ---- 5 SITES (review r7): the faces the sheet moved onto kit classes the legacy module never stamps
      const openAdv = async () => { await c.eval(`(() => { const d = document.querySelector('details[data-ob="atelier-advanced"]'); if (d) d.open = true; })()`); await sleep(400); };
      const openSheet = async () => {
        if (!(await goSt('cues'))) return 'cues never presented';
        await sleep(600);
        const card = await c.eval(CENTRE('#ob-atelier-rail .ob-cardrail-card:not([aria-selected="true"])', 0)) ?? await c.eval(CENTRE('#ob-atelier-rail .ob-cardrail-card', 0));
        if (!card) return 'no rail card to tap';
        await tap(c, card.x, card.y);
        if (!(await waitExpr(c, SHEET_UP, 40, 150))) return 'the cue sheet never came up after a real tap on a rail card';
        await sleep(400);
        return null;
      };
      if (pairing === 'A') {
        // (a) PICKS — Table → Advanced open: every pick row on a styled ≥ 44 face, self-hit; a REAL tap stages
        await openAdv();
        // (e) CONTAINERS at the table station (r9): the strip + the Advanced pane on the kit solid rung
        cells += 1;
        judgeContainers(tag, await c.eval(CONTAINERS), ['strip', 'advanced']);
        const picks = await c.eval(FACES('details[data-ob="atelier-advanced"] .ob-eq-prov-row__pick'));
        log(`S5-HF ${tag}: SITES picks ${picks.length}: ${J(picks.map((p) => ({ h: p.h, minH: p.minH, display: p.display, bg: p.bg, ink: p.ink, border: p.border, cursor: p.cursor, self: p.self })))}`);
        cells += 1;
        if (picks.filter((p) => p.laid).length < 2) fail(`${tag}: SITES fewer than 2 Advanced pick rows laid out (${J(picks)})`);
        for (const p of picks) {
          if (!p.laid) { fail(`${tag}: SITES pick "${p.text}" is not laid out`); continue; }
          if (p.h < 43.5) fail(`${tag}: SITES pick "${p.text}" is ${p.h} px tall — under the 44 coarse floor`);
          if (!(parseFloat(p.minH) >= 43.5)) fail(`${tag}: SITES pick "${p.text}" min-height ${p.minH} — no 44 floor`);
          if (UA_FACE(p)) fail(`${tag}: SITES pick "${p.text}" sits on the UA button face (${J({ display: p.display, bg: p.bg, border: p.border, cursor: p.cursor })})`);
          // r11 RESTATEMENT (THE PUBLISHER-FALLBACK LAW): under the pre-S5 host cap the Advanced pane sits in the host
          // scroller under its pinned strip (the base sheet's floor-yield register) — a hit on the HOST's own strip is
          // the legacy geometry, a hit outside the host is the failure
          if (!p.self && !(pairing === 'A' && p.inHost)) fail(`${tag}: SITES pick "${p.text}" is covered — elementFromPoint at its centre is ${J(p.hit)}`);
        }
        if (picks.some((p) => p.laid && !p.self && p.inHost)) log(`S5-HF ${tag}: SITES picks under the host's pinned strip (${J(picks.filter((p) => p.inHost).map((p) => p.hit))}) — the legacy floor-yield register (r11 restatement)`);
        const t = picks.find((p) => p.laid && !p.disabled && p.cur !== 'true' && p.self);
        if (!t && pairing === 'A' && picks.some((p) => p.laid && p.inHost) && !picks.some((p) => p.laid && p.self)) log(`S5-HF ${tag}: SITES the real pick tap is not judged here (every pick under the host's pinned strip — the legacy register)`);
        else if (!t) fail(`${tag}: SITES no tappable non-current pick row`);
        else {
          await c.eval(CENTRE('details[data-ob="atelier-advanced"] .ob-eq-prov-row__pick', t.idx));
          await sleep(300);
          const box = await c.eval(CENTRE('details[data-ob="atelier-advanced"] .ob-eq-prov-row__pick', t.idx)); // re-read after the settle: the tap goes where the probe looked
          if (!box.self) fail(`${tag}: SITES pick "${t.text}" at its tap point ${box.x.toFixed(1)},${box.y.toFixed(1)} is under ${J(box.hit)}`);
          await tap(c, box.x, box.y);
          await sleep(500);
          const st = await c.eval(STAGED);
          const stAt = await c.eval('window.__atelier.station()');
          log(`S5-HF ${tag}: SITES real tap on pick #${t.idx} (${box.id}) at ${box.x.toFixed(1)},${box.y.toFixed(1)} (self ${box.self}): ${J(st)} station ${stAt}`);
          if (stAt !== 'table') fail(`${tag}: SITES the real tap on pick "${t.text}" left the table station (now ${stAt}) — it landed outside the pick`);
          else if (!st.barUp || st.cur !== box.id) fail(`${tag}: SITES a real tap on pick "${t.text}" did not stage it (${J(st)})`);
          const pb = await c.eval(`(() => { const b = document.querySelector('[data-ob="atelier-revert"]'); if (!b || b.hidden || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
          if (pb) await tap(c, pb.x, pb.y);
          if (!(await waitExpr(c, `(window.__settings?.preview?.active?.() ?? null) === null`, 30))) await c.eval(`window.__settings?.preview?.revert?.(), true`).catch(() => {});
          await sleep(300);
        }
        // (b) RAIL — the table station's cards under the un-stamped module
        const cards = (await c.eval(FACES('#ob-atelier-rail .ob-cardrail-card'))).filter((p) => p.laid);
        const names = (await c.eval(FACES('#ob-atelier-rail .ob-cardrail-name'))).filter((p) => p.laid);
        const chips = (await c.eval(FACES('#ob-atelier-rail .ob-cardrail-chip:not([hidden]), #ob-atelier-rail .ob-cardrail-tick:not([hidden])'))).filter((p) => p.laid);
        log(`S5-HF ${tag}: SITES rail cards ${cards.length} (radius ${J([...new Set(cards.map((p) => p.radius))])}), names ${names.length} (fw ${J([...new Set(names.map((p) => p.fw))])} fs ${J([...new Set(names.map((p) => p.fs))])}), chips ${chips.length} (${J([...new Set(chips.map((p) => `${p.fs} ${p.border} r${p.radius}`))])})`);
        cells += 1;
        if (!cards.length) fail(`${tag}: SITES no rail card laid out at the table station`);
        for (const p of cards) if (p.radius === '0px') fail(`${tag}: SITES rail card "${p.text}" has no radius (the kit card face is missing)`);
        for (const p of names) if (!(parseFloat(p.fw) >= 500)) fail(`${tag}: SITES rail card name "${p.text}" at weight ${p.fw} (the control weight is missing)`);
        if (!chips.length) fail(`${tag}: SITES no visible rail chip at the table station`);
        const nameFs = names.length ? parseFloat(names[0].fs) : 14;
        for (const p of chips) {
          if (!/solid/.test(p.border) || p.radius === '0px') fail(`${tag}: SITES rail chip "${p.text}" is plain text (border ${p.border}, radius ${p.radius}) — the badge face is missing`);
          if (!(parseFloat(p.fs) < nameFs)) fail(`${tag}: SITES rail chip "${p.text}" at ${p.fs} is not smaller than the name (${nameFs}px)`);
        }
        // (c) FENCED — the sites that read fine served (recorded on both trees)
        const sums = (await c.eval(FACES('details[data-ob="atelier-advanced"] > summary'))).filter((p) => p.laid);
        if (!sums.length || sums[0].h < 43.5) fail(`${tag}: SITES the Advanced summary is ${sums[0]?.h ?? 'not laid out'} — under the 44 floor`);
        if (!(await goSt('cloth'))) fail(`${tag}: SITES cloth never presented`);
        else {
          await sleep(500);
          cells += 1;
          judgeHostCap(tag, pairing, await c.eval(HOSTCAP), { strict: pairing !== 'A' }); // r11 (f) HOST-CAP at the cloth station (pairing A: the base sheet's Cloth floor-yield law — cards clear, the chip sub-row may sit under the 78px host)
          const cn = (await c.eval(FACES('.ob-atelier-clothname'))).filter((p) => p.laid);
          log(`S5-HF ${tag}: SITES fenced: Advanced summary ${sums[0]?.h} tall; cloth name line ${J(cn.map((p) => ({ fs: p.fs, ink: p.ink, w: p.w, h: p.h })))}`);
          if (!cn.length) fail(`${tag}: SITES the cloth name line is not laid out at the cloth station`);
          for (const p of cn) if (!(parseFloat(p.fs) >= 12) || p.ink === 'rgba(0, 0, 0, 0)') fail(`${tag}: SITES the cloth name line reads at ${p.fs} / ${p.ink}`);
          // (e) CONTAINERS at the cloth station (r9): the strip + the rail's secondary row on the kit solid rung
          cells += 1;
          judgeContainers(tag, await c.eval(CONTAINERS), ['strip', 'rail-sub']);
        }
        // (d) CLOSE — the cue sheet's dismiss under the un-stamped cue module
        const why = await openSheet();
        if (why) fail(`${tag}: SITES CLOSE ${why}`);
        else {
          if (served.cue === 0) fail(`${tag}: SITES the stale cue module was never served (served ${J(served)})`);
          const cl = (await c.eval(FACES('[data-ob="atelier-cue-close"]')))[0];
          log(`S5-HF ${tag}: SITES close ${J(cl ? { cls: cl.cls, w: cl.w, h: cl.h, minH: cl.minH, display: cl.display, bg: cl.bg, border: cl.border, radius: cl.radius, self: cl.self } : null)} served ${J(served)}`);
          cells += 1;
          if (!cl || !cl.laid) fail(`${tag}: SITES the cue-sheet dismiss is not laid out`);
          else {
            if (cl.w < 43.5 || cl.h < 43.5) fail(`${tag}: SITES the dismiss is ${cl.w}×${cl.h} — under the 44 coarse floor`);
            if (UA_FACE(cl)) fail(`${tag}: SITES the dismiss sits on the UA button face (${J({ display: cl.display, bg: cl.bg, border: cl.border, cursor: cl.cursor })})`);
            if (!cl.self) fail(`${tag}: SITES the dismiss is covered — elementFromPoint at its centre is ${J(cl.hit)}`);
            else {
              const box = await c.eval(CENTRE('[data-ob="atelier-cue-close"]', 0));
              await tap(c, box.x, box.y);
              const down = await waitExpr(c, `!(${SHEET_UP})`, 30, 100);
              log(`S5-HF ${tag}: SITES real tap on the dismiss → sheet down ${down}`);
              if (!down) fail(`${tag}: SITES a real tap on the dismiss did not close the sheet`);
            }
          }
        }
      } else {
        // pairings B / C (the fresh module): the legacy belt is INERT — no node matches a legacy selector with the
        // Advanced rows and the cue sheet both on the page; C records the fresh pick face (the kit ghost row pill)
        await openAdv();
        cells += 1;
        judgeContainers(tag, await c.eval(CONTAINERS), ['strip', 'advanced']); // (e) the fresh module: the rung by the kit class
        const picks = (await c.eval(FACES('details[data-ob="atelier-advanced"] .ob-eq-prov-row__pick'))).filter((p) => p.laid);
        const why = await openSheet();
        const inert = await c.eval(`document.querySelectorAll(${J(LEGACY_SELECTORS)}).length`);
        log(`S5-HF ${tag}: SITES fresh module: legacy-selector matches ${inert}; picks ${picks.length} ${J(picks.map((p) => ({ cls: p.cls, h: p.h, minH: p.minH, display: p.display, bg: p.bg, border: p.border })))}; sheet ${why ? `NOT up (${why})` : 'up'}`);
        cells += 1;
        if (inert !== 0) fail(`${tag}: SITES ${inert} node(s) match a legacy-module selector on the fresh module (the belt must be inert on the live pairing)`);
        if (why) fail(`${tag}: SITES ${why}`);
        if (pairing === 'C') {
          if (!picks.length) fail(`${tag}: SITES no Advanced pick row laid out on the fresh module`);
          for (const p of picks) {
            if (!/\bob-btn--row\b/.test(p.cls)) fail(`${tag}: SITES fresh pick "${p.text}" does not wear the kit row pill (${p.cls})`);
            if (!(parseFloat(p.minH) >= 43.5) || p.h < 43.5) fail(`${tag}: SITES fresh pick "${p.text}" ${p.h} / min ${p.minH} — under the 44 floor`);
            if (UA_FACE(p)) fail(`${tag}: SITES fresh pick "${p.text}" on the UA face (${J({ display: p.display, bg: p.bg, border: p.border })})`);
          }
        }
        if (await goSt('cloth')) { await sleep(500); cells += 1; judgeContainers(tag, await c.eval(CONTAINERS), ['strip', 'rail-sub']); cells += 1; judgeHostCap(tag, pairing, await c.eval(HOSTCAP)); }
        else fail(`${tag}: SITES CONTAINERS cloth never presented on the fresh module`);
      }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  // r11 (f) HOST-CAP on the FINE registers (pairing A, the record): Table in the same law; Cloth's cards row judged, the
  // bottom-anchored fine rail's legacy chip-row overlap logged (the base sheet's own geometry at 800x600)
  if (!only || only === 'A') for (const [w, h] of [[800, 600], [1024, 768]]) {
    const tag = `A ${w}x${h} en fine`;
    if (!(await waitPortFree(CDP_PORT))) { fail(`${tag}: cdp port ${CDP_PORT} still busy`); continue; }
    const url = (u) => `http://127.0.0.1:${PORT}/app.html?obtool=1&obshell=1&seed=1&u=s5hf_Af_${w}_${u}`;
    const c = await launchChrome(url('warm'), { port: CDP_PORT, width: w, height: h, tool: false });
    const errs = []; let stalePhase = false; const served = { js: 0, cue: 0 };
    c.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'error') { if (stalePhase) errs.push(params.args.map((a) => a.value ?? a.description).join(' ')); return; }
      if (method === 'Runtime.exceptionThrown') { if (stalePhase) errs.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text); return; }
      if (method !== 'Fetch.requestPaused') return;
      const u = params.request.url;
      if (/\/app\/atelier\.js(\?|$)/.test(u)) { served.js += 1; c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: staleJs }).catch(() => {}); }
      else if (/\/app\/ateliercue\.js(\?|$)/.test(u)) { served.cue += 1; c.send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: staleCue }).catch(() => {}); }
      else c.send('Fetch.continueRequest', { requestId: params.requestId }).catch(() => {});
    });
    try {
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: warm boot never ready`); continue; }
      await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
      await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/app/atelier.js*' }, { urlPattern: '*/app/ateliercue.js*' }] });
      stalePhase = true;
      await c.send('Page.navigate', { url: url('stale') });
      if (!(await waitExpr(c, 'window.__test?.ready === true', 300, 200))) { fail(`${tag}: stale boot never ready`); continue; }
      if (!(await waitExpr(c, 'typeof window.__shell === "object"', 300))) { fail(`${tag}: no shell`); continue; }
      await waitExpr(c, 'window.__shell.isOpen() === true', 100);
      for (let i = 0; i < 6; i++) { await c.eval(`__shell.go('equipment'), true`); if (await waitExpr(c, 'typeof window.__atelier === "object"', 50)) break; }
      if (!(await waitExpr(c, 'window.__atelier?.rail?.().live === true', 60))) { fail(`${tag}: rail never live (served ${J(served)})`); continue; }
      if (served.js === 0) { fail(`${tag}: the stale module was never served`); continue; }
      if (await c.eval(`matchMedia('(pointer: coarse)').matches`)) { fail(`${tag}: the register is coarse`); continue; }
      const goSt = async (st) => { await c.eval(`__atelier.go(${J(st)}, { force: true }), true`); return waitExpr(c, `window.__atelier.station() === ${J(st)} && !window.__shell.moving()`, 80); };
      if (!(await goSt('table'))) fail(`${tag}: table never presented`);
      else { await sleep(600); cells += 1; judgeHostCap(tag, 'A', await c.eval(HOSTCAP)); }
      if (!(await goSt('cloth'))) fail(`${tag}: cloth never presented`);
      else { await sleep(600); cells += 1; judgeHostCap(tag, 'A', await c.eval(HOSTCAP), { strict: false }); }
      const bad = appErrs(errs);
      if (bad.length) fail(`${tag}: app errors: ${bad.slice(0, 3).map((e) => String(e).split('\n')[0]).join(' | ')}`);
    } finally { try { c.close(); } catch { /* gone */ } await sleep(600); }
  }
  log(`S5-HF cells judged: ${cells}`);
  if (cells === 0) fail('no cell judged');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const PORT = Number(process.env.OB_E2E_PORT ?? 8179);
  const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 16620);
  const pi = process.argv.indexOf('--pairing');
  const only = pi > 0 ? process.argv[pi + 1] : null;
  const fail = (msg) => { console.error('E2E-ATELIER-S5HF FAIL:', msg); process.exitCode = 1; };
  const server = spawnStaticServer(webDir, PORT);
  await sleep(700);
  try { await runS5HF({ PORT, CDP_PORT, fail, only }); } catch (e) { fail(e?.stack || String(e)); }
  await stopStaticServer(server);
  console.log(process.exitCode ? 'E2E-ATELIER-S5HF FAIL' : 'E2E-ATELIER-S5HF PASS');
}
