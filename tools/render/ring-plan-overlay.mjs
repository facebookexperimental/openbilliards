#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Pocket-scale evidence, using the SAME strict intersections as rule 2.
// node tools/render/ring-plan-overlay.mjs <tableId> <railIndex> <out.svg>
// Optional --jaw=start|end: pocketed-pool jaw view, centered at the selected
// nose-edge endpoint and rotated with the nose vertical; DERIVED w markers.
// Without --jaw the cn8 middle-pocket view is unchanged.
// Optional --repo=<worktree>: load that tree's exports and committed Three;
// the instrument and plot calibration still come from this tree. No server.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { repoRoot } from './lib/ensure-three.mjs';
import { MM, ringCrossings } from './lib/cushion-ring.mjs';
import { readMidjawInputs } from './lib/midjaw-overrun.mjs';

const args = process.argv.slice(2);
const repoArg = args.find((a) => a.startsWith('--repo='));
const jawArg = args.find((a) => a.startsWith('--jaw='));
const positional = args.filter((a) => !a.startsWith('--'));
if (positional.length !== 3 || args.some((a) => a.startsWith('--') && a !== repoArg && a !== jawArg)
  || (jawArg && !['start', 'end'].includes(jawArg.slice('--jaw='.length)))) {
  console.error('usage: node tools/render/ring-plan-overlay.mjs <tableId> <railIndex> <out.svg> [--repo=<worktree>] [--jaw=start|end]');
  process.exit(2);
}
const [tableId, railArg, out] = positional;
const railIndex = Number(railArg);
const root = repoArg ? path.resolve(repoArg.slice('--repo='.length)) : repoRoot;
const repoUrl = (rel) => pathToFileURL(path.join(root, rel)).href;
const { ensureRealThree } = await import(repoUrl('tools/render/lib/ensure-three.mjs'));
ensureRealThree();
const { TABLE_SPECS, makeGeom, railPolysFor, cushionProfile, CUSHION_FAMILIES,
  cushionPlanCtx, cushionRingCtx, CN8_MID } = await import(repoUrl('web/scene/table.js'));
if (!Object.hasOwn(TABLE_SPECS, tableId)) throw new Error(`unknown table ${tableId}`);
const G = makeGeom(tableId);
if (!jawArg && G.render.style !== 'cn8') throw new Error(`${tableId}: the DT-09 middle-pocket overlay requires a cn8 spec`);
if (jawArg && (G.template || G.kernel.pocketless)) throw new Error(`${tableId}: --jaw requires a pocketed pool entry`);
if (!CUSHION_FAMILIES[G.render.cushionFamily]) throw new Error(`unknown cushionFamily ${G.render.cushionFamily}`);
const polys = railPolysFor(G);
if (!Number.isInteger(railIndex) || railIndex < 0 || railIndex >= polys.length) throw new Error(`invalid rail index ${railArg}`);
const poly = polys[railIndex];
const prof = cushionProfile(G.render.cushionFamily, G.kernel.noseHeightFrac * G.render.profileBallD, G.CW);
const ctx = cushionPlanCtx(G, poly);
const { backAt, oFAt } = cushionRingCtx(G, prof);
if (jawArg) {
  const { writePoolJawOverlay } = await import('./lib/pool-jaw-overlay.mjs');
  const view = JSON.parse(fs.readFileSync(new URL('./fixtures/cushion-ring-overlay-view.json', import.meta.url)));
  const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  writePoolJawOverlay({ tableId, railIndex, jaw: jawArg.slice('--jaw='.length),
    G, poly, prof, ctx, backAt, oFAt, view, revision, out });
  process.exit(0);
}
const midjawLaw = { ...await import(repoUrl('web/scene/cn8midlaw.js')), CN8_MID };
const { allowance, segments } = readMidjawInputs(G, polys, midjawLaw);
const cutU = CN8_MID.DT09 - allowance;
const view = JSON.parse(fs.readFileSync(new URL('./fixtures/cushion-ring-overlay-view.json', import.meta.url)));
const { halfSpanMm: span, gridMm: grid, labelMm: label } = view;
const midY = G.L / 2;
if (!poly.some(([, y]) => Math.abs(y - midY) * MM <= span)) throw new Error('the selected rail does not reach the middle-pocket viewport');

