// Copyright (c) Meta Platforms, Inc. and affiliates.

// scene.mjs — analytic mirror of the STATIC render scene (web/scene/table.js
// + web/scene/room.js) for the offline lightmap bake. Geometry numbers are
// mirrored from those modules (which themselves mirror Table::wpa_9ft); the
// bake manifest carries a hash of this description so drift is visible. The rail and jaw construction is derived from pooltool (Apache-2.0), through Table::from_pocket_spec and web/scene/table.js, and modified by the OpenBilliards authors.
// Frame: three.js world (y up, x = table long axis, z = short axis, bed y=0).
//
// GH-337 (per-table-class bakes): the mirror now covers THREE table classes
// (TABLES below) — the original 9-ft pool field, the WPBSA 12-ft snooker
// template (CEBP jaw construction, table.js twin) and the pocketless UMB
// 2.84 m carom table. The pool path is FLOAT-IDENTICAL to the pre-337
// module (zero-drift law: a canopy pool re-bake must reproduce the
// committed gi-* maps byte-identically — verified per change).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeObject, prism, prismConcave, box, hrect, pointInPoly } from './geom.mjs';
// BUILD-3 (review round 12 P1-b): the chinese-8 middle rail-end law is SHARED with
// the renderer — web/scene/cn8midlaw.js is dependency-free and node-importable.
import { cn8MidJawEnd } from '../../../web/scene/cn8midlaw.js';

// GH-490m: the cn8 MIDDLE furniture has a machine-readable contract, so the
// bake mirror reads its letters instead of carrying a second hand-typed copy
// (ADR-0015).  Node-only module — every importer is a tool; the browser
// modules that name this file (table.js, gi.js, lightingvisuals.js) only cite
// it in comments.  Deterministic: same bytes in, same numbers out, so the
// bake's byte-identical-rerun law is untouched.
const MID_GEO = (() => {
  const p = path.resolve(path.dirname(fileURLToPath(import.meta.url)),
    '..', '..', '..', 'docs', 'geometry',
    'cn8-middle-furniture-definition.json');
  const j = JSON.parse(readFileSync(p, 'utf8'));
  const get = (id) => {
    const f = j.features.find((x) => x.id === id);
    if (!f) throw new Error(`cn8 middle contract: no feature ${id}`);
    return f.value_mm / 1000;
  };
  // r12-APPROVED (card 17b): the plate letters BC-03 / BC-04 / MC-03 retired
  // with the plate; the bake's middle proxy is the moulded leather body's
  // plan footprint — back plane LP-04, depth LP-02, top LP-06, slot DT-09
  return { LP04: get('LP-04'), LP02: get('LP-02'), LP06: get('LP-06'), DT09: get('DT-09') };
})();
const MID_BACK = MID_GEO.LP04;
const MID_FRONT = MID_GEO.LP04 - MID_GEO.LP02;
// review midext-r5 P2 (manifest provenance): the bake scene now DEPENDS on a
// file outside scene.mjs, and bake-lightmap's sceneHash covers its constants
// and scene.mjs's own bytes only — so a contract-only edit could move the
// lighting while the freshness check reported an unchanged hash. This export
// is the hash input for that dependency. RESOLVED VALUES, not the file bytes:
// the hash should move exactly when the baked lighting could move, and a
// revision bump that touches no consumed letter changes neither. Keyed by
// CLASS in the file's established style (FIXTURE/TABLE enter the hash only
// off their defaults), so pool, snooker and carom — which read no contract —
// gain nothing from this clause. It does not freeze their recorded hashes:
// the sceneHash also covers this file's raw bytes, so every edit here moves
// every class's hash and only the re-baked classes get a refreshed manifest
// entry. Nothing keys on sceneHash (web/scene/gi.js only logs it) — it
// records the run that produced the maps sitting beside it.
export const CONTRACT_INPUTS = {
  chinese8_9ft: {
    'cn8-middle-furniture-definition': {
      'LP-04': MID_GEO.LP04, 'LP-02': MID_GEO.LP02, 'LP-06': MID_GEO.LP06, 'DT-09': MID_GEO.DT09,
    },
  },
};

// ---- constants mirrored from web/scene/table.js ----------------------------
export const L = 2.54, W = 1.27, CW = 0.0508, FW = 0.145;
const CORNER = { pw: 0.118, angle: 5.3, depth: 0.0417, radius: 0.062, jaw: 0.02095 };
const SIDE = { pw: 0.137, angle: 7.14, depth: 0.0685, radius: 0.0645, jaw: 0.00795 };
const ca = (CORNER.angle + 45.0) * Math.PI / 180.0;
const sa = SIDE.angle * Math.PI / 180.0;
const dc = CORNER.jaw / Math.tan((Math.PI / 2 + ca) / 2);
const ds = SIDE.jaw / Math.tan((Math.PI / 2 + sa) / 2);
const pwc = CORNER.pw * Math.cos(Math.PI / 4);
const cosCa = Math.cos(ca), sinCa = Math.sin(ca), tanCa = Math.tan(ca);
const cosSa = Math.cos(sa), sinSa = Math.sin(sa);
export const RAIL_TOP = 0.044, FRAME_TOP = 0.047, FLOOR_Y = -0.79, CEIL_Y = 2.45;
export const LAMP = { y: 1.02, w: 2.05, d: 0.66 }; // room.js LIGHT_POS/W/D

