// Copyright (c) Meta Platforms, Inc. and affiliates.

// midjaw-concord.mjs — GH-568 gate M4 "middle-jaw contact-height concordance".
//
// LAW: at the ball-contact height H = kernel.noseHeightFrac × profileBallD
// (0.70 × 52.5 mm = 36.75 mm on the snooker table), the CLOTH FACING the
// ball actually meets must ride the kernel's analytic middle-jaw chain —
// present in every 0.5 mm station bin over the full 71.68 mm two-arc chain,
// proud/recessed within tolerance, with the cloth wall standing at least up
// to H at every station. Four flanks: both sides of both middle pockets.
//
// WHY THIS IS ITS OWN INSTRUMENT (the GH-568 lesson): the pocket-physics
// close-out (2026-08-26) gated CORNER visual–kernel concordance, but the
// first middle-jaw read produced a false "air slot" because it inherited a
// CORNER-scoped ROI dump (x >= 1.2845 filter) that drops the middle bay's
// short local triangles — 0 local middle tris in the corner dump vs 4894 in
// a proper middle ROI (refutation record: PR #498 comment 5434858058). A
// middle row must OWN ITS ROI; cornerScopeAblation() below replays that
// exact artifact as the standing red arm.
//
// Method (verbatim the close-out refutation instrument, /tmp/ob-midpocket
// concord-mid.mjs, itself the lens3 concord.mjs method):
//   1. chain — the CEBP two-arc middle jaw (R 79.4 → R 53.2 at the 54°
//      junction) sampled at 0.2 mm with outward (play-side) normals on
//      all four world flanks. The JUDGED chains come from the KERNEL's
//      own Table serialization (chainsFromKernel over the wasm
//      table_geometry_json_for arcs — review r4 P1: a JS-mirror-derived
//      reference moves with the very mesh it judges); the JS mirror's
//      chains (middleChains) survive only as the other side of the
//      mirror-deviation check;
//   2. section — the bay triangle soup cut by the plane y = H (the same
//      per-triangle edge walk as c14-disjoint.mjs sectionAt / the gatecore
//      makeSecOf sectioner);
//   3. correspondence — section points sampled at 0.1 mm, each attributed
//      to its NEAREST chain sample across all four flanks jointly,
//      endpoint-excluded on the owning flank (beyond-tip /
//      beyond-tangency points are the nose line's and the fall's
//      business, not the jaw's); a 12 mm corridor sheds the recessed
//      construction behind the facing, while PLAY-SIDE points beyond it
//      — from ANY family, at any distance — are judged as envelope
//      violations: a surface must never escape by being too proud, too
//      far into the mouth, or by not being cloth;
//   4. binning — 0.5 mm station bins over the chain; per bin the MOST
//      PROUD contact-family offset survives (first-contact envelope: the
//      surface a ball touches first);
//   5. wall top — max contact-family height within ±1.5 mm of the chain
//      plan at 5 mm stations (a facing that stops below H concords in
//      plan and still plays as an air slot).
//
// Offsets are signed along the outward normal: positive = proud of the
// kernel chain (into the mouth / play side), negative = recessed behind it.
//
// The module is dependency-free and Node-only: the gate extracts the bay
// soup from the live scene over CDP and measures here.

const BIN = 0.0005; // station bin [m]
const CORR = 0.012; // correspondence corridor half-width [m]

/** The KERNEL's own middle-jaw chains (GH-568 review r4 P1: the reference
 *  may never come from the JS CEBP mirror — a mirror drift moves both the
 *  mesh and a makeGeom-derived chain, and every bar stays green through a
 *  real visual/physics mismatch). kt = the kernel's Table serialization
 *  (wasm `table_geometry_json_for`): `circular` jaw arcs
 *  {center, radius, height, span:{start,sweep}} in the KERNEL frame, which
 *  maps to the three.js frame by the app's own mirror law
 *  (main.js checkActiveTableMirror: three.x = kernel.y, three.z =
 *  kernel.x). Returns the same {flanks, tipS, nBins} shape as
 *  middleChains, plus HKernel — the arcs' own contact height.
 *  Fails loudly if the kernel does not carry exactly 2 middle pockets ×
 *  2 flanks × 2 spanned arcs at one common height. */
