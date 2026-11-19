// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-arena-floor.mjs — node arm of the arena's floor furniture (CONTRACT.md 14.2, 15.2, 15.3; owner: floor).
//   1. the plan (arena/floor/plan.js): every item outside the keep-outs (the stroke room, the volume the app's camera can
//      reach, the line from each review camera to its target, the boards' walk-ins); island items inside the boards, hall
//      items clear of the gangway, the seating, the drape and the backdrop's lights; apart from each other;
//      THE CAMERAS AT FULL HEIGHT BY PLACEMENT (15.3): lens 1.4 to 1.6 m over the deck, every point outside the camera
//      volume by the layout's own test with the layout's clearance; proofs that each law bites;
//   2. the PERSON rule and the legal rule: the pinned list of what every item is made of, no name that describes a person,
//      nothing but a camera as tall as one, nothing on a chair or a stool, no word or mark on any canvas; proofs;
//   3. THE ALBEDO LAW (15.2): the classes take the layout's table, the designed and the BUILT means land on it;
//   4. the laws of the round in the part's sources: no three light, no shadow flag, no randomness, no clock, no request;
//   5. the whole part built in node (three from the vendored file, a stub 2D canvas) on every tier, with the room's real
//      light object and without it: budgets, names, the shadow overlays, every vertex finite, inside the hall, outside the
//      stroke room and the camera volume, no mesh box over the table, the walk-ins free, the tool switches, never a throw.
// Run: node web/tools/club/test-club-arena-floor.mjs   (add --stats for the counts per tier)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ARENA, ALBEDO, VIEWS, SIDE, cutPlanes, cameraFloor, inCameraVolume, blockFootprint, seatingRows } from '../../scene/club/arena/layout.js';
import * as LAYOUT_REAL from '../../scene/club/arena/layout.js';
import { planFloor as planFloorReal, planBoxes, planSignature, planCamera, planPlatform, planTower, planStool, platformOk, cameraTilt, checkPlan, checkPeople, hallProblems, clearOfCamera, reachMargin, strokeRect, walkIns, groupOf, tilted,
  blockFrame, seatCentres, sightBlockers, headInPose, LAMP_BOX,
  FLOOR_GEOMETRY_REV, CAM, PLATFORM, TOWER, STOOL, CHAIR, SIDE_TABLE, DESK, REST, THRESHOLD, CABLE, PARTS, PERSON_NAME, STATURE, TABLE } from '../../scene/club/arena/floor/plan.js';
import * as PLAN from '../../scene/club/arena/floor/plan.js';
import * as PAINT from '../../scene/club/arena/floor/paint.js';
import { SWATCHES, SWATCH_CLASS, SWATCH_SHARE, CLASS_ALBEDO, CLASS_SHADE, LEATHER_FILE_MEAN, ATLAS, SHADOW_REGION, SHADOW_LEVEL, swatchUV, swatchAt, regionUV, albedoOf, classScale, leatherPixels, linearMean, linearOf, luminance } from '../../scene/club/arena/floor/paint.js';

// ROUND A5: THE DRESS OF THE PLAYING FLOOR is one switch (floor/plan.js FLOOR_DRESS_DEFAULT; `?clubfloor=dress:0|1`).
// Sections 1 to 4 of this arm hold round A4's laws and pins on the PLAIN variant (dress off: A4's geometry, unchanged),
// whatever the default is: every plan below is asked for with `dress: false` and every build with `dress:0`. Section 5
// holds the laws of the dressed variant, and says which of the two a build without a switch gives.
const DRESS_DEFAULT = PLAN.FLOOR_DRESS_DEFAULT === true;
// ROUND A6: THE ROUND'S SET is a second switch (floor/plan.js FLOOR_A6_DEFAULT; `?clubfloor=a6:0|1`). Sections 1 to 5
// hold their rounds' laws and pins with it OFF, whatever its default is (every plan with `a6: false`, every build with
// `a6:0`); section 6 holds the laws of the set and says which variant a build without a switch gives.
const A6_DEFAULT = PLAN.FLOOR_A6_DEFAULT === true;
const PLAIN = Object.freeze({ dress: false, a6: false });
// ROUND A7: one more switch with a default of its own (floor/plan.js FLOOR_A7_DEFAULT: the round's geometry).
// Sections 1 to 6 hold their rounds' laws and pins with it OFF, whatever the default is: every plan of this arm is
// asked for with `a7: false` unless it names `a7`, and every build's tool switches get `a7:0` unless they name it
// (`qOf` below). Section 7 holds the round's own laws and says what a build without a switch gives. THE READERS OF
// THE HALL'S REFLECTION ARE NO SWITCH (CONTRACT 19.1: the stand-ins are deleted, not turned off): every build of
// every section has the metals at their real reflectance on the hard material and every lit material tagged.
const A7_DEFAULT = PLAN.FLOOR_A7_DEFAULT === true;
// ROUND A8: and one more (FLOOR_A8_DEFAULT: the monitor position on the west floor). Sections 1 to 7 hold their pins
// with it OFF (`a8: false` in every plan, `a8:0` in every build that does not name it); section 8 holds its laws.
const A8_DEFAULT = PLAN.FLOOR_A8_DEFAULT === true;
const planFloorRaw = (a, d, tb = null, o = null) => planFloorReal(a, d, tb, { a7: false, a8: false, ...(o ?? {}) });
const planFloor = (a, d, tb = null, o = PLAIN) => planFloorRaw(a, d, tb, o);

let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const here = fileURLToPath(new URL('.', import.meta.url));
const src = (rel) => fs.readFileSync(`${here}../../scene/club/arena/${rel}`, 'utf8');
const SOURCES = ['floor.js', 'floor/plan.js', 'floor/paint.js', 'floor/items.js'];
const code = (rel) => src(rel).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const clone = (o) => JSON.parse(JSON.stringify(o));
// THE LAYOUT THIS ARM RUNS ON. Round A4 asks the layout's owner for four camera places (two platforms on the north
// seating block, one on the east block, one riser on the hall's floor) and for the desk 7 cm toward the table. While the
// layout does not carry a platform on a seating block yet, the arm runs on a copy patched with exactly those entries
// (and says so); once the layout has them, it runs on the layout itself. The part must build on the layout as it is,
// too: the last arm builds it there.
const A4_PROPOSED = {
  cameras: [
    { id: 'n1', x: 1.45, z: -8.83, lookAt: [0, 0], platform: { w: 1.6, d: 1.13, h: 2.45, on: 'north' } },
    { id: 'ne', x: 9.5, z: -5.5, lookAt: [0, 0], platform: { w: 1.6, d: 1.6, h: 0.30 } },
    { id: 'n2', x: -3.65, z: -8.83, lookAt: [0, 0], platform: { w: 1.6, d: 1.13, h: 2.45, on: 'north' } },
    { id: 'e1', x: 9.46, z: 1.625, lookAt: [0, 0], platform: { w: 1.13, d: 1.6, h: 2.45, on: 'east' } },
  ],
  cables: [{ id: 'ne', path: [[9.5, -5.5], [9.5, -4.36]] }],
  refereeTable: { x: 0.9, z: -3.53 },
};
const LAYOUT_HAS_A4 = (ARENA.floor.cameras ?? []).some((c) => c.platform?.on);
const A = LAYOUT_HAS_A4 ? ARENA : { ...clone(ARENA), floor: { ...clone(ARENA.floor), ...A4_PROPOSED } };
const LAYOUT = LAYOUT_HAS_A4 ? LAYOUT_REAL : { ...LAYOUT_REAL, ARENA: A };
console.log(LAYOUT_HAS_A4 ? 'layout: arena/layout.js carries the round A4 camera places' : 'layout: arena/layout.js does NOT carry the round A4 camera places yet: the arm runs on a copy patched with the entries asked for');
const I = A.island, H = A.hall, clr = A.keepOut.clearance;
// the cameras by what they stand on
const TOWERS = A.floor.cameras.filter((c) => c.platform?.on), RISERS = A.floor.cameras.filter((c) => c.platform && !c.platform.on);
const stroke = strokeRect(A);
const inStroke = (x, z) => x > stroke.x0 && x < stroke.x1 && z > stroke.z0 && z < stroke.z1;

// ---------------------------------------------------------------------------------------------------------------------------
// 1. the plan
// ---------------------------------------------------------------------------------------------------------------------------
ok('plan: every detail level is lawful (stroke room, camera volume, review poses, walk-ins, inside the boards, apart)', () => {
  for (const d of [0, 1, 2]) {
    const p = planFloor(A, d);
    assert.deepEqual(p.problems, [], `detail ${d}`);
    assert.deepEqual(checkPlan(p, A, VIEWS), [], `detail ${d}`);
    for (const b of planBoxes(p)) {
      assert.ok(['north', 'east', 'south', 'west'].includes(b.group), `${b.id}: group ${b.group}`);
      assert.ok(!(b.x0 < stroke.x1 && b.x1 > stroke.x0 && b.z0 < stroke.z1 && b.z1 > stroke.z0), `${b.id} in the stroke room`);
    }
    assert.ok(/^floor-[0-9a-f]{8}$/.test(planSignature(p)));
  }
  const p0 = planFloor(A, 0), p1 = planFloor(A, 1), p2 = planFloor(A, 2);
  const nCam = A.floor.cameras.length;
  assert.ok(nCam >= 2, 'the layout places at least two cameras');
  // the lite room: one camera on its platform and the chairs with their tables; the base room: the first two cameras, the
  // desk, the thresholds; the high room: every camera of the layout. A riser on the hall's floor carries a stool and has
  // a taped run; a platform on a seating block has neither (its cable goes down a standard)
  const shape = (p) => [p.cameras.length, p.platforms.length, p.stools.length, p.chairs.length, p.sideTables.length, !!p.desk, p.thresholds.length, p.cables.length];
  const risers = (k) => A.floor.cameras.slice(0, k).filter((c) => !c.platform?.on).length;
  assert.deepEqual(shape(p0), [1, 1, 0, 2, 2, false, 0, 0]);
  assert.deepEqual(shape(p1), [2, 2, risers(2), 2, 2, true, A.boards.gaps.length, risers(2)]);
  assert.deepEqual(shape(p2), [nCam, nCam, risers(nCam), 2, 2, true, A.boards.gaps.length, risers(nCam)]);
  assert.ok(TOWERS.length >= 2 && RISERS.length >= 1, 'the layout places cameras on the stands and one on the hall\'s floor');
  assert.ok(A.floor.cameras[0].platform?.on && !A.floor.cameras[1].platform?.on, 'the layout\'s order: a platform on the stands first (the default tier\'s wide pose), a floor riser second (the break view)');
  for (const p of [p1, p2]) for (const c of p.cables) {
    const want = A.floor.cables.find((q) => q.id === c.id).path, plat = p.platforms.find((q) => q.id === c.id), cam = p.cameras.find((q) => q.id === c.id);
    assert.deepEqual(c.path.at(-1), want.at(-1), `cable ${c.id} ends where the layout's path ends`);
    // it starts where the camera's cable lands on the carpet: PLATFORM.land out from the deck's edge, on the step-up side
    assert.ok(Math.abs(c.path[0][0] - (plat.x + plat.land[0])) < 1e-6 && Math.abs(c.path[0][1] - (plat.z + plat.land[1])) < 1e-6, `cable ${c.id} starts where the drop lands`);
    const out = Math.max(Math.abs(plat.land[0]) - plat.w / 2, Math.abs(plat.land[1]) - plat.d / 2);
    assert.ok(Math.abs(out - PLATFORM.land) < 1e-6, `cable ${c.id}: the drop lands ${out} m from the deck`);
    assert.ok(c.segments.length >= 1 && c.segments.every((sg) => sg.group === cam.group), `cable ${c.id}: one mesh group with its camera`);
    assert.ok(cam.lead && Math.hypot(cam.lead[0], cam.lead[1]) > CAM.skirtR && Math.hypot(cam.lead[0], cam.lead[1]) < CAM.skirtR + 0.1, `camera ${c.id}: its cable meets the deck beside the skirt`);
  }
  // a camera, its platform and its stool share one mesh group; the corner cameras never open the west group
  for (const p of [p0, p1, p2]) for (const c of p.cameras) {
    const g = p.platforms.find((q) => q.id === c.id).group;
    assert.ok(g === c.group && g !== 'west' && p.stools.filter((s) => s.id === c.id).every((s) => s.group === g), `camera ${c.id}: group ${c.group}`);
  }
  // each platform's step-up side has room to step up from (0.6 m with no seating block in it); where the cable's side has
  // none, the step-up is another side and the cable climbs its own side's kick rail
  for (const pl of p2.platforms.filter((q) => q.zone === 'hall')) {
    const o = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }[pl.open];
    const strip = { x0: o[0] > 0 ? pl.box.x1 : o[0] < 0 ? pl.box.x0 - 0.6 : pl.box.x0, x1: o[0] > 0 ? pl.box.x1 + 0.6 : o[0] < 0 ? pl.box.x0 : pl.box.x1, z0: o[1] > 0 ? pl.box.z1 : o[1] < 0 ? pl.box.z0 - 0.6 : pl.box.z0, z1: o[1] > 0 ? pl.box.z1 + 0.6 : o[1] < 0 ? pl.box.z0 : pl.box.z1 };
    for (const b of A.seating.blocks) { const f = blockFootprint(b, A); assert.ok(!(strip.x0 < f.x1 && strip.x1 > f.x0 && strip.z0 < f.z1 && strip.z1 > f.z0), `platform ${pl.id}: its step-up side (${pl.open}) faces the ${b.id} block`); }
    assert.ok(['east', 'west', 'south', 'north'].includes(pl.cableSide), `platform ${pl.id}: the cable leaves by ${pl.cableSide}`);
  }
  // (a platform on a block opens toward its block's stair aisle; the riser beside the east block steps up from the table's side)
  if (!LAYOUT_HAS_A4 || A.floor.cameras.map((c) => c.id).join() === 'n1,ne,n2,e1') assert.deepEqual(p2.platforms.map((q) => [q.id, q.zone, q.open, q.cableSide]), [['n1', 'stand', 'west', 'west'], ['ne', 'hall', 'west', 'south'], ['n2', 'stand', 'east', 'east'], ['e1', 'stand', 'north', 'north']]);
  const ids = (p) => p.items.map((i) => `${i.kind}.${i.id}`);
  for (const id of ids(p1)) assert.ok(ids(p2).includes(id), `${id} stands in the base room and not in the high room`);
  assert.notEqual(planSignature(p0), planSignature(p1)); assert.notEqual(planSignature(p1), planSignature(p2));
  assert.equal(planSignature(p1), planSignature(planFloor(A, 1)), 'the signature is a function of the plan');
  assert.deepEqual(p1.emitters, [], 'nothing is registered with the room light');
  assert.ok((A.emitters?.floor ?? 3) >= p1.emitters.length);
  assert.equal(stroke.x1, TABLE.hx + A.keepOut.strokeRoom); assert.equal(stroke.z1, TABLE.hz + A.keepOut.strokeRoom);
  // a room that hands a larger keep-out rectangle widens the stroke room; a smaller one does not narrow it
  assert.equal(strokeRect(A, { minX: -3.4, maxX: 3.4, minZ: -2.6, maxZ: 2.6 }).x1, 3.4);
  assert.equal(strokeRect(A, { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }).x1, stroke.x1);
});

