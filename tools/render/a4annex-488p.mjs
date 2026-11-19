// Copyright (c) Meta Platforms, Inc. and affiliates.

// a4annex-488p.mjs — builds the A4 SOLVED-POSE CROP ANNEX as pack bytes.
//
// WHY THIS EXISTS. Wave A5's ledger row NEW-A5a discloses that the wave M/N
// pocket-interior rebuild cannot be judged on the delivered wide orbit — at
// 1600x1000 and 8 bits the pocket interior is a few dozen dark codes — and
// says it "must be accepted on the A4 solved-pose crops" instead. Through
// A5-R2 those crops were SCRATCH FILES in /tmp: the disclosure pointed at
// bytes the reader of the pack could not open. That is a dangling acceptance
// surface, and wave A5-R3 item 1 closes it by making the crops pack files
// with provenance and INDEX rows like every other claim.
//
// WHAT IT PRODUCES, under --out:
//   a4-wide.png            the whole solved a4-out frame (context)
//   a4-pocket-zoom.png     the pocket mouth, 24 bore radii across
//   a4-puck-zoom.png       the plug puck + countersunk vent, 10 bore radii
//   a4-ann-render.png      the annotated render half of the pair
//   a4-ann-photo.png       the annotated photograph half of the pair
//   a4-ann-measurements.json  bore radii + the plateau evidence
//   a4rim/a4rim-*.png      the six rim registers (all four corners + both sides)
//   annex-manifest.json    registers, settings and sha256 of every file above
//
// CROPS ARE DERIVED, NOT PLACED. Every zoom is centred on the vent bore that
// a4annex-rings.py DETECTS, and its half-width is quoted in BORE RADII. So the
// crop box is a function of the image rather than of a person's taste, and it
// survives a re-render that moves the pocket by a few pixels. (The A5-R2-era
// scratch crops were cut by inline pixel boxes typed into a heredoc, which is
// exactly why they could not be regenerated; recorded here because that is the
// defect this file is fixing, not a detail.)
//
// THE PHOTOGRAPH IS NEVER COPIED IN. --photo points at the dossier file on
// Drive. Only its sha256 travels into the manifest, so the pack is verifiable
// against a reference it does not redistribute.
//
// Layer: render-only. Drives capture-488p-pose.mjs (which owns the frozen-rig
// settle gate) rather than re-implementing the capture, so an annex frame is
// admissible under the same rule as every other look-loop frame.
//
//   node tools/render/a4annex-488p.mjs --out DIR --photo FILE [--reuse DIR]
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync, writeFileSync, readFileSync, readdirSync, createReadStream,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { ANNEX_PURPOSE, ANNEX_PURPOSE_SOURCE } from './annex-purpose.mjs';

const REPO = path.resolve(import.meta.dirname, '../..');
const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : d;
};
const { pathOpt: __pathOpt, stringOpt: __stringOpt } = await import('./lib/argv.mjs'); // FIX2 (review round 2 on #731): option presence is not option value

const OUT = __pathOpt('--out', { default: '/tmp/ob488p/annex', tag: 'a4annex-488p' });
// the dossier photo: --photo, or OB_DRIVE_DIR (the project Drive folder) for the default closeup
const PHOTO_ARG = __pathOpt('--photo', { default: process.env.OB_DRIVE_DIR ? path.join(process.env.OB_DRIVE_DIR,
  'dossier-predator-apex/02-pocket-closeups/official-pocket-cushion-closeup.jpg') : null, tag: 'a4annex-488p', mustExist: 'file' });
if (!PHOTO_ARG) { console.error('a4annex-488p: pass --photo FILE or set OB_DRIVE_DIR to the project Drive folder'); process.exit(2); }
// absolute against the caller's cwd: run() starts every subprocess with cwd: REPO
const PHOTO = path.resolve(PHOTO_ARG);
// --reuse lets the pack build skip a second Chrome boot when the caller has
// already captured these registers at the same head; it is a cache, never a
// substitute, and the manifest records which path was taken.
const REUSE = __pathOpt('--reuse', { default: null, tag: 'a4annex-488p', mustExist: 'dir' });