export function chainsFromKernel(kt, ds = 0.0002) {
  const arcs = (kt.circular ?? [])
    .filter((c) => c.span)
    .map((c) => ({ cx: c.center.y, cz: c.center.x, r: c.radius,
      h: c.height, start: c.span.start, sweep: c.span.sweep }));
  const mids = (kt.pockets ?? [])
    .map((p) => ({ x: p.center.y, z: p.center.x }))
    .filter((p) => Math.abs(p.x) < 0.2);
  if (mids.length !== 2) {
    throw new Error(`chainsFromKernel: ${mids.length} middle pockets`);
  }
  const sampleArc = (a) => {
    const n = Math.max(2, Math.ceil(Math.abs(a.sweep) * a.r / ds));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const th = a.start + a.sweep * i / n;
      // kernel plan point (kx, ky) = center + r(cos, sin) → three
      // (x3, z3) = (ky, kx); the outward normal rides (p − c)/r
      pts.push({ x: a.cx + a.r * Math.sin(th), z: a.cz + a.r * Math.cos(th),
        nx: Math.sin(th), nz: Math.cos(th) });
    }
    return pts;
  };
  const flanks = {};
  const heights = new Set();
  for (const pk of mids) {
    const noseZ = Math.sign(pk.z) * kt.width / 2;
    const near = arcs.filter((a) =>
      Math.hypot(a.cx - pk.x, a.cz - pk.z) < 0.25);
    for (const sgn of [1, -1]) {
      const pair = near.filter((a) => Math.sign(a.cx) === sgn)
        .sort((a, b) => b.r - a.r);
      if (pair.length !== 2) {
        throw new Error(`chainsFromKernel: flank ${sgn > 0 ? '+x' : '-x'}`
          + ` of pocket z=${pk.z.toFixed(3)} has ${pair.length} arcs`);
      }
      heights.add(pair[0].h);
      heights.add(pair[1].h);
      let pa = sampleArc(pair[0]); // the larger-radius rail-tangency arc
      let pb = sampleArc(pair[1]);
      if (Math.abs(pa[pa.length - 1].z - noseZ)
        < Math.abs(pa[0].z - noseZ)) pa = pa.reverse();
      const end = pa[pa.length - 1];
      if (Math.hypot(pb[pb.length - 1].x - end.x, pb[pb.length - 1].z - end.z)
        < Math.hypot(pb[0].x - end.x, pb[0].z - end.z)) pb = pb.reverse();
      if (Math.hypot(pb[0].x - end.x, pb[0].z - end.z) > 1e-6) {
        throw new Error('chainsFromKernel: arcs are not junction-tangent');
      }
      const chain = [...pa, ...pb.slice(1)];
      let s = 0;
      chain[0].s = 0;
      for (let i = 1; i < chain.length; i++) {
        s += Math.hypot(chain[i].x - chain[i - 1].x,
          chain[i].z - chain[i - 1].z);
        chain[i].s = s;
      }
      flanks[`${pk.z > 0 ? 'top' : 'bot'}-${sgn > 0 ? 'posx' : 'negx'}`]
        = chain;
    }
  }
  if (Object.keys(flanks).length !== 4) {
    throw new Error('chainsFromKernel: expected 4 flanks');
  }
  const hs = [...heights];
  if (hs.some((h) => Math.abs(h - hs[0]) > 1e-12)) {
    throw new Error(`chainsFromKernel: mixed arc heights ${hs}`);
  }
  const tipS = Math.max(...Object.values(flanks)
    .map((c) => c[c.length - 1].s));
  return { flanks, tipS, nBins: Math.floor(tipS / BIN) + 1, HKernel: hs[0] };
}

/** Max point-to-chain deviation [m] between two chains (sampled every
 *  ~2 mm, symmetric, ENDPOINTS ALWAYS INCLUDED — GH-568 review r6 P2: the
 *  stride alone could step over the tip, and a sub-stride tip extension
 *  is exactly the drift correspondAll cannot see because it endpoint-
 *  excludes geometry beyond the kernel tip): the JS-mirror-vs-kernel arc
 *  comparison. */
