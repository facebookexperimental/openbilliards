// Copyright (c) Meta Platforms, Inc. and affiliates.

// png.mjs — a minimal 8-bit PNG reader/writer and an amplified-difference
// helper, for capture tools that need to ship their own evidence.
//
// Why this exists rather than a dependency: the capture tools run against a
// checkout with no install step, and the only thing they need is to reopen the
// PNGs they just wrote and subtract them. Scope is deliberately narrow — 8 bits
// per channel, no interlace, no palette. Anything the renderer emits through
// CDP `Page.captureScreenshot` is inside that scope.
//
// The difference helper exists to satisfy the pocket-furniture provenance law's
// triptych requirement in the one case where a photograph is not available: a
// fresh/worn pair plus a LABELLED amplified difference. The gain is always
// stamped into the filename and reported alongside, because an amplified image
// is evidence about *where* something changed, never about how much.
import fs from 'node:fs';
import zlib from 'node:zlib';

/** Decode an 8-bit non-interlaced PNG. Returns { w, h, ch, data }. */
export function decodePng(file) {
  const buf = fs.readFileSync(file);
  let off = 8, w = 0, h = 0, bd = 0, ct = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bd = data[8]; ct = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bd !== 8) throw new Error(`${file}: bit depth ${bd} unsupported`);
  if (interlace) throw new Error(`${file}: interlaced PNG unsupported`);
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  if (!ch) throw new Error(`${file}: colour type ${ct} unsupported`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[p++];
    const line = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = (prev && i >= ch) ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 255;
    }
  }
  return { w, h, ch, data: out };
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** Encode tightly-packed RGBA8 as a PNG buffer. */
export function encodePng(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length);
    b.writeUInt32BE(data.length, 0);
    b.write(type, 4, 'ascii');
    data.copy(b, 8);
    b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length);
    return b;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Write `b - a`, amplified by `gain` around mid-grey, to `out`.
 * Returns { maxAbs, p999, meanAbs, meanSigned, hitFrac, meanAbsOn,
 * meanSignedOn } in sRGB levels of the UNAMPLIFIED difference — those are the
 * numbers to quote; the image only says where.
 *
 * `p999` (99.9th percentile of |d|) is there because `maxAbs` over a full app
 * frame is not a statement about the subject: a couple of hundred subpixels of
 * moved antialiasing on the aim line or a HUD element pin it near 200 in every
 * comparison, including ones that are otherwise pixel-identical. Quote p999 for
 * "how strong is the effect" and keep maxAbs only as an outlier flag.
 *
 * The `*On` pair is the same two means taken over the subpixels that changed
 * AT ALL (`hitFrac` of the frame) instead of over the whole frame. A render
 * change usually touches one object in a frame that is mostly HUD, void and
 * furniture, so the frame-wide means are the real per-pixel effect diluted by
 * whatever the framing happened to include — which flatters a "the mean barely
 * moved" claim in direct proportion to how much empty space is in shot. Quote
 * the `*On` pair whenever the claim is about the magnitude of the effect, and
 * the frame-wide pair only to describe the frame.
 */
export function diffPng(a, b, out, gain = 8) {
  const A = decodePng(a), B = decodePng(b);
  if (A.w !== B.w || A.h !== B.h) {
    throw new Error(`size mismatch: ${a} ${A.w}x${A.h} vs ${b} ${B.w}x${B.h}`);
  }
  const px = Buffer.alloc(A.w * A.h * 4);
  const hist = new Float64Array(256);
  let maxAbs = 0, sumAbs = 0, sum = 0, n = 0, hit = 0;
  for (let i = 0, j = 0; i < A.w * A.h; i++, j += 4) {
    for (let k = 0; k < 3; k++) {
      const d = B.data[i * B.ch + k] - A.data[i * A.ch + k];
      const ad = Math.abs(d);
      if (ad > maxAbs) maxAbs = ad;
      if (ad) hit++;
      hist[ad]++; sumAbs += ad; sum += d; n++;
      px[j + k] = Math.max(0, Math.min(255, 128 + d * gain));
    }
    px[j + 3] = 255;
  }
  fs.writeFileSync(out, encodePng(A.w, A.h, px));
  let acc = 0, p999 = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= n * 0.999) { p999 = v; break; }
  }
  return {
    maxAbs, p999, meanAbs: sumAbs / n, meanSigned: sum / n,
    hitFrac: hit / n,
    meanAbsOn: hit ? sumAbs / hit : 0,
    meanSignedOn: hit ? sum / hit : 0,
  };
}

