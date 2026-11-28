// Copyright (c) Meta Platforms, Inc. and affiliates.

// selftest-regdiff-628.mjs — red/green for regdiff-628.mjs's id-map attribution.
//
// regdiff-628 decides whether a register moved for an allowed reason by asking
// an idmask-488d.mjs id map which family each differing pixel belongs to. Two
// ways that answer can be wrong were caught by review rather than by a gate,
// so they get a gate here.
//
// 1. ADDRESSING. The id map is ONE UNCROPPED 1x shot of the pose, while
//    capture-488d-registers.mjs's 2x/4x frames are CENTRE CROPS of that same
//    pose rescaled back to full size — every frame therefore comes out at the
//    same width/height and reading the map in zoom coordinates picks the wrong
//    surface with no size mismatch to give it away.
// 2. ONE-SIDEDNESS. A pixel that moved because a table part DISAPPEARED is
//    that part's family on the tree that still draws it and plain background
//    on the tree that does not; classified against the second tree alone it
//    reads `room` and `--expect room-only` certifies a deletion.
// 3. STALE / MISFILED ID MAPS. Every register is shot at the same size, so a
//    map from ANOTHER pose passes the dimension guard and answers with
//    whatever family sits at that address.
// 4. THE ROOM IS NOT BACKGROUND. idmask-488d.mjs paints every opaque mesh and
//    collapses every non-`dm-` name into the single legend key `(other)`, so
//    the room floor/walls/bench come back as a legend family and not as
//    `(background)`. Folding that key into the prohibited `other` bucket makes
//    room-only reject the room.
//
// The fixture is small enough to check by hand:
//
//   16x8 pose. Default id map: source x < 6 = dm-leg-a (hue 0, a SEAM family)
//                              source x >= 6 = dm-rail (hue 120, OTHER)
//   2x frame = source x in [4,12), y in [2,6), scale 2.
//   One planted difference at zoom (5,0):
//     zoom coordinates       -> id map x=5             -> dm-leg-a `seam`
//     mapped through the 2x  -> source 4+floor(5/2)=6  -> dm-rail  `other`
//
//   node tools/render/selftest-regdiff-628.mjs   # exit 0 pass / 1 fail
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { encodePng } from './lib/png.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const TOOL = path.join(here, 'regdiff-628.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regdiff-selftest-'));
const W = 16; const H = 8;
const REG = 'corner-hi';

const rgba = (fill) => {
  const b = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, bl] = fill(x, y);
      const o = (y * W + x) * 4;
      b[o] = r; b[o + 1] = g; b[o + 2] = bl; b[o + 3] = 255;
    }
  }
  return b;
};
// The register frames are flat grey: only WHICH pixel moved matters here, the
// family answer comes from the id maps.
const flat = rgba(() => [128, 128, 128]);
const moved = rgba((x, y) => ((x === 5 && y === 0) ? [128, 128, 200] : [128, 128, 128]));
const LEG = [255, 0, 0]; // dm-leg-a, hue 0   — a seam family
const RAIL = [0, 255, 0]; // dm-rail,  hue 120 — an other family
const NONE = [0, 0, 0]; // id-map background = void the table did not draw
const ROOM = [0, 0, 255]; // idmask's `(other)` key, hue 240 — the room block
const SPLIT = (x) => (x < 6 ? LEG : RAIL);
// The pose the capture manifest records and the id map declares. Attribution
// is refused unless the map names THIS register and THIS pose.
const POSE = { cam: [0.9, 1.53, 0.46], look: [1.4, 2.6, 0.01], fov: 34 };
const LEGEND = { legend: { 'dm-leg-a': { hue: 0 }, 'dm-rail': { hue: 120 } } };
const LEGEND_ROOM = {
  legend: { ...LEGEND.legend, '(other)': { hue: 240 } },
};

