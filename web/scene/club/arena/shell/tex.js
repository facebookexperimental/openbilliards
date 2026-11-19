// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/shell/tex.js — the canvases the hall's shell draws in code (CONTRACT.md 13.6, 14.2). Owner: shell.
//
// Stand-ins and own work, all deterministic (seeded hashes: the same pixels on every load), all tileable where they tile:
//   carpetColor   a level-loop pile seen from above: one tone per loop (heathered yarn), the shade between loops, flecks
//   pileNormal    the same loops as a normal map (the relief a lamp rakes at a low angle)
//   backdropColor the backdrop's stretched fabric over its whole face. COLOUR: the cloth alone (panels, seams with
//                 their puckers, tension streaks from the corners; round A5: a rail behind the cloth is a ridge in
//                 the wash's LIGHT, ./glsl.js BACKDROP_RELIEF, and no longer a painted band here),
//                 the whole face's mean BACKDROP_MEAN exactly (the albedo law pins it; the bake's bounce reads it as
//                 vertex colour x 0.34). ALPHA (round A4): the SCALLOPS of the floor lights, how each unit's beam
//                 lands on the cloth as a share of its row's light. They are light: ./glsl.js BACKDROP_LIGHT adds
//                 them to the wash's own light on the cloth (the room light's emitter `hall.wash.0`); until round A3
//                 they were painted into the colour and stayed on the cloth under any light.
//   weaveNormal   a plain weave as a normal map (the backdrop at close range)
//   lensCells     the lit face of a floor light: a row of lens cells
//   foldsMap      the lite tier's drape (round A5): flat cloth that carries the high tier's folds as a map, a row per wall
// The carpet ids `arena.carpet.color|normal|rough` replace the first two when the assets role ships its scans (../shell.js).
// Every canvas is filled through an ImageData pixel loop and nothing else (no text, no path, no gradient call), so the
// node arms build the hall with a stub canvas; no word, mark or figure is drawn anywhere in this file.
//
// Colour canvases hold LINEAR multipliers encoded with the sRGB curve (the texture is tagged sRGB), so the mean a consumer
// multiplies a vertex colour with is the number stated here: CARPET_MEAN and BACKDROP_MEAN (the canvases' exact means).

/** The carpet canvas's mean, linear (the vertex colour carries the hue and the level: albedo = vertex colour x this). */
export const CARPET_MEAN = 0.80;
/** The backdrop canvas's MEAN over the whole face, linear, exact (round A3, the albedo law: the vertex colour is the
 * cloth's albedo / this, so map x vertex colour has the albedo as its mean). Round A4: the colour is the cloth alone
 * (the floor lights' scallops moved into the alpha: light, not paint), so every part of the face is near this mean. */
export const BACKDROP_MEAN = 0.34;

/**
 * The contrast law of the carpet scan (./glsl.js "scan"), in JS: for linear luminances `lum` (any array) it returns
 * { mean, norm, spread, spreadOut }: the mean, the scale that keeps the mean after a value below the mean was pulled
 * toward it by `low` and a value above it by `high` (out = mean x (1 + (l / mean - 1) x k) x norm), and the standard
 * deviation relative to the mean before and after. Pure arithmetic (the node arm reads it).
 */
export function scanTransfer(lum, low = 1, high = 1) {
  const n = lum.length;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += lum[i];
  const mean = n ? sum / n : 0;
  if (!(mean > 0)) return { mean: 0, norm: 1, spread: 0, spreadOut: 0 };
  let t = 0, v = 0, w = 0;
  for (let i = 0; i < n; i++) { const r = lum[i] / mean, o = 1 + (r - 1) * (r < 1 ? low : high); t += o; v += (r - 1) * (r - 1); w += o * o; }
  const norm = n / t, mo = t / n;
  return { mean, norm, spread: Math.sqrt(v / n), spreadOut: Math.sqrt(Math.max(0, w / n - mo * mo)) * norm };
}

const newCanvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
const srgb8 = (l) => { const c = l <= 0 ? 0 : l >= 1 ? 1 : (l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055); return Math.round(c * 255); };
/** An integer hash to 0..1 (two lattice indices and a seed). */
export const hash2 = (i, j, s) => { let h = (Math.imul(i | 0, 374761393) + Math.imul(j | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
/** Value noise 0..1 at (x, y) in lattice cells, periodic with the integer periods px and py. */
export function valueNoise(x, y, px, py, seed) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const w = (a, p) => ((a % p) + p) % p;
  const a = hash2(w(ix, px), w(iy, py), seed), b = hash2(w(ix + 1, px), w(iy, py), seed), c = hash2(w(ix, px), w(iy + 1, py), seed), d = hash2(w(ix + 1, px), w(iy + 1, py), seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function put(cv, fill) {
  const c2 = cv.getContext('2d'), img = c2.createImageData(cv.width, cv.height);
  fill(img.data);
  c2.putImageData(img, 0, 0);
  return cv;
}

// ---- the loop pile -------------------------------------------------------------------------------------------------------
/** The loops of one tile: `loops` along each side, every second row set off by half a loop (a tufted level loop). For a
 * pixel centre it returns [bump 0..1 over the loop, the loop's column, its row]. */
function loopAt(x, y, size, loops) {
  const fv = (y / size) * loops, row = Math.floor(fv);
  const lu = (x / size) * loops + (row & 1 ? 0.5 : 0), col = Math.floor(lu) % loops;
  const dx = lu - Math.floor(lu) - 0.5, dy = fv - row - 0.5;
  const r2 = dx * dx * 3.1 + dy * dy * 4.0;                 // a loop is a little longer along its row than across
  return [Math.max(0, 1 - r2), col, row];
}

/** Carpet colour: a multiplier with the linear mean CARPET_MEAN. `loops` = loops per tile side (the tile's metres / 3.3 mm). */
export function carpetColor(size, loops) {
  const lin = new Float32Array(size * size);
  let sum = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [b, col, row] = loopAt(x + 0.5, y + 0.5, size, loops);
      const yarn = hash2(col, row, 9103);
      let k = 1 + (yarn - 0.5) * 0.16;                       // heathered yarn: every loop its own tone
      const fleck = hash2(col, row, 9117);
      if (fleck > 0.955) k *= 1.16; else if (fleck < 0.04) k *= 0.86;
      k *= 0.80 + 0.26 * Math.sqrt(b);                       // the shade between loops, the lit crown of a loop
      k *= 1 + (valueNoise((x / size) * 7, (y / size) * 7, 7, 7, 9131) - 0.5) * 0.035; // slow mottling inside one tile
      lin[y * size + x] = k; sum += k;
    }
  }
  const norm = CARPET_MEAN / (sum / (size * size));
  return put(newCanvas(size, size), (d) => {
    for (let i = 0; i < size * size; i++) { const g = srgb8(lin[i] * norm); d[4 * i] = g; d[4 * i + 1] = g; d[4 * i + 2] = g; d[4 * i + 3] = 255; }
  });
}

/** A tileable height field (Float32Array, size x size) -> a tangent-space normal map canvas; `strength` = slope scale. */
function normalsOf(height, size, strength) {
  return put(newCanvas(size, size), (d) => {
    for (let y = 0; y < size; y++) {
      const yu = (y + size - 1) % size, yd = (y + 1) % size;
      for (let x = 0; x < size; x++) {
        const xl = (x + size - 1) % size, xr = (x + 1) % size;
        const gx = (height[y * size + xr] - height[y * size + xl]) * strength;
        const gy = (height[yd * size + x] - height[yu * size + x]) * strength; // canvas rows run down: +gy is the map's up
        const il = 1 / Math.hypot(gx, gy, 1);
        const o = 4 * (y * size + x);
        d[o] = Math.round((-gx * il * 0.5 + 0.5) * 255); d[o + 1] = Math.round((gy * il * 0.5 + 0.5) * 255); d[o + 2] = Math.round((il * 0.5 + 0.5) * 255); d[o + 3] = 255;
      }
    }
  });
}

/** The loop pile as a normal map (the same loops as carpetColor for the same `size` and `loops`). */
export function pileNormal(size, loops, strength = 1.6) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [b, col, row] = loopAt(x + 0.5, y + 0.5, size, loops);
      h[y * size + x] = Math.sqrt(b) * (0.75 + 0.5 * hash2(col, row, 9203)) + 0.08 * hash2(x, y, 9211); // loops of uneven height, fibre fuzz
    }
  }
  return normalsOf(h, size, strength);
}

/** A plain weave as a normal map: `threads` threads per tile side, slubs along the weft. */
export function weaveNormal(size, threads, strength = 1.1) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = ((x + 0.5) / size) * threads, v = ((y + 0.5) / size) * threads;
      const over = Math.cos(2 * Math.PI * u) * Math.cos(2 * Math.PI * v);          // warp over weft, weft over warp
      const slub = valueNoise(u * 0.11, v, Math.max(1, Math.round(threads * 0.11)), threads, 7411) - 0.5;
      h[y * size + x] = 0.5 * over + 0.35 * slub + 0.05 * hash2(x, y, 7419);
    }
  }
  return normalsOf(h, size, strength);
}

