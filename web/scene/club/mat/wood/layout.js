// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/wood/layout.js — pure numbers of the club look's wood part: which finish a material gets, the rail band read from the
// rail meshes' boxes, the lamp rectangle read from the scene's rectangular lights, the layout of the lamp's lit face (what the
// coat mirrors), the room's light on the table body (a JS mirror of the room's emitter law), and JS mirrors of the closed
// forms the shader uses (the floor's view of the lamp past the table top, the edge profile). No imports: the node arm runs it.

const LUMA = [0.2126, 0.7152, 0.0722];
export const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];

/**
 * Finish class from the material's own colour (linear RGB, as three stores it): a dark neutral colour is a black table
 * (laminate, or wood stained black: `hasMap` tells which), anything else is wood under clear lacquer.
 */
export function finishOf(color, hasMap) {
  const mx = Math.max(color[0], color[1], color[2]), mn = Math.min(color[0], color[1], color[2]);
  const neutral = mx <= 1e-6 || (mx - mn) / mx < 0.3;
  if (luma(color) < 0.06 && neutral) return hasMap ? 'black-stain' : 'black-laminate';
  return 'wood';
}

// Mean colour (linear) of each scan, and the fallback's. Measured once from the shipped files (a 1 x 1 box resample).
// `strip` (rail caps only): the part uploads one strip of the scan, 1 / strip of its extent across the grain, instead of the
// whole square. A rail cap is 13 cm wide and its outer face 5 cm high, so a 2.43 m scan was uploaded for a 0.2 m band of it:
// 22.4 MB of colour and 5.6 MB of relief for the wood table. The strip is 0.30 m wide: 2.8 MB and 0.7 MB. Scans the room
// already uploads (`wood_dark`) stay whole and shared.
export const SCANS = Object.freeze({
  'veneer.color': Object.freeze({ normal: 'veneer.normal', mean: [0.153, 0.033, 0.005], metres: [2.43, 2.43], alongV: true, strip: 8 }),
  'wood_dark.color': Object.freeze({ normal: 'wood_dark.normal', mean: [0.109, 0.024, 0.009], metres: [2.0, 2.0], alongV: false, strip: 0 }),
});

/**
 * Where a scan lands on a surface: metres per repeat along U and V, the offset per rail (so two rails do not show the same
 * piece) and a margin, for the whole scan or for its strip (`strip` > 0: the across-grain axis covers 1 / strip of the scan,
 * every rail reads the same band of it at another station along the grain, and the band starts a margin inside the strip).
 */
export function scanPlacement(info, scale = 1, strip = false) {
  const m = [info.metres[0] * scale, info.metres[1] * scale];
  if (!strip || !(info.strip > 1)) return { metres: m, perRail: [0.37, 0.61], margin: [0, 0] };
  return info.alongV
    ? { metres: [m[0] / info.strip, m[1]], perRail: [0, 0.61], margin: [0.12, 0] }
    : { metres: [m[0], m[1] / info.strip], perRail: [0.37, 0], margin: [0, 0.12] };
}

/**
 * Every number of a finish, per surface kind ('rail' = rail caps, 'body' = aprons and skirts, 'leg' = parts that stand on
 * the floor). coat: [strength, roughness of the coat's narrow lobe, share of the grain relief the coat follows,
 * micro-roughness variation]; haze: [roughness of the wide lobe, its share of the coat's reflection, slope of the coat's
 * waviness, how much handling moves the haze share]; brush: [share of the reflection taken by fine scratches along the grain,
 * their lobe along the grain, across it]; contrast: how much of the scan's figure shows; chroma: how much of the scan's hue
 * (0 = value only, a stain); relief: scale of the scan's normal map under the coat; scale: size of the scan's repeat against
 * its real size; depth: the colour under the coat against the app's own albedo (a black under a gloss is deeper than a matte
 * black: the app's matte finish carries the surface's whole brightness in its diffuse colour, under the coat the sheen
 * carries part of it); matte: what the coat's matting agent returns in every direction, as a diffuse reflectance (see below).
 *
 * WHY TWO LOBES. A satin lacquer is a clear binder with a matting agent: between the particles the surface is smooth (a
 * narrow lobe: the lamp's image keeps its shape), over them it scatters widely (the haze: a halo around that image and a
 * soft sheen far from it). One lobe cannot do both. At a close view the lamp sits 40 to 60 degrees off the mirror direction
 * of a rail cap, i.e. the half vector is 20 to 30 degrees off the normal. There the GGX distribution of round 1b's single
 * lobe (roughness 0.16, alpha 0.026) is 0.015 at 20 degrees, 1 / 32000 of its peak: the cap is black, as round 1b's close
 * views showed. A lobe of roughness 0.42 (alpha 0.18) holds 0.47 there, 31 times more (ggxD below; the node arm pins
 * both), which over a lamp of 0.7 sr is a soft gradient toward the lamp. And a single lobe that wide has no lamp shape left
 * in it. Numbers: black satin = 60-degree gloss about 35 to 45 GU (core 0.15, haze 0.42 at 35 %); lacquered veneer = a
 * semi-gloss, 65 to 75 GU (core 0.09, haze 0.36 at 25 %).
 * THE MATTE PEDESTAL. Far from every lobe (the far rail seen from the player's side: the half vector to the lamp is 55
 * degrees off the normal, where even the wide lobe holds 0.02) a satin surface is still not black: the matting agent returns
 * a little light in every direction. Rail caps of a black table: 1 % on top of the 0.75 % the stain keeps, which puts a
 * lamp-lit cap near the level of the app's own matte black; a lacquer has next to none (0.3 %).
 * The body of a black table: the app's body colour reflects about 0.4 % (no real laminate is that black); a satin black
 * board returns 4 to 6 % of what falls on it in all, most of it this way. Albedo x 2.5 plus 4.5 %.
 *
 * ROUND 3: THE RAIL IS LACQUERED, NOT SATIN. Round 2's black rail (core 0.15, haze 0.42 at 35 %, scratch fan 8 %) mirrored the
 * room as a tone, not as an image: the reflection service's cube holds the lit bar shelves, and a core of 0.15 reads it at
 * a prefilter level of 32 px a face, mixed with a third of a level that averages half the room. An app picture with the
 * same code and a core of 0.05 without haze showed the shelves, the bottles and the candles in the rail at the grazing
 * view (shots/wood/r3x1-V5.jpg against r3x1-V6.jpg, one boot). The rail's coat is now a rubbed gloss lacquer: core 0.075
 * (60-degree gloss about 80 GU: the room is an image, soft at the edges), haze 0.38 at 18 %, scratch fan 5 %. What keeps
 * it from reading as glass or plastic is the wood in it: `pore` = [how much of the mirror an open pore scatters (0.6 of it
 * comes back in the wide lobe: a pore is a matte slit, lighter than a dark reflection and darker than a bright one), how
 * much of the surface the pores cover (about half of this number), how far a pore darkens the wood under it, how much
 * less mirror the dark figure (early wood) carries], and a coat that follows a quarter of the scan's relief, so the image
 * in it swims a little along the grain. A laminate (no map on the app's material) has no pores.
 * The stain is also read lighter than in round 2 (depth 0.9 against 0.55, figure contrast 0.85 against 0.3): under the
 * lamp a black-stained rail is a very dark wood with its figure showing, not a black surface.
 */
export function finishParams(finish, kind) {
  const rail = kind === 'rail';
  const none = [0, 0, 0, 0];
  if (finish === 'wood') {
    return rail
      ? { scan: 'veneer.color', coat: [1.0, 0.07, 0.15, 0.1], haze: [0.36, 0.18, 0.002, 0.5], brush: [0.05, 0.12, 0.5], pore: [0.7, 0.22, 0.15, 0.25], contrast: 1.0, chroma: 0.75, relief: 0.8, scale: 1.0, depth: 1.0, matte: 0.003 }
      : { scan: 'wood_dark.color', coat: [1.0, 0.2, 0.15, 0.12], haze: [0.4, 0.0, 0.0, 0.0], brush: [0.0, 0.12, 0.5], pore: none, contrast: 1.0, chroma: 0.75, relief: 0.6, scale: 1.0, depth: 1.0, matte: 0.03 };
  }
  // black: a gloss lacquer over black; a stained wood keeps its open pores and its figure
  const stain = finish === 'black-stain';
  return rail
    ? { scan: 'wood_dark.color', coat: [1.0, 0.075, stain ? 0.28 : 0.0, 0.1], haze: [0.38, 0.18, stain ? 0.002 : 0.0012, 0.5], brush: [0.05, 0.12, 0.55], pore: stain ? [0.7, 0.24, 0.15, 0.35] : none, contrast: stain ? 0.85 : 0.0, chroma: stain ? 0.15 : 0.0, relief: stain ? 0.5 : 0.0, scale: 0.6, depth: stain ? 0.9 : 0.55, matte: 0.008 }
    : { scan: 'wood_dark.color', coat: [1.0, 0.3, stain ? 0.1 : 0.0, 0.12], haze: [0.4, 0.0, 0.0, 0.0], brush: [0.0, 0.12, 0.5], pore: none, contrast: stain ? 0.3 : 0.0, chroma: 0.0, relief: 0.0, scale: 0.6, depth: 2.5, matte: 0.045 };
}

