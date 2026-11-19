// Copyright (c) Meta Platforms, Inc. and affiliates.

// test-club-core.mjs — node arm for the club look's core: the tier table, its cost rule and picker, the reflection
// service's configuration, the all-or-nothing shader text splice of material adoption, the lifecycle of index.js (build
// order, degrade, time budget, the curtain, show pass, refresh pass, studio parking, frame hook, the luminance probe, the
// fixed tier) driven with stand-in services, and, on the vendored three with no GL: the reflection service's capture policy
// (debounce, the install capture, studio parking, the lite tier's one capture, exclusion) and the asset loader (per-id cache,
// raw files, the texture cap). Run: node web/tools/club/test-club-core.mjs   (about 4 s: the arms wait out real debounces)
import assert from 'node:assert/strict';
import { TIERS, TIER_IDS, pickTier, pickTierInfo, autoTier, deviceFacts, knobsFor, extraSceneRenders, motionFor, audioFor, VENUES, VENUE_IDS, venueFor, venueKnobsOf, isArena, venueTierKnobs } from '../../scene/club/tiers.js';
import { CLUB_TUNE, toneMap } from '../../scene/club/post/tune.js';
import { GRADE_DEFAULTS, gradeColor } from '../../scene/club/post/gradelut.js';
import { CLOTH_TUNE } from '../../scene/club/mat/cloth/tune.js';
import { hemisphereMeans, ambientIrradiance, AMBIENT_AXES, AMBIENT_GLSL } from '../../scene/club/env/ambient.js';
import { envConfig } from '../../scene/club/env/config.js';
import { applyPatchText } from '../../scene/club/patchtext.js';

// 'three' under node: closed until the env section opens it onto the vendored file. A node_modules/three left in the
// checkout by another tool (tools/render/lib/ensure-three.mjs writes one) must not decide what these arms import.
// While the gate is closed, what index.js loads by itself (the shipped loader's assets.js and adopt.js, in the arm that
// drives it) fails on 'three', as meant. Node 22 keeps a module whose import failed and hands the same failure to every
// later import of it (node 24 and 26 try again): the arms after the gate import those modules too and died there under
// node 22, which is CI's. So a module index.js loads while the gate is closed, and everything loaded from it, gets an
// address of its own (`?three-closed`): the later imports are first imports on every node.
const nodeModule = await import('node:module');
const threeGate = { open: false, url: new URL('../../vendor/three.module.min.js', import.meta.url).href, index: null, refused: 0, plain: [], apart: [] };
const CLOSED_MARK = '?three-closed';
if (typeof nodeModule.registerHooks === 'function') {
  nodeModule.registerHooks({ resolve(specifier, context, next) {
    if (specifier === 'three') {
      if (!threeGate.open) {
        threeGate.refused += 1;
        if (!String(context.parentURL ?? '').endsWith(CLOSED_MARK)) threeGate.plain.push(String(context.parentURL));   // a module under its own address was refused: node 22 would keep that
        throw Object.assign(new Error("Cannot find package 'three' (closed until the env section)"), { code: 'ERR_MODULE_NOT_FOUND' });
      }
      return { url: threeGate.url, shortCircuit: true };
    }
    const found = next(specifier, context), parent = String(context.parentURL ?? '');
    const apart = parent.endsWith(CLOSED_MARK) || (!threeGate.open && threeGate.index !== null && parent === threeGate.index);
    if (!apart || !String(found.url).startsWith('file:') || String(found.url).includes('?')) return found;
    threeGate.apart.push(String(found.url).split('/scene/club/')[1] ?? String(found.url));
    return { ...found, url: `${found.url}${CLOSED_MARK}` };
  } });
}

// index.js must be importable with no window, no document and no three: it does nothing until installClub() runs
const before = Object.keys(globalThis).sort().join(',');
const { installClub, reasonForEvent, LIFECYCLE } = await import('../../scene/club/index.js');
assert.equal(Object.keys(globalThis).sort().join(','), before, 'importing club/index.js must not add a global');
threeGate.index = new URL('../../scene/club/index.js', import.meta.url).href;   // from here on: what index.js loads with the gate closed stands apart

let n = 0;
const ok = async (name, fn) => { await fn(); n += 1; console.log(`OK ${name}`); };
// the degrade paths warn on purpose; the arms assert on state() instead, so the lines are counted, not printed
let warned = 0;
console.warn = () => { warned += 1; };

await ok('tiers: three frozen tiers with one knob set', () => {
  assert.deepEqual([...TIER_IDS], ['lite', 'base', 'high']);
  const keys = Object.keys(TIERS.base).sort();
  for (const id of TIER_IDS) {
    assert.ok(Object.isFrozen(TIERS[id]), `${id} frozen`);
    assert.deepEqual(Object.keys(TIERS[id]).sort(), keys, `${id} has the same knobs as base`);
  }
});
await ok('tiers: the cost rule — no live cube capture on any tier, one extra scene render on high only, lite is the room and the grade', () => {
  for (const id of TIER_IDS) assert.equal(TIERS[id].envLive, false, `${id}: the live cube capture is off`);
  assert.deepEqual(TIER_IDS.map((id) => extraSceneRenders(TIERS[id])), [0, 0, 1]);
  assert.equal(extraSceneRenders({ envBox: true, floorMirror: true, envLive: true }), 2);
  assert.equal(extraSceneRenders({ envBox: false, floorMirror: true, envLive: true }), 0, 'neither runs without the reflection patch');
  assert.equal(extraSceneRenders(undefined), 0);
  const { lite, base, high } = TIERS;
  assert.deepEqual([lite.envBox, lite.floorMirror, lite.ao, lite.dof, lite.bloom, lite.smaa, lite.farTable, lite.roomDetail, lite.textureSize, lite.floorCoat],
    [false, false, 'off', 'off', false, false, false, 0, 1024, 0], 'lite adds the room and the grade, nothing else');
  assert.equal(lite.grade, true);
  // base is cheaper than high in every knob that costs: no mirror, the lens only at rest, less room detail. The screen-space
  // occlusion pass and SMAA are off on every tier since round 2 (post.js runs them only behind ?clubpost=ao:live / smaa:1):
  // the table says what runs
  assert.deepEqual([base.floorMirror, base.smaa, base.ao, base.dof], [false, false, 'off', 'still']);
  assert.deepEqual([high.floorMirror, high.smaa, high.ao, high.dof], [true, false, 'off', 'live']);
  for (const id of TIER_IDS) assert.deepEqual([TIERS[id].ao, TIERS[id].smaa], ['off', false], id);
  assert.ok(lite.roomDetail < base.roomDetail && base.roomDetail < high.roomDetail);
  for (const id of TIER_IDS) {
    const k = TIERS[id];
    assert.ok(k.floorCoat >= 0 && k.floorCoat <= 1 && k.floorCoatRoughness > 0 && k.floorCoatRoughness <= 1, `${id}: varnish knobs in range`);
    assert.ok(k.mirrorScale > 0 && k.mirrorScale <= 1, `${id}: mirror scale in range`);
    assert.ok(k.floorCoat === 0 || k.envBox === true, `${id}: a varnish needs the reflection patch`);
  }
});
await ok('env config: the tier knobs reach the reflection service; ?clubenv= overrides them for tools, inside bounds', () => {
  const q = (s) => new URLSearchParams(s);
  const pick = (c) => [c.box, c.live, c.mirror, c.mirrorScale, c.mirrorFull, c.coat, c.coatRoughness];
  assert.deepEqual(pick(envConfig(TIERS.high)), [true, false, true, 0.5, false, 1, 0.2]);
  assert.deepEqual(pick(envConfig(TIERS.base)), [true, false, false, 0.5, false, 1, 0.2]);
  assert.deepEqual(pick(envConfig(TIERS.lite)), [false, false, false, 0.5, false, 0, 0.2]);
  assert.deepEqual(envConfig(TIERS.high).overridden, []);
  assert.deepEqual(pick(envConfig(TIERS.high, q('clubenv=mirror:0,coat:0.4,coatr:0.1,live:1'))), [true, true, false, 0.5, false, 0.4, 0.1]);
  assert.deepEqual(envConfig(TIERS.high, q('clubenv=mirror:0,coat:0.4')).overridden, ['mirror', 'coat']);
  assert.deepEqual(pick(envConfig(TIERS.base, q('clubenv=mirror,mirrorfull'))), [true, false, true, 0.5, true, 1, 0.2], 'a bare name means on');
  assert.deepEqual(pick(envConfig(TIERS.high, q('clubenv=box:0,live:1,coat:1'))), [false, false, false, 0.5, false, 0, 0.2], 'without the patch nothing else runs');
  assert.deepEqual(pick(envConfig(TIERS.base, q('clubenv=coat:7,coatr:0'))), [true, false, false, 0.5, false, 1, 0.03], 'clamped');
  assert.deepEqual(pick(envConfig(TIERS.base, q('clubenv=coat:lots,coatr:,nonsense:4'))), [true, false, false, 0.5, false, 1, 0.2], 'junk is ignored');
  assert.deepEqual(pick(envConfig({ envBox: true, floorCoat: 0.5, floorCoatRoughness: 0.35, mirrorScale: 0.25, floorMirror: true })), [true, false, true, 0.25, false, 0.5, 0.35]);
  assert.deepEqual(pick(envConfig()), [false, false, false, 0.5, false, 0, 0.2], 'no knobs: everything off');
});
await ok('tiers: ?clubtier= forces a tier; unknown values do not', () => {
  const q = (s) => new URLSearchParams(s);
  const env = { matchMedia: () => ({ matches: false }), devicePixelRatio: 1, innerWidth: 1280 };
  assert.equal(pickTier({ query: q('clubtier=lite'), env }), 'lite');
  assert.equal(pickTier({ query: q('clubtier=high'), env }), 'high');
  assert.equal(pickTier({ query: q('clubtier=ultra'), env }), 'base');
});
await ok('tiers: the picker never answers high — phones, tablets, software and weak renderers are lite, every laptop and desktop is base', () => {
  const q = new URLSearchParams('');
  const fine = () => ({ matches: false }), coarse = (m) => ({ matches: m === '(pointer: coarse)' });
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
  const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  const gl = (name) => ({ capabilities: { maxTextureSize: 16384, isWebGL2: true }, extensions: { has: () => true }, getContext: () => ({ RENDERER: 7937, getParameter: (p) => (p === 7937 ? name : null), getExtension: () => null }) });
  const pick = (env, renderer) => pickTier({ query: q, env, renderer });
  // phones and tablets
  assert.equal(pick({ matchMedia: coarse, devicePixelRatio: 3, innerWidth: 390, navigator: { userAgent: PHONE, maxTouchPoints: 5, platform: 'iPhone' } }), 'lite');
  assert.equal(pick({ matchMedia: fine, navigator: { userAgent: ANDROID, maxTouchPoints: 5, platform: 'Linux armv81' } }), 'lite', 'an Android tablet with a mouse is still lite');
  assert.equal(pick({ matchMedia: fine, navigator: { userAgent: MAC, maxTouchPoints: 5, platform: 'MacIntel' } }), 'lite', 'an iPad that presents itself as a Mac (trackpad attached)');
  // laptops and desktops: base, whatever the display and the GPU
  const laptop = { matchMedia: fine, devicePixelRatio: 2, innerWidth: 1440, navigator: { userAgent: MAC, maxTouchPoints: 0, platform: 'MacIntel' } };
  assert.equal(pick(laptop, gl('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')), 'base', 'a dense display on an integrated GPU was high before this rule');
  assert.equal(pick({ matchMedia: fine, devicePixelRatio: 1, innerWidth: 2560, navigator: { userAgent: WIN, maxTouchPoints: 0, platform: 'Win32' } }, gl('ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)')), 'base', 'a desktop GPU is base too: high is asked for');
  assert.equal(pick({ matchMedia: fine, devicePixelRatio: 1.25, innerWidth: 1536, navigator: { userAgent: WIN, maxTouchPoints: 10, platform: 'Win32' } }, gl('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)')), 'base', 'a touch-screen laptop with a fine primary pointer');
  assert.equal(pick({ matchMedia: fine }), 'base', 'nothing readable: base');
  assert.equal(pick({}), 'base');
  // weak and software renderers
  assert.equal(pick(laptop, gl('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)')), 'lite');
  assert.equal(pick(laptop, gl('llvmpipe (LLVM 15.0.7, 256 bits)')), 'lite');
  assert.equal(pick(laptop, { capabilities: { maxTextureSize: 4096, isWebGL2: true } }), 'lite');
  assert.equal(pick(laptop, { capabilities: { maxTextureSize: 16384, isWebGL2: false } }), 'lite');
  assert.equal(pick(laptop, { capabilities: { maxTextureSize: 16384, isWebGL2: true }, extensions: { has: () => false } }), 'lite');
  assert.equal(pick({ ...laptop, navigator: { ...laptop.navigator, deviceMemory: 4 } }), 'lite');
  assert.equal(pick({ ...laptop, navigator: { ...laptop.navigator, deviceMemory: 8 } }), 'base');
  // no set of facts gives high, and the reason is reported
  for (const coarseP of [true, false, null]) for (const mem of [2, 8, 32, null]) for (const gpu of ['NVIDIA GeForce RTX 4090', 'Apple M3 Max', null]) {
    assert.notEqual(autoTier({ coarse: coarseP, memoryGB: mem, gpu, maxTextureSize: 16384, webgl2: true, floatBuffers: true }).tier, 'high');
  }
  const info = pickTierInfo({ query: q, env: laptop, renderer: gl('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)') });
  assert.deepEqual([info.tier, info.forced, info.why], ['base', false, 'default (high is opt-in)']);
  assert.match(info.facts.gpu, /Apple M2/);
  const forced = pickTierInfo({ query: new URLSearchParams('clubtier=high'), env: { matchMedia: coarse } });
  assert.deepEqual([forced.tier, forced.forced, forced.why], ['high', true, '?clubtier'], 'the opt-in');
  // a reader that throws decides nothing
  assert.equal(pick({ matchMedia: () => { throw new Error('no'); }, get navigator() { throw new Error('no'); } }), 'base');
  assert.equal(deviceFacts({ renderer: { getContext: () => { throw new Error('lost'); } }, env: {} }).gpu, null);
  // the masked constant makes the picker ask the debug extension; a full plain name does not
  let asked = 0;
  const masked = { capabilities: { maxTextureSize: 16384, isWebGL2: true }, getContext: () => ({ RENDERER: 7937, getParameter: (p) => (p === 7937 ? 'WebKit WebGL' : p === 37446 ? 'ANGLE (Intel, Mesa llvmpipe)' : null), getExtension: () => { asked += 1; return { UNMASKED_RENDERER_WEBGL: 37446 }; } }) };
  assert.equal(pick(laptop, masked), 'lite'); assert.equal(asked, 1);
});
await ok('tiers: the knobs this round added — lite has no texture above 1024 and half-size data maps, one anisotropy per tier, the far table plain below high', () => {
  const { lite, base, high } = TIERS;
  assert.deepEqual([lite.textureSize, lite.textureSizeData, lite.anisotropy], [1024, 512, 4]);
  assert.deepEqual([base.textureSize, base.textureSizeData, base.anisotropy], [1024, 512, 8], 'round 3: base binds no 2048 px room map');
  assert.deepEqual([high.textureSize, high.textureSizeData, high.anisotropy], [2048, 2048, 8]);
  assert.deepEqual([lite.farTable, base.farTable, high.farTable], [false, true, true]);
  assert.deepEqual([lite.farTableDetail, base.farTableDetail, high.farTableDetail], [0, 0, 1]);
  for (const id of TIER_IDS) { assert.equal(TIERS[id].envAmbient, true); assert.ok(TIERS[id].textureSizeData <= TIERS[id].textureSize); }
  // the pocket part's leather map (mat/pocket.js reads the knob, and falls back to "not lite" without it): the same answer
  assert.deepEqual([lite.pocketLeather, base.pocketLeather, high.pocketLeather], [false, true, true]);
  assert.deepEqual(knobsFor('base', new URLSearchParams('clubknobs=pocketLeather:0')).changed, ['pocketLeather']);
});
await ok('tiers: round 3 parity knobs — base takes the small room maps, the half atlas and the reduced round parts; high is as it was; per-id caps only where a close view magnifies', () => {
  const { lite, base, high } = TIERS;
  // per-id caps: only base has any: the rail veneer scans in full (a strip of them is all that is uploaded) and the leather's
  // colour below the colour cap; every other data map of base, the played table's two normal maps included, is 512 px
  assert.deepEqual([Object.keys(lite.textureSizes), Object.keys(high.textureSizes)], [[], []]);
  assert.deepEqual({ ...base.textureSizes }, { 'veneer.color': 2048, 'veneer.normal': 1024, 'leather.color': 512 });
  assert.ok(Object.isFrozen(base.textureSizes));
  for (const id of Object.keys(base.textureSizes)) assert.ok(!/^(floor|wall)\./.test(id), `${id}: no room surface is an exception`);
  assert.deepEqual([lite.roughRG, base.roughRG, high.roughRG], [true, true, false]);
  assert.deepEqual([lite.roomMaps, base.roomMaps, high.roomMaps], [0, 1, 2]);
  assert.deepEqual([lite.roomRound, base.roomRound, high.roomRound], [1, 1, 2], 'lite draws no more for a wall lamp than base');
  assert.deepEqual([lite.propsAtlasScale, base.propsAtlasScale, high.propsAtlasScale], [0.5, 0.5, 1]);
  assert.deepEqual([lite.propSegments, base.propSegments, high.propSegments], [0.5, 0.75, 1.4]);
  for (const id of TIER_IDS) assert.equal(TIERS[id].releaseHidden, true, id);
  // the tool pair of a knob: base as round 2 had it
  const r2 = knobsFor('base', new URLSearchParams('clubknobs=textureSize:2048,textureSizeData:2048,roomMaps:2,roomRound:2,propsAtlasScale:1,propSegments:1,roughRG:0,releaseHidden:0'));
  assert.deepEqual(r2.changed, ['textureSize', 'textureSizeData', 'roomMaps', 'roomRound', 'propsAtlasScale', 'propSegments', 'roughRG', 'releaseHidden']);
  assert.equal(r2.knobs.textureSizes, base.textureSizes, 'the per-id caps are not a ?clubknobs value (?clubtex= sets them)');
  assert.deepEqual(knobsFor('base', new URLSearchParams('clubknobs=textureSizes:4')).changed, []);
});
await ok('tiers: ?clubknobs= overrides single knobs for a tool, typed by the table; junk changes nothing', () => {
  const q = (s) => new URLSearchParams(s);
  assert.equal(knobsFor('base', null).knobs, TIERS.base);
  assert.equal(knobsFor('base', q('')).knobs, TIERS.base);
  assert.equal(knobsFor('nonsense', q('')).knobs, TIERS.base);
  const a = knobsFor('base', q('clubknobs=farTable:0,roomDetail:2,dof:off,textureSizeData:1024'));
  assert.deepEqual(a.changed, ['farTable', 'roomDetail', 'dof', 'textureSizeData']);
  assert.deepEqual([a.knobs.farTable, a.knobs.roomDetail, a.knobs.dof, a.knobs.textureSizeData, a.knobs.ao], [false, 2, 'off', 1024, 'off']);
  assert.ok(Object.isFrozen(a.knobs)); assert.equal(TIERS.base.farTable, true, 'the table itself is untouched');
  const b = knobsFor('high', q('clubknobs=notAKnob:1,dof:sometimes,roomDetail:-3,floorMirror:maybe,bloom,smaa:0'));
  assert.deepEqual(b.changed, [], 'unknown names, wrong words, negative numbers and values already in force change nothing');
  assert.equal(b.knobs, TIERS.high);
  assert.deepEqual(knobsFor('lite', q('clubknobs=bloom')).changed, ['bloom'], 'a bare boolean name means on');
  assert.equal(extraSceneRenders(knobsFor('high', q('clubknobs=floorMirror:0')).knobs), 0);
});
await ok('tiers: round 4 knobs — motion and audio per tier, the two switches, and what lite leaves out', () => {
  const q = (s) => new URLSearchParams(s);
  const { lite, base, high } = TIERS;
  assert.deepEqual([lite.motion, base.motion, high.motion], ['marks', 'full', 'full']);
  assert.deepEqual([lite.audio, base.audio, high.audio], ['sfx', 'full', 'full']);
  assert.deepEqual([lite.motionDust, base.motionDust, high.motionDust], [0, 64, 160], 'the dust budget: none on lite');
  assert.deepEqual([lite.motionMarks, base.motionMarks, high.motionMarks], [12, 32, 32], 'the marks part holds 32 records; lite draws at most 12');
  for (const id of TIER_IDS) assert.equal(extraSceneRenders(TIERS[id]), id === 'high' ? 1 : 0, `${id}: the motion and audio knobs add no scene render`);
  const pick = (m) => [m.dust, m.marks];
  assert.deepEqual(pick(motionFor(base)), [true, true]);
  assert.deepEqual(pick(motionFor(lite)), [false, true]);
  assert.match(motionFor(lite).why.dust, /off on this tier/);
  assert.deepEqual(pick(motionFor(base, q('clubmotion=off'))), [false, false]);
  assert.deepEqual(motionFor(base, q('clubmotion=off')).why, { dust: 'off by ?clubmotion', marks: 'off by ?clubmotion' });
  assert.deepEqual(pick(motionFor(base, q('clubmotion=nodust'))), [false, true]);
  assert.deepEqual(pick(motionFor(base, q('clubmotion=nomarks'))), [true, false]);
  assert.deepEqual(pick(motionFor(base, q('clubmotion=nodust,nomarks'))), [false, false]);
  assert.deepEqual(pick(motionFor(lite, q('clubmotion=dust'))), [true, true], 'a tool may ask for a part the tier leaves out');
  assert.deepEqual(pick(motionFor(lite, q('clubmotion=off,dust'))), [true, false], 'later words win');
  assert.deepEqual(pick(motionFor(base, q('clubmotion=junk,,NoDust'))), [false, true], 'junk is ignored; case does not matter');
  assert.deepEqual(pick(motionFor({ motion: 'off' })), [false, false]);
  assert.deepEqual(pick(motionFor({ motion: 'dust' })), [true, false]);
  assert.deepEqual(pick(motionFor(undefined)), [true, true], 'no knobs (a dev page): both parts');
  assert.deepEqual(pick(motionFor(base, { get() { throw new Error('no'); } })), [true, true], 'an unreadable query decides nothing');
  assert.deepEqual(audioFor(base), { mode: 'full', why: 'tier (audio: full)' });
  assert.equal(audioFor(lite).mode, 'sfx');
  assert.deepEqual(audioFor(base, q('clubaudio=off')), { mode: 'off', why: '?clubaudio' });
  assert.equal(audioFor(lite, q('clubaudio=full')).mode, 'full');
  assert.equal(audioFor(base, q('clubaudio=loud')).mode, 'full', 'an unknown word changes nothing');
  // iOS: off by default until the device listening check has passed; the tool switch still turns it on
  const iPhone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', platform: 'iPhone', touchPoints: 5 };
  const iPadAsMac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15', platform: 'MacIntel', touchPoints: 5 };
  const desktopMac = { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/151', platform: 'MacIntel', touchPoints: 0 };
  const android = { userAgent: 'Mozilla/5.0 (Linux; Android 15) Mobile', platform: 'Linux armv81', touchPoints: 5 };
  assert.equal(audioFor(base, null, iPhone).mode, 'off');
  assert.equal(audioFor(lite, null, iPadAsMac).mode, 'off');
  assert.equal(audioFor(base, q('clubaudio=full'), iPhone).mode, 'full', 'the switch turns it on for the device check');
  assert.equal(audioFor(base, null, desktopMac).mode, 'full');
  assert.equal(audioFor(lite, null, android).mode, 'sfx');
  assert.equal(audioFor(base, null, null).mode, 'full', 'no facts decide nothing');
  assert.equal(audioFor({ audio: 'nonsense' }).mode, 'full');
  assert.equal(audioFor(undefined).mode, 'full');
  // ?clubknobs= takes each string knob's own words only
  const k = knobsFor('base', q('clubknobs=motion:marks,audio:sfx,motionDust:32,dof:off'));
  assert.deepEqual(k.changed, ['motion', 'audio', 'motionDust', 'dof']);
  assert.deepEqual([k.knobs.motion, k.knobs.audio, k.knobs.motionDust, k.knobs.dof], ['marks', 'sfx', 32, 'off']);
  assert.deepEqual(knobsFor('base', q('clubknobs=motion:still,audio:live,dof:full,ao:sfx')).changed, [], 'a word of another knob is refused');
});
await ok('ambient cube: the hemisphere means of a synthetic capture — a uniform room, a lit ceiling, one bright wall; clamping; a black read-back', () => {
  // six 90-degree cameras looking along the axes, as a cube camera has them (negative field of view included for two of them)
  const N = 16;
  const look = (f, up, flip) => {
    const r = [up[1] * f[2] - up[2] * f[1], up[2] * f[0] - up[0] * f[2], up[0] * f[1] - up[1] * f[0]]; // right = up x back(-f) ... any right-handed frame will do
    const world = [r[0], r[1], r[2], 0, up[0], up[1], up[2], 0, -f[0], -f[1], -f[2], 0, 0, 0, 0, 1];
    const k = flip ? -1 : 1;
    return { world, projection: [k, 0, 0, 0, 0, k, 0, 0, 0, 0, -1, -1, 0, 0, -0.1, 0] };
  };
  const cams = [look([1, 0, 0], [0, 1, 0], true), look([-1, 0, 0], [0, 1, 0], true), look([0, 1, 0], [0, 0, 1], false), look([0, -1, 0], [0, 0, -1], false), look([0, 0, 1], [0, 1, 0], true), look([0, 0, -1], [0, 1, 0], false)];
  // a face's texels from a radiance function of the world direction, through the SAME camera matrices the reader gets
  const face = (cam, L) => {
    const buf = new Float32Array(N * N * 4), e = cam.world, P = cam.projection;
    for (let py = 0; py < N; py++) for (let px = 0; px < N; px++) {
      const x = ((px + 0.5) / N * 2 - 1) / P[0], y = ((py + 0.5) / N * 2 - 1) / P[5];
      const d = [x * e[0] + y * e[4] - e[8], x * e[1] + y * e[5] - e[9], x * e[2] + y * e[6] - e[10]];
      const n = Math.hypot(...d); const c = L(d.map((v) => v / n));
      buf.set([c[0], c[1], c[2], 1], (py * N + px) * 4);
    }
    return { world: e, projection: P, at: (i) => buf[i] };
  };
  const run = (L, max) => hemisphereMeans({ size: N, faces: cams.map((c) => face(c, L)), max });
  // the six cameras cover the sphere exactly once: the frame above is right-handed for each of them
  const uni = run(() => [0.5, 0.25, 0.125]);
  for (const v of uni.values) { assert.ok(Math.abs(v[0] - 0.5) < 1e-9 && Math.abs(v[1] - 0.25) < 1e-9 && Math.abs(v[2] - 0.125) < 1e-9, 'a uniform room: every hemisphere holds that radiance'); }
  // a lit upper half (radiance 2 where the direction points up): +y sees all of it, -y none, the four sides half
  const sky = run((d) => (d[1] > 0 ? [2, 2, 2] : [0, 0, 0])).values;
  assert.ok(Math.abs(sky[2][0] - 2) < 0.02 && sky[3][0] < 0.02, `up ${sky[2][0]} down ${sky[3][0]}`);
  for (const a of [0, 1, 4, 5]) assert.ok(Math.abs(sky[a][0] - 1) < 0.08, `side ${a}: ${sky[a][0]}`);
  // one bright wall on +x: the +x hemisphere takes most, -x nothing, and E(n) follows the normal
  const wall = run((d) => (d[0] > 0.6 ? [3, 2, 1] : [0, 0, 0])).values;
  assert.ok(wall[0][0] > 1.5 && wall[1][0] === 0 && wall[2][0] > 0.2 && wall[2][0] < wall[0][0], JSON.stringify(wall.map((v) => +v[0].toFixed(3))));
  assert.ok(Math.abs(wall[0][0] / wall[0][2] - 3) < 1e-6, 'colour is carried');
  const Ex = ambientIrradiance(wall, [1, 0, 0]), Eback = ambientIrradiance(wall, [-1, 0, 0]), Ediag = ambientIrradiance(wall, [Math.SQRT1_2, Math.SQRT1_2, 0]);
  assert.ok(Math.abs(Ex[0] - Math.PI * wall[0][0]) < 1e-9 && Eback[0] === 0 && Ediag[0] > 0 && Ediag[0] < Ex[0]);
  // the exact value for the lit upper half under a cosine lobe: E(+y) = PI * L
  assert.ok(Math.abs(ambientIrradiance(sky, [0, 1, 0])[0] - 2 * Math.PI) < 0.07);
  // one hot texel is clamped; a negative or NaN texel counts as black; an all-black read-back reports no energy
  const hot = run((d) => (d[1] > 0.999 ? [1e6, 1e6, 1e6] : [0.1, 0.1, 0.1]), 64).values;
  assert.ok(hot[2][0] < 2, `clamped: ${hot[2][0]}`);
  const bad = hemisphereMeans({ size: N, faces: cams.map((c) => ({ world: c.world, projection: c.projection, at: (i) => (i % 4 === 0 ? NaN : -1) })) });
  assert.equal(bad.energy, 0); assert.deepEqual(bad.values[0], [0, 0, 0]);
  assert.deepEqual(AMBIENT_AXES.map((a) => a.join(',')), ['1,0,0', '-1,0,0', '0,1,0', '0,-1,0', '0,0,1', '0,0,-1']);
  assert.match(AMBIENT_GLSL, /uniform vec3 uClubEnvAmb\[ 6 \];/); assert.match(AMBIENT_GLSL, /vec3 clubEnvAmbient\( vec3 n \)/);
});

const VS = 'void main() {\n#include <common>\n#include <begin_vertex>\n}';
const FS = '#include <common>\nvoid main() {\n#include <map_fragment>\n#include <opaque_fragment>\n}';
await ok('patch text: before / after / replace and pars land at their anchors', () => {
  const r = applyPatchText(VS, FS, {
    pars: 'uniform float uA;', vertexPars: 'varying vec3 vP;',
    apply: [
      { anchor: '#include <map_fragment>', mode: 'after', code: 'AFTER;' },
      { anchor: '#include <opaque_fragment>', mode: 'before', code: 'BEFORE;' },
      { stage: 'vertex', anchor: '#include <begin_vertex>', mode: 'replace', code: 'REPLACED;' },
    ],
  });
  assert.equal(r.ok, true);
  assert.equal(r.fs, '#include <common>\nuniform float uA;\nvoid main() {\n#include <map_fragment>\nAFTER;\nBEFORE;\n#include <opaque_fragment>\n}');
  assert.equal(r.vs, 'void main() {\n#include <common>\nvarying vec3 vP;\nREPLACED;\n}');
});
await ok('patch text: one missing anchor leaves both sources untouched (all or nothing)', () => {
  const r = applyPatchText(VS, FS, { pars: 'uniform float uA;', apply: [
    { anchor: '#include <map_fragment>', mode: 'after', code: 'AFTER;' },
    { anchor: '#include <not_there>', mode: 'after', code: 'X;' },
  ] });
  assert.equal(r.ok, false);
  assert.deepEqual(r.missed, ['#include <not_there>']);
  assert.equal(r.vs, VS); assert.equal(r.fs, FS);
});
await ok('patch text: "$" sequences in the code are inserted literally', () => {
  const r = applyPatchText(VS, FS, { apply: [{ anchor: '#include <map_fragment>', mode: 'replace', code: "a $& b $1 $$ c" }] });
  assert.ok(r.fs.includes('a $& b $1 $$ c'));
});

// ---- index.js lifecycle, with stand-in services ---------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FAST = { serviceTimeoutMs: 60, revealWaitMs: 80, refreshDelayMs: 5, tableWaitMs: 5, tableWaitTries: 4, firstFrameWaitMs: 40, curtainMaxMs: 400, settleFrames: 3, settleMs: 80, settleMaxMs: 2000 };
function rig({ studio = false, table = 'READY' } = {}) {
  const win = new EventTarget();
  win.__cinelight = studio;
  const frame = [];
  const calls = [];
  const state = { table };
  const ctx = {
    query: new URLSearchParams('clubtier=base'),
    machine: { on(evt, fn) { if (evt !== 'frame') throw new Error(`unknown hook event: ${evt}`); frame.push(fn); } },
    table: { status: () => ({ status: state.table }) },
    rebakeEnv: () => calls.push('app.rebakeEnv'),
  };
  // a stand-in service module: records create / show / rebuild / capture in `calls`
  const svc = (key, extra = {}) => () => ({
    [`make_${key}`]: async (club) => {
      calls.push(`create ${key}`);
      assert.ok(club.assets && club.adopt, 'assets and adopt exist before the first service is built');
      return { enabled: true, show: () => calls.push(`show ${key}`), rebuild: (why) => calls.push(`rebuild ${key} ${why}`), ...extra };
    },
  });
  const core = { './assets.js': { createAssets: () => ({ enabled: true, ready: async () => undefined, state: () => ({ requested: 0 }) }) },
    './adopt.js': { createAdopt: () => ({ enabled: true, state: () => ({ patched: 0 }) }) } };
  const load = async (file) => { if (core[file]) return core[file]; throw new Error(`no such module ${file}`); };
  const emit = (type, detail) => win.dispatchEvent(Object.assign(new Event(type), { detail }));
  const tick = (clock = 1, dt = 1 / 60) => { for (const fn of [...frame]) fn(clock, dt); };
  return { win, ctx, calls, state, svc, load, emit, tick };
}
const row = (key, mod) => [key, mod, `make_${key}`];

await ok('lifecycle: reasonForEvent maps the app events that change what the look baked, and nothing else', () => {
  assert.equal(reasonForEvent('ob:settings', { key: 'equipment' }), 'table');
  assert.equal(reasonForEvent('ob:settings', { key: 'game' }), 'table');
  assert.equal(reasonForEvent('ob:settings', { key: 'clothColor' }), 'cloth');
  assert.equal(reasonForEvent('ob:settings', { key: 'fixture' }), 'fixture');
  assert.equal(reasonForEvent('ob:settings', { key: 'brightness' }), 'brightness');
  assert.equal(reasonForEvent('ob:settings', { key: 'look' }), 'look');
  assert.equal(reasonForEvent('ob:settings', { key: 'volume' }), null);
  assert.equal(reasonForEvent('ob:settings', { key: 'toString' }), null);
  assert.equal(reasonForEvent('ob:settings', undefined), null);
  assert.equal(reasonForEvent('ob:relight'), 'light');
  assert.equal(reasonForEvent('ob:table-state', { status: 'READY' }), 'table');
  assert.equal(reasonForEvent('ob:table-state', { status: 'PENDING' }), null);
  assert.equal(reasonForEvent('ob:cinelight'), null);
  assert.equal(reasonForEvent('click'), null);
  assert.ok(Object.isFrozen(LIFECYCLE) && LIFECYCLE.serviceTimeoutMs > 0 && LIFECYCLE.revealWaitMs > 0);
});

await ok('lifecycle: services build in order, show in one pass after the build, and the club object keeps its shape', async () => {
  const r = rig();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', r.svc('room')), row('env', r.svc('env', { capture: (why) => r.calls.push(`capture ${why}`) })), row('occ', r.svc('occ'))] });
  assert.deepEqual(r.calls, ['create room', 'create env', 'create occ', 'show room', 'show env', 'show occ', 'capture install']);
  for (const k of ['enabled', 'tier', 'knobs', 'ctx', 'time', 'assets', 'adopt', 'room', 'env', 'occ', 'post', 'mat', 'onFrame', 'offFrame', 'ready', 'state']) {
    assert.ok(k in club, `club.${k} (CONTRACT.md section 2)`);
  }
  assert.equal(club.ready, true); assert.equal(club.shown, true); assert.equal(club.enabled, true);
  assert.equal(club.tier, 'base'); assert.equal(club.knobs, TIERS.base);
  assert.equal(r.win.__club, club, 'window.__club is published');
  await club.whenShown;
  const st = club.state();
  assert.deepEqual(JSON.parse(JSON.stringify(st)), st, 'state() is a plain JSON object');
  assert.equal(st.services.room.enabled, true); assert.equal(st.services.room.timedOut, false);
  assert.equal(st.life.shows, 3); assert.equal(st.life.captures, 1); assert.equal(st.life.revealWaited, 'settled');
  assert.deepEqual(st.errors, []);
});

await ok('lifecycle: a service that throws, a module that is missing and a factory that is absent leave stubs; the rest is built', async () => {
  const r = rig();
  const boom = () => ({ make_env: () => { throw new Error('env exploded'); } });
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', r.svc('room')), row('env', boom), row('occ', './not-there.js'), row('post', () => ({})), row('mat', r.svc('mat'))] });
  assert.equal(club.room.enabled, true); assert.equal(club.mat.enabled, true);
  assert.equal(club.env.enabled, false); assert.match(club.env.reason, /env exploded/);
  assert.equal(club.occ.enabled, false); assert.match(club.occ.reason, /no such module/);
  assert.equal(club.post.enabled, false); assert.match(club.post.reason, /has no make_post/);
  assert.equal(club.enabled, true); assert.equal(club.ready, true);
  const st = club.state();
  assert.equal(st.errors.length, 2, 'the throw and the missing module are recorded');
  // no reflection service: the capture the look itself caused falls back to the app's own re-bake
  assert.ok(r.calls.includes('app.rebakeEnv'));
});

await ok('lifecycle: a service that never finishes is skipped after its budget and adopted late; the others are not blocked', async () => {
  const r = rig();
  let release;
  const slow = () => ({ make_env: () => new Promise((resolve) => { release = () => resolve({ enabled: true, show: () => r.calls.push('show env (late)'), capture: (why) => r.calls.push(`capture ${why}`) }); }) });
  const t0 = Date.now();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', r.svc('room')), row('env', slow), row('occ', r.svc('occ'))] });
  assert.ok(Date.now() - t0 < 2000, 'install returns after the budget, not never');
  assert.equal(club.env.enabled, false); assert.match(club.env.reason, /not ready after 60 ms/);
  assert.equal(club.occ.enabled, true, 'the service after the slow one is built');
  assert.equal(club.state().services.env.timedOut, true);
  release(); await sleep(40);
  assert.equal(club.env.enabled, true, 'adopted when it arrives');
  assert.equal(club.state().services.env.late, true);
  assert.ok(r.calls.includes('show env (late)'));
  assert.ok(r.calls.includes('rebuild room late:env') && r.calls.includes('capture late:env'), `a late service triggers one refresh pass: ${r.calls.join(' | ')}`);
});

await ok('lifecycle: ?clubtimeout= sets the per-service budget inside its bounds', async () => {
  const budget = async (q) => {
    const r = rig();
    r.ctx.query = new URLSearchParams(q);
    return (await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [] })).state().life.budget.serviceTimeoutMs;
  };
  assert.equal(await budget('clubtimeout=60000'), 60000);
  assert.equal(await budget('clubtimeout=9999999'), 120000);
  assert.equal(await budget('clubtimeout=5'), FAST.serviceTimeoutMs, 'a value under one second is ignored');
  assert.equal(await budget('clubtimeout=soon'), FAST.serviceTimeoutMs);
  assert.equal(await budget(''), FAST.serviceTimeoutMs);
});

await ok('lifecycle: ?cluboff= leaves the named services unbuilt and says so', async () => {
  const r = rig();
  r.ctx.query = new URLSearchParams('clubtier=base&cluboff=env, post');
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', r.svc('room')), row('env', r.svc('env')), row('post', r.svc('post'))] });
  assert.deepEqual(r.calls.filter((c) => c.startsWith('create')), ['create room']);
  assert.equal(club.env.enabled, false); assert.equal(club.env.reason, 'off by ?cluboff');
  assert.equal(club.state().services.post.off, true);
  assert.deepEqual(club.state().errors, []);
});

await ok('lifecycle: the show pass waits (bounded) for the ready promises a service exposes', async () => {
  const r = rig();
  let done = false;
  const lightmap = { ready: sleep(30).then(() => { done = true; }) };
  const never = { ready: new Promise(() => {}) };
  const a = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', r.svc('room', { lightmap, show: () => r.calls.push(`show room done=${done}`) }))] });
  assert.ok(r.calls.includes('show room done=true'), 'show() runs after room.lightmap.ready');
  assert.equal(a.state().life.revealWaited, 'settled');
  const r2 = rig();
  const b = await installClub(r2.ctx, { ...FAST, window: r2.win, load: r2.load, services: [row('occ', r2.svc('occ', { table: never }))] });
  assert.equal(b.state().life.revealWaited, 'timeout', 'a promise that never settles does not hold the look');
  assert.equal(b.ready, true);
});

await ok('lifecycle: app events are coalesced into one rebuild pass and one capture', async () => {
  const r = rig();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', r.svc('room')), row('env', r.svc('env', { capture: (why) => r.calls.push(`capture ${why}`) })), row('occ', r.svc('occ'))] });
  r.calls.length = 0;
  r.emit('ob:settings', { key: 'brightness', commit: true });
  r.emit('ob:settings', { key: 'volume', commit: true });
  r.emit('ob:relight');
  r.emit('ob:settings', { key: 'brightness', commit: true });
  assert.deepEqual(r.calls, [], 'nothing runs inside the event');
  await sleep(30);
  assert.deepEqual(r.calls, ['rebuild room brightness+light', 'rebuild env brightness+light', 'rebuild occ brightness+light', 'capture brightness+light']);
  const st = club.state();
  assert.equal(st.life.refreshes, 1); assert.equal(st.life.lastRefresh, 'brightness+light');
  assert.equal(st.life.events['ob:settings'], 3); assert.equal(st.life.events['ob:relight'], 1);
  // an app event never falls back to the app's own re-bake (the app re-bakes for its own events)
  assert.ok(!r.calls.includes('app.rebakeEnv'));
  // a rebuild that throws is recorded and does not stop the pass
  club.room.rebuild = () => { throw new Error('room rebuild failed'); };
  r.calls.length = 0;
  club.refresh('manual');
  await sleep(30);
  assert.deepEqual(r.calls, ['rebuild env manual', 'rebuild occ manual', 'capture manual']);
  assert.ok(club.state().errors.some((e) => /room\.rebuild: room rebuild failed/.test(e)));
});

await ok('lifecycle: a reason that arrives while the look is building joins the first capture — one rebuild pass, one capture, made at once', async () => {
  const r = rig();
  const slowRoom = () => ({ make_room: async () => { r.calls.push('create room'); await sleep(20); return { enabled: true, rebuild: (why) => r.calls.push(`rebuild room ${why}`) }; } });
  const p = installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', slowRoom), row('env', r.svc('env', { capture: (why, o) => r.calls.push(`capture ${why}${o?.now === true ? ' now' : ''}`) }))] });
  await sleep(8);
  r.emit('ob:relight'); // the lighting leaf applies its rig during the boot
  const club = await p;
  await sleep(30);
  assert.deepEqual(r.calls.filter((c) => /^(rebuild|capture)/.test(c)), ['rebuild room light+install', 'rebuild env light+install', 'capture light+install now']);
  const st = club.state();
  assert.equal(st.life.captures, 1); assert.equal(st.life.refreshes, 1); assert.deepEqual(st.life.pending, []);
  assert.deepEqual(st.life.eventLog.map((e) => [e[0], e[3]]), [['ob:relight', 'build']]);
  // the same event after the show is its own pass
  r.calls.length = 0;
  r.emit('ob:relight');
  await sleep(30);
  assert.deepEqual(r.calls, ['rebuild room light', 'rebuild env light', 'capture light']);
});

await ok('lifecycle: a studio window parks the first capture and every refresh; the close runs them once', async () => {
  const r = rig({ studio: true });
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load,
    services: [row('room', r.svc('room')), row('env', r.svc('env', { capture: (why) => r.calls.push(`capture ${why}`) }))] });
  assert.ok(!r.calls.some((c) => c.startsWith('capture')), 'no capture inside a studio window');
  r.emit('ob:settings', { key: 'fixture', commit: true });
  await sleep(30);
  assert.ok(!r.calls.some((c) => c.startsWith('capture') || c.startsWith('rebuild')), 'parked');
  assert.ok(club.state().life.parked >= 1); assert.equal(club.state().life.studio, true);
  assert.deepEqual(club.state().life.pending, ['install', 'fixture']);
  r.win.__cinelight = false;
  r.emit('ob:cinelight');
  await sleep(30);
  assert.deepEqual(r.calls.filter((c) => c.startsWith('capture') || c.startsWith('rebuild')), ['rebuild room install+fixture', 'rebuild env install+fixture', 'capture install+fixture']);
  assert.deepEqual(club.state().life.pending, []);
});

await ok('lifecycle: a refresh waits while the table is PENDING and runs when it is READY', async () => {
  const r = rig({ table: 'PENDING' });
  const club = await installClub(r.ctx, { ...FAST, tableWaitTries: 1000, window: r.win, load: r.load, services: [row('occ', r.svc('occ'))] });
  r.calls.length = 0;
  r.emit('ob:settings', { key: 'equipment' });
  await sleep(40);
  assert.deepEqual(r.calls, [], 'no rebuild against a half-built table');
  assert.ok(club.state().life.tableWaits >= 1); assert.equal(club.state().life.tablePending, true);
  r.state.table = 'READY';
  r.emit('ob:table-state', { status: 'READY' });
  await sleep(40);
  assert.deepEqual(r.calls, ['rebuild occ table']);
});

await ok('lifecycle: the frame hook feeds onFrame, sets the shared clock, and a throwing hook is removed without reaching the app loop', async () => {
  const r = rig();
  const seen = [];
  const waitsForFrame = () => ({ make_occ: (club) => new Promise((resolve) => { club.onFrame(function once() { club.offFrame(once); resolve({ enabled: true }); }); }) });
  const p = installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('occ', waitsForFrame)] });
  await sleep(10); r.tick(0.5); // the frame hook is attached before the services are built
  const club = await p;
  assert.equal(club.occ.enabled, true, 'a create() that waits for a frame tick is served');
  const off = club.onFrame((clock, dt) => seen.push([clock, dt]));
  club.onFrame(() => { throw new Error('bad hook'); });
  assert.doesNotThrow(() => r.tick(2.5, 0.016));
  r.tick(3, 0.016);
  assert.deepEqual(seen, [[2.5, 0.016], [3, 0.016]]);
  assert.equal(club.time.value, 3);
  const st = club.state();
  assert.equal(st.life.frameErrors, 1); assert.equal(st.life.frameHooks, 1);
  off(); r.tick(4);
  assert.equal(seen.length, 2);
});

await ok('lifecycle: without assets.js and adopt.js the look still installs, on stand-ins that keep every consumer call legal', async () => {
  const r = rig();
  const fallback = { isTexture: true };
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: async (f) => { throw new Error(`offline: ${f}`); },
    services: [['room', () => ({ make: (c) => ({ enabled: true, got: c.assets.texture('floor.color', { fallback }), n: c.adopt.patchClass('cloth', { key: 'k' }) }) }), 'make']] });
  assert.equal(club.assets.enabled, false); assert.equal(club.adopt.enabled, false);
  assert.equal(club.room.got, fallback); assert.equal(club.room.n, 0);
  assert.deepEqual(club.adopt.find('cloth'), []);
  await club.assets.ready();
  assert.equal(club.ready, true); assert.equal(club.enabled, true);
  assert.equal(club.state().errors.length, 2);
});

// ---- the curtain: build hidden, then show ---------------------------------------------------------------------------
// A composer stand-in with the app composer's switch, and a loop that delivers frames the way main.js does (the 'frame' hook,
// then composer.render()). `drawn` is the time line: 'screen' / 'hidden' per frame, plus the marks the stand-in services push.
function stage(r, { everyMs = 2 } = {}) {
  const drawn = [];
  const composer = { renderToScreen: true, render() { drawn.push(this.renderToScreen ? 'screen' : 'hidden'); } };
  r.ctx.composer = composer;
  let on = false;
  const loop = async () => { while (on) { r.tick(); composer.render(); await sleep(everyMs); } };
  const mark = (key) => r.svc(key, { show: () => drawn.push(`show ${key}`) });
  const marked = (key, extra = {}) => () => ({ [`make_${key}`]: async () => { drawn.push(`create ${key}`); await sleep(6); return { enabled: true, show: () => drawn.push(`show ${key}`), ...extra }; } });
  return { composer, drawn, mark, marked, start() { on = true; loop(); }, stop() { on = false; } };
}

await ok('curtain: one tournament frame is delivered, then nothing reaches the screen until the whole look was shown and settled', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [
    row('room', s.marked('room')), row('env', s.marked('env', { capture: (why, o) => s.drawn.push(`capture ${why}${o?.now === true ? ' now' : ''}`) })), row('occ', s.marked('occ'))] });
  await sleep(10); s.stop();
  const d = s.drawn, at = (m) => d.indexOf(m);
  assert.ok(at('screen') >= 0 && at('screen') < at('create room'), `a tournament frame is on screen before the first service is built: ${d.join(' ')}`);
  const between = d.slice(at('create room'), at('capture install now') + 1);
  assert.ok(!between.includes('screen'), `no frame reaches the screen while the look is built and shown: ${between.join(' ')}`);
  assert.ok(between.includes('hidden'), 'frames are still rendered behind the curtain');
  assert.deepEqual(d.filter((m) => !/^(screen|hidden)$/.test(m)), ['create room', 'create env', 'create occ', 'show room', 'show env', 'show occ', 'capture install now'],
    'build, one show pass, then the first capture, made at once');
  const after = d.slice(at('capture install now') + 1);
  assert.deepEqual(after.slice(0, 4), ['hidden', 'hidden', 'hidden', 'screen'], `settleFrames hidden frames after the show, then the look: ${after.join(' ')}`);
  assert.ok(!after.slice(4).includes('hidden'), 'the curtain never goes up again');
  assert.equal(s.composer.renderToScreen, true, 'the switch is back as it was');
  const c = club.state().life.curtain;
  assert.deepEqual([c.state, c.why, c.firstFrame, c.settled, c.capped], ['down', 'settled', 'seen', 3, false]);
  assert.ok(c.framesBefore >= 1 && c.hidden >= 3 && c.upAtMs <= c.downAtMs);
  assert.equal(club.ready, true); assert.equal(club.shown, true);
  assert.ok(club.state().life.readyAtMs >= club.state().life.shownAtMs, 'ready follows the drop, not the show pass');
});

await ok('curtain: the show pass settles every service behind the curtain (settle(), or the one bridged name), before the first capture', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  const log = [];
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [
    row('room', r.svc('room', { show: () => log.push('show room'), settle: () => log.push('settle room') })),
    row('env', r.svc('env', { show: undefined, capture: (why) => log.push(`capture ${why}`) })),
    row('occ', r.svc('occ', { show: () => log.push('show occ'), settle: () => log.push('settle occ'), flush: () => log.push('occ.flush'), table: { ready: Promise.resolve() } })),
    row('post', r.svc('post', { show: () => log.push('show post'), dof: { snap: () => log.push('post.dof.snap') } }))] });
  s.stop();
  assert.deepEqual(log, ['show room', 'show occ', 'show post', 'settle room', 'settle occ', 'post.dof.snap', 'capture install'], 'occ.flush (a tool member that may bake in the task) is never called by the lifecycle');
  assert.equal(club.state().life.settles, 3);
  // a service with its own settle() is not bridged; a service without one is left alone
  const r2 = rig(); const log2 = [];
  await installClub(r2.ctx, { ...FAST, window: r2.win, load: r2.load, services: [
    row('occ', r2.svc('occ', { flush: () => log2.push('occ.flush'), table: { ready: new Promise(() => {}) } })),
    row('post', r2.svc('post', { settle: () => log2.push('settle post'), dof: { snap: () => log2.push('post.dof.snap') } }))] });
  assert.deepEqual(log2, ['settle post']);
  // ?clubtimeout= gives a slow renderer time for its hidden settle frames
  const r3 = rig(); r3.ctx.query = new URLSearchParams('clubtimeout=90000');
  const b = (await installClub(r3.ctx, { ...FAST, window: r3.win, load: r3.load, services: [] })).state().life.budget;
  assert.deepEqual([b.settleMs, b.settleMaxMs, b.curtainMaxMs, b.firstFrameWaitMs], [60000, 180000, 93000, 90000]);
  assert.deepEqual([LIFECYCLE.curtainMaxMs, LIFECYCLE.settleFrames, LIFECYCLE.settleMs, LIFECYCLE.settleMaxMs], [15000, 3, 600, 4000]);
  assert.ok(LIFECYCLE.curtainMaxMs >= LIFECYCLE.serviceTimeoutMs + 3000, 'one service may use its whole budget and the rest still shows behind the curtain');
});

await ok('curtain: a re-bake a service asks of the app during the hidden build is held; the show pass makes the one capture; after it a request goes through', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  let ctxSeen = null, later = null;
  const room = () => ({ make_room: async (club) => {
    ctxSeen = club.ctx;
    club.ctx.rebakeEnv(); club.ctx.rebakeEnv(); // what room.js does at its own show while no reflection service exists yet
    later = () => club.ctx.rebakeEnv();
    return { enabled: true };
  } });
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', room)] });
  s.stop();
  // no reflection service in this rig: the install capture falls back to the app's own re-bake, once
  assert.deepEqual(r.calls.filter((c) => c === 'app.rebakeEnv'), ['app.rebakeEnv'], 'two held, one made by the show pass');
  assert.equal(club.state().life.curtain.bakesHeld, 2);
  later();
  assert.equal(r.calls.filter((c) => c === 'app.rebakeEnv').length, 2, 'after the show pass a request is the real thing');
  // the services' ctx is the hand-over object behind one shadowed member: every other read falls through, live
  assert.notEqual(ctxSeen, r.ctx); assert.equal(Object.getPrototypeOf(ctxSeen), r.ctx);
  assert.equal(ctxSeen.table, r.ctx.table); r.ctx.added = 7; assert.equal(ctxSeen.added, 7);
  assert.deepEqual(Object.keys(ctxSeen), ['rebakeEnv'], 'nothing else is copied, and nothing is written on the app\'s object');
  assert.equal(r.ctx.rebakeEnv.name, 'rebakeEnv', 'the app\'s member is untouched');
  // without a curtain (no composer: dev pages) the app's object is handed on as it is and nothing is held
  const r2 = rig(); let ctx2 = null;
  const club2 = await installClub(r2.ctx, { ...FAST, window: r2.win, load: r2.load, services: [row('room', () => ({ make_room: async (c) => { ctx2 = c.ctx; c.ctx.rebakeEnv(); return { enabled: true }; } }))] });
  assert.equal(ctx2, r2.ctx); assert.equal(club2.state().life.curtain.bakesHeld, 0);
  assert.equal(r2.calls.filter((c) => c === 'app.rebakeEnv').length, 2, 'the room\'s own and the install capture');
});

await ok('curtain: a renderer whose frames are long gets one hidden frame after the show, then the look (slow), not a timer drop', async () => {
  // frames of 30 ms against a settle idle time of 20 ms and a settle cap of 25 ms: the idle timer fires after each frame,
  // which is not idleness; the cap ends the settle at the second frame hook
  const r = rig(); const s = stage(r, { everyMs: 0 });
  const busy = (ms) => { const t = Date.now(); while (Date.now() - t < ms) { /* a long frame */ } };
  const plain = s.composer.render;
  s.composer.render = function render() { plain.call(this); busy(30); };
  s.start();
  const club = await installClub(r.ctx, { ...FAST, settleFrames: 3, settleMs: 20, settleMaxMs: 25, window: r.win, load: r.load, services: [row('room', s.marked('room'))] });
  s.stop();
  const c = club.state().life.curtain;
  assert.deepEqual([c.state, c.why, c.capped], ['down', 'slow', false], JSON.stringify(c));
  assert.ok(c.settled >= 1 && c.settled < 3, `one hidden frame after the show pass was enough: ${c.settled}`);
  assert.deepEqual(club.state().errors, [], 'a slow settle is not an error: the look was complete');
  assert.ok(c.builtAtMs <= c.showDoneAtMs && c.showDoneAtMs <= c.downAtMs);
});

await ok('curtain: the cap bounds the build only — a show pass that ended inside it is never capped by slow settle frames; the work behind the curtain is counted', async () => {
  const r = rig(); const s = stage(r, { everyMs: 30 });
  // a renderer stand-in whose program list changes while the look builds (ids are what the count goes by)
  const programs = [{ id: 1 }, { id: 2 }, { id: 3 }];
  r.ctx.renderer = { info: { programs, memory: { textures: 10, geometries: 20 } } };
  const room = () => ({ make_room: async () => { programs.splice(0, 1); programs.push({ id: 4 }, { id: 5 }); r.ctx.renderer.info.memory.textures = 17; return { enabled: true }; } });
  s.start();
  // cap 60 ms; the build takes a few ms; eight settle frames of 30 ms each outlast the cap several times over
  const club = await installClub(r.ctx, { ...FAST, curtainMaxMs: 60, settleFrames: 8, settleMs: 200, settleMaxMs: 5000, window: r.win, load: r.load, services: [row('room', room)] });
  s.stop();
  const c = club.state().life.curtain;
  assert.deepEqual([c.state, c.why, c.capped, c.settled], ['down', 'settled', false, 8]);
  assert.ok(c.downAtMs - c.upAtMs > 60, 'the settle ran past the build cap, and that is fine');
  assert.deepEqual(club.state().errors, []);
  assert.deepEqual(c.under, { programsAtUp: 3, programsAtDown: 4, programsLinked: 2, texturesAtUp: 10, texturesAtDown: 17, geometriesAtUp: 20, geometriesAtDown: 20 });
});

await ok('curtain: ready and whenShown wait for the drop', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  let shownAt = null;
  const p = installClub(r.ctx, { ...FAST, settleFrames: 8, settleMs: 5000, window: r.win, load: r.load, services: [row('room', s.marked('room'))] });
  r.win.__club.whenShown.then(() => { shownAt = s.drawn.length; });
  for (let i = 0; i < 200 && r.win.__club.shown !== true; i++) await sleep(2);
  assert.equal(r.win.__club.shown, true); assert.equal(r.win.__club.ready, false, 'shown (the pass ran) but not yet ready: the curtain is still up');
  assert.equal(s.composer.renderToScreen, false);
  const club = await p; s.stop();
  assert.equal(club.ready, true); assert.equal(s.composer.renderToScreen, true);
  await sleep(0);
  assert.ok(shownAt !== null && s.drawn.slice(0, shownAt).filter((m) => m === 'hidden').length >= 8);
});

await ok('curtain: with no frame after the show (a hidden tab) a timer brings it down; with no frame at all the build still runs', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  const p = installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', s.marked('room', { show: () => { s.drawn.push('show room'); s.stop(); } }))] });
  const club = await p;
  let c = club.state().life.curtain;
  assert.deepEqual([c.state, c.why], ['down', 'timer']); assert.equal(s.composer.renderToScreen, true); assert.equal(club.ready, true);
  const r2 = rig(); const s2 = stage(r2); // the loop never starts
  const t0 = Date.now();
  const club2 = await installClub(r2.ctx, { ...FAST, window: r2.win, load: r2.load, services: [row('room', s2.marked('room'))] });
  c = club2.state().life.curtain;
  assert.deepEqual([c.state, c.why, c.firstFrame, c.framesBefore], ['down', 'timer', 'timeout', 0]);
  assert.ok(Date.now() - t0 >= FAST.firstFrameWaitMs, 'it waited for a first frame before it gave up on one');
  assert.equal(club2.room.enabled, true); assert.equal(s2.composer.renderToScreen, true);
});

await ok('curtain: one service that uses its whole budget does not trip the cap — the others build and the look shows whole, the late one arrives as one step', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  // budget 60 ms, cap 60 + 40: the room never finishes inside its budget; env and occ are built after it gave up
  const hung = () => ({ make_room: async () => { await sleep(160); s.drawn.push('room built late'); return { enabled: true, show: () => s.drawn.push('show room (late)') }; } });
  const club = await installClub(r.ctx, { ...FAST, serviceTimeoutMs: 60, curtainMaxMs: 100, window: r.win, load: r.load, services: [row('room', hung), row('env', s.marked('env')), row('occ', s.marked('occ'))] });
  const c = club.state().life.curtain;
  assert.deepEqual([c.capped, c.why], [false, 'settled'], JSON.stringify(c));
  const d = s.drawn, upTo = d.indexOf('show occ');
  assert.ok(upTo > 0 && !d.slice(d.indexOf('create env'), upTo).includes('screen'), 'nothing reached the screen between the first service and the show pass');
  assert.equal(club.room.enabled, false); assert.match(club.room.reason, /not ready after 60 ms/);
  await sleep(140); s.stop();
  assert.equal(club.room.enabled, true, 'adopted late'); assert.ok(d.includes('show room (late)'));
  assert.equal(club.state().services.room.late, true);
});

await ok('curtain: a build that outlasts the cap is shown as far as it is built, and state() says so', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  const slow = () => ({ make_env: async () => { s.drawn.push('create env'); await sleep(140); s.drawn.push('env built'); return { enabled: true }; } });
  const club = await installClub(r.ctx, { ...FAST, serviceTimeoutMs: 1000, curtainMaxMs: 50, window: r.win, load: r.load, services: [row('room', s.marked('room')), row('env', slow)] });
  s.stop();
  const d = s.drawn, c = club.state().life.curtain;
  assert.deepEqual([c.state, c.why, c.capped], ['down', 'cap', true]);
  assert.ok(d.slice(d.indexOf('create env'), d.indexOf('env built')).includes('screen'), 'frames reach the screen again after the cap');
  assert.ok(club.state().errors.some((e) => /curtain: the build outlasted 50 ms before its show pass ended/.test(e)));
  assert.equal(club.env.enabled, true); assert.equal(club.ready, true); assert.equal(s.composer.renderToScreen, true);
});

await ok('curtain: an install that fails after the curtain went up never leaves the screen held; no composer, no curtain', async () => {
  const r = rig(); const s = stage(r);
  s.start();
  let passes = 0;
  class Rows extends Array { [Symbol.iterator]() { passes += 1; if (passes === 2) throw new Error('rows broke'); return super[Symbol.iterator](); } }
  const rows = Rows.from([row('room', s.marked('room'))]);
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: rows });
  s.stop();
  assert.equal(club.enabled, false); assert.equal(club.ready, true);
  assert.equal(s.composer.renderToScreen, true, 'the switch is back');
  const r2 = rig();
  const club2 = await installClub(r2.ctx, { ...FAST, window: r2.win, load: r2.load, services: [row('room', r2.svc('room'))] });
  assert.equal(club2.state().life.curtain.state, 'none');
  // ?clubcurtain=0 (tools): the build is in plain sight
  const r4 = rig(); const s4 = stage(r4); r4.ctx.query = new URLSearchParams('clubtier=base&clubcurtain=0'); s4.start();
  const club4 = await installClub(r4.ctx, { ...FAST, window: r4.win, load: r4.load, services: [row('room', s4.marked('room'))] });
  s4.stop();
  assert.ok(!s4.drawn.includes('hidden'), 'no frame is held'); assert.deepEqual([club4.state().life.curtain.state, club4.state().life.curtain.off], ['none', true]);
  // a composer another holder already switched off is left as it was found
  const r3 = rig(); const s3 = stage(r3); s3.composer.renderToScreen = false; s3.start();
  await installClub(r3.ctx, { ...FAST, window: r3.win, load: r3.load, services: [row('room', s3.marked('room'))] });
  s3.stop();
  assert.equal(s3.composer.renderToScreen, false);
});

await ok('probe: the luminance of delivered frames is sampled only while it runs; black frames are counted; the composer is restored', async () => {
  const r = rig(); const s = stage(r);
  let grey = 120;
  const gl = { drawingBufferWidth: 100, drawingBufferHeight: 50, RGBA: 1, UNSIGNED_BYTE: 2, reads: 0,
    readPixels(x, y, w, h, f, t, buf) { this.reads += 1; assert.ok(x >= 0 && x < 100 && y >= 0 && y < 50); buf.set([grey, grey, grey, 255]); } };
  r.ctx.renderer = { getContext: () => gl, getRenderTarget: () => null, setRenderTarget() {} };
  r.ctx.query = new URLSearchParams('clubtier=base&clubprobe=400');
  const plain = s.composer.render;
  s.start();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', s.marked('room'))] });
  await sleep(10);
  let st = club.state().probe;
  assert.ok(st.on && st.held >= 3 && st.onScreen >= 2, `hidden and delivered frames are both listed: ${JSON.stringify([st.held, st.onScreen])}`);
  assert.equal(st.black, 0);
  const held = st.frames.filter((f) => f.held), seen = st.frames.filter((f) => !f.held);
  assert.ok(held.every((f) => f.lum === undefined) && seen.every((f) => f.lum.length === 9 && f.lum.every((v) => v === 120)));
  assert.deepEqual([...new Set(st.frames.map((f) => f.phase))], ['build', 'shown', 'ready'], 'each frame carries the phase it was drawn in');
  const firstShown = st.frames.findIndex((f) => !f.held && f.phase !== 'build');
  assert.ok(st.frames.slice(0, firstShown).some((f) => f.held), 'the first delivered frame of the look follows hidden frames');
  grey = 1; await sleep(8); grey = 120;
  st = club.state().probe;
  assert.ok(st.black >= 1 && st.blackShown >= 1 && st.frames.some((f) => f.black === true), 'a black frame after the show is caught');
  club.probe.stop(); s.stop();
  assert.equal(s.composer.render, plain, 'the composer has its own render back');
  const reads = gl.reads; s.composer.render();
  assert.equal(gl.reads, reads, 'nothing is read once the probe is off');
  // start(n) ends by itself after n frames
  assert.equal(club.probe.start(3), true);
  for (let i = 0; i < 5; i++) s.composer.render();
  assert.equal(club.state().probe.on, false); assert.equal(s.composer.render, plain); assert.equal(gl.reads, reads + 3 * 9);
  const bare = await installClub(rig().ctx, { ...FAST, load: r.load, services: [] });
  assert.equal(bare.probe.start(3), false, 'no composer: the probe says so'); assert.equal(bare.state().probe.error, 'no composer to probe');
});

await ok('tier: fixed for the page load — setTier is refused for any other tier and state() says how a tier is changed', async () => {
  const r = rig();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', r.svc('room'))] });
  assert.equal(club.setTier('base'), true);
  assert.equal(club.setTier('high'), false); assert.equal(club.setTier('nonsense'), false);
  assert.equal(club.tier, 'base'); assert.equal(club.knobs, TIERS.base);
  const st = club.state();
  assert.equal(st.tierChange.supported, false); assert.deepEqual(st.tierChange.asked, ['high', 'nonsense']); assert.deepEqual(st.tierChange.tiers, ['lite', 'base', 'high']);
  assert.match(st.tierChange.how, /reload/);
  assert.deepEqual(st.cost, { extraSceneRenders: 0 });
  assert.ok(!r.calls.some((c) => c.startsWith('rebuild')), 'nothing is rebuilt');
});

await ok('lifecycle: every dynamic import of the integrator\'s modules has a literal specifier; the default loader refuses a module it has no row for', async () => {
  const fs = await import('node:fs');
  const here = new URL('../../scene/club/', import.meta.url);
  const files = ['index.js', 'tiers.js', 'assets.js', 'motion.js', 'env.js', ...fs.readdirSync(new URL('env/', here)).filter((f) => f.endsWith('.js')).map((f) => `env/${f}`)];
  assert.ok(files.includes('env/config.js') && files.includes('env/glsl.js') && files.includes('env/mirror.js'));
  for (const f of files) {
    const text = fs.readFileSync(new URL(f, here), 'utf8');
    const sites = [...text.matchAll(/\bimport\s*\(\s*([^)]{0,60})/g)].map((m) => m[1]);
    for (const arg of sites) assert.match(arg, /^'\.{1,2}\/[A-Za-z0-9_./-]+'\s*$/, `${f}: import(${arg}) is not a literal relative specifier`);
    if (f === 'index.js') {
      assert.equal(sites.length, 10, 'index.js: one literal loader per module it may load (assets, adopt, the five services of rounds 1-3, motion and audio, the arena room)');
      assert.ok(sites.some((x) => x.trim() === "'./arena/room.js'") && sites.some((x) => x.trim() === "'./room.js'"), 'round A1: both rooms are loaded by literal specifiers');
      assert.ok(sites.some((x) => x.trim() === "'./motion.js'") && sites.some((x) => x.trim() === "'./audio.js'"), 'round 4: the motion and audio services are loaded by literal specifiers');
    } else if (f === 'motion.js') assert.deepEqual(sites.map((x) => x.trim()), ["'./motion/dust.js'", "'./motion/marks.js'"], 'motion.js: its two parts, by literal specifiers');
    else if (f === 'env.js') assert.deepEqual(sites.map((x) => x.trim()), ["'./env/hallcube.js'"], 'env.js: one dynamic import, the hall cube (round A7; asked for under the arena venue only), by a literal specifier');
    else assert.equal(sites.length, 0, `${f}: no dynamic import`);
  }
  // the shipped loader (no opts.load): a row that names a module outside the table leaves a stub and says why; nothing is imported
  const r = rig();
  const club = await installClub(r.ctx, { ...FAST, window: r.win, load: undefined, services: [['room', './somewhere-else.js', 'createRoom']] });
  assert.equal(club.room.enabled, false); assert.match(club.room.reason, /no loader for \.\/somewhere-else\.js/);
  assert.equal(club.ready, true);
});

// ---- round A1: venues (CONTRACT.md section 13.3) ---------------------------------------------------------------------------
await ok('venues: a frozen table of two rows with one member set; the club row holds the look\'s constants; unknown values are club', () => {
  assert.deepEqual([...VENUE_IDS], ['club', 'arena']); assert.ok(Object.isFrozen(VENUE_IDS) && Object.isFrozen(VENUES));
  const keys = Object.keys(VENUES.club).sort();
  for (const id of VENUE_IDS) {
    const v = VENUES[id];
    assert.ok(Object.isFrozen(v) && Object.isFrozen(v.grade), `${id} frozen`);
    assert.deepEqual(Object.keys(v).sort(), keys, `${id} has the same members as club`);
    assert.equal(v.id, id);
    for (const k of ['room', 'audioMax', 'grade', 'ambient']) assert.ok(k in v, `${id}.${k} (CONTRACT.md 13.3)`);
    assert.deepEqual(Object.keys(v.grade).sort(), ['exposure', 'params', 'strength']);
  }
  // club: what the look had before venues existed
  assert.deepEqual(VENUES.club, { id: 'club', room: './room.js', audioMax: 'full', ambient: 1, ambientTint: null, floor: 'wood', floorAlbedo: null,
    grade: { strength: CLUB_TUNE.grade.strength, exposure: CLUB_TUNE.grade.exposure, params: null }, bloom: null, falloff: null, textureSizes: null });
  // round A2: a venue's per-id texture caps by tier, laid over the tier's; the club row has none and the knobs are then the tier's row itself
  for (const id of TIER_IDS) {
    assert.equal(venueTierKnobs(TIERS[id], id, VENUES.club), TIERS[id], `club, ${id}: the tier's own knob object`);
    assert.equal(venueTierKnobs(TIERS[id], id, null), TIERS[id]); assert.equal(venueTierKnobs(TIERS[id], id, {}), TIERS[id]);
  }
  assert.equal(venueTierKnobs(TIERS.lite, 'lite', VENUES.arena), TIERS.lite); assert.equal(venueTierKnobs(TIERS.high, 'high', VENUES.arena), TIERS.high);
  const ab = venueTierKnobs(TIERS.base, 'base', VENUES.arena);
  assert.ok(ab !== TIERS.base && Object.isFrozen(ab) && Object.isFrozen(ab.textureSizes));
  assert.deepEqual(ab.textureSizes, { ...TIERS.base.textureSizes, 'arena.carpet.color': 512, 'arena.carpet.normal': 256, 'arena.drape.normal': 256 }, 'the tier\'s own caps stay; the venue adds its ids');
  assert.deepEqual({ ...ab, textureSizes: null }, { ...TIERS.base, textureSizes: null }, 'no other knob moves');
  for (const [tier, caps] of Object.entries(VENUES.arena.textureSizes)) {
    assert.ok(TIER_IDS.includes(tier));
    for (const [texId, px] of Object.entries(caps)) { assert.match(texId, /^arena\./, 'a venue caps only its own ids'); assert.ok(Number.isInteger(px) && px >= 64 && px <= 4096); }
  }
  assert.equal(venueTierKnobs(undefined, 'base', VENUES.arena), undefined, 'never throws');
  // round A2: the arena's own bloom (a tighter, stronger halo for narrow sources; the club's threshold) and the club's falloff
  assert.ok(Object.isFrozen(VENUES.arena.bloom));
  assert.deepEqual(Object.keys(VENUES.arena.bloom).sort(), ['radius', 'strength', 'threshold']);
  assert.equal(VENUES.arena.bloom.threshold, CLUB_TUNE.bloom.threshold, 'no lit surface of the hall may bloom: the threshold is the club\'s');
  assert.ok(VENUES.arena.bloom.radius < CLUB_TUNE.bloom.radius && VENUES.arena.bloom.strength > CLUB_TUNE.bloom.strength && VENUES.arena.bloom.strength <= 0.25);
  assert.equal(VENUES.arena.falloff, CLUB_TUNE.falloff);
  // arena: its own room, no room ambience, a matt floor, its own grade table at the club's exposure and strength
  const a = VENUES.arena;
  assert.equal(a.room, './arena/room.js'); assert.equal(a.audioMax, 'sfx'); assert.equal(a.floor, 'carpet'); assert.equal(a.ambient, 1);
  // the flat part of the cloth's ambient light is neutral in the hall (the club's is warm: mat/cloth/tune.js pool.tint)
  assert.deepEqual([...a.ambientTint], [1, 1, 1]); assert.ok(Object.isFrozen(a.ambientTint));
  assert.ok(CLOTH_TUNE.pool.tint[2] < CLOTH_TUNE.pool.tint[0], 'the club cloth\'s flat ambient term is warm: the value the arena replaces');
  // the carpet's stand-in reflectance: dark, near neutral, far under the plank floor's
  // (round A3, the albedo law, CONTRACT 15.2: the island's carpet is 0.13; the stand-in follows it)
  assert.ok(Object.isFrozen(a.floorAlbedo) && a.floorAlbedo.length === 3 && a.floorAlbedo.every((x) => x > 0.005 && x < 0.2));
  assert.ok(Math.max(...a.floorAlbedo) / Math.min(...a.floorAlbedo) < 1.5, 'near neutral');
  // the cost rule: a venue with a matt floor has no floor mirror, so the high tier adds no scene render there
  assert.deepEqual(TIER_IDS.map((id) => extraSceneRenders(TIERS[id], VENUES.arena)), [0, 0, 0]);
  assert.deepEqual(TIER_IDS.map((id) => extraSceneRenders(TIERS[id], VENUES.club)), [0, 0, 1]);
  assert.deepEqual(TIER_IDS.map((id) => extraSceneRenders(TIERS[id], null)), [0, 0, 1]);
  assert.equal(extraSceneRenders({ ...TIERS.high, envLive: true }, VENUES.arena), 1, 'the live cube capture (a tool knob) is still counted');
  assert.equal(a.grade.exposure, VENUES.club.grade.exposure, 'the bed is exposed the same in both venues');
  assert.equal(a.grade.strength, VENUES.club.grade.strength);
  assert.ok(Object.isFrozen(a.grade.params) && Object.isFrozen(a.grade.params.shadowTint) && Object.isFrozen(a.grade.params.highlightTint));
  // (round A2: `midTint` and `shadowLift` are the two venue-only parameters of post/gradelut.js gradeColor; the club's defaults have neither)
  // (round A3: `shadowLiftRange`, the two ends of the lift's ramp, is the third)
  for (const k of Object.keys(a.grade.params)) assert.ok(k in GRADE_DEFAULTS || k === 'midTint' || k === 'shadowLift' || k === 'shadowLiftRange', `arena grade parameter ${k} is one the grade table knows`);
  // the hand-over value
  assert.equal(venueFor('arena'), 'arena'); assert.equal(venueFor('club'), 'club');
  for (const junk of [undefined, null, '', 'ARENA', ' arena', 'tournament', 'green', 'toString', '__proto__', 5, {}, ['arena'], true]) assert.equal(venueFor(junk), 'club', `venueFor(${String(junk)})`);
  assert.equal(isArena({ venue: 'arena' }), true);
  for (const c of [undefined, null, {}, { venue: 'club' }, { venue: 'nonsense' }, { venueKnobs: VENUES.arena }]) assert.equal(isArena(c), false);
  assert.equal(venueKnobsOf({ venue: 'arena' }), VENUES.arena); assert.equal(venueKnobsOf({ venue: 'arena', venueKnobs: VENUES.arena }), VENUES.arena);
  assert.equal(venueKnobsOf({}), VENUES.club); assert.equal(venueKnobsOf(undefined), VENUES.club); assert.equal(venueKnobsOf({ venue: 'junk' }), VENUES.club);
  const own = { floor: 'carpet', audioMax: 'off' };
  assert.equal(venueKnobsOf({ venue: 'club', venueKnobs: own }), own, 'a dev page may hand its own row');
  assert.equal(venueKnobsOf({ get venue() { throw new Error('no'); } }), VENUES.club, 'never throws');
});

await ok('venues: the arena grade is its own (round A2) — cool blacks, slightly cool midtones, white whites, no crushed blacks; flatter than the club grade; greys keep their level', () => {
  const P = { ...GRADE_DEFAULTS, ...VENUES.arena.grade.params };
  assert.ok(P.contrast > 1 && P.contrast < GRADE_DEFAULTS.contrast, 'a little flatter than the club room (a dark hall is already contrasty)');
  assert.ok(P.saturation >= 1 && P.saturation < GRADE_DEFAULTS.saturation);
  const ratio = (c) => c[0] / c[2]; // red over blue of a graded neutral: > 1 warm, < 1 cool
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  // round A1's table, kept for the record and as the "before" of the round's pair (tools: post.grade.setLut(ARENA_A1))
  const ARENA_A1 = { ...GRADE_DEFAULTS, contrast: 1.10, saturation: 1.12, shadowSaturation: 0.94, highlightSaturation: 1.0, shadowTint: [0.96, 1.0, 1.05], highlightTint: [0.99, 1.0, 1.02] };
  for (const v of [0.002, 0.02, 0.18, 0.6, 1.5, 4, 12]) {
    const club = gradeColor([v, v, v], GRADE_DEFAULTS), arena = gradeColor([v, v, v], P), a1 = gradeColor([v, v, v], ARENA_A1);
    assert.ok(ratio(arena) <= 1.0 + 1e-9, `a neutral at ${v} is not warmed (red / blue ${ratio(arena).toFixed(4)})`);
    // restrained: a black is cool, not blue (red no lower than 0.6 of blue); a midtone is a little cool (0.88 to 0.95); a white is white
    if (v <= 0.02) assert.ok(ratio(arena) > 0.60 && ratio(arena) < 0.92, `a black at ${v} is cool, not blue (red / blue ${ratio(arena).toFixed(4)})`);
    else if (v <= 0.6) assert.ok(ratio(arena) > 0.88 && ratio(arena) < 0.97, `a midtone at ${v} is a little cool (red / blue ${ratio(arena).toFixed(4)})`);
    else if (v >= 4) assert.ok(ratio(arena) > 0.985, `a white at ${v} stays white (red / blue ${ratio(arena).toFixed(4)})`);
    if (v <= 0.6) assert.ok(ratio(arena) <= ratio(a1) + 1e-9, `at ${v} it is at least as cool as round A1's (whose highlights were a hair cool; these are neutral)`);
    if (v >= 0.6) assert.ok(ratio(club) > 1.02 && ratio(arena) < ratio(club), `at ${v} the club grade is warm and the arena grade is less warm`);
    // no crushed blacks: under the pivot the arena's level is never below round A1's, and deep shadows are lifted
    if (v < 0.18) assert.ok(lum(arena) >= lum(a1) * (1 - 1e-9), `at ${v} no darker than round A1's`);
    if (v <= 0.002) assert.ok(lum(arena) > lum(a1) * 1.3 && lum(arena) > lum(club) * 1.3, 'the deep shadows are lifted above both older grades');
    if (v >= 0.18) assert.ok(Math.abs(Math.log2(lum(arena) / lum(club))) < 0.25, `the level of a neutral at ${v} is within a quarter stop of the club grade's`);
  }
  assert.ok(P.shadowLift > 0 && P.shadowLift <= 3 && Object.isFrozen(VENUES.arena.grade.params.midTint));
  // Round A3: the toe. The tone curve the app uses (three's ACES filmic fit at the look's exposure) returns exactly zero
  // under a scene radiance of 0.0025 and level 7 of 255 at 0.01, where a camera's plain transfer shows 5 and 20: a hall
  // is mostly made of such radiances (a black body in light: 0.01 to 0.03; a drape: 0.005 to 0.02), and round A2's lift
  // (0.7 of a stop from 6 stops under the pivot down) left the lite tier with 7.7 % of the wide frame at or under level 2.
  // The grade now opens the deep end and leaves the carpet's anchor, the bed and every source where they were.
  {
    const lv = (v, p) => 255 * toneMap(gradeColor([v, v, v], p).map((x) => x * VENUES.arena.grade.exposure))[1];
    const A2 = { ...GRADE_DEFAULTS, contrast: 1.10, saturation: 1.18, shadowSaturation: 0.92, highlightSaturation: 1.0, shadowTint: [0.80, 1.0, 1.24], midTint: [0.955, 1.0, 1.05], highlightTint: [1, 1, 1], shadowLift: 0.7 };
    // never darker than round A2's grade anywhere, and equal to it from a radiance of 0.09 up (the carpet's anchor, the bed, the sources)
    for (const v of [0.0005, 0.001, 0.002, 0.004, 0.007, 0.01, 0.02, 0.03, 0.045, 0.06, 0.09, 0.135, 0.3, 1, 4]) {
      assert.ok(lv(v, P) >= lv(v, A2) - 1e-6, `at ${v} no darker than round A2's grade`);
      if (v >= 0.09) assert.ok(Math.abs(lv(v, P) - lv(v, A2)) < 0.5, `at ${v} the level is round A2's (${lv(v, P).toFixed(1)} against ${lv(v, A2).toFixed(1)})`);
    }
    if (Array.isArray(P.shadowLiftRange)) {
      // monotone, and never flat: one stop of radiance is at least 4 levels between 0.004 and 0.135
      for (let v = 0.004; v < 0.135; v *= 2) assert.ok(lv(2 * v, P) - lv(v, P) >= 4, `one stop up from ${v.toFixed(4)} is ${(lv(2 * v, P) - lv(v, P)).toFixed(1)} levels`);
      assert.ok(Object.isFrozen(VENUES.arena.grade.params.shadowLiftRange) && P.shadowLiftRange.length === 2 && P.shadowLiftRange[0] > P.shadowLiftRange[1] && P.shadowLiftRange[0] <= -0.5, 'the lift ends under the pivot: mid grey and everything over it keep their level');
      // the deep end is open: a radiance of 0.004 reads at least level 4, 0.01 at least 11, 0.02 at least 18 (round A2: 2, 7, 15)
      assert.ok(lv(0.004, P) >= 4 && lv(0.01, P) >= 11 && lv(0.02, P) >= 18, `the deep end: ${[0.004, 0.01, 0.02].map((v) => lv(v, P).toFixed(1)).join(', ')}`);
      // and still a black: a radiance of 0.001 stays under level 2, and 0.02 under 26 (a camera's plain transfer: 32)
      assert.ok(lv(0.001, P) < 2 && lv(0.02, P) < 26);
      // the range member alone moves nothing without a lift, and a venue without it keeps the ramp of round A2
      const noLift = { ...P, shadowLift: 0 };
      for (const v of [0.001, 0.01, 0.1]) assert.deepEqual(gradeColor([v, v, v], noLift), gradeColor([v, v, v], { ...noLift, shadowLiftRange: undefined }));
      assert.deepEqual(gradeColor([0.01, 0.01, 0.01], { ...A2, shadowLiftRange: [-2, -6] }), gradeColor([0.01, 0.01, 0.01], A2));
    }
  }
  // mid grey is the pivot of both grades: it is not moved in level by either
  assert.ok(Math.abs(lum(gradeColor([0.18, 0.18, 0.18], P)) / 0.18 - 1) < 0.02);
  // a saturated cloth green keeps its hue order; its saturation is no lower than ungraded and within 2 % of the club grade's
  // (the saturation parameter is under the club's; the cool midtone tint takes a little red out of a green or a blue)
  const g = [0.02, 0.18, 0.06], sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
  const ca = gradeColor(g, P), cc = gradeColor(g, GRADE_DEFAULTS);
  assert.ok(ca[1] > ca[2] && ca[2] > ca[0], 'green stays green');
  assert.ok(sat(ca) >= sat(g) - 1e-9 && sat(ca) <= sat(cc) + 0.02, 'saturation between the ungraded colour and the club grade (+ 2 %)');
  // the cloth's blue stays clean and a warm source stays warm: blue over red of a lit blue cloth is no lower than ungraded,
  // red over blue of an amber wash stays within 12 % of ungraded
  const blue = [0.03, 0.16, 0.42], amber = [0.5, 0.25, 0.06];
  const gb = gradeColor(blue, P), ga = gradeColor(amber, P);
  assert.ok(gb[2] / gb[0] >= blue[2] / blue[0], 'the cloth\'s blue is at least as clean');
  assert.ok(ga[0] > ga[1] && ga[1] > ga[2] && (ga[0] / ga[2]) / (amber[0] / amber[2]) > 0.88, 'the amber wash stays warm');
});

await ok('venues: the audio cap — the arena stops at sfx whatever the tier or the switch asks; the club row caps nothing', () => {
  const q = (s) => new URLSearchParams(s);
  const { lite, base, high } = TIERS;
  const iPhone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', platform: 'iPhone', touchPoints: 5 };
  assert.equal(audioFor(base, null, null, VENUES.arena).mode, 'sfx');
  assert.match(audioFor(base, null, null, VENUES.arena).why, /venue arena: capped at sfx \(asked: full, tier \(audio: full\)\)/);
  assert.equal(audioFor(high, null, null, VENUES.arena).mode, 'sfx');
  assert.equal(audioFor(base, q('clubaudio=full'), null, VENUES.arena).mode, 'sfx', '?clubaudio=full does not lift the cap this round');
  assert.match(audioFor(base, q('clubaudio=full'), null, VENUES.arena).why, /\?clubaudio/);
  assert.deepEqual(audioFor(lite, null, null, VENUES.arena), audioFor(lite, null, null), 'a mode at or under the cap is returned as it is');
  assert.deepEqual(audioFor(base, q('clubaudio=sfx'), null, VENUES.arena), { mode: 'sfx', why: '?clubaudio' });
  assert.deepEqual(audioFor(base, q('clubaudio=off'), null, VENUES.arena), { mode: 'off', why: '?clubaudio' });
  assert.equal(audioFor(base, null, iPhone, VENUES.arena).mode, 'off', 'iOS stays off');
  assert.equal(audioFor(base, q('clubaudio=full'), iPhone, VENUES.arena).mode, 'sfx');
  for (const knobs of [lite, base, high, undefined, { audio: 'nonsense' }]) for (const query of [null, q(''), q('clubaudio=full'), q('clubaudio=sfx'), q('clubaudio=off'), q('clubaudio=loud')]) for (const facts of [null, iPhone]) {
    assert.deepEqual(audioFor(knobs, query, facts, VENUES.club), audioFor(knobs, query, facts), 'the club row changes no answer');
    assert.deepEqual(audioFor(knobs, query, facts, null), audioFor(knobs, query, facts));
    assert.deepEqual(audioFor(knobs, query, facts, { audioMax: 'junk' }), audioFor(knobs, query, facts), 'an unknown cap caps nothing');
    assert.notEqual(audioFor(knobs, query, facts, VENUES.arena).mode, 'full');
  }
});

await ok('venues: the audio service itself — under arena it never plays the room: not from the tier, not from ?clubaudio=full, not from set({ mode }); club is as it was', async () => {
  const { createAudio } = await import('../../scene/club/audio.js');
  const target = () => { const map = new Map(); return { addEventListener(t, fn) { if (!map.has(t)) map.set(t, new Set()); map.get(t).add(fn); }, removeEventListener(t, fn) { map.get(t)?.delete(fn); } }; };
  const made = [];
  const make = async (venue, query = '', knobs = TIERS.base) => {
    const club = { knobs, ctx: { query: new URLSearchParams(`clubaudioseed=7${query ? `&${query}` : ''}`), machine: { state: 'AIM', on: () => () => {} }, game: { shotIndex: 0 } }, onFrame() {}, offFrame() {} };
    if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
    // no gesture ever comes in this arm, so no audio context is made (the constructor would say so)
    const svc = await createAudio(club, { window: target(), document: target(), navigator: {}, AudioContext: function Ctx() { made.push('context'); throw new Error('no context in this arm'); }, OfflineAudioContext: function Offline() {},
      now: () => 0, setInterval: () => 1, clearInterval() {}, render: async () => ({ version: 1, bytes: 0, failed: [] }) });
    return svc;
  };
  const a = await make('arena');
  assert.equal(a.enabled, true); assert.equal(a.state().mode, 'sfx', 'base tier asks for full: the hall stops at sfx'); assert.equal(a.state().venueMax, 'sfx');
  assert.equal((await make('arena', 'clubaudio=full')).state().mode, 'sfx', '?clubaudio=full does not lift the cap');
  assert.equal((await make('arena', 'clubaudio=sfx')).state().mode, 'sfx');
  assert.equal((await make('arena', 'clubaudio=off')).enabled, false, 'off stays off (nothing is built)');
  assert.equal((await make('arena', '', TIERS.lite)).state().mode, 'sfx');
  assert.equal(a.set({ mode: 'full' }), false, 'set({ mode: full }) changes nothing under the cap'); assert.equal(a.state().mode, 'sfx');
  assert.equal(a.set({ mode: 'off' }), true); assert.equal(a.state().mode, 'off');
  assert.equal(a.set({ mode: 'full' }), true, 'from off, full is taken as the cap'); assert.equal(a.state().mode, 'sfx');
  a.dispose();
  for (const venue of ['club', undefined]) {
    const c = await make(venue);
    assert.equal(c.state().mode, 'full'); assert.ok(!('venueMax' in c.state()), 'no venue member in the club state');
    assert.equal(c.set({ mode: 'sfx' }), true); assert.equal(c.set({ mode: 'full' }), true); assert.equal(c.state().mode, 'full');
    assert.equal((await make(venue, 'clubaudio=full', TIERS.lite)).state().mode, 'full');
    c.dispose();
  }
  assert.deepEqual(made, [], 'no audio context was made');
});

await ok('venues: the seams as text and as behaviour — main.js reads both look ids into one hand-over; the settings reload offer covers arena exactly as it covers club', async () => {
  const fs = await import('node:fs');
  const app = new URL('../../app/', import.meta.url);
  const main = fs.readFileSync(new URL('main.js', app), 'utf8'), settings = fs.readFileSync(new URL('settings.js', app), 'utf8');
  // main.js: the boot-look read, run as text over a query and a stored profile (the lines between the two markers)
  const from = main.indexOf("let bootLook = 'tournament';"), to = main.indexOf('// Boot LIGHTING');
  assert.ok(from > 0 && to > from, 'the boot-look block is where it was');
  const block = main.slice(from, to);
  const boot = (query, stored, scripted = false) => new Function('bootQ', 'localStorage', 'scripted', 'SETTINGS_KEY', `${block}; return { bootLook, bootClub, venue: bootClub ? bootVenue : null };`)(
    new URLSearchParams(query), { getItem: () => (stored === undefined ? null : JSON.stringify({ look: stored })) }, scripted, 'k');
  assert.deepEqual(boot('look=arena'), { bootLook: 'tournament', bootClub: true, venue: 'arena' });
  assert.deepEqual(boot('look=club'), { bootLook: 'tournament', bootClub: true, venue: 'club' });
  assert.deepEqual(boot('look=arena', 'green', true), { bootLook: 'tournament', bootClub: true, venue: 'arena' }, 'the query wins over the stored value and the boot kind');
  assert.deepEqual(boot('', 'arena'), { bootLook: 'tournament', bootClub: true, venue: 'arena' });
  assert.deepEqual(boot('', 'club'), { bootLook: 'tournament', bootClub: true, venue: 'club' });
  assert.deepEqual(boot('', 'arena', true), { bootLook: 'green', bootClub: false, venue: null }, 'a scripted boot does not read the profile');
  for (const [q, st] of [['', undefined], ['', 'tournament'], ['look=tournament', 'arena'], ['look=sp', 'club'], ['look=ARENA', undefined], ['look=arena2', undefined]]) {
    const b = boot(q, st);
    assert.deepEqual([b.bootLook, b.bootClub, b.venue], ['tournament', false, null], `?${q} stored ${st}: the tournament look, no leaf`);
  }
  assert.deepEqual(boot('look=green', 'arena'), { bootLook: 'green', bootClub: false, venue: null });
  assert.deepEqual(boot('', 'green'), { bootLook: 'green', bootClub: false, venue: null });
  assert.match(main, /club: bootClub \? \{ room, table, rebakeEnv, query: bootQ, venue: bootVenue \} : null/);
  // settings.js: the sanitizer keeps both ids, and no other
  assert.match(settings, /if \(saved\.look === 'club' \|\| saved\.look === 'arena'\) v\.look = saved\.look;/);
  // the reload offer, run as text: every (look at boot, new value) pair, pinned and not
  const at = settings.indexOf('async function clubLookReload(value) {');
  let depth = 0, end = -1;
  for (let i = settings.indexOf('{', at); i < settings.length; i++) { if (settings[i] === '{') depth += 1; else if (settings[i] === '}') { depth -= 1; if (depth === 0) { end = i + 1; break; } } }
  assert.ok(at > 0 && end > at);
  const AsyncFunction = (async () => {}).constructor;
  const offer = async (atBoot, value, search = '') => {
    let confirms = 0, reloads = 0;
    const run = new AsyncFunction('clubStoredAtBoot', 'location', 'window', 't', `${settings.slice(at, end)}; await clubLookReload(${JSON.stringify(value)});`);
    await run(atBoot, { search, reload: () => { reloads += 1; } }, { confirm: () => { confirms += 1; return true; } }, (k) => k);
    assert.equal(reloads, confirms, 'a confirmed offer reloads');
    return confirms;
  };
  // rows: the look this page shows (false = tournament or green), the new value, offered here?
  const rows = [
    [false, 'arena', 1], [false, 'club', 1], [false, 'tournament', 0], [false, 'green', 0],
    ['arena', 'arena', 0], ['arena', 'tournament', 1], ['arena', 'club', 1], ['arena', 'green', 0], // -> green is main.js's own offer
    ['club', 'club', 0], ['club', 'tournament', 1], ['club', 'arena', 1], ['club', 'green', 0],
  ];
  for (const [atBoot, value, want] of rows) {
    assert.equal(await offer(atBoot, value), want, `page shows ${atBoot || 'no leaf'}, new value ${value}`);
    assert.equal(await offer(atBoot, value, '?look=arena'), 0, 'a URL that pins a look gets no offer');
  }
  assert.match(settings, /clubStoredAtBoot = values\.look === 'club' \|\| values\.look === 'arena' \? values\.look : false/);
  // the offer is reached through ctx: other suites stage the look handler in a vm context with a closed name list, so the
  // handler takes no new free name (the only `clubLookReload(` in the file is the definition)
  assert.match(settings, /if \(key === 'look'\) \{ ctx\.applyLook\?\.\(value\); ctx\.clubLookReload\?\.\(value\); \}/);
  assert.match(settings, /^  const values = load\(\); clubStoredAtBoot = [^;]+; ctx\.clubLookReload = clubLookReload;/m); // inside createSettings: the module's top level stays declarations only
  assert.equal(settings.split('clubLookReload(').length - 1, 1);
  // the stored-value entry: built in script for the stored id only, with its own label key
  assert.match(settings, /clubOption\.value = v\.look;/);
  assert.match(settings, /clubOption\.dataset\.i18n = v\.look === 'arena' \? 'settings\.lookArena' : 'settings\.lookClub'/);
  for (const l of ['en', 'de', 'fr', 'es', 'ja', 'ko', 'zh-CN']) {
    const loc = JSON.parse(fs.readFileSync(new URL(`locales/${l}.json`, app), 'utf8'));
    assert.ok(typeof loc['settings.lookArena'] === 'string' && loc['settings.lookArena'].trim().length > 0, `${l}: settings.lookArena`);
    assert.notEqual(loc['settings.lookArena'], loc['settings.lookClub'], `${l}: its own label`);
    if (l !== 'en') assert.notEqual(loc['settings.lookArena'], 'Tournament arena', `${l}: translated`);
  }
  assert.equal(JSON.parse(fs.readFileSync(new URL('locales/en.json', app), 'utf8'))['settings.lookArena'], 'Tournament arena');
});

await ok('venues: the switch — the hand-over names the venue; arena builds the room from arena/room.js, everything else from room.js', async () => {
  const mods = (r, loaded) => ({
    './room.js': { createRoom: async () => { r.calls.push('create club room'); return { enabled: true, which: 'club' }; } },
    './arena/room.js': { createRoom: async () => { r.calls.push('create arena room'); return { enabled: true, which: 'arena' }; } },
    './env.js': { createEnv: async (club) => { r.calls.push(`create env (venue ${club.venue}, room ${club.room.which})`); return { enabled: true, capture() {} }; } },
    loaded,
  });
  const install = async (venue, extra = {}) => {
    const r = rig();
    if (venue !== undefined) r.ctx.venue = venue;
    const loaded = [], m = mods(r, loaded);
    const load = async (file) => { loaded.push(file); if (m[file]) return m[file]; return r.load(file); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load, services: [['room', './room.js', 'createRoom'], ['env', './env.js', 'createEnv']], ...extra });
    return { r, club, loaded };
  };
  {
    const { r, club, loaded } = await install('arena');
    assert.equal(club.venue, 'arena'); assert.equal(club.venueKnobs, VENUES.arena);
    assert.equal(club.room.which, 'arena'); assert.ok(loaded.includes('./arena/room.js')); assert.ok(!loaded.includes('./room.js'), 'the club room is not even fetched');
    assert.deepEqual(r.calls.filter((c) => c.startsWith('create')), ['create arena room', 'create env (venue arena, room arena)'], 'the venue is known before the first service is built');
    const st = club.state();
    assert.equal(st.venue, 'arena'); assert.equal(st.venueKnobs.room, './arena/room.js'); assert.equal(st.venueKnobs.audioMax, 'sfx');
    assert.deepEqual(JSON.parse(JSON.stringify(st)), st, 'state() stays a plain JSON object');
    assert.deepEqual(st.errors, []);
    // round A2: the knobs the services read carry the venue's texture caps of the picked tier (the base tier has one)
    assert.deepEqual(club.knobs, venueTierKnobs(TIERS[club.tier], club.tier, VENUES.arena));
    if (club.tier === 'base') assert.equal(club.knobs.textureSizes['arena.carpet.color'], 512);
  }
  for (const venue of ['club', undefined, null, 'nonsense', 'ARENA', 7]) {
    const { club, loaded } = await install(venue);
    assert.equal(club.venue, 'club', `hand-over venue ${String(venue)}`); assert.equal(club.venueKnobs, VENUES.club);
    assert.equal(club.room.which, 'club'); assert.ok(!loaded.includes('./arena/room.js'), 'the arena room is never requested under club');
    assert.equal(club.state().venue, 'club');
    assert.equal(club.knobs, TIERS[club.tier], 'club: the knobs are the tier\'s own row (no venue cap is laid over it)');
  }
  // a dev page or an arm may name the venue in opts; the hand-over wins when both are given
  assert.equal((await install(undefined, { venue: 'arena' })).club.venue, 'arena');
  assert.equal((await install('club', { venue: 'arena' })).club.venue, 'club');
  // only the row that names the club room's module is swapped: a stand-in room handed by a dev page is left alone
  {
    const r = rig(); r.ctx.venue = 'arena';
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', r.svc('room'))] });
    assert.equal(club.venue, 'arena'); assert.equal(club.room.enabled, true); assert.ok(r.calls.includes('create room'));
  }
});

await ok('venues: an arena room that is missing, throws or never finishes is a stub — the app room stays and the other services are built', async () => {
  const envMod = (r) => ({ createEnv: async (club) => { r.calls.push(`create env (room enabled: ${club.room.enabled})`); return { enabled: true, capture: (why) => r.calls.push(`capture ${why}`) }; } });
  const services = [['room', './room.js', 'createRoom'], ['env', './env.js', 'createEnv']];
  {
    // missing: the module is not in the tree
    const r = rig(); r.ctx.venue = 'arena';
    const load = async (file) => { if (file === './env.js') return envMod(r); if (file === './arena/room.js') throw Object.assign(new Error("Cannot find module './arena/room.js'"), { code: 'ERR_MODULE_NOT_FOUND' }); return r.load(file); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load, services });
    assert.equal(club.room.enabled, false); assert.match(club.room.reason, /arena\/room\.js/);
    assert.equal(club.env.enabled, true); assert.equal(club.ready, true); assert.equal(club.enabled, true);
    assert.ok(r.calls.includes('create env (room enabled: false)'));
    assert.ok(club.state().notes.some((x) => /^room: off/.test(x)), 'state().notes says the room is off');
    assert.ok(!r.calls.includes('app.rebakeEnv'), 'no room of the look: no capture is asked of the app on its behalf');
  }
  {
    // the factory throws
    const r = rig(); r.ctx.venue = 'arena';
    const load = async (file) => { if (file === './env.js') return envMod(r); if (file === './arena/room.js') return { createRoom: () => { throw new Error('hall fell down'); } }; return r.load(file); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load, services });
    assert.equal(club.room.enabled, false); assert.match(club.room.reason, /hall fell down/); assert.equal(club.env.enabled, true); assert.equal(club.ready, true);
  }
  {
    // never finishes: skipped after its budget
    const r = rig(); r.ctx.venue = 'arena';
    const load = async (file) => { if (file === './env.js') return envMod(r); if (file === './arena/room.js') return { createRoom: () => new Promise(() => {}) }; return r.load(file); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load, services });
    assert.equal(club.room.enabled, false); assert.match(club.room.reason, /not ready after 60 ms/); assert.equal(club.env.enabled, true); assert.equal(club.ready, true);
  }
  {
    // the module has no createRoom
    const r = rig(); r.ctx.venue = 'arena';
    const load = async (file) => { if (file === './env.js') return envMod(r); if (file === './arena/room.js') return {}; return r.load(file); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load, services });
    assert.equal(club.room.enabled, false); assert.match(club.room.reason, /has no createRoom/); assert.equal(club.ready, true);
  }
});

await ok('lifecycle: installClub never rejects, even with no context at all', async () => {
  const club = await installClub(undefined, { ...FAST, load: async () => { throw new Error('nothing'); }, services: [] });
  assert.equal(club.ready, true);
  assert.equal(typeof club.state().tier, 'string');
});

// ---- env.js: the capture policy, the lite path and exclusion, on real three objects with no GL --------------------------
// env.js imports 'three' through the page's import map; under node a resolve hook points the bare name at the vendored file.
// (node:module registerHooks: node 22.15+. Without it these arms are skipped and say so.)
if (typeof nodeModule.registerHooks === 'function') {
  // the closed part really was closed: the shipped loader asked for its two fixed modules, both were refused 'three',
  // and both stand apart from the modules the arms below import
  assert.ok(threeGate.refused >= 2, `three was refused ${threeGate.refused} times while the gate was closed`);
  assert.deepEqual(threeGate.plain, [], 'a module that was refused three while the gate was closed keeps that failure under node 22: it must stand apart');
  assert.ok(threeGate.apart.includes('assets.js') && threeGate.apart.includes('adopt.js'), `loaded apart: ${threeGate.apart.join(', ')}`);
  threeGate.open = true;
  const THREE = await import('three');
  const { createEnv } = await import('../../scene/club/env.js');
  const envRig = async ({ tier = 'base', query = '', studio = false, assets = null, materials = [], renderer = { standIn: true }, venue = undefined } = {}) => {
    const win = new EventTarget(); win.__cinelight = studio;
    const scene = new THREE.Scene();
    const bakes = [], frame = [], patched = [];
    const club = { tier, knobs: TIERS[tier], assets, room: { enabled: false }, onFrame: (fn) => frame.push(fn),
      ctx: { renderer, scene, rebakeEnv: () => bakes.push(Date.now()), query: new URLSearchParams(query) },
      adopt: { find: () => materials, patch: (m, spec) => { patched.push(spec.key); return true; } } };
    if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; } // round A1: as index.js sets them
    globalThis.window = win; // env.js reads the page's window once, in createEnv
    let env;
    try { env = await createEnv(club); } finally { delete globalThis.window; }
    const tick = (n = 1) => { for (let i = 0; i < n; i++) for (const fn of frame) fn(i / 60, 1 / 60); };
    return { win, scene, bakes, patched, club, env, tick };
  };

  await ok('env: requests inside the debounce are one bake; a capture asked for at once is made in the same task; a camera move captures nothing', async () => {
    const r = await envRig({ materials: [new THREE.MeshStandardMaterial({ name: 'rail' })] });
    assert.equal(r.env.enabled, true);
    assert.deepEqual(r.patched, ['env-v1'], 'base: the box-projected lookup is patched in');
    r.env.capture('a'); r.env.capture('b');
    assert.equal(r.bakes.length, 0, 'nothing inside the call');
    await sleep(170);
    assert.equal(r.bakes.length, 1);
    let st = r.env.state();
    assert.deepEqual([st.captures, st.bakesAsked, st.coalesced, st.reasons], [1, 1, 1, ['a+b']]);
    r.env.capture('install', { now: true });
    assert.equal(r.bakes.length, 2, 'the install capture: one bake, in the same task');
    r.env.capture('light+install', { now: true });
    assert.equal(r.bakes.length, 3);
    r.env.capture('fixture', { now: true });
    assert.equal(r.bakes.length, 4);
    // frames go by and the camera moves: no capture, no bake
    const cam = new THREE.PerspectiveCamera();
    for (let i = 0; i < 120; i++) {
      cam.position.set(Math.sin(i), 1 + i * 0.01, Math.cos(i)); cam.updateMatrixWorld();
      r.tick();
      r.scene.onBeforeRender(r.club.ctx.renderer, r.scene, cam, null); r.scene.onAfterRender(r.club.ctx.renderer, r.scene, cam);
    }
    await sleep(170);
    st = r.env.state();
    assert.equal(r.bakes.length, 4); assert.equal(st.captures, 4); assert.equal(st.bakesAsked, 4); assert.deepEqual(st.pending, []);
    assert.equal(st.live.on, false); assert.equal(st.live.faces, 0);
    assert.equal(st.hookError, null);
  });

  await ok('env: a studio window parks every capture, the one asked for at once too; the close applies them as ONE bake', async () => {
    const r = await envRig({ studio: true });
    r.env.capture('install', { now: true });
    r.env.capture('fixture');
    await sleep(170);
    let st = r.env.state();
    assert.equal(r.bakes.length, 0, 'no bake inside a studio window');
    assert.deepEqual([st.parked, st.parkedNow, st.pending, st.captures], [1, true, ['install', 'fixture'], 0]);
    r.win.__cinelight = false;
    r.win.dispatchEvent(new Event('ob:cinelight'));
    await sleep(260); // club/index.js runs its own parked refresh pass 250 ms after the close and ends it with a capture request
    assert.equal(r.bakes.length, 0, 'the service waits for that request');
    r.env.capture('install+brightness');
    await sleep(320);
    st = r.env.state();
    assert.deepEqual([st.captures, st.parkedNow, st.pending], [1, false, []]);
    assert.deepEqual(st.reasons, ['install+fixture+install+brightness']);
    assert.equal(r.bakes.length, 1, 'one bake for everything that was parked, not one per owner');
    // a window that opens again before the debounce keeps the request parked
    r.env.capture('late');
    r.win.__cinelight = true;
    await sleep(170);
    assert.equal(r.bakes.length, 1); assert.equal(r.env.state().parkedNow, true);
    r.win.__cinelight = false; r.win.dispatchEvent(new Event('ob:cinelight'));
    await sleep(520);
    assert.equal(r.bakes.length, 2); assert.equal(r.env.state().parked, 2);
  });

  await ok('env: lite makes ONE capture at load, held until the club textures settle; no patch, no mirror; a raw file does not hold or repeat it', async () => {
    const counts = { requested: 3, loaded: 0, fallback: 0, rawFiles: 1, rawSettled: 0 }; // two textures and one raw file
    const r = await envRig({ tier: 'lite', assets: { state: () => ({ ...counts }) }, materials: [new THREE.MeshStandardMaterial()] });
    let st = r.env.state();
    assert.deepEqual([st.config.box, st.config.mirror, st.config.coat, st.oneAtLoad, st.mirror.state], [false, false, 0, true, 'off']);
    assert.deepEqual(r.patched, [], 'no box projection: nothing is patched');
    r.env.capture('install', { now: true });
    r.tick(25);
    await sleep(30);
    assert.equal(r.bakes.length, 0, 'held: the textures are still loading');
    assert.equal(r.env.state().heldForTextures, true);
    counts.loaded = 1; r.tick(25); await sleep(30);
    assert.equal(r.bakes.length, 0, 'one of two is not all');
    counts.loaded = 2; r.tick(25); await sleep(170);
    st = r.env.state();
    assert.equal(r.bakes.length, 1, 'the one capture, when the textures are in');
    assert.deepEqual([st.captures, st.heldForTextures, st.reasons], [1, false, ['install+textures']]);
    counts.loaded = 3; counts.rawSettled = 1; r.tick(45); await sleep(170);
    assert.equal(r.env.state().captures, 1, 'a raw file (the light map) is announced by its owner, not by the texture watch');
    counts.requested = 4; r.tick(25); counts.loaded = 4; r.tick(25); await sleep(170);
    assert.equal(r.env.state().captures, 2, 'a texture that lands after the capture is captured once more');
    assert.equal(r.bakes.length, 2);
    // the high tier, for contrast: the mirror exists and waits for the floor
    const h = await envRig({ tier: 'high' });
    assert.deepEqual([h.env.state().config.mirror, h.env.state().mirror.state, h.env.state().mirror.reduced, h.env.state().live.on], [true, 'waiting for the floor', true, false]);
    assert.equal((await envRig({ tier: 'high', query: 'clubenv=mirror:0' })).env.state().mirror.state, 'off');
  });

  await ok('env: exclude() hides an object in every cube render and never in the main view, and puts it back', async () => {
    const r = await envRig({ tier: 'high' });
    const a = new THREE.Mesh(), b = new THREE.Mesh(), c = new THREE.Mesh();
    r.scene.add(a, b, c);
    const offA = r.env.exclude(a); r.env.exclude(b, { mirror: false });
    assert.equal(typeof offA, 'function'); assert.equal(typeof r.env.exclude(null), 'function', 'a non-object is ignored');
    const cube = new THREE.CubeCamera(0.1, 10, new THREE.WebGLCubeRenderTarget(16));
    const R = r.club.ctx.renderer, main = new THREE.PerspectiveCamera();
    for (const face of cube.children) {
      r.scene.onBeforeRender(R, r.scene, face, null);
      assert.deepEqual([a.visible, b.visible, c.visible], [false, false, true], 'hidden while a cube face is drawn');
      r.scene.onAfterRender(R, r.scene, face);
      assert.deepEqual([a.visible, b.visible, c.visible], [true, true, true], 'and back');
    }
    r.scene.onBeforeRender(R, r.scene, main, null);
    assert.deepEqual([a.visible, b.visible], [true, true], 'the main view draws them');
    r.scene.onAfterRender(R, r.scene, main);
    let st = r.env.state();
    assert.deepEqual([st.excluded, st.excludedFromCube, st.cubeFaces, st.hookError], [2, 12, 6, null]);
    // an object that is hidden anyway is not shown by the restore; an un-registered one is left alone
    a.visible = false; offA();
    r.scene.onBeforeRender(R, r.scene, cube.children[0], null); r.scene.onAfterRender(R, r.scene, cube.children[0]);
    assert.equal(a.visible, false); assert.equal(b.visible, true);
    st = r.env.state();
    assert.deepEqual([st.excluded, st.excludedFromCube], [1, 13]);
  });

  // The app's table cache disposes a build's own materials when it evicts the build (table.js disposeChildren: the
  // Chinese-8 plank clones, a pedestal style's body clone) and never draws them again. The two maps that are keyed by an
  // adopted material and iterated (env.js `patched`, mat/wood.js `records`) must let such a material go.
  await ok('env: a table material the app disposes leaves the patch map (an evicted table build is not kept for the life of the page); one that is only out of the scene stays, and so does the floor\'s', async () => {
    const tag = (name) => { const m = new THREE.MeshStandardMaterial({ name }); m.userData.obClass = 'railwood'; return m; };
    const mats = [tag('rail')];
    const r = await envRig({ materials: mats });
    const names = () => Object.keys(r.env.state().shapes).sort();
    assert.deepEqual(names(), ['railwood:rail']);
    for (let i = 0; i < 3; i++) { // three switches to a table with rail materials of its own, each evicted afterwards
      const own = [tag(`plank-${i}a`), tag(`plank-${i}b`)];
      mats.push(...own); r.env.rebuild();
      assert.deepEqual(names(), [`railwood:plank-${i}a`, `railwood:plank-${i}b`, 'railwood:rail']);
      mats.length = 1; for (const m of own) m.dispose(); r.env.rebuild();
      assert.deepEqual(names(), ['railwood:rail'], `switch ${i + 1}: the evicted build's materials are gone from the map`);
    }
    // a build the cache keeps is detached, not disposed: its record stays, and it is not wrapped again when it comes back
    const kept = tag('kept');
    mats.push(kept); r.env.rebuild(); mats.length = 1; r.env.rebuild();
    assert.deepEqual(names(), ['railwood:kept', 'railwood:rail']);
    const wraps = r.patched.length;
    mats.push(kept); r.env.rebuild();
    assert.equal(r.patched.length, wraps, 'adopted once');
    // the floor's record is the room's own: a dispose event does not take it (the mirror reads it)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ name: 'floor' }));
    r.club.room = { enabled: true, floor: { mesh: floor, material: floor.material } };
    r.env.rebuild(); floor.material.dispose();
    assert.ok(names().includes('floor:floor'));
  });

  await ok('wood: a table material the app disposes leaves the part\'s records; one that is only out of the scene stays and is the same record when it comes back', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const { createAdopt } = await import('../../scene/club/adopt.js');
    const scene = new THREE.Scene();
    const tag = (name, cls) => { const m = new THREE.MeshStandardMaterial({ name, color: 0x2e2e30 }); m.userData.obClass = cls; return m; };
    const put = (m, y) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.6), m); mesh.position.y = y; scene.add(mesh); scene.updateMatrixWorld(true); return mesh; };
    put(tag('rail', 'railwood'), 0.02); put(tag('apron', 'apron'), -0.1);
    const club = { tier: 'base', knobs: TIERS.base, ctx: { scene, query: new URLSearchParams('') }, onFrame() {}, room: { enabled: false } };
    club.adopt = createAdopt(club);
    const part = await applyWood(club);
    assert.equal(part.enabled, true);
    const names = () => part.state().materials.map((m) => `${m.name}${m.inScene ? '' : ' (out)'}`).sort();
    assert.deepEqual(names(), ['apron', 'rail']);
    for (let i = 0; i < 3; i++) { // three switches to a table with materials of its own, each evicted afterwards
      const own = [put(tag(`plank-${i}`, 'railwood'), 0.02), put(tag(`body-${i}`, 'apron'), -0.1)];
      part.rebuild('table');
      assert.deepEqual(names(), ['apron', `body-${i}`, `plank-${i}`, 'rail']);
      for (const mesh of own) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      part.rebuild('table');
      assert.deepEqual(names(), ['apron', 'rail'], `switch ${i + 1}: the evicted build's materials are gone from the records`);
    }
    // a build the cache keeps is detached, not disposed: its record stays (a scan that lands meanwhile still restyles it)
    // and the material is not patched again when the build comes back
    const kept = put(tag('kept', 'railwood'), 0.02);
    part.rebuild('table'); scene.remove(kept); part.rebuild('table');
    assert.deepEqual(names(), ['apron', 'kept (out)', 'rail']);
    const wraps = club.adopt.state().patched;
    scene.add(kept); part.rebuild('table');
    assert.deepEqual(names(), ['apron', 'kept', 'rail']); assert.equal(club.adopt.state().patched, wraps, 'adopted once');
  });

  await ok('env: the ambient cube — one small capture per bake, the lamp\'s light faces, the cloth, the balls and the cue left out, values in place, nothing per frame', async () => {
    // a renderer stand-in that "draws" by running the scene hooks and notes what was visible; its read-back returns a
    // radiance that says whether a lamp face was in the picture (3 with it, 0.25 without)
    const seen = [];
    let target = null, lampDrawn = false, blackRead = false;
    const R = {
      xr: { enabled: false }, autoClear: false, coordinateSystem: THREE.WebGLCoordinateSystem,
      getRenderTarget: () => target, getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
      setRenderTarget: (t) => { target = t; },
      render(scene, cam) {
        scene.onBeforeRender(R, scene, cam, target);
        const vis = {}; scene.traverse((o) => { if (o.name) { let v = true; for (let p = o; p; p = p.parent) if (!p.visible) v = false; vis[o.name] = v; } });
        seen.push(vis); if (vis.appFace || vis['clubLamp.face']) lampDrawn = true;
        scene.onAfterRender(R, scene, cam);
      },
      readRenderTargetPixels(_rt, _x, _y, w, h, buf) { if (blackRead) return; const v = THREE.DataUtils.toHalfFloat(lampDrawn ? 3 : 0.25); for (let i = 0; i < w * h * 4; i++) buf[i] = v; },
    };
    const r = await envRig({ tier: 'lite', renderer: R, query: 'clubenv=amb:1' });
    const named = (name, mat) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat ?? new THREE.MeshStandardMaterial()); m.name = name; r.scene.add(m); return m; };
    const appFace = named('appFace', new THREE.MeshBasicMaterial()), ownFace = named('clubLamp.face', new THREE.MeshBasicMaterial()), shade = named('clubLamp.shade');
    const cloth = named('cloth', Object.assign(new THREE.MeshStandardMaterial(), { userData: { obClass: 'cloth' } }));
    const rail = named('rail', Object.assign(new THREE.MeshStandardMaterial(), { userData: { obClass: 'railwood' } }));
    const ball = named('ball'), cue = named('obCueStick'), wall = named('wall'), extra = named('extra'), onlyAmbient = named('onlyAmbient');
    r.club.ctx.room = { lightRefs: { lampFace: appFace } };
    r.club.room = { enabled: true, parts: { lamp: { emissives: [ownFace] } } };
    r.club.ctx.game = { ballSet: { balls: [{ mesh: ball }] } };
    r.env.exclude(extra);                                        // out of every cube render, so out of the ambient capture too
    r.env.exclude(onlyAmbient, { cube: false, mirror: false });  // out of the ambient capture only
    const amb = r.env.ambient;
    assert.deepEqual([amb.enabled, amb.serial, amb.uniforms.uClubEnvAmb.value.length], [false, 0, 6], 'no values before the first capture');
    assert.deepEqual(amb.excludes, { lamp: true, cloth: true, balls: true, cue: true });
    const array = amb.uniforms.uClubEnvAmb.value, first = array[2];
    // a capture: the app's bake, then the ambient capture in the same task
    r.env.capture('install', { now: true });
    assert.equal(r.bakes.length, 1);
    assert.equal(seen.length, 6, 'six faces of the small cube, in the task of the capture');
    for (const vis of seen) {
      assert.deepEqual([vis.appFace, vis['clubLamp.face'], vis.cloth, vis.ball, vis.obCueStick, vis.extra, vis.onlyAmbient], [false, false, false, false, false, false, false], 'left out of every face');
      assert.deepEqual([vis['clubLamp.shade'], vis.rail, vis.wall], [true, true, true], 'the shade, the rails and the room stay in');
    }
    assert.deepEqual([appFace.visible, ownFace.visible, cloth.visible, ball.visible, cue.visible, extra.visible, onlyAmbient.visible], [true, true, true, true, true, true, true], 'everything is back after the capture');
    assert.equal(R.autoClear, false, 'the renderer\'s clear switch is back'); assert.equal(target, null);
    assert.deepEqual([amb.enabled, amb.serial, amb.reason], [true, 1, null]);
    assert.equal(amb.uniforms.uClubEnvAmb.value, array); assert.equal(array[2], first, 'the six vectors are rewritten in place');
    for (const v of array) assert.ok(Math.abs(v.x - 0.25) < 1e-3 && Math.abs(v.z - 0.25) < 1e-3, `a uniform room without the lamp: ${v.x}`);
    let st = r.env.state().ambient;
    assert.deepEqual([st.passes, st.faces, st.lampFaces, st.why, st.size], [1, 6, 2, 'capture', 32]);
    assert.deepEqual(st.lampFaceNames.slice().sort(), ['appFace', 'clubLamp.face']);
    assert.equal(r.env.state().cubeFaces, 0, 'the ambient faces are not counted as faces of the app\'s cube');
    // frames go by: nothing is captured again (no bake was seen since)
    r.tick(60);
    assert.equal(seen.length, 6); assert.equal(amb.serial, 1);
    // the luminaire's own hook may swap faces inside the render (the app's face hidden before it -> its own face in): the
    // service hides what is visible at hook time too
    ownFace.visible = false;
    const prev = r.scene.onBeforeRender;
    r.scene.onBeforeRender = function lampLikeHook(...a) { if (!appFace.visible) ownFace.visible = true; prev.apply(this, a); };
    lampDrawn = false;
    st = r.env.tool.ambient('now');
    assert.equal(lampDrawn, false, 'the stand-in face is caught at hook time'); assert.equal(st.serial, 2);
    r.scene.onBeforeRender = prev; ownFace.visible = true;
    // the tool's reference: the same capture WITH the lamp's faces, kept until the next call
    lampDrawn = false;
    st = r.env.tool.ambient('withlamp');
    assert.equal(lampDrawn, true); assert.ok(Math.abs(array[2].x - 3) < 1e-2, 'the lamp in the picture'); assert.deepEqual([st.lampFaces, st.why], [0, 'tool:withlamp']);
    lampDrawn = false;
    st = r.env.tool.ambient(true);
    assert.ok(Math.abs(array[2].x - 0.25) < 1e-3); assert.equal(st.lampFaces, 2);
    // a read-back that returns nothing is not a room: the consumer goes back to its fallback, and says why
    blackRead = true;
    const before = array[2].x;
    r.env.tool.ambient('now');
    blackRead = false;
    // (the buffers still hold the last read: a failed read leaves them untouched, so the values stand; a fresh service reads black)
    assert.equal(array[2].x, before);
    const r2 = await envRig({ tier: 'base', renderer: { ...R, readRenderTargetPixels() {} }, query: 'clubenv=amb:1' });
    r2.env.capture('install', { now: true });
    assert.deepEqual([r2.env.ambient.enabled, r2.env.ambient.reason], [false, 'the ambient capture read back black (no values)']);
    // a studio window: no capture of any kind; ?clubenv=amb:0: off, and said; a renderer that cannot read back: off, no throw
    const r3 = await envRig({ tier: 'base', renderer: R, studio: true, query: 'clubenv=amb:1' });
    const n3 = seen.length;
    r3.env.capture('install', { now: true }); r3.tick(30);
    assert.equal(seen.length, n3); assert.equal(r3.env.ambient.enabled, false);
    const r4 = await envRig({ tier: 'base', renderer: R, query: 'clubenv=amb:0' });
    r4.env.capture('install', { now: true });
    assert.deepEqual([r4.env.ambient.enabled, r4.env.ambient.reason, r4.env.state().config.ambient], [false, 'off (?clubenv=amb:0)', false]);
    const r5 = await envRig({ tier: 'base', query: 'clubenv=amb:1' });
    r5.env.capture('install', { now: true });
    assert.deepEqual([r5.bakes.length, r5.env.ambient.enabled, r5.env.ambient.reason, r5.env.state().captures], [1, false, 'the renderer cannot read a target back', 1]);
    // on by default on every tier (the knob), off only by the knob or the tool override
    for (const id of TIER_IDS) assert.equal(envConfig(TIERS[id]).ambient, true, `${id}: the ambient cube is on`);
    assert.equal(envConfig({ ...TIERS.base, envAmbient: false }).ambient, false);
    assert.equal(envConfig(TIERS.lite, new URLSearchParams('clubenv=amb:0')).ambient, false);
  });

  await ok('env: the planar mirror is one picture per pose per frame, of a reduced scene, only when the floor is in view; the tool switches work', async () => {
    const r = await envRig({ tier: 'high' });
    const tag = (cls) => { const m = new THREE.MeshStandardMaterial(); m.userData.obClass = cls; return m; };
    const at = (mesh, x, y, z, name) => { mesh.position.set(x, y, z); mesh.name = name; r.scene.add(mesh); return mesh; };
    const floorMat = new THREE.MeshStandardMaterial({ name: 'floor' });
    const floor = at(new THREE.Mesh(new THREE.BoxGeometry(11, 0.02, 9.6), floorMat), 0, -0.8, 0, 'floor');
    const cloth = at(new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.02, 1.27), tag('cloth')), 0, -0.01, 0, 'cloth');
    const rail = at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.06, 1.6), tag('railwood')), 0, 0.01, 0, 'rail');
    const onBed = at(new THREE.Mesh(new THREE.SphereGeometry(0.0286)), 0.3, 0.0286, 0.1, 'ball on the bed');
    const inReturn = at(new THREE.Mesh(new THREE.SphereGeometry(0.0286)), 1.2, -0.3, 0, 'ball in the return');
    const aim = at(new THREE.Mesh(new THREE.BoxGeometry(1, 0.001, 0.002)), 0, 0.03, 0, 'obAimLine');
    r.club.ctx.game = { ballSet: { balls: [{ mesh: onBed }, { mesh: inReturn }] } };
    r.club.room = { enabled: true, box: { min: new THREE.Vector3(-5.5, -0.79, -6), max: new THREE.Vector3(5.5, 2.45, 3.6) }, floor: { mesh: floor, material: floorMat } };
    r.scene.updateMatrixWorld(true);
    // a renderer stand-in: render() runs the scene's hooks as three does and records what is visible while a camera draws
    const seen = [];
    const things = { floor, cloth, rail, onBed, inReturn, aim };
    const R = { xr: { enabled: false }, autoClear: true, target: null, state: { buffers: { depth: { setMask() {} } } },
      getDrawingBufferSize: (v) => v.set(1280, 720), getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t ?? null; },
      getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
      render(scene, cam) {
        scene.onBeforeRender(this, scene, cam, this.target);
        const vis = Object.entries(things).filter(([, o]) => o.visible).map(([k]) => k);
        const body = scene.getObjectByName('clubEnvTableBody');
        seen.push({ cam: /Mirror/.test(cam.name) ? 'mirror' : 'main', vis, body: body?.visible === true });
        scene.onAfterRender(this, scene, cam);
      } };
    const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 50);
    const pose = (x, y, z, tx, ty, tz) => { cam.position.set(x, y, z); cam.lookAt(tx, ty, tz); cam.updateMatrixWorld(true); cam.updateProjectionMatrix(); };
    pose(-2.3, 1.05, 1.35, 0.1, 0, 0);
    r.env.rebuild('table'); // the lifecycle hook of club/index.js: the table is scanned and the floor adopted
    r.tick(2);
    assert.deepEqual(r.patched, ['env-v1:floor+coat+mirror']);
    assert.equal(r.env.state().mirror.state, 'on'); assert.equal(r.env.mirror.enabled, true);
    const all = ['floor', 'cloth', 'rail', 'onBed', 'inReturn', 'aim'];
    R.render(r.scene, cam);
    assert.deepEqual(seen.map((x) => x.cam), ['mirror', 'main'], 'the mirror picture is made inside the main render');
    assert.deepEqual(seen[0].vis, ['rail', 'inReturn'], 'the reduced scene: no floor, no cloth, no ball on the bed, no aim overlay; a ball under the bed stays');
    assert.equal(seen[0].body, true, 'the table body proxy is drawn in the mirror picture only');
    assert.deepEqual([seen[1].vis, seen[1].body], [all, false], 'the main view draws everything');
    assert.deepEqual(all.filter((k) => !things[k].visible), [], 'everything is put back');
    R.render(r.scene, cam);
    assert.deepEqual(seen.slice(2).map((x) => x.cam), ['main'], 'a second pass with the same pose in the same frame reuses the picture');
    r.tick(); seen.length = 0;
    R.render(r.scene, cam);
    assert.deepEqual(seen.map((x) => x.cam), ['mirror', 'main'], 'the next frame makes its own');
    assert.equal(r.env.state().mirror.renders, 2);
    // the floor out of view: no mirror picture
    r.tick(); seen.length = 0; pose(0, 0.5, 0, 0, 3, 0.001);
    R.render(r.scene, cam);
    assert.deepEqual(seen.map((x) => x.cam), ['main']);
    // tool switches: the whole scene in the mirror; the mirror off
    pose(-4, 1.6, 2.6, 0, 0.3, 0);
    r.env.tool.mirrorFull(true); r.tick(); seen.length = 0;
    R.render(r.scene, cam);
    assert.deepEqual(seen[0].vis, ['cloth', 'rail', 'onBed', 'inReturn'], 'the full scene: only the floor and the aim overlay stay out');
    r.env.tool.mirrorFull(false);
    assert.equal(r.env.tool.mirror(false), false); r.tick(); seen.length = 0;
    R.render(r.scene, cam);
    assert.deepEqual(seen.map((x) => x.cam), ['main'], 'mirror off: one scene render');
    assert.equal(r.env.tool.mirror(true), true); r.tick(); seen.length = 0;
    R.render(r.scene, cam);
    assert.deepEqual(seen.map((x) => x.cam), ['mirror', 'main']);
    assert.equal(R.target, null, 'the render target is put back'); assert.equal(R.autoClear, true);
    assert.deepEqual(r.env.tool.coat(0.4, 0.1), [0.4, 0.1]); assert.deepEqual(r.env.tool.coat(NaN, 9), [0.4, 1]);
    assert.deepEqual(r.env.state().coat.slice(0, 2), [0.4, 1]);
    assert.equal(r.env.state().hookError, null); assert.equal(r.bakes.length, 0, 'and none of it captured the cube');
  });

  await ok('venues: the reflection service in the arena — the hall is the projection box, the carpet is not patched, no mirror is built on any tier; the club venue is as it was', async () => {
    const hall = () => ({ min: new THREE.Vector3(-11, -0.79, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) });
    const build = async (tier, venue) => {
      const rail = new THREE.MeshStandardMaterial({ name: 'rail' });
      const r = await envRig({ tier, venue, materials: [rail] });
      const floorMat = new THREE.MeshStandardMaterial({ name: 'floor' });
      const floor = new THREE.Mesh(new THREE.BoxGeometry(25, 0.02, 25.2), floorMat); floor.position.set(1.5, -0.8, 0); r.scene.add(floor);
      r.club.room = { enabled: true, box: hall(), floor: { mesh: floor, material: floorMat } };
      r.scene.updateMatrixWorld(true);
      r.env.rebuild('table'); r.tick(2);
      return r;
    };
    for (const tier of ['lite', 'base', 'high']) {
      const r = await build(tier, 'arena');
      const st = r.env.state();
      assert.deepEqual([st.box.min, st.box.max, st.box.from], [[-11, -0.79, -12.6], [14, 8.71, 12.6], 'club.room.box'], `${tier}: the hall's box is the box of the projection`);
      assert.deepEqual(r.env.box.center.toArray().map((v) => +v.toFixed(6)), [1.5, 3.96, 0]);
      assert.ok(!r.patched.some((k) => /floor/.test(k)), `${tier}: the carpet takes no reflection patch (${r.patched.join(', ')})`);
      assert.equal(r.env.mirror, null, `${tier}: no mirror object`);
      assert.match(st.mirror.state, /matt floor/); assert.equal(st.floor, 'matt (not patched; no mirror)');
      assert.ok(st.notes.some((n) => /a matt floor/.test(n)), 'state().notes says why the floor is not patched');
      assert.equal(r.scene.getObjectByName('clubEnvTableBody'), undefined, 'no table-body proxy for a mirror that does not exist');
      // the rail wood and the apron keep their box-projected lookup wherever the tier has it; round A6: on the tier
      // without the box the rail wood alone takes the same patch (env/config.js HALL_RAIL), one material, one key
      const { HALL_RAIL } = await import('../../scene/club/env/config.js');
      assert.deepEqual([...new Set(r.patched)], tier === 'lite' && HALL_RAIL.on !== true ? [] : ['env-v1']);
      if (tier === 'lite') { assert.equal(r.patched.length, HALL_RAIL.on === true ? 1 : 0); assert.equal(st.hallRail === undefined, HALL_RAIL.on !== true); assert.equal(st.envBox, false); assert.equal(st.oneAtLoad, true); }
      else assert.equal(st.hallRail, undefined);
      // a main render makes no second scene render
      const seen = [];
      const R = { xr: { enabled: false }, autoClear: true, target: null, getDrawingBufferSize: (v) => v.set(1280, 720), getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t ?? null; },
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        render(scene, cam) { scene.onBeforeRender(this, scene, cam, this.target); seen.push(cam.name || 'main'); scene.onAfterRender(this, scene, cam); } };
      const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 50); cam.position.set(-2.3, 1.05, 1.35); cam.lookAt(0.1, 0, 0); cam.updateMatrixWorld(true);
      R.render(r.scene, cam);
      assert.deepEqual(seen, ['main'], `${tier}: one scene render`);
      assert.equal(st.hookError, null);
    }
    // the club venue, named or not: the floor patch with its varnish (and the mirror on high), exactly as before
    for (const venue of ['club', undefined]) {
      const h = await build('high', venue);
      assert.deepEqual([...new Set(h.patched)].sort(), ['env-v1', 'env-v1:floor+coat+mirror']);
      assert.equal(h.env.state().mirror.state, 'on'); assert.ok(!('floor' in h.env.state()), 'no venue member in the club state');
      const b = await build('base', venue);
      assert.deepEqual([...new Set(b.patched)].sort(), ['env-v1', 'env-v1:floor+coat']);
    }
    // an arena room that failed (a stub): the app room's box, as under club without a room
    const bare = await envRig({ tier: 'base', venue: 'arena' });
    assert.equal(bare.env.state().box.from, 'fallback');
  });

  // ---- round A7 (CONTRACT.md 19.1): the hall's baked reflection as a service, the arena venue only ---------------------------
  await ok('hall cube (round A7): the file\'s reader, the stand-in, the level table and the patch text are pure and agree with their shader twins', async () => {
    const H = await import('../../scene/club/env/hall.js');
    const { hallEnvWanted, HALL_CUBE } = await import('../../scene/club/env/config.js');
    // half floats: exact on representable values, within one part in 2048 elsewhere, clamped at the top, 0 for junk
    for (const v of [0, 1, 0.5, 2, 1024, 0.0009765625, 65504]) assert.equal(H.fromHalf(H.toHalf(v)), v);
    for (const v of [0.003, 0.0917, 0.33, 7.42, 24.9, 1e-5, 3e-7]) assert.ok(Math.abs(H.fromHalf(H.toHalf(v)) - v) <= v / 2048 + 6e-8, `half(${v})`);
    assert.equal(H.fromHalf(H.toHalf(1e9)), 65504); assert.equal(H.toHalf(-1), 0); assert.equal(H.toHalf(NaN), 0);
    // the GL cube rule: the six face centres are the six axes in the file's order; direction <-> texel is one map both ways
    const axes = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let f = 0; f < 6; f++) {
      const c = H.hallFaceDir(f, 0.5, 0.5, 2).map((x) => Math.round(x * 1e6) / 1e6);
      assert.deepEqual(c.map((x) => x + 0), axes[f].map((x) => x + 0), `face ${f} looks along its axis`);
      for (const [cc, rr] of [[0, 0], [3, 1], [5, 7], [7, 7]]) {
        const back = H.hallDirFace(H.hallFaceDir(f, cc, rr, 8), 8);
        assert.equal(back.f, f); assert.ok(Math.abs(back.c - (cc + 0.5)) < 1e-9 && Math.abs(back.r - (rr + 0.5)) < 1e-9);
      }
    }
    // row 0 of +y is the -z edge, row 0 of a side face is its top (the light role's rule, ENV-FORMAT section 2)
    assert.ok(H.hallFaceDir(2, 3.5, 0, 8)[2] < 0 && H.hallFaceDir(4, 3.5, 0, 8)[1] > 0 && H.hallFaceDir(0, 0, 3.5, 8)[2] > 0);
    // the level table: piecewise linear through the file's roughness column
    const full = [0, 0.15, 0.30, 0.50, 0.75, 1], lite = [0, 0.30, 0.50, 0.75, 1];
    const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
    near(H.hallLod(0, full), 0, 'mirror'); near(H.hallLod(0.15, full), 1, '0.15'); near(H.hallLod(0.40, full), 2.5, '0.40'); near(H.hallLod(0.5, full), 3, '0.5'); near(H.hallLod(1, full), 5, 'matt'); near(H.hallLod(2, full), 5, 'over');
    near(H.hallLod(0.40, lite), 1.5, 'lite 0.40'); near(H.hallLod(0.35, lite), 1.25, 'lite 0.35');
    for (let i = 1; i < 6; i++) assert.ok(H.HALL_GLSL.includes('uClubHallRough[ i - 1 ]'), 'the shader walks the same table');
    assert.ok(H.HALL_GLSL.includes(`uClubHallRough[ ${H.HALL_ENV.maxLevels} ]`) && H.HALL_GLSL.includes('textureLod( uClubHallEnv') && H.HALL_GLSL.includes('#ifndef CLUB_HALL_ENV'));
    // the local correction: a ray to the box's wall is looked up from the cube's place toward the point it hits
    const d = H.hallDir([4.7, 0, -2.6], [0, -1, 0], [-11, -0.768, -12.6], [14, 8.7, 12.6], [0, 0.43, 0]);
    near(d[0], 4.7, 'x'); near(d[1], -0.768 - 0.43, 'y'); near(d[2], -2.6, 'z');
    const out = H.hallDir([20, 0, 0], [1, 0, 0], [-11, -1, -12], [14, 9, 12], [0, 0, 0]);
    near(out[0], 20, 'a point outside the box keeps its own place');
    // a reader's tag
    assert.deepEqual(H.hallTag(true), { share: 1, keep: 0 }); assert.deepEqual(H.hallTag({ share: 0.5 }), { share: 0.5, keep: 0 }); assert.deepEqual(H.hallTag({ keep: 0.2 }), { share: 1, keep: 0.2 });
    assert.deepEqual(H.hallTag(0.3), { share: 0.3, keep: 0 }); assert.equal(H.hallTag(null), null); assert.equal(H.hallTag({ share: -1 }), null); assert.equal(H.hallTag('yes'), null);
    // the file: a synthetic image in the light role's layout (n = 4: levels 4, 2, 1), RGBE with 2^(A - 136), A = 0 black
    const n = 4, W = 6 * n, Hh = 4 + 2 + 1, rgba = new Uint8Array(W * Hh * 4);
    const put = (level, y0, s, f, c, r, px) => rgba.set(px, ((y0 + r) * W + f * s + c) * 4);
    put(0, 0, 4, 0, 0, 0, [128, 64, 32, 136]);  // +x, column 0, row 0: (128, 64, 32) * 2^0
    put(0, 0, 4, 5, 3, 3, [200, 100, 50, 129]); // -z, last texel: * 2^-7
    put(0, 0, 4, 2, 1, 2, [255, 255, 255, 0]);  // A = 0: black whatever the mantissas say
    put(1, 4, 2, 3, 1, 0, [10, 20, 30, 140]);   // level 1, -y: * 2^4
    put(2, 6, 1, 4, 0, 0, [1, 2, 3, 128]);      // level 2, +z: * 2^-8
    const record = { v: 1, enc: 'rgbe', n, levels: [{ s: 4, y: 0, rough: 0 }, { s: 2, y: 4, rough: 0.5 }, { s: 1, y: 6, rough: 1 }], probe: [0, 1.2, 0], box: { min: [-11, 0, -12.6], max: [14, 9.5, 12.6] }, unit: 0.2318, sig: 'abc' };
    const png = (rec, over = {}) => ({ width: W, height: Hh, rgba, text: { [H.HALL_ENV.textKey]: JSON.stringify(rec) }, ...over });
    const dec = H.decodeHallEnv(png(record));
    assert.equal(dec.ok, true); assert.deepEqual([dec.n, dec.levels.length, dec.levels.map((L) => L.s), dec.levels.map((L) => L.rough)], [4, 3, [4, 2, 1], [0, 0.5, 1]]);
    const texel = (L, f, c, r) => [0, 1, 2, 3].map((k) => H.fromHalf(dec.levels[L].data[f][(r * dec.levels[L].s + c) * 4 + k]));
    assert.deepEqual(texel(0, 0, 0, 0), [128, 64, 32, 1]);
    assert.deepEqual(texel(0, 5, 3, 3), [200 / 128, 100 / 128, 50 / 128, 1]);
    assert.deepEqual(texel(0, 2, 1, 2), [0, 0, 0, 1]);
    assert.deepEqual(texel(1, 3, 1, 0), [160, 320, 480, 1]);
    assert.deepEqual(texel(2, 4, 0, 0), [1 / 256, 2 / 256, 3 / 256, 1]);
    assert.equal(dec.peak, 480); assert.deepEqual(dec.probe, [0, 1.2, 0]); assert.deepEqual(dec.box.max, [14, 9.5, 12.6]);
    assert.equal(dec.levels[0].data.length, 6); assert.equal(dec.levels[0].data[0].length, 64);
    // refused whole, with the reason: another version, another coding, a size or a level that does not fit, no probe
    for (const [rec, re] of [[{ ...record, v: 2 }, /version 2/], [{ ...record, enc: 'srgb' }, /encoding/], [{ ...record, n: 8 }, /face size/], [{ ...record, levels: [{ s: 4, y: 0, rough: 0 }, { s: 2, y: 6, rough: 0.5 }] }, /level 1/],
      [{ ...record, levels: [{ s: 4, y: 0, rough: 0.5 }, { s: 2, y: 4, rough: 0.5 }] }, /level 1/], [{ ...record, probe: null }, /probe/], [null, /no record/]]) {
      const bad = H.decodeHallEnv(png(rec)); assert.equal(bad.ok, false); assert.match(bad.reason, re);
    }
    // the stand-in: six lobes blended as the ambient cube's, the same picture on every level
    const lobes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0.5], [0.25, 0, 0], [0, 0.25, 0]];
    const si = H.hallStandIn(lobes);
    assert.deepEqual(si.map((L) => L.s), [16, 8, 4]); assert.deepEqual(si.map((L) => L.rough), [0, 0.5, 1]);
    for (let f = 0; f < 6; f++) {
      const s = si[2].s, dd = H.hallFaceDir(f, 1, 1, s), got = [0, 1, 2].map((k) => H.fromHalf(si[2].data[f][(1 * s + 1) * 4 + k]));
      const w = [Math.max(dd[0], 0) ** 2, Math.max(-dd[0], 0) ** 2, Math.max(dd[1], 0) ** 2, Math.max(-dd[1], 0) ** 2, Math.max(dd[2], 0) ** 2, Math.max(-dd[2], 0) ** 2];
      for (let k = 0; k < 3; k++) { let v = 0; for (let i = 0; i < 6; i++) v += w[i] * lobes[i][k]; assert.ok(Math.abs(got[k] - v) <= v / 1024 + 1e-6, `stand-in face ${f}`); }
    }
    // ... with the floor as the room's baked map holds it: a texel that looks down onto the floor inside the hall shows
    // the floor's answer at the point it meets; the levels below are 2 x 2 means; without an answer the lobes stay
    {
      const half3 = (L, f, c, r) => [0, 1, 2].map((k) => H.fromHalf(L.data[f][(r * L.s + c) * 4 + k]));
      const seen = [];
      const floor = { y: -1, probe: [0, 1, 0], min: [-10, -10], max: [10, 10], at: (x, z) => { seen.push([x, z]); return Math.hypot(x, z) < 1 ? [0.5, 0.25, 0.125] : (x > 6 ? null : [0.03125, 0.03125, 0.03125]); } };
      const sf = H.hallStandIn(lobes, { floor });
      assert.deepEqual(sf.map((L) => [L.s, L.rough]), si.map((L) => [L.s, L.rough]), 'the same sizes and roughness column');
      assert.deepEqual(half3(sf[0], 3, 8, 8), [0.5, 0.25, 0.125], 'straight down: the lit island');
      const dEdge = H.hallFaceDir(3, 0, 8, 16), tE = -2 / dEdge[1];
      assert.ok(Math.hypot(dEdge[0] * tE, dEdge[2] * tE) > 1 && dEdge[0] * tE > -10, 'the down face\'s rim meets the floor beyond the island, inside the hall');
      assert.deepEqual(half3(sf[0], 3, 0, 8), [0.03125, 0.03125, 0.03125], 'the dark floor beyond it');
      assert.ok(seen.every(([x, z]) => Math.abs(x) <= 10 && Math.abs(z) <= 10), 'the floor is asked inside the hall only');
      for (let f = 0; f < 6; f++) assert.deepEqual(half3(sf[0], f, 3, 2), f === 3 ? half3(sf[0], 3, 3, 2) : half3(si[0], f, 3, 2), 'a texel that looks up or to the horizon keeps the lobes');
      assert.deepEqual([...sf[0].data[2]], [...si[0].data[2]], 'the up face is the lobes\'');
      // a side face's lower rows look down: outside the hall and where the floor has no answer the lobes stay
      const dFar = H.hallFaceDir(0, 8, 9, 16), tF = -2 / dFar[1];
      assert.ok(dFar[1] < 0 && dFar[0] * tF > 10, 'this texel meets the floor outside the hall'); assert.deepEqual(half3(sf[0], 0, 8, 9), half3(si[0], 0, 8, 9));
      const dNone = H.hallFaceDir(0, 8, 10, 16), tN = -2 / dNone[1];
      assert.ok(dNone[0] * tN > 6 && dNone[0] * tN < 10, 'this one meets it inside the hall where the floor has no answer'); assert.deepEqual(half3(sf[0], 0, 8, 10), half3(si[0], 0, 8, 10));
      assert.deepEqual(half3(sf[0], 0, 8, 12), [0.03125, 0.03125, 0.03125], 'a side face\'s lower rows show the floor too');
      const mean = [0, 1, 2].map((k) => 0.25 * (half3(sf[0], 3, 6, 4)[k] + half3(sf[0], 3, 7, 4)[k] + half3(sf[0], 3, 6, 5)[k] + half3(sf[0], 3, 7, 5)[k]));
      half3(sf[1], 3, 3, 2).forEach((v, k) => assert.ok(Math.abs(v - mean[k]) <= mean[k] / 512 + 1e-6, 'level 1 is the mean of the four texels above'));
      assert.deepEqual(H.hallStandIn(lobes, { floor: null }).map((L) => L.data.map((a) => [...a])), si.map((L) => L.data.map((a) => [...a])), 'no floor: every value is what it was');
      assert.deepEqual(H.hallStandIn(lobes, { floor: { ...floor, probe: [0, -2, 0] } }).map((L) => L.data.map((a) => [...a])), si.map((L) => L.data.map((a) => [...a])), 'a probe under the floor: the lobes alone');
    }
    // the patch text on three's own standard shader: four anchors, the include kept, set anew in front of <lights_fragment_end>
    const std = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    const before = { ...std };
    assert.deepEqual(H.hallPatchShader(std), { ok: true, reason: null });
    assert.ok(std.fragmentShader.includes('#include <lights_fragment_end>') && std.fragmentShader.includes('#include <common>') && std.vertexShader.includes('#include <project_vertex>'));
    assert.ok(std.fragmentShader.indexOf('radiance = uClubHallShare.x * clubHallEnv(') < std.fragmentShader.indexOf('#include <lights_fragment_end>'));
    assert.ok(std.fragmentShader.indexOf('radiance = uClubHallShare.x * clubHallEnv(') > std.fragmentShader.indexOf('#include <lights_fragment_maps>'), 'after every earlier hook on the material\'s own image-based radiance');
    assert.equal(std.fragmentShader.length, before.fragmentShader.length + H.HALL_PATCH.pars.length + 1 + H.HALL_PATCH.code.length);
    assert.ok(std.vertexShader.includes('vClubHallWP = ( modelMatrix * clubHallP ).xyz;') && std.vertexShader.includes('varying vec3 vClubHallWP;'));
    assert.match(H.hallPatchShader(std).reason, /already patched/);
    const basic = { vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader }, basicBefore = { ...basic };
    assert.match(H.hallPatchShader(basic).reason, /anchor missing: fragment #include <lights_fragment_end>/); assert.deepEqual(basic, basicBefore, 'a shader without the anchors is left as it was');
    // no rule reads the camera's position (CONTRACT.md 15.3): the lookup is a direction at the surface and the hall's box
    for (const text of [H.HALL_GLSL, H.HALL_PATCH.code, H.HALL_PATCH.vertex]) assert.ok(!/cameraPosition/.test(text));
    // the switch
    const q = (s) => new URLSearchParams(s);
    const byDefault = HALL_CUBE.on === true ? (HALL_CUBE.file === true ? 'file' : 'standin') : 'off';
    assert.equal(hallEnvWanted(null), byDefault); assert.equal(hallEnvWanted(q('clubenv=mirror:0')), byDefault);
    assert.equal(hallEnvWanted(q('clubenv=hall:0')), 'off'); assert.equal(hallEnvWanted(q('clubenv=hall:standin')), 'standin'); assert.equal(hallEnvWanted(q('clubenv=hall:file')), 'file');
    assert.equal(hallEnvWanted(q('clubenv=hall:1')), HALL_CUBE.file === true ? 'file' : 'standin');
  });

  await ok('hall cube (round A7): under the arena one handle with a stand-in from the first frame, tagged materials patched once with their own hooks kept, the file taken when it fits; the club venue gets no member and makes no request', async () => {
    const H = await import('../../scene/club/env/hall.js');
    const { HALL_CUBE } = await import('../../scene/club/env/config.js');
    const want = HALL_CUBE.on === true ? '' : 'clubenv=hall:1';
    // a staged hall: a room with a box, a floor height, a light that answers irradianceAt, a group with three materials
    const stage = ({ sig = 'abc' } = {}) => {
      const group = new THREE.Group();
      const steel = new THREE.MeshStandardMaterial({ name: 'arena.floor.bright', metalness: 1, roughness: 0.4 });
      const calls = [];
      steel.onBeforeCompile = (shader) => { calls.push('own'); shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\nradiance *= 0.0; // an earlier hook\'s fade\n'); };
      steel.customProgramCacheKey = () => 'room|vol';
      steel.userData.clubHall = { share: 1 };
      const matt = new THREE.MeshStandardMaterial({ name: 'arena.hall.matt' });            // no tag
      const sprite = new THREE.MeshBasicMaterial({ name: 'arena.floor.glow' }); sprite.userData.clubHall = true; // tagged, not a standard material
      group.add(new THREE.Mesh(new THREE.BufferGeometry(), steel), new THREE.Mesh(new THREE.BufferGeometry(), matt), new THREE.Mesh(new THREE.BufferGeometry(), sprite));
      const asked = [];
      const room = { enabled: true, group, floorY: -0.768, box: { min: new THREE.Vector3(-11, -0.768, -12.6), max: new THREE.Vector3(14, 8.732, 12.6), center: new THREE.Vector3() },
        light: { irradianceAt: (p, nrm, o) => { asked.push([p.slice(), nrm.slice(), o]); return [1 + nrm[1], 1, 1 - nrm[1]]; } },
        lightmap: { state: () => ({ file: { sig } }) } };
      return { room, steel, matt, sprite, calls, asked };
    };
    const build = async ({ tier = 'base', venue = 'arena', query = want, bytes = null, s = stage() } = {}) => {
      const requests = [];
      const win = new EventTarget();
      const scene = new THREE.Scene(); const frame = [];
      const club = { tier, knobs: TIERS[tier], room: s.room, onFrame: (fn) => frame.push(fn), venue, venueKnobs: VENUES[venue],
        assets: { state: () => ({ requested: 0, loaded: 0, fallback: 0 }), bytes: (id) => { requests.push(id); return Promise.resolve(bytes); } },
        ctx: { renderer: { standIn: true }, scene, rebakeEnv: () => {}, query: new URLSearchParams(query) }, adopt: { find: () => [], patch: () => true } };
      globalThis.window = win;
      let env;
      try { env = await createEnv(club); } finally { delete globalThis.window; }
      return { env, club, requests, s, tick: (k = 1) => { for (let i = 0; i < k; i++) for (const fn of frame) fn(i / 60, 1 / 60); } };
    };
    // the arena, no file in the manifest: the stand-in stays, from the room light at the cube's place
    const a = await build();
    const hall = a.env.hall;
    assert.ok(hall && hall.enabled === true, 'one handle under the arena');
    await hall.ready;
    assert.equal(hall.source, 'stand-in');
    assert.deepEqual(a.requests, HALL_CUBE.file === true ? ['arena.env'] : [], 'the file is asked for only with the file switch; base and high ask for arena.env');
    let st = a.env.state().hall;
    assert.deepEqual([st.size, st.levels, st.rough], [16, 3, [0, 0.5, 1]]); assert.match(st.standInFrom, /irradianceAt/);
    assert.deepEqual(st.pos.map((v) => +v.toFixed(3)), [0, 0.432, 0], 'the stand-in sits 1.2 m over the live floor');
    assert.deepEqual(st.box.min.map((v) => +v.toFixed(3)), [-11, -0.768, -12.6]);
    assert.equal(a.s.asked.length, 6); assert.deepEqual(a.s.asked[2][1], [0, 1, 0]); assert.equal(a.s.asked[0][2].baked, true);
    assert.equal(st.standInMakes, 1); a.tick(200); assert.equal(a.env.state().hall.standInMakes, 1, 'a room light that does not change: the stand-in is made once');
    // a room that publishes its baked floor and the carpet's albedo: the stand-in's floor is the map's (the lit island), and
    // it is made again when the room light says its answers may have changed (a map that lands late), never per frame
    {
      const sf = stage();
      sf.room.lightmap.floorIrradiance = (x, z) => (Math.hypot(x, z) < 2 ? [4, 4, 4] : [0.25, 0.25, 0.25]);
      sf.room.floor = { albedo: [0.125, 0.125, 0.25] }; sf.room.light.serial = 7;
      const b = await build({ s: sf }); await b.env.hall.ready;
      let sb = b.env.state().hall;
      assert.match(sb.standInFrom, /irradianceAt.*floorIrradiance x club\.room\.floor\.albedo/); assert.equal(sb.standInMakes, 1);
      const img = b.env.hall.texture.image[3].image, down = (8 * 16 + 8) * 4;   // the down face, a texel at its centre
      assert.ok(Math.abs(H.fromHalf(img.data[down]) - 4 * 0.125 * H.HALL_ENV.unit) < 1e-4 && Math.abs(H.fromHalf(img.data[down + 2]) - 4 * 0.25 * H.HALL_ENV.unit) < 2e-4, 'straight down: albedo x the map\'s irradiance x the unit');
      b.tick(200); assert.equal(b.env.state().hall.standInMakes, 1, 'the same serial: not made again');
      sf.room.lightmap.floorIrradiance = (x, z) => [8, 8, 8]; sf.room.light.serial = 8;
      b.tick(200); sb = b.env.state().hall; assert.equal(sb.standInMakes, 2, 'the serial moved: made again, once');
      assert.ok(Math.abs(H.fromHalf(b.env.hall.texture.image[3].image.data[down]) - 8 * 0.125 * H.HALL_ENV.unit) < 2e-4);
      let n = 9; for (let i = 0; i < 40; i++) { sf.room.light.serial = n++; b.tick(100); }
      assert.ok(b.env.state().hall.standInMakes <= 12, 'a light that moves all the time: at most 12 pictures a page');
      assert.equal(b.s.steel.userData.clubHall.share, 1);
    }
    // the texture: one half-float cube, its mip levels are the chain, never three's own mips
    const tex = hall.texture;
    assert.ok(tex.isCubeTexture && tex.type === THREE.HalfFloatType && tex.generateMipmaps === false && tex.flipY === false && tex.minFilter === THREE.LinearMipmapLinearFilter);
    assert.equal(tex.image.length, 6); assert.ok(tex.image[0].isDataTexture && tex.image[0].image.width === 16); assert.equal(tex.mipmaps.length, 2); assert.equal(tex.mipmaps[1].image[5].image.width, 4);
    assert.equal(hall.uniforms.uClubHallEnv.value, tex); assert.deepEqual(hall.uniforms.uClubHallPar.value.toArray(), [1, 2, 1, 1]);
    assert.deepEqual(hall.uniforms.uClubHallRough.value, [0, 0.5, 1, 1, 1, 1, 1, 1]);
    // up is brighter in red, down in blue, as the staged light says (x the unit of a white matt surface)
    const up = H.fromHalf(tex.image[2].image.data[(8 * 16 + 8) * 4]), down = H.fromHalf(tex.image[3].image.data[(8 * 16 + 8) * 4]);
    assert.ok(Math.abs(up - 2 * H.HALL_ENV.unit) < 0.01 && Math.abs(down - 0) < 0.01, `up ${up}, down ${down}`);
    // the tagged standard material is patched once: its own hook runs first, its key is kept, the term is set anew after the fade
    assert.deepEqual(st.readers.map((r) => [r.name, r.share, r.keep]), [['arena.floor.bright', 1, 0]]); assert.deepEqual(st.refused, ['arena.floor.glow']); assert.equal(st.tagged, 2);
    assert.equal(a.s.steel.customProgramCacheKey(), `room|vol|${H.HALL_ENV.key}`);
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    a.s.steel.onBeforeCompile(shader, null);
    assert.deepEqual(a.s.calls, ['own']);
    const fs = shader.fragmentShader;
    assert.ok(fs.indexOf('radiance *= 0.0;') > 0 && fs.indexOf('radiance *= 0.0;') < fs.indexOf('radiance = uClubHallShare.x * clubHallEnv('), 'the earlier fade cannot reach the hall\'s term');
    assert.equal(shader.uniforms.uClubHallEnv, hall.uniforms.uClubHallEnv); assert.deepEqual(shader.uniforms.uClubHallShare.value.toArray(), [1, 0, 0, 0]);
    assert.equal(a.s.matt.onBeforeCompile.name === 'clubHallCompile', false, 'an untagged material is not touched');
    st = a.env.state().hall;
    assert.deepEqual(st.readers.map((r) => [r.compiled, r.samplers]), [[true, 1]], 'the reader\'s program binds one texture of this service');
    // walking again patches nothing twice; a late material is found by a later walk; share() is live
    a.tick(40); assert.equal(a.env.state().hall.readers.length, 1); assert.equal(a.s.steel.customProgramCacheKey(), `room|vol|${H.HALL_ENV.key}`);
    const late = new THREE.MeshPhysicalMaterial({ name: 'arena.surround.metal' }); late.userData.clubHall = { share: 0.8, keep: 0.1 };
    a.s.room.group.add(new THREE.Mesh(new THREE.BufferGeometry(), late));
    a.env.rebuild();
    assert.deepEqual(a.env.state().hall.readers.map((r) => [r.name, r.share, r.keep]), [['arena.floor.bright', 1, 0], ['arena.surround.metal', 0.8, 0.1]]);
    assert.equal(hall.share(a.s.steel, 0.5, 0.25), true); assert.deepEqual(shader.uniforms.uClubHallShare.value.toArray(), [0.5, 0.25, 0, 0]); assert.equal(hall.share(a.s.matt, 1), false);
    assert.equal(hall.apply(a.s.sprite), false); assert.equal(hall.apply(a.s.matt, { share: 1 }), true, 'apply() patches an untagged standard material on request');
    // tools: exposure, the correction, the term
    assert.equal(hall.tool.exposure(0.5), 0.5); assert.equal(hall.tool.box(false), 0); assert.equal(hall.tool.on(false), 0); assert.deepEqual(hall.uniforms.uClubHallPar.value.toArray(), [0.5, 2, 0, 0]);
    // the lite tier asks for its own id; the stand-in switch asks for nothing
    const l = await build({ tier: 'lite', query: 'clubenv=hall:file' }); await l.env.hall.ready;
    assert.deepEqual(l.requests, ['arena.env.lite']);
    const so = await build({ query: 'clubenv=hall:standin' }); await so.env.hall.ready;
    assert.deepEqual(so.requests, []); assert.match(so.env.state().hall.file, /not asked/);
    // a file that fits: taken, the same texture object, the record's probe and box over the live floor, the file's levels
    const mkPng = async (rec) => {
      // a real PNG of the light role's layout (n = 4), written here with node's zlib: RGBA8, filter 0, one IDAT, the tEXt record
      const zlib = await import('node:zlib');
      const n = 4, W = 24, Hh = 7, raw = Buffer.alloc((W * 4 + 1) * Hh);
      for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) raw.set([64, 64, 64, 136], y * (W * 4 + 1) + 1 + x * 4); // radiance 64 everywhere
      const crcT = new Uint32Array(256).map((_, i) => { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
      const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
      const chunk = (type, data) => { const t = Buffer.from(type, 'latin1'), len = Buffer.alloc(4), cr = Buffer.alloc(4); len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([len, t, data, cr]); };
      const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(Hh, 4); ihdr[8] = 8; ihdr[9] = 6;
      const text = Buffer.concat([Buffer.from(H.HALL_ENV.textKey + '\0', 'latin1'), Buffer.from(JSON.stringify(rec), 'latin1')]);
      const out = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('tEXt', text), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
      return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
    };
    const rec = { v: 1, enc: 'rgbe', n: 4, levels: [{ s: 4, y: 0, rough: 0 }, { s: 2, y: 4, rough: 0.5 }, { s: 1, y: 6, rough: 1 }], probe: [0.5, 1.5, 0], box: { min: [-11, 0, -12.6], max: [14, 9.5, 12.6] }, sig: 'abc', hidden: ['table', 'luminaire'] };
    if (typeof DecompressionStream === 'function') {
      const f = await build({ query: 'clubenv=hall:file', bytes: await mkPng(rec) });
      const texBefore = f.env.hall.texture;
      await f.env.hall.ready;
      st = f.env.state().hall;
      assert.equal(st.source, 'file', st.file); assert.equal(f.env.hall.texture, texBefore, 'one stable texture object');
      assert.deepEqual([st.size, st.levels, st.rough, st.peak], [4, 3, [0, 0.5, 1], 64]); assert.equal(st.bytes.gpu, 6 * (16 + 4 + 1) * 8);
      assert.deepEqual(st.pos.map((v) => +v.toFixed(3)), [0.5, 0.732, 0]); assert.deepEqual(st.box.max.map((v) => +v.toFixed(3)), [14, 8.732, 12.6]);
      assert.deepEqual(st.record.hidden, ['table', 'luminaire']); assert.equal(texBefore.image[0].image.width, 4); assert.equal(texBefore.mipmaps.length, 2);
      assert.equal(H.fromHalf(texBefore.mipmaps[1].image[3].image.data[0]), 64);
      // the seat moves: the cube's place and box follow the live floor
      f.s.room.floorY = -0.7; f.tick(1);
      assert.deepEqual(f.env.state().hall.pos.map((v) => +v.toFixed(3)), [0.5, 0.8, 0]);
      // a cube of another hall is refused; the stand-in stays and says why
      const other = await build({ query: 'clubenv=hall:file', bytes: await mkPng({ ...rec, sig: 'zzz' }) }); await other.env.hall.ready;
      assert.equal(other.env.hall.source, 'stand-in'); assert.match(other.env.state().hall.file, /another hall/); assert.match(other.env.state().hall.reason, /stand-in stays/);
      const broken = await build({ query: 'clubenv=hall:file', bytes: new ArrayBuffer(16) }); await broken.env.hall.ready;
      assert.equal(broken.env.hall.source, 'stand-in'); assert.match(broken.env.state().hall.file, /failed|refused/);
    }
    // the switch off: no member, no request, nothing patched
    const off = await build({ query: 'clubenv=hall:0' });
    assert.ok(!('hall' in off.env) && !('hall' in off.env.state())); assert.deepEqual(off.requests, []); assert.equal(off.s.steel.customProgramCacheKey(), 'room|vol');
    // the club venue, named or not, whatever the query says: no member, no request, no hook
    for (const venue of ['club', undefined]) for (const query of ['', 'clubenv=hall:1', 'clubenv=hall:file']) {
      const s = stage();
      const requests = [];
      const win = new EventTarget(); const scene = new THREE.Scene();
      const club = { tier: 'high', knobs: TIERS.high, room: s.room, onFrame: () => {}, assets: { state: () => ({}), bytes: (id) => { requests.push(id); return Promise.resolve(null); } },
        ctx: { renderer: { standIn: true }, scene, rebakeEnv: () => {}, query: new URLSearchParams(query) }, adopt: { find: () => [], patch: () => true } };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      globalThis.window = win;
      let env;
      try { env = await createEnv(club); } finally { delete globalThis.window; }
      assert.ok(!('hall' in env) && !('hall' in env.state()), `club (${venue}, '${query}'): no hall member`);
      assert.deepEqual(requests, []); assert.equal(s.steel.customProgramCacheKey(), 'room|vol'); assert.equal(s.asked.length, 0);
    }
  });

  await ok('venues: the cloth and wood parts in the arena — a neutral flat ambient term at the same level, the carpet as the floor\'s stand-in, the rig read as the luminaire; club is as it was', async () => {
    const { applyCloth } = await import('../../scene/club/mat/cloth.js');
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const stage = async (venue, albedo, query = '') => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.66), new THREE.MeshBasicMaterial({ color: 0xffffff })); face.name = 'clubLamp.face'; face.position.set(0, 1.0, 0); scene.add(face);
      const rail = new THREE.MeshStandardMaterial({ name: 'rail', color: 0x111111 }); rail.userData.obClass = 'railwood';
      scene.add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.6), rail));
      const cloth = new THREE.MeshStandardMaterial({ name: 'cloth' }); cloth.userData.obClass = 'cloth';
      scene.updateMatrixWorld(true);
      const frames = [];
      // a luminaire as CONTRACT.md 13.4 lists the rig's members: face() and state(), no `enabled`
      const faceData = { shape: 'rect', long: 'x', half: [1.0, 0.33], panels: [{}, {}, {}], panelSize: [0.6, 0.6], frame: { bar: 0.02 }, levels: {}, tubes: [] };
      const club = { tier: 'base', knobs: TIERS.base, ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        adopt: { find: (c) => (c === 'cloth' ? [cloth] : c === 'railwood' ? [rail] : []), patch: () => true },
        room: { enabled: true, box: { min: new THREE.Vector3(-11, -0.79, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo },
          light: { irradianceAt: () => [0.01, 0.01, 0.012] }, lightmap: {},
          parts: { lamp: { face: () => ({ faces: [faceData] }), state: () => ({ face: { law: [1, 0.5, 0.95] } }) } } } };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const c = await applyCloth(club); c.rebuild('test'); for (const fn of frames) fn(0, 1 / 60);
      const w = await applyWood(club); w.rebuild('test'); for (const fn of frames) fn(0, 1 / 60);
      return { cloth: c.state(), wood: w.state() };
    };
    const lvl = (t) => 0.2126 * t[0] + 0.7152 * t[1] + 0.0722 * t[2];
    const a = await stage('arena'), c = await stage('club'), d = await stage(undefined);
    // cloth: the flat part of the ambient light is neutral in the hall and warm in the club room; its level is the same look value
    const ta = a.cloth.uniforms.uClubClothAmbTint, tc = c.cloth.uniforms.uClubClothAmbTint;
    assert.deepEqual(ta.slice(0, 3), [CLOTH_TUNE.pool.ambient, CLOTH_TUNE.pool.ambient, CLOTH_TUNE.pool.ambient], 'arena: neutral, at the cloth part\'s ambient level');
    assert.ok(tc[0] > tc[2], 'club: warm'); assert.deepEqual(tc, d.cloth.uniforms.uClubClothAmbTint);
    assert.ok(Math.abs(lvl(ta) / lvl(tc) - 1) < 0.06, 'the two levels are within 6 %: a dark hall does not darken the bed');
    assert.deepEqual(a.cloth.venue, { venue: 'arena', envGain: CLOTH_TUNE.env.gain * VENUES.arena.ambient, flatTint: [1, 1, 1] });
    assert.ok(!('venue' in c.cloth) && !('venue' in d.cloth), 'no venue member in the club state');
    assert.deepEqual(c.cloth.tune, JSON.parse(JSON.stringify(CLOTH_TUNE)), 'club: the cloth table itself');
    assert.equal(a.cloth.key, c.cloth.key, 'the same patch key in both venues (values differ, not shader text)');
    assert.deepEqual(a.cloth.uniforms.uClubClothPool, c.cloth.uniforms.uClubClothPool, 'the pool (gain, ambient level, floor) is the same');
    // the tool switch for a pair: ?clubcloth=novenue under arena is the club's cloth in the hall; under club it does nothing
    const off = await stage('arena', undefined, 'clubcloth=novenue');
    assert.deepEqual(off.cloth.uniforms, c.cloth.uniforms); assert.ok(!('venue' in off.cloth));
    assert.deepEqual((await stage('club', undefined, 'clubcloth=novenue')).cloth.uniforms, c.cloth.uniforms);
    // wood: the floor's stand-in reflectance, used only while the room publishes none
    assert.deepEqual(a.wood.table.light.floorAlbedo, [...VENUES.arena.floorAlbedo]); assert.equal(a.wood.table.light.albedoFrom, 'the stand-in');
    assert.deepEqual(c.wood.table.light.floorAlbedo, [0.2, 0.11, 0.055]); assert.deepEqual(d.wood.table.light.floorAlbedo, [0.2, 0.11, 0.055]);
    for (const venue of ['arena', 'club']) {
      const own = await stage(venue, [0.3, 0.2, 0.1]);
      assert.deepEqual(own.wood.table.light.floorAlbedo, [0.3, 0.2, 0.1], `${venue}: the room's own albedo wins`); assert.equal(own.wood.table.light.albedoFrom, 'club.room.floor.albedo');
    }
    // wood: the venue's luminaire without an `enabled` member is read under arena (the rig's contract lists none); club asks for enabled === true
    assert.equal(a.wood.table.face.from, 'the club luminaire'); assert.equal(c.wood.table.face.from, 'the light'); assert.equal(d.wood.table.face.from, 'the light');
    // the room half extents the wood part mirrors: the hall's, from the room box
    assert.deepEqual(a.wood.table.room, { half: [11, 12.6], from: 'box' });
  });

  await ok('venues: the table body in the hall (round A2) — under arena the body takes the hall variant of the coat and a black body a lacquer finish; rail caps, sights and the club venue keep every string and number; ?clubwood=nohall is the off arm', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const G = await import('../../scene/club/mat/wood/glsl.js');
    const L = await import('../../scene/club/mat/wood/layout.js');
    const RAIL_LINE = 'a\nreflectedLight.directDiffuse *= spikeShadow;\nb';
    const stage = async (venue, query = '') => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const tag = (name, cls, color) => { const m = new THREE.MeshStandardMaterial({ name, color }); m.userData.obClass = cls; return m; };
      const rail = tag('rail', 'railwood', 0x111111), apron = tag('apron', 'apron', 0x0b0b0b), legs = tag('legs', 'apron', 0x0b0b0b);
      const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
      at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.62), rail), 0, 0.02, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.54), apron), 0, -0.1, 0);
      for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), legs), x, -0.49, z);
      scene.updateMatrixWorld(true);
      const frames = [], patches = [];
      // the room answers as the arena's does: 3.5 units on the table's sides, 10 on the floor beside it
      const club = { tier: 'base', knobs: TIERS.base, ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        adopt: { find: (c) => (c === 'railwood' ? [rail] : c === 'apron' ? [apron, legs] : []), classify() {},
          patch: (m, spec) => { m.onBeforeCompile?.({ fragmentShader: RAIL_LINE, uniforms: {} }); patches.push({ name: m.name, key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: Object.keys(spec.uniforms).sort().join(',') }); return true; } },
        room: { enabled: true, box: { min: new THREE.Vector3(-11, -0.79, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo: [0.047, 0.051, 0.063] },
          light: { irradianceAt: (p, n) => (n[1] > 0.5 ? [10, 10, 10] : n[1] < -0.5 ? [0.06, 0.06, 0.06] : [3.5, 3.5, 3.5]) }, lightmap: {} } };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyWood(club);
      for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches };
    };
    // (round A3: the hall body has a second model, the next arm's; this arm pins round A2's, which stays in the tree as
    // the tool arm `?clubwood=hallA2`, the off arm of an A2 | A3 pair)
    const a = await stage('arena', 'clubwood=hallA2'), c = await stage('club'), d = await stage(undefined);
    const key = (r, name) => r.patches.find((p) => p.name === name).key;
    // arena: the body's two materials take the hall variant, the rail cap the club variant
    assert.equal(key(a, 'rail'), 'mat-wood-v3:wood'); assert.equal(key(a, 'apron'), 'mat-wood-v3:wood+hall'); assert.equal(key(a, 'legs'), 'mat-wood-v3:wood+hall');
    const hallApply = a.patches.find((p) => p.name === 'apron').apply;
    assert.ok(hallApply.includes('uClubWoodHall') && a.patches.find((p) => p.name === 'apron').pars.includes('uniform vec4 uClubWoodHall;'));
    assert.ok(a.patches.find((p) => p.name === 'apron').uniforms.split(',').includes('uClubWoodHall'), 'the hall uniform is handed to the patch');
    // the heads' elevation comes from the room: floor light over side light, inside the table's bounds
    assert.deepEqual(a.state.table.hall.uniform, [+(10 / 3.5).toFixed(4), L.HALL_BODY.ambient, L.HALL_BODY.foot, L.HALL_BODY.footHeight]);
    assert.equal(a.state.table.hall.tanFromRoom, +(10 / 3.5).toFixed(3)); assert.match(a.state.table.hall.from, /analytic room light/);
    assert.equal(L.hallTan([[1, 1, 1], [1, 1, 1], [9, 9, 9], [0, 0, 0], [1, 1, 1], [1, 1, 1]], [[9, 9, 9], [9, 9, 9], [9, 9, 9], [9, 9, 9]]), L.HALL_BODY.tan[1], 'bounded above');
    assert.equal(L.hallTan([[9, 9, 9], [9, 9, 9], [9, 9, 9], [0, 0, 0], [9, 9, 9], [9, 9, 9]], [[1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1]]), L.HALL_BODY.tan[0], 'bounded below');
    assert.equal(L.hallTan(null, null), L.HALL_BODY.tan[1]); assert.equal(L.hallTan([[0, 0, 0]], [[5, 5, 5]]), L.HALL_BODY.tan[1], 'no light on the sides: the upper bound, never a division by zero');
    // a black body is lacquered in the hall: a narrower coat, less matte; a wood body keeps its finish
    const body = (r) => r.state.materials.find((m) => m.name === 'apron');
    assert.equal(body(a).finish, 'black-laminate'); assert.equal(body(a).coat[1], L.HALL_BODY.black.coatRoughness); assert.equal(body(c).coat[1], 0.3);
    assert.ok(L.HALL_BODY.black.matte < L.finishParams('black-laminate', 'body').matte && L.HALL_BODY.black.matte >= 0.015, 'less matte than the satin board, not a mirror');
    assert.ok(L.HALL_BODY.black.coatRoughness >= 0.075 && L.HALL_BODY.black.coatRoughness < 0.3);
    const wood = L.finishParams('wood', 'body');
    assert.deepEqual(L.hallBodyParams(wood, 'wood'), wood); assert.notEqual(L.hallBodyParams(wood, 'wood'), wood);
    const bl = L.finishParams('black-stain', 'body'), hb = L.hallBodyParams(bl, 'black-stain');
    assert.deepEqual([hb.coat, hb.matte, hb.depth, hb.scan, hb.contrast], [[1.0, L.HALL_BODY.black.coatRoughness, bl.coat[2], bl.coat[3]], L.HALL_BODY.black.matte, L.HALL_BODY.black.depth, bl.scan, bl.contrast]);
    assert.equal(L.finishParams('black-stain', 'body').matte, 0.045, 'the table of finishes itself is not edited');
    // the rail cap's numbers are the same in both venues
    const cap = (r) => r.state.materials.find((m) => m.name === 'rail');
    assert.deepEqual(cap(a), cap(c));
    // the club venue, named or not: no hall key, no hall uniform, no hall member, and the same patches as each other
    for (const r of [c, d]) {
      assert.ok(r.patches.every((p) => p.key === 'mat-wood-v3:wood'), 'club: one key');
      assert.ok(r.patches.every((p) => !p.apply.includes('uClubWoodHall') && !p.pars.includes('uClubWoodHall') && !p.uniforms.split(',').includes('uClubWoodHall')));
      assert.ok(!('hall' in r.state.table) && !('uClubWoodHall' in r.part.uniforms));
    }
    assert.deepEqual(c.patches, d.patches); assert.deepEqual(c.state, d.state);
    // the club's text is the committed text: the coat without the option is the string the wood arm pins, and the option's default is off
    assert.equal(G.woodPatchParts('wood', RAIL_LINE, { map: true }).key, 'mat-wood-v3:wood');
    assert.equal(JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: true, hall: false })), JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: true })));
    assert.equal(c.patches.find((p) => p.name === 'apron').apply, JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: true }).apply));
    assert.ok(!G.WOOD_COAT.includes('uClubWoodHall') && G.WOOD_COAT_HALL.includes('uClubWoodHall') && G.WOOD_COAT.includes('mix( 0.35, 1.0, smoothstep( 0.0, 0.3, cwBh ) )'));
    assert.equal(JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, { map: true, hall: true })), JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, { map: true })), 'a sight never takes the hall variant');
    // the off arm: ?clubwood=nohall under arena is the club room's body in the hall; under club it changes nothing
    const off = await stage('arena', 'clubwood=nohall');
    assert.deepEqual(off.patches.map((p) => [p.name, p.key, p.apply, p.pars, p.uniforms]), c.patches.map((p) => [p.name, p.key, p.apply, p.pars, p.uniforms]));
    assert.ok(!('hall' in off.state.table)); assert.equal(body(off).coat[1], 0.3);
    const clubOff = await stage('club', 'clubwood=nohall');
    assert.deepEqual(clubOff.patches, c.patches); assert.deepEqual(clubOff.state, c.state);
    // the tool: hall: [tangent, diffuse share, foot level, foot height]; null puts the room's tangent back
    assert.deepEqual(a.part.debug({ hall: [1.5, 0.3, 0.4, 0.1] }).table.hall.uniform, [1.5, 0.3, 0.4, 0.1]);
    assert.equal(a.part.debug({ hall: [null] }).table.hall.uniform[0], +(10 / 3.5).toFixed(4));
    assert.ok(!('hall' in c.part.debug({ hall: [1.5, 0.3, 0.4, 0.1] }).table), 'the tool does nothing under the club venue');
  });

  await ok('venues: the table body in the hall, second model (round A3) — the lacquer mirrors the floor as the room holds it (a floor map in place of the scan on a black body), the bounce comes from the same map, the diffuse reflectance is the albedo table\'s 0.04; the default follows HALL_MODEL; the club venue takes none of it', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const G = await import('../../scene/club/mat/wood/glsl.js');
    const L = await import('../../scene/club/mat/wood/layout.js');
    const RAIL_LINE = 'a\nreflectedLight.directDiffuse *= spikeShadow;\nb';
    const ISLAND = { island: { x0: -5.6, x1: 5.6, z0: -4.3, z1: 4.3 }, boards: { height: 0.9 } };
    // the room as the arena's answers under its bake: 1.3 units on the table's sides, 3 on the open carpet falling toward
    // the boards, 0.1 under the table
    const bakedFloor = (x, z) => (Math.abs(x) < 1.45 && Math.abs(z) < 0.81 ? [0.1, 0.1, 0.1] : [0, 1, 2].map(() => 3 * Math.exp(-0.05 * (x * x + z * z))));
    const stage = async (venue, query = '', { tier = 'base', baked = true, layout = ISLAND, bodyColor = 0x0b0b0b } = {}) => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const tag = (name, cls, color) => { const m = new THREE.MeshStandardMaterial({ name, color }); m.userData.obClass = cls; return m; };
      const rail = tag('rail', 'railwood', 0x111111), apron = tag('apron', 'apron', bodyColor), legs = tag('legs', 'apron', bodyColor);
      const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
      at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.62), rail), 0, 0.02, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.54), apron), 0, -0.1, 0);
      for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), legs), x, -0.49, z);
      scene.updateMatrixWorld(true);
      const frames = [], patches = [];
      const room = { enabled: true, box: { min: new THREE.Vector3(-11, -0.79, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo: [0.13, 0.13, 0.14] },
        light: { volume: { enabled: true }, irradianceAt: (p, n) => (n[1] > 0.5 ? [3, 3, 3] : n[1] < -0.5 ? [0.1, 0.1, 0.1] : [1.3, 1.3, 1.3]) },
        lightmap: baked ? { texture: {}, floorIrradiance: bakedFloor } : {} };
      if (layout) room.layout = layout;
      const club = { tier, knobs: TIERS[tier], ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        adopt: { find: (c) => (c === 'railwood' ? [rail] : c === 'apron' ? [apron, legs] : []), classify() {},
          patch: (m, spec) => { m.onBeforeCompile?.({ fragmentShader: RAIL_LINE, uniforms: {} }); patches.push({ name: m.name, key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: Object.keys(spec.uniforms).sort().join(',') }); return true; } },
        room };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyWood(club);
      for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches };
    };
    const key = (r, name) => r.patches.find((p) => p.name === name).key;
    const patch = (r, name) => r.patches.find((p) => p.name === name);
    const a = await stage('arena', 'clubwood=hall2');
    // a black body: the floor map is the one sampler this part adds, in place of the scan; the rail cap keeps the club text
    assert.equal(key(a, 'rail'), 'mat-wood-v3:wood'); assert.equal(key(a, 'apron'), 'mat-wood-v3:wood-nomap+hall2+floor'); assert.equal(key(a, 'legs'), 'mat-wood-v3:wood-nomap+hall2+floor');
    const pars = patch(a, 'apron').pars, apply = patch(a, 'apron').apply;
    assert.equal(pars.split('uniform sampler2D').length - 1, 1, 'one sampler from this part');
    assert.ok(pars.includes('uniform sampler2D uClubWoodFloorMap;') && !pars.includes('uClubWoodMap;'));
    for (const u of ['uClubWoodHall', 'uClubWoodFloorBox', 'uClubWoodFloorLv', 'uClubWoodRing', 'uClubWoodFloorMap']) assert.ok(patch(a, 'apron').uniforms.split(',').includes(u), `${u} is handed to the patch`);
    assert.ok(apply.includes('clubWoodHallRad( vClubWoodPos, cwRw, clubWoodCR )') && apply.includes('clubWoodHallFloor(') && apply.includes('textureLod( uClubWoodFloorMap'));
    assert.ok(!G.WOOD_COAT_HALL2.includes('cwRoom *= mix(') && G.WOOD_COAT_HALL.includes('cwRoom *= mix( 1.0, cwSoft, 0.7 )'), 'no occlusion factor is laid over the coat\'s image of the room (round A2 had one)');
    assert.ok(!G.WOOD_COAT.includes('clubWoodHallRad') && !G.WOOD_COAT_HALL.includes('clubWoodHallRad') && !G.WOOD_FN.includes('clubWoodHall'), 'the club text and round A2\'s hold none of it');
    assert.equal(patch(a, 'rail').apply, JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: true }).apply));
    // the finish: the albedo table's value as the diffuse reflectance, a gloss coat, no flat fill under it
    const H = a.state.table.hall, B = L.HALL_BODY2.black;
    assert.equal(H.model, 2); assert.equal(H.under, 0);
    assert.ok(Math.abs(L.hallMatte() + B.appAlbedo * B.depth - 0.04) < 1e-12, 'CONTRACT 15.2: the table body\'s diffuse reflectance is 0.04');
    const body = (r) => r.state.materials.find((m) => m.name === 'apron');
    assert.deepEqual([body(a).finish, body(a).coat[1], body(a).floorMap, body(a).matte, body(a).under], ['black-laminate', B.coatRoughness, true, +L.hallMatte().toFixed(4), 0]);
    assert.ok(B.coatRoughness >= 0.05 && B.coatRoughness <= 0.11, 'a gloss lacquer: the carpet is an image with soft edges');
    const wood = L.finishParams('wood', 'body');
    assert.deepEqual(L.hallBodyParams2(wood, 'wood'), wood); assert.notEqual(L.hallBodyParams2(wood, 'wood'), wood);
    // the floor as the room holds it: the island, the boards' top, the table's shadow in the map, the bounce share
    assert.match(H.floor.from, /baked floor map/); assert.equal(H.floor.on, 1); assert.equal(H.floor.size, L.HALL_BODY2.floor.size); assert.equal(H.floor.holes, 0);
    assert.deepEqual(H.floor.rect, { centre: [0, 0], half: [5.6, 4.3], from: 'the room layout\'s island' });
    assert.ok(Math.abs(H.floor.boards.top - (a.state.table.floorY + 0.9)) < 1e-3);
    assert.ok(H.floor.stations.under[0] < 0.1 * H.floor.stations.longSide[0], 'the carpet under the table is dark in the map');
    assert.ok(H.floor.stations.boardsFoot[0] < 0.7 * H.floor.stations.longSide[0], 'the pool falls toward the boards');
    assert.ok(Math.abs(H.floor.stations.longSide[0] - 0.13 * bakedFloor(0, 0.81 + 1)[0] / Math.PI) < 0.004, 'radiance = albedo x irradiance / pi');
    assert.ok(H.bounceShare > 0.02 && H.bounceShare < 0.5); assert.equal(H.uniform[1], H.bounceShare);
    assert.deepEqual([H.uniform[2], H.uniform[3]], [L.HALL_BODY2.foot, L.HALL_BODY2.footHeight]);
    assert.deepEqual(a.state.table.bodySwitches, [1, 1, 1], 'the bounce is this part\'s own under the bake: the floor map answers it');
    const tex = a.part.uniforms.uClubWoodFloorMap.value;
    assert.ok(tex.isDataTexture && tex.image.width === 128 && tex.image.height === 128 && tex.generateMipmaps === true && tex.name === 'club.wood.hallfloor');
    assert.equal(H.floor.bytes, Math.round(128 * 128 * 4 * 4 / 3));
    const lv = a.part.uniforms.uClubWoodFloorLv.value;
    assert.deepEqual([lv.y, lv.w], [5, 1]); assert.ok(Math.abs(lv.z - (5.6 + 4.3) / 128) < 1e-6);
    // other rooms: an analytic one (a coarser map, a stand-in for the table's shadow, no bounce share), one without a layout
    // (the room box, bounded; no boards), the lite tier (the coarser map)
    const an = (await stage('arena', 'clubwood=hall2', { baked: false })).state.table.hall;
    assert.match(an.floor.from, /analytic/); assert.equal(an.floor.size, L.HALL_BODY2.floor.sizeLite); assert.equal(an.bounceShare, 0); assert.equal(an.floor.on, 1);
    assert.ok(an.floor.stations.under[0] < 0.5 * an.floor.stations.longSide[0]);
    const nl = (await stage('arena', 'clubwood=hall2', { layout: null })).state.table.hall;
    assert.deepEqual(nl.floor.rect, { centre: [0, 0], half: L.HALL_BODY2.floor.maxHalf.slice(), from: 'the room box' }); assert.equal(nl.floor.boards, null);
    assert.equal((await stage('arena', 'clubwood=hall2', { tier: 'lite' })).state.table.hall.floor.size, L.HALL_BODY2.floor.sizeLite);
    // a wood body keeps its scan and its finish and mirrors the floor's four sides
    const wb = await stage('arena', 'clubwood=hall2', { bodyColor: 0x6b3a1e });
    assert.equal(key(wb, 'apron'), 'mat-wood-v3:wood+hall2'); assert.equal(body(wb).finish, 'wood'); assert.equal(body(wb).floorMap, false);
    assert.ok(patch(wb, 'apron').pars.includes('uClubWoodMap;') && !patch(wb, 'apron').pars.includes('uClubWoodFloorMap') && patch(wb, 'apron').apply.includes('clubWoodHallRad('));
    // the tools: the map off (the four sides), the bounce share by hand and back
    assert.equal(a.part.debug({ floorMap: 0 }).table.hall.floor.on, 0); assert.equal(a.part.debug({ floorMap: 1 }).table.hall.floor.on, 1);
    assert.equal(a.part.state().table.hall.floor.builds, 1, 'the map is built once while the room\'s light stands still');
    assert.deepEqual(a.part.debug({ hall: [1.5, 0.3, 0.4, 0.1] }).table.hall.uniform, [1.5, 0.3, 0.4, 0.1]);
    assert.equal(a.part.debug({ hall: [null, null] }).table.hall.uniform[1], H.bounceShare);
    // the default is wood/layout.js HALL_MODEL; under the club venue neither token nor tool does anything
    // (round A4: the default may be the third model, the next arm's; this model stays behind `?clubwood=hall2`)
    const def = await stage('arena'), same = await stage('arena', L.HALL_MODEL === 3 ? 'clubwood=hall3' : (L.HALL_MODEL === 2 ? 'clubwood=hall2' : 'clubwood=hallA2'));
    assert.ok(L.HALL_MODEL === 1 || L.HALL_MODEL === 2 || L.HALL_MODEL === 3);
    assert.deepEqual(def.patches, same.patches); assert.deepEqual(def.state, same.state);
    const c = await stage('club'), c2 = await stage('club', 'clubwood=hall2'), cA = await stage('club', 'clubwood=hallA2');
    assert.deepEqual(c2.patches, c.patches); assert.deepEqual(cA.patches, c.patches); assert.deepEqual(c2.state, c.state);
    assert.ok(c.patches.every((p) => p.key === 'mat-wood-v3:wood' && !/uClubWoodFloorMap|uClubWoodFloorBox|uClubWoodRing|uClubWoodHall/.test(p.pars + p.apply + p.uniforms)));
    assert.ok(!('uClubWoodFloorMap' in c.part.uniforms) && !('hall' in c.part.debug({ floorMap: 0 }).table));
    // the pure parts: the field's coding, the fill of unanswered texels, where a mirror ray ends, the coat's Fresnel
    const rect = L.hallFloorRect({ layout: ISLAND, centre: [0, 0], floorY: -0.79 });
    const field = L.hallFloorField({ rect, size: 128, sample: bakedFloor, albedo: [0.13, 0.13, 0.13] });
    for (const [x, z] of [[0, 2], [3, 1], [-4, -3], [5, 4]]) assert.ok(Math.abs(L.hallFloorAt(field, rect, x, z)[0] / (0.13 * bakedFloor(x, z)[0] / Math.PI) - 1) < 0.03, `the map at ${x}, ${z}`);
    const holed = L.hallFloorField({ rect, size: 16, sample: (x, z) => (x > 2 ? null : [2, 2, 2]), albedo: [0.1, 0.1, 0.1] });
    assert.ok(holed.holes > 0 && Math.abs(L.hallFloorAt(holed, rect, 5, 0)[0] - 0.2 / Math.PI) < 1e-3, 'an unanswered texel takes its neighbour\'s light');
    assert.equal(L.hallFloorField({ rect, size: 8, sample: () => null, albedo: [1, 1, 1] }).holes, 64);
    const mirror = (P, cam, N) => { const v = [cam[0] - P[0], cam[1] - P[1], cam[2] - P[2]]; const l = Math.hypot(...v); const nv = (v[0] * N[0] + v[1] * N[1] + v[2] * N[2]) / l; return { nv, d: [0, 1, 2].map((i) => 2 * nv * N[i] - v[i] / l) }; };
    const v10 = mirror([0, -0.2, 0.81], [-4.2, 0.95, 2.8], [0, 0, 1]);   // the long apron from the wide eye-height view
    const end = L.hallMirrorEnd([0, -0.2, 0.81], v10.d, { floorY: -0.79, rect });
    assert.equal(end.kind, 'floor'); assert.ok(Math.abs(end.at[0] - 2.15) < 0.05 && Math.abs(end.at[1] - 1.83) < 0.05, 'it mirrors the open carpet a metre off the long side');
    assert.ok(Math.abs(L.coatFresnel(v10.nv) - 0.105) < 0.004, 'and returns a tenth of it at 65 degrees');
    const low = mirror([0, -0.2, 0.81], [0, -0.05, 2.8], [0, 0, 1]);     // a camera at the height of the bed: the ray reaches the boards
    assert.equal(L.hallMirrorEnd([0, -0.2, 0.81], low.d, { floorY: -0.79, rect }).kind, 'board');
    assert.equal(L.hallMirrorEnd([0, -0.2, 0.81], [0, 0.2, 0.98], { floorY: -0.79, rect }).kind, 'hall', 'a rising ray');
    assert.equal(L.hallMirrorEnd([0, -0.2, 0.81], low.d, { floorY: -0.79, rect: { ...rect, boardTop: null } }).kind, 'floor', 'no boards: the floor beyond');
    assert.ok(Math.abs(L.hallTableShade([0, 0], { centre: [0, 0], outer: [1.45, 0.81] }) - 0.3) < 1e-9 && L.hallTableShade([4, 0], { centre: [0, 0], outer: [1.45, 0.81] }) === 1);
    assert.ok(Math.abs(L.hallBounceShare([[1.3, 1.3, 1.3], [1.3, 1.3, 1.3], [3, 3, 3], [0, 0, 0], [1.3, 1.3, 1.3], [1.3, 1.3, 1.3]], [[3, 3, 3], [3, 3, 3], [3, 3, 3], [3, 3, 3]], [0.13, 0.13, 0.13]) - 0.12) < 1e-9);
    assert.equal(L.hallBounceShare(null, null, [0.13, 0.13, 0.13]), 0);
    // the tangent per side: each side by its own floor over its own face, bounded; no light: the upper bound
    assert.deepEqual(L.hallTans([[1, 1, 1], [2, 2, 2], [9, 9, 9], [0, 0, 0], [4, 4, 4], [0.1, 0.1, 0.1]], [[2, 2, 2], [2, 2, 2], [6, 6, 6], [6, 6, 6]]), [2, L.HALL_BODY2.tan[0], 1.5, L.HALL_BODY2.tan[1]]);
    assert.deepEqual(L.hallTans(null, null), [0, 0, 0, 0].map(() => L.HALL_BODY2.tan[1]));
    // the two lights per side: the LOW light's tangent is pooled over the sides (a key lights one face and the floor beside
    // every side: a side's own floor over its own face read four keys at 25 degrees as 52 degrees, and the long aprons
    // stood wholly in the overhang's shadow; found by an albedo pair in the app, job `al`)
    {
      const g = (v) => [v, v, v], t25 = Math.tan(25 * Math.PI / 180), c = Math.cos(25 * Math.PI / 180), s = Math.sin(25 * Math.PI / 180);
      const hi = L.HALL_BODY2.tan[1];
      const aF = [0.3, 0.3, 0.3 * hi, 0, 0.3, 0.3].map(g), aG = [0, 1, 2, 3].map(() => g(0.3 * hi));
      const bF = [0.3 + c, 0.3 + c, 0.3 * hi, 0, 0.3 + c, 0.3 + c].map(g);
      const all = L.hallSides({ baked: { faces: bF, floor: aG.map((v) => g(v[0] + 4 * s)) }, analytic: { faces: aF, floor: aG }, share: 0 });
      for (const v of all.low) assert.ok(Math.abs(v - t25) < 1e-9, `four keys at 25 degrees, every one seen from the floor: the low tangent is theirs (${v})`);
      const three = L.hallSides({ baked: { faces: bF, floor: aG.map((v) => g(v[0] + 3 * s)) }, analytic: { faces: aF, floor: aG }, share: 0 });
      for (const v of three.low) assert.ok(v > 0.3 && v < t25, `a key hidden from the floor stations shortens the shadow, never lengthens it (${v})`);
      for (const v of all.lowShare) assert.ok(v > 0.7 && v < 0.8, `the keys' share of a face's direct light (${v})`);
      assert.deepEqual(all.steep, [hi, hi, hi, hi]);
      const two = L.hallSides({ baked: { faces: [0.3, 0.3, 0.3 * hi, 0, 0.3 + c, 0.3 + c].map(g), floor: aG.map((v, i) => g(v[0] + (i < 2 ? 2 : 1) * s)) }, analytic: { faces: aF, floor: aG }, share: 0 });
      assert.ok(Math.abs(two.low[2] - t25) < 1e-9 && Math.abs(two.low[3] - t25) < 1e-9 && two.lowShare[0] === 0 && two.low[0] === two.steep[0], `two keys: the lit sides take the tangent from the station that sees both (${two.low})`);
      const none = L.hallSides({ analytic: { faces: aF, floor: aG } });
      assert.deepEqual(none.lowShare, [0, 0, 0, 0]); assert.deepEqual(none.low, none.steep);
    }
    assert.deepEqual(H.tansBySide, [bakedFloor(1.45 + 0.81, 0)[0] / 1.3, bakedFloor(1.45 + 0.81, 0)[0] / 1.3, bakedFloor(0, 0.81 + 0.81)[0] / 1.3, bakedFloor(0, 0.81 + 0.81)[0] / 1.3].map((v) => +v.toFixed(3)));
    assert.ok(patch(a, 'apron').uniforms.split(',').includes('uClubWoodHallT') && apply.includes('uClubWoodHallT'));
    // the rail's strip under the arena: a quarter of the scan holds the band a black rail cap reads (cap 0.127 m, outer face 0.045 m, the margin)
    const row = L.SCANS['wood_dark.color']; assert.equal(row.strip, 0, 'the table of scans itself says whole: the club room shares it');
    const place = L.scanPlacement({ ...row, strip: L.HALL_RAIL_STRIP }, L.finishParams('black-stain', 'rail').scale, true);
    assert.equal(L.HALL_RAIL_STRIP, 4);
    assert.ok(Math.abs(place.metres[1] - 0.3) < 1e-9 && place.metres[0] === 1.2 && place.margin[1] === 0.12);
    assert.ok(0.127 + 0.045 + place.margin[1] * place.metres[1] < place.metres[1], 'the band a rail cap reads lies inside one strip');
    // a black hall body asks for no scan (the floor map took its place); the rail still does, in both venues
    assert.equal(body(a).scan, null); assert.equal(a.state.materials.find((m) => m.name === 'rail').scan, 'wood_dark.color');
    assert.equal(c.state.materials.find((m) => m.name === 'apron').scan, 'wood_dark.color');
  });

  await ok('venues: the table body in the hall BY ITS OWN MATERIAL (round A4, the third model) — every body part keeps the app\'s colour, map, roughness and environment gain; one lobe, no lamp term, no scan, no pedestal; the floor map is the one sampler; the default follows HALL_MODEL; the club venue takes none of it', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const G = await import('../../scene/club/mat/wood/glsl.js');
    const L = await import('../../scene/club/mat/wood/layout.js');
    const RAIL_LINE = 'a\nreflectedLight.directDiffuse *= spikeShadow;\nb';
    const ISLAND = { island: { x0: -5.6, x1: 5.6, z0: -4.3, z1: 4.3 }, boards: { height: 0.9 } };
    const bakedFloor = (x, z) => (Math.abs(x) < 1.45 && Math.abs(z) < 0.81 ? [0.1, 0.1, 0.1] : [0, 1, 2].map(() => 3 * Math.exp(-0.05 * (x * x + z * z))));
    // the app's cabinet as the scene holds it (table.js, the black-stained oak): the apron at roughness 0.58, the legs at
    // 0.70, both with a live environment gain of 2.2
    const stage = async (venue, query = '', { tier = 'base', bodyColor = 0x151517, gain = 2.2, skirt = false } = {}) => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const tag = (name, cls, color, roughness) => { const m = new THREE.MeshStandardMaterial({ name, color, roughness }); m.userData.obClass = cls; return m; };
      const rail = tag('rail', 'railwood', 0x111111, 0.66), apron = tag('apron', 'apron', bodyColor, 0.58), legs = tag('legs', 'apron', 0x0f0f11, 0.7);
      if (gain !== null) { apron.userData.spikeEnvGain = { value: gain }; legs.userData.spikeEnvGain = { value: gain }; }
      const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
      at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.62), rail), 0, 0.02, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.54), apron), 0, -0.1, 0);
      for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), legs), x, -0.49, z);
      // (a skirt: a band that reaches the outline, 1 cm inside it at the ends and 2 cm on the long sides, 13 cm deep)
      if (skirt) at(new THREE.Mesh(new THREE.BoxGeometry(2.88, 0.13, 1.58), apron), 0, -0.065, 0);
      scene.updateMatrixWorld(true);
      const frames = [], patches = [], asked = [];
      const room = { enabled: true, box: { min: new THREE.Vector3(-11, -0.79, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo: [0.13, 0.13, 0.14] },
        light: { volume: { enabled: true }, irradianceAt: (p, n) => (n[1] > 0.5 ? [3, 3, 3] : n[1] < -0.5 ? [0.1, 0.1, 0.1] : [1.3, 1.3, 1.3]) },
        lightmap: { texture: {}, floorIrradiance: bakedFloor }, layout: ISLAND };
      const club = { tier, knobs: TIERS[tier], ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        assets: { texture: (id) => { asked.push(id); return null; }, ready: () => Promise.resolve(), state: () => ({ ids: {} }) },
        adopt: { find: (c) => (c === 'railwood' ? [rail] : c === 'apron' ? [apron, legs] : []), classify() {},
          patch: (m, spec) => { m.onBeforeCompile?.({ fragmentShader: RAIL_LINE, uniforms: {} }); patches.push({ name: m.name, key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: Object.keys(spec.uniforms).sort().join(',') }); return true; } },
        room };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyWood(club);
      for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches, asked, mats: { rail, apron, legs } };
    };
    const patch = (r, name) => r.patches.find((p) => p.name === name);
    const mat = (r, name) => r.state.materials.find((m) => m.name === name);
    // (`nokeys`: this block pins round A4's body by itself; round A6's key lights on it have their own block below)
    const a = await stage('arena', 'clubwood=hall3,nokeys');
    // keys and text: the body's own variant, the rail cap the club's
    assert.equal(patch(a, 'rail').key, 'mat-wood-v3:wood'); assert.equal(patch(a, 'apron').key, 'mat-wood-v3:wood-nomap+hall3+floor'); assert.equal(patch(a, 'legs').key, 'mat-wood-v3:wood-nomap+hall3+floor');
    assert.equal(patch(a, 'rail').apply, JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: true }).apply));
    const pars = patch(a, 'apron').pars, apply = patch(a, 'apron').apply;
    assert.equal(pars.split('uniform sampler2D').length - 1, 1, 'one sampler from this part: the floor map');
    assert.ok(pars.includes('uniform sampler2D uClubWoodFloorMap;') && !pars.includes('uClubWoodMap;') && pars.includes('uniform vec4 uClubWoodOwn;'));
    for (const u of ['uClubWoodOwn', 'uClubWoodHall', 'uClubWoodFloorBox', 'uClubWoodFloorLv', 'uClubWoodRing', 'uClubWoodFloorMap', 'uClubWoodHallT', 'uClubWoodHallK', 'uClubWoodHallW']) assert.ok(patch(a, 'apron').uniforms.split(',').includes(u), `${u} is handed to the patch`);
    assert.ok(!patch(a, 'rail').uniforms.split(',').includes('uClubWoodOwn'), 'the rail cap takes no own-material uniform');
    // one lobe read through the own-material function; no lamp lobe, no scratch fan; the app's albedo stays
    assert.ok(apply.includes('clubWoodOwnRad( vClubWoodPos, cwRw, clubWoodCR )') && apply.includes('clubWoodOwnLobe(') && apply.includes('vec3 cwLamp = vec3( 0.0 );'));
    assert.ok(!G.WOOD_COAT_HALL3.includes('clubWoodLampLobe') && !G.WOOD_COAT_HALL3.includes('clubWoodBrush'), 'no lamp term on the body: the lamp is behind every outward face and above the top');
    assert.ok(apply.includes('diffuseColor.rgb *= mix( 1.0, uClubWoodBase.x') && !apply.includes('diffuse * cwTint * cwRel'), 'the app\'s colour and its own map are the albedo');
    assert.ok(!/cameraPosition/.test(G.WOOD_COAT_HALL3 + G.WOOD_FN_OWN), 'no camera-position term: the lobe turns with the view direction at the surface, nothing more');
    assert.ok(G.WOOD_FN_OWN.includes(`min( rough, ${L.HALL_OWN.upRough} )`), 'the upper sample\'s roughness bound is the layout\'s');
    for (const t of [G.WOOD_COAT, G.WOOD_COAT_HALL, G.WOOD_COAT_HALL2, G.WOOD_FN, G.woodFnHall({ floor: true })]) assert.ok(!/clubWoodOwn|uClubWoodOwn/.test(t), 'the club text and rounds A2 and A3 hold none of it');
    // what the app's material gives each part is what the part shows: roughness, gain, its colour at depth 1, no flat fill;
    // the matt pedestal is the finish table's own (the number the club venue gives the same material), not a venue's
    const H = a.state.table.hall;
    assert.equal(H.model, 3); assert.equal(H.under, 0); assert.ok(!('black' in H) && H.own.direct === 1);
    const clubMatte = L.finishParams('black-laminate', 'body').matte;
    assert.equal(clubMatte, 0.045); assert.equal(L.finishParams('black-stain', 'leg').matte, clubMatte);
    for (const [name, rough] of [['apron', 0.58], ['legs', 0.7]]) {
      const m = mat(a, name);
      assert.deepEqual([m.coat[0], m.coat[1], m.coat[2], m.haze[1], m.brush[0], m.matte, m.depth, m.under, m.floorMap, m.scan], [1, rough, 0, 0, 0, clubMatte, 1, 0, true, null], `${name}: the material's own roughness is its one lobe`);
      assert.deepEqual(m.pore, [0, 0, L.HALL_OWN.pedestalFigure, L.HALL_OWN.figure]);
      assert.equal(m.own.roughness, rough); assert.equal(m.own.gain, 2.2);
      assert.deepEqual(m.own.uniform, [2.2, L.HALL_OWN.direct, L.HALL_OWN.spread, L.HALL_OWN.sample]);
    }
    assert.equal(mat(await stage('club'), 'apron').matte ?? clubMatte, clubMatte);
    // the tool arm: no pedestal, the app's colour alone
    const bare = await stage('arena', 'clubwood=hall3,nokeys,ownbare');
    assert.equal(mat(bare, 'apron').matte, 0); assert.equal(mat(bare, 'legs').matte, 0); assert.equal(patch(bare, 'apron').key, patch(a, 'apron').key);
    assert.ok(apply.includes('uClubWoodFill.a * mix( 1.0, clubWoodFig, uClubWoodPore.z )'), 'the pedestal follows the app\'s own map');
    assert.ok(!a.asked.some((id) => /veneer/.test(id)), 'no veneer scan is asked for');
    assert.equal(a.mats.apron.roughness, 0.58); assert.equal(a.mats.apron.color.getHex(), 0x151517); assert.equal(a.mats.apron.userData.spikeEnvGain.value, 2.2);
    // the floor machinery is round A3's
    assert.match(H.floor.from, /baked floor map/); assert.equal(H.floor.size, L.HALL_BODY2.floor.size); assert.equal(H.uniform[1], H.bounceShare);
    assert.deepEqual([H.uniform[2], H.uniform[3]], [L.HALL_OWN.foot, L.HALL_OWN.footHeight]);
    // a body of any finish takes it (no scan in any case): a wood cabinet, a cabinet without a gain holder
    const wb = await stage('arena', 'clubwood=hall3,nokeys', { bodyColor: 0x6b3a1e, gain: null });
    assert.equal(patch(wb, 'apron').key, 'mat-wood-v3:wood-nomap+hall3+floor'); assert.equal(mat(wb, 'apron').finish, 'wood'); assert.equal(mat(wb, 'apron').own.gain, 1);
    assert.ok(wb.state.notes.every((n) => !/turned to a wood finish/.test(n)));
    // tools: a held gain and lights' factor, and back
    assert.deepEqual(mat({ state: a.part.debug({ own: { gain: 1, direct: 2 } }) }, 'apron').own.uniform.slice(0, 2), [1, 2]);
    assert.deepEqual(mat({ state: a.part.debug({ own: { gain: null, direct: null } }) }, 'legs').own.uniform.slice(0, 2), [2.2, 1]);
    // the default is wood/layout.js HALL_MODEL; the other models stay behind their tokens; the club venue takes nothing
    assert.ok([1, 2, 3].includes(L.HALL_MODEL));
    const def = await stage('arena'), same = await stage('arena', L.HALL_MODEL === 3 ? 'clubwood=hall3' : (L.HALL_MODEL === 2 ? 'clubwood=hall2' : 'clubwood=hallA2'));
    assert.deepEqual(def.patches, same.patches); assert.deepEqual(def.state, same.state);
    assert.equal(patch(await stage('arena', 'clubwood=hall2'), 'apron').key, 'mat-wood-v3:wood-nomap+hall2+floor');
    assert.equal(patch(await stage('arena', 'clubwood=hallA2'), 'apron').key, 'mat-wood-v3:wood+hall');
    assert.equal(patch(await stage('arena', 'clubwood=nohall'), 'apron').key, 'mat-wood-v3:wood');
    const c = await stage('club'), c3 = await stage('club', 'clubwood=hall3');
    assert.deepEqual(c3.patches, c.patches); assert.deepEqual(c3.state, c.state);
    assert.ok(c.patches.every((p) => p.key === 'mat-wood-v3:wood' && !/uClubWoodOwn|clubWoodOwn|uClubWoodFloorMap|uClubWoodHall/.test(p.pars + p.apply + p.uniforms)));
    assert.ok(!('own' in mat(c, 'apron')) && !('hall' in c.part.debug({ own: { gain: 3 } }).table));
    // the pure parts. The gain a material carries
    assert.equal(L.ownEnvGain({ userData: { spikeEnvGain: { value: 2.2 } } }), 2.2); assert.equal(L.ownEnvGain({ userData: {} }), 1); assert.equal(L.ownEnvGain(null), 1);
    assert.equal(L.ownEnvGain({ envMap: {}, envMapIntensity: 0.5, userData: {} }), 0.5); assert.equal(L.ownEnvGain({ envMapIntensity: 0.5, userData: {} }), 1, 'the scene\'s cube: the material\'s number is a dead knob');
    assert.equal(L.ownEnvGain({ userData: { spikeEnvGain: { value: 40 } } }), L.HALL_OWN.gain[1]); assert.equal(L.ownEnvGain({ userData: { spikeEnvGain: { value: NaN } } }), 1);
    const p0 = L.finishParams('black-stain', 'body'), po = L.hallOwnParams(p0, { roughness: 0.58 });
    assert.deepEqual([po.coat, po.matte, po.depth, po.haze[1], po.pore, po.scan], [[1, 0.58, 0, 0.12], p0.matte, 1, 0, [0, 0, L.HALL_OWN.pedestalFigure, L.HALL_OWN.figure], p0.scan]); assert.equal(p0.matte, 0.045, 'the table of finishes itself is not edited');
    assert.equal(L.hallOwnParams(p0, { roughness: 0.58, bare: true }).matte, 0); assert.equal(L.hallOwnParams(L.finishParams('wood', 'body'), { roughness: 0.5 }).matte, 0.03);
    assert.equal(L.hallOwnParams(p0, { roughness: 7 }).coat[1], 1); assert.equal(L.hallOwnParams(p0, {}).coat[1], 0.6);
    // the lobe for one light: the mirror configuration is its peak, D x Vis x F in closed form; nothing from behind
    const N = [0, 0, 1], up = (deg) => [0, Math.sin(deg * Math.PI / 180), Math.cos(deg * Math.PI / 180)];
    const a58 = 0.58 * 0.58;
    const peak = L.ownLobe(N, up(-20), up(20), a58);
    assert.ok(Math.abs(peak - (1 / (Math.PI * a58 * a58)) * (0.5 / (2 * Math.cos(20 * Math.PI / 180) * Math.sqrt(Math.cos(20 * Math.PI / 180) ** 2 * (1 - a58 * a58) + a58 * a58))) * (0.04 + 0.96 * (1 - Math.cos(20 * Math.PI / 180)) ** 5)) < 1e-9, 'the mirror configuration in closed form');
    assert.ok(L.ownLobe(N, up(17), up(22), a58) < peak && L.ownLobe(N, up(17), up(60), a58) < L.ownLobe(N, up(17), up(22), a58), 'a low light gives an eye above the face more than a steep one');
    assert.equal(L.ownLobe(N, up(17), [0, 0, -1], a58), 0);
    // by arithmetic: a face under 2 units returns 0.004 to 0.03 of radiance through this lobe from any pose over the floor
    for (const el of [5, 17, 30]) for (const le of [22, 60]) { const v = 2 * L.ownLobe(N, up(el), up(le), a58); assert.ok(v > 0.003 && v < 0.07, `2 units through the lobe: ${v}`); }
    // the split: a lobe about the horizon is half below it; far below it is all floor; the samples keep off the horizon
    const s0 = L.ownLobeSplit(0, 0.58);
    assert.ok(Math.abs(s0.down - 0.5) < 1e-9 && Math.abs(s0.half - 1.25 * a58) < 1e-9 && Math.abs(s0.elDown + 0.8 * s0.half) < 1e-9 && Math.abs(s0.elUp - 0.8 * s0.half) < 1e-9);
    assert.equal(L.ownLobeSplit(-0.9, 0.58).down, 1); assert.equal(L.ownLobeSplit(0.9, 0.58).down, 0);
    assert.ok(L.ownLobeSplit(0, 0.58).elUp > 0.3 && L.ownLobeSplit(0, 0.7).elUp > 0.45, 'the upper sample stays 17 degrees or more over the cube\'s horizon: the lit bed under it is never read');
    // the table's own overhangs: a slanted skirt is lit (round A3's test counted it as standing behind itself); what hangs
    // below the skirt is shaded by the skirt's foot; a light from straight above reaches nothing under the cabinet
    assert.ok(L.ownShade({ inset: 0.03, skirtInset: 0.04, depthRail: 0.1, depthSkirt: -0.033, tan: 1.34 }) > 0.99, 'the skirt, 3 cm inside the outline and 10 cm under the rail, is lit');
    assert.ok(L.ownShade({ inset: 0.01, skirtInset: 0.04, depthRail: 0.01, depthSkirt: -0.123, tan: 1.34 }) < 0.5, 'its top centimetre lies in the rail\'s shadow');
    assert.ok(L.ownShade({ inset: 0.135, skirtInset: 0.04, depthRail: 0.163, depthSkirt: 0.03, tan: 1.34 }) < 0.05 && L.ownShade({ inset: 0.135, skirtInset: 0.04, depthRail: 0.433, depthSkirt: 0.3, tan: 1.34 }) > 0.99, 'a leg: shaded under the cabinet, lit lower down');
    assert.ok(L.ownShade({ inset: 0.135, skirtInset: 0.04, depthRail: 0.213, depthSkirt: 0.08, tan: 0.35 }) > 0.99, 'a low light reaches a leg 8 cm under the skirt');
    assert.equal(L.ownShade({ inset: 0.135, skirtInset: 0.04, depthRail: 0.133, depthSkirt: 0, tan: 3.5 }), 0);
    assert.ok(Math.abs(L.skirtFootInset([[0, 0, 0.806], [0, -0.133, 0.77], [0.5, -0.13, 0.775], [0, -0.05, 0.79]], { centre: [0, 0], outer: [1.4478, 0.8128] }) - 0.0378) < 1e-9, 'the foot of a slanted skirt: the lowest vertices, the one furthest out');
    assert.equal(L.skirtFootInset([], { centre: [0, 0], outer: [1, 1] }), 0);
    assert.ok(apply.includes('uClubWoodRing.w') && apply.includes('cwBelow') && !G.WOOD_COAT_HALL2.includes('uClubWoodRing.w') && !G.WOOD_COAT_HALL2.includes('cwBelow'), 'round A3\'s text keeps its own test');
    // in the scene: a skirt piece that reaches the outline is found, and its foot's inset reaches the shader
    const sk = await stage('arena', 'clubwood=hall3,nokeys', { skirt: true });
    assert.ok(Math.abs(sk.state.table.skirtBottom + 0.13) < 1e-3); assert.ok(Math.abs(sk.state.table.hall.own.skirtFootInset - 0.01) < 1e-3, `the skirt's foot (${sk.state.table.hall.own.skirtFootInset})`);
    assert.equal(sk.part.uniforms.uClubWoodRing.value.w, sk.state.table.hall.own.skirtFootInset);
    assert.equal(a.state.table.hall.own.skirtFootInset, null); assert.equal(a.part.uniforms.uClubWoodRing.value.w, 0);
    assert.equal((await stage('arena', 'clubwood=hall2', { skirt: true })).part.uniforms.uClubWoodRing.value.w, 0, 'round A3\'s model is handed no inset');
    // three's environment fit, mirrored: 3 to 5 % at the review angles, more at grazing
    assert.ok(L.ownEnvBrdf(0.8, 0.58) > 0.025 && L.ownEnvBrdf(0.8, 0.58) < 0.035 && L.ownEnvBrdf(0.3, 0.58) > 0.07 && L.ownEnvBrdf(0.3, 0.58) < 0.1);
  });

  await ok('venues: the hall\'s key lights on the table\'s body, each with its own direction (round A6) — read from the room\'s own records, evaluated by the room light\'s law with their shutters, shaded by the table\'s own overhangs along their own direction; their share comes out of the sides\' numbers; its own key and text, no sampler, no camera term; `nokeys` is round A5\'s body; the club venue takes none of it', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const G = await import('../../scene/club/mat/wood/glsl.js');
    const L = await import('../../scene/club/mat/wood/layout.js');
    const { readFileSync } = await import('node:fs');
    const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
    const RAIL_LINE = 'a\nreflectedLight.directDiffuse *= spikeShadow;\nb';
    const ISLAND = { island: { x0: -5.6, x1: 5.6, z0: -4.3, z1: 4.3 }, boards: { height: 0.9 } };
    const bakedFloor = (x, z) => (Math.abs(x) < 1.45 && Math.abs(z) < 0.81 ? [0.1, 0.1, 0.1] : [0, 1, 2].map(() => 3 * Math.exp(-0.05 * (x * x + z * z))));
    // two table keys as arena/rig/plan.js hands them to the bake (a profile's flat cone; two blades: a shutter through the
    // lens and the near rail's top edge, a second one through the lens and a line on the carpet 0.15 m outside the outline), a far fill that is NOT a key, and a one-sided record that this reader does not take
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const KEYS = [
      { id: 'key.sw.s', type: 'point', position: V(-2.78, 2.80, 2.74), normal: null, axis: V(0.6, -0.675, -0.43), size: [0.12, 1], color: new THREE.Color(1, 0.97, 0.92), intensity: 62, radius: 12, cone: 24, bell: false, shutter: [0, -0.5734, 0.8193], foot: [0, 0.4458, -0.8951] },
      { id: 'key.ne.e', type: 'point', position: V(3.46, 2.74, -1.235), normal: null, axis: V(-0.528, -0.791, 0.309), size: [0.12, 1], color: new THREE.Color(1, 0.97, 0.92), intensity: 22, radius: 12, cone: 24, bell: false, shutter: [0.8012, -0.5984, 0], foot: [-0.8833, 0.4688, 0] },
      { id: 'fill.south', type: 'point', position: V(1.07, 3.92, 9.28), normal: null, axis: V(-0.105, -0.399, -0.911), size: [0.45, 1], color: new THREE.Color(1, 1, 1), intensity: 30, radius: 40, cone: 17, bell: true },
      { id: 'key.panel', type: 'point', position: V(0, 3, 0), normal: V(0, -1, 0), axis: V(0, -1, 0), size: [0.3, 1], color: new THREE.Color(1, 1, 1), intensity: 5, radius: 12 },
    ];
    const stage = async (venue, query = '', { tier = 'base', baked = true, keys = KEYS, rules = undefined } = {}) => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const tag = (name, cls, color, roughness) => { const m = new THREE.MeshStandardMaterial({ name, color, roughness }); m.userData.obClass = cls; m.userData.spikeEnvGain = { value: 2.2 }; return m; };
      const rail = tag('rail', 'railwood', 0x111111, 0.66), apron = tag('apron', 'apron', 0x151517, 0.58), legs = tag('legs', 'apron', 0x0f0f11, 0.7);
      const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
      at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.62), rail), 0, 0.02, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.54), apron), 0, -0.1, 0);
      for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), legs), x, -0.49, z);
      scene.updateMatrixWorld(true);
      const frames = [], patches = [];
      const room = { enabled: true, box: { min: new THREE.Vector3(-11, -0.768, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo: [0.13, 0.13, 0.14] }, floorY: -0.768,
        light: { volume: { enabled: baked }, irradianceAt: (p, n, o) => (n[1] > 0.5 ? [3, 3, 3] : n[1] < -0.5 ? [0.1, 0.1, 0.1] : (o?.baked === false ? [0.6, 0.6, 0.6] : [2.6, 2.6, 2.6])) },
        lightmap: baked ? { texture: {}, floorIrradiance: bakedFloor } : {}, layout: ISLAND, bakeEmitters: keys, ...(rules !== undefined ? { bakeRules: rules } : {}), state: () => ({ seat: { appFloor: -0.79, lift: 0.022, off: false } }) };
      const club = { tier, knobs: TIERS[tier], ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        assets: { texture: () => null, ready: () => Promise.resolve(), state: () => ({ ids: {} }) },
        adopt: { find: (c) => (c === 'railwood' ? [rail] : c === 'apron' ? [apron, legs] : []), classify() {},
          patch: (m, spec) => { m.onBeforeCompile?.({ fragmentShader: RAIL_LINE, uniforms: {} }); patches.push({ name: m.name, key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: Object.keys(spec.uniforms).sort().join(',') }); return true; } },
        room };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyWood(club);
      for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches };
    };
    const patch = (r, name) => r.patches.find((p) => p.name === name);
    const KEYED = 'mat-wood-v3:wood-nomap+hall3+floor+keys', PLAIN = 'mat-wood-v3:wood-nomap+hall3+floor';
    const KU = ['uClubWoodKeyP', 'uClubWoodKeyC', 'uClubWoodKeyA', 'uClubWoodKeyS', 'uClubWoodKeyF', 'uClubWoodKeyD', 'uClubWoodKeyN', 'uClubWoodKeyW'];

    // ---- the switch: `keys` on, `nokeys` off, the default as HALL_KEYS.on says; the club venue takes none of it
    const on = await stage('arena', 'clubwood=keys'), off = await stage('arena', 'clubwood=nokeys'), dflt = await stage('arena'), c = await stage('club', 'clubwood=keys');
    assert.equal(patch(on, 'apron').key, KEYED); assert.equal(patch(on, 'legs').key, KEYED); assert.equal(patch(on, 'rail').key, 'mat-wood-v3:wood');
    assert.equal(patch(off, 'apron').key, PLAIN); assert.equal(patch(dflt, 'apron').key, L.HALL_KEYS.on ? KEYED : PLAIN);
    assert.equal(patch(c, 'apron').key, 'mat-wood-v3:wood'); assert.equal(patch(c, 'rail').apply, patch(on, 'rail').apply, 'the rail cap is the club\'s in every case');
    for (const u of KU) { assert.ok(patch(on, 'apron').uniforms.split(',').includes(u), u); assert.ok(!patch(off, 'apron').uniforms.split(',').includes(u) && !patch(c, 'apron').uniforms.split(',').includes(u) && !patch(c, 'rail').uniforms.split(',').includes(u) && !patch(off, 'rail').uniforms.split(',').includes(u), `${u} only with the keys`); }
    // `nokeys` is round A5's body to the character and the number: the text and key of the third model, its foot numbers, no key state
    assert.equal(patch(off, 'apron').apply, JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: false, hall: 3, floor: true }).apply));
    assert.equal(patch(off, 'apron').pars, G.woodPatchParts('wood', RAIL_LINE, { map: false, hall: 3, floor: true }).pars);
    assert.deepEqual([off.state.table.hall.uniform[2], off.state.table.hall.uniform[3]], [L.HALL_OWN.foot, L.HALL_OWN.footHeight]); assert.equal(off.state.table.hall.keys, undefined); assert.equal(c.state.table.hall, undefined);
    assert.deepEqual([on.state.table.hall.uniform[2], on.state.table.hall.uniform[3]], [L.HALL_KEYS.foot, L.HALL_KEYS.footHeight], 'the contact at the carpet is this model\'s: a line, not a gradient');
    assert.ok(L.HALL_KEYS.foot < L.HALL_OWN.foot && L.HALL_KEYS.footHeight < L.HALL_OWN.footHeight && L.HALL_KEYS.footHeight >= 0.01 && L.HALL_KEYS.footHeight <= 0.05);

    // ---- the text: built from round A4's body by exact replacements, each hitting once; its own functions and uniforms
    assert.equal(G.HALL3_KEY_EDITS.length, 5);
    for (const [from, to] of G.HALL3_KEY_EDITS) { assert.equal(G.WOOD_COAT_HALL3.split(from).length - 1, 1, `'${from.trim().slice(0, 40)}' stands once in round A4's body`); assert.equal(G.WOOD_COAT_HALL3K.split(to).length - 1, 1); assert.ok(to.startsWith(from) || !G.WOOD_COAT_HALL3K.includes(from)); }
    const apply = patch(on, 'apron').apply, pars = patch(on, 'apron').pars;
    assert.ok(apply.includes('clubWoodKeyE( cwKi, vClubWoodPos, cwNw, cwKl, cwKs )') && apply.includes('clubWoodKeyShade( vClubWoodPos, cwKl, cwKs )') && apply.includes('clubWoodOwnLobe( cwNw, cwVw, cwKl,'), 'each key: its light, its shade along its own direction, the lobe with the true direction');
    assert.ok(apply.includes('( 1.0 - cwWk - cwKw ) * cwSunS') && apply.includes('+ cwKeyD +') && apply.includes('+ cwKeyS * ('), 'the sides keep the rest; the keys are added by themselves');
    assert.ok(apply.indexOf('float clubWoodKeyShade(') > apply.indexOf('float clubWoodOwnLobe(') && apply.indexOf('float clubWoodOwnLobe(') > 0, 'the key functions follow the own-material functions');
    assert.ok(!patch(off, 'apron').apply.includes('clubWoodKey') && !patch(c, 'apron').apply.includes('clubWoodKey') && !patch(on, 'rail').apply.includes('clubWoodKey'));
    assert.equal(pars.split('uniform sampler2D').length - 1, 1, 'no sampler added: the floor map is still the one sampler of this part');
    assert.ok(!/sampler/.test(G.KEY_PARS) && !/cameraPosition|viewMatrix/.test(G.WOOD_FN_KEY) && !/cameraPosition/.test(G.WOOD_COAT_HALL3K), 'lights and a surface normal: no term reads the camera');
    for (const t of [G.WOOD_COAT_HALL3K, G.WOOD_FN_KEY]) { let d = 0, p = 0; for (const ch of t) { if (ch === '{') d += 1; if (ch === '}') d -= 1; if (ch === '(') p += 1; if (ch === ')') p -= 1; assert.ok(d >= 0 && p >= 0); } assert.equal(d, 0); assert.equal(p, 0); }
    assert.equal(JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: false, hall: 2, floor: true, keys: true })), JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { map: false, hall: 2, floor: true })), 'keys only with the third model');
    assert.equal(JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, { hall: 3, keys: true })), JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, {})));
    // the law's constants are the room light's and the bake's
    assert.equal(L.KEY_CONE_BEAM, Number(/CONE = Object\.freeze\(\{ beam: ([0-9.]+) \}\)/.exec(src('../../scene/club/room/light.js'))[1]));
    { const m = /SHUTTER_SOFT = ([0-9.]+), SHUTTER_SOFT_FOOT = ([0-9.]+);/.exec(src('./bake-room-core.mjs')); assert.deepEqual([L.KEY_SHUTTER_SOFT, L.KEY_FOOT_SOFT], [Number(m[1]), Number(m[2])], 'the two blades\' soft edges are the bake\'s'); }
    assert.ok(G.WOOD_FN_KEY.includes(`ka.w > 3.5 ? 1.0 : ${L.KEY_CONE_BEAM} )`) && G.WOOD_FN_KEY.includes(`smoothstep( -${L.KEY_SHUTTER_SOFT}, ${L.KEY_SHUTTER_SOFT}, - dot( L, ks.xyz ) )`) && G.WOOD_FN_KEY.includes(`smoothstep( -${L.KEY_FOOT_SOFT}, ${L.KEY_FOOT_SOFT}, - dot( L, kf.xyz ) )`));

    // ---- the records: ids `key.*`, point emitters without a normal; the strongest first; lifted with the hall's seat
    const rec = L.hallKeyRecords(KEYS, { lift: 0.022 });
    assert.deepEqual(rec.keys.map((k) => k.id), ['key.sw.s', 'key.ne.e']); assert.deepEqual(rec.skipped, ['key.panel']);
    const k0 = rec.keys[0];
    assert.ok(Math.abs(k0.P[1] - 2.822) < 1e-9 && k0.P[3] === 12 && Math.abs(k0.C[0] - 62) < 1e-9 && Math.abs(k0.C[3] - 0.0144) < 1e-12 && Math.abs(Math.hypot(k0.A[0], k0.A[1], k0.A[2]) - 1) < 1e-9);
    assert.ok(Math.abs(k0.A[3] - (2 + Math.cos(24 * Math.PI / 180))) < 1e-12, 'a profile\'s flat cone, packed as the room light packs it'); assert.equal(k0.S[3], 1);
    assert.equal(L.hallKeyRecords([{ ...KEYS[0], bell: true }]).keys[0].A[3], 4 + Math.cos(24 * Math.PI / 180)); assert.equal(L.hallKeyRecords([{ ...KEYS[0], shutter: undefined }]).keys[0].S[3], 0);
    assert.equal(k0.F[3], 1); assert.ok(Math.abs(Math.hypot(k0.F[0], k0.F[1], k0.F[2]) - 1) < 1e-9); assert.deepEqual(L.hallKeyRecords([{ ...KEYS[0], foot: undefined }]).keys[0].F, [0, 0, 0, 0]);
    assert.deepEqual(L.hallKeyRecords(null), { keys: [], skipped: [] }); assert.equal(L.hallKeyRecords([...KEYS, ...[1, 2, 3, 4].map((i) => ({ ...KEYS[0], id: `key.x${i}`, intensity: 100 + i }))]).keys.length, L.HALL_KEYS.max);
    // ---- the law: the room light's for a point emitter (window, cone, source size), the shutter, no light from behind
    const P0 = [-1.2, -0.45, 0.66], lit = L.hallKeyLight(k0, P0, [0, 0, 1]);
    { const l = [k0.P[0] - P0[0], k0.P[1] - P0[1], k0.P[2] - P0[2]], d2 = l[0] ** 2 + l[1] ** 2 + l[2] ** 2, d = Math.sqrt(d2), Lz = l[2] / d;
      const ca = -(l[0] * k0.A[0] + l[1] * k0.A[1] + l[2] * k0.A[2]) / d, cc = Math.cos(24 * Math.PI / 180), t = Math.min(1, Math.max(0, (ca - cc) / ((1 - cc) * 0.64)));
      const win = (1 - (d2 / 144) ** 2) ** 2;
      assert.ok(Math.abs(lit.E[0] - 62 * (t * t * (3 - 2 * t)) * win * Lz / (d2 + 0.0144)) < 1e-9, 'candela x cone x window x cosine / (d2 + source2)'); assert.ok(lit.E[0] > 1 && lit.E[0] < 4, `a leg face 4 m from a 62 cd key: ${lit.E[0]} units`); }
    assert.equal(L.hallKeyLight(k0, P0, [0, 0, -1]).E[0], 0, 'nothing on a face turned away');
    assert.equal(L.hallKeyLight(k0, [-1.2, -0.45, -0.66], [-1, 0, 0]).E[0], 0, 'its shutter ends the south key before the north legs');
    assert.ok(L.hallKeyLight({ ...k0, S: [0, 0, 0, 0] }, [-1.2, -0.45, -0.66], [-1, 0, 0]).E[0] > 0.05, '... which it would reach (at the cone\'s edge) without the blade');
    assert.equal(L.hallKeyLight({ ...k0, P: [k0.P[0], k0.P[1], k0.P[2], 3] }, P0, [0, 0, 1]).E[0], 0, 'out of reach');
    // the second blade (out of focus): nothing off a leg's middle, a little off its lowest centimetres, the carpet in front of the table dark
    { const noF = { ...k0, F: [0, 0, 0, 0] }, sole = [-1.2, -0.75, 0.66], r = L.hallKeyLight(k0, sole, [0, 0, 1]).E[0] / L.hallKeyLight(noF, sole, [0, 0, 1]).E[0];
      assert.equal(L.hallKeyLight(k0, P0, [0, 0, 1]).E[0], L.hallKeyLight(noF, P0, [0, 0, 1]).E[0]); assert.ok(r > 0.75 && r < 0.995, `a near leg's foot keeps ${r} of the key`);
      assert.ok(L.hallKeyLight({ ...k0, S: [0, 0, 0, 0] }, [-1.2, -0.768, 1.4], [0, 1, 0]).E[0] < 1e-6 && L.hallKeyLight({ ...noF, S: [0, 0, 0, 0] }, [-1.2, -0.768, 1.4], [0, 1, 0]).E[0] > 0.5, 'the carpet 0.6 m in front of the outline is cut by the second blade'); }
    // the two side blades (vertical planes through the lens past the two legs of the key's side): none in a record without `sides`; with them the light ends at the plane, and a point between them keeps every bit of it
    assert.deepEqual(k0.D, [[0, 0, 0, 0], [0, 0, 0, 0]]);
    { const kd = L.hallKeyRecords([{ ...KEYS[0], sides: [[1, 0, 0], [0, 0, -2]] }], { lift: 0.022 }).keys[0];
      assert.deepEqual(kd.D, [[1, 0, 0, 1], [0, 0, -1, 1]]);
      assert.equal(L.hallKeyLight(kd, P0, [0, 0, 1]).E[0], lit.E[0]); assert.equal(L.hallKeyLight(kd, [-3.4, -0.45, 0.66], [0, 0, 1]).E[0], 0, 'west of the plane through the lens'); }
    assert.equal(L.KEY_SIDE_SOFT, Number(/SHUTTER_SOFT_SIDE = ([0-9.]+)/.exec(src('./bake-room-core.mjs'))[1]), 'the side blades\' soft edge is the bake\'s');
    assert.ok(G.WOOD_FN_KEY.includes(`smoothstep( -${L.KEY_SIDE_SOFT}, ${L.KEY_SIDE_SOFT}, - dot( L, kd0.xyz ) )`) && G.WOOD_FN_KEY.includes(`smoothstep( -${L.KEY_SIDE_SOFT}, ${L.KEY_SIDE_SOFT}, - dot( L, kd1.xyz ) )`) && G.WOOD_FN_KEY.includes('uClubWoodKeyD[ 2 * i + 1 ]'));
    assert.equal(on.part.uniforms.uClubWoodKeyD.value.length, 2 * L.HALL_KEYS.max);
    // ---- the table's own shade along the key's direction: the apron's shadow across a leg's head, a lit leg below it, a lit skirt
    const geo = { centre: [0, 0], outer: [1.4478, 0.8128], skirtInset: 0.03, railY: 0.011, skirtY: -0.1328, soft: 0.12 / 4.5 };
    const sh = (p) => L.hallKeyShade(p, L.hallKeyLight(k0, p, [0, 0, 1]).L, geo);
    assert.ok(sh([-1.2, -0.16, 0.678]) < 0.02 && sh([-1.2, -0.22, 0.678]) < 0.3 && sh([-1.2, -0.36, 0.678]) > 0.98 && sh([-1.2, -0.7, 0.64]) > 0.98, 'a near leg: dark under the skirt, lit from 0.2 m below it down to the sole');
    assert.ok(sh([-1.2, -0.3, 0.678]) - sh([-1.2, -0.24, 0.678]) > 0.5, 'the edge of the apron\'s shadow on the leg is a line (under 6 cm)');
    assert.ok(sh([0.3, -0.07, 0.80]) > 0.98 && sh([0.3, -0.004, 0.806]) > 0.5, 'the skirt is lit down from the rail');
    assert.ok(sh([-1.0, -0.3, 0.64]) < 0.5 && sh([-1.0, -0.38, 0.62]) > 0.5, 'the cabinet side behind the skirt: lit only low');
    assert.ok(sh([-1.2, -0.45, -0.46]) < 0.02, 'a face that looks under the table: the ray would cross under the whole table');
    assert.equal(L.hallKeyShade([0, -0.07, 0.9], [0, 0.7, 0.714], geo), 1, 'a point outside the outline is not shaded by it');
    // ---- the shares: the same six stations per side as the room's numbers; never more than 1 - minSteep; nothing without direct light
    const tb = { centre: [0, 0], outer: [1.45, 0.81], top: 0.045, floorY: -0.768 };
    const stations = []; L.bodyLight(null, null, tb, { sample: (p, n) => { stations.push([...p, ...n].map((v) => +v.toFixed(6)).join()); return [1, 1, 1]; } });
    const ks = L.hallKeySides(rec.keys, tb);
    assert.ok(ks[2][0] > 0.8 && ks[2][0] < 3 && ks[3][0] === 0 && ks[1][0] >= 0 && ks[0][0] > 0.05, `the south key lights the south side, the north-east key the east side: ${ks.map((e) => e[0].toFixed(2))}`);
    { const one = [{ id: 'k', P: [0, 0.2, 5, 100], C: [10, 10, 10, 0], A: [0, 1, 0, 0], S: [0, 0, 0, 0] }]; const want = [-0.6, 0, 0.6].flatMap((t) => [0.045 - 0.12 * 0.813, 0.045 - 0.55 * 0.813].map((y) => L.hallKeyLight(one[0], [t * 1.45, y, 0.81], [0, 0, 1]).E[0]));
      assert.ok(Math.abs(L.hallKeySides(one, tb)[2][0] - want.reduce((a, b) => a + b, 0) / 6) < 1e-12 && stations.filter((s) => s.endsWith('0,0,1')).length === 6, 'the six stations of a side are bodyLight\'s'); }
    assert.deepEqual(L.hallKeyShares([2, 2, 2, 0], [[1, 1, 1], [0, 0, 0], [9, 9, 9], [1, 1, 1]], [0.7, 0.3, 0.5, 0.5]), { key: [0.5, 0, 1 - L.HALL_KEYS.minSteep, 0], low: [0.7 - 0.5, 0.3, 0, 0] });
    // ---- in the scene: two keys read, lifted by the seat, their share out of the baked sides; the analytic light keeps its sides whole
    const K = on.state.table.hall.keys;
    assert.deepEqual([K.on, K.count, K.ids, K.skipped, K.lift], [1, 2, ['key.sw.s', 'key.ne.e'], ['key.panel'], 0.022]);
    assert.ok(K.shares.key[2] > 0.3 && K.shares.key[2] <= 0.95 && K.shares.key[3] === 0 && Math.abs(K.shareUniform[2] - K.shares.key[2]) < 6e-4, `the south side: ${JSON.stringify(K.shares)}`);
    for (let i = 0; i < 4; i++) assert.ok(K.shares.key[i] + K.shares.low[i] <= 0.95 + 1e-9 && K.shares.low[i] <= K.shares.lowBefore[i] + 1e-9, 'the keys\' share comes out of the low share first');
    assert.equal(on.part.uniforms.uClubWoodKeyN.value.x, 2); assert.equal(on.part.uniforms.uClubWoodKeyS.value[0].w, 1); assert.equal(on.part.uniforms.uClubWoodKeyF.value[0].w, 1); assert.ok(K.list[0].shutter && K.list[0].foot); assert.ok(Math.abs(on.part.uniforms.uClubWoodKeyP.value[0].y - 2.822) < 1e-6);
    const an = await stage('arena', 'clubwood=keys', { baked: false });
    assert.deepEqual(an.state.table.hall.keys.shares.key, [0, 0, 0, 0], 'the analytic light holds no key: nothing to take out'); assert.equal(an.state.table.hall.keys.count, 2);
    const none = await stage('arena', 'clubwood=keys', { keys: null });
    assert.deepEqual([none.state.table.hall.keys.count, none.state.table.hall.keys.shareUniform], [0, [0, 0, 0, 0]], 'a room without key records: the body keeps its sides\' own numbers');
    // round A6b: keys that the room's bake leaves out (`club.room.bakeRules.skip`) are not in the baked sides: nothing is taken out, they are added
    assert.equal(L.hallKeysInBake(null), true); assert.equal(L.hallKeysInBake({ skip: [] }), true); assert.equal(L.hallKeysInBake({ skip: ['key.'] }), false); assert.equal(L.hallKeysInBake({ skip: ['k'] }), false);
    assert.equal(L.hallKeysInBake({ skip: ['fill.', 'key.sw.'] }), true, 'a rule that names some keys only does not cover the prefix'); assert.equal(L.hallKeysInBake({ skip: ['fill.'] }, 'fill.'), false);
    { const out = await stage('arena', 'clubwood=keys', { rules: { skip: ['key.'] } }), KO = out.state.table.hall.keys;
      assert.deepEqual([KO.count, KO.shares.key, KO.shareUniform], [2, [0, 0, 0, 0], [0, 0, 0, 0]], 'keys the bake does not hold: the baked sides keep their whole number');
      assert.deepEqual(KO.shares.low, KO.shares.lowBefore); assert.ok(/not in the bake/.test(KO.from)); assert.deepEqual(KO.sides, K.sides, 'the keys themselves are the same light');
      const inb = await stage('arena', 'clubwood=keys', { rules: { skip: ['fill.'] } }); assert.deepEqual(inb.state.table.hall.keys.shares.key, K.shares.key, 'a rule about other emitters changes nothing'); assert.ok(/taken out of the baked sides/.test(inb.state.table.hall.keys.from) && /taken out of the baked sides/.test(K.from)); }
    // tools: keys off puts the sides' whole number back on the same text
    const st0 = on.part.debug({ keys: 0 });
    assert.deepEqual([st0.table.hall.keys.on, st0.table.hall.keys.shareUniform], [0, [0, 0, 0, 0]]); st0.table.hall.keys.lowUniform.forEach((v, i) => assert.ok(Math.abs(v - st0.table.hall.sides.lowShare[i]) < 6e-4, 'the low share is the sides\' own again'));
    assert.equal(on.part.debug({ keys: 1 }).table.hall.keys.shareUniform[2], K.shareUniform[2]);
  });

  await ok('venues: the hall\'s baked cube in the table body\'s own lobe (round A7) — only under the arena, only in the third model with the keys, only when the env service hands its hall handle; its own key, one sampler, the lobe\'s two samples through one new function; without the switch or the handle the body is round A6\'s to the character; the club venue takes none of it', async () => {
    const { applyWood } = await import('../../scene/club/mat/wood.js');
    const G = await import('../../scene/club/mat/wood/glsl.js');
    const L = await import('../../scene/club/mat/wood/layout.js');
    const H = await import('../../scene/club/env/hall.js');
    const RAIL_LINE = 'a\nreflectedLight.directDiffuse *= spikeShadow;\nb';
    const KEYED = 'mat-wood-v3:wood-nomap+hall3+floor+keys', HENV = KEYED + '+henv';
    const opts = { map: false, hall: 3, floor: true, keys: true };
    // ---- the text (pure)
    const a6 = G.woodPatchParts('wood', RAIL_LINE, opts), a7 = G.woodPatchParts('wood', RAIL_LINE, { ...opts, henv: H.HALL_GLSL });
    assert.equal(a6.key, KEYED); assert.equal(a7.key, HENV);
    assert.equal(a7.pars, a6.pars + G.HENV_PARS + H.HALL_GLSL, 'the declarations: round A6\'s, then this variant\'s one uniform, then the env service\'s text as handed in');
    assert.equal(a7.pars.split('uniform sampler2D').length - 1, 1); assert.equal(a7.pars.split('uniform samplerCube').length - 1, 1, 'one sampler added: the hall\'s cube');
    const fn6 = a6.apply.find((p) => p.code.includes('clubWoodOwnRad(') && p.code.includes('#define CLUB_WOOD_FN')).code, fn7 = a7.apply.find((p) => p.code.includes('clubWoodHallRadE(') && p.code.includes('#define CLUB_WOOD_FN')).code;
    assert.ok(fn7.indexOf('vec3 clubWoodHallRad(') < fn7.indexOf('vec3 clubWoodHallRadE(') && fn7.indexOf('vec3 clubWoodHallRadE(') < fn7.indexOf('vec3 clubWoodOwnRad('), 'declared before its two callers, after round A3\'s function it wraps');
    assert.equal(G.WOOD_FN_OWN.split('clubWoodHallRad(').length - 1, 2); assert.equal(G.WOOD_FN_OWN_HENV.split('clubWoodHallRadE(').length - 1, 2); assert.equal(G.WOOD_FN_OWN_HENV.split('clubWoodHallRad(').length - 1, 0);
    assert.equal(G.WOOD_FN_OWN_HENV.split('clubWoodHallRadE(').join('clubWoodHallRad(').split('CLUB_WOOD_FN_OWN_HENV').join('CLUB_WOOD_FN_OWN'), G.WOOD_FN_OWN, 'the lobe is round A4\'s text with one name changed');
    assert.ok(fn7.includes(G.WOOD_FN_HENV) && fn7.includes(G.WOOD_FN_OWN_HENV) && !fn7.includes(G.WOOD_FN_OWN) && fn6.includes(G.WOOD_FN_OWN) && !fn6.includes('clubWoodHallRadE'));
    // every other piece of the patch is round A6's
    assert.equal(JSON.stringify(a7.apply.filter((p) => !p.code.includes('#define CLUB_WOOD_FN'))), JSON.stringify(a6.apply.filter((p) => !p.code.includes('#define CLUB_WOOD_FN'))));
    assert.equal(a7.vertexPars, a6.vertexPars);
    // at share 0 the new function returns round A6's answer before any lookup; it reads the cube through the env service's functions only
    assert.ok(G.WOOD_FN_HENV.includes('if ( uClubWoodHallEnv.x + uClubWoodHallEnv.y < 1e-4 ) return own;'));
    assert.ok(G.WOOD_FN_HENV.includes('clubHallEnv( P, d, rough )') && G.WOOD_FN_HENV.includes('clubHallEnvFar( x - uClubHallPos, rough )') && !/textureCube|textureLod|cameraPosition/.test(G.WOOD_FN_HENV));
    for (const name of ['clubHallEnv', 'clubHallEnvFar', 'uClubHallPos']) assert.ok(H.HALL_GLSL.includes(name), `the env service's text declares ${name}`);
    { let d = 0, p = 0; for (const ch of G.WOOD_FN_HENV) { if (ch === '{') d += 1; if (ch === '}') d -= 1; if (ch === '(') p += 1; if (ch === ')') p -= 1; assert.ok(d >= 0 && p >= 0); } assert.equal(d, 0); assert.equal(p, 0); }
    // the option changes nothing anywhere else
    for (const o of [{ map: false, hall: 3, floor: true }, { map: true, hall: 2, floor: true, keys: true }, { map: true }, { map: false, hall: true }]) assert.equal(JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { ...o, henv: H.HALL_GLSL })), JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, o)));
    assert.equal(JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, { hall: 3, keys: true, henv: H.HALL_GLSL })), JSON.stringify(G.woodPatchParts('sight', RAIL_LINE, {})));
    for (const henv of [null, '', 7]) assert.equal(JSON.stringify(G.woodPatchParts('wood', RAIL_LINE, { ...opts, henv })), JSON.stringify(a6));
    assert.deepEqual(Object.keys(L.HALL_GLOSS).sort(), ['carpet', 'cube', 'on']); assert.ok(L.HALL_GLOSS.cube >= 0 && L.HALL_GLOSS.cube <= 1 && L.HALL_GLOSS.carpet >= 0 && L.HALL_GLOSS.carpet <= 1);

    // ---- the part: a staged table under a staged hall, with and without the env service's handle
    const handle = () => ({ enabled: true, source: 'stand-in', glsl: H.HALL_GLSL, uniforms: { uClubHallEnv: { value: null }, uClubHallBoxMin: { value: new THREE.Vector3() }, uClubHallBoxMax: { value: new THREE.Vector3() }, uClubHallPos: { value: new THREE.Vector3() }, uClubHallPar: { value: new THREE.Vector4(1, 2, 1, 1) }, uClubHallRough: { value: [0, 0.5, 1, 1, 1, 1, 1, 1] } } });
    const stage = async (venue, query = '', { env = undefined } = {}) => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      const tag = (name, cls, color, roughness) => { const m = new THREE.MeshStandardMaterial({ name, color, roughness }); m.userData.obClass = cls; m.userData.spikeEnvGain = { value: 2.2 }; return m; };
      const rail = tag('rail', 'railwood', 0x111111, 0.66), apron = tag('apron', 'apron', 0x151517, 0.58), legs = tag('legs', 'apron', 0x0f0f11, 0.7);
      const at = (mesh, x, y, z) => { mesh.position.set(x, y, z); scene.add(mesh); return mesh; };
      at(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.62), rail), 0, 0.02, 0);
      at(new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.18, 1.54), apron), 0, -0.1, 0);
      for (const [x, z] of [[-1.2, -0.6], [1.2, -0.6], [-1.2, 0.6], [1.2, 0.6]]) at(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), legs), x, -0.49, z);
      scene.updateMatrixWorld(true);
      const frames = [], patches = [];
      const room = { enabled: true, box: { min: new THREE.Vector3(-11, -0.768, -12.6), max: new THREE.Vector3(14, 8.71, 12.6) }, floor: { albedo: [0.13, 0.13, 0.14] }, floorY: -0.768,
        light: { volume: { enabled: true }, irradianceAt: (p, n) => (n[1] > 0.5 ? [3, 3, 3] : n[1] < -0.5 ? [0.1, 0.1, 0.1] : [2.6, 2.6, 2.6]) },
        lightmap: { texture: {}, floorIrradiance: () => [1, 1, 1] }, layout: { island: { x0: -5.6, x1: 5.6, z0: -4.3, z1: 4.3 }, boards: { height: 0.9 } }, bakeEmitters: [], bakeRules: { skip: ['key.'] }, state: () => ({ seat: { appFloor: -0.79, lift: 0.022, off: false } }) };
      const club = { tier: 'base', knobs: TIERS.base, ctx: { scene, query: new URLSearchParams(query) }, onFrame: (fn) => frames.push(fn),
        assets: { texture: () => null, ready: () => Promise.resolve(), state: () => ({ ids: {} }) },
        adopt: { find: (c) => (c === 'railwood' ? [rail] : c === 'apron' ? [apron, legs] : []), classify() {},
          patch: (m, spec) => { m.onBeforeCompile?.({ fragmentShader: RAIL_LINE, uniforms: {} }); patches.push({ name: m.name, key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: spec.uniforms }); return true; } },
        room, ...(env !== undefined ? { env } : {}) };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyWood(club);
      for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches };
    };
    const patch = (r, name) => r.patches.find((p) => p.name === name);
    const h = handle();
    const on = await stage('arena', 'clubwood=henv', { env: { enabled: true, hall: h } });
    assert.equal(patch(on, 'apron').key, HENV); assert.equal(patch(on, 'legs').key, HENV); assert.equal(patch(on, 'rail').key, 'mat-wood-v3:wood');
    assert.equal(patch(on, 'apron').uniforms.uClubHallEnv, h.uniforms.uClubHallEnv, 'the env service\'s own uniform objects, not copies'); assert.equal(patch(on, 'apron').uniforms.uClubHallPar, h.uniforms.uClubHallPar);
    assert.deepEqual(patch(on, 'apron').uniforms.uClubWoodHallEnv.value.toArray(), [L.HALL_GLOSS.cube, L.HALL_GLOSS.carpet, 0, 0]);
    assert.equal(patch(on, 'apron').uniforms.uClubWoodHallEnv, patch(on, 'legs').uniforms.uClubWoodHallEnv, 'one pair of shares for the whole body');
    for (const u of ['uClubHallEnv', 'uClubWoodHallEnv', 'uClubHallPar']) assert.ok(!(u in patch(on, 'rail').uniforms), `${u}: not on a rail cap`);
    assert.equal(patch(on, 'apron').pars, a7.pars); assert.equal(patch(on, 'apron').apply, JSON.stringify(a7.apply));
    assert.deepEqual(on.state.table.hall.hallEnv, { from: 'club.env.hall', source: 'stand-in', share: [L.HALL_GLOSS.cube, L.HALL_GLOSS.carpet] });
    on.part.debug({ hallEnv: [0.25, 1] }); assert.deepEqual(patch(on, 'apron').uniforms.uClubWoodHallEnv.value.toArray(), [0.25, 1, 0, 0]);
    on.part.debug({ hallEnv: [7, -3] }); assert.deepEqual(patch(on, 'apron').uniforms.uClubWoodHallEnv.value.toArray(), [1, 0, 0, 0], 'a share stays in 0..1');
    // off: the switch, the tool, no service, a service without the handle or with a handle that is off, round A5's body (no keys)
    const dflt = await stage('arena', '', { env: { enabled: true, hall: handle() } });
    assert.equal(patch(dflt, 'apron').key, L.HALL_GLOSS.on === true ? HENV : KEYED);
    for (const [query, env] of [['clubwood=nohenv', { enabled: true, hall: handle() }], ['clubwood=henv', undefined], ['clubwood=henv', { enabled: true }], ['clubwood=henv', { enabled: true, hall: { ...handle(), enabled: false } }], ['clubwood=henv', { enabled: false, hall: handle() }], ['clubwood=henv,nokeys', { enabled: true, hall: handle() }], ['clubwood=henv,hall2', { enabled: true, hall: handle() }]]) {
      const r = await stage('arena', query, { env });
      assert.ok(!patch(r, 'apron').key.includes('+henv'), `${query}: no hall cube in the body`); assert.ok(!('uClubHallEnv' in patch(r, 'apron').uniforms) && !('uClubWoodHallEnv' in patch(r, 'apron').uniforms));
      assert.equal(r.state.table.hall?.hallEnv, undefined);
      if (query === 'clubwood=nohenv' || env === undefined) { assert.equal(patch(r, 'apron').pars, a6.pars); assert.equal(patch(r, 'apron').apply, JSON.stringify(a6.apply)); }
    }
    // the club venue: the club's key and text whatever the query and whatever the env object holds
    for (const venue of ['club', undefined]) {
      const c = await stage(venue, 'clubwood=henv', { env: { enabled: true, hall: handle() } });
      assert.equal(patch(c, 'apron').key, 'mat-wood-v3:wood'); assert.ok(!('uClubHallEnv' in patch(c, 'apron').uniforms) && !('uClubWoodHallEnv' in patch(c, 'apron').uniforms)); assert.equal(c.state.table.hall, undefined);
      assert.equal(patch(c, 'rail').apply, patch(on, 'rail').apply);
    }
  });

  await ok('occlusion: the soles\' contact line on the arena\'s carpet (round A6) — footprints from the table\'s own pieces, a square law inside a short reach, exactly 1 beyond it; its own patch on top of the floor patch; nothing of it without the switch or under the club venue', async () => {
    const M = await import('../../scene/club/occ/model.js');
    const OG = await import('../../scene/club/occ/glsl.js');
    const { readFileSync } = await import('node:fs');
    const box = (x0, y0, z0, x1, y1, z1) => ({ points: [[x0, y0, z0], [x1, y0, z0], [x0, y0, z1], [x1, y0, z1], [x0, y1, z0], [x1, y1, z0], [x0, y1, z1], [x1, y1, z1]] });
    // the default table's four levellers (0.126 m square, 5 mm thick, on the floor), their legs above them (not on the floor), the skirt
    const pieces = [box(-1.44, -0.13, -0.8, 1.44, 0, 0.8)];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { pieces.push(box(sx * 1.2037 - 0.0631, -0.7681, sz * 0.5687 - 0.0631, sx * 1.2037 + 0.0631, -0.7631, sz * 0.5687 + 0.0631)); pieces.push(box(sx * 1.2037 - 0.11, -0.74, sz * 0.5687 - 0.11, sx * 1.2037 + 0.11, -0.1329, sz * 0.5687 + 0.11)); }
    const feet = M.feetOf(pieces, -0.76812);
    assert.equal(feet.length, 4); assert.deepEqual(feet.map((f) => [Math.sign(f.x), Math.sign(f.z)]), [[-1, -1], [-1, 1], [1, -1], [1, 1]]);
    for (const f of feet) assert.ok(Math.abs(Math.abs(f.x) - 1.2037) < 1e-9 && Math.abs(Math.abs(f.z) - 0.5687) < 1e-9 && Math.abs(f.hx - 0.0631) < 1e-9 && Math.abs(f.hz - 0.0631) < 1e-9);
    assert.equal(M.feetOf(pieces, -0.79).length, 0, 'a table that stands 22 mm over the floor has no sole on it'); assert.deepEqual(M.feetOf(null, -0.768), []); assert.deepEqual(M.feetOf(pieces, NaN), []);
    assert.equal(M.feetOf([box(-1.4, -0.768, -0.8, 1.4, -0.7, 0.8)], -0.768).length, 0, 'a plinth is not a sole');
    assert.equal(M.feetOf([box(0, -0.768, 0, 0.1, -0.76, 0.1), box(0.01, -0.765, 0.01, 0.09, -0.5, 0.09)], -0.768).length, 1, 'a leveller and its leg are one sole');
    // the line: deepest at the footprint's edge, a square law, gone at the reach, exactly 1 beyond it and far away
    const at = (d) => M.feetVis(-1.2037 + 0.0631 + d, 0.5687, feet);
    assert.ok(Math.abs(at(0) - (1 - M.FEET.depth)) < 1e-9 && Math.abs(at(M.FEET.reach * 0.5) - (1 - M.FEET.depth * 0.25)) < 1e-9); assert.equal(at(M.FEET.reach), 1); assert.equal(at(0.3), 1); assert.equal(M.feetVis(0, 0, feet), 1);
    assert.ok(at(-0.03) === 1 - M.FEET.depth, 'under the sole: the full depth (the sole hides it)');
    assert.ok(M.FEET.reach >= 0.02 && M.FEET.reach <= 0.06 && M.FEET.depth > 0.3 && M.FEET.depth <= 0.85, 'a few centimetres, no halo');
    // the patch: its own key, one splice before the colour is written, no sampler, the floor patch's varying; the other kinds do not hold it
    const spec = OG.occPatchSpec('feet', { uniforms: {} });
    assert.equal(spec.key, `occ-v${OG.OCC_PATCH_VERSION}-feet`); assert.deepEqual(spec.apply.map((a) => [a.anchor, a.mode]), [['#include <opaque_fragment>', 'before']]);
    assert.ok(spec.apply[0].code.includes('outgoingLight *= clubFeetVis( vClubOccWp );') && !/sampler/.test(spec.pars) && spec.pars.includes('uniform vec4 uClubFeet[ 4 ];') && spec.pars.includes('float t = clamp( 1.0 - length( d ) / max( uClubFeetK.z, 1e-4 ), 0.0, 1.0 );') && spec.pars.includes('k = max( k, t * t );'));
    for (const kind of ['table', 'gi', 'plain', 'floor']) { const s = OG.occPatchSpec(kind, { uniforms: {} }); assert.ok(!JSON.stringify(s).includes('clubFeet') && !JSON.stringify(s).includes('uClubFeet'), kind); }
    assert.equal(JSON.stringify(OG.occPatchSpec('floor', { uniforms: {} }).apply.map((a) => a.anchor)), JSON.stringify(['#include <project_vertex>', '#include <lights_fragment_begin>', '#include <lights_fragment_end>']));
    // the service: the arena venue and the switch; never under the club venue
    const svc = readFileSync(new URL('../../scene/club/occlusion.js', import.meta.url), 'utf8');
    assert.ok(svc.includes('feetOn = isArena(club) && !offList.includes(\'feet\') && (FEET.on === true || onList.includes(\'feet\'));') && svc.includes('if (feetOn && adopt.patch(m, occPatchSpec(\'feet\', { uniforms: feetU })))') && svc.includes('const feetU = feetOn ?'));
  });

  await ok('env: the rail wood\'s corrected lookup on a tier without the box, in the arena only (round A6) — the tool switch and the default; the service adopts the rail wood alone and keeps the tier\'s capture policy; the configuration every venue reads does not change', async () => {
    const C = await import('../../scene/club/env/config.js');
    const { readFileSync } = await import('node:fs');
    const q = (s) => new URLSearchParams(s);
    assert.equal(C.hallRailWanted(null), C.HALL_RAIL.on); assert.equal(C.hallRailWanted(q('clubenv=rail:1')), true); assert.equal(C.hallRailWanted(q('clubenv=rail:0')), false); assert.equal(C.hallRailWanted(q('clubenv=amb:0')), C.HALL_RAIL.on);
    // the configuration is not touched by it: no new key, the box stays the tier's
    for (const tier of ['lite', 'base', 'high']) { const a = C.envConfig(TIERS[tier], q('clubenv=rail:1')), b = C.envConfig(TIERS[tier], null); assert.deepEqual({ ...a, overridden: [] }, { ...b, overridden: [] }); assert.ok(!('rail' in a) && !('hallRail' in a)); }
    assert.equal(C.envConfig(TIERS.lite, null).box, false); assert.equal(C.envConfig(TIERS.base, null).box, true); assert.equal(C.envConfig(TIERS.high, null).box, true);
    // the service: a tier without the box, the arena venue, the switch; the rail wood alone; every other case runs the lines of 16b85e434
    const svc = readFileSync(new URL('../../scene/club/env.js', import.meta.url), 'utf8');
    assert.ok(svc.includes('hallRail = knobs.envBox !== true && isArena(club) && hallRailWanted(ctx.query);'));
    assert.ok(svc.includes('if (hallRail && typeof club.adopt?.find === \'function\') { for (const m of club.adopt.find(\'railwood\')) adoptMaterial(m, \'railwood\'); return; }'));
    assert.ok(svc.includes('if (knobs.envBox !== true || typeof club.adopt?.find !== \'function\') return;\n    for (const cls of [\'railwood\', \'apron\']) for (const m of club.adopt.find(cls)) adoptMaterial(m, cls);'));
    assert.ok(svc.includes('const oneAtLoad = knobs.envBox !== true;'), 'the capture policy stays the tier\'s');
  });

  await ok('venues: the post chain in the arena (round A2) — the venue row\'s bloom and grade reach the app\'s passes; the club venue writes the club\'s values; lite has no bloom in either; the two new grade parameters are venue-only', async () => {
    const saved = { hadWindow: 'window' in globalThis, window: globalThis.window, hadImage: 'Image' in globalThis, Image: globalThis.Image };
    globalThis.window = { addEventListener() {}, removeEventListener() {} };
    globalThis.Image = class { set src(v) { this._src = v; } };
    try {
      const { createPostFX } = await import('../../scene/postfx.js');
      const { createPost } = await import('../../scene/club/post.js');
      const { buildGradeLut } = await import('../../scene/club/post/gradelut.js');
      const W = 640, H = 360;
      const fakeRenderer = () => { let target = null; return {
        isWebGLRenderer: true, capabilities: { isWebGL2: true, reverseDepthBuffer: false }, autoClear: true, xr: { enabled: false },
        toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.85, outputColorSpace: THREE.SRGBColorSpace,
        info: { autoReset: true, reset() {} }, state: { buffers: { stencil: { setTest() {}, setFunc() {}, setOp() {}, setLocked() {} } } },
        getPixelRatio: () => 1, getSize: (v) => v.set(W, H), getDrawingBufferSize: (v) => v.set(W, H), getContext: () => ({}),
        setRenderTarget(t) { target = t ?? null; }, getRenderTarget: () => target, getClearColor: (c) => c, getClearAlpha: () => 1,
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0, setClearColor() {}, setClearAlpha() {}, clear() {}, clearDepth() {}, render() {} }; };
      const build = async (tier, venue, query = '') => {
        const renderer = fakeRenderer(), scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, W / H, 0.01, 50);
        const composer = createPostFX(renderer, scene, camera, W, H, { samples: 4 });
        const club = { enabled: true, tier, knobs: TIERS[tier], time: { value: 0 }, ctx: { renderer, scene, camera, composer, game: { ballSet: { balls: [] } }, query: new URLSearchParams(query) }, onFrame() { return () => {}; } };
        if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
        const post = await createPost(club);
        post.show?.();
        return { post, counts: post.counts(), bloom: [post.bloom.strength, post.bloom.radius, post.bloom.threshold], falloff: post.falloff.strength };
      };
      const A = VENUES.arena.bloom, C = CLUB_TUNE.bloom;
      for (const tier of ['high', 'base']) {
        const a = await build(tier, 'arena'), c = await build(tier, 'club'), d = await build(tier, undefined);
        assert.equal(a.post.enabled, true, a.post.reason);
        assert.deepEqual(a.bloom, [A.strength, A.radius, A.threshold], `${tier}: the arena's bloom is written to the app's pass`);
        assert.deepEqual(c.bloom, [C.strength, C.radius, C.threshold], `${tier}: the club's bloom under the club venue`); assert.deepEqual(d.bloom, c.bloom);
        assert.equal(a.falloff, VENUES.arena.falloff); assert.equal(c.falloff, CLUB_TUNE.falloff);
        assert.deepEqual(a.counts.venueTune, { strength: A.strength, radius: A.radius, threshold: A.threshold, falloff: VENUES.arena.falloff });
        assert.ok(!('venueTune' in c.counts) && !('venueGrade' in c.counts) && !('venueTune' in d.counts), 'no venue member in the club counts');
        // the grade table the arena draws is built from the venue row over the defaults
        assert.deepEqual(a.counts.venueGrade.params, { ...GRADE_DEFAULTS, ...VENUES.arena.grade.params });
        // the off arms: ?clubpost=vbloom:0 = the club's bloom in the hall, ?clubpost=vgrade:0 = the club's grade; both do nothing under club
        const offB = await build(tier, 'arena', 'clubpost=vbloom:0');
        assert.deepEqual(offB.bloom, c.bloom); assert.ok(!('venueTune' in offB.counts) && 'venueGrade' in offB.counts);
        const offG = await build(tier, 'arena', 'clubpost=vgrade:0');
        assert.deepEqual(offG.bloom, a.bloom); assert.ok(!('venueGrade' in offG.counts));
        const clubSw = await build(tier, 'club', 'clubpost=vbloom:0,vgrade:0');
        assert.deepEqual([clubSw.bloom, clubSw.falloff], [c.bloom, c.falloff]);
        // a tool's numbers still win over the venue's
        assert.deepEqual((await build(tier, 'arena', 'clubpost=bs:0.3,br:0.9,bt:2')).bloom, [0.3, 0.9, 2]);
      }
      // lite: the app's bloom stays off in every venue (strength 0); radius and threshold are the venue's
      const la = await build('lite', 'arena'), lc = await build('lite', 'club');
      assert.equal(la.bloom[0], 0); assert.equal(lc.bloom[0], 0); assert.deepEqual(lc.bloom.slice(1), [C.radius, C.threshold]);
      // the two venue-only grade parameters: absent from the defaults, so the club's table is built without them, and
      // neutral values of them leave every texel of a table as it was
      assert.ok(!('midTint' in GRADE_DEFAULTS) && !('shadowLift' in GRADE_DEFAULTS));
      const t0 = buildGradeLut(GRADE_DEFAULTS, 8), t1 = buildGradeLut({ ...GRADE_DEFAULTS, midTint: [1, 1, 1], shadowLift: 0 }, 8);
      assert.deepEqual(Array.from(t1), Array.from(t0));
      // shadowLift raises only the deep shadows; midTint tints only the midtones
      const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const lifted = { ...GRADE_DEFAULTS, shadowLift: 0.5 };
      assert.ok(Math.abs(lum(gradeColor([0.002, 0.002, 0.002], lifted)) / lum(gradeColor([0.002, 0.002, 0.002], GRADE_DEFAULTS)) - 2 ** 0.5) < 1e-9, 'six stops under the pivot and deeper: all of the lift');
      for (const v of [0.045, 0.18, 1, 8]) assert.deepEqual(gradeColor([v, v, v], lifted), gradeColor([v, v, v], GRADE_DEFAULTS), `no lift at ${v}`);
      const tinted = { ...GRADE_DEFAULTS, midTint: [0.9, 1.0, 1.1] };
      const ratio = (c) => c[0] / c[2];
      assert.ok(ratio(gradeColor([0.15, 0.15, 0.15], tinted)) < ratio(gradeColor([0.15, 0.15, 0.15], GRADE_DEFAULTS)) * 0.85, 'a midtone takes the tint');
      for (const v of [0.002, 4]) assert.ok(Math.abs(ratio(gradeColor([v, v, v], tinted)) / ratio(gradeColor([v, v, v], GRADE_DEFAULTS)) - 1) < 1e-9, `no midtone tint at ${v}`);
    } finally {
      if (saved.hadWindow) globalThis.window = saved.window; else delete globalThis.window;
      if (saved.hadImage) globalThis.Image = saved.Image; else delete globalThis.Image;
    }
  });

  await ok('venues: ?clubcloth=app (round A2, a tool switch) — arena + switch = the app\'s own cloth (no cloth part, no cloth patch); arena without = the club cloth; club + switch = the club cloth, nothing differs; the default is off', async () => {
    const { applyCloth } = await import('../../scene/club/mat/cloth.js');
    const { createMaterials } = await import('../../scene/club/mat/index.js');
    // one stage per (venue, query): what the part asks of the adoption service (key, shader text, uniform values) and what it says
    const stage = async (venue, query = '') => {
      const scene = new THREE.Scene();
      const lamp = new THREE.RectAreaLight(0xffffff, 8, 2.0, 0.66); lamp.position.set(0, 1.0, 0); lamp.rotation.x = -Math.PI / 2; scene.add(lamp);
      scene.updateMatrixWorld(true);
      const map = { isTexture: true, name: 'the app\'s cloth map' };
      const cloth = new THREE.MeshPhysicalMaterial({ name: 'cloth' }); cloth.userData.obClass = 'cloth'; cloth.map = map;
      cloth.customProgramCacheKey = () => 'spike-cloth'; // what shading.js injectAnalytic leaves on the app's cloth
      const frames = [], patches = [], reads = [];
      const q = new URLSearchParams(query);
      const spy = { get: (k) => { reads.push(k); return q.get(k); } };
      const club = { tier: 'base', knobs: TIERS.base, ctx: { scene, query: spy }, onFrame: (fn) => frames.push(fn),
        adopt: { find: (c) => (c === 'cloth' ? [cloth] : []),
          patch: (m, spec) => { patches.push({ key: spec.key, pars: spec.pars, apply: JSON.stringify(spec.apply), uniforms: Object.keys(spec.uniforms).sort().join(',') }); return true; } } };
      if (venue !== undefined) { club.venue = venue; club.venueKnobs = VENUES[venue]; }
      const part = await applyCloth(club);
      part.rebuild('test'); for (const fn of frames) fn(0, 1 / 60);
      return { part, state: part.state(), patches, frames: frames.length, reads, map: cloth.map === map, keys: Object.keys(cloth).length };
    };
    // arena + switch: the part is a stub with the reason, nothing is patched, no frame hook, the material keeps its map
    for (const query of ['clubcloth=app', 'clubcloth=app,weave', 'clubcloth=nosheen,app']) {
      const a = await stage('arena', query);
      assert.equal(a.part.enabled, false, `${query}: the cloth part is not built`); assert.equal(a.part.appCloth, true);
      assert.match(a.part.reason, /the app's own cloth \(\?clubcloth=app/);
      assert.deepEqual(a.state, { enabled: false, reason: a.part.reason, appCloth: true });
      assert.deepEqual(a.patches, [], 'no cloth patch'); assert.equal(a.frames, 0, 'no frame hook'); assert.equal(a.map, true, 'the app\'s own map stays');
    }
    // arena without the switch (the default), and with tokens that merely contain the letters: the club cloth
    const on = await stage('arena');
    assert.equal(on.part.enabled, true); assert.ok(!('appCloth' in on.part)); assert.equal(on.patches.length, 1); assert.match(on.patches[0].key, /^mat-cloth-v\d+/);
    for (const query of ['clubcloth=', 'clubcloth=apps', 'clubcloth=APP', 'clubcloth=noapp', 'clubcloth=on', 'cloth=app', 'clubcloth=app%20']) {
      const x = await stage('arena', query);
      assert.equal(x.part.enabled, true, `${query}: not the switch`); assert.deepEqual(x.patches, on.patches); assert.deepEqual(x.state, on.state);
    }
    // club + switch, the venue named or not: the club cloth, and NOTHING differs from the club venue without the switch:
    // the same patch (key, pars, splices, uniform names), the same state, the same number of frame hooks
    for (const venue of ['club', undefined]) {
      const plain = await stage(venue), sw = await stage(venue, 'clubcloth=app');
      assert.equal(sw.part.enabled, true, 'club: the switch is ignored'); assert.ok(!('appCloth' in sw.part));
      assert.deepEqual(sw.patches, plain.patches); assert.deepEqual(sw.state, plain.state); assert.equal(sw.frames, plain.frames);
      assert.deepEqual(sw.reads, plain.reads, 'the part reads the same query keys in the same order with and without the token');
      assert.deepEqual(sw.reads, ['clubcloth'], 'and only its own key');
    }
    // the shader text of the club cloth is the same in both venues (the switch adds no variant of the patch)
    assert.deepEqual((await stage('club')).patches, on.patches);
    // through mat/index.js: the other parts are still built and the service says which cloth is shown
    const scene = new THREE.Scene();
    const cloth = new THREE.MeshPhysicalMaterial({ name: 'cloth' }); cloth.userData.obClass = 'cloth'; cloth.customProgramCacheKey = () => 'spike-cloth';
    const keys = [];
    const club = { tier: 'base', knobs: TIERS.base, venue: 'arena', venueKnobs: VENUES.arena, ctx: { scene, query: new URLSearchParams('clubcloth=app') }, onFrame() {},
      adopt: { find: (c) => (c === 'cloth' ? [cloth] : []), patch: (m, spec) => { keys.push(spec.key); return true; }, classify() {} } };
    const mat = await createMaterials(club);
    assert.equal(mat.parts.cloth.appCloth, true); assert.equal(mat.state().cloth.appCloth, true);
    assert.ok(!keys.some((k) => /^mat-cloth/.test(k)), `no cloth patch among ${keys.join(', ') || 'none'}`);
    assert.equal(mat.parts.wood.enabled, true, 'the wood part is built as under the default');
    // club/index.js notes(): a frame record says which cloth it shows, and only under the switch
    for (const [venue, query, want] of [['arena', 'clubcloth=app', true], ['arena', '', false], ['club', 'clubcloth=app', false]]) {
      const r = rig(); r.ctx.venue = venue; r.ctx.query = new URLSearchParams(query); r.ctx.scene = new THREE.Scene();
      const load = async (file) => (file === './mat/index.js' ? { createMaterials: async (c) => createMaterials({ ...c, adopt: { find: () => [], patch: () => true, classify() {} }, onFrame() {} }) } : r.load(file));
      const c = await installClub(r.ctx, { ...FAST, window: r.win, load, services: [['mat', './mat/index.js', 'createMaterials']] });
      const said = c.state().notes.some((n) => /^cloth: the app's own cloth is shown/.test(n));
      assert.equal(said, want, `${venue} ${query || '(no switch)'}: the note is ${want ? 'there' : 'absent'} (${c.state().notes.join(' | ')})`);
    }
  });

  await ok('env: the live cube capture (off on every tier) is what changed a still picture 6 to 11 frames after a bake or a cue move; without it nothing does', async () => {
    // a renderer stand-in that runs the scene's hooks; a cube like the app's, bound as the scene's environment
    const make = async (query) => {
      const R = { xr: { enabled: false }, autoClear: true, target: null, faces: 0, state: { buffers: { depth: { setMask() {} } } },
        getDrawingBufferSize: (v) => v.set(1280, 720), getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t ?? null; },
        getActiveCubeFace: () => 0, getActiveMipmapLevel: () => 0,
        render(scene, cam) { scene.onBeforeRender(this, scene, cam, this.target); this.faces += 1; scene.onAfterRender(this, scene, cam); } };
      const r = await envRig({ tier: 'high', query, renderer: R });
      const cue = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.02)); cue.name = 'obCueStick'; r.scene.add(cue);
      const rt = new THREE.WebGLCubeRenderTarget(16); const cube = new THREE.CubeCamera(0.1, 10, rt); r.scene.add(cube);
      r.scene.environment = rt.texture; r.scene.updateMatrixWorld(true);
      const appBake = () => { R.target = rt; for (const face of cube.children) R.render(r.scene, face); R.target = null; };
      // frames until the cube's prefilter is asked for again (three re-filters the cube then: the frame after it looks different)
      const framesUntilRefilter = (limit = 40) => { const v = rt.texture.pmremVersion; for (let n = 1; n <= limit; n++) { r.tick(); if (rt.texture.pmremVersion !== v) return n; } return null; };
      return { r, R, cue, rt, appBake, framesUntilRefilter };
    };
    const on = await make('clubenv=live:1');
    on.appBake(); // the app's own bake (its tail at the first scripted frame after a camera jump): the cube loses the cue
    assert.equal(on.r.env.state().bakesSeen, 1);
    const afterBake = on.framesUntilRefilter();
    assert.ok(afterBake >= 6 && afterBake <= 11, `with the live capture the picture changes ${afterBake} frames after a bake`);
    assert.equal(on.framesUntilRefilter(), null, 'and then it is still');
    on.cue.position.x += 0.2; on.cue.updateMatrixWorld(true);
    const afterMove = on.framesUntilRefilter();
    assert.ok(afterMove >= 6 && afterMove <= 11, `and ${afterMove} frames after the cue moved`);
    const st = on.r.env.state();
    assert.ok(st.live.on && st.live.faces >= 12 && st.live.cycles >= 2 && st.live.error === null);
    assert.equal(on.r.bakes.length, 0, 'it never asks the app for a capture');
    // the tier default: no cube face is ever drawn by the service, so a still stays a still
    const off = await make('');
    off.appBake();
    const faces = off.R.faces;
    assert.equal(off.framesUntilRefilter(), null);
    off.cue.position.x += 0.2; off.cue.updateMatrixWorld(true);
    assert.equal(off.framesUntilRefilter(), null);
    assert.equal(off.R.faces, faces, 'no scene render of its own');
    assert.deepEqual([off.r.env.state().live.on, off.r.env.state().live.faces], [false, 0]);
  });

  // ---- assets.js: the per-id cache, raw files, the texture cap, on stand-ins for fetch, the image loader and the canvas ----
  const { createAssets } = await import('../../scene/club/assets.js');
  const MANIFEST = {
    'felt.normal': { file: 'felt-normal.jpg', bytes: 385068, sha256: 'x' },
    'veneer.color': { file: 'veneer-color.jpg', lite: 'veneer-color-1024.jpg', bytes: 809333, sha256: 'x' },
    'veneer.normal': { file: 'veneer-normal.jpg', bytes: 122608, sha256: 'x' },
    'floor.normal': { file: 'floor-normal.jpg', lite: 'floor-normal-1024.jpg', bytes: 762233, sha256: 'x' },
    'room.light': { file: 'room-light.png', bytes: 2000, sha256: 'x' },
    'gone.color': { file: 'gone.jpg', bytes: 1, sha256: 'x' },
    'floor.color': { file: 'floor-color.jpg', lite: 'floor-color-1024.jpg', bytes: 730131, sha256: 'x' },
    'floor.rough': { file: 'floor-rough.jpg', bytes: 145652, sha256: 'x' },
    'wood_dark.normal': { file: 'wood-dark-normal.jpg', bytes: 125257, sha256: 'x' },
    'leather.color': { file: 'leather-color.jpg', bytes: 260207, sha256: 'x' },
  };
  const IMAGES = { 'felt-normal.jpg': 2048, 'veneer-color.jpg': 2048, 'veneer-color-1024.jpg': 1024, 'veneer-normal.jpg': 2048, 'floor-normal.jpg': 2048, 'floor-normal-1024.jpg': 1024,
    'floor-color.jpg': 2048, 'floor-color-1024.jpg': 1024, 'floor-rough.jpg': 1024, 'wood-dark-normal.jpg': 1024, 'leather-color.jpg': 1024 };
  const assetsRig = async ({ tier = 'base', canvas = false, knobs = null, query = null } = {}) => {
    const fetched = [], loaded = [], drawn = [];
    const name = (u) => String(u).split('/').pop();
    const saved = { fetch: globalThis.fetch, load: THREE.TextureLoader.prototype.load, hadDoc: 'document' in globalThis, doc: globalThis.document };
    globalThis.fetch = async (u) => {
      const f = name(u); fetched.push(f);
      if (f === 'manifest.json') return { ok: true, status: 200, json: async () => MANIFEST };
      if (f === 'room-light.png') return { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(2000) };
      return { ok: false, status: 404 };
    };
    THREE.TextureLoader.prototype.load = function load(u, onLoad, _onProgress, onError) {
      const f = name(u); loaded.push(f);
      setTimeout(() => (IMAGES[f] ? onLoad({ image: { width: IMAGES[f], height: IMAGES[f], file: f } }) : onError(new Error('404'))), 2);
    };
    if (canvas) globalThis.document = { createElement: () => { const c = { width: 0, height: 0, isCanvas: true, getContext: () => ({ drawImage: (im, x, y, w, h) => drawn.push([im.file, w, h]) }) }; return c; } };
    const assets = createAssets({ tier, knobs: knobs ?? TIERS[tier], ...(query ? { ctx: { query: new URLSearchParams(query) } } : {}) });
    const restore = () => { globalThis.fetch = saved.fetch; THREE.TextureLoader.prototype.load = saved.load; if (saved.hadDoc) globalThis.document = saved.doc; else delete globalThis.document; };
    return { assets, fetched, loaded, drawn, restore };
  };

  await ok('assets: one request and one image per id; the same options give the same object; a large repeat is its own object on the shared image', async () => {
    const r = await assetsRig({ tier: 'high' }); // the tier without caps (base caps its maps since round 3: the arm below)
    try {
      const a = r.assets;
      const weave = [1 / 0.266, 1 / 0.266];
      const t1 = a.texture('felt.normal', { repeat: weave, anisotropy: 8 });
      const t2 = a.texture('felt.normal', { repeat: weave, anisotropy: 8 });       // the cloth part asking again
      const t3 = a.texture('felt.normal', { repeat: [40, 40], anisotropy: 8 });    // a large repeat
      const t4 = a.texture('felt.normal', { repeat: [40, 40], anisotropy: 1 });    // no anisotropy: other sampling state, a second upload
      const t5 = a.texture('felt.normal', { repeat: [40, 40], anisotropy: 2 });    // any anisotropic request takes the tier's one value (8)
      const own = new THREE.DataTexture(new Uint8Array([9, 9, 9, 255]), 1, 1);
      const v1 = a.texture('veneer.color', { srgb: true, fallback: own });
      const v2 = a.texture('veneer.color', { srgb: true, repeat: [12, 3] });
      const g = a.texture('gone.color', { srgb: true });
      const none = a.texture('no.such.id');
      assert.equal(t1, t2); assert.notEqual(t3, t1); assert.equal(v1, own, 'the first caller gets its own stand-in back');
      assert.equal(t5, t3, 'a request for 2 and a request for 8 are one object and one upload'); assert.notEqual(t4, t3);
      assert.deepEqual([t5.anisotropy, t4.anisotropy], [8, 1]);
      assert.deepEqual([t3.repeat.x, t3.repeat.y, t3.wrapS, t3.wrapT, t3.anisotropy], [40, 40, THREE.RepeatWrapping, THREE.RepeatWrapping, 8]);
      await a.ready();
      assert.deepEqual(r.loaded.slice().sort(), ['felt-normal.jpg', 'gone.jpg', 'veneer-color.jpg'], 'one image request per id, the full-size file on high');
      assert.deepEqual(r.fetched, ['manifest.json']);
      assert.ok(t1.source === t3.source && t3.source === t4.source && v1.source === v2.source, 'every object of an id shows the one image');
      assert.deepEqual([t1.image.width, v2.image.file, v1.isDataTexture, v1.generateMipmaps], [2048, 'veneer-color.jpg', false, true], 'a DataTexture stand-in became an image texture');
      const st = a.state();
      assert.deepEqual([st.requested, st.loaded, st.fallback, st.calls, st.shared, st.textures, st.capped, st.maxSide, st.anisotropy, st.anisotropySet], [4, 2, 2, 9, 2, 7, 0, 2048, 8, 1]);
      assert.deepEqual(st.ids, { 'felt.normal': 'loaded', 'veneer.color': 'loaded', 'gone.color': 'fallback', 'no.such.id': 'fallback' });
      assert.equal(st.bytes, 385068 + 809333);
      // GPU cost: felt 2 uploads (the tier's anisotropy and none; repeat is not sampling state), veneer 1
      const mb = (side, uploads) => Math.round(uploads * side * side * 4 * 4 / 3);
      assert.deepEqual([st.gpu.ids['felt.normal'].uploads, st.gpu.ids['felt.normal'].objects, st.gpu.ids['veneer.color'].uploads], [2, 3, 1]);
      assert.equal(st.gpu.bytes, mb(2048, 2) + mb(2048, 1)); assert.equal(st.gpu.textures, 3);
      // a call after the file is in shows it at once, with no new request
      const late = a.texture('veneer.color', { srgb: true, repeat: [2, 2] });
      assert.equal(late.source, v1.source); assert.equal(r.loaded.length, 3);
      assert.ok(g.isTexture && none.isTexture, 'a failed or unknown id keeps a usable stand-in');
    } finally { r.restore(); }
  });

  await ok('assets: a raw file is fetched once, counted like a texture id and waited for; the lite tier takes the lite file and caps every image at 1024', async () => {
    const r = await assetsRig();
    try {
      const a = r.assets;
      const p1 = a.bytes('room.light'), p2 = a.bytes('room.light');
      assert.equal(p1, p2, 'one request per id');
      a.texture('veneer.normal');
      let settled = false; const all = a.ready().then(() => { settled = true; });
      assert.equal(settled, false);
      const [b1, b2, miss] = await Promise.all([p1, p2, a.bytes('no.such.id')]);
      await all;
      assert.ok(b1 === b2 && b1.byteLength === 2000); assert.equal(miss, null);
      assert.deepEqual(r.fetched.filter((f) => f === 'room-light.png').length, 1);
      const st = a.state();
      assert.deepEqual([st.requested, st.loaded, st.fallback, st.rawFiles, st.rawSettled], [3, 2, 1, 2, 2]);
      assert.deepEqual(st.ids, { 'veneer.normal': 'loaded', 'room.light': 'loaded', 'no.such.id': 'fallback' });
      assert.equal(st.bytes, 122608 + 2000);
      assert.equal(st.gpu.ids['room.light'], undefined, 'a raw file is not a texture of the loader');
      await a.ready(['room.light']);
    } finally { r.restore(); }
    const l = await assetsRig({ tier: 'lite', canvas: true });
    try {
      const a = l.assets;
      const v = a.texture('veneer.color', { srgb: true });   // the row has a 1024 px file
      const n = a.texture('veneer.normal');                   // this one has none: 2048 px on the wire
      await a.ready();
      assert.deepEqual(l.loaded.slice().sort(), ['veneer-color-1024.jpg', 'veneer-normal.jpg']);
      assert.deepEqual(l.drawn, [['veneer-normal.jpg', 512, 512]], 'the data map is drawn down once, to the lite tier\'s data-map size');
      assert.deepEqual([v.image.width, n.image.width, n.image.isCanvas], [1024, 512, true]);
      const st = a.state();
      assert.deepEqual([st.capped, st.liteFiles, st.maxSide, st.dataSide, st.bytes], [1, 1, 1024, 512, 122608]);
      assert.equal(st.gpu.bytes, Math.round(1024 * 1024 * 4 * 4 / 3) + Math.round(512 * 512 * 4 * 4 / 3), 'a 1024 px colour map (5.6 MB) and a 512 px data map (1.4 MB), not 22.4 MB each');
      assert.deepEqual([v.anisotropy, n.anisotropy], [4, 4], 'the lite tier\'s one anisotropy');
    } finally { l.restore(); }
    // a data-map cap of 1024 on a tier that is not lite: the row's 1024 px file is taken where it has one (a smaller
    // download), a row without one is drawn down; colour maps keep the tier's size
    const d = await assetsRig({ canvas: true, knobs: { textureSize: 2048, textureSizeData: 1024, anisotropy: 8 } });
    try {
      const a = d.assets;
      const fn = a.texture('floor.normal'), vn = a.texture('veneer.normal'), vc = a.texture('veneer.color', { srgb: true });
      await a.ready();
      assert.deepEqual(d.loaded.slice().sort(), ['floor-normal-1024.jpg', 'veneer-color.jpg', 'veneer-normal.jpg']);
      assert.deepEqual(d.drawn, [['veneer-normal.jpg', 1024, 1024]]);
      assert.deepEqual([fn.image.width, vn.image.width, vc.image.width], [1024, 1024, 2048]);
      assert.deepEqual([a.state().liteFiles, a.state().capped], [1, 1]);
    } finally { d.restore(); }
    // without a 2D canvas the full-size image stays (never a throw)
    const nc = await assetsRig({ tier: 'lite' });
    try { const t = nc.assets.texture('veneer.normal'); await nc.assets.ready(); assert.equal(t.image.width, 2048); assert.equal(nc.assets.state().capped, 0); } finally { nc.restore(); }
  });

  await ok('assets, round 3: the base tier takes the 1024 px colour files, draws data maps down to 512, keeps its per-id exceptions, and uploads roughness as RG8', async () => {
    const { sizesFromQuery } = await import('../../scene/club/assets.js');
    const b = await assetsRig({ canvas: true });
    try {
      const a = b.assets;
      const fc = a.texture('floor.color', { srgb: true }), fn = a.texture('floor.normal'), fr = a.texture('floor.rough');
      const wn = a.texture('wood_dark.normal'), vc = a.texture('veneer.color', { srgb: true }), lc = a.texture('leather.color', { srgb: true });
      const fr2 = a.texture('floor.rough', { repeat: [3, 3] }); // a second object of the roughness map: the same format, one upload
      await a.ready();
      assert.deepEqual(b.loaded.slice().sort(), ['floor-color-1024.jpg', 'floor-normal-1024.jpg', 'floor-rough.jpg', 'leather-color.jpg', 'veneer-color.jpg', 'wood-dark-normal.jpg'],
        'the 1024 px file where a row has one and the cap allows it; the rail scan in full');
      assert.deepEqual(b.drawn.slice().sort(), [['floor-normal-1024.jpg', 512, 512], ['floor-rough.jpg', 512, 512], ['leather-color.jpg', 512, 512], ['wood-dark-normal.jpg', 512, 512]].sort(), 'drawn down once each; the veneer scan is not');
      assert.deepEqual([fc.image.width, fn.image.width, fr.image.width, wn.image.width, vc.image.width, lc.image.width], [1024, 512, 512, 512, 2048, 512]);
      assert.deepEqual([fr.format, fr2.format, fn.format, fc.format], [THREE.RGFormat, THREE.RGFormat, THREE.RGBAFormat, THREE.RGBAFormat], 'only the roughness map is two-channel');
      const st = a.state();
      const px = (side, bpt) => Math.round(side * side * bpt * 4 / 3);
      assert.deepEqual([st.gpu.ids['floor.rough'].bytes, st.gpu.ids['floor.rough'].bytesPerTexel, st.gpu.ids['floor.rough'].uploads], [px(512, 2), 2, 1]);
      assert.equal(st.gpu.bytes, px(1024, 4) + px(512, 4) + px(512, 2) + px(512, 4) + px(2048, 4) + px(512, 4));
      assert.deepEqual([st.maxSide, st.dataSide, st.roughRG, st.gpu.ids['veneer.color'].cap, st.gpu.ids['floor.normal'].cap, st.gpu.ids['floor.color'].file], [1024, 512, true, 2048, 512, 'floor-color-1024.jpg']);
    } finally { b.restore(); }
    // the tool switch ?clubtex= sets single ids over the tier's caps (a pair of one map); junk is ignored
    assert.deepEqual(sizesFromQuery(new URLSearchParams('clubtex=floor.normal:1024,leather.color:0,bad id:9,x:-1,y:abc,z')), { 'floor.normal': 1024, 'leather.color': 0 });
    assert.deepEqual(sizesFromQuery(null), {}); assert.deepEqual(sizesFromQuery({ get() { throw new Error('no'); } }), {});
    const t = await assetsRig({ canvas: true, query: 'clubtex=floor.normal:1024,floor.color:2048' });
    try {
      const fn = t.assets.texture('floor.normal'), fc = t.assets.texture('floor.color', { srgb: true });
      await t.assets.ready();
      assert.deepEqual([fn.image.width, fc.image.width], [1024, 2048]);
      assert.deepEqual(t.loaded.slice().sort(), ['floor-color.jpg', 'floor-normal-1024.jpg']);
    } finally { t.restore(); }
    // high: nothing is capped and roughness stays RGBA8 (high is as it was)
    const h = await assetsRig({ tier: 'high', canvas: true });
    try {
      const fr = h.assets.texture('floor.rough'), fc = h.assets.texture('floor.color', { srgb: true });
      await h.assets.ready();
      assert.deepEqual([fr.format, fr.image.width, fc.image.width, h.drawn.length], [THREE.RGBAFormat, 1024, 2048, 0]);
    } finally { h.restore(); }
  });

  await ok('release, round 3: after the show pass the GPU copies of what the look hid in the app room or swapped out are freed; the app\'s own hidden objects are left alone', async () => {
    const r = rig();
    const scene = new THREE.Scene();
    const tex = (name) => { const t = new THREE.DataTexture(new Uint8Array(4 * 16 * 16), 16, 16); t.name = name; t.generateMipmaps = true; let n = 0; t.addEventListener('dispose', () => { n += 1; }); t.disposed = () => n; return t; };
    const mesh = (name, map, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map })); m.name = name; parent.add(m); return m; };
    const appRoom = new THREE.Group(); scene.add(appRoom);
    const T = { wall: tex('app.wall'), floor: tex('app.floor'), lampFace: tex('app.lampface'), cue: tex('app.cue'), ball: tex('app.ball'), rail: tex('app.rail'), shared: tex('app.shared'), gone: tex('app.gone'), offAtBoot: tex('app.off-at-boot') };
    const walls = mesh('walls', T.wall, appRoom), floor = mesh('floor', T.floor, appRoom); mesh('lamp', T.lampFace, appRoom);
    const sharedA = mesh('prop', T.shared, appRoom); mesh('table-part', T.shared);                 // one map on a room prop and on the table
    const offAtBoot = mesh('venue-off', T.offAtBoot, appRoom); offAtBoot.visible = false;        // the app had it hidden before the look came
    const cue = mesh('cue', T.cue), rail = mesh('rail', T.rail), gone = mesh('gone', T.gone); mesh('ball', T.ball);
    const rt = new THREE.WebGLRenderTarget(4, 4); scene.environment = rt.texture;
    r.ctx.scene = scene; r.ctx.room = { group: appRoom };
    const clubTex = tex('club.strip');
    const room = () => ({ make_room: async () => ({ enabled: true, show() { walls.visible = false; floor.visible = false; sharedA.visible = false; cue.visible = false; rail.material.map = clubTex; scene.remove(gone); } }) });
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', room)] });
    const rel = club.state().life.released;
    assert.equal(rel.on, true); assert.equal(rel.passes, 2, 'one pass after the service was built, one in the show pass'); assert.equal(rel.error, null);
    assert.deepEqual(rel.list.map((x) => `${x.name}:${x.was}`).sort(), ['app.floor:hidden', 'app.rail:unbound', 'app.wall:hidden']);
    assert.deepEqual([T.wall.disposed(), T.floor.disposed(), T.rail.disposed()], [1, 1, 1], 'hidden room parts and the swapped-out map: GPU copy freed once');
    assert.deepEqual([T.lampFace.disposed(), T.ball.disposed(), clubTex.disposed()], [0, 0, 0], 'what is still drawn is untouched');
    assert.equal(T.cue.disposed(), 0, 'hidden, but not a part of the app room: the app hides its cue itself');
    assert.equal(T.shared.disposed(), 0, 'one of its users is still shown');
    assert.equal(T.offAtBoot.disposed(), 0, 'hidden before the look came: not the look\'s doing');
    assert.equal(T.gone.disposed(), 0, 'its object left the scene: the app\'s business');
    assert.equal(rel.textures, 3); assert.equal(rel.bytes, 3 * Math.round(16 * 16 * 4 * 4 / 3));
    assert.ok(T.wall.image?.data, 'the image stays: three uploads it again if the object is ever drawn');
    // a refresh pass notes what the app binds now and releases again: a new table's map that a part swaps out
    const newMap = tex('app.rail.newtable'); rail.material.map = newMap;
    club.room.rebuild = () => { rail.material.map = clubTex; };
    r.emit('ob:settings', { key: 'equipment' });
    await sleep(40);
    const rel2 = club.state().life.released;
    assert.equal(rel2.passes, 3); assert.equal(newMap.disposed(), 1); assert.equal(rel2.textures, 4);
    assert.deepEqual([T.wall.disposed(), T.cue.disposed()], [1, 0], 'nothing is released twice');
    // the knob off: nothing is noted, nothing released
    const r0 = rig(); r0.ctx.query = new URLSearchParams('clubtier=base&clubknobs=releaseHidden:0');
    const s0 = new THREE.Scene(); const g0 = new THREE.Group(); s0.add(g0); const t0 = tex('app.wall'); const w0 = mesh('walls', t0, g0);
    r0.ctx.scene = s0; r0.ctx.room = { group: g0 };
    const c0 = await installClub(r0.ctx, { ...FAST, window: r0.win, load: r0.load, services: [row('room', () => ({ make_room: async () => ({ enabled: true, show() { w0.visible = false; } }) }))] });
    assert.deepEqual([c0.state().life.released.on, c0.state().life.released.passes, t0.disposed()], [false, 0, 0]);
  });

  await ok('release: the note of a texture does not keep a disposed material alive (a table build the app\'s cache evicted shares maps with materials that are still drawn)', async () => {
    // node's collector, switched on for this process (the arms run without flags)
    let collect = null;
    try { (await import('node:v8')).setFlagsFromString('--expose-gc'); collect = (await import('node:vm')).runInNewContext('gc'); } catch { collect = null; }
    if (typeof collect !== 'function') { console.log('   (no collector in this node: skipped)'); return; }
    const r = rig();
    const scene = new THREE.Scene();
    const map = new THREE.DataTexture(new Uint8Array(4 * 16 * 16), 16, 16);
    const apron = new THREE.MeshStandardMaterial({ name: 'apron', map });
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), apron)); // the app's shared body material: drawn under every table
    r.ctx.scene = scene;
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', r.svc('room'))] });
    assert.equal(club.state().life.released.on, true);
    const refs = [];
    for (let i = 0; i < 6; i++) {
      let mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), apron.clone()); // a build's own body clone: the same map object
      scene.add(mesh); refs.push(new WeakRef(mesh.material));
      r.emit('ob:settings', { key: 'equipment' }); await sleep(25); // the refresh pass of the switch to this table
      scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); mesh = null; // the eviction
      r.emit('ob:settings', { key: 'equipment' }); await sleep(25); // the refresh pass of the switch away
    }
    assert.equal(club.state().life.refreshes, 12); assert.equal(club.state().life.released.error, null);
    for (let i = 0; i < 4; i++) { await sleep(5); collect(); }
    const alive = refs.filter((ref) => ref.deref() !== undefined).length;
    assert.ok(alive <= 1, `${alive} of ${refs.length} disposed materials are still reachable`);
  });

  await ok('room light file: the texture never appears without its bake record (a room that stopped waiting reads the file between two awaits of the loader; a texture without a record made the hall fail to build)', async () => {
    const { createLightmap } = await import('../../scene/club/room/lightmap.js');
    const fsp = await import('node:fs/promises');
    for (const file of ['room-light.png', 'arena-light.png']) {
      const bytes = await fsp.readFile(new URL(`../../assets/club/${file}`, import.meta.url));
      const lm = createLightmap({ assets: { bytes: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } }, { want: true });
      // watch the moment the texture appears: the loader's own object, its own assignment
      let texture = lm.texture, seen = null;
      Object.defineProperty(lm, 'texture', { configurable: true, enumerable: true, get: () => texture, set: (v) => { if (v && seen === null) seen = { meta: lm.meta !== null }; texture = v; } });
      await lm.ready;
      assert.equal(lm.status, 'loaded', `${file}: ${lm.reason}`);
      assert.ok(lm.volume?.texture, `${file}: the shipped file carries a light volume (the await the race sat in)`);
      assert.deepEqual(seen, { meta: true }, `${file}: the texture was set while the record was still null`);
    }
  });

  await ok('notes, round 3: a refused or absent baked room light is said in state().notes (and so in a frame record); a clean boot has no notes', async () => {
    const lmState = { on: true, volume: true, reason: null, stale: [] };
    const room = () => ({ make_room: async () => ({ enabled: true, lightmap: { ready: Promise.resolve(), state: () => ({ ...lmState }) } }) });
    const r = rig();
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load: r.load, services: [row('room', room), row('env', r.svc('env'))] });
    assert.deepEqual(club.state().notes, [], 'the map is in use: nothing to say');
    lmState.on = false; lmState.volume = false; lmState.reason = 'baked for another room (signature aaaa, this room is bbbb): re-bake with web/tools/club/bake-room.mjs';
    const notes = club.state().notes;
    assert.equal(notes.length, 1);
    assert.match(notes[0], /^room light: the baked light map is NOT in use \(baked for another room \(signature aaaa, this room is bbbb\)/);
    assert.deepEqual(JSON.parse(JSON.stringify(club.state())).notes, notes, 'it travels in the plain object a frame record stores');
    lmState.on = true; lmState.volume = true; lmState.reason = null; lmState.stale = ['emitter levels changed since the bake (re-bake to match)'];
    assert.match(club.state().notes[0], /in use but stale: emitter levels changed/);
    lmState.stale = []; lmState.volume = false;
    assert.match(club.state().notes[0], /without its light volume/);
    // a service that is off and a file that fell back are notes too
    const r2 = rig();
    const core2 = { './assets.js': { createAssets: () => ({ enabled: true, ready: async () => undefined, state: () => ({ requested: 5, fallback: 2, failed: ['floor.color: request failed (floor-color-1024.jpg)', 'x.y: not in the manifest'] }) }) }, './adopt.js': { createAdopt: () => ({ enabled: true, state: () => ({ patched: 0, anchorsMissed: [{}, {}] }) }) } };
    const club2 = await installClub(r2.ctx, { ...FAST, window: r2.win, load: async (f) => { if (core2[f]) return core2[f]; throw new Error(`no such module ${f}`); },
      services: [row('room', room), row('occ', () => ({ make_occ: async () => ({ enabled: false, reason: 'no table' }) }))] });
    const n2 = club2.state().notes;
    assert.ok(n2.some((x) => /^occ: off \(no table\)$/.test(x)) && n2.some((x) => /^assets: 2 of 5 files fell back/.test(x)) && n2.some((x) => /^adopt: 2 patch anchors missed/.test(x)), n2.join(' | '));
  });

  // ---- round 4: the motion service (motion.js) on real three objects, with stand-in parts, machine and game ----------------
  const { createMotion, readOnlyGame, readOnlyMachine, tableOf, MOTION_ROOT_NAME, partGroupName } = await import('../../scene/club/motion.js');
  const { furnitureOf } = await import('../../scene/ballreturn/furniture.js');
  // the app's state machine, as web/app/state.js has it (on() returns the unsubscribe; emit() does not guard its handlers)
  const machineRig = (state = 'AIM') => {
    const lists = { frame: [], stateChange: [] };
    const m = {
      get state() { return state; },
      on(evt, fn) { if (!lists[evt]) throw new Error(`unknown hook event: ${evt}`); lists[evt].push(fn); return () => { const i = lists[evt].indexOf(fn); if (i >= 0) lists[evt].splice(i, 1); }; },
      emit(evt, ...args) { for (const fn of [...lists[evt]]) fn(...args); },
      to(next, info) { const prev = state; state = next; m.emit('stateChange', next, prev, info); },
    };
    return { m, lists };
  };
  const RECORD = Object.freeze({ shot: { phi: 0, theta: 0, a: 0, b: 0, v0: 2 }, events: [{ t: 0, kind: { Strike: { ball: 0 } }, post: [] }, { t: 0.4, kind: { BallLinearCushion: { ball: 0, seg: 1 } }, post: [] }] });
  const gameRig = () => {
    const cue = { id: 0, mesh: new THREE.Mesh(new THREE.SphereGeometry(0.028575, 8, 6)) };
    const g = {
      record: null, clock: 0, duration: 1.5, phi: 0.3, slowmo: false, paused: false,
      template: { system: { table: { length: 2.54, width: 1.27 }, balls: [{ params: { r: 0.028575 } }] } },
      ballSet: { balls: [cue] }, sampler: { sampleAt() { g.sampled += 1; } }, buf: new Float64Array(8), sampled: 0, writes: 0,
      cueBall() { return cue; }, activeBalls() { return [cue]; }, seek() { g.writes += 1; }, shoot() { g.writes += 1; },
    };
    return g;
  };
  // a stand-in part module: records its calls; `extra` overrides members of the returned part
  const partMod = (fn, log, extra = {}) => async () => ({
    [fn]: async (club, kit) => {
      log.kit = kit; log.club = club; log.calls = [];
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      quad.name = `club.motion.${kit.key}.quad`; quad.position.set(0.3, 0.001, 0.1); quad.rotation.x = -Math.PI / 2;
      kit.root.add(quad); log.quad = quad;
      return { enabled: true, update(t, record, info) { log.calls.push([t, record, { ...info }]); }, state: () => ({ quads: 1 }), dispose() { log.disposed = (log.disposed ?? 0) + 1; }, ...extra };
    },
  });
  const motionRig = async ({ parts, query = '', tier = 'base', env = null, state = 'AIM' } = {}) => {
    const scene = new THREE.Scene();
    const { m, lists } = machineRig(state);
    const game = gameRig();
    const club = { tier, knobs: TIERS[tier], env, ctx: { scene, machine: m, game, query: new URLSearchParams(query) } };
    const motion = await createMotion(club, { parts });
    return { scene, m, lists, game, club, motion };
  };
  const gone = () => { throw Object.assign(new Error("Cannot find module '/x/motion/dust.js' imported from /x/motion.js"), { code: 'ERR_MODULE_NOT_FOUND' }); };

  await ok('motion: with no part in the tree the service is off, says "not present" for each, and subscribes nothing', async () => {
    const before = warned;
    // the shipped table of parts: neither file may exist yet (the other roles write them); either way nothing throws
    const real = await motionRig();
    const st = real.motion.state();
    assert.deepEqual(Object.keys(st.parts), ['dust', 'marks']);
    for (const key of ['dust', 'marks']) {
      const p = st.parts[key];
      assert.equal(typeof p.enabled, 'boolean');
      if (p.present === false) assert.match(p.reason, new RegExp(`^not present \\(\\./motion/${key}\\.js`), `${key}: ${p.reason}`);
    }
    // stand-ins for two missing modules
    const r = await motionRig({ parts: [['dust', './motion/dust.js', gone, 'applyDust'], ['marks', './motion/marks.js', gone, 'applyMarks']] });
    const s2 = r.motion.state();
    assert.equal(r.motion.enabled, false); assert.equal(r.motion.reason, 'no motion part is built');
    assert.deepEqual([s2.parts.dust.present, s2.parts.marks.present], [false, false]);
    assert.match(s2.parts.dust.reason, /^not present \(\.\/motion\/dust\.js: Cannot find module/);
    assert.deepEqual(s2.listeners, { frame: 0, stateChange: 0 });
    assert.deepEqual([r.lists.frame.length, r.lists.stateChange.length], [0, 0], 'no listener without a part');
    if (st.parts.dust.present === false && st.parts.marks.present === false) assert.equal(warned, before, 'a missing part is not a console warning');
    assert.equal(r.scene.getObjectByName(MOTION_ROOT_NAME).visible, false, 'the empty root is hidden');
  });

  await ok('motion: one failing part leaves the other running; ONE frame and ONE stateChange listener; dispose removes both', async () => {
    const marks = {};
    const before = warned;
    const r = await motionRig({ parts: [
      ['dust', './motion/dust.js', async () => ({ applyDust: async () => { throw new Error('dust shader text is wrong'); } }), 'applyDust'],
      ['marks', './motion/marks.js', partMod('applyMarks', marks), 'applyMarks'],
      ['none', './motion/none.js', async () => ({}), 'applyNone'],
      ['null', './motion/null.js', async () => ({ applyNull: async () => null }), 'applyNull'],
      ['noup', './motion/noup.js', async () => ({ applyNoup: async () => ({ enabled: true }) }), 'applyNoup'],
    ] });
    assert.equal(warned, before + 1, 'the failing part says so once');
    const st = r.motion.state();
    assert.equal(r.motion.enabled, true); assert.equal(r.motion.reason, null);
    assert.deepEqual([st.parts.dust.enabled, st.parts.dust.reason], [false, 'dust shader text is wrong']);
    assert.equal(st.parts.marks.enabled, true);
    assert.match(st.parts.none.reason, /has no applyNone/); assert.match(st.parts.null.reason, /returned nothing/); assert.match(st.parts.noup.reason, /returned no update/);
    assert.deepEqual([r.lists.frame.length, r.lists.stateChange.length], [1, 1], 'one listener of each kind for all parts');
    assert.deepEqual(st.listeners, { frame: 1, stateChange: 1 });
    assert.deepEqual(st.parts.marks.state, { quads: 1 });
    r.motion.dispose(); r.motion.dispose();
    assert.deepEqual([r.lists.frame.length, r.lists.stateChange.length], [0, 0], 'dispose unsubscribes');
    assert.equal(marks.disposed, 1); assert.equal(r.motion.enabled, false);
    assert.equal(r.scene.getObjectByName(MOTION_ROOT_NAME), undefined, 'the root left the scene');
  });

  await ok('motion: the tier and ?clubmotion= decide which parts are loaded at all', async () => {
    let loads = [];
    const rows = () => { loads = []; const d = {}, k = {}; return [['dust', './motion/dust.js', async () => { loads.push('dust'); return partMod('applyDust', d)(); }, 'applyDust'], ['marks', './motion/marks.js', async () => { loads.push('marks'); return partMod('applyMarks', k)(); }, 'applyMarks']]; };
    let r = await motionRig({ parts: rows() });
    assert.deepEqual(loads, ['dust', 'marks']);
    r = await motionRig({ parts: rows(), tier: 'lite' });
    assert.deepEqual(loads, ['marks'], 'lite: no dust module is requested');
    assert.match(r.motion.state().parts.dust.reason, /off on this tier/);
    r = await motionRig({ parts: rows(), query: 'clubmotion=off' });
    assert.deepEqual(loads, []); assert.equal(r.motion.enabled, false);
    assert.deepEqual([r.lists.frame.length, r.lists.stateChange.length], [0, 0], 'motion off: no listener');
    assert.equal(r.motion.state().parts.marks.reason, 'off by ?clubmotion');
    r = await motionRig({ parts: rows(), query: 'clubmotion=nomarks' });
    assert.deepEqual(loads, ['dust']);
    r = await motionRig({ parts: rows(), tier: 'lite', query: 'clubmotion=dust,nomarks' });
    assert.deepEqual(loads, ['dust']);
  });

  await ok('motion: update(t, record, info) gets the BALL clock while a record exists; nothing is called and the root is hidden without one', async () => {
    const dust = {}, marks = {};
    let cleared = 0, states = [];
    const r = await motionRig({ parts: [['dust', 'd', partMod('applyDust', dust, { clear() { cleared += 1; }, onState(next, prev, entry, record) { states.push([next, prev, entry, record]); } }), 'applyDust'], ['marks', 'm', partMod('applyMarks', marks), 'applyMarks']] });
    const root = r.scene.getObjectByName(MOTION_ROOT_NAME);
    assert.ok(root && root.parent === r.scene);
    assert.equal(dust.kit.root.name, partGroupName('dust')); assert.equal(dust.kit.root.parent, root);
    assert.equal(marks.kit.root.name, 'obAimClubMotion.marks');
    // no record (boot, a new rack): frames come, nothing is drawn, clear() is the only call
    r.m.emit('frame', 0, 1 / 60); r.m.emit('frame', 0, 1 / 60);
    assert.deepEqual([dust.calls.length, marks.calls.length, cleared, root.visible], [0, 0, 2, false]);
    // a live strike: PLAYBACK { strike }, the loop advances game.clock and emits it
    r.game.record = RECORD; r.game.clock = 0;
    r.m.to('PLAYBACK', { duration: 1.5, strike: true });
    assert.deepEqual(states[0].slice(0, 3), ['PLAYBACK', 'AIM', { strike: true, replay: false, dvr: false }]); assert.equal(states[0][3], RECORD);
    for (const t of [0, 0.016, 0.05]) { r.game.clock = t; r.m.emit('frame', t, 0.016); }
    assert.deepEqual(dust.calls.map((c) => c[0]), [0, 0.016, 0.05]);
    assert.ok(dust.calls.every((c) => c[1] === RECORD), 'the record object itself, not a copy');
    assert.deepEqual(dust.calls[2][2], { state: 'PLAYBACK', playback: true, tEvent: 0.05, duration: 1.5, entry: { strike: true, replay: false, dvr: false }, twoClock: false });
    assert.equal(root.visible, true);
    assert.equal(dust.calls[0].length, 3, 'no dt is handed on');
    // the two-clock call: renderAt(t = 0.2, dt, tCam = 7): the balls are at 0.2, the event carries the camera clock
    r.game.clock = 0.2; r.m.emit('frame', 7, 1 / 60);
    assert.deepEqual([dust.calls.at(-1)[0], dust.calls.at(-1)[2].tEvent, dust.calls.at(-1)[2].twoClock], [0.2, 7, true]);
    // a scrub backwards, a pause (the same time twice, dt 0) and a time past the end: handed on as they are
    for (const t of [0.01, 0.01, 9]) { r.game.clock = t; r.m.emit('frame', t, 0); }
    assert.deepEqual(marks.calls.slice(-3).map((c) => c[0]), [0.01, 0.01, 9]);
    // settled: the clock holds, the parts keep being called with it (marks stay while the player aims)
    r.m.to('SETTLED'); r.m.to('AIM');
    r.m.emit('frame', 9, 0.016);
    assert.deepEqual([marks.calls.at(-1)[0], marks.calls.at(-1)[2].state, marks.calls.at(-1)[2].playback], [9, 'AIM', false]);
    assert.deepEqual(marks.calls.at(-1)[2].entry, { strike: true, replay: false, dvr: false });
    // a replay and a loaded record are told apart
    r.m.to('PLAYBACK', { replay: true }); assert.deepEqual(states.at(-1)[2], { strike: false, replay: true, dvr: false });
    r.m.to('PLAYBACK', { replay: true, dvr: true }); assert.deepEqual(states.at(-1)[2], { strike: false, replay: true, dvr: true });
    // a non-finite clock falls back to the event's time; a new rack (no record) hides everything again
    r.game.clock = NaN; r.m.emit('frame', 0.3, 0.016); assert.equal(dust.calls.at(-1)[0], 0.3);
    const n = dust.calls.length;
    r.game.record = null; r.game.clock = 0; r.m.emit('frame', 0, 0.016);
    assert.deepEqual([dust.calls.length, root.visible, cleared], [n, false, 3]);
    const st = r.motion.state();
    assert.deepEqual([st.record, st.rootVisible, st.twoClock, st.parts.dust.calls, st.parts.dust.objects], [false, false, 1, n, 1]);
    assert.equal(r.game.writes + r.game.sampled, 0, 'the wiring never calls a writer of the game');
  });

  await ok('motion: a listener never throws — a part that throws in update, clear, onState or rebuild is switched off with a note, the other goes on', async () => {
    for (const where of ['update', 'clear', 'onState', 'rebuild']) {
      const dust = {}, marks = {};
      const boom = () => { throw new Error(`${where} went wrong`); };
      const before = warned;
      const r = await motionRig({ parts: [['dust', 'd', partMod('applyDust', dust, { [where]: boom }), 'applyDust'], ['marks', 'm', partMod('applyMarks', marks), 'applyMarks']] });
      // an app listener registered AFTER the look's: it must still run on every frame (state.js emit has no try)
      let after = 0; r.m.on('frame', () => { after += 1; });
      if (where !== 'clear') r.game.record = RECORD;
      r.game.clock = 0.1;
      assert.doesNotThrow(() => { r.m.to('PLAYBACK', { strike: true }); r.m.emit('frame', 0.1, 0.016); r.motion.rebuild('table'); r.m.emit('frame', 0.1, 0.016); });
      assert.equal(after, 2, `${where}: the listeners after the look's ran`);
      const st = r.motion.state();
      assert.equal(st.parts.dust.enabled, false, where);
      assert.match(st.parts.dust.off, new RegExp(`^${where}: ${where} went wrong$`));
      assert.equal(st.parts.dust.errors, 1, 'switched off once, not once per frame');
      assert.ok(st.notes.some((x) => x === `dust switched off after ${where} threw: ${where} went wrong`), st.notes.join(' | '));
      assert.equal(dust.kit.root.visible, false, 'what it drew is hidden');
      assert.equal(dust.disposed, 1, 'its dispose was tried once');
      assert.equal(st.parts.marks.enabled, true);
      if (where !== 'clear') assert.equal(marks.calls.length, 2, 'the other part was updated on both frames');
      assert.equal(r.motion.enabled, true);
      assert.equal(warned, before + 1);
    }
    // a part whose dispose throws too, and a game whose members throw: still nothing travels
    const dust = {};
    const r = await motionRig({ parts: [['dust', 'd', partMod('applyDust', dust, { update() { throw new Error('a'); }, dispose() { throw new Error('b'); } }), 'applyDust']] });
    r.game.record = RECORD;
    assert.doesNotThrow(() => r.m.emit('frame', 0, 0));
    assert.ok(r.motion.state().notes.some((x) => /dust\.dispose threw: b/.test(x)));
    assert.equal(r.motion.enabled, false, 'no part left');
    Object.defineProperty(r.game, 'record', { get() { throw new Error('record getter broke'); } });
    assert.doesNotThrow(() => r.m.emit('frame', 0, 0));
    assert.ok(r.motion.state().notes.some((x) => /frame listener: record getter broke/.test(x)));
  });

  await ok('motion: the game and the machine reach a part read-only', async () => {
    const notes = [];
    const g = gameRig(); g.record = RECORD;
    const ro = readOnlyGame(g, (s) => notes.push(s));
    assert.equal(ro.record, RECORD); assert.equal(ro.clock, 0); assert.equal(ro.template, g.template); assert.equal(ro.ballSet, g.ballSet);
    g.clock = 0.7; assert.equal(ro.clock, 0.7, 'reads are live');
    assert.equal(ro.cueBall(), g.ballSet.balls[0]); assert.deepEqual(ro.activeBalls(), [g.ballSet.balls[0]]);
    assert.equal(ro.cueBall, ro.cueBall, 'a stable function per member');
    assert.throws(() => { ro.clock = 3; }, TypeError); assert.equal(g.clock, 0.7);
    assert.throws(() => { ro.slowmo = true; }, TypeError);
    assert.throws(() => { ro.added = 1; }, TypeError); assert.equal('added' in g, false);
    assert.throws(() => { delete ro.record; }, TypeError); assert.equal(g.record, RECORD);
    assert.throws(() => Object.defineProperty(ro, 'x', { value: 1 }), TypeError);
    assert.throws(() => Object.freeze(ro), TypeError); assert.equal(Object.isFrozen(g), false);
    assert.equal(ro.seek, undefined); assert.equal(ro.shoot, undefined); assert.equal(ro.sampler, undefined); assert.equal(ro.buf, undefined);
    assert.equal(g.writes + g.sampled, 0);
    assert.ok(notes.includes('game is read-only: write of clock refused') && notes.includes('game is read-only: call of seek refused') && notes.includes('game is read-only: read of sampler refused'), notes.join(' | '));
    const count = notes.length; void ro.seek; try { ro.clock = 1; } catch { /* refused */ }
    assert.equal(notes.length, count, 'each refusal is noted once');
    assert.equal(readOnlyGame(null), null);
    const { m } = machineRig('AIM');
    const mv = readOnlyMachine(m);
    assert.deepEqual([mv.state, mv.is('AIM', 'WIN'), mv.is('PLAYBACK'), Object.isFrozen(mv)], ['AIM', true, false, true]);
    assert.deepEqual([mv.on, mv.emit, mv.to], [undefined, undefined, undefined]);
    m.to('PLAYBACK'); assert.equal(mv.state, 'PLAYBACK');
    // the kit a part is handed
    const dust = {};
    const r = await motionRig({ parts: [['dust', 'd', partMod('applyDust', dust), 'applyDust']] });
    const kit = dust.kit;
    assert.ok(Object.isFrozen(kit));
    assert.deepEqual(Object.keys(kit).sort(), ['game', 'key', 'knobs', 'machine', 'note', 'root', 'scene', 'table', 'tier', 'want']);
    assert.equal(kit.scene, r.scene); assert.equal(kit.knobs, TIERS.base); assert.equal(kit.tier, 'base'); assert.equal(kit.key, 'dust');
    assert.deepEqual([kit.want.dust, kit.want.marks], [true, true]);
    assert.deepEqual(kit.table(), { bedY: 0, ballR: 0.028575, length: 2.54, width: 1.27, halfL: 1.27, halfW: 0.635 });
    r.game.template.system.table.length = 3.569; assert.equal(kit.table().halfL, 1.7845, 'a table change is seen');
    r.game.template = null; assert.equal(kit.table(), null);
    assert.equal(tableOf(undefined), null); assert.equal(tableOf({ template: { system: { table: { length: 0, width: 1 }, balls: [] } } }), null);
    assert.throws(() => { kit.game.paused = true; }, TypeError);
    kit.note('a line for the reader');
    assert.ok(r.motion.state().notes.includes('dust: a line for the reader') && r.motion.state().notes.some((x) => /write of paused refused/.test(x)));
    assert.equal(r.motion.kit.dust, kit);
  });

  await ok('motion: what a part draws is not furniture for the ball return, and every environment capture leaves it out', async () => {
    const dust = {}, marks = {};
    const excluded = [];
    const env = { enabled: true, exclude(o) { excluded.push(o); return () => { excluded.splice(excluded.indexOf(o), 1); }; } };
    const r = await motionRig({ env, parts: [['dust', 'd', partMod('applyDust', dust), 'applyDust'], ['marks', 'm', partMod('applyMarks', marks), 'applyMarks']] });
    const root = r.scene.getObjectByName(MOTION_ROOT_NAME);
    r.game.record = RECORD; r.game.clock = 0.5; r.m.emit('frame', 0.5, 0.016);
    assert.equal(root.visible, true);
    // a solid of the room beside them, and the same quad outside the root (what a part must not do)
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 2)); rail.name = 'rail'; r.scene.add(rail);
    const stray = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2)); stray.name = 'club.motion.stray'; r.scene.add(stray);
    // 1. the ball return's furniture set (web/scene/ballreturn/furniture.js, the shipped function)
    const names = furnitureOf(THREE, r.scene).map((f) => f.name);
    assert.deepEqual(names.sort(), ['club.motion.stray', 'rail'], 'the root\'s meshes are not furniture; a mesh outside the root would be');
    assert.deepEqual(furnitureOf(THREE, r.scene).skipped, [], 'and nothing of the look is in the skipped list');
    // 2. the app's environment bake: main.js hideGameplayVisualsForBake, lifted between its markers as test-env-tail.mjs does
    const fs = await import('node:fs');
    const main = fs.readFileSync(new URL('../../app/main.js', import.meta.url), 'utf8');
    const a = main.indexOf('// >>> env-bake gameplay visuals'), b = main.indexOf('// <<< env-bake gameplay visuals');
    assert.ok(a > 0 && b > a, 'the lifted block is in main.js');
    const hide = new Function(`${main.slice(a, b)}\n return hideGameplayVisualsForBake;`)();
    const shown = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    const restore = hide(r.scene);
    assert.deepEqual([shown(dust.quad), shown(marks.quad), shown(rail), shown(stray)], [false, false, true, true], 'the bake sees the room, not the motion parts');
    restore();
    assert.deepEqual([shown(dust.quad), shown(marks.quad), root.visible], [true, true, true], 'and they come back as they were');
    // 3. the studio bake (cinelight.js) and the venue probe (lightingvisuals.js) use the same name rule: pinned by the text
    for (const [file, pat] of [['../../app/cinelight.js', "nm.startsWith('obAim')"], ['../../scene/lightingvisuals.js', '/^obAim|^obCueStick|^obAtelierCue/'], ['../../scene/ballreturn/furniture.js', '/^(obBallReturnDebug|obAim|obCueStick)/'], ['../../scene/club/env.js', "n.startsWith('obAim')"]]) {
      assert.ok(fs.readFileSync(new URL(file, import.meta.url), 'utf8').includes(pat), `${file} still hides by the obAim prefix (${pat})`);
    }
    assert.match(MOTION_ROOT_NAME, /^obAim/); assert.match(partGroupName('dust'), /^obAim/);
    // 4. the club's own reflection service: the root is registered with env.exclude (cube, ambient and mirror pictures)
    assert.deepEqual(excluded, [root]);
    assert.equal(r.motion.state().excludedFromEnv, true);
    r.motion.dispose(); assert.deepEqual(excluded, [], 'dispose undoes the exclusion');
    // without the reflection service (lite has it too, but a failed one is a stub): the name rule alone, and it is said
    const r2 = await motionRig({ env: { enabled: false, reason: 'x' }, parts: [['dust', 'd', partMod('applyDust', {}), 'applyDust']] });
    assert.equal(r2.motion.state().excludedFromEnv, false);
  });

  await ok('motion: the real reflection service leaves the motion root out of a cube face it renders', async () => {
    const r = await envRig({ tier: 'base' });
    if (r.env?.enabled !== true || typeof r.env.exclude !== 'function') { console.log('   (the reflection service did not build on this stand-in: skipped)'); return; }
    const { m } = machineRig();
    const game = gameRig(); game.record = RECORD;
    const dust = {};
    const motion = await createMotion({ tier: 'base', knobs: TIERS.base, env: r.env, ctx: { scene: r.scene, machine: m, game, query: new URLSearchParams('') } }, { parts: [['dust', 'd', partMod('applyDust', dust), 'applyDust']] });
    m.emit('frame', 0.2, 0.016);
    assert.equal(motion.root.visible, true);
    assert.equal(motion.state().excludedFromEnv, true);
    // a cube camera's face render, as three calls the scene hooks: the root is hidden inside, visible again after
    const cube = new THREE.CubeCamera(0.1, 10, new THREE.WebGLCubeRenderTarget(16));
    let inside = null;
    r.scene.onBeforeRender?.({}, r.scene, cube.children[0], cube.renderTarget);
    inside = motion.root.visible;
    r.scene.onAfterRender?.({}, r.scene, cube.children[0]);
    assert.equal(inside, false, 'hidden while the cube face is drawn');
    assert.equal(motion.root.visible, true, 'and shown again');
  });

  await ok('installer: motion and audio are built last, in that order; a module that is not in the tree is "not present", not an error', async () => {
    const r = rig();
    const made = [];
    const mods = {
      './room.js': { createRoom: async () => { made.push('room'); return { enabled: true }; } }, './env.js': { createEnv: async () => { made.push('env'); return { enabled: true }; } },
      './occlusion.js': { createOcclusion: async () => { made.push('occ'); return { enabled: true }; } }, './post.js': { createPost: async () => { made.push('post'); return { enabled: true }; } },
      './mat/index.js': { createMaterials: async () => { made.push('mat'); return { enabled: true }; } },
      './motion.js': { createMotion: async (club) => { made.push('motion'); assert.equal(club.mat.enabled, true, 'the materials are patched before the motion parts are built'); return { enabled: true, state: () => ({ notes: ['dust switched off after update threw: x'] }), rebuild: (why) => made.push(`rebuild motion ${why}`) }; } },
    };
    const before = warned;
    const load = async (f) => { if (r.load && (f === './assets.js' || f === './adopt.js')) return r.load(f); if (mods[f]) return mods[f]; throw Object.assign(new Error(`Cannot find module '${f}'`), { code: 'ERR_MODULE_NOT_FOUND' }); };
    const club = await installClub(r.ctx, { ...FAST, window: r.win, load });
    assert.deepEqual(made, ['room', 'env', 'occ', 'post', 'mat', 'motion']);
    const st = club.state();
    assert.deepEqual(Object.keys(st.services), ['room', 'env', 'occ', 'post', 'mat', 'motion', 'audio']);
    assert.equal(club.motion.enabled, true);
    assert.deepEqual([club.audio.enabled, club.audio.reason], [false, 'not present (./audio.js)']);
    assert.equal(st.services.audio.present, false);
    assert.deepEqual(st.errors, [], 'a module that is not there is no error of the look');
    assert.equal(warned, before, 'and no console warning');
    assert.ok(st.notes.includes('audio: off (not present (./audio.js))') && st.notes.includes('motion: dust switched off after update threw: x'), st.notes.join(' | '));
    // the refresh pass reaches the motion service
    r.emit('ob:settings', { key: 'equipment' }); await sleep(30);
    assert.ok(made.includes('rebuild motion table'));
    // a module that is there and broken is still an error
    const r2 = rig();
    const club2 = await installClub(r2.ctx, { ...FAST, window: r2.win, load: async (f) => { if (f === './assets.js' || f === './adopt.js') return r2.load(f); if (f === './audio.js') throw new SyntaxError('Unexpected token'); if (mods[f]) return mods[f]; throw new Error('x'); }, services: [['audio', './audio.js', 'createAudio']] });
    assert.deepEqual([club2.audio.enabled, club2.audio.reason], [false, 'Unexpected token']);
    assert.ok(club2.state().errors.some((e) => /^audio: Unexpected token/.test(e)));
    // ?cluboff= skips them whole
    const r3 = rig(); r3.ctx.query = new URLSearchParams('clubtier=base&cluboff=motion,audio');
    const club3 = await installClub(r3.ctx, { ...FAST, window: r3.win, load: async (f) => (f === './assets.js' || f === './adopt.js' ? r3.load(f) : mods[f]) });
    assert.deepEqual([club3.motion.reason, club3.audio.reason], ['off by ?cluboff', 'off by ?cluboff']);
  });

  // ---- adopt.js: "already carries this key" is read from the material's own hooks, on real three materials ---------------
  await ok('adopt: a material that shares another\'s userData object, and a clone made after the patch, are each wrapped (userData names a wrap they do not have); hooks the app copied or wrapped again are not wrapped twice', async () => {
    const { createAdopt } = await import('../../scene/club/adopt.js');
    const scene = new THREE.Scene();
    const adopt = createAdopt({ ctx: { scene } });
    const spec = (key) => ({ key, pars: 'uniform float uArm;', apply: [{ anchor: '#include <map_fragment>', mode: 'after', code: 'ARM;' }] });
    // how many times the splice is in the text the material's hook produces, and the key three compiles it under
    const splices = (m) => { const sh = { uniforms: {}, vertexShader: VS, fragmentShader: FS }; m.onBeforeCompile(sh, null); return sh.fragmentShader.split('ARM;').length - 1; };
    // the app's own hooks, set the way shading.js injectAnalytic sets them (assigned, nothing chained)
    const inject = (m, tag) => { m.onBeforeCompile = () => {}; m.customProgramCacheKey = () => `spike-${tag}`; return m; };
    const bed = inject(new THREE.MeshPhysicalMaterial({ name: 'bed' }), 'bed');
    bed.userData.obClass = 'cloth';
    // 1. table.js midWallMatFor (the Chinese-8 middle pockets): a clone with its own hooks that SHARES the bed's userData object
    const wall = inject(bed.clone(), 'wall');
    wall.userData = bed.userData;
    for (const m of [bed, wall]) scene.add(new THREE.Mesh(new THREE.BufferGeometry(), m));
    assert.deepEqual(adopt.find('cloth'), [bed, wall], 'the class finds both: the shared userData carries obClass');
    const shared = { wrapped: adopt.patchClass('cloth', spec('arm-v1')), splices: [splices(bed), splices(wall)], wallKey: wall.customProgramCacheKey() };
    // 2. a table built after the look is installed clones the patched cloth (three copies userData, clubKeys with it, and not the hooks)
    const well = inject(bed.clone(), 'well');
    assert.notEqual(well.userData, bed.userData); assert.deepEqual(well.userData.clubKeys, ['arm-v1'], 'the copy of userData names the wrap');
    const clone = { wrapped: adopt.patch(well, spec('arm-v1')), splices: splices(well), wellKey: well.customProgramCacheKey() };
    assert.deepEqual({ shared, clone }, {
      shared: { wrapped: 2, splices: [1, 1], wallKey: 'spike-wall|club:arm-v1' },
      clone: { wrapped: true, splices: 1, wellKey: 'spike-well|club:arm-v1' },
    });
    assert.deepEqual([bed.userData.clubKeys, well.userData.clubKeys], [['arm-v1'], ['arm-v1']], 'a key is listed once, on a shared list too');
    // never twice: a second pass; a clone the app handed the patched hooks (table.js copies both by assignment); hooks the app
    // wrapped after the patch (the venue fill of lightingvisuals.js); a key that begins another key is its own patch
    assert.equal(adopt.patchClass('cloth', spec('arm-v1')), 0);
    const cap = bed.clone(); cap.onBeforeCompile = bed.onBeforeCompile; cap.customProgramCacheKey = bed.customProgramCacheKey;
    assert.deepEqual([adopt.patch(cap, spec('arm-v1')), splices(cap)], [false, 1]);
    const c0 = bed.onBeforeCompile, k0 = bed.customProgramCacheKey;
    bed.onBeforeCompile = function fill(sh, r) { c0.call(this, sh, r); }; bed.customProgramCacheKey = function fillKey() { return `${k0.call(this)}|venuefill`; };
    assert.deepEqual([adopt.patch(bed, spec('arm-v1')), splices(bed)], [false, 1]);
    assert.deepEqual([adopt.patch(bed, spec('arm')), adopt.patch(bed, spec('arm')), splices(bed)], [true, false, 2]);
    assert.equal(bed.customProgramCacheKey(), 'spike-bed|club:arm-v1|venuefill|club:arm');
    assert.deepEqual([adopt.state().patched, adopt.state().keys], [4, ['arm-v1', 'arm']]);
  });
  // (the real room, the real occlusion service and the real adoption registry on a renderer with no GL: every bake pass is a
  // call that does nothing, throws, or leaves a program that did not link in the renderer's list)
  await ok('room: the floor\'s built-in table shadow goes to the occlusion service only for a bake that succeeded — a bake step that threw, or a bake shader that did not link, leaves it on; a later good bake takes over; a later failed one gives it back', async () => {
    const saved = { hadDoc: 'document' in globalThis, doc: globalThis.document };
    // a 2D canvas that takes every call and draws nothing (the room's stand-in textures are drawn on canvases)
    const image = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4) });
    const canvas2d = () => {
      const canvas = { width: 2, height: 2, style: {}, toDataURL: () => 'data:,', addEventListener() {}, removeEventListener() {} }, set = {};
      const known = { canvas, createImageData: (w, h) => image(w?.width ?? w, w?.height ?? h), getImageData: (_x, _y, w, h) => image(w, h), measureText: (t) => ({ width: String(t).length * 6 }),
        createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}), getLineDash: () => [] };
      canvas.getContext = () => new Proxy(known, { get: (t, k) => (k in t ? t[k] : k in set ? set[k] : () => undefined), set: (_t, k, v) => { set[k] = v; return true; } });
      return canvas;
    };
    globalThis.document = { createElement: (tag) => (tag === 'canvas' ? canvas2d() : { style: {}, appendChild() {}, addEventListener() {} }), createElementNS: () => canvas2d() };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const UNLINKED = [{ name: 'club-occ-bake', diagnostics: { runnable: false } }];
    const bad = [];
    try {
      const { createRoom } = await import('../../scene/club/room.js');
      const { createOcclusion } = await import('../../scene/club/occlusion.js');
      const { createAdopt } = await import('../../scene/club/adopt.js');
      const build = async (fail) => {
        let target = null;
        const renderer = { isWebGLRenderer: true, capabilities: { isWebGL2: true }, autoClear: true, xr: { enabled: false }, fail, info: { programs: fail === 'shader' ? UNLINKED : [] },
          setRenderTarget(t) { target = t ?? null; }, getRenderTarget: () => target, getClearColor: (c) => c, getClearAlpha: () => 1, setClearColor() {}, clear() {},
          render() { if (renderer.fail === 'throw') throw new Error('the context was lost'); } };
        const scene = new THREE.Scene(), group = new THREE.Group(), frameFns = [];
        const mk = (name) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial()); o.name = name; group.add(o); return o; };
        const floor = mk('appFloor'); floor.position.y = -0.79;
        const lamp = new THREE.RectAreaLight(0xffffff, 10, 2.04, 0.66); lamp.position.set(0, 1.02, 0); lamp.rotation.x = -Math.PI / 2; group.add(lamp);
        const app = { group, giRefs: { floor, blob: mk('appBlob') }, lightRefs: { group, rectLights: [lamp], walls: mk('appWalls'), floor, blob: null, lampFace: mk('appLampFace') } };
        const table = new THREE.Group(); table.name = 'obTable';
        const body = new THREE.Mesh(new THREE.BoxGeometry(2.8956, 0.85, 1.6256), new THREE.MeshStandardMaterial()); body.position.y = -0.37; table.add(body);
        scene.add(group, table);
        const club = { enabled: true, tier: 'base', knobs: TIERS.base, shown: true, onFrame(fn) { frameFns.push(fn); }, offFrame(fn) { const i = frameFns.indexOf(fn); if (i >= 0) frameFns.splice(i, 1); },
          ctx: { scene, renderer, room: app, table: { group: table }, query: new URLSearchParams(''), rebakeEnv() {},
            gi: { uniforms: { uLightPos: { value: new THREE.Vector3(0, 1.02, 0) }, uLightHalf: { value: new THREE.Vector2(1.02, 0.33) }, uLightCount: { value: 1 } } } } };
        club.adopt = createAdopt(club);
        club.room = await createRoom(club);
        assert.equal(club.room.enabled, true, club.room.reason);
        club.occ = await createOcclusion(club);
        assert.equal(club.occ.enabled, true, club.occ.reason);
        const frame = async () => { for (const fn of [...frameFns]) fn(0, 1 / 60); await tick(); };
        // one bake to its end (or to its failure), then two frames: the hand-over is decided after the first
        const bake = async (how) => { renderer.fail = how; renderer.info.programs = how === 'shader' ? UNLINKED : []; if (club.occ.state().baking !== true) assert.equal(club.occ.rebuild('arm', { force: true }), true); club.occ.flush(); await tick(); await frame(); await frame(); };
        const read = () => { const s = club.room.state(), o = club.occ.state(); return { owner: s.shadowOwner, builtin: s.builtinShadow, value: club.room.floor.builtinShadow.value, open: club.occ.floor.texture.name === 'club-occ-open', floorK: club.occ.floor.uniforms.uClubFloorK.value.w, errors: o.errors }; };
        await frame();
        const first = read();
        assert.ok(first.owner === 'occ-pending' && first.builtin === 1 && club.room.floor.material.userData.clubKeys.some((k) => /^occ/.test(k)), 'the floor is patched and the hand-over waits for the bake');
        return { bake, read, dispose: () => club.room.dispose() };
      };
      const want = (tag, r, owner, builtin) => { if (r.owner !== owner || r.builtin !== builtin || r.value !== builtin) bad.push(`${tag}: owner '${r.owner}', built-in shadow ${r.builtin} (wanted '${owner}', ${builtin}); the service's floor map is ${r.open ? 'the open 1 x 1 map' : 'a baked map'} at strength ${r.floorK}, errors ${JSON.stringify(r.errors)}`); };
      // the boot as it is today: a bake that succeeds takes the shadow
      let r = await build(null); await r.bake(null);
      let s = r.read(); assert.ok(!s.open && s.floorK > 0 && s.errors.length === 0, 'a good bake: the service holds a floor map');
      want('a good boot', s, 'occ', 0);
      // ... and a later bake whose shader does not link drops the map: the built-in shadow comes back
      await r.bake('shader'); s = r.read(); assert.ok(s.open && s.floorK === 0 && /bake shader failed/.test(s.errors.join()), 'the service is open again');
      want('a good boot, then a bake whose shader did not link', s, 'room', 1);
      r.dispose();
      // a boot whose bake step throws: the service is open (no floor map), the built-in shadow stays
      r = await build('throw'); await r.bake('throw'); s = r.read();
      assert.ok(s.open && s.floorK === 0 && /^bake: the context was lost/.test(s.errors[0]), 'a thrown step: the service holds no floor map');
      want('a boot whose bake step threw', s, 'room', 1);
      // ... and a later bake that succeeds takes over (the two never stack)
      await r.bake(null); s = r.read(); assert.ok(!s.open && s.floorK > 0);
      want('a thrown step, then a good bake', s, 'occ', 0);
      r.dispose();
      // a boot whose bake shader did not link
      r = await build('shader'); await r.bake('shader'); s = r.read();
      assert.ok(s.open && s.floorK === 0 && /bake shader failed: club-occ-bake/.test(s.errors.join()), 'an unlinked shader: the service shows its open map');
      want('a boot whose bake shader did not link', s, 'room', 1);
      r.dispose();
    } finally { if (saved.hadDoc) globalThis.document = saved.doc; else delete globalThis.document; }
    assert.deepEqual(bad, [], `the floor shadow's hand-over:\n  ${bad.join('\n  ')}`);
  });
} else {
  console.log('SKIP env, assets and motion arms: node:module registerHooks is not available in this node (22.15 or later has it)');
}

assert.ok(warned >= 3, 'the degrade paths said so on the console');
console.log(`test-club-core: ${n} arms OK`);
