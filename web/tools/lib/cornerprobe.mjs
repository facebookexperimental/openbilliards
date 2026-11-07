// Copyright (c) Meta Platforms, Inc. and affiliates.

// cornerprobe.mjs — GH-387 frame-corner watertightness probes (shared by
// e2e.mjs / e2e-snooker.mjs / e2e-carom.mjs).
//
// The defect class this gates: the carom wood ring reused the pool family's
// C0 pocket-miter plank cuts with NO corner casting to fill them, so every
// frame-ring corner square was an OPEN SHAFT between the apron top and the
// plank tops — an angle-dependent see-through hole (tan room floor / far
// wall visible between the blue rail end and the mahogany frame; owner
// screenshots on issue #387). Angle-dependent disappearance is also the
// signature of reversed winding + backface culling, so the probe uses the
// meshes' REAL single-sided raycast semantics (THREE.Raycaster respects
// material.side — the check-cushion-profile #308 convention): a culled or
// absent face cannot pass.
//
// Probe design: rays are aimed AT TARGET POINTS STRICTLY INSIDE the wood
// corner volume (the frame-ring corner square, shrunk inside the rounded
// outer corner, at plank-body heights ≤ 0.038 — below the mitre seams'
// eased 4 mm bevel groove, so no legitimate seam micro-channel is sampled).
// A watertight corner guarantees every such ray crosses solid surface
// before its target, from ANY approach angle. Verdict per ray: the first
// hit not belonging to the dynamic aiming rig (group 'obCueStick') must
//   - belong to the table group ('obTable' — the buildTable beacon name),
//   - sit above the under-table void (y > -0.35: never the room floor), and
//   - land inside the table's plan bounds (never the far wall / room props
//     seen THROUGH the table).
// On the pre-fix tree the carom sweep fails thousands of these (floor and
// far-wall hits through all four corners); pool (shield castings) and
// snooker (butt-jointed planks running through the corner square) pass —
// they gate regressions.
//
// Extra pin for the two MITRED classes (pool, carom): a straight-down probe
// at each corner-square centre must first-hit the wood/casting TOP band
// (y ≥ 0.040) — the corner must be closed by frame furniture, not merely
// shadowed by something lower (the pre-fix carom shaft exposed the apron
// top face at y = 0.006 there).
//
// The sweep runs in page: install PROBE_SRC, then call
//   __obCornerProbe({ L, W, CW, FW, topPin, poses, corners })
// where poses = extra fixed origin→target rays (the owner's reproduced
// camera sight lines) judged by the same verdict, and corners (optional)
// limits the sweep to those corner keys ('-x-z', '-x+z', '+x-z', '+x+z').
// Suites call runCornerProbe below: ONE corner per evaluate, then the poses,
// merged into the single-call result. Every evaluate is one synchronous
// main-thread task, and three's Raycaster tests every triangle of every mesh
// whose bounding sphere a ray crosses: on snooker the merged pocket net / cap /
// lining meshes span the table, so every ray tests all of their ~0.86 M
// triangles (a corner-region ray: ~0.97 M in all), and the one-call sweep took
// 445-481 s of the 600 s CDP deadline and went past it on the 2026-10-13
// nightly (e2e-snooker, GH-248 class).
// The split keeps every ray and every verdict; it only bounds each task.
//
// ---- decision-⑥ OPEN-BAY exemption (GH-489 W13, gate r16 P1-1) -----------
// The r16-adjudicated snooker corner construction (CONSTRUCTION-PIN +
// owner decision ⑥, #489 c5260294606) CUTS the rail-height casting back
// inside the bell's angular span and leaves the below-fall corner bay OPEN
// below/behind the hanging cream bell — exactly as the Star XW101
// reference shows gold/void outside the bell footprint. That removes the
// in-span casting that used to catch this sweep's tangent band-level rays
// (rev-18 and earlier), and the W13 round PROVED any replacement catcher
// re-creates a gold stratum at the S7b/S2b money registers (the owner's
// original 「建模跟实拍对不上」 defect). So the snooker suite passes
// `openBay: { geom }` and the probe re-derives — it does NOT relax:
//   * WITNESS (scoping, red-armed): per corner, straight-down rays on the
//     outward pocket diagonal inside the cutback annulus — radii
//     cup.r + {62, 70, 80, 89.8} mm from the measured fall centre, i.e.
//     above the bell silhouette roof (fall + 56 mm, the S8/GCL corridor
//     law) and below the casting cutback floor (140 mm from the fall
//     centre) — must read NOTHING at frame-band heights y ∈ (0.005,
//     0.060). On the pre-r16 construction the casting keep-arc (93.6 mm
//     constant) fills the annulus and the witness reads casting tops at
//     y ≈ +0.047: the scoping FAILS the old construction (verbatim
//     red-proof on the rev-18 bytes @52a2dc62), so this exemption can
//     never excuse the four-strata corner the gate condemned.
//   * A leaked ray is EXEMPT only when ALL of (geometry-scoped to the
//     owner-ruled bay, never a blanket):
//       E1 its corner's witness verified the bay OPEN;
//       E2 its sight line never crosses the bell CORE at SUB-BED height
//          — the region {horizontal distance to the fall-cup axis ≤
//          cup.r + 38 mm, y < +0.005} — before its first hit. Below the
//          bed the core is the throat/sock interior (fall walls, sock,
//          knit bag): no floor-reaching ray can pass it without a
//          breach, so a sub-bed core crossing is a THROAT-BREACH
//          signature, never a bay pass-through. Core passage ABOVE bed
//          is the legitimate open-mouth sightline family (over the near
//          jaw, above the fall, out 3–5 mm over the roll lip — real on
//          the reference construction too), and tangent rays that skim
//          the bell face 1–3 mm outside the leather are legitimate bay
//          rays (the cutback annulus is open by mandate) — both stay
//          exempt-eligible. The shell's own band-height integrity is
//          not this arm's subject and is gated by its dedicated
//          instruments (corner-form F8 49-ray proudness fan, the
//          S1-width top-down scans, posegate boot-contiguity/hem bars);
//          this arm's subject is the GH-387 frame corner square.
//       E3 its TARGET column is open air at frame-band heights (no hit
//          with y ∈ (0.005, 0.060) straight down over the target) — the
//          target sits in the bay by construction, not inside bell/
//          casting/plank volume;
//       E4 its first hit EXISTS and lands BELOW the bed plane
//          (y < 0.005) — the pass-through signature: the ray
//          demonstrably crossed the open bay into the under-table
//          world. A no-hit ray is NEVER exempt (review W13-FINISH r1
//          P2: a miss proves nothing about where the ray escaped —
//          the room floor/walls terminate every genuine bay
//          pass-through, so only an explicit sub-bed hit qualifies).
//     Any leaked ray failing one of these still fails the suite. topPin
//     and fixed poses are never exempt.

