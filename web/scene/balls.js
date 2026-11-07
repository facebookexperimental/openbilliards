// Copyright (c) Meta Platforms, Inc. and affiliates.

// balls.js — procedural phenolic ball textures, materials, meshes; fills the
// shared analytic-sphere uniform list consumed by every injected shader.
import * as THREE from 'three';
import { injectAnalytic, rng, noiseCanvas, MAXS } from './shading.js';

export const R = 0.028575; // WPA 2.25 in ball radius, meters

// Color + ink-roughness maps baked together so the decals line up texel-for-
// texel: the phenolic BODY is glossy resin while the silk-screened INK
// (stripe band, number ring, numerals, measle dots) sits microscopically
// proud and reads slightly matte — reference closeups show the stripe/number losing
// the lamp bars a beat before the body does. Roughness canvas is grayscale
// ABSOLUTE roughness (material.roughness = 1.0, map carries the value).
const INK = {
  body: 0.07, ring: 0.10, dot: 0.13, stripe: 0.14, glyph: 0.18,
  g: (v) => { const b = Math.round(v * 255); return `rgb(${b},${b},${b})`; },
};

// `num` semantics (feature 012, contracts/render-capacity.md §2): a positive
// number silk-screens the ring + numeral, 0 is the measle-dot cue, and NULL
// is a PLAIN ball — no number ring, no numeral, no dots (snooker reds/colours
// and the carom object balls; the wear pass still applies). Pool call sites
// always pass an integer id, so their texture bytes are unchanged.
//
// `style` (issue #91, OPTIONAL trailing arg — absent on every legacy call
// site, so the default path below is BYTE-IDENTICAL, same fills, same rng
// draw count): a parametric per-set paint spec built by app/ballset.js
// (POOL_SET_STYLES). Equirect math shared by producer and consumer: the
// 1024x512 canvas maps 512 px to pi of latitude, so a feature whose CHORD
// is a fraction f of the ball diameter D paints at
// asin(f) * 512 / PI px from its station. Fields (all px pre-derived by the
// producer): white (set white/ivory), stripeBase (stripe polar body),
// bandHalfPx (stripe half-height from the equator), disc {rPx, fill,
// keyline, keylinePx} | null, ring {rPx, strokePx, color, fill, tickLenPx,
// tickWidthPx} | null (gunsight ring + 3 inward ticks at 120°, both
// stations), digit {color, px, px2, font}, cueMarks {shape 'dot'|'tri',
// rPx, color}.
export function makeBallMaps(num, hex, isStripe, seed, style) {
  const r = rng(seed);
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 512;
  const ctx = cv.getContext('2d');
  const rcv = document.createElement('canvas');
  rcv.width = 1024; rcv.height = 512;
  const rctx = rcv.getContext('2d');
  const ivory = '#f3eedd';
  if (style) {
    paintPoolSetStyle(ctx, rctx, num, hex, isStripe, style, r);
  } else {
  ctx.fillStyle = isStripe || num === 0 ? ivory : hex;
  ctx.fillRect(0, 0, 1024, 512);
  rctx.fillStyle = INK.g(INK.body);
  rctx.fillRect(0, 0, 1024, 512);
  if (isStripe) {
    ctx.fillStyle = hex;
    ctx.fillRect(0, 512 * 0.30, 1024, 512 * 0.40);
    rctx.fillStyle = INK.g(INK.stripe);
    rctx.fillRect(0, 512 * 0.30, 1024, 512 * 0.40);
  }
  if (num !== null && num > 0) {
    for (const cx of [256, 768]) {
      ctx.fillStyle = ivory;
      ctx.beginPath(); ctx.arc(cx, 256, 66, 0, Math.PI * 2); ctx.fill();
      rctx.fillStyle = INK.g(INK.ring);
      rctx.beginPath(); rctx.arc(cx, 256, 66, 0, Math.PI * 2); rctx.fill();
      const font = `bold ${num >= 10 ? 72 : 84}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillStyle = '#141210';
      ctx.font = font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cx, 260);
      rctx.fillStyle = INK.g(INK.glyph);
      rctx.font = font;
      rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
      rctx.fillText(String(num), cx, 260);
    }
  } else if (num === 0) {
    // cue ball "measle" dots — 6 evenly spread dots (Aramith-style), lats
    // alternating so at least two dots face any camera; ~18° angular size so
    // spin reads even at 0.25x video framing (reference-footage parity). Equirect
    // canvas: x-radius stretched by 1/cos(lat) toward the poles.
    const DOT_R = 26; // px on the 1024x512 equirect = ~18° diameter
    ctx.fillStyle = 'rgba(178,24,40,0.95)';
    rctx.fillStyle = INK.g(INK.dot);
    for (let i = 0; i < 6; i++) {
      const lat = (i % 2 === 0 ? 1 : -1) * (32 * Math.PI / 180);
      const cx = (i / 6) * 1024 + 42;
      const cy = 256 - (lat / Math.PI) * 512;
      const rx = DOT_R / Math.cos(lat);
      for (const c of [ctx, rctx]) {
        c.beginPath();
        c.ellipse(cx, cy, rx, DOT_R, 0, 0, Math.PI * 2);
        c.fill();
        // equirect wrap: dots near the seam need a second draw shifted 1024
        if (cx + rx > 1024) {
          c.beginPath();
          c.ellipse(cx - 1024, cy, rx, DOT_R, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }
  }
  // subtle wear: specks + faint scratches (scratches scuff the gloss too)
  for (let i = 0; i < 260; i++) {
    const a = 0.03 + r() * 0.06;
    ctx.fillStyle = r() < 0.55 ? `rgba(20,16,12,${a})` : `rgba(255,252,244,${a})`;
    const x = r() * 1024, y = r() * 512, w = 1 + r() * 2, h = 1 + r() * 2;
    ctx.fillRect(x, y, w, h);
    rctx.fillStyle = `rgba(60,60,60,${0.10 + r() * 0.14})`;
    rctx.fillRect(x, y, w, h);
  }
  ctx.lineWidth = 1.2;
  rctx.lineWidth = 1.2;
  for (let i = 0; i < 10; i++) {
    const x = r() * 1024, y = r() * 512, rad = 30 + r() * 120, a0 = r() * 6.28;
    const a1 = a0 + 0.4 + r() * 0.9;
    ctx.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.045})`;
    ctx.beginPath(); ctx.arc(x, y, rad, a0, a1); ctx.stroke();
    rctx.strokeStyle = 'rgba(70,70,70,0.20)';
    rctx.beginPath(); rctx.arc(x, y, rad, a0, a1); rctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  const rtex = new THREE.CanvasTexture(rcv);
  rtex.anisotropy = 8;
  rtex.wrapS = THREE.RepeatWrapping;
  return { map: tex, roughnessMap: rtex };
}

// ---- issue #91: parametric per-set pool paint (module-private — reached
// ONLY through the makeBallMaps/makeBallMaterial trailing `style` arg; no
// new export, rule-5 corollary). Roughness rides the same INK classes as
// the legacy paint so silk-screen matte behavior holds.

/** Project a point at angular offset `alpha` (rad) and circle parameter
 * `t` around the pole station at longitude `phi0` (equator) onto the
 * 1024x512 equirect canvas. t = 0 points at the north pole (-y canvas).
 * Stations sit at lon 90°/270° (cx 256/768) so station circles up to
 * alpha < ~60° never cross the x seam. */
function stationPoint(phi0, alpha, t) {
  const n = [Math.cos(phi0), 0, Math.sin(phi0)];       // station normal
  const e1 = [0, 1, 0];                                // toward the pole
  const e2 = [-Math.sin(phi0), 0, Math.cos(phi0)];     // n x e1
  const ca = Math.cos(alpha); const sa = Math.sin(alpha);
  const p = [
    ca * n[0] + sa * (Math.cos(t) * e1[0] + Math.sin(t) * e2[0]),
    ca * n[1] + sa * (Math.cos(t) * e1[1] + Math.sin(t) * e2[1]),
    ca * n[2] + sa * (Math.cos(t) * e1[2] + Math.sin(t) * e2[2]),
  ];
  const lat = Math.asin(p[1]);
  const lon = Math.atan2(p[2], p[0]);
  return [((lon / (2 * Math.PI)) * 1024 + 1024) % 1024, 256 - (lat / Math.PI) * 512];
}

/** Trace the TRUE spherical circle of angular radius `alpha` around the
 * equator station at canvas x `cx` (a plain canvas arc distorts toward the
 * poles — at the 0.50D gunsight chord the top/bottom of the ring sits at
 * lat 30° where the equirect stretches x by 1/cos(30°) ≈ 1.155). */
function stationCirclePath(c, cx, alpha) {
  const phi0 = (cx / 1024) * 2 * Math.PI;
  c.beginPath();
  const N = 96;
  for (let i = 0; i <= N; i++) {
    const [x, y] = stationPoint(phi0, alpha, (i / N) * 2 * Math.PI);
    if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
  }
  c.closePath();
}

/** Issue-#91 styled pool paint (see the `style` doc on makeBallMaps).
 * Draw order per station: ring fill (bare-resin white — INK.body) →
 * ring stroke + ticks (INK.ring) → disc + keyline (INK.ring) → digit
 * (INK.glyph). The caller's wear pass runs after this with the same
 * per-ball seed; only the arcos cue-triangle orientations consume rng
 * draws here (seeded, deterministic per ball). */
function paintPoolSetStyle(ctx, rctx, num, hex, isStripe, s, r) {
  const P512 = 512 / Math.PI; // px per rad of latitude
  const base = num === 0 ? s.white : (isStripe ? s.stripeBase : hex);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 1024, 512);
  rctx.fillStyle = INK.g(INK.body);
  rctx.fillRect(0, 0, 1024, 512);
  if (isStripe) {
    // sharp-edged band: half-height = asin(bandChord) * 512/pi px — the
    // 50%D (black) / 53%D (arcos) bands are NARROWER than the legacy WPA
    // band (0.40-canvas ≈ 59%D chord).
    ctx.fillStyle = hex;
    ctx.fillRect(0, 256 - s.bandHalfPx, 1024, 2 * s.bandHalfPx);
    rctx.fillStyle = INK.g(INK.stripe);
    rctx.fillRect(0, 256 - s.bandHalfPx, 1024, 2 * s.bandHalfPx);
  }
  if (num !== null && num > 0) {
    for (const cx of [256, 768]) {
      if (s.ring) {
        const alpha = (s.ring.rPx) / P512;
        // ring interior = the set ivory ("ring fills" law, issue #91):
        // bare resin, so roughness restores the BODY gloss over the band
        stationCirclePath(ctx, cx, alpha);
        ctx.fillStyle = s.ring.fill;
        ctx.fill();
        stationCirclePath(rctx, cx, alpha);
        rctx.fillStyle = INK.g(INK.body);
        rctx.fill();
        // gunsight stroke (0.02D chord ≈ 7.5 px) + 3 inward solid ticks at
        // 120° (logo omitted on the reverse pole — ring geometry kept)
        stationCirclePath(ctx, cx, alpha);
        ctx.strokeStyle = s.ring.color;
        ctx.lineWidth = s.ring.strokePx;
        ctx.stroke();
        stationCirclePath(rctx, cx, alpha);
        rctx.strokeStyle = INK.g(INK.ring);
        rctx.lineWidth = s.ring.strokePx;
        rctx.stroke();
        const phi0 = (cx / 1024) * 2 * Math.PI;
        const aIn = alpha - s.ring.tickLenPx / P512;
        const dt = (s.ring.tickWidthPx / 2) / (Math.sin(alpha) * P512);
        for (const tt of [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6]) {
          const b1 = stationPoint(phi0, alpha, tt - dt);
          const b2 = stationPoint(phi0, alpha, tt + dt);
          const apex = stationPoint(phi0, aIn, tt);
          for (const [c, col] of [[ctx, s.ring.color], [rctx, INK.g(INK.ring)]]) {
            c.fillStyle = col;
            c.beginPath();
            c.moveTo(b1[0], b1[1]); c.lineTo(b2[0], b2[1]);
            c.lineTo(apex[0], apex[1]);
            c.closePath(); c.fill();
          }
        }
      }
      if (s.disc) {
        // white number circle + thin keyline (aramith_black: chord 0.33D)
        ctx.fillStyle = s.disc.fill;
        ctx.beginPath(); ctx.arc(cx, 256, s.disc.rPx, 0, Math.PI * 2); ctx.fill();
        rctx.fillStyle = INK.g(INK.ring);
        rctx.beginPath(); rctx.arc(cx, 256, s.disc.rPx, 0, Math.PI * 2); rctx.fill();
        ctx.strokeStyle = s.disc.keyline;
        ctx.lineWidth = s.disc.keylinePx;
        ctx.beginPath(); ctx.arc(cx, 256, s.disc.rPx, 0, Math.PI * 2); ctx.stroke();
        rctx.strokeStyle = INK.g(INK.ring);
        rctx.lineWidth = s.disc.keylinePx;
        rctx.beginPath(); rctx.arc(cx, 256, s.disc.rPx, 0, Math.PI * 2); rctx.stroke();
      }
      const font = `bold ${num >= 10 ? s.digit.px2 : s.digit.px}px ${s.digit.font}`;
      ctx.fillStyle = s.digit.color;
      ctx.font = font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cx, 256 + Math.round(s.digit.px / 21));
      rctx.fillStyle = INK.g(INK.glyph);
      rctx.font = font;
      rctx.textAlign = 'center'; rctx.textBaseline = 'middle';
      rctx.fillText(String(num), cx, 256 + Math.round(s.digit.px / 21));
    }
  } else if (num === 0) {
    // cue markings at the legacy 6-station measle spread (lats ±32°):
    // black DOTS (aramith_black ~0.06D) or seeded-orientation solid black
    // TRIANGLES (arcos ~0.10D edge; circumradius = edge/sqrt(3)). Station
    // x maxes at ~895 + rx ≈ 907 < 1024, but the dot path keeps the
    // legacy seam re-draw guard for safety.
    for (let i = 0; i < 6; i++) {
      const lat = (i % 2 === 0 ? 1 : -1) * (32 * Math.PI / 180);
      const cx = (i / 6) * 1024 + 42;
      const cy = 256 - (lat / Math.PI) * 512;
      const stretch = 1 / Math.cos(lat); // equirect x-stretch off-equator
      if (s.cueMarks.shape === 'tri') {
        const rot = r() * 2 * Math.PI; // varied orientation, seeded per ball
        for (const [c, col] of [[ctx, s.cueMarks.color], [rctx, INK.g(INK.dot)]]) {
          c.fillStyle = col;
          c.beginPath();
          for (let k = 0; k < 3; k++) {
            const a = rot + (k * 2 * Math.PI) / 3;
            const x = cx + Math.cos(a) * s.cueMarks.rPx * stretch;
            const y = cy + Math.sin(a) * s.cueMarks.rPx;
            if (k === 0) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.closePath(); c.fill();
        }
      } else {
        const rx = s.cueMarks.rPx * stretch;
        for (const [c, col] of [[ctx, s.cueMarks.color], [rctx, INK.g(INK.dot)]]) {
          c.fillStyle = col;
          c.beginPath();
          c.ellipse(cx, cy, rx, s.cueMarks.rPx, 0, 0, Math.PI * 2);
          c.fill();
          if (cx + rx > 1024) {
            c.beginPath();
            c.ellipse(cx - 1024, cy, rx, s.cueMarks.rPx, 0, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }
  }
}

/** Back-compat color-map-only entry (spike + older call sites). */
export function makeBallTexture(num, hex, isStripe, seed) {
  return makeBallMaps(num, hex, isStripe, seed).map;
}

// Micro-normal for the phenolic surface: very-low-amplitude tileable noise
// shared by every ball (base + clearcoat normal slots). It rides the ball's
// UVs, so the rectangular lamp highlight WOBBLES as the ball rolls — the reference
// slow-mo gloss cue. Amplitude lives in normalScale at the material.
let microNormalTex = null;
export function ballMicroNormal() {
  if (microNormalTex) return microNormalTex;
  const cv = noiseCanvas(256, 31337, (d, i, x, y, val) => {
    // two fine octaves of smooth value noise -> centered slopes (round 2:
    // coarser 2.1/6.3 octaves at 0.05 scale read as orange peel — the reference
    // surface is near-smooth with only a faint waviness in the highlight)
    const e = 0.9;
    const hx = val((x + e) * 5.7, y * 5.7) - val((x - e) * 5.7, y * 5.7)
      + 0.5 * (val((x + e) * 14.9, y * 14.9) - val((x - e) * 14.9, y * 14.9));
    const hy = val(x * 5.7, (y + e) * 5.7) - val(x * 5.7, (y - e) * 5.7)
      + 0.5 * (val(x * 14.9, (y + e) * 14.9) - val(x * 14.9, (y - e) * 14.9));
    d[i] = 127.5 * (1 - hx * 2.2);
    d[i + 1] = 127.5 * (1 - hy * 2.2);
    d[i + 2] = 255;
    d[i + 3] = 255;
  });
  microNormalTex = new THREE.CanvasTexture(cv);
  microNormalTex.wrapS = microNormalTex.wrapT = THREE.RepeatWrapping;
  microNormalTex.anisotropy = 4;
  return microNormalTex;
}

/**
 * Phenolic-resin ball material: glossy base (ink-aware roughness map) under
 * a hard clearcoat (the polish layer that carries the crisp rectangular lamp
 * reflection via the box-projected env), micro-normal wobble on both layers,
 * fresnel-correct grazing response from the clearcoat energy split.
 * `style` (issue #91): optional trailing per-set paint spec forwarded to
 * makeBallMaps — absent (every legacy call site, and any stale-cache
 * pairing) keeps the WPA texture byte-identical.
 */
export function makeBallMaterial(num, hex, isStripe, seed, envMap, style) {
  const { map, roughnessMap } = makeBallMaps(num, hex, isStripe, seed, style);
  return new THREE.MeshPhysicalMaterial({
    map,
    roughnessMap,
    roughness: 1.0,          // absolute values live in the roughness map
    metalness: 0,
    ior: 1.6,                // phenolic resin
    specularIntensity: 1.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    normalMap: ballMicroNormal(),
    normalScale: new THREE.Vector2(0.012, 0.012),
    clearcoatNormalMap: ballMicroNormal(),
    clearcoatNormalScale: new THREE.Vector2(0.03, 0.03),
    envMapIntensity: 1.0,
    ...(envMap ? { envMap } : {}),
  });
}

export const BALL_DEFS = [ // [num, colorHex, stripe]
  [0, '#f3eedd', false], [1, '#eeb200', false], [2, '#1b56ad', false],
  [3, '#c3122a', false], [5, '#e2621a', false], [8, '#191919', false],
  [9, '#eeb200', true], [12, '#552a86', true], [14, '#0d7a3e', true],
];

// layout: [x, z] world meters. Cluster near the foot spot, cue ball back
// toward center table, two loose balls for full-table interest.
export function defaultLayout(footSpot, rand) {
  const c = footSpot;
  const SPOTS = [
    [c.x - 0.34, c.z + 0.10],                               // cue
    [c.x - 0.050, c.z - 0.020], [c.x + 0.010, c.z - 0.002], // 1, 2
    [c.x - 0.024, c.z + 0.052], [c.x + 0.048, c.z + 0.056], // 3, 5
    [c.x + 0.098, c.z - 0.026], [c.x - 0.102, c.z - 0.060], // 8, 9
    [c.x - 0.72, c.z - 0.42],                               // 12 loose
    [c.x - 1.35, c.z + 0.33],                               // 14 loose
  ];
  const pts = SPOTS.map(([x, z]) => [x + (rand() - 0.5) * 0.006, z + (rand() - 0.5) * 0.006]);
  for (let it = 0; it < 24; it++) {
    for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
      const dx = pts[j][0] - pts[i][0], dz = pts[j][1] - pts[i][1];
      const d = Math.hypot(dx, dz), min = 2 * R + 0.0004;
      if (d < min && d > 1e-6) {
        const push = (min - d) / 2, ux = dx / d, uz = dz / d;
        pts[i][0] -= ux * push; pts[i][1] -= uz * push;
        pts[j][0] += ux * push; pts[j][1] += uz * push;
      }
    }
  }
  return pts;
}

// Build ball meshes, fill `shared` sphere uniforms. `faceTarget` is a world
// position choice numbers rotate toward (usually the close-up camera).
export function buildBalls({ shared, layout, faceTarget, rand }) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(R, 96, 64);
  BALL_DEFS.forEach(([num, hex, stripe], idx) => {
    if (idx >= MAXS) return;
    const mat = makeBallMaterial(num, hex, stripe, 1000 + num);
    injectAnalytic(mat, shared, idx, 'ball');
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(layout[idx][0], R, layout[idx][1]);
    if ((num === 1 || num === 9 || num === 3) && faceTarget) {
      const dir = faceTarget.clone().sub(mesh.position);
      dir.y *= 0.35; dir.normalize();
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), (rand() - 0.5) * 0.8);
    } else {
      mesh.quaternion.setFromEuler(new THREE.Euler(rand() * 6.28, rand() * 6.28, rand() * 6.28));
    }
    group.add(mesh);
    shared.uSpheres.value[idx].set(mesh.position.x, mesh.position.y, mesh.position.z, R);
    // uSphereCols keeps the historical DOUBLE-linearized values: three r152+
    // setHex already converts sRGB->linear, so convertSRGBToLinear() here
    // applies the transform twice — but the ball-ball inter-reflection
    // look (uInterStrength 0.7) was calibrated against exactly these
    // values, so they stay (review GH-385 r2/r6 resolution). The GH-385 AO
    // interreflection closure needs the PHYSICAL albedo instead — its
    // scalar luminance ships separately in uSphereLum (correct
    // single-linear, computed here on the CPU).
    const c385 = new THREE.Color(hex); // single-linear (setHex converts)
    let lum385 = 0.2126 * c385.r + 0.7152 * c385.g + 0.0722 * c385.b;
    if (stripe || num === 0) {
      // review GH-385 r11: this legacy paint path fills stripes/cue with
      // ivory and lays the hex band over latitude rows 0.30-0.70 of the
      // equirect map — sphere area weight is sin(theta), so the band owns
      // (cos 0.30π − cos 0.70π)/2 ≈ 0.588 of the surface. Weight the
      // closure albedo by the actual painted split (cue = all ivory).
      const iv = new THREE.Color('#f3eedd');
      const lumIv = 0.2126 * iv.r + 0.7152 * iv.g + 0.0722 * iv.b;
      lum385 = stripe ? 0.588 * lum385 + 0.412 * lumIv : lumIv;
    }
    if (num !== null && num > 0) {
      // legacy 66 px ivory number discs — two spherical caps of angular
      // radius 66·π/512, exact zone area 1 − cos(that) (review r14/r15);
      // glyph ink < 1% is immaterial to the closure (see ballset.js note)
      const iv2 = new THREE.Color('#f3eedd');
      const lumIv2 = 0.2126 * iv2.r + 0.7152 * iv2.g + 0.0722 * iv2.b;
      const fDisc = 1 - Math.cos(66 * Math.PI / 512);
      // the disc replaces band/body paint (hex), not the sphere average
      // (review r16)
      const under = 0.2126 * c385.r + 0.7152 * c385.g + 0.0722 * c385.b;
      lum385 += fDisc * (lumIv2 - under);
    }
    // optional-chained: a stale pre-GH-385 shading.js has no uSphereLum
    // (and no closure to feed) — the mixed-cache boot must not throw
    if (shared.uSphereLum) {
      shared.uSphereLum.value[idx] = lum385;
    }
    shared.uSphereCols.value[idx] = c385.clone().convertSRGBToLinear();
  });
  shared.uSphereCount.value = Math.min(BALL_DEFS.length, MAXS);
  return group;
}
