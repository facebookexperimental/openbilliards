// Copyright (c) Meta Platforms, Inc. and affiliates.

// cuepostlive.js — LIVE-APP adoption lane for the cue post-strike visual
// dynamics engine (design 277 §5, issue #277 slice 3, PR-1). The engine
// itself (web/app/cuepost.js) stays a pure function of (armed spec, clock
// t); THIS module decides WHEN the live app arms it and from WHAT, so the
// post-strike cue finally exists outside harnesses: on every live stroke
// the aim cue hides exactly as before (aim.js's `cue.group.visible =
// isAiming` latch is untouched) and the engine's cue takes over AT the
// strike — follow-through, stay-down (the D4 law min(3 s, t_rest,
// t_intrusion − withdraw − margin)), withdrawal/dissolve — driven by the
// SAME playback clock ('frame' emissions) live playback, pause, slow-mo,
// scrubs and seeks already ride.
//
// WHAT ARMS (and what deliberately does not):
//   • game.shoot's PLAYBACK entry — stateChange info `{ duration, strike:
//     true }` (the additive game.js flag this PR records): every live
//     stroke, including drill attempts, playground shots and SHARED-REPLAY
//     re-simulations (share.js fires game.shoot with the sender's recorded
//     params — the record then carries the sender's pinned equipment cue,
//     and superseded catalog ids resolve forever per the v14 law).
//   • game.replay's PLAYBACK entry — `{ replay: true }` WITHOUT `dvr`:
//     the Replay button re-runs the same record; the arm is re-resolved
//     from the same bytes (purity: same record ⇒ same plan).
//   • NOT `dvr: true` entries: the 030 DVR player owns its own arms
//     (playback.js renderAtT — it stages records the live lane cannot see
//     coming, swaps them mid-session without emissions, and walks GH-299
//     beat windows whose staged balls belong to the NEXT record; arming
//     from here would be stale the moment the player restaged).
//   • NOT loadRecord's default-path PLAYBACK entry (`{ duration }` with no
//     strike flag): that is the batch/render-harness surface (batch renders,
//     render-hooks-demo, scenario tooling) — the published packs stay
//     byte-reproducible, and demo-harness arming is a separate OPT-IN knob
//     (slice 3 PR-2, default OFF).
//   • NEVER while `__test.cueStrike` is armed (the two-rig law: two rigs
//     render two cues — cuepost.js header contract).
//
// HANDOFF CONTINUITY (the no-pop law, e2e-gated): the engine reads every
// pose input off the RECORD (kernel truth) — anchor = the record's initial
// cue-ball rest pose = the aim cue's own anchor at fire time (game.shoot
// serializes the live mesh placements); phi/theta/a/b = the fired shot,
// already carrying flow.js's fire-time elevation floor. So at the handoff
// frame the engine's cue lies ON the aim cue's exact strike line — the
// only delta is AXIAL (the thrust advance itself, pull: aim rest-pull →
// contact), which is the strike, not a pop. The e2e law asserts zero
// lateral/angular deviation and that the engine resolved no theta bump for
// the fired framing.
//
// SPEC (the vC = v0 law): the engine's animated contact speed is
// vC = 2·(pullback_m − pC)/durThrust. The kernel's v0 IS the cue-tip speed
// at contact (kernel-api.md ShotParams), so the live arm makes vC = v0 —
// the follow-through then decelerates from the real contact speed instead
// of a harness constant:
//   pullback_m = v0·durThrust/2 + pC   (durThrust = 0.12 s; W = 0.5 s)
// and when that exceeds the engine's 0.6 m pullback ceiling (center hits
// past ~10.2 m/s), the approach WINDOW shrinks instead so
// durThrust = 2·(0.6 − pC)/v0 keeps vC exact across the whole domain
// (review r2 P2 — real breaks thrust FASTER, not longer). pC =
// −(TIP_GAP + (1 − √(1−a²−b²))·r) is the engine's own tip-on-ball pull
// (literal mirror — the cuestrike constants discipline; drift is
// cosmetic-only). The pre-contact stroke phases live entirely at t < 0
// and never render in live play (the clock starts at 0); they exist so
// the engine's pre-contact sweep and DVR scrubs to t = 0 stay
// well-defined.
//
// DISARM (fail-closed, the interrupt law): the live arm exists only while
// the machine is in PLAYBACK or SETTLED. ANY transition to another state —
// the settle adjudication's AIM/BALL_IN_HAND/WIN routing, a rerack/layout
// (fresh table), the next stroke's SIMULATING, a DVR borrow — disarms
// immediately. Consequence, recorded for the owner (capture-sheet note,
// PR-1): on shots that rest in under ~3 s the D4 withdrawal tail can
// outlive PLAYBACK by up to ~0.2 s (settle fires at duration +
// SETTLE_PAD 0.4 s; tHide = tLift + withdrawDuration ≤ tRest + 0.6 s), so
// the tail truncates at the settle→AIM handoff — the frame the aim cue
// returns. The approved D4 defaults are NOT shortened to fit (owner
// doctrine: keep the approved timing, surface the observation).
// The lane never disarms an arm it does not own (a harness that armed
// __test.cuePost directly keeps its arm through state churn — the
// e2e-cuepost rejection/purity arms rerack freely).
//
// OWNERSHIP (module-ownership contract): NEW leaf module, guarded dynamic
// import from main.js (the cuepost.js/cuestrike.js shape — a stale cache
// missing this module leaves the live app exactly pre-277: the cue
// vanishes at t = 0, never a module-graph error). Reaches the engine and
// the cuestrike rig through main.js-provided GETTERS (no new import
// edges); playback.js reaches the spec builder through the
// `__test.cuePostLive.specFor` seam, feature-detected (rule 5).