// ---- lighting fixtures (issue #89) -----------------------------------------
// MIRROR of web/scene/lightingvisuals.js FIXTURES (emitter rects {x,z,y,w,d}
// + per-look radiance derivation) — change them together. `ratio` is the
// per-emitter radiance multiplier over the look's lamp intensity (equal
// average bed illuminance calibration — see the runtime module). The canopy
// default keeps LOOKS[look].lamp VERBATIM so a canopy re-bake stays
// byte-identical to the committed pre-#89 asset set (zero-drift law).
const INTENS = { default: 7.6, tournament: 7.8 }; // look lamp intensities (LOOKS)
const IN = 0.0254;
export const FIXTURES = {
  canopy_panel: {
    emitters: [{ x: 0, z: 0, y: LAMP.y, w: LAMP.w, d: LAMP.d }],
    ratio: 1, cct: null, // the look's lamp color IS the canopy color
    hoods: [{ x: 0, z: 0, y0: LAMP.y + 0.005, y1: LAMP.y + 0.105,
      w: LAMP.w + 0.14, d: LAMP.d + 0.14 }],
  },
  perimeter_ring: (() => {
    // issue #117: 52→45 in clearance + ratio re-solved to a rendered
    // playfield-CENTER match with the canopy (was 4.736, average-illuminance).
    const ow = 102.4 * IN, od = 53 * IN, sw = 2.75 * IN, y = 45 * IN;
    const emitters = [
      { x: 0, z: -(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
      { x: 0, z: +(od - sw) / 2, y, w: ow - 2 * sw, d: sw },
      { x: -(ow - sw) / 2, z: 0, y, w: sw, d: od },
      { x: +(ow - sw) / 2, z: 0, y, w: sw, d: od },
    ];
    return {
      emitters, ratio: 14.381, cct: [1, 238 / 255, 214 / 255], // 0xffeed6
      hoods: emitters.map((e) => ({ x: e.x, z: e.z, y0: e.y + 0.005,
        y1: e.y + 0.04, w: e.w + 0.02, d: e.d + 0.02 })),
    };
  })(),
  pendant_bar: {
    emitters: [-0.55, 0, 0.55].map((x) =>
      ({ x, z: 0, y: 0.90, w: 0.26, d: 0.26 })),
    ratio: 20.516, cct: [1, 184 / 255, 117 / 255], // 0xffb875 (issue #117 center match)
    // shade cones approximated as boxes over the apertures (blockers only)
    hoods: [-0.55, 0, 0.55].map((x) => ({ x, z: 0, y0: 0.905, y1: 1.10,
      w: 0.38, d: 0.38 })),
  },
  snooker_luminaire: {
    emitters: [{ x: 0, z: 0, y: 1.15, w: 2.984, d: 0.20 }],
    // 489 corner graft: mirrors the STRUCTURAL rig re-fit (lightingvisuals
    // snooker_luminaire ratio 6.994 + oneTableGain 2.647, the R0-frozen
    // studio_xw101 photo-fit gain moved into the rig) — duplicated-literal
    // law, change together. CLASS-SCOPED like the runtime (review graft-r3
    // P2): the gain applies only when this fixture bakes over its OWN
    // venue class (gainClass), so the documented pool × snooker_luminaire
    // bake keeps the #117 family-normalized radiance.
    ratio: 6.994, oneTableGain: 2.647, gainClass: 'snooker_12ft',
    cct: [253 / 255, 249 / 255, 242 / 255], // 0xfdf9f2
    hoods: [{ x: 0, z: 0, y0: 1.155, y1: 1.245, w: 2.984 + 0.07,
      d: 0.20 + 0.08 }],
  },
  carom_luminaire: {
    // GH-386: the carom_284 venue default — long linear match-table
    // luminaire, 2.60×0.35 m at the owner-pinned y = 1.02 hang (UMB World
    // Rules Ch. II Art. 15; #381 Option A). Mirror of the runtime entry
    // (lightingvisuals.js) — change them together.
    emitters: [{ x: 0, z: 0, y: 1.02, w: 2.60, d: 0.35 }],
    ratio: 2.74, cct: [250 / 255, 247 / 255, 240 / 255], // 0xfaf7f0 (#117 center match)
    hoods: [{ x: 0, z: 0, y0: 1.025, y1: 1.115, w: 2.60 + 0.07,
      d: 0.35 + 0.08 }],
  },
  joy_lowrect: {
    // GH-490 REBUILD R0 (ONE-TABLE LAW): the chinese8 class's JOY-fit
    // venue rig — mirror of the runtime entry (lightingvisuals.js),
    // change them together.  Fit record: tools/render/cammatch/
    // fit-rig-490.{mjs,py} on the solved tpt showroom poses; retires the
    // borrowed snooker numbers + the r12/r13 keyTrim band-aid.
    emitters: [{ x: 0, z: 0, y: 1.15, w: 2.536, d: 0.20 }],
    ratio: 4.260, cct: [1, 241 / 255, 218 / 255], // 0xfff1da (JOY warm fit)
    hoods: [{ x: 0, z: 0, y0: 1.155, y1: 1.245, w: 2.536 + 0.07,
      d: 0.20 + 0.08 }],
  },
  pdt_studio: {
    // GH-488P wave M: the Predator Apex 9 ft's OWN venue rig — mirror of
    // the runtime entry (lightingvisuals.js), change them together. The
    // full derivation record (dossier LED colour measurement, the render
    // key sweep, the four-bar reduction of the arena frames, the pinned
    // hang and every recorded measurement limit) lives there. The bar
    // plates block like the other fixtures' housings.
    emitters: [-3, -1, 1, 3].map((n) => (
      { x: 0, z: n * 1.27 / 8, y: 1.15, w: 2.536, d: 0.05 })),
    ratio: 4.643, cct: [253 / 255, 254 / 255, 1], // 0xfdfeff
    hoods: [-3, -1, 1, 3].map((n) => (
      { x: 0, z: n * 1.27 / 8, y0: 1.155, y1: 1.190,
        w: 2.536 + 0.10, d: 0.05 + 0.10 })),
  },
};

/** Per-(look, fixture) emitter radiance. Canopy: LOOKS[look].lamp verbatim
 * (byte-identity with the pre-#89 bakes); fixtures: look intensity × the
 * calibration ratio × the fixture CCT fractions. */
export function fixtureLamp(look, fixture = 'canopy_panel', table = 'pool') {
  if (look === 'sp') look = 'tournament'; // the legacy look id (GH-973)
  if (fixture === 'canopy_panel') return LOOKS[look].lamp;
  const f = FIXTURES[fixture];
  // class-scoped ONE-TABLE gain (489 corner graft, review graft-r3 P2) —
  // mirrors lightingvisuals.js lightingProfile verbatim
  const gain = (f.oneTableGain && f.gainClass === table) ? f.oneTableGain : 1;
  const s = INTENS[look] * f.ratio * gain;
  return f.cct.map((c) => s * c);
}

function railPolysKernel() { // == table.js railPolysKernel (chord jaws)
  const leftBottom = [
    [-CW, pwc - CW * tanCa], [-dc * cosCa, pwc - dc * sinCa], [0, pwc + dc],
    [0, (L - SIDE.pw) / 2 - ds], [-ds * cosSa, (L - SIDE.pw) / 2 + ds * sinSa],
    [-CW, (L - SIDE.pw) / 2 + CW * sinSa],
  ];
  const head = [
    [pwc - CW * tanCa, -CW], [pwc - dc * sinCa, -dc * cosCa], [pwc + dc, 0],
    [W - pwc - dc, 0], [W - pwc + dc * sinCa, -dc * cosCa], [W - pwc + CW * tanCa, -CW],
  ];
  const mirY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  const mirX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  return [leftBottom, mirY(leftBottom), mirX(leftBottom), mirX(mirY(leftBottom)), head, mirY(head)];
}
const toPlan = (poly) => poly.map(([kx, ky]) => [ky - L / 2, kx - W / 2]); // [x,z]

// wood rail plan polygons (table.js leftRailPlan/endRailPlan, arcs coarsened)
const KIN = -(CW - 0.002), KOUT = -(CW + FW), C0 = -0.032;
const SNR = SIDE.radius + 0.022, SC = [-SIDE.depth, L / 2];
function arcPts(cx, cy, r, a0, a1, n = 6) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
function woodPlans() {
  const th = Math.acos((KIN - SC[0]) / SNR);
  const left = [[KIN, C0 - KIN], ...arcPts(SC[0], SC[1], SNR, -th, th - 2 * Math.PI, 8),
    [KIN, L - (C0 - KIN)], [KOUT, L - (C0 - KOUT)], [KOUT, C0 - KOUT]];
  const end = [[C0 - KIN, KIN], [W - (C0 - KIN), KIN],
    [W - (C0 - KOUT), KOUT], [C0 - KOUT, KOUT]];
  const flipX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const flipY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  return [left, flipX(left), end, flipY(end)];
}

// GH-621 (D621-LOOK, D621-O1): footprint-parameterised twins of the two pool
// plan builders above for the Diamond Pro-Am 8 ft / 7 ft classes. The kernel
// derivation is `..diamond_proam_9ft()` with only length/width changed, so
// every pocket constant (pwc, dc, ds, SIDE.*) is the pool's own; only the
// bed extents move. The pool functions stay byte-untouched (zero-drift law).
function railPolysKernelFor(tl, tw) {
  const leftBottom = [
    [-CW, pwc - CW * tanCa], [-dc * cosCa, pwc - dc * sinCa], [0, pwc + dc],
    [0, (tl - SIDE.pw) / 2 - ds], [-ds * cosSa, (tl - SIDE.pw) / 2 + ds * sinSa],
    [-CW, (tl - SIDE.pw) / 2 + CW * sinSa],
  ];
  const head = [
    [pwc - CW * tanCa, -CW], [pwc - dc * sinCa, -dc * cosCa], [pwc + dc, 0],
    [tw - pwc - dc, 0], [tw - pwc + dc * sinCa, -dc * cosCa], [tw - pwc + CW * tanCa, -CW],
  ];
  const mirY = (p) => p.map(([x, y]) => [x, tl - y]).reverse();
  const mirX = (p) => p.map(([x, y]) => [tw - x, y]).reverse();
  return [leftBottom, mirY(leftBottom), mirX(leftBottom), mirX(mirY(leftBottom)), head, mirY(head)];
}
function woodPlansFor(tl, tw) {
  const sc = [-SIDE.depth, tl / 2];
  const th = Math.acos((KIN - sc[0]) / SNR);
  const left = [[KIN, C0 - KIN], ...arcPts(sc[0], sc[1], SNR, -th, th - 2 * Math.PI, 8),
    [KIN, tl - (C0 - KIN)], [KOUT, tl - (C0 - KOUT)], [KOUT, C0 - KOUT]];
  const end = [[C0 - KIN, KIN], [tw - (C0 - KIN), KIN],
    [tw - (C0 - KOUT), KOUT], [C0 - KOUT, KOUT]];
  const flipX = (p) => p.map(([x, y]) => [tw - x, y]).reverse();
  const flipY = (p) => p.map(([x, y]) => [x, tl - y]).reverse();
  return [left, flipX(left), end, flipY(end)];
}

// ---- per-table-class geometry (GH-337) --------------------------------------
// Kernel corner-origin plan builders for the snooker and carom classes,
// mirrored from web/scene/table.js (railPolysTemplate / railPolysCarom and
// the CEBP canonical-jaw constructions) at the same coarseness the pool
// mirror uses. The pool constants/functions above stay byte-untouched —
// zero-drift law.
const toPlanFor = (tl, tw) => (poly) => poly.map(([kx, ky]) => [ky - tl / 2, kx - tw / 2]);

// circle-circle intersection (table.js circInter / kernel circle_intersections twin)
function circInter(c1, r1, c2, r2) {
  const dx = c2[0] - c1[0], dy = c2[1] - c1[1];
  const d = Math.hypot(dx, dy);
  const a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const ux = dx / d, uy = dy / d;
  const fx = c1[0] + a * ux, fy = c1[1] + a * uy;
  return [[fx - h * uy, fy + h * ux], [fx + h * uy, fy - h * ux]];
}

// WPBSA 12-ft snooker (wpbsa_snooker_12ft, catalog v7 Amendment A1): the
// CEBP 2005/6 template construction at scale 1.0 — table.js CEBP block +
// cornerCanonical/middleCanonical mirrored verbatim.
const SNOOKER = (() => {
  const IN = 0.0254;
  const cornerTangency = (5.43 - 1.875) * IN;
  const cornerR1 = 3.00 * IN, cornerR2 = 4.50 * IN, cornerFallR = 3.50 * IN;
  const cornerFallOff = 1.875 * IN;
  const cornerJunction = Math.PI / 2 + Math.atan2(6.15 - 5.43, 4.32 - 3.00);
  const middleTangency = 4.344 * IN;
  const middleR1 = 3.125 * IN, middleR2 = 2.094 * IN, middleFallR = 2.094 * IN;
  const middleFallDepth = (1.875 + 0.156) * IN;
  const middleJunction = 54 * Math.PI / 180;
  // corner canonical jaw (table.js cornerCanonical, s = 1)
  const cc1 = [cornerTangency, -cornerR1];
  const cc2 = [cc1[0] - (cornerR2 - cornerR1) * Math.cos(cornerJunction),
    cc1[1] - (cornerR2 - cornerR1) * Math.sin(cornerJunction)];
  const cf = [-cornerFallOff, -cornerFallOff];
  const cCands = circInter(cc2, cornerR2, cf, cornerFallR);
  const cx = cCands[0][0] + cCands[0][1] >= cCands[1][0] + cCands[1][1]
    ? cCands[0] : cCands[1];
  const corner = {
    ut: cornerTangency, c1: cc1, r1: cornerR1, a1: [Math.PI / 2, cornerJunction],
    c2: cc2, r2: cornerR2,
    a2: [cornerJunction, Math.atan2(cx[1] - cc2[1], cx[0] - cc2[0])],
    x: cx, rf: cornerFallR,
  };
  // middle canonical jaw (table.js middleCanonical, s = 1)
  const mc1 = [-middleTangency, -middleR1];
  const mc2 = [mc1[0] - (middleR2 - middleR1) * Math.cos(middleJunction),
    mc1[1] - (middleR2 - middleR1) * Math.sin(middleJunction)];
  const mf = [0, -middleFallDepth];
  const mCands = circInter(mc2, middleR2, mf, middleFallR);
  const mx = mCands[0][1] >= mCands[1][1] ? mCands[0] : mCands[1];
  const middle = {
    ut: middleTangency, c1: mc1, r1: middleR1, a1: [Math.PI / 2, middleJunction],
    c2: mc2, r2: middleR2,
    a2: [middleJunction, Math.atan2(mx[1] - mc2[1], mx[0] - mc2[0])],
    x: mx, rf: middleFallR,
  };
  // ---- GH-489 W6 pocket-construction context (table.js snookerFallCtx
  // at s = 1; corner adjudication c5259957376, middle c5260535193) ------
  // The kernel capture disc is NOT a slate hole: the VISIBLE fall is the
  // CEBP drop label — corner Ø 3.313 in = 84.15 mm, middle Ø 3.906 in =
  // 99.21 mm (middle concentric with the kernel capture centre). The
  // corner cup centre is solved on the pocket diagonal from the
  // adjudicated wood-end pins (gap chord 102.7 mm at 55.3 mm from the
  // cup, against the kernel jaw tip): cupD ≈ −6.24 mm canonical, i.e.
  // 6.24 mm OUTSIDE the nose corner on both axes. Corner end faces sit at
  // uFaceC = w1u ≈ 44.58 mm from the corner point; middle end faces at
  // ±54 mm (the Star 108 ± 8 mm gap). wallT/taper/lip = the 8 mm jaw-wall
  // cloth band, the 40 mm loft/plank taper run, the 4 mm fall-arris roll.
  const rvC = (3.313 * IN) / 2, rvM = (3.906 * IN) / 2;
  const tipChord = Math.SQRT2 * Math.abs(cx[0] - cx[1]);
  const wEnd = (0.1027 - tipChord) / 2;
  const w1u = cx[0] + wEnd * Math.SQRT1_2, w1v = cx[1] - wEnd * Math.SQRT1_2;
  const cB = w1u + w1v, cC = w1u * w1u + w1v * w1v - 0.0553 ** 2;
  const cupD = (cB - Math.sqrt(Math.max(cB * cB - 2 * cC, 0))) / 2; // ≈ −6.24 mm
  const fcx = { rvC, rvM, cupD, uFaceC: w1u, uFaceM: 0.054,
    wallT: 0.008, taper: 0.040, lip: 0.004 };
  // FW 0.0935 (GH-518): nose→outer band 141 mm from the Star XW101-12S
  // manufacturer overall 3850 × 2060 mm vs the WPBSA playing area — the
  // live table.js wpbsa_snooker_12ft render.frameWidth mirror.
  return { L: 3.569, W: 1.778, CW: 1.875 * IN, FW: 0.0935,
    corner, middle, mfd: middleFallDepth, fcx };
})();

/** GH-489 W6 jaw-band offset — table.js snkJawBandPts mirrored verbatim.
 * BAND LAW: the cloth band behind the kernel jaw plan sits 8 mm radially
 * behind it (fcx.wallT), but never shallower than 30 mm behind the NOSE
 * LINE — the snooker cross-section recedes up to ~28 mm, so every station
 * still under the profiled nose keeps full interior depth (the live
 * cushion-profile checker's ring self-intersection gate red-caught the
 * shallow-band first cuts). `extraIn` rides the plank boundary 0.5 mm
 * INSIDE the cloth band; dir = +1 samples a0→a1, −1 reversed. Canonical
 * frames: v = signed depth behind the nose (< 0 behind). */
function snkJawBand(canon, fcx, extraIn, dir) {
  const out = [];
  const vMax = -(0.030 - extraIn); // full-profile depth clamp
  const seg = (cc, rr0, a0, a1, n, skipFirst = false) => {
    for (let i = skipFirst ? 1 : 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const w = fcx.wallT - extraIn;
      out.push([cc[0] + (rr0 - w) * Math.cos(a),
        Math.min(cc[1] + (rr0 - w) * Math.sin(a), vMax)]);
    }
  };
  // W8 (review r8 P2): the second arc SKIPS its first sample — both arcs
  // include endpoints and share the C1/C2 tangent point, so every rail
  // band carried one zero-length edge (cushionPlanCtx normalized it to
  // (0,0): hard chain breaks / zero-area faces / zero normals).
  if (dir > 0) {
    seg([canon.c1[0], canon.c1[1]], canon.r1, canon.a1[0], canon.a1[1], 12);
    seg([canon.c2[0], canon.c2[1]], canon.r2, canon.a2[0], canon.a2[1], 10,
      true);
  } else {
    seg([canon.c2[0], canon.c2[1]], canon.r2, canon.a2[1], canon.a2[0], 10);
    seg([canon.c1[0], canon.c1[1]], canon.r1, canon.a1[1], canon.a1[0], 12,
      true);
  }
  // W8 (review r10 P2, mechanism verified live): the vMax depth clamp
  // collapses consecutive samples onto the same clamped point — duplicate
  // contour vertices degenerate extrude caps (a 12-vertex plank cap
  // triangulated 9 instead of 10) and sides. Dedupe consecutive points;
  // the polygon SHAPE is untouched.
  const ded = [out[0]];
  for (let i = 1; i < out.length; i++) {
    const p = out[i];
    const q = ded[ded.length - 1];
    if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) ded.push(p);
  }
  return ded;
}

/** Snooker cushion bodies — table.js railPolysTemplate (snooker branch)
 * mirrored: sampled tangent two-arc jaws with exact rail-endpoint
 * vertices; same arc sample counts. GH-489 W6: the pocket-end closures
 * are the CONSTRUCTION rebuild — the old capture-circle hug was the
 * "drilled basket" read the owner rejected; the loft terminal now runs
 * back-line taper → variable-depth jaw band (snkJawBand, the kernel jaw
 * arcs' exact parallel curve at r − wallT) → a short cloth cap across
 * the wood-end wrap onto the kernel jaw tip. The class bakes these with
 * prismConcave (ear-clipped caps — review r4): the jaw ends and the wood
 * planks are concave, so the centroid cap fan grew phantom surfaces. */
function railPolysSnooker() {
  const { L, W, CW, corner, middle, fcx } = SNOOKER;
  const utc = corner.ut, utm = middle.ut;
  const swap = ([x, y]) => [y, x];
  const mapMid = ([u, v]) => [v, L / 2 + u];
  const cornerFall = [
    [utc + fcx.taper, -CW], // taper start ON the back line
    ...snkJawBand(corner, fcx, 0, 1),
    corner.x, // cloth cap across the wood-end wrap onto the kernel tip
  ];
  const middleFall = [
    middle.x, // (sliced off by the consumers — the jaw chain owns the tip)
    ...snkJawBand(middle, fcx, 0, -1),
    [-utm - fcx.taper, -CW], // taper to the back line
  ].map(mapMid);
  const cornerJaw = [
    ...arcPts(corner.c2[0], corner.c2[1], corner.r2, corner.a2[1], corner.a2[0], 10),
    ...arcPts(corner.c1[0], corner.c1[1], corner.r1, corner.a1[1], corner.a1[0], 12)
      .slice(1, -1),
    [utc, 0],
  ];
  const middleJaw = [
    [0, L / 2 - utm],
    ...arcPts(middle.c1[0], middle.c1[1], middle.r1, middle.a1[0], middle.a1[1], 12)
      .map(mapMid).slice(1),
    ...arcPts(middle.c2[0], middle.c2[1], middle.r2, middle.a2[0], middle.a2[1], 10)
      .map(mapMid).slice(1),
  ];
  const head = [
    ...cornerFall,
    ...cornerJaw.slice(1),
    [W - utc, 0],
    ...cornerJaw.map(([x, y]) => [W - x, y]).reverse().slice(1),
    ...cornerFall.map(([x, y]) => [W - x, y]).reverse().slice(1),
  ];
  const leftBottom = [
    ...cornerFall.map(swap),
    ...cornerJaw.map(swap).slice(1),
    ...middleJaw,
    ...middleFall.slice(1),
  ];
  const mirY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  const mirX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const leftTop = mirY(leftBottom);
  return [leftBottom, leftTop, mirX(leftBottom), mirX(leftTop), head, mirY(head)];
}

/** Snooker wood rail plans — table.js snookerPlankPlans mirrored (GH-489
 * W6; corner adjudication c5259957376 §1a + middle c5260535193 §1a): the
 * continuous notched plank ring (templateLeftRailPlan family) is the
 * construction the owner rejected — real rails END before every pocket in
 * SQUARED bare-wood faces ⊥ the rail axis, and around the outside of each
 * opening there is NO wood at all. Each long rail is TWO planks (corner
 * face at uFaceC ≈ 44.58 mm from the corner point → middle face at ±54 mm
 * from the middle centre) and each end rail ONE plank (corner face →
 * corner face). Near a pocket the plank inner boundary leaves the
 * straight KIN edge on the 40 mm taper and rides the jaw-band parallel
 * curve 0.5 mm INSIDE the loft's 8 mm cloth wall (wood meets cloth with
 * overlap, never a sliver gap); corner end faces carry the rounded OUTER
 * corner (r = 7 mm). Entries 6..9 are the GH-489 W6 RESHAPED gold corner
 * castings (table.js obSnkCasting; §1e): the frame-corner square bounded
 * by the two wood end-face lines and the plank outer edges, minus a
 * keep-arc about the visible fall cup at rvC + (5+49−2.5) mm — the wall
 * buries the boot face's band-level strip. They bake as gold prisms on the
 * live casting band y ∈ [0.018, 0.047] (TABLES castFrom/castY0); the
 * pre-W6 diagonal cast wedges are retired with the plank ring. Same arc
 * sample counts as the live builder throughout. */
function woodPlansSnooker() {
  const { L, W, CW, FW, corner, middle, fcx } = SNOOKER;
  // W14 (GH489-EXT-R1.2 letter E31): the capping inner edge rides 28 mm
  // behind the nose (0.5 mm cloth tuck) — the table.js twin moved with it
  const KIN = -(0.028 - 0.0005), KOUT = -(CW + FW);
  const utc = corner.ut, utm = middle.ut;
  const RND = 0.007; // corner-face outer rounding (photo r ≈ 6–8 mm)
  // plank inner boundaries ride the SAME variable-depth jaw band as the
  // loft closure, 0.5 mm inside it, trimmed at the squared face stations
  // review W11 r8 P2: keep the PLANK-side band section (the W6 filter
  // kept the pocket side and folded every outline back through its own
  // end face — the runtime twin in table.js carries the same fix)
  const cornerBand = snkJawBand(corner, fcx, 0.0005, -1)
    .filter(([u]) => u >= fcx.uFaceC);
  const cornerEnd = [
    // rounded outer corner: arc centre (uFaceC + RND, KOUT + RND)
    ...arcPts(fcx.uFaceC + RND, KOUT + RND, RND,
      Math.PI, 1.5 * Math.PI, 4).reverse(),
    [fcx.uFaceC, cornerBand.length
      ? cornerBand[0][1] : KIN], // face inner corner (first in-band point)
    ...cornerBand,
    [utc + fcx.taper, KIN], // taper onto the straight inner edge
  ];
  const middleBand = snkJawBand(middle, fcx, 0.0005, 1)
    .filter(([u]) => u <= -fcx.uFaceM); // plank-side (review W11 r8)
  const middleEnd = [
    [-utm - fcx.taper, KIN], // leave the straight edge on the taper
    ...middleBand,
    [-fcx.uFaceM, middleBand.length
      ? middleBand[middleBand.length - 1][1] : KIN], // face inner corner
    [-fcx.uFaceM, KOUT], // squared face out to the plank outer edge
  ];
  // LEFT-RAIL bottom-half plank, kernel coords [x across (v), y along (u)]
  const leftBottom = [
    ...cornerEnd.map(([u, v]) => [v, u]),
    ...middleEnd.map(([u, v]) => [v, L / 2 + u]),
  ];
  const leftTop = leftBottom.map(([x, y]) => [x, L - y]).reverse();
  // END-RAIL plank: canonical [u, v] IS the head plan frame
  const head = [
    ...cornerEnd,
    ...cornerEnd.map(([x, y]) => [W - x, y]).reverse(),
  ].reverse();
  // W14 (signed drawing GH489-EXT-R1.2; owner sign-off #489): the gold
  // corner casting SHOULDERS are DELETED with the live obSnkCasting —
  // 角部无第三块体, the leather horseshoe is the corner (E13/E17/E28).
  const flipX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const flipY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  return [leftBottom, leftTop, flipX(leftBottom), flipX(leftTop),
    head, flipY(head)];
}

// Chinese 8-ball tournament 9-ft (chinese8_pro_9ft, catalog v15/GH-490;
// joy_q8_9ft aliases it): the CEBP template construction under the
// fall-opening-pinned uniform scales (corner 85/84.15 = 1.0101, middle
// 100/99.21 = 1.0079) on the repinned 2540 × 1260 mm surface.
// GH-490 ROUND-33 (audit wf_215d74b4-8ad): FW mirrors the live
// frameWidth 0.043894 — rail-top outer EDGE = CW + FW = the drawing's
// 92 mm window line. Same mirror coarseness as SNOOKER above.
// GH-490 ROUND-36 (rev-8.4 owner-approved 2026-08-19, audit
// wf_99271c60-0b3): the r33 reading that the manufacturer 2820×1540
// footprint is the BODY face retired with the rejected shell — the
// under-frame face is RECESSED to X_body = 92 − t_sk = 76 mm (U1/U2;
// blinds/beams/deck strips + apron envelope ride CN8_X_BODY below).
// CN8_SKIRT_FW survives only for the r32-signed stances that never
// were body faces: the gold-leg stance and the side-pocket bulge
// drape plane (table.js mirror).
// GH-490 ROUND-31's 库边顶 z42, named once so the bayBoots proxy's own top and
// the class frame top cannot drift apart. The drawing states the bay cover's
// top edge BC-04 = DT-05 = the rail/frame top plane, and the proxy relies on
// that: its box runs to frameTop and is meant to stand for the cover. Asserted
// rather than re-typed from the contract (ADR-0015 forbids a second hand-typed
// copy, and this number predates the contract) — if a future revision moves
// the cover's top edge off the frame top, the proxy silently stops mirroring
// the cover, so this throws instead of baking a lie.
const CN8_FRAME_TOP = 0.042;
if (Math.abs(MID_GEO.LP06 - (CN8_FRAME_TOP - 0.0003)) > 1e-9) {
  throw new Error('cn8 middle contract: LP-06 '
    + `${MID_GEO.LP06 * 1000} mm is no longer 0.3 under the chinese8 frame top `
    + `${CN8_FRAME_TOP * 1000} mm — the bayBoots proxy runs to frameTop and `
    + 'is meant to stand for the leather body top, so it would stop mirroring it');
}
const CN8_SKIRT_FW = 0.092; // leg stance / side-bay drape (table.js mirror)
const CN8_X_BODY = 0.124; // U2 = A_r − t_sk on the card 17b A_r 140 (table.js mirror; docs/geometry/cn8-corner-furniture-definition-contract.json)
const CN8 = (() => {
  const IN = 0.0254;
  const cs = 0.085 / (3.313 * IN); // corner fall-opening scale (1.0101)
  const ms = 0.100 / (3.906 * IN); // middle fall-opening scale (1.0079)
  const cornerTangency = (5.43 - 1.875) * IN * cs;
  const cornerR1 = 3.00 * IN * cs, cornerR2 = 4.50 * IN * cs;
  const cornerFallR = 3.50 * IN * cs;
  const cornerFallOff = 1.875 * IN * cs;
  const cornerJunction = Math.PI / 2 + Math.atan2(6.15 - 5.43, 4.32 - 3.00);
  const middleTangency = 4.344 * IN * ms;
  const middleR1 = 3.125 * IN * ms, middleR2 = 2.094 * IN * ms;
  const middleFallR = 2.094 * IN * ms;
  const middleFallDepth = (1.875 + 0.156) * IN * ms;
  const middleJunction = 54 * Math.PI / 180;
  const cc1 = [cornerTangency, -cornerR1];
  const cc2 = [cc1[0] - (cornerR2 - cornerR1) * Math.cos(cornerJunction),
    cc1[1] - (cornerR2 - cornerR1) * Math.sin(cornerJunction)];
  const cf = [-cornerFallOff, -cornerFallOff];
  const cCands = circInter(cc2, cornerR2, cf, cornerFallR);
  const cx = cCands[0][0] + cCands[0][1] >= cCands[1][0] + cCands[1][1]
    ? cCands[0] : cCands[1];
  const corner = {
    ut: cornerTangency, c1: cc1, r1: cornerR1, a1: [Math.PI / 2, cornerJunction],
    c2: cc2, r2: cornerR2,
    a2: [cornerJunction, Math.atan2(cx[1] - cc2[1], cx[0] - cc2[0])],
    x: cx, rf: cornerFallR,
  };
  const mc1 = [-middleTangency, -middleR1];
  const mc2 = [mc1[0] - (middleR2 - middleR1) * Math.cos(middleJunction),
    mc1[1] - (middleR2 - middleR1) * Math.sin(middleJunction)];
  const mf = [0, -middleFallDepth];
  const mCands = circInter(mc2, middleR2, mf, middleFallR);
  const mx = mCands[0][1] >= mCands[1][1] ? mCands[0] : mCands[1];
  const middle = {
    ut: middleTangency, c1: mc1, r1: middleR1, a1: [Math.PI / 2, middleJunction],
    c2: mc2, r2: middleR2,
    a2: [middleJunction, Math.atan2(mx[1] - mc2[1], mx[0] - mc2[0])],
    x: mx, rf: middleFallR,
  };
  // card 17b C4 = B: the rail-top outer EDGE is the MFR outer face 140 — FW = 0.140 − CW (table.js mirror)
  return { L: 2.54, W: 1.26, CW: 1.875 * IN * cs, FW: 0.140 - 1.875 * IN * cs,
    corner, middle, cfo: cornerFallOff, mfd: middleFallDepth };
})();

// GH-490 ROUND-31 (rev-8.2 model round; GI bake regen): the drawing twin —
// letters/solved coordinates VERBATIM from table.js CN8_R82 (itself verbatim
// from the signed proposal_rev8_2.json; duplicated-literal law — change them
// together). Subset the bake mirror consumes; mm → m, drawing frame:
// (px, py) maps to world (sx·(L/2 + px), sz·(W/2 + py)) per corner.
// GH-1080 D2b (owner card 41: corner F2 with the sharp wall/circle junction):
// verbatim twin of table.js CN8_F2 — the same expressions, so the same
// doubles (duplicated-literal law: change them together; the GI mirror census
// compares mirror and live geometry).
const CN8_F2M = (() => {
  const T = 0.09015138956779158; // PHOTO: departure from the nose-line corner N
  const RF = 0.07219887303483237; // PHOTO: nose fillet radius
  const TH = 3.410678706496409 * Math.PI / 180; // PHOTO: wall opening per side
  const RB = 0; // MODEL(Star): sharp wall-to-ring junction (A1 fill; see above)
  const C = 0.0035, R = 0.0525; // RETAINED: O_f = (C, C), the Ø105 mouth circle
  // drawing frame (CN8_R82): x behind this rail's nose line, y along it
  // (negative away from the corner); astra's (u, v) maps to (−v, −u).
  const a = Math.PI * 0.75 + TH;
  const n = [Math.cos(a), Math.sin(a)], d = [-Math.sin(a), Math.cos(a)];
  const c = [T, -RF], tw = [c[0] + RF * n[0], c[1] + RF * n[1]];
  const v = [tw[0] + RB * n[0] + C, tw[1] + RB * n[1] + C];
  const vn = v[0] * n[0] + v[1] * n[1], vd = v[0] * d[0] + v[1] * d[1];
  const len = -vd + Math.sqrt((R - RB) ** 2 - vn * vn);
  const fw = [tw[0] + len * d[0], tw[1] + len * d[1]];
  const cb = [fw[0] + RB * n[0], fw[1] + RB * n[1]];
  const k = R / (R - RB), end = [-C + k * (cb[0] + C), -C + k * (cb[1] + C)];
  // fillet circle ∩ mouth circle on the drawn fillet arc (the kernel's
  // roll∩circle station X_N of the retired R45 family)
  const dx = -C - c[0], dy = -C - c[1], D = Math.hypot(dx, dy);
  const p = (D * D + RF * RF - R * R) / (2 * D), h = Math.sqrt(RF * RF - p * p);
  const fx = c[0] + p * dx / D, fy = c[1] + p * dy / D;
  const xn = [[fx - h * dy / D, fy + h * dx / D], [fx + h * dy / D, fy - h * dx / D]]
    .find((q) => {
      const ang = Math.atan2(q[1] - c[1], q[0] - c[0]);
      return ang >= Math.PI / 2 - 1e-12 && ang <= a + 1e-12;
    });
  const M = ([u, w]) => [-w, -u];
  const psi = ([x, y]) => 45 - Math.atan2(y - C, x - C) * 180 / Math.PI;
  const twD = M(tw), fwD = M(fw);
  const wl = Math.hypot(fwD[0] - twD[0], fwD[1] - twD[1]);
  const wd = [(fwD[0] - twD[0]) / wl, (fwD[1] - twD[1]) / wl];
  return {
    T, RF, TH, RB,
    O_N: M(c), T_W: twD, F_W: fwD, E_C: M(cb), F_C: M(end), X_N: M(xn),
    WALL_D: wd, WALL_N: [wd[1], -wd[0]], // unit direction; normal away from the void
    PSI_F: psi(M(end)), PSI_B: psi(M(xn)),
  };
})();

const CN8_R82M = {
  C: 0.0035, // O_f = nose corner + (3.5, 3.5)
  R: 0.0525, // R_mouth (Ø105)
  W_C: 0.045, // back line (armrest front face)
  R_N: CN8_F2M.RF, // F2 nose fillet
  R_B: 0.045, // back arc radius (leather)
  Y_CUT: -0.040, // wood cut ⊥ rail
  W_L: 0.084, // leather annulus width — card 17b: A_r − c − R on the 140 window (was 36)
  A_R: 0.140, // window line (leather↔wood seam) — the MFR outer face (card 17b C4 = B)
  R_BL: CN8_F2M.RB, // 0: the sharp wall/circle junction (A1 fill)
  O_N: CN8_F2M.O_N, // nose fillet centre
  Y_N: -CN8_F2M.T, // nose line departure
  T_W: CN8_F2M.T_W, // fillet→wall tangency
  E_C: CN8_F2M.E_C, // blend centre (= F_W = F_C for the sharp junction)
  F_W: CN8_F2M.F_W, // wall end
  F_C: CN8_F2M.F_C, // wall/circle junction
  WALL_N: CN8_F2M.WALL_N, // wall outward normal (unit)
  O_B: [0.090, -0.04148888751680797], // back arc centre
  Q_DEP: [0.045, -0.04148888751680797], // back line departure
  S: [0.05007692307692307, -0.02072478558597352], // seam tangency
  X_BC: 0.045024637700599975, // cut ∩ back arc
  PSI_S: 72.48, // seam tangency station (deg, ψ about O_f from the diagonal)
  DECK: 0.042, // 库边顶 z42 (plank top + cushion cloth deck)
  SHOULDER: 0.0445, // leather crown band representative height (皮肩)
};

/** Chinese-8 cushion bodies — GH-490 ROUND-31 (rev-8.2 model round): mirror
 * of table.js railPolysCn8R82. The CEBP corner two-arc jaws + corner fall
 * arcs RETIRE — each rail body ends at the drawing's nose-line departure
 * station y_n (the F2 departure, 90.151 mm from the nose corner) with a
 * straight ⊥ end face;
 * the corner throat is the assembly's own geometry (cn8CornerAssemblies
 * below). Side-pocket jaw sweeps stay byte-identical. */
function railPolysCn8() {
  const { L, W, CW, corner, middle } = CN8;
  const utc = corner.ut, utm = middle.ut;
  const dep = -CN8_R82M.Y_N;
  const mapMid = ([u, v]) => [v, L / 2 + u];
  // BUILD-3 (review round 12 P1-b): the middle end is the LIVE law — jaw arc 1
  // carried on to the rail cut plane |u| = DT-09 (JW-05 there) and straight
  // back to the back line — through the SAME function the renderer uses
  // (web/scene/cn8midlaw.js cn8MidJawEnd; table.js railPolysCn8R82).  The
  // retired arc 2 + fall-circle wrap (the r1–r11 mouth) that this mirror kept
  // appending is gone: the committed chinese8 GI maps had been baked against
  // 7.6–11.6 mm of phantom cushion per side.  The renderer's loft runs 8 mm
  // past the plane and is clipped there; the prism needs no clip, so the
  // mirror ends exactly on the plane (cutU = DT-09 from the contract).
  const middleJaw = [
    [0, L / 2 - utm],
    ...cn8MidJawEnd(middle, CW, MID_GEO.DT09, 24).slice(1).map(mapMid),
  ];
  // the CEBP jaw-tangency station utc (≈ 91.2) rides the straight nose run
  // as an exact vertex, just outboard of the F2 departure y_n 90.151
  const leftBottom = [
    [-CW, dep], // back face foot at the departure station
    [0, dep], // the nose line departs here (the F2 fillet takes over)
    [0, utc], // exact kernel rail endpoint (drift-gate vertex)
    ...middleJaw,
  ];
  const head = [
    [dep, -CW], [dep, 0], [utc, 0], [W - utc, 0], [W - dep, 0], [W - dep, -CW],
  ];
  const mirY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  const mirX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const leftTop = mirY(leftBottom);
  return [leftBottom, leftTop, mirX(leftBottom), mirX(leftTop), head, mirY(head)];
}

/** Chinese-8 wood rail plans — GH-490 ROUND-31 (rev-8.2 model round):
 * mirror of table.js cn8LeftRailPlanHalves + cn8EndRailPlan on the drawing
 * letters (plan coordinates verbatim, incl. the 3.5 mm bevel inset — the
 * beveled top edge lands ON the drawing back line — and the 0.2 mm
 * under-leather overlap past the cut).  The r22 L-cut (Cut A/Cut B about
 * the retired 51.6 mm fillet centre), the corner-notch CLAMP arc and the
 * r20 fillet-arc outer-corner cut ALL RETIRE with the old mouth: each
 * plank's inner edge is the BACK LINE W_c 45, its corner end is ONE
 * straight full-depth cut ⊥ the rail at y_cut −40, joined through the
 * R_B 45 arc piece Q_DEP → X_BC.  The corner square between the cuts is
 * the assembly's own geometry (cn8CornerAssemblies below).  CUT is the
 * contract's DT-09 (BUILD-3; was the retired literal 0.046). */
function woodPlansCn8() {
  const { L, W, CW, FW } = CN8;
  const KOUT = -(CW + FW);
  const R8 = CN8_R82M;
  // BUILD-3 (review round 12 P1-b): the rail-end slot half-width is the contract's
  // DT-09 (the leather's straight back, LP-01 / 2) — the same letter table.js
  // cn8LeftRailPlanHalves reads through CN8_MID (gate row midext-contract asserts
  // that mirror against the JSON).  The r1–r11 literal 0.046 (a 92 mm bay) is retired.
  const CUT = MID_GEO.DT09;
  const BV = 0.0035; // extrude bevel inset (railWoodOpts bevelSize)
  // long half (frame: x across, NEGATIVE outboard of the nose; y along 0..L)
  const aQ = 0; // R_B arc angle at Q_DEP (back-line tangency)
  const aX = Math.atan2(-R8.Y_CUT + R8.O_B[1], -R8.X_BC + R8.O_B[0]);
  const halfBot = [
    [-(R8.W_C - BV), L / 2 - CUT], // inner edge (背线 45 top edge)
    [-(R8.W_C - BV), -R8.Q_DEP[1]], // back line foot Q_DEP
    ...arcPts(-R8.O_B[0], -R8.O_B[1], R8.R_B - BV, aQ, aX, 4).slice(1),
    [-R8.X_BC - 0.001, -R8.Y_CUT - 0.0002], // 0.2 mm under-leather overlap
    [KOUT, -R8.Y_CUT - 0.0002],
    [KOUT, L / 2 - CUT], // outer edge up to the bulge end face
  ];
  const halfTop = halfBot.map(([x, y]) => [x, L - y]).reverse();
  // end plank (frame: x along the width from the nose corner; y across,
  // negative outboard) — table.js cn8EndRailPlan verbatim
  const aQe = Math.PI / 2;
  const aXe = Math.acos((-R8.Y_CUT + R8.O_B[1]) / (R8.R_B - BV));
  const endL = [
    [-R8.Q_DEP[1], -(R8.W_C - BV)], // back-line foot Q_DEP on the inner edge
    ...arcPts(-R8.O_B[1], -R8.O_B[0], R8.R_B - BV, aQe, aXe, 4).slice(1),
    [-R8.Y_CUT - 0.0002, -R8.X_BC - 0.001],
    [-R8.Y_CUT - 0.0002, KOUT],
  ];
  const end = [...endL, ...endL.map(([x, y]) => [W - x, y]).reverse()];
  const flipX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const flipY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  return [halfBot, halfTop, flipX(halfBot), flipX(halfTop), end, flipY(end)];
}

/** GH-490 ROUND-31: the corner assembly plans (per corner: leather boot +
 * two green tongues + the JOY corner block), mirrored COARSELY from
 * table.js buildCornerR82 at bake resolution (~10 mm plan texels) —
 * centered world [x, z] plan polygons + a representative top height per
 * piece.  The crest chain / boot sweep boundaries reuse the drawing
 * letters verbatim; the crown's 55 mm apex ring and the 36 mm lip band
 * are folded into the single SHOULDER-family top (0.0445) — sub-texel at
 * this raster, disclosed here. */
function cn8CornerAssemblies() {
  const { L, W, CW } = CN8;
  const K = CN8_R82M;
  // GH-490 ROUND-36 (rev-8.4 U6 角上皮外=空气, owner-approved): the r33
  // corner DECK plate stand-in is DELETED with the live shell — the
  // corner square outboard of the boot is AIR to the venue floor; the
  // wood block itself stays the sub-texel wall under the leather
  // (outer chain = the drawing tangent chain, letters P18a-d).
  // crest chain, jaw A (drawing frame): dep → F2 fillet → T_W → wall →
  // F_W → (blend, or the sharp junction) → F_C (table.js cn8MouthOccGeom chain)
  const chain = [];
  {
    const aDep = Math.PI;
    const aTW = Math.atan2(K.T_W[1] - K.O_N[1], K.T_W[0] - K.O_N[0]);
    // R1 r2 (defect-c GI-mirror fidelity): the mirror chain rises to
    // the LIVE resolution (NR/NW/NB 10/4/4 -> 22/14/12, table.js
    // buildCornerR82 NROLL/NWL/NB) — the coarse chain polygonized the
    // class boundary the bake receivers/blockers see at the jaw, and
    // the live meshes now consume that boundary's transport (the
    // stored-ladder deletion).
    const NR = 22;
    for (let i = 0; i <= NR; i++) {
      const a = aDep + (aTW - aDep) * (i / NR);
      chain.push([K.O_N[0] + K.R_N * Math.cos(a),
        K.O_N[1] + K.R_N * Math.sin(a)]);
    }
    const NW = 14;
    for (let i = 1; i <= NW; i++) {
      const t = i / NW;
      chain.push([K.T_W[0] + (K.F_W[0] - K.T_W[0]) * t,
        K.T_W[1] + (K.F_W[1] - K.T_W[1]) * t]);
    }
    // the blend, or the sharp junction's zero-radius limit (table.js
    // cn8MouthOccGeom: NB coincident points, normals fanning wall → radial)
    const sharp = !(K.R_BL > 0);
    const aFw = sharp ? Math.atan2(K.WALL_N[1], K.WALL_N[0])
      : Math.atan2(K.F_W[1] - K.E_C[1], K.F_W[0] - K.E_C[0]);
    const aFc = sharp ? Math.atan2(K.F_C[1] - K.C, K.F_C[0] - K.C)
      : Math.atan2(K.F_C[1] - K.E_C[1], K.F_C[0] - K.E_C[0]);
    const NB = 12;
    for (let i = 1; i <= NB; i++) {
      const a = aFw + (aFc - aFw) * (i / NB);
      chain.push([K.E_C[0] + K.R_BL * Math.cos(a),
        K.E_C[1] + K.R_BL * Math.sin(a)]);
    }
  }
  const swapP = ([x, y]) => [y, x]; // mirror across the diagonal px = py
  // ψ stations about O_f (deg from the outward diagonal — table.js)
  const uPsi = (ps) => {
    const a = (45 - ps) * Math.PI / 180;
    return [Math.cos(a), Math.sin(a)];
  };
  const psiCut = 45 - Math.atan2(K.Y_CUT - K.C, K.X_BC - K.C) * 180 / Math.PI;
  const psiTE = 45 - Math.atan2(K.Y_CUT - K.C, K.A_R - K.C) * 180 / Math.PI;
  const rInAt = (ps) => {
    const ab = Math.abs(ps);
    if (ab <= K.PSI_S) return K.R;
    const D = uPsi(ab);
    const fx = K.C - K.O_B[0]; const fy = K.C - K.O_B[1];
    const bq = fx * D[0] + fy * D[1];
    const disc = Math.max(0, bq * bq - (fx * fx + fy * fy - K.R_B * K.R_B));
    return -bq - Math.sqrt(disc);
  };
  const rOutAt = (ps) => {
    const ab = Math.abs(ps);
    if (ab <= 45) return K.R + K.W_L;
    if (ab <= psiTE) return (K.A_R - K.C) / Math.cos((ab - 45) * Math.PI / 180);
    return (K.C - K.Y_CUT) / Math.sin((ab - 45) * Math.PI / 180);
  };
  // leather boot plan: polar sweep cut-to-cut (outer boundary out, inner
  // boundary back — mouth circle inside ψ_S, then the R_B seam arc)
  const bootPlan = [];
  {
    const N = 40;
    for (let i = 0; i <= N; i++) {
      const ps = -psiCut + (2 * psiCut * i) / N;
      const D = uPsi(ps); const r = rOutAt(ps);
      bootPlan.push([K.C + D[0] * r, K.C + D[1] * r]);
    }
    for (let i = N; i >= 0; i--) {
      const ps = -psiCut + (2 * psiCut * i) / N;
      const D = uPsi(ps); const r = rInAt(ps);
      bootPlan.push([K.C + D[0] * r, K.C + D[1] * r]);
    }
  }
  // green tongue plan, jaw A: dep → crest chain → F_C → mouth circle arc
  // F_C→S → R_B seam arc S→Q_DEP → back line → close at the departure
  const psiOf = (p) => 45 - Math.atan2(p[1] - K.C, p[0] - K.C) * 180 / Math.PI;
  const tongueA = [[0, K.Y_N], ...chain];
  {
    const pF = psiOf(K.F_C); const pS = psiOf(K.S);
    const NA = 6;
    for (let i = 1; i <= NA; i++) {
      const ps = pF + (pS - pF) * (i / NA);
      const D = uPsi(ps);
      tongueA.push([K.C + D[0] * K.R, K.C + D[1] * K.R]);
    }
    const aS = Math.atan2(K.S[1] - K.O_B[1], K.S[0] - K.O_B[0]);
    const aQ = Math.atan2(K.Q_DEP[1] - K.O_B[1], K.Q_DEP[0] - K.O_B[0]);
    const NB = 4;
    for (let i = 1; i <= NB; i++) {
      const a = aS + (aQ - aS) * (i / NB);
      tongueA.push([K.O_B[0] + K.R_B * Math.cos(a),
        K.O_B[1] + K.R_B * Math.sin(a)]);
    }
    tongueA.push([K.W_C, K.Y_N]);
  }
  const tongueB = tongueA.map(swapP);
  const out = [];
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const m = (poly) => poly.map(([px, py]) =>
      [sx * (L / 2 + px), sz * (W / 2 + py)]);
    out.push({ kind: 'boot', top: K.SHOULDER, plan: m(bootPlan) });
    out.push({ kind: 'tongue', top: K.DECK, plan: m(tongueA) });
    out.push({ kind: 'tongue', top: K.DECK, plan: m(tongueB) });
    // r36: the r33 corner DECK plate piece is deleted (U6 air law) —
    // no stand-in outboard of the boot chain.
  }
  return out;
}

