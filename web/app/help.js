// Copyright (c) Meta Platforms, Inc. and affiliates.

// help.js — in-app help overlay (feature 024): a kit-dialog leaf module that
// states the AUDITED input mappings per input family (ground truth:
// the internal help-overlay mappings audit), teaches the shape of a turn
// (the 7 shipped flow steps), and answers "what do I shoot at?" per
// discipline in exactly one sentence. Contract (FROZEN):
// the help-overlay contract (feature 024, internal).
//
// Leaf module: the ONLY static import is ./i18n.js (help.js itself arrives
// via the guarded dynamic main.js seam, so it never joins the static boot
// graph). The UI kit is reached via a guarded dynamic import() below
// (cache-poison contract, the ownership ledger (internal)): a stale graph without
// ui/dialog.js installs NOTHING — no button, no shortcut, no __help.
// No physics reads, no machine.to(), no game-state writes: the overlay
// opens in any machine state without pausing, diverting, or firing
// anything, and closing never mutates game state.
import { applyDom, getLocale, has, onLocaleChange, t } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / GH-313 hasLocal law):
// hasLocal() is reached via the namespace so a fresh help.js over a stale
// cached i18n.js keeps linking and degrades to HIDDEN, never
// wrong-language (see knowsSiteKey below).
import * as i18nNs from './i18n.js';

// ui/help.css version — bump on EVERY change to that sheet (the ownership ledger CSS
// addendum / the settings-modal.css ?v= precedent: the version lives in the
// module that builds the DOM, so DOM and skin can never drift).
const HELP_CSS_V = '8'; // v8: GH-668 S5 slice-1 kit consumer sweep (v7: .ob-help__site joins the guide's link register)
// (v6: GH-245 — the close's bespoke 28px block
// retired onto the kit .ob-btn--icon register; v5: #59 accent-vs-info
// doctrine comment; v4: #49
// de-slop — guide link on the chalk --ob-info voice + SVG icon sizing;
// v3: .ob-help__guide[hidden] display pin, refs #39)

// ---- FROZEN structure tables (contract §5; data-model §1.2–§1.4) ----------
// Structure lives HERE as data; prose lives ONLY in the locale dictionaries
// under flat help.* keys (research R3). Every controls row states an audited
// mapping — mappings.md is the ground truth; no row documents a binding that
// does not exist (FR-002: explicitly NO number-key ball calling anywhere).
// Discipline names REUSE the shipped game.<id> keys — never duplicated.
const SECTIONS = [
  { id: 'mouse', family: 'fine', kind: 'controls',
    rows: ['aim', 'fine', 'hand', 'orbit', 'pan', 'wheelPower', 'wheelZoom',
      'aimView', 'call'] },
  { id: 'trackpad', family: 'fine', kind: 'controls',
    rows: ['aim', 'fine', 'orbit', 'scrollPower', 'scrollZoom', 'aimView'] },
  { id: 'keyboard', family: 'fine', kind: 'controls',
    // GH-718: the DVR player's seek keys (playback.js wireSeekKeys) — the
    // slider consumes them only while it holds focus, so the aim rows above
    // and these coexist without a modal caveat.
    // GH-1051: the spin pad's keys (hud.js — the pad consumes them only
    // while it holds focus, like the seek rows' slider)
    rows: ['aim', 'power', 'spin', 'view', 'seek', 'seekJump', 'seekEnds', 'esc', 'help'] },
  { id: 'touch', family: 'touch', kind: 'controls',
    rows: ['aim', 'place', 'orbit', 'zoom', 'pan', 'call', 'fire', 'power',
      'spin', 'fine', 'view'] },
  // shipped turn order, frozen — rendered as an ordered list 1–7, never
  // reordered per-locale (data-model §1.3).
  // GH-225 Phase D (dated amendment in feature 024 (internal spec)
  // §1.3 + contracts/help-overlay.md §7): row 7 'export' → 'playback'. The
  // row documented a control this wave deleted from the phone settings
  // sheet; the DVR is the video path every user has now, so the step
  // describes it instead of the desktop-only export dialog.
  { id: 'flow', family: 'always', kind: 'flow',
    rows: ['aim', 'spin', 'power', 'shoot', 'replay', 'share', 'playback'] },
  { id: 'games', family: 'always', kind: 'games',
    rows: ['nine_ball', 'eight_ball', 'snooker', 'carom_3cushion',
      'one_pocket',
      // feature 025 (issue #65): the sixth playable discipline
      'straight_pool',
      // feature 026 (GH-343): the seventh playable discipline
      'ten_ball',
      // GH-491 (build 18): the eighth playable discipline
      'heyball'] },
];

