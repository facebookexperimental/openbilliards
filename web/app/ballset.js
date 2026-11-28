// Copyright (c) Meta Platforms, Inc. and affiliates.

// ballset.js — game ball meshes driven by kernel ball ids. Reuses the scene
// module's procedural textures/materials (scene/balls.js) but builds one mesh
// per scenario ball (cue + 1..9 or 1..15) instead of the spike's fixed set.
import * as THREE from 'three';
import { makeBallMaterial, R } from '../scene/balls.js';
import { injectAnalytic, MAXS } from '../scene/shading.js';
// ORDER-LAND-638-FIX P1-a (cache-poison contract, the ownership ledger (internal) rule 5): the GI module is reached through a
// NAMESPACE binding — a namespace always links against a cached older gi.js, and the new registration API is
// feature-detected (absent → main's behaviour: the at-rest SH block fills on the first move)
import * as giMod from '../scene/gi.js';
import { kPosToThree } from './coords.js';

export { R };
// ORDER-LIGHT-FIX6 (review r10 P2): the ONE handshake value every participating venue leaf exports (main.js negotiates it before the
// scene is built; a stale ballset.js — no resting-ball registration, no per-ball radius — puts the whole venue path on legacy).
export const VENUE_PROTOCOL = 2; // ORDER-LIGHT-COMPANION: 1 → 2 (the owner↔leaf contract gained budgetMs; a protocol-1 main.js + this leaf = legacy for ALL)

// [colorHex, stripe] by ball number (WPA colors; 0 = cue).
export const BALL_COLORS = {
  0: ['#f3eedd', false], 1: ['#eeb200', false], 2: ['#1b56ad', false],
  3: ['#c3122a', false], 4: ['#552a86', false], 5: ['#e2621a', false],
  6: ['#0d7a3e', false], 7: ['#8c2130', false], 8: ['#191919', false],
  9: ['#eeb200', true], 10: ['#1b56ad', true], 11: ['#c3122a', true],
  12: ['#552a86', true], 13: ['#e2621a', true], 14: ['#0d7a3e', true],
  15: ['#8c2130', true],
};

// ---- discipline visual mappings (feature 012, render-capacity.md §2).
// Selected by the RACK KIND of the active scenario (game.js passes it), NOT
// the equipment ballset id — a pool rack on snooker-sized balls keeps its
// pre-012 pool visuals. Pool ids 0–15 above stay byte-untouched (FR-009).
//
// Snooker set: cue 0 white (measle-dot cue, no number), reds 1–15 uniform
// red with NO number/stripe ring, colours 16–21 yellow/green/brown/blue/
// pink/black with no numbers (WPBSA sets carry no numerals).
const SNOOKER_RED = '#b81220';
export const SNOOKER_BALL_COLORS = {
  0: '#f3eedd', 16: '#eeb200', 17: '#0d7a3e', 18: '#5d3a1e',
  19: '#1b56ad', 20: '#e2708c', 21: '#191919',
};
// Carom set: 0 breaker-white (marked cue — the measle dots double as the
// white/yellow distinction mark), 1 opponent YELLOW (World Cup Aramith
// convention — the modern second cue ball is yellow, not dotted-white;
// provenance: UMB World Cup 15.12.2025 hardware notes, Aramith 61.5 mm
// three-cushion set), 2 red. No numbers.
export const CAROM_BALL_COLORS = { 0: '#f3eedd', 1: '#eeb200', 2: '#c3122a' };
// GH-383 visual fork (owner pick pending): the UMB letter's alternative —
// TWO WHITE balls, the second one "spot" (dot-marked; Art 22.1 "the spot
// or yellow ball" sanctions both). Under 'marked' the STARTER's ball 0 is
// the PLAIN white (Art 23.2: "the player who starts ... plays with the
// white ball ... whereby one is spot") and ball 1 carries the measle-dot
// marks that the yellow otherwise provides.
export const CAROM_BALL_COLORS_MARKED =
  { 0: '#f3eedd', 1: '#f3eedd', 2: '#c3122a' };

// ---- issue #91: per-set POOL visuals, keyed by the KERNEL-truth ballset id
// (game.js passes template.system.equipment?.ballset_id — absent on the
// default serde-skipped composition, so aramith_pool/worn and any unknown
// id keep the legacy WPA paint above byte-identically). Hex tables are the
// issue's pixel-sampled per-ball sRGB values (2+ studio photos each);
// geometry uses the equirect chord law: a feature whose CHORD is a
// fraction f of the ball diameter D paints at asin(f)*512/PI px (the same
// derivation is documented on scene/balls.js makeBallMaps). Brand logos
// are OMITTED by policy (blank/ring-only reverse poles).
const chordPx = (f) => Math.asin(f) * (512 / Math.PI);

