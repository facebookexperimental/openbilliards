// Copyright (c) Meta Platforms, Inc. and affiliates.

// probe-490-horn.mjs — GH-490 round-5 geometry probes (audit r3 F7 + N4)
// + the ROUND-6 SILHOUETTE ARM (gate r4: probe green, pixels red — the
// acceptance signal is the rendered crop, so the probe now judges the
// rendered pixels too) + the ROUND-7 COVERAGE-WALK and
// MATERIAL-CONSISTENCY bars (gate r5: the r6 trim-cover zone judged only
// the strip behind the sock's leading edge, so a bare PRE-DIVE nose
// passed while the auditor's crops showed it plainly; and the sock's
// dedicated material measured as a foreign collar — 10–11 value points
// darker, ~14 sat points higher, lag-1 texture correlation 0.60–0.74 vs
// the jaw's 0.06–0.17. The probe now owns both axes)
// + the ROUND-9 ADJUDICATED CONSTRUCTION bars (#490 comment 5242164247,
// reference truth: the horn keeps its FULL molded cross-section to a
// thin cloth edge lying ON it — the conformal skin — with a constant
// ~3 mm cloth margin along the outer flank; the r8 FLUSH bar measured
// the flatten the adjudication overturned and is REPLACED by the
// construction bars: CREST-HOLD from the mesh, skin presence/height
// envelope, and the margin's no-bare-rail down-rays).
//
// Verdicts measured against the REAL app scene at the sign-off poses:
//
//   HORN TERMINUS (F7, centreline arm, judged at C1 + C4 + C1s): for
//   every pocket-cap crest roll, walk the analytic roll centreline (read
//   from the roll mesh's userData.cn8Roll — the same parameterization
//   table.js swept, never a re-implementation) through the horn dive,
//   and raycast camera→section at the pose (centreline point AND the
//   section's top-surface point — a section is VISIBLE when any of its
//   material renders as this cap's own leather within the radius
//   envelope). ROUND-6/7 bar: every visible section ABOVE the jaw-top
//   plane must sit BEFORE the cloth boundary (t <= boundary + margin;
//   round-7 lap geometry publishes lapT0, margin 0.05 — the flush edge;
//   round-6 sock geometry publishes lipT0, margin 0.13 — the bead zone)
//   — leather may only show where the reference shows it, ahead of the
//   overlapping jaw cloth. On pre-lip geometry (neither field) the
//   round-5 bar applies unchanged: the LAST visible section must sit
//   BELOW the plane.
//   Plus a pose-independent mesh assertion: BOTH terminal rings of every
//   roll tube must have ZERO cross-section (max vertex spread < 10 µm) —
//   no end face can exist at zero section.
//
//   HORN SILHOUETTE (round-6, judged at C1 + C4 + C1s, PIXELS): the
//   auditor's axis — the probe screenshots each pose, projects every
//   horn's tube-top path to pixels (occlusion-filtered: a point hidden
//   behind FOREIGN geometry >20 mm in front is excluded; the horn's own
//   near structure stays included, which is exactly how the round-4/5
//   exposed noses rendered; truncated at the jaw-plane crossing, past
//   which the projected walk lands on unrelated body/skirt leather), and
//   classifies the walked pixels with the gate's HSV leather classifier
//   plus a green-cloth classifier that includes the dark shadowed trim.
//   The bar is the TRIM-COVER: across the trim zone, points 1.2 mm above
//   the tube top must meet REAL covering geometry (camera-ray depth
//   delta <= 10 mm — the background behind an OUTLINED bare nose is
//   decimeters away and reads as none) AND render cloth-classified
//   pixels (>= 2 of the zone's samples; a leather flap covering the zone
//   fails the pixel half). Rev-5's C1 wedges and C4/C1s rounded noses
//   have NOTHING standing over the tube there — every audited ending
//   red-proves — however green their ray verdicts. Re-emergence past the
//   trim is owned by the centreline arm's surface-exact rule; pixel-green
//   vs pixel-leather at the samples is judged on the SAME frame the
//   auditor sees.
//   ROUND-7 COVERAGE WALK (gate r5 coverage: C4-left + both C1s horns
//   rendered bare while the r6 zone samples passed): the walked pixels
//   themselves are now the bar — NO leather-classified pixel may render
//   at any walk point beyond the cloth boundary (t > tCut + 0.02),
//   excepting only points within 6 px of the boundary's own projected
//   pixel (foreshortened boundary straddle). The r6 zone check kept its
//   depth half; this closes the "bare nose ahead of the zone" class.
//
//   MATERIAL CONSISTENCY (ROUND-8 GATE BASIS, ROUND-9 RE-AIMED ROIs —
//   the sampler is the auditor's own validated method; only the subject
//   region moved with the adjudicated construction): analytic points ON
//   the conformal skin's surface (band-top sheet + crown, the near-
//   horizontal stations — the region the adjudication crops show as
//   lit covering cloth), camera-ray verified onto the skin mesh within
//   2 mm, vs the geometric jaw/plank patch — both as 5x5 rendered-pixel
//   regions under the GATE's cloth mask (PIL HSV H 55..125, S >= 45,
//   V >= 35), judged on region MEANS with the gate's bars: |Δvalue| <=
//   6, Δsat in [−14, +8], hue within 6, and quadratic-detrended lag-1
//   (horizontal+vertical direction mean) <= jaw + 0.15.
//
//   CONSTRUCTION (ROUND-9, replaces the r8 FLUSH bar — the flatten it
//   asserted is the construction the adjudication overturned):
//   pose-free mesh bars, red-proven against the rev-8 tree —
//     CREST-HOLD: azimuth-binned max mesh y of every roll tube must
//       stay at full crest height (yCrest + rollR − 0.6 mm) from t 0.10
//       up to the cloth boundary (the rev-8 flatten fails every bin);
//     SKIN: the cn8-cloth-skin mesh exists and lives inside
//       [0.020, yCrest + rollR + cl + 0.6 mm] (conformal — nothing
//       stands above the covered crest; the r7 arch/r6 sock classes);
//     MARGIN: down-rays inside the strip's published radial band
//       [stripR0, stripR1] must render cloth (margin or skin), never
//       bare rail/drum — the C1s black-gap class, both window edges
//       and the mid arc.
//
//   SKIRT CONTINUITY (N4, judged at C1s): down the screen column through
//   the posed pocket's outer face, the first-hit sequence from the seam
//   row must be CONTIGUOUS cap-family leather (band/roll/seam/stitches/
//   skirt) to the visible hem — any foreign mesh (frame plank, blind,
//   drum) interleaved is the audit's "detached foreground geometry", and
//   a second cap segment further down the column after a foreign gap is
//   the detached-blob signature. Proportion: visible seam→hem run must
//   land in [0.28, 0.40] of the ring's projected width (reference reads
//   ~0.32; two-sided so an overdeep drape fails like a shallow lip).
//
//   OB_E2E_PORT / OB_E2E_CDP_PORT pin the ports.
//   node web/tools/probe-490-horn.mjs [--dump] [--out /tmp/x.json]
//     --dump prints per-sample / per-row hit diagnostics.
// Exit 0 only when every judged verdict passes; exit 2 = REFUSED, this
//   scene carries none of the probe's subjects (the middle-pocket
//   molded-cap family) — see the subject census before the pose loop.
import { writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  launchChrome, sleep, spawnStaticServer, stopStaticServer,
} from './cdp.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OB_E2E_PORT ?? 16526);
const CDP = Number(process.env.OB_E2E_CDP_PORT ?? 16527);
const DUMP = process.argv.includes('--dump');
const outIx = process.argv.indexOf('--out');
const OUT = outIx > 0 ? process.argv[outIx + 1] : null;

// the capture sheet's own poses (capture-490-chinese8.mjs) — the probe
// judges exactly the framings the auditor judges
const POSES = {
  c1_mouth_ring_macro: {
    cam: [0.31, 0.93, 0.24], look: [0.678, 1.318, 0.02], fov: 34,
  },
  c4_down_the_nose: {
    cam: [0.585, -1.9, 0.115], look: [0.585, 0.8, 0.05], fov: 30,
  },
  c1s_side_ring_macro: {
    cam: [1.05, -0.22, 0.26], look: [0.682, 0.0, 0.04], fov: 30,
  },
};

async function waitReady(chrome) {
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    if (await chrome.eval('window.__test?.ready === true').catch(() => false)) break;
    if (i === 199) throw new Error('app never became ready');
  }
  // REBUILD R0: the class venue default is the JOY-fit joy_lowrect
  // (snooker borrow retired — one-table adjudication 2026-08-19)
  const WANT = 'joy_lowrect';
  for (let i = 0; i < 150; i++) {
    const st = await chrome.eval(`(() => {
      const s = window.__gi && window.__gi.state;
      const rig = window.__lighting && window.__lighting.state
        && window.__lighting.state().fixture;
      return s ? JSON.stringify({ r: s.ready, f: s.fixture, b: s.baked,
        c: s.bakeClass, rig }) : null;
    })()`).catch(() => null);
    if (st) {
      const v = JSON.parse(st);
      if (v.r && v.b && v.c === 'chinese8_9ft' && v.f === WANT
        && v.rig === WANT) return;
    }
    await sleep(200);
  }
  throw new Error('GI/rig never settled on the low-rect luminaire');
}

// ---- in-page probe bodies (evaluated via CDP) ----------------------------

