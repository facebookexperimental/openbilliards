// Copyright (c) Meta Platforms, Inc. and affiliates.

// e2e-share.mjs — STREAM-C gate: replay sharing determinism + sound +
// settings. Plays 2 scripted shots ON NON-DEFAULT EQUIPMENT (low-deflection
// cue — share v3 must carry the full spec), encodes the game with the share
// codec, reloads the page with the #r= hash, and asserts the re-simulated
// records BYTE-MATCH the originals (determinism doctrine: a game = seed +
// ordered shot list + equipment). Also: legacy v1/v2 share links still open
// (their preset/cloth wires map into the equipment spec). Sound: asserts
// WebAudio nodes were scheduled from the event list with muted output
// (headless). Settings: toggles the aim-assist level and asserts the
// ob:settings hook fired + localStorage persisted.
//
// Feature 011 (T026) arms:
//   * v4 game axis on the live round-trip (game nine_ball, empty calls,
//     transient game routing; the encoded formatV pin tracks the CURRENT
//     wire — 7 since the GH-448 breaker seat (6 was the issue-#68
//     playground axes, whose live round-trip fidelity arm rides
//     e2e-playground.mjs);
//   * the PINNED legacy corpus (web/tools/fixtures/legacy-links.json,
//     SC-003 oracle): G1 decode identity, G2 scenario byte pins +
//     event-stream pins (kernel-corpus.json), adjudication parity;
//   * 8-ball share round-trip byte-match — INTEGRATION-DEPENDENT: probes
//     the live app and SKIPS loudly until the game/flow lane's rack
//     dispatch (game.setGame) and the eightball-v1 ruleset are merged.
//
// Feature 012 (T051) arms — RE-PLANNED at the feature-018 default flip
// (flip-cascade.md §4/§5):
//   * legacy-link kernel gating: the flip pair is deliberately NOT in
//     KERNEL_COMPAT_LINEAGE (break physics really changed), so every
//     legacy link must hit the STRICT gate's warning banner; the arm
//     drives view-anyway and pins the replay at the event-stream level
//     (break shots = the registered divergence class, byte-checked
//     against the committed dist's own node replay);
//   * per-game equipment pairing: switching disciplines adopts each game's
//     own persisted spec, never the previous game's leftovers (US4/T049);
//   * one v4 round-trip per NEW discipline (one-pocket / snooker / carom —
//     SC-007): mechanism-armed, SKIPS loudly until each US4 readiness flip
//     lands (research.md R12).
//
// GH-302 arms (the `&cp=` camera-plan SIBLING param — carrier Option B,
// contracts/share-codec.md Amendment cp-v1):
//   * (a) planless red-proof: a planless session's link stays byte-shaped
//     like today's (`#r=…$` — an appended param fails the assertion);
//   * (c) full app round trip: author DVR plan (mid-segment cut + fade +
//     custom tripod) → `&cp=` link → replay (records STILL byte-match —
//     cp never touches physics; the replay pass itself never archives,
//     the ARCHIVE-PHASE-A law) → the CONTENT-MATCHED session (the
//     author's original, persisted in IndexedDB while the camLatch died
//     with the page) adopts the plan byte-equal on the GH-301 integer
//     model; node-side dist-codec decode byte-equal too;
//   * (b) malformed/truncated/future-version cp: plan ignored with ONE
//     console warn, the replay plays to done, no user-facing error;
//   * (d) honest-degrade notice red/green via the __share.envelope knob:
//     an over-envelope plan drops (no &cp=) and the Share press SAYS so
//     (share.copiedNoPlan / share.inAddressBarNoPlan); restored, the plan
//     rides and the plain register returns;
//   * unknown cam id inside a VALID cp rides the wire untouched and
//     degrades at APPLY time to broadcast (#301 §1.4).
//
//   node web/tools/e2e-share.mjs   (needs Chrome + node >= 22)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';
import { setPhoneMetrics } from './touch-cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// suite-unique defaults; env-overridable so parallel worktree lanes can run
// this suite concurrently without fighting over the ports
const PORT = Number(process.env.OB_E2E_PORT ?? 20070);
const CDP_PORT = Number(process.env.OB_E2E_CDP_PORT ?? 9227);
const fail = (msg) => { console.error('E2E-SHARE FAIL:', msg); process.exitCode = 1; };

// committed dist SDK (the same build the app consumes) for node-side decode
// + adjudication parity checks (gen-legacy-corpus.mjs precedent).
// GH-302: the cp camera-plan codec rides the same module.
const sdk = (m) => import(path.join(webDir, 'dist', 'pool-sdk', m));
const {
  decodeCameraPlan, decodeShare, encodeCameraPlan, kernelGate,
} = await sdk('share.js');
const { judgeShot, deriveOnTable } = await sdk('rules/nineball.js');
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
/** Canonical stringify (sorted object keys) — deep-equality independent of
 * property insertion order. */
const canon = (v) => JSON.stringify(v, (k, val) =>
  (val && typeof val === 'object' && !Array.isArray(val))
    ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : 1)))
    : val);

// ---- Gate G-KERNEL corpus arm (feature 012 T015 — SC-003/FR-009;
// contracts/equipment-additions.md §4.3): `--corpus` re-simulates every
// pinned legacy-corpus scenario + the committed break fixture on BOTH the
// T003-archived pre-012 wasm (web/tools/fixtures/pre012-wasm/) AND the
// committed canonical wasm (web/dist/pool-wasm/), byte-diffing the
// event streams (JSON.stringify(record.events) — version-free).
//
// Feature-018 default flip (feature 018 (internal spec)
// flip-cascade.md §3/§5): cluster-escalated BREAK shots legitimately
// diverge under the flipped compliant default — the committed break
// fixture (repinned: `pinned_kernel_version` + `pre_flip_events_sha256`
// on its entry) and the legacy sessions' break shots (their pins are
// version-pinned to their own kernels and DO NOT move). Post-flip the
// gate therefore proves, per entry:
// (a) the archived old wasm still reproduces its pin (archive integrity);
// (b) the new wasm's DEFAULT stream either matches the old stream
//     byte-identically (every non-break shot), or — the ONLY admissible
//     divergence — the EXPLICIT `SequentialImpulse` scenario on the new
//     wasm reproduces the old stream BYTE-IDENTICALLY, proving the
//     divergence is attributable EXACTLY to the flipped cluster default
//     and the legacy resolver is untouched (research R12; the
//     same-version guarantee for explicit-legacy records);
// (c) the repinned break-fixture entry additionally matches its NEW
//     version-pinned stream.
// When the kernel versions differ: with zero divergent pins the
// (old, new) pair must be listed in KERNEL_COMPAT_LINEAGE with
// kernelGate suppression (the original mechanically-enforced
// additive-only claim); with divergent pins the pair must NOT be listed
// (the lineage table is a byte-identity proof ledger —
// generalization-audit row 12) and kernelGate must REFUSE with the
// standard warning (the strict-gate refusal path, view-anyway UX).
// GH-1195: a registered change whose class the corpus cannot see
// (REGISTERED_FLIPS below) takes that same refusal branch over
// byte-identical streams.
// Node-only (no Chrome/server): wired as a blocking CI job.
/** Explicit-legacy scenario reconstruction (issue #87 registered-divergence
 * proof): pins EVERY retained legacy path a pinned pre-fix stream may
 * depend on — `cluster_model: SequentialImpulse` (018 flip),
 * `rail_seat: Planar` (021 flip), `ball_ball_slip_law:
 * PostImpactNormalDelta` (#77 Coulomb-cap fix), `strike_pinch_model:
 * LegacyFrontload` (#164 pinch-strike decomposition; engages only above
 * 60° cue elevation — every current corpus stream is bit-identical under
 * both values), and, for StrongeCompliant
 * cushions, `slip_select: LegacyBracket` (#83 first-crossing fix). Each pin
 * is a serde-skipped default on the new kernel, so setting all of them on a
 * pre-fix scenario is exactly the "replay my old bytes" contract. */
function explicitLegacyScenario(scenario) {
  const s = JSON.parse(scenario);
  s.options = {
    ...s.options,
    cluster_model: 'SequentialImpulse',
    rail_seat: 'Planar',
    ball_ball_slip_law: 'PostImpactNormalDelta',
    strike_pinch_model: 'LegacyFrontload',
  };
  const cm = s.options.cushion_model;
  if (cm && typeof cm === 'object' && cm.StrongeCompliant) {
    cm.StrongeCompliant = { ...cm.StrongeCompliant, slip_select: 'LegacyBracket' };
  }
  return JSON.stringify(s);
}

/** Own-kernel corpus pins (#789): a pin carrying `capture_kernel_version`
 * was captured on THAT kernel — its entry's share was written by a build
 * running it — so the corpus arm re-simulates the pin on the archived copy
 * of that kernel's canonical wasm (web/tools/fixtures/<dir>/), never on the
 * pre-012 archive. A pin without the field belongs to the top-level capture
 * kernel (`kernel_version`, the pre-012 archive). Distinct from
 * `pinned_kernel_version`, which names the COMMITTED dist a repinned stream
 * tracks and which scripts/repin-wasm-fixtures.mjs restamps at every
 * version-only repin; a capture kernel never moves. */
const CAPTURE_KERNEL_ARCHIVES = {
  // the build-18 canonical wasm (web/dist/pool-wasm of main 4a8b3c29)
  '0.1.0+b6b5dc3f': 'b6b5dc3f-wasm',
};

/** Registered physics changes the corpus cannot see (GH-1195;
 * flip-cascade.md §5, docs/RELEASING.md step 4). When a registered change's
 * diverging record class lies outside a capture kernel's pins, those streams
 * stay byte-identical across it, so their identity proves nothing about the
 * pair. A flip SEPARATES a capture kernel (or a pair run's old stamp) from
 * the dist when the dist is the flip's `first` stamp or lineage-reachable
 * from it (a later version-only repin) and the old stamp is neither. Across
 * a separation, `--corpus` requires the (old -> new) pair UNLISTED and
 * kernelGate to REFUSE (the standard warning + view-anyway). A
 * `--corpus-pair` run whose corpus compares fully identical ends "NOT
 * appendable" under the same two checks; a diverging pair run fails as
 * before. Every pin still proves its own stream as before: a flip never
 * excuses a diverging one. Every registered change that leaves any capture
 * kernel's pins identical appends one entry in its cascade, `first` being
 * its rebake's stamp. */
const REGISTERED_FLIPS = [
  // the Rest barrier zeroes a Stationary ball's residual vel/avel (kernel-api
  // Amendment 017 revision; the internal rest-projection compat note, §6)
  { issue: 'GH-1195', first: '0.1.0+15210514' },
];

/** The registered flip that separates `oldV` from `newV`, if any. */
function separatingFlip(shareMod, oldV, newV) {
  const atOrAfter = (first, v) => v === first
    || shareMod.lineageCompatible(first, v) === true;
  return REGISTERED_FLIPS.find(({ first }) =>
    atOrAfter(first, newV) && !atOrAfter(first, oldV));
}

/** In-app legacy arm (#789): the strict gate's view-anyway banner is
 * expected exactly when the app's own replay gate refuses
 * (web/app/share.js startReplay: kernelGate(shared, kernel_version())).
 * A lineage-proven entry replays with no banner; every other legacy wire
 * must show it. */
function expectsGateBanner(gateFn, decoded, distV) {
  return gateFn(decoded, distV).ok !== true;
}