/**
 * Round A2 (CONTRACT.md section 14): the table body in a HALL (the arena venue; mat/wood.js reads this for aprons, skirts
 * and legs there and never under the club venue). Why the club room's body numbers fail in a hall, measured in the app at
 * the wide eye-height view (one boot, the part's own switches): the app's own terms leave the legs at 14 of 255 and the
 * apron at 25, flat; the room's light on the body adds 25 to 31 levels on every outward face alike (the hall's heads give
 * the table's sides 3 to 4 units, twice the club room's, and the satin body returns 5.5 % of it in every direction); the
 * table's own occlusion takes 9 levels off. A body at 39 to 47 everywhere beside a carpet at 94: grey plastic.
 *   ambient     share of a face's light that is the hall's diffuse light (the lit carpet, the boards, the seats): it is
 *               cut by an overhang's solid angle only. The rest is the heads' hard light, which an overhang cuts with an
 *               edge (wood/glsl.js COAT_BODY_HALL). A look value: the analytic room has next to no ambient of its own.
 *   foot        level left at the foot of a leg on the carpet, and the height over which it comes back (m): the contact,
 *               not the club form's 30 cm fall toward a dark floor (the carpet beside a leg is lit)
 *   tan         bounds of the tangent of the heads' elevation as the room reports it (hallTan below)
 *   under       share of the app's own specular lobe kept under the coat. The club value is 1: on the app's tables that
 *               lobe is the calibrated stand-in for the room's fill on the cabinet, and in a hall it is a flat grey fill
 *               from a cube taken over the cloth (most of the 14 to 25 levels above); here the hall's light is read from
 *               the room and the coat mirrors the carpet
 *   black       the finish of a black table's body: a rubbed lacquer, as its rail caps have, in place of the satin board.
 *               `coatRoughness` 0.11 (the lit carpet and the boards are an image with soft edges; the satin's 0.3 kept a
 *               tone), a little haze, `matte` 3.2 % (the satin board's 4.5 % is what read as grey under 3 to 4 units),
 *               `depth` 1.4 (the colour under the coat; the satin's 2.5 also scaled the app's own flat terms).
 *               With these a lit outward face returns about 3.8 % as diffuse light and, seen at 65 degrees, mirrors 10 %
 *               of the carpet: the two are of one size, which is what a lacquered black cabinet shows. `matte` was tried
 *               at 1.8 % in the app (one boot, the wide eye-height view): the legs were then one flat tone, 21 to 23 of
 *               255 from the cabinet down to the foot, because the heads' light on them moved 2 levels; at 3.5 % the
 *               foot of a leg stands 3 levels over its top (28 against 25) and the shadow under the cabinet reads.
 * A wood table keeps its own finish in the hall; only the light's form changes.
 */
export const HALL_BODY = Object.freeze({
  ambient: 0.18, foot: 0.5, footHeight: 0.06, tan: Object.freeze([1.2, 3.5]), under: 0.35,
  black: Object.freeze({ coatRoughness: 0.11, haze: Object.freeze([0.4, 0.12, 0.0, 0.3]), matte: 0.032, depth: 1.4 }),
});

/** A body finish (finishParams of 'body' or 'leg') as the hall shows it. Pure; returns a new object, the input is not changed. */
export function hallBodyParams(p, finish) {
  if (finish !== 'black-stain' && finish !== 'black-laminate') return { ...p };
  const b = HALL_BODY.black;
  return { ...p, coat: [p.coat[0], b.coatRoughness, p.coat[2], p.coat[3]], haze: b.haze.slice(), matte: b.matte, depth: b.depth };
}

/**
 * The tangent of the elevation of a hall's main light as the table's sides see it: the room's light on the floor beside
 * the table over its light on the table's side faces (for one distant source at elevation e the two are sin e and cos e
 * times the same number). `faces` and `floor` are bodyLight()'s: irradiance per face (+x, -x, +y, -y, +z, -z) and on the
 * floor beside each side (+x, -x, +z, -z). Bounded to HALL_BODY.tan; a room with no light on the sides gives the upper bound.
 */
export function hallTan(faces, floor) {
  const [lo, hi] = HALL_BODY.tan;
  const side = [0, 1, 4, 5].map((i) => luma(faces?.[i] ?? [0, 0, 0])).reduce((a, b) => a + b, 0) / 4;
  const fl = [0, 1, 2, 3].map((i) => luma(floor?.[i] ?? [0, 0, 0])).reduce((a, b) => a + b, 0) / 4;
  if (!(side > 1e-6) || !Number.isFinite(fl)) return hi;
  return Math.min(hi, Math.max(lo, fl / side));
}

/**
 * Round A3 (CONTRACT.md section 15): the table body in the hall, second model. Read only under the arena venue.
 *
 * WHY A SECOND MODEL. Round A2's body stood at 14 to 27 of 255 beside a carpet at 87: a black cut-out. Its light was right
 * in kind (hard light from the heads past the overhangs) and its look was wrong in three places: (1) the lacquer's image
 * of the room was multiplied by the same occlusion factor as the diffuse light, so the one thing a black lacquer shows,
 * the lit carpet in it, was cut to a third under every overhang; (2) the carpet it mirrored was four constants, one per
 * side of the table, so the image had no pool, no shadow of the table and no fall toward the boards; (3) the app's own
 * flat specular fill stayed in at 35 %. The albedo law of this round takes the heads down to about a third (the carpet
 * went from 0.03 to 0.13), so a body whose albedo was already 0.04 loses two thirds of its diffuse light: what is left of
 * its look IS its reflection.
 *
 * THE MODEL (wood/glsl.js COAT_BODY_HALL2, woodFnHall):
 *   - the lacquer mirrors the HALL'S FLOOR AS THE ROOM HOLDS IT: a small map of the carpet's radiance around the table
 *     (the room's baked floor irradiance times the carpet's albedo, built on the CPU by hallFloorField below; the one
 *     sampler this part adds to a black body, in place of the wood scan, which a black body does not show), looked up
 *     where the mirror ray meets the floor plane: a planar proxy, no scene render. A ray that reaches the ring of boards
 *     above the floor takes the cube toward that point of the board; a ray that rises takes the cube as before, unless
 *     it ends on the underside of the table's own top. No occlusion factor is laid over a mirror ray: what it meets is
 *     what it shows (the table's shadow on the carpet is in the map);
 *   - the carpet's light coming back up is read from the same map (a wide footprint), per fragment, in place of the
 *     face mean the room's light volume holds (0.8 m cells): `bounceShare` of a face's light in the volume is that
 *     bounce and is taken out of it (hallBounceShare below), so the floor is not counted twice;
 *   - the heads' hard light keeps round A2's form (the overhang's shadow by the heads' elevation);
 *   - `under` 0: under a coat the body has no air interface, and the coat's own cube term is the environment's
 *     reflection; the app's specular fill under it was a second, flat copy of it.
 * THE FINISH (`black`): a black lacquer whose DIFFUSE reflectance is the albedo table's 0.04 (CONTRACT 15.2: `matte`
 * plus the app's own body colour under the coat, 0.004 x `depth`), under a gloss coat of F0 0.04 (an index of 1.5: a
 * polyester or polyurethane lacquer) with a narrow lobe of roughness 0.07 (the rail cap's class: the carpet's pool and
 * the table's shadow are an image with soft edges) and a haze of 0.38 at 14 %.
 * WHAT THAT GIVES, by arithmetic (carpet radiance L; the tone curve is near linear there: level = 800 x radiance up to
 * 0.06): the coat returns F(angle) x L: 4.3 % seen at 45 degrees, 10.6 % at 65 degrees (the long apron from the wide
 * eye-height view), 26 % at 75 degrees (the long apron from the BACK pose); the diffuse body returns 0.04 / pi of the
 * heads' light on it, about 0.013 x E. With L = 0.11 and E = 1.3 units a lit apron reads 0.017 + 0.012 = 0.029 (level
 * 25) at 65 degrees and 0.046 (level 39) at 75 degrees; in an overhang's shadow the diffuse part falls to the bounce
 * (0.002) and the mirror is all there is. A black body is a quarter to a half of the carpet's level at best: that is
 * the material, not a defect. No reachable camera (it is always above the body) sees a lit strip of the boards in a
 * vertical face: such a ray would have to rise, and a mirror ray from a wall falls as steeply as the view ray does.
 */
// (round A4: the default is the THIRD model, HALL_OWN below: the body by its own material, CONTRACT.md 16.3; this
// second model stays in the tree behind `?clubwood=hall2`, round A2's behind `?clubwood=hallA2`)
export const HALL_MODEL = 3;
export const HALL_BODY2 = Object.freeze({
  foot: 0.6, footHeight: 0.05, tan: HALL_BODY.tan, under: 0,
  black: Object.freeze({ coatRoughness: 0.07, haze: Object.freeze([0.38, 0.14, 0.0, 0.3]), albedo: 0.04, depth: 1.4, appAlbedo: 0.004 }),
  // the floor map: texels per side (128 = 9 cm on the island; 64 on the lite tier and for an analytic room, whose light
  // has nothing finer), the largest half extents it may cover (m), the albedo of the carpet beyond the boards against the
  // island's (CONTRACT 15.2: 0.10 / 0.13), and the analytic stand-in for the table's shadow on a floor the room answers
  // without one (level under the table, and the band of |station| / half extent over which it comes back)
  floor: Object.freeze({ size: 128, sizeLite: 64, maxHalf: Object.freeze([6.5, 5.5]), outer: 0.77, shade: Object.freeze([0.3, 0.7, 1.6]) }),
});

/**
 * Round A3, the arena venue only: a rail cap's scan is uploaded as a STRIP there even when its row of SCANS says whole
 * (`strip` 0: `wood_dark.color`, which the club room's furniture shares). Nothing else in the hall binds that scan, and a
 * rail cap reads a band 0.21 m wide of a repeat that is 1.2 m across the grain on a black rail (scale 0.6): one quarter
 * of the image holds the band (0.30 m, the width of the veneer's strip). On the base tier that is 1.40 MiB of colour
 * instead of 5.59 and 0.35 of relief instead of 1.40 (the texture ledger of the round's report); on the high tier 5.6
 * instead of 22.4. A body that still asks for the whole scan (a wood table's, a tool arm's) gets its own upload.
 */
export const HALL_RAIL_STRIP = 4;

/** The matte pedestal that puts a black hall body's diffuse reflectance on the albedo table's value. Pure. */
export function hallMatte(b = HALL_BODY2.black) { return Math.max(0, b.albedo - b.appAlbedo * b.depth); }

/** A body finish as the second hall model shows it (see HALL_BODY2). Pure; returns a new object. */
export function hallBodyParams2(p, finish) {
  if (finish !== 'black-stain' && finish !== 'black-laminate') return { ...p };
  const b = HALL_BODY2.black;
  return { ...p, coat: [p.coat[0], b.coatRoughness, 0, p.coat[3]], haze: b.haze.slice(), matte: hallMatte(b), depth: b.depth, contrast: 0, relief: 0 };
}

/**
 * The rectangle of floor the body's lacquer can see, about the table: the island inside the ring of boards when the room
 * publishes a layout with one (`layout.island`: x0, x1, z0, z1; `layout.boards.height` above the floor), else the room's
 * box, never more than HALL_BODY2.floor.maxHalf from the table's centre. Returns { centre: [x, z], half: [hx, hz],
 * boardTop: world y of the boards' top | null, from }. Pure.
 */
