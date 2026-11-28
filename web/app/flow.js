// Copyright (c) Meta Platforms, Inc. and affiliates.

// flow.js — browser adapter for the SDK rules engines (STREAM-B, see
// the ownership ledger (internal); feature 011 multi-game support). The referees are
// PURE and live in sdk/ts/src/rules/ (nineball.ts judgeShot + the Ruleset
// registry of rules/index.ts — contracts/ruleset-api.md); this file is the
// glue: hotseat turn alternation (two players), cue-ball placement rights
// (anywhere vs the 8-ball kitchen, WPA 4.3(f)–(h) vs 4.9), foot-spot respot
// routing (the 9 on fouls; the 8 on 4.3(e)/(f)/(g) resolutions) via the
// parametrized respot geometry, call/safety nomination recording, rulebook
// decision prompts (dry break 4.3(d), 8-on-break 4.3(e)/(f), break fouls
// 4.3(g)/(h), stalemate 4.11), HUD presentation, and the WIN auto re-rack.
//
// CONTRACT kept (the ownership ledger): SETTLED is transient — the shotComplete
// hook routes the machine to WIN / BALL_IN_HAND / AIM synchronously, and
// game.respotCue() runs before entering BALL_IN_HAND. Rules never touch
// physics: every verdict derives from record.events (constitution P-II).
//
// Ruleset routing (feature 011): the registry (rules/index.js getRuleset)
// gained NEW exports on an already-shipped dist module, so it is loaded via
// DYNAMIC import + feature detection (the cache-poison contract,
// the ownership ledger rule 5) — a stale cache degrades to the pre-feature 9-ball
// legacy path below, never a dead boot. nine_ball verdicts are identical on
// both paths (the nineball-v1 wrapper is verdict-frozen, FR-003); the
// legacy-shaped window.__rules.judgment() wire for 9-ball is preserved
// (e2e-rules.mjs pins fouls as bare code strings).
//
// Hook events (playerChanged / foulCalled / gameWon + the feature-011
// additions groupsAssigned / pocketCalled / decisionRequired /
// decisionMade) are emitted through machine.emit guarded by try/catch:
// state.js's EVENTS list is frozen and does not know the new ones yet
// (deviation filed — integrator adds them). Each is also mirrored to the
// console as `[flow] event {json}` for the headless e2e, and the payloads
// ride on the stateChange info object so other streams can consume them.
import {
  FOUL_LABELS, deriveOnTable, judgeShot,
} from '../dist/pool-sdk/rules/nineball.js';
import {
  clampToBed, placementFits, respotNineSpot,
} from '../dist/pool-sdk/rules/respot.js';
import { kPosToThree, threePosToK } from './coords.js';
import { onLocaleChange, t } from './i18n.js';
// namespace import on purpose (OWNERSHIP rule 5 / GH-313 hasLocal law):
// hasLocal() is reached via the namespace so a fresh flow.js over a stale
// cached i18n.js keeps linking and degrades to the legacy copy path.
import * as i18nNs from './i18n.js';
import { ctx } from './settings.js';

/** Decision-kind → wire id (contracts/share-codec-v4.md, FROZEN enums —
 * duplicated here as pinned wire constants, same discipline as the codec). */
const DECISION_IDS = Object.freeze({
  dry_break: 1, eight_legal_break: 2, eight_foul_break: 3,
  break_foul: 4, stalemate: 5,
  // feature 012 (contracts/rulesets-012.md §3, additive):
  break_pocket: 6,   // one-pocket pocket assignment (WPA 12.3)
  stalemate_lag: 9,  // one-pocket stalemate lag record (WPA 12.10)
  break_spot: 10, // feature 012 US3 (carom): UMB Art 23.1(c) start-spot choice
  // feature 025 (issue #65, additive — the first id past the frozen v4
  // 1-10 space): 14.1 opening-break violation, accept/re-break (WPA 7.3(b))
  break_violation: 11,
  // feature 026 (GH-343, additive): 10-ball push-out response (WPA 6.4)
  // and the wrongful-pot opponent option (WPA 6.6)
  pushout_response: 12,
  wrongful_pot: 13,
  // GH-371 (additive): the recorded rulebook REQUESTS — never pending,
  // choiceMax 1. spot_nearest is ONE kind with per-family wire ids
  // (14 one-pocket; 15 rides FOURTEENONE_SPOT_NEAREST_ID below);
  // contact_respot (16) is the carom Art 27.1(a) demand-respot.
  spot_nearest: 14,
  contact_respot: 16,
});

/** GH-371: the fourteenone-family wire id for the spot_nearest kind
 * (the decision id space is per-ruleset disjoint — one kind, two ids). */
const FOURTEENONE_SPOT_NEAREST_ID = 15;

// ---- snooker (feature 012 US2) pinned wire constants ------------------------
// Decision enums 7/8 appended by contracts/rulesets-012.md §3 (v4 additive,
// no version bump); kept in the lane's own frozen map so the story-lane
// sections merge additively (T053).
const SNOOKER_DECISION_IDS = Object.freeze({
  play_again: 7,            // WPBSA Sec3 R13
  respotted_black_toss: 8,  // WPBSA Sec3 R4(b)
  // GH-382 (build 17, snooker-v2 only): the Sec3 R14(b) options —
  // 1 non-offender plays (position left) | 2 offender plays again
  // (position left) | 3 offender plays again from the ORIGINAL
  // position (all balls replaced bit-exactly from the judged stroke's
  // recorded address). Id 17: the GH-371 lane allocated 14-16.
  foul_and_a_miss: 17,
});
/** Colour id → i18n suffix source (snooker.ball.<id> keys, all 7 locales). */
const SNOOKER_COLOUR_MIN = 16, SNOOKER_COLOUR_MAX = 21;

// ---- heyball (GH-491, build 18) pinned wire constants -----------------------
// Share-codec growth ids 18–23 (WPA Rules of Heyball II.6/II.21, the
// heyball-v1 crate's decision table). The decision id space is per-ruleset
// DISJOINT: the heyball KINDS 'break_foul' and 'stalemate' collide with the
// eightball kind names but carry their own wire ids — the one-kind-two-ids
// law of FOURTEENONE_SPOT_NEAREST_ID, family-scale.
const HEYBALL_DECISION_IDS = Object.freeze({
  illegal_break: 18,    // II.6(c): dry break — accept / re-rack ×2 (no BIH)
  break_foul: 19,       // II.6(e): kitchen BIH as it lies / re-rack ×2
  eight_break_pot: 20,  // II.6(f): spot the 8 + keep shooting / re-break
  eight_break_foul: 21, // II.6(f): spot + kitchen BIH / re-rack ×2
  break_miscue: 22,     // II.6(g): cue short of the rack — who breaks
  stalemate: 23,        // II.21: agreement — ORIGINAL breaker re-breaks
});