export function chainDeviation(a, b) {
  const oneWay = (from, to) => {
    let worst = 0;
    const step = Math.max(1, Math.floor(0.002 / Math.max(1e-9,
      from[1].s - from[0].s)));
    const idx = [];
    for (let i = 0; i < from.length; i += step) idx.push(i);
    if (idx[idx.length - 1] !== from.length - 1) idx.push(from.length - 1);
    for (const i of idx) {
      let best = Infinity;
      for (const q of to) {
        const d = (from[i].x - q.x) ** 2 + (from[i].z - q.z) ** 2;
        if (d < best) best = d;
      }
      worst = Math.max(worst, Math.sqrt(best));
    }
    return worst;
  };
  return Math.max(oneWay(a, b), oneWay(b, a));
}

/** Canonical CEBP two-arc middle-jaw chain mapped to the four world flanks.
 *  km = live makeGeom().middle ({c1,r1,a1,c2,r2,a2} canonical u,v: u along
 *  the rail, v into the table from the nose line); W = playing width [m].
 *  Chain points: {x, z, nx, nz, s} with (nx, nz) the outward play-side
 *  normal and s the station from the rail tangency [m]. Kept as the JS
 *  MIRROR side of the mirror-deviation check — the judged reference is
 *  chainsFromKernel (review r4 P1). */
export function middleChains(km, W, ds = 0.0002) {
  const pts = [];
  const arc = (c, r, a0, a1, base) => {
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * r / ds));
    // the second arc skips i=0: both arcs include endpoints and share the
    // junction tangent point (the W8 duplicate-sample lesson)
    for (let i = pts.length ? 1 : 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n;
      pts.push({ u: c[0] + r * Math.cos(a), v: c[1] + r * Math.sin(a),
        nu: Math.cos(a), nv: Math.sin(a), s: base + Math.abs(a - a0) * r });
    }
    return base + Math.abs(a1 - a0) * r;
  };
  const b = arc(km.c1, km.r1, km.a1[0], km.a1[1], 0);
  arc(km.c2, km.r2, km.a2[0], km.a2[1], b);
  const tipS = pts[pts.length - 1].s;
  // world maps: top rail z = +W/2 (cup 4), bottom rail z = −W/2 (cup 1);
  // the canonical chain is the +x flank under p = [−u, W/2 − v]
  const maps = {
    'top-posx': { p: ([u, v]) => [-u, W / 2 - v], d: ([nu, nv]) => [-nu, -nv] },
    'top-negx': { p: ([u, v]) => [u, W / 2 - v], d: ([nu, nv]) => [nu, -nv] },
    'bot-posx': { p: ([u, v]) => [-u, v - W / 2], d: ([nu, nv]) => [-nu, nv] },
    'bot-negx': { p: ([u, v]) => [u, v - W / 2], d: ([nu, nv]) => [nu, nv] },
  };
  const flanks = {};
  for (const [name, m] of Object.entries(maps)) {
    flanks[name] = pts.map((q) => {
      const [x, z] = m.p([q.u, q.v]);
      const [nx, nz] = m.d([q.nu, q.nv]);
      return { x, z, nx, nz, s: q.s };
    });
  }
  return { flanks, tipS, nBins: Math.floor(tipS / BIN) + 1 };
}

/** Section the named triangle soups with the plane y = H. meshes =
 *  [{name, tris: flat [x,y,z ×3]×n}] (names already pin-resolved by the
 *  caller). Returns {name: [[[x,z],[x,z]], ...]} world-metre segments. */