// ---- literal mirrors (cuepost.js; the cuestrike mirror discipline) ----
const TIP_GAP = 0.010;        // cuestick.js TIP_GAP (poseCue rest gap)
const LIVE_APPROACH_S = 0.5;  // approach window [s]: 0.35·W > 0.12 s, so
                              // the engine's THRUST_MAX_S cap pins
                              // durThrust = 0.12 s (the vC = v0 law above)
const LIVE_THRUST_S = 0.12;   // engine THRUST_MAX_S mirror
const LIVE_THRUST_FRAC = 0.35; // engine THRUST_FRAC mirror — the W-shrink
                              // leg below inverts durThrust = 0.35·W
const LIVE_PULL_MIN = 0.005;  // pullback floor [m]: keeps the spec inside
                              // the engine's (0, 0.6] open interval for
                              // degenerate sub-UI records (v0 under ~0.3
                              // m/s, or extreme offsets whose pC eats the
                              // whole pullback); vC then slightly exceeds
                              // v0 — sub-perceptual, and unreachable from
                              // the UI's 0.5 m/s power floor (review r2:
                              // the old 0.02 floor overshot soft shots
                              // the UI CAN fire)
const LIVE_PULL_MAX = 0.6;    // engine domain ceiling

// ---- GH-363 pre-strike lead-in (v2 practice strokes + v1 hold) -----------
// Per-discipline PRACTICE PROFILES — the owner-verdict population medians
// (issue #363, verdict 2026-08-05; provenance row-by-row in
// the issue-363 practice-stroke calibration record + the broadcast table
// in the issue's design comment). Never invented: every number cites its
// measured rows.
//   pool    3 feathers @ 0.70 s (verdict median; coaching modal 2-4, owner
//           d4285 = 3 @ 0.69-0.78 s), front hold 0.45 s (calib §5), rear
//           pause 0.15 s (Alciatore instant-pause + owner spread)
//   snooker 2 @ 0.45 s (O'Sullivan 0.42-0.50, Trump 0.40-0.45), rear
//           0.18 s (O'Sullivan 0.12-0.24 median); front hold = the
//           population default (no measured snooker front-hold row)
//   carom   2 @ 1.15 s (Jaspers 1.1-1.2 — n=1, THIN flag stands per the
//           verdict), rear 0.22 s (Jaspers 0.20-0.25)
//   break   feathered 3-pump median @ 0.70 s (owner-footage-validated:
//           d4285 3 @ 0.69-0.78 s, front hold 0.55 s, rear ~0.1 s, taper
//           0.76), selected when the pool-discipline shot classifies as a
//           break (v0 >= CLASS_BREAK_V0 mirror). The static-set style
//           (d4284/Filler/Gorst) is retained as an authored variant for a
//           future option, NOT a default (verdict).
// amp is a SCALING LAW, not a constant: amp = 0.5 x pullback_m (Cheng 2008
// feather 0.4-0.6 x final stroke) — power classes inherit amplitude
// through the per-class pullback. taper 0.7 (Cheng short last feather;
// owner 0.76). jitter ±10% (measured per-cycle spread).
const PRACTICE_PROFILES = {
  pool: { count: 3, period_s: 0.70, hold_s: 0.45, pause_s: 0.15, taper: 0.7 },
  snooker: { count: 2, period_s: 0.45, hold_s: 0.45, pause_s: 0.18, taper: 0.7 },
  carom: { count: 2, period_s: 1.15, hold_s: 0.45, pause_s: 0.22, taper: 0.7 },
  break: { count: 3, period_s: 0.70, hold_s: 0.55, pause_s: 0.10, taper: 0.75 },
};
const FEATHER_FRACTION = 0.5; // amp = 0.5 x pullback (Cheng 2008)
const PRACTICE_JITTER = 0.10; // ± measured per-feather spread
const LEAD_HOLD_V1 = 1.8;     // v1 static address hold [s] (issue #363:
                              // "default ~1.5-2 s"; prototype pack value)