/** Flow row 7's key stem. 'playback' on every shipped graph; 'export' ONLY
 * against a cached pre-Phase-D dictionary that has not learned
 * help.flow.playback.* yet (locale JSON is fetched at runtime by i18n.js and
 * cached independently of this module, so that pairing is reachable and t()
 * would otherwise paint the literal key name into the overlay). Evaluated at
 * BUILD time and again at every relabel(), so a live locale switch onto a
 * freshly fetched dictionary re-points the row instead of stranding it on
 * stale English copy (review review rounds 1 + 2).
 * has() is deliberately the ACTIVE-or-EN test, not an active-only one
 * (review review round 3, refused): when the active dictionary is stale but
 * en.json is fresh, i18n.js's own law already resolves the row —
 * `tpl = enDict[key] ?? key` — so the user sees the CORRECT step in English,
 * exactly like every other key in the app under a partly-stale locale. An
 * active-only test would instead pick the localized EXPORT copy, i.e.
 * translated prose about a control this graph does not have. Correct
 * semantics in the fallback language beats fluent prose about a ghost, and
 * this row must not invent a private i18n rule. The guard's real job is the
 * one case has() actually detects: NO dictionary in play knows the new key. */
const flowSaveStep = () => (has('help.flow.playback.t') ? 'playback'
  : (has('help.flow.export.t') ? 'export' : 'playback'));

/** Stale-dictionary gate for the NEW help.games.site key (site-backlink
 * review round, P2). Locale JSON is cached independently of this module, so
 * a fresh help.js can meet a pre-change dictionary that lacks the key — and
 * a successful guide probe would then unhide an anchor whose label t()'s to
 * the literal key. Unlike the flow rows above (which must render SOMETHING,
 * so has()'s en fallback is the ruled-correct degrade), the site link is
 * OPTIONAL chrome: the clean mixed-cache degrade is to stay hidden — never
 * a literal-key paint, never fresh ENGLISH copy in a non-English UI, never
 * a missing-key warn. That is exactly the GH-313 hasLocal register, reached
 * via the namespace so a stale pre-313 i18n.js keeps linking — and a
 * missing hasLocal export reads as FALSE (review r2 P2): the cache
 * contract's degrade for optional chrome is HIDE, never wrong-language.
 * A has() fallback would pass via fresh en.json while the CACHED active
 * dictionary still predates the key, showing English "Project site" (plus
 * a relabel missing-key warn) inside an otherwise localized UI; instead
 * the link simply stays dark until the user's i18n.js is fresh.
 * Re-evaluated at every relabel() AND syncGuide(), so a live locale
 * switch re-arms the link in BOTH directions: stale → fresh unhides once
 * the fresh dictionary lands; fresh → stale withdraws it.
 * The anchor is therefore NOT data-i18n-bound (the playback.js t()-composed
 * register): main.js's applyStatic — applyDom(document) — is the FIRST
 * locale-change subscriber and would t() a bound key during the switch,
 * before this module's relabel could withdraw it, leaking a missing-key
 * warn (and, with en stale too, a literal-key paint) on every stale-switch.
 * relabel() below composes the label through gated t() instead. */
const knowsSiteKey = () => i18nNs.hasLocal?.('help.games.site') === true;

/** GH-718 review r4 P2 — controls rows added AFTER the dictionaries shipped
 * (the DVR seek keys) are GATED on the ACTIVE dictionary, the knowsSiteKey
 * register above: locale JSON is cached independently of this module, so a
 * fresh help.js can meet a pre-change dictionary that lacks
 * help.controls.keyboard.seek*. A row is chrome the user can live without
 * for one session: the degrade is OMIT (empty + hidden), never a literal
 * key, never fresh English inside a localized UI (has()'s en fallback
 * would do exactly that). The stem set is the row's build-time truth;
 * syncGatedRows re-evaluates it at build and at every relabel() (a live
 * switch stale -> fresh adds the rows, fresh -> stale removes them).
 * Pointer rows are not gated (shipped keys).
 * GH-718 review r5 P2: the gated cells are NEVER data-i18n-bound — they are
 * t()-composed under the knowsRow gate, the knowsSiteKey register. A bound
 * cell would be repainted by main.js's applyDom(document), the FIRST
 * locale-change subscriber (this module rides a guarded dynamic import and
 * cannot register ahead of it), which on a fresh -> stale switch t()s the
 * missing keys — a missing-key warn per cell, and a literal-key paint with
 * en stale too — before this module's relabel() could withdraw them. With
 * no binding the global pass never touches the cells; relabel() composes
 * them (or empties them) on every switch exactly like the bound path
 * would have. */
