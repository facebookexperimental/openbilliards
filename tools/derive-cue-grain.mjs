// Copyright (c) Meta Platforms, Inc. and affiliates.

// derive-cue-grain.mjs — GH-525 S3 R2 derivation + drift gate for the wood
// grain shipped on the DEFAULT cue (`maple_played`) and the massé cue
// (`masse_soft`) in web/scene/cuelooks.js.
// Run: node tools/derive-cue-grain.mjs   (exits non-zero on any drift)
//      node tools/derive-cue-grain.mjs --report   (full derivation report)
//
// WHY THIS FILE EXISTS. The four classes already on the fine-grain painter
// (`maple_ld`, `break_phenolic`, `jump_short`, `carom_conical`) carry
// hand-tuned option sets — `lines: 15, drift: 1.6, amp: 0.055` and so on.
// Those numbers are taste, and the house law is that a material parameter
// cites a measurement, a publication or a reference photograph. So the
// default cue does NOT get a fifth tuned option set. Its grain is a closed
// form in ONE physical unknown (mean growth-ring width), with the placement
// law, the taper response and every resolution ceiling derived here.
//
// ─────────────────────────────────────────────────────────────────────────
// 1. THE PLACEMENT LAW — where grain lines fall on a turned shaft
//
// A cue shaft is turned along the grain from a billet cut far enough from
// the pith that ring curvature across a ~13 mm shaft is negligible. Model
// the growth-ring boundaries as parallel planes, spacing w, parallel to the
// cylinder axis. Put the cylinder axis on z and the ring normal on x, so the
// boundaries are the planes x = k·w, k ∈ ℤ.
//
// A point on the shaft surface at azimuth φ and axial station v sits at
// x = R(v)·cos φ. It lies ON a ring boundary exactly when x is a multiple of
// w, so the whole field reduces to one scalar — the RING PHASE:
//
//     ψ(φ, v) = R(v)·cos(φ) / w            [in units of rings]
//
// and a grain line is the locus frac(ψ) ≈ 0. Everything the eye reads off a
// real shaft follows from ψ without a single tuned term:
//
//   • LINE COUNT. |ψ| runs 0 → R/w and back as φ sweeps a half turn, so the
//     full circumference carries 2·D/w lines (D = diameter). Nothing sets
//     this; it falls out of the diameter and the ring width.
//   • THE QUARTER FACE. dψ/dφ = −R·sin(φ)/w peaks at φ = 90°, where the ring
//     planes are edge-on: lines crowd to their tightest, w apart in arc.
//     This is the "quartersawn" face of the shaft.
//   • THE CATHEDRAL FACE. At φ = 0 the planes are face-on, dψ/dφ = 0, and
//     the spacing opens out to a broad clear band. This is the flat-sawn
//     crown, and it is the single most recognisable thing about a real
//     shaft that the shipped map does not have.
//   • TAPER. R(v) is the segment's own linear taper, so the line count
//     rises from the ferrule to the joint on its own.
//   • SYMMETRY, AND NO SEAM. cos φ is even about φ = 0 and about φ = π, so
//     the pattern already carries the two mirror axes the existing painter
//     fakes with `foldX`, and it is exactly periodic over one wrap — so the
//     mirror fold is dropped on this path and the wrap seam cannot exist.
//     (The fold was a seam-hiding device; the physics happens to have the
//     symmetry it was imitating, which is why it looked right.)
//
// 2. THE PROFILE — one harmonic, and why not a band
//
// FPL GTR-282 ch.3: *Acer* is DIFFUSE-POROUS. Vessel diameter is near
// constant across the ring, so there is no earlywood→latewood step — the
// order-of-magnitude step that makes the ash chevron a hard band (and that
// `makeAshMap` correctly paints for *Fraxinus*) is absent here. A band
// profile would encode a step this species does not have, and its width
// would be a second invented number. The lowest-order periodic function of
// ring phase that is consistent with "gradual density gradient, no step" is
// a single harmonic:
//
//     grain(φ, v) = cos(2π·ψ(φ, v))
//
// No width parameter, no shape parameter. Amplitude is the one free scalar
// and it is tagged Estimated below.
//
// 3. WHAT THE TEXTURE CANNOT SHOW — the resolution ceilings
//
// FPL GTR-282 ch.3 hardwood anatomy, used as ceilings, not as targets:
//   vessel diameter      50–200 µm
//   vessel element len   100–1200 µm
//   fibre length         0.2–1.2 mm
//   rays                 1–5 cells wide, < 1 mm high
// The shipped texel sizes are computed in §C below and checked against
// these. The result decides what may be claimed: anything the axial texel
// cannot resolve is NOT drawn as a feature, it is carried as an unresolved
// high-frequency stipple, and the provenance row says so.
//
// 4. PROVENANCE
//   Derived   — the phase CARRIER psi = R(v)·cos(phi)/w, the harmonic
//               profile, the taper response, the line counts, every
//               texel/ceiling number.
//   Published — FPL GTR-282 ch.3 (public domain) anatomy ceilings and the
//               diffuse-porous fact that rules out a band profile.
//   Estimated — mean ring width w, the dispersion CV, the seed-drawn billet
//               registration, and the grain contrast. Tagged at the call
//               site in cuelooks.js with the reason and the measurement that
//               would settle them.
//   And note WHERE those Estimated terms sit: w, the registration and the CV
//   warp are all inside the phase, so they move where the lines fall. The
//   shipped placement is therefore MIXED — a derived carrier plus an authored
//   perturbation — not Derived, which is the tier this file's §E tests can
//   NOT establish: they check mirror, taper and scale, and every one of those
//   is satisfied by any monotone function of R·cos(phi), warped or not.
import fs from 'node:fs';
import { ensureRealThree, repoUrl, repoRoot }
  from '../web/tools/render/lib/ensure-three.mjs';

const REPORT = process.argv.includes('--report');
let failed = 0;
const fail = (m) => { failed += 1; console.error(`FAIL  ${m}`); };
// An `ok` line almost always summarises the check just above it, and the
// natural way to write one — a loop that calls fail() per bad case, then an
// ok() after the loop — prints the summary UNCONDITIONALLY, including
// directly underneath its own failures. I wrote that shape three separate
// times in one round; a sweep found roughly a dozen more already in the two
// gates. Rather than guard a dozen call sites by hand and leave the shape
// available to the next one, ok() refuses to claim success when the failure
// count moved since the last one it printed. FAIL goes to stderr and ok to
// stdout, so the unguarded version was worse than untidy: a reader piping
// stdout saw a clean bill of health for a run that had failed.
//
// Green runs are byte-identical to before — the counter never moves, so every
// line still reads `ok`. Only a red run changes, and only to stop lying.
//
// The scope is "since the last ok LINE", not "for this check". That is
// positional, and the negative probe in the sister gate showed both ways it can
// be wrong on its own: a check that fails and skips its own ok() leaves the
// mark for the NEXT line to wear, and a summariser reporting failures raised
// much earlier finds the mark already spent and prints `ok` over its own bad
// news. So the counter is a floor, not the whole rule — a call site that knows
// it is red passes `red`, and the sites added this round emit exactly one line
// each so the mark cannot leak. Several older checks here are still written as
// `if (bad) fail(...) else ok(...)`, which leaks by one; that over-marks, and
// over-marking is the safe direction. `--` claims only that failures happened
// somewhere above, never that the line's own statement is false. The opposite
// bias — a clean `ok` sitting under a stderr failure the reader is not looking
// at — is the one that has actually bitten.
let okMark = 0;
const ok = (m, red = false) => {
  if (!REPORT) { okMark = failed; return; }
  console.log(red || failed > okMark ? `--    ${m}` : `ok    ${m}`);
  okMark = failed;
};
const say = (m) => { if (REPORT) console.log(m); };
const f = (x, n = 3) => Number(x).toFixed(n);

// ---- canvas shim (same contract as check-cue-looks.mjs gate 3b: the map
// painters use createImageData + putImageData and nothing else, so the REAL
// painter chain bakes REAL bytes here) -------------------------------------
const SHIM_PIXELS = Symbol('obShimPixels');
function installCanvasShim() {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const prev = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`canvas shim: no <${tag}>`);
      const cv = { width: 0, height: 0, [SHIM_PIXELS]: null };
      cv.getContext = (kind) => {
        if (kind !== '2d') throw new Error(`canvas shim: no '${kind}' context`);
        return {
          createImageData: (w, h) => ({ width: w, height: h,
            data: new Uint8ClampedArray(w * h * 4) }),
          putImageData: (img) => { cv[SHIM_PIXELS] = img; },
        };
      };
      return cv;
    },
  };
  return () => { if (had) globalThis.document = prev; else delete globalThis.document; };
}

ensureRealThree();
const uninstall = installCanvasShim();
const looks = await import(repoUrl('web/scene/cuelooks.js'));
const cuestick = await import(repoUrl('web/scene/cuestick.js'));
const table = await import(repoUrl('web/scene/table.js'));

/** Drain the progressive bake queue — a 128 px preview is not what ships. */
async function drain() {
  for (let i = 0; i < 20000 && looks.pendingMapBakes() > 0; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
  if (looks.pendingMapBakes() > 0) throw new Error('map bakes never settled');
}

// ═══════════════════════════════════════════════════════════════════════
// A. GEOMETRY — read off the BUILT cue, never re-typed
// ═══════════════════════════════════════════════════════════════════════
// Reading the geometry the player gets is the only way this file cannot
// drift from cuestick.js: a taper change moves these numbers here too.
const SEG = ['tip', 'ferrule', 'shaft', 'joint', 'butt', 'cap'];
function segGeom(cueId, opts = {}) {
  const { group } = cuestick.buildCue(
    cueId === null ? { ...opts } : { cueId, ...opts });
  const out = {};
  group.children.forEach((m, i) => {
    const p = m.geometry.parameters;
    // CylinderGeometry(radiusTop, radiusBottom, height): radiusTop is the
    // TIP-ward end of every segment (buildCue lays them tip → butt), and
    // three's torso UV puts uv.v = 1 at radiusTop. A CanvasTexture is
    // flipY, so uv.v = 1 is canvas row 0 — canvas y = 0 is the TIP-ward
    // end, which is the convention cuelooks.js already documents for the
    // carom ferrule seam and the carbon collar ring.
    // radialSegments / heightSegments and the realised vertex count come along
    // because §F and §H are about the PARAMETERISATION, not just the profile:
    // the UV aspect that sets three's derivative tangent frame is 2*pi*R : L,
    // and the cost of escaping that frame is one vec4 per vertex of the built
    // geometry. Both are read here so neither is ever typed.
    out[SEG[i]] = { rTop: p.radiusTop, rBot: p.radiusBottom, len: p.height,
      radial: p.radialSegments, heightSegs: p.heightSegments,
      verts: m.geometry.attributes.position.count };
  });
  return out;
}
// The class names this file reports under are not catalog ids, and the pairing
// between them used to be typed twice — here and again in §D's CASES table.
// Two copies of a mapping is one copy too many for a file whose whole subject
// is figures that were right when they were typed, so the table is authored
// once and §D asserts against it rather than restating it. §H4a needs it as
// well: it reads each class's OWN authored roughness, and reading the default
// look's for all three would have made two of its three cues wrong.
const CUE_CLASS = Object.freeze({
  maple_played: 'standard',
  masse_soft: 'masse_trick',
  maple_ld: 'low_deflection',
});
const GEOM = Object.fromEntries(Object.entries(CUE_CLASS)
  .map(([cls, cueId]) => [cls, segGeom(cueId)]));

// ═══════════════════════════════════════════════════════════════════════
// B. THE DEFECT, MEASURED — what the shipped default map actually paints
// ═══════════════════════════════════════════════════════════════════════
// §2.3 of the lane plan calls the shipped read "fake large blotches", quoting
// cuelooks.js's own comment. That is a description; this is the measurement.
// Dominant feature wavelength per axis, from the power spectrum of the
// luminance field, converted to millimetres through the segment's own size.
function luma(img) {
  const { width: W, height: H, data: d } = img;
  const L = new Float64Array(W * H);
  for (let i = 0, p = 0; i < L.length; i++, p += 4) {
    L[i] = 0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2];
  }
  return { L, W, H };
}
/** Power-weighted mean and peak wavelength (in TILES) along one axis.
 * Rows/columns are transformed independently and their spectra averaged, so
 * a feature that wanders (grain does) still lands on its own frequency. */
function dominantWavelength({ L, W, H }, axis, kMax = 64) {
  const n = axis === 'x' ? W : H, m = axis === 'x' ? H : W;
  const power = new Float64Array(kMax + 1);
  for (let j = 0; j < m; j++) {
    let mean = 0;
    for (let i = 0; i < n; i++) mean += L[axis === 'x' ? j * W + i : i * W + j];
    mean /= n;
    for (let k = 1; k <= kMax; k++) {
      let re = 0, im = 0;
      const c = (2 * Math.PI * k) / n;
      for (let i = 0; i < n; i++) {
        const v = L[axis === 'x' ? j * W + i : i * W + j] - mean;
        re += v * Math.cos(c * i); im -= v * Math.sin(c * i);
      }
      power[k] += (re * re + im * im) / (n * n);
    }
  }
  let tot = 0, wsum = 0, peak = 1, pk = 0;
  for (let k = 1; k <= kMax; k++) {
    tot += power[k];
    wsum += power[k] * (1 / k);       // weight WAVELENGTH, not frequency
    if (power[k] > pk) { pk = power[k]; peak = k; }
  }
  return { meanTiles: tot > 0 ? wsum / tot : 0, peakTiles: 1 / peak };
}
/** Physical span of one texture TILE on a segment, in mm.
 * `repeat` r means the tile covers 1/r of the segment. Circumference is
 * taken at the mid-taper radius; the ends are reported alongside. */
function tileSpanMM(seg, repeatX, repeatY) {
  const rMid = (seg.rTop + seg.rBot) / 2;
  return {
    circ: (2 * Math.PI * rMid * 1000) / repeatX,
    axial: (seg.len * 1000) / repeatY,
    circMin: (2 * Math.PI * Math.min(seg.rTop, seg.rBot) * 1000) / repeatX,
    circMax: (2 * Math.PI * Math.max(seg.rTop, seg.rBot) * 1000) / repeatX,
  };
}

const shippedShaft = table.makeWoodMap(3101, 216, 186, 140);
const shippedButt = table.makeWoodMap(3102, 66, 38, 30);
const SHIPPED_REPEAT = shippedShaft.repeat.x;
const shaftImg = luma(shippedShaft.image[SHIM_PIXELS]);
const spanShaft = tileSpanMM(GEOM.maple_played.shaft,
  SHIPPED_REPEAT, shippedShaft.repeat.y);
const wxShaft = dominantWavelength(shaftImg, 'x');
const wyShaft = dominantWavelength(shaftImg, 'y');

say('\n══ B. THE SHIPPED DEFAULT SHAFT MAP, MEASURED ══');
say(`  painter        makeWoodMap(3101, 216,186,140)  ${shaftImg.W}x${shaftImg.H}`
  + `  repeat=${SHIPPED_REPEAT}`);
say(`  tile covers    ${f(spanShaft.circ, 1)} mm around (${f(spanShaft.circMin, 1)}`
  + `–${f(spanShaft.circMax, 1)} over the taper) x ${f(spanShaft.axial, 1)} mm along`);
say(`  circumferential  mean feature ${f(wxShaft.meanTiles * spanShaft.circ, 1)} mm`
  + `   peak ${f(wxShaft.peakTiles * spanShaft.circ, 1)} mm`);
say(`  axial            mean feature ${f(wyShaft.meanTiles * spanShaft.axial, 1)} mm`
  + `   peak ${f(wyShaft.peakTiles * spanShaft.axial, 1)} mm`);

// The blotch finding, as a number rather than an adjective: a feature is a
// BLOTCH when it is coarser than the anatomy can produce. The largest thing
// wood anatomy makes at this scale is a growth ring, and even a slow-grown
// ring is a couple of millimetres.
const BLOTCH_MM = 10; // an order of magnitude above any ring width
const blotchCirc = wxShaft.meanTiles * spanShaft.circ;
const blotchAxial = wyShaft.meanTiles * spanShaft.axial;
if (blotchCirc < BLOTCH_MM && blotchAxial < BLOTCH_MM) {
  fail('the shipped default shaft map no longer measures as blotchy — this '
    + 'gate encodes the R2 premise, so re-read the premise before editing it');
}
ok(`shipped default shaft grain is ${f(blotchCirc / BLOTCH_MM, 1)}x/`
  + `${f(blotchAxial / BLOTCH_MM, 1)}x coarser than the ${BLOTCH_MM} mm `
  + 'blotch floor (the R2 premise, measured)');

// THE SECOND DEFECT, which the plan did not name: repeat = 1.1 is not a
// tiling, it is a SEAM. The painter is not periodic in either axis, so a
// non-integer repeat lays a hard discontinuity wherever the wrap lands
// inside the segment.
if (SHIPPED_REPEAT !== 1 && Number.isInteger(SHIPPED_REPEAT) === false) {
  const seamsAround = Math.floor(SHIPPED_REPEAT);
  const axialSeamAt = (1 / SHIPPED_REPEAT) * GEOM.maple_played.shaft.len * 1000;
  say(`  SEAM           repeat ${SHIPPED_REPEAT} on a non-periodic painter: `
    + `${seamsAround} longitudinal seam(s) around the shaft, and a transverse`);
  say(`                 seam at ${f(axialSeamAt, 0)} mm from the tip end `
    + `(${f(100 / SHIPPED_REPEAT, 1)}% along a ${f(GEOM.maple_played.shaft.len * 1000, 0)} mm shaft)`);
}

