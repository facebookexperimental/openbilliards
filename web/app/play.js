// Copyright (c) Meta Platforms, Inc. and affiliates.

// play.js — the play place's card content (feature 034, program 525 S4;
// sub-slice 034a-front). Contract of record:
// the play contract (feature 034, internal) (chrome tree + window.__play surface
// §3; place laws §4). Spec: feature 034 (internal spec); plan §5.
//
// ALTITUDE LAW: this module is CONTENT of the S1 `play` place (shell.md §2
// registry row 1) — it mounts INTO the place's card section and never
// amends the frozen shell contract: the ONE S1 mover stays the only camera
// writer (§3), input isolation is the shell's (§7; the play containers join
// R0's KEY_GATE_EXEMPT list and consume every exempted key in-container),
// and play changes NO boot shape (§4 — default scripted boots never
// construct the shell, so they never construct this).
//
// Reached ONLY by the R0 generic host in shell.js — `mountContent('play')`
// driven by the CONTENT_MODULES row `play: ['./play.js', 'createPlay']` at
// the place's first arrival (cache-poison contract: an absent/stale module
// leaves the S1 stub cards standing, never a black page). Do NOT add this
// module to any static import graph or to main.js's warm fetch.
//
// Commit law (spec FR-006..FR-009, FR-013; contract §4 law 1): every commit
// rides the EXISTING `window.__settings` api (changeGame with its confirm
// classes untouched, changeVariant, changeMode, set('caromSecondBall')) —
// feature-detected, never imported: `./settings.js` is NEVER on this
// module's graph, so a stale settings.js under a fresh play.js stays
// coherent (degrade rung 5: the control whose seam is absent is hidden).
// Gate order on EVERY commit control: replay lock (`__share.replay().active`)
// → pending decision on a progressed rack (`shell.notice('shell.notice.
// decision')`) → the `__settings` call. Browsing (focus, arrow keys) is
// never gated. No new persistence keys, no new event grammar, no
// play-local confirms.
//
// Boot-flash law (spec FR-003; review round 3 P2-3): the host-class flip,
// the stub retirement and the ONE synchronous subtree append are gated on
// the `ob-play-css` stylesheet's `load` — the first frame painted at play is
// the S1 stub OR the final content, never unstyled DOM. A failed/absent
// sheet leaves the stub standing (rung 4b) and publishes nothing:
// `window.__play` is the LAST statement of mount() (contract §3
// publication law; review round 4 P2-1).
import { t, has, onLocaleChange } from './i18n.js';
// namespace binding for the ADDITIVE hasLocal export (OWNERSHIP rule 5 /
// the GH-313 mixed-cache law): a fresh play.js over an ancient i18n.js
// without it degrades to has() instead of a boot-killing missing export
import * as i18nNs from './i18n.js';
// dist games index: a long-shipped leaf already on the shell-era graph
// (settings.js:66-68 placement — never the SDK barrel; plan §5.1 law 2)
import { GAME_CATALOG, getGameEntry } from '../dist/pool-sdk/games/index.js';

// ui/play.css version — bump on EVERY change to that sheet (?v= cache-bust
// law; the ATELIER_CSS_V precedent).
const PLAY_CSS_V = '023';
// ---- stylesheet (?v= leaf law; module level — the replays idiom) ---------
// Linked by the shell's LAW 1 `prefetch()` hook in idle time (for play that
// hook is uniformity, not a speed-up — see prefetch() below): mount() is
// gated on this sheet's `load` (FR-003), so with the link made inside the
// factory a "settled" (imported) module still fetched its sheet AT the
// arrival and the S1 stub stood from the shell's ARRIVAL_HOLD_MS cap until
// it landed (issue #811). Resolves TRUE on load, FALSE on error — rung 4b
// unchanged: a failed sheet leaves the stub standing and never mounts;
// idempotent.
let sheetPromise = null;
let sheetLoaded = false;
function ensureSheet() {
  if (sheetPromise) return sheetPromise;
  sheetPromise = new Promise((res) => {
    let link = document.getElementById('ob-play-css');
    if (link?.sheet) { sheetLoaded = true; res(true); return; }
    if (!link) {
      link = document.createElement('link');
      link.id = 'ob-play-css';
      link.rel = 'stylesheet';
      link.href = new URL(`./ui/play.css?v=${PLAY_CSS_V}`, import.meta.url);
      document.head.appendChild(link);
    }
    link.addEventListener('load', () => { sheetLoaded = true; res(true); }, { once: true });
    // rung 4b: a failed sheet leaves the stub standing — no console error
    link.addEventListener('error', () => res(false), { once: true });
  });
  return sheetPromise;
}
/** LAW 1 prefetch hook (shell.js): link the sheet in idle time.
 * UNIFORMITY ONLY for this place, and a no-op at the opening arrival: the
 * opening pose is always Play (owner ruling 2026-08-15) and the shell's
 * mountContent chains the factory on the SAME import promise this hook
 * rides, so play's sheet moves microseconds, not milliseconds (issue #811
 * names the document-level preload as the residual). Exported so every
 * content module presents one surface, and so any boot that reaches play
 * with its module unmounted is warmed like the rest. */
export function prefetch() {
  return ensureSheet();
}
// the SIX keys R0's gateKeyDown releases to KEY_GATE_EXEMPT containers
// (shell.js gate) — every one of them is consumed in-container (FR-018)
const ROVING_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
// bounded wait for the cardrail leaf after the stylesheet lands, so a
// healthy boot paints the rail register ONCE (never fallback → rail)
const RAIL_LEAF_WAIT_MS = 2000;

/**
 * Build the play card content into the shell's play section.
 * @param {object} ctx — the R0 `shellCtx(section)` SUPERSET:
 *   { scene, camera, orbit, machine, game, mover, section, bedScale,
 *     shell: { isOpen, place, goTo, exitToTable, instant, decisionPending,
 *              notice, showThenOpen } }
 *   play uses `exitToTable, instant, decisionPending, notice` and
 *   feature-detects each; `showThenOpen` is 036's member and is ignored
 *   here (spec ruling 24; protocol R0 (d)).
 * @returns {{ go: Function, setPlace: Function, onShellExit: Function,
 *   propTap: Function } | null} — NO `primary`: the S1 quick-play closure
 *   stays the card's primary by R0 (f).
 */