// Both pockets use a nose-origin lateral frame, so the back line is x=-CW.
// Right rails reflect ONLY lateral coordinates: x = W - kernel.x; y remains
// the global kernel-plan y. Raw kernel coordinates accompany every marker.
const reflected = poly.every(([x]) => x > G.W / 2);
const local = ([x, y]) => [reflected ? G.W - x : x, y];
const plot = (p) => { const [x, y] = local(p); return [x * MM, (midY - y) * MM]; };
const mm = (v) => (v * MM).toFixed(2);
const pair = (p) => `(${p.map(mm).join(', ')}) mm`;
const esc = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const samples = [
  { name: 'plan o=0', ring: ctx.ringAt(0) },
  ...prof.rows.map((row, index) => ({ name: `profile row ${index}`, row,
    ring: ctx.ringAt(row.o, row.o, backAt(row.z)) })),
];
const crossings = samples.flatMap((s) => [...ringCrossings(s.ring)].map((c) => ({ sample: s.name, ...c })));
// Co-located crossings share one readable label; metadata/title retain every
// row and edge identity. The grouping precision is the existing epsilon.
const places = new Map();
for (const c of crossings) {
  const key = c.point.map((v) => v.toFixed(-Math.log10(1e-9))).join(',');
  if (!places.has(key)) places.set(key, []);
  places.get(key).push(c);
}
const endpoint = poly.filter((p) => Math.abs(local(p)[0] + G.CW) < 1e-9)
  .sort((a, b) => Math.abs(a[1] - midY) - Math.abs(b[1] - midY))[0];
