// Copyright (c) Meta Platforms, Inc. and affiliates.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { assessMidjawArm, readMidjawInputs } from './midjaw-overrun.mjs';
import { ensureRealThree, repoUrl } from './ensure-three.mjs';

ensureRealThree();
const { makeGeom, railPolysFor, CN8_MID } = await import(repoUrl('web/scene/table.js'));
const law = { ...await import(repoUrl('web/scene/cn8midlaw.js')), CN8_MID };

const fixture = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-midjaw-arm-666.json', import.meta.url)));
const baseline = JSON.parse(readFileSync(new URL('../fixtures/cushion-profile-baseline-490.json', import.meta.url)));
const checker = fileURLToPath(new URL('../check-cushion-profile.mjs', import.meta.url));

// Execute the actual CLI, substituting only the named arm function's inputs.
// Node's in-memory loader hook leaves the working tree and scene untouched.
function refutedArm(body, marker = 'export function midjawOverrun(G, polys, law) {') {
  const loader = `import { registerHooks } from 'node:module';
    registerHooks({ load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      if (!url.endsWith('/midjaw-overrun.mjs')) return result;
      const marker = ${JSON.stringify(marker)};
      const source = String(result.source);
      if (!source.includes(marker)) throw new Error('perturbation hook target missing');
      return { ...result, source: source.replace(marker, marker + '\\n' + ${JSON.stringify(body)}) };
    }});`;
  const run = spawnSync(process.execPath, ['--import=data:text/javascript,' + encodeURIComponent(loader), checker, '--perturb=midjaw-overrun'], { encoding: 'utf8' });
  assert.ifError(run.error);
  assert.equal(run.status, 1);
  assert.match(run.stderr, /\[perturb midjaw-overrun\] FAIL/);
  assert.doesNotMatch(run.stdout, /ARMED/);
  return run;
}

test('the real arm rejects a perturbation that does nothing', () => {
  const run = refutedArm('return polys;');
  assert.ok(run.stderr.includes(`-${fixture.rows.length} missing row(s)`));
});

test('the real arm rejects a perturbation of only a non-cn8 table', () => {
  const run = refutedArm(`if (G.id !== 'pool_pro_9ft_metal_rim') return polys;
    return polys.map(poly => { const changed = poly.slice();
      [changed[0], changed[1]] = [changed[1], changed[0]]; return changed; });`);
  assert.match(run.stderr, /predator_apex_9ft rail/);
  assert.match(run.stderr, /unperturbed row\(s\) vanished|unexpected/);
});

function recordedCandidate() {
  return {
    base: baseline.rows, pert: [...baseline.rows, ...fixture.rows], baseline, fixture, law,
    crossings: fixture.rows.map((row) => {
      const body = fixture.crossings.find((c) => row.startsWith(`${c.id} rail${c.rail}:`));
      const G = makeGeom(body.id);
      return { ...body, row, CW: fixture.inputs.CW, W: fixture.inputs.W, L: fixture.inputs.L,
        middle: G.middle, midjawInputs: readMidjawInputs(G, railPolysFor(G), law) };
    }),
  };
}

test('a recorded candidate passes; the same count with a foreign row cannot pass', () => {
  const candidate = recordedCandidate();
  assert.deepEqual(assessMidjawArm(candidate).problems, []);
  candidate.pert = candidate.pert.map((row) => row === fixture.rows[0] ? row.replace('chinese8_pro_9ft', 'predator_apex_9ft') : row);
  assert.equal(candidate.pert.length, baseline.rows.length + fixture.rows.length);
  assert.ok(assessMidjawArm(candidate).problems.some((p) => p.startsWith('differential versus recorded arm:')));
});

test('correct row identities with a displaced or non-finite intersection cannot pass', () => {
  for (const displacement of [fixture.inputs.allowance, NaN]) {
    const candidate = recordedCandidate();
    const crossing = candidate.crossings[0];
    crossing.point = [crossing.point[0], crossing.point[1] + displacement];
    assert.ok(assessMidjawArm(candidate).problems.some((p) => p.startsWith('intersection differs')));
  }
});

test('an empty intersection cannot satisfy coordinate checks vacuously', () => {
  const candidate = recordedCandidate();
  candidate.crossings[0].point = [];
  assert.ok(assessMidjawArm(candidate).problems.some((p) => p.startsWith('intersection differs')));
});

test('the real CLI rejects a displaced live law with every recorded failure and crossing intact', () => {
  const run = refutedArm(`crossings = crossings.map(c => c.midjawInputs ? ({ ...c,
    middle: { ...c.middle, r1: c.middle.r1 + fixture.inputs.allowance } }) : c);`,
  'export function assessMidjawArm({ base, pert, baseline, fixture, crossings, law }) {');
  assert.match(run.stderr, /live middle-jaw law differs: delta=/);
  assert.doesNotMatch(run.stderr, /intersection differs|unexpected \/|missing row/);
  const rows = run.stderr.split('\n').filter((row) => row.startsWith('[perturbed midjaw-overrun] FAIL: '))
    .map((row) => row.slice('[perturbed midjaw-overrun] FAIL: '.length));
  assert.deepEqual(new Set(rows), new Set([...baseline.rows, ...fixture.rows]));
});

test('a non-finite live circle cannot satisfy the new law check vacuously', () => {
  const candidate = recordedCandidate();
  candidate.crossings = candidate.crossings.map((c) => ({ ...c, middle: { ...c.middle, r1: NaN } }));
  assert.ok(assessMidjawArm(candidate).problems.some((problem) => problem.startsWith('live middle-jaw law')));
});
