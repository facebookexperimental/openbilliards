// Copyright (c) Meta Platforms, Inc. and affiliates.

// regdiff-628.mjs — GH-628 register pixel-diff ledger.
//
// The GH-628 hardening items are supposed to leave the sealed A5 register
// poses (capture-488d-registers.mjs, default rig) byte-identical except where
// an item itself demands the pixel change. "Looks the same" is not evidence;
// this instrument compares two capture directories frame by frame and writes
// down, per register: bytes-equal (sha-256 of the PNG), the count of pixels
// whose max channel delta is > 0 and > 2 codes, the maximum delta, and the
// pixel bbox of everything that moved. When a register did move it also
// writes an amplified difference image (|a-b| x --amp, clamped) so a reader
// can see WHERE without trusting the numbers.
//
// Optional attribution (--idmap DIR = the A tree, --idmap-b DIR = the B tree):
// for every register that moved, the differing pixels are classified against
// an idmask-488d.mjs id map shot from the same pose (DIR/<register>/idmap.png
// + idmap.json), using the id map's own legend and the same hue-nearest
// classifier idmask uses. Four buckets come out: `room` (id-map background =
// void the table did not draw), `nonDm` (the id map's `(other)` legend key),
// `seam` (the foot/leg families that sit on the floor: dm-leveler-*,
// dm-leg-*), and `other` (any other table family, i.e. a real `dm-*` part).
// A floor-seat change may move `room`, `nonDm` and `seam`; `other` must
// stay 0.
//
// Why `nonDm` is its own bucket and is ALLOWED under room-only (review round 4
// P2): idmask-488d.mjs paints EVERY opaque mesh, and its family function
// collapses every name that is not `dm-*` into the single legend key
// `(other)` (idmask-488d.mjs:145). The room floor, walls and bench are opaque
// meshes, so they read `(other)`, NOT `(background)` — folding that key into
// the prohibited bucket would reject exactly the room-only diffs this mode
// exists to certify. Both producers hide the balls and the cue stick
// (capture-488d-registers.mjs / idmask-488d.mjs:276 HIDE_BALLS), so on these
// poses `(other)` is the room block. DISCLOSED LIMIT: the id map cannot tell
// the room floor from any other future non-`dm-` mesh, so `nonDm` is a
// coarser certificate than `room` — it is printed as its own column so a
// reader sees how much of the diff rests on it.
//
// Attribution takes the WORST answer of the two maps (other > unresolved >
// seam > nonDm > room), and `--expect room-only` REQUIRES both: a pixel that moved
// because a table part disappeared is background in the tree that no longer
// draws it, so a one-sided map would file a deletion under `room` and pass.
// The address is mapped back through the capture's own crop law for the 2x/4x
// frames — see the note on the mapping below.
//
// Usage:
//   node tools/render/regdiff-628.mjs --a DIR --b DIR [--out DIR]
//        [--idmap DIR --idmap-b DIR] [--amp 8]
//        [--expect identical|room-only|any]
// DIR = a capture-488d-registers.mjs output directory (manifest.json + PNGs).
// Frames are paired by (register, zoom); a frame present on one side only is
// reported and counts as a violation under --expect.
// Exit: 0 report written and expectation met / 2 usage / 3 expectation failed.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readPng } from './measure-488d-patch.mjs';
import { encodePng } from './lib/png.mjs';

const USAGE = 'usage: regdiff-628.mjs --a DIR --b DIR [--out DIR] '
  + '[--idmap DIR --idmap-b DIR] [--amp N] [--expect identical|room-only|any]';
const argv = (await import('./lib/argv.mjs')).expandEqArgs(process.argv.slice(2));
const FLAGS = new Set(['--a', '--b', '--out', '--idmap', '--idmap-b', '--amp',
  '--expect']);