/** Page-side source. Evaluate once (defines window.__obCornerProbe). */
export const PROBE_SRC = `window.__obCornerProbe = async (spec) => {
  const THREE = window.__obCornerTHREE
    ?? (window.__obCornerTHREE = await import('./vendor/three.module.min.js'));
  const { L, W, CW, FW } = spec;
  const IX = L / 2, IZ = W / 2, OX = IX + CW + FW, OZ = IZ + CW + FW;
  const rc = new THREE.Raycaster();
  const inGroup = (obj, name) => {
    for (let n = obj; n; n = n.parent) if (n.name === name) return true;
    return false;
  };
  const visibleChain = (obj) => {
    for (let n = obj; n; n = n.parent) if (n.visible === false) return false;
    return true;
  };
  const verdict = (o, t) => {
    const d = t.clone().sub(o);
    rc.set(o, d.clone().normalize());
    // meshes only: Raycaster matches THREE.Line within a 1-unit threshold
    // (the aim line would outrank every real surface) and does not test
    // visibility itself; the sight-line question is about visible surfaces
    const hits = rc.intersectObjects(window.__dbg.scene.children, true)
      .filter((h) => h.object.isMesh && visibleChain(h.object)
        && !inGroup(h.object, 'obCueStick'));
    if (!hits.length) return { ok: false, why: 'nothing' };
    const h = hits[0];
    if (!inGroup(h.object, 'obTable')) return { ok: false, why: 'non-table', p: h.point };
    if (h.point.y <= -0.35) return { ok: false, why: 'floor', p: h.point };
    if (Math.abs(h.point.x) > OX + 0.03 || Math.abs(h.point.z) > OZ + 0.03) {
      return { ok: false, why: 'beyond-bounds', p: h.point };
    }
    // strict (pocketless classes, review GH-387 r1): every target sits
    // INSIDE solid frame wood, so the first hit must come BEFORE the
    // target — a past-target hit means the ray passed through a hole and
    // struck some other table surface behind it (a false pass under the
    // bounds checks alone). Pool/snooker stay non-strict: their corner
    // squares carry real pocket openings, where a ray legitimately passes
    // an in-mouth target and lands on the jaw/cup behind.
    if (spec.strict && h.distance > d.length() + 0.05) {
      return { ok: false, why: 'past-target', p: h.point };
    }
    return { ok: true, y: h.point.y };
  };
  // decision-⑥ open-bay scoping (GH-489 W13 — see the module header):
  // witness the cutback annulus per corner, then classify leaked rays.
  // A6 (twin row A6 / proposal_ext_r2_7): the amended XW101 boot's
  // dome/brim lawfully fills the annulus with LEATHER out to the brim
  // outer r 0.119 (the S8/GCL bell-roof constant the station radii were
  // derived against is superseded by the measured plan family). The
  // witness's subject is FRAME-band geometry — casting/plank/gold tops
  // (the pre-r16 red class, obSnkCasting/railwood at y ≈ +0.047) — so
  // leather dressing families are not band hits, for the witness and
  // for the E3 target-column check alike. The rev-18 red proof stands:
  // its casting tops are not leather.
  // GH-489 craft R3-SNK-6 (junction law, SPIKE-REPORT-CRAFT-R2.md
  // §R3c.15.2): the snooker pad now runs out to the rail face − 13 mm
  // (0.122 from the cup) and carries its own BACKING plate inside the
  // shell (obPocketPlate = snkPlateBackingGeom, backT 16 mm under the
  // leather top, invisible from every pose) — a pocket-assembly member,
  // not frame-band geometry: the witness looks through the leather skin
  // and must not read the leather's own backing as a casting. The
  // under-frame boards (obPocketBoard) stay band hits.
  // GH-489 craft R3-SNK-9 (RULING R-S8-2): with the render fall on the
  // kernel disc the corner cavity's walls are the leather's own BACK — a
  // dark back skin 0.15 mm inside the sheet, built under the lining's
  // name (obPocketLining: the sheet's flesh side now, no longer a bore's
  // lining). It is leather dressing, not frame-band geometry: the witness
  // and the E3 column look through it as they do through the sheet and
  // its backing plate. (On the 2c268bb1 battery the unlisted name read as
  // a band hit at the r + 62/70 stations, the bays closed, and all 272
  // legitimately exempt rays failed.)
  const LEATHER_FAMS = ['obPocketCap', 'obPocketStitch', 'obPocketEmboss',
    'obPocketValance', 'obPocketPlate', 'obPocketLining'];
  let bays = null;
  if (spec.openBay) {
    const T = await import('./scene/table.js');
    const cups = ((T.pocketPlateDatums ?? T.pocketVisualFalls)(spec.openBay.geom) ?? []) /* the PLATE DATUM (SNK-R34: pocketVisualFalls is the drop aperture) */
      .filter((c) => Math.abs(c.x) > L / 4); // corner cups only
    bays = {};
    for (const c of cups) {
      const key = (c.x > 0 ? '+x' : '-x') + (c.z > 0 ? '+z' : '-z');
      const dg = Math.SQRT1_2, wx = Math.sign(c.x), wz = Math.sign(c.z);
      const stations = [];
      let open = true;
      for (const rr of [0.062, 0.070, 0.080, 0.0898]) {
        const px = c.x + wx * dg * (c.r + rr);
        const pz = c.z + wz * dg * (c.r + rr);
        rc.set(new THREE.Vector3(px, 0.6, pz), new THREE.Vector3(0, -1, 0));
        const band = rc.intersectObjects(window.__dbg.scene.children, true)
          .filter((h) => h.object.isMesh && visibleChain(h.object)
            && !inGroup(h.object, 'obCueStick')
            && !LEATHER_FAMS.includes(h.object.name))
          .find((h) => h.point.y > 0.005 && h.point.y < 0.060);
        stations.push({ r: +(c.r + rr).toFixed(4), band: band
          ? [band.object.name || '?', +band.point.y.toFixed(4)] : null });
        if (band) open = false;
      }
      bays[key] = { cup: [+c.x.toFixed(4), +c.z.toFixed(4), +c.r.toFixed(4)],
        open, stations };
    }
  }
  const colCache = new Map();
  const columnOpen = (t) => {
    const key = t.x.toFixed(4) + ',' + t.z.toFixed(4);
    if (!colCache.has(key)) {
      rc.set(new THREE.Vector3(t.x, 0.6, t.z), new THREE.Vector3(0, -1, 0));
      const band = rc.intersectObjects(window.__dbg.scene.children, true)
        .filter((h) => h.object.isMesh && visibleChain(h.object)
          && !inGroup(h.object, 'obCueStick')
          && !LEATHER_FAMS.includes(h.object.name))
        .find((h) => h.point.y > 0.005 && h.point.y < 0.060);
      colCache.set(key, !band);
    }
    return colCache.get(key);
  };
  const exemptRay = (corner, o, t, v) => {
    if (!bays) return false;
    const bay = bays[corner];
    if (!bay || !bay.open) return false;                    // E1
    // E4 requires an EXPLICIT sub-bed hit (W13-FINISH review r1 P2: a
    // no-hit ray proves nothing about WHERE it escaped — a culled face
    // or geometry gap could hide behind it; the room floor/walls make
    // every genuine bay pass-through terminate somewhere)
    if (!v.p || v.p.y >= 0.005) return false;               // E4
    // E2: bell-core crossing guard (throat-breach signature). Unit ray
    // from o through t; crossing = the segment before the first hit
    // enters {dist2D(cup) <= coreR} at any SUB-BED height (y < +0.005;
    // above-bed core passage is the legitimate open-mouth sightline
    // family — see the module header).
    const cup = bay.cup, coreR = cup[2] + 0.038;
    const len3 = Math.hypot(t.x - o.x, t.y - o.y, t.z - o.z);
    const ux = (t.x - o.x) / len3, uy = (t.y - o.y) / len3,
      uz = (t.z - o.z) / len3;
    const sEnd = v.p
      ? Math.hypot(v.p.x - o.x, v.p.y - o.y, v.p.z - o.z) : 10;
    const rx = o.x - cup[0], rz = o.z - cup[1];
    const a2 = ux * ux + uz * uz;
    const b2 = 2 * (rx * ux + rz * uz);
    const c2 = rx * rx + rz * rz - coreR * coreR;
    if (a2 < 1e-12) {
      if (c2 <= 0) return false; // vertical ray inside the core column
    } else {
      const disc = b2 * b2 - 4 * a2 * c2;
      if (disc > 0) {
        const rt = Math.sqrt(disc);
        const s0 = Math.max((-b2 - rt) / (2 * a2), 0);
        const s1 = Math.min((-b2 + rt) / (2 * a2), sEnd);
        if (s1 > s0
          && Math.min(o.y + uy * s0, o.y + uy * s1) < 0.005) return false;
      }
    }
    return columnOpen(t);                                   // E3
  };
  let probes = 0; const fails = [];
  const record = (tag, o, t, v) => {
    if (!v.ok && fails.length < 40) {
      fails.push({ tag, o: [o.x, o.y, o.z].map((n) => +n.toFixed(3)),
        t: [t.x, t.y, t.z].map((n) => +n.toFixed(3)), why: v.why,
        p: v.p ? [v.p.x, v.p.y, v.p.z].map((n) => +n.toFixed(2)) : null });
    }
    return v.ok;
  };
  let failCount = 0, exempts = 0; const exemptByCorner = {};
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const corner = (sx > 0 ? '+x' : '-x') + (sz > 0 ? '+z' : '-z');
    if (spec.corners && !spec.corners.includes(corner)) continue;
    for (const fx of [0.2, 0.5, 0.8]) for (const fz of [0.2, 0.5, 0.8]) {
      for (const ty of [0.018, 0.03, 0.038]) {
        const t = new THREE.Vector3(sx * (IX + CW + fx * FW), ty,
          sz * (IZ + CW + fz * FW));
        const base = Math.atan2(-sz, -sx);
        for (let az = -80; az <= 80; az += 20) {
          for (const el of [8, 15, 25, 40, 60, 80]) {
            const a = base + (az * Math.PI) / 180, e = (el * Math.PI) / 180;
            const dir = new THREE.Vector3(-Math.cos(e) * Math.cos(a),
              -Math.sin(e), -Math.cos(e) * Math.sin(a));
            const o = t.clone().sub(dir.clone().multiplyScalar(0.7));
            if (o.y < 0.02) continue;
            probes++;
            const v = verdict(o, t);
            if (!v.ok && exemptRay(corner, o, t, v)) {
              exempts++;
              exemptByCorner[corner] = (exemptByCorner[corner] ?? 0) + 1;
              continue;
            }
            if (!record(corner + ' az' + az + ' el' + el, o, t, v)) failCount++;
          }
        }
      }
    }
    if (spec.topPin) {
      // straight-down centre pin (mitred classes): first hit in the wood
      // top band — the corner is closed by FRAME furniture
      const t = new THREE.Vector3(sx * (IX + CW + 0.5 * FW), 0.02,
        sz * (IZ + CW + 0.5 * FW));
      const o = t.clone().setY(0.6);
      probes++;
      const v = verdict(o, t);
      const ok = v.ok && v.y >= 0.040;
      if (!record(corner + ' top-pin', o, t,
        ok ? v : { ok: false, why: v.ok ? 'top-band y=' + v.y.toFixed(3) : v.why, p: v.p })) failCount++;
    }
  }
  for (const [i, p] of (spec.poses ?? []).entries()) {
    probes++;
    const o = new THREE.Vector3(...p.o), t = new THREE.Vector3(...p.t);
    if (!record('pose ' + i + ' (' + p.tag + ')', o, t, verdict(o, t))) failCount++;
  }
  return { probes, failCount, fails, exempts, exemptByCorner, bays };
};
true`;

