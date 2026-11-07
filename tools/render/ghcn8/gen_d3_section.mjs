// Copyright (c) Meta Platforms, Inc. and affiliates.

// Compile the tagged numeric measurement packet into the renderer constant.
// Runtime does not fetch measurements or any source image/model.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export function embeddedSection(definition, sha256) {
  const p = definition.parameters;
  return {
    definitionSha256: sha256,
    crownOffset: p.crown_to_rail_top_mm.value / 1000,
    woodStop: p.wood_stop_to_cover_end_mm.value / 1000,
    woodJointTopInset: p.wood_joint_top_inset_mm.value / 1000,
    woodJointTopDrop: p.wood_joint_top_drop_mm.value / 1000,
    clothRecess: p.cloth_below_cover_upper_plane_mm.value / 1000,
    tongueSupport: definition.tongue_support.value,
    jointPolygonOffset: definition.joint_polygon_offset,
    radius: p.roll_radius_mm.value / 1000,
    gauge: p.shell_gauge_mm.value / 1000,
    drop: p.cover_drop_mm.value / 1000,
    body: definition.body_profile_mm.map(([h, r]) => [h / 1000, r / 1000]),
    template: definition.hem_template_phase_mm.map(([phase, h]) => [phase, h / 1000]),
    amplitude: p.hem_amplitude_mm.value / 1000,
    hemTransition: p.hem_transition_start_mm.value / 1000,
    lobes: p.hem_lobes_per_half.value,
    stitchDrop: p.stitch_drop_mm.value / 1000,
    brown: parseInt(p.brown_albedo_hex.value, 16),
    grainRepeat: p.grain_repeat_mm.value / 1000,
    woodGrainRepeat: p.wood_grain_repeat_mm.value.map(value => value / 1000),
    sampling: definition.sampling.value,
  };
}

export function sectionLiteral(definition, sha256) {
  const text = JSON.stringify(embeddedSection(definition, sha256), null, 2);
  return `const CN8_D2_SECTION = ${text.slice(0, -2)},\n  get railTop() { return CN8_R82.DECK; }, // DERIVED: retained datum, single source\n  get crownTop() { return this.railTop + this.crownOffset; } // MODEL(Star) relative plane\n};\n\n`;
}

export function checkRendererGaugeCensus(section, ledger) {
  const row = ledger.rows.find((item) => item.id === 'PARAM-shell_gauge_mm');
  const mapping = ledger.rows.find((item) => item.id === 'PARAM-gauge_mapping');
  return row?.tag === 'EST' && Number.isFinite(row.value) && row.value / 1000 === section.gauge
    && mapping?.tag === 'EST' && mapping.value?.d3_fix1_est_mm === row.value ? []
    : [`census: renderer gauge ${section.gauge} m is not listed by the numeric EST wall-gauge and D2/D3 mapping rows`];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const input = new URL('../../../docs/geometry/cn8-pocket-d3-section.json', import.meta.url);
  const target = new URL('../../../web/scene/table.js', import.meta.url);
  const bytes = fs.readFileSync(input), definition = JSON.parse(bytes);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const source = fs.readFileSync(target, 'utf8');
  const start = source.indexOf('const CN8_D2_SECTION =');
  const end = source.indexOf("// D2's plan is the retained", start);
  if (start < 0 || end < 0) throw new Error('Measured section constant markers are absent');
  const next = source.slice(0, start) + sectionLiteral(definition, sha) + source.slice(end);
  if (process.argv.includes('--check')) {
    if (next !== source) throw new Error('D3 embedded section is stale');
    console.log('D3 embedded section OK');
  } else {
    fs.writeFileSync(target, next);
    console.log('D3 embedded section generated');
  }
}
