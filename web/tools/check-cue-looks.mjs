// Copyright (c) Meta Platforms, Inc. and affiliates.

// check-cue-looks.mjs — numeric gate for the per-cue LOOK registry
// (feature 032 S2.5, GH-525 D5; web/scene/cuelooks.js). Plain node, no
// browser. Validates EVERY registry entry against the ENVELOPE CONTAINMENT
// LAW (the no-kernel-divergence proof — cuelooks.js header) with an
// INDEPENDENT re-derivation of the law (no shared validator code paths:
// this file re-states the envelope numbers and the station math itself, so
// a bug in the registry's own lookDimsValid cannot self-certify), plus the
// provenance-honesty gate (every dim tagged Published(...) or
// Estimated(...)) and the registry-completeness gate (all 16 catalog cue
// ids covered; hidden brand aliases share their generic twins' class).
//
// MATERIAL HONESTY GATE (ADR-0016): the same provenance discipline applied
// to reflectance. Three checks per class, independent of the registry's own
// key list (restated below, on purpose):
//   - completeness: every shipped colour/roughness/metalness/map carries a
//     Published(...)/Estimated(...) tag, and the MAT_KEYS floor is shipped;
//   - drift: a class whose material VALUE differs from the default's may
//     not inherit the DEFAULT tag for that key (a tag describing played
//     maple must not ride along on a carbon-fibre value), and neither may
//     an UNCHANGED value in a slot whose material identity moved — a tag
//     explains a value on a MATERIAL, so a phenolic tip must not inherit
//     the chalked-leather reason just because both are metalness 0 (r3).
//     A `map` value is compared by the PIXELS it bakes, never by the
//     thunk's source text, which is why the bake runs before this gate (r5);
//   - orphans: no tag survives for a value the class no longer ships, and
//     no unknown material property ships without a tag key to hold it;
//   - pixels: every registry map is BAKED here through the real painter
//     chain (headless canvas shim) and pinned byte-exact, so a change in
//     any helper at any depth — rng, noiseCanvas, paintCanvas — is loud
//     even when no source this file names has moved; and a deferred bake
//     must advance the texture version when it swaps its canvas in, which is
//     NECESSARY for the GPU to receive these bytes and — as R2 proved the
//     hard way — nowhere near sufficient: the version advanced on every swap
//     while three dropped the upload against immutable 128 px storage, and
//     this gate stayed green throughout (gate 3b, r3 + r5);
//   - rendered: none of the above is what ships. buildCue is. So every
//     catalog ID is BUILT here by the real buildCue, in BOTH shipped call
//     shapes (plain and `whip: true`, which is every post-shot cue), and
//     proven equal to the ledger per segment — geometry parameters AND vertex
//     buffers and pose against the same station table the containment law
//     uses, then colour, roughness, effective metalness and map bytes. It
//     covers the fifteen ids that render through the `mat(rec, dflt)` transfer
//     nothing checked, the default one, which reads no registry entry at all,
//     and the aliases, whose id → look resolution is buildCue's own. The flex
//     hook is RUN, not allow-listed: it is a vertex hook and must stay one
//     (gate 3c, r2 + r4 + r6 + r7).
//
// EFFECTIVE, NOT LITERAL (review r1). A recipe that omits `metalness` still
// ships one — cuestick.js spreads it only when defined, so three.js
// MeshStandardMaterial's constructor default reaches the shader. The scan
// resolves the effective value and reads that default off the VENDORED
// library rather than asserting it, so a three upgrade that moved it would
// fail here instead of silently re-shading five slots on every cue.
//
//   node web/tools/check-cue-looks.mjs
import crypto from 'node:crypto';
import { ensureRealThree, repoUrl } from './render/lib/ensure-three.mjs';

ensureRealThree(); // cuelooks.js imports table.js (makeWoodMap) → three

const looks = await import(repoUrl('web/scene/cuelooks.js'));
const THREE = await import('three');

let failures = 0;
const fail = (msg) => { failures++; console.error('FAIL:', msg); };
// See the same note in tools/derive-cue-grain.mjs. The natural shape — fail()
// inside a loop, ok() after it — prints its summary unconditionally, so an
// `ok` line can appear directly beneath the failures that refute it. Since
// FAIL goes to stderr and ok to stdout, a reader watching stdout alone got a
// clean bill of health for a failing run. ok() therefore declines to claim
// success when the failure count moved since the last one it printed. Green
// output is unchanged byte for byte; only a red run reads differently.
//
// The scope is "since the last ok LINE", not "for this check". That is
// positional, and the negative probe showed both ways it can be wrong on its
// own. A check that fails and then skips its own ok() leaves the mark for the
// NEXT line to wear (a green class printed `--` because the class before it had
// failed); and a summariser that reports failures from much earlier finds the
// mark already spent, so it printed `ok: ... 1 violation(s)`. The counter is
// therefore a floor, not the whole rule: any call site that knows it is red
// says so with `red`, and every site emits exactly one line per check so the
// mark cannot leak. Where neither applies the positional default still holds,
// and it over-marks rather than under-marks — `--` claims only that failures
// happened somewhere above, never that the line's own statement is false. The
// opposite bias, a clean `ok` under a stderr failure the reader is not looking
// at, is the one that has actually bitten.
let okMark = 0;
const ok = (msg, red = false) => {
  console.log(red || failures > okMark ? '  --:' : '  ok:', msg);
  okMark = failures;
};

// ---- the shared envelope, INDEPENDENTLY restated (kernel twin
// cue_clearance.rs / cuestick.js module constants — NOT read from the
// registry's own CUE_ENVELOPE export, on purpose) ---------------------------
const ENV_LEN = 1.477;      // CUE_LEN (0.012+0.021+1.02+0.012+0.40+0.012)
const ENV_R_FER = 0.0064;   // R_FERRULE
const ENV_R_BUTT = 0.0146;  // R_BUTT
const RAIL_CLEAR = 0.002;   // solver clearance margin
const GRACE = 0.001;        // containment-law grace (RAIL_CLEAR/2)
const EPS = 1e-9;

// the 16 shipped catalog cue ids (crates/pool-core/src/catalog.rs cues())
const CATALOG_IDS = [
  'standard', 'low_deflection', 'predator_z2', 'predator_314',
  'meucci_reddot', 'break_phenolic', 'standard_dime_tip', 'masse_trick',
  'masse_trick_dwell', 'carbon_ld', 'jump_phenolic', 'snooker_ash',
  'carom_conical', 'pro_ld_pivot_141', 'pro_ld_pivot_118',
  'pro_ld_pivot_101',
];
// hidden brand alias → generic twin (must share the SAME class)
const ALIAS_TWIN = {
  predator_z2: 'pro_ld_pivot_141',
  predator_314: 'pro_ld_pivot_118',
  meucci_reddot: 'pro_ld_pivot_101',
};

const DIM_KEYS = ['TIP_LEN', 'FERRULE_LEN', 'SHAFT_LEN', 'JOINT_LEN',
  'BUTT_LEN', 'CAP_LEN', 'R_TIP', 'R_FERRULE', 'R_JOINT', 'R_BUTT'];
// the six segment lengths in SLOT ORDER (see MAT_SLOTS) — the rendered-parity
// gate reads them positionally against buildCue's child order
const LEN_KEYS = ['TIP_LEN', 'FERRULE_LEN', 'SHAFT_LEN', 'JOINT_LEN',
  'BUTT_LEN', 'CAP_LEN'];
// summed in buildCue's own order so the default look lands BIT-exactly on the
// module CUE_LEN — that equality is the predicate deciding whether a cue keeps
// the bare back-compat program cache key or gets a per-length one.
const cueLenOf = (d) => LEN_KEYS.reduce((s, k) => s + d[k], 0);
const DEFAULT_LEN = 0.012 + 0.021 + 1.02 + 0.012 + 0.40 + 0.012;
// design 277, restated: the whip build tessellates axially the two segments
// the bent mode shape passes through (shaft cantilever, butt bow tail); every
// other segment, and every non-whip build, stays at 1. Raising either is a
// visible geometry re-baseline, which is why the numbers live here too.
const WHIP_SEGS = { shaft: 16, butt: 8 };

// material ledger, INDEPENDENTLY restated (not read from the registry's own
// MAT_KEYS export, same reason as the envelope numbers above)
const MAT_SLOTS = ['tip', 'ferrule', 'shaft', 'joint', 'butt', 'cap'];
const MAT_PROPS = ['color', 'roughness', 'metalness', 'map'];
// LEDGER BOUNDARY. These four are the parameters a cue material can actually
// vary: cuestick.js's mat() reads exactly them off a recipe, and the rendered
// legacy literals set exactly them. `envMapIntensity` is deliberately NOT a
// fifth (review r2 asked): on the vendored three r170 the renderer overwrites
// that uniform with scene.environmentIntensity for any MeshStandardMaterial
// whose own envMap is null while scene.environment is set —
//   material.isMeshStandardMaterial && material.envMap === null
//     && scene.environment !== null → uniforms.envMapIntensity.value
//        = scene.environmentIntensity
// (three/index.js, r170) — and no cue material binds an envMap. The value is
// therefore inert on the cue in both states: overwritten when the scene has an
// environment, and multiplying an absent env branch when it does not. Two
// in-tree ablations measured the same thing (GH-440 web/scene/table.js:10513; GH-473 / GH-482
// web/app/main.js:434, where the floor's authored 0.55 rendered at 1.0 until an
// explicit envMap binding was added). What is live is the SCENE-level
// scene.environmentIntensity (three's default 1, never assigned in this app) —
// one number for the whole world, owned by the lighting layer, not by a
// per-cue material ledger; it is recorded as open work in finish-table §7.5.
// Should a cue material ever bind an envMap, the property stops being inert,
// and neither side can ship it silently: the registry-side orphan check has no
// key to hold it and gate 1c rejects any unledgered property in the rendered
// literals. Adding the key with a tag is then the price of the change.
//
// WHAT GATE 3c ACTUALLY COMPARES, written down so the skip below cannot drift
// from it. Gate 3c's unledgered-parameter diff skips every MAT_PROPS member
// (:1209) on the grounds that each is compared EXPLICITLY just above it. That
// was true of these four and of nothing else, and the two facts were never
// tied together — so growing MAT_PROPS, which is exactly what the recipe wall
// at :663 tells a lander to do, added a name to the SKIP list and no
// comparison behind it. Measured on this tree: bind `envMapIntensity: 2.0` in
// cuestick.js's mat() and the gate raises 168 failures; add the one token to
// MAT_PROPS and the same untagged parameter ships on every material of every
// cue with `check-cue-looks: all gates green`. A self-disarming instruction —
// the gate telling you to make the edit that blinds it.
//
// So the skip is keyed by this list, and this list is held EQUAL to MAT_PROPS
// in BOTH directions by gate 3c. Equal, not nested: a name here that is not in
// MAT_PROPS exempts a parameter no recipe can even declare, and a name in
// MAT_PROPS that is not here is the hole above. Growing the boundary now costs
// what it always claimed to cost — write the comparison, or the gate is red.
const MAT_COMPARED = ['color', 'roughness', 'metalness', 'map'];

// ...AND HELD TO THE RUN, NOT ONLY TO THE OTHER LIST. Holding the two arrays
// equal to each other is a check neither of them can fail: they are edited in
// the same place, by the same hand, in the same commit, so the symmetric edit
// — add a name to both — satisfies it while adding no comparison at all. That
// was demonstrated rather than argued: with `envMapIntensity` in both lists
// and hardcoded onto every material in cuestick.js, this gate printed "all
// gates green", said "every other value against a pristine of its own class",
// and raised the ledger tier count to 5. Nothing had compared it. The
// unledgered diff skipped it BECAUSE it was named here, which is the exemption
// this list grants; the name was the whole of the evidence for the exemption.
//
// So the exemption now has to be earned by a comparison that RAN. Each site
// witnesses the property it compares as it compares it, and a name here with
// no witness is red. A list cannot vouch for itself, and a second list cannot
// vouch for the first; only the run can.
const COMPARED_WITNESS = new Set();
const witness = (...props) => { for (const p of props) COMPARED_WITNESS.add(p); };

// THE HELD TIER. Channels the ledger already knows the shape of and no recipe
// may declare, because the number behind them does not exist yet.
// derive-cue-grain.mjs §F is the source of record for why each is held and
// what would release it — a measured relief amplitude A_h by white-light
// interferometry, confocal or stylus profilometry for the normal channel;
// micro-goniophotometry or a confocal scan across several rings for the
// roughness one. This list is the LEDGER's side of that same fact, so that
// "held" is a state this gate can name.
//
// Held is not unknown, and until now they were one failure. A recipe that
// declared `normalMap` was told MAT_PROPS "must grow here" — an instruction
// that blinds the gate, and that names one of the places the channel has to
// pass through. The tier exists so the message can be the checklist instead.
//
// Disjoint from MAT_PROPS, and the two together must account for every texture
// property TEX_SLOT_ROLE gives a role — both checked in gate 3c, where a
// fail() lands on the right mark. A property the apparatus can bake, sample
// and pin, that the ledger neither lets a recipe declare nor records as held,
// is a channel with no tier: it has neither a measurement nor a decision to do
// without one.
const MAT_PROPS_HELD = ['normalMap', 'roughnessMap'];