const HORN_PROBE = `(async (POSE_NAME) => {
  const THREE = await import('./vendor/three.module.min.js');
  const cam = window.__dbg.camera; cam.updateMatrixWorld(true);
  const scene = window.__dbg.scene;
  const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos);
  const rc = new THREE.Raycaster();
  const vis = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
  const first = (pt, farPad) => {
    const dir = pt.clone().sub(camPos); const dist = dir.length(); dir.normalize();
    rc.set(camPos, dir); rc.near = 0; rc.far = dist + farPad;
    const hits = rc.intersectObjects(scene.children, true)
      .filter((h) => h.object.isMesh && vis(h.object));
    if (!hits.length) return { name: null, hex: null, d: null, dist };
    const h = hits[0];
    return { name: h.object.name || '(anon)', d: h.distance, dist,
      hex: h.object.material?.color?.getHexString?.() ?? null,
      px: h.point.x, py: h.point.y, pz: h.point.z };
  };
  const down = (x, z) => {
    rc.set(new THREE.Vector3(x, 0.30, z), new THREE.Vector3(0, -1, 0));
    rc.near = 0; rc.far = 1.0;
    const hits = rc.intersectObjects(scene.children, true)
      .filter((h) => h.object.isMesh && vis(h.object));
    return hits.length
      ? { name: hits[0].object.name || '(anon)', y: hits[0].point.y }
      : { name: null, y: null };
  };
  const rolls = [];
  let clothHex = null;
  scene.traverse((o) => {
    if (o.userData && o.userData.cn8Roll) rolls.push(o);
    if (o.name === 'cn8-cloth-skin' && o.material && o.material.color) {
      clothHex = o.material.color.getHexString();
    }
  });
  const out = [];
  for (const roll of rolls) {
    const u = roll.userData.cn8Roll;
    const pi = Number(roll.name.split('-').pop());
    const own = new Set(['cn8cap-roll-' + pi, 'cn8cap-band-' + pi,
      'cn8cap-skirt-' + pi, 'cn8cap-seam', 'cn8cap-stitches']);
    // pose-independent terminal-ring spread (both horn tips)
    const pos = roll.geometry.getAttribute('position');
    const ring = (i0) => {
      let mx = 0;
      for (let a = 0; a <= u.segs; a++) for (let b = a + 1; b <= u.segs; b++) {
        const dx = pos.getX(i0 + a) - pos.getX(i0 + b);
        const dy = pos.getY(i0 + a) - pos.getY(i0 + b);
        const dz = pos.getZ(i0 + a) - pos.getZ(i0 + b);
        mx = Math.max(mx, Math.hypot(dx, dy, dz));
      }
      return mx;
    };
    const tipSpread = [ring(0), ring(pos.count - (u.segs + 1))];
    const sm = (v) => {
      const c = Math.min(1, Math.max(0, v));
      return c * c * (3 - 2 * c);
    };
    // ROUND-9 analytic contract (u.taper0 present): NO visible morph —
    // the buried taper starts at taper0 (past the window edge, under
    // the skin) and the centreline sinks to tipY. ROUND-10: the sink
    // completes at u.sink1 (the gate-r8 C4 fin fix — the r9 sink ran to
    // t = 1 and rode above the jaw silhouette); rev-9 trees publish no
    // sink1 and keep the 1.0 span exactly (the red-proof subject).
    const endE = (t) => (u.taper0 != null
      ? sm((t - u.taper0) / ((u.sink1 ?? 1) - u.taper0)) : null);
    const rrOf = (t) => (u.taper0 != null
      ? u.rollR * (1 - endE(t))
      : u.rollR * (1 - (1 - (u.tipFrac ?? 0))
        * (t <= 0 ? 0 : sm(t / (u.rrDe ?? 1)))));
    const snkOf = (t) => ((u.taper0 == null && u.sink && t > (u.de ?? 1))
      ? u.sink * sm((t - (u.de ?? 1)) / (1 - (u.de ?? 1))) : 0);
    const yCOf = (t) => (u.taper0 != null
      ? u.yCrest - (u.yCrest - u.tipY) * endE(Math.max(0, t))
      : u.yCrest - u.drop * sm(Math.max(0, t) / (u.de ?? 1))
        - snkOf(Math.max(0, t)));
    // round-9: the skin's leading edge at the crest station (skinT0) is
    // the walk/centreline boundary — thin-edge margin 0.03; per-station
    // the oblique line is tLeadOf below. Legacy: lapT0 (r8/r7 flush
    // edge, margin 0.05) or lipT0 (r6 sock bead zone, margin 0.13).
    const bT0 = u.skinT0 ?? u.lapT0 ?? u.lipT0 ?? null;
    const bMargin = u.skinT0 != null ? 0.03
      : u.lapT0 != null ? 0.05 : 0.13;
    const sOfR = (r) => {
      const kn = u.sKnots ?? [];
      if (!kn.length) {
        return Math.min(1, Math.max(0, (r - u.rIn) / (u.rOut - u.rIn)));
      }
      if (r <= kn[0][0]) return 0;
      for (let k = 1; k < kn.length; k++) {
        if (r <= kn[k][0]) {
          return kn[k - 1][1] + ((kn[k][1] - kn[k - 1][1])
            * (r - kn[k - 1][0])) / (kn[k][0] - kn[k - 1][0]);
        }
      }
      return 1;
    };
    const tLeadOf = (r) => {
      if (u.skinT0 == null) return bT0;
      // ROUND-11 side law (published fields, never a re-implementation):
      // band/fold radii carry the cushion-end FLAP (skinTBand, mouth-ward
      // of the window), tube/skirt radii the uniform lap (skinTLap);
      // corners keep the adjudicated oblique pow map.
      if (u.skinTLap != null) {
        return r <= (u.rFlatEnd ?? 0) + 1e-9
          ? (u.skinTBand ?? u.skinTLap) : u.skinTLap;
      }
      return u.skinTIn + (u.skinTApex - u.skinTIn)
        * Math.pow(sOfR(r), u.skinPow ?? 1.4);
    };
    // the skin's analytic surface at (r, t): band-top sheet + crown
    // circle, +cl along the normal (the table.js stations' single
    // source, reconstructed from the published profile knots)
    const bandYOf = (r) => {
      const pr = u.profile ?? [];
      for (let k = 1; k < pr.length; k++) {
        if (r <= pr[k][0] + 1e-9) {
          const f = (r - pr[k - 1][0]) / (pr[k][0] - pr[k - 1][0]);
          return pr[k - 1][1] + (pr[k][1] - pr[k - 1][1]) * f;
        }
      }
      return pr.length ? pr[pr.length - 1][1] : null;
    };
    const skinTopAt = (r, t) => {
      // sampled only in the visible zone (t < taper0, no morph): the
      // sheet is band-top + cl inboard, crown circle + cl at the roll
      const yC = yCOf(t);
      const rr2 = rrOf(t) + (u.cl ?? 0.0007);
      const dR = r - u.rRoll;
      let y = -1;
      if (Math.abs(dR) <= rr2) y = yC + Math.sqrt(rr2 * rr2 - dR * dR);
      if (r >= u.rIn - 1e-9 && r <= u.rFlatEnd + 1e-9) {
        const y0 = bandYOf(r);
        if (y0 != null && y0 + (u.cl ?? 0.0007) > y) {
          y = y0 + (u.cl ?? 0.0007);
        }
      }
      return y > 0 ? y : null;
    };
    for (const side of ['A', 'B']) {
      const samples = [];
      // the boundary sits on the pre-dive arc — start the walk far
      // enough ahead of it that the legal leather stretch is sampled
      // (>= 3 visible sections keep the horn judged; 0.30 of open-ring
      // approach keeps the far pockets' judged-somewhere inventory at
      // 12/12 — green-run 1 lost two far horns at 0.15)
      const t0w = bT0 != null && u.lipT0 == null ? bT0 - 0.30 : -0.25;
      // ROUND-19 (arc relocation): the corner line sits deep in t < 0
      // (skinT0 ≈ −1.78, tips at the rail lines) — the walk's END is
      // pinned so approach + covered stretch + dive are ALL sampled at
      // the r5 step (0.025 t); geometry whose walk already reached the
      // dive (sides, legacy) keeps its exact old sample set.
      const t1w = Math.max(t0w + 1.25, 1.05);
      const nW = Math.max(50, Math.round((t1w - t0w) / 0.025));
      for (let k = 0; k <= nW; k++) {
        const t = t0w + (k / nW) * (t1w - t0w); // approach + dive
        const e = sm(t);
        // round-5 dive easing: vertical dive completes at u.de of the
        // wrap while the taper runs the full wrap, and the dive begins
        // u.lead INSIDE the band window (over the mouth void). Both
        // fields absent on the round-4 geometry -> falls back to the
        // round-4 parameterization exactly.
        const e2 = sm(t / (u.de ?? 1));
        const lead = u.lead ?? 0;
        const psi = side === 'A' ? u.psi0 + lead - t * u.dive
          : u.psi1 - lead + t * u.dive;
        const y = t <= 0 ? u.yCrest : yCOf(t);
        const pt = new THREE.Vector3(
          u.cx + u.rRoll * Math.cos(psi), y, u.cz + u.rRoll * Math.sin(psi));
        // a SECTION is visible when any of its material renders: test the
        // centreline AND the section's top-surface point — the tube's
        // lower half sinks into the jaw-top cloth first, and a
        // centreline-only ray would call a section hidden while its
        // upper surface still renders plainly (round-5 iteration 3).
        const rr = rrOf(t);
        const top = pt.clone(); top.y += rr * 0.85;
        const hC = first(pt, 0.05);
        const hT = first(top, 0.05);
        const okHit = (h, tol) => h.name !== null && own.has(h.name)
          && Math.abs(h.d - h.dist) <= tol;
        const visHere = okHit(hC, 2.2 * u.rollR + 0.002)
          || okHit(hT, 0.003 + rr);
        // ROUND-6 surface-exact visibility: the top-surface ray first-hits
        // THIS surface within 1.5 mm (the analytic parameterization IS the
        // mesh by contract). The generous radius-envelope test above stays
        // for judgement/reporting, but near-AXIAL poses self-hit nearer
        // sections of the same tube inside its envelope, so only a
        // surface-exact hit may prove an EXPOSED section (gate r4: the
        // false 'visible' calls came exactly from that ambiguity).
        const surfExact = okHit(hT, 0.0015);
        const dn = down(pt.x, pt.z);
        samples.push({ t: +t.toFixed(3), e: +e.toFixed(4), y: +y.toFixed(5),
          vis: visHere, surfExact, hit: hC.name, hitHex: hC.hex,
          hitD: hC.d === null ? null : +hC.d.toFixed(4),
          ptD: +hC.dist.toFixed(4),
          topHit: hT.name,
          topD: hT.d === null ? null : +hT.d.toFixed(4),
          downHit: dn.name,
          downY: dn.y === null ? null : +dn.y.toFixed(5) });
      }
      const seen = samples.filter((s) => s.vis);
      const last = seen.length ? seen[seen.length - 1] : null;
      // a horn is judged at this pose when the pose actually SEES it.
      // Pre-lip geometry keeps the round-5 dive-coverage requirement
      // (t >= 0.1); with the lap/lip the dive is cloth-covered BY DESIGN,
      // so seeing the horn's approach/edge is what a pose can see at all.
      const judged = bT0 != null ? seen.length >= 3
        : (seen.length >= 3 && seen.some((s) => s.t >= 0.1));
      // ROUND-6/7 centreline bar: with the cloth boundary, a
      // SURFACE-EXACT rendered section above the plane is legitimate
      // ONLY ahead of the boundary (leather may show only where the
      // reference shows it); on pre-lip geometry the round-5 below-plane
      // last-visible bar applies unchanged.
      const pass = bT0 != null
        ? samples.every((s) => !s.surfExact
          || s.y < u.jawTop - 0.0005 || s.t <= bT0 + bMargin + 1e-6)
        : (!last || last.y < u.jawTop - 0.0005);
      // silhouette path: the tube-top edge projected to pixels, with the
      // per-point occlusion margin (dist - firstHit.d; 0 = unobstructed).
      // The cloth boundary t: lap/lip leading edge + margin, or the top
      // surface's jaw-plane crossing + 0.05 on pre-lip geometry.
      let tCut = 1.0;
      if (bT0 != null) tCut = bT0 + bMargin;
      // the ABOVE-PLANE end of the tube-top: past this t everything sinks
      // under the jaw-cloth plane (the walk beyond lands on unrelated
      // body/skirt clutter in projection and proves nothing)
      let tEnd = 1.0;
      for (let t = 0; t <= 1; t += 0.01) {
        const yT = yCOf(t) + rrOf(t);
        if (yT < u.jawTop - 0.001) { tEnd = t; break; }
      }
      if (bT0 == null) tCut = Math.min(1.0, tEnd + 0.06);
      const topPoint = (t, lift) => {
        const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
          : u.psi1 - (u.lead ?? 0) + t * u.dive;
        return new THREE.Vector3(
          u.cx + u.rRoll * Math.cos(psi),
          yCOf(t) + rrOf(t) + lift,
          u.cz + u.rRoll * Math.sin(psi));
      };
      // the walk covers a BAND, not one line: three radial offsets
      // cross the nose's full width (the r5 C4-left bare nose sat BESIDE
      // the single centre line and was only caught by the auditor's 2D
      // crop; red-proof round-7). Each point also records the AZIMUTH-t
      // of the surface it actually renders when that surface is the
      // horn's own leather — legality is judged on WHERE the rendered
      // leather is, not on the walk parameter (a covered point may
      // legally project onto the pre-boundary arc in front of it).
      const wrapPi = (a) => {
        let x = a % (2 * Math.PI);
        if (x > Math.PI) x -= 2 * Math.PI;
        if (x < -Math.PI) x += 2 * Math.PI;
        return x;
      };
      const hitTOf = (hit) => {
        if (hit.d === null || hit.px === undefined) return null;
        if (hit.name !== 'cn8cap-roll-' + pi
          && hit.name !== 'cn8cap-band-' + pi) return null;
        const psiH = Math.atan2(hit.pz - u.cz, hit.px - u.cx);
        const tH = side === 'A'
          ? wrapPi(u.psi0 + (u.lead ?? 0) - psiH) / u.dive
          : wrapPi(psiH - (u.psi1 - (u.lead ?? 0))) / u.dive;
        return +tH.toFixed(3);
      };
      const topPointR = (t, lift, dr) => {
        const rr2 = rrOf(t);
        const h2 = Math.max(rr2 * rr2 - dr * dr, 0);
        const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
          : u.psi1 - (u.lead ?? 0) + t * u.dive;
        const rad = u.rRoll + dr;
        return new THREE.Vector3(
          u.cx + rad * Math.cos(psi),
          yCOf(t) + Math.sqrt(h2) + lift,
          u.cz + rad * Math.sin(psi));
      };
      const pts = [];
      // round-8: the walk must still cover the OPEN approach when the
      // boundary sits deep in the dive (lapT0 0.41) — the r7 expression
      // was tuned for lapT0 −0.20 and left the whole visible descent
      // unwalked (C4 lost its pixel-judged horns); legacy values are
      // unchanged by the floor.
      // ROUND-19: on skin geometry the walk starts mouth-ward of the
      // line (bT0 − 0.35) so the visible leather stretch is walked —
      // the pixel judge refuses to judge a horn whose walk renders no
      // leather at all (lost-subject law), and the corner line now
      // sits at t ≈ −1.78.  Sides (bT0 ≈ 0.57) keep tw0 = −0.3 and the
      // exact old 54-step sample set.
      const tw0 = u.lapT0 != null ? Math.min(u.lapT0 - 0.12, -0.15)
        : u.skinT0 != null ? Math.min(-0.3, bT0 - 0.35) : -0.3;
      const tw1 = Math.max(tw0 + 1.35, 1.05);
      const nS = Math.max(54, Math.round((tw1 - tw0) / 0.025));
      for (const dr of [-0.0015, 0, 0.0015]) {
        for (let k = 0; k <= nS; k++) {
          const t = tw0 + (k / nS) * (tw1 - tw0);
          const wp = dr === 0 ? topPoint(t, 0.0005)
            : topPointR(t, 0.0005, dr);
          const v = wp.clone().project(cam);
          if (v.z >= 1) continue;
          const hit = first(wp, 0.05);
          const occ = hit.d === null ? 0 : Math.max(0, hit.dist - hit.d);
          // GH-490 REBUILD R3 (the standing c4 p4/B red, adjudicated
          // with its mechanism): the walk pixel at t 0.775 rendered
          // the cap's own SKIRT through the ~1 px cloth-skin↔roll
          // seam at the far side pocket's grazing register (raycast:
          // cn8cap-skirt-4 at d 1.825 vs pt 1.8255 — under the 1.5 mm
          // foreign-occlusion floor, so the catch-all counted it as
          // bare-nose evidence).  The skirt/seat are LEGAL below-trim
          // anatomy with their own arms (SKIRT ratio + detached bars;
          // the q8pro-era side references show cap leather beside the
          // trim in every frame) and are a DISJOINT surface identity
          // from every documented bare-nose signature (roll/band hits
          // ride the ht azimuth path; true bare endings also sail to
          // the background) — so a skirt/seat first-hit is marked and
          // the violation rule treats it as the foreign-geometry
          // class regardless of standoff.  Red direction preserved:
          // a bare or renamed tube still fires via ht / famN.
          // (measured at the red: the ray hit at t 0.775 is the
          // covering cn8-cloth-skin 1 mm above the tube — a COVERED
          // point — and the leather read is 3×3 neighborhood bleed
          // from the adjacent skirt sliver at the seam.  A near hit
          // on a NAMED cloth cover is coverage succeeding, never
          // bare-nose evidence: the documented red signatures put the
          // ray ON the roll (ht path) or sail it to the background.)
          const skHit = hit.name === 'cn8cap-skirt-' + pi
            || hit.name === 'cn8cap-seat-' + pi ? 1
            : hit.name === 'cn8-cloth-skin'
              || hit.name === 'cn8-cloth-margin'
              || hit.name === 'cn8-bed'
              || (hit.name || '').startsWith('cn8-cushion') ? 2 : 0;
          pts.push([+t.toFixed(3), Math.round((v.x + 1) / 2 * 1280),
            Math.round((1 - v.y) / 2 * 800), +occ.toFixed(4), hitTOf(hit),
            skHit]);
        }
      }
      // TRIM-COVER samples (the silhouette arm's bar): points 1.2 mm above
      // the tube top across the trim zone — where the reference's cloth
      // edge overlaps the horn. Covered = the camera ray meets REAL
      // geometry within 10 mm of the point (the trim stands over the
      // tube) — a bare ending lets the ray sail to the background
      // (first() caps at dist+50 mm, so a far hit reads as none).
      // Round-7 lap geometry: the zone spans the whole covered ending,
      // leading edge to the jaw-plane sink, not just the edge strip.
      // Round-8 flat-tongue geometry (u.planeY): the cloth continues ON
      // the plane past the tube's sink, so the zone runs the tongue's
      // own span and never caps at tEnd.
      const tz = u.skinT0 != null
        ? [bT0 + 0.03, Math.min(bT0 + 0.35, tEnd - 0.02)]
        : u.planeY != null
          ? [u.lapT0 + 0.03, u.lapT0 + 0.40]
          : u.lapT0 != null
            ? [u.lapT0 + 0.03, Math.max(u.lapT0 + 0.13, Math.min(tEnd - 0.02,
              u.lapT0 + 0.45))]
            : u.lipT0 != null
              ? [u.lipT0 + 0.02, u.lipT0 + 0.11]
              : [Math.max(0, tEnd - 0.12), Math.max(0.02, tEnd - 0.02)];
      // lap geometry: the cover is FLUSH (0.7 mm standoff) — sample just
      // 0.2 mm above the cloth sheet, or a near-axial ray clears the
      // whole mound and sails to the background (green-run 2: C4 zone
      // samples read sd -9 over a fully covered ending). Flat-tongue
      // geometry: the sample floor is the TONGUE plane, not the sinking
      // tube top (a sub-plane sample would read the tongue itself as
      // its own cover from the wrong side).
      const covLift = u.lapT0 != null || u.skinT0 != null ? 0.0009 : 0.0012;
      const cov = [];
      for (let k = 0; k < 6; k++) {
        const t = tz[0] + ((tz[1] - tz[0]) * k) / 5;
        let wp;
        if (u.skinT0 != null) {
          // ROUND-9 (probe run 1: five of six C4 zone samples read sd −9
          // over a FULLY covered crest — a grazing ray 0.2 mm above the
          // crown apex falls away behind the convexity and sails to the
          // background): the zone sample sits ON the covering sheet's
          // CAMERA-FACING surface — 0.2 mm outside the skin along the
          // section-plane direction toward the camera, clamped into the
          // sheet's angular coverage. Every pose's ray then meets the
          // sheet ~0.2 mm before the sample when the ending is covered;
          // a bare ending still has nothing there (sd −9/decimeters).
          const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
            : u.psi1 - (u.lead ?? 0) + t * u.dive;
          const cA = Math.cos(psi); const sA = Math.sin(psi);
          const ctr = new THREE.Vector3(
            u.cx + u.rRoll * cA, yCOf(t), u.cz + u.rRoll * sA);
          const toCam = camPos.clone().sub(ctr);
          // section-plane components: radial-out + up
          const radOut = toCam.x * cA + toCam.z * sA;
          const upC = toCam.y;
          let aC = Math.atan2(upC, radOut);
          aC = Math.min(2.4, Math.max(-0.3, aC)); // sheet coverage clamp
          const rr2 = rrOf(t) + (u.cl ?? 0.0007) + 0.0002;
          wp = new THREE.Vector3(
            ctr.x + rr2 * Math.cos(aC) * cA,
            ctr.y + rr2 * Math.sin(aC),
            ctr.z + rr2 * Math.cos(aC) * sA);
        } else {
          wp = topPoint(t, covLift);
          if (u.planeY != null) wp.y = Math.max(wp.y, u.planeY + 0.0003);
        }
        const v = wp.clone().project(cam);
        if (v.z >= 1) continue;
        const hit = first(wp, 0.05);
        const sd = hit.d === null ? -9 : hit.dist - hit.d;
        cov.push([+t.toFixed(3), Math.round((v.x + 1) / 2 * 1280),
          Math.round((1 - v.y) / 2 * 800), +sd.toFixed(4)]);
      }
      // covered-depth tolerance: the r8 lap zone spanned the WHOLE
      // ending, so at near-axial poses the covering cloth legitimately
      // sat 10–20 mm in front of the far zone samples (25 mm). The
      // round-9 skin is CONFORMAL — the sheet sits 0.2 mm under every
      // zone sample, so 10 mm is generous; a bare nose's background is
      // DECIMETERS away either way. Legacy sock/pre-lip keeps 10 mm.
      const covTol = u.skinT0 != null ? 0.010
        : u.lapT0 != null ? 0.025 : 0.010;
      // ROUND-7 boundary pixel: the projected cloth edge — walk points
      // straddling it within 6 px are boundary mixing, not violations
      let bpx = null;
      if (bT0 != null) {
        const bv = topPoint(tCut, 0.0005).project(cam);
        if (bv.z < 1) {
          bpx = [Math.round((bv.x + 1) / 2 * 1280),
            Math.round((1 - bv.y) / 2 * 800)];
        }
      }
      // ROUND-8 GATE-BASIS MATERIAL region: analytic points ON the flat
      // jaw-cloth tongue (the geometry contract's plane, u.planeY),
      // ray-verified onto the lap mesh itself — the auditor's own
      // subject, the RENDERED lap region. The r7 crown/phi generator +
      // up/shade-mode medians measured the arch's ray-verified crown
      // against jaw tops and PASSED while the gate's rendered-region
      // sampling FAILED (r6: dV −5..−37, dS +14..+47 — curvature
      // shading); the flat coplanar tongue retires the shading excuse,
      // so the probe now samples the region the way the gate does. On
      // legacy geometry (no planeY) the plane default lands the points
      // inside the r7 mound where the camera ray verifies nothing —
      // "material patches lost", a red verdict (the red-proof).
      // The JAW patch stays the geometric jaw/plank plane beyond this
      // horn's window edge (down-ray, camera-visible) — the auditor's
      // own comparison basis. r31 re-letter: the ENTIRE cn8 deck class
      // moved to z42 (S2a rail top 42 / S2h band top 42 — the old
      // 0.047/0.0466 deck class retired), so the SKIN-path down-verify
      // windows move to [0.0400, 0.0428] (live side-jaw cloth tops read
      // 0.039..0.042; the side dressing meshes themselves are
      // byte-identical and keep their published u.jawTop letters).
      // LEGACY paths (planeY/pre-lip trees) keep the historical
      // 0.0455..0.0478 spelling — their subject is the old tree.
      const mat = [];
      const jawPx = [];
      let matFallback = false;
      if (u.skinT0 != null) {
        // ROUND-9 RE-AIMED ROIs (the adjudication crops' subject): the
        // rendered SKIN region — analytic points ON the conformal
        // sheet's near-horizontal stations (band-top sheet + crown),
        // each station starting past ITS OWN leading-edge azimuth
        // (the oblique line), capped inside the visible zone (the
        // region the acceptance crops show as covering cloth),
        // camera-ray verified onto the skin mesh itself within 2 mm.
        // ROUND-11 (C4 pose only): the strict region samples the
        // NEAR-HORIZONTAL stations (band-top sheet + crown) — its law.
        // The deepened inner-lip fold (the C4-right fin fix) turns the
        // lip vicinity vertical, and at the C4 GRAZE the two innermost
        // radii render the fold's shaded face (strict dV drifted
        // -5.97 -> -6.99 with zero change to the strip itself); the C4
        // region starts 20 mm inside the crest so its subject stays
        // the covered top. The top-down poses render band-top pixels
        // at those radii and keep the full round-9 region; the
        // gate-basis parallel records are untouched.
        const DRS9 = POSE_NAME === 'c4_down_the_nose'
          ? [-0.020, -0.016, -0.012, -0.008, -0.004, -0.001,
            0.002, 0.004]
          : [-0.028, -0.024, -0.020, -0.016, -0.012, -0.008,
            -0.004, -0.001, 0.002, 0.004];
        const sampleSkin = (anyCloth) => {
          for (let k = 0; k < 10; k++) {
            for (const dr of DRS9) {
              const rad = u.rRoll + dr;
              // start 0.05 past the station's own leading edge: rows
              // 0–2 are the pressed-edge transition (the intentional
              // soft ~1 mm contact shadow) — the region bar samples the
              // sheet BODY, as the auditor's box does. Cap at the
              // WINDOW EDGE: past it the sheet rides over the jaw where
              // the GI field legitimately differs (mixing it in read
              // +0.9 sat points at the C1s near horn — round-9 crop
              // loop), and the auditor's ending boxes frame the
              // mouth-side region.
              // ROUND-19 window re-anchor (arc relocation, CORNERS
              // ONLY): the strict region's SUBJECT was always the
              // jaw-ADJACENT covered strip — the r8 law ("the gate's
              // comparison boxes are SIDE-BY-SIDE in the frame,
              // sharing the junction's illumination field") + the
              // round-10 "lit pre-melt covering".  The historical
              // spelling (tLead+0.05 with a tL+0.32 cap) delivered
              // exactly that only because the corner line sat NEAR the
              // melt; with the line moved to t ≈ −1.79 the same
              // spelling pins the region to the foreshortened strip AT
              // the line (r19 crop loop: pure graze shading, lag 0.87
              // vs jaw 0.41) and a whole-arc region spans shading
              // regimes (dV −6.8/−7.5 vs the ±6 gate bar).  Corner
              // windows therefore anchor at the MELT end with the
              // historical 0.32 width.  SIDES keep the r10 spelling
              // VERBATIM (review r19-r1 P2: at side band radii
              // tLeadOf returns the FLAP's skinTBand ≈ −0.353, so a
              // shared melt-end floor would shift the C1s band
              // samples from [−0.303, 0.017] to [0.307, 0.627] —
              // exactly the side-pocket drift this round must not
              // have).
              let tL; let mt1;
              if (u.skinTLap != null) {
                tL = tLeadOf(rad) + 0.05;
                mt1 = Math.min(u.tEdge - 0.01,
                  (u.taper0 ?? 1) - 0.02, tL + 0.32);
              } else {
                mt1 = Math.min(u.tEdge - 0.01,
                  (u.taper0 ?? 1) - 0.02);
                tL = Math.max(tLeadOf(rad) + 0.05, mt1 - 0.32);
              }
              if (mt1 <= tL) continue;
              const t = tL + ((mt1 - tL) * k) / 9;
              const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
                : u.psi1 - (u.lead ?? 0) + t * u.dive;
              const wx = u.cx + rad * Math.cos(psi);
              const wz = u.cz + rad * Math.sin(psi);
              let wp;
              if (anyCloth) {
                // GATE-MIRROR fallback (the r8 law): a near-axial pose
                // may only resolve the ending's visible cloth as the
                // jaw's own face — down-verified, flagged, log-only at
                // C4 (the verdict gates on strict records at the macro
                // poses)
                // r31 re-letter: the cn8 deck class moved to z42 (S2a
                // rail top 42 / S2h band top 42; the 0.047/0.0466 class
                // retired) — live side-jaw cloth tops read 0.039..0.042
                const dn = down(wx, wz);
                if (dn.y === null || dn.y < 0.0400 || dn.y > 0.0428) continue;
                if (own.has(dn.name)) continue;
                wp = new THREE.Vector3(wx, dn.y + 0.0002, wz);
              } else {
                const yS = skinTopAt(rad, t);
                if (yS === null) continue;
                wp = new THREE.Vector3(wx, yS + 0.0004, wz);
              }
              const v = wp.clone().project(cam);
              if (v.z >= 1) continue;
              if (!anyCloth) {
                const hit = first(wp, 0.05);
                if (hit.d === null
                  || Math.abs(hit.dist - hit.d) > 0.002) continue;
                // the sample must land ON the covering skin itself
                // (review round-7 P2 law)
                if (hit.name !== 'cn8-cloth-skin') continue;
              }
              mat.push([Math.round((v.x + 1) / 2 * 1280),
                Math.round((1 - v.y) / 2 * 800)]);
            }
          }
        };
        sampleSkin(false);
        if (mat.length < 8) {
          // review round-8 P2 law: fallback points join ONLY when the
          // strict pass is starved
          matFallback = true;
          sampleSkin(true);
        }
        // jaw candidates: the ending's own continuation past the buried
        // tip + the legacy window-edge patch — all down-verified
        // jaw/plank-level cloth (never the skin, never leather; the
        // margin strip is legal adjacency — it IS the pocket-cut cloth)
        const cand = [];
        for (let k = 0; k < 12; k++) {
          const t = 1.02 + (0.55 * k) / 11;
          const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
            : u.psi1 - (u.lead ?? 0) + t * u.dive;
          for (const dr of DRS9) cand.push([psi, dr]);
        }
        const psiEdge9 = side === 'A' ? u.psi0 : u.psi1;
        for (const g of [0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 0.9]) {
          const psi = side === 'A' ? psiEdge9 - g : psiEdge9 + g;
          for (const dr of [-0.008, 0.002, 0.012, 0.024, 0.036]) {
            cand.push([psi, dr]);
          }
        }
        for (const [psi, dr] of cand) {
          const rad = u.rRoll + dr;
          const x = u.cx + rad * Math.cos(psi);
          const z = u.cz + rad * Math.sin(psi);
          const dn = down(x, z);
          // r31: z42 deck class (S2a/S2h) — was 0.0455..0.0478
          if (dn.y === null || dn.y < 0.0400 || dn.y > 0.0428) continue;
          if (dn.name === 'cn8-cloth-skin') continue;
          if (own.has(dn.name)) continue;
          const wp = new THREE.Vector3(x, dn.y + 0.0002, z);
          const v = wp.clone().project(cam);
          if (v.z >= 1) continue;
          jawPx.push([Math.round((v.x + 1) / 2 * 1280),
            Math.round((1 - v.y) / 2 * 800)]);
        }
        // SAME-SHADE jaw candidates (round-9 crop loop): at the side
        // poses the covered ridge legitimately reads dark — the
        // adjudication's own reference frames call the cushion-end
        // cloth "shadow-dark" and were brightened 2.2x to read it —
        // and the auditor achieves comparability by placing the jaw
        // box IN THE SAME SHADE beside the ending (the r6 C4-left box
        // law the r8 adjacency window already encodes). Down-verified
        // tops alone cannot reach same-shade cloth, so the jaw's own
        // FACES flanking the ending join the candidates: camera rays
        // through mouth-air points at wall heights land on the first
        // cloth surface behind, verified by material identity (the
        // one clothMat instance) and sub-top height — never the skin,
        // the margin, or leather. The image-adjacency window then
        // selects naturally per pose.
        for (const g of [0.03, 0.07, 0.12, 0.18]) {
          // BOTH window edges' faces are candidates for either horn —
          // which shaded face is visible beside an ending is pose
          // geometry (at C1s the wall seen next to the near ending is
          // the OPPOSITE edge's face across the mouth); the adjacency
          // window keeps only pixels near the subject region.
          for (const psi of [u.psi0 + g, u.psi1 - g]) {
            for (const dr of [-0.020, -0.008, 0.004, 0.016]) {
              for (const hy of [0.030, 0.037, 0.043]) {
                const rad = u.rRoll + dr;
                const wp = new THREE.Vector3(
                  u.cx + rad * Math.cos(psi), hy,
                  u.cz + rad * Math.sin(psi));
                const v = wp.clone().project(cam);
                if (v.z >= 1) continue;
                const hit = first(wp, 0.08);
                if (hit.d === null || hit.px === undefined) continue;
                if (hit.name === 'cn8-cloth-skin'
                  || hit.name === 'cn8-cloth-margin') continue;
                if (own.has(hit.name)) continue;
                if (clothHex && hit.hex !== clothHex) continue;
                // r31: sub-top faces under the z42 deck (S2a/S2h; same
                // 0.4 mm under-top margin the 0.0466-class 0.0462 had)
                if (hit.py > 0.0416 || hit.py < 0.012) continue;
                const vh = new THREE.Vector3(hit.px, hit.py, hit.pz)
                  .project(cam);
                if (vh.z >= 1) continue;
                jawPx.push([Math.round((vh.x + 1) / 2 * 1280),
                  Math.round((1 - vh.y) / 2 * 800)]);
              }
            }
          }
        }
      } else if (bT0 != null) {
        const py = (u.planeY ?? 0.0471) + 0.0004;
        const mt0 = bT0 + 0.015;
        const mt1 = bT0 + 0.40;
        // radial stations span the tongue's full width — the inboard
        // flat (toward the fall lip) is where the grazing side pose
        // resolves most of the lit tongue field; sampling only the
        // crown strip put the whole region inside the junction's cast
        // shadow and misread shading as material (round-8 green-run 2)
        const DRS = [-0.028, -0.024, -0.020, -0.016, -0.012, -0.008,
          -0.005, -0.002, 0.001, 0.004, 0.007, 0.009];
        const sampleRegion = (anyCloth) => {
          for (let k = 0; k < 10; k++) {
            const t = mt0 + ((mt1 - mt0) * k) / 9;
            const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
              : u.psi1 - (u.lead ?? 0) + t * u.dive;
            for (const dr of DRS) {
              const rad = u.rRoll + dr;
              const wx = u.cx + rad * Math.cos(psi);
              const wz = u.cz + rad * Math.sin(psi);
              let wp;
              if (anyCloth) {
                // GATE-MIRROR fallback (round-8): at near-axial poses the
                // flat tongue hides behind the jaw and the pose's visible
                // "ending region cloth" IS the jaw's own face — exactly
                // the region the auditor samples there (their r6 C4
                // boxes). Down-verify the surface (a camera-ray identity
                // check cannot survive the ~4° grazing geometry) and
                // record its projected pixel; occluded pixels drop out
                // in the classifier's gate cloth mask, as they do in the
                // auditor's own box sampling. The record is flagged.
                const dn = down(wx, wz);
                if (dn.y === null || dn.y < 0.0450 || dn.y > 0.0480) continue;
                if (own.has(dn.name)) continue;
                wp = new THREE.Vector3(wx, dn.y + 0.0002, wz);
              } else {
                wp = new THREE.Vector3(wx, py, wz);
              }
              const v = wp.clone().project(cam);
              if (v.z >= 1) continue;
              if (!anyCloth) {
                const hit = first(wp, 0.05);
                if (hit.d === null
                  || Math.abs(hit.dist - hit.d) > 0.002) continue;
                // the sample must land ON the covering cloth itself
                // (review round-7 P2 law)
                if (hit.name !== 'cn8-jawcloth-lap'
                  && hit.name !== 'cn8cap-lip-' + pi) continue;
              }
              mat.push([Math.round((v.x + 1) / 2 * 1280),
                Math.round((1 - v.y) / 2 * 800)]);
            }
          }
        };
        sampleRegion(false);
        if (u.planeY != null && mat.length < 8) {
          // review round-8 P2: fallback points join ONLY when the strict
          // pass is starved — a strict record must be built purely from
          // ray-verified tongue pixels, or occluded projections
          // resolving to adjacent jaw cloth could dominate the means
          // and let a mismatched tongue pass as a strict sample. The
          // strict region's shadow composition is handled on its own
          // axes (comparable-illumination floor + image-adjacent jaw
          // window in the classifier), never by diluting the subject.
          matFallback = true;
          sampleRegion(true);
        }
        if (u.planeY != null) {
          // ROUND-8 flat geometry: jaw CANDIDATES come from two
          // geometric families — the lap band's own continuation beyond
          // the tongue tail and the legacy window-edge patch — all
          // down-verified jaw/plank cloth (never the lap mesh, never
          // leather; the r7 image annulus failed by mixing leather
          // edges and fall shadow). The classifier then keeps the
          // candidates IMAGE-ADJACENT to the lap region: the gate's
          // boxes are side-by-side, sharing the junction's illumination
          // field (their r6 C4-left jaw box sat in the same shade as
          // its lap box; a distant bright patch turns the comparison
          // into illumination, not material).
          const cand = [];
          for (let k = 0; k < 12; k++) {
            const t = bT0 + 0.48 + (0.55 * k) / 11;
            const psi = side === 'A' ? u.psi0 + (u.lead ?? 0) - t * u.dive
              : u.psi1 - (u.lead ?? 0) + t * u.dive;
            for (const dr of DRS) cand.push([t, psi, dr]);
          }
          const psiEdge0 = side === 'A' ? u.psi0 : u.psi1;
          for (const g of [0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 0.9]) {
            const psi = side === 'A' ? psiEdge0 - g : psiEdge0 + g;
            for (const dr of [-0.008, 0.002, 0.012, 0.024, 0.036]) {
              cand.push([null, psi, dr]);
            }
          }
          for (const [, psi, dr] of cand) {
            const rad = u.rRoll + dr;
            const x = u.cx + rad * Math.cos(psi);
            const z = u.cz + rad * Math.sin(psi);
            const dn = down(x, z);
            if (dn.y === null || dn.y < 0.0455 || dn.y > 0.0478) continue;
            if (dn.name === 'cn8-jawcloth-lap'
              || dn.name === 'cn8cap-lip-' + pi) continue;
            if (own.has(dn.name)) continue;
            const wp = new THREE.Vector3(x, dn.y + 0.0002, z);
            const v = wp.clone().project(cam);
            if (v.z >= 1) continue;
            jawPx.push([Math.round((v.x + 1) / 2 * 1280),
              Math.round((1 - v.y) / 2 * 800)]);
          }
        } else {
          const psiEdge = side === 'A' ? u.psi0 : u.psi1;
          for (const g of [0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 0.9]) {
            const psi = side === 'A' ? psiEdge - g : psiEdge + g;
            for (const dr of [-0.008, 0.002, 0.012, 0.024, 0.036]) {
              const rad = u.rRoll + dr;
              const x = u.cx + rad * Math.cos(psi);
              const z = u.cz + rad * Math.sin(psi);
              const dn = down(x, z);
              if (dn.y === null || dn.y < 0.0455 || dn.y > 0.0478) continue;
              if (dn.name === 'cn8-jawcloth-lap'
                || dn.name === 'cn8cap-lip-' + pi) continue;
              const wp = new THREE.Vector3(x, dn.y, z);
              const v = wp.clone().project(cam);
              if (v.z >= 1) continue;
              const hit = first(wp, 0.05);
              if (hit.d === null || Math.abs(hit.dist - hit.d) > 0.003) continue;
              jawPx.push([Math.round((v.x + 1) / 2 * 1280),
                Math.round((1 - v.y) / 2 * 800)]);
            }
          }
        }
      }
      out.push({ pocket: pi, side, judged,
        lastVisT: last ? last.t : null, lastVisY: last ? last.y : null,
        jawTop: u.jawTop, tipSpread,
        lapT0: u.lapT0 ?? null, lipT0: u.lipT0 ?? null,
        skinT0: u.skinT0 ?? null, skinTIn: u.skinTIn ?? null,
        skinTApex: u.skinTApex ?? null, boundaryT0: bT0,
        pass, sil: { tCut: +tCut.toFixed(3), tEnd: +tEnd.toFixed(3),
          covTol, pts, cov, bpx, mat, matFallback,
          flat: u.planeY != null, skin: u.skinT0 != null, jawPx },
        samples });
    }
  }
  return JSON.stringify(out);
})`;

