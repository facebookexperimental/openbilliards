// Copyright (c) Meta Platforms, Inc. and affiliates.

// share.test.ts — replay-share codec: exact round-trip (doubles preserved
// bit-for-bit, so re-simulation byte-matches), URL-size budget, version
// gates, malformed-input rejection, the codec-v4 game axis, and the
// pinned pre-feature legacy corpus (feature 011 guarantees G1-G3 +
// adjudication byte-parity; web/tools/fixtures/legacy-links.json).

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CAMERA_PLAN_WIRE_VERSION, GAME_VARIANTS, MAX_RACK_SEED,
  PRESET_TO_CUSHION_MODEL, RULES_CATALOG_VERSION, SHARE_FORMAT_VERSION,
  SHARE_URL_ENVELOPE, ShareError,
  decodeCameraPlan, decodeShare, defaultVariantFor, encodeCameraPlan,
  encodeShare, kernelGate,
  type CameraPlan, type CameraPlanCut, type FreePlacement, type SharedGame,
  type ShotAnnotation,
} from '../src/share.js';
import {
  CATALOG, DEFAULT_EQUIPMENT, EQUIPMENT_AXES, type EquipmentAxis,
} from '../src/catalog.js';
import type { EquipmentIds } from '../src/types.js';
import {
  deriveOnTable, judgeShot, nineballRuleset, type NineBallJudgment,
} from '../src/rules/index.js';
import type { ShotRecord } from '../src/record.js';
import { engine } from './helpers.js';

/** Deterministic worst-case shots: full-precision doubles in every field. */
function randomShots(n: number): SharedGame['shots'] {
  let s = 42;
  const rnd = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  return Array.from({ length: n }, () => ({
    v0: 0.5 + rnd() * 14,
    phi: rnd() * 2 * Math.PI,
    theta: rnd() * 1.2,
    a: (rnd() - 0.5) * 0.6,
    b: (rnd() - 0.5) * 0.6,
  }));
}

function game(n: number): SharedGame {
  return {
    kernelVersion: 'pool-core 0.1.0+abc1234',
    formatV: SHARE_FORMAT_VERSION,
    rackKind: 'nine',
    seed: 1234567,
    equipment: {
      ...DEFAULT_EQUIPMENT, cushion_model_id: 'stronge_realistic',
    },
    shots: randomShots(n),
    placements: n > 3 ? { 3: { x: 0.123456789012345, y: -0.87654321 } } : {},
    game: 'nine_ball',
    calls: [],
    variant: 'wpa-9ball', // codec v5: explicit family default (022)
    moves: [],            // codec v6: playground axes (issue #68)
    mode: 'play',
    breaker: 1,           // codec v7: first-rack breaker seat (GH-448)
  };
}

test('review P2 (#168): share validation resolves the EQUIPPED cue — a '
  + 'masse_trick share with a contact-0.55R shot round-trips; the same '
  + 'shot on the default cue still rejects (no blanket loosening)', async () => {
  // Commanded draw whose CONTACT offset is 0.55R on the (shared) nickel
  // tip: inside the masse_trick 0.58R cap, past the default 0.5R cap.
  const trick = CATALOG.cues.find((c) => c.id === 'masse_trick')!;
  const ballR = CATALOG.ballsets.find(
    (b) => b.id === DEFAULT_EQUIPMENT.ballset_id)!.params.r;
  const cmd055 = 0.55 * (1 + trick.params.tip_radius / ballR);
  const trickShot = { v0: 2, phi: Math.PI / 2, theta: 0, a: 0, b: -cmd055 };

  const trickGame: SharedGame = {
    ...game(2),
    equipment: { ...DEFAULT_EQUIPMENT, cue_id: 'masse_trick' },
    shots: [...randomShots(1), trickShot],
  };
  const dec = await decodeShare(await encodeShare(trickGame));
  assert.deepEqual(dec, trickGame, 'trick-cue share must round-trip exactly');
  assert.equal(dec.shots[1]!.b, -cmd055);

  // Identical shot list under the DEFAULT cue: encode must reject, naming
  // the offending shot (the per-cue cap did not loosen the default
  // envelope).
  const defaultGame: SharedGame = { ...trickGame, equipment: { ...DEFAULT_EQUIPMENT } };
  await assert.rejects(encodeShare(defaultGame), (e: Error) => {
    assert.ok(e instanceof ShareError, String(e));
    assert.match(e.message, /shot 1: .*miscue/);
    return true;
  });

  // Decode side (validateGame is shared, but prove it on the wire too):
  // take the VALID trick wire and splice the default cue id into its
  // equipment tuple — the decoder must now reject the same shot.
  const b64 = await encodeShare(trickGame);
  const ds = new DecompressionStream('deflate-raw');
  const wireJson = await new Response(new Blob(
    [Buffer.from(b64, 'base64url')]).stream().pipeThrough(ds)).text();
  assert.ok(wireJson.includes('"masse_trick"'), 'wire carries the cue id');
  const tampered = await encodeWire(
    JSON.parse(wireJson.replace('"masse_trick"', '"standard"')) as unknown[]);
  await assert.rejects(decodeShare(tampered), (e: Error) => {
    assert.ok(e instanceof ShareError, String(e));
    assert.match(e.message, /shot 1: .*miscue/);
    return true;
  });
});

/** A valid v4 8-ball game exercising every calls-axis kind. */
function eightBallGame(n = 4): SharedGame {
  return {
    ...game(n),
    rackKind: 'fifteen',
    game: 'eight_ball',
    variant: 'wpa-8ball',
    calls: [
      { shotIndex: 0, kind: 'decision', decision: 1, choice: 1 }, // dry break: accept
      { shotIndex: 1, kind: 'call', ball: 3, pocket: 2 },
      { shotIndex: 2, kind: 'safety' },
      { shotIndex: 3, kind: 'call', ball: 11, pocket: 5 },
    ],
  };
}

test('025: straight_pool round-trips with a break-violation decision, '
  + 'calls, safety, and a kitchen placement (re-racks NEVER on the wire)', async () => {
  const g: SharedGame = {
    ...game(5),
    rackKind: 'fifteen',
    game: 'straight_pool',
    variant: 'wpa-14-1',
    placements: { 1: { x: 0.1, y: -0.9 } }, // kitchen in-hand after 3.1
    calls: [
      // the opening-break violation option (decision 11, feature 025)
      { shotIndex: 0, kind: 'decision', decision: 11, choice: 2 },
      { shotIndex: 1, kind: 'call', ball: 3, pocket: 2 },
      { shotIndex: 2, kind: 'safety' },
      { shotIndex: 3, kind: 'call', ball: 14, pocket: 5 },
      // NOTE deliberately no re-rack annotation exists: partial/full
      // re-racks are judgment-derived and RE-DERIVED on replay
      { shotIndex: 4, kind: 'decision', decision: 11, choice: 1 },
    ],
  };
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  assert.equal(dec.variant, defaultVariantFor('straight_pool'));
});

test('share codec round-trips a game exactly (bit-exact doubles)', async () => {
  const g = game(12);
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  // paranoia: doubles must be IDENTICAL, not just close (byte-match relies on it)
  dec.shots.forEach((s, i) => {
    assert.equal(s.phi, g.shots[i]!.phi);
    assert.equal(s.v0, g.shots[i]!.v0);
  });
});

test('URL budget: 20 worst-case shots < 2KB, sizes logged', async () => {
  for (const n of [10, 20]) {
    const url = `https://example.com/app.html#r=${await encodeShare(game(n))}`;
    console.log(`share URL size for ${n}-shot game: ${url.length} chars`);
    if (n === 20) assert.ok(url.length < 2048, `20-shot URL ${url.length} >= 2048`);
  }
});

test('share string is URL-safe (base64url charset, no escaping needed)', async () => {
  const text = await encodeShare(game(20));
  assert.match(text, /^[A-Za-z0-9_-]+$/);
  assert.equal(encodeURIComponent(text), text);
});

/** Hand-build a share string from a raw wire tuple, the encoder's way. */
async function encodeWire(wire: unknown[]): Promise<string> {
  const cs = new CompressionStream('deflate-raw');
  const deflated = new Uint8Array(await new Response(
    new Blob([new TextEncoder().encode(JSON.stringify(wire))]).stream()
      .pipeThrough(cs)).arrayBuffer());
  return Buffer.from(deflated).toString('base64url');
}

test('format version gate: foreign version → clear ShareError', async () => {
  const b64 = await encodeWire(
    [99, 'kv', 'nine', 1, 'default', [[1, 0, 0, 0, 0]], []]);
  await assert.rejects(decodeShare(b64), (e: Error) => {
    assert.ok(e instanceof ShareError);
    assert.match(e.message, /format v99/);
    return true;
  });
});

test('format version gate wins over the arity check (future longer tuple)', async () => {
  // a hypothetical v8 wire with an EXTRA element: the user must see the
  // actionable version message, not the generic wrong-shape one (rule 5:
  // future-version gating unchanged by the v7 bump)
  const b64 = await encodeWire(
    [8, 'kv', 'nine', 1, ['a', 'b', 'c', 'd', 'e'], [[1, 0, 0, 0, 0]], [],
      'nine_ball', [], 'wpa-9ball', [], 0, 1, { extra: 1 }]);
  await assert.rejects(decodeShare(b64), (e: Error) => {
    assert.ok(e instanceof ShareError);
    assert.match(e.message, /format v8/);
    assert.match(e.message, /re-share/);
    return true;
  });
});

test('v1 shares decode with preset mapped into the equipment spec', async () => {
  // every v1 share predates cloth selection — default cloth, and the v1
  // options preset IS the cushion-model axis
  const b64 = await encodeWire(
    [1, 'kv', 'nine', 7, 'realistic', [[1, 0.5, 0, 0, 0.1]], [[0, 0.1, -0.2]]]);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 1);
  assert.deepEqual(dec.equipment,
    { ...DEFAULT_EQUIPMENT, cushion_model_id: 'stronge_realistic' });
  assert.equal(dec.seed, 7);
  assert.deepEqual(dec.placements, { 0: { x: 0.1, y: -0.2 } });
  // decode rule 2: legacy links normalize to nine_ball with no calls
  assert.equal(dec.game, 'nine_ball');
  assert.deepEqual(dec.calls, []);
  // 022 decode rule 1: pre-v5 links resolve to the game's default preset
  assert.equal(dec.variant, 'wpa-9ball');
});

