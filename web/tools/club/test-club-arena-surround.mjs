// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-arena-surround.mjs — node arm of the arena's surround (CONTRACT.md 13.4 to 13.7, 14, 15; owner: surround).
//   1. the LEGAL arm: the pinned list of every word and picture the surround draws (arena/surround/content.js). A new word or
//      mark fails it until the pins below are updated by an audit; no word outside the layout's WORDS; the person rule (no
//      figure, no person-shaped item in any draw list, nothing on or over a real seat), with proofs that the rule bites;
//   2. the plan (arena/surround/plan.js): boards and seating outside the keep-outs and inside the hall, seat counts per block
//      (384, and no number above it anywhere), every seat's fixed-seed pose, the emitters within the share of 6;
//   3. the levels (arena/surround/levels.js), round A3: THE ALBEDO LAW (CONTRACT 15.2: the means of every swatch and of the
//      painted pictures pinned to the layout's table, no painted shade, graphite seats), THE RAIL AS OPTICS (the profile's
//      section and the opal's emission law: what each review pose sees, the bed leading in the play poses by geometry) and
//      NO VIEW RULE (CONTRACT 15.3: no term of the surround's shaders reads the camera's world position or height other
//      than through the surface's own view angle; no switch by pose, no capture level);
//   4. the whole surround built in node (three from the vendored file, a stub 2D canvas) on every tier, with the room's real
//      light object and without it: every vertex finite, inside the hall, outside the stroke room, under the camera or behind
//      its side's cut plane; one mesh per draw call; names, budgets, the shadow overlays' names; every seat real on the high
//      tier; the geometry pinned against its revision; never a throw.
// Run: node web/tools/club/test-club-arena-surround.mjs   (add --stats for the counts per tier)
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ARENA, PALETTE, WORDS, SIDE, VIEWS, cutPlanes, cameraFloor, underCamera, blockFootprint } from '../../scene/club/arena/layout.js';
import * as LAYOUT from '../../scene/club/arena/layout.js';
import { planSurround, planBoards, planSeating, planSeats, seatsChecksum, planScoreboard, planEmitters, planSignature, washPlace, capOf, profileSection, toWorld, seatForm, BOARD, SEAT, UPHOLSTERY, UPHOLSTERY_REV, BOARD_SEQUENCE, SURROUND_GEOMETRY_REV } from '../../scene/club/arena/surround/plan.js';
import { KINDS, PANELS, PANEL, PLAIN_CROP, SCOREBOARD, LED, SEAT_PARTS, SEAT_3D_PARTS, ATLAS, PERSON_NAME, drawLists, wordsDrawn, manifest, contentHash, checkList, checkAll } from '../../scene/club/arena/surround/content.js';
import * as LEVELS from '../../scene/club/arena/surround/levels.js';
import { weaveMaps, panelNormal, scaleToMean, flatSwatches, tones } from '../../scene/club/arena/surround/paint.js';
import { covers, textWidth } from '../../scene/club/room/props/strokefont.js';

const { RAIL, BOARDS, BOARD_LED, STEP, SCORE, SCORE_SLIDE, SURFACE, SHADOW, PRINT, SEAT_COLOR, SEATS, seatColor, SEAT_ASSETS, ALBEDO, SWATCH, SWATCH_LITE, LEVEL, luminance, withLuminance, opalLaw, slotView, wallShare, railSeen, tentCover } = LEVELS;
let n = 0;
const ok = (name, fn) => { fn(); n += 1; console.log(`OK ${name}`); };
const here = fileURLToPath(new URL('.', import.meta.url));
const src = (rel) => fs.readFileSync(`${here}../../scene/club/arena/${rel}`, 'utf8');
const SOURCES = ['surround.js', 'surround/content.js', 'surround/paint.js', 'surround/plan.js', 'surround/levels.js', 'surround/seat.js'];
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };

// ---------------------------------------------------------------------------------------------------------------------------
// 1. THE PINS. Everything the surround draws, as `<list>: <kind>[ "<word>"][ <part>]` -> how many. Changing a draw list, the
// atlas layout or the seat's parts changes the hash: update both pins only after auditing the new content against
// CONTRACT.md 13.5 (own generic marks, the four words, no people, nothing of a real event).
// (Round A2 audit: the seat list gained `pad` (the upholstered pad of the back) and lost `plate` (a blank number plate); the
// atlas gained flat swatches and the step lights' pool. No word, mark or panel changed.)
// (Round A3 audit: the atlas LOST two regions, `railGrad` (the dome's gradient) and `pool` (the step lights' painted pool);
// nothing was added. No word, mark, panel or seat part changed: the manifest below is round A2's, line for line.)
// ---------------------------------------------------------------------------------------------------------------------------
const PINNED_HASH = '3307cbe9';
const PINNED = {
  'panel.marks: fill': 1, 'panel.marks: rect': 2, 'panel.marks: slant': 3, 'panel.marks: diamond': 3,
  'panel.nineball: fill': 1, 'panel.nineball: rect': 2, 'panel.nineball: word "9-BALL"': 1, 'panel.nineball: slant': 3,
  'panel.arena: fill': 1, 'panel.arena: rect': 2, 'panel.arena: word "ARENA"': 1, 'panel.arena: slant': 3,
  'panel.table: fill': 1, 'panel.table: rect': 2, 'panel.table: word "TABLE 1"': 1, 'panel.table: slant': 3,
  'scoreboard: fill': 1, 'scoreboard: frame': 1, 'scoreboard: rect': 3, 'scoreboard: chevron': 6, 'scoreboard: word "9-BALL"': 1, 'scoreboard: diamond': 2, 'scoreboard: word "FINAL"': 1,
  'seat: rect standard': 1, 'seat: rect base': 1, 'seat: rrect back': 1, 'seat: rrect pad': 1, 'seat: rrect pan': 1, 'seat: rect hinge': 2, 'seat: rrect armrest': 1,
  'seat: rrect roll': 1, 'seat: rect plate': 1,
};
// (Round A5 audit: the seat list gained `roll` (the cushion's cloth roll over the tipped-up pan's lip: a flat band of the
// fabric's colour) and `plate` (a BLANK number plate: one flat pale rectangle of 60 x 22 mm, no digit, no mark: the
// painter fills it with one colour and the arm below pins that); the real seat's parts gained `cushion` and `plate`.
// No word, mark or panel changed.)
const PINNED_WORDS = ['9-BALL', 'ARENA', 'TABLE 1', '9-BALL', 'FINAL'];   // in the order of the lists
const PINNED_KINDS = ['fill', 'rect', 'rrect', 'slant', 'diamond', 'chevron', 'frame', 'word'];
const PINNED_SEAT_3D = ['standard', 'armrest', 'back', 'pad', 'pan', 'cushion', 'plate'];
// the seats' fixed seed (plan.js planSeats): the same rows on every load
// (round A6: per geometry revision; revision 8 spreads the poses wider, plan.js UPHOLSTERY.vary: pinned once seen in the app)
const PINNED_SEATS_BY_REV = { 7: '4a112977', 8: '6ec9e8d6' };
const PINNED_SEATS = PINNED_SEATS_BY_REV[SURROUND_GEOMETRY_REV] ?? null;
// a hash of every built vertex and instance matrix per tier, against the geometry revision (plan.js SURROUND_GEOMETRY_REV):
// a shape cannot change without the revision, and so the bake's signature, changing
// (round A4, revision 6: the rail's extrusion is a corner profile with a 45 degree chamfer, its slit of light on the
// chamfer; an LED panel's face and the cabinet's black face behind it stand where the print stood; the cap keeps its
// 60 mm nose under LED panels; a seat's back has cloth on its top arc. Revision 5 was a 15 degree wedge, never pinned)
// (round A5, revision 7: the HIGH tier's seat is sewn: a welt and a seam on the back's pad, the pan's cushion and the
// armrest caps as instanced meshes, a blank plate on each pan and each row's aisle standard; seen in the app frame s6
// before this pin. Base and lite: no vertex moved: their hashes are revision 6's)
// (round A6, revision 8: the HIGH tier's upholstery has form (the back's two panels as bolsters, a waterfall edge on the
// pan's cushion, a wider spread of poses); base and lite: each row's card stands 0.11 m nearer the table, on the plane
// of the real pad's face. A revision listed here with no hashes is built and logged, not yet pinned: seen in the app first)
// (revision 8 pinned at 13:11Z after the app frames u1 (V10, V9, V3), u2 (a block close) and u3 (BACK) of round A6)
// (13:31Z: the high tier's hash re-pinned after the bolsters' profile became a parabola: app frame u4, V10 V3 V1)
const PINNED_GEOMETRY_BY_REV = { 7: { lite: '9a47c427', base: 'ec17e2d4', high: '0251c2d2' }, 8: { lite: '1a8d3e79', base: '0f344afb', high: 'ae0ce8a4' } };
const PINNED_GEOMETRY = { rev: SURROUND_GEOMETRY_REV, ...(PINNED_GEOMETRY_BY_REV[SURROUND_GEOMETRY_REV] ?? {}) };

ok('legal: the list of everything drawn is the pinned list (a new word or mark fails here until it is audited)', () => {
  const got = {};
  for (const line of manifest()) got[line] = (got[line] ?? 0) + 1;
  assert.deepEqual(got, PINNED);
  assert.deepEqual(wordsDrawn().map((w) => w.text), PINNED_WORDS);
  assert.deepEqual([...KINDS], PINNED_KINDS, 'the primitive kinds the painter knows');
  assert.deepEqual([...SEAT_3D_PARTS], PINNED_SEAT_3D);
  assert.equal(contentHash(), PINNED_HASH, 'a draw list, the atlas layout or the seat changed: audit it, then update PINNED_HASH');
});

ok('legal: every word is one of the layout\'s WORDS, each of them is used, and the stroke font holds every character', () => {
  assert.deepEqual([...WORDS], ['9-BALL', 'TABLE 1', 'ARENA', 'FINAL'], 'the layout\'s word list itself');
  const used = new Set();
  for (const w of wordsDrawn()) { assert.ok(WORDS.includes(w.text), `${w.list}: "${w.text}" is not on the layout's list`); assert.ok(covers(w.text), `no glyphs for "${w.text}"`); used.add(w.text); }
  for (const w of WORDS) assert.ok(used.has(w), `"${w}" is never drawn`);
  // a word is the only item that carries text: no other item has a string that could be read as writing
  for (const [name, list] of Object.entries(drawLists())) for (const it of list) {
    for (const [k, v] of Object.entries(it)) if (typeof v === 'string' && !['k', 'c', 'tone', 'part', 'align'].includes(k)) assert.ok(it.k === 'word' && k === 'text', `${name}: a stray string '${k}: ${v}'`);
  }
  // the scoreboard is a title card: two words, no score. The only digit on it is the title's own
  const sb = SCOREBOARD.filter((it) => it.k === 'word').map((it) => it.text);
  assert.deepEqual(sb, ['9-BALL', 'FINAL']);
  assert.equal(sb.join('').replace(/[^0-9]/g, ''), '9', 'digits on the scoreboard');
  // the game's own name and anything like it is nowhere in the surround's sources
  for (const f of SOURCES) assert.ok(!/open\s*billiards|openbilliards/i.test(src(f)), `${f}: a product name`);
});

ok('legal: the person rule holds on every draw list, part and region name, and it bites on a figure', () => {
  assert.deepEqual(checkAll(), []);
  for (const [name, list] of Object.entries(drawLists())) {
    assert.deepEqual(checkList(name, list), [], name);
    for (const it of list) assert.ok(KINDS.includes(it.k), `${name}: kind ${it.k}`);
  }
  // the painter has no primitive to draw a figure with: no disc, ellipse, arc, curve or free path among the kinds
  for (const k of ['disc', 'circle', 'ellipse', 'arc', 'path', 'curve', 'polygon', 'image', 'sprite']) assert.ok(!KINDS.includes(k), `kind ${k}`);
  // proofs that the rule bites
  assert.ok(checkList('x', [{ k: 'disc', x: 0, y: 0, r: 1, c: 'rail' }]).length > 0, 'an unknown kind passes');
  assert.ok(checkList('x', [{ k: 'rrect', x: 0.4, y: 1.0, w: 0.2, h: 0.22, r: 0.1, c: 'rail' }, { k: 'rrect', x: 0.2, y: 0.4, w: 0.6, h: 0.6, r: 0.1, c: 'rail' }]).length > 0, 'a head on shoulders passes');
  assert.ok(checkList('x', [{ k: 'rect', x: 0, y: 0, w: 1, h: 1, c: 'rail', part: 'spectator' }]).length > 0, 'a part called spectator passes');
  assert.ok(checkList('crowd', [{ k: 'fill', c: 'board' }]).length > 0, 'a list called crowd passes');
  for (const w of ['person', 'people', 'figure', 'silhouette', 'head', 'face', 'crowd', 'spectator', 'audience', 'player', 'referee', 'bag']) assert.ok(PERSON_NAME.test(w), w);
  for (const w of ['armrest', 'back', 'pad', 'pan', 'standard', 'base', 'hinge', 'seat', 'shell', 'underside', 'frame', 'arm', 'fabric']) assert.ok(!PERSON_NAME.test(w), `${w} is a seat part`);
  // the seat is FOLDED and empty: the pan stands up in front of the back (higher than deep), nothing sits on it
  const pan = SEAT_PARTS.find((p) => p.part === 'pan'), back = SEAT_PARTS.find((p) => p.part === 'back'), pad = SEAT_PARTS.find((p) => p.part === 'pad');
  assert.ok(pan.h > 0.3 && pan.y + pan.h > back.y + 0.2 && pan.w < back.w, 'the pan is tipped up against the back');
  assert.ok(pad.x > back.x && pad.y > back.y && pad.x + pad.w < back.x + back.w && pad.y + pad.h < back.y + back.h, 'the pad lies inside the back\'s shell');
  assert.deepEqual([...new Set(SEAT_PARTS.map((p) => p.part))].sort(), ['armrest', 'back', 'base', 'hinge', 'pad', 'pan', 'plate', 'roll', 'standard']);
  // round A5: the plate is BLANK (one flat rectangle, painted with one fill and nothing else) and small; the roll is a band of cloth on the pan's lip
  const plate = SEAT_PARTS.find((p) => p.part === 'plate'), roll = SEAT_PARTS.find((p) => p.part === 'roll');
  assert.ok(plate.k === 'rect' && plate.w <= 0.07 && plate.h <= 0.03 && plate.y > pan.y + pan.h * 0.6 && plate.y + plate.h < pan.y + pan.h && plate.x > pan.x && plate.x + plate.w < pan.x + pan.w, 'the plate is a small tag on the pan\'s underside, near its lip');
  assert.ok(/\} else if \(it\.part === 'plate'\) \{\n\s*ctx\.fillStyle = css\(base\); ctx\.fillRect\(x, y, w, h\);\n\s*\} else if/.test(src('surround/paint.js')), 'the plate is painted with anything but one flat fill (no digits: CONTRACT 13.5)');
  assert.ok(roll.tone === 'fabric' && Math.abs(roll.y + roll.h - (pan.y + pan.h)) < 0.01 && roll.h < 0.04 && roll.w <= pan.w, 'the roll lies on the pan\'s lip');
  // the card's seat and the real seat are one seat (plan.js SEAT): the same back, the same pan, the same pitch
  assert.ok(Math.abs(back.w - SEAT.back.w) < 1e-9 && Math.abs(back.h - SEAT.back.h) < 1e-9 && Math.abs(back.y - SEAT.back.y) < 1e-9, 'the card\'s back is the real back');
  assert.ok(Math.abs(pan.w - SEAT.pan.w) < 1e-9 && Math.abs(pan.h - SEAT.pan.depth) < 1e-9 && Math.abs(pan.y - (SEAT.pan.pivotY - SEAT.pan.rear)) < 1e-9, 'the card\'s pan is the real pan, tipped up');
  // sources: no figure is modelled either (a word check on the builder, the painter and the seat)
  for (const f of ['surround.js', 'surround/paint.js', 'surround/plan.js', 'surround/seat.js']) {
    const code = src(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/spectator|crowd|audience|silhouette|\bfigure\b|\bperson\b|\bpeople\b|\bhead\b(?!s\b)|\bface\b\s*\(|\bcoat\b|\bjacket\b|\bbag\b/i.test(code), `${f}: a word that describes a person in code`);
  }
});