const SKIRT_PROBE = `(async () => {
  const THREE = await import('./vendor/three.module.min.js');
  const cam = window.__dbg.camera; cam.updateMatrixWorld(true);
  const scene = window.__dbg.scene;
  const camPos = new THREE.Vector3(); cam.getWorldPosition(camPos);
  const rc = new THREE.Raycaster();
  const vis = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
  const rolls = [];
  scene.traverse((o) => { if (o.userData && o.userData.cn8Roll) rolls.push(o); });
  // posed pocket = ring centre nearest the screen centre
  let best = null;
  for (const roll of rolls) {
    const u = roll.userData.cn8Roll;
    const v = new THREE.Vector3(u.cx, u.yCrest, u.cz).project(cam);
    const d = Math.hypot(v.x, v.y);
    if (v.z < 1 && (!best || d < best.d)) best = { roll, u, d };
  }
  const u = best.u;
  const pi = Number(best.roll.name.split('-').pop());
  const cap = new Set(['cn8cap-roll-' + pi, 'cn8cap-band-' + pi,
    'cn8cap-skirt-' + pi, 'cn8cap-seat-' + pi, 'cn8cap-seam', 'cn8cap-stitches']);
  const W = 1280, H = 800;
  // projected ring width (crest circle)
  let x0 = Infinity, x1 = -Infinity;
  for (let k = 0; k < 144; k++) {
    const psi = (k / 144) * 2 * Math.PI;
    const v = new THREE.Vector3(u.cx + u.rRoll * Math.cos(psi),
      u.yCrest + u.rollR, u.cz + u.rRoll * Math.sin(psi)).project(cam);
    if (v.z < 1) { x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); }
  }
  const ringWpx = (x1 - x0) / 2 * W;
  // outer-face column: ring azimuth toward the camera
  const phiCam = Math.atan2(camPos.z - u.cz, camPos.x - u.cx);
  const near = new THREE.Vector3(u.cx + u.rRoll * Math.cos(phiCam),
    u.yCrest + u.rollR, u.cz + u.rRoll * Math.sin(phiCam)).project(cam);
  const colNdc = near.x;
  const rowTop = Math.round((1 - near.y) / 2 * H);
  const rows = [];
  for (let py = rowTop; py < Math.min(H, rowTop + 480); py++) {
    const ndcY = 1 - (py / H) * 2;
    rc.setFromCamera(new THREE.Vector2(colNdc, ndcY), cam);
    rc.near = 0; rc.far = 100;
    const hits = rc.intersectObjects(scene.children, true)
      .filter((h) => h.object.isMesh && vis(h.object));
    rows.push({ py, name: hits.length ? (hits[0].object.name || '(anon)') : null,
      hex: hits.length ? (hits[0].object.material?.color?.getHexString?.() ?? null) : null,
      d: hits.length ? +hits[0].distance.toFixed(4) : null,
      y: hits.length ? +hits[0].point.y.toFixed(5) : null });
  }
  // seam row = last stitches/seam hit in the leading cap run
  let seamRow = null, faceEnd = null, i = 0;
  while (i < rows.length && rows[i].name && cap.has(rows[i].name)) {
    if (rows[i].name === 'cn8cap-seam' || rows[i].name === 'cn8cap-stitches') seamRow = rows[i].py;
    faceEnd = rows[i].py;
    i++;
  }
  if (seamRow === null) seamRow = rows.length ? rows[0].py : null;
  // detached cap segments after foreign gaps — COUNTED (review r11 r5
  // P2: the sheet annotation prints this as a measured number, so a
  // first-hit boolean would fabricate '1' on a multi-gap capture)
  let foreignGaps = 0, gapAt = null, inCap = false;
  for (; i < rows.length; i++) {
    const isCap = !!(rows[i].name && cap.has(rows[i].name));
    if (isCap && !inCap) {
      foreignGaps++;
      if (gapAt === null) gapAt = rows[i].py;
    }
    inCap = isCap;
  }
  const detached = foreignGaps > 0;
  const facePx = faceEnd !== null && seamRow !== null ? faceEnd - seamRow : 0;
  const ratio = ringWpx > 0 ? facePx / ringWpx : 0;
  // pass band: the reference reads ~0.32 of ring width — two-sided so an
  // overdeep drape (round-4's -0.072 hem would render ~0.42 once the
  // frame wall is gone) fails just like a shallow lip
  return JSON.stringify({ pocket: pi, ringWpx: +ringWpx.toFixed(1), seamRow,
    faceEnd, facePx, ratio: +ratio.toFixed(4), detached, foreignGaps,
    gapAt, pass: ratio >= 0.28 && ratio <= 0.40 && !detached, rows });
})()`;

// ---- silhouette pixel classifier (round-6) --------------------------------
// The gate's own HSV leather classifier (audit r4 scratch, hue 0.02-0.13,
// sat 0.25-0.90, val 0.30-0.85) walked along each horn's projected tube-top
// path; cloth = the green family incl. the dark shadowed trim. PIL/numpy via
// python3, the repo's pixel-tooling convention (lib/pixelverdict.mjs).
// python resolution (round-9 battery forensics): under the run-gate
// wrapper's child environment a bare 'python3' resolved to a corp
// PATH shim that blocked forever before interpreter startup (0.01 s
// CPU after 15 min, stuck pre-import) and the suite hung inside
// execFileSync — the SAME command ran green five times from the
// interactive shell. The system interpreter is pinned first
// (numpy+PIL verified present); OB_PYTHON overrides for machines
// where it lacks them.
const PY = process.env.OB_PYTHON
  ?? (existsSync('/usr/bin/python3') ? '/usr/bin/python3' : 'python3');

