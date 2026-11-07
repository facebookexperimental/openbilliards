// Copyright (c) Meta Platforms, Inc. and affiliates.

// share.js — replay sharing. Records the running game (rack seed + ordered
// shot params + ball-in-hand cue placements), encodes it with the SDK codec
// (sdk/ts/src/share.ts) into a #r=… URL hash, and — when loaded WITH such a
// hash — enters REPLAY mode: deterministic shot-by-shot re-simulation on
// the same kernel (constitution P-III: a game = seed + shot list ⇒ exact
// reconstruction; records byte-match the originals), with play/pause,
// prev/next shot, 0.25× slow-mo (the existing playback path) and a
// shot n/N banner.
//
// Codec v4 (feature 011, contracts/share-codec-v4.md): the share carries
// the GAME AXIS — GameCatalog id + recorded calls/decisions — so an 8-ball
// replay reproduces every adjudication. This adapter derives gameId/
// rackKind/calls from the active game + match log on encode, and on replay
// routes the re-rack through the decoded game (transient game override,
// mirror of the sender-equipment override) and re-applies recorded
// decisions after the shots they follow. Legacy v1–v3 links decode as
// nine_ball with no calls (SDK codec) — zero prompts, byte-identical
// re-simulation (web/tools/fixtures/legacy-links.json gate).
//
// Codec v6 (issue #68 follow-up, contracts/share-codec.md Amendment v6):
// the share carries the PLAYGROUND AXES — the committed free-placement
// event log (any ball id, cue included; undo restores are just more
// committed events) and the sender-mode flag — so a playground session
// replays faithfully: shot i's placement events re-apply BEFORE shot i
// fires (through flow.js's non-interactive seam — the interactive
// primitive is gated off during replays) and rules judgment is suppressed
// exactly like the sender's session (flow.js reads ctx.replaySenderMode).
//
// Camera plan (GH-302, contracts/share-codec.md Amendment cp-v1): the
// GH-301 director-strip cameraPlan rides a SIBLING hash param —
// `#r=<v6>&cp=<blob>` — NOT an in-tuple v7 bump (carrier Option B): the
// `#r=` extractor below stops at `&`, so every existing build silently
// ignores `cp` and keeps PLAYING the replay with the default camera. An
// empty plan writes NO param (zero bytes over today). Encode pulls the
// LIVE session's plan from the DVR (`__playback.livePlan`, user state
// wins) or the decoded incoming plan (Continue-from-here inheritance);
// an over-envelope or codec-refused plan is DROPPED with a visible
// notice (share.copiedNoPlan / share.inAddressBarNoPlan — never a
// silently truncated plan). Decode is presentation-grade by law: a
// malformed/truncated/future-version blob is IGNORED with one console
// warn (the replay still plays), and the decoded plan seeds the DVR
// player of THE SESSION IT DESCRIBES once that session stages —
// CONTENT-ADDRESSED (playback.js matches the decoded shot params against
// the staged records byte-exactly, then applies through the setCutPlan
// validator — the GH-301 apply-time unknown-id degrade, never a boot
// error). Shared-replay passes are never archived (ARCHIVE-PHASE-A law),
// so the matching session exists exactly where the game was RECORDED:
// reopening one's own link restores the plan the in-memory camLatch
// lost across app sessions.
//
// Flow-adapter seams (feature 011; flow.js feature-detects each, and every
// one no-ops on a pre-011 flow.js): this module PUBLISHES on settings.ctx
//   ctx.recordAnnotation({kind:'call',ball,pocket} | {kind:'safety'} |
//     {kind:'decision',decision,choice})   — flow.js records rule inputs
//     (shotIndex is derived here; state.js EVENTS stays frozen so the
//     `[flow]` console hooks cannot be subscribed — this is the data path)
//   ctx.recordFreePlacement({ball,x,y})    — flow.js records one COMMITTED
//     playground placement (codec v6 moves axis; shotIndex derived here —
//     the placement precedes the next shot to fire)
//   ctx.replayCallFor(i) -> ShotCall|null  — the decoded call for replayed
//     shot i (flow.js judges replayed shots with the SENDER's calls)
//   ctx.replayShotIndex() -> number        — index of the replayed shot
//     currently firing/playing (-1 outside a replay pass)
//   ctx.replaySenderMode() -> 'play'|'playground'|null — the decoded
//     sender-mode flag while a shared replay runs (null outside one);
//     flow.js suppresses judgment for 'playground' exactly like the sender
// and CONSUMES (optional):
//   ctx.applyReplayDecision({decision,choice}) — flow.js applies a recorded
//     rulebook option to the active ruleset (may re-rack on the same seed).
//   ctx.applyReplayPlacement({ball,x,y}) — flow.js applies one recorded
//     free-placement event NON-interactively (exact mesh write + shadow
//     sync; the recorded point is the sender's committed legal landing).
//
// OWNERSHIP (see the ownership ledger (internal)): STREAM-C (share/sound/settings).
// Beyond the contract surface this file also uses game.{setPhi, placeCue,
// seek, paused} and toggles hud's #slowmo checkbox for the slow-mo control
// (both reported as stream deviations).
import {
  SHARE_FORMAT_VERSION, decodeShare, encodeShare, kernelGate,
} from '../dist/pool-sdk/share.js';
// feature 022 (codec v5): namespace alias of the SAME module for the NEW
// exports — accessed optional-chained (a heuristically-stale dist codec
// simply lacks them; a named import would be a module-graph cache poison,
// the ownership ledger rule 5).
import * as shareCodec from '../dist/pool-sdk/share.js';
// games LEAF module deep import (contracts/game-catalog.md placement rule).
// Cache-poison note (the ownership ledger): games/*.js are NEW files (no stale copy
// can exist) and the dist codec above already imports them on this graph.
import {
  DEFAULT_GAME, getGameEntry, resolveRackTemplate,
} from '../dist/pool-sdk/games/index.js';
import { kernel_version } from '../dist/pool-wasm/pool_wasm.js';
import { threePosToK } from './coords.js';
import { applyDom, onLocaleChange, t } from './i18n.js';
import { ctx } from './settings.js';

const SHOT_GAP_MS = 700;   // pause between replayed shots (outcome readable)

// GH-302: practical whole-URL envelope for share links (chars). The SDK
// codec owns the constant (SHARE_URL_ENVELOPE); the fallback covers a
// heuristically-stale dist codec (which also lacks the cp codec — the
// envelope is then never consulted). A plan that would push the link past
// it is DROPPED with a visible notice (honest degrade — never a silently
// truncated plan).
const URL_ENVELOPE_DEFAULT = 8192;

// #789: the SDK codec's equipment categories -> the settings predicate kinds
const REPLAY_EQUIPMENT_KIND = Object.freeze({
  tables: 'table', cloths: 'cloth', ballsets: 'ballset', cues: 'cue',
  cushion_models: 'cushion',
});

/** #789 (census E17, S2/S3): may this build replay the sender's `equipment`?
 * Routed through the settings api's equipment gate BEFORE
 * setTransientEquipment switches the scene, in the gate's verbatim mode (the
 * mode setTransientEquipment commits in). `api` is the settings api
 * (ctx.settings); its equipmentGate is feature-detected (a stale settings.js
 * has none: null, the pre-#789 path). A replay re-simulates on the sender's
 * ids: an id the loaded kernel lists plays as recorded, and anything else is
 * refused, never replaced by a twin. Returns null (replayable) or the
 * refusal reason. A gate that still degrades an axis (a settings.js without
 * the verbatim mode) would replay a twin, so a degraded axis refuses too. */
function replayEquipmentRefusal(api, equipment) {
  const gate = api?.equipmentGate;
  if (typeof gate !== 'function' || !equipment) return null;
  const g = gate(equipment, [], { verbatim: true });
  if (!g?.ok) return `${g?.axis} ${g?.id}: ${g?.reason}`;
  for (const [axis, d] of Object.entries(g.degraded ?? {})) return `${axis} ${d.saved}: ${d.reason}`;
  return null;
}

/** #789 (census E17.S1): a decode rejection that names an equipment id the
 * loaded SDK catalog lacks while the loaded kernel lists it — a stale cached
 * pool-sdk under a newer kernel, cured by a reload, not a bad link. `error`
 * is the codec's rejection (message `unknown equipment <category> id '<id>'`,
 * the shipped SDK wording); `api` the settings api, its equipmentSupported
 * feature-detected. Returns the reason, or null (a genuinely bad link). */
function staleCatalogRejection(api, error) {
  const supported = api?.equipmentSupported;
  if (typeof supported !== 'function') return null;
  const m = /unknown equipment (\w+) id '([^']*)'/.exec(String(error?.message ?? error ?? ''));
  const kind = m ? REPLAY_EQUIPMENT_KIND[m[1]] : undefined;
  if (!kind) return null;
  const v = supported(m[2], kind);
  return v?.verdict?.sdkCatalog === false && v.verdict.kernelIds === true ? v.reason : null;
}