const { parseArgv: __parseArgv } = await import('./lib/argv.mjs'); // FIX10 (review round 10 on #731): ONE parse of the whole argv to completion — the strict parser of this tool IS this call (unknown flags refused, every value checked, help exits 0) — BEFORE any effect; destinations, selections and the mode come from the PARSED result
const __P = __parseArgv({ tag: 'regdiff-628', usage: USAGE, value: [...FLAGS], unknown: 'refuse', positionals: 'none' }, argv);
const opt = { amp: '8', expect: 'any' }; for (const f of FLAGS) if (__P.has(f)) opt[f.slice(2)] = __P.value(f);
if (opt.out) { const { invalidatePrior: __inv } = await import('./lib/serve-check.mjs'); __inv([path.join(path.resolve(String(opt.out)), 'regdiff.json')], 'regdiff-628'); } // the first effect, after the parse, from the parsed destination
if (!opt.a || !opt.b) { console.error(USAGE); process.exit(2); }
if (!['identical', 'room-only', 'any'].includes(opt.expect)) {
  console.error(`bad --expect ${opt.expect}\n${USAGE}`); process.exit(2);
}
// Attribution needs a map of BOTH sides. A pixel that changed because a table
// part DISAPPEARED is table-family in the tree that still draws it and plain
// background in the tree that does not; classified against the second tree
// alone it reads `room` and `--expect room-only` certifies the very thing it
// exists to forbid (review round 2 P2, GH-628 close-out). So room-only demands
// both maps and takes the more damning of the two answers per pixel.
if (opt.expect === 'room-only' && !(opt.idmap && opt['idmap-b'])) {
  console.error('--expect room-only needs --idmap DIR (A-side) AND --idmap-b '
    + 'DIR (B-side): a one-sided map cannot see a surface that vanished');
  process.exit(2);
}
if (opt['idmap-b'] && !opt.idmap) {
  console.error('--idmap-b needs --idmap (the A-side map)');
  process.exit(2);
}
const AMP = Number(opt.amp);
if (!Number.isFinite(AMP) || AMP <= 0) { console.error('bad --amp'); process.exit(2); }
const A = path.resolve(opt.a);
const B = path.resolve(opt.b);
const OUT = path.resolve(opt.out || path.join(path.dirname(B),
  `regdiff-${path.basename(A)}-vs-${path.basename(B)}`));
fs.mkdirSync(OUT, { recursive: true });

const manifest = (dir) => {
  const f = path.join(dir, 'manifest.json');
  if (!fs.existsSync(f)) { console.error(`no manifest.json in ${dir}`); process.exit(2); }
  return JSON.parse(fs.readFileSync(f, 'utf8'));
};
const MA = manifest(A);
const MB = manifest(B);
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const keyOf = (fr) => `${fr.register}@${fr.zoom}x`;

// Families whose pixels legitimately move with a floor seat: the parts that
// STAND on the floor. Everything else the table draws is `other`.
const SEAM_FAMILIES = /^dm-(leveler|leg)\b/;

// idmask-488d.mjs classifier, verbatim in law (hue-nearest against the id
// map's legend with the same brightness/chroma gates) so the attribution
// here agrees with the census idmask prints for the same frame.
function makeClassifier(legend) {
  const fams = Object.keys(legend);
  const hues = fams.map((f) => legend[f].hue);
  const halfStep = 180 / fams.length;
  return (r, g, b) => {
    const mx = Math.max(r, g, b) / 255; const mn = Math.min(r, g, b) / 255;
    const d = mx - mn;
    if (mx < 0.06) return '(background)';
    if (d / mx < 0.30) return '(background)';
    const rr = r / 255; const gg = g / 255; const bb = b / 255;
    let h;
    if (mx === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (mx === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
    if (h < 0) h += 360;
    let best = -1; let bestD = 1e9;
    for (let i = 0; i < hues.length; i++) {
      let dh = Math.abs(h - hues[i]);
      if (dh > 180) dh = 360 - dh;
      if (dh < bestD) { bestD = dh; best = i; }
    }
    return bestD <= halfStep * 0.9 ? fams[best] : '(unresolved)';
  };
}

// An id map is trusted only if it SAYS it is this register's pose, and the
// capture manifests agree what that pose is (review round 6 P2). Every register
// in the ladder is shot at the same default 1600x1000, so the dimension guard
// downstream cannot tell a stale or misfiled map from the right one: a map
// from another pose would answer with whatever family happens to sit at that
// address and could clear a `room-only` run on a table part that really moved.
// idmask-488d.mjs writes both facts (idmask-488d.mjs:390 — `register`,
// `pose`), and capture-488d-registers.mjs records the pose it actually drove
// the camera to (`manifest.poses[name]`), so the claim is checkable from the
// artefacts alone. It fails CLOSED: an unstated register, an unstated pose or
// a manifest that cannot name the pose all refuse the map (which `room-only`
// already counts as a violation) rather than trusting it.
//
// The comparison is SCHEMA-AGNOSTIC on purpose (review round 7 P2): the
// register set carries two pose shapes — the free camera
// `{cam, look, fov}` and `r7_overhead`'s `{overhead: true, height, fov}`
// (capture-488d-registers.mjs:122, idmask-488d.mjs:73) — and a check that
// transcribed the free-camera fields would have refused every overhead map
// and failed room-only on a register that was perfectly in order. What is
// actually being asserted is narrower than any schema: the two producers
// wrote the SAME pose object. So the objects are compared structurally (same
// key set, numbers within 1e-9, booleans and strings exact), which stays
// correct for whatever pose shape the register set grows next.
const poseValueEq = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length
      && a.every((v, i) => poseValueEq(v, b[i]));
  }
  if (typeof a === 'number' || typeof b === 'number') {
    return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
    return ka.join('\u0000') === kb.join('\u0000')
      && ka.every((k) => poseValueEq(a[k], b[k]));
  }
  return a === b;
};
const samePose = (p, q) => !!p && !!q
  && typeof p === 'object' && typeof q === 'object'
  && Object.keys(p).length > 0 && poseValueEq(p, q);

