#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-snapshot-site-hold.mjs — the public snapshot's site physics set.
//
// scripts/opensource/sync-public-snapshot holds the site physics set at a pinned private rev
// (manifest HOLD_REV / HOLD_FILES: the snapshot does not take re-rendered site clips until their
// review concludes) and regenerates physics-data.json and the generated page regions instead of
// editing them as text. This arm models the public tree of that set at --rev (default HEAD)
// through the sync's own helper (export_paths.py, the one the competitor gate's snapshot arm
// uses: exported paths come from it, verbatim paths keep their --rev blob) and asserts:
//   H0  the manifest's hold and the excluded site set are exactly the ones pinned below
//       (EXPECTED_HOLD, EXPECTED_EXCLUDED_SITE): moving, narrowing or lifting the hold, or
//       un-excluding a drag-shot file, needs a deliberate edit here;
//   H1  every held path exists at HOLD_REV and at --rev;
//   H2  every held path ships what the pipeline makes of its HOLD_REV blob (media: that blob,
//       byte for byte);
//   H3  nothing the pipeline would ship WITHOUT the hold (the export of --rev through a copy of
//       the pipeline with HOLD_FILES emptied, where it differs) appears in the modelled site tree;
//   H4  no excluded site path ships, and no shipped site output names an excluded id;
//   H5  the modelled tree passes its own `node scripts/site-physics-data.mjs --check`;
//   H6  the export loop's own writer (sync.write_export, the code that writes the public
//       checkout) writes every held path exactly as the model ships it; and sync.main() exports
//       through it, takes its change set from sync.public_changed and regenerates the site outputs
//       with sync.regen_public_site before the battery (static checks of main's body);
//   H7  the change detection (sync.held_changes, sync.public_changed): with a base whose manifest
//       has this hold (a sync after this lands), no held path counts as changed; from the recorded
//       last-sync-base (no hold yet), exactly the held paths whose blob differs from HOLD_REV's,
//       also through public_changed (whose plain base..rev diff lists every re-rendered path);
//       with the hold lifted (HOLD_FILES emptied in a pipeline copy), exactly the held paths
//       whose --rev blob differs from HOLD_REV's;
//   H8  sync.regen_public_site restores a generated output edited as text in a modelled public
//       checkout (the in-place regeneration every sync runs);
//   H9  the neutral draw-arc caption keeps the original public master and changes
//       only that clip, its record and the held media ledger.
//   H10 the held-text patch (manifest HELD_TEXT_PATCHES): every row names a held
//       path and its HOLD_REV blob and changes its text (H0 pins this; with no hold there are no rows); each patched text
//       ships without its old string and without a BATTERY marker; and the site outputs built over the
//       UNPATCHED texts (a pipeline copy with no rows) equal the modelled outputs byte for byte.
//   H11 a judgment port's base side (port-judgment.base_export) carries the base's own patch policy with its hold:
//       from the recorded last-sync-base unless it has rows of its own, from ROWLESS_BASE (this hold, no rows yet)
//       and from HOLDLESS_BASE (no hold, no rows), every patched path exports exactly as the pipeline makes it under
//       that base's hold with NO rows, and nothing refuses
// --selftest then plants, each where it must be caught, and requires the named assertion red:
//   P1  a re-rendered pack file over its held path (the --rev blob when one differs, else a
//       one-byte mutation of the held blob) -> H2, and H3 for a real one
//   P2  the whole model rebuilt through the hold-emptied pipeline copy -> H2 (needs a held path
//       whose --rev blob differs; otherwise reported as vacuous; its H3 hits are by construction,
//       so H3 is planted independently by P1's raw --rev blob)
//   P3  a generated output edited as text (for example the teaser's scenario count) -> H5
//   P4  an excluded site file planted into the tree, and an excluded id written into SOURCES.md
//       -> H4 (both halves)
//   P5  a pipeline copy whose shipped_blob ignores the hold -> H6
//   P6  a pipeline copy with the earlier change detection (the base's blob instead of the source
//       the base sync shipped) -> H7
//   P7  a manifest copy whose hold drops SOURCES.md -> H0
//   P8  a pipeline copy whose main() takes the plain base..rev diff as its change set -> H6
//   P9  a pipeline copy whose main() no longer regenerates the site outputs -> H6
//   P10 a pipeline copy whose regen_public_site does nothing -> H8
//   P11 site_outputs with physics-data.json dropped from the ship set (the footer link in a generated
//       region would then be de-linked by the rewrite) must refuse: the fixed-point guard
//   P14 a held-text row with another blob id, P15 one whose count differs, P16 one whose new text
//       carries a BATTERY marker, P18 one that cannot change its text (count 0): each export must refuse
//   P17 the unread-field check: junk in every patched record's anchor.battery and anchor.sources
//       keeps H5 green (the generator does not read them); a changed anchor.predictedDeg turns H5
//       red (the check is live)
//   P19 a pipeline copy whose base side takes this manifest's rows -> H11 (from ROWLESS_BASE)
//   P20 a pipeline copy whose patch selection reads this manifest's rows and hold, whatever the export is
//       computed under -> H11 (from HOLDLESS_BASE the base export of SOURCES.md refuses on its blob id; H11's own
//       no-rows reference is computed by the same planted code, so the silent patches of the other paths stay
//       for the as-before check, which compares against the pre-patch pipeline itself)
//
// Usage: node tools/test-snapshot-site-hold.mjs [--rev <rev>] [--sync-dir <dir>] [--selftest]
//   --sync-dir: the pipeline under test (default scripts/opensource/sync-public-snapshot): a copy
//   with one fix reverted must turn the arm red (the planted-red recipe for this pipeline).
// Exit 0 green, 1 red, 2 could not run. Private tree only: the public snapshot excludes
// scripts/opensource, so there the arm prints a named SKIP (positive evidence: the rev's tree
// lacks the helper) and exits 0. Needs HOLD_REV, the last sync base and H11's two pinned bases in
// the object store (CI: fetch-depth 0, site-data.yml).

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---- the pinned hold (main 30b62641 by blob identity) ----------------------
// Lifting the hold: set this to null together with manifest HOLD_FILES = set().
const EXPECTED_HOLD = {
  rev: 'ac379d733874acdfc9319a7eb926e940a3557ffd',
  ids: ['thirty-rule', 'ninety-rule', 'gearing-zero-throw', 'squirt-endmass', 'cit-throw-curve',
    'ten-times-fuller', 'cling-chalk-skid', 'sidespin-kicks', 'draw-arc-ladder', 'wpa-lag',
    'bank-ladder-b28', 'corner-5-three-rail', 'jump-min-elevation', 'masse-bar-aiming', 'break-squat'],
  extra: ['site/assets/physics/SOURCES.md'],
};
// The caption amendment keeps the original public simulation plates and every
// other held asset. A new caption must not silently lift the presentation hold.
const CAPTION_BASE = '30b6264110a0c7cec52109b045ad7e49a21ef98f';
const DRAW_CAPTION = 'DRAW-ARC POWER LADDER · THREE CUT SHOTS AT INCREASING CUE SPEED';
const DRAW_HELD_MASTER = '9e72e3c36202fa5ba29619f89f4ce555a5d72f441e5a6b8e601c10760f62c3e2';
// H11's held base without rows: main at c8127162, the last main before HELD_TEXT_PATCHES (its manifest has the hold
// above and no rows; H11 refuses the pin if either changes)
const ROWLESS_BASE = 'c81271629880b49c2d7c8cb9d973609d6c8c7e63';
// H11's base with neither a hold nor rows: main at 5da70a30, the sync base recorded before c20228cf (pipeline v3).
// P20 shows only where this manifest's rows meet a blob the base's own hold does not ship from HOLD_REV (SOURCES.md
// here); since c20228cf the recorded base has this hold and these rows, so this base is pinned (H11 refuses the pin
// if its manifest has either)
const HOLDLESS_BASE = '5da70a307f14e5976123b31b2756b579e6d5a2d7';
const EXPECTED_EXCLUDED_SITE = ['site/assets/physics/drag-shot-gates.json', 'site/assets/physics/drag-shot-poster.webp',
  'site/assets/physics/drag-shot.mp4', 'site/assets/physics/preview/drag-shot-preview.mp4'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SYNC = 'scripts/opensource/sync-public-snapshot';
const HELPER = `${SYNC}/export_paths.py`;
const GEN = 'scripts/site-physics-data.mjs';
const SITE = 'site/assets/physics/';
const PAGES = ['site/docs/physics.html', 'site/index.html'];
const OUTPUTS = [`${SITE}physics-data.json`, ...PAGES];
const SUFFIXES = ['.mp4', '-poster.webp', '-gates.json'];

// every scratch dir lives under one parent per run; the arm is synchronous, so a signal ends it
// before any listener could run — the next run removes the parents of runs that are gone
for (const n of readdirSync(tmpdir())) {
  const m = n.match(/^obw-site-hold-(\d+)-/);
  if (!m) continue;
  try { process.kill(Number(m[1]), 0); } catch (e) { if (e.code === 'ESRCH') rmSync(join(tmpdir(), n), { recursive: true, force: true }); }
}
const PARENT = mkdtempSync(join(tmpdir(), `obw-site-hold-${process.pid}-`));
process.on('exit', () => rmSync(PARENT, { recursive: true, force: true }));
const die = (why) => { process.stdout.write(`snapshot site-hold: could not run — ${why}\n`); process.exit(2); };
const argv = process.argv.slice(2);
let revArg = 'HEAD';
let selftest = false;
let syncArg = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--selftest') selftest = true;
  else if (argv[i] === '--rev' || argv[i] === '--sync-dir') {
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) die(`${argv[i - 1]} needs a value`);
    if (argv[i - 1] === '--rev') revArg = v; else syncArg = v;
  } else die(`unknown argument '${argv[i]}'`);
}

