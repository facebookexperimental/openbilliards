// Copyright (c) Meta Platforms, Inc. and affiliates.

// room/props.js — everything that stands in or hangs on the club room (CONTRACT.md section 8.3). Owner: props. Called by
// room.js, which owns the shell (floor, walls, ceiling, doors, windows, wall lamps).
//
//   buildProps(club, { box, floorY, tableBounds, roomLight }) -> { group, emissives, setTier(tier), counts() }
//
// What is built: a back bar with lit display shelves, bottles, a counter, taps, a shaded lamp and stools; a second table under
// its own lamp (when `club.knobs.farTable`); spectator chairs with side tables, benches, wall cue racks with cues, a chalkboard,
// framed pictures, a clock, a painted plaque, two lit tube-letter signs, plants and a coat stand. Placement comes from
// props/layout.js: it is computed from `box` and `tableBounds`, keeps the table's playing clearance free and keeps floor props
// out of the fixed review views.
//
// Cost model: every primitive is appended to one merged batch per material (props/kit.js), so the room is at most ten draw
// calls at any detail level with the room light (eight lit or emissive batches and the two shadow overlays: contact-size, always
// drawn, and cast-size, which the room hides under its baked light; without the room light, one more for the glow decals). `club.knobs.roomDetail` 0 = unbevelled low-polygon versions in four materials (the lite tier),
// 1 = the full room, 2 = more bottles, more segments, small extras.
//
// Light: with the room's `roomLight` (CONTRACT.md 8.2) every lit material comes from roomLight.material() and every lit thing
// registers an emitter, so the shell's walls and floor receive the bar's and the far lamp's light. Without it (null) the same
// parameters go into plain three materials and a few additive glow decals stand in for the light the shell would have received.
// No three light is created and no shadow flag is touched. Importing this module does nothing.
import * as THREE from 'three';
import { TIERS } from '../tiers.js';
import { Batch, createKit } from './props/kit.js';
import { createAtlas, fallbackWood, fallbackLeather, ART_IDS } from './props/atlas.js';
import { planRoom, hangAt, floorAt, reservedConflicts, WALLS } from './props/layout.js';
import { buildBar } from './props/bar.js';
import { buildFarTable } from './props/fartable.js';
import { chair, sideTable, bench } from './props/seating.js';
import { picture, pictureSize, chalkboard, cueRack, clock, plaque, neonSign } from './props/wall.js';
import { plant, coatStand } from './props/extras.js';
import { EMIT, GLOW, GLASS, GLASS_EDGE, FAR_BODY, R2 } from './props/levels.js';