// UMB 2.84 m carom (umb_carom_284, feature 012): pocketless — 4 mitred
// cushion bodies (table.js railPolysCarom mirror) + a wood ring of four
// planks with TRUE picture-frame corner miters (GH-387: the previous C0
// pocket-miter mirror matched a live defect — with no corner casting the
// frame-corner squares were open holes; table.js caromLeftRailPlan/
// caromEndRailPlan now close the ring with diagonal seams to a rounded
// outer corner, mirrored verbatim below).
const CAROM = { L: 2.84, W: 1.42, CW: 0.050, FW: 0.135 };

function railPolysCarom() {
  const { L, W, CW } = CAROM;
  const left = [[0, 0], [0, L], [-CW, L + CW], [-CW, -CW]];
  const head = [[0, 0], [W, 0], [W + CW, -CW], [-CW, -CW]];
  const mirY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  const mirX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  return [left, mirX(left), head, mirY(head)];
}

function woodPlansCarom() {
  const { L, W, CW, FW } = CAROM;
  const kin = -(CW - 0.002), kout = -(CW + FW);
  // table.js caromLeftRailPlan / caromEndRailPlan verbatim (GH-387): true
  // picture-frame miters — plank ends cut on the corner diagonals through
  // (kin, kin) to a rounded outer corner (r = apron radius 0.045 + the
  // ring's 3 mm lip), so the four planks tile the ring with no corner hole
  const r = 0.045 + 0.003, c = kout + r, d45 = kout + r * (1 - Math.SQRT1_2);
  const left = [
    [kin, kin], [kin, L - kin],
    [d45, L - d45],
    ...arcPts(c, L - c, r, 0.75 * Math.PI, Math.PI, 8).slice(1),
    [kout, c],
    ...arcPts(c, c, r, Math.PI, 1.25 * Math.PI, 8).slice(1),
  ];
  const end = [
    [kin, kin], [W - kin, kin],
    [W - d45, d45],
    ...arcPts(W - c, c, r, 1.75 * Math.PI, 1.5 * Math.PI, 8).slice(1),
    [c, kout],
    ...arcPts(c, c, r, 1.5 * Math.PI, 1.25 * Math.PI, 8).slice(1),
  ];
  const flipX = (p) => p.map(([x, y]) => [W - x, y]).reverse();
  const flipY = (p) => p.map(([x, y]) => [x, L - y]).reverse();
  return [left, flipX(left), end, flipY(end)];
}