/** The sweep's corner order (PROBE_SRC loops sx, then sz, over [-1, 1]). */
export const CORNERS = ['-x-z', '-x+z', '+x-z', '+x+z'];

/** Merge per-corner results into the single-call shape. Order is kept: a
 * single call records fails in corner order, then the poses, up to 40 —
 * concatenating the parts in that order and keeping the first 40 gives the
 * same list. `bays` is the same geometry witness in every part (all four
 * corner cups, each call); a part that disagrees is reported, never
 * silently dropped. */
export function mergeCornerProbe(parts) {
  const ok = parts.filter((p) => p && typeof p.failCount === 'number');
  if (ok.length !== parts.length) return parts.find((p) => !p || typeof p.failCount !== 'number') ?? null;
  const bays = ok[0].bays ?? null;
  const baysJson = JSON.stringify(bays);
  const out = { probes: 0, failCount: 0, fails: [], exempts: 0, exemptByCorner: {}, bays };
  for (const p of ok) {
    out.probes += p.probes;
    out.failCount += p.failCount;
    out.fails.push(...p.fails);
    out.exempts += p.exempts ?? 0;
    for (const [k, v] of Object.entries(p.exemptByCorner ?? {})) out.exemptByCorner[k] = (out.exemptByCorner[k] ?? 0) + v;
    if (JSON.stringify(p.bays ?? null) !== baysJson) {
      out.failCount += 1;
      out.fails.unshift({ tag: 'split', why: 'bays differ between the per-corner evaluates', p: null });
    }
  }
  out.fails = out.fails.slice(0, 40);
  return out;
}