export function createPlay(ctx) {
  const { section, game } = ctx ?? {};
  const shell = ctx?.shell ?? {};
  if (!section) return null;

  // ---- seams (feature-detected; never imported) --------------------------
  const sapi = () => window.__settings ?? null;
  const safeEntry = (gid) => { try { return getGameEntry(gid); } catch { return null; } };
  /** the ACTIVE dictionary's OWN key (hasLocal — never has()'s en fallback,
   * which would paint fresh English copy into a non-English UI whose own
   * dictionary is stale; the GH-313 register); an ancient i18n.js without
   * the export degrades to has() */
  const hasLoc = (k) => (typeof i18nNs.hasLocal === 'function' ? i18nNs.hasLocal(k) === true : has(k));
  /** live matchMedia read — never cached across the session (plan §5.6) */
  const reducedMotion = () => {
    try {
      return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch { return false; }
  };
  /** the `obshell=1` scripted opt-in (contract §3 previewCatalog law) */
  const scripted = () => { try { return !!shell.instant?.(); } catch { return false; } };
  /** D7 perf tier (shell.js glassGate idiom; re-read on ob:perftier) */
  const perfLow = () => {
    try {
      const tier = window.__obPerfTier;
      return (typeof tier === 'function' ? tier() : tier) === 'low';
    } catch { return false; }
  };
  /** contract §4 law 1: the shared-replay lock — share.js `replay()`; the
   * lock lifts ONLY when `active` turns false (Continue/Exit), never on
   * `done` (review round 2 P1-3) */
  const replayLocked = () => {
    try { return window.__share?.replay?.()?.active === true; } catch { return false; }
  };
  /** refuses when unsure: an absent read = NOT pristine (plan §5.7) */
  const rackPristine = () => {
    try { return sapi()?.rackPristine?.() === true; } catch { return false; }
  };
  /** the commit gate (contract §4 law 1) — true = proceed to __settings */
  const gate = () => {
    if (replayLocked()) return false;
    let pending = false;
    try { pending = shell.decisionPending?.() === true; } catch { pending = false; }
    if (pending && !rackPristine()) {
      try { shell.notice?.('shell.notice.decision'); } catch { /* seam absent */ }
      return false;
    }
    return true;
  };

  // ---- localized names (settings.js gameName / variant label rules) ------
  // game.<id> key (contracts/game-catalog.md display-string rule) with the
  // catalog's display_name fallback for ids that predate their locale keys
  // (settings.js:2352 `gameName`, relocated here — T012)
  const gameName = (gid, entry = null) => {
    if (!gid) return '—';
    if (has(`game.${gid}`)) return t(`game.${gid}`);
    const e = entry ?? safeEntry(gid);
    return (typeof e?.display_name === 'string' && e.display_name) ? e.display_name : gid;
  };
  // FR-004: `settings.variant.<preset>` is the only namespace that exists
  // ×7; `variantFor(game) === null` (unpinned default — fresh nine_ball /
  // eight_ball profiles, poisoned path) maps to `settings.variantDefault`
  // and the line is ALWAYS rendered.
  const variantName = (vid) => (vid
    ? (has(`settings.variant.${vid}`) ? t(`settings.variant.${vid}`) : vid)
    : t('settings.variantDefault'));
  // provenance — rulebook DATA (English by design), nested fields. The
  // FULL citation (S4 line; answer B of OWNER Q2) is the Details body's
  // first line and, under the ONE-attribute switch `data-ob-citation="full"`
  // on the section, the card hint again. The card's default (Q2 default A,
  // GH-668 S5 slice 3 G4 / B-PL04): an ISSUER line in the kit __hint and
  // the EDITION in the kit __meta — the kit --card budget law (name 2 +
  // issuer 1 + edition 1 line).
  const provLine = (e) => {
    const p = e?.provenance;
    return p ? `${p.body} — ${p.rulebook} (${p.edition})` : '';
  };
  // the issuer line is the issuing BODY alone (WPA / WPBSA / UMB): the kit
  // --card law reserves ONE issuer line, and `body · rulebook` measured 3
  // lines for the WPBSA title (card 110 px) and 2 for the UMB title under
  // a 2-line name (116 px) at both slots (slice 3 G4 probe) — the rulebook
  // TITLE is the Details body's first line (Q2 A: source title + article
  // in the expander).
  const provIssuer = (e) => {
    const p = e?.provenance;
    return p ? String(p.body) : '';
  };
  // the FIRST date in the free-text `edition` (catalog DATA — R9 keeps the
  // strings free text; this parse is presentation): ISO `2025-09-15` /
  // `2025-09`, or an English month name with a year (`September 2024`,
  // `1 January 1989`, `Sep 15, 2025`). No date found ⇒ the raw edition
  // string verbatim — DATA is shown, never invented.
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const firstDate = (s) => {
    if (typeof s !== 'string') return null;
    const found = [];
    const iso = /(\d{4})-(\d{2})(?:-(\d{2}))?/g;
    for (let m; (m = iso.exec(s));) {
      const mo = Number(m[2]);
      if (mo >= 1 && mo <= 12) found.push({ i: m.index, y: Number(m[1]), m: mo });
    }
    const en = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(?:\d{1,2},?\s+)?(\d{4})\b/gi;
    for (let m; (m = en.exec(s));) found.push({ i: m.index, y: Number(m[2]), m: MONTHS.indexOf(m[1].toLowerCase()) + 1 });
    if (!found.length) return null;
    found.sort((a, b) => a.i - b.i);
    return found[0];
  };
  const uiLocale = () => (document.documentElement.lang || 'en');
  const provEdition = (e) => {
    const raw = e?.provenance?.edition;
    if (typeof raw !== 'string' || !raw) return '';
    const d = firstDate(raw);
    if (!d) return raw;
    try {
      return new Intl.DateTimeFormat(uiLocale(), { year: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(Date.UTC(d.y, d.m - 1, 1)));
    } catch { return raw; }
  };
  /** the citation switch (OWNER Q2: one attribute flips the card to answer B) */
  const citationFull = () => section.dataset.obCitation === 'full';
  const readinessBadge = (r) => (has(`settings.gameBadge.${r}`)
    ? t(`settings.gameBadge.${r}`) : String(r));
  const tierBadge = (tier) => (has(`settings.variantTier.${tier}`)
    ? t(`settings.variantTier.${tier}`) : String(tier ?? ''));

  // ---- chrome DOM (contract §3 — built ONCE, ALL nodes present, hidden
  // toggles only; appended AFTER the S1 stub nodes, never reparenting them)
  const el = (tag, attrs = {}) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === true) n.setAttribute(k, '');
      else if (v !== false && v != null) n.setAttribute(k, String(v));
    }
    return n;
  };
  const mkLine = (labelKey) => { // the S1 summary-line anatomy (shell.js)
    const p = el('p', { class: 'ob-shell-line' });
    const b = el('b', { 'data-i18n': labelKey });
    b.textContent = t(labelKey);
    const v = el('span');
    p.append(b, document.createTextNode(': '), v);
    return { p, v };
  };
  // the ONE scroller (FR-003 cap + scrollfade; contract §8 entry 7) — the
  // h2 long-press point stays fixed above it
  const body = el('div', { 'data-ob': 'play-body', class: 'ob-scroll' }); // kit thin scrollbar (B-K23)
  const summary = el('div', { 'data-ob': 'play-summary' });
  const gLine = mkLine('shell.card.game');
  const rLine = mkLine('shell.card.rules');
  summary.append(gLine.p, rLine.p);
  const back = el('button', { // the card action row (GH-668 B-K01 .ob-btn--row)
    type: 'button', class: 'ob-btn ob-btn--row', 'data-ob': 'play-back', hidden: true,
  });
  {
    const lab = el('span', { class: 'ob-btn__label',
      'data-i18n': 'shell.place.play.backToPlay' });
    lab.textContent = t('shell.place.play.backToPlay');
    back.appendChild(lab);
    // the row's leading BACK glyph (GH-668 S5 play visual r1, V6): the kit
    // .ob-btn__icon slot + the kit icons.js `chevron-left` face through the
    // guarded leaf import (cache-poison contract: a stale kit without the
    // glyph leaves the row label-only — never an empty slot)
    import('./ui/icons.js')
      .then((m) => {
        const svg = m.icon?.('chevron-left');
        if (!svg || back.querySelector(':scope > .ob-btn__icon')) return;
        const slot = el('span', { class: 'ob-btn__icon', 'aria-hidden': 'true' });
        slot.appendChild(svg);
        back.prepend(slot);
      })
      .catch(() => { /* label-only row */ });
  }
  // the DISCIPLINE heading NAMES the rail (review code review, fix round 1
  // P2-3): a stable id on the h3 + `aria-labelledby` on the mount — the
  // cardrail leaf sets role=listbox on the mount but never names it (the
  // atelier caller labels its own rail); the rung-1 button register takes
  // the SAME role pair when it paints (role=listbox on the mount, role=option
  // on every card — review r1 checker P3: the mirrored aria-selected is
  // ARIA-valid on an option inside a listbox only; the mount is built as a
  // named group until a register paints). The heading is data-i18n, so the
  // name follows the locale.
  // the kit CAPS role (`.ob-caps`, kit.css G7 type roles — GH-668 S5 slice
  // 3 G5 / B-K24): the section heads carry the class; play.css restates no
  // size / weight / tracking / transform (the A12 hygiene law).
  const hChoose = el('h3', { id: 'ob-play-choose', class: 'ob-caps', 'data-i18n': 'shell.place.play.choose' });
  hChoose.textContent = t('shell.place.play.choose');
  const games = el('div', { 'data-ob': 'play-games', role: 'group',
    'aria-labelledby': 'ob-play-choose' });
  // the Details expander (contract §3 S4b reservation `button[data-ob=
  // "play-details"][aria-expanded]`, realized by GH-668 S5 slice 3 G4 /
  // OWNER Q2 default A): a kit `.ob-btn--ghost` row after the rail toggles
  // a kit `.ob-hint` block carrying the FULL citation of the BROWSED card
  // (aria-selected, else the current card) — `body — rulebook (edition)`
  // verbatim, the `sections` DATA and, for a readiness card, the
  // prerequisites. Toggles write nothing (law 5); no Escape; the button
  // joins no roving set (a natural tab stop after the rail). hasLoc()-guarded
  // (GH-668 S5 play r6, review review r5 F1 + the round-6 census (a)): the
  // gate reads the ACTIVE dictionary's OWN key — never has()'s en fallback,
  // which succeeded through a fresh en.json and painted the English
  // "Details" / "Sections" into a Japanese UI whose own cached dictionary
  // predates the keys (plus two missing-key warnings) — at label
  // initialisation AND on every locale repaint (renderDetails runs on every
  // sync), and the label carries NO data-i18n: play paints it itself, so the
  // shell's applyDom walk can never translate a key the active dictionary
  // lacks (the carom fork's law below, restated for the Details). A fresh
  // play.js over a stale ACTIVE dictionary keeps the node hidden. The body
  // wears the kit SOLID rung (`.ob-mat-solid`, kit.css material ladder /
  // the design charter B-K14 — the same strip register the carom fork block sits
  // on): the place card is 52 % smoke over the LIVE scene, and on a true
  // top-down frame the bright cloth is the ground under the column — the
  // text-1 hint read 2.83:1 there (review-r2 fix check; e2e-play
  // P-DETAILS-INK's top-down light leg). play.css keeps the strip's pad /
  // bleed; no play-private surface.
  const detailsKey = 'shell.place.play.details';
  const details = el('button', { type: 'button', class: 'ob-btn ob-btn--ghost ob-btn--row',
    'data-ob': 'play-details', 'aria-expanded': 'false', 'aria-controls': 'ob-play-details-body', hidden: true });
  const detailsLab = el('span', { class: 'ob-btn__label' }); // painted by renderDetails (no data-i18n)
  details.appendChild(detailsLab);
  const detailsBody = el('div', { id: 'ob-play-details-body', class: 'ob-hint ob-mat-solid',
    'data-ob': 'play-details-body', hidden: true });
  let detailsOpen = false;
  details.addEventListener('click', () => {
    detailsOpen = !detailsOpen;
    details.setAttribute('aria-expanded', String(detailsOpen));
    detailsBody.hidden = !detailsOpen;
    if (detailsOpen) renderDetails(model());
  });
  const hRules = el('h3', { class: 'ob-caps', 'data-i18n': 'shell.place.play.rules', hidden: true });
  hRules.textContent = t('shell.place.play.rules');
  const variants = el('div', { 'data-ob': 'play-variants', hidden: true });
  // the carom fork host is a PLAIN [hidden] div; the kit `.ob-segmented`
  // class (display:inline-flex) goes on the INNER wrapper through the
  // guarded `upgradeSegmented` so it never defeats the UA [hidden] rule on
  // the host (review round 1 P1-2); rung 2 = plain radios in the wrapper
  // the fork block wears the kit SOLID rung (`.ob-mat-solid`, kit.css
  // material ladder / the design charter B-K14: "every inner card on a glass pane";
  // the G7 ground law makes the hint's text-2 ink legal ONLY on a solid
  // ground — the place card is smoke over the live scene, and the e2e-ui
  // A2 still read the fork hint at 3.61:1 over the felt once G5's said-once
  // geometry moved the block; GH-668 S5 slice 3 G5). Background only — the
  // UA [hidden] rule on the host still wins (play.css keeps the kill rule).
  const carom = el('div', { 'data-ob': 'play-carom2b', class: 'ob-mat-solid', hidden: true });
  // the fork's head is the third section head — an `h3.ob-caps` (GH-668 S5
  // slice 3 G5; the play hook class stays for the e2e pins); the radiogroup
  // keeps its own aria-label below
  const caromLabel = el('h3', { class: 'ob-play-carom2b__label ob-caps',
    'data-i18n': 'settings.caromSecondBall' });
  caromLabel.textContent = t('settings.caromSecondBall');
  const caromInner = el('div', { role: 'radiogroup' });
  // GH-668 S5 slice 3 G2 (B-PL01 — GH-667 on the play surface): the segment
  // copy is the two NOUNS (shell.place.play.carom2b.{yellow,marked}); the
  // qualifier moved to ONE kit `.ob-hint` line under the control (the kit
  // hint role — legal on the section's solid base; the host sits on the
  // section, not on an inner card), wired to the group by aria-describedby.
  // hasLocal()-guarded and RE-EVALUATED ON EVERY SYNC (review review r1
  // P2-2): a stale dictionary keeps the pre-split qualifier
  // keys on the segments (settings.caromSecondBall.* is never deleted) and
  // the hint hidden. The guard reads the ACTIVE dictionary's OWN keys
  // (hasLocal, never has()'s en fallback — a stale de over a fresh en
  // painted the English nouns into the German fork) and renderCarom
  // re-wires labels, hint and aria-describedby on every sync, so a locale
  // change under a MIXED cache (fresh de, cached pre-split en) lands on
  // that locale's own register — a boot-time constant left the nodes bound
  // to the split keys and the switch to en painted the raw keys. The three
  // nodes carry NO data-i18n: play paints them itself, so the shell's
  // applyDom walk (registered before play's locale listener) can never
  // write a key the current dictionary lacks (no missing-key warn either).
  const carom2bSplit = () => ['yellow', 'marked', 'hint'].every((k) => hasLoc(`shell.place.play.carom2b.${k}`));
  const carom2bKey = (v, split) => (split ? `shell.place.play.carom2b.${v}` : `settings.caromSecondBall.${v}`);
  const caromHint = el('span', { class: 'ob-hint', id: 'ob-play-carom2b-hint',
    'data-ob': 'play-carom2b-hint', hidden: true });
  carom.append(caromLabel, caromInner, caromHint);
  // GH-524 conditions-axis reservation: named, EMPTY, zero pixels (FR-019)
  const conditions = el('div', { 'data-ob': 'play-conditions', hidden: true });
  body.append(summary, back, hChoose, games, details, detailsBody, hRules, variants, carom, conditions);

  // ---- a focused control is WHOLE inside the scroller (review visual audit
  // round 2, finding 1: the de carom fork's focused "Markiertes Weiß" label
  // lost its second line under the bottom scrollfade band — the browser's
  // focus scroll had brought only the 1 px kit radio into view, not its
  // label). Law: on focus (a native radio's selection always focuses it —
  // pointer or arrow key), the control's VISIBLE box (the label of a radio,
  // the button itself otherwise) is scrolled 'nearest' on the BLOCK axis of
  // [data-ob="play-body"] with the fade band as the inset (ui/play.css
  // scroll-padding-block on the .ob-scrollfade register, read back here so
  // the number lives in the sheet). Block axis only: the rail's inline pan
  // stays the cardrail leaf's (eased / instant per reduced motion). A box
  // taller than the padded viewport falls back to the bare viewport; one
  // taller than that is left alone (the scroll-into-view 'nearest' law).
  // Runs synchronously AND on the next frame: Chrome's own focus scroll
  // lands after the focus events, so the frame pass keeps the outcome
  // independent of that ordering (idempotent — no-op once whole).
  const fadeInset = () => {
    const v = parseFloat(getComputedStyle(body).scrollPaddingTop);
    return Number.isFinite(v) && v > 0 ? v : 0;
  };
  /** the lowest edge of the REAL content (visible children only): the kit
   * fade bands are absolutely positioned pseudo-elements anchored at
   * scrollTop + clientHeight, so they extend the scrollable overflow by the
   * current scrollTop whenever the real content fits — and by the OLD
   * viewport height for one frame after the content shrinks (a locale
   * swap). scrollHeight lies in both windows; the children do not. */
  const realBottom = () => {
    let max = -Infinity;
    for (const n of body.children) {
      if (n.hidden) continue;
      const r = n.getBoundingClientRect();
      if (r.height > 0 && r.bottom > max) max = r.bottom;
    }
    return max;
  };
  const revealControl = (node) => {
    if (!(node instanceof Element) || !body.contains(node)) return;
    const box = node.matches('input') ? (node.closest('label') ?? node) : node;
    const r = box.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    if (r.height <= 0 || r.height > br.height) return;
    const pad = r.height <= br.height - 2 * fadeInset() ? fadeInset() : 0;
    const over = r.bottom - (br.bottom - pad);   // tail under the bottom band
    const under = (br.top + pad) - r.top;        // head under the top band
    if (over > 0) {
      // never scroll into the bands' phantom overflow: the room below is
      // bounded by the real content PLUS the scroller's own block-end
      // padding (the fold-snap leaf's --fs-pad is real, scrollable padding
      // — at its end the bottom band is off, so a tail flush with the edge
      // is whole; GH-668 S5 slice 3 G4: the Details row moved the carom
      // fork's tail stop 20 px into the band and the pad was the only room)
      const padEnd = parseFloat(getComputedStyle(body).paddingBottom) || 0;
      const dy = Math.min(over, realBottom() + padEnd - br.bottom);
      if (dy > 0) body.scrollTop += dy;
    } else if (under > 0) {
      body.scrollTop -= under;
    }
  };
  const revealSoon = (node) => {
    revealControl(node);
    requestAnimationFrame(() => { if (document.activeElement === node) revealControl(node); });
  };
  body.addEventListener('focusin', (e) => { revealSoon(e.target); });
  /** the audited path was NOT a focus: the fork stayed focused while the
   * locale swap reflowed its label (en → de grew the content by 21 px and
   * the scroller, parked at the old maximum, left the new second line under
   * the band). A re-render that can reflow the focused control re-reveals
   * it; other syncs (settings broadcasts) never move the scroller. */
  const revealFocused = () => {
    const ae = document.activeElement;
    if (ae && body.contains(ae)) revealSoon(ae);
  };

  // ---- catalog: live GAME_CATALOG + the scripted-only readiness fixture --
  // (`__play.previewCatalog`; module memory, never persisted — review r1 P1-3)
  let fixture = null;
  const catalog = () => (fixture ? [...GAME_CATALOG, ...fixture] : GAME_CATALOG);
  const isFixture = (id) => !!fixture && fixture.some((f) => f.id === id);

  // ---- model (pure reads; NO writes) --------------------------------------
  function model() {
    const s = sapi();
    let v = null;
    try { v = s?.get?.() ?? null; } catch { v = null; }
    const gid = v?.game ?? game?.gameId ?? null;
    let vid = null;
    try { vid = gid ? (s?.variantFor?.(gid) ?? null) : null; } catch { vid = null; }
    // heyball capability gate (contract §4 law 6): the read is ABSENT on
    // the integration branch through 034a-front (034a-mig T009 adds it) —
    // then the card shows only when heyball is the persisted current game
    let caps = null;
    try { caps = typeof s?.capabilities === 'function' ? (s.capabilities() ?? null) : null; }
    catch { caps = null; }
    const heyballOk = caps ? caps.heyball === true : gid === 'heyball';
    const all = catalog().filter((e) => e && e.id && (e.id !== 'heyball' || heyballOk));
    const playable = all.filter((e) => e.readiness === 'playable');
    const readiness = all.filter((e) => e.readiness !== 'playable');
    // variant rows: settings-owned data (plan ruling P3); absent/null ⇒
    // the list is on degrade rung 5 (hidden) — the whole 034a-front window
    let rows = null;
    try {
      rows = (typeof s?.variantRows === 'function' && gid) ? (s.variantRows(gid) ?? null) : null;
    } catch { rows = null; }
    if (!Array.isArray(rows) || rows.length === 0) rows = null;
    return {
      game: gid,
      variant: vid,
      games: [...playable, ...readiness], // playable set first (spec ruling 22)
      variants: rows,
      mode: typeof v?.mode === 'string' ? v.mode : 'play',
      carom2b: v?.caromSecondBall === 'marked' ? 'marked' : 'yellow',
      locked: replayLocked(),
      canGame: typeof s?.changeGame === 'function',
      canVariant: typeof s?.changeVariant === 'function',
      canMode: typeof s?.changeMode === 'function',
      canCarom: typeof s?.set === 'function',
    };
  }

  // ---- keyboard: the SIX exempted keys, consumed in-container ------------
  // ONE roving handler shared by the rung-1 rail register and the variant
  // list: Left/Up ⇒ previous, Right/Down ⇒ next, Home/End ⇒ first/last;
  // preventDefault + stopPropagation on EVERY one of the six, even with a
  // single row — an unconsumed vertical arrow would pass R0's exemption and
  // reach aim.js (review round 3 P1-2). NO Escape listener anywhere in play
  // (review round 2 P1-2). Enter/Space activate the focused button natively.
  const roveWithin = (container, itemSel, e) => {
    const items = [...container.querySelectorAll(itemSel)]
      .filter((n) => !n.hidden && n.getClientRects().length > 0);
    e.preventDefault();
    e.stopPropagation();
    if (!items.length) return null;
    const at = e.target?.closest?.(itemSel) ?? null;
    const i = Math.max(0, items.indexOf(at));
    let next;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = items[(i - 1 + items.length) % items.length];
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'Home') next = items[0];
    else next = items[items.length - 1];
    for (const n of items) n.tabIndex = n === next ? 0 : -1;
    next.focus();
    return next;
  };

  // ---- discipline rail (T012; ui/cardrail.js register, rung 1 = plain
  // `.ob-play-card` buttons with the SAME data-ob/data-game hooks; both
  // registers wear the kit `.ob-card-option--card` part via decorateCard) --
  let rail = null;          // cardrail handle while the leaf is live
  let railSettled = false;  // the guarded import resolved (either way)
  let railEntries = new Map(); // id -> catalog entry (last render)
  let railSig = null;       // rung-1 id inventory (rebuild key)
  // arrow keys on the rail are BROWSE (contract §4 law 1: browsing is never
  // gated; the cardrail convention "selection follows focus" reads as the
  // browsed card here) — a commit is an ACTIVATION: pointer click or
  // Enter/Space. This flag tells the leaf's onSelect which one it saw.
  let keyBrowse = false;
  // BROWSE STATE is separate from SELECTION (GH-668 S5 play vfix1, verifier
  // F2): `browsed` = the id the play browse law currently highlights. A
  // PLAYABLE browse rides the leaf's own register (rail.select → aria-selected,
  // the G5 law); a READINESS (disabled) card is NEVER selected — it carries
  // the `data-ob-browsed="true"` marker instead (aria-selected stays false;
  // play.css paints the marker as the browse register until the kit part
  // owns one — kit follow-up). Every sync() re-renders from this state, so a
  // sync (ob:settings / ob:capability / ob:perftier / a locale swap) never
  // reverts a browse: before this the rail re-selected the committed game on
  // every sync, which snapped away from the browsed card and flipped the
  // Details body back (the pack's clipped de / zh-CN readiness stills). A
  // browse ends on an ACTIVATION (commitGame), when the committed game
  // changes under it, or when its id leaves the inventory.
  let browsed = null;
  let railGame = null;      // the committed game the rail last rendered
  let pressHeld = false;    // a pointer is down inside the rail (the press guard, r6b)
  let pressBrowse = null;   // the playable id browsed under that press — its leaf select deferred to the release
  games.addEventListener('keydown', (e) => {
    if (!ROVING_KEYS.includes(e.key)) return;
    if (rail) {
      // the leaf's own handler (registered after this one) consumes it;
      // onSelect clears the flag, and a TASK-level reset covers the paths
      // that never reach onSelect (a disabled card takes focus only). NOT
      // a microtask: the microtask checkpoint runs between two listeners
      // on the same node, so it would clear the flag before the leaf's
      // handler ran (found by the Phase-B smoke).
      keyBrowse = true;
      setTimeout(() => { keyBrowse = false; }, 0);
      return;
    }
    // the rung-1 register BROWSES exactly like the leaf's arrow keys (review
    // review r1 P2-1): the card the roving handler focused is
    // the browsed card — through the ONE browseTo() (marker / aria-selected
    // / Details), never a second state machine; before this the fallback
    // moved focus only and the Details body kept resolving the committed
    // game (a readiness card's prerequisites were unreachable there)
    const next = roveWithin(games, '[data-ob="play-game"]', e);
    if (next?.dataset.game) browseTo(next.dataset.game);
  });
  // the commit seam itself (contract §7 degrade row; review code review r4
  // P2-3): a fresh play.js over a STALE settings.js without `changeGame`
  // keeps the rail BROWSABLE (arrows, focus, provenance), but every playable
  // card reads aria-disabled="true" and an activation answers with the
  // shim's reload hint (`shell.place.play.shim.stale` — the S1 stub idiom,
  // spec §12 (d)) instead of a silent `false`.
  const canGame = () => typeof sapi()?.changeGame === 'function';
  const staleNotice = () => {
    try { shell.notice?.('shell.place.play.shim.stale'); } catch { /* seam absent */ }
  };
  const cardDisabled = (e) => e.readiness !== 'playable' || replayLocked() || !canGame();
  // the cardrail leaf swallows a disabled card's activation (browse only,
  // cardrail.js:176), so on that register the hint rides a delegated
  // listener; the rung-1 buttons reach commitGame, which answers itself
  games.addEventListener('click', (e) => {
    if (!rail || canGame()) return;
    const b = e.target?.closest?.('[data-ob="play-game"][data-playable="true"]');
    if (b && games.contains(b)) staleNotice();
  });
  // the leaf's focus-driven browse (cardrail.js onFocusIn → onBrowse) on the
  // rung-1 register: focus on ANY card — a Tab / Shift+Tab (every card is
  // tabbable while the leaf import is still pending), a programmatic
  // focus(), a pointer press — routes through the ONE browse-state update
  // (the COMMON BROWSE-STATE CONTRACT: marker / aria-selected / Details /
  // the keep follow the card holding focus). The superseded form browsed
  // DISABLED cards only (review r1 P2-1's readiness reach): Tabbing across
  // the playable cards moved focus while the Details body stayed on the
  // committed discipline's rulebook (GH-668 S5 play r6, review review r5 F2 +
  // the round-6 census (b): Tab / Shift+Tab / focus() / a press on this
  // register, both viewports).
  games.addEventListener('focusin', (e) => {
    if (rail || rehoming) return;
    const b = e.target?.closest?.('[data-ob="play-game"]');
    if (b && games.contains(b) && railEntries.has(b.dataset.game) && !heldRestore(b.dataset.game)) browseTo(b.dataset.game);
  });
  const railItemsFor = (m) => m.games.map((e) => ({
    id: e.id,
    label: () => gameName(e.id, e),
    chip: () => (e.readiness === 'playable' ? null : readinessBadge(e.readiness)),
    disabled: () => cardDisabled(e),
  }));
  /** the contract §3 hooks on ONE card node (cardrail or rung-1 button) */
  const decorateCard = (b, e, m) => {
    if (!b || !e) return;
    b.dataset.ob = 'play-game';
    b.dataset.game = e.id;
    b.dataset.playable = String(e.readiness === 'playable');
    b.setAttribute('aria-current', String(e.id === m.game));
    b.setAttribute('aria-disabled', String(cardDisabled(e)));
    // the browse marker of a READINESS card (vfix1 F2): browsed, never selected
    if (e.id === browsed && cardDisabled(e)) b.setAttribute('data-ob-browsed', 'true');
    else b.removeAttribute('data-ob-browsed');
    // the rung-1 register mirrors the leaf's aria-selected register (review
    // review r1 P2-1): the browsed PLAYABLE card, else the committed one —
    // the kit part paints it and the Details lookup reads the same truth;
    // the leaf owns the attribute on its own cards (rail.select)
    if (!b.classList.contains('ob-cardrail-card')) {
      const be = browsed !== null ? railEntries.get(browsed) : null;
      b.setAttribute('aria-selected', String(e.id === (be && !cardDisabled(be) ? browsed : m.game)));
    }
    // the kit `.ob-card-option--card` part (GH-668 B-PL08 / the design charter charter
    // row; S5 slice 3 G1): BOTH card registers wear it — the cardrail leaf's
    // card (its skin is caller-owned; classes are ADDED on leaf-owned nodes,
    // never reset, and the leaf's update() with an unchanged id inventory
    // never rebuilds) and the rung-1 button. The play-owned hooks
    // (`ob-play-card__*`) stay on the same nodes for the frozen contract §3
    // selectors and the e2e pins; the kit part owns material, radius,
    // registers (hover / active / current / disabled), focus composition
    // and the hint ink — play.css keeps only the rail's layout. The play hook
    // stays FIRST in each class list: the kit-law audit names a node by its
    // first class, and the KIT_LAW_OK ledger keys on those names.
    b.classList.add('ob-card-option', 'ob-card-option--card');
    b.querySelector('.ob-cardrail-name')?.classList.add('ob-play-card__name');
    b.querySelector('.ob-play-card__name')?.classList.add('ob-card-option__name');
    b.querySelector('.ob-cardrail-chip')?.classList.add('ob-badge', 'ob-card-option__badge');
    // the kit ANATOMY `__body > __head (__name + __badge) > __hint > __meta`
    // on both registers (GH-668 S5 slice 3 G4 / B-PL04): the part's --card
    // budget (name 2 + issuer 1 + edition 1 line at the sp-1 body gaps) is
    // DERIVED for that tree — as direct flex children of the button the
    // lines sat sp-3 apart and the reserve could never hold. The leaf's
    // name + meta (chip + tick) nodes move INTO the head once per card node;
    // the leaf reads them by querySelector (cardrail.js syncCard), never by
    // position, and its rebuild (a changed id inventory) hands fresh nodes
    // back through here.
    let cbody = b.querySelector(':scope > .ob-card-option__body');
    if (!cbody) {
      cbody = el('span', { class: 'ob-play-card__body ob-card-option__body' });
      const head = el('span', { class: 'ob-play-card__head ob-card-option__head' });
      for (const n of b.querySelectorAll(':scope > .ob-cardrail-name, :scope > .ob-play-card__name, :scope > .ob-cardrail-meta, :scope > .ob-cardrail-chip')) head.appendChild(n);
      cbody.appendChild(head);
      b.prepend(cbody);
    }
    // the leaf's meta row (chip + tick) stays a flex item while both are
    // hidden — a zero-width item that WRAPS under a 2-line name and costs
    // the head one 4 px row gap (the carom card read 100 px on the desktop
    // slot); hidden while it carries nothing visible, re-derived on every
    // decorate from the leaf's own chip / tick state
    const lmeta = b.querySelector('.ob-cardrail-meta');
    if (lmeta) lmeta.hidden = ![...lmeta.children].some((n) => !n.hidden);
    let prov = b.querySelector('.ob-play-card__prov');
    if (!prov) { prov = el('span', { class: 'ob-play-card__prov ob-card-option__hint' }); cbody.appendChild(prov); }
    let edition = b.querySelector('.ob-play-card__edition');
    if (!edition) { edition = el('span', { class: 'ob-play-card__edition ob-card-option__meta' }); prov.after(edition); }
    // Q2 default A: issuer hint + Intl edition meta; the `data-ob-citation`
    // switch on the section renders the S4 full line in the hint (answer B)
    const full = citationFull();
    prov.textContent = full ? provLine(e) : provIssuer(e);
    edition.textContent = full ? '' : provEdition(e);
    edition.hidden = full || !edition.textContent;
    let status = b.querySelector('.ob-play-card__status');
    if (!status) { status = el('span', { class: 'ob-play-card__status ob-card-option__hint' }); cbody.appendChild(status); }
    let pre = b.querySelector('.ob-play-card__prereqs');
    if (!pre) { pre = el('span', { class: 'ob-play-card__prereqs ob-card-option__hint' }); cbody.appendChild(pre); }
    // GH-668 S5 slice 3 G5 (B-PL07): the readiness card says its state ONCE
    // — the kit badge (`settings.gameBadge.<readiness>`) IS the status and the
    // kit `aria-disabled` register (0.38) is the muted voice; the status line
    // and the prerequisites paragraph are never painted on the card again
    // (`hidden`; the nodes + their text stay for the contract §3 pins — the
    // prerequisites render in the Details body when the card is browsed).
    // `.ob-badge--warn` is NOT used: amber is reserved for table cautions.
    status.hidden = true;
    pre.hidden = true;
    if (e.readiness === 'playable') {
      status.textContent = '';
      pre.textContent = '';
    } else {
      status.textContent = t('shell.place.play.notPlayable');
      // the pane's rule (settings.js:2386-2402): a prerequisite renders its
      // rulebook-derived `description` — catalog DATA like the provenance
      // line; only the heading is localized. NEVER the raw id (review visual
      // audit round 1, finding 4: `fixture-rules` read as an internal slug)
      const descs = (Array.isArray(e.prerequisites) ? e.prerequisites : [])
        .map((p) => (typeof p?.description === 'string' ? p.description.trim() : ''))
        .filter(Boolean);
      pre.textContent = descs.length ? `${t('settings.gamePrereqs')}: ${descs.join(' · ')}` : '';
    }
  };
  /** re-decorate EVERY card of the live register (leaf cards by the leaf's
   * data-id, rung-1 buttons by data-game) and re-render Details */
  const decorateRail = (m) => {
    for (const b of games.querySelectorAll(rail ? '.ob-cardrail-card' : '[data-ob="play-game"]')) {
      decorateCard(b, railEntries.get(rail ? b.dataset.id : b.dataset.game), m);
    }
    renderDetails(m);
  };
  /** the Details body follows the BROWSED card (the rail's aria-selected
   * card — browsing is never gated — else the current game); every line is
   * catalog DATA (English by design) behind a localized label; nothing is
   * written. Rendered on every sync and on every browse step. */
  const browsedEntry = (m) => {
    const sel = browsed ?? games.querySelector('[data-ob="play-game"][aria-selected="true"]')?.dataset.game ?? null;
    return m.games.find((e) => e.id === sel) ?? m.games.find((e) => e.id === m.game) ?? m.games[0] ?? null;
  };
  function renderDetails(m) {
    // the ACTIVE dictionary decides (hasLoc, r6): hidden — label and all —
    // when THIS dictionary lacks the key, whatever en carries
    const dict = hasLoc(detailsKey);
    details.hidden = !dict;
    detailsBody.hidden = !dict || !detailsOpen;
    const label = dict ? t(detailsKey) : '';
    if (detailsLab.textContent !== label) detailsLab.textContent = label;
    const e = browsedEntry(m);
    const lines = [];
    const cite = provLine(e);
    if (cite) lines.push(cite);
    const sections = e?.provenance?.sections;
    if (typeof sections === 'string' && sections.trim()) {
      lines.push(hasLoc('shell.place.play.details.sections') // the active dictionary's own prefix (r6)
        ? `${t('shell.place.play.details.sections')}: ${sections.trim()}` : sections.trim());
    }
    if (e && e.readiness !== 'playable') {
      const descs = (Array.isArray(e.prerequisites) ? e.prerequisites : [])
        .map((p) => (typeof p?.description === 'string' ? p.description.trim() : ''))
        .filter(Boolean);
      if (descs.length) lines.push(`${t('settings.gamePrereqs')}: ${descs.join(' · ')}`);
    }
    detailsBody.dataset.game = e?.id ?? '';
    // rebuild only when the text changed (a re-sync never churns the nodes)
    const sig = lines.join('\n');
    if (detailsBody.dataset.sig === sig) return;
    detailsBody.dataset.sig = sig;
    detailsBody.textContent = '';
    for (const line of lines) {
      const d = el('div', { class: 'ob-play-details__line' });
      d.textContent = line;
      detailsBody.appendChild(d);
    }
  }
  /** the cardrail leaf's LIVE selection (its own aria-selected register),
   * null when none survives the inventory — the keep of a READINESS browse */
  const leafSelected = () => {
    const id = games.querySelector('.ob-cardrail-card[aria-selected="true"]')?.dataset.id ?? null;
    return id !== null && railEntries.has(id) ? id : null;
  };
  /** the keep law's second half (GH-668 S5 play r5, review r4 F2 / census
   * (b) B6 + B9): a browsed card that is not WHOLE inside the rail's
   * scrollport is brought back by the nearest edge — instant, never a
   * second snap animation. `whenOutside` (a PLAYABLE browse) acts only on a
   * card ENTIRELY outside: the leaf's own smooth snap owns that card's rest
   * position and a sync landing mid-flight must not cut it short; a
   * READINESS card is never snapped by the leaf, so any partial clip is
   * corrected. Scroll-neutral when the card already stands whole. The
   * SLOT-RESTORE clause below reuses it for the COMMITTED card. */
  const revealBrowsed = (id, { whenOutside = false } = {}) => {
    let card = null;
    try { card = games.querySelector(`[data-ob="play-game"][data-game="${CSS.escape(id)}"]`); } catch { card = null; }
    if (!card || games.clientWidth === 0 || card.getClientRects().length === 0) return;
    const mr = games.getBoundingClientRect();
    const br = card.getBoundingClientRect();
    if (br.width <= 0 || mr.width <= 0) return;
    const pad = parseFloat(getComputedStyle(games).paddingLeft) || 0;
    const whole = br.left >= mr.left + pad - 0.5 && br.right <= mr.right - pad + 0.5;
    if (whole) return;
    if (whenOutside && br.right > mr.left && br.left < mr.right) return; // partly visible: the leaf's snap in flight
    const cardLeft = games.scrollLeft + (br.left - mr.left);
    const min = cardLeft + br.width - mr.width + pad; // its end at the far edge
    const max = cardLeft - pad;                        // its start at the near edge
    const left = min <= max ? Math.min(Math.max(games.scrollLeft, min), max) : max;
    games.scrollTo({ left, behavior: 'auto' });
  };
  // #992 (QA, ruling build 20; spec 034 FR-006): an activation RE-HOMES focus
  // onto the COMMITTED card before the confirm opens, so the dialog's close-
  // time focus restore lands there and a declined or refused switch never
  // re-browses the declined card (which read as selected, scrolled the
  // committed card out, and survived the table round trip). The re-home is
  // not a browse: both focus routes ignore it. Focus outside the rail (a
  // scripted pick) is left alone.
  let rehoming = false;
  const rehomeToCommitted = (gid) => {
    const ae = document.activeElement;
    if (!ae || !games.contains(ae)) return;
    let card = null;
    try { card = games.querySelector(`[data-ob="play-game"][data-game="${CSS.escape(gid)}"]`); } catch { card = null; }
    if (!card || card === ae || card.getClientRects().length === 0) return;
    rehoming = true;
    try { card.focus({ preventScroll: true }); } finally { rehoming = false; }
  };
  // the kit's peek-law SLOT lands AFTER a shell re-enter (fitPeek re-measures
  // on its ResizeObserver tick once the collapsed rail has width again — the
  // r5 probe on the phone: the exit collapses the rail to 0 × 0 and resets
  // its scroll; at re-enter +0 the slot still read 0px with 26 px cards, at
  // +50 ms 198 px, and the browser's scroll anchoring parked the rail at
  // 1030 where the browsed card had stood at 1592), so the reveal a sync
  // issued on the arrival frame measured a stale layout. The reveal re-runs
  // when the SLOT value changes — never on the fade's scroll-driven style
  // writes (a live smooth snap must not be cut short) — while a browse is
  // live. A kit without fitPeek writes no slot: the arrival reveal stands.
  // THE KEEP LAW's SLOT-RESTORE clause (GH-668 S5 play r7: review review r6
  // P2 on f819c812 + the integrator's ruling R1 + the round-7 census (g)).
  // The coarse cards take their width from `--sf-slot`, so every path that
  // HIDES the rail — Quick Play → reopen Play, a place switch away and back,
  // a shell exit + the reopen pill — collapses the cards to 0 px while
  // fitPeek writes `0px`, the scroll clamps to the start (Chrome's scroll
  // anchoring parked it at 206 px on the phone), and the restored `198px`
  // re-widens the cards with the rail still parked there; this observer
  // returned early on `browsed === null` and renderRail's same-id
  // `rail.select()` never re-snaps (a re-select of the same id is inert by
  // the leaf's own law), so a committed card past the first (one_pocket in
  // the middle, 10-Ball late) sat COMPLETELY offscreen after the re-enter
  // (census (g): 844 + 667 coarse × middle / last × every hide → show path,
  // whole 0; the base main 4325a610 keeps it visible — review r6,
  // browser-reproduced). The clause: after ANY slot / scrollport change the
  // COMMITTED card is restored whole by the nearest edge when no browse is
  // live (the browsed card's own geometry, instant), the BROWSED card when
  // one is (the r5 clause, unchanged); nothing under a held press (the
  // pointer-press guard — the next slot change outside a press restores).
  // The SYNC path is deliberately NOT a trigger: a store echo (ob:settings)
  // must never fight a user pan (the leaf's law); a slot change means the
  // scrollport itself moved. Rotate / resize keep the card through Chrome's
  // proportional anchoring (census (g): whole 1) — scroll-neutral there.
  if (typeof MutationObserver === 'function') {
    let lastSlot = games.style.getPropertyValue('--sf-slot');
    new MutationObserver(() => {
      const slot = games.style.getPropertyValue('--sf-slot');
      if (slot === lastSlot) return;
      lastSlot = slot;
      if (games.clientWidth === 0 || pressHeld) return; const arrived = parseFloat(slot) > 0 && takeArrivalSlot(); // #1156
      if (browsed !== null) {
        const be = railEntries.get(browsed);
        if (be) revealBrowsed(browsed, { whenOutside: !cardDisabled(be) && !arrived });
      } else if (railGame !== null && railEntries.has(railGame)) {
        revealBrowsed(railGame, { whenOutside: false }); // the committed card, whole
      }
    }).observe(games, { attributes: true, attributeFilter: ['style'] });
  }
  // GH-1085 KEY-REST LAW: a keyboard browse ends with the browsed card WHOLE.
  // On the leaf register an arrow press has two scroll writers — the
  // browser's focus scroll (the leaf focuses the next card) and the leaf's
  // eased snap. A second press landing while the first snap is still in
  // flight on a busy phone (the compositor runs the snap while the main
  // thread is starved) let the focus scroll jump on a stale view and the
  // compositor's progress land on top of it: the rail settled one card PAST
  // the focused card (scrollLeft 711-770 for a 618 rest, the presented card
  // 25-55 % visible), inside the proximity-snap dead zone, where neither the
  // browser nor the leaf moves it again (a re-select of the same id is inert
  // by the leaf's law; revealBrowsed above stands down on a partly visible
  // playable card because the snap "is in flight"). cardrail.js is frozen
  // (and shared with the atelier), so the law lives here: after every roving
  // key the rail is watched to REST — scrollLeft unchanged over three
  // animation frames (each runs after the compositor's progress is applied)
  // and no scroll event for 150 ms — and then the focused, browsed card is
  // restored whole through revealBrowsed (instant, the nearest edge).
  // Scroll-neutral whenever the card already stands whole (every normal
  // press). A pointer, wheel or touch inside the rail cancels the watch, so
  // it never fights a user pan; a newer press supersedes it; it gives up
  // after 3 s (a runaway never holds a loop).
  let keyRest = 0; // watch generation
  const cancelKeyRest = () => { keyRest += 1; };
  const watchKeyRest = () => {
    const gen = ++keyRest;
    let last = games.scrollLeft;
    let same = 0;
    let lastScroll = performance.now();
    const t0 = lastScroll;
    const onScroll = () => { lastScroll = performance.now(); };
    games.addEventListener('scroll', onScroll, { passive: true });
    const tick = () => {
      if (gen !== keyRest || performance.now() - t0 > 3000) {
        games.removeEventListener('scroll', onScroll);
        return;
      }
      const sl = games.scrollLeft;
      same = sl === last ? same + 1 : 0;
      last = sl;
      if (same >= 3 && performance.now() - lastScroll >= 150) {
        games.removeEventListener('scroll', onScroll);
        if (browsed === null || pressHeld) return;
        const at = document.activeElement?.closest?.('[data-ob="play-game"]');
        if (at && games.contains(at) && at.dataset.game === browsed) {
          revealBrowsed(browsed, { whenOutside: false });
        }
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  games.addEventListener('keydown', (e) => {
    if (rail && ROVING_KEYS.includes(e.key)) watchKeyRest();
  });
  for (const type of ['pointerdown', 'wheel', 'touchstart']) {
    games.addEventListener(type, cancelKeyRest, { capture: true, passive: true });
  }
  // rail edge fades: the kit ui/scrollfade.js INLINE law (GH-668 B-K04, S5
  // kit step 9) — attachScrollFade(games, { axis: 'inline' }) below, armed
  // with the body's block fade; the play-owned predicate + play.css mask
  // this module carried are gone (the kit writes the same truthful
  // data-ob-fade-start / -end and masks the paint-less scrollport).
  function renderRail(m) {
    railEntries = new Map(m.games.map((e) => [e.id, e]));
    const items = railItemsFor(m);
    // the browse ends when its id leaves the inventory or the committed
    // game changes under it (a commit, an external changeGame) — on BOTH
    // registers (review r1 P2-1: the rung-1 buttons browse too)
    if (browsed !== null && !railEntries.has(browsed)) browsed = null;
    if (railGame !== m.game) { railGame = m.game; browsed = null; }
    if (rail) {
      rail.update(items);
      // select = state only (never emits); snaps the card into view once the
      // mount has layout (a hidden mount is re-selected on arrival).
      // THE KEEP LAW (GH-668 S5 play r5, review review r4 F2 + the round-5
      // census (b) — EVERY sync path funnels through here: ob:settings /
      // ob:capability / ob:perftier, a locale repaint, setPlace('play') on
      // a shell re-enter, __play.refresh / previewCatalog / previewCitation,
      // the commitVariant / commitCarom2b / doBack syncs, the leaf's
      // arrival): while a browse is LIVE the rail keeps the BROWSED card. A
      // PLAYABLE browse keeps the leaf's aria-selected on the browsed card
      // (a re-select of the same id never re-snaps, so the sync is
      // scroll-neutral). A READINESS browse is the marker only and the leaf
      // never selects a disabled card — so its keep is the leaf's LIVE
      // selection, whatever the user left it on (the committed card after
      // End straight from it; the browsed playable card after ArrowRight →
      // End), never m.game. The superseded form — `keep = m.game` under a
      // readiness browse ("the selection stays committed") — re-selected the
      // committed card under that sequence and rail.select snapped the rail
      // back to it while focus and the Details body stayed on the
      // now-invisible readiness card (review r4 F2, browser-reproduced; the
      // census measured every sync path re-snapping 1322 → 133 / 1592 →
      // 206 with the card's whole fraction 1 → 0). The committed card is
      // the keep ONLY when no browse is live. After the select the browsed
      // card is kept whole inside the scrollport (revealBrowsed: a shell
      // re-enter or the leaf's first present can leave it outside while the
      // same-id select is inert).
      // THE POINTER-PRESS GUARD's KEEP CLAUSE (GH-668 S5 play r6c: the
      // round-6b checker's P2 on 8dc48580 + the integrator's ruling R1 +
      // the round-6c census (e)). While a pointer press holds a DEFERRED
      // browse (pressHeld && pressBrowse !== null) the keep is the leaf's
      // LIVE selection — whatever aria-selected the user left it on — and
      // nothing is selected, revealed or snapped: on 8dc48580 a sync landing
      // inside the hold (every path of the census (b) list — __play.refresh,
      // a locale repaint, ob:settings / ob:capability / ob:perftier, the
      // setPlace re-enter, previewCatalog; the paint-only ob:settings
      // rebroadcasts from playback.js / flow.js / the rerackKind probe ride
      // the same wire) took the browsed id as its keep and rail.select ran
      // the very snap the guard had deferred — the rail moved 0 → 90 → 133
      // px (trailing) / 309 → 133 (leading) under the held mouse and the
      // release activated nothing (the round-6 symptom through the sync
      // path). The deferred browse still runs ONE task after the release
      // exactly as the guard defines (an activated press never snaps; a
      // declined confirm's focus restore lands on the COMMITTED card, #992).
      // The reveal is skipped under ANY held press: a READINESS browse never
      // defers (the leaf never selects a disabled card) but its keep's
      // partial-clip correction is a scroll too — the census (e) readiness
      // row jumped the rail under a held mouse on a half-visible fixture
      // card. Keyboard / programmatic entries and every sync outside a held
      // press are unchanged. The clause holds ON BOTH REGISTERS (r6d: the
      // round-6c checker's P2 on 235a2dab + the integrator's ruling R1 —
      // the rung-1 branch below skips its reveal under a held press too).
      // The DEFERRED window is the held press's OWN browse (r6d, ruling R2:
      // `browsed === pressBrowse`): a browse that ended or moved on under
      // the hold — a commit, a browse of another card through a non-pointer
      // entry — falls back to the normal keep on that sync instead of
      // leaving the leaf's aria-selected on the stale id until the next
      // sync outside a press. No pointer path produces a commit mid-hold
      // (the activation runs on the release's click); the term is defensive.
      const be = browsed !== null ? railEntries.get(browsed) : null;
      const deferred = pressHeld && pressBrowse !== null && browsed === pressBrowse;
      const keep = be && !cardDisabled(be) ? browsed
        : be ? (leafSelected() ?? m.game)
          : m.game;
      // decorateRail BEFORE the reveal (r7 census (g): the leaf ARRIVAL under
      // a readiness browse). On a TRUE rebuild — the leaf landing over the
      // rung-1 register, an inventory change — the fresh leaf cards carry no
      // data-ob / data-game until decorateCard paints them, so the reveal's
      // lookup found no card and the first present's instant snap to the
      // committed keep left the browsed fixture out of view (844: sl 0 with
      // the fixture at 1675 px; the middle / last rows alike). Order only:
      // decorateCard paints attributes and the marker, never scrolls.
      if (games.clientWidth > 0) {
        if (deferred) rail.refresh(); // the keep IS the leaf's live selection
        else rail.select(keep);
        decorateRail(m);
        if (be && !pressHeld) revealBrowsed(browsed, { whenOutside: !cardDisabled(be) });
      } else {
        rail.refresh();
        decorateRail(m);
      }
      return;
    }
    // rung 1 (or the leaf still pending): plain button register, rebuilt
    // ONLY when the id inventory changes (focus never churns on a re-sync)
    const sig = items.map((it) => it.id).join('|');
    if (sig !== railSig) {
      railSig = sig;
      games.textContent = '';
      // the ARIA pair of the leaf register (ui/cardrail.js mount = listbox,
      // card = option) restated here (review r1 checker P3): decorateCard
      // mirrors aria-selected onto these buttons, and that attribute is
      // valid on an option inside a listbox only
      games.setAttribute('role', 'listbox');
      for (const it of items) {
        const b = el('button', { type: 'button', class: 'ob-play-card', role: 'option' }); // decorateCard adds the kit part
        const name = el('span', { class: 'ob-play-card__name' });
        const badge = el('span', { class: 'ob-badge ob-cardrail-chip', hidden: true });
        b.append(name, badge);
        // the leaf's activation law on the rung-1 register (review r1 P2-1):
        // a DISABLED card (readiness / lock / stale seam) is browse-only —
        // browseTo + the stale-seam hint the delegated listener above raises
        // for the leaf; a playable card reaches commitGame
        b.addEventListener('click', () => {
          const en = railEntries.get(it.id);
          if (en && cardDisabled(en)) {
            browseTo(it.id);
            if (en.readiness === 'playable' && !canGame()) staleNotice();
            return;
          }
          void commitGame(it.id);
        });
        games.appendChild(b);
      }
    }
    const btns = [...games.children];
    items.forEach((it, i) => {
      const b = btns[i];
      const e = railEntries.get(it.id);
      b.querySelector('.ob-play-card__name').textContent = it.label();
      const chip = b.querySelector('.ob-cardrail-chip');
      const chipText = it.chip();
      chip.hidden = !chipText;
      chip.textContent = chipText ?? '';
      decorateCard(b, e, m);
      // roving tab stop = the current card while the leaf is settled as
      // absent; every card tabbable while the import is still pending
      b.tabIndex = railSettled ? (it.id === m.game ? 0 : -1) : 0;
    });
    if (railSettled && !btns.some((b) => b.tabIndex === 0) && btns[0]) btns[0].tabIndex = 0;
    // the keep law's reveal on this register too (the browse is focus-driven
    // here; a shell re-enter can still leave the browsed card outside) —
    // skipped under a HELD press exactly as the leaf branch's (the keep
    // clause above, r6d: on 235a2dab a sync landing inside a held mouse
    // press on the half-visible fallback button — `__play.refresh()`,
    // `ob:settings` — ran this reveal and scrolled the button whole under
    // the pointer, 0 → 133 px, and the release landed on the scrollfade:
    // no click, no confirm; the leaf branch had been cured in r6c). The
    // next sync outside a press corrects the clip as before.
    if (browsed !== null && !pressHeld && games.clientWidth > 0) revealBrowsed(browsed, { whenOutside: false });
  }
  // the leaf import — starts NOW so a healthy boot has it by the css load
  const railLeaf = import('./ui/cardrail.js')
    .then((mod) => (typeof mod.createCardRail === 'function' ? mod : null))
    .catch(() => null);
  /** re-seat focus after the rung-1 → cardrail upgrade (review code review,
   * fix round 1 P2-1): the same-id card, else the current card, else the
   * roving stop; the play browse law makes the highlight follow focus (and
   * snaps the card into view) when it is not the current game. */
  const reseatRailFocus = (id) => {
    const m = model();
    const cards = [...games.querySelectorAll('[data-ob="play-game"]')];
    const card = cards.find((b) => b.dataset.game === id)
      ?? cards.find((b) => b.dataset.game === m.game)
      ?? cards.find((b) => b.tabIndex === 0) ?? null;
    if (!card) return;
    card.focus({ preventScroll: true });
    if (rail && card.dataset.game !== m.game) browseTo(card.dataset.game);
  };
  /** the play browse law's ONE entry (vfix1 F2): a playable card is browsed
   * through the leaf's register (aria-selected); a readiness card through the
   * marker only (decorateRail paints it) — never rail.select on a disabled id */
  const browseTo = (id) => {
    const e = railEntries.get(id);
    if (!e) return;
    browsed = id;
    // register-agnostic (review r1 P2-1): the leaf's own aria-selected for a
    // playable browse; the rung-1 buttons take theirs from decorateCard.
    // Under a HELD pointer the leaf's select (and its snap) is deferred to
    // the release (the pointer-press guard below, r6b)
    if (rail && !cardDisabled(e)) {
      if (pressHeld) pressBrowse = id;
      else rail.select(id);
    }
    decorateRail(model());
  };
  // THE POINTER-PRESS GUARD (GH-668 S5 play r6b: the round-6 checker's P1 +
  // the integrator's ruling R1 + the round-6b census (c)). A pointer press on
  // a card is a focus and focus is a browse (the common browse-state
  // contract above), but the browse's SNAP — browseTo → rail.select → the
  // leaf's smooth centering — ran DURING the press: on 17f4d9f4 a mouse
  // press on the trailing half-visible leaf card (1024 fine) scrolled the
  // rail 90 → 133 px under the held pointer within 250 ms, and a release
  // after that landed on the scrollfade — no click, no confirm, no commit
  // (the census: every hold ≥ ~150 ms on a half-visible card lost its
  // activation; a quick click survived with a jank). The law: a POINTER
  // press never moves the rail under the pointer. While a pointer is held
  // inside the rail (pointerdown here → pointerup / pointercancel /
  // lostpointercapture / a window blur, listened at the window — touch
  // included) browseTo updates the browse STATE (browsed, the marker, the
  // rung-1 mirror, Details) and DEFERS the leaf's select; the deferred id is
  // selected (and snapped) ONE TASK after the release — after the click that
  // release dispatches has run its activation. An activated press therefore
  // never snaps (commitGame ends the browse first); a declined confirm
  // restores focus onto the COMMITTED card (commitGame re-homes it before the
  // confirm opens — #992, superseding r6b's re-browse of the pressed card), so
  // nothing moves under the pointer and the declined card is not re-selected.
  // Keyboard and programmatic entries
  // are untouched (no pointer is held: the select runs inline as before).
  // On touch the compat mousedown (the focus) follows the touchend, so the
  // guard is already released there — the touch path is unchanged.
  // cardrail.js is frozen: the guard lives here, around the ONE browseTo.
  games.addEventListener('pointerdown', () => { pressHeld = true; }, { capture: true, passive: true });
  const pressEnd = () => {
    if (!pressHeld) return;
    pressHeld = false;
    const id = pressBrowse;
    pressBrowse = null;
    if (id === null) return;
    setTimeout(() => { // one task later: the release's click has run
      if (pressHeld || browsed !== id || !rail) return;
      const e = railEntries.get(id);
      if (e && !cardDisabled(e) && games.clientWidth > 0) rail.select(id);
    }, 0);
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    window.addEventListener(type, pressEnd, { capture: true, passive: true });
  }
  window.addEventListener('blur', pressEnd);
  railLeaf.then((mod) => {
    railSettled = true;
    if (mod) {
      // the leaf may land AFTER the RAIL_LEAF_WAIT_MS fallback mounted the
      // rung-1 register with the user's focus already on one of its buttons
      // — createCardRail() empties the mount, so focus would fall to <body>
      // before rail.update() could see it (review code review, fix round 1
      // P2-1). Remember the focused game id and re-seat it after the first
      // rail render below.
      const focusId = games.contains(document.activeElement)
        ? (document.activeElement.closest?.('[data-game]')?.dataset.game ?? null)
        : null;
      railSig = null;
      rail = mod.createCardRail(games, {
        items: [],
        selectedId: null,
        onSelect: (id) => {
          if (keyBrowse) { // browse: the highlight follows focus, no commit
            keyBrowse = false;
            browseTo(id);
            return;
          }
          void commitGame(id);
        },
        // the leaf's focus-driven browse (cardrail.js onFocusIn fires it for
        // ANY card; activate() fires it for a disabled card in place of
        // onSelect): EVERY card routes through the ONE browse-state update —
        // a READINESS (disabled) card lands on the `data-ob-browsed` marker
        // (NEVER a select on a disabled id — vfix1 F2) with its prerequisites
        // in Details (GH-668 S5 slice 3 G5, B-PL07); a PLAYABLE card lands on
        // the leaf's own aria-selected register (browseTo → rail.select), so
        // Shift+Tab from a browsed readiness card back onto the selected
        // playable card, a programmatic focus() and a pointer press all move
        // Details + the marker with focus. The superseded filter (`if
        // (!cardDisabled(e)) return`) left the marker and the Details body on
        // the readiness card after that Shift+Tab (GH-668 S5 play r6, review
        // review r5 F2 + the round-6 census (b)). An activation on a
        // readiness card does nothing else: no commit, no selection change;
        // playable cards keep the onSelect path above (keyBrowse / commit).
        onBrowse: (id) => {
          if (rehoming || heldRestore(id)) return; // #992 re-home, #1160 confirm restore: neither is a browse
          if (railEntries.has(id)) browseTo(id);
        },
        reducedMotion,
      });
      if (mounted) sync();
      if (focusId !== null) reseatRailFocus(focusId);
      return;
    }
    if (mounted) sync();
  });

  // ---- variant citation list (T014; FR-008) ------------------------------
  // rows come from `__settings.variantRows(gameId)` (settings-owned data,
  // plan ruling P3 — lands in 034a-mig T009; absent/null ⇒ rung 5 hidden,
  // the whole 034a-front window). The `variantCard` anatomy is relocated
  // verbatim from settings.js:2496-2527; the row is rebuilt ONLY when the
  // (game | ids) inventory changes so a re-sync never churns focus.
  let varSig = null;
  variants.addEventListener('keydown', (e) => {
    if (!ROVING_KEYS.includes(e.key)) return;
    roveWithin(variants, '[data-variant-pick]', e);
  });
  function renderVariants(m) {
    const rows = m.canVariant ? m.variants : null;
    // a list of ONE is not a list (GH-668 S5 slice 3 G5 / B-PL06 said-once):
    // a single-preset family shows no Rules heading and no pick — the card's
    // edition meta carries the preset; `registry().variants` still reports
    // the row (the pins read the model, not the paint)
    const show = !!rows && rows.length >= 2;
    hRules.hidden = !show;
    variants.hidden = !show;
    if (!show) { variants.textContent = ''; varSig = null; return false; }
    const sig = [m.game, ...rows.map((r) => r.id)].join('|');
    if (sig !== varSig) {
      varSig = sig;
      variants.textContent = '';
      for (const r of rows) {
        // the kit `.ob-card-option` ROW form on the pick control (GH-668
        // B-PL08, S5 slice 3 G1): `__body > __head (__name + __badge) > __hint`
        // is the part's anatomy — the play hooks (`.ob-eq-prov-row__name`,
        // `.ob-variant-row__label`, `.ob-eq-prov-row__desc`) stay on the same
        // nodes (contract §3 pins read them by querySelector); the row div
        // keeps its frozen `data-variant` / `aria-current` hooks and no skin.
        const vRow = el('div', { class: 'ob-eq-prov-row ob-variant-row', 'data-variant': r.id });
        const pick = el('button', { type: 'button', class: 'ob-eq-prov-row__pick ob-card-option',
          'data-variant-pick': r.id });
        const body = el('span', { class: 'ob-card-option__body' });
        const name = el('span', { class: 'ob-eq-prov-row__name ob-card-option__head' });
        const label = el('span', { class: 'ob-variant-row__label ob-card-option__name' });
        const badge = el('span', { class: 'ob-badge ob-card-option__badge' });
        name.append(label, badge);
        const desc = el('span', { class: 'ob-eq-prov-row__desc ob-card-option__hint' });
        body.append(name, desc);
        pick.append(body);
        pick.addEventListener('click', () => { commitVariant(r.id); });
        vRow.appendChild(pick);
        variants.appendChild(vRow);
      }
    }
    const nodes = [...variants.children];
    rows.forEach((r, i) => {
      const vRow = nodes[i];
      const pick = vRow.firstElementChild;
      vRow.setAttribute('aria-current', String(r.current === true));
      // MIRRORED onto the control so the kit's `[aria-current="true"]`
      // register paints the pick itself (the div keeps the frozen hook)
      pick.setAttribute('aria-current', String(r.current === true));
      pick.querySelector('.ob-variant-row__label').textContent = r.label ?? r.id;
      const badge = pick.querySelector('.ob-badge');
      badge.className = 'ob-badge ob-card-option__badge' + (r.tier === 'primary' ? ' ob-badge--accent' : '');
      badge.textContent = tierBadge(r.tier);
      pick.querySelector('.ob-eq-prov-row__desc').textContent = r.desc ?? ''; // citation
      pick.setAttribute('aria-disabled', String(m.locked));
      pick.tabIndex = r.current === true ? 0 : -1; // roving: the current row
    });
    if (!nodes.some((n) => n.firstElementChild.tabIndex === 0) && nodes[0]) {
      nodes[0].firstElementChild.tabIndex = 0;
    }
    return true;
  }
  // ---- the summary node under the host: ruling R7 vs the DEGRADED registers
  // (GH-668 S5 play review review r2, P2-1) ----------------------
  // R7 stands for the NORMAL register: never a Game / Rules summary beside a
  // visible multi-row picker — the card says the game, the aria-current row
  // says the preset. The picker-less registers are the the ownership ledger working-
  // degradation contract (:50-53 — a stale settings module without the
  // `variantRows` seam, the rules catalog import failing, the fail-closed
  // snooker chain leaving ONE offered row): there the ACTIVE preset (a
  // persisted apa-8ball; the lone offered core row) was said NOWHERE while
  // the card and Details cite the catalog's rulebook. So on a degraded
  // register (no picker rendered, or ≤ 1 offered row) the S1 summary's Rules
  // line IS the one saying — a compact current-preset line (play.css: the
  // kit text register --ob-fs--1 / --ob-text-1; the Game line stays hidden),
  // built from S1 keys only (`shell.card.rules`, `settings.variant.<id>` —
  // present in every dictionary the play place can meet, so no new key to
  // hasLocal()-gate; a row label the dictionary lacks falls back to its id
  // upstream). NOTHING TO NAME — no offered row AND no pin (a fresh
  // nine_ball: the family's rulebook on the card is the statement) — keeps
  // the summary hidden, so the boot frame is unchanged. FR-004's text reads
  // survive on both paths: the Game line stays rendered; the Rules value is
  // the said preset, else `variantName(variant)` (the null → variantDefault
  // map). e2e-play P-ONCE-DEGRADE stages the three registers at the network.
  function renderSummary(m, pickerShown) {
    const rows = m.canVariant ? m.variants : null;
    let said = null;
    if (!pickerShown) {
      if (rows && rows.length === 1) {
        // a lone row without a label (a foreign / stale settings module):
        // the pinned preset's name, else the row's id — never a hidden
        // summary with an active preset unsaid (review-r2 fix check P3)
        const row = rows.find((r) => r.current === true) ?? rows[0];
        said = row.label || (m.variant !== null ? variantName(m.variant) : row.id);
      } else if (m.variant !== null) said = variantName(m.variant);
    }
    if (said !== null) rLine.v.textContent = said;
    summary.hidden = said === null;
  }
  /** the `[data-variant-pick]` path: alias-aware `row.value || null`
   * (settings.js:2612 law — never the bare id; review round 2 P2-2); never
   * exits (shot 0 ⇒ same-seed in-place rerack, settings-owned) */
  function commitVariant(pid) {
    const m = model();
    if (!m.canVariant || !m.variants) return false;
    const row = m.variants.find((r) => r.id === pid) ?? null;
    if (!row) return false;
    if (!gate()) { sync(); return false; }
    let ok = false;
    try { ok = sapi().changeVariant(m.game, row.value || null) === true; }
    catch { ok = false; }
    // FR-008 shot > 0 feedback (review code review r3 P2-2): settings.js's
    // changeVariant hands `settings.variantNextRack` to the HUD hint, which
    // is hidden under the open shell and expires on its own — the deferred
    // change surfaces through the shell's notice register as well (the
    // commitCarom2b idiom below). A re-pick of the current row is not a
    // change (settings returns true without a rerack or a hint) — no notice.
    if (ok && row.current !== true && game && game.shotIndex > 0) {
      try { shell.notice?.('settings.variantNextRack'); } catch { /* seam absent */ }
    }
    sync();
    return ok;
  }
  // ---- carom second-ball fork (T015; FR-009) -----------------------------
  // USER-CHANGE path only (review round 4 P1-2): the boot-time / broadcast
  // application `ctx.game.setCaromSecondBall(v.caromSecondBall)` stays in
  // settings.js sync() (:3073) — a straight-to-AIM boot never mounts play.
  const caromRadios = {};
  const caromTexts = {}; // the segment label spans — painted by renderCarom (no data-i18n)
  for (const v of ['yellow', 'marked']) {
    const lab = el('label');
    const inp = el('input', { type: 'radio', name: 'ob-play-carom2b', value: v });
    // G2 (B-PL01): the noun key when the dictionary carries the split (see
    // the host); the text lands in renderCarom, re-evaluated on every sync
    const txt = el('span');
    lab.append(inp, txt);
    caromInner.appendChild(lab);
    caromRadios[v] = inp;
    caromTexts[v] = txt;
    inp.addEventListener('change', () => { if (inp.checked) commitCarom2b(v); });
  }
  // the shell's card long-press (shell.js FR-007(2)) arms on ANY pointerdown
  // inside the section that is not on a <button> — a held radio/label (a
  // coarse pointer holds to be sure) would fire quick-play and CLOSE the
  // shell instead of operating the setting (review code review, fix round 1
  // P2-2). The radiogroup ends the pointerdown's bubble here; click/change
  // and the shell's capture-phase window gate are untouched.
  caromInner.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
  // kit upgrade of the INNER wrapper (rung 2 = plain radios); the class
  // never sits on the hidden host (review round 1 P1-2)
  import('./ui/controls.js')
    .then((kit) => { kit.upgradeSegmented?.(caromInner); })
    .catch(() => { /* rung 2: plain radios */ });
  function renderCarom(m) {
    carom.hidden = !(m.game === 'carom_3cushion' && m.canCarom);
    caromInner.setAttribute('aria-label', t('settings.caromSecondBall'));
    // the GH-667 copy guard, evaluated NOW (review r1 P2-2): labels, hint and
    // the describedby wiring follow the ACTIVE dictionary on every sync (a
    // locale change re-syncs); writes only on change (the kit segment's
    // MutationObserver re-measures on a text write)
    const split = carom2bSplit();
    for (const [v, txt] of Object.entries(caromTexts)) {
      const s = t(carom2bKey(v, split));
      if (txt.textContent !== s) txt.textContent = s;
    }
    const hint = split ? t('shell.place.play.carom2b.hint') : '';
    if (caromHint.textContent !== hint) caromHint.textContent = hint;
    caromHint.hidden = !split;
    if (split) caromInner.setAttribute('aria-describedby', caromHint.id);
    else caromInner.removeAttribute('aria-describedby');
    for (const [v, inp] of Object.entries(caromRadios)) {
      inp.checked = v === m.carom2b;
      inp.setAttribute('aria-disabled', String(m.locked)); // never native disabled
    }
  }
  /** settings.js:3092-3101 relocated with ONE substitution: the shot > 0
   * hint rides `shell.notice('settings.variantNextRack')` — the R0 shellCtx
   * has no `hud` and the HUD is hidden under the open shell (review r1 P2-3) */
  function commitCarom2b(v) {
    const s = sapi();
    const val = v === 'marked' ? 'marked' : 'yellow';
    if (typeof s?.set !== 'function' || !gate()) { sync(); return false; }
    s.set('caromSecondBall', val);
    game?.setCaromSecondBall?.(val);
    if (s.get?.().game === 'carom_3cushion' && game) {
      if (game.shotIndex === 0) game.rerack(game.seed);
      else { try { shell.notice?.('settings.variantNextRack'); } catch { /* seam absent */ } }
    }
    sync();
    return true;
  }
  // ---- back-to-play leg (T016; FR-013/FR-014) ----------------------------
  // visible iff mode !== 'play' (and the changeMode seam exists — rung 5);
  // the place-side decision gate refuses playground→play under a pending
  // decision on a progressed rack (the settings.js-side guard is 034a-mig
  // T008); `prev === 'playground'` re-racks ⇒ exitToTable (D14 analog);
  // from `practice` the drill stops inside changeMode and the shell stays.
  function renderBack(m) {
    back.hidden = !(m.canMode && m.mode !== 'play');
    back.setAttribute('aria-disabled', String(m.locked));
  }
  /** keyboard focus stop on the non-exiting path (review code review r4
   * P2-2): `changeMode('play')` broadcasts `ob:settings` synchronously and
   * sync() hides this button while it is the focused element — from
   * `practice` the shell stays open (FR-013), so focus would fall to <body>
   * (or rest on an invisible node). Re-homed BEFORE the call to the rail's
   * roving tab stop = the current discipline card (the play card's primary
   * control; the first visible card when no stop is set), else the
   * DISCIPLINE heading. A refused change hands focus back to Back. */
  const rehomeFocus = () => {
    const cards = [...games.querySelectorAll('[data-ob="play-game"]')]
      .filter((b) => b.getClientRects().length > 0);
    const target = cards.find((b) => b.tabIndex === 0) ?? cards[0] ?? null;
    if (target) { target.focus({ preventScroll: true }); return; }
    hChoose.tabIndex = -1;
    hChoose.focus({ preventScroll: true });
  };
  function doBack() {
    const m = model();
    if (!m.canMode) return false;
    if (!gate()) return false;
    const prev = m.mode;
    const hadFocus = back.contains(document.activeElement);
    if (hadFocus) rehomeFocus();
    let ok = false;
    try { ok = sapi().changeMode('play') === true; } catch { ok = false; }
    if (!ok && hadFocus && !back.hidden) back.focus({ preventScroll: true });
    if (ok && prev === 'playground') {
      try { shell.exitToTable?.({ activated: true }); } catch { /* seam absent */ }
    }
    sync();
    return ok;
  }
  back.addEventListener('click', () => { doBack(); });

  // ---- discipline commit (T013; contract §4 laws 1-3, D14 place analog) --
  // #987 (build 20): ONE commit until its confirm is presented. Between the
  // activation and the confirm (changeGame's guarded import of the kit
  // dialog) nothing covers the rail: the second click of a double-click, or
  // a press on the next card, would start a second changeGame and stack a
  // second confirm whose accept switches again. A press inside that window
  // is the activation's continuation — refused, its browse cleared, focus
  // re-homed onto the committed card (the #992 law). Once a surface is
  // presented ('ob:presented', ui/dialog.js) its backdrop and the shell's
  // continuation guard own the press, and the latch stands down; it also
  // stands down COMMIT_LATCH_MS after the activation (a stale dialog leaf
  // that never announces, the window.confirm fallback), so a switch that
  // outlives its confirm never wedges the rail.
  const COMMIT_LATCH_MS = 1000, evStamp = () => { const now = performance.now(), ts = window.event?.timeStamp; return ts > now - 60000 && ts <= now + 50 ? ts : now; }; // the activation's own time (the shell guard's timebase)
  let committing = null; // { t, presented, prev, id }: from the activation to changeGame's verdict
  window.addEventListener('ob:presented', (e) => { if (committing) { committing.presented = true; committing.panel ??= e.detail?.panel ?? null; } }); // #1160: the confirm's panel
  async function commitGame(id) {
    if (committing && !committing.presented && evStamp() - committing.t < COMMIT_LATCH_MS) {
      browsed = null; rehomeToCommitted(model().game); sync(); return false;
    }
    const m = model();
    const e = m.games.find((x) => x.id === id) ?? null;
    browsed = null; // an ACTIVATION ends the browse (declined ⇒ the persisted game re-selects)
    // readiness cards and fixture cards NEVER reach changeGame (law 7)
    if (!e || e.readiness !== 'playable' || isFixture(id)) return false;
    if (!m.canGame) { staleNotice(); return false; } // stale seam (r4 P2-3)
    const prev = m.game;
    rehomeToCommitted(prev); // #992: the confirm records the committed card as its focus return
    const settleBack = () => { // declined / refused ⇒ the committed card is the selection, whole in the rail
      sync(); rehomeToCommitted(model().game); // #1160: a restore held on the activated card comes home
      // instant and idempotent, whatever the leaf's own select did (a touch press leaf-selects the pressed card)
      if (!pressHeld && games.clientWidth > 0) revealBrowsed(model().game, { whenOutside: false });
    };
    if (!gate()) { settleBack(); return false; }
    let ok = false;
    const commit = { t: evStamp(), presented: false, panel: null, prev, id }; // #1160: the confirm, the committed and the activated card
    committing = commit;
    try { ok = (await sapi().changeGame(id)) === true; } // NO skipConfirm (ruling 6)
    catch { ok = false; }
    finally { if (committing === commit) committing = null; }
    if (ok && id !== prev) {
      // GH-682 review r2: the confirm's accept is a user gesture, but this
      // runs after the await — outside any event dispatch — so the exit is
      // told so (a WebKit tap leaves nothing focused for the shell to read)
      try { shell.exitToTable?.({ activated: true }); } catch { /* seam absent */ }
    }
    if (ok) sync();
    else settleBack(); // declined/refused ⇒ the card re-selects the persisted game
    return ok;
  }
  // #1160: an ACCEPTED hall switch scrolled the rail back to the previously
  // committed card. #992's re-home makes that card the confirm's focus
  // return, and the dialog's close-time restore focuses it with no
  // preventScroll while the switch is still applying: play learns the
  // verdict only once the table is ready, about 2 s later. ui/dialog.js
  // announces that restore ('ob:restore', right before its focus call), and
  // only the announced restore of this commit's confirm onto the committed
  // card is held, once: a key or a pointer that lands on that card while the
  // switch is still pending (no overlay: its leaf failed or its cap expired)
  // is the user's own browse (review P1). The held restore's focusin runs
  // before its scroll into view: one microtask later the rail goes back
  // where it stood then, and focus moves onto the activated card, whole. A
  // decline or refusal whose restore came first (Escape, a backdrop click,
  // reduced motion) is undone by settleBack's re-home. A dialog.js that
  // announces nothing (a mixed cache) holds nothing: the rail scrolls back
  // as before #1160.
  let restoreMark = null; // the announced restore's target, until the dialog's close step ends
  window.addEventListener('ob:restore', (e) => {
    const c = committing;
    if (!c?.panel || e.detail?.panel !== c.panel) return;
    restoreMark = e.detail.target ?? null;
    queueMicrotask(() => { restoreMark = null; }); // the focus call runs before this, in the same step
  });
  function heldRestore(gid) {
    const c = committing;
    const mark = restoreMark;
    if (!c?.presented || gid !== c.prev || c.id === c.prev || !mark || !games.contains(mark) || mark.dataset?.game !== gid) return false;
    restoreMark = null; // one restore, held once
    const before = games.scrollLeft; // the rail as it stood when the restore's focus landed
    queueMicrotask(() => {
      if (committing !== c || games.clientWidth === 0) return; // settled meanwhile: settleBack or the exit owns it
      let card = null;
      try { card = games.querySelector(`[data-ob="play-game"][data-game="${CSS.escape(c.id)}"]`); } catch { card = null; }
      if (card && card.getClientRects().length > 0 && games.contains(document.activeElement)) {
        rehoming = true;
        try { card.focus({ preventScroll: true }); } finally { rehoming = false; }
      }
      games.scrollTo({ left: before, behavior: 'auto' });
      if (!pressHeld) revealBrowsed(c.id, { whenOutside: false }); // whole, if the activation caught it mid-snap
    });
    return true;
  }

  // ---- the STALE-KIT PART PROBE (GH-668 S5 play r5, review review r4 F1 +
  // the round-5 census (a)): the cards and the picks are kit
  // `.ob-card-option` parts; on the supported mixed-cache pairing — a fresh
  // play.js + play.css over a cached PRE-PART kit.css — every register ONLY
  // the part paints was lost (the aria-current pick, the committed card
  // under a live playable browse, the locked pick's 0.38), so picking APA
  // changed the persisted pin with nothing visible moving. The part is
  // FEATURE-DETECTED, never assumed from a version: the computed
  // `--ob-card-option-reserve` on a rail card (the one custom property the
  // B-K12 `--card` rule defines) reads empty when the part is absent — a
  // pre-part sheet or a kit 404 alike — and the host then carries
  // `data-ob-part-fallback="card-option"`, the marker play.css keys its
  // narrow restatement of the part's CURRENT / DISABLED faces on (never a
  // global restyle; inert byte-for-byte with the live kit). Re-probed on
  // every sync; a kit <link> still pending at mount re-syncs once when it
  // lands (the marker is never left set by a cold-boot race).
  const kitPartAbsent = () => {
    const probe = games.querySelector('.ob-card-option--card');
    // a DETACHED probe computes nothing (mount()'s first sync renders before
    // the ONE subtree insertion): no verdict, never a marker from it
    if (!probe || !probe.isConnected) return null;
    try { return getComputedStyle(probe).getPropertyValue('--ob-card-option-reserve').trim() === ''; }
    catch { return null; }
  };
  const markKitPart = () => {
    const absent = kitPartAbsent();
    if (absent === null) return;
    if (absent) section.setAttribute('data-ob-part-fallback', 'card-option');
    else section.removeAttribute('data-ob-part-fallback');
  };
  const kitLink = document.querySelector('link[rel="stylesheet"][href*="ui/kit.css"]');
  if (kitLink && !kitLink.sheet) kitLink.addEventListener('load', () => { if (mounted) sync(); }, { once: true });

  // ---- sync: renders model() into the DOM (idempotent; NO writes) --------
  let mounted = false;
  function sync() {
    if (!mounted) return;
    const m = model();
    gLine.v.textContent = gameName(m.game);
    rLine.v.textContent = variantName(m.variant);
    renderBack(m);
    renderRail(m);
    markKitPart();
    renderDetails(m);
    renderSummary(m, renderVariants(m));
    renderCarom(m);
    // rung 1b: the low perf tier degrades the rail's scroll-snap to a
    // plain scroll (play.css keys on the class; plan ruling P12)
    games.classList.toggle('ob-play-rail--plain', perfLow());
  }
  // play OWNS its sync (plan ruling P2): the commit broadcast, the 034a-mig
  // readiness event (catalog resolved / heyball flipped — contract §4 law
  // 6), locale swaps and the perf-tier announce re-render; shell.js's
  // capTimer tick never calls into play
  window.addEventListener('ob:settings', sync);
  window.addEventListener('ob:capability', sync);
  window.addEventListener('ob:perftier', sync);
  onLocaleChange(() => { sync(); revealFocused(); });

  // ---- window.__play (contract §3; published INSIDE mount(), by ref) -----
  const api = {
    /** pure read of the rendered state */
    registry: () => {
      const m = model();
      return {
        games: m.games.map((e) => ({
          id: e.id, playable: e.readiness === 'playable', current: e.id === m.game,
        })),
        variants: (m.variants ?? []).map((r) => ({
          id: r.id, value: r.value, current: r.current === true,
        })),
        mode: m.mode,
        carom2b: m.game === 'carom_3cushion' && m.canCarom, // fork visible (spec §7.2)
        locked: m.locked,
      };
    },
    /** the user tap path (gates → confirm → D14 analog) */
    pick: (gameId) => commitGame(String(gameId)),
    /** the `[data-variant-pick]` path (contract §3) */
    pickVariant: (presetId) => commitVariant(String(presetId)),
    /** the `[data-ob="play-back"]` path (contract §3) */
    back: () => doBack(),
    refresh: () => { sync(); },
    /** SCRIPTED-ONLY readiness fixture (contract §3): extra readiness cards
     * after the playable set; `null` restores; module memory only; entries
     * without a locale key AND without display_name are rejected. */
    previewCatalog: (entries) => {
      if (!scripted()) return false;
      if (entries === null) { fixture = null; sync(); return true; }
      if (!Array.isArray(entries)) return false;
      const norm = [];
      for (const e of entries) {
        if (!e || typeof e.id !== 'string' || !e.id) return false;
        if (GAME_CATALOG.some((g) => g.id === e.id) || norm.some((n) => n.id === e.id)) return false;
        const named = typeof e.display_name === 'string' && e.display_name.trim() !== '';
        if (!has(`game.${e.id}`) && !named) return false; // review round 4 P2-2
        norm.push({
          ...e,
          // fixture rows are READINESS cards by definition (never playable)
          readiness: (typeof e.readiness === 'string' && e.readiness !== 'playable')
            ? e.readiness : 'config_ready',
          prerequisites: Array.isArray(e.prerequisites) ? e.prerequisites : [],
          provenance: e.provenance && typeof e.provenance === 'object' ? e.provenance : null,
        });
      }
      fixture = norm;
      sync();
      return true;
    },
    /** SCRIPTED-ONLY citation switch (OWNER Q2 side-by-side; GH-668 S5
     * slice 3 G4): `'full'` sets `data-ob-citation="full"` on the section
     * (answer B — the S4 citation line back in every card's hint); anything
     * else clears it (answer A, the default). Module/DOM state only. */
    previewCitation: (mode) => {
      if (!scripted()) return false;
      if (mode === 'full') section.dataset.obCitation = 'full';
      else delete section.dataset.obCitation;
      sync();
      return true;
    },
  };

  // ---- stylesheet-gated mount (FR-003; plan §5.2 step 1) ---------------
  function mount() {
    if (mounted || !section.isConnected) return;
    mounted = true;
    // host class FIRST: R0 (g)'s generic summaries guard returns early on
    // `ob-play-host`, so the S1 play closure never un-hides the stub
    section.classList.add('ob-play-host');
    // ruling R7 (GH-668 S5 slice 3 G5 / B-PL06 said-once): the selected card
    // IS the summary — the S1 Game / Rules lines stay RENDERED (sync writes
    // them; the FR-004 text reads and a stale shell's generic tick see the
    // same composition); the Game line never paints under the host, and
    // renderSummary (sync) decides per register whether the Rules line
    // paints as the compact current-preset line (review review r2 P2-1)
    summary.hidden = mounted;
    gLine.p.hidden = mounted;
    // the capture driver's citation switch (`?obcite=full`, scripted boots
    // only — the same gate as previewCatalog): ONE attribute = answer B
    try {
      if (scripted() && new URLSearchParams(location.search).get('obcite') === 'full') section.dataset.obCitation = 'full';
    } catch { /* no URL API / no location: the default copy */ }
    // the S1 stub content retires from view (the pane it fronts stays
    // RESIDENT through 034a-front — pane + card coexist on the
    // integration branch; the h2 long-press point stays; contract §8 e7)
    for (const child of [...section.children]) {
      if (child.tagName === 'H2') continue;
      child.hidden = true;
    }
    sync(); // render BEFORE the append: ONE synchronous subtree insertion
    section.appendChild(body);
    markKitPart(); // the part probe needs CONNECTED cards (the pre-append sync saw none)
    if (rail && games.clientWidth > 0) rail.select(model().game); // first present snaps
    performance.mark?.('ob:play-mounted'); // perf-shell boot.*.play-mounted
    // rung 3: the scroll-edge fade is affordance-only (guarded leaf) — the
    // body's block fade + the rail's inline fade (B-K04) ride ONE leaf
    // The rail rides the kit's PEEK LAW helper (GH-668 S5 slice 3 G3,
    // B-PL02 / B-K04): fitPeek arms the inline fade itself, locks its band
    // at peek + 16, writes the component-local --sf-slot (= clip − 2 × 32)
    // that play.css gives each coarse card, and publishes data-ob-rail-k /
    // -n (kit-laws A4 judges the peek from those). A stale kit without
    // fitPeek keeps the plain inline fade and the sheet's slot fallback.
    import('./ui/scrollfade.js')
      .then((mod) => {
        mod.attachScrollFade?.(body);
        if (typeof mod.fitPeek === 'function') mod.fitPeek(games, { peek: 32 });
        else mod.attachScrollFade?.(games, { axis: 'inline' });
      })
      .catch(() => { /* the scroller works without the fade */ });
    // the FOLD-SNAP law (GH-525 integrator 2026-09-05; combined review visual
    // audit r1 finding 7 — the phone fold showed and truncated a readiness
    // card's status row): the body's clip edge lands on a clean text-line /
    // block boundary at rest and at every scrolled stop (ui/foldsnap.js,
    // the replays entries 24 / 25 law); the FR-003 section cap stays the
    // BUDGET, the leaf writes --fs-h / --fs-pad and play.css consumes them.
    // Guarded leaf; degrade = the budget layout (today's behaviour).
    import('./ui/foldsnap.js')
      .then((mod) => { mod.attachFoldSnap?.(body, { host: section, row: 'button, label, [role="option"]' }); })
      .catch(() => { /* the scroller works without the snap */ });
    console.log('[play] ready (034 S4a-front)');
    // LAST statement (contract §3 publication law): on the css-failed rung
    // this never runs and `window.__play` stays undefined
    window.__play = api;
  }
  // the css `load` gate, then a BOUNDED wait for the cardrail leaf so a
  // healthy boot paints the rail register once (fallback → rail would be
  // the intermediate layout FR-003 forbids); a slow leaf mounts the rung-1
  // register after RAIL_LEAF_WAIT_MS and upgrades in place when it lands
  const onCss = () => {
    if (railSettled) { mount(); return; }
    let done = false;
    const go = () => { if (done) return; done = true; mount(); };
    railLeaf.then(go);
    setTimeout(go, RAIL_LEAF_WAIT_MS);
  };
  // linked by the LAW 1 prefetch already (module level, above); idempotent
  // here for a factory reached without it — a sheet that loaded before this
  // factory ran gates SYNCHRONOUSLY (the `link.sheet` branch, kept)
  {
    const p = ensureSheet();
    if (sheetLoaded) onCss();
    else p.then((ok) => { if (ok) onCss(); });
  }

  // ---- shell-facing handle (atelier.js:1973 grammar) ---------------------
  /** S4b content poses (contract §2); S4a has the single `overview` pose —
   * no-op, returns the active pose id. */
  const go = () => 'overview';
  /** presentPlace forward: arriving at play re-syncs (and the rail snaps the
   * current card into view); another place only marks the rail hidden, so
   * play's next presentation is an arrival. Never re-creates or reparents
   * controls.
   * KF-017 (#1155): an ARRIVAL — play presented after a shell exit or a place
   * switch away hid the rail — lays the rail out again at whatever offset it
   * kept through the hide (a user's pan, or its start: e2e-settings' carom
   * leg in 6 of 8 instrumented runs), so the committed card can stand wholly
   * outside the scrollport, and renderRail's same-id select never re-snaps.
   * The slot-restore clause brought it back only through fitPeek's
   * ResizeObserver, a rAF after the FIRST frame: that frame painted the card
   * out of view and a click inside it hit the scene behind the rail (~400 ms
   * at load 55-60). An arrival now restores the SELECTED card whole in its
   * own task, before any frame, when no press is held: the BROWSED card under
   * a live browse, else the COMMITTED card; scroll-neutral when it already
   * stands whole. #1156: a live PLAYABLE browse was left to renderRail's
   * keep-law reveal, whose `whenOutside` read a card straddling the
   * scrollport edge as the leaf's snap in flight, but no snap can be in
   * flight after a hide (the same-id select starts none), so the card stayed
   * half-clipped. On a coarse or narrow register the cards take their width
   * from fitPeek's slot, so this reveal measures them still collapsed by the
   * hide's `0px`: the first real slot after the arrival reveals the selected
   * card with whenOutside false too (the slot-restore observer). A re-present
   * of play while it is shown is not an arrival, so this restore stays out
   * of it (the leaf's user-pan law). */
  let railHidden = true; // the rail lost its box since play was last presented
  let arrivalAt = null; // #1156: the last arrival, until the first real slot after it
  function takeArrivalSlot() { const on = arrivalAt !== null && performance.now() - arrivalAt < 3000; arrivalAt = null; return on; }
  const setPlace = (id) => {
    if (id !== 'play') { railHidden = true; return; }
    const arrival = railHidden;
    railHidden = false;
    if (arrival) arrivalAt = performance.now();
    sync();
    const sel = browsed ?? railGame;
    if (arrival && mounted && !pressHeld && sel !== null) {
      revealBrowsed(sel, { whenOutside: false });
    }
  };
  /** exitToTable forward: play holds no deep surface, float or camera
   * state in S4a — nothing to close; the hide makes the next presentation
   * an arrival (KF-017). */
  const onShellExit = () => { railHidden = true; };
  /** prop taps are not delegated to play in S4a (spec ruling 15). */
  const propTap = () => false;
  return { go, setPlace, onShellExit, propTap };
}
