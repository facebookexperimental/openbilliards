// Copyright (c) Meta Platforms, Inc. and affiliates.

// lighting-occlusion-lut.mjs — ORDER-LIGHT-9 Q2: the DERIVED sphere–plane visibility that replaces the authored
// ball-underside occlusion `1 − 0.9·clamp(0.5 − 0.5·n_y)·exp(−60·h)` (shading.js SPIKE_BALL). No free constants.
//
// Physics. A ball (radius r) rests on the cloth, a Lambertian plane y = 0. The ball's per-ball SH probe was baked in
// FREE space at the ball centre: its lower hemisphere is the cloth's radiance as seen from a point where no ball
// stands, so the cloth under the probe is UNshadowed. The real ball shadows the cloth it sits on: at a plane point q
// at horizontal distance d from the contact point, a sphere of radius r whose centre is at height c above the plane
// covers the fraction
//     F_sph(d) = r² c / (d² + c²)^{3/2}                                   (differential plane element → sphere)
// of the diffuse sky, so under a diffuse overhead source the cloth's radiance there is L(q) = L₀ · s(d),
//     s(d) = 1 − r² c / (d² + c²)^{3/2}          (s(0) = 0 at the contact point for c = r; s → 1 far away)
// A fragment p on the ball with outward normal n at height h = p_y receives from the plane
//     E_plane = ∫_{n·ω > 0, ω_y < 0} L(q(ω)) (n·ω) dω,   q(ω) = p + (h / −ω_y) ω
// which, for L ≡ L₀ (the probe's assumption), is L₀ · π · P(n_y) with the differential-to-half-space form factor
//     P(n_y) = (1 − n_y) / 2                                            (1 at n = −y, ½ at the horizon, 0 at +y)
// The visibility the shader must apply to the probe's plane share is therefore
//     V(n_y, h/r) = ∫ s(|q_xz(ω)|) (n·ω) dω  /  (π P(n_y))            (cosine-weighted mean of s over the visible plane)
// and the multiplier on the probe irradiance (its upper-hemisphere share untouched)
//     M(n_y, h/r) = 1 − P(n_y) · (1 − V(n_y, h/r)) = (1 − P) + (1/π) ∫ s (n·ω) dω.
// Geometry per (n_y, η = h/r): r = 1; ρ = √(1 − n_y²) (the fragment's horizontal offset from the contact axis);
// n = (ρ, n_y, 0); p = (ρ, η, 0); the sphere centre height c = max(1, η − n_y) (c = 1 for a resting ball, where
// η = 1 + n_y; a fragment higher than that means the ball is lifted by η − 1 − n_y and the shadow weakens).
// Limits (closed form): n_y = +1 → P = 0 → M = 1 (the crown sees no plane). η → 0 → every plane hit lands at the
// fragment's own footprint, q → p, so V → s(ρ) and
//     M(n_y, 0) = 1 − ½ (1 − n_y) · (2 − n_y²)^{−3/2}                   (c = 1, ρ² + c² = 2 − n_y²)
// giving M(−1, 0) = 0 (the contact point: the cloth it touches is entirely in the ball's sky shadow),
// M(0, 0) = 1 − 2^{−5/2} = 0.823223…, M(+1, 0) = 1. These three are the arm's analytic anchors.
// Evaluation: the integral has no elementary closed form for a general (n_y, η) (a half-plane integral of an
// algebraic kernel about an off-axis point); it is evaluated here by stratified cosine-weighted quadrature (N²
// directions per node; ≈ 1e-5 — the round-9 verifier's independent scipy integral agrees to ≤ 8e-6 at the nodes,
// ≤ 2.1e-5 against an N = 640 regeneration) onto a 65 × 33 table over n_y ∈ [−1, 1] × η ∈ [0, 2] with the η = 0
// row written from the closed form. ROW SPACING: η_j = η_max · (j/32)² — M rises from 0 with slope ≈ 1.8 per η at
// the contact and is concave, so uniform rows over-estimated the contact ring by bilinear interpolation (verifier
// round 9: +0.02 at n_y −0.97); the square-root spacing puts 8 rows inside η < 0.125 and the shader samples the
// row axis at √(h/(2r)). Determinism: pure arithmetic, fixed strata, no rng.
// ORDER-LIGHT-C2-FIX1 class C (review r3 P2, shading.js:2226): the table's height domain was h/r ∈ [0, 2] and the shader clamped
// above it, so an airborne fragment at h/r = 10 kept the h/r = 2 multiplier (n_y = −1: 0.9398) where the integral gives
// ≈ 0.9964 — a persistent underside darkening on jumped balls. The domain is now h/r ∈ [0, 8] with 65 rows: η_j = 8·(j/64)²
// = j²/512 — exactly the old grid's η_j = 2·(j/32)² for j ≤ 32 (the same nodes, the same quadrature → the same values, so a
// resting ball's pixels do not move) plus 32 rows from 2 to 8. Beyond 8 the shader applies a FAR TAIL derived from the same
// form factor: the plane's shadow deficit integrates to a constant (∫ r²c/(d²+c²)^{3/2} dA = 2π for every centre height c),
// spread over a spot of radius ~c seen from the fragment at distance ~c, so 1 − M(n_y, η) falls as 1/c² with
// c = max(1, η − n_y); the tail continues the table's last row as 1 − M = (1 − M(n_y, 8))·(c₈/c)², c₈ = 8 − n_y — no
// authored curve, one asymptote of the integrand, and the generator MEASURES its error against the exact integral at
// h/r ∈ {2, 4, 8, 10, 16, 32} for n_y ∈ {−1, −0.5, 0} (tools/render/fixtures/lighting-occlusion-far.json; `--check` re-judges a
// committed LUT file against those integrals and exits non-zero when the far error exceeds the table's own interpolation error).
//   node tools/render/lighting-occlusion-lut.mjs [--n 384] [--out web/scene/occlusionlut.js] [--json FILE]
//   node tools/render/lighting-occlusion-lut.mjs --check [--lut web/scene/occlusionlut.js]   # judge a committed LUT (the arm: the pre-FIX1 LUT fails at h/r 10)
import fs from 'node:fs';
const args = process.argv.slice(2);
const argOf = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = Number(argOf('--n', '384')), OUT = argOf('--out', 'web/scene/occlusionlut.js'), JSON_OUT = argOf('--json', null);
const NY = 65, NH = 65, ETA_MAX = 8.0; // C2-FIX1: 33 → 65 rows, 2 → 8 (rows 0..32 unchanged: η_j = j²/512 in both)
const CHECK = args.includes('--check'), LUT_IN = argOf('--lut', 'web/scene/occlusionlut.js');
const P = (ny) => 0.5 * (1 - ny);
const s_of = (d2, c) => 1 - c / Math.pow(d2 + c * c, 1.5); // r = 1
const closedForm0 = (ny) => 1 - 0.5 * (1 - ny) * Math.pow(2 - ny * ny, -1.5);