/** GH-489 W6 snooker bed sheet — mirror of table.js snookerBedCutPath +
 * the cup-fall holes (the pre-W6 bedWithFalls traced the KERNEL-radius
 * falls with GH-518 bay clipping — the misused "slate hole" construct the
 * owner rejected; with the label-radius falls the crossing regime is gone
 * and the bays retire). The slate CORNERS ARE CUT AWAY at the pockets:
 * per corner the outline runs outline edge → squared END-FACE line
 * (cut.xFace/zFace) → keep-ring about the visible fall cup (cut.keepR =
 * fall + lip + 6 mm — the cloth ring the arris roll seats on) → other
 * face line → outline edge. Middles keep the plain edge (drilled fully
 * within the slate). Exact decomposition (no boundary-straddle clipping
 * needed — every cell/ring is interior or a full annulus):
 *   end strips  |x| ∈ [xFace, bedX] × |z| ≤ zFace   (no falls)
 *   main slab   |x| ≤ xFace with the two middle-fall cells cut out
 *               (cell square half-size r + 0.006, angular ring — the
 *               fall discs at r = cup + lip stay holes, review r5: a
 *               solid bed baked spurious green bounce across throats)
 *   corner keep-ring annuli  r → keepR about each corner cup
 * The keep-disc slivers that poke inside the face lines overlap the
 * strips coplanar cloth-on-cloth (same object/albedo — benign). */
// ring segment count MUST be divisible by 8 so the cell square's corner
// angles (odd multiples of π/4) are exact sample points — at N=28 the
// square projection cut across each corner and left ~20 mm uncovered
// triangles around every fall cell (review r7)
const RING_N = 32;
function bedSnookerCut(bedX, bedZ, cut, falls, y = 0) {
  const tris = [];
  const rect = (x0, z0, x1, z1) => {
    if (x1 - x0 > 1e-9 && z1 - z0 > 1e-9) tris.push(...hrect(x0, z0, x1, z1, y));
  };
  const { xFace, zFace } = cut;
  const corners = falls.filter((f) => Math.abs(f.x) > 1e-6);
  const middles = falls.filter((f) => Math.abs(f.x) <= 1e-6);
  rect(xFace, -zFace, bedX, zFace); // end strips between the face lines
  rect(-bedX, -zFace, -xFace, zFace);
  const R = middles[0].r + 0.006; // middle cell half-size
  const zCut = Math.abs(middles[0].z) - R;
  rect(-xFace, -zCut, xFace, zCut); // central band (no falls)
  for (const c of middles) {
    const sz = Math.sign(c.z);
    const z0 = sz > 0 ? zCut : -bedZ, z1 = sz > 0 ? bedZ : -zCut;
    rect(-xFace, z0, c.x - R, z1); // strips beside the cell column
    rect(c.x + R, z0, xFace, z1);
    if (sz > 0) rect(c.x - R, c.z + R, c.x + R, z1); // outboard patch
    else rect(c.x - R, z0, c.x + R, c.z - R);
    const N = RING_N; // ring: cell square minus the fall disc (interior)
    const sq = (a) => {
      const cA = Math.cos(a), sA = Math.sin(a);
      const m = Math.max(Math.abs(cA), Math.abs(sA));
      return [c.x + (cA / m) * R, c.z + (sA / m) * R];
    };
    const ci = (a) => [c.x + Math.cos(a) * c.r, c.z + Math.sin(a) * c.r];
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * 2 * Math.PI, a1 = ((k + 1) / N) * 2 * Math.PI;
      const s0 = sq(a0), s1 = sq(a1), c0 = ci(a0), c1 = ci(a1);
      tris.push([[s0[0], y, s0[1]], [s1[0], y, s1[1]], [c0[0], y, c0[1]]]);
      tris.push([[c0[0], y, c0[1]], [s1[0], y, s1[1]], [c1[0], y, c1[1]]]);
    }
  }
  for (const c of corners) { // keep-ring annulus, hole r → cut.keepR
    const N = RING_N;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * 2 * Math.PI, a1 = ((k + 1) / N) * 2 * Math.PI;
      const pt = (a, r) => [c.x + Math.cos(a) * r, c.z + Math.sin(a) * r];
      const o0 = pt(a0, cut.keepR), o1 = pt(a1, cut.keepR);
      const i0 = pt(a0, c.r), i1 = pt(a1, c.r);
      tris.push([[o0[0], y, o0[1]], [o1[0], y, o1[1]], [i0[0], y, i0[1]]]);
      tris.push([[i0[0], y, i0[1]], [o1[0], y, o1[1]], [i1[0], y, i1[1]]]);
    }
  }
  return tris;
}

/** Bed sheet with the pocket-fall discs CUT OUT (review r5 — table.js
 * subtracts `p.r + 0.004` holes from the bed shape; a solid bake bed put
 * green cloth across every throat and baked spurious green bounce).
 * Decomposition: central band + two outer bands; each fall sits in a cell
 * square (half-size r + 0.006) triangulated as an angular ring between the
 * square boundary and the fall circle; rect strips fill the rest. */
function bedWithFalls(bedX, bedZ, falls, y = 0) {
  const tris = [];
  // every rect is clipped to the bed outline (GH-518 review r7: the Star
  // band's corner cells extend past the shrunken boundary — the unclipped
  // build baked a 9.4 mm phantom cloth ring around each corner fall)
  const rect = (x0, z0, x1, z1) => {
    x0 = Math.max(x0, -bedX); x1 = Math.min(x1, bedX);
    z0 = Math.max(z0, -bedZ); z1 = Math.min(z1, bedZ);
    if (x1 - x0 > 1e-9 && z1 - z0 > 1e-9) tris.push(...hrect(x0, z0, x1, z1, y));
  };
  const inBed = (px, pz) =>
    Math.abs(px) <= bedX + 1e-9 && Math.abs(pz) <= bedZ + 1e-9;
  const cells = falls.map((f) => ({ ...f, R: f.r + 0.006 }));
  const zCut = Math.min(...cells.map((c) => Math.abs(c.z) - c.R));
  rect(-bedX, -zCut, bedX, zCut); // central band (no falls)
  for (const sz of [-1, 1]) {
    const band = cells.filter((c) => Math.sign(c.z) === sz)
      .sort((a, b) => a.x - b.x);
    const z0 = sz > 0 ? zCut : -bedZ, z1 = sz > 0 ? bedZ : -zCut;
    let x = -bedX;
    for (const c of band) {
      rect(x, z0, c.x - c.R, z1); // strip before the cell column
      rect(c.x - c.R, z0, c.x + c.R, c.z - c.R); // column patch below cell
      rect(c.x - c.R, c.z + c.R, c.x + c.R, z1); // column patch above cell
      const N = RING_N; // ring: cell square minus the fall disc
      // GH-490 (PR-2 review r7): clamp the cell square into the bed rect —
      // the chinese8 corner cells cross the frame−4 mm bed bounds and
      // emitted floating cloth outside the table (the live bed clips via
      // its boundary-bite shape). In-range vertices return THEMSELVES
      // (Math.min/max identity), so every pre-490 class stays
      // byte-identical (zero-drift law).
      const sq = (a) => {
        const cA = Math.cos(a), sA = Math.sin(a);
        const m = Math.max(Math.abs(cA), Math.abs(sA));
        return [
          Math.min(Math.max(c.x + (cA / m) * c.R, -bedX), bedX),
          Math.min(Math.max(c.z + (sA / m) * c.R, -bedZ), bedZ),
        ];
      };
      // r8: the fall-circle vertices need the same clamp — the chinese8
      // corner falls poke ~5.8 mm past the bed bounds (identity in-range).
      const ci = (a) => [
        Math.min(Math.max(c.x + Math.cos(a) * c.r, -bedX), bedX),
        Math.min(Math.max(c.z + Math.sin(a) * c.r, -bedZ), bedZ),
      ];
      for (let k = 0; k < N; k++) {
        const a0 = (k / N) * 2 * Math.PI, a1 = ((k + 1) / N) * 2 * Math.PI;
        // GH-518 corner BAYS (runtime templateBedBayPath): where the fall
        // circle crosses the outline the runtime bed simply ends — the
        // detached outboard arc is the gold post's territory. Round-3
        // review r5 P2: DROPPING a straddling slice whole removed up to a
        // full 2π/32 cloth wedge (~16 mm of inner arc) at every
        // circle/boundary transition — the maps baked slate/void where
        // the runtime keeps cloth. The straddling slice is now CLIPPED:
        // bisect the inner arc to the bed crossing and emit the partial
        // wedge on the in-bed side (a fully-outside slice still drops;
        // any sub-slice inside interval between two outside endpoints is
        // a conservative-dark sliver per the r7 doctrine).
        const inA = inBed(...ci(a0)), inB = inBed(...ci(a1));
        if (!inA && !inB) continue;
        let b0 = a0, b1 = a1;
        if (inA !== inB) {
          let lo = a0, hi = a1;
          for (let it = 0; it < 48; it++) {
            const mid = (lo + hi) / 2;
            if (inBed(...ci(mid)) === inA) lo = mid; else hi = mid;
          }
          if (inA) b1 = lo; else b0 = hi;
        }
        const s0 = sq(b0), s1 = sq(b1), c0 = ci(b0), c1 = ci(b1);
        const cl = (pt) => [Math.max(-bedX, Math.min(bedX, pt[0])),
          Math.max(-bedZ, Math.min(bedZ, pt[1]))];
        const s0c = cl(s0), s1c = cl(s1);
        tris.push([[s0c[0], y, s0c[1]], [s1c[0], y, s1c[1]], [c0[0], y, c0[1]]]);
        tris.push([[c0[0], y, c0[1]], [s1c[0], y, s1c[1]], [c1[0], y, c1[1]]]);
      }
      x = c.x + c.R;
    }
    rect(x, z0, bedX, z1); // strip after the last cell column
  }
  return tris;
}

/** GH-489 W6 corner-cut outline (plan coords) — table.js snookerBedCutPath
 * mirrored for the SLAB plan: rectangle ±hx × ±hz with each corner cut
 * back to the end-face lines outside the keep-arc about the cup (same
 * NA = 20 arc sampling; the arc sweeps THROUGH the outward diagonal).
 * Corners met from the long edges walk pIn→arc→pOut; corners met from
 * the end edges walk reversed — the table.js seq order. */
function snookerCutOutline(hx, hz, { xFace, zFace, cupX, cupZ, keepR }) {
  const NA = 20;
  const cornerArc = (sx, sz) => {
    const qx = sx * cupX, qz = sz * cupZ;
    const dzA = Math.sqrt(Math.max(keepR * keepR - (xFace - cupX) ** 2, 0));
    const dxA = Math.sqrt(Math.max(keepR * keepR - (zFace - cupZ) ** 2, 0));
    const pIn = [sx * xFace, sz * (cupZ - dzA)];
    const pOut = [sx * (cupX - dxA), sz * zFace];
    const a0 = Math.atan2(pIn[1] - qz, pIn[0] - qx);
    let a1 = Math.atan2(pOut[1] - qz, pOut[0] - qx);
    const aDiag = Math.atan2(sz, sx); // outward corner diagonal
    const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    let d1 = norm(a1 - a0);
    if (norm(aDiag - a0) > d1) d1 -= 2 * Math.PI; // go the other way round
    const pts = [pIn];
    for (let i = 1; i < NA; i++) {
      const a = a0 + (d1 * i) / NA;
      pts.push([qx + keepR * Math.cos(a), qz + keepR * Math.sin(a)]);
    }
    pts.push(pOut);
    return pts;
  };
  return [
    [-xFace, -hz], [xFace, -hz], ...cornerArc(1, -1),
    [hx, -zFace], [hx, zFace], ...cornerArc(1, 1).reverse(),
    [xFace, hz], [-xFace, hz], ...cornerArc(-1, 1),
    [-hx, zFace], [-hx, -zFace], ...cornerArc(-1, -1).reverse(),
  ];
}

/** GH-489 W15 slate relief outline, MIRRORED from table.js
 * snookerBedCutPath's relief branch (review graft-r5 P2: the runtime slate
 * is TWO plates with ±relief jaw rays + a keep-arc at each corner — the
 * old keep-ring outline left removed slate in the bake as blocker and
 * bounce surface around every corner mouth). Plan coords (x, z); corners
 * replace the face-line legs entirely: z-edge ray hit → keep arc (swept
 * on the INBOARD side, clear semantics — the whole disc goes) → x-edge
 * ray hit. Middle falls stay undrilled per the mirror doctrine (the cup
 * plugs own the throat rays from above; undrilled errs occlusive/dark).
 */
function snookerReliefOutline(hx, hz, cups, keepR, relief) {
  const NR = 24;
  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const corner = (sx, sz) => {
    const cup = cups.find((c) => Math.sign(c.x) === sx
      && Math.sign(c.z) === sz);
    const qx = cup.x, qz = cup.z;
    const aDiag = Math.atan2(sz, sx);
    const cand = [aDiag - relief, aDiag + relief];
    const aH = cand.find((a) => Math.sin(a) * sz > 0); // hits z = sz·hz
    const aV = cand.find((a) => Math.cos(a) * sx > 0); // hits x = sx·hx
    const tH = (sz * hz - qz) / Math.sin(aH);
    const tV = (sx * hx - qx) / Math.cos(aV);
    const aThru = aDiag + Math.PI; // clear = true: sweep the inboard side
    let dR = norm(aV - aH);
    if (norm(aThru - aH) > dR) dR -= 2 * Math.PI;
    const pts = [[qx + tH * Math.cos(aH), sz * hz]];
    for (let i = 0; i <= NR; i++) {
      const a = aH + (dR * i) / NR;
      pts.push([qx + keepR * Math.cos(a), qz + keepR * Math.sin(a)]);
    }
    pts.push([sx * hx, qz + tV * Math.sin(aV)]);
    return pts;
  };
  return [
    ...corner(1, -1),
    ...corner(1, 1).reverse(),
    ...corner(-1, 1),
    ...corner(-1, -1).reverse(),
  ];
}

/** Horizontal disc (fan) — the dark cup plug under a bed fall hole. */
function discTris(cx, cz, r, y, n = 28) {
  const tris = [];
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * 2 * Math.PI, a1 = ((k + 1) / n) * 2 * Math.PI;
    tris.push([[cx, y, cz],
      [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r],
      [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r]]);
  }
  return tris;
}

