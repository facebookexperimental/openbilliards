// Copyright (c) Meta Platforms, Inc. and affiliates.

// Native ESM source variants shared by the pocket gameplay and render probes.
// MAIN is the pushed base whose web/ gameplay the appearance change must equal.
// Re-pin only through a dated review record naming the old and new full commits,
// the reason, and the parity evidence; never replace it with HEAD or a branch.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {parse} from './vendor/acorn/acorn.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const MAIN = '10983e701575a6d397e6e4073a38075b291c2e2e';
export const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export const git = args => execFileSync('git', ['-C', ROOT, ...args], {encoding: 'utf8', maxBuffer: 32 * 1024 * 1024});
export const ids = ['diamond_proam_9ft', 'diamond_proam_8ft', 'diamond_proam_7ft', 'pool_pro_9ft', 'wpbsa_snooker_12ft'];

function nodes(root, predicate) {
  const found = [];
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (predicate(node)) found.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') visit(value);
    }
  };
  visit(root); return found;
}
const ast = text => parse(text, {ecmaVersion: 'latest', sourceType: 'module'});
function fn(tree, name) {
  const found = nodes(tree, n => n.type === 'FunctionDeclaration' && n.id?.name === name);
  assert.equal(found.length, 1, `one function ${name}`); return found[0];
}
const call = (n, name) => n?.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === name;
const replaceRange = (text, n, replacement) => text.slice(0, n.start) + replacement + text.slice(n.end);
function replaceInFunction(text, name, before, after) {
  const n = fn(ast(text), name), body = text.slice(n.start, n.end);
  assert.equal(body.split(before).length - 1, 1, `${name}: unique plant site`);
  return replaceRange(text, n, body.replace(before, after));
}

export function functionSource(text, name) {
  const n = fn(ast(text), name); return text.slice(n.start, n.end);
}
export function variableSource(text, name) {
  const found = nodes(ast(text), n => n.type === 'VariableDeclarator' && n.id?.name === name);
  assert.equal(found.length, 1, `one variable ${name}`);
  return text.slice(found[0].start, found[0].end);
}

// These plants depend only on the submitted source. No unpublished commit is
// required by CI, and a missing plant site is an instrument error, not a pass.
export const PLANTS = {
  render_inputs: text => replaceInFunction(text, 'railGeomFor', 'railGeometryFor(id, false)', 'railGeometryFor(id, true)'),
  floor_value: text => replaceInFunction(text, 'cueMinElevationDeg', 'return solveFloorDeg(', 'return 0.125 + solveFloorDeg('),
  reach_value: text => replaceInFunction(text, 'cueReachability', 'return env;', 'env.floors[0] += 0.125; return env;'),
  clamp_value: text => replaceInFunction(text, 'cueClampTip', 'return { a, b, floorDeg: f0, clamped: false };',
    'return { a: a + 0.000001, b, floorDeg: f0, clamped: false };'),
  active_binding: text => replaceInFunction(text, 'activeRailGeom', 'const g = railGeomFor(id);', 'const g = renderRailGeomFor(id);'),
  min_default: text => replaceInFunction(text, 'cueMinElevationDeg', 'geom = activeRailGeom()', 'geom = activeRenderRailGeom()'),
  reach_default: text => replaceInFunction(text, 'cueReachability', 'geom = activeRailGeom()', 'geom = activeRenderRailGeom()'),
  clamp_default: text => replaceInFunction(text, 'cueClampTip', 'geom = activeRailGeom()', 'geom = activeRenderRailGeom()'),
  build_binding: text => replaceInFunction(text, 'buildCue',
    'cueClampTip(pos, phi, capDeg, a, b, activeRailGeom(), ballR, balls,',
    'cueClampTip(pos, phi, capDeg, a, b, activeRenderRailGeom(), ballR, balls,'),
  hardcoded_id: text => replaceInFunction(text, 'activeRailGeom',
    'const id = tableMod.activeTableId?.();', "const id = 'pool_pro_9ft';"),
  raised_rail_cap: text => {
    const before = 'const RAIL_MAX = 0.062;';
    assert.equal(text.split(before).length - 1, 1, 'one pinned rail cap');
    return text.replace(before, 'const RAIL_MAX = 0.063;');
  },
};