// Capture size for the annex. The A4 solve worked at 1215x972 and the crops
// are quoted in bore radii off that solve; re-shooting at another size would
// silently change what "24 bore radii" frames.
const W = 1215;
const H = 972;

// The A4 solved registers, kernel frame [kx, ky, h]. `a4-out` is the register
// the pair is shot from: it stands at 62.2 deg elevation, which is the
// photograph's own elevation, so the bore is foreshortened the same amount in
// both halves of the pair and the scale normalisation carries no pose error.
const A4_REGISTERS = [
  { name: 'a4-out', cam: [0.97976, 0, 0.54844], look: [0.6906, 0, 0], fov: 30.83 },
  { name: 'a4rim-sideP', cam: [0.97976, 0, 0.54844], look: [0.6906, 0, 0], fov: 30.83 },
  { name: 'a4rim-sideM', cam: [-0.97976, 0, 0.54844], look: [-0.6906, 0, 0], fov: 30.83 },
  { name: 'a4rim-cnrPP', cam: [0.8601679275908474, 1.4951679275908474, 0.54844], look: [0.6557, 1.2907, 0], fov: 30.83 },
  { name: 'a4rim-cnrPM', cam: [0.8601679275908474, -1.4951679275908474, 0.54844], look: [0.6557, -1.2907, 0], fov: 30.83 },
  { name: 'a4rim-cnrMP', cam: [-0.8601679275908474, 1.4951679275908474, 0.54844], look: [-0.6557, 1.2907, 0], fov: 30.83 },
  { name: 'a4rim-cnrMM', cam: [-0.8601679275908474, -1.4951679275908474, 0.54844], look: [-0.6557, -1.2907, 0], fov: 30.83 },
];

// Zoom half-widths, in bore radii. Chosen so a4-pocket-zoom holds the whole
// pocket mouth and a4-puck-zoom holds the plug with a margin of surround.
// 22 rather than a rounder 24 because the bore sits 555.8 px down a 972 px
// frame: 24 radii runs 1 px off the bottom edge, and the crop step below
// REFUSES a box that leaves the frame rather than letting PIL pad it black.
// A silent black margin would read as pocket interior, which is the one thing
// these crops exist to let someone judge.
const ZOOMS = [
  { file: 'a4-pocket-zoom.png', bore_radii: 22.0, out_px: 1000 },
  { file: 'a4-puck-zoom.png', bore_radii: 10.0, out_px: 1000 },
];

mkdirSync(OUT, { recursive: true });
mkdirSync(path.join(OUT, 'a4rim'), { recursive: true });

const run = (cmd, args, env) => {
  const r = spawnSync(cmd, args, {
    cwd: REPO, stdio: 'inherit', env: { ...process.env, ...env },
  });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
  }
};

const RAW = REUSE ?? path.join(OUT, 'raw');
if (!REUSE) {
  mkdirSync(RAW, { recursive: true });
  const spec = path.join(OUT, 'a4-registers.json');
  writeFileSync(spec, JSON.stringify(A4_REGISTERS, null, 1));
  run(process.execPath, ['tools/render/capture-488p-pose.mjs', spec],
    { OB_488P_OUT: RAW, OB_488P_W: String(W), OB_488P_H: String(H) });
} else {
  console.log(`reusing captures from ${RAW}`);
}

// The pair first: it detects the bore, and every zoom below is cut about it.
run('python3', ['tools/render/a4annex-rings.py',
  '--render', path.join(RAW, 'a4-out.png'), '--photo', PHOTO, '--out', OUT]);
const meas = JSON.parse(
  readFileSync(path.join(OUT, 'a4-ann-measurements.json'), 'utf8'));
const bore = meas.render;