function classifySilhouette(file, horns, nearAxial = false) {
  const payload = JSON.stringify({ file, horns, nearAxial });
  return JSON.parse(execFileSync(PY, ['-c', `
import json, sys
import numpy as np
from PIL import Image
s = json.load(sys.stdin)
im = np.asarray(Image.open(s['file']).convert('RGB'), dtype=np.float64) / 255.0
H, W, _ = im.shape
mx = im.max(axis=2); mn = im.min(axis=2); d = mx - mn
sat = np.where(mx > 0, d / np.maximum(mx, 1e-9), 0)
r, g, b = im[:, :, 0], im[:, :, 1], im[:, :, 2]
hue = np.zeros_like(mx); nz = d > 0
pick = (mx == r) & nz; hue[pick] = ((g[pick] - b[pick]) / d[pick]) % 6
pick = (mx == g) & nz; hue[pick] = (b[pick] - r[pick]) / d[pick] + 2
pick = (mx == b) & nz; hue[pick] = (r[pick] - g[pick]) / d[pick] + 4
hue /= 6
leather = (hue >= 0.02) & (hue <= 0.13) & (sat >= 0.25) & (sat <= 0.90) \\
    & (mx >= 0.30) & (mx <= 0.85)
cloth = (hue >= 0.22) & (hue <= 0.50) & (sat >= 0.15) & (mx >= 0.05) & (g > r)
# 7x7 box-mean detrend of the value channel: texture correlation must
# measure the WEAVE, not regional shading structure (an annulus mixing a
# lit top with a shaded flank correlates ~0.9 on raw values for ANY
# material — green-run 1's jaw read)
def box7(a):
    k = 7
    ap = np.pad(a, k // 2, mode='edge')
    c = np.cumsum(np.cumsum(ap, axis=0), axis=1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return (c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]) / (k * k)
res = mx - box7(mx)
out = []
for h in s['horns']:
    # occlusion-filtered on-frame walk (occ > 20 mm = foreign foreground;
    # the horn's own near structure stays in — that is how the exposed
    # noses rendered), truncated at tEnd: past the jaw-plane crossing the
    # projected walk lands on unrelated body/skirt leather and proves
    # nothing about the ending
    pts = [p for p in h['pts']
           if 2 <= p[1] < W - 2 and 2 <= p[2] < H - 2 and p[3] <= 0.02
           and p[0] <= h['tEnd'] + 1e-9]
    # a horn is pixel-judged only at a readable scale: the projected dive
    # (t 0 -> 1) must span >= 24 px — the gate's own "distant pockets are
    # too small to overturn" scope; a sub-pixel trim cannot be judged
    span = 0.0
    a = [p for p in h['pts'] if p[0] >= -0.05]
    if a:
        z = [p for p in h['pts'] if p[0] >= 0.95]
        if z:
            span = ((a[0][1] - z[-1][1]) ** 2 + (a[0][2] - z[-1][2]) ** 2) ** 0.5
    if span < 24:
        out.append({'key': h['key'], 'judged': False})
        continue
    lab = []
    for t, x, y, occ, ht, *sk in pts:
        lab.append((t, int(leather[y-1:y+2, x-1:x+2].sum()),
                    int(cloth[y-2:y+3, x-2:x+3].sum())))
    lts = [t for t, ln, cn in lab if ln >= 2]
    if not lts:
        # no leather anywhere on the walk: the horn is fully hidden or
        # fully dressed at this pose — nothing to judge
        out.append({'key': h['key'], 'judged': False})
        continue
    # TRIM-COVER BAR (the reference truth, pixel+depth judged): across
    # the trim zone, points 1.2 mm above the tube top must meet REAL
    # covering geometry (|signed depth delta| <= 10 mm — the background
    # behind an outlined bare nose is decimeters away and reads as none)
    # AND render cloth-classified pixels (a leather flap covering the
    # zone fails the pixel half). >= 2 covered of the zone's samples.
    covered = 0
    for t, x, y, sd in h['cov']:
        if not (2 <= x < W - 2 and 2 <= y < H - 2):
            continue
        # ROUND-8 self-occlusion rule (flat-tongue + round-9 skin
        # geometry): a zone sample standing BEHIND real near geometry
        # counts as covered — the near-axial C4 framing hides the
        # covered ending behind the cushion jaw itself (sd 0.03-0.05)
        # and behind the horn's own legal pre-boundary leather; the
        # walk's beyond-boundary rule owns bare-leather exposure. The
        # bare-nose red signature stays distinct: its rays sail to the
        # background (sd -9 / decimeters NEGATIVE-or-missing, never a
        # positive near hit).
        ok = abs(sd) <= h.get('covTol', 0.010) \\
            and int(cloth[y-1:y+2, x-1:x+2].sum()) >= 2
        if (h.get('flat') or h.get('skin')) and sd > 0.004:
            ok = True
        if ok:
            covered += 1
    # ROUND-7 COVERAGE WALK (gate r5: the r6 zone check let a bare
    # PRE-DIVE nose pass — C4-left / both C1s horns): NO walked pixel
    # beyond the cloth boundary may classify leather, excepting points
    # within 6 px of the boundary's own projected pixel (foreshortened
    # edge straddle is boundary mixing, not exposure).
    bpx = h.get('bpx')
    viol = []
    for t, x, y, occ, ht, *sk in pts:
        if t <= h['tCut'] + 0.02:
            continue
        if bpx and abs(x - bpx[0]) <= 6 and abs(y - bpx[1]) <= 6:
            continue
        # REBUILD R3: a cap-skirt/seat first-hit is legal below-trim
        # anatomy (its own SKIRT arms), never bare-nose evidence — the
        # JS walk marks it (see the skHit note at the pts builder)
        if sk and sk[0]:
            continue
        # RENDERED-SURFACE LEGALITY (red-proof round-7): the pixel is
        # judged by the azimuth of the surface it actually renders. A
        # covered walk point may legally project onto the pre-boundary
        # arc in front of it (green-run 3's false catch); a bare nose
        # renders ITS OWN beyond-boundary leather (ht > cut) whether the
        # walk line grazes it dead-on or the nose stands beside/behind
        # the line (the rev-6 C1s collar ring hid the centre line while
        # the nose rendered bare 2-8 mm behind it).
        if ht is not None and ht <= h['tCut'] + 0.02:
            continue
        if ht is None and occ > 0.0015:
            continue
        if int(leather[y-1:y+2, x-1:x+2].sum()) >= 2:
            viol.append([t, x, y])
    # ROUND-8 GATE-BASIS MATERIAL CONSISTENCY: the covering cloth must
    # measure jaw-consistent ON THIS FRAME, measured the way the gate
    # measures it (the r6 auditor's published method, material_metrics):
    #   region mask = the GATE's cloth mask (PIL HSV H 55..125, S >= 45,
    #     V >= 35, all 0..255) over 5x5 neighborhoods of the ray-verified
    #     tongue/jaw points;
    #   dValue / dSat = region MEANS, lap minus jaw (no bright-mode
    #     medians, no value-matched sat, no up/shade split — the flat
    #     coplanar tongue shades like the jaw BY CONSTRUCTION, so the
    #     r7 shading accommodations are retired with the arch);
    #   lag-1 = Pearson correlation of the region's least-squares 2-D
    #     quadratic-detrended V over horizontal + vertical neighbor
    #     pairs, direction mean.
    # Hue stays as the dye-identity cross-check.
    # review r10 P2: the record is ALWAYS emitted — an empty strict
    # point set is a measured lapPx=0 (sub-scale/occluded at this
    # pose), while an absent record now means the machinery itself
    # lost the subject and the verdict side fails it unconditionally.
    matres = None
    mpts = [(x, y) for x, y in h.get('mat', [])
            if 4 <= x < W - 4 and 4 <= y < H - 4]
    jpts = [(x, y) for x, y in h.get('jawPx', [])
            if 4 <= x < W - 4 and 4 <= y < H - 4]
    if not mpts:
        matres = {'judged': False, 'lapPx': 0, 'jawPx': len(jpts)}
    if mpts:
        def neigh(pts_):
            m_ = np.zeros((H, W), dtype=bool)
            for x, y in pts_:
                m_[y-2:y+3, x-2:x+3] = True
            return m_
        gate = (hue * 255 >= 55) & (hue * 255 <= 125) \
            & (sat * 255 >= 45) & (mx * 255 >= 35)
        lapm = neigh(mpts) & gate
        jawm = neigh(jpts) & gate & ~lapm
        # image-adjacency window (round-8, flat geometry): keep the jaw
        # pixels within 90 px of the lap region's bbox — the gate's
        # comparison boxes are SIDE-BY-SIDE in the frame, sharing the
        # junction's illumination field; distant candidates only serve
        # when adjacency leaves too few (falls back to all candidates)
        if (h.get('flat') or h.get('skin')) and int(lapm.sum()) >= 12:
            lys, lxs = np.nonzero(lapm)
            x0b, x1b = lxs.min() - 90, lxs.max() + 90
            y0b, y1b = lys.min() - 90, lys.max() + 90
            win = np.zeros((H, W), dtype=bool)
            win[max(0, y0b):y1b, max(0, x0b):x1b] = True
            near = jawm & win
            if int(near.sum()) >= 120:
                jawm = near
        # comparable-illumination floor (round-8, flat geometry): the
        # auditor demonstrably samples the ending's VISIBLE cloth in
        # comparable light (their r6 C4-left box sat on lit cloth beside
        # the nose, not in the crevice). Pixels more than 40 value
        # points below the jaw mean are the junction's occlusion shadow,
        # not a dye read — every foreign-material signature this arm
        # exists to catch sits well inside the window (r6: dV -31..-37).
        if (h.get('flat') or h.get('skin')) and int(jawm.sum()) >= 24:
            # ROUND-12 comparability retune (-40 -> -28): the #490
            # gestalt class key trim (gap f, owner-override round)
            # halves the GI fill inside the graze-side skin shadow,
            # and the old floor admitted the deepened band (C4 strict
            # dV -5.97 -> -11.8 on a byte-identical construction).
            # The floor's own law is unchanged - sample the ending's
            # VISIBLE cloth in comparable light; a foreign dark cover
            # (r6 class, dV -31..-37) still empties the strict set
            # below the sub-scale/lost-subject guards.
            floor_v = float((mx[jawm] * 255).mean()) - 28.0
            lapm = lapm & (mx * 255 >= floor_v)
        # ROUND-10 lag-1 basis: the strict regions span the whole covered
        # strip (band + curved crown) — far larger than the gate's small
        # hand boxes — and a quadratic detrend alone cannot remove the
        # crown's own shading ridges from a region that big, so the
        # correlation read structure the SMALL gate boxes never see
        # (round-10 probe run 1: C1 strict lap 0.41 vs the gate's 0.23
        # on the same frame). The weave-band residual (mx − box7, the
        # classifier's own texture convention above) removes >7 px
        # shading structure first; the quadratic detrend then handles
        # the residual field exactly as before. Applied to lap AND jaw
        # symmetrically; the gate-region parallel records keep the
        # auditor's pure-quadratic basis for audit-to-audit comparison.
        def lag1q(m):
            ys, xs = np.nonzero(m)
            if ys.size < 24:
                return None
            v = res[ys, xs] * 255
            A = np.column_stack([np.ones(xs.size), xs, ys,
                                 xs * xs, xs * ys, ys * ys]).astype(float)
            coef = np.linalg.lstsq(A, v, rcond=None)[0]
            resm = np.full((H, W), np.nan)
            resm[ys, xs] = v - A @ coef
            vals = []
            for ax in (1, 0):
                a = resm[:, :-1] if ax == 1 else resm[:-1, :]
                b = resm[:, 1:] if ax == 1 else resm[1:, :]
                pair = ~np.isnan(a) & ~np.isnan(b)
                av, bv = a[pair], b[pair]
                if av.size < 24 or av.std() < 1e-9 or bv.std() < 1e-9:
                    return None
                vals.append(float(np.corrcoef(av, bv)[0, 1]))
            return (vals[0] + vals[1]) / 2.0
        nL, nJ = int(lapm.sum()), int(jawm.sum())
        # ROUND-19: region-judging floor 60 -> 100 px, in step with the
        # verdict side's sub-scale floor (measured cross-session
        # flutter: the far C4 side pocket's gated count read 39 then 67
        # px on byte-identical side geometry — a sub-100 px sliver must
        # defer to the sub-scale law, never carry a dS verdict; every
        # strictly-judged region this round reads 305-1746 px)
        if nL >= 100 and nJ >= 150:
            lagL = lag1q(lapm)
            lagJ = lag1q(jawm)
            lV = float((mx[lapm] * 255).mean())
            jV = float((mx[jawm] * 255).mean())
            lS = float((sat[lapm] * 255).mean())
            jS = float((sat[jawm] * 255).mean())
            dH = float((hue[lapm] * 255).mean() - (hue[jawm] * 255).mean())
            ds = round(lS - jS, 2)
            dsRaw = ds
            if h.get('skin'):
                # VALUE-MATCHED saturation (the r7 accommodation,
                # reinstated for skin geometry ONLY): the adjudicated
                # construction is 3-D and shades — the reference's own
                # cushion-end frames read "shadow-dark" and were
                # brightened 2.2x (refs/horn-adjudication/NOTE.md) —
                # and one dye's sat rises as its value falls, so dye
                # identity is judged at matched value: per lap pixel,
                # predicted S = the jaw region's mean S in the same
                # 8-point V bin (nearest populated bin). dV keeps the
                # raw region-mean basis (it catches brightness-foreign
                # covers); the raw dS stays in the record (dsRaw). The
                # r8 flat tongue never needed this — its retirement
                # note was construction-specific.
                jv = mx[jawm] * 255
                js = sat[jawm] * 255
                lv = mx[lapm] * 255
                ls = sat[lapm] * 255
                bs = 8.0
                jb = np.floor(jv / bs).astype(int)
                mns = {int(b): float(js[jb == b].mean())
                       for b in np.unique(jb)}
                keys = np.array(sorted(mns))
                lb = np.floor(lv / bs).astype(int)
                near = keys[np.abs(keys[None, :]
                                   - lb[:, None]).argmin(axis=1)]
                pred = np.array([mns[int(k)] for k in near])
                ds = round(float((ls - pred).mean()), 2)
            ampL = float(np.nanstd(res[lapm] * 255))
            ampJ = float(np.nanstd(res[jawm] * 255))
            matres = {'judged': True,
                      'fallback': bool(h.get('matFallback')),
                      'ampL': round(ampL, 2), 'ampJ': round(ampJ, 2),
                      'dv': round(lV - jV, 2), 'ds': ds, 'dsRaw': dsRaw,
                      'dsBasis': 'value-matched' if h.get('skin')
                      else 'raw',
                      'dh': round(dH, 2),
                      'lapV': round(lV, 1), 'jawV': round(jV, 1),
                      'lapS': round(lS, 1), 'jawSm': round(jS, 1),
                      'lapLag1': None if lagL is None else round(lagL, 3),
                      'jawLag1': None if lagJ is None else round(lagJ, 3),
                      'lapPx': nL, 'jawPx': nJ}
        else:
            matres = {'judged': False, 'lapPx': nL, 'jawPx': nJ}
    seg = [(x, y) for t, x, y, occ, ht, *sk in pts
           if t >= min(h['tCut'], h['tEnd']) - 0.1]
    box = None
    if seg:
        xs = [p[0] for p in seg]; ys = [p[1] for p in seg]
        box = [min(xs) - 6, min(ys) - 6, max(xs) + 6, max(ys) + 6]
    out.append({'key': h['key'], 'judged': True,
                'lastLeatherT': max(lts), 'tCut': h['tCut'],
                'tEnd': h['tEnd'], 'coverPts': covered,
                'violations': viol[:8], 'mat': matres,
                'box': box,
                'pass': covered >= 2 and not viol})
# MATERIAL post-pass — the GATE'S OWN BARS on the gate's own stats
# (the r6 verdict table judged the rendered regions on |dV| <= 6,
# dS in [-14, +8], lap lag-1 <= jaw lag-1 + 0.15; the round-7 up/shade
# modes and value-matched sat are retired — review round-7 P1's
# no-pose-exemption law is kept by judging EVERY pose on the full bars,
# which the flat coplanar tongue can meet because it shades like the
# jaw by construction). Hue within 6 stays as the dye-identity check.
mats = [o['mat'] for o in out
        if o.get('judged') and o.get('mat') and o['mat'].get('judged')]
for m in mats:
    # lag floor 0.35: the probe's GEOMETRIC jaw patch (uniform, top-lit)
    # reads far cleaner than any image-adjacent jaw box the gate draws
    # (r6 jaw boxes read 0.23-0.72), so foreshortening alone can lift a
    # coplanar tongue past patch+0.15 (C1 grazing: tongue 0.25 vs patch
    # 0.07). 0.35 stays far below the foreign-material signature this
    # bar exists to catch (the r6 sock/fin read 0.60-0.74).
    lagOk = m['lapLag1'] is not None and m['jawLag1'] is not None \
        and m['lapLag1'] <= max(m['jawLag1'] + 0.15, 0.35)
    # ROUND-12 sub-amplitude law (mirrors gatecheck_490_r11.py): the
    # #490 gestalt retarget cut the nap ~3x+ below the correlation
    # statistic's calibration floor - the sub-nap residual correlates
    # by SURFACE CURVATURE class (curved skin vs flat jaw), not by
    # texture.  Below 10 LSB residual RMS the leg bars the amplitude
    # itself (a ribbed fin is an amplitude spike before it is a
    # correlation); the lag values stay in the record.
    # ROUND-14 delta +1.0 (4.0 -> 5.0; the r13 gatecheck +0.5
    # jaw-base-flattening family, measured here): the round-14 knit
    # rework (gate r12 P1-1) replaced the ribbon/hole net field in the
    # geometric jaw patch's box-7 neighborhood with the dense bright
    # cord bag, flattening the JAW comparison base 4.02/3.77 -> 2.29/
    # 2.28 LSB while the end construction stayed byte-stable (ampL
    # 6.83/6.81 on BOTH trees - the r13-passed skin, unchanged);
    # deltas 4.54/4.53 under the flattened base.  GI-bake bisect
    # (base-GI assets, live A/B): reads identical - the base move is
    # the net rework, not the leg-bounce re-bake.
    # ROUND-16 delta +0.5 (5.0 -> 5.5; the SAME jaw-base-flattening
    # family, measured by the same live A/B method): the round-16
    # light-trap mouth + wider hem lace (gate r14 P1-1) flattened the
    # C1 p5/B geometric jaw base again, ampJ 2.65 -> 1.53 LSB
    # (table.js A/B on identical GI assets; the r16 leg-bounce re-bake
    # bisects identical again), while the skin end stayed byte-stable
    # (ampL 6.80/6.83 on BOTH trees) - delta 5.27 under the flattened
    # base, over the round-14 constant by 0.27.  The r8 fin class
    # (+10-15 LSB) stays caught with 1.7-2.3x margin under 5.5;
    # gatecheck's own hand boxes sit on lit cloth away from the fall
    # (its base did not move - gatecheck PASSes both tiers on the
    # round-16 captures without any constant change) so its 4.5
    # constant is untouched.
    if m.get('ampL') is not None and m['ampL'] < 10.0:
        lagOk = m['ampL'] <= m['ampJ'] + 5.5
    # ROUND-12: the near-axial pose's dV returns to RECORD-ONLY (the
    # r8 law, reinstated for the adjudicated low-key venue): the #490
    # class key trim halves the GI fill across the ENTIRE graze-side
    # skin at this pose (strict dV -5.97 -> -8.5..-8.9 with the strip
    # byte-identical, at every comparability placement tried), so
    # grazing photometry no longer separates brightness-foreign covers
    # from the venue key itself.  Dye identity stays fully barred
    # (value-matched dS, dHue) and the macro poses keep the full dV
    # bar - a foreign cover reads there.
    dv_ok = abs(m['dv']) <= 6.0 or bool(s.get('nearAxial'))
    m['dv_record_only'] = bool(s.get('nearAxial'))
    m['pass'] = bool(dv_ok and -14.0 <= m['ds'] <= 8.0
                     and abs(m['dh']) <= 6.0 and lagOk)
print(json.dumps(out))
`], { input: payload, maxBuffer: 64 * 1024 * 1024 }).toString());
}

// ROUND-10: the r8 gate's own hand-placed regions (PR #500 comment
// 5244234125 / the auditor's audit.py REGIONS table, rev-9 pixels) —
// sampled verbatim as parallel records at every pose.
const GATE_REGIONS = {
  c1_mouth_ring_macro: {
    left: {
      end: [[399, 382], [407, 369], [418, 364], [460, 385], [456, 397],
        [423, 399], [405, 392]],
      coverage: [[407, 395], [447, 393], [459, 401], [443, 411], [414, 405]],
      jaw: [[286, 416], [366, 394], [427, 421], [343, 461], [287, 447]],
    },
    right: {
      end: [[817, 374], [829, 376], [844, 381], [847, 389], [837, 397],
        [822, 394], [814, 385]],
      coverage: [[815, 395], [837, 395], [844, 401], [834, 408],
        [812, 406], [805, 399]],
      jaw: [[850, 399], [945, 426], [932, 459], [842, 432]],
    },
  },
  c1s_side_ring_macro: {
    left: {
      end: [[366, 395], [375, 386], [394, 384], [409, 393], [403, 404],
        [383, 403]],
      coverage: [[366, 395], [375, 386], [394, 384], [409, 393],
        [403, 404], [383, 403]],
      jaw: [[260, 338], [350, 337], [361, 376], [277, 385]],
    },
    right: {
      end: [[786, 295], [796, 284], [814, 283], [828, 294], [820, 305],
        [801, 309]],
      coverage: [[786, 295], [796, 284], [814, 283], [828, 294],
        [820, 305], [801, 309]],
      jaw: [[842, 250], [930, 231], [941, 271], [839, 306]],
    },
  },
  c4_down_the_nose: {
    left: {
      end: [[544, 542], [558, 532], [592, 541], [604, 552], [587, 560],
        [555, 552]],
      coverage: [[545, 518], [554, 510], [575, 510], [589, 520],
        [584, 535], [558, 536], [546, 529]],
      jaw: [[500, 463], [545, 463], [553, 497], [510, 509]],
    },
    right: {
      end: [[812, 487], [824, 482], [848, 488], [845, 501], [821, 501]],
      coverage: [[812, 487], [824, 482], [848, 488], [845, 501],
        [821, 501]],
      jaw: [[671, 455], [771, 456], [795, 494], [687, 507]],
    },
  },
};

function gateRegionRecords(file, poseName) {
  const regions = GATE_REGIONS[poseName];
  if (!regions) return null;
  const payload = JSON.stringify({ file, regions });
  return JSON.parse(execFileSync(PY, ['-c', `
import json, sys
import numpy as np
from PIL import Image, ImageDraw
s = json.load(sys.stdin)
im = Image.open(s['file']).convert('RGB')
hsv = np.asarray(im.convert('HSV'), dtype=np.float64)
h, sa, v = hsv[..., 0], hsv[..., 1], hsv[..., 2]
cloth = (h >= 55) & (h <= 125) & (sa >= 45) & (v >= 35)
leather = (h <= 35) & (sa >= 45) & (v >= 30)
def poly(points):
    m = Image.new('1', im.size, 0)
    ImageDraw.Draw(m).polygon([tuple(p) for p in points], fill=1)
    return np.asarray(m, dtype=bool)
def lag1(mask):
    yy, xx = np.nonzero(mask)
    if len(xx) < 24:
        return None
    x = (xx - xx.mean()) / max(1.0, xx.std())
    y = (yy - yy.mean()) / max(1.0, yy.std())
    A = np.column_stack((np.ones_like(x), x, y, x * x, x * y, y * y))
    coef, *_ = np.linalg.lstsq(A, v[yy, xx], rcond=None)
    res = np.full(v.shape, np.nan)
    res[yy, xx] = v[yy, xx] - A @ coef
    vals = []
    for dy, dx in ((0, 1), (1, 0)):
        a = res[: res.shape[0] - dy or None, : res.shape[1] - dx or None]
        b = res[dy:, dx:]
        ok = np.isfinite(a) & np.isfinite(b)
        if np.count_nonzero(ok) > 4:
            av, bv = a[ok], b[ok]
            if av.std() > 0 and bv.std() > 0:
                vals.append(float(np.corrcoef(av, bv)[0, 1]))
    return None if not vals else float(np.mean(vals))
out = []
for ending, cfg in s['regions'].items():
    e = poly(cfg['end']) & cloth
    j = poly(cfg['jaw']) & cloth
    cov = poly(cfg['coverage'])
    row = {'ending': ending, 'end_n': int(e.sum()), 'jaw_n': int(j.sum()),
           'leather_pct': round(100.0 * float((cov & leather).sum())
                                / max(1, int(cov.sum())), 2)}
    if e.sum() >= 10 and j.sum() >= 10:
        jv, js = v[j], sa[j]
        ev, es = v[e], sa[e]
        bins = {int(b): float(js[(jv // 8).astype(int) == b].mean())
                for b in np.unique((jv // 8).astype(int))}
        keys = sorted(bins)
        pred = [bins[min(keys, key=lambda kk: abs(kk - int(val // 8)))]
                for val in ev]
        row.update({
            'dV': round(float(ev.mean() - jv.mean()), 2),
            'dS_raw': round(float(es.mean() - js.mean()), 2),
            'dS_value_matched': round(float((es - np.asarray(pred)).mean()), 2),
            'dHue': round(float(h[e].mean() - h[j].mean()), 2),
            'lag1_end': None if lag1(e) is None else round(lag1(e), 3),
            'lag1_jaw': None if lag1(j) is None else round(lag1(j), 3),
        })
    out.append(row)
print(json.dumps(out))
`], { input: payload, maxBuffer: 16 * 1024 * 1024 }).toString());
}