/** Run the sweep ONE corner per evaluate, then the fixed poses, and merge.
 * `evalFn(expr)` evaluates in the page (chrome.eval); PROBE_SRC must already
 * be installed. `spec` is the single-call spec. `onPart(label, ms)` is told
 * how long each evaluate took. */
export async function runCornerProbe(evalFn, spec, { onPart } = {}) {
  const parts = [];
  const call = async (label, s) => {
    const t0 = Date.now();
    parts.push(await evalFn(`window.__obCornerProbe(${JSON.stringify(s)})`));
    onPart?.(label, Date.now() - t0);
  };
  // `corners` goes first: a CDP deadline names the expression cut to 120
  // characters, and the corner key must survive the cut
  for (const k of CORNERS) await call(k, { corners: [k], ...spec, poses: [] });
  if (spec.poses?.length) await call('poses', { corners: [], ...spec });
  return mergeCornerProbe(parts);
}

/** Owner-reproduced GH-387 sight lines (camera origin → corner target,
 * world frame) on the 2.84 m carom table: the exact leak poses recorded
 * from the pre-fix tree that match the owner's three screenshots (tan
 * wedge between the blue rail end and the mahogany frame; floor visible
 * THROUGH the corner). Red on pre-fix geometry, wood on the fixed ring. */
