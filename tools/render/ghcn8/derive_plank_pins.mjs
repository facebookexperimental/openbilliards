// Copyright (c) Meta Platforms, Inc. and affiliates.

// Landing pass (class G): derive the ghcn8 suite expectations that the
// maintainer-accepted apron rebuild (f93c0276..ef4bb211, chamfer 711789a0)
// changed, from the production geometry through the existing fixtures. Every
// number the aligned tests pin is printed here; nothing is authored.
//   node tools/render/ghcn8/derive_plank_pins.mjs [--out fresh.json] [--renderer path/to/table.js]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCornerBuilder, CN8_CORNER_IDENTITIES } from './cn8_emitted_checks.mjs';
import { loadRailBuilder } from './cn8_rail_checks.mjs';
import { loadTongueBuilder } from './cn8_tongue_checks.mjs';
import { uvBuffers, measureRailUV } from './cn8_uv_checks.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ALIASES = ['chinese8_pro_9ft', 'joy_q8_9ft'];
const BATCH_CALL = '  cn8D3BatchDomains(geometry);';

export function derivePlankPins({ renderer = path.join(ROOT, 'web/scene/table.js') } = {}) {
  const source = fs.readFileSync(renderer, 'utf8');
  const clip = fs.readFileSync(path.join(ROOT, 'web/scene/cn8mid.js'), 'utf8');
  const input = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/geometry/cn8-pocket-d3-source-inputs.json')));
  const [L, W] = input.mfr_playing_dimensions_mm.value.map(v => v / 1000);
  const corner = loadCornerBuilder(source), { K } = corner;
  const frame = id => ({ id, L, W, CW: 0, cd: 0, template: true,
    render: { style: 'cn8', frameWidth: K.A_R, frameTop: K.DECK },
    kernel: { sidePocketRadius: K.R, cornerPocketRadius: K.R, sidePocketDepth: 0 } });
  if (source.split(BATCH_CALL).length !== 2) throw new Error('The emitted plank must have one batching site');
  const legacy = loadRailBuilder(source.replace(BATCH_CALL, ''), clip), current = loadRailBuilder(source, clip);

  // test_d3_batches: legacy layer-order material groups per plank and alias.
  const batches = {};
  for (const id of ALIASES) {
    batches[id] = { legacy_groups: legacy.build(frame(id)).map(r => r.geometry.groups.length),
      batched_groups: current.build(frame(id)).map(r => r.geometry.groups.length),
      triangles: current.build(frame(id)).map(r => r.geometry.index.count / 3) };
  }

  // test_d3_uv: quads whose emitter-rule U1 axis differs from the retired
  // longest-horizontal-edge heuristic (a non-plank row name selects the heuristic).
  const chamfer = current.build(frame(ALIASES[0])).map((rail, i) => {
    const emitter = measureRailUV(uvBuffers(rail.geometry, rail.name));
    const heuristic = measureRailUV(uvBuffers(rail.geometry, `probe-heuristic-${i}`));
    let differs = 0, diagonal = 0;
    for (let r = 0; r < emitter.rows.length; r++) {
      const a = emitter.rows[r], b = heuristic.rows[r];
      if (b && a.triangles.join() === b.triangles.join() && a.plan_projection_axis !== b.plan_projection_axis) differs++;
    }
    const p = rail.geometry.attributes.position.array, index = rail.geometry.index.array;
    for (let t = 0; t < index.length; t += 3) {
      const [a, b, c] = [0, 1, 2].map(j => index[t + j]);
      const level = [a, b, c].filter(v => p[v * 3 + 1] === p[a * 3 + 1]);
      if (level.length !== 2) continue;
      const dx = Math.abs(p[level[1] * 3] - p[level[0] * 3]), dz = Math.abs(p[level[1] * 3 + 2] - p[level[0] * 3 + 2]);
      if (dx > 1e-3 && dz > 1e-3) diagonal++;
    }
    return { plank: i, rows: emitter.rows.length, emitter_status: emitter.status, heuristic_status: heuristic.status,
      axis_differs: differs, diagonal_edge_triangles: diagonal };
  });

  // test_cn8_emitted_checks A3: the shipped section recipe's radial extent per
  // station against the plan band [0, width].
  const g = corner.build(K, 2.54, 1.26, 1, 1), u = g.userData.cn8D3;
  let beyond = 0, minInner = 0, maxOuter = 0, bandWidth = null;
  for (const station of u.stations) {
    const pair = corner.pair(K, station), width = Math.hypot(pair.outer[0] - pair.inner[0], pair.outer[1] - pair.inner[1]);
    bandWidth = bandWidth === null ? width : Math.min(bandWidth, width);
    const radial = corner.section(width, station).profile.map(q => q[0]);
    const lo = Math.min(...radial), hi = Math.max(...radial) - width;
    if (Math.abs(lo) > 1e-7 || Math.abs(hi) > 1e-7) beyond++;
    minInner = Math.min(minInner, lo); maxOuter = Math.max(maxOuter, Math.abs(hi));
  }
  const a3 = { stations: u.stations.length, profile_count: u.profileCount, plan_band_width_mm: bandWidth * 1000,
    stations_beyond_band_1e7: beyond, recipe_min_inner_um: minInner * 1e6, recipe_outer_abs_max_um: maxOuter * 1e6,
    joy_corner: source.match(/const CN8_JOY_CORNER = .*;/)?.[0] ?? null };

  // test_d3_tongue: the closed-jaw layout published by the shipped tongue.
  const tongue = loadTongueBuilder(source);
  const jaws = [];
  for (const [id, sx, sz] of CN8_CORNER_IDENTITIES) for (const mesh of tongue.build(L, W, id, sx, sz)) {
    const meta = mesh.geometry.userData, n = mesh.geometry.attributes.position.count;
    const rows = meta.cn8D3Mating.rows.length, cols = meta.tongueCols.stride;
    jaws.push({ name: mesh.name, vertices: n, rows, cols, lattice: rows * cols, appended: n - rows * cols, closed_jaw: meta.cn8ClosedJaw ?? null });
  }
  return { schema: 'cn8-landing-plank-pins/1', tag: 'DERIVED from the production builders through the ghcn8 fixtures',
    renderer: path.relative(ROOT, renderer), batches, chamfer_axis_census: chamfer, a3_section_recipe: a3, tongue_jaws: jaws };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let out, renderer;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && args[i + 1]) out = path.resolve(args[++i]);
    else if (args[i] === '--renderer' && args[i + 1]) renderer = path.resolve(args[++i]);
    else throw new Error('Usage: derive_plank_pins.mjs [--out fresh.json] [--renderer table.js]');
  }
  if (out && fs.existsSync(out)) throw new Error('derive_plank_pins requires a fresh output path');
  const result = derivePlankPins({ renderer });
  if (out) { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, JSON.stringify(result, null, 2) + '\n'); }
  console.log(JSON.stringify(result));
}
