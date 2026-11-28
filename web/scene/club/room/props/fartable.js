// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/fartable.js — the second table (owner: props): a seven-foot table in low detail (body, legs, lacquered rails
// with sights, cushions, pockets, a few balls, a cue left on the rail) under its own three-shade lamp. It reads as a second
// lit island behind the main table and gives the frame depth: three pools of light on its cloth, one under each shade
// (painted: atlas.js `farCloth`), balls lit from above with their shadows on the cloth, and shades of glowing amber glass.
// THE PLAYED TABLE LEADS (CONTRACT.md 10.2): this cloth and this lamp are held clearly under the main bed in every frame
// (levels.js FAR, FAR_POOL, EMIT.shade): the cloth, the cushions and the balls are plain emissive surfaces at fixed levels
// (no room light and no reflection on them, so their display value is the same in every view and under every bake), the
// shades show no bare bulb, and the lamp's emitter is a quiet secondary source.
// Built in the table's own frame: origin on the floor under the table centre, +X = its long axis.
import { FAR, FAR_BALLS, FAR_BED, R2 } from './levels.js';

export function buildFarTable(c, far) {
  const { K, B, A, uv, detail, seg, lit, E, look = {}, farDetail = 1 } = c;
  // tool switch `clubprops=far:r2`: round 2's second table (A/B pictures of the same tree)
  const old = look.far === 'r2';
  const F = old ? { ...R2.FAR, lamp: FAR.lamp, bulb: R2.FAR.farBulb } : { ...FAR, shade: E.shade, bulb: E.farBulb };
  const BALLS = old ? R2.FAR_BALLS : FAR_BALLS;
  const wood = uv.wood();
  const pl = FAR_BED[0] - 0.1, pw = FAR_BED[1] - 0.1;   // playing surface (1.98 x 0.99)
  const ol = 2.36, ow = 1.37;            // outer size
  const yBed = 0.775, rail = 0.145;

  // body and legs
  c.blob(ol + 1.2, ow + 1.1, 0, 0, 2);                                   // the table's own shadow under its lamp (cast-size)
  K.box(B.wood, [ol - 0.1, 0.27, ow - 0.1], [0, 0.615, 0], { uv: wood, b: 0.012, k: [0.3, 0.6] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const lx = sx * (ol / 2 - 0.2), lz = sz * (ow / 2 - 0.2);
    c.touchBox(0.13, 0.13, lx, lz);                                        // contact: a leg's foot
    K.box(B.wood, [0.13, 0.4, 0.13], [lx, 0.29, lz], { uv: wood, b: 0.01, g: 1, k: [0.3, 0.42] });
    K.box(B.wood, [0.105, 0.1, 0.105], [lx, 0.05, lz], { uv: wood, b: 0.012, g: 1, k: [0.22, 0.3] });
  }
  // lacquered rails
  for (const s of [-1, 1]) {
    K.box(B.top, [ol, 0.05, rail], [0, 0.785, s * (ow / 2 - rail / 2)], { uv: wood, b: 0.013 });
    K.box(B.top, [rail, 0.05, ow - 2 * rail], [s * (ol / 2 - rail / 2), 0.785, 0], { uv: wood, b: 0.013, g: 2 });
  }
  // the lit cloth: bed (the painted pools) and cushions (lit on top, their faces toward the bed in their own shade)
  K.quad(B.emit, FAR_BED[0], FAR_BED[1], [0, yBed, 0], { rx: -Math.PI / 2, uv: { r: A.r('farCloth', 3) }, k: F.cloth });
  const rim = uv.sw('clothRim'), kc = old ? F.cushion : [F.cushion * 0.35, F.cushion];
  for (const s of [-1, 1]) {
    for (const h of [-1, 1]) K.box(B.emit, [pl / 2 - 0.13, 0.036, 0.05], [h * (pl / 4 + 0.005), 0.792, s * (pw / 2 + 0.02)], { uv: rim, b: 0.012, k: kc });
    K.box(B.emit, [0.05, 0.036, pw - 0.13], [s * (pl / 2 + 0.02), 0.792, 0], { uv: rim, b: 0.012, k: kc });
  }
  // sights on the rails: three between each pair of pockets, plain dots
  // TIER LINE (owner: parity): the sights are sub-pixel dots from across the room; they are built at `farTableDetail` 1 (high)
  if (!old && detail >= 1 && farDetail >= 1) {
    const dot = uv.sw('cream');
    for (const s of [-1, 1]) {
      for (const h of [-1, 1]) for (const f of [0.25, 0.5, 0.75]) K.disc(B.paint, 0.007, [h * f * (pl / 2), 0.8105, s * (ow / 2 - rail * 0.42)], { segs: 5, uv: dot });
      for (const f of [-0.25, 0, 0.25]) K.disc(B.paint, 0.007, [s * (ol / 2 - rail * 0.42), 0.8105, f * pw], { segs: 5, uv: dot });
    }
  }
  // pockets: dark mouths over the rail corners and side middles
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) {
    K.disc(B.paint, sx ? 0.066 : 0.06, [sx * (pl / 2 + 0.018), 0.8105, sz * (pw / 2 + (sx ? 0.018 : 0.04))], { segs: seg(10), uv: uv.sw('pocket') });
  }
  // balls and a cue left across the rail
  for (const [name, x, z] of (detail === 0 ? BALLS.slice(0, 5) : BALLS)) {
    if (old) { K.sphere(B.glow, 0.0286, [x, yBed + 0.0286, z], { segs: detail === 0 ? 6 : 10, rings: detail === 0 ? 4 : 6, uv: uv.sw(name), k: F.ballShade }); continue; }
    // lit from straight above like the cloth (the emissive batch: underside -> top), with the lamp's highlight as a dot
    // TIER LINE (owner: parity, CONTRACT 11.2): the far balls' tessellation follows the props' segment multiplier
    // (`club.knobs.propSegments` through `seg`), capped at the full room's 10 x 6: 8 x 5 on base (0.75), 10 x 6 on high
    K.sphere(B.emit, 0.0286, [x, yBed + 0.0286, z], { segs: detail === 0 ? 6 : Math.min(10, seg(10)), rings: detail === 0 ? 4 : Math.min(6, seg(6)), uv: uv.sw(name), k: F.ball });
    // TIER LINE (owner: parity): the 4.5 mm highlight dot is built at `farTableDetail` 1 (high); the ball itself always is
    if (farDetail >= 1) K.sphere(B.emit, 0.0045, [x, yBed + 0.0286 * 1.93, z], { segs: 4, rings: 2, uv: uv.sw('bulb'), k: F.ballSpark });
  }
  if (detail >= 1) K.tube(B.paint, [-0.86, 0.823, -0.6], [0.5, 0.789, 0.02], 0.0145, 0.0062, { segs: 8, uv: { r: A.col('cue') }, caps: true });

  // ---- the lamp: three glowing glass shades on a brass bar, hung from the ceiling
  const yS = yBed + 0.74;                 // the rim of the shades
  const brass = uv.metal('brass');
  const shade = { r: A.col('shade') };
  for (const x of [-0.6, 0, 0.6]) {
    K.lathe(B.emit, [[0.175, 0], [0.176, 0.01], [0.07, 0.15], [0.04, 0.172], [0, 0.174]], [x, yS, 0], { segs: seg(14), uv: shade, k: F.shade });
    K.lathe(B.emit, [[0.036, 0.168], [0.066, 0.146], [0.17, 0.004]], [x, yS, 0], { segs: seg(14), uv: uv.sw('bulb'), k: F.bulb });   // the inside
    K.tube(B.metal, [x, yS + 0.17, 0], [x, yS + 0.21, 0], 0.032, 0.02, { segs: seg(8), uv: brass });
    K.tube(B.metal, [x, yS + 0.21, 0], [x, yS + 0.31, 0], 0.007, 0.007, { segs: 6, uv: brass });
  }
  K.tube(B.metal, [-0.8, yS + 0.31, 0], [0.8, yS + 0.31, 0], 0.012, 0.012, { segs: seg(8), uv: brass, caps: true });
  for (const x of [-0.42, 0.42]) K.tube(B.metal, [x, yS + 0.31, 0], [x, far.ceil, 0], 0.005, 0.005, { segs: 5, uv: uv.metal('iron') });
  if (!lit) K.quad(B.decal, 4.6, 3.6, [0, 0.006, 0], { rx: -Math.PI / 2, uv: { r: A.r('pool', 3) } }); // the pool of light on the floor

  return {
    // the body's footprint in this frame (half length, half width, with 2 cm to spare): props.js lifts the wood inside it
    // (levels.js FAR_BODY)
    body: { half: [ol / 2 + 0.02, ow / 2 + 0.02] },
    emitters: [{ id: 'far.lamp', type: 'rect', p: [0, yS, 0], n: [0, -1, 0], axis: [1, 0, 0], size: [1.55, 0.36], color: [1.0, 0.86, 0.64], intensity: F.lamp, radius: 6 }],
  };
}