// ---- the backdrop ---------------------------------------------------------------------------------------------------------
/**
 * How the floor lights land on the backdrop: a grid (gw x gh, Float32Array) of each point's share of its ROW's light
 * (0..1; every row has the same mean, the brightest point of the whole grid is 1), for a wall `length` x `height` (metres;
 * column 0 = the wall's left end seen from the hall, row 0 = the floor). `lights`: [{ s }] positions along the wall; `light`: { off, length, height, tilt } (a bar `off`
 * from the wall, its lens `height` above the floor, tilted `tilt` rad toward the wall). Each unit is a bar: wide along the
 * wall, narrower across; no two are aimed or dimmed alike (seeded: a rig set by hand). Pure arithmetic (the node arm reads it).
 */
export function washScallops(gw, gh, { length, height, lights, light, seed = 7501 }) {
  const E = new Float32Array(gw * gh);
  const units = lights.map((L, i) => ({
    s: L.s, gain: 0.8 + 0.36 * hash2(i, 1, seed), tilt: light.tilt + (hash2(i, 2, seed) - 0.5) * 0.10, yaw: (hash2(i, 3, seed) - 0.5) * 0.12,
  }));
  const sub = [-0.36, -0.12, 0.12, 0.36].map((k) => k * light.length);          // a bar as four sources along its length
  const means = new Float32Array(gh), peaks = new Float32Array(gh);
  for (let r = 0; r < gh; r++) {
    const hh = ((r + 0.5) / gh) * height;
    let peak = 1e-9, sum = 0;
    for (let c = 0; c < gw; c++) {
      const s = ((c + 0.5) / gw) * length;
      let e = 0;
      for (const u of units) {
        // the unit's frame: axis A (up, leaning to the wall by tilt, turned along the wall by yaw), Z along the bar
        const ax = -Math.sin(u.tilt), ay = Math.cos(u.tilt) * Math.cos(u.yaw), az = Math.cos(u.tilt) * Math.sin(u.yaw);
        for (const ds of sub) {
          const rx = -light.off, ry = hh - light.height, rz = s - (u.s + ds);       // from the source to the wall point
          const d2 = rx * rx + ry * ry + rz * rz, d = Math.sqrt(d2);
          const along = (rx * ax + ry * ay + rz * az) / d;                          // cosine to the beam's axis
          if (along <= 0.02) continue;
          const side = (rz * Math.cos(u.yaw) - ry * Math.sin(u.yaw)) / d;            // sine along the bar
          const tz = Math.atan2(side, along), tn = Math.acos(Math.min(1, Math.hypot(along, side)));
          // (round A4: 0.80 along the bar, 0.60 until A3. Under the house light the wash has to be raised to read as
          // a wash, and with the narrower beam a scallop's core at the cloth's foot would pass the bed)
          const lobe = Math.exp(-(tz * tz) / (0.80 * 0.80) - (tn * tn) / (0.75 * 0.75));
          e += u.gain * lobe * (light.off / d) / d2;
        }
      }
      E[r * gw + c] = e; sum += e; if (e > peak) peak = e;
    }
    means[r] = sum / gw; peaks[r] = peak;
  }
  // every row keeps the SAME mean (the fall-off up the cloth is the emitter's, this map only says where along the row the
  // light lands), and the row where the beams stand furthest apart (the foot) reaches 1 at its brightest point
  let m0 = 1;
  for (let r = 0; r < gh; r++) m0 = Math.min(m0, means[r] / peaks[r]);
  for (let r = 0; r < gh; r++) { const k = m0 / means[r]; for (let c = 0; c < gw; c++) E[r * gw + c] *= k; }
  return E;
}

/** The grid washScallops() is evaluated on for the backdrop (columns along the wall, rows up it). */
export const SCALLOP_GRID = Object.freeze([256, 128]);
/** How the backdrop canvas's ALPHA holds the scallop share S (0..1): alpha = offset + scale x S. It never goes under a
 * quarter: a 2D canvas stores its colour premultiplied, and at a low alpha the colour would lose steps on the way back. */
export const SCALLOP_ALPHA = Object.freeze({ offset: 0.25, scale: 0.75 });
/** The share every ROW of a washScallops() grid has as its mean (the same for all rows by construction). */
export function scallopShare(S, gw = SCALLOP_GRID[0]) { let s = 0; for (let c = 0; c < gw; c++) s += S[c]; return s / gw; }