// Builds a capture pair whose single frame carries the planted difference at
// the given zoom, plus one id map per side (`ma` shot on A, `mb` on B).
function build(dir, zoom, ma = SPLIT, mb = SPLIT, legend = LEGEND, metaA = {},
  pose = POSE) {
  const base = path.join(root, dir);
  for (const [side, img] of [['a', flat], ['b', moved]]) {
    const d = path.join(base, side);
    fs.mkdirSync(d, { recursive: true });
    const file = `${REG}-${zoom}x.png`;
    fs.writeFileSync(path.join(d, file), encodePng(W, H, img));
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      tag: `selftest-${side}`, rig: { note: 'regdiff-628 attribution selftest' },
      poses: { [REG]: pose },
      frames: [{ register: REG, zoom, file }],
    }, null, 2));
  }
  for (const [name, fill] of [['idmap-a', ma], ['idmap-b', mb]]) {
    const idir = path.join(base, name, REG);
    fs.mkdirSync(idir, { recursive: true });
    fs.writeFileSync(path.join(idir, 'idmap.png'), encodePng(W, H, rgba(fill)));
    const meta = { register: REG, pose, ...legend };
    fs.writeFileSync(path.join(idir, 'idmap.json'), JSON.stringify(
      name === 'idmap-a' ? { ...meta, ...metaA } : meta, null, 2));
  }
  return base;
}

function run(base, { oneSided = false } = {}) {
  const out = path.join(base, oneSided ? 'out-1' : 'out');
  const args = [TOOL, '--a', path.join(base, 'a'), '--b', path.join(base, 'b'),
    '--idmap', path.join(base, 'idmap-a'), '--expect', 'room-only', '--out', out];
  if (!oneSided) args.splice(7, 0, '--idmap-b', path.join(base, 'idmap-b'));
  const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
  const rep = path.join(out, 'regdiff.json');
  if (!fs.existsSync(rep)) return { code: r.status, at: null };
  const report = JSON.parse(fs.readFileSync(rep, 'utf8'));
  return { code: r.status, at: report.rows[0].attribution };
}

let bad = 0;
const check = (name, got, want) => {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  if (g === w) { console.log(`ok    ${name}  ${g}`); return; }
  console.log(`FAIL  ${name}\n        got  ${g}\n        want ${w}`);
  bad++;
};
const shape = (r) => (r.at
  ? { seam: r.at.seam, other: r.at.other, unresolved: r.at.unresolved, code: r.code }
  : { seam: null, other: null, unresolved: null, code: r.code });

// 2x: the pixel is inside the centre crop and belongs to dm-rail, not the
// dm-leg-a that sits at the same address in the uncropped frame.
const two = run(build('zoom2', 2));
check('2x maps into the crop (other=dm-rail)',
  { ...shape(two), fam: two.at.otherFamilies['dm-rail'] || 0 },
  { seam: 0, other: 1, unresolved: 0, code: 3, fam: 1 });

// 1x: identity. The same pixel is dm-leg-a, a seam family, and room-only holds.
check('1x is identity (seam)', shape(run(build('zoom1', 1))),
  { seam: 1, other: 0, unresolved: 0, code: 0 });

// 3x of a 16px frame: round(16/3)*3 = 15 != 16, so the crop cannot be
// reconstructed. Refuse to attribute rather than read a plausible-looking
// wrong address.
check('unreconstructable zoom fails closed (unresolved)', shape(run(build('zoom3', 3))),
  { seam: 0, other: 0, unresolved: 1, code: 3 });

// A dm-rail pixel that A draws and B does not: background on the B map alone,
// which is precisely the answer that must NOT win.
const gone = run(build('gone', 1, (x) => (x === 5 ? RAIL : NONE), () => NONE));
check('a deleted surface is `other`, not `room`',
  { ...shape(gone), room: gone.at.room },
  { seam: 0, other: 1, unresolved: 0, code: 3, room: 0 });

