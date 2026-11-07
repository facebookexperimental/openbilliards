#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// f_input_guard_621.mjs — the D621 f ruling's guard (maintainer ruling 2026-10-19, option C). The accepted RED-BY-LAW
// f exception binds to OURS geometry, not to table.js bytes: f reads the exact-B sections of dm-cushion-0..5 and
// dm-railtop-0..5 (cushion_profile_621.py ours_rails). This guard builds diamond_proam_7ft / 8ft / 9ft at the law's
// characterized commit and at HEAD, each from its OWN tree (its own offline_scene_dump_621.mjs, table.js, every module
// table.js imports and the vendored three) in its own node process, under ONE pinned runtime, and requires those 12
// meshes byte-identical per size: exact names, each exactly once, no extra dm-cushion-N / dm-railtop-N, and the same
// sha256(Float64 world positions + Uint32 indices) as the characterized commit's build AND as the law's recorded
// binding. The builds are synchronous (buildTable, then one traversal): no timer waits. Nothing is skipped (owner D1):
// a missing commit, a failed build, a missing or extra mesh, or (in CI) a runtime other than the pinned one each FAIL
// by name.
// A table.js edit that leaves the 12 meshes byte-identical passes; a change to any of them fails, naming the mesh and
// both digests, and means f is re-measured and the ruling re-bound (tools/render/d621/law/README.md).
//   node tools/render/d621/plan/f_input_guard_621.mjs [--selftest] [--head DIR] [--record]
//   --selftest  also build three planted copies of HEAD and require each verdict: one coordinate of dm-cushion-2
//               moved -> RED naming it at every size; a comment-only table.js edit -> green; dm-railtop-3 removed ->
//               RED naming it missing at every size
//   --head DIR  build HEAD from DIR (a tree holding the four TREE_PATHS) instead of this checkout
//   --record    after a re-measure: print HEAD's digests in the law's characterized_inputs.meshes form
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..', '..');
const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const HEAD_DIR = path.resolve(opt('--head') ?? ROOT);
const RECORD = argv.includes('--record'), SELFTEST = argv.includes('--selftest');
const F_INPUTS = Object.freeze([0, 1, 2, 3, 4, 5].map((i) => `dm-cushion-${i}`).concat([0, 1, 2, 3, 4, 5].map((i) => `dm-railtop-${i}`)));
const FAMILY = /^dm-(cushion|railtop)-\d+$/;
const SIZES = ['7ft', '8ft', '9ft'];
// what each revision's build reads: the dump tool's own directory, the scene modules, the vendored three, the SDK
const TREE_PATHS = ['tools/render/d621/plan', 'web/scene', 'web/vendor', 'web/dist'];
const HEX40 = /^[0-9a-f]{40}$/, HEX64 = /^[0-9a-f]{64}$/;
const t0 = process.hrtime.bigint();
const note = (msg) => console.log(`[f-input-guard] ${msg}`);
const fails = [];
const fail = (msg) => { fails.push(msg); console.log(`[f-input-guard] FAIL: ${msg}`); };

const law = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/render/d621/law/cushion_law_621.json'), 'utf8'));
const bind = law.ruled_red_rows?.f_p90?.characterized_inputs;
const lawOk = bind && HEX40.test(bind.commit ?? '') && /^v\d+\.\d+\.\d+$/.test(bind.node ?? '')
  && SIZES.every((s) => bind.meshes?.[s] && Object.keys(bind.meshes[s]).sort().join() === [...F_INPUTS].sort().join()
    && F_INPUTS.every((n) => HEX64.test(bind.meshes[s][n])));
if (!lawOk) {
  fail('the law has no complete ruled_red_rows.f_p90.characterized_inputs (commit, node, 12 digests per size)');
  process.exit(1);
}
// the runtime: ci.yml pins it (setup-node), so in CI another version FAILS. Elsewhere (a lane's node battery runs every
// hosted ci.yml node step under the host's node) every comparison still runs under the host runtime and only a digest
// difference fails — the differential is engine-proof by construction, the law record by its digests
if (process.version !== bind.node) {
  if (process.env.GITHUB_ACTIONS === 'true') fail(`runtime ${process.version} is not the pinned ${bind.node}`);
  else note(`runtime ${process.version}, not the pinned ${bind.node} (CI pins it): every comparison still runs`);
}

