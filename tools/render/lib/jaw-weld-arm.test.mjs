// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ensureRealThree, repoUrl } from './ensure-three.mjs';
import { assessJawWeldArm, JAW_WELD_TABLE, JAW_WELD_TABLES } from './jaw-weld-arm.mjs';

ensureRealThree();
const T = await import(repoUrl('web/scene/table.js'));
const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-jawweld-arm-671.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-baseline-490.json', import.meta.url)));
const checker = fileURLToPath(new URL('../check-cushion-profile.mjs', import.meta.url));
const G = T.makeGeom(JAW_WELD_TABLE);
const prof = T.cushionProfile(G.render.cushionFamily, G.kernel.noseHeightFrac * G.render.profileBallD, G.CW);
const plans = JAW_WELD_TABLES.flatMap((id) => T.railPolysFor(G).map((poly, rail) => ({ id, rail, poly, prof, ctx: T.cushionPlanCtx(G, poly) })));

function candidate() {
  return { base: [...baseline.rows], pert: [...baseline.rows, ...fixture.rows], baseline,
    fixture: structuredClone(fixture), crossings: structuredClone(fixture.crossings), plans };
}
const problems = (c) => assessJawWeldArm(c).problems;

test('the recording agrees with independently derived live jaw support lines', () => {
  assert.deepEqual(problems(candidate()), []);
});

test('a same-count identity substitution is rejected', () => {
  const c = candidate();
  c.pert[c.base.length] = c.pert[c.base.length].replace(JAW_WELD_TABLE, 'wpa_generic_9ft');
  assert.equal(c.pert.length, c.base.length + fixture.rows.length);
  assert.ok(problems(c).some((p) => p.startsWith('differential versus recorded arm:')));
});

test('a coordinated foreign-table recording and measurement are rejected', () => {
  const c = candidate();
  const rename = (row) => row.replace(JAW_WELD_TABLE, 'wpa_generic_9ft');
  c.fixture.rows = c.fixture.rows.map(rename);
  c.pert = [...c.base, ...c.fixture.rows];
  for (const records of [c.fixture.crossings, c.crossings]) {
    for (const r of records) { r.id = 'wpa_generic_9ft'; r.row = rename(r.row); }
  }
  assert.ok(problems(c).includes('arm recording contains a row on another table'));
});

test('one displaced recorded coordinate is rejected', () => {
  const c = candidate();
  c.fixture.crossings[0].point[0] += G.kernel.sideJawRadius;
  assert.ok(problems(c).some((p) => p.startsWith('intersection differs from the recorded')));
});

test('coordinated coordinate corruption still fails against the live erosion vertex', () => {
  const c = candidate();
  c.fixture.crossings[0].point[0] += G.kernel.sideJawRadius;
  c.crossings[0].point = [...c.fixture.crossings[0].point];
  const result = problems(c);
  assert.ok(result.some((p) => p.startsWith('intersection differs from the live erosion vertex')));
  assert.ok(!result.some((p) => p.startsWith('intersection differs from the recorded')));
});

test('missing, partial and non-finite coordinate pairs fail closed', () => {
  for (const point of [undefined, [], [0], [NaN, 0], [Infinity, 0], ['0', 0]]) {
    for (const key of ['fixture', 'measured']) {
      const c = candidate();
      const record = key === 'fixture' ? c.fixture.crossings[0] : c.crossings[0];
      record.point = point;
      assert.ok(problems(c).some((p) => p.startsWith('intersection differs: finite planar')));
    }
  }
});

test('duplicate row identities or duplicate crossing coverage cannot arm', () => {
  for (const key of ['rows', 'recorded-crossings', 'measured-crossings']) {
    const c = candidate();
    if (key === 'rows') c.fixture.rows[1] = c.fixture.rows[0];
    if (key === 'recorded-crossings') c.fixture.crossings[1] = c.fixture.crossings[0];
    if (key === 'measured-crossings') c.crossings[1] = c.crossings[0];
    assert.ok(problems(c).some((p) => p.includes('duplicate row identity')));
  }
});

test('absent or empty recordings cannot pass as an empty differential', () => {
  const missing = candidate();
  missing.fixture = undefined;
  assert.ok(problems(missing).length);
  const empty = candidate();
  empty.fixture.rows = []; empty.fixture.crossings = []; empty.pert = [...empty.base];
  assert.ok(problems(empty).includes('empty arm recording'));
});

// Refute the actual CLI without changing the checkout. Only the named source
// expression is substituted by Node's in-memory loader; real Three is used.
function refutedCLI(file, marker, replacement) {
  const loader = `import { registerHooks } from 'node:module';
    registerHooks({ load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith(${JSON.stringify(file)})) return result;
      const source = String(result.source), marker = ${JSON.stringify(marker)};
      if (!source.includes(marker)) throw new Error('refutation hook target missing');
      return { ...result, source: source.replace(marker, ${JSON.stringify(replacement)}) };
    } });`;
  const run = spawnSync(process.execPath, ['--import=data:text/javascript,' + encodeURIComponent(loader), checker,
    '--perturb=pairwise-jaw-weld'], { encoding: 'utf8' });
  assert.ifError(run.error);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /\[perturb pairwise-jaw-weld\] FAIL/);
  assert.doesNotMatch(run.stdout, /ARMED/);
  return run;
}

test('the CLI rejects a context perturbation that does nothing', () => {
  const run = refutedCLI('/check-cushion-profile.mjs',
    '? { ...G, render: { ...G.render, jawArcSegments: 0 } } : G;', '? G : G;');
  assert.ok(run.stderr.includes(`-${fixture.rows.length} missing row(s)`));
});

test('the CLI rejects the reverted run law through its unperturbed baseline', () => {
  const run = refutedCLI('/web/scene/table.js',
    'const runWeld = G.render.jawArcSampled === true || (G.render.jawArcSegments ?? 0) >= 2;',
    'const runWeld = G.render.jawArcSampled === true;');
  assert.ok(run.stderr.includes(`unperturbed versus committed baseline: +${fixture.rows.length} unexpected`));
});