const git = (args) => execFileSync('git', ['-C', ROOT, ...args], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
const gitText = (args) => git(args).toString('utf8').trim();
let REV;
try { REV = gitText(['rev-parse', '--verify', '--quiet', `${revArg}^{commit}`]); } catch { REV = ''; }
if (!REV) die(`--rev ${revArg} does not resolve to a commit`);
if (!gitText(['ls-tree', '--name-only', REV, '--', HELPER])) {
  process.stdout.write(`snapshot site-hold: SKIP — ${HELPER} is not in ${REV.slice(0, 9)}'s tree `
    + `(the public snapshot excludes ${SYNC})\n`);
  process.exit(0);
}
if (gitText(['rev-parse', '--show-object-format']) !== 'sha1') die('the blob census below assumes a sha1 repository');
const hasCommit = (r) => { try { git(['cat-file', '-e', `${r}^{commit}`]); return true; } catch { return false; } };
const SYNC_DIR = syncArg ? resolve(syncArg) : join(ROOT, SYNC);
for (const f of ['sync.py', 'manifest.py', 'export_paths.py']) {
  try { readFileSync(join(SYNC_DIR, f)); } catch { die(`--sync-dir ${SYNC_DIR} has no ${f}`); }
}

const mkScratch = (tag) => mkdtempSync(join(PARENT, `${tag}-`));
// a copy of the pipeline (the *.py of the sync dir) with text appended to some files
function pipelineCopy(tag, appends) {
  const d = mkScratch(tag);
  for (const n of readdirSync(SYNC_DIR)) if (n.endsWith('.py')) copyFileSync(join(SYNC_DIR, n), join(d, n));
  for (const [file, text] of Object.entries(appends)) writeFileSync(join(d, file), `${readFileSync(join(d, file), 'utf8')}\n${text}\n`);
  return d;
}
const py = (syncDir, code, args, input) => {
  const r = spawnSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, sys.argv[1]); ${code}`, syncDir, ...args],
    { cwd: ROOT, encoding: 'utf8', input, maxBuffer: 1 << 26 });
  if (r.status !== 0) die(`python3 (${syncDir === SYNC_DIR ? 'pipeline' : 'pipeline copy'}): ${(r.stderr || r.stdout).trim().split('\n').slice(-3).join(' | ')}`);
  return r.stdout;
};
const readManifest = (syncDir) => JSON.parse(py(syncDir, 'import manifest as M; '
  + 'print(json.dumps({"rev": M.HOLD_REV, "ids": list(M.HOLD_SITE_IDS), "files": sorted(M.HOLD_FILES), '
  + '"patches": [list(r) for r in M.HELD_TEXT_PATCHES]}))', []));
const man = readManifest(SYNC_DIR);
const HOLD = man.rev;
const held = man.files;
const holding = held.length > 0;
if (holding && !hasCommit(HOLD)) die(`HOLD_REV ${HOLD} is not in the object store (a shallow checkout?)`);

const blob = (rev, p) => git(['cat-file', 'blob', `${rev}:${p}`]);
const gitBlobSha = (buf) => createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex');
const treeShas = (rev, ...prefixes) => new Map(gitText(['ls-tree', '-r', rev, '--', ...prefixes]).split('\n').filter(Boolean)
  .map((l) => { const [meta, p] = l.split('\t'); return [p, meta.split(' ')[2]]; }));
const sitePaths = (rev) => [...treeShas(rev, SITE).keys(), ...PAGES, GEN];

function exportPaths(rev, paths, syncDir, out) {
  const r = spawnSync('python3', ['-I', join(syncDir, 'export_paths.py'), '--rev', rev, '--out', out],
    { cwd: ROOT, input: paths.join('\n'), encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) die(`export_paths.py --rev ${rev.slice(0, 9)}: ${(r.stderr || r.stdout).trim()}`);
  return JSON.parse(r.stdout);
}
// a full modelled site tree: exported paths from the helper, verbatim paths from the rev
function buildModel(tag, rev, syncDir) {
  const dir = mkScratch(tag);
  const res = exportPaths(rev, sitePaths(rev), syncDir, dir);
  for (const p of res.verbatim) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), blob(rev, p));
  }
  return { dir, res };
}
function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full)); else out.push(full);
  }
  return out;
}
const readOr = (f) => { try { return readFileSync(f); } catch { return null; } };

// ---- the models ----------------------------------------------------------------------------
const MODEL = buildModel('model', REV, SYNC_DIR);
const revShas = treeShas(REV, SITE);
const holdShas = holding ? treeShas(HOLD, SITE) : new Map();
const NOHOLD_DIR = holding ? pipelineCopy('nohold', { 'manifest.py': 'HOLD_FILES = set()' }) : null;
const NOHOLD = holding ? buildModel('nohold-model', REV, NOHOLD_DIR) : null;
// the held texts without their patch: the site outputs built over them must equal the model's (H10)
const patches = man.patches;
const NOPATCH = holding && patches.length ? buildModel('nopatch-model', REV, pipelineCopy('nopatch', { 'manifest.py': 'HELD_TEXT_PATCHES = []' })) : null;
// what the pipeline makes of each held path's HOLD_REV blob
const expectHeld = new Map();
if (holding) {
  const out = mkScratch('hold');
  const present = held.filter((p) => holdShas.has(p));
  const r = exportPaths(HOLD, present, SYNC_DIR, out);
  for (const p of present) expectHeld.set(p, r.verbatim.includes(p) ? blob(HOLD, p) : readFileSync(join(out, p)));
}
// forbidden = what would ship without the hold, wherever it differs from the held model
const forbidden = new Map();
if (holding) {
  for (const f of walk(join(NOHOLD.dir, 'site'))) {
    const rel = relative(NOHOLD.dir, f);
    const mine = readOr(join(MODEL.dir, rel));
    const theirs = readFileSync(f);
    if (!mine || !mine.equals(theirs)) forbidden.set(gitBlobSha(theirs), rel);
  }
}
const isMedia = (p) => /\.(mp4|webp)$/.test(p);
const reRenderedHeld = held.filter((p) => isMedia(p) && revShas.get(p) && holdShas.get(p) && revShas.get(p) !== holdShas.get(p));
const excludedSite = MODEL.res.excluded.filter((p) => p.startsWith(SITE)).sort();
const excludedIds = [...new Set(excludedSite.map((p) => p.slice(SITE.length).replace(/^preview\//, '')
  .replace(/(-preview\.mp4|-poster\.webp|-gates\.json|\.mp4)$/, '')))];

// the export loop's writer and change detection, through a given pipeline dir
const ARM = 'import sync as S, manifest as M; import subprocess; '
  + 'rev = sys.argv[2]; tracked = subprocess.run(["git", "ls-tree", "-r", "--name-only", rev], capture_output=True, text=True, check=True).stdout.splitlines(); '
  + 'S.SHIP_SET.update(p for p in tracked if not S.excluded(p) and p not in M.PUBLIC_ONLY and p not in M.PUBLIC_PINNED); '
  + 'S.PUB_SET.update(M.PUBLIC_ONLY + M.PUBLIC_PINNED); S.EXPORT_REV = rev; ';
function writerOutput(syncDir, paths) {
  const out = mkScratch('writer');
  py(syncDir, `${ARM}out = sys.argv[3]; [S.write_export(out, p, rev, "100644") for p in sys.stdin.read().split()]`, [REV, out], paths.join('\n'));
  return out;
}
const heldChanged = (syncDir, base) => JSON.parse(py(syncDir, `${ARM}print(json.dumps(sorted(S.held_changes(sys.argv[3], rev)[1])))`, [REV, base]));
const publicChangedHeld = (syncDir, base) => JSON.parse(py(syncDir, `${ARM}print(json.dumps(sorted(S.public_changed(sys.argv[3], rev) & set(json.loads(sys.argv[4])))))`, [REV, base, JSON.stringify(held)]));
const LAST_BASE = (() => { try { return gitText(['show', `${REV}:${SYNC}/last-sync-base`]).split(/\s+/)[0]; } catch { return ''; } })();
const baseHasHold = LAST_BASE && hasCommit(LAST_BASE) && /\bHOLD_REV\s*=/.test(gitText(['show', `${LAST_BASE}:${SYNC}/manifest.py`]));
// H11: the base side of a judgment port, through a pipeline dir's own port-judgment.py: per patched path, 'SAME' when
// base_export equals the pipeline under the base's hold with no rows, else 'DIFFERS' or 'REFUSED <why>'
const manifestAt = (rev) => gitText(['show', `${rev}:${SYNC}/manifest.py`]);
const basePorts = (syncDir, base, paths) => JSON.parse(py(syncDir, 'import importlib.util\n'
  + 'spec = importlib.util.spec_from_file_location("port_judgment", sys.argv[1] + "/port-judgment.py"); PJ = importlib.util.module_from_spec(spec); spec.loader.exec_module(PJ); S = PJ.S\n'
  + 'base = sys.argv[2]; out = {}\n'
  + 'for p in json.loads(sys.argv[3]):\n'
  + '    try:\n        got = PJ.base_export(base, p)\n'
  + '    except SystemExit as e:\n        out[p] = "REFUSED " + str(e)[:160]; continue\n'
  + '    out[p] = "SAME" if got == PJ.pipeline(base, p, S.hold_at(base), S.ci_rules_at(base), ((), False)) else "DIFFERS"\n'
  + 'print(json.dumps(out))', [base, JSON.stringify(paths)]));
const differing = (a, b) => held.filter((p) => a.get(p) !== b.get(p)).sort();
const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

function assertAll(model, opts = {}) {
  const want = (k) => !opts.only || opts.only.includes(k);
  const dir = model.dir;
  const fails = [];
  if (want('H0')) {
    const m = opts.manifest ?? man;
    if (EXPECTED_HOLD) {
      const exp = [...EXPECTED_HOLD.extra, ...EXPECTED_HOLD.ids.flatMap((id) => [...SUFFIXES.map((s) => `${SITE}${id}${s}`), `${SITE}preview/${id}-preview.mp4`])].sort();
      if (m.rev !== EXPECTED_HOLD.rev) fails.push(`H0 manifest HOLD_REV ${m.rev} is not the pinned ${EXPECTED_HOLD.rev}`);
      if (!same(m.files, exp)) fails.push(`H0 manifest HOLD_FILES (${m.files.length}) is not the pinned set (${exp.length})`);
    } else if (m.files.length) fails.push(`H0 the arm pins no hold but manifest HOLD_FILES has ${m.files.length} paths`);
    if (!EXPECTED_HOLD && m.patches.length) fails.push(`H0 the arm pins no hold but manifest HELD_TEXT_PATCHES has ${m.patches.length} row(s)`);
    for (const [p, b, o, nw, c] of m.patches) {
      if (!(c >= 1) || !o || o === nw) fails.push(`H0 HELD_TEXT_PATCHES row for ${p} cannot change its text (count ${c})`);
      if (!m.files.includes(p)) fails.push(`H0 HELD_TEXT_PATCHES names ${p}, which is not held`);
      else if (holdShas.get(p) !== b) fails.push(`H0 HELD_TEXT_PATCHES pins ${p} to blob ${String(b).slice(0, 12)}, HOLD_REV has ${(holdShas.get(p) ?? 'none').slice(0, 12)}`);
    }
    const exc = model.res.excluded.filter((p) => p.startsWith(SITE)).sort();
    if (!same(exc, EXPECTED_EXCLUDED_SITE)) fails.push(`H0 excluded site set [${exc.join(', ')}] is not the pinned drag-shot set`);
  }
  if (holding && want('H1')) {
    for (const p of held) {
      if (!holdShas.has(p)) fails.push(`H1 ${p} is held but absent at HOLD_REV ${HOLD.slice(0, 9)}`);
      if (!revShas.has(p)) fails.push(`H1 ${p} is held but absent at ${REV.slice(0, 9)}`);
    }
  }
  if (holding && want('H2')) {
    for (const [p, exp] of expectHeld) {
      const have = readOr(join(dir, p));
      if (!have) { fails.push(`H2 held ${p} is missing from the modelled tree`); continue; }
      if (!have.equals(exp)) fails.push(`H2 held ${p} is not what the pipeline makes of its HOLD_REV blob`);
      if (isMedia(p) && !have.equals(blob(HOLD, p))) fails.push(`H2 held media ${p} is not its HOLD_REV blob byte for byte`);
    }
  }
  if (holding && want('H3')) {
    for (const f of walk(join(dir, 'site'))) {
      const hit = forbidden.get(gitBlobSha(readFileSync(f)));
      if (hit) fails.push(`H3 ${relative(dir, f)} ships what the pipeline would ship for ${hit} without the hold`);
    }
  }
  if (want('H4')) {
    const present = new Set(walk(dir).map((f) => relative(dir, f)));
    for (const p of EXPECTED_EXCLUDED_SITE) if (present.has(p)) fails.push(`H4 excluded ${p} ships`);
    const ids = [...new Set([...excludedIds, 'drag-shot'])];
    for (const p of [...OUTPUTS, `${SITE}SOURCES.md`, GEN]) {
      const text = readOr(join(dir, p))?.toString('utf8') ?? '';
      for (const id of ids) if (text.includes(id)) fails.push(`H4 ${p} names the excluded id '${id}'`);
    }
  }
  if (want('H5')) {
    const r = spawnSync('node', [GEN, '--check'], { cwd: dir, encoding: 'utf8' });
    if (r.status !== 0) fails.push(`H5 site-physics-data --check: ${(r.stderr || r.stdout).trim().split('\n').join(' | ')}`);
  }
  if (holding && want('H6')) {
    // the export loop must write through write_export (the writer driven below), never read a blob itself
    const syncPy = readFileSync(join(opts.syncDir ?? SYNC_DIR, 'sync.py'), 'utf8');
    const mainBody = syncPy.slice(syncPy.indexOf('\ndef main('), syncPy.indexOf('\nif __name__ =='));
    if (!/\bwrite_export\(public, p, rev, tracked\[p\]\)/.test(mainBody)) fails.push('H6 sync.main() no longer exports through write_export');
    const cs = mainBody.indexOf('changed = public_changed(base, rev)');
    if (cs < 0) fails.push('H6 sync.main() no longer takes its change set from public_changed');
    else if (/\n\s*changed = /.test(mainBody.slice(cs + 1))) fails.push('H6 sync.main() reassigns its change set after public_changed');
    const rg = mainBody.indexOf('regen_public_site(public)');
    const bt = mainBody.indexOf('battery(public)');
    if (rg < 0 || bt < 0 || rg > bt) fails.push('H6 sync.main() no longer regenerates the site outputs (regen_public_site) before the battery');
    if (/git\("show", f"\{(rev|source_rev\(p, rev\))\}:\{p\}", binary=True\)/.test(mainBody)) fails.push('H6 sync.main() reads an export blob itself, bypassing write_export');
    const out = writerOutput(opts.syncDir ?? SYNC_DIR, held);
    for (const p of held) {
      const w = readOr(join(out, p));
      const m = readOr(join(MODEL.dir, p));
      if (!w || !m || !w.equals(m)) fails.push(`H6 the export loop's writer does not write held ${p} as the model ships it`);
    }
  }
  if (holding && want('H7')) {
    const sd = opts.syncDir ?? SYNC_DIR;
    const after = heldChanged(sd, REV);
    if (after.length) fails.push(`H7 with a base that already syncs under this hold, ${after.length} held path(s) count as changed (e.g. ${after[0]})`);
    if (LAST_BASE && !baseHasHold && !opts.only) {
      if (!hasCommit(LAST_BASE)) fails.push(`H7 the last sync base ${LAST_BASE.slice(0, 9)} is not in the object store`);
      else {
        const exp = differing(treeShas(LAST_BASE, ...held), holdShas);
        const got = heldChanged(sd, LAST_BASE);
        if (!same(got, exp)) fails.push(`H7 from the last sync base ${LAST_BASE.slice(0, 9)}: ${got.length} changed, expected ${exp.length}`);
        const viaMain = publicChangedHeld(sd, LAST_BASE);
        if (!same(viaMain, exp)) fails.push(`H7 public_changed from the last sync base ${LAST_BASE.slice(0, 9)}: ${viaMain.length} held path(s) changed, expected ${exp.length}`);
      }
    }
    if (!opts.only) {
      const exp = differing(revShas, holdShas);
      const got = heldChanged(NOHOLD_DIR, REV);
      if (!same(got, exp)) fails.push(`H7 with the hold lifted: ${got.length} formerly held path(s) changed, expected ${exp.length}`);
    }
  }
  if (want('H8')) {
    const f = join(dir, PAGES[1]);
    const orig = readFileSync(f);
    const m = orig.toString('utf8').match(/All (\d+) scenarios/);
    if (!m) fails.push('H8 the teaser count line is missing from the modelled index');
    else {
      writeFileSync(f, orig.toString('utf8').replace(m[0], `All ${Number(m[1]) + 1} scenarios`));
      py(opts.syncDir ?? SYNC_DIR, 'import sync as S; S.regen_public_site(sys.argv[2])', [dir]);
      if (!readFileSync(f).equals(orig)) fails.push('H8 regen_public_site does not restore a generated output edited as text');
      writeFileSync(f, orig);
    }
  }
  if (holding && want('H9')) {
    const amended = gitText(['diff', '--name-only', CAPTION_BASE, HOLD, '--', ...held]).split('\n').filter(Boolean);
    const allowed = ['draw-arc-ladder.mp4', 'draw-arc-ladder-gates.json', 'SOURCES.md'].map((f) => SITE + f);
    if (!same(amended, allowed)) fails.push(`H9 caption hold changes [${amended.join(', ')}], expected only the draw-arc video, record and ledger`);
    const gates = JSON.parse(readFileSync(join(dir, SITE, 'draw-arc-ladder-gates.json'), 'utf8'));
    if (gates.badge?.line2 !== DRAW_CAPTION) fails.push('H9 public draw-arc badge is not the neutral scenario caption');
    if (gates.composite?.plates?.sha256 !== DRAW_HELD_MASTER || gates.composite?.plates?.frames !== 978) {
      fails.push('H9 public draw-arc composite does not preserve the original 978-frame public master');
    }
  }
  if (holding && want('H10') && patches.length) {
    // the battery's own matcher (sync.marker_hit, sync.allowed) over each shipped patched text
    const left = JSON.parse(py(opts.syncDir ?? SYNC_DIR, 'import sync as S, manifest as M; d = sys.argv[2]; '
      + 'print(json.dumps({p: [m for m in M.BATTERY if not S.allowed(p, m) and S.marker_hit(m, open(d + "/" + p, encoding="utf-8").read().lower())] '
      + 'for p in json.loads(sys.argv[3])}))', [dir, JSON.stringify(patches.map(([q]) => q))]));
    for (const [p, , old] of patches) {
      const text = readOr(join(dir, p))?.toString('utf8') ?? '';
      if (text.includes(old)) fails.push(`H10 ${p} ships its row's old string`);
      if (left[p].length) fails.push(`H10 ${p} ships BATTERY marker(s) ${left[p].join(', ')} after its patch`);
    }
    for (const o of OUTPUTS) {
      const a = readOr(join(dir, o));
      const b = readOr(join(NOPATCH.dir, o));
      if (!a || !b || !a.equals(b)) fails.push(`H10 ${o} built over the unpatched held texts differs from the modelled output`);
    }
  }
  if (holding && want('H11') && patches.length) {
    const rowPaths = patches.map(([q]) => q);
    if (!manifestAt(ROWLESS_BASE).includes(`HOLD_REV = "${HOLD}"`)
      || /\bHELD_TEXT_PATCHES\s*=/.test(manifestAt(ROWLESS_BASE))) {
      fails.push(`H11 ROWLESS_BASE ${ROWLESS_BASE.slice(0, 9)} no longer has this hold without rows (re-pin it)`);
    }
    if (hasCommit(HOLDLESS_BASE) && /\b(HOLD_REV|HOLD_FILES|HELD_TEXT_PATCHES)\s*=/.test(manifestAt(HOLDLESS_BASE))) {
      fails.push(`H11 HOLDLESS_BASE ${HOLDLESS_BASE.slice(0, 9)} has a hold or rows (re-pin it)`);
    }
    for (const base of new Set([LAST_BASE, ROWLESS_BASE, HOLDLESS_BASE])) {
      if (!base || !hasCommit(base)) { fails.push(`H11 base ${base ? base.slice(0, 9) : '(none recorded)'} is not in the object store`); continue; }
      if (/\bHELD_TEXT_PATCHES\s*=/.test(manifestAt(base))) continue;  // a base with rows of its own: not this check's case
      const present = rowPaths.filter((q) => { try { git(['cat-file', '-e', `${base}:${q}`]); return true; } catch { return false; } });
      if (!present.length) { fails.push(`H11 no patched path exists at base ${base.slice(0, 9)} (the check would be vacuous)`); continue; }
      for (const [q, r] of Object.entries(basePorts(opts.syncDir ?? SYNC_DIR, base, present))) {
        if (r !== 'SAME') fails.push(`H11 base export of ${q} at ${base.slice(0, 9)}: ${r}`);
      }
    }
  }
  return fails;
}