const git = (...a) => spawnSync('git', ['-C', ROOT, ...a], { encoding: 'buffer', maxBuffer: 1 << 30 });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd621-f-input-guard-'));
const finish = (code) => { fs.rmSync(tmp, { recursive: true, force: true }); process.exit(code); };

// the characterized commit's own tree (fetched once if the checkout is shallow; never substituted)
if (git('cat-file', '-e', `${bind.commit}^{commit}`).status !== 0) git('fetch', '--no-tags', '--depth=1', 'origin', bind.commit);
const archive = git('archive', '--format=tar', bind.commit, ...TREE_PATHS);
const baseDir = path.join(tmp, 'characterized');
fs.mkdirSync(baseDir);
if (archive.status !== 0 || spawnSync('tar', ['-x', '-C', baseDir], { input: archive.stdout }).status !== 0) {
  fail(`could not materialize the characterized commit ${bind.commit}: ${archive.stderr.toString().trim().slice(0, 300)}`);
  finish(1);
}

// one build = one node process (its own module graph and globals) over one tree, under this runtime; returns
// { digests: Map(key -> [digest, ...]) } or { error }
function build(label, dir, size) {
  const out = path.join(tmp, `${label}-${size}.json`);
  const run = spawnSync(process.execPath, [path.join(dir, 'tools/render/d621/plan/offline_scene_dump_621.mjs'),
    '--table', `diamond_proam_${size}`, '--digests-only', '--out', out],
  { cwd: dir, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, CHROME_BIN: '/nonexistent' } });
  // the dump exits 3 on a duplicate name ANYWHERE in the table and still writes its output; duplicates among the 12 fail
  if ((run.status !== 0 && run.status !== 3) || !fs.existsSync(out)) {
    return { error: `${label} ${size}: the build failed (exit ${run.status}): ${`${run.stderr}`.trim().split('\n').slice(-3).join(' | ').slice(0, 400)}` };
  }
  const digests = new Map();
  for (const m of JSON.parse(fs.readFileSync(out, 'utf8')).meshes) {
    if (!digests.has(m.key)) digests.set(m.key, []);
    digests.get(m.key).push(m.geometry_sha256);
  }
  return { digests, duplicateOutside: run.status === 3 };
}

const characterized = Object.fromEntries(SIZES.map((size) => [size, build('characterized', baseDir, size)]));

// every problem of one HEAD tree against the characterized builds and the law record, as messages
function judge(label, dir) {
  const problems = [], identical = {}, recorded = {};
  // both sides of a name, always: a digest, 'absent', or the list of a repeated name
  const fmt = (list) => (!list?.length ? 'absent' : list.length === 1 ? list[0] : `[${list.join(', ')}]`);
  for (const size of SIZES) {
    const builds = { characterized: characterized[size], [label]: build(label, dir, size) };
    const both = (name) => `characterized ${fmt(builds.characterized.digests?.get(name))} vs ${label} ${fmt(builds[label].digests?.get(name))}`;
    for (const [who, b] of Object.entries(builds)) {
      if (b.error) { problems.push(b.error); continue; }
      if (b.duplicateOutside) note(`${who} ${size}: the dump reports a duplicate mesh name outside the f inputs (exit 3)`);
      for (const key of b.digests.keys()) if (FAMILY.test(key) && !F_INPUTS.includes(key)) problems.push(`${who} ${size}: extra mesh ${key} (${both(key)})`);
      for (const name of F_INPUTS) {
        const n = b.digests.get(name)?.length ?? 0;
        if (n !== 1) problems.push(`${who} ${size}: ${name} ${n ? `appears ${n} times` : 'is missing'} (${both(name)})`);
      }
    }
    identical[size] = 0;
    recorded[size] = {};
    const c = builds.characterized.digests, h = builds[label].digests;
    for (const name of F_INPUTS) {
      const cd = c?.get(name), hd = h?.get(name), ld = bind.meshes[size][name];
      if (hd?.length === 1) recorded[size][name] = hd[0];
      if (cd?.length !== 1 || hd?.length !== 1) continue;
      if (cd[0] !== ld) problems.push(`${size} ${name}: law ${ld} vs characterized build ${cd[0]} (the binding no longer describes its commit)`);
      if (hd[0] !== cd[0]) problems.push(`${size} ${name}: characterized ${cd[0]} vs ${label} ${hd[0]}`);
      else identical[size] += 1;
    }
  }
  return { problems, identical, recorded };
}

