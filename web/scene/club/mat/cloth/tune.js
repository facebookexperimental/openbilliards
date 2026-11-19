// Copyright (c) Meta Platforms, Inc. and affiliates.

// mat/cloth/tune.js — the cloth values of the club look (CONTRACT.md 9.1, owner: cloth). Pure data, no imports: cloth.js
// writes them into the patch's uniforms, the node arm (web/tools/club/test-club-cloth.mjs) checks the level law with them.

/** The look's cloth values. Each group has an identity (what a switched-off group writes). */
export const CLOTH_TUNE = Object.freeze({
  // direct: gain of the lamp term. throw: exponent on the lamp pool (1 = a bare diffuser, the app's lamp term; above 1 the
  // fixture sends more of its light straight down and the pool falls faster toward the ends). ambient: the ambient light on
  // an upward patch as a share of the centre's (ungained) lamp light. floor: no upward patch is lit under this share of the
  // centre's level. probe: share of the app's indirect diffuse light (the cube) that is kept. tint: colour of the flat part
  // of the ambient (a warm room).
  // LOOK VALUES, all of them: direct, throw, ambient and floor set the pool's contrast and are tuned on the fixed views
  // through the look's grade; the room itself gives the bed 0.027 of the centre's lamp light (club.env.ambient).
  pool: Object.freeze({ direct: 2.6, throw: 1.45, ambient: 0.25, floor: 0.28, probe: 0, tint: Object.freeze([1.0, 0.96, 0.88]) }),
  // the app fades the cloth's diffuse light with the eye's distance and angle (1 at arm's length, 0.71 from the standing
  // view). `share` of that fade is taken out and `level` is put in its place, so a point of the bed has one level from every
  // eye (0.74 is what the standing and the wide views get from the app: they stay where they were). `level` is a LOOK VALUE.
  even: Object.freeze({ level: 0.74, share: 1.0 }),
  // the reflection service's ambient cube (club.env.ambient): gain on its values, and the most of the ambient level it may
  // carry (the rest stays the flat term). The cube is scaled down when its upward value would give more than that: the level
  // of the cloth is set here, the cube brings colour and direction.
  env: Object.freeze({ gain: 1.0, share: 0.75 }),
  // the veil: gain of the environment's specular and sheen legs on the cloth (they are not scaled by the pool), and a neutral
  // term that runs against the pool: `lit` under the lamp, `dim` at the dim ends, both as a share of what the dye itself
  // returns of the centre's lamp light (so a dark dye gets a small veil). from / to: the pool values (with the throw) at and
  // under which the veil is `dim` / from which it is `lit` (the end rail's pool is 0.3, the centre's 1). LOOK VALUES.
  veil: Object.freeze({ ibl: 0.22, lit: 0.0, dim: 0.31, from: 0.3, to: 0.95, tint: Object.freeze([1.0, 0.98, 0.94]) }),
  // albedo gain and saturation, sheen gain and saturation, gain of the white dielectric lobe under the sheen.
  // lampSpecular: gain of the lamp's reflection in that lobe on the bed (its grazing Fresnel part does not follow `specular`).
  // sheenDye: the share of the sheen that takes the dye's own colour. sheenGraze: the bed's sheen gain at a grazing view,
  // back to 1 between N.V = grazeFrom and grazeTo (the low views; the standing view is past grazeTo). LOOK VALUES.
  tone: Object.freeze({ albedo: 1.0, saturation: 1.0, sheen: 0.9, sheenSaturation: 1.0, sheenDye: 0.7, sheenGraze: 0.45, grazeFrom: 0.1, grazeTo: 0.42, specular: 0.12, lampSpecular: 0.4 }),
  // cushion cloth: sheen gain, sheen roughness scale, albedo gain
  cush: Object.freeze({ sheen: 1.35, sheenRoughness: 0.8, albedo: 0.94 }),
  // cushion faces: the share of the bed's level in front of a face that the face gets per unit of hemisphere the bed fills
  // (a look value: see cloth/glsl.js LIGHT)
  // veil: the share of that light the face's fibre surface returns undyed (keeps a shaded face blue instead of ink)
  face: Object.freeze({ level: 0.8, veil: 0.02 }),
  // the app's relief (nap, close-up twill): the share flattened everywhere, and the footprint flatten: from / to this pixel
  // size on the cloth in metres, up to `footMax` (pool group: the lamp term is what makes that relief read as grain)
  grain: Object.freeze({ napFlatten: 0.6, footFrom: 0.0003, footTo: 0.0008, footMax: 0.9 }),
  // weave strength (normal tilt per unit of the map), thread direction on the bed, and the hand-over to the app's own close-up
  // twill inside its fade distance (0.32-0.52 m, shading.js SPIKE_DETAIL) when that twill is on
  weave: Object.freeze({ strength: 3.0, dir: Object.freeze([1, 0]), handover: 1, handoverFrom: 0.32, handoverTo: 0.52 }),
});