// ---- table classes (GH-337) -------------------------------------------------
// One bake class per committed footprint. `footprint` MUST equal the kernel
// length/width of every catalog id in the class (gi.js matches at 1e-6):
// pool = the seven 2.54×1.27 ids, snooker_12ft = wpbsa_snooker_12ft,
// carom_284 = umb_carom_284. `mats` overrides the LOOKS cloth/wood albedos
// for branded discipline tables (the look regrade never repaints branded
// factory materials — look.js doctrine — so cloth/wood are LOOK-INDEPENDENT
// here; floor/wall/lamp stay per-look). Albedo derivation (same convention
// as the LOOKS block): linearized sRGB of the calibrated runtime colors —
// snooker cloth 0x035C32 (clothvisuals snooker_green — the GH-489 W3
// reference-photo rendered-read solve), carom cloth 0x0e4f8e
// (carom_blue), wood = the pool wood scaled by the mahogany restyle ratio
// (table.js styleMaterials: map (88,30,22)/color 0xa89486 over the generic
// (104,40,30)/0xbfb0a6). railTop = the class cushion family's cloth-top row
// (table.js CUSHION_FAMILIES snooker_l 0.0435 / carom_37 0.046); ballR =
// the class ball radius (probe height). legIn = long-axis leg inset from
// the bake apron corner `ax`, mirroring each class's LIVE builder (ax
// carries a -0.003 bias, so mirror = live − 0.003): pool 0.20 (populate
// generic stance; the pre-337 0.197 literal), snooker 0.45 (template legs
// stand inboard of the corner falls — review r1), carom 0.24
// (populateCarom's own stance, table.js :2353 — review r2; NOT the generic
// 0.20 the r1 pass assumed).
export const TABLES = {
  pool: {
    footprint: { length: 2.54, width: 1.27 }, pocketless: false,
    L, W, CW, FW, railTop: RAIL_TOP, frameTop: FRAME_TOP, ballR: 0.028575,
    legIn: 0.197,
    bedMargin: 0.10, // the pre-337 literal (float-identity; GH-395)
    mats: null, // per-look LOOKS cloth/wood (the pre-337 pool behavior)
    railPlans: () => railPolysKernel().map(toPlan),
    woodPlans: () => woodPlans().map(toPlan),
  },
  // GH-621 (D621-O1): Diamond Pro-Am 8 ft / 7 ft — the pool class at the
  // official 90 × 45 in / 80 × 40 in beds (docs/geometry/diamond-proam-
  // {8,7}ft-table-definition.json PF-01/PF-02), everything else the pool's
  // own (same rail stack, same pockets, same per-look mats, same leg
  // stance mirror). Without these the 8/7 ft entries render honesty-gated
  // (gi.js bakeClassFor: no footprint match → uGiOn 0) and every cloth /
  // cap tone comparison against the 9 ft is a comparison of two rigs.
  pool_8ft: {
    footprint: { length: 2.286, width: 1.143 }, pocketless: false,
    L: 2.286, W: 1.143, CW, FW, railTop: RAIL_TOP, frameTop: FRAME_TOP,
    ballR: 0.028575, legIn: 0.197, bedMargin: 0.10, mats: null,
    railPlans: () => railPolysKernelFor(2.286, 1.143).map(toPlanFor(2.286, 1.143)),
    woodPlans: () => woodPlansFor(2.286, 1.143).map(toPlanFor(2.286, 1.143)),
  },
  pool_7ft: {
    footprint: { length: 2.032, width: 1.016 }, pocketless: false,
    L: 2.032, W: 1.016, CW, FW, railTop: RAIL_TOP, frameTop: FRAME_TOP,
    ballR: 0.028575, legIn: 0.197, bedMargin: 0.10, mats: null,
    railPlans: () => railPolysKernelFor(2.032, 1.016).map(toPlanFor(2.032, 1.016)),
    woodPlans: () => woodPlansFor(2.032, 1.016).map(toPlanFor(2.032, 1.016)),
  },
  snooker_12ft: {
    footprint: { length: 3.569, width: 1.778 }, pocketless: false,
    L: SNOOKER.L, W: SNOOKER.W, CW: SNOOKER.CW, FW: SNOOKER.FW,
    railTop: 0.0435, frameTop: 0.047, ballR: 0.02625, legIn: 0.447,
    // GH-518 Star band: table.js template margin = min(0.11, fw − 0.004)
    // → 0.0895 on the 0.0935 frame (the check-cushion-profile GH-395
    // mirror gate re-derives this from table.js's expression)
    bedMargin: Math.min(0.11, SNOOKER.FW - 0.004),
    // GH-518 Star body: floor→bed 0.817 (WPBSA 864 − 47 rail top; the
    // #499 room-layer height fix), four 20 mm straight panels to −0.213,
    // gold corner posts, EIGHT turned legs (boxes here — occluder tier)
    floorY: -0.817,
    apronY0: -0.213,
    legs: (() => {
      const ax = SNOOKER.L / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const az = SNOOKER.W / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      // W17: legInEnd 0.230 → 0.285 (the corner leg must stand out of the
      // pocket's room — net + ball radius; table.js SNK.legInEnd carries
      // the derivation). The intermediate legs ride ±lxC/3 with it.
      const lxC = ax - 0.285, lz = az - 0.104;
      const out = [];
      for (const lx of [-lxC, -lxC / 3, lxC / 3, lxC]) {
        for (const sz of [-1, 1]) {
          out.push({ x: lx, z: sz * lz, half: 0.095,
            y0: -0.817, y1: -0.205 });
        }
      }
      return out;
    })(),
    posts: (() => {
      const ax = SNOOKER.L / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const az = SNOOKER.W / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      // GH-489 W14 (signed drawing GH489-EXT-R1.2 + review r1 P1): the
      // corner box RETIRES; the gold survives as the LEG-HEAD CAP riding
      // the PR #520 leg centre (150 mm, top E5 − E9 = −141.5, enclosing
      // the leg top −0.205) — mirrors table.js verbatim.
      const heads = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => {
        const cxL = sx * (ax - 0.285), czL = sz * (az - 0.104); // W17
        const H = 0.075;
        const slab = (xa, za, xb, zb, y0, y1) => ({
          x0: Math.min(xa, xb), x1: Math.max(xa, xb),
          z0: Math.min(za, zb), z1: Math.max(za, zb), y0, y1 });
        return {
          x0: cxL - sx * H, z0: czL - sz * H,
          x1: cxL + sx * H, z1: czL + sz * H, // rib-mirror bounds
          slabs: [slab(cxL - sx * H, czL - sz * H, cxL + sx * H,
            czL + sz * H, -0.245, -0.1415)],
        };
      });
      // 489 BLOCKER-CURE (B11, review blocker-r1 P2): the four
      // INTERMEDIATE leg head blocks join the mirror (the live builder
      // dresses all eight stations; an un-mirrored solid errs BRIGHT
      // through the old open joinery)
      for (const msx of [-1, 1]) {
        for (const msz of [-1, 1]) {
          const mx = msx * ((ax - 0.285) / 3), mz = msz * (az - 0.104);
          const H = 0.075;
          heads.push({
            // mid: true gates the corner-only rib/skirt proxies below —
            // the runtime mid block carries ONE ±z rib and no skirt
            // (review blocker-r2 P2: bound-order sign derivation emitted
            // two +x/+z ribs and a phantom corner skirt per mid head)
            mid: true, ribZ: msz,
            x0: mx - H, z0: mz - H, x1: mx + H, z1: mz + H,
            slabs: [{ x0: mx - H, x1: mx + H, z0: mz - H, z1: mz + H,
              y0: -0.245, y1: -0.1415 }],
          });
        }
      }
      return heads;
    })(),
    // 489 BLOCKER-CURE (B11/B14, review blocker-r1 P2): the overhang
    // SOFFIT ring (the A8 step slot's closure — obSnkSoffit x6 live) and
    // the member extension to apronBot ride the members list below via
    // soffits/memberY1 so the bake stops leaking light through the old
    // open joinery.
    soffits: (() => {
      const ax = SNOOKER.L / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const az = SNOOKER.W / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const inset = 0.123, panelT = 0.020;
      const bay = SNOOKER.fcx.uFaceM + 0.002, stop = 0.24;
      const out = [];
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          out.push({ x0: Math.min(sx * bay, sx * (ax - stop)),
            x1: Math.max(sx * bay, sx * (ax - stop)),
            z0: Math.min(sz * (az - panelT), sz * (az - inset)),
            z1: Math.max(sz * (az - panelT), sz * (az - inset)) });
        }
      }
      for (const sx of [-1, 1]) {
        out.push({ x0: Math.min(sx * (ax - panelT), sx * (ax - inset)),
          x1: Math.max(sx * (ax - panelT), sx * (ax - inset)),
          z0: -(az - stop), z1: az - stop });
      }
      return out;
    })(),
    memberY1: -0.213,
    // ear-clipped prism caps (review r4): the template planks/jaws are
    // concave — prism()'s centroid fan closed the pocket bays with
    // phantom wood. Pool/carom stay on prism() (star-shaped plans; the
    // fan is their committed byte-identical tessellation).
    concaveCaps: true,
    // W14: the casting shoulders retired with the live obSnkCasting
    // (GH489-EXT-R1.2 vs-rev-19 delete table) — the six planks are the
    // whole snooker wood-plan set; no castFrom entry.
    // pocket falls in plan coords, GH-489 W6 (adjudications c5259957376 /
    // c5260535193): the pre-W6 holes rode the KERNEL capture radii — the
    // "slate hole" misread (corner Ø 185.8 mm vs the real Ø 84–90). Bed
    // holes now sit at the VISIBLE fall cups widened by the arris-roll
    // lip (table.js `c.r + snkFall.lip`): corner cup on the pocket
    // diagonal at ±(L/2 − cupD) ≈ nose corner + 6.24 mm, r = rvC + lip =
    // 46.08 mm; middle concentric with the kernel capture centre,
    // r = rvM + lip = 53.61 mm. Dark cup plugs ride these (review r5).
    falls: (() => {
      const { L: l, W: w, mfd, fcx } = SNOOKER;
      const cr = fcx.rvC + fcx.lip, mr = fcx.rvM + fcx.lip;
      const cx = l / 2 - fcx.cupD, cz = w / 2 - fcx.cupD;
      return [
        { x: -cx, z: -cz, r: cr }, { x: -cx, z: cz, r: cr },
        { x: cx, z: -cz, r: cr }, { x: cx, z: cz, r: cr },
        { x: 0, z: -(w / 2 + mfd), r: mr }, { x: 0, z: w / 2 + mfd, r: mr },
      ];
    })(),
    // GH-489 W6 bed corner cut (table.js snookerBedCutPath): end-face
    // lines at L/2 − uFaceC / W/2 − uFaceC, keep-ring fall + lip + 6 mm
    bedCut: {
      xFace: SNOOKER.L / 2 - SNOOKER.fcx.uFaceC,
      zFace: SNOOKER.W / 2 - SNOOKER.fcx.uFaceC,
      keepR: SNOOKER.fcx.rvC + SNOOKER.fcx.lip + 0.006,
    },
    // GH-489 W6 slab plan (table.js obSnkSlab): the slate follows the
    // same corner cut, 2 mm inside the bed outline with an 8 mm keep
    // ring. The live falls are DRILLED through the slate at cup + 4 mm;
    // the mirror leaves them undrilled — the near-black cup plugs sit
    // just above the slab top and own every throat ray from above, and
    // an undrilled slab below them errs occlusive/dark (r7 doctrine).
    // A8-era slab mirror (review graft-r5 P2): TWO plates like the runtime
    // (table.js slabPlan/rebPlan) — upper plate carries the ±105° corner
    // mouth cut at the drilled-aperture throat, the lower 21 mm is
    // rebated clear to 80 mm (the net/ball drop room). Middle falls stay
    // undrilled (mirror doctrine at the old slabPlan note).
    slabPlates: (bedX, bedZ) => {
      const cupX = SNOOKER.L / 2 - SNOOKER.fcx.cupD;
      const cupZ = SNOOKER.W / 2 - SNOOKER.fcx.cupD;
      const cups = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
        .map(([sx, sz]) => ({ x: sx * cupX, z: sz * cupZ }));
      const relief = (105 * Math.PI) / 180;
      const throat = SNOOKER.fcx.rvC + SNOOKER.fcx.lip + 0.004;
      return [
        { pts: snookerReliefOutline(bedX - 0.002, bedZ - 0.002, cups,
          throat, relief), y0: -0.033, y1: -0.004 },
        { pts: snookerReliefOutline(bedX - 0.002, bedZ - 0.002, cups,
          0.080, relief), y0: -0.054, y1: -0.033 },
      ];
    },
    // GH-518: the live snooker apron is four straight 20 mm panels (the
    // ring/apronIn recess formula went with the wide frame)
    apronT: 0.020,
    // live obSnkPanel strips stop at the corner posts (SNK.postSpan)
    apronStop: 0.24,
    // A8 CABINET RE-PLANE (489 corner graft, twin row A8): the apron is
    // TWO BANDS — flush above the hem, recessed by SNK.cabinetInset
    // below it (the measured XW101 rail overhang). The mirror splits at
    // the same plane so the recessed cabinet's bounce leaves the corner
    // bays and the overhang shadow bakes real (an un-recessed mirror
    // errs BRIGHT in the below-hem bay — the same class as the W17
    // corner-void note).
    apronInset: 0.123,
    // 489 ENV ROUND: the split follows the MEASURED step (SNK.railBandBot
    // −0.096 — the r2_6 rail-band-depth row closed in table.js; the E5 hem
    // −105.5 stays the leather's law, a different subject)
    apronSplitY: -0.096,
    // GH-489 W6 middle apron BAYS (c5260535193 §1a/§2-S2): the side
    // panels open at each middle pocket — two runs per side from the
    // corner posts to the bay edges at ±(uFaceM + 0.002) = ±0.056; the
    // sock/ring/wires hang in open air behind the cream saddle. The live
    // gold molding/band strips still cross the opening — not mirrored:
    // the full-height bay void errs occlusive/dark (r7 doctrine).
    apronBay: SNOOKER.fcx.uFaceM + 0.002,
    // W17 CORNER RETURN, A8-REVISED (489 corner graft), A6-REVISED
    // (489 A-items round, twin row A6 / proposal_ext_r2_7 + review r1
    // P2) — the live obSnkPanel corner closure (table.js block 1a).
    // ABOVE the hem each rail's arm now dies SQUARE on the SUBSTRATE
    // end-face plane (the retired air-circle mitre was derived FROM the
    // GCL-family boot; the stale mirror omitted ~7.5 mm of the new arm
    // at every corner). BELOW the hem the closure is the recessed
    // SPLAYED CHAMFER (the W15 flush plinth died with the A8 re-plane:
    // at the measured 123 mm inset its plan crossed the cup axis and
    // FV489-NETCLEAR red-lined it). Mirrored because an un-modelled
    // closure is a VOID in the corner bay and a void errs BRIGHT (the
    // same class as the W12 bell note). The chamfer is squared off here
    // as a corner box at the recessed planes: over-occlusion of the bay
    // behind the net, which errs dark (r7 doctrine).
    cornerClose: (() => {
      const ax = SNOOKER.L / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const az = SNOOKER.W / 2 + SNOOKER.CW + SNOOKER.FW - 0.003;
      const cupX = SNOOKER.L / 2 - SNOOKER.fcx.cupD;
      const cupZ = SNOOKER.W / 2 - SNOOKER.fcx.cupD;
      const pT = 0.020;
      const dI = az - pT - cupZ, dO = az - cupZ;
      const uB = ax - 0.24 - cupX;
      const xFaceS = SNOOKER.L / 2 - SNOOKER.fcx.uFaceC;
      const uJ = -(cupX - xFaceS);   // substrate end-face plane (A6)
      const dOr = az - 0.123 - cupZ; // recessed cabinet plane (A8)
      const yCeil = -0.1055 - 0.021;
      const out = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const px = (u) => sx * (cupX + u), pz = (v) => sz * (cupZ + v);
          // 489 ENV ROUND: the arm extensions end at the measured step
          // with their parent flush runs (SNK.railBandBot mirror)
          out.push({ x0: px(uB), x1: px(uJ), z0: pz(dI), z1: pz(dO),
            y0: -0.096, y1: 0.006 });
          out.push({ x0: px(dI), x1: px(dO), z0: pz(uB), z1: pz(uJ),
            y0: -0.096, y1: 0.006 });
          // squared chamfer closure: run end to run end across the
          // diagonal at the recessed planes, yCeil → apronY0
          out.push({ x0: px(uB), x1: px(dOr), z0: pz(uB), z1: pz(dOr),
            y0: -0.213, y1: yCeil });
        }
      }
      return out;
    })(),
    // cloth albedo re-derived for the GH-489 R1 pure-XW101 re-solve
    // (ONE-TABLE law; the W3 joint-solve value 0x035C32 → [0.0009,
    // 0.107, 0.0319] retired with its s1-club anchor): linearized sRGB
    // of the clothvisuals.js snooker_green 0x041d08 — the r13
    // linear-ratio convention, applied as direct linearization since the
    // cloth mirror is the pure hex (per-channel ratios vs W3:
    // 1.333/0.115/0.076; the runtime cloth pipeline's color IS the
    // effective albedo: the mottle map modulates around unity). Same
    // basis as the neighboring entries.
    // wood albedo re-derived for the GH-489 R1 XW101 studio identity
    // (ONE-TABLE law; the GH-518 WST near-black TV trim retired):
    // linearized effective sRGB of makeWoodMap(92,40,70) × 0x9aaa9f —
    // effective hex 0x2a1220, the mahogany rail band (table.js R1
    // provenance block; the map×color split is render-exact, so the
    // mirror linearizes the EFFECTIVE hex directly — the r13 convention
    // applied at the effective level). gold = the painted-gold diffuse
    // lobe (0xaa4816 × (1 − metalness 0.10)) linearized — legs/posts/
    // corner castings bake with it.
    // GH-489 ORBIT CURE (finale review 2026-08-21, failure 2): the rail
    // map bases re-derive (92,40,70) → (92,52,58) — plum → wine-brown
    // (table.js snooker wood block carries the photo derivation). The
    // mirror follows per the duplicated-literal law: the R1 value scaled
    // by the measured canvas linear-mean ratio per channel (in-page
    // texel measurement, orbit-cure probe5: old [0.02687, 0.00795,
    // 0.01748] → new [0.02687, 0.01190, 0.01274]; R unchanged, G ×1.497,
    // B ×0.729 — the convention offset the R1 value carries is
    // preserved exactly).
    // GH-489 IDENTITY ROUND: rail albedo VALUE re-derive (table.js
    // snooker wood block — color multiplier 0x9aaa9f -> 0x6f7a72, x0.72
    // sRGB; hue/sat untouched). Mirror follows by the same measured-
    // ratio convention: per-channel linear ratios 0.4919/0.4842/0.4853
    // applied to the orbit-cure value.
    mats: { cloth: [0.0012, 0.0123, 0.0024], wood: [0.01136, 0.00436, 0.0051] },
    // GH-489 W8 (review r2 P2): the gold body re-toned to the Star
    // product family (table.js snkGold + the patina mottle,
    // metalness 0.16) — the mirror follows: linear(base) × the
    // goldCv linear mean 0.6664 (rng(3361) replication) × (1 − 0.16).
    // W15 (gate r18 P1-1 recalibration): base 0xc9761c → 0xc98a32
    // (the green-env compensation retired with the warm-room content
    // correction; rendered hue now follows the albedo) —
    // linear(0xc98a32) × 0.666362 × 0.84 = [0.3269, 0.1423, 0.0179].
    // (W8 history: [0.3269, 0.1014, 0.0065]; pre-W8 [0.319, 0.052,
    // 0.0069] carried the 0xaa4816/0.10 salmon bounce.)
    goldA: [0.3269, 0.1423, 0.0179],
    // GH-489 IDENTITY round (review r1 P2): the eight legs ride their own
    // rendered-read-calibrated base (table.js snkGoldLeg 0xc99f5e; hue 35
    // held, sat to the family middle) — mirror by the same convention:
    // linear(0xc99f5e) x canvas mean 0.666362 x (1 - metalness 0.16).
    goldLegA: [0.3269, 0.1941, 0.0627],
    // GH-518 fix round 2 under-frame (gate r1 findings 5+7): bare slate
    // at the manufacturer 50 mm (slab top −0.004, so y0 −0.054; the
    // shared −0.06 literal stays the pool classes' byte-identical slab)
    // + the deep frame members that close the under-frame sightlines.
    // Albedos: slate 0x484c50 linearized; members makeWoodMap(52,30,20)
    // × 0x3a2a20. Apron re-derived GH-489 R1 (XW101 mahogany identity,
    // table.js makeWoodMap(221,78,115) × 0xc3cbc8 = effective 0x8a3148):
    // linearized effective directly — the mid-tone apron leaves the
    // near-black class, so the GH-518 "round 2 lift" convention retires
    // with it (was [0.0026, 0.0010, 0.00056] for map(46,26,18) ×
    // 0x30201a).
    // 489 BLOCKER-CURE (B10 apron re-stack): bases (221,78,115) →
    // (98,33,64) with the multiplier held — effective ≈ (61,21,40), the
    // press-4K near-black-plum family — mirrored by the same effective-
    // linearization convention: [0.0466, 0.0073, 0.0213] (was the R1
    // brick [0.2542, 0.0307, 0.0648]). The new overhang soffit + the
    // four mid-leg head blocks sit wholly inside the under-frame shadow
    // band the mirror already darkens — no new emitter class.
    slabY0: -0.054,
    slateA: [0.065, 0.072, 0.080],
    apronA: [0.0466, 0.0073, 0.0213],
    members: (() => {
      const out = [];
      for (const bz of [-0.62, 0.62]) {
        out.push({ x0: -1.55, x1: 1.55, z0: bz - 0.030, z1: bz + 0.030 });
      }
      for (const bx of [-1.15, -0.45, 0.45, 1.15]) {
        out.push({ x0: bx - 0.025, x1: bx + 0.025, z0: -0.95, z1: 0.95 });
      }
      return out;
    })(),
    memberA: [0.0036, 0.0015, 0.00076],
    // ribbed panels wrapped on the corner posts' twin faces (fix round 2
    // finding 4) — coarse albedo boxes proud of the post faces.
    // GH-489 W12 (gate r15 P2-2, review F-B correction): the live canvas
    // re-authored BURGUNDY-in-gold — linearized tile mean of
    // rgb(v, 0.30v, 0.34v) over the 7-rib law (crest 104 / groove 30)
    ribA: [0.049, 0.0064, 0.0076],
    // GH-489 W12 (gate r15 P1-1): the corner boot's hanging bell skirt
    // fills the open-wedge sector between casting bottom and −92.5 mm —
    // mirrored as a conservative cream occluder chord per corner (the
    // un-mirrored void erred BRIGHT through the wedge, the wrong r7
    // direction). A10 (489 A-items round): albedo = linear(0xe0bb9f) ×
    // the grain-tile mean with the amended B-leg skirt tint — the old
    // linear(0xe5ba82) warm value was the pre-rig W12 read and its warm
    // bounce was half the corner bay's lit-pink read under the 2.647×
    // rig. 489 ENV ROUND: albedo re-solved 0xe0bb9f → 0xe0bb99 through
    // the corrected transfer (table.js leather block) — R/G legs
    // unchanged, B leg × linear(0x99)/linear(0x9f) = 0.9225: 0.35 → 0.32.
    skirtA: [0.73, 0.50, 0.32],
    railPlans: () => railPolysSnooker().map(toPlanFor(SNOOKER.L, SNOOKER.W)),
    woodPlans: () => woodPlansSnooker().map(toPlanFor(SNOOKER.L, SNOOKER.W)),
  },
  // Chinese 8-ball tournament 9-ft (GH-490 PR-2; owner decision ⑬ pairs
  // the class with the LOW RECTANGULAR luminaire, snooker fixture family).
  // mats (GH-490 round-12 gestalt retarget, owner-confirmed rulings):
  // chinese8_green 0x16703c + the cn8 MAHOGANY frame (makeWoodMap 9005
  // grain × 0x5c180a — the black-steel premise is retired; table.js
  // styleMaterials cn8), linearized per the class convention above. railTop = the cn8_l_steel cloth-top row 0.0466 +
  // the 0.3 mm zNoseRef remap shift (kernel nose 36.29 vs traced 36.0);
  // legIn = the live 0.45 gold-leg stance − 0.003 (ax bias, review r2
  // convention; the template legs stand inboard of the corner falls —
  // PR-2 review r1 caught a 0.24 misread of the diamond branch here).
  // The live cn8 apron is four blind PANELS (t 0.012); the round-12
  // rebuild retired the pocket housing drums for the below-fall net +
  // brass ring (owner ruling, gestalt gap (d)) — the bake keeps the
  // 4-strip apron representation at the panel thickness; the open
  // corner bays and the knit bag are below the lightmap's resolution.
  chinese8_9ft: {
    footprint: { length: 2.54, width: 1.26 }, pocketless: false,
    L: CN8.L, W: CN8.W, CW: CN8.CW, FW: CN8.FW,
    // r33: leg stance keeps the manufacturer footprint below frameTop
    // (table.js CN8_SKIRT_FW mirror); classes without the field derive
    // ax/az from FW byte-identically. r36: the apron/blind FACE
    // recesses to the rev-8.4 U2 body station (bodyX — table.js
    // CN8_X_BODY mirror) while the legs keep their r32 stance.
    skirtFW: CN8_SKIRT_FW,
    bodyX: CN8_X_BODY,
    // GH-490 ROUND-31 (rev-8.2 heights ladder): cushion cloth deck AND
    // plank tops land on the drawing's 库边顶 z42 (cn8_l_steel C-C rows +
    // cn8WoodOpts — the 0.0469/0.047 class retires for chinese8; the side
    // molded caps ride frameTop coarsely, ~5 mm under their live crown)
    railTop: 0.042, frameTop: CN8_FRAME_TOP, ballR: 0.028575, legIn: 0.447,
    midLegs: true, // B4: six-leg truth (mid-side pair at x = 0)
    // review r6 P1: frame−4 mm (live bed edge = CW + frameWidth − 0.004).
    // review r33-r1 P1: the margin FOLLOWS the live frameWidth — the r32
    // 0.088 literal was frame−4 under the 92 mm frame; after the r33
    // window-line repin (FW 0.043894) the live edge is CW + 0.0399 and a
    // kept 0.088 would bake a 48.1 mm cloth shelf that no longer exists.
    // GH-490 BLOCKER-CURE B6 (review r6 P2 sync): the live bed outline
    // hides INSIDE the blind boxes at X_BODY − 10 mm (containing the
    // corner jaw-foot chain — table.js bed-shape note); the mirror's
    // rect edge follows: CW + bedMargin = X_BODY − 0.010.
    bedMargin: CN8_X_BODY - 0.010 - CN8.CW,
    // review r33-r1 P1 (second half): the live cn8 bed corners are
    // CLIPPED by r88.0 arcs about each O_f (table.js r33 bed path);
    // the bake mirrors the clip radially per corner (clipCorners) so
    // no green bounce survives from the removed apex triangles
    // review r6 P2: the live corners now carry a 45° CHAMFER whose
    // closest approach to O_f is 76.4 mm — the radial stand-in clips at
    // that distance (an r88 clip left phantom corner cloth; the radial
    // form removes a ≤1.3 mm annular sliver more than the chamfer at
    // its flanks — errs occlusive, the mirror's zero-wash posture).
    cornerClips: (() => {
      const cx = CN8.L / 2 + CN8_R82M.C, cz = CN8.W / 2 + CN8_R82M.C;
      return [{ x: -cx, z: -cz, r: 0.0764 }, { x: -cx, z: cz, r: 0.0764 },
        { x: cx, z: -cz, r: 0.0764 }, { x: cx, z: cz, r: 0.0764 }];
    })(),
    concaveCaps: true, // template planks/jaws are concave (review r4)
    // GH-490 ROUND-31 (rev-8.2 model round): the corner bed holes are the
    // drawing's Ø105 mouth circles about O_f = nose corner + (3.5, 3.5) —
    // exactly R_mouth, no +4 mm slack (table.js bed shape absarc mirror;
    // the kernel-fall-disc corner holes at cfo/rf+4 RETIRE with the old
    // mouth).  Side pockets keep their r12 holes byte-identically.
    falls: (() => {
      const { L: l, W: w, middle, mfd } = CN8;
      const cr = CN8_R82M.R, mr = middle.rf + 0.004;
      const cx = l / 2 + CN8_R82M.C, cz = w / 2 + CN8_R82M.C;
      return [
        { x: -cx, z: -cz, r: cr }, { x: -cx, z: cz, r: cr },
        { x: cx, z: -cz, r: cr }, { x: cx, z: cz, r: cr },
        { x: 0, z: -(w / 2 + mfd), r: mr }, { x: 0, z: w / 2 + mfd, r: mr },
      ];
    })(),
    apronT: 0.012, // blind-panel thickness (table.js cn8 apron rebuild)
    // GH-490 round-8: the mouth-ring ANNULUS zone evaluates the plan at
    // the jaw-cloth plane height, not the y=0 throat. Those texels were
    // dead until this round (the bed is cut out there; the leather cap
    // opts out of GI) — the new flat jaw-cloth tongue lives exactly
    // there and consumes them. Evaluated at y=0 they missed the
    // rail-wall lamp clipping the adjacent jaw texels carry (evaluated
    // at railTop inside railPlans), so the tongue baked ~8 value points
    // brighter than the jaw across the hand-off line (gate r6 "dark
    // joins" class; nogi A/B isolates the delta to this bake). A first
    // cut that added the cap as a lamp BLOCKER inverted the miss: the
    // deep-throat evaluation point sat inside/under the occluder and
    // the step grew to +14 — the height is the defect, not the
    // blocking. Radii ride the pocket radius (= bake fall r − 4 mm):
    // rIn − 0.5 mm slack .. rOut + 0.5 mm (band + crest roll).
    //   ROUND-31 retired the four CORNER entries — the 51.6 mm-centre
    // leather annulus with the r26 sector split — with the old mouth
    // (table.js buildCornerFillet replaced by buildCornerR82, so the r26
    // wedge-base/blotch anatomy has no surviving subject). Corner plan/flank
    // classification rides the cornerAssemblies plan polygons below.
    //   GH-490m retires the two SIDE entries for exactly the same reason, so
    // the whole field goes with them; the consumer guards on
    // `if (tb.mouthRingZone)`, and classes that never had it are
    // byte-identical, so absence is the established no-op. The r8 molded-cap
    // band has no surviving subject at the middles either: the
    // middle-furniture rebuild replaced the cap REVOLVE with the drawn flat
    // bay cover, so there is no annulus and no 47 mm crown. Measured on the
    // live tree, the tallest thing in the middle bay is the cover's own top
    // edge at BC-04 = 42 mm, which is frameTop exactly, and it stands on the
    // RECTANGLE |u| <= DT-09 = 46 mm x w 88..90 — classified by bayBoots
    // below, which returns frameTop for exactly that plate (midext-r6: the
    // box is the plate, NOT the whole bay — inboard of MC-03 the throat is
    // open, and those texels fall through to the class default rather than
    // being decked at 42 mm). The ring is not merely stale,
    // it is superseded: kept, it would classify texels out to r = 83.1 mm
    // from the fall centre (|u| to 83 mm, well past the 46 mm bay, and out to
    // w = 135 mm, past the plank arris DT-04) at a height 5 mm above anything
    // that exists.
    // GH-490 ROUND-31: per-corner assembly stand-ins (leather boot +
    // green tongues + JOY corner block — cn8CornerAssemblies above).
    // They are bounce geometry AND the corner plan/flank classifier;
    // classes without the field are byte-identical (zero-drift law).
    cornerAssemblies: cn8CornerAssemblies,
    // leg: the ROUND-14 champagne re-solve (gate r12 P1-4), carried to
    // ROUND-15 (gate r13 P1-4) and re-solved at ROUND-16 (gate r14
    // P1-4 — the satin map: flatter sheen bands, box-smoothed brush,
    // no hard edge ridges): the live legs wear the authored
    // champagne-metal luma map (table.js makeCn8LegLuma) over the
    // albedo 0xffe6c0 — the mirror is linear(0xffe6c0) x the map's
    // linear mean 0.4444 = [0.444, 0.352, 0.234] (PR-2 review r2
    // live-leg bounce-color mirror law; review r12-r3 caught the
    // round-12 drift).
    // ROUND-37 (gate r33 P2 leg-collar sightline): the live map's
    // turned half splits into under-frame-shaded bulb/foot bands + a
    // uniform-shade block band (makeCn8LegLuma layout note) — the
    // replicated map's linear mean moves 0.4493 -> 0.3330 (mulberry32-
    // exact replication, this round's record; ratio 0.7412).  The
    // mirror scales by the per-channel LINEAR ratio (the round-13
    // cloth-mirror convention below, preserving the entry's r16-anchor
    // derivation offset): [0.444, 0.352, 0.234] x 0.7412 ->
    // [0.329, 0.261, 0.173]; chinese8 class re-baked (determinism x2,
    // non-chinese8 byte-identity).
    // round-13 cloth mirror: chinese8_green albedo 0x16703c ->
    // 0x2d7a4c (the C1s grazing-wash fix killed the base-GGX white
    // wash, and on the pure diffuse response the old albedo clips the
    // corner read to S 100 - the R/B floor returns to the albedo);
    // constants scale by the per-channel LINEAR ratio of new/old so
    // the entry's established derivation offset is preserved (ratios
    // 3.37/1.20/1.60).
    // REBUILD R0 r4 cloth re-solve: 0x2d7a4c -> 0x225e2f under the
    // frozen joy_lowrect rig (clothvisuals.js record); same convention,
    // per-channel LINEAR ratios 0.6086/0.5752/0.3936 over the r13 row
    // ([0.0111, 0.1537, 0.0549]); chinese8 class re-baked (canopy +
    // joy_lowrect sets, determinism x2 each).
    mats: { cloth: [0.00676, 0.08841, 0.02161],
      // r38 (gate r34 P1-A2 rail-face stations): live rail albedo
      // brightens 0x5c180a -> 0x82220e (table.js woodMat cn8 note);
      // mirror re-solved by the per-channel LINEAR ratios
      // 2.086/1.751/1.447 (the r37 mats.leg convention).
      // REBUILD R1 r1 (venue-family re-author, table.js cn8 wood note):
      // live combined albedo (map x hex) moves (96,13,9)x0x82220e ->
      // (96,86,86)x0x8a667a.  The pure ratio convention DEGENERATES
      // here: the old G/B mean linear albedo was the underflow defect
      // itself (5.2e-5 / 1.0e-5 — ratios 156x/1204x would claim >100%
      // reflectance).  Degenerate-channel exception, recorded: the R
      // channel keeps the offset law (x1.1004 -> 0.07345), and its
      // established offset k = mats_R / meanLinearAlbedo_R = 3.802
      // re-derives G/B from the new mean linear albedo (Monte-Carlo
      // over the makeWoodMap value law, seed-invariant distribution:
      // new mean linear [0.01932, 0.00808, 0.01184]).  The apron/blind
      // ring + slab share this knob (established conflation, disclosed:
      // the live skirt-panel body [84,35,42] x 0xf0c0a0 emissive is
      // the same near-black mahogany family; the thin tan band strip
      // rides the knob undisclosed-small).
      wood: [0.07345, 0.03073, 0.04502],
      // GH-490 BLOCKER-CURE B7: live albedo rotates 0xffe6c0 ->
      // 0xffd2b4 (amber re-solve vs tpt_q8_leg_macro; table.js goldMat
      // note); mirror follows by the per-channel LINEAR ratios
      // 1.0/0.8145/0.8659 over the r37 row (live-leg bounce-color
      // mirror law) -> chinese8 GI set re-baked, determinism x2.
      leg: [0.329, 0.212, 0.150],
      // round-14 (review r14-r1 P2 follow-through): the side-pocket BAY
      // is not empty at runtime — the molded cream boot/skirt fills it
      // (table.js cn8 skirt, drape face ~at the old plank plane).  The
      // bay-boot stand-ins below occlude like the plank the split
      // removed but bounce LEATHER, not mahogany: linearized skirt
      // albedo (the round-14 solve; review r14-r3 caught the
      // first red-channel arithmetic — 194/255 srgb-to-linear is
      // 0.539, not 0.614).
      // GH-490 PASS-2 item 7 follow-through (live-albedo mirror law,
      // the mats.leg convention): the skirt re-solve moves the live
      // albedo 0xc29586 -> 0xc69b88 (table.js cn8SkirtMat note — the
      // green-env leg removed, level returned via emissive), so the
      // mirror follows with the linearized sRGB of the NEW hex. The
      // cap's own 0xa18165 -> 0xac8d6c ride is conflated into this row
      // as before (established conflation, disclosed).
      boot: [0.565, 0.328, 0.246],
      // r32 (gate r29 P1): the JOY corner block re-dresses off the
      // apron beamMat onto the reference-derived black-gloss lacquer
      // (table.js cn8BlockMat 0x120808 — tpt outboard field RGB p50
      // (20,4,4), cdm venue skirt family; zd/r32/blockread.json).
      // Linearized sRGB of the live albedo.
      block: [0.00605, 0.00243, 0.00243] },
    // side-bay boot stand-in boxes (x along the rail, z across the
    // plank band); 0.046 mirrors the cn8LeftRailPlanHalves CUT literal.
    // r33 (review r33-r4 P2), r36 recess: the six straight body-deck
    // strips (table.js cn8-beam-deck-l/e mirror: top at the drawn break
    // edge z6, seat 0.2 mm above the bed, outer faces 0.6 mm inside the
    // U2 body face, long strips gapped at the +/-75 mm side bays, ends
    // at the +/-40 mm U3 cut stations; the corner square is air per
    // U6). Near-black cn8DeckMat -> mats.block albedo.
    deckStrips: (() => {
      const ZD = 0.006; const DD = 0.0058; const BAY = 0.075;
      const pxD = CN8.L / 2 + CN8_X_BODY - 0.0006;
      const pzD = CN8.W / 2 + CN8_X_BODY - 0.0006;
      const cw = CN8.CW;
      const innL = CN8.W / 2 + cw - 0.002;
      const innE = CN8.L / 2 + cw - 0.002;
      const cutL = CN8.L / 2 - 0.040;
      const cutE = CN8.W / 2 - 0.040;
      const out = [];
      for (const sz of [-1, 1]) {
        for (const sx of [-1, 1]) {
          out.push({ x0: Math.min(sx * BAY, sx * cutL),
            x1: Math.max(sx * BAY, sx * cutL),
            z0: Math.min(sz * innL, sz * pzD),
            z1: Math.max(sz * innL, sz * pzD),
            y0: ZD - DD, y1: ZD });
        }
      }
      for (const sx of [-1, 1]) {
        out.push({ x0: Math.min(sx * innE, sx * pxD),
          x1: Math.max(sx * innE, sx * pxD),
          z0: -cutE, z1: cutE, y0: ZD - DD, y1: ZD });
      }
      return out;
    })(),
    // GH-490 PASS-2 item 7 (review pass2-r3 P2 mirror follow-through):
    // the eight rosewood rail-end closure plates are runtime occluder/
    // bounce geometry at the U3 cut planes — without them the bake
    // modeled the corner bay as OPEN. Wood albedo (the planks' knob).
    // GH-572 (close-out fold-r2 P2): mirror the FINAL PASS-3 plate
    // geometry (table.js mkPlate): the live plates span the full
    // under-frame stack to the blind bottom (y −0.255, the pass-2
    // boxes stopped at −0.10) and the top edge STEPS DOWN to −0.004
    // wherever the run passes within plan radius 0.056 of the corner
    // fall centre O_f (the knit-ring seat + gutter annulus) — the
    // pass-2 flat boxes traced different corner-bay geometry than the
    // rendered table. Slab: 4 mm thick (the M2 2→4 mm law), inner face
    // 0.6 mm behind the U3 cut plane, inner edges 20 mm outboard of
    // the field, outer ends on the U2 body station — all table.js
    // literals (duplicated-literal law: change together).
    railEndPlates: (() => {
      const T = 0.004; // live plateT
      const cutL = CN8.L / 2 - 0.040; // U3 cut planes (CN8_R82M.Y_CUT)
      const cutE = CN8.W / 2 - 0.040;
      const pzP = CN8.W / 2 + CN8_X_BODY;
      const pxP = CN8.L / 2 + CN8_X_BODY;
      const inL = CN8.W / 2 + 0.020;
      const inE = CN8.L / 2 + 0.020;
      const Y1 = -0.255; // full under-frame stack (blind bottom)
      const Y0 = 0.012; // plate top
      const NY0 = -0.004; // stepped top under the knit-ring seat
      const NR = 0.056; // seat + gutter annulus about O_f
      // one live plate = up to three mirror boxes: the run splits at
      // the notch-circle chord (table.js mkPlate segs law, same math)
      const runSegs = (a0, a1, oc, dPerp) => {
        const lo = Math.min(a0, a1); const hi = Math.max(a0, a1);
        const disc = NR * NR - dPerp * dPerp;
        if (disc <= 0) return [[lo, hi, Y0]];
        const half = Math.sqrt(disc);
        const nLo = Math.max(lo, oc - half); const nHi = Math.min(hi, oc + half);
        if (nHi <= nLo) return [[lo, hi, Y0]];
        const segs = [];
        if (nLo > lo) segs.push([lo, nLo, Y0]);
        segs.push([nLo, nHi, NY0]);
        if (nHi < hi) segs.push([nHi, hi, Y0]);
        return segs;
      };
      const out = [];
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const ofx = sx * (CN8.L / 2 + CN8_R82M.C);
          const ofz = sz * (CN8.W / 2 + CN8_R82M.C);
          // long-rail plate: x-plane slab spanning [cut−4.6, cut−0.6] mm,
          // running along z from the inner edge to the body station
          const xA = sx * (cutL - 0.0006); const xB = sx * (cutL - 0.0006 - T);
          const xc = (xA + xB) / 2;
          for (const [a0, a1, top] of runSegs(sz * inL, sz * pzP, ofz,
            Math.abs(xc - ofx))) {
            out.push({ x0: Math.min(xA, xB), x1: Math.max(xA, xB),
              z0: a0, z1: a1, y0: Y1, y1: top });
          }
          // short-rail plate: z-plane slab, running along x
          const zA = sz * (cutE - 0.0006); const zB = sz * (cutE - 0.0006 - T);
          const zc = (zA + zB) / 2;
          for (const [a0, a1, top] of runSegs(sx * inE, sx * pxP, ofx,
            Math.abs(zc - ofz))) {
            out.push({ x0: a0, x1: a1,
              z0: Math.min(zA, zB), z1: Math.max(zA, zB), y0: Y1, y1: top });
          }
        }
      }
      return out;
    })(),
    bayBoots: (() => {
      // review midext-r5 P2, corrected at midext-r6 (this box was a phantom
      // lid, and r5 removed only part of it).
      // The r33 z0 stood at w = CW - 2 = 45.6 mm, from the era when a molded
      // cap CLOSED the bay: a solid box from there to the outer face was a
      // fair stand-in for a lid. The middle-furniture rebuild opened the bay
      // — the cover is a flat plate over an OPEN throat — so the inboard 42 mm
      // of this box became a lid over a hole, baking occlusion where light
      // now falls into the fall.
      // r5 set this bound at DT-07 = 76 mm on a census that could not support
      // it, and review midext-r6 was right to reject the result. That census
      // binned by w and took the highest VERTEX over the WHOLE bay width, so
      // one tab at the end of the bay reported the bin as if it were decked
      // across. Re-measured by TRIANGLE COVERAGE on a 2 mm u x 2 mm w plan
      // grid — per cell, the highest triangle of any visible mesh — the bay
      // cover family (cn8cap-boot / cn8-cloth-mid*) reaches the rail top at:
      //   w 70..80  no cell at all
      //   w 82..88  4 cells of 50: u = -45, -43, +43, +45  (two 4 mm tabs,
      //             one at each END of the bay — the r5 census's ghost)
      //   w 88..90  46 cells of 50: u = -45 .. +45         (the cover deck)
      // The full-width plate is the 88..90 band and nothing else, so the
      // proxy is the plate: MC-03 = 88 is the cover's inner face and BC-03
      // = 90 its outer. Everything inboard of 88 is the OPEN throat, and a
      // box across it bakes a lid over a hole.
      // STATED OMISSION: the two 4 mm x 6 mm end tabs are not modelled. A
      // plan texel is 10.6 x 9.9 mm (320x200 over the class bounds), so each
      // tab is sub-texel on both axes and cannot register as occlusion; two
      // extra boxes would add hash and code for a shadow the raster cannot
      // hold. The measurement above is the record that they exist.
      // r12-APPROVED (card 17b): the proxy is the moulded body's plan footprint —
      // front plane LP-04 − LP-02 to the back LP-04, across the slot ±DT-09
      const z0 = CN8.W / 2 + MID_FRONT;
      // GH-490m MIRROR FOLLOWS THE LIVE BUILDER. r33 put the drape plane on
      // CN8_SKIRT_FW, "the side-pocket bulge drape plane" — the molded-cap
      // REVOLVE that the middle-furniture rebuild retires. That bulge is the
      // owner's Defect B verbatim (「你的皮环后面是一个圆弧?」), and this box
      // was baking its shadow: z1 stood at w = 140.1 mm from the nose datum,
      // 50.1 mm outboard of the drawn cover face and 48.1 mm outboard of the
      // plank arris DT-04 — a phantom occluder past the woodwork.
      // The live bay is now closed by the flat bay cover, whose outboard face
      // is BC-03. Read from the contract, not re-typed: ADR-0015 forbids a
      // second hand-typed copy of a drawn number, and this is a drawn number.
      const z1 = CN8.W / 2 + MID_BACK;
      const hx = MID_GEO.DT09;
      return [{ x0: -hx, x1: hx, z0, z1 },
        { x0: -hx, x1: hx, z0: -z1, z1: -z0 }];
    })(),
    railPlans: () => railPolysCn8().map(toPlanFor(CN8.L, CN8.W)),
    woodPlans: () => woodPlansCn8().map(toPlanFor(CN8.L, CN8.W)),
  },
  carom_284: {
    footprint: { length: 2.84, width: 1.42 }, pocketless: true,
    L: CAROM.L, W: CAROM.W, CW: CAROM.CW, FW: CAROM.FW,
    railTop: 0.046, frameTop: 0.047, ballR: 0.03075, legIn: 0.237,
    // GH-730 frame-top repin (the snooker floorY precedent above):
    // floor→bed 0.753 (UMB Art. 11 §8 frame-top datum, 800 upper bound
    // by the clamp rule, minus the 47 mm crest — the SAME expression as
    // the table.js entry so the doubles are identical).
    floorY: -(0.800 - 0.047),
    bedMargin: 0.10, // populateCarom's own 0.10 literal (GH-395)
    // populateCarom extrudes its apron 0.28 m down from y=0.006 (table.js
    // :2343 — bottom at -0.274; the generic/snooker family is 0.26 deep,
    // the pool/snooker default -0.254 literal below) — review r9
    apronY0: -0.274,
    mats: { cloth: [0.0044, 0.078, 0.27], wood: [0.069, 0.019, 0.011] },
    railPlans: () => railPolysCarom().map(toPlanFor(CAROM.L, CAROM.W)),
    woodPlans: () => woodPlansCarom().map(toPlanFor(CAROM.L, CAROM.W)),
  },
};