ok('legal: the painter draws lists only: stroke-font words, no canvas text, no image, no file', () => {
  const paint = src('surround/paint.js');
  assert.ok(!/fillText|strokeText|\.font\s*=|measureText/.test(paint), 'canvas text in paint.js');
  assert.ok(!/new Image|\.src\s*=|fetch\(|drawImage\((?!small)/.test(paint), 'an image or a request in paint.js');
  assert.ok(/layoutText/.test(paint) && /checkList\(/.test(paint), 'paint.js strokes its words and audits its lists');
  // everything fits its surface: words inside their panel and clear of the bars, items inside the list's units
  for (const [name, list] of Object.entries(PANELS)) for (const it of list) {
    if (it.k === 'word') {
      const w = textWidth(it.text, it.track ?? 1) * it.size;
      assert.ok(it.x >= 0.1 && it.x + w <= 1.38 && it.y >= 0.2 && it.y + it.size <= PANEL.h - 0.15, `${name}: "${it.text}" spans ${it.x.toFixed(2)}..${(it.x + w).toFixed(2)} m`);
    } else if (it.k === 'rect' || it.k === 'slant') assert.ok(it.x >= 0 && it.x + it.w + (it.lean ?? 0) * it.h <= PANEL.w + 1e-9 && it.y >= 0 && it.y + it.h <= PANEL.h, `${name}: ${it.k} outside the panel`);
  }
  for (const it of SCOREBOARD) if (it.k === 'word') { const w = textWidth(it.text, it.track ?? 1) * it.size; assert.ok(w <= LED.w - 100 && it.y >= 4 && it.y + it.size <= LED.h - 8, `scoreboard: "${it.text}" is ${w.toFixed(0)} cells wide`); }
  assert.ok(PLAIN_CROP.x0 >= 1.03 && PLAIN_CROP.x1 <= 1.25, 'the end pieces show the part of the marks panel that holds only the ground and the rule');
  // the atlas: regions inside the canvas, no two overlapping, at most 2048 px on the long side
  assert.ok(ATLAS.w <= 2048 && ATLAS.h <= 2048);
  const regions = [...Object.entries(ATLAS.panels), ...Object.entries(ATLAS.swatches), ...['blob', 'blobBox', 'aoBox', 'white'].map((k) => [k, ATLAS[k]])];
  assert.ok(!('pool' in ATLAS) && !('railGrad' in ATLAS), 'a painted pool of light or the dome\'s gradient is back in the atlas');
  for (const [k, [x, y, w, h]] of regions) assert.ok(x >= 0 && y >= 0 && x + w <= ATLAS.w && y + h <= ATLAS.h, `atlas region ${k}`);
  for (let i = 0; i < regions.length; i++) for (let j = i + 1; j < regions.length; j++) {
    const [a, [ax, ay, aw, ah]] = regions[i], [b, [bx, by, bw, bh]] = regions[j];
    assert.ok(ax + aw <= bx || bx + bw <= ax || ay + ah <= by || by + bh <= ay, `atlas regions ${a} and ${b} overlap`);
  }
  // the two data maps are arithmetic: the same bytes on every call, tangent-space normals that point out of the surface
  for (const [name, make] of [['weave', () => weaveMaps({ size: 64, threads: 16 }).normal], ['panel', () => panelNormal({ size: 64 }).normal]]) {
    const a = make(), b = make();
    assert.equal(a.length, 64 * 64 * 4); assert.deepEqual(a, b, `${name}: not the same map twice`);
    let tilt = 0;
    for (let i = 0; i < a.length; i += 4) { assert.ok(a[i + 2] > 180 && a[i + 3] === 255, `${name}: a normal that leaves the surface`); tilt = Math.max(tilt, Math.hypot(a[i] - 127.5, a[i + 1] - 127.5) / 127.5); }
    assert.ok(tilt > 0.005 && tilt < 0.6, `${name}: the steepest tilt is ${tilt.toFixed(3)}`);
  }
  const wm = weaveMaps({ size: 64, threads: 16 });
  assert.ok(wm.normal[0] === 128 && wm.normal[1] === 128 && wm.normal[2] === 255 && wm.flatUV[0] > 0 && wm.flatUV[0] < 4 / 64, 'the weave\'s flat corner (the shells sample it)');
});

// ---------------------------------------------------------------------------------------------------------------------------
// 2. the plan
// ---------------------------------------------------------------------------------------------------------------------------
const TABLE = { hx: 1.45, hz: 0.82 };   // the table's outer rectangle (room.js tableRect default; the app's is within 2 cm)
const stroke = { x: TABLE.hx + ARENA.keepOut.strokeRoom, z: TABLE.hz + ARENA.keepOut.strokeRoom };
const inStroke = (x, z) => Math.abs(x) < stroke.x && Math.abs(z) < stroke.z;
const H = ARENA.hall;

ok('plan: the ring of boards stands on the island\'s edge, outside the stroke room, under the camera, module by module', () => {
  const b = planBoards();
  assert.equal(b.modules, 24);
  assert.ok(Math.abs(b.top - 0.94) < 1e-9 && b.top <= 1.05 && BOARD.postTop <= 1.05, 'nothing on the board line above 1.05 m');
  // the LED profile fills the layout's rail exactly (its back is the rail's height); round A4 (CONTRACT 16.4): a corner
  // profile, its table-side corner cut to a slope, a slit of light on the slope between two lips (a line-of-light
  // profile: a slit of 3 to 8 mm, the cover a millimetre or two under the lips)
  const PF = BOARD.profile, PS = profileSection();
  assert.ok(Math.abs(PF.height - ARENA.boards.rail.height) < 1e-9 && Math.abs(PF.width - ARENA.boards.rail.width) < 1e-9, 'the profile is the layout\'s rail');
  assert.ok(PF.slot >= 0.003 && PF.slot <= 0.008 && PF.slot <= PS.slope - 0.016 && PF.recess >= 0.001 && PF.recess <= 0.003 && PF.recess < PF.slot, `a slit of ${PF.slot} m between two lips, the cover ${PF.recess} m under them: a real profile's section`);
  assert.ok(PF.tilt >= 30 && PF.tilt <= 50 && PS.yBack === PF.height && PS.yFront >= 0.008 && PS.yFront < PS.yMid && PS.yMid < PS.yBack, `a chamfer: ${PS.yBack} m at the back, ${PS.yFront} m at the front, the slope ${PF.tilt} degrees toward the table`);
  assert.ok(PF.flat >= 0.02 && Math.abs(PS.zEdge - (-PF.width / 2 + PF.flat)) < 1e-9 && PS.zEdge < PS.zMid && PS.zMid < PF.width / 2 && Math.abs(PS.slope - Math.hypot(PF.width / 2 - PS.zEdge, PS.yBack - PS.yFront)) < 1e-4, `a level top of ${PF.flat} m at the back, the slope ${PS.slope} m long`);
  assert.ok(Math.abs(Math.hypot(...PS.normal) - 1) < 1e-12 && Math.abs(Math.hypot(...PS.across) - 1) < 1e-12 && Math.abs(PS.normal[1] * PS.across[1] + PS.normal[2] * PS.across[2]) < 1e-12 && PS.normal[2] > 0 && PS.across[1] < 0, 'the slope\'s normal leans toward the table, its across axis runs down the slope');
  assert.ok(!('dome' in BOARD) && !('channel' in BOARD) && !('cap' in BOARD), 'round A2\'s dome (or round A3\'s one cap for every board) is back');
  // the cap's nose and the wash under it, for both kinds of board: inside the feet's depth, the run inside the nose, in
  // front of the panel's face
  assert.deepEqual([...BOARDS.kinds], ['led', 'print']);
  assert.ok(BOARDS.kinds.includes(BOARDS.default), 'the default kind of board');
  for (const kind of BOARDS.kinds) {
    const wp = washPlace(ARENA, kind), cap = capOf(kind);
    assert.ok(cap.kind === kind && cap.nose > 0 && ARENA.boards.thickness / 2 + cap.nose < ARENA.boards.footDepth / 2, `${kind}: the cap's nose stays over the feet`);
    assert.ok(Math.abs(wp.h - (ARENA.boards.height - BOARD.frame)) < 1e-9 && wp.d > ARENA.boards.thickness / 2 - BOARD.proud + 0.01 && wp.d < ARENA.boards.thickness / 2 + cap.nose - 0.004, `${kind}: the wash lies in the underside of the nose (h ${wp.h}, d ${wp.d})`);
  }
  assert.equal(capOf('nonsense').kind, BOARDS.default, 'an unknown kind is the default');
  // a print needs the run a fifth of the face's height in front of it (a wash, not a grazing band); a display none
  assert.ok(capOf('print').standoff >= 0.15 && capOf('print').tilt === 0 && capOf('led').nose <= 0.08 && capOf('led').tilt >= 30 && capOf('led').tilt <= 60, 'the two caps');
  assert.ok(BOARD.proud >= 0.012 && BOARD.proud < ARENA.boards.thickness / 2 && BOARD.frame >= 0.03 && BOARD.joint >= 0.008 && BOARD.plinth < ARENA.boards.thickness, 'a frame with depth, a joint that shows, a recessed plinth');
  for (const bx of b.boxes) {
    assert.ok(bx.x0 >= H.x0 && bx.x1 <= H.x1 && bx.z0 >= H.z0 && bx.z1 <= H.z1, `${bx.what} outside the hall`);
    for (const [x, z] of [[bx.x0, bx.z0], [bx.x0, bx.z1], [bx.x1, bx.z0], [bx.x1, bx.z1]]) assert.ok(!inStroke(x, z), `${bx.what} in the stroke room`);
    assert.ok(underCamera(bx), `${bx.what}: top ${bx.h} m is not under the camera's lowest surface`);
    // on the island's edge: within half a foot's depth of it
    const onEdge = Math.min(Math.abs(bx.z0 - ARENA.island.z0), Math.abs(bx.z1 - ARENA.island.z1), Math.abs(bx.x1 - ARENA.island.x1), Math.abs(bx.x0 - ARENA.island.x0),
      Math.abs(bx.z1 - ARENA.island.z0), Math.abs(bx.z0 - ARENA.island.z1), Math.abs(bx.x0 - ARENA.island.x1), Math.abs(bx.x1 - ARENA.island.x0));
    assert.ok(onEdge <= ARENA.boards.footDepth / 2 + 1e-9, `${bx.what} is not on the island's edge`);
  }
  // the two walk-ins of the layout are open, the modules are 2.0 m with two equal end pieces, no module crosses a gap
  for (const sd of b.sides) for (const seg of sd.segments) {
    const full = seg.modules.filter((m) => m.kind === 'full'), ends = seg.modules.filter((m) => m.kind === 'end');
    for (const m of full) assert.ok(Math.abs(m.s1 - m.s0 - ARENA.boards.module) < 1e-6, `${sd.side}: a full module of ${m.s1 - m.s0} m`);
    assert.ok(ends.length === 2 && Math.abs((ends[0].s1 - ends[0].s0) - (ends[1].s1 - ends[1].s0)) < 1e-6, `${sd.side}: end pieces`);
    for (let i = 1; i < seg.modules.length; i++) assert.ok(Math.abs(seg.modules[i].s0 - seg.modules[i - 1].s1) < 1e-6, `${sd.side}: modules are not contiguous`);
    for (const m of seg.modules) for (const g of ARENA.boards.gaps.filter((x) => x.side === sd.side)) {
      const [xa] = toWorld(sd.frame, m.s0, 0), [xb] = toWorld(sd.frame, m.s1, 0);
      assert.ok(Math.max(xa, xb) <= g.from + 1e-9 || Math.min(xa, xb) >= g.to - 1e-9, `${sd.side}: a module stands in the walk-in`);
    }
  }
  assert.deepEqual(b.posts.map((p) => `${p.kind}:${p.id}`).sort(), ['corner:ne', 'corner:se', 'end:north@-4', 'end:south@-4', 'end:west@-4.3', 'end:west@4.3']);
  // words are sparse: 6 of 16 full modules, never two neighbours on one side
  const designs = b.sides.flatMap((sd) => sd.segments.flatMap((g) => g.modules.filter((m) => m.kind === 'full').map((m) => m.design)));
  assert.equal(designs.length, 16);
  assert.equal(designs.filter((d) => d !== 'marks').length, 6);
  for (const seq of Object.values(BOARD_SEQUENCE)) for (let i = 1; i < seq.length; i++) assert.ok(seq[i].startsWith('marks') || seq[i - 1].startsWith('marks'), 'two word panels side by side');
  for (const d of designs) assert.ok(PANELS[d], `no panel design '${d}'`);
});

ok('plan: the seating is behind the boards and behind its cut plane, inside the hall; seat counts per block', () => {
  const s = planSeating();
  assert.deepEqual(s.perBlock, { north: 144, south: 144, east: 96 });
  assert.equal(s.total, 384);
  // CONTRACT 15.4: the seat count is 384 and nothing claims more: no number of seats above it in any source of the surround
  for (const f of SOURCES) {
    for (const m of src(f).matchAll(/\b(\d{1,3}(?:,\d{3})+|\d{3,5})\s+(?:real\s+|empty\s+|folded\s+)?seats\b/gi)) assert.ok(Number(m[1].replace(/,/g, '')) <= 384, `${f}: "${m[0]}" claims more than 384 seats`);
    assert.ok(!/thousand seats/i.test(src(f)), `${f}: a claim of a thousand seats`);
  }
  assert.deepEqual(Object.fromEntries(s.blocks.map((b) => [b.id, b.perRow])), { north: 18, south: 18, east: 12 });
  assert.equal(s.rows.length, ARENA.seating.rows);
  const cut = ARENA.cut;
  for (const b of s.blocks) {
    const f = b.footprint;
    assert.deepEqual(f, blockFootprint(ARENA.seating.blocks.find((x) => x.id === b.id)));
    assert.ok(f.x0 >= H.x0 && f.x1 <= H.x1 && f.z0 >= H.z0 && f.z1 <= H.z1, `${b.id}: outside the hall`);
    assert.ok(H.height > s.rows[s.rows.length - 1].h + SEAT.cardH + ARENA.seating.guardRailH, `${b.id}: under the roof`);
    assert.equal(b.mark, SIDE[b.side], `${b.id}: the side mark`);
    // the whole block lies beyond its side's cut plane (the plane is in the walkway between the boards and the first row)
    if (b.side === 'north') assert.ok(f.z1 < cut.north && cut.north < ARENA.island.z0 - ARENA.boards.footDepth / 2);
    if (b.side === 'south') assert.ok(f.z0 > cut.south && cut.south > ARENA.island.z1 + ARENA.boards.footDepth / 2);
    if (b.side === 'east') assert.ok(f.x0 > cut.east && cut.east > ARENA.island.x1 + ARENA.boards.footDepth / 2);
    for (const [x, z] of [[f.x0, f.z0], [f.x1, f.z1]]) assert.ok(!inStroke(x, z));
    // seats fill their half: the row of seats is no longer than the half, and one more seat would not fit
    for (const h of b.halves) {
      const len = h.seats * s.pitch;
      assert.ok(len <= h.s1 - h.s0 - 2 * SEAT.endMargin + 1e-9 && len + s.pitch > h.s1 - h.s0 - 2 * SEAT.endMargin, `${b.id}: ${h.seats} seats in ${h.s1 - h.s0} m`);
      assert.ok(h.first - s.pitch / 2 >= h.s0 - 1e-9 && h.first + (h.seats - 0.5) * s.pitch <= h.s1 + 1e-9);
    }
    assert.ok(Math.abs(b.aisle.s1 - b.aisle.s0 - ARENA.seating.aisleWidth) < 1e-9);
  }
  // a row's card leans back and still clears the riser of the row behind it; so does a real back, and a hoop stands on the aisle's two steps
  assert.ok(SEAT.cardTilt > 0.15 && SEAT.cardAt + SEAT.cardH * Math.sin(SEAT.cardTilt) < ARENA.seating.tread - 0.03);
  assert.ok(SEAT.cardAt + SEAT.back.h * Math.sin(SEAT.lean + seatForm().vary.lean) + SEAT.back.shell + 0.02 < ARENA.seating.tread, 'a real back clears the riser behind it');
  assert.ok(SEAT.hoop.front < ARENA.seating.tread / 2 && SEAT.hoop.front + SEAT.hoop.depth > ARENA.seating.tread / 2 && SEAT.hoop.front + SEAT.hoop.depth < ARENA.seating.tread, 'a hoop\'s legs stand on the row\'s two aisle steps');
  assert.ok(2 * SEAT.hoop.inset + 2 * SEAT.hoop.tube < ARENA.seating.aisleWidth - 0.9, 'the aisle keeps 0.9 m between its hoops');
});

ok('plan: every seat of the hall has its own pose from a fixed seed: folded, empty, a few pans not fully up', () => {
  const seats = planSeats(), again = planSeats(), V = seatForm().vary;
  assert.equal(seats.length, 384);
  assert.deepEqual(seats, again, 'the same seats on every call');
  if (PINNED_SEATS) assert.equal(seatsChecksum(seats), PINNED_SEATS, 'the seats\' fixed seed moved: the rows differ from the pinned ones');
  else console.log(`   (seats checksum at revision ${SURROUND_GEOMETRY_REV}: '${seatsChecksum(seats)}' — not pinned yet)`);
  const s = planSeating();
  const perBlock = {};
  let open = 0;
  for (const seat of seats) {
    perBlock[seat.block] = (perBlock[seat.block] ?? 0) + 1;
    const b = s.blocks.find((x) => x.id === seat.block), half = b.halves[seat.half], row = b.rows[seat.row];
    assert.ok(seat.s - s.pitch / 2 >= half.s0 - 1e-9 && seat.s + s.pitch / 2 <= half.s1 + 1e-9, 'a seat outside its half');
    assert.ok(Math.abs(seat.d - (row.d - SEAT.cardAt)) < 1e-9 && seat.h === row.h, 'a seat off its row');
    // every pan is UP (an empty hall): a pan that has not come up all the way still stands steeper than 50 degrees
    assert.ok(seat.fold >= 0.9 && seat.fold <= SEAT.fold + V.fold / 2 + 1e-9, `a pan at ${seat.fold} rad`);
    if (seat.open) { open += 1; assert.ok(seat.fold >= V.openFold[0] && seat.fold <= V.openFold[1]); } else assert.ok(Math.abs(seat.fold - SEAT.fold) <= V.fold / 2 + 1e-9);
    assert.ok(Math.abs(seat.lean - SEAT.lean) <= V.lean / 2 + 1e-9 && Math.abs(seat.yaw) <= V.yaw / 2 + 1e-9 && Math.abs(seat.tone - 1) <= SEAT_COLOR.vary + 1e-9);
  }
  assert.deepEqual(perBlock, s.perBlock);
  assert.ok(open >= 4 && open <= 30, `${open} pans not fully up`);
  // not a stamped pattern: no two neighbours alike, no row like the next
  for (let i = 1; i < seats.length; i++) if (seats[i].block === seats[i - 1].block && seats[i].row === seats[i - 1].row) assert.ok(seats[i].fold !== seats[i - 1].fold || seats[i].lean !== seats[i - 1].lean, 'two neighbours alike');
  const rowKey = (blk, row) => seats.filter((x) => x.block === blk && x.row === row).map((x) => x.fold).join(',');
  for (let r = 1; r < 8; r++) assert.notEqual(rowKey('north', r), rowKey('north', r - 1));
  // the fabric's wear carries no row shade: every row's mean tone is 1 within the spread of a dozen seats
  for (let r = 0; r < 8; r++) { const t = seats.filter((x) => x.row === r).map((x) => x.tone); const mean = t.reduce((a, c) => a + c, 0) / t.length; assert.ok(Math.abs(mean - 1) < 0.02, `row ${r}: mean tone ${mean.toFixed(3)}`); }
});

ok('plan: no seat card is seen edge-on in any frame the app\'s camera can take (the leaning card against the orbit rig)', () => {
  // The app's camera sits on a sphere around its target and looks at it (ARENA.camera: radius, polar angle, the target's
  // rectangle). For each block and row: the smallest angle between the card's plane and a ray from a camera pose that (a) the
  // rig allows, (b) is in front of the block's cut plane (beyond it the block is not drawn), and (c) has the card's point in
  // its frame (within the half diagonal of the play lens, 40 degrees high at 16:9). Sampled: camera on a 0.5 m grid.
  const s = planSeating(), v = ARENA.keepOut.cameraVolume, cam = ARENA.camera;
  const HALF_DIAG = Math.atan(Math.tan((20 * Math.PI) / 180) * Math.hypot(1, 16 / 9)) + 0.02;
  const targets = [];
  for (const tx of [-cam.target.x, 0, cam.target.x]) for (const tz of [-cam.target.z, 0, cam.target.z]) targets.push([tx, tz]);
  const inFrame = (c, p) => {   // c, p: world [x, h above the floor, z]
    const dp = [p[0] - c[0], p[1] - c[1], p[2] - c[2]], lp = Math.hypot(...dp);
    for (const [tx, tz] of targets) {
      const dt = [tx - c[0], cam.bedH - c[1], tz - c[2]], r = Math.hypot(...dt);
      if (r < cam.radius[0] || r > cam.radius[1]) continue;
      const phi = Math.acos(Math.max(-1, Math.min(1, -dt[1] / r)));
      if (phi < cam.phi[0] || phi > cam.phi[1]) continue;
      if ((dp[0] * dt[0] + dp[1] * dt[1] + dp[2] * dt[2]) / (lp * r) >= Math.cos(HALF_DIAG)) return true;
    }
    return false;
  };
  let worst = 90, at = null, poses = 0;
  for (const b of s.blocks) {
    const [ax, az] = toWorld(b.frame, 0, 0), [bx, bz] = toWorld(b.frame, 0, 1);
    const nW = [(bx - ax) * Math.cos(SEAT.cardTilt), Math.sin(SEAT.cardTilt), (bz - az) * Math.cos(SEAT.cardTilt)];   // the card's normal, world
    const planeD = b.side === 'north' ? ARENA.island.z0 - ARENA.cut.north : b.side === 'south' ? ARENA.cut.south - ARENA.island.z1 : ARENA.cut.east - ARENA.island.x1;
    for (const r of b.rows) for (const sC of [b.halves[0].s0 + 0.3, b.halves[0].s1 - 0.3, b.halves[1].s1 - 0.3]) {
      const [px, pz] = toWorld(b.frame, sC, r.d - SEAT.cardAt - 0.45 * Math.sin(SEAT.cardTilt));
      const p = [px, r.h + 0.45 * Math.cos(SEAT.cardTilt), pz];
      for (let cs = -9; cs <= 9; cs += 0.5) for (let cd = 0.05; cd <= 13; cd += 0.5) {
        const [wx, wz] = toWorld(b.frame, cs, -planeD + cd);   // cd: in front of the cut plane, toward the table
        const low = cameraFloor(wx, wz);
        if (!Number.isFinite(low)) continue;
        for (let ch = low; ch <= v.h1; ch += 0.5) {
          const c = [wx, ch, wz];
          if (!inFrame(c, p)) continue;
          poses += 1;
          const ray = [c[0] - p[0], c[1] - p[1], c[2] - p[2]], len = Math.hypot(...ray);
          const ang = (Math.asin(Math.max(-1, Math.min(1, (ray[0] * nW[0] + ray[1] * nW[1] + ray[2] * nW[2]) / len))) * 180) / Math.PI;
          if (ang < worst) { worst = ang; at = { block: b.id, row: r.row, cam: c.map((q) => +q.toFixed(2)) }; }
        }
      }
    }
  }
  assert.ok(poses > 10000, `${poses} poses sampled`);
  // (the flattest case is a camera beyond the END of a row, looking along it: there the row's end is real geometry, a
  // standard and an armrest, and the cards behind it are seen at this angle: flat, not edge-on)
  assert.ok(worst > 5, `a card is seen at ${worst.toFixed(1)} degrees from ${JSON.stringify(at)}`);
  console.log(`   (the flattest view of any card in any frame of the orbit rig: ${worst.toFixed(1)} degrees, ${JSON.stringify(at)}, ${poses} poses)`);
  // from the fixed review poses every card is seen at more than 12 degrees
  let flat = 90;
  for (const view of VIEWS) for (const b of s.blocks) for (const r of b.rows) {
    const [ax, az] = toWorld(b.frame, 0, 0), [bx, bz] = toWorld(b.frame, 0, 1);
    const nW = [(bx - ax) * Math.cos(SEAT.cardTilt), Math.sin(SEAT.cardTilt), (bz - az) * Math.cos(SEAT.cardTilt)];
    for (const sC of [b.halves[0].s0 + 0.3, b.halves[1].s1 - 0.3]) {
      const [x, z] = toWorld(b.frame, sC, r.d - SEAT.cardAt);
      const ray = [view.cam[0] - x, view.cam[1] + ARENA.camera.bedH - (r.h + 0.4), view.cam[2] - z], len = Math.hypot(...ray);
      flat = Math.min(flat, (Math.asin((ray[0] * nW[0] + ray[1] * nW[1] + ray[2] * nW[2]) / len) * 180) / Math.PI);
    }
  }
  assert.ok(flat > 12, `a review pose sees a card at ${flat.toFixed(1)} degrees`);
  console.log(`   (the flattest view of any card from the twelve review poses: ${flat.toFixed(1)} degrees)`);
});

ok('plan: the scoreboard hangs on the backdrop, behind the west cut plane; the emitters are within the share of 6', () => {
  const sb = planScoreboard(), bd = ARENA.backdrop;
  assert.ok(sb.z - sb.width / 2 - sb.bezel >= bd.z0 && sb.z + sb.width / 2 + sb.bezel <= bd.z1 && sb.h + sb.height / 2 + sb.bezel < bd.height && sb.h - sb.height / 2 - sb.bezel > 2.2);
  assert.ok(sb.faceX > bd.x && sb.faceX < ARENA.cut.west && sb.faceX - bd.x < 0.2, 'on the wall, beyond the west plane');
  assert.equal(sb.mark, SIDE.west);
  assert.ok(sb.width === bd.scoreboard.width && sb.height === bd.scoreboard.height && sb.h === bd.scoreboard.centerH);
  assert.ok(Math.abs(sb.width / sb.height - LED.w / LED.h) < 1e-9, 'square LED cells');
  assert.equal(ARENA.emitters.surround, 6, 'the surround\'s share (CONTRACT 14.2)');
  for (const detail of [0, 1, 2]) {
    const em = planEmitters(ARENA, detail);
    assert.ok(em.length <= ARENA.emitters.surround, `detail ${detail}: ${em.length} emitters`);
    assert.equal(new Set(em.map((e) => e.id)).size, em.length);
    for (const e of em) {
      assert.ok(e.id.startsWith('arena.') && e.type === 'tube' && e.intensity > 0 && e.radius > 0 && e.p.every(Number.isFinite), e.id);
      assert.ok(e.p[0] >= H.x0 && e.p[0] <= H.x1 && e.p[2] >= H.z0 && e.p[2] <= H.z1 && e.p[1] > 0 && e.p[1] < H.height, `${e.id} outside the hall`);
      assert.ok(Math.abs(Math.hypot(...e.axis) - 1) < 1e-3, `${e.id}: axis`);
    }
  }
  assert.deepEqual(planEmitters(ARENA, 0).map((e) => e.id), ['arena.boardwash.north', 'arena.boardwash.south', 'arena.boardwash.east', 'arena.boardwash.west']);
  assert.deepEqual(planEmitters(ARENA, 1).map((e) => e.id), ['arena.boardwash.north', 'arena.boardwash.south', 'arena.boardwash.east', 'arena.boardwash.west', 'arena.scoreboard']);
  assert.deepEqual(planEmitters(ARENA, 2), planEmitters(ARENA, 1), 'base and high share one emitter table');
  // THE LIT RAIL HAS NO EMITTER (it faces up and inward out of its recess: nothing below its lips takes its light), and
  // no emitter hangs in the air in front of the boards (rounds A1 and A2: 0.26 m in front of the faces at rail height).
  // Each side's emitter is the BOARD WASH: under the cap's nose (below the profile, inside the cap's footprint, in front
  // of the panel's face), as long as the side's boards, ONE-SIDED, at the kind's level. Round A4: under LED panels it is
  // turned 45 degrees toward the playing floor (it lights the carpet, not the screen); under a print it looks straight down
  assert.ok(planEmitters(ARENA, 1).every((e) => !/rail/.test(e.id)), 'the rail has an emitter again');
  assert.deepEqual(planEmitters(ARENA, 1), planEmitters(ARENA, 1, PALETTE, BOARDS.default), 'the default kind is the default');
  for (const kind of BOARDS.kinds) {
    const wpl = washPlace(ARENA, kind), cap = capOf(kind), tilt = (cap.tilt * Math.PI) / 180;
    for (const e of planEmitters(ARENA, 1, PALETTE, kind).filter((x) => /boardwash/.test(x.id))) {
      assert.ok(Math.abs(e.p[1] - wpl.h) < 1e-6 && e.p[1] < ARENA.boards.height && e.size[0] > 8 && e.size[0] < 10, `${kind} ${e.id}: height ${e.p[1]}, length ${e.size[0]}`);
      const off = Math.min(Math.abs(Math.abs(e.p[0]) - ARENA.island.x1), Math.abs(Math.abs(e.p[2]) - ARENA.island.z1));
      assert.ok(Math.abs(off - wpl.d) < 1e-6 && off < ARENA.boards.thickness / 2 + cap.nose, `${kind} ${e.id}: ${off} m off the board line: under the cap's nose`);
      assert.ok(Math.abs(e.p[0]) < ARENA.island.x1 + 1e-9 && Math.abs(e.p[2]) < ARENA.island.z1 + 1e-9 && !inStroke(e.p[0], e.p[2]), `${kind} ${e.id}: inside the ring, outside the stroke room`);
      // one-sided: a unit normal that points down, and (LED) toward the TABLE: its horizontal part runs from the board line inward
      assert.ok(Math.abs(Math.hypot(...e.normal) - 1) < 1e-3 && Math.abs(e.normal[1] + Math.cos(tilt)) < 1e-3, `${kind} ${e.id}: normal ${e.normal}`);
      const inward = Math.abs(e.axis[0]) > 0.5 ? -e.normal[2] * Math.sign(e.p[2]) : -e.normal[0] * Math.sign(e.p[0]);
      assert.ok(Math.abs(inward - Math.sin(tilt)) < 1e-3, `${kind} ${e.id}: the run is turned ${inward.toFixed(3)} toward the table (sin tilt ${Math.sin(tilt).toFixed(3)})`);
      assert.ok(Math.abs(e.intensity / e.size[0] - cap.perMetre * LEVEL.wash) < 1e-3, `${kind} ${e.id}: ${e.intensity} over ${e.size[0]} m`);
    }
  }
  // the levels (levels.js BOARDS has the arithmetic): the LED panels' floor wash is two rows of tape; a print's wash five
  assert.ok(LEVEL.wash === 1.0 && LEVEL.score === 1.0 && BOARDS.led.perMetre >= 0.3 && BOARDS.led.perMetre <= 0.7 && BOARDS.print.perMetre >= 0.9 && BOARDS.print.perMetre <= 1.5 && planEmitters(ARENA, 1)[4].intensity === (SCORE_SLIDE.on ? SCORE_SLIDE.glow : 2.2) && SCORE_SLIDE.glow >= 0.7 && SCORE_SLIDE.glow <= 1.3, 'the washes\' levels');
  // (the LED wash by the room light's tube law, 0.3 m in front of the board line: a pool of 0.5 to 1.0 units on the carpet)
  {
    const e = planEmitters(ARENA, 1, PALETTE, 'led')[0], wpl = washPlace(ARENA, 'led'), tilt = (capOf('led').tilt * Math.PI) / 180;
    const at = (x) => { const dIn = x - wpl.d, d = Math.hypot(wpl.h, dIn), emit = (Math.cos(tilt) * wpl.h + Math.sin(tilt) * dIn) / d; return (e.intensity * emit * (wpl.h / d)) / (d * d + (e.size[0] / 2) * d); };
    assert.ok(at(0.3) > 0.5 && at(0.3) < 1.0 && at(2) < 0.2 && at(0.3) > 4 * at(2), `the LED boards' pool: ${at(0.3).toFixed(2)} units at 0.3 m, ${at(2).toFixed(2)} at 2 m`);
  }
  // the scoreboard's spill: an omni tube in front of the LED face, as wide as the face, on the hall's side of the cabinet
  const glow = planEmitters(ARENA, 1).find((e) => e.id === 'arena.scoreboard');
  assert.ok(glow.p[0] > sb.faceX + 0.1 && glow.p[0] < sb.faceX + 0.5 && glow.p[1] === sb.h && glow.size[0] === sb.width && glow.axis[2] === 1);
  // the signature moves with the geometry revision, the detail level and an emitter's place, and not with a level
  const sig = (d) => planSignature(planSurround(ARENA, d));
  assert.ok(/^surround-[0-9a-f]{8}$/.test(sig(1)) && sig(0) !== sig(1) && sig(1) !== sig(2) && sig(1) === sig(1));
  const moved = planSurround(ARENA, 1); moved.emitters = moved.emitters.map((e, i) => (i === 0 ? { ...e, p: [e.p[0], e.p[1] + 0.01, e.p[2]] } : e));
  assert.notEqual(planSignature(moved), sig(1), 'an emitter moved and the signature did not');
  const turned = planSurround(ARENA, 1); turned.emitters = turned.emitters.map((e, i) => (i === 0 ? { ...e, normal: [0, -0.9, 0.44] } : e));
  assert.notEqual(planSignature(turned), sig(1), 'an emitter turned and the signature did not');
  const brighter = planSurround(ARENA, 1); brighter.emitters = brighter.emitters.map((e) => ({ ...e, intensity: e.intensity * 2 }));
  assert.equal(planSignature(brighter), sig(1), 'a level is not geometry');
  // the other kind of board is another geometry (its cap's nose, its wash's place and aim): another signature
  assert.notEqual(planSignature(planSurround(ARENA, 1, PALETTE, 'print')), planSignature(planSurround(ARENA, 1, PALETTE, 'led')), 'print and LED boards share a signature');
  assert.equal(planSurround(ARENA, 1).kind, BOARDS.default);
});

// ---------------------------------------------------------------------------------------------------------------------------
// 3. the levels
// ---------------------------------------------------------------------------------------------------------------------------
const railTop = ARENA.boards.height + ARENA.boards.rail.height;
/** The sine of the eye's elevation over a point of a side's rail from a review pose (world x, z of the rail's point). */
const sinOver = (viewId, x, z) => { const v = VIEWS.find((q) => q.id === viewId); const dy = v.cam[1] + ARENA.camera.bedH - railTop; return dy / Math.hypot(v.cam[0] - x, dy, v.cam[2] - z); };

// the frame's units (the app's tone curve, post/tune.js at exposure 0.92): the played bed's MEAN stands at about 0.24
// (level 144), its brightest pixels at about 1.4 (233 to 235); the post chain's bloom threshold is 1.35
const BED_MEAN = 0.24, BED_PEAK = 1.4;
// the slot's middle line above the floor (the slope's middle: plan.js profileSection)
const slotH = ARENA.boards.height + profileSection().yMid;
/** What a review pose sees of a side's rail at the world point (x, z) of its line (levels.js railSeen), with the pixels
 * per metre there (`px`) and the line's energy spread over the rail's own height (`band`: the mean radiance of the
 * 40 mm of rail in the frame: what a lens blur leaves of it). `inFrame`: inside the pose's horizontal field. */
const seenFrom = (viewId, side, x, z) => {
  const v = VIEWS.find((q) => q.id === viewId), dy = v.cam[1] + ARENA.camera.bedH - slotH, PF = BOARD.profile;
  const perp = side === 'north' || side === 'south' ? Math.abs(z - v.cam[2]) : Math.abs(x - v.cam[0]);
  const d = [x - v.cam[0], -dy, z - v.cam[2]], range = Math.hypot(...d), fwd = [v.target[0] - v.cam[0], v.target[1] - v.cam[1], v.target[2] - v.cam[2]];
  const along = (d[0] * fwd[0] + d[1] * fwd[1] + d[2] * fwd[2]) / Math.hypot(...fwd);
  const px = 360 / Math.tan((v.fov * Math.PI) / 360) / along;
  // (the opal's luminance in a frame is its level x the luminance of its colour, the palette's cool white: 0.914; the
  // dev page's sweep measured exactly that factor under the law's prediction)
  const s = railSeen({ dy, perp, range, px, slot: PF.slot, recess: PF.recess, tilt: PF.tilt, level: RAIL.face.level * luminance(PALETTE.rail) });
  const inFrame = along > 0 && along / range > Math.cos(Math.atan(Math.tan((v.fov * Math.PI) / 360) * 16 / 9));
  return { ...s, px, band: s.levelPx / (PF.height * px), inFrame };
};

ok('rail (CONTRACT 15.3, 16.4): what a camera sees follows from the profile\'s section and the opal\'s emission law: no step, no switch; a low eye sees part of the opal, the bed leads in every review pose', () => {
  const I = ARENA.island, PF = BOARD.profile;
  // THE LAW OF THE SURFACE: luminance = level x cos ^ power; the numbers of the round's report
  assert.ok(RAIL.face.power >= 0.25 && RAIL.face.power <= 0.6, 'an opal sheet: between a Lambertian face (0) and a beam of 100 degrees (0.6)');
  const at = (deg) => opalLaw(Math.cos((deg * Math.PI) / 180));
  assert.ok(at(0) === 1 && Math.abs(at(60) - 0.7071) < 1e-3 && Math.abs(at(80) - 0.4167) < 1e-3 && Math.abs(at(85) - 0.2952) < 1e-3, `the law at 0, 60, 80, 85 degrees: ${[0, 60, 80, 85].map((d) => at(d).toFixed(3))}`);
  for (let d = 1; d <= 90; d++) assert.ok(at(d) < at(d - 1) && at(d) >= 0, 'the law falls toward grazing without a step');
  assert.equal(opalLaw(-0.2), 0, 'nothing leaves the face backwards');
  // the level (CONTRACT 16.4): half of round A3's emission
  assert.equal(RAIL.face.level, LEVELS.ROUND_A3.rail.level / 2, 'the rail\'s level is half of round A3\'s');
  // THE SECTION: below atan(recess / slot) the lip hides the opal; above it the visible share grows CONTINUOUSLY to 1
  const t0 = PF.recess / PF.slot;
  assert.ok(slotView(t0 * 0.999, PF.slot, PF.recess).opal === 0 && slotView(0, PF.slot, PF.recess).opal === 0 && slotView(-1, PF.slot, PF.recess).opal === 0);
  let prev = 0, maxStep = 0;
  for (let i = 0; i <= 4000; i++) {
    const tan = i * 0.0005, v = slotView(tan, PF.slot, PF.recess);
    assert.ok(v.opal >= prev - 1e-12 && v.opal >= 0 && v.opal <= 1 && Math.abs(v.opal + v.wall - 1) < 1e-12, `the opal's share at tan ${tan}`);
    maxStep = Math.max(maxStep, v.opal - prev); prev = v.opal;
  }
  // (0.0005 of tangent is 0.03 degrees of elevation: the steepest rise of the share is 0.13 % there: a slope, not a switch.
  // Round A2's cut-off went from nothing to everything inside 0.8 degrees)
  assert.ok(maxStep < 0.008 && prev > 0.75, `the steepest step of the opal's share over 0.03 degrees is ${maxStep.toFixed(4)}`);
  assert.ok(Math.abs(slotView(Math.tan((30 * Math.PI) / 180), PF.slot, PF.recess).opal - (1 - t0 / Math.tan((30 * Math.PI) / 180))) < 1e-12);
  // the far lip's wall: black anodised aluminium lit by the opal beside it: a per cent or two of the face, less than under a Lambertian face
  const ws = wallShare(PF.slot, PF.recess);
  assert.ok(ws > 0.008 && ws < 0.025 && ws < wallShare(PF.slot, PF.recess, RAIL.wallAlbedo, 0) && RAIL.wallAlbedo <= 0.08, `the wall's share ${ws.toFixed(4)}`);
  // THE RE-CUT (CONTRACT 16.4): the slope's tilt is more than the lips' cut-off angle, so NO eye inside the ring (not even
  // one level with the rail's top) is below the angle at which the opal starts to show; an eye behind the boards (the
  // tilt against it) sees none of it up to tilt + cut-off degrees of elevation (the stands' top row stands at 30)
  const hidden = (Math.atan(t0) * 180) / Math.PI;
  assert.ok(PF.tilt > hidden && railSeen({ dy: 0, perp: 5, px: 150, slot: PF.slot, recess: PF.recess, tilt: PF.tilt }).opal > 0.1, `the tilt ${PF.tilt} against the cut-off ${hidden.toFixed(1)} degrees`);
  assert.equal(railSeen({ dy: 1.2, perp: 3, px: 150, slot: PF.slot, recess: PF.recess, tilt: -PF.tilt }).opal, 0, 'the first rows see the opal over the boards');
  // THE PLAY POSES, by arithmetic (CONTRACT 16.2: the rail seen from the play views at a mean of 50 to 90 over its visible
  // height, under the bed's mean; 16.4: a low eye sees PART of the opal). Behind the bed (the east rail from V2, V3, V7):
  // six to seven tenths of the opal in a slit a third to a half of a pixel high: a line whose brightest pixel stays
  // under the bed's peak, and over the rail's own 40 mm a mean radiance of 0.08 to 0.2 (under the bed's mean, 0.24,
  // before a lens spreads it further)
  const table = [];
  for (const [view, z] of [['V2', 0], ['V2', 2], ['V3', 0], ['V3', 2.5], ['V3', -4.3], ['V7', -1.1], ['V7', -3.2]]) {
    const s = seenFrom(view, 'east', I.x1, z);
    table.push(`${view} east z ${z}: opal ${s.opal.toFixed(2)}, line ${s.line.toFixed(2)}, peak ${s.peak.toFixed(2)}, band ${s.band.toFixed(3)}`);
    assert.ok(s.opal > 0.5 && s.opal < 0.8 && s.heightPx < 1, `${view}: the east rail at z ${z} shows ${s.opal.toFixed(2)} of its opal in ${s.heightPx.toFixed(2)} px`);
    // (round A5: `line` is the mean over the rows the raster's filter spreads a thin line on: four at radius 2)
    assert.ok(s.line > 0.15 && s.line < 0.85 && s.peak < 1.25 && s.peak < BED_PEAK && s.band > 0.08 && s.band < 0.2 && s.band < BED_MEAN,`${view}: the east rail at z ${z}: a line at ${s.line.toFixed(3)} (peak ${s.peak.toFixed(3)}), a mean of ${s.band.toFixed(3)} over the rail's height against a bed of ${BED_MEAN}`);
  }
  // the close poses' heights and lenses: V4 and V5 stand a hand's width over the rail with long lenses (they look DOWN
  // at the bed: no rail is in their frames; a pose of that height and lens aimed at the boards would put the slit over
  // a pixel high and resolve the opal), V6 stands UNDER the rail's top and still sees half of the tilted face (round
  // A3: nothing)
  for (const view of ['V4', 'V5']) { const s = seenFrom(view, 'south', 0.5, I.z1); assert.ok(s.opal > 0.5 && s.opal < 0.8, `${view}: opal ${s.opal}, line ${s.line}`); }
  { const s = seenFrom('V6', 'south', 0.5, I.z1); assert.ok(s.opal > 0.4 && s.opal < 0.7, `V6: opal ${s.opal}, line ${s.line}`); }
  // THE WIDE POSES see more of the opal the higher they stand
  const order = [['V10', 'east', I.x1, 0], ['V10', 'north', 0.8, I.z0], ['V1', 'north', 2, I.z0], ['V9', 'north', 0.8, I.z0], ['TV', 'east', I.x1, 0]].map(([v, sd, x, z]) => ({ v, sd, ...seenFrom(v, sd, x, z) }));
  for (const s of order) assert.ok(s.opal > 0.3 && s.luminance > 1.5, `${s.v} ${s.sd}: opal ${s.opal.toFixed(2)}, luminance ${s.luminance.toFixed(2)}`);
  assert.ok(order[0].opal < order[1].opal && order[1].opal < order[2].opal && order[2].opal < order[3].opal && order[3].opal < order[4].opal + 0.2, 'the opal\'s share does not grow with the eye\'s elevation');
  // CONTRACT 16.2 / the round's targets: at V10, V1 and BACK (and V9) the rail's PEAK is under the bed's peak: the
  // brightest PIXEL of every point of every rail inside those frames (railSeen's `peak`: the pixel that holds the whole
  // opal band, not the mean of the drawn line: the round's first app frame taught the difference) is under the bed's
  // brightest pixels, and under the bloom threshold (1.35): from these poses the rail carries no bloom of its own
  let peak = 0, peakAt = '';
  for (const view of ['V10', 'V1', 'BACK', 'V9']) for (const [side, pts] of [['north', (t) => [-4 + 9.6 * t, I.z0]], ['south', (t) => [-4 + 9.6 * t, I.z1]], ['east', (t) => [I.x1, I.z0 + 8.6 * t]], ['west', (t) => [I.x0, I.z0 + 8.6 * t]]]) {
    for (let k = 0; k <= 24; k++) {
      const [x, z] = pts(k / 24), s = seenFrom(view, side, x, z);
      if (!s.inFrame) continue;
      if (s.peak > peak) { peak = s.peak; peakAt = `${view} ${side} (${x.toFixed(1)}, ${z.toFixed(1)})`; }
      assert.ok(s.peak >= s.line - 1e-9 && s.peak <= s.levelPx + 1e-9 + (s.heightPx >= 1 ? s.luminance : 0), `${view}: the peak ${s.peak} against the line ${s.line} and its energy ${s.levelPx}`);
      assert.ok(s.peak < 1.2 && s.peak < BED_PEAK && s.peak < 1.35, `${view}: the ${side} rail at (${x.toFixed(1)}, ${z.toFixed(1)}) has a pixel at ${s.peak.toFixed(2)}: over the bed's peak`);
    }
  }
  // (round A5: through a filter of 2 px a thin line's brightest pixel holds a quarter to a third of its light: 0.45 to
  // 0.8 where the point-sampled quad of round A4 held 0.7 to 1.13; the energy on screen is the same)
  assert.ok(peak > 0.45, `the rail's brightest point in the wide poses is ${peak.toFixed(2)}: a dim line`);
  console.log(`   (the rail in the play poses: ${table.join('; ')}; its brightest point in V10, V1, BACK, V9: ${peak.toFixed(2)} at ${peakAt}, against the bed's peak ${BED_PEAK})`);
  // nothing of round A2's view rule or capture level is left to configure
  for (const k of ['core', 'body', 'capture', 'coreNoBloom', 'tube', 'under', 'cap', 'edge']) assert.ok(!(k in RAIL), `RAIL.${k} is back`);
  // (a WHOLE number of pixels: a tent of integer radius sums to one over the pixel grid wherever the line lies)
  assert.ok([1, 2].includes(RAIL.filterPx) && !('minPx' in RAIL) &&RAIL.wash.radius > 3 && RAIL.wash.sourceRadius > 0 && !('perMetre' in RAIL.wash));
  // the rail's own up-light, had it an emitter: under what a frame shows (why it has none)
  const perM = RAIL.face.level * PF.slot, up = (dx, dy2) => ((2 * perM) / Math.hypot(dx, dy2)) * (dy2 / Math.hypot(dx, dy2));
  assert.ok(up(1.165, 0.51) < 0.2 && up(1.8, 0.26) < 0.05, 'the rail would light the guard rail or a pad with more than a trace');
});

ok('albedo law (CONTRACT 15.2): every surface of the surround carries its class\'s albedo: the swatches\' means pinned, the pictures scaled to their mean, no painted shade', () => {
  // the table is the layout's, and the layout's is the contract's
  // (round A5, CONTRACT 17.3: the seat fabric's albedo is the chosen colour's, levels.js SEATS; the layout's row is the
  // light role's and follows it: until it does it still holds round A4's graphite)
  assert.deepEqual({ ...ALBEDO }, { seatFabric: SEATS[SEATS.default].albedo, plate: 0.35, shell: 0.04, deck: 0.10, nosing: 0.45, board: 0.05 }, 'the surround\'s albedos (CONTRACT 15.2, 17.3)');
  if (LAYOUT.ALBEDO) {
    assert.deepEqual([LAYOUT.ALBEDO.seatShell, LAYOUT.ALBEDO.deck, LAYOUT.ALBEDO.nosing, LAYOUT.ALBEDO.board], [ALBEDO.shell, ALBEDO.deck, ALBEDO.nosing, ALBEDO.board], 'the layout\'s table');
    assert.ok([ALBEDO.seatFabric, SEATS.graphite.albedo].includes(LAYOUT.ALBEDO.seatFabric), `the layout's seat fabric ${LAYOUT.ALBEDO.seatFabric} is neither the chosen colour's nor round A4's`);
  }
  // the method: a hue brought to a luminance lands on it (8-bit steps: within 4 % in the darks)
  for (const [hue, y] of [['#0c1a33', 0.05], ['#525559', 0.09], ['#8d887b', 0.45], ['#000000', 0.04], ['#38383a', 0.04]]) assert.ok(Math.abs(luminance(withLuminance(hue, y)) / y - 1) < 0.04, `${hue} at ${y}: ${luminance(withLuminance(hue, y)).toFixed(4)}`);
  // THE PINNED MEANS of the flat swatches, as painted (paint.js flatSwatches): which class each one is
  const CLASS = {
    deck: ['deck', 'tread', 'fascia'], nosing: ['nosing'], seatFabric: ['seat'], board: ['panelBack'], plate: ['plate'],
    shell: ['steel', 'rubber', 'housing', 'seatFrame', 'arm', 'plinth', 'hoop', 'kick', 'bezel'],
  };
  const flat = flatSwatches(PALETTE, false), flatLite = flatSwatches(PALETTE, true);
  const classed = new Set();
  for (const [cls, names] of Object.entries(CLASS)) for (const name of names) {
    classed.add(name);
    for (const f of [flat, flatLite]) assert.ok(Math.abs(luminance(f[name]) / ALBEDO[cls] - 1) < 0.04, `swatch ${name}: ${luminance(f[name]).toFixed(4)} against ${cls} ${ALBEDO[cls]}`);
  }
  // the rest are metal (a reflectance, no diffuse albedo) or a source's colour: nothing else is in the atlas
  const METAL = ['alu', 'post', 'aluDark', 'channel'], SOURCE = ['stepLight', 'rail'];
  for (const name of Object.keys(ATLAS.swatches)) assert.ok(classed.has(name) || METAL.includes(name) || SOURCE.includes(name), `swatch ${name} has no material class`);
  for (const name of Object.keys(SWATCH)) assert.ok(name in ATLAS.swatches, `SWATCH.${name} is not in the atlas`);
  assert.ok(luminance(flat.alu) > 0.5 && luminance(flat.channel) < 0.07, 'aluminium: its swatch is a reflectance, the LED profile and the cap are black anodised');
  // round A7 (CONTRACT 19.1), the stiles' cast: the frames' aluminium is a metal and nothing else: none of the table's
  // reflection cube (its lower half is the blue bed, which a stile at the island's edge cannot mirror) and no diffuse
  // share; the hall's picture in a brushed face is the hall's own baked cube (the env service's tag). Round A4's
  // stand-in (0.04 of the table's cube, a diffuse share of 0.07 to 0.12 of the swatch) is deleted, with its numbers.
  assert.ok(SURFACE.metal.env === 0 && SURFACE.metal.metalness === 1 && SURFACE.metal.roughness >= 0.35 && SURFACE.metal.roughness <= 0.5 && !('roughness' in LEVELS.METAL_HALL) && !('metalness' in LEVELS.METAL_HALL), `the frames: env ${SURFACE.metal.env}, metalness ${SURFACE.metal.metalness}, roughness ${SURFACE.metal.roughness}`);
  // (the lite room folds the aluminium into its matt batch: there the swatches are what a satin member reads as)
  for (const [name, y] of Object.entries(SWATCH_LITE)) assert.ok(Math.abs(luminance(flatLite[name]) / y - 1) < 0.04 && y <= 0.15, `lite swatch ${name}`);
  // THE PAINTED PICTURES (the panels, the seat card): scaled so that their mean lands on the value. The method on a picture
  // of known content: a dark ground with a pale mark, and a card of two classes side by side
  const pic = new Uint8ClampedArray(64 * 64 * 4);
  for (let i = 0; i < 64 * 64; i++) { const mark = i % 64 < 6; pic.set(mark ? [150, 152, 160, 255] : [22, 30, 52, 255], 4 * i); }
  const before = pic.slice(), res = scaleToMean(pic, ALBEDO.board);
  assert.ok(Math.abs(res.after / ALBEDO.board - 1) < 0.02 && res.count === 4096 && res.before !== res.after, `a panel's mean after the law: ${res.after.toFixed(5)}`);
  assert.ok(pic[0] > pic[4 * 10] && Math.abs(pic[0] / pic[4 * 10] - before[0] / before[4 * 10]) / (before[0] / before[4 * 10]) < 0.35, 'the picture\'s contrast stays (it is the detail)');
  const card = new Uint8ClampedArray(32 * 32 * 4);
  for (let i = 0; i < 32 * 32; i++) card.set(i % 32 < 8 ? [0, 0, 0, 0] : i % 32 < 20 ? [90, 92, 96, 255] : [40, 40, 42, 255], 4 * i);
  const fab = scaleToMean(card, ALBEDO.seatFabric, (i) => card[4 * i + 3] >= 128 && i % 32 < 20), sh = scaleToMean(card, ALBEDO.shell, (i) => card[4 * i + 3] >= 128 && i % 32 >= 20);
  assert.ok(Math.abs(fab.after / ALBEDO.seatFabric - 1) < 0.02 && Math.abs(sh.after / ALBEDO.shell - 1) < 0.03 && card[3] === 0 && card[0] === 0, `a card's two classes: ${fab.after.toFixed(4)}, ${sh.after.toFixed(4)}; the clear ground untouched`);
  // paint.js applies it to every panel and to the card (and reports what it did: state().albedoLaw)
  const paint = src('surround/paint.js');
  assert.ok(/scaleToMean\(img\.data, fabricAlbedo \+ veilY/.test(paint) && /const fabricAlbedo = Number\.isFinite\(color\.albedo\) \? color\.albedo : ALBEDO\.seatFabric;/.test(paint) && /scaleToMean\(img\.data, ALBEDO\.shell/.test(paint), 'the painter no longer scales the seat card to the law');
  // THE BOARDS' INKS, round A4 (CONTRACT 16.3: "a printed face may use an albedo up to 0.20 for its light parts, with the
  // navy ground kept dark"): the print is painted AT its albedos and a panel's mean is measured, not scaled to
  assert.ok(/law\[name\] = lawOnCanvas\(ctx, px, py, pw, ph, null\)/.test(paint) && !/lawOnCanvas\(ctx, px, py, pw, ph, ALBEDO\.board\)/.test(paint), 'a panel is scaled to a mean again');
  const lumOfBytes = (c) => { const l = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4)); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
  const TP = tones(PALETTE, 'print'), TL = tones(PALETTE, 'led');
  assert.ok(PRINT.ground >= 0.035 && PRINT.ground <= 0.06 && PRINT.light <= 0.20 && PRINT.amber <= 0.20 && PRINT.hi < 0.1 && PRINT.hi > PRINT.ground, 'the print: a dark navy ground, light parts up to 0.20');
  for (const [tone, y] of [['board', PRINT.ground], ['boardHi', PRINT.hi], ['rail', PRINT.light], ['wash', PRINT.amber]]) assert.ok(Math.abs(lumOfBytes(TP[tone]) / y - 1) < 0.05, `print tone ${tone}: ${lumOfBytes(TP[tone]).toFixed(4)} against ${y}`);
  assert.ok(TP.board[2] > TP.board[0] * 1.15 && TL.board[2] > TL.board[0] * 1.15, 'the ground is navy: blue leads');
  // THE LED PANELS show the same picture as light: a navy ground and white marks at a modest, even luminance: the ground
  // near 0.05, the white near 0.25 (40 levels and more over the ground), nothing near the bloom threshold even on a single
  // lit LED seen from close (1 / fill^2 of the cell's mean)
  for (const [tone, y] of [['board', BOARD_LED.ground], ['boardHi', BOARD_LED.hi], ['rail', BOARD_LED.white], ['wash', BOARD_LED.amber]]) assert.ok(Math.abs(lumOfBytes(TL[tone]) / y - 1) < 0.05, `LED tone ${tone}: ${lumOfBytes(TL[tone]).toFixed(4)} against ${y}`);
  const ledGround = BOARD_LED.ground * BOARD_LED.gain, ledWhite = BOARD_LED.white * BOARD_LED.gain;
  assert.ok(ledGround >= 0.04 && ledGround <= 0.075 && ledWhite >= 0.18 && ledWhite <= 0.32 && ledWhite / ledGround >= 3.5, `the display: ground ${ledGround.toFixed(3)}, white ${ledWhite.toFixed(3)}`);
  assert.ok(BOARD_LED.fill > 0.5 && BOARD_LED.fill < 0.9 && ledWhite / BOARD_LED.fill ** 2 < 0.9, `a lit white LED from close: ${(ledWhite / BOARD_LED.fill ** 2).toFixed(2)}: under the bloom threshold (1.35)`);
  assert.ok(BOARD_LED.pitch[0] > 0.005 && BOARD_LED.pitch[0] < 0.012 && Math.abs(BOARD_LED.pitch[0] / BOARD_LED.pitch[1] - 1) < 0.08 && BOARD_LED.cabinet <= 0.05, 'an indoor perimeter panel\'s pitch, square cells within a few per cent');
  // (the pitch is two atlas texels: the display's picture is painted at one texel per LED and copied up)
  assert.ok(Math.abs(BOARD_LED.pitch[0] - (2 * PANEL.w) / ATLAS.panels.marks[2]) < 1e-9 && Math.abs(BOARD_LED.pitch[1] - (2 * PANEL.h) / ATLAS.panels.marks[3]) < 1e-9);
  // NO PAINTED SHADE stands in for light: no vertex shade on a merged surface (the kit's `k` option) except the emissive
  // levels (the LED panels' gain, the step lights), no row shade, no print lift, no painted pool of light, a few per cent of soil at most
  const code = src('surround.js').replace(/\/\/.*$/gm, '');
  const shades = [...code.matchAll(/\bk:\s*([^,}]+)/g)].map((m) => m[1].trim());
  assert.deepEqual(shades, ['rail.led', 'STEP.level'], `vertex shades in surround.js: ${shades.join(' | ')}`);
  assert.ok(!('ROW_SHADE' in LEVELS) && !('seat' in PRINT) && !('seatFrame' in PRINT) && !('tread' in PRINT) && !('pool' in STEP) && !('tube' in STEP) && !('board' in PRINT) && !('white' in PRINT), 'a row shade, a print lift or a painted pool is back');
  assert.ok(PRINT.soil <= 0.08 && PRINT.desat >= 0.3 && PRINT.desat <= 0.7 && BOARD_LED.desat >= 0.3 && BOARD_LED.desat <= 0.7);
  assert.ok(STEP.level >= 1 && STEP.level <= 2 && SCORE.level <= 1.3 && SCORE.glow.intensity <= 3, 'small step lights; the scoreboard stays a lit surface with a faint spill');
  assert.ok(SHADOW.contact < SHADOW.cast && SHADOW.cast < 1);
  assert.ok(SURFACE.seats.alphaTest > 0 && SURFACE.board.roughness < SURFACE.deck.roughness && SURFACE.board.roughness <= 0.4 && SURFACE.seats.roughness >= 0.8, 'a slight gloss on the print; a seat card is a flat sheet: it must not shine');
  assert.ok(SURFACE.fabric.roughness < 0.85 && SURFACE.fabric.roughness > 0.6 && SURFACE.fabric.sheen > 0.5 && SURFACE.shell.roughness < 0.6, 'the fabric keeps its sheen and the emitters\' highlights under a bake; the shells have a sheen');
});

ok('palette (CONTRACT 15.4, 17.3): the seats are ONE muted colour on black shells, a real fabric albedo: ochre chosen, petrol and graphite behind the tool switch; no red, no violet', () => {
  const lin = (c) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const bytes = (hex) => { const v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
  const rgb = (hex) => bytes(hex).map(lin);
  const chroma = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  // the hue angle (degrees) and the HSV saturation of an sRGB colour, as a colour picker shows them
  const hsv = (hex) => { const [r, g, b] = bytes(hex), mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; const h = d === 0 ? 0 : mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return { hue: h * 60, sat: mx ? d / mx : 0 }; };
  const fabric = rgb(SEAT_COLOR.fabric), shell = rgb(SEAT_COLOR.shell), sheen = rgb(SEAT_COLOR.sheen);
  assert.ok(Math.abs(luminance(SEAT_COLOR.fabric) / ALBEDO.seatFabric - 1) < 0.03, `the fabric's albedo ${luminance(SEAT_COLOR.fabric).toFixed(4)}`);
  // THE THREE KINDS (CONTRACT 17.3): each a hue at a real fabric's reflectance
  assert.deepEqual([...SEATS.kinds], ['petrol', 'ochre', 'graphite']);
  assert.equal(SEATS.default, 'ochre', 'the chosen seat colour moved: the bake holds its bounce (scratch/surround/SEAT-COLOUR.md, then the light role)');
  const P = hsv(SEATS.petrol.hue), O = hsv(SEATS.ochre.hue), G = hsv(SEATS.graphite.hue);
  assert.ok(P.hue >= 185 && P.hue <= 195 && P.sat <= 0.55 && SEATS.petrol.albedo >= 0.05 && SEATS.petrol.albedo <= 0.08, `petrol: hue ${P.hue.toFixed(1)}, saturation ${P.sat.toFixed(2)}, albedo ${SEATS.petrol.albedo}`);
  // ochre: a mustard-gold, not orange (under 40 degrees), not red, muted (a saturation under 0.45)
  assert.ok(O.hue >= 42 && O.hue <= 55 && O.sat >= 0.25 && O.sat <= 0.45 && SEATS.ochre.albedo >= 0.18 && SEATS.ochre.albedo <= 0.25, `ochre: hue ${O.hue.toFixed(1)}, saturation ${O.sat.toFixed(2)}, albedo ${SEATS.ochre.albedo}`);
  assert.ok(G.sat < 0.12 && SEATS.graphite.albedo === 0.09, 'graphite: round A4\'s neutral grey');
  for (const kind of SEATS.kinds) {
    const c = seatColor(kind), h = hsv(c.fabric), hs = hsv(c.sheen);
    assert.ok(c.kind === kind && Math.abs(luminance(c.fabric) / SEATS[kind].albedo - 1) < 0.03 && c.albedo === SEATS[kind].albedo, `${kind}: the fabric at its albedo`);
    // no red (a hue within 25 degrees of 0 with any saturation to speak of), no violet (250 to 330 degrees)
    assert.ok(h.sat < 0.12 || (h.hue > 25 && h.hue < 250), `${kind}: the fabric's hue ${h.hue.toFixed(0)} is red or violet`);
    assert.ok(hs.sat < 0.3 && (hs.sat < 0.08 || Math.abs(hs.hue - h.hue) < 20 || h.sat < 0.12) && luminance(c.sheen) > 2 * SEATS[kind].albedo, `${kind}: the sheen is the fibre's own pale tint`);
    assert.ok(c.cardVeil.length === 3 && c.cardVeil.every((q) => q >= 0 && q <= 0.04), `${kind}: the card's veil ${c.cardVeil}`);
    assert.equal(c.shell, SEAT_COLOR.shell); assert.equal(c.vary, SEAT_COLOR.vary);
  }
  assert.ok(fabric[0] > fabric[2] * 1.5 && fabric[1] > fabric[2] * 1.5 && fabric[0] < fabric[1] * 1.35, `the chosen fabric ${fabric.map((q) => q.toFixed(3))} is not an ochre (red and green lead blue; red does not run away from green)`);
  assert.ok(chroma(sheen) < 0.6 && sheen[0] >= sheen[2], 'the sheen is the fibre\'s own pale tint');
  assert.ok(Math.abs(luminance(SEAT_COLOR.shell) / ALBEDO.shell - 1) < 0.04 && Math.abs(luminance(SEAT_COLOR.frame) / ALBEDO.shell - 1) < 0.04 && chroma(shell) < 0.15, 'black shells and standards at the black coat\'s albedo');
  assert.ok(Math.abs(luminance(SEAT_COLOR.plate) / ALBEDO.plate - 1) < 0.03 && hsv(SEAT_COLOR.plate).sat < 0.1, 'a blank number plate: a pale neutral tag');
  // the hue is the chosen kind's (levels.js SEATS), brought to its albedo
  assert.equal(SEAT_COLOR.fabric, withLuminance(SEATS[SEATS.default].hue, ALBEDO.seatFabric));
  assert.equal(seatColor().fabric, SEAT_COLOR.fabric); assert.equal(seatColor('bogus').kind, SEATS.default);
  // the card's paint is the same fabric plus the mean of the sheen lobe: a small near-neutral veil, never a lift
  // (round A4: measured on an app pair under the baked hall light, base | high at the same pad pixels; a shade warm,
  // as the real pads are against the fabric's own cool grey; the card with it stays cool or neutral: blue >= red)
  const veil = seatColor('graphite').cardVeil;
  assert.ok(veil.length === 3 && veil.every((q) => q >= 0 && q <= 0.04) && chroma(veil) < 0.25, `the card's veil ${veil}`);
  assert.deepEqual([...veil], [0.021, 0.021, 0.018], 'graphite\'s measured veil moved: measure a base | high pair in the app before changing it');
  // (the chosen kind's veil: the same share of its own sheen colour until this round's base | high pair measures it)
  assert.ok(SEAT_COLOR.cardVeil.every((q, i) => Math.abs(q - 0.053 * sheen[i]) < 0.0006), `the chosen fabric's veil ${[...SEAT_COLOR.cardVeil]}`);
  // the card's pad is the real seat's capped back: its paint reaches the back's top edge (paint.js paintSeatCard)
  assert.ok(/const cap = it\.part === 'pad' \? y - Y\(backPart\.y \+ backPart\.h\) : 0;/.test(src('surround/paint.js')) && /H - \(backPart\.y \+ backPart\.h\) \* sy/.test(src('surround/paint.js')), 'the card\'s pad no longer reaches the back\'s top (the law\'s fabric region goes with it)');
  assert.ok(!('padOcclusion' in SEAT_COLOR) && SEAT_COLOR.vary <= 0.1, 'the pad\'s occlusion is a tuned number again (round A4: seat.js padSlot / slotOpen)');
  // no garnet, no red seat colour anywhere in the sources (the record of round A2's values aside)
  for (const f of SOURCES) { const code = src(f).replace(/ROUND_A2 = Object\.freeze\(\{[\s\S]*?\}\);/, ''); assert.ok(!/#7d2f37|#b4505a|garnet/i.test(code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${f}: round A2's red is still in the code`); }
  assert.equal(SEAT_ASSETS.normal, 'arena.seat.normal');
});

// (from here on: three from the vendored file for everything that imports it: surround.js, seat.js)
const { registerHooks } = await import('node:module');
const threeUrl = pathToFileURL(`${here}../../vendor/three.module.min.js`).href;
registerHooks({ resolve(specifier, context, nextResolve) { return specifier === 'three' ? { url: threeUrl, shortCircuit: true } : nextResolve(specifier, context); } });
const SURROUND = await import('../../scene/club/arena/surround.js');
const RAIL_GLSL_TEXT = SURROUND.RAIL_GLSL, READ_LOOK_DEFAULT = SURROUND.readLook(null);

ok('no view rule (CONTRACT 15.3): no term of the surround\'s shaders reads the camera\'s world position or height other than through the surface\'s own view angle', () => {
  const sur = src('surround.js'), code = sur.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // 1. the sources: nothing that reads where a camera is, no capture test, no cut-off, no per-pose switch
  for (const f of SOURCES) {
    const c = src(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/ROUND_A2 = Object\.freeze\(\{[\s\S]*?\}\);/, '');
    assert.ok(!/cameraPosition|camera\s*\.\s*(position|matrixWorld|matrixWorldInverse|getWorldPosition|parent)|getWorldPosition|isCubeCamera|CubeCamera|isWebGLCubeRenderTarget/.test(c), `${f}: reads a camera's place or kind`);
    assert.ok(!/cut-?off|sin0|sin1|isCapture|\bcapture\b|streak/i.test(c), `${f}: a cut-off, a capture level or a streak switch`);
    assert.ok(!/inverse\s*\(\s*viewMatrix|viewMatrix\s*\[\s*3\s*\]|modelMatrix|vWorldPosition|vArenaRailWP/.test(c), `${f}: a world position in a shader`);
  }
  // 2. every per-draw hook of the surround takes the renderer alone (no scene, no camera) and sets the raster's size only
  const hooks = [...code.matchAll(/onBeforeRender\s*=\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
  assert.deepEqual(hooks, ['renderer'], `per-draw hooks: ${hooks.join(' | ')}`);
  assert.ok(!/onBeforeRender[\s\S]{0,400}(camera|scene)/.test(code.slice(code.indexOf('onBeforeRender'), code.indexOf('onBeforeRender') + 420)), 'the per-draw hook looks at a camera');
  // 3. the shader text itself (surround.js RAIL_GLSL; exported so that this arm reads exactly what is compiled)
  const G = RAIL_GLSL_TEXT;
  const all = G.vertexPars + G.vertex + G.fragmentPars + G.fragment;
  assert.ok(!/cameraPosition|isOrthographic|modelMatrix|viewMatrix\b(?!\w)|inverse\s*\(/.test(all.replace(/modelViewMatrix/g, '')), 'the rail\'s shader reads a world position or the camera\'s place');
  // the eye enters ONLY as the view vector in view space, and only inside dot products with the surface's own axes
  assert.ok(/vArenaRailV = - mvPosition\.xyz;/.test(G.vertex) && /vArenaRailN = normalize\( normalMatrix \* normal \);/.test(G.vertex), 'the view vector and the normal are taken in view space');
  assert.equal((G.fragment.match(/vArenaRailV/g) ?? []).length, 1, 'the view vector is read once');
  assert.ok(/vec3 arenaV = normalize\( vArenaRailV \);/.test(G.fragment));
  const usesOfV = [...G.fragment.matchAll(/arenaV\b/g)].length, dots = [...G.fragment.matchAll(/dot\( normalize\( vArenaRail[NT] \), arenaV \)/g)].length;
  assert.equal(usesOfV - 1, dots, 'the view vector is used outside a dot product with the surface\'s normal or its across axis');
  assert.equal(dots, 2, 'the surface\'s view angle (normal) and the side the eye stands on (across)');
  // no component of the view vector or of a position is read on its own (no height, no distance)
  assert.ok(!/arenaV\s*\.\s*[xyz]|vArenaRailV\s*\.\s*[xyz]|length\s*\(\s*(arenaV|vArenaRailV)|gl_FragCoord|vViewPosition/.test(G.fragment), 'a component of the view vector, a distance or a screen position in the fragment text');
  // the uniforms: constants of the profile and the raster's size: nothing a camera could move
  const uniforms = [...all.matchAll(/uniform\s+\w+\s+(\w+)\s*;/g)].map((m) => m[1]).sort();
  assert.deepEqual([...new Set(uniforms)], ['uArenaLed', 'uArenaRail', 'uArenaRailPx']);
  // the emission law and the section are in the text, as levels.js states them
  assert.ok(/pow\( arenaCos, uArenaRail\.y \)/.test(G.fragment) && /1\.0 - uArenaRail\.x \/ max\( arenaTan, 1e-5 \)/.test(G.fragment) && /arenaCos \/ max\( abs\( arenaAcross \), 1e-5 \)/.test(G.fragment), 'the opal\'s law and the lip\'s geometry');
  // the vertex text widens a thin opening in SCREEN space and hands the energy ratio on: it reads the viewport, not the eye
  // (round A5: each edge moves out by the filter's radius; the slit's true width on screen goes to the fragment, which
  // takes the tent's integral over it: the raster's coverage, a function of the fragment's place across the quad)
  assert.ok(/2\.0 \* uArenaRailPx\.z \/ uArenaRailPx\.xy \* gl_Position\.w/.test(G.vertex) && /vArenaRailU\.y = arenaLen;/.test(G.vertex) && /vArenaRailU\.z = uArenaRailPx\.z;/.test(G.vertex)
    && /float arenaA = arenaTent\( \( arenaD \+ 0\.5 \* arenaPx \) \/ vArenaRailU\.z \);/.test(G.fragment) && /float arenaB = arenaTent\( \( arenaD - 0\.5 \* arenaPx \) \/ vArenaRailU\.z \);/.test(G.fragment) && /arenaCover = arenaA - arenaB;/.test(G.fragment)
    && /float arenaTent\( float x \)/.test(G.fragmentPars) &&!/mvPosition\.[xyz]\b(?!z)/.test(G.vertex.replace('- mvPosition.xyz', '')), 'the raster\'s widening');
  // the INSIDE of the slit under the same tent (the text of 10:00Z averaged it over a one-pixel box clamped to the slit and
  // lost four tenths of the slit's light at radius 2): the opal's stretch and the wall's, each by the tent's integral
  assert.ok(/float arenaM = arenaTent\( \( arenaD - \( arenaAcross > 0\.0 \? 0\.5 - arenaEdge : arenaEdge - 0\.5 \) \* arenaPx \) \/ vArenaRailU\.z \);/.test(G.fragment)
    && /arenaOpal = \( arenaAcross > 0\.0 \? arenaM - arenaB : arenaA - arenaM \) \/ arenaCover;/.test(G.fragment) && !/arenaIn\b/.test(G.fragment), 'the slit\'s inside is not weighted by the tent');
  {
    // the mirror of those lines: over a column of pixels the slit's light is its width x its mean radiance, wherever the
    // line lies on the pixel grid and on whichever side the eye stands
    const R = RAIL.filterPx, wallK = 0.1, { tentCdf } = LEVELS;
    for (const w of [0.3, 0.72, 2.6]) for (const edge of [0, 0.35, 0.8, 1]) for (const side of [0, 1]) for (const c of [0, 0.23, 0.5]) {
      let sum = 0;
      for (let row = -8; row <= 8; row += 1) {
        const d = row - c, a = tentCdf((d + 0.5 * w) / R), b = tentCdf((d - 0.5 * w) / R), m = tentCdf((d - (side ? 0.5 - edge : edge - 0.5) * w) / R);
        const opal = side ? m - b : a - m;
        sum += opal + (a - b - opal) * wallK;
      }
      assert.ok(Math.abs(sum - w * (edge + (1 - edge) * wallK)) < 1e-9, `the slit's light over a column: width ${w}, opal ${edge}, side ${side}, at ${c}: ${sum}`);
    }
  }
  // 4. the tool switches: none of them names a pose, a height or a capture
  assert.deepEqual(Object.keys(READ_LOOK_DEFAULT).sort(), ['boards', 'card', 'emitters', 'rail', 'real', 'score', 'seatColor', 'seats', 'shadow', 'sheen', 'slot', 'steps', 'tilt', 'vary', 'wash']);
  // 5. the LED panels' text (round A4): the pixel grid is a function of the face's own cell coordinate and its screen
  // derivative: no view vector, no normal, no position
  // Round A5: the display's emission law (the mask's pocket) reads the SURFACE'S OWN view angle, the cosine the rail's
  // law reads, and nothing else of the eye: no view vector, no normal, no position in the LED branch; the cabinets'
  // seams and levels are functions of the face's cabinet coordinate and its screen derivative
  const ledBranch = G.fragment.slice(G.fragment.indexOf('if ( vArenaRailU.x > 2.5 )'), G.fragment.indexOf('} else if ( vArenaRailU.x > 1.5 )'));
  assert.ok(ledBranch.length > 100 && /fwidth\( arenaCell \)/.test(ledBranch) && /fwidth\( arenaCab \)/.test(ledBranch) && !/arenaV\b|vArenaRailV|vArenaRailN|normalize|gl_FragCoord/.test(ledBranch), 'the LED face reads a view term other than its own view angle');
  assert.ok(/float arenaSeen = clamp\( 1\.0 - uArenaLed\.x \* sqrt\( max\( 1\.0 - arenaCos \* arenaCos, 0\.0 \) \) \/ max\( arenaCos, 1e-3 \), 0\.0, 1\.0 \);/.test(ledBranch), 'the pocket\'s law: 1 - pocket x tan(theta), theta from the face\'s normal');
  assert.equal((ledBranch.match(/arenaCos/g) ?? []).length, 3,'the view angle is read in the pocket\'s law and nowhere else in the LED branch');
  assert.ok(/vArenaRailT = railSlot\.xyz;/.test(G.vertex), 'the cell and cabinet coordinates are the vertex attribute, untouched');
  // the law in numbers (levels.js BOARD_LED.pocket): head on nothing changes; a quarter less at 70 degrees; dark near grazing
  const seenAt = (deg) => Math.max(0, 1 - BOARD_LED.pocket * Math.tan((deg * Math.PI) / 180));
  assert.ok(seenAt(0) === 1 && seenAt(45) > 0.88 && seenAt(60) > 0.8 && seenAt(70) > 0.68 && seenAt(70) < 0.78 && seenAt(80) < 0.5 && seenAt(86) === 0 && BOARD_LED.pocket >= 0.05 && BOARD_LED.pocket <= 0.2, 'a slight falloff: the pocket\'s numbers');
  // cabinets about half a metre wide, a hairline between them, a few per cent of level apart
  assert.ok(BOARD_LED.cabinetWidth >= 0.4 && BOARD_LED.cabinetWidth <= 0.6 && BOARD_LED.seam >= 0.001 && BOARD_LED.seam <= 0.003 && BOARD_LED.cabinet > 0 && BOARD_LED.cabinet <= 0.05, 'the cabinets');
  // (the seams are the shader's alone: the painter draws none)
  assert.ok(!/BOARD_LED\.cabinet/.test(src('surround/paint.js').replace(/\/\/.*$/gm, '')), 'the painter draws cabinet seams again');
});

ok('laws: no three light, no shadow flag, no randomness, no clock, no request in the surround\'s sources', () => {
  for (const f of SOURCES) {
    const code = src(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.ok(!/new THREE\.\w*Light\(|castShadow|receiveShadow|shadowMap/.test(code), `${f}: a light or a shadow flag`);
    assert.ok(!/Math\.random|performance\.now|Date\.now|setTimeout|setInterval|fetch\(|XMLHttpRequest|localStorage|navigator\./.test(code), `${f}: randomness, a clock, a request or a device read`);
    assert.ok(!/readRenderTargetPixels|getBufferSubData|readPixels/.test(code), `${f}: a GPU read-back`);
  }
  // pure modules stay pure (the arm imports them without three)
  for (const f of ['surround/content.js', 'surround/plan.js', 'surround/levels.js']) assert.ok(!/from 'three'|document\.|window\./.test(src(f)), `${f} is not pure`);
});

// ---------------------------------------------------------------------------------------------------------------------------
// 4. the whole surround, built in node
// ---------------------------------------------------------------------------------------------------------------------------
{
  const THREE = await import('three');
  const grad = { addColorStop() {} };
  const calls = { stroke: 0, fill: 0, text: 0, image: 0 };
  const ctxStub = () => new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { if (k === 'stroke') calls.stroke += 1; if (k === 'fillRect' || k === 'fill') calls.fill += 1; if (/Text$/.test(String(k))) calls.text += 1; if (k === 'drawImage') calls.image += 1; return String(k).startsWith('create') ? grad : undefined; }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
  const hadDocument = 'document' in globalThis;
  if (!hadDocument) globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctxStub() }) };
  const { buildSurround, readLook, readRail } = SURROUND;
  const { seatBackGeometry, seatPanGeometry, seatCushionGeometry, seatArmGeometry, signedVolume, padSlot, slotOpen, seatBackUpholstered, seatCushionUpholstered, padSlotUpholstered, cushionRollTurn } = await import('../../scene/club/arena/surround/seat.js');
  const { TIERS } = await import('../../scene/club/tiers.js');
  let roomLight = null, lightNote = 'room/light.js';
  try { roomLight = (await import('../../scene/club/room/light.js')).roomLight ?? null; } catch (e) { lightNote = `room/light.js did not load (${e?.message ?? e}): the fallback materials only`; }
  const FLOOR = -0.79;
  const args = (light) => ({
    box: { min: new THREE.Vector3(H.x0, FLOOR, H.z0), max: new THREE.Vector3(H.x1, FLOOR + H.height, H.z1) },
    floorY: FLOOR, tableBounds: { minX: -stroke.x, maxX: stroke.x, minZ: -stroke.z, maxZ: stroke.z }, roomLight: light, layout: LAYOUT,
  });
  const built = {};
  for (const tier of ['lite', 'base', 'high']) for (const lit of [true, false]) {
    if (lit && !roomLight) continue;
    if (lit) { roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } }); roomLight.setSides?.(cutPlanes(FLOOR)); }
    const s = await buildSurround({ tier, knobs: TIERS[tier] }, args(lit ? roomLight : null));
    built[`${tier}${lit ? '' : ':nolight'}`] = { tier, lit, s, lightState: lit ? roomLight.state?.() : null };
  }
  const meshesOf = (group) => { const out = []; group.traverse((o) => { let vis = true; for (let p = o; p; p = p.parent) if (p.visible === false) vis = false; if (o.isMesh && vis) out.push(o); }); return out; };
  // meshes (seven materials on a side; the west side has no cast overlay; the high tier: two instanced seat meshes instead
  // of three card meshes) and triangles. Base stays where round A1 had it (28 meshes, 10,408 triangles): the round's real
  // geometry is the high tier's
  // (round A5: the high tier's seat is sewn: 348 triangles a seat where round A4's had about 210 (a piped edge, a
  // seam, the pan's cushion, an armrest cap, a plate), and two more instanced meshes: 162,200 triangles, 24 draw calls)
  // (round A6: the upholstered seat is 540 triangles (the two panels' bolsters, the cushion's waterfall edge, four
  // segments to a corner): 226,712 on the high tier)
  const BUDGET = { lite: [24, 5200], base: [28, 11200], high: [29, 230000] };

  ok(`build: the surround builds on every tier, with the room light and without it (${lightNote}), inside its budgets`, () => {
    assert.ok(Object.keys(built).length >= 3);
    for (const [key, { tier, lit, s, lightState }] of Object.entries(built)) {
      const c = s.counts();
      assert.equal(c.enabled, true, `${key}: ${c.reason}`);
      assert.equal(c.lit, lit, `${key}: lit`);
      assert.equal(c.detail, TIERS[tier].roomDetail);
      assert.ok(c.drawCalls <= BUDGET[tier][0], `${key}: ${c.drawCalls} draw calls`);
      assert.ok(c.triangles <= BUDGET[tier][1], `${key}: ${c.triangles} triangles`);
      assert.equal(meshesOf(s.group).length, c.drawCalls, `${key}: one mesh per draw call`);
      assert.deepEqual(c.seats.perBlock, { north: 144, south: 144, east: 96 }, `${key}: seats per block`);
      assert.equal(c.modules, 24); assert.equal(c.posts, 6); assert.equal(c.railSegments, 24);
      if (tier !== 'high') assert.ok(c.cards === 48 && c.realSeats === 0 && c.seats.onCards === 384, `${key}: one card per row and half`);
      // the high tier: EVERY seat is real, no card is left
      if (tier === 'high') assert.ok(c.realSeats === 384 && c.cards === 0 && c.seats.onCards === 0 && c.seats.real === 384 && c.openSeats >= 4, `${key}: ${c.realSeats} real seats, ${c.cards} cards`);
      assert.equal(c.hoops, tier === 'lite' ? 0 : tier === 'base' ? 24 : 48, `${key}: hoop handrails`);
      assert.equal(c.stepLights, 3 * 2 * ARENA.seating.rows, `${key}: a pair of step lights per row and aisle`);
      assert.ok(c.emitters.length <= ARENA.emitters.surround && c.emitters.length === (tier === 'lite' ? 4 : 5), `${key}: ${c.emitters.length} emitters`);
      if (lit) for (const id of c.emitters) assert.ok(lightState.ids.includes(id), `${key}: ${id} is not registered with the room light`);
      assert.ok(s.emissives.length === 5 && s.emissives.every((m) => m.isMesh), `${key}: emissives (the rail and step lights of four sides, the scoreboard)`);
      for (const [side, k] of Object.entries(c.drawCallsBySide)) assert.ok(k <= 7, `${key}: ${k} meshes on the ${side} side`);
      for (const t of c.textures) assert.ok(Math.max(t.w, t.h) <= 2048 && t.name.startsWith('arena.surround.'), `${key}: texture ${t.name} ${t.w} x ${t.h}`);
      assert.ok(c.textureBytes <= (tier === 'lite' ? 2.0e6 : tier === 'base' ? 6.6e6 : 6.0e6), `${key}: ${c.textureBytes} texture bytes`);
      const st = s.state();
      assert.ok(st.enabled && st.contentHash === PINNED_HASH && st.words.length === PINNED_WORDS.length);
      assert.deepEqual(st.shadowNames, { contact: 'arena.surround.contactshadow', cast: 'arena.surround.castshadow' });
      // what the bake role reads: the signature and the emitters as registered (place, size, level)
      assert.equal(st.signature, s.signature());
      assert.deepEqual(st.emitterTable.map((e) => e.id), c.emitters);
      for (const e of st.emitterTable) assert.ok(e.p.length === 3 && e.size.length === 2 && e.intensity > 0 && typeof e.color === 'string');
      // (round A6: the scoreboard's spill is one-sided, toward the hall, when its face is the lit slide: levels.js SCORE_SLIDE)
      for (const e of st.emitterTable) assert.ok(/boardwash/.test(e.id) ? Array.isArray(e.normal) && e.normal[1] < -0.5 : SCORE_SLIDE.on ? Array.isArray(e.normal) && e.normal[0] === 1 && e.normal[1] === 0 && e.normal[2] === 0 : e.normal === null, `${key}: ${e.id}'s normal`);
      assert.equal(st.bloom, tier !== 'lite');
      // the rail: ONE level on every tier, its section and its optics as numbers; no cut-off and no capture level to report
      assert.equal(st.rail.level, RAIL.face.level, `${key}: the rail's level`);
      assert.ok(st.rail.slot === BOARD.profile.slot && st.rail.recess === BOARD.profile.recess && st.rail.tiltDeg === BOARD.profile.tilt && st.rail.hiddenBelowDeg < 0 && st.rail.wallShare > 0.008 && st.rail.filterPx === RAIL.filterPx);
      // the boards (round A4): the default kind on every tier: LED panels, one per module, no lit print material
      assert.ok(st.boards.kind === BOARDS.default && st.look.boards === BOARDS.default && st.boards.cap.nose === capOf().nose, `${key}: the boards' kind`);
      if (BOARDS.default === 'led') assert.ok(c.ledPanels === 24 && !c.byMaterial['arena.surround.board'] && st.boards.led.gain === BOARD_LED.gain, `${key}: ${c.ledPanels} LED panels`);
      else assert.ok(c.ledPanels === 0 && c.byMaterial['arena.surround.board'] > 0, `${key}: printed faces`);
      assert.ok(!('cutoff' in st.rail) && !('capture' in st.rail) && !('core' in st.rail) && !('cutoff' in st.look) && !('streak' in st.look), `${key}: a view rule in the state`);
      assert.ok(st.albedoLaw && 'panels' in st.albedoLaw && 'card' in st.albedoLaw);
    }
    assert.equal(calls.text, 0, 'no canvas text call reached the 2D context');
    assert.ok(calls.stroke > 20, `the painter strokes its words (${calls.stroke} strokes)`);
  });

  if (process.argv.includes('--stats')) {
    for (const [key, { s }] of Object.entries(built)) { const c = s.counts(); console.log(`STATS ${key}: ${c.drawCalls} draw calls, ${c.triangles} triangles, ${JSON.stringify(c.byMaterial)}, cards ${c.cards}, real ${c.realSeats}, open ${c.openSeats}, hoops ${c.hoops}, step lights ${c.stepLights}, emitters ${c.emitters.length}, texture bytes ${c.textureBytes} (${c.textures.map((t) => `${t.name} ${t.w}x${t.h} ${t.bytes}`).join('; ')}), seat triangles ${JSON.stringify(c.seatTriangles ?? null)}, signature ${s.signature()}`); }
  }

  ok('build: every mesh and material is named arena.surround.*, carries the cut\'s side attribute, and the overlays have the agreed names', () => {
    for (const [key, { s, lit }] of Object.entries(built)) {
      const names = new Set();
      for (const mesh of meshesOf(s.group)) {
        assert.ok(/^arena\.surround\./.test(mesh.name) && /^arena\.surround\./.test(mesh.material.name), `${key}: ${mesh.name} / ${mesh.material.name}`);
        names.add(mesh.material.name);
        const side = mesh.geometry.getAttribute('roomSide');
        assert.ok(side && side.itemSize === 1, `${key} ${mesh.name}: no roomSide attribute`);
        if (!mesh.isInstancedMesh) assert.equal(side.count, mesh.geometry.getAttribute('position').count, `${key} ${mesh.name}: roomSide per vertex`);
        else assert.ok(side.isInstancedBufferAttribute && side.count === mesh.count, `${key} ${mesh.name}: roomSide per instance`);
        for (let i = 0; i < side.count; i++) assert.ok([SIDE.keep, SIDE.north, SIDE.east, SIDE.south, SIDE.west].includes(side.getX(i)), `${key} ${mesh.name}: side ${side.getX(i)}`);
        if (lit && !/shadow/.test(mesh.material.name)) assert.ok(typeof mesh.material.userData.clubRoom === 'string', `${key} ${mesh.name}: not a room-light material`);
        if (lit && mesh.material.isMeshStandardMaterial) assert.ok(/\|hide$/.test(mesh.material.userData.clubRoom), `${key} ${mesh.name}: made without hide`);
        assert.ok(!mesh.castShadow && !mesh.receiveShadow);
      }
      assert.ok(names.has('arena.surround.contactshadow') && names.has('arena.surround.castshadow'), `${key}: the shadow overlays`);
      for (const mesh of meshesOf(s.group)) if (/shadow/.test(mesh.material.name)) {
        assert.ok(mesh.material.blending === THREE.MultiplyBlending && mesh.material.depthWrite === false && mesh.material.transparent === true && mesh.renderOrder === 1, `${key}: ${mesh.name}`);
      }
      assert.equal(s.group.userData.clubShadowSplit, true);
      assert.equal(s.group.name, 'arena.surround');
    }
  });

  ok('build: every vertex is finite, inside the hall, outside the stroke room, and under the camera or behind its side\'s cut plane', () => {
    const cut = ARENA.cut, clr = ARENA.keepOut.clearance;
    const v = new THREE.Vector3(), m4 = new THREE.Matrix4();
    for (const [key, { s }] of Object.entries(built)) {
      const seen = { keep: 0, north: 0, east: 0, south: 0, west: 0 };
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position'), side = mesh.geometry.getAttribute('roomSide'), overlay = /shadow/.test(mesh.name);
        const inst = mesh.isInstancedMesh ? mesh.count : 1;
        for (let k = 0; k < inst; k++) {
          if (mesh.isInstancedMesh) mesh.getMatrixAt(k, m4);
          for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i);
            if (mesh.isInstancedMesh) v.applyMatrix4(m4);
            const sd = side.getX(mesh.isInstancedMesh ? k : i), h = v.y - FLOOR;
            assert.ok(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z), `${key} ${mesh.name}: a vertex is not finite`);
            assert.ok(v.x >= H.x0 - 0.01 && v.x <= H.x1 + 0.01 && v.z >= H.z0 - 0.01 && v.z <= H.z1 + 0.01 && h >= -0.001 && h <= H.height, `${key} ${mesh.name}: a vertex outside the hall at ${v.toArray().map((q) => q.toFixed(2))}`);
            assert.ok(!inStroke(v.x, v.z), `${key} ${mesh.name}: a vertex in the stroke room at ${v.x.toFixed(2)}, ${v.z.toFixed(2)}`);
            const low = cameraFloor(v.x, v.z);
            if (sd === SIDE.keep) {
              seen.keep += 1;
              assert.ok(h <= 1.05, `${key} ${mesh.name}: an unmarked vertex ${h.toFixed(3)} m above the floor (the board line stays under 1.05)`);
              assert.ok(h + clr <= low, `${key} ${mesh.name}: an unmarked vertex inside the camera volume at ${v.toArray().map((q) => q.toFixed(2))}`);
              // the ring: on the island's edge
              if (!overlay) assert.ok(Math.min(Math.abs(Math.abs(v.x) - ARENA.island.x1), Math.abs(Math.abs(v.z) - ARENA.island.z1)) <= ARENA.boards.footDepth / 2 + 0.01, `${key} ${mesh.name}: an unmarked vertex off the island's edge`);
            } else {
              const behind = sd === SIDE.north ? v.z < cut.north : sd === SIDE.south ? v.z > cut.south : sd === SIDE.east ? v.x > cut.east : v.x < cut.west;
              const outside = sd === SIDE.north ? v.z < ARENA.island.z0 - ARENA.boards.footDepth / 2 : sd === SIDE.south ? v.z > ARENA.island.z1 + ARENA.boards.footDepth / 2 : sd === SIDE.east ? v.x > ARENA.island.x1 + ARENA.boards.footDepth / 2 : v.x < ARENA.island.x0 - 2;
              assert.ok(overlay || outside, `${key} ${mesh.name}: a vertex marked ${sd} on the wrong side of the boards at ${v.toArray().map((q) => q.toFixed(2))}`);
              // in front of the plane (the walkway): low enough to stay under the camera (it vanishes with its block anyway)
              assert.ok(behind || h + clr <= low, `${key} ${mesh.name}: a marked vertex in front of its plane and inside the camera volume at ${v.toArray().map((q) => q.toFixed(2))}`);
              seen[['keep', 'north', 'east', 'south', 'west'][sd]] += 1;
            }
          }
        }
      }
      for (const k of ['keep', 'north', 'east', 'south', 'west']) assert.ok(seen[k] > 0, `${key}: nothing carries the side '${k}'`);
    }
  });

  ok('build: the geometry is the pinned geometry of its revision (the bake\'s signature moves when a shape does)', () => {
    assert.ok(PINNED_GEOMETRY_BY_REV[SURROUND_GEOMETRY_REV], 'the geometry revision moved to one this arm does not know: build, look, then pin the new hashes');
    const m4 = new THREE.Matrix4();
    for (const tier of ['lite', 'base', 'high']) {
      const { s } = built[tier] ?? built[`${tier}:nolight`];
      // (order-free: the sum and the xor of a hash per vertex and per instance matrix, so the same shapes give the same value
      // whichever batch or material they are merged into; the overlays and the emissive meshes are in it too)
      let sum = 0, xor = 0, count = 0;
      const add = (text) => { const h = parseInt(fnv(text), 16); sum = (sum + h) >>> 0; xor = (xor ^ h) >>> 0; count += 1; };
      for (const mesh of meshesOf(s.group)) {
        const pos = mesh.geometry.getAttribute('position');
        const kind = mesh.isInstancedMesh ? mesh.name : /shadow/.test(mesh.name) ? 'overlay' : 'solid';
        for (let i = 0; i < pos.count; i++) add(`${kind}:${Math.round(pos.getX(i) * 1000)},${Math.round(pos.getY(i) * 1000)},${Math.round(pos.getZ(i) * 1000)}`);
        if (mesh.isInstancedMesh) for (let k = 0; k < mesh.count; k++) { mesh.getMatrixAt(k, m4); add(`${kind}|${m4.elements.map((e) => Math.round(e * 1000)).join(',')}`); }
      }
      const got = fnv(`${sum}:${xor}:${count}`);
      if (!PINNED_GEOMETRY[tier]) console.log(`   (geometry hash, ${tier}: '${got}' — not pinned yet)`);
      else assert.equal(got, PINNED_GEOMETRY[tier], `${tier}: the built geometry changed without SURROUND_GEOMETRY_REV: bump the revision, write scratch/surround/NEED-FROM-bake.md, then pin '${got}'`);
      assert.ok(s.signature().startsWith(planSignature(planSurround(ARENA, TIERS[tier].roomDetail))), `${tier}: the signature is the plan's`);
    }
  });

  ok('build: no mesh\'s box holds the table (the ball return\'s furniture walk skips each one by its box)', () => {
    const bb = new THREE.Box3();
    for (const [key, { s }] of Object.entries(built)) for (const mesh of meshesOf(s.group)) {
      if (mesh.isInstancedMesh) continue;   // (the walk does not expand instances: furniture.js skips an InstancedMesh)
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      bb.copy(mesh.geometry.boundingBox).expandByScalar(0.03);
      // the track's stations lie under the table: inside the stroke room's rectangle, between the floor and the bed
      const hits = bb.min.x < stroke.x && bb.max.x > -stroke.x && bb.min.z < stroke.z && bb.max.z > -stroke.z;
      assert.ok(!hits, `${key} ${mesh.name}: its box reaches into the stroke room (${bb.min.toArray().map((q) => q.toFixed(2))} .. ${bb.max.toArray().map((q) => q.toFixed(2))})`);
      assert.ok(mesh.frustumCulled !== false && mesh.geometry.boundingSphere, `${key} ${mesh.name}: culled by its own sphere`);
    }
  });

  ok('build: the review poses look over the boards at the table (no board, rail or seat between a camera and its target)', () => {
    // every fixed pose is inside the ring and above the floor; the ring's top (0.94 m above the floor) is below the bed + 0.2
    for (const view of VIEWS) {
      assert.ok(Math.abs(view.cam[0]) < ARENA.island.x1 - 0.3 && Math.abs(view.cam[2]) < ARENA.island.z1 - 0.3, `${view.id} is outside the ring`);
      assert.ok(Math.abs(view.target[0]) < 1.5 && Math.abs(view.target[2]) < 0.9);
    }
    assert.ok(planBoards().top - ARENA.camera.bedH < 0.2);
  });

  ok('seats: the real seat is four closed, outward solids (a sewn back, a moulded pan, its cushion, an armrest cap) of 250 to 400 triangles with its fixed share; cloth on the pad and the cushion, black shells, a blank plate', () => {
    const back = seatBackGeometry({ tile: SURFACE.fabric.tile, flatUV: [0.01, 0.01] }), pan = seatPanGeometry();
    const cushion = seatCushionGeometry({ tile: SURFACE.fabric.tile }), arm = seatArmGeometry();
    const tris = (g) => g.getIndex().count / 3;
    // per seat: the back, the pan, the cushion, an armrest cap, and its share of what is merged (a standard on its foot, a hinge bar: 12 triangles each)
    const perSeat = tris(back) + tris(pan) + tris(cushion) + tris(arm) + 3 * 12;
    assert.ok(perSeat >= 250 && perSeat <= 400, `${perSeat} triangles per seat (back ${tris(back)}, pan ${tris(pan)}, cushion ${tris(cushion)}, arm ${tris(arm)})`);
    console.log(`   (${perSeat} triangles per seat: back ${tris(back)}, pan ${tris(pan)}, cushion ${tris(cushion)}, armrest cap ${tris(arm)}, 36 merged)`);
    // THE SEWN PAD (round A5): a seam above the tipped-up pan's lip and under the top corners, a piped edge
    assert.ok(SEAT.back.seam > padSlot().lip + 0.05 && SEAT.back.seam < SEAT.back.h - SEAT.back.rTop - 0.02 &&SEAT.back.pipingH > 0.003 && SEAT.back.piping >= 0.008, 'the seam is in view; the welt is a welt');
    {
      // the seam is a crease: at its height the pad's surface lies in the gutter, lower than the two panels' crowns
      const pos = back.getAttribute('position'); let atSeam = 0, crown = 0;
      for (let i = 0; i < pos.count; i++) { if (Math.abs(pos.getY(i) - SEAT.back.seam) < 1e-6 && Math.abs(pos.getX(i)) < 1e-6) atSeam = Math.max(atSeam, pos.getZ(i)); if (Math.abs(pos.getX(i)) < 1e-6) crown = Math.max(crown, pos.getZ(i)); }
      assert.ok(atSeam > 0 && crown - atSeam > 0.01, `the seam lies ${(1000 * (crown - atSeam)).toFixed(1)} mm under the panels' crowns`);
    }
    for (const [name, g] of [['back', back], ['pan', pan], ['cushion', cushion], ['arm', arm]]) {
      assert.ok(signedVolume(g) > 1e-4, `${name}: not wound outward (signed volume ${signedVolume(g)})`);
      // closed: every edge is shared by exactly two triangles (edges matched by position: parts are creased, not open)
      const pos = g.getAttribute('position'), ix = g.getIndex(), edges = new Map();
      const keyOf = (i) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
      for (let t = 0; t < ix.count; t += 3) for (let e = 0; e < 3; e++) {
        const a = keyOf(ix.getX(t + e)), b = keyOf(ix.getX(t + ((e + 1) % 3)));
        if (a === b) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`; edges.set(k, (edges.get(k) ?? 0) + 1);
      }
      for (const [k, c] of edges) assert.equal(c, 2, `${name}: an edge with ${c} triangles (${k})`);
      const nor = g.getAttribute('normal');
      for (let i = 0; i < nor.count; i++) assert.ok(Math.abs(Math.hypot(nor.getX(i), nor.getY(i), nor.getZ(i)) - 1) < 1e-3, `${name}: a normal that is not a unit vector`);
      const box = g.boundingBox;
      // the seat's envelope: nothing wider than a seat, nothing but a back and a pan (the person rule in three dimensions)
      assert.ok(box.max.x - box.min.x <= ARENA.seating.seatPitch - 0.04 && box.max.x <= 0.24 && box.min.x >= -0.24, `${name}: wider than its place`);
    }
    assert.ok(back.boundingBox.max.y <= SEAT.back.h + 1e-6 && back.boundingBox.min.y >= -1e-6 && back.boundingBox.max.z - back.boundingBox.min.z < 0.09, 'the back is a slab');
    assert.ok(pan.boundingBox.max.y - pan.boundingBox.min.y < 0.08 && pan.boundingBox.max.z - pan.boundingBox.min.z <= SEAT.pan.depth + 1e-6, 'the pan is a slab');
    // the cushion lies on the pan and wraps its front lip: a roll a few millimetres proud of the lip, a little way down it
    assert.ok(cushion.boundingBox.max.y <= SEAT.pan.top + 1e-6 && cushion.boundingBox.min.y >= -SEAT.pan.wall && cushion.boundingBox.max.z - (SEAT.pan.depth - SEAT.pan.rear) > 0.003 && cushion.boundingBox.max.z - (SEAT.pan.depth - SEAT.pan.rear) <= 0.012, 'the cushion\'s waterfall edge');
    assert.ok(arm.boundingBox.max.y <= SEAT.arm.t + 1e-6 && arm.boundingBox.min.y >= -1e-6 && Math.abs(arm.boundingBox.max.z - SEAT.arm.len / 2) < 1e-6, 'the armrest cap');
    // colours (CONTRACT 15.2): a vertex is the shell's albedo exactly, or the fabric's albedo times the ONE occlusion a seat
    // carries. Round A4: that occlusion is no tuned number: it is the closed form of the slot between the pad and the
    // tipped-up pan (seat.js padSlot from the seat's own section, slotOpen: what a point `t` under the pan's lip keeps
    // of the light from above). Nothing else: no tint, no roll, no falloff
    const slot = padSlot();
    assert.ok(Math.abs(slot.lip - 0.2647) < 0.002 && slot.gap > 0.03 && slot.gap < 0.05, `the slot behind the pan: the lip ${slot.lip.toFixed(4)} m up the back, ${slot.gap.toFixed(4)} m wide`);
    assert.ok(slotOpen(-0.1, slot.gap) === 1 && slotOpen(0, slot.gap) === 1 && Math.abs(slotOpen(slot.gap, slot.gap) - (1 - Math.SQRT1_2)) < 1e-12 && slotOpen(1, slot.gap) < 0.05, 'the slot\'s law: 1 in the open, 0.29 one width down, next to nothing deep in it');
    for (let t = 0.001; t < 0.3; t += 0.001) assert.ok(slotOpen(t, slot.gap) < slotOpen(t - 0.001, slot.gap) + 1e-12, 'the slot\'s law falls without a step');
    const lumOf = (c, i) => 0.2126 * c.getX(i) + 0.7152 * c.getY(i) + 0.0722 * c.getZ(i);
    const shellC = new THREE.Color(SEAT_COLOR.shell), fabricC = new THREE.Color(SEAT_COLOR.fabric);
    const isShell = (c, i) => Math.abs(c.getX(i) - shellC.r) < 1e-6 && Math.abs(c.getY(i) - shellC.g) < 1e-6 && Math.abs(c.getZ(i) - shellC.b) < 1e-6;
    // (round A5: a third colour, on the pan only: the blank number plate's pale tag)
    const plateC = new THREE.Color(SEAT_COLOR.plate);
    const isPlate = (c, i) => Math.abs(c.getX(i) - plateC.r) < 1e-6 && Math.abs(c.getY(i) - plateC.g) < 1e-6 && Math.abs(c.getZ(i) - plateC.b) < 1e-6;
    let capFabric = 0;
    for (const [name, g] of [['back', back], ['pan', pan], ['cushion', cushion], ['arm', arm]]) {
      const col = g.getAttribute('color'), pos = g.getAttribute('position');
      let fabric = 0, shell = 0, plates = 0, low = 1, high = 0;
      for (let i = 0; i < col.count; i++) {
        if (isShell(col, i)) { shell += 1; continue; }
        if (name === 'pan' && isPlate(col, i)) {
          plates += 1;
          // the plate lies on the moulded underside near the front lip, inside the tray's field, and is small
          assert.ok(pos.getY(i) <= -SEAT.pan.under + 1e-6 && Math.abs(pos.getX(i)) <= SEAT.pan.plate.w / 2 + 1e-6 && pos.getZ(i) > SEAT.pan.depth - SEAT.pan.rear - 0.12, 'pan: the plate is off its place');
          continue;
        }
        const k = col.getX(i) / fabricC.r;
        assert.ok(Math.abs(col.getY(i) - k * fabricC.g) < 1e-6 && Math.abs(col.getZ(i) - k * fabricC.b) < 1e-6 && k > 0 && k <= 1 + 1e-6, `${name}: a vertex that is neither the shell nor the fabric under its one occlusion (factor ${k.toFixed(3)})`);
        fabric += 1; low = Math.min(low, k); high = Math.max(high, k);
        if (name === 'back') {
          // the factor IS the slot's law at the vertex's height (or 1 on the cloth that wraps the top)
          const want = pos.getZ(i) > 0.001 ? slotOpen(slot.lip - pos.getY(i), slot.gap) : 1;
          assert.ok(Math.abs(k - want) < 1e-5, `back: a pad vertex at ${pos.getY(i).toFixed(3)} m carries ${k.toFixed(4)}, the slot's law gives ${want.toFixed(4)}`);
          if (k < 0.999) assert.ok(pos.getY(i) < slot.lip, 'the pad is shaded above the pan\'s lip');
          // round A4: the upholstery wraps over the top of the back: cloth on the top arc of the rim and the side
          if (pos.getZ(i) <= 0.001) { capFabric += 1; assert.ok(pos.getY(i) > SEAT.back.h - SEAT.back.rTop * 0.7, `back: cloth on the shell at ${pos.getY(i).toFixed(3)} m: below the top arc`); }
        }
      }
      if (name === 'back') assert.ok(fabric >= 10 && shell >= 15, `${name}: fabric ${fabric}, shell ${shell}`);
      if (name === 'pan') assert.ok(fabric === 0 && shell >= 40 && plates === 24, `pan: moulded shell and one blank plate (fabric ${fabric}, shell ${shell}, plate vertices ${plates})`);
      if (name === 'cushion') assert.ok(shell === 0 && fabric >= 30 && Math.abs(low - 1) < 1e-6, 'the cushion is cloth all over and carries no shade at all');
      if (name === 'arm') assert.ok(fabric === 0 && shell === col.count, 'the armrest cap is moulded shell');
      if (fabric) assert.ok(Math.abs(high - 1) < 1e-6, `${name}: the fabric in the open is at its albedo`);
      if (name === 'back') assert.ok(low < 0.2, `the pad deep in the slot behind the pan: ${low.toFixed(3)}`);
    }
    // the plate is BLANK: a flat colour on a box; no texture coordinate of the pan reaches a picture (the shells' material has no map)
    assert.ok(Math.abs(SEAT.pan.plate.w - 0.06) < 0.03 && SEAT.pan.plate.h <= 0.03 && SEAT.rowPlate.w <= 0.06 && SEAT.rowPlate.h <= 0.04, 'small plates');
    assert.ok(capFabric >= 6, `the top of the back is upholstered (${capFabric} vertices of cloth on the shell's top arc)`);
    assert.ok(lumOf(back.getAttribute('color'), 0) > 0.03);
    assert.ok(Math.abs((0.2126 * shellC.r + 0.7152 * shellC.g + 0.0722 * shellC.b) / ALBEDO.shell - 1) < 0.04 && Math.abs((0.2126 * fabricC.r + 0.7152 * fabricC.g + 0.0722 * fabricC.b) / ALBEDO.seatFabric - 1) < 0.03, 'the seats\' vertex colours are the law\'s albedos');
  });

  ok('seats (round A6): the upholstered back and cushion are closed, outward solids with form (two bolsters over a seam\'s valley, a waterfall nose); their cloth is the fabric under occlusion only; the cards\' shading reads no camera place', () => {
    assert.ok(seatForm(UPHOLSTERY_REV).upholstered && !seatForm(UPHOLSTERY_REV - 1).upholstered && seatForm(UPHOLSTERY_REV - 1).cardForward === 0, 'the form is keyed on the geometry revision');
    const back = seatBackUpholstered({ tile: SURFACE.fabric.tile, flatUV: [0.01, 0.01] }), cushion = seatCushionUpholstered({ tile: SURFACE.fabric.tile });
    const tris = (g) => g.getIndex().count / 3;
    const perSeat = tris(back) + tris(seatPanGeometry()) + tris(cushion) + tris(seatArmGeometry()) + 3 * 12;
    assert.ok(tris(back) >= 240 && tris(back) <= 300 && tris(cushion) >= 90 && tris(cushion) <= 120 && perSeat <= 560, `${perSeat} triangles per seat (back ${tris(back)}, cushion ${tris(cushion)})`);
    console.log(`   (${perSeat} triangles per upholstered seat: back ${tris(back)}, cushion ${tris(cushion)})`);
    const fabricC = new THREE.Color(SEAT_COLOR.fabric), shellC = new THREE.Color(SEAT_COLOR.shell);
    for (const [name, g] of [['back', back], ['cushion', cushion]]) {
      assert.ok(signedVolume(g) > 1e-4, `${name}: not wound outward`);
      const pos = g.getAttribute('position'), ix = g.getIndex(), col = g.getAttribute('color'), edges = new Map();
      const keyOf = (i) => `${Math.round(pos.getX(i) * 1e5)},${Math.round(pos.getY(i) * 1e5)},${Math.round(pos.getZ(i) * 1e5)}`;
      for (let t = 0; t < ix.count; t += 3) for (let e = 0; e < 3; e++) {
        const a = keyOf(ix.getX(t + e)), b = keyOf(ix.getX(t + ((e + 1) % 3)));
        if (a === b) continue;
        const k = a < b ? `${a}|${b}` : `${b}|${a}`; edges.set(k, (edges.get(k) ?? 0) + 1);
      }
      for (const [k, c] of edges) assert.equal(c, 2, `${name}: an edge with ${c} triangles (${k})`);
      const box = g.boundingBox;
      assert.ok(box.max.x <= 0.24 && box.min.x >= -0.24, `${name}: wider than its place`);
      // a vertex is the shell's albedo or the fabric's times an occlusion of 0..1: no tint, no painted light
      for (let i = 0; i < col.count; i++) {
        if (Math.abs(col.getX(i) - shellC.r) < 1e-6 && Math.abs(col.getY(i) - shellC.g) < 1e-6 && Math.abs(col.getZ(i) - shellC.b) < 1e-6) continue;
        const k = col.getX(i) / fabricC.r;
        assert.ok(Math.abs(col.getY(i) - k * fabricC.g) < 1e-6 && Math.abs(col.getZ(i) - k * fabricC.b) < 1e-6 && k >= 0 && k <= 1 + 1e-6, `${name}: a vertex that is neither the shell nor the fabric under occlusion (factor ${k.toFixed(3)})`);
      }
    }
    // the form: the back stays a slab of a seat's height; on its middle line two crowns stand over the seam's valley
    assert.ok(back.boundingBox.max.y <= SEAT.back.h + 1e-6 && back.boundingBox.min.y >= -1e-6 && back.boundingBox.max.z - back.boundingBox.min.z < 0.09, 'the upholstered back is a slab');
    {
      const pos = back.getAttribute('position'); let valley = 9, above = 0, below = 0, seamY = 0;
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 1e-6 && pos.getZ(i) > 0.0025 && pos.getY(i) > 0.3 && pos.getY(i) < 0.42 && pos.getZ(i) < valley) { valley = pos.getZ(i); seamY = pos.getY(i); }
      for (let i = 0; i < pos.count; i++) if (Math.abs(pos.getX(i)) < 1e-6) { if (pos.getY(i) > seamY) above = Math.max(above, pos.getZ(i)); else if (pos.getY(i) < seamY) below = Math.max(below, pos.getZ(i)); }
      assert.ok(above - valley > 0.012 && below - valley > 0.008, `the seam's valley lies ${(1000 * (above - valley)).toFixed(1)} mm under the upper crown and ${(1000 * (below - valley)).toFixed(1)} mm under the main one`);
    }
    // the cushion's nose stands proud of the pan's lip and its hem hangs under it (the waterfall edge)
    assert.ok(cushion.boundingBox.max.z - (SEAT.pan.depth - SEAT.pan.rear) > 0.015 && cushion.boundingBox.min.y < -0.03 && cushion.boundingBox.max.y <= SEAT.pan.top + 1e-6, 'the cushion\'s waterfall edge');
    assert.ok(padSlotUpholstered().gap > 0.015 && padSlotUpholstered().gap < padSlot().gap && Math.abs(padSlotUpholstered().lip - padSlot().lip) < 1e-9, 'the slot behind the pan is narrower by the bolster');
    // the cards' shading (surround.js cardGlsl): a bent normal and a cloth lobe; a BRDF may read the view DIRECTION, never the camera's place
    const glsl = SURROUND.cardGlsl(), own = SURROUND.cardGlsl(undefined, undefined, true);
    const text = [glsl.fragmentPars, glsl.form, glsl.bend, glsl.sheen, glsl.lobes, own.bend].join('\n');
    assert.ok(text.length > 400 && !/cameraPosition|viewMatrix|modelMatrix|gl_FragCoord/.test(text), 'the card\'s shader text reads no camera place and no screen place');
    // the switch and its parts (levels.js CARD_FORM): on; the fabric's own lobes where there is an emitter loop; the
    // tool's own-tangent bend is not the shipped one; the lobes are masked to the card's cloth
    assert.ok(LEVELS.CARD_FORM.on === true && LEVELS.CARD_FORM.lobes === true && LEVELS.CARD_FORM.ownFrame !== true && glsl.bend !== own.bend && LEVELS.CARD_FORM.sheenGain === 1, 'the card\'s form as switched');
    assert.ok(/material\.sheenColor \*= arenaCardCloth/.test(glsl.lobes) && /material\.roughness = mix\( 0\.9, material\.roughness, arenaCardCloth \)/.test(glsl.lobes), 'the lobes belong to the cloth of the card');
    // the card's form is the seat's: the groove's and the gutter's occlusion come from seat.js's law, no free number
    assert.ok(Math.abs(SURROUND.cardForm().go - slotOpen(0.002 + SEAT.back.pipingH - SEAT.back.gutter, SEAT.back.piping)) < 1e-12 && SURROUND.cardForm().ring === UPHOLSTERY.rings[0], 'the card\'s gutter is the seat\'s');
    assert.ok(/irradiance/.test(glsl.sheen) && !/\+\s*vec3\s*\(\s*[0-9.]+\s*\)/.test(glsl.sheen), 'the cloth lobe scales the baked irradiance: no constant light');
    // round A8: the seam's valley is the mesh's (seat.js seatBackUpholstered): `seamUp` over the gutter at the seam's
    // middle, on the gutter at its two ends; both panels' slope and occlusion read the same depth
    {
      const F = SURROUND.cardForm();
      assert.ok(F.su === UPHOLSTERY.seamUp && Math.abs(F.du + F.su - UPHOLSTERY.upper.thick) < 1e-12 && Math.abs(F.dm + F.su - UPHOLSTERY.main.thick) < 1e-12, 'the seam\'s depth at its two ends is the panel\'s thickness');
      assert.ok(glsl.form.includes(`float arenaSeam = ${F.su.toFixed(5)} * clamp( arenaAx / ${F.hw.toFixed(5)}, 0.0, 1.0 );`) && glsl.form.split(`${F.du.toFixed(5)} + arenaSeam`).length === 3 && glsl.form.split(`${F.dm.toFixed(5)} + arenaSeam`).length === 3, 'the card\'s seam deepens from its middle to its two ends');
    }
    // round A7: the card's nose turns as the real roll does: seat.js cushionRollTurn reads the cushion mesh's own smooth
    // normals at the nose, the chin and the hem; the card's three angles are those in the folded pose: no free number
    // (round A6's ramp from a slope of 2.5 to -0.4 held the roll's top over a third of the band: 13 rows at 130 where
    // the real roll shows 3 rows of highlight over a face at 107, frame a7d4)
    {
      const turn = cushionRollTurn(), F = SURROUND.cardForm(), up = SEAT.fold - Math.PI / 2, C = UPHOLSTERY.cushion;
      assert.ok(turn.length === 4 && turn[3].t === turn[2].t && turn[3].angle < 0 && turn[3].angle > -0.5 && turn[0].t === 0 && Math.abs(turn[1].t - C.roll / 2) < 1e-9 && Math.abs(turn[2].t - (C.roll + C.hem)) < 1e-9, 'the roll\'s three rings');
      assert.ok(turn[0].angle > 1.3 && turn[1].angle > 0.4 && turn[1].angle < 0.8 && turn[2].angle > 0.1 && turn[2].angle < 0.3, `the roll turns from its top to its face: ${turn.map((x) => ((x.angle * 180) / Math.PI).toFixed(1)).join(', ')} degrees`);
      F.nose.a.forEach((a, i) => assert.ok(Math.abs(a - Math.min(Math.atan(4), turn[i].angle + up)) < 1e-12, `the card's nose angle ${i}`));
      assert.ok(Math.abs(F.nose.t[0] - turn[1].t * Math.sin(SEAT.fold)) < 1e-12 && Math.abs(F.nose.t[1] - turn[2].t * Math.sin(SEAT.fold)) < 1e-12 && F.nose.t[1] < F.yn - F.yh, 'the card\'s chin and hem stand where the roll\'s do');
      const rolled = SURROUND.cardGlsl(undefined, undefined, false, { roll: true }).form;
      assert.ok(/arenaCardSlope\.y = tan\( arenaDrop < /.test(rolled) && !/mix\( 2\.5, -0\.4/.test(rolled) && !/cameraPosition|viewMatrix|modelMatrix|gl_FragCoord/.test(rolled), 'the card\'s nose follows the roll: round A6\'s free ramp is not in the text');
      assert.ok(typeof LEVELS.CARD_ROLL.on === 'boolean' && SURROUND.readSteps(null).roll === LEVELS.CARD_ROLL.on && SURROUND.readSteps({ get: () => 'roll:1' }).roll === true && SURROUND.readSteps({ get: () => 'roll:0' }).roll === false, 'the switch and its tool arm');
      assert.equal(cushionRollTurn(), turn, 'the roll\'s turn is computed once');
    }
  });

  ok('seats: on the high tier every seat stands on its row with its fixed-seed pose, folded and empty; nothing lies on or over a seat', () => {
    const { s } = built.high ?? built['high:nolight'];
    const inst = meshesOf(s.group).filter((m) => m.isInstancedMesh);
    // round A5: four instanced meshes: the backs and the pans' cushions (cloth), the pans and the armrest caps (moulded shell)
    assert.deepEqual(inst.map((m) => m.name).sort(), ['arena.surround.seatarm', 'arena.surround.seatback', 'arena.surround.seatcushion', 'arena.surround.seatpan'], 'four instanced meshes: backs, pans, cushions, armrest caps, nothing else');
    const seats = planSeats(), sp = planSeating();
    const backs = inst.find((m) => m.name === 'arena.surround.seatback'), pans = inst.find((m) => m.name === 'arena.surround.seatpan');
    const cushions = inst.find((m) => m.name === 'arena.surround.seatcushion'), arms = inst.find((m) => m.name === 'arena.surround.seatarm');
    assert.ok(backs.count === 384 && pans.count === 384 && cushions.count === 384);
    // an armrest at every seat boundary: one more than the seats of each half row
    const halfRows = sp.blocks.reduce((n, b) => n + b.halves.length * b.rows.length, 0);
    assert.equal(arms.count, 384 + halfRows, `${arms.count} armrest caps for 384 seats in ${halfRows} half rows`);
    assert.equal(backs.material.name, 'arena.surround.seatfabric'); assert.equal(pans.material.name, 'arena.surround.seatshell');
    assert.ok(cushions.material === backs.material && arms.material === pans.material, 'cloth in the fabric\'s material, moulded parts in the shells\'');
    assert.ok(backs.material.normalMap && !backs.material.map && !pans.material.map, 'the fabric carries a normal map and no colour map; the shells no map');
    // darker and glossier than the cloth: the shells' albedo is under a quarter of the fabric's, their roughness well under it
    assert.ok(ALBEDO.shell < 0.25 * ALBEDO.seatFabric && pans.material.roughness <= backs.material.roughness - 0.25, 'the shells are darker and glossier than the cloth');
    {
      const ma = new THREE.Matrix4(), mb = new THREE.Matrix4(), q = new THREE.Vector3();
      for (let i = 0; i < 384; i++) { pans.getMatrixAt(i, ma); cushions.getMatrixAt(i, mb); assert.ok(ma.equals(mb), `seat ${i}: its cushion is not on its pan`); }
      // every cap stands at an armrest's height over a deck of its block
      for (let i = 0; i < arms.count; i++) { arms.getMatrixAt(i, ma); q.setFromMatrixPosition(ma); const over = sp.rows.map((r) => q.y - (FLOOR + r.h + SEAT.arm.y)); assert.ok(over.some((d) => Math.abs(d) < 1e-6), `armrest ${i} at ${q.y.toFixed(3)}`); }
    }
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), lip = new THREE.Vector3(), up = new THREE.Vector3(), c = new THREE.Color();
    const seenM = new Set();
    let tones = new Set(), lowest = 9;
    seats.forEach((seat, i) => {
      const b = sp.blocks.find((x) => x.id === seat.block);
      const [wx, wz] = toWorld(b.frame, seat.s, seat.d);
      backs.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4);
      assert.ok(Math.abs(p.x - wx) < 1e-6 && Math.abs(p.z - wz) < 1e-6 && Math.abs(p.y - (FLOOR + seat.h + SEAT.back.y)) < 1e-6, `seat ${i}: its back is not on its place`);
      // the back leans away from the table: its top lies behind its foot, between 9 and 15 degrees
      up.set(0, 1, 0).transformDirection(m4);
      const lean = Math.acos(Math.max(-1, Math.min(1, up.y)));
      assert.ok(lean > 0.16 && lean < 0.26, `seat ${i}: its back leans ${lean.toFixed(3)} rad`);
      seenM.add(m4.elements.map((e) => e.toFixed(5)).join(','));
      // the pan is UP: its front lip stands over its pivot
      pans.getMatrixAt(i, m4);
      p.setFromMatrixPosition(m4);
      lip.set(0, 0, SEAT.pan.depth - SEAT.pan.rear).applyMatrix4(m4);
      assert.ok(lip.y - p.y > 0.2, `seat ${i}: its pan is not tipped up (the lip ${(lip.y - p.y).toFixed(3)} m over the pivot)`);
      lowest = Math.min(lowest, lip.y - p.y);
      backs.getColorAt(i, c); tones.add(c.r.toFixed(3));
      assert.ok(Math.abs(c.r - seat.tone) < 1e-6 && c.r === c.g && c.g === c.b, `seat ${i}: its wear`);
    });
    assert.equal(seenM.size, 384, 'no two seats stand alike');
    assert.ok(tones.size > 50 && lowest < 0.29, 'the seats differ in wear; a few pans are not fully up');
    assert.ok(!pans.instanceColor || pans.instanceColor.count === 384);
    // the rows read by the light, not by a painted shade: no instance colour follows the row
    const meanOfRow = (r) => { let a = 0, k = 0; seats.forEach((seat, i) => { if (seat.row === r) { backs.getColorAt(i, c); a += c.r; k += 1; } }); return a / k; };
    assert.ok(Math.abs(meanOfRow(0) - meanOfRow(7)) < 0.03, 'a row shade on the real seats');
    // a pair's other arm: `real:0` builds cards on the high tier, `vary:0` every seat alike
  });

  ok('rail: one opening per module on the plane of the lips, carrying the profile\'s section; one level in the frame and in every capture, whatever the camera', () => {
    const PF = BOARD.profile;
    for (const [key, { s }] of Object.entries(built)) {
      const emit = meshesOf(s.group).filter((m) => m.material.name === 'arena.surround.emissive');
      assert.equal(emit.length, 4, `${key}: one emissive mesh per side`);
      // round A4: the opening lies on the profile's CHAMFER (plan.js profileSection): its middle line `yMid` over the
      // cap, its two edges half a slit up and down the slope, its normal the slope's (tilted toward the table)
      const PS = profileSection(), mid = FLOOR + ARENA.boards.height + PS.yMid, ct = Math.cos(PS.tilt), st2 = Math.sin(PS.tilt);
      let openings = 0, ledVerts = 0;
      for (const m of emit) {
        const slot = m.geometry.getAttribute('railSlot'), pos = m.geometry.getAttribute('position'), col = m.geometry.getAttribute('color'), nor = m.geometry.getAttribute('normal');
        assert.ok(slot && slot.itemSize === 4 && slot.count === pos.count, `${key} ${m.name}: no railSlot attribute`);
        assert.ok(!m.geometry.getAttribute('railCore'), 'round A2\'s strip attribute is back');
        let edge0 = 0, edge1 = 0, off = 0;
        for (let i = 0; i < slot.count; i++) {
          const w = slot.getW(i);
          if (w < -0.5) { off += 1; assert.ok(slot.getX(i) === 0 && slot.getY(i) === 0 && slot.getZ(i) === 0); continue; }
          if (w === 3) {
            // an LED panel's face: its place in LED cells (along the side, up), its level the display's gain, upright
            ledVerts += 1;
            // (round A5: z = the vertex's place in cabinets: a whole number at a face's edge, eight apart from module to module)
            assert.ok(Math.abs(col.getX(i) - BOARD_LED.gain) < 1e-6 && Math.abs(nor.getY(i)) < 1e-6 && Number.isInteger(slot.getZ(i)) && slot.getZ(i) >= 0 && slot.getZ(i) % 8 <= 4, `${key}: an LED face vertex`);
            const h = pos.getY(i) - FLOOR;
            assert.ok(Math.abs(slot.getY(i) * BOARD_LED.pitch[1] - h) < 1e-4 && h > BOARD.lift && h < ARENA.boards.height, `${key}: an LED vertex ${h.toFixed(3)} m up carries row ${slot.getY(i).toFixed(1)}`);
            continue;
          }
          assert.ok(w === 0 || w === 1, `${key}: a rail vertex on edge ${w}`);
          if (w === 0) edge0 += 1; else edge1 += 1;
          // on the slope (edge 0 is the lower, table-side edge; edge 1 the upper), facing up and toward the table, at the opal's normal luminance
          const want = mid + (w === 0 ? -1 : 1) * (PF.slot / 2) * st2;
          assert.ok(Math.abs(pos.getY(i) - want) < 1e-6 && Math.abs(nor.getY(i) - ct) < 1e-6, `${key}: an opening vertex off the profile's slope (y ${pos.getY(i)}, normal y ${nor.getY(i)})`);
          assert.ok(Math.abs(col.getX(i) - RAIL.face.level) < 1e-6, `${key}: the opening's level ${col.getX(i)}`);
          // the normal's horizontal part points INTO the ring (toward the table)
          const nIn = /north$/.test(m.name) ? nor.getZ(i) : /south$/.test(m.name) ? -nor.getZ(i) : /east$/.test(m.name) ? -nor.getX(i) : nor.getX(i);
          assert.ok(Math.abs(nIn - st2) < 1e-6, `${key}: the slope faces the table (${nIn.toFixed(4)})`);
          // the vector to the opposite edge: in the slope, as long as the slot is wide, and it lands on the board line's other side
          const v = [slot.getX(i), slot.getY(i), slot.getZ(i)];
          assert.ok(Math.abs(Math.hypot(...v) - PF.slot) < 1e-6 && Math.abs(Math.abs(v[1]) - PF.slot * st2) < 1e-6 && Math.sign(v[1]) === (w === 0 ? 1 : -1), `${key}: the across vector ${v}`);
          const here2 = Math.min(Math.abs(Math.abs(pos.getX(i)) - ARENA.island.x1), Math.abs(Math.abs(pos.getZ(i)) - ARENA.island.z1));
          const there = Math.min(Math.abs(Math.abs(pos.getX(i) + v[0]) - ARENA.island.x1), Math.abs(Math.abs(pos.getZ(i) + v[2]) - ARENA.island.z1));
          // (the chamfer's middle line lies `zMid` to the table's side of the board line: the lower edge is the farther one)
          const sg = w === 0 ? 1 : -1;
          assert.ok(Math.abs(here2 - (PS.zMid + sg * (PF.slot / 2) * ct)) < 1e-6 && Math.abs(there - (PS.zMid - sg * (PF.slot / 2) * ct)) < 1e-6, `${key}: the opening is not the slit, centred on the chamfer (${here2}, ${there})`);
        }
        // (the west side has boards and no seating: no step lights there; under LED panels it has the panels' faces)
        assert.ok(edge0 > 0 && edge0 === edge1 && (off > 0 || /west/.test(m.name)), `${key} ${m.name}: ${edge0} / ${edge1} edge vertices, ${off} others (the step lights)`);
        openings += edge0 / 2;
        assert.equal(m.material.userData.arenaRail, true);
        assert.ok(/arena-rail-v7$/.test(m.material.customProgramCacheKey()), 'the rail\'s program has its own key');
        assert.ok(m.material.polygonOffset === true && m.material.polygonOffsetFactor < 0, 'the opening is drawn in front of the profile\'s top it lies on');
      }
      assert.equal(openings, 24, `${key}: one opening per board module`);
      assert.equal(ledVerts, BOARDS.default === 'led' ? 24 * 4 : 0, `${key}: one LED face per module`);
    }
    // THE PER-DRAW HOOK: it sets the raster's size and nothing else. Whatever the camera (none, a cube camera's child, a
    // camera at any height), whatever the target (the frame, a cube face): the material's colour and the rail's uniform stay
    const { s } = built.base ?? built['base:nolight'];
    const emit = meshesOf(s.group).filter((m) => m.material.name === 'arena.surround.emissive');
    const compiled = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    emit[0].material.onBeforeCompile(compiled, null);
    assert.ok(compiled.uniforms.uArenaRail && compiled.uniforms.uArenaRailPx, 'the rail\'s two uniforms');
    assert.ok(compiled.vertexShader.includes(RAIL_GLSL_TEXT.vertex) && compiled.fragmentShader.includes(RAIL_GLSL_TEXT.fragment), 'what is compiled is the text this arm read');
    // (with the room light, the emissive material also carries the HALL'S CUT, the room light's own text: CONTRACT 15.3
    // names it as the club look's rule that stays. Without the room light the program is the stock one plus the rail's
    // text: nothing in it reads the camera's place, and the surround adds exactly two uniforms)
    const plainMat = meshesOf(built['base:nolight'].s.group).find((m) => m.material.name === 'arena.surround.emissive').material;
    const plain = { uniforms: {}, vertexShader: '#include <common>\n#include <project_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    plainMat.onBeforeCompile(plain, null);
    assert.ok(!/cameraPosition|modelMatrix\b/.test(plain.vertexShader + plain.fragmentShader) && plain.vertexShader.includes(RAIL_GLSL_TEXT.vertex), 'the rail\'s program reads the camera\'s place');
    assert.deepEqual(Object.keys(plain.uniforms).sort(), ['uArenaLed', 'uArenaRail', 'uArenaRailPx']);
    const railU = compiled.uniforms.uArenaRail.value, pxU = compiled.uniforms.uArenaRailPx.value, ledU = compiled.uniforms.uArenaLed.value;
    // (round A5: the LED panels' structure: the pocket, the seam as a share of a cabinet, the cabinets' spread: constants)
    assert.ok(ledU.x === BOARD_LED.pocket && Math.abs(ledU.y - BOARD_LED.seam / BOARD_LED.cabinetWidth) < 1e-12 && ledU.z === BOARD_LED.cabinet, 'the LED panels\' uniform');
    assert.ok(Math.abs(railU.x - PF.recess / PF.slot) < 1e-12 && railU.y === RAIL.face.power && Math.abs(railU.z - wallShare(PF.slot, PF.recess)) < 1e-12 && railU.w === BOARD_LED.fill, 'the uniform is the profile\'s section, the law\'s exponent, the wall\'s share and the LED cells\' lit share');
    const railBefore = railU.toArray(), colourBefore = emit[0].material.color.toArray();
    const renderer = (w, h) => ({ getCurrentViewport: (v) => v.set(0, 0, w, h), getRenderTarget: () => ({ isWebGLCubeRenderTarget: true, width: w }) });
    for (const m of emit) {
      assert.equal(typeof m.onBeforeRender, 'function');
      for (const cam of [undefined, {}, { parent: { isCubeCamera: true, type: 'CubeCamera' } }, { position: { x: 0, y: 0.2, z: 0 } }, { position: { x: 0, y: 9, z: 0 } }]) {
        m.onBeforeRender(renderer(1280, 720), null, cam);
        assert.deepEqual(railU.toArray(), railBefore, 'a camera moved the rail\'s uniform');
        assert.deepEqual(m.material.color.toArray(), colourBefore, 'a camera or a capture moved the rail\'s level');
        assert.deepEqual(pxU.toArray(), [1280, 720, RAIL.filterPx]);
      }
      m.onBeforeRender(renderer(256, 256), null, { parent: { type: 'CubeCamera' } });
      assert.deepEqual(pxU.toArray(), [256, 256, RAIL.filterPx], 'a capture\'s face: its own raster size, the same level');
      assert.deepEqual(m.material.color.toArray(), colourBefore);
      m.onBeforeRender({}, null, null);   // a renderer without a viewport: nothing thrown, the last size stands
      assert.deepEqual(pxU.toArray(), [256, 256, RAIL.filterPx]);
    }
  });

  ok('rail: the raster\'s widening in numbers (a mirror of RAIL_GLSL.vertex on the built openings): at every review pose a thin opening is the least width ACROSS THE LINE AS DRAWN and carries its energy ratio', () => {
    // The text's rule, restated: the width is measured square to the screen direction of the rail's run. The round's first
    // app frames (i1, i3) measured the screen LENGTH of the across vector instead: in a plane seen nearly edge-on that
    // vector lies along the line, so it was pixels long where the line was a fraction of a pixel wide, nothing was widened
    // and the line broke into white dashes. This arm holds the pose that showed it.
    assert.ok(/cross\( normal, railSlot\.xyz \)/.test(RAIL_GLSL_TEXT.vertex) && /vec2 arenaSide = vec2\( - arenaRun\.y, arenaRun\.x \) \/ arenaRunLen;/.test(RAIL_GLSL_TEXT.vertex) && /float arenaLen = abs\( arenaSigned \);/.test(RAIL_GLSL_TEXT.vertex), 'the width is taken across the run');
    const { s } = built.base ?? built['base:nolight'];
    s.group.updateMatrixWorld(true);
    const VW = 1280, VH = 720, RAD = RAIL.filterPx, railTop = planBoards().top;
    const P = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3(), lin = new THREE.Matrix3(), q = new THREE.Vector4();
    const cam = new THREE.PerspectiveCamera(50, VW / VH, 0.05, 80), mvp = new THREE.Matrix4();
    const ndc = (p) => { q.set(p.x, p.y, p.z, 1).applyMatrix4(mvp); return q.w > 0 ? [q.x / q.w, q.y / q.w] : null; };
    const px = (a, b) => [(a[0] - b[0]) * 0.5 * VW, (a[1] - b[1]) * 0.5 * VH];
    // one vertex of the text: its place after the widening (NDC) and the factor it hands to the fragment
    const widen = (p, slot, normal) => {
      const here = ndc(p), other = ndc(p.clone().add(slot)), next = ndc(p.clone().add(new THREE.Vector3().crossVectors(normal, slot)));
      if (!here || !other || !next) return null;
      const run = px(next, here), runLen = Math.hypot(run[0], run[1]);
      if (!(runLen > 1e-5)) return null;
      const side = [-run[1] / runLen, run[0] / runLen], span = px(here, other);
      const signed = span[0] * side[0] + span[1] * side[1], len = Math.abs(signed), across = Math.hypot(span[0], span[1]);
      // (round A5: every edge moves out by the filter's radius; the varying is the slit's true width in pixels)
      const k = (signed < 0 ? -1 : 1) * 2 * RAD;
      return { at: [here[0] + side[0] * k / VW, here[1] + side[1] * k / VH], width: len, len, across, side };
    };
    // the fragment's coverage, mirrored (RAIL_GLSL.fragment arenaCover): a pixel `d` pixels from the slit's middle line
    const cover = (d, w) => tentCover(d, w, RAD);
    assert.ok(Math.abs(tentCover(0, 0.72, 1) - 0.5904) < 1e-3 && Math.abs(tentCover(0.5, 0.72, 1) - 0.36) < 1e-3 && tentCover(1.4, 0.72, 1) === 0 && Math.abs(tentCover(0, 5, 1) - 1) < 1e-12, 'the tent\'s integral over a line');
    // the radius chosen (levels.js RAIL.filterPx): a line of 0.72 px (V1) leaves its brightest pixel between 0.27 and
    // 0.33 of its light whether its middle lies on a pixel's centre or between two (radius 1: 0.36 to 0.59: on a
    // filmic shoulder that swing is the bead)
    assert.ok(cover(0, 0.72) / cover(0.5, 0.72) < 1.25 && tentCover(0, 0.72, 1) / tentCover(0.5, 0.72, 1) > 1.6, `the brightest pixel's swing along the line: ${(cover(0, 0.72) / cover(0.5, 0.72)).toFixed(2)}`);
    let thin = 0, missedByLength = 0;
    // Round A4: the opening lies on a 45 degree chamfer, which no review pose sees edge-on any more. The case of round
    // A3's first frames is kept by one pose of this arm's own: an eye 0.2 m over the floor, 0.8 m in front of the north
    // boards (a degree or two over the chamfer's plane), looking along the rail
    const GRAZE = { id: 'graze', cam: [0, 0.175 - ARENA.camera.bedH, ARENA.island.z0 + 0.8], target: [3, 0.94 - ARENA.camera.bedH, ARENA.island.z0], fov: 40 };
    for (const view of [...VIEWS, GRAZE]) {
      const lookY = view.target[1] - view.cam[1];
      cam.fov = view.fov; cam.updateProjectionMatrix();
      for (const m of meshesOf(s.group).filter((x) => x.material.name === 'arena.surround.emissive')) {
        const pos = m.geometry.getAttribute('position'), slot = m.geometry.getAttribute('railSlot'), nor = m.geometry.getAttribute('normal');
        lin.setFromMatrix4(m.matrixWorld);
        for (let i = 0; i < pos.count; i += 1) {
          if (slot.getW(i) !== 0) continue;
          P.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
          S.set(slot.getX(i), slot.getY(i), slot.getZ(i)).applyMatrix3(lin);
          N.fromBufferAttribute(nor, i).applyMatrix3(lin).normalize();
          // the pose, in the opening's own frame: the review camera's height over the rail's top, its plan place and aim
          cam.position.set(view.cam[0], P.y + view.cam[1] + ARENA.camera.bedH - railTop, view.cam[2]);
          cam.lookAt(view.target[0], cam.position.y + lookY, view.target[2]);
          cam.updateMatrixWorld(true);
          mvp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
          const a = widen(P, S, N), b = widen(P.clone().add(S), S.clone().negate(), N);
          if (!a || !b) continue;
          if (Math.abs(a.at[0]) > 1.2 || Math.abs(a.at[1]) > 1.2) continue;   // off the frame
          // the drawn quad: the slit's own width across the line plus the filter's radius on either side, at EVERY opening
          const d = px(a.at, b.at), w = Math.abs(d[0] * a.side[0] + d[1] * a.side[1]);
          assert.ok(Math.abs(w - (a.len + 2 * RAD)) < 0.08, `${view.id} ${m.name} vertex ${i}: ${w.toFixed(3)} px across after the widening (the slit: ${a.len.toFixed(3)})`);
          assert.ok(Math.abs(a.width - b.width) < 0.03, `${view.id}: the two edges hand on different widths (${a.width.toFixed(3)} / ${b.width.toFixed(3)})`);
          // THE LAW OF THE RASTER: wherever the slit's middle lies on the pixel grid, the pixel rows of a column gather
          // its width exactly (the energy on screen does not swing as the line crosses rows: no beads), every pixel
          // that gathers anything lies inside the drawn quad, and no pixel holds more than the slit's whole light
          for (const c of [0, 0.13, 0.25, 0.5, 0.77]) {
            let sum = 0, most = 0;
            for (let row = -4; row <= 4; row++) { const v = cover(row - c, a.len); sum += v; most = Math.max(most, v); if (v > 0) assert.ok(Math.abs(row - c) <= a.len / 2 + RAD + 1e-9, 'a lit pixel outside the drawn quad'); }
            assert.ok(Math.abs(sum - a.len) < 1e-9 && most <= Math.min(1, a.len) + 1e-12, `${view.id}: a column gathers ${sum.toFixed(4)} of a slit ${a.len.toFixed(4)} px wide`);
          }
          if (a.len < 1.5) {
            thin += 1;
            // (round A3's failing case: the across vector's screen length says "wide enough" where the line is not. With
            // round A4's narrower slot the vector is under the least width at most poses; the case kept here is its kind:
            // a screen length at least one and a half times the width across the line)
            if (a.across > 1.5 * a.len) missedByLength += 1;
          }
        }
      }
    }
    assert.ok(thin > 50, `only ${thin} thin openings in the review poses: the widening is not exercised`);
    console.log(`   (${thin} thin openings, ${missedByLength} of them with an across vector over one and a half times the line's width on screen)`);
    assert.ok(missedByLength > 4, `${missedByLength}: the case of round A3's first app frames (an across vector whose screen length is well over the line's width) is not in this arm`);
  });

  {
    const q = (text, rail = null) => ({ get: (k) => (k === 'clubsurround' ? text : k === 'clubrail' ? rail : null) });
    const ALL = { rail: true, slot: true, wash: true, steps: true, shadow: true, seats: true, real: true, vary: true, sheen: true, tilt: true, emitters: true, score: true, card: LEVELS.CARD_FORM.on, boards: BOARDS.default, seatColor: SEATS.default };
    // round A6: `card:1` | `card:0`: the row cards shaded as the seat they stand for, or painted as rounds A1 to A5 had them
    assert.deepEqual(readLook(q('card:1')), { ...ALL, card: true }); assert.deepEqual(readLook(q('card:0')), { ...ALL, card: false }); assert.deepEqual(readLook(q('card:2,card')), ALL);
    // round A5: the seats' switch also takes a fabric colour's name (levels.js SEATS); `seats:0` still takes the seats away
    for (const kind of SEATS.kinds) assert.deepEqual(readLook(q(`seats:${kind}`)), { ...ALL, seatColor: kind });
    assert.deepEqual(readLook(q('seats:garnet,seats:red,seatColor:0')), ALL, 'an unknown seat colour');
    assert.deepEqual(readLook(q('seats:ochre,seats:0')), { ...ALL, seatColor: 'ochre', seats: false });
    assert.deepEqual(readLook(q('rail:0,seats:off,bogus:0,cutoff:0,streak:0,core:0')), { ...ALL, rail: false, seats: false }, 'round A2\'s view switches are unknown keys now');
    assert.deepEqual(readLook(null), ALL);
    // the boards' switch takes a kind's name and nothing else
    assert.deepEqual(readLook(q('boards:print')), { ...ALL, boards: 'print' }); assert.deepEqual(readLook(q('boards:led')), { ...ALL, boards: 'led' });
    assert.deepEqual(readLook(q('boards:0,boards:neon,boards')), ALL, 'an unknown kind of board');
    assert.deepEqual(readRail(null), { level: RAIL.face.level, power: RAIL.face.power, wash: null, filterpx: RAIL.filterPx, led: BOARD_LED.gain, tool: false });
    assert.deepEqual(readRail(q('', 'level:12,power:x,bogus:3,wash:0.94,sin0:0.1')), { level: 12, power: RAIL.face.power, wash: 0.94, filterpx: RAIL.filterPx, led: BOARD_LED.gain, tool: true });
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
    const off = await buildSurround({ tier: 'base', knobs: TIERS.base, ctx: { query: q('rail:0,wash:0,shadow:0,seats:0,steps:0,score:0,boards:print') } }, args(roomLight));
    const c = off.counts();
    // (rail:0 leaves the extrusion and takes its lit opening away: with the step lights off too, and printed boards, no emissive mesh is left)
    assert.ok(c.enabled && c.railSegments === 24 && c.cards === 0 && c.stepLights === 0 && !c.byMaterial['arena.surround.emissive'] && !c.byMaterial['arena.surround.contactshadow'] && !c.byMaterial['arena.surround.scoreboard'], JSON.stringify(c.byMaterial));
    assert.deepEqual(c.emitters, [], 'no wash, no scoreboard: nothing registered');
    assert.ok(/\|seats:0\|shadow:0(\|boards:print)?$/.test(off.signature()), off.signature());
    // THE PAIR'S TWO ARMS (CONTRACT 16.3): the same tree builds LED panels and a front-lit print. A print: a lit face
    // material on every side (`volume: false`: it stays on the analytic light), no LED face, a nose of 160 mm with the
    // wash looking straight down; LED panels: no lit face material (four draw calls fewer), the faces in the emissive
    // batch, the wash turned toward the floor. Each has its own signature (the default kind's carries no suffix)
    for (const kind of BOARDS.kinds) {
      roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
      const b = await buildSurround({ tier: 'base', knobs: TIERS.base, ctx: { query: q(`boards:${kind}`) } }, args(roomLight));
      const bc = b.counts(), bs = b.state(), faces = meshesOf(b.group).filter((m) => m.material.name === 'arena.surround.board');
      assert.ok(bc.enabled && bs.boards.kind === kind && bs.boards.cap.nose === capOf(kind).nose, `${kind}: built`);
      assert.equal(faces.length, kind === 'print' ? 4 : 0, `${kind}: lit face meshes`);
      assert.equal(bc.ledPanels, kind === 'led' ? 24 : 0, `${kind}: LED panels`);
      assert.equal(/\|boards:/.test(b.signature()), kind !== BOARDS.default, `${kind}: ${b.signature()}`);
      if (roomLight && kind === 'print') assert.ok(!/vol/.test(faces[0].material.userData.clubRoom ?? ''), 'the printed face is on the analytic light');
      const wash = bs.emitterTable.find((e) => e.id === 'arena.boardwash.north');
      assert.ok(Math.abs(wash.intensity / wash.size[0] - capOf(kind).perMetre) < 1e-3 && (kind === 'print' ? wash.normal[1] === -1 : wash.normal[2] > 0.5), `${kind}: the wash ${wash.intensity}, normal ${wash.normal}`);
      // the cap's nose as built: the furthest metal vertex inside the board line
      let reach = 0;
      for (const m of meshesOf(b.group).filter((x) => /metal\.north$/.test(x.name) || /deck\.north$/.test(x.name))) { const ps = m.geometry.getAttribute('position'); for (let i = 0; i < ps.count; i++) if (ps.getY(i) - FLOOR > 0.85 && ps.getY(i) - FLOOR < 0.91) reach = Math.max(reach, ps.getZ(i) - ARENA.island.z0); }
      assert.ok(Math.abs(reach - (ARENA.boards.thickness / 2 + capOf(kind).nose)) < 0.006, `${kind}: the cap reaches ${reach.toFixed(3)} m inside the board line`);
      b.dispose();
    }
    // the wash's pair: wash:0 withdraws the four washes and nothing else; the rail's opening does not depend on it
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
    const noWash = await buildSurround({ tier: 'base', knobs: TIERS.base, ctx: { query: q('wash:0') } }, args(roomLight));
    assert.deepEqual(noWash.counts().emitters, ['arena.scoreboard']); assert.ok(noWash.counts().byMaterial['arena.surround.emissive'] > 0);
    // slot:0, the proof arm: the profile's recess as real triangles (a body, two lips, the opal face 2 mm down with the
    // emission law alone, two lit inner walls): more triangles, the same emitters, the same level
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
    const meshSlot = await buildSurround({ tier: 'base', knobs: TIERS.base, ctx: { query: q('slot:0') } }, args(roomLight));
    {
      const em = meshesOf(meshSlot.group).filter((m) => m.material.name === 'arena.surround.emissive');
      let bare = 0, lowest = 9;
      for (const m of em) { const sl = m.geometry.getAttribute('railSlot'), ps = m.geometry.getAttribute('position'); for (let i = 0; i < sl.count; i++) { assert.ok(sl.getW(i) !== 0 && sl.getW(i) !== 1, 'slot:0 still draws the opening as one quad'); if (sl.getW(i) === 2) { bare += 1; lowest = Math.min(lowest, ps.getY(i)); } } }
      // (the opal's lower edge: the slope's middle line, half a slot down the slope, the recess down the slope's normal)
      const PS0 = profileSection(), PF0 = BOARD.profile;
      const lowWant = FLOOR + ARENA.boards.height + PS0.yMid - (PF0.slot / 2) * Math.sin(PS0.tilt) - PF0.recess * Math.cos(PS0.tilt);
      assert.ok(bare === 24 * 4 && Math.abs(lowest - lowWant) < 1e-6, `slot:0: ${bare} vertices of bare opal faces, ${BOARD.profile.recess} m under the lips (lowest ${lowest}, expected ${lowWant})`);
      assert.ok(meshSlot.counts().triangles > (built.base ?? built['base:nolight']).s.counts().triangles, 'the mesh variant has more triangles');
    }
    // the pairs' other arms on the high tier: cards instead of real seats; every seat alike; a tool level for the rail's tube
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'high', knobs: TIERS.high } });
    const cards = await buildSurround({ tier: 'high', knobs: TIERS.high, ctx: { query: q('real:0') } }, args(roomLight));
    assert.ok(cards.counts().realSeats === 0 && cards.counts().cards === 48 && /\|real:0$/.test(cards.signature()), 'real:0 gives cards on the high tier');
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'high', knobs: TIERS.high } });
    const alike = await buildSurround({ tier: 'high', knobs: TIERS.high, ctx: { query: q('vary:0,sheen:0', `wash:${2 * capOf().perMetre}`) } }, args(roomLight));
    assert.ok(alike.counts().realSeats === 384 && alike.counts().openSeats === 0);
    if (roomLight) assert.ok(Math.abs(alike.state().emitterTable.find((e) => e.id === 'arena.boardwash.north').intensity - 2 * planEmitters(ARENA, 2)[0].intensity) < 1e-6, 'the tool\'s wash level is what is registered and reported');
    // a tier switch builds the other level once and swaps the emitters
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
    const sw = await buildSurround({ tier: 'base', knobs: TIERS.base }, args(roomLight));
    const sig1 = sw.signature();
    assert.ok(/^surround-[0-9a-f]{8}\|seats:1\|shadow:1$/.test(sig1), sig1);
    assert.equal(sw.setTier('lite'), true); assert.equal(sw.counts().detail, 0); assert.equal(sw.counts().emitters.length, 4);
    assert.notEqual(sw.signature(), sig1, 'another detail level is another geometry');
    if (roomLight) assert.equal(roomLight.state().ids.filter((id) => id.startsWith('arena.')).length, 4, 'the lite level withdraws the scoreboard\'s emitter');
    assert.equal(sw.setTier('base'), true); assert.equal(sw.signature(), sig1, 'the signature is stable across a tier round trip');
    if (roomLight) assert.equal(roomLight.state().ids.filter((id) => id.startsWith('arena.')).length, 5);
    assert.equal(sw.setTier('high'), true); assert.equal(sw.counts().detail, 2); assert.equal(sw.counts().levelsBuilt, 3); assert.equal(sw.counts().realSeats, 384);
    assert.equal(sw.setTier('nonsense'), false);
    assert.equal(meshesOf(sw.group).length, sw.counts().drawCalls, 'only the shown level is drawn');
    sw.dispose();
    if (roomLight) assert.equal(roomLight.state().ids.filter((id) => id.startsWith('arena.')).length, 0, 'dispose withdraws the emitters');
    // an asset service: the fabric's normal map is asked for by the assets role's id with the stand-in as its fallback, and only on the high tier
    const asked = [];
    const assets = { texture(id, o) { asked.push([id, !!o?.fallback, o?.srgb]); return o.fallback; } };
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'high', knobs: TIERS.high } });
    await buildSurround({ tier: 'high', knobs: TIERS.high, assets }, args(roomLight));
    assert.deepEqual(asked, [['arena.seat.normal', true, false]]);
    asked.length = 0;
    roomLight?.reset?.(); roomLight?.init?.({ club: { tier: 'base', knobs: TIERS.base } });
    await buildSurround({ tier: 'base', knobs: TIERS.base, assets }, args(roomLight));
    assert.deepEqual(asked, [], 'the base tier asks for no asset');
    // a service that throws leaves an empty group and a reason
    const broken = await buildSurround({ tier: 'base', knobs: TIERS.base }, { ...args(null), roomLight: { material() { throw new Error('boom'); }, emissive() { throw new Error('boom'); }, addEmitter() {} } });
    assert.equal(broken.counts().enabled, false);
    assert.ok(/boom/.test(broken.counts().reason) && broken.group.children.length === 0 && broken.emissives.length === 0 && broken.state().enabled === false);
    // no arguments at all
    const bare = await buildSurround(null);
    assert.equal(bare.counts().enabled, true);
    ok('build: the tool switches and numbers, the pairs\' other arms, a tier switch, dispose, an asset service, a throwing service and no arguments: never a throw', () => {});
  }

  // ROUND A7 (CONTRACT 19.1, 19.3): three steps, each behind one `on` of levels.js and a tool switch of readSteps:
  // the row's light for a card without an emitter loop (CARD_ROW), the pile (NAP), the metal by the hall's reflection
  // (METAL_HALL). Every check holds with a step dark and with it switched in.
  {
    const { readSteps, cardGlsl, napGlsl, rowLightAt, makeRowTable } = SURROUND, { CARD_ROW, NAP, METAL_HALL } = LEVELS;
    const q = (text) => ({ get: (k) => (k === 'clubsurround' ? text : null) });
    const DEF = { row: CARD_ROW.on, nap: NAP.on, hall: METAL_HALL.on, frames: METAL_HALL.frames, ...('roll' in readSteps(null) ? { roll: LEVELS.CARD_ROLL.on } : {}), ...('rhythm' in readSteps(null) ? { rhythm: LEVELS.NAP.seats } : {}) };
    assert.deepEqual(readSteps(null), DEF); assert.deepEqual(readSteps(q('row:1,nap:1,hall:1,frames:black')), { ...DEF, row: true, nap: true, hall: true, frames: 'black' });
    assert.deepEqual(readSteps(q('row:0,nap:off,hall:0,frames:gold,bogus:1,row')), { ...DEF, row: false, nap: false, hall: false }, 'an unknown frame swatch, an unknown key');
    assert.deepEqual(readLook(q('row:1,nap:1,hall:1,frames:alu')), readLook(null), 'the steps are no keys of the look');
    // the shipped card text without a step is round A6's: no table, no pile, no vertex text
    const plain = cardGlsl(), both = cardGlsl(undefined, undefined, false, { row: true, nap: true, cards: 48 });
    assert.ok(!/uArenaRow|arenaNapField|vArenaRowUV/.test([plain.fragmentPars, plain.form, plain.sheen, plain.lobes].join('\n')) && plain.row === '' && plain.vertexPars === '' && plain.vertex === '', 'a step\'s text in the plain card');
    // the row's light: read from the table, handed to three's direct-light law; the eye enters as a DIRECTION only
    const rowText = [both.fragmentPars, both.form, both.row, both.vertexPars, both.vertex].join('\n');
    assert.ok(/RE_Direct\( arenaRowLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, arenaRowRL \)/.test(both.row) && /reflectedLight\.directSpecular \+= arenaRowRL\.directSpecular;/.test(both.row) && !/\.directDiffuse/.test(both.row), 'the row\'s light feeds the lobes, never the direct diffuse term (the bake has that)');
    assert.ok(!/cameraPosition|modelMatrix|gl_FragCoord|vWorldPosition/.test(rowText) && rowText.replace('transformDirection( texture2D( uArenaRow, vArenaRowUV ).xyz, viewMatrix )', '').indexOf('viewMatrix') < 0, 'the row text reads a camera\'s place');
    // the baked light is split, not counted twice: what the row's light holds at this normal is taken out of the part that keeps round A6's two terms
    assert.ok(both.sheen === '' && /vec3 arenaRest = max\( irradiance - arenaRowE \* saturate\( dot\( normal, arenaRowL \) \), vec3\( 0\.0 \) \);/.test(both.row) && (both.row.match(/arenaRest \*/g) ?? []).length === 2 && !/irradiance \* uArenaCard/.test(both.row), 'the row\'s light and the rest of the baked light');
    assert.ok(!/\+\s*vec3\s*\(\s*[0-9.]+\s*\)/.test(both.row) && /texture2D\( uArenaRow/.test(both.row), 'the row\'s light is the table\'s: no constant light');
    // the light vector: exact for one source, blind to an even ambient, null in an even field
    {
      const L0 = [0.36, 0.8, -0.48], E0 = [2, 1.5, 1], amb = [0.3, 0.3, 0.4];
      const one = (p, n) => { const c = Math.max(0, n[0] * L0[0] + n[1] * L0[1] + n[2] * L0[2]); return E0.map((e, k) => e * c + amb[k]); };
      const r = rowLightAt(one, [0, 0, 0]);
      assert.ok(r && r.L.every((v, k) => Math.abs(v - L0[k]) < 1e-9) && r.E.every((v, k) => Math.abs(v - E0[k]) < 1e-9), `one source: ${JSON.stringify(r)}`);
      assert.equal(rowLightAt(() => [1, 1, 1], [0, 0, 0]), null, 'an even field has no light vector');
      // the table: two lines per card, `samples` wide, filled once per serial of the room light
      let serial = 3, calls = 0;
      const cardsAt = [{ bl: [0, 0, 0], br: [4, 0, 0], tl: [0, 1, 0], tr: [4, 1, 0] }, { bl: [0, 0, 2], br: [4, 0, 2], tl: [0, 1, 2], tr: [4, 1, 2] }];
      const seenAt = [];
      const t = makeRowTable(8, cardsAt, (p, n) => { calls += 1; if (n[1] === 1) seenAt.push(p); return one(p, n); }, () => serial);
      assert.ok(t.texture.isDataTexture && t.texture.image.width === 8 && t.texture.image.height === 4 && t.bytes === 8 * 4 * 4 * 2 && t.texture.type === THREE.HalfFloatType && t.texture.magFilter === THREE.LinearFilter && t.texture.generateMipmaps === false);
      assert.equal(calls, 2 * 8 * 6, 'six axis reads per sample');
      assert.ok(seenAt.every((p) => Math.abs(p[1] - CARD_ROW.at) < 1e-9) && Math.abs(seenAt[0][0]) < 1e-9 && Math.abs(seenAt[7][0] - 4) < 1e-9, 'the samples lie at the pad\'s height, from one end of the card to the other');
      const un = (i) => THREE.DataUtils.fromHalfFloat(t.data[i]);
      assert.ok(Math.abs(un(0) - L0[0]) < 2e-3 && Math.abs(un(1) - L0[1]) < 2e-3 && Math.abs(un(2) - L0[2]) < 2e-3 && Math.abs(un(4 * 8) - E0[0]) < 2e-3 && Math.abs(un(4 * 8 + 2) - E0[2]) < 2e-3, 'line 0 the direction, line 1 the irradiance');
      assert.equal(t.sync(), false, 'the same serial: nothing is read again'); assert.equal(calls, 96);
      serial = 4; assert.equal(t.sync(), true); assert.equal(calls, 192); assert.deepEqual(t.state(), { samples: 8, cards: 2, serial: 4, filled: 2, lit: 16 });
    }
    // the pile's text: a band limit on each octave, a lean projected on the surface, no camera place, no screen place
    {
      const G = napGlsl(), text = [G.vertexPars, G.vertex, G.fragmentPars, G.lean, G.tone, G.lobe].join('\n');
      assert.ok(!/cameraPosition|viewMatrix|modelMatrix|gl_FragCoord|vWorldPosition/.test(text), 'the pile reads a camera\'s place or a screen place');
      assert.equal((G.field.match(/smoothstep\( 0\.3, 0\.6, max\( fwidth\(/g) ?? []).length, 2, 'each octave is band-limited by its own screen derivative');
      assert.ok(/vArenaNap - normal \* dot\( normal, vArenaNap \)/.test(G.lean) && /normalMatrix \* \( mat3\( instanceMatrix \) \* arenaNap\.xyz \)/.test(G.vertex), 'the lean is a vector of the surface, turned with the seat');
      assert.ok(NAP.lean > 0.03 && NAP.lean <= 0.2 && NAP.spread > 0 && NAP.spread < 1 && NAP.cells[0] > 2 * NAP.cells[1] && NAP.gain[0] + NAP.gain[1] <= 1 && NAP.wear > 0 && NAP.wear <= 0.15 && NAP.wearSheen <= 1, 'the pile\'s numbers');
      // the roll's wear moves the fabric's mean albedo by under one per cent (the albedo law)
      assert.ok(NAP.wear * 0.65 * 0.03 < 0.01);
      const seats = planSeats();
      for (const s of seats) assert.ok(s.napA >= 0 && s.napA < 2 * Math.PI + 1e-3 && Math.abs(s.napM - 1) <= NAP.spread + 1e-9 && s.wear >= 0.3 - 1e-9 && s.wear <= 1 + 1e-9, `seat ${s.block} ${s.row} ${s.index}: its pile`);
      // no row carries a brushing of its own: the mean lean vector of every row is short
      for (let r = 0; r < 8; r++) { const row = seats.filter((x) => x.row === r), mx = row.reduce((a, x) => a + Math.cos(x.napA) * x.napM, 0) / row.length, my = row.reduce((a, x) => a + Math.sin(x.napA) * x.napM, 0) / row.length; assert.ok(Math.hypot(mx, my) < 0.35, `row ${r}: a common lean ${Math.hypot(mx, my).toFixed(2)}`); }
    }
    // built: lite with the row's light, base and high with the pile, the metal with a stand-in handle
    const hall = { source: 'stand-in', enabled: true, calls: [], apply(m, o) { this.calls.push([m.name, o.share, o.keep]); return true; } };
    for (const tier of ['lite', 'base', 'high']) {
      if (!roomLight) break;
      roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } });
      roomLight.addEmitter?.({ id: 'test.flood', type: 'point', position: new THREE.Vector3(0, 6, -2), color: new THREE.Color(1, 0.8, 0.6), intensity: 80, radius: 30 });
      const s = await buildSurround({ tier, knobs: TIERS[tier], ctx: { query: q('row:1,nap:1,hall:1') }, env: { hall } }, args(roomLight));
      const st = s.state(), c = s.counts(), meshes = meshesOf(s.group);
      assert.ok(c.enabled && st.steps.row && st.steps.nap && st.steps.hall, `${tier}: built with the steps on`);
      const card = meshes.find((m) => m.material.name === 'arena.surround.seats'), metal = meshes.find((m) => m.material.name === 'arena.surround.metal');
      if (tier === 'lite') {
        // the card is the fabric's physical material; its table holds a light at every sample; one more small texture
        assert.ok(card.material.isMeshPhysicalMaterial && card.material.roughness === SURFACE.fabric.roughness && card.material.sheen === SURFACE.fabric.sheen && /\|row\|nap$/.test(card.material.customProgramCacheKey()), `lite: ${card.material.customProgramCacheKey()}`);
        assert.deepEqual({ samples: st.rowTable.samples, cards: st.rowTable.cards, lit: st.rowTable.lit }, { samples: CARD_ROW.samples, cards: 48, lit: 48 * CARD_ROW.samples });
        const tex = c.textures.find((t) => t.name === 'arena.surround.rowlight');
        assert.ok(tex && tex.bytes === CARD_ROW.samples * 96 * 8 && c.textureBytes <= 2.0e6, `lite: the row table ${tex?.bytes} bytes, ${c.textureBytes} in all`);
        assert.equal(metal, undefined, 'lite has no metal batch'); assert.equal(st.hall.asked, false);
      } else {
        assert.equal(st.rowTable, null, `${tier}: a row table beside an emitter loop`);
        assert.ok(metal.material.metalness === 1 && metal.material.roughness === SURFACE.metal.roughness && metal.material.envMapIntensity === 0 && metal.material.userData.clubHall.share === 1 && metal.material.userData.clubHall.keep === 0 && st.hall.tagged === true && st.hall.enabled === true && st.hall.source === 'stand-in', `${tier}: the metal`);
      }
      if (tier !== 'high') {
        // every card vertex knows its place in the table: x on a texel centre of one end, y its card's line
        const cardsSeen = new Set();
        for (const m of meshes.filter((x) => x.material.name === 'arena.surround.seats')) {
          const a = m.geometry.getAttribute('arenaRowUV'); assert.ok(a && a.count === m.geometry.getAttribute('position').count, `${tier} ${m.name}: arenaRowUV per vertex`);
          for (let i = 0; i < a.count; i++) { const x = a.getX(i) * CARD_ROW.samples, y = a.getY(i) * 96; assert.ok((Math.abs(x - 0.5) < 1e-4 || Math.abs(x - (CARD_ROW.samples - 0.5)) < 1e-4) && Math.abs(y - Math.floor(y) - 0.5) < 1e-4 && Math.floor(y) % 2 === 0, `${tier}: a vertex at ${x}, ${y}`); cardsSeen.add(Math.floor(y) / 2); }
        }
        assert.equal(cardsSeen.size, 48, `${tier}: ${cardsSeen.size} cards in the table`);
        assert.ok(/\|nap$/.test(card.material.customProgramCacheKey()), `${tier}: the card carries the pile's rhythm`);
      } else {
        const backs = meshes.find((m) => m.name === 'arena.surround.seatback'), cushions = meshes.find((m) => m.name === 'arena.surround.seatcushion'), seats = planSeats();
        assert.ok(backs.material.userData.arenaNap === true && /\|arena-nap-v1$/.test(backs.material.customProgramCacheKey()));
        const nb = backs.geometry.getAttribute('arenaNap'), nc = cushions.geometry.getAttribute('arenaNap'), wb = backs.geometry.getAttribute('arenaWear'), wc = cushions.geometry.getAttribute('arenaWear');
        assert.ok(nb.isInstancedBufferAttribute && nc.isInstancedBufferAttribute && nb.count === 384 && nc.count === 384 && wb.count === 384 && wc.count === 384);
        seats.forEach((seat, i) => {
          const len = Math.hypot(nb.getX(i), nb.getY(i));
          assert.ok(nb.getZ(i) === 0 && nc.getY(i) === 0 && Math.abs(len - NAP.lean * seat.napM) < 1e-6 && Math.abs(Math.hypot(nc.getX(i), nc.getZ(i)) - len) < 1e-6 && nb.getW(i) >= 0 && nb.getW(i) < 1.001, `seat ${i}: its lean lies in the pad's plane`);
          assert.ok(wb.getX(i) === 0 && Math.abs(wc.getX(i) - seat.wear) < 1e-6, `seat ${i}: the wear is the cushion's`);
        });
      }
      s.dispose();
    }
    if (roomLight) {
      assert.deepEqual(hall.calls, [], 'the handle is never CALLED at build (the room is built before the service): the metal alone carries the tag, all of the hall and none of the table\'s cube');
      // without the service, or with one that is off or throws: the metal is built and tagged, nothing is thrown, no second stand-in
      for (const env of [undefined, { hall: { enabled: false, source: null } }, { hall: { get source() { throw new Error('boom'); }, get enabled() { throw new Error('boom'); } } }]) {
        roomLight.reset?.(); roomLight.init?.({ club: { tier: 'base', knobs: TIERS.base } });
        const s = await buildSurround({ tier: 'base', knobs: TIERS.base, ctx: { query: q('hall:1') }, env }, args(roomLight));
        const metal = meshesOf(s.group).find((m) => m.material.name === 'arena.surround.metal');
        assert.ok(s.counts().enabled && s.state().hall.asked && s.state().hall.tagged === true && s.state().hall.enabled !== true && s.state().hall.source === null && metal.material.userData.clubHall.share === 1 && metal.material.metalness === 1 && metal.material.envMapIntensity === 0, 'the metal without the service');
        s.dispose();
      }
      // `vary:0`: every pile alike (no lean, no wear); `hall:0`, `nap:0`, `row:0`: round A6's materials
      roomLight.reset?.(); roomLight.init?.({ club: { tier: 'high', knobs: TIERS.high } });
      const alike = await buildSurround({ tier: 'high', knobs: TIERS.high, ctx: { query: q('nap:1,vary:0') } }, args(roomLight));
      const nb = meshesOf(alike.group).find((m) => m.name === 'arena.surround.seatback').geometry.getAttribute('arenaNap');
      for (let i = 0; i < nb.count; i++) assert.ok(nb.getX(i) === 0 && nb.getY(i) === 0, 'vary:0 leaves a lean');
      alike.dispose();
      roomLight.reset?.(); roomLight.init?.({ club: { tier: 'high', knobs: TIERS.high } });
      const offs = await buildSurround({ tier: 'high', knobs: TIERS.high, ctx: { query: q('row:0,nap:0,hall:0') }, env: { hall } }, args(roomLight));
      const om = meshesOf(offs.group), ometal = om.find((m) => m.material.name === 'arena.surround.metal'), oback = om.find((m) => m.name === 'arena.surround.seatback');
      assert.ok(ometal.material.metalness === SURFACE.metal.metalness && ometal.material.envMapIntensity === SURFACE.metal.env && !oback.material.userData.arenaNap && !oback.geometry.getAttribute('arenaNap') && !ometal.material.userData.clubHall && offs.state().hall.tagged === false && hall.calls.length === 0, 'the steps off: round A6\'s materials, no tag');
      offs.dispose();
    }
    // round A8: round A7's level per row (a seat table from the bake, `setSeatLevels`, K) is DELETED: a row's level is
    // the same on a card and on a real seat, so it could not close their difference, and no bake ever held its table
    {
      const high = await buildSurround({ tier: 'high', knobs: TIERS.high }, args(roomLight)), text = SOURCES.map(src).join('\n');
      assert.ok(!('levels' in readSteps(null)) && !('setSeatLevels' in high) && !('seatProbes' in high.api) && !('seatLevels' in high.state()) && !/SEAT_LEVELS|seatProbes|arenaSeatK|uArenaSeatK/.test(text), 'no part of the seat-level path is left');
      high.dispose();
      ok('round A8: the seat-level path of round A7 is gone (no switch, no table, no attribute, no hand-over)', () => {});
    }
    // THE SEATS' OWN RHYTHM ON THE CARDS (levels.js NAP.seats): a card seat's tone, lean and wear are the plan's seat's
    if (typeof SURROUND.makeSeatTable === 'function' && 'seats' in NAP) {
      const { makeSeatTable, SEAT_TABLE } = SURROUND;
      assert.deepEqual(readSteps(q('rhythm:1')), { ...DEF, rhythm: true }); assert.deepEqual(readSteps(q('rhythm:0')), { ...DEF, rhythm: false });
      // the table: plain at first; a record comes back as written, to the 8-bit step; a bad record is a plain seat
      const st = makeSeatTable(2);
      assert.ok(st.texture.image.width === SEAT_TABLE.w && st.texture.image.height === 2 && st.bytes === SEAT_TABLE.w * 2 * 4 && st.texture.magFilter === THREE.NearestFilter && st.texture.minFilter === THREE.NearestFilter, 'the seats\' table: 8-bit, nearest');
      for (let j = 0; j < SEAT_TABLE.w; j++) { const r = st.read(1, j); assert.ok(Math.abs(r[0] - 1) < 0.002 && Math.abs(r[1]) < 0.002 && Math.abs(r[2]) < 0.002 && r[3] === 0, `a plain seat reads ${r}`); }
      st.fill((c, j) => (c === 1 && j === 5 ? [1.068, -0.2, 0.137, 0.3] : c === 1 && j === 6 ? [NaN, 0, 0, 0] : c === 0 && j === 2 ? 'x' : null));
      { const r = st.read(1, 5); assert.ok(Math.abs(r[0] - 1.068) < 0.001 && Math.abs(r[1] + 0.2) < 0.002 && Math.abs(r[2] - 0.137) < 0.002 && Math.abs(r[3] - 0.3) < 0.003, `a record reads ${r}`); }
      for (const [c, j] of [[1, 6], [0, 2], [0, 5]]) { const r = st.read(c, j); assert.ok(Math.abs(r[0] - 1) < 0.002 && Math.abs(r[1]) < 0.002 && r[3] === 0); }
      // the range holds every seat of the plan: tone 1 +- vary, lean up to NAP.lean x (1 + spread)
      assert.ok(SEAT_TABLE.tone[0] <= 1 - SEAT_COLOR.vary && SEAT_TABLE.tone[0] + SEAT_TABLE.tone[1] >= 1 + SEAT_COLOR.vary && SEAT_TABLE.lean / 2 >= NAP.lean * (1 + NAP.spread), 'the table\'s ranges hold the plan\'s seats');
      // the text: the record is read at the seat's tile, the paint's own tile wear is taken out, no camera's place
      const tx = cardGlsl(undefined, undefined, false, { nap: true, seats: true, cards: 48 }), plainNap = cardGlsl(undefined, undefined, false, { nap: true, cards: 48 });
      assert.ok(/uniform sampler2D uArenaSeatR;/.test(tx.fragmentPars) && /texture2D\( uArenaSeatR, vec2\( \( arenaTile \+ 0\.5 \) \/ 16\.00000, vArenaRowUV\.y \+ [0-9.]+ \) \)/.test(tx.form) && /\/ arenaPaint, arenaCardCloth \)/.test(tx.form) && !/uArenaSeatR/.test(plainNap.form + plainNap.fragmentPars) && !/cameraPosition|viewMatrix|modelMatrix|gl_FragCoord/.test(tx.form), 'the seats\' record in the card\'s text');
      // round A8 (scratch/surround/CARD-CAUSE-A8.md): the pile's lean along the row joins the slope at seats x pitch / h
      // (the bend's shared scale gave it 0.40 of its size), in both texts; under the tool's own-tangent bend it is 1
      { const F = SURROUND.cardForm(), k = ((F.seats * F.pitch) / F.h).toFixed(5);
        for (const g of [tx, plainNap]) assert.ok(k === '2.50000' && g.form.includes(`arenaCardCloth * vec2( ${k}, 1.0 ) * ( arenaLean`), 'the lean along the row at its own size');
        assert.ok(cardGlsl(undefined, undefined, true, { nap: true, seats: true, cards: 48 }).form.includes('arenaCardCloth * vec2( 1.00000, 1.0 ) * ( arenaLean')); }
      const { CARD_TILE_WEAR } = await import('../../scene/club/arena/surround/paint.js');
      assert.deepEqual([...CARD_TILE_WEAR], [1, 0.95, 1.04, 0.97]); for (const w of CARD_TILE_WEAR) assert.ok(tx.form.includes(w.toFixed(5)), `the paint's wear ${w} in the text`);
      // built (base and lite): every card seat's record is the plan's seat that stands at that place of the card
      const sp = planSeating(), seats = planSeats();
      for (const tier of roomLight ? ['lite', 'base'] : []) {
        roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } });
        const s = await buildSurround({ tier, knobs: TIERS[tier], ctx: { query: q('nap:1,rhythm:1') } }, args(roomLight));
        const c = s.counts(), tex = c.textures.find((x) => x.name === 'arena.surround.seatrhythm');
        assert.ok(tex && tex.w === SEAT_TABLE.w && tex.h === 48 && tex.bytes === SEAT_TABLE.w * 48 * 4 && (tier !== 'lite' || c.textureBytes <= 2.0e6), `${tier}: the seats' table ${tex?.bytes} bytes, ${c.textureBytes} in all`);
        const rec = (k, j) => s.api.seatRhythm(k, j);
        let met = 0; const used = new Set();
        for (const m of meshesOf(s.group).filter((x) => x.material.name === 'arena.surround.seats')) {
          assert.ok(/\|seats/.test(m.material.customProgramCacheKey()), m.material.customProgramCacheKey());
          const pos = m.geometry.getAttribute('position'), uv = m.geometry.getAttribute('uv'), ru = m.geometry.getAttribute('arenaRowUV');
          for (let v0 = 0; v0 + 3 < pos.count; v0 += 4) {
            const k = Math.round((ru.getY(v0) * 2 * 48 - 0.5) / 2), vs = [0, 1, 2, 3].map((i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, v0 + i).applyMatrix4(m.matrixWorld), u: uv.getX(v0 + i) }));
            // round A8: the card's map begins 14.1 mm under the sheet's foot: its seat stands where the real seat stands
            { const v = [0, 1, 2, 3].map((i) => uv.getY(v0 + i)), up = 0.0141 / SEAT.cardH; assert.ok(Math.abs(Math.min(...v) + up) < 1e-4 && Math.abs(Math.max(...v) - 1 + up) < 1e-4, `${tier}: a card's v runs ${Math.min(...v)} to ${Math.max(...v)}`); }
            const u0 = Math.min(...vs.map((x) => x.u)), u1 = Math.max(...vs.map((x) => x.u)), mid = (list) => list[0].p.clone().add(list[1].p).multiplyScalar(0.5);
            const lo = mid(vs.filter((x) => x.u < (u0 + u1) / 2)), hi = mid(vs.filter((x) => x.u >= (u0 + u1) / 2)), along = hi.clone().sub(lo).setY(0).normalize();
            for (let j = Math.round(u0 * 4); j < Math.round(u1 * 4); j++) {
              const r = rec(k, j), at = lo.clone().lerp(hi, ((j + 0.5) / 4 - u0) / (u1 - u0));
              // the plan's seat that stands there (within half a pitch along the row, in the same row's height)
              let seat = null, far = Infinity;
              for (const x of seats) { const b = sp.blocks.find((y) => y.id === x.block), [wx, wz] = toWorld(b.frame, x.s, x.d), d = Math.hypot(wx - at.x, wz - at.z) + 4 * Math.abs(FLOOR + x.h + SEAT.cardH / 2 - at.y); if (d < far) { far = d; seat = x; } }
              const b = sp.blocks.find((y) => y.id === seat.block), [ax, az] = toWorld(b.frame, seat.s, seat.d), [bx, bz] = toWorld(b.frame, seat.s + 1, seat.d), dir = Math.sign((bx - ax) * along.x + (bz - az) * along.z);
              const mm = NAP.lean * seat.napM;
              assert.ok(far < 1.2 && Math.abs(r[0] - seat.tone) < 0.002 && Math.abs(r[1] - mm * Math.cos(seat.napA) * dir) < 0.003 && Math.abs(r[2] - mm * Math.sin(seat.napA)) < 0.003 && Math.abs(r[3] - seat.wear) < 0.003, `${tier}: card ${k} tile ${j}: record ${r.map((v) => v.toFixed(3))} against seat ${seat.block} ${seat.row} ${seat.half}.${seat.index} (tone ${seat.tone}, lean ${(mm * Math.cos(seat.napA) * dir).toFixed(3)} / ${(mm * Math.sin(seat.napA)).toFixed(3)}, wear ${seat.wear}), ${far.toFixed(2)} m off`);
              met += 1; used.add(`${seat.block}|${seat.row}|${seat.half}|${seat.index}`);
            }
          }
        }
        assert.ok(met === 384 && used.size === 384, `${tier}: ${met} card seats carry ${used.size} different seats of the plan`);
        s.dispose();
        // `vary:0`: every card seat plain; `rhythm:0`: no table
        roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } });
        const flat = await buildSurround({ tier, knobs: TIERS[tier], ctx: { query: q('nap:1,rhythm:1,vary:0') } }, args(roomLight));
        for (let k = 0; k < 48; k++) for (let j = 0; j < SEAT_TABLE.w; j++) { const r = flat.api.seatRhythm(k, j); assert.ok(Math.abs(r[0] - 1) < 0.002 && Math.abs(r[1]) < 0.002 && Math.abs(r[2]) < 0.002 && r[3] === 0, 'vary:0 leaves a seat\'s record'); }
        flat.dispose();
        roomLight.reset?.(); roomLight.init?.({ club: { tier, knobs: TIERS[tier] } });
        const off = await buildSurround({ tier, knobs: TIERS[tier], ctx: { query: q('nap:1,rhythm:0') } }, args(roomLight));
        assert.ok(off.api.seatRhythm(0, 0) === null && !off.counts().textures.find((x) => x.name === 'arena.surround.seatrhythm') && !/\|seats/.test(meshesOf(off.group).find((x) => x.material.name === 'arena.surround.seats').material.customProgramCacheKey()), 'rhythm:0: the hash, no table');
        off.dispose();
      }
      ok(`round A7: the seats' own rhythm on the cards (${NAP.seats ? 'ON' : 'dark'}): each of the 384 card seats carries the tone, the lean and the wear of the plan's seat that stands there`, () => {});
    }
    ok(`round A7: the row's light (${CARD_ROW.on ? 'ON' : 'dark'}), the pile (${NAP.on ? 'ON' : 'dark'}), the metal by the hall's reflection (${METAL_HALL.on ? 'ON' : 'dark'}): the switches, the texts read no camera place, the light vector is exact for one source, the table follows the bake's serial, the attributes are per seat`, () => {});
  }
  if (!hadDocument) delete globalThis.document;
}

console.log(`test-club-arena-surround: ${n} arms OK`);