// light levels: props/levels.js (EMIT = HDR level per kind of emissive primitive, GLOW, GLASS)
export { EMIT };
const WOOD_REPEAT = 0.9;      // metres per repeat of the wood map
const LEATHER_REPEAT = 0.45;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a flat normal map on a canvas (the asset loader swaps the downloaded image into the same texture object)
function flatNormal() {
  const c = document.createElement('canvas'); c.width = c.height = 4;
  const x = c.getContext('2d'); x.fillStyle = 'rgb(128,128,255)'; x.fillRect(0, 0, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.name = 'club.props.flatnormal';
  return t;
}

// Bottles and glasses in front of a lit panel. Real glass (refraction through 150 bottles) is out of reach; what a back-lit
// bottle LOOKS like is not. Four terms on an opaque material with a dark albedo and low roughness (levels.js GLASS_EDGE):
//   body  the panel's light comes through the liquid, in the liquid's colour (palette colour x GLASS as emission): full in the
//         middle of the silhouette and falling off over the whole width toward the outline, so the bottle shades as a
//         cylinder of liquid and not as a flat cut-out;
//   rim   the back light bent round the glass through the liquid: a thin line of the bottle's own colour along the outline,
//         which draws the neck and the shoulders against the dark upper part of the recess;
//   key   the room's key light (the lamp over the played table) on the glass: a narrow vertical highlight whose place on the
//         bottle follows the eye, computed from the horizontal parts of the normal and the half vector (a point light gives a
//         dot on a cylinder; a real room gives a streak);
//   glint the same light where the glass turns up toward it, on the shoulder: a spot a few millimetres across at the level of
//         a point source (far over the bloom threshold). Behind the lens each one is a small disc, sharp it is a sparkle.
//         Only the bottles and glasses the kit marked carry one (the blue channel of the vertex colour: the glint gate).
// The kit's shade `k` of a glass primitive (red channel) is how much lit panel stands behind that part of it: 1 at the foot
// of a bottle in a pool of the panel's light, less between two pools and up the bottle; less for a glass on the counter.
const GLASS_PARS = /* glsl */`
uniform vec4 uClubGlass;      // x: exponent of the body falloff; y: glint level; z: rim level; w: key highlight level
uniform vec3 uClubGlassKey;   // world position of the key light
`;
const GLASS_FRAGMENT = /* glsl */`
{
  float clubGlassFacing = saturate( dot( normal, normalize( vViewPosition ) ) );
  float clubGlassLit = 1.0;
  float clubGlassGate = 0.0;
  #ifdef USE_COLOR
    clubGlassLit = vColor.r;   // the kit's baked shade: how much lit panel stands behind this piece
    clubGlassGate = vColor.b;  // the glint gate: 0 = no glint on this piece
  #endif
  float clubGlassBody = mix( ${GLASS_EDGE.floor.toFixed(3)}, 1.0,
    pow( saturate( ( clubGlassFacing - ${GLASS_EDGE.lo.toFixed(3)} ) / ${(GLASS_EDGE.hi - GLASS_EDGE.lo).toFixed(3)} ), uClubGlass.x ) );
  float clubGlassRim = smoothstep( ${GLASS_EDGE.rimLo.toFixed(3)}, ${GLASS_EDGE.rimHi.toFixed(3)}, 1.0 - clubGlassFacing );
  vec3 clubGlassPos = cameraPosition - ( vec4( vViewPosition, 0.0 ) * viewMatrix ).xyz;
  vec3 clubGlassN = normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
  vec3 clubGlassH = normalize( cameraPosition - clubGlassPos ) + normalize( uClubGlassKey - clubGlassPos );
  float clubGlassAlign = saturate( dot( normalize( clubGlassN.xz + vec2( 1e-5 ) ), normalize( clubGlassH.xz + vec2( 1e-5 ) ) ) );
  float clubGlassKey = pow( clubGlassAlign, ${GLASS_EDGE.keyPower.toFixed(1)} ) * ( 1.0 - smoothstep( 0.35, 0.8, abs( clubGlassN.y ) ) );
  float clubGlassGlint = pow( clubGlassAlign, ${GLASS_EDGE.glintPower.toFixed(1)} )
    * smoothstep( ${GLASS_EDGE.glintLo[0].toFixed(3)}, ${GLASS_EDGE.glintLo[1].toFixed(3)}, clubGlassN.y ) * ( 1.0 - smoothstep( ${GLASS_EDGE.glintHi[0].toFixed(3)}, ${GLASS_EDGE.glintHi[1].toFixed(3)}, clubGlassN.y ) );
  totalEmissiveRadiance = totalEmissiveRadiance * ( clubGlassBody * clubGlassLit + uClubGlass.z * clubGlassRim * ( 0.35 + 0.65 * clubGlassLit ) )
    + vec3( 1.0, 0.95, 0.86 ) * ( uClubGlass.w * clubGlassKey + uClubGlass.y * clubGlassGate * clubGlassGlint );
}
`;
// The lacquered tops. The room light is a handful of representative points: at the low eye of the aim view the bar top is seen
// almost edge-on, Fresnel goes to 1 there, and every lit shelf section showed as its own clipped white ellipse on the counter
// where a real top would mirror the whole lit back bar as one band. A soft knee on the DIRECT highlight only (the cube's
// reflection, the diffuse light and the emission are untouched): it keeps its colour and never reaches white.
const SHEEN_KNEE = 0.45;   // the direct highlight tends to this HDR level (about 0.72 on the display at the app's exposure)
const SHEEN_FRAGMENT = /* glsl */`
{
  float clubSheenPeak = max( reflectedLight.directSpecular.r, max( reflectedLight.directSpecular.g, reflectedLight.directSpecular.b ) );
  reflectedLight.directSpecular /= 1.0 + clubSheenPeak / ${SHEEN_KNEE.toFixed(3)};
}
`;
function sheenKnee(m) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function clubPropsSheen(shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${SHEEN_FRAGMENT}`);
  };
  m.customProgramCacheKey = function clubPropsSheenKey() { return `${typeof prevKey === 'function' ? prevKey.call(this) : ''}|club-props-sheen-v1`; };
  return m;
}

// The second table's body (levels.js FAR_BODY): the wood inside the body's box returns `lift` times the diffuse light. It
// stands where the room's light is weakest and read as a black silhouette; its vertex shade and the material's colour are
// what the room's bake reads as albedo, so the lift is here, in the wood material's answer to the light, and the baked files
// stay current. One box test per wood fragment; reflections and every other wooden thing are untouched.
const FAR_BODY_PARS = /* glsl */`
uniform vec4 uClubFarBox;    // the body's box in world metres: centre x, centre z, half size x, half size z
uniform vec2 uClubFarLift;   // x: the top of the box (world y); y: the lift minus one (0 = none)
`;
const FAR_BODY_LINE = 'vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;';
const FAR_BODY_FRAGMENT = /* glsl */`${FAR_BODY_LINE}
{
  vec3 clubFarPos = cameraPosition - ( vec4( vViewPosition, 0.0 ) * viewMatrix ).xyz;
  vec2 clubFarOut = abs( clubFarPos.xz - uClubFarBox.xy ) - uClubFarBox.zw;
  totalDiffuse *= 1.0 + uClubFarLift.y * step( max( clubFarOut.x, clubFarOut.y ), 0.0 ) * step( clubFarPos.y, uClubFarLift.x );
}
`;
function liftFarBody(m, uniforms) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function clubPropsFarBody(shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    shader.uniforms.uClubFarBox = uniforms.uClubFarBox;
    shader.uniforms.uClubFarLift = uniforms.uClubFarLift;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FAR_BODY_PARS}`)
      .replace(FAR_BODY_LINE, FAR_BODY_FRAGMENT);
  };
  m.customProgramCacheKey = function clubPropsFarBodyKey() { return `${typeof prevKey === 'function' ? prevKey.call(this) : ''}|club-props-farbody-v1`; };
  m.userData.clubFarBody = uniforms;   // the tools switch the lift at run time through this (on/off pictures of one page)
  return m;
}