// The room floor reads idmask's `(other)` legend key on BOTH trees. It is not
// `(background)`, and it is not a table part: room-only must accept it, and
// must show how much of the diff rested on that coarser answer (review round 4
// P2 — before the fix this arm returned other=1, exit 3).
const roomMesh = run(build('roommesh', 1, (x) => (x === 5 ? ROOM : NONE),
  (x) => (x === 5 ? ROOM : NONE), LEGEND_ROOM));
check('idmask `(other)` = the room block, allowed under room-only',
  { ...shape(roomMesh), nonDm: roomMesh.at.nonDm, room: roomMesh.at.room },
  { seam: 0, other: 0, unresolved: 0, code: 0, nonDm: 1, room: 0 });

// A map shot from a DIFFERENT pose, filed under this register's name: the
// image is the right size and the legend is right, and the pixel it answers
// for is a seam family, so the run would pass. Provenance refuses it instead
// (review round 6 P2 — before the fix this returned seam=1, exit 0).
const stale = run(build('stalepose', 1, SPLIT, SPLIT, LEGEND,
  { pose: { ...POSE, fov: 30 } }));
check('an id map from another pose is refused',
  { refused: !!stale.at?.missing, code: stale.code },
  { refused: true, code: 3 });

// Same, for a map that names another register (a misfiled directory).
const misfiled = run(build('misfiled', 1, SPLIT, SPLIT, LEGEND,
  { register: 'r6_fulltable' }));
check('an id map naming another register is refused',
  { refused: !!misfiled.at?.missing, code: misfiled.code },
  { refused: true, code: 3 });

// The register set has TWO pose schemas: the free camera and r7_overhead's
// `{overhead, height, fov}`. An overhead map that matches its capture exactly
// must be TRUSTED (review round 7 P2 — before the fix the free-camera field
// check refused it and room-only exited 3 on a register that was in order).
const OVERHEAD = { overhead: true, height: 14, fov: 11 };
const overhead = run(build('overhead', 1, SPLIT, SPLIT, LEGEND, {}, OVERHEAD));
check('an overhead-schema pose is trusted', shape(overhead),
  { seam: 1, other: 0, unresolved: 0, code: 0 });

// ...and a DIFFERENT overhead pose is still refused: the fix widens the
// schema, it does not weaken the claim.
const overheadBad = run(build('overhead-bad', 1, SPLIT, SPLIT, LEGEND,
  { pose: { ...OVERHEAD, height: 13 } }, OVERHEAD));
check('a mismatched overhead pose is refused',
  { refused: !!overheadBad.at?.missing, code: overheadBad.code },
  { refused: true, code: 3 });

// Two EMPTY captures compare nothing, and nothing is not a pass: the loops
// walk zero rows and every expectation is vacuously satisfied (review round 8
// P2 — before the fix `--expect identical` exited 0 on two empty manifests).
{
  const base = path.join(root, 'empty');
  for (const side of ['a', 'b']) {
    const d = path.join(base, side);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'manifest.json'), JSON.stringify({
      tag: `selftest-empty-${side}`, poses: {}, frames: [],
    }, null, 2));
  }
  const r = spawnSync(process.execPath, [TOOL, '--a', path.join(base, 'a'),
    '--b', path.join(base, 'b'), '--expect', 'identical',
    '--out', path.join(base, 'out')], { encoding: 'utf8' });
  check('two empty captures are refused, not certified',
    { code: r.status, says: /no frame pair to compare/.test(r.stderr) },
    { code: 2, says: true });
}

// And room-only refuses to run one-sided at all, rather than quietly grading
// a deletion against the tree that no longer draws it.
check('room-only refuses a one-sided map', shape(run(build('one', 1), { oneSided: true })),
  { seam: null, other: null, unresolved: null, code: 2 });

fs.rmSync(root, { recursive: true, force: true });
console.log(bad === 0 ? '\nselftest-regdiff-628: PASS' : `\nselftest-regdiff-628: ${bad} FAIL`);
process.exit(bad === 0 ? 0 : 1);
