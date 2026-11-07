// Copyright (c) Meta Platforms, Inc. and affiliates.

// CPU reconstruction of the exact shipped tongue position/index call site.
// Lighting is stubbed only for colour sampling; no geometry path is replaced.
import fs from 'node:fs';
import * as THREE from '../../../web/vendor/three.module.min.js';
import { loadCornerBuilder, digest } from './cn8_emitted_checks.mjs';

// Landing pass (class G): the shipped tongue call site closes each jaw with
// cn8Furniture.closeClothJaw (web/scene/cn8pockets.js, re-exported by
// cn8furniture.js). The function text is carried from production by NAME and
// bound to the vendor THREE, the mechanism cn8_rail_checks.mjs uses for
// clipGeometryPlane; a renderer that does not call it needs no module.
const POCKETS_URL = new URL('../../../web/scene/cn8pockets.js', import.meta.url);
function productionJawCloser(pocketsSource) {
  const start = pocketsSource.indexOf('function closeClothJaw(');
  const end = pocketsSource.indexOf('\n}', start);
  if (start < 0 || end < 0) throw new Error('The shipped closeClothJaw is absent from cn8pockets.js');
  return new Function('THREE', pocketsSource.slice(start, end + 2) + '\nreturn { closeClothJaw };')(THREE);
}

// Landing pass (class G-2): the closure appends a fixed number of vertices per
// lattice row (one lip point plus its offset profile). That count is DERIVED
// from production by running the shipped closeClothJaw once on a synthetic
// two-row lattice and reading how many vertices it appended, so the layout law
// below pins the exact vertex count without hand-writing the closure's profile.
let JAW_VERTICES_PER_ROW = null;
export function jawVerticesPerRow(pocketsSource = fs.readFileSync(POCKETS_URL, 'utf8')) {
  if (JAW_VERTICES_PER_ROW !== null) return JAW_VERTICES_PER_ROW;
  const { closeClothJaw } = productionJawCloser(pocketsSource);
  const rows = [{ c: [0, 0], n: [1, 0], row: 0 }, { c: [0, 0.01], n: [1, 0], row: 1 }];
  const cols = 2;
  const pos = [];
  const uv = [];
  const col = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < cols; j++) { pos.push(j * 0.01, 0.02, i * 0.01); uv.push(j, i); col.push(1, 1, 1); }
  }
  const lattice = rows.length * cols;
  const jaw = closeClothJaw({ pos, uv, col, idx: [], rows, cols, toWorld: (x, y) => [x, y], height: 0.03, tanAlpha: 1 });
  const appended = pos.length / 3 - lattice;
  if (jaw.topVertices !== lattice || appended <= 0 || appended % rows.length !== 0) {
    throw new Error(`closeClothJaw synthetic run: topVertices ${jaw.topVertices} lattice ${lattice} appended ${appended}`);
  }
  JAW_VERTICES_PER_ROW = appended / rows.length;
  return JAW_VERTICES_PER_ROW;
}