function idmapProvenance(register, meta) {
  if (meta.register !== register) {
    return `the map declares register '${meta.register}'`;
  }
  for (const [side, M] of [['A', MA], ['B', MB]]) {
    const want = M.poses && M.poses[register];
    if (!want) {
      return `capture ${side}'s manifest records no pose for this register`;
    }
    if (!samePose(meta.pose, want)) {
      return `the map's pose ${JSON.stringify(meta.pose)} != capture ${side}'s `
        + JSON.stringify(want);
    }
  }
  return null;
}

function loadIdmap(register, which) {
  if (!opt[which]) return null;
  const dir = path.join(path.resolve(opt[which]), register);
  const png = path.join(dir, 'idmap.png');
  const json = path.join(dir, 'idmap.json');
  if (!fs.existsSync(png) || !fs.existsSync(json)) return { missing: dir };
  const meta = JSON.parse(fs.readFileSync(json, 'utf8'));
  const bad = idmapProvenance(register, meta);
  if (bad) return { missing: `${dir} (${bad})` };
  return { img: readPng(png), classify: makeClassifier(meta.legend || {}) };
}

const rows = [];
let violations = 0;
const seen = new Set();
for (const fa of MA.frames) {
  const k = keyOf(fa);
  seen.add(k);
  const fb = MB.frames.find((f) => keyOf(f) === k);
  const row = { register: fa.register, zoom: fa.zoom, a: fa.file, b: fb ? fb.file : null };
  if (!fb) {
    row.error = 'frame absent on B';
    rows.push(row); violations++;
    continue;
  }
  const pa = path.join(A, fa.file); const pb = path.join(B, fb.file);
  row.shaA = sha(pa); row.shaB = sha(pb);
  row.bytesEqual = row.shaA === row.shaB;
  if (row.bytesEqual) {
    row.px = 0; row.px2 = 0; row.max = 0; row.bbox = null;
    rows.push(row);
    continue;
  }
  const ia = readPng(pa); const ib = readPng(pb);
  if (ia.w !== ib.w || ia.h !== ib.h) {
    row.error = `size ${ia.w}x${ia.h} vs ${ib.w}x${ib.h}`;
    rows.push(row); violations++;
    continue;
  }
  const W = ia.w; const H = ia.h; const total = W * H;
  const diff = Buffer.alloc(W * H * 4);
  let px = 0; let px2 = 0; let max = 0;
  let x0 = W; let y0 = H; let x1 = -1; let y1 = -1;
  const hist = new Uint32Array(256);
  const idmA = loadIdmap(fa.register, 'idmap');
  const idmB = loadIdmap(fa.register, 'idmap-b');
  // Zoom-aware id-map addressing (review round 1 P2, GH-628 close-out): the
  // 2x/4x frames are CENTRE CROPS of the same pose rescaled back to full size
  // (capture-488d-registers.mjs LADDER — "1x full frame, 2x centre half, 4x
  // centre quarter": clip origin ((1 − 1/z)/2) of the 1x frame, clip extent
  // 1/z, CDP clip scale z), while the id map is ONE UNCROPPED 1x shot of the
  // pose (idmask-488d.mjs takes a plain captureScreenshot with no clip). Both
  // come out at the same default 1600x1000, so the old dimension guard passed
  // and a zoomed pixel was classified by whatever family sat at that address
  // in the UNCROPPED frame — under `--expect room-only` that could clear, or
  // condemn, a surface the moved pixel never touched. The address is mapped
  // back through the capture's own law instead of transcribing the ladder
  // table: only the zoom factor is needed, and the reconstructed clip is
  // re-derived and CHECKED against this frame's dimensions. If it does not
  // reconcile, nothing is guessed — every differing pixel lands in
  // `unresolved`, which `--expect room-only` already counts as a violation.
  const addrFor = (m) => {
    if (!m || !m.img) return null;
    const z = Number(fa.zoom) || 1;
    const SW = m.img.w; const SH = m.img.h; // the 1x pose frame
    const cw = Math.round(SW / z); const chh = Math.round(SH / z);
    const cx = Math.round(((1 - 1 / z) / 2) * SW);
    const cy = Math.round(((1 - 1 / z) / 2) * SH);
    if (z < 1 || Math.round(cw * z) !== W || Math.round(chh * z) !== H) return null;
    return (x, y) => (cy + Math.floor(y / z)) * SW + (cx + Math.floor(x / z));
  };
  // Per-side reader: the family this map says a moved pixel belongs to.
  const readerFor = (m) => {
    if (!m || !m.img) return null;
    const at = addrFor(m);
    if (!at) return () => '(unresolved)';
    return (x, y) => {
      const oi = at(x, y) * m.img.ch;
      return m.classify(m.img.data[oi], m.img.data[oi + 1], m.img.data[oi + 2]);
    };
  };
  const readA = readerFor(idmA);
  const readB = readerFor(idmB);
  // Both sides get a vote and the WORST one wins (other > unresolved > seam >
  // nonDm > room). A part that vanished is its own family on the tree that
  // draws it and background on the tree that does not; trusting the
  // background answer is exactly how a one-sided map certifies a deletion as
  // `room`.
  const RANK = { room: 0, nonDm: 1, seam: 2, unresolved: 3, other: 4 };
  const bucketOf = (fam) => (fam === '(background)' ? 'room'
    : (fam === '(other)' ? 'nonDm' // idmask's catch-all legend key: the room block
      : (fam === '(unresolved)' ? 'unresolved'
        : (SEAM_FAMILIES.test(fam) ? 'seam' : 'other'))));
  const cls = { room: 0, nonDm: 0, seam: 0, other: 0, unresolved: 0 };
  const otherFam = new Map();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      const oa = p * ia.ch; const ob = p * ib.ch;
      const dr = Math.abs(ia.data[oa] - ib.data[ob]);
      const dg = Math.abs(ia.data[oa + 1] - ib.data[ob + 1]);
      const db = Math.abs(ia.data[oa + 2] - ib.data[ob + 2]);
      const d = Math.max(dr, dg, db);
      const o4 = p * 4;
      diff[o4] = Math.min(255, dr * AMP);
      diff[o4 + 1] = Math.min(255, dg * AMP);
      diff[o4 + 2] = Math.min(255, db * AMP);
      diff[o4 + 3] = 255;
      if (d === 0) continue;
      px++; hist[d]++;
      if (d > 2) px2++;
      if (d > max) max = d;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (readA || readB) {
        let bucket = null; let worstFam = null;
        for (const read of [readA, readB]) {
          if (!read) continue;
          const fam = read(x, y);
          const b = bucketOf(fam);
          if (bucket === null || RANK[b] > RANK[bucket]) { bucket = b; worstFam = fam; }
        }
        cls[bucket]++;
        if (bucket === 'other') {
          otherFam.set(worstFam, (otherFam.get(worstFam) || 0) + 1);
        }
      }
    }
  }
  row.px = px; row.px2 = px2; row.max = max;
  row.pxFrac = px / total;
  // Two PNGs can differ as BYTES while every decoded pixel agrees (a re-encode
  // or an ancillary chunk). The sentinels would then print the empty box as
  // [W, H, 0, 0] — a bbox with a negative extent, which is worse than no
  // answer because a reader can measure it (review round 6 P3).
  row.bbox = px ? [x0, y0, x1 + 1, y1 + 1] : null;
  row.bboxFrac = px ? [x0 / W, y0 / H, (x1 + 1) / W, (y1 + 1) / H] : null;
  // a compact histogram: how many pixels moved by each code (1..max)
  row.hist = Array.from(hist.slice(1, max + 1));
  const diffFile = path.join(OUT, `diff-${fa.register}-${fa.zoom}x-x${AMP}.png`);
  fs.writeFileSync(diffFile, encodePng(W, H, diff));
  row.diffPng = path.basename(diffFile);
  if (idmA || idmB) {
    const missing = [idmA, idmB].filter((m) => m && m.missing).map((m) => m.missing);
    if (missing.length) row.attribution = { missing: missing.join(' + ') };
    else {
      row.attribution = {
        ...cls,
        otherFamilies: Object.fromEntries(otherFam),
        sides: [idmA ? 'a' : null, idmB ? 'b' : null].filter(Boolean).join('+'),
      };
    }
  }
  rows.push(row);
}
for (const fb of MB.frames) {
  const k = keyOf(fb);
  if (seen.has(k)) continue;
  rows.push({ register: fb.register, zoom: fb.zoom, a: null, b: fb.file,
    error: 'frame absent on A' });
  violations++;
}