// ═══════════════════════════════════════════════════════════════════════
// C. THE RESOLUTION BUDGET — what any texture size can honestly claim
// ═══════════════════════════════════════════════════════════════════════
const FPL = {                       // GTR-282 ch.3, public domain
  vesselDiaMinUM: 50, vesselDiaMaxUM: 200,
  vesselElemMinUM: 100, vesselElemMaxUM: 1200,
  fibreMinMM: 0.2, fibreMaxMM: 1.2,
  rayMaxHighMM: 1.0,
};
const PX = 1024;                    // the closeup-register size
function texel(seg, px, repeatX, repeatY) {
  const s = tileSpanMM(seg, repeatX, repeatY);
  return { circMM: s.circ / px, axialMM: s.axial / px, span: s };
}
const tShaft = texel(GEOM.maple_played.shaft, PX, 1, 1);
const tButt = texel(GEOM.maple_played.butt, PX, 1, 1);
const tOld = texel(GEOM.maple_played.shaft, 512, SHIPPED_REPEAT, SHIPPED_REPEAT);

say('\n══ C. RESOLUTION BUDGET ══');
say(`  shipped 512 @${SHIPPED_REPEAT}  shaft texel ${f(tOld.circMM, 4)} mm around`
  + ` x ${f(tOld.axialMM, 3)} mm along`);
say(`  R2      ${PX} @1     shaft texel ${f(tShaft.circMM, 4)} mm around`
  + ` x ${f(tShaft.axialMM, 3)} mm along`);
say(`                    butt  texel ${f(tButt.circMM, 4)} mm around`
  + ` x ${f(tButt.axialMM, 3)} mm along`);
// The ~1 mm/texel claim in the fine-grain painter's own header is about the
// AXIAL direction on a meter-class segment. Hold it to that.
if (tShaft.axialMM > 1.05) {
  fail(`R2 shaft axial texel is ${f(tShaft.axialMM, 3)} mm — the closeup `
    + `register claims ~1 mm/texel and ${PX} px no longer delivers it`);
}
ok(`axial texel ${f(tShaft.axialMM, 3)} mm holds the ~1 mm/texel closeup claim`);

// What the anatomy ceilings mean at that texel size. These are the honest
// limits, computed rather than asserted.
const vesselTexelsAxial = (FPL.vesselElemMaxUM / 1000) / tShaft.axialMM;
const vesselTexelsCirc = (FPL.vesselDiaMaxUM / 1000) / tShaft.circMM;
const rayTexelsAxial = FPL.rayMaxHighMM / tShaft.axialMM;
say(`  a LARGEST vessel (${FPL.vesselDiaMaxUM} µm across, ${FPL.vesselElemMaxUM} µm long)`
  + ` spans ${f(vesselTexelsCirc, 2)} texels around, ${f(vesselTexelsAxial, 2)} along`);
say(`  a TALLEST ray (${FPL.rayMaxHighMM} mm) spans ${f(rayTexelsAxial, 2)} texels along`);
const UNRESOLVED = vesselTexelsAxial < 2 && rayTexelsAxial < 2;
if (!UNRESOLVED) {
  fail('the anatomy ceilings now resolve at this texel size — the "no pore '
    + 'or ray detail is drawn" provenance row is no longer the honest one');
}
ok(`pore and ray detail are below the Nyquist limit of the shipped texture in `
  + `the AXIAL direction (${f(vesselTexelsAxial, 2)} and `
  + `${f(rayTexelsAxial, 2)} texels, both under two) — so they may be carried `
  + 'only as unresolved stipple, never drawn as features (plan §8). Note the '
  + `qualifier: the same vessel spans ${f(vesselTexelsCirc, 2)} texels AROUND, `
  + 'which is over Nyquist, so "entirely sub-texel" is not what this budget '
  + 'says and must not be quoted from it');

// ── THE SAMPLER BUDGET, AGAINST THE WRAP THAT DEMANDS IT ────────────────
// R2 derived this, measured its visible effect, and then cut it: the sampler
// cap stayed where the rest of the tree had it because the framing at which
// it binds is the grazing axial view, and the atelier rig cannot pose one.
// None of that is in dispute here and nothing below proposes changing the
// constant. What changed is WHERE the quantity lives. The module's own
// paragraph carried the ratio as a typed figure — "26 for the default shaft"
// — against an arithmetic 25.4: not a rounding of anything, wrong in the
// third digit, and printed nowhere that could disagree with it. The literal
// is gone from the module, this is what replaced it, and the guard at the end
// of this block is what stops it coming back.
const looksSrc = fs.readFileSync(`${repoRoot}/web/scene/cuelooks.js`, 'utf8');

// Prose cannot create a material term. §F and §H sweep cuelooks.js for the
// names a held channel would arrive under, and both were counting raw words
// over the whole file — comments and provenance strings included — so the
// only way to DISCUSS a hold was to not name it. That is not a hypothetical:
// the paragraph above ANISO_DEFAULT explains the sampler cap for twenty lines
// without once saying "anisotropy", because saying it turned this tool red.
// §G already had the right rule one section down ("guarded on the instrument
// and the unit, deliberately not on the word") and this is that rule applied
// to the other two: the sweeps read CODE, the disclosure stays free, and the
// claim stays unreachable by paraphrase because paraphrase cannot bind a
// uniform. §G itself keeps reading looksSrc — it guards a CLAIM (a gloss
// reading asserted anywhere, prose included), not a term.
//
// Blanks comments and string bodies to spaces, preserving length and line
// breaks so every offset and line number downstream still points where it
// did. Template `${...}` interpolations are code and stay visible. The one
// construct it would mangle is a regex literal containing a quote character:
// there are none in cuelooks.js, and the self-check below measures that two
// ways rather than trusting the sentence — the code landmarks must survive,
// and no single- or double-quoted literal may run across a line break, which
// a real string cannot do and a scanner that has mistaken a regex for one
// does at the first quote it meets on a later line.
//
// A QUOTED PROPERTY NAME IS CODE, NOT PROSE. `{ 'normalMap': tex }`,
// `{ ['normalMap']: tex }` and `mat['normalMap'] = tex` bind the channel
// exactly as the bare spelling does, and the first cut of this scanner
// blanked every one of them — so a recipe written with quoted or computed
// keys carried a held channel past §F and §H using an ordinary alternate
// JavaScript spelling and nothing else (GH-613, hole 4). A string literal is
// therefore left visible when the token after it (past whitespace and
// comments) is a colon, or when it is the whole content of a bracket pair —
// the computed key and the computed member access. Parentheses that enclose
// nothing but the literal are trivia on the way to those tokens, so
// `m[('normalMap')]` reads as `m['normalMap']` — a one-character wrapper is
// not a different spelling. The colon rule also keeps a ternary consequent
// (`flag ? 'normalMap' : 'map'`) and a `case` label visible: the first IS a
// property name whenever the ternary sits inside brackets and the scanner
// cannot tell which ones do, and both err in the direction that reds a
// landed channel rather than the one that waves it through; with the paren
// rule a single-string call in that position (`f ? g('x') : h`) is kept
// too, the same side of the same line.
//
// A LIST OF KEYS IS KEYS. `for (const k of ['normalMap', 'roughnessMap'])
// m[k] = tex[k]` binds both channels with no name between the literal and
// the property, and the bracket rule above saw only the one-element case —
// the second element turned the whole list back into a value. An element of
// an array literal whose elements are all string literals is therefore kept
// visible, walked back over strings, commas and trivia to the `[` and
// forward to the `]`, UNLESS the array is bound to a name: `= [`, `: [` or
// an argument (`( [`, `, [`). A bound list reaches a property only through
// that name, which is the variable residual stated below, and the live
// module has such a list that MUST name the held channels — MAP_PROPS, the
// prewarm's enumeration, which check-cue-looks.mjs holds equal to the held
// ledger so that a promotion cannot skip the prewarm. Reading that list as
// code would red this sweep on the list that exists to name the holds, and
// the only way to keep it green would be an exemption by name. Measured on
// cuelooks.js when the key rules landed: 104 quoted keys, every one a
// '<slot>.<prop>' provenance row, zero computed keys, zero strings in a
// ternary, one unbound string list (the prewarm's slot names) — and no sweep
// below gained a hit, because the kept strings name slots and properties,
// not channels. Every string VALUE stays blanked, and the values are where
// the disclosures live, so the freedom the paragraph above bought is
// intact — at the price that a disclosure written as an unbound string list
// or as the sole argument of a call in a ternary consequent is now read as
// code. What this still cannot see is a name that reaches the property
// through an expression — `'normal' + 'Map'`, a variable or a bound list, a
// template with a `${...}` seam, a string handed to Object.defineProperty,
// Reflect.set or setValues — which is a value to the scanner and stays
// blanked; the MAT_KEYS check at the end of §H is the runtime half that does
// not depend on spelling.
function stripProse(src, diag = {}) {
  const out = src.split('');
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
  // Sync record for the self-check: a single- or double-quoted literal that
  // ran across a line break, and a scan that ended inside a literal. Neither
  // is possible in a source that parses, so either means the scanner opened
  // a string where the source has none.
  diag.crossed = 0;
  diag.open = false;
  // Step over the whitespace and comments a property name may be separated
  // from its colon or its brackets by, forwards and backwards. Backwards only
  // knows block comments: a line comment cannot end where a bracket is.
  const trivia = (j) => {
    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j += 1;
      if (src[j] === '/' && src[j + 1] === '/') {
        while (j < src.length && src[j] !== '\n') j += 1;
      } else if (src[j] === '/' && src[j + 1] === '*') {
        const e = src.indexOf('*/', j + 2);
        j = e === -1 ? src.length : e + 2;
      } else return j;
    }
  };
  const triviaBack = (j) => {
    for (;;) {
      while (j >= 0 && /\s/.test(src[j])) j -= 1;
      if (j >= 1 && src[j] === '/' && src[j - 1] === '*') {
        const s = src.lastIndexOf('/*', j - 2);
        j = s === -1 ? -1 : s - 1;
      } else return j;
    }
  };
  // The bounds of a string literal read from the raw source: forwards from
  // its opening quote to the index past its closing one, backwards from its
  // closing quote to the index of its opening one; -1 when j is not on a
  // quote or the literal does not close on that side. A template holding a
  // `${...}` seam is an expression, not a name, and reads as -1 too.
  const isQuote = (ch) => ch === "'" || ch === '"' || ch === '`';
  const strFwd = (j) => {
    const q = src[j];
    if (!isQuote(q)) return -1;
    for (let k = j + 1; k < src.length; k += 1) {
      if (src[k] === '\\') { k += 1; continue; }
      if (src[k] === q) return k + 1;
      if (q === '`' ? src[k] === '$' && src[k + 1] === '{' : src[k] === '\n') return -1;
    }
    return -1;
  };
  const strBack = (j) => {
    const q = src[j];
    if (!isQuote(q)) return -1;
    for (let k = j - 1; k >= 0; k -= 1) {
      if (src[k] === q) {
        let bs = 0;
        while (k - 1 - bs >= 0 && src[k - 1 - bs] === '\\') bs += 1;
        if (bs % 2 === 0) return k;
      } else if (q === '`' ? src[k] === '{' && src[k - 1] === '$' : src[k] === '\n') return -1;
    }
    return -1;
  };
  // Step outward over parentheses that enclose nothing but the literal, one
  // matched pair at a time: the index of the token before and the token
  // after, with the wrapper gone.
  const unwrap = (s, e) => {
    let b = triviaBack(s - 1);
    let a = trivia(e);
    while (src[b] === '(' && src[a] === ')') { b = triviaBack(b - 1); a = trivia(a + 1); }
    return [b, a];
  };
  // Is the literal whose neighbouring tokens sit at b (before) and a (after)
  // an element of an array literal made only of string literals, and is
  // that array unbound? Back over commas and strings to `[`, forward to `]`;
  // a parenthesised element is stepped over like the literal itself was.
  // Anything else on the way — an identifier, a call, a spread, a template
  // seam — answers no, and so does a `[` that a name is bound to.
  const inKeyList = (b, a) => {
    let j = b;
    while (src[j] !== '[') {
      if (src[j] !== ',') return false;
      j = triviaBack(j - 1);
      while (src[j] === ')') j = triviaBack(j - 1);
      if (src[j] === '[') break;
      j = strBack(j);
      if (j === -1) return false;
      j = triviaBack(j - 1);
      while (src[j] === '(') j = triviaBack(j - 1);
    }
    const bound = triviaBack(j - 1);
    if (src[bound] === '=' || src[bound] === ':' || src[bound] === '(' || src[bound] === ',') return false;
    j = a;
    while (src[j] !== ']') {
      if (src[j] !== ',') return false;
      j = trivia(j + 1);
      while (src[j] === '(') j = trivia(j + 1);
      if (src[j] === ']') break;
      j = strFwd(j);
      if (j === -1) return false;
      j = trivia(j);
      while (src[j] === ')') j = trivia(j + 1);
    }
    return true;
  };
  // Is the literal spanning [s, e) in property-name position? A colon after
  // it, or a closing bracket after it that is itself followed by a colon
  // (computed key) or matched by an opening bracket before it (member access,
  // and a one-element array, which is the fail-closed side of that pair), or
  // membership of an unbound list of strings.
  const isKey = (s, e) => {
    const [b, a] = unwrap(s, e);
    if (src[a] === ':') return true;
    if (src[a] === ']' && (src[trivia(a + 1)] === ':' || src[b] === '[')) return true;
    return inKeyList(b, a);
  };
  // Copy a key literal's own text back from the source WITHOUT undoing the
  // masks inside a template's `${...}` interpolations. An interpolation is
  // code, and it was already read as code on the way through: its comments
  // and its string values are blanked in `out`, and a key literal nested in
  // it restored itself. Copying the whole span raw put all of that back, so
  // a comment or a value inside the seam of a computed key reached the
  // sweeps below as visible code — a channel name the scanner had correctly
  // blanked (review round 2 on 618a1eb3, P2-5). The frame records each seam
  // as it closes, in order, and the raw copy runs only over the gaps
  // between them, so the key's literal text survives and the seam keeps
  // whatever the code pass decided about it.
  const restoreKey = (frame, end) => {
    let k = frame.at;
    for (const [hs, he] of frame.holes) {
      for (; k < hs; k += 1) out[k] = src[k];
      if (he > k) k = he;
    }
    for (; k < end; k += 1) out[k] = src[k];
  };
  const st = [{ m: 'code', depth: 0 }];
  let i = 0;
  while (i < src.length) {
    const top = st[st.length - 1];
    const c = src[i];
    const d = src[i + 1];
    if (top.m === 'code') {
      if (c === '/' && d === '/') {
        while (i < src.length && src[i] !== '\n') { blank(i); i += 1; }
      } else if (c === '/' && d === '*') {
        const end = src.indexOf('*/', i + 2);
        const stop = end === -1 ? src.length : end + 2;
        while (i < stop) { blank(i); i += 1; }
      } else if (c === "'" || c === '"' || c === '`') {
        st.push({ m: c, at: i, holes: [] }); i += 1;
      } else if (c === '{' && st.length > 1) {
        top.depth += 1; i += 1;
      } else if (c === '}' && st.length > 1) {
        if (top.depth === 0) {
          st.pop();
          // The frame below is the template this seam belongs to; the span
          // covers `${` through `}` so nothing inside it is ever recopied.
          if (top.holeAt !== undefined) st[st.length - 1].holes.push([top.holeAt, i + 1]);
        } else top.depth -= 1;
        i += 1;
      } else { i += 1; }
    } else if (c === '\\') { blank(i); blank(i + 1); i += 2; }
    else if (c === top.m) {
      // The literal is blanked as it is walked and restored from the source
      // once its closing quote shows where it ends, so an escaped quote
      // inside a key needs no second reading. A `${...}` seam does: it is
      // code the pass has already masked, and restoreKey() steps over it.
      st.pop(); i += 1;
      if (isKey(top.at, i)) restoreKey(top, i);
    } else if (top.m === '`' && c === '$' && d === '{') {
      st.push({ m: 'code', depth: 0, holeAt: i }); i += 2;
    } else {
      if (c === '\n' && top.m !== '`') diag.crossed += 1;
      blank(i); i += 1;
    }
  }
  diag.open = st.length > 1;
  return out.join('');
}
const stripDiag = {};
const looksCode = stripProse(looksSrc, stripDiag);
// A stripper that returns its input unchanged silently restores the defect it
// was written to remove, and one that over-reaches silently deletes the code
// the sweeps are supposed to see. Both are invisible in a green run, so both
// are checked here: it must have done something, it must not have moved a
// byte, and the landmarks §C and §H navigate by must survive it.
const QUOTED_KEY = /^ {2,4}'[a-z]+\.[a-zA-Z]+':/gm;
const stripLandmarks = [
  [/\btex\.anisotropy\s*=\s*ANISO_DEFAULT\b/g, 1],
  [/^const ANISO_DEFAULT = \d+;$/gm, 1],
  [/\bexport function\b/g, (looksSrc.match(/\bexport function\b/g) || []).length],
  // The quoted '<slot>.<prop>' provenance keys are property names, so code.
  // The count is read off the raw source rather than typed, and the scanner
  // that blanked keys read this row as 0 of 104 — the live half of the arm.
  [QUOTED_KEY, (looksSrc.match(QUOTED_KEY) || []).length],
];
const stripBad = stripLandmarks
  .filter(([re, n]) => (looksCode.match(re) || []).length !== n);