export function loadTongueBuilder(renderer, pocketsSource = fs.readFileSync(POCKETS_URL, 'utf8')) {
  const corner = loadCornerBuilder(renderer);
  const occStart = renderer.indexOf('function cn8MouthOccGeom(');
  const occEnd = renderer.indexOf('\n}', occStart) + 2;
  const occ = new Function('CN8_R82', 'let _cn8OccGeom=null;'
    + renderer.slice(occStart, occEnd) + ';return cn8MouthOccGeom();')(corner.K);
  const local = renderer.indexOf('      const buildCornerR82 =');
  const addStart = renderer.indexOf('        const addMesh =', local);
  const addEnd = renderer.indexOf('        const quadIdx =', addStart);
  // Landing pass (class G): the shipped farHit reads woodBack/woodEnd from
  // cn8JoyWoodCorner(K) on the line above it (apron rebuild). The slice starts
  // at that declaration whenever the renderer carries it, and the helper is
  // supplied from the corner builder's production text (never a local stub).
  const woodLine = renderer.indexOf('        const [woodBack, woodEnd] = cn8JoyWoodCorner(K);', local);
  const farStart = woodLine >= 0 ? woodLine : renderer.indexOf('        const farHit =', local);
  const farEnd = renderer.indexOf('        const uPsi =', farStart);
  const tongueStart = renderer.indexOf('        const profDep =', local);
  const tongueEnd = renderer.indexOf('        // (2b) cn8r82-endroll', tongueStart);
  if ([local, addStart, addEnd, farStart, farEnd, tongueStart, tongueEnd].some((n) => n < 0)) {
    throw new Error('The shipped tongue call site is absent');
  }
  if (woodLine >= 0 && typeof corner.woodCorner !== 'function') {
    throw new Error('The shipped tongue call site reads cn8JoyWoodCorner but the corner builder lacks it');
  }
  // Landing pass (class G): the jaw closer takes the call site's TAN_A; the
  // declaration line is carried from production text when the renderer has it.
  const tanLine = renderer.indexOf('        const TAN_A = Math.tan(K.ALPHA);', local);
  const tanDeclaration = tanLine >= 0 ? renderer.slice(tanLine, renderer.indexOf('\n', tanLine) + 1) : '';
  const code = [tanDeclaration, renderer.slice(addStart, addEnd), renderer.slice(farStart, farEnd),
    renderer.slice(tongueStart, tongueEnd)].join('\n');
  const furniture = code.includes('cn8Furniture.closeClothJaw(') ? productionJawCloser(pocketsSource) : null;
  const build = (L, W, id, sx, sz) => {
    const group = new THREE.Group(), clothMat = new THREE.MeshBasicMaterial();
    const execute = new Function('THREE', 'K', 'CN8_D2_SECTION', 'L', 'W', 'pi', 'M2W',
      'chain', 'chainN', 'group', 'clothMat', 'cn8D3TongueRows', 'cn8D3TongueProfile', 'cn8JoyWoodCorner',
      'cn8Furniture',
      'const NCH=chain.length, NROLL=22; const sRoll=chain.map((_,i)=>Math.min(1,i/NROLL));'
      + 'const transportV=()=>1; const cn8LightingJobs=[];\n' + code + '\nreturn group.children;');
    return execute(THREE, corner.K, corner.S, L, W, id,
      (x, y) => [sx * (L / 2 + x), sz * (W / 2 + y)],
      occ.chain, occ.chainN, group, clothMat, corner.tongueRows, corner.tongueProfile, corner.woodCorner,
      furniture);
  };
  return { build, corner, occ, callsite_sha256: digest(code) };
}

// Independent buffer read: measure the mating edge against the emitted cover
// lip polyline. Identities are supplied by the fixed call-site mapping.
export function measureMatingEdge(positions, metadata, coverPositions, coverMetadata, signs) {
  const rows = metadata.cn8D3Mating?.rows, cols = metadata.tongueCols?.stride;
  // Landing pass (class G): the shipped tongue closes each jaw
  // (cn8Furniture.closeClothJaw, rebuild 6fa98529) by appending vertices AFTER
  // the rows x cols lattice and publishes cn8ClosedJaw.topVertices = lattice.
  // The lattice law is unchanged; a published closure must start where the
  // lattice ends, and a tongue without one must be the bare lattice.
  const lattice = rows && cols ? rows.length * cols : 0, jaw = metadata.cn8ClosedJaw;
  // Class G-2: the closed layout is pinned EXACTLY - lattice plus the
  // production closure's vertices per row (jawVerticesPerRow, derived above).
  const closedVertices = rows ? lattice + rows.length * jawVerticesPerRow() : 0;
  const layout = !rows || !cols || positions.length % 3 ? false
    : jaw ? jaw.closed === true && jaw.topVertices === lattice && positions.length === closedVertices * 3
      : positions.length === lattice * 3;
  if (!layout) {
    return { status: 'FAIL', failures: ['Missing or inconsistent actual tongue layout'] };
  }
  const lip = coverMetadata.stations.map((station, i) => ({ station,
    p: Array.from(coverPositions.slice(i * coverMetadata.profileCount * 3, i * coverMetadata.profileCount * 3 + 3)) }));
  let step = 0, gap = 0, contacts = 0, negativeRecess = 0;
  const failures = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].station === null) continue;
    const at = (i * cols + metadata.cn8D3Mating.matingColumn) * 3;
    const p = Array.from(positions.slice(at, at + 3));
    if (p[0] * signs[0] <= 0 || p[2] * signs[1] <= 0) failures.push('Wrong tongue quadrant');
    let best = Infinity, matched;
    for (const q of lip) {
      const distance = Math.hypot(p[0] - q.p[0], p[2] - q.p[2]);
      if (distance < best) { best = distance; matched = q; }
    }
    contacts++;
    gap = Math.max(gap, best * 1000);
    step = Math.max(step, (p[1] - matched.p[1]) * 1000);
    negativeRecess = Math.max(negativeRecess, (matched.p[1] - p[1]) * 1000);
  }
  // TESSELLATION: 0.0002 mm bounds world-coordinate Float32 publication.
  if (!contacts || gap > 0.0002 || step > 0.0002) failures.push('Proud step or unmatched plan edge');
  return { status: failures.length ? 'FAIL' : 'PASS', tag: 'DERIVED from emitted buffers',
    contacts, proud_step_mm: step, unmatched_plan_length_mm: gap, cloth_recess_max_mm: negativeRecess, failures };
}
