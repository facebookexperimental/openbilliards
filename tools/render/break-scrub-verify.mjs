// Copyright (c) Meta Platforms, Inc. and affiliates.

// break-scrub-verify.mjs — contract check for site/assets/break-scrub/
// (producer: break-scrub.mjs). Asserts exactly what the site consumer
// relies on: manifest parses and is internally consistent, both frame dirs
// match pattern/count/dimensions, byte budgets hold, beats/events land
// inside the frame range, every beat hold is exactly 0 (strict-linear
// ruling 2026-07-08: u = p, holds banned), and the high-speed reshoot spec
// holds (core-only 1.2-1.6 s window, 220-260 frames, <= 15 ms gaps,
// <= 2 ms beat approach). Exits non-zero with a reason on any violation.
//
//   node tools/render/break-scrub-verify.mjs
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(repoDir, 'site/assets/break-scrub');
const fail = (m) => { console.error(`VERIFY FAILED: ${m}`); process.exit(1); };
const ok = (m) => console.log(`[ok] ${m}`);

const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
const { version, frameCount, desktop, mobile, poster, simDuration,
  frameTimes, beats, events } = manifest;

if (version !== 1) fail(`version ${version} != 1`);
if (!Number.isInteger(frameCount) || frameCount < 1) fail('bad frameCount');
if (!Array.isArray(frameTimes) || frameTimes.length !== frameCount) {
  fail(`frameTimes length ${frameTimes?.length} != frameCount ${frameCount}`);
}
for (let i = 1; i < frameCount; i++) {
  if (!(frameTimes[i] > frameTimes[i - 1])) fail(`frameTimes not increasing at ${i}`);
}
if (frameTimes[0] !== 0) fail(`frameTimes[0] ${frameTimes[0]} != 0`);
if (Math.abs(frameTimes[frameCount - 1] - simDuration) > 1e-6) {
  fail(`last frameTime ${frameTimes[frameCount - 1]} != simDuration ${simDuration}`);
}
// high-speed reshoot spec: the record window covers the CORE action only
// (contact 0.1146 -> mid-spread freeze somewhere in 1.2-1.6 s) at 220-260
// crisp frames — temporal density carries the motion, not shutter blur
if (!(simDuration >= 1.2 && simDuration <= 1.6)) {
  fail(`simDuration ${simDuration} outside the 1.2-1.6 s spec window`);
}
if (!(frameCount >= 220 && frameCount <= 260)) {
  fail(`frameCount ${frameCount} outside the 220-260 spec window`);
}
// scrub continuity contract: no inter-frame gap wider than 15 ms anywhere,
// and the four moving beats must be approached at high-speed spacing
for (let i = 1; i < frameCount; i++) {
  if (frameTimes[i] - frameTimes[i - 1] > 0.0151) {
    fail(`frame gap ${(frameTimes[i] - frameTimes[i - 1]) * 1e3} ms at ${i} > 15 ms`);
  }
}
ok(`manifest: ${frameCount} frames, simDuration ${simDuration} s, monotonic frameTimes`);

const budgets = { frames: 6 * 1024 * 1024, 'frames-m': 2.5 * 1024 * 1024 };
for (const [key, spec] of [['desktop', desktop], ['mobile', mobile]]) {
  if (spec.pattern !== 'f####.webp') fail(`${key} pattern ${spec.pattern}`);
  const fdir = path.join(dir, spec.dir);
  const files = fs.readdirSync(fdir).filter((f) => f.endsWith('.webp')).sort();
  if (files.length !== frameCount) {
    fail(`${spec.dir}: ${files.length} webp files != frameCount ${frameCount}`);
  }
  for (let i = 0; i < frameCount; i++) {
    const want = `f${String(i).padStart(4, '0')}.webp`;
    if (files[i] !== want) fail(`${spec.dir}: expected ${want}, found ${files[i]}`);
  }
  const size = files.reduce((s, f) => s + fs.statSync(path.join(fdir, f)).size, 0);
  if (size > budgets[spec.dir]) {
    fail(`${spec.dir}: ${(size / 1024 / 1024).toFixed(2)} MB over the `
      + `${(budgets[spec.dir] / 1024 / 1024).toFixed(1)} MB budget`);
  }
  // every frame must decode at the declared dimensions
  const dims = execFileSync('python3', ['-c', `import os, sys
from PIL import Image
d = sys.argv[1]
sizes = {Image.open(os.path.join(d, f)).size for f in os.listdir(d) if f.endswith('.webp')}
print(';'.join(f'{w}x{h}' for (w, h) in sorted(sizes)))`, fdir]).toString().trim();
  if (dims !== `${spec.width}x${spec.height}`) {
    fail(`${spec.dir}: decoded sizes {${dims}} != declared ${spec.width}x${spec.height}`);
  }
  ok(`${spec.dir}: ${frameCount} frames @ ${dims}, `
    + `${(size / 1024 / 1024).toFixed(2)} MB <= ${(budgets[spec.dir] / 1024 / 1024).toFixed(1)} MB `
    + `(${(size / frameCount / 1024).toFixed(1)} KB/frame avg)`);
}

