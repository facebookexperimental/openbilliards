// Copyright (c) Meta Platforms, Inc. and affiliates.

// DERIVED: immutable entry/kernel/rail-plan fingerprints for the O22 fence.
// Uses the real geometry module; no browser, model data, or kernel execution.
import { createHash } from 'node:crypto';
import { tableModule } from './table_module_621.mjs';
const args = process.argv.slice(2); // DERIVED: node executable and script.
const revisionIndex = args.indexOf('--revision');
const revision = revisionIndex < 0 ? null : args[revisionIndex + 1];
const { api, sourceSha256 } = await tableModule(revision);
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const entries = {};
for (const id of Object.keys(api.TABLE_SPECS)) {
  const G = api.makeGeom(id);
  const prof = api.cushionProfile(G.render.cushionFamily,
    G.kernel.noseHeightFrac * G.render.profileBallD, G.CW, G.render.cushionProfile);
  const polys = api.railPolysFor(G);
  const cushions = polys.map((poly) => {
    let geometry = api.cushionGeom(G, poly, prof);
    // C9: include the shipped terminal return; older revisions have no cutter.
    if (api.proamCushionEnds) geometry = api.proamCushionEnds(G, geometry, prof);
    const result = hash({ positions: Array.from(geometry.attributes.position.array),
      indices: geometry.index ? Array.from(geometry.index.array) : [] });
    geometry.dispose();
    return result;
  });
  entries[id] = { kernel: api.TABLE_SPECS[id].kernel,
    kernel_sha256: hash(api.TABLE_SPECS[id].kernel),
    render_sha256: hash(api.TABLE_SPECS[id].render),
    rail_plan_sha256: hash(polys), cushion_mesh_sha256: hash(cushions) };
}
console.log(JSON.stringify({ tag: 'DERIVED', source_revision: revision,
  source_table_js_sha256: sourceSha256, shared_family_sha256: hash(api.CUSHION_FAMILIES),
  entries }, null, 2)); // TESSELLATION: JSON indentation.