/**
 * The plane-to-image homography, inverted: four screen points in cycle order
 * and the four texture coordinates they are CLAIMED to be, solved for the map
 * that takes any screen pixel back to (u, v).
 *
 * A homography is exact here and not an approximation: the playing surface is
 * one plane, the capture is one pinhole projection, and a plane seen by a
 * pinhole is related to the image by exactly this 8-parameter map. So the
 * inverse carries no modelling error of its own — the only thing it can be
 * wrong about is the correspondence it was handed, which is precisely the
 * claim under test.
 */
function uvFromScreen(quad, quadUv) {
  const M = [], rhs = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = quad[i], [u, v] = quadUv[i];
    M.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); rhs.push(u);
    M.push([0, 0, 0, x, y, 1, -x * v, -y * v]); rhs.push(v);
  }
  // Gaussian elimination, partial pivoting — 8x8, once per capture
  for (let c = 0; c < 8; c++) {
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) throw new Error('uvFromScreen: degenerate quad');
    [M[c], M[p]] = [M[p], M[c]]; [rhs[c], rhs[p]] = [rhs[p], rhs[c]];
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (!f) continue;
      for (let k = c; k < 8; k++) M[r][k] -= f * M[c][k];
      rhs[r] -= f * rhs[c];
    }
  }
  const h = rhs.map((v, i) => v / M[i][i]);
  const map = (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
  };
  // the solve must reproduce its own correspondences; a silent 8x8 failure
  // would otherwise become a confident statement about the wrong pixels
  for (let i = 0; i < 4; i++) {
    const [u, v] = map(quad[i][0], quad[i][1]);
    if (Math.abs(u - quadUv[i][0]) > 1e-6 || Math.abs(v - quadUv[i][1]) > 1e-6) {
      throw new Error('uvFromScreen: solve did not reproduce corner '
        + `${i} (${u}, ${v}) != (${quadUv[i]})`);
    }
  }
  return map;
}