if (!fs.existsSync(path.join(dir, poster))) fail(`poster ${poster} missing`);
ok(`poster ${poster} present (${(fs.statSync(path.join(dir, poster)).size / 1024).toFixed(0)} KB)`);

// beat roster since the issue-#20 reshoot: the seed-19 record pockets
// nothing, so the fifth beat is the settle-tail pack-blossom 'spread'
// dwell (voiced by the sanctioned derived Spread mark), not a pocket drop
const beatIds = beats.map((b) => b.id);
for (const id of ['strike', 'contact', 'apex', 'land', 'spread']) {
  if (!beatIds.includes(id)) fail(`beat '${id}' missing`);
}
for (const b of beats) {
  if (!Number.isInteger(b.frame) || b.frame < 0 || b.frame >= frameCount) {
    fail(`beat ${b.id} frame ${b.frame} out of range`);
  }
  // holds-are-zero law (product-owner ruling 2026-07-08, strict-linear
  // scrub binding u = p): scroll and record time are bound 1:1, du/dp
  // constant and never zero — holds are banned outright, superseding the
  // old per-hold 0.15 cap and 0.30 total budget. The hold field stays in
  // the contract shape; its value must be exactly 0. Beat emphasis is
  // carried by frame density (the <= 2 ms beat-approach gate below) and
  // the consumer's tick ignition only.
  if (b.hold !== 0) fail(`beat ${b.id} hold ${b.hold} != 0 (holds are banned)`);
  // every moving beat sits at the dense end of its segment: the frame
  // BEFORE a beat may be at most 2 ms away (the high-speed contract)
  if (b.frame > 0 && frameTimes[b.frame] - frameTimes[b.frame - 1] > 0.002 + 1e-9) {
    fail(`beat ${b.id} approached at ${(frameTimes[b.frame] - frameTimes[b.frame - 1]) * 1e3} ms > 2 ms`);
  }
}
ok(`beats: ${beats.map((b) => `${b.id}@f${b.frame}`).join(' ')}`);

if (!events.length) fail('events empty');
for (const e of events) {
  if (!Number.isInteger(e.frame) || e.frame < 0 || e.frame >= frameCount) {
    fail(`event '${e.label}' frame ${e.frame} out of range`);
  }
  // the terminal Rest mark prints the record's OWN settle time, which lies
  // PAST the render window by design (the design charter scrub grammar, taste round
  // 3: a Rest stamped with the window's end time is a fabricated event
  // time); it must sit on the window's last frame and its t is
  // cross-checked against record.json durationSec below.
  const terminalRest = e.kind === 'Rest' && e.frame === frameCount - 1;
  if (!(e.t >= 0 && (e.t <= simDuration || terminalRest))) {
    fail(`event '${e.label}' t ${e.t} out of range`);
  }
  if (!e.kind || !e.label) fail(`event at t=${e.t} missing kind/label`);
  // the stored frame must actually be the nearest frame to e.t
  let best = 0;
  for (let i = 1; i < frameCount; i++) {
    if (Math.abs(frameTimes[i] - e.t) < Math.abs(frameTimes[best] - e.t)) best = i;
  }
  if (best !== e.frame) fail(`event '${e.label}' frame ${e.frame}, nearest is ${best}`);
}
ok(`events: ${events.length} in range, frames nearest-consistent`);