const POOL_SET_STYLES = {
  aramith_black: {
    // Aramith Tournament Black (Duramith): solids full-color; ALL seven
    // stripes get BLACK polar caps (the half-blackout TV identity); white
    // number circles retained everywhere with a thin black keyline.
    white: '#f2ecdc',       // the set's white (cue body + number circles)
    stripeBase: '#17141a',  // stripe polar caps
    colors: {
      1: '#f9b000', 2: '#0b52a5', 3: '#ec2b44',
      4: '#fd7583', // coral pink
      5: '#8862a3', // light purple
      // TUNING (medium confidence): jade with a teal lean — the research
      // flagged the 6/14 hue as jade-vs-teal ambiguous across photos;
      // retunable from the internal ballset research record.
      6: '#089580',
      7: '#ae6235', // sienna
      8: '#1b191c',
    },
    bandHalfPx: chordPx(0.50),   // stripe band ≈ 50%D, sharp edges (~85 px)
    disc: {
      rPx: chordPx(0.33),        // number circle chord ≈ 0.33D (~55 px)
      fill: '#f2ecdc', keyline: '#17141a', keylinePx: 2,
    },
    ring: null,
    // legacy digit stack scaled to the smaller disc (84 px @ 66 px disc)
    digit: { color: '#141210', px: 70, px2: 60, font: '"Helvetica Neue", Arial, sans-serif' },
    // TUNING (±30%): six small black dots ~0.06D diameter, octahedral
    // spread (the legacy measle stations); logo pole left blank. The chord
    // law maps the FULL 0.06D chord to a RADIUS of chordPx(0.06) — the
    // #91 review's factor-of-2 fix: chordPx(0.03) shipped 0.03D dots.
    cueMarks: { shape: 'dot', rPx: chordPx(0.06), color: '#17141a' },
  },
  arcos_reserve: {
    // Predator Arcos II Reserve (Super Aramith Pro formula): warm
    // VINTAGE-IVORY bodies/ring fills/cue; NO white disc on stripes; the
    // signature GUNSIGHT ring (chord ≈ 0.50D, ~0.02D black stroke, three
    // inward ticks at 120°) on every numbered ball at BOTH pole stations
    // (ring geometry kept on the reverse pole, cat logo omitted).
    // TUNING: ivory warmth #f3ebd5 is the recommended value (flagged
    // lower-confidence — visibly creamier than aramith_black's #f2ecdc).
    white: '#f3ebd5',
    stripeBase: '#f3ebd5',
    colors: {
      1: '#ffb318', 2: '#0959ae', 3: '#f42746', 4: '#7f5ab6',
      5: '#fe7546', // coral orange
      6: '#027f60', // pine
      7: '#c96c2d', // caramel (brown 7/15 family)
      8: '#0d0d10',
    },
    bandHalfPx: chordPx(0.53),   // stripe band ≈ 53%D (~91 px)
    disc: null,
    ring: {
      rPx: chordPx(0.50),        // gunsight chord ≈ 0.50D (~85 px)
      // stroke ≈ 0.02D FULL chord at the ring: lineWidth is a full width
      // (two half-extents), latitude-corrected at the lat-30° ring crown —
      // 2·0.02/cos(asin(0.50))·512/PI ≈ 7.5 px (#91 review factor-of-2
      // fix: the single-0.02 numerator shipped a ~0.01D stroke)
      strokePx: (0.04 / Math.cos(Math.asin(0.50))) * (512 / Math.PI),
      color: '#141210',
      fill: '#f3ebd5',           // "ring fills = ivory" (digit legibility)
      // TUNING (±30%, no published size): ticks ~3x stroke, inward-pointing
      tickLenPx: 12, tickWidthPx: 9,
    },
    // modern rounded sans ~0.23D digit height (cap ≈ asin(0.23)*512/PI
    // ≈ 38 px → ~53 px font); platform rounded stacks with plain fallback
    digit: {
      color: '#141210', px: 53, px2: 45,
      font: '"Arial Rounded MT Bold", "Nunito", "Varela Round", "Hiragino Maru Gothic ProN", Arial, sans-serif',
    },
    // TUNING (±30%): six solid black triangles ~0.10D edge, seeded varied
    // orientation; logo pole blank. Circumradius = edge/sqrt(3), and the
    // chord law wants the CIRCUMCIRCLE chord (2·edge/sqrt(3) = 0.2/sqrt(3)
    // for the 0.10D edge) INSIDE the asin — the #91 review's factor-of-2
    // fix: chordPx(0.10)/sqrt(3) shipped ~0.05D edges.
    cueMarks: { shape: 'tri', rPx: chordPx(0.2 / Math.sqrt(3)), color: '#141210' },
  },
};
// The neutral twins of the renamed ballset ids bind the same style objects.
POOL_SET_STYLES.pool_black_cap = POOL_SET_STYLES.aramith_black;
POOL_SET_STYLES.pool_ivory_gunsight = POOL_SET_STYLES.arcos_reserve;

