#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Reproduce the nominal Diamond render/aim plans from the repository renderer.
// No scene build, purchased-model input or geometric acceptance claim.
// --write updates the 9 ft definition and re-derives 8/7 ft; regenerate the
// definition-bound leaves and seam/CN8 stamps afterwards. --stamp then binds
// their final source bytes in a separate receipt; --check verifies both.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NINE = 'docs/geometry/diamond-proam-9ft-table-definition.json';
const DERIVER = 'tools/render/gh488d/derive_size_variant_621.py';
const RECEIPT = 'docs/geometry/diamond-pocket-construction.json';
const R15_SHA = '2ffec8d43eb4552918b9896d50c46e8f86d374a3301dc62c4525a293d093da87';
const MAIN = '10983e701575a6d397e6e4073a38075b291c2e2e';
const args = process.argv.slice(2);
assert(args.length === 1 && ['--write', '--stamp', '--check'].includes(args[0]),
  'Usage: node tools/render/derive-pocket-definitions.mjs --write|--stamp|--check');
const mode = args[0], read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
const mm = value => {
  assert(Number.isFinite(value), 'Non-finite construction coordinate');
  return Number((value * 1000).toFixed(9));
};
registerHooks({resolve(specifier, context, next) {
  return specifier === 'three'
    ? {url: new URL('../../web/vendor/three.module.min.js', import.meta.url).href, shortCircuit: true}
    : next(specifier, context);
}});
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.location = {search: ''};
globalThis.localStorage = {getItem: () => null};
const table = await import('../../web/scene/table.js');
const cue = await import('../../web/scene/cuestick.js');
const dimensions = r => ({centre_from_nose_intersection_mm: mm(r.uOut), outer_wall_r_mm: mm(r.rOut),
  throat_centre_from_nose_intersection_mm: mm(r.uIn), throat_r_mm: mm(r.rIn), leg_inner_edge_from_axis_mm: mm(r.wLeg)});
const tables = [];
for (const size of ['9ft', '8ft', '7ft']) {
  const id = `diamond_proam_${size}`, spec = table.specFor(id), floor = cue.railGeomFor(id), kinds = {};
  for (const kind of ['corner', 'side']) {
    const ring = table.bootRingPlan(spec, kind), opening = table.pocketOpeningPlan(spec, kind, ring);
    const aim = floor.mouths.ring[kind];
    assert(ring?.fitted && opening?.contour.length === 132, `${id}/${kind}: missing complete render construction`);
    assert.equal(aim.joinBands, undefined, `${id}/${kind}: render joins leaked into gameplay`);
    const us = opening.contour.map(p => p[0]), ws = opening.contour.map(p => p[1]);
    kinds[kind] = {
      render_ring: dimensions(ring),
      aim_ring: {...dimensions(aim), glue_at_frame_top_mm: mm(aim.glue)},
      opening: {
        front_radius_mm: mm(opening.frontRadius), front_centre_mm: mm(opening.frontCentre),
        front_transition_uw_mm: [mm(opening.frontU), mm(opening.frontW)],
        leg_join_uw_mm: [mm(opening.joinU), mm(opening.width)],
        rear_tangent_uw_mm: [mm(opening.archU), mm(opening.width)],
        rear_centre_mm: mm(ring.uIn), rear_radius_mm: mm(ring.rIn - opening.land),
        rear_apex_mm: mm(ring.uIn + ring.rIn - opening.land),
        maximum_width_mm: mm(Math.max(...ws) - Math.min(...ws)),
        axis_length_mm: mm(Math.max(...us) - Math.min(...us)),
        front_return_depth_mm: mm(opening.frontDepth), rear_return_depth_mm: mm(opening.returnDepth),
      },
    };
  }
  tables.push({id, size, kinds});
}
// Size variants change straight spans only. Rounding to the definition's
// existing 1e-9 mm precision removes coordinate-translation roundoff; it is
// a documentary precision, not a clearance tolerance or a renderer change.
for (const row of tables.slice(1)) assert.deepEqual(row.kinds, tables[0].kinds, `${row.id}: pocket furniture is not unscaled`);
const geometry = {units: 'mm', decimal_places: 9, kinds: tables[0].kinds};
const geometrySha = sha(JSON.stringify(geometry));
const reference = {schema: 'diamond-pocket-definition/1', geometry_sha256: geometrySha, receipt: RECEIPT,
  scope: 'Nominal render and gameplay aim plans; final source hashes live in the separate receipt to avoid a definition/import hash cycle.',
  all_three_sizes: true, nominal_plan_not_clearance_oracle: true};