// Cut the derived crops with Python/PIL — the same imaging stack the pair uses,
// so a crop and its annotated counterpart cannot disagree about resampling.
const cropScript = `
import json, sys
from PIL import Image
raw, out = sys.argv[1], sys.argv[2]
bore = json.loads(sys.argv[3])
zooms = json.loads(sys.argv[4])
im = Image.open(raw).convert('RGB')
im.save(out + '/a4-wide.png')
for z in zooms:
    half = z['bore_radii'] * bore['bore_r_px']
    cx, cy = bore['bore_x'], bore['bore_y']
    box = (round(cx - half), round(cy - half), round(cx + half), round(cy + half))
    if box[0] < 0 or box[1] < 0 or box[2] > im.width or box[3] > im.height:
        raise SystemExit('%s: crop %s leaves the %dx%d frame — PIL would pad it '
                         'black and the margin would read as pocket interior. '
                         'Lower bore_radii or re-solve the register.'
                         % (z['file'], box, im.width, im.height))
    im.crop(box).resize((z['out_px'], z['out_px']), Image.LANCZOS).save(out + '/' + z['file'])
    print('%-20s %s  half=%.1f px (%.0f bore radii)' % (z['file'], box, half, z['bore_radii']))
`;
run('python3', ['-c', cropScript, path.join(RAW, 'a4-out.png'), OUT,
  JSON.stringify(bore), JSON.stringify(ZOOMS)]);

// The six rim registers travel whole: they are context for the pair, and
// cropping them would throw away the very rim continuity they are here to show.
const rimCopy = `
import shutil, sys, os
raw, out = sys.argv[1], sys.argv[2]
for n in sorted(os.listdir(raw)):
    if n.startswith('a4rim-') and n.endswith('.png'):
        shutil.copyfile(os.path.join(raw, n), os.path.join(out, 'a4rim', n))
        print('rim ' + n)
`;
run('python3', ['-c', rimCopy, RAW, OUT]);

const sha256 = (p) => new Promise((res, rej) => {
  const h = createHash('sha256');
  createReadStream(p).on('data', (d) => h.update(d))
    .on('end', () => res(h.digest('hex'))).on('error', rej);
});

const files = {};
for (const f of ['a4-wide.png', 'a4-pocket-zoom.png', 'a4-puck-zoom.png',
  'a4-ann-render.png', 'a4-ann-photo.png', 'a4-ann-measurements.json']) {
  files[f] = await sha256(path.join(OUT, f));
}
for (const n of readdirSync(path.join(OUT, 'a4rim')).sort()) {
  files[`a4rim/${n}`] = await sha256(path.join(OUT, 'a4rim', n));
}

const git = (a) => spawnSync('git', a, { cwd: REPO, encoding: 'utf8' }).stdout.trim();
const manifest = {
  annex: 'a4-solved-pose-crops',
  purpose: ANNEX_PURPOSE,
  purpose_source: ANNEX_PURPOSE_SOURCE,
  capture: {
    width: W, height: H, registers: A4_REGISTERS, reused_from: REUSE,
    rig: 'app.html?table=predator_apex_9ft&cinema=1&seed=7&look=default, GI bakeClass pool, fixture pdt_studio',
    balls_hidden: true,
  },
  crops: {
    convention: ('every zoom is centred on the DETECTED vent bore and its '
      + 'half-width is quoted in bore radii, so the box is a function of the '
      + 'image rather than a hand-placed pixel rectangle'),
    bore_render_px: bore, zooms: ZOOMS,
  },
  pair: {
    convention: meas.convention,
    not_a_measurement: meas.not_a_measurement,
    threshold_is_a_plateau: meas.threshold_is_a_plateau,
    photo_source_sha256: meas.photo_source_sha256,
    photo_licence: meas.photo_licence,
  },
  git_commit: git(['rev-parse', 'HEAD']),
  web_tree_object: git(['rev-parse', 'HEAD:web']),
  files,
};
writeFileSync(path.join(OUT, 'annex-manifest.json'),
  JSON.stringify(manifest, null, 1));
console.log(`\nA4ANNEX-488P: wrote ${Object.keys(files).length} files + manifest to ${OUT}`);