/**
 * Sign agreement of `b - a` against a CODED multi-region mask, region by
 * region, with every region boundary projected independently.
 *
 * This exists because the two-region version below (`fieldSplitStats`) proves
 * less than it looks like it proves, which is the GH-542 visual audit's round-6
 * finding 1 and is correct: one straight cut with one orientation is satisfied
 * by any mapping that preserves that cut. A lateral mirror, a scale, a
 * within-half warp and a permutation of texels inside each half all keep the
 * foot half on the foot side, so all four score ~1.0 on it.
 *
 * A code fixes that by making the answer a WORD instead of a bit. The caller
 * masks the field into cols x rows cells following `bits`, captures that and
 * its complement, and every cell then has its own predicted sign at its own
 * projected position. The mirrors and shifts that survive a single cut are
 * scored HERE as matched nulls — same support, same threshold, same statistic,
 * only the claimed correspondence differs.
 *
 * What getting the whole word right does NOT require is the mapping being
 * "right everywhere at once", and an earlier draft of this comment said it did
 * (GH-542 r11 visual audit, finding 2). A word of rows*cols thresholded signs
 * pins the 2-COLOURING and nothing finer: any correspondence reproducing that
 * colouring — bijective or not — scores identically. `edges` below is where
 * the finer evidence lives, and it is a mean, not a per-point guarantee.
 *
 * Arguments beyond the two captures and the threshold:
 *   - `quad` / `quadUv`: the playing surface projected by the capture's own
 *     camera, and the texture coordinate each corner carries. The uv claim is
 *     the caller's (it belongs with the shader source it is read off), so the
 *     gate tests it rather than assuming it.
 *   - `bits[r][c]`: 1 where the field is kept in `a` and zeroed in `b`. Row 0
 *     is v = 1, matching PNG row order under flipY, so the caller builds the
 *     mask with the same indices it states here.
 *   - `extentM = [uMetres, vMetres]`, `sigmaM`: the bed's real size and the
 *     bake's own blur radius. Bands are measured to the nearest boundary the
 *     code actually FLIPS across — a shared edge between two equal cells is
 *     not an edge — in metres on the table, which needs no per-frame pixel
 *     scale and stays honest under perspective.
 *
 * Cell agreement alone still does not close the audit's list. A synthetic
 * red/green over this statistic (a compression of one half of u by 45%, run
 * against a 6x3 code) scored 0.914 overall and 0.588 in its worst cell: caught,
 * but not caught by a chance-level bar. A smooth warp or a scale error does not
 * relabel a cell, it MOVES the cell's boundary — so the honest measurement is
 * the displacement itself, and `edges` reports it.
 *
 * For every boundary the code flips across, pixels within three blur radii on
 * both sides are collected, and the offset is read off the signed area between
 * the observed and the predicted indicator: a boundary truly displaced by δ puts
 * mismatches in exactly the strip it swept, all on one side, so
 *
 *     δ = 6σ · Σ(mismatch · sign(d)) / N
 *
 * in metres on the table, signed toward +u (or +v). It needs no fitted
 * parameter, and the tolerance it invites is not one either: a boundary
 * localised to better than the blur radius the field was baked with is
 * localised as well as the artifact can express. Two honest caveats, both of
 * which cost accuracy rather than buying it: pixel density varies across the
 * window under perspective, which biases |δ| by a few per cent at these camera
 * distances; and a mismatch inside one window is attributed to that boundary,
 * which is safe only because the cells here are ~15σ across.
 *
 * AND ONE CAVEAT THAT IS NOT AN ACCURACY COST BUT A BLIND SPOT (GH-542 r9
 * visual audit, finding 2). The sum above runs over the WHOLE length of a
 * boundary and yields ONE signed number, so δ is the boundary's MEAN
 * displacement. A warp that pushes the boundary +x along half its length and
 * −x along the other half sums to ≈0 and is reported as a correctly placed
 * boundary. The red-proof: a smooth lateral warp of one cycle per row at ±4σ
 * local amplitude leaves every gate green — agreement 0.914, worst cell 0.828,
 * 18/18 cells, 21/21 boundaries, worst reported δ 12.9 mm against a 28.6 mm
 * bar — while the true local displacement reaches ~114 mm. The 45% one-sided
 * compression above is caught precisely because it has a non-zero boundary
 * mean. So this estimator closes the UNIFORM part of the continuous half
 * (translation, scale, one-sided compression) and not the zero-mean part; the
 * earlier claim that it closed the continuous half is withdrawn. The fix is a
 * per-SEGMENT δ, or an unsigned RMS reported beside the signed mean, and is on
 * the R1 followup list rather than done — changing the statistic would move
 * every number in a frozen capture pack.
 *
 * POLARITY IS DELIBERATELY ASYMMETRIC between `pred` and `nulls`, and callers
 * must not describe it as if it were not (GH-542 r11 visual audit, finding 1).
 * `pred.agree` is DIRECTED — `ok / n`, so a mapping producing the exact
 * COMPLEMENT of the mask scores ≈0 and the caller's `> 0.5` check fails it. The
 * nulls get `accBest = max(agree, 1 − agree)`, because a null read upside down
 * is the same hypothesis and giving it its best case is the conservative
 * choice. Two consequences for anything quoting this function: the complement
 * class is NOT blind to the pass/fail gate, only indistinguishable among the
 * nulls; and there is no "polarity freedom" to discount from the primary's
 * rows*cols sign-bits.
 */