function definition(source) {
  const result = structuredClone(source);
  assert(['r15', 'r16'].includes(result.doc.revision), 'Review a new definition revision explicitly');
  const history = {revision: 'r16', date: '2026-11-07',
    note: 'Refresh CP-11/SP-10 and SL-01 from the accepted complete render U, including its scaled rear apex and outer wall. Record the unchanged main gameplay aim ring separately. The previous r15 nominal values and receipts remain history. No renderer dimension, kernel input, tolerance or owner-approved look is changed by this documentation update.'};
  const previous = result.doc.revision_history.find(row => row.revision === 'r16');
  if (previous) assert.deepEqual(previous, history, 'Do not rewrite the r16 history');
  else result.doc.revision_history.push(history);
  result.doc.revision = 'r16';
  for (const [id, kind] of [['CP-11', 'corner'], ['SP-10', 'side']]) {
    const feature = result.features.find(row => row.id === id), value = feature.value, actual = geometry.kinds[kind];
    value.ring_r15_reference ??= {definition_sha256: R15_SHA, value: structuredClone(value.ring)};
    value.ring = {...value.ring, ...actual.render_ring,
      method: 'bootRingPlan reads the final cushion terminal layout at every height. It scales the recorded inner/outer rear apexes by rail band and the inner band by canonical mouth width, sets the leg to the narrowest terminal width, and covers the widest cloth end plus leather thickness. These are renderer-derived plan parameters, not new model measurements.',
      construction_receipt: reference};
    value.aim_ring = {tag: 'DERIVED', ...actual.aim_ring, reference_commit: MAIN,
      source: 'cuestick.js aimRingPlan reads the recorded mouthCollar.ring circles and main\'s glueAt(frameTop) arithmetic. No pocketAssembly refit, joined bands or mouth-track plan enters the gameplay floor.',
      scope: 'Gameplay slider minimum, AUTO and shot clamp only; the drawn cue uses value.ring.'};
    value.outer_landing_note = 'outer_landing_mm is the retained section/style input. value.ring is the applied render U; value.aim_ring is the unchanged main gameplay ring. ring_style_reference retains the original measurement evidence.';
    feature.source.current_application = 'r16 names the final render construction and unchanged gameplay aim ring separately. Original section/top-profile evidence remains style provenance with its modifier caveat; the r15 stale nominal values are preserved in ring_r15_reference.';
    feature.provenance.source = 'Unchanged canonical jaw planes and final cushion terminal layout; recorded section/style ratios scaled by the canonical mouth and rail band. The render U and main gameplay aim ring are separate consumers.';
  }
  const slate = result.features.find(row => row.id === 'SL-01'), value = slate.value;
  value.r15_contour_reference ??= {definition_sha256: R15_SHA, plans: structuredClone(value.plans),
    construction_receipt_sha256: value.construction_receipt_sha256};
  for (const kind of ['corner', 'side']) value.plans[kind] = {...value.plans[kind], ...geometry.kinds[kind].opening};
  delete value.construction_receipt_sha256;
  value.construction_receipt = reference;
  value.construction_receipt_scope = 'Horizontal contour and separate vertical return depths from the renderer. rear_apex_mm is measured from the nose intersection; axis_length_mm spans front to rear and is not the rear-apex coordinate.';
  slate.source.doc = 'r16 renderer-derived pocketOpeningPlan contour and vertical pocketOpeningLip. The front uses the retained fall datum; the rear is the final scaled/refitted render U. PF-02 supplies corner front depth. The gameplay aim ring remains separate; historical drills, circles and stale r15 nominal contours are reference history.';
  return result;
}