export const CAROM_OWNER_POSES = [
  // high 3/4 view along the table past the corner (owner crops 2-3): the
  // sight line reached the ROOM FLOOR at (4.17, -0.79) through the corner
  { tag: 'owner-high-pxpz', o: [0.892, 0.227, 1.105], t: [1.477, 0.046, 0.767] },
  // low graze along the end rail (owner crop 1): exited to the far wall
  { tag: 'owner-low-pxmz', o: [1.927, 0.067, -0.232], t: [1.477, 0.03, -0.767] },
  { tag: 'owner-high-mxpz', o: [-0.892, 0.227, 0.429], t: [-1.477, 0.046, 0.767] },
  { tag: 'owner-low-mxmz', o: [-0.942, 0.067, -1.217], t: [-1.477, 0.03, -0.767] },
];

/** Node-side judge: fail the suite with a stable, greppable ledger line.
 * When the probe ran with `openBay` (snooker, decision ⑥), the witness is
 * a hard bar of its own: every corner bay must VERIFY open — frame-band
 * geometry inside the cutback annulus is the pre-r16 in-span casting
 * class (gate r16 P1-1's condemned gold stratum), so the scoping FAILS
 * the old construction rather than excusing it (red-proven on the rev-18
 * bytes @52a2dc62: all four witnesses read casting tops at y ≈ +0.047). */