export function fieldCodeStats(a, b, thresh, geom) {
  const A = decodePng(a), B = decodePng(b);
  if (A.w !== B.w || A.h !== B.h) {
    throw new Error(`size mismatch: ${a} ${A.w}x${A.h} vs ${b} ${B.w}x${B.h}`);
  }
  const { w, h } = A;
  const { quad, quadUv, bits, extentM, sigmaM } = geom;
  const rows = bits.length, cols = bits[0].length;
  if (!(sigmaM > 0)) throw new Error('fieldCodeStats: sigmaM must be > 0');
  if (!(extentM?.[0] > 0 && extentM?.[1] > 0)) {
    throw new Error('fieldCodeStats: extentM must be two positive metres');
  }
  const toUv = uvFromScreen(quad, quadUv);
  const cellOf = (u, v) => [
    Math.min(rows - 1, Math.max(0, Math.floor((1 - v) * rows))),
    Math.min(cols - 1, Math.max(0, Math.floor(u * cols))),
  ];
  // the alternative correspondences a single straight cut cannot separate
  const NULLS = [
    { name: 'mirror-u', f: (u, v) => [1 - u, v] },
    { name: 'mirror-v', f: (u, v) => [u, 1 - v] },
    { name: 'rot180', f: (u, v) => [1 - u, 1 - v] },
    { name: 'shift-u', f: (u, v) => [(u + 1 / cols) % 1, v] },
    { name: 'shift-v', f: (u, v) => [u, (v + 1 / rows) % 1] },
    // unconditionally, including on a non-square grid: swapping the axes is a
    // shader defect that is available whatever shape the code is, and scoring
    // it needs no Hamming distance between the code and its transpose — only
    // the same pixels read through the swapped correspondence
    { name: 'transpose', f: (u, v) => [1 - v, 1 - u] },
  ];
  const tally = [{ name: 'pred', f: (u, v) => [u, v] }, ...NULLS]
    .map((m) => ({ ...m, ok: 0, n: 0 }));
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) cells.push({ r, c, bit: bits[r][c], n: 0, ok: 0 });
  }
  const EDGES = [1, 3, Infinity];
  const bands = EDGES.map((hi, k) => ({ lo: k ? EDGES[k - 1] : 0, hi, n: 0, ok: 0 }));
  // every boundary the code flips across, keyed by the cell pair it separates.
  // `axis` is the direction δ is signed along; `at` is where the projection says
  // the boundary sits, in that axis's own uv.
  const flips = new Map();
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c + 1 < cols && bits[r][c] !== bits[r][c + 1]) {
        flips.set(`u:${r}:${c}`, { name: `u r${r} c${c}|${c + 1}`, axis: 'u',
          r, c, at: (c + 1) / cols, mm: 0, n: 0 });
      }
      if (r + 1 < rows && bits[r][c] !== bits[r + 1][c]) {
        // rows count DOWN from v = 1, so the boundary below row r is at
        // v = 1 - (r+1)/rows and δ is signed toward +v, i.e. toward row r
        flips.set(`v:${r}:${c}`, { name: `v r${r}|${r + 1} c${c}`, axis: 'v',
          r, c, at: 1 - (r + 1) / rows, mm: 0, n: 0 });
      }
    }
  }
  const WINDOW = 3 * sigmaM;
  let pos = 0, neg = 0, inside = 0, n = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (!inQuad(quad, x, y)) continue;
      inside++;
      const s = (B.data[i * B.ch] - A.data[i * A.ch]
        + B.data[i * B.ch + 1] - A.data[i * A.ch + 1]
        + B.data[i * B.ch + 2] - A.data[i * A.ch + 2]) / 3;
      if (Math.abs(s) <= thresh) continue;
      // `a` keeps the bit-1 cells. A dosed texel renders LIGHTER than the bed
      // mean and a masked one renders cleaner-than-mean, i.e. darker, so a
      // bit-1 cell is lighter in `a` and b - a is negative there. The
      // convention is stated once, here, and nowhere else in this function.
      const obs = s > 0 ? 1 : -1;
      if (s > 0) pos++; else neg++;
      n++;
      const [u, v] = toUv(x, y);
      for (const m of tally) {
        const [mu, mv] = m.f(u, v);
        const [r, c] = cellOf(mu, mv);
        m.n++;
        if ((bits[r][c] ? -1 : 1) === obs) m.ok++;
      }
      const [r, c] = cellOf(u, v);
      const cell = cells[r * cols + c];
      cell.n++;
      const hit = (bits[r][c] ? -1 : 1) === obs;
      if (hit) cell.ok++;
      // distance to the nearest edge the code FLIPS across, in blur radii
      let d = Infinity;
      const uc = u * cols, vr = (1 - v) * rows;
      if (c > 0 && bits[r][c - 1] !== bits[r][c]) d = Math.min(d, (uc - c) * extentM[0] / cols);
      if (c < cols - 1 && bits[r][c + 1] !== bits[r][c]) d = Math.min(d, (c + 1 - uc) * extentM[0] / cols);
      if (r > 0 && bits[r - 1][c] !== bits[r][c]) d = Math.min(d, (vr - r) * extentM[1] / rows);
      if (r < rows - 1 && bits[r + 1][c] !== bits[r][c]) d = Math.min(d, (r + 1 - vr) * extentM[1] / rows);
      // a cell with no differing neighbour has no flip edge at all: it belongs
      // in the far band, which is why the test is written for an infinite r
      const rs = Number.isFinite(d) ? d / sigmaM : Infinity;
      const bd = bands.find((z) => rs >= z.lo && (z.hi === Infinity || rs < z.hi));
      bd.n++;
      if (hit) bd.ok++;
      // ...and the displacement of each boundary this pixel is close to. The
      // pixel sits in cell (r, c), so its own predicted sign is `hit`; a
      // mismatch on the far side of where the boundary is CLAIMED to be is a
      // boundary that has moved past this pixel. Up to four boundaries are in
      // range, one per side; a cell 15 sigma across cannot put two of them
      // within one 3-sigma window, so no pixel is double-counted misleadingly.
      const near = [
        [`u:${r}:${c}`, (u - (c + 1) / cols) * extentM[0]],
        [`u:${r}:${c - 1}`, (u - c / cols) * extentM[0]],
        [`v:${r}:${c}`, (v - (1 - (r + 1) / rows)) * extentM[1]],
        [`v:${r - 1}:${c}`, (v - (1 - r / rows)) * extentM[1]],
      ];
      for (const [key, sd] of near) {
        const e = flips.get(key);
        if (!e || Math.abs(sd) > WINDOW) continue;
        e.n++;
        if (!hit) e.mm += sd > 0 ? 1 : -1;
      }
    }
  }
  // δ = 6σ · Σ(mismatch · sign(d)) / N, metres on the table, signed toward +u/+v
  const edges = [...flips.values()].map((e) => ({
    name: e.name, axis: e.axis, r: e.r, c: e.c, n: e.n,
    deltaM: e.n ? 2 * WINDOW * e.mm / e.n : null,
  }));
  const worstEdge = edges.filter((e) => e.deltaM != null)
    .reduce((m, e) => (m && Math.abs(m.deltaM) >= Math.abs(e.deltaM) ? m : e), null);
  const rate = (o) => ({ ...o, agree: o.n ? o.ok / o.n : 0 });
  const [pred, ...nulls] = tally.map(rate);
  return {
    w, h, pos, neg, n, inside, sigmaM, cols, rows,
    supportFrac: inside ? n / inside : 0,
    pred: {
      agree: pred.agree,
      bands: bands.map(rate),
      cells: cells.map(rate),
      cellsCovered: cells.filter((c) => c.n > 0).length,
      worstCell: cells.map(rate).filter((c) => c.n > 0)
        .reduce((m, c) => (m && m.agree <= c.agree ? m : c), null),
      edges,
      edgesCovered: edges.filter((e) => e.deltaM != null).length,
      worstEdge,
    },
    // a null that lands BELOW 0.5 is still informative — it is the same claim
    // read upside down — so the comparable number is its best-case accuracy
    nulls: nulls.map((m) => ({ name: m.name, agree: m.agree,
      accBest: Math.max(m.agree, 1 - m.agree) })),
  };
}