const head = judge('HEAD', HEAD_DIR);
head.problems.forEach(fail);
for (const size of SIZES) note(`${size}: ${head.identical[size]} / ${F_INPUTS.length} f input meshes byte-identical to the characterized commit`);
if (RECORD) console.log(JSON.stringify(head.recorded, null, 2));

if (SELFTEST) {
  // three planted copies of HEAD's tree; each plant must be caught (or pass) exactly as stated, by name
  const PLANTS = [
    { name: 'one-coordinate', anchor: '    const cushion = new THREE.Mesh(cushGeo, clothMat);\n',
      edit: (a) => `    if (ci === 2) cushGeo.attributes.position.array[0] += 1e-6;\n${a}`,
      expect: SIZES.map((s) => new RegExp(`^${s} dm-cushion-2: characterized [0-9a-f]{64} vs plant [0-9a-f]{64}$`)) },
    { name: 'comment-only', anchor: null, edit: null, expect: [] },
    { name: 'removed-mesh', anchor: '    rp.planks.forEach((plan, pli) => {\n',
      edit: (a) => `${a}      if (pli === 3) return;\n`,
      expect: SIZES.map((s) => new RegExp(`^plant ${s}: dm-railtop-3 is missing \\(characterized [0-9a-f]{64} vs plant absent\\)$`)) },
  ];
  for (const plant of PLANTS) {
    const dir = path.join(tmp, `plant-${plant.name}`);
    for (const p of TREE_PATHS) fs.cpSync(path.join(HEAD_DIR, p), path.join(dir, p), { recursive: true });
    const tj = path.join(dir, 'web/scene/table.js');
    const src = fs.readFileSync(tj, 'utf8');
    if (plant.anchor === null) fs.writeFileSync(tj, `${src}\n// f_input_guard_621 --selftest: a comment-only edit\n`);
    else if (src.split(plant.anchor).length !== 2) { fail(`selftest ${plant.name}: the plant anchor is not in HEAD's table.js exactly once`); continue; }
    else fs.writeFileSync(tj, src.replace(plant.anchor, plant.edit(plant.anchor)));
    const got = judge('plant', dir).problems;
    const caught = plant.expect.every((re) => got.some((p) => re.test(p))) && got.every((p) => plant.expect.some((re) => re.test(p)));
    if (!caught) fail(`selftest ${plant.name}: expected ${plant.expect.length ? plant.expect.map(String).join(' / ') : 'no problem'}, got ${JSON.stringify(got).slice(0, 600)}`);
    else note(`selftest ${plant.name}: ${got.length ? `RED by name (${got.length}): ${got[0].slice(0, 120)}` : 'green'}`);
  }
}

const seconds = Number(process.hrtime.bigint() - t0) / 1e9;
note(`runtime ${process.version}, characterized ${bind.commit}, HEAD ${HEAD_DIR === ROOT ? 'this checkout' : HEAD_DIR}${SELFTEST ? ', with the selftest' : ''}, ${seconds.toFixed(1)} s`);
if (fails.length) {
  console.log(`F-INPUT-GUARD FAIL: ${fails.length} problem(s) — f's input geometry moved, a plant was not caught, or the binding is broken; re-measure f and re-bind the ruling (tools/render/d621/law/README.md)`);
  finish(1);
}
console.log(`F-INPUT-GUARD PASS: dm-cushion-0..5 and dm-railtop-0..5 are byte-identical to the characterized commit at 7 / 8 / 9 ft${SELFTEST ? '; every plant behaved' : ''}`);
finish(0);