test('v2 shares decode with preset+cloth mapped into the equipment spec', async () => {
  const b64 = await encodeWire([2, 'kv', 'nine', 9, 'grip-fitted', 'worn_slow',
    [[1, 0.5, 0, 0, 0.1]], []]);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 2);
  assert.deepEqual(dec.equipment, {
    ...DEFAULT_EQUIPMENT, cloth_id: 'worn_slow', cushion_model_id: 'grip_fitted',
  });
  assert.equal(dec.game, 'nine_ball');
  assert.deepEqual(dec.calls, []);
  assert.equal(dec.variant, 'wpa-9ball'); // 022 decode rule 1
  // the v2 'default' cloth IS the 860-class catalog entry
  const dflt = await decodeShare(await encodeWire(
    [2, 'kv', 'nine', 9, 'default', 'default', [[1, 0.5, 0, 0, 0.1]], []]));
  assert.deepEqual(dflt.equipment,
    { ...DEFAULT_EQUIPMENT, cushion_model_id: 'han2005_default' });
  assert.equal(dflt.game, 'nine_ball');
  // unknown legacy preset/cloth ids still rejected
  await assert.rejects(decodeShare(await encodeWire(
    [2, 'kv', 'nine', 9, 'warp', 'default', [[1, 0.5, 0, 0, 0.1]], []])),
    /unknown options preset/);
  await assert.rejects(decodeShare(await encodeWire(
    [2, 'kv', 'nine', 9, 'default', 'velvet', [[1, 0.5, 0, 0, 0.1]], []])),
    /unknown cloth preset/);
});

test('arity is gated per format version', async () => {
  // v2 wire missing the cloth element → wrong shape
  await assert.rejects(decodeShare(await encodeWire(
    [2, 'kv', 'nine', 1, 'default', [[1, 0, 0, 0, 0]], []])),
    /wrong shape/);
  // v1 wire with a smuggled cloth element → wrong shape
  await assert.rejects(decodeShare(await encodeWire(
    [1, 'kv', 'nine', 1, 'default', 'worn_slow', [[1, 0, 0, 0, 0]], []])),
    /wrong shape/);
  // v3 wire with a smuggled sixth element → wrong shape
  await assert.rejects(decodeShare(await encodeWire(
    [3, 'kv', 'nine', 1, ['wpa_generic_9ft', 'simonis_860_tournament',
      'aramith_pool', 'standard', 'han2005_default'], 'stray',
      [[1, 0, 0, 0, 0]], []])),
    /wrong shape/);
  // v3 equipment tuple must have exactly five ids
  await assert.rejects(decodeShare(await encodeWire(
    [3, 'kv', 'nine', 1, ['wpa_generic_9ft'], [[1, 0, 0, 0, 0]], []])),
    /wrong shape/);
});

test('kernel gate: mismatch is not fatal, message offers context', () => {
  const g = game(1);
  assert.equal(kernelGate(g, g.kernelVersion).ok, true);
  const gate = kernelGate(g, 'pool-core 0.2.0+zzz');
  assert.equal(gate.ok, false);
  assert.match(gate.message!, /0\.1\.0\+abc1234/);
  assert.match(gate.message!, /0\.2\.0\+zzz/);
});

test('malformed inputs rejected with ShareError', async () => {
  await assert.rejects(decodeShare('not base64url!!'), ShareError);
  await assert.rejects(decodeShare('AAAAAAAA'), ShareError); // junk deflate
  await assert.rejects(encodeShare({ ...game(1), shots: [] }), ShareError);
  await assert.rejects(
    encodeShare({ ...game(1), rackKind: 'ten' as 'nine' }), ShareError);
  await assert.rejects(
    encodeShare({ ...game(1), seed: -3 }), /integer in \[0, 2\^31\]/);
  await assert.rejects( // above the consumer's clamp domain (game.js rerack)
    encodeShare({ ...game(1), seed: MAX_RACK_SEED + 1 }),
    /integer in \[0, 2\^31\]/);
  assert.equal( // the bound itself is inside the domain
    (await decodeShare(await encodeShare({ ...game(1), seed: MAX_RACK_SEED })))
      .seed, MAX_RACK_SEED);
  await assert.rejects( // kernel strike rules enforced per shot
    encodeShare({ ...game(1), shots: [{ v0: 99, phi: 0, theta: 0, a: 0, b: 0 }] }),
    /shot 0/);
  await assert.rejects( // placement key out of range
    encodeShare({ ...game(1), placements: { 5: { x: 0, y: 0 } } }), ShareError);
});

test('every catalog id encodes on its axis; unknown ids rejected', async () => {
  for (const axis of Object.keys(EQUIPMENT_AXES) as EquipmentAxis[]) {
    for (const entry of CATALOG[EQUIPMENT_AXES[axis]]) {
      const equipment: EquipmentIds = { ...DEFAULT_EQUIPMENT, [axis]: entry.id };
      const dec = await decodeShare(await encodeShare({ ...game(1), equipment }));
      assert.deepEqual(dec.equipment, equipment, `${axis}=${entry.id}`);
    }
    await assert.rejects(
      encodeShare({ ...game(1),
        equipment: { ...DEFAULT_EQUIPMENT, [axis]: 'trampoline' } }),
      /unknown equipment/);
  }
});

test('legacy preset map covers exactly the v1/v2 preset ids', () => {
  assert.deepEqual(Object.keys(PRESET_TO_CUSHION_MODEL).sort(),
    ['default', 'grip-fitted', 'mathavan-fitted', 'realistic'].sort());
  for (const id of Object.values(PRESET_TO_CUSHION_MODEL)) {
    assert.ok(CATALOG.cushion_models.some((e) => e.id === id), id);
  }
});

// ---- codec v4: game axis (contracts/share-codec-v4.md) ----------------------

test('v4 G3: an 8-ball game with calls/decisions round-trips deep-equal', async () => {
  const g = eightBallGame();
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  // the calls axis rides tuples [shotIndex, kind, a, b]; the current wire
  // is v7 (GH-448 breaker seat appended — the v4 layout itself stays frozen)
  assert.equal(SHARE_FORMAT_VERSION, 7);
});

test('v7 encode defaults: pre-v7 callers get nine_ball + default variant '
  + '+ empty playground axes + breaker seat 1', async () => {
  // transition seam: a stale web/app/share.js encoding without the game
  // axis / variant slot / playground axes / breaker seat — semantics
  // identical to a legacy link
  const legacyShape = { ...game(2) } as Partial<SharedGame>;
  delete legacyShape.game;
  delete legacyShape.calls;
  delete legacyShape.variant;
  delete legacyShape.moves;
  delete legacyShape.mode;
  delete legacyShape.breaker;
  const dec = await decodeShare(await encodeShare(legacyShape as SharedGame));
  assert.equal(dec.formatV, 7);
  assert.equal(dec.game, 'nine_ball');
  assert.deepEqual(dec.calls, []);
  assert.equal(dec.variant, 'wpa-9ball'); // explicit default id written
  assert.deepEqual(dec.moves, []);        // v6: empty axis, judged play
  assert.equal(dec.mode, 'play');
  assert.equal(dec.breaker, 1);           // v7: seat 1 written explicitly
});

test('v3 wires decode as nine_ball with no calls', async () => {
  const b64 = await encodeWire(
    [3, 'kv', 'nine', 12, ['wpa_generic_9ft', 'simonis_860_tournament',
      'aramith_pool', 'standard', 'han2005_default'],
    [[1, 0.5, 0, 0, 0.1]], [[0, 0.1, -0.2]]]);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 3);
  assert.equal(dec.game, 'nine_ball');
  assert.deepEqual(dec.calls, []);
  assert.equal(dec.variant, 'wpa-9ball'); // 022 decode rule 1
  assert.equal(dec.equipment.table_id, 'wpa_generic_9ft');
});

test('v4 validation: game axis is gated (rule 4)', async () => {
  // unknown game id
  await assert.rejects(encodeShare(
    { ...game(1), game: 'crokinole' as SharedGame['game'] }), /unknown game/);
  // readiness-or-unknown entries never ride the wire (playable-only)
  await assert.rejects(encodeShare(
    { ...game(1), game: 'snooker' as SharedGame['game'] }), ShareError);
  // rack-kind cross-check against the game's rack template
  await assert.rejects(encodeShare(
    { ...eightBallGame(), rackKind: 'nine' }), /rack kind/);
  await assert.rejects(encodeShare(
    { ...game(1), rackKind: 'fifteen' }), /rack kind/);
  // nine_ball carries no calls
  await assert.rejects(encodeShare({
    ...game(2),
    calls: [{ shotIndex: 0, kind: 'safety' }] as ShotAnnotation[],
  }), /nine_ball shares carry no calls/);
});

test('v4 validation: calls-axis domains and ordering', async () => {
  const base = eightBallGame();
  const withCalls = (calls: ShotAnnotation[]): SharedGame =>
    ({ ...base, calls });
  // shot index out of range
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 4, kind: 'safety' }])), /out of range/);
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: -1, kind: 'safety' }])), /out of range/);
  // sort order enforced (G3 identity: encode never reorders)
  await assert.rejects(encodeShare(withCalls([
    { shotIndex: 2, kind: 'safety' },
    { shotIndex: 1, kind: 'call', ball: 3, pocket: 2 },
  ])), /sorted/);
  // ball / pocket domains
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'call', ball: 0, pocket: 2 }])), /ball id/);
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'call', ball: 16, pocket: 2 }])), /ball id/);
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'call', ball: 3, pocket: 6 }])), /pocket index/);
  // decision/choice enums (v4-frozen; 6-10 are the feature-012 additive
  // appendices, 11 the feature-025 one, 12/13 the feature-026 ones,
  // 14-16 the GH-371 recorded-request ones, 17 the GH-382 one and
  // 18-23 the GH-491 heyball ones, so the first UNKNOWN id is 24)
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'decision', decision: 24, choice: 1 }])),
    /unknown decision/);
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'decision', decision: 1, choice: 4 }])),
    /choice/);
  await assert.rejects(encodeShare(withCalls(
    [{ shotIndex: 0, kind: 'decision', decision: 5, choice: 2 }])),
    /choice/);
  // every legal decision/choice pair encodes
  for (const [decision, max] of [[1, 3], [2, 2], [3, 2], [4, 2], [5, 1]]) {
    for (let choice = 1; choice <= max!; choice++) {
      const dec = await decodeShare(await encodeShare(withCalls(
        [{ shotIndex: 0, kind: 'decision', decision: decision!, choice }])));
      assert.deepEqual(dec.calls,
        [{ shotIndex: 0, kind: 'decision', decision, choice }]);
    }
  }
});

