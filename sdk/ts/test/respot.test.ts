// Copyright (c) Meta Platforms, Inc. and affiliates.

// respot.test.ts — foot-spot respot geometry + ball-in-hand placement
// validity (rules/respot.ts). Pure geometry: a bare {width, length} table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Table } from '../src/index.js';
import { defaultBallParams } from '../src/index.js';
import {
  PLACE_CLEARANCE, clampToBed, footSpot, placementFits, respotBallSpot,
  respotNineSpot,
} from '../src/rules/index.js';
// direct module imports (the barrel re-exports these through a NAMESPACE
// guard for the browser cache contract, typing them possibly-undefined;
// the tests exercise the source module + pin the barrel exposure below)
import { CONTACT_EPS, snapToContact } from '../src/rules/respot.js';
import * as rulesBarrel from '../src/rules/index.js';

test('rules barrel exposes snapToContact/CONTACT_EPS (dynamic-registry seam)', () => {
  assert.equal(typeof rulesBarrel.snapToContact, 'function');
  assert.equal(rulesBarrel.CONTACT_EPS, CONTACT_EPS);
});

const T = { width: 1.27, length: 2.54 } as Table; // WPA 9-ft playing surface
const R = defaultBallParams().r;

test('foot spot is the rack apex point (0, length/4)', () => {
  assert.deepEqual(footSpot(T), { x: 0, y: 2.54 / 4 });
});

test('free foot spot: the 9 respots exactly on it', () => {
  const spot = respotNineSpot(T, R, [{ x: 0.3, y: -0.5 }]);
  assert.deepEqual(spot, footSpot(T));
});

test('respotNineSpot is the frozen alias of the parametrized geometry', () => {
  // feature 011 T011: respotBallSpot is ball-id-free; the 9-ball entry
  // point keeps its export and behavior byte-for-byte (WPA 4.7 8-ball
  // spotting reuses the identical occlusion order)
  const cases = [
    [] as { x: number; y: number }[],
    [footSpot(T)],
    [footSpot(T), { x: 0, y: footSpot(T).y + 2 * R }],
    [{ x: 0.3, y: -0.5 }],
  ];
  for (const obstacles of cases) {
    assert.deepEqual(respotBallSpot(T, R, obstacles),
      respotNineSpot(T, R, obstacles));
  }
});

test('occupied foot spot: fallback moves toward the foot rail', () => {
  const spot = respotNineSpot(T, R, [footSpot(T)]);
  assert.ok(spot, 'a spot must be found');
  assert.equal(spot.x, 0);
  assert.ok(spot.y > footSpot(T).y, 'fallback is toward the foot rail (+y)');
  assert.ok(placementFits(T, R, spot, [footSpot(T)]));
});

test('long string blocked to the foot rail: fallback toward table center', () => {
  // wall of balls every ball-diameter from the foot spot to the foot rail
  const wall: { x: number; y: number }[] = [];
  for (let y = footSpot(T).y; y <= T.length / 2; y += 1.9 * R) {
    wall.push({ x: 0, y });
  }
  const spot = respotNineSpot(T, R, wall);
  assert.ok(spot, 'a spot must be found');
  assert.equal(spot.x, 0);
  assert.ok(spot.y < footSpot(T).y, 'fallback is toward the center (-y)');
  assert.ok(placementFits(T, R, spot, wall));
});

test('placementFits rejects off-bed spots and overlaps', () => {
  assert.equal(placementFits(T, R, { x: T.width / 2, y: 0 }, []), false);
  assert.equal(placementFits(T, R, { x: 0, y: T.length / 2 }, []), false);
  assert.equal(placementFits(T, R, { x: 0, y: 0 }, [{ x: 0, y: 1.5 * R }]), false);
  assert.equal(placementFits(T, R, { x: 0, y: 0 }, [{ x: 0, y: 3 * R }]), true);
});

test('clampToBed clamps a dragged point to the playable bed', () => {
  const p = clampToBed(T, R, { x: 99, y: -99 });
  assert.equal(p.x, T.width / 2 - R - PLACE_CLEARANCE);
  assert.equal(p.y, -(T.length / 2 - R - PLACE_CLEARANCE));
  const q = clampToBed(T, R, { x: 0.1, y: 0.2 });
  assert.deepEqual(q, { x: 0.1, y: 0.2 }); // interior points untouched
});

// ---- feature 012 T022: discipline respot plans (contracts/rulesets-012.md §2)

import {
  caromRespotPlan, snookerRespotPlan, type RespotPlacement,
} from '../src/rules/respot.js';
import { CAROM_LAYOUT, SNOOKER_LAYOUT } from '../src/games/layouts.js';

const SR = SNOOKER_LAYOUT.ballR;