// The live tree has no computed key and no string in a ternary, so the
// spellings the key rules exist for are checked on a synthetic line, which
// is what a repair with no live subject is entitled to. Both directions are
// asked. Kept: the quoted key, the computed key, the computed member access,
// both elements of an iterated two-string list, and a key wrapped in
// parentheses — the last two are the spellings a scanner with only the
// bracket rule blanks, and the arm is what says so. Blanked: the string in
// VALUE position, a string between the commas of a call (the shape a comma
// rule with no bracket at the end of its walk would mistake for a list), and
// a string list bound to a name (the MAP_PROPS shape — a scanner that read it
// as code would red the held ledger's own enumeration). A scanner that
// stopped blanking values would put the disclosures back in front of §F and
// §H, which is the defect the stripper was written to remove.
const KEY_PROBE = "const m = { 'normalMap': t, ['roughnessMap']: u, map: 'bumpMap' }; m['bumpScale'] = v; "
  + "for (const k of ['normalScale', 'psiModDepth']) m[k] = w[k]; m[('heightAmp')] = x; "
  + "g(m, 'normalAmp', 1); const held = ['reliefAmp', 'bumpAmp'];";
// review round 2 on 618a1eb3 (P2-5): a computed key built from a template whose INTERPOLATION carries a comment — restoring
// the key template whole restored the comment too, and §F's HELD sweep saw a channel name the base had blanked. The key
// binds only `map`; the comment must stay blanked inside the restored key.
const KEY_PROBE_INTERP = "const m = { [`map${/* normalMap stays held */ ''}`]: tex };";
const keyProbeInterp = stripProse(KEY_PROBE_INTERP);
const keyProbe = stripProse(KEY_PROBE);
if (keyProbeInterp.length !== KEY_PROBE_INTERP.length || /normalMap/.test(keyProbeInterp) || !/\bmap\b/.test(keyProbeInterp)) {
  fail(`stripProse() restores a computed key's interpolation RAW: ${JSON.stringify(KEY_PROBE_INTERP)} came back as `
    + `${JSON.stringify(keyProbeInterp)} — the comment inside the interpolation must stay blanked while the key text `
    + '`map` stays visible (review round 2 on 618a1eb3, P2-5)');
} else {
  ok('stripProse() keeps the masks inside a computed key\'s interpolations (the key text survives, its comment does not)');
}
// The other half of the same seam, asked in both directions on one line: a
// string VALUE inside an interpolation (a call argument) must stay blanked
// like any other value, and a string in KEY position inside the same
// interpolation must stay visible like any other key — a computed member
// access binds its channel through the seam exactly as it would outside it.
// A restore that copies the template raw passes the second and fails the
// first; one that skips the whole span fails the second.
const KEY_PROBE_SEAM = "const m = { [`map${pick('roughnessMap')}${o['normalScale']}`]: tex };";
const keyProbeSeam = stripProse(KEY_PROBE_SEAM);
if (keyProbeSeam.length !== KEY_PROBE_SEAM.length || /roughnessMap/.test(keyProbeSeam)
  || !keyProbeSeam.includes("'normalScale'") || !/\bmap\b/.test(keyProbeSeam)) {
  fail(`stripProse() misreads the strings inside a computed key's interpolations: `
    + `${JSON.stringify(KEY_PROBE_SEAM)} came back as ${JSON.stringify(keyProbeSeam)} — a value inside the seam `
    + 'must stay blanked and a key inside it must stay visible, or §F and §H are reading a channel name the '
    + 'scanner was supposed to hold, or missing one the code really binds');
} else {
  ok('stripProse() reads a computed key\'s interpolations as code — the value inside the seam stays blanked, the member-access key inside it stays visible');
}
const keyProbeBad = keyProbe.length !== KEY_PROBE.length
  || !keyProbe.includes("'normalMap'") || !keyProbe.includes("'roughnessMap'")
  || !keyProbe.includes("'bumpScale'") || !keyProbe.includes("'normalScale'")
  || !keyProbe.includes("'psiModDepth'") || !keyProbe.includes("'heightAmp'")
  || keyProbe.includes('bumpMap') || keyProbe.includes('normalAmp')
  || keyProbe.includes('reliefAmp');
if (looksCode.length !== looksSrc.length
  || looksCode.split('\n').length !== looksSrc.split('\n').length) {
  fail('stripProse() changed the length or line count of cuelooks.js. Every '
    + 'offset and line number the sections below report is now off by an '
    + 'unknown amount, so the sweeps that read the stripped text cannot be '
    + 'trusted to name a repair address');
} else if (looksCode === looksSrc) {
  fail('stripProse() returned cuelooks.js unchanged. Either the module lost '
    + 'every comment and string literal, or the scanner stopped scanning — '
    + 'and in the second case §F and §H are back to counting words in prose, '
    + 'which is the defect they were just repaired for');
} else if (keyProbeBad) {
  // Asked before the live landmarks: when the key rule is what broke, the
  // synthetic line says so in one sentence, where the landmark count would
  // send the reader hunting for a regex literal that is not there.
  fail(`stripProse() misreads a quoted property name: ${JSON.stringify(KEY_PROBE)} `
    + `came back as ${JSON.stringify(keyProbe)}. A string in key position — `
    + 'before a colon, alone inside brackets, in an unbound list of strings, '
    + 'or any of those wrapped in parentheses — binds a channel exactly as '
    + 'the bare spelling does, so blanking it lets a quoted or computed key '
    + 'carry a held channel past §F and §H; keeping a string VALUE visible '
    + '(a call argument, a list bound to a name) puts the disclosures back '
    + 'in front of them and reds MAP_PROPS, the enumeration that must name '
    + 'the held channels. Either way the sweeps below are reading the wrong '
    + 'text');
} else if (stripDiag.crossed || stripDiag.open) {
  // A quoted string cannot legally span a line, so a literal that did is one
  // the scanner opened where the source has none — a regex literal holding a
  // quote character is the construct that does this — and everything from
  // there to the next quote was blanked as prose, held channel or not. The
  // landmark count below only notices when a landmark lies in that span; a
  // regex after the last landmark would take the rest of the file unseen.
  fail(`stripProse() lost its place in cuelooks.js: ${stripDiag.crossed} `
    + 'single- or double-quoted literal(s) ran across a line break'
    + (stripDiag.open ? ' and the scan ended inside a literal' : '')
    + '. The scanner has no regex mode, so a regex literal containing a '
    + 'quote character reads as a string opener and real code is blanked '
    + 'from there to the next quote. Give the scanner that mode or respell '
    + 'the regex — until then the sweeps below are looking at a hole');
} else if (stripBad.length) {
  fail(`stripProse() ate ${stripBad.length} of the ${stripLandmarks.length} `
    + 'code landmarks in cuelooks.js. The likeliest cause is a regex literal '
    + 'holding a quote character: the scanner has no regex mode, so it reads '
    + 'the quote as a string opener and blanks real code from there. Give the '
    + 'scanner that mode, or the sweeps below are looking at a hole. (If the '
    + 'lost landmark is the quoted-key row, the live file spells a key in a '
    + 'way the synthetic probe above does not cover — widen the probe first)');
} else {
  ok('stripProse() left cuelooks.js byte-aligned with all code landmarks '
    + 'and quoted keys intact, so §F and §H sweep the code — property names '
    + 'included — and leave the prose alone');
}
// The sweeps compare bytes, and a unicode or hex escape spells a name in
// bytes the sweeps do not read: `'normal\u004dap'` is kept as a key and
// binds normalMap at runtime, and an escaped identifier does the same with
// no string at all. Any such escape in the CODE of cuelooks.js — values and
// comments are already blanked, so this reads keys, identifiers and regex
// bodies — is therefore refused rather than decoded: nothing in the module
// needs one, and a name a reader cannot grep is not a name the sweeps can
// hold. The price is a regex literal that spells a code point this way.
const escapeAt = /\\[ux]/.exec(looksCode);
if (escapeAt) {
  const line = looksCode.slice(0, escapeAt.index).split('\n').length;
  fail(`web/scene/cuelooks.js line ${line} spells something in code with a `
    + `\\u or \\x escape. §F and §H match names byte for byte, so an escaped `
    + 'key or identifier binds a channel the sweeps cannot see. Spell the '
    + 'name plainly');
}

const anisoDecl = /^const ANISO_DEFAULT = (\d+);$/m.exec(looksSrc);
if (!anisoDecl) {
  fail('web/scene/cuelooks.js no longer declares `const ANISO_DEFAULT = <int>;` '
    + 'at top level. The module does not export it, so this section reads the '
    + 'shipped cap out of the source text, and that read just broke — which is '
    + 'a failure and not a pass, because everything below compares against it');
}
const ANISO_SHIPPED = anisoDecl ? Number(anisoDecl[1]) : NaN;
// Every wood-bearing segment, not just the default: the ratio is a property of
// the WRAP, so any class that puts a square canvas on a turned segment has one.
const WOOD_SLOTS = [];
for (const cls of Object.keys(GEOM)) for (const slot of ['shaft', 'butt']) {
  WOOD_SLOTS.push([cls, slot]);
}
/** Texel-density ratio of a square canvas on a turned segment: the axial
 * direction carries L mm of surface across the same pixel count that the
 * circumference carries 2*pi*R mm across. The MINIMUM radius is the honest
 * one — it is where the wrap is tightest and the anisotropy demand highest. */
const wrapRatio = (seg) =>
  seg.len / (2 * Math.PI * Math.min(seg.rTop, seg.rBot));

say(`  sampler cap    ANISO_DEFAULT = ${ANISO_SHIPPED} `
  + '(cuelooks.js, module-private — read from source, cross-checked on a real '
  + 'baked texture in §E2)');
let worstWrap = 0, worstWrapAt = '';
const over = [], under = [];
for (const [cls, slot] of WOOD_SLOTS) {
  const r = wrapRatio(GEOM[cls][slot]);
  if (r > worstWrap) { worstWrap = r; worstWrapAt = `${cls}.${slot}`; }
  (r > ANISO_SHIPPED ? over : under).push(`${cls}.${slot}`);
  say(`  wrap demand    ${`${cls}.${slot}`.padEnd(20)} L/(2*pi*R_min) = `
    + `${f(r, 1)}   (${f(r / ANISO_SHIPPED, 1)}x the cap)`);
}
if (!(worstWrap > ANISO_SHIPPED)) {
  fail(`every wood segment's texel-density ratio is now at or below the `
    + `shipped sampler cap ${ANISO_SHIPPED} (worst ${f(worstWrap, 1)} at `
    + `${worstWrapAt}) — the R2 argument for raising the cap has evaporated, `
    + 'so re-read it before editing this gate rather than after');
}
// Stated exactly, because the tempting sentence is false: it is NOT every
// wood segment. The shafts are slender and long and every one of them demands
// more than the cap; the butts are short and fat and every one of them demands
// LESS, so on those the cap is already generous and nothing is being clipped.
// Two consequences worth keeping straight: raising the cap would change the
// shafts and be a no-op on the butts, and a capture that shows no difference
// on a butt has not tested the argument.
ok(`${over.length} of ${WOOD_SLOTS.length} wood segments demand more sampler `
  + `than the shipped cap ${ANISO_SHIPPED} — the shafts (${over.join(', ')}), `
  + `worst ${f(worstWrap, 1)} at ${worstWrapAt}, a factor of `
  + `${f(worstWrap / ANISO_SHIPPED, 1)} — while the butts (${under.join(', ')}) `
  + 'demand less than it and are unaffected either way. Where the cap does '
  + 'bind, a sampler capped below the demand raises the LOD instead of taking '
  + 'more samples and the blur lands ACROSS the rings; whether that is '
  + 'visible is a capture question, not an arithmetic one, and R3 held it for '
  + 'want of that capture — the grazing framing has still not been posed');

// The guard. Two anchors bound the paragraph in cuelooks.js that makes this
// argument; between them it may state the FORM of the ratio and not a value.
// A missing anchor is a failure, not a pass — a guard that cannot find what it
// protects has stopped protecting it, which is how the typed figure survived a
// round in the first place.
const ANCHORS = ['A derivation for it was written',
  'What the argument is NOT'];
const i0 = looksSrc.indexOf(ANCHORS[0]), i1 = looksSrc.indexOf(ANCHORS[1]);
if (i0 < 0 || i1 < 0 || i1 < i0) {
  fail(`the ANISO_DEFAULT derivation paragraph in cuelooks.js no longer sits `
    + `between its two anchors ("${ANCHORS[0]}" ... "${ANCHORS[1]}") — this `
    + 'guard cannot locate the prose it holds to the arithmetic above');
} else {
  const span = looksSrc.slice(i0, i1);
  // `2*pi` is the ratio's own FORM and is allowed; a digit anywhere else in
  // the span is a value, which is the thing this section exists to replace.
  const stray = span.replace(/2\*pi/g, '').match(/\d/g);
  if (stray) {
    fail(`the ANISO_DEFAULT derivation paragraph in cuelooks.js states `
      + `${stray.length} digit(s) of its own (${stray.join('')}) where it may `
      + 'state only the form L/(2*pi*R). The ratio is computed and printed '
      + 'above, per segment, off the built cue; a figure typed into that '
      + 'paragraph has nothing comparing it to the arithmetic, which is '
      + 'exactly how it came to read "26" for a quantity that is 25.4');
  }
  if (!span.includes('tools/derive-cue-grain.mjs')) {
    fail('the ANISO_DEFAULT derivation paragraph in cuelooks.js no longer '
      + 'points at this tool. The pointer is what makes the absent figure '
      + 'findable; deleting it is how the figure comes back');
  }
  ok('the sampler paragraph in cuelooks.js states the ratio\'s form, carries '
    + 'no figure of its own, and points at the tool that prints it');
}

// ═══════════════════════════════════════════════════════════════════════
// D. THE DERIVED GRAIN FIELD — closed form, one physical unknown
// ═══════════════════════════════════════════════════════════════════════
/** Ring phase at (azimuth φ, axial fraction v) on a linearly tapered
 * segment. THE closed form; cuelooks.js paints frac() of exactly this. */
const ringPhase = (phi, v, rTopMM, rBotMM, wMM) =>
  ((rTopMM + (rBotMM - rTopMM) * v) * Math.cos(phi)) / wMM;

/** Everything the eye reads, from ψ alone. */
function grainStats(seg, wMM) {
  const rTop = seg.rTop * 1000, rBot = seg.rBot * 1000;
  const lines = (r) => 4 * r / wMM;            // 2·D/w, D = 2r
  // arc between adjacent lines at the quarter face (φ = 90°, |dψ/dφ| max):
  // dψ = 1 ⇒ dφ = w/r ⇒ arc = r·dφ = w. Exactly the ring width, by
  // construction — the quarter face reads the wood at true scale.
  // The cathedral gap is the arc from the crown to the FIRST line in:
  // ψ(0) = r/w, so the first boundary inward sits where cos φ = (⌊r/w⌋)/(r/w).
  const gap = (r) => {
    const psi0 = r / wMM;
    const k = Math.floor(psi0);
    if (k < 1) return Math.PI * r;             // degenerate: no line at all
    return r * Math.acos(k / psi0);
  };
  return {
    linesTip: lines(rTop), linesButt: lines(rBot),
    quarterArcMM: wMM,
    cathedralTipMM: gap(rTop), cathedralButtMM: gap(rBot),
  };
}

// ── THE ONE PHYSICAL UNKNOWN ────────────────────────────────────────────
// Estimated. Nothing in the estate measures it: FPL GTR-282 ch.3 publishes
// cell-level anatomy for Acer but no ring width, and no cue-shaft billet
// measurement is on hand. It sets grain-line SPACING only — the placement
// law, the taper response, the profile and every ceiling above are derived
// and do not move with it. The Poly Haven White Maple Veneer scan (CC0 1.0,
// 8192² over a documented 1000 mm tile ⇒ 0.122 mm/px) settles it directly:
// a 1.1 mm ring is 9 px there, far above that scan's resolution floor. That
// measurement is the named upgrade and it is NOT blocked by the GH-542
// forensics ruling, which closed the cloth photo-set and the cloth BRDF
// offcut and said nothing about wood.
const RING_W_MM = 1.1;

say('\n══ D. DERIVED GRAIN FIELD ══');
say(`  ring width w = ${RING_W_MM} mm   [Estimated — the only free physical input]`);
for (const [cls, slot] of [['maple_played', 'shaft'], ['maple_played', 'butt'],
  ['masse_soft', 'shaft'], ['masse_soft', 'butt']]) {
  const seg = GEOM[cls][slot];
  const s = grainStats(seg, RING_W_MM);
  say(`  ${cls}.${slot.padEnd(6)} r ${f(seg.rTop * 1000, 2)}→${f(seg.rBot * 1000, 2)} mm`
    + `  lines ${f(s.linesTip, 1)}→${f(s.linesButt, 1)} around`
    + `  quarter-face pitch ${f(s.quarterArcMM, 2)} mm`
    + `  cathedral gap ${f(s.cathedralTipMM, 2)}→${f(s.cathedralButtMM, 2)} mm`);
  // A line pitch finer than two texels is a line the texture cannot carry.
  const t = texel(seg, PX, 1, 1);
  if (s.quarterArcMM < 2 * t.circMM) {
    fail(`${cls}.${slot}: quarter-face pitch ${f(s.quarterArcMM, 3)} mm is under `
      + `two texels (${f(2 * t.circMM, 3)} mm) — the tightest grain aliases`);
  }
}
ok('every class carries its quarter-face pitch above the texture Nyquist limit');

// The taper response, stated as the thing a reviewer can check by eye:
const st = grainStats(GEOM.maple_played.shaft, RING_W_MM);
say(`  taper response  the default shaft gains `
  + `${f(st.linesButt - st.linesTip, 1)} grain lines from ferrule to joint `
  + `(${f(st.linesTip, 1)} → ${f(st.linesButt, 1)}), which no option sets`);