export function hallFloorRect({ layout = null, box = null, centre = [0, 0], floorY = 0 } = {}) {
  const [mx, mz] = HALL_BODY2.floor.maxHalf;
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const isl = layout?.island;
  if (isl && [isl.x0, isl.x1, isl.z0, isl.z1].every(num) && isl.x1 - isl.x0 > 1 && isl.z1 - isl.z0 > 1 && centre[0] > isl.x0 + 0.5 && centre[0] < isl.x1 - 0.5 && centre[1] > isl.z0 + 0.5 && centre[1] < isl.z1 - 0.5) {
    const h = layout?.boards?.height;
    const fits = isl.x1 - isl.x0 <= 2 * mx + 1e-6 && isl.z1 - isl.z0 <= 2 * mz + 1e-6;
    if (fits) return { centre: [(isl.x0 + isl.x1) / 2, (isl.z0 + isl.z1) / 2], half: [(isl.x1 - isl.x0) / 2, (isl.z1 - isl.z0) / 2], boardTop: num(h) && h > 0 ? floorY + h : null, from: 'the room layout\'s island' };
  }
  let hx = mx, hz = mz, from = 'the default extent';
  if (box?.min && box?.max && [box.min.x, box.max.x, box.min.z, box.max.z].every(num)) {
    hx = Math.min(mx, Math.max(0.5, Math.min(centre[0] - box.min.x, box.max.x - centre[0])));
    hz = Math.min(mz, Math.max(0.5, Math.min(centre[1] - box.min.z, box.max.z - centre[1])));
    from = 'the room box';
  }
  return { centre: [centre[0], centre[1]], half: [hx, hz], boardTop: null, from };
}

/** JS mirror of the analytic table shadow (HALL_BODY2.floor.shade): the share of the floor's light left at q = [x, z]. */
export function hallTableShade(q, table) {
  const [lo, a, b] = HALL_BODY2.floor.shade;
  const s = Math.max(Math.abs(q[0] - table.centre[0]) / table.outer[0], Math.abs(q[1] - table.centre[1]) / table.outer[1]);
  return lo + (1 - lo) * smooth01(a, b, s);
}

/**
 * The floor's radiance field for the body's lacquer: `size` x `size` texels over `rect` (hallFloorRect), texel (i, j) at
 * x = centre x - half x + (i + 0.5) / size * 2 half x, z likewise with j; row j = 0 first. `sample(x, z)` answers the
 * room's irradiance on the floor there ([r, g, b] or null where it has none: such a texel takes the nearest answered
 * one of its row, then of the map); radiance = albedo x irradiance / pi (x `shade(x, z)` when given: the stand-in for a
 * table shadow the answer does not hold). Coded as sqrt(radiance / scale) in 8 bits (the dark under the table keeps its
 * steps), alpha 255. Returns { data: Uint8Array, size, scale, max, mean: [r, g, b], holes }. Pure.
 */
export function hallFloorField({ rect, size, sample, albedo, shade = null }) {
  const n = Math.max(2, Math.round(size));
  const rad = new Float32Array(n * n * 3);
  const have = new Uint8Array(n * n);
  let max = 0, holes = 0;
  for (let j = 0; j < n; j++) {
    const z = rect.centre[1] - rect.half[1] + (j + 0.5) / n * 2 * rect.half[1];
    for (let i = 0; i < n; i++) {
      const x = rect.centre[0] - rect.half[0] + (i + 0.5) / n * 2 * rect.half[0];
      let e = null;
      try { e = sample(x, z); } catch { e = null; }
      if (!(Array.isArray(e) && e.length >= 3 && Number.isFinite(e[0]) && Number.isFinite(e[1]) && Number.isFinite(e[2]))) { holes += 1; continue; }
      const k = (typeof shade === 'function' ? shade(x, z) : 1) / Math.PI;
      const o = 3 * (j * n + i);
      for (let c = 0; c < 3; c++) { rad[o + c] = Math.max(0, e[c]) * albedo[c] * k; if (rad[o + c] > max) max = rad[o + c]; }
      have[j * n + i] = 1;
    }
  }
  // holes: the nearest answered texel of the row, else the row above (a floor chart that ends inside the rectangle)
  if (holes > 0 && holes < n * n) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (have[j * n + i]) continue;
      let src = -1;
      for (let d = 1; d < n && src < 0; d++) {
        if (i - d >= 0 && have[j * n + i - d]) src = j * n + i - d;
        else if (i + d < n && have[j * n + i + d]) src = j * n + i + d;
        else if (j - d >= 0 && have[(j - d) * n + i]) src = (j - d) * n + i;
        else if (j + d < n && have[(j + d) * n + i]) src = (j + d) * n + i;
      }
      if (src >= 0) for (let c = 0; c < 3; c++) rad[3 * (j * n + i) + c] = rad[3 * src + c];
    }
  }
  const scale = max > 1e-9 ? max : 1;
  const data = new Uint8Array(n * n * 4);
  const mean = [0, 0, 0];
  for (let t = 0; t < n * n; t++) {
    for (let c = 0; c < 3; c++) { const v = rad[3 * t + c]; mean[c] += v; data[4 * t + c] = Math.min(255, Math.round(255 * Math.sqrt(v / scale))); }
    data[4 * t + 3] = 255;
  }
  return { data, size: n, scale, max, mean: mean.map((v) => v / (n * n)), holes };
}

/** JS mirror of the map's lookup (glsl.js clubWoodHallFloor, level 0): radiance at world (x, z), bilinear on the coded values. */
export function hallFloorAt(field, rect, x, z) {
  const n = field.size;
  const u = Math.min(1, Math.max(0, (x - rect.centre[0]) / rect.half[0] * 0.5 + 0.5)) * n - 0.5;
  const v = Math.min(1, Math.max(0, (z - rect.centre[1]) / rect.half[1] * 0.5 + 0.5)) * n - 0.5;
  const i0 = Math.min(n - 1, Math.max(0, Math.floor(u))), j0 = Math.min(n - 1, Math.max(0, Math.floor(v)));
  const i1 = Math.min(n - 1, i0 + 1), j1 = Math.min(n - 1, j0 + 1);
  const fu = Math.min(1, Math.max(0, u - i0)), fv = Math.min(1, Math.max(0, v - j0));
  const out = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const at = (i, j) => field.data[4 * (j * n + i) + c] / 255;
    const s = (at(i0, j0) * (1 - fu) + at(i1, j0) * fu) * (1 - fv) + (at(i0, j1) * (1 - fu) + at(i1, j1) * fu) * fv;
    out[c] = s * s * field.scale;
  }
  return out;
}

/**
 * The share of a side face's light, as the room's light volume answers it, that is the carpet's bounce: the floor beside
 * each side is a half-space of radiance albedo x E / pi under the face (form factor one half), of which `seen` reaches
 * the face (the strip next to the table lies in its shadow). `faces`, `floor`: bodyLight()'s; `albedo`: the carpet's.
 * Bounded to 0 .. 0.8; 0 without light on the sides. Pure.
 */
export function hallBounceShare(faces, floor, albedo, seen = 0.8) {
  let sum = 0, k = 0;
  const sides = [0, 1, 4, 5];
  for (let i = 0; i < 4; i++) {
    const e = luma(faces?.[sides[i]] ?? [0, 0, 0]);
    const f = floor?.[i] ?? [0, 0, 0];
    const b = 0.5 * seen * luma([f[0] * albedo[0], f[1] * albedo[1], f[2] * albedo[2]]);
    if (e > 1e-6 && Number.isFinite(b)) { sum += Math.min(0.8, Math.max(0, b / e)); k += 1; }
  }
  return k ? sum / k : 0;
}

/**
 * JS mirror of where a mirror ray of the body ends (glsl.js clubWoodHallRad): from the world point P along the unit
 * direction d, with the floor at `floorY` and the floor rectangle `rect` (hallFloorRect). Returns
 * { kind: 'floor', at: [x, z], t } (the carpet inside the rectangle, or beyond it when there are no boards),
 * { kind: 'board', y, t } (the ring of boards, below their top), or { kind: 'hall' } (it rises, or passes over the boards).
 */
export function hallMirrorEnd(P, d, { floorY, rect }) {
  if (!(d[1] < -1e-3) || !(P[1] > floorY)) return { kind: 'hall' };
  const tf = (floorY - P[1]) / d[1];
  if (rect.boardTop !== null && rect.boardTop !== undefined) {
    let tb = Infinity;
    for (const [a, c] of [[0, 0], [2, 1]]) {
      if (Math.abs(d[a]) < 1e-6) continue;
      const t = ((d[a] > 0 ? rect.half[c] : -rect.half[c]) - (P[a] - rect.centre[c])) / d[a];
      if (t > 0 && t < tb) tb = t;
    }
    if (tb < tf) { const y = P[1] + d[1] * tb; return y < rect.boardTop ? { kind: 'board', y, t: tb } : { kind: 'hall' }; }
  }
  return { kind: 'floor', at: [P[0] + d[0] * tf, P[2] + d[2] * tf], t: tf };
}

/** Schlick's Fresnel reflectance of a dielectric coat at the cosine `c` of the angle of incidence. */
export function coatFresnel(c, f0 = 0.04) { return f0 + (1 - f0) * (1 - Math.min(1, Math.max(0, c))) ** 5; }

/**
 * Round A3: the tangent of the main light's elevation PER SIDE of the table (+x, -x, +z, -z), by hallTan's rule on each
 * side alone: the room's light on the floor beside that side over its light on that side's face. A hall lights the
 * sides of a table unevenly on purpose (low key lights toward the long sides under steep heads): one mean tangent
 * gave every face the heads' long overhang shadow, also the faces a key reaches almost level. Bounded to
 * HALL_BODY2.tan; a side without light takes the upper bound. Pure.
 */
export function hallTans(faces, floor) {
  const [lo, hi] = HALL_BODY2.tan;
  return [0, 1, 4, 5].map((fi, i) => {
    const side = luma(faces?.[fi] ?? [0, 0, 0]), fl = luma(floor?.[i] ?? [0, 0, 0]);
    if (!(side > 1e-6) || !Number.isFinite(fl)) return hi;
    return Math.min(hi, Math.max(lo, fl / side));
  });
}