/** Per-ball paint spec for a styled pool set (null = legacy WPA paint).
 * Returns [hex-for-tinting, style-for-makeBallMaterial]. */
export function poolSetStyle(ballsetId, id) {
  const s = POOL_SET_STYLES[ballsetId];
  if (!s) return null;
  const hex = id === 0 ? s.white : s.colors[id > 8 ? id - 8 : id];
  return [hex ?? '#888888', s];
}

/** [hex, stripe, paintNum, style] for a ball id under a discipline mapping.
 * `paintNum` feeds makeBallMaterial: id (pool, unchanged), 0 (measle cue)
 * or null (plain ball — number/dots suppressed, same procedural pipeline).
 * `ballsetId` (issue #91, optional trailing arg) selects a styled POOL set;
 * `style` is undefined for every legacy/unknown id (byte-identical paint). */
function ballVisual(mapping, id, ballsetId, caromSecondBall) {
  if (mapping === 'snooker') {
    return [SNOOKER_BALL_COLORS[id] ?? SNOOKER_RED, false, id === 0 ? 0 : null];
  }
  if (mapping === 'carom') {
    if (caromSecondBall === 'marked') {
      // GH-383 'marked' variant: plain white starter (ball 0, no marks),
      // dot-marked second white (ball 1 takes the measle stations), red
      // unchanged. Default/absent value keeps the shipped yellow paint
      // byte-identically (the fork is owner-gated).
      return [CAROM_BALL_COLORS_MARKED[id] ?? '#888888', false,
        id === 1 ? 0 : null];
    }
    return [CAROM_BALL_COLORS[id] ?? '#888888', false, id === 0 ? 0 : null];
  }
  const styled = poolSetStyle(ballsetId, id);
  if (styled) {
    const [hex, style] = styled;
    return [hex, id >= 9 && id <= 15, id, style];
  }
  const [hex, stripe] = BALL_COLORS[id] ?? ['#888888', false];
  return [hex, stripe, id];
}

/**
 * Build one mesh per scenario ball (order = scenario order = sampler order).
 * Returns { group, balls } where balls[i] = { id, mesh, baseQuat, pocketed }.
 * Fills the shared analytic-sphere uniforms (index = scenario index).
 * `mapping` selects the discipline visual set ('pool' default | 'snooker' |
 * 'carom' — feature 012); existing call sites omit it and are unchanged.
 * `ballsetId` (issue #91, optional key) selects a styled pool set from the
 * KERNEL-truth equipment tag; undefined/unknown/worn ids keep the legacy
 * WPA paint. The style rides makeBallMaterial's EXISTING signature as a
 * trailing arg — a stale-cached scene/balls.js ignores it (WPA degrade,
 * boot rule 5), a stale ballset.js never passes it.
 * `caromSecondBall` (GH-383 visual fork, optional key): 'marked' paints
 * carom ball 1 as the dot-marked second WHITE (UMB Art 22.1 letter, ball
 * 0 plain); absent/'yellow' keeps the shipped yellow paint byte-identically.
 */