// --- expectation ---------------------------------------------------------
// A run that compared NOTHING is not a pass (review round 8 P2). Two empty
// manifests — `capture-488d-registers.mjs --registers ''`, a capture that
// died before its first frame, a mistyped --a — walk zero rows, leave
// `violations` at 0 and hand back exit 0 under `identical` and `room-only`
// alike: the most dangerous shape of evidence this tool can emit, because it
// reads exactly like a clean comparison. Refused as an input error (exit 2)
// in every mode, since a report over no frames is not worth writing.
const compared = rows.filter((r) => !r.error).length;
if (compared === 0) {
  console.error(`no frame pair to compare: ${MA.frames.length} frame(s) in`
    + ` ${A}, ${MB.frames.length} in ${B}, ${rows.length} row(s), 0 paired.`
    + ' A capture that produced no frames cannot certify anything');
  process.exit(2);
}
for (const r of rows) {
  if (r.error) continue;
  if (opt.expect === 'identical' && !r.bytesEqual) violations++;
  if (opt.expect === 'room-only' && !r.bytesEqual) {
    const at = r.attribution;
    if (!at || at.missing) violations++; // cannot attribute = cannot pass
    else if (at.other > 0 || at.unresolved > 0) violations++;
  }
}

const report = {
  tool: 'regdiff-628', a: A, b: B, tagA: MA.tag, tagB: MB.tag,
  amp: AMP, expect: opt.expect,
  // BOTH attribution inputs are recorded: room-only consumes the B-side map
  // and its answer can decide the verdict, so a report that named only the
  // A side could not be reproduced from its own ledger (review round 5 P3).
  idmap: opt.idmap ? path.resolve(opt.idmap) : null,
  idmapB: opt['idmap-b'] ? path.resolve(opt['idmap-b']) : null,
  rigA: MA.rig, rigB: MB.rig, rows, violations,
};
fs.writeFileSync(path.join(OUT, 'regdiff.json'), JSON.stringify(report, null, 2));

