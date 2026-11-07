// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-loft-manifold.mjs — the cushion lofts are CLOSED where they are meant to be (GH-666,
// review round 1 on #672). For every listed catalog entry and rail body: build cushionGeom as the
// scene does (a cn8 long half-rail is clipped at the DT-09 cut plane with a flat cap, like
// web/scene/table.js does before it becomes a mesh), weld vertices by position (1e-7 m keys) and
// count the edges used by exactly ONE non-degenerate triangle. ONE loop is open by design and
// excluded: the bed ring (both ends at z = 0 — the loft has no bottom face; the bed is a separate
// mesh). Edges ON the clip plane are NOT excluded (review round 3 on #672): a correct cut cap pairs
// every loft boundary edge on the plane with one of its own contour edges, so an unpaired plane
// edge is a hole in the cut face (or a cap edge without a loft partner); they are counted as open
// and reported apart as plane-unpaired. Degenerate triangles are skipped by EXACT zero area (repeated
// welded vertices or a cross product exactly 0 — review round 4 on #672: collinear slivers with three
// distinct vertices were counted as faces and bridged T-junctions); an unpaired edge with a vertex
// strictly inside it is reported apart as a T-junction, and the verdict needs 0 open AND 0 T.
// Everything else that is open is a hole or a T-junction the mesh should not have — the fixed/front
// transition triangle that review found open on the first tucked closure read here as 9 open edges
// per clipped long rail (main: 0), and the mirrored rails' missing cap triangle (FIX4) as 3.
// Issue #728: the degenerate test is the ONE definition shared with
// check-cushion-profile rule 5 (lib/loft-degenerate.mjs); every loft also prints
// a DEGENERATE census line from the PRE-clip geometry for the cross-gate arm.
//
//   node tools/render/check-loft-manifold.mjs [--tables a,b,...]   (default: chinese8_pro_9ft,joy_q8_9ft,rasson_ox_9ft,wpbsa_snooker_12ft)
//   node tools/render/check-loft-manifold.mjs --perturb=drop-closure
//   node tools/render/check-loft-manifold.mjs --perturb=drop-clip-cap
//   node tools/render/check-loft-manifold.mjs --perturb=band-law-off
//     the third arm, differential too (GH-688): OB_ARM band-law-off is appended for the perturbed
//     run only — every banded loft must open and no unbanded loft may change → ARMED (exit 0).
//     the second arm, differential too: the cut cap's triangles (all three vertices on the clip
//     plane) are removed after the clip — the plane-unpaired count must open on EVERY clipped loft
//     and no unclipped loft may change → ARMED (exit 0).
//     the arm, DIFFERENTIAL against the clean run of the same invocation (review round 2 on #672):
//     every triangle spanning the top ring's height and the cap height (the tuck skirt) is removed
//     before the count — the clean run must be closed everywhere, the perturbed run must open
//     EVERY tucked loft and change NO untucked loft → ARMED (exit 0); anything else names the delta.
//   node tools/render/check-loft-manifold.mjs --perturb=plant-degenerate
//   node tools/render/check-loft-manifold.mjs --perturb=plant-collinear
//   node tools/render/check-loft-manifold.mjs --perturb=plant-weldonly
//   node tools/render/check-loft-manifold.mjs --perturb=inflate-degenerate
//     the degenerate arms (issue #728), differential too: each plant raises exactly its
//     definition class (+1 per loft, open+T unchanged — it carries no surface): index reuse
//     and weld-only feed `repeated`, distinct-key collinear feeds `zero-area`. A finite 1 mm
//     triangle added on the cap plane must raise open+T (>= 2 per loft, degenerate
//     unchanged). Sites sit wholly on the clip-kept side, so the clip carries them intact.
// Exit 1 on any open edge (or a NOT ARMED arm), 2 on bad arguments.
import { ensureRealThree, repoUrl } from './lib/ensure-three.mjs';

ensureRealThree();
const { TABLE_SPECS, specFor, makeGeom, railPolysFor, cushionProfile, cushionGeom, roxCushionFor, CN8_MID } =
  await import(repoUrl('web/scene/table.js'));
const { clipGeometryPlane } = await import(repoUrl('web/scene/cn8mid.js'));
const { isDegenerateTri, degenerateCensus } = await import('./lib/loft-degenerate.mjs');
const { plantDegenerate, inflateDegenerate, plantCollinear, plantWeldOnly } = await import('./lib/loft-degenerate-arms.mjs');