/**
 * Round A3: TWO lights per side of the table. A hall lights a table with steep heads over its rim AND with low key
 * lights from far trusses; under an overhang the two cast shadows of very different reach (overhang x tangent of the
 * elevation), and one effective tangent (hallTans) puts the keys' light in the heads' long shadow: the legs and the
 * cabinet, 13 to 17 cm inside the outline, came out unlit on the long sides, where a key at 30 degrees reaches all but
 * the top 8 cm of them. The room tells the two apart by itself: its ANALYTIC answer holds the run-time emitters (the
 * heads, the strips, the ambient), its BAKED answer holds those and the bake-only lights (the keys) and the bounce.
 * Per side (+x, -x, +z, -z), from bodyLight() of both answers (`baked`, `analytic`: { faces, floor }; `share`: the bounce
 * share of the baked face light, hallBounceShare):
 *   steep     tangent of the run-time lights: analytic floor over analytic face (bounded to HALL_BODY2.tan)
 *   low       tangent of what only the bake holds, ONE value for the sides that have such light: the largest
 *             (baked - analytic) floor light of the four stations over the SUM of the sides' (baked without bounce -
 *             analytic) face light, bounded to 0.3 .. the side's steep tangent. Why pooled: a key lights ONE side's face
 *             but the floor beside EVERY side, so a side's own floor over its own face counts the other keys' floor
 *             light as its own (four keys at 25 degrees read as 52 degrees on the long sides, and the whole apron stood
 *             in the overhang's shadow: found by an albedo pair, job `al`: the long apron took 0.24 units where the room
 *             holds 1.24). Pooled, keys of one elevation give its tangent when a station sees them all and less when
 *             the table hides one from it (never more: the shadow band under the rail comes out a little short, not long).
 *   lowShare  that light's share of the face's direct light, 0 .. 0.95
 * Without a baked answer (or when the bake adds nothing to a face): lowShare 0, low = steep, steep = hallTans' value.
 * Pure.
 */
export function hallSides({ baked = null, analytic = null, share = 0 } = {}) {
  const [lo, hi] = HALL_BODY2.tan;
  const one = baked ?? analytic;
  const steep0 = hallTans(one?.faces, one?.floor);
  const out = { steep: steep0.slice(), low: steep0.slice(), lowShare: [0, 0, 0, 0] };
  if (!baked || !analytic) return out;
  const sides = [0, 1, 4, 5];
  const lit = [];
  let faceSum = 0, floorMax = 0;
  for (let i = 0; i < 4; i++) {
    const fb = luma(baked.faces?.[sides[i]] ?? [0, 0, 0]) * (1 - Math.min(0.8, Math.max(0, share))), fa = luma(analytic.faces?.[sides[i]] ?? [0, 0, 0]);
    const gb = luma(baked.floor?.[i] ?? [0, 0, 0]), ga = luma(analytic.floor?.[i] ?? [0, 0, 0]);
    if (!(fb > 1e-6) || !(fa >= 0) || !Number.isFinite(gb) || !Number.isFinite(ga)) continue;
    const steep = fa > 1e-6 ? Math.min(hi, Math.max(lo, ga / fa)) : hi;
    const extra = fb - fa;
    floorMax = Math.max(floorMax, gb - ga);   // (every station counts: a side without a key still has the keys' light on its floor)
    if (!(extra > 0.05 * fb)) { out.steep[i] = Math.min(hi, Math.max(lo, gb / Math.max(fb, 1e-6))); out.low[i] = out.steep[i]; continue; }
    out.steep[i] = steep;
    out.lowShare[i] = Math.min(0.95, extra / fb);
    lit.push(i); faceSum += extra;
  }
  for (const i of lit) out.low[i] = Math.min(out.steep[i], Math.max(0.3, floorMax / faceSum));
  return out;
}

/**
 * Round A4 (CONTRACT.md 16.3): the table body in the hall BY ITS OWN MATERIAL (the third hall model; read only under
 * the arena venue). Round A3 gave every body part one black lacquer of albedo 0.04 (a row of the albedo table that was
 * withdrawn). Here a part keeps what the app's material gives it and the hall only lights it:
 *   - its colour and its own map stay (depth 1, no scan in their place);
 *   - its own roughness is the ONE lobe it has (a rubbed stain or a satin board has no gloss film over it): F0 0.04;
 *   - its own environment gain (`ownEnvGain`: the number the app solved on screen for this material) scales what that
 *     lobe returns of the hall around it;
 *   - THE MATT PEDESTAL IS THE FINISH TABLE'S, the one this look gives the same material in the club room
 *     (finishParams(...).matte: 0.045 for a black body, 0.03 for a wood one; see "THE MATTE PEDESTAL" above: the app's
 *     black body colour reflects 0.2 to 0.3 %, which no stain or laminate does, and the app carries the cabinet's level
 *     in its environment term instead). The venue changes the light, not the material: the pedestal is neither a new
 *     number nor one per venue, and it follows the app's own map (the oak's figure), by `pedestalFigure`.
 *     `bare` (the tool arm `?clubwood=ownbare`) = no pedestal: the app's colour alone as the albedo.
 * WHAT THE APP'S MATERIALS ARE (read in the app, round A4 job `tp`; the default table's cabinet is black-stained oak,
 * table.js styleMaterials): apron band and cabinet #151517 x its oak map (mean 0.43) = 0.0033 at roughness 0.58; legs
 * #0f0f11 x the same map = 0.0023 at roughness 0.70; both with a live environment gain of 2.2. In the tournament look
 * they stand at 25 to 47 of 255 beside a floor at 11 to 21, by that environment term alone (it reads the probe's image
 * under its own horizon, which is the table's lit bed); the app's own anchor for them is a product photograph: the
 * apron at 0.082 of the lit cloth's display value.
 * What the lobe is lit by (wood/glsl.js WOOD_FN_OWN, COAT_BODY_HALL3):
 *   - the hall around the table, as two samples: a lobe this wide holds the carpet AND the hall above it. One sample is
 *     bent below the horizon (round A3's planar proxy: the carpet as the room holds it, or the boards), one above it
 *     (the scene's cube, never lower than `upMin` of the lobe's half width over the horizon: the cube is taken from a
 *     point on the table and holds the lit bed below its own horizon, which no outer face of the body can see);
 *   - the hall's own lights (the heads, the keys, the house light) as two directions per side of the table (round A3's
 *     `hallSides`: a steep one and a low one, each with the overhang's shadow), through the same lobe in closed form;
 *   - no lamp term: the table's lamp is behind every outward face of the body and above the table's top for every
 *     other one.
 * The app's own specular terms on the body are left out (`under` 0): its environment term reads the probe's image
 * below the horizon, which is the table's own lit bed (table.js says so where it sets the gain), and its three lights
 * give the body 0 to 1 level of 255 (measured in the app, round A4 job `ab`).
 *   spread     half width of the lobe as an angle (radians) per unit of alpha (roughness squared): the half width at
 *              half height of a GGX lobe's reflection is 2 atan(0.64 alpha), about 1.25 alpha
 *   sample     where the two samples sit: this share of the half width below / above the horizon (or at the lobe's
 *              centre when that is further out)
 *   upRough    the largest roughness the upper sample asks the cube for (0.4: a blur of 12 degrees; the material's
 *              own 0.58 to 0.70 would be 22 to 30 and reach under the cube's horizon)
 *   direct     factor on the hall's lights through the lobe (1 = the lobe's own reflectance; the app's gain is an
 *              environment number and is not laid on them)
 *   figure     how much less the lobe returns where the app's own map is dark (an open pore scatters)
 *   pedestalFigure   how far the matt pedestal follows the app's own map (0 = flat, 1 = the map's whole figure)
 *   foot, footHeight   the contact at the carpet, as round A3's
 */