// AND THE PREWARM MUST KNOW THE SAME CHANNELS THIS LEDGER DOES. cuelooks.js
// enumerates the texture-bearing properties in MAP_PROPS, and its prewarm loop
// warms exactly those; this file decides which of them a recipe may declare.
// Held equal here because they were not: the prewarm read `map` alone, so a
// held channel promoted to live would have been ledgered, gated, baked, and
// then left COLD until the first selection that needed it — the one step of
// the path this round makes expressible that nothing was watching. The
// equality is asserted rather than commented, because the two lists live in
// different files and a comment is not a gate.
//
// AND IT MUST NOT BE KEYED ON THE TIER. The first version of this list read
// `['map', ...MAT_PROPS_HELD]`, which is the live channels typed out by hand
// and the held ones taken from the ledger — correct today and wrong on exactly
// the event this tier system exists for. Promoting `normalMap` means adding it
// to MAT_PROPS and removing it from MAT_PROPS_HELD, and this expression would
// then have dropped it: the gate would have DEMANDED that cuelooks.js stop
// prewarming a channel at the moment prewarming it became mandatory, and the
// failure text would have read like an instruction. A promotion is a change of
// TIER, not of channel, so the set is taken from both tiers and filtered by
// what a texture property IS.
const isMapProp = (p) => p === 'map' || /Map$/.test(p);
// Written as a FUNCTION of the two tiers, and not as an expression over the two
// constants, because the simulation below has to be able to ask it about tiers
// this tree does not have yet. An expression can only ever answer for today.
const channelSet = (live, held) => [...live, ...held].filter(isMapProp);
const MAP_PROPS_WANT = channelSet(MAT_PROPS, MAT_PROPS_HELD);
// WHICH LEDGER CHANNELS THE APPARATUS OWES A ROLE. A function, and shared with
// the assertion that uses it, for the reason round 6 learned the hard way: a
// rule restated in the test that checks it is a rule the test cannot fail on.
const roleGaps = (live, held) => channelSet(live, held).filter((p) => !(p in TEX_SLOT_ROLE));


// the completeness floor: every class merges DEF_MATERIALS, so every class
// ships at least these — metalness included in every slot, because a silent
// recipe still ships the library default (see LIB_METALNESS below). LIVE keys
// only: a held channel has no floor, by definition of being held.
const MAT_KEYS = ['tip.color', 'tip.roughness', 'tip.metalness',
  'ferrule.color', 'ferrule.roughness', 'ferrule.metalness',
  'shaft.color', 'shaft.roughness', 'shaft.metalness', 'shaft.map',
  'joint.color', 'joint.roughness', 'joint.metalness',
  'butt.color', 'butt.roughness', 'butt.metalness', 'butt.map',
  'cap.color', 'cap.roughness', 'cap.metalness'];

// the implicit value, MEASURED off the shipped library instead of asserted
const probeMat = new THREE.MeshStandardMaterial();
const LIB_METALNESS = probeMat.metalness;
probeMat.dispose();
/** A recipe as the SHADER sees it: silent metalness is still shipped metalness.
 * `map` is deliberately not defaulted — an absent map is no texture sampler,
 * not a numeric BRDF term arriving at a value nobody chose. Resolved with `??`
 * rather than a spread default: `{...{metalness: undefined}}` overwrites, and a
 * key present-but-undefined is exactly how an absent literal arrives here. */
const effective = (rec) => ({
  ...(rec ?? {}), metalness: rec?.metalness ?? LIB_METALNESS,
});

/** Source text with whitespace collapsed — formatting is not a recipe. */
const normSrc = (s) => String(s).replace(/\s+/g, ' ').trim();

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);

/** Baked fingerprint per map thunk, filled by the registry bake pass before
 * any drift comparison runs (the pass is hoisted above gate 3 for exactly
 * this reason). */
const bakedFp = new Map(); // thunk function → fingerprint string
const fpOf = (fn) => {
  const fp = bakedFp.get(fn);
  if (fp !== undefined) return fp;
  fail('a map thunk reached the drift rule that the registry bake never baked '
    + '— the two passes disagree about what the registry ships: '
    + `${normSrc(fn).slice(0, 80)}`);
  return `UNBAKED:${normSrc(fn)}`;
};
/** Value equality across the ledgered props. A `map` value is a THUNK, and
 * what it ships is pixels, not text, so maps compare by BAKED FINGERPRINT —
 * the same output-over-source rule the pins already follow, applied to the
 * drift rule (review r5). Source comparison was wrong in both directions:
 * two thunks minted by one closure factory read identically while capturing
 * different seeds (the changed map then inherits the default's provenance and
 * the drift rule never fires), and a refactor that renames a constant reads
 * differently while painting the same bytes (the rule fires on a material
 * that did not move). Neither is reachable through the DEFAULT today, because
 * gate 1b pins its two thunks by exact text — but a rule whose soundness rests
 * on another gate's literal is one deletion from being unsound, and the
 * fingerprint does not need the favour. */
const same = (a, b) => (typeof a === 'function' && typeof b === 'function'
  ? fpOf(a) === fpOf(b) : a === b);

/** Where the shim parks the bytes a painter wrote, so gate 3b can read them
 * back off the returned texture's image. A symbol, not a name: it cannot
 * collide with anything the painters set on their canvases. */
const SHIM_PIXELS = Symbol('obShimPixels');
/** Headless 2D canvas, just enough for the map painters (createImageData +
 * putImageData, no drawing ops — see gate 3b). Returns the uninstaller;
 * `document` is left exactly as it was found, present or absent, so nothing
 * later in this process can mistake the shim for a browser. */