const GATED_ROWS = new Set(['help.controls.keyboard.seek', 'help.controls.keyboard.seekJump',
  'help.controls.keyboard.seekEnds',
  'help.controls.keyboard.spin']); // GH-1051: the same added-row register
const knowsRow = (stem) => i18nNs.hasLocal?.(`${stem}.k`) === true && i18nNs.hasLocal?.(`${stem}.v`) === true;
const syncGatedRows = (root) => {
  for (const tr of root.querySelectorAll('tr[data-gated]')) {
    const stem = tr.dataset.gated;
    const know = knowsRow(stem);
    if (know) {
      if (!tr.firstChild) {
        const th = document.createElement('th');
        th.scope = 'row';
        tr.append(th, document.createElement('td'));
      }
      // t() runs ONLY when the active dictionary carries both keys
      tr.firstChild.textContent = t(`${stem}.k`);
      tr.lastChild.textContent = t(`${stem}.v`);
    } else if (tr.firstChild) tr.replaceChildren();
    tr.hidden = !know;
  }
};

// data-model §2 — ordering + default expansion, re-evaluated at EVERY open.
// Collapsed sections keep their headers visible and expand on activation —
// reachable, never hidden.
const ORDER = {
  fine: ['mouse', 'trackpad', 'keyboard', 'touch', 'flow', 'games'],
  touch: ['touch', 'mouse', 'trackpad', 'keyboard', 'flow', 'games'],
};
const EXPANDED = {
  fine: ['mouse', 'trackpad', 'keyboard', 'flow', 'games'],
  touch: ['touch', 'flow', 'games'],
};

// The aim.js window-keydown guard set (mappings.md K0) — the '?' shortcut
// mirrors it exactly (contract §3): native selects/inputs/textareas and the
// kit combobox/listbox own their keys; plain BUTTONs pass through by design
// (aim.js law parity — a focused Shoot button must not eat '?').
const KEY_GUARD = 'select,input,textarea,[role=combobox],[role=listbox]';

// ---- the help pill's OWN glyph (GH-246 defect 1) -----------------------------
// #ob-help may NOT depend on `ui/icons.js` resolving. That module arrives via a
// guarded dynamic import (the cache-poison contract allows "fresh app, absent
// icons.js"), and the pill then fell back to a typographic '?' — a heavier,
// differently proportioned mark that made the toolbar read as a cheaper app in
// the register the owner reviewed (GH-243 pack). The path data lives HERE and is
// emitted as inline SVG at build time: zero import edge, nothing to fail, no
// boot-graph change (#49 rule 5). The GH-242 '?' text fallback is UNCHANGED and
// still ships — it now covers only the reverse pairing (a stale pre-GH-246
// help.js). icons.js keeps its own frozen-stable `help` entry; the two copies
// are gated BYTE-IDENTICAL by `node web/tools/glyph-audit.mjs` and the rendered
// markup by e2e-playback arm 6d.
const HELP_GLYPH = /* OB-GLYPH:help */
  '<path d="M7.15 7.2C7.15 5.62 8.35 4.55 10 4.55C11.65 4.55 12.85 '
  + '5.62 12.85 7.1C12.85 9.4 10 9.25 10 11.8"/>'
  + '<circle cx="10" cy="15.1" r="1.05" fill="currentColor" stroke="none"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits, so the icons-absent register is
 * INDISTINGUISHABLE from the normal one. Decorative: the OWNING control keeps
 * the localized title/aria-label. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

// R1 input-mode signal — EXCLUSIVELY the signals the app itself used to pick
// its input grammar, read at EVERY open (never cached at module load, never
// a media query, never UA sniffing): the touch layer installs asynchronously
// and a stale-cache boot can degrade it away — the help must describe the
// grammar that is actually active.
const mode = () => ((window.__touch?.installed === true
  || document.documentElement.classList.contains('ob-touch'))
  ? 'touch' : 'fine');