const argOf = (k) => { const eq = process.argv.find((a) => a.startsWith(k + '=')); if (eq) return eq.slice(k.length + 1) || null; const i = process.argv.indexOf(k); return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : null; };
// FIX2 (review round 2 on #731 P2 (a)): the validator's RETURN is the working list — a raw split kept
// ' joy_q8_9ft' (comma+space) and makeGeom's specFor built the scripted pin under the JOY label
const { listOpt, stringOpt } = await import('./lib/argv.mjs');
const { requireTableIds: requireIds } = await import('./lib/table-ids.mjs');
const TABLES = await requireIds(listOpt('--tables', { default: 'chinese8_pro_9ft,joy_q8_9ft,rasson_ox_9ft,wpbsa_snooker_12ft', tag: 'loft-manifold' }), 'loft-manifold');
const PERTURB = stringOpt('--perturb', { default: null, tag: 'loft-manifold' }); // FIX2: a blank / trailing --perturb is refused, never a clean run read as an arm
if (PERTURB && PERTURB !== 'drop-closure' && PERTURB !== 'drop-clip-cap' && PERTURB !== 'plant-degenerate' && PERTURB !== 'plant-collinear' && PERTURB !== 'plant-weldonly' && PERTURB !== 'inflate-degenerate' && PERTURB !== 'band-law-off') { console.error(`[loft-manifold] unknown --perturb ${PERTURB} (drop-closure | drop-clip-cap | plant-degenerate | plant-collinear | plant-weldonly | inflate-degenerate | band-law-off)`); process.exit(2); }
// tripwire (not an independent guard — after validation specFor(id) is TABLE_SPECS[id] by construction): every id must resolve to ITS OWN spec
for (const id of TABLES) if (specFor(id) !== TABLE_SPECS[id]) { console.error(`[loft-manifold] REFUSED — '${id}' does not resolve to its own catalog spec (specFor fallback)`); process.exit(2); }
const CATALOG = Object.keys(TABLE_SPECS).filter(id => railPolysFor(makeGeom(id)).length > 0);
const OMITTED = CATALOG.filter(id => !TABLES.includes(id));
const COVERAGE = `${TABLES.length} of ${CATALOG.length} catalog entries (${TABLES.join(',')})`
  + (OMITTED.length ? `; PARTIAL — not inspected: ${OMITTED.join(',')}` : '; FULL');
const DT09 = CN8_MID?.DT09 ?? 0.04192;