test('GH-491 (review r2): heyball calls axis carries decisions ONLY — '
  + 'shot-call kinds are refused (WPA Heyball II.11)', async () => {
  const heyball = (calls: ShotAnnotation[]): SharedGame => ({
    ...game(4),
    rackKind: 'fifteen',
    game: 'heyball',
    variant: 'wpa-heyball',
    calls,
  });
  // the II.6 option matrices replay through the axis (the fresh-consumer
  // opt-in — review r7 P1: decode of a heyball payload needs the caller's
  // explicit acceptGames declaration)
  const dec = await decodeShare(await encodeShare(heyball(
    [{ shotIndex: 0, kind: 'decision', decision: 18, choice: 1 }])),
    { acceptGames: ['heyball'] });
  assert.deepEqual(dec.calls,
    [{ shotIndex: 0, kind: 'decision', decision: 18, choice: 1 }]);
  // review r7 P1: a STALE consumer (the pre-GH-491 call shape, no opts)
  // must never receive a heyball payload it cannot replay — refusal
  // names the cure. Non-heyball links stay opt-in-free (the old shape
  // keeps decoding every pre-491 game).
  await assert.rejects(decodeShare(await encodeShare(heyball([]))),
    /predate the discipline/);
  const nine = await decodeShare(await encodeShare(game(2)));
  assert.equal(nine.game, 'nine_ball');
  // flow judges every heyball shot with a NULL call — a link carrying a
  // shot call would replay differently than the codec accepted
  await assert.rejects(encodeShare(heyball(
    [{ shotIndex: 1, kind: 'call', ball: 3, pocket: 2 }])),
    /heyball carries no shot calls/);
  await assert.rejects(encodeShare(heyball(
    [{ shotIndex: 2, kind: 'safety' }])),
    /heyball carries no shot calls/);
  await assert.rejects(encodeShare(heyball(
    [{ shotIndex: 1, kind: 'nominate', ball: 16 }])),
    /heyball carries no shot calls/);
  // review r5 P2: the decision FAMILY is ruleset-isolated both ways —
  // flow resolves recorded decisions through per-family id maps, so a
  // cross-family id encodes an unreplayable link (the decision-17
  // variant-gate precedent). Heyball links carry ONLY 18-23; 18-23
  // ride ONLY heyball links.
  await assert.rejects(encodeShare(heyball(
    [{ shotIndex: 0, kind: 'decision', decision: 1, choice: 1 }])),
    /does not belong/);
  const eight = eightBallGame();
  await assert.rejects(encodeShare({ ...eight, calls:
    [{ shotIndex: 0, kind: 'decision', decision: 18, choice: 1 }] }),
    /does not belong/);
  await assert.rejects(encodeShare({ ...eight, calls:
    [{ shotIndex: 0, kind: 'decision', decision: 23, choice: 1 }] }),
    /does not belong/);
});

test('v4 wire-level rejection: arity, tuple shape, safety payload', async () => {
  const ids = ['wpa_generic_9ft', 'simonis_860_tournament', 'aramith_pool',
    'standard', 'han2005_default'];
  // v4 wire missing the calls element → wrong shape (arity by version)
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'nine', 1, ids, [[1, 0, 0, 0, 0]], [], 'nine_ball'])),
    /wrong shape/);
  // v3 wire with a smuggled game axis → wrong shape
  await assert.rejects(decodeShare(await encodeWire(
    [3, 'kv', 'nine', 1, ids, [[1, 0, 0, 0, 0]], [], 'nine_ball', []])),
    /wrong shape/);
  // call tuple of the wrong arity
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 0, 3]]])), /wrong shape/);
  // unknown call kind (3 became `nominate` in feature 012, 4 became
  // `push` in feature 026 — additive; the first UNKNOWN wire kind is 5)
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 5, 0, 0]]])), /unknown kind/);
  // a kind-4 push on a NON-ten_ball game rejects on the game gate
  // (feature 026 — WPA 6.4 is a 10-ball input)
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 4, 0, 0]]])), /push out is a ten_ball input/);
  // push tuples are pinned to a=0, b=0 (rejects before the game gate)
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 4, 1, 0]]])), /push tuple must carry a=0, b=0/);
  // a kind-3 nominate with a non-colour ball id rejects on the domain
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 3, 0, 0]]])), /16\.\.21/);
  // safety tuples are pinned to a=0, b=0
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 1, 2, 0]]])), /safety/);
});

// ---- the pinned pre-feature legacy corpus (SC-003; G1/G2) --------------------

type NormalizedAxis =
  'game' | 'calls' | 'variant' | 'moves' | 'mode' | 'breaker';
interface CorpusEntry {
  name: string;
  formatV: number;
  share: string;
  // pre-v7 pins carry none of the normalized axes; a formatV-7 pin (#789)
  // carries them all
  decoded: Omit<SharedGame, NormalizedAxis> &
    Partial<Pick<SharedGame, NormalizedAxis>>;
  scenarios: string[];
  record_sha256: string[];
  adjudications: NineBallJudgment[];
}
interface Corpus {
  kernel_version: string;
  share_format_version_at_capture: number;
  entries: CorpusEntry[];
}

const CORPUS: Corpus = JSON.parse(readFileSync(new URL(
  '../../../../web/tools/fixtures/legacy-links.json', import.meta.url),
  'utf8')) as Corpus;

test('corpus sanity: pinned pre-feature, all legacy versions covered', () => {
  assert.equal(CORPUS.share_format_version_at_capture, 3);
  assert.ok(CORPUS.entries.length >= 5);
  // #789: one build-18 record (formatV 7) pins a retired table id
  assert.deepEqual([...new Set(CORPUS.entries.map((e) => e.formatV))].sort(),
    [1, 2, 3, 7]);
});

test('G1 decode identity: every legacy string decodes field-identical ' +
  '+ game:nine_ball, calls:[], variant:default, moves:[], mode:play, ' +
  'breaker:1', async () => {
  for (const entry of CORPUS.entries) {
    const dec = await decodeShare(entry.share);
    assert.deepEqual(dec,
      // 022 decode rule 1: the variant axis normalizes exactly like the
      // v4 game axis did — pre-022 links resolve to the default preset;
      // the v6 playground axes normalize the same way (empty, judged),
      // and the v7 breaker seat fills 1 (the fresh-boot fold seat); the
      // fills precede the spread so a formatV-7 entry (#789) is judged on
      // the axes its own wire carries, never overwritten
      { game: 'nine_ball', calls: [], variant: 'wpa-9ball', moves: [],
        mode: 'play', breaker: 1, ...entry.decoded },
      entry.name);
  }
});

test('G2 re-simulation byte-identity + adjudication parity on the ' +
  'canonical wasm', async () => {
  const eng = await engine();
  assert.equal(eng.version(), CORPUS.kernel_version); // zero-kernel premise
  for (const entry of CORPUS.entries) {
    for (let i = 0; i < entry.scenarios.length; i++) {
      const record = JSON.parse(eng.simulateJson(entry.scenarios[i]!)) as ShotRecord;
      // the corpus pins the APP's record surface (web/app/share.js logs
      // JSON.stringify(parsedRecord) — the same strings the e2e-share
      // legacy arm compares), so byte-identity is asserted over that
      // ECMAScript-normalized serialization of the kernel record
      const hash = createHash('sha256')
        .update(JSON.stringify(record), 'utf8').digest('hex');
      assert.equal(hash, entry.record_sha256[i], `${entry.name} shot ${i}`);
      const judgment = judgeShot(
        { onTable: deriveOnTable(record) }, record);
      assert.deepEqual(judgment, entry.adjudications[i],
        `${entry.name} shot ${i} adjudication`);
    }
  }
});

test('nineball-v1 wrapper maps the pinned corpus verdicts 1:1', async () => {
  const eng = await engine();
  for (const entry of CORPUS.entries) {
    for (let i = 0; i < entry.scenarios.length; i++) {
      const record = JSON.parse(eng.simulateJson(entry.scenarios[i]!)) as ShotRecord;
      const pinned = entry.adjudications[i]!;
      const j = nineballRuleset.judge(
        { shooter: 1, onTable: deriveOnTable(record), result: null },
        record, null);
      assert.equal(j.legal, pinned.legal, `${entry.name} shot ${i}`);
      assert.deepEqual(j.fouls.map((f) => f.code), pinned.fouls);
      assert.deepEqual(j.pocketed, pinned.pocketed);
      assert.equal(j.ballInHand,
        pinned.ballInHand ? 'anywhere' : 'none');
      assert.deepEqual(j.respot, pinned.respotNine ? [9] : []);
      assert.equal(j.terminal !== null, pinned.gameOver);
      for (const f of j.fouls) assert.match(f.cite, /^WPA 3\.[123]$/);
    }
  }
});

// ---- feature 012 (T018/T019): codec-v4 additive extensions + lineage --------

import { KERNEL_COMPAT_LINEAGE, lineageCompatible } from '../src/share.js';
import {
  CHINESE8_POCKETS_PRE_V21_STAMPS, CHINESE8_POCKET_TABLE_IDS, chinese8PocketsMoved,
} from '../src/share.js';

test('012: nominate (kind 3) + decisions 6-10 round-trip bit-exactly '
  + '(the v4 calls-axis layout is frozen; current wire is GH-448 v7)', async () => {
  assert.equal(SHARE_FORMAT_VERSION, 7, 'v7 = v6 + the breaker seat');
  const g: SharedGame = {
    ...game(7),
    rackKind: 'fifteen',
    game: 'eight_ball', // playable carrier for the codec-layer arms
    variant: 'wpa-8ball',
    calls: [
      { shotIndex: 0, kind: 'decision', decision: 6, choice: 1 },  // 1P break pocket
      { shotIndex: 1, kind: 'nominate', ball: 16 },                // yellow
      { shotIndex: 2, kind: 'decision', decision: 7, choice: 2 },  // play again
      { shotIndex: 3, kind: 'decision', decision: 8, choice: 1 },  // black toss
      { shotIndex: 4, kind: 'nominate', ball: 21 },                // black
      { shotIndex: 5, kind: 'decision', decision: 9, choice: 2 },  // stalemate lag
      { shotIndex: 6, kind: 'decision', decision: 10, choice: 1 }, // carom spot
    ],
  };
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
});

