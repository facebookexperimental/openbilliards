// Copyright (c) Meta Platforms, Inc. and affiliates.

// gh488p-chains.mjs — the ONE drawn-construction source for the GH-488P lane.
//
// Every 488p instrument that needs to know where the jaw is reads it from
// here. That is the boundary law applied to code rather than to geometry: two
// gates each carrying their own port of the same construction is a nearby
// duplicate, and a duplicate drifts. If the corner fillet moves, it moves in
// one file and every gate moves with it — or it does not move at all.
// Derived from pooltool (Apache-2.0), through the kernel's table layout, and modified by the OpenBilliards authors.
// The chains are a PORT of tools/render/gh488predator/generate.py
// (corner_construction / side_construction, themselves the kernel's
// Table::from_pocket_spec verbatim). Plan coordinates are the TCS-PDT-01
// GLOBAL frame [X across the width, Y along the length], mm; the generator
// works in (u, v) = (Y, X) and every point below is emitted already swapped.
//
// The port re-validates against the generator's own invariants at import
// (checkChains) and calls process.exit(4) on drift, because silent port drift
// would move every letter in every gate at once and each of them would agree
// with the others while all of them were wrong.
//
// The canonical JSON is bound by CONTENT, not by path: if those bytes move,
// the letters transcribed against them may have moved too, so the import
// aborts rather than letting a gate green against a stale twin.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(HERE, '..', '..');

export const SPEC_PATH = path.join(repoDir, 'docs/geometry',
  'gh488p-predator-apex-canonical.json');
// Rebound at canonical r4 (2026-08-31, GH-484 CAL-1 landing). UNLIKE the
// additive r2/r3 rebinds below, r4 MOVES one letter value this file reads:
// FT-SIDE-MOUTH value_mm.mouth 127.0 → 124.968 (tier → OFFICIAL, CFL-2 →
// RESOLVED, CAL-1 closed; document.revision/change_summary). Re-adjudicated
// before rebinding: every OTHER key is byte-identical, and the side-mouth
// movement is not a re-blessing of a drawn curve against itself — the kernel
// landed the same value first (PR #601, owner-approved ruling d601pred,
// wasm 0.1.0+a7c980b4), and the render derives the mouth from the kernel
// mirror, so spec == kernel == mesh by construction; the gates below re-ran
// green on exactly these bytes (fullview 17/17 with FV488P-PLAN-SIDE-MOUTH
// now judged at 124.968, c14 PASS, letters 44 green).
//
// Rebound at canonical r3 (2026-08-29, wave N item 2). The r1→r2 rebinding is
// kept below because the adjudication argument is cumulative, and r2→r3 is the
// same argument a second time. Re-adjudicated mechanically before rebinding:
// across r2→r3 no existing feature's value_mm / value_deg / value_text / scope
// / tier moved, frames, sources, conflicts and the scope block are all
// byte-identical, and no existing derivation row changed — the diff is four
// added render_only features (the FT-PLUG-* group: three dimensionless ratios
// and one bounded estimate, none of which any letter here reads), four added
// derivations (DRV-13..16), and document.revision / change_summary. No letter
// moved, so the green below is the same green, not a re-blessed one.
//
// Rebound at canonical r2 (2026-08-29, wave N). The binding fired on the r2
// bytes exactly as designed, and the re-adjudication it demanded was done
// mechanically before rebinding: every key this file reads — the value_mm /
// value_deg / value_text of all 31 r1 features, plus frames.construction and
// scope — is byte-identical between r1 and r2. r2 is additive only: one new
// render_only feature (FT-RIM-BAND, a dimensionless ratio no letter reads) and
// one new derivation (DRV-12), plus prose in three notes. (The hash was
// rebound once more within the wave when the generator's recompute law
// rejected DRV-12's 2-dp result_mm: 14.06 became the exact 14.0562. That
// touched DRV-12's own row and the change summary and nothing else, so the
// adjudication above covers it unchanged.)
export const SPEC_SHA256 =
  '2cf2a3a5ea040502edc4ee1e28a25da4d23cea95a0cda42f49dcae0148ac8f10';