const LEAD_HOLD_V1S = 0.6;    // the degrade ladder's short hold (design §5)
const CLASS_BREAK_V0 = 6.5;   // cuepost.js CLASS_BREAK_V0 (literal mirror)
const CLASS_JUMP_THETA = 25 * Math.PI / 180; // cuepost.js mirror — the
                              // engine classifies masse (>= 60 deg) and
                              // jump (>= 25 deg at speed) BEFORE break, so
                              // the break practice profile must exclude
                              // elevated shots the same way (review 363 r4
                              // P2; at v0 >= 6.5 the jump speed floor is
                              // always met, so theta alone decides)
// kind-locked discipline table prints (playback.js GH-319 literal mirrors
// — kernel constants wpbsa_snooker_12ft / umb_carom_284; pool dims never
// collide with either)
const SNOOKER_DIMS = [3.569, 1.778];
const CAROM_DIMS = [2.84, 1.42];

/** FNV-1a 32-bit (game.js fnv1a mirror, numeric form) — the deterministic
 * practice-jitter seed: same record + shot index + tier on any machine =
 * the same feather schedule (kernel replay law, design 363 §4). */
function fnv1a32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Discipline of a record by its table print (the GH-319 idiom): the
 * snooker/carom kernel kinds are dim-locked, every pool table differs. */
function disciplineOf(record) {
  const t = record?.initial?.table;
  const is = (d) => !!t && Number.isFinite(t.length) && Number.isFinite(t.width)
    && Math.abs(t.length - d[0]) < 1e-6 && Math.abs(t.width - d[1]) < 1e-6;
  if (is(SNOOKER_DIMS)) return 'snooker';
  if (is(CAROM_DIMS)) return 'carom';
  return 'pool';
}

/** Live arm spec for a loaded ShotRecord — pure function of the record
 * bytes (the determinism doctrine: same record ⇒ same spec ⇒ same plan).
 * Returns null when the record cannot seed a spec (no Strike event / no
 * cue ball / non-finite shot) — callers skip arming, fail-closed. The
 * engine re-validates everything anyway; this only computes the two
 * numbers the engine cannot choose itself (approach window + pullback).
 *
 * `lead` (GH-363, optional — ABSENT keeps the returned spec byte-identical
 * to pre-363, so live strokes and lead-off plans never change):
 *   { tier: 'v2' | 'v1' | 'v1s',  // practice strokes | 1.8 s address hold
 *                                 // | 0.6 s degrade hold (design 363 §5)
 *     index,                      // shot index in the timeline — part of
 *                                 // the deterministic jitter seed
 *     vw0?,                       // record-clock visibility open (the
 *                                 // caller's lead/staging window start);
 *                                 // emitted as visible_window [vw0, null]
 *     clock? }                    // { offset_s, rate } pass-through — the
 *                                 // fused beat-tail arm (cuepost.js seam)
 * All three tiers share the approach window INCLUDING the profile's rear
 * pause (pause_s), so one probe of the v2 plan decomposes into every
 * tier's T_pre (the ONE-probe law the schedule builders rely on). */