function glassify(m, uniforms) {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = function clubPropsGlass(shader, renderer) {
    if (typeof prev === 'function') prev.call(this, shader, renderer);
    shader.uniforms.uClubGlass = uniforms.uClubGlass;
    shader.uniforms.uClubGlassKey = uniforms.uClubGlassKey;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLASS_PARS}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${GLASS_FRAGMENT}`);
  };
  m.customProgramCacheKey = function clubPropsGlassKey() { return `${typeof prevKey === 'function' ? prevKey.call(this) : ''}|club-props-glass-v3`; };
  return m;
}

/**
 * The tool switches of the props, from the boot URL: `?clubprops=key:value,...` (A/B pictures of the same tree; the app never
 * sets one). shelves:r2 = round 2's back bar (the even cream panel, the pale palette, no glints, no bulb string); far:r2 =
 * round 2's second table (a flat cloth, dull shades, lit balls without shadows); contact:0 = no contact-size shadow overlays
 * (round 2: every overlay was cast-size and hidden under the baked light); points:0 = no small point sources (candles, pilot
 * lamps, bulbs); r2 = the first three; body:0 = no lift on the second table's body (levels.js FAR_BODY).
 */
export function readLook(query) {
  const look = { shelves: 'r3', far: 'r3', contact: true, points: true, body: true };
  let text = '';
  try { text = String(query?.get?.('clubprops') ?? ''); } catch { text = ''; }
  for (const part of text.split(',')) {
    const [k, v = ''] = part.trim().split(':');
    if (k === 'r2') { look.shelves = 'r2'; look.far = 'r2'; look.contact = false; }
    else if (k === 'shelves' && v === 'r2') look.shelves = 'r2';
    else if (k === 'far' && v === 'r2') look.far = 'r2';
    else if (k === 'contact' && (v === '0' || v === 'off')) look.contact = false;
    else if (k === 'points' && (v === '0' || v === 'off')) look.points = false;
    else if (k === 'body' && (v === '0' || v === 'off')) look.body = false;
  }
  return look;
}

function makeMaterials(club, roomLight, detail, look) {
  const lite = (club?.knobs?.textureSize ?? 2048) <= 1024;
  // TIER LINE (owner: parity, CONTRACT 11.2): the atlas size comes from `club.knobs.propsAtlasScale` (tiers.js: 0.5 = 1024 x 512
  // on lite and base, 1 = 2048 x 1024 on high); without the knob the texture size decides as before
  const atlasScale = club?.knobs?.propsAtlasScale === 0.5 || club?.knobs?.propsAtlasScale === 1 ? club.knobs.propsAtlasScale : (lite ? 0.5 : 1);
  const atlas = createAtlas({ scale: atlasScale, look });
  const shared = (id, opts) => {
    try { if (typeof club?.assets?.texture === 'function') return club.assets.texture(id, opts); } catch { /* fall through */ }
    const t = opts.fallback;
    t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  const woodMap = shared('wood_dark.color', { srgb: true, anisotropy: 8, fallback: fallbackWood(lite ? 256 : 512) });
  // TIER LINE (owner: parity): at detail 0 the leather batch is folded into paint (buildLevel), so the file is not asked for
  // there: it was a 1024 px upload nothing drew. The material keeps a small procedural stand-in.
  const leatherStandIn = fallbackLeather(256);
  if (detail < 1) { leatherStandIn.colorSpace = THREE.SRGBColorSpace; leatherStandIn.wrapS = leatherStandIn.wrapT = THREE.RepeatWrapping; }
  const leatherMap = detail >= 1 ? shared('leather.color', { srgb: true, anisotropy: 4, fallback: leatherStandIn }) : leatherStandIn;
  const woodNormal = detail >= 2 ? shared('wood_dark.normal', { srgb: false, anisotropy: 4, fallback: flatNormal() }) : null;
  const lit = !!roomLight && typeof roomLight.material === 'function' && typeof roomLight.emissive === 'function';

  // every lit prop material multiplies its albedo by the baked vertex shade (props/kit.js `k`)
  const standard = (p) => {
    let m;
    if (lit) m = roomLight.material({ ...p, vertexColors: true });
    else {
      m = new THREE.MeshStandardMaterial({ color: p.color ?? 0xffffff, roughness: p.roughness ?? 0.7, metalness: p.metalness ?? 0 });
      if (p.map) m.map = p.map;
      if (p.normalMap) m.normalMap = p.normalMap;
      if (p.emissive) m.emissive.copy(p.emissive);
      if (p.emissiveMap) m.emissiveMap = p.emissiveMap;
      m.name = p.name;
    }
    if (m.vertexColors !== true) { m.vertexColors = true; m.needsUpdate = true; }
    return m;
  };
  // the emissive material: atlas colour x the batch's per-vertex HDR level (EMIT above)
  const emissive = (p) => {
    let m;
    if (lit) m = roomLight.emissive(p);
    else {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(p.intensity ?? 1) });
      if (p.map) m.map = p.map;
      m.name = p.name;
    }
    if (m.vertexColors !== true) { m.vertexColors = true; m.needsUpdate = true; }
    return m;
  };
  // the glass material's uniforms: the falloff and the levels (levels.js GLASS_EDGE; round 2's values behind the tool
  // switch), and the key light's place, which buildProps() sets from the table's keep-out rectangle
  const oldShelves = look?.shelves === 'r2';
  const glassUniforms = {
    uClubGlass: { value: new THREE.Vector4(oldShelves ? R2.power : GLASS_EDGE.power, oldShelves ? 0 : GLASS_EDGE.glintLevel, GLASS_EDGE.rimLevel, GLASS_EDGE.keyLevel) },
    uClubGlassKey: { value: new THREE.Vector3(0, 1.0, 0) },
  };
  const glassLevel = oldShelves ? R2.GLASS : GLASS;
  // the far body's lift (levels.js FAR_BODY): the box is set when a level with the second table is shown (show()); until
  // then, and on a level without that table, the box is empty and the lift 0
  const farBody = { uClubFarBox: { value: new THREE.Vector4(0, 0, -1, -1) }, uClubFarLift: { value: new THREE.Vector2(-1000, 0) } };
  const mats = {
    wood: liftFarBody(standard({ color: 0xffffff, map: woodMap, normalMap: woodNormal, roughness: 0.5, metalness: 0, envMapIntensity: 0.12, name: 'club.props.wood' }), farBody),
    // lacquer. Roughness 0.4, a satin finish and not a mirror: the room light is a handful of representative points, and a
    // glossier top shows each as a clipped white dot where a real top would show the whole lit back bar as a band (the peak of
    // the highlight goes with roughness^-4: 0.28 clipped three dots on the counter, 0.4 leaves a quarter of that, a warm sheen)
    top: sheenKnee(standard({ color: 0x9a8a7c, map: woodMap, roughness: 0.4, metalness: 0, envMapIntensity: 0.3, name: 'club.props.lacquer' })),
    leather: standard({ color: 0xffffff, map: leatherMap, roughness: 0.4, metalness: 0, envMapIntensity: 0.2, name: 'club.props.leather' }),
    metal: standard({ color: 0xffffff, map: atlas.texture, roughness: 0.32, metalness: 1, envMapIntensity: 0.75, name: 'club.props.metal' }),
    paint: standard({ color: 0xffffff, map: atlas.texture, roughness: 0.6, metalness: 0, envMapIntensity: 0.1, name: 'club.props.paint' }),
    glow: standard({ color: 0xffffff, map: atlas.texture, roughness: 0.1, metalness: 0, emissive: new THREE.Color(GLOW, GLOW, GLOW), emissiveMap: atlas.texture, envMapIntensity: 0.5, name: 'club.props.glow' }),
    // glass has next to no diffuse colour of its own (a grey albedo under the room's light made every bottle milky): what
    // shows is the light through it (the emission above), the rim, the highlight and a little of the room's reflection
    glass: glassify(standard({ color: 0x1e1e1e, map: atlas.texture, roughness: 0.08, metalness: 0, emissive: new THREE.Color(glassLevel, glassLevel, glassLevel), emissiveMap: atlas.texture, envMapIntensity: 0.25, name: 'club.props.glass' }), glassUniforms),
    emit: emissive({ color: 0xffffff, intensity: 1, map: atlas.texture, name: 'club.props.emissive' }),
    decal: null,
    // Shadow overlays: multiplied over whatever is behind them (the shell's floor and walls), so they need nothing from the
    // shell. Two meshes, because the baked room light holds one kind and not the other. The material NAMES are the
    // agreement with the room role (scratch/room/FOR-PROPS.md, round 3): room.js reads them.
    //   shadow   `club.props.castshadow`: CAST-size, the wide soft shadow a piece of furniture throws under the room's
    //            lamps. The bake holds real ones, so room.js hides this mesh while the bake is in use.
    //   contact  `club.props.contactshadow`: CONTACT-size, the dark line where a leg, a plinth, a pot or a frame meets the
    //            floor or the wall. Smaller than a texel of the bake, so it is drawn always: it seats the furniture.
    shadow: new THREE.MeshBasicMaterial({ map: atlas.texture, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    contact: new THREE.MeshBasicMaterial({ map: atlas.texture, blending: THREE.MultiplyBlending, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  mats.shadow.name = 'club.props.castshadow';
  mats.contact.name = 'club.props.contactshadow';
  if (!lit) {
    mats.decal = new THREE.MeshBasicMaterial({ map: atlas.texture, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mats.decal.name = 'club.props.glowdecal';
  }
  const textures = [atlas.texture, woodMap, leatherMap, ...(woodNormal ? [woodNormal] : [])];
  return { mats, atlas, lit, textures, glassUniforms, farBody };
}

/**
 * Build the club room's props. `box` = the shell's interior box ({ min, max }, world metres), `floorY` the floor height,
 * `tableBounds` the keep-out rectangle around the table and the players ({ minX, maxX, minZ, maxZ }), `roomLight` the room's
 * light object (CONTRACT.md 8.2) or null. Never throws: on any error it returns an empty group and says why in counts().
 */
export async function buildProps(club, { box, floorY = -0.79, tableBounds = null, roomLight = null, reserved = null, layout = null } = {}) {
  const group = new THREE.Group();
  group.name = 'club.props';
  // the shadow overlays are split by size (makeMaterials): the room keeps the contact-size ones under its baked light
  group.userData.clubShadowSplit = true;
  const emissives = [];
  const levels = new Map();        // 'detail|far' -> { group, emissives, counts }
  const registered = new Set();    // emitter ids handed to roomLight
  let current = null;
  let failure = null;
  let made = null;

  // What the shell keeps for itself (CONTRACT.md 8.6), both feature-detected: `reserved` (wall spans in this module's terms:
  // [{ wall: 'xp' | 'xn' | 'zp' | 'zn', from, to }], world metres along the wall) and `layout` (the shell's own description;
  // only `door` and `sconces` are read). Nothing is placed on a reserved span: not hung, not standing against the wall, not the
  // bar (props/layout.js). A door also keeps its floor free. Wall lamps the shell lists only in `layout` are kept clear by
  // everything hung and by tall floor props; the bar yields to a lamp only when the lamp's span is in `reserved`.
  const keepOff = { reserved: [], lamps: [] };
  try {
    const WALL_ID = { north: 'zn', south: 'zp', east: 'xp', west: 'xn' };
    const along = (wall, p) => (wall === 'xp' || wall === 'xn' ? p[2] : p[0]);
    const door = layout?.door && WALL_ID[layout.door.wall] ? { wall: WALL_ID[layout.door.wall], from: along(WALL_ID[layout.door.wall], layout.door.min), to: along(WALL_ID[layout.door.wall], layout.door.max) } : null;
    for (const r of Array.isArray(reserved) ? reserved : []) {
      if (!r || !['xp', 'xn', 'zp', 'zn'].includes(r.wall) || !Number.isFinite(r.from) || !Number.isFinite(r.to)) continue;
      const lo = Math.min(r.from, r.to), hi = Math.max(r.from, r.to);
      // a door keeps the floor in front of it free: the span says so (`floor: true` or `kind: 'door'`), or it is the layout's door
      const isDoor = r.floor === true || r.kind === 'door' || (!!door && door.wall === r.wall && door.from < hi && door.to > lo);
      keepOff.reserved.push({ wall: r.wall, from: lo, to: hi, floor: isDoor });
    }
    for (const sc of Array.isArray(layout?.sconces) ? layout.sconces : []) {
      const wall = WALL_ID[sc?.wall];
      if (wall && Array.isArray(sc.position)) keepOff.lamps.push({ wall, at: along(wall, sc.position) });
    }
  } catch (e) { console.warn('[club] props: the shell layout could not be read (nothing is kept off):', e); }

  let look = readLook(null);
  try { look = readLook(club?.ctx?.query); } catch { /* no boot query: the shipped look */ }
  const knobDetail = () => { const d = Number(club?.knobs?.roomDetail); return d === 0 || d === 1 || d === 2 ? d : 1; };
  const knobFar = () => club?.knobs?.farTable !== false;

  function buildLevel(detail, wantFar) {
    const { mats, atlas: A, lit } = made;
    const K = createKit({ bevels: detail >= 1, minBevel: detail === 1 ? 0.0075 : 0 });
    const B = { wood: new Batch('wood'), paint: new Batch('paint'), glow: new Batch('glow'), glass: new Batch('glass'), emit: new Batch('emissive', { hdr: true }), decal: new Batch('glowdecal'), shadow: new Batch('castshadow'), contact: new Batch('contactshadow') };
    if (detail >= 1) { B.top = new Batch('lacquer'); B.leather = new Batch('leather'); B.metal = new Batch('metal'); } else { B.top = B.wood; B.leather = B.paint; B.metal = B.paint; }
    const WOOD = { w: WOOD_REPEAT }, LEATHER = { w: LEATHER_REPEAT };
    const sw = (name) => ({ s: A.s(name) });
    const uv = { wood: () => WOOD, leather: () => (detail >= 1 ? LEATHER : sw('leatherFlat')), metal: sw, sw };
    const rand = rng(90210 + detail);
    // TIER LINE (owner: parity): the multiplier on the round parts' segment counts is `club.knobs.propSegments` (tiers.js);
    // without the knob the detail level decides as before
    const segK = Number(club?.knobs?.propSegments) > 0 ? Number(club.knobs.propSegments) : (detail === 0 ? 0.5 : detail === 1 ? 1 : 1.4);
    const seg = (n) => Math.max(4, Math.round(n * segK));
    const blobUV = { r: A.r('blob', 3) }, boxUV = { r: A.r('blobBox', 3) }, touchUV = { r: A.r('touch', 3) };
    // a long soft-edged box in three pieces (a middle that only falls off across its depth, and two ends), so the edge is as
    // soft at the ends of a four-metre plinth as along it
    const [bu0, bv0, bu1, bv1] = boxUV.r, bum = (bu0 + bu1) / 2;
    const stripUV = [{ r: [bu0, bv0, bum, bv1] }, { r: [bum, bv0, bum, bv1] }, { r: [bum, bv0, bu1, bv1] }];
    const touching = look.contact !== false;
    const c = {
      K, B, A, uv, detail, seg, rand, lit, E: EMIT, look,
      // TIER LINE (owner: parity, CONTRACT 11.2): `club.knobs.farTableDetail` (tiers.js: 0 on base, 1 on high) for the far
      // table's smallest parts (room/props/fartable.js: the balls' highlight dots, the rail sights); without the knob: 1
      farDetail: club?.knobs?.farTableDetail === 0 ? 0 : 1,
      // ---- CAST-size overlays (hidden by the room while its baked light is in use: the bake holds real ones)
      /** The soft shadow a prop throws on the floor, w x d metres, centred at (x, z) of the current frame; n = how many layers. */
      blob(w, d, x = 0, z = 0, n = 1) { for (let i = 0; i < n; i++) K.quad(B.shadow, w, d, [x, 0.004 + i * 0.001, z], { rx: -Math.PI / 2, uv: blobUV }); },
      /** A soft drop shadow on the wall behind something w x h at (x, y) of a wall frame. */
      wallShadow(w, h, x, y) { K.quad(B.shadow, w * 1.3 + 0.12, h * 1.3 + 0.12, [x + 0.01, y - 0.03, 0.003], { uv: boxUV }); },
      // ---- CONTACT-size overlays (always drawn: smaller than the bake can hold)
      /** Where something round meets the floor: w x d metres at (x, z). `dark` = the heavy blob (a leg's foot, a pot); else the light one (the air under a seat). */
      touch(w, d, x = 0, z = 0, dark = false) { if (touching) K.quad(B.contact, w, d, [x, 0.0025, z], { rx: -Math.PI / 2, uv: dark ? blobUV : touchUV }); },
      /**
       * Where a plinth or a box meets the floor: its footprint len x depth (len >= depth) centred at (x, z), the long side along
       * the local x (or z with `turn`). The overlay is wider than the footprint: black under it, about half strength at its
       * edge, clear within 0.12 m of it (the soft box's ramp is a quarter of the overlay's depth).
       */
      touchBox(len, depth, x = 0, z = 0, turn = false) {
        if (!touching) return;
        const dq = depth * 1.35 + 0.04, e = dq / 2, mid = Math.max(0, len - depth), ry = turn ? Math.PI / 2 : 0, y = 0.003;
        const at = (dx) => (turn ? [x, y, z - dx] : [x + dx, y, z]);
        if (mid > 0.01) K.quad(B.contact, mid, dq, at(0), { rx: -Math.PI / 2, ry, uv: stripUV[1] });
        K.quad(B.contact, e, dq, at(-(mid + e) / 2), { rx: -Math.PI / 2, ry, uv: stripUV[0] });
        K.quad(B.contact, e, dq, at((mid + e) / 2), { rx: -Math.PI / 2, ry, uv: stripUV[2] });
      },
      /**
       * Where a hung thing meets the wall: a soft line under its lower edge (w wide, the edge at height y). The dark middle of
       * the strip is behind the thing; what shows under the edge is the last part of the ramp, about `drop` x 0.3 high.
       */
      wallTouch(w, x, y, drop = 0.08) { if (touching) K.quad(B.contact, w, drop * 2, [x, y + drop * 0.6, 0.002], { uv: stripUV[1] }); },
      /** The same for something round on the wall (the clock): a dark round blob d across behind it, centred at (x, y). */
      wallBlob(d, x, y) { if (touching) K.quad(B.contact, d, d, [x, y, 0.002], { uv: blobUV }); },
    };
    const plan = planRoom({ box, floorY, tableBounds, farTable: wantFar, reserved: keepOff.reserved, lamps: keepOff.lamps });
    const emitters = [];
    const stats = { bottles: 0, chairs: 0, pictures: 0, hung: [] };
    // where every sign, board and picture hangs (world metres; `n` = the wall's normal into the room): the tools aim their
    // close views with it (the legal evidence frames), nothing else reads it
    const note = (frame, what, lx, y, w, h) => {
      const m = frameMatrix(frame);
      const p = new THREE.Vector3(lx, y, 0.03).applyMatrix4(m), n = new THREE.Vector3(0, 0, 1).transformDirection(m);
      stats.hung.push({ what, p: p.toArray().map((v) => +v.toFixed(3)), n: n.toArray().map((v) => +v.toFixed(3)), w: +w.toFixed(3), h: +h.toFixed(3) });
    };
    let artIndex = 0;
    const styles = ['wood', 'black', 'gilt'];

    const frameMatrix = (f) => new THREE.Matrix4().makeRotationY(f.ry).setPosition(f.x, floorY, f.z);
    const collect = (list, m) => {
      const rot = new THREE.Matrix3().setFromMatrix4(m);
      for (const e of list ?? []) {
        emitters.push({
          id: `props.${e.id}`, type: e.type, intensity: e.intensity, radius: e.radius, size: e.size,
          position: new THREE.Vector3(...e.p).applyMatrix4(m), color: new THREE.Color(...e.color),
          normal: e.n ? new THREE.Vector3(...e.n).applyMatrix3(rot) : null, axis: e.axis ? new THREE.Vector3(...e.axis).applyMatrix3(rot) : null,
        });
      }
    };

    if (plan.bar) { const m = frameMatrix(plan.bar.frame); K.within(m, () => { const r = buildBar(c, plan.bar); collect(r.emitters, m); stats.bottles = r.bottles; }); note(plan.bar.frame, 'bar.shelves', 0, 1.56, plan.bar.len, 1.2); }
    // the far body's box in world metres (the lift of levels.js FAR_BODY): [centre x, centre z, half x, half z, top y]
    let farBox = null;
    if (plan.far) {
      const m = frameMatrix(plan.far);
      K.within(m, () => {
        const r = buildFarTable(c, plan.far); collect(r.emitters, m);
        const co = Math.abs(Math.cos(plan.far.ry)), si = Math.abs(Math.sin(plan.far.ry)), [hl, hw] = r.body.half;
        farBox = [plan.far.x, plan.far.z, hl * co + hw * si, hl * si + hw * co, floorY + FAR_BODY.top];
      });
    }

    // ---- wall slots. Everything hung goes through hang() and everything that stands against a wall through floor(): both
    // keep off the shell's reserved spans (windows, doors, wall lamps) without exception, and hang() also keeps hung things
    // off each other. What does not fit is left out.
    const floorSpans = [];
    const worldSpan = (s, lx, hw) => { const w = WALLS[s.wall], c = s.s + (w.ux + w.uz) * lx; return [c - hw, c + hw]; };
    const hang = (s, x, hw, fn) => { const lx = hangAt(plan, s, x, hw); return lx === null ? null : fn(lx); };
    /** Local x for a floor prop of half-width hw near x, or null (no depth, in a view, or the wall there is the shell's). */
    const floor = (s, x, hw, need, what, tall = false) => {
      if (!s.clear || s.depth < need) return null;
      const lx = floorAt(plan, s, x, hw, tall);
      if (lx !== null) { const [a, b] = worldSpan(s, lx, hw); floorSpans.push({ wall: s.wall, from: a, to: b, what }); }
      return lx;
    };
    const pic = (s, x, y, h) => {
      const art = ART_IDS[artIndex % ART_IDS.length], style = styles[artIndex % styles.length];
      const [w, hh] = pictureSize(h, art, detail);
      hang(s, x, w / 2, (lx) => { artIndex++; stats.pictures++; picture(c, lx, y, h, art, style); note(s.frame, `art.${art}`, lx, y, w, hh); });
    };
    // two chairs and a side table against the wall; a chair and its table where the free wall is shorter (a bay between two
    // wall lamps holds 1.5 m); nothing where even that does not fit
    const seats = (s, x = 0) => {
      const two = floor(s, x, 0.84, 0.58, 'seats');
      if (two !== null) {
        K.at(two - 0.56, 0, 0.31, 0.1, () => chair(c));
        K.at(two + 0.56, 0, 0.31, -0.1, () => chair(c));
        K.at(two, 0, 0.3, 0, () => sideTable(c));
        c.blob(2.2, 1.15, two, 0.3);
        stats.chairs += 2;
        return;
      }
      const one = floor(s, x, 0.6, 0.58, 'chair and table');
      if (one !== null) {
        K.at(one - 0.3, 0, 0.31, 0.12, () => chair(c));
        K.at(one + 0.31, 0, 0.3, 0, () => sideTable(c));
        c.blob(1.6, 1.15, one, 0.3);
        stats.chairs += 1;
      }
    };
    const stand = (s, x, need, fn, r, what) => {
      if (detail < 1) return;
      const lx = floor(s, x, 0.26, need, what, true);
      if (lx === null) return;
      // how far the nearer end of this wall is (a plant in a corner keeps its blades inside the room)
      const w = WALLS[s.wall], at = s.s + (w.ux + w.uz) * lx, xw = s.wall === 'xp' || s.wall === 'xn';
      const side = Math.min(at - (xw ? box.min.z : box.min.x), (xw ? box.max.z : box.max.x) - at);
      K.at(lx, 0, 0.33, 0, () => { fn(c, 0.33, side); c.blob(r, r); });
    };
    const sign = (s, which) => {
      const hw = which === 'A' ? 0.71 : 0.58;
      const x = s.toward ? s.toward * Math.max(0, s.width / 2 - hw - 0.08) : 0;
      return hang(s, x, hw, (lx) => { note(s.frame, which === 'A' ? 'sign.a' : 'sign.b', lx, 1.52, which === 'A' ? 1.36 : 1.1, which === 'A' ? 0.35 : 0.393); return [neonSign(c, lx, 1.52, which)]; });
    };
    const recipes = {
      seats(s) { seats(s); },
      seatNeonA(s) { seats(s); return sign(s, 'A'); },
      seatNeonB(s) { seats(s); return sign(s, 'B'); },
      neonB(s) { stand(s, 0.75, 0.55, plant, 0.85, 'plant'); return sign(s, 'B'); },
      rackChalk(s) {
        hang(s, -0.52, 0.4, (lx) => cueRack(c, lx));
        // the board takes the size the wall has room for
        for (const bw of [0.92, 0.76, 0.6]) { if (hang(s, 0.42, bw / 2 + 0.045, (lx) => { chalkboard(c, lx, 1.52, bw, bw * 0.63); note(s.frame, 'chalkboard', lx, 1.52, bw, bw * 0.63); return true; })) break; }
      },
      seatFrames(s) { seats(s); pic(s, -0.52, 1.66, 0.4); pic(s, 0, 1.72, 0.36); pic(s, 0.52, 1.66, 0.4); },
      plantFrame(s) { stand(s, 0.55, 0.55, plant, 0.85, 'plant'); pic(s, -0.25, 1.62, 0.56); },
      rackFrame(s) { hang(s, -0.45, 0.4, (lx) => cueRack(c, lx)); pic(s, 0.5, 1.62, 0.42); },
      frames(s) { pic(s, -0.38, 1.62, 0.46); pic(s, 0.38, 1.62, 0.46); },
      benchFrames(s) {
        for (const len of [1.7, 1.4, 1.15].filter((l) => l <= s.width - 0.3)) {   // the longest bench the free wall holds
          const lx = floor(s, 0, len / 2 + 0.07, 0.55, 'bench');
          if (lx !== null) { K.at(lx, 0, 0, 0, () => bench(c, len)); c.blob(len + 0.7, 1.25, lx, 0.3); break; }
        }
        pic(s, -0.42, 1.7, 0.4); pic(s, 0.42, 1.7, 0.4);
      },
      clockStand(s) { stand(s, 0.55, 0.5, coatStand, 0.6, 'coat stand'); hang(s, -0.2, 0.21, (lx) => { clock(c, lx, 1.95); note(s.frame, 'clock', lx, 1.95, 0.4, 0.4); }); },
      plaque(s) { hang(s, 0, 0.49, (lx) => { plaque(c, lx, 1.66, 0.9); note(s.frame, 'plaque', lx, 1.66, 0.9, 0.5625); }); stand(s, 0.8, 0.5, coatStand, 0.6, 'coat stand'); },
    };
    for (const s of plan.slots) {
      const m = frameMatrix(s.frame);
      K.within(m, () => { const list = recipes[s.recipe]?.(s); collect(list, m); });
    }

    const g = new THREE.Group();
    g.name = `club.props.detail${detail}${plan.far ? '.far' : ''}`;
    const out = [];
    const order = detail >= 1 ? ['wood', 'top', 'leather', 'metal', 'paint', 'glow', 'glass', 'emit', 'contact', 'shadow', 'decal'] : ['wood', 'paint', 'glow', 'glass', 'emit', 'contact', 'shadow', 'decal'];
    const byMaterial = {};
    let triangles = 0, drawCalls = 0;
    for (const key of order) {
      const b = B[key], mat = mats[key];
      if (!b || !mat || !b.count) continue;
      const mesh = b.toMesh(mat);
      // overlays: drawn after the opaque room, and never a ray target (the shell asks the props what covers its wall lamps)
      if (key === 'shadow' || key === 'contact' || key === 'decal') { mesh.renderOrder = key === 'decal' ? 2 : 1; mesh.raycast = () => {}; }
      if (key === 'emit' || key === 'glow' || key === 'glass' || key === 'decal') out.push(mesh);
      g.add(mesh);
      byMaterial[mat.name] = b.triangles; triangles += b.triangles; drawCalls += 1;
    }
    const counts = {
      detail, farTable: !!plan.far, drawCalls, triangles, byMaterial, emitters: emitters.map((e) => e.id), ...stats,
      slots: plan.slots.map((s) => `${s.wall}@${s.s.toFixed(1)}:${s.recipe}${s.clear ? '' : '(wall only: ' + s.blockedBy + ')'}`),
      far: plan.far ? { on: plan.farOn, x: +plan.far.x.toFixed(2), z: +plan.far.z.toFixed(2) } : null,
      bar: plan.bar ? { length: +plan.bar.len.toFixed(2), from: +plan.bar.from.toFixed(2), to: +plan.bar.to.toFixed(2), counter: plan.bar.cfg.counter > 0, stools: plan.bar.cfg.stools } : null,
      notes: plan.notes,
      // the audit of CONTRACT.md 8.6: every props span that touches a span the shell reserved (empty = strict)
      reserved: { spans: plan.reserved.length, lamps: plan.lamps.length, conflicts: reservedConflicts(plan, floorSpans) },
    };
    return { group: g, emissives: out, emitters, counts, farBox };
  }

  function registerEmitters(level) {
    if (!made.lit || typeof roomLight.addEmitter !== 'function') return;
    const live = new Set();
    // the lite room evaluates half as many emitters (12) and the shell's own lamps fill all but one: only the bar registers
    const list = level.counts.detail === 0 ? level.emitters.filter((e) => /bar\.shelves|far\.lamp/.test(e.id)) : level.emitters;
    for (const e of list) { roomLight.addEmitter(e); live.add(e.id); registered.add(e.id); }
    // an emitter of a level that is no longer shown (the far lamp on a tier without the far table) is switched off
    for (const id of registered) {
      if (!live.has(id)) roomLight.addEmitter({ id, type: 'point', position: new THREE.Vector3(0, -100, 0), color: new THREE.Color(0, 0, 0), intensity: 0, radius: 0.01 });
    }
  }

  function show(detail, wantFar) {
    const key = `${detail}|${wantFar ? 1 : 0}`;
    let level = levels.get(key);
    if (!level) { level = buildLevel(detail, wantFar); levels.set(key, level); group.add(level.group); }
    for (const l of levels.values()) l.group.visible = l === level;
    emissives.length = 0;
    emissives.push(...level.emissives);
    registerEmitters(level);
    // the far body's lift follows the level shown: its box, or an empty box and no lift on a level without the second table
    const fb = level.farBox, lift = fb && look.body !== false ? FAR_BODY.lift - 1 : 0;
    made.farBody.uClubFarBox.value.set(fb ? fb[0] : 0, fb ? fb[1] : 0, fb ? fb[2] : -1, fb ? fb[3] : -1);
    made.farBody.uClubFarLift.value.set(fb ? fb[4] : -1000, lift);
    current = level;
  }

  try {
    if (!box?.min || !box?.max) throw new Error('no room box');
    made = makeMaterials(club, roomLight, knobDetail(), look);
    // the key light of the glass: over the middle of the played table, a metre above the bed (the lamp's place in every room)
    if (tableBounds) made.glassUniforms.uClubGlassKey.value.set((tableBounds.minX + tableBounds.maxX) / 2, floorY + 1.8, (tableBounds.minZ + tableBounds.maxZ) / 2);
    show(knobDetail(), knobFar());
  } catch (e) {
    failure = String(e?.message ?? e);
    console.warn('[club] props are unavailable — the room stays empty:', e);
  }

  return {
    group,
    emissives,
    /** Switch to another tier's detail level ('lite' | 'base' | 'high'); a level is built the first time it is shown. */
    setTier(tier) {
      const k = TIERS[tier];
      if (!k || !made) return;
      try { show(k.roomDetail, k.farTable !== false); } catch (e) { console.warn('[club] props: tier switch failed:', e); }
    },
    counts() {
      if (!current) return { enabled: false, reason: failure ?? 'not built' };
      const A = made.atlas;
      return {
        enabled: true, lit: made.lit, ...current.counts,
        textures: made.textures.length,
        atlas: { size: A.size, bytes: A.bytes },
        levelsBuilt: levels.size,
        look: { ...look },
      };
    },
  };
}