export function sectionFamilies(meshes, H) {
  const fams = {};
  for (const m of meshes) {
    const segs = fams[m.name] ?? (fams[m.name] = []);
    const T = m.tris;
    for (let t = 0; t + 8 < T.length; t += 9) {
      const P = [[T[t], T[t + 1], T[t + 2]],
        [T[t + 3], T[t + 4], T[t + 5]],
        [T[t + 6], T[t + 7], T[t + 8]]];
      const d = [P[0][1] - H, P[1][1] - H, P[2][1] - H];
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = P[k], b = P[(k + 1) % 3];
        const da = d[k], db = d[(k + 1) % 3];
        if ((da > 0 && db > 0) || (da < 0 && db < 0)) continue;
        if (da === 0 && db === 0) continue;
        const tt = da / (da - db);
        pts.push([a[0] + (b[0] - a[0]) * tt, a[2] + (b[2] - a[2]) * tt]);
      }
      // review GH-568 r1 P2 (the c14-disjoint CURE-R10 land r1 P2 lesson,
      // adopted verbatim): a slice through one triangle VERTEX with the
      // other two vertices straddling yields that vertex twice (once from
      // each incident edge) plus the genuine opposite-edge crossing —
      // three hits for a valid segment, which a strict length !== 2
      // dropped. H is an exact authored height (36.75), so vertex hits
      // are routine, and a dropped facing segment reads as a false
      // coverage gap (or hides an envelope violation). Deduplicate
      // coincident hits (1e-12 m — far under any real feature, far above
      // FP twin error) before requiring two endpoints.
      const ded = [];
      for (const p of pts) {
        if (!ded.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= 1e-12)) {
          ded.push(p);
        }
      }
      if (ded.length === 2 && Math.hypot(ded[1][0] - ded[0][0],
        ded[1][1] - ded[0][1]) > 1e-9) segs.push([ded[0], ded[1]]);
    }
    if (!segs.length) delete fams[m.name];
  }
  return fams;
}

// A proud surface must never escape by BEING TOO PROUD (GH-568 review r3
// P2, widened by r5 P2): the corridor exists to shed unrelated
// construction — the recessed wood core, the back-of-cushion drape, the
// nose-line loft beyond the tangency — all of which sit BEHIND the chain
// or beyond its endpoints. On the PLAY side, anything attributable to an
// interior station of its nearest flank is a first-contact obstruction by
// definition, whatever its distance and whatever its family.
/** Correspond one family's section segments to ALL flanks jointly: each
 *  section point (0.1 mm sampling) is attributed to its NEAREST chain
 *  sample across the four flanks — never distance-capped (GH-568 review r5
 *  P2: a distance cap left a blind window between the corridor and the
 *  mouth midline; nearest-flank attribution both closes it and keeps one
 *  flank's own facing from reading as the opposite flank's outlier).
 *  Endpoint exclusion runs on the OWNING flank (beyond-tangency points
 *  are the nose line's business, beyond-tip points the fall's). Per
 *  flank: inside = |off| within CORR (the binning population); proudOut =
 *  play-side points beyond CORR (envelope violations, never coverage). */
function correspondAll(flankEntries, segs) {
  const out = {};
  for (const [name] of flankEntries) out[name] = { inside: [], proudOut: [] };
  for (const [a, b] of segs) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.ceil(len / 0.0001));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t;
      let bestName = null, bi = -1, bd = Infinity, bestChain = null;
      for (const [name, chain] of flankEntries) {
        for (let j = 0; j < chain.length; j++) {
          const d = (px - chain[j].x) ** 2 + (pz - chain[j].z) ** 2;
          if (d < bd) { bd = d; bi = j; bestName = name; bestChain = chain; }
        }
      }
      if (bi < 0) continue;
      const chain = bestChain;
      if (bi === 0 || bi === chain.length - 1) {
        const q = chain[bi], q2 = chain[bi === 0 ? 1 : chain.length - 2];
        const ex = q2.x - q.x, ez = q2.z - q.z;
        if ((px - q.x) * ex + (pz - q.z) * ez < 0) continue;
      }
      const q = chain[bi];
      const off = (px - q.x) * q.nx + (pz - q.z) * q.nz;
      if (Math.sqrt(bd) <= CORR) out[bestName].inside.push({ s: q.s, off });
      else if (off > 0) out[bestName].proudOut.push({ s: q.s, off });
    }
  }
  return out;
}

/** First-contact envelope over all flanks in one pass: per 0.5 mm bin the
 *  most-proud offset among the contact families. Coverage/binning is
 *  contact-family-only, but the PROUD side of the law is ALL-family
 *  (GH-568 review r5 P2: bare wood or any other extracted family standing
 *  ahead of the nominal cloth at contact height is a first-contact
 *  violation, not a bystander). */