/**
 * The backdrop's fabric over its whole face (w x h px; column 0 = the wall's left end seen from the hall, row 0 = the top).
 * `plan`: { length, height, modules, rails: [heights], lights: [{ s }], light }.
 * COLOUR (rgb, grey): the cloth itself and nothing else: panels, seams with their puckers, the frame's rails showing
 * through as soft ridges, tension streaks. A multiplier, linear, whose mean over the face is BACKDROP_MEAN exactly.
 * ALPHA: where the floor lights' beams land (washScallops, SCALLOP_ALPHA). Round A4: the scallops are LIGHT, not paint.
 * Until A3 they were multiplied into the colour, which was right under the wash alone and wrong under any other light
 * (a neutral house wash showed seven fans painted on the cloth). The material is opaque: the alpha is read only by the
 * shell's own shader text (./glsl.js BACKDROP_LIGHT), which adds the beams' share to the wash's light on the cloth.
 */
export function backdropColor(w, h, plan, grid = null) {
  const [gw, gh] = SCALLOP_GRID;
  const S = grid ?? washScallops(gw, gh, plan);                // (`grid`: the caller's own washScallops() on SCALLOP_GRID)
  const scallop = (u, v) => { // bilinear, u along the wall 0..1, v up the wall 0..1
    const fx = Math.min(gw - 1.001, Math.max(0, u * gw - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, v * gh - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    const a = S[y0 * gw + x0], b = S[y0 * gw + x0 + 1], c = S[(y0 + 1) * gw + x0], d = S[(y0 + 1) * gw + x0 + 1];
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
  const mw = plan.length / plan.modules;                     // a module's width, m
  const seed = 7331;
  const K = new Float32Array(w * h);
  let total = 0;
  {
    for (let y = 0; y < h; y++) {
      const v = 1 - (y + 0.5) / h, hh = v * plan.height;
      // the frame's rails behind the cloth are no longer painted here (round A5): the cloth over a rail is a ridge,
      // and what the floor lights make of a ridge is light (./glsl.js BACKDROP_RELIEF). Until round A4 a light band
      // under each rail and a dark one over it stood in this map and stayed there under any light. What is left of
      // a rail in the cloth's own colour: the weave pulled a hair tighter over it (2 % darker, a hand wide).
      let rail = 1;
      for (const rh of plan.rails) { const e = hh - rh; rail *= 1 - 0.02 * Math.exp(-(e * e) / (0.05 * 0.05)); }
      for (let x = 0; x < w; x++) {
        const u = (x + 0.5) / w, s = u * plan.length;
        const m = Math.floor(s / mw), f = s / mw - m, e = Math.min(f, 1 - f) * mw;   // metres to the nearest upright
        let k = rail;
        k *= 0.955 + 0.06 * valueNoise(u * 22, v * 9, 22, 9, seed);                  // uneven tension, dye
        k *= 0.985 + 0.03 * hash2(x, y, seed + 1);                                   // grain
        k *= 0.975 + 0.035 * Math.sin(f * Math.PI);                                  // a panel bows a hair between its uprights
        // the seam over an upright: a hairline, the cloth pulled dark beside it, a pucker at every lacing point
        if (e < 0.004) k *= 0.55;
        else if (e < 0.06) k *= 0.90 + 0.10 * (e / 0.06) - 0.035 * Math.exp(-(e * e) / (0.03 * 0.03)) * (0.5 + 0.5 * Math.cos((2 * Math.PI * hh) / 0.25));
        // tension streaks: the cloth is pulled from a panel's four corners; fine ribs that run toward the nearest corner
        const cx = f < 0.5 ? f * mw : (f - 1) * mw, top = plan.height - hh, cy = hh < top ? hh : -top;
        const dc = Math.hypot(cx, cy);
        if (dc < 1.6) {
          const ang = Math.atan2(cy, cx);
          const rib = valueNoise(ang * 9 + m * 3.7, dc * 0.8, 64, 8, seed + 2 + (hh < top ? 0 : 5)) - 0.5;
          k *= 1 + 0.075 * rib * (1 - dc / 1.6) * (1 - dc / 1.6);
        }
        K[y * w + x] = k; total += k;
      }
    }
  }
  // the whole face's mean is BACKDROP_MEAN exactly (to the 8-bit step): the albedo law pins the mean of map x vertex colour
  const norm = BACKDROP_MEAN / (total / (w * h));
  return put(newCanvas(w, h), (d) => {
    for (let y = 0; y < h; y++) {
      const v = 1 - (y + 0.5) / h;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, g = srgb8(K[i] * norm);
        d[4 * i] = g; d[4 * i + 1] = g; d[4 * i + 2] = g;
        d[4 * i + 3] = Math.round(255 * (SCALLOP_ALPHA.offset + SCALLOP_ALPHA.scale * Math.min(1, Math.max(0, scallop((x + 0.5) / w, v)))));
      }
    }
  });
}

// ---- the lite tier's drape ----------------------------------------------------------------------------------------------
/** What the fold map's 8 bits hold: the fold shade / FOLD_MAP_SCALE (a pleat's own tone reaches 1.28). */
export const FOLD_MAP_SCALE = 1.4;
/**
 * The folds of the lite tier's drape as a map (round A5). The lite drape is flat cloth (two triangles per stretch); what
 * the full tiers carry per vertex (each pleat's tone, the shade of its valley, a lap's black) is laid along each wall
 * here: `rows` = one Float32Array per wall, the shade at equal steps along the wall (linear, already divided by
 * FOLD_MAP_SCALE). The canvas is rows[0].length wide and two pixels high per wall; a wall is sampled on the line
 * BETWEEN its two (equal) pixel rows, v = (wall + 0.5) / walls, so a linear filter never mixes two walls. Wall 0 is
 * at the canvas's bottom (a canvas texture is flipped: v = 0 is its last row).
 */
export function foldsMap(rows) {
  const w = rows[0].length, h = 2 * rows.length;
  return put(newCanvas(w, h), (d) => {
    rows.forEach((row0, r) => {
      const row = FOLD_TOE.on > 0 ? foldToe(row0) : row0;
      for (const y of [h - 1 - 2 * r, h - 2 - 2 * r]) {
        for (let x = 0; x < w; x++) { const g = srgb8(row[x]), o = 4 * (y * w + x); d[o] = g; d[o + 1] = g; d[o + 2] = g; d[o + 3] = 255; }
      }
    });
  });
}

/**
 * Round A7: the fold map's TOE. The lite wall paints a fold's valley at the room light's unshade factor times the
 * fold's mouth (0.55 x its form factor): under a baked map the full tiers show the same valleys at two thirds of
 * their ridges (their map holds the folds' real shade, a texel wide), the lite wall showed them at four tenths (V10,
 * the same drape boxes: p10 / p90 = 5 / 11 on lite against 7 / 11 on base), and one texel in fifteen of the lite
 * drape stood at or under level 4: the lite tier's dark pixels. The toe lifts what lies under a row's MEAN toward
 * that mean by `lift` and then scales the whole row so that ITS MEAN IS WHAT IT WAS: the paint's mean (the albedo
 * law's sum, the lite bake's bounce albedo) does not move, every ridge ends a little under where it was, the order
 * of any two texels is kept. `on: 0` = the map as round A5 made it.
 */
export const FOLD_TOE = Object.freeze({ on: 1, lift: 0.7 });
/** One row of the fold map under the toe (a new Float32Array; `lift` 0 returns the row's own values). */
export function foldToe(row, lift = FOLD_TOE.lift) {
  const n = row.length, out = new Float32Array(n);
  let m = 0; for (let i = 0; i < n; i++) m += row[i]; m /= Math.max(1, n);
  let t = 0; for (let i = 0; i < n; i++) { out[i] = row[i] + lift * Math.max(0, m - row[i]); t += out[i]; }
  const g = t > 0 ? (m * n) / t : 1;
  for (let i = 0; i < n; i++) out[i] *= g;
  return out;
}

/** The lit face of a floor light: `cells` lens cells in a row on a dark body (w x h px). A multiplier 0..1, linear. */
export function lensCells(w, h, cells = 10) {
  return put(newCanvas(w, h), (d) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const fu = ((x + 0.5) / w) * cells, cu = fu - Math.floor(fu) - 0.5, cv = (y + 0.5) / h - 0.5;
        const r = Math.hypot(cu * 1.15, cv * (h / (w / cells)) * 1.15);              // a round lens in a square cell
        const k = r < 0.34 ? 1 - 0.35 * (r / 0.34) * (r / 0.34) : r < 0.42 ? 0.5 : 0.06;
        const g = srgb8(k);
        const o = 4 * (y * w + x);
        d[o] = g; d[o + 1] = g; d[o + 2] = g; d[o + 3] = 255;
      }
    }
  });
}
