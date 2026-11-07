// Copyright (c) Meta Platforms, Inc. and affiliates.

// game.js — simulation/playback core: owns the ball meshes, the shot
// scenario JSON, and the WasmSampler playback clock. Drives the state
// machine (state.js): AIM → SIMULATING → PLAYBACK → SETTLED. Outcome
// ADJUDICATION (WIN / BALL_IN_HAND / AIM routing) lives in flow.js, which
// listens on machine.on('shotComplete'). FROZEN with main.js/state.js after
// the ux-scaffold (see the ownership ledger); feature 011 (multi-game support)
// re-opened THIS file for the game/flow lane only: the rack is now composed
// via the active GameCatalog entry's rack template (setGame/composeRack) and
// the settle outcome carries a per-game payload — everything else, and every
// nine_ball byte, is unchanged (FR-003).
import * as THREE from 'three';
import { ScenarioBuilder, recordDuration, scenarioToJson } from '../dist/pool-sdk/index.js';
import { MAX_RACK_SEED } from '../dist/pool-sdk/share.js';
// namespace alias of the SAME module for the OPTIONAL lineage probe
// (GH-318): `lineageCompatible` is a NEW share.js export, and a stale
// cached copy without it must degrade loadRecord to the strict pre-318
// policy — a named import would fail the whole module at link time
// (cache-poison contract), the namespace access just answers undefined.
import * as shareSdk from '../dist/pool-sdk/share.js';
import { buildBallSet, syncSphereUniforms, R } from './ballset.js';
import { kPosToThree, kQuatToThree, threePosToK } from './coords.js';
import * as framestepNs from './framestep.js'; // GH-489 #637 LAND-16 Z2 / LAND-17 BC: the ONE un-padded sink-completion time reached through a NAMESPACE binding (boot-cache rule, the ownership ledger:42-53 — a new NAME on an existing edge never links by name)

const SINK_SECONDS = 0.45;  // pocketed-ball sink animation length (kernel s)
const SETTLE_PAD = 0.4;     // playback seconds past the last event
// pocket-drop tuning (see web/scene/pocket-geometry.md — the drop path must
// stay inside the shared pocket cup so it clips against nothing visible)
const SCENARIO_LOG_CAP = 128; // determinism log: last N submitted scenarios
                              // (32 → 128, bug-report bundle v2 — specs/
                              // 025-bug-report/spec.md Amendment v2)
const SINK_G = 9.8;          // gravity for the visible fall (kernel-time s)
const SINK_SHIELD_Y = -0.055; // cull once the ball TOP is below this line
const SINK_FLOOR_Y = -0.16;  // clamp inside the cup (never below the throat)
const LIP_POP_M = 0.0015;    // jaw ride-up before the fall (footage-measured ≲1–2 mm)
// snooker in-hand region (feature 012 US2 — WPBSA Sec1 R1(d)-(f), pinned
// rulebook constants, kernel-mirrored by sdk games/layouts.ts and
// drift-tested there): the baulk line lies 737 mm from the face of the
// bottom cushion; the "D" is the 292 mm semicircle behind it.
const SNOOKER_BAULK_FROM_BOTTOM = 0.737;
const SNOOKER_D_RADIUS = 0.292;

/** FNV-1a 32-bit over the scenario JSON — the determinism log fingerprint
 * (issue #14): cheap, dependency-free, stable across boots/configs. */
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** GH-626: how many balls a SOLID pocket closure holds BELOW the bed plane.
 *
 * Occupant k (0-based) stacked on a closure whose support face is at
 * ySurface has its centre at ySurface + (2k+1)·r and its crown at
 * ySurface + (2k+2)·r (equal spheres on a plane), and it is IN the well
 * only while that crown is at or below the bed plane — the datum the
 * Predator plug depth was chosen against (FT-PLUG-THICKNESS, gh488p
 * canonical: "a dropped ball's crown still sits level with the bed").
 * Counting the k with ySurface + (2k+2)·r <= tol gives
 *   cap = floor((tol − ySurface) / 2r), floored at ZERO —
 * a closure shallower than one ball diameter cannot hold even one ball
 * below the bed: its occupant would stand proud of the cloth in a pocket
 * the kernel calls Pocketed, so such a closure publishes no station and
 * the drop keeps the legacy fall-and-cull. (An earlier form floored the
 * count at one, which would have seated exactly that occupant.)
 * `tol` is the flush band. The Predator evaluates to exactly 0 in float
 * (−0.05715 + 2·0.028575), so the band changes nothing there; it exists so
 * a closure specified at an exact multiple of the diameter cannot lose a
 * station to a last-ulp rounding — callers pass the kernel KISS mirror,
 * the band the validator already uses to call two surfaces "touching".
 * Pure and exported so the gate can red-arm the derivation directly. */
export function closureCapacity(ySurface, r, tol = 0) {
  if (!(r > 0) || !Number.isFinite(ySurface)) return 0;
  return Math.max(0, Math.floor((tol - ySurface) / (2 * r)));
}