// ═══════════════════════════════════════════════════════════════════════
// E. DRIFT GATE — the shipped painter must BE this closed form
// ═══════════════════════════════════════════════════════════════════════
// Section D is only a derivation until something proves cuelooks.js paints
// it. This re-derives the field independently and compares against the real
// baked bytes, so a future edit to the painter cannot quietly diverge from
// the physics this file claims for it.
if (typeof looks.makeRingGrainMap !== 'function') {
  fail('web/scene/cuelooks.js exports no makeRingGrainMap — R2 is not '
    + 'installed, or the painter was renamed without moving this gate');
} else {
  // ── E0. the ONE physical input must be the one this file derived against
  const WR = looks.WOOD_RING;
  if (!WR || WR.ringMM !== RING_W_MM) {
    fail(`cuelooks WOOD_RING.ringMM = ${WR?.ringMM} but §D derives against `
      + `${RING_W_MM} mm — one of the two moved alone`);
  }
  if (!(WR.ringCV < looks.RING_CV_MAX)) {
    fail(`WOOD_RING.ringCV ${WR.ringCV} is at or above the fold bound `
      + `RING_CV_MAX ${f(looks.RING_CV_MAX, 4)} — the painter would clamp it, `
      + 'which means the clamp, not the ledger, is choosing the shipped value');
  }

  // ── SHARED READBACK ───────────────────────────────────────────────────
  // The painter also lays a per-texel stipple (everything the anatomy has
  // below the Nyquist limit §C establishes) whose texel-to-texel step is
  // comparable to the grain's, so raw minima are stipple minima. Averaging
  // rows is the honest filter: the ring field is constant along the axis by
  // construction, the stipple is not, so N rows cut the stipple by sqrt(N)
  // and leave the grain untouched. On a TAPERED segment R(v) moves, so the
  // band is kept short enough that the phase smears by under a tenth of a
  // ring across it, and that bound is asserted rather than assumed.
  function bandProfile(img, rowFrom, rowTo, smooth = 1) {
    const { L, W: w } = luma(img);
    const prof = new Float64Array(w);
    for (let y = rowFrom; y < rowTo; y++) {
      for (let x = 0; x < w; x++) prof[x] += L[y * w + x];
    }
    for (let x = 0; x < w; x++) prof[x] /= (rowTo - rowFrom);
    if (smooth <= 1) return prof;
    // ...and where the taper allows only a short band, a boxcar in x finishes
    // the job. It is sized off the TIGHTEST pitch the segment carries, so it
    // is under half a ring wide at worst: it cannot move a symmetric
    // minimum, only shrink the stipple standing on top of it.
    const out = new Float64Array(w), h = smooth >> 1;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -h; k <= h; k++) acc += prof[(x + k + w) % w];
      out[x] = acc / (2 * h + 1);
    }
    return out;
  }
  /** Texels between adjacent boundaries at the quarter face — the tightest
   * spacing the segment carries, which is what sets the filter width. */
  const pitchTexels = (R, px) => (RING_W_MM * px) / (2 * Math.PI * R);
  const boxcarFor = (R, px) =>
    Math.max(3, 2 * Math.round(pitchTexels(R, px) / 5) + 1);
  /** Sub-texel luminance minima of a profile, returned in the RADIAL
   * coordinate xr = R·cos(φ). Half the circle is enough: xr is even in φ, so
   * φ and 2π−φ report the same boundary — which is itself one of the things
   * checked below. `half` picks which half. */
  function minimaXR(prof, R, half) {
    const w = prof.length, out = [];
    for (let x = 0; x < w; x++) {
      const l = prof[x];
      const a = prof[(x - 1 + w) % w], c = prof[(x + 1) % w];
      if (!(l < a && l <= c)) continue;
      const den = a - 2 * l + c;
      const dx = den > 0 ? 0.5 * (a - c) / den : 0;
      const phi = (2 * Math.PI * (x + dx)) / w;
      const inLower = phi > 0 && phi < Math.PI;
      if (half === 'lower' ? !inLower : inLower) continue;
      // near the crown dψ/dφ → 0: the minimum is a plateau tens of texels
      // wide and its position is not determined. Those boundaries are real,
      // they are just not measurable, so they are excluded and counted.
      const xr = R * Math.cos(phi);
      if (Math.abs(xr) > 0.92 * R) continue;
      out.push(xr);
    }
    return out.sort((p, q) => p - q);
  }
  const spacings = (xs) => xs.slice(1).map((v, i) => v - xs[i]);
  const stat = (a) => {
    const m = a.reduce((s, v) => s + v, 0) / a.length;
    const sd = Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
    return { mean: m, sd, cv: sd / m, min: Math.min(...a), max: Math.max(...a) };
  };
  /** Fraction of `a` that has a partner in `b` within tol, and the worst gap. */
  function pair(a, b, tol) {
    let hit = 0, worst = 0;
    for (const v of a) {
      let d = Infinity;
      for (const u of b) d = Math.min(d, Math.abs(u - v));
      if (d <= tol) { hit += 1; worst = Math.max(worst, d); }
    }
    return { frac: a.length ? hit / a.length : 0, worst, n: a.length };
  }

  say('\n══ E. THE SHIPPED PAINTER, RE-MEASURED ══');

  // ── E1. THE WARP MACHINERY, MEASURED END TO END ───────────────────────
  // The two noise constants in cuelooks.js are measurements, and a claim to
  // have measured something is worth what re-measuring it is worth. Rather
  // than re-implement the private basis here (a copy drifts), bake straight
  // oversized billets through the SHIPPED painter and read the realised ring
  // widths back out of the pixels. A shipped piece spans only
  // 2R/(w·RING_WARP_CELLS) ≈ 5 warp cells by construction, which is far too
  // few draws for a dispersion statistic, so the ensemble pools several
  // wider billets — and the shipped piece's own sample size is reported next
  // to it rather than hidden by the pooling.
  const ENS_RINGS = 40;                       // boundaries across a billet
  const ENS_BILLETS = 8;
  const ensR = (ENS_RINGS * RING_W_MM) / 2;
  async function billet(seed, cv) {
    const tex = looks.makeRingGrainMap(seed, 200, 200, 200,
      { ...WR, ringCV: cv, rTopMM: ensR, rBotMM: ensR });
    await drain();
    const img = tex.image[SHIM_PIXELS];
    if (!img) return null;
    // straight billet: every row carries the same ring field, so the whole
    // canvas averages down to one profile
    const prof = bandProfile(img, 0, img.height);
    return { img, lower: minimaXR(prof, ensR, 'lower'),
      upper: minimaXR(prof, ensR, 'upper') };
  }
  const pooled = [];
  let ensCounts = [], ensImgW = PX, mirrorWorst = 0, mirrorFrac = 1;
  for (let i = 0; i < ENS_BILLETS; i++) {
    const bl = await billet(9001 + i, WR.ringCV);
    if (!bl) { fail(`ensemble billet ${i}: painter returned no bytes`); continue; }
    ensImgW = bl.img.width;
    pooled.push(...spacings(bl.lower));
    ensCounts.push(bl.lower.length);
    // MIRROR INVARIANCE. A ring boundary is a PLANE, so the two azimuths that
    // meet it are at ±φ and must report the same xr. Nothing but the cos law
    // makes that true; a painter that drew stripes in x would fail here.
    const m = pair(bl.lower, bl.upper, 2 * (2 * Math.PI * ensR) / bl.img.width);
    mirrorFrac = Math.min(mirrorFrac, m.frac);
    mirrorWorst = Math.max(mirrorWorst, m.worst);
  }
  if (pooled.length > 0) {
    const S = stat(pooled);
    const cells = pooled.length / looks.RING_WARP_CELLS;
    const texMM = (2 * Math.PI * ensR) / ensImgW;
    say(`  ensemble  ${ENS_BILLETS} billets R ${f(ensR, 1)} mm, ${pooled.length} `
      + `ring widths, ~${f(cells, 0)} independent warp draws `
      + `(a SHIPPED shaft spans ~${f((GEOM.maple_played.shaft.rBot * 2000)
        / (RING_W_MM * looks.RING_WARP_CELLS), 1)})`);
    say(`  realised ring width  mean ${f(S.mean, 3)} mm (asked ${RING_W_MM})`
      + `  min ${f(S.min, 3)}  max ${f(S.max, 3)}`);
    say(`  realised dispersion  CV ${f(S.cv, 3)} (asked ${WR.ringCV}, `
      + `bound ${f(looks.RING_CV_MAX, 3)})`);
    say(`  mirror invariance    ${f(mirrorFrac * 100, 1)}% of boundaries pair `
      + `across ±φ, worst ${f(mirrorWorst * 1000, 1)} µm`);
    // A warp may spread widths; it may not rescale them.
    if (Math.abs(S.mean - RING_W_MM) > 2 * texMM) {
      fail(`realised mean ring width ${f(S.mean, 3)} mm is off the requested `
        + `${RING_W_MM} by more than two texels (${f(2 * texMM, 3)} mm) — the `
        + 'warp is rescaling the wood, not dispersing it');
    }
    // No fold. Widths come out of a sorted list so they are positive by
    // construction; the COUNT is the test that bites. Total phase across the
    // billet is 2R/w plus a warp endpoint difference bounded by warpA, so the
    // count may move by ±2 and no more.
    const wantCount = 0.92 * ENS_RINGS;   // the |xr| ≤ 0.92R measurable core
    const cMean = ensCounts.reduce((a, v) => a + v, 0) / ensCounts.length;
    if (Math.abs(cMean - wantCount) > 3) {
      fail(`counted ${f(cMean, 1)} measurable boundaries per billet where the `
        + `placement law gives ${f(wantCount, 1)} — crossings are being created `
        + 'or lost, which is what a folded or aliased phase looks like');
    }
    if (mirrorFrac < 0.98) {
      fail(`only ${f(mirrorFrac * 100, 1)}% of boundaries pair across ±φ — the `
        + 'field is not a function of R·cos(φ), so it is not the placement law');
    }
    // Realised vs requested dispersion. Sampling error on a CV from n draws
    // is ~1/sqrt(2n) and the draws are the warp CELLS, not the rings; the
    // band is stated from that, not tuned to pass.
    const rel = 1 / Math.sqrt(2 * Math.max(cells, 1));
    if (WR.ringCV > 0
      && (S.cv < WR.ringCV * (1 - 3 * rel) || S.cv > WR.ringCV * (1 + 3 * rel))) {
      fail(`realised dispersion CV ${f(S.cv, 3)} is outside 3 sampling errors `
        + `of the requested ${WR.ringCV} (±${f(3 * rel * WR.ringCV, 3)}) — either `
        + 'NOISE_SLOPE_SIGMA no longer describes the basis, or the basis moved');
    } else {
      ok(`the warp realises the requested ring-width dispersion (CV `
        + `${f(S.cv, 3)} vs ${WR.ringCV} asked, ±${f(3 * rel * WR.ringCV, 3)})`);
    }
    // CONTROL. With no dispersion asked for the wood must be exactly
    // periodic; this is what proves the CV above is the warp and not the
    // measurement.
    const flat = await billet(9099, 0);
    if (flat) {
      const F = stat(spacings(flat.lower));
      say(`  control ringCV=0     realised CV ${f(F.cv, 4)} (measurement floor)`);
      if (F.cv > 0.02) {
        fail(`ringCV = 0 still realises CV ${f(F.cv, 4)} — the un-warped field `
          + 'is not periodic, so the dispersion measured above is not the warp');
      }
      if (Math.abs(F.mean - RING_W_MM) > texMM) {
        fail(`un-warped ring width ${f(F.mean, 4)} mm is not the requested `
          + `${RING_W_MM} mm — ringMM is not the ring width it claims to be`);
      }
    }
  }

  // ── E2. THE SHIPPED CLASSES, THROUGH THE REGISTRY ─────────────────────
  // Baking the painter directly would only prove the painter. These bake the
  // RECIPE the app reaches for, and check it against radii read off the BUILT
  // cue — so a taper change not mirrored into the recipe fails here instead
  // of quietly mis-scaling the grain.
  //
  // WHAT IS CHECKED, AND WHY IT IS NOT THE ABSOLUTE POSITION. Two terms of
  // the shipped phase are private to the painter on purpose: the billet
  // registration drawn from the seed, and the ring-width warp. So this
  // cannot predict WHERE a line falls, and pretending to would just be
  // re-typing the painter. What it can check is the part that carries the
  // physics, and does so independent of both private terms:
  //   MIRROR   boundaries at ±φ map to one xr           (the field is R·cos φ)
  //   TAPER    boundaries on two DIFFERENT rows map to the SAME xr, though
  //            they sit at different x                  (R(v) enters exactly)
  //   SCALE    mean spacing in xr is the requested ring width
  // A hand-tuned stripe painter passes none of these.
  const CASES = [
    ['maple_played', 'shaft', 'standard'],
    ['maple_played', 'butt', 'standard'],
    ['masse_soft', 'shaft', 'masse_trick'],
    ['masse_soft', 'butt', 'masse_trick'],
  ];
  for (const [cls, slot, cueId] of CASES) {
    if (cueId !== CUE_CLASS[cls]) {
      fail(`§D pairs ${cls} with the catalog id ${cueId}, but the one table `
        + `that authors that pairing gives ${CUE_CLASS[cls]}. The geometry `
        + 'below would then come from one cue and the recipe from another, '
        + 'and every invariance in this section would be measured across the '
        + 'seam without saying so');
      continue;
    }
    const seg = GEOM[cls][slot];
    const rTop = seg.rTop * 1000, rBot = seg.rBot * 1000;
    const rec = looks.cueLookFor(cueId)?.materials?.[slot];
    if (typeof rec?.map !== 'function') {
      fail(`${cls}.${slot}: the ${cueId} recipe ships no map thunk`); continue;
    }
    const tex = rec.map();
    await drain();
    const img = tex.image[SHIM_PIXELS];
    if (!img) { fail(`${cls}.${slot}: painter returned no bytes`); continue; }
    if (img.width !== PX) {
      fail(`${cls}.${slot}: baked ${img.width} px, the closeup register is ${PX}`);
    }
    if (tex.repeat.x !== 1 || tex.repeat.y !== 1) {
      fail(`${cls}.${slot}: repeat ${tex.repeat.x},${tex.repeat.y} — the derived `
        + 'path is exactly periodic over one wrap and must not re-introduce '
        + 'the non-integer tiling seam this file measures in §B');
    }
    // §C reads the sampler cap out of the module's SOURCE because the constant
    // is not exported. This is the one place the value the player actually
    // receives can be observed, so the source read is held against it here
    // rather than trusted: a literal that no longer reaches a texture would
    // make every ratio printed in §C a comparison against nothing.
    if (tex.anisotropy !== ANISO_SHIPPED) {
      fail(`${cls}.${slot}: the baked texture carries anisotropy `
        + `${tex.anisotropy} where cuelooks.js declares ANISO_DEFAULT = `
        + `${ANISO_SHIPPED} — §C's wrap-ratio comparison is against the source `
        + 'literal, and the literal is no longer what ships');
    }
    // Two bands, a quarter of the segment apart, so the taper genuinely moves
    // the lines between them. Band height is bounded so the phase smears by
    // under a tenth of a ring inside a band.
    const BAND = Math.max(1, Math.floor(0.1 * RING_W_MM * img.height
      / Math.abs(rBot - rTop || 1e9)));
    const at = (v) => {
      const c = Math.round(v * (img.height - 1));
      const lo = Math.max(0, c - (BAND >> 1)), hi = Math.min(img.height, lo + BAND);
      const R = rTop + (rBot - rTop) * ((lo + hi) / 2 / (img.height - 1));
      const prof = bandProfile(img, lo, hi, boxcarFor(R, img.width));
      return { R, lower: minimaXR(prof, R, 'lower'), upper: minimaXR(prof, R, 'upper'),
        box: boxcarFor(R, img.width) };
    };
    const b1 = at(0.25), b2 = at(0.75);
    const tol = 2 * (2 * Math.PI * Math.max(b1.R, b2.R)) / img.width;
    const mir = pair(b1.lower, b1.upper, tol);
    const tap = pair(b1.lower, b2.lower, tol);
    const S = stat(spacings(b1.lower));
    const dxLines = (2 * (b2.R - b1.R)) / RING_W_MM;
    say(`  ${cls}.${slot.padEnd(6)} rows .25/.75 (band ${BAND}x${b1.box})  mirror `
      + `${f(mir.frac * 100, 0)}%  taper-invariant ${f(tap.frac * 100, 0)}% `
      + `across a ${f(dxLines, 1)}-line change  spacing ${f(S.mean, 3)} mm`);
    if (mir.frac < 0.95) {
      fail(`${cls}.${slot}: only ${f(mir.frac * 100, 0)}% of boundaries pair `
        + 'across ±φ — the field is not a function of R·cos(φ)');
    }
    if (tap.frac < 0.95) {
      fail(`${cls}.${slot}: only ${f(tap.frac * 100, 0)}% of boundaries hold the `
        + `same xr between rows 0.25 and 0.75, where the line count changes by `
        + `${f(dxLines, 1)} — R(v) is not entering the phase as the taper law says`);
    }
    if (Math.abs(S.mean - RING_W_MM) > 0.15 * RING_W_MM) {
      fail(`${cls}.${slot}: mean boundary spacing ${f(S.mean, 3)} mm is not the `
        + `requested ring width ${RING_W_MM} mm`);
    }
    if (mir.frac >= 0.95 && tap.frac >= 0.95
      && Math.abs(S.mean - RING_W_MM) <= 0.15 * RING_W_MM) {
      ok(`${cls}.${slot}: mirror, taper and scale all hold — the baked bytes `
        + 'carry the derived CARRIER (these three are invariances any monotone '
        + 'function of R·cos(φ) satisfies, so they do NOT establish that the '
        + 'shipped phase is unwarped)');
    }
  }

  // ── E3. INHERITED RECIPES MUST INHERIT THE RIGHT BODY ─────────────────
  // The default wood recipe carries the DEFAULT class's radii baked into its
  // thunk (segRadiiMM(DEF_DIMS)), and any class that does not override that
  // slot ships that exact thunk — maple_ld does, for its butt. That is
  // correct only for as long as the inheriting class's own dims give the same
  // segment. Nothing in the recipe can notice if they stop doing so, and the
  // failure would be silent: grain scaled for someone else's taper. So it is
  // checked here, for every catalog id, against the BUILT cue.
  const defMat = looks.CUE_LOOK_DEFAULTS.materials;
  const idsFor = Object.keys(looks.CUE_LOOKS);
  let inherited = 0;
  for (const id of idsFor) {
    const look = looks.cueLookFor(id);
    for (const slot of ['shaft', 'butt']) {
      if (look?.materials?.[slot]?.map !== defMat[slot].map) continue;
      inherited += 1;
      const seg = segGeom(id)[slot];
      const want = GEOM.maple_played[slot];
      const dr = Math.max(Math.abs(seg.rTop - want.rTop),
        Math.abs(seg.rBot - want.rBot)) * 1000;
      if (dr > 1e-6) {
        fail(`${id}.${slot} inherits the DEFAULT wood recipe, whose ring field `
          + `is scaled for r ${f(want.rTop * 1000, 2)}→${f(want.rBot * 1000, 2)} `
          + `mm, but this cue's ${slot} is r ${f(seg.rTop * 1000, 2)}→`
          + `${f(seg.rBot * 1000, 2)} mm (${f(dr, 3)} mm out). Either override `
          + 'the slot with the class\'s own radii or stop inheriting it');
      }
    }
  }
  ok(`${inherited} inherited default wood slot(s) across ${idsFor.length} `
    + 'catalog ids carry radii the inheriting cue actually has');
}