/** Inside a convex quad given as four screen points in cycle order. */
function inQuad(q, x, y) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) & 3];
    const cr = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cr === 0) continue;
    const s = cr > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/**
 * Sign segregation of `b - a` against a GEOMETRICALLY PREDICTED boundary.
 *
 * The obvious version of this — search for the best axis-aligned split and
 * discount the score against a noise control — is the right tool when the
 * boundary's screen position is unknown, and the wrong one as soon as it is
 * known. It was tried first and it failed on both counts: a bed mid-line seen
 * in perspective projects to an OBLIQUE line that no column or row can trace,
 * so a perfectly mapped field scored ~0.8; and the control, a replicate pair,
 * had so little support above the noise threshold that the search fitted it
 * perfectly and returned 1.0. A statistic with a free parameter needs a null
 * with matched support, and a replicate pair cannot supply one.
 *
 * This variant has no free parameters. The caller supplies, from the camera the
 * capture actually used:
 *   - `quad`, the playing surface projected to screen, in cycle order. Support
 *     is restricted to it, so rails, balls, the fixture and the environment
 *     re-bake stop contributing sign to a statement about the bed.
 *   - `pred`, the predicted sign boundary as [A, B, C] with `Ax + By + C > 0`
 *     on the side the caller predicts is POSITIVE. Agreement with it is
 *     DIRECTED, so the number carries the orientation claim too: a mirrored
 *     field scores below 0.5 rather than scoring well and needing a separate
 *     centroid test.
 *   - `decoy`, a second boundary that is orthogonal to `pred` ON THE TABLE and
 *     therefore predicts nothing. It shares the support, the threshold and the
 *     statistic with `pred`, which makes it the matched null that a
 *     replicate-pair control cannot be: two captures of one state have almost
 *     no support above threshold, and a best-of-N search over a handful of
 *     surviving pixels scores near 1.0 for free.
 *
 *   - `sigmaPx`, the field's own Gaussian blur radius projected into this
 *     frame. `bands` reports directed agreement inside 1 sigma of `pred`,
 *     between 1 and 3, and beyond 3. A field masked at a boundary and then
 *     blurred MUST be ambiguous at the cut and clean away from it, so the
 *     inner band has to score WORSE than the outer one; a constant offset, a
 *     stale texture and a global re-bake all give a flat profile. Banding by
 *     the physical radius rather than by equal counts is what makes that
 *     resolvable: at these camera distances one sigma is ~9 px, so a tertile
 *     split by count puts its innermost boundary at 2-3 sigma and the effect
 *     disappears into the scatter.
 */