const specRaw = readFileSync(SPEC_PATH);
const specHash = createHash('sha256').update(specRaw).digest('hex');
if (specHash !== SPEC_SHA256) {
  console.error(`GH-488P: canonical bytes moved — ${SPEC_PATH} hashes `
    + `${specHash.slice(0, 16)}… vs bound ${SPEC_SHA256.slice(0, 16)}… `
    + '(re-adjudicate the letters before trusting any verdict)');
  process.exit(4);
}
export const DOC = JSON.parse(specRaw.toString('utf8'));
const feat = (id) => {
  const f = DOC.features.find((v) => v.id === id);
  if (!f) throw new Error(`canonical JSON has no feature ${id}`);
  return f;
};
// `value_mm` is a NAMED SUB-KEY MAP in this schema, never a bare number.
const fv = (id, key) => {
  const v = feat(id).value_mm;
  if (typeof v !== 'object' || !(key in v)) {
    throw new Error(`${id}.value_mm has no key ${key}`);
  }
  return v[key];
};
const fdeg = (id) => feat(id).value_deg;
const frame = (id) => DOC.frames.construction.find((f) => f.id === id);

export const SPEC = {
  half_len: fv('FT-PLAYFIELD', 'length') / 2,
  half_wid: fv('FT-PLAYFIELD', 'width') / 2,
  cushion_w: fv('FT-CUSHION-WIDTH', 'width'),
  nose_h: fv('FT-CUSHION-NOSE-HEIGHT', 'height'),
  ball_d: fv('FT-BALL', 'diameter'),
  corner_mouth: fv('FT-CORNER-MOUTH', 'mouth'),
  side_mouth: fv('FT-SIDE-MOUTH', 'mouth'),
  corner_facing: fdeg('FT-CORNER-FACING'),
  side_facing: fdeg('FT-SIDE-FACING'),
  corner_jaw_r: fv('FT-CORNER-JAW-RADIUS', 'radius'),
  side_jaw_r: fv('FT-SIDE-JAW-RADIUS', 'radius'),
  corner_throat: fv('FT-CORNER-THROAT', 'throat'),
  side_throat: fv('FT-SIDE-THROAT', 'throat'),
  corner_depth: fv('FT-CORNER-DEPTH', 'depth'),
  side_depth: fv('FT-SIDE-DEPTH', 'depth'),
  env_len: fv('FT-ENVELOPE', 'length'),
  env_wid: fv('FT-ENVELOPE', 'width'),
  env_hgt: fv('FT-ENVELOPE', 'height'),
  overhang_long: fv('FT-OVERHANG-LONG', 'overhang'),
  overhang_short: fv('FT-OVERHANG-SHORT', 'overhang'),
  rail_band: fv('FT-RAIL-BAND', 'width'),
  apron_h: fv('FT-APRON', 'height'),
  slate_t: fv('FT-SLATE', 'thickness'),
  sight_spacing: fv('FT-SIGHTS', 'spacing'),
  sight_inset: fv('FT-SIGHTS', 'inset_from_nose'),
  sight_r: fv('FT-SIGHTS', 'radius'),
  exact_side_facing:
    String(feat('FT-EXACT-SIDE-FACING').value_text).trim().toLowerCase()
    === 'true',
  cp_origin: frame('PCF-PDT-CP').canonical_origin_in_global,
  sp_origin: frame('PCF-PDT-SP').canonical_origin_in_global,
};

export function cornerChain() {
  const hl = SPEC.cp_origin[1];
  const hw = SPEC.cp_origin[0];
  const ca = (45 + SPEC.corner_facing) * Math.PI / 180;
  const rc = SPEC.corner_jaw_r;
  const dc = rc / Math.tan((Math.PI / 2 + ca) / 2);
  const setback = SPEC.corner_mouth / Math.SQRT2;
  const pwc = setback - dc;
  const cw = SPEC.cushion_w;
  const n1 = [hw, hl - setback];
  const c1 = [hw + rc, hl - setback];
  const t1 = [hw + dc * Math.cos(ca), hl - (pwc - dc * Math.sin(ca))];
  const d1 = [hw + cw, hl - (pwc - cw * Math.tan(ca))];
  const n2 = [hw - setback, hl];
  const c2 = [hw - setback, hl + rc];
  const t2 = [hw - (pwc - dc * Math.sin(ca)), hl + dc * Math.cos(ca)];
  const d2 = [hw - (pwc - cw * Math.tan(ca)), hl + cw];
  const bis = Math.SQRT1_2;
  const fall = [hw + bis * SPEC.corner_depth, hl + bis * SPEC.corner_depth];
  return { n1, c1, t1, d1, n2, c2, t2, d2, fall, rc, dc, setback, cw, ca };
}

