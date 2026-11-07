#!/usr/bin/env node

// Copyright (c) Meta Platforms, Inc. and affiliates.

// Read-only, reproducible jaw measurements from a committed tree:
// node tools/render/lib/jaw-erosion-report.mjs --repo <worktree> --table predator_apex_9ft
// Coordinates are kernel-plan metres; reported distances are millimetres.
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { registerHooks } from 'node:module';
import { parseArgs } from 'node:util';
import { repoRoot } from './ensure-three.mjs';
import { MM, intersectionPoint, ringCrossings } from './cushion-ring.mjs';
import { erosionVertex, sampledJawRuns } from './jaw-erosion.mjs';

const distance = (a, b) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const near = (a, b) => distance(a, b) <= 1e-9;

async function readTable(root) {
  const rootUrl = pathToFileURL(root + path.sep).href;
  const vendor = new URL('web/vendor/three.module.min.js', rootUrl).href;
  // Resolve the committed library in memory: even a fresh historical
  // worktree needs no node_modules bootstrap or other filesystem writes.
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'three' && context.parentURL?.startsWith(rootUrl)) {
        return { url: vendor, shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
    load(url, context, nextLoad) {
      if (url === vendor) return { format: 'module', source: readFileSync(new URL(url), 'utf8'), shortCircuit: true };
      return nextLoad(url, context);
    },
  });
  try { return await import(new URL('web/scene/table.js', rootUrl).href); }
  finally { hooks.deregister(); }
}

function readGuard(cushionGeom) {
  const source = cushionGeom.toString();
  const start = source.indexOf('\n  for (const ring of rings) {');
  const end = source.indexOf('\n  const pos = [], uv = [], idx = [];', start);
  if (start < 0 || end <= start) throw new Error('cushionGeom sign-guard block not found');
  // Execute the loaded renderer's exact guard block, observing its writes.
  // This avoids a second, potentially stale implementation of its sign law.
  const guard = new Function('rings', 'ctx', source.slice(start, end));
  return (ring, ctx) => {
    let firings = 0;
    const guarded = new Proxy(ring.map((point) => [...point]), {
      set(target, key, value) { firings++; return Reflect.set(target, key, value); },
    });
    guard([guarded], ctx);
    return { ring: guarded, firings };
  };
}

function meshEdgesAt(geometry, G, z) {
  const position = geometry.getAttribute('position'), index = geometry.getIndex();
  const edges = new Map();
  // A triangle has one vertex per spatial axis; use the exported buffer's
  // item size instead of introducing another numeric traversal constant.
  for (let offset = 0; offset < index.count; offset += position.itemSize) {
    const on = Array.from({ length: position.itemSize }, (_, axis) => index.getX(offset + axis))
      .filter((v) => Math.abs(position.getY(v) - z) <= 1e-6);
    if (on.length !== 2) continue; // Only band edges, never all-on-row cap triangles.
    const edge = on.map((v) => [position.getZ(v) + G.W / 2, position.getX(v) + G.L / 2]);
    const key = edge.map((p) => JSON.stringify(p)).sort().join('|');
    edges.set(key, edge);
  }
  return [...edges.values()];
}

function meshCrossings(edges) {
  const crossings = [];
  for (const [i, [a, b]] of edges.entries()) {
    for (const [j, [c, d]] of edges.entries()) {
      if (j <= i || near(a, c) || near(a, d) || near(b, c) || near(b, d)) continue;
      const point = intersectionPoint(a, b, c, d);
      if (point) crossings.push({ edges: [i, j], point });
    }
  }
  return crossings;
}

/** Measure each sampled jaw at every exported profile row beyond its rIn.
 * Mesh crossings come from cushionGeom triangles, independently of ringAt.
 * The uniform facing/nose inset is checked before using erosionVertex. */