export function judgeCornerProbe(tag, res, fail) {
  if (!res || typeof res.failCount !== 'number') {
    fail(`${tag}: corner probe returned no verdict: ${JSON.stringify(res)}`);
    return;
  }
  let scopingOk = true;
  if (res.bays) {
    const keys = Object.keys(res.bays);
    const closed = keys.filter((k) => !res.bays[k].open);
    if (keys.length !== 4 || closed.length) {
      scopingOk = false;
      fail(`${tag}: decision-⑥ open-bay scoping FAILED — `
        + `${closed.length}/${keys.length} corner bays read frame-band `
        + 'geometry inside the cutback annulus (the pre-r16 in-span '
        + 'casting class): ' + JSON.stringify(closed.map((k) =>
          [k, res.bays[k].stations.filter((s) => s.band)])));
    }
  }
  if (res.failCount > 0) {
    fail(`${tag}: ${res.failCount}/${res.probes} corner probes leaked `
      + `(first: ${JSON.stringify(res.fails.slice(0, 4))})`);
  } else if (scopingOk) {
    console.log(`${tag}: ${res.probes - (res.exempts ?? 0)}/${res.probes} `
      + 'corner probes watertight'
      + (res.exempts ? ` (${res.exempts} rays exempt through the `
        + 'verified-open decision-⑥ corner bays: '
        + `${JSON.stringify(res.exemptByCorner)}; witnesses 4/4 open)` : ''));
  }
}