test('012: nominate validation — colour ids 16..21 only, b=0|1 enforced, '
  + 'decision 6-10 choice ranges gated', async () => {
  const base = {
    ...game(2), rackKind: 'fifteen' as const, game: 'eight_ball' as const,
    variant: 'wpa-8ball',
  };
  // nominate ball outside the colour range
  for (const ball of [0, 5, 15, 22]) {
    await assert.rejects(
      encodeShare({ ...base, calls: [{ shotIndex: 0, kind: 'nominate', ball }] }),
      /nominate ball id .* 16\.\.21/);
  }
  // decision 6-10 choices are 1..2
  for (const decision of [6, 7, 8, 9, 10]) {
    await assert.rejects(
      encodeShare({ ...base, calls: [
        { shotIndex: 0, kind: 'decision', decision, choice: 3 }] }),
      /choice 3 out of range/);
  }
  // decision 11 (feature 025 break_violation) carries 2 choices, and
  // 12/13 (feature 026 pushout_response/wrongful_pot) carry 2 each;
  // 14-16 (GH-371 spot_nearest/contact_respot) carry 1 each; 17
  // (GH-382 snooker foul_and_a_miss, renumbered past the GH-371
  // 14-16 allocations) carries 3 — the first unknown id is now 18
  await assert.rejects(
    encodeShare({ ...base, calls: [
      { shotIndex: 0, kind: 'decision', decision: 11, choice: 3 }] }),
    /choice 3 out of range/);
  for (const decision of [12, 13]) {
    await assert.rejects(
      encodeShare({ ...base, calls: [
        { shotIndex: 0, kind: 'decision', decision, choice: 3 }] }),
      /choice 3 out of range/);
  }
  for (const decision of [14, 15, 16]) {
    await assert.rejects(
      encodeShare({ ...base, calls: [
        { shotIndex: 0, kind: 'decision', decision, choice: 2 }] }),
      /choice 2 out of range/);
  }
  await assert.rejects(
    encodeShare({ ...base, calls: [
      { shotIndex: 0, kind: 'decision', decision: 17, choice: 4 }] }),
    /choice 4 out of range/);
  await assert.rejects(
    encodeShare({ ...base, calls: [
      { shotIndex: 0, kind: 'decision', decision: 24, choice: 1 }] }),
    /unknown decision 24/);
  // wire-level: nominate tuple must carry b=0|1 (GH-382: 1 = the
  // free-ball flag; anything else keeps the frozen v4 refusal)
  const ids = [DEFAULT_EQUIPMENT.table_id, DEFAULT_EQUIPMENT.cloth_id,
    DEFAULT_EQUIPMENT.ballset_id, DEFAULT_EQUIPMENT.cue_id,
    DEFAULT_EQUIPMENT.cushion_model_id];
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 3, 16, 5]]])), /nominate tuple must carry b=0\|1/);
  // wire-level: nominate ball domain also gated on decode
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'fifteen', 1, ids, [[1, 0, 0, 0, 0]], [], 'eight_ball',
      [[0, 3, 3, 0]]])), /16\.\.21/);
  // GH-382 (review r1 P2): the free-ball flag encodes only under the
  // completion preset — a default-alias session replays through
  // snooker-v1, which cannot judge it (no unreplayable links)
  const snookerBase = {
    ...game(2), rackKind: 'snooker' as const, game: 'snooker' as const,
    calls: [{ shotIndex: 0, kind: 'nominate', ball: 17,
      freeBall: true } as const],
  };
  await assert.rejects(
    encodeShare({ ...snookerBase, variant: 'wpbsa-snooker' }),
    /needs the wpbsa-snooker-full variant/);
  await assert.rejects(encodeShare({ ...snookerBase,
    variant: 'wpbsa-snooker-full',
    calls: [{ shotIndex: 0, kind: 'nominate', ball: 17,
      freeBall: 1 as unknown as true }] }),
    /freeBall must be true or omitted/);
  // explicit false breaks round-trip identity (b=0 decodes without the
  // property) — rejected (review r15)
  await assert.rejects(encodeShare({ ...snookerBase,
    variant: 'wpbsa-snooker-full',
    calls: [{ shotIndex: 0, kind: 'nominate', ball: 17,
      freeBall: false as unknown as true }] }),
    /freeBall must be true or omitted/);
  const fbLink = await encodeShare({ ...snookerBase,
    variant: 'wpbsa-snooker-full' });
  const fbBack = await decodeShare(fbLink);
  assert.deepEqual(fbBack.calls[0],
    { shotIndex: 0, kind: 'nominate', ball: 17, freeBall: true },
    'the free-ball nomination round-trips under the completion preset');
  // GH-382 (review r3): decision 17 is gated to the completion preset the
  // same way — a v1-alias session cannot apply it on replay
  await assert.rejects(encodeShare({ ...snookerBase,
    variant: 'wpbsa-snooker',
    calls: [{ shotIndex: 0, kind: 'decision', decision: 17, choice: 3 }] }),
    /decision 17 .*needs the wpbsa-snooker-full variant/);
  const d17 = await decodeShare(await encodeShare({ ...snookerBase,
    variant: 'wpbsa-snooker-full',
    calls: [{ shotIndex: 0, kind: 'decision', decision: 17, choice: 3 }] }));
  assert.deepEqual(d17.calls[0],
    { shotIndex: 0, kind: 'decision', decision: 17, choice: 3 });
});

test('012: rack kinds snooker/carom are typed wire values; the game '
  + 'cross-check still rejects mismatches (readiness flips landed)', async () => {
  // an eight_ball game cannot ride a snooker rack kind (template cross-check)
  await assert.rejects(
    encodeShare({ ...game(1), rackKind: 'snooker', game: 'eight_ball' }),
    /rack kind 'snooker' does not match game 'eight_ball'/);
  // snooker/carom GAMES encode + round-trip since the T048 readiness flips
  // (decode rule: game must resolve readiness 'playable' — it now does)
  const snookerGame: SharedGame = {
    ...game(1), rackKind: 'snooker', game: 'snooker',
    variant: 'wpbsa-snooker',
  };
  assert.deepEqual(await decodeShare(await encodeShare(snookerGame)),
    snookerGame);
  const caromGame: SharedGame = {
    ...game(1), rackKind: 'carom', game: 'carom_3cushion',
    variant: 'umb-carom',
  };
  assert.deepEqual(await decodeShare(await encodeShare(caromGame)),
    caromGame);
  // the rack-kind cross-check still rejects the inverted pairings
  await assert.rejects(
    encodeShare({ ...game(1), rackKind: 'nine', game: 'snooker' }),
    /rack kind 'nine' does not match game 'snooker'/);
});

test('012 T019: KERNEL_COMPAT_LINEAGE — kernelGate suppresses the warning '
  + 'for proven pairs (and chains), everything else unchanged', async () => {
  // the feature-012 pair, proven by Gate G-KERNEL (e2e-share --corpus)
  assert.ok(KERNEL_COMPAT_LINEAGE.some(
    ([o, n]) => o === '0.1.0+5bd2803' && n === '0.1.0+ee629a3'),
  'the 012 lineage pair must be listed');
  const g = game(1);
  // proven pair: silent pass in the FORWARD direction
  assert.deepEqual(
    kernelGate({ ...g, kernelVersion: '0.1.0+5bd2803' }, '0.1.0+ee629a3'),
    { ok: true });
  // reverse direction is NOT proven (an old build reading a new link warns)
  assert.equal(
    kernelGate({ ...g, kernelVersion: '0.1.0+ee629a3' }, '0.1.0+5bd2803').ok,
    false);
  // unlisted versions keep the warning with both versions named
  const gate = kernelGate({ ...g, kernelVersion: '9.9.9+feed' }, '0.1.0+ee629a3');
  assert.equal(gate.ok, false);
  assert.match(gate.message!, /9\.9\.9\+feed/);
  assert.match(gate.message!, /0\.1\.0\+ee629a3/);
  // identical versions stay a silent pass
  assert.deepEqual(kernelGate({ ...g, kernelVersion: 'x' }, 'x'), { ok: true });
  // Feature-018 default flip (flip-cascade.md §5): the flip is a
  // REGISTERED PHYSICS CHANGE (cluster-escalated breaks diverge), so the
  // pre-flip component of the ledger must stay DISCONNECTED from the
  // live kernel — the table is a byte-identity proof ledger and an
  // unproven pair is a contract violation. The live kernel MAY appear as
  // a new_hash for post-flip version-only repins (GH-318 doctrine; the
  // GH-343 pair rides the same ledger), but no lineage chain may cross
  // the flip: kernelGate must REFUSE pre-flip -> live (warn +
  // view-anyway).
  const eng = await engine();
  for (const preFlip of ['0.1.0+5bd2803', '0.1.0+ee629a3', '0.1.0+4c2d25e',
    '0.1.0+6cde449', '0.1.0+6f8fd12']) {
    assert.equal(lineageCompatible(preFlip, eng.version()), false,
      `no proven chain may bridge the 018 flip (${preFlip} -> live)`);
    assert.equal(
      kernelGate({ ...g, kernelVersion: preFlip }, eng.version()).ok,
      false, `strict gate must refuse the pre-flip pair (${preFlip})`);
  }
});

test('GH-318: build-15 version-only repins — proven pairs suppress the '
  + 'gate, chains resolve, the reverse direction still warns', async () => {
  const g = game(1);
  // the three restamp hops + the explicit transitive closure, each
  // RE-PROVEN by a Gate G-KERNEL pair run (e2e-share.mjs --corpus-pair,
  // 14/14 corpus event streams byte-identical) before listing
  const pairs: [string, string][] = [
    ['0.1.0+99bca8b6', '0.1.0+52c22c0d'],
    ['0.1.0+99bca8b6', '0.1.0+c7816023'],
    ['0.1.0+99bca8b6', '0.1.0+208e1dc4'],
    ['0.1.0+52c22c0d', '0.1.0+c7816023'],
    ['0.1.0+52c22c0d', '0.1.0+208e1dc4'],
    ['0.1.0+c7816023', '0.1.0+208e1dc4'],
  ];
  for (const [o, n] of pairs) {
    assert.ok(KERNEL_COMPAT_LINEAGE.some(([a, b]) => a === o && b === n),
      `the proven pair (${o} -> ${n}) must be listed`);
    assert.equal(lineageCompatible(o, n), true);
    assert.deepEqual(kernelGate({ ...g, kernelVersion: o }, n), { ok: true });
    // reverse direction is NOT proven (an old build reading a new link warns)
    assert.equal(kernelGate({ ...g, kernelVersion: n }, o).ok, false,
      `reverse (${n} -> ${o}) must keep the warning`);
  }
  // lineageCompatible is a LEDGER traversal, not equality: identical
  // versions return false — badge/diagnostic callers gate on !== first
  assert.equal(lineageCompatible('0.1.0+208e1dc4', '0.1.0+208e1dc4'), false);
  // a genuinely different (never-proven) stamp keeps the warning
  assert.equal(
    kernelGate({ ...g, kernelVersion: '0.1.0+deadbeef' }, '0.1.0+208e1dc4').ok,
    false);
});

// The two lineage-ledger tests below pin the private live stamp. The public snapshot rebuilds its dist without .git,
// so its live kernel stamps N.N.N+snapshot, a stamp the ledger cannot name (an older snapshot kernel carried the same
// stamp). They skip only when BOTH hold: the live stamp is N.N.N+snapshot, and this file's source starts with the
// copyright header that the export stamps (the private tree never carries it). A private tree whose dist carries
// +snapshot still runs them, and they fail there.
const PUBLIC_SNAPSHOT_SOURCE = readFileSync(new URL('../../test/share.test.ts', import.meta.url), 'utf8')
  .startsWith('// Copyright (c) Meta Platforms, Inc. and affiliates.\n');
const skipOnPublicSnapshot = (t: { skip(message?: string): void }, live: string): boolean => {
  if (!PUBLIC_SNAPSHOT_SOURCE || !/^[0-9]+\.[0-9]+\.[0-9]+\+snapshot$/.test(live)) return false;
  t.skip(`public snapshot tree: the live stamp ${live} is shared by every git-less build, so it names no single build `
    + 'and the lineage ledger can never pair it');
  return true;
};

