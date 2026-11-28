// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props/wall.js — things that hang on a wall (owner: props): framed pictures, the chalkboard, the cue rack with cues, the
// clock, the painted plaque and the two lit tube-letter signs. Each function builds in a wall frame: origin on the wall at floor
// level, +X along the wall, +Z out of the wall. Heights are metres above the floor.
import { ART_IDS, ART_LANDSCAPE } from './atlas.js';

/** Outer [width, height] of a framed picture whose image is `h` high. */
export function pictureSize(h, art, detail) {
  const land = ART_LANDSCAPE[art] === true;
  const mat = detail >= 1 ? Math.max(0.03, h * 0.09) : 0, fw = Math.max(0.022, h * 0.055);
  return [(land ? h * 1.25 : h * 0.8) + 2 * mat + 2 * fw, h + 2 * mat + 2 * fw];
}

/**
 * A framed picture, `h` high, centred at (x, y). The width follows the picture's format. style: 'wood' | 'black' | 'gilt'.
 * Returns the width.
 */
export function picture(c, x, y, h, art, style = 'wood') {
  const { K, B, A, uv, detail } = c;
  const id = ART_IDS.includes(art) ? art : ART_IDS[0];
  const land = ART_LANDSCAPE[id] === true;
  const ih = h, iw = land ? h * 1.25 : h * 0.8;               // the picture itself
  const mat = detail >= 1 ? Math.max(0.03, h * 0.09) : 0;      // the card mount around it
  const fw = Math.max(0.022, h * 0.055), fd = 0.028;           // moulding width and depth
  const W = iw + 2 * mat + 2 * fw, Hh = ih + 2 * mat + 2 * fw;
  c.wallShadow(W, Hh, x, y);
  c.wallTouch(W, x, y - Hh / 2);
  const bucket = style === 'wood' ? B.wood : B.paint;
  const fuv = style === 'wood' ? uv.wood() : uv.sw(style === 'gilt' ? 'gilt' : 'nearBlack');
  if (detail === 0) {
    K.box(bucket, [W, Hh, 0.02], [x, y, 0.01], { uv: fuv });
    K.quad(B.paint, iw, ih, [x, y, 0.0215], { uv: { r: A.r(`art.${id}`) } });
    return W;
  }
  K.box(bucket, [W, fw, fd], [x, y + Hh / 2 - fw / 2, fd / 2], { uv: fuv, b: 0.006 });
  K.box(bucket, [W, fw, fd], [x, y - Hh / 2 + fw / 2, fd / 2], { uv: fuv, b: 0.006 });
  K.box(bucket, [fw, Hh - 2 * fw, fd], [x - W / 2 + fw / 2, y, fd / 2], { uv: fuv, b: 0.006, g: 1 });
  K.box(bucket, [fw, Hh - 2 * fw, fd], [x + W / 2 - fw / 2, y, fd / 2], { uv: fuv, b: 0.006, g: 1 });
  K.quad(B.paint, W - 2 * fw + 0.004, Hh - 2 * fw + 0.004, [x, y, 0.012], { uv: uv.sw('mat') });
  K.quad(B.paint, iw, ih, [x, y, 0.0135], { uv: { r: A.r(`art.${id}`) } });
  return W;
}

/** The chalkboard, w x h, centred at (x, y), in a wooden frame with a chalk ledge. */
export function chalkboard(c, x, y, w = 1.0, h = 0.63) {
  const { K, B, A, uv, detail } = c;
  const wood = uv.wood(), fw = 0.045, fd = 0.03;
  c.wallShadow(w + 2 * fw, h + 2 * fw, x, y);
  c.wallTouch(w + 2 * fw, x, y - h / 2 - fw);
  K.box(B.wood, [w + 2 * fw, fw, fd], [x, y + h / 2 + fw / 2, fd / 2], { uv: wood, b: 0.007 });
  K.box(B.wood, [w + 2 * fw, fw, fd], [x, y - h / 2 - fw / 2, fd / 2], { uv: wood, b: 0.007 });
  K.box(B.wood, [fw, h, fd], [x - w / 2 - fw / 2, y, fd / 2], { uv: wood, b: 0.007, g: 1 });
  K.box(B.wood, [fw, h, fd], [x + w / 2 + fw / 2, y, fd / 2], { uv: wood, b: 0.007, g: 1 });
  K.quad(B.paint, w + 0.004, h + 0.004, [x, y, 0.012], { uv: { r: A.r('chalkboard') } });
  if (detail >= 1) {
    K.box(B.wood, [w * 0.7, 0.014, 0.05], [x, y - h / 2 - fw - 0.004, 0.035], { uv: wood, b: 0.004 });
    K.box(B.paint, [0.07, 0.011, 0.011], [x - 0.12, y - h / 2 - fw + 0.009, 0.04], { uv: uv.sw('white'), b: 0.002, ry: 0.2 });
    K.box(B.paint, [0.05, 0.011, 0.011], [x + 0.08, y - h / 2 - fw + 0.009, 0.045], { uv: uv.sw('chalkBlue'), b: 0.002, ry: -0.3 });
  }
}

