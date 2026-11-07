// Copyright (c) Meta Platforms, Inc. and affiliates.

// gi-entry.test.mjs — node --test: tools/render/lib/gi-entry.mjs shippedEntry() resolves exactly as the runtime's
// web/scene/gi.js entryFor() (lifted verbatim by text) over every committed fixture (top-level and per table class) × look
// × table class, every resolved probe grid exists on disk, an unbaked entry resolves to no grid (the committed fixture
// stubs, and a look-level flag planted on every guarded branch, since the manifest itself flags only whole fixtures), and
// the pre-GH-1070 lookup (which skipped the looks level) is caught by the same parity check (the plant).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shippedEntry } from './gi-entry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const MF = JSON.parse(fs.readFileSync(path.join(ROOT, 'web/assets/gi/gi-manifest.json'), 'utf8'));
const GIJS = fs.readFileSync(path.join(ROOT, 'web/scene/gi.js'), 'utf8');

/** gi.js's own entryFor, lifted by text (the nested function at two-space indent, up to its closing brace). */
function liftEntryFor() {
  const head = '  function entryFor(mf, look, fixture, cls) {';
  const a = GIJS.indexOf(head);
  assert.ok(a >= 0, 'web/scene/gi.js no longer defines `function entryFor(mf, look, fixture, cls)` — update the lift');
  const b = GIJS.indexOf('\n  }\n', a);
  assert.ok(b > a, 'the end of gi.js entryFor was not found');
  // eslint-disable-next-line no-new-func
  return new Function(`${GIJS.slice(a, b + 4)}\nreturn entryFor;`)();
}
const entryFor = liftEntryFor();
const looks = [...new Set([...Object.keys(MF.looks ?? {}), 'default', 'tournament', 'sp', 'no_such_look'])];
const classFixtures = Object.values(MF.tables ?? {}).flatMap((t) => Object.keys(t?.fixtures ?? {}));
const fixtures = [...new Set([...Object.keys(MF.fixtures ?? {}), ...classFixtures, 'canopy_panel', 'pendant_bar', 'snooker_luminaire', 'no_such_fixture'])];
const classes = [null, 'pool', ...Object.keys(MF.tables ?? {}), 'no_such_class'];
const combos = () => { const out = []; for (const c of classes) for (const f of fixtures) for (const l of looks) out.push([l, f, c]); return out; };

test('shippedEntry resolves exactly as gi.js entryFor over every fixture × look × table class', () => {
  const diffs = combos().filter(([l, f, c]) => shippedEntry(MF, l, f, c) !== entryFor(MF, l, f, c));
  assert.deepEqual(diffs, []);
});

test('every resolved probe grid exists on disk', () => {
  const missing = [];
  for (const [l, f, c] of combos()) {
    const e = shippedEntry(MF, l, f, c);
    const pf = e?.files?.probes;
    if (pf && !fs.existsSync(path.join(ROOT, 'web/assets/gi', pf))) missing.push(`${c ?? 'pool'}/${f}/${l}: ${pf}`);
  }
  assert.deepEqual(missing, []);
});

test('a committed per-fixture bake resolves, and an unbaked entry resolves to no grid', () => {
  const baked = Object.entries(MF.fixtures ?? {}).filter(([, node]) => Object.values(node.looks ?? {}).some((e) => e && !e.unbaked && e.files?.probes));
  assert.ok(baked.length > 0, 'the manifest commits no per-fixture bake — the parity test would be vacuous');
  for (const [f, node] of baked) for (const [l, e] of Object.entries(node.looks)) if (e && !e.unbaked) assert.equal(shippedEntry(MF, l, f, null), e, `${f}/${l}`);
  assert.ok(classFixtures.length > 0, 'the manifest commits no per-class fixture — the class branch would go unchecked');
  const stubs = Object.entries(MF.fixtures ?? {}).filter(([, node]) => node?.unbaked);
  assert.ok(stubs.length > 0, 'the manifest carries no unbaked fixture stub');
  for (const [f] of stubs) for (const l of looks) assert.equal(shippedEntry(MF, l, f, null), null, `${f}/${l} is an unbaked stub`);
  // the committed manifest flags only whole fixtures, so plant gi.js's look-level flag on every guarded branch
  const P = structuredClone(MF); const planted = [];
  const plant = (node, f, c) => { const [l] = Object.keys(node?.looks ?? {}); if (l) { node.looks[l] = { ...node.looks[l], unbaked: true }; planted.push([l, f, c]); } };
  for (const [f, node] of Object.entries(P.fixtures ?? {})) plant(node, f, null);
  for (const [c, t] of Object.entries(P.tables ?? {})) { plant(t, 'canopy_panel', c); for (const [f, node] of Object.entries(t?.fixtures ?? {})) plant(node, f, c); }
  assert.ok(planted.some(([, , c]) => c === null) && planted.some(([, f, c]) => c && f === 'canopy_panel') && planted.some(([, f, c]) => c && f !== 'canopy_panel'),
    `a guarded branch got no plant: ${JSON.stringify(planted)}`);
  for (const [l, f, c] of planted) assert.equal(shippedEntry(P, l, f, c), null, `planted unbaked ${c ?? 'pool'}/${f}/${l}`);
  assert.deepEqual(combos().filter(([l, f, c]) => shippedEntry(P, l, f, c) !== entryFor(P, l, f, c)), []);
});

test('PLANT: the pre-GH-1070 lookup (no looks level, swapped fallback) disagrees with gi.js on a committed bake', () => {
  const old = (mf, l, f) => mf.fixtures?.[f]?.[l] ?? mf.fixtures?.[l]?.[f] ?? null;
  const caught = combos().filter(([l, f, c]) => (c === null || c === 'pool') && f !== 'canopy_panel' && old(MF, l, f) !== entryFor(MF, l, f, c));
  assert.ok(caught.length > 0, 'the parity check would not catch the old lookup');
});