test('GH-343/GH-490/#789: the 10-ball restamp pairs end at the last '
  + 'PROVEN pre-490 kernel; the live kernel is reached only from its '
  + 'proven version-only predecessors — cross-version opens from the older '
  + 'component warn + view-anyway', async (t) => {
  const g = game(1);
  const eng = await engine();
  if (skipOnPublicSnapshot(t, eng.version())) return;
  // GH-490 (catalog v15: the Chinese-eight width repin) is a REGISTERED
  // geometry change — the lineage ledger is a byte-identity proof ledger
  // and gains no pair across it (flip-cascade.md §5), so the build-15
  // chain ENDS at the pre-490 kernel below. The GH-958/977 version-only
  // restamp appended two pairs into 72a839f6 (from 206ceb55 and, as the
  // explicit closure, from b6b5dc3f). GH-1080 (catalog v21, the chinese8
  // pocket repin, a HYBRID posture) appended the three pairs into the live
  // kernel that its own Gate G-KERNEL pair runs proved byte-identical: from
  // 72a839f6, 206ceb55 and b6b5dc3f. No pair links any of them to the
  // pre-490 component, so the strict gate still refuses (with view-anyway
  // UX) every cross-version open from that component onto the live kernel.
  // (Chinese-8 shares from those stamps are refused by kernelGate's own
  // table-aware rule; see the GH-1080 test below.) GH-1195 (the Rest
  // barrier's residual snap) is a REGISTERED physics change: no pair enters
  // the live kernel, so it has no proven predecessor, and the GH-1080
  // component ENDS at the last pre-1195 stamp (the GH-1195 test below pins
  // the refusal). NEXT VERSION-ONLY REPIN: list the new live kernel's proven
  // predecessors in PROVEN_PREVS.
  const LAST_PROVEN = '0.1.0+91ad8597';
  assert.notEqual(eng.version(), LAST_PROVEN,
    'the committed dist must carry the GH-490 repin');
  const PROVEN_PREVS: string[] = ['0.1.0+15210514'];
  assert.deepEqual(
    KERNEL_COMPAT_LINEAGE.filter(([, b]) => b === eng.version())
      .map(([a]) => a).sort(),
    PROVEN_PREVS,
    'the pairs into the live kernel are exactly its proven predecessors '
    + '(#789, GH-1080, GH-1195)');
  const LAST_PRE_1195 = '0.1.0+a31f6516';
  const PRE_1195_PREVS = ['0.1.0+206ceb55', '0.1.0+72a839f6', '0.1.0+b6b5dc3f'];
  assert.deepEqual(
    KERNEL_COMPAT_LINEAGE.filter(([, b]) => b === LAST_PRE_1195)
      .map(([a]) => a).sort(),
    PRE_1195_PREVS,
    'the GH-1080 pairs end at the last pre-1195 stamp');
  for (const prev of PRE_1195_PREVS) {
    assert.deepEqual(
      kernelGate({ ...g, kernelVersion: prev }, LAST_PRE_1195),
      { ok: true });
    assert.equal(
      kernelGate({ ...g, kernelVersion: LAST_PRE_1195 }, prev).ok,
      false, `reverse direction (${LAST_PRE_1195} -> ${prev}) is not proven`);
  }
  for (const prev of PROVEN_PREVS) {
    assert.deepEqual(
      kernelGate({ ...g, kernelVersion: prev }, eng.version()),
      { ok: true });
    assert.equal(
      kernelGate({ ...g, kernelVersion: eng.version() }, prev).ok,
      false, `reverse direction (live -> ${prev}) is not proven`);
  }
  assert.equal(lineageCompatible(LAST_PROVEN, eng.version()), false,
    'no chain bridges the GH-490 flip into the live kernel');
  // the direct pair + the explicit closure from the build-15 component,
  // each PROVEN by a Gate G-KERNEL pair run (e2e-share.mjs --corpus-pair)
  for (const o of ['0.1.0+208e1dc4', '0.1.0+99bca8b6', '0.1.0+52c22c0d',
    '0.1.0+c7816023']) {
    assert.ok(KERNEL_COMPAT_LINEAGE.some(([a, b]) =>
      a === o && b === LAST_PROVEN),
    `the GH-343 pair (${o} -> ${LAST_PROVEN}) must be listed`);
    assert.deepEqual(
      kernelGate({ ...g, kernelVersion: o }, LAST_PROVEN), { ok: true });
    assert.equal(
      kernelGate({ ...g, kernelVersion: o }, eng.version()).ok,
      false, 'GH-490: the live kernel is beyond the proven lineage');
    assert.equal(
      kernelGate({ ...g, kernelVersion: LAST_PROVEN }, o).ok,
      false, 'reverse direction is not proven');
  }
});

// ---- feature 026 (GH-343): the ten_ball game axis ---------------------------


test('GH-1080 (catalog v21): the hybrid lineage posture — the proven pairs '
  + 'keep pool shares silent, while chinese8, joy_q8 and heyball shares minted '
  + 'on the pre-v21 pockets are refused with the standard warning', async () => {
  const eng = await engine();
  const live = eng.version();
  assert.ok(!CHINESE8_POCKETS_PRE_V21_STAMPS.includes(live),
    'the committed dist must be a v21 kernel');
  // the frozen set is a literal list (the GH-1042 idiom), and the stamps
  // that reach the first v21 stamp are pinned too (the chinese8PocketsMoved
  // doc names them). Keyed to that literal stamp, never to `live`, so a later
  // version-only repin leaves this arm green.
  const FIRST_V21 = '0.1.0+a31f6516';
  assert.deepEqual([...CHINESE8_POCKETS_PRE_V21_STAMPS], [
    '0.1.0+5bd2803', '0.1.0+ee629a3', '0.1.0+4c2d25e', '0.1.0+6cde449',
    '0.1.0+6f8fd12', '0.1.0+99bca8b6', '0.1.0+52c22c0d', '0.1.0+c7816023',
    '0.1.0+208e1dc4', '0.1.0+dedc61cd', '0.1.0+91ad8597', '0.1.0+b6b5dc3f',
    '0.1.0+a2b08c21', '0.1.0+206ceb55', '0.1.0+72a839f6',
  ]);
  assert.ok(Object.isFrozen(CHINESE8_POCKETS_PRE_V21_STAMPS));
  for (const s of CHINESE8_POCKETS_PRE_V21_STAMPS) {
    assert.ok(KERNEL_COMPAT_LINEAGE.some(([a, b]) => a === s || b === s),
      `${s} is a lineage stamp`);
  }
  const reachV21 = [...new Set(KERNEL_COMPAT_LINEAGE.flat())]
    .filter((s) => lineageCompatible(s, FIRST_V21)).sort();
  assert.deepEqual(reachV21,
    ['0.1.0+206ceb55', '0.1.0+72a839f6', '0.1.0+a2b08c21', '0.1.0+b6b5dc3f'],
    'the stamps that reach the first v21 stamp (chinese8PocketsMoved doc)');
  assert.deepEqual([...CHINESE8_POCKET_TABLE_IDS].sort(),
    ['chinese8_pro_9ft', 'joy_q8_9ft']);
  const pool = game(1);
  const onTable = (tableId: string, extra: Partial<SharedGame> = {}): SharedGame => ({
    ...game(1), equipment: { ...game(1).equipment, table_id: tableId }, ...extra,
  });
  // The proven pairs end at FIRST_V21: GH-1195 is a registered physics
  // change, so no pair enters the live kernel (the GH-1195 test pins that
  // refusal), and the proven-pair half below is keyed to FIRST_V21 too.
  const standard = (from: string) =>
    kernelGate({ ...pool, kernelVersion: '0.1.0+deadbeef' }, FIRST_V21).message!
      .replace('0.1.0+deadbeef', from);
  for (const prev of ['0.1.0+72a839f6', '0.1.0+b6b5dc3f', '0.1.0+206ceb55']) {
    assert.ok(lineageCompatible(prev, FIRST_V21), `${prev} -> ${FIRST_V21} is a proven pair`);
    // a pool share replays silently: the pair proves byte identity
    assert.deepEqual(kernelGate({ ...pool, kernelVersion: prev }, FIRST_V21), { ok: true });
    for (const id of ['chinese8_pro_9ft', 'joy_q8_9ft']) {
      const share = { ...onTable(id), kernelVersion: prev };
      const gate = kernelGate(share, FIRST_V21);
      assert.equal(gate.ok, false, `a ${id} share from ${prev} must be refused`);
      assert.equal(gate.message, standard(prev), 'the existing cross-version warning');
      assert.equal(chinese8PocketsMoved(share, FIRST_V21), true);
    }
    // heyball racks on chinese8_pro_9ft, so its shares carry that table
    const heyball = { ...onTable('chinese8_pro_9ft', { game: 'heyball' }), kernelVersion: prev };
    assert.equal(kernelGate(heyball, FIRST_V21).ok, false,
      `a heyball share from ${prev} must be refused`);
  }
  // a chinese8 share minted on the v21 kernel itself replays normally (the
  // same-stamp path, which returns before any table rule)
  assert.deepEqual(
    kernelGate({ ...onTable('chinese8_pro_9ft'), kernelVersion: live }, live), { ok: true });
  // and the table-aware rule never fires for a share minted on a v21 stamp,
  // whatever kernel re-simulates it: a later stamp keeps the v21 pockets
  for (const id of CHINESE8_POCKET_TABLE_IDS) {
    assert.equal(
      chinese8PocketsMoved({ ...onTable(id), kernelVersion: FIRST_V21 }, '0.1.0+feedf00d'),
      false, `a ${id} share minted on ${FIRST_V21} is never refused by the table rule`);
  }
  // a pair between two pre-v21 stamps that rack identical chinese8 pockets
  // (b6b5dc3f and 72a839f6, spec dump) stays silent
  assert.deepEqual(
    kernelGate({ ...onTable('chinese8_pro_9ft'), kernelVersion: '0.1.0+b6b5dc3f' },
      '0.1.0+72a839f6'), { ok: true });
  // a never-proven stamp keeps the warning, whatever the table
  assert.equal(kernelGate({ ...pool, kernelVersion: '0.1.0+deadbeef' }, live).ok, false);
});