export function buildBallSet({
  shared, scenarioBalls, envMap, mapping = 'pool', ballsetId,
  caromSecondBall,
}) {
  const group = new THREE.Group();
  // kernel truth for the rendered radius: equipment ballsets (snooker,
  // carom) re-rack at THEIR radius — the meshes and shadow uniforms follow
  // the scenario's params (default ballset ≡ the scene mirror R)
  const r = scenarioBalls[0]?.params?.r ?? R;
  // lighter tessellation than the spike's 96×64: ten live balls + 60 fps
  const geo = new THREE.SphereGeometry(r, 64, 42);
  const balls = scenarioBalls.map((b, idx) => {
    const [hex, stripe, paintNum, style] =
      ballVisual(mapping, b.id, ballsetId, caromSecondBall);
    // phenolic material (scene/balls.js): clearcoat polish + ink roughness
    const mat = makeBallMaterial(paintNum, hex, stripe, 1000 + b.id, envMap ?? null, style);
    // game.js disposeBalls() disposes material.map + material; the per-ball
    // roughness map rides along here (the micro-normal is SHARED — leave it)
    mat.addEventListener('dispose', () => mat.roughnessMap?.dispose());
    // ORDER-LAND-638: the ball's own radius for the derived contact occlusion (venue shading only; ignored on ?venue=off)
    if (idx < MAXS) injectAnalytic(mat, shared, idx, 'ball', { radius: r });
    const mesh = new THREE.Mesh(geo, mat);
    kPosToThree(mesh.position, b.state.pos.x, b.state.pos.y, b.state.pos.z);
    // stable "logo toward head rail" start orientation, varied per ball
    mesh.quaternion.setFromEuler(new THREE.Euler(0, b.id * 0.7, 0));
    group.add(mesh);
    if (idx < MAXS) {
      shared.uSpheres.value[idx].set(mesh.position.x, mesh.position.y, mesh.position.z, r);
      // uSphereCols keeps the historical DOUBLE-linearized values: three r152+
      // setHex already converts sRGB->linear, so convertSRGBToLinear() here
      // applies the transform twice — but the ball-ball inter-reflection
      // look (uInterStrength 0.7) was calibrated against exactly these
      // values, so they stay (review GH-385 r2/r6 resolution). The GH-385 AO
      // interreflection closure needs the PHYSICAL albedo instead — its
      // scalar luminance ships separately in uSphereLum (correct
      // single-linear, computed here on the CPU).
      const c385 = new THREE.Color(hex); // single-linear (setHex converts)
      const lumOf = (col) => 0.2126 * col.r + 0.7152 * col.g + 0.0722 * col.b;
      let lum385 = lumOf(c385);
      if (stripe) {
        // striped balls (review GH-385 r11/r12): hex paints only the band.
        // Styled kits: caps carry style.stripeBase and the band is
        // ≈ 0.50-0.53 D (bandHalfPx) — zone area is linear in band height,
        // so the split is ~half/half. The DEFAULT sets (style undefined)
        // take scene/balls.js's legacy paint: ivory caps with the band on
        // latitude rows 0.30-0.70 — 0.588 of the sphere by zone area.
        const cap = new THREE.Color(style?.stripeBase ?? '#f3eedd');
        const lumCap = lumOf(cap);
        lum385 = style?.stripeBase
          ? 0.5 * lum385 + 0.5 * lumCap
          : 0.588 * lum385 + 0.412 * lumCap;
      }
      if (paintNum !== null && paintNum > 0) {
        // number discs / ring fills (review r14/r15) — keyed off paintNum
        // (snooker/carom plain balls carry none). Two spherical caps of
        // angular radius rPx·π/512: exact zone area 1 − cos(that), one cap
        // per station. Styled kits carry disc.rPx (aramith style) or the
        // arcos gunsight ring.rPx (fill ivory); the legacy paint uses
        // 66 px ivory discs. Glyph ink is < 1% — the closure enters as
        // V·(1+ρ(1−V)), so paint decomposition below a few percent of ρ
        // moves T(V) by well under 2% and is deliberately left out.
        const rPx = style
          ? (style.disc?.rPx ?? style.ring?.rPx ?? 0) : 66;
        if (rPx > 0) {
          const fDisc = Math.min(0.25, 1 - Math.cos(rPx * Math.PI / 512));
          const fill = new THREE.Color(
            (style ? (style.disc?.fill ?? style.ring?.fill) : null) ?? '#f3eedd');
          // the disc REPLACES band paint (it sits inside the stripe band /
          // on the solid body — both are hex), not the sphere-wide average
          // (review r16)
          lum385 += fDisc * (lumOf(fill) - lumOf(c385));
        }
      }
      // optional-chained: a stale pre-GH-385 shading.js has no uSphereLum
      // (and no closure to feed) — the mixed-cache boot must not throw
      if (shared.uSphereLum) {
        shared.uSphereLum.value[idx] = lum385;
      }
      shared.uSphereCols.value[idx] = c385.clone().convertSRGBToLinear();
    }
    return { id: b.id, r, mesh, baseQuat: mesh.quaternion.clone(), pocketed: false, sinkT: -1 };
  });
  shared.uSphereCount.value = Math.min(balls.length, MAXS);
  // ORDER-LIGHT-9 Q1: the live set registers with gi.js so a completed GI apply fills the resting balls' SH
  // blocks (the boot-order defect: the one boot sync ran before the GI load resolved)
  giMod.registerBallSet?.(balls);
  return { group, balls };
}

/** Push current mesh positions into the shared sphere uniforms (shadows)
 * and refresh each live ball's baked-GI SH probe (scene/gi.js) so the ball
 * ambient tracks the local cloth bounce as it rolls. */
export function syncSphereUniforms(shared, balls) {
  const n = Math.min(balls.length, MAXS);
  for (let i = 0; i < n; i++) {
    const b = balls[i];
    if (b.pocketed) shared.uSpheres.value[i].set(0, -10, 0, 1e-3);
    else shared.uSpheres.value[i].set(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, b.r ?? R);
  }
  shared.uSphereCount.value = n;
  giMod.updateBallProbes?.(balls, 'main'); // C2-FIX2 A: main's own sampling path (a stale gi.js ignores the argument)
}