// ═══════════════════════════════════════════════════════════════════════
// F. SURFACE-RELIEF BUDGET — what an 8-bit normal map could encode here
// ═══════════════════════════════════════════════════════════════════════
// R3 asked whether the ring phase should drive a NORMAL map as well as the
// albedo one. This section is the arithmetic behind the answer, which is no,
// not this round — and it is not a taste judgement. The relief amplitude of a
// ring boundary on a FINISHED maple shaft (call it A_h) is unmeasured, and
// nothing in the estate bounds it from BELOW. The module's own diffuse-porous
// argument says the relief is small, possibly sub-micron; FPL's vessel
// diameters (§C) are a ceiling on pore WIDTH and say nothing about relief
// DEPTH, so they cannot stand in for the missing measurement.
//
// What can be computed without measuring anything is the FLOOR: the smallest
// amplitude an 8-bit tangent-space normal map could encode on this geometry
// at all. That is what is printed below.
//
//   READ THESE AS FLOORS, NOT TARGETS. The way this section gets misused is
//   "A_h has to clear the floor to encode at all, so A_h = a few microns" —
//   an amplitude chosen to clear a byte threshold, with a tool section as its
//   provenance. That is a free scalar laundered through a derived-looking
//   print, and it would be nearly invisible in review because every other
//   figure on the line is genuinely derived. Hence the guard at the end of
//   this section: the tool goes red if an amplitude lands while the channel
//   is held, rather than merely having said not to.
//
// And the floors are tagged MIXED, not Derived. Their FORM is geometry, but
// they are linear in w — the one Estimated physical input this file has — so
// w is named on every line that depends on it.

const BYTE_STEP = 2 / 255;   // an 8-bit normal channel spans [-1, 1]

/** three r170's derivative tangent frame, SOLVED rather than sampled.
 *
 * `getTangentFrame` (web/vendor/three.module.min.js, chunk
 * normal_pars_fragment, compiled in for USE_NORMALMAP_TANGENTSPACE and for
 * USE_ANISOTROPY) builds, from screen-space derivatives q = dP/d(screen) and
 * st = d(uv)/d(screen):
 *
 *     T = (q1 x N)*st0.x + (N x q0)*st1.x
 *     B = (q1 x N)*st0.y + (N x q0)*st1.y
 *     both scaled by inversesqrt(max(dot(T,T), dot(B,B)))
 *
 * Substituting q0 = Pu*st0.x + Pv*st0.y and q1 = Pu*st1.x + Pv*st1.y (Pu, Pv
 * the surface derivatives w.r.t. u and v) the mixed terms cancel and it
 * reduces to
 *
 *     T = -det(J) * (N x Pv)        B = det(J) * (N x Pu)
 *
 * with J the screen Jacobian of (u,v). So |T| = |det J|*|Pv| and
 * |B| = |det J|*|Pu|: the screen dependence is common to both and divides
 * out in the shared scale, and what survives is the UV ASPECT of the
 * parameterisation and nothing else —
 *
 *     |tbn[0]| : |tbn[1]|  =  |Pv| : |Pu|  =  Lv : Lu,  longer leg = 1
 *
 * On a CylinderGeometry torso |Pu| = 2*pi*R and |Pv| = L, both constant over
 * the patch, so the frame is a fixed non-orthonormal scaling — and which leg
 * is short is decided by the segment's own proportions, not assumed here. */
function tangentFrame(seg) {
  const Lu = 2 * Math.PI * ((seg.rTop + seg.rBot) / 2) * 1000;   // mm around
  const Lv = seg.len * 1000;                                     // mm along
  const m = Math.max(Lu, Lv);
  return { Lu, Lv, t0: Lv / m, t1: Lu / m, gain: Lu / Lv };
}

// The circumferential floor is a property of w alone, so it is stated once.
// dpsi/d(arc) = -sin(phi)/w peaks at 1/w on the quarter face, so the steepest
// circumferential slope a psi-linked height field carries is 2*pi*A_h/w. Set
// that equal to one byte step and solve.
const A_H_CIRC_UM = (BYTE_STEP * RING_W_MM / (2 * Math.PI)) * 1000;
say('\n══ F. SURFACE-RELIEF BUDGET (channel HELD — FLOORS, not targets) ══');
say(`  circumferential floor   A_h = (2/255)*w/(2*pi) = ${f(A_H_CIRC_UM, 4)} µm`
  + `   [Mixed — derived form, linear in the Estimated w = ${RING_W_MM} mm]`);
// The printed wording stays as it was recorded in the R3 pack's archived run:
// Lu/Lv IS |tbn[1]| on every segment that ships (see the slenderness assertion
// below), so the line is accurate, and re-wording it would restale an archived
// report for no gain. The correction that follows is to the SOURCE, which is
// where the misreading happened.
say('  axial floor is that times (Lu/Lv)/R\': the psi field is nearly a 1-D');
say('  circumferential ripple (dpsi/d(axial) = cos(phi)*R\'/w), and three\'s');
say('  derivative frame then shortens the axial leg by Lu/Lv on top of it.');
// READ THE SENSE OF THAT SECOND FACTOR CAREFULLY — a review round read it
// backwards and called the whole floor wrong by 1/t1^2, so the derivation is
// written out rather than left as a factor. The shortened leg attenuates the
// DECODED normal, not the encoded one. three renders
//     slope_axial = (|tbn[1]| * n_y) / n_z
// so representing a given physical axial slope requires a STORED n_y inflated
// by 1/|tbn[1]| — the same inflation §H4 applies to alphaB, and for the same
// reason. One byte step of n_y is therefore only |tbn[1]|*BYTE_STEP of
// physical slope: the axial channel is finely quantised precisely BECAUSE its
// leg is short, and the relief amplitude that first registers is smaller, not
// larger. Attenuation on the decode side is amplification on the encode side.
// The orthonormalised figure printed beside each row is the same floor without
// this factor, and it is the LARGER of the two, which is the reader's check.
// And it reduces, which is worth printing because the reduced form says
// something the first one hides. Lv*R' is just the segment's total radius
// change, so
//     A_h_axial = A_h_circ * (2*pi*R_mid) / (rBot - rTop)
// with the LENGTH cancelling out entirely. The axial floor is a property of
// the taper PROFILE, not of how long the segment is — so it cannot be
// improved by making the segment longer, and two segments with the same mean
// radius and the same radius change have the same floor however different
// their lengths (maple_played.shaft and maple_ld.shaft below are exactly that
// pair). Both forms are computed per segment and asserted equal: if the
// algebra is ever edited on one side, the two disagree instead of agreeing
// wrongly.
say('  it reduces to A_h_circ*(2*pi*R_mid)/(rBot - rTop) — the LENGTH cancels,');
say('  so the axial floor is a property of the taper profile and cannot be');
say('  bought back by making a segment longer.');
let worstGain = 0;
// What this section actually PRINTED, per segment, as the strings it printed.
// §H4a reads these back to prove the report carries enough to reconstruct each
// taper — which is the whole reason §H4 is allowed to print one radius. The
// strings are stored rather than re-formatted there, because a copy of the
// format is not the format: narrowing `f(fr.Lu, 2)` here would leave a re-typed
// reader still asserting against two decimals and still green.
const PRINTED = new Map();
for (const [cls, slot] of WOOD_SLOTS) {
  const seg = GEOM[cls][slot];
  const Rp = (seg.rBot - seg.rTop) / seg.len;      // dR/dz, dimensionless
  const fr = tangentFrame(seg);
  const tag = `${cls}.${slot}`;
  // The slenderness premise, asserted for EVERY wood segment and BEFORE
  // anything branches on the taper. A first draft of this guard got two
  // things wrong, both caught by the merge gate:
  //
  //   * it sat below the untapered `continue`, so the sentence it protects
  //     said "every wood segment" while the check reached only the tapered
  //     ones — the subject of the sentence wider than the subject of the test.
  //   * it compared Lv against fr.Lu, the MID-radius circumference. That is
  //     the same single-radius evaluation MANIFEST.md now records as the
  //     artifact behind the withdrawn "shaft-only" reading of the frame: a
  //     frustum can be slender at its mid radius and not at its wide end. So
  //     the premise is checked against the widest circumference the segment
  //     actually has, and holds along the whole taper rather than only where
  //     this file happened to sample it.
  //
  // What rests on it: t1 = Lu/max(Lu, Lv) equals gain = Lu/Lv only while
  // Lv > Lu, and both the axial floor below and its reduced form are written
  // for the case where the axial leg is the short one.
  const LuMax = 2 * Math.PI * Math.max(seg.rTop, seg.rBot) * 1000;
  if (!(fr.Lv > LuMax)) {
    fail(`${tag}: this segment is not slender over its whole taper — Lv `
      + `${f(fr.Lv, 2)} mm is not greater than its widest circumference `
      + `${f(LuMax, 2)} mm (mid-radius circumference ${f(fr.Lu, 2)} mm), so `
      + 'the axial leg is not the short one everywhere on it. The floor below '
      + 'and its reduced form both assume it is — re-derive them for this '
      + 'geometry rather than reading these numbers');
  }
  if (!(Math.abs(Rp) > 0)) {
    // A cylinder has no axial phase gradient at all, so there is no axial
    // channel to quantise and 1/R' is not a number. Say that instead of
    // printing Infinity, which a reader would take for a very large floor.
    say(`  ${tag.padEnd(20)} R' = 0 — untapered, so psi has NO axial gradient `
      + 'and the axial channel does not exist to be encoded');
    continue;
  }
  // t1, not gain. They are the same number on every segment that ships —
  // every wood segment is slender, so Lv > Lu and t1 = Lu/max = Lu/Lv = gain,
  // and this line is byte-identical on today's geometry. They stop being the
  // same the moment a wood segment is shorter than its own circumference,
  // where gain climbs past 1 while t1 saturates at 1. The frame factor is
  // |tbn[1]|; write |tbn[1]|. The premise is asserted above rather than
  // assumed, because the reduced form below depends on it too.
  const axialUM = A_H_CIRC_UM * fr.t1 / Math.abs(Rp);
  const orthoUM = A_H_CIRC_UM / Math.abs(Rp);
  // the reduced form, computed independently and held against the first
  const reduced = A_H_CIRC_UM * fr.Lu / Math.abs((seg.rBot - seg.rTop) * 1000);
  if (Math.abs(reduced - axialUM) > 1e-9 * axialUM) {
    fail(`${tag}: the two forms of the axial floor disagree — `
      + `A_h_circ*(Lu/Lv)/R' gives ${f(axialUM, 6)} µm and the reduction `
      + `A_h_circ*Lu/(rBot-rTop) gives ${f(reduced, 6)} µm. One of them has `
      + 'been edited without the other, so the printed figure is no longer '
      + 'checked by anything');
  }
  worstGain = Math.max(worstGain, axialUM / A_H_CIRC_UM);
  const pRp = Rp.toExponential(6), pLu = f(fr.Lu, 2), pLv = f(fr.Lv, 2);
  PRINTED.set(tag, { Rp: pRp, Lu: pLu, Lv: pLv });
  say(`  ${tag.padEnd(20)} R' ${pRp}  half-angle `
    + `${f(Math.atan(Math.abs(Rp)) * 180 / Math.PI, 4)}°  Lu ${pLu} mm`
    + `  Lv ${pLv} mm  Lv/Lu ${f(fr.Lv / fr.Lu, 4)}`);
  say(`  ${''.padEnd(20)} |tbn[0]| ${f(fr.t0, 4)}  |tbn[1]| ${f(fr.t1, 4)}`
    + `   slope ratio 1/R' = ${f(1 / Math.abs(Rp), 1)}  [Derived — w cancels]`);
  say(`  ${''.padEnd(20)} axial floor ${f(axialUM, 3)} µm = `
    + `${f(axialUM / A_H_CIRC_UM, 2)}x the circumferential  [Mixed — same w]`);
  say(`  ${''.padEnd(20)} …and ${f(orthoUM, 1)} µm `
    + `(${f(orthoUM / axialUM, 2)}x worse) if the frame is orthonormalised by `
    + 'geometry.computeTangents()');
}
// The load-bearing conclusion, asserted rather than left to the reader: the
// two floors are not comparable, so a single amplitude cannot serve both
// directions. The slope ratio 1/R' is the part of this that survives any
// future measurement of w, because w cancels out of it.
if (!(worstGain > 2)) {
  fail(`the axial encoding floor is now within a factor of ${f(worstGain, 2)} `
    + 'of the circumferential one on every wood segment. That was the whole '
    + 'reason a single psi-linked relief amplitude could not serve both '
    + 'directions here, so the geometry has changed under this argument and '
    + 'the argument needs re-reading, not this gate re-tuning');
}
ok(`the axial relief floor exceeds the circumferential one by up to `
  + `${f(worstGain, 1)}x across the wood segments — so a psi-linked normal `
  + 'map has no single amplitude that encodes in both directions, and the '
  + 'circumferential:axial slope ratio 1/R\' that causes it is Derived '
  + '(w cancels), which is the one conclusion here a measurement of w cannot '
  + 'move');

// ── THE HELD-CHANNEL GUARD ──────────────────────────────────────────────
// §F bounds a channel that is NOT shipping, so the section is only worth its
// space if landing the channel cannot happen quietly. These names are the
// ways it would arrive. The message says how to LIFT the hold, because this
// is a hold and not a prohibition — what it must not be is a default.
//
// All three rows are case-INSENSITIVE, which they were not: row 1 carried `gi`
// and rows 2 and 3 carried `g`, so `NormalMap` or `RoughnessMap` in any casing
// but three's own walked past two thirds of this guard. The inconsistency had
// no stated reason and the rule these rows encode — "the ways the channel would
// arrive" — has no casing in it. The `i` costs nothing here because of the line
// below: the sweep runs over the STRIPPED source, so the prose that explains a
// hold is already out of reach of it, which is the only thing case-insensitivity
// would otherwise have made unwritable.
//
// Stated plainly, because the round measured it: nothing in the tree spells any
// of these another way today, so `g` and `gi` are green on the same bytes and
// this repair moves no line of the report. That means its negative case is
// SYNTHETIC — the battery has to introduce a spelling that does not exist in
// order to show the difference — and a synthetic case is what a repair with no
// live subject is entitled to, not an excuse for shipping without one.
const HELD = [
  [/\bA_h\b|\brelief(?:Amp|Depth|MM|UM)?\b|\bheightAmp\b|\bnormalAmp\b/gi,
    'a relief AMPLITUDE',
    'a measured A_h — white-light interferometry, confocal or stylus '
    + 'profilometry across ring boundaries on independently sourced finished '
    + 'shafts'],
  [/\bnormalMap\b|\bnormalScale\b|\bbumpMap\b|\bbumpScale\b/gi,
    'a NORMAL or BUMP map',
    'the same measured A_h, plus a MAT_KEYS entry so the amplitude cannot '
    + 'arrive at a constructor default nobody chose'],
  [/\broughnessMap\b|\bpsiMod(?:Depth|Phase)\b/gi,
    'a ROUGHNESS map',
    'micro-goniophotometry or a confocal scan across several rings — a gloss '
    + 'meter integrates over a spot far wider than one ring and structurally '
    + 'cannot settle a per-ring modulation'],
];
// Swept over the stripped source: naming a channel in a comment is how a hold
// gets EXPLAINED, and row 1 matches a bare `relief` case-insensitively, so the
// raw-text version of this sweep made the explanation unwritable.
let heldClean = 0;
for (const [re, what, settles] of HELD) {
  const hits = looksCode.match(re);
  if (!hits) { heldClean += 1; continue; }
  fail(`web/scene/cuelooks.js now carries ${what} in code `
    + `(${[...new Set(hits)].join(', ')}) while §F holds that channel. If the `
    + 'hold is being lifted, lift it HERE, in the same commit: the floors '
    + 'above are byte-encoding limits, NOT target amplitudes, and an '
    + `amplitude picked to clear one is an authored constant wearing a `
    + `derived label. What settles it instead is ${settles}`);
}
if (heldClean === HELD.length) {
  ok(`all ${HELD.length} held relief/roughness channels are absent from the `
    + 'code of cuelooks.js, so no amplitude has been landed against these '
    + 'floors — while the comments stay free to say which ones are held');
}
// Print, do not compute. `normalScale` is the one term in the whole channel
// whose correct value is Derived-by-abstention: it must stay at three's
// library default, because any other value is a second amplitude multiplying
// A_h with no ledger entry of its own. Worth stating that nothing in the tree
// currently relies on that default — balls.js keeps amplitude in normalScale
// deliberately — so a cue normal map would be the first place it mattered.
// Two printed lines rather than one, and the split is not cosmetic. The
// owner pack's `prose: no fabricated A_h` row reads a WHOLE line and reds any
// line carrying both the token and a numeral with no arithmetic beside it —
// its format rule is one number and its own derivation per line. `(1,1)` is a
// library default, not an amplitude, and the sentence about A_h is a sentence;
// under that rule they belong on separate lines, and writing them that way is
// cheaper than teaching the row an exception.
say('  normalScale             must remain three\'s (1,1) library default if '
  + 'this channel ever lands.');