/** A wall cue rack 0.72 m wide with six cues standing in it. */
export function cueRack(c, x) {
  const { K, B, A, uv, detail, seg, rand } = c;
  const wood = uv.wood();
  const w = 0.72, n = 6;
  c.wallShadow(w + 0.05, 1.45, x, 0.98);
  c.wallTouch(w + 0.05, x, 0.275);
  // the back board is thick enough to stand proud of a panelled dado
  K.box(B.wood, [w, 1.3, 0.05], [x, 0.93, 0.025], { uv: wood, b: 0.004, g: 1, k: 0.8 });          // back board
  K.box(B.wood, [w + 0.05, 0.05, 0.15], [x, 0.3, 0.075], { uv: wood, b: 0.01 });                 // foot shelf with cups
  K.box(B.wood, [w + 0.05, 0.055, 0.095], [x, 1.45, 0.0475], { uv: wood, b: 0.01 });             // clip rail
  if (detail >= 1) K.box(B.wood, [w + 0.09, 0.035, 0.07], [x, 1.6, 0.035], { uv: wood, b: 0.01 }); // cap moulding
  const cueUV = { r: A.col('cue') };
  for (let i = 0; i < n; i++) {
    if (detail >= 1 && i === 4) continue;                                                         // one cue is on a table
    const cx = x - w / 2 + 0.08 + (i * (w - 0.16)) / (n - 1);
    const lean = (rand() - 0.5) * 0.012;
    K.tube(B.paint, [cx, 0.326, 0.095], [cx + lean, 0.326 + 1.47, 0.068], 0.0145, 0.0062, { segs: seg(8), uv: cueUV, caps: true });
    if (detail >= 2) K.lathe(B.metal, [[0.019, 0], [0.022, 0.012], [0.019, 0.024]], [cx, 1.44, 0.082], { segs: 8, uv: uv.metal('brass') }); // clip
  }
}

/** A round wall clock, 0.4 m across, centred at (x, y). */
export function clock(c, x, y) {
  const { K, B, A, uv, seg } = c;
  c.wallShadow(0.36, 0.36, x, y);
  c.wallBlob(0.47, x, y - 0.025);
  K.lathe(B.metal, [[0, 0], [0.2, 0], [0.205, 0.012], [0.2, 0.034], [0.186, 0.04], [0.182, 0.028], [0, 0.028]], [x, y, 0], { segs: seg(24), rx: Math.PI / 2, uv: uv.metal('brass') });
  K.disc(B.paint, 0.183, [x, y, 0.029], { segs: seg(24), rx: Math.PI / 2, uv: { r: A.r('clock') } });
}

/** The painted plaque (not lit), w wide, centred at (x, y). */
export function plaque(c, x, y, w = 0.9) {
  const { K, B, A, uv } = c;
  const h = w * 0.625;
  c.wallShadow(w + 0.07, h + 0.07, x, y);
  c.wallTouch(w + 0.07, x, y - h / 2 - 0.035);
  K.box(B.wood, [w + 0.07, h + 0.07, 0.03], [x, y, 0.015], { uv: uv.wood(), b: 0.01 });
  K.quad(B.paint, w, h, [x, y, 0.0312], { uv: { r: A.r('plaque') } });
}

/**
 * A lit tube-letter sign on a dark backing board, centred at (x, y). which: 'A' (wide) | 'B'.
 * Returns the emitter spec in the wall frame.
 */
export function neonSign(c, x, y, which) {
  const { K, B, A, uv, lit, E } = c;
  const a = which === 'A';
  const w = a ? 1.36 : 1.1, h = a ? 0.35 : 0.393;
  c.wallTouch(w + 0.06, x, y - h / 2 - 0.03);
  K.box(B.paint, [w + 0.06, h + 0.06, 0.035], [x, y, 0.0175], { uv: uv.sw('nearBlack'), b: 0.008 });
  K.quad(B.emit, w, h, [x, y, 0.0362], { uv: { r: A.r(a ? 'signA' : 'signB') }, k: E.sign });
  if (!lit) K.quad(B.decal, w * 2.4, h * 5.2, [x, y, 0.004], { uv: { r: A.r(a ? 'haloRed' : 'haloTeal') } }); // the glow on the wall
  // a tube along the letters, standing off the wall: it lights the room in front and puts a halo on its own wall
  return {
    id: a ? 'sign.a' : 'sign.b', type: 'tube', p: [x, y, 0.1], axis: [1, 0, 0], size: [w * 0.85, 0.03],
    color: a ? [1.0, 0.3, 0.12] : [0.12, 0.85, 0.8], intensity: 0.9, radius: 4.5,
  };
}