// provenance record must carry the airborne + spread evidence
const rec = JSON.parse(fs.readFileSync(path.join(dir, 'record.json'), 'utf8'));
if (!rec.kernelVersion) fail('record.json missing kernelVersion');
// the site's provenance plate reads manifest.kernel — must match the record
if (manifest.kernel !== rec.kernelVersion) {
  fail(`manifest.kernel ${manifest.kernel} != record kernelVersion ${rec.kernelVersion}`);
}
if (!(rec.gates.hopApexM > 0.1)) fail(`record hop apex ${rec.gates.hopApexM} m <= 0.1`);
if (!(rec.gates.rackSpreadEndM > 0.4)) fail(`record spread ${rec.gates.rackSpreadEndM} m <= 0.4`);
// every-ball-moves gates (issue #20 reshoot: the record must not carry a
// conduction-starved parked ball) — the producer measures net planar
// displacement from the rack pose for EVERY ball; the record must evidence
// >= 2 ball diameters by the render window's end and >= 0.25 m by Rest
if (!(rec.gates.minNetWindowM >= 0.114)) {
  fail(`record min net displacement by window end ${rec.gates.minNetWindowM} m `
    + `< 0.114 m (2 ball diameters) — ball ${rec.gates.minNetWindowBall} reads as parked`);
}
if (!(rec.gates.minNetRestM >= 0.25)) {
  fail(`record min net displacement by Rest ${rec.gates.minNetRestM} m < 0.25 m `
    + `— ball ${rec.gates.minNetRestBall} reads as parked`);
}
// the terminal Rest mark's printed time must BE the record's settle time
// (durationSec = the kernel Rest event) — never the render window's end
const restEv = events.find((e) => e.kind === 'Rest');
if (!restEv) fail('terminal Rest event missing');
if (restEv.frame !== frameCount - 1) {
  fail(`Rest frame ${restEv.frame} != last frame ${frameCount - 1}`);
}
if (Math.abs(restEv.t - rec.durationSec) > 5e-4) {
  fail(`Rest t ${restEv.t} != record durationSec ${rec.durationSec}`);
}
ok(`record.json: kernel ${rec.kernelVersion}, hop apex `
  + `${(rec.gates.hopApexM * 1e3).toFixed(0)} mm, spread ${rec.gates.rackSpreadEndM} m, `
  + `min net displacement ${rec.gates.minNetWindowM} m by window / `
  + `${rec.gates.minNetRestM} m by Rest, `
  + `Rest t ${restEv.t} = durationSec ${rec.durationSec.toFixed(4)}`);