test('snooker respot: vacant own spot wins (WPBSA Sec3 R7(a))', () => {
  const plan = snookerRespotPlan(SNOOKER_LAYOUT, [{ x: 0.4, y: 0.4 }], [21]);
  assert.deepEqual(plan, [{ ball: 21, xy: SNOOKER_LAYOUT.spots[21] }]);
});

test('snooker respot: occupied own spot -> highest-VALUE vacant spot '
  + '(Sec3 R7(b))', () => {
  // a ball sits ON the black spot; black must take the pink spot (the
  // highest-value vacant one)
  const plan = snookerRespotPlan(
    SNOOKER_LAYOUT, [SNOOKER_LAYOUT.spots[21]], [21]);
  assert.deepEqual(plan, [{ ball: 21, xy: SNOOKER_LAYOUT.spots[20] }]);
  // yellow with black+pink occupied: own spot vacant -> stays own
  const plan2 = snookerRespotPlan(
    SNOOKER_LAYOUT,
    [SNOOKER_LAYOUT.spots[21], SNOOKER_LAYOUT.spots[20]], [16]);
  assert.deepEqual(plan2, [{ ball: 16, xy: SNOOKER_LAYOUT.spots[16] }]);
});

test('snooker respot: ALL spots occupied -> nearest point between the OWN '
  + 'spot and the top cushion (Sec3 R7(c))', () => {
  const occupiers = ([16, 17, 18, 19, 20, 21] as const)
    .map((id) => SNOOKER_LAYOUT.spots[id]);
  const plan = snookerRespotPlan(SNOOKER_LAYOUT, occupiers, [21]);
  assert.equal(plan.length, 1);
  const { xy } = plan[0]!;
  assert.equal(xy.x, SNOOKER_LAYOUT.spots[21].x, "the black's own line (x = 0)");
  assert.ok(xy.y > SNOOKER_LAYOUT.spots[21].y, 'toward the top cushion');
  // never touching: 2r + clearance off the black-spot occupier
  const d = Math.hypot(xy.x - SNOOKER_LAYOUT.spots[21].x,
    xy.y - SNOOKER_LAYOUT.spots[21].y);
  assert.ok(d >= 2 * SR + PLACE_CLEARANCE - 1e-12);
  // and on the bed
  assert.ok(xy.y <= SNOOKER_LAYOUT.table.length / 2 - SR - PLACE_CLEARANCE);
});

test('snooker respot case (c): the search line is the colour\'s OWN '
  + 'spot line, NOT the table centre line (issue #90 erratum)', () => {
  // yellow's spot sits at x = +0.292 (right D corner) — with every spot
  // occupied, Sec3 R7(c) places it as near as possible between ITS OWN
  // spot and the nearest point on the top cushion: straight up x = 0.292.
  // The pre-#90 code searched x = 0 (the centre line), a wrong-behavior
  // transcription (rulesets-012.md §2 Amendment A2).
  const occupiers = ([16, 17, 18, 19, 20, 21] as const)
    .map((id) => SNOOKER_LAYOUT.spots[id]);
  const own = SNOOKER_LAYOUT.spots[16];
  const plan = snookerRespotPlan(SNOOKER_LAYOUT, occupiers, [16]);
  assert.equal(plan.length, 1);
  const { xy } = plan[0]!;
  assert.equal(xy.x, own.x, "yellow stays on its own spot's line toward the top cushion");
  assert.ok(xy.y > own.y, 'toward the top cushion');
  // nearest legal point: clears the own-spot occupier by exactly the
  // first step multiple past 2r + clearance, and every other occupier
  for (const o of occupiers) {
    assert.ok(Math.hypot(xy.x - o.x, xy.y - o.y)
      >= 2 * SR + PLACE_CLEARANCE - 1e-12, 'clears every occupied spot');
  }
  // green mirrors on x = −0.292
  const green = snookerRespotPlan(SNOOKER_LAYOUT, occupiers, [17]);
  assert.equal(green[0]!.xy.x, SNOOKER_LAYOUT.spots[17].x);
  assert.ok(green[0]!.xy.y > SNOOKER_LAYOUT.spots[17].y);
});