test('GH-1195: the Rest residual snap is a registered physics change — no '
  + 'lineage chain bridges it into the live kernel, so every pre-flip share '
  + 'warns + view-anyway', async (t) => {
  const g = game(1);
  const live = (await engine()).version();
  if (skipOnPublicSnapshot(t, live)) return;
  // the first post-1195 stamp (REGISTERED_FLIPS in web/tools/e2e-share.mjs).
  // A later version-only repin appends (FLIP_1195 -> new), so its stamp
  // counts as after the flip too and this arm stays green.
  const FLIP_1195 = '0.1.0+15210514';
  const afterFlip = (v: string) => v === FLIP_1195 || lineageCompatible(FLIP_1195, v);
  assert.ok(afterFlip(live), 'the committed dist must carry the GH-1195 snap');
  const before = [...new Set(KERNEL_COMPAT_LINEAGE.flat())].filter((s) => !afterFlip(s));
  for (const shipped of ['0.1.0+a31f6516', '0.1.0+72a839f6', '0.1.0+b6b5dc3f']) {
    assert.ok(before.includes(shipped), `${shipped} is a pre-flip ledger stamp`);
  }
  for (const s of before) {
    assert.equal(lineageCompatible(s, live), false,
      `no proven chain may bridge the GH-1195 flip (${s} -> live)`);
    assert.equal(kernelGate({ ...g, kernelVersion: s }, live).ok, false,
      `strict gate must refuse the pre-flip stamp ${s}`);
  }
});
test('026: a ten_ball session round-trips — calls, the no-call stance, '
  + 'the push out (kind 4) and decisions 12/13 bit-exact', async () => {
  const g: SharedGame = {
    ...game(6), rackKind: 'ten', game: 'ten_ball', variant: 'wpa-10ball',
    calls: [
      // the break (shot 0) carries no stance (WPA 6.5); shot 1 is the
      // declared push out with the opponent's recorded response
      { shotIndex: 1, kind: 'push' },
      { shotIndex: 1, kind: 'decision', decision: 12, choice: 2 },
      { shotIndex: 2, kind: 'call', ball: 1, pocket: 3 },
      // a wrongful pot's opponent option (WPA 6.6)
      { shotIndex: 3, kind: 'call', ball: 2, pocket: 0 },
      { shotIndex: 3, kind: 'decision', decision: 13, choice: 1 },
      // the declared no-call stance rides the safety wire kind (6.5:
      // there is no safety call at 10-ball)
      { shotIndex: 4, kind: 'safety' },
      { shotIndex: 5, kind: 'call', ball: 10, pocket: 5 },
    ],
  };
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  // the rack-kind cross-check gates the pairing in both directions
  await assert.rejects(
    encodeShare({ ...g, rackKind: 'nine' }),
    /rack kind 'nine' does not match game 'ten_ball'/);
  await assert.rejects(
    encodeShare({ ...game(1), rackKind: 'ten', game: 'nine_ball' }),
    /rack kind 'ten' does not match game 'nine_ball'/);
  // push on a non-ten_ball game is rejected at the object level too
  await assert.rejects(
    encodeShare({ ...game(2), game: 'eight_ball', rackKind: 'fifteen',
      variant: 'wpa-8ball',
      calls: [{ shotIndex: 0, kind: 'push' }] }),
    /push out is a ten_ball input/);
});

// ---- feature 022 (T017): codec v5 — the rules-variant slot ------------------
// contracts/share-codec.md, FROZEN: wire index 9, WIRE_ARITY[5] = 10 (v4
// row retained at 9), decode rules 1-5. The known-id table GAME_VARIANTS
// is a pure-data mirror of the committed rules artifact's catalog presets
// rows (drift-pinned below).

import { rulesCatalogJson, rulesVersion } from '../src/rules/backend.js';

const V5_IDS = [DEFAULT_EQUIPMENT.table_id, DEFAULT_EQUIPMENT.cloth_id,
  DEFAULT_EQUIPMENT.ballset_id, DEFAULT_EQUIPMENT.cue_id,
  DEFAULT_EQUIPMENT.cushion_model_id];

test('022: v5 round-trip pins an explicit NON-default preset id', async () => {
  const g: SharedGame = { ...eightBallGame(), variant: 'apa-8ball' };
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  assert.equal(dec.variant, 'apa-8ball');
});

test('022: v5 round-trip with the explicit DEFAULT id (provenance is '
  + 'self-describing, decode rule 2)', async () => {
  const g = eightBallGame(); // variant: 'wpa-8ball' — the family default
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  assert.equal(dec.variant, defaultVariantFor('eight_ball'));
});

test('022: a v4 wire (no variant slot) normalizes to the decoded game\'s '
  + 'default preset (decode rule 1)', async () => {
  const b64 = await encodeWire(
    [4, 'kv', 'fifteen', 3, V5_IDS, [[1, 0.5, 0, 0, 0.1]], [], 'eight_ball',
      [[0, 2, 1, 1]]]);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 4);
  assert.equal(dec.variant, 'wpa-8ball');
});

test('022: unknown variant id throws the structured error naming the id '
  + '+ the catalog RULES_VERSION (decode rule 3 — never a silent '
  + 'fallback)', async () => {
  const b64 = await encodeWire(
    [5, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'klingon-9ball']);
  await assert.rejects(decodeShare(b64), (e: Error) => {
    assert.ok(e instanceof ShareError);
    assert.match(e.message, /rules variant 'klingon-9ball' is not known/);
    assert.ok(e.message.includes(`RULES_VERSION ${RULES_CATALOG_VERSION}`));
    assert.match(e.message, /update this app or ask the sender to re-share/);
    return true;
  });
  // encode-side: the same gate (shared validateGame)
  await assert.rejects(
    encodeShare({ ...game(1), variant: 'klingon-9ball' }),
    /not known to this build/);
});

test('022: family-mismatched preset id is a malformed payload (decode '
  + 'rule 4 — wpa-8ball on a nine_ball game is not a playable point)', async () => {
  const b64 = await encodeWire(
    [5, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-8ball']);
  await assert.rejects(decodeShare(b64), (e: Error) => {
    assert.ok(e instanceof ShareError);
    assert.match(e.message,
      /rules variant 'wpa-8ball' does not belong to game 'nine_ball'/);
    return true;
  });
  await assert.rejects(
    encodeShare({ ...game(1), variant: 'apa-8ball' }),
    /does not belong to game 'nine_ball'/);
});

test('022: v5 arity table — WIRE_ARITY[5] = 10, v4 row retained at 9', async () => {
  // v5 wire MISSING the variant element -> wrong shape (arity by version)
  await assert.rejects(decodeShare(await encodeWire(
    [5, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', []])),
    /wrong shape/);
  // v4 wire with a SMUGGLED variant element -> wrong shape (v4 row frozen)
  await assert.rejects(decodeShare(await encodeWire(
    [4, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball'])),
    /wrong shape/);
  // v5 variant slot must be a string
  await assert.rejects(decodeShare(await encodeWire(
    [5, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [], 7])),
    /wrong shape/);
});

test('022: GAME_VARIANTS is drift-pinned against the committed rules '
  + 'artifact catalog (T009 mirror discipline)', () => {
  const catalog = JSON.parse(rulesCatalogJson()) as {
    rulesVersion: string;
    rulesets: {
      id: string;
      config: Record<string, unknown>;
      presets: { id: string; family: string }[];
    }[];
  };
  // the RULES_VERSION named by the unknown-id error tracks the catalog
  assert.ok(catalog.rulesVersion.startsWith(`${RULES_CATALOG_VERSION}+`),
    `catalog ${catalog.rulesVersion} vs codec pin ${RULES_CATALOG_VERSION}`);
  assert.equal(rulesVersion(), catalog.rulesVersion);
  // eight_ball: the codec's known-id list IS the catalog presets rows,
  // default (= the entry's defaultPreset, the FR-005 alias row) FIRST
  const v2 = catalog.rulesets.find((e) => e.id === 'eightball-v2');
  assert.ok(v2, 'catalog carries eightball-v2');
  assert.deepEqual([...GAME_VARIANTS.eight_ball], v2.presets.map((p) => p.id));
  assert.equal(defaultVariantFor('eight_ball'), v2.config['defaultPreset']);
  // feature 025 (issue #65): straight_pool mirrors the fourteenone-v1
  // preset rows the same way (default = the entry's defaultPreset)
  const f1 = catalog.rulesets.find((e) => e.id === 'fourteenone-v1');
  assert.ok(f1, 'catalog carries fourteenone-v1');
  assert.deepEqual(
    [...GAME_VARIANTS.straight_pool], f1.presets.map((p) => p.id));
  assert.equal(defaultVariantFor('straight_pool'), f1.config['defaultPreset']);
  // GH-383: carom_3cushion mirrors the carom3c-v2 preset rows the same
  // way (default = the entry's defaultPreset, the FR-005 alias row FIRST)
  const c2 = catalog.rulesets.find((e) => e.id === 'carom3c-v2');
  assert.ok(c2, 'catalog carries carom3c-v2');
  assert.deepEqual(
    [...GAME_VARIANTS.carom_3cushion], c2.presets.map((p) => p.id));
  assert.equal(
    defaultVariantFor('carom_3cushion'), c2.config['defaultPreset']);
  // GH-382 (build 17): snooker mirrors the snooker-v2 preset rows the
  // same way (default = the entry's defaultPreset, the FR-005 alias row
  // FIRST; wpbsa-snooker-full is the completion preset)
  const s2 = catalog.rulesets.find((e) => e.id === 'snooker-v2');
  assert.ok(s2, 'catalog carries snooker-v2');
  assert.deepEqual([...GAME_VARIANTS.snooker], s2.presets.map((p) => p.id));
  assert.equal(defaultVariantFor('snooker'), s2.config['defaultPreset']);
  // every OTHER game ships no catalog preset rows -> exactly one codec id,
  // the family default (a future preset family grows its row AND this
  // mirror in the same repin — this pin makes forgetting impossible)
  for (const e of catalog.rulesets) {
    if (e.id !== 'eightball-v2' && e.id !== 'fourteenone-v1'
      && e.id !== 'carom3c-v2' && e.id !== 'snooker-v2') {
      assert.deepEqual(e.presets, [], `${e.id} carries no preset rows`);
    }
  }
  for (const [gid, ids] of Object.entries(GAME_VARIANTS)) {
    if (gid !== 'eight_ball' && gid !== 'snooker'
      && gid !== 'carom_3cushion') {
      assert.equal(ids.length, 1, `${gid} carries exactly its default id`);
    }
    assert.equal(new Set(ids).size, ids.length, `${gid} ids unique`);
  }
  // ids are globally unique across families (rule 3 vs rule 4 separation
  // depends on it: an id can belong to exactly one family)
  const all = Object.values(GAME_VARIANTS).flat();
  assert.equal(new Set(all).size, all.length, 'globally unique preset ids');
});

// ---- codec v6 (issue #68): the playground axes ------------------------------
// contracts/share-codec.md Amendment v6: wire indices 10 (free-placement
// event log, commit order) + 11 (sender-mode flag), WIRE_ARITY[6] = 12
// (v5 row retained at 10), decode: v1-v5 normalize to moves:[], mode:'play'.

/** A playground 9-ball session: an object-ball move, a cue move, and an
 * undo restore (just another committed event) before shot 1. */
function playgroundGame(n = 3): SharedGame {
  return {
    ...game(n),
    mode: 'playground',
    moves: [
      { shotIndex: 0, ball: 5, x: 0.31, y: 0.22 },
      { shotIndex: 0, ball: 0, x: -0.1, y: -0.9 },
      // undo restore of the ball-5 move — an EVENT, never a rollback
      { shotIndex: 1, ball: 5, x: 0.123456789012345, y: -0.87654321 },
    ],
  };
}

test('68: v6 round-trip — playground session with free placements '
  + '(cue included) + an undo restore, bit-exact coordinates', async () => {
  const g = playgroundGame();
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  assert.equal(dec.mode, 'playground');
  dec.moves.forEach((m, i) => { // doubles IDENTICAL (byte-match relies on it)
    assert.equal(m.x, g.moves[i]!.x);
    assert.equal(m.y, g.moves[i]!.y);
  });
});

test('68: v6 round-trip — playground mode with ZERO moves (free shots '
  + 'only) and the full ball-id domain edge (snooker black, id 21)', async () => {
  const bare: SharedGame = { ...game(2), mode: 'playground' };
  assert.deepEqual(await decodeShare(await encodeShare(bare)), bare);
  const snookerPg: SharedGame = {
    ...game(1), rackKind: 'snooker', game: 'snooker',
    variant: 'wpbsa-snooker', mode: 'playground',
    moves: [{ shotIndex: 0, ball: 21, x: 0.5, y: 1.7 }],
  };
  assert.deepEqual(await decodeShare(await encodeShare(snookerPg)), snookerPg);
});

test('68: a v5 wire (no playground slots) normalizes to moves:[], '
  + 'mode:play', async () => {
  const b64 = await encodeWire(
    [5, 'kv', 'nine', 3, V5_IDS, [[1, 0.5, 0, 0, 0.1]], [], 'nine_ball', [],
      'wpa-9ball']);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 5);
  assert.deepEqual(dec.moves, []);
  assert.equal(dec.mode, 'play');
});

test('68: v6 arity table — WIRE_ARITY[6] = 12, v5 row retained at 10', async () => {
  // v6 wire MISSING the mode element -> wrong shape (arity by version)
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', []])),
    /wrong shape/);
  // v5 wire with a SMUGGLED moves element -> wrong shape (v5 row frozen)
  await assert.rejects(decodeShare(await encodeWire(
    [5, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', []])),
    /wrong shape/);
  // the moves slot must be an array; the mode flag must be 0|1
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', 'moves', 0])),
    /wrong shape/);
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [], 2])),
    /wrong shape/);
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [], 'playground'])),
    /wrong shape/);
  // move tuple of the wrong arity / non-number element
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [[0, 5, 0.1]], 1])),
    /move 0: wire tuple has the wrong shape/);
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [[0, '5', 0.1, 0.2]], 1])),
    /move 0: wire tuple has the wrong shape/);
});