export function measureFlanks(flanks, famSegs, nBins,
  contactFams = ['cloth', 'obSnkJawWrap']) {
  const flankEntries = Object.entries(flanks);
  const acc = {};
  for (const [name] of flankEntries) {
    acc[name] = { famStats: {}, bins: new Map(),
      proudOutN: 0, proudOutWorst: null, famProudRaw: null };
  }
  for (const [fam, segs] of Object.entries(famSegs)) {
    const corr = correspondAll(flankEntries, segs);
    for (const [name] of flankEntries) {
      const { inside, proudOut } = corr[name];
      const A = acc[name];
      if (inside.length || proudOut.length) {
        let mx = null, mn = null;
        for (const p of inside) {
          if (!mx || p.off > mx.off) mx = p;
          if (!mn || p.off < mn.off) mn = p;
        }
        A.famStats[fam] = { n: inside.length,
          maxMm: mx ? +(mx.off * 1000).toFixed(2) : null,
          maxAtMm: mx ? +(mx.s * 1000).toFixed(1) : null,
          minMm: mn ? +(mn.off * 1000).toFixed(2) : null,
          minAtMm: mn ? +(mn.s * 1000).toFixed(1) : null,
          proudOut: proudOut.length };
        // verdict-side raw (GH-568 review r6 P3: a 0.054 mm protrusion
        // must not round to 0.05 and pass — display rounds, law doesn't)
        if (mx && (!A.famProudRaw || mx.off > A.famProudRaw.off)) {
          A.famProudRaw = { off: mx.off, fam };
        }
      }
      // all-family proud outliers (beyond-corridor play side)
      for (const p of proudOut) {
        A.proudOutN++;
        if (!A.proudOutWorst || p.off > A.proudOutWorst.off) {
          A.proudOutWorst = { ...p, fam };
        }
      }
      if (!contactFams.includes(fam)) continue;
      for (const p of inside) {
        const b = Math.round(p.s / BIN);
        const cur = A.bins.get(b);
        if (!cur || p.off > cur.off) A.bins.set(b, p);
      }
    }
  }
  const res = {};
  for (const [name] of flankEntries) {
    const A = acc[name];
    let covered = 0;
    const gaps = [];
    for (let b = 0; b < nBins; b++) {
      if (A.bins.has(b)) covered++;
      else gaps.push(+(b * BIN * 1000).toFixed(1));
    }
    let mx = null, mn = null;
    for (const v of A.bins.values()) {
      if (!mx || v.off > mx.off) mx = v;
      if (!mn || v.off < mn.off) mn = v;
    }
    // Verdict-side numbers are RAW (review r6 P3); the per-family stats
    // above stay display-rounded. The all-family inside-corridor proud
    // worst is where the wood-ahead-of-cloth case lands when it is
    // within 12 mm of the chain.
    res[name] = { covered, nBins, gaps, famStats: A.famStats,
      proudOutliers: A.proudOutN,
      proudOutlierWorstMm: A.proudOutWorst
        ? A.proudOutWorst.off * 1000 : null,
      proudOutlierAtMm: A.proudOutWorst
        ? +(A.proudOutWorst.s * 1000).toFixed(1) : null,
      proudOutlierFam: A.proudOutWorst ? A.proudOutWorst.fam : null,
      famProudWorstMm: A.famProudRaw ? A.famProudRaw.off * 1000 : null,
      famProudWorstFam: A.famProudRaw ? A.famProudRaw.fam : null,
      worstProudMm: mx ? mx.off * 1000 : null,
      worstProudAtMm: mx ? +(mx.s * 1000).toFixed(1) : null,
      worstRecessedMm: mn ? mn.off * 1000 : null,
      worstRecessedAtMm: mn ? +(mn.s * 1000).toFixed(1) : null };
  }
  return res;
}