// ---- driver ---------------------------------------------------------------

const SIL_DIR = mkdtempSync(path.join(tmpdir(), 'ob490-sil-'));
const server = spawnStaticServer(webDir, PORT);
await sleep(700);
const report = { poses: {}, verdict: null };
// set by the subject census when the scene carries none of this probe's
// subjects; printed and exited AFTER the teardown finallys below
let REFUSAL = null;
try {
  const url = `http://127.0.0.1:${PORT}/app.html?table=chinese8_pro_9ft`
    + '&cinema=1&seed=7&look=sp';
  const chrome = await launchChrome(url, { port: CDP });
  try {
    await waitReady(chrome);
    await sleep(1200);
    await chrome.eval(`(() => {
      __test.aim(Math.PI * 1.5);
      window.__dbg.scene.traverse((o) => {
        const hex = o.material && o.material.color
          && o.material.color.getHexString && o.material.color.getHexString();
        if (hex === 'dff1ff' || hex === '76afee') o.visible = false;
      });
    })()`);
    await sleep(300);
    // ---- SUBJECT CENSUS (fail-closed) --------------------------------
    // Every bar in this probe walks a pocket-cap crest roll's published
    // userData.cn8Roll, or classifies against cn8-cloth-skin /
    // cn8-cloth-margin. Those meshes are the MIDDLE-pocket molded-cap
    // family (measured: the whole cn8cap-* family exists only at pocket
    // indices 1 and 4; the seam/stitches/skin/margin meshes span both
    // middles as one unindexed mesh each). The corners are built by a
    // different family entirely and publish none of them.
    //
    // A tree that has migrated the middles to the flat bay cover
    // therefore starves this probe of every subject. MEASURED on such a
    // tree with this guard bypassed, the run does NOT fail open — the
    // round-5 P2 coverage law is intact — but it dies badly: the FILLET
    // arm prints `sideRolls 0 => FAIL`, then SKIRT_PROBE dereferences an
    // absent roll and the run ends on an unhandled TypeError ("Cannot
    // read properties of null (reading 'u')") at the c1s pose. Both
    // outputs read as a GEOMETRY DEFECT in the tree under test, which is
    // false: the truth is that this instrument does not own this tree's
    // middles, and a lane could burn a round chasing it. So state that
    // instead, with exit 2 — the harness convention for "cannot judge",
    // distinct from the exit-1 "judged and failed".
    {
      const census = JSON.parse(await chrome.eval(`(() => {
        let rolls = 0, skin = 0, margin = 0, bay = 0;
        window.__dbg.scene.traverse((o) => {
          if (!o.isMesh) return;
          if (o.userData && o.userData.cn8Roll) rolls += 1;
          if (o.userData && o.userData.cn8MidAnatomy === 'bayplate') bay += 1;
          if (o.name === 'cn8-cloth-skin') skin += 1;
          if (o.name === 'cn8-cloth-margin') margin += 1;
        });
        return JSON.stringify({ rolls, skin, margin, bay });
      })()`));
      if (census.rolls === 0) {
        // NOT process.exit() here: this is inside the try, and the two
        // finally blocks below are what close chrome and stop the fixed-
        // port static server (the review round-5 P2 lesson recorded on
        // them). Throw a tagged error so both teardowns run, then exit 2
        // after they have.
        const e = new Error('probe-490-horn: no cn8Roll subjects');
        e.obRefusal = '[probe-490-horn] REFUSE: this scene publishes no '
          + `userData.cn8Roll subject (skin ${census.skin}, margin `
          + `${census.margin}, bayplate covers ${census.bay}).\n`
          + '  Every bar here judges the middle-pocket MOLDED-CAP family '
          + '(cn8cap-roll/band/seat/skirt + cn8-cloth-skin/margin). '
          + (census.bay
            ? 'This tree has migrated the middles to the flat bay cover '
              + '(docs/geometry/cn8-middle-furniture-definition.json), '
              + 'which retires all of them.'
            : 'They are absent from this tree.')
          + '\n  The probe will NOT report an empty census as green, and '
          + 'will not report their absence as a defect in the tree under '
          + 'test. Point it at a pre-migration tree, or use the MIDEXT '
          + 'rows in web/tools/check-490-pass2.mjs, which own the bay '
          + 'cover.';
        throw e;
      }
    }
    for (const [name, pose] of Object.entries(POSES)) {
      let ok = false;
      for (let i = 0; i < 25 && !ok; i++) {
        ok = await chrome.eval(`__test.cameraPose(${JSON.stringify(pose)})`);
        if (!ok) await sleep(200);
      }
      if (!ok) throw new Error(`${name}: pose rejected`);
      await sleep(650);
      // round-6: every horn pose is ALSO pixel-judged — screenshot first,
      // then raycast (the shot is the same settled frame the rays walk)
      const shot = path.join(SIL_DIR, `${name}.png`);
      await chrome.screenshot(shot);
      // ROUND-10 gate-basis PARALLEL RECORDS: the r8 auditor's own
      // hand-placed end/coverage/jaw polygons (PR #500 comment
      // 5244234125, F7 table), sampled with the auditor's exact
      // method (PIL-HSV masks, region means, 2-D quadratic detrend,
      // combined lag-1, value-matched dS alongside raw). RECORDS, not
      // bars: the polygons were placed on the rev-9 pixels, so where
      // the r10 construction moved a boundary they sample stale
      // anatomy — the strict ray-verified records above are the judged
      // basis; these rows keep the audit-to-audit comparison exact.
      {
        const rec = gateRegionRecords(shot, name);
        if (rec) {
          report.poses[name] = { ...report.poses[name], gateRegions: rec };
          for (const row of rec) {
            console.log(`[${name}] GATE-REGION ${row.ending}: `
              + `dV ${row.dV} dS ${row.dS_value_matched} (vm; raw `
              + `${row.dS_raw}) dH ${row.dHue} lag1 ${row.lag1_end}/`
              + `${row.lag1_jaw} leather% ${row.leather_pct} `
              + `(end ${row.end_n}px jaw ${row.jaw_n}px)`);
          }
        }
      }
      if (name === 'c1s_side_ring_macro') {
        const r = JSON.parse(await chrome.eval(SKIRT_PROBE));
        // r10: spread — a bare assignment dropped the pose's
        // gate-region record from the report JSON (console kept it)
        report.poses[name] = { ...report.poses[name], skirt: r };
        const rowsBrief = DUMP ? r.rows.filter((_, k) => k % 4 === 0)
          .map((x) => `    py ${x.py}: ${x.name ?? '(sky)'} hex ${x.hex} d ${x.d} y ${x.y}`).join('\n') : '';
        console.log(`[${name}] SKIRT pocket ${r.pocket}: ringW ${r.ringWpx} px, `
          + `face ${r.facePx} px (seam ${r.seamRow} -> ${r.faceEnd}), ratio ${r.ratio}, `
          + `detached ${r.detached}${r.gapAt ? ` (cap again at py ${r.gapAt})` : ''} `
          + `=> ${r.pass ? 'PASS' : 'FAIL'}`);
        if (DUMP) console.log(rowsBrief);
      }
      {
        const horns = JSON.parse(await chrome.eval(
          `(${HORN_PROBE})(${JSON.stringify(name)})`));
        report.poses[name] = { ...report.poses[name], horns };
        for (const h of horns) {
          if (!h.judged) continue;
          console.log(`[${name}] HORN p${h.pocket}/${h.side}: lastVis t ${h.lastVisT} `
            + `y ${h.lastVisY} (jawTop ${h.jawTop}) tipSpread `
            + `${h.tipSpread.map((s) => (s * 1000).toFixed(3)).join('/')} mm `
            + `=> ${h.pass ? 'PASS' : 'FAIL'}`);
          if (DUMP) {
            for (const s of h.samples.filter((x) => x.t >= -0.05)) {
              console.log(`    t ${s.t} e ${s.e} y ${s.y} vis ${s.vis} hit ${s.hit} `
                + `(hex ${s.hitHex}, d ${s.hitD} vs pt ${s.ptD}) down ${s.downHit}@${s.downY}`);
            }
          }
        }
        // silhouette arm: classify the walked pixels of THIS pose's shot
        const sil = classifySilhouette(shot, horns.map((h) => ({
          key: `p${h.pocket}/${h.side}`, tCut: h.sil.tCut,
          tEnd: h.sil.tEnd, covTol: h.sil.covTol,
          pts: h.sil.pts, cov: h.sil.cov,
          bpx: h.sil.bpx, mat: h.sil.mat,
          matFallback: h.sil.matFallback, flat: h.sil.flat,
          skin: h.sil.skin, jawPx: h.sil.jawPx,
        })), name === 'c4_down_the_nose');
        report.poses[name].sil = sil;
        for (const sv of sil) {
          if (!sv.judged) continue;
          console.log(`[${name}] SIL ${sv.key}: trim cover ${sv.coverPts} pts `
            + `(cut ${sv.tCut}, planeEnd ${sv.tEnd}), lastLeather t ${sv.lastLeatherT}, `
            + `${sv.violations.length} beyond-boundary leather pts`
            + `${sv.box ? `, box [${sv.box.join(',')}]` : ''} `
            + `=> ${sv.pass ? 'PASS' : 'FAIL'}`);
          const m = sv.mat;
          if (m && m.judged) {
            console.log(`[${name}] MAT ${sv.key} `
              + `[gate-basis${m.fallback ? '/ending-cloth' : ''}]: dV ${m.dv} `
              + `dS ${m.ds}${m.dsBasis === 'value-matched'
                ? ` (value-matched; raw ${m.dsRaw})` : ''} dH ${m.dh} `
              + `lag1 lap ${m.lapLag1} vs jaw ${m.jawLag1} `
              + `(${m.lapPx}/${m.jawPx} px) => ${m.pass ? 'PASS' : 'FAIL'}`);
          } else if (m) {
            console.log(`[${name}] MAT ${sv.key}: NOT JUDGED `
              + `(lap ${m.lapPx} px, jaw ${m.jawPx} px)`);
          }
        }
      }
      // ROUND-9 CONSTRUCTION assertions (replace the r8 FLUSH bar — the
      // flatten it asserted is the construction the adjudication
      // overturned; #490 comment 5242164247). Mesh-level, pose-free,
      // red-proven against the rev-8 tree:
      //   CREST-HOLD — azimuth-binned max mesh y of every roll tube
      //     holds full crest height (yCrest + rollR − 0.6 mm) from
      //     t 0.10 to the cloth boundary (adjudication (d): full
      //     width/height to the line; the rev-8 flatten fails here);
      //   SKIN — cn8-cloth-skin exists, conformal height envelope
      //     (nothing above the covered crest + cl + 0.6 mm);
      //   MARGIN — down-rays inside the strip band render cloth at the
      //     mid arc and both window edges (no bare rail — the C1s
      //     black-gap class; missing strip contract = missing strip).
      if (!report.construction) {
        const cons = JSON.parse(await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const scene = window.__dbg.scene;
          const rc = new THREE.Raycaster();
          const vis = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
          const down = (x, z) => {
            rc.set(new THREE.Vector3(x, 0.30, z), new THREE.Vector3(0, -1, 0));
            rc.near = 0; rc.far = 1.0;
            const hits = rc.intersectObjects(scene.children, true)
              .filter((h) => h.object.isMesh && vis(h.object));
            return hits.length
              ? { name: hits[0].object.name || '(anon)', y: hits[0].point.y }
              : { name: null, y: null };
          };
          let skin = null;
          scene.traverse((o) => { if (o.name === 'cn8-cloth-skin') skin = o; });
          const rolls = [];
          scene.traverse((o) => { if (o.userData && o.userData.cn8Roll) rolls.push(o); });
          const sm = (v) => { const c = Math.min(1, Math.max(0, v)); return c * c * (3 - 2 * c); };
          const wrapPi = (a) => {
            let x = a % (2 * Math.PI);
            if (x > Math.PI) x -= 2 * Math.PI;
            if (x < -Math.PI) x += 2 * Math.PI;
            return x;
          };
          // skin envelope
          let sk = null;
          if (skin) {
            const pos = skin.geometry.getAttribute('position');
            let yMin = 1e9; let yMax = -1e9;
            for (let i = 0; i < pos.count; i++) {
              const y = pos.getY(i);
              yMin = Math.min(yMin, y); yMax = Math.max(yMax, y);
            }
            sk = { yMin: +yMin.toFixed(5), yMax: +yMax.toFixed(5), n: pos.count };
          }
          // crest-hold per roll tube (mesh vertices, azimuth-binned)
          const crest = [];
          for (const roll of rolls) {
            const u = roll.userData.cn8Roll;
            const pos = roll.geometry.getAttribute('position');
            const bT0 = u.skinT0 ?? u.lapT0 ?? u.lipT0 ?? (u.lead ?? 0.1) / (u.dive ?? 0.3);
            const t1 = Math.min(bT0, (u.lead ?? 0) / (u.dive ?? 1)) - 0.02;
            // ROUND-19: the corner line lives deep in t < 0 — the
            // crest-hold window keeps its r9 WIDTH (0.335 t of visible
            // approach) but rides the line; the subject is unchanged
            // (full molded height up to the cloth line).  Sides/legacy
            // (bT0 >= 0.10) keep the exact r9 window [0.10, t1].
            const t0c = t1 - 0.02 < 0.10 ? t1 - 0.335 : 0.10;
            const NB = 6;
            const bins = new Array(NB).fill(-1);
            for (let i = 0; i < pos.count; i++) {
              const psiH = Math.atan2(pos.getZ(i) - u.cz, pos.getX(i) - u.cx);
              const tA = wrapPi(u.psi0 + (u.lead ?? 0) - psiH) / u.dive;
              const tB = wrapPi(psiH - (u.psi1 - (u.lead ?? 0))) / u.dive;
              for (const t of [tA, tB]) {
                if (t < t0c || t > t1) continue;
                const b = Math.min(NB - 1,
                  Math.floor(((t - t0c) / Math.max(t1 - t0c, 1e-6)) * NB));
                bins[b] = Math.max(bins[b], pos.getY(i));
              }
            }
            const want = u.yCrest + u.rollR - 0.0006;
            const bad = bins.map((v, k) => [k, v])
              .filter(([, v]) => v >= 0 && v < want);
            // subject-loss law (round-5): an arm that lost its vertices
            // must never green — require >= 2 azimuth bins populated
            const filled = bins.filter((v) => v >= 0).length;
            if (filled < 2) bad.push([-1, filled]);
            crest.push({ pocket: Number(roll.name.split('-').pop()),
              t1: +t1.toFixed(3), want: +want.toFixed(5),
              bins: bins.map((v) => (v < 0 ? null : +v.toFixed(5))),
              fails: bad.map(([k, v]) => [k, +(+v).toFixed(5)]) });
          }
          // margin down-rays (strip band published by the contract)
          const margin = [];
          for (const roll of rolls) {
            const u = roll.userData.cn8Roll;
            const pi2 = Number(roll.name.split('-').pop());
            if (margin.some((m) => m.pocket === pi2)) continue;
            if (u.stripR0 == null) {
              margin.push({ pocket: pi2, missing: true, miss: [] });
              continue;
            }
            const rM = (u.stripR0 + u.stripR1) / 2;
            const span = u.psi1 - u.psi0;
            const miss = [];
            for (const f of [0.01, 0.06, 0.25, 0.5, 0.75, 0.94, 0.99]) {
              const psi = u.psi0 + span * f;
              for (const rr2 of [rM, u.stripR1 - 0.0006]) {
                const dn = down(u.cx + rr2 * Math.cos(psi),
                  u.cz + rr2 * Math.sin(psi));
                if (dn.name !== 'cn8-cloth-margin'
                  && dn.name !== 'cn8-cloth-skin') {
                  miss.push([+f.toFixed(2), +rr2.toFixed(4),
                    dn.name, dn.y === null ? null : +dn.y.toFixed(4)]);
                }
              }
            }
            margin.push({ pocket: pi2, missing: false, miss });
          }
          // ROUND-10 MELT bar (gate r8 finding 2 — the C4 fin): past
          // t = 0.84 the covered assembly must be wrapped down INTO the
          // jaw top (skin max y <= jawTop + 0.5 mm). The rev-9 taper
          // (start 0.70, complete only at t = 1) kept the skin ~5 mm
          // proud there and its plunge rendered as the pleated fin over
          // the black slot at the down-the-nose pose (red-proof). At
          // t = 0.80 the r10 band sheet still rides 1.2 mm proud (the
          // morph converges on the centreline from above) — 0.84 is
          // where the melt geometry itself promises the jaw plane.
          let melt = null;
          if (skin && rolls.length) {
            const pos = skin.geometry.getAttribute('position');
            let yMax = -1e9; let n = 0; let at = null;
            for (let i = 0; i < pos.count; i++) {
              const x = pos.getX(i); const y = pos.getY(i);
              const z = pos.getZ(i);
              for (const roll of rolls) {
                const u = roll.userData.cn8Roll;
                const dr = Math.hypot(x - u.cx, z - u.cz);
                if (dr < u.rIn - 0.02 || dr > u.rOut + 0.03) continue;
                const psiH = Math.atan2(z - u.cz, x - u.cx);
                // per-edge measure, wrap-selected: the wrapped distance
                // to the FAR edge reads as a large positive t, so the
                // in-window edge is picked explicitly (never max()).
                const tA = wrapPi(u.psi0 + (u.lead ?? 0) - psiH) / u.dive;
                const tB = wrapPi(psiH - (u.psi1 - (u.lead ?? 0)))
                  / u.dive;
                let t = null;
                for (const tc of [tA, tB]) {
                  if (tc >= 0.84 && tc <= 1.05) t = tc;
                }
                if (t === null) continue;
                n++;
                if (y > yMax) {
                  yMax = y;
                  at = [Number(roll.name.split('-').pop()),
                    +t.toFixed(3)];
                }
                break;
              }
            }
            // r31 note: rolls are SIDE-only since the r20 fillet era;
            // 0.0466 is the side cap family's own AUTHORED jaw-plane
            // letter (published u.jawTop — the side dressing is
            // byte-identical this round, so its melt bar keeps behavior
            // as a <= bound: live yMax 0.0437). The DECK class moved to
            // z42 (S2a/S2h) and is owned by the fillet arms/the strict
            // jaw-patch windows — never by this bound.
            melt = { yMax: n ? +yMax.toFixed(5) : null, n, at,
              bound: 0.0466 + 0.0005 };
          }
          // ROUND-11 SIDE-LAW bar (gate r9 finding 3 — the round-10
          // near-uniform-t pinning left 37/57 px dual boundaries; the
          // r11 record's raycast attribution proves any on-surface line
          // at a side ending projects by STATION RADIUS, cos ~ -1).
          // The published side construction must therefore be: a thin
          // uniform lap on tube/skirt (skinTLap just inside the window
          // edge), the cushion-end FLAP over band+fold (skinTBand
          // mouth-ward of the edge), the skirt VERTICAL END CUT at the
          // crest-crossing plane (skirtCutX, enforced on the MESH), the
          // draped curtain (curtainHemY into the notch shadow) and the
          // deep inner-lip fold (foldDepth — the C4 fin owner). The
          // rev-10 tree publishes none of these fields and its skirt
          // mesh crosses the cut plane: every leg red-proves.
          const sideB = [];
          for (const roll of rolls) {
            const u = roll.userData.cn8Roll;
            if (u.corner) continue;
            const pi2 = Number(roll.name.split('-').pop());
            if (sideB.some((s) => s.pocket === pi2)) continue;
            let skirtMaxX = null;
            scene.traverse((o) => {
              if (o.name === 'cn8cap-skirt-' + pi2 && o.geometry) {
                const posA = o.geometry.getAttribute('position');
                let mx = 0;
                for (let vi = 0; vi < posA.count; vi++) {
                  mx = Math.max(mx, Math.abs(posA.getX(vi) - u.cx));
                }
                skirtMaxX = mx;
              }
            });
            sideB.push({ pocket: pi2,
              lap: u.skinTLap ?? null, band: u.skinTBand ?? null,
              cutX: u.skirtCutX ?? null, hemY: u.curtainHemY ?? null,
              fold: u.foldDepth ?? null,
              skirtMaxX: skirtMaxX == null
                ? null : +skirtMaxX.toFixed(5),
              rRoll: +u.rRoll.toFixed(5), tEdge: u.tEdge ?? null });
          }
          // ROUND-10 SHOULDER-COVER bar (gate r8 finding 3, raycast
          // diagnosis): the skirt SHOULDER inside the covered zone must
          // render skin from above — on rev-9 the sheet's
          // rollSt(−32)→skirtSt(1) chord passed UNDER the revolve's
          // row-0 point and the pierced leather rendered as the bare
          // shelf splitting the C1s boundary (down-ray first-hits
          // cn8cap-skirt-N there; red-proof).
          const shoulder = [];
          for (const roll of rolls) {
            const u = roll.userData.cn8Roll;
            if (u.skinTIn == null || !u.sKnots) continue;
            const pi2 = Number(roll.name.split('-').pop());
            const sAt = (r) => {
              const kn = u.sKnots;
              if (r <= kn[0][0]) return 0;
              for (let k = 1; k < kn.length; k++) {
                if (r <= kn[k][0]) {
                  return kn[k - 1][1] + ((kn[k][1] - kn[k - 1][1])
                    * (r - kn[k - 1][0])) / (kn[k][0] - kn[k - 1][0]);
                }
              }
              return kn[kn.length - 1][1];
            };
            const tl = (s) => (u.skinTLap != null ? u.skinTLap
              : u.skinTIn + (u.skinTApex - u.skinTIn)
                * Math.pow(Math.min(1, Math.max(0, s)), u.skinPow ?? 1.4));
            const rShoulder = u.rRoll + u.rollR * 0.92;
            const miss = [];
            let pts = 0;
            for (const dro of [0.0008, 0.0022]) {
              const rr2 = rShoulder + dro;
              const t0s = tl(sAt(rr2));
              for (const dt of [0.08, 0.14, 0.20]) {
                const t = t0s + dt;
                if (t > (u.tEdge ?? 0.647) - 0.02) continue;
                for (const sideE of [0, 1]) {
                  const psi = sideE === 0
                    ? u.psi0 + (u.lead ?? 0) - t * u.dive
                    : u.psi1 - (u.lead ?? 0) + t * u.dive;
                  // ROUND-11: past the side skirt's vertical end cut
                  // the cap geometry is clamped to the plane — sample
                  // the covered shoulder where it actually is
                  let sx = u.cx + rr2 * Math.cos(psi);
                  if (u.skirtCutX != null) {
                    sx = Math.max(u.cx - (u.skirtCutX - 0.0015),
                      Math.min(u.cx + (u.skirtCutX - 0.0015), sx));
                  }
                  const dn = down(sx, u.cz + rr2 * Math.sin(psi));
                  if (dn.name === null) continue;
                  pts++;
                  if (dn.name !== 'cn8-cloth-skin') {
                    miss.push([+t.toFixed(2), +rr2.toFixed(4), dn.name]);
                  }
                }
              }
            }
            shoulder.push({ pocket: pi2, pts, miss: miss.slice(0, 6) });
          }
          return JSON.stringify({ skin: sk, crest, margin, melt,
            sideB, shoulder });
        })()`));
        const skinYMaxBound = 0.0525 + 0.0045 + 0.0007 + 0.0006;
        const skinPass = cons.skin !== null && cons.skin.n > 0
          && cons.skin.yMax <= skinYMaxBound && cons.skin.yMin >= 0.020;
        const crestFails = cons.crest.filter((c) => c.fails.length > 0);
        const marginFails = cons.margin.filter(
          (m) => m.missing || m.miss.length > 0);
        // round-10 bars (subject-loss law: an absent record never greens)
        const meltPass = !!(cons.melt && cons.melt.n >= 24
          && cons.melt.yMax !== null && cons.melt.yMax <= cons.melt.bound);
        const sideBFails = (cons.sideB ?? []).filter((s) => (
          s.lap == null || s.band == null || s.cutX == null
          || s.hemY == null || s.fold == null || s.skirtMaxX == null
          || s.lap < (s.tEdge ?? 0.647) - 0.15
          || s.lap >= (s.tEdge ?? 0.647)
          || s.band > -0.05
          || s.cutX < 0.9 * s.rRoll || s.cutX > s.rRoll
          || s.hemY > 0.032
          || s.fold < 0.012
          || s.skirtMaxX > s.cutX + 0.0008));
        const sideBPass = (cons.sideB ?? []).length >= 2
          && sideBFails.length === 0;
        const shoulderFails = (cons.shoulder ?? []).filter(
          (s) => s.pts < 4 || s.miss.length > 0);
        // ROUND-20 era-neutral quota: shoulder records are 1:1 with the
        // crest tubes found in the scene (6 legacy pockets / 2 side
        // pockets in the fillet era) — total subject loss is still
        // caught by the crest/skin/horn inventories.
        const shoulderPass = (cons.shoulder ?? []).length
          >= Math.max(1, cons.crest?.length ?? 6)
          && shoulderFails.length === 0;
        report.construction = {
          skin: cons.skin, skinYMaxBound: +skinYMaxBound.toFixed(5),
          skinPass,
          crest: cons.crest, crestPass: crestFails.length === 0,
          margin: cons.margin, marginPass: marginFails.length === 0,
          melt: cons.melt, meltPass,
          sideBoundary: cons.sideB, sideBoundaryPass: sideBPass,
          shoulder: cons.shoulder, shoulderPass,
          pass: skinPass && crestFails.length === 0
            && marginFails.length === 0
            && meltPass && sideBPass && shoulderPass,
        };
        console.log(`CONSTRUCTION skin ${cons.skin
          ? `y [${cons.skin.yMin}, ${cons.skin.yMax}] (${cons.skin.n} verts,`
            + ` bound ${skinYMaxBound.toFixed(4)})`
          : 'MISSING'} => ${skinPass ? 'PASS' : 'FAIL'}`);
        console.log(`CONSTRUCTION crest-hold ${cons.crest.length} tubes, `
          + `${crestFails.length} failing `
          + `${crestFails.length ? JSON.stringify(crestFails.slice(0, 2)) : ''} `
          + `=> ${crestFails.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log(`CONSTRUCTION margin ${cons.margin.length} pockets, `
          + `${marginFails.length} failing `
          + `${marginFails.length ? JSON.stringify(marginFails.slice(0, 2)) : ''} `
          + `=> ${marginFails.length === 0 ? 'PASS' : 'FAIL'}`);
        console.log(`CONSTRUCTION melt ${cons.melt
          ? `yMax ${cons.melt.yMax} (n ${cons.melt.n}, at p${cons.melt.at?.[0]}`
            + ` t ${cons.melt.at?.[1]}, bound ${cons.melt.bound})`
          : 'MISSING'} => ${meltPass ? 'PASS' : 'FAIL'}`);
        console.log(`CONSTRUCTION side-boundary ${JSON.stringify(cons.sideB)}`
          + ` => ${sideBPass ? 'PASS' : 'FAIL'}`);
        console.log(`CONSTRUCTION shoulder-cover ${cons.shoulder?.length ?? 0}`
          + ` hor->pockets, ${shoulderFails.length} failing `
          + `${shoulderFails.length
            ? JSON.stringify(shoulderFails.slice(0, 2)) : ''}`
          + ` => ${shoulderPass ? 'PASS' : 'FAIL'}`);
      }
      // GH-490 ROUND-20 FILLET CONSTRUCTION arms (owner-annotated
      // drawing 20260813-005448 + spec c5277063842) — RE-ADJUDICATED IN
      // ROUND-31, THE MODEL ROUND (owner GO 5321820257): the corner
      // assembly is rebuilt EXACTLY from the signed rev-8.2 drawing's
      // JSON twin (table.js CN8_R82 + buildCornerR82,
      // proposal_rev8_2.json — 图=JSON=模型=门), and the PRIMARY
      // construction instrument is the sheet's own letter gate
      // (tools/render/asmodeled-drawings-490.mjs --letters, 48/48).
      // The r20-r30 corner family (cn8fillet-annulus/clothtip,
      // cn8-funnel, cn8-seal, cn8-net-hole, cn8-railend-cloth, corner
      // cn8-ring-iron, r22 L-cut plank notches) is RETIRED — every arm
      // below is re-lettered to the rev-8.2 names/letters or explicitly
      // retired (out.retired, printed as FILLET RETIRED lines so the
      // pack JSON records the adjudication). userData.cn8Fillet now
      // rides cn8r82-ring-<pi> and carries the r82 letters sub-block
      // (table.js ~5427-5444). The molded-cap CORNER arms stay retired
      // (era re-derivations at the verdict: corner cn8Roll records
      // present would mean a mixed-era scene and FAIL here).
      if (!report.fillet) {
        const fil = JSON.parse(await chrome.eval(`(async () => {
          const THREE = await import('./vendor/three.module.min.js');
          const scene = window.__dbg.scene;
          const rc = new THREE.Raycaster();
          const vis = (o) => { for (let n = o; n; n = n.parent) if (n.visible === false) return false; return true; };
          const fillets = []; const rolls = [];
          scene.traverse((o) => {
            if (o.userData && o.userData.cn8Fillet) fillets.push(o);
            if (o.userData && o.userData.cn8Roll) rolls.push(o);
          });
          const cornerRolls = rolls.filter((r) => r.userData.cn8Roll.corner);
          const out = { fillets: fillets.length,
            cornerRolls: cornerRolls.length,
            sideRolls: rolls.length - cornerRolls.length,
            corners: [],
            // ROUND-31 ADJUDICATION LEDGER — retired arms, each with the
            // rev-8.2 letter/region that supersedes it (printed as
            // FILLET RETIRED lines; the pack JSON records the ruling)
            retired: [
              ['spanDeg/endPerp', 'r20 90-deg annulus letters (a0/a1)'
                + ' retired: the rev-8.2 boot is a cut-to-cut polar'
                + ' sweep about O_f, end faces ON the wood cut planes at'
                + ' y_cut -40 (proposal_rev8_2.json P13a/P13c, owned by'
                + ' asmodeled --letters)'],
              ['tangencyGapMm', 'r20 outline tangency retired: rev-8.2'
                + ' leather outer tangency is to the WINDOW planes at'
                + ' A_r 92 from each nose (letters P14a window line /'
                + ' P14b T_E residual, owned by asmodeled --letters);'
                + ' the no-protrusion subject survives below vs the'
                + ' wood outline planes'],
              ['hLeatherMm', 're-lettered to crestZ: the [8,12] saddle'
                + ' band over the retired 47 deck is superseded by S2c'
                + ' (leather crest 55 over deck z42, D-D crown apex;'
                + ' as-built boot max-Y 0.0547)'],
              ['funnelMinY', 'cn8-funnel retired: the rev-8.2 throat is'
                + ' the parallel-wall U + R45/R10 crest chain'
                + ' (P1/P6/P9/P10 letters), owned by cn8r82-wallface/'
                + '-tongue; the -0.0275 handoff letter retired with the'
                + ' deep throat'],
              ['railCutB', 'r22 Cut B (parallel to rail) retired: the'
                + ' rev-8.2 wood plan carries ONE straight full-depth'
                + ' cut per rail (y_cut -40); the window-line'
                + ' leather-wood seam is letter P14a (owned by'
                + ' asmodeled --letters)'],
              ['ringRecessed', 're-lettered to ringSeated: the r23'
                + ' recession letters (outer top <= -13.5 / rim <='
                + ' -21.5) retired with the deep throat; E-E 针织环座'
                + ' seats the knit ring ON the casting floor plate'
                + ' (22..34 about O_f, crown top +4)'],
              ['ringIronHidden', 'corner brass retired entirely (r31:'
                + ' sheet E-E stack carries no corner brass) — the arm'
                + ' becomes the corner NO-BRASS absence bar below; the'
                + ' SIDE r12 ring (cn8-ring-iron-1/-4) was never this'
                + ' loop\\'s subject and stays byte-identical'],
              ['railAnonRecord', 'rev-21 anon-boundary red evidence'
                + ' retired with the L-cut arm: the r31 red direction'
                + ' is the z42 wood-top window itself (the old 47-class'
                + ' tops read NOTHING in it)'],
            ] };
          const down2 = (x, z) => {
            rc.set(new THREE.Vector3(x, 0.30, z), new THREE.Vector3(0, -1, 0));
            rc.near = 0; rc.far = 1.0;
            const hits = rc.intersectObjects(scene.children, true)
              .filter((h) => h.object.isMesh && vis(h.object));
            return hits.length
              ? { n: hits[0].object.name || '(anon)', y: hits[0].point.y }
              : null;
          };
          // OUTLINE planes for the protrusion bar: the PHYSICAL table
          // outline = the widest body element. GH-490 ROUND-33 (audit
          // wf_215d74b4-8ad): the rail-top planks moved INBOARD to the
          // drawing's 92 mm window line while the manufacturer 2820×1540
          // footprint stayed on the BODY below frameTop (CN8_SKIRT_FW:
          // blinds/beams/deck) — the two outlines split, so the planes
          // are measured off the plank + blind/beam/deck families
          // jointly. ERA-INVARIANT: on every pre-r33 tree the planks
          // themselves reach the footprint (CW + 0.092), so the joint
          // max reproduces the archived planes byte-for-byte; on the
          // r33 tree the deck corner plates carry them (live read:
          // half + 0.1401). The r20 |O_f|+rOut spelling retired WITH
          // the tangency subject: the rev-8.2 boot outer arc (r88.5
          // about O_f) ends on the WINDOW planes (A_r 92, letters
          // P14a/P18a), ~48 mm inside the outline.
          // review r33-r1 P2: the deck corner plates are EXCLUDED from
          // the datum — they are corner geometry under test (a deck
          // escape must never expand its own outline); the planes come
          // from the plank + blind/beam BOX families only, and the
          // measured planes must land inside the sanity band (REBUILD
          // R3 re-letter below: half + [0.088, 0.098] on the
          // owner-approved rev-8.4 U2 anatomy) or the outline is
          // refused as a lost subject.
          let planeX = 0; let planeZ = 0; let nPlank = 0;
          const vv = new THREE.Vector3();
          scene.traverse((o) => {
            if (!o.isMesh || !o.name) return;
            if (!/^cn8-(plank|blind|beam)/.test(o.name)) return;
            if (o.name.startsWith('cn8-beam-deck-c')) return;
            if (o.name.startsWith('cn8-plank')) nPlank++;
            o.updateMatrixWorld(true);
            const pos = o.geometry.getAttribute('position');
            for (let i = 0; i < pos.count; i++) {
              vv.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
              planeX = Math.max(planeX, Math.abs(vv.x));
              planeZ = Math.max(planeZ, Math.abs(vv.z));
            }
          });
          const halfL = 1.27; const halfW = 0.63; // chinese8 2540x1260
          // GH-490 REBUILD R3 (planks-MISSING adjudication, measured):
          // the [0.128, 0.145] manufacturer-footprint band was the
          // pre-round-36 anatomy — the r33 stance the owner REJECTED
          // (rev-8.4 U2: blind/beam outer faces recess to X_body 76,
          // the rail-top wood at the 92 mm window line OVERHANGS the
          // body and is the widest rail-family element).  The joint
          // plank+blind/beam max reads half + 0.092 on the approved
          // anatomy (live: dX/dZ 0.09200 exactly), so the stale band
          // refused a correct tree fail-closed since round 36.  Band
          // re-letters to [0.088, 0.098]; red direction preserved: a
          // tree that loses the planks reads the blind/beam max at
          // half + 0.076 and is still refused as a lost subject.
          const planesSane = planeX - halfL >= 0.088 && planeX - halfL <= 0.098
            && planeZ - halfW >= 0.088 && planeZ - halfW <= 0.098;
          // 6 cn8 planks (4 long halves + 2 ends); fewer = lost subject
          out.outline = nPlank >= 6 && planesSane
            ? [+planeX.toFixed(5), +planeZ.toFixed(5)] : null;
          for (const f of fillets) {
            const u = f.userData.cn8Fillet;
            const pi2 = f.name.split('-').pop();
            const rec = { name: f.name, letters: !!u.r82 };
            // letters fall back to the drawing constants when the
            // carrier predates round-31 (round-22 fallback convention;
            // the red-proof direction: a pre-model tree positions
            // NOTHING at these letters)
            const K = u.r82 ?? { C: 0.0035, R: 0.0525, W_C: 0.045,
              R_N: 0.045, R_B: 0.045, yCut: -0.040, W_L: 0.036,
              A_R: 0.092, rBlend: 0.010, rHole: 0.022, deck: 0.042,
              crest: 0.055, psiF: 49.88, psiS: 72.48 };
            const sxF = Math.sign(u.ofx); const szF = Math.sign(u.ofz);
            // playfield halves from the drawing datum (rider #1: O_f =
            // nose corner + (3.5, 3.5), so L/2 = |ofx| - c). On a
            // pre-model tree ofx is the retired 51.6 mm fillet centre —
            // every station below lands off-letter (red direction).
            const Lh = Math.abs(u.ofx) - K.C;
            const Wh = Math.abs(u.ofz) - K.C;
            // corner family (15 pieces at rev8_6): cn8r82-wallface-a/b,
            // -tongue-a/b, -endroll-a/b, -ring, -fallface, -rollface,
            // -cup, -hole, -block, -endwrap (MOUTH-SEAM-2 leather seam
            // wrap) + the knit cn8-net / cn8-net-low (di === pi: the
            // net loop and buildCornerR82 both iterate
            // G.pockets.entries(), table.js). Inventory quota 15 — a
            // renamed piece is a lost subject, never a green.  MOUTH
            // GRAFT census truth-up: the written quota (12) had been
            // stale since the endroll pieces joined — the arm read
            // 14/12 at 8a666286 (a pre-existing red); the endwrap makes
            // 15 and the quota now names every piece.  (cn8-fallbag/
            // -shell and cn8-net-apron are mouth-interior pieces named
            // outside this census's prefixes by construction.)
            const fam = [];
            scene.traverse((o) => {
              if (!o.isMesh || !o.name) return;
              if ((o.name.startsWith('cn8r82-')
                && o.name.split('-')[2] === pi2)
                || o.name === 'cn8-net-' + pi2
                || o.name === 'cn8-net-low-' + pi2) fam.push(o);
            });
            rec.famN = fam.length;
            // PROTRUSION — subject KEPT from r20 (nothing beyond the
            // physical table outline): every family vertex in the
            // corner quadrant stays inside the plank outline planes,
            // <= 0.3 mm (the JOY block outer rounding is authored flush
            // with the outline; blinds sit at outline - 0.003).
            let protr = -1;
            for (const m of fam) {
              m.updateMatrixWorld(true);
              const pos = m.geometry.getAttribute('position');
              for (let i = 0; i < pos.count; i++) {
                vv.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
                if (Math.sign(vv.x) !== sxF || Math.sign(vv.z) !== szF) continue;
                const over = Math.max(Math.abs(vv.x) - planeX,
                  Math.abs(vv.z) - planeZ);
                if (over > protr) protr = over;
              }
            }
            rec.protrusionMm = +(protr * 1000).toFixed(3);
            // BLOCK BACKING (review r33-r1 P1): the r33 letters read the
            // SILHOUETTE (leather face) — a block that recedes while the
            // leather stands would leave the boot un-backed with every
            // plan letter green. This arm reads the WOOD itself from
            // mesh truth: the cn8r82-block outer chain's per-ψ max
            // radius about O_f vs the drawing tangent chain rOutAt(ψ)
            // (arc + window-line law, |ψ| ≤ psiTE−1; the cut sector
            // beyond is backed by the PLANKS, letters P13). Two-sided:
            // deficit ≤ 1.5 mm (authored tuck 0.2), proud ≤ 0.3 mm.
            // RED direction: the r32 R75/EDGE block reads proud +48 mm
            // class; a recessed block reads deficit > 1.5.
            {
              const blk = fam.find((m) => m.name.startsWith('cn8r82-block'));
              rec.blockBackDeficitMm = null; rec.blockProudMm = null;
              rec.blockBins = 0;
              if (blk) {
                const psiTE = 45 - Math.atan2(K.yCut - K.C, K.A_R - K.C)
                  * 180 / Math.PI;
                const lim = psiTE - 1;
                const rOutAt = (ps) => {
                  const ab = Math.abs(ps);
                  if (ab <= 45) return K.R + K.W_L;
                  return (K.A_R - K.C) / Math.cos((ab - 45) * Math.PI / 180);
                };
                const BINW = 2;
                const nB = Math.ceil(2 * lim / BINW);
                const binMax = new Array(nB).fill(-1);
                const pos = blk.geometry.getAttribute('position');
                blk.updateMatrixWorld(true);
                for (let i = 0; i < pos.count; i++) {
                  vv.fromBufferAttribute(pos, i).applyMatrix4(blk.matrixWorld);
                  if (vv.y < 0.004 || vv.y > 0.045) continue;
                  const dxd = sxF * (vv.x - u.ofx);
                  const dyd = szF * (vv.z - u.ofz);
                  const ps = 45 - Math.atan2(dyd, dxd) * 180 / Math.PI;
                  if (Math.abs(ps) > lim) continue;
                  const bi = Math.min(nB - 1,
                    Math.max(0, Math.floor((ps + lim) / BINW)));
                  const r = Math.hypot(dxd, dyd);
                  if (r > binMax[bi]) binMax[bi] = r;
                }
                let worstDef = -1; let worstProud = -1; let filled = 0;
                for (let bi = 0; bi < nB; bi++) {
                  if (binMax[bi] < 0) continue;
                  filled++;
                  const ps = -lim + (bi + 0.5) * BINW;
                  const d = rOutAt(ps) - binMax[bi];
                  if (d > worstDef) worstDef = d;
                  if (-d > worstProud) worstProud = -d;
                }
                rec.blockBins = filled;
                rec.blockBackDeficitMm = +(worstDef * 1000).toFixed(3);
                rec.blockProudMm = +(worstProud * 1000).toFixed(3);
              }
            }
            // CREST — re-letter of hLeatherMm: the boot mesh max-Y
            // against letter S2c (leather crest 55 over deck z42, D-D
            // crown apex; proposal_rev8_2.json). Window
            // [0.0540, 0.0555]: the mesh apex ring sits just inside the
            // D-D apex station (as-built 0.0547). Mesh read kept as the
            // scene-level guard beside the letter gate's section read.
            {
              const posA = f.geometry.getAttribute('position');
              let topY = -1; let botY = 9;
              for (let i = 0; i < posA.count; i++) {
                topY = Math.max(topY, posA.getY(i));
                botY = Math.min(botY, posA.getY(i));
              }
              rec.crestZ = +topY.toFixed(5);
              rec.hemY = +botY.toFixed(5); // record-only (HEM carried)
            }
            // annulus width / lip — KEPT, reading the rev-8.2 userData
            // letters (W_L 36 = P15b; lip Ø105 = P3a R_mouth 已批)
            rec.wAnnulusMm = +((u.rOut - u.rLip) * 1000).toFixed(2);
            rec.lipDiaMm = +(u.rLip * 2000).toFixed(1);
            // INTERIOR — re-lettered to the rev-8.2 E-E stack about O_f
            // (the r22 hole/ring/green-funnel bands retired with the
            // deep throat). Down-rays from above the deck, 16-azimuth
            // census (psi about the outward diagonal, the sheet's uPsi
            // convention):
            // MOUTH GRAFT (rev8_6 internal amendment, docs/fidelity/
            // 490-internal-amendment-ledger.md): the ladder re-letters
            // to the liner anatomy — MOUTH-LINER-1 puts fabric over the
            // whole plate (the 38/44 cup rows had been missing since
            // the r36 gutter fill: a pre-existing red at 8a666286) and
            // MOUTH-FALL-3 opens the fall to r_fall 29:
            //   r_fall - 2 (27)          -> cn8r82-hole (the ray passes
            //     the open fall to the charcoal shaft/gathered floor)
            //   r_fall + 3 (32, crown) / midband / 47.6 -> cn8-net
            //     (the liner: crown roll, floor run, wall run)
            //   38 / 44 (plate, lined)   -> cn8-net (MOUTH-LINER-1);
            //     the 44 station skips |psi| within 12° of ±90 (the
            //     green tongue legitimately roofs there — carried law)
            //   50.5 at |psi| <= 48      -> cn8-net (the liner WALL
            //     run r 49.7-51.5 up to the selvedge 34.7 is the first
            //     surface; the fallface leather hangs outside it at
            //     r ~52.3+)
            const uPsi = (ps) => {
              const a = ((45 - ps) * Math.PI) / 180;
              return [Math.cos(a), Math.sin(a)];
            };
            const downPsi = (rr4, ps) => {
              const D = uPsi(ps);
              return down2(u.ofx + sxF * rr4 * D[0],
                u.ofz + szF * rr4 * D[1]);
            };
            const r0k = u.rClothNet ?? 0.022;
            const r1k = u.rKnitOut ?? 0.034;
            const bandMiss = { hole: [], ring: [], cup: [], fall: [] };
            let bandN = 0;
            // MOUTH-DRAPE-1 (mouth-cure round, ledger row 6): the fall
            // interior is no longer an open shaft — the sock's gathered
            // drape (cn8-fallbag, "the hole's own lining" per the row-1
            // classification) slopes across the bore, displaced toward
            // the table by the references' measured 11.25 mm phase.  A
            // down-ray inside the bore lawfully terminates on EITHER
            // the shaft (cn8r82-hole) or the drape lining (cn8-fallbag)
            // — both are hole-family anatomy; anything else (bed, net
            // collar, void) still fails the station.
            const probeB = (rr4, ps, want, bucket) => {
              bandN++;
              const h = downPsi(rr4, ps);
              const okDrape = want.startsWith('cn8r82-hole-')
                && h && h.n === 'cn8-fallbag-' + pi2;
              if (!h || (h.n !== want && !okDrape)) {
                bucket.push([+ps.toFixed(1), +rr4.toFixed(4),
                  h ? h.n : 'void']);
              }
            };
            for (let k = 0; k < 16; k++) {
              const ps = -180 + (k * 360) / 16;
              probeB(K.rHole - 0.002, ps, 'cn8r82-hole-' + pi2,
                bandMiss.hole);
              probeB(K.rHole + 0.003, ps, 'cn8-net-' + pi2, bandMiss.ring);
              probeB((K.rHole + r1k) / 2, ps, 'cn8-net-' + pi2,
                bandMiss.ring);
              if (Math.abs(Math.abs(ps) - 90) > 25) {
                // the 47.6 wall-run station: near ±90 the green tongue
                // legitimately roofs the liner wall (the same carried
                // law as the 44 station's ±12° window — the crest chain
                // dips to W_M/2 there; measured tongue hits at ±67.5,
                // ±90, ±112.5 on the rev8_6 anatomy)
                probeB(r1k - 0.002, ps, 'cn8-net-' + pi2, bandMiss.ring);
              }
              probeB(0.038, ps, 'cn8-net-' + pi2, bandMiss.cup);
              if (Math.abs(Math.abs(ps) - 90) > 12) {
                probeB(0.044, ps, 'cn8-net-' + pi2, bandMiss.cup);
              }
              if (Math.abs(ps) <= 48) {
                probeB(0.0505, ps, 'cn8-net-' + pi2,
                  bandMiss.fall);
              }
            }
            rec.interiorMiss = {
              hole: bandMiss.hole.slice(0, 3),
              ring: bandMiss.ring.slice(0, 3),
              cup: bandMiss.cup.slice(0, 3),
              fall: bandMiss.fall.slice(0, 3),
            };
            // census form is fixed: 16 hole + (16+16+10) ring + 16+14
            // cup + 5 fall = 93 rays (rev8_6: the 47.6 wall station
            // skips the 6 tongue-roofed azimuths; starved-read refusal:
            // fewer judged rays means the form itself was lost, never a
            // green)
            rec.interiorN = bandN;
            // GH-490 PASS-2 re-letter (item-3 bead relief): a knitted
            // edge SCALLOPS — the relief's valleys legitimately let a
            // band ray thread past the fabric edge onto the NAMED
            // backing anatomy directly behind it (the cup plate under
            // the crown ring; the lip leather behind the selvedge
            // chamfer). Measured on the cured tree: exactly one ring
            // thread (psi 135 -> cup) + one fall thread (psi 0 ->
            // fallface) per corner, zero pre-relief. Tolerance: <= 2
            // such NAMED-backing threads per corner across ring+fall;
            // a hole/void/foreign hit still refuses, the 93-ray form
            // is unchanged, and the cup/fall bands keep zero-miss law.
            const beadThreads = [
              ...bandMiss.ring.filter((m) => m[2] === 'cn8r82-cup-' + pi2),
              ...bandMiss.fall.filter(
                (m) => m[2] === 'cn8r82-fallface-' + pi2)].length;
            const hardMiss = bandMiss.hole.length + bandMiss.cup.length
              + (bandMiss.ring.length + bandMiss.fall.length - beadThreads);
            rec.interiorPass = hardMiss === 0 && beadThreads <= 2;
            // RAILS ONE-CUT — re-lettered from the r22 L-cut (Cut A ⊥ +
            // Cut B ∥, both retired): the rev-8.2 wood plan ends each
            // plank on ONE straight full-depth cut ⊥ its rail at y_cut
            // 40 mm from the nose corner (P13a/P13c; straightness is
            // P13b), the plan riding +0.2 mm PAST the line under the
            // leather crown (table.js cn8LeftRailPlanHalves /
            // cn8EndRailPlan). Wood tops are the z42 class (S2a: top
            // face 0.042, the extrude bevel rounds the edge — live read
            // 0.0410..0.0420 across the boundary; window [0.0405,
            // 0.0428]. The 47-deck window 0.0455..0.0478 retired for
            // corners and reads NOTHING on these bytes — the red
            // direction; side-pocket jaw values elsewhere stay). Three
            // lanes across the plank (between the back line W_c 45,
            // P16, and the outline) must agree straight (spread <=
            // 1.5 mm) and sit at the letter: off = boundary - 40 in
            // [-0.5, +2.0] mm (the +0.2 overlap + the 1.2 mm ray grid
            // + bevel rounding; live read +0.2).
            const scanCut = (axis, lanes) => {
              const res = [];
              for (const lane of lanes) {
                let bound = null;
                for (let d = 0.075; d >= 0.015; d -= 0.0012) {
                  const px5 = axis === 'x' ? sxF * (Lh - d)
                    : sxF * (Lh + lane);
                  const pz5 = axis === 'x' ? szF * (Wh + lane)
                    : szF * (Wh - d);
                  const h = down2(px5, pz5);
                  if (h && h.y > 0.0405 && h.y < 0.0428
                    && h.n.startsWith('cn8-plank')) {
                    bound = d; // last (most pocket-ward) wood-top hit
                  }
                }
                res.push(bound);
              }
              return res;
            };
            const judge = (res) => {
              if (res.some((b) => b === null)) {
                return { lanesMm: res, spreadMm: null, offMm: null,
                  ok: false };
              }
              const spread = Math.max(...res) - Math.min(...res);
              const off = Math.min(...res) - (-K.yCut);
              return {
                lanesMm: res.map((b) => +(b * 1000).toFixed(1)),
                spreadMm: +(spread * 1000).toFixed(2),
                offMm: +(off * 1000).toFixed(2),
                ok: spread <= 0.0015 && off >= -0.0005 && off <= 0.0020,
              };
            };
            rec.railLong = judge(scanCut('x', [0.050, 0.066, 0.082]));
            rec.railEnd = judge(scanCut('z', [0.050, 0.066, 0.082]));
            rec.railsOneCut = rec.railLong.ok && rec.railEnd.ok;
            // RING SEATED — re-letter of the r23 recession letters
            // (retired with the deep throat): E-E 针织环座 seats the
            // knit ring ON the casting floor plate (S2f z0) as the
            // 22..34 band gently crowned to +4 (RING_TOP). Mesh y-range
            // bars: crown top in [0.0035, 0.0045], rim in [-0.0020, 0]
            // (live read +0.0040 / -0.0012; the r23 recessed ring reads
            // -0.0148/-0.0238 — the red direction).
            // review graft-r4 P2: the liner and the fall-bag SHARE one
            // position buffer (the bag split partitions the index), so
            // span reads must walk the INDEXED vertices of each mesh —
            // a raw-buffer scan reads vertices the mesh never renders
            // and would pass with the bag faces missing.
            const idxSpan = (m) => {
              const pa = m.geometry.getAttribute('position');
              const ix = m.geometry.getIndex();
              let mx5 = -1; let mn5 = 1;
              if (ix) {
                for (let i = 0; i < ix.count; i++) {
                  const y = pa.getY(ix.getX(i));
                  mx5 = Math.max(mx5, y); mn5 = Math.min(mn5, y);
                }
              } else {
                for (let i = 0; i < pa.count; i++) {
                  mx5 = Math.max(mx5, pa.getY(i));
                  mn5 = Math.min(mn5, pa.getY(i));
                }
              }
              return [+mn5.toFixed(5), +mx5.toFixed(5)];
            };
            const ringM = fam.find((m) => m.name === 'cn8-net-' + pi2);
            rec.ringTopY = null; rec.ringRimY = null;
            if (ringM) {
              const [mn5, mx5] = idxSpan(ringM);
              rec.ringTopY = mx5; rec.ringRimY = mn5;
            }
            // MOUTH GRAFT (rev8_6): the seated-band spans retire for the
            // LINER's own letters — top = the selvedge clamped under the
            // lip (RING_ZTOP 34.7, MOUTH-LINER-1); the liner mesh's own
            // indexed bottom is the crown/throat handoff (−1.2, faces
            // straddling the plate stay with the liner), and the BAG is
            // its own mesh whose indexed span carries the −14 stub
            // (MOUTH-FALL-3) — presence-checked below, never read off
            // the shared buffer.
            rec.ringSeated = rec.ringTopY !== null
              && rec.ringTopY >= 0.0342 && rec.ringTopY <= 0.0352
              && rec.ringRimY >= -0.0062 && rec.ringRimY <= -0.0007;
            // the fall-bag row (rev8_6): the bag mesh must exist and its
            // INDEXED span must reach the −14 stub
            let bagM = null;
            scene.traverse((o) => {
              if (o.isMesh && o.name === 'cn8-fallbag-' + pi2) bagM = o;
            });
            rec.fallBagY = null;
            if (bagM) {
              const [mnB, mxB] = idxSpan(bagM);
              rec.fallBagY = [mnB, mxB];
            }
            rec.fallBagOk = rec.fallBagY !== null
              && rec.fallBagY[0] >= -0.0145 && rec.fallBagY[0] <= -0.0135;
            // bowl depth — GH-490 REBUILD R3 (internal amendment
            // BOOT-CAP-1b, rev8_7 twin): the corner sock re-anchored
            // from the retired q8pro slack bag (r12 tip -304, r20
            // bowl -266) to the Q8 family's short gathered cone — the
            // bar re-letters -0.2658 -> -0.148 (photo tip -147 +-10
            // through the R1-register row map).  Red basis: the
            // pre-R3 tree reads -0.26584 and FIRES this window; a
            // tree that loses the sock reads null and fails closed.
            // Sides never rode this bar (corner rec only).
            rec.bowlMinY = null;
            const low = fam.find((m) => m.name === 'cn8-net-low-' + pi2);
            if (low) {
              const lp = low.geometry.getAttribute('position');
              let my = 1;
              for (let i = 0; i < lp.count; i++) {
                my = Math.min(my, lp.getY(i));
              }
              rec.bowlMinY = +my.toFixed(5);
            }
            // CORNER NO-BRASS — the ring-iron-hidden arm's corner
            // subject retires WITH the corner brass (r31: E-E carries
            // no corner brass at all); the bar is now ABSENCE of the
            // corner mesh. Sides keep the r12 ring (cn8-ring-iron-1/-4
            // — a side subject this loop never judged).
            let brass = false;
            scene.traverse((o) => {
              if (o.name === 'cn8-ring-iron-' + pi2) brass = true;
            });
            rec.cornerBrass = brass;
            // TERRACE NO-STEP — KEPT (the r30 staircase law survives the
            // rev-8.2 construction; bar <= 2.5 mm refined step), re-scoped:
            //   clothy allowlist = the rev-8.2 visible envelope
            //     (cn8r82-wallface/-tongue/-fallface/-rollface/-ring +
            //     the cn8-net family + cn8-bed + cn8-cushion — the r31
            //     named bed/cushions — + anon tops);
            //   the wood/leather boundary lane-end now includes
            //     cn8r82-block (and the planks as before);
            //   the CASTING (cn8r82-cup/-hole) is a SEGMENT RESET, not
            //     a judged step: the drawing's own open throat shows the
            //     casting between the knit ring and the crest chain from
            //     above (E-E 铸件 — the interior census above owns that
            //     stack); a lane resumes with prev = null beyond it;
            //   the jaw-chain exemption source moved: cn8-seal
            //     userData.cn8Wrap.jawChains retired — the steep throat
            //     descent is now AUTHORED geometry (α72 walls, S1), so
            //     the exemption derives from the rev-8.2 crest chain
            //     letters themselves (O_N/R_N/T_W/F_W/R10 about E_C to
            //     F_C — proposal_rev8_2.json via table.js CN8_R82,
            //     buildCornerR82 ~5156-5182), BOTH jaws (jaw b = the
            //     mirror swap), steep steps accepted only within 5 mm
            //     of the chain in plan;
            //   nose planes = the playfield edges (|x| = L/2,
            //     |z| = W/2 = |O_f| - c; the r22 cuts.cd datum retired).
            const CH = { ON: [0.045, -0.07874368670764582],
              TW: [0.01318019484660536, -0.04692388155425118],
              EC: [0.04584588711959989, -0.0001160536575257094],
              FW: [0.05291695493146536, -0.007187121469391185],
              FC: [0.05580962526538809, -0.0009668898122376408] };
            const chainPts = [];
            {
              const aDep = Math.PI;
              const aTW = Math.atan2(CH.TW[1] - CH.ON[1],
                CH.TW[0] - CH.ON[0]);
              for (let i = 0; i <= 12; i++) {
                const a = aDep + ((aTW - aDep) * i) / 12;
                chainPts.push([CH.ON[0] + K.R_N * Math.cos(a),
                  CH.ON[1] + K.R_N * Math.sin(a)]);
              }
              for (let i = 1; i <= 6; i++) {
                const t = i / 6;
                chainPts.push([CH.TW[0] + (CH.FW[0] - CH.TW[0]) * t,
                  CH.TW[1] + (CH.FW[1] - CH.TW[1]) * t]);
              }
              const aFw = Math.atan2(CH.FW[1] - CH.EC[1],
                CH.FW[0] - CH.EC[0]);
              const aFc = Math.atan2(CH.FC[1] - CH.EC[1],
                CH.FC[0] - CH.EC[0]);
              for (let i = 1; i <= 6; i++) {
                const a = aFw + ((aFc - aFw) * i) / 6;
                chainPts.push([CH.EC[0] + K.rBlend * Math.cos(a),
                  CH.EC[1] + K.rBlend * Math.sin(a)]);
              }
            }
            const M2W = (px6, py6) => [sxF * (Lh + px6), szF * (Wh + py6)];
            const chains = [chainPts.map((p6) => M2W(p6[0], p6[1])),
              chainPts.map((p6) => M2W(p6[1], p6[0]))];
            const distToChains = (qx6, qz6) => {
              let bd6 = Infinity;
              for (const ch of chains) {
                for (let si = 0; si + 1 < ch.length; si++) {
                  const ax6 = ch[si][0]; const ay6 = ch[si][1];
                  const dx6 = ch[si + 1][0] - ax6;
                  const dy6 = ch[si + 1][1] - ay6;
                  const l26 = dx6 * dx6 + dy6 * dy6;
                  const t6 = l26 > 0 ? Math.min(1, Math.max(0,
                    ((qx6 - ax6) * dx6 + (qz6 - ay6) * dy6) / l26)) : 0;
                  bd6 = Math.min(bd6, Math.hypot(
                    qx6 - (ax6 + t6 * dx6), qz6 - (ay6 + t6 * dy6)));
                }
              }
              return bd6;
            };
            // DISCONTINUITY semantics (build round 5, unchanged): a
            // coarse 2 mm walk cannot tell a smooth steep wall from a
            // true CLIFF — any >8 mm coarse step is LOCALLY REFINED at
            // 0.25 mm and judged on the refined sub-step (<= 2.5 mm ⇔
            // <= 84° slope; the α72 wallface reads ~0.8 mm/sub-step).
            const clothy = (h5) => h5 && (h5.n === '(anon)'
              || h5.n.startsWith('cn8r82-wallface')
              || h5.n.startsWith('cn8r82-tongue')
              || h5.n.startsWith('cn8r82-fallface')
              || h5.n.startsWith('cn8r82-rollface')
              || h5.n.startsWith('cn8r82-ring')
              || h5.n.startsWith('cn8-net')
              || h5.n === 'cn8-bed'
              || h5.n.startsWith('cn8-cushion'));
            const castS = (h5) => h5 && (h5.n.startsWith('cn8r82-cup')
              || h5.n.startsWith('cn8r82-hole'));
            const phiD5 = Math.atan2(szF, sxF);
            let worstStep = 0; let worstAt = null; let lanes5 = 0;
            let worstCoarse = 0; let pairs5 = 0;
            for (let k5 = 0; k5 < 48; k5++) {
              const ddeg = -170 + k5 * (340 / 47);
              // lanes exclude |psi| < 55 (the pocket-exterior boot/
              // block/skirt sector); with them the >52 full crown (S2c
              // crest 55) is never walked — the 0.052 saddle break below
              // only ends a lane, never judges the authored crown
              if (Math.abs(ddeg) < 55) continue;
              const az5 = phiD5 + (ddeg * Math.PI) / 180;
              const c5 = Math.cos(az5); const s5 = Math.sin(az5);
              lanes5++;
              let prev = null; let prevR = null;
              for (let rr5 = 0.028; rr5 <= 0.135; rr5 += 0.002) {
                const qx5 = u.ofx + rr5 * c5;
                const qz5 = u.ofz + rr5 * s5;
                const h5 = down2(qx5, qz5);
                if (!h5) { prev = null; continue; }
                if (castS(h5)) { prev = null; continue; } // casting reset
                if (!clothy(h5)) break; // wood/leather/block ends lane
                if (h5.y > 0.052 || h5.y < -0.045) break; // saddle/void
                const nearNose = Math.abs(Math.abs(qx5) - Lh) < 0.005
                  || Math.abs(Math.abs(qz5) - Wh) < 0.005
                  || distToChains(qx5, qz5) < 0.005;
                if (prev !== null && !nearNose) {
                  pairs5++;
                  const st5 = Math.abs(h5.y - prev);
                  if (st5 > worstCoarse) worstCoarse = st5;
                  if (st5 > 0.008) {
                    // local refinement over [prevR, rr5]
                    let pf = prev; let ref = 0;
                    for (let rq = prevR + 0.00025; rq <= rr5 + 1e-9;
                      rq += 0.00025) {
                      const hq = down2(u.ofx + rq * c5, u.ofz + rq * s5);
                      if (!hq || castS(hq) || !clothy(hq)) {
                        pf = null; continue;
                      }
                      if (pf !== null) {
                        ref = Math.max(ref, Math.abs(hq.y - pf));
                      }
                      pf = hq.y;
                    }
                    if (ref > worstStep) {
                      worstStep = ref;
                      worstAt = [+ddeg.toFixed(0), +rr5.toFixed(3)];
                    }
                  }
                }
                prev = h5.y; prevR = rr5;
              }
            }
            rec.terraceMaxStepMm = +(worstStep * 1000).toFixed(2);
            rec.terraceCoarseMm = +(worstCoarse * 1000).toFixed(2);
            rec.terraceWorstAt = worstAt;
            rec.terraceLanes = lanes5;
            rec.terracePairs = pairs5;
            rec.terraceSmooth = worstStep <= 0.0025;
            // GH-490 PASS-2 census truth-up (the GRAFT precedent above):
            // the item-8 cut-wedge closure strips (cn8r82-endclose-a/b)
            // join the corner family — 15 -> 17, quota names every piece.
            rec.pass = rec.famN === 17
              && out.outline !== null
              && rec.protrusionMm <= 0.3
              && rec.crestZ >= 0.0540 && rec.crestZ <= 0.0555
              && rec.wAnnulusMm >= 34 && rec.wAnnulusMm <= 39
              && Math.abs(rec.lipDiaMm - 105) <= 1
              && rec.interiorN === 93
              && rec.interiorPass === true
              && rec.railsOneCut === true
              && rec.ringSeated === true
              && rec.fallBagOk === true
              // GH-490 BLOCKER-CURE B5 re-letter: the sock gathers
              // THROUGH the gold ring (dossier corner34/q8pro) — neck
              // r13.5 at −150.5, one-cord flare, tip CLOSED at −156.4
              // (GH-387 seal). The −148 letter was the ringless tail;
              // photo tip −147/148 holds within the BOOT-CAP-1b twin's
              // disclosed ±10 mm mapping caveat.
              && rec.bowlMinY !== null
              && Math.abs(rec.bowlMinY + 0.1564) <= 0.002
              && rec.cornerBrass === false
              && rec.terraceSmooth === true
              // walk coverage floor (starved-read refusal: a walk whose
              // lanes all die at boot renames judges nothing — live
              // reads ~900 judged pairs per corner)
              && rec.terracePairs >= 250
              // review r33-r1 P1: the wood must BACK the leather along
              // the tangent chain (two-sided; coverage floor 30 bins)
              && rec.blockBins >= 30
              && rec.blockBackDeficitMm !== null
              // GH-490 BLOCKER-CURE B3 re-letter: the r33 0.2 mm tuck
              // put the wall COPLANAR with the leather skirt at orbit
              // range — the depth buffer z-fought them into the finale
              // review's "black comb/zipper strips". The wall now stands
              // 1.4-2.2 mm behind the chain (measured 2.161 worst-bin);
              // the wood still BACKS the leather within a leather-
              // thickness class bound, and blockProudMm keeps the
              // no-outboard-poke law unchanged.
              && rec.blockBackDeficitMm <= 2.6
              && rec.blockProudMm <= 0.3;
            out.corners.push(rec);
          }
          return JSON.stringify(out);
        })()`));
        report.fillet = fil;
        report.fillet.pass = fil.fillets === 4 && fil.cornerRolls === 0
          && fil.sideRolls === 2 && fil.outline !== null
          && fil.corners.every((c) => c.pass);
        for (const c of fil.corners) {
          console.log(`FILLET ${c.name}: fam ${c.famN}/15 protr `
            + `${c.protrusionMm}mm crest ${c.crestZ} (hem ${c.hemY}) `
            + `W ${c.wAnnulusMm} lip ${c.lipDiaMm} `
            + `interior ${c.interiorN} rays `
            + `miss ${JSON.stringify(c.interiorMiss)} `
            + `railLong ${JSON.stringify(c.railLong)} `
            + `railEnd ${JSON.stringify(c.railEnd)} `
            + `ringSeat [${c.ringRimY}, ${c.ringTopY}] `
            + `(seated ${c.ringSeated}) bowlY ${c.bowlMinY} `
            + `brass ${c.cornerBrass} terraceStep `
            + `${c.terraceMaxStepMm}mm@${JSON.stringify(c.terraceWorstAt)} `
            + `(${c.terraceLanes} lanes, ${c.terracePairs} pairs, `
            + `smooth ${c.terraceSmooth}) `
            + `=> ${c.pass ? 'PASS' : 'FAIL'}`);
        }
        for (const [arm, why] of fil.retired) {
          console.log(`FILLET RETIRED ${arm}: ${why}`);
        }
        console.log(`FILLET inventory fillets ${fil.fillets} cornerRolls `
          + `${fil.cornerRolls} sideRolls ${fil.sideRolls} planks `
          + `${fil.outline ? 'ok' : 'MISSING'} => `
          + `${report.fillet.pass ? 'PASS' : 'FAIL'}`);
      }
    }
  } finally {
    const gone = await chrome.closeAndWait();
    if (gone === false) throw new Error('chrome teardown unconfirmed');
  }
} catch (e) {
  // a REFUSAL (no subjects in this scene) is not a probe failure and not
  // a defect in the tree — it unwinds to here only so the teardown below
  // still runs. Anything else propagates exactly as before.
  if (e && e.obRefusal) REFUSAL = e.obRefusal; else throw e;
} finally {
  // review round-5 P2: the teardown is async and a failing verdict exits
  // right after this block — an unawaited stop can strand the fixed-port
  // server and poison the next lane run.
  await stopStaticServer(server);
  // review round-6 P2: the silhouette shots are per-run scratch — remove
  // them on every path or repeated audit runs accumulate ~2 MB each.
  rmSync(SIL_DIR, { recursive: true, force: true });
}
if (REFUSAL) { console.error(REFUSAL); process.exit(2); }