// ---- frame-ring MATERIAL IDENTITY (GH-387 follow-up guard) ------------------
// The watertightness probes above prove the corners are geometrically
// closed; this companion pins WHAT closes them. table.js builds every
// frame-ring plank of every class as a mesh over the ONE shared woodMat
// instance (populate()/populateCarom — the corner pieces are the planks'
// own miter/butt cuts, never a separately-materialed patch), and the pool
// family's corner squares are closed by the shieldMat castings (a
// DELIBERATE Gold-Crown-style dark casting, distinct from the wood by
// design — cornerShieldPlan provenance). A future edit that hands any
// corner piece its own material (a leatherMat/shieldMat-style one-off, a
// woodMat.clone(), a per-plan makeWoodMap re-seed) would render a visible
// tone/scale break at the miter seams while every geometry probe stays
// green — so the guard asserts MATERIAL IDENTITY, not looks: straight-down
// pins on each plank body and on both flanks of every corner joint must
// first-hit meshes sharing ONE material uuid (and, for pool, the four
// shield pins must share ONE casting uuid that differs from the wood's).
// Pin positions are validated live on all three classes (plank plateaus at
// y = 0.047, shields proud at 0.049; clear of bevel grooves, pocket
// bays/notches, leather caps and sight inlays).

/** Page-side source. Evaluate once (defines window.__obFrameMatProbe). */
export const MAT_PROBE_SRC = `window.__obFrameMatProbe = async (pins) => {
  const THREE = window.__obCornerTHREE
    ?? (window.__obCornerTHREE = await import('./vendor/three.module.min.js'));
  const inGroup = (obj, name) => {
    for (let n = obj; n; n = n.parent) if (n.name === name) return true;
    return false;
  };
  const visibleChain = (obj) => {
    for (let n = obj; n; n = n.parent) if (n.visible === false) return false;
    return true;
  };
  const rc = new THREE.Raycaster();
  const out = [];
  for (const p of pins) {
    rc.set(new THREE.Vector3(p.x, 0.6, p.z), new THREE.Vector3(0, -1, 0));
    const hits = rc.intersectObjects(window.__dbg.scene.children, true)
      .filter((h) => h.object.isMesh && visibleChain(h.object)
        && !inGroup(h.object, 'obCueStick'));
    const h = hits[0];
    if (!h) { out.push({ tag: p.tag, miss: true }); continue; }
    out.push({ tag: p.tag, y: +h.point.y.toFixed(4),
      inTable: inGroup(h.object, 'obTable'), mat: h.object.material.uuid });
  }
  return out;
};
true`;

/** Guard pins for one class. `style` selects the corner joinery:
 * 'miter' (carom picture-frame diagonals), 'butt' (snooker template butt
 * seam behind the corner bay), 'shielded' (pool C0 cuts + shield casting).
 * Wood pins land on plank plateaus; every corner joint gets a pin on EACH
 * of its flanking pieces. */