export function fieldSplitStats(a, b, thresh, geom) {
  const A = decodePng(a), B = decodePng(b);
  if (A.w !== B.w || A.h !== B.h) {
    throw new Error(`size mismatch: ${a} ${A.w}x${A.h} vs ${b} ${B.w}x${B.h}`);
  }
  const { w, h } = A;
  const { quad, pred, decoy, sigmaPx } = geom;
  if (!(sigmaPx > 0)) throw new Error(`fieldSplitStats: sigmaPx must be > 0`);
  const dist = (L, x, y) => (L[0] * x + L[1] * y + L[2]) / Math.hypot(L[0], L[1]);
  const sgn = [], dp = [], dd = [];
  let pos = 0, neg = 0, inside = 0;
  for (let y = 0, i = 0; y < h; y++) {
    for (let x = 0; x < w; x++, i++) {
      if (!inQuad(quad, x, y)) continue;
      inside++;
      const s = (B.data[i * B.ch] - A.data[i * A.ch]
        + B.data[i * B.ch + 1] - A.data[i * A.ch + 1]
        + B.data[i * B.ch + 2] - A.data[i * A.ch + 2]) / 3;
      if (Math.abs(s) <= thresh) continue;
      if (s > 0) pos++; else neg++;
      sgn.push(s > 0 ? 1 : -1);
      dp.push(dist(pred, x, y));
      dd.push(dist(decoy, x, y));
    }
  }
  const n = sgn.length;
  const agreeOf = (d) => {
    let k = 0;
    for (let i = 0; i < n; i++) if ((d[i] > 0 ? 1 : -1) === sgn[i]) k++;
    return n ? k / n : 0;
  };
  const pAgree = agreeOf(dp), dAgree = agreeOf(dd);
  // bands in units of the field's own blur radius, NOT equal counts
  const EDGES = [1, 3, Infinity];
  const bands = EDGES.map((hi, k) => ({
    lo: k ? EDGES[k - 1] : 0, hi, n: 0, ok: 0, agree: 0,
  }));
  for (let i = 0; i < n; i++) {
    const r = Math.abs(dp[i]) / sigmaPx;
    const bd = bands.find((x) => r >= x.lo && r < x.hi);
    bd.n++;
    if ((dp[i] > 0 ? 1 : -1) === sgn[i]) bd.ok++;
  }
  for (const bd of bands) bd.agree = bd.n ? bd.ok / bd.n : 0;
  return {
    w, h, pos, neg, n, inside, sigmaPx,
    supportFrac: inside ? n / inside : 0,
    pred: { agree: pAgree, bands },
    decoy: { agree: dAgree, accBest: Math.max(dAgree, 1 - dAgree) },
  };
}
