// Copyright (c) Meta Platforms, Inc. and affiliates.

// drills.js — practice mode v1 (issue #66): drill runner + picker + progress.
// A drill = initial LAYOUT + machine-checked OBJECTIVE + ATTEMPT LOOP +
// progress, a thin layer ABOVE the rules crate. Definitions are DATA
// (web/app/drills/catalog.js, format contract web/app/drills/FORMAT.md);
// verdicts derive EXCLUSIVELY from kernel record/judgment bytes + sample(t)
// zone checks through the shipped sampler — never re-derived physics
// (constitution P-II; the rl-env smoke.py objective-evaluator law).
//
// Leaf module (the 024 help.js anatomy): the ONLY static import is
// ./i18n.js. drills.js itself arrives via the guarded dynamic main.js seam;
// the UI kit AND the catalog are reached via guarded dynamic imports below
// (cache-poison contract, the ownership ledger (internal)) — a stale graph installs
// NOTHING (no pill, no __drills, no chips; inert, no half-built entry
// points). Hook registrations are ADDITIVE (machine.on); SETTLED routing
// stays flow.js's exclusive right — the runner's ONLY machine.to() is the
// drill-granted BALL_IN_HAND placement entry via grantPlacement (issue #79
// defect 2; recorded in the the ownership ledger drills ledger; GH-370 extended
// its call sites to the ghost post-break grant and the voluntary-BIH dock
// tap — every one still a macrotask or user-event context), and the
// attempt loop re-lays through game.layout()/game.rerack() only, always
// from a macrotask, never inside a stateChange/shotComplete dispatch (the
// flow.js carom setTimeout(0) precedent). The evaluator runs ONCE at settle
// (no 'frame' hook — perf law: nothing drill-related in the frame loop).
import { applyDom, onLocaleChange, t } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / GH-313 hasLocal law):
// hasLocal() is reached via the namespace so a fresh drills.js over a stale
// cached i18n.js keeps linking and degrades to the legacy end-summary path.
import * as i18nNs from './i18n.js';

// ui/drills.css version — bump on EVERY change to that sheet (the OWNERSHIP
// CSS addendum: the version lives in the module that builds the DOM).
// merge-wave note: the GH-144/GH-136-wave branches bumped this to 8/9 in
// parallel; resolved to one value strictly higher than every claim (10).
// 11: build-4 QA — per-segment nowrap spans in the merged status badge.
// 12: GH-245 — the close's bespoke 28px block retired onto the kit
//     .ob-btn--icon register.
// 13: GH-370 review r5 — the phone rail yields RESET while the voluntary-
//     BIH button is present (the audited 2x44 free window holds two rows).
// 14: GH-668 S5 slice 1 — the kit consumer sweep (id-material overrides off
//     the kit parts; the chip readout ledgered under B-PR05).
// 15: GH-668 S5 slice 4 B-PR03 — the phone strip's band-T inset
//     (margin-inline-start: var(--drills-slot-l)) so the fifth toolbar pill
//     never paints over the drill name.
// 19: GH-668 S5 slice 4 round 9 (review r1 P2-2) — the drill-end notice
//     stands down under html.ob-pb-live (the DVR's live-bed chrome law).
// 20: GH-668 S5 slice 4 round 10 (review r2 P2-1) — the phone strip wraps on
//     every coarse register under the room cap; the readout's row is decided
//     by its widest atom (stacks whole under a long name, never shrinks).
const DRILLS_CSS_V = '22';

// ---- the drills pill's OWN glyph (GH-246 defect 1) --------------------------
// #ob-drills may NOT depend on `ui/icons.js` resolving. That module arrives via
// a guarded dynamic import (the cache-poison contract allows "fresh app, absent
// icons.js") and the pill then fell back to a '◎' TEXT glyph — a DOUBLE RING,
// not the target's ring+bull, i.e. a different mark, which is exactly the
// register the owner rejected in the GH-243 pack. The path data lives HERE and
// is emitted as inline SVG at build time: zero import edge, nothing to fail, no
// boot-graph change (#49 rule 5). The drill DOCK buttons keep routing through
// icons.js with their text fallbacks (they are not first-boot chrome), and
// icons.js keeps its own frozen-stable `target` entry. The two copies are gated
// BYTE-IDENTICAL by `node web/tools/glyph-audit.mjs`, the rendered markup by
// e2e-playback arm 6d.
const PILL_GLYPH = /* OB-GLYPH:target */ '<circle cx="10" cy="10" r="6.5"/>'
  + '<circle cx="10" cy="10" r="2.1" fill="currentColor" stroke="none"/>';
/** Inline-SVG markup for inlined path data — byte-identical to what
 * ui/icons.js `iconHtml(name, { size })` emits, so the icons-absent register is
 * INDISTINGUISHABLE from the normal one. Decorative: the OWNING control keeps
 * the localized title/aria-label. */
const inlineGlyph = (paths, name, size = 20) => `<svg viewBox="0 0 20 20"`
  + ` width="${size}" height="${size}"`
  + ` fill="none" stroke="currentColor" stroke-width="1.5"`
  + ` stroke-linecap="round" stroke-linejoin="round"`
  + ` aria-hidden="true" focusable="false" data-icon="${name}">${paths}</svg>`;

const KEY = 'ob-drills-v1'; // settings.js persistence conventions (§FORMAT.md 4)
// GH-200: the aim-assist axis, mirrored from settings.js ASSIST_LEVELS
// (drills.js may not import settings.js — leaf law; values sanitized here
// exactly like KNOWN ids). best/plays/ts are keyed by {drill_id, assist}:
// a no-assist clear and a practice-assist clear are different difficulties
// and never share a leaderboard (FORMAT.md §4). Order is ASCENDING
// assistance — the mid-run latch below only ever escalates along it.
const ASSISTS = ['off', 'standard', 'practice'];
// v1→v2 load-migration target: legacy per-id records map to the settings
// DEFAULT assist level ('standard' — settings.js DEFAULTS.assist; the
// recorded choice, FORMAT.md §4).
const MIGRATE_ASSIST = 'standard';
const NEXT_MS = 1400;   // settle → next-attempt re-lay (replay taste window)
const RACK_MS = 1300;   // rack verdict → next ghost rack (beats flow's 2600ms
                        // WIN auto-rerack; the AIM transition clears its timer)
const BANNER_MS = 3000; // drill-complete banner hold
const FLOW_BANNER_MS = 2700; // flow.js banterTimer max (WIN 2600 / BALL_IN_HAND
                             // 1800) + margin — the SAME routing that delivers
                             // a completing settle arms one of those clears,
                             // which would wipe the drill-complete banner
                             // mid-hold; the hold-through wrap (#81 finding
                             // 4) swallows that clear and the total hold
                             // runs FLOW_BANNER_MS + BANNER_MS from here
// TUNING (ghost9, FORMAT.md §3): a break foul loses the rack. The official
// playing-the-ghost sheets vary here; flip to false to let a fouled break
// continue the rack instead.
const GHOST_BREAK_FOUL_LOSES = true;
const CONTAIN_SAMPLES = 240; // sample(t) walk resolution for containment
// GH-981: the stages at which a drill may start — the shell.js entry gate's
// QUIET set (playback.js keeps the same copy); anything else is a shot in
// flight the start would cut off mid-roll
const QUIET_STAGES = ['AIM', 'BALL_IN_HAND', 'WIN'];

let created = false;

/** Idempotent entry point (called once from the guarded main.js seam). Kit
 * and catalog access are feature-detected: if either import fails (stale
 * mixed cache), createDrills installs NOTHING — inert stub. */
export function createDrills({ machine, game, hud }) {
  // GH-650 (feature 037) ball-return extension — host seam (feature 037 (internal spec)
  // return-extension/contracts/ballreturn.md §2): a guarded import of a scene
  // leaf that registers frame/stateChange hooks ONLY when the active table
  // carries pocketSystem 'return-track' (or a scripted boot arms a TEST track
  // by ?ballreturn=). Absent/stale module or a table without the flag = today's
  // behaviour byte-identically; idempotent; never a throw. Placed BEFORE the
  // created guard on purpose (the install is its own idempotent register).
  try {
    import('../scene/ballreturn/index.js')
      .then((m) => m.installBallReturn?.({ machine, game })).catch(() => {});
  } catch { /* inert */ }
  if (created) return;
  created = true;
  try {
    Promise.all([import('./ui/dialog.js'), import('./drills/catalog.js')])
      .then(([dialog, catalog]) => {
        if (typeof dialog.openPanel !== 'function'
          || !Array.isArray(catalog.DRILLS)) return; // stale kit — inert
        try { install({ machine, game, hud, dialog, catalog }); } catch { /* inert */ }
      })
      .catch(() => { /* inert stub — cache-poison contract */ });
  } catch { /* inert stub */ }
}