export function liveCuePostSpec(record, lead = null) {
  const sh = record?.shot;
  const strikeEv = record?.events?.find?.((e) => e?.kind !== null
    && typeof e?.kind === 'object' && 'Strike' in e.kind);
  // GH-383: the struck ball rides the Strike event (carom two-cue)
  const cueId = strikeEv?.kind?.Strike?.ball ?? 0;
  const cb = record?.initial?.balls?.find?.((b) => b?.id === cueId);
  const r = cb?.params?.r;
  if (!sh || !strikeEv || !Number.isFinite(strikeEv.t)
    || !Number.isFinite(sh.v0) || !Number.isFinite(sh.a)
    || !Number.isFinite(sh.b) || !Number.isFinite(r)) return null;
  const off2 = sh.a * sh.a + sh.b * sh.b;
  if (!(off2 < 1)) return null;
  const sOff = (1 - Math.sqrt(1 - off2)) * r;
  const pC = -(TIP_GAP + sOff); // engine pull-at-contact (mirror)
  // the vC = v0 law across the WHOLE domain (review r2 P2): the engine
  // resolves vC = 2·(pullback − pC)/durThrust with durThrust =
  // min(0.35·W, 0.12). Below the pullback ceiling, W = 0.5 s pins
  // durThrust at 0.12 and pullback carries the law; ABOVE it (center
  // hits past ~10.2 m/s — the UI allows 12, records 15), pullback pins
  // at 0.6 and the approach WINDOW shrinks instead so durThrust =
  // 2·(0.6 − pC)/v0 keeps vC exact (real breaks thrust faster, not
  // longer). Only the sub-UI degenerate floor (LIVE_PULL_MIN doc) still
  // rounds vC up.
  let pullback = (sh.v0 * LIVE_THRUST_S) / 2 + pC;
  let fromS = strikeEv.t - LIVE_APPROACH_S;
  let wShrunk = false;
  if (pullback > LIVE_PULL_MAX) {
    pullback = LIVE_PULL_MAX;
    const durThrust = (2 * (LIVE_PULL_MAX - pC)) / sh.v0; // < 0.12 here
    fromS = strikeEv.t - durThrust / LIVE_THRUST_FRAC;
    wShrunk = true;
  }
  pullback = Math.max(pullback, LIVE_PULL_MIN);
  if (!lead?.tier) {
    // pre-363 shape, byte-identical (live strokes / lead-off plans)
    return {
      t_contact: strikeEv.t,
      approach: { from_s: fromS, pullback_m: pullback },
    };
  }
  // ---- GH-363 lead-in tiers ----
  const disc = disciplineOf(record);
  // class precedence mirrors the engine (masse/jump outrank break): an
  // elevated power shot is a JUMP, not a break — it keeps the discipline
  // profile, never the break ritual
  const profile = disc === 'pool' && sh.v0 >= CLASS_BREAK_V0
    && !(sh.theta >= CLASS_JUMP_THETA)
    ? PRACTICE_PROFILES.break : PRACTICE_PROFILES[disc];
  // the measured rear pause rides ALL tiers (one approach geometry — the
  // ONE-probe law). Below the pullback ceiling the window GROWS by the
  // pause (a rear pause is added dwelling, not stolen pull; durThrust
  // stays pinned at 0.12 s); on the W-shrunk leg the window is the vC = v0
  // law's own and the pause is clamped so the engine's durPull > 0.05 s
  // guard holds with margin.
  let pauseS = profile.pause_s;
  if (!wShrunk) {
    fromS = strikeEv.t - (LIVE_APPROACH_S + pauseS);
  } else {
    const W = strikeEv.t - fromS;
    const durThrust = LIVE_THRUST_FRAC * W; // = the exact-vC thrust here
    pauseS = Math.max(0, Math.min(pauseS, W - durThrust - 0.06));
  }
  const practice = lead.tier === 'v2'
    ? {
      count: profile.count,
      amp_m: FEATHER_FRACTION * pullback,
      period_s: profile.period_s,
      hold_s: profile.hold_s,
      taper: profile.taper,
      jitter: PRACTICE_JITTER,
      // deterministic jitter stream (design 363 §4): every input lives in
      // the replay file — replays and re-exports reproduce bit-identically
      seed: fnv1a32(`${record.kernel_version ?? ''}|`
        + `${JSON.stringify(record.shot)}|${lead.index ?? 0}|${lead.tier}`),
    }
    : { count: 0, hold_s: lead.tier === 'v1s' ? LEAD_HOLD_V1S : LEAD_HOLD_V1 };
  return {
    t_contact: strikeEv.t,
    approach: { from_s: fromS, pullback_m: pullback, pause_s: pauseS },
    practice,
    ...(Number.isFinite(lead.vw0)
      ? { visible_window: [lead.vw0, null] } : {}),
    ...(lead.clock && Number.isFinite(lead.clock.offset_s)
      ? { clock: { offset_s: lead.clock.offset_s,
        rate: Number.isFinite(lead.clock.rate) ? lead.clock.rate : 1 } }
      : {}),
  };
}