test('snooker respot case (c) pink/black sub-clause: blocked upward line -> '
  + 'centre line BELOW the spot (Sec3 R7, Amendment A3)', () => {
  // all six spots occupied AND the whole spot→top-cushion segment walled
  // off. Pre-A3 the plan silently OMITTED the colour (black plan []) — the
  // ball never returned to the table and the frame soft-locked (issue #90
  // review follow-up).
  const occupiers = ([16, 17, 18, 19, 20, 21] as const)
    .map((id) => SNOOKER_LAYOUT.spots[id]);
  const own = SNOOKER_LAYOUT.spots[21];
  const maxY = SNOOKER_LAYOUT.table.length / 2 - SR - PLACE_CLEARANCE;
  // wall of touching balls up the line x = 0: every candidate between the
  // black spot and the top cushion sits within 2r of a wall ball
  const wall: { x: number; y: number }[] = [];
  for (let y = own.y; y <= maxY + 2 * SR; y += 2 * SR) wall.push({ x: 0, y });
  const obstacles = [...occupiers, ...wall];
  const plan = snookerRespotPlan(SNOOKER_LAYOUT, obstacles, [21]);
  assert.equal(plan.length, 1, 'the black RETURNS (no silent omission)');
  const { xy } = plan[0]!;
  assert.equal(xy.x, 0, 'on the centre line of the table');
  assert.ok(xy.y < own.y, 'BELOW the spot (toward the bottom cushion)');
  // as near its own spot as possible: within one step past the touching
  // clearance off the spot occupier
  assert.ok(own.y - xy.y <= 2 * SR + PLACE_CLEARANCE + SR / 4,
    'nearest legal point below the spot');
  for (const o of obstacles) {
    assert.ok(Math.hypot(xy.x - o.x, xy.y - o.y)
      >= 2 * SR + PLACE_CLEARANCE - 1e-12, 'never touching another ball');
  }
  // pink mirrors the sub-clause (its own upward segment walled off)
  const pinkOwn = SNOOKER_LAYOUT.spots[20];
  const pinkWall: { x: number; y: number }[] = [];
  for (let y = pinkOwn.y; y <= maxY + 2 * SR; y += 2 * SR) {
    pinkWall.push({ x: 0, y });
  }
  const pink = snookerRespotPlan(
    SNOOKER_LAYOUT, [...occupiers, ...pinkWall], [20]);
  assert.equal(pink.length, 1);
  assert.equal(pink[0]!.xy.x, 0);
  assert.ok(pink[0]!.xy.y < pinkOwn.y, 'pink drops below its spot too');
});

test('snooker respot: multiple colours resolve highest value first, each '
  + 'placement blocking the next (spec edge case)', () => {
  // pink spot occupied by a red; respot pink + black together
  const plan = snookerRespotPlan(
    SNOOKER_LAYOUT, [SNOOKER_LAYOUT.spots[20]], [20, 21]);
  assert.equal(plan.length, 2);
  // black (higher value) resolves FIRST — its own spot is free
  assert.deepEqual(plan[0], { ball: 21, xy: SNOOKER_LAYOUT.spots[21] });
  // pink's own spot is occupied and the black spot was just taken → the
  // next highest-value vacant spot is blue
  assert.deepEqual(plan[1], { ball: 20, xy: SNOOKER_LAYOUT.spots[19] });
});

test('carom respot: red -> top, shooter ball -> bottom, opponent -> centre '
  + '(UMB Art 27.3(b)/28.1(b)); only balls concerned', () => {
  // shooter = player 1 (ball 0); red (2) jumped off — only the red respots
  const balls = [
    { x: -0.3, y: -0.2 },  // ball 0 (shooter cue)
    { x: 0.25, y: 0.4 },   // ball 1 (opponent)
    { x: 0.7, y: 1.41 },   // ball 2 (recorded off-table exit point)
  ];
  const plan = caromRespotPlan(CAROM_LAYOUT, balls, [2], 1);
  assert.deepEqual(plan, [{ ball: 2, xy: CAROM_LAYOUT.spots.top } as RespotPlacement]);
  // shooter's own ball concerned: bottom spot for ball 0 under shooter 1,
  // and for ball 1 under shooter 2
  assert.deepEqual(caromRespotPlan(CAROM_LAYOUT, balls, [0], 1),
    [{ ball: 0, xy: CAROM_LAYOUT.spots.bottom }]);
  assert.deepEqual(caromRespotPlan(CAROM_LAYOUT, balls, [1], 2),
    [{ ball: 1, xy: CAROM_LAYOUT.spots.bottom }]);
  // opponent's ball → centre spot
  assert.deepEqual(caromRespotPlan(CAROM_LAYOUT, balls, [1], 1),
    [{ ball: 1, xy: CAROM_LAYOUT.spots.centre }]);
});

test('carom respot: occupied designated spot -> the occupying ball\'s spot '
  + '(the swap rule)', () => {
  // the opponent ball (1) PARKS ON the top spot; the red must take the
  // occupier's designated spot — the CENTRE spot (ball 1 is the
  // non-shooter under shooter 1)
  const balls = [
    { x: -0.3, y: -0.2 },                          // ball 0
    { x: CAROM_LAYOUT.spots.top.x, y: CAROM_LAYOUT.spots.top.y }, // ball 1 on top spot
    { x: 0.7, y: 1.41 },                           // ball 2 off table
  ];
  const plan = caromRespotPlan(CAROM_LAYOUT, balls, [2], 1);
  assert.deepEqual(plan, [{ ball: 2, xy: CAROM_LAYOUT.spots.centre }]);
});

