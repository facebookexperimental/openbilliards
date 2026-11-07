// Copyright (c) Meta Platforms, Inc. and affiliates.

import fs from 'node:fs';
import path from 'node:path';
import { MM, ringCrossings } from './cushion-ring.mjs';
import { sampledJawRuns, erosionVertex } from './jaw-erosion.mjs';

/** Pocketed-pool view, independent of the cn8 middle-pocket presentation.
 * All plot dimensions come from the committed calibration. Physical lines,
 * origins, rotations and erosion markers are DERIVED from exported plans. */
export function writePoolJawOverlay({ tableId, railIndex, jaw, G, poly, prof, ctx, backAt, oFAt, view, revision, out }) {
  const { halfSpanMm: span, gridMm: grid, labelMm: label } = view;
  const nose = ctx.noseEdge.findIndex(Boolean);
  const fixed = ctx.front.flatMap((front, edge) => front ? [] : [edge]);
  if (nose < 0 || ctx.noseEdge.filter(Boolean).length !== 1 || fixed.length !== 1) {
    throw new Error(`${tableId} rail${railIndex}: a pool body requires one nose and one FIXED back edge`);
  }
  const originIndex = jaw === 'start' ? nose : (nose + 1) % ctx.M;
  const origin = poly[originIndex];
  const outward = ctx.en[nose].map((v) => -v);
  const along = ctx.ed[nose].map((v) => jaw === 'start' ? v : -v);
  const local = (p) => {
    const delta = p.map((v, axis) => v - origin[axis]);
    return [delta[0] * outward[0] + delta[1] * outward[1],
      delta[0] * along[0] + delta[1] * along[1]];
  };
  const plot = (p) => { const [x, y] = local(p); return [x * MM, -y * MM]; };
  const mm = (v) => (v * MM).toFixed(2);
  const pair = (p) => `(${p.map(mm).join(', ')}) mm`;
  const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const arc = sampledJawRuns(poly, ctx).find((a) => a.nose === nose && a.jaw === jaw);
  const samples = [
    { name: 'plan o=0', ring: ctx.ringAt(0) },
    ...prof.rows.map((row, index) => ({ name: `profile row ${index}`, index, row,
      ring: ctx.ringAt(row.o, oFAt(row.o, row.z), backAt(row.z)) })),
  ];
  const crossings = samples.flatMap((s) => [...ringCrossings(s.ring)].map((c) => ({ sample: s.name, ...c })));
  const inView = (p) => plot(p).every((v) => Math.abs(v) <= span);
  const visibleCrossings = crossings.filter((c) => inView(c.point));
  const places = new Map();
  for (const c of visibleCrossings) {
    const key = c.point.map((v) => v.toFixed(-Math.log10(1e-9))).join(',');
    if (!places.has(key)) places.set(key, []);
    places.get(key).push(c);
  }
  const erosions = arc ? samples.filter((s) => s.row
    && (ctx.noseEdge[arc.i] ? s.row.o : oFAt(s.row.o, s.row.z)) > arc.rIn).map((sample) => {
    const oF = oFAt(sample.row.o, sample.row.z);
    const point = erosionVertex(poly, ctx, arc, sample.row.o, oF);
    if (!point) throw new Error(`${sample.name}: parallel jaw support lines`);
    const vertices = [];
    for (let i = arc.i; i <= arc.k + 1; i++) vertices.push(sample.ring[i]);
    const maxDistance = Math.max(...vertices.map((p) => Math.hypot(...p.map((v, axis) => v - point[axis]))));
    return { sample: sample.name, index: sample.index, row: sample.row, point,
      jawVertex: sample.ring[arc.i], maxDistance, vertices,
      ...(oF !== sample.row.o ? { oF } : {}) };
  }) : [];
  const backEdge = fixed[0], back = [poly[backEdge], poly[(backEdge + 1) % ctx.M]];
  const radiusName = arc && Math.abs(arc.radius - G.kernel.cornerJawRadius) <= 1e-9 ? 'cornerJawRadius'
    : arc && Math.abs(arc.radius - G.kernel.sideJawRadius) <= 1e-9 ? 'sideJawRadius' : null;
  const radiusLine = arc
    ? `${radiusName ? `EST kernel ${radiusName}=${mm(G.kernel[radiusName])}` : `DERIVED chord radius=${mm(arc.radius)}`} mm; DERIVED rIn=${mm(arc.rIn)} mm`
    : 'No sampled jaw arc in the exported plan; no eaten-fillet marker';
  const headers = [
    `${tableId} / rail${railIndex} / jaw ${jaw} / ${revision}`,
    `Family ${G.render.cushionFamily}: ${prof.rows.length} rows; ${crossings.length} strict crossings (${visibleCrossings.length} in view)`,
    `DERIVED origin ${pair(origin)} at nose edge ${nose}; local y points into the rail`,
    radiusLine,
    `DERIVED FIXED back edge ${backEdge}: ${pair(back[0])} to ${pair(back[1])}`,
    'Plan: black / profile: blue / FIXED back: orange / crossing: red / DERIVED w: green',
    `Grid ${grid} mm; labels ${label} mm; viewport +/-${span} mm; marker coordinates are kernel (x,y)`,
  ];
  const textSize = label / 2, thin = grid / label;
  const headerHeight = label * (headers.length + 1), margin = label * 2;
  const minX = -span - margin, minY = -span - headerHeight;
  const width = (span + margin) * 2, height = span * 2 + headerHeight + margin + label;
  const metadata = { tableId, railIndex, jaw, revision, provenance: 'DERIVED exported plan/profile measurements; jaw radii remain EST kernel-pinned estimates',
    frame: { originIndex, origin, outward, along, noseEdge: nose }, backEdge, back,
    arc, view, profile: prof, crossings, visibleCrossings, erosions };
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width * label / 2}" height="${height * label / 2}">`,
    `<title>${esc(`Pool jaw ring plan: ${tableId} rail${railIndex} ${jaw}`)}</title>`,
    `<desc>${esc(headers.join('\n'))}</desc>`,
    `<metadata>${esc(JSON.stringify(metadata))}</metadata>`,
    `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>`,
    `<style>text { font-family: monospace; font-size: ${textSize}px; fill: black; }
      .header { font-size: ${textSize - grid}px; }
      .axis { font-size: ${textSize - grid * 2}px; }
      .profile { fill: none; stroke: steelblue; stroke-width: ${thin}; }
      .plan { fill: none; stroke: black; stroke-width: ${grid / 2}; }
      .crossing { fill: white; stroke: crimson; stroke-width: ${grid / 2}; }
      .erosion { fill: none; stroke: seagreen; stroke-width: ${grid / 2}; }
      .jaw-vertex { fill: steelblue; stroke: white; stroke-width: ${thin}; }
    </style>`,
    ...headers.map((s, i) => `<text class="header" x="${-span}" y="${minY + label * (i + 1)}">${esc(s)}</text>`),
    `<defs><clipPath id="pocket"><rect x="${-span}" y="${-span}" width="${span * 2}" height="${span * 2}"/></clipPath></defs>`,
    '<g clip-path="url(#pocket)">',
  ];
  const line = (a, b, attrs) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${attrs}/>`;
  for (let d = -span; d <= span; d += grid) {
    const attrs = `stroke="${d % label === 0 ? 'silver' : 'gainsboro'}" stroke-width="${d % label === 0 ? thin : thin / 2}"`;
    svg.push(line([d, -span], [d, span], attrs), line([-span, d], [span, d], attrs));
  }
  const ringPath = (ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${plot(p).join(',')}`).join(' ') + ' Z';
  for (const s of samples.slice(1)) svg.push(`<path class="profile" data-row="${esc(s.name)}" d="${ringPath(s.ring)}"><title>${esc(JSON.stringify(s.row))}</title></path>`);
  svg.push(`<path class="plan" d="${ringPath(samples[0].ring)}"/>`);
  svg.push(line(plot(back[0]), plot(back[1]), `data-fixed-edge="${backEdge}" stroke="darkorange" stroke-width="${grid / 2}" stroke-dasharray="${label / 2} ${grid}"`));
  svg.push(line([0, -span], [0, span], `stroke="slategray" stroke-width="${thin}"`));
  svg.push(line([-span, 0], [span, 0], `stroke="slategray" stroke-width="${thin}"`));
  for (const group of places.values()) {
    const point = group[0].point, [x, y] = plot(point);
    svg.push(`<g class="crossing" data-kernel-point="${esc(JSON.stringify(point))}"><title>${esc(`Kernel ${pair(point)}; ${group.map((c) => `${c.sample} edges ${c.edges.join('/')}`).join('; ')}`)}</title><circle cx="${x}" cy="${y}" r="${grid}"/></g>`);
  }
  let labelY = -span + label;
  for (const e of erosions) {
    const [x, y] = plot(e.point), [vx, vy] = plot(e.jawVertex);
    const captions = [`DERIVED w, row ${e.index}`, `x=${mm(e.point[0])}, y=${mm(e.point[1])} mm`,
      `o=${mm(e.row.o)}${e.oF === undefined ? '' : `, oF=${mm(e.oF)}`}, z=${mm(e.row.z)} mm`,
      e.maxDistance <= 1e-9 ? 'Jaw vertices on w' : `Max jaw gap=${mm(e.maxDistance)} mm`];
    svg.push(line([vx, vy], [x, y], `stroke="seagreen" stroke-width="${thin}" stroke-dasharray="${grid} ${grid}"`));
    svg.push(`<circle class="jaw-vertex" cx="${vx}" cy="${vy}" r="${grid / 2}" data-row="${e.index}"><title>${esc(`First run vertex ${pair(e.jawVertex)}`)}</title></circle>`);
    svg.push(`<g class="erosion" data-row="${e.index}" data-kernel-point="${esc(JSON.stringify(e.point))}" data-max-distance="${e.maxDistance}"><title>${esc(JSON.stringify(e))}</title>`);
    svg.push(line([x - grid, y], [x + grid, y], ''), line([x, y - grid], [x, y + grid], ''), '</g>');
    svg.push(line([x + grid, y], [label - grid, labelY - grid], `stroke="seagreen" stroke-width="${thin}"`));
    captions.forEach((caption, i) => {
      const attrs = `x="${label}" y="${labelY + i * label}"`;
      svg.push(`<text ${attrs} stroke="white" stroke-width="${grid}" stroke-linejoin="round">${esc(caption)}</text>`);
      svg.push(`<text ${attrs}>${esc(caption)}</text>`);
    });
    labelY += label * (captions.length + 1);
  }
  svg.push('</g>');
  for (let d = -span; d <= span; d += label) {
    svg.push(`<text class="axis" x="${d}" y="${span + label}" text-anchor="middle">${d}</text>`);
    svg.push(`<text class="axis" x="${-span - grid}" y="${d}" text-anchor="end" dominant-baseline="middle">${-d}</text>`);
  }
  svg.push(`<text x="${span}" y="${span + margin}" text-anchor="end">Local x (mm): nose = 0; FIXED back edge ${backEdge}</text>`, '</svg>');
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, svg.join('\n') + '\n');
  console.log(`[ring-plan-overlay] ${tableId} rail${railIndex} ${jaw}: ${crossings.length} crossings `
    + `(${visibleCrossings.length} in view); ${erosions.length} DERIVED w markers; wrote ${out}`);
}