/** Max contact-family surface height within ±1.5 mm (plan) of the chain
 *  at each station (stepMm pitch). meshes are pre-filtered to the
 *  wall-owning families. GH-568 review r6 P2: the snooker jaw facing is
 *  deliberately built from VERTICAL triangles, whose xz projection has
 *  zero area — a down-ray/column read discards the very wall this law
 *  measures and reads whatever slanted surface happens to lie nearby.
 *  The measurement is therefore a TRIANGLE-SURFACE census with an EXACT
 *  per-triangle maximum: y restricted to a triangle is affine over the
 *  triangle's own plane, so its maximum over the triangle ∩ (vertical
 *  cylinder of the station disk) is attained at a triangle vertex inside
 *  the disk, an edge ∩ disk-circle crossing, or the circle point in the
 *  plan-gradient direction (non-vertical faces only; a vertical face's
 *  in-region maximum always lands on an edge candidate). No sampling, no
 *  pitch artifacts, metre-scale bed triangles handled exactly.
 *  Returns [{sMm, topMm|null}]. */
export function wallTops(meshes, chain, tipS, stepMm = 5, radM = 0.0015) {
  const prep = meshes.map((m) => {
    const T = m.tris;
    const n = Math.floor(T.length / 9);
    const bb = new Float64Array(n * 4);
    for (let i = 0; i < n; i++) {
      const o = i * 9;
      bb[i * 4] = Math.min(T[o], T[o + 3], T[o + 6]);
      bb[i * 4 + 1] = Math.max(T[o], T[o + 3], T[o + 6]);
      bb[i * 4 + 2] = Math.min(T[o + 2], T[o + 5], T[o + 8]);
      bb[i * 4 + 3] = Math.max(T[o + 2], T[o + 5], T[o + 8]);
    }
    return { T, n, bb };
  });
  const topAt = (x, z) => {
    let top = null;
    const r2 = radM * radM;
    const consider = (px, py, pz) => {
      if ((px - x) ** 2 + (pz - z) ** 2 <= r2 + 1e-12
        && (top === null || py > top)) top = py;
    };
    for (const { T, n, bb } of prep) {
      for (let i = 0; i < n; i++) {
        if (x < bb[i * 4] - radM || x > bb[i * 4 + 1] + radM
          || z < bb[i * 4 + 2] - radM || z > bb[i * 4 + 3] + radM) continue;
        const o = i * 9;
        const V = [[T[o], T[o + 1], T[o + 2]],
          [T[o + 3], T[o + 4], T[o + 5]],
          [T[o + 6], T[o + 7], T[o + 8]]];
        // candidates 1: vertices inside the disk
        for (const v of V) consider(v[0], v[1], v[2]);
        // candidates 2: edge ∩ disk-circle crossings
        for (let k = 0; k < 3; k++) {
          const a = V[k], b = V[(k + 1) % 3];
          const dx = b[0] - a[0], dz = b[2] - a[2];
          const fx = a[0] - x, fz = a[2] - z;
          const A = dx * dx + dz * dz;
          if (A < 1e-18) continue;
          const B = 2 * (fx * dx + fz * dz);
          const C = fx * fx + fz * fz - r2;
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          const sq = Math.sqrt(disc);
          for (const t of [(-B - sq) / (2 * A), (-B + sq) / (2 * A)]) {
            if (t < -1e-9 || t > 1 + 1e-9) continue;
            consider(a[0] + dx * t, a[1] + (b[1] - a[1]) * t,
              a[2] + dz * t);
          }
        }
        // candidates 3 (non-vertical faces): the circle point along the
        // plan gradient of y, plus the station point itself, when inside
        // the plan triangle
        const d2 = (V[1][0] - V[0][0]) * (V[2][2] - V[0][2])
          - (V[2][0] - V[0][0]) * (V[1][2] - V[0][2]);
        if (Math.abs(d2) > 1e-14) {
          const be = ((V[1][1] - V[0][1]) * (V[2][2] - V[0][2])
            - (V[2][1] - V[0][1]) * (V[1][2] - V[0][2])) / d2;
          const ga = ((V[1][0] - V[0][0]) * (V[2][1] - V[0][1])
            - (V[2][0] - V[0][0]) * (V[1][1] - V[0][1])) / d2;
          const al = V[0][1] - be * V[0][0] - ga * V[0][2];
          const L = Math.hypot(be, ga);
          const cands = L > 1e-15
            ? [[x + radM * be / L, z + radM * ga / L], [x, z]]
            : [[x, z]];
          for (const [px, pz] of cands) {
            // plan point-in-triangle (sign test, inclusive)
            const s0 = (V[1][0] - V[0][0]) * (pz - V[0][2])
              - (V[1][2] - V[0][2]) * (px - V[0][0]);
            const s1 = (V[2][0] - V[1][0]) * (pz - V[1][2])
              - (V[2][2] - V[1][2]) * (px - V[1][0]);
            const s2 = (V[0][0] - V[2][0]) * (pz - V[2][2])
              - (V[0][2] - V[2][2]) * (px - V[2][0]);
            const eps = Math.abs(d2) * 1e-9;
            if ((s0 >= -eps && s1 >= -eps && s2 >= -eps)
              || (s0 <= eps && s1 <= eps && s2 <= eps)) {
              consider(px, al + be * px + ga * pz, pz);
            }
          }
        }
      }
    }
    return top;
  };
  const rows = [];
  for (let sMm = 0; sMm <= tipS * 1000; sMm += stepMm) {
    let q = chain[0];
    for (const c of chain) {
      if (Math.abs(c.s * 1000 - sMm) < Math.abs(q.s * 1000 - sMm)) q = c;
    }
    const top = topAt(q.x, q.z);
    rows.push({ sMm, topMm: top === null ? null : top * 1000 });
  }
  return rows;
}