test('carom respot: two balls concerned resolve without collisions', () => {
  // both cue balls jump; shooter 2 → ball 1 to bottom, ball 0 to centre
  const balls = [
    { x: 0.7, y: 1.41 },   // ball 0 recorded exit
    { x: -0.7, y: -1.41 }, // ball 1 recorded exit
    { x: 0.1, y: 0.2 },    // red stays
  ];
  const plan = caromRespotPlan(CAROM_LAYOUT, balls, [0, 1], 2);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.find((p) => p.ball === 1)!.xy, CAROM_LAYOUT.spots.bottom);
  assert.deepEqual(plan.find((p) => p.ball === 0)!.xy, CAROM_LAYOUT.spots.centre);
  // placements clear each other and the red
  const spots = plan.map((p) => p.xy).concat([balls[2]!]);
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const d = Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.y - spots[j]!.y);
      assert.ok(d >= 2 * CAROM_LAYOUT.ballR, `${i}/${j} overlap`);
    }
  }
});

test('frozen pool respot surfaces stay byte-unchanged by the 012 additions', () => {
  // respotBallSpot / respotNineSpot semantics re-pinned next to the new
  // plans: free foot spot resolves exactly, alias equality holds
  const spot = respotBallSpot(T, R, []);
  assert.deepEqual(spot, footSpot(T));
  assert.deepEqual(respotNineSpot(T, R, []), spot);
});

// ---- GH-370 class 3: snapToContact (frozen in-hand placement) ---------------
test('snapToContact: a fitting request resolves to itself', () => {
  const p = { x: 0.2, y: -0.4 };
  assert.deepEqual(snapToContact(T, R, p, [{ x: 0.5, y: 0.5 }]), p);
});

test('snapToContact: an overlapping request snaps to 2r + 1e-9 from the blocker', () => {
  const ob = { x: 0.1, y: -0.3 };
  const req = { x: 0.1 + R, y: -0.3 }; // half a diameter away: deep overlap
  const got = snapToContact(T, R, req, [ob]);
  assert.ok(got, 'snap must resolve');
  const d = Math.hypot(got.x - ob.x, got.y - ob.y);
  assert.ok(Math.abs(d - (2 * R + CONTACT_EPS)) < 1e-12,
    `distance ${d} != 2r + CONTACT_EPS`);
  assert.ok(got.y === req.y && got.x > req.x, 'projects along blocker→request');
});

test('snapToContact: a recorded snapped landing re-applies VERBATIM (replay identity)', () => {
  const ob = { x: -0.2, y: 0.1 };
  const landed = { x: -0.2 + 2 * R + CONTACT_EPS, y: 0.1 }; // the sender's snap
  const got = snapToContact(T, R, landed, [ob]);
  // byte-exact: the kiss-band arm returns the request itself, never a
  // re-projection through rounding
  assert.deepEqual(got, landed);
});

test('snapToContact: multi-ball squeeze refuses (null)', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 4 * R - 1e-3, y: 0 }; // gap too tight for a third ball
  const got = snapToContact(T, R, { x: 2 * R - 5e-4, y: 0 }, [a, b]);
  assert.equal(got, null);
});

test('snapToContact: request at an obstacle center refuses (null)', () => {
  const ob = { x: 0.3, y: 0.3 };
  assert.equal(snapToContact(T, R, { ...ob }, [ob]), null);
});

test('snapToContact: rail-pinched contact refuses instead of overlapping', () => {
  // blocker against the right cushion; request pushes the cue INTO the rail
  const ob = { x: T.width / 2 - R - PLACE_CLEARANCE, y: 0 };
  const got = snapToContact(T, R, { x: T.width / 2 - R / 2, y: 0 }, [ob]);
  assert.equal(got, null); // bed clamp would re-overlap the blocker
});

test('snapToContact leaves the spotting law untouched (respotBallSpot unchanged)', () => {
  // WPA 1.5 in-contact spotting stays the recorded v1 daylight walk —
  // GH-371 phase-2 item; pin the current geometry so a ride-along change
  // cannot slip in silently
  const spot = footSpot(T);
  const got = respotBallSpot(T, R, [spot]);
  assert.ok(got, 'occupied foot spot still resolves');
  assert.ok(Math.hypot(got.x - spot.x, got.y - spot.y) >= 2 * R + PLACE_CLEARANCE,
    'spotting keeps the PLACE_CLEARANCE daylight law');
});