export function createGame({ engine, scene, shared, envMap, machine }) {
  // feature 011: the GameCatalog barrel is a NEW leaf module — dynamic
  // import + feature detection per the cache-poison contract (the ownership ledger:
  // a boot must never die on a missing/stale dist module; without it the
  // app degrades to exactly the pre-feature nine_ball behavior).
  let games = null; // web/dist/pool-sdk/games barrel once loaded
  const gamesReady = import('../dist/pool-sdk/games/index.js')
    .then((m) => {
      if (typeof m.getGameEntry === 'function'
        && typeof m.applyRackTemplate === 'function') games = m;
      else console.warn('[game] games catalog stale — nine_ball only');
      return games;
    })
    .catch((e) => {
      console.warn('[game] games catalog unavailable — nine_ball only:', e);
      return null;
    });

  const g = {
    phi: Math.PI / 2,
    slowmo: false,
    paused: false,
    seed: 1,
    equipment: null, // catalog-id spec every rerack resolves (settings.js)
    // GH-1042: the `equipment` object a replayed pre-fix share pinned to
    // the kernel's default snooker/carom pairing (share.js), else null; a
    // new spec (any setEquipment) ends the pin — see composeRack
    kernelPairingFor: null,
    kernelPinned: null,
    // GH-1042 (review r1): the running kernel's stamp is in the frozen
    // pre-fix set (a cached wasm under fresh app modules): its links carry
    // that stamp and replay on the kernel pairing, so composeRack racks on it
    legacyKernel: shareSdk.kernelDefaultDisciplinePairing?.(
      { kernelVersion: engine.version?.() ?? '' }) === true,
    gameId: 'nine_ball',       // active GameCatalog id (feature 011)
    rulesetId: 'nineball-v1',  // the entry's ruleset (flow.js registry key)
    cueBallId: 0,     // the STRUCK ball id (GH-383 per-seat carom cue
                      // balls; kernel Amendment 026 options.cue_ball —
                      // 0 everywhere outside the carom two-cue variant;
                      // flow.js syncs it per seat, applyRack resets it)
    caromSecondBall: 'yellow', // GH-383 visual fork: carom ball 1 paint
                      // ('yellow' worldwide-practice default | 'marked'
                      // dot-marked white per the UMB letter) — owner pick
                      // pending; settings.js drives it, applyRack reads it
    shotIndex: 0,
    template: null,   // parsed scenario JSON (params/options/table source)
    rackKind: 'nine',  // the live rack's kernel kind (applyRack truth)
    ballSet: null,    // { group, balls[] }
    record: null,     // parsed ShotRecord of the last shot
    sinkInfo: null,   // lazy seek() index: ball id → pocket time + jaw pose
    // GH-650 order 18 item 0 (the pocket-drop OWNERSHIP hand-off): the ball-return presentation module may
    // take a sinking ball EARLY — from the instant the sink pose meets a ball it already draws or holds —
    // by setting `g.ballReturnOwns(id, dt)`; poseSink then returns false (its callers park the ball as at
    // the shield crossing). Never set on a table without a return track: poseSink is byte-identical there.
    ballReturnOwnsSupported: true,
    ballReturnOwns: null,
    sampler: null,
    buf: null,
    clock: 0,
    duration: 0,
    lastOutcome: null,
    scenarioLog: [],  // exact scenario JSON strings submitted to simulate
  };
  const quatTmp = new THREE.Quaternion();
  // issue #50: visual-only pure-roll orientation correction — leaf module,
  // feature-detected dynamic import per the cache-poison contract
  // (the ownership ledger): a stale/missing module degrades to the uncorrected
  // kernel quaternions, never a dead boot. Loaded at createGame time so it
  // is resolved long before the first shot; a shot fired before resolution
  // simply plays uncorrected (quatAt has no index for it — no mid-shot flip).
  let rollFix = null;
  import('./rollcorrect.js')
    .then((m) => {
      if (typeof m.createRollCorrection === 'function') rollFix = m.createRollCorrection();
    })
    .catch(() => {});
  // issue #236: spin-preserving lip-pivot pocket sink — leaf module,
  // feature-detected dynamic import per the cache-poison contract
  // (the ownership ledger): an absent/stale module degrades to the pre-236
  // spin-frozen momentum-bezier glide (poseSink legacy body), never a
  // dead boot. Loaded at createGame time like rollcorrect.js above.
  let sinkFx = null;
  import('./sinkpivot.js')
    .then((m) => {
      if (typeof m.buildSinkPivot === 'function'
        && typeof m.poseInSink === 'function') sinkFx = m;
      // GH-650 order 18 item 0: the module reads the sink pose through THIS accessor (game.js's own
      // sinkpivot binding — the version that drew the ball), never by importing sinkpivot.js itself
      g.sinkPoseAt = (s, dt, out) => (s && s.pivot && sinkFx ? sinkFx.poseInSink(s.pivot, dt, out ?? {}) : null);
    })
    .catch(() => {});
  // GH-489 W6 (pocket-geometry.md Amendment 026): the drop steers to the
  // VISIBLE fall (the snooker corner slate hole sits at the mouth, ~59 mm
  // inward of the kernel capture centre) — feature-detected dynamic import
  // per the cache-poison contract: a stale table.js keeps the kernel cups
  // verbatim (pre-026 behavior), never a dead boot.
  let pocketFallsFn = null;
  // GH-489 SNK-R37 deviation B (review r11 P2 B, the ownership ledger "Recorded
  // deviation (frozen game.js, one capability check)"): the plate datum, read
  // through the SAME guarded import, is the steering target of the fallback
  // taken when the cached sinkpivot.js leaf does not declare pre-roll support.
  let pocketPlateFn = null;
  import('../scene/table.js')
    .then((m) => {
      if (typeof m.pocketVisualFalls === 'function') {
        pocketFallsFn = m.pocketVisualFalls;
      }
      if (typeof m.pocketPlateDatums === 'function') {
        pocketPlateFn = m.pocketPlateDatums;
      }
    })
    .catch(() => {});
  const sinkPoseTmp = {}; // reusable poseInSink output (no per-frame alloc)
  // B1: net-dress deform bookkeeping — the set of table-side net
  // capabilities this playback has deformed (so a scrub-back/teardown
  // restores every touched sock to its pristine base buffer).
  const netTouched = new Set();
  // review blocker-cure r2 P1: balls settle() leaves RESTING IN NETS are
  // excluded from the next record's playbackBalls (pocketed) — nothing
  // would ever hide them, and a later pot into the same corner would
  // overlap the stale mesh at slot 0. The retained set clears WITH the
  // nets at every sink-index teardown (the next shot's start).
  const nettedRetained = new Map(); // ball -> its sink entry
  // GH-626 (persistence law): balls settle() leaves RESTING ON A MODELLED
  // CLOSURE — the closure lane's twin of nettedRetained, with a LIFETIME
  // derived from the model rather than copied from the net lane. A
  // Predator well is closed by a solid plug and the resting crown sits ON
  // the bed plane (above the shield line), so the ball is on screen for
  // exactly as long as the kernel says it is in that pocket: there is no
  // ball return and nothing removes it at the next stroke. So the rest
  // SURVIVES the sink-index teardown (shoot()/loadRecord) and clears only
  // when the CUP is cleared — a re-rack disposes the meshes (applyRack), a
  // scripted layout replaces the table state (layout()/loadRecord quiet),
  // or the ball is handed back to the table (pocketed=false: respotCue /
  // flow respots through syncShadows — pruned at every refresh). The
  // kernel state stays Pocketed: activeBalls() excludes it, nothing
  // collides with it, replay/seek of the record that potted it re-derive
  // it unchanged. bindRests counts a retained occupant against its cup's
  // capacity, so a later pot into the same closure takes the overflow
  // lane instead of sharing the station. The occupancy is LIVE-BED truth:
  // the GH-257 Playback borrow/restore carries it BY BALL ID on its
  // per-ball snapshot (snapshotRests / restoreRests below, ridden by
  // playback.js snapLive/restorePoses) — quiet staging clears this map
  // with the table state it replaces, and a pose/flag restore alone would
  // put the ball back on the plug with no owner (review r4 P2). Under a
  // CACHED pre-GH-626 playback.js (no carrier) refreshNets reconstructs the
  // same fact from the restored mesh (review r6 P2: an ADOPTED record,
  // { adopted, pocket, r, seat, rest, pose }, in place of the sink entry).
  const restRetained = new Map(); // ball -> its sink entry (or adopted)
  const REST_CLOCK = 1e6; // deterministic far-past-settle read (settle())
  /** GH-626: before a record's sink index is torn down, every ball it left
   * ON SCREEN at a closure station joins restRetained — the same set
   * settle() builds, re-derived from what is actually showing. settle() is
   * not the only way a ball ends up resting: a DVR scrub back across the
   * pot flips pocketed=false (and any refresh then prunes the entry), and
   * the scrub forward re-poses the ball on the plug WITHOUT a settle. Left
   * to settle() alone, that ball would stay visible on the plug while no
   * longer occupying its cup, and the next pot into it would share the
   * station. Reading the meshes at the teardown closes that gap. */
  const retainRests = () => {
    if (!g.sinkInfo) return;
    for (const b of g.playbackBalls ?? []) {
      const s = g.sinkInfo.get(b.id);
      if (s?.rest && b.pocketed && b.mesh.visible) restRetained.set(b, s);
    }
  };
  const resetNets = () => { // restore every touched sock to base
    let failed = false, firstError;
    for (const fx of netTouched) {
      try { fx.deform([]); } catch (error) { if (!failed) { failed = true; firstError = error; } }
    }
    netTouched.clear();
    for (const [b] of nettedRetained) {
      if (b.pocketed) { // still out of play — park it (GH-276 form)
        b.mesh.visible = false;
        b.mesh.scale.setScalar(1);
        b.mesh.position.set(0, -10, 0);
      }
      // a respotted ball (pocketed=false) is live again — leave it
      // PASS-2 item 1 (review pass2-r1 P2): either way the sock is gone
      // with the sink index — the ball returns to the table environment
      // (layout()/rack revival paths never run poseSink again).
      setNetBallEnv(b, null);
    }
    nettedRetained.clear();
    // GH-626: a retained CLOSURE rest survives this boundary (see
    // restRetained) — only a ball handed back to the table leaves here.
    for (const [b] of restRetained) {
      if (!b.pocketed) { setWellBallOccl(b, null); restRetained.delete(b); }
    }
    // GH-574: an INTERRUPTED playback (layout()/record staging after a
    // ball entered a net but BEFORE settle()) leaves ACTIVE sink balls
    // wearing the sock env (netEnvOn + uGiBallOn 0) with NO
    // nettedRetained entry — the retained loop above cannot see them,
    // and the ball came back to the bed still inside the sock cubemap
    // with baked GI off until the next settle healed it. The sink index
    // dies at every resetNets boundary, so NO ball may keep a sock
    // environment past it: sweep the live set (setNetBallEnv(b, null)
    // no-ops unless the ball rides one — the sweep is idempotent and
    // byte-neutral for every non-interrupted path).
    for (const b of g.ballSet?.balls ?? []) setNetBallEnv(b, null);
    // GH-626 r8: the same sweep for the closure transport — every ball NOT
    // retained on a closure leaves the cup's shade with the sink index (an
    // interrupted drop, a scrubbed-back pot); a retained rest keeps it
    // exactly as it keeps its pose.
    for (const b of g.ballSet?.balls ?? []) {
      if (!restRetained.has(b)) setWellBallOccl(b, null);
    }
    if (failed) throw firstError;
  };
  /** review blocker-cure r5 P2: after a respot removes a ball from a
   * shared net, the REMAINING retained balls repack down the rest
   * ladder (a slot-1 survivor must not float one diameter above the
   * emptied cradle) and every touched sock re-drives from the new
   * poses. Deterministic in the retained membership. */
  const refreshNets = () => {
    // review blocker-cure r6+r8 P2: an equipment preview REBUILDS the
    // visual table without reracking (and may REVERT) — retained
    // entries RE-BIND to the active build's own spec at their pocket
    // (sinkDressFor reads the per-build specs); while the active table
    // has no net capability there (a non-cn8 preview), the ball hides
    // WITHOUT losing its entry, so the revert restores it exactly.
    for (const [b, s] of nettedRetained) {
      if (!b.pocketed) {
        // PASS-2 item 1 (review pass2-r2 P2): a rule-respotted OBJECT
        // ball (flow flips pocketed=false without respotCue) leaves the
        // sock here — restore the table environment with the entry.
        setNetBallEnv(b, null);
        nettedRetained.delete(b); continue;
      }
      if (sinkDressFor) {
        const cur = sinkDressFor(s.pocket.x, s.pocket.z);
        if (cur?.net) {
          if (s.dress !== cur) s.dress = cur; // re-bind to this build
          b.mesh.visible = true;
        } else {
          b.mesh.visible = false; // hidden, retained — revert restores
          b.mesh.position.set(0, -10, 0);
        }
      }
    }
    const groups = new Map(); // net capability -> [[ball, entry]...]
    for (const [b, s] of nettedRetained) {
      const fx = s.dress?.net;
      if (!fx || !b.mesh.visible) continue;
      let a = groups.get(fx);
      if (!a) { a = []; groups.set(fx, a); }
      a.push([b, s]);
    }
    for (const [fx, arr] of groups) {
      // review blocker-cure r9 P2: order by the RECORD's own arrival
      // ladder (the sink entry's rest station) — a mesh-pose sort saw
      // equal parked positions after a non-cn8 preview and restored
      // multi-ball pockets in playback order instead of arrival order
      arr.sort((p, q) => p[1].net.rest.y - q[1].net.rest.y);
      arr.forEach(([b], idx) => {
        const rest = fx.restAt(idx);
        b.mesh.position.set(rest.x, rest.y, rest.z);
      });
    }
    // review blocker-cure r12 P2: ACTIVE sink entries (mid-playback,
    // pre-settle) rebind immediately too — a table preview during
    // PLAYBACK must never pose even one frame on the disposed dress
    // before driveNetDress's own late rebind.
    if (g.sinkInfo && sinkDressFor) {
      for (const [, s2] of g.sinkInfo) {
        // review r13/r15 P2: key the rebind on the PERSISTENT markers
        // (net entry / wasDressed) — a non-cn8 preview nulls s2.dress,
        // and a dress-keyed loop would skip the entry forever on the
        // cn8 revert (incl. beyond-capacity overflow entries)
        if (!s2.net && !s2.wasDressed && !s2.dress) continue;
        const cur2 = sinkDressFor(s2.pocket.x, s2.pocket.z);
        if (cur2 !== s2.dress) s2.dress = cur2;
      }
    }
    // GH-626: the closure rest re-binds on the same boundary and for the
    // same reason — a preview that swaps the Predator away leaves the
    // ball frozen on a plug that no longer exists, and a preview that
    // swaps it IN must catch the ball that is falling right now. bindRests
    // re-derives the whole map from the ACTIVE build's specs (a pure
    // function of the entries + specs), so this is idempotent and a revert
    // restores the original stations exactly. A dressed entry is the net
    // lane's business and never carries a rest.
    // GH-626 persistence: the RETAINED closure rests re-bind on this
    // boundary too — the nettedRetained loop's twin. A ball handed back to
    // the table leaves; while the ACTIVE build publishes a closure at its
    // pocket the ball is re-posed at THAT build's derived station (a pure
    // function of the entry and the spec, so a revert restores the exact
    // pose), and while it does not (a non-Predator preview) the ball hides
    // WITHOUT losing its entry. Runs BEFORE bindRests below so an active
    // record's candidates see the cup's current occupancy.
    {
      // review r6 P2 — the BIDIRECTIONAL fallback (the ownership ledger cache-poison
      // contract, both pairings must degrade WORKING): a fresh game.js under
      // a CACHED pre-GH-626 playback.js has no carrier — the old close path
      // restores pose/flags by id and calls syncShadows -> here — so the
      // occupancy is RECONSTRUCTED from what that restore put on screen. A
      // pocketed ball ON SCREEN that no lane owns (not retained, not netted,
      // not this record's sink lane) standing exactly at a published
      // closure's seat under its own plan (KISS band) can only be a by-id
      // restore of a closure rest: nothing else leaves a pocketed ball
      // visible. It is re-adopted as that cup's occupant with the pose the
      // restore gave it — there is no sink entry to re-derive from — so a
      // preview hides it, a revert restores it and bindRests counts it. The
      // snapshot carrier (snapshotRests/restoreRests) stays the EXACT path
      // and runs first, which makes this a no-op whenever it is present.
      if (sinkRestFor && g.ballSet && g.template) {
        const r = ballR();
        for (const b of g.ballSet.balls) {
          if (!b.pocketed || !b.mesh.visible) continue;
          if (restRetained.has(b) || nettedRetained.has(b)) continue;
          if (g.sinkInfo?.has(b.id)) continue; // this record's lane owns it
          const spec = sinkRestFor(b.mesh.position.x, b.mesh.position.z);
          if (!spec) continue;
          const seat = closureSeatY(spec, r, b.mesh.position.x, b.mesh.position.z);
          if (!(Math.abs(b.mesh.position.y - seat) <= KISS_TOL)) continue;
          restRetained.set(b, {
            adopted: true, pocket: { x: spec.x, z: spec.z }, r, seat,
            rest: { y: seat, tLand: 0, ySurface: spec.ySurface, spec },
            pose: { p: b.mesh.position.clone(), q: b.mesh.quaternion.clone() },
          });
        }
      }
      const heldCups = new Map(); // active spec -> retained occupants
      for (const [b, s] of restRetained) {
        if (!b.pocketed) {
          // a rule respot (flow.js respotBall -> syncShadows) hands the ball
          // back to the table here — it leaves the cup's shade with its
          // entry (review r8: the net lane's twin clears its sock env in
          // exactly this spot; the rest lane had omitted the mirror)
          setWellBallOccl(b, null);
          restRetained.delete(b); continue;
        }
        const cur = sinkRestFor?.(s.pocket.x, s.pocket.z);
        if (!cur) {
          s.rest = null;
          b.mesh.visible = false; // hidden, retained — revert restores
          b.mesh.position.set(0, -10, 0);
          setWellBallOccl(b, null); // r8: no cup here to be in the shade of
          continue;
        }
        let a = heldCups.get(cur);
        if (!a) { a = []; heldCups.set(cur, a); }
        a.push([b, s]);
      }
      for (const [cur, arr] of heldCups) {
        // rest order = arrival order (settle() inserted them as they
        // landed); the capacity is the cup's own (closureCapacity)
        const cap = closureCapacity(cur.ySurface, arr[0][1].r, KISS_TOL);
        arr.forEach(([b, s], idx) => {
          if (s.adopted) {
            // reconstructed occupant (review r6): no entry to re-derive from
            // — the station is the seat the restore put it at and the pose
            // the captured one; while the active build publishes a closure
            // here (cur) it holds its station like any occupant, beyond
            // capacity it overflow-hides like any other
            s.rest = idx < cap
              ? { y: s.seat, tLand: 0, ySurface: cur.ySurface, spec: cur } : null;
            if (s.rest) {
              b.mesh.position.copy(s.pose.p);
              b.mesh.quaternion.copy(s.pose.q);
              b.mesh.visible = true;
              setWellBallOccl(b, cur); // r8: adopted = in the cup's shade
            } else {
              b.mesh.visible = false;
              b.mesh.position.set(0, -10, 0);
              setWellBallOccl(b, null);
            }
            return;
          }
          s.rest = idx < cap ? restEntryFor(s, cur, idx) : null;
          if (s.rest && poseSink(b, s, REST_CLOCK)) {
            b.mesh.visible = true; // (poseSink re-armed the transport)
          } else {
            b.mesh.visible = false;
            b.mesh.position.set(0, -10, 0);
            setWellBallOccl(b, null);
          }
        });
      }
    }
    if (g.sinkInfo) {
      // GH-626 review r1 P2: rebinding the ENTRY is only half of it — the
      // MESH on screen still wears the pose the old binding produced, and
      // during playback (incl. paused, where update() never runs) nothing
      // else will repair it: a landed ball has pocketed=true, so update()'s
      // hide branch (`else if (!b.pocketed)`) is skipped and the ball would
      // hang in the air where the removed plug used to be until settle().
      // So an entry that CHANGED rest membership is re-posed here and now,
      // by the same arithmetic update() uses at the same clock — and its
      // park is UNCONDITIONAL, which is exactly the branch update() cannot
      // take. This is the rest lane's twin of the netted retained loop
      // above, which already hides a ball whose sock a preview removed.
      // SCOPE, and why it is not simply "always": settle() clears a
      // non-netted ball by hiding it (visible=false) while LEAVING the mesh
      // where it rested, so an unconditional re-pose would resurrect every
      // cleared ball on any later equipment preview. The two states that
      // must be repaired are exactly (a) a ball currently ON SCREEN in a
      // sink pose — the only way to be showing a plug that just stopped
      // existing, true in playback and in a post-settle scrub alike — and
      // (b) PLAYBACK, incl. paused, where a ball still mid-drop must pick
      // up a closure the preview just introduced and no frame will run to
      // do it. A hidden ball outside playback is settle()'s cleared state
      // and stays cleared; the next seek() re-poses it from scratch.
      const had = new Map();
      for (const [id, s2] of g.sinkInfo) had.set(id, !!s2.rest);
      bindRests(g.sinkInfo); // cup-wide: capacity is an arrival question
      for (const [id, s2] of g.sinkInfo) {
        // netted/dressed entries carry no rest either side of the rebind,
        // so they take this `continue` and stay byte-identical
        if (had.get(id) === !!s2.rest) continue;
        const i = g.playbackBalls?.findIndex((bb) => bb.id === id) ?? -1;
        if (i < 0) continue;
        const b = g.playbackBalls[i];
        // WHOSE MESH IS THIS (review r2 P1)? g.sinkInfo indexes the WHOLE
        // record, not the sinks live at g.clock, and a respot hands a ball
        // back to the table while its pocket event still sits in the map.
        // Repair only a ball the sink is presenting RIGHT NOW: the sampler
        // must call it Pocketed at the clock we are posing (the same test
        // update()/seek() use to choose the sink lane over the table lane),
        // its pot must already have happened, and outside PLAYBACK it must
        // be a pocketed ball actually on screen — otherwise the mesh
        // belongs to the table lane and posing it would teleport a live
        // ball into a pocket.
        if (!g.sampler || g.buf?.[8 * i + 7] !== 4 /* Pocketed */) continue;
        const sdt = g.clock - s2.t;
        if (sdt < 0) continue;
        if (g.state !== 'PLAYBACK' && !(b.pocketed && b.mesh.visible)) continue;
        if ((s2.net || s2.rest || sdt < (s2.pivot?.ttl ?? SINK_SECONDS))
          && poseSink(b, s2, sdt)) {
          b.mesh.visible = true;
          b.pocketed = !!((s2.net && sdt >= s2.net.tCatch)
            || (s2.rest && sdt >= s2.rest.tLand));
        } else {
          b.pocketed = true;
          b.mesh.visible = false;
          b.mesh.position.set(0, -10, 0); // GH-276 parked form
          setWellBallOccl(b, null);
        }
      }
    }
    // review blocker-cure r11/r15 P2: DURING playback (incl. paused —
    // update() cannot repair a paused frame) the live sink map at the
    // playback clock is the truth; outside playback drive ONLY the
    // RETAINED entries — the surviving replay map could re-dent a
    // reset sock when a layout stood a potted ball near its corner.
    if (g.state === 'PLAYBACK' && g.sinkInfo && g.sampler) {
      driveNetDress(g.sinkInfo, Math.min(g.clock, g.duration + 10));
      return;
    }
    const live = new Map();
    for (const [b, s] of nettedRetained) {
      if (b.mesh.visible) live.set(b.id, s);
    }
    driveNetDress(live, 1e6);
  };
  // GH-490 round-23 (#236-contract drop-path dressing, maintainer
  // disposition 5285804938 item 4): on chinese8 CORNER pockets the
  // drop-visible fabric aperture (Ø 49.7 < ball Ø 57.15) is smaller than
  // the ball and the capture disc (pre-v16 the scaled-CEBP Ø 179.6;
  // catalog v16 calibration B1 repinned it to the drawing's Ø 105 mouth
  // circle at O_f) — the undressed drop crossed the seal/ring plane
  // mid-shelf for 3–7 frames. The scene table publishes per-corner
  // visual specs (sinkDressFor — feature-detected per the cache-poison
  // contract; absent export or non-cn8 class degrades to the undressed
  // drop bit-identically). sinkpivot.js itself is byte-untouched: the
  // dressing wraps its output (orientation kept; position re-dressed).
  let sinkDressFor = null;
  // GH-626 (#488P landing review r2 P1): the OTHER half of the drop-path
  // problem — where the fall STOPS. The generic pose law predates any solid
  // pocket closure: it falls from the lip and culls only once the ball top
  // passes SINK_SHIELD_Y, which is right for every family whose pocket is
  // open below the shield (snooker sock, Diamond boot, the cn8 net lane)
  // and WRONG for the Predator Apex, whose corner/side wells are closed by
  // a solid foam plug one ball diameter below the cloth: the ball sank
  // 54 mm through it before the cull fired. A table that models a closure
  // publishes it (table.js sinkRestFor — the sinkDressFor twin); the drop
  // then RESTS on that surface instead of passing through it. Feature-
  // detected per the cache-poison contract: an absent export (stale
  // table.js, or any family that declares no closure) degrades to the
  // pre-GH-626 fall-and-cull BIT-IDENTICALLY, and the cull mirrors
  // (SINK_SHIELD_Y / SINK_FLOOR_Y, here and in the byte-frozen
  // sinkpivot.js) are read, never moved — the rest law is gated on the
  // resting ball being VISIBLE above the shield, so where the historical
  // cull is already correct nothing changes.
  let sinkRestFor = null;
  // review blocker-cure r10 P2 (mixed-cache law, the ownership ledger): the net
  // refresh is OWNED by the table-rebuild boundary itself — table.js
  // rebuilds on the 'ob:settings' equipment broadcast (its listener
  // registers first at boot), so a cached pre-change settings.js still
  // triggers this refresh. Edge-free seam (no new imports).
  window.addEventListener('ob:settings', (ev) => {
    if (ev?.detail?.key === 'equipment') {
      try { refreshNets(); } catch { /* pre-net table classes */ }
    }
  });
  import('../scene/table.js')
    .then((m) => {
      if (typeof m.sinkDressFor === 'function') sinkDressFor = m.sinkDressFor;
      // GH-626: same guarded feature detection, separate export (a stale
      // cached table.js has neither, or only the first)
      if (typeof m.sinkRestFor === 'function') sinkRestFor = m.sinkRestFor;
    })
    .catch(() => {});
  // g.state mirrors the machine (single source of truth) for existing readers
  Object.defineProperty(g, 'state', { get: () => machine.state });

  function setState(next, info) {
    machine.to(next, info);
  }

  function disposeBalls() {
    if (!g.ballSet) return;
    scene.remove(g.ballSet.group);
    for (const b of g.ballSet.balls) {
      b.mesh.material.map?.dispose();
      b.mesh.material.dispose();
    }
    g.ballSet.balls[0]?.mesh.geometry.dispose();
  }

  /** Compose the rack scenario for the ACTIVE game (feature 011 T015):
   * rack dispatch rides the catalog entry's rack template instead of the
   * old hardcoded engine.nineBallRack. nine_ball deliberately keeps the
   * direct engine.nineBallRack call — its template (nine_standard,
   * shuffle 'none') is the identity permutation, so the direct path is
   * byte-frozen (FR-003) AND doubles as the stale-cache fallback while the
   * games module is unavailable. Other games take the kernel lattice for
   * the template's kernel_kind and apply the seeded id-permutation
   * (eight_wpa: WPA 4.2 — 8 center, one ball of each group on the rear
   * corners, seeded shuffle; positions/topology untouched, pure function
   * of the rack seed so share recipients re-derive it identically).
   * Feature 012 + GH-1042: the snooker/carom kernel kinds compose on the
   * player's spec when its table is in the game's catalog table class (the
   * settings pairing path), else on the kernel's default pairing with the
   * SELECTED cue (seam-staged racks keep a pool spec live, whose table the
   * kernel rejects for these kinds) — see composeKindScenario. A replayed
   * share minted before the fix pins the kernel pairing (setDisciplinePairing),
   * and so does a pre-fix kernel stamp (a cached wasm under fresh app
   * modules): its links carry that stamp, which the frozen-stamp rule
   * replays on the kernel pairing, so the rack must strike on it too.
   * Returns { template, kind } — kind selects the ballset visual mapping. */
  function composeRack(seed) {
    if (g.gameId === 'nine_ball' || !games) {
      return { template: engine.nineBallRack(seed, g.equipment ?? undefined), kind: 'nine' };
    }
    const entry = games.getGameEntry(g.gameId);
    const template = games.resolveRackTemplate(entry.rack_template);
    if (!template) {
      throw new Error(`game '${g.gameId}' has no kernel-backed rack template`);
    }
    const kind = template.kernel_kind;
    const cls = entry.table_class;
    const pinned = g.kernelPairingFor && g.kernelPairingFor === g.equipment;
    const pairing = g.legacyKernel || pinned ? 'kernel'
      : cls?.kind === 'catalog' && Array.isArray(cls.table_ids)
        && cls.table_ids.includes(g.equipment?.table_id) ? 'spec' : 'cue';
    const scenario = composeKindScenario(kind, seed, pairing);
    return {
      template: JSON.parse(
        games.applyRackTemplate(template, scenarioToJson(scenario), seed)),
      kind,
    };
  }

  /** Kernel lattice for a rack kind. Pool kinds carry the active equipment
   * spec. The discipline kinds (feature 012) used to ride the kernel default
   * pairing whatever the player picked, so the HUD cue never struck
   * (GH-1042); `pairing` now picks their spec:
   *   'spec'   the player's spec (composeRack: its table is in the class);
   *   'cue'    the default (seam-staged racks, the rerackKind probe and
   *            Playback's quiet swapBed): a spec whose table IS the kernel's
   *            own pairing table for the kind (a recorded discipline tag)
   *            racks as recorded, every axis kept; any other spec gets the
   *            kernel's default pairing with the SELECTED cue — the pairing
   *            is read from the kernel's no-spec rack tag, never restated
   *            here (with the 'standard' cue it is the no-spec rack byte for
   *            byte);
   *   'kernel' the kernel's default pairing as is (a pre-fix share or a
   *            pre-fix kernel stamp).
   * 'ten' (feature 026, GH-343): a pool kind — equipment rides like
   * nine/fifteen; without this arm the kind would silently fall through
   * to the 9-ball rack. */
  function composeKindScenario(kind, seed, pairing = 'cue') {
    if (kind === 'ten') return engine.tenBallRack(seed, g.equipment ?? undefined);
    if (kind === 'fifteen') return engine.fifteenBallRack(seed, g.equipment ?? undefined);
    if (kind === 'snooker' || kind === 'carom') {
      const build = (spec) => (kind === 'snooker'
        ? engine.snookerRack(seed, spec) : engine.caromStart(true, seed, spec));
      if (pairing === 'spec' && g.equipment) return build(g.equipment);
      const base = build(undefined);
      const tag = base.system?.equipment;
      if (pairing === 'kernel' || !tag) return base;
      if (g.equipment && g.equipment.table_id === tag.table_id) return build(g.equipment);
      const cue = g.equipment?.cue_id ?? 'standard';
      if (cue === (tag.cue_id ?? 'standard')) return base;
      return build({ ...tag, cue_id: cue });
    }
    return engine.nineBallRack(seed, g.equipment ?? undefined);
  }

  /** Shared rerack tail: swap the ball set to a composed template. The
   * ballset visual mapping keys off the RACK KIND (render-capacity.md §2)
   * so pool racks on discipline equipment keep their pre-012 visuals.
   *
   * `quiet` (issue GH-257 — the open-anything Playback law): build the rack
   * WITHOUT the closing setState('AIM', { seed }) emission. That emission is
   * the FRESH-TABLE signal every lane keys off — flow.js resets the match
   * fold and bumps the rack ordinal, drills.js stops a live run, share.js
   * resets the recorder log (which splits the archive session) — so a
   * Playback player that borrows the bed for a cross-game session and hands
   * it back must not emit it in EITHER direction. The machine state is left
   * exactly where the caller had it; the caller owns re-staging playback
   * assets (g.record/g.sampler are freed here, as in every rerack). ONLY the
   * playback restore path passes it (playback.js swapRack/restoreRack). */
  function applyRack(template, kind, seed, { quiet = false, abandon = false } = {}) {
    disposeBalls();
    g.seed = seed;
    g.shotIndex = 0;
    // GH-383: every fresh rack re-seats the classic cue (the carom
    // breaker plays ball 0 — Art 23.2); the flow.js carom fold re-syncs
    // per seat afterwards. QUIET racks are the Playback borrow/restore
    // (GH-257) — they emit no fresh-rack event, so flow.js never
    // re-syncs: the register must survive them (review r2: a two-cue
    // match on the non-breaker's turn otherwise came back from a
    // Playback session striking ball 0 — judged wrong-ball).
    if (!quiet) g.cueBallId = 0;
    g.template = template;
    // GH-383 review r5: record the variant this rack actually PAINTS —
    // label surfaces (aim hints, DVR names/markers) describe the table,
    // never a mid-rack settings flip whose repaint waits for the rerack.
    // review r7: a QUIET rack (the GH-257 Playback borrow/restore) keeps
    // the PAINTED variant — closing Playback must not adopt a deferred
    // settings flip early.
    const paintVariant = quiet
      ? (g.caromSecondBallPainted ?? g.caromSecondBall)
      : g.caromSecondBall;
    g.caromSecondBallPainted = paintVariant;
    g.ballSet = buildBallSet({
      shared, scenarioBalls: template.system.balls, envMap,
      mapping: kind === 'snooker' || kind === 'carom' ? kind : 'pool',
      // GH-383 visual fork (owner pick 2026-08-06: YELLOW, UMB
      // world-championship practice): the carom second cue ball paints
      // yellow (default) or dot-marked white; a stale cached
      // ballset.js ignores the key (yellow-era paint, boot rule 5)
      caromSecondBall: paintVariant,
      // issue #91 (recorded deviation): per-set POOL visuals key off the
      // KERNEL-truth ballset id of the composed template. Legacy WPA paint
      // is guaranteed by BOTH routes: tag ABSENT (kernel-default
      // compositions serde-skip equipment) AND tag PRESENT with a
      // non-styled id (the web-default composition tags pool_standard —
      // no POOL_SET_STYLES entry). Shared-replay transient equipment rides
      // the same key, so replays render the SENDER's set.
      ballsetId: template.system.equipment?.ballset_id,
    });
    scene.add(g.ballSet.group);
    g.rackKind = kind; // the live rack's kernel kind (GH-257: the playback
    // restore re-applies the pre-open rack VERBATIM, and the kind selects
    // the ballset visual mapping — nothing else exposed it)
    g.sampler?.free();
    g.sampler = null;
    g.record = null;
    g.playbackBalls = [];  // the old array points at disposed meshes
    g.sinkInfo = null;
    resetNets(); // B1: sink index rebuilt — nets restore to base
    restRetained.clear(); // GH-626: the cups clear WITH the rack (meshes gone)
    rollFix?.clear(); // issue #50: correction index dies with the sampler
    g.phi = Math.PI / 2; // straight at the rack
    g.lastOutcome = null;
    // GH-1018: `abandon` marks a USER re-rack of the rack in play (HUD
    // Re-rack, a re-racking equipment commit) — flow.js resetMatch seats
    // the abandoned rack's breaker instead of the turn holder. Additive
    // info key: a stale flow.js ignores it (pre-1018 seat carry).
    if (!quiet) setState('AIM', abandon ? { seed, abandon: true } : { seed });
  }

  /** Normalize whatever callers pass (URL param, WIN-path seed+1,
   * window.__test.rerack) — BigInt() traps on fractional input and
   * shot.seed = seed*1000 + shotIndex (see shoot()) must remain an exact
   * non-negative u64 for the kernel's ShotParams.seed. The clamp bound is
   * the SDK's MAX_RACK_SEED so the share codec's validation (share.ts
   * validateGame) and this consumer clamp cannot drift apart. */
  function clampSeed(seed) {
    return Number.isFinite(seed) ? Math.min(Math.trunc(Math.abs(seed)), MAX_RACK_SEED) : 1;
  }

  /** `opts.abandon` (GH-1018): the caller is a USER re-rack that abandons
   * the rack in play — carried on the fresh-table state change (see
   * applyRack). Rulebook re-racks (WIN continuation, re-break decisions)
   * pass nothing and keep their own seat laws. */
  function rerack(seed, { abandon = false } = {}) {
    seed = clampSeed(seed); // defense in depth (see clampSeed)
    // equipment-catalog wave: the rack template is composed by the kernel
    // from the active equipment spec (settings.js setEquipment) — table at
    // the ballset radius, cloth-applied balls, resolved options incl. cue
    const { template, kind } = composeRack(seed); // throws EngineError on reject
    // composeRack's pin predicate: a discipline rack the pre-fix share pin
    // composed on the kernel pairing (swapCue keeps its non-cue axes)
    const pinned = (kind === 'snooker' || kind === 'carom')
      && !!g.kernelPairingFor && g.kernelPairingFor === g.equipment;
    applyRack(template, kind, seed, { abandon });
    // keyed by the rack's own content (geometry + every non-cue option), not
    // its identity: Playback's snapshot/restore re-installs a clone, and may
    // rewrite the clone's equipment tag (playback.restoreLive)
    g.kernelPinned = pinned ? { tag: { ...template.system.equipment },
      key: JSON.stringify([template.system?.table, template.system?.balls,
        { ...template.options, cue: undefined }]) } : null;
  }

  /** Scripted/perf probe (feature 012, render-capacity.md §7): re-rack the
   * SCENE from a raw kernel rack kind on the kernel's default pairing (with
   * the selected cue since GH-1042: composeKindScenario's 'cue' mode),
   * BYPASSING the game catalog readiness gate. Render-evidence surface only
   * (22-ball uniforms, pocketless scenes) — never a gameplay path: the
   * active game/ruleset is untouched, so adjudication of a probe shot is
   * whatever the active game's judge makes of it. Exposed as
   * window.__test.rerackKind by main.js. */
  function rerackKind(kind, seed, opts) {
    seed = clampSeed(seed);
    applyRack(scenarioClone(composeKindScenario(kind, seed)), kind, seed, opts);
  }

  /** Playback restore seam (issue GH-257 — the open-anything law): re-apply
   * an EXACT captured rack instead of recomposing one. The Playback player
   * may re-equip and re-rack the live bed to whatever an archived session
   * needs, and composeRack() could not put the pre-open bed back afterwards
   * (it recomposes from the ACTIVE game + equipment, which the player just
   * changed). So playback.js captures the live rack VERBATIM — template
   * bytes, kernel kind, seed, the equipment spec that composed it — and
   * hands it back here.
   *
   * ALWAYS quiet (applyRack's `quiet`): the restore must be invisible to
   * every fresh-table listener, exactly like the swap that preceded it.
   * `scalars` re-applies the pre-open values applyRack necessarily reset
   * (shotIndex/phi/duration/clock/lastOutcome — the shot seed's ordinal and
   * the "play a shot first" gates ride them); `state`, when given, emits the
   * pre-open machine state with NO info (a bare AIM/BALL_IN_HAND/WIN
   * re-emission is a HUD/button refresh, never a fresh table) — omit it and
   * the machine is left in PLAYBACK for the caller to re-stage the live
   * record into. Returns null on success, an error string otherwise. */
  const RESTORE_SCALARS = ['shotIndex', 'phi', 'duration', 'clock',
    'lastOutcome',
    // GH-383 review r4 (P1): the per-seat cue register must survive the
    // DVR borrow/restore — quiet loadRecord staging rebinds it to each
    // archived record's Strike ball, and no fresh-rack event re-syncs
    // on close (playback.js also re-asserts it AFTER its re-stage step)
    'cueBallId'];
  function restoreRack({ template, kind, seed, equipment = null,
    scalars = null, state = null } = {}) {
    if (!Array.isArray(template?.system?.balls)) return 'not a rack template';
    g.equipment = equipment ? { ...equipment } : null;
    try {
      applyRack(JSON.parse(JSON.stringify(template)), kind, clampSeed(seed),
        { quiet: true });
    } catch (e) {
      return `rack restore failed: ${e.message ?? e}`;
    }
    if (scalars) {
      for (const k of RESTORE_SCALARS) {
        if (scalars[k] !== undefined) g[k] = scalars[k];
      }
    }
    // dvr-marked (GH-257 review round-3 P2): this re-emission RESTORES a
    // state the table already earned — flow.js reads a bare BALL_IN_HAND
    // as a fresh foul (banner + timer), which a restore must not re-judge.
    // Callers that must re-apply POSES over the rebuilt ball set first
    // (the authored-layout restore) pass no state here and emit through
    // emitRestoredState below AFTER the poses land (review round-4 P2:
    // emitting over the full rebuilt rack painted flow's rack tracker
    // from balls the pose re-apply was about to pocket, silently).
    if (state) setState(state, { dvr: true });
    return null;
  }

  /** DVR close companion to restoreRack (GH-257 review round-4 P2): the
   * pre-open machine state, re-emitted dvr-marked once the caller has
   * finished re-posing the table it describes. */
  function emitRestoredState(state) {
    setState(state, { dvr: true });
  }

  /** Engine rack builders return live Scenario objects; templates from
   * composeRack are JSON.parse products — clone so both paths hand
   * applyRack plain serializable data (determinism-log parity). */
  function scenarioClone(s) {
    return JSON.parse(scenarioToJson(s));
  }

  function cueBall() {
    // GH-383 (review landing r2): DURING playback the striker IS the
    // playing record's own Strike ball (the record-anchored law applied
    // to the accessor) — an in-app Replay of a turn-passing two-cue shot
    // runs while the register already points at the INCOMING seat's
    // ball, and camera side/follow presets must track the REPLAYED
    // striker. Derived, never written: the register stays single-writer
    // and nothing needs restoring at settle. For fresh shots and DVR
    // stagings the record's Strike equals the register (shoot()/
    // loadRecord bind it), so this branch is behavior-neutral there.
    if (g.state === 'PLAYBACK' && g.record) {
      const sk = g.record.events?.[0]?.kind?.Strike?.ball;
      const rb = Number.isFinite(sk)
        && g.ballSet.balls.find((b) => b.id === sk);
      if (rb) return rb;
    }
    // GH-383: the live cue is the ball flow.js assigned for the seat
    // (carom two-cue: seat != breaker plays ball 1); every other
    // discipline keeps the classic id 0. Fallback to 0 if the assigned
    // id vanished (defensive — a re-rack resets the assignment).
    return g.ballSet.balls.find((b) => b.id === g.cueBallId)
      ?? g.ballSet.balls.find((b) => b.id === 0);
  }

  /** GH-383: assign the struck-ball id for subsequent aiming/strikes
   * (flow.js carom seat sync). Refuses unknown ids (keeps the current
   * assignment) so a stale caller can never orphan the cue accessor. */
  function setCueBallId(id) {
    if (!g.ballSet?.balls.some((b) => b.id === id)) return false;
    g.cueBallId = id;
    return true;
  }

  function activeBalls() {
    return g.ballSet.balls.filter((b) => !b.pocketed);
  }

  /** Kernel-frame placements of the active balls, with resting-contact
   * sanitation: resolve_cluster can settle touching pairs up to ~3e-5 m
   * INSIDE 2r, which the SDK validator (EPS_KISS 1e-6) rejects — so a
   * settled table could refuse to re-simulate (QA blocker: preview threw
   * every frame, shoot wedged SIMULATING). Clamp near-contact pairs to
   * exactly 2r: pure, deterministic, order-stable — shared by game.shoot
   * and the aim preview so their scenario bytes stay identical. Genuine
   * overlaps (> TOL) are left for the validator to reject (handled
   * gracefully by the callers). Kernel/SDK epsilon reconciliation tracked
   * separately. */
  function kernelPlacements() {
    const r = g.template.system.balls[0].params.r;
    const pts = activeBalls().map((b) => {
      const pos = threePosToK(b.mesh.position);
      return { id: b.id, x: pos.x, y: pos.y };
    });
    const TOL = 1e-4;
    // relax to convergence: contact CHAINS (e.g. 1-3 and 3-9 both touching)
    // re-shrink an already-separated pair when a later pair pushes the
    // shared ball — one pass is not enough. Deficits are ~1e-5 so a few
    // passes converge; the 1e-9 margin gives chains headroom above the
    // validator's EPS. Deterministic (fixed iteration order).
    for (let pass = 0; pass < 8; pass++) {
      let moved = false;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[j].x - pts[i].x, dy = pts[j].y - pts[i].y;
          const d = Math.hypot(dx, dy);
          if (d < 2 * r && d > 2 * r - TOL && d > 1e-12) {
            const push = (2 * r + 1e-9 - d) / 2;
            const ux = dx / d, uy = dy / d;
            pts[i].x -= ux * push; pts[i].y -= uy * push;
            pts[j].x += ux * push; pts[j].y += uy * push;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    return pts;
  }

  /** SDK Scenario for the CURRENT table state + the given shot params
   * (ScenarioBuilder mirrors the kernel's placement/shot validation). */
  function buildScenario(shot) {
    const params = g.template.system.balls[0].params;
    const builder = new ScenarioBuilder(g.template.system.table);
    for (const b of kernelPlacements()) {
      // on-bed exactly (v1 kernel: z ≡ R while on table) — .ball() sets z = R
      builder.ball(b.id, { x: b.x, y: b.y, params });
    }
    // carry the template's equipment provenance tag so every ShotRecord
    // pins the catalog ids it was simulated with (share replays byte-match)
    if (g.template.system.equipment) builder.equipment(g.template.system.equipment);
    // GH-383 (kernel Amendment 026): a non-zero struck-ball id rides the
    // options; the default path stays byte-identical (key omitted, so
    // every non-carom scenario hash is unchanged — determinism doctrine).
    const options = g.cueBallId !== 0
      ? { ...g.template.options, cue_ball: g.cueBallId }
      : g.template.options;
    return builder.shot(shot).options(options).build();
  }

  /** Simulate + start playback. Returns null on success, error string else. */
  function shoot({ v0, theta, a, b }) {
    if (!machine.is('AIM', 'BALL_IN_HAND')) return 'not in an aiming state';
    const prev = machine.state;
    const shot = { v0, phi: g.phi, theta, a, b, seed: g.seed * 1000 + g.shotIndex };
    setState('SIMULATING', { shot });
    // Determinism doctrine (issue #14): serialize ONCE, submit those exact
    // bytes, and log them — scenario construction must be a pure function of
    // explicit state (template + active ball poses + shot), so two boots fed
    // identical scripted inputs must submit byte-identical JSON. e2e.mjs
    // asserts this via __test.scenarios(); the hash makes any divergence
    // visible in every console log without dumping kilobytes per shot.
    let scenarioJson;
    try {
      scenarioJson = scenarioToJson(buildScenario(shot));
    } catch (e) {
      // builder validation (ValidationError) must never wedge SIMULATING
      setState(prev, { error: e.message ?? String(e) });
      return e.message ?? String(e);
    }
    g.scenarioLog.push(scenarioJson);
    if (g.scenarioLog.length > SCENARIO_LOG_CAP) g.scenarioLog.shift();
    console.log(`[app] scenario seed=${shot.seed} fnv1a=${fnv1a(scenarioJson)}`);
    let recordJson;
    try {
      recordJson = engine.simulateJson(scenarioJson);
    } catch (e) {
      setState(prev, { error: e.message ?? String(e) });
      return e.message ?? String(e); // ValidationError / EngineError
    }
    g.record = JSON.parse(recordJson);
    retainRests(); // GH-626: what rests on a closure stays (see restRetained)
    g.sinkInfo = null;
    resetNets(); // B1: sink index rebuilt — nets restore to base
    g.sampler?.free();
    g.sampler = engine.sampler(recordJson);
    g.buf = g.sampler.data; // SDK-owned reusable flat sample buffer
    g.playbackBalls = activeBalls(); // sampler order = scenario order = active order
    // issue #50: index the pure-roll correction BEFORE playback (samples the
    // sampler at anchor times, clobbering g.buf — every frame re-samples)
    rollFix?.setShot(g.record, g.sampler);
    g.duration = recordDuration(g.record);
    g.clock = 0;
    g.shotIndex += 1;
    for (const b of g.playbackBalls) b.baseQuat.copy(b.mesh.quaternion);
    // `strike: true` (ADDITIVE info flag, design 277 slice 3): this entry
    // is a LIVE STROKE — a fresh simulate of the player's own shot (or a
    // shared-replay re-simulation, which routes through here too). The
    // cue post-strike live lane (cuepostlive.js) keys its arm off it;
    // loadRecord's default-path entry below stays UNFLAGGED on purpose
    // (batch/render harnesses — published packs stay byte-reproducible).
    setState('PLAYBACK', { duration: g.duration, strike: true });
    return null;
  }

  function replay() {
    if (!g.sampler || g.state === 'PLAYBACK') return;
    // rewind: restore pre-shot poses come free — the sampler at t=0 IS the
    // pre-shot state; un-pocket any balls that fell during that shot
    for (const b of g.playbackBalls) {
      if (b.pocketed) { b.pocketed = false; b.mesh.visible = true; }
      b.sinkT = -1;
      b.mesh.scale.setScalar(1);
    }
    g.clock = 0;
    setState('PLAYBACK', { duration: g.duration, replay: true });
  }

  /**
   * Scripted-capture (issue #154 render hooks; `window.__test.loadRecord`):
   * play an EXTERNALLY produced ShotRecord through the app's playback path
   * — the shoot() tail over a caller-supplied record instead of a fresh
   * simulate. Batch replay renders (Venom W4) and cross-build diagnostics
   * hand records to the app this way; nothing in the interactive game calls
   * it. Returns null on success, an error string otherwise (the shoot()
   * convention).
   *
   * Version policy: STRICT by default — `record.kernel_version` must equal
   * this engine's version (constitution P-III: cross-version replay is not
   * bit-reproducible). `{ allowVersionMismatch: true }` opts into a
   * DIAGNOSTIC render of a foreign-build record: the kernel-side sampler
   * parse is unconditionally strict, so the version string is restamped on
   * the JSON handed to the sampler ONLY (sampling is a pure function of the
   * event stream); `g.record` keeps the original bytes/provenance. The
   * splice re-serializes the parsed record, so u64 shot seeds above 2^53−1
   * lose precision on this path — acceptable for a render-only diagnostic.
   *
   * Staging: the current ball set is laid out at the record's initial
   * placements via layout() (balls absent from the record are treated as
   * pocketed). Ball ids must all exist in the ACTIVE rack — callers rerack
   * / rerackKind onto matching equipment first (a snooker record needs the
   * snooker ball set). Table-geometry visuals (bed, pocket sink cups)
   * follow the ACTIVE template; a dimension mismatch with the record's
   * table warns and proceeds (render-harness judgment call).
   *
   * `stage: 'quiet'` (issue #225 Phase B — the multi-shot render engine):
   * re-stage playback assets for ANOTHER record while the machine is
   * ALREADY in PLAYBACK, emitting NO state changes at all. The offline
   * drill renderer swaps records between segments under manual mode; the
   * default path's setState('AIM', { layout: true }) emission would clear
   * flow.js's replay-identity guard and reset the match fold mid-render
   * (double adjudication, phantom drill attempts, duplicate share-log
   * shots). Quiet staging also pins every staged ball's baseQuat to
   * IDENTITY — the mesh orientation at stage time is a function of
   * whatever rendered before, so identity makes each segment a pure
   * function of its record (deterministic re-renders); the engine restores
   * the live bases itself after its final re-stage. `recordRef`: after a
   * quiet staging, adopt the caller's ORIGINAL record object as g.record
   * (its bytes must equal recordJson) so the post-export settle re-emits
   * shotComplete with the IDENTICAL object and every identity-keyed dedup
   * (flow/share/drills lastRecord) routes it as a replay, never a fresh
   * shot. Default-path behavior is byte-identical to pre-#225.
   *
   * `stage: 'playback'` (issue GH-257 — the open-anything Playback law):
   * quiet staging that may ENTER playback from ANY state. It is the quiet
   * body (no layout() 'AIM' emission, no SIMULATING, lastOutcome preserved,
   * baseQuats pinned to identity) followed by EXACTLY ONE emission —
   * setState('PLAYBACK', { duration, replay: true, dvr: true }) — and only
   * when the machine is not already there. REPLAY-class, not bare (GH-257
   * review P1): a bare PLAYBACK with a pending drill re-lay reads as a
   * stroke in drills.js (voidShot latched + the re-lay timer cleared, and
   * the NEXT legitimate stroke was discarded); `replay: true` is honest —
   * the close restore re-stages with recordRef, so the close settle really
   * does route the replay-identity paths — and drills' replay branch parks
   * then reschedules the re-lay exactly as for an in-app Replay. `dvr:
   * true` additionally marks the borrow so drills keeps the placement
   * grant alive (Playback hands the table back; the grant has no restore
   * path). No lane treats this transition as a fresh table, so borrowing
   * the live bed costs the match fold / drill run / recorder log / archive
   * session nothing. The player used to reach PLAYBACK through
   * game.replay(), which needs a LIVE sampler and therefore refused every
   * no-shot-yet entry state; this needs neither.
   */
  function loadRecord(recordJson, { allowVersionMismatch = false,
    stage = null, recordRef = null } = {}) {
    const entering = stage === 'playback';
    const quiet = entering || stage === 'quiet';
    if (!entering && (quiet ? machine.state !== 'PLAYBACK'
      : !machine.is('AIM', 'BALL_IN_HAND'))) {
      return quiet ? 'quiet staging requires PLAYBACK'
        : 'not in an aiming state';
    }
    let json = typeof recordJson === 'string'
      ? recordJson : JSON.stringify(recordJson);
    let record;
    try {
      record = JSON.parse(json);
    } catch (e) {
      return `record parse failed: ${e.message ?? e}`;
    }
    if (typeof record?.kernel_version !== 'string'
      || !Array.isArray(record?.initial?.balls) || !record?.shot) {
      return 'not a ShotRecord (missing kernel_version / initial.balls / shot)';
    }
    const kv = engine.version();
    if (record.kernel_version !== kv) {
      // GH-318: a KERNEL_COMPAT_LINEAGE-proven stamp pair is the SAME
      // engine byte-for-byte (Gate G-KERNEL corpus proof — version-only
      // repins), so a lineage-old record is a NORMAL replay, not a
      // cross-version diagnostic: no refusal, no warn. The stamp is
      // still spliced for the sampler (its parse is unconditionally
      // strict; sampling is a pure function of the event stream, and
      // `g.record` keeps the original bytes/provenance) — the exact
      // splice each repin ceremony byte-proved on the legacy-links
      // fixtures. Genuinely different kernels keep the P-III
      // strict-replay law byte-untouched below. A stale cached dist
      // share.js (no lineageCompatible export) answers undefined and
      // degrades to the strict pre-318 policy — refusal, never a
      // silently unproven replay.
      const lineageOk =
        shareSdk.lineageCompatible?.(record.kernel_version, kv) === true;
      if (!lineageOk) {
        if (!allowVersionMismatch) {
          return `record kernel "${record.kernel_version}" != app kernel `
            + `"${kv}" — strict replay policy (P-III); pass `
            + `{ allowVersionMismatch: true } for a cross-version DIAGNOSTIC render`;
        }
        console.warn(`[game] loadRecord: cross-version DIAGNOSTIC render `
          + `(record ${record.kernel_version}, kernel ${kv})`);
      }
      json = JSON.stringify({ ...record, kernel_version: kv });
    }
    const missing = record.initial.balls
      .filter((rb) => !g.ballSet.balls.some((b) => b.id === rb.id))
      .map((rb) => rb.id);
    if (missing.length) {
      return `record balls [${missing.join(', ')}] not in the current rack — `
        + 'rerack/rerackKind onto matching equipment first';
    }
    const rt = record.initial.table, at = g.template?.system?.table;
    if (rt && at && (Math.abs(rt.length - at.length) > 1e-9
      || Math.abs(rt.width - at.width) > 1e-9)) {
      console.warn('[game] loadRecord: record table dims differ from the '
        + 'active rack — table visuals/pocket sinks follow the ACTIVE '
        + 'equipment; rerack on matching equipment for faithful staging');
    }
    // build the sampler BEFORE touching any state so a rejected record
    // leaves the table exactly as it was
    let sampler;
    try {
      sampler = engine.sampler(json);
    } catch (e) {
      return `record rejected by the kernel sampler: ${e.message ?? e}`;
    }
    const specs = record.initial.balls.map((b) => (
      { id: b.id, x: b.state.pos.x, y: b.state.pos.y }));
    if (quiet) {
      // the layout() body WITHOUT the setState('AIM', { layout: true })
      // emission — and without clearing lastOutcome (the pre-export outcome
      // must survive the render for the engine's restore path)
      restRetained.clear(); // GH-626: same table-state replacement as layout()
      for (const b of g.ballSet.balls) setWellBallOccl(b, null); // r8
      for (const b of g.ballSet.balls) {
        const s = specs.find((sp) => sp.id === b.id);
        b.pocketed = !s;
        b.mesh.visible = !!s;
        b.mesh.scale.setScalar(1);
        b.sinkT = -1;
        if (s) kPosToThree(b.mesh.position, s.x, s.y, ballR());
      }
      syncSphereUniforms(shared, g.ballSet.balls);
    } else {
      layout(specs);
    }
    g.phi = record.shot.phi;
    // GH-383 (review r3): bind the cue register to the record's own
    // STRUCK ball — camera presets and offline-render DOF resolve
    // game.cueBall() while a staged record plays, and a seat-2 two-cue
    // carom record strikes ball 1. Guarded to ids present in the rack
    // (the missing-balls gate above already proved membership); the next
    // non-quiet rack resets it.
    {
      const sk = record.events?.[0]?.kind?.Strike?.ball;
      if (Number.isFinite(sk)
        && g.ballSet.balls.some((b) => b.id === sk)) g.cueBallId = sk;
    }
    if (!quiet) setState('SIMULATING', { shot: { ...record.shot } });
    // shoot() tail over the external record (kept in lockstep with shoot())
    g.record = quiet && recordRef ? recordRef : record;
    retainRests(); // GH-626: what rests on a closure stays (see restRetained)
    g.sinkInfo = null;
    resetNets(); // B1: sink index rebuilt — nets restore to base
    g.sampler?.free();
    g.sampler = sampler;
    g.buf = g.sampler.data;
    // sampler row order = record.initial.balls order (SDK Sampler contract)
    // — NOT this rack's active-ball order; map explicitly
    g.playbackBalls = record.initial.balls.map((rb) => g.ballSet.balls
      .find((b) => b.id === rb.id));
    rollFix?.setShot(record, g.sampler);
    g.duration = recordDuration(record);
    g.clock = 0;
    if (quiet) {
      for (const b of g.playbackBalls) b.baseQuat.identity();
    } else {
      for (const b of g.playbackBalls) b.baseQuat.copy(b.mesh.quaternion);
      setState('PLAYBACK', { duration: g.duration });
    }
    // the ONE emission of the 'playback' stage (idempotent: a caller
    // already in PLAYBACK — the scrub path — emits nothing at all).
    // REPLAY-class + dvr-marked, never bare (GH-257 review P1 — the header
    // doc): a bare emission read as a stroke in drills.js and voided the
    // next legitimate attempt; dvr preserves the placement grant.
    if (entering && machine.state !== 'PLAYBACK') {
      setState('PLAYBACK', { duration: g.duration, replay: true, dvr: true });
    }
    return null;
  }

  /**
   * Scripted-capture: place balls at kernel (x, y) on the bed; balls not in
   * `specs` are treated as pocketed (hidden, excluded from the scenario).
   */
  function layout(specs) {
    // review blocker-cure r4 P2: a scripted layout REPLACES the table
    // state (drills/playground) — netted rests and their sock
    // deformations clear with it, exactly like a rack teardown.
    resetNets();
    restRetained.clear(); // GH-626: a laid table has no held cups
    for (const b of g.ballSet.balls) setWellBallOccl(b, null); // r8
    for (const b of g.ballSet.balls) {
      const s = specs.find((s) => s.id === b.id);
      b.pocketed = !s;
      b.mesh.visible = !!s;
      b.mesh.scale.setScalar(1);
      b.sinkT = -1;
      if (s) kPosToThree(b.mesh.position, s.x, s.y, ballR());
    }
    // GH-383 review r9: a scripted scene that omits the ASSIGNED cue
    // (playground Clear lays only ball 0; drills lay pool scenes) must
    // not leave the register pointing at a hidden ball — buildScenario
    // would emit a cue_ball the placements omit and every shot would be
    // refused. An absent assigned cue resets to the classic 0; carom
    // folds re-sync per seat on their own state edges.
    if (!g.ballSet.balls.some((b) => !b.pocketed && b.id === g.cueBallId)) {
      g.cueBallId = 0;
    }
    // issue GH-158: the last shot's playback assets (record, sampler, sink
    // index, #50 roll-correction index) SURVIVE a layout. Drill attempt
    // re-lays (drills.js applyAttempt / run-continue) and the playground
    // clear land here ~1.4 s after every settle, and freeing the sampler
    // made the just-played stroke un-exportable ("play a shot first") and
    // un-replayable the moment the re-lay landed. replay()/export re-pose
    // g.playbackBalls from the retained sampler; the existing
    // replay-identity paths restore table truth after the re-settle
    // (flow.js routeReplay respots; drills.js's lastRecord branch
    // reschedules the attempt re-lay). playbackBalls stays valid: layout
    // never rebuilds the ball set — only applyRack disposes it, and
    // applyRack still frees, so a re-rack is a fresh context and the
    // fresh-boot "play a shot first" gate keys off that null sampler.
    g.lastOutcome = null;
    syncSphereUniforms(shared, g.ballSet.balls);
    setState('AIM', { layout: true });
  }

  /** Lazily index the record's BallPocket events: ball id → { t, pos, vel,
   * pocket, glide, pivot } with pos/vel the ball's jaw pose + entry velocity
   * sampled just BEFORE capture, pivot the precomputed #236 lip-pivot entry
   * (null on the degrade paths) and pocket the nearest cup. The cups come from the
   * ACTIVE table's pocket list (feature 012, render-capacity.md §4 — the
   * frozen 9-ft TABLE mirror was ~0.5 m off on the 12-ft snooker table), in
   * kernel Table serde shape mapped to the three frame (three.x = kernel.y,
   * three.z = kernel.x); pocketless tables skip entirely (no BallPocket
   * event can exist — FR-006 — but the guard keeps the invariant local).
   * Everything the drop needs is precomputed so both seek() and update()
   * can replay the sink as a PURE function of (t - pocketT) — framestep
   * capture must match realtime presentation exactly. */

  /** GH-626: the SOLID-CLOSURE rest entry for one sink, or null.
   *
   * `spec` is the table's published support geometry (table.js sinkRestFor:
   * ySurface / rSupport / rVent / rSeat / taper); the ball radius is ours,
   * so the rest centre is spec.ySurface + r — the ball sitting ON the
   * surface, no new number anywhere. On the Predator that evaluates to
   * −57.15 + 28.575 = −28.575 mm, i.e. the resting crown exactly on the bed
   * plane, which is the datum the plug depth was derived for in the first
   * place — when the bottom point lands on the face; over the plug's vent
   * the sphere seats on the vent rim, slightly lower (the h(d) term in the
   * body).
   *
   * GATE — and this is what keeps the frozen cull mirrors authoritative: a
   * closure BELOW the shield line needs no dressing, because the historical
   * cull already hides the ball before it can reach the surface. The rest
   * law only engages when the resting ball is still VISIBLE, i.e. when its
   * crown (ySurface + 2r) is at or above SINK_SHIELD_Y. Nothing here moves
   * the shield or the floor; they are read as the visibility contract they
   * are (web/scene/pocket-geometry.md).
   *
   * `tLand` is the first dt at which the visible fall reaches that centre,
   * found by BISECTION ON THE PUBLIC POSE — the same "precompute the
   * schedule from the identical arithmetic poseSink replays" idiom the
   * dressed path uses for tSeat, so schedule and pose cannot drift, and
   * sinkpivot.js stays byte-frozen and unread-into (no private fields).
   * The descent is monotone in this region, so the bisection is exact to
   * its iteration budget. Past tLand poseSink samples the pose law at a
   * CLAMPED dt: position AND orientation freeze at the touchdown pose. The
   * dead stop is the model, not a shortcut — the part is a foam DAMPENER
   * (FT-POCKET-FAMILY), and the kernel's own pocket resolver zeroes v and ω
   * at capture (resolve/pocket.rs); the visible drop borrows the pre-capture
   * motion for the airborne leg only, and support restores the kernel
   * convention. Pure in (entry, spec) and precomputed, so update()/seek()
   * stay random-access identical. */
  function restEntryFor(s, spec, idx = 0) {
    if (!spec) return null;
    // occupant idx sits on the closure (idx 0) or on the occupant below it:
    // centre = ySurface + (2·idx + 1)·r, the contact geometry of equal
    // spheres on a plane. bindRests never passes an idx the cup cannot hold.
    // This FLAT datum is the seat's upper bound (see the vent term below),
    // which is exactly what the shield gate and closureCapacity need.
    const yFlat = spec.ySurface + (2 * idx + 1) * s.r;
    if (yFlat + s.r < SINK_SHIELD_Y) return null; // culled anyway — legacy path
    // GH-626 review r5 P2: the support face is an ANNULUS — spec.rVent is
    // the plug's vent (FT-PLUG-VENT; absent/0 = solid disc, so a stale
    // table.js keeps the flat law). A sphere whose bottom point lands a plan
    // distance d from the closure axis rests ON the face when d ≥ rVent;
    // inside the vent nothing is under its bottom point and it settles onto
    // the vent RIM: the sphere's section at the face plane, radius
    // sqrt(r² − h²), is internally tangent to the vent circle,
    // sqrt(r² − h²) + d = rVent, hence
    //   h(d) = sqrt(r² − max(0, rVent − d)²)      (h = r on the face).
    // Pure geometry of the published radii and the ball — no new number —
    // and it only ever LOWERS the seat (by r − sqrt(r² − rVent²) at most:
    // 0.69 / 0.87 mm on the Predator corner / side), so the flat datum
    // above stays the bound. A vent wider than the ball's section has no
    // rim to catch it (g ≥ r): no support at that plan, the drop is not a
    // candidate and keeps the legacy lane. Occupant idx > 0 sits on the
    // ball below, not on the face (the capacity law's equal-spheres
    // idealization), so the vent term is the SUPPORTED ball's alone.
    const seatAt = (px, pz) => (idx === 0
      ? closureSeatY(spec, s.r, px, pz) : yFlat);
    let y = yFlat;
    let tLand = null;
    if (s.pivot && sinkFx) {
      // poseInSink returns null past the shield, which is strictly BELOW
      // the rest centre here (the gate above) — treat it as "below".
      const below = (t) => {
        const p = sinkFx.poseInSink(s.pivot, t, sinkPoseTmp);
        return !p || p.y <= seatAt(p.x, p.z);
      };
      let hi = s.pivot.ttl ?? SINK_SECONDS;
      if (!below(hi)) return null; // never reaches the surface in budget
      let lo = 0;
      for (let it = 0; it < 24; it++) {
        const mid = (lo + hi) / 2;
        if (below(mid)) hi = mid; else lo = mid;
      }
      tLand = hi;
      // the station is the seat under the LANDING plan — poseSink freezes
      // the plan with the clock, so the seat it clamps to is this one.
      const pl = sinkFx.poseInSink(s.pivot, tLand, sinkPoseTmp);
      if (pl) y = seatAt(pl.x, pl.z);
      if (!Number.isFinite(y)) return null;
    } else {
      // legacy glide: y = s.r + pop − ½g·tf², tf = dt − tFall (the pop
      // window is over long before the ball is a diameter down), so the
      // touchdown is the closed-form root of the same parabola. This is the
      // no-pivot-leaf degrade lane; its bezier plan has no closed-form
      // landing point, so it seats on the flat datum (at most the vent
      // sink, < 1 mm, high).
      const tFall = s.tFall ?? 0.35 * s.glide;
      tLand = tFall + Math.sqrt(2 * Math.max(0, s.r - y) / SINK_G);
    }
    // `spec` rides along for the transport (setWellBallOccl): the entry's
    // bound closure, re-bound with the entry at every refreshNets.
    return { y, tLand, ySurface: spec.ySurface, spec };
  }

  /** GH-626 review r5: seat height of the SUPPORTED ball's centre over a
   * published closure whose bottom point lands at plan (px, pz). The face is
   * an annulus (spec.rVent — the plug's vent; absent/0 = solid disc): on the
   * face (d ≥ rVent) the seat is ySurface + r; inside the vent the sphere
   * settles onto the vent rim, ySurface + sqrt(r² − (rVent − d)²); a vent
   * wider than the sphere's section has no rim to catch it (−Infinity: no
   * support at that plan). Pure in (spec, r, plan); shared by restEntryFor
   * and the review r6 reconstruction so the two cannot drift. */
  function closureSeatY(spec, r, px, pz) {
    const rV = spec.rVent > 0 ? spec.rVent : 0;
    const g = Math.max(0, rV - Math.hypot(px - spec.x, pz - spec.z));
    if (g >= r) return -Infinity;
    return spec.ySurface + Math.sqrt(r * r - g * g);
  }

  /** GH-626 review r2 P2: assign the closure rest PER CUP, in arrival order,
   * up to the cup's own capacity — one shot can pot two balls into the same
   * Predator corner, and a per-event bind gave both the identical rest
   * transform (two meshes in one place until settle).
   *
   * CAPACITY IS DERIVED, not chosen — closureCapacity (module scope): an
   * occupant k (0-based) stacked on the closure has its centre at
   * ySurface + (2k+1)·r and its crown at ySurface + (2k+2)·r, and it is
   * only IN the well while that crown stays at or below the bed plane —
   * the datum the plug depth itself was derived against
   * (FT-PLUG-THICKNESS). So cap = floor(−ySurface / 2r), floored at zero,
   * which on the Predator (ySurface = −2r exactly) evaluates to ONE, would
   * grow only for a deeper closure, and is ZERO for one shallower than a
   * diameter (the whole cup then keeps the legacy lane).
   *
   * Beyond capacity the entry keeps the legacy drop lane — the same posture
   * the cn8 net lane already takes for its own overflow (`idx >= cap` in the
   * B1 slot pass): the dossier carries no ball-return or stacking law, and
   * inventing a presentation for a ball the modelled well cannot hold would
   * be an unauthored model. Idempotent and a pure function of the map + the
   * ACTIVE build's specs, so preview/revert restores exactly. */
  function bindRests(map) {
    const cups = new Map(); // published spec -> candidates
    // GH-626 persistence: a ball settle() left resting on a closure still
    // OCCUPIES its station until the cup is cleared, so this record's
    // candidates queue behind it. A retained ball that THIS record also
    // indexes is the same ball being replayed (or re-bound after its own
    // settle) — it is re-derived as a candidate below, not double-counted.
    const held = new Map(); // published spec -> stations already taken
    for (const [b, s] of restRetained) {
      if (!b.pocketed || map.has(b.id)) continue;
      const spec = sinkRestFor?.(s.pocket.x, s.pocket.z);
      if (spec) held.set(spec, (held.get(spec) ?? 0) + 1);
    }
    for (const [id, s] of map) {
      s.rest = null;
      // a DRESSED entry is the cn8 mouth graft's business end to end (its
      // own release/seat/net schedule); no dressed family publishes a
      // closure, so the two laws can never both drive one drop.
      if (s.dress) continue;
      const spec = sinkRestFor?.(s.pocket.x, s.pocket.z);
      if (!spec) continue;
      // the station-0 entry IS the arrival probe: its tLand is the dt at
      // which THIS drop reaches the crest, so s.t + tLand is the absolute
      // touchdown. A drop that never reaches the crest inside its own
      // budget is not a candidate at all — the legacy lane owns it, and it
      // must not consume a station a later ball does reach.
      const e0 = restEntryFor(s, spec, 0);
      if (!e0) continue;
      let a = cups.get(spec);
      if (!a) { a = []; cups.set(spec, a); }
      a.push({ id, s, e0, arrival: s.t + e0.tLand });
    }
    for (const [spec, arr] of cups) {
      // order by TOUCHDOWN, not by capture (review r3 P2) — the same law the
      // B1 net slot pass already states for its cradle: drop durations vary
      // with entry speed and geometry, so a later-but-faster ball can reach
      // the empty station first, and the ball that PHYSICALLY gets there
      // first is the one the closure supports. Capture time and ball id
      // remain as tiebreaks so the order is total and deterministic.
      arr.sort((p, q) => p.arrival - q.arrival
        || p.s.t - q.s.t || p.id - q.id);
      // capacity is the cup's own (closureCapacity: crown at or below the
      // bed plane, floored at ZERO — a closure shallower than one diameter
      // holds nothing and the whole cup keeps the legacy lane); stations
      // already held by retained occupants come off the top.
      const cap = closureCapacity(spec.ySurface, arr[0].s.r, KISS_TOL);
      const base = held.get(spec) ?? 0;
      arr.forEach((c, idx) => {
        const st = base + idx;
        if (st >= cap) return; // overflow keeps the legacy drop lane
        c.s.rest = st === 0 ? c.e0 : restEntryFor(c.s, spec, st);
      });
    }
  }

  function sinkIndex() {
    if (g.sinkInfo) return g.sinkInfo;
    g.sinkInfo = new Map();
    const cups = (g.template.system.table.pockets ?? [])
      .map((p) => ({ x: p.center.y, z: p.center.x, r: p.radius }));
    if (cups.length === 0) return g.sinkInfo; // pocketless (carom)
    // GH-490 BLOCKER-CURE B1: per-cup net candidates — slots assign by
    // NET-ARRIVAL order in the pass below (review r14 P2)
    const netCups = new Map();
    for (const e of g.record?.events ?? []) {
      const k = e.kind?.BallPocket;
      if (!k) continue;
      const i = g.playbackBalls.findIndex((b) => b.id === k.ball);
      if (i < 0) continue;
      // review r2 P2: bound every finite-difference window to the ball's
      // FINAL pre-capture motion leg — a cushion/ball impact inside the
      // window would otherwise average across the collision and skew (or
      // reverse) the inferred entry direction. Sampling is analytic (no
      // noise floor), so even a nanosecond leg differentiates cleanly.
      let tPrev = 0;
      for (const pe of g.record?.events ?? []) {
        if (pe.t >= e.t) break; // event stream is time-ordered
        if (pe.post?.some(([id]) => id === k.ball)) tPrev = pe.t;
      }
      // review r3 P2: a hard hit on a hanger sitting on the capture circle
      // emits BallPocket only Eps::TIME (~1 ns) after the impact — the
      // pre-capture probe must sit strictly INSIDE (tPrev, e.t), not just
      // behind e.t, or it samples the pre-impact leg (stationary hanger ⇒
      // phantom creep pivot on a smash-in). Half the leg bounds the
      // nominal 1 µs backstep whenever the leg is shorter.
      const leg = e.t - tPrev;
      const tb = Math.max(0, e.t - (leg > 0 ? Math.min(1e-6, leg / 2) : 1e-6));
      const VDT = 0.02; // entry-velocity finite-difference window cap
      const ta = Math.min(tb, Math.max(tPrev, tb - VDT));
      g.sampler.sampleAt(ta);
      const prev = new THREE.Vector3();
      kPosToThree(prev, g.buf[8 * i], g.buf[8 * i + 1], g.buf[8 * i + 2]);
      g.sampler.sampleAt(tb); // pre-capture jaw pose
      const preMotion = g.buf[8 * i + 7]; // frozen motion_code (Airborne=5)
      const pos = new THREE.Vector3();
      kPosToThree(pos, g.buf[8 * i], g.buf[8 * i + 1], g.buf[8 * i + 2]);
      // divide by the TRUE probe interval (review r4 P2: on a 1 ns hanger
      // leg the half-leg probe makes tb − ta ≈ 0.5 ns, and any coarser
      // floor would understate the entry speed and misclassify a
      // 0.53–1.06 m/s smash-in as a slow pivot); the 1e-12 floor only
      // guards the degenerate leg-0 case, where the difference is 0 anyway
      const vel = pos.clone().sub(prev).divideScalar(Math.max(tb - ta, 1e-12));
      vel.y = 0;
      // nearest pocket cup (three-frame centers, ACTIVE kernel table)
      let pocket = cups[0], best = Infinity;
      for (const p of cups) {
        const d = (pos.x - p.x) ** 2 + (pos.z - p.z) ** 2;
        if (d < best) { best = d; pocket = p; }
      }
      // GH-489 W6 (Amendment 026): the VISUAL fall for this pocket — the
      // drop target and the descent/rattle basis. Nearest visual cup to
      // the kernel cup (same pocket, different centre construction);
      // absent module/entry keeps the kernel cup verbatim.
      let fall = pocket;
      const vCups = pocketFallsFn?.(undefined, { contract: 'kernel' }); // GH-489 LAND-26 (i): this game.js carries the R34 identity gate, so it OPTS IN to the kernel-disc aperture (recorded one-token deviation)
      if (vCups) {
        let vBest = Infinity;
        for (const c of vCups) {
          const d = (pocket.x - c.x) ** 2 + (pocket.z - c.z) ** 2;
          if (d < vBest) { vBest = d; fall = c; }
        }
        if (vBest > 0.12 * 0.12) fall = pocket; // sanity: never cross-pocket
      }
      // GH-489 SNK-R37 deviation B (review r11 P2 B): the identity branch is
      // taken only by a leaf that DECLARES pre-roll support (SINK_CAPS.preRoll,
      // the SNK-R36 leaf) — an older cached sinkpivot.js pivots AT the
      // capture rim and puts the ball 6.57 mm into the leather. Without it
      // the pre-R36 path that never penetrates the cap is kept: the fall is
      // the PLATE DATUM (R33's corners), the gate re-tests against it (a
      // corner capture sits 19 mm outside it → no pivot) and the glide law
      // below sizes dist / glide / tFall from it and steers to the leather
      // opening — R33's form verbatim (+18.5 mm clear on every S2p pot,
      // §R3c.42's (d) rows); the substitution sits ABOVE the glide law for
      // that reason (refuter 1 B2). A missing leaf (sinkFx null) takes the
      // same fallback. A middle (plate datum == kernel disc) is unchanged
      // either way.
      // GH-489 #637 LAND-18 X3 (review 775r5 P2 (d), a PR-introduced regression of
      // this fallback law — recorded deviation, the ownership ledger (internal)): an AIRBORNE
      // capture (preMotion 5 — a 5° stroke at 2 m/s hops ≈ 35 ms ≈ 71 mm and the
      // gate below rejects its pivot by design, the bed-contact model) takes the
      // plate datum as its glide target regardless of leaf freshness — the same
      // substitution a preRoll-less leaf takes. Without it the fresh leaf kept the
      // kernel-identity disc and the legacy glide steered to the kernel cup centre:
      // the R34 penetration class returned for airborne corner captures only
      // (node mirror, cue-only 0.10 / 0.15 m lanes: −6.763 / −6.555 mm → +16.209 /
      // +18.444 mm; the landed 0.25 m row and the theta-0 control unchanged at
      // +18.373 / +18.374). Nothing else in the fall selection changes.
      if (fall !== pocket && (sinkFx?.SINK_CAPS?.preRoll !== true || preMotion === 5 /* Airborne */)) {
        const plates = pocketPlateFn?.();
        if (plates) {
          let pBest = Infinity;
          for (const c of plates) {
            const d = (pocket.x - c.x) ** 2 + (pocket.z - c.z) ** 2;
            if (d < pBest && d <= 0.12 * 0.12) { pBest = d; fall = c; }
          }
        }
      }
      // glide: time to carry the ball from the jaw to the fall center at
      // its entry pace (clamped so dead-slow drop-ins still fall believably).
      // GH-490 round-20 (review r20-r1 P1): the 0.06 s floor additionally
      // caps at 1.5× the TRUE travel time dist/|v| — on a fast entry the
      // raw floor put the bezier control point (entry + v·glide/2) past
      // the cup (6 m/s over ~90 mm: carry 2d → the curve's excursion past
      // the cup reached d/3 ≈ 30 mm near bed height and clipped the
      // fillet throat's lip-climbing outward wall, and the Ø105 leather
      // lip itself, by ~2 mm). Capping GLIDE (not the carry) keeps the
      // early drop at the measured velocity — the near-tangent-pot law
      // (test-sinkpivot 4c) — while the control point stays at ≤ 0.75 d,
      // inside the entry→cup segment: zero overshoot by construction.
      // Entries the floor never clamps keep the exact legacy path.
      // review r20-r2 P2: the capped floor keeps a 12 ms epsilon — a
      // pocket event sampled exactly at the cup centre (dist 0) would
      // otherwise produce glide 0 and 0/0 NaN poses on an exact-event
      // seek (u = dt/glide, the lip-pop denominator).
      // (Merge fold, 489+490: the distance target is the resolved VISUAL
      // fall (Amendment 026) and the glide law is the r20 capped floor —
      // with fall === pocket (pool/chinese8) the pair is byte-identical
      // to the GH-490 shipped form.)
      const dist = Math.hypot(pos.x - fall.x, pos.z - fall.z);
      const glide = Math.min(0.22,
        Math.max(
          Math.min(0.06, Math.max(0.012,
            1.5 * dist / Math.max(vel.length(), 1e-6))),
          dist / Math.max(vel.length(), 0.3)));
      // rack-truth ball radius rides along so the drop pose fits discipline
      // ballsets (snooker 52.5 mm); default pool rack ⇒ exactly the old R
      const r = g.playbackBalls[i].r ?? R;
      // issue #236: PRE-capture angular velocity + orientation feed the
      // lip-pivot entry — ω by quaternion finite difference over the
      // sampler (kernel truth; the #50 correction is consulted so the sink
      // starts from the orientation playback actually rendered at capture,
      // no snap). On-bed captures only: an airborne arrival keeps the
      // legacy glide (the pivot is a bed-contact model) — gated on the
      // sampled motion code (review r1 P2: low airborne captures can cross
      // under any height test), height kept as belt-and-braces.
      let pivot = null;
      // GH-489 W6: the lip pivot is a HOLE-EDGE model — when a DISTINCT
      // snooker visual fall resolved (fall !== pocket), it only runs
      // when capture happens over that fall (|pos − fall| ≤ fall.r); a
      // corner capture out at the jaw tips keeps the legacy glide, which
      // carries its own descent gate (below). W6-finish review r3 P1: the
      // test is SCOPED to resolved falls — on pool/chinese8 fall ===
      // pocket and pos (sampled pre-event) sits just OUTSIDE the kernel
      // capture circle, so an unscoped test rejected virtually every
      // on-bed pot and silently disabled the #236 pivot there; the
      // declared W6 scope keeps non-snooker tables byte-identical.
      // review W7 r8 P2 (cache-poison contract): with a DISTINCT visual
      // fall resolved, the pivot additionally requires the leaf's
      // throat-containment capability (SINK_CAPS) — a returning
      // browser's STALE pre-W6 sinkpivot.js passes the name-based
      // feature detection but its poseInSink has no clamp, so handing
      // it the ~42 mm fall could route oblique pots through the dressed
      // walls. Without the capability the pot keeps the fresh LEGACY
      // glide below, whose own descent gate + throat clamp already read
      // the visible fall. fall === pocket (pool/chinese8/stale table.js)
      // keeps the pre-W6 pivot behavior byte-identically.
      // W9 review r9→r11 ADJUDICATION (recorded, the W8-r10 rebuttal
      // form): r9 read the centre-inside bound as a defect (BallPocket
      // fires at the KERNEL radius — middle 53.19 mm — while the
      // visible fall is 49.61 mm, so ordinary middle pots always take
      // the gated glide with frozen spin) and prescribed widening to a
      // rim-overlap bound. r11 then measured the widened bound
      // STARTING PIVOTS OVER SOLID CLOTH (centres in (fall.r,
      // fall.r + R] — the pivot branch has no throat clamp), which the
      // W7 sinkpivot adjudication explicitly forbids
      // (pocket-geometry.md: "the lip pivot only builds when capture
      // happens OVER the fall"; 026b: out-of-fall captures degrade to
      // null — no lip pivot over solid cloth; test-sinkpivot carries
      // the red-based arm). The widening is REVERTED: the middle-pot
      // glide is the W6/W7-adjudicated model behaviour (the kernel cup
      // is the capture identity; the glide carries its own descent
      // gate + throat clamp), and a spin-preserving middle pivot needs
      // a MODEL EXTENSION (a pre-roll segment to the hole edge before
      // the tip), recorded as the candidate follow-up — never a bound
      // widening.
      // GH-489 SNK-R34 (maintainer ruling A, identity form — web/app/
      // the ownership ledger "Recorded deviation (frozen game.js, one condition)"):
      // a visual fall that IS the kernel capture disc (centre and radius
      // bit-for-bit the pocket's — the render fall copies the kernel record
      // verbatim, table.js snookerFallCtx) needs no geometric re-test: the
      // kernel's capture point is on that rim by construction, so the
      // dressed-opening bound holds by construction; the re-test stays for
      // any fall that differs from the capture disc. Measured: the capture
      // point recomposes 0.1–3.4 µm OUTSIDE the rim (≈ 1.4 µm per m/s), so
      // the plain `<= fall.r` rejected the kernel-disc falls by microns.
      if (sinkFx && preMotion !== 5 /* Airborne */ && pos.y < r * 1.25
        && (fall === pocket
          || (fall.x === pocket.x && fall.z === pocket.z && fall.r === pocket.r)
          ? true
          : (sinkFx.SINK_CAPS?.throatClamp === true
            && Math.hypot(pos.x - fall.x, pos.z - fall.z)
              <= fall.r))) {
        const qAt = (tq) => {
          g.sampler.sampleAt(tq);
          const cq = rollFix?.quatAt(i, tq, g.buf);
          const q = new THREE.Quaternion();
          if (cq) kQuatToThree(q, cq[0], cq[1], cq[2], cq[3]);
          else {
            kQuatToThree(q, g.buf[8 * i + 3], g.buf[8 * i + 4],
              g.buf[8 * i + 5], g.buf[8 * i + 6]);
          }
          return q;
        };
        const QDT = 0.002; // small enough to alias-proof break-class spin
        // same final-leg bound as the velocity window above (review r2/r3)
        const tq = Math.min(tb, Math.max(tPrev, tb - QDT));
        const qa = qAt(tq);
        const qb = qAt(tb);
        const dq = qb.clone().multiply(qa.invert()); // qa is a local temp
        if (dq.w < 0) { dq.x *= -1; dq.y *= -1; dq.z *= -1; dq.w *= -1; }
        const sh = Math.hypot(dq.x, dq.y, dq.z); // sin(half-angle)
        const rate = sh > 1e-12 && tb > tq
          ? (2 * Math.atan2(sh, dq.w)) / (tb - tq) / sh : 0;
        pivot = sinkFx.buildSinkPivot({
          x0: pos.x, z0: pos.z, vx: vel.x, vz: vel.z,
          wx: dq.x * rate, wy: dq.y * rate, wz: dq.z * rate,
          q0: [qb.x, qb.y, qb.z, qb.w],
          // Amendment 026: the pivot steers/contains against the VISIBLE
          // fall — its internal full-sphere clearance law then reads the
          // true aperture, not the capture disc
          px: fall.x, pz: fall.z, pr: fall.r, r,
        });
      }
      // GH-490 r23: visual drop-path dressing spec (cn8 corners only —
      // null everywhere else keeps every other class/pocket bit-identical)
      const dress = sinkDressFor ? sinkDressFor(pocket.x, pocket.z) : null;
      // GH-490 MOUTH GRAFT (spike §12.9): seat arrival — the first plan
      // station where the ball is fully over the aperture (tIn === 1).
      // The dressed drop used to release at a FIXED 0.62·ttl, so a ball
      // that reached the mouth early stood PERFECTLY STILL on the ring
      // plane for the remainder (measured 0.267 s ≈ 8 frames at 30 fps)
      // — the owner-named 「甚至还挡着球进袋口了」 park.  Releasing at
      // seat arrival makes the descent continuous; because tIn is a
      // smoothstep its slope is zero at the seat, so gravity starts
      // from rest and the join is C¹ with no visible kink.  Precomputed
      // here so poseSink stays a pure function of (entry, dt) and
      // update()/seek() remain random-access identical.  Contract note
      // (C-r18-5 / Amendment-026): this is the DRESSED-path release
      // schedule, a pose law — the cull mirrors (SINK_SHIELD_Y /
      // SINK_FLOOR_Y, game.js + byte-frozen sinkpivot.js) do not move,
      // and no capability crosses the module boundary (tSeat is
      // computed and consumed entirely here).
      let tSeat = null;
      if (dress) {
        // review graft-r3 P2: the release waits for the sphere to CLEAR
        // the aperture geometrically — tIn's smoothstep knee sits at
        // dPlan = rHole/2 (14.5 mm off-centre), but the Ø58 fall
        // exceeds the ball by only 0.425 mm per side, so releasing at
        // the knee let a fast pot drop while still overlapping the rim.
        // Clearance = rHole − r (floored at 0.4 mm for the exact-fit
        // arithmetic); on a stale-table pairing (rHole 0.0285 < r) the
        // threshold never fires and tSeat falls back to the glide end —
        // the seated ball releases continuously, never parks.
        const seatClear = Math.max(0.0004, (dress.rFall ?? dress.rHole) - r);
        const probe = { pos, vel, pocket, glide, dress };
        for (let u = 0; u <= 1.0001; u += 1 / 64) {
          const st = dressPlanAt(probe, u * glide);
          if (st.tIn >= 1 && st.dPlan <= seatClear) {
            tSeat = u * glide; break;
          }
        }
        if (tSeat === null) tSeat = glide; // wR completes strictly < glide
      }
      // GH-490 BLOCKER-CURE B1 (finale adversarial review, despawn at
      // the throat): with the table's NET-RECEIVE capability present
      // (dress.net — cn8 corners; feature-detected, a stale table.js
      // degrades to the pre-cure dressed drop bit-identically), the
      // visual fall CONTINUES INTO the sock: from the tSeat shaft
      // release the ball free-falls to the sock's cradle station, is
      // caught as a damped harmonic (the knit's own stretch — ω from
      // the arrival speed against the sock's derived sag budget, ζ 0.4)
      // and RESTS in the net permanently (the dossier read: pocketed
      // balls sit visibly in the nets). All precomputed here so
      // poseSink stays a pure function of (entry, dt) — update()/seek()
      // random-access identical. sinkpivot.js stays byte-frozen.
      // GH-490 B1 net candidates (review r14 P2 restructure): slots are
      // assigned by NET-ARRIVAL order after the event walk — pocket-
      // event order does not order arrivals (glide varies 12-220 ms),
      // and a later-but-faster ball must take the empty cradle, never
      // float at slot 1 under an incoming slot-0 ball.
      if (dress?.net && typeof dress.net.restAt === 'function') {
        const ck = `${pocket.x.toFixed(4)},${pocket.z.toFixed(4)}`;
        const seatY0 = dress.yRingOpen ? r
          : (dress.yRing == null ? r : dress.yRing);
        const tF0 = Math.sqrt((2 * Math.max(0.001,
          seatY0 - (dress.net.yRest + 0.006))) / SINK_G);
        let a = netCups.get(ck);
        if (!a) { a = []; netCups.set(ck, a); }
        a.push({ ball: k.ball, potT: e.t,
          arrival: e.t + (tSeat ?? glide) + tF0 });
      }
      // GH-489 W6 (Amendment 026): the legacy glide's DESCENT GATE — the
      // ball may only start falling once its whole sphere fits inside the
      // visible fall (the old path started gravity at 0.35·glide over the
      // giant capture-disc hole; over real cloth it would sink through the
      // bed). First bezier station where |B(u) − fall| ≤ fall.r − r − 2 mm,
      // precomputed so poseSink stays a pure function of dt (seek-safe).
      // W6-finish review r3 P2: SCOPED to resolved visual falls — with
      // fall === pocket (pool/chinese8/stale table.js) the search moved
      // the legacy descent start from 0.35·glide to ~0.47–0.49·glide;
      // non-snooker sink timing stays byte-identical.
      let tFall = 0.35 * glide;
      if (fall !== pocket) {
        const cbx = pos.x + vel.x * glide * 0.5;
        const cbz = pos.z + vel.z * glide * 0.5;
        let uG = 1;
        for (let u = 0; u <= 1.0001; u += 1 / 64) {
          const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
          const bx = w0 * pos.x + w1 * cbx + w2 * fall.x;
          const bz = w0 * pos.z + w1 * cbz + w2 * fall.z;
          if (Math.hypot(bx - fall.x, bz - fall.z)
            <= fall.r - r - 0.002) { uG = u; break; }
        }
        tFall = Math.max(tFall, uG * glide);
      }
      const entry = { t: e.t, pos, vel, pocket, fall, glide, tFall, tSeat,
        r, pivot,
        dress,
        // review r15 P2: PERSISTENT eligibility marker — an overflow
        // (beyond-capacity) entry keeps net null but must still
        // rebind its dressing across preview/revert rebuilds
        wasDressed: !!dress, net: null, rest: null };
      g.sinkInfo.set(k.ball, entry);
    }
    // GH-626: solid-closure rests, assigned PER CUP (review r2 P2) — see
    // bindRests. Runs after the whole record is indexed because capacity is
    // an arrival-order question, exactly like the B1 net slot pass below.
    bindRests(g.sinkInfo);
    // ---- B1 slot assignment pass (review r14 P2): per cup, order by
    // arrival; the catch law sizes to the TRUE remaining presentation
    // window (floors 8/10 ms — a last-instant pot is a hard stop, never
    // a settle snap), and an upper slot's catch SERIALIZES behind the
    // occupant below by holding its seat release (the smoothstep's
    // zero-slope seat makes the hold C1-invisible).
    for (const cands of netCups.values()) {
      cands.sort((a, b) => a.arrival - b.arrival
        || a.potT - b.potT || a.ball - b.ball);
      let prevCatchAbs = -Infinity; // ABSOLUTE clock (review r15 P2:
      // per-ball tCatch is event-relative — a relative comparison
      // delayed a later pot by the whole inter-event gap)
      cands.forEach((c, idx) => {
        const s = g.sinkInfo.get(c.ball);
        if (!s?.dress?.net) return;
        const dress = s.dress;
        const cap = dress.net.capacity ?? 2;
        if (idx >= cap) return; // overflow keeps the legacy drop lane
        const rest = dress.net.restAt(idx);
        const seatY = dress.yRingOpen ? s.r
          : (dress.yRing == null ? s.r : dress.yRing);
        // slot >= 1 lands ON A BALL, not stretchy knit (review r2 P2)
        const sagMax = idx > 0
          ? Math.max(0.0002, (dress.net.slotDy ?? 0.0572) - 2 * s.r)
          : (dress.net.sagMax ?? 0.012);
        const yTouch = rest.y + 0.006;
        const drop = Math.max(0.001, seatY - yTouch);
        const tF = Math.sqrt((2 * drop) / SINK_G);
        const vC = SINK_G * tF;
        let tCatch = (s.tSeat ?? s.glide) + tF;
        if (s.t + tCatch < prevCatchAbs + 0.02) {
          const need = prevCatchAbs + 0.02 - (s.t + tCatch);
          s.tSeat = (s.tSeat ?? s.glide) + need;
          tCatch += need;
        }
        prevCatchAbs = s.t + tCatch;
        const om = Math.max(30, vC / sagMax);
        const zeta = 0.4;
        // duration-contract sizing (review r6/r8/r14): converge before
        // duration + 0.35 with the ACTUAL remaining time
        const avail = Math.max(0.008,
          (g.duration + 0.35) - (s.t + tCatch));
        const om2 = Math.max(om, 16 / (zeta * avail));
        const omD2 = om2 * Math.sqrt(1 - zeta * zeta);
        const A = yTouch - rest.y;
        s.net = {
          rest, om: om2, omD: omD2, zeta, A,
          B: (-vC + zeta * om2 * A) / omD2,
          tCatch,
          floor: rest.y - sagMax,
          planT: Math.min(0.25, Math.max(0.01, avail * 0.8)),
          // sway-cure review r1 P2: the presentation window left past the
          // catch — driveNetDress winds the sock oscillator down to zero
          // across the last 0.25 s of it, so settle()'s far-past-settle
          // read (REST_CLOCK) is continuous with the last playback frame
          // (no 1-3 mm one-frame snap on pot-final records).
          availT: avail,
          // sway-cure review r3 P2: the slot's sag-budget fraction — the
          // sock mode is driven by knit stretch, and an upper slot has
          // almost none (it lands on the ball below). Derived from the
          // authored budgets, no new constants.
          swayK: sagMax / (dress.net.sagMax ?? 0.012),
        };
      });
    }
    return g.sinkInfo;
  }

  /** GH-490 BLOCKER-CURE B1: drive the table-side net deformation from
   * the balls CURRENTLY resting/settling in each pocket net — a pure
   * function of the posed state at t (update()/seek() random-access
   * identical: the deform recomputes from the sock's pristine base
   * buffer every call). Sockets with no remaining netted ball restore
   * to base exactly once. */
  function driveNetDress(sinks, t) {
    let lists = null;
    for (const [id, s] of sinks) {
      if (!s.net) continue;
      // review blocker-cure r10 P2: a table rebuild (progressed preview/
      // revert) disposes the build the cached entry was indexed against
      // — REBIND to the active build's spec at this pocket before any
      // deform, so replay always drives the LIVE sock (a non-cn8 build
      // returns null and the deform lane skips).
      if (sinkDressFor) {
        const cur = sinkDressFor(s.pocket.x, s.pocket.z);
        if (cur !== s.dress) s.dress = cur;
      }
      if (!s.dress?.net?.deform) continue;
      const dt = t - s.t;
      const tau = dt - s.net.tCatch;
      if (tau <= 0) continue;
      const b = g.playbackBalls.find((bb) => bb.id === id);
      if (!b || !b.mesh.visible) continue;
      const wr = Math.min(1, tau / 0.04);
      if (!lists) lists = new Map();
      let arr = lists.get(s.dress.net);
      if (!arr) { arr = []; lists.set(s.dress.net, arr); }
      const w = wr * wr * (3 - 2 * wr);
      // sway-cure review r1 P2 (settle-continuity): the sock oscillator's
      // weight winds down smoothstep over the last 0.25 s of the
      // presentation window (availT, sized at index time), reaching
      // exactly zero at the horizon — settle()'s REST_CLOCK read then
      // matches the last playback frame instead of snapping the wagged
      // knit/ring to rest. Pure in (entry, t): seek() random-access
      // identical. The wrap weight w itself is untouched (a netted ball
      // must stay wrapped at rest forever). Feature-detected at the
      // consumer — a stale table.js ignores the field.
      // review sway-cure r3 P2 (slot physics): the oscillator weight also
      // carries the slot's OWN sag budget fraction (swayK, indexed at
      // catch time) — a slot-1 catch lands ON A BALL, not stretchy knit
      // (the r2 P2 catch-law precedent), so it re-excites the sock mode
      // at ~2% scale instead of doubling it; the table-side amplitude
      // clamp becomes an unreachable safety bound.
      let sw = w * (s.net.swayK ?? 1);
      const availT = s.net.availT;
      if (availT != null) {
        // review sway-cure r3 P2 (short-window fade): normalize by the
        // ACTUAL fade span — a final-event pot can leave availT well
        // under 250 ms, and the fixed divisor suppressed the whole wag;
        // the fade still reaches exactly zero at the horizon.
        // (r4 review note, REBUTTED by the duration contract: at the
        // 8 ms availT floor the fade and the 40 ms catch ramp overlap
        // and the wag stays sub-visible — CORRECT, not a defect. A
        // sub-10 ms presentation window has no visible sway frame by
        // construction (the ball's own catch is equally instant there
        // via the om2 sizing); settle-continuity is the invariant this
        // fade exists to protect, and extending presentation past
        // duration + 0.35 belongs to the authored duration contract
        // (review r6/r8/r14 lineage), not to this oscillator.)
        const span = Math.min(0.25, availT);
        const rem = (availT - tau) / span;
        const c = Math.min(1, Math.max(0, rem));
        sw *= c * c * (3 - 2 * c);
      }
      arr.push({
        x: b.mesh.position.x,
        y: b.mesh.position.y,
        z: b.mesh.position.z,
        r: s.r,
        w,
        tau,
        sw,
      });
    }
    if (lists) {
      for (const [fx, arr] of lists) {
        // review sway-cure r4 P2: per-cup oscillator budget — Σ sw ≤ 1,
        // independent of ball size (a pool-rack-on-snooker ballset makes
        // slot-1's sag fraction ~0.39, and an uncapped sum would ride the
        // table-side safety rail). Weight renormalization is continuous
        // in t (each sw is), so the aggregate waveform never clips.
        let s = 0;
        for (const e of arr) s += e.sw ?? 0;
        if (s > 1) for (const e of arr) e.sw /= s;
        fx.deform(arr); netTouched.add(fx);
      }
    }
    for (const fx of netTouched) {
      if (!lists || !lists.has(fx)) { fx.deform([]); netTouched.delete(fx); }
    }
  }

  /** GH-490 MOUTH GRAFT (spike §12.9): the dressed drop's PLAN law,
   * factored out of poseSink so sinkIndex can precompute seat arrival
   * from the IDENTICAL arithmetic poseSink replays — one law, no drift
   * between the schedule and the pose. Pure in (entry, dt). */
  function dressPlanAt(s, dt) {
    const d = s.dress;
    const u = Math.min(1, dt / s.glide);
    const cx = s.pos.x + s.vel.x * s.glide * 0.5;
    const cz = s.pos.z + s.vel.z * s.glide * 0.5;
    const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
    const smd = (t) => {
      const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c);
    };
    // review r23-r1 P2 + r2 P2: the retarget must COMPLETE strictly WITHIN
    // the entry's own glide (a fixed 0.22 s lagged a fast glide, and
    // 0.85·glide+0.01 still overran the 12 ms floor-class path — the ball
    // squeezed off the visual centre and poked the ring); 0.9·glide is
    // < glide for every entry (sinkIndex clamps glide ≥ 0.012, so
    // tRet ≥ 0.0108 — never a 0/0)
    const tRet = Math.min(0.22, 0.9 * s.glide);
    const wR = smd(dt / tRet); // cup-centre → visual-hole retarget
    let x = w0 * s.pos.x + w1 * cx + w2 * s.pocket.x;
    let z = w0 * s.pos.z + w1 * cz + w2 * s.pocket.z;
    x += (d.hx - s.pocket.x) * wR;
    z += (d.hz - s.pocket.z) * wR;
    const dPlan = Math.hypot(x - d.hx, z - d.hz);
    // rFall = the rev8_6 aperture capability (review graft-r6 P2);
    // absent (stale table.js) the legacy rHole rides.
    const rF = d.rFall ?? d.rHole;
    return {
      x, z, dPlan,
      tIn: smd((d.rMouth - dPlan) / (d.rMouth - rF * 0.5)),
    };
  }

  /** GH-490 PASS-2 item 1 (netted-ball green stain, triple-CONFIRMED):
   * env/GI transport swap for a ball posed INSIDE the pocket bag. The
   * ball material's envMap is the room probe (baked at the room centre —
   * its below-horizon image is the green bed) and its diffuse ambient is
   * the bed-plane SH probe; from inside the sock both are somebody
   * else's environment, and the measured result was a permanent
   * saturated green patch on the resting ball's dark side (the pass-2
   * verdict's item 1; ablation pinned the specular envMap as the
   * dominant channel). While the sink pose has the ball fully below the
   * bed plane AND the active dress publishes a sock environment
   * (dress.net.env — the table's ROUND-15 content-free below-rail cube),
   * the mesh rides that env with the bed SH gated off (shading.js
   * uGiBallOn); scrubbed back above the bed (or reracked) it restores.
   * Idempotent per frame and derived only from the posed state, so
   * update()/seek() stay random-access identical. Feature-detected both
   * ways: a stale table.js publishes no env (no-op), a stale shading.js
   * has no giBallOn slot (envMap swap still cures the dominant channel). */
  function setNetBallEnv(b, tex) {
    const m = b.mesh?.material;
    if (!m) return;
    const ud = m.userData;
    if (tex) {
      ud.netEnvOn = true;
      if (m.envMap !== tex) {
        m.envMap = tex;
        m.needsUpdate = true; // same-type cube swap: uniform refresh only
      }
      if (ud.giBallOn) ud.giBallOn.value = 0;
    } else if (ud.netEnvOn) {
      // review pass2-r3 P2: restore the CANONICAL gameplay env (the
      // createGame envMap), never a snapshot — a ball netted during a
      // cinelight export would otherwise cache the export's PRIVATE
      // render-target texture and restore it after revert() disposed
      // it. cinelight's own envMats tracking re-points this material
      // at its revert, so the canonical restore stays consistent.
      ud.netEnvOn = false;
      // review pass2-r4 P2: restore to the ACTIVE environment —
      // scene.environment tracks the live rig (the boot cube normally;
      // cinelight's private bake during an export, which excludes a
      // sock-lit material from its own envMats snapshot), so a scrub
      // back across the pocket event inside an export rejoins the
      // studio lighting instead of the boot cube.
      m.envMap = scene.environment ?? envMap ?? null;
      m.needsUpdate = true;
      if (ud.giBallOn) ud.giBallOn.value = 1;
    }
  }

  /** GH-626 (PR #633 r8, the owner-visible blown-out rest): the cup's
   * through-mouth TRANSPORT for a ball the closure lane owns. A ball resting
   * on the plug was lit as a bed ball — every leg at free-field strength —
   * while the plug under it and the well wall beside it carry the derived
   * transport (table.js pdtPlugField / pdtWellTransport). The ball now takes
   * the same law on the same rails, evaluated per fragment in the shader
   * (shading.js SPIKE_WELL_PARS; derivation + gate in
   * tools/derive-well-ball-transport.mjs); this writes the shaft descriptor
   * the shader needs — the published closure's axis and its `shaft`
   * { rBore, yAper } (a read of the geometry the plug is baked against).
   * Idempotent per frame and derived only from the posed state (the entry's
   * bound closure), so update()/seek() stay random-access identical.
   * Feature-detected BOTH ways (cache-poison contract): a stale shading.js
   * has no userData.wellOccl slot and this no-ops; a stale table.js
   * publishes no `shaft` and the ball stays open; a stale game.js never
   * writes it and the shader's rBore = 0 default keeps every ball open. */
  function setWellBallOccl(b, spec) {
    const ud = b.mesh?.material?.userData;
    const u = ud?.wellOccl;
    if (!u) return;
    const fl = ud.wellFloor; // the support height (review r8; feature-detected)
    const sh = spec?.shaft;
    if (sh && sh.rBore > 0 && Number.isFinite(sh.yAper)) {
      const v = u.value;
      if (v.x !== spec.x || v.y !== spec.z || v.z !== sh.rBore || v.w !== sh.yAper) {
        v.set(spec.x, spec.z, sh.rBore, sh.yAper);
      }
      if (fl && fl.value !== spec.ySurface) fl.value = spec.ySurface;
    } else if (u.value.z !== 0 || (fl && fl.value !== 0)) {
      u.value.set(0, 0, 0, 0);
      if (fl) fl.value = 0;
    }
  }

  /** Pocket-drop pose, a pure function of dt = clock - pocketT. With the
   * issue #236 leaf module indexed (s.pivot): spin-preserving lip-pivot
   * drop — position AND orientation from sinkpivot.js poseInSink, both
   * derived purely from (record event data, dt), so update()/seek() stay
   * random-access identical. Degrade path (absent/stale module, airborne
   * arrival, non-finite pre-state): the legacy momentum bezier from the
   * jaw entry into the cup center, gravity fall below the bed with a
   * small damped rattle around the cup axis — orientation untouched.
   * Culled once the ball top passes the shield line (pocket-geometry.md).
   * Returns false when the ball has fully dropped (caller hides it). */
  function poseSink(b, s, dt) {
    // review pass2-r3 P2: a rebind can NULL the dress mid-sink (non-cn8
    // equipment preview) — the dressed branch below then never runs,
    // so the env reset must live here or the ball keeps the sock cube
    // on the legacy sink path.
    if (!s.dress || !s.net) setNetBallEnv(b, null);
    // GH-626 r8: the closure lane's transport rides the entry's bound spec
    // (null for a dressed/netted/legacy entry — the identity). Per frame,
    // idempotent, before the pose so a re-bound entry is never one frame
    // behind its own station.
    setWellBallOccl(b, s.rest?.spec ?? null);
    // GH-650 order 18 item 0: a ball the ball-return module OWNS from before the shield crossing is parked
    // here exactly as at the crossing (the callers' false branches); `ballReturnOwns` is set only on a table
    // with a return track, so every other table takes the path below unchanged
    if (g.ballReturnOwns && g.ballReturnOwns(b.id, dt)) return false;
    // GH-490 round-23 dressed drop (cn8 corners; #236 contract — a PURE
    // function of (entry, dt), update()/seek() random-access identical):
    // the ball ROLLS the plan bezier retargeted from the kernel cup centre
    // onto the VISUAL hole centre O_f, descends the seat line into the
    // mouth (centre r → ring plane as the plan distance closes), SQUEEZES
    // through the Ø 49.7 ring — the geometric net-stretch read via the
    // legacy drop-and-shrink convention, scale 1 → rHole/r ≈ 0.855 —
    // then releases down the shaft past 62 % of the entry's own budget
    // and culls at the shield line. Orientation stays sinkpivot.js truth
    // (bisected to the module's last valid dt when its own ballistic y
    // already crossed the shield — the dressed ball is still visible at
    // the seat there).
    if (s.dress) {
      const d = s.dress;
      const ttl = s.pivot?.ttl ?? SINK_SECONDS;
      const { x, z, tIn } = dressPlanAt(s, dt);
      const scMin = Math.min(1, ((d.rFall ?? d.rHole) / s.r) * 0.985);
      const sc = 1 - (1 - scMin) * tIn;
      // seat line: rolling centre height outside the mouth, ring-plane
      // seat at the hole (the squeezed equator just fits the ring).
      // rev8_6 fall-through law rides the yRingOpen CAPABILITY (review
      // graft-r1 P2, cache-poison contract): a ball-passing aperture
      // has no seat — √(r² − a²) is imaginary for a ≥ r — so the ball
      // keeps its rolling height until support is lost.  The spec's
      // yRing stays the legacy numeric seat so a STALE cached game.js
      // degrades to the exact pre-graft dressed behavior (a null there
      // would coerce to 0 and drag the centre to the bed plane).
      const seatY = d.yRingOpen ? s.r : (d.yRing == null ? s.r : d.yRing);
      const tf = Math.max(0, dt - 0.35 * s.glide);
      const pop = tf > 0 ? 0
        : LIP_POP_M * Math.sin(Math.PI * dt / (0.35 * s.glide));
      let y = s.r + pop * (1 - tIn) + (seatY - s.r) * tIn;
      // GH-490 MOUTH GRAFT (spike §12.9): release at SEAT ARRIVAL, not
      // at a fixed 0.62·ttl.  The old schedule ignored when the ball
      // actually got there, so an early arrival stood still on the ring
      // plane for the remainder — the owner-named park (see sinkIndex).
      const tRel = dt - (s.tSeat ?? 0.62 * ttl); // shaft release
      if (tRel > 0) y -= 0.5 * SINK_G * tRel * tRel;
      let px2 = x; let pz2 = z;
      if (s.net) {
        // B1 NET RECEIVE: past the catch station the vertical is the
        // precomputed damped harmonic about the rest pose (sinkIndex),
        // floored at the sock's sag budget; the plan eases onto the
        // rest slot. The ball then RESTS VISIBLY in the net for any dt
        // — the shield cull does not apply to a netted entry (the net
        // IS below the shield line; capability-gated, so every other
        // class keeps the historical cull bit-identically).
        const tau = dt - s.net.tCatch;
        if (tau > 0) {
          const env = Math.exp(-s.net.zeta * s.net.om * tau);
          y = Math.max(s.net.floor, s.net.rest.y
            + env * (s.net.A * Math.cos(s.net.omD * tau)
              + s.net.B * Math.sin(s.net.omD * tau)));
          const uP = Math.min(1, tau / (s.net.planT ?? 0.25));
          const wP = uP * uP * (3 - 2 * uP);
          px2 = x + (s.net.rest.x - x) * wP;
          pz2 = z + (s.net.rest.z - z) * wP;
        }
      } else if (y + sc * s.r < SINK_SHIELD_Y) return false;
      b.mesh.position.set(px2, y, pz2);
      b.mesh.scale.setScalar(sc);
      // item-1 env transport: fully below the bed plane inside a netted
      // pocket -> the sock environment; above (approach/squeeze, or a
      // scrub back across the mouth) -> the table environment. The
      // capability rides the ACTIVE dress (rebind-safe: refreshNets
      // re-points s.dress at every equipment preview/revert).
      if (s.net) {
        setNetBallEnv(b,
          (y + sc * s.r < 0 && s.dress?.net?.env) || null);
      }
      if (s.pivot && sinkFx) {
        // B1: a netted ball's spin bleeds off in the knit — sample the
        // frozen-spin pose law at a WARPED clock that converges past
        // the catch (pure in dt; sinkpivot itself byte-untouched).
        const dtq = s.net && dt > s.net.tCatch
          ? s.net.tCatch + (1 - Math.exp(-3 * (dt - s.net.tCatch))) / 3
          : dt;
        let pq = sinkFx.poseInSink(s.pivot, dtq, sinkPoseTmp);
        if (!pq) {
          let lo = 0; let hi = dtq;
          for (let it = 0; it < 7; it++) {
            const mid = (lo + hi) / 2;
            if (sinkFx.poseInSink(s.pivot, mid, sinkPoseTmp)) lo = mid;
            else hi = mid;
          }
          pq = sinkFx.poseInSink(s.pivot, lo, sinkPoseTmp);
        }
        if (pq) {
          quatTmp.set(pq.qx, pq.qy, pq.qz, pq.qw);
          b.mesh.quaternion.copy(quatTmp).multiply(b.baseQuat);
        }
      }
      return true;
    }
    if (s.pivot) {
      // GH-626 solid closure: past touchdown the whole pose law is sampled
      // at the CLAMPED clock, so position and orientation freeze together
      // at the landing pose — one line, no second pose law to drift from
      // sinkpivot.js, and still a pure function of dt.
      const dtp = s.rest ? Math.min(dt, s.rest.tLand) : dt;
      const p = sinkFx.poseInSink(s.pivot, dtp, sinkPoseTmp);
      if (!p) return false;
      // the max() only absorbs the bisection residual at tLand (< 1 µm at
      // 24 iterations); the ball never reaches the surface before it.
      b.mesh.position.set(p.x, s.rest ? Math.max(p.y, s.rest.y) : p.y, p.z);
      quatTmp.set(p.qx, p.qy, p.qz, p.qw);
      b.mesh.quaternion.copy(quatTmp).multiply(b.baseQuat);
      return true;
    }
    const mesh = b.mesh;
    // GH-626 solid closure: the legacy glide's twin of the pivot clamp
    // above — freeze the whole law (bezier, rattle, gravity) at touchdown
    // by clamping the clock it reads. Without a rest spec dtl IS dt and
    // every expression below is byte-identical to the pre-GH-626 form.
    const dtl = s.rest ? Math.min(dt, s.rest.tLand) : dt;
    const u = Math.min(1, dtl / s.glide);
    // quadratic bezier: entry → (entry + entry-velocity carry) → the
    // VISIBLE fall centre (Amendment 026; s.fall === s.pocket pre-026)
    const fall = s.fall ?? s.pocket;
    const cx = s.pos.x + s.vel.x * s.glide * 0.5, cz = s.pos.z + s.vel.z * s.glide * 0.5;
    const w0 = (1 - u) * (1 - u), w1 = 2 * u * (1 - u), w2 = u * u;
    let x = w0 * s.pos.x + w1 * cx + w2 * fall.x;
    let z = w0 * s.pos.z + w1 * cz + w2 * fall.z;
    // rattle-settle once it reaches the cup: damped wobble across the
    // VISIBLE throat (Amendment 026 containment: amp ≤ 6 mm ≤ fall.r − R
    // − 2 mm at both snooker families)
    const tr = dtl - s.glide;
    if (tr > 0) {
      const amp = Math.min(0.006, Math.max(0, fall.r - s.r) * 0.3)
        * Math.sin(18 * tr) * Math.exp(-5 * tr);
      // perpendicular (in the bed plane) to the entry direction
      const vl = Math.max(s.vel.length(), 1e-6);
      x += (-s.vel.z / vl) * amp;
      z += (s.vel.x / vl) * amp;
    }
    // vertical: the ball first RIDES UP the jaw lip by a hair (footage-measured
    // micro-bounce: the demo's wide-draw red pops ≲1–2 mm as it tips over
    // the mouth before the visible fall — records/backspin_wide_draw.json),
    // then tips over a beat into the glide and falls under gravity into
    // the dark of the cup. Amendment 026: gravity is GATED on the sphere
    // entering the visible fall (s.tFall; = 0.35·glide pre-026).
    const tFall = s.tFall ?? 0.35 * s.glide;
    const tf = Math.max(0, dtl - tFall);
    const pop = tf > 0 ? 0 : LIP_POP_M * Math.sin(Math.PI * dtl / tFall);
    // GH-626: ...and rest ON the closure. tLand is the root of exactly this
    // parabola, so the max() only absorbs float residue at the touchdown
    // sample; it is the identity for every entry without a rest spec.
    const y = s.rest
      ? Math.max(s.rest.y,
        Math.max(SINK_FLOOR_Y, s.r + pop - 0.5 * SINK_G * tf * tf))
      : Math.max(SINK_FLOOR_Y, s.r + pop - 0.5 * SINK_G * tf * tf);
    // Amendment 026 throat containment (the sinkpivot clamp's legacy-path
    // twin): a descending sphere's bed-plane cross-section stays inside
    // the dressed hole — overshooting beziers glance off the far wall
    if (y < s.r) {
      const disc = Math.sqrt(Math.max(0, s.r * s.r - y * y));
      const lim = fall.r + 0.004 - 0.0005 - disc;
      const ox = x - fall.x, oz = z - fall.z;
      const d = Math.hypot(ox, oz);
      if (d > lim && d > 1e-9) {
        x = fall.x + (ox / d) * Math.max(lim, 0);
        z = fall.z + (oz / d) * Math.max(lim, 0);
      }
    }
    // GH-626: a ball resting on a declared closure is HELD, not culled —
    // the shield line is a visibility contract about an OPEN cup, and this
    // cup is closed above it (restEntryFor's own gate proves the resting
    // crown clears the line). Every entry without a closure keeps the
    // historical cull bit-identically; the mirror itself does not move.
    if (!s.rest && y + s.r < SINK_SHIELD_Y) return false; // below the shield
    mesh.position.set(x, y, z);
    return true;
  }

  /**
   * Scripted-capture: jump the playback clock to virtual time t (seconds)
   * and pose every ball from the sampler — deterministic, wall-clock-free.
   * Pocketed balls play the same SINK_SECONDS drop-and-shrink as update(),
   * anchored at the record's pocket-event time (random-access safe).
   */
  function seek(t) {
    if (!g.sampler) return false;
    const sinks = sinkIndex();
    g.clock = t;
    g.sampler.sampleAt(Math.min(t, g.duration));
    g.playbackBalls.forEach((b, i) => {
      const o = 8 * i;
      if (g.buf[o + 7] === 4 /* Pocketed */) {
        const s = sinks.get(b.id);
        b.mesh.scale.setScalar(1);
        // #236: pivot entries carry their own budget (tPivot + drop class);
        // legacy entries keep the flat SINK_SECONDS gate bit-identically.
        // B1: a NETTED entry (s.net) has no expiry — the ball rests
        // visibly in the pocket net for any t past the catch.
        // GH-626: nor does an entry RESTING on a declared solid closure —
        // the drop budget exists to end a fall into the dark, and this
        // fall ended on a foam plug with the ball's crown at the bed
        // plane. It holds that pose for the rest of the record, and
        // settle() RETAINS it there (restRetained) until the cup is
        // cleared — the crown is above the shield line, so there is
        // nothing for a cull to do.
        const sdt = s ? t - s.t : 0;
        if (s && (s.net || s.rest || sdt < (s.pivot?.ttl ?? SINK_SECONDS))
          && poseSink(b, s, sdt)) {
          // review r13 P2: once CAUGHT by the net the ball is out of the
          // action — pocketed=true keeps activeBalls()/cameratrack
          // framing honest while the mesh stays a live visual (the
          // settle() posture); pre-catch it scrubs like any drop.
          b.pocketed = !!((s.net && sdt >= s.net.tCatch)
            || (s.rest && sdt >= s.rest.tLand));
          b.mesh.visible = true;
        } else {
          // GH-276: park DETERMINISTICALLY. Setting only mesh.position.y
          // left x/z at whatever RENDER HISTORY last wrote (rack pose on a
          // cold seek, last drop pose after chronological stepping), and
          // without b.pocketed the analytic-sphere slot published that
          // stale xz at full radius — the cloth contact-dimple decal
          // (scene/shading.js SPIKE_DIMPLE) saturates its rest gate for
          // y = -10 and painted a phantom dimple there, so a warmed-up
          // re-render of the same t drifted from a cold one by LSBs.
          // b.pocketed routes syncSphereUniforms to the pocketed-neutral
          // slot — exactly what realtime update() has always published
          // past the sink TTL — making seek(t) a pure function of t.
          b.pocketed = true;
          b.mesh.visible = false;
          b.mesh.position.set(0, -10, 0);
        }
      } else {
        b.pocketed = false; // seeking back across the pocket event
        b.mesh.visible = true;
        b.mesh.scale.setScalar(1); // seeking back across a pocket event
        setNetBallEnv(b, null); // item 1: back on the table environment
        setWellBallOccl(b, null); // GH-626 r8: back in the open
        kPosToThree(b.mesh.position, g.buf[o], g.buf[o + 1], g.buf[o + 2]);
        // issue #50: pure-roll corrected orientation where the kernel's
        // two-half-step render integrator slips (null = kernel path, bit-
        // identical to pre-fix; still a pure function of t)
        const cq = rollFix?.quatAt(i, t, g.buf);
        if (cq) kQuatToThree(quatTmp, cq[0], cq[1], cq[2], cq[3]);
        else kQuatToThree(quatTmp, g.buf[o + 3], g.buf[o + 4], g.buf[o + 5], g.buf[o + 6]);
        b.mesh.quaternion.copy(quatTmp).multiply(b.baseQuat);
      }
    });
    driveNetDress(sinks, t); // B1: nets follow the posed state at t
    syncSphereUniforms(shared, g.ballSet.balls);
    return true;
  }

  /** Per-frame playback step (dt in seconds of wall time). */
  function update(dt) {
    if (g.state !== 'PLAYBACK' || g.paused) return;
    g.clock += dt * (g.slowmo ? 0.25 : 1.0);
    const t = Math.min(g.clock, g.duration);
    const sinks = sinkIndex(); // build BEFORE sampleAt (it reuses g.buf)
    g.sampler.sampleAt(t);
    g.playbackBalls.forEach((b, i) => {
      const o = 8 * i;
      const motion = g.buf[o + 7];
      if (motion === 4 /* Pocketed */) {
        // same pure drop as seek(): pose from (clock - pocket event time) so
        // realtime playback and framestep capture render identical drops
        const s = sinks.get(b.id);
        const sdt = s ? g.clock - s.t : SINK_SECONDS;
        // GH-626: an entry resting on a declared closure has no expiry
        // either (seek() carries the same gate and the same reasoning)
        if (s && (s.net || s.rest || sdt < (s.pivot?.ttl ?? SINK_SECONDS))
          && poseSink(b, s, sdt)) {
          b.mesh.visible = true;
          // review r13 P2: caught => pocketed (out of the action set;
          // the mesh stays a live visual) — pre-catch stays false
          // (GH-626: landed on the closure reads the same way)
          b.pocketed = !!((s.net && sdt >= s.net.tCatch)
            || (s.rest && sdt >= s.rest.tLand));
        } else if (!b.pocketed) {
          b.pocketed = true;
          b.mesh.visible = false;
          // GH-276: full set, not y-only — the parked transform must not
          // depend on the last drop pose (path parity with seek())
          b.mesh.position.set(0, -10, 0);
        }
      } else {
        setNetBallEnv(b, null); // item 1: back on the table environment
        setWellBallOccl(b, null); // GH-626 r8: back in the open
        kPosToThree(b.mesh.position, g.buf[o], g.buf[o + 1], g.buf[o + 2]);
        // issue #50: same pure-roll correction as seek() (t already clamped)
        const cq = rollFix?.quatAt(i, t, g.buf);
        if (cq) kQuatToThree(quatTmp, cq[0], cq[1], cq[2], cq[3]);
        else kQuatToThree(quatTmp, g.buf[o + 3], g.buf[o + 4], g.buf[o + 5], g.buf[o + 6]);
        b.mesh.quaternion.copy(quatTmp).multiply(b.baseQuat);
      }
    });
    driveNetDress(sinks, g.clock); // B1: nets follow the posed state
    syncSphereUniforms(shared, g.ballSet.balls);
    // GH-489 SNK-R37 deviation A (review r11 P2 A), re-cut at the #637 landing
    // (LAND-16 Z2, review round 3 P2 + CORRIGENDUM-1 C1 — a refactor, byte-
    // identical behaviour): the settle deadline waits for the LAST pivot's own
    // end (roll + tip + drop: sinkpivot.js `tEnd`, read from the sink index this
    // playback already holds) — a slow final-event pot rolls ≈ 0.5 s before it
    // tips and used to be hidden at cloth height by settle() at duration + 0.4.
    // The completion time is the ONE un-padded function the offline export
    // plans with (framestep.js sinkCompletionSec: max(duration, max_i s.t +
    // tEnd), carrying this line's own guard — a leaf without tEnd never extends
    // it); the deadline keeps its shape, max(duration + SETTLE_PAD, completion):
    // the pad follows the RECORD end, never the sink completion (the ball is
    // already culled at tEnd). LAND-17 BC: the leaf export is reached through
    // the namespace binding (a stale cached framestep.js links without it) and
    // the degrade branch is the pre-LAND-16 inline expression — same values.
    // One expression; nothing else here moves.
    if (g.clock >= (framestepNs.sinkCompletionSec
      ? Math.max(g.duration + SETTLE_PAD, framestepNs.sinkCompletionSec(g.duration, g.sinkInfo?.values() ?? []))
      // LAND-17 BC degrade (a STALE framestep.js without the export): the 4beb17bf expression verbatim — the same law inline
      : Math.max(g.duration + SETTLE_PAD,
        ...Array.from(g.sinkInfo?.values() ?? [], (s) => (Number.isFinite(s.pivot?.tEnd) ? s.t + s.pivot.tEnd : 0))))) settle();
  }

  function settle() {
    // final truth from the sampler's end state (also finishes short sinks)
    g.sampler.sampleAt(g.duration);
    // B1 (review blocker-cure r1 P1): a pot that IS the record's final
    // motion event settles ~0.4 s later while the net catch lands at
    // ~0.39 s — hiding every pocketed ball here erased the "permanent
    // visible rest" after a single frame. NETTED entries persist
    // through the settled state at their rest pose (poseSink at the
    // deterministic rest clock; the damped envelope is 0 there), and
    // the socks keep their settled deformation. They clear with the
    // sink index itself (resetNets at every record/rack teardown) —
    // "until the next shot", exactly the review's ask. Non-netted
    // classes keep the historical hide bit-identically; the outcome
    // payload is unchanged (netted balls stay pocketed=true for the
    // adjudication law).
    const sinksAtSettle = g.sinkInfo ?? new Map();
    g.playbackBalls.forEach((b, i) => {
      if (g.buf[8 * i + 7] !== 4) return;
      const s = sinksAtSettle.get(b.id);
      b.pocketed = true;
      b.sinkT = -1;
      if (s?.net && poseSink(b, s, REST_CLOCK)) {
        b.mesh.visible = true;
        nettedRetained.set(b, s); // review r2 P1: cleared at the next shot
      } else if (s?.rest && poseSink(b, s, REST_CLOCK)) {
        // GH-626 persistence: a ball resting on a MODELLED closure has its
        // crown on the bed plane — above the shield line — so hiding it
        // here was the old "the ball is gone" presentation surviving from
        // the days the ball fell below the cull. It stays exactly where
        // the model put it, until the cup is cleared (see restRetained).
        b.mesh.visible = true;
        restRetained.set(b, s);
      } else {
        b.mesh.visible = false;
        b.mesh.scale.setScalar(1);
        setWellBallOccl(b, null); // GH-626 r8: a hidden ball is in no cup
      }
    });
    driveNetDress(sinksAtSettle, REST_CLOCK); // settled socks hold the rest
    const down = (id) => g.ballSet.balls.some((b) => b.id === id && b.pocketed);
    // game-neutral settle payload (feature 011 T015): `game` names the
    // active catalog entry; the legacy `nine` flag survives verbatim for
    // nine_ball consumers (the ownership ledger hook contract) while other games
    // carry their own money-ball key. Adjudication stays flow.js's job.
    const outcome = {
      game: g.gameId,
      scratch: down(0),
      pocketed: g.ballSet.balls.filter((b) => b.pocketed).map((b) => b.id),
      ...(g.gameId === 'nine_ball' ? { nine: down(9) } : { eight: down(8) }),
    };
    g.lastOutcome = outcome;
    // Adjudication is flow.js's job: SETTLED is transient — the shotComplete
    // hook (flow.js) MUST route to WIN / BALL_IN_HAND / AIM synchronously.
    setState('SETTLED', outcome);
    machine.emit('shotComplete', g.record, outcome);
  }

  /** Kernel ball radius of THIS rack (template truth, not the render-layer
   * mirror R — placement/overlap decisions feed the kernel's validation). */
  function ballR() {
    return g.template.system.balls[0].params.r;
  }

  /** Scratch: revive the cue ball on the head spot (nudged if occupied;
   * the placeCue kitchen clamp seats it strictly BEHIND the head string —
   * GH-370 class 2, WPA 2.1/3.10). */
  function respotCue() {
    const cue = cueBall();
    cue.pocketed = false;
    cue.mesh.visible = true;
    cue.mesh.scale.setScalar(1);
    cue.sinkT = -1;
    // PASS-2 item 1 (review pass2-r1 P2): a revived ball leaves the sock
    // OUTSIDE seek()/update() — restore the table environment here, or
    // a respotted scratch keeps the sock cube + gated bed GI on the bed.
    setNetBallEnv(cue, null);
    setWellBallOccl(cue, null); // GH-626 r8: revived = out of the cup
    const l = g.template.system.table.length, r = ballR();
    let ky = -l / 4;
    while (!placeCue(0, ky, { lineExclusive: true })
      && ky > -l / 2 + 2 * r) ky -= 2.2 * r;
    // review blocker-cure r2 P2 + r5 P2: a netted scratch that respots
    // leaves its sock — survivors repack down the rest ladder and the
    // socks re-drive from the new poses.
    nettedRetained.delete(cue);
    restRetained.delete(cue); // GH-626: the cup it held is cleared
    refreshNets();
    syncSphereUniforms(shared, g.ballSet.balls);
  }

  // GH-370 class 3 (frozen in-hand placement, WPA 1.6/3.7): shared
  // placement-resolution law for placeCue/placeCueInD. The kernel accepts
  // contact-adjacent pairs (the kernelPlacements 2r + 1e-9 relaxation;
  // Eps::KISS = 1e-6), so a request that lands near/inside an object ball
  // SNAPS to the admissible contact separation instead of being refused.
  // Mirrors sdk/ts/src/rules/respot.ts snapToContact (flow.js's 'anywhere'
  // path) — game.js stays import-free by design, so the ~20 lines live
  // here too. Deterministic and REPLAY-EXACT: a recorded snapped landing
  // (distance already ≥ 2r − 1e-6) re-applies VERBATIM (arm 2), never
  // re-projected through rounding.
  const CONTACT_EPS = 1e-9; // the kernelPlacements relaxation margin
  const KISS_TOL = 1e-6;    // kernel Eps::KISS mirror (validator band)
  // GH-382 (review r27 P1): the snooker IN-HAND clearance — WPBSA Sec3
  // R11(b)(vii) forbids the cue ball touching an object ball while in
  // hand (the referee never allows a touching placement), and the
  // crate's R17(a) D-lattice geometry documents the placement clamp as
  // its enforcement. A D drag that lands near/inside a ball therefore
  // snaps to a FREE separation, decisively outside the judge's 1 µm
  // touching band (snooker_geom FROZEN_EPS mirror) — never the 2r+1e-9
  // contact park the WPA arms keep.
  const D_CLEARANCE = 1e-4;
  /** Resolve a requested kernel point against the frozen-placement law:
   * the point itself when admissible, the projected contact point when it
   * genuinely overlaps the nearest ball, or null (refuse). `zoneClamp`
   * re-clamps the projected candidate into the caller's placement zone.
   * `clearance` overrides the separation margin (the D arm's non-touching
   * law above); the default keeps the GH-370 snap-to-contact law. */
  function resolvePlacement(kx, ky, r, zoneClamp, clearance = CONTACT_EPS) {
    const minSep = 2 * r + (clearance === CONTACT_EPS
      ? -KISS_TOL : clearance - CONTACT_EPS); // accept-raw threshold
    // GH-595: a request cannot rest inside a pocket capture disc — an on-bed
    // centre inside a point-of-no-return disc starts the shot "already
    // pocketed" (the kernel now rejects it, sim/event_loop.rs::validate_input;
    // the v16 chinese8 corner disc reaches into the placement envelope). Snap
    // the request radially OUT to the disc's inner rim (+ the KISS band), then
    // re-clamp to the caller's zone, before the ball-overlap resolution below.
    // Only ever moves an ILLEGAL request (a legal placement is never inside a
    // disc), so recorded seats — which could never have been inside one — are
    // untouched (replay-verbatim law).
    const pockets = g.template.system.table.pockets ?? [];
    for (const pk of pockets) {
      const dx = kx - pk.center.x, dy = ky - pk.center.y;
      const d = Math.hypot(dx, dy);
      if (d > pk.radius) continue; // inclusive: the rim itself pots (gap <= 0)
      if (d < 1e-12) { // request at the disc centre: push toward table origin
        const o = Math.hypot(kx, ky) || 1;
        kx += (-kx / o) * (pk.radius + KISS_TOL);
        ky += (-ky / o) * (pk.radius + KISS_TOL);
      } else {
        kx = pk.center.x + (dx / d) * (pk.radius + KISS_TOL);
        ky = pk.center.y + (dy / d) * (pk.radius + KISS_TOL);
      }
      const c = zoneClamp({ x: kx, y: ky });
      kx = c.x; ky = c.y;
    }
    // GH-383 (merge sweep with GH-370): the ball being PLACED is the
    // LIVE cue register, not literal 0 — under the carom two-cue
    // assignment the placed ball may be 1 (it must not collide with
    // itself, and ball 0 becomes a real obstacle); every non-carom
    // discipline keeps the register at 0, byte-identical to GH-370.
    let near = null, nd = Infinity;
    for (const b of activeBalls()) {
      if (b.id === g.cueBallId) continue;
      const k = threePosToK(b.mesh.position);
      const d = Math.hypot(k.x - kx, k.y - ky);
      if (d < nd) { nd = d; near = k; }
    }
    // GH-595 (review r1 P2): the final admissibility must ALSO clear every
    // capture disc — the ball-overlap projection + zoneClamp below can move a
    // pocket-corrected candidate back inside a disc, and a ball-only check
    // would silently accept a pre-pocketed seat (kernel rejects gap <= 0, so
    // require strictly outside the rim).
    const clearsPockets = (x, y) => pockets.every((pk) =>
      Math.hypot(pk.center.x - x, pk.center.y - y) > pk.radius);
    const admissible = (x, y) => clearsPockets(x, y) && activeBalls().every((b) => {
      if (b.id === g.cueBallId) return true;
      const k = threePosToK(b.mesh.position);
      return Math.hypot(k.x - x, k.y - y) >= minSep;
    });
    if (!near || nd >= minSep) {
      return admissible(kx, ky) ? { x: kx, y: ky } : null;
    }
    if (nd < 1e-12) return null; // degenerate: request at a ball center
    const ux = (kx - near.x) / nd, uy = (ky - near.y) / nd;
    const cand = zoneClamp({
      x: near.x + ux * (2 * r + clearance),
      y: near.y + uy * (2 * r + clearance),
    });
    return admissible(cand.x, cand.y) ? cand : null;
  }

  /**
   * Move the cue ball to kernel (kx, ky), clamped behind the headstring
   * (ball-in-hand region). Returns false if the spot cannot be resolved
   * (genuine multi-ball/zone squeeze).
   *
   * KITCHEN LINE SEMANTICS (GH-370 class 2): with `lineExclusive` the
   * upper bound EXCLUDES the head string — WPA 2.1 defines "above the
   * Head String" as NOT including the line, and WPA 3.10 makes playing
   * from on/below it a foul when the kitchen restriction applies
   * (centre-over-line per 2.13). Contrast placeCueInD below, where the
   * snooker D is INCLUSIVE. The DEFAULT stays the pre-370 inclusive
   * bound (review r1 P2 — mixed-cache law): a cached pre-370 flow.js
   * calls with two args, and its carom break spots (legally ON y = −l/4,
   * UMB Art 23.1(c)) must stay byte-unchanged; the fresh flow.js wrap
   * passes `lineExclusive: true` on every WPA kitchen right, and
   * respotCue seats through it below.
   */
  function placeCue(kx, ky, { lineExclusive = false } = {}) {
    const table = g.template.system.table;
    const w = table.width, l = table.length, eps = 1e-6, r = ballR();
    const zoneClamp = (p) => ({
      x: Math.min(w / 2 - r - eps, Math.max(-w / 2 + r + eps, p.x)),
      y: Math.min(lineExclusive ? -l / 4 - eps : -l / 4,
        Math.max(-l / 2 + r + eps, p.y)),
    });
    const c = zoneClamp({ x: kx, y: ky });
    const spot = resolvePlacement(c.x, c.y, r, zoneClamp);
    if (!spot) return false;
    const p = new THREE.Vector3();
    // GH-370 snap-to-contact placement (the review-r1 live-cue exclusion
    // moved INTO resolvePlacement above — one overlap law, carom two-cue
    // aware)
    kPosToThree(p, spot.x, spot.y, r);
    cueBall().mesh.position.copy(p);
    syncSphereUniforms(shared, g.ballSet.balls);
    return true;
  }

  /**
   * Move the cue ball to kernel (kx, ky) clamped ON/WITHIN the D — the
   * snooker ball-in-hand right (WPBSA Sec3 R5 "Playing from In-hand" via
   * Sec2 R9; feature 012 US2 — the issue #62 erratum: Sec3 R8 is Touching
   * Ball), the D-zone sibling of the kitchen clamp in placeCue above.
   *
   * D LINE SEMANTICS (GH-370 class 2): INCLUSIVE — Sec3 R5 places the cue
   * "on or within the lines of the 'D'", so the baulk line and the D arc
   * are legal addresses (unlike the WPA kitchen, whose head-string bound
   * is exclusive — see placeCue). Requests outside the half-disc project
   * to its nearest boundary point; overlapping requests snap to contact
   * (GH-370 class 3). Returns false only on a genuine squeeze.
   *
   * REPLAY/LIVE LAW SPLIT (GH-382 review r33 P1 + r34 P1 — the kitchen
   * lineExclusive mixed-cache law, verbatim): the raw clamp's DEFAULT is
   * the pre-r27 snap-to-contact law (clearance = the raw CONTACT_EPS
   * default) so a RECORDED placement always re-applies byte-verbatim —
   * a legacy link whose in-hand seat was parked at the old 2r+1e-9
   * touching separation must land there exactly, never be re-legislated
   * to the live clearance (a moved seat re-derives a different
   * ShotRecord). The FRESH live caller opts INTO the r27 non-touching
   * clearance with `opts.nonTouching` (flow.js passes
   * `!replayLocked()`). Mixed-cache degradations mirror the kitchen
   * precedent: a stale flow.js (no opts) + fresh game.js keeps replays
   * exact and degrades LIVE drags to the pre-r27 touching park; a fresh
   * flow.js + stale pre-GH-382 game.js ignores the flag and degrades
   * both lanes to the pre-r27 behavior.
   */
  function placeCueInD(kx, ky, opts) {
    const table = g.template.system.table, r = ballR();
    const baulkY = -table.length / 2 + SNOOKER_BAULK_FROM_BOTTOM;
    const zoneClamp = (p) => {
      let x = p.x, y = Math.min(p.y, baulkY); // behind (or ON) the baulk line
      const dx = x, dy = y - baulkY;
      const d = Math.hypot(dx, dy);
      if (d > SNOOKER_D_RADIUS) { // radial clamp onto the D (arc inclusive)
        x = (dx / d) * SNOOKER_D_RADIUS;
        y = baulkY + (dy / d) * SNOOKER_D_RADIUS;
      }
      return { x, y };
    };
    const c = zoneClamp({ x: kx, y: ky });
    // review r27 P1: the LIVE in-hand D keeps the R11(b)(vii)
    // non-touching clearance — a drag onto a ball can never mint a
    // touching address. The raw default stays verbatim (replay law —
    // header above; review r34 P1: the fresh caller opts in).
    const spot = opts?.nonTouching === true
      ? resolvePlacement(c.x, c.y, r, zoneClamp, D_CLEARANCE)
      : resolvePlacement(c.x, c.y, r, zoneClamp);
    if (!spot) return false;
    const p = new THREE.Vector3();
    // GH-370 snap-to-contact placement (live-cue exclusion lives in
    // resolvePlacement — see placeCue)
    kPosToThree(p, spot.x, spot.y, r);
    cueBall().mesh.position.copy(p);
    syncSphereUniforms(shared, g.ballSet.balls);
    return true;
  }

  // GH-318 seam marker: playback.js feature-detects lineage-aware
  // loading before it drops the view-anyway flag for a lineage-proven
  // stamp — over a STALE cached game.js (strict pre-318 loadRecord, no
  // marker) the un-flagged load would be REFUSED, so the probe keeps the
  // raw-compare/view-anyway behavior instead (cache-poison contract).
  loadRecord.lineageAware = true;

  return Object.assign(g, {
    rerack, rerackKind, restoreRack, emitRestoredState, shoot, replay,
    loadRecord, cueBall,
    // GH-489 #637 LAND-17 C2 (review 775r4 P2; recorded deviation, the ownership ledger):
    // the ONE sink-index law read by the offline planner and the DVR wall for
    // the LOADED record — the same lazy index poseSink animates the drops from
    // (nulled on load, rebuilt on demand). Feature-detected by its readers
    // (`game.sinkEntries?.()`): a stale game.js without it degrades them to the
    // kernel duration. Read-only: an array copy of the entries, never the Map.
    sinkEntries: () => [...sinkIndex().values()],
    setCueBallId, // GH-383: per-seat carom cue assignment (flow.js sync)
    /** GH-383 visual fork: swap the carom second-ball paint; effective on
     * the NEXT rack build (settings.js reracks in place when safe). */
    setCaromSecondBall: (v) => {
      g.caromSecondBall = v === 'marked' ? 'marked' : 'yellow';
    },
    activeBalls,
    kernelPlacements,
    placeCueInD,
    /** Re-sync the analytic-shadow uniforms after an external mesh move
     * (flow.js discipline respots — feature 012 US2).
     * review blocker-cure r3 P2: every discipline respot (money-ball
     * return, snooker colours, reracks) routes through this seam after
     * moving meshes — refresh the NETS from the current poses here too:
     * live-again balls leave the retained set and their socks relax;
     * still-netted balls keep their settled dents. */
    syncShadows: () => {
      refreshNets(); // review r3/r5 P2: prune + repack + re-drive
      syncSphereUniforms(shared, g.ballSet.balls);
    },
    /** GH-626 review r4 P2: the closure occupancy travels with the GH-257
     * Playback borrow/restore snapshot, BY BALL ID like every other
     * per-ball fact playback.js snapLive() captures. The player's quiet
     * staging (segment loads, a quiet rack swap) clears restRetained with
     * the table state it replaces — correctly, that bed is not the live
     * one — and its close re-applies pose/flags per id (restorePoses), so
     * without a carrier the restored ball stood on the plug with no owner:
     * an equipment preview left it hanging on the removed plug (the r1
     * defect) and the next pot into the cup took the same station. The
     * sink ENTRY is what travels: it is pure in the ball id (capture time,
     * kinematics, pocket, radius — no mesh reference), so it survives a
     * rebuilt ball set, and the close-side refreshNets (syncShadows)
     * re-derives the station from it exactly as after any teardown.
     * Feature-detected by playback.js (cache-poison contract: a stale
     * playback.js keeps today's pose-only restore). */
    snapshotRests: () => [...restRetained]
      .filter(([b]) => b.pocketed)
      .map(([b, s]) => ({ id: b.id, entry: s })),
    /** Rebuild the occupancy from a snapshotRests() list over the CURRENT
     * ball objects. Map only — the caller follows with syncShadows(), which
     * re-binds and re-poses (restorePoses already does). A ball the restore
     * left on the table (pocketed=false) owns nothing and is skipped. */
    restoreRests: (rests) => {
      let n = 0;
      for (const { id, entry } of rests ?? []) {
        const b = g.ballSet?.balls.find((x) => x.id === id);
        if (!b || !b.pocketed || !entry) continue;
        restRetained.set(b, entry);
        n += 1;
      }
      return n;
    },
    setState,
    update, placeCue,
    layout, seek, respotCue,
    setPhi: (phi) => { g.phi = phi; },
    /** Equipment spec (catalog ids) the NEXT rerack composes the rack from
     * (settings.js owns the value; null = the pre-catalog legacy template). */
    setEquipment: (spec) => { g.equipment = spec ? { ...spec } : null; },
    /** GH-1042: 'kernel' while a share minted before the fix replays (its
     * sender's app racked snooker/carom on the kernel's default pairing,
     * whatever equipment the link carries, so the re-simulation must too);
     * 'selected' otherwise. The pin holds the CURRENT spec object, so it
     * ends by itself when settings swaps the spec (restore, game switch,
     * any equipment commit). Read at the NEXT rerack; share.js sets it. */
    setDisciplinePairing: (mode) => { g.kernelPairingFor = mode === 'kernel' ? g.equipment : null; },
    /** Mid-rack cue swap (design 277 slice 3 PR-2; issue #283 decision 3
     * — recorded frozen-file deviation, the setEquipment shape). WPA 1.3
     * "Player's Use of Equipment" explicitly permits switching cues
     * between shots (playing / break / jump cue), so a cue change must
     * not cost the rack: recompose a THROWAWAY template from the CURRENT
     * g.equipment (settings.js updates it first; a rack the pre-fix share
     * pin composed keeps its own non-cue axes, see the body) at the
     * active seed and
     * splice its resolved options (squirt end-mass, tip, miscue envelope)
     * + equipment provenance tag into the LIVE template — balls, judge
     * and machine state untouched. buildScenario() reads the spliced
     * options at shoot time, so the swap binds at the NEXT shot and every
     * ShotRecord pins the new cue id (shared replays byte-match — the
     * catalog-v14 resolution law). GH-1042: a composition that does not
     * carry the selected cue (its equipment tag names another cue; an
     * absent tag is the default 'standard') is refused, never spliced as
     * a success, so the HUD cannot confirm a swap the strike ignores.
     * Returns null on success, an error string otherwise (the live
     * template then stays as-was; the next rerack composes the new spec
     * regardless — except under a pre-fix kernel stamp, whose discipline
     * racks never carry the pick: that refusal starts 'reload-required'). */
    swapCue: () => {
      if (!g.template) return 'no active rack';
      const wanted = g.equipment?.cue_id ?? 'standard';
      // A rack composed under the pre-fix share pin (gotoShot; the adopted
      // rack after Continue, also once Playback restored a clone of it)
      // stands on the kernel pairing while g.equipment holds the link's
      // encoded selection. A cue swap on it must not splice that
      // selection's ballset / cloth / cushion into a rack whose balls and
      // table it does not replace, so it composes from the axes rerack
      // recorded for that rack with the selected cue; a replay pin on the
      // spec stays a pin. Every other rack composes from g.equipment as
      // before (Playback's restore re-resolves the returned spec here).
      const t = g.template;
      const pin = g.kernelPinned;
      const live = pin && pin.key === JSON.stringify([t.system?.table, t.system?.balls,
        { ...t.options, cue: undefined }]) ? pin.tag : null;
      const saved = g.equipment;
      const savedPin = g.kernelPairingFor;
      let composed;
      try {
        if (live) {
          g.equipment = { ...live, cue_id: wanted };
          if (savedPin && savedPin === saved) g.kernelPairingFor = g.equipment;
        }
        composed = composeRack(g.seed);
      } catch (e) {
        return String(e?.message ?? e);
      } finally {
        g.equipment = saved;
        g.kernelPairingFor = savedPin;
      }
      const carried = composed.template.system?.equipment?.cue_id ?? 'standard';
      if (carried !== wanted) {
        // review r2: under a pre-fix kernel stamp every discipline rack this
        // session takes the kernel pairing (g.legacyKernel), so the next
        // rack would not carry the pick either — a distinct reason, which
        // settings words as reload-required, never as the next-rack line.
        if (g.legacyKernel) {
          return `reload-required: this kernel predates the selected-cue racks; a reload is needed to strike with ${wanted}`;
        }
        return `the composed rack carries cue ${carried}, not the selected ${wanted}`;
      }
      g.template.options = composed.template.options;
      // MIRROR the composed template exactly, absence included (review r2
      // P2): all-default compositions serde-skip the equipment tag, so a
      // swap back to the default cue must DELETE the stale provenance —
      // leaving it would pin the next ShotRecord (and its post-strike
      // cue) on the previous cue id over standard physics.
      if (composed.template.system?.equipment) {
        g.template.system.equipment = composed.template.system.equipment;
      } else {
        delete g.template.system.equipment;
      }
      return null;
    },
    /** Select the active game for the NEXT rerack (feature 011): validates
     * against the GameCatalog (playable entries only — selector rule,
     * contracts/game-catalog.md §4) and stages gameId/rulesetId. Callers
     * re-rack themselves (settings confirm flow, __rules.setGame, share
     * replay routing). Async: resolves false when the games module is
     * unavailable (stale cache) so a degraded boot stays a working 9-ball
     * app; throws GameCatalogError on unknown ids and Error on readiness
     * entries (programming errors, not user flows). */
    setGame: async (id) => {
      if (id === g.gameId) return true;
      if (id === 'nine_ball') {
        g.gameId = 'nine_ball';
        g.rulesetId = 'nineball-v1';
        return true;
      }
      const m = await gamesReady;
      if (!m) return false;
      const entry = m.getGameEntry(id); // throws GameCatalogError on unknown
      if (entry.readiness !== 'playable' || !entry.ruleset_id) {
        throw new Error(`game '${id}' is not selectable for play (readiness: ${entry.readiness})`);
      }
      g.gameId = id;
      g.rulesetId = entry.ruleset_id;
      return true;
    },
  });
}