/** The full row: all four flanks measured against one bay soup. meshes
 *  carry pin-resolved names; chains = a {flanks, tipS, nBins} bundle —
 *  the gate passes chainsFromKernel(kt) (the judged reference is the
 *  KERNEL's own arcs, review r4 P1); H in metres. Returns per-flank
 *  results + the three verdict inputs (coverage, envelope, wall top). */
export function midjawRow(meshes, chains, H,
  contactFams = ['cloth', 'obSnkJawWrap']) {
  const { flanks, tipS, nBins } = chains;
  const famSegs = sectionFamilies(meshes, H);
  const wallMeshes = meshes.filter((m) => contactFams.includes(m.name));
  const out = { tipSMm: +(tipS * 1000).toFixed(2), nBins, HMm: H * 1000,
    sectionFams: Object.fromEntries(Object.entries(famSegs)
      .map(([k, v]) => [k, v.length])),
    flanks: {} };
  const env = measureFlanks(flanks, famSegs, nBins, contactFams);
  for (const [name, chain] of Object.entries(flanks)) {
    const walls = wallTops(wallMeshes, chain, tipS);
    const wallBad = walls.filter((w) => w.topMm === null || w.topMm < H * 1000);
    out.flanks[name] = { ...env[name], walls, wallBad };
  }
  return out;
}

/** The GH-568 red arm: replay the close-out artifact — the CORNER-scoped
 *  ROI dump filter (x >= 1.2845 m, PR #498 comment 5434858058) applied to
 *  the middle-bay soup keeps 0 local middle triangles, and the row must
 *  fire on the resulting void, not report it as concordant air. */
export function cornerScopeAblation(meshes, xMin = 1.2845) {
  return meshes.map((m) => {
    const T = m.tris;
    const keep = [];
    for (let t = 0; t + 8 < T.length; t += 9) {
      if (Math.max(T[t], T[t + 3], T[t + 6]) >= xMin) {
        for (let k = 0; k < 9; k++) keep.push(T[t + k]);
      }
    }
    return { ...m, tris: keep };
  }).filter((m) => m.tris.length);
}

/** Verdict predicates shared by the gate row and the red arm (one law, two
 *  arms): coverage full; envelope inside [recMinMm, proudMaxMm] with ZERO
 *  beyond-corridor play-side points and no family — cloth or otherwise —
 *  standing proud beyond tolerance inside the corridor; wall top at H or
 *  above at every station. */
export function verdicts(row, { proudMaxMm = 0.05, recMinMm = -0.10 } = {}) {
  const flanks = Object.entries(row.flanks);
  return {
    coverage: flanks.every(([, f]) => f.covered === f.nBins),
    envelope: flanks.every(([, f]) => f.worstProudMm !== null
      && f.worstProudMm <= proudMaxMm && f.worstRecessedMm >= recMinMm
      && f.proudOutliers === 0
      && (f.famProudWorstMm === null || f.famProudWorstMm <= proudMaxMm)),
    wallTop: flanks.every(([, f]) => f.wallBad.length === 0),
  };
}