/** M(n_y, η) by stratified cosine-weighted hemisphere quadrature around n = (ρ, n_y, 0), fragment p = (ρ, η, 0). */
function M(ny, eta) {
  if (eta <= 0) return closedForm0(ny);
  const rho = Math.sqrt(Math.max(0, 1 - ny * ny));
  const c = Math.max(1, eta - ny);
  const n = [rho, ny, 0];
  // orthonormal basis (t, b, n)
  const a = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let t = [a[1] * n[2] - a[2] * n[1], a[2] * n[0] - a[0] * n[2], a[0] * n[1] - a[1] * n[0]];
  const tl = Math.hypot(...t); t = t.map((v) => v / tl);
  const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
  let acc = 0, hits = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const u1 = (i + 0.5) / N, u2 = (j + 0.5) / N;
    const r_ = Math.sqrt(u1), phi = 2 * Math.PI * u2;
    const x = r_ * Math.cos(phi), y = r_ * Math.sin(phi), z = Math.sqrt(Math.max(0, 1 - u1));
    const wy = t[1] * x + b[1] * y + n[1] * z; // ω_y
    if (wy >= 0) continue; // misses the plane
    const wx = t[0] * x + b[0] * y + n[0] * z, wz = t[2] * x + b[2] * y + n[2] * z;
    const tt = eta / -wy; // distance to the plane along ω
    const qx = rho + tt * wx, qz = tt * wz; // hit point (plane coordinates); the contact axis is x = z = 0
    acc += s_of(qx * qx + qz * qz, c); hits++;
  }
  const tot = N * N;
  const planeShare = hits / tot; // ≈ P(n_y) (cosine-weighted fraction below the horizon) — the quadrature's own estimate
  return (1 - planeShare) + acc / tot; // (1 − P) + (1/π)∫ s (n·ω) dω, both from the same strata
}
// ---- C2-FIX1 class C: the far tail and its measured error ------------------------------------------------------------
// the shader's read for any η: bilinear in the table for η ≤ ETA_MAX (row axis √(η/ETA_MAX)·(NH−1)), and beyond it the last row's
// deficit scaled by (c_max / c)², c = max(1, η − n_y), c_max = ETA_MAX − n_y (the 1/c² asymptote of the plane form factor)
const shaderRead = (tab, nh, etaMax, ny, eta, tail = 'inv-c2') => {
  const fx = Math.min(Math.max((ny + 1) * 0.5, 0), 1) * (NY - 1), fy = Math.min(Math.max(Math.sqrt(Math.min(Math.max(eta / etaMax, 0), 1)), 0), 1) * (nh - 1);
  const i = Math.min(Math.floor(fx), NY - 2), j = Math.min(Math.floor(fy), nh - 2), tx = fx - i, ty = fy - j;
  const at = (ii, jj) => tab[jj * NY + ii];
  const m = (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
  if (eta <= etaMax || tail !== 'inv-c2') return m; // no declared tail = the pre-FIX1 read: clamped at the last row
  const cmax = etaMax - ny, c = Math.max(1, eta - ny);
  return 1 - (1 - m) * (cmax * cmax) / (c * c);
};
const FAR_ETAS = [2, 4, 8, 10, 16, 32], FAR_NYS = [-1, -0.5, 0];
function farCheck(tab, nh, etaMax, label, tail = 'inv-c2') {
  const nodes = [];
  for (const ny of FAR_NYS) for (const eta of FAR_ETAS) {
    const exact = M(ny, eta), read = shaderRead(tab, nh, etaMax, ny, eta, tail);
    nodes.push({ ny, eta, exact: Number(exact.toFixed(7)), lut: Number(read.toFixed(7)), err: Number((read - exact).toFixed(7)), regime: eta <= etaMax ? 'table' : 'tail' });
  }
  const maxErr = Math.max(...nodes.map((n) => Math.abs(n.err)));
  // the table's OWN interpolation error along the resting manifold near the contact (recorded: the contact ring's accuracy)
  const interp = [];
  for (const ny of [-0.99, -0.97, -0.95, -0.9, -0.85, -0.8, -0.63]) { const eta = 1 + ny; interp.push(Math.abs(shaderRead(tab, nh, etaMax, ny, eta, tail) - M(ny, eta))); }
  const interpMax = Math.max(...interp);
  // the bound the far law is JUDGED against (refuter round: the contact-ring error is vacuous for the tail — a domain-only extension with no tail
  // passes it): the table's own interpolation error over its FAR rows, at the midpoints between consecutive rows from η = 2 to η_max, for the
  // same n_y set — the tail must be at least as good as the table is where the tail begins
  const interpFar = [];
  const rowsOf = (nh_) => Array.from({ length: nh_ }, (_, jj) => etaMax * Math.pow(jj / (nh_ - 1), 2));
  const etas = rowsOf(nh); const j2 = etas.findIndex((e) => e >= 2) || 1;
  for (const ny of FAR_NYS) for (let jj = Math.max(1, j2); jj < nh; jj++) { const eta = 0.5 * (etas[jj - 1] + etas[jj]); interpFar.push(Math.abs(shaderRead(tab, nh, etaMax, ny, eta, tail) - M(ny, eta))); }
  const interpFarMax = interpFar.length ? Math.max(...interpFar) : 0;
  const tailNodes = nodes.filter((n) => n.regime === 'tail'); const tailMax = tailNodes.length ? Math.max(...tailNodes.map((n) => Math.abs(n.err))) : 0;
  return { label, nh, etaMax, tail, nodes, maxErr: Number(maxErr.toFixed(7)), tailMaxErr: Number(tailMax.toFixed(7)), interpMaxErr: Number(interpMax.toFixed(7)), interpFarMaxErr: Number(interpFarMax.toFixed(7)),
    within: (tailMax <= interpFarMax && maxErr <= interpMax) ? 1 : 0, err_ny_m1_eta10: nodes.find((n) => n.ny === -1 && n.eta === 10)?.err ?? null };
}
if (CHECK) {
  // judge a committed LUT file: its declared shape / etaMax, the SAME integral, the SAME shader read (a pre-FIX1 LUT reads η > 2 at its last row)
  const src = fs.readFileSync(LUT_IN, 'utf8');
  const nh = Number(/ny:\s*(\d+)/.exec(src)[1]), etaMax = Number(/etaMax:\s*([\d.]+)/.exec(src)[1]); const tailM = /tail:\s*'([\w-]+)'/.exec(src); const tail = tailM ? tailM[1] : 'none';
  const data = Float32Array.from(/new Float32Array\(\[([^\]]*)\]\)/.exec(src)[1].split(',').map(Number));
  const fc = farCheck(data, nh, etaMax, LUT_IN, tail);
  console.log(`[occ-lut] --check ${LUT_IN}: shape ${NY}×${nh}, etaMax ${etaMax}, tail ${tail}; far nodes max |err| ${fc.maxErr} (tail nodes ${fc.tailMaxErr}; n_y −1, h/r 10: ${fc.err_ny_m1_eta10}); the table's own interpolation error: far rows ${fc.interpFarMaxErr}, contact ring ${fc.interpMaxErr} → ${fc.within ? "WITHIN (tail ≤ the far rows' own error, all nodes ≤ the contact ring's)" : "EXCEEDS (FAIL)"}`);
  for (const n of fc.nodes.filter((n) => n.ny === -1)) console.log(`  n_y −1 h/r ${n.eta}: exact ${n.exact} lut ${n.lut} err ${n.err} (${n.regime})`);
  process.exit(fc.within ? 0 : 4);
}
const t0 = Date.now();
const table = new Float32Array(NY * NH);
const rows = [];
const etaOf = (j) => ETA_MAX * Math.pow(j / (NH - 1), 2); // √η row spacing (see header)
for (let j = 0; j < NH; j++) {
  const eta = etaOf(j); const row = [];
  for (let i = 0; i < NY; i++) { const ny = -1 + (2 * i) / (NY - 1); const m = M(ny, eta); table[j * NY + i] = m; row.push(m); }
  rows.push(row);
}
// anchors and sanity
const anchors = { 'M(-1,0)': closedForm0(-1), 'M(0,0)': closedForm0(0), 'M(1,0)': closedForm0(1) };
// bilinear read of the table exactly as the shader does it (u = (n_y+1)/2·64, v = √(η/η_max)·32)
const readTable = (ny, eta) => {
  const fx = Math.min(Math.max((ny + 1) * 0.5, 0), 1) * (NY - 1), fy = Math.min(Math.max(Math.sqrt(Math.min(Math.max(eta / ETA_MAX, 0), 1)), 0), 1) * (NH - 1);
  const i = Math.min(Math.floor(fx), NY - 2), j = Math.min(Math.floor(fy), NH - 2), tx = fx - i, ty = fy - j;
  const at = (ii, jj) => table[jj * NY + ii];
  return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
};
const sanity = { resting_ball_examples: {}, interpolation_check_resting_manifold: {} };
for (const ny of [-1, -0.8, -0.63, -0.55, -0.3, 0, 0.5, 1]) { const eta = 1 + ny; sanity.resting_ball_examples[`ny ${ny}`] = { eta: Number(eta.toFixed(3)), M: Number(M(ny, eta).toFixed(5)), legacy: Number((1 - 0.9 * Math.min(Math.max(0.5 - 0.5 * ny, 0), 1) * Math.exp(-eta * 0.028575 * 60)).toFixed(5)) }; }
// interpolation error along the resting manifold near the contact (the verifier's finding): exact quadrature vs the
// shader's bilinear read of the table
for (const ny of [-0.99, -0.97, -0.95, -0.9, -0.85, -0.8, -0.63]) { const eta = 1 + ny; const ex = M(ny, eta), bl = readTable(ny, eta); sanity.interpolation_check_resting_manifold[`ny ${ny}`] = { eta: Number(eta.toFixed(3)), exact: Number(ex.toFixed(5)), bilinear: Number(bl.toFixed(5)), delta: Number((bl - ex).toFixed(5)) }; }
// ORDER-LIGHT-10 item 4: an INTERIOR-node arm that does not test the formula against itself. A second, independent
// quadrature — over the PLANE in polar coordinates about the fragment's foot (E = h ∫ L(q) n·(q−p)/|q−p|⁴ dA), not
// the hemisphere strata above — at nine interior nodes, against the table, and the AUTHORED term at the same nodes
// (the arm: the table must be far from the authored shape). Written to tools/render/fixtures/lighting-occlusion-check.json.
function M_plane(ny, eta, NR = 2000, NP = 720) {
  if (eta <= 0) return closedForm0(ny);
  const rho = Math.sqrt(Math.max(0, 1 - ny * ny)), c = Math.max(1, eta - ny); const n = [rho, ny, 0]; const p = [rho, eta, 0];
  // plane point q = foot + R (cos φ, sin φ); dA = R dR dφ; kernel h · (n·(q−p)) / |q−p|⁴ ; R = eta·tan θ substitution for range
  let acc = 0;
  for (let i = 0; i < NR; i++) {
    const th = (i + 0.5) / NR * (Math.PI / 2); const R = eta * Math.tan(th); const dR = eta / Math.pow(Math.cos(th), 2) * (Math.PI / 2 / NR);
    for (let j = 0; j < NP; j++) {
      const ph = (j + 0.5) / NP * 2 * Math.PI; const qx = rho + R * Math.cos(ph), qz = R * Math.sin(ph);
      const dx = qx - p[0], dy = -eta, dz = qz; const d2 = dx * dx + dy * dy + dz * dz; const ndq = n[0] * dx + n[1] * dy + n[2] * dz;
      if (ndq <= 0) continue;
      acc += s_of(qx * qx + qz * qz, c) * eta * ndq / (d2 * d2) * R * dR * (2 * Math.PI / NP);
    }
  }
  return (1 - P(ny)) + acc / Math.PI;
}
const interior = [];
for (const [i, j] of [[16, 8], [40, 16], [8, 4], [56, 24], [2, 2], [60, 31], [24, 12], [48, 6], [12, 20]]) {
  const ny = -1 + (2 * i) / (NY - 1), eta = etaOf(j); const tab = table[j * NY + i]; const ind = M_plane(ny, eta);
  const legacy = 1 - 0.9 * Math.min(Math.max(0.5 - 0.5 * ny, 0), 1) * Math.exp(-eta * 0.028575 * 60);
  interior.push({ i, j, ny: Number(ny.toFixed(6)), eta: Number(eta.toFixed(6)), table: Number(tab.toFixed(7)), independent: Number(ind.toFixed(7)), delta: Number((ind - tab).toFixed(7)), authored: Number(legacy.toFixed(6)), authored_delta: Number((legacy - tab).toFixed(6)) });
}
const check = { what: 'interior-node arm: the committed table vs an INDEPENDENT plane-domain quadrature (polar about the fragment foot, 2000 × 720) at nine interior nodes, and the AUTHORED term 1 − 0.9·clamp(0.5 − 0.5 n_y)·exp(−60 h) at the same nodes (r = 0.028575 m)',
  generator: 'tools/render/lighting-occlusion-lut.mjs', N_table: N, nodes: interior,
  max_abs_delta_independent: Math.max(...interior.map((r) => Math.abs(r.delta))), max_abs_delta_authored: Math.max(...interior.map((r) => Math.abs(r.authored_delta))), min_abs_delta_authored: Math.min(...interior.map((r) => Math.abs(r.authored_delta))) };