say('                          It multiplies A_h, so a non-default value is a '
  + 'second amplitude with no ledger row. No cue material sets it today.');

// ═══════════════════════════════════════════════════════════════════════
// G. GLOSS → GGX INVERSION — WITHHELD, inputs unverified
// ═══════════════════════════════════════════════════════════════════════
// This section would convert a published gloss reading into the `roughness`
// this file ships, and it is not here. Not because the arithmetic is hard —
// the GGX integral over a receptor aperture is a numerical quadrature and the
// shipped-pipeline modifiers are already read off the bundle in §E — but
// because every INPUT it needs is a citation, and this round has no way to
// check a citation. The two it turns on are the ASTM D523 60-degree
// source/receptor aperture geometry and the n = 1.567 calibration index of the
// primary standard. Both were recalled confidently by more than one survey and
// neither was opened, and one of those surveys emitted page-precise references
// for papers it never fetched. A conversion whose aperture is remembered is not
// a derivation; it is a plausible number with a bibliography.
//
// So the section is stubbed rather than approximated. The distinction matters:
// a printed §G that said "roughness 0.32 corresponds to about 13 GU" would be
// cited downstream within a round, and the qualifier would not travel with it.
// Nothing is worse for this tree than a derived-looking figure whose premise
// nobody can reach — that is the exact defect this whole tool exists to make
// impossible, and it does not get an exemption for being convenient.
//
// The most valuable thing §G would have produced needs none of it, and it has
// already moved elsewhere: the D523 ADMISSIBILITY result. A 60-degree spot on
// a cylinder of shaft radius sweeps the surface normal by more than the
// receptor's half-aperture, so the instrument the tree has been promising
// itself since MANIFEST gap 1 cannot legally read a turned cue segment at all.
// That is pure geometry off segGeom(), it is independent of the aperture
// figures, and gap 1 is being rewritten to say the closing measurement changes
// SHAPE rather than remaining pending. §G does not block that.
say('\n══ G. GLOSS → GGX INVERSION ══');
say('  WITHHELD — inputs unverified. The D523 60 deg aperture geometry and the');
say('  n = 1.567 primary-standard index are recalled, not read: the mandated');
say('  external-search tool is unregistered in this environment, so no');
say('  compliant path exists to open either standard. Landing the conversion');
say('  would publish a figure on recall. Blocked on Q1; see');
say('  handoff/R3-PHASE-B-DERIVATION-PLAN.md sections 1 and 5 item 1.');
say('  NOT blocked by this: the D523 admissibility result, which is geometry');
say('  only and does not use these inputs (MANIFEST gap 1) — G1 below.');

// ── G1. ADMISSIBILITY, WITHOUT ANY INSTRUMENT DIMENSION ────────────────
// The one part of §G that survives Q1, and it is the part MANIFEST gap 1
// actually turns on. A gloss reading is only meaningful if the specular lobe
// it collects comes off a surface whose normal is CONSTANT over the
// illuminated spot; on a cylinder it is not, and the rate is fixed by the
// radius alone.
//
// Deliberately NOT parameterised by spot size or receptor aperture, because
// those are the two figures this round cannot read. Printed instead as a RATE
// — degrees of surface normal per millimetre of spot measured across the
// circumference, d(theta)/ds = 1/R — which is pure geometry off the built cue.
// A reader who has the standard in front of them multiplies by its spot width
// and compares against its receptor half-aperture; the comparison is theirs to
// close, and the rate does not move when they do it.
//
// The rate is quoted at R_min (the tightest curvature on the segment, so the
// worst case) and at 60 degrees of incidence the spot elongates by 1/cos(60)
// = 2 along the plane of incidence. Whether that doubling lands on the curved
// axis depends on how the segment is presented to the instrument, so both are
// printed rather than one being assumed: a cue laid with its axis in the plane
// of incidence sweeps the base rate, and turned 90 degrees it sweeps twice it.
say('');
say('  G1. admissibility — instrument-free rate, d(theta)/ds = 1/R_min:');
{
  let worstRate = 0, worstAt = '';
  for (const [cls, slot] of WOOD_SLOTS) {
    const seg = GEOM[cls][slot];
    const rMin = Math.min(seg.rTop, seg.rBot);
    // rad/m -> deg per mm of arc across the circumference.
    const degPerMM = (1 / rMin) * (180 / Math.PI) / 1000;
    if (degPerMM > worstRate) { worstRate = degPerMM; worstAt = `${cls}.${slot}`; }
    say(`    ${`${cls}.${slot}`.padEnd(20)} R_min ${f(rMin * 1000, 3)} mm  =>  `
      + `${f(degPerMM, 2)} deg/mm across  (${f(2 * degPerMM, 2)} deg/mm if the `
      + '60 deg elongation lands on the curved axis)');
  }
  say(`    worst ${worstAt}: ${f(worstRate, 2)} deg of normal per mm of spot. A `
    + 'flat coupon');
  say('    sweeps zero, which is what every published gloss value for a finish');
  say('    was measured on. State the consequence, do not name a number: any');
  say('    instrument whose spot is a millimetre or more across a cue shaft is');
  say('    integrating the lobe over a normal range of this order, so a single');
  say('    reading off a turned segment is not the same measurement as a');
  say('    reading off a panel of the same finish. Gap 1\'s closing measurement');
  say('    therefore changes SHAPE — a flat witness coupon finished alongside');
  say('    the piece, or a goniometric scan that resolves the sweep instead of');
  say('    integrating it — rather than staying open waiting for a meter.');
  if (!(worstRate > 0)) {
    fail('the worst-case curvature rate came out non-positive, which cannot '
      + 'happen for a real segment — segGeom() radii are no longer reaching '
      + 'this block and the admissibility conclusion is unheld');
  }
}

// A withheld section that is only PROSE is not withheld — it is a comment, and
// this tool's entire premise is that a comment holds nothing. The withholding
// is therefore enforced: while §G is stubbed, no provenance tag in the module
// may cite a gloss INSTRUMENT or a gloss UNIT as its source, because there is
// no verified conversion in the tree for it to have come through.
//
// Guarded on the instrument and the unit, deliberately not on the word
// "gloss": the module says "no gloss reading" eleven times, and those are
// honest denials of exactly this measurement. Banning the word would punish
// the disclosure and leave the claim reachable by paraphrase.
{
  const GLOSS_CITE = /\bD[\s-]?523\b|\bISO[\s-]?2813\b|\bGU\b|gloss unit/gi;
  const hits = looksSrc.match(GLOSS_CITE);
  if (hits) {
    fail(`web/scene/cuelooks.js cites a gloss instrument or unit `
      + `(${[...new Set(hits.map((h) => h.trim()))].join(', ')}) while §G is `
      + 'WITHHELD. There is no verified gloss→GGX conversion in this tree: the '
      + 'aperture geometry and the calibration index behind it are recalled, '
      + 'not read. A roughness sourced to a gloss reading through a conversion '
      + 'nobody can check is Estimated wearing a citation. Either clear Q1 and '
      + 'land §G, or state the reading as an observation and tag it Estimated');
  }
  ok(hits
    ? `web/scene/cuelooks.js cites ${new Set(hits.map((h) => h.trim())).size} `
      + 'distinct gloss instrument/unit token(s) while §G is withheld — see the '
      + 'FAIL line above'
    : 'no provenance tag cites a gloss instrument or unit while §G is '
      + 'withheld (the module\'s eleven "no gloss reading" disclosures are '
      + 'denials of the measurement, not claims of it, and are not swept)',
  Boolean(hits));
}