const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const headers = [
  `${tableId} / rail${railIndex} / ${revision}`,
  `Family ${G.render.cushionFamily}: ${prof.rows.length} profile rows; ${crossings.length} crossings at ${places.size} sites`,
  `KERNEL-DERIVED CW=${mm(G.CW)} mm; middle axis y=${mm(midY)} mm`,
  `MODEL(Star) DT-09=${mm(CN8_MID.DT09)} mm; continuation plane cutU=${mm(cutU)} mm`,
  `Renderer read: cutU=DT-09 - ${mm(allowance)} mm; n=${segments}; ${reflected ? 'right pocket, x=W-kernel.x' : 'left pocket, x=kernel.x'}`,
  `Plan: black / profile rings: blue / back line: orange / crossings: red / simple closure: green`,
  `Grid ${grid} mm; labels ${label} mm; viewport +/-${span} mm; coordinates (x,y) in mm`,
];
const textSize = label / 2;
const thin = grid / label;
const headerHeight = label * (headers.length + 1);
const margin = label * 2;
const minX = -span - margin, minY = -span - headerHeight;
const width = (span + margin) * 2, height = span * 2 + headerHeight + margin + label;
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width * label / 2}" height="${height * label / 2}">`,
  `<title>${esc(`Middle-pocket ring plan: ${tableId} rail${railIndex}`)}</title>`,
  `<desc>${esc(headers.join('\n'))}</desc>`,
  `<metadata>${esc(JSON.stringify({ tableId, railIndex, revision, frame: reflected ? 'x=W-kernel.x, y=kernel.y' : 'kernel plan',
    CW: G.CW, middleAxisY: midY, DT09: CN8_MID.DT09, cutU, segments, view,
    profile: prof, crossings, endpoint }))}</metadata>`,
  `<rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="white"/>`,
  `<style>text { font-family: monospace; font-size: ${textSize}px; fill: black; }
    .header { font-size: ${textSize - grid}px; }
    .axis { font-size: ${textSize - grid * 2}px; }
    .profile { fill: none; stroke: steelblue; stroke-width: ${thin}; }
    .plan { fill: none; stroke: black; stroke-width: ${grid / 2}; }
    .crossing { fill: white; stroke: crimson; stroke-width: ${grid / 2}; }
    .endpoint { fill: seagreen; stroke: white; stroke-width: ${thin}; }
  </style>`,
  ...headers.map((s, i) => `<text class="header" x="${-span}" y="${minY + label * (i + 1)}">${esc(s)}</text>`),
  `<defs><clipPath id="pocket"><rect x="${-span}" y="${-span}" width="${span * 2}" height="${span * 2}"/></clipPath></defs>`,
  '<g clip-path="url(#pocket)">',
];
const line = (x1, y1, x2, y2, attrs) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${attrs}/>`;
for (let d = -span; d <= span; d += grid) {
  const attrs = `stroke="${d % label === 0 ? 'silver' : 'gainsboro'}" stroke-width="${d % label === 0 ? thin : thin / 2}"`;
  svg.push(line(d, -span, d, span, attrs), line(-span, d, span, d, attrs));
}
const ringPath = (ring) => ring.map((p, i) => `${i ? 'L' : 'M'}${plot(p).join(',')}`).join(' ') + ' Z';
for (const s of samples.slice(1)) svg.push(`<path class="profile" data-row="${esc(s.name)}" d="${ringPath(s.ring)}"><title>${esc(JSON.stringify(s.row))}</title></path>`);
svg.push(`<path class="plan" d="${ringPath(samples[0].ring)}"/>`);
const backX = -G.CW * MM;
svg.push(line(backX, -span, backX, span, `stroke="darkorange" stroke-width="${grid / 2}" stroke-dasharray="${label / 2} ${grid}"`));
svg.push(line(0, -span, 0, span, `stroke="slategray" stroke-width="${thin}"`));
svg.push(line(-span, 0, span, 0, `stroke="slategray" stroke-width="${thin}"`));
for (const [distance, name, color] of [[CN8_MID.DT09, 'DT-09', 'darkviolet'], [cutU, 'cutU', 'sienna']]) {
  for (const sign of [-1, 1]) {
    const y = -sign * distance * MM;
    svg.push(line(-span, y, span, y, `stroke="${color}" stroke-width="${thin}" stroke-dasharray="${grid} ${grid}"`));
    svg.push(`<text class="axis" x="${span - label / 2}" y="${y - grid}" text-anchor="end">u=${sign > 0 ? '+' : '-'}${name} (${mm(sign * distance)})</text>`);
  }
}
function mark(point, className, captions, detail) {
  const [x, y] = plot(point), sign = Math.sign(y) || 1;
  const tx = label, ty = y + sign * label * 2;
  svg.push(line(x, y, tx - grid, ty - sign * grid, `stroke="${className === 'crossing' ? 'crimson' : 'seagreen'}" stroke-width="${thin}"`));
  svg.push(`<g class="${className}" data-kernel-point="${esc(JSON.stringify(point))}"><title>${esc(detail)}</title><circle cx="${x}" cy="${y}" r="${grid}"/></g>`);
  // Two text layers give a white halo even in SVG exporters without paint-order.
  captions.forEach((caption, i) => {
    const attrs = `x="${tx}" y="${ty + sign * i * label}"`;
    svg.push(`<text ${attrs} stroke="white" stroke-width="${grid}" stroke-linejoin="round">${esc(caption)}</text>`);
    svg.push(`<text ${attrs}>${esc(caption)}</text>`);
  });
}
for (const group of places.values()) {
  const point = group[0].point;
  mark(point, 'crossing', [pair(local(point)), `${group.length} crossings (plan + rows)`],
    `Kernel ${pair(point)}; ${group.map((c) => `${c.sample} edges ${c.edges.join('/')}`).join('; ')}`);
}
if (!crossings.length && endpoint) mark(endpoint, 'endpoint', [`End ${pair(local(endpoint))}`], `Simple closure, kernel ${pair(endpoint)}`);
svg.push('</g>');
for (let d = -span; d <= span; d += label) {
  svg.push(`<text class="axis" x="${d}" y="${span + label}" text-anchor="middle">${d}</text>`);
  svg.push(`<text class="axis" x="${-span - grid}" y="${d}" text-anchor="end" dominant-baseline="middle">${(midY * MM - d).toFixed(0)}</text>`);
}
svg.push(`<text x="${span}" y="${span + margin}" text-anchor="end">x (mm); back line x=-CW=${mm(-G.CW)} mm</text>`, '</svg>');
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, svg.join('\n') + '\n');
console.log(`[ring-plan-overlay] ${tableId} rail${railIndex}: ${crossings.length} crossings (${places.size} sites); `
  + `closure ${endpoint ? pair(local(endpoint)) : 'absent'}; wrote ${out}`);