// crop-band gate (fix round 2; the design charter scrub grammar "cover-crop
// guard"): the site module's anchored cover crop (site/assets/motion.js)
// must never let a band edge cross a ball in the five beat frames + the
// last 10 frames at ANY stage aspect the module permits — the canvas box
// aspect is floored at ASPECT_MIN (height cap) and the stage capped at
// ASPECT_MAX (width cap), the y band bottom pins at CROP_B and the x
// band right edge pins at CROP_X (the source right edge: all x-crop
// comes off the left). Each band edge sweeps MONOTONICALLY from the full
// frame at 16:9 to its extreme at the cap/floor, so clearing the four
// extremes clears the whole continuum:
//   bottom edge min = CROP_B                       (y pin)
//   top    edge max = CROP_B − (16/9)/ASPECT_MAX   (deepest wide crop)
//   right  edge min = CROP_X                       (x pin)
//   left   edge max = CROP_X − ASPECT_MIN/(16/9)   (deepest narrow crop)
// Measured on the SHIPPED frames, not trusted from a sidecar: the
// producer's framing.json carries analytic kernel-sphere seed boxes; a
// PIL pass measures each ball's real pixel silhouette inside its padded
// window (color distance vs the window-border cloth median, grain-safe
// threshold — the retune lane's method) and every silhouette must clear
// every extreme edge by >= 10 source px (desktop scale; the mobile dir
// is the same composition, checked at the equivalent fraction).
const CROP_B = 0.845, CROP_X = 1, ASPECT_MAX = 3.2, ASPECT_MIN = 1.6;
const framing = JSON.parse(fs.readFileSync(path.join(dir, 'framing.json'), 'utf8'));
const gateFrames = new Set(beats.map((b) => b.frame));
for (let f = frameCount - 10; f < frameCount; f++) gateFrames.add(f);
if (framing.frames.length !== gateFrames.size
  || framing.frames.some((fr) => !gateFrames.has(fr.frame))) {
  fail(`framing.json frames [${framing.frames.map((fr) => fr.frame)}] != `
    + `beat frames + last 10 [${[...gateFrames].sort((a, b) => a - b)}]`);
}
const cropPy = `import sys, json
import numpy as np
from PIL import Image
dirp, pattern, framing = sys.argv[1], sys.argv[2], json.load(open(sys.argv[3]))
srcAspect = 16 / 9
CROP_B, CROP_X = ${CROP_B}, ${CROP_X}
edges = {  # extreme band-edge positions over the permitted aspect continuum
    'top':    CROP_B - srcAspect / ${ASPECT_MAX},
    'bottom': CROP_B,
    'left':   CROP_X - ${ASPECT_MIN} / srcAspect,
    'right':  CROP_X,
}
bad, ext = [], {'x0': 1e9, 'x1': -1e9, 'y0': 1e9, 'y1': -1e9}
for fr in framing['frames']:
    fname = pattern.replace('####', '%04d' % fr['frame'])
    img = np.asarray(Image.open(f'{dirp}/{fname}').convert('RGB'), dtype=np.float32)
    H, W = img.shape[:2]
    mx, my = 10 * (W / 1600) / W, 10 * (H / 900) / H  # 10 source-desktop px
    for b in fr['balls']:
        cx, cy = (b['x0'] + b['x1']) / 2 * W, (b['y0'] + b['y1']) / 2 * H
        rx, ry = (b['x1'] - b['x0']) / 2 * W, (b['y1'] - b['y0']) / 2 * H
        x0 = int(max(0, cx - 2 * rx)); x1 = int(min(W, cx + 2 * rx))
        y0 = int(max(0, cy - 2 * ry)); y1 = int(min(H, cy + 2 * ry))
        if x1 - x0 < 3 or y1 - y0 < 3:
            continue
        win = img[y0:y1, x0:x1]
        border = np.concatenate([win[0], win[-1], win[:, 0], win[:, -1]])
        cloth = np.median(border, axis=0)
        mask = np.sqrt(((win - cloth) ** 2).sum(axis=2)) > 34
        ys, xs = np.nonzero(mask)
        if not len(ys):  # nothing over threshold: fall back to the seed box
            s = dict(x0=b['x0'], x1=b['x1'], y0=b['y0'], y1=b['y1'])
        else:
            s = dict(x0=(x0 + xs.min()) / W, x1=(x0 + xs.max() + 1) / W,
                     y0=(y0 + ys.min()) / H, y1=(y0 + ys.max() + 1) / H)
        ext['x0'] = min(ext['x0'], s['x0']); ext['x1'] = max(ext['x1'], s['x1'])
        ext['y0'] = min(ext['y0'], s['y0']); ext['y1'] = max(ext['y1'], s['y1'])
        for cond, name in [(s['y1'] > edges['bottom'] - my, 'bottom'),
                           (s['y0'] < edges['top'] + my, 'top'),
                           (s['x1'] > edges['right'] - mx, 'right'),
                           (s['x0'] < edges['left'] + mx, 'left')]:
            if cond:
                bad.append(f"f{fr['frame']:04d} ball {b['id']} vs {name} edge "
                           f"{edges[name]:.4f}: silhouette "
                           f"[{s['x0']:.4f},{s['x1']:.4f}]x[{s['y0']:.4f},{s['y1']:.4f}]")
print(json.dumps({'bad': bad, 'ext': {k: round(v, 4) for k, v in ext.items()},
                  'edges': {k: round(v, 4) for k, v in edges.items()}}))
sys.exit(1 if bad else 0)
`;
for (const spec of [desktop, mobile]) {
  let out;
  try {
    out = execFileSync('python3', ['-c', cropPy, path.join(dir, spec.dir),
      spec.pattern, path.join(dir, 'framing.json')]).toString().trim();
  } catch (e) {
    const r = JSON.parse((e.stdout ?? '').toString().trim() || '{"bad":["(no output)"]}');
    fail(`${spec.dir}: crop band crosses a ball —\n  ` + r.bad.join('\n  '));
  }
  const r = JSON.parse(out);
  ok(`${spec.dir}: crop bands clear all silhouettes `
    + `x [${r.ext.x0}, ${r.ext.x1}] y [${r.ext.y0}, ${r.ext.y1}] vs edges `
    + `left ${r.edges.left} right ${r.edges.right} top ${r.edges.top} `
    + `bottom ${r.edges.bottom} (>= 10 source px)`);
}

console.log('VERIFY PASSED');