// ---- per-look materials (linear albedo / lamp radiance) --------------------
// Effective diffuse albedos eyeballed from the runtime materials (sRGB color
// × texture average, linearized); lamp = RectAreaLight intensity × color.
export const LOOKS = {
  default: {
    cloth: [0.0042, 0.062, 0.017], wood: [0.13, 0.045, 0.028],
    floor: [0.045, 0.030, 0.021], wall: [0.055, 0.047, 0.038],
    lamp: [7.6, 7.6 * 0.9451, 7.6 * 0.8549],
  },
  tournament: {
    cloth: [0.075, 0.081, 0.085], wood: [0.09, 0.026, 0.018],
    floor: [0.030, 0.030, 0.030], wall: [0.018, 0.016, 0.014],
    lamp: [7.8 * 0.9647, 7.8 * 0.9686, 7.8 * 0.9765], // 0xf6f7f9 neutral key
  },
};

/** Static bake scene for a (look, fixture, table class): AABB-culled
 * triangle objects + plan classification helpers. `blockers` = the subset
 * that casts lamp shadows. `fixture` (issue #89) selects the emitter set;
 * `table` (GH-337) selects the TABLES class — the pool default reproduces
 * the pre-337 scene float-identically, and the canopy default reproduces
 * the pre-#89 scene byte-identically (both verified by re-bake). The room
 * (floor/walls/fixture geometry) is class-independent — room.js builds the
 * same room for every table. */