export const HALL_OWN = Object.freeze({
  foot: 0.6, footHeight: 0.05, under: 0, spread: 1.25, sample: 0.8, upRough: 0.4, direct: 1, figure: 0.4, pedestalFigure: 0.5,
  roughness: Object.freeze([0.045, 1]), gain: Object.freeze([0.25, 4]),
});

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * The environment gain the app gave a material: its `spikeEnvGain` holder (table.js wires one where the gain is live),
 * else its own `envMapIntensity` when it carries its own cube, else 1 (a material lit by the scene's cube renders at
 * the scene's intensity whatever it says: table.js "dead knob"). Bounded to HALL_OWN.gain. Pure (reads plain fields).
 */
export function ownEnvGain(m) {
  const [lo, hi] = HALL_OWN.gain;
  const g = m?.userData?.spikeEnvGain?.value;
  if (typeof g === 'number' && Number.isFinite(g)) return clamp(g, lo, hi);
  if (m?.envMap && typeof m.envMapIntensity === 'number' && Number.isFinite(m.envMapIntensity)) return clamp(m.envMapIntensity, lo, hi);
  return 1;
}

/**
 * A body finish (finishParams of 'body' or 'leg') as the third hall model shows it: the material's own roughness as its
 * one lobe, the finish table's own matt pedestal (`bare`: none), the app's colour as it is. `pore` carries two numbers
 * of this model in slots its shader text does not use otherwise: [2] how far the pedestal follows the app's map, [3]
 * how much less the lobe returns where that map is dark. Pure; a new object.
 */
export function hallOwnParams(p, { roughness = 0.6, bare = false } = {}) {
  const r = clamp(typeof roughness === 'number' && Number.isFinite(roughness) ? roughness : 0.6, HALL_OWN.roughness[0], HALL_OWN.roughness[1]);
  return { ...p, coat: [1.0, r, 0.0, 0.12], haze: [0.4, 0.0, 0.0, 0.0], brush: [0.0, 0.12, 0.5], pore: [0.0, 0.0, HALL_OWN.pedestalFigure, HALL_OWN.figure], contrast: 0, chroma: 0, relief: 0, depth: 1, matte: bare ? 0 : p.matte };
}

/**
 * JS mirror of glsl.js clubWoodOwnLobe: the GGX lobe of a rough dielectric (F0 0.04) for one light direction, as
 * radiance per unit of irradiance ON THE FACE (D x visibility x Fresnel: the cosine is in the irradiance). Unit vectors.
 */
export function ownLobe(N, V, L, a) {
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  const nl = dot(N, L), nv = Math.max(dot(N, V), 1e-3);
  if (!(nl > 0)) return 0;
  const hv = [V[0] + L[0], V[1] + L[1], V[2] + L[2]], hl = Math.hypot(hv[0], hv[1], hv[2]) || 1;
  const H = hv.map((x) => x / hl);
  const nh = clamp(dot(N, H), 0, 1), vh = clamp(dot(V, H), 0, 1), a2 = a * a;
  const d = nh * nh * (a2 - 1) + 1;
  const D = a2 / (Math.PI * d * d);
  const vis = 0.5 / (nl * Math.sqrt(nv * nv * (1 - a2) + a2) + nv * Math.sqrt(nl * nl * (1 - a2) + a2));
  return D * vis * (0.04 + 0.96 * (1 - vh) ** 5);
}

/**
 * JS mirror of glsl.js clubWoodOwnRad's split: for a lobe about a direction whose height is `dy` (unit vector's y) at
 * roughness `rough`: the share of it below the horizon and the elevations (radians) of its two samples.
 */
export function ownLobeSplit(dy, rough, spread = HALL_OWN.spread, sample = HALL_OWN.sample) {
  const s = Math.max(spread * rough * rough, 0.02), el = Math.asin(clamp(dy, -1, 1));
  const t = clamp((-el + s) / (2 * s), 0, 1);
  return { down: t * t * (3 - 2 * t), elDown: clamp(Math.min(el, -sample * s), -1.5, -0.05), elUp: Math.min(Math.max(el, sample * s), 1.5), half: s };
}

/**
 * JS mirror of glsl.js COAT_BODY_HALL3's shade of the table's own overhangs for ONE light of elevation tangent `tan`:
 * the lit share (0..1) of a point of the body that stands `inset` m inside the table's outline, `depthRail` m under
 * the rail's underside and `depthSkirt` m under the skirt's lower edge (negative on the skirt itself), when the skirt's
 * own foot stands `skirtInset` m inside the outline. Two edges can hide the light: the rail's (reach = inset x tan) for
 * every point, and the skirt's lower edge (reach = (inset - skirtInset) x tan) for what hangs below it. The penumbra
 * runs from 0.6 to 1.5 of the reach (the lights along a side stand at different elevations), as in round A3.
 * WHY (round A4, found by an albedo pair in the app, job `o2`): round A3 told "the skirt itself" from "what stands
 * behind the skirt" by the inset alone (under 1 cm / over 3 cm). The default table's skirt is a slanted blind: 7 mm
 * inside the outline at its top, several centimetres at its foot. Most of it counted as standing behind itself and took
 * no direct light at all: 0.2 units of the 1.245 the room gives that face. Here a point is below the skirt when it IS
 * below the skirt's lower edge.
 */
export function ownShade({ inset, skirtInset = 0, depthRail, depthSkirt, tan }) {
  const lit = (i, d) => smooth01(0.6 * i * tan, 1.5 * i * tan + 0.01, d + 0.004);
  const rail = lit(Math.max(inset, 0), Math.max(depthRail, 0));
  return depthSkirt >= 0 ? rail * lit(Math.max(inset - skirtInset, 0), depthSkirt) : rail;
}

/**
 * How far the foot of the skirt stands inside the table's outline (m): from the skirt piece's vertices (`points`: an
 * iterable of world [x, y, z]) those within `band` m of its lowest one, the one that reaches furthest out. `outline`:
 * { centre: [x, z], outer: [half x, half z] }. Bounded to 0 .. 0.2; 0 without points. Pure.
 */
export function skirtFootInset(points, outline, band = 0.012) {
  let minY = Infinity;
  const list = [];
  for (const p of points ?? []) { if (Number.isFinite(p?.[1])) { list.push(p); if (p[1] < minY) minY = p[1]; } }
  let out = -Infinity;
  for (const p of list) {
    if (p[1] > minY + band) continue;
    const sd = Math.max(Math.abs(p[0] - outline.centre[0]) - outline.outer[0], Math.abs(p[2] - outline.centre[1]) - outline.outer[1]);
    if (sd > out) out = sd;
  }
  return Number.isFinite(out) ? clamp(-out, 0, 0.2) : 0;
}

/** JS mirror of three's EnvironmentBRDF for F0 0.04, F90 1 (the DFG fit): what a lobe of roughness `rough` returns of a uniform environment at the cosine `nv`. */
export function ownEnvBrdf(nv, rough) {
  const r = [1 - rough, 0.0425 - 0.0275 * rough, 1.04 - 0.572 * rough, -0.04 + 0.022 * rough];
  const a004 = Math.min(r[0] * r[0], 2 ** (-9.28 * nv)) * r[0] + r[1];
  return 0.04 * (-1.04 * a004 + r[2]) + (1.04 * a004 + r[3]);
}

/** The GGX normal distribution at a half vector `theta` (radians) off the normal, for alpha = roughness squared. */
export function ggxD(alpha, theta) {
  const a2 = alpha * alpha, c = Math.cos(theta), t2 = Math.tan(theta) ** 2;
  return a2 / (Math.PI * c ** 4 * (a2 + t2) ** 2);
}

// ---- round A6: the hall's key lights on the table's body, each with its own direction (the arena venue only) ----------------
/**
 * Round A6 (CONTRACT.md 18.1: the long apron's lit face, the near legs' lit faces). Through round A5 the body took ONE
 * irradiance per SIDE of the table (bodyLight: six stations on the outline, read in the room's light volume, whose cells
 * are 0.8 m wide), split into a steep and a low part by the room's baked answer against its analytic one (hallSides).
 * Every face of every leg took its side's number: no leg knew where a key stands, and a key's elevation reached the
 * body only through that split. With this switch the hall's KEY LIGHTS are read as what they are: the records the room
 * hands the bake (`club.room.bakeEmitters`, ids that start with `prefix`: a position, an axis, a cone, candela, a
 * source size), evaluated per fragment by the room light's own law (hallKeyLight is that law on the CPU; wood/glsl.js
 * WOOD_FN_KEY in the shader), each with the shadow of the table's own overhangs along ITS direction (hallKeyShade) and
 * through the material's own lobe. What the side's number still carries is the rest: the keys' share of it at the same
 * stations is taken out (hallKeyShares), so nothing is lit twice.
 *   on           the switch (false: the body is round A5's, text and uniforms)
 *   max          keys passed to the shader (the strongest first)
 *   minSteep     the least share of a side's direct light that stays with the side's own number
 *   edge         half width (m) of a key's shadow edge on the body at the casting edge itself; plus the key's source
 *                size over its distance per metre of path under the overhang (the room's record gives both)
 *   foot, footHeight   the contact at the carpet under this model: the body's lowest `footHeight` metres fall to `foot`
 *                of their light (the leveller's gap and the sole's own shadow: a line, not a gradient; rounds A3 to A5
 *                had 0.6 over 0.05 m)
 * Measured at V10 on the high tier under the HALF-WAY bake of 2026-11-15 13:48Z (job k4; on | off in one boot): the long
 * apron's face 35.2 | 35.4 (the same light, counted once); down the near leg's -x face 17, 30, 36, 34 | 30, 31, 30, 31
 * (its head stands in the skirt's shadow); the leg furthest along the long side 18.6 | 11.4.
 */
export const HALL_KEYS = Object.freeze({ on: true, max: 4, prefix: 'key.', minSteep: 0.05, edge: 0.006, foot: 0.3, footHeight: 0.025 });
/** The room light's cone profile (room/light.js CONE.beam; the node arm pins the two). */
export const KEY_CONE_BEAM = 0.64;
/** The soft edge of a key's shutter, in the sine of the angle off the blade's plane (the bake's SHUTTER_SOFT, web/tools/club/bake-room-core.mjs; the node arm pins the two). */
export const KEY_SHUTTER_SOFT = 0.0105;
/** ... and of its second blade, the one out of focus at the table's foot (the bake's SHUTTER_SOFT_FOOT; pinned likewise). */
export const KEY_FOOT_SOFT = 0.08;
/** ... and of its two side blades, the vertical planes past the two legs of the side it faces (the bake's SHUTTER_SOFT_SIDE; pinned likewise). */
export const KEY_SIDE_SOFT = 0.02;

/**
 * The key lights among a list of room-light emitter records (`club.room.bakeEmitters`): point emitters whose id starts
 * with `prefix`, without a `normal` (a one-sided emitter is another law: listed in `skipped`), as plain numbers in the
 * packing the room light itself uses: P = position (lifted by `lift`: the hall's seat) and reach; C = colour x candela
 * and the square of the source size; A = unit axis and the cone (2 + cos(field half angle), 4 + cos for a bell; a beam
 * share 0..1 for a shaded lamp; 0 without an axis). The strongest `max` are kept. Pure; reads plain fields only.
 * Returns { keys: [{ id, P, C, A, source }], skipped: [id] }.
 */
export function hallKeyRecords(list, { lift = 0, max = HALL_KEYS.max, prefix = HALL_KEYS.prefix } = {}) {
  const keys = [], skipped = [];
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const e of Array.isArray(list) ? list : []) {
    if (typeof e?.id !== 'string' || !e.id.startsWith(prefix)) continue;
    const p = e.position, c = e.color, a = e.axis, k = Number(e.intensity);
    if ((e.type && e.type !== 'point') || e.normal || !num(p?.x) || !num(p?.y) || !num(p?.z) || !(k > 0) || !(e.radius > 0) || !num(c?.r) || !num(c?.g) || !num(c?.b)) { skipped.push(e.id); continue; }
    const al = num(a?.x) && num(a?.y) && num(a?.z) ? Math.hypot(a.x, a.y, a.z) : 0;
    const A = al > 1e-6 ? [a.x / al, a.y / al, a.z / al] : [0, 1, 0];
    const sz = Array.isArray(e.size) ? e.size : [0, 0];
    const cone = al > 1e-6 ? (num(e.cone) && e.cone > 0 && e.cone < 90 ? (e.bell === true ? 4 : 2) + Math.cos((e.cone * Math.PI) / 180) : clamp(Number(sz[1]) || 0.6, 0, 1)) : 0;
    const src = Number(sz[0]) || 0.05;
    // (a shutter: the unit normal of a plane through the emitter; the light reaches the side it points to. The table keys of
    // round A6 carry one each: the blade that keeps a key off the bed also ends its light on the carpet under the table
    // and on the legs of the far side.)
    // (`foot`: a second blade of the same form, out of focus: the one that ends a key's light on the carpet in front of the
    // table; it takes a little off the lowest part of a near leg too)
    const blade = (v) => { const ok = Array.isArray(v) && v.length === 3 && v.every(num); const l = ok ? Math.hypot(v[0], v[1], v[2]) : 0; return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l, 1] : [0, 0, 0, 0]; };
    keys.push({ id: e.id, P: [p.x, p.y + lift, p.z, e.radius], C: [c.r * k, c.g * k, c.b * k, src * src], A: [A[0], A[1], A[2], cone], S: blade(e.shutter), F: blade(e.foot), D: [blade(e.sides?.[0]), blade(e.sides?.[1])], source: src });
  }
  const power = (r) => 0.2126 * r.C[0] + 0.7152 * r.C[1] + 0.0722 * r.C[2];
  keys.sort((x, y) => power(y) - power(x) || (x.id < y.id ? -1 : 1));
  return { keys: keys.slice(0, Math.max(0, max)), skipped };
}