function install({ machine, game, hud, dialog, catalog }) {
  // GH-461: CRITICAL pill skin, SYNCHRONOUS (the settings.js GH-246 gear
  // precedent) — the async leaf sheet left the toolbar pill first-painting
  // as the UA default button (blank white disc) which its own `transition:
  // background` then animated dark through the boot overlay fade. Settled
  // base skin verbatim (incl. the toolbar order-6 slot, so the pill never
  // paints leftmost pre-sheet), injected BEFORE the link so the arriving
  // sheet stays authoritative on every equal-specificity tie.
  if (!document.getElementById('ob-drills-crit')) {
    const crit = document.createElement('style');
    crit.id = 'ob-drills-crit';
    crit.textContent = `
      #ob-toolbar > #ob-drills { order: 6; }
      /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY;
         material, rungs, coarse 44 and reduced motion are the kit toolbar
         part (.ob-btn--glass + .ob-toolbar-pill) */
      #ob-drills { position: fixed; top: 98px; right: 10px; }
    `;
    document.head.appendChild(crit);
  }

  // ---- skin: LEAF stylesheet with the ?v= cache-bust law -------------------
  if (!document.getElementById('ob-drills-css')) {
    const link = document.createElement('link');
    link.id = 'ob-drills-css';
    link.rel = 'stylesheet';
    link.href = new URL(`./ui/drills.css?v=${DRILLS_CSS_V}`, import.meta.url);
    document.head.appendChild(link);
  }
  let icons = null; // ui/icons.js (#49) — guarded import below

  // ---- snooker layout mirror (issue #80) ------------------------------------
  // games/layouts.js is a NEW leaf on the shipped dist graph — guarded
  // dynamic import per the cache-poison contract (the flow.js snookerGeo
  // shape). A REJECTED/shape-stale import ⇒ snooker drills REFUSE cleanly
  // (start() + __drills.layout() return false/null) while every pool drill
  // runs untouched; a merely PENDING healthy import must NOT refuse —
  // start() awaits `snookerGeoReady`, so an immediate tap in the first
  // ~100 ms after install parks on the import instead of spuriously
  // refusing (review finding 2; the .catch settles the promise, so that
  // await never throws). Drift-tested kernel mirror: snooker layouts must
  // compose on THESE constants, never the active table's diamond grid —
  // the WPBSA table is not 2:1, so diamondCtx math silently skews there.
  let snookerGeo = null;
  let snookerGeoReady = Promise.resolve(); // pre-settled for the throw path
  try {
    snookerGeoReady = import('../dist/pool-sdk/games/layouts.js')
      .then((l) => {
        if (l.SNOOKER_LAYOUT?.spots?.[21]) snookerGeo = l.SNOOKER_LAYOUT;
      })
      .catch(() => { /* leaf absent — snooker drills refuse, pool drills live */ });
  } catch { /* same degrade */ }

  // ---- kitchen-constrained drill placement (issue #79 defect 2) ------------
  // flow.js already wrapped the frozen game.placeCue with the ACTIVE match
  // placement right — which resetMatch resets to 'anywhere' on every drill
  // layout/rerack. A drill-granted KITCHEN window pre-clamps the target
  // behind the head string, then rides that same validated path (bed clamp
  // + overlap rejection intact, so a drag can never disturb object balls).
  // Passthrough whenever no drill kitchen grant is live (grant closes at
  // the stroke), so flow's own foul/BIH placements are untouched.
  const flowPlaceCue = game.placeCue;
  game.placeCue = (kx, ky) => {
    if (grant === 'd' && machine.state === 'BALL_IN_HAND') {
      // snooker D grant (issue #80, FORMAT.md §1a 'd'): ride the frozen
      // game.js D clamp (WPBSA Sec3 R5 "Playing from In-hand" — the issue
      // #62 erratum: R8 is Touching Ball; the D is INCLUSIVE, "on or
      // within") — feature-detected; a stale game.js degrades to the
      // baulk-line pre-clamp over flow's validated path (the kitchen
      // region strictly contains the D on this table)
      if (typeof game.placeCueInD === 'function') {
        return game.placeCueInD(kx, ky);
      }
      ky = Math.min(ky, snookerGeo?.baulkY
        ?? -game.template.system.table.length / 4);
    }
    if (grant === 'kitchen' && machine.state === 'BALL_IN_HAND') {
      // EXCLUSIVE of the head string (GH-370 class 2, WPA 2.1/3.10 —
      // "above the Head String" does not include the line); mirrors the
      // game.js kitchen clamp bound
      ky = Math.min(ky, -game.template.system.table.length / 4 - 1e-6);
    }
    return flowPlaceCue(kx, ky);
  };

  // ---- drill-end notice + the #banner hold (issue #81 findings 2 + 4; GH-668
  // S5 slice 4 B-PR05 / R11) --------------------------------------------------
  // The drill's END message no longer rides #banner (the FOUL / WIN caps
  // register, app.html): it is a drills-owned KIT NOTICE — div#ob-drill-end
  // .ob-prompt.ob-prompt--notice (kit.css owns placement 84 / 88 + safe-area,
  // the --ob-info-line register cue, the solid rung, balanced wrapping) with
  // TWO lines: .ob-drill-end__title.ob-control = "{name} · {score}/{max}" and
  // .ob-prompt__body.ob-body = the sentence-case verdict ("Drill complete" /
  // "Run ended — <reason>" [· "New personal best!"]) — no assist tag (R11).
  // It enters / exits through motion.js (B-K22, feature-detected; the flip
  // is display-based so the stale-module rung and the e2e inline-style reads
  // keep working). The hold WINDOW is unchanged: FLOW_BANNER_MS + BANNER_MS
  // from complete(), ONE timer (bannerTimer), ended early by a user tap or a
  // foreign-table exit.
  // finding 4 (kept, now a guard): flow's banterTimer (BALL_IN_HAND 1800 /
  // WIN 2600 ms) rides the SAME settle routing that delivers a completing
  // shot, and flow's renderText re-paints the same settle's foul / win text
  // on a locale flip or stateChange. While the hold is live #banner is EMPTY
  // (the settle's foul / win banner is cleared as the notice mounts — the
  // pre-#81 chain overwrote it too) and every foreign setBanner is swallowed
  // so the foul text cannot come back over the verdict; drills' own paths
  // call endBannerHold() first, so they always land. Delete-candidate once
  // e2e-drills arm 6 has proven the notice on main (plan G5 follow-up).
  // finding 2 (kept as the seam): the notice wears .ob-drills-banner for
  // exactly the hold — touch.css §3.11 `:has(.ob-drills-banner) #hud-hint`
  // yields the reason-hint band to it on phones; the class lives exactly as
  // long as the hold (never static: :has() would hide the hint forever).
  // `bannerHold` stores the compose closure (() => { title, body }) — the
  // locale relabel recomposes through it (finding 6) without re-entering.
  const rawSetBanner = hud.setBanner;
  let bannerHold = null; // () => ({ title, body }) while the hold window is live
  let endEl = null, endTitle = null, endBody = null;
  let motion = null; // ui/motion.js (B-K22) — enter/exit ride it when present
  import('./ui/motion.js').then((m) => { motion = m; }).catch(() => {});
  function ensureEnd() {
    if (endEl) return endEl;
    endEl = document.createElement('div');
    endEl.id = 'ob-drill-end';
    endEl.className = 'ob-prompt ob-prompt--notice';
    endEl.setAttribute('role', 'status');
    endEl.setAttribute('aria-live', 'polite');
    endEl.style.display = 'none';
    // the first line is the CONTROL role (14 / 560), not the kit prompt
    // title (.ob-prompt__title = the 16 title role by cascade) — a status
    // is compact; the hook class is for probes (e2e-drills END_STATE)
    endTitle = document.createElement('div');
    endTitle.className = 'ob-drill-end__title ob-control';
    endBody = document.createElement('p');
    endBody.className = 'ob-prompt__body ob-body';
    endEl.append(endTitle, endBody);
    document.body.appendChild(endEl);
    return endEl;
  }
  const paintEnd = (msg) => {
    ensureEnd();
    endTitle.textContent = msg.title;
    endBody.textContent = msg.body;
  };
  function holdBanner(compose) {
    bannerHold = compose;
    rawSetBanner(''); // #banner stays EMPTY under the hold (the caps register is flow's)
    paintEnd(compose());
    endEl.classList.add('ob-drills-banner');
    endEl.style.display = 'block'; // explicit: e2e reads the inline style
    motion?.enter(endEl); // kills an in-flight exit (rapid re-complete)
  }
  function endBannerHold() {
    bannerHold = null;
    if (!endEl) return;
    endEl.classList.remove('ob-drills-banner');
    if (endEl.style.display === 'none') return;
    if (motion) motion.exit(endEl); // display:none after the 120 ms fade
    else endEl.style.display = 'none';
  }
  // GH-668 S5 slice 4 round 10 (review r2 P2-2): the notice is OFF #banner,
  // so hud.js's tap-dismiss notification — gated on ITS banner being shown
  // (bannerShown, which the hold's own rawSetBanner('') clears) — never
  // fires for a notice tap: flow.js's onBannerDismiss subscriber (bannerKind
  // = null) is not reached, and a live-fold run that ended on a FOUL kept
  // flow's 'foul' armed through its 1.8 s window after the user waved the
  // verdict away — renderText re-painted that foul on the next locale flip
  // (or a DVR re-emission) as if never dismissed; the base cleared it (its
  // summary rode #banner, so HUD's notification fired). Reaching the shared
  // path from here needs a hud.js byte (an accessor that fires the
  // subscribers for an owner-declared transient) — outside this lane; until
  // then drills mirrors flow's dismissal OUTCOME at this seam, which every
  // flow paint already crosses: after a tap under the hold, the dismissed
  // settle's foul-toned re-assert is swallowed until the next stroke (a
  // PLAYBACK that is not a DVR borrow), a foreign table or start()/stop()
  // — exactly the writes flow's own handler would have prevented. Round 10
  // swallowed tone 'foul' only and no empty write (the one-writer law:
  // flow's reaper still nulls its own state on schedule). e2e-practice-stale S5.
  // GH-668 S5 practice round 13 (review r3 P2-1): the foul-only mirror left
  // the WIN tone open — a live-fold run that ended in WIN (colours-clear:
  // the black-on foul ends the FRAME, flow routes WIN and paints the
  // frame-win banner in tone 'win') had its tapped notice's banner back on
  // the next locale repaint (renderText re-asserts an armed 'win') and on a
  // DVR restore (the close re-routes through WIN, where flow re-arms 'win'
  // unless winDismissed — which the off-#banner tap never set). The mirror
  // now settles the dismissal for EVERY kind flow publishes on #banner
  // (flow.js bannerKind, read only: 'win' | 'foul' | 'callUnfulfilled';
  // painted as tone 'win' — the WIN and DRAW banners — and tone 'foul' —
  // the foul banner AND the call-unfulfilled banner, amber on the same
  // tone; hud.setBanner's tone set is undefined | 'win' | 'foul'): every
  // TONED non-empty write is swallowed while the dismissed settle stands.
  // UNTONED writes stay untouched — never flow's re-assert (record.js's
  // savedDownload toast, an e2e direct write) — and the empty write is the
  // reaper's own wipe. The swallow still ends at the next stroke, a fresh
  // table (after a WIN the runner's own 1.3 s frame is that table) or
  // start()/stop(). e2e-practice-stale S6 (win: locale repaint + DVR
  // restore) beside S5 (foul).
  let settleDismissed = false;
  hud.setBanner = (text, tone) => {
    if (bannerHold) return; // the hold owns the surface (finding 4)
    if (settleDismissed && text && (tone === 'win' || tone === 'foul')) return; // the dismissed settle's re-assert, any tone flow paints
    rawSetBanner(text, tone);
  };
  // issue #71 law for the notice: a REAL user tap anywhere dismisses the
  // transient and kills the hold-end timer (no resurrection). The notice is
  // pointer-events: none (kit), so the tap still reaches its target; hud's
  // own dismiss listener never fires for it (#banner is empty under the
  // hold), hence this drills-owned twin of the same capture-phase seam.
  window.addEventListener('pointerdown', () => {
    if (!bannerHold) return;
    endBannerHold();
    settleDismissed = true; // round 10 / 13: the settle's re-assert (any tone flow paints) is waved away with the verdict
    clearTimeout(bannerTimer); bannerTimer = 0;
  }, { capture: true, passive: true });

  // ---- live drill hint tracking (issue #81 finding 6) -----------------------
  // Every drill-set hint goes through drillHint with a compose closure; the
  // locale relabel recomposes it IFF the showing hint is still ours (text
  // match — a later flow hint or an expired/dismissed hint never resurrects).
  let hintCompose = null;
  let hintText = '';
  function drillHint(compose) {
    hintCompose = compose;
    hintText = compose();
    hud.setHint(hintText);
  }

  // ---- persistence (settings.js conventions; hermetic-boot law: reads are
  // free, writes happen only on user-initiated drill activity) --------------
  const KNOWN = new Set(catalog.DRILLS.map((d) => d.id));
  const sanRec = (rec) => ({
    best: rec.best, plays: Number(rec.plays) || 0, ts: Number(rec.ts) || 0,
  });
  function loadBlob() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { v: 2, last: null, drills: {} };
      const p = JSON.parse(raw);
      const out = { v: 2, last: KNOWN.has(p?.last) ? p.last : null, drills: {} };
      for (const [id, rec] of Object.entries(p?.drills ?? {})) {
        if (!KNOWN.has(id)) {
          console.warn(`[drills] dropping stale progress entry '${id}'`);
          continue;
        }
        if (p?.v === 2) {
          // v2 (GH-200): per-assist records under each drill id
          const modes = {};
          for (const [mode, m] of Object.entries(rec ?? {})) {
            if (!ASSISTS.includes(mode) || typeof m?.best !== 'number') {
              console.warn(`[drills] dropping stale progress entry '${id}.${mode}'`);
              continue;
            }
            modes[mode] = sanRec(m);
          }
          if (Object.keys(modes).length) out.drills[id] = modes;
        } else if (typeof rec?.best === 'number') {
          // v1 → v2 load-migration (GH-200): the legacy flat record maps to
          // the DEFAULT assist mode. IN-MEMORY only — the hermetic-boot law
          // stands: the migrated shape reaches localStorage on the next
          // user-initiated persist(), never at load.
          out.drills[id] = { [MIGRATE_ASSIST]: sanRec(rec) };
        } else {
          console.warn(`[drills] dropping stale progress entry '${id}'`);
        }
      }
      return out;
    } catch { return { v: 2, last: null, drills: {} }; }
  }
  let blob = null; // lazy — never touched at module install
  const progress = () => (blob ??= loadBlob());
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(progress())); } catch { /* private mode */ }
  }

  // ---- assist-mode tracking (GH-200; reads only — hermetic-boot law) --------
  // Seed from the settings seam (drills installs AFTER the boot broadcast),
  // then follow every ob:settings 'assist' broadcast (the sessionMode
  // pattern below). A live run LATCHES the mode it started under and only
  // ever ESCALATES to a more-assisted level on a mid-run flip (never
  // de-escalates): the score is credited against the EASIEST assistance
  // that touched the run.
  let sessionAssist = MIGRATE_ASSIST;
  try {
    const v = window.__settings?.get?.().assist;
    if (ASSISTS.includes(v)) sessionAssist = v;
  } catch { /* stale seam — the default stands */ }
  window.addEventListener('ob:settings', (e) => {
    if (e?.detail?.key !== 'assist' || !ASSISTS.includes(e.detail.value)) return;
    sessionAssist = e.detail.value;
    if (active && ASSISTS.indexOf(sessionAssist) > ASSISTS.indexOf(active.assist)) {
      active.assist = sessionAssist; // mid-run escalation only
    }
    if (isOpen) renderCards(); // the picker best line reads the ACTIVE mode
  });
  /** ' · '-joined assist tag for the picker best lines (JS punctuation,
   * never a translatable join — the GH-144 chips law; the end notice does
   * NOT carry it since GH-668 B-PR05 / R11). */
  const assistTag = (mode) => ' · ' + t(`drills.assist.${mode}`);

  // ---- record analysis (pure reads over ShotRecord bytes) ------------------
  function analyze(record) {
    const a = {
      firstContact: null, pots: [], cueCushions: 0, cueContacts: 0,
      cuePocketed: false, cueOff: false,
      obOff: [], // object-ball ids driven off the table (GH-370 class 5:
                 // the Dr Dave rotation sheet fouls + spots them)
    };
    for (const e of record?.events ?? []) {
      const k = e.kind;
      if (!k || typeof k === 'string') continue; // 'Rest'
      if (k.BallBall && (k.BallBall.b1 === 0 || k.BallBall.b2 === 0)) {
        // issue GH-134 (clean-contact law): count EVERY cue↔object BallBall
        // event — the predicate is `cueContacts > 1` after the first contact
        if (a.firstContact === null) {
          a.firstContact = k.BallBall.b1 === 0 ? k.BallBall.b2 : k.BallBall.b1;
        }
        a.cueContacts += 1;
      }
      if (k.BallPocket) {
        a.pots.push({ ball: k.BallPocket.ball, pocket: k.BallPocket.pocket });
        if (k.BallPocket.ball === 0) a.cuePocketed = true;
      }
      if (k.BallOffTable?.ball === 0) a.cueOff = true;
      else if (k.BallOffTable) a.obOff.push(k.BallOffTable.ball);
      if (k.BallLinearCushion?.ball === 0 || k.BallCircularCushion?.ball === 0) {
        a.cueCushions += 1;
      }
    }
    return a;
  }

  /** GH-384 (BU F5 positions 5-7 — "the CB must rebound off the end rail"):
   * did the cue ball contact a FOOT-end cushion ON ITS WAY TO THE TARGET,
   * i.e. AFTER the object-ball hit (the sheet's path law describes the
   * post-stun drift; review GH-384 r1: an in-hand address banked off the
   * foot rail BEFORE the contact must not satisfy the rebound)? Pure
   * record bytes: cushion events before the first cue↔object BallBall are
   * skipped, and every later cue cushion event's segment resolves against
   * the record's OWN table geometry (initial.table.linear[seg].p1/p2,
   * .circular[arc].center) — a foot-end segment/arc has ALL its geometry
   * beyond +length/4 (the foot nose and its corner facings/jaw arcs sit at
   * ~+l/2, while a long-rail segment reaches a side pocket at y≈0, so its
   * min endpoint disqualifies it). No physics re-derived (P-II);
   * FORMAT.md §2 `needFootCushion`. */
  function footRebound(record) {
    const tbl = record?.initial?.table;
    if (!tbl) return false;
    const q = tbl.length / 4;
    let contacted = false;
    for (const e of record?.events ?? []) {
      const k = e.kind;
      if (!k || typeof k === 'string') continue; // 'Rest'
      if (k.BallBall && (k.BallBall.b1 === 0 || k.BallBall.b2 === 0)) {
        contacted = true;
      }
      if (!contacted) continue; // pre-contact cushions never count
      if (k.BallLinearCushion?.ball === 0) {
        const s = tbl.linear?.[k.BallLinearCushion.seg];
        if (s && Math.min(s.p1.y, s.p2.y) > q) return true;
      }
      if (k.BallCircularCushion?.ball === 0) {
        const c = tbl.circular?.[k.BallCircularCushion.arc];
        if (c && c.center.y > q) return true;
      }
    }
    return false;
  }

  /** Sampler slot index per ball id (sampler order = the record's initial
   * ball order — the flow.js caromPreJudge read precedent). */
  const slotOf = (record, id) =>
    (record?.initial?.balls ?? []).findIndex((b) => b.id === id);

  /** Rest positions {id → {x, y}} + pocketed set from the kernel sampler at
   * duration (post-settle read; g.buf is the SDK's shared sample buffer —
   * the rollcorrect post-hoc re-sampling precedent). */
  function restPositions(record) {
    const rest = new Map();
    if (!game.sampler || !game.buf) return rest;
    game.sampler.sampleAt(game.duration);
    (record?.initial?.balls ?? []).forEach((b, i) => {
      const o = 8 * i;
      if (game.buf[o + 7] === 4 /* Pocketed */) return;
      rest.set(b.id, { x: game.buf[o], y: game.buf[o + 1] });
    });
    return rest;
  }

  /** sample(t) containment walk for the cue ball — evaluated ONCE at settle
   * (never in the frame loop); restores the buffer to the duration sample. */
  function cueStaysWithin(record, zone) {
    const slot = slotOf(record, 0);
    if (slot < 0 || !game.sampler || !game.buf) return true;
    const dur = game.duration;
    let ok = true;
    for (let i = 0; i <= CONTAIN_SAMPLES && ok; i++) {
      game.sampler.sampleAt((dur * i) / CONTAIN_SAMPLES);
      const dx = game.buf[8 * slot] - zone.x, dy = game.buf[8 * slot + 1] - zone.y;
      if (dx * dx + dy * dy > zone.r * zone.r) ok = false;
    }
    game.sampler.sampleAt(dur); // leave the shared buffer at the settle pose
    return ok;
  }

  const inZone = (p, z) => {
    if (!p) return false;
    if (z.kind === 'circle') {
      const dx = p.x - z.x, dy = p.y - z.y;
      return dx * dx + dy * dy <= z.r * z.r;
    }
    // paper-target rect in the shot-line frame (FORMAT.md §2)
    const rx = p.x - z.cx, ry = p.y - z.cy;
    const along = rx * z.ux + ry * z.uy;
    const across = rx * -z.uy + ry * z.ux;
    // GH-384 overlap semantics (BU "within or OVERLAPPING the target"):
    // a rect carrying `overlapR` admits any BALL overlapping the paper —
    // the true circle-vs-rect test (clamped distance to the rect ≤ r),
    // i.e. the ROUNDED Minkowski sum, never a square-corner inflation
    // (review GH-384 r1: inflating both half-extents passes centers near
    // the corners that do not actually touch the paper).
    if (z.overlapR) {
      const da = Math.max(0, Math.abs(along) - z.halfAlong);
      const dc = Math.max(0, Math.abs(across) - z.halfAcross);
      return da * da + dc * dc <= z.overlapR * z.overlapR;
    }
    return Math.abs(along) <= z.halfAlong && Math.abs(across) <= z.halfAcross;
  };

  /** Evaluate one settled shot against a declarative objective. Returns
   * { pass, points, potCount, reason } — reason is an i18n suffix. */
  function evaluate(record, objective) {
    const a = analyze(record);
    const scratch = a.cuePocketed || a.cueOff;
    const objPots = a.pots.filter((p) => p.ball !== 0);
    const out = { pass: false, points: 0, potCount: objPots.length, reason: 'miss' };
    if (objective.noScratch && scratch) { out.reason = 'scratch'; return out; }
    // GH-384 review r2: `noCueOff` fails ONLY the driven-off-the-table cue —
    // the word for drills whose sheet allows the pocketed-cue scratch (BU F1
    // "you are allowed to scratch") without also legalizing the distinct
    // off-table foul the sheet never mentions (silence keeps the pre-384
    // strictness). Same reason family as the scratch it narrows.
    if (objective.noCueOff && a.cueOff) { out.reason = 'scratch'; return out; }
    if (objective.firstContact !== undefined
      && a.firstContact !== objective.firstContact) {
      out.reason = 'contact'; return out;
    }
    if (objective.noCueCushion && a.cueCushions > 0) {
      out.reason = 'cushion'; return out;
    }
    // GH-384 (BU F5 sheet path law, positions 5-7): the mirror constraint —
    // the cue ball MUST rebound off the end (foot) rail on its way to the
    // target. Same precedence slot as its noCueCushion sibling (path laws
    // before the pot block), reason 'norail'.
    if (objective.needFootCushion && !footRebound(record)) {
      out.reason = 'norail'; return out;
    }
    if (objective.pot?.ball !== undefined) {
      const hit = objPots.find((p) => p.ball === objective.pot.ball);
      if (!hit) { out.reason = 'miss'; return out; }
      if (objective.pot.pocket !== undefined
        && hit.pocket !== objective.pot.pocket) {
        out.reason = 'pocket'; return out;
      }
    } else if (objective.pot?.count !== undefined) {
      // issue GH-131 (only-pocket law): pot {count, pocket} restricts the
      // WHOLE stroke to the designated pocket — any object ball dropped
      // elsewhere fails the attempt (reason 'pocket'), still purely
      // BallPocket-byte-derived (FORMAT.md §2).
      if (objective.pot.pocket !== undefined
        && objPots.some((p) => p.pocket !== objective.pot.pocket)) {
        out.reason = 'pocket'; return out;
      }
      if (objPots.length < objective.pot.count) {
        out.reason = 'miss'; return out;
      }
    }
    // issue GH-134 (the lineup family's clean-contact law): after the cue's
    // FIRST BallBall contact, ANY further cue↔object contact fails the stroke
    // (reason 'crash'); cue↔cushion contact stays legal. Placed AFTER the pot
    // block and BEFORE containCue, so the effective precedence is scratch >
    // contact > cushion > pocket > miss > crash — a dry stroke reads 'miss'
    // before the crash word is consulted, and the onSettle rotation override
    // ('contact', GH-131 finding 4) still outranks 'crash'. Recorded owner
    // boundaries (FORMAT.md §2): CUE-BALL-ONLY scope (object↔object
    // disturbance never fails) and the literal count>1 predicate also fails
    // a double-kiss on the designated ball.
    if (objective.cleanContact && a.cueContacts > 1) {
      out.reason = 'crash'; return out;
    }
    if (objective.containCue && !cueStaysWithin(record, objective.containCue)) {
      out.reason = 'exit'; return out;
    }
    out.points = 1;
    if (objective.cueRest) {
      const rest = restPositions(record).get(0) ?? null;
      const zoneOk = inZone(rest, objective.cueRest);
      if (objective.zoneOptional) {
        out.pass = true; // the pot stands; the zone is the second point
        out.points += zoneOk ? 1 : 0;
        if (!zoneOk) out.reason = 'zone';
        return out;
      }
      if (!zoneOk) { out.points = 0; out.reason = 'zone'; return out; }
    }
    out.pass = true;
    return out;
  }

  // ---- runner state ---------------------------------------------------------
  let active = null;      // serializable-ish run state (see stateOut)
  let finished = null;    // final-state snapshot of the LAST completed run —
                          // complete() nulls `active` (issue #79: a done run
                          // must never park the teardown guards), this keeps
                          // the __drills.state() wire readable post-run AND
                          // drives the dock's post-completion ↻ replay
                          // register (GH-133); cleared by start()/stop()
                          // (incl. settings changeMode's foreign-mode stop)
  let grant = null;       // live drill-granted cue placement window:
                          // null | 'anywhere' | 'kitchen' (issue #79 defect
                          // 2) — set when the runner enters BALL_IN_HAND for
                          // an attempt, closed at the stroke (PLAYBACK)
  let lastRecord = null;  // replay identity guard (the flow.js pattern)
  let nextTimer = 0;      // pending re-lay/rack timer
  let nextFn = null;      // the LAST-ARMED re-lay (rest positions for run
                          // drills; relayRotationRack/relayTen/relayPenalty
                          // closures for the rack kinds). issue GH-323: a
                          // LATCH, not a pending marker — the tick consumes
                          // the timer but keeps nextFn, so the shotComplete
                          // replay-identity branch can re-run the re-lay
                          // that ALREADY LANDED when an in-app Replay
                          // re-settles over it (nextTimer === 0 alone
                          // cannot tell 'parked at PLAYBACK entry' from
                          // 'landed'; the old applyAttempt fallback re-laid
                          // the FULL attempt while the run state — score,
                          // a.onTable — stayed advanced, and the next
                          // stroke fouled wrong-first). Pending-ness is
                          // always read off nextTimer; the latch clears
                          // with the run (clearTimers/complete).
  let bannerTimer = 0;    // drill-complete banner clear
  let winRelayTimer = 0;  // post-terminal fresh-frame re-lay (issue #80): a
                          // sequence run ending on the black routes WIN, and
                          // flow's 2600 ms auto re-rack would kill the held
                          // completion banner — the runner's OWN re-rack
                          // inside the window pre-empts it (RACK_MS law)
  let winRelayParked = false; // the relay above, parked across a DVR borrow
                          // (GH-257 review final round): the borrow's
                          // PLAYBACK burned the timer against its WIN
                          // check — re-armed when the close restores WIN
  let replayHeldGrant = null; // synthetic grant parked across an in-app
                          // Replay (GH-370 review r6 P2) — re-opened by the
                          // replay-identity settle, consumed by strokes
  let replayHeldPos = null; // the cue's kernel pose parked WITH the grant
                          // (review r7 P2: the user's dragged position must
                          // survive the replay — flow's savedBihPos serves
                          // only flow-routed BALL_IN_HAND, not drill grants)
  let voidShot = false;   // a stroke fired between settle and our re-lay
  let rackDecided = false; // per-rack decided latch (racks protocol): set at
                           // the verdict, cleared when OUR seeded re-rack
                           // lands — an interloping stroke inside the RACK_MS
                           // window (flow parks in BALL_IN_HAND, shooting
                           // enabled) must never record a second verdict
                           // against the decided rack (review finding 3)
  let expectRerack = false; // our own rerack/layout transitions (state sync)
  let expectLayout = false;
  let dockHold = false;   // same-id restart (reset): teardownChrome keeps
                          // the dock's live register across start()'s
                          // silent stop — no opener-only flash between the
                          // stop and start()'s final renderDock (GH-120
                          // review nit 3c); refusal paths re-render via
                          // refuse()
  let confirmEl = null;   // the LIVE dock confirm panel (confirmThen) —
                          // teardownChrome cancels it when the run ends
                          // mid-confirm (GH-120 review finding 2)
  let snookerVariantPinned = false; // GH-382 decision 2: the colours
                          // drills' transient v1 rules pin is live —
                          // stop()/refuse() restore the persisted map
  let zoneResolved = false; // GH-442: the live attempt's cueRest zone has
                          // been JUDGED (evaluate() ran at this settle) —
                          // objectiveZone() reads null from the verdict to
                          // the next attempt's lay, so the aim-lane decal
                          // fades out at resolution and re-arms with the
                          // re-lay (the issue's visibility grammar). Set
                          // in onSettle's generic path only: the cueRest
                          // vocabulary lives exclusively on the ladder/
                          // stations/run kinds (FORMAT.md §2)

  /** GH-382 decision 2, the release half (review r33 P2: EVERY exit path,
   * refusal included — a stranded pin would hold the session on frozen
   * v1 after a failed start). Guarded twice: only when the working value
   * is still OUR pin (a replay overlay or a user pick supersedes it) and
   * never during an active shared replay (its transient variant is the
   * SENDER's, not ours to restore). A pin stranded by either guard is
   * the safe direction — frozen v1 until the next boot/replay restore. */
  function releaseSnookerVariantPin() {
    if (!snookerVariantPinned) return;
    snookerVariantPinned = false;
    try {
      if (window.__settings?.variantFor?.('snooker') === 'wpbsa-snooker'
        && window.__share?.replay?.()?.active !== true) {
        window.__settings.restorePersistedVariants?.();
      }
    } catch { /* stale seam — keep the pin; next boot restores */ }
  }

  // ---- drill session (GH-980 / GH-982) ---------------------------------------
  // A drill OWNS the table from start() until its session ends — through the
  // live run (`active`) AND the parked post-run snapshot (`finished`, the
  // GH-133 register). `session` records what the drill borrowed, so the exit
  // hands back a table identical to a FRESH entry of the destination
  // (practice idle, Play, Free practice): table, rules, settings, layout and
  // the hall's current card agree again.
  //   restore — the game to bring back when the drill pinned one
  //     SESSION-only through the settings layer (the §3.5 9-ball sandbox
  //     pin from another pool game, the century 14.1 pin); null when
  //     nothing is borrowed: already on the drill's game, or the drill
  //     switched the table PERSISTENTLY (the #80 snooker pin, and the pool
  //     pin from a non-pool table — both declared by the picker's
  //     "Switches the table to …" badge, FORMAT.md §1b.1).
  //   pin — the game the session pin staged (the restore guard: a user's
  //     own game switch in between supersedes the pin, never restored over).
  // Every exit — dock Stop, __drills.stop, a mode change away from practice
  // (settings changeMode), a foreign re-rack (Re-rack, game/equipment
  // switch), a refused or aborted start — runs endSession(): the borrowed
  // game comes back and a fresh rack (a NEW match: breaker seat 1) replaces
  // the drill layout. Pre-fix the pool pin went straight to __rules.setGame
  // (settings.values.game kept the old game, nothing restored it) and every
  // exit left the drill layout under the 9-ball fold, which could never
  // end the frame.
  let session = null;
  let sessionExit = null; // the in-flight endSession() task — start() awaits it
  let starting = false;   // start() is between its hand-off stop and `active`
  // Table-ownership generations (review r1 P2): every fresh table — a re-rack
  // {seed} or a scripted layout, ours or foreign — bumps tableGen; a layout
  // also bumps layoutGen. Deferred work captures the generation it was queued
  // under and re-checks it at RUN time, so a newer owner of the table (the
  // atelier's Try it comparison layout, laid synchronously right after the
  // changeMode('playground') that ended the session; a shared replay's
  // transport; a DVR borrow) is never overridden by a stale teardown — one
  // token instead of per-path cancel calls.
  let tableGen = 0;
  let layoutGen = 0;
  let layoutTable = null; // the latest scripted layout: { gen, shot }

  const nonPoolGame = (gid) => gid === 'snooker' || /^carom/.test(gid ?? '');
  /** settings.js rackPristine (fail-closed there); the shotless idiom when
   * the seam is absent (stale settings.js). */
  const rackPristine = () => {
    try {
      const r = window.__settings?.rackPristine?.();
      if (typeof r === 'boolean') return r;
    } catch { /* stale seam */ }
    return game.shotIndex === 0;
  };
  /** GH-981: a pending post-shot decision on a PROGRESSED rack — the
   * settings.js decisionConflict predicate (GH-541 ruling 7), which the old
   * pool pin bypassed by never calling changeGame. A pristine rack's
   * address-born decision re-raises on any re-rack, so it never conflicts. */
  const decisionConflict = () => {
    try {
      if ((window.__rules?.matchState?.()?.pendingDecision ?? null) === null) {
        return false;
      }
    } catch { return false; }
    return !rackPristine();
  };
  const replayActive = () => {
    try { return window.__share?.replay?.()?.active === true; } catch { return false; }
  };
  const settingsGame = () => {
    try { return window.__settings?.get?.().game ?? game.gameId; } catch { return game.gameId; }
  };

  /** Session-only game pin through the settings layer (setTransientGame:
   * values.game follows, nothing persisted, no equipment change) — the
   * hall, the HUD and the rules then name the same game. Stale settings.js
   * (no transient lane): the pre-fix direct stage. Records the restore. */
  async function pinSessionGame(id) {
    const from = game.gameId;
    let ok = false;
    try {
      if (typeof window.__settings?.setTransientGame === 'function') {
        await window.__settings.setTransientGame(id);
        ok = game.gameId === id;
      } else if (typeof window.__rules?.setGame === 'function') {
        ok = await window.__rules.setGame(id);
      }
    } catch { ok = false; }
    if (!ok || game.gameId !== id) return false;
    if (session.restore === null) session.restore = from;
    session.pin = id;
    return true;
  }

  /** PERSISTING discipline switch (the #80 path, FORMAT.md §1b.1): adopts
   * the per-game equipment pairing, rebuilds the table, re-racks. Through
   * the public settings api only (its confirm-free scripted lane). Stale
   * settings.js: stage the game, then rebuild the visual table (the
   * activateSnooker wire shape). Nothing is borrowed afterwards. */
  async function switchGamePersisted(id) {
    let ok = false;
    try {
      if (typeof window.__settings?.changeGame === 'function') {
        ok = await window.__settings.changeGame(id, { skipConfirm: true });
      } else if (typeof window.__rules?.setGame === 'function') {
        ok = await window.__rules.setGame(id);
        const eq = game.template?.system?.equipment;
        if (ok && eq?.table_id) {
          window.dispatchEvent(new CustomEvent('ob:settings',
            { detail: { key: 'equipment', value: { ...eq } } }));
        }
      }
    } catch { ok = false; }
    if (!ok || game.gameId !== id) return false;
    session.restore = null;
    session.pin = null;
    return true;
  }

  /** Bring the session-only pin back (see `session`) — SYNCHRONOUSLY at the
   * session's end, so no newer owner can exist yet: the Try it comparison
   * layout lands in the same task right after the mode change that ended
   * the session (review r1 P2), and a deferred restore would stage the old
   * game under it. Only while the live game is still the drill's own pin
   * (a user's switch in between supersedes it), no shared replay holds the
   * table (its exit restores the persisted game itself), and no other
   * settings transaction is in flight — set('game') would cancel a live
   * atelier preview or a table request still building (the latest request
   * owns the commit); then the pin lingers, consistent (values.game ==
   * rules), until the next game pick or reload. Returns the staging promise
   * (resolves true once the restored game is staged) or null. */
  function restoreSessionPin(s) {
    if (!s.restore || !s.pin || s.restore === game.gameId) return null;
    if (game.gameId !== s.pin || settingsGame() !== s.pin || replayActive()) return null;
    try {
      if (window.__settings?.preview?.active?.()) return null;
      if (window.__tableBuild?.status?.()?.status === 'PENDING') return null;
      if (typeof window.__settings?.setTransientGame === 'function') {
        return Promise.resolve(window.__settings.setTransientGame(s.restore))
          .then(() => game.gameId === s.restore, () => false);
      }
      if (typeof window.__rules?.setGame === 'function') {
        // stale settings.js: the direct stage re-racks itself — that fresh
        // table bumps tableGen, so the queued rack below stands down
        return window.__rules.setGame(s.restore).then(() => false, () => false);
      }
    } catch { /* the pin stays — values.game still names it */ }
    return null;
  }

  /** End the drill session (see `session`). `fresh`: the drill's layout is
   * still on the table, so a fresh rack replaces it; a FOREIGN fresh table
   * (Re-rack, game/equipment switch) already did, so only a restored game
   * re-racks again. `restore: false` (a foreign scripted layout) leaves the
   * table and the pin to that layout's owner. The pin restore runs NOW
   * (restoreSessionPin); the rack is deferred (at least one microtask, so a
   * stop fired inside a stateChange dispatch never re-enters the machine)
   * and stands down at run time when ANY newer table owner arrived since it
   * was queued — a re-rack or a layout (tableGen), a new session, or a
   * shared replay. start() awaits the task before it pins again. */
  function endSession({ fresh = true, restore = true } = {}) {
    const s = session;
    session = null;
    if (!s) return sessionExit;
    const staged = restore ? restoreSessionPin(s) : null;
    if (!fresh && !staged) return sessionExit;
    const gen = tableGen;
    const superseded = () => gen !== tableGen || session !== null || active !== null
      || replayActive();
    const task = (async () => {
      await Promise.resolve();
      const restored = staged ? await staged : false;
      if (superseded()) {
        // review r2 P2: the restore staged its game AFTER a newer layout
        // folded under the pinned one (Try it lays its comparison in the
        // same task as the mode change that ended the session, and
        // game.setGame resolves on a microtask) — re-fold THAT layout for
        // the restored game (rules, fold, hud title) without moving a ball;
        // only while it is still the latest table, unshot, and no newer
        // session / run / replay owns it — the generation protection stands
        if (restored && layoutTable && layoutTable.gen > gen
          && layoutTable.gen === tableGen && layoutTable.shot === game.shotIndex
          && session === null && active === null && !replayActive()) {
          try { window.__rules?.refold?.(); } catch { /* stale flow.js — the next rack refolds */ }
        }
        return;
      }
      if (!fresh && !restored) return;
      // a programmatic exit can land mid-shot (changeMode has no stage
      // gate): the fresh rack waits for the table to come to rest, the
      // scheduleNext deferral law, bounded — and re-checks its generation
      // on every wake (a newer table owner ends the wait)
      for (let i = 0; i < 150 && !machine.is(...QUIET_STAGES); i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (superseded()) return;
      }
      if (superseded() || !machine.is(...QUIET_STAGES)) return;
      try { window.__rules?.newMatch?.(); } catch { /* stale flow.js — seat carries */ }
      game.rerack(game.seed);
    })().catch(() => { /* never throws into a stop path */ });
    const done = task.finally(() => { if (sessionExit === done) sessionExit = null; });
    sessionExit = done;
    return done;
  }

  const layoutCtx = () => catalog.diamondCtx(
    game.template.system.table, game.template.system.balls[0].params.r);

  /** Snooker layout ctx (issue #80): composed on the drift-tested
   * SNOOKER_LAYOUT kernel mirror — active-table-INDEPENDENT, so the
   * __drills.layout() determinism wire byte-matches across boots even when
   * probed pre-start on the pool table. Caller guards `snookerGeo`. */
  const snookerCtx = () => ({
    w: snookerGeo.table.width, l: snookerGeo.table.length, r: snookerGeo.ballR,
    baulkY: snookerGeo.baulkY, dRadius: snookerGeo.dRadius,
    spots: snookerGeo.spots, cueDefault: snookerGeo.cueDefault,
  });
  const ctxFor = (d) => (d.discipline === 'snooker' ? snookerCtx() : layoutCtx());

  const mirror = (event, payload) => {
    // the flow.js emitHook console-mirror convention (state.js EVENTS is
    // frozen — no machine.emit for drill events; the console line IS the
    // e2e wire)
    console.log(`[drills] ${event} ${JSON.stringify(payload)}`);
    // GH-225 Playback archive: fan the SAME drill event out to the
    // feature-detected session-archive seam (start/complete/stop drive the
    // drill-session lifecycle; every event lands as a timeline marker).
    // The console line above stays THE e2e wire — an absent or throwing
    // archive leaf never touches the drill runner.
    try { window.__archive?.onDrill?.(event, payload); } catch { /* leaf absent */ }
  };

  function clearTimers() {
    clearTimeout(nextTimer); nextTimer = 0; nextFn = null;
    clearTimeout(bannerTimer); bannerTimer = 0;
    clearTimeout(winRelayTimer); winRelayTimer = 0; winRelayParked = false;
    endBannerHold(); // start()/stop() end any live hold with its timers
    settleDismissed = false; // round 10: a fresh run owns a fresh surface
  }

  /** Arm the post-terminal fresh-frame re-lay (issue #80): the black ended
   * the frame, flow routed WIN and armed its 2600 ms generic {seed}
   * re-rack — the runner's OWN re-rack inside the window pre-empts it
   * (RACK_MS law), and the expectRerack latch keeps the parked completion
   * state (`finished` + held banner) alive through the fresh frame. Also
   * the re-arm target when a DVR borrow parks the relay (stateChange). */
  function armWinRelay() {
    clearTimeout(winRelayTimer);
    winRelayTimer = setTimeout(() => {
      winRelayTimer = 0;
      if (machine.state !== 'WIN') return; // something else routed already
      expectRerack = true;
      game.rerack(game.seed + 1); // flow's own WIN semantics: a NEW frame
      expectRerack = false;
    }, RACK_MS);
  }

  // issue #71: a user tap dismisses the drill-complete banner (hud.js
  // capture-phase pointerdown listener; accessor feature-detected — a
  // stale hud.js leaves the pre-#71 chain behavior). End the hold window
  // (#81 finding 4: a dismissed banner's swallow-wrap must stand down) and
  // kill the pending hold-end timer so a dismissed banner is never
  // resurrected; the no-tap path (e2e-drills arm 6) is untouched because
  // auto-timeout clears never fire hud's dismiss event. A dismissed hint
  // also drops the locale-recompose closure (finding 6 — a dismissal
  // inside motion's 120 ms exit fade must not resurrect on relabel).
  hud.onBannerDismiss?.((kinds) => {
    if (kinds?.hint) { hintCompose = null; hintText = ''; }
    if (!kinds?.banner) return;
    endBannerHold();
    if (!bannerTimer) return;
    clearTimeout(bannerTimer); bannerTimer = 0;
  });

  function applyAttempt(k) {
    const d = active.drill;
    const laid = d.attempt(ctxFor(d), k, catalog.shotSeed(BigInt(d.base_seed), k));
    if (!laid) return false; // observer/rack drills carry no per-attempt layout
    const { balls, objective } = laid;
    active.objective = objective;
    zoneResolved = false; // GH-442: a fresh lay re-arms the zone decal
    grant = null; // the layout routes to AIM; grantPlacement re-opens it
    expectLayout = true;
    game.layout(balls);
    expectLayout = false;
    if (d.discipline === 'snooker' && !shapeSnookerFold(d)) {
      // the fold seam died between the start() guard and the layout (a
      // stale mid-session swap) — NEVER run a snooker drill over an
      // unshaped fold (phase 'reds' with no reds fouls every stroke)
      return false;
    }
    grantPlacement(); // in-hand drills: the REAL placement affordance
    hud.setBanner(''); // drop any flow banner a prior settle/BIH entry raised
    // issue GH-323 class audit: a FULL attempt lay must re-seed the rotation
    // on-table set beside the balls it stages. Every other full-lay path
    // already does (start() and relayRotationRack/relayTen re-seed right
    // after their applyAttempt); the replay-identity fallback lay did NOT,
    // divorcing lowestOnTable() from the staged table — the restored ball 1
    // then fouled 'contact' as a wrong first ball. Run-rotation kinds lay
    // exactly protocol.balls ascending ids, so the seed lives HERE, beside
    // the lay itself (ladder/stations carry no on-table tracking; the
    // challenge-tier kinds keep their dedicated relay seeds).
    if (d.protocol.kind === 'run' && active.objective?.rotation) {
      active.onTable = new Set(
        Array.from({ length: d.protocol.balls }, (_, i) => i + 1));
    }
    return true;
  }

  /** Shape the LIVE snooker-v1 fold under a colours-only scene (issue #80):
   * game.layout() left it at initialState phase 'reds' with onTable synced
   * to the laid balls — move it to the colours endgame so the nomination
   * auto-arms (flow.js game.shoot wrap) and legal ascending pots stay down
   * (WPBSA Sec3 R3(h)(ii)). Rides the __rules.setMatchState seam, a
   * SANCTIONED drills consumption (recorded in the flow.js docstring + the
   * the ownership ledger drills ledger). */
  function shapeSnookerFold(d) {
    return window.__rules?.setMatchState?.({
      phase: 'final_colours', ballOn: d.protocol.order[0], shooter: 1,
    }) === true;
  }

  /** Enter the GENUINE cue-placement affordance for the attempt just laid
   * out (issue #79 defect 2): aim.js/touch.js place-drag keys off
   * machine.state === 'BALL_IN_HAND', so when the drill's catalog law
   * grants in-hand placement (cuePlacement 'anywhere' | 'kitchen',
   * FORMAT.md §1a) the runner transitions there. Called from macrotask
   * attempt layout / rack staging ONLY — never inside a settle dispatch,
   * so flow.js's SETTLED adjudication right is untouched (the recorded
   * the ownership ledger carve-out). flow's placeCue wrap enforces the active
   * match right, which resetMatch just reset to 'anywhere' on our
   * layout/rerack; the drills placeCue wrap below pre-clamps 'kitchen'
   * grants behind the head string. flow's BALL_IN_HAND presentation arms
   * a foul banner on this transition — not a foul here; the caller stomps
   * the banner right after (synchronous dispatch, nothing paints between). */
  function grantPlacement(zone) {
    // GH-370 class 5: the grant zone is PARAMETERIZED — the drill's
    // cuePlacement stays the per-rack/attempt default (break grants), but
    // foul re-grants and the ghost post-break grant pass their own zone
    // (rotation15 foulPlacement 'anywhere' per its Dr Dave rule body via
    // WPA 5.7/1.6; ghost9/ghost10 postBreakBih 'anywhere' per the ghost
    // convention) instead of accidentally inheriting the break's kitchen.
    const cp = zone ?? active?.drill.cuePlacement ?? 'fixed';
    if (cp !== 'anywhere' && cp !== 'kitchen' && cp !== 'd') return;
    grant = cp;
    machine.to('BALL_IN_HAND', { drillPlacement: cp });
    if (cp === 'kitchen') { // honest constraint hint (existing flow key)
      // WPA 2.1/3.10 (GH-370 class 2): every kitchen-grant lay seats the
      // cue centre-ON the head string (rack builders / tenRack / headSpot
      // re-adds) — re-seat strictly above through the exclusive clamp
      // (deterministic: the wrap lands it at exactly −l/4 − 1e-6).
      const cue = game.cueBall();
      if (cue && !cue.pocketed) {
        game.placeCue(0, -game.template.system.table.length / 4);
      }
      drillHint(() => t('flow.ballInHandKitchen',
        { player: window.__rules?.player?.() ?? 1 }));
    } else if (cp === 'd') { // snooker D grant (existing US2 key, ×7)
      drillHint(() => t('snooker.ballInHandD',
        { player: window.__rules?.player?.() ?? 1 }));
    }
  }

  /** Tear down ALL drill chrome (chip strip + the dock's STOP/Reset icon
   * buttons — issue GH-120 moved STOP off the strip into the dock). Issue
   * #79 defect 1 law: every exit path — user stop, completion, silent stop
   * on foreign rerack/layout (game/equipment switch, shared-replay entry) —
   * removes the DOM; the STOP DRILL control must be GONE, never inert.
   * renderDock() reads `active` (already null on every caller's path), so
   * the dock collapses to an idle register here — opener-only on stop paths
   * (`finished` nulled first), opener+↻ on the complete() path (GH-133: the
   * post-completion replay register; `finished` is set right before this
   * call) — EXCEPT under the dockHold same-id-restart window, where
   * start()'s final renderDock re-asserts the live register with no idle
   * flash between (GH-120 nit 3c). */
  function teardownChrome() {
    // GH-120 review finding 2: a run that ends while a dock STOP/Reset
    // confirm is up (completion at settle, foreign-context silent stop)
    // cancels the pending dialog through its OWN cancel path — the
    // awaiting confirmThen resolves false (the stays-out no-op), so a
    // Confirm can never act on a dead run.
    cancelPendingConfirm();
    chipsEl.classList.remove('on');
    chipsEl.replaceChildren();
    chipSig = '';
    slotSchedule(); // B-PR03: the inset leaves with the strip
    if (!dockHold) renderDock();
  }

  function scheduleNext(fn, ms) {
    clearTimeout(nextTimer);
    nextFn = fn;
    nextTimer = setTimeout(function tick() {
      if (!active) return; // complete()/stop() null `active`
      if (machine.state === 'PLAYBACK' || machine.state === 'SIMULATING') {
        nextTimer = setTimeout(tick, 400); // let a replay/late stroke finish
        return;
      }
      nextTimer = 0;
      // issue GH-323: nextFn is NOT nulled here — it latches the re-lay that
      // just landed, so a Replay re-settle after the landing re-runs THIS
      // re-lay (idempotent: the closures lay captured/deterministic
      // positions) instead of relayFn()'s full-attempt fallback.
      fn();
    }, ms);
  }

  function complete() {
    const a = active;
    a.done = true;
    clearTimeout(nextTimer); nextTimer = 0; nextFn = null;
    const p = progress();
    // issue GH-119: two scoring directions. Higher-is-better keeps score;
    // rotation15's penalty rating is LOWER-is-better (fewer penalties win).
    // best is direction-aware and NEVER stored as Infinity (loadBlob drops a
    // non-number best), so the first play seeds best = score in both
    // directions and the persisted blob stays a plain number (FORMAT.md §4).
    // GH-200: the record read AND written is the run's LATCHED assist
    // mode's — bests under different assist levels never see each other.
    const low = a.drill.lowerIsBetter === true;
    const modes = p.drills[a.drill.id] ?? {};
    const rec = modes[a.assist] ?? null;
    const prevBest = rec ? rec.best : null;
    const plays = rec ? rec.plays : 0;
    // a best is an IMPROVEMENT over a previous play: the first completion
    // gets the plain summary (every first play would otherwise trivially
    // banner "new best"; review finding 5b — now direction-aware)
    const newBest = plays > 0 && prevBest !== null
      && (low ? a.score < prevBest : a.score > prevBest);
    modes[a.assist] = {
      best: prevBest === null ? a.score
        : (low ? Math.min(prevBest, a.score) : Math.max(prevBest, a.score)),
      plays: plays + 1, ts: Date.now(),
    };
    p.drills[a.drill.id] = modes;
    persist();
    mirror('complete', { id: a.drill.id, score: a.score, max: a.drill.maxScore,
      best: modes[a.assist].best, assist: a.assist });
    // #81 finding 4: flow.js's stateChange armed a banner clear on the SAME
    // routing that delivered this settle (1800 ms BALL_IN_HAND / 2600 ms
    // WIN) — the old re-assert-at-FLOW_BANNER_MS chain let it blink the
    // banner off for ~0.9 s first. holdBanner arms the hold-through wrap
    // instead: flow's clear is swallowed (no gap, win tone unbroken) and
    // ONE timer ends the hold after the same total budget. stop()/start()
    // kill it via clearTimers — bannerTimer always holds the live id.
    // issue GH-209 (Bug 1 labeling): distinguish a FULL CLEAR from a FAILED
    // early run-end. The clear-goal drills (`run`/`called`) reach complete()
    // BOTH on a full clear (score === protocol.balls) and on a fail
    // (feedback + complete on the else branch); a 0/15 fail wrongly read
    // "DRILL COMPLETE". A completion short of the clear goal now banners
    // "RUN ENDED — N/max" instead (the fail hint still names the reason).
    // Rating/rack kinds (ladder/stations/progressive/ten/penalty/sequence/
    // fourteenone) have no clear goal — they legitimately "complete", so
    // they keep the completeBanner. The persisted best/plays write is
    // unchanged (a failed run still bumps plays and seeds best = score —
    // the GH-131 finding-2 run-k index counts every completed run).
    const clearGoal = (a.drill.protocol.kind === 'run'
      || a.drill.protocol.kind === 'called') ? a.drill.protocol.balls : null;
    const ranOut = clearGoal !== null && a.score < clearGoal;
    // GH-668 S5 slice 4 (B-PR05 / R11): the verdict is the kit notice's two
    // lines — title "{name} · {score}/{max}", body "Drill complete" / "Run
    // ended" + " — <reason>" when the ending settle was a failed shot +
    // " · New personal best!" — ONE message per settle: the settle's own
    // feedback() hint is consumed here (never painted), and no assist tag
    // (R11; the record is keyed by mode, the picker best line names it).
    const endRes = pendingRes; pendingRes = null;
    const reason = endRes && !endRes.pass && endRes.reason ? endRes.reason : null;
    // GH-668 S5 slice 4 round 9 (review r1 P2-1, the GH-313 hasLocal law):
    // the two-line copy above is VERSIONED by a key this slice added — since
    // round 10 the sentence-verdict key (`drills.endComplete` /
    // `drills.endRunEnded`; round 9 keyed on `drills.endTitle`, which every
    // dictionary carrying the verdict keys also carries — same file, same
    // version). Locale JSON is fetched and cached independently
    // of this module, so a fresh drills.js can meet a PRE-change dictionary
    // whose `completeBanner` / `runEndedBanner` are still the one-line
    // "DRILL COMPLETE — {name}: {score}/{max}" templates and which has no
    // `endTitle` at all — t() would paint the raw key as the title and the
    // uninterpolated template as the body. When the ACTIVE dictionary lacks
    // the new key the notice renders the interpolated LEGACY summary
    // instead (the pre-change template WITH its params — name and score on
    // screen, no assist tag per R11), the reason / new-best tail alone in
    // the body line. hasLocal (not has): a stale non-English dictionary must
    // degrade to ITS legacy template, never to the fresh English copy.
    // Recomposed per relabel (the closure), so a mid-hold locale switch
    // takes the register of the dictionary it lands on.
    // GH-668 S5 slice 4 round 10 (review r2 P2-3, the versioned-copy
    // precedent): the LEGACY keys keep their pre-change templates VERBATIM
    // ("DRILL COMPLETE — {name}: {score}/{max}" ×7) — a CACHED pre-notice
    // drills.js composes its WHOLE summary from them over fresh JSON and
    // must keep the name and score (round 9 had reworded them to bare
    // sentences, which lost both for exactly that client; the opposite
    // pairing is the hasLocal gate below). The sentence verdicts live under
    // the round-10 keys; the gate keys on THOSE. e2e-practice-stale S1 / S4
    // hold both pairings.
    const legacyKey = ranOut ? 'drills.runEndedBanner' : 'drills.completeBanner';
    const verdictKey = ranOut ? 'drills.endRunEnded' : 'drills.endComplete';
    const params = () => ({
      name: t(`drills.name.${a.drill.id}`), score: a.score, max: a.drill.maxScore });
    holdBanner(() => (i18nNs.hasLocal?.(verdictKey) === true
      ? {
        title: t('drills.endTitle', params()),
        body: t(verdictKey)
          + (reason ? ' — ' + t(`drills.reason.${reason}`) : '')
          + (newBest ? ' · ' + t('drills.newBest') : ''),
      }
      : {
        title: t(legacyKey, params()),
        body: [reason ? t(`drills.reason.${reason}`) : '', newBest ? t('drills.newBest') : '']
          .filter(Boolean).join(' · '),
      }));
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => {
      bannerTimer = 0;
      endBannerHold();
      hud.setBanner('');
    }, FLOW_BANNER_MS + BANNER_MS);
    // issue #79 defect 1: the run is OVER — tear the chrome down NOW. The
    // score lives on in the banner hold + the picker best line; `finished`
    // keeps the state() wire readable for post-run reads. (Before this fix
    // `active` stayed set with done=true, which parked EVERY
    // stateChange/shotComplete guard on its early return — no later exit
    // (game switch, foreign rerack, replay entry) could ever tear the strip
    // down: the dangling, then-unresponsive STOP DRILL of issue #79.)
    finished = snap(a);
    active = null;
    grant = null;
    voidShot = false;
    rackDecided = false;
    teardownChrome();
    // GH-680: the fold no longer revives a scratched cue under a sandbox
    // drill (the drill owns the cue) — a run that ENDS on a scratch/exit
    // has no re-lay coming, so the post-completion table gets its cue
    // back at the head spot here (the playground scratch convention; the
    // parked-snapshot strokes after this are flow.js's own revive).
    if (game.cueBall()?.pocketed) { try { game.respotCue(); } catch { /* seam */ } }
    renderCards();
  }

  // GH-668 S5 slice 4 (B-PR05): the per-SHOT verdict is deferred one
  // microtask — a complete() in the SAME settle consumes it (the reason
  // rides the end notice's body; #hud-hint paints nothing for that settle),
  // an ongoing run paints it as before. No caller changed.
  let pendingRes = null;
  function feedback(res) {
    pendingRes = res;
    queueMicrotask(() => {
      if (pendingRes !== res) return; // consumed by complete() / superseded
      pendingRes = null;
      drillHint(() => (res.pass
        ? t('drills.pass')
        : t('drills.failReason', { reason: t(`drills.reason.${res.reason}`) })));
    });
  }

  /** One settled drill shot → protocol bookkeeping. Runs strictly AFTER
   * flow.js adjudicated (registration order), so __rules.judgment() is
   * current and the machine is already routed. */
  function onSettle(record) {
    const a = active;
    const d = a.drill;
    const kind = d.protocol.kind;
    if (kind === 'racks') { onGhostSettle(record); return; }
    if (kind === 'sequence') { onSequenceSettle(); return; }
    if (kind === 'progressive') { onProgressiveSettle(record); return; }
    if (kind === 'ten') { onTenSettle(record); return; }
    if (kind === 'penalty') { onPenaltySettle(record); return; }
    if (kind === 'called') { onCalledSettle(record); return; }
    if (kind === 'fourteenone') { onCenturySettle(); return; }
    const res = evaluate(record, a.objective);
    // issue GH-131 (the lineup family): a `run` objective may carry
    // `rotation: true` — the required first contact is the LOWEST
    // object-ball id still up (placement order encoded as ascending ids,
    // FORMAT.md §2), reusing the progressive/ten/penalty machinery
    // verbatim: lowestOnTable() reads the tracked on-table set (seeded at
    // start, re-synced from kernel rest positions after every settle) and
    // the verdict stays record-byte-derived (P-II). Precedence: scratch >
    // pocket > contact > everything else — GH-131 review finding 4: on the
    // only-pocket variants (lineup-l/lineup-diagonal) a stroke that BOTH
    // pots into a non-designated pocket AND wrong-first-contacts must keep
    // the evaluator's 'pocket' verdict; the contact override would mask the
    // only-pocket hint the user needs.
    if (kind === 'run' && a.objective?.rotation) {
      if (res.reason !== 'scratch' && res.reason !== 'pocket') {
        const lowest = lowestOnTable();
        if (lowest !== null && analyze(record).firstContact !== lowest) {
          res.pass = false; res.points = 0; res.reason = 'contact';
        }
      }
      syncOnTable(record);
    }
    zoneResolved = true; // GH-442: the verdict is in — the decal fades now;
                         // the scheduled re-lay's applyAttempt re-arms it
    a.attempt += 1;
    a.streak = res.pass ? a.streak + 1 : 0;
    mirror('attempt', { id: d.id, attempt: a.attempt, pass: res.pass,
      points: res.points, reason: res.pass ? undefined : res.reason });
    if (kind === 'ladder') {
      if (res.pass) {
        if (a.pos < d.protocol.steps) a.pos += 1;
        else a.bonus += 1;
      } else if (a.pos > 1) a.pos -= 1;
      // BU progressive scoring: final position + bonus per success while
      // at max (10 shots), capped at the published diploma bound (BU F1:
      // "The maximum total score allowed is 10" — GH-370 class 5; ladders
      // whose maxScore equals the uncapped ceiling are unaffected)
      a.score = Math.min(d.maxScore, a.pos + a.bonus);
      feedback(res);
      if (a.attempt >= d.protocol.shots) { complete(); return; }
      scheduleNext(() => applyAttempt(a.pos - 1), NEXT_MS);
    } else if (kind === 'stations') {
      a.score += res.points;
      a.k += 1;
      feedback(res);
      if (a.k >= d.protocol.count) { complete(); return; }
      scheduleNext(() => applyAttempt(a.k), NEXT_MS);
    } else { // 'run'
      if (res.pass) {
        a.score += res.potCount;
        feedback(res);
        if (a.score >= d.protocol.balls) { complete(); return; }
        // continue from the KERNEL rest positions (re-laid so any hotseat
        // routing underneath — respots, ball-in-hand — is superseded by
        // record truth before the next stroke; FORMAT.md §3.5)
        const rest = restPositions(record);
        const balls = [...rest.entries()].map(([id, p]) => ({ id, ...p }));
        scheduleNext(() => {
          expectLayout = true;
          game.layout(balls);
          expectLayout = false;
          hud.setBanner('');
        }, NEXT_MS);
      } else {
        feedback(res);
        complete();
      }
    }
    renderChips();
  }

  /** Snake sequence observer (issue #80): the REAL snooker-v1 endgame runs
   * underneath (the ghost9 precedent generalized) — every verdict reads
   * the judgment bytes of the shot flow.js just adjudicated. Progress is
   * BYTE-DERIVED: colours the fold says are OFF the table (legal ascending
   * pots stay down per R3(h)(ii); a fouled-in colour respots per Sec3 R7 —
   * flow.js applies the plan — and never counts). There are no re-lay
   * windows: like rack drills, every stroke belongs to the live fold. Any
   * foul or dry stroke ends the run; score = colours cleared before it. */
  function onSequenceSettle() {
    const a = active;
    const d = a.drill;
    const j = window.__rules?.judgment?.();
    const order = d.protocol.order;
    const onTable = Array.isArray(j?.next?.onTable) ? j.next.onTable : null;
    const remaining = onTable
      ? onTable.filter((id) => order.includes(id)).length : order.length;
    const cleared = order.length - remaining;
    const pass = j?.legal === true && cleared > a.k;
    a.attempt += 1;
    const res = pass
      ? { pass: true, points: cleared - a.k }
      : { pass: false, points: 0, reason: j?.legal === true ? 'miss' : 'foul' };
    mirror('attempt', { id: d.id, attempt: a.attempt, pass,
      points: res.points, reason: res.reason });
    if (pass) {
      a.streak += 1;
      a.k = cleared;
      a.score = cleared;
    } else {
      a.streak = 0;
    }
    feedback(res);
    if (j?.terminal) {
      // the black ended the FRAME (R4(b)) — flow routed WIN and armed its
      // 2600 ms auto re-rack, whose {seed} stateChange would kill the held
      // completion banner. Deal the drill's OWN fresh frame inside the
      // window instead: the AIM transition clears flow's timer (the
      // RACK_MS precedent) and the expectRerack latch keeps the banner
      // alive through the complete() re-assert chain.
      complete();
      armWinRelay();
      return;
    }
    if (!pass) { complete(); return; }
    renderChips();
  }

  /** Ghost 9-ball rack observer: the REAL nineball-v1 match runs underneath;
   * this only reads judgment bytes (official rating scoring — FORMAT.md §3). */
  function onGhostSettle() {
    const a = active;
    if (rackDecided) {
      // this rack already has its verdict — an interloping stroke settled
      // inside the RACK_MS window. Void it (unscored); the pending seeded
      // re-rack still lands (scheduleNext's tick deferred through the
      // stroke's PLAYBACK) and clears the latch.
      mirror('void', { id: a.drill.id });
      renderChips();
      return;
    }
    const j = window.__rules?.judgment?.();
    const isBreak = game.shotIndex <= 1; // settle after the rack's first shot
    let verdict = null; // 'won' | 'lost' | null (rack continues)
    if (j?.gameOver && j?.legal) verdict = 'won';
    else if (j && !j.legal) {
      verdict = (isBreak && !GHOST_BREAK_FOUL_LOSES) ? null : 'lost';
    } else if (j?.legal && !isBreak && (j.pocketed?.length ?? 0) === 0) {
      verdict = 'lost'; // a dry post-break shot: the ghost takes the rack
    }
    if (!verdict) {
      // GH-370 class 5 — the ghost convention's opener (Dr. Dave rating
      // sheet: after the break, pocket or not, take ball in hand anywhere
      // once, then run out): a LEGAL continuing break grants the
      // postBreakBih placement. Macrotask — never a machine.to inside
      // this settle dispatch (the OWNERSHIP drills carve-out; the flow.js
      // carom setTimeout(0) precedent). Fire-time guards: same run, rack
      // undecided, no interloping stroke (shotIndex still 1), machine
      // parked in AIM (a foul route already granted flow's own BIH).
      if (isBreak && a.drill.postBreakBih) {
        setTimeout(() => {
          if (active !== a || rackDecided || voidShot) return;
          if (machine.state !== 'AIM' || game.shotIndex !== 1) return;
          grantPlacement(a.drill.postBreakBih);
        }, 0);
      }
      renderChips();
      return;
    }
    rackDecided = true; // ignore further settles until our re-rack lands
    a.k += 1;
    if (verdict === 'won') { a.score += 1; a.streak += 1; } else a.streak = 0;
    mirror('rack', { id: a.drill.id, rack: a.k, verdict, score: a.score });
    const rackN = a.k; // freeze for the locale-recompose closure
    drillHint(() => t(verdict === 'won' ? 'drills.rackWon' : 'drills.rackLost',
      { n: rackN }));
    if (a.k >= a.drill.protocol.count) { complete(); return; }
    scheduleNext(() => {
      expectRerack = true;
      game.rerack(catalog.rackSeedFor(a.drill, a.k));
      expectRerack = false;
      rackDecided = false; // fresh rack — verdicts live again
      grantPlacement(); // ghost9: break placement in hand behind the string
      // e2e wire: a dead rack also shows 10 unpocketed balls, so the gate
      // asserts THIS line (+ the judgment reset), never the ball count
      mirror('rerack', { id: a.drill.id, rack: a.k + 1 });
      hud.setBanner('');
    }, RACK_MS);
    renderChips();
  }

  // ==== challenge-tier protocols (issue GH-119) ================================
  // The rotation objective ('progressive'/'ten'/'penalty') has a DYNAMIC
  // required first contact — the lowest object-ball id still up — so these
  // handlers track the on-table set from kernel rest positions rather than
  // the static objective.firstContact the generic evaluator keys on. Every
  // verdict still derives ONLY from kernel record/judgment bytes (P-II).
  const lowestOnTable = () => {
    const ids = [...active.onTable].filter((id) => id !== 0);
    return ids.length ? Math.min(...ids) : null;
  };
  const syncOnTable = (record) => {
    active.onTable = new Set(
      [...restPositions(record).keys()].filter((id) => id !== 0));
  };
  const headSpot = () => {
    const c = layoutCtx();
    return { x: 0, y: -c.l / 4 }; // pt(2,2): centre of the head string
  };
  /** Deterministic long-string spot for a drill re-lay (GH-370 class 5 —
   * the Dr Dave sheets' "ball gets spotted" law): the foot spot, walking
   * toward the foot rail then back toward center when occupied — the
   * respotBallSpot occlusion order, drills-local (leaf law: no respot.js
   * import edge) with layout-safe daylight. `pts` = every placement
   * already laid (cue included); null when the whole string is blocked. */
  function spotOnLongString(pts) {
    const c = layoutCtx();
    const clearAt = (x, y) => pts.every(
      (p) => Math.hypot(p.x - x, p.y - y) >= 2 * c.r + 1e-3);
    const step = c.r / 4;
    const maxY = c.l / 2 - c.r - 1e-3, minY = -c.l / 2 + c.r + 1e-3;
    for (let y = c.l / 4; y <= maxY; y += step) {
      if (clearAt(0, y)) return { x: 0, y };
    }
    for (let y = c.l / 4 - step; y >= minY; y -= step) {
      if (clearAt(0, y)) return { x: 0, y };
    }
    return null;
  }

  /** Re-lay the KERNEL rest positions to continue a rack (the run-drill law);
   * re-adds the cue on the head spot when it was pocketed/off so a placement
   * grant always has a ball to move. `grantZone` (GH-370 class 5): falsy =
   * no grant; a placement-class string re-opens the affordance in THAT
   * zone (foul re-grants / the ghost post-break BIH — see grantPlacement).
   * `respotIds` (ascending, WPA 1.4 order): object balls to revive on the
   * long string beside the rest positions (ghost10 break-scratch spotting;
   * rotation15 off-table / non-lowest-on-scratch spotting). */
  function reLayContinue(record, grantZone, respotIds = []) {
    const rest = restPositions(record);
    const balls = [...rest.entries()].filter(([id]) => id !== 0)
      .map(([id, p]) => ({ id, ...p }));
    const cue = rest.get(0);
    balls.unshift(cue ? { id: 0, ...cue } : { id: 0, ...headSpot() });
    for (const id of [...respotIds].sort((a, b) => a - b)) {
      if (balls.some((b) => b.id === id)) continue; // already on the table
      const spot = spotOnLongString(balls);
      if (!spot) continue; // whole string blocked (unreachable): stay down
      balls.push({ id, ...spot });
    }
    expectLayout = true;
    game.layout(balls);
    expectLayout = false;
    hud.setBanner('');
    if (grantZone) grantPlacement(grantZone === true ? undefined : grantZone);
  }

  /** progressive-lineup: run N balls in rotation; clear all ⇒ N+1, any fail
   * ⇒ N-1 (floor). score = highest N cleared, over protocol.racks rack tries. */
  function onProgressiveSettle(record) {
    const a = active, d = a.drill;
    const an = analyze(record);
    const scratch = an.cuePocketed || an.cueOff;
    const lowest = lowestOnTable();
    const objPots = an.pots.filter((p) => p.ball !== 0);
    a.attempt += 1;
    const wrongFirst = lowest !== null && an.firstContact !== lowest;
    // issue GH-134: the family's clean-contact law, gated on the published
    // objective word (evaluate()'s precedence mirrored: a dry stroke reads
    // 'miss' before the crash word is consulted)
    const crash = a.objective?.cleanContact === true && an.cueContacts > 1;
    const pass = !scratch && !wrongFirst && !crash && objPots.length >= 1;
    const reason = scratch ? 'scratch' : wrongFirst ? 'contact'
      : objPots.length < 1 ? 'miss' : 'crash';
    syncOnTable(record);
    const cleared = pass && a.onTable.size === 0;
    mirror('attempt', { id: d.id, attempt: a.attempt, pass, n: a.n,
      reason: pass ? undefined : reason });
    if (pass && !cleared) {
      a.streak += 1;
      feedback({ pass: true });
      scheduleNext(() => reLayContinue(record, false), NEXT_MS);
      renderChips();
      return;
    }
    a.rackTries += 1; // the rack is over: cleared (climb) or failed (retreat)
    if (cleared) {
      a.streak += 1; a.score = Math.max(a.score, a.n);
      a.n = Math.min(d.protocol.ceiling, a.n + 1); feedback({ pass: true });
    } else {
      a.streak = 0; a.n = Math.max(d.protocol.floor, a.n - 1);
      feedback({ pass: false, reason });
    }
    mirror('rack', { id: d.id, rack: a.rackTries, n: a.n, score: a.score });
    if (a.rackTries >= d.protocol.racks) { complete(); return; }
    scheduleNext(() => relayRotationRack(a.n), RACK_MS);
    renderChips();
  }
  /** Lay N rotation balls (attempt(ctx, n)) + seed the on-table set + grant. */
  function relayRotationRack(n) {
    if (applyAttempt(n) === false) { stop(true); return; }
    active.onTable = new Set(Array.from({ length: n }, (_, i) => i + 1));
  }

  /** ghost10: a JS-laid ten-ball rack loop (kernel has no 'ten' kind — issue
   * GH-119 path (a)). Break from the kitchen, run 1→10 in rotation; a scratch
   * costs protocol.scratchPenalty; a miss ends the rack. score = balls potted
   * across protocol.racks racks. Own per-rack shot counter (layout() does NOT
   * reset game.shotIndex, so the ghost9 `shotIndex<=1` break idiom is invalid). */
  function onTenSettle(record) {
    const a = active, d = a.drill;
    const an = analyze(record);
    const scratch = an.cuePocketed || an.cueOff;
    const lowest = lowestOnTable();
    const objPots = an.pots.filter((p) => p.ball !== 0);
    a.attempt += 1;
    const isBreak = a.shotInRack === 0;
    a.shotInRack += 1;
    const wrongFirst = lowest !== null && an.firstContact !== lowest;
    // GH-459: the sheet's law is UNCONDITIONAL −scratchPenalty (Joe Tucker
    // via drdavepoolinfo.com/faq/rating/10-ball/: "A scratch incurs a
    // 2-point penalty" — no floor anywhere in the source, the card copy,
    // FORMAT.md or the catalog). The old Math.max(0, …) clamp silently
    // absorbed early scratches (a break scratch at 0 cost nothing) and
    // inflated 10-rack totals by up to 2 per absorbed scratch — enough to
    // flip a published rating band at its 34/50/70 boundaries. Negative
    // running totals are legitimate: the chip/banner render the signed
    // number and the rating chart's first band already bounds them
    // (score <= max; see RATING_GHOST10).
    if (scratch) a.score -= d.protocol.scratchPenalty;
    const legal = !scratch && !wrongFirst;
    if (legal) a.score += objPots.length;
    syncOnTable(record);
    // GH-370 (review r1 P2): a scratched break's pots spot back BEFORE the
    // cleared test — an all-ten scratched break is play-on with the full
    // spotted rack, never a "cleared" rack end.
    const scratchSpots = isBreak && scratch
      ? [...new Set(objPots.map((p) => p.ball))] : [];
    for (const id of scratchSpots) a.onTable.add(id);
    const cleared = a.onTable.size === 0;
    const pass = legal && (isBreak || objPots.length >= 1);
    const reason = scratch ? 'scratch' : wrongFirst ? 'contact' : 'miss';
    a.streak = pass ? a.streak + 1 : 0;
    mirror('attempt', { id: d.id, attempt: a.attempt, pass, rack: a.k + 1,
      score: a.score, reason: pass ? undefined : reason });
    feedback(pass ? { pass: true } : { pass: false, reason });
    // GH-370 class 5 — the ghost convention's break law (Joe Tucker via
    // drdavepoolinfo.com/faq/rating/10-ball/): after EVERY break take ball
    // in hand (postBreakBih 'anywhere') and run out; a break SCRATCH is
    // play-on — the penalty stands (applied above), balls potted on the
    // scratch are SPOTTED (they never score: legal=false — the scratchSpots
    // re-add above precedes the cleared test), and the BIH grant still
    // applies ("take ball in hand even if you scratch" — a CONTACTLESS
    // scratch included). A WRONG-BALL-first break keeps ending the rack
    // (the recorded catalog tuning; review r4 P2: scratching after hitting
    // the wrong ball first is that same tuning, not the scratch grace —
    // only a genuinely wrong CONTACT ends it, never the no-contact case).
    const wrongContact = an.firstContact !== null && lowest !== null
      && an.firstContact !== lowest;
    if (isBreak && scratch && !wrongContact) {
      scheduleNext(() => reLayContinue(record,
        d.postBreakBih ?? false, scratchSpots), NEXT_MS);
    } else if (cleared || !pass) { // cleared, or a miss/foul ends the rack
      a.k += 1;
      mirror('rack', { id: d.id, rack: a.k, score: a.score });
      if (a.k >= d.protocol.racks) { complete(); return; }
      scheduleNext(() => relayTen(), RACK_MS);
    } else {
      // a passing break re-lays WITH the ghost's post-break in-hand grant;
      // mid-run the cue plays where it lies (FORMAT.md §1a)
      scheduleNext(() => reLayContinue(record,
        isBreak ? (d.postBreakBih ?? false) : false), NEXT_MS);
    }
    renderChips();
  }
  function relayTen() {
    if (applyAttempt(0) === false) { stop(true); return; }
    active.shotInRack = 0;
    active.onTable = new Set(Array.from({ length: 10 }, (_, i) => i + 1));
  }

  /** rotation15: penalty rating, LOWER is better. Seeded fifteen-ball racks;
   * per-stroke penalties (miss/scratch/off +1, wrong-first +2, +1 ball-in-hand
   * ceded on any foul) accrue into score over protocol.racks racks. */
  function onPenaltySettle(record) {
    const a = active, d = a.drill;
    const an = analyze(record);
    const scratch = an.cuePocketed, off = an.cueOff;
    const lowest = lowestOnTable();
    const objPots = an.pots.filter((p) => p.ball !== 0);
    a.attempt += 1;
    const isBreak = a.shotInRack === 0; // rack's first stroke (spot-law
    a.shotInRack += 1;                  // exemption: break pots stay down)
    const wrongFirst = lowest !== null && an.firstContact !== lowest;
    // GH-370 class 5 (Dr Dave sheet): an object ball driven off the table
    // is a foul ("1 foul, and ball gets spotted")
    const foul = scratch || off || wrongFirst || an.obOff.length > 0;
    let pen = 0;
    if (objPots.length < 1) pen += 1;
    if (scratch) pen += 1;
    if (off) pen += 1;
    if (an.obOff.length > 0) pen += 1;
    if (wrongFirst) pen += 2;
    if (foul) pen += 1; // ball-in-hand ceded
    a.score += pen;
    syncOnTable(record);
    // GH-370 class 5 spotting quirks (Dr Dave sheet): off-table object
    // balls spot; on a legal-hit make-and-scratch the non-lowest potted
    // balls spot (the lowest stays down); break pots stay down even on a
    // scratch. Balls potted on other fouls stay down (9-ball 5.7 law).
    const spotIds = [...new Set(an.obOff)];
    if (scratch && !wrongFirst && !isBreak) {
      for (const p of objPots) {
        if (p.ball !== lowest && !spotIds.includes(p.ball)) {
          spotIds.push(p.ball);
        }
      }
    }
    for (const id of spotIds) a.onTable.add(id);
    mirror('attempt', { id: d.id, attempt: a.attempt, penalty: pen,
      score: a.score, rack: a.k + 1,
      ...(spotIds.length ? { spotted: [...spotIds].sort((x, y) => x - y) } : {}) });
    feedback(pen === 0 ? { pass: true } : { pass: false,
      // review r4 P2: an object ball off the table is a FOUL, not a "no
      // ball potted" miss — the existing localized foul word carries it
      reason: wrongFirst ? 'contact' : scratch || off ? 'scratch'
        : an.obOff.length > 0 ? 'foul' : 'miss' });
    if (a.onTable.size === 0) { // rack cleared
      a.k += 1;
      if (a.k >= d.protocol.racks) { complete(); return; }
      scheduleNext(() => relayPenalty(), RACK_MS);
    } else {
      // foul re-grants ride the drill's foulPlacement zone ('anywhere' per
      // the Dr Dave rule body via WPA 5.7/1.6 — GH-370 class 5), never the
      // break's kitchen class
      scheduleNext(() => reLayContinue(record,
        foul ? (d.foulPlacement ?? true) : false, spotIds), NEXT_MS);
    }
    renderChips();
  }
  function relayPenalty() {
    expectRerack = true;
    game.rerackKind('fifteen', catalog.rackSeedFor(active.drill, active.k));
    expectRerack = false;
    active.onTable = new Set(Array.from({ length: 15 }, (_, i) => i + 1));
    active.shotInRack = 0; // fresh rack: the next stroke is its break
    grantPlacement();
    hud.setBanner('');
  }

  /** lineup-called: a CALLED-shot run-out. A drills-owned nomination
   * (window.__drills.call → active.pendingCall) is checked against the potted
   * ball+pocket; un-nominated strokes are SLOP (counted, streak reset). A dry
   * / scratched / wrong-called-pocket stroke ends the run. score = balls run. */
  function onCalledSettle(record) {
    const a = active, d = a.drill;
    const an = analyze(record);
    const scratch = an.cuePocketed || an.cueOff;
    const objPots = an.pots.filter((p) => p.ball !== 0);
    const call = a.pendingCall;
    a.pendingCall = null; // the nomination window closes at the stroke
    a.attempt += 1;
    let pass = false, reason = 'miss';
    if (scratch) { reason = 'scratch'; }
    else if (objPots.length < 1) { reason = 'miss'; }
    else if (call) {
      const hit = objPots.find((p) => p.ball === call.ball);
      if (!hit) reason = 'miss';
      else if (hit.pocket !== call.pocket) reason = 'pocket';
      else pass = true;
    } else { pass = true; } // slop: any legal pot counts
    // issue GH-134: the clean-contact law demotes a would-be pass ONLY —
    // scratch/miss/pocket verdicts keep their labels (crash slots below them)
    if (pass && a.objective?.cleanContact === true && an.cueContacts > 1) {
      pass = false; reason = 'crash';
    }
    mirror('attempt', { id: d.id, attempt: a.attempt, pass,
      called: call ? { ball: call.ball, pocket: call.pocket } : undefined,
      reason: pass ? undefined : reason });
    if (pass) {
      a.score += objPots.length;
      a.streak = call ? a.streak + 1 : 0; // only CALLED pots build the streak
      feedback({ pass: true });
      if (a.score >= d.protocol.balls) { complete(); return; }
      scheduleNext(() => reLayContinue(record, false), NEXT_MS);
      renderChips();
    } else {
      feedback({ pass: false, reason });
      complete();
    }
  }

  /** century: 14.1 continuous high-run OBSERVER over the live fourteenone-v1
   * fold (the ghost9/sequence pattern). Reads the fold's run from
   * __rules.matchState(); score = the high run reached; a miss/foul or the
   * fold terminal ends the visit. Never re-lays under the live fold. */
  function onCenturySettle() {
    const a = active, d = a.drill;
    const j = window.__rules?.judgment?.();
    const m = window.__rules?.matchState?.();
    const run = Number(m?.run) || 0;
    const legal = j?.legal === true;
    const advanced = legal && (j?.pocketed?.length ?? 0) >= 1;
    // A legal 14.1 OPENING break is by rule a no-pot safety (WPA 7.3: legal,
    // zero pocketed) — so a plain `advanced` gate ended the visit at score 0
    // on the very first stroke and the milestone ladder was unreachable.
    // Treat the opening break specially (the ghost9/ghost10 isBreak law): a
    // LEGAL break does NOT end the visit. It is the FIRST observed settle of
    // the run (a.attempt still 0) — robust across the fold's own continuous
    // re-racks, which a game.shotIndex probe would misread. Only a foul on
    // the break, a genuine miss/foul once play has started, or the fold
    // terminal ends the visit.
    const isBreak = a.attempt === 0;
    a.attempt += 1;
    if (advanced) { a.score = Math.max(a.score, run); a.streak = run; }
    const ok = advanced || (isBreak && legal); // legal break: play on
    mirror('attempt', { id: d.id, attempt: a.attempt, pass: ok,
      run, score: a.score, reason: ok ? undefined : (legal ? 'miss' : 'foul') });
    feedback(ok ? { pass: true } : { pass: false, reason: legal ? 'miss' : 'foul' });
    const top = d.protocol.milestones[d.protocol.milestones.length - 1];
    if (j?.terminal || !ok || a.score >= top) { complete(); return; }
    renderChips();
  }

  /** Rating band for a completed score (published rating chart data); null
   * when the drill carries none. lowerIsBetter uses the same chart. */
  function ratingLabel(d, score) {
    if (!Array.isArray(d.rating)) return null;
    const band = d.rating.find((b) => score <= b.max) ?? d.rating[d.rating.length - 1];
    return band ? `drills.rating.${band.label}` : null;
  }

  // ---- hooks (ADDITIVE; registered once, gated on `active`) ----------------
  // issue GH-323: nextFn latches the last-armed re-lay across its landing, so
  // the fallback fires ONLY when no re-lay was ever armed this run (e.g. a
  // Replay of the pre-drill record right after start) — where the full
  // attempt lay IS the correct restore. Every mid-run replay/void re-lay
  // re-runs the exact closure the drill armed (continue rest positions for
  // run kinds, reLayContinue for progressive/ten/penalty mid-rack, the
  // onTable-re-seeding relayRotationRack/relayTen/relayPenalty at rack
  // boundaries) — never a full lay divorced from the advanced run state.
  const relayFn = () => nextFn ?? (() => applyAttempt(currentStep()));

  // live-fold kinds (racks, sequence): every stroke belongs to the real
  // match underneath — no re-lay windows, so the replay/void re-lay logic
  // below must never synthesize an attempt re-lay for them (issue #80)
  const liveFold = (k) => k === 'racks' || k === 'sequence' || k === 'fourteenone';

  machine.on('shotComplete', (record) => {
    if (!active) {
      // issue GH-209 (Bug 2 lifecycle, option b — owner "auto-reset" intent):
      // a REAL continued shot after a SANDBOX drill completed is an implicit
      // play-again → soft auto-reset. The triggering shot's match terminal
      // is already suppressed by the relaxed flow.js gate (sandbox regardless
      // of done), so no "you win" leaks; here we re-lay the fresh attempt-0
      // run. Scheduled from a MACROTASK (setTimeout) — never re-lay inside
      // this settle dispatch (flow.js owns SETTLED routing; the drills
      // OWNERSHIP carve-out). Guards: only for a PARKED sandbox drill
      // (finished.sandbox — fold-observers keep their real terminals), only
      // once per distinct settle (lastRecord), and re-checked at fire time
      // (a real game/mode switch clears `finished` first). The explicit
      // GH-133 dock Reset/↻ still works; this only makes continued PLAY
      // behave as a soft reset.
      if (finished?.sandbox === true && record && record !== lastRecord
        && machine.state !== 'PLAYBACK' && machine.state !== 'SIMULATING') {
        lastRecord = record;
        const id = finished.id;
        setTimeout(() => {
          // FIRE-TIME re-check (issue GH-208 review): the outer guard ran at THIS
          // shot's settle, but the timer fires NEXT_MS later — a SECOND
          // continued shot (or an in-app Replay) may be mid-PLAYBACK by now, and
          // restartRun → start → game.rerack()/game.layout() calls
          // setState('AIM') UNCONDITIONALLY, which would ABORT that in-flight
          // stroke mid-shot and misscore it. Re-check machine.state so a stale
          // timer no-ops during a live stroke; that stroke's OWN settle re-arms
          // a fresh auto-reset (record !== lastRecord), so the re-lay merely
          // DEFERS until settle rather than firing mid-shot. (scheduleNext is
          // NOT reusable here: its tick bails on `!active`, and this auto-reset
          // path runs precisely when active is null.)
          if (!active && finished?.id === id && finished.sandbox === true
            && machine.state !== 'PLAYBACK' && machine.state !== 'SIMULATING') {
            restartRun(id);
          }
        }, NEXT_MS);
      }
      return;
    }
    if (record === lastRecord) { // in-app Replay re-settle: never re-scored
      // nextTimer === 0 covers BOTH replay-relative timings (issue GH-323):
      // 'parked at PLAYBACK entry' (the stateChange hook cleared the timer)
      // and 're-lay already landed' (the tick consumed it). The nextFn
      // latch makes the reschedule correct for both — the SAME re-lay the
      // drill armed runs again after the replay settles, restoring the
      // continue table (and, via reLayContinue, a pocketed cue + the
      // placement grant) the replayed playback just reverted. Rack drills
      // (liveFold) keep their own deferring timer instead.
      if (nextTimer === 0 && !liveFold(active.drill.protocol.kind)) {
        scheduleNext(relayFn(), NEXT_MS);
      }
      // GH-370 review r6 P2: re-open the synthetic grant the Replay parked
      // (rack kinds have no re-lay to restore it; for re-lay kinds the
      // re-lay re-opens its OWN window — the bounded poll defers past it
      // and stands down when a grant is already live again).
      if (replayHeldGrant) {
        const zHeld = replayHeldGrant;
        const posHeld = replayHeldPos;
        replayHeldGrant = null;
        replayHeldPos = null;
        const a0 = active;
        let tries = 0;
        const regrant = () => {
          if (active !== a0 || rackDecided) return;
          if (machine.state === 'PLAYBACK' || machine.state === 'SIMULATING'
            || nextTimer !== 0) {
            if (tries++ < 25) setTimeout(regrant, 200);
            return;
          }
          if (grant) {
            // a landed re-lay already re-opened its own window — the
            // user's dragged address still wins over the re-laid pose
            // (review r8 P2: ghost10 post-break / rotation15 foul re-lays
            // re-grant before this poll lands)
            if (posHeld) game.placeCue(posHeld.x, posHeld.y);
            return;
          }
          if (machine.state !== 'AIM' && machine.state !== 'BALL_IN_HAND') return;
          grantPlacement(zHeld);
          // restore the user's dragged address through the validated wrap
          // (review r7 P2) — the replayed playback re-parked the cue at the
          // record's initial pose
          if (posHeld) game.placeCue(posHeld.x, posHeld.y);
        };
        setTimeout(regrant, 0);
      }
      return;
    }
    lastRecord = record;
    if (voidShot) { // fired between settle and our re-lay: not from the
      voidShot = false; // drill layout — unscored, re-lay and move on
      mirror('void', { id: active.drill.id });
      if (!liveFold(active.drill.protocol.kind)) {
        scheduleNext(relayFn(), NEXT_MS);
      }
      return;
    }
    onSettle(record);
  });

  const currentStep = () => {
    const a = active, k = a.drill.protocol.kind;
    return k === 'ladder' ? a.pos - 1
      : k === 'stations' ? a.k
      : k === 'progressive' ? a.n
      : k === 'run' ? a.runK : 0; // GH-131 finding 2: the play-count k —
                                  // a void/replay re-lay must re-lay the
                                  // SAME permutation the run was started on
  };

  machine.on('stateChange', (next, prev, info) => {
    // FIRST (before any stop() below captures it): a fresh table is a new
    // owner generation (see tableGen)
    if (info?.seed !== undefined || info?.layout) tableGen += 1;
    if (info?.layout) {
      layoutGen += 1;
      layoutTable = { gen: tableGen, shot: game.shotIndex };
    }
    // round 10 (review r2 P2-2): the dismissed settle's swallow (hud.setBanner
    // seam) ends with the next STROKE (a PLAYBACK that is not the DVR's) or a
    // fresh table — flow arms the next presentation from that beat on
    if (settleDismissed && ((next === 'PLAYBACK' && !info?.dvr)
      || info?.seed !== undefined || info?.layout)) settleDismissed = false;
    if (!active) {
      // post-run banner hold (the complete() chain): a fresh table —
      // foreign rerack/layout, game/equipment switch, shared-replay entry —
      // ends it early; the completion banner must never dangle into the
      // next context (issue #79 defect 1, banner leg). The expectRerack
      // exemption is the runner's OWN post-terminal fresh frame (issue
      // #80 winRelayTimer) — the one non-foreign table under the hold.
      const foreign = !expectRerack
        && (info?.seed !== undefined || info?.layout);
      if (bannerTimer !== 0 && foreign) {
        clearTimeout(bannerTimer); bannerTimer = 0;
        endBannerHold(); // the clear below must land, not be swallowed
        hud.setBanner('');
      }
      // issue GH-209 (Bug 2 foreign-context safety): a completed sandbox
      // drill keeps its `finished` snapshot parked (GH-133 dock register),
      // and the relaxed flow.js terminal gate suppresses match terminals
      // while it lives. A GENUINE game/discipline switch (settings
      // changeGame → seed rerack) or an explicit Re-rack while parked must
      // hand the table back to a REAL match, so drop the parked snapshot
      // here — otherwise the gate would suppress the next live match's WIN.
      // (A mode switch away from practice already clears it via stop(); our
      // own winRelayTimer / auto-relay re-lays are expectRerack-guarded and
      // start()-cleared, so this only fires on foreign context changes.)
      if (foreign && finished) { finished = null; renderDock(); }
      // GH-980: the same foreign table ends a parked session (a re-rack hands
      // back the borrowed game; a scripted layout keeps its own) — never
      // start()'s own pins in flight (`starting`), whose switch re-racks land
      // here while `active` is still null
      if (foreign && session && !starting) {
        endSession({ fresh: false, restore: !info?.layout });
      }
      // a sequence run that ended on the black arms winRelayTimer — the
      // runner's OWN fresh frame inside flow's WIN window (issue #80),
      // and complete() has already nulled `active`, so it lives HERE. A
      // DVR borrow inside that 1.3 s window consumed it (GH-257 review
      // final round): the timer fired in PLAYBACK, failed its WIN check
      // and never re-armed, so the close restore left flow's re-armed
      // generic 2600 ms {seed} re-rack to land as a FOREIGN context —
      // killing the parked `finished` + held banner the relay exists to
      // protect. Park the relay at the borrow; re-arm a fresh RACK_MS
      // window when the restore re-emits WIN (it beats flow's 2600 ms
      // exactly as on the live path). A foreign table while parked drops
      // it — that completion's table is gone, a late re-rack would stomp
      // the new context.
      if (foreign) winRelayParked = false;
      if (next === 'PLAYBACK' && info?.dvr && winRelayTimer !== 0) {
        clearTimeout(winRelayTimer); winRelayTimer = 0;
        winRelayParked = true;
      } else if (next === 'WIN' && info?.dvr && winRelayParked) {
        winRelayParked = false;
        armWinRelay();
      }
      return;
    }
    // an external re-rack/layout (Re-rack button, shared-replay entry,
    // settings game/equipment switch) invalidates the run — stop cleanly
    // (FULL chrome teardown, issue #79 defect 1), never fight the user
    if (info?.seed !== undefined && !expectRerack) { stop(true, { exit: 'rerack' }); return; }
    if (info?.layout && !expectLayout) { stop(true, { exit: 'layout' }); return; }
    // the placement window closes at the stroke (issue #79 defect 2) — but
    // NOT at a DVR borrow (GH-257 review P1): Playback restores bed and
    // machine on close, and module-local `grant` has no restore path, so
    // consuming it here stranded a kitchen/D placement permanently.
    if (next === 'PLAYBACK' && !info?.dvr) {
      // GH-370 review r6 P2: an in-app REPLAY parks a live synthetic grant
      // (the ghost post-break BIH, the paid voluntary BIH) instead of
      // consuming it — the replay-identity settle re-opens it below. A
      // genuine STROKE (non-replay) still consumes the window. The cue's
      // kernel pose parks WITH it (review r7 P2 — three→kernel per the
      // coords.js law: k.x = three.z, k.y = three.x).
      replayHeldGrant = info?.replay ? grant : null;
      if (replayHeldGrant) {
        const m = game.cueBall?.()?.mesh?.position;
        replayHeldPos = m ? { x: m.z, y: m.x } : null;
      } else replayHeldPos = null;
      grant = null;
    }
    // a stroke fired after settle but before our re-lay: void it (except
    // live-fold drills, where every stroke belongs to the real match)
    if (next === 'PLAYBACK' && !info?.replay && nextTimer !== 0
      && !liveFold(active.drill.protocol.kind)) {
      clearTimeout(nextTimer); nextTimer = 0;
      voidShot = true;
    }
    // Replay during a pending re-lay: park the timer — the shotComplete
    // replay-identity branch reschedules a FULL NEXT_MS re-lay after the
    // replay settles. Rack drills keep their timer instead: scheduleNext's
    // tick already defers through PLAYBACK/SIMULATING, so the pending
    // seeded re-rack fires right after the replay settles. Clearing it
    // here permanently dropped the re-rack — the replay-identity branch
    // reschedules only non-rack kinds (review finding 2; the skip is
    // cleaner than teaching that branch to synthesize a re-rack closure,
    // because a mid-rack replay carries NO pending re-rack to restore).
    if (next === 'PLAYBACK' && info?.replay && nextTimer !== 0
      && !liveFold(active.drill.protocol.kind)) {
      clearTimeout(nextTimer); nextTimer = 0; // re-lay after the replay settles
    }
  });

  // ---- drill lifecycle ------------------------------------------------------
  async function start(id) {
    const d = catalog.getDrill(id);
    if (!d) return false;
    // GH-981: the start is a table change like any game switch — it never
    // cuts a shot in flight (the hall's busy refusal) and never destroys a
    // pending post-shot decision of a progressed rack (the GH-541 ruling 7
    // guard changeGame carries for every direct caller). A decision raised
    // inside the drill's own session is the drill's table: restarting or
    // switching the drill there is the run's business (the dock Stop /
    // Reset confirms guard it). The consent for a progressed rack is the
    // USER paths' (requestStart, the practice place's Last drill) — this
    // api stays dialog-free (the changeGame skipConfirm law).
    if (!machine.is(...QUIET_STAGES)) {
      drillHint(() => t('shell.notice.busy'));
      return false;
    }
    if (!session && decisionConflict()) {
      drillHint(() => t('shell.notice.decision'));
      return false;
    }
    if (sessionExit) await sessionExit; // the last session's restore lands first
    starting = true;
    try { return await launch(d, id); } finally { starting = false; }
  }

  async function launch(d, id) {
    // Mode ⟺ drill-layer agreement invariant (issue #68 review F1): a
    // drill may run ONLY while the session mode is 'practice'. Every
    // residual entry point (toolbar pill → picker card, direct
    // __drills.start) lands here, so the PIN lives here: flip the mode
    // selector to practice through the feature-detected settings seam
    // BEFORE anything goes live (`active` is still null, so the
    // playground→practice leg's fresh re-rack passes the stateChange
    // hook inertly). A REFUSED pin (shared-replay lock) refuses the
    // start — mode and drill layer never disagree. An absent seam (stale
    // settings.js — no mode system to disagree with) degrades to the
    // pre-#68 behavior. The converse law lives in settings.js
    // changeMode: any switch to a non-practice mode stops the drill.
    // Remember the PRE-PIN mode first: every refusal below (missing
    // seams, failed game switch, pocketless table, fold-shape abort)
    // restores it through refuse() — a refused start must never strand
    // the selector on practice with no drill running (review finding 3;
    // gated by e2e-drills arm s7). The pin refusing right here leaves
    // the mode untouched, so that path has nothing to restore.
    const layout0 = layoutGen; // see the foreign-layout check after the pins
    let preMode = null;
    try { preMode = window.__settings?.get?.().mode ?? null; } catch { /* stale seam */ }
    if (typeof window.__settings?.changeMode === 'function'
      && window.__settings.changeMode('practice') !== true) {
      drillHint(() => t('drills.unavailable'));
      return false;
    }
    // GH-980: the session opens here (or carries on: a drill → drill switch
    // and a restart from the parked snapshot keep the FIRST drill's borrow,
    // so the exit still restores the game the user came from). `touched`:
    // the table holds something only a fresh rack undoes (a previous
    // drill's layout, or this start's pin / re-rack).
    const carried = session;
    session = carried ?? { restore: null, pin: null };
    let touched = carried !== null;
    const refuse = (exit = { fresh: touched }) => {
      // GH-980: a refused start ends the session like any exit — the
      // session-only pin comes back and a touched table gets a fresh rack
      // (pre-fix a refusal after the 9-ball pin left a 9-ball rack on the
      // pocketless carom table)
      endSession(exit);
      // GH-382 decision 2 (review r33 P2): a start that pinned the v1
      // rules and then refused (pocketless table, failed applyAttempt)
      // must release the pin — stop() is never reached on this path
      releaseSnookerVariantPin();
      if (preMode && preMode !== 'practice') {
        try { window.__settings?.changeMode?.(preMode); } catch { /* stale seam */ }
      }
      // a same-id restart held the dock through stop(true)'s teardown (GH-120
      // nit 3c) — a refused start must still collapse it to the idle
      // register (the #79 never-inert law); idempotent on every other path
      renderDock();
      drillHint(() => t('drills.unavailable'));
      return false;
    };
    if (active) {
      // same-id restart (reset): hold the dock's live register across the
      // silent stop — the final renderDock() below re-asserts it with no
      // opener-only flash between (GH-120 review nit 3c)
      dockHold = active.drill.id === id;
      stop(true, { handoff: true });
      dockHold = false;
    }
    if ((d.discipline ?? 'pool') === 'snooker') {
      // discipline pin (issue #80, FORMAT.md §1b): a snooker drill runs
      // over the REAL snooker-v1 fold on the kernel's kind-locked WPBSA
      // 12-ft pairing — "honoring the user's table" is impossible here
      // (snooker tables are kernel-kind-locked), so the drill always
      // stages that pairing, and the pre-drill game is NOT restored on
      // stop. Unlike the SESSION-only 9-ball sandbox pin below
      // (setTransientGame — never touches the persisted blob, restored at
      // the session's exit), the primary changeGame path PERSISTS the
      // saved game to localStorage (recorded FORMAT.md §1b.1/§3.6); the
      // exit lays a fresh snooker rack. Refuse when the layout mirror,
      // the rules registry, or the fold-shaping seam is absent (stale
      // graph — pool drills stay untouched); a still-PENDING layouts
      // import is awaited, never refused (review finding 2).
      await snookerGeoReady;
      // the rules registry rides the SAME dist graph (rules/index.js
      // re-exports from games/layouts.js), so the slow leaf that just
      // resolved may have been holding flow's rulesReady too — its .then
      // can land a beat after ours. Give the registry the same courtesy
      // as the layout mirror: a short bounded poll, then refuse only
      // what still isn't there (a genuinely stale graph).
      for (let i = 0; i < 20 && window.__rules?.ready?.() !== true; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!snookerGeo || window.__rules?.ready?.() !== true
        || typeof window.__rules?.setMatchState !== 'function') {
        return refuse();
      }
      if (game.gameId !== 'snooker') {
        // PRIMARY path: the coherent settings seam — adopts the per-game
        // equipment pairing, rebuilds the visual table over the equipment
        // broadcast, re-racks (PIN over refuse, the #68 doctrine; the
        // switch PERSISTS — recorded FORMAT.md §3.6); stale settings.js:
        // the direct stage + equipment broadcast (switchGamePersisted)
        touched = true;
        if (!(await switchGamePersisted('snooker'))) return refuse();
      }
      // GH-382 decision 2 (owner sign-off recorded on issue GH-382,
      // 2026-08-07 — practice does NOT follow the decision-1 default
      // flip): the snooker drills run the FROZEN snooker-v1 endgame fold
      // whatever the live snooker default resolves (shapeSnookerFold and
      // the snake observer are authored against the v1 state machine —
      // a v2 fold's miss decisions would interrupt the run). Pin the
      // FR-005 v1 alias TRANSIENTLY for the run (never persisted); the
      // attempt layout right below re-folds under it, and stop()
      // restores the persisted working map. Feature-detected: a
      // pre-022 settings.js has no transient lane — its default IS v1.
      try {
        if (typeof window.__settings?.setTransientVariant === 'function') {
          window.__settings.setTransientVariant('snooker', 'wpbsa-snooker');
          snookerVariantPinned = true;
        }
      } catch { /* stale seam — pre-flip stacks default to v1 anyway */ }
    } else if (d.gamePin) {
      // century (issue GH-119, FORMAT.md §3.6): pin the fold's game SESSION-only
      // (setTransientGame — persist:false), NOT the persisting snooker path:
      // straight_pool shares the ACTIVE 2:1 pool table (ctx = layoutCtx, never
      // the kind-locked snooker mirror), so a persisted switch would be a
      // surprising side effect — and (GH-980) the session's exit restores the
      // game the drill came from. On a non-pool table the drill first takes
      // the pool table PERSISTENTLY (the 9-ball leg below, which its badge
      // declares). Refuse if the rules registry is absent (a stale boot — the
      // 14.1 fold cannot judge underneath) or a switch fails; the pre-pin
      // session mode is restored via refuse().
      for (let i = 0; i < 20 && window.__rules?.ready?.() !== true; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (window.__rules?.ready?.() !== true) return refuse();
      if (nonPoolGame(game.gameId)) {
        touched = true;
        if (!(await switchGamePersisted('nine_ball'))) return refuse();
      }
      if (game.gameId !== d.gamePin) {
        touched = true;
        if (!(await pinSessionGame(d.gamePin))) return refuse();
      }
    } else if (nonPoolGame(game.gameId)) {
      // GH-980 (decision (a), the #80 snooker leg's mirror): a pool drill on
      // a non-pool table (snooker, carom) switches the table PERSISTENTLY to
      // 9-ball — the picker badge's "Switches the table to 9-Ball" promise.
      // Pre-fix a bare __rules.setGame staged 9-ball rules on the snooker
      // table (snooker balls, cloth, cue, the D) and refused only after the
      // switch on the pocketless carom table.
      touched = true;
      if (!(await switchGamePersisted('nine_ball'))) return refuse();
    } else if (game.gameId !== 'nine_ball') {
      // sandbox law (FORMAT.md §3.5): pool drills judge over nineball-v1 —
      // switch any other pool game to 9-ball first, SESSION-only through the
      // settings layer (GH-980: values.game follows, so the hall's current
      // card, the HUD and the rules agree; the session's exit restores the
      // user's game). A degraded boot refuses the switch gracefully.
      touched = true;
      if (!(await pinSessionGame('nine_ball'))) return refuse();
    }
    // review r1 P2 (the census): a foreign scripted layout (a DVR borrow, a
    // test scene) or a shared replay that took the table while the pins
    // awaited owns it now — never lay the drill over it, and leave its
    // table and the pin to that owner (our pins only re-rack; the drill's
    // own layouts come after this point)
    if (layoutGen !== layout0 || replayActive()) {
      return refuse({ fresh: false, restore: false });
    }
    if ((game.template?.system?.table?.pockets?.length ?? 0) < 6) {
      return refuse(); // pocketless/odd table staged
    }
    // GH-200: latch the run's assist mode NOW — complete() credits the score
    // against it; a mid-run flip only ever escalates (the listener above)
    const runAssist = sessionAssist;
    active = {
      // ladder kinds open at the protocol's start station when the source
      // sheet pins one (BU F1: "Start with the cue ball in position 4" —
      // GH-370 class 5; ladders without a pin keep station 1)
      drill: d, k: 0,
      pos: d.protocol.kind === 'ladder' ? (d.protocol.start ?? 1) : 1,
      bonus: 0, attempt: 0, streak: 0, score: 0,
      done: false, objective: null, assist: runAssist,
      // issue GH-119 challenge-tier state
      n: d.protocol.kind === 'progressive' ? d.protocol.start : 0,
      rackTries: 0, shotInRack: 0, onTable: new Set(), pendingCall: null,
      // GH-131 review finding 2: run-kind attempts derive their index k
      // from the PERSISTED play count (ob-drills-v1 plays — since GH-200
      // the LATCHED assist mode's play count), so play n draws
      // entry_seed = shot_seed(base, n) — lineup-random lays a FRESH
      // permutation each play while staying a pure function of
      // (drill_id, k, entry_seed): byte-stable per k (__drills.layout(id, k)
      // is the determinism wire; arm 3 stays at k = 0), layout-neutral for
      // every other run drill (their attempt() ignores k/entrySeed).
      // plays is written only by complete(), so reset() re-derives the SAME
      // k mid-run — the arm-15 byte-exact re-lay law holds.
      runK: d.protocol.kind === 'run'
        ? (progress().drills[id]?.[runAssist]?.plays ?? 0) : 0,
    };
    finished = null; // a fresh run supersedes the last post-run snapshot
    grant = null;
    lastRecord = game.record ?? null; // a pre-drill record must never score
    voidShot = false;
    rackDecided = false;
    clearTimers();
    const kind = d.protocol.kind;
    // observer/rack-staged kinds carry no per-attempt layout — the runner
    // stages a real seeded rack and OBSERVES (ghost9/rotation15/century) or
    // pots the ordered chain (colours) over the live fold.
    const observerKind = kind === 'racks' || kind === 'penalty'
      || kind === 'fourteenone';
    touched = true;
    expectRerack = true;
    if (kind === 'fourteenone') {
      game.rerack(game.seed); // the 14.1 rack composes from the pinned game
    } else if (kind === 'racks') {
      game.rerack(catalog.rackSeedFor(d, 0));
    } else if (kind === 'penalty') {
      game.rerackKind('fifteen', catalog.rackSeedFor(d, 0)); // real seeded 15-rack
    } else if (d.rack === 'fifteen') {
      game.rerackKind('fifteen', 1);
    } else {
      game.rerack(game.seed); // clean nine rack, fold reset
    }
    expectRerack = false;
    if (!observerKind) {
      const k0 = kind === 'progressive' ? d.protocol.start
        : kind === 'run' ? active.runK
        : kind === 'ladder' ? active.pos - 1 : 0;
      if (applyAttempt(k0) === false) {
        // the fold-shaping/layout seam died between the guard above and the
        // layout (stale mid-session swap) — abort before any chrome
        active = null;
        return refuse();
      }
    } else {
      // rack/observer drills: the break is a genuine in-hand-behind-the-head
      // -string placement where the catalog grants it (ghost9/rotation15/
      // century 'kitchen' — WPA 5.3(a) 9-ball break / 7.3(a) 14.1 break)
      grantPlacement();
      hud.setBanner('');
    }
    // seed the rotation on-table set for the challenge-tier drills — and
    // (issue GH-131) for `run` drills whose laid objective carries the
    // rotation word (the lineup family: protocol.balls ids, ascending)
    if (kind === 'run' && active.objective?.rotation) {
      active.onTable = new Set(Array.from({ length: d.protocol.balls }, (_, i) => i + 1));
    } else if (kind === 'progressive') {
      active.onTable = new Set(Array.from({ length: d.protocol.start }, (_, i) => i + 1));
    } else if (kind === 'ten') {
      active.onTable = new Set(Array.from({ length: 10 }, (_, i) => i + 1));
    } else if (kind === 'penalty') {
      active.onTable = new Set(Array.from({ length: 15 }, (_, i) => i + 1));
    }
    const p = progress();
    p.last = id;
    persist(); // user-initiated — the hermetic-boot law only bars boot writes
    mirror('start', { id });
    chipsEl.classList.add('on');
    // GH-668 S5 slice 4 round 10 (review r2 P2-1): the inset lands BEFORE the
    // first chips mutation — touch.js's band-fit ladder judges #hud
    // synchronously on that mutation, and the rAF-coalesced write below
    // arrived up to ~350 ms later under the drill's own re-lay (probe: the
    // strip at #hud's left edge with the full-width cap, a different row
    // than the one that paints), so the ladder could judge a geometry no
    // frame ever showed. slotDerive reads only #hud / #ob-toolbar rects and
    // writes one inline property on the still-empty strip; this is our own
    // macrotask (start()), not an observer callback — the rAF path stays
    // for the shell / toolbar / resize sources.
    slotDerive();
    renderChips();
    slotSchedule(); // B-PR03: the band-T inset follows the live strip
    renderDock(); // STOP/Reset icon buttons join the dock (issue GH-120)
    return true;
  }

  /** `handoff`: start()'s own silent stop before the next drill goes live —
   * the session carries on. `exit` (GH-980/GH-982) names what the table
   * holds after this stop: 'stop' = the drill's layout (endSession lays a
   * fresh rack), 'rerack' = a foreign fresh rack already landed, 'layout' =
   * a foreign scripted layout that owns the table now (no restore). */
  function stop(silent = false, { handoff = false, exit = 'stop' } = {}) {
    const id = active?.drill.id ?? null;
    const abandoned = active && active.done !== true
      ? { id, attempt: active.attempt, score: active.score } : null;
    const heldBanner = bannerTimer !== 0; // a live complete() banner chain
    // GH-382 decision 2: release the colours drills' transient v1 rules
    // pin — the next fresh rack resolves the live default again (the
    // decision-1 flip; guards documented on the helper)
    releaseSnookerVariantPin();
    active = null;
    finished = null; // explicit stop clears the state() wire entirely
    grant = null;
    clearTimers();
    voidShot = false;
    rackDecided = false;
    // UNCONDITIONAL sweep (issue #79 defect 1): even a stale strip that
    // somehow outlived its run is removed by any stop call — the STOP
    // DRILL control must be gone, never merely inert
    teardownChrome();
    // GH-980/GH-982: every exit but the drill → drill hand-off ends the
    // session — also from the parked post-run snapshot (`id` null here)
    if (!handoff) endSession({ fresh: exit === 'stop', restore: exit !== 'layout' });
    if (id === null) { // idempotent beyond the DOM sweep — but a stopped
      if (heldBanner) hud.setBanner(''); // banner chain must not strand its text
      return;
    }
    hud.setBanner('');
    // GH-681: a LIVE run that dies here (dock Stop, the practice place's
    // Free-practice consent, a mode/game switch, a foreign re-rack) is
    // RECORDED as abandoned on the console wire — attempt/score at the
    // moment of death — never silently dropped. The persisted record is
    // untouched (FORMAT.md §4: only complete() writes best/plays).
    if (abandoned) mirror('abandoned', abandoned);
    mirror('stop', { id });
    if (!silent) drillHint(() => t('drills.stopped'));
    renderCards();
  }

  /** Restart the LIVE drill from its opening state (issue GH-120): re-lays the
   * initial layout, resets the current attempt/streak/score/in-rack progress
   * and re-enters ball-in-hand where the drill grants it — PRESERVING the
   * persisted ob-drills-v1 record (per-assist {best, plays, ts} since
   * GH-200: only complete() ever writes it; start() touches blob.last
   * alone). Rides start()'s sanctioned
   * re-lay path verbatim (mode/discipline pins idempotent, silent stop of
   * the running attempt, seeded attempt-0 layout, placement grant), so no
   * second re-lay mechanism exists to drift. Programmatic seam — the
   * CONFIRM lives on the dock button only (the changeMode/stop(true) law:
   * programmatic callers must never hit a dialog). */
  function reset() {
    if (!active) return Promise.resolve(false);
    return restartRun(active.drill.id);
  }

  /** start(id) + the reset e2e mirror. The mirror prints only AFTER start()
   * resolved TRUE (GH-120 review finding 1: start can REFUSE — stale snooker
   * seam, failed pin, applyAttempt abort — and a refused restart must never
   * record a reset on the e2e wire); the false branch prints a DISTINCT
   * refusal mirror instead. Wire order is therefore stop → start → reset. */
  function restartRun(id) {
    return start(id).then((ok) => {
      mirror(ok ? 'reset' : 'resetRefused', { id });
      return ok;
    });
  }

  // ---- HUD chip strip (hud.js chipEl anatomy; drills-owned DOM beside
  // #rack — hud.js itself is untouched) --------------------------------------
  const chipsEl = document.createElement('div');
  chipsEl.id = 'ob-drill-chips';
  const rackEl = document.getElementById('rack');
  if (rackEl) rackEl.insertAdjacentElement('afterend', chipsEl);
  else document.body.appendChild(chipsEl);
  let chipSig = '';

  // ---- GH-668 S5 slice 4 B-PR03: the strip docks to band T's RENDERED right
  // edge. touch.css §3.11 anchors #hud at safe-l + --ob-corner-l — a FOUR-pill
  // reservation — and #ob-drills is the FIFTH toolbar pill, so the rendered
  // toolbar overran the slot and painted over the strip's first ~48 px (the
  // critique probe at 844x390: pill x 279..323, strip left 275). The shell's
  // band seam (--ob-shell-bandt-r = __shell.bands().bandT.right, shell.js)
  // publishes the RESERVATION, not the rendered edge, so the strip derives its
  // OWN inset inside the slot: #ob-toolbar rect.right + sp-2 − #hud rect.left
  // (uiaudit, the F37 strip gap: the band-T seam is #hud's own left edge,
  // already sp-2 past the rendered toolbar, so the old max(seam,
  // toolbar.right) + sp-2 added a second sp-2 — toolbar.right 323, seam =
  // #hud.left 331 at 844x390: inset 8, the badge at 339, a 16 px gap),
  // written INLINE as --drills-slot-l (component-local — the
  // foldsnap --fs-* / --sf-* precedent; never an --ob-* name, the shell and
  // tokens.css own those). drills.css consumes it ONLY inside its coarse
  // phone block (margin-inline-start on #ob-drill-chips.on) — band GEOMETRY
  // stays touch.css's; this is the strip's inset within the slot it already
  // owns, and the single-row crop law holds (the max-width caps subtract the
  // right column; the inset shrinks the slot from the left). Fine pointers /
  // no live drill: the property is REMOVED (the strip sits in the HUD panel
  // flow as before). Sources: one ResizeObserver over #ob-toolbar ONLY (pill
  // census — share.js:1419 already observes the same box), `ob:shell-bands`
  // (the shell's write) and `resize` — all rAF-coalesced on this side too, so
  // nothing mutates layout inside the shell's event and a change-only latch
  // breaks any observer echo. NEVER #hud (gate-runner fix, e2e-drills arm
  // 29): touch.js's band ResizeObserver writes --ob-corner-r-live / the band
  // tokens SYNCHRONOUSLY inside its callback and §3.11's
  // `#hud:has(#hud-call.on) { right: … --ob-corner-r-live … }` RESIZES the
  // left-anchored #hud on that write — a second observer on #hud (a
  // shallower target than the pill being delivered) turns every such write
  // into 'ResizeObserver loop completed with undelivered notifications'
  // (touch.js:728-731 states the law; the e2e-ui --audit phone session
  // surfaced it as two #err-x rows). #hud's LEFT edge — the only #hud fact
  // this derivation reads — moves with the viewport / safe area / shell
  // bands, all of which already schedule here. Retires the day the seam
  // carries the rendered edge (bandT.toolbarRight / --ob-shell-bandt-live —
  // filed as the slice-2 follow-up).
  // GH-668 S5 slice 4 round 11 (R10 checker P1): the whole-chip cap + wrap
  // ride INLINE from this seam too. drills.css and touch.css are both
  // link-injected by dynamic imports (main.js: drills.js, then touch.js),
  // so their cascade ORDER is a load race: on the shipped phone boot
  // touch.css lands LATER and its §3.11 viewport cap (the
  // `:has(#ob-drill-stop)` form ties drills.css's room cap at equal
  // specificity) won by order — the strip ran 331..726 past the 612 clip at
  // 667 SA (en / fr / es) and 331..804.4 past 789 at 844 SA (es), counters
  // cut, while the arm's own boot ordered the sheets the other way and read
  // green. An inline declaration outranks every author rule whatever the
  // order, so the ROOM cap (100% − the strip's own slot inset) and the wrap
  // are written here on the same coarse band the sheet rules name; the
  // sheet rules stay as the declarative restatement (drills.css v21). Off
  // the band (fine pointer, coarse tablet, strip off) both are removed and
  // the panel flow is untouched. e2e-practice P-L boots natively per
  // register (round 11) and reads the sheet order + the computed cap.
  const ROOM_CAP = 'calc(100% - var(--drills-slot-l, 0px))';
  let slotRaf = 0, slotApplied = '', roomApplied = '';
  const slotDerive = () => {
    slotRaf = 0;
    const html = document.documentElement;
    const hud = document.getElementById('hud');
    const tb = document.getElementById('ob-toolbar');
    let next = '';
    // the same double gate as the drills.css consumer (touch.css's band
    // register): a coarse TABLET (> 1023.98 px) keeps the desktop panel
    // flow and gets no property either
    const band = html.classList.contains('ob-touch')
      && window.matchMedia('(pointer: coarse) and (max-width: 1023.98px)').matches;
    const live = chipsEl.classList.contains('on') && band && hud && hud.contains(chipsEl);
    const room = live ? ROOM_CAP : '';
    if (room !== roomApplied) {
      roomApplied = room;
      if (room) { chipsEl.style.maxWidth = room; chipsEl.style.flexWrap = 'wrap'; }
      else { chipsEl.style.removeProperty('max-width'); chipsEl.style.removeProperty('flex-wrap'); }
    }
    if (live && tb && tb.getClientRects().length) {
      const cs = getComputedStyle(html);
      // tokens resolve through the root em (--ob-sp-2 is 0.5rem) — never
      // parseFloat of a rem string
      const rem = parseFloat(cs.fontSize) || 16;
      const lenPx = (v) => (/rem\s*$/.test(v) ? parseFloat(v) * rem : parseFloat(v));
      const sp2 = lenPx(cs.getPropertyValue('--ob-sp-2')) || 8;
      // the strip clears the RENDERED toolbar by sp-2 and nothing more
      const inset = Math.max(0, tb.getBoundingClientRect().right + sp2 - hud.getBoundingClientRect().left);
      next = `${Math.round(inset * 100) / 100}px`;
    }
    if (next === slotApplied) return;
    slotApplied = next;
    if (next) chipsEl.style.setProperty('--drills-slot-l', next);
    else chipsEl.style.removeProperty('--drills-slot-l');
    // GH-668 S5 slice 4 round 12 (R11 re-verifier P2, measured on the
    // round-12 tip): an inset CHANGE under a live, already-rendered strip
    // re-renders the chips as FRESH nodes. The first chips mutation can
    // land while #hud still wears the panel geometry of the closing shell
    // (the resize flow: #hud 419..655 with the toolbar's right edge at 657
    // flips to the band geometry 275..612 / 323 some 90-226 ms after
    // quickPlay): this seam then reads an inset of ~246 px, the strip
    // becomes a zero-width box pushed past #hud's right edge, and
    // touch.js's ladder — judging #hud synchronously on that mutation —
    // drops the NAME badge whole. The flip corrects the inset through this
    // same write, but the ladder's fit signature (register | #hud width |
    // #state text | each badge's offsetWidth, a dropped badge reading 0)
    // is already the converged one for the new #hud width, so the style
    // mutation re-enters and exits at the latch: the drop is terminal
    // (1 in 7 P-L runs at load 60; again on the fonts-settled tip). Fresh
    // chips put a real offsetWidth back into that signature, so the ladder
    // re-fits from scratch against the corrected slot. Never on the first
    // write of a start() (the strip is still empty — renderChips follows),
    // rAF-coalesced with the fonts-settled refresh below; a change-only
    // path, so a converged seam schedules nothing. e2e-practice P-L's
    // transient-inset leg poses a wider toolbar at the first mutation,
    // unposes it and requires the name whole.
    if (live && chipsEl.childElementCount) chipsRefreshSchedule();
  };
  const slotSchedule = () => {
    if (slotRaf) return;
    slotRaf = requestAnimationFrame(slotDerive);
  };
  window.addEventListener('ob:shell-bands', slotSchedule);
  window.addEventListener('resize', slotSchedule);
  if (typeof ResizeObserver === 'function') {
    const slotRo = new ResizeObserver(slotSchedule);
    const tbEl = document.getElementById('ob-toolbar');
    if (tbEl) slotRo.observe(tbEl);
  }
  // GH-668 S5 slice 4 round 12 (R11 re-verifier P2): the strip RE-DERIVES
  // once the web fonts settle (and, above, whenever the slot inset changes
  // under a rendered strip — the transient the round actually measured). touch.js's band-fit ladder judges #hud
  // SYNCHRONOUSLY on the first chips mutation and latches on a signature
  // that keys each badge's offsetWidth — a badge it dropped under transient
  // metrics reads 0 px in every later pass, so the drop stands until #hud's
  // width or #state's text changes (measured: the name badge dropped whole
  // once in 7 runs at load 60, the readout alone left in the strip). The
  // fonts are one such transient: tokens.css loads both families with
  // font-display: swap, so a cold profile renders the first strip on the
  // fallback font (the name badge measures 252 / 273 / 269 px for en / fr /
  // es lineup names against 228 / 247 / 244 settled) and the swap re-lays
  // the strip without any of the ladder's triggers firing. When the fonts
  // settle — document.fonts.ready for the boot's loads, 'loadingdone' for
  // any later batch — the seam re-derives (slotDerive) and the strip chips
  // are re-rendered as FRESH nodes (the chipSig latch reset, replaceChildren
  // as on every content change), which is the #hud subtree mutation the
  // ladder re-fits from scratch on, now with the final metrics — so no
  // whole-chip drop is left standing after the fonts settle. rAF-coalesced
  // (ready + loadingdone can land in the same tick; one fresh render). A
  // no-op without a live strip; off the coarse band the fresh render is the
  // same panel-flow strip. e2e-practice P-L's font-race leg holds the woff2
  // requests until the strip has rendered, releases them and requires the
  // fresh mutation + a whole name.
  let chipsRefreshRaf = 0;
  const chipsRefresh = () => {
    chipsRefreshRaf = 0;
    if (!active || !chipsEl.classList.contains('on')) return;
    chipSig = '';
    slotDerive();
    renderChips();
  };
  const chipsRefreshSchedule = () => {
    if (chipsRefreshRaf) return;
    chipsRefreshRaf = requestAnimationFrame(chipsRefresh);
  };
  if (document.fonts && typeof document.fonts.addEventListener === 'function') {
    document.fonts.ready.then(chipsRefreshSchedule, () => {});
    document.fonts.addEventListener('loadingdone', chipsRefreshSchedule);
  }

  const chip = (text, cls) => {
    const el = document.createElement('span');
    el.className = 'ob-badge' + (cls ? ' ' + cls : '');
    el.textContent = text;
    return el;
  };

  function renderChips() {
    if (!active) return;
    const a = active, k = a.drill.protocol.kind;
    // issue GH-144 (owner build3): the strip is TWO compact segments now —
    // the accent name pill + ONE merged status badge (protocol counters,
    // streak, score joined by ' · ' — JS punctuation, not a translatable
    // string) — so the band-T center slot (phone, touch.css §3.11) and the
    // 236px HUD panel (desktop) hold the whole inventory in a minimal
    // footprint. Segment copy stays the existing t('drills.chip.*') keys ×7.
    const seg = [];
    if (k === 'ladder') {
      seg.push(t('drills.chip.step', { n: a.pos, total: a.drill.protocol.steps }));
      seg.push(t('drills.chip.attempt', { n: Math.min(a.attempt + 1, a.drill.protocol.shots), total: a.drill.protocol.shots }));
    } else if (k === 'stations') {
      seg.push(t('drills.chip.station', { n: Math.min(a.k + 1, a.drill.protocol.count), total: a.drill.protocol.count }));
    } else if (k === 'racks') {
      seg.push(t('drills.chip.rack', { n: Math.min(a.k + 1, a.drill.protocol.count), total: a.drill.protocol.count }));
    } else if (k === 'sequence') {
      const total = a.drill.protocol.order.length;
      seg.push(t('drills.chip.colour', { n: Math.min(a.k + 1, total), total }));
      // the colour ON now, via the shipped snooker ball labels (×7)
      const target = a.drill.protocol.order[Math.min(a.k, total - 1)];
      seg.push(t('drills.chip.target', { ball: t(`snooker.ball.${target}`) }));
    } else if (k === 'progressive') {
      seg.push(t('drills.chip.progN', { n: a.n }));
      seg.push(t('drills.chip.rack', {
        n: Math.min(a.rackTries + 1, a.drill.protocol.racks), total: a.drill.protocol.racks }));
    } else if (k === 'ten' || k === 'penalty') {
      seg.push(t('drills.chip.rack', {
        n: Math.min(a.k + 1, a.drill.protocol.racks), total: a.drill.protocol.racks }));
    } else if (k === 'fourteenone') {
      seg.push(t('drills.chip.run', { n: a.streak }));
    } else { // 'run' | 'called'
      seg.push(t('drills.chip.balls', { n: a.score, total: a.drill.protocol.balls }));
    }
    seg.push(t('drills.chip.streak', { n: a.streak }));
    // direction-aware score segment: lower-is-better drills read as a
    // penalty tally
    seg.push(a.drill.lowerIsBetter
      ? t('drills.chip.penalty', { n: a.score })
      : t('drills.chip.score', { score: a.score, max: a.drill.maxScore }));
    // GH-668 S5 slice 4 (B-PR05 / B-K21): a READOUT is not a badge. The
    // counters ride div.ob-drills__readout in the kit BODY role (14 / 430 /
    // --ob-text-1) with .ob-nums (tabular digits) — no caps, no pill; only
    // the drill NAME stays the accent badge. build-4 QA (ja wrap-point nit)
    // law kept: the segments ride nowrap <span class="seg"> nodes with the
    // ' · ' joins as bare text inside ONE .segs inline wrapper, so a line
    // breaks ONLY between segments (the desktop panel wraps to ≤ 2 dense
    // lines; the phone band-T register re-pins nowrap + strip crop).
    // textContent (the chipSig latch and every e2e text probe) is
    // byte-identical to the joined string; the drills.chip.* templates ×7
    // stay untouched (the GH-144 ledger pins them).
    const merged = document.createElement('div');
    merged.className = 'ob-drills__readout ob-body ob-nums';
    const segsWrap = document.createElement('span');
    segsWrap.className = 'segs';
    seg.forEach((s, i) => {
      if (i) segsWrap.appendChild(document.createTextNode(' · '));
      const el = document.createElement('span');
      el.className = 'seg';
      el.textContent = s;
      segsWrap.appendChild(el);
    });
    merged.appendChild(segsWrap);
    const chips = [chip(t(`drills.name.${a.drill.id}`), 'ob-badge--accent'),
      merged];
    // issue GH-120: the STOP control moved OFF the strip into the icon dock
    // (#ob-drill-dock) — the strip is status-only badges now, out of the
    // aim/shoot zone mis-tap surface the owner flagged on-device.
    const sig = chips.map((c) => c.className + '|' + c.textContent).join('¦');
    if (sig === chipSig) return;
    chipSig = sig;
    chipsEl.replaceChildren(...chips);
  }

  // ---- icon dock (issue GH-120) ------------------------------------------------
  // Compact SVG icon buttons for the drill chrome's ACTIONS, docked out of
  // the aim/shoot zone (the owner's on-device mis-tap finding: the old
  // PRACTICE DRILLS mode chip + in-strip STOP DRILL text button floated
  // over the table). Drills-owned fixed chrome outside the §3.11 bands
  // (the .ob-drills-banner precedent); skin + geometry live in drills.css:
  // desktop = a bottom-right 34px round-pill row (opener + Reset + STOP),
  // phone (coarse ≤1023.98px) = a right-column vertical rail below the
  // call-pill slot and above the band-X banner lane (the measured
  // height-independent free window), where the OPENER HIDES — on phone the
  // sanctioned opener is the band-T toolbar pill (#ob-drills), whose 44pt
  // corner slot §3.11 already reserves (recorded decision, the ownership ledger).
  // The container is pointer-inert (buttons re-enable their own events),
  // so the dock never eats canvas taps between buttons.
  // Confirm law (GH-120 owner comment): STOP and Reset are destructive →
  // confirm-then-act with NO further tap after Confirm; Cancel/backdrop/
  // Escape = no-op (the drill keeps running). The confirm lives HERE, on
  // the dock click handlers ONLY — window.__drills.stop()/reset() and the
  // settings.changeMode silent stop stay confirm-free (programmatic law).
  // Kit access is feature-detected (dialog.confirmDialog with a
  // window.confirm degrade — the settings.js changeGame pattern).
  const dock = document.createElement('div');
  dock.id = 'ob-drill-dock';
  document.body.appendChild(dock);

  let confirmPending = false; // one dialog at a time (double-tap latch)
  async function confirmThen(kind, act, { copy = null, danger = true } = {}) {
    if (confirmPending) return;
    confirmPending = true;
    let ok = false;
    const title = copy?.title ?? t(`drills.confirm${kind}.title`);
    try {
      if (typeof dialog.confirmDialog === 'function') {
        const p = dialog.confirmDialog({
          title,
          body: copy?.body ?? t(`drills.confirm${kind}.body`),
          confirmLabel: copy?.confirm ?? t(`drills.confirm${kind}.confirm`),
          cancelLabel: t('confirm.cancel'),
          danger,
        });
        // confirmDialog appended its panel synchronously — the NEWEST
        // [data-ob=confirm] is ours. Tracked so teardownChrome() can cancel
        // a dialog whose run just died (GH-120 review finding 2). The
        // window.confirm degrade blocks the event loop — nothing can end
        // the run under it, so no handle is needed on that path.
        const panels = document.querySelectorAll('[data-ob="confirm"]');
        confirmEl = panels[panels.length - 1] ?? null;
        ok = await p;
      } else {
        ok = window.confirm(title);
      }
    } catch { ok = window.confirm(title); }
    confirmEl = null;
    confirmPending = false;
    if (ok) act(); // Confirm acts IMMEDIATELY — no further tap
  }

  /** Cancel the pending dock confirm through the DIALOG'S OWN cancel path
   * (settle(false): the panel closes, the awaiting confirmThen resolves
   * false — the stays-out no-op). Idempotent: the handle nulls first, a
   * settled dialog swallows the click on its own latch, and a missing
   * cancel button (stale kit) degrades to the dead-run guards on the dock
   * act closures below. */
  function cancelPendingConfirm() {
    const el = confirmEl;
    if (!el) return;
    confirmEl = null;
    try { el.querySelector('[data-ob="confirm-cancel"]')?.click(); } catch { /* settled */ }
  }

  // GH-668 S5 slice 4 (B-PR08 / B-K16): a dock button IS the toolbar family
  // part — the same four kit classes the #ob-drills pill wears (kit.css owns
  // the 34 / 44 circle, the glass material, the hover / active / focus
  // ladder under the fine guard, the span face law and reduced motion);
  // drills.css keeps only the dock's container geometry + the Stop ink.
  const dockBtn = (id, glyphText, onClick) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill';
    const g = document.createElement('span');
    g.setAttribute('aria-hidden', 'true');
    g.textContent = glyphText; // stale-cache fallback glyph (#49 doctrine)
    b.appendChild(g);
    b.addEventListener('click', onClick);
    return b;
  };
  const openBtn = dockBtn('ob-drill-open', '◎', () => open('dock'));
  // The confirm ACTS are guarded against the settle-vs-confirm race (GH-120
  // review finding 2): the run can END (complete() at settle, a foreign-
  // context silent stop) while the dialog is up. teardownChrome() cancels
  // the pending dialog, so a Confirm that still lands is the same-burst
  // remnant (or the degrade where the cancel path is unavailable). Both
  // acts pin the drill id from confirm-open time, so a different run can
  // never be hit:
  //   - Reset: the user confirmed "Restart this drill?" — honor it from
  //     the live run OR from the finished snapshot (a completion is not a
  //     refusal). A foreign-context stop nulls `finished`, keeping that
  //     branch the stays-out no-op.
  //   - STOP on a dead run is a no-op: the run is already over, and a late
  //     stop() would wipe the HELD completion banner + finished snapshot.
  // GH-133 (two-register Reset): the handler's old `if (!active) return`
  // early-out is gone — the ↻ also serves the POST-COMPLETION register
  // (renderDock keeps it while `finished` is non-null). The confirm law is
  // confirm-DESTRUCTIVE-only: a live run's progress dies on restart →
  // confirmThen stays; a finished run has nothing left to destroy (best
  // persisted, plays already bumped by complete(), run over) → the tap
  // restarts IMMEDIATELY, no dialog. restartLatch parks a double-tap while
  // the async start() is in flight (snooker/gamePin starts await mid-way
  // with `finished` still set; confirmPending never arms on this path). A
  // REFUSED restart keeps `finished` on most refusal rungs (start() clears
  // it only past them), so refuse()'s renderDock re-shows opener+↻; the
  // applyAttempt-abort rung clears it first and collapses to the
  // opener-only idle register — acceptable under the #79 never-inert law.
  let restartLatch = false;
  const resetBtn = dockBtn('ob-drill-reset', '↻', () => {
    const id = active?.drill.id ?? finished?.id;
    if (!id) return;
    if (!active) { // post-completion register: non-destructive → no confirm
      if (restartLatch) return;
      restartLatch = true;
      restartRun(id).finally(() => { restartLatch = false; });
      return;
    }
    confirmThen('Reset', () => {
      if (active?.drill.id === id || (!active && finished?.id === id)) {
        restartRun(id);
      }
    });
  });
  const stopBtn = dockBtn('ob-drill-stop', '■', () => {
    if (!active) return;
    const id = active.drill.id;
    confirmThen('Stop', () => { if (active?.drill.id === id) stop(); });
  });
  // GH-370 class 5 — voluntary ball-in-hand (rotation15's core scoring
  // affordance, Dr Dave 15-ball rotation rating: the player may take BIH
  // at any time for one penalty point). Dock-resident like STOP/Reset
  // (GH-120: action chrome lives OFF the strip, out of the aim mis-tap
  // zone); rendered only while the active drill declares `voluntaryBih`.
  // Guards make a stray tap a no-op: AIM only (a live grant/foul BIH
  // needs no purchase), no pending re-lay, rack undecided. Non-destructive
  // → no confirm (the GH-133 post-completion-↻ law).
  const bihBtn = dockBtn('ob-drill-bih', '✋', () => {
    const a = active;
    if (!a?.drill.voluntaryBih || !machine.is('AIM')) return;
    if (nextTimer !== 0 || rackDecided) return;
    a.score += 1; // the sheet's law: each voluntary BIH costs one penalty
    mirror('bih', { id: a.drill.id, score: a.score });
    grantPlacement(a.drill.voluntaryBih === true
      ? 'anywhere' : a.drill.voluntaryBih);
    renderChips();
  });

  // session-mode tracking (reads only — hermetic-boot law bars boot writes):
  // seed from the settings seam (drills installs AFTER the boot broadcast),
  // then follow every ob:settings 'mode' broadcast.
  let sessionMode = null;
  try { sessionMode = window.__settings?.get?.().mode ?? null; } catch { /* stale seam */ }
  window.addEventListener('ob:settings', (e) => {
    if (e?.detail?.key !== 'mode') return;
    sessionMode = e.detail.value
      ?? (() => { try { return window.__settings?.get?.().mode ?? null; } catch { return null; } })();
    renderDock();
  });

  /** Present the dock for the current mode/run state. STOP exists in the
   * DOM ONLY while a drill runs (the #79 teardown law — arm 11's dead-tap
   * probe binds the dock buttons too); Reset rides TWO registers (GH-133):
   * the live register AND the post-completion register while `finished` is
   * non-null (complete() sets the snapshot BEFORE its teardownChrome()
   * renders, so the ↻ replay affordance survives the completion sweep;
   * every stop path nulls `finished`, so stops still collapse the dock).
   * The `on` mode gate is deliberately untouched: on a degraded boot
   * (sessionMode null) the dock must not newly persist post-completion.
   * The opener shows through the whole practice session (drills.css hides
   * it on phone, where the toolbar pill owns the opener slot). */
  function renderDock() {
    const on = sessionMode === 'practice' || !!active;
    dock.classList.toggle('on', on);
    if (!on) { dock.replaceChildren(); return; }
    if (active) {
      dock.replaceChildren(openBtn,
        ...(active.drill.voluntaryBih ? [bihBtn] : []), resetBtn, stopBtn);
    } else if (finished) dock.replaceChildren(openBtn, resetBtn);
    else dock.replaceChildren(openBtn);
  }
  renderDock();

  // ---- picker panel (kit dialog leaf, the help.js shape) --------------------
  let panel = null, bodyEl = null, closeBtn = null;
  let isOpen = false;

  const familyOf = (d) => `drills.family.${d.family}`;
  // difficulty tiers, easiest → hardest (expert = the challenge category)
  const TIER_ORDER = ['intermediate', 'advanced', 'expert'];

  /** One drill card (issue GH-119: extracted so the tier-grouped picker can
   * place it under a section heading; markup byte-identical to the pre-119
   * flat grid). */
  function makeCard(d) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'ob-drills__card';
    card.dataset.drill = d.id;
    const top = document.createElement('span');
    top.className = 'ob-drills__top';
    const name = document.createElement('b');
    name.className = 'ob-drills__name';
    name.dataset.i18n = `drills.name.${d.id}`;
    const fam = document.createElement('span');
    fam.className = 'ob-badge ob-drills__fam';
    fam.dataset.i18n = familyOf(d);
    // #81 finding 5: discipline-mismatched cards must DECLARE the switch —
    // the #80 pin persists the game (changeGame path), so a colours tap from
    // a pool table silently switched + persisted the discipline. Text +
    // visibility live in renderCards (game- and locale-dependent).
    const req = document.createElement('span');
    req.className = 'ob-badge ob-badge--warn ob-drills__req';
    req.dataset.req = d.id;
    req.style.display = 'none'; // inline: [hidden] loses to .ob-badge's
                                // author display (UA-sheet cascade law)
    top.append(name, fam, req);
    const desc = document.createElement('span');
    desc.className = 'ob-drills__desc';
    desc.dataset.i18n = `drills.desc.${d.id}`;
    const best = document.createElement('span');
    best.className = 'ob-drills__best';
    best.dataset.best = d.id;
    card.append(top, desc, best);
    card.addEventListener('click', () => { close(); requestStart(d.id); });
    return card;
  }

  /** GH-981: the USER start path (picker card) — start()'s refusals, plus
   * the consent a destructive start owes, the same register as the dock's
   * Stop/Reset and the practice place's Free-practice consent:
   *   a LIVE run → "Switch drills?" naming the drill that replaces it (the
   *     same drill → the dock's "Restart this drill?");
   *   a progressed game (no drill session, outside the sandbox — whose
   *     layout is ephemeral by the #68 recorded decision) → "Leave this
   *     game?"; Cancel keeps the frame, scores and pending options intact;
   *   a pristine rack or a parked post-run snapshot → no prompt.
   * Pre-fix the card ran start() at once: mid-roll it cut the shot, on a
   * pending decision it threw the decision away, and on a progressed rack
   * the frame was gone without a word. */
  function requestStart(id) {
    if (!machine.is(...QUIET_STAGES)) {
      drillHint(() => t('shell.notice.busy'));
      return Promise.resolve(false);
    }
    if (!session && decisionConflict()) {
      drillHint(() => t('shell.notice.decision'));
      return Promise.resolve(false);
    }
    const ask = startConsent(id);
    if (!ask) return start(id);
    return new Promise((resolve) => {
      let acted = false;
      confirmThen(ask.kind, () => {
        acted = true;
        // the dialog is modal, but a run can still END under it (completion
        // at settle; teardownChrome cancels the dialog then) — a Confirm
        // that lands anyway acts on the table it was asked about only
        if (ask.live && active?.drill.id !== ask.live) { resolve(false); return; }
        resolve(ask.kind === 'Reset' ? restartRun(id) : start(id));
      }, { copy: ask, danger: ask.danger })
        .then(() => { if (!acted) resolve(false); });
    });
  }
  /** The consent a user start of drill `id` owes right now (requestStart
   * and the practice place's Last drill share it): null, or { kind, live,
   * danger, title, body, confirm } — kind 'Reset' (the live run, same
   * drill), 'Switch' (another live run), 'Leave' (a progressed game). The
   * GH-981 keys are guarded on the ACTIVE dictionary (the GH-313 hasLocal
   * law — locale JSON caches independently of this module): a stale
   * dictionary keeps a localized legacy line, never a raw key or the
   * English fallback. "Leave this game?" is the practice place's own title
   * (the Free-practice consent's register, same words). */
  function startConsent(id) {
    const live = active && active.done !== true ? active.drill.id : null;
    const kind = live ? (live === id ? 'Reset' : 'Switch')
      : (!session && sessionMode !== 'playground' && !replayActive()
        && !rackPristine()) ? 'Leave' : null;
    if (!kind) return null;
    const pick = (key, legacy) => (i18nNs.hasLocal?.(key) === true ? key : legacy);
    const confirm = t(pick('drills.confirmStart', 'confirm.continue'));
    const copy = kind === 'Reset' ? {
      title: t('drills.confirmReset.title'), body: t('drills.confirmReset.body'),
      confirm: t('drills.confirmReset.confirm'),
    } : kind === 'Switch' ? {
      title: t(pick('drills.confirmSwitch.title', 'drills.confirmStop.title')),
      body: t(pick('drills.confirmSwitch.body', 'drills.confirmStop.body'),
        { name: t(`drills.name.${id}`) }),
      confirm,
    } : {
      title: t('shell.place.practice.confirmTitle'),
      body: t(pick('drills.confirmLeave.body', 'settings.gameRerackConfirm')),
      confirm,
    };
    return { kind, live, danger: kind !== 'Leave', ...copy };
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.id = 'ob-drills-panel';
    panel.className = 'ob-panel ob-drills';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'ob-drills-title');
    panel.style.display = 'none';

    const head = document.createElement('div');
    head.className = 'ob-drills__head';
    const h = document.createElement('h2');
    h.id = 'ob-drills-title';
    h.className = 'ob-title'; // GH-668 B-K13: the kit title role (16)
    h.dataset.i18n = 'drills.title';
    closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.id = 'ob-drills-close';
    // GH-245 close unification: the kit ghost icon-circle register
    // (34px/44pt, kit rungs + focus ring); drills.css's bespoke 28px block
    // is retired with it
    closeBtn.className = 'ob-btn ob-btn--ghost ob-btn--icon';
    closeBtn.dataset.i18nTitle = 'drills.close';
    const x = document.createElement('span');
    x.setAttribute('aria-hidden', 'true');
    const xi = icons?.icon('close');
    if (xi) x.appendChild(xi); else x.textContent = '✕';
    closeBtn.appendChild(x);
    closeBtn.addEventListener('click', () => close());
    head.append(h, closeBtn);

    bodyEl = document.createElement('div');
    bodyEl.className = 'ob-drills__body';
    // issue GH-119: group cards by difficulty tier (expert IS the challenge
    // category). Section headings span the grid; card order stays
    // deterministic (catalog order within each tier).
    for (const tier of TIER_ORDER) {
      const group = catalog.DRILLS.filter((d) => (d.tier ?? 'intermediate') === tier);
      if (!group.length) continue;
      const heading = document.createElement('h3');
      // GH-668 B-K13: the kit caps role carries size / weight / tracking /
      // uppercase (+ the CJK arm); drills.css keeps the grid span + margin
      heading.className = 'ob-drills__tier ob-caps';
      heading.dataset.i18n = `drills.tier.${tier}`;
      bodyEl.appendChild(heading);
      for (const d of group) bodyEl.appendChild(makeCard(d));
    }
    panel.append(head, bodyEl);
    // key containment (the help.js R7 law): game-steering keys must never
    // reach aim.js while the picker is open; Escape/Tab ride the kit's
    // document-capture handlers, which fire before any bubble listener
    panel.addEventListener('keydown', (e) => e.stopPropagation());
    panel.addEventListener('keyup', (e) => e.stopPropagation());
    document.body.appendChild(panel);
    relabel();
  }

  function renderCards() {
    if (!panel) return;
    for (const el of panel.querySelectorAll('[data-best]')) {
      // GH-200: the best line is the ACTIVE assist mode's record — a drill
      // played only under another mode reads not-played here; the appended
      // assist tag names the mode the shown best was set under.
      const rec = progress().drills[el.dataset.best]?.[sessionAssist];
      const d = catalog.getDrill(el.dataset.best);
      if (!rec) { el.textContent = t('drills.notPlayed'); continue; }
      // rated challenge drills append the band label (issue GH-119); the score
      // reads the same in both directions — lower-is-better drills carry the
      // 'lower wins' meaning in the band + the description.
      const ratingKey = ratingLabel(d, rec.best);
      el.textContent = (ratingKey
        ? t('drills.bestRated', { score: rec.best, max: d.maxScore, rating: t(ratingKey) })
        : t('drills.best', { score: rec.best, max: d.maxScore }))
        + assistTag(sessionAssist);
    }
    // #81 finding 5: the requirement badge shows on every card whose drill
    // discipline differs from the ACTIVE one (snooker drill on a pool
    // table, pool drill on the snooker table) — starting it switches the
    // table, and both legs persist (#80, FORMAT.md §3.6; GH-980 decision
    // (a) for the pool leg). The carom table is neither: both drill
    // disciplines switch it (GH-980). The in-discipline sandbox pin (e.g.
    // 8-ball → 9-ball, session-only, restored when the drill ends) stays
    // unlabeled, matching the audit scope.
    const activeDisc = game.gameId === 'snooker' ? 'snooker'
      : nonPoolGame(game.gameId) ? 'carom' : 'pool';
    for (const el of panel.querySelectorAll('[data-req]')) {
      const d = catalog.getDrill(el.dataset.req);
      const want = d?.discipline ?? 'pool';
      const on = want !== activeDisc;
      el.style.display = on ? '' : 'none';
      el.textContent = on
        ? t('drills.switchesGame', {
          game: t(want === 'snooker' ? 'game.snooker' : 'game.nine_ball'),
        })
        : '';
    }
  }
  // a game switch while the picker is open (settings drawer over the
  // backdrop) re-labels the requirement badges live
  window.addEventListener('ob:settings', (e) => {
    if (e.detail?.key === 'game' && isOpen) renderCards();
  });

  const open = (source = 'api') => {
    try {
      if (isOpen) return;
      // GH-981: the user openers (toolbar pill, dock, hall) refuse a table
      // in flight with the hall's own busy register — the hall pill already
      // did, the drills pill opened the picker mid-roll
      if (source !== 'api' && !machine.is(...QUIET_STAGES)) {
        drillHint(() => t('shell.notice.busy'));
        return;
      }
      if (!panel) buildPanel();
      renderCards();
      panel.dataset.entrySource = source;
      isOpen = true;
      dialog.openPanel(panel, {
        backdrop: true,
        display: 'flex',
        onClose: () => { isOpen = false; },
      });
      const bd = panel.previousElementSibling;
      if (bd?.classList.contains('ob-backdrop')) {
        bd.classList.add('ob-backdrop--top');
      }
      // stale-css inline fallback (the help.js centering law): plain but
      // usable when drills.css is missing/stale
      if (getComputedStyle(panel).position !== 'fixed') {
        panel.style.cssText += ';position:fixed;inset:0;margin:auto;'
          + 'width:min(720px, calc(100vw - 32px));height:fit-content;'
          + 'max-height:calc(100vh - 32px);z-index:70;display:flex;'
          + 'flex-direction:column;overflow:hidden;';
        bodyEl.style.overflowY = 'auto';
        if (bd) bd.style.zIndex = '69';
      }
    } catch { /* open() never throws (the 024 contract posture) */ }
  };

  const close = () => {
    if (!isOpen || !panel) return;
    isOpen = false;
    dialog.closePanel(panel);
  };

  // ---- toolbar pill (dataset.tbOrder = 6 — after the 024 help pill) --------
  const pill = document.createElement('button');
  pill.id = 'ob-drills';
  pill.type = 'button';
  pill.className = 'ob-btn ob-btn--icon ob-btn--glass ob-toolbar-pill'; // GH-668 B-K16 toolbar part
  pill.dataset.i18nTitle = 'drills.open';
  pill.setAttribute('aria-haspopup', 'dialog');
  const glyph = document.createElement('span');
  glyph.setAttribute('aria-hidden', 'true');
  // GH-246: the real vector mark, inlined — never a text glyph, never a
  // dependency on the icons import
  glyph.innerHTML = inlineGlyph(PILL_GLYPH, 'target');
  pill.appendChild(glyph);
  pill.addEventListener('click', () => open('toolbar'));
  try {
    import('./ui/icons.js').then((m) => {
      icons = m;
      // dock glyphs (issue GH-120) — additive icons.js names; a stale cached
      // icons.js resolves '' → null and the text glyphs stay (#49 doctrine)
      for (const [btn, name] of [[openBtn, 'target'], [resetBtn, 'reset'],
        [stopBtn, 'stop'], [bihBtn, 'move']]) {
        const di = icons.icon(name);
        const holder = btn.querySelector('span');
        if (di && holder) holder.replaceChildren(di);
      }
      if (panel && closeBtn) {
        const xi = icons.icon('close');
        const x = closeBtn.querySelector('span');
        if (x && xi) x.replaceChildren(xi);
      }
    }).catch(() => { /* text glyph stays */ });
  } catch { /* text glyph stays */ }
  (() => {
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(pill); return; }
    pill.dataset.tbOrder = '6';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 6);
    tb.insertBefore(pill, next || null);
  })();

  // ---- i18n -----------------------------------------------------------------
  const relabel = () => {
    pill.title = t('drills.open');
    pill.setAttribute('aria-label', t('drills.open'));
    // dock icon buttons (issue GH-120): localized tooltip + aria voice
    for (const [btn, key] of [[openBtn, 'drills.open'],
      [resetBtn, 'drills.reset'], [stopBtn, 'drills.stop'],
      [bihBtn, 'drills.takeBih']]) {
      btn.title = t(key);
      btn.setAttribute('aria-label', t(key));
    }
    if (panel) {
      applyDom(panel);
      closeBtn.setAttribute('aria-label', t('drills.close'));
      renderCards();
    }
    chipSig = '';
    renderChips();
    // #81 finding 6: live drill text re-renders on the locale broadcast —
    // the held completion banner recomposes through its closure, and the
    // last drill hint recomposes IFF it is still the one showing (display
    // up + text unchanged since we set it; a flow hint or a dismissed/
    // expired hint never resurrects).
    if (bannerHold) paintEnd(bannerHold());
    if (hintCompose) {
      const el = document.getElementById('hud-hint');
      if (el?.style.display === 'block' && el.textContent === hintText) {
        hintText = hintCompose();
        hud.setHint(hintText);
      }
    }
  };
  onLocaleChange(relabel);
  relabel();

  // ---- the ONE window seam (e2e + the settings row feature-detect THIS) ----
  /** Wire-shaped snapshot of a run (also the complete() `finished` bytes). */
  const snap = (a) => ({
    id: a.drill.id, kind: a.drill.protocol.kind,
    discipline: a.drill.discipline ?? 'pool', k: a.k, pos: a.pos,
    bonus: a.bonus, attempt: a.attempt, streak: a.streak, score: a.score,
    max: a.drill.maxScore, done: a.done,
    // GH-200: the run's LATCHED assist mode (complete() credits against it)
    assist: a.assist,
    // issue GH-119 challenge-tier wire
    tier: a.drill.tier ?? 'intermediate', n: a.n, rackTries: a.rackTries,
    low: a.drill.lowerIsBetter === true,
    // issue GH-138: SANDBOX-kind flag — true for every kind that lays
    // custom layouts over the §3.5 session pin (the liveFold complement:
    // run/ladder/stations/called/progressive/ten/penalty), where the fold's
    // match judgment is nonsense for the run. flow.js reads it
    // feature-detected to suspend its WHOLE decision path (GH-680: no
    // foul banner / ball-in-hand / cue revive / turn switch / terminal —
    // the evaluators here judge from the record bytes and the re-lays own
    // the cue; GH-138 had gated the terminal alone). Fold-observer kinds
    // (racks/sequence/fourteenone) stay
    // false — they NEED the real terminals (ghost9 reads gameOver, the
    // sequence winRelayTimer requires machine WIN, century reads terminal).
    sandbox: !liveFold(a.drill.protocol.kind),
  });
  const stateOut = () => (active ? snap(active) : finished);
  window.__drills = {
    open, close,
    isOpen: () => isOpen,
    start, stop,
    /** GH-981: the consent a USER start of drill `id` owes now (null when
     * none) — the practice place's Last drill asks it inside the hall
     * before its exit, with the picker card's own copy. Read-only. */
    startConsent,
    /** Issue GH-120: restart the live drill from its opening state (attempt/
     * streak/in-rack progress cleared, initial layout re-laid, placement
     * re-granted; the persisted per-drill best is untouched). Confirm-free
     * programmatic seam — the confirm modal is the dock button's alone. */
    reset,
    state: stateOut,
    /** Live drill-granted placement class (GH-370 class 6): null |
     * 'anywhere' | 'kitchen' | 'd' — the aim-lane zone overlay reads it
     * feature-detected beside __rules.placementRight() so drill grants
     * render the same honest zone as match rights. */
    grant: () => grant,
    /** GH-442: the LIVE attempt's cueRest objective zone — the catalog
     * object VERBATIM (kernel meters; {kind:'circle',x,y,r} or the
     * paperRect {kind:'rect',cx,cy,ux,uy,halfAlong,halfAcross[,overlapR]},
     * FORMAT.md §2) while the attempt is UNJUDGED, else null. SINGLE-SOURCE
     * law: the aim-lane decal is a pure projection of these bytes — no
     * consumer may mutate or re-derive them. Deliberately cueRest-only:
     * containCue is a PATH law (a sample(t) containment walk), not a rest
     * target the player lands on; zoneOptional zones (bu-f7) DO render —
     * the sheet still names the paper even when it is the second point. */
    objectiveZone: () => (active && !active.done && !zoneResolved
      ? active.objective?.cueRest ?? null : null),
    /** Kernel ball radius of the active rack (e2e ghost-ball aim math). */
    ballR: () => game.template.system.balls[0].params.r,
    list: () => catalog.DRILLS.map((d) => ({
      id: d.id, family: d.family, corpus: d.corpus_id, base: d.base_seed,
      kind: d.protocol.kind, max: d.maxScore,
      discipline: d.discipline ?? 'pool', tier: d.tier ?? 'intermediate',
      lowerIsBetter: d.lowerIsBetter === true,
      // GH-135: the published rating chart (issue GH-119 bands), cloned — the
      // settings last-played card echoes the picker's rated best line
      rating: Array.isArray(d.rating)
        ? d.rating.map((b) => ({ max: b.max, label: b.label })) : null,
    })),
    /** Drills-owned pocket nomination for the called-shot run-out
     * (lineup-called; the nineball sandbox fold exposes no call()). Armed per
     * stroke, cleared at the stroke. False when no called-shot drill is live. */
    call: (ball, pocket) => {
      if (!active || active.drill.protocol.kind !== 'called') return false;
      if (!Number.isInteger(ball) || !Number.isInteger(pocket)) return false;
      active.pendingCall = { ball, pocket };
      mirror('call', { id: active.drill.id, ball, pocket });
      return true;
    },
    /** Pure layout preview for e2e determinism byte-compares: the exact
     * attempt placements + objective for (drill, k) — pool drills on the
     * ACTIVE table, snooker drills on the SNOOKER_LAYOUT mirror (active-
     * table-independent; null while the layouts leaf is absent). */
    layout: (id, k = 0) => {
      const d = catalog.getDrill(id);
      // observer/rack drills carry no per-attempt layout (racks/penalty/
      // fourteenone) — the runner stages a seeded rack instead
      if (!d || d.protocol.kind === 'racks' || d.protocol.kind === 'penalty'
        || d.protocol.kind === 'fourteenone') return null;
      if (d.discipline === 'snooker' && !snookerGeo) return null; // stale leaf
      const { balls, objective } = d.attempt(ctxFor(d), k,
        catalog.shotSeed(BigInt(d.base_seed), k));
      return JSON.parse(JSON.stringify({ balls, objective }));
    },
    /** Persisted records for the ACTIVE assist mode only — the flat
     * pre-GH-200 shape ({ [id]: { best, plays, ts } }), so every older
     * consumer keeps reading the mode the user is actually on; drills
     * played only under OTHER modes are omitted. */
    bests: () => JSON.parse(JSON.stringify(Object.fromEntries(
      Object.entries(progress().drills)
        .filter(([, modes]) => modes[sessionAssist])
        .map(([id, modes]) => [id, modes[sessionAssist]])))),
    /** GH-200: the FULL v2 map ({ [id]: { [assist]: { best, plays, ts } } })
     * — settings.js's recent-cards recency ranks by max ts across modes
     * here while displaying the active mode's best. Read-only clone. */
    bestsByAssist: () => JSON.parse(JSON.stringify(progress().drills)),
    /** GH-135 settings last-played card: the persisted `last` id (KNOWN-id
     * sanitized by loadBlob; null on a virgin blob). Read-only. */
    last: () => progress().last,
  };
}