test('68: v6 validation — moves domains, ordering, and the '
  + 'playground-mode requirement', async () => {
  const withMoves = (moves: FreePlacement[], mode: SharedGame['mode'] =
  'playground'): SharedGame => ({ ...game(2), mode, moves });
  // free placements require the playground sender mode
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5, x: 0, y: 0 }], 'play')),
    /free placements require the playground sender mode/);
  // unknown sender mode (untyped JS caller)
  await assert.rejects(encodeShare(
    { ...game(1), mode: 'sandbox' as SharedGame['mode'] }),
    /unknown sender mode/);
  // shot index out of range (a move may only precede a RECORDED shot)
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 2, ball: 5, x: 0, y: 0 }])), /out of range/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: -1, ball: 5, x: 0, y: 0 }])), /out of range/);
  // commit order is chronological: shot indices never decrease
  await assert.rejects(encodeShare(withMoves([
    { shotIndex: 1, ball: 5, x: 0, y: 0 },
    { shotIndex: 0, ball: 6, x: 0.1, y: 0 },
  ])), /sorted/);
  // ball id domain 0..21
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: -1, x: 0, y: 0 }])), /ball id/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 22, x: 0, y: 0 }])), /ball id/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5.5, x: 0, y: 0 }])), /ball id/);
  // coordinates finite + inside the catalog table envelope
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5, x: Number.NaN, y: 0 }])), /envelope/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5, x: 0, y: Number.POSITIVE_INFINITY }])),
    /envelope/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5, x: 2.5, y: 0 }])), /envelope/);
  await assert.rejects(encodeShare(withMoves(
    [{ shotIndex: 0, ball: 5, x: 0, y: -2.5 }])), /envelope/);
  // the same gates hold on DECODE (hand-built v6 wires)
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [[0, 5, 0.1, 0.1]], 0])),
    /free placements require the playground sender mode/);
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [[5, 5, 0.1, 0.1]], 1])),
    /out of range/);
});

test('68: v6 validation — the moves axis is CAPPED at 4096 events (the '
  + 'shots-bound discipline; repetitive tuples deflate small, so an '
  + 'uncapped axis is a decode-then-freeze amplification)', async () => {
  const flood = (n: number): FreePlacement[] => Array.from(
    { length: n }, () => ({ shotIndex: 0, ball: 5, x: 0.1, y: 0.1 }));
  // 4096 in-domain events pass; 4097 refuse — on encode AND on a
  // hand-built v6 wire (a hostile link must die in decode validation,
  // long before the replay lane walks the axis)
  const capped: SharedGame = { ...game(2), mode: 'playground',
    moves: flood(4096) };
  assert.equal((await decodeShare(await encodeShare(capped))).moves.length,
    4096);
  await assert.rejects(encodeShare({ ...capped, moves: flood(4097) }),
    /0\.\.4096 moves/);
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', flood(4097).map((m) => [m.shotIndex, m.ball, m.x, m.y]),
      1])),
    /0\.\.4096 moves/);
});

// ---- codec v7 (GH-448): the breaker seat ------------------------------------
// contracts/share-codec.md Amendment v7: wire index 12 (the hotseat seat
// the session's first rack folded on), WIRE_ARITY[7] = 13 (v6 row retained
// at 12), decode: v1-v6 normalize to breaker: 1 (the fresh-boot fold seat
// every legacy replay's first pass used — derived from the wire alone).

test('448: v7 round-trip pins the NON-default breaker seat 2', async () => {
  const g: SharedGame = { ...game(3), breaker: 2 };
  const dec = await decodeShare(await encodeShare(g));
  assert.deepEqual(dec, g);
  assert.equal(dec.breaker, 2);
});

test('448: a v6 wire (no breaker slot) normalizes to breaker 1 '
  + '(decode rule — never live UI state)', async () => {
  const b64 = await encodeWire(
    [6, 'kv', 'nine', 3, V5_IDS, [[1, 0.5, 0, 0, 0.1]], [], 'nine_ball', [],
      'wpa-9ball', [], 0]);
  const dec = await decodeShare(b64);
  assert.equal(dec.formatV, 6);
  assert.equal(dec.breaker, 1);
});

test('448: v7 arity table — WIRE_ARITY[7] = 13, v6 row retained at 12', async () => {
  // v7 wire MISSING the breaker element -> wrong shape (arity by version)
  await assert.rejects(decodeShare(await encodeWire(
    [7, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [], 0])),
    /wrong shape/);
  // v6 wire with a SMUGGLED breaker element -> wrong shape (v6 row frozen)
  await assert.rejects(decodeShare(await encodeWire(
    [6, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
      'wpa-9ball', [], 0, 1])),
    /wrong shape/);
  // the breaker slot's domain is exactly {1, 2}
  for (const bad of [0, 3, -1, 1.5, '1', null, true]) {
    await assert.rejects(decodeShare(await encodeWire(
      [7, 'kv', 'nine', 1, V5_IDS, [[1, 0, 0, 0, 0]], [], 'nine_ball', [],
        'wpa-9ball', [], 0, bad])),
      /wrong shape/, `breaker ${String(bad)} must refuse`);
  }
});

test('448: encode-side breaker domain — an untyped caller\'s bad seat '
  + 'refuses (shared validateGame; the casts stand in for plain-JS '
  + 'callers — the published type is the literal union 1|2, review r1 P2)', async () => {
  await assert.rejects(
    encodeShare({ ...game(1), breaker: 3 as unknown as 1 | 2 }),
    /breaker seat must be 1 or 2/);
  await assert.rejects(
    encodeShare({ ...game(1), breaker: 1.5 as unknown as 1 | 2 }),
    /breaker seat must be 1 or 2/);
  // an EXPLICIT null is invalid input, never the pre-v7 absent-field
  // fill (review r3 P2 — ?? would have laundered it into seat 1)
  await assert.rejects(
    encodeShare({ ...game(1), breaker: null as unknown as 1 | 2 }),
    /breaker seat must be 1 or 2/);
});

// ---- GH-302: the `cp` sibling camera-plan param -----------------------------

/** The #301 model-shape fixture: all three transition ids, snapped t=0
 * anchors, mid-segment anchors, and custom-tripod cuts referencing their
 * poses (integer centiseconds / millimetres / decidegrees throughout). */
function samplePlan(): CameraPlan {
  return {
    cuts: [
      { seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0 },     // snapped boundary
      { seg: 0, t: 80, cam: 3, transitionIn: 0, dur: 0 },    // mid-segment cut
      { seg: 1, t: 0, cam: 2, transitionIn: 2, dur: 100 },   // fade (dip)
      { seg: 2, t: 0, cam: 2, transitionIn: 1, dur: 0 },     // move (walk)
      { seg: 2, t: 1240, cam: 8, transitionIn: 0, dur: 0 },  // custom tripod
    ],
    poses: [
      { slot: 0, eye: [-1234, 2210, 1600], look: [120, -85, 30], fov: 600 },
    ],
  };
}

/** Cap-worst plan: 128 cuts + 8 poses at the MODEL caps (§1.5 — nothing
 * bigger can ever reach the encoder), with HIGH-ENTROPY integers (seeded
 * LCG anchors/poses, worst-width digit counts, minus signs) so deflate
 * cannot flatter the measurement with a repetitive fixture. */
function capWorstPlan(segs = 25): CameraPlan {
  let s = 1302;
  const rnd = (n: number) => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s % n;
  };
  const cams = [0, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 15];
  const perSeg = Math.ceil(128 / segs);
  const cuts = Array.from({ length: 128 }, (_, k) => {
    const seg = Math.min(segs - 1, Math.floor(k / perSeg));
    const idx = k % perSeg;
    const fade = idx > 0 && rnd(3) === 0;
    return {
      seg,
      t: idx === 0 ? 0 : 500 + idx * 400 + rnd(399), // 3-4 digit anchors
      cam: cams[rnd(cams.length)]!,
      transitionIn: fade ? 2 : 0,
      dur: fade ? 100 + rnd(400) : 0,
    };
  });
  const poses = Array.from({ length: 8 }, (_, s8) => ({
    slot: s8,
    eye: [rnd(24_001) - 12_000, rnd(24_001) - 12_000, rnd(8_001)],
    look: [rnd(8_001) - 4_000, rnd(8_001) - 4_000, rnd(4_001) - 1_000],
    fov: 400 + rnd(701),
  }));
  return { cuts, poses };
}