export function createFlow({ machine, game, hud, reportError }) {
  let player = 1;           // hotseat seat to shoot next: 1 | 2
  let lastRecord = null;    // replays re-emit shotComplete with the SAME
  let lastRouting = null;   // record — re-route, never re-adjudicate
  let lastJudgment = null;  // 9-ball: legacy NineBallJudgment shape (pinned
                            // e2e wire); other games: the contract Judgment
  let savedBihPos = null;
  // GH-371 (review r4 P1): adapter-only rule-request placements pending
  // for the NEXT shot (spot_nearest / contact_respot). A DVR Replay
  // re-poses every mesh from the LAST shot's sampler, which predates
  // these placements — routeReplay re-applies them so the sender's next
  // stroke and a shared replay see the same table. Cleared when the
  // following shot settles (its record's initial captures them).
  let pendingRulePlacements = [];   // BIH cue placement to restore after an in-app
                            // Replay (routeReplay must not discard it)
  let placementRight = 'anywhere'; // active BIH right: 'anywhere' | 'kitchen'
  let lastTerminal = null;  // terminal {winner, reason, cite} for the banner
  let foldCarried = false;  // GH-990: a rulebook re-rack restored the match
                            // fold over the fresh rack (shot 0, progress kept)
  let lastFoldGameId = null; // GH-460: the discipline the PREVIOUS fresh
                            // fold ran under — a fold under a different
                            // gameId is a discipline switch (new match,
                            // cold-boot breaker), never a rack law
  let frameBreaker = null;  // GH-716: the seat the CURRENT fresh fold was
                            // seeded with (the frame's/rack's breaker) —
                            // the snooker match state carries no breaker,
                            // and WPBSA Sec3 R3(b) alternates the break-off
                            // frame by frame whoever won
  let nextFrameBreaker = null; // GH-716 review r1: the seat the NEXT snooker
                            // frame's fold must seed (3 - frameBreaker),
                            // pinned at the frame's WIN and consumed by the
                            // fold alone — `player` stays the WINNER for
                            // the whole WIN hold (banner, score line,
                            // matchState().shooter readers)
  let parkedSeam = null;    // GH-716 review r1v P3-a: { seat, gid } — the
                            // VIEWER's nextFrameBreaker parked while a
                            // shared replay holds the table (its transport
                            // folds under the replay lock); handed back to
                            // exitReplay's pinned restoration fold, dropped
                            // when Continue adopts the replayed frame
  let replaySeatPin = false; // GH-460 (review r1 P2): applyReplaySeat arms
                            // this for the ONE fold it precedes — the
                            // replay-EXIT restoration re-pins the viewer's
                            // seat while still locked and then re-racks the
                            // viewer's game UNLOCKED (share.js exitReplay),
                            // so the lock alone cannot exempt that fold
                            // from the discipline-switch reseed
  // GH-994: the playground's fresh-table reset (its placement undo state),
  // registered by the sandbox block at the bottom of this function — a hook,
  // so the stateChange fresh-table branch below never reads the sandbox's
  // `let` bindings in their temporal dead zone during the boot re-racks
  let playgroundFreshTable = null;

  // ---- ruleset registry (feature 011): dist rules/index.js gained new
  // exports on a shipped module — dynamic import + feature detect, per the
  // cache-poison contract. Missing/stale ⇒ `rules` stays null and the
  // legacy 9-ball path below judges exactly as before this feature.
  let rules = null;
  // GH-492 TEST SEAM: `?obholdrules=<ms>` (scripted `?obtool` boots only)
  // HOLDS the registry-ready chain for <ms> — the deterministic stand-in
  // for a storm-loaded boot whose dynamic import lands after the rack's
  // AIM(seed) (the share-replay boot race: resetMatch early-returns on the
  // null registry, no break address is staged, and an unguarded transport
  // would fire shot 0 over the fold-less AIM). e2e-share's boot-race arm
  // drives it; production boots never carry `?obtool`, and the param
  // without it is ignored. Capped — a typo must never wedge a test boot.
  const rulesHoldMs = (() => {
    try {
      const q = new URLSearchParams(window.location.search);
      if (!q.has('obtool') || q.get('obtool') === '0') return 0;
      const ms = Number(q.get('obholdrules'));
      return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 30_000) : 0;
    } catch { return 0; }
  })();
  if (rulesHoldMs > 0) {
    // the armed seam SAYS so — e2e-share's boot-race arm asserts this line
    // (seam-liveness: a rotted seam must fail the arm loud, never leave it
    // vacuously green)
    console.warn(
      `[flow] GH-492 TEST SEAM: holding the rules registry ${rulesHoldMs} ms`);
  }
  const rulesReady = (rulesHoldMs === 0 ? Promise.resolve()
    : new Promise((res) => { setTimeout(res, rulesHoldMs); }))
    .then(() => import('../dist/pool-sdk/rules/index.js'))
    .then((m) => {
      if (typeof m.getRuleset === 'function'
        && typeof m.nineballStateFromRecord === 'function') rules = m;
      else console.warn('[flow] rules registry stale — 9-ball legacy path');
      return rules;
    })
    .catch((e) => {
      console.warn('[flow] rules registry unavailable — 9-ball legacy path:', e);
      return null;
    });

  // ---- rules-variant routing (feature 022 US2, L-APP T018) -----------------
  // A NON-default preset selection routes the match fold through the
  // committed rules artifact's preset_initial_state_json path
  // (contracts/registry-api.md §2/§4); the default preset — or no
  // selection, or a catalog row carrying the FR-005 `aliases`
  // instruction — keeps the untouched v1 registry path byte-identical.
  // backend.js is already on the rules/index.js module graph (the
  // crate-backed wrappers ride it), so this dynamic import + feature
  // detection adds no boot cost and degrades per the cache-poison
  // contract: stale/missing ⇒ default presets only, never a dead boot.
  let rulesBackend = null;
  let rulesVersionStr = null; // pool-rules artifact stamp (bundle v2 seam):
                              // null until the glue resolves — and forever
                              // on a stale/failed rules boot (degrade, never
                              // throw; the __rules.rulesVersion() contract)
  const backendReady = import('../dist/pool-sdk/rules/backend.js')
    .then((m) => {
      // bundle v2 (feature 025 (internal spec) Amendment v2): capture the rules
      // artifact stamp INDEPENDENT of the preset-surface staleness check
      // below — a backend too stale for presets can still report its
      // version (feature-detected per the cache-poison contract)
      try {
        rulesVersionStr = typeof m.rulesVersion === 'function'
          ? String(m.rulesVersion()) : null;
      } catch { rulesVersionStr = null; }
      if (typeof m.judgeJson === 'function'
        && typeof m.rulesCatalogJson === 'function'
        && typeof m.unwrap === 'function'
        && typeof m.wasm?.rules_preset_initial_state_json === 'function') {
        rulesBackend = m;
      } else console.warn('[flow] rules backend stale — default presets only');
      return rulesBackend;
    })
    .catch((e) => {
      console.warn('[flow] rules backend unavailable — default presets only:', e);
      return null;
    });
  let activeVariant = null; // {preset, taskHash} while a non-default preset judges

  /** Catalog preset row for `presetId` (+ its owning engine id), or null.
   * The app resolves selections EXCLUSIVELY from the committed artifact's
   * catalog — no app-side preset parsing (registry-api.md §4). */
  function presetRowFor(presetId) {
    if (!rulesBackend) return null;
    try {
      const catalog = JSON.parse(rulesBackend.rulesCatalogJson());
      for (const entry of catalog.rulesets) {
        for (const row of entry.presets ?? []) {
          if (row.id === presetId) return { ...row, engine: entry.id };
        }
      }
    } catch { /* malformed catalog — treated as no row below */ }
    return null;
  }

  /** Ruleset-shaped adapter over the artifact's variant engine for a
   * non-aliased preset row: initialState = the preset resolution
   * (task-config path), judge/applyDecision/hudState = the registry fns
   * on the engine id — the state itself carries the resolved config +
   * task_hash (config-in-state, registry-api.md §3). */
  function variantRulesetFor(row) {
    const b = rulesBackend;
    return {
      id: row.engine,
      initialState: (breaker) => JSON.parse(b.unwrap(
        b.wasm.rules_preset_initial_state_json(row.id, breaker))),
      judge: (state, record, call) => JSON.parse(b.judgeJson(row.engine,
        JSON.stringify(state), JSON.stringify(record), JSON.stringify(call))),
      applyDecision: (state, d) => JSON.parse(b.applyDecisionJson(
        row.engine, JSON.stringify(state), JSON.stringify(d))),
      hudState: (state) => JSON.parse(b.hudStateJson(
        row.engine, JSON.stringify(state))),
    };
  }

  // GH-382 (review r5 P1): the capability handshake — fresh settings.js
  // exposes the wpbsa-snooker-full picker row only when the ACTIVATING
  // module (this flow) declares the decision-14/free-ball adapter; a
  // stale flow publishes nothing and the fresh picker hides the row
  // (the all-stale pairing degrades through the activation gate above).
  // the rules readiness promise (review r17/r18 P1): replay gates AWAIT
  // it before treating a false chain as staleness — a cold load's
  // chain reads false (or worse, true with the REGISTRY import still
  // pending) only because the dynamic imports have not settled yet;
  // both must land before a v2 replay may fold
  // ---- snooker (US2) leaf geometry: snookerRespotPlan is a NEW export on
  // the shipped respot.js and layouts.js is a NEW leaf module — dynamic
  // import + feature detection per the cache-poison contract (the ownership ledger
  // rule 5). Missing/stale ⇒ `snookerGeo` stays null and respots degrade
  // to the foot-spot fallback; the D placement falls back to its pinned
  // rulebook constant. (Moved above the readiness/chain wiring — review
  // r25 P1: snooker-v2 RULINGS derive from this geometry, so the chain
  // below fails closed on it and readiness awaits the import.)
  let snookerGeo = null;
  const snookerGeoReady = Promise.all([
    import('../dist/pool-sdk/rules/respot.js'),
    import('../dist/pool-sdk/games/layouts.js'),
  ]).then(([r, l]) => {
    if (typeof r.snookerRespotPlan === 'function' && l.SNOOKER_LAYOUT) {
      snookerGeo = { plan: r.snookerRespotPlan, layout: l.SNOOKER_LAYOUT };
    }
  }).catch(() => { /* leaf modules absent — fallback paths keep play alive */ });

  ctx.rulesBackendReady =
    Promise.all([rulesReady, backendReady, snookerGeoReady]);
  // review r31 P1: the stale-module DEGRADE may only be judged after the
  // whole chain has settled — a cold boot's resetMatch (the catch-ups
  // below) can run before the geo leaf lands, and clearing the
  // selection there would silently downgrade a HEALTHY graph for the
  // rest of the session
  let rulesChainSettled = false;
  // GH-491 review r4 P1: the heyball SETTLE catch-up — a persisted-
  // heyball boot can pass the pre-settle fold guard with a null fold,
  // and the variant catch-up below never refolds it (heyball's
  // variantFor is null). Re-enter the fold once settled: a live chain
  // folds slot 11, a stale chain (or a rules import that never landed)
  // REFUSES — a heyball shot must never reach adjudicateLegacy. The
  // !lastRecord guard is the same no-settled-shot law as the variant
  // catch-up's.
  const heyballSettleCatchup = () => {
    rulesChainSettled = true;
    if (game.gameId === 'heyball' && !match.ruleset && !rulesRefused
      && !lastRecord) {
      resetMatch();
      reassertOpeningRight();
    }
  };
  Promise.resolve(ctx.rulesBackendReady)
    .then(heyballSettleCatchup, heyballSettleCatchup);
  // GH-491 review r9 P2: an unjudged (rules-refused) rack is
  // UNSHAREABLE — share.js reads this before minting a link (a link
  // would replay under a judge the sender never saw).
  ctx.rulesSessionRefused = () => rulesRefused;
  ctx.rulesCapabilities = { ...(ctx.rulesCapabilities ?? {}),
    snookerV2: true,
    // the LAZY composite (review r14 P1): evaluated at consumption time
    // (replay start / activation / the picker), after every module and
    // the dynamic backend import have settled — flow's own declaration
    // alone cannot see the rest of the chain at create time
    snookerV2Chain: () => !!(rules
      && rulesBackend?.wasm?.rules_snooker_address_facts_json
      && ctx.shareCapabilities?.snookerV2 === true
      && ctx.aimCapabilities?.snookerV2 === true
      // review r25 P1: v1 survives a null geometry (fallback respots are
      // placement cosmetics) but v2 RULES from it — the pre-election
      // address examination overlays planned respots; a stale respot.js
      // or layouts.js must degrade the preset LOUDLY, never mis-rule
      && !!snookerGeo),
    // GH-491 (review r3 P1): the heyball GAME (not a variant) gates on
    // its own chain — registry slot 11 resolvable in the ACTIVATING
    // artifact + a fresh aim (the II.11 nomination suppression and the
    // explicit-choices decision rail). Same lazy-composite law as
    // snookerV2Chain: evaluated at consumption time (fold / picker),
    // after the chain settles. The probe is a REAL initialState
    // round-trip (review r4 P1): getRuleset alone is a fresh-JS static
    // map lookup that cannot see a pre-0.1.10 wasm — only the artifact
    // itself answering for 'heyball-v1' proves slot 11 is loaded.
    heyballChain: () => {
      try {
        return !!(rules && rules.getRuleset('heyball-v1').initialState(1)
          && ctx.aimCapabilities?.heyball === true
          // review r7 P2: the RECORDER leg (the snookerV2 freeBall-wire
          // precedent) — a cached pre-491 dist codec has no heyball
          // variant/decision tables, so Copy Link would throw on every
          // heyball rack; the game is withheld instead
          && ctx.shareCapabilities?.heyball === true);
      } catch { return false; }
    } };

  // ---- per-shot judgment ledger (feature 025 bundle v2, feature 025 (internal spec)
  // report/spec.md Amendment v2): a rolling ring buffer of every
  // adjudicated shot's verdict AT ADJUDICATION TIME — the rules-logic
  // debugging record the v1 bundle lacked (match_state alone is the
  // post-hoc snapshot). The ledger survives re-racks (resetMatch never
  // clears it), and every row is anchored by the {rack, seed, shot}
  // triple: `rack` is the session-monotonic fresh-table ordinal below —
  // required because same-seed re-racks (eightball-v2 re_break, 14.1 WPA
  // 7.11 three-foul) reset shotIndex to 0 under the SAME seed, so
  // {seed, shot} alone repeats across racks (array order is NOT an
  // identity — the two 128-cap rings can wrap at different rates). The
  // judge-exception catch (the historical issue-#44 swallow point) pushes
  // {rack, seed, shot, judgeError} so a bundle from a judge-broken
  // session shows exactly where adjudication died. Registry entries
  // record the contract Judgment fields; legacy 9-ball entries record the
  // NineBallJudgment fields verbatim (no invented normalization — the
  // shapes ARE the record). Read seam: __rules.judgments() below.
  const JUDGMENT_LEDGER_CAP = 128; // matches game.js SCENARIO_LOG_CAP
  const judgmentLedger = [];
  // fresh-table ordinal: +1 on every rack application this flow observes
  // (boot rerack, seed rerack, scripted layout — the stateChange handler
  // below is the single count point). main.js registers flow BEFORE the
  // boot rerack, so the first rack is 1 and 0 never appears in a row.
  let rackOrdinal = 0;
  // TEST SEAM state (__rules.failNextJudge): a one-shot armed message that
  // makes the NEXT registry adjudication throw INSIDE the judge try — the
  // only way e2e-bugreport can drive the real catch path (reportError +
  // the judgeError ledger row + AIM routing) without a broken artifact.
  let judgeFaultMsg = null;
  // ---- GH-382 snooker-v2 address state --------------------------------------
  // missSnapshot: the judged stroke's record.initial placements — the
  // BIT-EXACT ball-replacement source for decision 17 choice 3 (WPBSA
  // Sec3 R14(b) "all balls shall be replaced"). These are the very
  // scenario bytes the kernel simulated (game.js buildScenario), so the
  // restore reproduces the original position byte-for-byte; replays
  // re-derive the identical snapshot from their own re-simulation
  // (kPosToThree/threePosToK are pure axis permutations — lossless).
  // GH-382 (review r7 P1): a refused v2 replay fold fails CLOSED — the
  // scheduled replay shots still fire, and without this flag the null
  // ruleset falls through to the legacy 9-ball judge
  let rulesRefused = false;
  // GH-382 (review r36 P1): one-fold flag — the in-flight registry
  // catch-up reproduces the PRE-SETTLE variant read the boot recorder
  // pinned (the chain-gated completion preset resolves v1 for that fold)
  let foldPreSettleVariant = false;
  let missSnapshot = null;
  // choice-3 applied on the live table: routeReplay must re-apply the
  // replacement after a re-played PLAYBACK (review r5 P1)
  let missReplaced = false;
  // addressFacts: the crate's Sec3 R8 / Sec2 R17 address examination
  // ({touching, snookered}) over the LIVE post-respot table; freeBallCall
  // pins the referee's FREE BALL call for the turn (evaluated once at
  // turn start — in-hand turns use the Sec2 R17(a) from-the-D arm — and
  // held while the striker places/aims, like the real call).
  let addressFacts = null;
  let freeBallCall = false;
  // the last ANNOUNCED touching signature — the referee calls TOUCHING
  // BALL once per address, not per placement nudge
  let touchingAnnounced = '';
  function pushJudgment(entry) {
    judgmentLedger.push(entry);
    if (judgmentLedger.length > JUDGMENT_LEDGER_CAP) judgmentLedger.shift();
  }
  /** Score/points effect for a ledger entry: the per-discipline tally
   * fields that actually exist on the post-shot state (carom points,
   * snooker/14.1 scores, 14.1 run, one-pocket tallies + owed) — absent
   * fields stay absent (JSON drops nothing that was never there). */
  function ledgerScoreOf(next) {
    const out = {};
    if (next?.points !== undefined) out.points = { ...next.points };
    if (next?.scores !== undefined) out.scores = { ...next.scores };
    if (next?.run !== undefined) out.run = next.run;
    if (next?.tallies !== undefined) out.tallies = { ...next.tallies };
    if (next?.owed !== undefined) out.owed = { ...next.owed };
    return out;
  }

  /** Per-rack match fold (data-model.md: state is a left fold of
   * (judge ∘ applyDecision) over the shot list + calls axis). */
  const match = {
    ruleset: null,     // active Ruleset from the registry (null = legacy)
    state: null,       // ruleset match state (post last shot/decision)
    judgment: null,    // last contract Judgment (any game)
    pendingCall: null, // armed ShotCall for the NEXT shot (nomination)
    log: [],           // recorded calls/decisions this rack (share axis)
  };
  // feature 022: eightball-v2 (the variant engine) IS an 8-ball for every
  // adapter concern — same state shape (+ the additive `variant` block),
  // same decision ids 1-5, same HUD projection (registry-api.md §1/§3)
  const eightActive = () => match.ruleset?.id === 'eightball-v1'
    || match.ruleset?.id === 'eightball-v2';
  const onePocketActive = () => match.ruleset?.id === 'onepocket-v1'; // 012 US1
  // GH-382: snooker-v2 (the wpbsa-snooker-full preset through the
  // variant engine) IS a snooker for every adapter concern — same state
  // shape (+ the additive variant/freeBallEligible/miss blocks), same
  // decision ids 7/8 (+17), same respot/D-zone geometry
  const snookerActive = () => match.ruleset?.id === 'snooker-v1'
    || match.ruleset?.id === 'snooker-v2';
  const snookerV2Active = () => match.ruleset?.id === 'snooker-v2';
  // 012 US3 + GH-383: carom3c-v2 (the carom variant engine) IS a carom
  // for every adapter concern — same state shape (+ the additive
  // `variant` block), same decision id 10, same HUD projection
  const caromActive = () => match.ruleset?.id === 'carom3c-v1'
    || match.ruleset?.id === 'carom3c-v2';
  // GH-383 config-in-state reads (the eightball-v2 flow.js:503 precedent)
  const caromTwoCue = () =>
    match.state?.variant?.config?.two_cue_balls === true;
  /** The cue ball a seat plays (UMB Art 23.2/23.4): under two_cue_balls
   * the STARTER (breaker) owns the plain white (ball 0), the other seat
   * ball 1; the v1 shared-white residual keeps everyone on ball 0. */
  const caromSeatBall = (seat) =>
    (caromTwoCue() && seat !== match.state?.breaker) ? 1 : 0;
  /** Sync game.cueBallId to the CURRENT shooter's ball (called at every
   * carom fold/judgment/seat edge; a stale game.js lacks the setter and
   * stays on ball 0 — the v1 residual, boot rule 5). */
  const caromSyncCueBall = () => {
    if (!caromActive() || !match.state) return;
    game.setCueBallId?.(caromSeatBall(match.state.shooter));
  };
  const fourteenoneActive = () => match.ruleset?.id === 'fourteenone-v1'; // 025
  const tenballActive = () => match.ruleset?.id === 'tenball-v1'; // 026 (GH-343)
  // GH-491 (build 18): heyball — the eighth playable discipline (WPA Rules
  // of Heyball eff. 2025-08-16; no-call play, II.6 break option matrices)
  const heyballActive = () => match.ruleset?.id === 'heyball-v1';
  const pendingDecision = () => match.state?.pendingDecision ?? null;
  // 012 T053 integration: `shotIndex|decision|choice` keys of recorded
  // decisions the adjudicate() pre-judge already applied during a shared
  // replay — ctx.applyReplayDecision must not re-apply them post-settle.
  const consumedReplayDecisions = new Set();

  // shared-replay input lock (share.js publishes ctx.replayActive): while a
  // #r= replay is running, a user click in the inter-shot gap would inject
  // a shot, get the next scheduled replay shot rejected, and silently
  // continue the replay on a diverged table — so Shoot/Replay stay locked.
  const replayLocked = () => !!ctx.replayActive?.();

  // issue #68 session mode: 'playground' suppresses rules judgment (the
  // sandbox section at the bottom of this file). Read LIVE from the
  // settings values through the STREAM-C ctx export — zero new import
  // edges (rule-5 corollary); ctx.settings fills at createSettings, and
  // every read here happens at event time, long after boot.
  const playgroundActive = () =>
    ctx.settings?.get?.()?.mode === 'playground';

  // build-4 QA (solo-addressee nit): practice is a SOLO mode — the drill
  // completion's cue-in-hand grant read "BALL IN HAND — P2: drag …" (the
  // player-rotation copy leaking through the nineball fold; there is no
  // second player in a drill). Same live settings read as playground;
  // shared replays keep the sender's two-player addressing (replay lock).
  const practiceActive = () =>
    ctx.settings?.get?.()?.mode === 'practice' && !replayLocked();

  // issue GH-138: NARROW terminal gate for sandbox-kind drills. While a
  // drill that lays custom layouts over the §3.5 session pin is active
  // (drills.js exposes `sandbox: true` on the __drills.state() wire for
  // the liveFold complement — run/ladder/stations/called/progressive/ten/
  // penalty), the fold's match terminal ("9 potted = rack over" under a
  // 15-ball line-up) is nonsense for the run: adjudicate()/
  // adjudicateLegacy() skip ONLY the terminal surfaces (winner banner,
  // WIN routing, auto re-rack) and land the stroke as a plain settle —
  // the drill's own evaluator/re-lay owns the run. (GH-680 widened this
  // to the whole decision path — see settleUnderDrill.) Fold-observer drills
  // (ghost9/colours/century) report sandbox:false — their real terminals
  // still fire. Feature-detected guarded window read at event time (the
  // aim.js state().kind precedent; rule-5 cache-poison posture: an
  // absent/stale drills.js leaves the gate inert, boot untouched).
  // issue GH-209 (GH-138 x GH-133 reconciliation): the gate is `sandbox`
  // ALONE — the pre-GH-209 `done !== true` clause was DROPPED. A completed
  // sandbox drill parks its `finished` snapshot (still sandbox:true,
  // done:true — the GH-133 post-completion dock register); with the old
  // clause a continued shot after completion revived the still-pinned
  // 9-ball fold and leaked a spurious "PLAYER WINS" (issue GH-209 Bug 2).
  // Suppressing on `sandbox` regardless of `done` encodes the invariant
  // "the 9-ball fold is never the live adjudicator once a sandbox drill
  // has run" — drills.js clears `finished` on a genuine game/mode switch
  // (its stateChange foreign-rerack guard + changeMode stop), so the gate
  // can never bleed into a real match. Shared replays re-judge the
  // SENDER's match regardless of local drills (replayLocked early-out);
  // fold-observer drills (ghost9/colours/century) stay sandbox:false.
  const drillSandboxActive = () => {
    if (replayLocked()) return false;
    try {
      const s = window.__drills?.state?.();
      return s?.sandbox === true;
    } catch { return false; }
  };
  // GH-680: the WHOLE decision path is the sandbox drill's. The GH-138
  // gate above skipped only the terminal surfaces and let fouls keep
  // adjudicating — under a non-rotation objective (the Circle drill: pot
  // one ball, no scratch, cue stays in the circle) a stroke that pots a
  // ball off a first contact other than the 1 read "Success" from the
  // drill AND "FOUL — wrong ball first" + BALL IN HAND + a cue revive at
  // the head spot + a P2 rotation from the 9-ball fold; a drag in that
  // 1.4 s window out-lived the drill's fixed re-lay. Every sandbox kind
  // (run/ladder/stations/called/progressive/ten/penalty) judges from the
  // record bytes (drills.js evaluate/analyze, never __rules.judgment())
  // and owns its table: re-lays re-seat a pocketed cue, foul re-grants
  // ride the drill's own placement classes (grantPlacement). So while a
  // sandbox drill is live OR parked (GH-209 law) the fold records the
  // honest ledger row and lands the stroke as a plain AIM settle: no
  // foulCalled/playerChanged/gameWon hooks, no turn switch, no respot,
  // no in-hand right, no cue revive. The one exception is the PARKED
  // snapshot (state().done !== false — no drill re-lay will ever come):
  // a pocketed cue revives at the head spot there (the playground
  // scratch convention) so the post-completion table stays strokeable.
  const drillRunLive = () => {
    try { return window.__drills?.state?.()?.done === false; } catch { return false; }
  };
  /** The GH-680 sandbox settle: ledger already written by the caller. */
  function settleUnderDrill(info, fouls, terminal) {
    if (fouls.length > 0) {
      emitHook('drillFoulSuppressed', { fouls });
    }
    if (terminal) emitHook('drillTerminalSuppressed', terminal);
    placementRight = 'anywhere';
    if (!drillRunLive() && game.cueBall()?.pocketed) game.respotCue();
    lastRouting = { state: 'AIM', info };
    machine.to('AIM', info);
  }

  const table = () => game.template.system.table;
  const ballR = () => game.template.system.balls[0].params.r;
  const obstacles = (excludeId) => game.activeBalls()
    .filter((b) => b.id !== excludeId)
    .map((b) => { const k = threePosToK(b.mesh.position); return { x: k.x, y: k.y }; });

  function emitHook(event, payload) {
    console.log(`[flow] ${event} ${JSON.stringify(payload)}`);
    try { machine.emit(event, payload); } catch { /* EVENTS frozen (deviation) */ }
  }

  function switchPlayer() {
    player = player === 1 ? 2 : 1;
    emitHook('playerChanged', { player });
  }

  // HUD panel title tracks the ACTIVE game (T036 acceptance fix: the h1 read
  // "9-ball" during an 8-ball match). EVERY game re-keys the element to its
  // catalog display key game.<id> (all 7 locales) — release ruling D2 (uiaudit
  // F13) retired the static 'hud.title' parity exception, whose "9-ball" was
  // the only lowercase discipline name beside "8-Ball" / "10-Ball" and the
  // hall's own "9-Ball". Re-keying data-i18n keeps i18n.applyDom locale
  // switches right.
  const hudTitleEl = document.querySelector('#hud h1[data-i18n]');
  function renderTitle() {
    if (!hudTitleEl) return;
    const id = game.gameId ?? 'nine_ball';
    const key = 'game.' + id;
    if (hudTitleEl.dataset.i18n !== key) hudTitleEl.dataset.i18n = key;
    const text = t(key);
    if (hudTitleEl.textContent !== text) hudTitleEl.textContent = text;
  }
  onLocaleChange(renderTitle);

  /** Fresh-table reset of the match fold (rerack/layout). `layout` scripted
   * scenes sync onTable with the laid-out balls; tests then shape
   * phase/groups/shooter via the __rules.setMatchState seam. */
  function resetMatch({ layout = false, abandon = false } = {}) {
    renderTitle();
    // GH-460: a fresh fold under a DIFFERENT discipline than the previous
    // fold is a NEW MATCH, not another rack of the old one — seed the
    // breaker like a cold boot (seat 1), never the abandoned game's
    // turn-holder (settings changeGame → setGame → rerack landed here with
    // the module hotseat still holding whoever was to shoot). Two guarded
    // carve-outs (the seat-carryover design record, the ownership ledger GH-458/
    // 459/460 section): (a) the replay transport pins the WIRE's breaker
    // right before its own re-rack (ctx.applyReplaySeat under the replay
    // lock — a locked fold must never clobber it); (b) same-discipline
    // rulebook re-racks (winner-breaks, stalemate re-break, dry-break,
    // the drawn rack's breaker carry) fold under an UNCHANGED gameId and
    // keep their own seat laws. No shipped mode carries a seat across a
    // discipline switch (no alternate-break race format exists); one that
    // lands later must pin its seat AFTER this fold, the way the replay
    // transport does.
    const foldGid = game.gameId ?? 'nine_ball';
    const pinnedSeat = replaySeatPin;
    replaySeatPin = false; // one-shot: a pin protects exactly the fold it
                           // precedes (transport re-rack, exit restoration)
    const locked = replayLocked();
    const prevFoldGid = lastFoldGameId;
    const disciplineSwitch = foldGid !== lastFoldGameId;
    if (disciplineSwitch) {
      if (lastFoldGameId !== null && !locked && !pinnedSeat
        && player !== 1) {
        player = 1;
        emitHook('playerChanged', { player });
      }
      lastFoldGameId = foldGid;
    } else if (abandon && lastTerminal === null && !locked && !pinnedSeat
      && frameBreaker !== null && player !== frameBreaker) {
      // GH-1018: a USER re-rack (HUD Re-rack, a re-racking equipment
      // commit — game.rerack's `abandon` flag) of an UNDECIDED rack of the
      // same discipline re-breaks with the ABANDONED rack's breaker — the
      // WPA 4.11/1.13 stalemate law (the original breaker re-breaks),
      // never whoever happened to be on turn. Not a carve-out of the list
      // above: those rulebook re-racks pass no flag. A DECIDED rack
      // (lastTerminal set — a re-rack inside the WIN hold) keeps its
      // next-rack law (winner breaks, the snooker seam, heyball I.12).
      player = frameBreaker;
      emitHook('playerChanged', { player });
    }
    // GH-716 review r1 (WPBSA Sec3 R3(b)): the snooker frame seam. The WIN
    // arm left `player` on the WINNER (the banner / score line / shooter
    // readers present the winner for the whole hold) and pinned the NEXT
    // frame's breaker (3 - frameBreaker) in nextFrameBreaker; a fresh fold
    // of the SAME match — the next frame's reset — is the one place it is
    // applied. review r1v P3-a: the register belongs to the viewer's match
    // and SURVIVES a shared replay covering the table (the r1 one-shot
    // dropped it on the replay's locked transport fold, so a replay entered
    // during the WIN hold handed the next frame back to the winner):
    //   * a LOCKED fold (startReplay / gotoShot re-rack under the replay
    //     lock) parks the register on the way in — the first locked fold
    //     since the last unlocked one — and never keeps a live one (a
    //     replayed frame's WIN, re-run by a ⏮ scrub);
    //   * the first UNLOCKED fold after the lock hands the parked register
    //     back when it is exitReplay's PINNED restoration of the same game
    //     (that re-rack IS the viewer's next frame); Continue adopts the
    //     replayed frame instead — unpinned — and the viewer's abandoned
    //     match takes its register with it;
    //   * every unlocked fold consumes the register: APPLIED on a snooker
    //     fold of the same match, dropped by a discipline switch (the
    //     GH-460 cold-boot reseed above owns that fold).
    if (locked) {
      if (parkedSeam === null) parkedSeam = { seat: nextFrameBreaker, gid: prevFoldGid };
      nextFrameBreaker = null;
    } else {
      let restored = false;
      if (parkedSeam !== null) {
        if (pinnedSeat && parkedSeam.gid === foldGid) {
          nextFrameBreaker = parkedSeam.seat;
          restored = true;
        }
        parkedSeam = null;
      }
      const seamBreaker = nextFrameBreaker;
      nextFrameBreaker = null;
      if (seamBreaker !== null && (restored || !disciplineSwitch)
        && snookerActive() && player !== seamBreaker) {
        player = seamBreaker;
        emitHook('playerChanged', { player });
      }
    }
    match.ruleset = null;
    match.state = null;
    match.judgment = null;
    match.pendingCall = null;
    match.log = [];
    pendingRulePlacements = []; // GH-371: stale requests die with the rack
    placementRight = 'anywhere';
    lastTerminal = null;
    foldCarried = false;
    consumedReplayDecisions.clear();
    activeVariant = null;
    rulesRefused = false;
    missSnapshot = null; // GH-382: address state never crosses racks
    missReplaced = false;
    addressFacts = null;
    freeBallCall = false;
    // GH-491 (review r3 P1): heyball has NO compatible fallback rulebook —
    // a 15-ball heyball rack judged by the legacy stateless 9-ball path
    // (a registry without slot 11) would silently misrule the rack (the
    // review r18 replay fail-closed law, generalized to the live fold).
    // Before the chain settles this is a cold boot racing its own
    // imports (the r31 law): the fold stays null and the heyball settle
    // catch-up re-enters. After settle, a false chain is REAL staleness:
    // refuse the fold loudly — the settle handler routes every shot
    // back to AIM unjudged under the standing banner (review r7
    // machinery), never a different rulebook. Sits ABOVE the rules-null
    // legacy return (review r4 P1): a rules import that never lands must
    // ALSO refuse heyball at settle, not judge it as 9-ball.
    if (game.gameId === 'heyball'
      && ctx.rulesCapabilities?.heyballChain?.() !== true) {
      if (!rulesChainSettled) return;
      reportError('heyball needs the GH-491 rules chain — update this '
        + 'build (stale cached modules)');
      rulesRefused = true;
      return;
    }
    if (!rules) return; // legacy 9-ball path judges statelessly per record
    try {
      match.ruleset = rules.getRuleset(game.rulesetId ?? 'nineball-v1');
      // feature 022 (US2): a non-default rules-variant selection swaps in
      // the artifact-backed variant engine for this rack. Applied ONLY
      // here — at the fresh-rack fold reset — so a mid-rack picker change
      // never re-adjudicates the running rack (it lands on the next rack;
      // US2 scenario 2). Unknown persisted ids fall back to the default
      // LOUDLY (the settings load-path law; share decode already throws
      // on unknown ids before any state reaches this point).
      let vid = ctx.settings?.variantFor?.(game.gameId) ?? null;
      // review r36 P1: an in-flight registry catch-up folds what the boot
      // recorder pinned — the chain-gated completion preset reads null
      // pre-settle, so suppress a since-settled upgrade for THIS fold
      // (persisted chain-independent ids keep their pinned value; the
      // upgrade lands on the next fresh rack)
      if (foldPreSettleVariant && vid === 'wpbsa-snooker-full') {
        vid = null;
      }
      // GH-382 (review r15 P1): the full-preset guard runs BEFORE the
      // backend requirement — with the rules backend stale or absent
      // the chain closure reads false and the session must still pin
      // its EFFECTIVE (default) variant instead of judging v1 under a
      // recorded v2 id
      if (vid === 'wpbsa-snooker-full'
        && ctx.rulesCapabilities?.snookerV2Chain?.() !== true) {
        if (ctx.replayActive?.()) {
          reportError('replay needs the GH-382 snooker adapter chain '
            + "(variant 'wpbsa-snooker-full') — update this build");
          rulesRefused = true;
          match.ruleset = null;
          match.state = null;
          return;
        }
        if (!rulesChainSettled) {
          // review r31 P1: the chain has not SETTLED — this is a cold
          // boot racing its own dynamic imports, not staleness. Fold
          // the default engine for THIS rack WITHOUT touching the
          // selection; the full-readiness catch-up below re-folds with
          // the persisted preset once the chain can be judged honestly.
          vid = null;
        } else {
          console.warn('[flow] rules variant \'' + vid + '\' needs the '
            + 'GH-382 adapter chain (fresh artifact + address surface + '
            + 'freeBall share wire + aim nomination) — playing the '
            + 'frozen v1 rules (stale-module degrade)');
          // decision-1 update: pin the EXPLICIT v1 alias, not a bare
          // clear — under the flipped live default a cleared selection
          // resolves right back to the full preset (a degrade loop and
          // an r15 diverging recorder pin); the explicit alias keeps
          // fold, recorder wire and picker byte-consistent
          ctx.settings?.setTransientVariant?.(game.gameId, 'wpbsa-snooker');
          if (game.shotIndex === 0 && !replayLocked()) {
            Promise.resolve().then(() => {
              if (game.shotIndex === 0) game.rerack(game.seed);
            });
          }
          vid = null;
        }
      }
      if (vid !== null && rulesBackend) {
        const row = presetRowFor(vid);
        // GH-382 (review r4/r5 P1, the ownership ledger rule-5 cache-poison law):
        // the snooker-v2 engine NEEDS its whole adapter chain fresh —
        // the artifact's address surface (the Sec3 R8/R12 referee
        // examination) AND a share recorder that carries the freeBall
        // wire (a stale share.js silently drops it and mints a
        // diverging link). Any missing capability falls back to the
        // default (frozen v1) path LOUDLY, and the session's EFFECTIVE
        // variant is pinned to the default transiently so the recorded
        // wire matches what actually judged (review r5: recording the
        // selected-but-refused id would replay under v2).
        // the full preset was gated above (review r7/r13/r15: id-keyed,
        // backend-independent, replay-refusing, recorder-synced); a
        // MISSING row for it cannot reach here
        if (vid === 'wpbsa-snooker-full' && !(row && !row.aliases)) {
          // the artifact carries no v2 row despite the chain probe — an
          // inconsistent pairing; degrade like the chain failure (the
          // decision-1 explicit-alias pin, same rationale as above)
          console.warn('[flow] the rules artifact lists no '
            + "'wpbsa-snooker-full' row — playing the frozen v1 rules");
          ctx.settings?.setTransientVariant?.(game.gameId, 'wpbsa-snooker');
        } else if (row && !row.aliases) {
          match.ruleset = variantRulesetFor(row);
        } else if (!row) {
          console.warn(`[flow] rules variant '${vid}' unknown to the `
            + 'catalog — playing the default preset');
        }
      }
      match.state = match.ruleset.initialState(player);
      frameBreaker = player; // GH-716: this fold's breaker (see the WIN arm)
      if (match.state?.variant) {
        activeVariant = {
          preset: vid, taskHash: match.state.variant.task_hash,
        };
      }
      if (layout && (eightActive() || onePocketActive() || snookerActive()
        || fourteenoneActive() || tenballActive() || heyballActive())) {
        match.state = {
          ...match.state,
          onTable: game.activeBalls().filter((b) => b.id > 0)
            .map((b) => b.id).sort((a, b) => a - b),
        };
      }
      // GH-383: a fresh carom fold seats the BREAKER's ball as the cue
      // (ball 0 under every config — Art 23.2; the per-seat sync keeps
      // following the judgment folds from here)
      if (caromActive()) caromSyncCueBall();
      // one-pocket (feature 012 US1): a fresh rack starts with the WPA
      // 12.3 pocket assignment pending — surface the decision immediately
      // (aim.js re-drives the same prompt from the hudState projection)
      if (onePocketActive() && match.state.pendingDecision) {
        emitHook('decisionRequired', {
          kind: match.state.pendingDecision.kind,
          chooser: match.state.pendingDecision.chooser,
        });
        driveBreakPocketPrompt();
      }
    } catch (e) {
      match.ruleset = null;
      match.state = null;
      // GH-491 review r4 P1: a heyball init failure has NO compatible
      // fallback — post-settle, fail the rack closed (the standing-
      // banner machinery; a legacy-judged heyball shot is misrule).
      // Pre-settle keeps the catch-up window open.
      if (game.gameId === 'heyball' && rulesChainSettled) {
        rulesRefused = true;
      }
      reportError('rules init: ' + (e?.message ?? e));
    }
  }
  /** GH-370 class 1: the opening placement right for the CURRENT fresh
   * table (null = none). Pool family ⇒ 'kitchen' (WPA 4.3(a)/5.3(a)/
   * 6.3(a)/7.3(a)/12.3 via 1.6); snooker ⇒ 'd_zone' (WPBSA Sec2 R9(a)(i)
   * + Sec3 R5). Registry folds gate on their explicit opening phase
   * (one-pocket opens in 'pocket_choice'; a carried 12.10 fold re-opens
   * in 'play' at shot 0); nine_ball's fold is per-record — the fresh rack
   * IS the break. Consulted by the conversion macrotask below AND by the
   * registry catch-up resets (which stomp placementRight to 'anywhere'
   * while the opening BALL_IN_HAND is already live — the boot race). */
  function openingRightFor() {
    // keyed off game.gameId, NEVER the fold's ruleset id (review r1 P1): on
    // a persisted-game boot the rack's AIM fires before the registry
    // import resolves — match.ruleset is still null there, and the fold's
    // phase (when present) gates below (ph undefined = pre-registry or
    // the phase-less nine_ball fold: the fresh rack IS the break).
    if (POOL_OPENING.has(game.gameId)) {
      const ph = match.state?.phase;
      return (ph === undefined || ph === 'break' || ph === 'pocket_choice'
        || (game.gameId === 'one_pocket' && ph === 'play')) ? 'kitchen' : null;
    }
    return game.gameId === 'snooker' ? 'd_zone' : null;
  }
  /** Re-assert the opening right after a catch-up resetMatch that ran
   * UNDER the live opening BALL_IN_HAND (boot import race). Never over a
   * DRILL-granted placement window (review r3 P2): a drill that started
   * before the registry resolved holds its own BALL_IN_HAND grant
   * (drills.js `grant`, read feature-detected), and re-asserting the
   * opening kitchen right here would silently clamp the drill's
   * full-table placements. */
  function reassertOpeningRight() {
    if (!machine.is('BALL_IN_HAND') || lastRecord || game.shotIndex !== 0) {
      return;
    }
    try {
      const d = window.__drills;
      if (d?.grant?.()) return; // the drill owns the window
      // cached pre-370 drills.js has no grant seam (review r5 P2 — the
      // mixed-cache contract): an ACTIVE run still owns the table, so a
      // pre-registry drill start's placement window must not be
      // re-legislated to the opening kitchen right
      if (typeof d?.grant !== 'function' && d?.state?.()?.done === false) {
        return;
      }
    } catch { /* seam absent — no drill layer */ }
    const r = openingRightFor();
    if (r) { placementRight = r; renderText(); }
  }
  // the boot rerack can fire before the dynamic import resolves — fill the
  // fold in as soon as the registry lands (no shot can have settled yet)
  rulesReady.then(() => {
    if (rules && !match.ruleset && !lastRecord) {
      // review r36 P1: an IN-FLIGHT registry catch-up (shot 0 already
      // struck before the registry landed) must fold the variant the
      // boot recorder PINNED — the pre-settle read — never the
      // possibly-settled-by-now chain read: a stroke wire-pinned v1
      // must not be judged v2 (the r35 in-flight law, registry leg).
      // Replays never set the flag (a v2 link must reach the replay
      // gate as full and REFUSE — fail closed).
      foldPreSettleVariant = game.shotIndex !== 0 && !replayLocked();
      try {
        resetMatch();
      } finally {
        foldPreSettleVariant = false;
      }
      // both boot catch-ups (merge sweep): GH-370 re-asserts the opening
      // placement right; GH-383 re-stages the carom break address
      reassertOpeningRight();
      caromRouteBreakCatchup();
    }
  });
  // same catch-up for the variant backend (feature 022): a persisted
  // non-default selection whose rack composed before backend.js resolved
  // re-folds in place — no shot can have settled yet. Awaits the WHOLE
  // readiness composite (review r31 P1: the geo leaf rides it too, so
  // the re-fold judges the chain's true verdict, never a racing null).
  // GH-382 decision 1 (review r33 P2): a shotless non-replay session
  // RE-RACKS on its own seed instead of bare re-folding —
  // settings.variantFor's live default is chain-gated, so this settle
  // can UPGRADE the read (null → wpbsa-snooker-full) after the share
  // recorder pinned the pre-settle value at the boot resetLog; the
  // same-seed rerack re-runs resetLog so the recorded wire always
  // matches the fold that judges (the r13 boot-fallback precedent,
  // upgrade direction — same rack bytes, seed unchanged).
  Promise.resolve(ctx.rulesBackendReady).then(() => {
    const vid = ctx.settings?.variantFor?.(game.gameId) ?? null;
    if (rulesBackend && !lastRecord && vid) {
      if (vid === 'wpbsa-snooker-full') {
        // the upgrade case is snooker-scoped: every other family's read
        // is persisted-only (chain-independent), already pinned right
        // at the boot resetLog — those keep the in-place re-fold below.
        // review r35 P1: an IN-FLIGHT opening shot (shotIndex already
        // bumped, no settled record yet) keeps the fold it was struck
        // under AND the recorder's pinned wire — no refold of any kind;
        // the upgrade lands on the NEXT fresh rack through variantFor's
        // natural read (the changeVariant next-rack law).
        if (game.shotIndex === 0 && !replayLocked()) {
          game.rerack(game.seed);
          reassertOpeningRight();
          caromRouteBreakCatchup();
        }
        return;
      }
      resetMatch();
      reassertOpeningRight();
      caromRouteBreakCatchup();
    }
  });
  /** GH-383 (found by the e2e-userboot arm-7 red): a PERSISTED carom
   * profile composes its boot rack BEFORE the rules modules resolve, so
   * the fresh-rack AIM(seed) routing arm below has already passed by the
   * time the fold exists — the break address (BALL_IN_HAND, carom_break
   * clamp + the pending break_spot prompt) must be re-staged by the boot
   * catch-ups above. Mirrors the stateChange arm exactly; inert unless
   * the fold is a carom at its break phase with no record yet. */
  function caromRouteBreakCatchup() {
    if (!caromActive() || match.state?.phase !== 'break') return;
    setTimeout(() => {
      if (!caromActive() || match.state?.phase !== 'break') return;
      if (!machine.is('AIM') || lastRecord) return;
      placementRight = 'carom_break';
      lastRouting = { state: 'BALL_IN_HAND', info: { caromBreak: true } };
      machine.to('BALL_IN_HAND', { caromBreak: true });
    }, 0);
  }

  // GH-595 (review r1 P2): the direct-write placement lanes — the full-table
  // 'anywhere' branch below and pgPlaceBall — bypass game.js resolvePlacement
  // (whose guard snaps out of capture discs), so they get the same protection
  // here. A centre at/inside a point-of-no-return disc starts the shot
  // "already pocketed" (the kernel rejects gap <= 0); push the request
  // radially OUT to the rim + the KISS band. Only ever moves an ILLEGAL
  // request, so recorded seats (never inside a disc) are untouched.
  function snapOutOfPockets(t, p) {
    let x = p.x, y = p.y;
    for (const pk of (t?.pockets ?? [])) {
      const dx = x - pk.center.x, dy = y - pk.center.y;
      const d = Math.hypot(dx, dy);
      if (d > pk.radius) continue; // inclusive rim: gap <= 0 pots
      if (d < 1e-12) {
        const o = Math.hypot(x, y) || 1;
        x += (-x / o) * (pk.radius + 1e-6);
        y += (-y / o) * (pk.radius + 1e-6);
      } else {
        x = pk.center.x + (dx / d) * (pk.radius + 1e-6);
        y = pk.center.y + (dy / d) * (pk.radius + 1e-6);
      }
    }
    return { x, y };
  }

  // ---- ball-in-hand placement rights: wrap the frozen game.placeCue.
  // 9-ball fouls and 8-ball standard fouls (WPA 4.9 via 1.6) grant
  // ANYWHERE; 8-ball break fouls (4.3(f)–(h)) grant the KITCHEN only —
  // kitchen targets delegate to the original clamp (its syncSphereUniforms
  // call keeps the analytic shadows fresh); full-table targets are
  // validated with the SDK placement rules and applied directly.
  const kitchenPlaceCue = game.placeCue;
  game.placeCue = (kx, ky) => {
    const t = table(), r = ballR();
    let p = clampToBed(t, r, { x: kx, y: ky });
    // issue #68 playground: placement rights are a RULES concept — the
    // sandbox always grants free full-table placement (the 'anywhere' path
    // below), whatever right the suspended match left behind. Shared
    // replays keep the recorded rights (replay routing bypasses the mode).
    const right = playgroundActive() && !replayLocked()
      ? 'anywhere' : placementRight;
    const ok = (() => {
      if (right === 'd_zone') {
        // snooker in-hand: on/within the D (WPBSA Sec3 R5, feature 012
        // US2) — the game.js D clamp beside the kitchen clamp; a stale
        // game.js degrades to the kitchen region (strictly contains the
        // D). Shared REPLAYS re-apply the recorded seat VERBATIM (GH-382
        // review r33 P1 + r34 P1 — the kitchen lineExclusive law: the
        // raw clamp DEFAULTS to the verbatim pre-r27 law and the fresh
        // LIVE caller opts into the r27 non-touching clearance): a
        // legacy link's old touching-park coordinate must never be
        // re-projected (a moved seat re-derives a different ShotRecord).
        return game.placeCueInD
          ? game.placeCueInD(p.x, p.y, { nonTouching: !replayLocked() })
          : kitchenPlaceCue(p.x, p.y);
      }
      // 012 US3 (carom): the break placement is the two start spots ONLY
      // (UMB Art 23.1(c)) — snap to the nearer one. The start line sits on
      // y = −l/4 exactly and is LEGAL there (UMB spots, not a WPA kitchen):
      // the raw clamp's DEFAULT is the inclusive pre-370 bound (review r1
      // P2 mixed-cache law), so this call stays two-arg and carom
      // placement stays byte-identical (sphere-shadow uniforms synced).
      if (right === 'carom_break') {
        const s = caromStartSpotFor(p.x);
        return s ? kitchenPlaceCue(s.x, s.y) : false;
      }
      // WPA kitchen right: EXCLUSIVE of the head string (GH-370 class 2,
      // WPA 2.1/3.10 — the fresh-caller opt on the inclusive-default
      // clamp). Shared REPLAYS keep the inclusive law: the recorded
      // placement is the sender's committed truth (a pre-370 link's
      // undragged kitchen seat sits exactly ON −l/4), and re-simulation
      // must re-apply it byte-verbatim, never re-legislated.
      if (right === 'kitchen') {
        return kitchenPlaceCue(p.x, p.y, { lineExclusive: !replayLocked() });
      }
      // full-table right (WPA 1.6): a BLOCKED request snaps on BED bounds
      // only (review r2 P2 — the legal contact point may sit ACROSS the
      // head string when the blocker straddles it; the line constrains
      // KITCHEN rights exclusively, never the full-table snap). GH-370
      // class 3 (WPA 1.6/3.7): snap to the kernel-admissible contact
      // separation instead of refusing — feature-detected on the
      // dynamically-imported registry (a stale cache keeps the pre-370
      // refusal law). GH-383 (merge sweep): the moving ball is the LIVE
      // cue register, so the obstacle set excludes IT, not literal 0
      // (carom two-cue; identical bytes everywhere else).
      const obs = obstacles(game.cueBall()?.id ?? 0);
      if (!placementFits(t, r, p, obs)) {
        const snapped = rules?.snapToContact?.(t, r, p, obs) ?? null;
        if (!snapped) return false;
        p = snapped;
      } else if (p.y < -t.length / 4 - 1e-6) {
        // FITTING requests strictly behind the head string keep the
        // legacy kitchen-clamp delegation (its syncSphereUniforms path;
        // neither line bound binds a point already below them, so the
        // inclusive-default raw clamp applies the point verbatim). A
        // request exactly ON the line stays on the direct write below —
        // the line is a legal full-table address (WPA 2.1 excludes it
        // only from the kitchen; GH-370 class 2).
        return kitchenPlaceCue(p.x, p.y);
      }
      p = snapOutOfPockets(t, p); // GH-595: keep the full-table seat off the discs
      // GH-595 (review r2 P2): the pocket snap can push the seat onto an object
      // ball sitting just past the rim on the same radial — re-run the overlap
      // resolution, then re-clear the discs (the kernel rejects either flaw).
      if (!placementFits(t, r, p, obs)) {
        const reSnap = rules?.snapToContact?.(t, r, p, obs) ?? null;
        if (!reSnap) return false;
        p = snapOutOfPockets(t, reSnap);
        // GH-595 (review r3 P2 / r4 P1): the pocket push can re-overlap the ball
        // snapToContact resolved. snapOutOfPockets guarantees disc-clear, so
        // verify the KERNEL kiss-band overlap rule (gap >= 2r - Eps::KISS), NOT
        // placementFits' stricter live clearance (2r + 1e-4): a valid contact
        // seat at 2r + 1e-9 — including replayed kiss-band placements — must be
        // accepted verbatim (the ownership ledger), so only a GENUINE kernel overlap the
        // push could re-introduce is rejected.
        if (!obs.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= 2 * r - 1e-6)) {
          return false;
        }
      }
      kPosToThree(game.cueBall().mesh.position, p.x, p.y, r);
      // issue GH-143: the DIRECT mesh write above bypasses game.js's clamp
      // paths (whose syncSphereUniforms keeps the analytic sphere-shadow
      // uniforms fresh) — without this re-sync every full-table 'anywhere'
      // drag move stranded the contact shadow at the pick-up spot (dark
      // patch on the cloth) until the next game-path sync (owner bug,
      // 2026-07-23 build3). Same sanctioned seam as pgPlaceBall below.
      game.syncShadows?.();
      return true;
    })();
    if (ok) hud.setHint(''); // a placed ball resolves a placement hint early
    // GH-382 (snooker-v2): a committed placement changes what the cue
    // touches — refresh the Sec3 R8 chip fact (the FREE BALL call stays
    // pinned: the referee called it before placement, R17(a))
    if (ok && snookerV2Active() && !playgroundActive()) {
      refreshSnookerAddressFacts();
    }
    // one-pocket 12.3 (review r3 P2): the pending break-pocket prompt's
    // DEFAULT keys off the live cue side — a drag across the table centre
    // flips it with no state transition, so re-drive the prompt when the
    // committed placement changed the derived default (latched: per-move
    // drags never thrash the DOM while the side is unchanged).
    if (ok && onePocketActive() && pendingDecision()?.kind === 'break_pocket'
      && !replayLocked() && defaultBreakPocket() !== lastBreakPocketDef) {
      driveBreakPocketPrompt();
    }
    return ok;
  };

  // ---- nomination enforcement: wrap game.shoot so BOTH the HUD button and
  // the scripted __test.shoot path are gated (adapter contract,
  // ruleset-api.md: the stroke is refused until a call/safety is recorded
  // on every non-break 8-ball shot; a pending rulebook option locks
  // shooting until resolved). Shared replays bypass — their recorded calls
  // ride the share codec (T025) and re-apply programmatically.
  const coreShoot = game.shoot;
  let armedCall = null; // nomination snapshot for the IN-FLIGHT shot: the
                        // call is consumed at STROKE time, not settle — the
                        // aim affordance clears its own composed call on
                        // PLAYBACK (pushing setCall(null) through the seam
                        // below), which must not erase a fired nomination
  // GH-463 review r7: rejections that name the user's GESTURE record their
  // KEY here so the transient hint can re-resolve if the input register
  // (or locale) flips during its life; register-neutral rejections leave
  // it null and keep their resolved string.
  let rejectHintKey = null;
  game.shoot = (params) => {
    rejectHintKey = null;
    // issue #68 playground: every nomination/decision gate below is a RULES
    // gate — the sandbox suppresses judgment, so the stroke fires freely
    // (the kernel's own shot validation still applies inside coreShoot).
    if (!replayLocked() && playgroundActive()) {
      match.pendingCall = null;
      armedCall = null;
      return coreShoot(params);
    }
    if (!replayLocked() && eightActive() && match.state) {
      if (match.state.pendingDecision) return t('flow.decisionBlocksShot');
      // feature 022: the call REQUIREMENT is config-keyed (R5 axis 1) —
      // v1 has no variant block and stays 'full'; under 'eight_only'/
      // 'none' (APA slop) the stroke never blocks on a missing call
      // (marking the 8's pocket still rides the same optional input)
      const regime = match.state.variant?.config?.call_shot ?? 'full';
      if (regime === 'full'
        && match.state.phase !== 'break' && match.pendingCall === null) {
        return t('flow.callRequired');
      }
      if (match.state.phase === 'break') match.pendingCall = null; // 4.3(a)
    }
    // one-pocket (012 US1): the pending pocket assignment (WPA 12.3) —
    // or a stale decision of any kind — locks the stroke until resolved
    if (!replayLocked() && onePocketActive() && match.state?.pendingDecision) {
      return t('flow.decisionBlocksShot');
    }
    // ---- snooker (US2) nomination gate (WPBSA Sec3 R3(h), rulesets-012 §4):
    // a colour shot MUST carry {kind:'nominate', ball} — the striker's
    // choice after a red; auto-armed to the FORCED ball on in the final
    // phases (ascending colour / re-spotted black), so the wire stays
    // uniform (calls-axis kind 3) without an extra user step there.
    if (!replayLocked() && snookerActive() && match.state) {
      if (match.state.pendingDecision) return t('flow.decisionBlocksShot');
      const ph = match.state.phase;
      if (ph === 'colour_after_red' && match.pendingCall?.kind !== 'nominate') {
        // GH-463: gesture-naming hint — speak the active input register
        // (i18nNs.tp is feature-detected: a stale i18n.js degrades to t())
        rejectHintKey = 'snooker.nominateRequired';
        return (i18nNs.tp ?? t)('snooker.nominateRequired');
      }
      if (ph === 'final_colours' || ph === 'respotted_black') {
        // GH-382: an armed free-ball nomination (Sec3 R12) is the
        // striker's declared ball on — never clobbered by the auto-arm
        if (match.pendingCall?.freeBall !== true) {
          const colours = (match.state.onTable ?? [])
            .filter((id) => id >= SNOOKER_COLOUR_MIN
              && id <= SNOOKER_COLOUR_MAX);
          const on = ph === 'respotted_black' ? 21 : Math.min(...colours);
          match.pendingCall = { kind: 'nominate', ball: on };
        }
      }
      // red shots carry no call — except an armed free-ball nomination
      if (ph === 'reds' && match.pendingCall?.freeBall !== true) {
        match.pendingCall = null;
      }
    }
    // feature 012 US3 (carom): the break-spot option (UMB Art 23.1(c)) must
    // be resolved before the opening stroke. Replays bypass — their break
    // placement rides the placements axis and caromPreJudge adopts it.
    if (!replayLocked() && caromActive() && match.state?.pendingDecision) {
      return t('flow.decisionBlocksShot');
    }
    // feature 025 (14.1): the FULL call regime (WPA 7.5 via 1.7) — every
    // non-break stroke carries a ball+pocket call or a declared safety;
    // the opening break MAY carry one (7.3(b)), so an armed break call is
    // never cleared here (unlike the 8-ball 4.3(a) path above). A pending
    // break_violation option locks the stroke until resolved.
    if (!replayLocked() && fourteenoneActive() && match.state) {
      if (match.state.pendingDecision) return t('flow.decisionBlocksShot');
      if (match.state.phase !== 'break' && match.pendingCall === null) {
        return t('flow.callRequired');
      }
    }
    // feature 026 (10-ball): the FULL call regime (WPA 6.5 via 1.7) —
    // every non-break stroke carries a ball+pocket call, the declared
    // no-call stance, or (in the 6.4 window) the declared push out; the
    // break carries NO call (6.5: "each shot except the break"), so any
    // leftover armed stance is cleared like the 8-ball 4.3(a) path. A
    // pending pushout_response / wrongful_pot option locks the stroke.
    if (!replayLocked() && tenballActive() && match.state) {
      if (match.state.pendingDecision) return t('flow.decisionBlocksShot');
      if (match.state.phase === 'break') match.pendingCall = null;
      // GH-439: 10-ball has no safety CALL (WPA 6.5) — the surface's
      // affordance is labeled "No call" (call.noCall, the declared
      // no-call stance), so the refusal hint must name THAT control, not
      // the "declare a safety" grammar of the 8-ball/14.1 regimes. A
      // stale cached dictionary predating the key degrades to the legacy
      // localized copy (review r2 P2 class — the GH-313 hasLocal register;
      // an ancient i18n.js without hasLocal degrades the same way).
      else if (match.pendingCall === null) {
        return i18nNs.hasLocal?.('flow.callRequiredNoCall') === true
          ? t('flow.callRequiredNoCall') : t('flow.callRequired');
      }
    }
    // GH-491 (heyball): NO call shot exists, ever (WPA Heyball II.11) —
    // the judge accepts only the null call, so any leftover armed call is
    // cleared unconditionally (the 8-ball 4.3(a) break-clear, every
    // stroke); a pending II.6 break option locks the stroke until resolved.
    if (!replayLocked() && heyballActive() && match.state) {
      if (match.state.pendingDecision) return t('flow.decisionBlocksShot');
      match.pendingCall = null;
    }
    // snapshot BEFORE the stroke: coreShoot transitions to PLAYBACK
    // synchronously, and the aim affordance's PLAYBACK reset pushes
    // setCall(null) through the seam during that transition — the armed
    // nomination must already be consumed by then
    const staged = replayLocked() ? null : match.pendingCall;
    match.pendingCall = null;
    const err = coreShoot(params);
    if (err) { match.pendingCall = staged; return err; } // stroke refused: re-arm
    armedCall = staged;
    // share codec v4 calls axis (share.js recorder seam, feature-detected;
    // annotate() derives shotIndex = the shot now firing). No-op during
    // shared replays — share.js re-logs its DECODED calls instead.
    if (armedCall) ctx.recordAnnotation?.({ ...armedCall });
    return err;
  };

  /** Return ball `id` to the foot spot, occupied-spot fallback along the
   * long string (parametrized respot, WPA 1.11/4.7 — respotBallSpot when
   * the registry module is live; the byte-identical respotNineSpot alias
   * otherwise). The 9 on fouls (9-ball) and the 8 on 4.3(e)/(f)/(g)
   * resolutions (8-ball) both route through here. */
  function respotBall(id) {
    const spotFn = rules?.respotBallSpot ?? respotNineSpot;
    const spot = spotFn(table(), ballR(), obstacles(id));
    if (!spot) return; // entire long string blocked — leave it down (v1)
    const ball = game.ballSet.balls.find((b) => b.id === id);
    if (!ball) return;
    ball.pocketed = false;
    ball.mesh.visible = true;
    ball.mesh.scale.setScalar(1);
    ball.sinkT = -1;
    kPosToThree(ball.mesh.position, spot.x, spot.y, ballR());
    // issue GH-144 (the GH-143 defect family): sync HERE, at the mesh write —
    // the old "the following respotCue() re-syncs" assumption only held on
    // foul routes. Five reachable lanes respot with NO respotCue (8-ball
    // spot-the-8 without a scratch, 14.1 break_violation accept-table,
    // registry judgments with respots but ballInHand 'none', AIM-routed
    // replay respots, the snooker degraded fallback) and left the revived
    // ball on the pocketed shadow sentinel through the whole aiming phase.
    game.syncShadows?.();
  }

  /** WPA 1.6 ¶2 (GH-371): spot the object ball nearest the head string
   * (max y among on-table balls strictly behind the line; the
   * measure-zero tie resolves to the LOWEST id — recorded convention)
   * through the standard foot-spot walk (respotBallSpot). Deterministic
   * from the live table — replays re-derive the same ball and landing. */
  function spotNearestKitchenBall() {
    const hs = -table().length / 4;
    const behind = game.activeBalls()
      .filter((b) => b.id !== 0)
      .map((b) => ({ id: b.id, y: threePosToK(b.mesh.position).y }))
      .filter((b) => b.y < hs)
      .sort((a, b) => (b.y - a.y) || (a.id - b.id));
    if (behind.length === 0) return false;
    respotBall(behind[0].id);
    const b = game.ballSet.balls.find((x) => x.id === behind[0].id);
    if (b) {
      const k = threePosToK(b.mesh.position);
      pendingRulePlacements.push({ ball: behind[0].id, x: k.x, y: k.y });
    }
    return true;
  }

  /** GH-371 precondition (WPA 1.6 ¶2): kitchen ball-in-hand with EVERY
   * on-table object ball also strictly behind the head string (a ball
   * resting ON the string is playable and defeats the trigger). The
   * relief is modeled for the disciplines where 1.6 reaches the judged
   * fold: one-pocket (12.8) and 14.1/century (7.9); the 8-ball variant
   * stays deferred (eightball-v2 allocates no new decision ids by
   * contract, and its trigger is physically near-unreachable — GH-371
   * closing note). */
  function spotNearestAvailable() {
    if (!(onePocketActive() || fourteenoneActive())) return false;
    if (placementRight !== 'kitchen') return false;
    const hs = -table().length / 4;
    const objects = game.activeBalls().filter((b) => b.id !== 0);
    return objects.length > 0
      && objects.every((b) => threePosToK(b.mesh.position).y < hs);
  }

  /** GH-371: drive the conditional rules-action button (hud #hud-action)
   * — the optional recorded requests. Re-evaluated on every state
   * presentation (and locale switch via renderText); self-clears when
   * the precondition dies; never shown in the sandbox or during a
   * locked replay (replays re-derive the recorded decisions instead). */
  function driveRulesAction() {
    if (!hud.setRulesAction) return; // pre-371 hud (cache-poison law)
    if (playgroundActive() || replayLocked()) {
      hud.setRulesAction(null);
      return;
    }
    if (machine.is('BALL_IN_HAND') && spotNearestAvailable()) {
      hud.setRulesAction({
        label: t('rules.spotNearest'),
        onAct: () => applyRulebookDecision('spot_nearest', 1),
      });
      return;
    }
    if (machine.is('AIM') && caromActive() && !pendingDecision()
      && caromFrozenSet().length > 0) {
      hud.setRulesAction({
        label: t('rules.respotFrozen'),
        onAct: () => applyRulebookDecision('contact_respot', 1),
      });
      return;
    }
    hud.setRulesAction(null);
  }

  /** Snooker colour respot (feature 012 US2, WPBSA Sec3 R7): route the
   * judgment's colour ids through the PURE snookerRespotPlan — own spot →
   * highest-VALUE vacant spot → nearest point between the OWN spot and
   * the top cushion (issue #90 erratum, rulesets-012.md Amendment A2),
   * highest colour first, prior placements becoming obstacles.
   * Placements are DERIVED, never recorded (research.md R6). Degraded
   * fallback (leaf modules absent) = the foot-spot geometry. Emits the
   * respotApplied hook with the applied plan. */
  function respotSnookerColours(ids) {
    if (!snookerGeo) { for (const id of ids) respotBall(id); return; }
    // review r36 P2: the SAME sanitized snapshot the address preview
    // examines (game.kernelPlacements) feeds the applied plan — split
    // sources could pick different spot-occupancy fallbacks and the
    // pre-election FREE BALL ruling would preview a colour placement
    // the application never makes. Feature-detected like the preview.
    const pts = typeof game.kernelPlacements === 'function'
      ? game.kernelPlacements() : null;
    const obstacles = (pts
      ?? game.activeBalls().map((b) => {
        const k = threePosToK(b.mesh.position);
        return { id: b.id, x: k.x, y: k.y };
      }))
      .filter((b) => !ids.includes(b.id))
      .map((b) => ({ x: b.x, y: b.y }));
    const plan = snookerGeo.plan(snookerGeo.layout, obstacles, [...ids]);
    for (const { ball: id, xy } of plan) {
      const ball = game.ballSet.balls.find((b) => b.id === id);
      if (!ball) continue;
      ball.pocketed = false;
      ball.mesh.visible = true;
      ball.mesh.scale.setScalar(1);
      ball.sinkT = -1;
      kPosToThree(ball.mesh.position, xy.x, xy.y, ballR());
    }
    game.syncShadows?.(); // analytic shadows track the moved meshes
    emitHook('respotApplied', {
      plan: plan.map((p) => ({ ball: p.ball, x: p.xy.x, y: p.xy.y })),
    });
  }

  /** GH-382 (snooker-v2): the crate's address examination over the LIVE
   * table (post-respot, post-placement — the settled truth only the
   * adapter owns, research.md R6). `inHand` evaluates the Sec2 R17(a)
   * from-the-D arm (cue: null). `pinFreeBall` re-pins the referee's
   * FREE BALL call for the incoming turn (Sec3 R12 — called when the
   * player takes the table; held through placement/aiming). */
  function refreshSnookerAddressFacts({ inHand = false,
    pinFreeBall = false, respotIds = null } = {}) {
    // a pinning call examines a NEW address (turn start / decision
    // resolution) — the referee calls TOUCHING BALL afresh even when the
    // same balls touch (a replace restores the identical position); only
    // placement nudges within one address deduplicate (review r4 P2)
    if (pinFreeBall) touchingAnnounced = '';
    if (!snookerV2Active()
      || !rulesBackend?.wasm?.rules_snooker_address_facts_json) {
      addressFacts = null;
      freeBallCall = false;
      return;
    }
    const s = match.state;
    if (!s || s.phase === 'over' || s.result) {
      addressFacts = null;
      freeBallCall = false;
      return;
    }
    try {
      // review r35 P2: the referee examines the SAME sanitized placement
      // snapshot the shot will serialize (game.kernelPlacements — the
      // 2r+1e-9 contact-chain relaxation shared by game.shoot and the
      // aim preview). Raw mesh reads can differ from record.initial by
      // the relaxation's microns and mint a touching call the judge
      // will refute (a clean play-away judged no-contact — the address
      // facts must derive from the bytes the judge will see).
      // Feature-detected: a stale game.js without the accessor falls
      // back to mesh reads (the pre-fix bytes; cache-poison degrade).
      const pts = typeof game.kernelPlacements === 'function'
        ? game.kernelPlacements() : null;
      const cue = game.cueBall();
      const cueK = (inHand || !cue || cue.pocketed)
        ? null
        : (() => {
          const p0 = pts?.find((p) => p.id === 0);
          if (p0) return { x: p0.x, y: p0.y };
          const k = threePosToK(cue.mesh.position);
          return { x: k.x, y: k.y };
        })();
      const balls = pts
        ? pts.filter((p) => p.id > 0)
          .map((p) => ({ id: p.id, x: p.x, y: p.y }))
        : game.activeBalls()
          .filter((b) => b.id > 0)
          .map((b) => {
            const k = threePosToK(b.mesh.position);
            return { id: b.id, x: k.x, y: k.y };
          });
      // review r23: a pre-prompt examination overlays the PLANNED respot
      // placements (the judgment parked before respots applied; the
      // referee's FREE BALL call must precede the play-again election —
      // Sec3 R12/R13) — the same pure plan the resolution will apply
      const pending = (respotIds ?? []).filter((id) =>
        !balls.some((b) => b.id === id));
      if (pending.length && snookerGeo) {
        // the CUE is a plan obstacle exactly like the applied
        // respotSnookerColours pass (review r24: omitting it could
        // overlay a colour onto the cue and miscall the examination)
        const obstacles = balls.map((b) => ({ x: b.x, y: b.y }));
        if (cueK) obstacles.push({ x: cueK.x, y: cueK.y });
        const plan = snookerGeo.plan(snookerGeo.layout, obstacles,
          [...pending].sort((a, b) => b - a));
        for (const { ball: id, xy } of plan) {
          balls.push({ id, x: xy.x, y: xy.y });
        }
      }
      const baulkY = snookerGeo?.layout.baulkY
        ?? (-table().length / 2 + 0.737);
      addressFacts = JSON.parse(rulesBackend.unwrap(
        rulesBackend.wasm.rules_snooker_address_facts_json(
          JSON.stringify(s),
          JSON.stringify({ r: ballR(), baulkY, cue: cueK, balls }))));
      if (addressFacts.touching.length) {
        emitHook('touchingBall', { balls: [...addressFacts.touching] });
        const sig = addressFacts.touching.join(',');
        if (sig !== touchingAnnounced) {
          touchingAnnounced = sig;
          // the referee's spoken TOUCHING BALL call, once per address —
          // the phone band's GH-316 squeeze ladder may drop the chip,
          // so the truth also rides the transient hint channel (the
          // ladder's own warn-badge premise)
          const balls = [...new Set(addressFacts.touching.map((id) => (
            id >= SNOOKER_COLOUR_MIN
              ? t('snooker.ball.' + id) : t('snooker.ball.red'))))]
            .join(', ');
          hud.setHint(t('snooker.touching', { balls }));
        }
      } else {
        touchingAnnounced = '';
      }
      if (pinFreeBall) {
        freeBallCall = !!(s.freeBallEligible && addressFacts.snookered);
        if (freeBallCall) {
          emitHook('freeBall', { player });
          // FREE BALL wins the hint channel when both calls land at once
          // (GH-463: gesture-naming copy rides the register-aware tp seam;
          // review r7 — the re-resolver keeps a LIVE hint on the register)
          const freeBallHint = () => (i18nNs.tp ?? t)('snooker.freeBall');
          hud.setHint(freeBallHint(), freeBallHint);
        }
      }
    } catch (e) {
      addressFacts = null;
      freeBallCall = false;
      reportError('snooker address facts: ' + (e?.message ?? e));
    }
  }

  /** GH-382 decision 17 choice 3 (WPBSA Sec3 R14(b)): replace every ball
   * to the ORIGINAL position — the judged stroke's recorded address —
   * bit-exactly (the applyReplayPlacement anatomy: exact mesh writes, no
   * clamp/snap; the snapshot IS the kernel's own input bytes). Balls
   * absent from the snapshot were already off the table at address and
   * stay down. */
  function restoreMissSnapshot(silent) {
    if (!missSnapshot) return false;
    for (const p of missSnapshot) {
      const b = game.ballSet.balls.find((x) => x.id === p.id);
      if (!b) continue;
      b.pocketed = false;
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.sinkT = -1;
      kPosToThree(b.mesh.position, p.x, p.y, ballR());
    }
    game.syncShadows?.();
    if (!silent) {
      emitHook('missReplaced', { balls: missSnapshot.map((p) => p.id) });
    }
    return true;
  }

  /** Seat the cue in hand within the D (WPBSA Sec3 R5): revive it, then
   * place at the kernel's default D address, nudging along the baulk line
   * when occupied — the wrapped placeCue routes through the game.js D
   * clamp while `placementRight === 'd_zone'`.
   *
   * Exhaustion hardening (GH-370 class 2 — the confirmed seatCueInD-
   * exhaustion finding): the old five-baulk-line candidate list could
   * exhaust with balls scattered into baulk, silently leaving the
   * strokeable cue where respotCue parked it — the pool head spot,
   * OUTSIDE the D (an improper in-hand address, Sec3 R5/R11(a)(v)). The
   * ladder now falls through to a deterministic interior sweep of the D
   * (rings × angles, strictly inside the 0.292 semicircle); with the
   * placeCueInD snap-to-contact law (class 3) every candidate also
   * resolves around single blockers, so a full exhaustion needs the
   * entire D packed — practically impossible with 22 balls. If it ever
   * happens the residual is the pre-370 behavior, surfaced loudly. */
  function seatCueInD() {
    game.respotCue(); // revive first (kitchen geometry), then snap into the D
    const baulkY = snookerGeo?.layout.baulkY ?? (-table().length / 2 + 0.737);
    for (const x of [0.146, -0.146, 0, 0.219, -0.219]) {
      if (game.placeCue(x, baulkY)) return;
    }
    for (const rad of [0.22, 0.15, 0.08]) { // interior rings, centre-out
      for (const deg of [90, 60, 120, 30, 150, 75, 105, 45, 135]) {
        const a = (deg * Math.PI) / 180; // below the line: y = baulkY − sin
        if (game.placeCue(rad * Math.cos(a), baulkY - rad * Math.sin(a))) {
          return;
        }
      }
    }
    console.warn('[flow] seatCueInD exhausted — D fully packed; cue left '
      + 'at the revive spot (drag to place legally)');
  }

  /** Snooker ball-on presentation label (HUD aim hint). */
  function snookerBallOnLabel() {
    // GH-382 (review r3): an armed free-ball nomination IS the ball on
    // for the stroke (Sec3 R12(a)(ii)) — name it, not the underlying set
    if (match.pendingCall?.kind === 'nominate'
      && match.pendingCall.freeBall === true) {
      return t('snooker.ball.' + match.pendingCall.ball);
    }
    const on = match.state?.ballOn;
    if (on === 'red') return t('snooker.ball.red');
    if (on === 'nominated_colour') {
      const nom = match.pendingCall?.kind === 'nominate'
        ? match.pendingCall.ball : null;
      return nom ? t('snooker.ball.' + nom) : t('snooker.ball.colour');
    }
    return typeof on === 'number' ? t('snooker.ball.' + on) : '—';
  }

  /** Map the shared Judgment back onto the legacy NineBallJudgment shape:
   * window.__rules.judgment() is a pinned e2e wire for 9-ball
   * (e2e-rules.mjs / e2e-combined.mjs assert fouls as bare code strings). */
  const toLegacyJudgment = (j) => ({
    legal: j.legal,
    fouls: j.fouls.map((f) => f.code),
    pocketed: [...j.pocketed],
    nineBallPocketed: j.pocketed.includes(9),
    ballInHand: j.ballInHand !== 'none',
    respotNine: j.respot.includes(9),
    gameOver: j.terminal !== null,
    nextLowest: j.next?.onTable?.length ? Math.min(...j.next.onTable) : null,
  });

  // ---- adjudication: game.js emits shotComplete right after SETTLED
  machine.on('shotComplete', (record, outcome) => {
    if (record === lastRecord) { routeReplay(); return; }
    lastRecord = record;
    // codec v6 (issue #68 follow-up): a shared replay of a PLAYGROUND
    // session suppresses judgment exactly like the SENDER's session did —
    // the decoded sender-mode flag rides ctx.replaySenderMode (share.js
    // seam, feature-detected: a pre-v6 share.js has no seam and every
    // pre-v6 link decodes 'play', so judged replays re-judge as before).
    if (replayLocked() && ctx.replaySenderMode?.() === 'playground') {
      armedCall = null;
      settlePlayground(outcome);
      return;
    }
    // issue #68 playground: judgment SUPPRESSED — no adjudication runs at
    // all (never during a shared replay: the replay lane re-judges the
    // SENDER's match — or suppresses it per the SENDER's mode above —
    // regardless of the viewer's persisted mode).
    if (playgroundActive() && !replayLocked()) {
      armedCall = null;
      settlePlayground(outcome);
      return;
    }
    // the nomination was consumed at stroke time (armedCall); a SHARED
    // replay instead judges with the SENDER's recorded call for this shot
    // (share.js seam — this listener runs before share.js advances replay.i,
    // main.js registers flow before share)
    let call = armedCall;
    armedCall = null;
    if (replayLocked()) {
      const i = ctx.replayShotIndex?.() ?? -1;
      call = i >= 0 ? (ctx.replayCallFor?.(i) ?? null) : null;
    }
    if (rulesRefused) {
      // the refused fold's error banner already stands — never judge
      // this recording under a different rulebook (review r7 P1)
      lastRouting = { state: 'AIM', info: { ...outcome, player } };
      machine.to('AIM', lastRouting.info);
    } else if (!match.ruleset && ctx.replayActive?.()
      && ctx.replayVariantId?.() === 'wpbsa-snooker-full') {
      // review r18 P1: a v2 replay whose fold has not landed (the
      // registry import race) must NEVER fall through to the legacy
      // 9-ball judge — fail this settle closed; the rulesReady
      // catch-up refolds and the next shot judges properly
      reportError('replay adjudication raced the rules registry — '
        + 'the shot was not judged (cold load); reload to replay');
      lastRouting = { state: 'AIM', info: { ...outcome, player } };
      machine.to('AIM', lastRouting.info);
    } else if (!match.ruleset && game.gameId === 'heyball') {
      // GH-491 review r5 P1 (the r18 law, LIVE-fold leg): a heyball
      // stroke that settles before the rules chain lands must never
      // fall to the legacy 9-ball judge — heyball has no compatible
      // fallback rulebook. Fail closed: the shot stays unjudged and
      // the rack stands refused (the settle catch-up cannot honestly
      // refold mid-rack — the balls have physically moved past the
      // fold's initial state; a re-rack refolds cleanly).
      reportError('heyball adjudication raced the rules registry — '
        + 'the shot was not judged (cold load); re-racking');
      rulesRefused = true;
      lastRouting = { state: 'AIM', info: { ...outcome, player } };
      machine.to('AIM', lastRouting.info);
      // review r9 P2 (quarantine): when the chain reads LIVE by now the
      // race is over — recover with a same-seed re-rack automatically
      // (the variant-degrade precedent; the eaten stroke is announced
      // above and the fresh fold judges honestly). A genuinely stale
      // chain keeps the standing banner instead: every selection
      // surface is already gated, the refused fold never judges, and
      // Copy Link refuses through ctx.rulesSessionRefused.
      if (ctx.rulesCapabilities?.heyballChain?.() === true) {
        Promise.resolve().then(() => {
          if (rulesRefused && game.gameId === 'heyball') {
            game.rerack(game.seed);
          }
        });
      }
    } else if (rules && match.ruleset) adjudicate(record, outcome, call);
    else adjudicateLegacy(record, outcome);
  });

  /** Registry adjudication (feature 011): judge one settled shot through
   * the active game's Ruleset and apply the judgment's stated rights and
   * consequences (turn, respot, placement, decisions, terminal). */
  function adjudicate(record, outcome, call) {
    // GH-382 (review r6 P2): the settled record IS the new table truth —
    // supersede the applied choice-3 replacement BEFORE the judge can
    // throw (a stale flag would let a later Replay rewind the table to
    // the obsolete snapshot)
    missReplaced = false;
    // GH-371: the settled shot's record captured any pending
    // rule-request placements — they are no longer replay-fragile
    pendingRulePlacements = [];
    const rs = match.ruleset;
    const isNine = rs.id === 'nineball-v1';
    // GH-491: heyball judges with the NULL call exactly like the 9-ball
    // convention (WPA Heyball II.11 — the crate REFUSES any call object);
    // the shoot gate already clears armed calls, this is the replay-side
    // belt (a decoded foreign call must never reach the heyball judge).
    const noCall = isNine || rs.id === 'heyball-v1';
    if (caromActive()) caromPreJudge(record); // 012 US3: defaultable break spot
    // one-pocket (012 US1, T053 integration): a PRE-SHOT option (WPA 12.3
    // break_pocket) is resolved BEFORE its shot fires, but the v4 calls
    // axis cannot express "before shot 0" — the recorder binds it to
    // shotIndex k and share.js re-applies it only AFTER shot k settles.
    // Judging with the option still pending would silently skip the shot
    // (adapter contract), so resolve the SENDER's recorded choice here,
    // before the judge, and mark it consumed for ctx.applyReplayDecision
    // (mirror of caromPreJudge's defaultable break spot).
    if (replayLocked() && onePocketActive() && match.state?.pendingDecision) {
      const i = ctx.replayShotIndex?.() ?? -1;
      for (const d of (i >= 0 ? (ctx.replayDecisionsFor?.(i) ?? []) : [])) {
        const pend = match.state?.pendingDecision;
        if (!pend) break;
        if (DECISION_KIND_BY_ID[d.decision] !== pend.kind) continue;
        if (applyRulebookDecision(pend.kind, d.choice)) {
          consumedReplayDecisions.add(`${i}|${d.decision}|${d.choice}`);
        }
      }
    }
    let j;
    try {
      // TEST SEAM trip wire (__rules.failNextJudge, e2e-bugreport): an
      // armed one-shot fault dies HERE so the genuine catch below runs —
      // the gate on the #44-class judgeError ledger row drives this
      if (judgeFaultMsg !== null) {
        const m = judgeFaultMsg;
        judgeFaultMsg = null;
        throw new Error(m);
      }
      // 9-ball keeps the per-record state seam (prior onTable = the
      // record's initial snapshot) — scripted layout() scenes stay exact
      const prior = isNine
        ? rules.nineballStateFromRecord(record, player) : match.state;
      j = rs.judge(prior, record, noCall ? null : call);
    } catch (e) {
      // RulesError is an adapter/programming error, never a game outcome —
      // surface it loudly and keep the table playable
      reportError('rules judge: ' + (e?.message ?? e));
      // bundle v2: the ledger records exactly where adjudication died
      // (the historical #44 swallow point — a bundle from a judge-broken
      // session carries this row where the verdict would have been)
      pushJudgment({
        rack: rackOrdinal, seed: game.seed, shot: game.shotIndex - 1,
        judgeError: String(e),
      });
      lastRouting = { state: 'AIM', info: { ...outcome, player } };
      machine.to('AIM', lastRouting.info);
      return;
    }
    const hadGroups = !isNine && match.state.groups !== null;
    const prevOwed1p = onePocketActive() && match.state.owed
      ? { ...match.state.owed } : null; // 012 US1: owedBallChanged wire
    const priorBallOn = snookerActive() ? match.state.ballOn : null; // US2 hook
    const priorInnings = caromActive() ? match.state.innings : null; // GH-1050
    match.state = j.next;
    match.judgment = j;
    if (!noCall && call !== null) {
      match.log.push({ shot: game.shotIndex - 1, ...call });
    }
    lastJudgment = isNine ? toLegacyJudgment(j) : j;
    // bundle v2 ledger row: the contract Judgment fields as adjudicated,
    // with {rack, seed, shot} + shooter context (player has not switched
    // yet here; rack disambiguates same-seed re-racks)
    pushJudgment({
      rack: rackOrdinal,
      seed: game.seed,
      shot: game.shotIndex - 1,
      game: game.gameId ?? 'nine_ball',
      ruleset: rs.id,
      shooter: player,
      legal: j.legal,
      fouls: j.fouls.map((f) => (typeof f === 'string' ? f : f.code)),
      pocketed: [...j.pocketed],
      ballInHand: j.ballInHand,
      respot: [...j.respot],
      turn: j.turn,
      ...ledgerScoreOf(j.next),
      terminal: j.terminal ? { ...j.terminal } : null,
    });
    const info = { ...outcome, judgment: lastJudgment, player };

    // issue #37: an 8-ball LEGAL pot that still passes the turn means the
    // recorded call went unfulfilled (WPA 4.6 via 1.7 — different ball or
    // wrong pocket). Attach the explanation so the AIM presentation can
    // banner it — without it the pass is invisible on screen and reads as
    // a spurious side switch (the owner's "group flipped after my pot").
    if (eightActive() && j.legal && j.terminal === null
      && j.decisionRequired === null && call?.kind === 'call'
      && j.pocketed.length > 0 && j.next.shooter !== player) {
      info.callUnfulfilled = { ball: call.ball, pocket: call.pocket };
    }

    if (!isNine && !hadGroups && j.next.groups !== null) {
      emitHook('groupsAssigned', { groups: { ...j.next.groups } }); // WPA 4.4
    }
    // one-pocket (012 US1): owed-ball ledger changes ride the hook wire
    // (foul debts accrued, debts repaid by scored balls — WPA 12.5/12.6)
    if (prevOwed1p && (prevOwed1p[1] !== j.next.owed[1]
      || prevOwed1p[2] !== j.next.owed[2])) {
      emitHook('owedBallChanged', { owed: { ...j.next.owed } });
    }
    if (snookerActive() && j.next.ballOn !== priorBallOn) {
      emitHook('ballOnChanged', { ballOn: j.next.ballOn }); // US2 (FR-008)
    }
    if (caromActive()) caromPresentJudgment(j); // 012 US3 hooks + hints
    // GH-680: a sandbox drill (live or parked) owns adjudication — the
    // ledger row above stays honest, every consequence below is skipped
    // (see settleUnderDrill). A variant fold (id != 'nineball-v1') would
    // otherwise judge the NEXT shot from j.next (isNine re-derives prior
    // per record), so a terminal there resets to a fresh fold — the
    // pre-680 terminal-gate law, kept verbatim.
    if (drillSandboxActive()) {
      if (j.terminal !== null && !isNine) resetMatch({ layout: true });
      settleUnderDrill(info,
        j.fouls.map((f) => (typeof f === 'string' ? f : f.code)),
        j.terminal ? { winner: j.terminal.winner, reason: j.terminal.reason,
          cite: j.terminal.cite } : null);
      return;
    }
    if (j.fouls.length > 0) {
      // hook payload keeps the SDK's English FOUL_LABELS (stable console/
      // e2e wire; unknown 8-ball codes fall back to the code itself); the
      // HUD translates codes + cites at presentation (foulReason)
      const reason = j.fouls.map((f) => FOUL_LABELS[f.code] ?? f.code).join(', ');
      emitHook('foulCalled', {
        player,
        fouls: isNine ? j.fouls.map((f) => f.code) : j.fouls.map((f) => ({ ...f })),
        reason,
      });
      info.reason = reason;
    }
    if (j.terminal !== null) {
      // issue GH-138 / GH-680: the sandbox-drill suppression (terminal
      // AND every other consequence) happened above — this branch is the
      // real match's alone.
      lastTerminal = { ...j.terminal };
      // GH-1050 (UMB Art 29): the carom result quotes the innings PLAYED,
      // and the kernel's `innings` is "completed innings of player 1"
      // (data-model.md CaromMatchState — completed turn PAIRS, read by no
      // rule). A terminal visit that closed no pair (the breaker's own
      // finish; every v1 finish) is an inning played but not completed, so
      // the result adds it. Read from the judge's own output (the count
      // did not move on the terminal stroke), never re-derived here.
      if (priorInnings !== null && Number.isFinite(j.next.innings)) {
        lastTerminal.innings = j.next.innings
          + (j.next.innings === priorInnings ? 1 : 0);
      }
      // GH-383 review r8: the DRAW sentinel (winner 0) is not a seat — it
      // must never ride gameWon.player (the ruleset-api amendment's
      // adapter law). The draw gets its own hook; every won match keeps
      // the frozen gameWon shape byte-identically.
      if (j.terminal.winner === 0) {
        emitHook('matchDrawn', {
          reason: j.terminal.reason, cite: j.terminal.cite,
          points: { ...j.next.points },
        });
      } else {
        emitHook('gameWon', {
          player: j.terminal.winner, pocketed: j.pocketed,
          reason: j.terminal.reason, cite: j.terminal.cite,
        });
      }
      // 8-ball loss paths (4.8(a)–(d)) hand the rack to the OPPONENT — the
      // WIN presentation and the next rack's breaker follow the winner.
      // GH-383: winner 0 is the carom DRAW sentinel (UMB Art 29.4, the
      // equal-innings regime) — no seat won, the presentation keys off
      // lastTerminal.reason and the next rack keeps the DRAWN rack's
      // breaker (review r1: `player` was still the leveling opponent here,
      // which would have handed the re-rack's break to the wrong seat).
      // GH-491 (WPA Heyball I.12): heyball breaks ALTERNATE between racks
      // — the next rack's breaker is the seat that did NOT break the
      // decided rack, whoever won (a SAME-discipline rack law: the GH-460
      // discipline-switch reseed never fires on the WIN auto re-rack, so
      // this seat carries into resetMatch's initialState fold). The WIN
      // banner names lastTerminal.winner, never this seat (renderText's
      // heyball arm), so presentation and rack liturgy stay independent.
      // GH-716 (WPBSA Sec3 R3(b)): snooker frames ALTERNATE the break-off
      // — "the player or side to play first must alternate for each frame
      // during a game", whoever won the frame. The snooker match state
      // carries no breaker, so the fold's own seed (frameBreaker, pinned
      // in resetMatch) names the frame's breaker and the next frame goes
      // to the OTHER seat; frame 1 keeps the cold-boot seat. Pool
      // disciplines keep winner-breaks (the WPA default; no option this
      // round), carom / 14.1 are single-game, heyball keeps I.12 above.
      // review r1 P1: the snooker WIN banner formats `player` (renderText's
      // snooker arm, unlike heyball's) — moving the seat here named the
      // LOSER for the whole hold when the breaker won. `player` stays the
      // winner until the fold; the alternation rides nextFrameBreaker and
      // is applied by resetMatch (the next frame's reset), never before.
      if (heyballActive()
        && (j.next?.breaker === 1 || j.next?.breaker === 2)) {
        player = j.next.breaker === 1 ? 2 : 1;
      } else if (j.terminal.winner !== 0) player = j.terminal.winner;
      else player = j.next?.breaker ?? player;
      if (snookerActive() && (frameBreaker === 1 || frameBreaker === 2)) {
        nextFrameBreaker = frameBreaker === 1 ? 2 : 1;
      }
      // GH-383 (review landing r2): a terminal stroke can still carry Art
      // 28.1(b) respots — a leveling seat driving a ball off the table
      // ends the match (Art 29.4 non-scoring stroke) with `respot`
      // naming the balls concerned. Apply them BEFORE the WIN routing so
      // the final live table matches what routeReplay restores after a
      // replayed finishing stroke (it re-applies lastJudgment.respot).
      if (caromActive() && j.respot.length) caromApplyRespots(j);
      lastRouting = { state: 'WIN', info };
      machine.to('WIN', info);
      return;
    }
    if (j.decisionRequired !== null) {
      // GH-382 (snooker-v2): a FOUL AND A MISS was called — pin the
      // judged stroke's recorded address as the replacement source
      // (Sec3 R14(b); the record's initial placements are the kernel's
      // own input bytes, bit-exact by construction)
      if (j.decisionRequired.kind === 'foul_and_a_miss') {
        missSnapshot = record.initial.balls.map((b) => ({
          id: b.id, x: b.state.pos.x, y: b.state.pos.y,
        }));
        missReplaced = false; // a new settled stroke IS the table truth
      }
      // the pre-shot address facts are stale against j.next — replace
      // them with the INCOMING examination (planned respots overlaid,
      // in-hand when the foul scratched): the referee's FREE BALL call
      // must be visible BEFORE the play-again election (Sec3 R12/R13 —
      // review r12/r23); the choice's resolution re-pins on the applied
      // table
      addressFacts = null;
      freeBallCall = false;
      refreshSnookerAddressFacts({
        inHand: j.ballInHand === 'd_zone',
        pinFreeBall: true,
        respotIds: j.respot,
      });
      // rulebook option: the seat stays unresolved until the recorded
      // choice (applyDecision assigns it); the machine parks in AIM with
      // shooting locked (wrapped game.shoot) and the HUD prompts the chooser
      emitHook('decisionRequired', {
        kind: j.decisionRequired.kind, chooser: j.decisionRequired.chooser,
      });
      if (j.decisionRequired.kind === 'foul_and_a_miss') driveMissPrompt();
      lastRouting = { state: 'AIM', info };
      machine.to('AIM', info);
      return;
    }
    // feature 022 (eightball-v2, dry_break_consequence 're_break' — APA):
    // the JUDGMENT itself returns to the break phase with a full rack and
    // the same breaker (no decision is born). Re-rack on the SAME seed —
    // the decision-re-rack law of applyRulebookDecision, judged-form. The
    // recorder seam (ctx.armRulesRerack) keeps the share log alive across
    // this decision-less rulebook re-rack; resetMatch on the rack's AIM
    // rebuilds the identical fold (same preset resolution, same breaker),
    // so replays reproduce the sequence bit-for-bit.
    if (rs.id === 'eightball-v2' && j.next.phase === 'break') {
      if (j.next.shooter !== player) switchPlayer();
      ctx.armRulesRerack?.();
      game.rerack(game.seed);
      return;
    }
    // feature 025 (14.1): the JUDGED-FORM full re-rack — WPA 7.11 three
    // consecutive fouls (−15 more, all fifteen re-racked, the OFFENDER
    // re-breaks under opening-break requirements). Same-seed re-rack
    // (the eightball-v2 re_break law) but the match fold CARRIES —
    // scores/counters/target survive, so restore it over the fresh
    // initialState the re-rack installed (the one-pocket 12.10 carry law).
    if (fourteenoneActive() && j.next.phase === 'break') {
      if (j.next.shooter !== player) switchPlayer();
      ctx.armRulesRerack?.();
      game.rerack(game.seed);
      match.state = j.next;
      foldCarried = true; // GH-990: shot 0, the match's progress carried
      match.judgment = j;
      lastJudgment = j;
      if (j.ballInHand === 'kitchen') {
        // 7.3(a): the mandatory re-break addresses from the kitchen
        placementRight = 'kitchen';
        game.respotCue(); // contract: revive the cue BEFORE the state
        lastRouting = { state: 'BALL_IN_HAND', info };
        machine.to('BALL_IN_HAND', info);
      }
      return;
    }
    // feature 025 (14.1): the 14-at-14 PARTIAL re-rack (WPA 7.4/7.8 —
    // `next.phase === "rerack"` + the judged Table 1 plan block). NO
    // game.rerack, no fold reset, no stateChange: the pocketed balls
    // revive IN PLACE onto the active template's lattice slots and the
    // shooter's run simply continues. A judged 'kitchen' cueSpot rides
    // j.ballInHand (the normal BALL_IN_HAND routing below applies it).
    if (fourteenoneActive() && j.next.phase === 'rerack' && j.next.rerack) {
      applyFourteenOneRerack(j.next.rerack);
    }
    if (snookerActive() && j.respot.length) respotSnookerColours(j.respot);
    // 012 US3: carom respots resolve on the UMB designated spots
    // (caromRespotPlan), never the pool foot-spot geometry
    else if (caromActive()) caromApplyRespots(j);
    else for (const id of j.respot) respotBall(id);
    if (j.next.shooter !== player) switchPlayer();
    // GH-383: the incoming carom seat aims/strikes ITS ball (Art
    // 23.2/23.4 two-cue assignment; a no-op under the v1 shared white)
    if (caromActive()) caromSyncCueBall();
    // GH-383 (UMB Art 29.4): the equal-innings leveling inning — the
    // judged phase IS the signal (the eightball-v2 re_break law): reset
    // the three balls to the initial starting position with the LEVELING
    // seat's ball on the start spots and run the fresh-break liturgy
    // (BALL_IN_HAND clamp + the pending break_spot prompt).
    if (caromActive() && j.next.phase === 'leveling_break') {
      caromEnterLevelingBreak();
      return;
    }
    if (j.ballInHand !== 'none') {
      placementRight = j.ballInHand; // 'anywhere' (4.9) vs 'kitchen' (4.3)
      game.respotCue(); // contract: revive the cue BEFORE entering the state
      if (placementRight === 'd_zone') seatCueInD(); // US2: into the D (Sec3 R5)
      // GH-382: the referee's address examination for the incoming turn
      // (in-hand ⇒ the Sec2 R17(a) from-the-D arm pins the FREE BALL call)
      refreshSnookerAddressFacts({ inHand: true, pinFreeBall: true });
      lastRouting = { state: 'BALL_IN_HAND', info };
      machine.to('BALL_IN_HAND', info);
    } else {
      placementRight = 'anywhere';
      refreshSnookerAddressFacts({ pinFreeBall: true }); // GH-382
      lastRouting = { state: 'AIM', info };
      machine.to('AIM', info);
    }
  }

  /** Pre-feature 9-ball adjudication — the stale-cache fallback path
   * (registry module unavailable). Byte-identical behavior to the shipped
   * flow.js before feature 011. */
  function adjudicateLegacy(record, outcome) {
    const judgment = judgeShot({ onTable: deriveOnTable(record) }, record);
    lastJudgment = judgment;
    // bundle v2 ledger row: ALL EIGHT legacy NineBallJudgment fields
    // verbatim (sdk nineball.ts interface order; ballInHand is the legacy
    // boolean; gameOver/respotNine/nineBallPocketed/nextLowest as shipped)
    pushJudgment({
      rack: rackOrdinal,
      seed: game.seed,
      shot: game.shotIndex - 1,
      game: 'nine_ball',
      ruleset: 'legacy',
      shooter: player,
      legal: judgment.legal,
      fouls: [...judgment.fouls],
      pocketed: [...judgment.pocketed],
      nineBallPocketed: judgment.nineBallPocketed,
      ballInHand: judgment.ballInHand,
      respotNine: judgment.respotNine,
      gameOver: judgment.gameOver,
      nextLowest: judgment.nextLowest,
    });
    const info = { ...outcome, judgment, player };
    // issue GH-138 / GH-680: the stale-registry fallback also judges
    // sandbox drills (start() skips setGame when the game is already
    // nine_ball) — the same whole-path suppression as adjudicate(): the
    // ledger row stands, the stroke lands as a plain AIM settle.
    if (drillSandboxActive()) {
      settleUnderDrill(info, [...judgment.fouls],
        judgment.gameOver ? { winner: player, reason: 'gameOver' } : null);
      return;
    }
    if (judgment.gameOver) {
      emitHook('gameWon', { player, pocketed: judgment.pocketed });
      lastRouting = { state: 'WIN', info };
      machine.to('WIN', info);
      return;
    }
    if (judgment.respotNine) respotBall(9);
    // GH-370 (review r1 P2): the legacy fold has no per-judgment placement
    // right — the OPENING grant set placementRight 'kitchen' at the fresh
    // rack, and without this reset every 9-ball foul on the stale-registry
    // fallback stayed kitchen-clamped instead of the WPA 5.7 anywhere.
    placementRight = 'anywhere';
    if (judgment.ballInHand) {
      const reason = judgment.fouls.map((f) => FOUL_LABELS[f]).join(', ');
      emitHook('foulCalled', { player, fouls: judgment.fouls, reason });
      switchPlayer();
      game.respotCue(); // contract: revive the cue BEFORE entering the state
      lastRouting = { state: 'BALL_IN_HAND', info: { ...info, reason } };
      machine.to('BALL_IN_HAND', { ...info, reason });
    } else {
      if (judgment.pocketed.length === 0) switchPlayer(); // legal dry: turn over
      lastRouting = { state: 'AIM', info };
      machine.to('AIM', info);
    }
  }

  /** Resolve a pending rulebook option (or record a stalemate agreement)
   * through the ruleset's pure applyDecision, then apply the adapter-side
   * consequences: seat, re-rack, 8 respot, kitchen ball-in-hand. */
  function applyRulebookDecision(kind, choice) {
    if (!match.ruleset || !match.state) return false;
    if (caromActive()) return applyCaromDecision(kind, choice); // 012 US3
    // GH-371 (review r2 P2): the recorded requests re-validate their
    // adapter-owned precondition HERE, before the crate call and the
    // calls-axis record — the crate state carries no XY, so a crafted
    // replay could otherwise move a ball outside a kitchen ball-in-hand.
    if (kind === 'spot_nearest'
      && !(machine.is('BALL_IN_HAND') && spotNearestAvailable())) {
      return false;
    }
    const id = kind === 'spot_nearest' && fourteenoneActive()
      ? FOURTEENONE_SPOT_NEAREST_ID // GH-371: per-family wire id
      // GH-491: the heyball fold resolves EVERY kind on its own id family
      // (18–23) — 'break_foul'/'stalemate' collide with the eightball
      // kind names but never with its wire ids
      : heyballActive()
        ? HEYBALL_DECISION_IDS[kind]
        : DECISION_IDS[kind] ?? SNOOKER_DECISION_IDS[kind];
    if (id === undefined) return false;
    const prevOnTable = match.state.onTable ?? [];
    const wasPending = pendingDecision();
    let next;
    try {
      next = match.ruleset.applyDecision(match.state, { decision: id, choice });
    } catch (e) {
      reportError('rules decision: ' + (e?.message ?? e));
      return false;
    }
    match.state = next;
    hud.setHint(''); // a resolved decision unblocks the stroke — clear the hint
    match.log.push({
      shot: game.shotIndex - 1, kind: 'decision', decision: id, choice,
    });
    // share codec v4 (share.js recorder seam): a recorded decision may
    // re-rack on the SAME seed — annotate BEFORE the rerack below so the
    // recorder's one-shot rerack flag is armed. No-op during shared replays.
    ctx.recordAnnotation?.({ kind: 'decision', decision: id, choice });
    emitHook('decisionMade', {
      kind, choice, by: wasPending?.chooser ?? 'both',
    });
    // ---- GH-371 recorded request: WPA 1.6 ¶2 nearest-ball spot -------
    // The crate state is unchanged by contract (ids never leave the
    // table); the adapter placement is deterministic from the live
    // table, so the calls-axis record above is all a replay needs.
    // (Unreachable before shot 0: a kitchen grant implies a prior shot,
    // so the post-settle replay application order is always correct.)
    if (kind === 'spot_nearest') {
      spotNearestKitchenBall();
      driveRulesAction(); // the precondition just self-consumed
      return true;
    }
    if (next.shooter !== player) {
      player = next.shooter;
      emitHook('playerChanged', { player });
    }
    // ---- one-pocket resolutions (feature 012 US1, WPA Sec. 12) -----------
    if (onePocketActive()) {
      if (kind === 'break_pocket') {
        // WPA 12.3: both assignments are now fixed — badge the HUD
        emitHook('pocketAssigned', { pockets: { ...next.pockets } });
      }
      if (kind === 'stalemate_lag') {
        // WPA 12.10: full 15 re-rack on the SAME seed; the match fold
        // CARRIES (tallies, owed markers, pocket assignments persist) —
        // restore it over the fresh initialState the re-rack installed
        game.rerack(game.seed);
        match.state = next;
        foldCarried = true; // GH-990: shot 0, the match's progress carried
        return true;
      }
    }
    // ---- 14.1 resolutions (feature 025, WPA 7.3(b)) ----------------------
    if (fourteenoneActive() && kind === 'break_violation') {
      if (next.phase === 'break') {
        // choice 2 — require a re-break: full fifteen on the SAME seed;
        // the fold CARRIES (the −2 stands, the option stays repeatable) —
        // restore it over the fresh initialState (the 12.10 carry law).
        // GH-371: the re-break addresses from IN HAND behind the head
        // string (WPA 7.3(a) — the same address the judged 7.11
        // three-foul path grants at flow.js's judged-form branch; the
        // crate state records it as kitchenBih). Mirror that path:
        // kitchen placement right + BALL_IN_HAND entry.
        game.rerack(game.seed);
        match.state = next;
        foldCarried = true; // GH-990: shot 0, the match's progress carried
        placementRight = 'kitchen';
        game.respotCue(); // contract: revive the cue BEFORE the state
        lastRouting = {
          state: 'BALL_IN_HAND',
          info: { decision: kind, player, judgment: lastJudgment },
        };
        machine.to('BALL_IN_HAND',
          { decision: kind, player, judgment: lastJudgment });
        return true;
      }
      // choice 1 — accept the table: balls pocketed on the breaking
      // stroke spot (7.6; the judgment parked on the decision before any
      // respot applied), then the generic seat/kitchen routing below
      // (a scratched breaking stroke enters play from the kitchen, 3.1)
      const upF1 = (next.onTable ?? []).filter((sid) =>
        game.ballSet.balls.find((b) => b.id === sid)?.pocketed);
      for (const id of upF1) respotBall(id);
    }
    // ---- 10-ball resolutions (feature 026, WPA 6.4/6.6) ------------------
    if (tenballActive()) {
      // the judgment parked on the decision BEFORE any respot applied
      // (the adjudicate() decision return) — return the spotted 10 (6.8:
      // "prior to the next shot") now that the option is resolved
      const up10 = (next.onTable ?? []).filter((sid) =>
        game.ballSet.balls.find((b) => b.id === sid)?.pocketed);
      for (const id of up10) respotBall(id);
    }
    if (next.phase === 'break') {
      // re-rack resolutions (dry_break 2/3, re-breaks, stalemate): SAME
      // rack seed — the share codec's re-rack semantics re-derive the
      // identical rack template permutation (share-codec-v4.md)
      game.rerack(game.seed);
      return true;
    }
    // 4.3(e)/(f) spot choices, or break_foul after the 8 flew off on the
    // break (4.3(g) + 4.7): the resolution returned the 8 — spot it
    if (!prevOnTable.includes(8) && next.onTable.includes(8)) respotBall(8);
    // placement: eight_foul_break/1 and break_foul kitchen (or a scratched
    // cue on 'accept' — the cue must enter play from the kitchen either
    // way, 4.3(g)) seat the incoming shooter on a kitchen ball-in-hand
    const kitchen = (kind === 'eight_foul_break' && choice === 1)
      || (kind === 'break_foul' && !heyballActive()
        && (choice === 2 || game.cueBall().pocketed))
      // GH-491 heyball II.6(e)/(f) choice 1: ball in hand BEHIND THE HEAD
      // STRING as it lies — the crate armed state.kitchenBih on exactly
      // these resolutions (the re-rack arms returned through the
      // phase-'break' branch above and never reach here)
      || (heyballActive() && choice === 1
        && (kind === 'break_foul' || kind === 'eight_break_foul'))
      // 025: accepting a scratched breaking stroke — the cue must enter
      // play from the kitchen (WPA 7.9 via 3.1)
      || (kind === 'break_violation' && choice === 1
        && game.cueBall().pocketed);
    const info = { decision: kind, player, judgment: lastJudgment };
    // ---- snooker (US2): the adjudication parked on the decision BEFORE
    // applying respots — return every colour the match state says is up but
    // the table still shows down (foul pots, the re-spotted black), then
    // seat the striker: cue in hand within the D after a scratch foul or on
    // the re-spotted black's first stroke (WPBSA Sec3 R5/R4(b)).
    if (snookerActive()) {
      // GH-382 decision 17 choice 3 (Sec3 R14(b) "all balls shall be
      // replaced"): restore the pinned bit-exact snapshot INSTEAD of the
      // respot diff — the restored table IS the original address the
      // offender replays from (cue included; never in-hand here).
      if (kind === 'foul_and_a_miss' && choice === 3) {
        restoreMissSnapshot();
        // the snapshot STAYS pinned (review r5 P1): an in-app Replay
        // re-plays the missed stroke's playback and routeReplay must
        // re-apply the replacement XY afterwards — it is superseded by
        // the next adjudication (which re-pins or clears it)
        missReplaced = true;
        refreshSnookerAddressFacts({ pinFreeBall: true });
        lastRouting = { state: 'AIM', info };
        machine.to('AIM', info);
        return true;
      }
      if (kind === 'foul_and_a_miss') { // 1/2: position left
        missSnapshot = null;
        missReplaced = false;
      }
      const up = (next.onTable ?? []).filter((sid) =>
        game.ballSet.balls.find((b) => b.id === sid)?.pocketed);
      if (up.length) respotSnookerColours(up.sort((a, b) => b - a));
      const dZone = next.phase !== 'over'
        && (kind === 'respotted_black_toss'
          || ((kind === 'play_again' || kind === 'foul_and_a_miss')
            && lastJudgment?.ballInHand === 'd_zone'));
      if (dZone) {
        placementRight = 'd_zone';
        seatCueInD();
        // GH-382: in-hand turn — the R17(a) from-the-D examination
        refreshSnookerAddressFacts({ inHand: true, pinFreeBall: true });
        lastRouting = { state: 'BALL_IN_HAND', info };
        machine.to('BALL_IN_HAND', info);
        return true;
      }
      // position-left resolutions: re-examine the address for the seated
      // striker (touching chip + the FREE BALL call where kept — R12(f))
      refreshSnookerAddressFacts({ pinFreeBall: true });
    }
    if (kitchen) {
      placementRight = 'kitchen';
      game.respotCue(); // contract: revive the cue BEFORE entering the state
      lastRouting = { state: 'BALL_IN_HAND', info };
      machine.to('BALL_IN_HAND', info);
    } else if (placementRight === 'kitchen' && game.shotIndex === 0
      && !lastRecord && next.phase !== 'over') {
      // GH-370 class 1: a PRE-BREAK option resolved while the opening
      // kitchen grant is live (one-pocket 12.3 pocket assignment) — the
      // breaker keeps the in-hand right instead of parking in AIM
      lastRouting = { state: 'BALL_IN_HAND',
        info: { ...info, openingBreak: true } };
      machine.to('BALL_IN_HAND', { ...info, openingBreak: true });
    } else {
      lastRouting = { state: 'AIM', info };
      machine.to('AIM', info);
    }
    return true;
  }

  // ---- one-pocket adapter section (feature 012 US1, WPA Sec. 12) ----------
  // Discipline-keyed additive block (tasks.md shared-surface protocol).

  /** WPA 12.3 default pocket choice for the CURRENT break placement: the
   * foot pocket opposite the cue ball's side of the head string (viewed
   * from the head). The rule lives in the SDK (defaultBreakPocketChoice);
   * this only feeds it the live cue x. Falls back to choice 1. */
  function defaultBreakPocket() {
    try {
      if (rules?.defaultBreakPocketChoice) {
        const k = threePosToK(game.cueBall().mesh.position);
        return rules.defaultBreakPocketChoice(k.x);
      }
    } catch { /* fresh boot — no balls yet */ }
    return 1;
  }

  /** GH-382 (review r4 P1, the cache-poison law): drive the FOUL AND A
   * MISS prompt with EXPLICIT choices — a stale hud.js has no
   * foul_and_a_miss row in its own table and would render zero buttons
   * (a wedged frame); explicit choices render on every hud vintage, and
   * aim.js's choice-less idempotent re-drives keep them (the
   * driveBreakPocketPrompt precedent). */
  function driveMissPrompt() {
    // GH-451 (a): NEVER during a shared replay — this drive runs inside
    // the settle dispatch BEFORE share.js's onShotSettled listener (the
    // same shotComplete emit) applies the recorded decision, so the
    // 3-button panel flashed for exactly one painted frame per recorded
    // foul_and_a_miss; the recorded choice re-applies programmatically
    // and announces through the passive hint (ctx.applyReplayDecision).
    // The driveRulesAction replay-gate precedent.
    if (replayLocked()) return;
    const pend = pendingDecision();
    if (pend?.kind !== 'foul_and_a_miss') return;
    hud.setDecision?.({
      kind: 'foul_and_a_miss', chooser: pend.chooser,
      choices: [1, 2, 3],
      onChoose: (choice, kind) => {
        // shared replays apply their RECORDED choices programmatically
        if (!replayLocked()) applyRulebookDecision(kind, choice);
      },
    });
  }

  /** Order the break-pocket prompt buttons DEFAULT FIRST (the kit renders
   * the first choice as the primary button — the 12.3 default); aim.js's
   * choice-less idempotent re-drives keep this ordering. */
  let lastBreakPocketDef = null; // the ordering the live prompt was driven
                                 // with (review r3 P2 — cue drags re-drive)
  function driveBreakPocketPrompt() {
    // GH-451 (a): a shared replay resolves the recorded 12.3 choice
    // through the pre-judge/applyReplayDecision seams — the prompt (whose
    // buttons flow's decide() refuses at click time anyway) must never
    // squat over the playback as a dead modal.
    if (replayLocked()) return;
    const pend = pendingDecision();
    if (pend?.kind !== 'break_pocket') return;
    const def = defaultBreakPocket();
    lastBreakPocketDef = def;
    hud.setDecision?.({
      kind: 'break_pocket', chooser: pend.chooser,
      choices: def === 1 ? [1, 2] : [2, 1],
      onChoose: (choice, kind) => {
        // shared replays apply their RECORDED choices programmatically
        if (!replayLocked()) applyRulebookDecision(kind, choice);
      },
    });
  }

  // share.js Continue-from-here seam (review GH-451 r2 P2): the replay
  // lock suppressed the flow-driven prompts, so a link whose LAST shot
  // left a decision unresolved (the sender shared before deciding) hands
  // the adopted frame over with the pending prompt never driven — and
  // aim.js's projection re-drive carries no explicit `choices`, which a
  // cached pre-GH-382 hud.js cannot default for foul_and_a_miss (zero
  // buttons, a wedged frame). Re-drive the flow-owned prompts the moment
  // the lock ends; both no-op unless their kind actually pends.
  ctx.replayHandoff = () => {
    driveMissPrompt();
    driveBreakPocketPrompt();
  };

  // share.js replay seam (codec v4): re-apply a RECORDED rulebook decision
  // by its frozen wire id during a shared replay. Throws (into share.js's
  // try/catch toast) instead of silently diverging the replayed match.
  const DECISION_KIND_BY_ID = Object.freeze(Object.fromEntries(
    [...Object.entries(DECISION_IDS), ...Object.entries(SNOOKER_DECISION_IDS),
      // GH-371: the fourteenone-family spot_nearest wire id
      ['spot_nearest', FOURTEENONE_SPOT_NEAREST_ID],
      // GH-491: the heyball family (ids 18–23) — the kinds resolve back
      // through HEYBALL_DECISION_IDS under an active heyball fold
      ...Object.entries(HEYBALL_DECISION_IDS)]
      .map(([k, v]) => [v, k])));
  // share.js recorder + replay seams (codec v7, GH-448): the recorder
  // reads the hotseat at its fresh-rack session pin (ctx.hotseatSeat),
  // and the replay TRANSPORT pins the hotseat to the wire's recorded
  // breaker right before its own re-rack (ctx.applyReplaySeat, called by
  // gotoShot/start) — resetMatch folds initialState(player) with the
  // module-level hotseat, which the previous replay pass itself mutated
  // (switchPlayer per judged turnover; terminal winner/breaker at WIN),
  // so without the pin a ⏮ scrub re-folded the frame onto whatever seat
  // happened to be live and the scoreboard/chooser attribution flipped.
  // ONLY the transport re-rack pins: mid-replay RULEBOOK re-racks
  // (dry-break re-rack, re-break, stalemate) keep applyRulebookDecision's
  // own seat assignment, which runs before their rerack. Feature-detected
  // on both sides per the cache-poison contract (a stale peer no-ops).
  ctx.hotseatSeat = () => player;
  ctx.applyReplaySeat = (seat) => {
    if ((seat !== 1 && seat !== 2) || !replayLocked()) return false;
    // GH-460 (review r1 P2): every accepted pin exempts the ONE fold it
    // precedes from the discipline-switch reseed — the replay-EXIT
    // restoration pins under the lock but its viewer-game re-rack folds
    // AFTER the lock drops (share.js exitReplay ordering), and that fold
    // must keep the restored seat, never the cold-boot reseed.
    replaySeatPin = true;
    if (player !== seat) {
      player = seat;
      emitHook('playerChanged', { player });
    }
    return true;
  };

  ctx.applyReplayDecision = ({ decision, choice }) => {
    const kind = DECISION_KIND_BY_ID[decision];
    if (!kind) throw new Error(`unknown decision wire id ${decision}`);
    // GH-371 (review r4 P2): spot_nearest has per-family wire ids (14
    // one-pocket / 15 fourteenone) — a recorded id from the WRONG family
    // is a malformed link, not a re-mappable request
    if (kind === 'spot_nearest') {
      const want = fourteenoneActive()
        ? FOURTEENONE_SPOT_NEAREST_ID
        : DECISION_IDS.spot_nearest;
      if (decision !== want || !(fourteenoneActive() || onePocketActive())) {
        throw new Error(`recorded spot_nearest wire id ${decision} does `
          + 'not belong to the active ruleset');
      }
    }
    // GH-491 (the spot_nearest law, family-scale): 'break_foul' and
    // 'stalemate' are one kind with two wire ids (eightball 4/5, heyball
    // 19/23) — a recorded id from the WRONG family is a malformed link,
    // never a re-mappable request
    if ((kind === 'break_foul' || kind === 'stalemate')
      && (decision >= 18 && decision <= 23) !== heyballActive()) {
      throw new Error(`recorded decision wire id ${decision} does not `
        + 'belong to the active ruleset');
    }
    // a PRE-SHOT option (one-pocket break_pocket) was already resolved by
    // the adjudicate() pre-judge for this shot — the post-settle
    // re-application would find nothing pending and refuse
    const key = `${ctx.replayShotIndex?.() ?? -1}|${decision}|${choice}`;
    if (consumedReplayDecisions.has(key)) {
      consumedReplayDecisions.delete(key);
      announceReplayDecision(kind, choice);
      return;
    }
    if (!applyRulebookDecision(kind, choice)) {
      throw new Error(`recorded decision ${kind}/${choice} was refused`);
    }
    announceReplayDecision(kind, choice);
  };

  /** GH-451 (b): a recorded decision that just re-applied during a shared
   * replay is RENDERED to the viewer as information — the existing
   * transient-hint grammar (the carom point/foul hints' surface, cleared
   * by the next stroke exactly like those) composing the decision panel's
   * OWN title + chosen-option strings. Never a prompt: the panel stays
   * suppressed (driveMissPrompt/driveDecision replay gates); nothing here
   * is interactive. Runs AFTER applyRulebookDecision so its unconditional
   * hint clear cannot eat the announce. */
  function announceReplayDecision(kind, choice) {
    // only decisions the panel itself can name (the GH-371 recorded
    // REQUESTS — spot_nearest/contact_respot — never pend and carry no
    // panel strings; their placements are visible on the table and a
    // raw-key hint would be worse than silence). has() feature-detected
    // per the namespace-import discipline (a stale i18n.js announces
    // nothing rather than painting raw keys).
    // GH-491: heyball's 'break_foul' kind collides with the 8-ball kind
    // NAME but carries different options (II.6(e) three-way) — its UI
    // strings live under the aliased heyball_break_foul keys
    const uiKind = heyballActive() && kind === 'break_foul'
      ? 'heyball_break_foul'
      // review r9 P3: the shared stalemate title cites WPA 4.11; the
      // heyball agreement is II.21 (same one-choice structure) — the
      // hasLocal gates below degrade a stale locale to silence
      : heyballActive() && kind === 'stalemate'
        ? 'heyball_stalemate' : kind;
    const titleKey = 'decision.title.' + uiKind;
    const optKey = `decision.opt.${uiKind}.${choice}`;
    // the wrapper key rides the gate too (review r1 P2), and through the
    // ACTIVE-dictionary register (review r3 P2, the GH-313 hasLocal law):
    // a non-English locale cached from before this feature reads true
    // through has()'s en fallback and would paint ENGLISH copy into a
    // non-English UI plus a missing-key warn — degrade to silence
    // instead (a stale i18n.js without hasLocal announces nothing).
    if (i18nNs.hasLocal?.(titleKey) !== true
      || i18nNs.hasLocal?.(optKey) !== true
      || i18nNs.hasLocal?.('share.decisionApplied') !== true) {
      return;
    }
    hud.setHint(t('share.decisionApplied', {
      title: t(titleKey),
      choice: t(optKey),
    }));
  }

  // share.js replay seam (codec v6, issue #68 follow-up): apply one
  // recorded FREE-PLACEMENT event during a shared replay. NON-interactive
  // by design — the pgPlaceBall primitive below is class-gated off during
  // replays (playgroundActive() && !replayLocked()), so the replay lane
  // gets its own path: an EXACT mesh write + shadow sync (the respotBall
  // anatomy). No clamp, no overlap law, no snap: the recorded point IS the
  // sender's committed legal landing (post clamp/snap/nudge), and the
  // kernel re-validates every placement at simulate time exactly as it did
  // for the sender — re-deriving it here could only diverge. Returns false
  // (share.js warns) when the ball is missing/pocketed — impossible on a
  // faithful replay, a divergence signal on a broken one.
  ctx.applyReplayPlacement = ({ ball: id, x, y }) => {
    if (!replayLocked()) return false;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    const ball = game.ballSet.balls.find((b) => b.id === id);
    if (!ball || ball.pocketed) return false;
    kPosToThree(ball.mesh.position, x, y, ballR());
    game.syncShadows?.();
    return true;
  };

  /** A replayed shot settles again: restore the post-shot table (respot the
   * 9 / revive the cue) and re-enter the prior routing — NO second
   * adjudication, no turn switch, no repeated hook events. */
  function routeReplay() {
    if (!lastRouting) { machine.to('AIM', {}); return; }
    // issue #68 playground: an in-session Replay re-settles under the
    // sandbox — restore the cue on a scratch (policy below); the suspended
    // match fold must not respot balls the sandbox deliberately left down.
    if (playgroundActive() && !replayLocked()) {
      if (game.cueBall().pocketed) game.respotCue();
      // codec v6 (WIRING re-review): the replayed playback re-wrote every
      // mesh from the LAST shot's sampler, wiping any post-settle free
      // placements the recorder already committed for the NEXT shot — the
      // encoded moves axis would then assert placements the sender's next
      // stroke never had, and the shared replay would fork silently.
      // Flush a gesture still live across the replay (its landing DID
      // happen pre-playback; the SIMULATING-edge flush never ran — replays
      // route through PLAYBACK), then restore the committed pending events
      // in commit order via exact mesh writes (the applyReplayPlacement
      // anatomy: the recorded points ARE the final legal landings on this
      // very table state — the judged lane's savedBihPos restore, played
      // on the moves axis). Feature-detected: a pre-v6 share.js publishes
      // no seam — nothing to restore (and nothing on the wire to contradict).
      flushDragCommit();
      for (const mv of ctx.pendingFreePlacements?.() ?? []) {
        const b = game.ballSet.balls.find((x) => x.id === mv.ball);
        if (!b || b.pocketed) continue;
        kPosToThree(b.mesh.position, mv.x, mv.y, ballR());
      }
      game.syncShadows?.();
      savedBihPos = null;
      machine.to('AIM', lastRouting.info ?? {});
      return;
    }
    // GH-680 review r1 P1: a SANDBOX drill (live OR parked — the GH-209 law)
    // owns restoration exactly as it owns adjudication (FORMAT.md §3.5):
    // the match fold below must not respot balls the drill deliberately
    // left down, and every sandbox stroke routed as the plain AIM settle
    // (settleUnderDrill) — so a replayed run-ENDING scratch fell through to
    // the AIM routing with the cue still in the pocket (the fold revives
    // only for BALL_IN_HAND; drills.js ignores the duplicate record).
    // Mirror settleUnderDrill: under the PARKED snapshot a pocketed cue
    // revives at the head spot — where complete() put it after the live
    // stroke; a LIVE run's own replay-identity branch (drills.js
    // shotComplete) re-runs its re-lay / re-grant and re-seats the cue.
    if (drillSandboxActive()) {
      if (!drillRunLive() && game.cueBall()?.pocketed) game.respotCue();
      savedBihPos = null;
      machine.to('AIM', lastRouting.info ?? {});
      return;
    }
    if (match.ruleset && Array.isArray(match.state?.onTable)) {
      // restore the post-adjudication table: any ball the match state says
      // is up but the replayed playback re-sank was respotted (the 9 on
      // fouls; the 8 after a 4.3(e)/(f) resolution; snooker colours to
      // their own spots) — spot it again
      const sunk = match.state.onTable.filter((id) =>
        game.ballSet.balls.find((x) => x.id === id)?.pocketed);
      if (fourteenoneActive() && match.state.rerack && sunk.length) {
        // 025: a replayed 14-at-14 stroke re-sank the racked balls —
        // re-execute the judged plan (same lattice, same placements)
        applyFourteenOneRerack(match.state.rerack);
      } else if (missReplaced && missSnapshot && snookerActive()) {
        // GH-382 (review r5/r23): the applied choice-3 replacement is
        // the whole logical truth — restore it SILENTLY (routeReplay's
        // no-repeated-hooks contract; the generic respot path would
        // double-report the decision's consequences)
        restoreMissSnapshot(true);
      } else if (snookerActive() && sunk.length) {
        respotSnookerColours(sunk.sort((a, b) => b - a));
      } else {
        for (const id of sunk) respotBall(id);
      }
    } else if (missReplaced && missSnapshot && snookerActive()) {
      restoreMissSnapshot(true); // same law on the no-match-state arm
    } else if (caromActive() && match.state?.phase === 'leveling_break') {
      // GH-383 review r4: a replayed finishing stroke leaves the balls at
      // their post-shot poses — the Art 29.4 leveling address must be
      // re-applied whole (start-position reset + the break liturgy; the
      // routing below is superseded by the re-entry). review r5: a spot
      // the player had already DRAGGED to survives the round trip (the
      // carom_break clamp snaps it back onto the chosen start spot).
      caromEnterLevelingBreak();
      if (savedBihPos) game.placeCue(savedBihPos.x, savedBihPos.y);
      savedBihPos = null;
      return;
    } else if (caromActive() && lastJudgment?.respot?.length) {
      // 012 US3: a replayed jump re-flies the balls concerned off the
      // table — restore their UMB designated-spot respots (Art 28.1(b))
      caromApplyRespots(lastJudgment);
    } else if (lastJudgment?.respotNine) {
      respotBall(9);
    }
    // GH-371 (review r4 P1): re-apply the rule-request placements the
    // replayed playback just wiped (exact mesh writes — the recorded
    // points ARE the committed legal landings on this very table state)
    if (pendingRulePlacements.length) {
      for (const mv of pendingRulePlacements) {
        const b = game.ballSet.balls.find((x) => x.id === mv.ball);
        if (!b || b.pocketed) continue;
        kPosToThree(b.mesh.position, mv.x, mv.y, ballR());
      }
      game.syncShadows?.();
    }
    if (lastRouting.state === 'BALL_IN_HAND') {
      game.respotCue(); // contract: revive the cue BEFORE entering the state
      // restore the placement the player had already lined up before
      // pressing Replay (respotCue above revives a scratched cue first;
      // the wrapped full-table placeCue re-validates overlap/bed clamping)
      if (savedBihPos) game.placeCue(savedBihPos.x, savedBihPos.y);
    }
    savedBihPos = null;
    machine.to(lastRouting.state, lastRouting.info);
  }

  // ---- HUD flow presentation
  const lowestOnTable = () => {
    const ids = game.activeBalls().filter((b) => b.id > 0).map((b) => b.id);
    return ids.length ? Math.min(...ids) : null;
  };

  /** 8-ball aim-hint target for the shooter (derived, data-model.md §4). */
  function targetLabel() {
    const s = match.state;
    if (!s || s.phase === 'break') return t('flow.target.break');
    if (s.phase === 'open') return t('flow.target.open');
    const grp = s.groups?.[player];
    if (!grp) return t('flow.target.open');
    const mine = s.onTable.filter((id) => (grp === 'solids'
      ? id >= 1 && id <= 7 : id >= 9 && id <= 15));
    return mine.length === 0 ? t('flow.target.eight') : t(`flow.target.${grp}`);
  }

  /** Pocket index → localized mouth name (the aim lane's geometric
   * naming: kernel +y = foot, x < 0 = left; same derivation as
   * aim.js buildMarks — issue #37 banner). */
  function pocketLabel(i) {
    const tb = table();
    const p = tb?.pockets?.[i];
    if (!p) return String(i);
    const px = p.center?.x ?? p.x, py = p.center?.y ?? p.y;
    const side = Math.abs(py) < tb.length / 4;
    const left = px < 0;
    return t('call.pocket.' + (side ? (left ? 'sideLeft' : 'sideRight')
      : py > 0 ? (left ? 'footLeft' : 'footRight')
        : (left ? 'headLeft' : 'headRight')));
  }

  let banterTimer = 0;
  // GH-1024: the WIN continuation deferred while the toolbar Export holds
  // the winning shot — { onIdle } (the 'ob:export-idle' listener); any
  // newer stateChange cancels it exactly like the timer it replaces
  let winDeferred = null;
  const cancelWinDeferral = () => {
    if (!winDeferred) return;
    window.removeEventListener('ob:export-idle', winDeferred.onIdle);
    winDeferred = null;
  };
  let shown = null;      // last presented { state, info } — relabeled on switch
  let bannerKind = null; // 'win' | 'foul' | 'callUnfulfilled' while the
                         // banner timer is live
  let winDismissed = false; // the user waved the CURRENT terminal's WIN
  // banner away (issue #71) — a DVR borrow's close re-routes through WIN
  // and must not resurrect it (review round-8 P2); reset with the fold on
  // every fresh table

  // ---- one-writer law on #banner (GH-350) -----------------------------------
  // The banterTimer reapers below used to call hud.setBanner('')
  // UNCONDITIONALLY: a stale reaper fired 1.8/2.6 s after flow's paint and
  // wiped whatever a NEWER writer (record.js's savedDownload toast, a drill
  // hold, an e2e direct write) had put on the surface since — the build-16
  // regate failed e2e-record [toast-ttl] leg (e) 3/3 byte-identical on
  // exactly this. Adopt the record.js toast() / GH-145 DOM read-back law:
  // every flow paint records the exact string it painted, and a reaper only
  // wipes the surface if it still shows that string. bannerKind bookkeeping
  // and the WIN timer's re-rack continuation stay unconditional — only the
  // VISUAL wipe is gated on still owning the surface.
  let flowBannerText = ''; // the exact string flow last painted on #banner
  function paintBanner(text, tone) {
    flowBannerText = text;
    hud.setBanner(text, tone);
  }
  function reapBanner() {
    bannerKind = null;
    lastShownFouls = null; // GH-436: the reason cache dies with the banner
    const b = document.getElementById('banner');
    if (b && b.textContent === flowBannerText) hud.setBanner('');
  }

  // foul CODES → translated reason at the presentation boundary (the SDK's
  // judgment.fouls are stable enum strings for 9-ball, CitedFoul objects
  // for the registry games — the cite rides the banner per FR-009;
  // FOUL_LABELS stays hook/log-only)
  //
  // GH-436: the banner's re-assert (renderText) can run over an info that
  // carries NO judgment — the drill re-lay's synthetic BALL_IN_HAND
  // (drillPlacement) and the DVR restore both re-present a foul whose
  // judgment surface was already reset. Composing from the empty list
  // degraded the banner to t('flow.foulFallback') ("FOUL — foul") for the
  // whole placement window. Cache the last CONCRETE fouls LIST (codes, not
  // the composed string — a mid-banner locale switch must recompose) for
  // the banner's display lifetime, and serve it whenever the presented
  // info carries no judgment of its own — never the fallback prose. The
  // cache has ONE writer: the stateChange judgment beat below (review r1
  // P2 — refreshing it only from the render path left it stale when a
  // legal shot's judgment never rendered through a foul banner); it dies
  // with the banner (reapBanner / user dismiss / the pocketed-clear
  // branch below).
  let lastShownFouls = null;
  const foulReason = (info) => {
    const fresh = info?.judgment?.fouls;
    const fouls = fresh?.length ? fresh : (lastShownFouls ?? []);
    if (!fouls.length) return t('flow.foulFallback');
    return fouls.map((f) => (typeof f === 'string'
      ? t(`foul.${f}`)
      : `${t(`foul.${f.code}`)} (${f.cite})`)).join(', ');
  };

  /** Pure text pass over the current presentation — re-run as-is on a locale
   * switch (no timers, no reracks, no routing). */
  function renderText() {
    if (!shown) return;
    const { state, info } = shown;
    driveRulesAction(); // GH-371: the conditional rules-action affordance
    // issue #68 playground: neutral sandbox presentation — no player hints,
    // no foul/win banners (the sandbox settle path never arms bannerKind;
    // this guard also covers a mode switch landing mid-presentation).
    // PLAYBACK keeps its clock line; WIN keeps the terminal presentation
    // (only reachable by switching modes during a WIN hold — its timer
    // re-racks into the sandbox moments later).
    if (playgroundActive() && !replayLocked()
      && state !== 'PLAYBACK' && state !== 'WIN') {
      hud.setState(t('state.aim'), t('playground.aimHint'));
      return;
    }
    if (state === 'WIN') {
      // GH-458: the equal-innings DRAW rides the WIN routing (the terminal
      // fold's one exit) but is NOT a win — winner 0 is the registry's only
      // draw sentinel (UMB Art 29.4; the ownership ledger: the WIN path never
      // adopts it as a seat), so the state line presents the draw, never
      // "WIN — re-racking…" under the DRAW banner. hasLocal-gated (review
      // r1 P2, the GH-313 mixed-cache law): a stale cached dictionary has
      // no 'state.draw' — degrade to the legacy WIN label, never a raw key.
      hud.setState(t(lastTerminal?.winner === 0
        && i18nNs.hasLocal?.('state.draw') === true
        ? 'state.draw' : 'state.win'),
        replayLocked() ? t('flow.replayFinished') : t('flow.reracking'));
      if (bannerKind === 'win') {
        // GH-458: composed LAZILY, only by the branches that render it —
        // the old unconditional compose looked `flow.reason.<reason>` up
        // for EVERY terminal and logged "[i18n] missing key" on each
        // carom/snooker win render (their reasons live in their own key
        // families: carom.*/snooker.reason.*) and on every carom draw
        // ('flow.reason.carom-draw' now exists ×7 for reason-naming
        // surfaces, but this path composes its own banner copy).
        const citedReason = () => {
          if (!lastTerminal) return '';
          let key = `flow.reason.${lastTerminal.reason}`;
          // GH-491 review r9 P2: heyball is NO-CALL — the shared
          // eight-ball-pocketed reason says "as called"; the win rides
          // its own key when the ACTIVE dictionary carries it (the
          // GH-313 hasLocal law; a cached locale without it keeps the
          // shared text rather than painting English or a raw key).
          if (heyballActive() && lastTerminal.reason === 'eight-ball-pocketed'
            && i18nNs.hasLocal?.('flow.reason.heyball-eight-pocketed') === true) {
            key = 'flow.reason.heyball-eight-pocketed';
          }
          return `${t(key)} (${lastTerminal.cite})`;
        };
        // GH-1050: "in 1 inning" — the i18n layer has no plural forms, so
        // the singular rides its own key, hasLocal-gated (the GH-313 law: a
        // stale cached dictionary keeps the plural line, never a raw key)
        const caromBannerKey = () => {
          if (lastTerminal.reason === 'carom-draw') return 'carom.drawBanner';
          return lastTerminal.innings === 1
            && i18nNs.hasLocal?.('carom.winBannerOne') === true
            ? 'carom.winBannerOne' : 'carom.winBanner';
        };
        paintBanner(snookerActive() && lastTerminal
          ? t('snooker.winBanner', { // US2: frame verdict + WPBSA cite
            player,
            reason: `${t(`snooker.reason.${lastTerminal.reason}`)} (${lastTerminal.cite})`,
          })
          // 012 US3: the carom result presents points + innings for BOTH
          // players (spec US3-AS4) with the Art 29 cite; GH-383: the
          // equal-innings DRAW (winner 0 sentinel) gets its own banner
          : caromActive() && lastTerminal
            ? t(caromBannerKey(), {
              player,
              p1: match.state?.points?.[1] ?? 0,
              p2: match.state?.points?.[2] ?? 0,
              innings: lastTerminal.innings ?? match.state?.innings ?? 0,
              cite: lastTerminal.cite,
            })
            : eightActive() && lastTerminal
              ? t('flow.winBanner8', { player, reason: citedReason() })
              : onePocketActive() && lastTerminal // 012 US1: cite rides the banner
                ? t('onepocket.winBanner', { player, reason: citedReason() })
                : fourteenoneActive() && lastTerminal // 025: cited 7.4 verdict
                  ? t('fourteenone.winBanner', { player, reason: citedReason() })
                  : tenballActive() && lastTerminal // 026: cited 6.7/6.10 verdict
                    ? t('tenball.winBanner', { player, reason: citedReason() })
                    // GH-491: the cited II.2/II.20 verdict rides the shared
                    // 8-ball banner grammar — the WINNER is named from the
                    // terminal itself, never the module seat (the I.12
                    // alternate-break law already re-seated `player` on the
                    // NEXT rack's breaker)
                    : heyballActive() && lastTerminal
                      ? t('flow.winBanner8', {
                        player: lastTerminal.winner, reason: citedReason(),
                      })
                      : t('flow.winBanner', { player }), 'win');
      }
    } else if (state === 'BALL_IN_HAND') {
      hud.setState(t('state.ballInHand'),
        placementRight === 'carom_break' // 012 US3: break-spot placement
          // GH-383: the two-cue leveling address places the seat's OWN
          // ball — name it (the classic break keeps the frozen copy)
          ? (caromTwoCue() && game.cueBall()?.id === 1
            ? t('carom.breakPlace2', { player, ball: caromCueBallName() })
            : t('carom.breakPlace', { player }))
          : placementRight === 'kitchen'
            ? t('flow.ballInHandKitchen', { player })
            : placementRight === 'd_zone'
              ? t('snooker.ballInHandD', { player }) // US2: within the D
              : practiceActive() // build-4 QA: solo mode, no P-addressee
                ? t('flow.ballInHandHintSolo')
                : t('flow.ballInHandHint', { player }));
      if (bannerKind === 'foul') {
        paintBanner(t('flow.foulBanner', { reason: foulReason(info) }), 'foul');
      }
    } else if (state === 'PLAYBACK') {
      hud.setState(t('state.playback'), info?.duration ? info.duration.toFixed(1) + ' s' : '');
    } else {
      // 012 US1 (+025: 14.1 shares the cue-stays law, WPA 7.9): non-3.1
      // fouls park in AIM — render the cited banner here
      if (bannerKind === 'foul' && (onePocketActive() || fourteenoneActive())) {
        paintBanner(t('flow.foulBanner', { reason: foulReason(info) }), 'foul');
      }
      // issue #37: legal pot, call unfulfilled → the pass is explained
      // (amber register — not a foul, but not the success green either)
      if (bannerKind === 'callUnfulfilled' && info?.callUnfulfilled) {
        paintBanner(t('flow.callUnfulfilledBanner', {
          ball: info.callUnfulfilled.ball,
          pocket: pocketLabel(info.callUnfulfilled.pocket),
        }), 'foul');
      }
      const pend = pendingDecision();
      if (pend) {
        // GH-491: heyball's 'break_foul' kind collides with the 8-ball
        // kind name — its state-line copy rides the aliased key
        const kindKey = heyballActive() && pend.kind === 'break_foul'
          ? 'heyball_break_foul' : pend.kind;
        hud.setState(t('state.aim'), t(`flow.decision.${kindKey}`,
          { player: pend.chooser === 'both' ? player : pend.chooser }));
      } else if (snookerActive()) {
        hud.setState(t('state.aim'), // US2: ball-on aim hint (FR-008)
          t('snooker.aimHint', { player, target: snookerBallOnLabel() }));
      } else if (eightActive()) {
        hud.setState(t('state.aim'),
          t('flow.aimHint8', { player, target: targetLabel() }));
      } else if (onePocketActive()) { // 012 US1: own pocket + tally hint
        const ms = match.state;
        const pk = ms?.pockets?.[player];
        hud.setState(t('state.aim'), t('onepocket.aimHint', {
          player,
          pocket: t(`call.pocket.${pk === 2 ? 'footLeft' : 'footRight'}`),
          tally: ms?.tallies?.[player] ?? 0,
        }));
      } else if (fourteenoneActive()) { // 025: run/score/target aim line
        const ms = match.state;
        hud.setState(t('state.aim'), t('fourteenone.aimHint', {
          player,
          run: ms?.run ?? 0,
          points: ms?.scores?.[player] ?? 0,
          target: ms?.target ?? 100,
        }));
      } else if (tenballActive()) { // 026: rotation target + the 6.4 window
        const ms = match.state;
        const low = ms?.onTable?.length ? Math.min(...ms.onTable) : '—';
        hud.setState(t('state.aim'), ms?.phase === 'pushout'
          ? t('tenball.aimHintPush', { player, ball: low })
          : t('tenball.aimHint', { player, ball: low }));
      } else if (heyballActive()) { // GH-491: the no-call aim line (II.11)
        const ms = match.state;
        if (ms?.phase === 'grouped' && ms.groups) {
          const grp = ms.groups[player];
          const mine = (ms.onTable ?? []).filter((id) => (grp === 'solids'
            ? id >= 1 && id <= 7 : id >= 9 && id <= 15));
          hud.setState(t('state.aim'), mine.length === 0
            ? t('heyball.aimHintEight', { player }) // II.2: any pocket wins
            : t('heyball.aimHint', { player, group: t('match.' + grp) }));
        } else if (ms?.phase === 'break') {
          // the transient pre-grant frame (the opening BALL_IN_HAND owns
          // the break address copy) — the 8-ball break line, reused
          hud.setState(t('state.aim'),
            t('flow.aimHint8', { player, target: t('flow.target.break') }));
        } else {
          hud.setState(t('state.aim'), t('heyball.aimHintOpen', { player }));
        }
      } else if (caromActive()) { // 012 US3: points/target aim line
        // GH-383: under the two-cue assignment the hint names the seat's
        // ball (white / yellow / marked white) so the ownership is
        // always on screen (Art 23.4 — each keeps his ball all match)
        hud.setState(t('state.aim'), caromTwoCue()
          ? t('carom.aimHint2', {
            player,
            ball: caromCueBallName(),
            points: match.state?.points?.[player] ?? 0,
            target: match.state?.target ?? 15,
          })
          : t('carom.aimHint', {
            player,
            points: match.state?.points?.[player] ?? 0,
            target: match.state?.target ?? 15,
          }));
      } else {
        hud.setState(t('state.aim'),
          t('flow.aimHint', { player, ball: lowestOnTable() ?? '—' }));
      }
    }
  }
  onLocaleChange(renderText);

  // KF-019: a toast that a mode-switching commit writes in the SAME task as
  // its mode edge — practice.js commitPlayground stops a live drill through
  // the drills user path ("Drill stopped") and switches the mode in the same
  // call — survives that commit's own consequences: the playground edge's
  // banter clear and the fresh table the ended drill session lays a moment
  // later. It lives its hud HINT_MS; a newer hint, a pointerdown or hud's
  // timer still end it. The observer's queued records are exactly the
  // #hud-hint mutations since the last microtask checkpoint: takeRecords()
  // reads them synchronously, the no-op callback drains them at each one.
  const hintEl = document.getElementById('hud-hint');
  const hintWatch = hintEl && typeof MutationObserver === 'function' ? new MutationObserver(() => {}) : null;
  hintWatch?.observe(hintEl, { childList: true, characterData: true, subtree: true });
  let commitToast = null; // { text, until }: the toast the last mode-switching commit raised
  const keepCommitToast = () => {
    if (!hintWatch || hintWatch.takeRecords().length === 0 || hintEl.style.display !== 'block') return false;
    commitToast = { text: hintEl.textContent, until: performance.now() + 3500 }; // hud.js HINT_MS
    return true;
  };
  const commitToastShowing = () => !!commitToast && performance.now() < commitToast.until
    && hintEl.style.display === 'block' && hintEl.textContent === commitToast.text;

  machine.on('stateChange', (state, prev, info) => {
    if (state === 'SIMULATING' || state === 'SETTLED') return; // transient
    // a stroke that actually fired (or a fresh table) resolves whatever the
    // rejection hint was asking for — dismiss it early, don't ride the timer
    if (state === 'PLAYBACK' || info?.seed !== undefined || info?.layout) {
      if (state === 'PLAYBACK' || !commitToastShowing()) hud.setHint(''); // a commit's own toast is no rejection hint (KF-019)
    }
    if (info?.seed !== undefined || info?.layout) {
      lastRecord = null; lastRouting = null; lastJudgment = null; // fresh table
      savedBihPos = null;
      armedCall = null;
      winDismissed = false; // a new rack = a new terminal's banner rights
      rackOrdinal += 1; // bundle v2 ledger anchor: every fresh table (boot,
      // rerack, scripted layout) is a new rack ordinal — same-seed re-racks
      // stay distinguishable in the {rack, seed, shot} row identity
      resetMatch({ layout: !!info?.layout, abandon: info?.abandon === true });
      playgroundFreshTable?.();
    }
    // GH-436 (review r1 P2): a state change that CARRIES a judgment is the
    // authoritative beat for the banner's cached foul reasons — refresh
    // the cache from it, or, when the new judgment is foul-free, retire a
    // still-armed foul presentation outright (a legal shot fired inside
    // the 1.8 s reap window cancels the reaper via PLAYBACK and would
    // otherwise leave bannerKind + cache stale — a later synthetic
    // placement then resurrected the PREVIOUS foul's name on re-assert).
    // Runs BEFORE the arming branches below, so a fresh WIN/foul/
    // callUnfulfilled presentation from THIS judgment still arms normally.
    if (info?.judgment) {
      const jf = info.judgment.fouls;
      if (jf?.length) lastShownFouls = jf.slice();
      else if (bannerKind === 'foul') reapBanner();
      else lastShownFouls = null;
    }
    hud.setButtons({
      // issue #68: a pending rulebook option never locks the sandbox stroke
      // (the wrapped game.shoot bypasses the decision gates in playground)
      canShoot: (state === 'AIM' || state === 'BALL_IN_HAND')
        && !replayLocked()
        && (pendingDecision() === null || playgroundActive()),
      canReplay: !!game.sampler && state !== 'PLAYBACK' && !replayLocked(),
    });
    hud.setRack(game.ballSet.balls);
    clearTimeout(banterTimer);
    cancelWinDeferral(); // GH-1024: a newer state retires a deferred re-rack
    shown = { state, info };
    if (state === 'WIN') {
      // a dismissed banner stays dismissed on the SAME terminal (review
      // round-8 P2 — DVR close re-route); the continuation timer below
      // re-arms regardless, because it carries the auto re-rack
      bannerKind = winDismissed ? null : 'win';
      banterTimer = setTimeout(() => {
        reapBanner(); // GH-350: wipe only if the surface is still ours
        // shared replay: keep the final position on the table under the
        // 'REPLAY finished' banner — ⏮/⏭-wrap, Continue and Exit are the
        // ways out (a fresh differently-seeded rack would invite play in a
        // half-replay state)
        if (replayLocked()) return;
        // GH-1024: the re-rack frees the sampler + record the toolbar
        // Export re-renders — while the export HOLDS this shot (its dialog
        // building, open, or a run in flight; feature-detected, a stale
        // export.js keeps the pre-1024 schedule) the continuation waits
        // for its 'ob:export-idle' and then runs ONCE, still on this same
        // WIN terminal (a newer stateChange cancels it, the timer's law)
        if (window.__export?.holdsShot?.() === true) {
          const terminal = shown;
          const onIdle = () => {
            if (window.__export?.holdsShot?.() === true) return; // still held
            cancelWinDeferral();
            if (shown !== terminal || !machine.is('WIN') || replayLocked()) return;
            game.rerack(game.seed + 1);
          };
          winDeferred = { onIdle };
          window.addEventListener('ob:export-idle', onIdle);
          return;
        }
        game.rerack(game.seed + 1);
      }, 2600);
    } else if (state === 'BALL_IN_HAND' && !info?.dvr
      && !info?.drillPlacement) {
      // NOT the DVR restore's re-emission (GH-257 review round-3 P2): a
      // Playback close that hands back a BALL_IN_HAND table is restoring a
      // foul already presented — re-arming the foul banner here judged the
      // borrow itself as a fresh foul. renderText still re-paints the
      // placement guidance from the surviving placementRight. And NOT a
      // drill's granted placement (review round-9 P2): that synthetic BIH
      // is not a foul — arming it here left a stale module 'foul' the
      // drill's own banner clear could not reach, which a DVR borrow
      // inside the 1.8 s window then "resumed" as a phantom foul.
      bannerKind = 'foul';
      banterTimer = setTimeout(reapBanner, 1800); // GH-350 read-back reap
    } else if (state === 'BALL_IN_HAND' && info?.dvr && bannerKind === 'foul') {
      // ...but a borrow that interrupted a LIVE foul presentation resumes
      // it WITH its reaper (review round-5 P2): bannerKind survives
      // module-locally while every stateChange clears banterTimer, so a
      // restored foul banner otherwise stuck until user interaction.
      banterTimer = setTimeout(reapBanner, 1800); // GH-350 read-back reap
    } else if (state === 'AIM' && (onePocketActive() || fourteenoneActive())
      && (info?.judgment?.fouls?.length ?? 0) > 0) {
      // 012 US1 (+025): every non-3.1 one-pocket/14.1 foul keeps the cue
      // in position (WPA 12.8 / 7.9) and routes to AIM — the cited foul
      // banner still shows
      bannerKind = 'foul';
      banterTimer = setTimeout(reapBanner, 1800); // GH-350 read-back reap
    } else if (state === 'AIM' && info?.callUnfulfilled) {
      // issue #37: legal pot but the call went unfulfilled — the WPA 4.6
      // turn pass gets an on-screen explanation (before this the accent
      // flip was the only visible consequence)
      bannerKind = 'callUnfulfilled';
      banterTimer = setTimeout(reapBanner, 2600); // GH-350 read-back reap
    } else if (state !== 'PLAYBACK' && info?.pocketed?.length) {
      bannerKind = null;
      lastShownFouls = null; // GH-436: banner cleared — drop the cache
      hud.setBanner('');
    }
    renderText();
  });

  // issue #71: transient banners are passive chrome — a user tap anywhere
  // dismisses them (hud.js capture-phase pointerdown listener; the hud
  // accessor is feature-detected per the rule-5 cache-skew posture). Null
  // the re-paint state so renderText cannot resurrect the dismissed banner
  // on the next stateChange/locale switch, and drop the pending VISUAL
  // clear timer. EXCEPTION: the WIN timer also carries the game
  // continuation (the 2600 ms auto re-rack — a GAME-flow law, issue #71
  // scope note), so it stays armed; its late reapBanner (GH-350) is a
  // no-op on the hidden banner (and on any newer writer's text) and the
  // re-rack fires exactly on today's schedule.
  hud.onBannerDismiss?.((kinds) => {
    if (!kinds?.banner) return; // hint-only dismissal — nothing owned here
    if (bannerKind !== 'win') clearTimeout(banterTimer);
    // a dismissed WIN banner STAYS dismissed across a DVR borrow (review
    // round-8 P2): the close re-routes through WIN, and without this latch
    // the re-presentation resurrected the banner the user already waved
    // away — the re-rack beat still re-arms either way.
    if (bannerKind === 'win') winDismissed = true;
    bannerKind = null;
    lastShownFouls = null; // GH-436: a dismissed banner takes its reason cache
  });

  // ---- HUD buttons → game actions
  hud.onShoot(() => {
    if (replayLocked()) return; // button is disabled too — belt & suspenders
    const shot = hud.getShot();
    // issue #47 fire-time floor (F2, review 2026-07-21): recompute the
    // geometric elevation floor SYNCHRONOUSLY at the fire choke point —
    // the aim.js RAF clamp runs a frame behind, so a same-task phi nudge /
    // ball-in-hand drag / spin change followed by an immediate fire would
    // commit a stale-low theta into the kernel (the elevation slider is
    // the only input that clamps synchronously). Rides the SAME compute
    // the RAF uses (aim.js `__aim.minElevationNow`), feature-detected: a
    // stale aim.js degrades to the RAF-only clamp, never a throw. Replays
    // are untouched (share.js calls game.shoot directly, not this handler).
    // Recorded deviation: an aim-lane hunk in STREAM-B's flow.js — see the
    // the ownership ledger "Elevation floor" notes-ledger entry.
    const floorDeg = window.__aim?.minElevationNow?.();
    if (floorDeg > 0) shot.theta = Math.max(shot.theta, floorDeg * Math.PI / 180);
    const err = game.shoot(shot);
    // EXPECTED rejection of a normal input (call required, decision pending,
    // kernel shot validation): guidance, not an app error — present it as
    // the transient HUD hint. reportError/#err stays reserved for GENUINE
    // errors (the e2e zero-error gate reads that surface).
    if (err) {
      // GH-463 review r7: a register-aware rejection (rejectHintKey set by
      // game.shoot's validate path, synchronously, this same call) is
      // re-resolved through the tp seam if the input register or locale
      // flips during the hint's life. NEUTRAL rejections get NO
      // retranslator (review r8): re-running the wrapper template around a
      // captured old-locale `err` would paint a mixed-language line — the
      // fully-resolved original stands instead. hud.setHint's second arg
      // is ADDITIVE — a stale hud.js ignores it and keeps the one-string
      // contract.
      const key = rejectHintKey;
      const line = () => t('flow.shotRejected',
        { error: key ? (i18nNs.tp ?? t)(key) : err });
      hud.setHint(line(), key ? line : undefined);
    }
  });
  hud.onReplay(() => {
    if (replayLocked()) return;
    // Replay pressed while holding ball-in-hand: remember the placement the
    // player lined up so routeReplay can restore it instead of respotting
    savedBihPos = machine.is('BALL_IN_HAND')
      ? threePosToK(game.cueBall().mesh.position) : null;
    game.replay();
  });
  // GH-990 (and GH-986's no-confirm half): Re-rack throws away the rack in
  // play, so it obeys the law every other re-racking commit obeys. A pending
  // decision on a PROGRESSED rack refuses it with the honest notice (the
  // settings.js decisionConflict law — the re-rack would destroy the
  // opponent's option), and any other progressed, undecided rack asks first
  // through the kit confirm. One click still re-racks a pristine rack (shot
  // 0: nothing to lose, an address-born decision re-raises byte-identically),
  // a decided rack (the WIN hold — the frame is over) and the sandboxes
  // (playground, sandbox drills). The phone sheet's Re-rack row clicks the
  // same #rerack pill, so it lands here too. A rack a rulebook re-rack
  // re-dealt with the match fold CARRIED (14.1 7.11 / 7.3(b) re-breaks,
  // one-pocket 12.10) sits at shot 0 but still holds the match's progress
  // (scores, tallies, owed balls): it counts as progressed.
  // review r1 P3: adjudicateLegacy (rules registry unavailable) enters WIN
  // without a lastTerminal — the WIN state itself marks the rack decided.
  const rackDecided = () => lastTerminal !== null || machine.is('WIN');
  const rerackGuarded = () => (game.shotIndex > 0 || foldCarried)
    && !rackDecided() && !playgroundActive() && !drillSandboxActive();
  const refuseRerack = () => {
    const line = () => t('shell.notice.decision');
    hud.setHint(line(), line);
  };
  const confirmRerack = async () => {
    // hasLocal-gated (the GH-313 mixed-cache law): a stale cached dictionary
    // has no hud.rerackConfirm — the dialog keeps its localized title and
    // buttons with no body rather than an English line or a raw key
    const body = i18nNs.hasLocal?.('hud.rerackConfirm') === true
      ? t('hud.rerackConfirm') : '';
    try {
      // guarded dynamic import (the cache-poison contract — settings.js
      // changeGame precedent): a stale graph without the kit export falls
      // back to window.confirm, never a re-rack without asking
      const { confirmDialog } = await import('./ui/dialog.js');
      if (confirmDialog) {
        return await confirmDialog({
          title: t('hud.rerack'), body,
          confirmLabel: t('confirm.continue'), cancelLabel: t('confirm.cancel'),
        });
      }
    } catch { /* kit unavailable: native confirm below */ }
    return window.confirm(body || t('hud.rerack'));
  };
  let rerackAsking = false;
  // GH-1053 capability (the mixed-vintage law): settings.js opens the gear
  // under a pending decision only when THIS gate exists — a stale flow.js
  // re-racks on one click, and the phone sheet's Re-rack row would reach it
  ctx.rerackDecisionGate = true;
  // GH-1062: the carried-fold read for settings.js rackPristine (the GH-534
  // R1 predicate every re-racking commit and decision gate keys on) — a
  // rulebook re-rack that restored the match fold sits at shot 0 but is not
  // pristine. A stale flow.js has no seam (today's shot-0 read).
  ctx.foldCarried = () => foldCarried;
  hud.onRerack(async () => {
    if (replayLocked() || rerackAsking) return;
    if (rerackGuarded()) {
      if (pendingDecision() !== null) { refuseRerack(); return; }
      const rack = rackOrdinal;
      rerackAsking = true;
      let ok = false;
      try { ok = await confirmRerack(); } finally { rerackAsking = false; }
      // the table may have moved on under the dialog (the shot in flight
      // settled into a decision, the WIN hold re-racked, a replay began):
      // the consent covered THAT rack, undecided
      if (!ok || rack !== rackOrdinal || replayLocked()) return;
      if (rerackGuarded() && pendingDecision() !== null) {
        refuseRerack();
        return;
      }
    }
    // GH-1018 seat law: an UNDECIDED rack re-breaks with its own breaker;
    // a decided one (the WIN hold, legacy path included) keeps the winner
    game.rerack(game.seed + 1, { abandon: !rackDecided() });
  });

  // ---- heyball adapter helpers (GH-491, discipline-keyed) -------------------
  /** Ids of balls LEGAL for the CURRENT shooter that are frozen to a
   * cushion at address (WPA Heyball I.5/II.15.2: centre within r +
   * FROZEN_EPS of a cushion face — live mesh positions against the
   * kernel table dims, the caromFrozenSet read pattern; review r3 P2:
   * the tolerance is the crate's own 1e-6 `FROZEN_EPS` twin, hand-
   * duplicated — a looser display eps announced II.15.2 restrictions
   * the judge would not enforce). Legal set mirrors the
   * crate's legal_first (heyball.rs): own group when grouped (the 8
   * exactly when on the 8); any non-8 while open (openClaim never
   * licenses the 8 — II.10.1). Display-only: the II.15.2 escape law is
   * judged crate-side from the record's own address snapshot. */
  function heyballFrozenSet(hud) {
    try {
      if (hud?.phase !== 'open' && hud?.phase !== 'grouped') return [];
      const tb = table();
      const r = ballR();
      if (!(tb?.width > 0) || !(tb?.length > 0)) return [];
      const grp = hud.groups?.[hud.shooter];
      const onEight = grp ? hud.onEight?.[hud.shooter] === true : false;
      const balls = game.activeBalls();
      // I5 escape parity (review r7 P2): while OPEN with no non-8 object
      // ball left, the crate makes the 8 the only legal first contact
      // (open_bare_eight — heyball.rs) and judges II.15.2 on it, so the
      // frozen announce must include it (the legalFirstSet twin).
      const bareEight = hud.phase === 'open'
        && !balls.some((b) => b.id !== 0 && b.id !== 8);
      const out = [];
      for (const b of balls) {
        if (b.id === 0) continue;
        const legal = b.id === 8
          ? onEight || bareEight
          : hud.phase === 'open'
            || (grp === 'solids' ? b.id >= 1 && b.id <= 7
              : grp === 'stripes' ? b.id >= 9 && b.id <= 15 : false);
        if (!legal) continue;
        const k = threePosToK(b.mesh.position);
        const gap = Math.min(tb.width / 2 - Math.abs(k.x),
          tb.length / 2 - Math.abs(k.y)) - r;
        if (gap <= 1e-6) out.push(b.id); // heyball.rs FROZEN_EPS twin
      }
      return out.sort((a, b) => a - b);
    } catch { return []; }
  }

  // introspection + programmatic rules surface (window.__rules): the
  // headless e2e reads hotseat/turn/match state without HUD scraping, and
  // the nomination/decision hooks below are the PROGRAMMATIC path the
  // e2e-8ball suite drives (the visual nomination affordance lives in the
  // HUD/aim lane and calls the same functions).
  const api = {
    player: () => player,
    judgment: () => lastJudgment,
    // ---- feature 011 additions --------------------------------------------
    /** Active GameCatalog id ('nine_ball' | 'eight_ball'). */
    game: () => game.gameId ?? 'nine_ball',
    /** The settle-routing identity (GH-257 review round-6 P1): the record
     * whose shotComplete this adapter LAST routed — nulled by every fresh
     * table/layout. The DVR restore compares it to game.record to decide
     * whether re-settling the retained record is a REPLAY (identity match,
     * routed as such) or would be a double adjudication (GH-158 keeps
     * record/sampler through drill re-lays and the playground clear, so
     * game.record alone cannot tell the two apart). */
    settledRecord: () => lastRecord,
    /** True once the ruleset registry module is live (feature-detected). */
    ready: () => rules !== null,
    /** hudState projection of the current match fold (ruleset-api.md).
     * Issue #68: null while the playground sandbox is active — the fold is
     * suspended, so every discipline scoreboard/chip/decision prompt hides
     * through the existing null-handling (aim.js hud.setMatch(null) per
     * frame; zero hud.js edits). Codec v6: a shared replay of a playground
     * session projects null the same way — the sender's screen carried no
     * scoreboard and the suppressed fold never advances. */
    matchState: () => {
      if (playgroundActive() && !replayLocked()) return null;
      if (replayLocked() && ctx.replaySenderMode?.() === 'playground') {
        return null;
      }
      if (!match.ruleset || !match.state) return null;
      try {
        const hud = match.ruleset.hudState(match.state);
        // GH-382 (snooker-v2): merge the adapter-side address facts —
        // the touching-ball called set (Sec3 R8) and the live FREE BALL
        // call (Sec3 R12) — for the HUD chips / nomination affordance /
        // e2e introspection (presentation state; the crate facts they
        // echo are recomputed authoritatively by the judge)
        if (snookerV2Active()) {
          return {
            ...hud,
            touching: addressFacts?.touching ?? [],
            freeBall: !!(freeBallCall && match.state.freeBallEligible),
          };
        }
        // GH-491 (heyball): merge the adapter-side FROZEN-BALL address
        // fact (WPA Heyball I.5/II.15.2 announce — the snooker touching
        // precedent). Presentation-only: the judge re-derives the law
        // from the record's own address snapshot.
        if (heyballActive()) {
          return { ...hud, frozen: heyballFrozenSet(hud) };
        }
        return hud;
      } catch { return null; }
    },
    // ---- feature 022 additions ---------------------------------------------
    /** Active NON-default rules variant: {preset, taskHash} while the
     * artifact-backed variant engine judges this rack; null on the
     * default (frozen v1) path. The identity triple rides taskHash
     * (FR-008); e2e byte-comparisons key on it. */
    variant: () => (activeVariant ? { ...activeVariant } : null),
    /** GH-1043: the 8-ball family's call regime for the call surfaces —
     * {callShot: 'full'|'eight_only'|'none', safetyCall} read from the
     * fold's variant config (the shot gate's own source, v1 = full with a
     * safety); null outside the 8-ball family or with no fold. */
    callRegime: () => {
      if (!eightActive() || !match.state) return null;
      const cfg = match.state.variant?.config;
      return {
        callShot: cfg?.call_shot ?? 'full',
        safetyCall: cfg?.safety_call ?? true,
      };
    },
    /** Raw judgment of the last settled shot as CANONICAL JSON text —
     * the SC-006 byte-comparison surface (JSON.stringify of the parsed
     * crate bytes, the legacy-corpus precedent serialization). */
    judgmentJson: () => (lastJudgment ? JSON.stringify(lastJudgment) : null),
    // ---- feature 025 bundle v2 additions (feature 025 (internal spec)
    // Amendment v2) — read seams for the diagnostic bundle. Both degrade,
    // never throw: bugreport.js wraps them in its best-effort sec() law.
    /** pool-rules artifact stamp (`rules_version()` via the backend glue
     * flow.js already initializes) — null while the backend loads and
     * forever on a stale/failed rules boot. */
    rulesVersion: () => rulesVersionStr,
    /** Per-shot judgment ledger (rolling, cap 128 = SCENARIO_LOG_CAP;
     * survives re-racks — every row is identified by its {rack, seed,
     * shot} triple, where rack is the session-monotonic fresh-table
     * ordinal that disambiguates same-seed re-racks; judge-broken shots
     * appear as {rack, seed, shot, judgeError} rows). Defensive deep
     * copies — entries are plain JSON data by construction. */
    judgments: () => judgmentLedger.map((e) => JSON.parse(JSON.stringify(e))),
    /** Kernel pocket list of the active rack (index = the u16 in
     * BallPocket events and the ShotCall.pocket wire). */
    pockets: () => (game.template?.system?.table?.pockets ?? []).map((p, i) => ({
      i, x: p.center?.x ?? p.x, y: p.center?.y ?? p.y, r: p.radius ?? p.r,
    })),
    /** Recorded calls/decisions this rack (share codec v4 calls axis). */
    callLog: () => match.log.map((e) => ({ ...e })),
    /** GH-982: the NEXT fresh fold starts a NEW match — breaker seat 1, no
     * carried snooker next-frame breaker — exactly a fresh entry's. The
     * mode-transition re-racks call it right before their re-rack (a drill
     * session's exit, the playground → play/practice leg): a same-discipline
     * re-rack otherwise keeps the abandoned rack's turn holder (the GH-460
     * seat law reseeds only on a discipline switch), and a practice run or a
     * sandbox shot could hand the fresh frame's break to P2. Refused under
     * the replay lock (the transport pins the wire's seat itself). */
    newMatch: () => {
      if (replayLocked()) return false;
      nextFrameBreaker = null;
      if (player !== 1) {
        player = 1;
        emitHook('playerChanged', { player });
      }
      return true;
    },
    /** review r2 (GH-980): re-fold the CURRENT laid-out table for the active
     * game WITHOUT moving a ball — the fresh-table fold a scripted layout
     * gets, re-run. A drill session's pin restore stages its game through
     * game.setGame, which resolves on a microtask (the games module), so a
     * foreign layout laid in the same task as the exit (the atelier Try it
     * comparison right after changeMode('playground')) folds under the
     * PINNED game; this brings its rules, fold and hud title in line with
     * the restored game. Refused under the replay lock and off a quiet
     * address stage. */
    refold: () => {
      if (replayLocked() || !machine.is('AIM', 'BALL_IN_HAND')) return false;
      resetMatch({ layout: true });
      renderText();
      return true;
    },
    /** Read-only: the live fold's ruleset id (null without a fold) — also
     * while the playground suspends the matchState projection. */
    foldRuleset: () => match.ruleset?.id ?? null,
    /** Select + re-rack the active game. Async; false when degraded. */
    setGame: async (id) => {
      const reg = await rulesReady;
      if (id !== 'nine_ball' && reg === null) return false;
      const ok = await game.setGame(id);
      if (ok) game.rerack(game.seed);
      return ok;
    },
    /** Nominate ball+pocket for the NEXT shot (WPA 4.6 via 1.7; feature
     * 025 extends the surface to 14.1's full call regime, 7.5 via 1.7 —
     * where the opening break MAY carry a call too, 7.3(b)). */
    call: (ball, pocket) => {
      if ((!eightActive() && !fourteenoneActive() && !tenballActive())
        || replayLocked()) {
        return false;
      }
      const s = match.state;
      if (!s || s.phase === 'over') return false;
      if (s.phase === 'break' && !fourteenoneActive()) return false; // 4.3(a);
      // 026: the 10-ball break is never called (WPA 6.5)
      if (s.pendingDecision !== null) return false;
      if (!Number.isInteger(ball) || !Number.isInteger(pocket)
        || pocket < 0 || !s.onTable.includes(ball)) return false;
      match.pendingCall = { kind: 'call', ball, pocket };
      emitHook('pocketCalled', { player, ball, pocket });
      hud.setHint(''); // the call-required blocker just resolved
      return true;
    },
    /** Declare a safety for the NEXT shot (WPA 1.7 — turn ends; feature
     * 025: 14.1 safeties spot any pocketed ball, 7.5/7.6). */
    safety: () => {
      if ((!eightActive() && !fourteenoneActive() && !tenballActive())
        || replayLocked()) {
        return false;
      }
      const s = match.state;
      if (!s || s.phase === 'break' || s.phase === 'over') return false;
      if (s.pendingDecision !== null) return false;
      // 026: in 10-ball the 'safety' wire kind is the declared NO-CALL
      // stance (there is no safety call at 10-ball, WPA 6.5) — same
      // arming, same codec kind 1, judged as the uncalled stance
      match.pendingCall = { kind: 'safety' };
      emitHook('pocketCalled', { player, safety: true });
      hud.setHint(''); // the call-required blocker just resolved
      return true;
    },
    /** Declare the 10-ball push out for the NEXT shot (WPA 6.4 — only in
     * the window: the shot immediately after a foul-free break; feature
     * 026, GH-343). Wire calls-axis kind 4 ('push'). */
    pushOut: () => {
      if (!tenballActive() || replayLocked()) return false;
      const s = match.state;
      if (!s || s.phase !== 'pushout' || s.pendingDecision !== null) {
        return false;
      }
      match.pendingCall = { kind: 'push' };
      emitHook('pocketCalled', { player, push: true });
      hud.setHint(''); // the call-required blocker just resolved
      renderText();
      return true;
    },
    clearCall: () => {
      match.pendingCall = null;
      // issue #90 [minor]: the AIM state line derives the snooker target
      // from match.pendingCall (snookerBallOnLabel) — re-present so a
      // cleared nomination falls back to the generic colour label
      // immediately (renderText is idempotent per rendered text)
      renderText();
      return true;
    },
    /** The armed nomination for the next shot (HUD indicator source). */
    calledShot: () => (match.pendingCall ? { ...match.pendingCall } : null),
    /** Aim-lane nomination seam (T018 affordance → this adapter): arm or
     * clear the COMPOSED contract ShotCall for the next shot. Accepts
     * {kind:'call', ball, pocket} | {kind:'safety'} | null. */
    setCall: (c) => {
      if (c === null || c === undefined) return api.clearCall();
      if (c.kind === 'safety') return api.safety();
      if (c.kind === 'call') return api.call(c.ball, c.pocket);
      if (c.kind === 'nominate') return api.nominate(c.ball); // US2
      if (c.kind === 'push') return api.pushOut(); // 026 (WPA 6.4)
      return false;
    },
    // ---- feature 012 US2 (snooker story lane) -------------------------------
    /** Nominate a colour (16–21) for the NEXT snooker shot (WPBSA Sec3
     * R3(h); wire calls-axis kind 3). In the final phases the ball on is
     * FORCED — only that colour is accepted. */
    nominate: (ball) => {
      if (!snookerActive() || replayLocked()) return false;
      const s = match.state;
      if (!s || s.phase === 'over' || s.pendingDecision !== null) return false;
      // GH-382 (review r2): under a live FREE BALL in the reds phase the
      // nomination is OPTIONAL — tapping a RED withdraws an armed one
      // (back to the plain red shot; the reds ride the aim target set
      // as the revocation gesture)
      if (snookerV2Active() && s.phase === 'reds' && s.freeBallEligible
        && freeBallCall && Number.isInteger(ball) && ball >= 1
        && ball < SNOOKER_COLOUR_MIN && s.onTable.includes(ball)) {
        if (match.pendingCall?.freeBall === true) {
          match.pendingCall = null;
          emitHook('nominationWithdrawn', { player });
          renderText();
        }
        return true;
      }
      if (!Number.isInteger(ball) || ball < SNOOKER_COLOUR_MIN
        || ball > SNOOKER_COLOUR_MAX || !s.onTable.includes(ball)) return false;
      // GH-382 (snooker-v2): a live FREE BALL call (Sec3 R12 — the
      // mechanical right on the state AND the referee's geometric call)
      // lets the striker nominate a ball OTHER than the ball on; the
      // nomination rides the call wire flagged freeBall (codec b=1).
      let freeBall = false;
      if (s.phase === 'final_colours' || s.phase === 'respotted_black') {
        const colours = s.onTable.filter((id) => id >= SNOOKER_COLOUR_MIN);
        const on = s.phase === 'respotted_black' ? 21 : Math.min(...colours);
        if (ball !== on) {
          if (!(snookerV2Active() && s.phase === 'final_colours'
            && s.freeBallEligible && freeBallCall)) return false;
          freeBall = true;
        }
      } else if (s.phase === 'reds') {
        // red shots carry no nomination (Sec3 R3(g)) — EXCEPT the free
        // ball (Sec3 R12(a): nominate any ball as the ball on)
        if (!(snookerV2Active() && s.freeBallEligible && freeBallCall)) {
          return false;
        }
        freeBall = true;
      } else if (s.phase !== 'colour_after_red') {
        return false;
      }
      match.pendingCall = freeBall
        ? { kind: 'nominate', ball, freeBall: true }
        : { kind: 'nominate', ball };
      emitHook('colourNominated', { player, ball, freeBall });
      hud.setHint(''); // the nomination blocker just resolved
      // issue #90 [minor]: re-present the AIM state line NOW — it names
      // the ball on via snookerBallOnLabel (reads match.pendingCall), and
      // without this re-render the declared colour only surfaced after
      // the next stateChange (the owner aimed at a colour with no text
      // surface ever naming the armed nomination)
      renderText();
      return true;
    },
    /** TEST SEAM (headless e2e, feature 012 story-lane gates): activate the
     * snooker discipline AHEAD of the US4 readiness flip. The public
     * selector path (setGame) keeps refusing config_ready entries — the
     * catalog stays honest; this stages the game/ruleset directly and
     * re-racks on the kernel's snooker pairing. */
    activateSnooker: async (variantId) => {
      const reg = await rulesReady;
      if (reg === null || replayLocked()) return false;
      try { reg.getRuleset('snooker-v1'); } catch { return false; }
      game.gameId = 'snooker';
      game.rulesetId = 'snooker-v1';
      // GH-382 e2e seam growth: an explicit variant id (e.g.
      // 'wpbsa-snooker-full') pins the preset through the SAME
      // settings lane the picker uses — resetMatch resolves it against
      // the committed artifact's catalog on the rerack below
      if (variantId !== undefined) {
        ctx.settings?.changeVariant?.('snooker', variantId);
      }
      game.rerack(game.seed);
      // rebuild the VISUAL table to the rack's kernel pairing via the
      // equipment broadcast table.js listens on (same wire as the
      // __test.rerackKind probe and settings.js equipment switches)
      const eq = game.template?.system?.equipment;
      if (eq?.table_id && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ob:settings',
          { detail: { key: 'equipment', value: { ...eq } } }));
      }
      return true;
    },
    /** Resolve the pending rulebook option with `choice` (wire enums,
     * contracts/share-codec-v4.md). Two call shapes: decide(choice) — the
     * programmatic/e2e path; decide(kind, choice) — the HUD prompt (aim
     * lane) names the kind it answers, so a stale prompt cannot resolve a
     * DIFFERENT pending option. */
    decide: (a, b) => {
      const pend = pendingDecision();
      if (!pend || replayLocked()) return false;
      if (b !== undefined && a !== pend.kind) return false;
      return applyRulebookDecision(pend.kind, b === undefined ? a : b);
    },
    /** Hot-seat stalemate agreement (WPA 4.11 via 1.13; GH-491: heyball
     * II.21 rides the same programmatic surface — wire id 23, ORIGINAL
     * breaker re-breaks): both players confirmed in the UI — re-rack. */
    stalemate: () => {
      if (!(eightActive() || heyballActive()) || replayLocked()) return false;
      return applyRulebookDecision('stalemate', 1);
    },
    /** Active cue placement right ('anywhere' | 'kitchen'). */
    placementRight: () => placementRight,
    // ---- one-pocket api (feature 012 US1) ----------------------------------
    /** The WPA 12.3 default break-pocket choice for the live break
     * placement (1 left foot pocket | 2 right), or null off-discipline. */
    defaultBreakPocket: () => (onePocketActive() ? defaultBreakPocket() : null),
    /** Hot-seat stalemate + lag record (WPA 12.10): both players agreed
     * in the UI and lagged — `choice` (1 | 2) breaks the full re-rack;
     * tallies and owed markers carry over. */
    stalemateLag: (choice) => {
      if (!onePocketActive() || replayLocked()) return false;
      return applyRulebookDecision('stalemate_lag', choice);
    },
    /** TEST SEAM (headless e2e only): stage a discipline ruleset AHEAD of
     * the US4 catalog readiness flips (T048) — writes the game/ruleset ids
     * directly. The readiness-gated setGame() stays the only USER path;
     * the rack still composes from the entry's declared rack template. */
    setGameForTest: async (id, rulesetId) => {
      const reg = await rulesReady;
      if (reg === null) return false;
      game.gameId = id;
      game.rulesetId = rulesetId;
      game.rerack(game.seed);
      return true;
    },
    /** TEST SEAM (headless e2e only): drive the transient rejection hint —
     * e2e-ui --audit composes the real i18n hint text per locale and gates
     * the surface's geometry (no clipping in any of the 7 locales). */
    hint: (text) => { hud.setHint(text ?? ''); return true; },
    /** Fold-shaping seam: overwrite fields of the 8-ball or snooker match
     * fold so a scripted layout() scene can adopt any phase/groups/
     * onTable/scores. Consumers: the headless e2e suites (TEST SEAM,
     * original 012 brand) AND — sanctioned production consumption, issue
     * #80 (the ownership ledger drills ledger) — the drills runner, which shapes
     * a colours-only snooker scene to `final_colours` right after its own
     * game.layout() (drills.js shapeSnookerFold; resetMatch left the
     * fresh fold at initialState phase 'reds', where every stroke of a
     * reds-less scene would foul). Serializable data in, no hooks out
     * (player follows state.shooter). */
    setMatchState: (partial) => {
      // 012 US1/US2 (+025/026/GH-491): the seam serves the one-pocket,
      // snooker, 14.1, 10-ball and heyball scripted scenes too
      if (!(eightActive() || onePocketActive() || snookerActive()
        || fourteenoneActive() || tenballActive() || heyballActive())
        || !match.state) {
        return false;
      }
      match.state = {
        ...match.state,
        ...partial,
        ...(partial.groups !== undefined
          ? { groups: partial.groups === null ? null : { ...partial.groups } }
          : {}),
      };
      if (partial.shooter !== undefined) player = partial.shooter;
      // GH-382: a staged snooker-v2 scene changes what the referee's
      // address examination sees — re-run it (and re-pin the FREE BALL
      // call) so the chips/affordance reflect the staged table
      refreshSnookerAddressFacts({ pinFreeBall: true });
      renderText();
      return true;
    },
    /** TEST SEAM (headless e2e only): arm a ONE-SHOT judge fault — the
     * next registry adjudication throws inside the judge try, driving
     * the REAL catch path (reportError + the {rack, seed, shot,
     * judgeError} ledger row + the AIM routing that keeps the table
     * playable). e2e-bugreport gates the Amendment-v2 judge-broken
     * ledger row through it; registry path only (adjudicateLegacy has
     * no catch to exercise). Never fires on its own — the flag is null
     * until armed and consumed by the very next settled shot. */
    failNextJudge: (msg) => {
      judgeFaultMsg = String(msg ?? 'test-judge-fault');
      return true;
    },
  };
  // =========================================================================
  // ==== feature 012 US3 — carom three-cushion adapter section ==============
  // (discipline-keyed, additive; merge order US1→US2→US3 per tasks.md.
  // Rulebook: UMB World Rules of Carom Billiard, 1 Jan 1989.)
  // =========================================================================

  /** Start spot nearer to kernel x (UMB Art 23.1(c): left/right of the bottom
   * spot). Coordinates come from the registry module's layout re-export
   * (kernel mirror, drift-tested) — never re-derived here. */
  function caromStartSpotFor(x) {
    const layout = rules?.CAROM_LAYOUT;
    if (!layout) return null;
    return {
      x: x < 0 ? -layout.startOffsetX : layout.startOffsetX,
      y: layout.spots.bottom.y,
    };
  }

  /** GH-383: the CURRENT cue ball's spoken name for hints — ball 0 is
   * always the (plain) white; ball 1 follows the visual fork setting
   * (yellow default | dot-marked white per the UMB letter). */
  function caromCueBallName() {
    if ((game.cueBall()?.id ?? 0) === 0) return t('carom.ballName.white');
    // the PAINTED variant, not the raw setting (review r5: a mid-rack
    // settings flip defers the repaint to the next rack — the label must
    // describe the ball on the table); stale game.js → settings fallback
    const painted = game.caromSecondBallPainted
      ?? ctx.settings?.get?.()?.caromSecondBall;
    return painted === 'marked'
      ? t('carom.ballName.marked') : t('carom.ballName.yellow');
  }

  /** Adopt a still-pending break-spot option BEFORE judging (011 adapter
   * contract: judge is never called with a decision pending). The stroke
   * itself is the choice — the cue ball's recorded initial position IS the
   * physics truth (engine.ts caromStart: the break spot rides the share
   * placements axis), so replays and default-accepting strokes both
   * resolve to the position they actually fired from. Not a user decision:
   * no hooks, no annotation. */
  function caromPreJudge(record) {
    if (match.state?.pendingDecision?.kind !== 'break_spot') return;
    // GH-383: the ball whose recorded position IS the spot choice is the
    // STRUCK ball (the record's own Strike event — physics truth; the
    // opening break strikes ball 0, the Art 29.4 leveling stroke the
    // leveling seat's own ball).
    const struckId = record?.events?.[0]?.kind?.Strike?.ball ?? 0;
    const cue = record?.initial?.balls?.find((b) => b.id === struckId);
    const choice = (cue?.state?.pos?.x ?? 0) < 0 ? 1 : 2;
    try {
      match.state = match.ruleset.applyDecision(
        match.state, { decision: DECISION_IDS.break_spot, choice });
    } catch (e) {
      reportError('rules decision: ' + (e?.message ?? e));
    }
  }

  /** Carom presentation + hooks for one judgment: pointsScored on every
   * valid cannon (contracts/rulesets-012.md §7 hook), transient cited
   * hints for fouls and for the legal non-scoring reasons (Art 83
   * insufficient cushions / Art 24.5 miss — they ride the match state,
   * never Judgment.fouls; see carom3c.ts). The foul BANNER machinery is
   * the pool disciplines' BALL_IN_HAND surface — carom fouls route to AIM
   * (no placement right, Art 28), so the cited text uses the hint. */
  function caromPresentJudgment(j) {
    const s = j.next;
    // GH-383 (review r3): the Art 29.4 leveling transition is a SCORING
    // stroke whose visit still passes (the finisher's target point) —
    // without the phase arm the point advanced silently on the hook wire.
    // review r7: a SCORING stroke is `lastReason === null` — a legal
    // leveling MISS also terminates (the finisher wins), and the old
    // continue/terminal test would have announced that miss as a point.
    if (j.legal && s?.lastReason == null
      && (j.turn === 'continue' || j.terminal !== null
        || s?.phase === 'leveling_break')) {
      emitHook('pointsScored', {
        player,
        points: { ...s.points },
        cushions: s.cushionsThisShot,
        target: s.target,
      });
      // GH-458: "…; shoot again" is a CONTINUE instruction — a terminal
      // stroke (win OR the Art 29.4 draw) ends the match, and the leveling
      // transition hands the table to the leveling seat, so those announce
      // the point WITHOUT the continue tail (carom.pointFinal): the
      // WIN/DRAW banner or the leveling break address owns what happens
      // next. The old unconditional carom.point painted "shoot again"
      // under every terminal banner.
      // hasLocal-gated (review r1 P2, the GH-313 mixed-cache law): a stale
      // cached dictionary has no 'carom.pointFinal' — degrade to the
      // legacy carom.point copy, never a raw key.
      const continues = j.terminal === null && j.turn === 'continue'
        && s?.phase !== 'leveling_break';
      hud.setHint(t(continues
        || i18nNs.hasLocal?.('carom.pointFinal') !== true
        ? 'carom.point' : 'carom.pointFinal',
        { cushions: s.cushionsThisShot }));
    } else if (!j.legal) {
      // uiaudit F18: the foul list paints ALONE in the hint bar, so it opens
      // with a capital like every standalone hint; the foul.* titles stay
      // lowercase for the FOUL banner and the penalty chip, which compose
      // them mid-sentence.
      const fouls = j.fouls
        .map((f) => `${t(`foul.${f.code}`)} (${f.cite})`).join(', ');
      hud.setHint(fouls.charAt(0).toUpperCase() + fouls.slice(1));
    } else if (s.lastReason) {
      const r = s.lastReason;
      hud.setHint(
        `${t(`carom.reason.${r.code}`, { cushions: r.cushions ?? 0 })} (${r.cite})`);
    }
  }

  /** Return the judgment's balls concerned (jumped balls, Art 41.1) to
   * their UMB designated spots via the pure caromRespotPlan (red → top,
   * the INCOMING striker's ball → bottom start spot, the other → centre;
   * occupied → the occupier's spot, Art 27.3(b)/28.1(b)). GH-383 (audit
   * finding F5 resolved): Art 27.3(b)'s bottom spot belongs to "the
   * white ball of the player who wants to play" — the judgment's
   * `next.shooter` (the turn has already passed). The plan argument is
   * the seat-convention twin of that seat's BALL (ball 0 → 1, ball 1 →
   * 2 — respot.ts contract); under the v1 shared white the incoming
   * ball is always 0, reproducing the historical hardcoded `1`
   * byte-identically. Sphere-shadow uniforms re-sync immediately
   * through the game.syncShadows seam (issue GH-143 — the old "next
   * game-path sync" gap left stale contact shadows on the cloth). */
  function caromApplyRespots(j) {
    if (j.respot.length === 0) return;
    if (!rules?.caromRespotPlan || !rules?.CAROM_LAYOUT) return;
    const balls = [0, 1, 2].map((id) => {
      const b = game.ballSet.balls.find((x) => x.id === id);
      const k = b ? threePosToK(b.mesh.position) : { x: 0, y: 0 };
      return { x: k.x, y: k.y };
    });
    const incomingBall =
      caromSeatBall(j.next?.shooter ?? match.state?.shooter ?? 1);
    const plan = rules.caromRespotPlan(
      rules.CAROM_LAYOUT, balls, j.respot, incomingBall === 0 ? 1 : 2);
    for (const { ball, xy } of plan) {
      const b = game.ballSet.balls.find((x) => x.id === ball);
      if (!b) continue;
      b.pocketed = false;
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.sinkT = -1;
      kPosToThree(b.mesh.position, xy.x, xy.y, ballR());
    }
    // issue GH-143 (same defect family as the placeCue 'anywhere' branch):
    // respotted meshes must not strand their analytic shadows
    game.syncShadows?.();
    emitHook('respotApplied', {
      placements: plan.map((p) => ({ ball: p.ball, x: p.xy.x, y: p.xy.y })),
    });
  }

  /** Balls frozen to the striker's cue ball at address (UMB Art 27.1
   * detection — pure geometry via the registry helper; shared by the
   * __rules seam and the GH-371 demand-respot affordance). GH-383: the
   * detection runs against the CURRENT seat's cue ball (two-cue
   * assignment; ball 0 under the v1 shared white). */
  function caromFrozenSet() {
    if (!caromActive() || !rules?.caromBallsInContact) return [];
    const balls = game.activeBalls().map((b) => {
      const k = threePosToK(b.mesh.position);
      return { id: b.id, x: k.x, y: k.y };
    });
    return rules.caromBallsInContact(
      balls, game.cueBall()?.id ?? 0, ballR());
  }

  /** GH-383 (UMB Art 29.4): enter the equal-innings LEVELING inning —
   * reset the three balls to the initial starting position (Art 23.1:
   * red on the top spot, the FINISHER's white on the bottom spot, the
   * leveling seat's ball on a start spot — right by default, the
   * player's Art 23.1(c) choice pending) and run the fresh-break
   * address liturgy (BALL_IN_HAND with the carom_break clamp; the
   * stateChange handler surfaces the pending break_spot prompt). The
   * judged phase `leveling_break` is the signal; XY geometry stays
   * adapter-side (research R7). */
  function caromEnterLevelingBreak() {
    const layout = rules?.CAROM_LAYOUT;
    const seatBall = caromSeatBall(match.state?.shooter ?? 1);
    const otherWhite = seatBall === 0 ? 1 : 0;
    if (layout) {
      // the RESOLVED Art 23.1(c) choice wins (review r5: a replay return
      // after the decision rebuilt the address on the canonical right,
      // silently moving a chosen LEFT spot); unresolved defaults right
      const start = caromStartSpotFor(
        match.state?.pendingDecision == null
          && match.state?.breakSpot === 'left' ? -1 : 1);
      const place = [
        [2, layout.spots.top],
        [otherWhite, layout.spots.bottom],
        [seatBall, start ?? layout.spots.bottom],
      ];
      for (const [id, xy] of place) {
        const b = game.ballSet.balls.find((x) => x.id === id);
        if (!b) continue;
        b.pocketed = false;
        b.mesh.visible = true;
        b.mesh.scale.setScalar(1);
        b.sinkT = -1;
        kPosToThree(b.mesh.position, xy.x, xy.y, ballR());
      }
      game.syncShadows?.();
      emitHook('respotApplied', {
        placements: place.map(([id, xy]) => ({ ball: id, x: xy.x, y: xy.y })),
      });
    }
    hud.setHint(t('carom.levelingHint', {
      player: match.state?.shooter ?? 2,
      target: match.state?.target ?? 15,
    }));
    placementRight = 'carom_break';
    lastRouting = { state: 'BALL_IN_HAND', info: { caromBreak: true } };
    machine.to('BALL_IN_HAND', { caromBreak: true });
  }

  /** Resolve the carom break-spot option (wire decision 10, UMB Art 23.1(c)).
   * The CHOICE is applied as a cue-ball PLACEMENT on the chosen start spot
   * — it rides the share codec's placements axis when the break fires
   * (engine.ts caromStart doctrine), so no calls-axis annotation is
   * recorded; re-simulation needs the position, not the enum. */
  function applyCaromDecision(kind, choice) {
    // ---- GH-371: UMB Art 27.1(a) balls-in-contact demand-respot ------
    // A recorded request (wire decision 16, calls axis): the frozen set
    // and the respot XY re-derive deterministically from the live table
    // (caromBallsInContact + caromRespotPlan), so replays reproduce the
    // exact placement from the annotation alone.
    if (kind === 'contact_respot') {
      const frozen = caromFrozenSet();
      if (frozen.length === 0) return false; // precondition gone
      let resolved;
      try {
        resolved = match.ruleset.applyDecision(
          match.state, { decision: DECISION_IDS.contact_respot, choice });
      } catch (e) {
        reportError('rules decision: ' + (e?.message ?? e));
        return false;
      }
      match.state = resolved; // unchanged by contract — kept honest
      match.log.push({
        shot: game.shotIndex - 1, kind: 'decision',
        decision: DECISION_IDS.contact_respot, choice,
      });
      ctx.recordAnnotation?.({
        kind: 'decision', decision: DECISION_IDS.contact_respot, choice,
      });
      emitHook('decisionMade', { kind, choice, by: player });
      // Art 27.3(b): only the balls concerned respot — the STRIKER's cue
      // (per-seat under two-cue, GH-383) and its frozen partner(s),
      // through the caromRespotPlan machinery
      const cueId = game.cueBall()?.id ?? 0;
      caromApplyRespots({ respot: [cueId, ...frozen] });
      for (const id of [cueId, ...frozen]) {
        const b = game.ballSet.balls.find((x) => x.id === id);
        if (!b) continue;
        const k = threePosToK(b.mesh.position);
        pendingRulePlacements.push({ ball: id, x: k.x, y: k.y });
      }
      driveRulesAction(); // the precondition just self-consumed
      return true;
    }
    if (kind !== 'break_spot') return false;
    const wasPending = pendingDecision();
    let next;
    try {
      next = match.ruleset.applyDecision(
        match.state, { decision: DECISION_IDS.break_spot, choice });
    } catch (e) {
      reportError('rules decision: ' + (e?.message ?? e));
      return false;
    }
    match.state = next;
    hud.setHint(''); // the resolved option unblocks the stroke
    emitHook('decisionMade', {
      kind, choice, by: wasPending?.chooser ?? match.state.breaker,
    });
    const spot = caromStartSpotFor(choice === 1 ? -1 : 1);
    placementRight = 'carom_break';
    if (spot) game.placeCue(spot.x, spot.y);
    // (re-)enter BALL_IN_HAND so the Shoot gate re-evaluates with the
    // option cleared and the placement drag stays on the start spots
    lastRouting = { state: 'BALL_IN_HAND', info: { caromBreak: true } };
    machine.to('BALL_IN_HAND', { caromBreak: true });
    return true;
  }

  // break address routing: a fresh carom rack seats the breaker on a
  // BALL_IN_HAND restricted to the two start spots (UMB Art 23.1(c)), so the
  // live placement AND a shared replay's placements[0] flow through the
  // same clamp (fireShot applies recorded placements only in
  // BALL_IN_HAND). Staged on a macrotask — never re-route from inside the
  // rack's own stateChange dispatch; the share replay driver stages its
  // first fireShot at +30 ms, so this always lands first.
  //
  // GH-370 class 1 — the opening in-hand rights, generalized from the
  // carom precedent above: every POOL-family fresh rack at the break
  // grants the WPA in-hand-behind-the-head-string right (4.3(a)/5.3(a)/
  // 6.3(a)/7.3(a)/12.3 — the breaker places the cue anywhere in the
  // kitchen and keeps adjusting until the stroke, 1.6), and a fresh
  // snooker frame grants the WPBSA on-or-within-the-D right (Sec2
  // R9(a)(i) + Sec3 R5). The rack builder's fixed head-spot/D address
  // stays the INITIAL presentation the breaker then drags. Decision
  // re-racks (dry_break, re-breaks, stalemates) re-enter here through
  // their fresh AIM {seed}, so every re-break gets the same right.
  const POOL_OPENING = new Set(['nine_ball', 'eight_ball', 'ten_ball',
    'one_pocket', 'straight_pool',
    // GH-491: heyball breaks from in hand behind the head string too
    // (WPA Heyball II.6(b) — the same 1.6 grant grammar)
    'heyball']);
  machine.on('stateChange', (state, prev, info) => {
    if (state === 'BALL_IN_HAND' && (info?.caromBreak || info?.openingBreak)) {
      // the shared BALL_IN_HAND presentation arms the foul banner — the
      // break address is not a foul, drop it before it paints
      bannerKind = null;
      hud.setBanner('');
      renderText();
      // surface the pending break-spot/break-pocket option on the hook
      // wire (the HUD prompt itself renders from the hudState projection
      // via the aim lane; one-pocket's 12.3 default keys off the LIVE cue
      // side, so the prompt re-drives over the new placement state)
      const pend = pendingDecision();
      if (pend?.kind === 'break_spot') {
        emitHook('decisionRequired', { kind: pend.kind, chooser: pend.chooser });
      } else if (pend?.kind === 'break_pocket') {
        emitHook('decisionRequired', { kind: pend.kind, chooser: pend.chooser });
        driveBreakPocketPrompt();
      }
      return;
    }
    if (state !== 'AIM' || info?.seed === undefined) return;
    if (caromActive() && match.state?.phase === 'break') {
      setTimeout(() => {
        if (!caromActive() || match.state?.phase !== 'break') return;
        if (!machine.is('AIM') || lastRecord) return;
        placementRight = 'carom_break';
        lastRouting = { state: 'BALL_IN_HAND', info: { caromBreak: true } };
        machine.to('BALL_IN_HAND', { caromBreak: true });
      }, 0);
      return;
    }
    // ---- GH-370 pool/snooker opening grant ---------------------------------
    // Rules concept — the playground sandbox already has free placement
    // and suppresses rights (its wrap grants 'anywhere' regardless), and
    // a PLAYGROUND-SENDER replay must replay the sender's AIM opening
    // (review r2 P1: converting it had the recorder log a placements[0]
    // the sender never had, and the gen-2 re-share re-applied it through
    // the kitchen clamp OVER the sender's free moves — divergence).
    // Gated on game.gameId (review r1 P1): a persisted-game boot's rack
    // fires this AIM before the registry import resolves, and a
    // ruleset-id gate (snookerActive et al.) would silently skip the
    // opening grant on that boot.
    if (playgroundActive() && !replayLocked()) return;
    if (replayLocked() && ctx.replaySenderMode?.() === 'playground') return;
    if (!POOL_OPENING.has(game.gameId) && game.gameId !== 'snooker') return;
    // the fresh-table ordinal pins THIS rack: a drill's attempt layout (or
    // any scripted layout) between the arm and the macrotask bumps it and
    // the conversion aborts — drill scenes are the drill runner's to grant
    const armedOrdinal = rackOrdinal;
    setTimeout(() => {
      if (!machine.is('AIM') || lastRecord) return;
      if (rackOrdinal !== armedOrdinal || game.shotIndex !== 0) return;
      if (playgroundActive() && !replayLocked()) return;
      if (replayLocked() && ctx.replaySenderMode?.() === 'playground') return;
      const right = openingRightFor(); // phase-gated (registry folds)
      if (!right) return;
      placementRight = right;
      if (right === 'kitchen' && !replayLocked()) {
        // WPA 2.1/3.10 (class 2): the rack default sits centre-ON the
        // head string — re-seat strictly above through the exclusive
        // kitchen clamp. Replays skip the nudge: their cue position is
        // the sender's recorded truth (placements[0] or the exact rack
        // default), and re-simulation must stay byte-identical. The
        // snooker D default needs no nudge — the D is INCLUSIVE (Sec3
        // R5), so the rack's on-the-line address is already legal.
        const k = threePosToK(game.cueBall().mesh.position);
        game.placeCue(k.x, k.y);
      }
      lastRouting = { state: 'BALL_IN_HAND', info: { openingBreak: true } };
      machine.to('BALL_IN_HAND', { openingBreak: true });
    }, 0);
  });

  Object.assign(api, {
    /** TEST SEAM (feature 012 story lanes, headless e2e only): activate
     * the carom discipline AHEAD of its US4 catalog readiness flip
     * (research.md R12 — game.setGame stays the sole production entry and
     * keeps refusing config_ready entries). Stages gameId/rulesetId
     * directly, re-racks through the catalog rack template (kernel
     * 'carom' kind) and broadcasts the equipment so the scene builds the
     * pocketless table. */
    caromActivate: async (seed = 1) => {
      const reg = await rulesReady;
      if (!reg?.caromRuleset) return false;
      try {
        game.gameId = 'carom_3cushion';
        game.rulesetId = 'carom3c-v1';
        game.rerack(seed);
      } catch (e) {
        reportError('carom activate: ' + (e?.message ?? e));
        return false;
      }
      const eq = game.template?.system?.equipment;
      if (eq?.table_id) {
        window.dispatchEvent(new CustomEvent('ob:settings',
          { detail: { key: 'equipment', value: { ...eq } } }));
      }
      return true;
    },
    /** TEST SEAM (headless e2e only): shape the carom match fold for
     * scripted layout() scenes (the setMatchState analog; serializable
     * data in, player follows state.shooter). */
    caromSetMatchState: (partial) => {
      if (!caromActive() || !match.state) return false;
      match.state = {
        ...match.state,
        ...partial,
        ...(partial.points !== undefined
          ? { points: { ...partial.points } } : {}),
      };
      if (partial.shooter !== undefined) player = partial.shooter;
      caromSyncCueBall(); // GH-383: the shaped seat aims its OWN ball
      renderText();
      return true;
    },
    /** Balls frozen to the white at address (UMB Art 27.1 detection —
     * pure geometry via the registry helper; the play-away-or-respot
     * affordance surface). */
    caromContact: () => caromFrozenSet(),
  });

  // ==== end feature 012 US3 carom section ===================================

  // =========================================================================
  // ==== feature 025 — 14.1 continuous adapter section (issue #65) ==========
  // (discipline-keyed, additive. Rulebook: WPA Rules of Play, effective
  // 2025-09-15, Section 7 — 14.1 Continuous Pool.)
  // =========================================================================

  /** Execute a judged 7.2/7.8 re-rack plan IN PLACE: revive the pocketed
   * balls onto the ACTIVE rack template's lattice slots (partial: slots
   * 1..14 with the apex vacant, ids ascending; full: slots 0..14) via the
   * pure plan executor (rules/respot.ts fourteenOneRerackPlacements,
   * feature-detected on the dynamically-imported registry per the
   * cache-poison contract), then apply the judged 15th/cue placements
   * (head spot / center spot as concrete XYs; 'kitchen' rides the
   * judgment's ballInHand right instead; 'stays' touches nothing).
   *
   * Determinism (feature 025 (internal spec), recorded decision 3):
   * the template lattice — `game.template.system.balls` in ARRAY order,
   * apex first (the games/rack.ts slot law; positions used VERBATIM,
   * frozen contacts + seeded micro-gaps included) — is a pure function of
   * the rack seed, and the judged plan is a pure function of the record,
   * so a shared replay RE-DERIVES the identical table with zero new wire.
   * The next scenario builds from these mesh poses through game.js's
   * deterministic kernelPlacements() relaxation.
   *
   * Degraded fallback (stale registry module without the executor):
   * foot-spot respots keep the table playable — loudly, on the console
   * wire (a diverged share replay is preferable to a dead table; the
   * sender's build carried the executor). */
  function applyFourteenOneRerack(plan) {
    const slots = (game.template?.system?.balls ?? [])
      .filter((b) => b.id !== 0)
      .map((b) => ({ x: b.state.pos.x, y: b.state.pos.y }));
    if (typeof rules?.fourteenOneRerackPlacements !== 'function'
      || slots.length !== 15) {
      console.warn('[flow] fourteenone re-rack degraded — foot-spot respots');
      for (const id of match.state?.onTable ?? []) {
        if (game.ballSet.balls.find((b) => b.id === id)?.pocketed) {
          respotBall(id);
        }
      }
      return;
    }
    let placed;
    try {
      placed = rules.fourteenOneRerackPlacements(slots, table(), plan);
    } catch (e) {
      reportError('fourteenone rerack: ' + (e?.message ?? e));
      return;
    }
    for (const { ball: id, xy } of placed.balls) {
      const b = game.ballSet.balls.find((x) => x.id === id);
      if (!b) continue;
      b.pocketed = false;
      b.mesh.visible = true;
      b.mesh.scale.setScalar(1);
      b.sinkT = -1;
      kPosToThree(b.mesh.position, xy.x, xy.y, ballR());
    }
    if (typeof placed.cue === 'object' && placed.cue !== null) {
      // judged head/center-spot cue relocation (7.8 Table 1, rows where
      // only the cue interferes and the 15th sits behind the head string)
      const c = game.cueBall();
      c.pocketed = false;
      c.mesh.visible = true;
      c.mesh.scale.setScalar(1);
      c.sinkT = -1;
      kPosToThree(c.mesh.position, placed.cue.x, placed.cue.y, ballR());
    }
    game.syncShadows?.(); // analytic shadows track the moved meshes
    emitHook('rerackApplied', {
      kind: plan.kind,
      fifteenth: plan.fifteenth,
      fifteenthSpot: plan.fifteenthSpot,
      cueSpot: plan.cueSpot,
    });
  }

  // ==== end feature 025 fourteenone section ==================================

  // =========================================================================
  // ==== issue #68 — playground sandbox section ==============================
  // Mode taxonomy (settings.js DEFAULTS.mode): 'play' = everything above;
  // 'practice' = play semantics + the #66 drill layer (drills read the real
  // judgment — nothing here changes for them); 'playground' = free sandbox:
  //   * shots run the CANONICAL kernel (physics identical — the wrapped
  //     game.shoot only skips the RULES gates), judgment suppressed: the
  //     shotComplete gate above routes SETTLED→AIM synchronously with no
  //     foulCalled/gameWon/playerChanged, no turn switch, no match.log;
  //   * pocketed balls STAY pocketed until re-placed (recorded v1 choice:
  //     re-entry is via the Re-rack/Clear quick actions — no pocket tray);
  //   * the CUE respots on a scratch (recorded decision: a pocketed cue is
  //     not draggable — activeBalls() only — so leaving it down with no
  //     BALL_IN_HAND routing would soft-lock the sandbox);
  //   * free placement of EVERY ball (placeBall below — the aim.js/touch.js
  //     drag lanes route through window.__playground), single-slot undo;
  //   * SHAREABLE since codec v6 (issue #68 follow-up): every COMMITTED
  //     placement notifies the share recorder exactly once
  //     (ctx.recordFreePlacement — drag commit at gesture end OR at shot
  //     fire when a stroke lands mid-gesture, direct seam placement, undo
  //     restore; the moves axis) and the sender-mode flag
  //     rides the wire, so replays suppress judgment like the sender did.
  //     Clear-table sessions remain UNFAITHFUL (ball removal is not a
  //     placement event — recorded follow-up); the interactive primitives
  //     below stay gated off during shared replays (the replay lane
  //     applies placements through ctx.applyReplayPlacement instead).
  // =========================================================================

  /** One settled sandbox shot: no judgment, no hooks, straight back to AIM
   * (SETTLED stays transient — the ownership ledger state-machine contract). The
   * console mirror is the e2e wire (state.js EVENTS is frozen). */
  function settlePlayground(outcome) {
    console.log(`[flow] playgroundSettle ${JSON.stringify({
      scratch: !!outcome.scratch, pocketed: outcome.pocketed })}`);
    if (game.cueBall().pocketed) game.respotCue();
    const info = { ...outcome, player, playground: true };
    lastRouting = { state: 'AIM', info };
    machine.to('AIM', info);
  }

  // ---- free placement primitive (all balls, cue included) -------------------
  // The cue-ball drag conventions generalized: bed clamp (clampToBed),
  // overlap refusal at 2r + clearance (placementFits — the SAME 1e-4 law as
  // game.placeCue / the kernelPlacements EPS_KISS lineage, #44/#67), and a
  // NUDGE: a drop onto overlap projects to the nearest legal spot around
  // the blocking ball instead of silently failing (the visible snap IS the
  // cue on desktop; the touch ghost tints on refusal). Mesh move + shadow
  // re-sync ride the sanctioned respotBall anatomy — zero game.js edits.
  let undoSlot = null;    // { id, from: {x, y} } — LAST committed placement
  let pendingGrab = null; // armed at drag start, committed on first success
  // ---- share-recorder commit tracking (codec v6, issue #68 follow-up) ----
  // A DRAG is one commit: pgPlaceBall runs per pointermove, so in-bracket
  // successes only track the latest landing (dragLast) and the gesture end
  // (pgEndDrag) notifies the recorder once with the FINAL point. Every
  // out-of-bracket success (direct seam placement) notifies immediately.
  // ctx.recordFreePlacement is the share.js seam (feature-detected;
  // shotIndex derived there). The recorder bracket keys on gestureBall —
  // NOT dragId (the GH-140 guide bracket): mid-gesture chip actions
  // (pgUndo/pgClear) null dragId, and keying the track-vs-commit split on
  // it flipped the REST of a live drag onto the immediate path — one wire
  // event PER POINTERMOVE (share-fidelity review F5). Only the true input
  // gesture boundary (pgBeginDrag..pgEndDrag) moves gestureBall.
  let dragMoved = false;   // an in-bracket placement succeeded
  let dragLast = null;     // { x, y } — latest in-bracket landing point
  let gestureBall = null;  // ball id of the live INPUT gesture

  /** Commit a live gesture's pending landing to the recorder (exactly-once:
   * resets the trackers). No-op without a pending in-bracket success. */
  function flushDragCommit() {
    if (gestureBall !== null && dragMoved && dragLast) {
      ctx.recordFreePlacement?.({
        ball: gestureBall, x: dragLast.x, y: dragLast.y,
      });
    }
    dragMoved = false;
    dragLast = null;
  }

  // A shot FIRED mid-gesture bakes the dragged mesh position into its
  // scenario (game.js kernelPlacements snapshots live meshes), so the
  // pending landing must hit the wire BEFORE the shot's index advances —
  // otherwise a lift after settle records a mis-tagged phantom event and
  // the replay forks at this shot (share-fidelity review F4; touch.js's
  // #69 straddle handler reaches the same flush through pgEndDrag, and
  // this edge covers the desktop/keyboard lanes it cannot). shotComplete
  // (where share.js advances log.shots) fires at settle, long after this
  // synchronous edge, so the flush tags the shot it truly precedes.
  machine.on('stateChange', (state) => {
    if (state === 'SIMULATING') flushDragCommit();
  });

  // ---- issue GH-140: snap-to-grid placement aid --------------------------------
  // Half-diamond lattice over the playfield: 16 cells along the long axis ×
  // 8 across (0.5-diamond pitch both ways), derived LIVE from the kernel
  // table truth (table() — 12-ft snooker / carom dims re-derive on their
  // own). Placement UI GEOMETRY only, no physics (constitution P-II): with
  // the toggle on, the REQUESTED point moves to the nearest lattice node
  // BEFORE the unchanged clampToBed + placementFits + nudgeToLegal law in
  // pgPlaceBall — the kernel re-validates every placement at simulate time
  // exactly as before. Default OFF (settings.js DEFAULTS.snapGrid): every
  // pre-GH-140 placement path is byte-identical until the chip flips it.
  let snapOn = null; // cached values.snapGrid (null = unseeded — the #88
  // allocation norm: ctx.settings.get() clones the whole values blob and
  // pgPlaceBall runs per pointermove; the cache refreshes on every
  // ob:settings broadcast below and seeds once on first use)
  const snapEnabled = () => {
    if (snapOn === null) {
      const s = ctx.settings?.get?.();
      if (s) snapOn = s.snapGrid === true;
    }
    return snapOn === true;
  };
  // transient guide state (issue GH-140): non-null ONLY while a live snapped
  // drag is placing in the sandbox — aim.js paints the lattice overlay from
  // it per frame through the window seam below (feature-detected BOTH ways:
  // a stale flow.js keeps the overlay permanently hidden, a stale aim.js
  // snaps with no guides — cache-poison safe). Cleared at every gesture /
  // undo / clear / rerack / mode boundary so the overlay never outlives the
  // interaction (the "transient, no permanent overlay" issue requirement).
  let snapGuide = null; // { id, x, y } — the ACTIVE snapped lattice node
  let dragId = null;    // ball id of the live grab (pgBeginDrag..pgEndDrag)
  window.addEventListener('ob:settings', (e) => {
    if (!e?.detail?.all) return;
    snapOn = e.detail.all.snapGrid === true;
    if (!snapOn) { snapGuide = null; } // toggle-off mid-drag drops the guide
  });
  /** Nearest half-diamond lattice node for a requested kernel point — pure
   * grid rounding. Rail-adjacent nodes still pass through clampToBed, so an
   * edge node lands pulled in by r + 1e-4 on that axis (recorded: "clamp to
   * the bed as today", issue GH-140). */
  function snapToLattice(tb, x, y) {
    const px = tb.width / 8, py = tb.length / 16; // 0.5-diamond pitch
    return {
      x: Math.max(-tb.width / 2, Math.min(tb.width / 2, Math.round(x / px) * px)),
      y: Math.max(-tb.length / 2, Math.min(tb.length / 2, Math.round(y / py) * py)),
    };
  }

  /** Nearest legal spot for a blocked request: push away from the nearest
   * overlapping ball to contact distance, walking around it when the
   * radial spot is blocked too. Deterministic (fixed angle order). */
  function nudgeToLegal(p, obs, tb, r) {
    let near = null, nd = Infinity;
    for (const o of obs) {
      const d = Math.hypot(o.x - p.x, o.y - p.y);
      if (d < nd) { nd = d; near = o; }
    }
    if (!near) return null;
    const base = nd > 1e-9
      ? Math.atan2(p.y - near.y, p.x - near.x) : 0;
    const reach = 2 * r + 2e-4; // just past the placementFits clearance
    for (const off of [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]) {
      const a = base + off * Math.PI / 180;
      const cand = clampToBed(tb, r, {
        x: near.x + Math.cos(a) * reach, y: near.y + Math.sin(a) * reach,
      });
      if (placementFits(tb, r, cand, obs)) return cand;
    }
    return null;
  }

  /** Place ball `id` at kernel (kx, ky) — playground + aiming states only.
   * Returns true when the ball landed (possibly nudged), false otherwise.
   * `opts.snap === false` is the MODULE-INTERNAL exact-placement escape
   * (GH-140 review): restores that must reproduce a recorded point (pgUndo)
   * bypass the lattice; the window seam below strips opts, so every
   * external lane keeps following the toggle. */
  function pgPlaceBall(id, kx, ky, opts) {
    if (!playgroundActive() || replayLocked()) return false;
    if (!machine.is('AIM', 'BALL_IN_HAND')) return false;
    const tb = table(), r = ballR();
    const ball = game.ballSet.balls.find((b) => b.id === id);
    if (!ball || ball.pocketed) return false;
    // issue GH-140: the ONE snap insertion seam — both input lanes (aim.js
    // desktop move() and touch.js placeAt) commit through this point. With
    // the aid on, the request moves to the nearest lattice node; the bed
    // clamp + occupied-spot law below stays byte-identical either way.
    const snapped = opts?.snap !== false && snapEnabled()
      ? snapToLattice(tb, kx, ky) : null;
    let p = clampToBed(tb, r, snapped ?? { x: kx, y: ky });
    const obs = obstacles(id);
    if (!placementFits(tb, r, p, obs)) {
      p = nudgeToLegal(p, obs, tb, r);
      if (!p) return false;
    }
    p = snapOutOfPockets(tb, p); // GH-595: playground seats stay off the discs
    // GH-595 (review r2 P2): re-run overlap resolution after the pocket snap,
    // then re-clear the discs (the snap can push onto a rim-adjacent ball).
    if (!placementFits(tb, r, p, obs)) {
      p = nudgeToLegal(p, obs, tb, r);
      if (!p) return false;
      p = snapOutOfPockets(tb, p);
      // GH-595 (review r3 P2 / r4 P1): reject only a GENUINE kernel overlap the
      // pocket push could re-introduce — the kiss-band rule (2r - Eps::KISS),
      // never placementFits' stricter live clearance (a legal nudge/contact
      // seat must survive verbatim).
      if (!obs.every((o) => Math.hypot(o.x - p.x, o.y - p.y) >= 2 * r - 1e-6)) {
        return false;
      }
    }
    kPosToThree(ball.mesh.position, p.x, p.y, r);
    game.syncShadows?.();
    // guide arms only inside a live grab bracket (never on scripted/undo
    // placements) and pins the SNAP TARGET node — a rail-clamped or nudged
    // landing keeps the crosshair on the node the drop aimed at
    if (snapped && dragId === id) snapGuide = { id, x: snapped.x, y: snapped.y };
    if (pendingGrab?.id === id) { undoSlot = pendingGrab; pendingGrab = null; }
    // codec v6 recorder commit points: inside the live gesture bracket
    // only TRACK the landing (flushDragCommit notifies once — at gesture
    // end or at shot fire); any other success IS a commit — the direct
    // seam lanes (e2e, settings quick actions) and pgUndo's restore of a
    // ball OUTSIDE the live gesture (a restore of the gesture ball itself
    // stays tracked; pgUndo flushes first, so nothing is lost). The
    // recorded point is the FINAL landing p (post clamp/snap/nudge).
    if (gestureBall === id) {
      dragMoved = true;
      dragLast = { x: p.x, y: p.y };
    } else {
      ctx.recordFreePlacement?.({ ball: id, x: p.x, y: p.y });
    }
    renderModeChips(); // undo becomes available
    return true;
  }

  /** Arm the undo snapshot for a starting drag (aim.js/touch.js call this
   * at grab time; the first successful placement commits it). */
  function pgBeginDrag(id) {
    if (!playgroundActive() || replayLocked()) return;
    const ball = game.ballSet.balls.find((b) => b.id === id);
    if (!ball || ball.pocketed) return;
    flushDragCommit(); // codec v6, stale-leaf defense: a prior gesture
    // that never saw endDrag still commits its landing before the fresh
    // bracket starts tracking (a raw reset here would silently DROP it)
    const k = threePosToK(ball.mesh.position);
    pendingGrab = { id, from: { x: k.x, y: k.y } };
    dragId = id; // issue GH-140: snap guides live only inside this bracket
    gestureBall = id; // codec v6: the recorder bracket opens
  }

  /** Disarm an uncommitted grab at gesture end (review F3): aim.js/touch.js
   * call this where their own latches null. A drag that ended WITHOUT a
   * successful placement used to leave pendingGrab armed, so a later
   * pgUndo's restoring placeBall re-committed the aborted drag's origin
   * into undoSlot — undo became redo. Codec v6: a drag that DID place is
   * one committed placement — flushDragCommit notifies the share recorder
   * exactly once with the final landing point (aborted drags notify
   * nothing; a mid-gesture shot already flushed on the SIMULATING edge,
   * so a lift after settle finds the trackers clean). */
  function pgEndDrag() {
    flushDragCommit();
    pendingGrab = null;
    dragId = null;      // issue GH-140: the drop/cancel edge — guides go away
    gestureBall = null; // codec v6: the recorder bracket closes
    snapGuide = null;   // (aim.js hides the overlay on the next frame)
  }

  /** Single-slot undo (v1): restore the last placed ball to where the drag
   * picked it up — through the same overlap law (a now-occupied origin
   * nudges; a fully blocked one refuses with a hint, keeping the slot).
   * The restore is EXACT even with the GH-140 snap aid on (`snap: false`
   * escape — GH-140 review): the slot records the TRUE pick-up origin, and
   * rack/respot origins are never on-lattice, so a snapped restore would
   * park up to ~half a cell away and could compound through nudgeToLegal. */
  function pgUndo() {
    if (!playgroundActive() || replayLocked() || !undoSlot) return false;
    const { id, from } = undoSlot;
    undoSlot = null; // placeBall must not re-commit the pending grab
    pendingGrab = null; // defense in depth (review F3): even with a stale
    // input leaf that never calls endDrag, the restoring placement below
    // must not commit an aborted drag's snapshot back into the slot
    dragId = null;    // issue GH-140, same defense: a stale leaf's leftover
    snapGuide = null; // grab must not pin a guide onto the undo placement
    flushDragCommit(); // codec v6: a LIVE gesture's pending landing commits
    // before the restore (gestureBall stays set — the bracket survives, so
    // the drag's remaining pointermoves keep TRACKING instead of flooding
    // the wire per-move; review F5). The restore itself commits through
    // pgPlaceBall: immediately when it lands outside the live bracket,
    // tracked to gesture end when it restores the gesture ball itself.
    if (pgPlaceBall(id, from.x, from.y, { snap: false })) {
      renderModeChips(); return true;
    }
    undoSlot = { id, from };
    hud.setHint(t('playground.undoBlocked'));
    return false;
  }

  /** Clear table: cue alone on the head spot (game.layout — balls absent
   * from the spec list are pocketed/hidden, the scripted-capture law). */
  function pgClear() {
    if (!playgroundActive() || replayLocked()) return false;
    undoSlot = null;
    pendingGrab = null;
    dragId = null;
    snapGuide = null; // issue GH-140: a table reset ends any guide
    dragMoved = false; // codec v6: a table reset DROPS any pending commit
    dragLast = null;   // (the layout overwrites it and is itself off-wire —
    // the recorded Clear-table unfaithfulness); gestureBall SURVIVES, so a
    // still-live drag keeps tracking instead of flooding per-move (F5)
    game.layout([{ id: 0, x: 0, y: -table().length / 4 }]);
    return true;
  }

  /** Re-rack: the active game's full rack, same seed (still no judgment —
   * the mode stays playground until the selector leaves it). */
  function pgRerack() {
    if (!playgroundActive() || replayLocked()) return false;
    undoSlot = null;
    pendingGrab = null;
    dragId = null;
    snapGuide = null; // issue GH-140: a table reset ends any guide
    dragMoved = false; // codec v6: a table reset DROPS any pending commit
    dragLast = null;   // (same law as pgClear; gestureBall survives — F5)
    game.rerack(game.seed);
    return true;
  }

  // ---- mode indicator + sandbox quick actions (issue #68; GH-156 diet) ------
  // GH-156 (owner design mandate, chrome diet): the read-only mode
  // INDICATOR and the playground ACTION chips are two surfaces now.
  //   #ob-mode-ind — compact icon+label badge. Phone: joins the band-T
  //     CENTER status span (touch.css §3.11 — the GH-144 drill-strip
  //     precedent: pointer-inert #hud flow child, single row, strip-box
  //     crop; DOM-last so it is the FIRST chrome to yield to the crop).
  //     The pre-diet register — the badge leading a band-S strip at
  //     (54,60), floating directly below the help pill and over the felt —
  //     is RETIRED (the owner-flagged defect). Desktop: stays in the #hud
  //     panel flow (the panel IS the edge treatment).
  //   #ob-mode-chips — PLAYGROUND-ONLY action strip: four 44pt ICON chips
  //     (re-rack / clear / undo / snap — icons.js additive glyphs via
  //     guarded dynamic import; a stale icons.js keeps the pre-diet TEXT
  //     labels), each carrying its localized title + aria-label
  //     (the product charter: the SVG face is decorative — meaning lives on the
  //     control). Band-S geometry unchanged (touch.css §3.11); the
  //     fixed-width icon row never wraps, so the strip's worst felt
  //     shadow drops from 19.75% of the 667x375 viewport (537x92 de/ja)
  //     to a single 44px row. Practice reserves NO band-S row anymore.
  // Skin: ui/modes.css (LEAF sheet, ?v= cache-bust; --ob-* tokens only).
  const MODES_CSS_V = '5'; // 5: GH-156 — indicator/actions split + icon chips
  if (typeof document !== 'undefined'
    && !document.getElementById('ob-modes-css')) {
    const link = document.createElement('link');
    link.id = 'ob-modes-css';
    link.rel = 'stylesheet';
    link.href = new URL(`./ui/modes.css?v=${MODES_CSS_V}`, import.meta.url);
    document.head.appendChild(link);
  }
  const modeChips = document.createElement('div');
  modeChips.id = 'ob-mode-chips';
  const modeInd = document.createElement('span');
  modeInd.id = 'ob-mode-ind';
  modeInd.className = 'ob-badge ob-badge--accent';
  const rackAnchor = document.getElementById('rack');
  const hudHost = document.getElementById('hud');
  if (rackAnchor) {
    rackAnchor.insertAdjacentElement('afterend', modeChips);
  } else {
    (hudHost ?? document.body).append(modeChips);
  }
  // GH-156 review MAJOR (crop-order inversion): the indicator must be
  // genuinely DOM-LAST in the #hud band row. createHud boots BEFORE
  // createFlow (main.js order) and has already hung the #hud-match /
  // #hud-carom / #hud-fourteenone / #hud-snooker chip family afterend of
  // #rack — an afterend insert here would land the badge BEFORE the
  // game-state chips, and the band-T single-ended crop (touch.css §3.11
  // `safe center` + overflow: hidden) would drop rules truth before mode
  // context, inverting collapse rule 1 (chrome-diet SPEC §3). Appending to
  // #hud is the robust register: it is last regardless of how many chip
  // surfaces earlier boot stages anchored off #rack, and the later
  // drills.js strip also anchors afterend of #rack (order: -1 on phone),
  // so it can never fall behind the badge either.
  (hudHost ?? document.body).append(modeInd);
  let modeChipSig = '';
  let modeIndSig = '';

  // ui/icons.js — guarded dynamic import (#49 doctrine / boot-graph rule 5):
  // a stale or missing icons.js keeps the text registers; when the module
  // lands, the sigs reset so the next paint carries the SVG faces.
  let modeIcons = null;
  const MODE_ICONS = { practice: 'target', playground: 'move' };
  const MODE_ACTION_ICONS = {
    'ob-mode-rerack': 'rack', 'ob-mode-clear': 'clear',
    'ob-mode-undo': 'undo', 'ob-mode-snap': 'snap',
  };
  try {
    import('./ui/icons.js').then((m) => {
      modeIcons = m;
      modeChipSig = '';
      modeIndSig = '';
      renderModeChips();
    }).catch(() => { /* text registers stay */ });
  } catch { /* text registers stay */ }

  const modeBtn = (id, label, fn) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.className = 'ob-badge ob-mode-chip-btn';
    // GH-156: icon face when the glyph resolves (44pt square chip); the
    // localized label rides title + aria-label. Unknown/stale icon names
    // resolve null → the pre-diet TEXT chip register (labels wrap, the
    // §3.11 strip-h reservation still covers a wrapped strip).
    const face = modeIcons?.icon?.(MODE_ACTION_ICONS[id], { size: 20 }) ?? null;
    b.title = label;
    b.setAttribute('aria-label', label);
    if (face) {
      b.classList.add('ob-mode-chip-btn--icon');
      b.dataset.icon = MODE_ACTION_ICONS[id];
      b.appendChild(face);
    } else {
      b.textContent = label;
    }
    b.addEventListener('click', fn);
    return b;
  };

  function renderModeChips() {
    const m = ctx.settings?.get?.()?.mode ?? 'play';
    const indOn = m !== 'play' && !replayLocked();
    const on = m === 'playground' && !replayLocked();
    // review F2: exactly ONE re-rack affordance while the sandbox is live —
    // the chip strip owns sandbox actions, so the shipped HUD Re-rack
    // button hides in playground and restores on exit (and during shared
    // replays, which bypass the mode). SEED SEMANTICS (recorded): the chip
    // re-racks the SAME seed (game.seed — a reproducible sandbox rack);
    // the HUD button deals a NEW rack on seed+1 (hud.onRerack). Hiding
    // rides the modes.css `#rerack[hidden]` guard (the 024 F1 lesson:
    // author display rules must never defeat [hidden]).
    const hudRerack = document.getElementById('rerack');
    if (hudRerack) hudRerack.hidden = m === 'playground' && !replayLocked();
    // the read-only indicator (GH-156): decorative mode glyph + the short
    // settings.mode.* label — sig-latched like the strip so broadcast
    // storms never thrash the DOM
    modeInd.classList.toggle('on', indOn);
    if (!indOn) {
      modeInd.replaceChildren();
      modeIndSig = '';
    } else {
      const label = t(`settings.mode.${m}`);
      const iSig = m + '|' + label + '|' + !!modeIcons;
      if (iSig !== modeIndSig) {
        modeIndSig = iSig;
        const glyph = modeIcons?.icon?.(MODE_ICONS[m], { size: 14 }) ?? null;
        const text = document.createElement('span');
        text.textContent = label;
        modeInd.replaceChildren(...(glyph ? [glyph] : []), text);
      }
    }
    modeChips.classList.toggle('on', on);
    if (!on) {
      modeChips.replaceChildren();
      modeChipSig = '';
      return;
    }
    const nodes = [];
    nodes.push(modeBtn('ob-mode-rerack', t('hud.rerack'), () => pgRerack()));
    nodes.push(modeBtn('ob-mode-clear', t('playground.clear'), () => pgClear()));
    const undoBtn = modeBtn('ob-mode-undo', t('playground.undo'), () => pgUndo());
    undoBtn.disabled = !undoSlot;
    nodes.push(undoBtn);
    // issue GH-140: snap-to-grid toggle — a pressed-state chip (the
    // discoverable spot per the mode-chip conventions; recorded decision:
    // chips-row only, no settings pane row). The click routes through the
    // settings api so persistence + the ob:settings broadcast ride the
    // established conventions; the broadcast re-render below repaints the
    // register (aria-pressed joins the sig so the repaint actually takes).
    const snapBtn = modeBtn('ob-mode-snap', t('playground.snap'),
      () => ctx.settings?.set?.('snapGrid', !snapEnabled()));
    snapBtn.setAttribute('aria-pressed', String(snapEnabled()));
    nodes.push(snapBtn);
    // practice renders NO strip at all now (GH-156): the indicator above
    // carries the mode; the drill picker opener lives on the drills-owned
    // icon dock (#ob-drill-open, issue GH-120) and the band-T toolbar
    // pill; drills.js owns both.
    const sig = nodes.map((n) =>
      n.id + '|' + n.className + '|' + (n.dataset.icon ?? '') + '|'
      + n.textContent + '|' + n.title + '|' + !!n.disabled
      + '|' + (n.getAttribute('aria-pressed') ?? '')).join('¦');
    if (sig === modeChipSig) return;
    modeChipSig = sig;
    modeChips.replaceChildren(...nodes);
  }
  onLocaleChange(renderModeChips);

  // GH-994: EVERY fresh table empties the placement undo — a game switch
  // (settings changeGame), an equipment change, any foreign re-rack or
  // layout: the pgRerack law, run from flow's fresh-table branch.
  // Pre-fix only the sandbox's own Re-rack / Clear table and the mode edge
  // cleared it, so the chip stayed enabled on the next table and one click
  // pulled a ball of the fresh rack to the old table's coordinates.
  playgroundFreshTable = () => {
    undoSlot = null;
    pendingGrab = null;
    dragId = null;
    snapGuide = null;
    dragMoved = false; // a table reset DROPS any pending commit (pgRerack)
    dragLast = null;
    renderModeChips();
  };

  // mode switches re-present the standing state: the chip strip, the Shoot
  // gate (a pending decision no longer locks the sandbox stroke), the state
  // line, and any armed banner/hint (settings.js broadcasts 'mode' on every
  // change AND once at boot).
  window.addEventListener('ob:settings', (e) => {
    if (e?.detail?.key !== 'mode') return;
    undoSlot = null;
    pendingGrab = null;
    dragId = null;
    snapGuide = null; // issue GH-140: a mode edge ends any guide
    flushDragCommit(); // codec v6: a mode edge FLUSHES any pending commit —
    // the landing happened in the sandbox (the mesh sits there), so leaving
    // must record it, not drop it (gestureBall survives until the input
    // leaf's own endDrag; outside playground pgPlaceBall refuses anyway)
    renderModeChips();
    hud.setButtons({
      canShoot: machine.is('AIM', 'BALL_IN_HAND') && !replayLocked()
        && (pendingDecision() === null || playgroundActive()),
      canReplay: !!game.sampler && machine.state !== 'PLAYBACK'
        && !replayLocked(),
    });
    if (playgroundActive() && !replayLocked()) {
      // GH-1027: the sandbox drops the banter, never the WIN continuation —
      // during a WIN hold banterTimer IS the auto re-rack (the only way out
      // of WIN); clearing it left the machine stuck at "WIN — re-racking…"
      // with Shoot disabled. Kept, it re-racks into the sandbox as
      // renderText's WIN branch below assumes; any newer table (the Try it
      // layout, a playground exit's own rack) clears it at that
      // stateChange, so it can never land over a newer owner.
      if (!machine.is('WIN')) clearTimeout(banterTimer);
      bannerKind = null;
      hud.setBanner('');
      if (!keepCommitToast()) hud.setHint(''); // older hints are banter; this commit's own toast stays (KF-019)
      // GH-383 review r9 (P1): the sandbox has no seats — a carried-over
      // two-cue assignment (ball 1) would ride cue_ball onto playground
      // scenarios whose SHARES record no struck id (replays suppress
      // adjudication and would strike ball 0: deterministic divergence).
      // The sandbox always plays the classic cue.
      game.setCueBallId?.(0);
    } else if (!replayLocked()) {
      // leaving the sandbox: the suspended carom fold re-seats its shooter
      caromSyncCueBall();
    }
    renderText();
  });
  // replay entry/exit hides/restores the strip (replay routing bypasses the
  // mode; the strip must not suggest otherwise) — share.js broadcasts
  // equipment on both edges, and every broadcast lands here
  window.addEventListener('ob:settings', () => renderModeChips());

  // the ONE window seam (e2e + the settings quick-action rows)
  if (typeof window !== 'undefined') {
    window.__playground = {
      active: () => playgroundActive() && !replayLocked(),
      // opts-stripping wrapper (GH-140 review): the exact-placement escape is
      // MODULE-INTERNAL (pgUndo only) — every seam caller (aim.js/touch.js
      // input lanes, e2e, settings quick actions) follows the snap toggle
      placeBall: (id, kx, ky) => pgPlaceBall(id, kx, ky),
      beginDrag: pgBeginDrag,
      endDrag: pgEndDrag,
      undo: pgUndo,
      clear: pgClear,
      rerack: pgRerack,
      state: () => ({ undo: undoSlot ? { ...undoSlot } : null }),
      // issue GH-140 (ADDITIVE): the snap-to-grid aid — enabled truth, the
      // settings-routed toggle, the transient guide node (non-null only
      // during a live snapped drag in the sandbox; aim.js paints the
      // lattice overlay from it, feature-detected), and the live lattice
      // pitch (kernel table truth — the e2e exactness math reads it).
      snapEnabled,
      setSnap: (v) => { ctx.settings?.set?.('snapGrid', v === true); },
      snapGuide: () => (playgroundActive() && !replayLocked() && snapGuide
        ? { ...snapGuide } : null),
      snapPitch: () => {
        const tb = table();
        return { x: tb.width / 8, y: tb.length / 16 };
      },
    };
  }

  // ==== end issue #68 playground section =====================================

  if (typeof window !== 'undefined') window.__rules = api;
  return api;
}