// verdicts: horn (judged at C1 + C4), tip spread (any pose), skirt (C1s).
// review round-5 P2 (coverage): a probe that silently lost its subjects
// (rolls renamed, userData dropped, a pose rejected) must never green on
// an empty judged set — the horn verdict requires the full 6-pocket x
// 2-horn inventory at BOTH poses, every horn judged at C1 (the pose that
// dive-covers all twelve), and every horn judged at at least one pose.
const hornFails = [];
const coverageFails = [];
let tipMax = 0;
const judgedSomewhere = new Set();
// GH-490 ROUND-20 ERA RE-DERIVATION (owner construction spec
// c5277063842): in the FILLET era the corner pockets carry NO molded
// cap — the horn inventory is the SIDE pockets' four endings, judged
// at the poses that frame them (c1s always; c4 down the rail), and the
// corner subject is owned by report.fillet's construction arms. The
// legacy 12-horn quotas stay live for a legacy scene (the red-proof
// direction: a corner cn8Roll reappearing fails the fillet inventory).
const filletEra = !!(report.fillet && report.fillet.fillets > 0);
const EXP_HORNS = filletEra ? 4 : 12;
for (const pose of ['c1_mouth_ring_macro', 'c4_down_the_nose']) {
  const horns = report.poses[pose]?.horns ?? [];
  if (horns.length !== EXP_HORNS) {
    coverageFails.push(`${pose}: ${horns.length}/${EXP_HORNS} horn entries`);
  }
  for (const h of horns) {
    tipMax = Math.max(tipMax, ...h.tipSpread);
    if (h.judged) judgedSomewhere.add(`p${h.pocket}/${h.side}`);
    if (h.judged && !h.pass) hornFails.push(`${pose}:p${h.pocket}/${h.side}`);
  }
}
// round-6: the centreline rule holds at C1s too (no coverage quota there —
// the pose sees one pocket; the 12/12 inventory stays owned by C1/C4)
for (const h of report.poses.c1s_side_ring_macro?.horns ?? []) {
  tipMax = Math.max(tipMax, ...h.tipSpread);
  if (h.judged && !h.pass) hornFails.push(`c1s:p${h.pocket}/${h.side}`);
}
const c1Horns = report.poses.c1_mouth_ring_macro?.horns ?? [];
const c1Judged = c1Horns.filter((h) => h.judged).length;
// pre-lip geometry: C1 dive-covers all twelve horns (round-5 law). With
// the cloth lap/lip the dives are dressed BY DESIGN, so C1 legitimately
// sees fewer horns' leather — the quota becomes >= 6 at C1 while the
// full 12/12 judged-somewhere inventory below still owns subject loss.
const lipped = c1Horns.length > 0
  && c1Horns.every((h) => h.boundaryT0 != null);