test('302: cp round-trip is IDENTITY on the model integers (all three '
  + 'transition ids, snapped t=0 anchors, custom pose)', async () => {
  const plan = samplePlan();
  const blob = await encodeCameraPlan(plan, 3);
  assert.match(blob, /^[A-Za-z0-9_-]+$/, 'cp blob must be base64url');
  assert.equal(encodeURIComponent(blob), blob);
  assert.deepEqual(await decodeCameraPlan(blob, 3), plan);
});

test('302: cp cap-worst round-trip (128 cuts + 8 poses) — byte-identity '
  + 'and the measured blob size logged', async () => {
  const plan = capWorstPlan();
  const blob = await encodeCameraPlan(plan, 25);
  console.log(`cp blob, cap-worst 128 cuts + 8 poses: ${blob.length} chars`);
  assert.deepEqual(await decodeCameraPlan(blob, 25), plan);
  assert.ok(blob.length < 2048, `cap-worst cp blob ${blob.length} >= 2048`);
});

test('302: EMPTY plan encodes as the ABSENT param (zero bytes over a v6 '
  + 'link)', async () => {
  assert.equal(await encodeCameraPlan({ cuts: [], poses: [] }), '');
});

test('302: the design-table case (20 cuts + 3 poses) stays a ~280-char '
  + 'blob', async () => {
  const w = capWorstPlan(20);
  const plan: CameraPlan = { cuts: w.cuts.slice(0, 20)
    .map((c) => (c.cam >= 11 ? { ...c, cam: c.cam - 8 } : c)),
  poses: w.poses.slice(0, 3) };
  const blob = await encodeCameraPlan(plan, 20);
  console.log(`cp blob, 20 cuts + 3 poses: ${blob.length} chars`);
  assert.ok(blob.length < 400, `20-cut cp blob ${blob.length} >= 400`);
});

test('302: WORST-CASE URL — 25 worst-case shots + cap-worst plan measured '
  + 'UNDER the share-URL envelope', async () => {
  const g = game(25);
  const r = await encodeShare(g);
  const cp = await encodeCameraPlan(capWorstPlan(), 25);
  const url = `https://example.com/app.html#r=${r}&cp=${cp}`;
  console.log(`worst-case URL (25 shots + 128-cut/8-pose plan): `
    + `${url.length} chars (envelope ${SHARE_URL_ENVELOPE})`);
  assert.ok(url.length < SHARE_URL_ENVELOPE,
    `worst-case URL ${url.length} >= envelope ${SHARE_URL_ENVELOPE}`);
});

test('302: unknown cam/transition ids INSIDE the registry envelope ride '
  + 'through untouched (apply-time degrade, never a decode throw)', async () => {
  const plan: CameraPlan = { cuts: [
    { seg: 0, t: 0, cam: 6, transitionIn: 0, dur: 0 },   // reserved preset
    { seg: 0, t: 50, cam: 200, transitionIn: 0, dur: 0 }, // future id
    { seg: 1, t: 0, cam: 3, transitionIn: 9, dur: 250 }, // future transition
  ],
  poses: [] };
  assert.deepEqual(
    await decodeCameraPlan(await encodeCameraPlan(plan, 2), 2), plan);
});

test('302: cp version gate — a future cp wire version throws the '
  + 'structured not-supported error (the consumer ignores the plan; the '
  + 'replay still plays)', async () => {
  await assert.rejects(
    decodeCameraPlan(await encodeWire([2, [], []])),
    (e: Error) => e instanceof ShareError
      && /camera plan v2 is not supported/.test(e.message)
      && new RegExp(`reads v${CAMERA_PLAN_WIRE_VERSION}`).test(e.message));
});

test('302: cp malformed-input rejection (truncated, garbage, wrong '
  + 'shapes) — always ShareError, never a hang or a partial plan', async () => {
  const good = await encodeCameraPlan(samplePlan(), 3);
  await assert.rejects(decodeCameraPlan(good.slice(0, 12), 3), ShareError);
  await assert.rejects(decodeCameraPlan('%%%%', 3), ShareError);
  await assert.rejects(decodeCameraPlan('AAAA', 3), ShareError);
  await assert.rejects(decodeCameraPlan(await encodeWire([1, []]), 3),
    /wrong shape/); // missing poses element
  await assert.rejects(
    decodeCameraPlan(await encodeWire([1, [[0, 0, 0, 0]], []]), 3),
    /wire tuple has the wrong shape/); // 4-int cut
  await assert.rejects(
    decodeCameraPlan(
      await encodeWire([1, [], [[0, 0, 0, 0, 0, 0, 0]]]), 3),
    /wire tuple has the wrong shape/); // 7-int pose
  await assert.rejects(
    decodeCameraPlan(await encodeWire([1, [[0, 0.5, 0, 0, 0]], []]), 3),
    /not 5 integers/); // fractional centiseconds are not on the grid
  // an EMPTY wire is legal to DECODE (the encoder never writes it — empty
  // plan = absent param — but a hand-built one is not malformed)
  assert.deepEqual(await decodeCameraPlan(await encodeWire([1, [], []]), 3),
    { cuts: [], poses: [] });
});

test('302: cp encode error contract (review r4 P2) — malformed JS inputs '
  + 'answer ShareError, never a TypeError', async () => {
  const bad = [null, undefined, 42, {}, { cuts: [] }, { cuts: [], poses: 5 },
    { cuts: {}, poses: [] }] as unknown as CameraPlan[];
  for (const p of bad) {
    await assert.rejects(encodeCameraPlan(p), (e: Error) => {
      assert.ok(e instanceof ShareError, `${JSON.stringify(p)} -> ${String(e)}`);
      return true;
    });
  }
  // non-iterable pose axes must not escape as a spread TypeError
  await assert.rejects(
    encodeCameraPlan({ cuts: [], poses: [
      { slot: 0, eye: 5, look: [0, 0, 0], fov: 600 } as never] }),
    (e: Error) => e instanceof ShareError && /not 8 integers/.test(e.message));
  // SPARSE arrays must reject on encode (review r6 P2): forEach would skip
  // the hole while JSON.stringify emits null — an undecodable blob out of
  // our own encoder
  await assert.rejects(
    encodeCameraPlan({ cuts: new Array(1), poses: [] } as CameraPlan),
    (e: Error) => e instanceof ShareError && /not 5 integers/.test(e.message));
  await assert.rejects(
    encodeCameraPlan({ cuts: [], poses: new Array(1) } as CameraPlan),
    (e: Error) => e instanceof ShareError && /not 8 integers/.test(e.message));
});

test('302: cp amplification bounds bind BEFORE parse (review r1 P2) — an '
  + 'over-envelope blob and a deflate bomb both refuse without tuple '
  + 'allocation', async () => {
  // blob-length bound: the param can never legitimately exceed the
  // whole-URL envelope
  await assert.rejects(
    decodeCameraPlan('A'.repeat(SHARE_URL_ENVELOPE + 1), 3),
    /past the share-URL envelope/);
  // inflate bound: 100k repeated cut tuples deflate to a few KB but
  // inflate past 1 MB — the bounded inflater cancels at its ceiling,
  // long before JSON.parse or the 128-cut cap could run
  const bomb = await encodeWire(
    [1, Array.from({ length: 100_000 }, () => [0, 0, 0, 0, 0]), []]);
  assert.ok(bomb.length < SHARE_URL_ENVELOPE,
    `the bomb must FIT the blob envelope to prove the inflate bound `
    + `(got ${bomb.length})`);
  await assert.rejects(decodeCameraPlan(bomb, 3), /inflates past/);
});

test('302: cp domain validation — caps, anchor order, registry envelope, '
  + 'pose envelope, fade pairing, custom-slot presence', async () => {
  const cut = (o: Partial<CameraPlanCut>): CameraPlanCut =>
    ({ seg: 0, t: 0, cam: 0, transitionIn: 0, dur: 0, ...o });
  const P = (cuts: CameraPlanCut[], poses: CameraPlan['poses'] = []) =>
    encodeCameraPlan({ cuts, poses }, 8);
  // caps (129th cut / 9th pose refuse — the model caps, mirrored)
  await assert.rejects(P(Array.from({ length: 129 }, (_, k) =>
    cut({ t: k * 10 }))), /129 cuts/);
  await assert.rejects(
    encodeCameraPlan({ cuts: [], poses: Array.from({ length: 9 }, (_, s) => ({
      slot: s, eye: [0, 0, 100], look: [0, 0, 0], fov: 600 })) }, 8),
    /9 poses/);
  // anchors must be non-decreasing in (seg, t)
  await assert.rejects(P([cut({ seg: 1 }), cut({ seg: 0, t: 50 })]),
    /non-decreasing/);
  await assert.rejects(P([cut({ t: 80 }), cut({ t: 20 })]), /non-decreasing/);
  // seg gated against the carrying share's shot count
  await assert.rejects(P([cut({ seg: 8 })]), /out of range/);
  await assert.rejects(
    decodeCameraPlan(await encodeCameraPlan({ cuts: [cut({ seg: 7 })],
      poses: [] }, 8), 3),
    /out of range/); // decode-side cross-validation (open-time law)
  // registry/garbage envelopes
  await assert.rejects(P([cut({ cam: 256 })]), /registry envelope/);
  await assert.rejects(P([cut({ transitionIn: -1 })]), /registry envelope/);
  await assert.rejects(P([cut({ t: 360_001 })]), /centiseconds/);
  // fade/duration pairing (known ids only)
  await assert.rejects(P([cut({ transitionIn: 2, dur: 0 })]),
    /fade needs a duration/);
  await assert.rejects(P([cut({ transitionIn: 2, dur: 501 })]),
    /0\.\.500 centiseconds/);
  await assert.rejects(P([cut({ transitionIn: 1, dur: 10 })]),
    /carry duration 0/);
  // a referenced custom slot must ship its pose
  await assert.rejects(P([cut({ cam: 9 })]), /no pose for slot 1/);
  // pose envelope: eye/look bounds + fov decidegrees + slot order
  const pose = (o: Partial<CameraPlan['poses'][0]>) =>
    ({ slot: 0, eye: [0, 0, 100], look: [0, 0, 0], fov: 600, ...o });
  const Q = (p: CameraPlan['poses'][0]) =>
    encodeCameraPlan({ cuts: [], poses: [p] }, 8);
  await assert.rejects(Q(pose({ eye: [12_001, 0, 100] })), /table envelope/);
  await assert.rejects(Q(pose({ eye: [0, 0, -1] })), /table envelope/);
  await assert.rejects(Q(pose({ look: [0, 4_001, 0] })), /table envelope/);
  await assert.rejects(Q(pose({ look: [0, 0, 3_001] })), /table envelope/);
  await assert.rejects(Q(pose({ fov: 399 })), /decidegrees/);
  await assert.rejects(Q(pose({ fov: 1_101 })), /decidegrees/);
  await assert.rejects(Q(pose({ eye: [0.5, 0, 100] })), /not 8 integers/);
  await assert.rejects(
    encodeCameraPlan({ cuts: [], poses: [pose({ slot: 1 }), pose({ slot: 1 })] }, 8),
    /out of order/);
});