// ═══════════════════════════════════════════════════════════════════════
// H. FIBRE AXIS AND CAPTURE GEOMETRY — the anisotropy channel, held
// ═══════════════════════════════════════════════════════════════════════
// Channel 3 is chatoyance: the cat's-eye band a clear-finished shaft shows
// when the light rakes along it. Its DIRECTION is derivable with zero free
// scalars and is worked out here; its STRENGTH is not, and that is why the
// channel is held. The strength is a single scalar that is only visible at
// the grazing axial framing — which is precisely the framing R2 recorded as
// unposable by the atelier rig, and which it cut the sampler derivation over
// (§C). A channel whose one free number can only be judged at a framing the
// round cannot photograph is not ready, however sound its direction.
//
// Everything below is geometry off the built cue plus the vendored shader,
// so it holds whether or not the strength is ever measured.
{
  const seg = GEOM.maple_played.shaft;
  const bt = GEOM.maple_played.butt;
  // ── H1. THE UV CONVENTION, RE-MEASURED ────────────────────────────────
  // §A already documents which end is which; what matters here is the STEP,
  // because u is what the tangent lands on.
  say('\n══ H. FIBRE AXIS AND CAPTURE GEOMETRY (channel HELD) ══');
  say(`  uv convention           u wraps the circumference in `
    + `${seg.radial} steps of 1/${seg.radial}; v runs the axis, uv.v = 1 at `
    + `radiusTop = the TIP-ward end (§A). So U is circumferential = ACROSS `
    + 'the fibres, V is axial = ALONG them.');

  // ── H2. THE OUT-OF-PLANE RESIDUAL ─────────────────────────────────────
  // three's anisotropy axis is strictly in the tangent plane. On a turned
  // cue the fibre axis is the billet axis, which the taper tilts out of that
  // plane by exactly the §F half-angle. Whether that is negligible depends
  // on the reflection lobe's angular width, and the only published figures
  // for a wood fibre lobe are NOT re-verified in this pass (the mandated
  // external-search tool is unregistered — see the round's Q1), so no single
  // lobe width is quoted as fact. Instead the residual is printed against a
  // SWEEP of assumed widths, and every one of them is labelled assumed.
  const half = (s) => Math.atan(Math.abs((s.rBot - s.rTop) / s.len)) * 180 / Math.PI;
  const LOBE_ASSUMED_DEG = [5, 10, 15];
  for (const [name, s] of [['shaft', seg], ['butt', bt]]) {
    say(`  out-of-plane ${name.padEnd(11)} taper tilts the fibre axis `
      + `${f(half(s), 4)}° out of the tangent plane = `
      + `${LOBE_ASSUMED_DEG.map((b) => `${f(100 * half(s) / b, 1)}% of ${b}°`)
        .join(', ')}  [all three widths ASSUMED, not measured, not cited]`);
  }
  say('  → the conclusion does not need the true lobe width: the residual is '
    + 'under half a degree, so three\'s strictly in-plane axis is defensible '
    + 'on THIS geometry for any lobe wider than about a degree. What the '
    + 'unverified figures would settle is the STRENGTH, which is held anyway.');

  // ── H3. THE ROTATION SIGN CHAIN ───────────────────────────────────────
  // Read straight out of the vendored bundle rather than recalled:
  //   anisotropyVector = (a*cos(rotation), a*sin(rotation))     [WebGL uniform]
  //   anisotropyT = tbn[0]*V.x + tbn[1]*V.y
  //   anisotropyB = tbn[1]*V.x - tbn[0]*V.y
  //   alphaT      = mix(pow2(roughness), 1.0, pow2(anisotropy))
  //   D_GGX_Anisotropic(alphaT, alphaB=pow2(roughness), dotNH, dotTH, dotBH)
  //     with v = (alphaB*dotTH, alphaT*dotBH, alphaT*alphaB*dotNH)
  // so alphaT IS the roughness along T, it is the WIDENED one (it runs to 1
  // as anisotropy runs to 1), and at rotation = 0 the vector is (1,0) and
  // T = tbn[0] = U.
  //
  // U is circumferential, i.e. ACROSS the fibres, and across the fibres is
  // where the widened axis belongs: parallel tracheids give microfacet
  // normals that tilt across the fibre and not along it, so the slope
  // variance — and therefore the broad lobe, and therefore the visible band
  // — is perpendicular to the grain. That is the cat's-eye. rotation = 0.
  //
  // NOT to be re-litigated from table.js's cloth comment about a highlight
  // stretching ALONG the grain: that is a RESOLVED-RIDGE normal-map effect at
  // a scale where individual ridges are drawn, which §C establishes is not
  // this scale. Different mechanism, different direction, same words.
  const rough = looks.CUE_LOOK_DEFAULTS?.materials;
  say('  rotation                0 — anisotropyT = tbn[0] = U = across the '
    + 'fibres, which is where the widened alphaT belongs (alphaT runs to 1; '
    + 'alphaB stays pow2(roughness)). Read off the vendored r170 chunks, not '
    + 'recalled.');

  // ── H4. THE TANGENT-FRAME DEGENERACY, AS A SHIPPING PRECONDITION ──────
  // §F's non-orthonormal frame is a footnote for a normal map and a blocker
  // here, because anisotropyT/B are NOT re-normalised in the shader: the
  // short leg scales dotBH directly, which is the same as inflating alphaB
  // by 1/|tbn[1]|. Compare that inflated alphaB against the LARGEST alphaT
  // the material can reach — alphaT is a mix() toward 1.0, so 1.0 is the
  // ceiling — and the question is not "how much weaker" but "which way round".
  let inverted = 0;
  for (const [name, s] of [['shaft', seg], ['butt', bt]]) {
    const fr = tangentFrame(s);
    const r = rough?.[name]?.roughness;
    if (typeof r !== 'number') {
      fail(`the default recipe carries no numeric ${name}.roughness, so §H `
        + 'cannot compute the effective alphaB it needs; a silent default '
        + 'here would hide the frame degeneracy rather than report it');
      continue;
    }
    const alphaB = r * r;
    const effB = alphaB / fr.t1;
    if (effB > 1) inverted += 1;
    say(`  frame degeneracy ${name.padEnd(6)} |tbn[1]| ${f(fr.t1, 4)} is not `
      + `re-normalised, so alphaB ${f(alphaB, 4)} (roughness ${r}) arrives as `
      + `${f(effB, 4)} — against an alphaT ceiling of 1.0`
      + `${effB > 1 ? '  ⇒ INVERTED: the broad axis lands ALONG the fibres'
        : `  (${f(1 / effB, 2)}x of headroom left)`}`);
  }
  // ── H4a. THE TAPER, NOT THE SAMPLE POINT ──────────────────────────────
  // §H4 above prints ONE effB per segment, evaluated where tangentFrame()
  // samples the circumference: the mid radius. §F already had to repair the
  // same shape once — its slenderness premise was checked at the mid radius
  // and now runs against the widest circumference the segment actually has —
  // and MANIFEST.md records that reading the frame at a single radius is what
  // produced the withdrawn "shaft-only" conclusion. This is that repair for
  // §H4, and it is the last place in this file where a taper is summarised by
  // one number.
  //
  // Silent, for a reason stronger than the archive. §H4b below is silent
  // because the R3 pack archived that report byte for byte; this section is
  // silent because THE REPORT ALREADY CARRIES THE RANGE. effB(R) is
  // alphaB*Lv/(2*pi*R), so it goes as 1/R, so its reciprocal is linear in R —
  // and the harmonic mean of the two end evaluations is therefore the
  // evaluation at the mean radius, exactly, not approximately. The printed
  // mid-radius figure is not one sample out of a range; it is the range's
  // harmonic mean, and §F prints Lu, Lv and R' beside it, which give back both
  // radii. So a reader can reconstruct the ends from what is already on the
  // page. Both halves of that are asserted below rather than asserted in
  // prose: the identity, and the reconstruction. Silence has to be earned by
  // sufficiency, or it is just an archive that has stopped being checked.
  //
  // What the taper evaluation found, once each class's OWN authored roughness
  // is read instead of the default look's: the mid-radius reading calls three
  // of the six wood segments inverted, and the taper calls all six. The two
  // 0.42 butts cross over the tipward 0.88% of their length — the knife edge
  // MANIFEST.md already records — but the masse butt is authored at 0.50 and
  // crosses over 47.8% of its, while its mid radius reads 0.9950 and passes.
  // "Knife edge" is a property of the default cue, not of the phenomenon.
  // Flattened so the escaped newlines the minifier leaves inside the GLSL
  // string literals do not decide whether a sequence is contiguous. Read here
  // rather than in §H4b because both sections need it: §H4a(ii) for the
  // vertexTangents predicate, §H4b for the roughness pipeline.
  const threeSrc = fs.readFileSync(
    `${repoRoot}/web/vendor/three.module.min.js`, 'utf8')
    .replace(/\\n|\\t|\s+/g, ' ');
  const TAPER = new Map();
  // Half a unit in the last place of a number as it was PRINTED — fixed and
  // exponential forms. The strings come from §F, so a narrower format there
  // widens these bounds here, and the crossing-resolution check below is what
  // stops that from being free.
  const halfFixed = (s) => 0.5 * 10 ** -((s.split('.')[1] || '').length);
  const halfExp = (s) => {
    const [mant, exp] = s.split('e');
    return 0.5 * 10 ** (Number(exp) - (mant.split('.')[1] || '').length);
  };
  for (const [cls, slot] of WOOD_SLOTS) {
    const s = GEOM[cls][slot];
    const tag = `${cls}.${slot}`;
    const r = looks.cueLookFor(CUE_CLASS[cls])?.materials?.[slot]?.roughness;
    if (typeof r !== 'number') {
      fail(`${tag}: the ${CUE_CLASS[cls]} recipe carries no numeric ${slot}.`
        + 'roughness, so this segment has no effB at any radius — and the '
        + 'census below would then be taken over a smaller set than it names, '
        + 'which is the failure mode this section exists to stop');
      continue;
    }
    if (!(s.rBot > s.rTop)) {
      fail(`${tag}: this segment does not widen from tip to butt (rTop `
        + `${f(s.rTop * 1000, 4)} mm, rBot ${f(s.rBot * 1000, 4)} mm). The `
        + 'inverted-extent fraction below is written for one that does — it '
        + 'measures from the TIPWARD end, where effB is largest. Re-derive it '
        + 'for this profile rather than reading the number it prints');
      continue;
    }
    const alphaB = r * r;
    const fr = tangentFrame(s);
    // The two ends from the RADIUS, the middle from the FRAME. Computing both
    // sides the same way would make the identity below a tautology instead of
    // a test: what is under test is where tangentFrame() samples.
    const effR = (R) => alphaB * fr.Lv / (2 * Math.PI * R * 1000);
    const tip = effR(s.rTop), wide = effR(s.rBot);
    const mid = alphaB / fr.t1;
    const hm = 2 / (1 / tip + 1 / wide);
    // Two tiers. The wide one states the published claim — MANIFEST.md quotes
    // these to four places, so four places is the width of the sentence. The
    // narrow one is the gate that actually bites: the identity is EXACT in
    // exact arithmetic, the measured residual across all six segments is at
    // the double-precision floor (<= 5e-16 relative), and anything that moves
    // the sample point moves it by percent, not by 1e-9. Stating only the
    // four-place tier would leave a decimal order of slack that no real drift
    // is small enough to hide in but a re-derivation could quietly spend.
    const relErr = Math.abs(mid - hm) / Math.max(Math.abs(hm), Number.MIN_VALUE);
    if (Math.abs(mid - hm) > 0.5e-4) {
      fail(`${tag}: the printed effB ${f(mid, 4)} is NOT the harmonic mean of `
        + `its ends (${f(tip, 4)} tipward, ${f(wide, 4)} at the wide end, `
        + `harmonic mean ${f(hm, 4)}). effB goes as 1/R, so those two agree `
        + 'exactly when — and only when — tangentFrame() samples the '
        + 'ARITHMETIC mid radius. They disagree, so either the sample point '
        + 'moved or the segment is no longer slender and t1 has saturated at '
        + '1. Either way the one figure §H4 prints has stopped summarising '
        + 'the range, and the range must be printed');
    } else if (relErr > 1e-9) {
      fail(`${tag}: the harmonic-mean identity still holds to four places but `
        + `has drifted to ${relErr.toExponential(2)} relative, and it is `
        + 'algebraically exact — a residual this far above the arithmetic '
        + 'floor means the two sides are no longer the same quantity. Find '
        + 'what changed before the four-place claim is the thing that fails');
    }
    // ---- the report is SUFFICIENT: reconstruct the ends from what §F prints
    const p = PRINTED.get(tag);
    if (!p) {
      fail(`${tag}: §F printed no frame row for this wood segment, so the `
        + 'report no longer carries Lu, Lv and R\' for it and its taper cannot '
        + 'be reconstructed from the page. §H4 may only print one radius for '
        + 'a segment whose other radii the reader can recover');
      continue;
    }
    const RmidMM = Number(p.Lu) / (2 * Math.PI);
    const dRMM = Number(p.Rp) * Number(p.Lv);
    const recovered = [RmidMM - dRMM / 2, RmidMM + dRMM / 2];
    const err = Math.max(Math.abs(recovered[0] - s.rTop * 1000),
      Math.abs(recovered[1] - s.rBot * 1000));
    // The bound is the printed rounding propagated, not a tuned tolerance:
    // half a unit of Lu through the 2*pi, plus half the error on the radius
    // change, which carries half a unit of Lv and the last place of R'.
    const bound = halfFixed(p.Lu) / (2 * Math.PI)
      + (Math.abs(Number(p.Rp)) * halfFixed(p.Lv)
        + Number(p.Lv) * halfExp(p.Rp)) / 2;
    if (err > bound) {
      fail(`${tag}: the radii reconstructed from the printed row (${
        f(recovered[0], 4)}, ${f(recovered[1], 4)} mm) miss the built ones (${
        f(s.rTop * 1000, 4)}, ${f(s.rBot * 1000, 4)} mm) by ${f(err, 6)} mm, `
        + `past the ${f(bound, 6)} mm the printed rounding allows. Lu, Lv and `
        + 'R\' no longer describe the same segment §H4 reports on');
    }
    // Where effB crosses 1, in mm of radius. This is the question the range is
    // asked for, so it is also the scale the reconstruction has to resolve: a
    // report whose rounding is coarser than the distance from an end to the
    // crossing cannot tell a reader whether that end inverts, however
    // faithfully it reconstructs the radii on average.
    const RstarMM = alphaB * fr.Lv / (2 * Math.PI);
    const margin = Math.min(Math.abs(RstarMM - s.rTop * 1000),
      Math.abs(RstarMM - s.rBot * 1000));
    if (!(bound < margin)) {
      fail(`${tag}: the printed row resolves the radius to ${f(bound, 6)} mm, `
        + `but its nearer end sits ${f(margin, 6)} mm from the radius where `
        + `effB crosses 1 (${f(RstarMM, 4)} mm). The report can no longer `
        + 'answer whether that end inverts, which is the one thing the range '
        + 'is for — widen §F\'s format rather than deleting this check');
    }
    const frac = Math.max(0, Math.min(1,
      (RstarMM - s.rTop * 1000) / ((s.rBot - s.rTop) * 1000)));
    TAPER.set(tag, { rough: r, tip, mid, wide, frac });
  }
  // The census, derived. Both halves of it: what the mid radius finds, and
  // what the taper finds. The gap between them is the finding.
  const taperInv = [...TAPER].filter(([, t]) => t.tip > 1).map(([k]) => k);
  const midInv = [...TAPER].filter(([, t]) => t.mid > 1).map(([k]) => k);
  const pct4 = (x) => f(x * 100, 4);

  // ── H4a(ii). THE ATTRIBUTE IS INERT UNTIL THE CHANNEL TURNS ON ────────
  // §H5 prices an explicit tangent attribute and §H4 calls it a precondition,
  // which together read as "expensive and blocked". They are not the same
  // claim, and the difference decides whether the buffer can be landed BEFORE
  // the strength measurement exists. three compiles USE_TANGENT on
  //
  //     vertexTangents: !!geometry.attributes.tangent && (normalMap || anisotropy > 0)
  //
  // so with both of those channels held — which is exactly today's state, and
  // what the sister gate's MAT_PROPS_HELD tier enforces recipe-side — the
  // attribute changes no define, compiles no second program and binds no
  // uniform. It is bytes in a buffer and nothing else. That makes the
  // precondition payable early, and it is a real conclusion rather than a
  // convenience, so both of its premises are read rather than recalled: the
  // predicate out of the vendored bundle, and the channel state out of the
  // registry.
  const predIdx = threeSrc.indexOf('vertexTangents:!!');
  const pred = predIdx < 0 ? null : threeSrc.slice(predIdx)
    .match(/^vertexTangents:!!(\w+)\.attributes\.tangent&&\((\w+)\|\|(\w+)\)/);
  if (!pred) {
    fail('§H4a cannot read three\'s vertexTangents predicate out of the '
      + 'vendored bundle in the form `!!<geometry>.attributes.tangent && (<a> '
      + '|| <b>)`. The inertness of an unused tangent attribute rests on that '
      + 'exact shape, so a three upgrade that changed it invalidates the '
      + 'claim — the conclusion has to be re-MADE, not re-read');
  } else {
    // The operands are minifier names and are resolved where they are BOUND,
    // taking the assignment nearest the predicate: a bare `,V=` search over
    // the whole bundle would find whichever scope happened to come first.
    const before = threeSrc.slice(0, predIdx);
    const boundTo = (n) => {
      const all = [...before.matchAll(new RegExp(`[,;{(]${n}=([^,;]+)`, 'g'))];
      return all.length ? all[all.length - 1][1] : null;
    };
    const got = [boundTo(pred[2]), boundTo(pred[3])];
    const want = [/^!!\w+\.normalMap$/, /^\w+\.anisotropy>0$/];
    const matched = want.every((re) => got.some((g) => g !== null && re.test(g)));
    if (!matched) {
      fail('§H4a read three\'s vertexTangents predicate but its two operands '
        + `are not the held channels this section names: they bind to ${
          got.map((g) => (g === null ? '<unresolved>' : g)).join(' and ')}, `
        + 'not to a normalMap test and an anisotropy > 0 test. Something '
        + 'else now arms the tangent attribute, so "inert while both channels '
        + 'are held" is no longer the whole condition');
    }
  }
  // The other premise: nothing in the shipped registry arms either channel.
  const armed = [];
  for (const id of Object.keys(looks.CUE_LOOKS)) {
    for (const [slot, rec] of
      Object.entries(looks.cueLookFor(id)?.materials ?? {})) {
      for (const k of Object.keys(rec)) {
        if (k === 'normalMap' || k === 'anisotropy') armed.push(`${id}.${slot}.${k}`);
      }
    }
  }
  if (armed.length) {
    fail(`the tangent attribute is no longer inert: ${armed.length} shipped `
      + `recipe slot(s) arm three's USE_TANGENT predicate (${armed.join(', ')
      }). §H5's vertex-buffer figure was the WHOLE cost of landing the `
      + 'attribute only while both channels were held; with one of them live '
      + 'it also costs a second compiled program and a per-fragment term, '
      + 'neither of which this file has measured');
  }

  // ── H4b. THE FIGURES MANIFEST.md TYPES, PINNED TO THE GEOMETRY ────────
  // The frame paragraph in docs/reference/MANIFEST.md types numbers off this
  // butt: the effB at its tipward radius, the geometryRoughness at which its
  // mid radius and its wide end cross into inversion, and the effB range at
  // the roughness clamp. Those are figures typed into prose — the exact defect
  // class this lane exists to kill — so they are held to the geometry here
  // instead of trusted to stay true.
  //
  // Deliberately SILENT. It must not add a line to --report, because the R3
  // owner pack archived that report byte for byte; this either fails or says
  // nothing.
  //
  // It pins the paragraph's INPUTS as well as its outputs, because a gate that
  // only recomputes outputs blesses a derivation whose stated premises have
  // drifted: retyping the clamp or the base roughness in the prose would leave
  // every output regex matching and the tool green. The clamp and the floor
  // come out of the vendored shader source, not out of a constant typed here.
  //
  // And the thresholds are checked for FORM, not merely for sufficiency. The
  // sentence claims a four-place ceiling, so the value must have four decimals
  // and equal that ceiling exactly. Sufficiency alone lets 0.03015 stand while
  // the prose says four places; a truncated value is worse still — the first
  // draft typed 0.0301 for a threshold whose exact value is 0.030147, and
  // 0.0301 does not invert at all.
  const manifest = fs.readFileSync(
    `${repoRoot}/docs/reference/MANIFEST.md`, 'utf8').replace(/\s+/g, ' ');
  const rBt = rough?.butt?.roughness;
  const frBt = tangentFrame(bt);
  const effAt = (R, extra = 0) =>
    ((rBt + extra) ** 2) / (2 * Math.PI * R / bt.len);
  const ceil4 = (x) => Math.ceil(x * 1e4) / 1e4;
  // The shipped clamp and floor, read off the vendored chunk rather than
  // recalled — the same rule §H applies to everything else it cites. Matched
  // as ONE CONTIGUOUS SEQUENCE, not as two endpoint literals: a three upgrade
  // that dropped or rescaled `material.roughness += geometryRoughness` between
  // them would leave both literals in place and every threshold below invalid,
  // and endpoint reads would have called that green. The `geometryRoughness`
  // definition is inside the match for the same reason.
  const pipe = threeSrc.match(new RegExp([
    'float geometryRoughness = max\\( max\\( dxy\\.x, dxy\\.y \\), dxy\\.z \\);',
    'material\\.roughness = max\\( roughnessFactor, ([0-9.]+) \\);',
    'material\\.roughness \\+= geometryRoughness;',
    'material\\.roughness = min\\( material\\.roughness, ([0-9.]+) \\);',
  ].join('\\s*')));
  if (!pipe) {
    fail('§H4b cannot read the roughness pipeline out of the vendored three '
      + 'source as one sequence — floor, then += geometryRoughness, then '
      + 'clamp. Either a three upgrade changed it, in which case every '
      + 'geometryRoughness threshold in MANIFEST.md needs re-deriving and not '
      + 'just re-reading, or the chunk was reformatted; re-point this read');
  }
  const FLOOR = pipe ? pipe[1] : null;
  const CLAMP = pipe ? pipe[2] : null;
  const sameNum = (typed, actual) =>
    actual !== null && Math.abs(Number(typed) - Number(actual)) < 1e-12;
  function threshold(typedStr, R, exact) {
    const dec = (typedStr.split('.')[1] || '').length;
    if (dec !== 4) {
      return `it is written to ${dec} decimal place(s) while the sentence `
        + 'claims a four-place ceiling; write four';
    }
    const want = ceil4(exact);
    if (Math.abs(Number(typedStr) - want) > 1e-12) {
      return `sqrt(2*pi*R/Lv) - ${rBt} = ${f(exact, 8)}, whose four-place `
        + `ceiling is ${want.toFixed(4)}, not ${typedStr}`;
    }
    if (!(effAt(R, Number(typedStr)) > 1)) {
      return `at that value effB is ${f(effAt(R, Number(typedStr)), 6)}, which `
        + 'does NOT invert — the ceiling has landed exactly on the crossing, '
        + 'so the sentence needs the strict inequality rather than a figure';
    }
    return null;
  }
  const exactAt = (R) => Math.sqrt(2 * Math.PI * R / bt.len) - rBt;
  const RMID = (bt.rTop + bt.rBot) / 2;
  // Extents are quoted to four places for the same reason the thresholds are:
  // the default butt clears 1.0 by 0.27%, so its inverted extent is 0.88% of
  // the segment and two decimals of a percent is the whole signal.
  const pctForm = (typedStr, value) => {
    const dec = (typedStr.split('.')[1] || '').length;
    if (dec !== 4) {
      return `it is written to ${dec} decimal place(s) while this paragraph `
        + 'quotes extents to four; write four';
    }
    return typedStr === pct4(value) ? null
      : `the geometry gives ${pct4(value)}%, not ${typedStr}%`;
  };
  // The butts at one authored roughness, as a group — so the sentence's COUNT
  // is checked and not just its figure. A butt quietly re-authored onto the
  // same roughness would otherwise leave "the 2 butts" reading as prose while
  // three of them shared the extent.
  const buttsAt = (typedRough) => [...TAPER]
    .filter(([k, t]) => k.endsWith('.butt') && sameNum(typedRough, t.rough));
  const buttGroup = (typedRough, typedCount, typedPct) => {
    const g = buttsAt(typedRough);
    if (g.length !== Number(typedCount)) {
      return `it counts ${typedCount} butt(s) at roughness ${typedRough} and `
        + `the registry authors ${g.length}${g.length
          ? ` (${g.map(([k]) => k).join(', ')})` : ''}`;
    }
    const odd = g.filter(([, t]) => pctForm(typedPct, t.frac) !== null);
    return odd.length
      ? `${odd.map(([k]) => k).join(', ')} disagrees: ${
        pctForm(typedPct, odd[0][1].frac)}` : null;
  };
  const claims = [
    // ---- the inputs the paragraph states -------------------------------
    [/`min\(max\(roughnessFactor, ([0-9.]+)\) \+ geometryRoughness, ([0-9.]+)\)`/,
      'the shipped roughness path', (m) => {
        const bad = [];
        if (!sameNum(m[1], FLOOR)) bad.push(`floor ${m[1]} (shader ${FLOOR})`);
        if (!sameNum(m[2], CLAMP)) bad.push(`clamp ${m[2]} (shader ${CLAMP})`);
        return bad.length
          ? `it does not match the vendored shader at ${bad.join(', ')}` : null;
      }],
    // The operator is matched, not wildcarded: a formula that flipped to
    // `+ 0.42` would still hand this callback the number it expects.
    [/`sqrt\(2\*pi\*R\/Lv\) [\u2212-] ([0-9.]+)` rounded \*\*up\*\* to four places/,
      'the base roughness the thresholds subtract', (m) => sameNum(m[1], rBt)
        ? null
        : `it subtracts ${m[1]} but the butt recipe authors ${rBt}`],
    [/at the `([0-9.]+)` clamp the whole butt is inverted/,
      'the clamp the whole-butt claim is made at', (m) => sameNum(m[1], CLAMP)
        ? null : `it says ${m[1]} but the vendored shader clamps at ${CLAMP}`],
    // ---- the outputs ----------------------------------------------------
    // effB is computed from the BUILT radius; the prose radius is checked
    // separately, as the rounded display of it. Deriving effB from the prose
    // figure instead would let the cue move inside the displayed 0.1 mm and
    // leave a stale effB passing.
    [/`effB` \*\*([0-9.]+)\*\* at `R = ([0-9.]+) mm`/,
      'the butt tipward effB', (m) => {
        const shown = f(bt.rTop * 1000, 1);
        if (m[2] !== shown) {
          return `it is quoted at R = ${m[2]} mm but the butt's tipward radius `
            + `is ${f(bt.rTop * 1000, 4)} mm, which displays as ${shown}`;
        }
        const want = f(effAt(bt.rTop), 4);
        return m[1] === want ? null : `the geometry gives ${want}, not ${m[1]}`;
      }],
    [/a `geometryRoughness` of \*\*([0-9.]+)\*\* inverts the mid radius/,
      'the mid-radius inversion threshold',
      (m) => threshold(m[1], RMID, exactAt(RMID))],
    [/and \*\*([0-9.]+)\*\* inverts the wide end/,
      'the wide-end inversion threshold',
      (m) => threshold(m[1], bt.rBot, exactAt(bt.rBot))],
    // Stated end to end on purpose. A single "effB to X" here read as the
    // wide end to its author and as the mid radius to this gate on its first
    // run, which is one radius too few for a quantity the paragraph above has
    // just finished calling a range.
    [new RegExp('the whole butt is inverted \\(`effB` from ([0-9.]+) tipward '
      + 'to ([0-9.]+) at the wide end\\)'),
      'the effB range at the roughness clamp', (m) => {
        const ends = [[m[1], bt.rTop, 'tipward'], [m[2], bt.rBot, 'wide end']];
        const bad = ends
          .map(([typed, R, where]) => {
            const want = f((Number(CLAMP) ** 2) * bt.len / (2 * Math.PI * R), 2);
            return typed === want ? null : `${where} ${typed} (geometry ${want})`;
          })
          .filter(Boolean);
        return bad.length ? `the geometry disagrees at ${bad.join(', ')}` : null;
      }],
    // ---- what the across-the-taper evaluation added ---------------------
    // The census is pinned in BOTH directions. Pinning only the taper count
    // would let the paragraph's whole point — that the mid radius finds
    // fewer — go stale the moment a roughness moved, with every figure it
    // quotes still correct.
    [new RegExp('\\*\\*all (\\d+) wood segments carry an inverted region, '
      + 'where the mid-radius reading finds only (\\d+)\\*\\*'),
      'the taper-versus-mid-radius census', (m) => {
        const bad = [];
        if (Number(m[1]) !== TAPER.size || taperInv.length !== TAPER.size) {
          bad.push(`it says all ${m[1]} wood segments carry one, and the `
            + `geometry has ${TAPER.size} of which ${taperInv.length} do `
            + `(${taperInv.join(', ') || 'none'})`);
        }
        if (Number(m[2]) !== midInv.length) {
          bad.push(`it says the mid radius finds ${m[2]} and it finds `
            + `${midInv.length} (${midInv.join(', ') || 'none'})`);
        }
        return bad.length ? bad.join('; ') : null;
      }],
    [/The \*\*(\d+)\*\* butts authored at roughness `([0-9.]+)` cross over the tipward \*\*([0-9.]+)%\*\*/,
      'the extent quoted for the knife-edge butts',
      (m) => buttGroup(m[2], m[1], m[3])],
    // The one that matters most, because it is the case the mid radius gets
    // WRONG rather than merely narrow: this butt passes at its sample point.
    // So the pin holds the passing figure too — if it ever stops passing, the
    // sentence stops being the paradox it is quoted for.
    [/The \*\*(\d+)\*\* butt authored at roughness `([0-9.]+)`.{0,40}?crosses over \*\*([0-9.]+)%\*\* of its, nearly half the segment shipping backwards, while its mid radius reads `effB` \*\*([0-9.]+)\*\*/,
      "the massé butt's extent and the mid radius that passes it", (m) => {
        const bad = buttGroup(m[2], m[1], m[3]);
        if (bad) return bad;
        const [, t] = buttsAt(m[2])[0];
        if (f(t.mid, 4) !== m[4]) {
          return `its mid radius reads ${f(t.mid, 4)}, not ${m[4]}`;
        }
        return t.mid <= 1 ? null
          : `its mid radius ${f(t.mid, 4)} now exceeds 1 and no longer passes, `
            + 'so this segment is not an example of a taper the sample point '
            + 'misses — find the case that is, or drop the claim';
      }],
    // Not a figure: the two conditions three actually tests. §H4a(ii) reads
    // them out of the bundle; this holds the PARAGRAPH to naming both, so an
    // edit that shortened it to "inert" full stop breaks here rather than
    // widening the claim silently.
    [/`attributes\.tangent && \((\w+) \|\| (\w+) > 0\)`/,
      "the predicate the tangent attribute's inertness rests on", (m) => {
        const named = [m[1], m[2]];
        const want = ['normalMap', 'anisotropy'];
        return want.every((w) => named.includes(w)) ? null
          : `it names ${named.join(' and ')}, but three arms USE_TANGENT on `
            + `${want.join(' and ')} — a paragraph that names fewer conditions `
            + 'than the shader tests is claiming an inertness it has not shown';
      }],
  ];
  if (typeof rBt !== 'number' || !(frBt.t1 > 0)) {
    fail('§H4b cannot pin the MANIFEST frame figures: the butt recipe carries '
      + 'no numeric roughness, or its tangent frame is degenerate');
  } else {
    for (const [re, what, check] of claims) {
      const m = manifest.match(re);
      if (!m) {
        fail(`MANIFEST.md no longer states ${what} in the form this gate reads. `
          + 'The sentence was edited or moved and the pin lost its subject — '
          + 'which is how a pointer goes stale without any figure changing. '
          + 'Re-point this check at the new wording, do not delete it');
        continue;
      }
      const bad = check(m);
      if (bad) {
        fail(`MANIFEST.md's ${what} disagrees with the built cue: ${bad}`);
      }
    }
  }

  if (inverted > 0) {
    ok(`without an explicit tangent attribute the derivative frame does not `
      + `merely weaken this channel on ${inverted} wood segment(s) — it `
      + 'INVERTS it: the effective alphaB exceeds the alphaT ceiling of 1.0, '
      + 'so the lobe is broader along the fibres than across them for EVERY '
      + 'anisotropy value, which is the opposite of chatoyance. An explicit '
      + 'tangent attribute is therefore a precondition, not a refinement');
  } else {
    ok('the derivative frame attenuates but does not invert this channel on '
      + 'any wood segment; an explicit tangent attribute is still needed for '
      + 'the axis to mean what it says');
  }

  // ── H5. WHAT ESCAPING THE FRAME COSTS ─────────────────────────────────
  // An explicit tangent attribute is a vec4 per vertex. The vertex counts are
  // read off the BUILT geometry, both variants, because the whip variant
  // tessellates the two wood segments and is where the cost actually lands.
  const TAN_BYTES = 4 * 4;             // vec4 float32
  const whip = segGeom('standard', { whip: true });
  for (const [label, g] of [['default', GEOM.maple_played], ['whip', whip]]) {
    const rows = ['shaft', 'butt'].map((k) =>
      `${k} ${g[k].verts}v (${g[k].radial}x${g[k].heightSegs})`);
    const total = ['shaft', 'butt'].reduce((a, k) => a + g[k].verts, 0);
    say(`  tangent attribute       ${label.padEnd(8)} ${rows.join('  ')}`
      + `  ⇒ +${total * TAN_BYTES} B over the two wood segments`);
  }
  say('  material class          Standard→Physical per-fragment cost is '
    + 'UNMEASURED. app-perf.md records ≤ +1 ms as a gate THRESHOLD and its '
    + '-0.20 ms as a BUNDLED delta; the anisotropy term was never isolated, '
    + 'so it needs a quiet-host A/B (perf-aim --probe-only, interleaved).');

  // ── H6. THE HELD-CHANNEL GUARD ────────────────────────────────────────
  // cuelooks.js USES anisotropy exactly once: the sampler cap §C reads.
  // Anything else means a material anisotropy term has landed, and it cannot
  // land correctly without the tangent attribute H4 just showed is a
  // precondition — so the tool goes red and says which one is missing.
  //
  // Counted over the stripped code, not the file. The raw count could not
  // tell a landed uniform from a sentence about one, so the module's own
  // twenty-line explanation of ANISO_DEFAULT had to be written without the
  // word; H7 below is the other half, and requires that word back.
  const anisoHits = looksCode.match(/\banisotropy\w*/g) || [];
  const samplerUse = looksCode.match(/\btex\.anisotropy\s*=\s*ANISO_DEFAULT\b/g) || [];
  if (samplerUse.length !== 1) {
    fail(`cuelooks.js has ${samplerUse.length} sampler-cap assignments `
      + '(`tex.anisotropy = ANISO_DEFAULT`) where §C\'s read assumes exactly '
      + 'one — the cap either stopped reaching textures or now reaches them '
      + 'from more than one place');
  }
  if (anisoHits.length !== 1) {
    fail(`cuelooks.js uses anisotropy ${anisoHits.length} times in code `
      + `(${[...new Set(anisoHits)].join(', ')}) where the only shipped use is `
      + 'the sampler cap. If a MATERIAL anisotropy term has landed, H4 is its '
      + 'precondition: without an explicit tangent attribute the effective '
      + 'alphaB on the shaft exceeds the alphaT ceiling and the channel points '
      + 'the wrong way. Land the tangent attribute, the strength\'s provenance '
      + 'and this exemption together, or not at all');
  } else {
    ok('cuelooks.js uses anisotropy only as the texture sampler cap — no '
      + 'material anisotropy term has landed against the held strength');
  }

  // ── H7. THE OTHER HALF ────────────────────────────────────────────────
  // H6 now reads code, which means prose about the hold is free — and a
  // freedom nothing exercises is indistinguishable from the prohibition it
  // replaced. So this asks for the disclosure by name, bounded by the same
  // two anchors §C measures the sampler paragraph between. A missing anchor
  // is a failure here exactly as it is there: the span cannot be found, so
  // the absence of the words inside it proves nothing.
  const A0 = 'A derivation for it was written';
  const A1 = 'What the argument is NOT';
  const j0 = looksSrc.indexOf(A0);
  const j1 = looksSrc.indexOf(A1);
  if (j0 === -1 || j1 === -1 || j1 < j0) {
    fail(`the ANISO_DEFAULT paragraph in cuelooks.js no longer spans "${A0}" `
      + `... "${A1}". §C bounds its stray-figure guard by those two anchors `
      + 'and this section bounds its disclosure check by them, so both are '
      + 'now reading an empty span — restore the anchors or re-cut both');
  } else {
    const span = looksSrc.slice(j0, j1);
    if (!/\banisotropy\b/i.test(span)) {
      fail('the ANISO_DEFAULT paragraph explains the cap without ever naming '
        + 'anisotropy. That was not a style choice: until this round H6 '
        + 'counted the word across the whole file, so the only way to keep '
        + 'the tool green was to describe the constant without saying what it '
        + 'is. H6 reads code now. Say the word — a cap a reader cannot connect '
        + 'to `tex.anisotropy` is a cap they cannot check');
    } else {
      ok('the ANISO_DEFAULT paragraph names the term it caps, which the '
        + 'word-count form of H6 had made unwritable');
    }
  }

  const badKey = looks.MAT_KEYS.find((k) =>
    /anisotropy|normalMap|normalScale|roughnessMap/i.test(k));
  if (badKey) {
    fail(`MAT_KEYS now carries "${badKey}" — a held channel has been keyed. `
      + 'The key is the right way to ship one (it stops a value arriving at a '
      + 'constructor default nobody chose), so this is not a mistake to undo '
      + 'blindly: it means §F/§H\'s holds need lifting deliberately, with the '
      + 'measurement each names');
  }
}