function installCanvasShim() {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'document');
  const prev = globalThis.document;
  globalThis.document = {
    createElement(tag) {
      if (tag !== 'canvas') {
        throw new Error(`canvas shim: asked for <${tag}>, which it does not `
          + 'implement — the painter chain grew a dependency this gate must '
          + 'either support or stop pretending to run');
      }
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
  return () => {
    if (had) globalThis.document = prev; else delete globalThis.document;
  };
}

// ---- baked-texture identity, shared by gates 3b and 3c --------------------
// The registry side (3b) and the RENDERED side (3c) must be able to say
// "these are the same pixels" in one vocabulary, or the two halves can agree
// with themselves and disagree with each other.
// `channel`, `center` and `matrixAutoUpdate` are here because they are
// SHADER-LIVE, not because anything sets them (review r6): `channel` picks
// which UV attribute r170 samples with (uv, uv1, uv2 — a cue that switched
// would sample a set the geometry does not carry), and center + the
// auto-update flag are the rest of the UV transform whose other three terms
// (offset, repeat, rotation) were already pinned. A transform pinned in
// pieces is not pinned.
// The UPLOAD half is here for the same reason (review r7): the byte hash below
// reads the canvas, and the canvas is not what the GPU gets — `format`,
// `type`, `internalFormat` and `unpackAlignment` decide how those same bytes
// are unpacked into a texel, `mapping` decides how they are addressed, and a
// hand-supplied `mipmaps` array replaces every level three would generate.
// Set `tex.format = RedFormat` and the pinned bytes arrive as a red-channel
// cue with no pin, no pixel-hash change and no ledger key to answer for it.
const TEX_PROPS = ['wrapS', 'wrapT', 'colorSpace', 'anisotropy', 'flipY',
  'generateMipmaps', 'minFilter', 'magFilter', 'premultiplyAlpha',
  'channel', 'offset.x', 'offset.y', 'rotation', 'center.x', 'center.y',
  'matrixAutoUpdate', 'format', 'internalFormat', 'type', 'mapping',
  'unpackAlignment', 'mipmaps.length'];
// ONE sampler law per ROLE: every cue map is a tiling texture with mipmaps,
// unrotated and unoffset, at the house anisotropy floor, decoded according to
// what its texels MEAN. Stated once rather than copied into sixteen pins, so
// a class that quietly changes how its bytes are SAMPLED — a wrap mode, a
// colour space, a sample budget — is as loud as one that changes the bytes.
//
// Until this round it was one law for all sixteen with `colorSpace=srgb`
// welded into it, matching the weld in cuelooks.js's toTexture(). The two
// welds held each other up: the module could not paint a texture this gate
// would accept unless it was sRGB, and this gate could not accept one the
// module could not paint. That is fine while every cue map is an albedo map,
// which today every one of them is — and it is why a map whose texels are
// MEASUREMENTS was not merely unimplemented but unexpressible. An RGBA /
// UNSIGNED_BYTE texture tagged sRGB is uploaded as SRGB8_ALPHA8 and decoded
// by the sampler in hardware, for every material property it is bound to; a
// number field arrives at the shader bent by a transfer nobody authored, and
// no pixel pin here can see it, because the CANVAS BYTES are unchanged. The
// role is the only place that fact can live.
//
// Two directions, both live. `colorSpace=srgb` on an albedo map is still
// mandatory — dropping it is red, as it always was. `colorSpace=srgb` on a
// data map is now red too, which is the half that did not exist.
//
// A per-segment DERIVED budget (L/(2*pi*R), the texel-density ratio the wrap
// imposes) was written against this gate in R2 and cut before merge: it moved
// the pictures by at most 1/255 at both framings the round photographs, and
// the view where it would bind is one the atelier rig cannot pose. R3 then
// re-derived the demand and held it again for exactly that reason, so the
// framing that would settle it is still unposed. Until one exists the floor
// is shared by all sixteen and a class that raises it has to say so here.
const ANISO_FLOOR = 8; // the house value in balls.js / room.js / table.js
// The role table, restated here rather than imported from cuelooks.js for the
// same reason the envelope numbers and MAT_KEYS are restated — a gate that
// reads its expectation out of the thing it checks agrees with it by
// construction. Gate 3b holds the two EQUAL in BOTH directions: a role here
// that the module cannot paint checks nothing, and a role the module can
// paint that is missing here is a texture arriving under no law at all.
const TEX_ROLE = {
  albedo: THREE.SRGBColorSpace,   // a colour, painted in the space it is shown
  data: THREE.NoColorSpace,       // a per-texel number the sampler must not bend
};
// ...and which material texture property carries which role. This is the
// gate's own statement of what a slot MEANS, and it may name properties the
// registry has no business naming yet: derive-cue-grain.mjs §F holds the
// channels behind two of these three, and sweeps cuelooks.js — not this file
// — for their names. Listing them here costs nothing and buys the thing that
// was missing: a data map that lands is baked, sampled and pinned by the same
// machinery as an albedo map on its first commit, instead of being invisible
// to this gate until someone remembers to widen it.
const TEX_SLOT_ROLE = {
  map: 'albedo',
  normalMap: 'data',
  roughnessMap: 'data',
};
const SAMPLER = (role) => 'wrapS=1000 wrapT=1000 '
  + `colorSpace=${TEX_ROLE[role]} `
  + `anisotropy=${ANISO_FLOOR} `
  + 'flipY=true generateMipmaps=true minFilter=1008 magFilter=1006 '
  + 'premultiplyAlpha=false channel=0 offset.x=0 offset.y=0 rotation=0 '
  + 'center.x=0 center.y=0 matrixAutoUpdate=true format=1023 '
  + 'internalFormat=null type=1009 mapping=300 unpackAlignment=4 '
  + 'mipmaps.length=0';
// The per-map pins: painted bytes, canvas size, tiling. Re-generate with
// `--pins` after an INTENDED repaint and say so in the PR — every line here
// is a visible re-baseline of a shipped cue.
//
// KEYED `<class>.<slot>.<property>`. Until this round the key was
// `<class>.<slot>`, which is exact only while at most one texture property is
// populated per slot. That is true today, and it is why the commit that taught
// the bake pass to walk TEX_SLOT_ROLE left the key alone under a declared
// bound. The bound was right about the cost and wrong about who pays it:
// under a two-part key a slot with two textures cannot be pinned AT ALL, so
// the price of the first data map included re-writing this whole table — in
// the same commit as the channel, beside sixteen numbers no reviewer can check
// by eye. It is paid here instead, with nothing else moving: every hash, size
// and repeat below is character-identical to the two-part table, each key
// suffixed `.map` and nothing else touched (proof: `--pins` at 25503668 vs
// here, journal R4 P4). A re-key that moves no bytes is reviewable. A re-key
// buried in a repaint is not, and would arrive on the one commit that also
// asks for the benefit of the doubt.
const WANT_PIXELS = {
  'maple_played.shaft.map': 'eaf92a06a9f1492c 1024x1024 repeat=1,1',
  'maple_played.butt.map': '65f8aa7556a7e64f 1024x1024 repeat=1,1',
  'maple_ld.shaft.map': 'c9e971df3b9b1b7d 1024x1024 repeat=1,1',
  'maple_ld.butt.map': '65f8aa7556a7e64f 1024x1024 repeat=1,1',
  'carbon_ld.shaft.map': 'e23f8ee7877e315a 256x256 repeat=1,1',
  'carbon_ld.butt.map': 'e2560613f34c31aa 256x256 repeat=1,1',
  'break_phenolic.shaft.map': '3a6c9b3e180c0ff5 1024x1024 repeat=1,1',
  'break_phenolic.butt.map': 'ab890117ebe88974 512x512 repeat=1.1,1.1',
  'jump_short.shaft.map': '10adc10fe28c98ed 1024x1024 repeat=1,1',
  'jump_short.butt.map': '885de2b6757ff8ae 1024x1024 repeat=1,1',
  'snooker_ash.shaft.map': '8cdca97a5e9abd24 1024x1024 repeat=1,1',
  'snooker_ash.butt.map': 'e095f52b13dea645 512x512 repeat=1,1',
  'carom_conical.shaft.map': 'c4347e6782576902 1024x1024 repeat=1,1',
  'carom_conical.butt.map': 'd1fd9d796709de6e 1024x1024 repeat=1,1',
  'masse_soft.shaft.map': '85af181043e24970 1024x1024 repeat=1,1',
  'masse_soft.butt.map': 'f32e64a05504fa94 1024x1024 repeat=1,1',
};
const deepGet = (o, p) => p.split('.').reduce((v, k) => v?.[k], o);
const samplerOf = (tex) => TEX_PROPS.map((p) => `${p}=${deepGet(tex, p)}`)
  .join(' ');
const fingerprint = (tex) => {
  const cv = tex?.image;
  const img = cv?.[SHIM_PIXELS];
  if (!img) return 'NO-PIXELS (the painter returned no canvas bytes)';
  const buf = Buffer.from(img.data.buffer, img.data.byteOffset,
    img.data.byteLength);
  return `${sha(buf)} ${cv.width}x${cv.height} `
    + `repeat=${tex.repeat.x},${tex.repeat.y}`;
};
/** Byte identity of a BUILT geometry: attribute set, buffers, index, morph
 * targets, material groups and draw range. `CylinderGeometry.parameters`
 * records what the constructor was asked for and is never touched again, so a
 * `geometry.scale()`, a `translate()` or a hand-edited position buffer leaves
 * it saying exactly what a gate wants to hear while the rendered rod moves out
 * of the envelope (review r7). This reads the arrays the GPU is handed. */
const geoFp = (g) => {
  const bytes = (a) => sha(Buffer.from(a.array.buffer, a.array.byteOffset,
    a.array.byteLength));
  const parts = [];
  for (const name of Object.keys(g.attributes).sort()) {
    const a = g.attributes[name];
    parts.push(`${name}:${a.itemSize}x${a.count}:${a.normalized}`
      + `:${a.array.constructor.name}:${bytes(a)}`);
  }
  parts.push(`index:${g.index ? `${g.index.count}:${bytes(g.index)}` : 'none'}`);
  parts.push(`morph:${Object.keys(g.morphAttributes).sort().join('+') || 'none'}`);
  parts.push(`groups:${JSON.stringify(g.groups)}`);
  parts.push(`draw:${g.drawRange.start},${g.drawRange.count}`);
  return parts.join(' ');
};

/** Run the cooperative row-band queue to quiescence and return the macrotask
 * count. Bounded: a painter that never settles is a bug to report, not to
 * hang on. `where` names the caller in that report. */
async function drainMapBakes(where) {
  let spins = 0;
  while (looks.pendingMapBakes?.() > 0 && spins < 4000) {
    await new Promise((r) => { setTimeout(r, 0); });
    spins += 1;
  }
  if (looks.pendingMapBakes?.() > 0) {
    fail(`map bakes never settled after ${spins} macrotasks (${where}) — a `
      + 'progressive painter is not terminating; every fingerprint taken here '
      + 'would be a 128 px preview no player sees');
  }
  return spins;
}

// TAG FORM. A prefix test accepted `Estimated(`, `Estimated()` and anything
// trailing the close paren — CI could then report a complete ledger over tags
// carrying no source and no reason (review r2). The whole string must be the
// tag, and the reason inside it must be long enough to be one. 12 chars is
// not a quality bar; it is a floor under the empty gesture.
const TAG_MIN = 12;
const TAG_RE = /^(Published|Estimated)\(([\s\S]+)\)$/;
/** '' when the tag is well formed, else why it is not. */
function tagFault(tag) {
  if (typeof tag !== 'string') return `not a string (${typeof tag})`;
  const hit = TAG_RE.exec(tag);
  if (!hit) {
    return 'must be exactly Published(<source>) or Estimated(<reason>), '
      + `nothing before or after: ${JSON.stringify(tag.slice(0, 60))}`;
  }
  const reason = hit[2].trim();
  if (reason.length < TAG_MIN) {
    return `${hit[1]}(...) carries only ${reason.length} chars of `
      + `${hit[1] === 'Published' ? 'source' : 'reason'} — under the ${TAG_MIN} `
      + `floor: ${JSON.stringify(reason)}`;
  }
  return '';
}

/** Independent station table of the buildCue segment stack. */
function stations(d) {
  const s1 = d.TIP_LEN, s2 = s1 + d.FERRULE_LEN, s3 = s2 + d.SHAFT_LEN;
  const s4 = s3 + d.JOINT_LEN, s5 = s4 + d.BUTT_LEN, s6 = s5 + d.CAP_LEN;
  return [
    ['tip face', 0, d.R_TIP * 0.94],
    ['tip end', s1, d.R_TIP],
    ['ferrule end', s2, d.R_FERRULE],
    ['shaft end', s3, d.R_JOINT],
    ['joint collar', s4, d.R_JOINT + 0.0004],
    ['butt max', s5, d.R_BUTT],
    ['bumper', s6, d.R_BUTT * 0.92],
  ];
}
const envAbs = (s) => ENV_R_FER + (ENV_R_BUTT - ENV_R_FER) * (s / ENV_LEN);
const envNorm = (u) => ENV_R_FER + (ENV_R_BUTT - ENV_R_FER) * u;
const mm = (v) => (v * 1000).toFixed(3);

if (typeof looks.cueLookFor !== 'function' || !looks.CUE_LOOKS
  || !looks.CUE_LOOK_DEFAULTS) {
  fail('cuelooks.js missing exports (cueLookFor / CUE_LOOKS / CUE_LOOK_DEFAULTS)');
  process.exit(1);
}

// ---- gate 0: registry completeness + alias-class sharing ------------------
for (const id of CATALOG_IDS) {
  if (!looks.CUE_LOOKS[id]) fail(`catalog id '${id}' missing from CUE_LOOKS`);
}
for (const [alias, twin] of Object.entries(ALIAS_TWIN)) {
  if (looks.CUE_LOOKS[alias] !== looks.CUE_LOOKS[twin]) {
    fail(`hidden alias '${alias}' must share its twin '${twin}' look object`);
  }
}
if (looks.CUE_LOOKS.standard !== looks.CUE_LOOK_DEFAULTS) {
  fail(`'standard' must map to the CUE_LOOK_DEFAULTS identity (byte-compat law)`);
}
ok(`registry covers all ${CATALOG_IDS.length} catalog ids; aliases share twins; 'standard' = defaults identity`);

// The prewarm's channel set and this ledger's channel set are ONE list.
if (!Array.isArray(looks.MAP_PROPS)) {
  fail('cuelooks.js exports no MAP_PROPS — the prewarm loop is then enumerating '
    + 'texture properties from a literal, and a channel promoted here is warmed '
    + 'by nothing');
} else if (MAP_PROPS_WANT.some((p) => !looks.MAP_PROPS.includes(p))
        || looks.MAP_PROPS.some((p) => !MAP_PROPS_WANT.includes(p))) {
  // Compared as SETS. Prewarm order is not a contract — warming three maps in
  // a different sequence warms the same three maps — and comparing the joined
  // strings would have red on the day someone inserted a promoted channel into
  // MAT_PROPS anywhere but the end. A gate that fails on a correct edit teaches
  // people to route around it, which costs more than the check is worth.
  fail(`cuelooks.MAP_PROPS is [${looks.MAP_PROPS.join(', ')}] and this ledger's `
    + `channels are [${MAP_PROPS_WANT.join(', ')}]. Whichever is shorter is a `
    + 'channel that is baked, gated and ledgered on one side and invisible on '
    + 'the other: a property missing from MAP_PROPS is never prewarmed and goes '
    + 'cold into the first selection that needs it; one missing from the ledger '
    + 'is prewarmed but has neither a measurement nor a decision to do without '
    + 'one. Add it to both.');
} else {
  ok(`prewarm and ledger name the same ${MAP_PROPS_WANT.length} texture `
    + `channel(s): ${MAP_PROPS_WANT.join(', ')} — held equal across two files, `
    + 'so promoting a held channel cannot leave the prewarm behind');
}

// AND THE PROMOTION IS SIMULATED, NOT REASONED ABOUT. The sentence above says
// promoting a held channel cannot leave the prewarm behind, and a sentence is
// not a gate — the version before this one said the same thing and did the
// opposite. So the move is performed here, once per held channel, and the
// channel set must come out the same on both sides of it. This is the only
// check in this file that tests a state the tree is not in, which is the point:
// a promotion happens once, in someone else's diff, and this is what tells them
// the prewarm is already accounted for.
for (const held of MAT_PROPS_HELD) {
  const simulated = channelSet([...MAT_PROPS, held], MAT_PROPS_HELD.filter((p) => p !== held));
  const same = simulated.length === MAP_PROPS_WANT.length
    && MAP_PROPS_WANT.every((p) => simulated.includes(p));
  if (!same) {
    fail(`promoting '${held}' from held to live would change this ledger's channel set from `
      + `[${MAP_PROPS_WANT.join(', ')}] to [${simulated.join(', ')}], so the gate above would `
      + `demand that cuelooks.js STOP prewarming '${held}' on the day prewarming it became `
      + 'mandatory. The channel set must be keyed on what a texture property is, not on which '
      + 'tier it currently sits in');
  }
}
ok(`the channel set survives promoting any of the ${MAT_PROPS_HELD.length} held channel(s): `
  + 'simulated, not asserted in a comment');

// ---- gate 1: default-look anchors (today's shipped dims, bit-exact) -------
{
  const d = looks.CUE_LOOK_DEFAULTS.dims;
  const want = { TIP_LEN: 0.012, FERRULE_LEN: 0.021, SHAFT_LEN: 1.02,
    JOINT_LEN: 0.012, BUTT_LEN: 0.40, CAP_LEN: 0.012, R_TIP: 0.00625,
    R_FERRULE: 0.0064, R_JOINT: 0.0108, R_BUTT: 0.0146 };
  for (const k of DIM_KEYS) {
    if (d[k] !== want[k]) fail(`defaults.${k} = ${d[k]}, want ${want[k]}`);
  }
  const len = d.TIP_LEN + d.FERRULE_LEN + d.SHAFT_LEN + d.JOINT_LEN
    + d.BUTT_LEN + d.CAP_LEN;
  const envLenLocal = 0.012 + 0.021 + 1.02 + 0.012 + 0.40 + 0.012;
  if (len !== envLenLocal) fail(`default length ${len} != CUE_LEN sum`);
  ok('defaults are bit-exactly the shipped cuestick.js dims');
}

// ---- gate 1b: default MATERIAL anchors (today's shipped maple, bit-exact)
// A change here moves pixels on the most-seen cue in the game, so it must be
// an explicit re-baseline in this file, never a silent edit in the registry.
{
  const m = looks.CUE_LOOK_DEFAULTS.materials;
  const want = {
    'tip.color': 0x4d7fb5, 'tip.roughness': 0.95,
    'ferrule.color': 0xf2ede2, 'ferrule.roughness': 0.5,
    'shaft.color': 0xe3d2a8, 'shaft.roughness': 0.32,
    'joint.color': 0xc8a84e, 'joint.roughness': 0.25, 'joint.metalness': 0.85,
    'butt.color': 0x46281e, 'butt.roughness': 0.42,
    'cap.color': 0x181410, 'cap.roughness': 0.8,
  };
  for (const [k, v] of Object.entries(want)) {
    const [slot, prop] = k.split('.');
    const got = m?.[slot]?.[prop];
    if (got !== v) {
      fail(`defaults.materials.${k} = ${got}, want ${v} — a change here is a `
        + 'visible re-baseline and must be made explicitly in this gate');
    }
  }
  // EFFECTIVE metalness, including the five slots whose recipe is silent.
  if (LIB_METALNESS !== 0) {
    fail(`vendored three.js MeshStandardMaterial default metalness is `
      + `${LIB_METALNESS}, not 0 — every silent slot on every cue just changed `
      + 'shading; re-baseline this gate and the IMPLICIT ledger tags together');
  }
  const wantMetal = { tip: 0, ferrule: 0, shaft: 0, joint: 0.85, butt: 0, cap: 0 };
  for (const [slot, v] of Object.entries(wantMetal)) {
    const got = effective(m?.[slot]).metalness;
    if (got !== v) {
      fail(`defaults.materials.${slot} effective metalness = ${got}, want ${v}`);
    }
  }
  // ...and no NEW default reflectance channel may appear without passing
  // through this gate: an unlisted property would otherwise ship pinned by
  // nothing (review r1).
  const wantProps = {
    tip: 'color,roughness', ferrule: 'color,roughness',
    shaft: 'color,map,roughness', joint: 'color,metalness,roughness',
    butt: 'color,map,roughness', cap: 'color,roughness',
  };
  for (const [slot, props] of Object.entries(wantProps)) {
    const got = Object.keys(m?.[slot] ?? {}).sort().join(',');
    if (got !== props) {
      fail(`defaults.materials.${slot} property set is '${got}', want `
        + `'${props}' — adding or dropping a default reflectance channel is a `
        + 'visible re-baseline');
    }
  }
  // MAP RECIPES. `typeof === 'function'` proved only that something would be
  // called (review r1). What decides those pixels is the thunk's ARGUMENTS —
  // seed and base RGB — so the thunk is pinned by its own source text here,
  // which is the check that fails in the ledger's own vocabulary ("seed 3101,
  // base 216/186/140") when someone edits a number in this file.
  // The painter BODIES are no longer pinned by source: gate 3b bakes every
  // registry map through the real chain and pins the bytes (review r3).
  // S3 R2 re-baseline: both default wood slots left cachedWoodMap for the
  // derived ring-grain painter. The arguments that decide the pixels are now
  // the seed, the base RGB, the shared WOOD_RING pack and the class's OWN
  // segment radii — all four are in the pinned text, so swapping DEF_DIMS for
  // another class's dims, or inlining a different option set, fails here.
  const wantThunk = {
    shaft: '() => makeRingGrainMap(3101, 216, 186, 140, '
      + '{ ...WOOD_RING, ...segRadiiMM(DEF_DIMS).shaft })',
    butt: '() => makeRingGrainMap(3102, 66, 38, 30, '
      + '{ ...WOOD_RING, ...segRadiiMM(DEF_DIMS).butt })',
  };
  for (const [slot, src] of Object.entries(wantThunk)) {
    if (typeof m?.[slot]?.map !== 'function') {
      fail(`defaults.materials.${slot}.map must stay a lazy painter thunk `
        + '(eager baking would breach the 300 ms float-latency law)');
      continue;
    }
    const got = normSrc(m[slot].map);
    if (got !== src) {
      fail(`defaults.materials.${slot}.map recipe is '${got}', want '${src}' — `
        + 'the seed and base RGB decide the grain, so a change here is a '
        + 'visible re-baseline');
    }
  }
  ok('default material recipe is bit-exactly the shipped maple_played look '
    + '(effective metalness included; map pixels pinned in gate 3b)');
}

// (the mirror-parity check that used to sit here now runs against the real
// built objects, for every identity rather than only the default — gate 3c.)

// ---- gate 2: fail-closed accessor ------------------------------------------
for (const bad of [undefined, null, 42, 'no_such_cue', '']) {
  if (looks.cueLookFor(bad) !== looks.CUE_LOOK_DEFAULTS) {
    fail(`cueLookFor(${JSON.stringify(bad)}) must return the defaults identity`);
  }
}
ok('cueLookFor fails closed to the defaults identity on unknown/absent ids');

// ---- the class set, and the bake that every gate below reads --------------
// One representative id per look object (aliases and twins collapse), built
// once so gates 3, 3b and 3c cannot iterate different sets.
const seen = new Map(); // look object → representative id
for (const [id, entry] of Object.entries(looks.CUE_LOOKS)) {
  if (!seen.has(entry)) seen.set(entry, id);
}

// The bake runs HERE, before gate 3, because the drift rule needs its output:
// `same()` compares map thunks by the pixels they paint, and pixels do not
// exist until something calls the thunk. Gate 3b, below, holds the pins over
// the same bake — one bake, two readers, no chance of the drift rule and the
// pin gate disagreeing about what a class paints.
//
// It walks every property in TEX_SLOT_ROLE, not the `.map` this loop used to
// name literally. Two of the three are absent from every recipe in the tree,
// so the walk is inert today and every figure below is unchanged by it — but
// a texture bound to a property this loop does not name is not merely
// unpinned, it never reaches `bakedFp`, and `fpOf()` fails the moment the
// drift rule asks about it. The literal `.map` made the bake pass a fourth
// wall between the registry and a second texture, and an accidental one: it
// was written when there was one property and nothing said so.
//
// The pin key carries the PROPERTY, `class.slot.prop` (WANT_PIXELS above).
// The previous commit walked TEX_SLOT_ROLE here but kept the two-part key
// under a declared bound, on the grounds that no slot ships two textures yet.
// That is true and it is not the question: under a two-part key the first slot
// that does cannot be pinned at all, so the bound quietly deferred a re-write
// of the whole pin table onto the commit that lands a channel. Three parts
// now, while the table can be shown to be unchanged.
const bakes = []; // [key, class, slot, prop, texture, thunk, entry]
let bakeSpins = 0;
{
  const shimmed = installCanvasShim();
  try {
    const pre = []; // [key, texture, image-as-returned, version-as-returned]
    for (const entry of seen.keys()) {
      for (const slot of MAT_SLOTS) {
        for (const prop of Object.keys(TEX_SLOT_ROLE)) {
          const thunk = entry.materials?.[slot]?.[prop];
          if (typeof thunk !== 'function') continue;
          const tex = thunk();
          const key = `${entry.class}.${slot}.${prop}`;
          pre.push([key, tex, tex.image, tex.version]);
          bakes.push([key, entry.class, slot, prop, tex, thunk, entry]);
        }
      }
    }
    bakeSpins = await drainMapBakes('registry bake');
    // DEFERRED UPLOAD (review r5). progressiveMap hands back a 128 px preview
    // and swaps the full-resolution canvas in later — `tex.image = cv` and
    // `tex.needsUpdate = true`, one image swap and one GPU re-upload. Every
    // fingerprint below reads tex.image, which the swap updates by itself, so
    // deleting the needsUpdate that goes with it leaves this gate hashing
    // full-resolution bytes and reporting green while every PLAYER keeps the
    // preview on screen forever, three never having been told the texture is
    // dirty. A pixel pin cannot see that. This can: an image swap that does
    // not advance the texture version is the bug, stated as an invariant.
    for (const [key, tex, img0, ver0] of pre) {
      if (tex.image === img0) continue; // synchronous painter — no swap, no upload
      if (!(tex.version > ver0)) {
        fail(`[${key}] the full-resolution bake swapped its canvas in without `
          + `advancing the texture version (${ver0} → ${tex.version}) — three `
          + 'uploads a CanvasTexture only when needsUpdate marks it dirty, so '
          + 'the shipped cue would keep the 128 px preview while this gate '
          + 'hashed bytes the GPU never receives');
      }
    }
    for (const [, , , , tex, thunk] of bakes) bakedFp.set(thunk, fingerprint(tex));
  } finally {
    shimmed();
  }
}

// ---- gate 3: per-entry containment + provenance ---------------------------
// Class-own Published tags on inherited reflectance values whose slot ships a
// different substance — the one exemption the material tier-promotion rule
// below grants. Collected so the count is printed rather than left implicit.
const promoExempt = [];
// ...and the violations, counted for the same reason but a sharper one: the
// summary ok() below asserts that no class promotes an inherited value, and an
// unconditional ok() would print that sentence directly underneath a FAIL
// saying one just did. Caught by the negative probe that landed this rule.
const promoFaults = [];
for (const [entry, id] of seen) {
  const cls = entry.class;
  const d = entry.dims;
  let entryOk = true;
  for (const k of DIM_KEYS) {
    if (!Number.isFinite(d?.[k]) || d[k] <= 0) {
      fail(`[${cls}] dim ${k} not a positive finite number: ${d?.[k]}`);
      entryOk = false;
    }
    const tag = entry.provenance?.[k];
    const dimFault = tagFault(tag);
    if (dimFault) {
      fail(`[${cls}] dim ${k} provenance ${dimFault}`);
      entryOk = false;
    }
    // INHERITED VALUE, INHERITED CEILING (review r10). A class may restate a
    // tag for a dim it does not override — carbon_ld has a class-specific
    // reason for shipping the default ferrule length (it renders the segment
    // as CF shaft continuation, the class being ferrule-LESS) and saying so
    // is worth a line. What it may not do is PROMOTE the number: the value
    // is the default's value, so if the source of record could not publish
    // it there, no class-specific fact publishes it here. carbon_ld cited
    // "CF class is ferrule-less — GH-283 digest", a published fact that the
    // part does not exist, as the source for 21 mm of it.
    const defTag = looks.CUE_LOOK_DEFAULTS.provenance?.[k];
    if (entry !== looks.CUE_LOOK_DEFAULTS
      && d?.[k] === looks.CUE_LOOK_DEFAULTS.dims?.[k]
      && tag !== defTag && /^Published\(/.test(tag ?? '')
      && !/^Published\(/.test(defTag ?? '')) {
      fail(`[${cls}] dim ${k} inherits the default value (${d[k]}) and `
        + 'promotes it to Published while the default itself is Estimated — '
        + 'a class-specific reason may restate an inherited number, never '
        + `source it\n         default: ${defTag}\n         class:   ${tag}`);
      entryOk = false;
    }
  }

  // ---- the material honesty ledger (ADR-0016) -----------------------------
  const mats = entry.materials;
  const mprov = entry.materialProvenance;
  const defMats = looks.CUE_LOOK_DEFAULTS.materials;
  const defMprov = looks.CUE_LOOK_DEFAULTS.materialProvenance;
  if (!mprov || typeof mprov !== 'object') {
    fail(`[${cls}] materialProvenance missing — every look must carry the `
      + 'reflectance ledger, not just the dims ledger');
    entryOk = false;
  }
  const shipped = new Set();
  for (const slot of MAT_SLOTS) {
    const rec = mats?.[slot];
    if (!rec || typeof rec !== 'object') {
      fail(`[${cls}] material slot '${slot}' missing (six-segment law)`);
      entryOk = false;
      continue;
    }
    for (const prop of Object.keys(rec)) {
      if (MAT_PROPS.includes(prop)) continue;
      if (MAT_PROPS_HELD.includes(prop)) {
        // The checklist, in the place a lander reads it, and deliberately
        // NOT summarised as a count: a number here is the exact thing this
        // round keeps finding — typed once, correct on the day, left standing
        // while the list under it grew.
        fail(`[${cls}] material ${slot}.${prop} is a HELD channel, not an `
          + 'unknown one. The ledger knows its shape; what is missing is the '
          + 'measurement, and derive-cue-grain.mjs §F names which one. '
          + 'Releasing it takes, in this order: the measurement itself; a '
          + 'ledger key and tag; MAT_PROPS; MAT_COMPARED and the explicit '
          + 'comparison in gate 3c that it exempts; cuestick.js mat(), which '
          + 'copies recipe properties BY NAME, so a channel it does not spell '
          + 'is painted, pinned, tagged and never bound; gate 1b\'s per-slot '
          + 'property set if it lands on the default look; and a WANT_PIXELS '
          + 'row. Editing MAT_PROPS alone only silences this line');
        entryOk = false;
        continue;
      }
      fail(`[${cls}] material ${slot}.${prop} is a property the ledger knows `
        + 'in no tier — MAT_PROPS does not let a recipe declare it and '
        + 'MAT_PROPS_HELD does not record it as held. If it is a real '
        + 'reflectance channel, decide the tier first: held costs one line, '
        + 'live costs the whole list above');
      entryOk = false;
    }
    // the recipe as the SHADER sees it — a silent metalness still ships
    const eff = effective(rec);
    const defEff = effective(defMats?.[slot]);
    // SLOT IDENTITY (review r3). A tag explains a value ON A MATERIAL, so the
    // drift rule cannot key on the number alone: break_phenolic's tip is
    // phenolic, its metalness is implicitly 0.0 exactly as the default's is,
    // and inheriting the default tag has CI certify that a phenolic tip is
    // chalked leather. If ANY ledgered value in the slot moved, the slot
    // ships a different material and every tag in it must be the class's own.
    const slotChanged = MAT_PROPS.some((p) => same(eff[p], defEff[p]) === false);
    for (const prop of MAT_PROPS) {
      if (!(prop in eff)) continue;
      const key = `${slot}.${prop}`;
      shipped.add(key);
      const tag = mprov?.[key];
      const matFault = tagFault(tag);
      if (matFault) {
        fail(`[${cls}] material ${key} provenance ${matFault}`);
        entryOk = false;
        continue;
      }
      // drift rule: a CHANGED value may not inherit the default's tag
      if (tag === defMprov?.[key] && !same(eff[prop], defEff[prop])) {
        fail(`[${cls}] material ${key} differs from the maple_played value `
          + `(${eff[prop]} vs ${defEff[prop]}) but inherits the `
          + 'DEFAULT provenance tag — that tag describes the default value, '
          + 'not this one');
        entryOk = false;
      } else if (tag === defMprov?.[key] && slotChanged) {
        // ...and neither may an UNCHANGED value in a slot whose material
        // identity changed: same number, different substance, so the
        // default's reason is about something else
        fail(`[${cls}] material ${key} equals the maple_played value `
          + `(${eff[prop]}) but the '${slot}' slot ships a DIFFERENT material `
          + `(${MAT_PROPS.filter((p) => !same(eff[p], defEff[p])).join(', ')} `
          + 'moved), so the default tag explains the wrong substance — write '
          + "this class's own tag, even if it says the value is conventional");
        entryOk = false;
      }
      // INHERITED VALUE, INHERITED CEILING — the material half of the rule the
      // dims loop has carried since review r10 (above). Both drift rules on
      // this key fire only when the class INHERITS the default tag; neither
      // looks at the case where the class wrote its OWN tag for a value it did
      // not change. That is the direction a tier gets promoted: same substance,
      // same number, a class-specific sentence, and a tier the default itself
      // could not reach. If the source of record could not publish this number
      // for maple_played, no fact about another class publishes it here — it is
      // the same number describing the same material.
      //
      // Scoped to an UNCHANGED slot on purpose, and the exemption is real
      // rather than a convenience. Where the slot ships a different substance
      // the rule above already REQUIRES a class-own tag, and such a tag may
      // legitimately be Published even at an unchanged number: 0.0 metalness
      // is publishable for a phenolic tip from the metal/rough workflow
      // whatever the default's chalked-leather reason was. Same number,
      // genuinely different claim. So those are counted and printed rather
      // than checked, because a silent exemption reads as a covered case.
      if (entry !== looks.CUE_LOOK_DEFAULTS
        && tag !== defMprov?.[key]
        && same(eff[prop], defEff[prop])
        && /^Published\(/.test(tag ?? '')
        && !/^Published\(/.test(defMprov?.[key] ?? '')) {
        if (slotChanged) {
          promoExempt.push(`${cls}.${key}`);
        } else {
          fail(`[${cls}] material ${key} inherits the maple_played value `
            + `(${eff[prop]}) in an unchanged '${slot}' slot and promotes it `
            + 'to Published while the default itself is Estimated — a '
            + 'class-specific reason may restate an inherited reflectance '
            + `value, never source it\n         default: ${defMprov?.[key]}`
            + `\n         class:   ${tag}`);
          promoFaults.push(`${cls}.${key}`);
          entryOk = false;
        }
      }
    }
  }
  for (const k of MAT_KEYS) {
    if (!shipped.has(k)) {
      fail(`[${cls}] material completeness floor: ${k} not shipped (every `
        + 'class merges DEF_MATERIALS, so a missing key means the merge broke)');
      entryOk = false;
    }
  }
  for (const k of Object.keys(mprov ?? {})) {
    if (shipped.has(k)) continue;
    // A tag for a HELD channel is not the same defect as a stale tag, and the
    // generic message below reads as a cleanup. This one is a ledger carrying
    // a reason for a value that does not exist — the honesty ledger certifying
    // a channel into a build it is not in, which is the failure mode the whole
    // tier is there to prevent.
    const held = MAT_PROPS_HELD.find((p) => k.endsWith(`.${p}`));
    if (held) {
      fail(`[${cls}] provenance tag '${k}' tags a HELD channel: the ledger `
        + `gives a reason for a '${held}' this cue does not ship and cannot `
        + 'declare. Write the tag in the commit that lands the measurement, '
        + 'not ahead of it');
      entryOk = false;
      continue;
    }
    fail(`[${cls}] orphan provenance tag '${k}' — no shipped value answers `
      + 'to it; stale honesty is worse than none');
    entryOk = false;
  }

  if (!entryOk) {
    // One line per entry, always. Dropping the line silently left this entry's
    // failure on the mark for the NEXT entry to wear, so a class that passed
    // every gate printed `--` because the one before it had not.
    ok(`[${cls}] (rep id '${id}') ledger gates failed — geometry section not `
      + 'reached for this entry; see the FAIL lines above', true);
    continue;
  }
  const st = stations(d);
  const len = st[st.length - 1][1];
  if (len > ENV_LEN + EPS) {
    fail(`[${cls}] total length ${len} exceeds envelope ${ENV_LEN}`);
  }
  let worstAbs = -Infinity, worstAt = '';
  for (const [name, s, r] of st) {
    if (r > ENV_R_BUTT + EPS) {
      fail(`[${cls}] ${name}: radius ${mm(r)} mm exceeds envelope butt ceiling ${mm(ENV_R_BUTT)} mm`);
    }
    const cNorm = envNorm(s / len) + GRACE;
    if (r > cNorm + EPS) {
      fail(`[${cls}] ${name} (s=${s.toFixed(4)}): radius ${mm(r)} mm exceeds `
        + `normalized envelope profile + grace ${mm(cNorm)} mm`);
    }
    const excess = r - envAbs(s);
    if (excess > worstAbs) { worstAbs = excess; worstAt = name; }
    if (excess > RAIL_CLEAR + EPS) {
      fail(`[${cls}] ${name} (s=${s.toFixed(4)}): absolute-profile excess `
        + `${mm(excess)} mm exceeds RAIL_CLEAR ${mm(RAIL_CLEAR)} mm — `
        + `a solver-floored pose could visually clip`);
    }
  }
  // runtime validator must AGREE (the fail-closed path never rejects a
  // shipped entry silently)
  if (typeof looks.lookDimsValid === 'function' && !looks.lookDimsValid(d)) {
    fail(`[${cls}] shipped entry rejected by the runtime lookDimsValid — `
      + 'cueLookFor would silently fall back to defaults');
  }
  const own = Object.keys(mprov ?? {})
    .filter((k) => mprov[k] !== defMprov?.[k]).length;
  ok(`[${cls}] (rep id '${id}') len ${len.toFixed(4)} m, contained; `
    + `worst absolute-profile excess ${mm(worstAbs)} mm at ${worstAt} `
    + `(grace ${mm(GRACE)}, zero-clip bound ${mm(RAIL_CLEAR)}); `
    + `${shipped.size} material values tagged, ${own} class-own`);
}
// Both arms go through ok(), and the red arm passes `red` rather than trusting
// the counter: this summary reports failures raised many lines earlier, which
// the per-entry ok lines in between have already spent the mark on. The probe
// caught it printing `ok: ... 1 violation(s)`.
ok(promoFaults.length
  ? `material tier-promotion rule: ${promoFaults.length} violation(s) reported `
    + `above (${promoFaults.join(', ')}); ${promoExempt.length} exempted`
  : `material tier-promotion rule: no class publishes an inherited reflectance `
    + `value in an unchanged slot; ${promoExempt.length} class-own Published `
    + `tag(s) exempted for shipping a different substance at the same number`
    + `${promoExempt.length ? ` (${promoExempt.join(', ')})` : ''}`,
  promoFaults.length > 0);

// ---- gate 3b: PAINTED MAP PIXELS — every registry map, baked for real -----
// What a `map` key ships is not a thunk, it is a texture. The pin this
// replaces hashed painter SOURCE, and it reached exactly two functions:
// makeWoodMap and cachedWoodMap. One level below them sit rng (mulberry32)
// and noiseCanvas in shading.js, and the comment there waved them off as
// belonging to "table.js's own gates" — which, read for, do not exist. Move
// one constant in mulberry32 and every shipped shaft and butt repaints while
// a source hash of the two named functions sits perfectly still (review r3).
//
// So the pin is the OUTPUT. Node has no canvas, but these painters need only
// createImageData / putImageData — no drawing calls, no fonts, no
// compositing, no toDataURL (read, not assumed: shading.js noiseCanvas and
// cuelooks.js paintCanvas / progressiveMap are the only consumers) — so a
// small shim lets the REAL chain bake REAL bytes here. That is strictly
// stronger than any source hash: it ignores a refactor that preserves
// pixels, and it catches a change at ANY depth, including in a helper nobody
// thought to name in a pin list.
//
// DRAIN. Full-res canvases are deferred: progressiveMap returns a 128 px
// preview this frame and row-bands the real size through setTimeout (the
// select→float ≤300 ms law). Pinning the returned texture without draining
// would certify a preview no player ever sees — so the bake pass above runs
// the macrotask queue to quiescence through the module's own pendingMapBakes()
// seam, and the sizes pinned here (1024 for the closeup-register painters,
// 512 for the cachedWoodMap path) are what actually ship. It also proves the
// swap that ends a deferred bake advances the texture version — which R2
// showed is a NECESSARY step and not the reach-the-player proof an earlier
// version of this comment called it. The version advanced on every swap for
// the whole life of the defect, while three rejected the 1024 px upload
// against the 128 px storage it had already allocated. Nothing in this
// process can see that; only a GL context can (review r5, GH-556).
//
// The bake itself is hoisted above gate 3, because the drift rule compares
// map thunks by these same fingerprints. What is left here is the pin.
//
// ALSO PINNED: the sampler state that decides how those bytes reach the
// shader. TEX_PROPS is a closed list, like MAT_PROPS — a painter that starts
// setting something outside it is invisible here, which is a bound worth
// knowing rather than a hole worth pretending about.
{
  // THE ROLE TABLE, HELD EQUAL TO THE MODULE'S — both directions, and inside
  // this gate rather than at module scope, because a fail() outside a gate
  // repaints the mark of the FIRST gate in the run instead of this one.
  //
  // Equal, not nested, for the same reason MAT_COMPARED is: a role this gate
  // knows and the module cannot paint is a law with nothing under it, and a
  // role the module can paint that this gate does not know hands SAMPLER() an
  // undefined colour space, which compares unequal to everything and would
  // read as sixteen mysterious sampler failures instead of one clear one.
  const modRole = looks.MAP_ROLE;
  if (modRole === undefined || modRole === null) {
    fail('web/scene/cuelooks.js no longer exports MAP_ROLE. The colour space '
      + 'of every cue map is decided there and restated here; without the '
      + 'export this gate is asserting a law against nothing');
  } else {
    for (const [role, space] of Object.entries(TEX_ROLE)) {
      if (!(role in modRole)) {
        fail(`TEX_ROLE knows the map role '${role}' and cuelooks.js MAP_ROLE `
          + 'does not, so no map can ever be painted under it — this gate is '
          + 'holding a law with nothing under it. Add the role there or drop '
          + 'it here');
      } else if (modRole[role] !== space) {
        fail(`map role '${role}': cuelooks.js paints it `
          + `${JSON.stringify(modRole[role])} and this gate expects `
          + `${JSON.stringify(space)}. One of the two is wrong about what the `
          + 'sampler does to those texels, and the pixel pins cannot tell you '
          + 'which — the canvas bytes are identical either way');
      }
    }
    for (const role of Object.keys(modRole)) {
      if (role in TEX_ROLE) continue;
      fail(`cuelooks.js can paint maps under the role '${role}' and this gate `
        + 'has no colour space for it, so SAMPLER() would compare every such '
        + 'map against `colorSpace=undefined`. Restate the role here with its '
        + 'space, or take it out of MAP_ROLE');
    }
  }
  for (const [prop, role] of Object.entries(TEX_SLOT_ROLE)) {
    if (role in TEX_ROLE) continue;
    fail(`TEX_SLOT_ROLE gives '${prop}' the role '${role}', which TEX_ROLE `
      + 'does not define');
  }

  const got = new Map();
  const roleCensus = new Map();
  for (const [key, cls, slot, prop, tex, thunk, entry] of bakes) {
    const role = TEX_SLOT_ROLE[prop];
    roleCensus.set(role, (roleCensus.get(role) ?? 0) + 1);
    const fp = fingerprint(tex);
    const smp = samplerOf(tex);
    if (smp !== SAMPLER(role)) {
      fail(`[${cls}] ${slot}.${prop} sampler state is not the registry law `
        + `for the '${role}' role\n`
        + `         want ${SAMPLER(role)}\n         got  ${smp}\n`
        + '         Same bytes, different sampling, is still a different '
        + 'shipped surface.');
    }
    // A slot's second texture used to land HERE, on a guard that could only
    // report that the two-part key named neither of the two properties. The
    // key names the property now, so a second texture is simply a second pin:
    // it arrives unpinned, the loop below says so by name, and `--pins` prints
    // the row to add. The guard is not gone, it is answered.
    //
    // two look objects of one class must paint identically, or the pin key
    // is ambiguous (masse_soft ships two objects differing only at the tip)
    const prior = got.get(key);
    if (prior !== undefined && prior !== fp) {
      fail(`[${cls}] two look objects share this class but paint different `
        + `${slot} pixels — the pin key '${key}' cannot name both. Give the `
        + 'classes distinct keys here before shipping the divergence');
      continue;
    }
    got.set(key, fp);
    void slot;
  }
  if (process.argv.includes('--pins')) {
    console.log('  const WANT_PIXELS = {');
    for (const [k, v] of got) console.log(`    '${k}': '${v}',`);
    console.log('  };');
  }
  for (const [key, fp] of got) {
    const want = WANT_PIXELS[key];
    if (want === undefined) {
      fail(`no pixel pin for '${key}' — a registry map is shipping unpinned. `
        + `Add it (run with --pins): '${key}': '${fp}'`);
    } else if (want !== fp) {
      fail(`map pixels moved [${key}]\n         want ${want}\n         got  ${fp}`
        + '\n         The bytes a player sees changed. If that is the point '
        + 'of the change, re-pin with --pins, ship the capture sheet, and '
        + 'say so in the PR — this is a visible re-baseline, not a nit.');
    }
  }
  for (const key of Object.keys(WANT_PIXELS)) {
    if (!got.has(key)) {
      fail(`orphan pixel pin '${key}' — no registry map paints it any more; `
        + 'drop the pin in the same commit that dropped the map');
    }
  }
  // The census is REPORTED, not asserted. "no data map ships today" is true
  // and is already enforced four other ways (MAT_PROPS/MAT_COMPARED, the
  // MAT_KEYS orphan-provenance rule, gate 1b's per-slot property set, and
  // derive-cue-grain.mjs §F); a fifth copy of it here would say nothing new
  // and would have to be deleted by the commit that lands the channel — which
  // is the shape of a gate that teaches people to edit it. Printing the
  // number instead means the day it stops being zero is in the log.
  const census = Object.keys(TEX_ROLE)
    .map((r) => `${roleCensus.get(r) ?? 0} ${r}`).join(', ');
  // bakes.length exceeds got.size wherever two look objects of one class
  // paint the same slot (masse_soft); the census counts BAKES, the headline
  // counts PIN KEYS, and both numbers are printed so neither has to be
  // reconstructed from the other.
  ok(`${got.size} registry map(s) baked through the real painter chain and `
    + `pinned byte-exact (${bakes.length} bake(s): ${census}; `
    + `${bakeSpins} drain macrotasks; rng + `
    + 'noiseCanvas + paintCanvas + every painter body covered by '
    + 'construction; deferred canvas swaps proven to advance the texture '
    + 'version — necessary for the upload, not proof of it, see GH-556)');
}

// ---- gate 3c: RENDERED PARITY — the cue the player gets, every catalog id -
// Everything above reads the LEDGER and the registry it describes. Neither is
// what ships: `buildCue` is, and it stands between them and the screen twice
// over — three times, counting the dims, which every gate above proves
// CONTAINED and none proved RENDERED.
//
//   - the DEFAULT identity never reads its registry entry at all (byte-compat
//     law: `custom = null`, then six literals of its own), so
//     CUE_LOOK_DEFAULTS.materials is a copy nothing renders (review r2);
//   - every OTHER identity renders through `mat(rec, dflt)`, a hand-written
//     transfer of recipe → MeshStandardMaterial that nothing checked. Change
//     `color: rec.color` to `color: 0xffffff` and all sixteen cues turn white
//     with the whole provenance ledger still green (review r4).
//
// The r2 answer was to read cuestick.js's SOURCE with regexes, on the stated
// grounds that "plain node has no canvas and cannot build the materials to
// compare them as objects". The r3 canvas shim retired that excuse, and the
// honest check is the one it makes possible: BUILD every identity and compare
// the objects. That is strictly stronger — it covers fifteen identities the
// source parse never looked at, it survives a refactor of the literals it
// used to pattern-match, and what it compares is what the shader receives.
//
// UNLEDGERED PARAMETERS. Each built material is also diffed against TWO
// pristine baselines — its CLASS against a MeshStandardMaterial, its VALUES
// against a pristine of whatever class it actually is (see the pair below):
// anything the build set that MAT_PROPS does not key would ship with no tag to
// answer for it. Three keys are excluded and named
// here rather than waved at — `uuid` (per-instance identity) and the two flex
// hooks `onBeforeCompile` / `customProgramCacheKey` that addFlexShader
// installs on every segment. That is the whole allow-list, and the two hooks
// are excluded from the DIFF only: they are INVOKED below (review r7), because
// "a property this gate does not compare" and "a property nothing checks" were
// the same sentence for the one hook that can rewrite the shader outright.
//
// BOTH VARIANTS. `web/app/cuepost.js` builds `{ whip: true, cueId }` for every
// post-shot cue on screen, and nothing here built it (review r7): the whip
// tessellation, the second GLSL body and its three extra uniforms shipped
// unproven. Every id is therefore built twice.
{
  const shimmed = installCanvasShim();
  try {
    const cuestick = await import(repoUrl('web/scene/cuestick.js'));
    const ALLOW = new Set(['uuid', 'onBeforeCompile', 'customProgramCacheKey']);
    // TWO BASELINES, because a class change and a value change are different
    // failures and one baseline can only tell you about whichever it is.
    //
    // (A) THE CLASS, against a pristine MeshStandardMaterial. Measured on the
    //     vendored three r170: Standard carries 79 own-enumerable properties,
    //     Physical 111, and the switch removes none — so a Physical segment
    //     differs in 32 keys before anyone sets anything. Diffed against the
    //     Standard baseline those arrive as 32 separate "the ledger does not
    //     key '_clearcoat'" failures: each sentence true, the diagnosis
    //     useless, and whichever one was actually authored buried in the other
    //     31. The class is ONE decision and is reported as one.
    // (B) THE VALUES, against a pristine of the SAME class. This is the only
    //     baseline that can distinguish "this was set" from "this class has
    //     it", and it is what makes an accessor-backed channel visible at all:
    //     `anisotropy` on a Physical is stored in `_anisotropy`, which the
    //     CLASS adds, not the use — turning the channel on adds no key and
    //     changes no key set. Its only traces are that private field's value
    //     and `version` (0 -> 1), and both are compared here.
    const pristineStd = new THREE.MeshStandardMaterial();
    const STD_KEYS = new Set(Object.keys(pristineStd));
    const pristineOf = new Map(); // constructor → one pristine instance
    const sameClass = (mat) => {
      let p = pristineOf.get(mat.constructor);
      if (p === undefined) {
        p = new mat.constructor();
        pristineOf.set(mat.constructor, p);
      }
      return p;
    };
    // three stores several channels behind accessors whose own-enumerable key
    // is the private field. Report the name the ledger would key and a reader
    // can search for, not the one the diff happens to walk.
    const publicName = (k) => (k.startsWith('_') ? k.slice(1) : k);
    // Instance-valued properties (Color, Vector2, Euler, plain objects) are
    // never `===` across two materials, so compare them by VALUE — otherwise
    // the allow-list would have to swallow half the material to stay quiet.
    const val = (v) => {
      if (v == null) return String(v);
      if (v.isColor) return `#${v.getHexString()}`;
      if (v.isTexture) return `tex:${fingerprint(v)}`;
      if (typeof v === 'function') return 'fn';
      if (typeof v === 'object') {
        return JSON.stringify(v, (k, x) => (x?.isTexture ? 'tex' : x));
      }
      return String(v);
    };
    // EVERY id, not one per class (review r6). `seen` collapses look objects,
    // but what a player passes is an ID, and the id → look resolution is
    // buildCue's own (`cueLookFor`, then the byte-compat null for the defaults
    // identity). Nine representatives left seven catalog ids — every hidden
    // brand alias, `standard_dime_tip`, the massé pair's second member —
    // never built. Cheap to close: the maps are cache-shared across ids.
    // The flex hook is invoked TWICE per segment, and the pair is the point
    // (review r8). A minimal stub keeps the GLSL pin readable — the hook's
    // stated contract is "prepend uniforms, replace #include <begin_vertex>",
    // and a stub carrying exactly that include isolates the injected text.
    // But a stub is also a shader with almost nothing in it: a hook that
    // rewrote `#include <lights_fragment_begin>` would find nothing to rewrite
    // here and the gate would report an untouched fragment stage while every
    // cue on screen re-shaded. So the second call runs the REAL
    // ShaderLib.physical sources and uniforms (the program a cue material
    // actually compiles to), and the transformation proven
    // over the stub is required to be the WHOLE transformation there too.
    const STUB_VS = 'void main() {\n#include <begin_vertex>\n}\n';
    const STUB_FS = 'void main() { gl_FragColor = vec4(1.0); }\n';
    const INC = '#include <begin_vertex>';
    const HEAD = 'void main() {\n';
    // ShaderLib.PHYSICAL, not .standard (review r10): r170 maps BOTH
    // MeshStandardMaterial and MeshPhysicalMaterial to the 'physical' program
    // (`{MeshStandardMaterial:"physical", ...}` in WebGLPrograms), so
    // `physical` is the uniform set a cue material actually compiles against.
    // The two libs share vertex and fragment SOURCE on this release, so the
    // text half of the comparison is unaffected — but `physical` carries 106
    // uniforms to `standard`'s 62, and the 44 it adds (clearcoat, sheen,
    // specular*, iridescence, transmission, anisotropy) are exactly the knobs
    // a "make the ferrule glossier" edit inside the flex hook would reach for.
    // Probed against `standard` those 44 are invisible: the hook could set
    // `uniforms.clearcoat.value = 1` on every cue and the overwrite check has
    // no `before` entry to compare it to.
    const REAL_LIB = THREE.ShaderLib.physical;
    const REAL_VS = REAL_LIB.vertexShader;
    const REAL_FS = REAL_LIB.fragmentShader;
    // ...which is only the right lib while the cue materials are the classes
    // three maps there. A slot that ever ships a MeshPhongMaterial compiles
    // against 'phong' and this whole probe would be measuring the wrong set.
    const PHYSICAL_TYPES = ['MeshStandardMaterial', 'MeshPhysicalMaterial'];
    // The real-shader comparison below is `preamble + REAL_VS.replace(INC,
    // body)`, and `String.replace` with an absent needle returns the subject
    // unchanged — on BOTH sides. So if a three upgrade renamed or dropped the
    // anchor, production's own `.replace` would inject nothing, the expected
    // expression would expect nothing, and the gate would certify a cue that
    // no longer bends. The anchor is a precondition of the comparison, so it
    // is asserted here rather than assumed: exactly one, not merely present
    // (two would inject the bend twice and this gate would still say yes).
    const ANCHORS = REAL_VS.split(INC).length - 1;
    if (ANCHORS !== 1) {
      fail(`rendered flex: three's standard vertex shader carries ${ANCHORS} `
        + `'${INC}' anchors, want exactly 1 — the flex hook injects by `
        + 'replacing that chunk, so at 0 every cue silently stops bending and '
        + 'at 2+ the bend is applied twice; re-read addFlexShader against the '
        + 'vendored three release before touching this line');
    }
    const BASE_UNIFORMS = ['uFlexA', 'uRailA', 'uRailS', 'uSegZ'];
    const WHIP_UNIFORMS = ['uBendC', 'uFlex2A', 'uFlex2S', 'uFlexA', 'uRailA',
      'uRailS', 'uSegZ'];
    // sha of the injected vertex source with the per-length literal normalized
    // to %INVLEN%. Re-pin with --pins after an INTENDED GLSL change and say so
    // in the PR: this text bends every cue on every screen.
    const WANT_GLSL = {
      base: '4f8fad9782228102', // FLEX_GLSL  + obCueFlex1 preamble
      whip: '6f622a43fc67c5a8', // FLEX2_GLSL + obCueFlex4 preamble
    };
    const glslSeen = new Map();
    const ids = [...new Set([...CATALOG_IDS, ...Object.keys(looks.CUE_LOOKS)])];
    const builds = []; // [class, id, whip, entry, built] (the WHOLE result)
    for (const id of ids) {
      const entry = looks.cueLookFor(id);
      // the two SHIPPED call shapes, spelled as their callers spell them:
      // aim.js / ateliercue.js pass no `whip` key at all, cuepost.js passes
      // `whip: true`. Anything between is not a build any player receives.
      builds.push([entry.class, id, false, entry,
        cuestick.buildCue({ cueId: id })]);
      builds.push([entry.class, id, true, entry,
        cuestick.buildCue({ cueId: id, whip: true })]);
    }
    // The tie between the two lists, checked before a single material is
    // compared. Both directions, because they fail differently: a MAT_PROPS
    // name missing here is a parameter the unledgered diff skips and nothing
    // compares (the hole the boundary comment measures at 168 -> 0 failures);
    // a name here that MAT_PROPS does not carry is an exemption granted to a
    // parameter no recipe can declare, which is an exemption nobody can
    // justify. This is placed inside gate 3c and not at module scope so its
    // red lands on 3c's own mark rather than repainting the first gate above.
    for (const p of MAT_PROPS) {
      if (MAT_COMPARED.includes(p)) continue;
      fail(`MAT_PROPS carries '${p}' and gate 3c has no explicit comparison `
        + 'for it, yet the unledgered-parameter diff below skips it as though '
        + 'there were one. That is not a stricter check, it is no check: the '
        + `recipe may spell '${p}', the material may ship it, and neither the `
        + 'rendered-parity table nor the vs-pristine diff will look at it. '
        + `Write the comparison beside the other ${MAT_COMPARED.length} and `
        + 'name it in MAT_COMPARED, or take the property back out of '
        + 'MAT_PROPS');
    }
    for (const p of MAT_COMPARED) {
      if (MAT_PROPS.includes(p)) continue;
      fail(`MAT_COMPARED exempts '${p}' from the unledgered-parameter diff, `
        + 'but MAT_PROPS does not let a recipe declare it, so no ledger key '
        + 'answers for it. An exemption with no ledger behind it is how a '
        + 'parameter ships untagged — add it to MAT_PROPS with its key and '
        + 'tag, or stop exempting it');
    }
    // THE TIER, held against itself and against the texture table. Same place
    // and same reason as the pair above: these are all statements that two
    // lists which must agree do agree, and a fail() at module scope repaints
    // the FIRST gate's mark instead of this one's.
    for (const p of MAT_PROPS_HELD) {
      if (!MAT_PROPS.includes(p)) continue;
      fail(`'${p}' is in MAT_PROPS and MAT_PROPS_HELD at once — a channel `
        + 'cannot be declarable and held in the same tree. If it landed, take '
        + 'it out of the held tier in the commit that landed it: the tier is '
        + 'the record of what is NOT shipping, and a stale entry there reads '
        + 'as a live hold to everyone downstream of it');
    }
    // AND THE SAME SENTENCE READ THE OTHER WAY, for the half of it that is a
    // law. The loop below asks every role for a tier; nothing asked every
    // texture-valued tier entry for a role, so `aoMap` could be added to
    // either list — and to the prewarm's MAP_PROPS, which is checked against
    // this ledger — and every gate in this file would stay green while the
    // apparatus baked nothing for it, sampled nothing for it and pinned
    // nothing for it. A check that compares the INTERSECTION of two sets
    // cannot fail on a member of either one, and this pair had been written
    // from one side only. The report further down is still a report: a HELD
    // channel that is not a texture at all — a clearcoat, a sheen — owes no
    // role and never will. `isMapProp` is what separates the two, so the law
    // is asserted exactly where it is a law and nowhere wider.
    for (const p of roleGaps(MAT_PROPS, MAT_PROPS_HELD)) {
      fail(`'${p}' is a texture channel in the ledger and TEX_SLOT_ROLE gives `
        + 'it no role, so this gate bakes no image for it, samples nothing '
        + 'through it and pins no bytes of it. It would ship — or be held — '
        + 'with every assertion in this file green and not one of them about '
        + `it. Add '${p}' to TEX_SLOT_ROLE with its role, or take it out of `
        + 'the ledger');
    }
    // The simulation, not the assertion: the rule above is only worth having
    // if it reddens on a channel that is not there yet.
    if (!roleGaps(MAT_PROPS, [...MAT_PROPS_HELD, 'aoMap']).includes('aoMap')) {
      fail('adding a texture-valued channel with no TEX_SLOT_ROLE would not be '
        + 'caught by the rule directly above it — that rule is decoration. It '
        + 'was written because exactly this addition passed every gate here');
    } else {
      ok('a texture channel added to either tier without a TEX_SLOT_ROLE reds: '
        + 'simulated through the same expression the assertion uses, not '
        + 'asserted in a comment');
    }
    for (const p of Object.keys(TEX_SLOT_ROLE)) {
      if (MAT_PROPS.includes(p) || MAT_PROPS_HELD.includes(p)) continue;
      fail(`TEX_SLOT_ROLE gives '${p}' a role, so this gate bakes, samples and `
        + 'pins it, and the ledger has no tier for it: not declarable '
        + '(MAT_PROPS), not held (MAT_PROPS_HELD). The apparatus can carry a '
        + 'channel the ledger has never taken a position on, which is exactly '
        + 'how one arrives without either a measurement or a decision to do '
        + 'without one');
    }
    // ...and the other direction is REPORTED, not asserted. "every held
    // channel already has an apparatus role" is true today and is a fact about
    // this round's two holds, not a law: a held channel that is not a texture
    // at all (a clearcoat, a sheen) would have no TEX_SLOT_ROLE entry and
    // would be perfectly well held. Asserting it would build a wall against a
    // hypothesis and would have to be deleted by whoever hit it first.
    const heldWithRole = MAT_PROPS_HELD.filter((p) => p in TEX_SLOT_ROLE);
    const spins = await drainMapBakes('rendered bake');
    const covered = new Set();
    for (const [cls, id, whip, entry, built] of builds) {
      covered.add(entry);
      const call = whip ? `buildCue({cueId:'${id}', whip:true})`
        : `buildCue('${id}')`;
      const group = built?.group;
      if (!group?.isObject3D) {
        fail(`[${cls}] ${call} did not return a group — nothing below can run`);
        continue;
      }
      // Slots are read off the child ORDER, so the six-segment law is this
      // gate's precondition, not a nicety: a seventh child or a reordered one
      // would have it comparing a butt against a tip and passing.
      const kids = group.children;
      if (group.name !== 'obCueStick' || kids.length !== MAT_SLOTS.length
        || kids.some((c) => !c.isMesh || c.geometry?.type !== 'CylinderGeometry')) {
        fail(`[${cls}] ${call} is not the six-segment law: name `
          + `'${group.name}', ${kids.length} child(ren) of type `
          + `${[...new Set(kids.map((c) => c.geometry?.type))].join('/')} — the `
          + 'per-slot comparison below reads slots off child order and cannot '
          + 'run against a different shape');
        continue;
      }
      // THE ROD, not just its paint (review r6). Everything above proves the
      // ledger's DIMS are contained; nothing proved buildCue renders them.
      // Drop one `D?.SHAFT_LEN ??` and every custom cue silently reverts to
      // the module default while the containment gate — which reads
      // entry.dims — stays green. The station table is the same independent
      // restatement gate 3 uses, so what is proven here is that the rendered
      // rod IS the rod that was proven contained.
      // THE GROUP'S OWN TRANSFORM (review r8). Every check below reads a
      // child's LOCAL pose, and a local pose means nothing under a parent
      // that scales: `group.scale.setScalar(1.05)` puts a 1.55 m rod on the
      // table with all six locals — and the whole containment proof they
      // stand on — untouched. buildCue must hand back an UNPOSED group;
      // poseCue owns position and orientation, per frame, and it never
      // touches scale.
      group.updateMatrixWorld(true);
      const gpose = `${group.position.toArray().join()} q `
        + `${group.quaternion.toArray().join()} s ${group.scale.toArray().join()}`
        + ` auto ${group.matrixAutoUpdate},${group.matrixWorldAutoUpdate}`;
      if (gpose !== '0,0,0 q 0,0,0,1 s 1,1,1 auto true,true') {
        fail(`rendered drift [${cls}] ${call} returns a group that is already `
          + `transformed: ${gpose} — the cue that reaches the table is this `
          + 'times every segment pose proven below, and the envelope was '
          + 'proven over the segments alone');
      }
      const st = stations(entry.dims);
      const flexU = []; // per-slot shared-uniform table (identity check below)
      MAT_SLOTS.forEach((slot, i) => {
        const kid = kids[i];
        const wantGeo = {
          radiusTop: st[i][2], radiusBottom: st[i + 1][2],
          height: entry.dims[LEN_KEYS[i]], radialSegments: 24,
          heightSegments: whip ? (WHIP_SEGS[slot] ?? 1) : 1,
          openEnded: false, thetaStart: 0, thetaLength: Math.PI * 2,
        };
        const gotGeo = kid.geometry.parameters ?? {};
        const gotKeys = Object.keys(gotGeo).sort().join(',');
        if (gotKeys !== Object.keys(wantGeo).sort().join(',')) {
          fail(`rendered drift [${cls} ${slot}] geometry parameter set is `
            + `'${gotKeys}' — this gate compares a closed list and cannot `
            + 'speak for a parameter it does not name');
        }
        for (const [k, v] of Object.entries(wantGeo)) {
          if (gotGeo[k] !== v) {
            fail(`rendered drift [${cls} ${slot}.${k}]: ${call} `
              + `ships ${gotGeo[k]}, the registered dims say ${v} — the cue on `
              + 'screen is not the cue the containment law was proven over');
          }
        }
        // THE BUFFERS, not the constructor's memory of them (review r7).
        // `parameters` is written once and never revised: geometry.scale(),
        // .translate(), .applyMatrix4() and a hand-edited position attribute
        // all move the rendered rod — out of the proven envelope, if that is
        // where they move it — with every line above still green. Build the
        // cylinder the ledger describes and compare what the GPU is handed.
        const wantFp = geoFp(new THREE.CylinderGeometry(wantGeo.radiusTop,
          wantGeo.radiusBottom, wantGeo.height, wantGeo.radialSegments,
          wantGeo.heightSegments, wantGeo.openEnded, wantGeo.thetaStart,
          wantGeo.thetaLength));
        const gotFp = geoFp(kid.geometry);
        if (gotFp !== wantFp) {
          fail(`rendered drift [${cls} ${slot}] geometry BUFFERS are not the `
            + `cylinder the ledger describes (${call}) — the constructor `
            + 'parameters match, so something edited the vertices after the '
            + `build\n         want ${wantFp}\n         got  ${gotFp}`);
        }
        // pose: tip face at local z = 0, cue extending toward −z, each
        // cylinder rotated onto that axis (cuestick.js seg())
        const wantZ = -st[i][1] - wantGeo.height / 2;
        const pose = `${kid.position.x},${kid.position.y},${kid.position.z} `
          + `rot ${kid.rotation.x},${kid.rotation.y},${kid.rotation.z} `
          + `scale ${kid.scale.x},${kid.scale.y},${kid.scale.z}`;
        const wantPose = `0,0,${wantZ} rot ${Math.PI / 2},0,0 scale 1,1,1`;
        if (pose !== wantPose) {
          fail(`rendered drift [${cls} ${slot}] pose is ${pose}, want `
            + `${wantPose} — a segment in the wrong place is a different cue `
            + 'even when every radius is right');
        }
        // and the matrix the renderer actually uses (review r8): position /
        // rotation / scale are advisory — with matrixAutoUpdate off, or a
        // matrix composed by hand, they describe a cue nobody sees. Composed
        // through three's own path from the values above, so this is an
        // equality, not a tolerance.
        const wantM = new THREE.Matrix4().compose(
          new THREE.Vector3(0, 0, wantZ),
          new THREE.Quaternion().setFromEuler(
            new THREE.Euler(Math.PI / 2, 0, 0)),
          new THREE.Vector3(1, 1, 1));
        if (!kid.matrixAutoUpdate
          || kid.matrixWorld.elements.join() !== wantM.elements.join()) {
          fail(`rendered drift [${cls} ${slot}] WORLD matrix is not the pose `
            + `it reports (auto ${kid.matrixAutoUpdate})\n         want `
            + `${wantM.elements.join()}\n         got  `
            + `${kid.matrixWorld.elements.join()}`);
        }
        const m = kid.material;
        const rec = effective(entry.materials?.[slot]);
        // colour / roughness / metalness: what the recipe says the shader gets
        witness('color', 'roughness', 'metalness');
        if (m.color.getHex() !== rec.color) {
          fail(`rendered drift [${cls} ${slot}.color]: ${call} ships `
            + `0x${m.color.getHexString()}, the ledger tags `
            + `0x${(rec.color ?? 0).toString(16)}`);
        }
        if (m.roughness !== rec.roughness) {
          fail(`rendered drift [${cls} ${slot}.roughness]: ${call} `
            + `ships ${m.roughness}, the ledger tags ${rec.roughness}`);
        }
        if (m.metalness !== rec.metalness) {
          fail(`rendered drift [${cls} ${slot}.metalness]: ${call} `
            + `ships ${m.metalness}, the ledger tags ${rec.metalness}`);
        }
        // The textures: same bytes, same sampling, as the pins gate 3b holds.
        // EVERY property in TEX_SLOT_ROLE, not the `.map` this block used to
        // name literally — the same fourth wall the bake pass had, and here it
        // is the one that decides whether a channel reaches a screen. The pin
        // key carries the property now, so each is looked up on its own. Two
        // of the three are absent from every recipe today, so those passes
        // compare a null binding against an absent pin and change no figure.
        for (const [prop, role] of Object.entries(TEX_SLOT_ROLE)) {
          witness(prop);
          const key = `${cls}.${slot}.${prop}`;
          const want = WANT_PIXELS[key];
          const tex = m[prop];
          if (tex == null) {
            // THE FORWARDING WALL, stated. cuestick.js's mat() names the four
            // properties it copies out of a recipe LITERALLY (`:300`), so
            // growing MAT_PROPS does not by itself put a channel on screen:
            // the registry would paint it, gate 3b would bake, sample and pin
            // it, the ledger would tag it, and every player would receive a
            // material that never binds it. That is the quietest way a
            // reflectance channel can be certified into a build it is not in.
            if (want !== undefined) {
              fail(`rendered drift [${key}]: ${call} binds NO ${prop}, but the `
                + 'registry paints one and gate 3b pins its pixels — check '
                + "that cuestick.js mat() forwards '" + prop + "' out of the "
                + 'recipe; it copies its properties by name');
            }
            continue;
          }
          if (want === undefined) {
            fail(`rendered drift [${key}]: ${call} binds a ${prop} the `
              + 'registry does not paint — an unpinned texture is reaching the '
              + 'screen through the render path only');
            continue;
          }
          const fp = fingerprint(tex);
          if (fp !== want) {
            fail(`rendered drift [${key}]\n         registry pin ${want}\n`
              + `         buildCue     ${fp}\n         The default identity `
              + 'paints through makeWoodMap and the registry through '
              + 'cachedWoodMap: same bytes, or the shipped cue and its ledger '
              + 'are different cues.');
          }
          const smp = samplerOf(tex);
          // buildCue's byte-compat literal mirror re-types the option pack,
          // so it can paint identical bytes and still hand the shader a
          // differently SAMPLED texture. Same bytes is not the same surface.
          // The role is read off TEX_SLOT_ROLE rather than named here, so the
          // rendered side cannot drift from the law gate 3b holds.
          if (smp !== SAMPLER(role)) {
            fail(`rendered drift [${key}] sampler state is not the registry `
              + `law for the '${role}' role\n`
              + `         want ${SAMPLER(role)}`
              + `\n         got  ${smp}`);
          }
        }
        // nothing else may reach the shader untagged — baseline (A), the class
        //
        // THE CONSTRUCTOR, NOT THE KEY SET. `classAdded` below asks whether the
        // class brought NEW own-enumerable keys, which is a proxy for "is this
        // still a Standard" and a leaky one. A subclass that adds no key and
        // only MOVES an inherited default — `class P extends
        // MeshStandardMaterial { constructor(o) { super(o);
        // this.emissiveIntensity = 3; } }` — leaves classAdded empty, keeps the
        // inherited `type`, and is then compared against `new
        // mat.constructor()`, a pristine of ITS OWN class, which carries the
        // same moved default. Both baselines agree and the unledgered
        // reflectance change ships green. Demonstrated on the shaft material,
        // where the run still printed "every other value against a pristine of
        // its own class" — the note describing the exact hole it was falling
        // into. The class is checked by identity here, before the key set,
        // because a pristine of the wrong class is the wrong baseline no matter
        // what is compared against it.
        if (m.constructor !== THREE.MeshStandardMaterial) {
          fail(`[${cls} ${slot}] ${call} ships a ${m.constructor?.name ?? '(anonymous)'}, which `
            + 'is not MeshStandardMaterial itself but a subclass of it. A subclass may move an '
            + 'inherited default without adding a single own property, and the value baseline '
            + 'below is a pristine of the SHIPPED class, so it would carry that same moved '
            + 'default and agree. The class is a reflectance decision — it changes the BRDF and '
            + 'the uniform set for every segment that ships it — and ADR-0016 has exactly one '
            + 'key for it, which is none. Give the ledger a key for the material class and '
            + 'compare against THAT here; do not widen the baseline.');
        }
        const proto = sameClass(m);
        const classAdded = Object.keys(proto).filter((k) => !STD_KEYS.has(k));
        if (classAdded.length) {
          fail(`[${cls} ${slot}] ${call} ships a ${m.type}, not the `
            + `MeshStandardMaterial the ledger is written against: `
            + `${classAdded.length} own propert(ies) exist on it that a `
            + 'pristine Standard does not have '
            + `(${classAdded.slice(0, 4).map(publicName).join(', ')}, …). The `
            + 'class is itself a reflectance decision — it changes the BRDF '
            + 'and the uniform set for every segment that ships it — and '
            + 'ADR-0016 has exactly one key for it, which is none. Give the '
            + 'ledger a key for the material class and compare against THAT '
            + 'here; do not widen the baseline, which would make the switch '
            + 'the one reflectance change that ships without a tag');
        }
        // ...and baseline (B), the values, against a pristine of the same class
        for (const k of Object.keys(m)) {
          if (ALLOW.has(k) || MAT_COMPARED.includes(k)) continue;
          if (val(m[k]) !== val(proto[k])) {
            fail(`[${cls} ${slot}] ${call} sets '${publicName(k)}' = `
              + `${val(m[k])}, which the ADR-0016 ledger does not key (a `
              + `pristine ${m.type} has ${val(proto[k])}) — add the key and a `
              + 'tag before a new reflectance channel ships');
          }
        }
        // ---- the flex hook, RUN (review r7) ---------------------------------
        // `onBeforeCompile` was on the allow-list, which meant the one
        // property here that can rewrite the shader outright was the one
        // property nothing looked at: a fragment-stage edit or a new
        // reflectance uniform would change every cue on screen with the whole
        // ledger — colour, roughness, metalness, pixels — still matching.
        // It is a VERTEX hook, so that is what it is held to.
        if (typeof m.onBeforeCompile !== 'function'
          || typeof m.customProgramCacheKey !== 'function') {
          fail(`[${cls} ${slot}] ${call} ships a segment with no flex hook — `
            + 'the six segments bend from shared uniforms and one rigid '
            + 'segment is a broken cue');
          return;
        }
        if (!PHYSICAL_TYPES.includes(m.type)) {
          fail(`[${cls} ${slot}] ${call} ships a ${m.type}, which three does `
            + `not compile against ShaderLib.physical (${PHYSICAL_TYPES.join('/')}`
            + ' only) — the real-shader probe below would be measuring the '
            + 'hook against a uniform set this material never sees');
          return;
        }
        const shader = { uniforms: {}, vertexShader: STUB_VS,
          fragmentShader: STUB_FS };
        m.onBeforeCompile(shader);
        if (shader.fragmentShader !== STUB_FS) {
          fail(`[${cls} ${slot}] ${call}: the flex hook edited the FRAGMENT `
            + 'shader. Shading is the ledger\'s business and the ledger has no '
            + 'key for GLSL — a reflectance change smuggled through a vertex '
            + 'hook answers to nothing');
        }
        const names = Object.keys(shader.uniforms).sort().join(',');
        const wantNames = (whip ? WHIP_UNIFORMS : BASE_UNIFORMS).join(',');
        if (names !== wantNames) {
          fail(`[${cls} ${slot}] ${call}: flex uniforms are '${names}', want `
            + `'${wantNames}' — the shared-uniform contract is what cuepost.js `
            + 'and aim.js write to, and a channel that appears here without a '
            + 'consumer (or vanishes with one) is a silent shader change');
        }
        for (const [n, u] of Object.entries(shader.uniforms)) {
          if (u?.value?.isTexture) {
            fail(`[${cls} ${slot}] ${call}: flex uniform '${n}' carries a `
              + 'TEXTURE — a map reaching the shader outside material.map is '
              + 'unpinned pixels with no ledger key');
          }
        }
        if (shader.uniforms.uSegZ?.value !== wantZ) {
          fail(`[${cls} ${slot}] ${call}: uSegZ is `
            + `${shader.uniforms.uSegZ?.value}, want ${wantZ} — the bend shape `
            + 'reads cue-local s from this offset, so a mis-threaded segment '
            + 'bends as if it sat somewhere else on the rod');
        }
        // the GLSL itself, pinned with the per-length literal normalized out:
        // the SHAPE is a re-baseline (one pin per variant), the LENGTH
        // THREADING is re-derived here — a body that baked the module default
        // 1/CUE_LEN into a 1.22 m massé cue would bend it on the wrong scale.
        const invLen = (1 / cueLenOf(entry.dims)).toFixed(6);
        if (!shader.vertexShader.includes(invLen)) {
          fail(`[${cls} ${slot}] ${call}: the injected body carries no `
            + `1/${cueLenOf(entry.dims)} = ${invLen} literal — this cue's own `
            + 'length never reached its bend shape');
        }
        const glslFp = sha(shader.vertexShader.split(invLen).join('%INVLEN%'));
        const wantGlsl = whip ? WANT_GLSL.whip : WANT_GLSL.base;
        if (glslFp !== wantGlsl) {
          fail(`[${cls} ${slot}] ${call}: the injected vertex GLSL is not the `
            + `pinned ${whip ? 'whip' : 'base'} body (${glslFp} vs `
            + `${wantGlsl}) — every cue on screen bends by this text. If the `
            + 'change is intended, re-pin with --pins and say so in the PR');
        }
        const wantKey = (whip ? 'obCueFlex4' : 'obCueFlex1')
          + (cueLenOf(entry.dims) === DEFAULT_LEN ? ''
            : `@L${Math.round(cueLenOf(entry.dims) * 1000)}`);
        if (m.customProgramCacheKey() !== wantKey) {
          fail(`[${cls} ${slot}] ${call}: program cache key is `
            + `'${m.customProgramCacheKey()}', want '${wantKey}' — two `
            + 'different GLSL bodies under one key is a cached program serving '
            + 'the wrong cue (design-277 back-compat law)');
        }
        glslSeen.set(`${whip ? 'whip' : 'base'}`, glslFp);
        flexU.push(shader.uniforms);
        // ---- the same hook against the REAL standard sources (review r8) ---
        // Recover the two halves of the transformation from the stub run —
        // stub out = PREAMBLE + 'void main() {\n' + BODY + '\n}\n' — and
        // require that applying exactly those to ShaderLib.physical is
        // exactly what the hook does to it. Anything else the hook touches,
        // in either stage, is then a difference: a second chunk replaced, a
        // uniform of three's own overwritten, a fragment edit that had
        // nothing to bite on in the stub.
        const core = shader.vertexShader;
        const hi = core.indexOf(HEAD);
        if (!core.endsWith('\n}\n') || hi < 0) {
          fail(`[${cls} ${slot}] ${call}: the injected stub source is not the `
            + 'prepend-and-replace shape this gate takes apart to check it '
            + 'against the real shader — the hook changed shape');
        } else {
          const preamble = core.slice(0, hi);
          const body = core.slice(hi + HEAD.length, core.length - 3);
          const real = { uniforms: THREE.UniformsUtils.clone(
            REAL_LIB.uniforms),
          vertexShader: REAL_VS, fragmentShader: REAL_FS };
          const before = new Map(Object.entries(real.uniforms)
            .map(([k, u]) => [k, val(u?.value)]));
          m.onBeforeCompile(real);
          if (real.fragmentShader !== REAL_FS) {
            fail(`[${cls} ${slot}] ${call}: the flex hook edits the REAL `
              + 'standard FRAGMENT shader (it left the stub alone — the chunk '
              + 'it rewrites only exists in the compiled sources). Shading is '
              + 'the ledger\'s business and the ledger has no key for GLSL');
          }
          if (real.vertexShader !== preamble + REAL_VS.replace(INC, body)) {
            fail(`[${cls} ${slot}] ${call}: against the real standard VERTEX `
              + 'source the hook does more than prepend its uniforms and '
              + 'replace <begin_vertex> — another chunk of three\'s own '
              + 'shader is being rewritten where the stub had nothing to '
              + 'rewrite');
          }
          for (const [k, v] of before) {
            if (!(k in real.uniforms)) {
              fail(`[${cls} ${slot}] ${call}: the flex hook DELETED three's `
                + `own uniform '${k}'`);
            } else if (val(real.uniforms[k]?.value) !== v) {
              fail(`[${cls} ${slot}] ${call}: the flex hook overwrites three's `
                + `own uniform '${k}' (${v} → ${val(real.uniforms[k]?.value)})`
                + ' — a reflectance change with no ledger key, arriving where '
                + 'no ledgered property moved');
            }
          }
          const added = Object.keys(real.uniforms).filter((k) => !before.has(k))
            .sort().join(',');
          if (added !== wantNames) {
            fail(`[${cls} ${slot}] ${call}: against the real uniform set the `
              + `hook adds '${added}', want '${wantNames}'`);
          }
        }
      });
      // one uniform OBJECT per channel across all six segments (design 277:
      // "one write per frame moves the whole cue"). Six private copies would
      // leave five segments rigid while cuepost.js writes to the sixth.
      for (const n of whip ? WHIP_UNIFORMS : BASE_UNIFORMS) {
        if (n === 'uSegZ') continue; // per-segment by design
        if (flexU.length === MAT_SLOTS.length
          && !flexU.every((u) => u[n] === flexU[0][n])) {
          fail(`[${cls}] ${call}: uniform '${n}' is not SHARED across the six `
            + 'segments — a per-frame write would move one segment and leave '
            + 'the other five behind');
        }
      }
      // ...and that shared object is the one the CALLER was handed (review r9).
      // Everything above proves the six shaders agree with each other; none of
      // it reaches `buildCue`'s returned `flex.u`, which is the only thing
      // cuepost.js and updateFlex ever write to. Hand back a rebuilt table —
      // `u: { uFlexA: { value: new Vector3() }, ... }` — and every per-frame
      // write lands in an object no shader reads: the cue goes rigid, the six
      // shaders still share, and this gate says yes.
      const handle = built.flex?.u;
      if (flexU.length === MAT_SLOTS.length) {
        const want = (whip ? WHIP_UNIFORMS : BASE_UNIFORMS)
          .filter((n) => n !== 'uSegZ'); // per-segment, never on the handle
        const got = handle && typeof handle === 'object'
          ? Object.keys(handle).sort() : null;
        if (!got || got.join() !== want.join()) {
          fail(`[${cls}] ${call}: the returned flex handle carries `
            + `'${got ? got.join() : handle}', want '${want.join()}' — the `
            + 'whip channels are feature-detected by cuepost.js (OWNERSHIP '
            + 'rule 5), so a missing one is a silent no-bend, not a crash');
        } else {
          for (const n of want) {
            if (handle[n] !== flexU[0][n]) {
              fail(`[${cls}] ${call}: flex.u.${n} is NOT the object installed `
                + 'in the shaders — the writers own this handle, so a copy '
                + 'means every per-frame write goes to a dead uniform');
            }
          }
          // `flex.idle = true` is a claim about these uniforms: updateFlex
          // short-circuits the whole write on it, so a non-zero initial state
          // under it renders a permanently pre-bent cue nothing ever corrects.
          const zeros = want.filter((n) => n !== 'uRailS' && n !== 'uFlex2S');
          for (const n of zeros) {
            if (val(handle[n]?.value) !== '{"x":0,"y":0,"z":0}') {
              fail(`[${cls}] ${call}: flex.u.${n} starts at `
                + `${val(handle[n]?.value)}, not zero, while flex.idle claims `
                + 'the uniforms are already zero — the first frames render a '
                + 'bend no writer asked for');
            }
          }
          if (built.flex.idle !== true
            || handle.uRailS.value !== built.flex.railS) {
            fail(`[${cls}] ${call}: flex opens at idle=${built.flex.idle}, `
              + `railS=${built.flex.railS} vs uRailS=${handle.uRailS.value} — `
              + 'the state object and the uniforms must start agreeing');
          }
          const gs = handle.uFlex2S?.value;
          if (whip && !(Number.isFinite(gs) && gs > 0 && gs < 1)) {
            fail(`[${cls}] ${call}: whip grip station uFlex2S is ${gs} — `
              + 'the cantilever clamp must be a station inside the cue');
          }
        }
      }
    }
    if (covered.size !== seen.size) {
      fail(`the rendered pass reached ${covered.size} of the ${seen.size} look `
        + 'objects the ledger gates — an id resolves to a look no id in this '
        + 'sweep builds, so a shipped class is unproven on the render path');
    }
    // THE WITNESS, READ. This is the half the two-list tie cannot do: it runs
    // after the builds, so what it reads is which comparisons executed on real
    // materials, not which names somebody typed. A name added to both lists
    // and to no comparison arrives here unwitnessed and goes red.
    if (!builds.length) {
      fail('no cue was built, so no comparison ran and the MAT_COMPARED '
        + 'witness below would pass vacuously — every exemption in that list '
        + 'would be granted on the strength of nothing having happened');
    } else {
      for (const p of MAT_COMPARED) {
        if (COMPARED_WITNESS.has(p)) continue;
        fail(`MAT_COMPARED names '${p}', which exempts it from the `
          + 'unledgered-parameter diff, but no comparison for it RAN during '
          + `the ${builds.length} builds above — the exemption is granted on `
          + 'the strength of the name alone. Two lists agreeing with each '
          + 'other is not a comparison: write one that reads the built '
          + `material, call witness('${p}') where it runs, or drop the name `
          + 'and let the unledgered diff do its job');
      }
      ok(`${MAT_COMPARED.length} MAT_COMPARED exemption(s) each backed by a `
        + 'comparison that ran on the built materials, not by a second list');
    }
    if (process.argv.includes('--pins')) {
      console.log('    const WANT_GLSL = {');
      for (const [k, v] of glslSeen) console.log(`      ${k}: '${v}',`);
      console.log('    };');
    }
    ok(`${builds.length} cue builds (${ids.length} catalog ids × the plain and `
      + `whip call shapes, all ${seen.size} look objects covered) by the real `
      + `buildCue, proven equal to the ledger per segment (${spins} drain `
      + 'macrotasks; untransformed group, segment geometry parameters AND '
      + 'vertex buffers + local pose AND world matrix against the station '
      + 'table, colour, roughness, effective metalness, map bytes + sampler + '
      + 'upload state, the material CLASS against a Standard baseline and '
      + 'every other value against a pristine of its own class, and the flex '
      + 'hook run against '
      + 'both a stub and the real ShaderLib.physical: vertex-only, pinned '
      + 'GLSL at its one live anchor, per-length literal, shared uniforms that '
      + `ARE the returned flex handle, own cache key); ledger tiers: `
      + `${MAT_PROPS.length} live, ${MAT_PROPS_HELD.length} held `
      + `(${MAT_PROPS_HELD.join(', ')}), ${heldWithRole.length} of them `
      + 'already carrying an apparatus role');
  } finally {
    shimmed();
  }
}

// ---- gate 4: the runtime validator REJECTS an out-of-envelope pack --------
{
  const bad = { ...looks.CUE_LOOK_DEFAULTS.dims, R_BUTT: 0.0180 };
  if (looks.lookDimsValid?.(bad) !== false) {
    fail('lookDimsValid must reject an over-envelope butt (0.0180)');
  }
  const tooLong = { ...looks.CUE_LOOK_DEFAULTS.dims, SHAFT_LEN: 1.2 };
  if (looks.lookDimsValid?.(tooLong) !== false) {
    fail('lookDimsValid must reject an over-length rod (1.657 m)');
  }
  ok('runtime validator rejects over-envelope packs (red-side proof)');
}

if (failures) {
  console.error(`check-cue-looks: ${failures} FAILURE(S)`);
  process.exit(1);
}
console.log('check-cue-looks: all gates green');