if (process.argv.includes('--corpus')) {
  const { init } = await sdk('engine.js');
  const fixtures = path.join(webDir, 'tools', 'fixtures');
  const corpus = JSON.parse(readFileSync(
    path.join(fixtures, 'legacy-links.json'), 'utf8'));
  const pins = JSON.parse(readFileSync(
    path.join(fixtures, 'kernel-corpus.json'), 'utf8'));
  const oldEng = await init(path.join(fixtures, 'pre012-wasm', 'pool_wasm.js'));
  const newEng = await init(path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js'));
  const oldV = oldEng.version();
  const newV = newEng.version();
  console.log(`G-KERNEL corpus: old wasm ${oldV} vs committed dist ${newV}`);
  if (oldV !== pins.kernel_version) {
    fail(`archived pre-012 wasm ${oldV} != capture kernel ${pins.kernel_version}`);
  }
  const scenarios = [];
  for (const entry of corpus.entries) {
    entry.scenarios.forEach((scenario, i) =>
      scenarios.push({ name: `${entry.name}#${i}`, scenario,
        kv: entry.decoded.kernelVersion }));
  }
  scenarios.push({
    name: 'pool-wasm-break-fixture',
    scenario: readFileSync(path.join(webDir, '..', 'crates', 'pool-wasm',
      'tests', 'fixtures', 'break_scenario.json'), 'utf8').trim(),
    kv: null,
  });
  if (scenarios.length !== pins.scenarios.length) {
    fail(`corpus arm covers ${scenarios.length} scenarios, pins have `
      + `${pins.scenarios.length}`);
  }
  // capture kernel -> engine; each archive must carry the stamp it is
  // filed under (archive integrity, the pre-012 check above)
  const captureEngs = new Map([[pins.kernel_version, oldEng]]);
  const captureEng = async (capV) => {
    if (captureEngs.has(capV)) return captureEngs.get(capV);
    const dir = CAPTURE_KERNEL_ARCHIVES[capV];
    let eng = null;
    if (!dir) {
      fail(`capture kernel ${capV} has no archived wasm (CAPTURE_KERNEL_ARCHIVES)`);
    } else {
      eng = await init(path.join(fixtures, dir, 'pool_wasm.js'));
      if (eng.version() !== capV) {
        fail(`archived ${dir} wasm ${eng.version()} != capture kernel ${capV}`);
        eng = null;
      } else {
        console.log(`G-KERNEL corpus: own-kernel pins on archived ${capV} `
          + `(fixtures/${dir})`);
      }
    }
    captureEngs.set(capV, eng);
    return eng;
  };
  let identical = 0;
  let diverged = 0;
  // per capture kernel, for the lineage-ledger judgment below
  const perKernel = new Map();
  for (const [k, { name, scenario, kv }] of scenarios.entries()) {
    const pin = pins.scenarios[k];
    if (pin.name !== name || pin.scenario_sha256 !== sha256(scenario)) {
      fail(`${name}: scenario drifted from the T003 capture`);
      continue;
    }
    const capV = pin.capture_kernel_version ?? pins.kernel_version;
    if (pin.capture_kernel_version && pin.pinned_kernel_version) {
      fail(`${name}: a pin is either captured on its own kernel or repinned `
        + 'to the committed dist, never both');
      continue;
    }
    // own-kernel law: an entry's pins are captured on the kernel that
    // wrote its share (the break fixture carries no share)
    if (kv !== null && kv !== capV) {
      fail(`${name}: pin captured on ${capV} but the entry was recorded on `
        + `${kv} — pin it on its own kernel (capture_kernel_version)`);
      continue;
    }
    const capEng = await captureEng(capV);
    if (!capEng) continue;
    // route guard: for kernels in a proven lineage pair identical replay
    // bytes are the law (what the pair leg proves), so event bytes cannot
    // discriminate a misroute of such a pin; the archive engine's stamp
    // against the pin's capture_kernel_version is the discriminator.
    if (capEng.version() !== capV) {
      fail(`${name}: capture-kernel engine ${capEng.version()} != pin `
        + `captured on ${capV} (misrouted)`);
      continue;
    }
    if (!perKernel.has(capV)) perKernel.set(capV, { identical: 0, diverged: 0 });
    const tally = perKernel.get(capV);
    const oldEvents = JSON.stringify(JSON.parse(capEng.simulateJson(scenario)).events);
    const newEvents = JSON.stringify(JSON.parse(newEng.simulateJson(scenario)).events);
    const ownTag = pin.capture_kernel_version ? ` [own kernel ${capV}]` : '';
    if (pin.pinned_kernel_version) {
      // Version-pinned (repinned at a registered physics change): prove
      // the honest triple instead of old-vs-new identity.
      if (pin.pinned_kernel_version !== newV) {
        fail(`${name}: pin is for kernel ${pin.pinned_kernel_version}, `
          + `committed dist is ${newV} — repin per flip-cascade.md §3`);
        continue;
      }
      if (sha256(oldEvents) !== pin.pre_flip_events_sha256) {
        fail(`${name}: OLD-wasm event stream != pre-flip pin (archive corrupt?)`);
      }
      if (sha256(newEvents) !== pin.events_sha256) {
        fail(`${name}: NEW-wasm event stream != repinned capture`);
      }
      // Explicit-legacy reconstruction pins EVERY flipped/corrected
      // default: cluster_model (018 flip) + rail_seat (021 flip) +
      // ball_ball_slip_law (#77 Coulomb-cap fix) + StrongeCompliant
      // slip_select (#83 first-crossing fix) — the retained legacy paths
      // must reproduce the pre-flip stream byte-identically.
      const legacyEvents = JSON.stringify(JSON.parse(
        newEng.simulateJson(explicitLegacyScenario(scenario))).events);
      if (legacyEvents !== oldEvents) {
        fail(`${name}: EXPLICIT legacy options on the new wasm do `
          + 'not reproduce the pre-flip stream — a legacy path changed (R12)');
      } else {
        diverged += 1;
        tally.diverged += 1;
        console.log(`${name}: registered divergence OK `
          + `(${oldEvents.length} -> ${newEvents.length} bytes; explicit-legacy `
          + 'path byte-identical to the pre-flip stream)');
      }
      continue;
    }
    if (sha256(oldEvents) !== pin.events_sha256) {
      if (pin.capture_kernel_version) {
        fail(`${name}: capture-kernel stream (${capEng.version()}) != pin `
          + `captured on ${capV} (archive corrupt or misrouted?)`);
      } else {
        fail(`${name}: OLD-wasm event stream != T003 pin (archive corrupt?)`);
      }
    }
    if (oldEvents !== newEvents) {
      // Only admissible divergence (018 cluster flip / 021 rail-seat
      // flip / #77 slip-cap + #83 slip-select corrections, issue #87):
      // attributable EXACTLY to the flipped/corrected defaults — the
      // explicit-legacy scenario must reproduce the pinned stream
      // byte-identically.
      const legacyEvents = JSON.stringify(JSON.parse(
        newEng.simulateJson(explicitLegacyScenario(scenario))).events);
      if (legacyEvents !== oldEvents) {
        fail(`${name}: event streams DIVERGED old vs new wasm `
          + `(${oldEvents.length} vs ${newEvents.length} bytes) and the `
          + 'EXPLICIT legacy-options path does not reproduce the '
          + 'pin — the kernel change is not additive for this pinned scenario');
      } else {
        diverged += 1;
        tally.diverged += 1;
        console.log(`${name}: cluster-default divergence `
          + `(${oldEvents.length} -> ${newEvents.length} bytes; explicit-legacy `
          + `path byte-identical to the pin — break-class shot)${ownTag}`);
      }
    } else {
      identical += 1;
      tally.identical += 1;
      console.log(`${name}: event-byte identity OK (${oldEvents.length} bytes)${ownTag}`);
    }
  }
  console.log(`G-KERNEL: ${identical}/${scenarios.length} event streams `
    + `byte-identical, ${diverged} registered divergence(s)`);
  // each capture kernel answers to the lineage ledger for its own streams
  // (the pre-012 archive for the T003 pins; an own-kernel archive for its
  // entry's pins)
  const shareMod = await sdk('share.js');
  for (const [oldV, { identical: same, diverged }] of perKernel) {
    if (oldV === newV) continue;
    const lineage = shareMod.KERNEL_COMPAT_LINEAGE;
    const listed = Array.isArray(lineage)
      && lineage.some(([o, n]) => o === oldV && n === newV);
    const flip = diverged === 0 ? separatingFlip(shareMod, oldV, newV) : undefined;
    if (flip) {
      // A registered flip the corpus cannot see (REGISTERED_FLIPS): these
      // byte-identical streams do not prove the pair, so the refusal path
      // below holds for it too.
      if (listed) {
        fail(`(${oldV} -> ${newV}) is listed in KERNEL_COMPAT_LINEAGE across `
          + `registered flip ${flip.issue} — remove the unproven pair`);
      } else if (shareMod.kernelGate({ kernelVersion: oldV }, newV).ok === true) {
        fail(`kernelGate SUPPRESSED the warning across registered flip ${flip.issue} `
          + '— the strict-gate refusal path is broken');
      } else {
        console.log(`strict-gate refusal OK for (${oldV} -> ${newV}): registered `
          + `flip ${flip.issue} (first ${flip.first}), its ${same} pinned `
          + 'stream(s) byte-identical; cross-version opens warn + view-anyway');
      }
    } else if (diverged === 0) {
      if (!listed) {
        fail(`byte identity proven but (${oldV} -> ${newV}) is NOT in `
          + 'KERNEL_COMPAT_LINEAGE — add the proven pair (research R7 step 5)');
      } else {
        const gate = shareMod.kernelGate(
          { kernelVersion: oldV }, newV);
        if (gate.ok !== true) {
          fail('kernelGate does not suppress the warning for the proven lineage pair');
        } else {
          console.log(`lineage pair (${oldV} -> ${newV}) listed; kernelGate suppression OK`);
        }
      }
    } else {
      // Registered physics change: the lineage table is a byte-identity
      // proof ledger — an unproven pair is a contract violation
      // (flip-cascade.md §5). The strict gate must REFUSE.
      if (listed) {
        fail(`(${oldV} -> ${newV}) is listed in KERNEL_COMPAT_LINEAGE but `
          + `${diverged} pinned stream(s) diverged — remove the unproven pair`);
      } else {
        const gate = shareMod.kernelGate({ kernelVersion: oldV }, newV);
        if (gate.ok === true) {
          fail('kernelGate SUPPRESSED the warning for an unproven kernel pair '
            + '— the strict-gate refusal path is broken');
        } else {
          console.log(`strict-gate refusal OK for (${oldV} -> ${newV}): `
            + 'cross-version opens warn + view-anyway');
        }
      }
    }
  }
  if (!process.exitCode) console.log('G-KERNEL CORPUS PASS');
  process.exit(process.exitCode ?? 0);
}

// ---- Gate G-KERNEL lineage-pair arm (GH-318; contracts/
// equipment-additions.md §4 applied to a version-only repin pair):
// `--corpus-pair <oldWasmDir> [newWasmDir]` re-simulates the SAME pinned
// corpus (scenario_sha256-validated — a drifted corpus can never fake a
// proof) on BOTH artifacts and requires EVERY event stream byte-identical
// (version-free). A version-only repin admits ZERO divergences — there is
// deliberately no explicit-legacy escape hatch here: that path exists for
// registered physics changes, which by definition disqualify a pair from
// the lineage ledger. On a full-corpus proof the (old -> new) pair MUST be
// listed in KERNEL_COMPAT_LINEAGE with kernelGate suppression (the same
// mechanically-enforced additive claim as `--corpus`); a diverging pair
// MUST NOT be listed, and a pair that a registered flip separates
// (REGISTERED_FLIPS, GH-1195) is never appendable: when its corpus compares
// fully identical the run ends "NOT appendable" (the pair unlisted,
// kernelGate refusing). Ceremony use (docs/RELEASING.md): extract the
// pre-repin `web/dist/pool-wasm/` from git history (git show), run this
// arm against the committed dist, and only a green run may carry the
// appended pair. Node-only (no Chrome/server).
const pairIx = process.argv.indexOf('--corpus-pair');
if (pairIx !== -1) {
  const oldDir = process.argv[pairIx + 1];
  const newDir = process.argv[pairIx + 2]
    ?? path.join(webDir, 'dist', 'pool-wasm');
  if (!oldDir) {
    fail('--corpus-pair needs <oldWasmDir> [newWasmDir]');
    process.exit(1);
  }
  const { init } = await sdk('engine.js');
  const fixtures = path.join(webDir, 'tools', 'fixtures');
  const corpus = JSON.parse(readFileSync(
    path.join(fixtures, 'legacy-links.json'), 'utf8'));
  const pins = JSON.parse(readFileSync(
    path.join(fixtures, 'kernel-corpus.json'), 'utf8'));
  const oldEng = await init(path.resolve(oldDir, 'pool_wasm.js'));
  const newEng = await init(path.resolve(newDir, 'pool_wasm.js'));
  const oldV = oldEng.version();
  const newV = newEng.version();
  console.log(`G-KERNEL pair: old wasm ${oldV} vs new wasm ${newV}`);
  if (oldV === newV) {
    fail('both artifacts carry the same kernel stamp — nothing to prove');
  }
  const scenarios = [];
  for (const entry of corpus.entries) {
    entry.scenarios.forEach((scenario, i) =>
      scenarios.push({ name: `${entry.name}#${i}`, scenario }));
  }
  scenarios.push({
    name: 'pool-wasm-break-fixture',
    scenario: readFileSync(path.join(webDir, '..', 'crates', 'pool-wasm',
      'tests', 'fixtures', 'break_scenario.json'), 'utf8').trim(),
  });
  if (scenarios.length !== pins.scenarios.length) {
    fail(`corpus arm covers ${scenarios.length} scenarios, pins have `
      + `${pins.scenarios.length}`);
  }
  let identical = 0;
  for (const [k, { name, scenario }] of scenarios.entries()) {
    const pin = pins.scenarios[k];
    if (pin.name !== name || pin.scenario_sha256 !== sha256(scenario)) {
      fail(`${name}: scenario drifted from the T003 capture`);
      continue;
    }
    const oldEvents = JSON.stringify(JSON.parse(oldEng.simulateJson(scenario)).events);
    const newEvents = JSON.stringify(JSON.parse(newEng.simulateJson(scenario)).events);
    if (oldEvents !== newEvents) {
      fail(`${name}: event streams DIVERGED (${oldEvents.length} vs `
        + `${newEvents.length} bytes) — the pair is NOT version-only and `
        + 'must NOT enter KERNEL_COMPAT_LINEAGE');
    } else {
      identical += 1;
      console.log(`${name}: event-byte identity OK (${oldEvents.length} bytes)`);
    }
  }
  console.log(`G-KERNEL pair: ${identical}/${scenarios.length} event `
    + 'streams byte-identical');
  const shareMod = await sdk('share.js');
  const lineage = shareMod.KERNEL_COMPAT_LINEAGE;
  const listed = Array.isArray(lineage)
    && lineage.some(([o, n]) => o === oldV && n === newV);
  const flip = separatingFlip(shareMod, oldV, newV);
  if (identical === scenarios.length && flip) {
    // a registered flip the corpus cannot see (REGISTERED_FLIPS): full-corpus
    // identity does not prove this pair, so it may never be appended
    if (listed) {
      fail(`(${oldV} -> ${newV}) is listed in KERNEL_COMPAT_LINEAGE across `
        + `registered flip ${flip.issue} — remove the unproven pair`);
    } else if (shareMod.kernelGate({ kernelVersion: oldV }, newV).ok === true) {
      fail(`kernelGate SUPPRESSED the warning across registered flip ${flip.issue} `
        + '— the strict-gate refusal path is broken');
    } else {
      console.log(`registered flip ${flip.issue} (first ${flip.first}) separates `
        + `${oldV} from ${newV}: the pair is NOT appendable; strict-gate `
        + 'refusal OK (warn + view-anyway)');
    }
    if (!process.exitCode) console.log('G-KERNEL PAIR PASS (registered flip: NOT appendable)');
    process.exit(process.exitCode ?? 0);
  }
  if (identical === scenarios.length) {
    if (!listed) {
      fail(`byte identity proven but (${oldV} -> ${newV}) is NOT in `
        + 'KERNEL_COMPAT_LINEAGE — add the proven pair (research R7 step 5)');
    } else if (shareMod.kernelGate({ kernelVersion: oldV }, newV).ok !== true) {
      fail('kernelGate does not suppress the warning for the proven lineage pair');
    } else {
      console.log(`lineage pair (${oldV} -> ${newV}) listed; `
        + 'kernelGate suppression OK');
    }
  } else if (listed) {
    fail(`(${oldV} -> ${newV}) is listed in KERNEL_COMPAT_LINEAGE but the `
      + 'corpus diverged — remove the unproven pair');
  }
  if (!process.exitCode) console.log('G-KERNEL PAIR PASS');
  process.exit(process.exitCode ?? 0);
}

const server = spawnStaticServer(webDir, PORT);
await sleep(700);

const consoleErrors = [];
const chrome = await launchChrome(`http://127.0.0.1:${PORT}/app.html?seed=1`,
  { port: CDP_PORT });
chrome.onEvent((method, params) => {
  if (method === 'Runtime.consoleAPICalled' && params.type === 'error') {
    consoleErrors.push(params.args.map((a) => a.value ?? a.description).join(' '));
  } else if (method === 'Runtime.exceptionThrown') {
    consoleErrors.push(params.exceptionDetails.exception?.description
      ?? params.exceptionDetails.text);
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    consoleErrors.push(params.entry.text);
  }
});

async function waitReady() {
  for (let i = 0; i < 200; i++) {
    if (await chrome.eval('window.__test?.ready === true')) return;
    await sleep(200);
  }
  throw new Error('app never became ready');
}

async function waitSettled(maxTicks = 240) {
  let s = 'PLAYBACK';
  for (let i = 0; i < maxTicks && (s === 'PLAYBACK' || s === 'SIMULATING'); i++) {
    await sleep(400);
    s = await chrome.eval('__test.state()');
  }
  if (s === 'PLAYBACK') throw new Error('shot never settled');
  return s;
}

/** Build a legacy (v1/v2) share string from a raw wire tuple, the
 * encoder's way (deflate-raw + base64url). */
async function encodeWire(wire) {
  const cs = new CompressionStream('deflate-raw');
  const deflated = new Uint8Array(await new Response(
    new Blob([new TextEncoder().encode(JSON.stringify(wire))]).stream()
      .pipeThrough(cs)).arrayBuffer());
  return Buffer.from(deflated).toString('base64url');
}

try {
  await waitReady();
  await sleep(800);

  // ---- GH-326: audio is latched to REAL user activation (sound.js), so
  // the live-play leg earns its gesture the way a user would — one trusted
  // CDP click on open felt (the e2e-record ensureAudioTap precedent;
  // scripted Runtime.evaluate grants nothing). Without this the scheduled1
  // assertion below would read the new silent-by-design zero.
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: 20, y: 700, button: 'left', clickCount: 1 });
  }
  await sleep(300);

  // ---- settings: capture the ob:settings hook, mute sound for headless
  await chrome.eval(`(() => {
    window.__settingsEvents = [];
    window.addEventListener('ob:settings',
      (e) => window.__settingsEvents.push(e.detail));
    return true; })()`);
  await chrome.eval(`__settings.set('soundOn', false)`);
  if (await chrome.eval('window.__sound.muted') !== true) fail('sound not muted');

  // ---- record on NON-DEFAULT equipment: share v3 must reconstruct the
  // sender's full composition (squirt-relevant low-deflection cue)
  if (await chrome.eval(
    `__settings.changeEquipment('cue_id', 'low_deflection', { skipConfirm: true })`) !== true) {
    fail('could not switch to the low-deflection cue');
  }
  await sleep(600);

  // ---- play 2 scripted shots, collect the original records
  const e1 = await chrome.eval('__test.shoot({ v0: 2.2, phi: 1.35, theta: 0, a: 0, b: 0 })');
  if (e1) fail('shot 1 rejected: ' + e1);
  await waitSettled();
  const e2 = await chrome.eval('__test.shoot({ v0: 1.2, phi: -1.2, theta: 0, a: 0.05, b: -0.1 })');
  if (e2) fail('shot 2 rejected: ' + e2);
  await waitSettled();

  const originals = await chrome.eval('__share.records()');
  if (originals.length !== 2) fail(`expected 2 recorded shots, got ${originals.length}`);

  // ---- sound: nodes scheduled from the event list despite muted output
  const scheduled1 = await chrome.eval('window.__sound.scheduled');
  console.log('sound nodes scheduled during live play:', scheduled1);
  if (!(scheduled1 > 0)) fail('no audio nodes were scheduled during playback');

  // ---- settings hook + persistence
  await chrome.eval(`__settings.set('assist', 'off')`);
  const evs = await chrome.eval('window.__settingsEvents');
  const assistEv = evs.filter((e) => e.key === 'assist').pop();
  if (!assistEv || assistEv.value !== 'off') fail('ob:settings assist hook did not fire');
  if (assistEv?.assist !== 'off') fail('ob:settings detail.assist missing (preview contract)');
  // cross-feature wiring: STREAM-A's preview must FOLLOW the setting
  if (await chrome.eval('window.__aim.getAssist()') !== 'off') {
    fail('preview did not follow settings assist=off');
  }
  const persisted = await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1'))`);
  if (persisted?.assist !== 'off') fail('assist level not persisted to localStorage');
  if (persisted?.soundOn !== false) fail('soundOn not persisted to localStorage');
  await chrome.eval(`__settings.set('assist', 'standard')`); // restore default
  if (await chrome.eval('window.__aim.getAssist()') !== 'standard') {
    fail('preview did not follow settings assist=standard');
  }

  // ---- encode → URL size
  const url = await chrome.eval('__share.encode()');
  console.log(`share URL for the 2-shot game: ${url.length} chars`);
  if (!/#r=[A-Za-z0-9_-]+$/.test(url)) fail('share URL is not base64url-hash shaped');
  const hash = url.slice(url.indexOf('#'));

  // ---- codec v4 game axis (feature 011) + v5 variant slot (feature 022)
  // + v6 playground axes (issue #68 follow-up) + v7 breaker seat
  // (GH-448): the adapter encodes the ACTIVE game — a default 9-ball
  // session writes formatV 7, game nine_ball, EMPTY calls (nine_ball
  // carries none by contract), the EXPLICIT family-default variant id
  // (022 contracts/share-codec.md §1: provenance is self-describing), an
  // EMPTY moves axis, mode 'play', and the fresh-boot breaker seat 1
  const decodedV4 = await decodeShare(hash.slice(3));
  if (decodedV4.formatV !== 7) fail(`encoded formatV ${decodedV4.formatV}, want 7`);
  if (decodedV4.breaker !== 1) {
    fail(`encoded breaker seat ${decodedV4.breaker}, want 1 (fresh boot)`);
  }
  if (decodedV4.game !== 'nine_ball') {
    fail(`encoded game '${decodedV4.game}', want nine_ball`);
  }
  if (decodedV4.rackKind !== 'nine') {
    fail(`encoded rackKind '${decodedV4.rackKind}', want nine`);
  }
  if (decodedV4.calls.length !== 0) {
    fail(`nine_ball share carries ${decodedV4.calls.length} calls, want 0`);
  }
  if (decodedV4.variant !== 'wpa-9ball') {
    fail(`encoded variant '${decodedV4.variant}', want wpa-9ball`);
  }
  if (decodedV4.moves.length !== 0 || decodedV4.mode !== 'play') {
    fail(`judged session playground axes wrong: ${decodedV4.moves.length} `
      + `moves / mode '${decodedV4.mode}' (want 0 / play)`);
  }
  if ((await chrome.eval(`__settings.get().game`)) !== 'nine_ball') {
    fail('settings game key did not default to nine_ball');
  }

  // ---- cross-equipment gate setup: the shots above were recorded on the
  // low-deflection cue + default cloth; make the viewer profile persist a
  // DIFFERENT composition so the replay page boots on it. The transient
  // equipment override (share.js gotoShot → settings.setTransientEquipment)
  // must still re-simulate the shared game on the sender's equipment or the
  // byte-match below fails.
  await chrome.eval(`__settings.changeEquipment('cloth_id', 'worn_slow', { skipConfirm: true })`);
  await chrome.eval(`__settings.changeEquipment('cue_id', 'standard', { skipConfirm: true })`);
  const persistedEq = await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1')).equipment`);
  if (persistedEq?.cloth_id !== 'worn_slow' || persistedEq?.cue_id !== 'standard') {
    fail('viewer equipment not persisted before replay reload');
  }

  // ---- reload the page WITH the hash (different query → full navigation)
  // GH-326 autoplay leg: the share-replay page boots and autoplays with NO
  // user gesture (navigation resets sticky activation), so it must neither
  // construct an AudioContext (Chrome's 'not allowed to start' warning —
  // the QA wave 1 'share-link autoplay warning flood') nor schedule cue
  // nodes: silent-by-design until the first gesture. Full-spectrum watch,
  // scoped to the replay page (registered here, asserted after `done`).
  const audioWarns = [];
  let watchAudio = true;
  chrome.onEvent((method, params) => {
    if (!watchAudio) return;
    const line = method === 'Runtime.consoleAPICalled'
      ? params.args.map((a) => a.value ?? a.description).join(' ')
      : method === 'Log.entryAdded' ? params.entry.text : null;
    if (line && /AudioContext/i.test(line)) audioWarns.push(line);
  });
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html${hash}` });
  await sleep(500);
  await waitReady();

  // replay auto-starts after boot; both shots re-simulate in real time
  let rep = { active: false, done: false };
  for (let i = 0; i < 200; i++) {
    await sleep(400);
    rep = await chrome.eval('__share.replay()');
    if (rep.done) break;
  }
  if (!rep.done) fail('replay never finished: ' + JSON.stringify(rep));
  if (rep.n !== 2) fail(`replay advertises ${rep.n} shots, want 2`);

  // ---- THE determinism gate: replayed records byte-match the originals
  const replays = await chrome.eval('__share.records()');
  if (replays.length !== 2) fail(`replay produced ${replays.length} records, want 2`);
  replays.forEach((r, i) => {
    if (r === originals[i]) {
      console.log(`record ${i}: byte-match OK (${r.length} bytes)`);
    } else {
      fail(`record ${i} does NOT byte-match the original `
        + `(${r.length} vs ${originals[i].length} bytes)`);
    }
  });

  // during the replay the SENDER's equipment is transiently active, not
  // the viewer's persisted set (and it must NOT clobber the persisted one)
  const replayEq = await chrome.eval(`__settings.get().equipment`);
  if (replayEq.cue_id !== 'low_deflection'
      || replayEq.cloth_id !== 'pool_worsted_new') {
    fail('replay did not apply the shared (sender) equipment transiently: '
      + JSON.stringify(replayEq));
  }
  const storedEq = await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1')).equipment`);
  if (storedEq.cloth_id !== 'worn_slow' || storedEq.cue_id !== 'standard') {
    fail('transient replay equipment leaked into localStorage');
  }

  // ---- equipment changes are LOCKED during the replay: values.equipment
  // holds the SENDER's transient spec, so a picker change would merge into
  // it and persist the mixture, clobbering the viewer's saved equipment
  const lockRet = await chrome.eval(
    `__settings.changeEquipment('cloth_id', 'snooker_napped', { skipConfirm: true })`);
  if (lockRet !== false) fail('changeEquipment must refuse during a replay');
  const eqAfterLock = await chrome.eval('__settings.get().equipment');
  if (eqAfterLock.cloth_id !== 'pool_worsted_new') {
    fail('locked change still mutated the transient equipment: '
      + JSON.stringify(eqAfterLock));
  }
  const storedAfterLock = await chrome.eval(
    `JSON.parse(localStorage.getItem('ob-settings-v1')).equipment`);
  if (storedAfterLock.cloth_id !== 'worn_slow'
      || storedAfterLock.cue_id !== 'standard') {
    fail('locked equipment change leaked into localStorage: '
      + JSON.stringify(storedAfterLock));
  }
  // scoped to the AXIS pickers (settings.js `pickers` — the replay-lock
  // law's set): the #118 settings-IA wave moved the deliberately-LIVE #89
  // lighting fixture select (viewer-local look, never an equipment-spec
  // axis) inside #ob-eq, so the old '#ob-eq select' sweep matched a select
  // the lock intentionally leaves enabled — and only ever passed vacuously
  // when the panel had not been built yet at check time. Presence is now
  // required so the check can never vacuous-pass again.
  const lockedSel = await chrome.eval(
    `[...document.querySelectorAll('#ob-eq select[data-axis]')]
      .map((s) => s.dataset.axis + ':' + s.disabled)`);
  if (!(lockedSel.length >= 5 && lockedSel.every((s) => s.endsWith('true')))) {
    fail('equipment pickers not disabled during replay: '
      + JSON.stringify(lockedSel));
  }

  // replay banner is visible and labels shot n/N
  const label = await chrome.eval(
    `document.getElementById('ob-replay-label')?.textContent ?? ''`);
  if (!/REPLAY/.test(label)) fail('replay banner missing, label: ' + label);

  // GH-326: the gestureless autoplay stayed silent-by-design — zero
  // AudioContext console traffic (red pre-fix: one 'not allowed to start'
  // warning per page) and zero scheduled nodes (red pre-fix: cues were
  // scheduled against a pre-gesture suspended context).
  watchAudio = false;
  if (audioWarns.length) {
    fail('AudioContext console traffic during gestureless share autoplay '
      + '(GH-326): ' + audioWarns.slice(0, 2).join(' | '));
  }
  const scheduled2 = await chrome.eval('window.__sound.scheduled');
  console.log('sound nodes scheduled during gestureless replay:', scheduled2);
  if (scheduled2 !== 0) {
    fail(`gestureless share autoplay scheduled ${scheduled2} audio nodes `
      + '(GH-326: silent-by-design until the first gesture)');
  }
  if (await chrome.eval('window.__sound.muted') !== true) {
    fail('persisted mute not applied on the replay page');
  }

  // ---- exit replay → fresh game, hash cleared
  await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
  await sleep(400);
  if (await chrome.eval('__share.replay().active')) fail('exit did not leave replay mode');
  { // GH-370: the fresh exit rack grants the opening BALL_IN_HAND
    let sx = null;
    for (let i = 0; i < 25 && sx !== 'BALL_IN_HAND'; i++) {
      sx = await chrome.eval('__test.state()');
      if (sx !== 'BALL_IN_HAND') await sleep(200);
    }
    if (sx !== 'BALL_IN_HAND') fail('exit did not return to the opening BALL_IN_HAND: ' + sx);
  }
  if (await chrome.eval('location.hash') !== '') fail('exit did not clear the #r= hash');
  if ((await chrome.eval('__test.balls()')).length !== 10) fail('exit rack is not fresh');
  // exit restores the viewer's persisted equipment for fresh play
  const exitEq = await chrome.eval(`__settings.get().equipment`);
  if (exitEq.cloth_id !== 'worn_slow' || exitEq.cue_id !== 'standard') {
    fail('exit did not restore the persisted equipment: ' + JSON.stringify(exitEq));
  }
  // ... and unlocks the pickers again (same axis-picker scope + presence
  // floor as the lock check above)
  const unlockedSel = await chrome.eval(
    `[...document.querySelectorAll('#ob-eq select[data-axis]')]
      .map((s) => s.dataset.axis + ':' + s.disabled)`);
  if (!(unlockedSel.length >= 5 && unlockedSel.every((s) => s.endsWith('false')))) {
    fail('equipment pickers still disabled after replay exit: '
      + JSON.stringify(unlockedSel));
  }

  // ---- GH-326 counterpart: after a REAL gesture on this same page the
  // latch opens and the next playback schedules normally — the fix must
  // gate, not kill, WebAudio (the first tap anywhere brings sound in).
  for (const type of ['mousePressed', 'mouseReleased']) {
    await chrome.send('Input.dispatchMouseEvent',
      { type, x: 20, y: 700, button: 'left', clickCount: 1 });
  }
  await sleep(300);
  const eG = await chrome.eval('__test.shoot({ v0: 1.2, phi: -1.2, theta: 0, a: 0, b: 0 })');
  if (eG) fail('post-gesture shot rejected: ' + eG);
  await waitSettled();
  const scheduledG = await chrome.eval('window.__sound.scheduled');
  console.log('sound nodes scheduled after the first gesture:', scheduledG);
  if (!(scheduledG > 0)) {
    fail('no audio nodes scheduled after a real gesture (GH-326 latch '
      + 'must open on the first trusted input)');
  }

  // ---- legacy share links (v1: preset only; v2: preset + cloth) still
  // open: their wires decode into the equipment spec and replay end-to-end
  const kernelV = JSON.parse(originals[0]).kernel_version;
  for (const [label, wire, wantEq] of [
    ['v1', [1, kernelV, 'nine', 3, 'realistic', [[2.0, 1.35, 0, 0, 0]], []],
      { cloth_id: 'simonis_860_tournament', cushion_model_id: 'stronge_realistic' }],
    ['v2', [2, kernelV, 'nine', 3, 'grip-fitted', 'worn_slow',
      [[2.0, 1.35, 0, 0, 0]], []],
      { cloth_id: 'worn_slow', cushion_model_id: 'grip_fitted' }],
  ]) {
    const legacyHash = '#r=' + await encodeWire(wire);
    // unique query per hop: a hash-only change would NOT reload the app
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?legacy=${label}${legacyHash}` });
    await sleep(500);
    await waitReady();
    let lrep = { done: false };
    for (let i = 0; i < 120 && !lrep.done; i++) {
      await sleep(400);
      lrep = await chrome.eval('__share.replay()');
    }
    if (!lrep.done || lrep.n !== 1) {
      fail(`${label} legacy link did not replay: ${JSON.stringify(lrep)}`);
      continue;
    }
    const eq = await chrome.eval('__settings.get().equipment');
    for (const [k, v] of Object.entries(wantEq)) {
      if (eq[k] !== v) fail(`${label} legacy link equipment ${k}=${eq[k]}, want ${v}`);
    }
    if ((await chrome.eval('__share.records()')).length !== 1) {
      fail(`${label} legacy link produced no record`);
    }
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
  }

  // ---- GH-448 (codec v7): a transport scrub must NOT flip seat identity.
  // Two hand-built wires probe both decode arms: (a) a LEGACY v6 wire (no
  // breaker slot → the decode fill pins seat 1 — historic links) and (b) a
  // v7 wire pinning breaker seat 2 (a sender whose session started on the
  // P2 seat). Each recording is one no-contact foul, so the pass ENDS with
  // the hotseat flipped off the breaker — exactly the live seat a ⏮ scrub
  // used to inherit into resetMatch's initialState(player) fold (RED
  // pre-fix: pass 1 of the v7 wire folded the VIEWER's seat and pass 2 of
  // both wires re-folded the frame seat-swapped; the 10-ball pushout
  // chooser derivation rides the same fold).
  const IDS448 = ['wpa_generic_9ft', 'simonis_860_tournament', 'aramith_pool',
    'standard', 'han2005_default'];
  for (const [label448, wire448, breaker448] of [
    ['v6-legacy', [6, kernelV, 'nine', 5, IDS448,
      [[0.8, 0.7, 0, 0, 0]], [], 'nine_ball', [], 'wpa-9ball', [], 0], 1],
    ['v7-breaker2', [7, kernelV, 'nine', 5, IDS448,
      [[0.8, 0.7, 0, 0, 0]], [], 'nine_ball', [], 'wpa-9ball', [], 0, 2], 2],
  ]) {
    const hash448 = '#r=' + await encodeWire(wire448);
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?scrub448=${label448}${hash448}` });
    await sleep(500);
    await waitReady();
    const waitPass = async () => {
      let r = { done: false };
      for (let i = 0; i < 120 && !r.done; i++) {
        await sleep(400);
        r = await chrome.eval('__share.replay()');
      }
      return r;
    };
    const rep1 = await waitPass();
    if (!rep1.done || rep1.n !== 1) {
      fail(`448 ${label448}: replay pass 1 never finished: `
        + JSON.stringify(rep1));
      continue;
    }
    if ((rep1.breaker ?? null) !== breaker448) {
      fail(`448 ${label448}: decoded breaker ${rep1.breaker}, `
        + `want ${breaker448}`);
    }
    // the no-contact foul hands the turn over: the pass must END on the
    // opponent of the WIRE's breaker (pass 1 already red pre-fix for the
    // v7 wire — the fold took the viewer's live seat, not the wire's)
    const end1 = await chrome.eval('__rules.player()');
    if (end1 !== 3 - breaker448) {
      fail(`448 ${label448}: pass 1 ended on seat ${end1}, `
        + `want ${3 - breaker448} (breaker ${breaker448} fouled)`);
    }
    const recs448 = await chrome.eval('__share.records()');
    await chrome.eval(`document.getElementById('ob-rp-prev').click()`);
    const rep2 = await waitPass();
    if (!rep2.done) {
      fail(`448 ${label448}: replay pass 2 (after ⏮) never finished`);
      continue;
    }
    const end2 = await chrome.eval('__rules.player()');
    if (end2 !== end1) {
      fail(`448 ${label448}: ⏮ flipped seat identity — pass 1 ended on `
        + `seat ${end1}, pass 2 on seat ${end2}`);
    }
    const recs448b = await chrome.eval('__share.records()');
    if (JSON.stringify(recs448b) !== JSON.stringify(recs448)) {
      fail(`448 ${label448}: scrubbed pass records do not byte-match pass 1`);
    }
    console.log(`448 ${label448}: scrub seat parity OK `
      + `(breaker ${breaker448}, both passes ended on seat ${end1})`);
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
  }

  // ---- GH-450: rapid double-⏮ must never wedge the transport ------------
  // gotoShot was non-reentrant: (shape 1, same-tick delivery) the second
  // pass's rerack found replay.expectRerack already consumed by the
  // first → onRerack → exitReplay(false) — the replay silently died over
  // a VIRGIN rack with the recorder log wiped (a Continue/re-share from
  // there forks empty); (shape 2, 10-30 ms gap) the first pass's
  // UNTRACKED setTimeout(fireShot(0), 30) ghost-fired into the second
  // pass's stage, whose own fire then hit PLAYBACK → 'not in an aiming
  // state' → the error path claimed done: a false 'REPLAY finished' over
  // a barely-moving rack. The fix serializes scrubs on a generation
  // token (a newer press SUPERSEDES the stale pass) and fireShot waits
  // out transport races instead of declaring the replay finished. This
  // arm drives both gestures on a 2-shot 9-ball link and asserts the
  // replay STAYS ALIVE, re-finishes, and byte-matches pass 1.
  {
    const wire450 = [7, kernelV, 'nine', 5, IDS448,
      [[0.8, 0.7, 0, 0, 0], [0.8, -1.0, 0, 0, 0]], [[1, -0.2, -0.6]],
      'nine_ball', [], 'wpa-9ball', [], 0, 1];
    const hash450 = '#r=' + await encodeWire(wire450);
    for (const [label450, gapMs] of [['same-tick', 0], ['15ms-gap', 15]]) {
      await chrome.send('Page.navigate', {
        url: `http://127.0.0.1:${PORT}/app.html?scrub450=${label450}${hash450}` });
      await sleep(500);
      await waitReady();
      let r450 = { done: false };
      for (let i = 0; i < 150 && !r450.done; i++) {
        await sleep(400);
        r450 = await chrome.eval('__share.replay()');
      }
      if (!r450.done || r450.n !== 2) {
        fail(`450 ${label450}: replay pass 1 never finished: `
          + JSON.stringify(r450));
        continue;
      }
      const recs450 = await chrome.eval('__share.records()');
      await chrome.eval(gapMs === 0
        ? `(() => { const b = document.querySelector('#ob-rp-prev');
             b.click(); b.click(); })()`
        : `(() => { const b = document.querySelector('#ob-rp-prev');
             b.click(); setTimeout(() => b.click(), ${gapMs}); })()`);
      // the wedge shapes surface fast: shape 1 kills the replay within
      // one staging turn; shape 2's false-finish paints within ~2 s
      for (let i = 0; i < 10; i++) {
        await sleep(300);
        const mid = await chrome.eval(`({
          rep: __share.replay(),
          toast: document.getElementById('ob-share-toast')?.textContent ?? '',
        })`);
        if (mid.rep.active === false) {
          fail(`450 ${label450}: replay silently died after double-⏮ `
            + '(shape 1 — virgin rack, recorder wiped)');
          break;
        }
        if (mid.rep.done === true && /rejected/.test(mid.toast)) {
          fail(`450 ${label450}: false 'REPLAY finished' after double-⏮ `
            + `(shape 2 — toast: ${mid.toast})`);
          break;
        }
      }
      let r450b = await chrome.eval('__share.replay()');
      if (r450b.active !== false) {
        for (let i = 0; i < 150 && !(r450b.done && r450b.i === 1); i++) {
          await sleep(400);
          r450b = await chrome.eval('__share.replay()');
        }
        const recs450b = await chrome.eval('__share.records()');
        if (!(r450b.done && r450b.i === 1)) {
          fail(`450 ${label450}: rescrubbed pass never re-finished: `
            + JSON.stringify(r450b));
        } else if (JSON.stringify(recs450b) !== JSON.stringify(recs450)) {
          fail(`450 ${label450}: rescrubbed records do not byte-match pass 1`);
        } else {
          console.log(`450 ${label450}: double-⏮ survived — replay `
            + 're-finished with byte-matching records');
        }
        await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
        await sleep(400);
      }
    }
  }

  // ---- PINNED legacy corpus (feature 011 T026, SC-003; feature-018 flip
  // re-plan, flip-cascade.md §4/§5): every pre-feature share string must
  // (G1) decode field-identically to the pinned pre-feature output + the
  // game-axis normalization (game nine_ball, calls []), and (G2) replay
  // from byte-identical submitted scenarios. The corpus wires carry
  // PRE-FLIP kernel versions and the flip pair is deliberately NOT in
  // KERNEL_COMPAT_LINEAGE (a real physics change for cluster-escalated
  // breaks — the internal break-compliance compat note), so every
  // legacy link now hits the STRICT kernel gate: the arm asserts the
  // refusal UX (warning banner + view-anyway), drives view-anyway, and
  // asserts the replay completes with no further prompts. Record pins
  // move to the EVENT-STREAM level against the T003/T023 kernel-corpus
  // capture: non-break shots must reproduce their pinned streams
  // byte-identically on the flipped kernel; the sessions' BREAK shots are
  // the REGISTERED divergence class — for those the arm asserts the
  // app-replayed stream is byte-identical to a node-side re-simulation on
  // the same committed dist (P-III: same binary, same bytes) and logs the
  // honest diff (attribution to the flipped cluster default is proven by
  // the --corpus arm's explicit-SequentialImpulse re-simulation).
  // Adjudication parity holds for every stream-identical record; the
  // divergent breaks' re-judgments are logged. legacy-links.json is the
  // oracle (captured pre-codec-edit on caad8ca; never regenerated).
  const corpus = JSON.parse(readFileSync(
    path.join(webDir, 'tools', 'fixtures', 'legacy-links.json'), 'utf8'));
  const kernelPins = JSON.parse(readFileSync(
    path.join(webDir, 'tools', 'fixtures', 'kernel-corpus.json'), 'utf8'));
  const pinByName = (name) => kernelPins.scenarios.find((p) => p.name === name);
  const { init: initEngine } = await sdk('engine.js');
  const distEng = await initEngine(
    path.join(webDir, 'dist', 'pool-wasm', 'pool_wasm.js'));
  const distV = distEng.version();
  console.log(`legacy corpus: ${corpus.entries.length} pinned links `
    + `(captured ${corpus.captured_commit.slice(0, 7)})`);
  let corpusHop = 0;
  for (const entry of corpus.entries) {
    // G1 — decode identity (node-side, the committed dist codec)
    let decoded;
    try {
      decoded = await decodeShare(entry.share);
    } catch (e) {
      fail(`corpus ${entry.name}: decode threw: ${e.message ?? e}`);
      continue;
    }
    // v4 normalize fields (feature 011) + the 022 decode-rule-1 variant
    // fill + the v6 playground-axes fill + the v7 breaker fill: pre-022
    // links resolve to the decoded game's default preset; pre-v6 links
    // decode moves:[], mode:play; pre-v7 links decode breaker:1 (GH-448).
    // The fills precede the spread: they stand in only for axes the
    // pinned decode lacks, so a formatV-7 entry (#789) is judged on the
    // axes its own wire carries (e.g. breaker 2), never overwritten
    const want = {
      game: 'nine_ball', calls: [], variant: 'wpa-9ball', moves: [],
      mode: 'play', breaker: 1, ...entry.decoded,
    };
    if (canon(decoded) !== canon(want)) {
      fail(`corpus ${entry.name}: decoded SharedGame differs from the pinned `
        + 'pre-feature decode (G1)');
    }
    // replay in the app (unique query per hop: hash-only changes don't
    // reload) and pin the re-simulation
    // obtool stamp mirrors the corpus capture conditions (gen-legacy-corpus
    // captured scenarios under a scripted ?obtool boot; physics/equipment
    // ride the share transiently either way)
    await chrome.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&corpus=${corpusHop++}#r=${entry.share}` });
    await sleep(500);
    await waitReady();
    // feature-018 flip (T024 re-plan): the pre-flip corpus wires carry
    // kernel versions whose pair with the dist is NOT in
    // KERNEL_COMPAT_LINEAGE, so the STRICT gate must refuse silent replay —
    // assert the warning banner with the view-anyway affordance, then drive
    // it (the explicit, user-acknowledged path; never a silent divergence).
    // #789: an entry whose kernel IS lineage-proven against the dist must
    // replay with NO banner (the app's startReplay runs the same gate).
    const expectGate = expectsGateBanner(kernelGate, decoded, distV);
    let gated = false;
    let crep = { done: false };
    if (expectGate) {
      for (let i = 0; i < 20 && !gated; i++) {
        await sleep(200);
        gated = await chrome.eval(`!!document.getElementById('ob-rp-view-anyway')`);
      }
      if (!gated) {
        fail(`corpus ${entry.name}: strict kernel gate did NOT show the `
          + 'view-anyway banner for a pre-flip link (flip-cascade.md §5)');
        continue;
      }
      await chrome.eval(`document.getElementById('ob-rp-view-anyway').click()`);
      for (let i = 0; i < 200 && !crep.done; i++) {
        await sleep(400);
        crep = await chrome.eval('__share.replay()');
      }
    } else {
      for (let i = 0; i < 200 && !crep.done && !gated; i++) {
        await sleep(400);
        gated = await chrome.eval(`!!document.getElementById('ob-rp-view-anyway')`);
        if (!gated) crep = await chrome.eval('__share.replay()');
      }
      if (gated) {
        fail(`corpus ${entry.name}: strict kernel gate showed the view-anyway `
          + `banner for a lineage-compatible link (${decoded.kernelVersion} -> `
          + `${distV})`);
        continue;
      }
    }
    if (!crep.done || crep.n !== entry.decoded.shots.length) {
      fail(`corpus ${entry.name}: replay did not finish `
        + `${expectGate ? 'after view-anyway' : 'without the gate'}: `
        + JSON.stringify(crep));
      continue;
    }
    if (await chrome.eval(`!!document.getElementById('ob-rp-view-anyway')`)) {
      fail(`corpus ${entry.name}: kernelGate banner re-appeared mid-replay`);
    }
    // zero prompts + nine_ball routing (legacy links NEVER prompt)
    if (crep.game !== 'nine_ball' || crep.calls !== 0) {
      fail(`corpus ${entry.name}: routed as ${crep.game} with ${crep.calls} calls`);
    }
    if ((await chrome.eval(`__settings.get().game`)) !== 'nine_ball') {
      fail(`corpus ${entry.name}: transient game is not nine_ball`);
    }
    // G2 — scenario byte pins are asserted in session order below
    // (post-flip: a registered break divergence cascades into every
    // downstream scenario of the same session).
    const scen = await chrome.eval('__test.scenarios()');
    const recs = await chrome.eval('__share.records()');
    if (recs.length !== entry.record_sha256.length) {
      fail(`corpus ${entry.name}: ${recs.length} records, want ${entry.record_sha256.length}`);
      continue;
    }
    // G2 post-flip: event-stream pins in SESSION ORDER (the record JSON
    // as a whole now carries the flipped kernel_version stamp, so the
    // pre-flip whole-record sha256 pins can no longer match; the
    // version-free event stream is the physics observable —
    // kernel-corpus.json convention). A session is a STATE CHAIN: every
    // shot after the break is built from the break's outcome, so a
    // registered break divergence legitimately cascades downstream. Pins
    // therefore hold UP TO the first divergent shot — which must be the
    // registered break class (its pinned-scenario attribution to the
    // flipped cluster default is proven byte-exactly by the --corpus
    // arm) — and from that shot on the arm asserts CONSISTENCY: every
    // app-submitted scenario re-simulates on the committed dist to the
    // app's own record bytes (P-III: same binary, same bytes), with the
    // honest diff logged.
    let sessionDiverged = false;
    let pinnedCount = 0;
    for (let i = 0; i < recs.length; i++) {
      const events = JSON.stringify(JSON.parse(recs[i]).events);
      const pin = pinByName(`${entry.name}#${i}`);
      if (!sessionDiverged) {
        if (scen[i] !== entry.scenarios[i]) {
          fail(`corpus ${entry.name}: scenario ${i} diverged from the pin `
            + 'BEFORE any registered divergence (G2)');
          break;
        }
        if (pin && sha256(events) === pin.events_sha256) {
          // stream-identical: full adjudication parity with the pin
          const record = JSON.parse(recs[i]);
          const adj = judgeShot({ onTable: deriveOnTable(record) }, record);
          if (canon(adj) !== canon(entry.adjudications[i])) {
            fail(`corpus ${entry.name}: adjudication ${i} diverged from `
              + `the pin: ${canon(adj)} vs ${canon(entry.adjudications[i])}`);
          }
          pinnedCount += 1;
          continue;
        }
        sessionDiverged = true;
        console.log(`corpus ${entry.name}: shot ${i} is the registered `
          + 'break-class divergence (explicit-legacy attribution proven '
          + 'by --corpus); downstream shots follow the diverged state');
      }
      // divergent or downstream: consistency with the canonical binary
      const nodeEvents = JSON.stringify(JSON.parse(
        distEng.simulateJson(scen[i])).events);
      if (events !== nodeEvents) {
        fail(`corpus ${entry.name}: record ${i} differs from the committed `
          + 'dist replay of its own submitted scenario (G2 consistency)');
        continue;
      }
      const record = JSON.parse(recs[i]);
      const adj = judgeShot({ onTable: deriveOnTable(record) }, record);
      console.log(`corpus ${entry.name}: shot ${i} re-judged on the `
        + `flipped kernel: ${canon(adj)}`);
    }
    console.log(`corpus ${entry.name}: G1 decode + G2 scenarios/streams `
      + `(${pinnedCount} pinned, ${recs.length - pinnedCount} `
      + `registered-divergent/downstream) + adjudications OK`);
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
  }

  // ---- 8-ball v4 round-trip (feature 011 T026) — INTEGRATION-DEPENDENT:
  // needs the game/flow lane's per-game rack dispatch (game.setGame seam)
  // and the eightball-v1 ruleset at runtime. settings.changeGame refuses
  // non-default games until that dispatch exists, so this arm probes and
  // SKIPS (loudly, without failing) on a pre-integration tree; the
  // assertions themselves are complete and armed for the merged build.
  await chrome.send('Page.navigate',
    { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=8ball&seed=1` });
  await sleep(500);
  await waitReady();
  await sleep(600);
  await chrome.eval(`__settings.set('soundOn', false)`);
  const switched = await chrome.eval(
    `typeof __settings.changeGame === 'function'
      ? __settings.changeGame('eight_ball', { skipConfirm: true }) : 'no-api'`);
  if (switched !== true) {
    console.log('[e2e-share] 8-BALL ROUND-TRIP ARM: SKIPPED (integration '
      + 'pending — ' + (switched === 'no-api'
        ? 'settings.changeGame missing'
        : 'game dispatch not live: game.setGame absent or entry not selectable')
      + ')');
  } else {
    await sleep(600);
    const nBalls = (await chrome.eval('__test.balls()')).length;
    if (nBalls !== 16) {
      fail(`8-ball arm: changeGame succeeded but the rack has ${nBalls} balls, want 16`);
    }
    // ---- per-game equipment pairing (feature 012 US4/T049): each
    // discipline keeps its OWN persisted spec — the 9-ball profile above
    // persisted cloth worn_slow, so switching to 8-ball must adopt
    // 8-BALL's spec (pairing default on first visit: the pool app
    // default), and switching back must RESTORE the worn cloth (state
    // never leaks across games in either direction)
    const eq8 = await chrome.eval('__settings.get().equipment');
    if (eq8.cloth_id !== 'pool_worsted_new') {
      fail(`8-ball arm: switching games leaked the 9-ball cloth `
        + `(${eq8.cloth_id}, want the pool default)`);
    }
    const stored8 = await chrome.eval(
      `JSON.parse(localStorage.getItem('ob-settings-v1'))`);
    if (stored8?.equipment?.cloth_id !== 'pool_worsted_new') {
      fail('8-ball arm: top-level persisted equipment did not follow the game switch');
    }
    if (stored8?.equipmentByGame?.nine_ball?.cloth_id !== 'worn_slow') {
      fail('8-ball arm: nine_ball per-game spec lost its worn cloth: '
        + JSON.stringify(stored8?.equipmentByGame));
    }
    if (await chrome.eval(
      `__settings.changeGame('nine_ball', { skipConfirm: true })`) !== true) {
      fail('8-ball arm: could not switch back to nine_ball');
    }
    await sleep(600);
    const eq9 = await chrome.eval('__settings.get().equipment');
    if (eq9.cloth_id !== 'worn_slow') {
      fail(`8-ball arm: switching back did not restore the 9-ball cloth (${eq9.cloth_id})`);
    }
    if (await chrome.eval(
      `__settings.changeGame('eight_ball', { skipConfirm: true })`) !== true) {
      fail('8-ball arm: could not return to eight_ball');
    }
    await sleep(600);
    console.log('[e2e-share] per-game equipment pairing: 9-ball worn cloth '
      + 'stashed and restored; 8-ball on the pool default');
    // break, then one CALLED shot (the flow lane's own nomination recording
    // via __rules.call → the recordAnnotation seam; the recorder-seam
    // fallback covers stacks without the programmatic call surface)
    const b1 = await chrome.eval(
      '__test.shoot({ v0: 5.5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 })');
    if (b1) fail('8-ball break rejected: ' + b1);
    await waitSettled();
    // integration (merged tree): flow.js locks shooting behind rulebook
    // options and gates non-break shots on a nomination. Resolve any break
    // decision with choice 1 (never a re-rack: accept table / spot the 8 /
    // kitchen BIH) — the decision is RECORDED and re-applied by the replay.
    const pend = await chrome.eval(
      `window.__rules?.matchState?.()?.pendingDecision?.kind ?? null`);
    if (pend) {
      if (await chrome.eval('window.__rules.decide(1)') !== true) {
        fail(`8-ball arm: decide(1) for break option '${pend}' refused`);
      }
      await sleep(300);
    }
    const armed = await chrome.eval(`(() => {
      const ms = window.__rules?.matchState?.();
      if (!ms || ms.phase === 'break') return 'no-call-needed';
      const ball = (ms.onTable ?? []).find((id) => id !== 8) ?? 1;
      return window.__rules?.call?.(ball, 0) === true ? 'rules' : 'fallback';
    })()`);
    if (armed === 'fallback') {
      await chrome.eval(`__share.annotate({ kind: 'call', ball: 1, pocket: 0 })`);
    }
    const b2 = await chrome.eval(
      '__test.shoot({ v0: 1.6, phi: 1.9, theta: 0, a: 0, b: 0 })');
    if (b2) fail('8-ball shot 2 rejected: ' + b2);
    await waitSettled();
    const originals8 = await chrome.eval('__share.records()');
    if (originals8.length !== 2) {
      fail(`8-ball arm: expected 2 records, got ${originals8.length}`);
    }
    const url8 = await chrome.eval('__share.encode()');
    const hash8 = url8.slice(url8.indexOf('#'));
    const dec8 = await decodeShare(hash8.slice(3));
    if (dec8.formatV !== 7 || dec8.game !== 'eight_ball'
        || dec8.rackKind !== 'fifteen') {
      fail(`8-ball share axis wrong: v${dec8.formatV} ${dec8.game}/${dec8.rackKind}`);
    }
    if (dec8.variant !== 'wpa-8ball') { // 022: explicit family default
      fail(`8-ball share variant '${dec8.variant}', want wpa-8ball`);
    }
    if (!dec8.calls.some((c) => c.kind === 'call' || c.kind === 'safety')) {
      fail('8-ball share carries no call/safety annotation');
    }
    // reload with the hash → replay must route to eight_ball and byte-match
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=8ball-replay${hash8}` });
    await sleep(500);
    await waitReady();
    let rep8 = { done: false };
    for (let i = 0; i < 200 && !rep8.done; i++) {
      await sleep(400);
      rep8 = await chrome.eval('__share.replay()');
    }
    if (!rep8.done) fail('8-ball replay never finished: ' + JSON.stringify(rep8));
    if (rep8.game !== 'eight_ball') {
      fail(`8-ball replay routed as '${rep8.game}', want eight_ball`);
    }
    if ((await chrome.eval(`__settings.get().game`)) !== 'eight_ball') {
      fail('8-ball replay did not apply the shared game transiently');
    }
    const replays8 = await chrome.eval('__share.records()');
    replays8.forEach((r, i) => {
      if (r !== originals8[i]) {
        fail(`8-ball record ${i} does NOT byte-match the original`);
      } else {
        console.log(`8-ball record ${i}: byte-match OK (${r.length} bytes)`);
      }
    });
    // adjudication-parity introspection (ruleset-api: __rules.matchState) —
    // informative until the flow lane exposes it
    const ms = await chrome.eval(
      `window.__rules && typeof __rules.matchState === 'function'
        ? JSON.stringify(__rules.matchState()) : null`);
    console.log('[e2e-share] 8-ball replay match state:',
      ms ?? '(matchState not exposed yet — flow lane pending)');
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
    if ((await chrome.eval(`__settings.get().game`)) !== 'eight_ball') {
      fail('8-ball arm: exit did not restore the persisted (viewer) game');
    }
    // restore the default game for whatever runs next in this profile
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
    console.log('[e2e-share] 8-BALL ROUND-TRIP ARM: PASS');
  }

  // ---- new-discipline v4 round-trips (feature 012 T051 — SC-007, the G4
  // extension: one share per new discipline reloads to identical shots and
  // adjudications). MECHANISM-ARMED: each arm probes settings.changeGame
  // and SKIPS loudly while the discipline's US4 readiness flip has not
  // landed (research.md R12: the catalog flips to playable only after the
  // story-lane ruleset merges; the selector mechanism keeps the entry
  // un-selectable — and the v4 decode validation keeps its shares
  // un-decodable — until then). On the merged tree each arm records one
  // adjudicated shot (resolving any recorded rulebook decisions), encodes,
  // reloads, and asserts byte-identical records + identical adjudication
  // state.
  const NEW_DISCIPLINES = [
    { game: 'one_pocket', rackKind: 'fifteen', balls: 16,
      shot: { v0: 5.5, phi: Math.PI / 2, theta: 0, a: 0, b: 0 } },
    { game: 'snooker', rackKind: 'snooker', balls: 22,
      shot: { v0: 3.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 } },
    { game: 'carom_3cushion', rackKind: 'carom', balls: 3,
      shot: { v0: 2.0, phi: Math.PI / 2, theta: 0, a: 0, b: 0 } },
  ];
  for (const disc of NEW_DISCIPLINES) {
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=${disc.game}&seed=1` });
    await sleep(500);
    await waitReady();
    await sleep(600);
    await chrome.eval(`__settings.set('soundOn', false)`);
    const on = await chrome.eval(
      `typeof __settings.changeGame === 'function'
        ? __settings.changeGame('${disc.game}', { skipConfirm: true }) : 'no-api'`);
    if (on !== true) {
      console.log(`[e2e-share] ${disc.game.toUpperCase()} ROUND-TRIP ARM: `
        + 'SKIPPED (US4 readiness flip pending — entry not selectable until '
        + 'its story-lane ruleset merges; research.md R12)');
      continue;
    }
    await sleep(600);
    const n0 = (await chrome.eval('__test.balls()')).length;
    if (n0 !== disc.balls) {
      fail(`${disc.game} arm: rack has ${n0} balls, want ${disc.balls}`);
    }
    // resolve any pre-shot rulebook decisions (one-pocket break pocket =
    // decision 6, carom break spot = decision 10, ...) with choice 1 —
    // decisions are RECORDED and re-applied by the replay without
    // re-adjudication divergence (contracts/rulesets-012.md §3/§7)
    for (let d = 0; d < 4; d++) {
      const pend = await chrome.eval(
        `window.__rules?.matchState?.()?.pendingDecision?.kind ?? null`);
      if (!pend) break;
      if (await chrome.eval('window.__rules.decide(1)') !== true) {
        fail(`${disc.game} arm: decide(1) for '${pend}' refused`);
        break;
      }
      await sleep(300);
    }
    const errD = await chrome.eval(`__test.shoot(${JSON.stringify(disc.shot)})`);
    if (errD) { fail(`${disc.game} arm: shot rejected: ${errD}`); continue; }
    await waitSettled();
    const originalsD = await chrome.eval('__share.records()');
    if (originalsD.length !== 1) {
      fail(`${disc.game} arm: expected 1 record, got ${originalsD.length}`);
      continue;
    }
    // adjudication state BEFORE the round-trip (ruleset-api introspection)
    const msBefore = await chrome.eval(
      `window.__rules && typeof __rules.matchState === 'function'
        ? JSON.stringify(__rules.matchState()) : null`);
    const urlD = await chrome.eval('__share.encode()');
    const hashD = urlD.slice(urlD.indexOf('#'));
    const decD = await decodeShare(hashD.slice(3));
    if (decD.formatV !== 7 || decD.game !== disc.game
        || decD.rackKind !== disc.rackKind) {
      fail(`${disc.game} share axis wrong: v${decD.formatV} `
        + `${decD.game}/${decD.rackKind} (want 7 ${disc.game}/${disc.rackKind})`);
    }
    await chrome.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=${disc.game}-replay${hashD}` });
    await sleep(500);
    await waitReady();
    // GH-451: decision prompts must NEVER paint during a shared replay —
    // the carom break_spot pends from rack to settle and used to squat
    // over the whole break playback as a dead modal; recorded decisions
    // re-apply silently and announce through the passive hint instead.
    // rAF watcher over #hud-decision visibility + the #hud-hint set.
    await chrome.eval(`(() => {
      window.__w451 = { frames: 0, hints: [] };
      const tick = () => {
        // frames count only WHILE THE REPLAY RUNS: the boot instant of a
        // #r= page composes the viewer's own persisted game first, whose
        // live pending decision may legitimately prompt for the moment
        // before the replay stages and takes the surface over
        if (window.__share?.replay?.()?.active === true) {
          const d = document.getElementById('hud-decision');
          if (d && d.style.display === 'block') window.__w451.frames += 1;
          const h = document.getElementById('hud-hint');
          if (h && h.textContent && !window.__w451.hints.includes(h.textContent)) {
            window.__w451.hints.push(h.textContent);
          }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    })()`);
    let repD = { done: false };
    for (let i = 0; i < 200 && !repD.done; i++) {
      await sleep(400);
      repD = await chrome.eval('__share.replay()');
    }
    if (!repD.done || repD.n !== 1) {
      fail(`${disc.game} replay did not finish: ${JSON.stringify(repD)}`);
      continue;
    }
    const w451 = await chrome.eval('window.__w451');
    if (w451.frames > 0) {
      fail(`451 ${disc.game}: decision panel painted ${w451.frames} frames `
        + 'during the shared replay (prompts must never leak to a viewer)');
    }
    if (disc.game === 'one_pocket'
      && !w451.hints.some((h) => h.includes('Recorded decision applied'))) {
      fail('451 one_pocket: the recorded break-pocket decision was never '
        + 'announced passively (share.decisionApplied hint missing): '
        + JSON.stringify(w451.hints));
    }
    if (repD.game !== disc.game) {
      fail(`${disc.game} replay routed as '${repD.game}'`);
    }
    if ((await chrome.eval(`__settings.get().game`)) !== disc.game) {
      fail(`${disc.game} replay did not apply the shared game transiently`);
    }
    const replaysD = await chrome.eval('__share.records()');
    if (replaysD.length !== 1 || replaysD[0] !== originalsD[0]) {
      fail(`${disc.game} record does NOT byte-match the original `
        + `(${replaysD[0]?.length} vs ${originalsD[0].length} bytes)`);
    } else {
      console.log(`${disc.game} record: byte-match OK (${replaysD[0].length} bytes)`);
    }
    const msAfter = await chrome.eval(
      `window.__rules && typeof __rules.matchState === 'function'
        ? JSON.stringify(__rules.matchState()) : null`);
    if (msBefore && msAfter
        && canon(JSON.parse(msBefore)) !== canon(JSON.parse(msAfter))) {
      fail(`${disc.game}: replay adjudication state diverged from the `
        + `original (${msBefore} vs ${msAfter})`);
    }
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
    console.log(`[e2e-share] ${disc.game.toUpperCase()} ROUND-TRIP ARM: PASS`);
  }

  // ---- GH-492 boot-race arm: a REPLAY page whose rules-registry import
  // lands AFTER the transport's rerack (a storm-loaded boot; held 2.5 s
  // here via flow.js's `obholdrules` TEST SEAM) must WAIT for the fold
  // before firing shot 0. The unguarded transport fired from the fold-less
  // AIM (resetMatch early-returns on the null registry, so no carom break
  // address / BALL_IN_HAND was ever staged), SILENTLY skipped the recorded
  // placements[0] (the sender's LEFT break-spot choice), and re-simulated
  // from the rack-default RIGHT spot — 9 bytes short (the lost minus
  // signs) + breakSpot adjudication divergence: issue #492's battery
  // signature (gate-ledger e2e-share 2026-08-09, 3848 vs 3857 bytes),
  // reproduced deterministically. Seam-liveness is asserted through the
  // seam's own console warn — a rotted seam fails loud, never vacuous.
  {
    const seamWarns = [];
    chrome.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') {
        const text = params.args.map((a) => a.value ?? a.description).join(' ');
        if (/GH-492 TEST SEAM/.test(text)) seamWarns.push(text);
      }
    });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=gh492&seed=1` });
    await sleep(500);
    await waitReady();
    await sleep(600);
    await chrome.eval(`__settings.set('soundOn', false)`);
    if (await chrome.eval(
      `__settings.changeGame('carom_3cushion', { skipConfirm: true })`) !== true) {
      fail('492 arm: changeGame(carom_3cushion) refused');
    }
    await sleep(600);
    // choice 1 = the LEFT start spot — the NON-default side (the rack
    // composes the cue at the right spot), so a skipped placements[0] is
    // VISIBLE as byte + breakSpot divergence, never a same-spot false pass
    if (await chrome.eval(
      `window.__rules?.matchState?.()?.pendingDecision?.kind ?? null`)
      !== 'break_spot') {
      fail('492 arm: expected the pending carom break_spot option');
    }
    if (await chrome.eval('window.__rules.decide(1)') !== true) {
      fail('492 arm: decide(1) (left start spot) refused');
    }
    await sleep(300);
    const err492 = await chrome.eval(
      `__test.shoot({v0:2.0,phi:Math.PI/2,theta:0,a:0,b:0})`);
    if (err492) fail(`492 arm: shot rejected: ${err492}`);
    await waitSettled();
    const orig492 = await chrome.eval('__share.records()');
    if (orig492.length !== 1) {
      fail(`492 arm: expected 1 record, got ${orig492.length}`);
    }
    const spot492 = await chrome.eval(
      `window.__rules.matchState()?.breakSpot ?? null`);
    if (spot492 !== 'left') {
      fail(`492 arm: sender breakSpot '${spot492}', want left`);
    }
    const url492 = await chrome.eval('__share.encode()');
    const hash492 = url492.slice(url492.indexOf('#'));
    // the replay page with the registry import HELD — the boot race, on a
    // quiet machine, every run
    seamWarns.length = 0;
    await chrome.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=gh492-replay`
        + `&obholdrules=2500${hash492}` });
    await sleep(500);
    await waitReady();
    let rep492 = { done: false };
    for (let i = 0; i < 200 && !rep492.done; i++) {
      await sleep(400);
      rep492 = await chrome.eval('__share.replay()');
    }
    if (!rep492.done || rep492.n !== 1) {
      fail(`492 arm: replay did not finish: ${JSON.stringify(rep492)}`);
    }
    if (seamWarns.length === 0) {
      fail('492 arm: the obholdrules seam never armed on the replay page '
        + '(no seam warn) — the arm is testing nothing');
    }
    const replays492 = await chrome.eval('__share.records()');
    if (replays492.length !== 1 || replays492[0] !== orig492[0]) {
      fail('492 arm: record does NOT byte-match under the held registry '
        + `import (${replays492[0]?.length} vs ${orig492[0]?.length} bytes) `
        + '— shot 0 fired over the fold-less AIM (the #492 boot race)');
    } else {
      console.log('492 arm: byte-match OK under a 2.5 s registry hold '
        + `(${replays492[0].length} bytes)`);
    }
    const rspot492 = await chrome.eval(
      `window.__rules.matchState()?.breakSpot ?? null`);
    if (rspot492 !== 'left') {
      fail(`492 arm: replay adjudicated breakSpot '${rspot492}', want left `
        + '(the recorded LEFT break-spot placement was skipped)');
    }
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
    console.log('[e2e-share] GH-492 BOOT-RACE ARM: PASS');
  }

  // ---- 14.1 continuous multi-re-rack determinism arm (feature 025, issue
  // #65 — the SC-007 pattern extended): a LIVE straight_pool game crossing
  // TWO rulebook re-racks (7.3(b) breaking violations, each resolved with
  // the recorded decision 11 choice 2 = re-break on the SAME seed) plus an
  // accepted table and a called stroke. Re-racks are judgment/decision-
  // derived and RE-DERIVED on replay — never recorded (zero new wire
  // axes); the arm proves the whole sequence byte-replays: every record
  // byte-matches, the final adjudication fold is identical, and the
  // re-encoded link equals the original.
  {
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=fourteenone&seed=1` });
    await sleep(500);
    await waitReady();
    await sleep(600);
    await chrome.eval(`__settings.set('soundOn', false)`);
    if (await chrome.eval(
      `__settings.changeGame('straight_pool', { skipConfirm: true })`) !== true) {
      fail('14.1 arm: changeGame(straight_pool) refused (playable entry)');
    }
    await sleep(600);
    const settleShot = async (tag, js) => {
      const err = await chrome.eval(js);
      if (err) { fail(`14.1 arm ${tag}: shot rejected: ${err}`); return false; }
      await waitSettled();
      return true;
    };
    // shot 0: soft break — 7.3(b) violation (−2, decision 11 born)
    await settleShot('break-1',
      `__test.shoot({v0:1.6,phi:Math.PI/2,theta:0,a:0,b:0})`);
    if (await chrome.eval(
      `__rules.matchState()?.pendingDecision?.kind`) !== 'break_violation') {
      fail('14.1 arm: expected the break_violation option after the soft break');
    }
    if (await chrome.eval('__rules.decide(2)') !== true) {
      fail('14.1 arm: decide(2) re-break refused');   // re-rack #1 (re-derived)
    }
    await sleep(500);
    // shot 1: violate again — the option is repeatable
    await settleShot('break-2',
      `__test.shoot({v0:1.6,phi:Math.PI/2,theta:0,a:0,b:0})`);
    if (await chrome.eval('__rules.decide(2)') !== true) {
      fail('14.1 arm: second decide(2) refused');     // re-rack #2 (re-derived)
    }
    await sleep(500);
    // shot 2: violate once more, opponent ACCEPTS the table (choice 1)
    await settleShot('break-3',
      `__test.shoot({v0:1.6,phi:Math.PI/2,theta:0,a:0,b:0})`);
    if (await chrome.eval('__rules.decide(1)') !== true) {
      fail('14.1 arm: decide(1) accept refused');
    }
    await sleep(400);
    // shot 3: a called stroke under the full call regime (7.5 via 1.7)
    const ball14 = await chrome.eval(
      `(__rules.matchState()?.onTable ?? [1])[0]`);
    if (await chrome.eval(`__rules.call(${ball14}, 5)`) !== true) {
      fail('14.1 arm: call() refused');
    }
    await settleShot('called-stroke',
      `__test.shoot({v0:2.2,phi:Math.PI/2,theta:0,a:0,b:0})`);
    const originals14 = await chrome.eval('__share.records()');
    if (originals14.length !== 4) {
      fail(`14.1 arm: expected 4 records, got ${originals14.length}`);
    }
    const ms14 = await chrome.eval(`JSON.stringify(__rules.matchState())`);
    const rack14 = await chrome.eval(`__rules.matchState()?.rackCount`);
    if (rack14 !== 3) {
      fail(`14.1 arm: expected rackCount 3 after two re-breaks, got ${rack14}`);
    }
    const url14 = await chrome.eval('__share.encode()');
    const hash14 = url14.slice(url14.indexOf('#'));
    const dec14 = await decodeShare(hash14.slice(3));
    if (dec14.formatV !== 7 || dec14.game !== 'straight_pool'
      || dec14.rackKind !== 'fifteen' || dec14.variant !== 'wpa-14-1') {
      fail(`14.1 arm: share axis wrong: v${dec14.formatV} ${dec14.game}/`
        + `${dec14.rackKind}/${dec14.variant}`);
    }
    const decisions14 = dec14.calls.filter((c) => c.kind === 'decision');
    if (decisions14.length !== 3
      || !decisions14.every((c) => c.decision === 11)) {
      fail('14.1 arm: expected three recorded decision-11 tuples: '
        + JSON.stringify(dec14.calls));
    }
    // reload with the hash → replay must re-derive both re-racks and
    // byte-match every record + the final fold
    await chrome.send('Page.navigate', {
      url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=fourteenone-replay${hash14}` });
    await sleep(500);
    await waitReady();
    let rep14 = { done: false };
    for (let i = 0; i < 240 && !rep14.done; i++) {
      await sleep(400);
      rep14 = await chrome.eval('__share.replay()');
    }
    if (!rep14.done || rep14.n !== 4) {
      fail(`14.1 replay did not finish: ${JSON.stringify(rep14)}`);
    }
    const replays14 = await chrome.eval('__share.records()');
    if (replays14.length !== 4
      || replays14.some((r, i) => r !== originals14[i])) {
      fail('14.1 arm: replayed records do NOT byte-match the originals '
        + `(${replays14.map((r) => r.length)} vs `
        + `${originals14.map((r) => r.length)} bytes)`);
    } else {
      console.log(`14.1 records: byte-match OK (4 records, `
        + `${originals14.reduce((s, r) => s + r.length, 0)} bytes total)`);
    }
    const msAfter14 = await chrome.eval(`JSON.stringify(__rules.matchState())`);
    if (canon(JSON.parse(ms14)) !== canon(JSON.parse(msAfter14))) {
      fail(`14.1 arm: replay fold diverged (${ms14} vs ${msAfter14})`);
    }
    const reUrl14 = await chrome.eval('__share.encode()');
    if (reUrl14.slice(reUrl14.indexOf('#')) !== hash14) {
      fail('14.1 arm: re-encoded link does not equal the original');
    }
    await chrome.eval(`document.getElementById('ob-rp-exit').click()`);
    await sleep(400);
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
    console.log('[e2e-share] STRAIGHT_POOL MULTI-RE-RACK ARM: PASS '
      + '(2 re-derived re-racks + accept + called stroke, byte-identical)');
  }

  // ---- 14-at-14 PARTIAL re-rack cross-navigation determinism arm (feature
  // 025 review finding 2, issue #65): the arm above crosses only decision-11
  // FULL re-breaks — the genuinely new applyFourteenOneRerack seam (flow.js:
  // judged `next.rerack` -> lattice re-placement -> the NEXT scenario builds
  // from the re-racked meshes) was replay-proven only in-session (the
  // e2e-straightpool S11b in-app Replay). This arm proves it across a FULL
  // NAVIGATION with the share wire in the loop: session A shapes the proven
  // S11 scene (e2e-straightpool recipe: two balls left, the called 14 drops,
  // the 15th and the cue clear of the rack area -> judged plan partial
  // {stays, stays}), crosses the partial re-rack, fires a second called
  // stroke OFF the re-racked lattice, then encodes; session B is a fresh
  // navigation that re-runs the game with every shot/call taken VERBATIM
  // from the DECODED wire and must reproduce the re-racked poses, every
  // record, the adjudication fold, and the re-encoded link byte-exactly.
  //
  // Honest transport limitation (stated, not hidden): the frozen codec's
  // game model is seed + shots + placements + calls — a 14-at-14 state is
  // 14 legal called pots deep, so the S11 scene PREAMBLE (__test.layout +
  // __rules.setMatchState, the e2e-straightpool test seam) cannot ride the
  // wire and is re-applied by THIS DRIVER on both sides; share.js's own
  // fireShot loop starts from the seed rack and therefore cannot drive a
  // scene-shaped session. Everything downstream of the preamble — the shot
  // params, the calls axis, the judged plan, the re-racked lattice, the
  // post-re-rack scenario chain — is exercised on the decoded bytes.
  {
    const S11_SPECS = [
      { id: 0, x: 0, y: 0 },
      // the proven stage-3 pot geometry (e2e-rules): phi 1.10715 pots
      // straight into the rt corner (kernel pocket 5)
      { id: 14, x: 0.38903252247502133, y: 0.7780650449500427 },
      { id: 7, x: 0.45, y: -0.9 },
    ];
    const S11_STATE = {
      phase: 'play', shooter: 1, breaker: 1, scores: { 1: 12, 2: 3 },
      target: 100, run: 12, consecutiveFouls: { 1: 0, 2: 0 }, rackCount: 1,
      rerack: null, onTable: [7, 14], pendingDecision: null,
      foulContext: null, result: null,
    };
    const S11_PLAN = {
      kind: 'partial', fifteenth: 7, fifteenthSpot: 'stays', cueSpot: 'stays',
    };
    const PHI_POT = 1.1071487177940904;
    const POCKET_FR = 5;

    /** One scene-scripted session. `wire` null records fresh (session A);
     * a decoded SharedGame drives session B with the wire's bytes. Returns
     * { poses, records, fold, url } or null after a fail(). */
    const runPartialSession = async (tag, wire) => {
      await chrome.send('Page.navigate',
        { url: `http://127.0.0.1:${PORT}/app.html?obtool=1&arm=${tag}&seed=1` });
      await sleep(500);
      await waitReady();
      await sleep(600);
      await chrome.eval(`__settings.set('soundOn', false)`);
      if (await chrome.eval(
        `__settings.changeGame('straight_pool', { skipConfirm: true })`) !== true) {
        fail(`${tag}: changeGame(straight_pool) refused`);
        return null;
      }
      await sleep(600);
      await chrome.eval(`__test.layout(${JSON.stringify(S11_SPECS)})`);
      if (await chrome.eval(
        `window.__rules.setMatchState(${JSON.stringify(S11_STATE)})`) !== true) {
        fail(`${tag}: setMatchState refused`);
        return null;
      }
      // shot 0: the called 14 drops -> the judged PARTIAL plan applies
      const call0 = wire?.calls.find((c) => c.shotIndex === 0)
        ?? { ball: 14, pocket: POCKET_FR };
      if (await chrome.eval(
        `window.__rules.call(${call0.ball}, ${call0.pocket})`) !== true) {
        fail(`${tag}: call(${call0.ball}, ${call0.pocket}) refused`);
        return null;
      }
      const s0 = wire ? wire.shots[0]
        : { v0: 2.5, phi: PHI_POT, theta: 0, a: 0, b: 0 };
      const e0 = await chrome.eval(`__test.shoot(${JSON.stringify(s0)})`);
      if (e0) { fail(`${tag}: shot 0 rejected: ${e0}`); return null; }
      await waitSettled();
      const m0 = await chrome.eval('window.__rules.matchState()');
      if (m0?.phase !== 'rerack' || canon(m0?.rerack) !== canon(S11_PLAN)) {
        fail(`${tag}: expected the S11 partial plan after shot 0: `
          + JSON.stringify({ phase: m0?.phase, rerack: m0?.rerack }));
      }
      // position-exact snapshot of the re-racked table (quaternions are
      // wall-clock integrated and stay out — the S11b precedent)
      const poses = await chrome.eval(
        `JSON.stringify(__test.balls().map((b) => [b.id, b.pocketed, ...b.pos]))`);
      // shot 1 fires OFF the re-racked lattice: a straight called roll at
      // the fifteenth (deterministic post-re-rack poses -> deterministic
      // aim; session B takes the decoded params instead of re-deriving)
      const call1 = wire?.calls.find((c) => c.shotIndex === 1)
        ?? { ball: 7, pocket: POCKET_FR };
      if (await chrome.eval(
        `window.__rules.call(${call1.ball}, ${call1.pocket})`) !== true) {
        fail(`${tag}: call(${call1.ball}, ${call1.pocket}) refused`);
        return null;
      }
      const s1 = wire ? wire.shots[1] : await chrome.eval(`(() => {
        const k = (b) => ({ x: b.pos[2], y: b.pos[0] }); // three -> kernel
        const balls = __test.balls();
        const cue = k(balls.find((b) => b.id === 0));
        const seven = k(balls.find((b) => b.id === 7));
        return { v0: 1.8, phi: Math.atan2(seven.y - cue.y, seven.x - cue.x),
          theta: 0, a: 0, b: 0 };
      })()`);
      const e1 = await chrome.eval(`__test.shoot(${JSON.stringify(s1)})`);
      if (e1) { fail(`${tag}: shot 1 rejected: ${e1}`); return null; }
      await waitSettled();
      return {
        poses,
        records: await chrome.eval('__share.records()'),
        fold: await chrome.eval('JSON.stringify(window.__rules.matchState())'),
        url: await chrome.eval('__share.encode()'),
      };
    };

    const a = await runPartialSession('fourteenone-partial', null);
    if (a) {
      if (a.records.length !== 2) {
        fail(`partial arm: expected 2 records, got ${a.records.length}`);
      }
      const hashP = a.url.slice(a.url.indexOf('#'));
      const decP = await decodeShare(hashP.slice(3));
      if (decP.formatV !== 7 || decP.game !== 'straight_pool'
        || decP.rackKind !== 'fifteen' || decP.variant !== 'wpa-14-1'
        || decP.shots.length !== 2) {
        fail(`partial arm: share axis wrong: v${decP.formatV} ${decP.game}/`
          + `${decP.rackKind}/${decP.variant}, ${decP.shots.length} shots`);
      }
      const wcalls = decP.calls.filter((c) => c.kind === 'call');
      if (wcalls.length !== 2 || wcalls[0].shotIndex !== 0
        || wcalls[0].ball !== 14 || wcalls[1].shotIndex !== 1
        || wcalls[1].ball !== 7) {
        fail('partial arm: expected the two recorded call tuples on the '
          + 'wire: ' + JSON.stringify(decP.calls));
      }
      const b = await runPartialSession('fourteenone-partial-replay', decP);
      if (b) {
        if (b.poses !== a.poses) {
          fail('partial arm: re-racked lattice diverged across navigation\n'
            + a.poses + '\nvs\n' + b.poses);
        }
        if (b.records.length !== a.records.length
          || b.records.some((r, i) => r !== a.records[i])) {
          fail('partial arm: decoded-wire records do NOT byte-match the '
            + `originals (${b.records.map((r) => r.length)} vs `
            + `${a.records.map((r) => r.length)} bytes)`);
        }
        if (canon(JSON.parse(b.fold)) !== canon(JSON.parse(a.fold))) {
          fail(`partial arm: fold diverged (${a.fold} vs ${b.fold})`);
        }
        if (b.url.slice(b.url.indexOf('#')) !== hashP) {
          fail('partial arm: re-encoded link does not equal the original');
        }
        if (!process.exitCode) {
          console.log('[e2e-share] STRAIGHT_POOL 14-AT-14 PARTIAL RE-RACK '
            + 'ARM: PASS (partial re-rack crossed, decoded-wire re-run '
            + `byte-identical: poses + 2 records `
            + `(${a.records.reduce((s, r) => s + r.length, 0)} bytes) + `
            + 'fold + re-encoded link)');
        }
      }
    }
    await chrome.eval(`__settings.changeGame('nine_ball', { skipConfirm: true })`);
  }

  // ---- build-4 QA (play lane): phone 667x375 replay DONE-register geometry.
  // The DONE state is the bar's widest set (label + 3 transports + toggle +
  // Continue + Exit); pre-fix the touch.css §3.3 nowrap row shrank the text
  // pills past their labels (de Continue rendered 'on hier weiterspiele',
  // sw/cw 140/130; toggle track under Continue) and the 92vw cap let the
  // bar paint 19.3x34.5px over the §3.5 power gauge — no shipped arm ever
  // composed the DONE register on a phone register. The leg re-boots the
  // SAME share hash under the frozen phone recipe (coarse before boot,
  // DPR3) at the smallest register and gates, per collision-relevant
  // locale: control labels never clip, bar ∩ gauge stays empty, the bar
  // stays inside its :has()-grown band-S reservation (band X starts clear
  // of it), 44 pt floors + Continue hit-testability.
  {
    await setPhoneMetrics(chrome, { width: 667, height: 375 });
    await chrome.send('Page.navigate',
      { url: `http://127.0.0.1:${PORT}/app.html?phonedone=1${hash}` });
    await sleep(500);
    await waitReady();
    // the touch leaf loads post-boot (dynamic import) — poll for the
    // installed class instead of sampling once (e2e-ui phone-boot recipe)
    let touchOn = false;
    for (let i = 0; i < 50 && !touchOn; i++) {
      await sleep(200);
      touchOn = await chrome.eval(`matchMedia('(pointer: coarse)').matches
        && document.documentElement.classList.contains('ob-touch')`);
    }
    if (touchOn !== true) fail('phone done-state leg: coarse/ob-touch boot did not take');
    let prep = { done: false };
    for (let i = 0; i < 150 && !prep.done; i++) {
      await sleep(400);
      prep = await chrome.eval('__share.replay()');
    }
    if (!prep.done) {
      fail('phone done-state leg: replay never finished: ' + JSON.stringify(prep));
    } else {
      await sleep(800); // Continue enter-motion + relayout settle
      for (const loc of ['en', 'de', 'ja']) {
        await chrome.eval(`__settings.set('language', '${loc}')`);
        await sleep(600);
        const g = await chrome.eval(`(() => {
          const bar = document.getElementById('ob-replay');
          if (!bar || !bar.classList.contains('ob-rp-done')) {
            return { err: 'bar missing or not in the done register' };
          }
          const rect = (el) => el.getBoundingClientRect();
          const clip = [];
          for (const el of [
            document.getElementById('ob-rp-continue'),
            document.getElementById('ob-rp-exit'),
            bar.querySelector('label')]) {
            if (!el) { clip.push('missing control'); continue; }
            if (el.scrollWidth > el.clientWidth + 1
                || el.scrollHeight > el.clientHeight + 1) {
              clip.push((el.id || 'label') + ' '
                + el.scrollWidth + '/' + el.clientWidth);
            }
          }
          const small = [];
          for (const el of [...bar.querySelectorAll('button'),
            bar.querySelector('label')]) {
            const r = rect(el);
            if (el.offsetParent !== null && r.width > 0
                && Math.min(r.width, r.height) < 43.5) {
              small.push((el.id || 'label') + ' '
                + r.width.toFixed(0) + 'x' + r.height.toFixed(0));
            }
          }
          const b = rect(bar);
          const gauge = document.getElementById('ob-power-gauge');
          let gaugeOv = null;
          if (gauge) {
            const gr = rect(gauge);
            const ow = Math.min(b.right, gr.right) - Math.max(b.left, gr.left);
            const oh = Math.min(b.bottom, gr.bottom) - Math.max(b.top, gr.top);
            if (ow > 0.5 && oh > 0.5) {
              gaugeOv = ow.toFixed(1) + 'x' + oh.toFixed(1) + 'px';
            }
          }
          // resolve the band-X line (banner lane top) via a probe node —
          // computed custom properties keep their calc() text otherwise
          const probe = document.createElement('div');
          probe.style.cssText =
            'position:fixed;top:var(--ob-band-x);left:0;width:1px;height:1px;';
          document.body.appendChild(probe);
          const bandX = probe.getBoundingClientRect().top;
          probe.remove();
          const cont = document.getElementById('ob-rp-continue');
          const cr = rect(cont);
          const hit = document.elementFromPoint(
            cr.left + cr.width / 2, cr.top + cr.height / 2);
          return {
            clip, small, gaugeOv,
            barBottom: +b.bottom.toFixed(1), bandX: +bandX.toFixed(1),
            inViewport: b.left >= -0.5 && b.right <= innerWidth + 0.5,
            contHit: !!hit && (cont.contains(hit) || hit.contains(cont)),
          };
        })()`);
        const tag = `phone done-state 667x375 [${loc}]`;
        if (g.err) { fail(`${tag}: ${g.err}`); continue; }
        if (g.clip.length) {
          fail(`${tag}: control labels clip — ${g.clip.join('; ')}`);
        }
        if (g.small.length) {
          fail(`${tag}: bar controls under the 44pt floor — ${g.small.join('; ')}`);
        }
        if (g.gaugeOv) fail(`${tag}: bar paints over the power gauge (${g.gaugeOv})`);
        if (!(g.barBottom <= g.bandX + 0.5)) {
          fail(`${tag}: bar (bottom ${g.barBottom}) breaches its band-S `
            + `reservation (band X starts at ${g.bandX})`);
        }
        if (!g.inViewport) fail(`${tag}: bar breaches the viewport`);
        if (g.contHit !== true) fail(`${tag}: Continue is not hit-testable`);
      }
      await chrome.eval(`__settings.set('language', 'en')`);
      if (!process.exitCode) {
        console.log('[e2e-share] PHONE DONE-REGISTER ARM: PASS '
          + '(667x375 x en/de/ja: labels whole, gauge clear, band-S held, '
          + '44pt floors, Continue hit-testable)');
      }
    }
    await chrome.send('Emulation.clearDeviceMetricsOverride');
    await chrome.send('Emulation.setTouchEmulationEnabled', { enabled: false });
  }

  // ---- GH-302: the `&cp=` camera-plan sibling param -------------------------
  // Compat laws under test: (a) links WITHOUT cp / planless sessions carry
  // ZERO new bytes and traverse zero new codepaths (the `#r=…$` shape
  // assertion is the red-proof — an appended param fails it); (b)
  // malformed/truncated/future-version cp → plan ignored, ONE console
  // warn, the replay still plays, no user-facing error; (c) full
  // app-level round trip: DVR plan → link → replay → reopened DVR plan
  // byte-equal on the #301 integer model, with the re-simulated records
  // still byte-matching (cp never touches physics); (d) the honest-degrade
  // notice red/green via the __share.envelope knob. Own boot: the DVR
  // (plan surface) needs the ARMED archive (?archive=1, the e2e-archive
  // convention — the main arm's hermetic ?seed boot keeps it disarmed).
  {
    const enMsgs = JSON.parse(readFileSync(
      path.join(webDir, 'app', 'locales', 'en.json'), 'utf8'));
    const cpWarns = [];
    chrome.onEvent((method, params) => {
      if (method === 'Runtime.consoleAPICalled' && params.type === 'warning') {
        const text = params.args.map((a) => a.value ?? a.description).join(' ');
        if (/camera plan/.test(text)) cpWarns.push(text);
      }
    });
    let cpBoot = 0;
    const bootCp = async (hash = '') => {
      // &b= boot counter: hash-only deltas would be SAME-DOCUMENT fragment
      // navigations (no reboot) — a fresh query forces the full navigation
      // (the main arm's "different query" note, mechanized)
      cpBoot += 1;
      await chrome.send('Page.navigate', { url:
        `http://127.0.0.1:${PORT}/app.html?seed=11&archive=1&b=${cpBoot}${hash}` });
      await sleep(500);
      await waitReady();
      await sleep(800);
    };
    const waitReplayDone = async () => {
      let rep = { done: false };
      for (let i = 0; i < 150 && !rep.done; i++) {
        await sleep(400);
        rep = await chrome.eval('__share.replay()');
      }
      if (!rep.done) fail('cp arm: replay never finished: ' + JSON.stringify(rep));
      return rep;
    };

    // ---- author lane: 2 shots, then a director plan on the live session
    await bootCp();
    for (const s of [
      { v0: 2.2, phi: 1.35, theta: 0, a: 0, b: 0 },
      { v0: 1.2, phi: -1.2, theta: 0, a: 0.05, b: -0.1 }]) {
      const err = await chrome.eval(`__test.shoot(${JSON.stringify(s)})`);
      if (err) fail('cp arm: author shot rejected: ' + err);
      await waitSettled();
    }
    const cpOriginals = await chrome.eval('__share.records()');

    // (a) planless red-proof: EXACTLY today's link — no &cp=, no new bytes
    const url0 = await chrome.eval('__share.encode()');
    if (!/#r=[A-Za-z0-9_-]+$/.test(url0)) {
      fail('cp arm (a): planless link is not byte-shaped like today\'s: ' + url0);
    }

    // the plan: mid-segment cut + fade + custom tripod (all three value
    // classes on the wire; the #301 integer model is the byte contract)
    await chrome.eval('window.__archive.flush()');
    const sid = await chrome.eval('window.__archive.current()');
    if (sid == null) fail('cp arm: no live archive session');
    if (await chrome.eval(`window.__playback.openSession(${sid})`) !== true) {
      fail('cp arm: openSession failed');
    }
    for (let i = 0; i < 50
      && !(await chrome.eval('window.__playback.playerOpen()')); i++) {
      await sleep(200);
    }
    if (await chrome.eval(`window.__playback.setCutPlan({ cuts: [
        { seg: 0, t: 0,   cam: 0, transitionIn: 0, dur: 0 },
        { seg: 0, t: 0.8, cam: 5, transitionIn: 0, dur: 0 },
        { seg: 1, t: 0,   cam: 3, transitionIn: 2, dur: 1.0 },
        { seg: 1, t: 0.6, cam: 8, transitionIn: 0, dur: 0 },
      ], poses: [
        { slot: 0, eye: [-1234, 2210, 1600], look: [120, -85, 30], fov: 600 },
      ] })`) !== true) fail('cp arm: setCutPlan refused the author plan');
    const cpExpected = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.getCutPlan()))');

    // pb path: encode with the player OPEN (livePlan reads pb.plan)
    const urlOpen = await chrome.eval('__share.encode()');
    if (!/#r=[A-Za-z0-9_-]+&cp=[A-Za-z0-9_-]+$/.test(urlOpen)) {
      fail('cp arm: open-player link carries no &cp=: ' + urlOpen);
    }
    // latch path: close the player (camLatch), encode again
    await chrome.eval('window.__playback.close()');
    await sleep(400);
    const url1 = await chrome.eval('__share.encode()');
    if (!/#r=[A-Za-z0-9_-]+&cp=[A-Za-z0-9_-]+$/.test(url1)) {
      fail('cp arm: latched link carries no &cp=: ' + url1);
    }
    console.log(`[e2e-share] cp link for the 2-shot game + 4-cut/1-pose `
      + `plan: ${url1.length} chars (planless: ${url0.length})`);

    // (c) node-side round trip through the COMMITTED dist codec
    const blob = /&cp=([A-Za-z0-9_-]+)$/.exec(url1)[1];
    const nodePlan = await decodeCameraPlan(blob, 2);
    if (canon(nodePlan) !== canon(cpExpected)) {
      fail('cp arm (c): node decode does not byte-match the DVR model: '
        + canon(nodePlan) + ' vs ' + canon(cpExpected));
    }

    // (d) honest-degrade notice RED/GREEN via the envelope knob: with the
    // envelope shrunk the plan must DROP (no &cp=) and the pressed Share
    // button must SAY so; restored, the same plan rides and the toast is
    // the plain register (pre-302 code shows the plain toast in both
    // directions — the red).
    await chrome.eval('__share.envelope(100)');
    const urlDrop = await chrome.eval('__share.encode()');
    if (/&cp=/.test(urlDrop)) fail('cp arm (d): over-envelope plan not dropped');
    if (await chrome.eval('__share.planDropped()') !== true) {
      fail('cp arm (d): planDropped latch did not set');
    }
    await chrome.eval(`document.getElementById('ob-share').click()`);
    await sleep(600);
    const toastDrop = await chrome.eval(
      `document.getElementById('ob-share-toast').textContent`);
    if (toastDrop !== enMsgs['share.copiedNoPlan']
      && toastDrop !== enMsgs['share.inAddressBarNoPlan']) {
      fail('cp arm (d) RED: dropped-plan toast is not the honest notice: "'
        + toastDrop + '"');
    }
    await chrome.eval(`__share.envelope(${8192})`);
    await chrome.eval(`document.getElementById('ob-share').click()`);
    await sleep(600);
    const toastOk = await chrome.eval(
      `document.getElementById('ob-share-toast').textContent`);
    if (toastOk !== enMsgs['share.copied']
      && toastOk !== enMsgs['share.inAddressBar']) {
      fail('cp arm (d) GREEN: plan-carrying toast is not the plain register: "'
        + toastOk + '"');
    }
    if (await chrome.eval('__share.planDropped()') !== false) {
      fail('cp arm (d): planDropped latch did not clear');
    }
    // the pressed-share URL landed in location — strip it for the next leg.
    // GH-709: the clipboard-refused Share above also stamped THIS tab's
    // own-tab marker (sessionStorage 'ob-share-own' = the link's r=); the
    // link lane below drives a RECIPIENT boot in the same tab, so drop the
    // marker too — a tab that minted the link would (lawfully) boot its
    // live table instead of replaying it.
    await chrome.eval(`history.replaceState(null, '', location.href.split('#')[0])`);
    await chrome.eval(`sessionStorage.removeItem('ob-share-own')`);

    // ---- link lane: the full link replays; the plan then seeds the DVR
    // player of THE SESSION IT DESCRIBES (content-addressed). Shared-
    // replay passes are never archived (ARCHIVE-PHASE-A law), so the
    // matching session is the AUTHOR's ORIGINAL one — it persists in
    // IndexedDB across the navigation while the in-memory camLatch (which
    // held the plan) dies with the page: exactly the plan-restore story.
    await bootCp(url1.slice(url1.indexOf('#')));
    const repC = await waitReplayDone();
    if (!(repC.plan && repC.plan.cuts === 4 && repC.plan.poses === 1)) {
      fail('cp arm (c): decoded plan not held by the replay: '
        + JSON.stringify(repC.plan));
    }
    // cp never touches physics: the re-simulated records byte-match
    const cpReplays = await chrome.eval('__share.records()');
    cpReplays.forEach((r, i) => {
      if (r !== cpOriginals[i]) {
        fail(`cp arm (c): record ${i} does not byte-match under &cp=`);
      }
    });
    // the replay pass itself never archives (the Phase-A law holds)
    if (await chrome.eval('window.__archive.current()') !== null) {
      fail('cp arm (c): the shared-replay pass was archived (Phase-A law)');
    }
    if (await chrome.eval(`window.__playback.openSession(${sid})`) !== true) {
      fail('cp arm (c): the author\'s original session failed to open');
    }
    for (let i = 0; i < 50
      && !(await chrome.eval('window.__playback.playerOpen()')); i++) {
      await sleep(200);
    }
    const cpDecodedModel = await chrome.eval(
      'JSON.parse(JSON.stringify(window.__playback.getCutPlan()))');
    if (canon(cpDecodedModel) !== canon(cpExpected)) {
      fail('cp arm (c): reopened DVR plan does not byte-match the author\'s: '
        + canon(cpDecodedModel));
    }
    console.log('[e2e-share] CP ROUND-TRIP ARM: PASS (author DVR plan → '
      + '&cp= link → replay → content-matched DVR session adopts the plan '
      + 'byte-equal; records byte-match; planless link byte-shaped like '
      + 'today\'s)');
    await chrome.eval('window.__playback.close()');
    await sleep(300);

    // ---- (b) malformed / truncated / future-version cp: plan ignored,
    // ONE warn, the replay STILL plays, no user-facing error
    const rHash = /#r=[A-Za-z0-9_-]+/.exec(url1)[0];
    const futureBlob = await encodeWire([2, [], []]);
    for (const [tag, bad] of [
      ['garbage', 'AAAA'],
      ['truncated', blob.slice(0, 16)],
      ['future-version', futureBlob]]) {
      const warns0 = cpWarns.length;
      await bootCp(`${rHash}&cp=${bad}`);
      const rep = await waitReplayDone();
      if (rep.plan !== null) {
        fail(`cp arm (b) [${tag}]: malformed plan was not ignored`);
      }
      if (await chrome.eval('__share.cameraPlan()') !== null) {
        fail(`cp arm (b) [${tag}]: cameraPlan seam leaked a malformed plan`);
      }
      if (!(cpWarns.length > warns0)) {
        fail(`cp arm (b) [${tag}]: no console warn for the ignored plan`);
      }
      const toast = await chrome.eval(
        `document.getElementById('ob-share-toast')?.textContent ?? ''`);
      if (/[Bb]ad replay link/.test(toast)) {
        fail(`cp arm (b) [${tag}]: user-facing error over a presentation blob`);
      }
    }
    console.log('[e2e-share] CP MALFORMED ARM: PASS (garbage/truncated/'
      + 'future-version ignored with a warn; replay played to done)');

    // ---- unknown cam id INSIDE a valid cp: rides the wire untouched,
    // degrades at APPLY time (#301 §1.4 — broadcast), never a throw
    const unkBlob = await encodeCameraPlan({ cuts: [
      { seg: 0, t: 0, cam: 6, transitionIn: 0, dur: 0 }], poses: [] }, 2);
    await bootCp(`${rHash}&cp=${unkBlob}`);
    await waitReplayDone();
    await chrome.eval(`window.__playback.openSession(${sid})`);
    for (let i = 0; i < 50
      && !(await chrome.eval('window.__playback.playerOpen()')); i++) {
      await sleep(200);
    }
    const unk = await chrome.eval(`(() => ({
      cam: window.__playback.getCutPlan()?.cuts?.[0]?.cam,
      eff: window.__playback.state()?.cams?.[0] }))()`);
    if (!(unk.cam === 6 && unk.eff === 'broadcast')) {
      fail('cp arm: unknown cam id did not apply-degrade to broadcast: '
        + JSON.stringify(unk));
    }
    console.log('[e2e-share] CP UNKNOWN-ID ARM: PASS (cam 6 kept in the '
      + 'model, broadcast at apply)');
    await chrome.eval('window.__playback.close()');
    await sleep(300);
  }

  // ---- error gates
  const appErrors = await chrome.eval('__test.errors');
  if (appErrors.length) fail('app-captured errors: ' + appErrors.join(' | '));
  if (consoleErrors.length) fail('console errors: ' + consoleErrors.join(' | '));
  if (!process.exitCode) console.log('E2E-SHARE PASS');
} catch (e) {
  fail(e.stack ?? e);
} finally {
  chrome.close();
  await stopStaticServer(server);
}