// The lockstep the plan names: cuestick.js literal-mirrors the default look,
// and gate 3c of check-cue-looks.mjs proves the two build the same pixels.
// This file proves the mirror still EXISTS to be checked — a silent deletion
// would leave 3c comparing the registry against itself.
const src = fs.readFileSync(`${repoRoot}/web/scene/cuestick.js`, 'utf8');
for (const seed of [3101, 3102]) {
  if (!src.includes(String(seed))) {
    fail(`cuestick.js no longer mentions seed ${seed} — the default look's `
      + 'literal mirror is what keeps a stale cuelooks.js from shipping a '
      + 'blank cue; check-cue-looks gate 3c only compares a mirror that is there');
  }
}
ok('cuestick.js still carries the default look\'s literal mirror (both seeds)');

// ── THE MIRROR SHARES THE BAKE CACHE, WHICH IS WHAT MAKES PREWARM WORK ──
// gate 3c proves the two paths paint the same PIXELS. That is not the same
// claim as the two paths sharing one cache ENTRY, and the difference is
// exactly what prewarmCueLookMaps() turns on: it can only warm the default
// cue by calling the registry thunk, and that is only useful if the texture
// cuestick's literal path later asks for is the one the thunk already made.
// Two paths painting identical bytes into two entries would satisfy 3c and
// leave the default cue cold — the bake key carries the radii, so a ulp of
// drift between segRadiiMM(DEF_DIMS) and cuestick's rFer/rJoint arithmetic
// splits the entry while every pixel stays equal.
//
// Object identity is the only test that distinguishes those, so it is the
// test. Called before any cue is built so the first call is a genuine miss.
{
  const defShaft = looks.CUE_LOOK_DEFAULTS.materials.shaft.map;
  const defButt = looks.CUE_LOOK_DEFAULTS.materials.butt.map;
  if (typeof defShaft !== 'function' || typeof defButt !== 'function') {
    fail('the default look no longer carries thunked wood maps, so there is '
      + 'nothing for prewarmCueLookMaps() to warm and this check is blind');
  } else {
    const warm = { shaft: defShaft(), butt: defButt() };
    const { group } = cuestick.buildCue({ cueId: 'standard' });
    // Segments are positional, exactly as segGeom() reads them — buildCue
    // lays them tip → butt and the meshes carry no names to match on.
    let shared = true;
    for (const slot of ['shaft', 'butt']) {
      const got = group.children[SEG.indexOf(slot)]?.material?.map;
      if (!got) {
        shared = false;
        fail(`could not read the built default cue's ${slot} map, so the `
          + 'cache-sharing claim behind prewarm is unverified');
      } else if (got !== warm[slot]) {
        shared = false;
        fail(`the default cue's ${slot} map is a DIFFERENT texture object `
          + 'from the one the registry thunk bakes. The two paths still paint '
          + 'the same bytes (gate 3c), so nothing else in the tree can see '
          + 'this — but prewarmCueLookMaps() warms the registry entry and the '
          + 'rendered cue then bakes its own, which is the whole latency law '
          + 'silently not applying to the DEFAULT cue, the one most sessions '
          + 'equip. Compare the bake key: it carries the segment radii, so a '
          + 'ulp between segRadiiMM(DEF_DIMS) and cuestick.js\' rFer/rJoint '
          + 'arithmetic is enough to split it');
      }
    }
    // One line either way, with the red arm declaring itself rather than
    // trusting the positional counter: an ok() after a failing loop is a
    // summary contradicting its own detail (the exact defect this tool exists
    // to catch, and one I wrote twice in this round), while skipping the line
    // altogether leaves the mark for the next check to wear.
    ok(shared
      ? 'the default cue\'s built maps ARE the registry thunks\' cached '
        + 'textures (object identity, both wood slots) — so warming the default '
        + 'look warms what actually renders, which is the premise '
        + 'prewarmCueLookMaps() rests on'
      : 'the default cue\'s built maps are NOT the registry thunks\' cached '
        + 'textures — see the FAIL line(s) above; warming the default look does '
        + 'not warm what renders, so prewarmCueLookMaps() rests on a false '
        + 'premise for the default ids',
    !shared);

    // ...and having proved warming the defaults is USEFUL, prove it HAPPENS.
    // The count is derived from the registry rather than typed, so adding a
    // class or a map thunk moves both sides together and only a re-introduced
    // FILTER can split them. That is the regression this guards: the skip
    // being fixed here read `look === CUE_LOOK_DEFAULTS`, was plausible, and
    // cost the two ids most sessions return to.
    // Derived from cuelooks.MAP_PROPS, not from the literal `map`. The
    // expectation counted `map` thunks only, which made it exactly as narrow as
    // the loop it was checking: promote normalMap or roughnessMap to live and
    // both sides would agree, at a number that omitted the new channel, and the
    // texture would stay cold until the first selection that needed it. Two
    // narrow things agreeing is the shape this whole round is about — the check
    // and the thing it checks sharing one blind spot, so the check cannot see
    // it. One list, exported from the module that owns the registry.
    let expect = 0;
    for (const look of new Set(Object.values(looks.CUE_LOOKS))) {
      for (const slot of SEG) {
        for (const prop of looks.MAP_PROPS) {
          if (typeof look.materials?.[slot]?.[prop] === 'function') expect += 1;
        }
      }
    }
    // Safe to call: every thunk it schedules is a setTimeout that cannot run
    // until this script has finished and uninstall() has removed the canvas
    // shim, so each one throws instantly into prewarm's own catch. Nothing is
    // painted here; only the synchronous return value is read.
    const scheduled = looks.prewarmCueLookMaps(['standard']);
    if (scheduled !== expect) {
      fail(`prewarmCueLookMaps() schedules ${scheduled} map thunk(s) where the `
        + `registry holds ${expect} across its distinct looks. Some look is `
        + 'being filtered out of the warm-up, so its class is the one cold '
        + 'pick in a catalog that is otherwise warm — and a latency defect '
        + 'that only shows on one class reads as an unlucky measurement');
    }
    ok(scheduled === expect
      ? `prewarmCueLookMaps() covers every distinct look — ${scheduled} map `
        + 'thunk(s) scheduled, equal to the registry\'s own count, the '
        + 'defaults included'
      : `prewarmCueLookMaps() covers ${scheduled} of the registry's ${expect} `
        + 'map thunk(s) — see the FAIL line above',
    scheduled !== expect);
  }
}

uninstall();
if (failed > 0) {
  console.error(`\nderive-cue-grain: ${failed} failure(s)`);
  process.exit(1);
}
console.log('derive-cue-grain: OK');