ok('cameras (15.3): FULL height (lens 1.4 to 1.6 m over the deck), every point outside the app camera\'s volume by the layout\'s test with its clearance; no view rule', () => {
  const p = planFloor(A, 2);
  assert.equal(p.cameras.length, A.floor.cameras.length, 'every camera of the layout stands');
  assert.deepEqual(CAM.lensRange, [1.4, 1.6]);
  assert.ok(CAM.lensOverDeck >= 1.4 && CAM.lensOverDeck <= 1.6, `the lens is carried ${CAM.lensOverDeck} m over the deck`);
  for (const c of p.cameras) {
    const src0 = A.floor.cameras.find((q) => q.id === c.id);
    assert.ok(platformOk(src0), `${c.id}: the layout's entry carries a platform`);
    assert.equal(c.lensOverDeck, CAM.lensOverDeck); assert.equal(c.deckH, src0.platform.h);
    assert.ok(Math.abs(c.lensH - (c.deckH + c.lensOverDeck)) < 1e-9, `${c.id}: lens ${c.lensH} m over the floor`);
    // the optical axis really is there: the tilt axis plus the lens's offset over it
    assert.ok(Math.abs(c.pivotH + CAM.axis * Math.cos(c.tilt) - c.lensH) < 0.001, `${c.id}: tilt axis ${c.pivotH}`);
    assert.ok(c.top > c.deckH + 1.6 && c.top <= c.deckH + STATURE.cameraOverDeck, `${c.id}: top ${c.top}`);
    // it tilts down to the bed at its target: a riser 11 m away a little, a platform on the stands about 19 degrees
    const want = Math.atan2(c.lensH - A.camera.bedH, Math.hypot(src0.lookAt[0] - c.x, src0.lookAt[1] - c.z));
    assert.ok(c.tilt >= CAM.tiltRange[0] && c.tilt <= CAM.tiltRange[1] && Math.abs(c.tilt - want) < 0.002 && c.tilt === cameraTilt(src0, A), `${c.id}: tilt ${c.tilt} against ${want}`);
    assert.ok(src0.platform.on ? c.tilt > 0.25 && c.zone === 'stand' && c.block === src0.platform.on : c.tilt < 0.15 && c.zone === 'hall', `${c.id}: tilt ${c.tilt}, zone ${c.zone}`);
    // no point of it is farther from its pedestal's axis than CAM.reach (what the plan's footprint and the vertex arm count on)
    for (const [x, , z] of c.control) assert.ok(Math.hypot(x - c.x, z - c.z) <= CAM.reach, `${c.id}: a control point ${Math.hypot(x - c.x, z - c.z)} m from the axis`);
    // THE PLACE: the layout's own test at every proof point (the camera's corners, the pedestal's rim from the deck to the
    // tilt axis, the top), with the layout's clearance round it; and not by height: the point is outside the PLAN reach,
    // so no height of the app's camera is over it
    assert.ok(c.proof.length >= 40, `${c.id}: ${c.proof.length} proof points`);
    for (const [x, hh, z] of c.proof) {
      assert.ok(!inCameraVolume(x, hh, z), `${c.id}: a point at ${hh} m (${x}, ${z}) is inside the camera volume`);
      assert.ok(clearOfCamera(x, hh, z, A), `${c.id}: a point at ${hh} m (${x}, ${z}) is within the clearance of the camera volume`);
      assert.equal(cameraFloor(x, z), Infinity, `${c.id}: (${x}, ${z}) is inside the plan reach`);
      for (const up of [0.9, 1.5, 2.1, 3, 5, 7.2]) assert.ok(!inCameraVolume(x, up, z), `${c.id}: the app's camera can be over (${x}, ${z}) at ${up} m`);
      assert.ok(reachMargin(x, z, A) >= clr, `${c.id}: (${x}, ${z}) is ${reachMargin(x, z, A)} m outside the reach (clearance ${clr})`);
    }
    assert.ok(c.reachMargin >= clr && c.standing && c.why === null);
    // it looks at its target
    const fx = Math.sin(c.ry), fz = Math.cos(c.ry), dx = src0.lookAt[0] - c.x, dz = src0.lookAt[1] - c.z, l = Math.hypot(dx, dz);
    assert.ok(Math.abs(fx * dx / l + fz * dz / l - 1) < 1e-6, `${c.id} does not look at its target`);
    // its platform holds the pedestal with room to stand beside it
    const plat = p.platforms.find((q) => q.id === c.id);
    if (plat.zone === 'hall') assert.ok(plat.w / 2 >= CAM.skirtR + 0.3 && plat.d / 2 >= CAM.skirtR + 0.3 && plat.h >= PLATFORM.hMin && plat.h <= PLATFORM.hMax);
    else assert.ok(plat.w / 2 >= CAM.skirtR + 0.2 && plat.d / 2 >= CAM.skirtR + 0.2 && plat.h <= TOWER.hMax && plat.why === null && c.side === plat.side && plat.side === SIDE[plat.block], `${c.id}: its platform on the ${plat.block} block`);
  }
  assert.equal(p.cameras.filter((c) => c.tally).length, 1, 'one camera is live');
  // THE ARITHMETIC of the placement (the report's): the plan reach, and the cone's underside inside it
  const R = A.camera.radius[1] * Math.sin(A.camera.phi[1]);
  assert.ok(Math.abs(R - 6.4526) < 5e-4, `the plan reach is ${R}`);
  let cone = 0;
  for (let x = A.hall.x0; x <= A.hall.x1; x += 0.05) for (let z = A.hall.z0; z <= A.hall.z1; z += 0.05) { const f = cameraFloor(x, z); if (Number.isFinite(f)) cone = Math.max(cone, f); }
  assert.ok(cone > 1.55 && cone < 1.58, `the cone's underside reaches ${cone} m at the edge of the reach`);
  // a pedestal camera with its lens at the LOW end of the range tops out over the cone's highest point less the clearance:
  // no place inside the reach holds a full-height camera, on a platform or on the floor
  const topOverLens = tilted([0, CAM.top, -0.51])[1] - CAM.axis * Math.cos(CAM.tilt);
  assert.ok(CAM.lensRange[0] + topOverLens > cone - clr, `a camera ${CAM.lensRange[0] + topOverLens} m tall would fit under the cone (${cone})`);
  // THE LAW BITES: the island places of round A2, the gangway behind the far boards, a corner too near, and the two
  // places a real event would take first (a riser at the front of the north stand behind the boards, the master-shot
  // riser on the table's axis behind the east boards): not standing, and why
  const deck = { w: 1.6, d: 1.6, h: 0.3 };
  for (const [x, z] of [[5.0, 1.6], [-2.8, -3.7], [6.2, 0], [7.0, -4.9], [7.6, -5.4], [1.5, -5.0], [6.4, 0]]) {
    const bad = planCamera({ id: 'x', x, z, lookAt: [0, 0], platform: deck }, A, 0);
    assert.ok(!bad.standing && /inside the volume the app's camera can reach/.test(bad.why), `a full-height camera at (${x}, ${z}) passes`);
    const pl = planFloor({ ...clone(A), floor: { ...clone(A.floor), cameras: [{ id: 'x', x, z, lookAt: [0, 0], platform: deck }], cables: [] } }, 2);
    assert.ok(pl.cameras.length === 0 && pl.platforms.length === 0 && pl.stools.length === 0 && pl.problems.some((s) => /^camera\.x: /.test(s)), `a camera at (${x}, ${z}) is planned`);
  }
  // ... and a platform on a block's FRONT rows (inside the reach), however high: refused by the same test
  for (const [x, z, h] of [[1.45, -6.6, 1.9], [1.45, -7.6, 2.2], [7.9, 1.625, 1.9]]) {
    const bad = planCamera({ id: 'x', x, z, lookAt: [0, 0], platform: { w: 1.6, d: 1.13, h, on: z < -5 ? 'north' : 'east' } }, A, 0);
    assert.ok(!bad.standing && /inside the volume the app's camera can reach/.test(bad.why), `a camera on the stands at (${x}, ${z}) passes`);
  }
  // no platform, no camera: it is never run down to fit (round A2's way) and never hidden by view
  const bare = planCamera({ id: 'y', x: 8.3, z: -5.9, lookAt: [0, 0] }, A, 0);
  assert.ok(!bare.standing && /no platform/.test(bare.why));
  const old = planFloor({ ...clone(A), floor: { ...clone(A.floor), cameras: [{ id: 'east', x: 5.0, z: 1.6, lookAt: [0, 0] }, { id: 'north', x: -2.8, z: -3.7, lookAt: [0, 0] }], cables: [] } }, 1);
  assert.ok(old.cameras.length === 0 && old.problems.length === 2 && old.chairs.length === 2 && !!old.desk, 'round A2\'s layout: no camera, the rest stands');
  // NO VIEW RULE of the part's own: nothing is run down, shown, hidden or switched by where the app's camera is. The one
  // thing the part carries is the hall's cut side for what stands ON a seating block (CONTRACT 15.3's exception: the
  // hall's cut-away): `hide: true` once, on the hard material, and `roomSide` written from the plan's `side`, in floor.js
  for (const f of ['floor.js', 'floor/plan.js', 'floor/items.js']) assert.ok(!/pivotMax|pivotMin|update\s*\(\s*camera|\.visible\s*=(?!=)(?!\s*l === level)|onBeforeRender|onBeforeCompile|cameraPosition|setSides|uRoomSides/.test(code(f)), `${f}: a run-down pedestal or a view rule`);
  for (const f of ['floor/plan.js', 'floor/items.js']) assert.ok(!/hide:\s*true|roomSide/.test(code(f)), `${f}: the cut is floor.js's alone`);
  assert.equal((code('floor.js').match(/hide:\s*true/g) ?? []).length, 1, 'floor.js: one material carries the hall\'s cut');
  assert.equal((code('floor.js').match(/roomSide/g) ?? []).length, 1, 'floor.js: the cut side is written once, as a vertex attribute');
  assert.ok(/sides\.fill\(side, from, to\)/.test(code('floor.js')) && /it\.side && hard\.count > from/.test(code('floor.js')), 'floor.js: the cut side comes from the plan\'s `side` of the item that was placed');
  const y = tilted([0, 0, 1], 0.1); assert.ok(y[1] < 0 && y[2] > 0.99, 'a positive tilt puts the lens down');
});

ok('platforms on a seating block (16.5): outside the reach, over folded seats with their underside clear, standards on the rows\' walkways at seat centres, the block\'s cut side; the laws bite', () => {
  const p = planFloor(A, 2), S = A.seating, rows = seatingRows(S);
  const towers = p.platforms.filter((q) => q.zone === 'stand');
  assert.equal(towers.length, TOWERS.length, 'every platform the layout puts on a block stands');
  for (const t of towers) {
    const blk = S.blocks.find((b) => b.id === t.block), f = blockFrame(blk, A);
    assert.equal(t.why, null); assert.equal(t.side, SIDE[blk.side]); assert.ok(t.side > 0);
    // the whole deck is outside the plan reach (its top is far over the cone's underside: no height of the app's camera is over it)
    for (const [x, z] of [[t.box.x0, t.box.z0], [t.box.x0, t.box.z1], [t.box.x1, t.box.z0], [t.box.x1, t.box.z1]]) {
      assert.ok(reachMargin(x, z, A) >= clr, `platform ${t.id}: a deck corner (${x}, ${z}) is ${reachMargin(x, z, A)} m outside the reach`);
      assert.equal(cameraFloor(x, z), Infinity);
    }
    // inside its block, clear of the stair aisle (the hoops stand inside the aisle's edges)
    const [sa, pa] = f.of(t.box.x0, t.box.z0), [sb, pb] = f.of(t.box.x1, t.box.z1), s0 = Math.min(sa, sb), s1 = Math.max(sa, sb), d0 = Math.min(pa, pb), d1 = Math.max(pa, pb);
    assert.ok(s0 >= Math.min(blk.from, blk.to) && s1 <= Math.max(blk.from, blk.to) && (s0 >= blk.aisleAt + S.aisleWidth / 2 + 0.04 || s1 <= blk.aisleAt - S.aisleWidth / 2 - 0.04), `platform ${t.id}: along the block ${s0} .. ${s1}`);
    // its underside clears every seat part under it, by the surround's own seat
    assert.ok(t.rows.length >= 3, `platform ${t.id}: ${t.rows.length} seat parts under its deck`);
    for (const r of t.rows) assert.ok(r.top + TOWER.clear <= t.h - TOWER.under + 1e-9, `platform ${t.id}: the ${r.what} of row ${r.row} (${r.top} m) under an underside at ${t.h - TOWER.under}`);
    // four standards: two seat centres along the rows, the walkway of two rows across them
    assert.equal(t.legs.length, 4);
    const centres = seatCentres(blk, A);
    for (const l of t.legs) {
      const [s, d] = f.of(t.x + l.x, t.z + l.z), row = rows.find((r) => d >= r.offset && d < r.offset + S.tread);
      assert.ok(centres.some((q) => Math.abs(q - s) < 1e-6), `platform ${t.id}: a standard at ${s} along the block is not at a seat's middle`);
      assert.ok(row && row.row === l.row && Math.abs(row.h - l.base) < 1e-9 && d - row.offset >= TOWER.walk[0] - 1e-9 && d - row.offset <= TOWER.walk[1] + 1e-9, `platform ${t.id}: a standard ${d - (row?.offset ?? 0)} m behind row ${row?.row}'s front edge`);
      assert.ok(Math.abs(l.x) < t.w / 2 - 0.02 && Math.abs(l.z) < t.d / 2 - 0.02 && t.h - l.base > 0.6, `platform ${t.id}: a standard under the deck`);
    }
    // the rows its black skirt ends on: from the deck's front edge to its rear edge without a gap, each row's own deck, rising
    assert.ok(t.steps.length >= 2 && t.steps[0].from === 0 && Math.abs(t.steps.at(-1).to - (d1 - d0)) < 1e-6, `platform ${t.id}: steps ${JSON.stringify(t.steps)}`);
    for (const [i, st] of t.steps.entries()) {
      const row = rows.find((r) => r.row === st.row);
      assert.ok(row && Math.abs(row.h - st.h) < 1e-9 && d0 + st.from >= row.offset - 1e-6 && d0 + st.to <= row.offset + S.tread + 1e-6 && t.h - st.h > 0.6, `platform ${t.id}: step ${JSON.stringify(st)}`);
      if (i) assert.ok(Math.abs(st.from - t.steps[i - 1].to) < 1e-6 && st.h > t.steps[i - 1].h);
    }
    // the open end faces the stair aisle; the cable leaves by it over the rear-most row's walkway (no seat part stands
    // there) and meets that row a hand outside the deck's edge
    const mid = (s0 + s1) / 2, toAisle = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[t.open], [ax, az] = f.at(blk.aisleAt, (d0 + d1) / 2);
    assert.ok((ax - t.x) * toAisle[0] + (az - t.z) * toAisle[1] > 0 && Math.abs(mid - blk.aisleAt) > 0.5, `platform ${t.id}: its open end (${t.open}) does not face the aisle`);
    assert.ok(t.exit && t.land && t.cover && !('coil' in t));
    {
      const [es, ed] = f.of(t.x + t.exit[0], t.z + t.exit[1]), [ls, ld] = f.of(t.x + t.land[0], t.z + t.land[1]), back = t.steps.at(-1), row = rows.find((r) => r.row === back.row);
      assert.ok(Math.abs(es - (t.openEnd ? s1 : s0)) < 1e-6 && Math.abs(ed - ld) < 1e-6 && Math.abs(Math.abs(ls - es) - TOWER.hang) < 1e-6 && (ls - es) * (t.openEnd ? 1 : -1) > 0, `platform ${t.id}: the cable leaves at ${es}, lands at ${ls}`);
      assert.ok(ed - row.offset >= TOWER.walk[0] && ed - row.offset < TOWER.zones[0].from - 0.02 && t.landH === back.h, `platform ${t.id}: the cable meets row ${row.row} ${ed - row.offset} m behind its front edge`);
      assert.ok(TOWER.hang > TOWER.drape && TOWER.drape <= 0.045);
    }
    assert.ok(Math.abs(t.cover.x) < t.w / 2 - 0.18 && Math.abs(t.cover.z) < t.d / 2 - 0.18 && Math.hypot(t.cover.x, t.cover.z) > CAM.skirtR + 0.2, `platform ${t.id}: the folded cover at ${JSON.stringify(t.cover)}`);
    // nothing of the rig hangs in its camera (the perimeter truss's lower chords and the hung screens' lower edge)
    const cam = p.cameras.find((q) => q.id === t.id);
    assert.ok(cam.top < 4.6, `camera ${t.id}: top ${cam.top} m`);
  }
  // the numbers of the surround's folded seat that the plan counts on (arena/surround/plan.js SEAT; the layout's rows)
  assert.deepEqual([TOWER.seatLine, TOWER.zones.map((z) => z.top)], [0.60, [0.62, 0.76, 0.88]]);
  // THE LAWS BITE: a deck that does not clear the seat backs; over the stair aisle; off the block; with no walkway under its edge
  const tower = (edit) => { const c = clone(TOWERS[0]); edit(c); return planTower(c, A); };
  assert.ok(/does not clear the seat backs/.test(tower((c) => { c.platform.h = 2.2; }).why));
  assert.ok(/over the stair aisle/.test(tower((c) => { c.x = 0.4; }).why));
  assert.ok(/leaves the block/.test(tower((c) => { c.x = 5.2; }).why));
  assert.ok(/no seating block/.test(tower((c) => { c.platform.on = 'west'; }).why));
  assert.ok(/does not clear/.test(tower((c) => { c.z -= 0.4; }).why), 'a deck pushed 0.4 m back stands over the next row\'s seat backs');
  const refused = planFloor({ ...clone(A), floor: { ...clone(A.floor), cameras: [{ ...clone(TOWERS[0]), platform: { ...TOWERS[0].platform, h: 2.2 } }], cables: [] } }, 2);
  assert.ok(refused.cameras.length === 0 && refused.platforms.length === 0 && refused.problems.some((s) => /^platform\.\w+: .*does not clear/.test(s)), 'a platform that does not clear the seats is built');
  assert.ok(!platformOk({ platform: { w: 1.6, d: 1.13, h: TOWER.hMax + 0.1, on: 'north' } }) && !platformOk({ platform: { w: 1.6, d: 1.13, h: 2.45 } }) && platformOk({ platform: { w: 1.6, d: 1.13, h: 2.45, on: 'north' } }), 'a deck over 0.6 m needs a block to stand on');
});

ok('where the review poses frame the cameras (16.5), by projection before any picture: a head of 40 px or more in V10 and in BACK, one in the break view\'s background, none in TV', () => {
  const p = planFloor(A, 2), blockers = sightBlockers(A);
  assert.deepEqual({ ...LAMP_BOX }, { hx: 1.155, hz: 0.46, y0: 0.975, y1: 1.20 });
  const view = (id) => VIEWS.find((v) => v.id === id);
  const table = {};
  for (const cm of p.cameras) { table[cm.id] = {}; for (const id of ['V10', 'BACK', 'TV', 'V3', 'V1', 'V9']) table[cm.id][id] = headInPose(cm, view(id), A, [1280, 720], blockers); }
  if (process.argv.includes('--stats')) for (const [id, row] of Object.entries(table)) console.log(`STATS head of camera ${id}: ${Object.entries(row).map(([v, q]) => `${v} ${q ? `${q.w}x${q.h} at (${q.at}) in frame ${q.inFrame} seen ${q.seen}${Object.keys(q.covered).length ? ` covered ${JSON.stringify(q.covered)}` : ''}` : 'behind'}`).join(' | ')}`);
  const whole = (q) => q && q.inFrame === 1 && q.seen === 1 && q.w >= 40 && q.h >= 40;
  const inPose = (id) => p.cameras.filter((cm) => whole(table[cm.id][id])).map((cm) => cm.id);
  // V10: at least one head of 40 x 40 px or more, whole and uncovered; it is a platform on the stands
  assert.ok(inPose('V10').length >= 1 && inPose('V10').every((id) => p.cameras.find((cm) => cm.id === id).zone === 'stand'), `V10 holds ${JSON.stringify(inPose('V10'))}`);
  assert.ok(inPose('V10').includes(p.cameras[0].id), 'the first camera (the one every tier builds, the lit tally) is not whole in V10');
  assert.ok(inPose('BACK').length >= 1, `BACK holds ${JSON.stringify(inPose('BACK'))}`);
  assert.ok(inPose('V3').length >= 1 && inPose('V3').some((id) => p.cameras.find((cm) => cm.id === id).zone === 'hall'), `the break view holds ${JSON.stringify(inPose('V3'))}`);
  // the base room builds the first two: V10's and the break view's
  const base = planFloor(A, 1).cameras.map((cm) => cm.id);
  assert.ok(base.some((id) => inPose('V10').includes(id)) && base.some((id) => inPose('V3').includes(id)), `the base room's cameras ${base}`);
  // TV looks down: its top edge is under the horizon, so no full-height head outside the reach is in its frame
  for (const cm of p.cameras) assert.ok(!table[cm.id].TV || table[cm.id].TV.inFrame === 0, `TV holds the head of ${cm.id}: update the report`);
  // a floor riser behind the table light's housing in V10: half covered (the report says so; a platform on the stands is not)
  for (const cm of p.cameras.filter((q) => q.zone === 'hall')) assert.ok((table[cm.id].V10?.covered?.housing ?? 0) > 0.2, `the riser ${cm.id} is clear of the housing in V10: update the report`);
  // the function bites: a camera behind the pose, a head behind the boards
  assert.equal(headInPose({ control: [[-8, 1.8, 5]] }, view('V10'), A), null);
  assert.ok(headInPose({ control: [[3, 0.5, -4.6]] }, view('V10'), A).covered.boards === 1);
});

ok('plan: the laws bite (a camera in the stroke room, a chair on a review line, a thing in a walk-in, a tall thing, a thing through the boards)', () => {
  const lay = (edit) => { const a = clone(A); edit(a); return a; };
  // in the stroke room: not planned, and named
  let p = planFloor(lay((a) => { a.floor.chairs[0] = { id: 'a', x: 2.6, z: 0.4 }; }), 1);
  assert.ok(p.problems.some((s) => /chair\.a.*stroke room/.test(s)) && !p.chairs.some((c) => c.id === 'a'), JSON.stringify(p.problems));
  // a camera inside the app camera's reach is not planned, and named
  const cam1 = A.floor.cameras[1];
  p = planFloor(lay((a) => { a.floor.cameras[1] = { ...clone(cam1), x: 0, z: -2.5 }; }), 1);
  assert.ok(p.problems.some((s) => new RegExp(`camera\\.${cam1.id}`).test(s)) && !p.cameras.some((c) => c.id === cam1.id), JSON.stringify(p.problems));
  // on the line of a review pose (BACK looks from [3.9, 1.3, 1.9] toward the head of the table): a made-up pose through the chair
  p = planFloor(A, 1);
  const through = [{ id: 'T', cam: [A.floor.chairs[0].x + 0.8, -0.4, A.floor.chairs[0].z - 0.2], target: [0, 0, 0], fov: 40 }];
  assert.ok(checkPlan(p, A, through).some((s) => /chair\.a stands between the review camera T/.test(s)));
  const cam0 = A.floor.cameras[0];
  assert.ok(checkPlan(p, A, [{ id: 'S', cam: [cam0.x, 0.1, cam0.z], target: [0, 0, 0], fov: 40 }]).some((s) => new RegExp(`review camera S stands in (camera|platform)\\.${cam0.id}`).test(s)));
  // a pose that looks at the table THROUGH a corner camera
  const k = 1.4, past = [{ id: 'P', cam: [cam0.x * k, 1.0, cam0.z * k], target: [0, 0.2, 0], fov: 40 }];
  assert.ok(checkPlan(p, A, past).some((s) => new RegExp(`camera\\.${cam0.id} stands between the review camera P`).test(s)));
  // the hall's own keep-outs: the gangway round the boards, a seating block, the drape, the backdrop's lights
  const box = (x0, x1, z0, z1) => ({ id: 't', x0, x1, z0, z1, h: 0.4 });
  assert.ok(hallProblems(box(5.7, 6.5, -1, 1), A).some((s) => /gangway/.test(s)));
  assert.ok(hallProblems(box(7.5, 9.1, -5.0, -3.4), A).some((s) => /east seating block/.test(s)));
  assert.ok(hallProblems(box(13.0, 13.8, -12.4, -11.6), A).some((s) => /drape/.test(s)));
  assert.ok(hallProblems(box(-8.3, -7.5, -1, 1), A).some((s) => /floor lights/.test(s)));
  for (const pl of planFloor(A, 2).platforms.filter((q) => q.zone === 'hall')) assert.deepEqual(hallProblems({ id: `platform.${pl.id}`, ...pl.box }, A), [], `platform ${pl.id}`);
  // (a riser on the floor may not stand in a block: only an entry with `platform.on` may, and planTower holds its laws)
  assert.ok(hallProblems({ id: 't', ...planFloor(A, 2).platforms.find((q) => q.zone === 'stand').box }, A).some((s) => /seating block/.test(s)));
  // a deck too small for the pedestal and a stool: the stool is left out
  const tight = planPlatform({ id: 'q', x: 9, z: -8, lookAt: [0, 0], platform: { w: 1.2, d: 1.2, h: 0.3 } });
  assert.equal(planStool(tight, { x: 9, z: -8, ry: 0 }, [0, 0]), null);
  // the step-up side is where the cable's path leaves the deck; without a path, the side away from the table
  assert.equal(planPlatform({ id: 'q', x: 9, z: -8, lookAt: [0, 0], platform: deckOf() }, { path: [[9, -8], [9, -12]] }).open, 'north');
  assert.equal(planPlatform({ id: 'q', x: 9, z: -8, lookAt: [0, 0], platform: deckOf() }, { path: [[9, -8], [5, -8]] }).open, 'west');
  assert.equal(planPlatform({ id: 'q', x: 9, z: -2, lookAt: [0, 0], platform: deckOf() }).open, 'east');
  assert.equal(planPlatform({ id: 'q', x: 9, z: -8, lookAt: [0, 0], platform: deckOf() }, { path: [[9, -8], [9.2, -8.1]] }).tape, null, 'a path that stays on the deck lays no tape');
  // in a walk-in
  const g = A.boards.gaps[0];
  p = planFloor(lay((a) => { a.floor.chairs[1] = { id: 'b', x: (g.from + g.to) / 2, z: I.z0 + 0.5 }; a.floor.sideTables = []; }), 1);
  assert.ok(checkPlan(p, A, VIEWS).some((s) => /chair\.b stands in the north walk-in/.test(s)), JSON.stringify(checkPlan(p, A, VIEWS)));
  // through the boards
  p = planFloor(lay((a) => { a.floor.refereeTable = { x: 0.9, z: -4.2 }; }), 1);
  assert.ok(checkPlan(p, A, VIEWS).some((s) => /desk\.\w+ is not inside the boards/.test(s)));
  // a tall box (measured on built geometry) reaches the camera volume
  p = planFloor(A, 1);
  const tall = planBoxes(p).map((b) => (b.id === 'chair.a' ? { ...b, h: 1.4 } : b));
  assert.ok(checkPlan(p, A, VIEWS, tall).some((s) => /chair\.a \(top 1\.4 m\) reaches the app camera's volume/.test(s)));
  // two things in one place
  p = planFloor(lay((a) => { a.floor.sideTables = [{ id: 'a', x: a.floor.chairs[0].x, z: a.floor.chairs[0].z + 0.1 }, a.floor.sideTables[1]]; }), 1);
  assert.ok(checkPlan(p, A, VIEWS).some((s) => /overlap/.test(s)));
  // a cable across the stroke room is not laid (and its riser has no drop)
  const riser = RISERS[0];
  p = planFloor(lay((a) => { a.floor.cables[0] = { id: riser.id, path: [[riser.x, riser.z], [riser.x, 0], [-5.0, 0]] }; }), 2);
  assert.ok(p.problems.some((s) => new RegExp(`cable\\.${riser.id}.*stroke room`).test(s)) && !p.cables.some((c) => c.id === riser.id) && p.platforms.find((q) => q.id === riser.id).exit === null);
  // a cable entry for a platform on a block is ignored (its cable goes down a standard): the platform keeps its own
  p = planFloor(lay((a) => { a.floor.cables.push({ id: TOWERS[0].id, path: [[TOWERS[0].x, TOWERS[0].z], [TOWERS[0].x, TOWERS[0].z - 0.2]] }); }), 2);
  assert.ok(p.problems.length === 0 && p.platforms.find((q) => q.id === TOWERS[0].id).exit !== null && !p.cables.some((c) => c.id === TOWERS[0].id));
  assert.equal(groupOf({ x0: -1, x1: 1, z0: -1, z1: 1 }, stroke), null);
  // the island's order (east, west, south, north) and the hall's (east, north, south, west)
  assert.equal(groupOf({ x0: -7.5, x1: -5.9, z0: -8.1, z1: -6.5 }, stroke), 'west');
  assert.equal(groupOf({ x0: -7.5, x1: -5.9, z0: -8.1, z1: -6.5 }, stroke, ['east', 'north', 'south', 'west']), 'north');
  assert.equal(walkIns(A).length, A.boards.gaps.length);
});
function deckOf() { return { w: 1.6, d: 1.6, h: 0.3 }; }

// ---------------------------------------------------------------------------------------------------------------------------
// 2. no people, no words
// ---------------------------------------------------------------------------------------------------------------------------
const PINNED_PARTS = {
  camera: ['skirt', 'bumper', 'wheel', 'column', 'collar', 'stage', 'ring', 'spoke', 'panTilt', 'cradle', 'wedge', 'supporter', 'housing', 'lens', 'hood', 'bezel', 'glass', 'label', 'plate', 'vent', 'panel', 'handle', 'loom', 'tie', 'finder', 'screen', 'visor', 'tally', 'bar', 'grip', 'zoom', 'focus', 'connector', 'lead'],
  platform: ['deck', 'joint', 'wear', 'mark', 'cover', 'frame', 'post', 'foot', 'kick', 'bracket', 'nosing', 'drop', 'standard', 'jack', 'ledger', 'rail', 'drape'],
  stool: ['seat', 'strut', 'rung', 'tip'],
  chair: ['glide', 'plinth', 'cushion', 'arm', 'back', 'pad', 'piping', 'crease'],
  sideTable: ['base', 'stem', 'top', 'bottle', 'stopper', 'towel', 'chalk'],
  desk: ['cloth', 'hem', 'slab', 'tray', 'lining', 'rack', 'duster', 'shaft', 'bumper', 'ferrule', 'bridge'],
  threshold: ['strip', 'edge'],
  cable: ['tape'],
};
// the built shapes per tier for one geometry revision (see the arm 'the shapes are the pinned shapes')
const PINNED_GEOMETRY = { rev: 7, lite: '9797e38c', base: 'fe06d814', high: '31f96a5d' };
const PINNED_SWATCHES = ['housing', 'lens', 'rubber', 'skirt', 'column', 'label', 'top', 'pad', 'tape', 'cloth', 'leatherFlat', 'deck', 'nosing', 'chrome', 'alu', 'steel', 'glass', 'screen', 'tallyOff', 'tally', 'tallyRim', 'tray', 'lining',
  'wood', 'brass', 'steelBrushed', 'towel', 'chalk', 'chalkWrap', 'piping', 'wear', 'cover'];
// round A5, the dress: a clear bottle or glass, a green cap, a dark screen with a dim glow, a screen's plain level bar,
// the ice bucket's brushed steel as it reads in a hall that gives it no mirror image
// (round A6: five more, in the same strip, whose cells are 16 px wide from this round on: the work lamp's lit opening,
// two glass cells that carry an ALPHA (paint.js ALPHA: the high room's blended material reads it), brushed steel at its
// real reflectance for that material, and an opaque dark bottle glass for the rooms that have no blended material)
// (round A7: one more: spike tape, a matt muted yellow; two DELETED: `satin`, the ice bucket's grey stand-in, and
// `bottle`, a darkened steel nothing draws any more: `steelBrushed`, steel at its real reflectance, stands in its place
// in the list above)
const PINNED_DRESS_SWATCHES = ['water', 'capGreen', 'glowScreen', 'glowBar', 'glowLamp', 'glassThin', 'glassThick', 'bottleGlass', 'glassBottle', 'spike', 'body', 'zoom'];
// the albedo law: which swatches are finishes of a class of the layout's table (a tone scaled onto the class value)
const PINNED_CLASSES = { housing: 'black', lens: 'black', rubber: 'black', skirt: 'black', column: 'black', label: 'black', top: 'black', pad: 'black', tape: 'black', cloth: 'cloth', leatherFlat: 'leather', deck: 'deck', nosing: 'nosing' };

// ROUND A5: what the dress adds to that list (new kinds, and new parts of the kinds above); each audited against the
// person rule: a remote camera's parts are a base plate, a post and a camera in a yoke; a towel lies over a chair's ARM
// (the brief's own item; nothing lies on a seat and nothing is worn or carried)
const PINNED_DRESS_PARTS = {
  camera: ['edge'],
  chair: ['towel', 'mark'],
  sideTable: ['bucket', 'glass', 'cap'],
  remote: ['base', 'post', 'clamp', 'pan', 'yoke', 'housing', 'lens', 'hood', 'glass', 'handle', 'lead', 'mark'],
  monitor: ['foot', 'case', 'screen', 'bar'],
  bin: ['tub', 'liner'],
  cueStand: ['base', 'post', 'rest'],
};
const ALL_PARTS = clone(PINNED_PARTS);
for (const [item, list] of Object.entries(PINNED_DRESS_PARTS)) ALL_PARTS[item] = [...(ALL_PARTS[item] ?? []), ...list];
// ROUND A6 (CONTRACT 18): what the round's set adds (plan.js A6_PARTS), each audited against the person rule:
//   workLight   a work lamp on a mast at a camera platform's corner: a thin mast and a 10 cm can, nothing as wide as a
//               figure (the rule below holds its parts to a hand's width) and nothing hung on it;
//   remote      `ballast`: a small shot weight lying on the low camera's base plate (production ballast: a plain dark
//               sack of lead shot, no strap, no label, 6 cm high: nobody's belonging); `coil`: spare cable tied in a
//               loop on the post;
//   roadCase    a production flight case on castors, closed, blank (equipment, as the cameras are);
//   trolley     a two-shelf cart with a lined tray and a folded cloth; `spot`: a tape cross on the carpet where a
//               camera stands during a session, with a coil of its cable beside it; `scuff`: worn tape at a gate;
//               `spare`: a second rest lying on the desk.
const PINNED_A6_PARTS = {
  workLight: ['flange', 'sleeve', 'mast', 'swivel', 'can', 'lens', 'lead'],
  remote: ['ballast', 'coil'],
  desk: ['spare'],
  threshold: ['scuff'],
  roadCase: ['box', 'edge', 'latch', 'grip', 'castor'],
  trolley: ['frame', 'shelf', 'castor', 'tray', 'lining', 'cloth'],
  spot: ['cross', 'coil'],
};
const A6_ALL_PARTS = clone(ALL_PARTS);
for (const [item, list] of Object.entries(PINNED_A6_PARTS)) A6_ALL_PARTS[item] = [...(A6_ALL_PARTS[item] ?? []), ...list];

ok('people: the list of what every item is made of is the pinned list; no name describes a person; the rule bites', () => {
  assert.deepEqual(clone(PARTS), PLAN.A6_PARTS ? A6_ALL_PARTS : PLAN.DRESS_PARTS ? ALL_PARTS : PINNED_PARTS, 'a new part: audit it against the person rule, then update PINNED_PARTS');
  if (PLAN.DRESS_PARTS) assert.deepEqual(clone(PLAN.DRESS_PARTS), PINNED_DRESS_PARTS);
  if (PLAN.A6_PARTS) assert.deepEqual(clone(PLAN.A6_PARTS), PINNED_A6_PARTS);
  for (const [item, list] of Object.entries(PARTS)) { assert.ok(!PERSON_NAME.test(item), item); for (const p of list) assert.ok(!PERSON_NAME.test(p), `${item}.${p}`); }
  for (const w of ['person', 'people', 'figure', 'silhouette', 'head', 'headset', 'face', 'crowd', 'spectator', 'audience', 'player', 'referee', 'operator', 'jacket', 'coat', 'hat', 'bag', 'body', 'torso', 'mannequin']) assert.ok(PERSON_NAME.test(w), w);
  for (const w of ['housing', 'panTilt', 'finder', 'visor', 'stopper', 'arm', 'back', 'pad', 'glide', 'plinth', 'cushion', 'towel', 'chalk', 'bridge', 'shaft', 'deck', 'kick', 'post', 'foot', 'nosing', 'strut', 'rung', 'seat', 'hem', 'lining',
    'standard', 'jack', 'ledger', 'rail', 'drape', 'cover', 'wear', 'mark', 'plate', 'tie', 'crease']) assert.ok(!PERSON_NAME.test(w), `${w} is a part of furniture`);
  const plan = planFloor(A, 2), ch = plan.chairs[0], cam = plan.cameras[0], st = plan.stools[0], tw = plan.platforms.find((q) => q.zone === 'stand');
  // a platform on a seating block: its parts end at its guard rail (hip height over ITS deck); nothing taller stands on it
  assert.deepEqual(checkPeople([{ item: 'platform', id: tw.id, part: 'rail', top: tw.h + TOWER.rail, x0: tw.box.x0, x1: tw.box.x1, z0: tw.box.z0, z1: tw.box.z1 }], plan), []);
  assert.ok(checkPeople([{ item: 'platform', id: tw.id, part: 'rail', top: tw.h + 1.5, x0: tw.box.x0, x1: tw.box.x1, z0: tw.box.z0, z1: tw.box.z1 }], plan).length > 0, 'something as tall as a person on a platform passes');
  assert.ok(TOWER.rail <= STATURE.platformOverDeck && STATURE.platformOverDeck <= 1.15);
  const good = [{ item: 'chair', id: 'a', part: 'back', top: 0.79, x0: ch.box.x0, x1: ch.box.x1, z0: ch.box.z0, z1: ch.box.z1 },
    { item: 'camera', id: cam.id, part: 'visor', top: cam.deckH + 1.7, x0: cam.x - 0.1, x1: cam.x + 0.1, z0: cam.z - 0.1, z1: cam.z + 0.1 },
    { item: 'stool', id: st.id, part: 'seat', top: st.base + STOOL.h, x0: st.box.x0, x1: st.box.x1, z0: st.box.z0, z1: st.box.z1 }];
  assert.deepEqual(checkPeople(good, plan), []);
  // proofs that the rule bites
  const at = (b, d = 0.15) => ({ x0: b.x - d, x1: b.x + d, z0: b.z - d, z1: b.z + d });
  assert.ok(checkPeople([{ item: 'camera', id: cam.id, part: 'operator', top: 1.0, ...at(cam) }], plan).length > 0, 'an operator at a camera passes');
  // a camera ends 1.8 m over its deck; nothing else is as tall as a person, wherever it stands
  assert.ok(checkPeople([{ item: 'camera', id: cam.id, part: 'housing', top: cam.deckH + STATURE.cameraOverDeck + 0.05, ...at(cam) }], plan).length > 0, 'a camera taller than a camera passes');
  for (const item of ['platform', 'stool', 'desk', 'sideTable', 'chair']) assert.ok(checkPeople([{ item, id: 'a', part: PARTS[item][0], top: 1.45, x0: 9, x1: 9.3, z0: -9, z1: -8.7 }], plan).length > 0, `a ${item} part as tall as a person passes`);
  assert.ok(checkPeople([{ item: 'chair', id: 'a', part: 'back', top: 1.25, x0: ch.box.x0, x1: ch.box.x1, z0: ch.box.z0, z1: ch.box.z1 }], plan).length > 0, 'something sitting on a chair passes');
  assert.ok(checkPeople([{ item: 'sideTable', id: 'a', part: 'towel', top: 0.6, x0: ch.x - 0.15, x1: ch.x + 0.15, z0: ch.z - 0.15, z1: ch.z + 0.15 }], plan).length > 0, 'a towel draped on a chair passes');
  // nothing on a stool: a stool part over its seat, another item's part on it, another camera's part on it
  assert.ok(checkPeople([{ item: 'stool', id: st.id, part: 'seat', top: st.base + STOOL.h + 0.3, ...at(st) }], plan).length > 0, 'something sitting on a stool passes');
  assert.ok(checkPeople([{ item: 'sideTable', id: 'a', part: 'towel', top: st.base + STOOL.h + 0.05, ...at(st) }], plan).length > 0, 'a towel on a stool passes');
  assert.ok(checkPeople([{ item: 'camera', id: 'other', part: 'housing', top: st.base + 1.2, ...at(st) }], plan).length > 0, 'a camera part of another camera on a stool passes');
  assert.ok(checkPeople([{ item: 'statue', id: 'x', part: 'base', top: 0.5, x0: 0, x1: 1, z0: 0, z1: 1 }], plan).length > 0, 'an unknown item passes');
  assert.ok(checkPeople([{ item: 'chair', id: 'a', part: 'cap', top: 0.5, x0: 0, x1: 1, z0: 0, z1: 1 }], plan).length > 0, 'a part outside the list passes');
  // (a camera: lens at 1.5 m; behind a lens tilted 20 degrees down its finder's hood reaches 1.9 m over the deck)
  assert.ok(STATURE.maxTop <= 1.3 && STATURE.chairTop <= CHAIR.h + 0.05 && STATURE.cameraOverDeck <= 2.0);
  // sources: no figure is modelled (a word check on the builder, the items and the painter), no ball-shaped part
  for (const f of SOURCES) {
    assert.ok(!/spectator|crowd|audience|silhouette|\bfigure\b|\bpeople\b|\boperator\b(?!\|)|headset|headphone|mannequin|\bhead\b(?!s\b)(?!\|)|\bface\b\s*\(/i.test(code(f).replace(/PERSON_NAME = \/[^\n]*\n/, '')), `${f}: a word that describes a person in code`);
    assert.ok(!/K\.sphere\(/.test(code(f)), `${f}: a ball-shaped part`);
  }
});

ok('legal: the canvases are flat swatches and soft ramps: no canvas text, no image, no file, no word', () => {
  // (round A5: four more cells for the dress, in the free strip under the shadow shapes: PINNED_DRESS_SWATCHES)
  const rowCells = ATLAS.cols * (ATLAS.shadowY / ATLAS.cell), names = Object.keys(SWATCHES);
  assert.deepEqual(names.slice(0, rowCells), PINNED_SWATCHES, 'a new swatch: update PINNED_SWATCHES');
  assert.ok(names.length === rowCells || (names.length >= rowCells + 4 && names.slice(rowCells).join() === PINNED_DRESS_SWATCHES.slice(0, names.length - rowCells).join()), `the swatches after the first ${rowCells}: ${names.slice(rowCells)}`);
  const paint = src('floor/paint.js');
  assert.ok(!/fillText|strokeText|\.font\s*=|measureText/.test(paint), 'canvas text in paint.js');
  assert.ok(!/new Image|\.src\s*=|fetch\(|drawImage|strokefont|drawText/.test(paint), 'an image, a request or a stroke font in paint.js');
  for (const f of SOURCES) assert.ok(!/fillText|strokeText|drawText\(|strokefont/.test(src(f)), `${f}: text`);
  for (const [name, [hex, rough, metal]] of Object.entries(SWATCHES)) {
    assert.ok(/^#[0-9a-f]{6}$/.test(hex) && rough >= 0.04 && rough <= 1 && metal >= 0 && metal <= 1, name);
    const [u, v] = swatchUV(name);
    // (a cell of the swatch rows, or one of the dress's cells in the strip under the shadow shapes: the lower half of
    // that strip, a white guard band between it and the shapes above, left of the `cast` shape)
    const extra = names.indexOf(name) >= rowCells;
    if (!extra) assert.ok(u > 0 && u < 1 && v > 1 - ATLAS.shadowY / ATLAS.size && v < 1, `${name}: its cell lies outside the swatch rows`);
    else assert.ok(u > 0 && u < SHADOW_REGION.cast[0] / ATLAS.size && (1 - v) * ATLAS.size > SHADOW_REGION.blob[1] + SHADOW_REGION.blob[3] + 16 && v > 0, `${name}: its cell lies outside the free strip`);
    assert.equal(swatchAt(u, v), name, `${name}: the ledger reads its cell back as another swatch`);
  }
  // two cells carry an emissive mask: a lit tally lamp's core (full) and its diffuser (three tenths); nothing else glows
  // red (round A5: the dress's two screen cells glow dimly and neutrally through the glow canvas: paint.js GLOW)
  assert.deepEqual(Object.entries(SWATCHES).filter(([, v]) => v[3]).map(([k, v]) => [k, v[3]]), [['tally', 1], ['tallyRim', 0.3]], 'the cells that carry the emissive mask');
  assert.throws(() => swatchUV('nonsense'));
  assert.ok(Object.keys(SWATCHES).length <= rowCells + (ATLAS.extraCols ?? 0));
  for (const name of Object.keys(SHADOW_REGION)) {
    const [x, y, w, hh] = SHADOW_REGION[name], r = regionUV(name);
    assert.ok(y >= ATLAS.shadowY && x + w <= ATLAS.size && y + hh <= ATLAS.size && r[0] < r[2] && r[1] < r[3], name);
    assert.ok(SHADOW_LEVEL[name] >= 90 && SHADOW_LEVEL[name] <= 190, `${name}: a shadow overlay never blacks the carpet out`);
  }
  // regions do not overlap
  const rs = Object.values(SHADOW_REGION);
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) assert.ok(rs[i][0] + rs[i][2] <= rs[j][0] || rs[j][0] + rs[j][2] <= rs[i][0] || rs[i][1] + rs[i][3] <= rs[j][1] || rs[j][1] + rs[j][3] <= rs[i][1]);
});

ok('albedo law (15.2): the classes are the layout\'s table; each class\'s designed mean lands on its value; black finishes are dielectrics; the leather maps land on 0.06', () => {
  // the table (CONTRACT 15.2, arena/layout.js ALBEDO): camera bodies and pedestals 0.04, the referee's cloth 0.04, chair leather 0.06
  assert.deepEqual([ALBEDO.camera, ALBEDO.refereeCloth, ALBEDO.leather, ALBEDO.deck, ALBEDO.nosing], [0.04, 0.04, 0.06, 0.10, 0.45]);
  assert.deepEqual({ ...CLASS_ALBEDO }, { black: ALBEDO.camera, cloth: ALBEDO.refereeCloth, leather: ALBEDO.leather, deck: ALBEDO.deck, nosing: ALBEDO.nosing });
  assert.deepEqual(Object.fromEntries(Object.entries(SWATCH_CLASS).filter(([, c]) => c)), PINNED_CLASSES);
  for (const cls of Object.keys(CLASS_ALBEDO)) {
    // the designed mean: sum(share x the swatch's albedo) x the class's baked shade (what the painter's scale solves)
    let lum = 0, share = 0;
    for (const [name, c] of Object.entries(SWATCH_CLASS)) if (c === cls && SWATCH_SHARE[name] > 0) { lum += SWATCH_SHARE[name] * albedoOf(name); share += SWATCH_SHARE[name]; }
    assert.ok(share > 0.99 && share < 1.01, `${cls}: the shares sum to ${share}`);
    const mean = (lum / share) * CLASS_SHADE[cls];
    assert.ok(Math.abs(mean / CLASS_ALBEDO[cls] - 1) < 0.02, `${cls}: the designed mean is ${mean.toFixed(4)} against ${CLASS_ALBEDO[cls]}`);
    assert.ok(classScale(cls) > 0 && CLASS_SHADE[cls] > 0.8 && CLASS_SHADE[cls] <= 1);
  }
  for (const [name, [hex, rough, metal]] of Object.entries(SWATCHES)) {
    const a = luminance(linearOf(hex));
    // a finish of a class is a DIELECTRIC at its real albedo (round A2's metal share on black finishes is gone), near its class value
    if (SWATCH_CLASS[name]) {
      assert.equal(metal, 0, `${name}: a ${SWATCH_CLASS[name]} finish with a metal share`);
      const v = CLASS_ALBEDO[SWATCH_CLASS[name]];
      assert.ok(a > 0.5 * v && a < 2.2 * v, `${name}: albedo ${a.toFixed(3)} in the class ${SWATCH_CLASS[name]} (${v})`);
      if (SWATCH_CLASS[name] === 'black') assert.ok(rough >= 0.3, `${name}: a matt black finish, not a mirror`);
    } else if (name !== 'tally') {
      // free colours: metals are mid greys with no diffuse share; woods and felt per their material; the palest thing is the towel
      // (round A6: no exception. `steelBrushed` stood at three quarters metal for ten minutes, to lift a bucket's wall
      // out of 0 to 2 of 255 where the room light fades its mirror lookups out, and was taken back: CONTRACT 15.2 has
      // steel as a metal without a diffuse albedo.)
      assert.ok(metal === 0 || metal === 1, `${name}: a half metal`);
      // (round A7: `spike`, a muted yellow cloth tape, 0.25: section 7 holds its own band. THE METALS ARE AT THEIR REAL
      // REFLECTANCE, up to aluminium's 0.62: the part reads the hall's cube; the mid greys of rounds A4 to A6, at or
      // under 0.35, were darkened metals and are deleted. The lens glass is the one dark mirror: a coating's 1 to 4 %.)
      // (round A8, CONTRACT 20.2 row 2: `body`, the low camera's light grey powder coat, 0.43: in the black class's
      // 0.04 the head was a silhouette under 0.3 units of bounce; `zoom`, its lens front, a second dark mirror: the
      // summed reflection of a zoom's coated surfaces, 0.08 to 0.2, where `glass` is one coating)
      assert.ok(a <= (name === 'towel' ? 0.46 : name === 'chalk' ? 0.4 : name === 'spike' ? 0.3 : name === 'body' ? 0.45 : metal === 1 ? 0.65 : 0.2), `${name}: albedo ${a.toFixed(3)}`);
      if (metal === 1) assert.ok(name === 'glass' ? a < 0.05 : name === 'zoom' ? a > 0.08 && a < 0.2 : a >= 0.3, `${name}: a darkened metal (${a.toFixed(3)})`);
    }
  }
  assert.ok(albedoOf('chrome') === 0 && albedoOf('steel') === 0 && Math.abs(albedoOf('cloth') * CLASS_SHADE.cloth - 0.04) < 0.001);
  // table tops and the tray per their material: black laminate in the black class, lacquered mahogany, felt, maple
  assert.ok(albedoOf('top') > 0.035 && albedoOf('top') < 0.06 && albedoOf('tray') > 0.05 && albedoOf('tray') < 0.1 && albedoOf('lining') > 0.03 && albedoOf('lining') < 0.08 && albedoOf('wood') > 0.12 && albedoOf('wood') < 0.22);
  // the leather: the stand-in's pixels (what the default tier draws) land on the value; the file's tint lands the file on it
  for (const size of [64, 256]) {
    const px = leatherPixels(size);
    assert.equal(px.length, size * size * 4);
    const m = linearMean(px);
    assert.ok(Math.abs(m.luminance * CLASS_SHADE.leather / ALBEDO.leather - 1) < 0.01, `the leather stand-in at ${size} px: mean ${m.luminance.toFixed(4)} x shade ${CLASS_SHADE.leather}`);
    assert.ok(m.rgb[0] > m.rgb[1] && m.rgb[1] > m.rgb[2], 'the leather is brown');
    let lo = 255, hi = 0; for (let i = 0; i < px.length; i += 4) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
    assert.ok(hi - lo > 20 && hi < 250, 'the leather stand-in has a grain and does not clip');
    assert.deepEqual([...leatherPixels(size).slice(0, 64)], [...px.slice(0, 64)], 'the same pixels every time');
  }
  assert.ok(Math.abs(luminance(LEATHER_FILE_MEAN.rgb) - LEATHER_FILE_MEAN.luminance) < 2e-4, 'the file\'s recorded mean is consistent');
  const tint = ALBEDO.leather / (LEATHER_FILE_MEAN.luminance * CLASS_SHADE.leather);
  assert.ok(tint > 1.2 && tint < 2.6, `the file's tint ${tint}`);
  assert.ok(/CLASS_ALBEDO\.leather \/ \(LEATHER_FILE_MEAN\.luminance \* CLASS_SHADE\.leather\)/.test(src('floor.js')), 'floor.js applies the file\'s tint by the same formula');
  assert.equal(swatchAt(...swatchUV('cloth')), 'cloth'); assert.equal(swatchAt(...swatchUV('piping')), 'piping');
  const floorSrc = src('floor.js');
  const tally = Number(/tally: ([0-9.]+),/.exec(floorSrc)?.[1]);
  assert.ok(tally >= 0.8 && tally <= 3, `the tally's level ${tally}`);
  assert.ok(/emitters: \[\]/.test(floorSrc) && !/addEmitter\(/.test(code('floor.js')), 'nothing is registered with the room light');
});

// ---------------------------------------------------------------------------------------------------------------------------
// 3. the laws of the round, in the sources
// ---------------------------------------------------------------------------------------------------------------------------
ok('laws: no three light, no shadow flag, no randomness, no clock, no request in the floor part\'s sources', () => {
  for (const f of SOURCES) {
    const c = code(f);
    assert.ok(!/new THREE\.\w*Light\(|castShadow|receiveShadow|shadowMap/.test(c), `${f}: a light or a shadow flag`);
    assert.ok(!/Math\.random|performance\.now|Date\.now|setTimeout|setInterval|fetch\(|XMLHttpRequest|localStorage|navigator\./.test(c), `${f}: randomness, a clock, a request or a device read`);
    assert.ok(!/readRenderTargetPixels|getBufferSubData|readPixels/.test(c), `${f}: a GPU read-back`);
    assert.ok(!/renderer\.|\.camera\b(?!\.bedH)|ctx\.game|ctx\.scene/.test(c.replace(/A\.camera|layout\.js|a\.camera|ALBEDO\?\.camera/g, '')), `${f}: reads the app's renderer, camera or game`);
  }
  // pure modules stay pure (the arm imports them without three)
  for (const f of ['floor/plan.js', 'floor/paint.js']) assert.ok(!/from 'three'|window\./.test(src(f)), `${f} is not pure`);
  assert.ok(!/document\./.test(src('floor/plan.js')));
  // positions come from the layout: the plan holds no place of its own (sizes only)
  assert.ok(/from '\.\.\/layout\.js'/.test(src('floor/plan.js')));
  // imports: the part reads the club's kit and tiers, the arena's layout and its own folder, nothing else
  for (const f of SOURCES) for (const m of src(f).matchAll(/from '([^']+)'/g)) assert.ok(['three', '../tiers.js', '../room/props/kit.js', './layout.js', '../layout.js', './plan.js', './floor/plan.js', './floor/paint.js', './floor/items.js'].includes(m[1]), `${f} imports ${m[1]}`);
});

// ---------------------------------------------------------------------------------------------------------------------------
// 4. the whole part, built in node
// ---------------------------------------------------------------------------------------------------------------------------
{
  const { registerHooks } = await import('node:module');
  const threeUrl = pathToFileURL(`${here}../../vendor/three.module.min.js`).href;
  registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
  const THREE = await import('three');
  const grad = { addColorStop() {} };
  const calls = { fill: 0, text: 0, image: 0 };
  const ctxStub = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { if (k === 'fillRect' || k === 'fill') calls.fill += 1; if (/Text$/.test(String(k))) calls.text += 1; if (k === 'drawImage') calls.image += 1; void args; return String(k).startsWith('create') ? grad : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const hadDocument = 'document' in globalThis;
  if (!hadDocument) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() }) };
  const FLOORJS = await import('../../scene/club/arena/floor.js');
  const { buildFloor: buildFloorRaw, readLook, FLOOR_LEVELS } = FLOORJS;
  const { TIERS } = await import('../../scene/club/tiers.js');
  // (sections 1 to 4 build the PLAIN variant: `dress:0` is added to every build's tool switches unless it names `dress`)
  // (round A7: `a7:0` is added to every build's tool switches unless the text names it)
  const qOf = (text0) => {
    let text = String(text0 ?? '');
    for (const k of ['a7', 'a8']) if (!new RegExp(`(^|,)\\s*${k}:`).test(text)) text = text ? `${text},${k}:0` : `${k}:0`;
    return { get: (key) => (key === 'clubfloor' ? text : null) };
  };
  const plainClub = (club) => {
    if (!club) return club;
    let text = '';
    try { text = String(club.ctx?.query?.get?.('clubfloor') ?? ''); } catch { text = ''; }
    // (round A6: and `a6:0`, the round's set off)
    return /(^|,)\s*dress:/.test(text) ? club : { ...club, ctx: { ...(club.ctx ?? {}), query: qOf(text ? `${text},dress:0,a6:0` : 'dress:0,a6:0') } };
  };
  const buildFloor = (club, a) => buildFloorRaw(plainClub(club), a);
  let roomLight = null, lightNote = 'room/light.js';
  try { roomLight = (await import('../../scene/club/room/light.js')).roomLight ?? null; } catch (e) { lightNote = `room/light.js did not load (${e?.message ?? e}): the fallback materials only`; }
  const FLOOR = -0.79;
  const args = (light) => ({
    box: { min: new THREE.Vector3(H.x0, FLOOR, H.z0), max: new THREE.Vector3(H.x1, FLOOR + H.height, H.z1) },
    floorY: FLOOR, tableBounds: { minX: stroke.x0, maxX: stroke.x1, minZ: stroke.z0, maxZ: stroke.z1 }, roomLight: light, layout: LAYOUT,
  });
  const built = {};
  for (const tier of ['lite', 'base', 'high']) for (const lit of [true, false]) {
    if (lit && !roomLight) continue;
    if (lit) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
    const before = lit ? roomLight.state?.().ids?.length ?? 0 : 0;
    const s = await buildFloor({ tier, knobs: TIERS[tier] }, args(lit ? roomLight : null));
    built[`${tier}${lit ? '' : ':nolight'}`] = { tier, lit, s, emittersAdded: lit ? (roomLight.state?.().ids?.length ?? 0) - before : 0 };
  }
  const meshesOf = (group) => { const out = []; group.traverse((o) => { let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false; if (o.isMesh && vis) out.push(o); }); return out; };
  // meshes (four materials on at most four sides, most sides hold fewer) and triangles. The default tier holds round A3's
  // numbers (lite 940, base 5,030: the lane's 1.10 x line has about 3,800 triangles of margin at V10 for every role
  // together), so the platforms on the stands fit by simplifying the base room's cameras and towers; the lite room's one
  // camera now stands on the north block, in a mesh group of its own (4 meshes against A3's 3); the high room carries
  // four cameras in detail, two more scaffold platforms and the used leather
  // (round A5: the default tier's lines are round A4's own counts: lite 900, base 4,772)
  const BUDGET = { lite: [4, 900], base: [8, 4772], high: [8, 27000] };

  ok(`build: the part builds on every tier, with the room light and without it (${lightNote}), inside its budgets`, () => {
    assert.ok(Object.keys(built).length >= 3);
    for (const [key, { tier, lit, s, emittersAdded }] of Object.entries(built)) {
      const c = s.counts();
      assert.equal(c.enabled, true, `${key}: ${c.reason}`);
      assert.equal(c.lit, lit, `${key}: lit`);
      assert.equal(c.detail, TIERS[tier].roomDetail);
      assert.ok(c.drawCalls <= BUDGET[tier][0], `${key}: ${c.drawCalls} draw calls`);
      assert.ok(c.triangles <= BUDGET[tier][1], `${key}: ${c.triangles} triangles`);
      assert.equal(meshesOf(s.group).length, c.drawCalls, `${key}: one mesh per draw call`);
      const nCam = A.floor.cameras.length, nRiser = (k) => A.floor.cameras.slice(0, k).filter((q) => !q.platform?.on).length;
      assert.deepEqual([c.cameras, c.platforms, c.stools, c.chairs, c.sideTables, c.desks, c.thresholds], tier === 'lite' ? [1, 1, 0, 2, 2, 0, 0] : tier === 'base' ? [2, 2, nRiser(2), 2, 2, 1, 2] : [nCam, nCam, nRiser(nCam), 2, 2, 1, 2], `${key}: items`);
      assert.equal(c.tallies, 1, `${key}: one lit tally`);
      assert.equal(c.cablePieces, tier === 'lite' ? 0 : tier === 'base' ? nRiser(2) : nRiser(nCam), `${key}: ${c.cablePieces} cable pieces`);
      // the cameras' heights as built: lens 1.5 m over the deck, each place outside the reach by more than the clearance
      for (const h of c.cameraHeights) assert.ok(h.lensOverDeck === 1.5 && Math.abs(h.lens - (h.deck + 1.5)) < 1e-9 && h.outsideReachBy >= clr && h.top > h.deck + 1.6 && h.top <= h.deck + STATURE.cameraOverDeck, `${key}: ${JSON.stringify(h)}`);
      // the hall's cut: the vertices of what stands on a block carry that block's side, and only those
      const cutWant = {};
      for (const q of A.floor.cameras.slice(0, c.cameras)) if (q.platform?.on) cutWant[SIDE[A.seating.blocks.find((b) => b.id === q.platform.on).side]] = true;
      assert.deepEqual(Object.keys(c.cutVertices).sort(), Object.keys(cutWant).sort(), `${key}: cut sides ${JSON.stringify(c.cutVertices)}`);
      for (const k of Object.values(c.cutVertices)) assert.ok(k > 200, `${key}: ${k} vertices on a cut side`);
      // THE ALBEDO LAW over what was BUILT: the area-weighted mean diffuse reflectance (baked shade included) per class
      const law = c.albedo, tol = { black: 0.06, cloth: 0.03, leather: 0.03, deck: 0.03, nosing: 0.01 };
      for (const cls of tier === 'lite' ? ['black', 'leather', 'deck'] : ['black', 'cloth', 'leather', 'deck', 'nosing']) {
        assert.ok(law[cls] && law[cls].target === CLASS_ALBEDO[cls], `${key}: no ${cls} surface was built`);
        assert.ok(Math.abs(law[cls].mean / law[cls].target - 1) <= tol[cls], `${key}: the built ${cls} mean is ${law[cls].mean} against ${law[cls].target}`);
        assert.ok(Math.abs(law[cls].shade - CLASS_SHADE[cls]) < 0.02, `${key}: the ${cls} baked shade is ${law[cls].shade} against the painter's ${CLASS_SHADE[cls]}`);
      }
      if (tier === 'high') {
        // the high room is where the painter's shares and shades were measured: they are pinned there
        for (const [name, share] of Object.entries(law.black.shares)) assert.ok(Math.abs(share - SWATCH_SHARE[name]) < 0.012, `${key}: ${name} covers ${share} of a camera against the painter's ${SWATCH_SHARE[name]}`);
        for (const cls of Object.keys(CLASS_ALBEDO)) assert.ok(Math.abs(law[cls].shade - CLASS_SHADE[cls]) < 0.004 && Math.abs(law[cls].mean / law[cls].target - 1) < 0.012, `${key}: ${cls} ${JSON.stringify(law[cls])}`);
      }
      assert.deepEqual(s.state().albedo.classes, law);
      assert.equal(s.state().albedo.leather.map, tier === 'lite' ? 'swatch' : 'stand-in'); assert.equal(s.state().albedo.leather.tint, 1);
      assert.deepEqual(c.emitters, []); assert.equal(emittersAdded, 0, `${key}: the part registered an emitter`);
      assert.deepEqual(s.emissives, [], `${key}: no unlit emitter surface (the tally is the hard material's emissive map)`);
      for (const t of c.textures) assert.ok(Math.max(t.w, t.h) <= 256 && t.name.startsWith('arena.floor.'), `${key}: texture ${t.name} ${t.w} x ${t.h}`);
      assert.ok(c.textureBytes <= 1.1e6, `${key}: ${c.textureBytes} texture bytes`);
      assert.deepEqual(c.sharedTextures, [], `${key}: no asset service here, so no shared map`);
      const st = s.state();
      assert.ok(st.enabled && st.problems.length === 0 && st.notBuilt.length === 0, `${key}: ${JSON.stringify(st.problems)}`);
      assert.deepEqual(st.shadowNames, { contact: 'arena.floor.contactshadow', cast: 'arena.floor.castshadow' });
      assert.equal(st.signature, s.signature()); assert.ok(/^floor-[0-9a-f]{8}$/.test(s.signature()), s.signature());
      // the person rule over what was really built, and the pinned parts
      assert.deepEqual(checkPeople(c.parts, planFloor(A, c.detail)), [], key);
      for (const p of c.parts) assert.ok(PINNED_PARTS[p.item]?.includes(p.part), `${key}: ${p.item}.${p.part}`);
      if (tier === 'high') for (const [item, list] of Object.entries(PINNED_PARTS)) for (const p of list) assert.ok(c.parts.some((q) => q.item === item && q.part === p), `${key}: the part ${item}.${p} is in the list and never built`);
      // the tallest thing is a camera's finder, at full height over its deck; a platform on a block ends at its guard
      // rail; nothing else is taller than a kick rail on a stool's seat
      const plan0 = planFloor(A, c.detail), deckOf0 = (id) => plan0.platforms.find((q) => q.id === id);
      const top = Math.max(...c.parts.map((p) => p.top)), topPart = c.parts.find((p) => p.top === top);
      assert.ok(topPart.item === 'camera' && top > deckOf0(topPart.id).h + 1.7 && top <= deckOf0(topPart.id).h + STATURE.cameraOverDeck, `${key}: the tallest part is ${top} m (${topPart.item}.${topPart.part})`);
      for (const p of c.parts) {
        if (p.item === 'camera') continue;
        const tower = p.item === 'platform' && deckOf0(p.id).zone === 'stand';
        assert.ok(p.top <= (tower ? deckOf0(p.id).h + TOWER.rail + 0.001 : 0.95), `${key}: ${p.item}.${p.id}.${p.part} is ${p.top} m tall`);
      }
    }
    assert.equal(calls.text, 0, 'no canvas text call reached the 2D context');
    assert.equal(calls.image, 0, 'no image was drawn into a canvas');
    assert.ok(calls.fill > 40, `the painters fill their swatches (${calls.fill} fills)`);
  });

  if (process.argv.includes('--stats')) {
    for (const [key, { s }] of Object.entries(built)) { const c = s.counts(); console.log(`STATS ${key}: ${c.drawCalls} draw calls ${JSON.stringify(c.drawCallsByGroup)}, ${c.triangles} triangles, ${JSON.stringify(c.byMaterial)}, texture bytes ${c.textureBytes}, cameras ${JSON.stringify(c.cameraHeights)}, signature ${s.signature()}`); }
  }

  ok('build: every mesh and material is named arena.floor.*; the overlays have the agreed names and blend; no shadow flag', () => {
    for (const [key, { s, lit }] of Object.entries(built)) {
      const names = new Set();
      for (const mesh of meshesOf(s.group)) {
        assert.ok(/^arena\.floor\./.test(mesh.name) && /^arena\.floor\./.test(mesh.material.name), `${key}: ${mesh.name} / ${mesh.material.name}`);
        names.add(mesh.material.name);
        if (lit && !/shadow/.test(mesh.material.name)) assert.ok(typeof mesh.material.userData.clubRoom === 'string', `${key} ${mesh.name}: not a room-light material`);
        assert.ok(!mesh.castShadow && !mesh.receiveShadow);
        assert.ok(mesh.geometry.getAttribute('color') && mesh.material.vertexColors === true || /shadow/.test(mesh.material.name), `${key} ${mesh.name}: no vertex shade`);
      }
      assert.ok(names.has('arena.floor.contactshadow') && names.has('arena.floor.castshadow') && names.has('arena.floor.hard') && names.size === (s.counts().detail >= 1 ? 4 : 3), `${key}: ${[...names]}`);
      assert.equal(names.has('arena.floor.leather'), s.counts().detail >= 1, `${key}: the leather batch`);
      for (const mesh of meshesOf(s.group)) if (/shadow/.test(mesh.material.name)) {
        assert.ok(mesh.material.blending === THREE.MultiplyBlending && mesh.material.depthWrite === false && mesh.material.transparent === true && mesh.renderOrder === 1, `${key}: ${mesh.name}`);
      }
      const hard = meshesOf(s.group).find((m) => m.material.name === 'arena.floor.hard').material;
      assert.ok(hard.roughnessMap && hard.metalnessMap === hard.roughnessMap && hard.roughness === 1 && hard.metalness === 1, `${key}: the hard material reads the data canvas`);
      // the lit tally: red at the tally's level. Round A4: a pure red emissive colour masked by the data canvas's red
      // channel. Round A5: a white emissive colour at the same level over the GLOW canvas (paint.js GLOW: the tally's
      // two cells pure red at 1 and 0.3, the dress's two screen cells dim and neutral, every other cell black)
      const glowMap = hard.emissiveMap?.name === 'arena.floor.glow';
      assert.ok(glowMap ? hard.emissive.r === FLOOR_LEVELS.tally && hard.emissive.g === FLOOR_LEVELS.tally && hard.emissive.b === FLOOR_LEVELS.tally
        : hard.emissiveMap === hard.roughnessMap && hard.emissive.r === FLOOR_LEVELS.tally && hard.emissive.g === 0 && hard.emissive.b === 0, `${key}: the tally's emission`);
      assert.equal(s.group.userData.clubShadowSplit, true);
      assert.equal(s.group.name, 'arena.floor');
    }
  });

  ok('build: EVERY VERTEX is finite, on or over the floor, outside the stroke room and OUTSIDE THE APP CAMERA\'S VOLUME by the layout\'s test with its clearance; island things inside the boards, hall things clear of gangway, seating and drape; tall only at a camera', () => {
    const v = new THREE.Vector3();
    const gaps = walkIns(A, 0.9);
    const keep = A.seating.front, blocks = A.seating.blocks.map((b) => blockFootprint(b, A));
    for (const [key, { s }] of Object.entries(built)) {
      let high = 0, tall = 0, outside = 0, onBlocks = 0;
      const decks = planFloor(A, s.counts().detail).platforms, cams = planFloor(A, s.counts().detail).cameras;
      const towers = decks.filter((d) => d.zone === 'stand'), rows = seatingRows(A.seating);
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position'), overlay = /shadow/.test(mesh.name), cutAttr = mesh.geometry.getAttribute('roomSide');
        // THE HALL'S CUT: the hard meshes carry a side per vertex; the leather and the overlays carry none (never dropped)
        assert.equal(!!cutAttr, /\.hard\./.test(mesh.name), `${key} ${mesh.name}: the cut side attribute`);
        if (cutAttr) assert.equal(cutAttr.count, pos.count);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const hh = v.y - FLOOR, where = `${v.toArray().map((q) => q.toFixed(3))}`;
          assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${key} ${mesh.name}: a vertex is not finite`);
          assert.ok(hh >= (overlay ? 0.0015 : -1e-6) && hh <= TOWER.hMax + STATURE.cameraOverDeck, `${key} ${mesh.name}: a vertex ${hh.toFixed(4)} m above the floor`);
          assert.ok(!inStroke(v.x, v.z), `${key} ${mesh.name}: a vertex in the stroke room at ${v.x.toFixed(2)}, ${v.z.toFixed(2)}`);
          const cutSide = cutAttr ? cutAttr.getX(i) : 0;
          if (cutSide !== 0) {
            // what stands on a seating block: inside its platform's footprint (a cable's thickness over the open end),
            // on or over the row under it, carrying that block's side, outside the app camera's volume and plan reach
            // (the camera's hood stands out over the guard rail of the deck's front edge: over the rail's height, within
            // the camera's own reach of its pedestal's axis; a base plate and the skirt's pipes may stand 45 mm out from
            // under the deck's edge, the cable that hangs down the skirt's face TOWER.hang and its own thickness)
            const slack = TOWER.hang + 0.012;
            const t = towers.find((d) => (v.x >= d.box.x0 - slack && v.x <= d.box.x1 + slack && v.z >= d.box.z0 - slack && v.z <= d.box.z1 + slack) || (hh > d.h + TOWER.rail && Math.hypot(v.x - d.x, v.z - d.z) <= CAM.reach + 0.02));
            assert.ok(t && t.side === cutSide && !overlay, `${key} ${mesh.name}: a vertex with the cut side ${cutSide} off every platform of that side at ${where}`);
            const blk = A.seating.blocks.find((b) => b.id === t.block), [, d] = blockFrame(blk, A).of(v.x, v.z);
            const row = rows.find((r) => d >= r.offset - 1e-6 && d < r.offset + A.seating.tread) ?? rows[rows.length - 1];
            assert.ok(hh >= row.h - 1e-6 && hh <= t.h + STATURE.cameraOverDeck, `${key} ${mesh.name}: a vertex on the ${t.block} block at ${hh.toFixed(3)} m (its row's deck is at ${row.h}) at ${where}`);
            assert.ok(!inCameraVolume(v.x, hh, v.z) && clearOfCamera(v.x, hh, v.z, A) && cameraFloor(v.x, v.z) === Infinity, `${key} ${mesh.name}: a vertex on a block inside the camera volume or the plan reach at ${where} (${reachMargin(v.x, v.z, A).toFixed(3)} m outside the reach)`);
            onBlocks += 1; high = Math.max(high, hh - t.h);
            continue;
          }
          // THE CAMERA VOLUME, by the layout's exact test (inCameraVolume) and with the layout's clearance round the vertex
          assert.ok(!inCameraVolume(v.x, hh, v.z), `${key} ${mesh.name}: a vertex INSIDE the camera volume at ${where}`);
          assert.ok(clearOfCamera(v.x, hh, v.z, A), `${key} ${mesh.name}: a vertex within ${clr} m of the camera volume at ${where} (cone ${cameraFloor(v.x, v.z)}, ${reachMargin(v.x, v.z, A).toFixed(3)} m outside the reach)`);
          const flat = hh <= 0.03;
          const onIsland = v.x > I.x0 && v.x < I.x1 && v.z > I.z0 && v.z < I.z1;
          assert.ok(v.x > H.x0 + 0.5 && v.x < H.x1 - 0.5 && v.z > H.z0 + 0.5 && v.z < H.z1 - 0.5, `${key} ${mesh.name}: a vertex in the hall's drape at ${where}`);
          if (!flat && onIsland) {
            // a standing thing on the island stays inside the boards' inner faces and under the app camera's cone
            assert.ok(v.x > I.x0 + 0.06 && v.x < I.x1 - 0.06 && v.z > I.z0 + 0.06 && v.z < I.z1 - 0.06, `${key} ${mesh.name}: a standing vertex at the boards: ${where}`);
            assert.ok(hh + clr <= cameraFloor(v.x, v.z), `${key} ${mesh.name}: an island vertex over the cone at ${where}`);
            assert.ok(hh <= 1.0, `${key} ${mesh.name}: an island vertex ${hh} m high`);
          } else if (!flat) {
            // a standing thing in the hall: off the gangway round the boards, off every seating block
            assert.ok(!(v.x > I.x0 - keep && v.x < I.x1 + keep && v.z > I.z0 - keep && v.z < I.z1 + keep), `${key} ${mesh.name}: a standing vertex in the gangway at ${where}`);
            for (const f of blocks) assert.ok(!(v.x > f.x0 - 0.2 && v.x < f.x1 + 0.2 && v.z > f.z0 - 0.2 && v.z < f.z1 + 0.2), `${key} ${mesh.name}: a standing vertex in the seating at ${where}`);
            assert.ok(decks.some((d) => v.x >= d.box.x0 - 0.16 && v.x <= d.box.x1 + 0.16 && v.z >= d.box.z0 - 0.16 && v.z <= d.box.z1 + 0.16), `${key} ${mesh.name}: a standing hall vertex off every platform at ${where}`);
            outside += 1;
          }
          // tall (over a seated eye line) only at a camera: within the camera's own reach of its pedestal's axis, and
          // outside the app camera's PLAN reach, so no height of the app's camera is over it
          if (hh > STATURE.maxTop) {
            assert.ok(cams.some((cm) => Math.hypot(v.x - cm.x, v.z - cm.z) <= CAM.reach + 0.02), `${key} ${mesh.name}: a tall vertex away from every camera at ${where}`);
            assert.equal(cameraFloor(v.x, v.z), Infinity, `${key} ${mesh.name}: a tall vertex inside the plan reach at ${where}`);
            tall += 1;
          }
          // the walk-ins: nothing higher than a flat strip
          if (!flat) for (const g of gaps) assert.ok(!(v.x > g.x0 && v.x < g.x1 && v.z > g.z0 && v.z < g.z1), `${key} ${mesh.name}: a standing vertex in the ${g.side} walk-in`);
          // an overlay lies on the carpet, or (a contact one) on a platform's deck under what stands there
          if (overlay) {
            const deck = decks.find((d) => v.x >= d.box.x0 && v.x <= d.box.x1 && v.z >= d.box.z0 && v.z <= d.box.z1);
            assert.ok(hh < 0.006 || (deck && /contactshadow/.test(mesh.name) && hh > deck.h && hh < deck.h + 0.006), `${key} ${mesh.name}: an overlay off the carpet at ${where}`);
            if (/castshadow/.test(mesh.name)) assert.ok(hh < 0.006, `${key} ${mesh.name}: a cast-size overlay off the carpet`);
          }
          high = Math.max(high, hh);
        }
      }
      // (`high`: over the floor for a riser's camera, over its deck for a camera on a block)
      assert.ok(high > 1.7 && tall + onBlocks > 50 && outside + onBlocks > 200, `${key}: no camera stands at full height (highest vertex ${high}, ${tall} tall vertices, ${outside} in the hall, ${onBlocks} on the blocks)`);
      assert.equal(onBlocks > 0, towers.length > 0, `${key}: ${onBlocks} vertices on the blocks, ${towers.length} platforms there`);
    }
  });

  ok('build: no mesh\'s box holds the table (the ball return\'s furniture walk skips each one by its box); each is culled by its own sphere', () => {
    const bb = new THREE.Box3();
    for (const [key, { s }] of Object.entries(built)) for (const mesh of meshesOf(s.group)) {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
      const hits = bb.min.x < stroke.x1 && bb.max.x > stroke.x0 && bb.min.z < stroke.z1 && bb.max.z > stroke.z0;
      assert.ok(!hits, `${key} ${mesh.name}: its box reaches into the stroke room (${bb.min.toArray().map((q) => q.toFixed(2))} .. ${bb.max.toArray().map((q) => q.toFixed(2))})`);
      assert.ok(mesh.frustumCulled !== false && mesh.geometry.boundingSphere && !mesh.isInstancedMesh, `${key} ${mesh.name}`);
    }
  });

  ok('build: the shapes are the pinned shapes for this geometry revision (a changed shape must change the bake\'s signature)', () => {
    // FNV-1a over every vertex of every mesh (tenths of a millimetre), per tier. A mismatch means floor/items.js or a size
    // changed what is built: bump FLOOR_GEOMETRY_REV in floor/plan.js (the signature follows it), then update the pins.
    const got = { rev: FLOOR_GEOMETRY_REV };
    for (const tier of ['lite', 'base', 'high']) {
      const { s } = built[tier] ?? built[`${tier}:nolight`];
      let hsh = 0x811c9dc5;
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) { const q = Math.round(pos.array[i] * 1e4) | 0; hsh ^= q & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0; hsh ^= (q >> 8) & 0xffff; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
      }
      got[tier] = hsh.toString(16).padStart(8, '0');
    }
    if (process.argv.includes('--stats')) console.log(`STATS geometry ${JSON.stringify(got)}`);
    assert.deepEqual(got, PINNED_GEOMETRY);
  });

  ok('build: no review pose looks through a built part (each part\'s measured box against the line from the camera to its target)', () => {
    const { s } = built.high ?? built['high:nolight'];
    const plan = planFloor(A, 2);
    // the measured parts as boxes: the same law as the plan's, over what was built
    const boxes = s.counts().parts.map((p) => ({ id: `${p.item}.${p.id}.${p.part}`, kind: p.item === 'camera' ? 'camera' : p.item, item: `${p.item}.${p.id}`, flat: p.top <= 0.03, group: 'x', x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1, h: p.top }));
    const bad = checkPlan({ ...plan, problems: [] }, A, VIEWS, boxes).filter((t) => /review camera/.test(t));
    assert.deepEqual(bad, []);
    for (const view of VIEWS) assert.ok(Math.abs(view.cam[0]) < I.x1 - 0.3 && Math.abs(view.cam[2]) < I.z1 - 0.3, `${view.id} is outside the ring`);
    // the measured boxes agree with the plan's (a part that grew out of its planned box would dodge the plan's laws)
    for (const it of plan.items) {
      const mine = s.counts().parts.filter((p) => p.item === it.kind && p.id === it.id);
      assert.ok(mine.length > 0, `${it.kind}.${it.id}: nothing built`);
      for (const p of mine) {
        // (two cables leave their item's box by a hand: a camera's lead meets the deck beside the skirt, a platform's drop lands on the carpet beside the deck)
        // (and a drop that leaves by a side with a kick rail lies over the rail's top: a cable's thickness higher)
        // (a platform on a block: a base plate may stand 45 mm out from under the deck's edge, on its row's walkway; the
        // pipes of its skirt stand out from the deck's edge by TOWER.drape at most)
        const cable = (it.kind === 'camera' && p.part === 'lead') || (it.kind === 'platform' && p.part === 'drop');
        const slack = cable ? PLATFORM.land + 0.05 : it.kind === 'platform' && p.part === 'jack' ? 0.045 : it.kind === 'platform' && p.part === 'drape' ? TOWER.drape + 0.001 : 0.012;
        assert.ok(p.x0 >= it.box.x0 - slack && p.x1 <= it.box.x1 + slack && p.z0 >= it.box.z0 - slack && p.z1 <= it.box.z1 + slack && p.top <= it.box.h + (cable ? 0.02 : 0.004),
          `${it.kind}.${it.id}.${p.part} leaves the planned box: ${JSON.stringify(p)} against ${JSON.stringify(it.box)}`);
      }
    }
    // WHO SEES THE CAMERAS, over what was BUILT (the plan's arithmetic is the arm 'where the review poses frame the
    // cameras'): the built parts of each camera's upper half project where the plan's control points said they would
    for (const cm of plan.cameras) {
      const mine = s.counts().parts.filter((q) => q.item === 'camera' && q.id === cm.id && ['housing', 'lens', 'hood', 'finder', 'visor'].includes(q.part));
      assert.ok(mine.length >= 4, `camera ${cm.id}: its upper half was built`);
      const cx0 = Math.min(...cm.control.map((q) => q[0])), cx1 = Math.max(...cm.control.map((q) => q[0])), cz0 = Math.min(...cm.control.map((q) => q[2])), cz1 = Math.max(...cm.control.map((q) => q[2])), ctop = Math.max(...cm.control.map((q) => q[1]));
      for (const q of mine) assert.ok(q.x0 >= cx0 - 0.012 && q.x1 <= cx1 + 0.012 && q.z0 >= cz0 - 0.012 && q.z1 <= cz1 + 0.012 && q.top <= ctop + 0.012, `camera ${cm.id}.${q.part} leaves the box of the plan's control points: ${JSON.stringify(q)} against x ${cx0}..${cx1}, z ${cz0}..${cz1}, top ${ctop}`);
    }
  });

  {
    const q = (text) => ({ get: (k) => (k === 'clubfloor' ? text : null) });
    // (round A5: `dress` is the one switch with a default of its own, floor/plan.js FLOOR_DRESS_DEFAULT; `low` is a tool's)
    // (round A6: `a6`, the round's set, is one more switch with a default of its own: plan.js FLOOR_A6_DEFAULT)
    // (round A7: `a7`, one more; `hall` was a switch for an hour of the round and is not in the look any more)
    // (round A8: `a8`, one more)
    const a4Look = (l) => { const { dress, low, a6, a7, a8, hall, ...rest } = l; void low; void a6; void a7; void a8; void hall; return [rest, dress]; };
    assert.deepEqual(a4Look(readLook(q('cameras:0,shadow:off,bogus:0')))[0], { cameras: false, chairs: true, desk: true, thresholds: true, cables: true, contact: false, cast: false, tally: true });
    assert.deepEqual(a4Look(readLook(null))[0], { cameras: true, chairs: true, desk: true, thresholds: true, cables: true, contact: true, cast: true, tally: true });
    if ('dress' in readLook(null)) {
      assert.equal(readLook(null).dress, DRESS_DEFAULT, 'no switch: the default');
      assert.equal(readLook(q('dress:0')).dress, false); assert.equal(readLook(q('dress:1')).dress, true); assert.equal(readLook(q('dress:on,desk:0')).dress, true);
    }
    assert.ok(FLOOR_LEVELS.hardEnv >= 0.1 && FLOOR_LEVELS.hardEnv <= 0.4);
    const base = { tier: 'base', knobs: TIERS.base };
    roomLight?.reset?.(); roomLight?.init?.({ club: base });
    const off = await buildFloor({ ...base, ctx: { query: q('cameras:0,shadow:0,desk:0,thresholds:0') } }, args(roomLight));
    const c = off.counts();
    assert.ok(c.enabled && c.cameras === 0 && c.platforms === 0 && c.stools === 0 && c.desks === 0 && c.thresholds === 0 && c.cablePieces === 0 && c.chairs === 2 && c.tallies === 0 && !c.byMaterial['arena.floor.contactshadow'] && !c.byMaterial['arena.floor.castshadow'], JSON.stringify(c.byMaterial));
    assert.ok(!c.parts.some((p) => ['camera', 'platform', 'stool', 'cable'].includes(p.item)), 'cameras:0 leaves a platform, a stool or a tape');
    // cables:0 keeps the cameras and takes the tape, each camera's lead and each platform's drop
    const noCable = (await buildFloor({ ...base, ctx: { query: q('cables:0') } }, args(roomLight))).counts();
    assert.ok(noCable.cameras === 2 && noCable.cablePieces === 0 && !noCable.parts.some((p) => p.part === 'lead' || p.part === 'drop' || p.part === 'tape'));
    assert.ok(/\|off:cameras\+desk\+thresholds\+contact\+cast$/.test(off.signature()), off.signature());
    const dark = await buildFloor({ ...base, ctx: { query: q('tally:0') } }, args(roomLight));
    assert.ok(dark.counts().tallies === 0 && dark.emissives.length === 0 && dark.counts().cameras === 2 && dark.state().tally.lit === 0);
    // a tier switch builds the other level once; the signature follows the level and comes back
    const sw = await buildFloor(base, args(roomLight));
    const sig1 = sw.signature();
    assert.equal(sw.setTier('lite'), true); assert.equal(sw.counts().detail, 0); assert.notEqual(sw.signature(), sig1, 'another detail level is another geometry');
    assert.equal(sw.setTier('base'), true); assert.equal(sw.signature(), sig1, 'the signature is stable across a tier round trip');
    assert.equal(sw.setTier('high'), true); assert.equal(sw.counts().detail, 2); assert.equal(sw.counts().levelsBuilt, 3);
    assert.equal(sw.setTier('nonsense'), false);
    assert.equal(meshesOf(sw.group).length, sw.counts().drawCalls, 'only the shown level is drawn');
    sw.dispose();
    assert.equal(sw.counts().enabled, false);
    // a page that loaded on lite has no leather material: it keeps its simple chairs on a switch upward
    const lite = await buildFloor({ tier: 'lite', knobs: TIERS.lite }, args(roomLight));
    assert.equal(lite.setTier('high'), true); assert.equal(lite.counts().detail, 0);
    // an item the layout puts in the stroke room is left out, the rest stands, the state says so
    const moved = clone(A); moved.floor.chairs[0] = { id: 'a', x: 2.4, z: 0.2 };
    const partial = await buildFloor(base, { ...args(roomLight), layout: { ...LAYOUT, ARENA: moved } });
    assert.ok(partial.counts().enabled && partial.counts().chairs === 1 && partial.state().problems.some((t) => /chair\.a/.test(t)), JSON.stringify(partial.state().problems));
    // a camera the layout puts inside the app camera's reach, or without a platform, is NOT built (never run down, never
    // hidden by view): its platform and stool go with it, the rest stands, the state says why
    const inside = clone(A); inside.floor.cameras[0] = { ...inside.floor.cameras[0], x: 5.0, z: 1.6 };
    const noCam = await buildFloor(base, { ...args(roomLight), layout: { ...LAYOUT, ARENA: inside } });
    assert.ok(noCam.counts().enabled && noCam.counts().cameras === 1 && noCam.counts().platforms === 1 && noCam.counts().stools === 1 && noCam.counts().chairs === 2
      && noCam.state().problems.some((t) => /inside the volume the app's camera can reach/.test(t)), JSON.stringify(noCam.state().problems));
    assert.ok(Math.max(...noCam.counts().parts.filter((p) => p.x1 < I.x1 && p.x0 > I.x0 && p.z0 > I.z0 && p.z1 < I.z1).map((p) => p.top)) < 1.0, 'something tall stands on the island');
    const a2 = clone(A); a2.floor.cameras = [{ id: 'east', x: 5.0, z: 1.6, lookAt: [0, 0] }, { id: 'north', x: -2.8, z: -3.7, lookAt: [0, 0] }]; a2.floor.cables = [];
    const none = await buildFloor(base, { ...args(roomLight), layout: { ...LAYOUT, ARENA: a2 } });
    assert.ok(none.counts().enabled && none.counts().cameras === 0 && none.counts().platforms === 0 && none.counts().desks === 1 && none.state().problems.length === 2 && none.state().problems.every((t) => /no platform/.test(t)));
    // the asset service's leather maps on the high tier (shared objects), none below it
    const asked = [];
    const assets = { texture(id, o) { asked.push(id); return o.fallback; } };
    const hi = await buildFloor({ tier: 'high', knobs: TIERS.high, assets }, args(roomLight));
    assert.deepEqual(asked, ['leather.color', 'leather.normal', 'leather.rough']); assert.deepEqual(hi.counts().sharedTextures, ['leather.color', 'leather.normal', 'leather.rough']);
    // (the stub hands the stand-in back: the file's tint is not applied to it; the stand-in is at its own mean)
    assert.equal(hi.state().albedo.leather.map, 'stand-in'); assert.equal(hi.state().albedo.leather.tint, 1);
    // a service that has swapped the FILE in: the material's colour becomes ALBEDO.leather / (the file's mean x the shade)
    const fileImage = { width: 1024, height: 1024 };
    const swapped = { texture(id, o) { const t = o.fallback; if (id === 'leather.color') t.image = fileImage; return t; }, ready: () => Promise.resolve() };
    const hi2 = await buildFloor({ tier: 'high', knobs: TIERS.high, assets: swapped }, args(roomLight));
    const want = ALBEDO.leather / (LEATHER_FILE_MEAN.luminance * CLASS_SHADE.leather);
    assert.equal(hi2.state().albedo.leather.map, 'leather.color'); assert.ok(Math.abs(hi2.state().albedo.leather.tint - want) < 1e-3);
    const leatherMat = meshesOf(hi2.group).find((m) => m.material.name === 'arena.floor.leather').material;
    assert.ok(Math.abs(leatherMat.color.r - want) < 1e-6 && leatherMat.color.r === leatherMat.color.g && leatherMat.color.g === leatherMat.color.b, 'the leather\'s colour is the file\'s tint');
    assert.ok(Math.abs(want * LEATHER_FILE_MEAN.luminance * hi2.counts().albedo.leather.shade / ALBEDO.leather - 1) < 0.01, 'the file under its tint lands on the table\'s value');
    asked.length = 0;
    await buildFloor({ tier: 'base', knobs: TIERS.base, assets }, args(roomLight)); await buildFloor({ tier: 'lite', knobs: TIERS.lite, assets }, args(roomLight));
    assert.deepEqual(asked, [], 'the default tier makes no texture request');
    // a service that throws leaves an empty group and a reason
    const broken = await buildFloor(base, { ...args(null), roomLight: { material() { throw new Error('boom'); }, emissive() { throw new Error('boom'); }, addEmitter() {} } });
    assert.equal(broken.counts().enabled, false);
    assert.ok(/boom/.test(broken.counts().reason) && broken.group.children.length === 0 && broken.emissives.length === 0 && broken.state().enabled === false && broken.signature() === 'none');
    // no arguments at all
    const bare = await buildFloor(null);
    assert.equal(bare.counts().enabled, true);
    ok('build: the tool switches, a tier switch, dispose, a lite page, a misplaced item, the asset service, a throwing service and no arguments: never a throw', () => {});
  }

  // -------------------------------------------------------------------------------------------------------------------------
  // 5. ROUND A5: THE DRESS OF THE PLAYING FLOOR (`dress` on; CONTRACT 17.1). The low camera's place comes from the layout's
  //    `floor.lowCamera`; while the layout does not carry it, this section runs on the entry the floor role asked for.
  // -------------------------------------------------------------------------------------------------------------------------
  {
    const DRESSED = { dress: true, a6: false };
    const { REMOTE, MONITOR, BOARD_CLEAR, DRESS_PARTS, planRemote } = PLAN;
    const HAS_LOW = !!A.floor.lowCamera, LOW = A.floor.lowCamera ?? PLAN.LOW_CAMERA_PROPOSED;
    const AD = HAS_LOW ? A : { ...A, floor: { ...A.floor, lowCamera: LOW } };
    const LAYOUT_D = HAS_LOW ? LAYOUT : { ...LAYOUT, ARENA: AD };
    console.log(HAS_LOW ? 'layout: arena/layout.js carries floor.lowCamera' : 'layout: arena/layout.js does NOT carry floor.lowCamera yet: section 5 runs on the entry asked for (plan.js LOW_CAMERA_PROPOSED)');
    const tableBox = { name: 'table', x0: -TABLE.hx, x1: TABLE.hx, h0: 0, h1: A.camera.bedH + 0.045, z0: -TABLE.hz, z1: TABLE.hz };

    ok('dress, the plan: lawful on the base and the high room, none on the lite room; ONE LOW CAMERA under the app camera\'s cone by the layout\'s exact test, whole in V1, V3 and TV; the laws bite', () => {
      assert.equal(planSignature(planFloorRaw(AD, 0, null, DRESSED)), planSignature(planFloor(A, 0)), 'the lite room builds no dress: its plan and signature are the plain ones');
      assert.equal(planFloorRaw(AD, 0, null, DRESSED).dress.on, false);
      for (const d of [1, 2]) {
        const p = planFloorRaw(AD, d, null, DRESSED);
        assert.deepEqual(p.problems, [], `detail ${d}`);
        assert.deepEqual(checkPlan(p, AD, VIEWS), [], `detail ${d}`);
        assert.ok(p.dress.on && p.dress.remote && p.dress.monitor && p.dress.bin && p.dress.cueStands.length === 2, `detail ${d}: the dress`);
        assert.notEqual(planSignature(p), planSignature(planFloor(A, d)), 'a dressed plan is another geometry');
        // TIER LINE: a dressed base room keeps the first camera alone (the low camera takes the riser's triangles)
        assert.deepEqual(p.cameras.map((c) => c.id), A.floor.cameras.slice(0, d === 1 ? 1 : A.floor.cameras.length).map((c) => c.id));
        for (const b of planBoxes(p)) {
          assert.ok(['north', 'east', 'south', 'west'].includes(b.group), `${b.id}: group ${b.group}`);
          assert.ok(!(b.x0 < stroke.x1 && b.x1 > stroke.x0 && b.z0 < stroke.z1 && b.z1 > stroke.z0), `${b.id} in the stroke room`);
        }
        // every standing thing of the dress: inside the boards and clear of the shell's edging on the island's joint (a
        // box carries a pad of a centimetre), no taller than a seated eye line, under the cone with the clearance
        for (const it of [p.dress.remote, ...(p.dress.monitors ?? [p.dress.monitor]), p.dress.bin, ...p.dress.cueStands]) {
          const b = it.box;
          assert.ok(b.x0 >= I.x0 + BOARD_CLEAR - 0.011 && b.x1 <= I.x1 - BOARD_CLEAR + 0.011 && b.z0 >= I.z0 + BOARD_CLEAR - 0.011 && b.z1 <= I.z1 - BOARD_CLEAR + 0.011, `${it.kind}.${it.id} stands on the island's edging: ${JSON.stringify(b)}`);
          assert.ok(b.h <= STATURE.maxTop && it.group, `${it.kind}.${it.id}`);
          for (const [x, z] of [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]]) assert.ok(b.h + clr <= cameraFloor(x, z), `${it.kind}.${it.id}: its box reaches the cone at (${x}, ${z})`);
        }
        // the dress's taped runs: flat, in their thing's mesh group, and NEVER on or across the shell's edging profile on
        // the island's joint (a cable goes under it): a run's tape ends at the profile's inner line. The monitor's run
        // lies along the boards' foot and ends short of the low camera's base plate; the low camera's plate stands at
        // the line already, so it has no tape of its own
        const r = p.dress.remote, m = p.dress.monitor, runs = p.cables.filter((c) => c.of);
        assert.deepEqual(runs.map((c) => `${c.of}.${c.id}`), ['monitor.m'], 'the dress\'s taped runs');
        for (const run of runs) {
          for (const sg of run.segments) assert.ok(sg.box.h < 0.03 && sg.group === (run.of === 'remote' ? r : m).group, `run ${run.of}.${run.id}`);
          for (const [x, z] of run.path) assert.ok(Math.abs(x) + run.width / 2 <= I.x1 - BOARD_CLEAR + 1e-6 && Math.abs(z) + run.width / 2 <= I.z1 - BOARD_CLEAR + 1e-6, `run ${run.of}.${run.id}: its tape reaches the edging at (${x}, ${z})`);
        }
        const mr = runs[0], len = Math.hypot(mr.path[1][0] - mr.path[0][0], mr.path[1][1] - mr.path[0][1]);
        assert.ok(mr.path.length === 2 && len > 0.8 && Math.hypot(mr.path[1][0] - r.x, mr.path[1][1] - r.z) > REMOTE.base + 0.005 &&Math.hypot(mr.path[1][0] - r.x, mr.path[1][1] - r.z) < REMOTE.base + 0.03, `the monitor's run is ${len} m long and ends ${Math.hypot(mr.path[1][0] - r.x, mr.path[1][1] - r.z)} m from the low camera's post`);
        assert.ok(m.lead && Math.abs(m.lead[0]) <= 0.34 && m.lead[1] < 0, `the monitor's own cable meets the tape behind the screen: ${JSON.stringify(m.lead)}`);
        assert.ok(r.boardDist - REMOTE.base - 0.015 - BOARD_CLEAR <= 0.05, 'the low camera stands at the edging\'s line: no tape of its own');
        // the second floor monitor: in the officials' corner (the desk's long side, beyond the bin from the desk), turned
        // to the table, in the desk's mesh group (no draw call of its own); its cable goes straight back under the
        // edging (no tape) and ends inside its own planned box, at the boards' side of it
        if (p.dress.monitors) {
          const [m1, m2] = p.dress.monitors, bin = p.dress.bin;
          assert.ok(p.dress.monitors.length === 2 && m1 === m && m2.id === 'w' && m2.kind === 'monitor' && m2.group === p.desk.group && m2.group !== m1.group, `the two monitors: ${JSON.stringify([m1.x, m1.z, m1.group, m2.x, m2.z, m2.group])}`);
          assert.ok(Math.abs(m2.x - bin.x) > 1.2 && Math.abs(m2.x - bin.x) < 1.8 && Math.abs(m2.x - p.desk.x) > Math.abs(bin.x - p.desk.x) && Math.sign(m2.z) === Math.sign(p.desk.z), 'the far monitor stands beyond the bin from the desk, at the desk\'s boards');
          const f = [Math.sin(m2.ry), Math.cos(m2.ry)], l = Math.hypot(m2.x, m2.z);
          assert.ok((f[0] * -m2.x + f[1] * -m2.z) / l > 0.999, 'the far monitor looks at the table\'s centre');
          const cs = Math.cos(m2.ry), sn = Math.sin(m2.ry), end = [m2.x + m2.lead[0] * cs + m2.lead[1] * sn, m2.z - m2.lead[0] * sn + m2.lead[1] * cs];
          assert.ok(Math.abs(m2.lead[0]) < MONITOR.w / 2 && m2.lead[1] < -0.1 && end[0] > m2.box.x0 && end[0] < m2.box.x1 && end[1] > m2.box.z0 && end[1] < m2.box.z0 + 0.03, `the far monitor's cable ends at (${end}) of its box ${JSON.stringify(m2.box)}`);
        }
      }
      // THE LOW CAMERA (the brief's item 4; round A4's open item 1). The law is the layout's exact test, unchanged: no
      // point of it, nor a point `clearance` beside or over one, is inside the volume the app's camera can reach. Its
      // place is INSIDE the plan reach, so that volume starts at the cone's underside over it.
      const p = planFloorRaw(AD, 2, null, DRESSED), r = p.dress.remote;
      assert.ok(r.standing && r.why === null && r.top === REMOTE.top && REMOTE.top <= LOW.top && r.kind === 'remote' && r.proof.length >= 20);
      assert.ok(reachMargin(r.x, r.z, AD) < -2, `the low camera stands ${-reachMargin(r.x, r.z, AD)} m inside the plan reach`);
      for (const [x, hh, z] of r.proof) {
        assert.ok(Number.isFinite(cameraFloor(x, z)), 'a proof point outside the plan reach: this is not the low camera\'s kind of place');
        assert.ok(!inCameraVolume(x, hh, z) && clearOfCamera(x, hh, z, AD) && hh + clr <= cameraFloor(x, z), `the low camera: a point at ${hh} m (${x}, ${z}) reaches the camera volume (cone ${cameraFloor(x, z)})`);
      }
      // the report's numbers at the layout's place: the cone's underside over the post, and the highest lawful top
      const coneAt = cameraFloor(LOW.x, LOW.z);
      const lawful = (top) => planRemote({ ...LOW, top: 9 }, AD).proof.map(([x, hh, z]) => [x, hh >= REMOTE.postTop ? hh + (top - REMOTE.top) : hh, z]).every(([x, hh, z]) => clearOfCamera(x, hh, z, AD));
      let lo = 0.6, hi = 2;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (lawful(m)) lo = m; else hi = m; }
      if (process.argv.includes('--stats')) console.log(`STATS low camera at (${LOW.x}, ${LOW.z}): cone underside ${coneAt.toFixed(4)} m over its post, highest lawful top ${lo.toFixed(4)} m, built top ${REMOTE.top} m, granted ${LOW.top} m`);
      assert.ok(lawful(REMOTE.top) && REMOTE.top <= lo && lo < coneAt - clr && lo > 0.95, `the highest lawful top there is ${lo} m (cone ${coneAt})`);
      // WHO FRAMES IT, by projection before any picture: whole and uncovered in V1, V3 and TV (the three poses the brief
      // names), and in V10; behind BACK's camera
      const blockers = [...sightBlockers(AD), tableBox], view = (id) => VIEWS.find((v) => v.id === id);
      const seen = Object.fromEntries(['V1', 'V3', 'TV', 'V10', 'V9', 'BACK'].map((id) => [id, headInPose(r, view(id), AD, [1280, 720], blockers)]));
      if (process.argv.includes('--stats')) console.log(`STATS low camera in the poses: ${Object.entries(seen).map(([id, q]) => `${id} ${q ? `${q.w}x${q.h} at (${q.at}) in frame ${q.inFrame} seen ${q.seen}` : 'behind'}`).join(' | ')}`);
      for (const id of ['V1', 'V3', 'TV']) assert.ok(seen[id] && seen[id].inFrame === 1 && seen[id].seen === 1 && seen[id].w >= 38 && seen[id].h >= 40, `${id} does not frame the low camera whole: ${JSON.stringify(seen[id])}`);
      assert.ok(seen.V10 && seen.V10.inFrame === 1 && seen.V10.seen === 1 && seen.BACK === null);
      // THE LAWS BITE: a camera taller than its entry grants; the same camera where the cone is lower; a full-height
      // camera at the low camera's place; an entry that fails takes only the camera with it; no entry, no camera
      assert.ok(/grants/.test(planRemote({ ...LOW, top: REMOTE.top - 0.01 }, AD).why));
      assert.ok(/inside the volume the app's camera can reach/.test(planRemote({ ...LOW, x: 3.6 }, AD).why), 'a low camera 2.1 m from the foot rail passes');
      assert.ok(!planCamera({ id: 'x', x: LOW.x, z: LOW.z, lookAt: [0, 0], platform: deckOf() }, AD, 0).standing, 'a full-height camera at the low camera\'s place passes');
      const near = planFloorRaw({ ...AD, floor: { ...AD.floor, lowCamera: { ...LOW, x: 3.6 } } }, 2, null, DRESSED);
      assert.ok(!near.dress.remote && near.problems.some((t) => /^remote\.lo: /.test(t)) && near.dress.monitor && !near.cables.some((c) => c.of === 'remote'));
      const { lowCamera: gone, ...floorNoLow } = AD.floor; void gone;
      const none = planFloorRaw({ ...AD, floor: floorNoLow }, 2, null, DRESSED);
      assert.ok(!none.dress.remote && none.problems.length === 0 && none.dress.monitor && none.dress.bin && !none.cables.some((c) => c.of === 'remote'), 'no entry in the layout: no low camera, the rest of the dress stands');
      // and in the stroke room: not planned
      const inRoom = planFloorRaw({ ...AD, floor: { ...AD.floor, lowCamera: { ...LOW, x: 2.6, z: 0.4 } } }, 2, null, DRESSED);
      assert.ok(!inRoom.dress.remote && inRoom.problems.some((t) => /^remote\.lo/.test(t)));
    });

    const builtD = {};
    for (const tier of ['lite', 'base', 'high']) {
      if (roomLight) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
      builtD[tier] = await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:0') } }, { ...args(roomLight), layout: LAYOUT_D });
    }
    // the default tier's lines are round A4's own counts (the brief: at or under them); the high room pays for the dress
    const DRESS_BUDGET = { lite: [4, 900], base: [8, 4772], high: [8, 30500] };
    // FNV-1a over every vertex per tier, as for the plain variant (DRESS_REV 2; the lite room's is the plain build's).
    // Set it to null while a batch of the dress's shapes is being saved, and pin again when the batch is in
    const PINNED_GEOMETRY_DRESS = { lite: '9797e38c', base: 'fb3cdeba', high: '61c55b14' };
    const hashOf = (s) => {
      let hsh = 0x811c9dc5;
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) { const q = Math.round(pos.array[i] * 1e4) | 0; hsh ^= q & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0; hsh ^= (q >> 8) & 0xffff; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
      }
      return hsh.toString(16).padStart(8, '0');
    };

    ok('dress, the build: every tier inside the default tier\'s A4 counts; every part in the pinned list and the person rule over what was built; EVERY VERTEX outside the stroke room and the app camera\'s volume; the parts inside their planned boxes', () => {
      const v = new THREE.Vector3(), gaps = walkIns(A, 0.9);
      const nCam = A.floor.cameras.length, nRiser = (k) => A.floor.cameras.slice(0, k).filter((q) => !q.platform?.on).length;
      for (const [tier, s] of Object.entries(builtD)) {
        const c = s.counts(), st = s.state(), plan = planFloorRaw(AD, c.detail, null, DRESSED);
        // (the dress's own taped runs, in pieces: the low camera's, the monitor's)
        const dressRuns = plan.cables.filter((r) => r.of).reduce((k, r) => k + r.segments.length, 0);
        // (the floor monitors: one at the foot end's boards, one at the head end's)
        const nMon = (plan.dress.monitors ?? [plan.dress.monitor]).filter(Boolean).length;
        assert.equal(c.enabled, true, `${tier}: ${c.reason}`);
        assert.ok(c.drawCalls <= DRESS_BUDGET[tier][0] && c.triangles <= DRESS_BUDGET[tier][1], `${tier}: ${c.drawCalls} draw calls, ${c.triangles} triangles`);
        assert.equal(meshesOf(s.group).length, c.drawCalls);
        assert.ok(st.problems.length === 0 && st.notBuilt.length === 0 && st.look.dress === true, `${tier}: ${JSON.stringify(st.problems)}`);
        assert.deepEqual([c.cameras, c.platforms, c.stools, c.chairs, c.sideTables, c.desks, c.thresholds, c.remotes, c.monitors, c.bins, c.cueStands, c.cablePieces],
          tier === 'lite' ? [1, 1, 0, 2, 2, 0, 0, 0, 0, 0, 0, 0] : tier === 'base' ? [1, 1, 0, 2, 2, 1, 2, 1, nMon, 1, 2, dressRuns] : [nCam, nCam, nRiser(nCam), 2, 2, 1, 2, 1, nMon, 1, 2, nRiser(nCam) + dressRuns], `${tier}: items`);
        assert.equal(c.tallies, 1, `${tier}: one lit tally: the hall's one red point`);
        assert.deepEqual(c.emitters, []); assert.deepEqual(s.emissives, []);
        // the lite room: the plain build, vertex for vertex
        if (tier === 'lite') { assert.equal(s.signature(), (built.lite ?? built['lite:nolight']).s.signature()); assert.equal(hashOf(s), hashOf((built.lite ?? built['lite:nolight']).s)); }
        else assert.notEqual(s.signature(), (built[tier] ?? built[`${tier}:nolight`]).s.signature());
        // the parts: the pinned list, the person rule over what was built
        for (const q of c.parts) assert.ok(ALL_PARTS[q.item]?.includes(q.part), `${tier}: ${q.item}.${q.part}`);
        if (tier === 'high') for (const [item, list] of Object.entries(ALL_PARTS)) for (const q of list) assert.ok(c.parts.some((w) => w.item === item && w.part === q), `${tier}: the part ${item}.${q} is in the list and never built`);
        if (tier !== 'lite') for (const [item, list] of Object.entries(DRESS_PARTS)) if (!(item in PINNED_PARTS)) assert.ok(c.parts.some((w) => w.item === item), `${tier}: no ${item} was built`);
        assert.deepEqual(checkPeople(c.parts, plan), [], tier);
        // ONE towel over ONE chair's arm, at arm height; nothing on a seat
        if (tier !== 'lite') {
          const towels = c.parts.filter((q) => q.item === 'chair' && q.part === 'towel');
          assert.ok(towels.length === 1 && towels[0].top < 0.66 && towels[0].top > 0.6, `${tier}: ${JSON.stringify(towels)}`);
        }
        // the albedo law over what was built (the dress adds no class; a worn edge is the black class's own finish)
        const tol = { black: 0.06, cloth: 0.03, leather: 0.03, deck: 0.03, nosing: 0.01 };
        for (const cls of tier === 'lite' ? ['black', 'leather', 'deck'] : ['black', 'cloth', 'leather', 'deck', 'nosing']) assert.ok(c.albedo[cls] && Math.abs(c.albedo[cls].mean / c.albedo[cls].target - 1) <= tol[cls], `${tier}: the built ${cls} mean is ${c.albedo[cls]?.mean}`);
        // nothing off the stands is taller than the low camera, and that ends where the layout's entry says
        for (const q of c.parts) if (q.item !== 'camera' && q.item !== 'platform' && q.item !== 'stool') assert.ok(q.top <= (q.item === 'remote' ? LOW.top : 0.95), `${tier}: ${q.item}.${q.id}.${q.part} is ${q.top} m tall`);
        // EVERY VERTEX that is not on a seating block (those are the plain variant's shapes, proven there)
        let islandTop = 0;
        for (const mesh of meshesOf(s.group)) {
          const pos = mesh.geometry.getAttribute('position'), overlay = /shadow/.test(mesh.name), cutAttr = mesh.geometry.getAttribute('roomSide');
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const hh = v.y - FLOOR, where = `${v.toArray().map((q) => q.toFixed(3))}`;
            assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && hh >= (overlay ? 0.0015 : -1e-6), `${tier} ${mesh.name}: a vertex at ${where}`);
            assert.ok(!inStroke(v.x, v.z), `${tier} ${mesh.name}: a vertex in the stroke room at ${where}`);
            if (cutAttr && cutAttr.getX(i) !== 0) continue;
            assert.ok(!inCameraVolume(v.x, hh, v.z) && clearOfCamera(v.x, hh, v.z, AD), `${tier} ${mesh.name}: a vertex inside or within ${clr} m of the camera volume at ${where} (cone ${cameraFloor(v.x, v.z)})`);
            const onIsland = v.x > I.x0 && v.x < I.x1 && v.z > I.z0 && v.z < I.z1;
            if (hh > 0.03 && onIsland) {
              assert.ok(v.x > I.x0 + 0.06 && v.x < I.x1 - 0.06 && v.z > I.z0 + 0.06 && v.z < I.z1 - 0.06 && hh + clr <= cameraFloor(v.x, v.z), `${tier} ${mesh.name}: a standing island vertex at ${where}`);
              // over a metre only at the low camera, and never over what the layout's entry grants
              const atLow = Math.hypot(v.x - LOW.x, v.z - LOW.z) <= REMOTE.reach.front + 0.02;
              assert.ok(hh <= (atLow ? LOW.top : 1.0), `${tier} ${mesh.name}: an island vertex ${hh} m high at ${where}`);
              islandTop = Math.max(islandTop, hh);
              for (const g of gaps) assert.ok(!(v.x > g.x0 && v.x < g.x1 && v.z > g.z0 && v.z < g.z1), `${tier} ${mesh.name}: a standing vertex in the ${g.side} walk-in`);
            }
            if (overlay && onIsland) assert.ok(hh < 0.006, `${tier} ${mesh.name}: an overlay off the carpet at ${where}`);
          }
        }
        if (tier !== 'lite') assert.ok(islandTop > 1.0 && islandTop <= REMOTE.top + 1e-6, `${tier}: the highest island vertex is ${islandTop} m (the low camera ends at ${REMOTE.top})`);
        // no mesh's box holds the table
        const bb = new THREE.Box3();
        for (const mesh of meshesOf(s.group)) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
          assert.ok(!(bb.min.x < stroke.x1 && bb.max.x > stroke.x0 && bb.min.z < stroke.z1 && bb.max.z > stroke.z0), `${tier} ${mesh.name}: its box reaches into the stroke room`);
        }
        // the measured parts of the dress's own items lie inside their planned boxes (the plan's laws hold for what was built)
        for (const it of plan.items.filter((q) => ['remote', 'monitor', 'bin', 'cueStand', 'chair', 'sideTable'].includes(q.kind))) {
          const mine = c.parts.filter((q) => q.item === it.kind && q.id === it.id);
          assert.ok(mine.length > 0, `${tier}: ${it.kind}.${it.id}: nothing built`);
          for (const q of mine) assert.ok(q.x0 >= it.box.x0 - 0.012 && q.x1 <= it.box.x1 + 0.012 && q.z0 >= it.box.z0 - 0.012 && q.z1 <= it.box.z1 + 0.012 && q.top <= it.box.h + 0.004, `${tier}: ${it.kind}.${it.id}.${q.part} leaves the planned box: ${JSON.stringify(q)} against ${JSON.stringify(it.box)}`);
        }
        // no review pose looks through a built part
        const boxes = c.parts.map((q) => ({ id: `${q.item}.${q.id}.${q.part}`, kind: q.item, item: `${q.item}.${q.id}`, flat: q.top <= 0.03, group: 'x', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, h: q.top }));
        assert.deepEqual(checkPlan({ ...plan, problems: [] }, AD, VIEWS, boxes).filter((t) => /review camera/.test(t)), [], tier);
      }
      const got = Object.fromEntries(Object.entries(builtD).map(([tier, s]) => [tier, hashOf(s)]));
      if (process.argv.includes('--stats')) {
        console.log(`STATS dress geometry ${JSON.stringify(got)}`);
        for (const [tier, s] of Object.entries(builtD)) { const c = s.counts(); console.log(`STATS dress ${tier}: ${c.drawCalls} draw calls ${JSON.stringify(c.drawCallsByGroup)}, ${c.triangles} triangles, ${JSON.stringify(c.byMaterial)}, texture bytes ${c.textureBytes}, signature ${s.signature()}`); }
      }
      if (PINNED_GEOMETRY_DRESS) assert.deepEqual(got, PINNED_GEOMETRY_DRESS, 'the dress\'s shapes moved: bump DRESS_REV in floor/plan.js (the dressed signature follows it), then update the pins');
    });

    // which variant a build WITHOUT a switch gives (floor/plan.js FLOOR_DRESS_DEFAULT), and the two tool arms of one tree
    const dflt = await buildFloorRaw({ tier: 'high', knobs: TIERS.high }, { ...args(roomLight), layout: LAYOUT_D });
    const offArm = await buildFloorRaw({ tier: 'high', knobs: TIERS.high, ctx: { query: qOf('dress:0,a6:0') } }, { ...args(roomLight), layout: LAYOUT_D });
    const lowArm = await buildFloorRaw({ tier: 'high', knobs: TIERS.high, ctx: { query: qOf('dress:1,low:1,a6:0') } }, args(roomLight));
    ok(`dress: a build without a switch gives the ${DRESS_DEFAULT ? 'DRESSED' : 'PLAIN (round A4)'} variant; dress:0 is round A4's geometry on any layout; low:1 stands the proposed low camera in only where the layout has none`, () => {
      // (round A6: with the round's set as the default, a build without a switch is section 6's variant: compared there)
      if (!A6_DEFAULT) assert.equal(dflt.signature(), (DRESS_DEFAULT ? builtD.high : offArm).signature());
      assert.equal(dflt.counts().monitors > 0, DRESS_DEFAULT);
      assert.equal(offArm.signature(), (built.high ?? built['high:nolight']).s.signature(), 'dress:0 on a layout with a low camera entry is the plain build');
      assert.equal(hashOf(offArm), PINNED_GEOMETRY.high);
      assert.equal(lowArm.counts().remotes, 1);
      assert.equal(lowArm.signature(), HAS_LOW ? builtD.high.signature() : lowArm.signature());
      // without the entry and without the tool switch: the dress stands, the low camera does not
      if (!HAS_LOW) assert.equal(readLook(qOf('dress:1')).low, false);
    });
  }
  // -------------------------------------------------------------------------------------------------------------------------
  // 6. ROUND A6: THE ROUND'S SET (`a6` on; CONTRACT 18). The work lamps' places come from the layout's
  //    `floor.workLights` (the light role's: its bake has an emitter at each); while the layout does not carry them,
  //    this section runs on the entry agreed with the light role (plan.js WORK_LIGHTS_PROPOSED).
  // -------------------------------------------------------------------------------------------------------------------------
  {
    const { WORK_LIGHT, WORK_LIGHTS_PROPOSED, ROAD_CASE, TROLLEY, SPOT, BOARD_CLEAR, REMOTE, planWorkLight } = PLAN;
    const HAS_WL = Array.isArray(A.floor.workLights), WL = HAS_WL ? A.floor.workLights : WORK_LIGHTS_PROPOSED;
    const SET = { dress: true, a6: true, workLights: HAS_WL ? null : WORK_LIGHTS_PROPOSED };
    console.log(HAS_WL ? 'layout: arena/layout.js carries floor.workLights' : 'layout: arena/layout.js does NOT carry floor.workLights yet: section 6 runs on the places agreed with the light role (plan.js WORK_LIGHTS_PROPOSED)');
    const LOW = A.floor.lowCamera ?? PLAN.LOW_CAMERA_PROPOSED;
    const A5 = { dress: true, a6: false };

    ok('a6, the plan: lawful on every room; a work lamp at each standing camera with its lit opening ON the layout\'s place, on the corner post nearest it (a flange on the riser), outside the app camera\'s reach; the head end\'s case and cart in the desk\'s mesh group; two camera spots; the laws bite', () => {
      for (const d of [0, 1, 2]) {
        const p = planFloorRaw(A, d, null, SET), p5 = planFloorRaw(A, d, null, A5);
        assert.deepEqual(p.problems, [], `detail ${d}`);
        assert.deepEqual(checkPlan(p, A, VIEWS), [], `detail ${d}`);
        assert.notEqual(planSignature(p), planSignature(p5), `detail ${d}: the set is another geometry`);
        assert.equal(planSignature(planFloorRaw(A, d, null, { ...SET, a6: false })), planSignature(p5), 'with the switch off the plan is round A5\'s');
        // one lamp per camera that stands and has an entry: lite and base the first camera, high every camera
        const want = p.cameras.map((c) => c.id).filter((id) => WL.some((e) => e.id === id));
        assert.deepEqual(p.a6.lamps.map((l) => l.id), WL.map((e) => e.id).filter((id) => want.includes(id)), `detail ${d}: the lamps`);
        assert.ok(p.a6.lamps.length === (d === 2 ? A.floor.cameras.length : 1), `detail ${d}: ${p.a6.lamps.length} lamps`);
        for (const l of p.a6.lamps) {
          const e = WL.find((q) => q.id === l.id), plat = p.platforms.find((q) => q.id === l.id), cam = p.cameras.find((q) => q.id === l.id);
          // the lit opening is ON the layout's place; its axis runs to the layout's aim, about a metre away, tipped down
          assert.deepEqual(l.place, [e.x, e.h, e.z], `lamp ${l.id}: the lit opening's place`);
          assert.ok(Math.abs(l.x + l.lit[0] - e.x) < 1e-3 && Math.abs(l.z + l.lit[2] - e.z) < 1e-3 && Math.abs(plat.h + l.lit[1] - e.h) < 1e-3, `lamp ${l.id}: the local place`);
          const dist = Math.hypot(e.aim[0] - e.x, e.aim[2] - e.h, e.aim[1] - e.z);
          assert.ok(dist > 0.8 && dist < 1.2 && l.dir[1] < -0.3 && Math.abs(Math.hypot(...l.dir) - 1) < 1e-3, `lamp ${l.id}: ${dist} m from its aim, axis ${l.dir}`);
          assert.ok(Math.abs(l.dir[0] * dist - (e.aim[0] - e.x)) < 2e-3 && Math.abs(l.dir[2] * dist - (e.aim[1] - e.z)) < 2e-3, `lamp ${l.id}: its axis runs to the aim`);
          // the aim is the camera's own lens axis over its pedestal (the plan's lens height)
          assert.ok(Math.abs(e.aim[0] - cam.x) < 0.02 && Math.abs(e.aim[1] - cam.z) < 0.02 && Math.abs(e.aim[2] - cam.lensH) < 0.02, `lamp ${l.id}: aimed at the camera`);
          // the mast: on the platform, at a guard rail's corner post (a platform on a block) or on the deck (a riser);
          // the can's middle within reach of it; the opening at mast height over the deck
          assert.equal(l.mount, plat.zone === 'stand' ? 'rail' : 'flange'); assert.equal(l.on, `platform.${plat.id}`); assert.equal(l.group, plat.group); assert.equal(l.side, plat.side);
          if (plat.zone === 'stand') assert.ok(Math.abs(Math.abs(l.x - plat.x) - (plat.w / 2 - 0.035)) < 1e-3 && Math.abs(Math.abs(l.z - plat.z) - (plat.d / 2 - 0.035)) < 1e-3, `lamp ${l.id}: its mast is not on a corner post`);
          assert.ok(Math.hypot(l.lit[0], l.lit[2]) <= WORK_LIGHT.reach && Math.abs(l.over - WORK_LIGHT.over) < 0.021 && l.box.h <= plat.h + STATURE.workLightOverDeck, `lamp ${l.id}: ${JSON.stringify(l.lit)}`);
          assert.ok(l.box.x0 >= plat.box.x0 - 0.05 && l.box.x1 <= plat.box.x1 + 0.05 && l.box.z0 >= plat.box.z0 - 0.05 && l.box.z1 <= plat.box.z1 + 0.05, `lamp ${l.id} leaves its platform`);
          assert.ok(l.box.x1 - l.box.x0 <= STATURE.workLightWide && l.box.z1 - l.box.z0 <= STATURE.workLightWide, `lamp ${l.id}: a mast and a can`);
          // outside the app camera's plan reach, as its platform is
          for (const [x, z] of [[l.box.x0, l.box.z0], [l.box.x0, l.box.z1], [l.box.x1, l.box.z0], [l.box.x1, l.box.z1]]) assert.ok(reachMargin(x, z, A) >= clr && !inCameraVolume(x, plat.h + 1, z), `lamp ${l.id}: inside the reach at (${x}, ${z})`);
        }
        if (d === 0) { assert.ok(!p.a6.floor && !p.a6.roadCase && !p.a6.trolley && p.a6.spots.length === 0, 'the lite room: the lamp only'); continue; }
        // the rest of the set, on the dressed floor
        // (the spot under V10 is the first: BACK frames it, so it carries the coil and the run; the one under TV lies
        // behind the table's head rail in every fixed pose)
        const rc = p.a6.roadCase, tr = p.a6.trolley, [tv, v10] = [p.a6.spots[1], p.a6.spots[0]];
        assert.ok(p.a6.floor && rc && tr && p.a6.spots.length === 2 && tv.id === 'tv' && v10.id === 'v10', `detail ${d}: the set`);
        assert.ok(rc.group === p.desk.group && tr.group === p.desk.group, 'the case and the cart join the desk\'s mesh group: no draw call of their own');
        for (const it of [rc, tr]) {
          const b = it.box;
          assert.ok(b.x0 >= I.x0 + BOARD_CLEAR + 0.015 && b.x1 <= I.x1 - BOARD_CLEAR - 0.015 && b.z0 >= I.z0 + BOARD_CLEAR + 0.015 && b.z1 <= I.z1 - BOARD_CLEAR - 0.015, `${it.kind} stands on the island's edging: ${JSON.stringify(b)}`);
          assert.ok(b.h <= 0.95 && b.h + clr <= Math.min(...[[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]].map(([x, z]) => cameraFloor(x, z))), `${it.kind}: ${b.h} m under the cone`);
          for (const g of walkIns(A, 0.9)) assert.ok(!(b.x0 < g.x1 && b.x1 > g.x0 && b.z0 < g.z1 && b.z1 > g.z0), `${it.kind} stands in the ${g.side} walk-in`);
        }
        // the case: at the boards of the end away from the chairs; the cart: at the desk's boards beyond the far monitor
        assert.ok(Math.sign(rc.x) === -Math.sign(p.chairs[0].x) && Math.abs(rc.x) > I.x1 - 1.0 && rc.box.h === ROAD_CASE.top, `the case at (${rc.x}, ${rc.z})`);
        const far = p.dress.monitors[1];
        assert.ok(Math.sign(tr.z) === Math.sign(p.desk.z) && Math.abs(tr.x - p.desk.x) > Math.abs(far.x - p.desk.x) && Math.abs(tr.z) > I.z1 - 1.0 && tr.box.h === TROLLEY.top, `the cart at (${tr.x}, ${tr.z})`);
        // the spots: under the layout's own review poses TV and V10, flat, outside the stroke room; the first with a coil
        // and a taped run of four chords that starts along the boards' foot inside the edging's line and ends at the coil
        for (const [sp, id] of [[tv, 'TV'], [v10, 'V10']]) {
          const v = VIEWS.find((q) => q.id === id);
          assert.ok(sp.x === v.cam[0] && sp.z === v.cam[2] && !inStroke(sp.x, sp.z) && sp.boxes[0].h <= 0.005, `spot ${sp.id}`);
        }
        assert.ok(v10.coil && v10.run?.length === 5 && !tv.coil && !tv.run && v10.box.h <= 0.07, 'the first spot carries the coil and the run');
        const run = p.cables.find((c) => c.of === 'spot');
        assert.ok(run && run.segments.length === 4 && run.segments.every((s) => s.group === v10.group && s.box.h < 0.03), 'the spot\'s run');
        for (const [x, z] of run.path) assert.ok(Math.abs(x) + run.width / 2 <= I.x1 - BOARD_CLEAR + 1e-6 && Math.abs(z) + run.width / 2 <= I.z1 - BOARD_CLEAR + 1e-6 && !inStroke(x, z), `the spot's run reaches the edging or the stroke room at (${x}, ${z})`);
        assert.ok(Math.abs(run.path[0][0] - run.path[1][0]) < 1e-9 && Math.abs(run.path[0][0]) > I.x1 - BOARD_CLEAR - run.width, 'it starts along the boards\' foot');
        const end = run.path.at(-1), cxz = [v10.x + v10.coil[0], v10.z + v10.coil[1]];
        assert.ok(Math.hypot(end[0] - cxz[0], end[1] - cxz[1]) <= SPOT.coil + 0.02, 'it ends at the coil');
        // (its chords turn one way: a curve, not a zigzag)
        const turns = []; for (let i = 1; i + 1 < run.path.length; i++) { const [a, b, c] = [run.path[i - 1], run.path[i], run.path[i + 1]]; turns.push(Math.sign((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))); }
        assert.ok(turns.every((t) => t === turns[0] && t !== 0), `the run's turns: ${turns}`);
        // both chairs stand askew, the other way round from each other; the low camera carries its weight; the desk a spare rest
        const [ca, cb] = p.chairs, [a5a, a5b] = p5.chairs;
        assert.ok(Math.abs(ca.ry - a5a.ry - PLAN.CHAIR_ASKEW_A6) < 1e-3 && cb.ry === a5b.ry && Math.sign(PLAN.CHAIR_ASKEW_A6) === -Math.sign(0.13), 'the chairs');
        assert.ok(p.dress.remote.ballast === true && p.desk.spare === true && p.thresholds.every((t) => t.scuff === 1 || t.scuff === -1));
      }
      // THE LAWS BITE: an opening half a metre off every post; an opening a metre over mast height; a lamp tipped up; a
      // lamp whose camera does not stand; no entry: no lamp and no problem
      const p2 = planFloorRaw(A, 2, null, SET), plat = p2.platforms[0], cam = p2.cameras[0], e0 = WL.find((q) => q.id === plat.id);
      assert.equal(planWorkLight(e0, plat, cam).why, null);
      assert.ok(/from the nearest post/.test(planWorkLight({ ...e0, x: plat.x, z: plat.z }, plat, cam).why), 'a lamp in the middle of the deck passes');
      assert.ok(/over the deck/.test(planWorkLight({ ...e0, h: e0.h + 1 }, plat, cam).why), 'a lamp a metre over mast height passes');
      assert.ok(/not tipped down/.test(planWorkLight({ ...e0, aim: [e0.aim[0], e0.aim[1], e0.h + 0.5] }, plat, cam).why), 'a lamp tipped up passes');
      const off = planFloorRaw({ ...A, floor: { ...A.floor, workLights: [{ ...e0, x: plat.x, z: plat.z }] } }, 2, null, { dress: true, a6: true });
      assert.ok(off.a6.lamps.length === 0 && off.problems.some((t) => /^workLight\./.test(t)) && off.cameras.length === A.floor.cameras.length, 'a lamp that does not fit takes only itself');
      const { workLights: goneWL, ...floorNoWL } = A.floor; void goneWL;
      const none = planFloorRaw({ ...A, floor: floorNoWL }, 2, null, { dress: true, a6: true });
      assert.ok(none.a6.lamps.length === 0 && none.problems.length === 0 && none.a6.roadCase && none.a6.spots.length === 2, 'no entry in the layout: no lamp, the rest of the set stands');
      // the person rule: a work lamp is a mast and a can (the rule holds its height and its width), and it bites
      const pl = p2.platforms[0], at = { x0: pl.x, x1: pl.x + 0.1, z0: pl.z, z1: pl.z + 0.1 };
      assert.deepEqual(checkPeople([{ item: 'workLight', id: pl.id, part: 'mast', top: pl.h + 2.0, ...at }], p2), []);
      assert.ok(checkPeople([{ item: 'workLight', id: pl.id, part: 'mast', top: pl.h + 2.3, ...at }], p2).length > 0, 'a lamp taller than a mast passes');
      assert.ok(checkPeople([{ item: 'workLight', id: pl.id, part: 'can', top: pl.h + 1.7, x0: pl.x, x1: pl.x + 0.45, z0: pl.z, z1: pl.z + 0.1 }], p2).length > 0, 'a lamp as wide as shoulders passes');
      assert.ok(checkPeople([{ item: 'workLight', id: pl.id, part: 'hat', top: pl.h + 1.7, ...at }], p2).length > 0);
      assert.ok(STATURE.workLightOverDeck <= 2.1 && STATURE.workLightWide <= 0.25 && WORK_LIGHT.top <= STATURE.workLightOverDeck);
    });

    const built6 = {};
    for (const tier of ['lite', 'base', 'high']) {
      if (roomLight) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
      built6[tier] = await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:1') } }, args(roomLight));
    }
    // the brief's lines: base at or under 8 draw calls and 4,800 triangles, lite 900; the high room pays for the set
    // (one blended mesh, the players' end; round A6 had a second at the desk's side for its steel and its case's edges)
    const A6_BUDGET = { lite: [4, 900], base: [8, 4800], high: [10, 34500] };
    // FNV-1a over every vertex per tier (A6_REV 1). null while a batch of the set's shapes is being saved
    // (round A7: the high room's pin 66fa3361 -> 90c9eb21. NO VERTEX MOVED: the hash runs mesh by mesh, and the steel,
    // the lenses and the case's edges left the blended meshes for the hard ones when the stand-ins were deleted. The
    // hash of the SORTED vertices of this build is be0a0a67 before and after, 32,602 vertices, 33,818 triangles:
    // scratch/floor/a7/set-before.txt, set-after.txt of the lane. A6_REV and the bake's signature stand.)
    const PINNED_GEOMETRY_A6 = { lite: '74d879e9', base: 'd4724061', high: '90c9eb21' };
    const hashOf = (s) => {
      let hsh = 0x811c9dc5;
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) { const q = Math.round(pos.array[i] * 1e4) | 0; hsh ^= q & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0; hsh ^= (q >> 8) & 0xffff; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
      }
      return hsh.toString(16).padStart(8, '0');
    };
    // (round A7: the blended material holds GLASS alone. In round A6 it also drew the steel, the lens glass, the case's
    // edges in the platforms' pale nosing and the bucket in a grey satin cell: stand-ins for a mirror image of the hall.
    // They are deleted; steel, aluminium, chrome and the lenses are on the hard material, which reads the hall's cube.)
    const BRIGHT_SWATCHES = ['glassThin', 'glassThick', 'glassBottle'];

    ok('a6, the build: lite 900 and base 8 draw calls / 4,800 triangles; the parts in the pinned list, the person rule over what was built; each lamp\'s lit opening within 5 cm of the layout\'s place; EVERY VERTEX lawful; ONE blended material on the high room only (steel opaque, glass by the atlas\'s alpha, the cube at full share)', () => {
      const v = new THREE.Vector3(), gaps = walkIns(A, 0.9);
      for (const [tier, s] of Object.entries(built6)) {
        const c = s.counts(), st = s.state(), plan = planFloorRaw(A, c.detail, null, SET);
        assert.equal(c.enabled, true, `${tier}: ${c.reason}`);
        assert.ok(c.drawCalls <= A6_BUDGET[tier][0] && c.triangles <= A6_BUDGET[tier][1], `${tier}: ${c.drawCalls} draw calls, ${c.triangles} triangles`);
        assert.equal(meshesOf(s.group).length, c.drawCalls);
        assert.ok(st.problems.length === 0 && st.notBuilt.length === 0 && st.look.a6 === true && st.look.dress === true, `${tier}: ${JSON.stringify(st.problems)}`);
        assert.deepEqual([c.workLights, c.roadCases, c.trolleys, c.spots], tier === 'lite' ? [1, 0, 0, 0] : tier === 'base' ? [1, 1, 1, 2] : [A.floor.cameras.length, 1, 1, 2], `${tier}: the set's items`);
        assert.equal(c.tallies, 1); assert.deepEqual(c.emitters, [], 'a work lamp registers nothing: its light is the light role\'s bake emitter'); assert.deepEqual(s.emissives, []);
        assert.notEqual(s.signature(), planSignature(planFloorRaw(A, c.detail, null, A5)), `${tier}: the set is another geometry`);
        assert.equal(s.signature(), planSignature(plan), `${tier}: the built signature is the plan's`);
        // the parts: the pinned list (every one of them built on the high room), the person rule over what was built
        for (const q of c.parts) assert.ok(A6_ALL_PARTS[q.item]?.includes(q.part), `${tier}: ${q.item}.${q.part}`);
        if (tier === 'high') for (const [item, list] of Object.entries(A6_ALL_PARTS)) for (const q of list) assert.ok(c.parts.some((w) => w.item === item && w.part === q), `${tier}: the part ${item}.${q} is in the list and never built`);
        assert.deepEqual(checkPeople(c.parts, plan), [], tier);
        // each lamp as built: its lit opening (the high and the base room's `lens`; the lite room's can) at the layout's
        // place, its mast under it, nothing of it wider than a hand's span
        for (const l of plan.a6.lamps) {
          const e = WL.find((q) => q.id === l.id), mine = c.parts.filter((q) => q.item === 'workLight' && q.id === l.id);
          assert.ok(mine.length >= 2 && mine.some((q) => q.part === 'mast') && mine.some((q) => q.part === 'can'), `${tier}: lamp ${l.id}: ${mine.map((q) => q.part)}`);
          const lens = mine.find((q) => q.part === (tier === 'lite' ? 'can' : 'lens'));
          const tol = tier === 'lite' ? 0.09 : WORK_LIGHT.fit;
          assert.ok(Math.abs((lens.x0 + lens.x1) / 2 - e.x) <= tol && Math.abs((lens.z0 + lens.z1) / 2 - e.z) <= tol && Math.abs(lens.top - e.h) <= tol + 0.02, `${tier}: lamp ${l.id}: its lit opening is built at ${JSON.stringify(lens)} for (${e.x}, ${e.h}, ${e.z})`);
          for (const q of mine) assert.ok(q.x0 >= l.box.x0 - 0.012 && q.x1 <= l.box.x1 + 0.012 && q.z0 >= l.box.z0 - 0.012 && q.z1 <= l.box.z1 + 0.012 && q.top <= l.box.h + 0.004, `${tier}: lamp ${l.id}.${q.part} leaves its planned box: ${JSON.stringify(q)} against ${JSON.stringify(l.box)}`);
        }
        // the albedo law over what was built (the set adds no class)
        const tol = { black: 0.06, cloth: 0.03, leather: 0.03, deck: 0.03, nosing: 0.01 };
        for (const cls of tier === 'lite' ? ['black', 'leather', 'deck'] : ['black', 'cloth', 'leather', 'deck', 'nosing']) assert.ok(c.albedo[cls] && Math.abs(c.albedo[cls].mean / c.albedo[cls].target - 1) <= tol[cls], `${tier}: the built ${cls} mean is ${c.albedo[cls]?.mean}`);
        // nothing off the stands is taller than the low camera
        for (const q of c.parts) if (!['camera', 'platform', 'stool', 'workLight'].includes(q.item)) assert.ok(q.top <= (q.item === 'remote' ? LOW.top : 0.95), `${tier}: ${q.item}.${q.id}.${q.part} is ${q.top} m tall`);
        // EVERY VERTEX
        for (const mesh of meshesOf(s.group)) {
          const pos = mesh.geometry.getAttribute('position'), overlay = /shadow/.test(mesh.name), cutAttr = mesh.geometry.getAttribute('roomSide');
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const hh = v.y - FLOOR, where = `${v.toArray().map((q) => q.toFixed(3))}`;
            assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && hh >= (overlay ? 0.0015 : -1e-6), `${tier} ${mesh.name}: a vertex at ${where}`);
            assert.ok(!inStroke(v.x, v.z), `${tier} ${mesh.name}: a vertex in the stroke room at ${where}`);
            assert.ok(v.x > H.x0 && v.x < H.x1 && v.z > H.z0 && v.z < H.z1, `${tier} ${mesh.name}: a vertex outside the hall at ${where}`);
            if (cutAttr && cutAttr.getX(i) !== 0) { assert.ok(reachMargin(v.x, v.z, A) >= 0, `${tier} ${mesh.name}: a vertex on a seating block inside the plan reach at ${where}`); continue; }
            assert.ok(!inCameraVolume(v.x, hh, v.z) && clearOfCamera(v.x, hh, v.z, A), `${tier} ${mesh.name}: a vertex inside or within ${clr} m of the camera volume at ${where} (cone ${cameraFloor(v.x, v.z)})`);
            const onIsland = v.x > I.x0 && v.x < I.x1 && v.z > I.z0 && v.z < I.z1;
            if (hh > 0.03 && onIsland) {
              assert.ok(v.x > I.x0 + 0.06 && v.x < I.x1 - 0.06 && v.z > I.z0 + 0.06 && v.z < I.z1 - 0.06, `${tier} ${mesh.name}: a standing island vertex at ${where}`);
              const atLow = Math.hypot(v.x - LOW.x, v.z - LOW.z) <= REMOTE.reach.front + 0.02;
              assert.ok(hh <= (atLow ? LOW.top : 1.0), `${tier} ${mesh.name}: an island vertex ${hh} m high at ${where}`);
              for (const g of gaps) assert.ok(!(v.x > g.x0 && v.x < g.x1 && v.z > g.z0 && v.z < g.z1), `${tier} ${mesh.name}: a standing vertex in the ${g.side} walk-in`);
            }
            if (overlay && onIsland) assert.ok(hh < 0.006, `${tier} ${mesh.name}: an overlay off the carpet at ${where}`);
          }
        }
        // no mesh's box holds the table
        const bb = new THREE.Box3();
        for (const mesh of meshesOf(s.group)) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
          assert.ok(!(bb.min.x < stroke.x1 && bb.max.x > stroke.x0 && bb.min.z < stroke.z1 && bb.max.z > stroke.z0), `${tier} ${mesh.name}: its box reaches into the stroke room`);
        }
        // the measured parts of the set's own items lie inside their planned boxes
        for (const it of plan.items.filter((q) => ['roadCase', 'trolley', 'spot', 'remote', 'chair', 'sideTable', 'monitor', 'bin', 'cueStand'].includes(q.kind))) {
          const mine = c.parts.filter((q) => q.item === it.kind && q.id === it.id);
          assert.ok(mine.length > 0, `${tier}: ${it.kind}.${it.id}: nothing built`);
          for (const q of mine) assert.ok(q.x0 >= it.box.x0 - 0.012 && q.x1 <= it.box.x1 + 0.012 && q.z0 >= it.box.z0 - 0.012 && q.z1 <= it.box.z1 + 0.012 && q.top <= it.box.h + 0.004, `${tier}: ${it.kind}.${it.id}.${q.part} leaves the planned box: ${JSON.stringify(q)} against ${JSON.stringify(it.box)}`);
        }
        // no review pose looks through a built part
        const boxes = c.parts.map((q) => ({ id: `${q.item}.${q.id}.${q.part}`, kind: q.item, item: `${q.item}.${q.id}`, flat: q.top <= 0.03, group: 'x', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, h: q.top }));
        assert.deepEqual(checkPlan({ ...plan, problems: [] }, A, VIEWS, boxes).filter((t) => /review camera/.test(t)), [], tier);
        // THE BLENDED MATERIAL: on the high room only, in the groups that hold steel or glass and never in the west one
        const bright = meshesOf(s.group).filter((m) => m.material.name === 'arena.floor.bright');
        if (tier !== 'high') { assert.equal(bright.length, 0, `${tier}: a blended mesh below the high room`); continue; }
        assert.deepEqual(bright.map((m) => m.name).sort(), ['arena.floor.bright.east'], 'the blended meshes');
        const hard = meshesOf(s.group).find((m) => m.material.name === 'arena.floor.hard').material;
        const bm = bright[0].material;
        assert.ok(bright.every((m) => m.material === bm) && bm.transparent === true && bm.depthWrite === true && bm.blending === THREE.CustomBlending && bm.blendSrc === THREE.OneFactor && bm.blendDst === THREE.OneMinusSrcAlphaFactor, 'ONE material object: source + (1 - alpha) x the scene, depth written');
        assert.ok(bm.envMapIntensity === FLOOR_LEVELS.brightEnv && FLOOR_LEVELS.brightEnv === 1 && bm.map?.name === 'arena.floor.colour' && bm.roughnessMap?.name === 'arena.floor.data' && bm.metalnessMap === bm.roughnessMap && !bm.emissiveMap, 'the cube at full share over the part\'s own atlas: no texture of its own');
        assert.ok(bm.map === hard.map && bm.roughnessMap === hard.roughnessMap && hard.transparent === false, 'the same two canvases as the hard material, which stays opaque');
        // the cube is read as the room light binds it: no rotation of its own (a tilt per side group was weighed and
        // dropped: it lifts the bed out of the lookups toward the table and drops it into the ones away from it)
        assert.deepEqual([bm.envMapRotation.x, bm.envMapRotation.y, bm.envMapRotation.z], [0, 0, 0], 'the cube unrotated');
        // every blended vertex samples a steel or a glass cell
        for (const m of bright) { const uv = m.geometry.getAttribute('uv'); for (let i = 0; i < uv.count; i++) assert.ok(BRIGHT_SWATCHES.includes(swatchAt(uv.getX(i), uv.getY(i))), `${m.name}: a vertex in the cell ${swatchAt(uv.getX(i), uv.getY(i))}`); }
        assert.ok(c.textures.length === built.high.s.counts().textures.length && c.textureBytes === built.high.s.counts().textureBytes, 'the set adds no texture');
      }
      // the glass cells carry an alpha in the atlas; steel is opaque there; the stand-in cells of the rooms without the material are opaque dielectrics
      const { ALPHA } = PAINT;
      assert.deepEqual(Object.keys(ALPHA).sort(), ['glassBottle', 'glassThick', 'glassThin']);
      assert.ok(ALPHA.glassThin > 0.04 && ALPHA.glassThin < 0.2 && ALPHA.glassThick > ALPHA.glassThin && ALPHA.glassThick < 0.6 && ALPHA.glassBottle > ALPHA.glassThin && ALPHA.glassBottle <= ALPHA.glassThick, 'a thin wall lets the scene through; a bottle\'s green glass, a base or a lip less');
      assert.ok(SWATCHES.steelBrushed[2] === 1 && SWATCHES.steelBrushed[1] >= 0.3 && SWATCHES.glassThin[2] === 0 && SWATCHES.bottleGlass[2] === 0 && albedoOf('bottleGlass') < 0.03);
      const got = Object.fromEntries(Object.entries(built6).map(([tier, s]) => [tier, hashOf(s)]));
      if (process.argv.includes('--stats')) {
        console.log(`STATS a6 geometry ${JSON.stringify(got)}`);
        for (const [tier, s] of Object.entries(built6)) { const c = s.counts(); console.log(`STATS a6 ${tier}: ${c.drawCalls} draw calls ${JSON.stringify(c.drawCallsByGroup)}, ${c.triangles} triangles, ${JSON.stringify(c.byMaterial)}, texture bytes ${c.textureBytes}, signature ${s.signature()}`); }
      }
      if (PINNED_GEOMETRY_A6) assert.deepEqual(got, PINNED_GEOMETRY_A6, 'the set\'s shapes moved: bump A6_REV in floor/plan.js (the signature follows it), then update the pins');
    });

    // which variant a build WITHOUT a switch gives, and the off arm of the same tree
    const dflt6 = await buildFloorRaw({ tier: 'high', knobs: TIERS.high }, args(roomLight));
    const off6 = await buildFloorRaw({ tier: 'high', knobs: TIERS.high, ctx: { query: qOf('dress:1,a6:0') } }, args(roomLight));
    const baseNoMat = await buildFloorRaw({ tier: 'base', knobs: TIERS.base, ctx: { query: qOf('dress:1,a6:1') } }, args(roomLight));
    ok(`a6: a build without a switch gives ${A6_DEFAULT ? 'THE ROUND\'S SET' : 'round A5\'s floor (the set is DARK)'}; a6:0 is round A5's geometry; a page that loaded below the high room keeps steel and glass on the hard material when its tier is raised`, () => {
      assert.equal(readLook(null).a6, A6_DEFAULT); assert.equal(readLook(qOf('a6:1')).a6, true); assert.equal(readLook(qOf('a6:0')).a6, false); assert.equal(readLook(qOf('a6:on,dress:0')).a6, true);
      if (DRESS_DEFAULT && !A7_DEFAULT) assert.equal(dflt6.signature(), (A6_DEFAULT ? built6.high : off6).signature());
      assert.equal(dflt6.counts().workLights > 0, A6_DEFAULT && HAS_WL);
      assert.equal(off6.counts().workLights, 0); assert.equal(off6.counts().drawCalls, 8);
      assert.ok(!meshesOf(off6.group).some((m) => m.material.name === 'arena.floor.bright'), 'a6:0 has no blended mesh');
      // a base page raised to the high room's detail: the level is built with the materials of the page's tier
      assert.equal(baseNoMat.setTier('high'), true);
      assert.ok(baseNoMat.counts().detail === 2 && !meshesOf(baseNoMat.group).some((m) => m.material.name === 'arena.floor.bright') && baseNoMat.counts().drawCalls === 8, `a raised base page: ${baseNoMat.counts().drawCalls} draw calls`);
      // while the default is off and the layout carries no lamp places, only the tool switch stands the agreed ones in
      if (!HAS_WL) assert.equal(built6.high.counts().workLights, WORK_LIGHTS_PROPOSED.length);
    });
  }
  // -------------------------------------------------------------------------------------------------------------------------
  // 7. ROUND A7 (`a7` on; CONTRACT 19.1, 19.3): tape that reads as tape or is gone; the west corner; the
  //    readers of the hall's reflection.
  // -------------------------------------------------------------------------------------------------------------------------
  {
    const { WEST_CORNER, SPIKE, BOARD_CLEAR, REMOTE, planWestCorner } = PLAN;
    const HAS_WL = Array.isArray(A.floor.workLights);
    const SET6 = { dress: true, a6: true, a7: false, a8: false, workLights: HAS_WL ? null : PLAN.WORK_LIGHTS_PROPOSED }, SET7 = { ...SET6, a7: true };
    const LOW = A.floor.lowCamera ?? PLAN.LOW_CAMERA_PROPOSED;
    const hits = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

    ok('a7, the plan: lawful on every room; NO camera spot, coil or run; a west corner on the base room and up (a chair that looks at the table and is not square to the boards, a side table beside it), in the west third, inside the edging\'s line, under no review pose; the lite room builds none of it and keeps round A6\'s signature; the laws bite', () => {
      for (const d of [0, 1, 2]) {
        const p = planFloorReal(A, d, null, SET7), p6 = planFloorReal(A, d, null, SET6);
        assert.deepEqual(p.problems, [], `detail ${d}`);
        assert.deepEqual(checkPlan(p, A, VIEWS), [], `detail ${d}`);
        assert.ok(p.a6.spots.length === 0 && !p.items.some((it) => it.kind === 'spot') && !p.cables.some((c) => c.of === 'spot'), `detail ${d}: a camera spot, its coil or its run is planned`);
        if (d === 0) { assert.ok(p.a7.on && !p.a7.floor && !p.a7.chair && !p.a7.table); assert.equal(planSignature(p), planSignature(p6), 'the lite room builds none of it: round A6\'s signature'); continue; }
        assert.notEqual(planSignature(p), planSignature(p6), `detail ${d}: the round's geometry is another geometry`);
        const ch = p.a7.chair, st = p.a7.table;
        assert.ok(ch && st && ch.kind === 'chair' && st.kind === 'sideTable' && ch.id === 'w' && st.id === 'w' && ch.lean === (d < 2) && st.lean === (d < 2), `detail ${d}: the west corner`);
        assert.ok(!p.chairs.includes(ch) && p.chairs.length === A.floor.chairs.length && !p.sideTables.includes(st) && p.items.includes(ch) && p.items.includes(st), 'the corner is not one of the players\' places');
        // at the boards of the end away from the players' chairs: the west third, inside the edging's line, beyond the stroke room
        assert.ok(p.chairs.reduce((s, c) => s + c.x, 0) > 0, 'the players sit at the east end');
        for (const b of [ch.box, st.box]) assert.ok(b.x1 <= stroke.x0 && b.x0 >= I.x0 + BOARD_CLEAR && b.x1 <= I.x0 + (I.x1 - I.x0) / 3 && b.z0 > I.z0 + BOARD_CLEAR && b.z1 < I.z1 - BOARD_CLEAR, `detail ${d}: ${JSON.stringify(b)}`);
        assert.ok(ch.group === 'west' && st.group === 'west');
        // not square to the boards (its front at least 8 degrees off both of the hall's axes), and it looks at the table
        const off = Math.min(...[-2, -1, 0, 1, 2].map((k) => Math.abs(ch.ry - (k * Math.PI) / 2)));
        assert.ok(off > 0.14 && off < 0.6, `the west chair is turned ${off} rad off the hall's axes`);
        assert.ok((Math.sin(ch.ry) * -ch.x + Math.cos(ch.ry) * -ch.z) / Math.hypot(ch.x, ch.z) > 0.9, 'the west chair looks at the table');
        // the two do not touch; the table stands on the side away from the hall's long axis; neither under a review pose
        assert.ok(!hits(ch.box, st.box) && Math.abs(st.z) > Math.abs(ch.z));
        for (const v of VIEWS) for (const b of [ch.box, st.box]) assert.ok(!(v.cam[0] > b.x0 - 0.05 && v.cam[0] < b.x1 + 0.05 && v.cam[2] > b.z0 - 0.05 && v.cam[2] < b.z1 + 0.05), `the corner stands under the review pose ${v.id}`);
        assert.ok(ch.box.h + clr <= cameraFloor(ch.x, ch.z, A), 'the west chair under the app camera\'s cone');
      }
      // THE LAWS BITE: a chair in the stroke room; something lying on the west chair; no players' chairs, no corner
      const p2 = planFloorReal(A, 2, null, SET7), w = p2.a7.chair;
      assert.ok(checkPlan({ ...p2, problems: [] }, A, VIEWS, [{ id: 'chair.w', kind: 'chair', item: 'chair.w', group: 'west', x0: stroke.x0 - 0.3, x1: stroke.x0 + 0.4, z0: 0, z1: 0.8, h: 0.79 }]).some((t) => /stroke room/.test(t)), 'a chair in the stroke room passes');
      assert.ok(checkPeople([{ item: 'sideTable', id: 'w', part: 'towel', top: 0.6, x0: w.x - 0.1, x1: w.x + 0.1, z0: w.z - 0.1, z1: w.z + 0.1 }], p2).some((t) => /lies on the chair w/.test(t)), 'a towel on the west chair passes');
      assert.equal(planWestCorner(A, []), null);
      assert.ok(SPIKE.wide >= 0.045 && SPIKE.wide <= 0.055 && SPIKE.len <= 0.16 && Math.abs(WEST_CORNER.askew) >= 0.05);
    });

    const built7 = {};
    for (const tier of ['lite', 'base', 'high']) {
      if (roomLight) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
      built7[tier] = await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:1,a7:1') } }, args(roomLight));
    }
    // round A6's variant of the same tree (`a7:0`): the lite room's twin, and the high room without the switches
    const ref6 = {};
    for (const tier of ['lite', 'high']) {
      if (roomLight) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
      ref6[tier] = await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:1') } }, args(roomLight));
    }
    // the brief's lines: base at or under 8 draw calls and 4,800 triangles, lite 4 and 900; the high room pays for the
    // west corner with four meshes of the west group (leather, the blended glass, the two overlays); the desk's side has
    // no blended mesh (its steel is on the hard material)
    const A7_BUDGET = { lite: [4, 900], base: [8, 4800], high: [13, 36000] };
    // FNV-1a over every vertex per tier (A7_REV 1). null while a batch of the round's shapes is being saved
    const PINNED_GEOMETRY_A7 = { lite: '74d879e9', base: 'de3642fb', high: '5c67e1d9' };
    const hashOf = (s) => {
      let hsh = 0x811c9dc5;
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position');
        for (let i = 0; i < pos.count * 3; i++) { const q = Math.round(pos.array[i] * 1e4) | 0; hsh ^= q & 0xff; hsh = Math.imul(hsh, 0x01000193) >>> 0; hsh ^= (q >> 8) & 0xffff; hsh = Math.imul(hsh, 0x01000193) >>> 0; }
      }
      return hsh.toString(16).padStart(8, '0');
    };
    const GLASS_CELLS = ['glassThin', 'glassThick', 'glassBottle'];
    const cellsOf = (mesh) => { const uv = mesh.geometry.getAttribute('uv'), out = []; for (let i = 0; i < uv.count; i++) out.push(swatchAt(uv.getX(i), uv.getY(i))); return out; };

    ok('a7, the build: lite 4 / 900 and base 8 draw calls / 4,800 triangles; no spot; the west corner built (base: the hard batch alone, no overlay); the person rule; EVERY VERTEX lawful; THE TAPE LAW: nothing pale lies on the island\'s carpet and every piece of spike tape lies at a foot it marks; no stand-in cell exists, steel is steel on the hard material of the base and the high room, the blended meshes hold glass alone', () => {
      const v = new THREE.Vector3(), gaps = walkIns(A, 0.9);
      for (const [tier, s] of Object.entries(built7)) {
        const c = s.counts(), st = s.state(), plan = planFloorReal(A, c.detail, null, SET7);
        assert.equal(c.enabled, true, `${tier}: ${c.reason}`);
        assert.ok(c.drawCalls <= A7_BUDGET[tier][0] && c.triangles <= A7_BUDGET[tier][1], `${tier}: ${c.drawCalls} draw calls, ${c.triangles} triangles`);
        assert.equal(meshesOf(s.group).length, c.drawCalls);
        assert.ok(st.problems.length === 0 && st.notBuilt.length === 0 && st.look.a7 === true && !('hall' in st.look) && st.look.a6 === true, `${tier}: ${JSON.stringify(st.problems)}`);
        assert.deepEqual([c.spots, c.chairs, c.sideTables, c.roadCases, c.trolleys], tier === 'lite' ? [0, 2, 2, 0, 0] : [0, 3, 3, 1, 1], `${tier}: the items`);
        assert.equal(s.signature(), planSignature(plan), `${tier}: the built signature is the plan's`);
        assert.equal(s.signature() === ref6.lite.signature(), tier === 'lite', `${tier}: the lite room keeps round A6's signature, the others do not`);
        for (const q of c.parts) assert.ok(PARTS[q.item]?.includes(q.part) && q.item !== 'spot', `${tier}: ${q.item}.${q.part}`);
        assert.deepEqual(checkPeople(c.parts, plan), [], tier);
        // the west group: the base room's is the hard batch alone; the high room's has leather, glass and both overlays
        assert.equal(c.drawCallsByGroup.west ?? 0, tier === 'lite' ? 0 : tier === 'base' ? 1 : 5, `${tier}: the west group's meshes`);
        // the albedo law over what was built (the west chair is leather: the map on the high room, the flat cell on the base room)
        const tol = { black: 0.06, cloth: 0.03, leather: 0.035, deck: 0.03, nosing: 0.01 };
        for (const cls of tier === 'lite' ? ['black', 'leather', 'deck'] : ['black', 'cloth', 'leather', 'deck', 'nosing']) assert.ok(c.albedo[cls] && Math.abs(c.albedo[cls].mean / c.albedo[cls].target - 1) <= tol[cls], `${tier}: the built ${cls} mean is ${c.albedo[cls]?.mean}`);
        for (const q of c.parts) if (!['camera', 'platform', 'stool', 'workLight'].includes(q.item)) assert.ok(q.top <= (q.item === 'remote' ? LOW.top : 0.95), `${tier}: ${q.item}.${q.id}.${q.part} is ${q.top} m tall`);
        // EVERY VERTEX; and THE TAPE LAW over the vertices that lie on the island's carpet
        const feet = [...plan.chairs, ...(plan.a7.chair ? [plan.a7.chair] : []), ...(plan.dress.remote ? [plan.dress.remote] : [])].map((it) => it.box);
        let spike = 0;
        for (const mesh of meshesOf(s.group)) {
          const pos = mesh.geometry.getAttribute('position'), overlay = /shadow/.test(mesh.name), cutAttr = mesh.geometry.getAttribute('roomSide');
          const cells = /\.(hard|bright)\./.test(mesh.name) ? cellsOf(mesh) : null;
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            const hh = v.y - FLOOR, where = `${v.toArray().map((q) => q.toFixed(3))}`;
            assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z) && hh >= (overlay ? 0.0015 : -1e-6), `${tier} ${mesh.name}: a vertex at ${where}`);
            assert.ok(!inStroke(v.x, v.z), `${tier} ${mesh.name}: a vertex in the stroke room at ${where}`);
            assert.ok(v.x > H.x0 && v.x < H.x1 && v.z > H.z0 && v.z < H.z1, `${tier} ${mesh.name}: a vertex outside the hall at ${where}`);
            if (cutAttr && cutAttr.getX(i) !== 0) { assert.ok(reachMargin(v.x, v.z, A) >= 0, `${tier} ${mesh.name}: a vertex on a seating block inside the plan reach at ${where}`); continue; }
            assert.ok(!inCameraVolume(v.x, hh, v.z) && clearOfCamera(v.x, hh, v.z, A), `${tier} ${mesh.name}: a vertex inside or within ${clr} m of the camera volume at ${where}`);
            const onIsland = v.x > I.x0 && v.x < I.x1 && v.z > I.z0 && v.z < I.z1;
            if (hh > 0.03 && onIsland) {
              assert.ok(v.x > I.x0 + 0.06 && v.x < I.x1 - 0.06 && v.z > I.z0 + 0.06 && v.z < I.z1 - 0.06, `${tier} ${mesh.name}: a standing island vertex at ${where}`);
              const atLow = Math.hypot(v.x - LOW.x, v.z - LOW.z) <= REMOTE.reach.front + 0.02;
              assert.ok(hh <= (atLow ? LOW.top : 1.0), `${tier} ${mesh.name}: an island vertex ${hh} m high at ${where}`);
              for (const g of gaps) assert.ok(!(v.x > g.x0 && v.x < g.x1 && v.z > g.z0 && v.z < g.z1), `${tier} ${mesh.name}: a standing vertex in the ${g.side} walk-in`);
            }
            if (overlay && onIsland) assert.ok(hh < 0.006, `${tier} ${mesh.name}: an overlay off the carpet at ${where}`);
            if (!cells) continue;
            const cell = cells[i];
            // a blended mesh holds glass alone; steel, aluminium and chrome are drawn by the hard material only
            if (/\.bright\./.test(mesh.name)) assert.ok(GLASS_CELLS.includes(cell), `${tier} ${mesh.name}: the cell ${cell} on the blended material`);
            // THE TAPE LAW (a): within 2 cm of the island's carpet nothing is paler than 0.3 (rounds A5 and A6 laid strips
            // of 0.44 there: stray white dashes); a metal has no albedo
            if (onIsland && hh <= 0.02) assert.ok(albedoOf(cell) <= 0.3, `${tier} ${mesh.name}: a pale thing (${cell}, ${albedoOf(cell).toFixed(2)}) on the carpet at ${where}`);
            // THE TAPE LAW (b): spike tape lies flat on the pile, within a hand of the box of a thing it marks
            if (cell === 'spike') {
              spike += 1;
              assert.ok(onIsland && hh >= 0.003 && hh <= 0.006, `${tier}: spike tape off the carpet at ${where}`);
              assert.ok(feet.some((b) => v.x >= b.x0 - 0.14 && v.x <= b.x1 + 0.14 && v.z >= b.z0 - 0.14 && v.z <= b.z1 + 0.14), `${tier}: spike tape alone in the open floor at ${where}`);
            }
          }
        }
        assert.equal(spike > 0, tier !== 'lite', `${tier}: ${spike} vertices of spike tape`);
        // no mesh's box holds the table
        const bb = new THREE.Box3();
        for (const mesh of meshesOf(s.group)) {
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
          assert.ok(!(bb.min.x < stroke.x1 && bb.max.x > stroke.x0 && bb.min.z < stroke.z1 && bb.max.z > stroke.z0), `${tier} ${mesh.name}: its box reaches into the stroke room`);
        }
        // the measured parts lie inside their planned boxes (spike tape lies round a foot: up to 14 cm outside)
        for (const it of plan.items.filter((q) => ['roadCase', 'trolley', 'remote', 'chair', 'sideTable', 'monitor', 'bin', 'cueStand'].includes(q.kind))) {
          const mine = c.parts.filter((q) => q.item === it.kind && q.id === it.id);
          assert.ok(mine.length > 0, `${tier}: ${it.kind}.${it.id}: nothing built`);
          for (const q of mine) { const k = q.part === 'mark' ? 0.14 : 0.012; assert.ok(q.x0 >= it.box.x0 - k && q.x1 <= it.box.x1 + k && q.z0 >= it.box.z0 - k && q.z1 <= it.box.z1 + k && q.top <= it.box.h + 0.004, `${tier}: ${it.kind}.${it.id}.${q.part} leaves the planned box: ${JSON.stringify(q)} against ${JSON.stringify(it.box)}`); }
        }
        // no review pose looks through a built part
        const boxes = c.parts.map((q) => ({ id: `${q.item}.${q.id}.${q.part}`, kind: q.item, item: `${q.item}.${q.id}`, flat: q.top <= 0.03, group: 'x', x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, h: q.top }));
        assert.deepEqual(checkPlan({ ...plan, problems: [] }, A, VIEWS, boxes).filter((t) => /review camera/.test(t)), [], tier);
        // steel is steel: on the HARD material of the base and the high room (the bucket, the bottle), in the chairs' group
        if (tier !== 'lite') {
          const hardEast = meshesOf(s.group).find((m) => m.name === 'arena.floor.hard.east');
          assert.ok(hardEast && cellsOf(hardEast).filter((q) => q === 'steelBrushed').length >= 60, `${tier}: no brushed steel on the hard material at the players' end`);
        }
        const bright = meshesOf(s.group).filter((m) => m.material.name === 'arena.floor.bright');
        assert.deepEqual(bright.map((m) => m.name).sort(), tier === 'high' ? ['arena.floor.bright.east', 'arena.floor.bright.west'] : [], `${tier}: the blended meshes`);
        assert.ok(c.textures.length === built[tier].s.counts().textures.length && c.textureBytes === built[tier].s.counts().textureBytes, 'the round adds no texture');
      }
      // THE TAPE LAW BITES on the cells themselves: the pale strips of rounds A5 and A6 fail it, spike tape is matt and dull
      assert.ok(albedoOf('towel') > 0.3 && albedoOf('spike') >= 0.18 && albedoOf('spike') <= 0.3 && SWATCHES.spike[1] >= 0.9 && SWATCHES.spike[2] === 0, `spike tape: albedo ${albedoOf('spike')}`);
      // THE METALS: metals, at their real reflectance, the steel at a brushed roughness (the brief: 0.35 to 0.5)
      const lum = (name) => luminance(linearOf(SWATCHES[name][0]));
      for (const name of ['steelBrushed', 'alu', 'chrome', 'steel', 'brass']) assert.ok(SWATCHES[name] && SWATCHES[name][2] === 1, `${name}: a metal is a metal`);
      assert.ok(lum('steelBrushed') >= 0.5 && lum('steelBrushed') <= 0.65 && SWATCHES.steelBrushed[1] >= 0.35 && SWATCHES.steelBrushed[1] <= 0.5, `stainless steel: ${lum('steelBrushed')}`);
      // THE STAND-INS OF CONTRACT 18.4 ARE DELETED: no cell, no constant, no option that brings one back
      assert.ok(!('satin' in SWATCHES) && !('bottle' in SWATCHES) && !('glass' in PAINT.GLOW) && !('HALL_FINISH' in PAINT), 'a stand-in cell or the lens\'s constant is still in paint.js');
      assert.deepEqual(Object.keys(PAINT.GLOW).sort(), ['glowBar', 'glowLamp', 'glowScreen', 'tally', 'tallyRim'], 'what glows: lamps and screens, never a reflection');
      for (const f of SOURCES) assert.ok(!/c\.hall\b|opts\?\.hall|look\??\.hall|FLOOR_HALL_DEFAULT|sw\('satin'\)/.test(code(f)), `${f}: a switch that turns the readers off or a stand-in's cell`);
      assert.ok(!/'nosing'/.test(code('floor/items.js').slice(code('floor/items.js').indexOf('export function roadCase'))), 'the flight case\'s edges in the pale stand-in');
      assert.ok(lum('alu') >= 0.55 && lum('chrome') >= 0.5 && lum('steel') >= 0.3 && lum('brass') >= 0.3, 'aluminium, chrome, galvanised steel, brass at their real reflectance');
      const got = Object.fromEntries(Object.entries(built7).map(([tier, s]) => [tier, hashOf(s)]));
      if (process.argv.includes('--stats')) {
        console.log(`STATS a7 geometry ${JSON.stringify(got)}`);
        for (const [tier, s] of Object.entries(built7)) { const c = s.counts(); console.log(`STATS a7 ${tier}: ${c.drawCalls} draw calls ${JSON.stringify(c.drawCallsByGroup)}, ${c.triangles} triangles, ${JSON.stringify(c.byMaterial)}, texture bytes ${c.textureBytes}, signature ${s.signature()}`); }
      }
      if (PINNED_GEOMETRY_A7) assert.deepEqual(got, PINNED_GEOMETRY_A7, 'the round\'s shapes moved: bump A7_REV in floor/plan.js (the signature follows it), then update the pins');
      assert.equal(got.lite, hashOf(ref6.lite), 'the lite room: round A6\'s vertices');
    });

    // THE HALL'S REFLECTION (CONTRACT 19.1): a reader asks with a TAG on its material (`userData.clubHall = { share,
    // keep }`: the env service's interface); the service, built after the room, patches what carries it
    const hallQ = qOf('dress:1,a6:1,a7:1');
    const hallOff = await buildFloorRaw({ tier: 'base', knobs: TIERS.base, ctx: { query: qOf('dress:1,a6:1,a7:1,hall:0') } }, args(roomLight));
    const hNoLight = await buildFloorRaw({ tier: 'high', knobs: TIERS.high, ctx: { query: hallQ } }, args(null));
    const hSvc = await buildFloorRaw({ tier: 'base', knobs: TIERS.base, ctx: { query: hallQ }, env: { hall: { state: () => ({ source: 'file', readers: [{ name: 'arena.floor.hard', share: 1, keep: 0, samplers: 6 }, { name: 'arena.rail', share: 1 }] }) } } }, args(roomLight));
    ok('a7, the hall\'s reflection: every lit material of the part carries the env service\'s tag at full share with nothing kept (three on the high room, two on the base room, one on the lite room), an overlay never; no switch turns a reader off; the part calls nothing of the service and hooks no draw; its state hands on what the service says of its own materials', () => {
      const names = { lite: ['arena.floor.hard'], base: ['arena.floor.hard', 'arena.floor.leather'], high: ['arena.floor.hard', 'arena.floor.leather', 'arena.floor.bright'] };
      assert.ok(FLOOR_LEVELS.hallShare === 1);
      for (const [tier, s] of Object.entries(built7)) {
        const mats = [...new Set(meshesOf(s.group).map((m) => m.material))];
        for (const m of mats) {
          if (/shadow/.test(m.name)) assert.ok(!m.userData.clubHall, `${m.name}: an overlay is no reader`);
          else assert.deepEqual(m.userData.clubHall, { share: 1, keep: 0 }, `${tier} ${m.name}`);
        }
        assert.deepEqual(s.state().hallEnv.tagged, names[tier], tier);
        assert.equal(s.state().hallEnv.service, null, 'no service in this arm: nothing to hand on');
        for (const m of meshesOf(s.group)) assert.ok(!Object.prototype.hasOwnProperty.call(m, 'onBeforeRender') && !Object.prototype.hasOwnProperty.call(m, 'onAfterRender'), `${m.name}: a draw hook`);
      }
      // no switch turns a reader off: round A6's geometry is tagged too, and `hall:0` in the tool switches is not read
      assert.deepEqual(ref6.lite.state().hallEnv.tagged, names.lite);
      assert.deepEqual(ref6.high.state().hallEnv.tagged, names.high.filter((n) => meshesOf(ref6.high.group).some((m) => m.material.name === n)));
      assert.deepEqual(hallOff.state().hallEnv.tagged, names.base);
      // the plain materials of a page without the room light carry the tag too (plain data; nobody reads it there)
      assert.deepEqual(hNoLight.state().hallEnv.tagged, names.high);
      // the service's own record of the part's materials is handed on, nothing else of it
      assert.deepEqual(hSvc.state().hallEnv.service, { source: 'file', readers: [{ name: 'arena.floor.hard', share: 1, keep: 0, samplers: 6 }] });
      // the sources: the part never calls the service (it reads its state for the record)
      for (const f of SOURCES) assert.ok(!/\.apply\s*\(|\.capture\s*\(|\.exclude\s*\(|setHall/.test(code(f)), `${f}: a call into the env service`);
      assert.equal((code('floor.js').match(/club\?\.env/g) ?? []).length, 1, 'floor.js reads the env service once: its state, for the record');
    });

    const dflt7 = await buildFloorRaw({ tier: 'high', knobs: TIERS.high, ctx: { query: { get: (k) => (k === 'clubfloor' ? 'a8:0' : null) } } }, args(roomLight));
    ok(`a7: a build without a switch gives ${A7_DEFAULT ? 'THE ROUND\'S GEOMETRY' : 'round A6\'s geometry (the round\'s is DARK)'} and THE READERS of the hall's reflection; a7:0 is round A6's geometry; \`hall\` is not a switch of the part`, () => {
      assert.equal(readLook(null).a7, A7_DEFAULT); assert.ok(!('hall' in readLook(null)));
      const rq = (t) => readLook({ get: (k) => (k === 'clubfloor' ? t : null) });
      assert.ok(rq('a7:1').a7 === true && rq('a7:0').a7 === false && rq('hall:on,a7:off').a7 === false && !('hall' in rq('hall:0')));
      if (DRESS_DEFAULT && A6_DEFAULT) assert.equal(dflt7.signature(), (A7_DEFAULT ? built7.high : ref6.high).signature());
      assert.equal(dflt7.state().hallEnv.tagged.length, 3);
      assert.equal(dflt7.counts().spots, A7_DEFAULT ? 0 : 2);
      // `hall:0` in the tool switches is not read: the same build
      assert.equal(hallOff.signature(), built7.base.signature());
      assert.equal(hallOff.counts().triangles, built7.base.counts().triangles);
    });
  }
  // -------------------------------------------------------------------------------------------------------------------------
  // 8. ROUND A8 (`a8` on; CONTRACT 20.2 row 6): the monitor position on the west floor (monitor and stool on the base
  //    room and up: the base room reads the high room's light file, which holds their shadows; the tape on high).
  // -------------------------------------------------------------------------------------------------------------------------
  {
    const { BOARD_CLEAR } = PLAN;
    const SET8 = { dress: true, a6: true, a7: true, a8: true };
    ok('a8, the plan: lawful on every room; a floor monitor that looks at the table in the south-west quadrant beyond the stroke room with a folding stool beside it (the base room and up); on the HIGH room its tape straight to the south boards\' foot; the lite room builds none of it and keeps round A7\'s signature; nothing lies on the stool', () => {
      for (const d of [0, 1, 2]) {
        const p = planFloorReal(A, d, null, SET8), p7 = planFloorReal(A, d, null, { ...SET8, a8: false });
        assert.deepEqual(checkPlan(p, A, VIEWS), [], `detail ${d}`);
        if (d === 0) { assert.ok(p.a8.on && !p.a8.floor && !p.a8.monitor && !p.a8.stool); assert.equal(planSignature(p), planSignature(p7), 'the lite room: round A7\'s signature'); continue; }
        assert.notEqual(planSignature(p), planSignature(p7), 'the round\'s geometry is another geometry');
        const m = p.a8.monitor, st = p.a8.stool, run = p.cables.find((c) => c.of === 'monitor' && c.id === 's');
        assert.ok(m?.kind === 'monitor' && m.group === 'west' && st?.kind === 'stool' && p.stools.includes(st) && st.group === 'west' && (d === 2 ? run && m.lead : !run && !m.lead), `detail ${d}: the monitor position`);
        for (const b of [m.box, st.box]) assert.ok(b.x1 <= stroke.x0 && b.z0 > 0 && b.x0 >= I.x0 + BOARD_CLEAR && b.z1 < I.z1 - BOARD_CLEAR && b.h <= 0.5, JSON.stringify(b));
        assert.ok((Math.sin(m.ry) * -m.x + Math.cos(m.ry) * -m.z) / Math.hypot(m.x, m.z) > 0.99, 'the monitor looks at the table');
        assert.ok(checkPeople([{ item: 'monitor', id: 's', part: 'case', top: 0.6, x0: st.x - 0.1, x1: st.x + 0.1, z0: st.z - 0.1, z1: st.z + 0.1 }], p).some((t) => /lies on the stool s/.test(t)), 'a thing on the stool passes');
        if (d < 2) continue;
        assert.ok(run.path[0][0] === run.path[1][0] && Math.abs(run.path[1][1] - (I.z1 - BOARD_CLEAR)) < 1e-6, 'its tape runs straight to the edging\'s line');
      }
    });
    const built8 = {};
    for (const tier of ['lite', 'base', 'high']) {
      if (roomLight) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
      built8[tier] = { on: await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:1,a7:1,a8:1') } }, args(roomLight)), off: await buildFloorRaw({ tier, knobs: TIERS[tier], ctx: { query: qOf('dress:1,a6:1,a7:1') } }, args(roomLight)) };
    }
    ok(`a8, the build: the lite room is round A7's build; the base room gains the monitor (paid for with its monitors' bevels) and the stool whose shadow its light file holds (8 draw calls, 104 triangles over round A7's build at most, 4,900 in all); the high room gains one monitor, one stool and one taped run inside 13 draw calls and 36,000 triangles, no draw call more; a build without a switch gives ${A8_DEFAULT ? 'THE ROUND\'S GEOMETRY' : 'round A7\'s geometry (the round\'s is DARK)'}`, () => {
      { const { on, off } = built8.lite; assert.equal(on.signature(), off.signature()); assert.deepEqual([on.counts().drawCalls, on.counts().triangles], [off.counts().drawCalls, off.counts().triangles]); }
      { const b = built8.base.on.counts(), b7 = built8.base.off.counts(); assert.deepEqual([b.monitors - b7.monitors, b.stools - b7.stools, b.cablePieces - b7.cablePieces, b.drawCalls], [1, 1, 0, 8]); assert.ok(b.triangles <= b7.triangles + 104 && b.triangles <= 4900, `base: ${b.triangles} triangles (round A7: ${b7.triangles})`); }
      if (process.argv.includes('--stats')) { const b = built8.base.on.counts(); console.log(`STATS a8 base: ${b.drawCalls} draw calls, ${b.triangles} triangles (round A7: ${built8.base.off.counts().triangles})`); }
      const c = built8.high.on.counts(), c7 = built8.high.off.counts();
      assert.deepEqual(built8.high.on.state().problems, []);
      assert.deepEqual([c.monitors - c7.monitors, c.stools - c7.stools, c.cablePieces - c7.cablePieces, c.drawCalls - c7.drawCalls], [1, 1, 1, 0]);
      assert.ok(c.drawCalls <= 13 && c.triangles <= 36000 && c.triangles > c7.triangles, `high: ${c.drawCalls} draw calls, ${c.triangles} triangles`);
      // EVERY VERTEX of the high room's build: outside the stroke room and the app camera's volume, nothing pale on
      // the island's carpet (round A7's tape law: the taped run is grey cloth tape), no mesh's box over the table
      const v = new THREE.Vector3(), bb = new THREE.Box3();
      for (const mesh of meshesOf(built8.high.on.group)) {
        const pos = mesh.geometry.getAttribute('position'), uv = mesh.geometry.getAttribute('uv'), cut = mesh.geometry.getAttribute('roomSide'), hard = /\.hard\./.test(mesh.name);
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i);
          const hh = v.y - FLOOR, where = `${mesh.name} at ${v.toArray().map((q) => q.toFixed(3))}`;
          assert.ok(!inStroke(v.x, v.z), `a vertex in the stroke room: ${where}`);
          if (!(cut && cut.getX(i) !== 0)) assert.ok(clearOfCamera(v.x, hh, v.z, A), `a vertex inside or within ${clr} m of the camera volume: ${where}`);
          if (hard && hh <= 0.02 && v.x > I.x0 && v.x < I.x1 && v.z > I.z0 && v.z < I.z1) assert.ok(albedoOf(swatchAt(uv.getX(i), uv.getY(i))) <= 0.3, `a pale thing on the carpet: ${where}`);
        }
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
        assert.ok(!(bb.min.x < stroke.x1 && bb.max.x > stroke.x0 && bb.min.z < stroke.z1 && bb.max.z > stroke.z0), `${mesh.name}: its box reaches into the stroke room`);
      }
      if (process.argv.includes('--stats')) console.log(`STATS a8 high: ${c.drawCalls} draw calls ${JSON.stringify(c.drawCallsByGroup)}, ${c.triangles} triangles (round A7: ${c7.triangles}), signature ${built8.high.on.signature()}`);
      assert.equal(readLook(null).a8, A8_DEFAULT);
      const rq = (t) => readLook({ get: (k) => (k === 'clubfloor' ? t : null) });
      assert.ok(rq('a8:1').a8 === true && rq('a8:0').a8 === false);
    });
    const dflt8 = await buildFloorRaw({ tier: 'high', knobs: TIERS.high }, args(roomLight));
    ok('a8: the default build of the high room is the pinned variant', () => {
      if (DRESS_DEFAULT && A6_DEFAULT && A7_DEFAULT) assert.equal(dflt8.signature(), built8.high[A8_DEFAULT ? 'on' : 'off'].signature());
    });
  }
  if (!hadDocument) delete globalThis.document;
}

console.log(`test-club-arena-floor: ${n} checks passed`);