const nine = definition(JSON.parse(read(NINE)));
if (mode === '--write') {
  // Preserve Python-authored numeric tokens in every untouched feature.
  // Whole-document JSON.stringify turns e.g. RC-01's 2.0 into 2, changing
  // the generated leaf's canonical digest despite equal renderer values.
  const patch = {revision: nine.doc.revision,
    history: nine.doc.revision_history.find(row => row.revision === 'r16'),
    features: nine.features.filter(row => ['CP-11', 'SP-10', 'SL-01'].includes(row.id))};
  execFileSync('python3', ['-c', `
import json, pathlib, sys
target = pathlib.Path(sys.argv[1])
document = json.loads(target.read_text())
patch = json.load(sys.stdin)
assert document['doc']['revision'] in ('r15', 'r16')
assert patch['revision'] == 'r16'
replacements = {row['id']: row for row in patch['features']}
assert set(replacements) == {'CP-11', 'SP-10', 'SL-01'}
assert all(sum(row['id'] == identifier for row in document['features']) == 1
           for identifier in replacements)
document['features'] = [replacements.get(row['id'], row) for row in document['features']]
existing = [row for row in document['doc']['revision_history'] if row['revision'] == 'r16']
if existing:
    assert existing == [patch['history']]
else:
    document['doc']['revision_history'].append(patch['history'])
document['doc']['revision'] = patch['revision']
target.write_text(json.dumps(document, indent=2, ensure_ascii=False) + '\\n')
`, path.join(ROOT, NINE)], {cwd: ROOT, input: JSON.stringify(patch), stdio: ['pipe', 'inherit', 'inherit']});
  let deriver = read(DERIVER);
  const replace = (expression, replacement) => {
    assert.equal([...deriver.matchAll(expression)].length, 1, 'Deriver pin must be unique');
    deriver = deriver.replace(expression, replacement);
  };
  replace(/^SOURCE_9FT_SHA256 = "[0-9a-f]{64}".*$/gm,
    `SOURCE_9FT_SHA256 = "${sha(read(NINE))}"  # DERIVED: r16 render construction and separate main aim ring.`);
  replace(/^SOURCE_9FT_REVISION = "r\d+".*$/gm, 'SOURCE_9FT_REVISION = "r16"  # DERIVED: pocket construction doc.revision.');
  fs.writeFileSync(path.join(ROOT, DERIVER), deriver);
  for (const size of ['8ft', '7ft']) execFileSync('python3', [DERIVER, '--size', size, '--write'], {cwd: ROOT, stdio: 'inherit'});
  console.log(`POCKET-DEFINITION WRITE: ${geometrySha}; rebind generated leaves/stamps, then run --stamp`);
} else {
  assert.deepEqual(JSON.parse(read(NINE)), nine, '9 ft pocket definition differs from the final renderer');
  for (const row of tables.slice(1)) {
    const doc = JSON.parse(read(`docs/geometry/diamond-proam-${row.size}-table-definition.json`));
    for (const id of ['CP-11', 'SP-10', 'SL-01']) assert.deepEqual(doc.features.find(f => f.id === id),
      nine.features.find(f => f.id === id), `${row.id}/${id}: carried pocket definition differs`);
  }
  const files = ['web/scene/table.js', 'web/scene/cuestick.js', 'web/scene/diamondproam_nose.js',
    'web/scene/diamondproam_corner.js', NINE, 'docs/geometry/diamond-proam-8ft-table-definition.json',
    'docs/geometry/diamond-proam-7ft-table-definition.json', DERIVER];
  const receipt = {schema: 'diamond-pocket-construction/1', geometry_sha256: geometrySha, geometry,
    table_ids: tables.map(row => row.id), renderer_sha256: sha(read('web/scene/table.js')),
    sources: Object.fromEntries(files.map(name => [name, sha(read(name))])),
    instrument: 'tools/render/derive-pocket-definitions.mjs', instrument_sha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
    scope: 'Nominal plans reproduced from the final renderer; no geometric acceptance or visual-review claim.'};
  if (mode === '--stamp') fs.writeFileSync(path.join(ROOT, RECEIPT), json(receipt));
  else assert.deepEqual(JSON.parse(read(RECEIPT)), receipt, 'Pocket construction receipt is stale');
  console.log(`POCKET-DEFINITION ${mode === '--stamp' ? 'STAMP' : 'PASS'}: ${geometrySha}, renderer ${receipt.renderer_sha256}`);
}
