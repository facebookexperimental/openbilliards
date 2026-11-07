// Copyright (c) Meta Platforms, Inc. and affiliates.

// PHOTO edge distances transferred through the disclosed EST source pose.
// The external product photograph is neither bundled nor required here.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Matrix4, Vector4 } from '../../../web/vendor/three.module.min.js';

export function deriveFascia(evidence) {
  if (!evidence.tag?.includes('EST') || !evidence.camera.tag?.includes('EST')) {
    throw new Error('OC3 fascia transfer must retain its EST camera boundary');
  }
  const { camera, render_plane: plane } = evidence;
  // FIX29: end-elevation evidence uses the x-normal apron plane. The
  // historical z-normal recipe and its output stay unchanged by default.
  const axis = plane.axis ?? 'z';
  const outer = plane[`outer_${axis}_m`];
  if (!['x', 'z'].includes(axis) || !Number.isFinite(outer)) {
    throw new Error('OC3 fascia requires an axis-aligned vertical source plane');
  }
  const view = new Matrix4().fromArray(camera.view);
  const projection = new Matrix4().fromArray(camera.projection);
  const vp = projection.clone().multiply(view), inverse = vp.clone().invert();
  const origin = new Vector4(0, 0, 0, 1).applyMatrix4(view.clone().invert());
  const [width, height] = camera.viewport, matrix = vp.elements;
  const occluder = evidence.render_occluder;
  if (!occluder?.tag?.includes('DERIVED') || !Array.isArray(occluder.edge_world_m)
      || occluder.edge_world_m.length !== 2
      || occluder.edge_world_m.some(point => !Array.isArray(point)
        || point.length !== 3 || point.some(value => !Number.isFinite(value)))) {
    throw new Error('OC3 fascia requires the measured emitted rail occluder edge');
  }
  const edge = occluder.edge_world_m.map(point => {
    const p = new Vector4(...point, 1).applyMatrix4(vp);
    return [(1 + p.x / p.w) * width / 2 - 0.5,
      (1 - p.y / p.w) * height / 2 - 0.5];
  });
  const occluderPixel = x => {
    const [a, b] = edge;
    if (a[0] === b[0] || x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) {
      throw new Error('OC3 fascia column is outside its proved occluder edge');
    }
    return a[1] + (x - a[0]) * (b[1] - a[1]) / (b[0] - a[0]);
  };
  const unprojectY = (x, y) => {
    const p = new Vector4(2 * (x + 0.5) / width - 1,
      1 - 2 * (y + 0.5) / height, 1, 1).applyMatrix4(inverse);
    p.multiplyScalar(1 / p.w);
    const t = (outer - origin[axis]) / (p[axis] - origin[axis]);
    return origin.y + t * (p.y - origin.y);
  };
  const topPixel = (x) => {
    const nx = 2 * (x + 0.5) / width - 1;
    const k = [0, 1, 2, 3].map((i) => matrix[i * 4] - nx * matrix[i * 4 + 3]);
    const free = axis === 'z' ? 0 : 2, fixed = axis === 'z' ? 2 : 0;
    const run = -(k[1] * plane.top_y_m + k[fixed] * outer + k[3]) / k[free];
    const p = new Vector4(axis === 'z' ? run : outer, plane.top_y_m,
      axis === 'z' ? outer : run, 1).applyMatrix4(vp);
    return (1 - p.y / p.w) * height / 2 - 0.5;
  };
  const bound = 2 * evidence.placement_per_edge_px.value;
  const rows = evidence.observations.map((row) => {
    const distance = row.bottom_px - row.top_px;
    const fullTop = topPixel(row.x_px), railEdge = occluderPixel(row.x_px);
    // The photograph measures the VISIBLE fascia, below the rail silhouette.
    // Inverting from the hidden full beam top loses the overhang projection.
    const top = Math.max(fullTop, railEdge);
    let interval = [distance - bound, distance + bound];
    if (row.top_interval_px || row.bottom_interval_px) {
      for (const [name, value] of [['top', row.top_px], ['bottom', row.bottom_px]]) {
        const edge = row[`${name}_interval_px`];
        if (!Array.isArray(edge) || edge.length !== 2 || edge.some(v => !Number.isFinite(v))
          || edge[0] > value || edge[1] < value) throw new Error('Invalid OC3 measured edge interval');
      }
      interval = [row.bottom_interval_px[0] - row.top_interval_px[1],
        row.bottom_interval_px[1] - row.top_interval_px[0]];
    }
    if (!(interval[0] > 0)) throw new Error('Unresolved OC3 fascia edges');
    const depth = (pixels) => 1000 * (plane.top_y_m - unprojectY(row.x_px, top + pixels));
    return { ...row, distance_px: distance, projected_full_beam_top_px: fullTop,
      projected_occluder_edge_px: railEdge, projected_top_px: top,
      hidden_fascia_projection_px: top - fullTop,
      height_mm: depth(distance), placement_interval_mm: interval.map(depth) };
  });
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b), middle = sorted.length / 2;
    return sorted.length % 2 ? sorted[Math.floor(middle)] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  if (!rows.length) throw new Error('No OC3 fascia observations');
  return { tag: 'DERIVED(PHOTO edges, EST camera); no MFR tolerance', rows,
    height_mm: median(rows.map((row) => row.height_mm)),
    placement_interval_mm: [median(rows.map((row) => row.placement_interval_mm[0])),
      median(rows.map((row) => row.placement_interval_mm[1]))] };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const definition = JSON.parse(fs.readFileSync(new URL('../../../docs/geometry/cn8-pocket-oc3-appearance.json', import.meta.url)));
  const result = deriveFascia(definition.sources.fascia);
  if (process.argv.includes('--check')
    && Math.abs(result.height_mm - definition.parameters.fascia_height_mm.value) > 1e-8) {
    throw new Error('OC3 fascia height differs from its derivation');
  }
  console.log(JSON.stringify(result, null, 2));
}