export function defaultBindings(text) {
  const tree = ast(text), out = [];
  const active = fn(tree, 'activeRailGeom');
  const calls = nodes(active, n => n.type === 'CallExpression');
  out.push({name: 'activeRailGeom -> railGeomFor', pass: calls.filter(n => call(n, 'railGeomFor')).length === 1
    && !calls.some(n => call(n, 'renderRailGeomFor'))});
  for (const [name, index] of [['cueMinElevationDeg', 4], ['cueReachability', 3], ['cueClampTip', 5]]) {
    const param = fn(tree, name).params[index];
    out.push({name: `${name} default`, pass: param?.type === 'AssignmentPattern' && param.left?.name === 'geom'
      && call(param.right, 'activeRailGeom') && param.right.arguments.length === 0});
  }
  const build = fn(tree, 'buildCue');
  for (const [name, callee, index] of [['minElevationDeg', 'cueMinElevationDeg', 4],
    ['reachability', 'cueReachability', 3], ['clampTip', 'cueClampTip', 5]]) {
    const props = nodes(build, n => n.type === 'Property' && n.key?.name === name);
    const body = props[0]?.value?.body;
    out.push({name: `buildCue.${name}`, pass: props.length === 1 && call(body, callee)
      && call(body.arguments[index], 'activeRailGeom') && body.arguments[index].arguments.length === 0});
  }
  return out;
}

export function installSources({candidate = null, plants = false, extraPlants = {}} = {}) {
  // The pinned CI job checks out full history. Missing MAIN is a hard error;
  // this instrument never fetches or silently substitutes another reference.
  git(['cat-file', '-e', `${MAIN}^{commit}`]);
  const refs = {main: MAIN, candidate};
  if (plants) {
    refs.main_control = MAIN;
    for (const name of Object.keys(PLANTS)) refs[name] = candidate;
  }
  for (const [name, plant] of Object.entries(extraPlants)) {
    assert(!Object.hasOwn(refs, name) && typeof plant === 'function', `distinct source plant ${name}`);
    refs[name] = candidate;
  }
  if (candidate) {
    assert.match(candidate, /^[0-9a-f]{8,40}$/i);
    git(['cat-file', '-e', `${candidate}^{commit}`]);
  }
  const baseUrl = pathToFileURL(ROOT + '/').href, cache = new Map();
  const source = (name, rel) => {
    assert(Object.hasOwn(refs, name), `unknown variant ${name}`);
    const key = `${name}:${rel}`;
    if (!cache.has(key)) {
      let text = refs[name] ? git(['show', `${refs[name]}:${rel}`]) : fs.readFileSync(path.join(ROOT, rel), 'utf8');
      if (rel === 'web/scene/cuestick.js' && Object.hasOwn(PLANTS, name)) text = PLANTS[name](text);
      if (rel === 'web/scene/cuestick.js' && Object.hasOwn(extraPlants, name)) text = extraPlants[name](text);
      cache.set(key, text);
    }
    return cache.get(key);
  };
  registerHooks({
    resolve(specifier, context, next) {
      const result = specifier === 'three'
        ? {url: baseUrl + 'web/vendor/three.module.min.js', shortCircuit: true} : next(specifier, context);
      const name = context.parentURL && new URL(context.parentURL).searchParams.get('cue_contract');
      if (name && result.url.startsWith(baseUrl + 'web/')) {
        const url = new URL(result.url); url.searchParams.set('cue_contract', name);
        return {...result, url: url.href};
      }
      return result;
    },
    load(url, context, next) {
      if (url.startsWith(baseUrl + 'web/')) {
        const parsed = new URL(url), name = parsed.searchParams.get('cue_contract');
        if (name) {
          parsed.search = '';
          const rel = path.relative(ROOT, fileURLToPath(parsed));
          let text = source(name, rel);
          // Read-only instrumentation: expose the exact private bodies. The
          // setter selects a live table without constructing a table scene.
          if (rel === 'web/scene/cuestick.js') {
            const reference = text.includes('function referenceConstraintPen(') ? 'referenceConstraintPen' : 'constraintPen';
            text += `\nexport {constraintPen as __probeConstraintPen, ${reference} as __probeReferenceConstraintPen, mouthCarveAt as __probeMouthCarveAt};\n`;
          }
          if (rel === 'web/scene/table.js') text += '\nexport const __probeSelectTable = id => { _activeTableId = id; };\n';
          return {format: 'module', source: text, shortCircuit: true};
        }
      }
      return next(url, context);
    },
  });
  globalThis.window = globalThis;
  globalThis.addEventListener ??= () => {};
  globalThis.location ??= {search: ''};
  globalThis.localStorage ??= {getItem: () => null};
  const load = async name => {
    const api = await import(baseUrl + `web/scene/cuestick.js?cue_contract=${name}`);
    const table = await import(baseUrl + `web/scene/table.js?cue_contract=${name}`);
    return {name, api, table, geoms: new Map(ids.map(id => [id, api.railGeomFor(id)]))};
  };
  return {source, refs, load, importWeb: (name, rel) => import(baseUrl + `web/${rel}?cue_contract=${name}`)};
}