export function createShare({ machine, game, hud }) {
  ctx.game = game;
  ctx.hud = hud;

  // UI kit (006-ui-modernization): DYNAMIC imports per the cache-poison
  // contract (contracts/ui-kit.md) — this module owns the #r= boot path, so
  // a stale/missing kit must degrade to unstyled-but-functional replay,
  // never a dead link. Handles stay nullable; helpers are only invoked from
  // event handlers / post-boot paths (motion.js is self-contained).
  let motion = null;
  let uiKit = null;
  let icons = null; // ui/icons.js (#49) — transport SVG faces; null keeps
                    // the text-glyph fallback register
  import('./ui/motion.js').then((m) => { motion = m; }).catch(() => {});
  import('./ui/controls.js').then((m) => { uiKit = m; }).catch(() => {});
  import('./ui/icons.js').then((m) => {
    icons = m;
    // retrofit sweep (review finding): if the replay banner was built
    // before the module resolved, upgrade its text-glyph faces in place.
    // button-scoped: icons.js stamps data-icon on the SVG face itself, so
    // an unscoped [data-icon] query would also visit already-swapped faces
    for (const b of document.querySelectorAll('#ob-replay button[data-icon]')) {
      const svg = icons.icon(b.dataset.icon, { size: 16 });
      if (svg) b.replaceChildren(svg);
    }
    // GH-156 (chrome diet, owner principle 2): the desktop toolbar pill is
    // a SECONDARY action → icon-only with the localized label on title +
    // aria-label (relabelShareBtn). A stale icons.js misses 'share' and
    // the pre-diet TEXT pill stays.
    const face = icons.icon?.('share');
    if (face) {
      shareBtn.classList.add('ob-tb-icon', 'ob-btn--icon');
      shareBtn.replaceChildren(face);
      relabelShareBtn();
    }
  }).catch(() => {});

  /** #49 icon system: set a transport button's face to the named SVG icon.
   * data-icon carries the face for drivers (e2e-touch S13 reads the
   * pause↔play swap); the text glyph remains the stale-cache fallback. */
  const setIcon = (btn, name, fallbackGlyph) => {
    if (!btn) return;
    btn.dataset.icon = name;
    const svg = icons?.icon(name, { size: 16 });
    if (svg) btn.replaceChildren(svg);
    else btn.textContent = fallbackGlyph;
  };

  // ---- game recorder: everything needed to rebuild this session ----------
  // calls: codec-v4 game axis — recorded rule inputs (called ball+pocket,
  // safety declarations, rulebook decision choices) in shot order.
  // variant: the session's PINNED rules-variant preset id (codec v5,
  // contracts/share-codec.md §3) — the id active at the session's first
  // rack; null = the family default (encodeShare writes it explicitly).
  // Mid-session picker changes apply at the next fresh rack and thus pin
  // the NEXT session — an in-flight recording is never rewritten.
  // moves: codec-v6 free-placement axis — every COMMITTED playground
  // placement event ({shotIndex, ball, x, y}, commit order; undo restores
  // are just more events). playground: the codec-v6 sender-mode latch —
  // pinned at the session's rack and LATCHED true by any playground shot
  // or committed placement (a mixed judged→sandbox session shares as
  // playground; the single-flag wire cannot split a session — Amendment
  // v6 recording rules).
  // startSeat: the codec-v7 breaker axis (GH-448) — the hotseat seat the
  // session's first rack folded on (flow.js initialState(breaker)),
  // pinned at the fresh rack like the variant. Replay re-racks pin it
  // from the DECODED wire (Continue-from-here re-shares must keep the
  // sender's breaker; the viewer's live seat is irrelevant to the
  // recorded session).
  const log = {
    seed: 1, shots: [], placements: {}, recordJsons: [], calls: [],
    variant: null, moves: [], playground: false, startSeat: 1,
    // design 277 slice 3 PR-2 (issue GH-283 decision 3): a MID-RACK cue
    // swap poisons the current rack's shareability — the codec pins ONE
    // equipment spec for the whole log, so shots straddling the swap
    // would re-simulate with the wrong cue end-mass on the viewer's
    // machine (determinism outranks the share affordance; review r2 P1).
    // Every OTHER equipment change still re-racks → resetLog clears this.
    cueSwapped: false,
  };
  // GH-302: the DECODED `cp` camera plan (the GH-301 integer model —
  // centisecond anchors, mm/dd poses) with its CONTENT ADDRESS — the
  // replay's RE-SIMULATED record JSONs, byte-identical to the author's
  // archived originals by the determinism law (P-III; filled per settle
  // while the replay runs). Record bytes carry EVERYTHING (initial
  // state, placements, equipment, events), so the DVR pull can never
  // land on a foreign session — same-seed same-params sessions with
  // different placements/moves/equipment do not byte-match (review
  // GH-302 r1 P2), and no seed arithmetic is needed across same-seed
  // rulebook re-racks (review GH-302 r1 P1). The envelope lives for the
  // page; `incomingLineage` additionally marks the CURRENT recorder log
  // as descending from the decoded replay — the ENCODE fallback's bound:
  // it survives the replay's own re-racks and Continue-from-here
  // (inherited anchors stay valid — shot indices unchanged; new shots
  // extend the last camera span) and clears on exit / the next fresh
  // rack.
  let incoming = null; // { records: [recordJson...], plan }
  let incomingLineage = false;
  // GH-302: did the LAST buildShareUrl drop an over-envelope/refused plan?
  // Read by the click handler's toast pick and by the DVR copy-link chip
  // (__share.planDropped) — the honest-degrade notice on every surface.
  let planDropped = false;
  // GH-302: whole-URL envelope; e2e red/green overrides it via
  // __share.envelope (the walkSpec noLock knob discipline — no production
  // caller passes a value).
  let urlEnvelope = shareCodec.SHARE_URL_ENVELOPE ?? URL_ENVELOPE_DEFAULT;
  let lastRecord = null; // in-app Replay re-emits shotComplete with the SAME
                         // record (flow.js contract) — never re-log it
  // A re-rack DECISION (dry break re-rack / re-break / stalemate) re-racks
  // on the SAME seed and the game log keeps accumulating across it (codec
  // v4: shot seeds continue as rackSeed*1000+shotIndex). This one-shot flag
  // marks the next AIM {seed} as that rulebook re-rack, not a fresh game.
  let expectDecisionRerack = false;
  // feature 022: a JUDGED rulebook re-rack (eightball-v2 APA re_break —
  // the judgment itself returns to the break phase, no decision recorded).
  // flow.js arms this one-shot seam right before its same-seed rerack; it
  // fires DURING the settle chain, before this recorder logs the settling
  // shot, so the AIM handler must keep the log even at shots.length 0.
  let expectRulesRerack = false;
  ctx.armRulesRerack = () => { expectRulesRerack = true; };

  function resetLog(seed) {
    log.seed = seed;
    log.shots = [];
    log.placements = {};
    log.recordJsons = [];
    log.calls = [];
    // pin the variant at the session's first rack (codec v5 §3): the
    // ACTIVE game's selection — transient during replay continuations, so
    // Continue-from-here shares stay pinned to the SENDER's rulebook
    log.variant = (() => {
      const gid = ctx.settings?.get?.().game;
      return gid ? (ctx.settings?.variantFor?.(gid) ?? null) : null;
    })();
    // codec v6: fresh moves axis + the sender-mode pin. During a replay's
    // own rerack the pin comes from the DECODED share (the viewer's
    // persisted mode is irrelevant to the sender's session — and Continue
    // -from-here re-shares must keep the sender's flag); live sessions pin
    // the active mode and latch on every shot/placement below.
    log.moves = [];
    log.playground = replay.active
      ? replay.shared?.mode === 'playground'
      : ctx.settings?.get?.()?.mode === 'playground';
    // codec v7 (GH-448): pin the rack's breaker seat. Replay re-racks pin
    // the DECODED breaker (the playground-flag discipline above; a stale
    // pre-v7 dist codec decodes no field → 1, the legacy fold seat);
    // live racks read the hotseat through the flow seam — gotoShot has
    // already pinned flow's hotseat to the same value during replays, so
    // the two sources can never disagree there. Mixed-cache truth (review
    // r2 P1): a stale flow.js publishes no ctx seam, but every shipped
    // flow.js exposes the PINNED e2e introspection wire __rules.player()
    // — the same module-level hotseat — so the recorded provenance stays
    // TRUE on any cache pairing instead of a silently-false seat-1 pin
    // (refusing to share would over-degrade: the seat is knowable).
    log.startSeat = replay.active
      ? (replay.shared?.breaker ?? 1)
      : (ctx.hotseatSeat?.() ?? window.__rules?.player?.() ?? 1);
    log.cueSwapped = false; // fresh rack, one cue again (PR-2 swap law)
    // seed the swap tracker here, NOT at module init (review r4 P1):
    // createShare runs before createSettings and boot never broadcasts
    // ob:settings, so an init-time read is null and the FIRST swap would
    // baseline instead of poisoning. Every rack reset re-reads the spec
    // the rack actually starts on.
    lastCueId = ctx.settings?.get?.().equipment?.cue_id ?? lastCueId;
    // GH-302: the ENCODE fallback's lineage bound — the replay's OWN
    // re-racks (gotoShot/start, replay.active) keep it; any fresh rack
    // beyond that lineage (post-Continue new game, WIN auto re-rack) is
    // a new session the plan does not describe. The content-addressed
    // envelope itself stays (the DVR pull cannot misapply it).
    if (!replay.active) incomingLineage = false;
    lastRecord = null;
    updateShareButton();
    // GH-225 Playback archive: publish the codec's session boundary on the
    // flow-adapter bus (the ctx.recordAnnotation seam shape) — resetLog IS
    // the recorder's session-split discrimination (seed-bearing fresh racks
    // reset; same-seed decision/rules re-racks above do NOT), so the
    // durable archive inherits it instead of re-deriving seeds. Inert
    // without the archive leaf (optional call, no behavior change here).
    ctx.archiveSessionReset?.({ seed });
  }

  /** Record one COMMITTED playground free placement (codec v6 moves axis).
   * Flow-adapter seam (ctx.recordFreePlacement) — flow.js calls it exactly
   * once per commit (drag commit, direct seam placement, undo restore),
   * with the FINAL landing point (post clamp/snap/nudge). shotIndex is
   * derived HERE: the placement precedes the NEXT shot to fire. Ignored
   * while a shared replay runs — replays re-log their DECODED moves
   * instead (fireShot), so Continue-from-here stays shareable. */
  function recordFreePlacement(p) {
    if (replay.active || !p) return false;
    if (!Number.isInteger(p.ball)
      || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
    log.moves.push({ shotIndex: log.shots.length, ball: p.ball, x: p.x, y: p.y });
    log.playground = true; // free placements exist only in the sandbox
    shareStateChanged(); // GH-710 review r3: the recorder log changed (moves + mode axes)
    return true;
  }
  ctx.recordFreePlacement = recordFreePlacement;

  /** Committed free placements still AWAITING their shot — the moves-axis
   * events tagged with the NEXT shot index, in commit order. flow.js's
   * routeReplay re-applies them after an in-app (HUD) Replay re-settle in
   * the playground: the replayed playback rewrites every mesh from the
   * LAST shot's sampler, wiping post-settle placements this recorder has
   * already asserted on the wire — without the restore the sender's next
   * stroke bakes a table the encoded axis contradicts and the shared
   * replay forks silently (WIRING re-review). */
  ctx.pendingFreePlacements = () => log.moves
    .filter((m) => m.shotIndex === log.shots.length)
    .map((m) => ({ ball: m.ball, x: m.x, y: m.y }));

  /** Record one rules annotation (codec v4 calls axis) onto the running
   * log. Flow-adapter seam (ctx.recordAnnotation) + e2e (__share.annotate).
   * shotIndex is derived HERE: a call/safety belongs to the NEXT shot to
   * fire; a decision applies after the LAST settled shot. Ignored while a
   * shared replay runs — replays re-log their DECODED calls instead (see
   * fireShot/onShotSettled), so Continue-from-here stays shareable. */
  function annotate(a) {
    if (replay.active || !a) return false;
    if (a.kind === 'call') {
      log.calls.push({
        shotIndex: log.shots.length, kind: 'call', ball: a.ball, pocket: a.pocket,
      });
    } else if (a.kind === 'safety') {
      log.calls.push({ shotIndex: log.shots.length, kind: 'safety' });
    } else if (a.kind === 'nominate') {
      // snooker colour nomination (feature 012 US2 — codec v4 calls-axis
      // kind 3, contracts/rulesets-012.md §3). GH-382: a free-ball
      // nomination (snooker-v2, WPBSA Sec3 R12) rides the b slot (=1).
      log.calls.push(a.freeBall === true
        ? { shotIndex: log.shots.length, kind: 'nominate', ball: a.ball,
          freeBall: true }
        : { shotIndex: log.shots.length, kind: 'nominate', ball: a.ball });
    } else if (a.kind === 'push') {
      // 10-ball push out (feature 026, GH-343 — codec calls-axis kind 4,
      // WPA 6.4). Without this branch a shared 10-ball push out would
      // drop the declared stance and the replay's judge would reject the
      // non-break shot for a missing call (the tenball-v1 6.5 gate).
      log.calls.push({ shotIndex: log.shots.length, kind: 'push' });
    } else if (a.kind === 'decision') {
      log.calls.push({
        shotIndex: Math.max(0, log.shots.length - 1), kind: 'decision',
        decision: a.decision, choice: a.choice,
      });
      expectDecisionRerack = true; // the choice may re-rack on the same seed
    } else {
      return false;
    }
    // GH-710 review r3 P2: the recorder log CHANGED — an own address-bar
    // link minted before this annotation encodes the pre-annotation game
    // (a resolved decision applies to the LAST settled shot and rides
    // buildShareUrl's calls axis at once; a call / safety / nomination /
    // push for the NEXT shot rides it the moment that shot fires). This
    // is the seam where log.calls grows: every accepted mutation of the
    // recorder log invalidates the own link (a no-op during replays).
    shareStateChanged(); // calls axis
    return true;
  }
  ctx.recordAnnotation = annotate;
  // GH-382 (review r5/r6 P1): this share.js carries the free-ball
  // nominate wire (b-slot) — flow.js requires the flag before
  // activating the snooker-v2 preset. DERIVED from the imported codec,
  // not declared: a cached pre-0.1.8 pool-sdk/share.js rejects the
  // full-preset id outright, so every Share would fail instead of the
  // session degrading to v1 (the GAME_VARIANTS probe is the codec's own
  // 0.1.8 signature — the same generation that encodes freeBall and
  // decision 17).
  ctx.shareCapabilities = { ...(ctx.shareCapabilities ?? {}),
    snookerV2: shareCodec?.GAME_VARIANTS?.snooker
      ?.includes?.('wpbsa-snooker-full') === true,
    // GH-491 (review r7 P2): the codec's own heyball signature — the
    // GAME_VARIANTS row joined at the same generation as the decision
    // 18-23 tables and the wpa-heyball variant. A cached pre-491 dist
    // codec has no row: flow's heyballChain requires this leg, so the
    // game is withheld rather than minting a Copy Link that throws on
    // every heyball rack (the snookerV2 recorder-leg precedent).
    heyball: Array.isArray(shareCodec?.GAME_VARIANTS?.heyball) };

  machine.on('stateChange', (next, prev, info) => {
    if (next === 'AIM' && info?.seed !== undefined) {
      if (expectRulesRerack && info.seed === log.seed) {
        // judged rulebook re-rack (022 eightball-v2 re_break): MID-GAME —
        // the log survives; the settling shot is logged right after this
        // dispatch by the shotComplete handler below
        expectRulesRerack = false;
        return;
      }
      if (expectDecisionRerack && info.seed === log.seed && log.shots.length) {
        // rulebook re-rack (recorded decision or its replay re-application):
        // the log survives — this is MID-GAME, not a fresh table
        expectDecisionRerack = false;
        if (replay.active) replay.expectRerack = false; // our own, consumed
        return;
      }
      expectDecisionRerack = false;
      expectRulesRerack = false;
      resetLog(info.seed);
      onRerack();
      shareStateChanged(); // GH-710: a new rack (mode / game switch too): seed, game/rackKind, variant, breaker
    } else if (next === 'SIMULATING' && prev === 'BALL_IN_HAND') {
      // the placement that matters is where the cue sits as the shot fires
      const p = threePosToK(game.cueBall().mesh.position);
      log.placements[log.shots.length] = { x: p.x, y: p.y };
      shareStateChanged(); // placements axis (the firing shot's cue-ball spot)
    }
  });

  machine.on('shotComplete', (record) => {
    // a recorded decision either re-racked before this shot or it didn't —
    // either way the one-shot flag must not leak past the next stroke
    expectDecisionRerack = false;
    if (record === lastRecord) {
      // in-app Replay of the last shot: replay-mode sequencing still needs
      // the settle callback, but the shot must NOT be logged twice (a
      // phantom duplicate would shift turn parity in the shared game)
      onShotSettled();
      return;
    }
    lastRecord = record;
    const { v0, phi, theta, a, b } = record.shot;
    log.shots.push({ v0, phi, theta, a, b });
    log.recordJsons.push(JSON.stringify(record));
    shareStateChanged(); // GH-710: the next live shot supersedes the link (shots axis)
    // GH-302: the decoded plan's content address = the re-simulated
    // record bytes of the replay pass (refreshed per settle; restarts
    // reset the log and re-fill it — the finished set is the whole game)
    if (replay.active && incoming) incoming.records = [...log.recordJsons];
    // codec v6 sender-mode latch: a shot settling under the sandbox marks
    // the session playground (replayed shots latch from the DECODED flag —
    // the viewer's own mode never colors a replay's Continue log)
    if (replay.active
      ? replay.shared?.mode === 'playground'
      : ctx.settings?.get?.()?.mode === 'playground') {
      log.playground = true;
    }
    updateShareButton();
    onShotSettled();
  });

  // GH-710 review r5 P2 — the ENCODED FIELDS and their producers. Every
  // producer calls shareStateChanged() (the one own-link seam below) the
  // moment it mutates; buildShareUrl() must never encode a field without a
  // row here:
  //   kernelVersion, formatV      constants (no producer)
  //   game, rackKind, seed,       resetLog on the rerack stateChange
  //   variant, breaker            (mode / game switches re-rack too)
  //   equipment                   the committed `ob:settings` equipment
  //                               listener (mid-rack cue swap; every other
  //                               equipment commit re-racks -> resetLog)
  //   shots                       machine 'shotComplete' (log.shots.push)
  //   placements                  the BALL_IN_HAND -> SIMULATING write
  //   calls                       annotate() (decision / call / safety /
  //                               nomination / push)
  //   moves, mode                 recordFreePlacement (playground latch);
  //                               the settle-time playground latch rides
  //                               the same shotComplete producer
  //   cp (camera plan)            playback.js planChanged() -> the
  //                               `ob:cameraplan` broadcast, content-
  //                               addressed against the mint-time plan
  async function buildShareUrl() {
    if (log.shots.length === 0) throw new Error(t('share.noShots'));
    // the mid-rack cue-swap poison guards EVERY entry point at the source
    // (review r5 P1): the toolbar button's disable is only chrome —
    // playback's current-session Copy Link and the __share.encode seam
    // land here too, and an encoded link would apply the ONE equipment
    // tuple's new cue to earlier shots (deterministic divergence).
    if (log.cueSwapped) throw new Error(t('share.cueSwapUnshareable'));
    // GH-491 review r9/r10 P2: a rules-refused rack is UNSHAREABLE at the
    // SOURCE (the cue-swap precedent above — the toolbar handler's check
    // alone missed playback's Copy Link through the __share.encode seam):
    // its strokes settled unjudged, so a link would replay under a judge
    // the sender never saw. English-by-convention diagnostics (the
    // reportError family).
    if (ctx.rulesSessionRefused?.() === true) {
      throw new Error(
        'this rack was not judged (rules chain refused) — re-rack first');
    }
    // v4 game axis: gameId is the ACTIVE game (settings-owned; the log is
    // reset on every rerack, so it matches the recorded shots), rackKind
    // derives from its catalog rack template — landmine R10 #3 (the old
    // rackKind:'nine' hardcode) retired. Defensive fallback to nine_ball
    // covers a stale settings.js without the game key.
    let gameId = ctx.settings.get().game ?? DEFAULT_GAME;
    let entry;
    try {
      entry = getGameEntry(gameId);
    } catch {
      gameId = DEFAULT_GAME;
      entry = getGameEntry(gameId);
    }
    const rackKind = resolveRackTemplate(entry.rack_template)?.kernel_kind ?? 'nine';
    const text = await encodeShare({
      kernelVersion: kernel_version(),
      formatV: SHARE_FORMAT_VERSION,
      rackKind,
      // full equipment composition (share v3): the viewer re-simulates on
      // the SENDER's equipment — settings.js always holds the active spec
      equipment: ctx.settings.get().equipment,
      seed: log.seed,
      shots: log.shots,
      placements: log.placements,
      game: gameId,
      // codec bounds: a call nominated for a shot that never fired is not
      // part of the game; nine_ball carries no calls by contract
      calls: gameId === 'nine_ball' ? []
        : log.calls.filter((c) => c.shotIndex < log.shots.length),
      // codec v5 (feature 022): the session-pinned variant id; null lets
      // the encoder write the family default EXPLICITLY (share-codec §1)
      variant: log.variant ?? undefined,
      // codec v6 (issue #68): the free-placement event log — a placement
      // that precedes a shot that never fired is not part of the game
      // (the calls-axis bound) — and the sender-mode flag
      moves: log.moves.filter((m) => m.shotIndex < log.shots.length),
      mode: log.playground ? 'playground' : 'play',
      // codec v7 (GH-448): the session's first-rack breaker seat — the
      // replay lane pins its match fold to it on every scrub pass. A
      // stale dist codec simply ignores the extra property (pre-v7
      // encodeShare spreads and never reads it).
      breaker: log.startSeat,
    });
    const base = shareBase(location.href); // GH-1023: never app://local
    const url = `${base}#r=${text}`;
    const cp = await encodePlanParam(url.length);
    return cp ? `${url}&cp=${cp}` : url;
  }

  /** GH-302: the session's camera plan for a share — the DVR's live-session
   * plan when any DVR user state exists (`__playback.livePlan`, feature-
   * detected; a deliberately EMPTIED plan counts as user state and encodes
   * nothing), else the decoded incoming plan (the Continue-from-here
   * inheritance ruling). null = no plan anywhere.
   *
   * Encode-side content gate (review GH-302 r1 P1): the archive session
   * the DVR plan indexes and THIS recorder log can be different sessions
   * — a play→playground mode switch SPLITS the archive while the log
   * deliberately retains one mixed session — and a plan whose seg indices
   * mean the archive's shots would put cameras on the WRONG shots of the
   * share. The plan therefore rides only when the live archive session's
   * record bytes EQUAL the log's (same objects, same JSON.stringify —
   * byte identity is exact); an unverifiable or mismatched pairing drops
   * to the lineage fallback / no plan (correct, since such a plan is
   * unrepresentable on this share's indices). */
  async function sessionCameraPlan() {
    const p = window.__playback?.livePlan?.();
    if (p) {
      try {
        const id = window.__archive?.current?.();
        if (id != null && typeof window.__archive?.records === 'function') {
          await window.__archive.flush?.();
          const recs = await window.__archive.records(id);
          if (Array.isArray(recs) && recs.length > 0
            && recs.length === log.recordJsons.length
            && recs.every((r, i) => r === log.recordJsons[i])) {
            return p;
          }
        }
      } catch { /* archive unavailable — refuse below, never a throw */ }
      // DVR user state EXISTS but cannot map onto this share's indices
      // (review GH-302 r2 P2): carrying the decoded incoming plan instead
      // would OVERRIDE the user's newer edit/emptying with the author's
      // stale cameras — user intent wins, the link ships plan-less.
      return null;
    }
    return incomingLineage ? incoming?.plan ?? null : null;
  }

  /** GH-302: encode the `cp` param blob for the current session, or null
   * when there is nothing to carry (EMPTY plan = no param at all — zero
   * bytes over today's link). Degrade law: a plan the codec refuses
   * (envelope violation — impossible from the validated model, kept as a
   * belt) or one that would push the URL past the envelope is DROPPED
   * (planDropped = the visible-notice latch), NEVER silently truncated;
   * the link still ships, plan-less. A stale dist codec simply lacks
   * encodeCameraPlan — no param, today's link exactly. */
  async function encodePlanParam(baseLen) {
    planDropped = false;
    const plan = await sessionCameraPlan();
    if (!plan || !((plan.cuts?.length ?? 0) || (plan.poses?.length ?? 0))) {
      return null;
    }
    try {
      const blob = await shareCodec.encodeCameraPlan?.(plan, log.shots.length);
      if (!blob) return null;
      if (baseLen + 4 + blob.length > urlEnvelope) { // 4 = '&cp='
        planDropped = true;
        console.warn(`[share] camera plan dropped: the link would be `
          + `${baseLen + 4 + blob.length} chars (envelope ${urlEnvelope})`);
        return null;
      }
      return blob;
    } catch (e) {
      planDropped = true;
      console.warn('[share] camera plan dropped: ' + (e?.message ?? e));
      return null;
    }
  }

  // ---- share button (own DOM) --------------------------------------------
  const shareBtn = document.createElement('button');
  shareBtn.id = 'ob-share';
  // GH-668 B-K16: the toolbar family voice (kit.css .ob-btn--glass +
  // .ob-toolbar-pill); --icon joins when the icons.js face resolves
  shareBtn.className = 'ob-btn ob-btn--glass ob-toolbar-pill';
  shareBtn.textContent = t('share.button');
  shareBtn.disabled = true;
  // GH-156: label/voice for both registers — the icon face (set in the
  // icons resolve above) keeps the localized label on title + aria-label;
  // the stale-cache text register keeps the visible label.
  const relabelShareBtn = () => {
    // state-aware title (review r6 P3): a locale switch while the mid-rack
    // cue-swap poison holds must re-localize the EXPLANATION, not clobber
    // it with the ordinary label
    shareBtn.title = log.cueSwapped
      ? t('share.cueSwapUnshareable') : t('share.button');
    shareBtn.setAttribute('aria-label', t('share.button'));
    if (!shareBtn.querySelector('svg')) shareBtn.textContent = t('share.button');
  };
  relabelShareBtn();
  const toast = document.createElement('div');
  toast.id = 'ob-share-toast';
  (() => {
    // insert sorted by toolbar order so TAB order matches the visual order
    // (CSS `order` alone reorders pixels, not focus — QA minor)
    const tb = document.getElementById('ob-toolbar');
    if (!tb) { document.body.appendChild(shareBtn); return; }
    shareBtn.dataset.tbOrder = '3';
    const next = [...tb.children].find((c) => +(c.dataset.tbOrder || 99) > 3);
    tb.insertBefore(shareBtn, next || null);
  })();
  document.body.appendChild(toast);
  let toastTimer = 0;
  function showToast(msg) {
    toast.textContent = msg;
    if (motion) motion.enter(toast, { display: 'block' });
    else toast.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (motion) motion.exit(toast); // resolves after display:none
      else toast.style.display = 'none';
    }, 3500);
  }
  function updateShareButton() {
    shareBtn.disabled = log.shots.length === 0 || replay.active
      || log.cueSwapped;
    // the swap poison names its reason; every other state keeps the
    // NORMAL localized title (review r3 P3 — the icon-only upgrade's
    // title+ARIA contract must not lose its hover label to '')
    shareBtn.title = log.cueSwapped
      ? t('share.cueSwapUnshareable') : t('share.button');
  }
  // the mid-rack cue swap broadcast (settings.js cue fast path — every
  // OTHER equipment commit re-racks and lands in resetLog instead): a
  // CUE-ID change with settled shots in the log poisons this rack's
  // share (see the log.cueSwapped doc); a swap on an empty log is safe
  // (the whole rack plays on the new cue). Keyed on the cue id actually
  // MOVING — the equipment wire also carries same-spec rebroadcasts
  // (playback.js bed restores) and non-cue axis commits (which re-rack
  // into resetLog anyway), and neither may strand a false poison.
  // an in-flight LIVE stroke counts as recorded for the poison (review r3
  // P1): the rack's FIRST shot is still simulating when a swap lands —
  // log.shots is empty until shotComplete, but the settled link would
  // encode the NEW cue for the already-simulated old-cue shot. Keyed on
  // the PR-1 strike info flag, so DVR entries and in-app replays (whose
  // shots are already logged or not ours) never count.
  let liveShotInFlight = false;
  machine.on('stateChange', (next, prev, info) => {
    void prev;
    if (next === 'PLAYBACK') {
      if (info?.strike) liveShotInFlight = true;
      return;
    }
    if (next !== 'SETTLED') liveShotInFlight = false;
  });
  // ADDITIVE capability handshake (review r8 P1): settings.js enables the
  // in-place cue swap ONLY when THIS recorder carries the cueSwapped
  // guard — a cached pre-PR-2 share.js would happily encode a rack whose
  // shots straddle a swap under one equipment tuple (deterministic
  // divergence on the viewer). Without the flag the historic
  // confirm+re-rack path runs, which resets the log — safe on any cache.
  ctx.shareCueSwapGuard = true;
  let lastCueId = ctx.settings?.get?.().equipment?.cue_id ?? null;
  window.addEventListener('ob:settings', (e) => {
    if (e.detail?.key !== 'equipment') return;
    // only explicitly MARKED settings commits count (review r8 P2, the
    // fail-closed inversion of the r4 transient flag): paint-only
    // rebroadcasts (playback.js bed swaps — possibly a CACHED pre-flag
    // copy — flow.js discipline staging, the rerackKind probe) never
    // carry `commit`, so a cross-equipment archive open can never strand
    // a false poison; a stale settings.js has no cue fast path and
    // re-racks every equipment change into resetLog instead.
    if (e.detail.commit !== true) return;
    const cue = e.detail.value?.cue_id ?? null;
    const changed = lastCueId !== null && cue !== null && cue !== lastCueId;
    lastCueId = cue;
    if (!changed || replay.active) return;
    // GH-710 review r5 P2: the equipment axis moved — an own link minted on
    // the old cue is obsolete either way (a poisoned rack is unshareable
    // until the next rack; an empty log re-mints on the new cue)
    shareStateChanged();
    if (log.shots.length > 0 || liveShotInFlight) {
      log.cueSwapped = true;
      updateShareButton();
    }
  });
  // ---- GH-709 / GH-710: the sender's OWN address-bar link -----------------
  // Share never leaves the sender's tab in a replay URL. The polite path
  // ("Link copied") writes NOTHING into location — the link lives on the
  // clipboard. Only the clipboard-refused fallback ("the link is in the
  // address bar") writes `#r=`, and ONLY after it stamped an OWN-TAB marker
  // (sessionStorage — Chrome restores it on tab restore — or, when storage
  // refuses, history.state; keyed by the link's `r=` value; review r5 P2:
  // mark first, advertise second). The boot reader below treats a hash whose marker
  // matches as OWN: it strips the hash and boots the normal live table; a
  // recipient tab (no marker) replays exactly as before (GH-709). The
  // address-bar link must not go stale silently either: when the shared
  // state is superseded (the next shot, a new rack — a mode change and a
  // game switch both re-rack) any own `#r=` is removed with its marker;
  // the next Share re-mints (GH-710).
  // GH-709 review r5 P2: MARK FIRST, ADVERTISE SECOND. Two durable own-tab
  // markers exist — sessionStorage (tab restore keeps it) and, when storage
  // refuses (quota / private mode), `history.state.obOwn` (history.state
  // survives a reload in Chrome/Safari/Firefox). The `#r=` reaches the bar
  // ONLY once one of them held; with neither the bar stays clean and the
  // copy-failure toast says so (the link is still obtainable through the
  // Share panel / the DVR). The boot reader consults EITHER marker.
  const OWN_KEY = 'ob-share-own';
  const hashR = (h = location.hash) => /[#&]r=([A-Za-z0-9_-]+)/.exec(h)?.[1] ?? null;
  const ownMarkStorage = (r) => { // true = the marker verifiably held
    try { sessionStorage.setItem(OWN_KEY, r); return sessionStorage.getItem(OWN_KEY) === r; } catch { return false; }
  };
  const ownStateMarked = (r) => { try { return !!r && history.state?.obOwn === r; } catch { return false; } };
  const ownClear = () => { try { sessionStorage.removeItem(OWN_KEY); } catch { /* n/a */ } };
  const ownMarked = (r) => {
    if (!r) return false;
    try { if (sessionStorage.getItem(OWN_KEY) === r) return true; } catch { /* n/a */ }
    return ownStateMarked(r);
  };
  // (replaceState with a null state also drops the history.state marker)
  const stripHash = () => { try { history.replaceState(null, '', location.href.split('#')[0]); } catch { /* n/a */ } };
  /** Advertise the minted link in the address bar (the clipboard-refused
   * fallback). Returns true when a durable own-tab marker holds AND the
   * `#r=` is in the bar; false leaves the bar exactly as it was. */
  function advertiseOwnLink(url) {
    const r = hashR(new URL(url).hash);
    if (!r) return false;
    const stored = ownMarkStorage(r);
    try { history.replaceState({ obOwn: r }, '', url); } catch { ownClear(); return false; }
    if (stored || ownStateMarked(r)) return true;
    stripHash(); // the bar changed but no marker held: take it back
    ownClear();
    return false;
  }
  function invalidateOwnLink() {
    if (replay.active) return; // a replay's own log growth is not a supersede
    const r = hashR();
    if (r && ownMarked(r)) stripHash();
    ownClear();
    ownPlanKey = null;
  }
  /** GH-710 review r5 P2: the ONE seam for "what buildShareUrl() encodes has
   * changed" — every producer of an encoded field calls it (the producer
   * list sits next to buildShareUrl). An own address-bar link minted before
   * the change encodes a superseded game: drop it with its marker; the
   * next Share re-mints. A recipient's #r= (never own-marked) is untouched
   * and a running replay never counts (its log growth is the decode). */
  function shareStateChanged() { invalidateOwnLink(); }
  // the camera-plan axis (`&cp=`) is CONTENT-addressed: playback.js
  // broadcasts `ob:cameraplan` from planChanged() (every plan write — pill
  // taps, seam drags, picker actions, the setCutPlan seam, restores), and
  // only a change in the plan the link WOULD carry (sessionCameraPlan —
  // the live session's plan under its content gate, else the lineage
  // fallback; empty and absent both ride as no `&cp=`) since the mint
  // counts — a DVR open that restores the very plan the link carries, or
  // an edit on an archived (non-live) session, changes nothing the link
  // encodes. A stale playback.js without the broadcast simply never
  // reports (the pre-r5 posture, degrade-only).
  let ownPlanKey = null; // planKey() at mint time; null = no own link
  const planKey = async () => {
    try {
      const p = await sessionCameraPlan();
      return p && ((p.cuts?.length ?? 0) || (p.poses?.length ?? 0)) ? JSON.stringify(p) : 'none';
    } catch { return 'none'; }
  };
  window.addEventListener('ob:cameraplan', async () => {
    if (replay.active || ownPlanKey === null) return; // no own link minted
    const key = await planKey();
    if (ownPlanKey !== null && key !== ownPlanKey) shareStateChanged();
  });
  shareBtn.addEventListener('click', async () => {
    motion?.press(shareBtn);
    // (GH-491 review r10: the rules-refused UNSHAREABLE gate lives inside
    // buildShareUrl — every encoder entry point, incl. playback's
    // __share.encode seam, lands there; the throw surfaces through this
    // handler's share.failed toast.)
    try {
      const url = await buildShareUrl();
      // GH-302 honest degrade: a dropped over-envelope camera plan must be
      // SAID, not silently omitted (the *NoPlan keys carry both facts —
      // where the link is AND that the plan stayed behind)
      let copied = false;
      try { await navigator.clipboard.writeText(url); copied = true; } catch { /* refused */ }
      if (copied) {
        showToast(t(copiedToastKey(url, planDropped))); // GH-1023 app links
      } else {
        const pk = await planKey(); // the plan bytes this link carries (P2-2)
        if (advertiseOwnLink(url)) {
          // GH-709: the address bar is the user's copy source ONLY here —
          // and only once an own-tab marker holds (review r5 P2: a reload
          // over an unmarked own #r= would replay the sender's own shots)
          ownPlanKey = pk;
          showToast(t(planDropped
            ? 'share.inAddressBarNoPlan' : 'share.inAddressBar'));
        } else {
          // neither the clipboard nor a durable marker: the bar stays clean
          // (English-by-convention diagnostic, the reportError family)
          showToast(t('share.failed', { error: 'clipboard refused and no own-tab marker could be kept' }));
        }
      }
    } catch (e) {
      showToast(t('share.failed', { error: e.message ?? e }));
    }
  });

  // ---- replay mode --------------------------------------------------------
  // shared: decoded SharedGame; i: index of the shot currently firing/
  // playing; fastTo: re-simulate (seek-skip) everything below this index —
  // used by "prev shot" which rebuilds the game from the rack.
  const replay = {
    active: false, shared: null, i: -1, fastTo: 0, done: false,
    timer: 0, expectRerack: false, racked: false,
    // GH-450: the transport GENERATION token — every gotoShot (and every
    // replay teardown) bumps it, and every async continuation / scheduled
    // fire it spawns carries the value it was born under. A rapid second
    // ⏮ therefore SUPERSEDES the first pass cleanly: the stale pass
    // aborts at its next gen check instead of double-reracking (which
    // consumed the one expectRerack and killed the replay over a virgin
    // rack) or double-firing shot 0 (the untracked-timer ghost whose
    // rejection then claimed 'REPLAY finished').
    gen: 0,
    // GH-450: fire retries burned waiting out a stroke still resolving
    // on the table (transport race) — reset per scrub pass.
    tries: 0,
  };
  // GH-448 (review r2 P2): the viewer's own hotseat at replay entry —
  // restored on Exit (Continue adopts the replay's seat instead).
  let viewerSeat = null;
  // GH-525 S1 (contracts/shell.md §9 deviation 1): the shell's FR-016(c)
  // boot-intent seam. True from the moment a `#r=` boot hash is parsed
  // until the intent terminally resolves: the replay actually STARTS
  // (startReplay past its gates — sharedReplayLive() locks from there), the
  // decode REJECTS (badLink toast — the hash stays in the URL, so a
  // hash-only check would over-lock forever, the research R1 residual
  // risk), or the gate banner is dismissed (exitReplay). Read-only
  // accessor on the existing window seam; nothing else consumes it.
  let shellBootIntent = false;
  // published for the other streams (flow.js gates Shoot/Replay, aim.js
  // gates cue placement): user shot input is locked while a shared replay
  // is running — a click in the 700 ms inter-shot gap would inject a user
  // shot and silently divert the replay onto a diverged table.
  ctx.replayActive = () => replay.active;
  // GH-696 / GH-697 (S4 journey-QA round 2, coordinator rulings): the
  // hall's open state is the shell's body-level class (shell.js toggles
  // `body.ob-shell-open` synchronously on entry/exit and keys its FR-017
  // hide list on it — the transport bar joins that list there). Two laws
  // ride the same read, no shell seam needed:
  //  (696) the finished bar is HIDDEN + INERT under the open hall (state
  //        kept); its prev/next transports never re-run the replay while
  //        the shell owns the bed — the FR-016(b) register the entry gate
  //        refuses at the door, kept once inside (035 spec O9);
  //  (697) EVERY hall→table exit (Play now, a place's primary, any exit)
  //        RESOLVES a finished replay FIRST — the same path as the bar's
  //        own Exit (fresh rack, viewer's seat/equipment/game restored) —
  //        so the table the shell hands back is LIVE: flow's Shoot gate
  //        and aim's BALL_IN_HAND drag gate read replayActive() false, no
  //        finished bar over the table, no BIH instruction on a locked
  //        table. A replay still RUNNING at an exit (unreachable by
  //        construction after 696; kept as the legal at-table state) is
  //        left alone. The observer is a microtask after exitToTable's
  //        synchronous teardown; exitReplay awaits the persisted-game
  //        restore before the fresh rack (its own gotoShot law).
  const shellOpen = () => document.body.classList.contains('ob-shell-open');
  let shellWasOpen = shellOpen();
  const onShellClassChange = () => {
    const now = shellOpen();
    if (shellWasOpen && !now && replay.active && replay.done) exitReplay(true);
    shellWasOpen = now;
  };
  if (typeof MutationObserver === 'function') {
    new MutationObserver(onShellClassChange)
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }
  // GH-697 review r1 P2 (PR #706): the SYNCHRONOUS half of the hall→table
  // law. The observer above is a microtask after exitToTable's teardown —
  // an exit action that follows exitToTable() in the SAME task (the
  // Practice card's fallback changeMode('playground'), shell.js) still met
  // the replay lock and was refused; the observer then reracked and the
  // requested mode never applied. shell.js calls this seam FIRST THING in
  // exitToTable (before onShellExit / its caller's action): a finished
  // replay's teardown starts here and `replay.active` is false before the
  // seam returns (exitReplay's first await sits past its state teardown;
  // the fresh rack follows after it, as before). A replay still RUNNING is
  // left alone (the observer's own at-table law); the observer stays as
  // the backstop for an older shell.js (mixed-vintage law).
  function exitFinishedReplay() {
    if (!(replay.active && replay.done)) return false;
    exitReplay(true);
    return true;
  }
  // flow-adapter seams (codec v4): the decoded call for a replayed shot
  // (flow judges with the SENDER's nomination — no re-adjudication
  // divergence) and the index of the shot currently firing/playing.
  ctx.replayCallFor = (i) => {
    if (!replay.active || !replay.shared) return null;
    for (const c of replay.shared.calls) {
      if (c.shotIndex !== i) continue;
      if (c.kind === 'call') return { kind: 'call', ball: c.ball, pocket: c.pocket };
      if (c.kind === 'safety') return { kind: 'safety' };
      if (c.kind === 'nominate') { // US2 (+ the GH-382 free-ball flag)
        return c.freeBall === true
          ? { kind: 'nominate', ball: c.ball, freeBall: true }
          : { kind: 'nominate', ball: c.ball };
      }
      if (c.kind === 'push') return { kind: 'push' }; // 026 (WPA 6.4)
    }
    return null;
  };
  ctx.replayShotIndex = () => (replay.active ? replay.i : -1);
  // GH-382 (review r18 P1): the active replay's pinned variant id —
  // flow's settle dispatch fails a v2 replay closed when its fold
  // raced the rules registry import
  ctx.replayVariantId = () => (replay.active
    ? (replay.shared?.variant ?? null) : null);
  // codec v6 (issue #68): the decoded SENDER-MODE flag — flow.js
  // suppresses rules judgment for 'playground' replays exactly like the
  // sender's session did (its own shotComplete gate; feature-detected, a
  // pre-v6 flow.js re-judges as before). Legacy/v6-play links read 'play'.
  ctx.replaySenderMode = () =>
    (replay.active ? (replay.shared?.mode ?? 'play') : null);
  // feature 012 (T053 integration): recorded rulebook decisions bound to a
  // shot index. PRE-SHOT options (one-pocket break_pocket, WPA 12.3) are
  // resolved BEFORE their shot fires but the v4 calls axis cannot say
  // "before shot 0" — they ride shotIndex k like post-settle decisions.
  // flow.js's pre-judge seam pulls them through here to unblock the judge;
  // ctx.applyReplayDecision no-ops on whatever the flow already consumed.
  ctx.replayDecisionsFor = (i) => {
    if (!replay.active || !replay.shared) return [];
    return replay.shared.calls
      .filter((c) => c.kind === 'decision' && c.shotIndex === i)
      .map((c) => ({ decision: c.decision, choice: c.choice }));
  };

  function fireShot(i) {
    if (!replay.active) return;
    const s = replay.shared.shots[i];
    if (!s) return;
    // GH-450: TRANSPORT RACE vs truly-finished — a fire that lands while
    // a stroke is still resolving on the table (PLAYBACK/SIMULATING/
    // SETTLED) is timing residue, not a dead link: wait it out on this
    // pass's own budget instead of letting game.shoot's 'not in an
    // aiming state' rejection claim 'REPLAY finished' over a half-staged
    // rack. Checked BEFORE any side effect (the calls/moves re-log below
    // must never run twice for one shot). After the budget the fall-
    // through keeps the honest original rejection path (toast + done).
    // GH-492 (the boot import race): a recorded cue placement can only be
    // APPLIED from BALL_IN_HAND (the placements gate below) — an AIM whose
    // rules fold is still in flight (the registry import landed after the
    // rack's AIM: resetMatch early-returned, no break address was staged)
    // would fire shot 0 from the rack-default spot and SILENTLY skip
    // placements[i] (byte + adjudication divergence — carom breakSpot
    // left/right was the caught shape). Wait on the SAME budget/gen
    // discipline: flow.js's rulesReady catch-up (caromRouteBreakCatchup /
    // reassertOpeningRight) stages BALL_IN_HAND as soon as the registry
    // lands, and a link whose registry never lands falls through after
    // the budget to the pre-492 behavior (an honest wait, never a new
    // failure mode). Playground placements ride their own machine-free
    // seam below and never wait.
    const placementNeedsHand = !!replay.shared.placements[i]
      && replay.shared.mode !== 'playground'
      && !machine.is('BALL_IN_HAND');
    if ((!machine.is('AIM', 'BALL_IN_HAND') || placementNeedsHand)
      && replay.tries < 60) {
      replay.tries += 1;
      const gen = replay.gen;
      clearTimeout(replay.timer);
      replay.timer = setTimeout(() => {
        if (gen === replay.gen) fireShot(i);
      }, 250);
      return;
    }
    replay.tries = 0;
    replay.i = i;
    replay.done = false;
    // re-log the decoded call/safety for this shot (the recorder resets on
    // our own rerack, so a finished replay's Continue stays shareable WITH
    // its calls axis; live annotate() is a no-op during replays)
    for (const c of replay.shared.calls) {
      if (c.shotIndex === i && c.kind !== 'decision') log.calls.push({ ...c });
    }
    // codec v6 free-placement axis: re-apply (and re-log, for Continue)
    // the sender's committed placement events bound to this shot, in
    // commit order, through flow.js's NON-interactive seam — the
    // interactive playground primitive is class-gated off during replays.
    // Feature-detected: a pre-v6 flow.js has no seam (and a pre-v6 link
    // has no moves) — nothing to apply. A refused application (missing/
    // pocketed ball) is a divergence signal, not a crash: warn and play on
    // (the sender's build committed the placement as legal).
    for (const mv of replay.shared.moves ?? []) {
      if (mv.shotIndex !== i) continue;
      log.moves.push({ ...mv });
      const ok = ctx.applyReplayPlacement?.({ ball: mv.ball, x: mv.x, y: mv.y });
      if (ok === false) {
        console.warn(`[share] replay placement refused (ball ${mv.ball} `
          + `before shot ${i + 1})`);
      }
    }
    const p = replay.shared.placements[i];
    if (p && machine.is('BALL_IN_HAND')) game.placeCue(p.x, p.y);
    // mixed judged→sandbox session (v6, single-flag wire): a recorded BIH
    // cue placement replays with judgment suppressed, so BALL_IN_HAND is
    // never entered — apply the cue placement through the exact seam, and
    // re-log it (the SIMULATING←BALL_IN_HAND re-log edge can never fire on
    // this lane) so a post-replay Continue re-share keeps the placements
    // axis byte-identical — the calls/moves re-log discipline (WIRING
    // re-review: without it the gen-2 link dropped placements[i] and the
    // second-generation replay forked where the first was exact)
    else if (p && replay.shared.mode === 'playground') {
      log.placements[i] = { x: p.x, y: p.y };
      ctx.applyReplayPlacement?.({ ball: 0, x: p.x, y: p.y });
    }
    game.setPhi(s.phi);
    const err = game.shoot({ v0: s.v0, theta: s.theta, a: s.a, b: s.b });
    if (err) {
      showToast(t('share.shotRejected', { n: i + 1, error: err }));
      replay.done = true;
    } else if (i < replay.fastTo) {
      game.seek(game.duration + 1); // settles on the next frame
    }
    updateBanner();
  }

  /** After each replayed shot settles + flow.js routes the state. */
  function onShotSettled() {
    if (!replay.active) return;
    // re-apply the recorded rulebook decisions bound to the just-settled
    // shot (codec v4: kind 2 with shotIndex = replay.i applies AFTER shot
    // replay.i settles, in array order) through the flow adapter's ruleset
    // seam. A re-rack choice re-racks on the SAME seed — expectDecisionRerack
    // keeps the recorder log alive across it. Feature-detected: without the
    // seam (pre-011 flow.js) decisions are still re-LOGGED so Continue
    // shares stay faithful; nine_ball/legacy replays have no decisions.
    for (const c of replay.shared.calls) {
      if (c.kind !== 'decision' || c.shotIndex !== replay.i) continue;
      log.calls.push({ ...c });
      expectDecisionRerack = true;
      try {
        ctx.applyReplayDecision?.({ decision: c.decision, choice: c.choice });
      } catch (e) {
        showToast(t('share.badLink', { error: e.message ?? e }));
      }
      expectDecisionRerack = false;
    }
    const next = replay.i + 1;
    if (next >= replay.shared.shots.length) {
      // finished: the final position stays on the table (flow.js suppresses
      // its WIN auto re-rack while the replay is active) — the viewer exits,
      // restarts (⏮/⏭ wrap), or adopts the position via Continue
      replay.done = true;
      updateBanner();
      return;
    }
    clearTimeout(replay.timer);
    // GH-450: gen-gated like every scheduled fire — a scrub between this
    // settle and the gap timer must own the transport alone
    const gen = replay.gen;
    replay.timer = setTimeout(() => {
      if (gen === replay.gen) fireShot(next);
    }, next < replay.fastTo ? 30 : SHOT_GAP_MS);
  }

  /** A re-rack arrived (stateChange AIM {seed}). During an active replay the
   * only legitimate re-racks are our own gotoShot/start (expectRerack). */
  function onRerack() {
    if (!replay.active) return;
    if (replay.expectRerack) { replay.expectRerack = false; return; }
    exitReplay(false); // e.g. flow.js WIN auto re-rack → back to fresh play
  }

  /** Restart the replayed game from the rack and fast-forward to shot k.
   * SERIALIZED per the GH-450 generation token: a second ⏮/⏭-wrap press
   * while this pass is still staging SUPERSEDES it — the stale pass
   * aborts at its next gen check, so exactly ONE rerack consumes the one
   * expectRerack (never the silent exitReplay over a virgin rack) and
   * exactly ONE scheduled fire exists (tracked in replay.timer AND
   * gen-gated — the untracked ghost timer was failure shape 2). */
  async function gotoShot(k) {
    const gen = ++replay.gen;
    clearTimeout(replay.timer);
    replay.fastTo = Math.max(0, Math.min(k, replay.shared.shots.length - 1));
    replay.i = -1;
    replay.done = false;
    replay.tries = 0;
    replay.expectRerack = true;
    game.paused = false;
    setIcon(banner?.querySelector('#ob-rp-pause'), 'pause', '⏸');
    // sender's equipment, not the viewer's (share v3; the codec maps v1/v2
    // preset+cloth wires into the same five-id spec)
    ctx.settings?.setTransientEquipment(replay.shared.equipment);
    // sender's GAME drives the re-rack template + adjudication (codec v4;
    // legacy links all decode as nine_ball — R10 #4). Feature-detected: a
    // pre-011 settings.js has no setTransientGame and stays nine_ball,
    // which the v4 decode validation already guarantees for such stacks.
    // AWAITED (integration): game.js stages the dispatch on a microtask —
    // re-racking synchronously would compose the VIEWER's game's rack.
    const R = await ctx.settings?.setTransientGame?.(replay.shared.game);
    // exited while the staging resolved — or SUPERSEDED by a newer scrub
    // (GH-450: the newer pass owns the rerack; a stale continuation that
    // reracked here would consume its expectRerack and kill the replay)
    if (!replay.active || gen !== replay.gen) return;
    if (R === false) {
      replay.expectRerack = false;
      showToast(t('share.stagingRefused'));
      // Later scrubs cannot refuse on the shipped warm path; this branch is fail-closed.
      // Otherwise exitReplay(false) would strand the sender's rack under the restored game.
      if (replay.racked) {
        exitReplay(true);
      } else {
        // Never racked or pinned: there is no captured seat to restore or arm.
        viewerSeat = null;
        exitReplay(false);
      }
      return;
    }
    // sender's rules VARIANT (codec v5, feature 022): decode already
    // gated unknown/family-mismatched ids; the family DEFAULT id (every
    // legacy link, and default v5 sessions) applies as null — the frozen
    // v1 adjudication path (FR-005). Feature-detected on both sides: a
    // stale dist codec has no defaultVariantFor (and decodes no variant),
    // a stale settings.js has no setTransientVariant and stays default.
    const dv = shareCodec.defaultVariantFor?.(replay.shared.game);
    const sv = replay.shared.variant ?? null;
    ctx.settings?.setTransientVariant?.(
      replay.shared.game, sv !== null && sv !== dv ? sv : null);
    // GH-448: pin flow's hotseat to the wire's recorded breaker BEFORE
    // the re-rack — resetMatch folds initialState(player) with the live
    // hotseat, which the previous pass itself mutated (switchPlayer /
    // terminal winner), so an unpinned ⏮ scrub re-folded the frame onto
    // whatever seat was live and the scoreboard attribution flipped.
    // Legacy wires decode breaker 1 (their fresh-boot fold seat; a stale
    // pre-v7 dist codec decodes no field — same pin). Feature-detected:
    // a stale flow.js has no seam and keeps its pre-448 behavior.
    ctx.applyReplaySeat?.(replay.shared.breaker ?? 1);
    // GH-1042: a snooker/carom link minted on a pre-fix kernel struck on
    // the kernel's default pairing whatever equipment it carries — pin
    // that pairing so the re-simulation matches the sender (after the
    // transient equipment/game above: the pin holds the spec they set).
    // Feature-detected: a stale game.js still composes that pairing; a
    // stale dist codec lacks the frozen stamp set and pins nothing.
    game.setDisciplinePairing?.(
      shareCodec.kernelDefaultDisciplinePairing?.(replay.shared) === true ? 'kernel' : 'selected');
    replay.racked = true;
    game.rerack(replay.shared.seed);
    // GH-450: TRACKED and gen-gated (the naked setTimeout here was the
    // ghost the next gotoShot's clearTimeout could never cancel)
    replay.timer = setTimeout(() => {
      if (gen === replay.gen) fireShot(0);
    }, 30);
  }

  function startReplay(shared, viewAnyway, v2Waited) {
    // #789 (E17): the sender's equipment through the settings predicate
    // BEFORE anything switches the scene — View anyway cannot bypass it (the
    // loaded siblings cannot play these ids at all). Existing copy only.
    const refusal = replayEquipmentRefusal(ctx.settings, shared?.equipment);
    if (refusal !== null) {
      console.warn(`[share] replay refused: ${refusal}`);
      shellBootIntent = false; // GH-525: a refused link is a resolution
      showToast(t('error.reloadMessage', { message: t('share.stagingRefused') }));
      return;
    }
    const gate = kernelGate(shared, kernel_version());
    if (!gate.ok && !viewAnyway) {
      showGateBanner(gate.message, shared);
      return;
    }
    // GH-382 (review r13/r14/r17 P1): a wpbsa-snooker-full link needs
    // the WHOLE consumer chain fresh — a stale flow.js/aim.js would
    // judge the recording under a different rulebook (or die on
    // decision 17). A COLD LOAD reads the chain false only because the
    // dynamic backend import has not settled: await it once, then a
    // still-false chain is genuine staleness. The kernel-gate consent
    // pattern: refuse with the banner; View anyway is the
    // informed-divergence escape hatch.
    if (!viewAnyway && shared.variant === 'wpbsa-snooker-full'
      && !(ctx.rulesCapabilities?.snookerV2Chain?.() === true
        && typeof ctx.settings?.setTransientVariant === 'function')) {
      if (!v2Waited && ctx.rulesBackendReady) {
        Promise.resolve(ctx.rulesBackendReady)
          .then(() => startReplay(shared, viewAnyway, true))
          .catch(() => startReplay(shared, viewAnyway, true));
        return;
      }
      // review r26 P2: the adapter-chain staleness is its OWN diagnosis —
      // rendered raw, never wrapped in the kernel-mismatch prefix (the
      // physics kernel MATCHED; wrapping falsely blames it)
      showGateBanner(t('share.v2AdapterStale'), shared, { raw: true });
      return;
    }
    // GH-491 (review r6 P1): a heyball link needs the GH-491 adapter
    // chain — heyball has NO compatible fallback rulebook, so a stale
    // chain would advance playback while flow refuses every null fold
    // (an incomplete, divergent replay). The v2 gate's exact mechanics:
    // await the backend once on a cold load, then a still-false chain
    // is genuine staleness; refuse with the banner (View anyway = the
    // informed-divergence escape hatch). The transient-game adapter
    // joins the requirement — without it the replay cannot even stage
    // the discipline.
    if (!viewAnyway && shared.game === 'heyball'
      && !(ctx.rulesCapabilities?.heyballChain?.() === true
        && typeof ctx.settings?.setTransientGame === 'function')) {
      if (!v2Waited && ctx.rulesBackendReady) {
        Promise.resolve(ctx.rulesBackendReady)
          .then(() => startReplay(shared, viewAnyway, true))
          .catch(() => startReplay(shared, viewAnyway, true));
        return;
      }
      showGateBanner(t('share.heyballAdapterStale'), shared, { raw: true });
      return;
    }
    // GH-448 (review r2/r3 P1): EVERY replay needs the flow seat-pin seam
    // — on a cached pre-448 flow.js a breaker-2 link would silently fold
    // from the boot seat 1, and even a breaker-1/legacy link keeps the
    // original ⏮ scrub flip (gotoShot cannot pin, so the re-fold
    // inherits whatever seat the pass left live). Same consent pattern
    // as the v2 gate above: refuse with the banner; View anyway is the
    // informed-divergence escape hatch. The pairing exists only when a
    // FRESH share.js meets a stale flow.js — an inconsistent cache the
    // banner's reload advice actually heals.
    if (!viewAnyway && typeof ctx.applyReplaySeat !== 'function') {
      showGateBanner(t('share.seatAdapterStale'), shared, { raw: true });
      return;
    }
    // GH-302 (review r5 P2): the encode lineage begins only when the
    // replay actually RUNS — with the kernel-gate banner up the viewer
    // can play their OWN game under it, and a pre-armed lineage would
    // attach the incoming plan to that unrelated recording.
    incomingLineage = incoming !== null;
    // GH-448 (review r2 P2): remember the VIEWER's live hotseat before the
    // transport pins the wire's breaker over flow's sole seat variable —
    // Exit restores it (the viewer's own next rack must not inherit the
    // sender's breaker), Continue keeps the replay seat (the adopted
    // position's turn order IS the replay's). The __rules fallback reads
    // the same pinned wire on a stale flow.js (where no restore seam
    // exists either — symmetric no-op degrade).
    viewerSeat = ctx.hotseatSeat?.() ?? window.__rules?.player?.() ?? null;
    shellBootIntent = false; // GH-525: intent resolved into a LIVE replay
    replay.active = true;
    // continueFromReplay leaves racked as-is; a new link has no replay rack.
    replay.racked = false;
    replay.shared = shared;
    updateShareButton();
    buildReplayBanner();
    gotoShot(0);
  }

  async function exitReplay(rerackFresh = true) {
    clearTimeout(replay.timer);
    replay.gen += 1; // GH-450: orphan every in-flight scrub continuation
    // GH-448 (review r2 P2): give flow the viewer's pre-replay hotseat
    // back BEFORE tearing the replay down (the seam is replay-locked) —
    // the fresh rack below must fold the VIEWER's seat, not whatever the
    // replayed frame left live. Feature-detected both ways: no seam
    // (stale flow) or no captured seat (gate-banner dismissal, where the
    // replay never ran) → the pre-448 behavior, unchanged.
    if (replay.active && viewerSeat !== null) {
      ctx.applyReplaySeat?.(viewerSeat);
    }
    viewerSeat = null;
    shellBootIntent = false; // GH-525: covers the gate-banner dismissal leg
    replay.active = false;
    replay.racked = false;
    replay.shared = null;
    replay.done = false;
    incomingLineage = false; // GH-302: the encode lineage dies with the
    // replay (the content-addressed envelope stays for the DVR pull)
    game.paused = false;
    setSlowmo(false);
    dropBanner(); // state above is already torn down — exit motion is cosmetic
    stripHash();
    ownClear();
    handoffFocus(); // GH-719: Exit / Dismiss never drop focus to <body>
    game.setDisciplinePairing?.('selected'); // GH-1042: the viewer's own racks
    ctx.settings?.restorePersistedEquipment();
    ctx.settings?.restorePersistedVariants?.(); // 022: drop the sender's pin
    // back to the viewer's own game — AWAITED before the fresh rack for the
    // same microtask reason as gotoShot (a non-default persisted game)
    await ctx.settings?.restorePersistedGame?.();
    updateShareButton();
    if (rerackFresh && !replay.active) game.rerack(game.seed);
  }

  /** Adopt the finished replay's final position and keep playing: the
   * recorder log already holds the rack seed + every replayed shot (and BIH
   * placement — and, codec v4, the re-logged calls/decisions), so the
   * continuation is immediately shareable. The replay's transient EQUIPMENT
   * — and its transient GAME (v4) — stays applied: the continuation must
   * simulate AND adjudicate under the same rules the recorded shots used
   * (a reload restores the persisted equipment + game). */
  function continueFromReplay() {
    if (!replay.done) return;
    clearTimeout(replay.timer);
    replay.gen += 1; // GH-450: orphan every in-flight scrub continuation
    viewerSeat = null; // GH-448: Continue adopts the replay's seat —
    // the inherited position's turn order is the recorded frame's
    replay.active = false;
    replay.shared = null;
    replay.done = false;
    game.paused = false;
    // GH-1042: the adopted rack keeps the template it was composed on (a
    // pre-fix link's kernel pairing; the pin is read only at a rerack), so
    // the continued shots match the replayed ones; the viewer's next racks
    // compose on the selected spec
    game.setDisciplinePairing?.('selected');
    setSlowmo(false);
    dropBanner(); // state above is already torn down — exit motion is cosmetic
    stripHash();
    ownClear();
    updateShareButton();
    // flow.js only refreshes buttons on stateChange — mirror its gate here
    // so Shoot/Replay unlock without re-routing the machine
    hud.setButtons({
      canShoot: machine.is('AIM', 'BALL_IN_HAND'),
      canReplay: !!game.sampler && !machine.is('PLAYBACK'),
    });
    handoffFocus(); // GH-719: Continue lands on the re-enabled Shoot
    // GH-451 (review r2 P2): the replay lock suppressed flow's decision
    // prompts — if the adopted frame carries one still pending (the
    // sender shared before deciding), hand the surface back so the
    // viewer can actually resolve it (feature-detected; a stale flow.js
    // predates the suppression and never needed the handoff).
    ctx.replayHandoff?.();
  }

  function setSlowmo(on) {
    // reuse the existing playback path: main.js reads hud's #slowmo each frame
    const box = document.getElementById('slowmo');
    if (box) { box.checked = !!on; }
  }

  // ---- replay banner + controls (own DOM) ---------------------------------
  let banner = null;

  /** Detach the current banner. Callers tear replay state down FIRST (the
   * determinism spine stays synchronous); the captured element then only
   * animates out. Its controls are disabled before the fade so a stray
   * click/Enter in the exit window cannot re-enter gotoShot/exitReplay. */
  // ---- GH-719: focus management for the body-level banners ----------------
  // The shell's GH-682 focusSuccessor idiom (shell.js), mirrored here for
  // the surfaces share.js owns: successors in law order — the table's
  // primary control (#shoot), a visible HUD control, the scene canvas
  // (tabindex -1), the hall pill — and only one that ACTUALLY holds focus
  // counts; never <body>. Prefers the shell's own helper when a build
  // exposes it (feature-detected; none does today — no shell.js edit).
  const visibleInTree = (el) => {
    if (!el?.isConnected || el.getClientRects().length === 0) return false;
    if (getComputedStyle(el).visibility !== 'visible') return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (getComputedStyle(n).display === 'none') return false;
    }
    return true;
  };
  const usableFocus = (el) => !!el && el !== document.body && !el.hidden
    && el.disabled !== true && typeof el.focus === 'function'
    && !el.closest?.('[inert]') && visibleInTree(el);
  const tryFocus = (el) => {
    if (!usableFocus(el)) return false;
    try { el.focus({ preventScroll: true }); } catch { return false; }
    return document.activeElement === el;
  };
  function focusSuccessor() {
    const viaShell = window.__shell?.focusSuccessor;
    if (typeof viaShell === 'function') {
      try { if (viaShell()) return true; } catch { /* fall through */ }
    }
    const hud = document.getElementById('hud');
    const cands = [document.getElementById('shoot'),
      ...(hud?.querySelectorAll('button, input, select') ?? [])];
    const cv = document.querySelector('body > canvas');
    if (cv) { if (!cv.hasAttribute('tabindex')) cv.tabIndex = -1; cands.push(cv); }
    cands.push(document.getElementById('ob-shell-open'));
    return cands.some(tryFocus);
  }
  /** Exit / Dismiss / Continue: hand focus to a visible successor when the
   * banner owned it (or it already fell to <body>); a focus owner elsewhere
   * — the open hall's Play now resolving a finished replay — keeps it (the
   * shell hands off on its own exit). */
  function handoffFocus(from = lastBanner) {
    const ae = document.activeElement;
    const idle = !ae || ae === document.body;
    if (!idle && !(from && from.contains(ae))) return false;
    return focusSuccessor();
  }
  /** Present: the banner's first enabled control takes focus (the replay
   * is the page's primary content on a recipient boot). */
  function focusFirst(el) {
    const first = [...el.querySelectorAll('button, input')].find(usableFocus);
    return first ? tryFocus(first) : false;
  }
  let lastBanner = null; // the element dropBanner is tearing down (handoff read)

  function dropBanner() {
    const el = banner;
    banner = null;
    if (!el) return;
    lastBanner = el;
    if (motion) {
      el.style.pointerEvents = 'none';
      for (const b of el.querySelectorAll('button,input')) b.disabled = true;
      motion.exit(el).then(() => el.remove());
    } else {
      el.remove();
    }
  }

  /** Keep the transport bar clear of the toolbar (the design charter toolbar law:
   * "collisions impossible in any locale"). The bar is horizontally
   * centered; only its RIGHT edge can reach the right-anchored toolbar, so
   * the centered width that still clears the toolbar's left edge is
   * 2·(toolbarLeft − gap) − viewportWidth. That span feeds the CSS
   * max-width clamp (--ob-rp-max) and the bar flex-wraps inside it; if the
   * span is too small to be usable, the bar drops BELOW the toolbar row
   * instead. Re-run on toolbar resize (locale switch, Record→Stop) and on
   * viewport resize. */
  function placeBar() {
    if (!banner) return;
    const tb = document.getElementById('ob-toolbar');
    if (!tb || !tb.children.length) {
      // stale-cache fallback (no toolbar container): keep CSS defaults
      banner.style.removeProperty('--ob-rp-max');
      banner.style.removeProperty('top');
      return;
    }
    const r = tb.getBoundingClientRect();
    const free = Math.floor(2 * (r.left - 12) - window.innerWidth);
    if (free >= 320) {
      banner.style.setProperty('--ob-rp-max', `${free}px`);
      banner.style.removeProperty('top');
    } else {
      banner.style.removeProperty('--ob-rp-max');
      banner.style.top = `${Math.ceil(r.bottom) + 8}px`;
    }
  }
  window.addEventListener('resize', placeBar);
  if (typeof ResizeObserver === 'function') {
    const tb = document.getElementById('ob-toolbar');
    if (tb) new ResizeObserver(placeBar).observe(tb);
  }

  function buildReplayBanner() {
    banner?.remove();
    banner = document.createElement('div');
    banner.id = 'ob-replay';
    // GH-719: an announced, reachable landmark — role=region + localized
    // aria-label (relabelBanner keeps it current); the n/N label is the
    // polite live text; the bar is the FIRST body child so it sits within
    // two Tabs of the document start (DOM order, no positive tabindex —
    // `body > #ob-replay` selectors keep matching).
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', t('share.barLabel'));
    banner.innerHTML = `
      <span id="ob-replay-label" class="ob-nums" role="status"
        aria-live="polite"></span>
      <button id="ob-rp-prev" class="ob-btn ob-btn--ghost"
        data-i18n-title="share.prevShot">⏮</button>
      <button id="ob-rp-pause" class="ob-btn ob-btn--ghost"
        data-i18n-title="share.playPause">⏸</button>
      <button id="ob-rp-next" class="ob-btn ob-btn--ghost"
        data-i18n-title="share.nextShot">⏭</button>
      <label data-i18n-title="share.rpSlow"><span class="ob-nums">0.25×</span>
        <input type="checkbox" id="ob-rp-slow"></label>
      <span class="ob-rp-break" aria-hidden="true"></span>
      <button id="ob-rp-continue" class="ob-btn ob-btn--primary"
        style="display:none" data-i18n="share.continue"
        data-i18n-title="share.continueTitle"></button>
      <button id="ob-rp-exit" class="ob-btn"
        data-i18n-title="share.exit">✕</button>`;
    document.body.prepend(banner);
    placeBar();
    // the element is captured (not the live `banner` var): listeners survive
    // a dropBanner() race without a null query in the exit-motion window
    const el = banner;
    const q = (id) => el.querySelector('#' + id);
    uiKit?.upgradeToggle(q('ob-rp-slow')); // input stays native + listened
    setIcon(q('ob-rp-prev'), 'skip-back', '⏮');   // #49 SVG faces (the
    setIcon(q('ob-rp-pause'), 'pause', '⏸');      // innerHTML glyphs above
    setIcon(q('ob-rp-next'), 'skip-forward', '⏭'); // are the fallback text)
    // GH-156 (chrome diet): Exit is a SECONDARY action beside the primary
    // Continue — icon pill (the leave-surface mark; 'close' ships since
    // #49, so even a stale icons.js resolves it). Localized label rides
    // data-i18n-title + the aria-label set in relabelBanner. The de DONE
    // register drops ~100px of row-2 text width.
    setIcon(q('ob-rp-exit'), 'close', '✕');
    relabelBanner(); // localized label/titles (re-run on locale switch)
    q('ob-rp-continue').addEventListener('click', continueFromReplay);
    // GH-696: prev/next are inert while the hall is open (the hide list
    // already drops the bar's pointer target; this is the same law for any
    // reach that bypasses hit-testing — a queued click, a driver, a11y)
    q('ob-rp-prev').addEventListener('click', () => {
      if (shellOpen()) return;
      gotoShot(Math.max(0, replay.i - 1));
    });
    q('ob-rp-next').addEventListener('click', () => {
      if (shellOpen()) return;
      if (machine.is('PLAYBACK')) game.seek(game.duration + 1); // fast-forward
      else if (replay.done) gotoShot(0); // wrap: restart
    });
    q('ob-rp-pause').addEventListener('click', () => {
      game.paused = !game.paused;
      setIcon(q('ob-rp-pause'), game.paused ? 'play' : 'pause',
        game.paused ? '▶' : '⏸');
    });
    q('ob-rp-slow').addEventListener('change', (e) => setSlowmo(e.target.checked));
    q('ob-rp-exit').addEventListener('click', () => exitReplay(true));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (b) motion?.press(b); // micro feedback on any transport button
    });
    motion?.enter(el);
    updateBanner();
    // GH-719: the replay IS the page's primary content on a recipient boot
    // (and after View anyway) — its first control takes focus on present
    focusFirst(el);
  }

  function updateBanner() {
    // done-register class (build-4 QA): the DONE state is the bar's widest
    // set (label + 3 transports + toggle + Continue + Exit). touch.css §3.3
    // keys its phone two-row register + the grown band-S reservation on it
    // (the desktop bar keeps its single row — placeBar's --ob-rp-max clamp
    // already clears the toolbar there). Gate banners carry no transport
    // label and return below before replay.done can ever be true.
    banner?.classList.toggle('ob-rp-done', replay.done === true);
    const label = banner?.querySelector('#ob-replay-label');
    if (!label || !replay.shared) return;
    const n = replay.shared.shots.length;
    const text = replay.done
      ? (n === 1 ? t('share.finishedOne') : t('share.finishedMany', { n }))
      : t('share.shotProgress', { i: Math.max(1, replay.i + 1), n });
    if (label.textContent !== text) {
      label.textContent = text;
      motion?.pulse(label); // value-change feedback (throttled internally)
    }
    const cont = banner.querySelector('#ob-rp-continue');
    if (cont && (cont.style.display === 'none') !== !replay.done) {
      cont.style.display = replay.done ? '' : 'none';
      if (replay.done) motion?.enter(cont, { display: '' });
    }
  }

  /** Localized banner chrome: chrome text/titles are declared as data-i18n /
   * data-i18n-title and re-applied via applyDom on locale switch (works for
   * both the transport banner and the kernel-gate banner; the gate MESSAGE
   * is interpolated at build time and keeps its language — pre-existing).
   * The n/N label itself re-renders via updateBanner. */
  function relabelBanner() {
    relabelShareBtn();
    if (banner) {
      applyDom(banner);
      // GH-156: the icon-only Exit pill's accessible name (applyDom covers
      // title via data-i18n-title; aria-label is set here)
      banner.querySelector('#ob-rp-exit')
        ?.setAttribute('aria-label', t('share.exit'));
      banner.setAttribute('aria-label', // GH-719 (both banner kinds)
        t(banner.querySelector('#ob-rp-dismiss') ? 'share.gateLabel' : 'share.barLabel'));
    }
    updateBanner();
  }
  onLocaleChange(relabelBanner);

  function showGateBanner(message, shared, { raw = false } = {}) {
    banner?.remove();
    banner = document.createElement('div');
    banner.id = 'ob-replay';
    banner.setAttribute('role', 'region'); // GH-719 (see buildReplayBanner)
    banner.setAttribute('aria-label', t('share.gateLabel'));
    const msg = document.createElement('span');
    msg.setAttribute('role', 'status');
    msg.setAttribute('aria-live', 'polite');
    // the kernel-gate callers pass a mismatch detail for the frozen
    // "Kernel mismatch: {message}" wrapper; a raw caller (the GH-382
    // adapter-stale gate, review r26 P2) brings its own full sentence
    msg.textContent = raw ? message : t('share.kernelMismatch', { message });
    const view = document.createElement('button');
    view.id = 'ob-rp-view-anyway'; // record.mjs flagship captures click this
    view.className = 'ob-btn ob-btn--primary';
    view.dataset.i18n = 'share.viewAnyway';
    view.textContent = t('share.viewAnyway');
    view.addEventListener('click', () => { motion?.press(view); startReplay(shared, true); });
    const drop = document.createElement('button');
    drop.id = 'ob-rp-dismiss';
    drop.className = 'ob-btn ob-btn--ghost';
    drop.dataset.i18n = 'share.dismiss';
    drop.textContent = t('share.dismiss');
    drop.addEventListener('click', () => { motion?.press(drop); exitReplay(false); });
    banner.append(msg, view, drop);
    document.body.prepend(banner);
    placeBar();
    motion?.enter(banner);
    focusFirst(banner); // GH-719: View anyway is the gate's first action
  }

  // ---- styles + hash bootstrap --------------------------------------------
  // Module style block: placement + composition only — every color/size
  // consumes var(--ob-*) tokens (contracts/ui-kit.md CSS contract). Kit
  // classes (.ob-btn etc.) own the control look; toolbar buttons keep their
  // absolute right-offsets + current 6px/12px footprint this round.
  const style = document.createElement('style');
  style.textContent = `
    /* GH-668 B-K16: fixed offset = the stale-app.html fallback ONLY (the
       app.html toolbar container spaces the pills); the material and every
       rung are the kit toolbar part (.ob-btn--glass + .ob-toolbar-pill).
       What stays at id level is the TEXT register (a stale icons.js keeps
       the 12px text pill: toolbar family law, share sat at 14px — defect). */
    #ob-share { position: fixed; top: 10px; right: 52px;
      white-space: nowrap; /* labels never ellipsize */
      font-size: var(--ob-fs--1); line-height: var(--ob-lh-body);
      padding: 6px 12px; }
    /* GH-156 (chrome diet): icon-only register — set only when the
       icons.js 'share' face resolved; the kit --icon owns the 34/44 circle
       (padding 0 restated here because the text register above is an id
       rule and would otherwise pad the circle) */
    #ob-share.ob-tb-icon { padding: 0; }
    #ob-share-toast { display: none; position: fixed; top: 52px; right: 52px;
      z-index: 41; max-width: 320px; padding: var(--ob-sp-2) var(--ob-sp-3);
      background: var(--ob-glass);
      backdrop-filter: blur(var(--ob-blur));
      -webkit-backdrop-filter: blur(var(--ob-blur));
      border: 1px solid var(--ob-line-1); border-radius: var(--ob-r-m);
      box-shadow: var(--ob-el-2); color: var(--ob-text-0);
      font-family: var(--ob-font); font-size: var(--ob-fs--1);
      line-height: var(--ob-lh-body); overflow-wrap: anywhere; }
    /* GH-1023 (phone, touch.css §3.11 band X): the toast never paints over
       a live banner. Its corner sits inside band X on a phone, so while
       #banner is up the toast takes the band-X lane directly under the
       banner (the measured --ob-band-x-banner-h, the token the warn chip
       and hint lanes already yield by), centred under the banner's own
       corner-column cap; with the wrong-ball chip up too it drops below
       that chip's lane (warn chip <= 34px). Desktop keeps its corner (the
       banner sits at 18%, clear of it). */
    html.ob-touch body:has(#banner[style*="display: block"]) #ob-share-toast {
      left: 0; right: 0; margin-inline: auto; width: fit-content;
      max-width: min(calc(100vw - var(--ob-safe-l, 0px)
        - var(--ob-safe-r, 0px) - 2 * 116px), 640px);
      top: calc(var(--ob-band-x, 52px) + var(--ob-band-x-banner-h, 64px)
        + var(--ob-sp-2)); }
    html.ob-touch body:has(#banner[style*="display: block"]):has(#ob-aimw-warn.on) #ob-share-toast {
      top: calc(var(--ob-band-x, 52px) + max(76px,
        var(--ob-band-x-banner-h, 64px) + var(--ob-sp-2)) + 34px
        + var(--ob-sp-2)); }
    #ob-replay { position: fixed; top: 5px; left: 0; right: 0;
      /* 44.8px bar (8+8 padding + 2 border + 26.8 ghost-pill row) centered
         on the toolbar pills' centerline: 5 + 44.8/2 = 27.4 ≈ y=27 */
      box-sizing: border-box; /* the max-width clamp below must bound the
         BORDER box — G2 covers only ob-* classes, not this id */
      margin-inline: auto; width: fit-content;
      /* --ob-rp-max: the centered span that clears the toolbar's left
         edge, measured by placeBar() below — the bar flex-wraps inside
         it, so toolbar ∩ replay-bar stays empty in every locale/width
         (2026-07 dual-audit must-fix: 54px overlap at 1280/en) */
      max-width: min(92vw, 720px, var(--ob-rp-max, 720px)); z-index: 42;
      display: flex; flex-wrap: wrap; justify-content: center;
      align-items: center; gap: var(--ob-sp-2);
      padding: var(--ob-sp-2) var(--ob-sp-3);
      background: var(--ob-glass);
      backdrop-filter: blur(var(--ob-blur));
      -webkit-backdrop-filter: blur(var(--ob-blur));
      border: 1px solid var(--ob-line-1); border-radius: var(--ob-r-l);
      box-shadow: var(--ob-el-2); color: var(--ob-text-0);
      font-family: var(--ob-font); font-size: var(--ob-fs-0);
      font-weight: var(--ob-fw-med); line-height: var(--ob-lh-tight); }
    #ob-replay .ob-btn { padding: var(--ob-sp-1) var(--ob-sp-2);
      /* #49: transport faces are 16px SVG icons — flex centering keeps
         icon pills and text pills (Continue/Exit) on one row height */
      display: inline-flex; align-items: center; justify-content: center; }
    /* done-register row break (build-4 QA): inert marker between the
       transports and Continue/Exit. Desktop keeps the single row (display
       none); touch.css §3.3 flips it to a 100% flex-basis break so the
       phone DONE bar wraps into two deterministic rows instead of
       shrinking its text pills past their labels. */
    #ob-replay .ob-rp-break { display: none; }
    #ob-replay label { display: inline-flex; align-items: center;
      gap: var(--ob-sp-1); color: var(--ob-text-1); cursor: pointer; }
    /* coarse tap floor (#81 QA): the 0.25x slow-mo toggle measured 76x21 on
       phone — the label IS the tap target (the kit-upgraded checkbox rides
       inside it). Pure (pointer: coarse) gate; touch.css's phone block
       floors only the transport .ob-btn pills, not this label. */
    @media (pointer: coarse) {
      #ob-replay label { min-height: 44px; min-width: 44px;
        box-sizing: border-box; justify-content: center;
        padding-inline: var(--ob-sp-1); }
    }
  `;
  document.head.appendChild(style);

  let pendingHash = null;
  const m = /[#&]r=([A-Za-z0-9_-]+)/.exec(location.hash);
  if (m) pendingHash = m[1];
  // GH-709: the own-tab discriminator — a `#r=` this tab minted for the
  // address bar (fallback share; the marker survives reload AND tab
  // restore) is NOT a recipient boot: strip it and boot the live table
  // (shell entryAllowed true, boot class never 'blocked'). A recipient tab
  // carries no marker and replays as before.
  if (pendingHash && ownMarked(pendingHash)) {
    stripHash();
    ownClear();
    pendingHash = null;
  }
  shellBootIntent = !!pendingHash; // GH-525 §9 deviation 1 (FR-016(c))
  // GH-302: the sibling camera-plan param. Read ONLY when a #r= replay is
  // booting — a link without &cp= never touches any cp codepath (compat
  // law a), and the param without a replay is meaningless. The capture is
  // EVERYTHING up to the next '&' (review r3 P2): a charset-limited match
  // would silently TRUNCATE `cp=<blob>!junk` to a decodable prefix and
  // apply a wrong plan — the whole value goes to the codec, whose
  // base64url gate rejects the junk into the documented warn-and-ignore
  // path instead.
  let pendingPlan = null;
  const mc = pendingHash && /[#&]cp=([^&]*)/.exec(location.hash);
  if (mc) pendingPlan = mc[1]; // '' = explicitly-present empty param —
  // still MALFORMED input for the codec (review r5 P3: absent and empty
  // must not be conflated; only absent skips the cp codepath entirely)
  if (pendingHash) {
    // boot order: main.js calls game.rerack AFTER all createX() — start the
    // replay on the first rerack'd AIM so the engine/scene are fully up.
    const un = machine.on('stateChange', (next, prev, info) => {
      if (next !== 'AIM' || info?.seed === undefined) return;
      un();
      setTimeout(async () => {
        try {
          // GH-491 review r7 P1: the consumer opt-in — THIS share.js
          // carries the heyball replay chain (startReplay gate +
          // transient-game staging); a stale pre-491 share.js calls the
          // fresh codec with the old 1-arg shape and is refused a
          // heyball payload it cannot replay.
          const shared = await decodeShare(pendingHash,
            { acceptGames: ['heyball'] });
          // GH-302: decode the camera plan SEPARATELY and presentation-
          // grade (the GH-301 §1.4 axis split): malformed / truncated /
          // future-version / out-of-range blobs — or a stale dist codec
          // without decodeCameraPlan — IGNORE the plan with one console
          // warn; the replay still plays with the default camera. Only
          // the #r= tuple may refuse a link.
          if (pendingPlan !== null) {
            try {
              const plan = (await shareCodec.decodeCameraPlan?.(
                pendingPlan, shared.shots.length)) ?? null;
              if (plan) {
                // content address = the replay's re-simulated RECORD
                // BYTES (filled per settle above): the DVR pull applies
                // the plan only to the session whose records byte-match
                // — never a foreign session, no seed arithmetic.
                // `expected` = the shared shot count: the address is
                // COMPLETE only when every shot re-simulated (review r3
                // P2 — an early-exited replay's partial prefix could
                // match a foreign session that merely repeated the
                // opening shots).
                incoming = { records: [], expected: shared.shots.length, plan };
                // lineage arms in startReplay (review r5 P2) — only when
                // the replay actually runs past the kernel gate
              }
            } catch (e) {
              console.warn('[share] camera plan ignored: '
                + (e?.message ?? e));
            }
          }
          startReplay(shared, false);
        } catch (e) {
          shellBootIntent = false; // GH-525: decode REJECTED = resolution
          // #789 (E17.S1): a stale cached catalog is not a bad link
          const stale = staleCatalogRejection(ctx.settings, e);
          if (stale !== null) {
            console.warn(`[share] replay refused: ${stale}`);
            showToast(t('error.reloadMessage', { message: t('share.stagingRefused') }));
          } else showToast(t('share.badLink', { error: e.message ?? e }));
        }
      }, 30);
    });
  }

  // ---- e2e / debug surface -------------------------------------------------
  window.__share = {
    encode: () => buildShareUrl(),
    // GH-697 review r1 P2 cross-module seam (shell.js exitToTable, feature-
    // detected): resolve a FINISHED replay synchronously; true if one was.
    exitFinishedReplay,
    records: () => [...log.recordJsons],
    log: () => ({
      seed: log.seed, shots: log.shots.length,
      placements: { ...log.placements }, variant: log.variant,
      moves: log.moves.map((m) => ({ ...m })), // #68 codec v6
      playground: log.playground,
      startSeat: log.startSeat,                // GH-448 codec v7
    }),
    calls: () => log.calls.map((c) => ({ ...c })),
    annotate: (a) => annotate(a),
    replay: () => ({
      active: replay.active, i: replay.i, done: replay.done,
      n: replay.shared?.shots.length ?? 0,
      game: replay.shared?.game ?? null,
      calls: replay.shared?.calls.length ?? 0,
      variant: replay.shared?.variant ?? null, // 022 codec v5
      mode: replay.shared?.mode ?? null,       // #68 codec v6
      moves: replay.shared?.moves?.length ?? 0,
      breaker: replay.shared?.breaker ?? null, // GH-448 codec v7
      // GH-302: the decoded camera plan's shape (null = none rode in)
      plan: incoming
        ? { cuts: incoming.plan.cuts.length, poses: incoming.plan.poses.length }
        : null,
    }),
    // GH-302 cross-module seam (consumed by playback.js openPlayer AFTER
    // the session stages): the decoded incoming camera plan in the GH-301
    // integer model (centisecond anchors, mm/dd poses) WITH its content
    // address ({ records, plan } — the replay's re-simulated record
    // JSONs), or null. Cloned — the consumer prefix-matches the staged
    // session's record BYTES and feeds the plan through the setCutPlan
    // validator.
    cameraPlan: () => (incoming
      ? JSON.parse(JSON.stringify(incoming)) : null),
    // GH-302: did the LAST encode drop an over-envelope plan? (the DVR
    // copy-link chip reads it for its honest-degrade register)
    planDropped: () => planDropped,
    // GH-302 e2e red/green knob for the honest-degrade notice (no
    // production caller passes a value — the walkSpec noLock discipline)
    envelope: (n) => {
      if (Number.isInteger(n) && n > 0) urlEnvelope = n;
      return urlEnvelope;
    },
    continue: () => continueFromReplay(),
    exit: () => exitReplay(true),
    // GH-716 review r1v P3-a e2e seam: enter a shared replay IN-PAGE — the
    // decode + the same startReplay the #r= boot and the gate banner's View
    // anyway drive. A replay otherwise boots only from a #r= document load,
    // so no suite could round-trip a LIVE table (a snooker WIN hold) through
    // the transport's locked fold and exitReplay's pinned restoration — the
    // fold pair flow's frame-seam register must survive (e2e-snooker S8b).
    // No production caller (the walkSpec noLock discipline); the camera
    // plan sibling param is not read here.
    start: async (hash) => {
      const shared = await decodeShare(hash, { acceptGames: ['heyball'] });
      startReplay(shared, false);
      return replay.active;
    },
    // GH-525 S1 (contracts/shell.md §9 deviation 1): the shell's FR-016(c)
    // pending-boot-intent read — see the shellBootIntent note above.
    pending: () => shellBootIntent,
    // GH-709/710 e2e readout: does the CURRENT #r= carry this tab's own
    // address-bar marker? (read-only; the arms also read the hash itself)
    own: () => ownMarked(hashR()),
  };
  return { buildShareUrl };
}

// GH-1023 share-base begin (lifted verbatim by web/tools/test-share-link-base.mjs)
// Where a share link points. A browser page (http/https) shares its own
// address, exactly as before. The macOS/iOS shells serve the game from
// app://local, which nothing outside the app can open, so a shell link uses
// the app-owned openbilliards:// scheme instead: both shells register it and
// route openbilliards://replay#r=…[&cp=…] back into a replay (input-checked
// natively, ShellCore ReplayLink). PUBLIC_SHARE_PAGE is the published web
// build's app page ('https://<host>/<path>/app.html'), null while none
// exists; setting it moves every shell share surface to https links, and the
// app-link toast copy (share.copiedApp*) then stops applying by itself.
const PUBLIC_SHARE_PAGE = null;
const APP_SHARE_BASE = 'openbilliards://replay';

function shareBase(href) {
  const page = String(href).split('#')[0];
  if (/^https?:\/\//i.test(page)) return page;
  return PUBLIC_SHARE_PAGE ?? APP_SHARE_BASE;
}

/** The success toast for a copied link: an app link says plainly that it
 * opens in the app (a recipient without it cannot open it). */
function copiedToastKey(url, planDropped) {
  if (String(url).startsWith(`${APP_SHARE_BASE}#`)) {
    return planDropped ? 'share.copiedAppNoPlan' : 'share.copiedApp';
  }
  return planDropped ? 'share.copiedNoPlan' : 'share.copied';
}
// GH-1023 share-base end