export function frameMatPins({ L, W, CW, FW, style }) {
  const IX = L / 2, IZ = W / 2, SQ = Math.SQRT1_2;
  const midZ = IZ + CW + FW / 2, midX = IX + CW + FW / 2;
  const pins = [
    // one pin per plank body, clear of side-pocket notches (|x| well off 0
    // for the long planks; end rails carry no notch)
    { tag: 'plank_long_pz', x: 0.5, z: midZ },
    { tag: 'plank_long_mz', x: -0.5, z: -midZ },
    { tag: 'plank_end_px', x: midX, z: 0.09 },
    { tag: 'plank_end_mx', x: -midX, z: -0.09 },
  ];
  for (const [sx, sz, ct] of [[1, 1, 'pxpz'], [1, -1, 'pxmz'],
    [-1, 1, 'mxpz'], [-1, -1, 'mxmz']]) {
    if (style === 'miter') {
      // 8 mm each side of the 45-deg seam, 8 cm out from the inner corner
      const Xi = IX + CW - 0.002, Zi = IZ + CW - 0.002, t = 0.08;
      pins.push({ tag: `corner_long_${ct}`,
        x: sx * (Xi + t * SQ - SQ * 0.008), z: sz * (Zi + t * SQ + SQ * 0.008) });
      pins.push({ tag: `corner_end_${ct}`,
        x: sx * (Xi + t * SQ + SQ * 0.008), z: sz * (Zi + t * SQ - SQ * 0.008) });
    } else if (style === 'butt') {
      // flanks of the butt seam at |z| = IZ+CW-0.002, behind the corner
      // bay notch (fall + WOOD_LIP) and outside the leather cap band
      pins.push({ tag: `corner_long_${ct}`,
        x: sx * (IX + 0.162), z: sz * (IZ + CW + 0.006) });
      pins.push({ tag: `corner_end_${ct}`,
        x: sx * (IX + 0.162), z: sz * (IZ + CW - 0.010) });
    } else if (style === 'template-narrow') {
      // GH-518 Star-band template ring: the corner fall notch reaches the
      // plank outer edge, so the butt seam is CONSUMED by the pocket bay
      // (real 12-ft rails end at the openings) — pin each plank BODY just
      // clear of the bay circle instead of a seam that no longer exists
      pins.push({ tag: `corner_long_${ct}`,
        x: sx * (IX - 0.055), z: sz * midZ });
      pins.push({ tag: `corner_end_${ct}`,
        x: sx * midX, z: sz * (IZ - 0.055) });
    } else {
      // pool: the shield casting on the corner diagonal + the two wood
      // planks flanking it just before their C0 miter cuts
      const f = 0.75 * (CW + FW);
      pins.push({ tag: `shield_${ct}`, x: sx * (IX + f), z: sz * (IZ + f) });
      pins.push({ tag: `corner_long_${ct}`, x: sx * (IX - 0.10), z: sz * midZ });
      pins.push({ tag: `corner_end_${ct}`, x: sx * midX, z: sz * (IZ - 0.10) });
    }
  }
  return pins;
}

/** Node-side judge: one wood uuid for the whole ring; pool additionally
 * one shield uuid distinct from the wood (the documented casting). */
export function judgeFrameMats(tag, res, fail) {
  if (!Array.isArray(res)) {
    fail(`${tag}: material probe returned no verdict: ${JSON.stringify(res)}`);
    return;
  }
  const bad = res.filter((p) => p.miss || !p.inTable
    || !(p.y >= 0.040 && p.y <= 0.052));
  if (bad.length) {
    fail(`${tag}: ${bad.length}/${res.length} pins missed the frame-top `
      + `band: ${JSON.stringify(bad.slice(0, 4))}`);
    return;
  }
  let broke = false;
  const flunk = (msg) => { broke = true; fail(msg); };
  const uuids = (pins) => [...new Set(pins.map((p) => p.mat))];
  const wood = res.filter((p) => !p.tag.startsWith('shield_'));
  const woodIds = uuids(wood);
  if (woodIds.length !== 1) {
    const byId = woodIds.map((id) =>
      `${id.slice(0, 8)}: ${wood.filter((p) => p.mat === id).map((p) => p.tag).join(',')}`);
    flunk(`${tag}: frame-ring planks split across ${woodIds.length} `
      + `materials (one shared woodMat law) — ${byId.join(' | ')}`);
  }
  const shield = res.filter((p) => p.tag.startsWith('shield_'));
  if (shield.length) {
    const shieldIds = uuids(shield);
    if (shieldIds.length !== 1) {
      flunk(`${tag}: corner shields split across ${shieldIds.length} materials`);
    } else if (woodIds.length === 1 && shieldIds[0] === woodIds[0]) {
      flunk(`${tag}: corner shields lost their casting material (they render `
        + 'as frame wood — the Gold-Crown casting distinctness is a design '
        + 'fact, cornerShieldPlan provenance)');
    }
  }
  if (!broke) {
    console.log(`${tag}: ${wood.length} ring pins on one material`
      + (shield.length ? `, ${shield.length} shield pins on one casting` : ''));
  }
}