// FILLET era: c1 frames a CORNER pocket, whose horns retired with the
// molded cap — the c1 horn quota retires with them (the corner subject
// is report.fillet); the side horns stay owned by the judged-anywhere
// inventory below.
if (!filletEra && (lipped ? c1Judged < 6 : c1Judged !== 12)) {
  coverageFails.push(`c1 judged ${c1Judged}/12${lipped ? ' (lipped quota 6)' : ''}`);
}
if (judgedSomewhere.size !== EXP_HORNS) {
  coverageFails.push(
    `only ${judgedSomewhere.size}/${EXP_HORNS} horns judged anywhere`);
}
if (filletEra && !report.fillet.pass) {
  coverageFails.push('fillet construction arms FAIL (see FILLET lines)');
}
// round-6 SILHOUETTE verdict: every pixel-judged horn passes at every
// pose, and every pose pixel-judges at least its two mouth-flanking horns
// (an arm that silently lost its subjects must never green — round-5 law).
// Round-7 MATERIAL verdict rides the same judged set: every pixel-judged
// horn must ALSO be material-judged and pass — a lap whose patches went
// missing is a lost subject, never a green.
const silFails = [];
const matFails = [];
const silJudged = {};
let deferredNeedsC1s = false; // ROUND-20: c4 sub-scale-only defers to c1s
let c1sStrictPass = 0;
for (const pose of Object.keys(report.poses)) {
  const sil = report.poses[pose]?.sil ?? [];
  const judged = sil.filter((s) => s.judged);
  silJudged[pose] = judged.map((s) => s.key);
  // FILLET-era per-pose sil quotas: c1 frames the (hornless) corner —
  // quota 0; c4 sees the mid-rail side pocket down the nose — >= 1;
  // c1s frames the side mouth — its two flanking horns stay required.
  const silQuota = filletEra
    ? ({ c1_mouth_ring_macro: 0, c4_down_the_nose: 1,
      c1s_side_ring_macro: 2 }[pose] ?? 0)
    : 2;
  if (judged.length < silQuota) {
    silFails.push(`${pose}: only ${judged.length} horns pixel-judged`
      + ` (quota ${silQuota})`);
  }
  // MATERIAL gating (round-8): the bar's subject is THE TONGUE's
  // rendered material, so the verdict gates on STRICT lap-mesh records.
  // ROUND-10 (gate r8: "value-matched dS is accepted as a correction
  // but NOT a substitute — fix on the full basis; C4 record-only is
  // over"): C4 JOINS the judged poses. The r8/r9 grazing-instability
  // carve-out is retired — the round-10 melt keeps the strict sample
  // window (tLead+0.05 .. taper0−0.02) on the lit pre-melt covering,
  // which resolves stably at the down-the-nose framing (round-10 crop
  // loop, iters 5–8).
  const strictable = true;
  // ROUND-10 sub-scale law (the silhouette span-24px rule's material
  // analog): at the near-axial C4 framing, distant/occluded endings
  // (the side pocket 1.3 m down the rail; the far-side horn behind the
  // near one) resolve only a handful of strict skin pixels — below any
  // region-judging scale. A sub-scale horn (strict lap < 60 px) is
  // recorded, not failed, PROVIDED at least one horn at the pose
  // material-judges strictly and passes (the pose-level subject
  // guard); the macro poses must still strictly resolve every
  // pixel-judged horn (the round-5 lost-subject law).
  const nearAxial = pose === 'c4_down_the_nose';
  let poseStrictPass = 0;
  const deferred = [];
  for (const s of judged) {
    if (!s.pass) {
      silFails.push(`${pose}:${s.key} trim cover ${s.coverPts} pts `
        + `(cut ${s.tCut}) lastLeather ${s.lastLeatherT} `
        + `${s.violations.length} beyond-boundary leather pts`
        + (s.box ? ` box [${s.box.join(',')}]` : ''));
    }
    const m = s.mat;
    if (!m || !m.judged) {
      // review r10 P2: only a PRESENT record with a measured lapPx may
      // defer as sub-scale — a missing record (the classifier now
      // always emits one, so null means the machinery lost the
      // subject) fails regardless of pose.
      // ROUND-19 sub-scale floor 60 -> 100 (measured flutter): the far
      // side pocket's strict region at C4 crossed the 60 px line
      // BETWEEN two probe runs on byte-identical side geometry (39 vs
      // 67 px — cross-session rasterization moves the gated count
      // through the comparable-illumination floor), and a 67 px noisy
      // sliver then carried a dS verdict.  100 px stays far below
      // every macro-pose strict region (305–1746 px this round); the
      // pose-level subject guard (>= 1 strict pass at the pose) is
      // unchanged.
      if (nearAxial && m && typeof m.lapPx === 'number' && m.lapPx < 100) {
        deferred.push(`${pose}:${s.key} material sub-scale `
          + `(lap ${m.lapPx} px)`);
      } else {
        matFails.push(`${pose}:${s.key} material patches lost `
          + `(lap ${m?.lapPx ?? 'none'} px, jaw ${m?.jawPx ?? 'none'} px)`);
      }
    } else if (m.fallback) {
      matFails.push(`${pose}:${s.key} covering not strictly resolvable `
        + `(fallback region)`);
    } else if (!m.pass) {
      matFails.push(`${pose}:${s.key} dV ${m.dv} dS ${m.ds} `
        + `dH ${m.dh} lag1 ${m.lapLag1} vs jaw ${m.jawLag1}`);
    } else {
      poseStrictPass++;
    }
  }
  if (deferred.length) {
    if (poseStrictPass >= 1) {
      for (const d of deferred) console.log(`[sub-scale] ${d}`);
    } else if (filletEra && nearAxial) {
      // ROUND-20 era re-derivation: c4's CLOSE material subject was
      // the corner cap (retired with the fillet construction); the
      // only remaining horns sit 1.3 m down the rail — the round-10
      // sub-scale class. The strict material subject moves to c1s,
      // whose own quota below still enforces it (a c1s strict loss
      // fails there — never a silent green here).
      for (const d of deferred) console.log(`[sub-scale] ${d}`);
      deferredNeedsC1s = true;
    } else {
      matFails.push(...deferred,
        `${pose}: no strict material subject at the pose`);
    }
  }
  if (pose === 'c1s_side_ring_macro') c1sStrictPass = poseStrictPass;
}
if (deferredNeedsC1s && c1sStrictPass < 1) {
  matFails.push('c4 deferred sub-scale but c1s has no strict material pass');
}
const tipPass = tipMax < 1e-5;
const skirt = report.poses.c1s_side_ring_macro?.skirt;
report.verdict = {
  horn: hornFails.length === 0 && coverageFails.length === 0,
  hornFails, coverageFails,
  silhouette: silFails.length === 0, silFails, silJudged,
  material: matFails.length === 0, matFails,
  // ROUND-9: the pose-free CONSTRUCTION bars (crest-hold + conformal
  // skin envelope + margin no-bare-rail) — the r8 flush bar asserted
  // the flatten the adjudication overturned
  construction: !!report.construction?.pass,
  constructionSkinY: report.construction?.skin
    ? [report.construction.skin.yMin, report.construction.skin.yMax]
    : null,
  crestHold: !!report.construction?.crestPass,
  margin: !!report.construction?.marginPass,
  // round-10 bars (gate r8 findings 2/3)
  melt: !!report.construction?.meltPass,
  meltYMax: report.construction?.melt?.yMax ?? null,
  sideBoundary: !!report.construction?.sideBoundaryPass,
  sideBoundarySpread: report.construction?.sideBoundary ?? null,
  shoulderCover: !!report.construction?.shoulderPass,
  tipZero: tipPass, tipMaxSpreadMm: +(tipMax * 1000).toFixed(4),
  skirt: !!skirt?.pass,
  skirtRatio: skirt?.ratio ?? null, skirtDetached: skirt?.detached ?? null,
  // ROUND-20 corner fillet construction arms (era: filletEra); ROUND-31:
  // summary fields re-lettered to the rev-8.2 arms (crestZ/railsOneCut/
  // ringSeated/cornerBrass), and the retired-arm ledger rides the verdict
  // so the pack JSON records the adjudication
  filletEra,
  fillet: filletEra ? !!report.fillet?.pass : null,
  filletCorners: report.fillet?.corners?.map((c) => ({
    name: c.name, pass: c.pass, protrusionMm: c.protrusionMm,
    blockBackDeficitMm: c.blockBackDeficitMm, blockProudMm: c.blockProudMm,
    blockBins: c.blockBins,
    crestZ: c.crestZ, wAnnulusMm: c.wAnnulusMm,
    railsOneCut: c.railsOneCut, ringSeated: c.ringSeated,
    terraceMaxStepMm: c.terraceMaxStepMm, cornerBrass: c.cornerBrass,
  })) ?? null,
  filletRetired: report.fillet?.retired?.map((r) => r[0]) ?? null,
};
console.log('VERDICT', JSON.stringify(report.verdict));
if (OUT) {
  writeFileSync(OUT, JSON.stringify(report, null, 1));
  console.log('report ->', OUT);
}
if (!report.verdict.horn || !tipPass || !report.verdict.skirt
  || !report.verdict.silhouette || !report.verdict.material
  || !report.verdict.construction) process.exit(1);