export function sideChain() {
  const uc = SPEC.sp_origin[1];
  const hw = SPEC.sp_origin[0];
  const sa = SPEC.side_facing * Math.PI / 180;
  const rs = SPEC.side_jaw_r;
  const ds = rs / Math.tan((Math.PI / 2 + sa) / 2);
  const sw = SPEC.side_mouth - 2 * ds;
  const cw = SPEC.cushion_w;
  const sjb = SPEC.exact_side_facing ? cw * Math.tan(sa) : cw * Math.sin(sa);
  const hm = SPEC.side_mouth / 2;
  const nL = [hw, uc - hm];
  const cL = [hw + rs, uc - hm];
  const tL = [hw + ds * Math.cos(sa), uc - (sw / 2 - ds * Math.sin(sa))];
  const dL = [hw + cw, uc - (sw / 2 - sjb)];
  const mir = (p) => [p[0], 2 * uc - p[1]];
  const fall = [hw + SPEC.side_depth, uc];
  return { nL, cL, tL, dL, nR: mir(nL), cR: mir(cL), tR: mir(tL),
    dR: mir(dL), fall, rs, ds, sw, cw, sa };
}

export function checkChains(tag = 'GH-488P') {
  const K = cornerChain();
  const S = sideChain();
  const near = (a, b, t, what) => {
    if (Math.abs(a - b) > t) {
      console.error(`${tag}: chain port drift — ${what}: `
        + `${a.toFixed(6)} vs ${b.toFixed(6)}`);
      process.exit(4);
    }
  };
  near(Math.hypot(K.t1[0] - K.c1[0], K.t1[1] - K.c1[1]), K.rc, 1e-6,
    'corner arc-facing tangency limb 1');
  near(Math.hypot(K.t2[0] - K.c2[0], K.t2[1] - K.c2[1]), K.rc, 1e-6,
    'corner arc-facing tangency limb 2');
  near(Math.hypot(K.n1[0] - K.c1[0], K.n1[1] - K.c1[1]), K.rc, 1e-6,
    'corner arc-nose tangency limb 1');
  near(Math.hypot(K.n1[0] - K.n2[0], K.n1[1] - K.n2[1]), SPEC.corner_mouth,
    1e-6, 'corner nose-to-nose mouth');
  near(Math.hypot(S.tL[0] - S.cL[0], S.tL[1] - S.cL[1]), S.rs, 1e-6,
    'side arc-facing tangency');
  near(Math.hypot(S.nL[0] - S.nR[0], S.nL[1] - S.nR[1]), SPEC.side_mouth,
    1e-6, 'side nose-to-nose mouth');
  // the generator's own DRV rows, re-run on the ported scalars
  near(SPEC.nose_h, 0.635 * SPEC.ball_d, 1e-9, 'DRV-1 nose height');
  near(SPEC.corner_depth,
    38.1 + SPEC.corner_throat / 2 - SPEC.corner_mouth / 2, 1e-9,
    'DRV-2 corner depth');
  near(SPEC.side_depth, 4.8 + SPEC.side_throat / 2, 1e-9, 'DRV-3 side depth');
  near(SPEC.rail_band, SPEC.overhang_short - SPEC.cushion_w, 1e-9,
    'DRV-7 rail band');
  near(SPEC.sight_spacing, 2 * SPEC.half_len / 8, 1e-9, 'DRV-8 sight pitch');
}
checkChains();

// ---------------------------------------------------------------------------
// frame conversion, shared for the same reason the chains are.
// camerascript.js: three.x = kernel y, three.y = height, three.z = kernel x;
// for this table kernel x is the WIDTH and kernel y the LENGTH, and TCS-PDT-01
// puts +X across the width and +Y along the length. So X_mm = three.z * 1000,
// Y_mm = three.x * 1000, Z_mm = three.y * 1000.
// ---------------------------------------------------------------------------
/** Drawing-frame plan point (X, Y) mm -> three.js world (x, z) metres. */
export const dwgToWorld = (p) => ({ x: p[1] / 1000, z: p[0] / 1000 });

/** The six drop-aperture axes, drawing frame mm, one per pocket. */
export function fallAxes() {
  const K = cornerChain();
  const S = sideChain();
  const out = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      out.push({
        label: `CP-${sy > 0 ? 'FOOT' : 'HEAD'}-${sx > 0 ? 'RIGHT' : 'LEFT'}`,
        p: [sx * K.fall[0], sy * K.fall[1]],
        kind: 'corner',
      });
    }
    out.push({
      label: `SP-${sx > 0 ? 'RIGHT' : 'LEFT'}`,
      p: [sx * S.fall[0], S.fall[1]],
      kind: 'side',
    });
  }
  return out;
}