export function buildBakeScene(look, fixture = 'canopy_panel', table = 'pool') {
  if (look === 'sp') look = 'tournament'; // the legacy look id (GH-973)
  const m = LOOKS[look];
  const fx = FIXTURES[fixture];
  const tb = TABLES[table];
  // branded discipline tables carry look-independent cloth/wood (TABLES note)
  const clothA = tb.mats?.cloth ?? m.cloth;
  const woodA = tb.mats?.wood ?? m.wood;
  const railPlans = tb.railPlans();
  const woods = tb.woodPlans();
  // concave classes ear-clip their prism caps (review r4 — TABLES note);
  // pool keeps prism()'s fan, its committed byte-identical tessellation
  const prismFn = tb.concaveCaps ? prismConcave : prism;
  const objs = [];
  // per-class bed margin (GH-395): table.js gives the template (snooker)
  // family 0.11 m — sealing the deep corner falls — while every pool entry
  // and populateCarom resolve to the pre-012 0.10. The flat 0.10 here baked
  // snooker GI against a bed missing a 10 mm cloth strip around the outer
  // edge and pocket throats. Pool keeps the 0.10 literal via its TABLES
  // entry (float-identity with the pre-337 expression).
  const bedX = tb.L / 2 + tb.CW + tb.bedMargin;
  const bedZ = tb.W / 2 + tb.CW + tb.bedMargin;
  if (tb.falls) {
    // bed with the fall discs cut out + near-black cup plugs just above
    // the slab top (review r5): throat rays gather ~zero bounce instead of
    // green cloth. Classes without falls keep the pre-337 solid sheet.
    // GH-489 W6: the snooker falls class carries the corner-cut outline
    // (tb.bedCut — table.js snookerBedCutPath) and rides bedSnookerCut;
    // review r33-r1 P1 (GH-490): classes declaring cornerClips get their
    // bed corner vertices clamped radially onto the clip arcs (the live
    // r33 cn8 bed corner clip); classes with neither field are
    // byte-identical (bedWithFalls).
    if (tb.bedCut) {
      objs.push(makeObject('bed', { albedo: clothA },
        bedSnookerCut(bedX, bedZ, tb.bedCut, tb.falls)));
    } else {
      const bedTris = bedWithFalls(bedX, bedZ, tb.falls);
      if (tb.cornerClips) {
        // review r33-r2 P1: a vertex is clipped ONLY inside its corner's
        // OUTWARD wedge (beyond O_f toward that corner in both axes) —
        // the first cut projected every bed vertex onto all four circles
        // (nearly the whole bed is outside each unrelated circle), which
        // collapsed the bake bed to the last corner's arc and erased the
        // cloth bounce from the committed maps.
        for (const tri of bedTris) {
          for (const v of tri) {
            for (const c of tb.cornerClips) {
              const dx = v[0] - c.x, dz = v[2] - c.z;
              if (dx * Math.sign(c.x) <= 0 || dz * Math.sign(c.z) <= 0) {
                continue;
              }
              const r = Math.hypot(dx, dz);
              if (r > c.r) {
                v[0] = c.x + (dx / r) * c.r;
                v[2] = c.z + (dz / r) * c.r;
              }
            }
          }
        }
      }
      objs.push(makeObject('bed', { albedo: clothA }, bedTris));
    }
    tb.falls.forEach((f, i) => objs.push(makeObject(`cup${i}`,
      { albedo: [0.01, 0.01, 0.01] }, discTris(f.x, f.z, f.r, -0.0008))));
  } else {
    objs.push(makeObject('bed', { albedo: clothA }, hrect(-bedX, -bedZ, bedX, bedZ, 0)));
  }
  railPlans.forEach((p, i) =>
    objs.push(makeObject(`rail${i}`, { albedo: clothA }, prismFn(p, 0.0, tb.railTop))));
  // GH-489 W6: the snooker wood-plan list carries the four RESHAPED gold
  // corner castings after the six planks (tb.castFrom) — gold albedo on
  // the live casting band y ∈ [castY0, frameTop]. Classes without
  // castFrom (pool/carom) emit the pre-W6 wood prisms byte-identically.
  woods.forEach((p, i) => {
    const isCast = i >= (tb.castFrom ?? Infinity);
    objs.push(makeObject(`wood${i}`,
      { albedo: isCast ? tb.goldA : woodA },
      prismFn(p, isCast ? tb.castY0 : 0.006, tb.frameTop)));
  });
  // round-14: side-bay boot stand-ins (classes without bayBoots are
  // byte-identical — only chinese8 declares them; see the TABLES note)
  (tb.bayBoots ?? []).forEach((b, i) =>
    objs.push(makeObject(`boot${i}`, { albedo: tb.mats?.boot ?? woodA },
      box(b.x0, 0.006, b.z0, b.x1, tb.frameTop, b.z1))));
  // r33 (review r33-r4 P2): straight body-deck strips (chinese8 only —
  // classes without the field are byte-identical)
  (tb.deckStrips ?? []).forEach((d, i) =>
    objs.push(makeObject(`deck${i}`, { albedo: tb.mats?.block ?? woodA },
      box(d.x0, d.y0, d.z0, d.x1, d.y1, d.z1))));
  // GH-490 PASS-2 (review pass2-r3 P2): rail-end closure plates —
  // chinese8 only; classes without the field are byte-identical
  (tb.railEndPlates ?? []).forEach((d, i) =>
    objs.push(makeObject(`endplate${i}`, { albedo: woodA },
      box(d.x0, d.y0, d.z0, d.x1, d.y1, d.z1))));
  // GH-490 ROUND-31: corner assembly stand-ins (rev-8.2 mouth — leather
  // boot / green tongues / JOY corner block; classes without the field
  // are byte-identical). `boot` prefix keeps them in the blockers set.
  const cornerAsm = tb.cornerAssemblies ? tb.cornerAssemblies() : [];
  cornerAsm.forEach((c, i) => {
    // r32 (gate r29 P1 block dressing): the block stand-in mirrors the
    // live cn8BlockMat black-gloss lacquer via mats.block — classes
    // without the field keep the historical woodA byte-identically.
    const alb = c.kind === 'boot' ? (tb.mats?.boot ?? woodA)
      : c.kind === 'tongue' ? clothA
        : (tb.mats?.block ?? woodA);
    objs.push(makeObject(`bootCorner${i}-${c.kind}`, { albedo: alb },
      prismFn(c.plan, 0.0, c.top)));
  });
  // r33: the apron/blind envelope rides the class skirt width where one
  // is declared; classes without the field keep the FW expression
  // float-identically. r36 (chinese8 only): the blind FACE recesses to
  // the rev-8.4 U2 body station (tb.bodyX) while the LEG stance keeps
  // its r32 floor footprint (axLeg/azLeg below — table.js mirror).
  const sfw = tb.skirtFW ?? tb.FW;
  const axLeg = tb.L / 2 + tb.CW + sfw - 0.003;
  const azLeg = tb.W / 2 + tb.CW + sfw - 0.003;
  const ax = tb.bodyX ? tb.L / 2 + tb.bodyX : axLeg;
  const az = tb.bodyX ? tb.W / 2 + tb.bodyX : azLeg;
  const at = tb.apronT ?? 0.055; // template classes recess behind the falls
  const ay0 = tb.apronY0 ?? -0.254; // per-class apron depth (review r9)
  // r36 (review r36-r1 P2): classes with the recessed body (bodyX) also
  // terminate the apron/blind boxes on the U3 cut planes (y_cut −40 per
  // side) — the live blinds end there and the corner bay is AIR (U6);
  // the full-length ring boxes left a phantom blocker in the corner
  // squares (measured: 116 mm past the cut, 14 mm outside the tangent
  // chain — 20 GI bakes carried its shadow). Classes without bodyX
  // keep the full ring float-identically.
  // GH-572 review r1 P2 (PASS-3 M2 mirror): the live beam/blind boxes
  // RETREAT a further 5 mm from the U3 cut planes (table.js CUT_RETREAT
  // — the closure plates own every cut-plane sightline). The proxy used
  // to end ON the plane, so the plate slabs (0.6-4.6 mm behind it) sat
  // EMBEDDED in a stale apron extension and directLamp/bounce still hit
  // apron first — the endplate blocker fix was a no-op until this
  // retreat. Classes without bodyX byte-identical.
  const acL = tb.bodyX ? tb.L / 2 - 0.040 - 0.005 : ax;
  const acW = tb.bodyX ? tb.W / 2 - 0.040 - 0.005 : az;
  // GH-518 review round-2 r6 P2 (merge fold GH-490 x GH-518): the live
  // snooker obSnkPanel strips STOP at the corner posts (SNK.postSpan) —
  // full-length boxes intruded 22.4 mm into every open corner throat on
  // the narrowed band and baked light from nonexistent geometry.
  // apronStop shortens the strips per class; the 0 default keeps every
  // other class byte-identical (chinese8's own corner termination stays
  // the U3 acL/acW cut planes above).
  // GH-489 W6: tb.apronBay opens the middle bays on the LONG sides — two
  // runs per side from the posts to ±apronBay (the live obSnkPanel
  // split); the 0 default emits the single full run float-identically.
  const aStop = tb.apronStop ?? 0;
  const aBay = tb.apronBay ?? 0;
  // (merge fold 489×490: the run endpoints ride the U3 cut stations acL —
  // identical to ax on every class without bodyX)
  const sideRuns = aBay > 0
    ? [[aBay, acL - aStop], [-(acL - aStop), -aBay]]
    : [[-acL + aStop, acL - aStop]];
  // A8 CABINET RE-PLANE (489 corner graft): with tb.apronInset the apron
  // emits as TWO BANDS — flush [apronSplitY, 0.006] at ax/az, recessed
  // [ay0, apronSplitY] at ax/az − inset (the measured XW101 rail
  // overhang). Classes without the param emit the single band
  // byte-identically.
  const aBands = tb.apronInset
    ? [{ y0: tb.apronSplitY, y1: 0.006, inset: 0 },
      { y0: ay0, y1: tb.apronSplitY, inset: tb.apronInset }]
    : [{ y0: ay0, y1: 0.006, inset: 0 }];
  objs.push(makeObject('apron', { albedo: tb.apronA ?? woodA }, [
    ...aBands.flatMap(({ y0, y1, inset }) => {
      const axb = ax - inset, azb = az - inset;
      return [
        ...sideRuns.flatMap(([x0, x1]) => [
          ...box(x0, y0, -azb, x1, y1, -azb + at),
          ...box(x0, y0, azb - at, x1, y1, azb),
        ]),
        ...box(-axb, y0, -acW + aStop, -axb + at, y1, acW - aStop),
        ...box(axb - at, y0, -acW + aStop, axb, y1, acW - aStop),
      ];
    }),
    // W17: the corner return that closes the frame under the leather
    ...(tb.cornerClose ?? []).flatMap((b) => box(
      Math.min(b.x0, b.x1), b.y0, Math.min(b.z0, b.z1),
      Math.max(b.x0, b.x1), b.y1, Math.max(b.z0, b.z1))),
  ]));
  // GH-518 fix round 2: snooker's slab is the 50 mm bare slate (slabY0
  // −0.054, slateA); the shared −0.06/woodA literals stay the pool/carom
  // classes' byte-identical emission. GH-489 W6: the snooker slab rides
  // the corner-cut plan (tb.slabPlan — table.js obSnkSlab twin, ear-
  // clipped prism); the box stays the other classes' emission.
  if (tb.slabPlates) {
    // two-plate slate (A8-era runtime mirror, review graft-r5 P2)
    tb.slabPlates(bedX, bedZ).forEach((pl, i) => objs.push(makeObject(
      i ? 'slabReb' : 'slab', { albedo: tb.slateA ?? woodA },
      prismConcave(pl.pts, pl.y0, pl.y1))));
  } else {
    objs.push(makeObject('slab', { albedo: tb.slateA ?? woodA },
      tb.slabPlan
        ? prismConcave(tb.slabPlan(bedX, bedZ), tb.slabY0 ?? -0.06, -0.001)
        : box(-bedX, tb.slabY0 ?? -0.06, -bedZ, bedX, -0.001, bedZ)));
  }
  if (tb.members) {
    // under-frame beams/battens (slab bottom → memberY1, default −0.205;
    // 489 BLOCKER-CURE B14: the snooker members extend to apronBot),
    // the live obSnkBeam/obSnkBatten mirror
    tb.members.forEach((mb, i) => objs.push(makeObject(`member${i}`,
      { albedo: tb.memberA ?? woodA },
      box(mb.x0, tb.memberY1 ?? -0.205, mb.z0, mb.x1,
        tb.slabY0 ?? -0.06, mb.z1))));
  }
  if (tb.soffits) {
    // 489 BLOCKER-CURE (B11/B14): the A8 overhang soffit ring — thin
    // apron-albedo plates at the railBandBot step (obSnkSoffit mirror)
    tb.soffits.forEach((sf, i) => objs.push(makeObject(`soffit${i}`,
      { albedo: tb.apronA ?? woodA },
      box(sf.x0, -0.104, sf.z0, sf.x1, -0.096, sf.z1))));
  }
  if (tb.legs) {
    // per-class explicit leg stances (GH-518: the snooker Star body's
    // EIGHT turned gold legs, box occluders at the live builder's centres)
    tb.legs.forEach((lg) => objs.push(makeObject('leg',
      { albedo: tb.goldLegA ?? tb.goldA ?? woodA },
      box(lg.x - lg.half, lg.y0, lg.z - lg.half,
        lg.x + lg.half, lg.y1, lg.z + lg.half))));
  } else {
    // per-class leg albedo (PR-2 review r2: the cn8 legs are painted gold —
    // classes without mats.leg keep the historical woodA byte-identically)
    const legA = tb.mats?.leg ?? woodA;
    // GH-490 BLOCKER-CURE B4: the chinese8 truth table stands on SIX
    // legs (mid-side pair at x = 0 — src_csy arena photo); classes
    // without midLegs keep the historical four byte-identically.
    const legStances = tb.midLegs
      ? [[-1, -1], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 1]]
      : [[-1, -1], [-1, 1], [1, -1], [1, 1]];
    for (const [sx, sz] of legStances) {
      // review blocker-cure r3 P2 mirror: the live mid stance insets
      // 50 mm clear of the side-pocket sock (table.js cn8 legs note)
      const midIn = tb.midLegs && sx === 0 ? 0.05 : 0;
      // long-axis stance per class (TABLES.legIn — pool 0.197 float-identical
      // to the pre-337 literal); the cross-axis 0.197 stance is shared;
      // r36: legs ride axLeg/azLeg (identical to ax/az for classes
      // without bodyX)
      const lx = sx * (axLeg - tb.legIn);
      const lz = sz * (azLeg - 0.197 - midIn);
      // GH-730: carom's leg boxes ride its floor (floorY + the 0.05
      // live foot), the way the live populateCarom column now does.
      // GATED on floorY presence: carom_284 is the only generic-path
      // class carrying floorY (snooker takes the explicit-legs branch
      // above), so every other class keeps the -0.74 literal
      // byte-identically and only the carom bake moves.
      const legY0 = tb.floorY === undefined ? -0.74 : tb.floorY + 0.05;
      objs.push(makeObject('leg', { albedo: legA },
        box(lx - 0.11, legY0, lz - 0.11, lx + 0.11, -0.18, lz + 0.11)));
    }
  }
  // gold corner posts (GH-518 snooker body) — occluder tier. Each post
  // carries the live fall cutout as a SQUARE hole circumscribing the
  // circle (review r7: solid boxes baked gold bounce across the open
  // corner throats; the square-vs-circle sliver errs occlusive/dark,
  // never washes) — emitted as a 4-slab frame around the hole.
  if (tb.posts) {
    tb.posts.forEach((p, i) => {
      const x0 = Math.min(p.x0, p.x1), x1 = Math.max(p.x0, p.x1);
      const z0 = Math.min(p.z0, p.z1), z1 = Math.max(p.z0, p.z1);
      const alb = { albedo: tb.goldA ?? woodA };
      if (p.slabs) {
        // GH-489 W7: pre-decomposed slab list (flank arms + wedge stub;
        // the play-corner notch and the outward wedge above −0.120 are
        // VOID — the open corner bay; a void errs dark, never washes)
        const t = [];
        for (const sl of p.slabs) {
          if (sl.x1 > sl.x0 && sl.z1 > sl.z0) {
            t.push(...box(sl.x0, sl.y0, sl.z0, sl.x1, sl.y1, sl.z1));
          }
        }
        objs.push(makeObject(`apronpost${i}`, alb, t));
      } else if (!p.hole) {
        objs.push(makeObject(`apronpost${i}`, alb, box(x0, p.y0, z0, x1, p.y1, z1)));
        return;
      } else {
        // GH-518 review round-2 r6 P2: the live obSnkPost hole is CIRCULAR;
        // a 4-slab frame around the circumscribing square removed the
        // square-minus-circle corner material that exists at runtime
        // (bounce rays saw void instead of gold). The frame now bounds the
        // INSCRIBED square (hr/√2) — the conservative opening: the sliver
        // it overfills errs occlusive/dark, never washes (the r7 doctrine,
        // now applied in the correct direction).
        const { x: hx, z: hz, r: hr } = p.hole;
        const hs = hr * Math.SQRT1_2;
        const t = [];
        if (hx - hs > x0) t.push(...box(x0, p.y0, z0, hx - hs, p.y1, z1));
        if (x1 > hx + hs) t.push(...box(hx + hs, p.y0, z0, x1, p.y1, z1));
        if (hz - hs > z0) t.push(...box(hx - hs, p.y0, z0, hx + hs, p.y1, hz - hs));
        if (z1 > hz + hs) t.push(...box(hx - hs, p.y0, hz + hs, hx + hs, p.y1, z1));
        objs.push(makeObject(`apronpost${i}`, alb, t));
      }
      if (tb.ribA && p.mid) {
        // 489 BLOCKER-CURE (B11, review blocker-r2 P2): a mid-leg head
        // carries ONE outer-face rib on its ±z side and no skirt — the
        // corner-only proxies below never run for it
        const zc2 = p.ribZ > 0 ? Math.max(p.z0, p.z1) : Math.min(p.z0, p.z1);
        const xm2 = (p.x0 + p.x1) / 2;
        objs.push(makeObject(`postrib${i}`, { albedo: tb.ribA },
          box(xm2 - 0.0275, -0.236, Math.min(zc2, zc2 + p.ribZ * 0.006),
            xm2 + 0.0275, -0.151, Math.max(zc2, zc2 + p.ribZ * 0.006))));
      } else if (tb.ribA) {
        // GH-518 fix round 2 (finding 4): dark ribbed panels wrapped on
        // the post's two outer faces — mirror of the live obSnkPostRib
        // pair, coarse occluder tier. GH-489 W7: the live panels narrow
        // to 110 mm and re-centre toward the rail runs (table.js
        // `zi + sz·0.063` / `xi + sx·0.063`) so they stay backed by the
        // flank arms at the ±0.66 wedge — the mirror follows.
        const rsx = Math.sign(p.x1 - p.x0), rsz = Math.sign(p.z1 - p.z0);
        const fx = p.x1 + rsx * 0.006, fz = p.z1 + rsz * 0.006;
        const xc = p.x0 + rsx * 0.033;
        const zc = p.z0 + rsz * 0.033;
        // W14: the rib panels ride the LEG-HEAD band (table.js ribW
        // 0.055 / ribH 0.085 at ribCy −0.19325 — E9: the flutes live
        // below the rail line, never beside the leather; review r1 P1:
        // dims follow the 150 mm leg cap)
        objs.push(makeObject(`postrib${i}`, { albedo: tb.ribA }, [
          ...box(Math.min(p.x1, fx), -0.236, zc - 0.0275,
            Math.max(p.x1, fx), -0.151, zc + 0.0275),
          ...box(xc - 0.0275, -0.236, Math.min(p.z1, fz),
            xc + 0.0275, -0.151, Math.max(p.z1, fz)),
        ]));
        if (tb.skirtA) {
          // GH-489 W12: the hanging bell skirt occupies the wedge sector
          // — a cream chord box on the corner diagonal (errs occlusive on
          // the wedge void, never washes). Review W12 r1 P2: the first cut
          // anchored off the POST outer corner and landed at 52-95 mm
          // from the cup — inside the aperture (phantom occlusion + warm
          // bounce). The proxy derives from the LIVE cup centre: the
          // rendered skirt spans r 96-115 mm, so the box corners sit at
          // cup + diag·[0.068, 0.082] per axis (diagonal span ~96-116).
          const cf = (tb.falls ?? []).find((f) =>
            Math.abs(f.x) > 0.5
            && Math.sign(f.x) === rsx && Math.sign(f.z) === rsz);
          if (cf) {
            // GH-489 W13 (gate r16 P1-1, one-bell loft): the proxy
            // re-anchors to the LIVE bell — face at r ≈ 92-97 mm from
            // the cup, spanning meet (+0.047) to hem (−0.1055), full
            // sector ±0.56 rad (melt ±0.645). Five box stations along
            // the r ≈ 0.0945 arc at k·0.28 occlude the live sector
            // (the W12 proxy rode the retired recessed curtain).
            // Half-size 17 mm carries the W12 trailing-review lesson:
            // 13 mm stations left real grid columns between stations
            // outside every box.
            // W14 (GH489-EXT-R1.2): the proxy re-anchors to the XW101
            // horseshoe — a 14.6° flared cone from the +47 meet
            // (r ≈ 54.2) to the −105.5 hem (r ≈ 94) about the cup,
            // full seam-to-seam wrap: three radius tiers per station
            // follow the cone (each box hugs its band's live radii;
            // the W13 r 0.0945 full-height wall over-blocked the new
            // slimmer top and phantom-occluded the collar).
            // W17 RE-SYNC: the station range is now the LIVE one. The
            // ±0.56 rad literal was the retired W13 curtain's — W14
            // rewrote the radius tiers for the XW101 cone and left the
            // sweep behind, so the proxy covered ±32.1° of a ±98.5°
            // horseshoe (32.6 %). Two thirds of a strongly bouncing
            // cream occluder were VOID, and this file's own W12 note
            // records what a void does: it errs BRIGHT. That is the
            // stale-mirror half of the bright corner bay.
            // RADIUS-BASIS TRAP: table.js's phiFace uses c.r = rvC (no
            // lip), while falls[].r here carries the 4 mm arris lip —
            // using cf.r would come out ~6° short.
            const xFaceS = SNOOKER.L / 2 - SNOOKER.fcx.uFaceC;
            const zFaceS = SNOOKER.W / 2 - SNOOKER.fcx.uFaceC;
            const phiMaxS = 0.75 * Math.PI
              - Math.acos(Math.min(1, (Math.abs(cf.x) - xFaceS - 0.013)
                / (SNOOKER.fcx.rvC + 0.005)));
            const NS = Math.ceil(phiMaxS / 0.28); // keep the ≤0.28 step
            // the terminal columns lap onto the squared wood END FACES
            // (table.js snkBootGeom faces[], 0.8 mm lap) — clamp a
            // station centre that would sit inboard of its face plane
            const cl = (v, lim, s) => (s * (v - s * lim) < 0.0008
              ? s * (lim + 0.0008) : v);
            // A6 RE-SYNC (twin row A6 / proposal_ext_r2_7): the tiers
            // follow the AMENDED XW101 section — 12.5° skirt cone from
            // the (0.0871, +0.018) meet to the 0.1145 hem, and the
            // dome/brim band (brim tube outer r 0.119 at +0.012, dome
            // out to r 0.094) as one conservative wide tier (errs
            // occlusive on the corner bay, never washes).
            const tris = [];
            const diagA = Math.atan2(rsz, rsx);
            for (let k = -NS; k <= NS; k++) {
              const a = diagA + (k * phiMaxS) / NS;
              for (const [rr, y0, y1, hf] of [
                [0.1080, -0.1055, -0.045, 0.017],
                [0.0950, -0.045, 0.010, 0.015],
                [0.1000, 0.010, 0.0572, 0.019],
              ]) {
                const bx = cl(cf.x + rr * Math.cos(a), xFaceS, rsx);
                const bz = cl(cf.z + rr * Math.sin(a), zFaceS, rsz);
                tris.push(...box(bx - hf, y0, bz - hf, bx + hf, y1, bz + hf));
              }
            }
            objs.push(makeObject(`cornerskirt${i}`,
              { albedo: tb.skirtA }, tris));
          }
        }
      }
    });
  }
  // per-class floor plane (GH-518/#499: the room seats the floor on the
  // entry's bedAboveFloor — snooker −0.817; every other class keeps the
  // legacy FLOOR_Y literal byte-identically)
  const floorY = tb.floorY ?? FLOOR_Y;
  objs.push(makeObject('floor', { albedo: m.floor }, hrect(-4.5, -3, 4.5, 3, floorY)));
  // wall box: prism sides + its top cap is the ceiling; bottom cap sits just
  // below the floor quad so the floor plane always wins the ray race
  objs.push(makeObject('walls', { albedo: m.wall },
    prism([[-4.5, -3], [4.5, -3], [4.5, 3], [-4.5, 3]], floorY - 0.01, CEIL_Y)));
  // fixture hoods/frames (blockers) + emitters — ALL emitters share the
  // 'lamp' name so the bounce/probe emitter checks and the blockers filter
  // work unchanged for any fixture (issue #89). Canopy emits the exact
  // pre-#89 geometry: x = 0 keeps `0 - w/2 === -w/2` float-identical.
  const lampL = fixtureLamp(look, fixture, table);
  fx.hoods.forEach((h, i) => objs.push(makeObject(
    fx.hoods.length === 1 ? 'hood' : `hood${i}`, { albedo: [0.02, 0.03, 0.02] },
    box(h.x - h.w / 2, h.y0, h.z - h.d / 2, h.x + h.w / 2, h.y1, h.z + h.d / 2))));
  let emitter = null;
  for (const e of fx.emitters) {
    emitter = makeObject('lamp', { emission: lampL },
      hrect(e.x - e.w / 2, e.z - e.d / 2, e.x + e.w / 2, e.z + e.d / 2, e.y));
    objs.push(emitter);
  }
  // GH-572 (close-out fold-r2 P2): the rail-end closure plates join the
  // direct-shadow blocker set — they are named `endplate*`, so the
  // historical prefix list left them transparent to directLamp (bounce
  // rays saw them, direct irradiance + the floor-shadow bake modeled the
  // corner bay as open). Classes without railEndPlates have no endplate*
  // objects — byte-identical.
  const blockers = objs.filter((o) =>
    /^(rail|wood|apron|slab|leg|hood|boot|endplate)/.test(o.name));
  /** top static surface height at a plan point (bed / cushion / wood).
   * GH-490 round-8: the chinese8 mouth-ring annulus evaluates at the
   * jaw-cloth plane — the flat tongue consumes those texels
   * (TABLES.chinese8_9ft mouthRingZone note); classes without the field
   * are byte-identical. */
  // round-14 review r2 (P2): the bay-boot boxes are receivers too — a
  // plan/flank texel inside their footprint must evaluate at the boot
  // top, not originate at bed height INSIDE the blocker (which
  // self-occluded its whole direct field and killed the intended
  // cream bounce).
  const bayBoots = tb.bayBoots ?? [];
  const inBayBoot = (x, z) => bayBoots.some((b) =>
    x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
  // corner fall discs (R1 r2 mouth-well receiver below): the CORNER
  // subset of the class falls (|x|,|z| test excludes the side falls).
  const cornerFalls = (tb.falls ?? []).filter((f) =>
    Math.abs(f.x) > 0.8 && Math.abs(f.z) > 0.3);
  const inCornerFall = (x, z) => cornerFalls.some((f) =>
    Math.hypot(x - f.x, z - f.z) <= f.r);
  const topY = (x, z) => {
    for (const p of woods) if (pointInPoly(x, z, p)) return tb.frameTop;
    if (inBayBoot(x, z)) return tb.frameTop;
    for (const p of railPlans) if (pointInPoly(x, z, p)) return tb.railTop;
    // GH-490 ROUND-31: corner assembly footprints classify at their own
    // piece tops (boot crown band / tongue+block deck).  The r26 diag
    // sector split RETIRED with the fil() entries — only chinese8 ever
    // carried `diag` entries, so its removal is byte-neutral elsewhere.
    for (const c of cornerAsm) if (pointInPoly(x, z, c.plan)) return c.top;
    // REBUILD R1 r2 (defect-c GI fidelity): a corner FALL DISC is not
    // bed — the r31 classification left 348 chinese8 texels baking a
    // PHANTOM BED inside the cut-out (topY 0: the plan pass shot from
    // y 0.002 inside the hole the bake's own falls cut).  The honest
    // receiver is the MOUTH WELL: evaluate below the bed (y -0.03,
    // above the cup) so those plan texels carry the aperture's own
    // occluded field — dark E + low A, the live shader's umbra channel
    // (gi.a multiplies spikeShadow).  Scoped by cornerAssemblies
    // presence (chinese8 only); every other class byte-identical.
    if (cornerAsm.length && inCornerFall(x, z)) return -0.03;
    // OPEN, midext-r6, deliberately NOT closed here: the MIDDLE falls are
    // excluded from the clause above by the |x| > 0.8 filter, and until this
    // round it did not matter — the r33 bayBoots box decked the whole middle
    // bay at frameTop, so no middle-mouth texel ever reached this line.
    // Cutting that box back to the drawn cover plate drops 32 texels (16 per
    // middle, u +/-37 mm, w 78..88) through to the `return 0` default: bed
    // height over an open throat, which is the same species of phantom the
    // corner clause was written to kill. It is left as-is on purpose. Giving
    // the middle falls the mouth-well treatment moves 176 texels, not 32 —
    // the disc runs w -1..108 mm, so it would also re-evaluate the nose-side
    // jaw cloth and the plank band outboard of the cover, and this lane has
    // no measurement saying that is an improvement. Fixing a phantom lid is
    // not licence to re-light the jaw on the way past.
    if (tb.mouthRingZone) {
      for (const g of tb.mouthRingZone) {
        const d = Math.hypot(x - g.x, z - g.z);
        if (d >= g.ri && d <= g.ro) return g.y;
      }
    }
    return 0;
  };
  const insideRailOrWood = (x, z) =>
    railPlans.some((p) => pointInPoly(x, z, p))
    || woods.some((p) => pointInPoly(x, z, p)) || inBayBoot(x, z)
    || cornerAsm.some((c) => pointInPoly(x, z, c.plan));
  /** FLANK evaluation height at a plan point.  The default 0.026 is the
   * cushion-flank law; inside a chinese8 corner assembly footprint the
   * surface a flank texel feeds is the α72° throat wall / boot window
   * face hanging under the deck (r26 law carried to the rev-8.2
   * construction: evaluated at 0.026 the origin sits inside the corner
   * assembly and bakes near-black) — evaluate just under the deck. */
  const flankY = (x, z) => {
    for (const c of cornerAsm) {
      if (pointInPoly(x, z, c.plan)) return (tb.railTop ?? 0.042) - 0.007;
    }
    return 0.026;
  };
  // `lamp`/`emitterRects`: the fixture radiance + emitter geometry the bake
  // integrators sample (issue #89); `emitter`/`mats.lamp` keep the pre-#89
  // canopy shape for that fixture (mats is the shared look table — the
  // fixture radiance must never be written into it).
  return { objs, blockers, emitter, mats: m, lamp: lampL,
    // per-class floor plane (GH-518 review r1 P2): the floor sampling
    // passes in bake-lightmap.mjs must trace ON the class's floor quad —
    // sampling at the global FLOOR_Y left the snooker maps traced 29 mm
    // above their runtime surface. Pool/carom resolve to FLOOR_Y exactly.
    floorY, emitterRects: fx.emitters, topY, insideRailOrWood, flankY };
}