/**
 * One key's light on a Lambert receiver at the world point `p` with the unit normal `n`, by the room light's law for a
 * point emitter (room/light.js emitterLaw: the reach window, the cone or the shaded lamp's lobe, the source size in the
 * near field), WITHOUT occlusion. Returns { E: [r, g, b] irradiance, L: unit direction to the key }. JS mirror of
 * wood/glsl.js clubWoodKeyE.
 */
export function hallKeyLight(k, p, n) {
  const l = [k.P[0] - p[0], k.P[1] - p[1], k.P[2] - p[2]];
  const d2 = l[0] * l[0] + l[1] * l[1] + l[2] * l[2], il = 1 / Math.sqrt(Math.max(d2, 1e-8));
  const L = [l[0] * il, l[1] * il, l[2] * il];
  let w = d2 / (k.P[3] * k.P[3]);
  if (w >= 1) return { E: [0, 0, 0], L };
  w = 1 - w * w; w *= w;
  const ca = -(L[0] * k.A[0] + L[1] * k.A[1] + L[2] * k.A[2]);
  let emit = 1;
  if (k.A[3] > 1.5) {
    const c = k.A[3] > 3.5 ? k.A[3] - 4 : k.A[3] - 2;
    emit = smooth01(c, c + (1 - c) * (k.A[3] > 3.5 ? 1 : KEY_CONE_BEAM), ca);
  } else if (k.A[3] > 0) emit = (1 - k.A[3]) + k.A[3] * 2.4 * ca * ca * (ca > 0 ? 1 : 0.55);
  if (k.S?.[3] > 0.5) emit *= smooth01(-KEY_SHUTTER_SOFT, KEY_SHUTTER_SOFT, -(L[0] * k.S[0] + L[1] * k.S[1] + L[2] * k.S[2]));
  if (k.F?.[3] > 0.5) emit *= smooth01(-KEY_FOOT_SOFT, KEY_FOOT_SOFT, -(L[0] * k.F[0] + L[1] * k.F[1] + L[2] * k.F[2]));
  for (const d of k.D ?? []) if (d?.[3] > 0.5) emit *= smooth01(-KEY_SIDE_SOFT, KEY_SIDE_SOFT, -(L[0] * d[0] + L[1] * d[1] + L[2] * d[2]));
  const f = (emit * w * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2])) / (d2 + k.C[3]);
  return { E: [k.C[0] * f, k.C[1] * f, k.C[2] * f], L };
}

/**
 * The share (0..1) of a key's light that reaches the body point `P` along the unit direction `L` to the key, past the
 * table's own overhangs. The ray leaves the table's outline somewhere (the rectangle `outer` about `centre`; for a point
 * that hangs BELOW the skirt's lower edge `skirtY`: the rectangle of the skirt's foot, `skirtInset` inside the outline);
 * it is lit when it passes under the edge that hangs there (the rail's underside `railY`, or the skirt's foot). The same
 * test hides a key from a face on the table's far side (its ray would have to cross under the whole table) and from a
 * face that looks under the table. The edge is `HALL_KEYS.edge` wide plus `soft` (the key's source size over its
 * distance) per metre of path. JS mirror of wood/glsl.js clubWoodKeyShade. Legs do not shade each other here.
 */
export function hallKeyShade(P, L, { centre, outer, skirtInset = 0, railY, skirtY, soft = 0 }) {
  const pc = [P[0] - centre[0], P[2] - centre[1]];
  const dh = [L[0] >= 0 ? Math.max(L[0], 1e-5) : Math.min(L[0], -1e-5), L[2] >= 0 ? Math.max(L[2], 1e-5) : Math.min(L[2], -1e-5)];
  const exit = (hx, hz) => Math.max(0, Math.min((Math.sign(dh[0]) * hx - pc[0]) / dh[0], (Math.sign(dh[1]) * hz - pc[1]) / dh[1]));
  const below = P[1] <= skirtY;
  const t = below ? exit(outer[0] - skirtInset, outer[1] - skirtInset) : exit(outer[0], outer[1]);
  const e = HALL_KEYS.edge + soft * t;
  return 1 - smooth01(-e, e, P[1] + L[1] * t - (below ? skirtY : railY));
}

/** The keys' light (no occlusion) as bodyLight() would read it for the four sides (+x, -x, +z, -z): the mean over the same six stations per side. Pure. */
export function hallKeySides(keys, table) {
  const [cx, cz] = table.centre, [hx, hz] = table.outer;
  const span = table.top - table.floorY;
  const ys = [table.top - 0.12 * span, table.top - 0.55 * span], along = [-0.6, 0, 0.6];
  const side = (ax, sg) => {
    const sum = [0, 0, 0], n = ax === 0 ? [sg, 0, 0] : [0, 0, sg];
    for (const t of along) for (const y of ys) {
      const p = ax === 0 ? [cx + sg * hx, y, cz + t * hz] : [cx + t * hx, y, cz + sg * hz];
      for (const k of keys ?? []) { const e = hallKeyLight(k, p, n).E; sum[0] += e[0]; sum[1] += e[1]; sum[2] += e[2]; }
    }
    return sum.map((v) => v / (along.length * ys.length));
  };
  return [side(0, 1), side(0, -1), side(2, 1), side(2, -1)];
}

/**
 * Per side of the table: how the side's DIRECT light (the room's number for that face, its bounce share taken out) is
 * shared once the keys are evaluated by themselves. `direct`: luma of that light per side; `keyE`: hallKeySides();
 * `lowShare`: hallSides().lowShare (the share only the bake holds: the keys and every other bake-only light).
 * Returns { key, low }: the keys' share (taken out of the side's number; at most 1 - minSteep) and the low share that
 * is left for the side's pooled low light. Without direct light on a side: 0, 0. Pure.
 */
export function hallKeyShares(direct, keyE, lowShare) {
  const key = [0, 0, 0, 0], low = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const d = direct?.[i];
    if (!(d > 1e-6)) continue;
    key[i] = clamp(luma(keyE?.[i] ?? [0, 0, 0]) / d, 0, 1 - HALL_KEYS.minSteep);
    low[i] = clamp((lowShare?.[i] ?? 0) - key[i], 0, 1 - HALL_KEYS.minSteep - key[i]);
  }
  return { key, low };
}

/**
 * Round A7 (CONTRACT.md 19.1; the arena venue, the third hall model with the keys): the hall's baked cube (the env
 * service's `club.env.hall`) in the body's own lobe (wood/glsl.js WOOD_FN_HENV).
 *   on      the switch (false: the body is round A6's, text, key and uniforms; tools: ?clubwood=henv turns it on,
 *           ?clubwood=nohenv off)
 *   cube    the cube's share on rising rays and on the boards (0..1; 0 = round A6's numbers through the new text)
 *   carpet  the cube's share on the carpet (0: the floor map, the room's own floor irradiance, stays)
 * OFF, by a pair: the app's body is rough, so its lobe shows no picture of the hall, only a level; the hall as the cube
 * holds it is darker on rising rays than this model's own answer. Measured at V10 on the high tier under the HALF-WAY
 * files of 2026-11-15 19:18Z with the cube of 19:43Z (job a7t5; cube in the lobe | off, one boot): near legs
 * (436,501 9x9) 25.0 | 25.7 and (596,541 9x9) 27.7 | 29.2, long apron (701,436 9x9) 39.9 | 39.8; 0.1 % of the frame's
 * pixels differ by 4 levels or more. The variant stays as a tool (?clubwood=henv).
 */
export const HALL_GLOSS = Object.freeze({ on: false, cube: 1, carpet: 0 });

/**
 * Round A6b: does the room's bake hold the key lights? The room publishes what its bake leaves out
 * (`club.room.bakeRules.skip`: id prefixes; arena/room.js UNDER). Keys that are not baked are not in a side's number
 * either: nothing is taken out for them (hallKeyShares is not called) and they are added to the baked sides, as they
 * are to the analytic ones. No rules object (every bake before round A6b): the keys are in the bake. Pure.
 */
export function hallKeysInBake(rules, prefix = HALL_KEYS.prefix) {
  const skip = Array.isArray(rules?.skip) ? rules.skip : [];
  return !skip.some((s) => typeof s === 'string' && s.length > 0 && String(prefix).startsWith(s));
}

// ---- the lamp's lit face ---------------------------------------------------------------------------------------------------------
// What a coat mirrors is the lamp the frame shows. Two sources, one model:
//   - the club luminaire publishes its lit underside as plain data (club/room/lamp/face.js `lampFace`, reached at run time
//     through the built lamp's `face()`): lit panels in a frame with cross bars between them, tube strips inside each panel,
//     levels relative to a strip's core. `faceModel` turns one rectangular face of it into the shader's numbers;
//   - without the club luminaire the app's own face is on screen (scene/room.js `lampFaceTexture`): one panel, three tube
//     strips over a dim diffuser. `LAMP_FACE` holds that pattern's numbers (the node arm reads the source and fails when it
//     moves) and `appFaceModel` gives the same model for it.
// The model: every length a share of the emitter rectangle's half side along the lamp or across it; radiance relative to the
// face mesh's colour.

/** The warm white both faces draw their tube strips with (sRGB 255, 246, 226), linear. */
export const TUBE_WHITE = Object.freeze([1, 0.9216, 0.7605]);
const TUBE_ALPHA = 0.95;   // ... laid over the diffuser at this opacity

export const LAMP_FACE = Object.freeze({
  size: [512, 170], tubes: [42, 85, 128], tubeHeight: 48, ramp: 0.35, alpha: TUBE_ALPHA, ends: [14, 498], panelRows: [8, 162],
  panel: [58, 52, 38], core: [255, 246, 226], edge: [255, 238, 205],
});