export async function measureJawErosion({ repo = repoRoot, table } = {}) {
  const root = realpathSync(repo), T = await readTable(root);
  if (!table || !Object.hasOwn(T.TABLE_SPECS, table)) throw new Error(`unknown table ${table}`);
  const G = T.makeGeom(table);
  if (G.template || G.kernel.pocketless) throw new Error(`${table}: a pocketed pool entry is required`);
  const prof = T.cushionProfile(G.render.cushionFamily, G.kernel.noseHeightFrac * G.render.profileBallD, G.CW);
  const { backAt, oFAt } = T.cushionRingCtx(G, prof);
  if (prof.rows.some((row) => oFAt(row.o, row.z) !== row.o)) {
    throw new Error(`${table}: erosionVertex requires equal facing and nose insets`);
  }
  const guard = readGuard(T.cushionGeom), records = [], rows = [];
  for (const [rail, poly] of T.railPolysFor(G).entries()) {
    const ctx = T.cushionPlanCtx(G, poly), arcs = sampledJawRuns(poly, ctx);
    const geometry = T.cushionGeom(G, poly, prof);
    try {
      for (const row of prof.rows) {
        const eaten = arcs.filter((arc) => row.o > arc.rIn);
        if (!eaten.length) continue;
        const ring = ctx.ringAt(row.o, oFAt(row.o, row.z), backAt(row.z));
        const guarded = guard(ring, ctx), edges = meshEdgesAt(geometry, G, row.z);
        if (!edges.length) throw new Error(`${table} rail${rail}: no mesh band edges at z=${row.z}`);
        const meshPoints = edges.flat(), meshCrossingCount = meshCrossings(edges).length;
        const meshToGuardDistanceMm = Math.max(
          ...meshPoints.map((p) => Math.min(...guarded.ring.map((q) => distance(p, q)))),
          ...guarded.ring.map((p) => Math.min(...meshPoints.map((q) => distance(p, q)))),
        ) * MM;
        const measured = { rail, z: row.z, o: row.o, ringCrossingCount: [...ringCrossings(ring)].length,
          meshEdgeCount: edges.length, meshCrossingCount, meshToGuardDistanceMm, signGuardFirings: guarded.firings };
        rows.push(measured);
        for (const arc of eaten) {
          const w = erosionVertex(poly, ctx, arc, row.o);
          if (!w) throw new Error(`${table} rail${rail}: parallel jaw support lines`);
          const indices = [];
          for (let vertex = arc.i; vertex <= arc.k + 1; vertex++) indices.push(vertex % ctx.M);
          const points = (r) => [...new Map(indices.map((v) => [JSON.stringify(r[v]), r[v]])).values()];
          const ringAtJawVertices = points(ring), guardedJawVertices = points(guarded.ring);
          const ringAtDistancesMm = ringAtJawVertices.map((p) => distance(p, w) * MM);
          const guardedDistancesMm = guardedJawVertices.map((p) => distance(p, w) * MM);
          const kind = Math.abs(arc.radius - G.kernel.sideJawRadius) < Math.abs(arc.radius - G.kernel.cornerJawRadius)
            ? 'side' : 'corner';
          records.push({ table, ...measured, jaw: arc.jaw, kind, rIn: arc.rIn, radius: arc.radius,
            vertexIndices: indices, ringAtJawVertices, guardedJawVertices, erosionVertex: w,
            ringAtDistancesMm, guardedDistancesMm,
            maxDistanceMm: Math.max(...ringAtDistancesMm), maxGuardedDistanceMm: Math.max(...guardedDistancesMm) });
        }
      }
    } finally { geometry.dispose(); }
  }
  if (!records.length) throw new Error(`${table}: no sampled jaw profile rows beyond rIn`);
  const summary = { table, jawRows: records.length, profileRows: rows.length,
    maxDistanceMm: Math.max(...records.map((r) => r.maxDistanceMm)),
    maxGuardedDistanceMm: Math.max(...records.map((r) => r.maxGuardedDistanceMm)),
    ringCrossingRows: rows.filter((r) => r.ringCrossingCount > 0).length,
    meshCrossingRows: rows.filter((r) => r.meshCrossingCount > 0).length,
    signGuardFirings: rows.reduce((sum, r) => sum + r.signGuardFirings, 0),
    meshToGuardDistanceMm: Math.max(...rows.map((r) => r.meshToGuardDistanceMm)) };
  return { repo: root, revision: execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    units: 'kernel-plan metres; distances in millimetres', records, summary };
}

const [, entry] = process.argv;
if (entry && realpathSync(entry) === fileURLToPath(import.meta.url)) {
  const usage = 'usage: node tools/render/lib/jaw-erosion-report.mjs --repo <worktree> --table <tableId>';
  let values;
  try {
    ({ values } = parseArgs({ options: { repo: { type: 'string' }, table: { type: 'string' }, help: { type: 'boolean' } } }));
    if (!values.help && !values.table) throw new Error('--table is required');
  } catch (error) { console.error(`${error.message}; ${usage}`); process.exit(2); }
  if (values.help) console.log(usage);
  else {
    const report = await measureJawErosion(values), groups = new Map();
    console.log(`[jaw-erosion source] ${JSON.stringify({ repo: report.repo, revision: report.revision, units: report.units })}`);
    for (const record of report.records) {
      console.log(`[jaw-erosion row] ${JSON.stringify(record)}`);
      const key = `${record.kind} z=${(record.z * MM).toFixed(2)}mm o=${record.o * MM}mm`;
      const group = groups.get(key) ?? { ringAt: 0, guarded: 0 };
      group.ringAt = Math.max(group.ringAt, record.maxDistanceMm);
      group.guarded = Math.max(group.guarded, record.maxGuardedDistanceMm);
      groups.set(key, group);
    }
    for (const [key, group] of groups) console.log(`[jaw-erosion distance] ${key}: `
      + `ringAt=${group.ringAt.toFixed(Math.log10(MM))}mm guarded=${group.guarded.toFixed(Math.log10(MM))}mm`);
    console.log(`[jaw-erosion summary] ${JSON.stringify(report.summary)}`);
  }
}