export function createCuePostLive({ machine, game, getCuePost, getCueStrike }) {
  let ownedArm = false;   // we armed the engine and nobody disarmed it yet
  let lastPlan = null;    // the resolved plan of OUR last arm (readout)
  let lastReject = null;  // diagnostic string of the last refused arm
  let enabled = true;     // harness escape hatch (__test surface; default ON)

  function disarm(reason) {
    if (!ownedArm) return;
    ownedArm = false;
    lastPlan = null;
    const cp = getCuePost();
    if (cp) cp.arm(null);
    void reason; // (kept for readability at call sites)
  }

  function arm() {
    const cp = getCuePost();
    if (!cp) {
      // engine module still loading (guarded dynamic import) — this
      // stroke plays pre-277; the next one arms. Fail-closed, no retry
      // loop: retrying mid-playback would arm a cue that pops in late.
      lastReject = 'engine loading';
      return;
    }
    if (getCueStrike()?.active?.()) {
      lastReject = 'cueStrike armed (two-rig law)';
      return;
    }
    const spec = liveCuePostSpec(game.record);
    if (!spec) {
      lastReject = 'record cannot seed a live spec';
      return;
    }
    const plan = cp.arm(spec);
    if (plan === false) {
      // the engine said no (rail-unsafe framing / pre-contact sweep /
      // degenerate record) — its console diagnostic already names why.
      // The stroke plays pre-277 (cue hidden at t = 0), fail-closed.
      lastReject = 'engine rejected the live spec (see [cuepost] diagnostic)';
      return;
    }
    // THETA-BUMP guard (review r1 P2): the engine may raise the resolved
    // elevation by up to +6 deg (0.25-deg steps) to clear a rail with the
    // flexed rod and still return a plan. The fired theta already carries
    // the fire-time floor, so normally thetaR == record theta exactly —
    // but a bumped plan would swing the cue OFF the aim cue's strike line
    // at contact, an angular pop the no-pop handoff law forbids. Fail
    // closed: the stroke plays pre-277. (The DVR lane keeps bumped plans
    // on purpose — the player has no aim cue to hand off from, so a
    // self-consistent raised elevation beats no cue at all.)
    // Reconciliation review P2: a plan with NO finite resolved elevation
    // fails closed too — a cached older cuepost.js can return a valid
    // plan without bend.thetaDeg while already applying the rail bump,
    // and the previous `?? NaN` slid that shape PAST the guard (NaN
    // comparisons are false). Unverifiable elevation = unverifiable
    // handoff (mixed-cache contract, rule 5).
    const theta = game.record?.shot?.theta;
    const thetaR = plan.bend?.thetaDeg;
    if (Number.isFinite(theta)
      && (!Number.isFinite(thetaR)
        || Math.abs(thetaR * Math.PI / 180 - theta) > 1e-6)) {
      cp.arm(null);
      lastReject = Number.isFinite(thetaR)
        ? `engine raised the elevation (${thetaR} deg vs `
          + `fired ${(theta * 180 / Math.PI).toFixed(3)} deg) — handoff would `
          + 'pop; stroke plays pre-277'
        : 'engine plan carries no resolved elevation (stale cuepost.js?) — '
          + 'handoff unverifiable; stroke plays pre-277';
      return;
    }
    ownedArm = true;
    lastPlan = plan;
    lastReject = null;
  }

  machine.on('stateChange', (next, prev, info) => {
    void prev;
    if (next === 'PLAYBACK') {
      if (!enabled) return;
      if (info?.dvr) return;            // the DVR player owns its arms
      if (info?.strike || info?.replay) arm();
      return;
    }
    if (next === 'SETTLED') return;     // transient adjudication — the
    // withdrawal tail may still be dissolving; the synchronous routing to
    // AIM/BALL_IN_HAND/WIN lands in the branch below within this task
    disarm(next);
  });

  return {
    /** Read-only instrument (e2e / capture tooling). */
    state: () => ({
      enabled,
      ownedArm,
      plan: lastPlan,
      reject: lastReject,
    }),
    /** Harness escape hatch: `setEnabled(false)` keeps the live lane out
     * of a scripted boot's way (A/B captures, pre-277 baselines). Scoped
     * to FUTURE strokes; an existing arm disarms immediately. */
    setEnabled: (on) => {
      enabled = !!on;
      if (!enabled) disarm('disabled');
      return enabled;
    },
    /** Spec builder seam for the DVR player (playback.js renderAtT) —
     * pure; see liveCuePostSpec. */
    specFor: liveCuePostSpec,
    /** Offline-render bracket seam (reconciliation review r2 P2): disarm
     * THROUGH the lane so the ownership bookkeeping (ownedArm/lastPlan)
     * clears WITH the engine arm. A bare engine-level cuePost(null)
     * left ownedArm standing, and the lane's next settle-routed disarm
     * would then blanket-clear an arm it no longer owned — e.g. a
     * harness arm placed after the render — violating the
     * never-disarm-what-you-do-not-own law. No-op unless the lane owns
     * the standing arm. */
    disarm: (why) => disarm(why ?? 'external disarm'),
  };
}