export function poseGrid(base) {
  const grid = [];
  for (const id of ids) {
    const g = base.geoms.get(id), R = base.table.specFor(id).render.profileBallD / 2;
    assert(Number.isFinite(R) && R > 0, `ball radius ${id}`);
    const pockets = [{name: 's-', ux: 0, uz: -1}, {name: 's+', ux: 0, uz: 1},
      ...[-1, 1].flatMap(sx => [-1, 1].map(sz => ({name: `c${sx},${sz}`, ux: sx * Math.SQRT1_2, uz: sz * Math.SQRT1_2})))];
    for (const p of pockets) for (const lateral of [-0.018, 0, 0.018]) {
      const side = p.ux === 0;
      const pos = {x: side ? lateral : Math.sign(p.ux) * (g.L / 2 - 0.05) - p.uz * lateral, y: R,
        z: side ? p.uz * (g.W / 2 - R - 0.008) : Math.sign(p.uz) * (g.W / 2 - 0.05) + p.ux * lateral};
      const capR = lateral === 0 ? 0.5 : 0.5 * (1 + 0.0106 / R);
      const balls = lateral > 0 ? [{x: pos.x - p.ux * 0.072, y: R, z: pos.z - p.uz * 0.072, r: R}] : [];
      for (let i = 0; i < 24; i++) grid.push({id, pocket: p.name, pos,
        phi: Math.atan2(-p.ux, -p.uz) + (i / 24 - 0.5) * 2 * Math.PI, R, capR, balls});
    }
  }
  const worked = [{x: 0.050, z: 0.535, phi: Math.PI}, {x: 0.090, z: 0.435, phi: Math.PI},
    {x: 1.2311, z: 0.5325, phi: 5 * Math.PI / 4}].map((p, i) => ({id: 'pool_pro_9ft', pocket: `review-${i + 1}`,
    pos: {x: p.x, y: 0.028575, z: p.z}, phi: p.phi, R: 0.028575, capR: 0.5, balls: [], worked: true}));
  return [...grid, ...worked];
}
export const tipOffsets = pose => pose.worked ? [[0, 0]]
  : [[0, 0], [pose.capR * 0.6, -pose.capR * 0.8], [-pose.capR * 0.6, pose.capR * 0.8]];
export function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = p => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? null;
  return {count: sorted.length, min: q(0), p50: q(0.5), p90: q(0.9), p99: q(0.99), max: q(1)};
}
