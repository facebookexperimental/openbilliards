// Copyright (c) Meta Platforms, Inc. and affiliates.

// registers-488p.mjs — the FROZEN A2 look-loop register set for the Predator
// Apex 9 ft (GH-488P). Every pose is DERIVED from the canonical geometry JSON
// (docs/geometry/gh488p-predator-apex-canonical.json) — no hand-copied
// coordinates, so the register set moves only when the single source moves
// (图 == JSON == 模型 == 闸门).
//
//   node tools/render/registers-488p.mjs            # print the register JSON
//   node tools/render/registers-488p.mjs --list     # names only
//
// Zooms: each register is shot at 1x / 2x / 4x from the SAME eye point, by
// halving tan(fov/2) — a true optical zoom, not a dolly (a dolly would change
// the perspective and make the three crops non-comparable).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SPEC_PATH = path.resolve(
  here, '../../docs/geometry/gh488p-predator-apex-canonical.json');

const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8'));
const ft = (id) => {
  const f = spec.features.find((x) => x.id === id);
  if (!f) throw new Error(`missing feature ${id}`);
  return f;
};
/** `value_mm` is a NAMED sub-key map in this schema ({length, width}, {mouth},
 * {spacing, inset_from_nose, radius}, ...) — read the sub-key explicitly so a
 * schema change fails loudly instead of silently yielding NaN. */
const mm = (id, key) => {
  const v = ft(id).value_mm?.[key];
  if (typeof v !== 'number') throw new Error(`${id}.value_mm.${key} not numeric`);
  return v;
};

// ---- canonical numbers (mm -> m) -----------------------------------------
const HW = mm('FT-PLAYFIELD', 'width') / 2000;   // 0.635 half width  (k.x)
const HL = mm('FT-PLAYFIELD', 'length') / 2000;  // 1.270 half length (k.y)
const CW = mm('FT-CUSHION-WIDTH', 'width') / 1000;
const RAIL_BAND = mm('FT-RAIL-BAND', 'width') / 1000;
const SIGHT_INSET = mm('FT-SIGHTS', 'inset_from_nose') / 1000;
const SIGHT_SPACING = mm('FT-SIGHTS', 'spacing') / 1000;
const C_MOUTH = mm('FT-CORNER-MOUTH', 'mouth') / 1000;
const C_THROAT = mm('FT-CORNER-THROAT', 'throat') / 1000;
const C_SHELF = mm('FT-CORNER-SHELF', 'shelf') / 1000;
const S_THROAT = mm('FT-SIDE-THROAT', 'throat') / 1000;
const S_SHELF = mm('FT-SIDE-SHELF', 'shelf') / 1000;

// pocket fall centres, same construction as makeGeom()/generate.py
const C_DEPTH = C_SHELF + C_THROAT / 2 - C_MOUTH / 2;   // 0.02921
const CD = C_DEPTH / Math.SQRT2;                         // 0.0206546…
const S_DEPTH = S_SHELF + S_THROAT / 2;                  // 0.0556
export const CORNER_C = [HW + CD, HL + CD];              // k.x, k.y
export const SIDE_C = [HW + S_DEPTH, 0];
export const OUTER = [HW + CW + RAIL_BAND, HL + CW + RAIL_BAND];

const FOV1 = 40;
const zoomFov = (z) => 2 * Math.atan(Math.tan(FOV1 * Math.PI / 360) / z) * 180 / Math.PI;
export const ZOOMS = [
  { tag: '1x', fov: FOV1 },
  { tag: '2x', fov: zoomFov(2) },
  { tag: '4x', fov: zoomFov(4) },
];

/** Register eye/target pairs, kernel frame [kx, ky, h]; h measured from the
 * cloth plane (Z0 = bed cloth top, datum TCS-PDT-01). */
export const REGISTERS = [
  {
    // corner pocket, 3/4 from outside the corner — the primary form register
    // (ref: 02-pocket-closeups/official-yt-pockets-01..09)
    name: 'corner',
    cam: [CORNER_C[0] + 0.46, CORNER_C[1] + 0.46, 0.42],
    look: [CORNER_C[0], CORNER_C[1], 0.0],
  },
  {
    // side pocket, 3/4 from outside the long rail
    name: 'side',
    cam: [SIDE_C[0] + 0.52, SIDE_C[1] + 0.30, 0.40],
    look: [SIDE_C[0] - 0.02, SIDE_C[1], 0.0],
  },
  {
    // side pocket STRAIGHT DOWN — matches the 4865x3893 official top-down
    // (02-pocket-closeups/official-pocket-cushion-closeup.jpg), the single
    // highest-authority plan reference in the dossier
    name: 'side_top',
    cam: [SIDE_C[0], SIDE_C[1], 0.62],
    look: [SIDE_C[0], SIDE_C[1], 0.0],
  },
  {
    // cushion: grazing eye just above the cloth looking along the long rail
    // nose — reads nose height, facing rake and the cloth->rubber seam
    name: 'cushion',
    cam: [HW + 0.30, 0.62, 0.085],
    look: [HW - 0.005, 0.10, 0.018],
  },
  {
    // rail top: near-overhead over a long-rail sight — reads rail band width,
    // sight inlay form and the rail<->apron edge
    name: 'railtop',
    cam: [HW + SIGHT_INSET, SIGHT_SPACING, 0.44],
    look: [HW + SIGHT_INSET, SIGHT_SPACING, 0.03],
  },
  {
    // full table 3/4 (ref: 00-overview/apex-9ft-arena-hero-1/2)
    name: 'full34',
    cam: [1.85, -2.45, 1.55],
    look: [0, 0, 0.0],
  },
];

export function poses() {
  const out = [];
  for (const r of REGISTERS) {
    for (const z of ZOOMS) {
      out.push({
        name: `${r.name}-${z.tag}`, cam: r.cam, look: r.look,
        fov: Number(z.fov.toFixed(4)),
      });
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--list')) {
    for (const p of poses()) console.log(p.name);
  } else {
    process.stdout.write(`${JSON.stringify(poses(), null, 2)}\n`);
  }
}