const srgbToLinear = (u) => { const c = u / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const faceMean = (m) => [0, 1, 2].map((i) => (m.panel[i] + (m.tube[i] - m.panel[i]) * m.tubes * m.tubeHalf) * (m.panels * m.padLen * m.padAcross));

/**
 * The app's own face pattern as the model. Composited the way the 2D canvas does (in sRGB values), then linear: `tube` = a
 * strip's axis, `panel` = the darkest row between two strips, tubeHalf = the strip's equivalent half width (its light above
 * the panel level over its peak above it).
 */
export function appFaceModel() {
  const F = LAMP_FACE, H = F.size[1], W = F.size[0];
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const rows = [];
  for (let y = 0; y < H; y++) {
    const py = y + 0.5;
    let c = F.panel;
    for (const cy of F.tubes) {
      const t = (py - (cy - F.tubeHeight / 2)) / F.tubeHeight;
      if (t <= 0 || t >= 1) continue;
      const k = t < F.ramp ? t / F.ramp : t > 1 - F.ramp ? (1 - t) / F.ramp : 1;
      c = mix(c, mix(F.edge, F.core, k), F.alpha * k);
    }
    rows.push(c.map(srgbToLinear));
  }
  const mid = Math.round((F.tubes[0] + F.tubes[1]) / 2);
  const tube = rows[F.tubes[1]], panel = rows[mid];
  let area = 0;
  for (let y = mid; y < Math.round((F.tubes[1] + F.tubes[2]) / 2); y++) area += Math.max(0, luma(rows[y]) - luma(panel));
  const width = area / Math.max(luma(tube) - luma(panel), 1e-6);
  const len = (F.ends[1] - F.ends[0]) / W;
  const m = { along: 'x', panels: 1, pitch: 0, padLen: len, padAcross: (F.panelRows[1] - F.panelRows[0]) / H,
    tubes: F.tubes.length, tubeHalf: width / H, tubeOffset: (F.tubes[2] - F.tubes[1]) / (H / 2), tubeLen: len, tube, panel };
  m.mean = faceMean(m);
  return m;
}

/**
 * One rectangular face of the club luminaire (an entry of `lampFace(...).faces`) as the model; null when it is not a
 * rectangle with panels or a number is missing. A strip that fades to `levels.tubeEnd` over `tubeEnd` at each end of its
 * panel loses (1 - tubeEnd level) / 2 of that length: the lit pad is that much shorter than the panel.
 */
export function faceModel(face) {
  try {
    if (!face || face.shape !== 'rect' || !Array.isArray(face.panels) || !face.panels.length || !Array.isArray(face.half) || !Array.isArray(face.panelSize)) return null;
    const alongX = face.long !== 'z';
    const hA = alongX ? face.half[0] : face.half[1], hC = alongX ? face.half[1] : face.half[0];
    const [pl, ps] = face.panelSize;
    const bar = Number(face.frame?.bar) || 0, lv = face.levels ?? {};
    const n = Math.min(6, face.panels.length);
    const lost = (Number(face.tubeEnd) || 0) * (1 - (Number.isFinite(lv.tubeEnd) ? lv.tubeEnd : 1)) / 2;
    const strips = Array.isArray(face.tubes) ? face.tubes : [];
    const count = strips.length >= 3 ? 3 : strips.length ? 1 : 0;
    const tubeLevel = (Number.isFinite(lv.tube) ? lv.tube : 1) * TUBE_ALPHA, panelLevel = Number.isFinite(lv.panel) ? lv.panel : 0.45;
    const m = {
      along: alongX ? 'x' : 'z', panels: n, pitch: (pl + bar) / hA, padLen: (pl / 2 - lost) / hA, padAcross: (ps / 2) / hC,
      tubes: count, tubeHalf: count ? strips[0].half / hC : 0, tubeOffset: count === 3 ? Math.abs(strips[2].offset) / hC : 0,
      tubeLen: (n * pl + (n - 1) * bar) / 2 / hA,
      tube: TUBE_WHITE.map((v) => v * tubeLevel), panel: TUBE_WHITE.map((v) => v * panelLevel),
    };
    m.mean = faceMean(m);
    for (const v of [m.pitch, m.padLen, m.padAcross, m.tubeHalf, m.tubeOffset, m.tubeLen, ...m.tube, ...m.panel, ...m.mean]) if (!Number.isFinite(v) || v < 0) return null;
    if (!(m.padLen > 0 && m.padAcross > 0 && m.padLen <= 1.001 && m.padAcross <= 1.001 && m.tubeLen <= 1.001)) return null;
    return m;
  } catch { return null; }
}

/**
 * Does a set of emitter rectangles carry the app's tube pattern? The app draws it on its canopy only: a single wide
 * rectangle (the shorter side at least 0.5 m); every other face is plain.
 */
export function lampHasTubes(rects) {
  return Array.isArray(rects) && rects.length === 1 && Math.min(rects[0].w, rects[0].d) >= 0.5;
}

// ---- the room's light on the table body ---------------------------------------------------------------------------------------------
// The app's table is not a room material: it gets none of the room's fixed emitters and none of its ambient. This is the
// room's own law (club/room/light.js LIGHTS_FRAGMENT: finite window, near-field cap, one representative point per emitter,
// one-sided cosine, shaded-lamp axis) on a Lambert receiver, evaluated on the CPU at a few points of the body. The inputs are
// the PACKED uniform values the room's shader reads (uRoomEmP / C / N / A), so nothing of the packing is repeated here.
const smooth01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * Irradiance (linear RGB, the app's light units) at the point p with unit normal n from the room's emitters.
 * `packed`: [{ P: [x, y, z, window radius], C: [r, g, b, type 0 point | 1 rect | 2 tube], N: [nx, ny, nz, w], A: [ax, ay, az, w] }].
 */
export function roomIrradiance(packed, p, n) {
  const out = [0, 0, 0];
  for (const e of packed ?? []) {
    const P = e.P, C = e.C, N = e.N, A = e.A;
    const rel = [p[0] - P[0], p[1] - P[1], p[2] - P[2]];
    let q = [P[0], P[1], P[2]], soft = N[3] * N[3], emit = 1;
    if (C[3] > 1.5) {
      const a = Math.min(A[3], Math.max(-A[3], rel[0] * A[0] + rel[1] * A[1] + rel[2] * A[2]));
      q = [q[0] + A[0] * a, q[1] + A[1] * a, q[2] + A[2] * a];
      soft = A[3] * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) + N[3] * N[3];
    } else if (C[3] > 0.5) {
      const V = [N[1] * A[2] - N[2] * A[1], N[2] * A[0] - N[0] * A[2], N[0] * A[1] - N[1] * A[0]];
      const a = Math.min(N[3], Math.max(-N[3], rel[0] * A[0] + rel[1] * A[1] + rel[2] * A[2]));
      const b = Math.min(A[3], Math.max(-A[3], rel[0] * V[0] + rel[1] * V[1] + rel[2] * V[2]));
      q = [q[0] + (A[0] * a + V[0] * b) * 0.6, q[1] + (A[1] * a + V[1] * b) * 0.6, q[2] + (A[2] * a + V[2] * b) * 0.6];
      soft = 4 * N[3] * A[3] / Math.PI;
    }
    let L = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const d2 = L[0] * L[0] + L[1] * L[1] + L[2] * L[2];
    let w = d2 / (P[3] * P[3]);
    if (!(w < 1)) continue;
    w = 1 - w * w; w *= w;
    const il = 1 / Math.sqrt(Math.max(d2, 1e-8));
    L = [L[0] * il, L[1] * il, L[2] * il];
    if (N[0] * N[0] + N[1] * N[1] + N[2] * N[2] > 0.25) {
      emit = -(N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
      if (emit <= 0) continue;
      if (C[3] < 0.5) emit = smooth01(0, 0.35, emit);
    }
    if (C[3] < 0.5 && A[3] > 0) {
      const ca = -(L[0] * A[0] + L[1] * A[1] + L[2] * A[2]);
      emit *= (1 - A[3]) + A[3] * 2.4 * ca * ca * (ca > 0 ? 1 : 0.55);
    }
    const f = emit * w / (d2 + soft) * Math.max(0, n[0] * L[0] + n[1] * L[1] + n[2] * L[2]);
    out[0] += C[0] * f; out[1] += C[1] * f; out[2] += C[2] * f;
  }
  return out;
}

/** The room's ambient on a surface of unit normal n (light.js: sky up, ground down, their mean plus `side` on a wall). */
export function roomAmbient(amb, n) {
  const k = 0.5 + 0.5 * n[1], s = 1 - n[1] * n[1];
  return [0, 1, 2].map((i) => amb.ground[i] + (amb.sky[i] - amb.ground[i]) * k + amb.side[i] * s);
}

/**
 * The room's light on the table body: irradiance on its six faces (+x, -x, +y, -y, +z, -z: the mean over a few stations of
 * each face of the table's outline) and on the floor beside each of its four sides (+x, -x, +z, -z, one table half-width out).
 * `table`: { centre: [x, z], outer: [hx, hz], top, floorY }. `under` = the share of the ambient that reaches a face looking
 * down (the underside sees the floor in the table's own shadow).
 * `sample(p, n) -> [r, g, b]` (optional): the room's own answer for the irradiance at a point (club.room.light.irradianceAt:
 * its baked light volume, with the room's shadows and bounces, or its analytic sum with the ambient). When it is given,
 * `packed` and `amb` are not read, the underside is sampled like every other face (a station under the cabinet is dark in
 * the room's own data), and `floorSample(x, z) -> [r, g, b] | null` (optional) answers for the floor beside the table.
 */
export function bodyLight(packed, amb, table, { under = 0.35, sample = null, floorSample = null } = {}) {
  const [cx, cz] = table.centre, [hx, hz] = table.outer;
  const span = table.top - table.floorY;
  const ys = [table.top - 0.12 * span, table.top - 0.55 * span];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const ok3 = (e) => Array.isArray(e) && e.length >= 3 && Number.isFinite(e[0]) && Number.isFinite(e[1]) && Number.isFinite(e[2]);
  const face = (n, pts) => {
    let sum = [0, 0, 0];
    if (typeof sample === 'function') {
      let k = 0;
      for (const p of pts) { const e = sample(p, n); if (ok3(e)) { sum = add(sum, [Math.max(0, e[0]), Math.max(0, e[1]), Math.max(0, e[2])]); k += 1; } }
      return k ? sum.map((v) => v / k) : [0, 0, 0];
    }
    for (const p of pts) sum = add(sum, roomIrradiance(packed, p, n));
    const a = roomAmbient(amb, n);
    return [0, 1, 2].map((i) => sum[i] / pts.length + a[i]);
  };
  const along = [-0.6, 0, 0.6];
  const side = (ax, sg) => {
    const pts = [];
    for (const t of along) for (const y of ys) pts.push(ax === 0 ? [cx + sg * hx, y, cz + t * hz] : [cx + t * hx, y, cz + sg * hz]);
    return face(ax === 0 ? [sg, 0, 0] : [0, 0, sg], pts);
  };
  const underside = typeof sample === 'function'
    ? face([0, -1, 0], [[cx - 0.5 * hx, table.top - 0.45 * span, cz], [cx + 0.5 * hx, table.top - 0.45 * span, cz]])
    : roomAmbient(amb, [0, -1, 0]).map((v) => v * under);
  const faces = [side(0, 1), side(0, -1), face([0, 1, 0], [[cx, table.top, cz]]), underside, side(2, 1), side(2, -1)];
  const out = Math.min(hx, hz);
  const floorAt = (x, z) => {
    if (typeof floorSample === 'function') { const e = floorSample(x, z); if (ok3(e)) return [Math.max(0, e[0]), Math.max(0, e[1]), Math.max(0, e[2])]; }
    return face([0, 1, 0], [[x, table.floorY, z]]);
  };
  const floor = [floorAt(cx + hx + out, cz), floorAt(cx - hx - out, cz), floorAt(cx, cz + hz + out), floorAt(cx, cz - hz - out)];
  return { faces, floor };
}

/**
 * The rail band from the world boxes of the rail-cap meshes ([{ min: [x, y, z], max: [x, y, z] }]).
 * Outer rectangle and top: the union. Inner rectangle: a piece that runs along x (a long rail or half of one) gives the inner
 * half z by the side of its box nearer the centre; a piece that runs along z gives the inner half x. Pieces that are not
 * elongated (corner blocks) are ignored for the inner edge. Without an elongated piece the band is taken `fallbackWidth` wide.
 */
export function railBand(boxes, { fallbackWidth = 0.13, minCap = 0.04 } = {}) {
  const list = (boxes ?? []).filter((b) => b && b.min && b.max && b.max[0] > b.min[0] && b.max[2] > b.min[2]);
  if (!list.length) return null;
  let top = -Infinity;
  for (const b of list) top = Math.max(top, b.max[1]);
  // only pieces that reach the rail top define the band (sub-rail parts under it share the material on some tables)
  const caps = list.filter((b) => b.max[1] > top - 0.012);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const b of caps) { x0 = Math.min(x0, b.min[0]); x1 = Math.max(x1, b.max[0]); z0 = Math.min(z0, b.min[2]); z1 = Math.max(z1, b.max[2]); }
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const outer = [(x1 - x0) / 2, (z1 - z0) / 2];
  const innerX = [], innerZ = [];
  for (const b of caps) {
    const sx = b.max[0] - b.min[0], sz = b.max[2] - b.min[2];
    const nearX = Math.min(Math.abs(b.min[0] - cx), Math.abs(b.max[0] - cx));
    const nearZ = Math.min(Math.abs(b.min[2] - cz), Math.abs(b.max[2] - cz));
    const spansX = b.min[0] < cx && b.max[0] > cx, spansZ = b.min[2] < cz && b.max[2] > cz;
    // (a cap is at least `minCap` wide: a narrow strip of the same wood beside it, such as a sub-rail under the cushion
    // cloth, is not the cap's inner edge)
    if (sx > 2.5 * sz && !spansZ && sz >= minCap) innerZ.push(nearZ);       // runs along x on one side of the table
    else if (sz > 2.5 * sx && !spansX && sx >= minCap) innerX.push(nearX);  // runs along z at one end
  }
  const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
  const inner = [
    innerX.length ? med(innerX) : Math.max(outer[0] - fallbackWidth, 0),
    innerZ.length ? med(innerZ) : Math.max(outer[1] - fallbackWidth, 0),
  ];
  return { centre: [cx, cz], inner, outer, top, pieces: caps.length, measured: [innerX.length > 0, innerZ.length > 0] };
}

/**
 * The lamp as one horizontal rectangle, from the scene's rectangular lights: [{ pos: [x, y, z], ex: [x, y, z], ey: [x, y, z],
 * radiance: [r, g, b], down: boolean }] with ex / ey the world half-width and half-height vectors. Lights that do not face
 * down, are dark or sit below `minY` are left out. Returns the box around the rest (centre, half extents), their total area
 * and the area-weighted radiance; null when there is none.
 */
export function lampRect(lights, { minY = -Infinity } = {}) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y = 0, area = 0, n = 0;
  const rad = [0, 0, 0];
  for (const l of lights ?? []) {
    if (!l || l.down !== true || !(l.pos[1] > minY)) continue;
    const a = 4 * Math.hypot(...l.ex) * Math.hypot(...l.ey);
    if (!(a > 0) || !(luma(l.radiance) > 0)) continue;
    const hx = Math.abs(l.ex[0]) + Math.abs(l.ey[0]), hz = Math.abs(l.ex[2]) + Math.abs(l.ey[2]);
    x0 = Math.min(x0, l.pos[0] - hx); x1 = Math.max(x1, l.pos[0] + hx);
    z0 = Math.min(z0, l.pos[2] - hz); z1 = Math.max(z1, l.pos[2] + hz);
    y += l.pos[1] * a; area += a; n += 1;
    for (let i = 0; i < 3; i++) rad[i] += l.radiance[i] * a;
  }
  if (!n) return null;
  return { centre: [(x0 + x1) / 2, y / area, (z0 + z1) / 2], half: [(x1 - x0) / 2, (z1 - z0) / 2], area, radiance: rad.map((v) => v / area), count: n };
}