const reRendered = holding ? held.filter((p) => revShas.get(p) !== holdShas.get(p)).length : 0;
process.stdout.write(`snapshot site-hold @ ${REV.slice(0, 9)}: ${holding ? `${held.length} held paths (HOLD_REV ${HOLD.slice(0, 9)}), `
  + `${reRendered} held path(s) re-rendered at this rev (${reRenderedHeld.length} media), ${forbidden.size} path(s) that would ship without the hold` : 'no hold in the manifest'}, `
  + `excluded ids [${excludedIds.join(', ')}], last sync base ${LAST_BASE ? LAST_BASE.slice(0, 9) : 'none'}${baseHasHold ? ' (already under a hold)' : ''}, `
  + `model: ${MODEL.res.exported.length} exported + ${MODEL.res.verbatim.length} verbatim\n`);
const fails = assertAll(MODEL);
for (const k of ['H0', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10', 'H11']) {
  const mine = fails.filter((f) => f.startsWith(`${k} `));
  const na = !holding && ['H1', 'H2', 'H3', 'H6', 'H7', 'H9', 'H10', 'H11'].includes(k);
  process.stdout.write(na ? `  --  ${k} n/a (no hold)\n` : mine.length ? mine.map((f) => `  RED ${f}\n`).join('') : `  ok  ${k}\n`);
}
let bad = fails.length;

if (selftest) {
  const report = (label, got, caught) => {
    const keys = [...new Set(got.map((f) => f.slice(0, 2)))].join('+');
    process.stdout.write(`  ${caught ? 'ok ' : 'RED'} plant ${label}: ${got.length ? `${keys} red (${got.length}): ${got[0]}` : 'nothing caught'}\n`);
    if (!caught) bad++;
  };
  const plantFile = (label, file, bytes, only, expectFn) => {
    const full = join(MODEL.dir, file);
    const orig = readOr(full);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, bytes);
    const got = assertAll(MODEL, { only });
    if (orig) writeFileSync(full, orig); else rmSync(full);
    report(label, got, expectFn(got));
  };
  if (holding) {
    const p1 = reRenderedHeld[0] || held.find(isMedia);
    const real = Boolean(reRenderedHeld[0]);
    const planted = real ? blob(REV, p1) : Buffer.concat([readFileSync(join(MODEL.dir, p1)), Buffer.from([0])]);
    plantFile(`P1 ${real ? 're-rendered' : 'one-byte-mutated'} ${p1}`, p1, planted, ['H2', 'H3'],
      (got) => got.some((f) => f.startsWith(`H2 held ${p1}`)) && (!real || got.some((f) => f.startsWith('H3'))));
    if (real) {
      const got = assertAll(NOHOLD, { only: ['H2'] });
      report('P2 the whole model rebuilt through the hold-emptied pipeline copy', got, got.some((f) => f.startsWith('H2')));
    } else {
      process.stdout.write(`  --  plant P2 vacuous: no held path's blob at ${REV.slice(0, 9)} differs from HOLD_REV (H0 pins HOLD_REV)\n`);
    }
    // the held-text patch would refuse the tip blobs this plant exports for held paths: P5 tests the writer, so its copy has no rows
    const p5 = pipelineCopy('p5', { 'sync.py': 'def shipped_blob(p, rev):  # plant P5: the hold ignored\n    return git("show", f"{rev}:{p}", binary=True)', 'manifest.py': 'HELD_TEXT_PATCHES = []' });
    const g5 = assertAll(MODEL, { only: ['H6'], syncDir: p5 });
    if (real) report('P5 shipped_blob ignores the hold (the export loop\'s writer)', g5, g5.some((f) => f.startsWith('H6')));
    else process.stdout.write('  --  plant P5 vacuous: the hold changes no blob at this rev\n');
    const p6 = pipelineCopy('p6', { 'sync.py': 'def held_changes(base, rev):  # plant P6: the base\'s blob, not the source it shipped\n'
      + '    paths = sorted(HOLD[1])\n'
      + '    return set(paths), (set(git("diff", "--name-only", f"{base}..{HOLD[0]}", "--", *paths).splitlines()) if paths else set())' });
    const g6 = assertAll(MODEL, { only: ['H7'], syncDir: p6 });
    if (real) report('P6 change detection compares the base\'s blob', g6, g6.some((f) => f.startsWith('H7')));
    else process.stdout.write('  --  plant P6 vacuous: the base blobs equal the hold blobs at this rev\n');
  }
  const idx = readFileSync(join(MODEL.dir, PAGES[1]), 'utf8');
  const m = idx.match(/All (\d+) scenarios/);
  if (!m) { process.stdout.write('  RED plant P3: the teaser count line is missing from the modelled index\n'); bad++; } else {
    plantFile('P3 teaser count edited as text', PAGES[1], idx.replace(m[0], `All ${Number(m[1]) + 1} scenarios`), ['H5'],
      (got) => got.some((f) => f.startsWith('H5')));
  }
  const ex = EXPECTED_EXCLUDED_SITE.find((p) => revShas.has(p));
  if (!ex) { process.stdout.write('  RED plant P4: no excluded site path at this rev to plant\n'); bad++; } else {
    plantFile(`P4 excluded ${ex} planted`, ex, blob(REV, ex), ['H4'], (got) => got.some((f) => f.startsWith(`H4 excluded ${ex}`)));
  }
  const src = `${SITE}SOURCES.md`;
  plantFile('P4 an excluded id written into SOURCES.md', src, Buffer.concat([readFileSync(join(MODEL.dir, src)), Buffer.from('\n| `drag-shot.mp4` | `0000000000000000` |\n')]),
    ['H4'], (got) => got.some((f) => f.startsWith(`H4 ${src} names`)));
  const edit = (tag, file, from, to) => {
    const d = pipelineCopy(tag, {});
    const t = readFileSync(join(d, file), 'utf8');
    if (!t.includes(from)) { process.stdout.write(`  RED plant ${tag}: its anchor is gone from ${file} (re-anchor the plant)\n`); bad++; return null; }
    writeFileSync(join(d, file), t.replace(from, to));
    return d;
  };
  if (holding) {
    const p8 = edit('p8', 'sync.py', '    changed = public_changed(base, rev)', '    changed = set(git("diff", "--name-only", f"{base}..{rev}").splitlines())');
    if (p8) { const g = assertAll(MODEL, { only: ['H6'], syncDir: p8 }); report('P8 main() takes the plain base..rev diff', g, g.some((f) => f.startsWith('H6 sync.main() no longer takes'))); }
    const p9 = edit('p9', 'sync.py', '    regen_public_site(public)\n', '');
    if (p9) { const g = assertAll(MODEL, { only: ['H6'], syncDir: p9 }); report('P9 main() no longer regenerates the site outputs', g, g.some((f) => f.startsWith('H6 sync.main() no longer regenerates'))); }
  }
  const p11 = py(SYNC_DIR, `${ARM}S.SHIP_SET.discard("site/assets/physics/physics-data.json")\ntry:\n    S.site_outputs(rev); print("NO REFUSAL")\nexcept SystemExit as e:\n    print("REFUSED" if "rewrites generated text" in str(e) else "OTHER " + str(e)[:200])`, [REV]).trim();
  process.stdout.write(`  ${p11 === 'REFUSED' ? 'ok ' : 'RED'} plant P11 a generated region links a path that does not ship: ${p11 === 'REFUSED' ? 'site_outputs refused (fixed-point guard)' : p11 || 'no output'}\n`);
  if (p11 !== 'REFUSED') bad++;
  const p10 = edit('p10', 'sync.py', '    if not os.path.exists(os.path.join(public, SITE_GEN)):\n        return\n', '    return\n');
  if (p10) { const g = assertAll(MODEL, { only: ['H8'], syncDir: p10 }); report('P10 regen_public_site does nothing', g, g.some((f) => f.startsWith('H8'))); }
  if (holding) {
    const p7 = pipelineCopy('p7', { 'manifest.py': 'HOLD_FILES = HOLD_FILES - {"site/assets/physics/SOURCES.md"}' });
    const g7 = assertAll(MODEL, { only: ['H0'], manifest: readManifest(p7) });
    report('P7 a hold that drops SOURCES.md', g7, g7.some((f) => f.startsWith('H0')));
    const drawPath = `${SITE}draw-arc-ladder-gates.json`;
    const draw = JSON.parse(readFileSync(join(MODEL.dir, drawPath), 'utf8'));
    const oldClaim = structuredClone(draw);
    oldClaim.badge.line2 = 'REFERENCE PARITY WITHIN 0.006 MM';
    plantFile('P12 a retired comparison claim returns to the held caption', drawPath, JSON.stringify(oldClaim), ['H9'],
      (got) => got.some((f) => f.startsWith('H9 public draw-arc badge')));
    const wrongPlate = structuredClone(draw);
    wrongPlate.composite.plates.sha256 = '0'.repeat(64);
    plantFile('P13 a different simulation master is substituted under the caption amendment', drawPath, JSON.stringify(wrongPlate), ['H9'],
      (got) => got.some((f) => f.startsWith('H9 public draw-arc composite')));
    if (patches.length) {
      // P14-P16: a row that no longer fits its blob refuses the export (the first row, through its own
      // HOLD_REV blob and export_text)
      const [p0, b0, old0, new0, n0] = patches[0];
      // a BATTERY marker the row's own old string carries (read at run time: this file ships, and the battery reads it)
      const mark0 = py(SYNC_DIR, 'import sync as S, manifest as M; print([m for m in M.BATTERY if S.marker_hit(m, sys.argv[2].lower())][0])', [old0]).trim();
      const refuses = (tag, row) => py(pipelineCopy(tag, { 'manifest.py': `HELD_TEXT_PATCHES = [${JSON.stringify(row)}] + HELD_TEXT_PATCHES[1:]` }),
        'import sync as S, subprocess\ntext = subprocess.run(["git", "show", sys.argv[2] + ":" + sys.argv[3]], capture_output=True, check=True).stdout.decode()\n'
        + 'try:\n    S.export_text(sys.argv[3], text, regen=False); print("NO REFUSAL")\nexcept SystemExit as e:\n    print("REFUSED " + str(e)[:160])', [HOLD, p0]).trim();
      for (const [tag, label, row, why] of [
        ['p14', 'P14 a row pinned to another blob id', [p0, '0'.repeat(40), old0, new0, n0], 'not the HOLD_REV blob'],
        ['p15', 'P15 a row whose count differs', [p0, b0, old0, new0, n0 + 1], 'occurrence(s)'],
        ['p16', 'P16 a row whose new text carries a BATTERY marker', [p0, b0, old0, mark0, n0], 'BATTERY marker'],
        ['p18', 'P18 a row that cannot change its text (an absent old string at count 0)', [p0, b0, `${old0} (absent)`, new0, 0], 'cannot change its text'],
      ]) {
        const r = refuses(tag, row);
        const ok = r.startsWith('REFUSED') && r.includes(why);
        process.stdout.write(`  ${ok ? 'ok ' : 'RED'} plant ${label}: ${r}\n`);
        if (!ok) bad++;
      }
      // P17: anchor.battery / anchor.sources are unread (H5 stays green with junk in them); a read field is live
      for (const [p] of patches.filter(([q]) => q.endsWith('-gates.json'))) {
        const rec = JSON.parse(readFileSync(join(MODEL.dir, p), 'utf8'));
        if (!rec.anchor) continue;
        rec.anchor.battery = 'P17 junk'; rec.anchor.sources = 'P17 junk';
        plantFile(`P17a junk in ${p.slice(SITE.length)} anchor.battery/sources (unread)`, p, JSON.stringify(rec), ['H5'], (got) => got.length === 0);
      }
      const live = `${SITE}thirty-rule-gates.json`;
      const lrec = JSON.parse(readFileSync(join(MODEL.dir, live), 'utf8'));
      if (typeof lrec.anchor?.predictedDeg === 'number') {
        lrec.anchor.predictedDeg += 1;
        plantFile('P17b a changed anchor.predictedDeg (a read field)', live, JSON.stringify(lrec), ['H5'], (got) => got.some((f) => f.startsWith('H5')));
      } else { process.stdout.write(`  RED plant P17b: ${live} has no numeric anchor.predictedDeg to change\n`); bad++; }
      // P19/P20: the base side of a judgment port under today's policy (H11)
      const p19 = edit('p19', 'port-judgment.py', '                    S.patches_at(base))', '                    (tuple(M.HELD_TEXT_PATCHES), True))');
      if (p19) { const g = assertAll(MODEL, { only: ['H11'], syncDir: p19 }); report('P19 the base side takes this manifest\'s rows', g, g.some((f) => f.startsWith(`H11 base export of site/assets/physics/SOURCES.md at ${ROWLESS_BASE.slice(0, 9)}`))); }
      let p20 = edit('p20', 'sync.py', '    rows = [r for r in TEXT_PATCHES[0] if r[0] == rel]\n    if not rows or rel not in HOLD[1]:',
        '    rows = [r for r in M.HELD_TEXT_PATCHES if r[0] == rel]\n    if not rows or rel not in M.HOLD_FILES:');
      if (p20) {
        const t = readFileSync(join(p20, 'sync.py'), 'utf8');
        const from = '    held_patched = held_text_patch(rel, text) if rel in HOLD[1] else text';
        if (!t.includes(from)) { process.stdout.write('  RED plant p20: its second anchor is gone from sync.py (re-anchor the plant)\n'); bad++; p20 = null; } else {
          writeFileSync(join(p20, 'sync.py'), t.replace(from, '    held_patched = held_text_patch(rel, text) if rel in M.HOLD_FILES else text'));
        }
      }
      if (p20) {
        const g = assertAll(MODEL, { only: ['H11'], syncDir: p20 });
        report('P20 the patch selection reads this manifest\'s rows and hold, not the installed ones', g,
          g.some((f) => f.startsWith(`H11 base export of site/assets/physics/SOURCES.md at ${HOLDLESS_BASE.slice(0, 9)}: REFUSED`)
            && f.includes('not the HOLD_REV blob')));
      }
    }
  }
}
process.stdout.write(bad ? `snapshot site-hold: ${bad} failure(s)\n` : 'snapshot site-hold: PASS\n');
process.exit(bad ? 1 : 0);