fs.mkdirSync('tools/render/fixtures', { recursive: true });
fs.writeFileSync('tools/render/fixtures/lighting-occlusion-check.json', JSON.stringify(check, null, 1) + '\n');
console.log('[occ-lut] interior arm: independent quadrature vs table max |Δ|', check.max_abs_delta_independent, '| authored vs table min/max |Δ|', check.min_abs_delta_authored, check.max_abs_delta_authored);
const far = farCheck(table, NH, ETA_MAX, 'generated');
const noTail = farCheck(table, NH, ETA_MAX, 'generated-without-tail', 'none'); // the negative control the check must fail: the same data read with no tail
fs.writeFileSync('tools/render/fixtures/lighting-occlusion-far.json', JSON.stringify({ noTailControl: { tailMaxErr: noTail.tailMaxErr, within: noTail.within }, what: 'C2-FIX1 class C: the shader read (table + the 1/c² far tail) vs the exact integral at h/r ∈ {2,4,8,10,16,32} × n_y ∈ {−1,−0.5,0}; within = the tail\'s far error ≤ the far rows\' own interpolation error AND every far node ≤ the contact ring\'s (the refuter round\'s rule)', generator: 'tools/render/lighting-occlusion-lut.mjs', N_table: N, ...far }, null, 1) + '\n');
console.log('[occ-lut] far tail: max |err|', far.maxErr, '(tail nodes', far.tailMaxErr, '; n_y −1, h/r 10:', far.err_ny_m1_eta10, ') vs the table\'s own far-row interpolation error', far.interpFarMaxErr, '(contact ring', far.interpMaxErr, ')', far.within ? 'WITHIN' : 'EXCEEDS', '| the same data with NO tail:', noTail.tailMaxErr, noTail.within ? 'WITHIN (the bound would not catch a missing tail!)' : 'EXCEEDS (the check catches a missing tail)');
const secs = (Date.now() - t0) / 1000;
const header = `// occlusionlut.js — GENERATED by tools/render/lighting-occlusion-lut.mjs (N=${N}); do not edit by hand.
// ORDER-LIGHT-9 Q2: DERIVED sphere–plane visibility M(n_y, h/r) for a ball on the cloth — the multiplier the ball
// shader applies to its per-ball SH irradiance in place of the authored 1 − 0.9·clamp(0.5 − 0.5·n_y)·exp(−60·h).
// Derivation (full text in the generator header and SPIKE-REPORT-LIGHTING.md §14.2): a sphere of radius r with its
// centre at height c shadows a diffuse plane point at horizontal distance d by the form factor r²c/(d²+c²)^{3/2};
// the fragment's plane-originating irradiance is the cosine-weighted mean of the shadowed plane radiance over the
// visible half-space; M = 1 − P·(1 − V), P = (1 − n_y)/2. Closed-form anchors at h = 0: M(n_y,0) = 1 − ½(1 − n_y)
// (2 − n_y²)^{−3/2} → M(−1,0) = 0, M(0,0) = 1 − 2^{−5/2} = ${closedForm0(0).toFixed(6)}, M(+1,0) = 1. Table: ${NY} × ${NH} over
// n_y ∈ [−1, 1] × h/r ∈ [0, ${ETA_MAX}] with SQUARE-ROOT row spacing η_j = ${ETA_MAX}·(j/${NH - 1})² = j²/512 (sample the row axis at √(h/(${ETA_MAX}r)); rows 0..32 are the\n// pre-FIX1 [0, 2] grid's nodes exactly; beyond h/r ${ETA_MAX} the shader continues the last row by the 1/c² far tail — C2-FIX1 class C), row-major
// (n_y fastest), Float32; the η = 0 row is the closed form; quadrature ≈ 1e-5. No free constants.
`;
const js = header + `export const OCC_LUT = { nx: ${NY}, ny: ${NH}, etaMax: ${ETA_MAX}, rowMap: 'sqrt', tail: 'inv-c2', n: ${N},
  anchors: ${JSON.stringify(anchors)},
  data: new Float32Array([${Array.from(table, (v) => Number(v.toFixed(7))).join(',')}]) };
/** the closed-form η = 0 slice (the arm's analytic reference) */
export const occClosedForm0 = (ny) => 1 - 0.5 * (1 - ny) * Math.pow(2 - ny * ny, -1.5);
/** ORDER-LIGHT-FIX6: the venue handshake value (see web/app/main.js) — a leaf without it puts the whole venue path on legacy */
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)
`;
fs.writeFileSync(OUT, js);
const report = { N, grid: { NY, NH, etaMax: ETA_MAX, rowMap: 'sqrt: eta_j = etaMax*(j/(NH-1))^2' }, seconds: secs, anchors, sanity, rows_eta: Array.from({ length: NH }, (_, j) => Number(etaOf(j).toFixed(7))), cols_ny: Array.from({ length: NY }, (_, i) => Number((-1 + (2 * i) / (NY - 1)).toFixed(7))), table: rows.map((r) => r.map((v) => Number(v.toFixed(6)))) };
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(report, null, 1) + '\n');
console.log(`[occ-lut] ${NY}×${NH} nodes, N ${N} (${N * N} strata/node), ${secs}s → ${OUT}`);
console.log('[occ-lut] anchors', anchors);
console.log('[occ-lut] resting-ball M vs legacy:', JSON.stringify(sanity.resting_ball_examples));
console.log('[occ-lut] interpolation (exact vs shader bilinear) near the contact:', JSON.stringify(sanity.interpolation_check_resting_manifold));
