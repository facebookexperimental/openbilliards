// Copyright (c) Meta Platforms, Inc. and affiliates.

// twolook-488d.mjs — GH-488D wave A2.5 TWO-LOOK COMPARATOR.
//
// § 14.8 established the method that answered O1/A1: capture the same
// register under both look bases and compare per-mesh-family statistics on
// IDENTICAL pixel sets, so that rig tint separates from material chroma. That
// analysis was run ad hoc, which is exactly the property this repo's own
// doctrine refuses in a measurement — a number nobody can re-derive is not a
// measurement. This file is that method, written down.
//
// What it does, and what it deliberately does NOT do:
//   - masks come from idmask-488d.mjs's idmap.png, classified by HUE with the
//     SAME gates the census uses (mx >= 0.06, d/mx >= 0.30, nearest hue within
//     0.9 * halfStep). No rectangle is ever placed by eye. That is the
//     standing law of this wave: a patch aimed by eye lands on the wrong mesh.
//   - every mask is then ERODED BY ONE PIXEL in 4-connectivity. Antialiased
//     and bloomed boundary pixels are a blend of two families and belong to
//     neither; keeping them would let a bright neighbour leak into a dark
//     family's statistic and read as material.
//   - the two looks are captured at DIFFERENT exposures (default 1.05, sp
//     0.85), so raw luminance is NOT comparable across looks and this tool
//     never compares it. It reports saturation (exposure-invariant to first
//     order) and WITHIN-FRAME ratios between two families, which divide the
//     exposure out exactly. The raw luma columns are printed for the record
//     and are only ever compared DOWN a column, never across.
//
// Usage:
//   node tools/render/twolook-488d.mjs --idmask DIR --a DIR --b DIR
//     [--register r5_railtop] [--min-px 200] [--ratio dm-casting,dm-railtop]
//     [--families a,b,c] [--json OUT.json]
// --a / --b are capture-488d-registers.mjs output dirs (--look default / sp).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng } from './measure-488d-patch.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const argOf = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value


const IDMASK = path.resolve(__pathOpt('--idmask', { default: '/tmp/ob-488d-idmask', tag: 'twolook-488d', mustExist: 'dir' }));
const DIR_A = path.resolve(__pathOpt('--a', { default: '', tag: 'twolook-488d', mustExist: 'dir' }));
const DIR_B = path.resolve(__pathOpt('--b', { default: '', tag: 'twolook-488d', mustExist: 'dir' }));
const MINPX = Number(argOf('--min-px', 200));
const RATIO = String(argOf('--ratio', '')).split(',').filter(Boolean);
const ONLY = String(argOf('--families', '')).split(',').filter(Boolean);
const JSON_OUT = __pathOpt('--json', { default: null, tag: 'twolook-488d' });

const idmap = JSON.parse(fs.readFileSync(path.join(IDMASK, 'idmap.json'), 'utf8'));
const REG = __stringOpt('--register', { default: idmap.register, tag: 'twolook-488d' });

// The frame this tool reads is the 1x pass frame of each capture dir. The
// idmask is rendered at the same register, same width/height, pixel-aligned,
// so mask index == frame index. That alignment is ASSERTED below, not assumed:
// a silent size mismatch would slide every mask off its own mesh.
const frameOf = (dir) => path.join(dir, `pass-${REG}-1x.png`);

const srgbToLin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);

// ---- rebuild the family masks from idmap.png ------------------------------
// Same classifier as idmask-488d.mjs's census. Duplicating a 20-line pure
// function is the lesser evil here: idmask-488d.mjs holds it inside its own
// run body with no export seam, and this wave's whole thesis is that a MIRROR
// OF A LAW is a defect. So this copy is bound to its source by an assertion
// instead of by good intentions -- the per-family pixel counts it produces are
// checked against idmap.json's own census below, and a divergence is fatal.
const img = readPng(path.join(IDMASK, 'idmap.png'));
const legend = idmap.legend;
const fams = Object.keys(legend);
const hues = fams.map((f) => legend[f].hue);
const halfStep = 180 / fams.length;
const classify = (r, g, b) => {
  const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255;
  const d = mx - mn;
  if (mx < 0.06) return -1;
  if (d / mx < 0.30) return -1;
  const rr = r / 255, gg = g / 255, bb = b / 255;
  let h;
  if (mx === rr) h = 60 * (((gg - bb) / d) % 6);
  else if (mx === gg) h = 60 * ((bb - rr) / d + 2);
  else h = 60 * ((rr - gg) / d + 4);
  if (h < 0) h += 360;
  let best = -1, bestD = 1e9;
  for (let i = 0; i < hues.length; i++) {
    let dh = Math.abs(h - hues[i]);
    if (dh > 180) dh = 360 - dh;
    if (dh < bestD) { bestD = dh; best = i; }
  }
  return bestD <= halfStep * 0.9 ? best : -1;
};

const W = img.w, H = img.h;
const owner = new Int16Array(W * H).fill(-1);
const rawCount = new Map();
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * img.ch;
    const f = classify(img.data[i], img.data[i + 1], img.data[i + 2]);
    owner[y * W + x] = f;
    if (f >= 0) rawCount.set(fams[f], (rawCount.get(fams[f]) || 0) + 1);
  }
}

// Erode by one pixel, 4-connectivity: a pixel survives only if its four
// neighbours belong to the same family. Frame-edge pixels are dropped.
const keep = new Uint8Array(W * H);
for (let y = 1; y < H - 1; y++) {
  for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, f = owner[i];
    if (f < 0) continue;
    if (owner[i - 1] === f && owner[i + 1] === f
      && owner[i - W] === f && owner[i + W] === f) keep[i] = 1;
  }
}