/** JS mirror of clubWoodFloorVis (glsl.js): the share of the lamp a floor point q = [x, z] sees past the table top. */
export function floorVis(q, { centre, outer, top, floorY, lamp }) {
  const s = (lamp.centre[1] - floorY) / Math.max(top - floorY, 1e-3);
  let blocked = 1;
  for (let i = 0; i < 2; i++) {
    const c = i === 0 ? lamp.centre[0] : lamp.centre[2];
    const lo = q[i] + (centre[i] - outer[i] - q[i]) * s, hi = q[i] + (centre[i] + outer[i] - q[i]) * s;
    const ov = (Math.min(hi, c + lamp.half[i]) - Math.max(lo, c - lamp.half[i])) / Math.max(2 * lamp.half[i], 1e-4);
    blocked *= Math.min(1, Math.max(0, ov));
  }
  return 1 - blocked;
}

/** JS mirror of the edge profile (glsl.js WOOD_NORMAL): slope of the normal toward the outside at distance d from an edge of radius r. */
export function edgeSlope(d, r, gain = 1) {
  const t = Math.min(1, Math.max(0, 1 - d / r));
  return gain * t * t;
}

/**
 * JS mirror of clubWoodRamp (glsl.js): mean and variance of the edge profile u(x) = clamp(1 - x / r, 0, 1) ^ p over a pixel's
 * footprint of width w centred on d (the part past the edge, x < 0, is left out). The shader reads an edge's slope as this
 * mean and widens its lobes by the variance: a roll thinner than a pixel is one stable lean with a wide lobe, not a normal
 * that depends on where the pixel centre fell.
 */
export function rampStats(d, w, r, p) {
  const prim = (x, q) => { const t = 1 - Math.min(1, Math.max(0, x / r)); return r / (q + 1) * (1 - t ** (q + 1)); };
  const a = Math.max(d - 0.5 * w, 0), b = Math.max(d + 0.5 * w, a + 1e-5);
  const m1 = (prim(b, p) - prim(a, p)) / (b - a), m2 = (prim(b, 2 * p) - prim(a, 2 * p)) / (b - a);
  return [m1, Math.max(m2 - m1 * m1, 0)];
}

/** JS mirror of the inner edge's profile (glsl.js WOOD_NORMAL): the slope grows linearly to `gain` at the edge. */
export function innerEdgeSlope(d, r, gain) {
  return gain * Math.min(1, Math.max(0, 1 - d / r));
}

/**
 * Which lean of a rail cap's inner edge mirrors the lamp into a camera: the range of angles (degrees, from straight up toward
 * the table) at which the mirror ray from the point p = [x, y, z] on the edge, whose inward direction is `inward` (unit, level),
 * crosses the lamp's plane inside its footprint. Returns [lo, hi] or null. Pure geometry, used by the node arm to pin why the
 * edge must roll past 60 degrees.
 */
export function lampRollRange(p, inward, cam, lamp) {
  const v = [cam[0] - p[0], cam[1] - p[1], cam[2] - p[2]];
  const vl = Math.hypot(...v);
  let lo = null, hi = null;
  for (let deg = 0; deg <= 85; deg += 1) {
    const a = deg * Math.PI / 180;
    const n = [inward[0] * Math.sin(a), Math.cos(a), inward[2] * Math.sin(a)];
    const d = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) / vl;
    if (d <= 0) continue;
    const r = [2 * d * n[0] - v[0] / vl, 2 * d * n[1] - v[1] / vl, 2 * d * n[2] - v[2] / vl];
    if (r[1] <= 1e-4) continue;
    const t = (lamp.centre[1] - p[1]) / r[1];
    if (Math.abs(p[0] + r[0] * t - lamp.centre[0]) < lamp.half[0] && Math.abs(p[2] + r[2] * t - lamp.centre[2]) < lamp.half[1]) { if (lo === null) lo = deg; hi = deg; }
  }
  return lo === null ? null : [lo, hi];
}

/**
 * JS mirror of the closest approach in clubWoodCue (glsl.js): a ray from P along the unit direction d against the segment
 * A -> B. Returns { t, s, dist } (distance along the ray, station on the segment 0..1, their distance), or null when the
 * closest approach lies behind the ray's start.
 */
export function rayToSegment(P, d, A, B) {
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], ao = [P[0] - A[0], P[1] - A[1], P[2] - A[2]];
  const abab = Math.max(dot(ab, ab), 1e-8), abd = dot(ab, d);
  const den = abab - abd * abd;
  let s = den > 1e-8 ? Math.min(1, Math.max(0, (dot(ao, ab) - dot(ao, d) * abd) / den)) : 0;
  const t = dot([A[0] + ab[0] * s - P[0], A[1] + ab[1] * s - P[1], A[2] + ab[2] * s - P[2]], d);
  if (t < 0.003) return null;
  const x = [P[0] + d[0] * t, P[1] + d[1] * t, P[2] + d[2] * t];
  s = Math.min(1, Math.max(0, dot([x[0] - A[0], x[1] - A[1], x[2] - A[2]], ab) / abab));
  return { t, s, dist: Math.hypot(x[0] - A[0] - ab[0] * s, x[1] - A[1] - ab[1] * s, x[2] - A[2] - ab[2] * s) };
}