console.log(`# regdiff-628  A=${MA.tag} (${A})`);
console.log(`#             B=${MB.tag} (${B})`);
console.log(`#             expect=${opt.expect}  amp=x${AMP}  -> ${OUT}`);
console.log('register            zoom  bytes      px>0     px>2   max  bbox(px)'
  + (opt.idmap ? '              room   nonDm    seam   other  unres' : ''));
for (const r of rows) {
  if (r.error) { console.log(`${r.register.padEnd(19)} ${String(r.zoom).padStart(2)}x  ERROR ${r.error}`); continue; }
  const eq = r.bytesEqual ? 'EQUAL ' : 'DIFFER';
  let line = `${r.register.padEnd(19)} ${String(r.zoom).padStart(2)}x  ${eq}  `
    + `${String(r.px).padStart(7)}  ${String(r.px2).padStart(7)}  ${String(r.max).padStart(4)}  `
    + (r.bbox ? `[${r.bbox.join(',')}]`.padEnd(22) : '-'.padEnd(22));
  if (opt.idmap && r.attribution && !r.attribution.missing) {
    const a = r.attribution;
    line += ` ${String(a.room).padStart(7)} ${String(a.nonDm).padStart(7)} `
      + `${String(a.seam).padStart(7)} `
      + `${String(a.other).padStart(7)} ${String(a.unresolved).padStart(6)}`;
    if (a.other) line += `  other=${JSON.stringify(a.otherFamilies)}`;
  } else if (opt.idmap && r.attribution && r.attribution.missing) {
    line += `  (no idmap at ${r.attribution.missing})`;
  }
  console.log(line);
}
console.log('');
if (violations) {
  console.error(`[regdiff-628] ${violations} expectation violation(s) under --expect ${opt.expect} — exit 3`);
  process.exit(3);
}
console.log(`[regdiff-628] expectation '${opt.expect}' met on ${rows.length} frame pair(s).`);