// ---- bind the classifier copy to its source -------------------------------
// idmap.json's rows carry the census this tool must reproduce PRE-erosion. If
// the numbers disagree, the duplicated classifier has drifted from the one
// that produced the file and every statistic below is measuring a different
// mask than it claims to. Fail loudly rather than report a plausible number.
const rows = idmap.rows || [];
let checked = 0;
for (const r of rows) {
  const nm = r.family ?? r.name;
  if (!nm || !(nm in legend)) continue;
  const want = r.px ?? r.n ?? r.pixels;
  if (!Number.isFinite(want)) continue;
  const got = rawCount.get(nm) || 0;
  if (got !== want) {
    throw new Error(`classifier drift: ${nm} idmap.json=${want} recomputed=${got}`);
  }
  checked++;
}

// ---- sample both looks on the identical eroded masks ----------------------
const load = (dir) => {
  const f = readPng(frameOf(dir));
  if (f.w !== W || f.h !== H) {
    throw new Error(`size mismatch: idmask ${W}x${H} vs ${frameOf(dir)} ${f.w}x${f.h}`);
  }
  return f;
};
const A = load(DIR_A), B = load(DIR_B);
const lookOf = (dir) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).look;
  } catch { return path.basename(dir); }
};
const LA = lookOf(DIR_A), LB = lookOf(DIR_B);

const stat = () => ({ n: 0, s: 0, lum: 0, lin: 0 });
const acc = new Map();
const sample = (f, i) => {
  const j = i * f.ch;
  const r = f.data[j] / 255, g = f.data[j + 1] / 255, b = f.data[j + 2] / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return {
    s: mx > 0 ? (mx - mn) / mx : 0,
    lum: 0.2126 * r + 0.7152 * g + 0.0722 * b,
    lin: 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b),
  };
};
for (let i = 0; i < W * H; i++) {
  if (!keep[i]) continue;
  const fam = fams[owner[i]];
  if (ONLY.length && !ONLY.includes(fam)) continue;
  let a = acc.get(fam);
  if (!a) { a = { A: stat(), B: stat() }; acc.set(fam, a); }
  for (const [f, k] of [[A, 'A'], [B, 'B']]) {
    const v = sample(f, i);
    a[k].n++; a[k].s += v.s; a[k].lum += v.lum; a[k].lin += v.lin;
  }
}

const out = [];
for (const [fam, a] of [...acc.entries()].sort((p, q) => q[1].A.n - p[1].A.n)) {
  if (a.A.n < MINPX) continue;
  const m = (k, fld) => a[k][fld] / a[k].n;
  out.push({
    family: fam,
    n: a.A.n,
    raw: rawCount.get(fam) || 0,
    [`S_${LA}`]: +m('A', 's').toFixed(4),
    [`S_${LB}`]: +m('B', 's').toFixed(4),
    [`lum_${LA}`]: +m('A', 'lum').toFixed(4),
    [`lum_${LB}`]: +m('B', 'lum').toFixed(4),
    [`lin_${LA}`]: +m('A', 'lin').toFixed(5),
    [`lin_${LB}`]: +m('B', 'lin').toFixed(5),
  });
}

const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 8) => String(v).padStart(n);
console.log(`# register ${REG}  ${W}x${H}  looks: A=${LA} B=${LB}`);
console.log(`# masks from ${IDMASK}, hue-classified then eroded 1px (4-conn)`);
console.log(`# classifier bound to idmap.json census: ${checked} families verified`);
console.log(`# exposures differ across looks -- compare S and WITHIN-FRAME ratios only`);
console.log(`${pad('family', 22)}${num('n', 8)}${num('S_' + LA)}${num('S_' + LB)}`
  + `${num('lum_' + LA)}${num('lum_' + LB)}`);
for (const r of out) {
  console.log(`${pad(r.family, 22)}${num(r.n, 8)}${num(r[`S_${LA}`])}${num(r[`S_${LB}`])}`
    + `${num(r[`lum_${LA}`])}${num(r[`lum_${LB}`])}`);
}

const ratios = [];
if (RATIO.length === 2) {
  const [p, q] = RATIO;
  const f = (nm) => out.find((r) => r.family === nm);
  const rp = f(p), rq = f(q);
  if (!rp || !rq) {
    console.log(`\n# ratio ${p}/${q}: NOT AVAILABLE at this register`
      + ` (${!rp ? p : q} below --min-px ${MINPX} or absent)`);
  } else {
    for (const L of [LA, LB]) {
      const lin = rp[`lin_${L}`] / rq[`lin_${L}`];
      const srgb = rp[`lum_${L}`] / rq[`lum_${L}`];
      ratios.push({ look: L, lin: +lin.toFixed(4), srgb: +srgb.toFixed(4) });
      console.log(`\n# ${p} / ${q} @ ${L}: linear ${lin.toFixed(4)}`
        + `  sRGB ${srgb.toFixed(4)}   (n ${rp.n} / ${rq.n})`);
    }
  }
}

if (JSON_OUT) {
  fs.writeFileSync(path.resolve(JSON_OUT), JSON.stringify({
    register: REG, width: W, height: H, looks: [LA, LB],
    idmask: IDMASK, dirs: [DIR_A, DIR_B], minPx: MINPX,
    censusVerified: checked, families: out, ratios,
  }, null, 2));
  console.log(`\nwrote ${path.resolve(JSON_OUT)}`);
}
