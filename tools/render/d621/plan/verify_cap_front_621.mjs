// Copyright (c) Meta Platforms, Inc. and affiliates.

// D621-O22 R4 precondition: evaluate the proposed ENTRY railLap before adopting it.
// MODEL: the cap front meets the body's back-top corner. MFR: CU-04 remains the
// WPA featherstrip limit. The actual crowned lip, not just its plateau, is checked.
// Run with node --experimental-vm-modules; --revision selects an immutable source.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { tableModule } from './table_module_621.mjs';

const args = process.argv.slice(2); // DERIVED: node executable and script arguments.
const arg = (key) => { const i = args.indexOf(key); return i < 0 ? null : args[i + 1]; };
const { api, sourceSha256, revision } = await tableModule(arg('--revision'));
const rows = [];
const mm = 1000; // DERIVED: metres to millimetres.
const proposedLap = 0; // DERIVED R4: cap front = CU-04, no overlap past the featherstrip.
for (const size of ['9ft', '8ft', '7ft']) {
  const G = api.makeGeom(`diamond_proam_${size}`);
  const candidate = { ...G, render: { ...G.render, railLap: proposedLap } };
  const beforeF = api.d621FrameGeom(G), afterF = api.d621FrameGeom(candidate);
  const before = api.d621RailPlans(G, beforeF), after = api.d621RailPlans(candidate, afterF);
  const prof = api.cushionProfile(G.render.cushionFamily,
    G.kernel.noseHeightFrac * G.render.profileBallD, G.CW, G.render.cushionProfile);
  const lipY = G.render.frameTop - api.d621CrownDropAt(G.render.capCrown, proposedLap);
  const corner = api.bootRingPlan(candidate, 'corner');
  const side = api.bootRingPlan(candidate, 'side');
  // DERIVED: changing only KIN shortens the cap's lip-to-cut run. The corner
  // circle/joints and side circle/kerf remain the identical cut construction.
  for (const key of ['P', 'rCut', 'J_L', 'J_E', 'C_L', 'C_E', 'T_L', 'rN', 'notchApexX']) {
    assert.deepEqual(after.corner[key], before.corner[key], `${size}: cut ${key} changed`);
  }
  assert.equal(afterF.KOUT, beforeF.KOUT, `${size}: RB-01 changed`);
  assert.equal(afterF.KOUTE, beforeF.KOUTE, `${size}: end RB-01 changed`);
  assert.equal(-afterF.KIN, G.CW, `${size}: cap front misses CU-04`);
  assert(lipY > prof.zTop, `${size}: the crowned lip intersects the cushion top`);
  assert.equal(after.corner.rN, side.rOut, `${size}: side cut no longer follows its ring`);
  assert(after.corner.rCut > corner.rOut, `${size}: corner cut does not clear the ring`);
  const railCount = 6; // TESSELLATION: the table's straight rail count, as ordered.
  assert.equal(after.planks.length, railCount);
  rows.push({ size, cap_count: after.planks.length, cap_front_before_mm: -beforeF.KIN * mm,
    cap_front_after_mm: -afterF.KIN * mm, cushion_top_mm: prof.zTop * mm,
    cap_plateau_mm: G.render.frameTop * mm, crowned_lip_mm: lipY * mm,
    minimum_lip_step_mm: (lipY - prof.zTop) * mm,
    plateau_step_mm: (G.render.frameTop - prof.zTop) * mm,
    corner_cut_clearance_mm: (after.corner.rCut - corner.rOut) * mm,
    side_cut_radius_minus_ring_mm: (after.corner.rN - side.rOut) * mm,
    outer_edges_unchanged: true, pocket_cut_construction_unchanged: true, pass: true });
}
const result = { tool: 'verify_cap_front_621.mjs', mode: 'render-only pre-adoption diagnostic',
  source_revision: revision, source_table_js_sha256: sourceSha256, load_average: os.loadavg(),
  tags: { cap_front: 'DERIVED(MODEL relation + MFR CU-04)', crown: 'MODEL',
    minimum_lip_step: 'DERIVED(cap crown minus unchanged CU-09)',
    corner_cut_clearance: 'MODEL(existing CP-15)', side_cut: 'MODEL(existing ring relation)' },
  note: 'The side cut is tangent to the ring, not a positive-clearance gap; its tessellation count is unchanged (endpoint angles may change). The plateau step is not the minimum lip step. No pixels were captured.',
  rows, verdict: 'PASS' };
const out = arg('--out');
if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); // TESSELLATION: JSON indentation.
}
console.log(JSON.stringify(result, null, 2)); // TESSELLATION: JSON indentation.