let created = false;

/** Idempotent entry point (called once from the guarded main.js seam).
 * Kit access is feature-detected: if ui/dialog.js cannot be imported (stale
 * mixed cache), createHelp installs NOTHING — no toolbar button, no '?'
 * shortcut, no window.__help (inert stub — no half-built entry points that
 * open nothing). */
export function createHelp() {
  if (created) return;
  created = true;
  try {
    import('./ui/dialog.js')
      .then((dialog) => { try { install(dialog); } catch { /* inert */ } })
      .catch(() => { /* inert stub — cache-poison contract */ });
  } catch { /* inert stub */ }
}

function install(dialog) {
  let panel = null;    // #ob-help-panel — built lazily on FIRST open
  let bodyEl = null;   // .ob-help__body (internal scroll region)
  let guideEl = null;  // a.ob-help__guide (hidden until the R5 probe hits)
  let siteEl = null;   // a.ob-help__site — project-site backlink; rides the
                       // guide's probe result, never probes on its own
  let closeBtn = null; // #ob-help-close
  let icons = null;    // ui/icons.js (#49) — guarded import below; null =
                       // text-glyph fallback register (cache-poison law)
  let isOpen = false;  // explicit state — never read back style.display
  let guideBase;       // undefined = unprobed | null = hidden | layout base
  let guideProbing = false;
  const sectionEls = new Map(); // section id -> <section> node

  // ---- GH-461: CRITICAL pill skin, SYNCHRONOUS (the settings.js GH-246
  // gear precedent). The leaf <link> below arrives async; until it landed
  // the toolbar pill painted as the UA default button — a blank white 34px
  // disc — and the sheet's own `transition: background` then animated it
  // dark THROUGH the #48 boot overlay's fade (a user-visible light disc on
  // every uncached phone boot). This block is the pill's settled base skin
  // verbatim, so the FIRST paint is the settled style; it is injected
  // BEFORE the link, so once help.css lands it wins every equal-specificity
  // tie and stays the pill's one authoritative skin (cache-poison degrade:
  // no sheet → this block alone keeps the pill on-register).
  if (!document.getElementById('ob-help-crit')) {
    const crit = document.createElement('style');
    crit.id = 'ob-help-crit';
    crit.textContent = `
      /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY
         (#ob-toolbar > * { position: static !important } neutralises it
         once containered); material, rungs, coarse 44 and reduced motion
         are the kit toolbar part (.ob-btn--glass + .ob-toolbar-pill) */
      #ob-help { position: fixed; top: 54px; right: 10px; }
    `;
    document.head.appendChild(crit);
  }

  // ---- skin: LEAF stylesheet with the ?v= cache-bust law ------------------
  // Injected here (not app.html) so a stale help.js asks for the old skin it
  // matches and a fresh one for the new (settings-modal.css precedent).
  if (!document.getElementById('ob-help-css')) {
    const link = document.createElement('link');
    link.id = 'ob-help-css';
    link.rel = 'stylesheet';
    link.href = new URL(`./ui/help.css?v=${HELP_CSS_V}`, import.meta.url);
    document.head.appendChild(link);
  }

  // ---- section builders (DOM skeleton frozen in data-model §3) ------------
  const setExpanded = (s, on) => {
    s.querySelector('.ob-help__disclose')
      .setAttribute('aria-expanded', String(on));
    // collapsed regions use `hidden` — no tween dependency, reduced-motion
    // safe by construction (research R2)
    s.querySelector('.ob-help__region').hidden = !on;
  };

  const mkDisclose = (id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ob-help__disclose';
    b.setAttribute('aria-expanded', 'true');
    b.setAttribute('aria-controls', `ob-help-region-${id}`);
    const label = document.createElement('span');
    label.dataset.i18n = `help.section.${id}`;
    const chev = document.createElement('span');
    chev.className = 'ob-help__chev';
    chev.setAttribute('aria-hidden', 'true');
    const ci = icons?.icon('chevron-down');
    if (ci) chev.appendChild(ci);
    else chev.textContent = '▾'; // stale-cache fallback glyph (#49)
    b.append(label, chev);
    return b;
  };

  const mkRows = (sec) => {
    if (sec.kind === 'controls') {
      // gesture→effect table: .k = the input (row header), .v = the effect
      const table = document.createElement('table');
      table.className = 'ob-help__table';
      const tb = document.createElement('tbody');
      for (const row of sec.rows) {
        const tr = document.createElement('tr');
        const stem = `help.controls.${sec.id}.${row}`;
        // gated rows are filled (or left empty + hidden) by syncGatedRows
        if (GATED_ROWS.has(stem)) { tr.dataset.gated = stem; tb.appendChild(tr); continue; }
        const th = document.createElement('th');
        th.scope = 'row';
        th.dataset.i18n = `${stem}.k`;
        const td = document.createElement('td');
        td.dataset.i18n = `${stem}.v`;
        tr.append(th, td);
        tb.appendChild(tr);
      }
      table.appendChild(tb);
      syncGatedRows(table);
      return table;
    }
    if (sec.kind === 'flow') {
      const ol = document.createElement('ol');
      ol.className = 'ob-help__flow';
      for (const rawStep of sec.rows) {
        // STALE-DICTIONARY GUARD (review review round 1, P2). Locale JSON is
        // fetched at runtime by i18n.js and cached independently of this
        // module, so a FRESH help.js can meet a PRE-Phase-D dictionary that
        // still carries help.flow.export.* and does not yet carry
        // help.flow.playback.*. t() would then paint the literal key name.
        // Fall back to the SUPERSEDED row for exactly that pairing: honest
        // copy about a control the stale graph still has, instead of
        // 'help.flow.playback.t' on screen. Inert on the shipped graph
        // (has() is true), and it self-heals the moment the dictionary
        // refreshes. The reverse pairing (a cached PRE-Phase-D help.js
        // against fresh dictionaries) cannot be fixed from here — see the
        // OWNERSHIP Phase-D entry's review-round-1 ruling.
        const step = rawStep === 'playback' ? flowSaveStep() : rawStep;
        const li = document.createElement('li');
        const b = document.createElement('b');
        b.dataset.i18n = `help.flow.${step}.t`;
        const d = document.createElement('span');
        d.className = 'ob-help__flowdesc';
        d.dataset.i18n = `help.flow.${step}.d`;
        li.append(b, d);
        ol.appendChild(li);
      }
      return ol;
    }
    // games: one one-liner per playable discipline (six since feature
    // 025); names reuse the shipped game.<id> keys
    const dl = document.createElement('dl');
    dl.className = 'ob-help__games';
    for (const id of sec.rows) {
      const dt = document.createElement('dt');
      dt.dataset.i18n = `game.${id}`;
      const dd = document.createElement('dd');
      dd.dataset.i18n = `help.games.${id}`;
      dl.append(dt, dd);
    }
    return dl;
  };

  const mkSection = (sec) => {
    const s = document.createElement('section');
    s.dataset.section = sec.id;
    const b = mkDisclose(sec.id);
    const region = document.createElement('div');
    region.className = 'ob-help__region';
    region.id = `ob-help-region-${sec.id}`;
    region.appendChild(mkRows(sec));
    b.addEventListener('click', () => setExpanded(s, region.hidden));
    s.appendChild(b);
    if (sec.id === 'mouse') {
      // help.pointerNote in the fine-pointer group header area, both modes
      // (R1: mouse vs trackpad does NOT exist reliably on the web — both
      // sections always render and the UI never claims detection)
      const note = document.createElement('p');
      note.className = 'ob-help__note';
      note.dataset.i18n = 'help.pointerNote';
      s.appendChild(note);
    }
    s.appendChild(region);
    return s;
  };

  // ---- guide link (data-model §1.6 / research R5) --------------------------
  // Scheme gate: renders ONLY under http:/https: — under app:/file: it stays
  // hidden and NO probe ever fires (FR-005/SC-007). Reachability: one lazy,
  // once-per-session, SAME-ORIGIN HEAD probe on first open — the deployed
  // pages.yml layout first, then the repo-root dev layout; first 2xx wins,
  // every miss/throw is silent ⇒ no link (FR-011: zero non-origin requests
  // in every mode — both candidates are relative to app.html by
  // construction).
  //
  // GH-333 layout precondition (journey-QA wave 1 console hygiene): the
  // probe fires ONLY when the app's own URL has the two-layer shape BOTH
  // guide layouts share — pathname ending /web/app.html (pages.yml artifact:
  // site/. at the root, app under /web/, guide at ../guide/; repo-checkout
  // serve: app at /web/app.html, guide at ../site/guide/). An app served
  // ALONE (python -m http.server -d web — every e2e/dev boot, any bare
  // static host, the QA lanes) can host NEITHER layout, and probing it
  // wrote two unsuppressible 404 console errors on first open: Chrome logs
  // 'Failed to load resource … 404' at the NETWORK layer for any 4xx
  // response — fetch/HEAD/prefetch/iframe navigation alike (probed on the
  // pinned shell, 2026-08-02) — so no page-side catch can quiet it. No
  // layout shape ⇒ no request at all; the absent state (hidden link)
  // renders exactly as before. Known residual (dev-only, documented): a
  // repo-checkout serve still walks ../guide/ (one 404) before the
  // ../site/guide/ hit — the two layouts are not distinguishable without
  // asking, and the deployed artifact answers the first candidate 2xx.
  const guideUrl = (base) =>
    new URL(`${base}${getLocale()}/index.html`, window.location.href);
  const syncGuide = () => {
    if (!guideEl || typeof guideBase !== 'string') return;
    // href follows the active locale (the guide ships all 7 as sibling dirs
    // of the probed layout — no re-probe on locale switch)
    guideEl.href = guideUrl(guideBase).href;
    guideEl.hidden = false;
    // the site backlink rides the SAME probe hit — zero extra requests:
    // its root is the layout base minus the trailing guide/ segment
    // ('../guide/' → '../', '../site/guide/' → '../site/'), ONE URL for
    // every locale (the site root has no per-locale siblings). Visibility
    // takes the knowsSiteKey dictionary gate ON TOP of the probe: a probe
    // hit against a pre-change cached dictionary keeps the link dark, and
    // relabel → syncGuide re-opens it once a fresh dictionary lands.
    siteEl.href = new URL(guideBase.replace(/guide\/$/, ''),
      window.location.href).href;
    siteEl.hidden = !knowsSiteKey();
  };
  const probeGuide = () => {
    const scheme = window.location.protocol;
    if (scheme !== 'http:' && scheme !== 'https:') return; // scheme gate
    if (guideBase !== undefined || guideProbing) return; // once per session
    if (!/\/web\/app\.html$/.test(window.location.pathname)) {
      guideBase = null; // bare layout: no guide can exist — zero requests
      return;           // (GH-333 precondition above)
    }
    guideProbing = true;
    (async () => {
      for (const base of ['../guide/', '../site/guide/']) {
        try {
          const res = await fetch(guideUrl(base), { method: 'HEAD' });
          if (res.ok) { guideBase = base; syncGuide(); return; }
        } catch { /* silent miss — e.g. a static host serving web/ alone */ }
      }
      guideBase = null; // both layouts missed — no link this session
    })().finally(() => { guideProbing = false; });
  };

  // ---- i18n: every visible string is data-i18n-bound; live locale switch
  // re-renders in place through the shipped applyDom path (SC-004) ---------
  const relabel = () => {
    pill.title = t('help.open');
    pill.setAttribute('aria-label', t('help.open'));
    if (!panel) return;
    // RE-EVALUATE the flow-row stale-dictionary guard before translating
    // (review review round 2, P2). The guard below bakes a key into
    // dataset.i18n at BUILD time; a live locale switch fetches a fresh
    // dictionary, so a panel first built against a cached pre-Phase-D
    // dictionary would otherwise keep painting the superseded Export row —
    // in stale English — for the rest of the session. Cheap: one has()
    // test per relabel over the flow list, and it re-points in both
    // directions (stale -> fresh and fresh -> stale).
    for (const b of panel.querySelectorAll('[data-i18n^="help.flow."]')) {
      const m = /^help\.flow\.(export|playback)\.([td])$/.exec(b.dataset.i18n);
      if (m) b.dataset.i18n = `help.flow.${flowSaveStep()}.${m[2]}`;
    }
    // site backlink label, t()-composed under the knowsSiteKey gate (see
    // its doc for why the anchor is never data-i18n-bound): t() runs ONLY
    // when the active dictionary carries the key — no literal-key paint,
    // no missing-key warn, and this subscriber re-composes it on every
    // locale switch exactly like the data-i18n path would have.
    siteEl.textContent = knowsSiteKey() ? t('help.games.site') : '';
    syncGatedRows(panel); // GH-718 review r4 P2: gated rows follow the dictionary in play
    applyDom(panel);
    closeBtn.setAttribute('aria-label', t('help.close'));
    syncGuide();
  };

  const buildPanel = () => {
    panel = document.createElement('div');
    panel.id = 'ob-help-panel';
    panel.className = 'ob-panel ob-help'; // kit glass register + own scope
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ob-help-title');
    panel.style.display = 'none'; // closed at rest; openPanel's enter shows

    const head = document.createElement('div');
    head.className = 'ob-help__head';
    const h = document.createElement('h2');
    h.id = 'ob-help-title';
    h.dataset.i18n = 'help.title';
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'ob-help-close';
    // GH-245 close unification: the kit ghost icon-circle register
    // (34px/44pt, kit rungs + focus ring); help.css's bespoke 28px block
    // is retired with it
    closeBtn.className = 'ob-btn ob-btn--ghost ob-btn--icon';
    closeBtn.dataset.i18nTitle = 'help.close';
    const x = document.createElement('span');
    x.setAttribute('aria-hidden', 'true');
    const xi = icons?.icon('close');
    if (xi) x.appendChild(xi);
    else x.textContent = '✕'; // stale-cache fallback glyph (#49)
    closeBtn.appendChild(x);
    closeBtn.addEventListener('click', () => close());
    head.append(h, closeBtn);

    bodyEl = document.createElement('div');
    bodyEl.className = 'ob-help__body';
    for (const sec of SECTIONS) {
      const el = mkSection(sec);
      sectionEls.set(sec.id, el);
      bodyEl.appendChild(el);
    }
    guideEl = document.createElement('a');
    guideEl.className = 'ob-help__guide';
    guideEl.dataset.i18n = 'help.games.guide';
    guideEl.target = '_blank';
    guideEl.rel = 'noopener';
    guideEl.hidden = true;
    bodyEl.appendChild(guideEl);
    // project-site backlink — same footer row, same probe gate as the
    // guide, PLUS the knowsSiteKey dictionary gate; label t()-composed in
    // relabel, deliberately NOT data-i18n-bound (knowsSiteKey doc)
    siteEl = document.createElement('a');
    siteEl.className = 'ob-help__site';
    siteEl.target = '_blank';
    siteEl.rel = 'noopener';
    siteEl.hidden = true;
    bodyEl.appendChild(siteEl);

    panel.append(head, bodyEl);

    // key containment (contract §3 / R7): bubble-phase listeners on the
    // panel root stop EVERY key, so game-steering keys (arrows, V) never
    // reach aim.js's window bubble handler while the overlay is open —
    // aim.js deliberately lets plain-button targets through, so without
    // this an arrow press with focus on the close button would steer the
    // aim behind the dialog. Escape/Tab stay live: ui/dialog.js handles
    // them at document CAPTURE, which fires before any bubble listener.
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    panel.addEventListener('keyup', (e) => e.stopPropagation());

    document.body.appendChild(panel);
    relabel();
  };

  // data-model §2: DOM append-reorder of the section nodes at every open;
  // sections are inserted BEFORE the guide link so it (and the site backlink
  // after it) stays the body's tail in both orders.
  const applyModeOrder = (m) => {
    for (const id of ORDER[m]) {
      bodyEl.insertBefore(sectionEls.get(id), guideEl);
    }
    for (const sec of SECTIONS) {
      setExpanded(sectionEls.get(sec.id), EXPANDED[m].includes(sec.id));
    }
  };

  // ---- open/close (contract §1.3: open never throws; both no-op when
  // already in the target state) -------------------------------------------
  const open = (source = 'api') => {
    try {
      if (isOpen) return;
      if (!panel) buildPanel(); // lazily on FIRST open
      applyModeOrder(mode()); // re-read the R1 signal at EVERY open
      panel.dataset.entrySource = source; // debugging only, never persisted
      isOpen = true;
      dialog.openPanel(panel, {
        backdrop: true,
        display: 'flex', // .ob-help lays out as a header + scrolling body
        onClose: () => { isOpen = false; }, // Escape / backdrop click paths
      });
      // the overlay covers the z:40 chrome like the confirm dialog does
      const bd = panel.previousElementSibling;
      if (bd?.classList.contains('ob-backdrop')) {
        bd.classList.add('ob-backdrop--top');
      }
      // stale-cache guard (cache-poison contract): with help.css missing or
      // stale the panel must stay centered and scrollable — plain-but-usable
      // — so critical placement falls back to inline styles (the
      // confirmDialog precedent; skin degrades, function does not).
      if (getComputedStyle(panel).position !== 'fixed') {
        panel.style.cssText += ';position:fixed;inset:0;margin:auto;'
          + 'width:min(920px, calc(100vw - 32px));height:fit-content;'
          + 'max-height:calc(100vh - 32px);z-index:70;display:flex;'
          + 'flex-direction:column;overflow:hidden;';
        bodyEl.style.overflowY = 'auto';
        if (bd) bd.style.zIndex = '69';
      }
      probeGuide(); // lazy, once per session, scheme-gated
    } catch { /* open() never throws (contract §1.3) */ }
  };

  const close = () => {
    if (!isOpen || !panel) return;
    isOpen = false;
    // kit path: exit motion, backdrop removal, focus restore to whatever
    // had focus before openPanel — same restore as Escape/backdrop closes
    dialog.closePanel(panel);
  };

  // ---- entry point 1: toolbar pill (contract §2 / R8) ---------------------
  const pill = document.createElement('button');
  pill.id = 'ob-help';
  pill.type = 'button';
  pill.className = 'ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill'; // GH-668 B-K16 toolbar part
  pill.dataset.i18nTitle = 'help.open'; // data-i18n mechanics: applyDom-able
  pill.setAttribute('aria-haspopup', 'dialog');
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  // GH-246: the real vector mark, inlined — never a text glyph, never a
  // dependency on the icons import
  glyph.innerHTML = inlineGlyph(HELP_GLYPH, 'help');
  pill.appendChild(glyph);
  pill.addEventListener('click', () => open('toolbar'));
  // ---- #49 icon system: guarded dynamic import (cache-poison contract —
  // a stale graph without ui/icons.js keeps every text glyph above). The
  // retrofit sweep covers the rare race where the panel was built (first
  // open) before the module resolved. The PILL is no longer part of this —
  // it carries its own inlined glyph (GH-246).
  try {
    import('./ui/icons.js').then((m) => {
      icons = m;
      if (panel) {
        const xi = icons.icon('close');
        const x = closeBtn?.querySelector('span');
        if (x && xi) x.replaceChildren(xi);
        for (const chev of panel.querySelectorAll('.ob-help__chev')) {
          const ci = icons.icon('chevron-down');
          if (ci) chev.replaceChildren(ci);
        }
      }
    }).catch(() => { /* text glyphs stay */ });
  } catch { /* text glyphs stay */ }
  (() => {
    // insert sorted by toolbar order so TAB order matches the visual order
    // (the settings.js gear shape verbatim — CSS `order` alone reorders
    // pixels, not focus). Fallback: a stale app.html without #ob-toolbar —
    // the pill takes a fixed right-offset like the shipped pills (help.css)
    // and the container's `position: static !important` rule neutralizes it
    // once containered.
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(pill); return; }
    pill.dataset.tbOrder = '5';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 5);
    tb.insertBefore(pill, next || null);
  })();

  // ---- entry point 2: '?' keyboard shortcut (contract §3 / R6) ------------
  // Produced-character match — e.key === '?' works on DE/FR/… layouts where
  // '?' lives on other physical keys (some without Shift); NEVER
  // code === 'Slash' + shiftKey. Inert when the overlay is already open,
  // when e.target sits in the aim.js guard set (K0), or in contenteditable.
  window.addEventListener('keydown', (e) => {
    if (e.key !== '?' || isOpen) return;
    const el = e.target;
    if (el instanceof Element
      && (el.closest(KEY_GUARD) || el.isContentEditable)) return;
    open('key');
  });

  // ---- the ONE window seam (contract §1.3 / R13): e2e, the settings About
  // row, and the US5 shell nudge all feature-detect THIS object ------------
  window.__help = {
    open, // source in 'toolbar'|'key'|'settings'|'shell'|'api'
    close,
    isOpen: () => isOpen,
    mode, // 'touch' | 'fine' — exactly the R1 signal
  };

  onLocaleChange(relabel);
  relabel();
}