/** open (single-use) edges after positional welding; bed-ring and clip-plane edges reported apart */
function openEdges(geo, planeX) {
  const p = geo.getAttribute('position').array;
  const ix = geo.getIndex() ? geo.getIndex().array : null;
  const n = ix ? ix.length : p.length / 3;
  const vid = (i) => `${p[3 * i].toFixed(7)},${p[3 * i + 1].toFixed(7)},${p[3 * i + 2].toFixed(7)}`;
  const at = (i) => [p[3 * i], p[3 * i + 1], p[3 * i + 2]];
  const edges = new Map(); const verts = new Map(); let degenerate = 0;
  for (let k = 0; k < n; k += 3) {
    const ids = [0, 1, 2].map((j) => (ix ? ix[k + j] : k + j)); const ks = ids.map(vid);
    ids.forEach((i, j) => verts.set(ks[j], at(i)));
    // a degenerate triangle carries no surface: repeated welded vertices, OR three distinct
    // vertices with EXACTLY zero area (no epsilon; review round 4 on #672) — the ONE definition
    // in lib/loft-degenerate.mjs (issue #728), the pre-#728 openEdges tests verbatim
    if (isDegenerateTri(p, ids[0], ids[1], ids[2])) { degenerate++; continue; }
    for (let j = 0; j < 3; j++) {
      const a2 = ks[j], b2 = ks[(j + 1) % 3]; const key = a2 < b2 ? `${a2}|${b2}` : `${b2}|${a2}`;
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  // an unpaired edge with a welded vertex strictly INSIDE it (exact collinearity) is a T-junction —
  // the rasterisation-crack class: not a shared edge, reported apart from the holes
  const insideT = (a, b) => {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    for (const w0 of verts.values()) {
      const w = [w0[0] - a[0], w0[1] - a[1], w0[2] - a[2]];
      if (d[1] * w[2] - d[2] * w[1] !== 0 || d[2] * w[0] - d[0] * w[2] !== 0 || d[0] * w[1] - d[1] * w[0] !== 0) continue;
      const dt = d[0] * w[0] + d[1] * w[1] + d[2] * w[2]; if (dt > 0 && dt < L2) return true;
    }
    return false;
  };
  let open = 0, bed = 0, plane = 0, tj = 0; const sample = []; const tsample = [];
  for (const [key, c] of edges) {
    if (c === 2) continue;
    const [ka, kb] = key.split('|'); const a = verts.get(ka), b = verts.get(kb); // exact positions, not the welded keys
    if (a[1] === 0 && b[1] === 0) { bed++; continue; }
    // an unpaired edge ON the clip plane is a hole in the cut face: counted as open, reported apart
    if (planeX !== null && Math.abs(Math.abs(a[0]) - planeX) < 1e-6 && Math.abs(Math.abs(b[0]) - planeX) < 1e-6) plane++;
    const txt = [a, b].map((q) => q.map((v) => (v * 1e3).toFixed(2)).join(',')).join(' -> ');
    if (insideT(a, b)) { tj++; if (tsample.length < 3) tsample.push(txt); continue; }
    open++;
    if (sample.length < 3) sample.push(txt);
  }
  return { open, tj, bed, plane, degenerate, sample, tsample };
}

/** the second arm: drop the cut cap's triangles (all three vertices on the clip plane) */
function dropClipCap(geo, planeX) {
  if (planeX === null) return 0;
  const p = geo.getAttribute('position').array; const ia = geo.getIndex() ? geo.getIndex().array : null;
  const n = ia ? ia.length : p.length / 3; const onP = (i) => Math.abs(Math.abs(p[i * 3]) - planeX) < 1e-7;
  const keep = []; let dropped = 0;
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((j) => (ia ? ia[t + j] : t + j));
    if (ids.every(onP)) { dropped++; continue; }
    keep.push(...ids);
  }
  if (ia) geo.setIndex(keep);
  else { const src = p; const out = new Float32Array(keep.length * 3); keep.forEach((i, k) => { out[3 * k] = src[3 * i]; out[3 * k + 1] = src[3 * i + 1]; out[3 * k + 2] = src[3 * i + 2]; }); geo.setAttribute('position', new (geo.getAttribute('position').constructor)(out, 3)); }
  return dropped;
}

/** the arm: drop every triangle that spans the top ring's height and the cap height */
function dropClosure(geo, prof) {
  const tuck = prof.jointTuck || 0; if (!(tuck > 0)) return 0;
  const p = geo.getAttribute('position').array; const ia = geo.getIndex().array; const F32Z = 1e-6;
  const zTop = prof.zTop, zCap = prof.zTop - tuck; const keep = []; let dropped = 0;
  for (let t = 0; t < ia.length; t += 3) {
    const ys = [0, 1, 2].map((j) => p[ia[t + j] * 3 + 1]);
    const atTop = ys.some((y) => Math.abs(y - zTop) <= F32Z), atCap = ys.some((y) => Math.abs(y - zCap) <= F32Z);
    const allOn = ys.every((y) => Math.abs(y - zTop) <= F32Z || Math.abs(y - zCap) <= F32Z);
    if (atTop && atCap && allOn) { dropped++; continue; }
    keep.push(ia[t], ia[t + 1], ia[t + 2]);
  }
  geo.setIndex(keep); return dropped;
}

/** one RUN over the listed entries: per loft {id, rail, tucked, open, bed, plane} */
function runAll(perturb) {
  const out = [];
  for (const id of TABLES) {
    const G = makeGeom(id);
    const zNose = G.kernel.noseHeightFrac * G.render.profileBallD;
    // Match the OX replacement the scene emits, including its measured
    // section and fixed-facing sweep. Other entries keep the family loft.
    const specific = roxCushionFor(G);
    const prof = specific?.profile ?? cushionProfile(G.render.cushionFamily, zNose, G.CW);
    const tucked = (prof.jointTuck || 0) > 0;
    railPolysFor(G).forEach((poly, pi) => {
      let geo = specific ? specific.geometry(poly) : cushionGeom(G, poly, prof); let planeX = null;
      if (perturb === 'drop-closure') dropClosure(geo, prof); // before the clip, as the mesh would be built
      // the clip decision for the cn8 long half-rails (table.js: railPolysCn8R82 bodies within
      // 100 mm of the middle axis) is taken BEFORE the degenerate perturbations: the plant site
      // must sit wholly on the clip-kept side so the clip carries it through intact
      let side = 0;
      if (G.render.style === 'cn8') {
        geo.computeBoundingBox(); const bb = geo.boundingBox;
        if (Math.min(Math.abs(bb.min.x), Math.abs(bb.max.x)) < 0.1) side = Math.sign(bb.min.x + bb.max.x) || 1;
      }
      let placed = true; // the degenerate perturbations apply pre-clip, like the mesh is built
      const zCap = prof.zTop - (prof.jointTuck || 0);
      const clipOpts = { side, keptX: DT09 };
      if (perturb === 'plant-degenerate') placed = plantDegenerate(geo, zCap, clipOpts);
      if (perturb === 'plant-collinear') placed = plantCollinear(geo, zCap, clipOpts);
      if (perturb === 'plant-weldonly') placed = plantWeldOnly(geo, zCap, clipOpts);
      if (perturb === 'inflate-degenerate') placed = inflateDegenerate(geo, zCap, clipOpts);
      const deg = degenerateCensus(geo, zCap); // PRE-clip: the cross-gate line
      if (side !== 0) {
        geo = clipGeometryPlane(geo, [side, 0, 0], DT09, true); planeX = DT09;
        if (perturb === 'drop-clip-cap') dropClipCap(geo, planeX); // after the clip: the cap alone goes
      }
      out.push({ id, rail: pi, tucked, clipped: planeX !== null, banded: !specific && !!(poly.jawK && poly.profiled), placed, deg, ...openEdges(geo, planeX) });
    });
  }
  return out;
}

const clean = runAll(null);
for (const r of clean) console.log(`DEGENERATE ${r.id} rail${r.rail} repeated=${r.deg.repeated} zero-area=${r.deg.zeroArea} cap-plane=${r.deg.capPlane}`);
for (const r of clean) console.log(`  ${r.id} rail${r.rail}: open ${r.open} T-junctions ${r.tj} (plane-unpaired ${r.plane}) bed ${r.bed} degenerate ${r.degenerate}${r.open ? ' e.g. ' + r.sample.join(' ; ') : ''}${r.tj ? ' T e.g. ' + r.tsample.join(' ; ') : ''}`);
const dirty = clean.filter((r) => r.open > 0 || r.tj > 0);
if (PERTURB === 'drop-closure') {
  // DIFFERENTIAL arm against the clean run of the same invocation: the clean run must be closed
  // everywhere; the perturbed run must open EVERY tucked loft and change NO untucked loft.
  const pert = runAll('drop-closure');
  const problems = [];
  if (dirty.length) problems.push(`clean run not closed on ${dirty.length} loft(s): ${dirty.slice(0, 3).map((r) => `${r.id} rail${r.rail} open ${r.open}`).join(' | ')}`);
  const tucked = clean.filter((r) => r.tucked);
  const notOpened = pert.filter((r, i) => clean[i].tucked && (r.open + r.tj) <= (clean[i].open + clean[i].tj));
  if (notOpened.length || !tucked.length) problems.push(`the count did not open on ${notOpened.length} of ${tucked.length} tucked loft(s)${notOpened.length ? ': ' + notOpened.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ') : ''}`);
  const untouched = pert.filter((r, i) => !clean[i].tucked && (r.open + r.tj) !== (clean[i].open + clean[i].tj));
  if (untouched.length) problems.push(`${untouched.length} untucked loft(s) changed under the perturbation: ${untouched.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (!problems.length) {
    const opened = pert.filter((r, i) => clean[i].tucked).map((r) => r.open + r.tj);
    console.log(`[perturb drop-closure] ARMED — differential: clean run 0 open / 0 T-junctions on ${clean.length} lofts; the skirt removed opens `
      + `${tucked.length} of ${tucked.length} tucked lofts (open edges ${Math.min(...opened)}–${Math.max(...opened)}), 0 untucked lofts changed; coverage ${COVERAGE}`);
    process.exit(0);
  }
  console.error(`[perturb drop-closure] FAIL — ${problems.join('; ')}; coverage ${COVERAGE}`);
  process.exit(1);
}
if (PERTURB === 'drop-clip-cap') {
  // DIFFERENTIAL arm: the clean run closed everywhere; the cap removed must open the plane-unpaired
  // count on EVERY clipped loft and change no unclipped loft.
  const pert = runAll('drop-clip-cap');
  const problems = [];
  if (dirty.length) problems.push(`clean run not closed on ${dirty.length} loft(s): ${dirty.slice(0, 3).map((r) => `${r.id} rail${r.rail} open ${r.open}`).join(' | ')}`);
  const clipped = clean.filter((r) => r.clipped);
  const notOpened = pert.filter((r, i) => clean[i].clipped && !(r.plane > clean[i].plane && (r.open + r.tj) > (clean[i].open + clean[i].tj)));
  if (notOpened.length || !clipped.length) problems.push(`the plane-unpaired count did not open on ${notOpened.length} of ${clipped.length} clipped loft(s)${notOpened.length ? ': ' + notOpened.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ') : ''}`);
  const untouched = pert.filter((r, i) => !clean[i].clipped && (r.open + r.tj) !== (clean[i].open + clean[i].tj));
  if (untouched.length) problems.push(`${untouched.length} unclipped loft(s) changed under the perturbation: ${untouched.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (!problems.length) {
    const opened = pert.filter((r, i) => clean[i].clipped).map((r) => r.plane);
    console.log(`[perturb drop-clip-cap] ARMED — differential: clean run 0 open / 0 T-junctions on ${clean.length} lofts; the cut cap removed opens `
      + `${clipped.length} of ${clipped.length} clipped lofts (plane-unpaired ${Math.min(...opened)}–${Math.max(...opened)}), 0 unclipped lofts changed; coverage ${COVERAGE}`);
    process.exit(0);
  }
  console.error(`[perturb drop-clip-cap] FAIL — ${problems.join('; ')}; coverage ${COVERAGE}`);
  process.exit(1);
}
if (PERTURB === 'plant-degenerate' || PERTURB === 'plant-collinear' || PERTURB === 'plant-weldonly' || PERTURB === 'inflate-degenerate') {
  // DIFFERENTIAL degenerate arms (issue #728): per-loft DELTAS against the clean run of the same
  // invocation — never a clean tree — so a red elsewhere (#688's wpbsa) cannot mask them. Each
  // plant raises exactly its definition class (+1 per loft, open+T unchanged); the inflate raises
  // open+T (>= 2 per loft — a planted unpaired edge may read as a T-junction, hence open+tj as
  // the drop-closure arm does) with the degenerate count unchanged.
  const pert = runAll(PERTURB);
  for (const r of pert) console.log(`DEGENERATE ${r.id} rail${r.rail} repeated=${r.deg.repeated} zero-area=${r.deg.zeroArea} cap-plane=${r.deg.capPlane}`);
  for (const r of pert) console.log(`  ${r.id} rail${r.rail} [perturbed ${PERTURB}]: open ${r.open} T-junctions ${r.tj} (plane-unpaired ${r.plane}) bed ${r.bed} degenerate ${r.degenerate}`);
  const problems = [];
  if (!clean.length) problems.push('no lofts iterated (N is 0) — refusing a vacuous pass');
  const unplaced = pert.filter((r) => !r.placed);
  if (unplaced.length) problems.push(`no ${PERTURB} site on ${unplaced.length} loft(s): ${unplaced.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  const want = { 'plant-degenerate': [1, 0], 'plant-collinear': [0, 1], 'plant-weldonly': [1, 0], 'inflate-degenerate': [0, 0] }[PERTURB];
  const badClass = pert.filter((r, i) => r.placed && (r.deg.repeated !== clean[i].deg.repeated + want[0] || r.deg.zeroArea !== clean[i].deg.zeroArea + want[1]));
  if (badClass.length) problems.push(`census repeated+${want[0]} zero-area+${want[1]} on ${clean.length - badClass.length} of ${clean.length} lofts: ${badClass.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (PERTURB === 'inflate-degenerate') {
    const bad = pert.filter((r, i) => r.placed && (r.degenerate !== clean[i].degenerate || (r.open + r.tj) < (clean[i].open + clean[i].tj) + 2));
    if (bad.length) problems.push(`degenerate unchanged with open+T +>=2 on ${clean.length - bad.length} of ${clean.length} lofts: ${bad.slice(0, 3).map((r) => `${r.id} rail${r.rail} (degenerate ${r.degenerate}, open+T ${r.open + r.tj})`).join(' | ')}`);
  } else {
    const bad = pert.filter((r, i) => r.placed && (r.degenerate !== clean[i].degenerate + 1 || (r.open + r.tj) !== (clean[i].open + clean[i].tj)));
    if (bad.length) problems.push(`degenerate +1 with open+T unchanged on ${clean.length - bad.length} of ${clean.length} lofts: ${bad.slice(0, 3).map((r) => `${r.id} rail${r.rail} (degenerate ${r.degenerate}, open+T ${r.open + r.tj})`).join(' | ')}`);
  }
  if (!problems.length) {
    const lines = {
      'plant-degenerate': `[perturb plant-degenerate] ARMED — degenerate +1 on ${clean.length} of ${clean.length} lofts, open+T unchanged on ${clean.length} of ${clean.length}`,
      'plant-collinear': `[perturb plant-collinear] ARMED — zero-area +1 on ${clean.length} of ${clean.length} lofts, open+T unchanged on ${clean.length} of ${clean.length}`,
      'plant-weldonly': `[perturb plant-weldonly] ARMED — repeated +1 on ${clean.length} of ${clean.length} lofts, open+T unchanged on ${clean.length} of ${clean.length}`,
      'inflate-degenerate': `[perturb inflate-degenerate] ARMED — degenerate unchanged, open+T rose (>= 2) on ${clean.length} of ${clean.length} lofts`,
    };
    console.log(lines[PERTURB]);
    process.exit(0);
  }
  console.error(`[perturb ${PERTURB}] FAIL — ${problems.join('; ')}`);
  process.exit(1);
}
if (PERTURB === 'band-law-off') {
  // DIFFERENTIAL arm (GH-688): the clean run must be closed everywhere; skipping the band law via
  // OB_ARM must open EVERY banded loft and change NO unbanded loft. The env is restored and asserted.
  const problems = [];
  const prevArm = process.env.OB_ARM;
  let pert;
  try {
    process.env.OB_ARM = prevArm ? `${prevArm},band-law-off` : 'band-law-off';
    pert = runAll(null);
  } finally {
    if (prevArm === undefined) delete process.env.OB_ARM; else process.env.OB_ARM = prevArm;
  }
  const fmtArm = (v) => (v === undefined ? 'unset' : `'${v}'`);
  if (process.env.OB_ARM !== prevArm) problems.push(`OB_ARM not restored (was ${fmtArm(prevArm)}, now ${fmtArm(process.env.OB_ARM)})`);
  const post = runAll(null);
  const postDiff = post.filter((r, i) => r.open !== clean[i].open || r.tj !== clean[i].tj);
  if (postDiff.length) problems.push(`post-restore clean re-run differs on ${postDiff.length} loft(s)`);
  if (dirty.length) problems.push(`clean run not closed on ${dirty.length} loft(s): ${dirty.slice(0, 3).map((r) => `${r.id} rail${r.rail} open ${r.open}`).join(' | ')}`);
  const banded = clean.filter((r) => r.banded);
  const notOpened = pert.filter((r, i) => clean[i].banded && (r.open + r.tj) <= (clean[i].open + clean[i].tj));
  if (notOpened.length || !banded.length) problems.push(`the count did not open on ${notOpened.length} of ${banded.length} banded loft(s)${notOpened.length ? ': ' + notOpened.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ') : ''}`);
  const untouched = pert.filter((r, i) => !clean[i].banded && (r.open + r.tj) !== (clean[i].open + clean[i].tj));
  if (untouched.length) problems.push(`${untouched.length} unbanded loft(s) changed under the perturbation: ${untouched.slice(0, 3).map((r) => `${r.id} rail${r.rail}`).join(' | ')}`);
  if (!problems.length) {
    const opened = pert.filter((r, i) => clean[i].banded).map((r) => r.open + r.tj);
    console.log(`[perturb band-law-off] ARMED — differential: clean run 0 open / 0 T-junctions on ${clean.length} lofts; the band law skipped opens `
      + `${banded.length} of ${banded.length} banded lofts (open edges + T-junctions ${Math.min(...opened)}–${Math.max(...opened)}), 0 unbanded lofts changed; coverage ${COVERAGE}`);
    process.exit(0);
  }
  console.error(`[perturb band-law-off] FAIL — ${problems.join('; ')}; coverage ${COVERAGE}`);
  process.exit(1);
}
if (dirty.length) {
  for (const r of dirty) console.error(`FAIL: ${r.id} rail${r.rail}: ${r.open} open edge(s) + ${r.tj} T-junction(s) (plane-unpaired ${r.plane}, bed ${r.bed})${r.open ? ' e.g. ' + r.sample.join(' ; ') : ''}${r.tj ? ' T e.g. ' + r.tsample.join(' ; ') : ''}`);
  console.error(`[loft-manifold] FAIL — ${dirty.length} of ${clean.length} lofts carry open edges or T-junctions; coverage ${COVERAGE}`); process.exit(1);
}
console.log(`[loft-manifold] PASS — 0 open edges, 0 T-junctions (plane-unpaired 0) on ${clean.length} lofts; coverage ${COVERAGE}`);
