// Copyright (c) Meta Platforms, Inc. and affiliates.

// arena/surround.js — everything that surrounds the arena's playing floor (CONTRACT.md 13.4 to 13.7, 14). Owner: surround.
// Called by arena/room.js, which owns the hall, the carpet and the backdrop wall.
//
//   buildSurround(club, { box, floorY, tableBounds, roomLight, layout })
//     -> { group, emissives, setTier(tier), counts(), state(), signature(), dispose() }
//
// What is built (every position from arena/layout.js through surround/plan.js; every word and picture from surround/content.js):
//   boards      the ring on the island's edge, module by module: a printed satin panel set back in an aluminium frame with
//               real depth, a recessed plinth, steel feet, joints, posts, a plain back (the camera flies over the ring at
//               full zoom-out), and the LIT RAIL on top: an LED profile (a black anodised extrusion with a slot in its top,
//               an opal cover 2 mm under the lips: plan.js BOARD.profile). What a camera sees of it follows from that
//               section and from an opal sheet's emission law and from nothing else (levels.js RAIL, patchRail below): from a
//               low eye the profile's side and, across the top, the far lip lit by the opal; from higher up the lit face,
//               more of it the higher the eye, with no step and no switch (CONTRACT 15.3). One room-light tube per side for
//               the BOARD WASH (an LED run in the return of the top frame member: the band on the printed face, the pool
//               on the carpet at the boards' feet); the rail itself faces up and has no emitter;
//   seating     EMPTY tiered seating behind the boards on three sides: stepped decks, a stair aisle per block with pale
//               nosings and step lights, a guard rail with a kick plate in front of the first row, black hoop handrails at
//               the aisle's edges, and FOLDED seats. On the high tier every seat is real (two instanced meshes: backs with
//               an upholstered pad, tipped-up pans; standards, armrests and hinge bars merged), each with its own small
//               difference from a fixed seed; on the default tiers one leaning card of the same seat per row. No people:
//               no figure, silhouette, head or face, painted or modelled (content.js holds the rule). OCHRE upholstery
//               on black shells (round A5, CONTRACT 17.3: one muted colour, a real fabric albedo; levels.js SEATS has
//               the three kinds and the tool switch). Round A5: the real seat is SEWN (a piped edge and a stitched
//               seam on the back's pad, the pan's cushion with its cloth roll over the lip, an armrest cap in the
//               shells' gloss, a blank number plate: four instanced meshes; seat.js), and each row carries a blank
//               plate on its aisle standard. The seats' LEVEL is the hall's light (analytic or baked) on surfaces of
//               their real albedo (levels.js ALBEDO, CONTRACT 15.2): no shade is painted on a deck, a frame or a row;
//   scoreboard  an LED cabinet on wall rails on the backdrop showing a title card: no score, no names; one tube emitter for
//               its spill.
//   shadows     contact-size and cast-size multiply overlays under the boards' feet, the decks and the seat rows, under the
//               material names `arena.surround.contactshadow` / `arena.surround.castshadow` (the split of the club props,
//               room.js applyPropsShadow: a bake keeps the first and replaces the second).
//
// Detail (`club.knobs.roomDetail`): 2 = every seat real, round tubes, bevelled frames, braces and pads on the feet, step
// light bezels, a hoop per row; 1 = seat cards on real stepped decks with real row ends, the same boards and rail, a hoop
// on every second row; 0 = the lite room: decks and row cards without the fittings, half-size canvases, no normal maps,
// the rails as its only emitters.
//
// The cut (arena/layout.js SIDE, cutPlanes): the app's camera can fly over the boards into the air above the lower rows, so
// every vertex carries the `roomSide` attribute and every material is made with `hide: true`: a seating block (mark north |
// east | south) and the scoreboard (west) are not drawn while the camera is beyond their plane; the boards are `keep`.
//
// Cost model: one merged batch per material and per side of the hall (room/props/kit.js; the split by side keeps every
// mesh's box clear of the table, see buildLevel): seven materials on a side, so 28 meshes of which a view draws the sides
// in its frustum; the high tier adds two instanced meshes for the seats and drops the three card meshes. 24 at detail 0.
// Light: every lit material comes from roomLight.material(), every emissive one from roomLight.emissive(); without the
// service (null: a dev page) the same numbers go into plain three materials. No three light is created or changed, no shadow
// flag is touched. Importing this module does nothing.
import * as THREE from 'three';
import { TIERS } from '../tiers.js';
import { Batch, createKit } from '../room/props/kit.js';
import { ARENA, PALETTE, WORDS, SIDE } from './layout.js';
import { planSurround, planSignature, profileSection, capOf, seatForm, BOARD, SEAT, UPHOLSTERY } from './surround/plan.js';
import { paintAtlas, paintSeatCard, paintSeatCardFlat, paintScoreboard, weaveMaps, panelNormal, CARD_TILE_WEAR } from './surround/paint.js';
import { PANEL, SEAT_CARD, wordsDrawn, contentHash, checkAll } from './surround/content.js';
import { RAIL, BOARDS, BOARD_LED, STEP, SCORE, SCORE_SLIDE, CARD_FORM, CARD_ROW, CARD_ROLL, NAP, METAL_HALL, SURFACE, SEATS, seatColor, SEAT_ASSETS, wallShare } from './surround/levels.js';
import { seatBackGeometry, seatPanGeometry, seatCushionGeometry, seatArmGeometry, seatBackUpholstered, seatCushionUpholstered, slotOpen, cushionRollTurn } from './surround/seat.js';

const _slotM = new THREE.Matrix3(), _slotV = new THREE.Vector3(), _viewport = new THREE.Vector4();

/**
 * A merged batch that also records, per vertex, the side of the hall it belongs to (the `roomSide` attribute of the cut)
 * and, in the emissive batch (`slot: true`), the `railSlot` attribute of the lit rail's opening: xyz = the vector from the
 * vertex to the opposite edge of the opening (across the profile, as long as the slot is wide), w = which edge the vertex
 * is on (0 | 1), or 2 on a bare opal face (the tool's mesh variant: the emission law alone), or 3 on an LED panel's face
 * (round A4: xy = the vertex's place on the face in LED cells, along the side and up: the display's pixel grid), or -1 on
 * everything else (the step lights, the tool variant's walls).
 */
class SideBatch extends Batch {
  constructor(name, ref, opts) { super(name, opts); this.ref = ref; this.side = []; this.slot = opts?.slot ? [] : null; }
  append(P, ...rest) {
    super.append(P, ...rest);
    const slot = Array.isArray(this.ref.slot) ? this.ref.slot : null, m = rest[3];
    if (this.slot && slot && m?.isMatrix4) _slotM.setFromMatrix4(m);
    for (let i = 0, n = P.length / 3; i < n; i++) {
      this.side.push(this.ref.now);
      if (!this.slot) continue;
      const q = slot?.[i];
      if (q && q[3] === 3) this.slot.push(q[0], q[1], q[2], 3);   // an LED face: cell coordinates and the cabinet coordinate, not a direction
      else if (q && m?.isMatrix4) { _slotV.set(q[0], q[1], q[2]).applyMatrix3(_slotM); this.slot.push(_slotV.x, _slotV.y, _slotV.z, q[3]); } else this.slot.push(0, 0, 0, -1);
    }
  }
  toMesh(material) {
    const mesh = super.toMesh(material);
    if (!mesh) return null;
    mesh.geometry.setAttribute('roomSide', new THREE.Float32BufferAttribute(this.side, 1));
    if (this.slot) mesh.geometry.setAttribute('railSlot', new THREE.Float32BufferAttribute(this.slot, 4));
    mesh.name = `arena.surround.${this.name}`;
    return mesh;
  }
}

/**
 * The tool switches of the surround, from the boot URL: `?clubsurround=key:value,...` (on / off pictures of the same tree; the
 * app never sets one). rail:0 = the rail's profile unlit (the extrusion alone); slot:0 = the profile's recess built as real
 * triangles (an opal face 2 mm down, two inner walls, hidden by the lips through the depth buffer) instead of the one
 * quad whose interior the material draws: the proof that the material's optics ARE that geometry; wash:0 = no board wash
 * (the other arm of the spill's pair); steps:0 = no step lights; shadow:0 = no shadow overlays; seats:0 = no seats (decks
 * only); real:0 = seat cards on the high tier too (the other arm of the real seats' pair); vary:0 = every real seat
 * alike; sheen:0 = the real seats' fabric without its sheen lobe; seats:petrol | seats:ochre | seats:graphite = the
 * fabric's colour (round A5, CONTRACT 17.3: levels.js SEATS; the default is the chosen one, the other two are the pair's
 * arms and are never baked: each carries a signature suffix); tilt:0 = upright seat cards; emitters:0 = nothing
 * registered with the room light; score:0 = the scoreboard dark; boards:print | boards:led = what the boards are (round
 * A4, CONTRACT 16.3: LED panels or a front-lit print; the default is levels.js BOARDS.default, the other is the pair's arm).
 * (Round A2's cutoff, core and streak switches are gone with what they switched: the glare cut-off, the dome's strip and the
 * capture boost. No switch of this list depends on the camera.)
 */
export function readLook(query) {
  // (round A6, `card`: the row cards shaded as the seat they stand for, levels.js CARD_FORM; `card:0` | `card:1` are the pair's two arms)
  const look = { rail: true, slot: true, wash: true, steps: true, shadow: true, seats: true, real: true, vary: true, sheen: true, tilt: true, emitters: true, score: true, card: CARD_FORM.on, boards: BOARDS.default, seatColor: SEATS.default };
  let text = '';
  try { text = String(query?.get?.('clubsurround') ?? ''); } catch { text = ''; }
  for (const part of text.split(',')) {
    const [k, v = ''] = part.trim().split(':');
    if (k === 'boards') { if (BOARDS.kinds.includes(v)) look.boards = v; }
    // (round A5: `seats:petrol|ochre|graphite` names the fabric's colour, levels.js SEATS; `seats:0` still takes the seats away)
    else if (k === 'seats' && SEATS.kinds.includes(v)) look.seatColor = v;
    else if (k !== 'seatColor' && k in look && (v === '0' || v === 'off')) look[k] = false;
    else if (k === 'card' && (v === '1' || v === 'on')) look.card = true;
    // (a tool's arm, tried in the app and NOT switched in: the bend with each tangent at its own length. Under the bake
    // at V10 it moved the four boxes by 0 to 3 and put glints of 190 on the pads' side flanks, where the real seat's
    // flank is a few pixels of foreshortened cloth: a flat sheet shows a bent flank at its full width)
    else if (k === 'card' && v === 'own') look.card = 'own';
  }
  return look;
}

/**
 * Round A7's steps as tool switches, from the same boot value (`?clubsurround=row:0,nap:0,hall:0,frames:black`): each
 * is one arm of a same-tree pair; the app never sets one. row = the row's light on a card without an emitter loop
 * (levels.js CARD_ROW); nap = the pile's lean, strokes and wear (levels.js NAP); hall = the aluminium as a metal that
 * mirrors the hall's baked cube (levels.js METAL_HALL); frames:alu | frames:black = the swatch of an LED board's
 * stiles and bottom member. `row:1`, `nap:1`, `hall:1` switch a step on before its level's `on` does. None reads a camera.
 * roll = the card's nose turning as the real cushion's roll does (levels.js CARD_ROLL; `roll:0` | `roll:1`).
 * rhythm = each card seat's tone, lean and wear from the plan's own seat (levels.js NAP.seats; `rhythm:0` | `rhythm:1`).
 */
export function readSteps(query) {
  const steps = { row: CARD_ROW.on, nap: NAP.on, hall: METAL_HALL.on, frames: METAL_HALL.frames, roll: CARD_ROLL.on, rhythm: NAP.seats };
  let text = '';
  try { text = String(query?.get?.('clubsurround') ?? ''); } catch { text = ''; }
  for (const part of text.split(',')) {
    const [k, v = ''] = part.trim().split(':');
    if (k === 'frames') { if (v === 'alu' || v === 'black') steps.frames = v; }
    else if (k === 'row' || k === 'nap' || k === 'hall' || k === 'roll' || k === 'rhythm') { if (v === '0' || v === 'off') steps[k] = false; else if (v === '1' || v === 'on') steps[k] = true; }
  }
  return steps;
}

/**
 * Tool numbers for the rail, from the boot URL: `?clubrail=level:4,power:0.5,wash:0.35,filterpx:1,led:1.1` (pictures that
 * bound a level; the app never sets one). `level`: the opal face's normal luminance; `power`: the exponent of its emission
 * law; `wash`: the board wash per metre (default: the board kind's, levels.js BOARDS); `filterpx`: the radius in pixels of
 * the raster's reconstruction filter on the slit (levels.js RAIL.filterPx); `led`: the LED panels' gain. Unknown keys and
 * values that are not numbers are ignored.
 */
export function readRail(query) {
  const rail = { level: RAIL.face.level, power: RAIL.face.power, wash: null, filterpx: RAIL.filterPx, led: BOARD_LED.gain, tool: false };
  let text = '';
  try { text = String(query?.get?.('clubrail') ?? ''); } catch { text = ''; }
  for (const part of text.split(',')) {
    const [k, v = ''] = part.trim().split(':'), n = Number(v);
    if (k !== 'tool' && k in rail && v !== '' && Number.isFinite(n)) { rail[k] = n; rail.tool = true; }
  }
  return rail;
}

/**
 * THE LIT RAIL'S OPTICS, as the four pieces of shader text the emissive material gains (the node arm reads them: no term
 * may read the camera's world position or height; the eye enters only as the surface's own view angle).
 *
 * The opening of the LED profile is ONE quad on the plane of the lips' tops. What lies in the opening is drawn from the
 * section of the profile (levels.js slotView, opalLaw; plan.js BOARD.profile), exactly as triangles would show it:
 *   - the view direction V, the face's normal N and the across direction T are taken in VIEW space (V = -mvPosition:
 *     the direction from the fragment to the eye; no uniform of the camera's place, no world height);
 *   - cos = dot(N, V) is the surface's view angle; dot(T, V) says on which side of the profile the eye stands; their
 *     ratio is the tangent of the eye's elevation in the plane of the section;
 *   - a ray entering the opening at `u` (from the near lip) reaches the opal, `recess` below, after crossing recess / tan
 *     of the slot: it lands on the opal while u <= 1 - (recess / slot) / tan, and on the far lip's inner wall beyond;
 *   - the opal emits level x cos ^ power (an opal sheet's law: a property of the surface); the wall shows the constant
 *     share of the level that the opal beside it leaves on black anodised aluminium (levels.js wallShare).
 * The raster (round A5: the slit through a reconstruction filter; levels.js RAIL has why): the vertex shader moves the
 * opening's two edges apart by uArenaRailPx.z pixels each (the filter's radius) and hands on the slit's TRUE width on
 * screen in pixels; the fragment knows from its place across the drawn quad how many pixels it lies from the slit's
 * middle line and takes the integral of the slit under a tent of that radius centred on itself (arenaTent: the tent's
 * running integral, a closed form): a pixel's value is exactly the share of the slit's light that a camera's pixel of
 * that footprint gathers, the sum over a column of pixels is the slit's energy wherever the line lies on the pixel
 * grid (rounds A3 and A4 point-sampled a quad of 1.5 pixels: the line beaded along its length), and what lies INSIDE
 * the slit is the section above under the SAME tent: the opal's part of the slit and the far wall's part are two
 * stretches of the line, each weighted by the tent's integral over it (arenaA, arenaM, arenaB: the tent's running
 * integral at the slit's two lips and at the line where the opal ends). The round's first text averaged the inside over
 * a one-pixel box clamped to the slit: every pixel farther than about 0.7 px from the line showed the wall alone, and
 * the slit lost four tenths of its light at a radius of 2 (app frames s7, s8; scratch tent2.mjs has the sums). It reads
 * the viewport's size in pixels (set per draw from the render target), nothing else.
 * The width is measured ACROSS THE LINE AS DRAWN: square to the screen direction of the rail's run (the run is
 * cross(normal, railSlot.xyz), projected), not as the screen length of the across vector: in a plane seen nearly edge-on
 * every vector of the plane lies along the line on screen, so the across vector may be three pixels long where the line
 * is a fifth of a pixel wide (the round's first two app frames, i1 and i3: white dashes one pixel high).
 * The opening's DEPTH is that of a point 80 mm nearer along the view axis: the widened line lies, on screen, over the
 * lips of its own profile (they are nearer than the opening by 15 to 45 mm) and has to win against them and against
 * nothing else (the first app frame of round A3 showed the line cut to dashes by its own near lip).
 * `railSlot.w` = 2 marks a bare opal face (the tool's mesh variant: the law alone); -1 everything else (untouched).
 * Round A4: the slot's plane is tilted (plan.js BOARD.profile.tilt). Nothing in this text changed for it: N, T and V are
 * the surface's own, so the elevation the two lines of the section work with is the eye's over the TILTED plane.
 *
 * `railSlot.w` = 3 marks an LED PANEL'S FACE (round A4, levels.js BOARD_LED): railSlot.xy is the fragment's place on the
 * face in LED cells. Each cell is lit over `fill` of its width and height (the rest is the black mask); the lit share of
 * a pixel's footprint is the box-filtered pulse train in each direction (the integral of the pulse over the footprint,
 * taken from the screen derivative of the cell coordinate), so the grid shows from close and merges into the cell's mean
 * with distance; a lit LED carries 1 / fill^2 of the mean, so the face's mean luminance is the same at every distance.
 * One box sample per pixel is not a band limit: with a cell between 1.3 and 3 pixels the first app frame (m1) showed
 * diagonal beats on the faces, so the lit share goes to the cell's mean as the footprint grows from 0.2 to 0.55 of a
 * cell (a cell of 5 pixels shows its grid, a cell under 2 pixels is its mean: what a camera's own low-pass does to a
 * panel at that distance). The face's level is its vertex colour x the atlas (what the display shows).
 * Round A5, what a real perimeter board has besides its pixels (levels.js BOARD_LED), all in the face's own terms:
 *   - CABINETS: railSlot.z is the fragment's place in cabinets (about half a metre wide; an integer at every joint, a
 *     different integer range on every module). Between two cabinets a hairline gap `uArenaLed.y` of a cabinet wide,
 *     dark, box-filtered over the pixel's footprint like the cells (a third of a pixel at V1: a faint line that fades
 *     with distance, never a stripe); each cabinet shows at its own level, `uArenaLed.z` either way (a wall's
 *     cabinets are never matched to the last step);
 *   - THE MASK'S POCKET, the display's emission law: each LED sits a little under the face of the black mask, so a
 *     grazing eye sees less of it: the share seen is 1 - pocket x tan(theta), theta from the face's normal
 *     (`uArenaLed.x` = the pocket's depth over the opening's width: the same two lines as the rail's lip). It reads
 *     the SURFACE'S OWN view angle (the cosine the rail's law reads) and nothing else of the eye: a law of the face.
 */
export const RAIL_GLSL = Object.freeze({
  vertexPars: `
attribute vec4 railSlot;
uniform vec3 uArenaRailPx;
varying vec3 vArenaRailV;
varying vec3 vArenaRailN;
varying vec3 vArenaRailT;
varying vec3 vArenaRailU;`,
  vertex: `
vArenaRailU = vec3( railSlot.w, 1.0, 0.0 );
vArenaRailV = vec3( 0.0, 0.0, 1.0 ); vArenaRailN = vec3( 0.0, 0.0, 1.0 ); vArenaRailT = vec3( 1.0, 0.0, 0.0 );
if ( railSlot.w > -0.5 ) {
  vArenaRailV = - mvPosition.xyz;
  vArenaRailN = normalize( normalMatrix * normal );
  if ( railSlot.w > 2.5 ) {
    vArenaRailT = railSlot.xyz;
  } else if ( railSlot.w < 1.5 ) {
    vArenaRailT = normalize( mat3( modelViewMatrix ) * railSlot.xyz ) * ( 1.0 - 2.0 * railSlot.w );
    vec4 arenaOther = projectionMatrix * modelViewMatrix * vec4( transformed + railSlot.xyz, 1.0 );
    vec4 arenaNext = projectionMatrix * modelViewMatrix * vec4( transformed + cross( normal, railSlot.xyz ), 1.0 );
    if ( gl_Position.w > 0.0 && arenaOther.w > 0.0 && arenaNext.w > 0.0 ) {
      vec2 arenaHere = gl_Position.xy / gl_Position.w;
      vec2 arenaRun = ( arenaNext.xy / arenaNext.w - arenaHere ) * 0.5 * uArenaRailPx.xy;
      float arenaRunLen = length( arenaRun );
      if ( arenaRunLen > 1e-5 ) {
        vec2 arenaSide = vec2( - arenaRun.y, arenaRun.x ) / arenaRunLen;
        float arenaSigned = dot( ( arenaHere - arenaOther.xy / arenaOther.w ) * 0.5 * uArenaRailPx.xy, arenaSide );
        float arenaLen = abs( arenaSigned );
        gl_Position.xy += arenaSide * ( arenaSigned < 0.0 ? -1.0 : 1.0 ) * 2.0 * uArenaRailPx.z / uArenaRailPx.xy * gl_Position.w;
        vArenaRailU.y = arenaLen;
        vArenaRailU.z = uArenaRailPx.z;
      }
    }
    vec4 arenaNear = projectionMatrix * ( mvPosition + vec4( 0.0, 0.0, 0.08, 0.0 ) );
    gl_Position.z = arenaNear.z * gl_Position.w / arenaNear.w;
  }
}`,
  fragmentPars: `
uniform vec4 uArenaRail;
uniform vec3 uArenaLed;
varying vec3 vArenaRailV;
varying vec3 vArenaRailN;
varying vec3 vArenaRailT;
varying vec3 vArenaRailU;
float arenaTent( float x ) { float t = clamp( x, -1.0, 1.0 ); return t < 0.0 ? 0.5 * ( t + 1.0 ) * ( t + 1.0 ) : 1.0 - 0.5 * ( 1.0 - t ) * ( 1.0 - t ); }`,
  fragment: `
if ( vArenaRailU.x > -0.5 ) {
  vec3 arenaV = normalize( vArenaRailV );
  float arenaCos = max( dot( normalize( vArenaRailN ), arenaV ), 0.0 );
  if ( vArenaRailU.x > 2.5 ) {
    vec2 arenaCell = vArenaRailT.xy;
    vec2 arenaFoot = max( fwidth( arenaCell ), vec2( 1e-4 ) );
    vec2 arenaLo = arenaCell - 0.5 * arenaFoot;
    vec2 arenaHi = arenaCell + 0.5 * arenaFoot;
    vec2 arenaLit = ( floor( arenaHi ) * uArenaRail.w + min( fract( arenaHi ), vec2( uArenaRail.w ) ) - floor( arenaLo ) * uArenaRail.w - min( fract( arenaLo ), vec2( uArenaRail.w ) ) ) / arenaFoot;
    arenaLit = mix( arenaLit, vec2( uArenaRail.w ), smoothstep( vec2( 0.2 ), vec2( 0.55 ), arenaFoot ) );
    float arenaCab = vArenaRailT.z;
    float arenaCabFoot = max( fwidth( arenaCab ), 1e-5 );
    float arenaGapLo = arenaCab - 0.5 * arenaCabFoot + 0.5 * uArenaLed.y;
    float arenaGapHi = arenaCab + 0.5 * arenaCabFoot + 0.5 * uArenaLed.y;
    float arenaGap = ( floor( arenaGapHi ) * uArenaLed.y + min( fract( arenaGapHi ), uArenaLed.y ) - floor( arenaGapLo ) * uArenaLed.y - min( fract( arenaGapLo ), uArenaLed.y ) ) / arenaCabFoot;
    float arenaOwn = 1.0 + uArenaLed.z * ( 2.0 * fract( sin( floor( arenaCab ) * 12.9898 + 4.1 ) * 43758.5453 ) - 1.0 );
    float arenaSeen = clamp( 1.0 - uArenaLed.x * sqrt( max( 1.0 - arenaCos * arenaCos, 0.0 ) ) / max( arenaCos, 1e-3 ), 0.0, 1.0 );
    diffuseColor.rgb *= arenaLit.x * arenaLit.y / ( uArenaRail.w * uArenaRail.w ) * ( 1.0 - clamp( arenaGap, 0.0, 1.0 ) ) * arenaOwn * arenaSeen;
  } else if ( vArenaRailU.x > 1.5 ) {
    diffuseColor.rgb *= pow( arenaCos, uArenaRail.y );
  } else {
    float arenaLaw = pow( arenaCos, uArenaRail.y );
    float arenaAcross = dot( normalize( vArenaRailT ), arenaV );
    float arenaTan = arenaCos / max( abs( arenaAcross ), 1e-5 );
    float arenaEdge = clamp( 1.0 - uArenaRail.x / max( arenaTan, 1e-5 ), 0.0, 1.0 );
    float arenaU = arenaAcross > 0.0 ? 1.0 - vArenaRailU.x : vArenaRailU.x;
    float arenaHalf = 0.5 * max( fwidth( arenaU ), 1e-4 );
    float arenaLo = clamp( arenaU - arenaHalf, 0.0, 1.0 );
    float arenaHi = clamp( arenaU + arenaHalf, 0.0, 1.0 );
    float arenaOpal = clamp( ( min( arenaEdge, arenaHi ) - arenaLo ) / max( arenaHi - arenaLo, 1e-4 ), 0.0, 1.0 );
    float arenaCover = 1.0;
    if ( vArenaRailU.z > 0.0 ) {
      float arenaPx = max( vArenaRailU.y, 1e-3 );
      float arenaD = ( vArenaRailU.x - 0.5 ) * ( arenaPx + 2.0 * vArenaRailU.z );
      float arenaA = arenaTent( ( arenaD + 0.5 * arenaPx ) / vArenaRailU.z );
      float arenaB = arenaTent( ( arenaD - 0.5 * arenaPx ) / vArenaRailU.z );
      arenaCover = arenaA - arenaB;
      if ( arenaCover < 0.002 ) discard;
      float arenaM = arenaTent( ( arenaD - ( arenaAcross > 0.0 ? 0.5 - arenaEdge : arenaEdge - 0.5 ) * arenaPx ) / vArenaRailU.z );
      arenaOpal = ( arenaAcross > 0.0 ? arenaM - arenaB : arenaA - arenaM ) / arenaCover;
    }
    diffuseColor.rgb *= ( arenaOpal * arenaLaw + ( 1.0 - arenaOpal ) * uArenaRail.z ) * arenaCover;
  }
}`,
});

/** The lit rail in the emissive material's program: RAIL_GLSL added on top of whatever the room light's emissive material
 * already compiles (the cut). Uniforms: uArenaRail (recess / slot, the law's exponent, the wall's share, the LED cells'
 * lit share), uArenaRailPx (the viewport in pixels, the raster filter's radius in pixels). */
function patchRail(material, uniforms) {
  const before = material.onBeforeCompile, keyBefore = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof before === 'function') before.call(material, shader, renderer);
    shader.uniforms.uArenaRail = uniforms.rail;
    shader.uniforms.uArenaRailPx = uniforms.px;
    shader.uniforms.uArenaLed = uniforms.led;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${RAIL_GLSL.vertexPars}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${RAIL_GLSL.vertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${RAIL_GLSL.fragmentPars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${RAIL_GLSL.fragment}`);
  };
  material.customProgramCacheKey = () => `${typeof keyBefore === 'function' ? keyBefore.call(material) : ''}|arena-rail-v7`;
  material.userData.arenaRail = true;
  return material;
}

/**
 * THE PILE (round A7; levels.js NAP has why), as shader text for the real seats' fabric and, in part, for the row cards
 * (the node arm reads it: no camera place, no world position, no screen place).
 *   field       arenaNapField( p, seed ): the strokes inside a pad as a pair in -1..1 (along the lean, across it): two
 *               octaves of value noise over the pad's own coordinates in metres, each multiplied by its share of the
 *               lean and faded out as its cell falls under about two pixels (the screen derivative of the noise
 *               coordinate: 0.3 cells a pixel keeps it, 0.6 has lost it): a band limit, so nothing aliases;
 *   vertex      per seat (two instanced attributes: `arenaNap` xyz = the pile's lean in the seat part's own frame, a
 *               vector of the pad's plane as long as the lean's tangent, w = the seat's seed; `arenaWear` = how worn
 *               the cushion's front roll is): the lean as a direction in view space, the fragment's place on the pad
 *               (the back's x and y, the cushion's x and z: each part's flat axes), the wear on the cushion's front
 *               roll (the roll is the only cloth beyond `roll0` along a part's z: the back's cloth stays under 0.05);
 *   lean        the shading normal leans by the pile's lean, projected on the surface, with the strokes;
 *   tone, lobe  the roll's wear: its albedo up, its pile lobe down.
 */
export function napGlsl(N = NAP) {
  const f = (v) => Number(v).toFixed(5), Q = SEAT.pan, roll1 = Q.depth - Q.rear, roll0 = roll1 - 0.06;
  const field = `
float arenaNapHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float arenaNapNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 w = fract( p );
  w = w * w * ( 3.0 - 2.0 * w );
  return mix( mix( arenaNapHash( i ), arenaNapHash( i + vec2( 1.0, 0.0 ) ), w.x ), mix( arenaNapHash( i + vec2( 0.0, 1.0 ) ), arenaNapHash( i + vec2( 1.0, 1.0 ) ), w.x ), w.y );
}
vec2 arenaNapField( vec2 p, float seed ) {
  vec2 q = p + seed * vec2( 37.0, 91.0 );
  vec2 a = q * ${f(1 / N.cells[0])};
  vec2 b = q * ${f(1 / N.cells[1])};
  float ka = ${f(N.gain[0])} * ( 1.0 - smoothstep( 0.3, 0.6, max( fwidth( a.x ), fwidth( a.y ) ) ) );
  float kb = ${f(N.gain[1])} * ( 1.0 - smoothstep( 0.3, 0.6, max( fwidth( b.x ), fwidth( b.y ) ) ) );
  return ka * ( 2.0 * vec2( arenaNapNoise( a ), arenaNapNoise( a + 17.3 ) ) - 1.0 ) + kb * ( 2.0 * vec2( arenaNapNoise( b + 5.1 ), arenaNapNoise( b + 29.7 ) ) - 1.0 );
}`;
  return Object.freeze({
    field,
    vertexPars: `
attribute vec4 arenaNap;
attribute float arenaWear;
varying vec3 vArenaNap;
varying vec4 vArenaPad;`,
    vertex: `
vArenaPad = vec4( position.x, position.y + position.z, arenaWear * smoothstep( ${f(roll0)}, ${f(roll1)}, position.z ), arenaNap.w );
#ifdef USE_INSTANCING
  vArenaNap = normalMatrix * ( mat3( instanceMatrix ) * arenaNap.xyz );
#else
  vArenaNap = normalMatrix * arenaNap.xyz;
#endif`,
    fragmentPars: `
varying vec3 vArenaNap;
varying vec4 vArenaPad;${field}`,
    lean: `
{
  vec3 arenaLean = vArenaNap - normal * dot( normal, vArenaNap );
  if ( dot( arenaLean, arenaLean ) > 1e-10 ) {
    vec2 arenaStroke = arenaNapField( vArenaPad.xy, vArenaPad.w );
    normal = normalize( normal + arenaLean * ( 1.0 + arenaStroke.x ) + cross( normal, arenaLean ) * arenaStroke.y );
  }
}`,
    tone: `
diffuseColor.rgb *= 1.0 + ${f(N.wear)} * vArenaPad.z;`,
    lobe: `
#ifdef USE_SHEEN
  material.sheenColor *= 1.0 - ${f(N.wearSheen)} * vArenaPad.z;
#endif`,
  });
}

/** The pile in the real seats' fabric program (napGlsl), on top of whatever the room light's material compiles. */
function patchFabric(material, glsl = napGlsl()) {
  const before = material.onBeforeCompile, keyBefore = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof before === 'function') before.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${glsl.vertexPars}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${glsl.vertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${glsl.fragmentPars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${glsl.tone}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${glsl.lean}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${glsl.lobe}`);
  };
  material.customProgramCacheKey = () => `${typeof keyBefore === 'function' ? keyBefore.call(material) : ''}|arena-nap-v1`;
  material.userData.arenaNap = true;
  return material;
}

/**
 * THE ROW'S LIGHT (round A7; levels.js CARD_ROW has why): the light vector of the room light's bake at a world point,
 * from the six axis irradiances of `irradianceAt` (the baked volume while there is one): `L` = its direction (unit;
 * by luminance), `E` = its irradiance on a surface that faces it (rgb). Null where the field has no direction.
 */
export function rowLightAt(irradianceAt, p) {
  const D = [];
  for (let k = 0; k < 3; k++) {
    const n = [0, 0, 0]; n[k] = 1; const a = irradianceAt(p, n); n[k] = -1; const b = irradianceAt(p, n);
    if (!Array.isArray(a) || !Array.isArray(b)) return null;
    D.push([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
  }
  const y = D.map((c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]), len = Math.hypot(y[0], y[1], y[2]);
  if (!(len > 1e-6) || !Number.isFinite(len)) return null;
  const L = y.map((v) => v / len);
  return { L, E: [0, 1, 2].map((c) => Math.max(0, D[0][c] * L[0] + D[1][c] * L[1] + D[2][c] * L[2])) };
}

/**
 * The row table of the cards (levels.js CARD_ROW): a half-float texture `samples` wide, two lines per card (line 2c:
 * the light vector's direction at `samples` places along card c, line 2c + 1: its irradiance, rgb). `cards`: per card
 * its four corners in the room (`bl`, `br`, `tl`, `tr`: [x, y, z]); a sample lies on the card at CARD_ROW.at of its
 * height (the pad's middle). `sync()` fills the table again when the room light's `serial` has moved (the bake came,
 * went or changed) and does nothing otherwise. No camera, no frame state: the table is a function of the bake alone.
 */
export function makeRowTable(samples, cards, irradianceAt, serialOf, at = CARD_ROW.at) {
  const n = Math.max(2, samples | 0), rows = 2 * cards.length, data = new Uint16Array(n * rows * 4);
  const texture = new THREE.DataTexture(data, n, rows, THREE.RGBAFormat, THREE.HalfFloatType);
  texture.name = 'arena.surround.rowlight';
  texture.magFilter = THREE.LinearFilter; texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  const half = (v) => THREE.DataUtils.toHalfFloat(Math.max(-60000, Math.min(60000, Number.isFinite(v) ? v : 0)));
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  let seen = null, filled = 0, lit = 0;
  const sync = () => {
    let now = 0;
    try { now = serialOf(); } catch { now = 0; }
    if (now === seen && filled > 0) return false;
    seen = now; filled += 1; lit = 0;
    cards.forEach((c, k) => {
      for (let j = 0; j < n; j++) {
        const t = j / (n - 1);
        let r = null;
        try { r = rowLightAt(irradianceAt, mix(mix(c.bl, c.br, t), mix(c.tl, c.tr, t), at)); } catch { r = null; }
        const o = 4 * (2 * k * n + j), e = o + 4 * n;
        const L = r?.L ?? [0, 1, 0], E = r?.E ?? [0, 0, 0];
        if (r) lit += 1;
        data[o] = half(L[0]); data[o + 1] = half(L[1]); data[o + 2] = half(L[2]); data[o + 3] = half(1);
        data[e] = half(E[0]); data[e + 1] = half(E[1]); data[e + 2] = half(E[2]); data[e + 3] = half(1);
      }
    });
    texture.needsUpdate = true;
    return true;
  };
  sync();
  return { uniform: { value: texture }, texture, sync, data, samples: n, bytes: data.byteLength, state: () => ({ samples: n, cards: cards.length, serial: seen, filled, lit }) };
}

/**
 * THE SEATS' OWN RHYTHM ON THE CARDS (levels.js NAP.seats): an 8-bit texture SEAT_TABLE.w wide, one line per card. The
 * texel at a seat's tile counter along the card's map (floor of the map's u times the tile's seats: the card's first
 * seat stands at the counter its map begins with) holds that seat's record: r = its tone (tone[0] + tone[1] x r),
 * g, b = its pile's lean along and up the card ((g - 0.5) x lean), a = the wear of its cushion's front roll. Nearest
 * filter: a seat's record ends at the seat's edge. `fill(recAt)`: recAt(card, texel) -> [tone, leanX, leanY, wear] |
 * null (null: a plain seat: tone 1, no lean, no wear). It starts plain.
 */
export const SEAT_TABLE = Object.freeze({ w: 16, tone: Object.freeze([0.85, 0.3]), lean: 0.5 });
export function makeSeatTable(cards) {
  const n = SEAT_TABLE.w, rows = Math.max(1, cards | 0), data = new Uint8Array(n * rows * 4);
  const texture = new THREE.DataTexture(data, n, rows, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = 'arena.surround.seatrhythm';
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  const byte = (v) => Math.max(0, Math.min(255, Math.round(255 * v)));
  const fill = (recAt) => {
    for (let c = 0; c < rows; c++) for (let j = 0; j < n; j++) {
      let r = null;
      try { r = recAt ? recAt(c, j) : null; } catch { r = null; }
      const ok = Array.isArray(r) && r.length >= 4 && r.every((v) => Number.isFinite(v)), o = 4 * (c * n + j);
      data[o] = byte(((ok ? r[0] : 1) - SEAT_TABLE.tone[0]) / SEAT_TABLE.tone[1]);
      data[o + 1] = byte((ok ? r[1] : 0) / SEAT_TABLE.lean + 0.5); data[o + 2] = byte((ok ? r[2] : 0) / SEAT_TABLE.lean + 0.5);
      data[o + 3] = byte(ok ? r[3] : 0);
    }
    texture.needsUpdate = true;
  };
  // (what a texel says, as the shader reads it)
  const read = (c, j) => { const o = 4 * (c * n + j); return [SEAT_TABLE.tone[0] + (SEAT_TABLE.tone[1] * data[o]) / 255, (data[o + 1] / 255 - 0.5) * SEAT_TABLE.lean, (data[o + 2] / 255 - 0.5) * SEAT_TABLE.lean, data[o + 3] / 255]; };
  fill(null);
  return { uniform: { value: texture }, texture, fill, read, data, bytes: data.byteLength };
}

/**
 * THE SEAT'S FORM ON A ROW'S CARD (round A6; levels.js CARD_FORM has why), as numbers of the card's own coordinates
 * (metres: across a seat's tile from its middle, up the card from the deck), all from plan.js SEAT and UPHOLSTERY: the
 * pad's half width inside its welt, the seam and the pad's top, the two bolsters' runs and the depths of the seam's
 * valley on either side, the stitch's width, the cushion's nose and where its hem meets the tray, the pan's half width.
 */
export function cardForm() {
  const B = SEAT.back, Q = SEAT.pan, U = UPHOLSTERY, s = Math.sin(SEAT.fold), inset = B.rim + B.piping;
  return {
    seats: SEAT_CARD.seats, pitch: SEAT_CARD.pitch, h: SEAT_CARD.h, hw: B.w / 2 - inset,
    ys: B.y + B.seam, yt: B.y + B.h - inset, ru: (B.h - inset - B.seam) / 2, rm: U.main.roll,
    tu: U.upper.thick, tm: U.main.thick, du: U.upper.thick - U.seamUp, dm: U.main.thick - U.seamUp, stitch: U.stitch,
    // round A8: how far the seam's MIDDLE is sewn over the gutter; its two ends lie on the gutter (seat.js seatBackUpholstered)
    su: U.seamUp,
    yn: Q.pivotY + (Q.depth - Q.rear + U.cushion.roll) * s, yh: Q.pivotY + (Q.depth - Q.rear - U.cushion.hem - 0.013) * s, pw: Q.w / 2,
    // the welt's gutter round each bolster (seat.js: what the bolster's outer loop carries, gone by its first ring)
    go: slotOpen(0.002 + B.pipingH - B.gutter, B.piping), ring: U.rings[0],
    // round A7, the cushion's nose as the real roll turns (seat.js cushionRollTurn: the mesh's own normals at the nose,
    // the chin and the hem, and the underside's below the hem): metres down the card from the nose's top to the chin
    // and to the hem, and the surface's angle above the horizontal at the four, in the folded pose (the fold tips the
    // pan's underside up by its excess over a right angle); held under atan 4, the slope's own limit
    nose: (() => {
      const turn = cushionRollTurn(U), up = SEAT.fold - Math.PI / 2;
      return { t: [turn[1].t * s, turn[2].t * s], a: turn.map((x) => Math.min(Math.atan(4), x.angle + up)) };
    })(),
  };
}

/**
 * The card's shader text (the node arm reads it: no camera place, no world position; the eye enters as the surface's
 * own view angle, in the sheen term, as in any BRDF). Three pieces on top of the room light's lit program:
 *   form    from the fragment's place on the card (the map's own coordinates) the SLOPE of the real seat's surface
 *           there (a bolster's parabola from a sewn edge to a crown, plan.js UPHOLSTERY: twice its rise over its
 *           run at the edge, falling evenly to nothing at the crown), the
 *           occlusion of the seam's groove in closed form (the form factor seat.js gives the real seat's vertices),
 *           and whether the place is cloth;
 *   bend    the shading normal leans by that slope in the card's own tangent frame (the frame three builds for a
 *           tangent-space normal map, from the derivatives of the position and of the map's coordinates): the room
 *           light then reads its baked volume for the normal the real seat has at that place;
 *   sheen   the pile on cloth: the baked irradiance x the fabric's sheen colour x the fit of a sheen lobe's
 *           directional albedo (the same fit three's physical material uses under an environment), by the cosine of
 *           the surface's view angle; and, where the uniform's fourth component is 1 (no emitter loop: lite), the
 *           cloth's rough specular lobe the same way (three's own fit of a dielectric's directional albedo);
 *   lobes   where the card's material is the fabric's own (levels.js CARD_FORM.lobes): its lobes masked to the cloth.
 */
export function cardGlsl(F = cardForm(), roughness = CARD_FORM.sheenRoughness, ownFrame = CARD_FORM.ownFrame === true, { row = false, nap = false, cards = 48, roll = false, seats = false } = {}) {
  const f = (v) => Number(v).toFixed(5);
  // Round A7, more pieces, each compiled only where its step is on (the default text is round A6's, to the letter):
  //   row    (levels.js CARD_ROW) the row's light from the bake, read from the table `uArenaRow` (line 2c: the light
  //          vector's direction at `samples` places along card c, line 2c + 1: its irradiance; `arenaRowUV` is the
  //          fragment's place in the table) and handed to three's own direct-light law for the cloth's specular and
  //          pile; the direction is turned into view space (a direction: no camera place is read);
  //   nap    (levels.js NAP) the pile's rhythm on a card: each seat of the card leans its own way and has its own
  //          tone and wear (a hash of the seat's index on its card), with the strokes of napGlsl's field.
  //   roll   (levels.js CARD_ROLL) the nose's turn from the real cushion's own normals (cardForm().nose) in place of
  //          round A6's ramp.
  const step = row || nap, napText = nap ? napGlsl().field : '';
  // (round A8: the pile's lean is a tilt of the whole pad, not a flank of the form. The bend below divides both
  // tangents by the longer one, and a tile's map spans `seats` x `pitch` metres along the row against `h` up the
  // card: a slope along the row arrives at h / (seats x pitch) = 0.40 of its size. Card / real over the seats of a
  // row followed the pile's lean along the row for it (correlation -0.91; scratch/surround/CARD-CAUSE-A8.md). So the
  // lean along the row is handed over times the inverse; the form's own side flanks stay as round A6 set them.)
  const leanAlong = f(ownFrame ? 1 : (F.seats * F.pitch) / F.h);
  // (round A8, in `form` below: the seam's valley deepens evenly from its middle to its two ends, `arenaSeam`, as the
  // mesh's does. Round A6's text held the middle's depth across the pad; under the bake the two front boxes read 0.6
  // and 0.7 over for it and the two top boxes 0.7 and 1.7 under: one-job arms a8cf, CARD-CAUSE-A8.md.)
  // (first app frame of the row's light, a7l1: with the row's ONE light alone a top roll came up (86 where the real
  // one reads 91) and the pad's face went DOWN (27-31, round A6's lite card 33-37, the real pad 36-46): the face looks
  // at the hall, and what lights its lobes is not the net flux from above but the rest of the field. So the baked
  // light is split: the row's light takes its directional part, and the rest (the baked irradiance less the row
  // light's own share at this normal) keeps round A6's two terms, the lobes as their directional albedo.)
  const rowText = !row ? '' : `
#if defined( RE_Direct ) && defined( RE_IndirectDiffuse )
{
  vec3 arenaRowE = texture2D( uArenaRow, vec2( vArenaRowUV.x, vArenaRowUV.y + ${f(1 / (2 * cards))} ) ).rgb;
  vec3 arenaRowL = transformDirection( texture2D( uArenaRow, vArenaRowUV ).xyz, viewMatrix );
  vec3 arenaRest = max( irradiance - arenaRowE * saturate( dot( normal, arenaRowL ) ), vec3( 0.0 ) );
  reflectedLight.indirectDiffuse += arenaRest * uArenaCard.rgb * ( arenaCardCloth * arenaCardSheen( saturate( dot( normal, geometryViewDir ) ) ) );
  vec2 arenaRestFab = DFGApprox( normal, geometryViewDir, ${f(SURFACE.fabric.roughness)} );
  reflectedLight.indirectDiffuse += arenaRest * ( uArenaCard.a * arenaCardCloth * RECIPROCAL_PI * ( 0.04 * arenaRestFab.x + arenaRestFab.y ) );
  if ( arenaCardCloth > 0.0 && dot( arenaRowE, vec3( 1.0 ) ) > 0.0 ) {
    IncidentLight arenaRowLight;
    arenaRowLight.visible = true;
    arenaRowLight.color = arenaRowE;
    arenaRowLight.direction = arenaRowL;
    ReflectedLight arenaRowRL = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
    RE_Direct( arenaRowLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, arenaRowRL );
    reflectedLight.directSpecular += arenaRowRL.directSpecular;
  }
}
#endif`;
  // (levels.js NAP.seats: the seat's own record from the seats' table; the paint's own per-tile wear is taken out)
  const napForm = !nap ? '' : seats ? `
{
  float arenaTile = floor( vMapUv.x * ${f(F.seats)} );
  vec4 arenaRec = texture2D( uArenaSeatR, vec2( ( arenaTile + 0.5 ) / ${f(SEAT_TABLE.w)}, vArenaRowUV.y + ${f(1 / (4 * cards))} ) );
  float arenaSeed = fract( sin( ( arenaTile + 61.0 * floor( vArenaRowUV.y * ${f(cards)} ) ) * 37.719 + 1.7 ) * 43758.5453 );
  vec2 arenaLean = ( arenaRec.gb - 0.5 ) * ${f(SEAT_TABLE.lean)};
  vec2 arenaStroke = arenaNapField( arenaCardAt, arenaSeed );
  arenaCardSlope += arenaCardCloth * vec2( ${leanAlong}, 1.0 ) * ( arenaLean * ( 1.0 + arenaStroke.x ) + vec2( - arenaLean.y, arenaLean.x ) * arenaStroke.y );
  float arenaNose = arenaCardAt.y > ${f(F.yh)} && arenaCardAt.y <= ${f(F.yn)} && abs( arenaCardAt.x ) < ${f(F.pw)} ? 1.0 : 0.0;
  float arenaPaint = mod( arenaTile, ${f(CARD_TILE_WEAR.length)} );
  arenaPaint = arenaPaint < 0.5 ? ${f(CARD_TILE_WEAR[0])} : ( arenaPaint < 1.5 ? ${f(CARD_TILE_WEAR[1])} : ( arenaPaint < 2.5 ? ${f(CARD_TILE_WEAR[2])} : ${f(CARD_TILE_WEAR[3])} ) );
  diffuseColor.rgb *= mix( 1.0, ( ${f(SEAT_TABLE.tone[0])} + ${f(SEAT_TABLE.tone[1])} * arenaRec.r ) * ( 1.0 + ${f(NAP.wear)} * arenaNose * arenaRec.a ) / arenaPaint, arenaCardCloth );
}` : `
{
  float arenaSeat = floor( vMapUv.x * ${f(F.seats)} ) + 61.0 * floor( vArenaRowUV.y * ${f(cards)} );
  vec3 arenaSeed = fract( sin( arenaSeat * vec3( 12.9898, 78.233, 37.719 ) + 1.7 ) * 43758.5453 );
  float arenaAng = 6.2831853 * arenaSeed.x;
  vec2 arenaLean = ${f(NAP.lean)} * ( 1.0 + ${f(NAP.spread)} * ( 2.0 * arenaSeed.y - 1.0 ) ) * vec2( cos( arenaAng ), sin( arenaAng ) );
  vec2 arenaStroke = arenaNapField( arenaCardAt, arenaSeed.z );
  arenaCardSlope += arenaCardCloth * vec2( ${leanAlong}, 1.0 ) * ( arenaLean * ( 1.0 + arenaStroke.x ) + vec2( - arenaLean.y, arenaLean.x ) * arenaStroke.y );
  float arenaNose = arenaCardAt.y > ${f(F.yh)} && arenaCardAt.y <= ${f(F.yn)} && abs( arenaCardAt.x ) < ${f(F.pw)} ? 1.0 : 0.0;
  diffuseColor.rgb *= 1.0 + arenaCardCloth * ( ${f(seatColor().vary)} * ( 2.0 * arenaSeed.z - 1.0 ) + ${f(NAP.wear)} * arenaNose * ( 0.3 + 0.7 * fract( arenaSeed.x * 7.13 + arenaSeed.y ) ) );
}`;
  const r2 = roughness * roughness, a = roughness < 0.25 ? -339.2 * r2 + 161.4 * roughness - 25.9 : -8.48 * r2 + 14.3 * roughness - 9.95;
  const b = roughness < 0.25 ? 44.0 * r2 - 23.7 * roughness + 3.26 : 1.97 * r2 - 3.27 * roughness + 0.72, c = roughness < 0.25 ? 0 : 0.1 * (roughness - 0.25);
  return Object.freeze({
    fragmentPars: `
uniform vec4 uArenaCard;
float arenaCardFall( float u ) { return 1.0 - clamp( u, 0.0, 1.0 ); }
float arenaCardGroove( float d, float deep, float run ) {
  float k = arenaCardFall( d / run );
  float left = deep * k * k;
  return 1.0 - left / length( vec2( left, ${f(F.stitch)} + 2.0 * d ) );
}
float arenaCardSheen( float nv ) { return min( 1.0, exp( ${f(a)} * nv + ${f(b)} ) + ${f(c)} ) * RECIPROCAL_PI; }${step ? '\nvarying vec2 vArenaRowUV;' : ''}${row ? '\nuniform sampler2D uArenaRow;' : ''}${nap && seats ? '\nuniform sampler2D uArenaSeatR;' : ''}${napText}`,
    // (round A7: the fragment's place in the row table and the card's index, handed on from the vertices; only with a step on)
    vertexPars: step ? `
attribute vec2 arenaRowUV;
varying vec2 vArenaRowUV;` : '',
    vertex: step ? `
vArenaRowUV = arenaRowUV;` : '',
    row: rowText,
    form: `
vec2 arenaCardAt = vec2( ( fract( vMapUv.x * ${f(F.seats)} ) - 0.5 ) * ${f(F.pitch)}, vMapUv.y * ${f(F.h)} );
vec2 arenaCardSlope = vec2( 0.0 );
float arenaCardCloth = 0.0;
float arenaCardOpen = 1.0;
{
  float arenaAx = abs( arenaCardAt.x );
  float arenaSgn = arenaCardAt.x < 0.0 ? -1.0 : 1.0;
  float arenaY = arenaCardAt.y;
  float arenaSeam = ${f(F.su)} * clamp( arenaAx / ${f(F.hw)}, 0.0, 1.0 );
  if ( arenaY > ${f(F.ys)} && arenaAx < ${f(F.hw)} ) {
    arenaCardCloth = 1.0;
    if ( arenaY < ${f(F.yt)} ) {
      float arenaUp = ${f(F.yt)} - arenaY;
      float arenaDown = arenaY - ${f(F.ys)};
      arenaCardSlope.y = arenaUp < arenaDown ? min( 1.0, ${f((2 * F.tu) / F.ru)} * arenaCardFall( arenaUp / ${f(F.ru)} ) ) : - ${f(2 / F.ru)} * ( ${f(F.du)} + arenaSeam ) * arenaCardFall( arenaDown / ${f(F.ru)} );
      arenaCardSlope.x = arenaSgn * min( 1.0, ${f((2 * F.tu) / F.ru)} * arenaCardFall( ( ${f(F.hw)} - arenaAx ) / ${f(F.ru)} ) );
      arenaCardOpen = arenaCardGroove( arenaDown, ${f(F.du)} + arenaSeam, ${f(F.ru)} );
      arenaCardOpen *= mix( ${f(F.go)}, 1.0, clamp( min( arenaUp / ${f(F.ring * F.ru)}, ( ${f(F.hw)} - arenaAx ) / ${f(F.ring * F.hw)} ), 0.0, 1.0 ) );
    } else arenaCardSlope.y = 0.14;
  } else if ( arenaY > ${f(F.yn)} && arenaAx < ${f(F.hw)} ) {
    arenaCardCloth = 1.0;
    arenaCardSlope.y = ${f(2 / F.rm)} * ( ${f(F.dm)} + arenaSeam ) * arenaCardFall( ( ${f(F.ys)} - arenaY ) / ${f(F.rm)} );
    arenaCardSlope.x = arenaSgn * ${f((2 * F.tm) / F.rm)} * arenaCardFall( ( ${f(F.hw)} - arenaAx ) / ${f(F.rm)} );
    arenaCardOpen = arenaCardGroove( ${f(F.ys)} - arenaY, ${f(F.dm)} + arenaSeam, ${f(F.rm)} );
    arenaCardOpen *= mix( ${f(F.go)}, 1.0, clamp( ( ${f(F.hw)} - arenaAx ) / ${f(F.ring * F.hw)}, 0.0, 1.0 ) );
  } else if ( arenaY > ${f(F.yh)} && arenaAx < ${f(F.pw)} ) {
    arenaCardCloth = 1.0;
${roll ? `    float arenaDrop = ${f(F.yn)} - arenaY;
    arenaCardSlope.y = tan( arenaDrop < ${f(F.nose.t[0])} ? mix( ${f(F.nose.a[0])}, ${f(F.nose.a[1])}, arenaDrop / ${f(F.nose.t[0])} ) : ( arenaDrop < ${f(F.nose.t[1])} ? mix( ${f(F.nose.a[1])}, ${f(F.nose.a[2])}, ( arenaDrop - ${f(F.nose.t[0])} ) / ${f(F.nose.t[1] - F.nose.t[0])} ) : ${f(F.nose.a[3])} ) );` : `    arenaCardSlope.y = mix( 2.5, -0.4, smoothstep( 0.0, 0.7, ( ${f(F.yn)} - arenaY ) / ${f(F.yn - F.yh)} ) );`}
    arenaCardSlope.x = arenaSgn * 2.0 * arenaCardFall( ( ${f(F.pw)} - arenaAx ) / 0.03 );
  }
  arenaCardSlope = clamp( arenaCardSlope, vec2( -4.0 ), vec2( 4.0 ) );
  arenaCardCloth *= smoothstep( 0.06, 0.12, dot( diffuseColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) ) );
}
diffuseColor.rgb *= arenaCardOpen;${napForm}`,
    bend: `
{
  vec3 arenaQ0 = dFdx( - vViewPosition );
  vec3 arenaQ1 = dFdy( - vViewPosition );
  vec2 arenaS0 = dFdx( vMapUv );
  vec2 arenaS1 = dFdy( vMapUv );
  vec3 arenaQ1p = cross( arenaQ1, normal );
  vec3 arenaQ0p = cross( normal, arenaQ0 );
  vec3 arenaT = arenaQ1p * arenaS0.x + arenaQ0p * arenaS1.x;
  vec3 arenaB = arenaQ1p * arenaS0.y + arenaQ0p * arenaS1.y;
${ownFrame ? `  // (each tangent at its own length: a slope is a rise over a run along ITS axis; one seat is 0.5 m of the card's
  // 2 m along the row and all of its height, so one shared scale bent the side flanks 2.2 times too little)
  float arenaLt = dot( arenaT, arenaT );
  float arenaLb = dot( arenaB, arenaB );
  if ( arenaLt > 0.0 && arenaLb > 0.0 ) normal = normalize( normal + arenaT * ( arenaCardSlope.x * inversesqrt( arenaLt ) ) + arenaB * ( arenaCardSlope.y * inversesqrt( arenaLb ) ) );` : `  float arenaDet = max( dot( arenaT, arenaT ), dot( arenaB, arenaB ) );
  if ( arenaDet > 0.0 ) normal = normalize( normal + ( arenaT * arenaCardSlope.x + arenaB * arenaCardSlope.y ) * inversesqrt( arenaDet ) );`}
}`,
    sheen: row ? '' : `
#if defined( RE_IndirectDiffuse )
  reflectedLight.indirectDiffuse += irradiance * uArenaCard.rgb * ( arenaCardCloth * arenaCardSheen( saturate( dot( normal, geometryViewDir ) ) ) );
  vec2 arenaCardFab = DFGApprox( normal, geometryViewDir, ${f(SURFACE.fabric.roughness)} );
  reflectedLight.indirectDiffuse += irradiance * ( uArenaCard.a * arenaCardCloth * RECIPROCAL_PI * ( 0.04 * arenaCardFab.x + arenaCardFab.y ) );
#endif`,
    // (levels.js CARD_FORM.lobes: the card's material is the fabric's own; its lobes belong to the cloth of the card
    // only: the moulded parts stay matt and carry no pile)
    lobes: `
material.roughness = mix( 0.9, material.roughness, arenaCardCloth );
#ifdef USE_SHEEN
  material.sheenColor *= arenaCardCloth;
#endif`,
  });
}

/** The seat's form in the card's lit program (cardGlsl), on top of whatever the room light's material compiles. */
function patchCard(material, uniform, glsl = cardGlsl(), variant = '', table = null, seatTable = null) {
  const before = material.onBeforeCompile, keyBefore = material.customProgramCacheKey;
  material.onBeforeCompile = (shader, renderer) => {
    if (typeof before === 'function') before.call(material, shader, renderer);
    shader.uniforms.uArenaCard = uniform;
    // (round A7: the row table; a program is compiled anew when the room's bake comes or goes: the table follows it)
    if (table) { shader.uniforms.uArenaRow = table.uniform; table.sync(); }
    if (seatTable) shader.uniforms.uArenaSeatR = seatTable.uniform;
    if (glsl.vertexPars) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${glsl.vertexPars}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${glsl.vertex}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${glsl.fragmentPars}`)
      .replace('#include <color_fragment>', `#include <color_fragment>${glsl.form}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>${glsl.bend}`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>${glsl.lobes}`)
      .replace('#include <lights_fragment_maps>', `${glsl.sheen}${glsl.row ?? ''}\n#include <lights_fragment_maps>`);
  };
  material.customProgramCacheKey = () => `${typeof keyBefore === 'function' ? keyBefore.call(material) : ''}|arena-card-v2${variant}`;
  material.userData.arenaCard = true;
  return material;
}

function makeMaterials(club, roomLight, detail, palette, look, rail, steps = readSteps(null)) {
  const lit = !!roomLight && typeof roomLight.material === 'function' && typeof roomLight.emissive === 'function';
  // TIER LINE (owner: surround, CONTRACT 14.2): the canvases are painted at half size on the lite room, which has no data maps
  const scale = detail === 0 ? 0.5 : 1;
  // (the LED face is seen from across the hall: full size on the high tier only)
  // (the lite room folds the aluminium into its matt batch: its atlas paints the aluminium swatches as what they read as)
  // (round A4: the atlas's four panels are painted as what the boards are: an LED display's picture or a print)
  // (round A6: the scoreboard's face is a lit slide when levels.js SCORE_SLIDE is on: the same draw list in a slide's tones)
  const atlas = paintAtlas({ scale, palette, lite: detail === 0, boards: look.boards }), led = paintScoreboard({ scale: detail >= 2 ? 1 : 0.5, palette, slide: SCORE_SLIDE.on ? SCORE_SLIDE : null });
  const aniso = Number(club?.knobs?.anisotropy) > 0 ? Number(club.knobs.anisotropy) : 4;
  const textures = [];
  const canvasTex = (p, name, repeatS = false) => {
    const t = new THREE.CanvasTexture(p.canvas);
    t.name = name; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    if (repeatS) t.wrapS = THREE.RepeatWrapping;
    textures.push({ name, texture: t, w: p.w, h: p.h, bytes: p.bytes });
    return t;
  };
  const dataTex = (data, size, name, srgb) => {
    const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    t.name = name; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = aniso;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    textures.push({ name, texture: t, w: size, h: size, bytes: Math.round(size * size * 4 * 4 / 3) });
    return t;
  };
  const atlasTex = canvasTex(atlas, 'arena.surround.atlas');
  const ledTex = canvasTex(led, 'arena.surround.led');
  const standard = (p, vertexColors = true) => {
    let m;
    if (lit) m = roomLight.material({ ...p, vertexColors, hide: true });
    else {
      m = new THREE.MeshStandardMaterial({ color: p.color ?? 0xffffff, roughness: p.roughness ?? 0.7, metalness: p.metalness ?? 0 });
      if (p.map) m.map = p.map;
      if (p.normalMap) { m.normalMap = p.normalMap; m.normalScale.set(p.normalScale ?? 1, p.normalScale ?? 1); }
      m.name = p.name;
    }
    if (vertexColors && m.vertexColors !== true) { m.vertexColors = true; m.needsUpdate = true; }
    return m;
  };
  const emissive = (p, vertexColors) => {
    let m;
    if (lit) m = roomLight.emissive({ ...p, hide: true });
    else {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color ?? 0xffffff).multiplyScalar(p.intensity ?? 1) });
      if (p.map) m.map = p.map;
      m.name = p.name;
    }
    if (vertexColors && m.vertexColors !== true) { m.vertexColors = true; m.needsUpdate = true; }
    return m;
  };
  // Shadow overlays: multiplied over whatever is behind them (the hall's carpet, the decks). Made through the room light's
  // emissive material so they carry the cut like everything else. The NAMES are the agreement with the hall (the club
  // props' split, room.js applyPropsShadow): `arena.surround.castshadow` is the wide soft darkening a bake holds itself
  // (hide it under the bake), `arena.surround.contactshadow` is smaller than a bake texel (keep it always).
  const overlay = (name) => {
    const m = emissive({ color: 0xffffff, intensity: 1, map: atlasTex, name }, false);
    m.blending = THREE.MultiplyBlending; m.transparent = true; m.depthWrite = false; m.toneMapped = false;
    m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -1;
    return m;
  };
  const S = SURFACE;
  // the printed panels' waviness (detail 1 and 2): the atlas UVs of a 2 m panel span 480 / 2048 of u and 216 / 256 of v, so
  // these repeats put about one tile on a metre in both directions
  const printed = look.boards === 'print';
  let panelN = null;
  if (detail >= 1 && printed) { const pn = panelNormal({ size: 256 }); panelN = dataTex(pn.normal, pn.size, 'arena.surround.panelnormal', false); panelN.repeat.set(8.53, 1.19); }
  // the lit rail's optics (levels.js RAIL, plan.js BOARD.profile): x = recess / slot (the profile's section), y = the opal
  // law's exponent, z = the far wall's share of the face's level; and the raster's size with the slit filter's radius
  // (set per draw from the render target: surround.js buildLevel). Constants of the profile: nothing here moves with a camera
  const PF = BOARD.profile;
  const railUniforms = {
    rail: { value: new THREE.Vector4(PF.recess / PF.slot, rail.power, wallShare(PF.slot, PF.recess, RAIL.wallAlbedo, rail.power), BOARD_LED.fill) },
    px: { value: new THREE.Vector3(1280, 720, rail.filterpx) },
    // the LED panels' structure (levels.js BOARD_LED): the mask's pocket, the gap between two cabinets as a share of a
    // cabinet's width, the spread of level between cabinets
    led: { value: new THREE.Vector3(BOARD_LED.pocket, BOARD_LED.seam / BOARD_LED.cabinetWidth, BOARD_LED.cabinet) },
  };
  const mats = {
    // The PRINTED faces (the tool's `boards:print` arm; LED panels have no lit face material: they are in the emissive
    // batch) stay on the ANALYTIC light under a bake (`volume: false`). Their light is the board wash, 0.17 m in front
    // of the face: a gradient over the face's height. The baked volume's cells are 0.8 x 0.4 x 0.8 m: it holds such a
    // gradient on a side whose face happens to lie behind a grid plane and loses it on a side whose face does not (the
    // first A3 bake: 0.14 to 0.54 units on a face, east and west none). The emitter loop gives every face the same
    // wash, exactly, plus the hall's run-time emitters and the house light's ambient rows (1.0 unit on a vertical face).
    board: printed ? standard({ color: 0xffffff, map: atlasTex, roughness: S.board.roughness, metalness: S.board.metalness, envMapIntensity: S.board.env, name: 'arena.surround.board', volume: false, ...(panelN ? { normalMap: panelN, normalScale: S.board.normalScale } : {}) }) : null,
    deck: standard({ color: 0xffffff, map: atlasTex, roughness: S.deck.roughness, metalness: S.deck.metalness, envMapIntensity: S.deck.env, name: 'arena.surround.deck' }),
    // (round A7, levels.js SURFACE.metal, METAL_HALL: a metal and nothing else, mirroring the hall's baked cube by the env service's tag, below)
    metal: detail >= 1 ? standard({ color: 0xffffff, map: atlasTex, roughness: S.metal.roughness, metalness: S.metal.metalness, envMapIntensity: S.metal.env, name: 'arena.surround.metal' }) : null,
    seats: null, fabric: null, shell: null,
    emit: patchRail(emissive({ color: 0xffffff, intensity: 1, map: atlasTex, name: 'arena.surround.emissive' }, true), railUniforms),
    score: emissive({ color: 0xffffff, intensity: SCORE_SLIDE.on ? SCORE_SLIDE.level : SCORE.level, map: ledTex, name: 'arena.surround.scoreboard' }, false),
    contact: overlay('arena.surround.contactshadow'),
    cast: overlay('arena.surround.castshadow'),
  };
  // Round A7 (CONTRACT 19.1): the aluminium reads the hall's reflection behind the env service's ONE handle, asked for
  // by a TAG on the material (the room's parts are built before `club.env` exists: the service walks the room group
  // for the tag and patches what carries it): all of its image-based specular is the hall's cube (share 1), none of
  // the table's (keep 0). Without the service the tag is unread: the metal keeps its highlights and mirrors nothing.
  const hallAsked = !!(steps.hall && mats.metal);
  if (hallAsked) mats.metal.userData.clubHall = { share: 1, keep: 0 };
  const hallRead = () => {
    const tag = mats.metal?.userData?.clubHall ?? null, read = { asked: hallAsked, tagged: !!tag, share: tag?.share ?? null, keep: tag?.keep ?? null, enabled: null, source: null };
    try { const hall = club?.env?.hall; if (hall) { read.enabled = hall.enabled === true; read.source = hall.source != null ? String(hall.source) : null; } } catch { read.enabled = false; }
    return read;
  };
  // the rail's opening lies ON the profile's top (the same plane as the lips): it is drawn in front of it
  mats.emit.polygonOffset = true; mats.emit.polygonOffsetFactor = -2; mats.emit.polygonOffsetUnits = -2;
  const cardLaw = { value: null };
  // the fabric's colour (round A5, levels.js SEATS: the chosen one, or a tool's arm)
  const seatC = seatColor(look.seatColor);
  // made when a level first needs them: the seat card (detail 0 and 1), the real seats' two materials (detail 2)
  let weave = null, rowTable = null, seatTable = null;
  const need = {
    card(rowCards = null) {
      if (mats.seats) return mats.seats;
      // Round A6 (levels.js CARD_FORM): the card painted as flat albedo and SHADED as the seat it stands for (cardGlsl:
      // the shading normal follows the seat's form, the pile's sheen on the baked irradiance). The fabric keeps beside
      // its sheen lobe what the real seat's physical material keeps (three's sheen energy term: 1 - 0.157 x the sheen
      // colour's largest component); `sheen:0` takes the lobe from both.
      const shaded = look.card && lit;
      const sheenC = new THREE.Color(seatC.sheen).multiplyScalar(look.sheen ? S.fabric.sheen : 0);
      const F = cardForm();
      // (CARD_FORM.lobes: off the lite tier the card takes the fabric's own material, so the room light keeps its
      // emitter loop for it; three's physical material then takes the sheen's energy share itself: no `comp` in the paint)
      const loop = shaded && CARD_FORM.lobes && detail >= 1 && look.sheen;
      // (round A7, levels.js CARD_ROW: where the program has no emitter loop (lite) the card takes the fabric's material
      // all the same, and its lobes take the row's light from the bake: the table below)
      const rowOn = shaded && steps.row && detail === 0 && look.sheen && Array.isArray(rowCards) && rowCards.length > 0 && typeof roomLight.irradianceAt === 'function';
      const lobes = loop || rowOn;
      const card = shaded
        ? paintSeatCardFlat({ scale, color: seatC, comp: lobes ? 1 : 1 - 0.157 * Math.max(sheenC.r, sheenC.g, sheenC.b), nose: { y0: F.yh, y1: F.yn }, rTop: SEAT.back.rTop, rBottom: SEAT.back.rBottom })
        : paintSeatCard({ scale, color: seatC });
      cardLaw.value = card.law ?? null;
      mats.seats = standard({ color: 0xffffff, map: canvasTex(card, 'arena.surround.seatcard', true), roughness: lobes ? S.fabric.roughness : S.seats.roughness, metalness: S.seats.metalness, envMapIntensity: S.seats.env, name: 'arena.surround.seats', ...(lobes ? { physical: true } : {}) });
      mats.seats.alphaTest = S.seats.alphaTest;
      const pile = lobes && mats.seats.isMeshPhysicalMaterial;
      if (pile) { mats.seats.sheen = S.fabric.sheen; mats.seats.sheenRoughness = S.fabric.sheenRoughness; mats.seats.sheenColor.set(seatC.sheen); }
      // (round A7: under the row's light the two terms on the baked irradiance stay, for the part of it that is not the row's light)
      const rest = !pile || (rowOn && pile);
      const gain = rest ? CARD_FORM.sheenGain : 0;
      // (w: the cloth's rough specular as its directional albedo on the baked irradiance, where no emitter loop gives the lobe itself)
      const ownFrame = look.card === 'own' || CARD_FORM.ownFrame === true;
      const rowLit = rowOn && pile, napOn = shaded && steps.nap && NAP.card && Array.isArray(rowCards) && rowCards.length > 0;
      if (rowLit) {
        rowTable = makeRowTable(CARD_ROW.samples, rowCards, (p, n) => roomLight.irradianceAt(p, n), () => roomLight.serial);
        textures.push({ name: 'arena.surround.rowlight', texture: rowTable.texture, w: CARD_ROW.samples, h: 2 * rowCards.length, bytes: rowTable.bytes });
      }
      // (levels.js NAP.seats: each card seat's own tone, lean and wear, one line per card; filled when the level is built)
      const seatsOn = napOn && steps.rhythm === true;
      if (seatsOn) {
        seatTable = makeSeatTable(rowCards.length);
        textures.push({ name: 'arena.surround.seatrhythm', texture: seatTable.texture, w: SEAT_TABLE.w, h: rowCards.length, bytes: seatTable.bytes });
      }
      if (shaded) patchCard(mats.seats, { value: new THREE.Vector4(sheenC.r * gain, sheenC.g * gain, sheenC.b * gain, rest ? 1 : 0) },
        cardGlsl(F, undefined, ownFrame, { row: rowLit, nap: napOn, cards: Math.max(1, rowCards?.length ?? 1), roll: steps.roll === true, seats: seatsOn }), `${ownFrame ? '|own' : ''}${steps.roll === true ? '|roll' : ''}${seatsOn ? '|seats' : ''}${rowLit ? '|row' : ''}${napOn ? '|nap' : ''}`, rowTable, seatTable);
      // what the bake's bounce counts for a card (web/tools/club/bake-room-scene.mjs: `userData.bakeAlbedo` wins over
      // its own row, which holds round A4's graphite): the fabric's linear colour over the 70 % of a card that is
      // opaque (the tool's own convention for this material). A hint for the bounce only.
      const fc = new THREE.Color(seatC.fabric);
      mats.seats.userData.bakeAlbedo = [fc.r, fc.g, fc.b].map((v) => Math.round(v * 0.7 * 1e4) / 1e4);
      return mats.seats;
    },
    realSeats() {
      if (weave) return weave;
      // The upholstery: a graphite cloth with a nap. Its colour is the mesh's vertex colour (levels.js SEAT_COLOR, at the
      // fabric's albedo; no colour map: the assets role's scan of the cloth is flat to under 2 levels of 255, and says
      // so); its grain is the scan's normal map (`arena.seat.normal`, the assets role's; the loader takes the high tier's
      // file on the high tier) with the procedural weave as the stand-in until the file is here, and for good where there
      // is no asset service; what makes it read as cloth and not as felt is its sheen toward grazing angles (three's sheen
      // lobe on a physical material; `sheen:0` is the pair's other arm).
      const maps = weaveMaps({ size: 256, threads: 64 });
      let normalTex = dataTex(maps.normal, maps.size, 'arena.surround.weavenormal', false), fromAssets = false;
      try {
        if (typeof club?.assets?.texture === 'function') { normalTex = club.assets.texture(SEAT_ASSETS.normal, { srgb: false, anisotropy: aniso, fallback: normalTex }) ?? normalTex; fromAssets = true; }
      } catch { /* the stand-in stays */ }
      mats.fabric = standard({ color: 0xffffff, normalMap: normalTex, normalScale: S.fabric.normalScale, roughness: S.fabric.roughness, metalness: S.fabric.metalness, envMapIntensity: S.fabric.env,
        name: 'arena.surround.seatfabric', ...(look.sheen ? { physical: true } : {}) });
      if (look.sheen && mats.fabric.isMeshPhysicalMaterial) { mats.fabric.sheen = S.fabric.sheen; mats.fabric.sheenRoughness = S.fabric.sheenRoughness; mats.fabric.sheenColor.set(seatC.sheen); }
      mats.shell = standard({ color: 0xffffff, roughness: S.shell.roughness, metalness: S.shell.metalness, envMapIntensity: S.shell.env, name: 'arena.surround.seatshell' });
      // (round A7, levels.js NAP: the pile's lean, strokes and wear; the seats' two cloth meshes carry its attributes)
      if (steps.nap) patchFabric(mats.fabric);
      weave = { flatUV: maps.flatUV, fromAssets, asset: fromAssets ? SEAT_ASSETS.normal : null, nap: steps.nap };
      return weave;
    },
  };
  return { mats, atlas, led, lit, textures, scale, need, railUniforms, cardLaw, seatC, hallRead, rowTable: () => rowTable, seatTable: () => seatTable };
}

/**
 * Build the arena's surround. `box` = the hall's interior box, `floorY` the live floor height, `tableBounds` the keep-out
 * rectangle around the table, `roomLight` the room-light service (or null), `layout` the arena layout (the module's exports
 * or its ARENA object; default: arena/layout.js). Never throws: on any error it returns an empty group and says why.
 */
export async function buildSurround(club, { box = null, floorY = -0.79, tableBounds = null, roomLight = null, layout = null } = {}) {
  const group = new THREE.Group();
  group.name = 'arena.surround';
  // the shadow overlays are split by size (makeMaterials): the hall keeps the contact-size ones under its baked light
  group.userData.clubShadowSplit = true;
  const emissives = [];
  const levels = new Map();      // detail -> { group, emissives, counts, emitters }
  const registered = new Set();  // emitter ids handed to roomLight
  let current = null, failure = null, made = null, madeDetail = null;
  const A = layout?.ARENA ?? (layout?.island && layout?.boards ? layout : ARENA);
  const palette = layout?.PALETTE ?? PALETTE;
  let look = readLook(null);
  try { look = readLook(club?.ctx?.query); } catch { /* no boot query: the shipped look */ }
  // round A7's steps (levels.js CARD_ROW, NAP, METAL_HALL; a tool's `row:`, `nap:`, `hall:`, `frames:`)
  let steps = readSteps(null);
  try { steps = readSteps(club?.ctx?.query); } catch { /* no boot query: the shipped steps */ }
  const knobDetail = () => { const d = Number(club?.knobs?.roomDetail); return d === 0 || d === 1 || d === 2 ? d : 1; };
  const Y = Number.isFinite(floorY) ? floorY : -0.79;
  // (reported only: the rail has one level on every tier; a tier without bloom shows the same face without a halo)
  const bloom = club?.knobs?.bloom !== false;
  // the rail's numbers (levels.js RAIL, or a tool's `?clubrail=`)
  let rail = readRail(null);
  try { rail = readRail(club?.ctx?.query); } catch { /* no boot query: the shipped levels */ }

  function buildLevel(detail) {
    const { mats, atlas: T } = made;
    const plan = planSurround(A, detail, palette, look.boards);
    const full = detail >= 1, high = detail >= 2, ledBoards = plan.kind === 'led', cap = plan.cap;
    // nothing merged here is seen from nearer than about two metres: only the high tier chamfers the frames and armrests
    const K = createKit({ bevels: false }), KB = high ? createKit({ bevels: true }) : K;
    const within = (m, fn) => K.within(m, () => (KB === K ? fn() : KB.within(m, fn)));
    const ref = { now: SIDE.keep, slot: null };
    // One batch per material AND per side of the hall (north, east, south, west), so that no mesh's box holds the table.
    // The ball return reads every visible scene mesh as furniture (web/scene/ballreturn/furniture.js): for a mesh whose
    // world box contains a station of its track under the table it builds a grid over the mesh's triangles and runs its
    // inside test over every one of them, per station. A ring-shaped mesh around the table would pay that for nothing;
    // split by side, each mesh is skipped by its box at once, and the frustum culls a side behind the camera.
    const sets = {};
    const setOf = (g) => {
      if (!sets[g]) {
        const mk = (name, o) => new SideBatch(`${name}.${g}`, ref, o);
        const set = { board: mk('board'), deck: mk('deck'), seats: mk('seats'), emit: mk('emissive', { hdr: true, slot: true }), score: mk('scoreboard'), contact: mk('contactshadow'), cast: mk('castshadow') };
        set.metal = full ? mk('metal') : set.deck;   // the lite room folds the aluminium into the matt batch (paint.js flatSwatches: lite)
        sets[g] = set;
      }
      return sets[g];
    };
    let B = setOf('north');
    const inGroup = (g, fn) => { const before = B; B = setOf(g); try { fn(); } finally { B = before; } };
    const sw = (name) => ({ s: T.s(name) });
    const frameMatrix = (f) => new THREE.Matrix4().makeRotationY(f.ry).setPosition(f.ox, Y, f.oz);
    const marked = (side, fn) => { const before = ref.now; ref.now = side; try { fn(); } finally { ref.now = before; } };
    const FLAT = -Math.PI / 2;
    // a long soft-edged overlay on a horizontal surface, in three pieces (two ends and a middle that only falls off across)
    const strip = (batch, len, width, sc, dc, y, region) => {
      if (!look.shadow) return;
      const [u0, v0, u1, v1] = T.r(region, 2), um = (u0 + u1) / 2;
      const e = width / 2, mid = Math.max(0, len - width / 2);
      if (mid > 0.01) K.quad(batch, mid, width, [sc, y, dc], { rx: FLAT, uv: { r: [um, v0, um, v1] } });
      K.quad(batch, e, width, [sc - (mid + e) / 2, y, dc], { rx: FLAT, uv: { r: [u0, v0, um, v1] } });
      K.quad(batch, e, width, [sc + (mid + e) / 2, y, dc], { rx: FLAT, uv: { r: [um, v0, u1, v1] } });
    };
    const blob = (batch, w, d, sc, dc, y) => { if (look.shadow) K.quad(batch, w, d, [sc, y, dc], { rx: FLAT, uv: { r: T.r('blob', 2) } }); };
    const stats = { modules: 0, ledPanels: 0, posts: 0, cards: 0, realSeats: 0, openSeats: 0, stepLights: 0, railSegments: 0, hoops: 0, rowPlates: 0, armCaps: 0 };
    // round A7: where each row card stands (its batch, its first vertex, its four corners in the room): the row table's places
    const rowCards = [];
    const tubeSegs = high ? 8 : 4;
    // (handrails, guard rails and cables are black powder coat or rubber: dielectrics at the shells' albedo, in the matt batch)
    const tube = (a, e, r, name = 'hoop') => K.tube(B.deck, a, e, r, r, { segs: tubeSegs, uv: sw(name) });

    // ---- the ring of boards ------------------------------------------------------------------------------------------
    const b = A.boards, H = b.height, TH = b.thickness, bodyH = H - BOARD.lift, fw = BOARD.frame;
    // The lit rail: an LED profile from s = a to s = e (local) on the frame's top member (plan.js BOARD.profile, levels.js
    // RAIL). The extrusion is black anodised aluminium (lit by the room like every metal here) with a CHAMFER on its
    // table side: a level top at the back, then a slope that falls to the front face (round A4, CONTRACT 16.4). Its
    // opening is one quad on the slope (the plane of the lips' tops), a profile end cap's width short of each end: the
    // material draws what lies in the opening from the profile's section (patchRail). The vertex level is the opal's
    // normal luminance.
    const PF = BOARD.profile, PS = profileSection(PF), railUV = T.s('rail'), chanUV = T.s('channel');
    // the slope's own frame: local y = the slope's normal, local z = down the slope toward the table, the origin on the
    // slope's middle line (a turn about the rail's axis by the tilt)
    const slopeFrame = new THREE.Matrix4().makeRotationX(PS.tilt).setPosition(0, H + PS.yMid, PS.zMid);
    const wedge = (a, e, drop = 0) => {
      // six faces (no bottom: it stands on the cap): back, the level top, the slope, front, two ends (pentagons).
      // `drop`: the slope lowered along its normal (the tool's mesh variant: the body up to the opal's plane)
      const zb = -PF.width / 2, zf = PF.width / 2, y0 = H, yb = H + PS.yBack, n = PS.normal;
      // (a chamfer cut `drop` deeper: its top edge moves back, its foot down)
      const ze = PS.zEdge - drop / Math.sin(PS.tilt), yf = H + PS.yFront - drop / Math.cos(PS.tilt);
      const end = (s) => [s, y0, zb, s, y0, zf, s, yf, zf, s, yb, ze, s, yb, zb];
      const P = [
        a, y0, zb, e, y0, zb, e, yb, zb, a, yb, zb,       // back
        a, yb, zb, e, yb, zb, e, yb, ze, a, yb, ze,       // the level top
        a, yb, ze, e, yb, ze, e, yf, zf, a, yf, zf,       // the slope
        a, y0, zf, e, y0, zf, e, yf, zf, a, yf, zf,       // front
        ...end(a), ...end(e),                             // the two ends
      ];
      const rep = (v, k) => { const o = []; for (let i = 0; i < k; i++) o.push(...v); return o; };
      const N = [...rep([0, 0, -1], 4), ...rep([0, 1, 0], 4), ...rep(n, 4), ...rep([0, 0, 1], 4), ...rep([-1, 0, 0], 5), ...rep([1, 0, 0], 5)];
      const UV = rep(chanUV, 26);
      K.raw(B.metal, P, N, UV, [[0, 1, 2, 3], [4, 5, 6, 7], [8, 9, 10, 11], [12, 13, 14, 15], [16, 17, 18, 19], [16, 19, 20], [21, 22, 23, 24], [21, 24, 25]]);
    };
    const profile = (a, e) => {
      stats.railSegments += 1;
      const meshSlot = look.rail && !look.slot;
      wedge(a, e, meshSlot ? PF.recess : 0);
      if (!look.rail) return;
      const a1 = a + 0.006, e1 = e - 0.006, zs = PF.slot / 2;
      const flatQuad = (P, N, level, slot) => {
        ref.slot = slot;
        try { K.raw(B.emit, P, N, [railUV[0], railUV[1], railUV[0], railUV[1], railUV[0], railUV[1], railUV[0], railUV[1]], [[0, 1, 2, 3]], [level, level, level, level]); } finally { ref.slot = null; }
      };
      const UP = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
      // (everything of the opening is built in the slope's frame: there the plane of the lips' tops is y = 0)
      const opening = () => {
        if (look.slot) {
          // (railSlot: the vector to the opposite edge of the opening, and which edge the vertex is on)
          flatQuad([a1, 0, zs, e1, 0, zs, e1, 0, -zs, a1, 0, -zs], UP, rail.level, [[0, 0, -PF.slot, 0], [0, 0, -PF.slot, 0], [0, 0, PF.slot, 1], [0, 0, PF.slot, 1]]);
          return;
        }
        // the tool's other arm: the same recess as triangles. The two lips on the lowered body, the opal face `recess`
        // down (the emission law alone), the lips' inner walls at the level the opal leaves on them; the lips hide what
        // they hide through the depth buffer
        const lipW = (PS.slope - PF.slot) / 2;
        for (const sg of [-1, 1]) K.box(B.metal, [e - a, PF.recess, lipW], [(a + e) / 2, -PF.recess / 2, sg * (PF.slot / 2 + lipW / 2)], { uv: sw('channel') });
        const yC = -PF.recess, bare = [[0, 0, 0, 2], [0, 0, 0, 2], [0, 0, 0, 2], [0, 0, 0, 2]];
        const wallLevel = rail.level * wallShare(PF.slot, PF.recess, RAIL.wallAlbedo, rail.power);
        flatQuad([a1, yC, zs, e1, yC, zs, e1, yC, -zs, a1, yC, -zs], UP, rail.level, bare);
        flatQuad([a1, yC, zs, e1, yC, zs, e1, 0, zs, a1, 0, zs], [0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], wallLevel, null);
        flatQuad([a1, yC, -zs, e1, yC, -zs, e1, 0, -zs, a1, 0, -zs], [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], wallLevel, null);
      };
      K.within(slopeFrame, opening);
    };
    const boardModule = (m) => {
      const s0 = m.s0 + BOARD.joint / 2, s1 = m.s1 - BOARD.joint / 2, len = s1 - s0, sc = (s0 + s1) / 2;
      const zPanel = TH / 2 - BOARD.proud, yMid = BOARD.lift + bodyH / 2;
      // the print on the inner face and the plain back on the outer one, both set back in the frame
      let uv = m.kind === 'full' ? T.print(m.design, fw, PANEL.w - fw, fw, PANEL.h - fw) : T.print(T.plain.design, T.plain.x0, T.plain.x1, fw, PANEL.h - fw);
      if (m.flip) uv = [uv[2], uv[1], uv[0], uv[3]];
      const fwW = len - 2 * fw + 0.002, fwH = bodyH - 2 * fw + 0.002;
      if (ledBoards) {
        // an LED PANEL (round A4, levels.js BOARD_LED): the face is a display, drawn by the emissive material with its
        // pixel grid (railSlot: the vertices' places in LED cells, along the side and up, so the grid runs through from
        // module to module); behind it the cabinet's black face (what the hall's light and the bake meet: a display that
        // is off is a black mask)
        const [px, py] = BOARD_LED.pitch, x0 = (sc - fwW / 2) / px, x1 = (sc + fwW / 2) / px, y0 = (yMid - fwH / 2) / py, y1 = (yMid + fwH / 2) / py;
        // (round A5: the face is `cabs` cabinets wide; the cabinet coordinate runs c0 .. c0 + cabs, eight apart from module to module)
        const cabs = Math.max(1, Math.round(fwW / BOARD_LED.cabinetWidth)), c0 = stats.ledPanels * 8;
        ref.slot = [[x0, y0, c0, 3], [x1, y0, c0 + cabs, 3], [x1, y1, c0 + cabs, 3], [x0, y1, c0, 3]];
        try { K.quad(B.emit, fwW, fwH, [sc, yMid, zPanel], { uv: { r: uv }, k: rail.led }); } finally { ref.slot = null; }
        K.quad(B.deck, fwW, fwH, [sc, yMid, zPanel - 0.004], { uv: sw('housing') });
        stats.ledPanels += 1;
      } else K.quad(B.board, fwW, fwH, [sc, yMid, zPanel], { uv: { r: uv } });
      K.quad(B.deck, fwW, fwH, [sc, yMid, -zPanel], { ry: Math.PI, uv: sw('panelBack') });
      // the aluminium frame: a top member with a nose toward the table (the cap: the LED profile sits on it, the board
      // wash looks down from the underside of its nose), a bottom member, two stiles (the joint between two modules is
      // two stiles and a dark slit). The cap is black anodised like the LED profile it carries (one assembly: a pale cap
      // under the table's lamp would be a second bright line round the ring); the bottom member and the stiles are
      // natural anodised aluminium. All of it a metal, lit by the room (no vertex shade: round A2 darkened the cap and
      // the stiles by hand)
      // (the nose: 60 mm over an LED panel, 160 mm over a print that the run under it has to wash: levels.js BOARDS)
      KB.box(B.metal, [len, fw, TH + cap.nose], [sc, H - fw / 2, cap.nose / 2], { uv: sw('channel'), b: 0.004 });
      // (round A5: an LED board's housing is DARK all round: black powder-coated cabinet edges, like its cap; the pale
      // aluminium stiles belonged to a framed print and stay with the print arm. The posts at the ring's corners and
      // ends stay natural aluminium)
      // (round A7, levels.js METAL_HALL: with the hall's reflection the stiles and the bottom member are natural brushed
      // aluminium again: what they show is the hall they mirror; the cap that carries the lit rail stays black)
      const edge = ledBoards && !(steps.hall && steps.frames === 'alu') ? 'channel' : 'alu';
      KB.box(B.metal, [len, fw, TH], [sc, BOARD.lift + fw / 2, 0], { uv: sw(edge), b: 0.004 });
      for (const s of [s0 + fw / 2, s1 - fw / 2]) KB.box(B.metal, [fw, bodyH - 2 * fw, TH], [s, yMid, 0], { uv: sw(edge), b: 0.004 });
      // the recessed plinth that closes the gap under the frame (the frame throws its line of shade on it)
      if (full) K.box(B.deck, [len - 0.02, BOARD.lift - 0.002, BOARD.plinth], [sc, (BOARD.lift + 0.002) / 2, 0], { uv: sw('plinth') });
      // feet: a flat plate of black painted steel across the board; on the high tier a welded rib, a brace up the back and
      // rubber pads (painted steel is a dielectric at the shells' albedo: the matt batch)
      const feet = len < 0.9 ? [sc] : [s0 + Math.min(0.32, len * 0.2), s1 - Math.min(0.32, len * 0.2)];
      for (const fs of feet) {
        K.box(B.deck, [BOARD.footWidth, BOARD.footThick, b.footDepth], [fs, BOARD.footThick / 2, 0], { uv: sw('steel') });
        if (high) {
          K.box(B.deck, [0.03, 0.03, b.footDepth - 0.06], [fs, BOARD.footThick + 0.015, 0], { uv: sw('steel') });
          const dz = b.footDepth / 2 - 0.03 - TH / 2, dy = 0.38 - BOARD.footThick, L = Math.hypot(dz, dy);
          K.box(B.deck, [0.03, L, 0.012], [fs, BOARD.footThick + dy / 2, -(TH / 2 + dz / 2)], { rx: Math.atan2(dz, dy), uv: sw('steel') });
          for (const sgn of [-1, 1]) K.box(B.deck, [BOARD.footWidth + 0.006, 0.006, 0.05], [fs, 0.003, sgn * (b.footDepth / 2 - 0.025)], { uv: sw('rubber') });
        }
        blob(B.contact, 0.22, b.footDepth + 0.16, fs, 0, 0.0035);
      }
      // the lit rail: the LED profile on the top member
      profile(s0, s1);
      stats.modules += 1;
    };
    for (const sd of plan.boards.sides) {
      inGroup(sd.side, () => within(frameMatrix(sd.frame), () => {
        for (const seg of sd.segments) {
          for (const m of seg.modules) boardModule(m);
          const len = seg.s1 - seg.s0, sc = (seg.s0 + seg.s1) / 2;
          // the dark line under the board (contact size: it stays under a bake; the board wash's pool lies in front of it)
          strip(B.contact, len, 0.26, sc, 0, 0.003, 'blobBox');
        }
      }));
    }
    for (const p of plan.boards.posts) {
      // a corner post goes with the east side's meshes, an end post with its own side's
      inGroup(p.kind === 'corner' ? 'east' : p.id.split('@')[0], () => within(new THREE.Matrix4().setPosition(p.x, Y, p.z), () => {
        KB.box(B.metal, [BOARD.post, BOARD.postTop - 0.012, BOARD.post], [0, (BOARD.postTop - 0.012) / 2, 0], { uv: sw('post'), b: 0.006 });
        K.box(B.metal, [BOARD.post + 0.012, 0.012, BOARD.post + 0.012], [0, BOARD.postTop - 0.006, 0], { uv: sw('channel') });
        K.box(B.deck, [0.24, 0.01, 0.24], [0, 0.005, 0], { uv: sw('steel') });
        blob(B.contact, 0.42, 0.42, 0, 0, 0.0035);
      }));
      stats.posts += 1;
    }

    // ---- the seating -------------------------------------------------------------------------------------------------
    const S = plan.seating, tread = S.tread;
    const tilt = look.tilt ? SEAT.cardTilt : 0;
    // which seat the geometry revision builds (plan.js seatForm: round A6's upholstered seat from revision 8 on, with the
    // row's card on the plane of the real pad's face)
    const form = seatForm();
    // (round A8: the sheet leans from the deck; the real back stands upright for SEAT.back.y and leans above it, its
    // pad's face on the sheet's plane. A point t up the real back lies t + back.y / cos + z0 x tan along the sheet,
    // z0 = the plane's height over the back's own zero; the paint lays it out at t + back.y. The difference, 14.1 mm,
    // is where the card's map begins below the sheet's foot: measured 12 px of 916 px/m, CARD-CAUSE-A8.md)
    const cardUp = SEAT.back.y * (1 / Math.cos(tilt) - 1) + (form.cardForward * Math.cos(tilt) - SEAT.back.y * Math.sin(tilt)) * Math.tan(tilt);
    const realSeats = high && look.real && look.seats;
    const St = SEAT.standard, Ar = SEAT.arm;
    // what stands between two seats (and at a row's two ends) and does not move: the standard on its foot, the armrest
    // (in the MATT batch: black powder coat is a dielectric at the shells' albedo; no vertex shade)
    const standardAt = (s, h, d, arm = true) => {
      K.box(B.deck, [St.w, St.h, St.d], [s, h + St.h / 2, d - 0.01], { uv: sw('seatFrame') });
      if (high) K.box(B.deck, [St.footW, St.footT, St.footD], [s, h + St.footT / 2, d], { uv: sw('seatFrame') });
      if (arm) K.box(B.deck, [Ar.w, Ar.t, Ar.len], [s, h + Ar.y + Ar.t / 2, d + Ar.z], { uv: sw('arm') });
    };
    const blockOf = {};
    // round A5: the real seats' armrest caps are instanced in the shells' material (seat.js seatArmGeometry): where each stands
    const armsAt = [];
    for (const blk of S.blocks) {
      blockOf[blk.id] = blk;
      inGroup(blk.side, () => marked(blk.mark, () => within(frameMatrix(blk.frame), () => {
        const r0 = blk.rows[0];
        const ac = blk.aisle.centre, aw = blk.aisle.s1 - blk.aisle.s0;
        for (const half of blk.halves) {
          const len = half.s1 - half.s0, sc = (half.s0 + half.s1) / 2;
          const cw = half.seats * S.pitch, cs = half.first + ((half.seats - 1) * S.pitch) / 2;
          const hi = blk.halves.indexOf(half);
          for (const r of blk.rows) {
            const dSeat = r.d - SEAT.cardAt;
            if (full) {
              // the deck of this row: a body down to the floor, a tread slab on it, a dark aluminium trim on the front edge
              // (dark painted board at the decks' albedo from top to floor: what reaches a riser is the light's business)
              K.box(B.deck, [len, r.h - 0.02, tread], [sc, (r.h - 0.02) / 2, r.d - tread / 2], { uv: sw(r.row === 0 ? 'fascia' : 'deck') });
              K.box(B.deck, [len, 0.02, tread + 0.012], [sc, r.h - 0.01, r.d - tread / 2 + 0.006], { uv: sw('tread') });
              K.box(B.metal, [len, 0.006, 0.045], [sc, r.h + 0.003, r.d - 0.0165], { uv: sw('aluDark') });
            } else K.box(B.deck, [len, r.h, tread], [sc, r.h / 2, r.d - tread / 2], { uv: sw('tread') });
            if (realSeats) {
              // the fixed parts of a real row: a standard with its armrest at every seat boundary, a hinge bar per seat
              for (let i = 0; i <= half.seats; i++) {
                const as = half.first + (i - 0.5) * S.pitch;
                standardAt(as, r.h, dSeat, false);
                armsAt.push({ block: blk.id, s: as, h: r.h + Ar.y, d: dSeat + Ar.z });
              }
              K.box(B.deck, [cw, 0.024, 0.024], [cs, r.h + SEAT.pan.pivotY, dSeat + SEAT.pan.pivotZ], { uv: sw('seatFrame') });
              // the row's blank plate on the aisle side of its end standard (no digits: content.js holds the rule)
              const toAisle = sc < ac ? 1 : -1, RP = SEAT.rowPlate;
              const ps = toAisle > 0 ? half.first + (half.seats - 0.5) * S.pitch : half.first - 0.5 * S.pitch;
              K.quad(B.deck, RP.w, RP.h, [ps + toAisle * (St.w / 2 + 0.0015), r.h + RP.y, dSeat - 0.01], { ry: (toAisle * Math.PI) / 2, uv: sw('plate') });
              stats.rowPlates += 1;
            } else if (look.seats) {
              // the row's card: folded seats painted on a leaning sheet (backs lean; a leaning card is never edge-on from above)
              const u0 = ((r.row * 3 + hi * 2) % SEAT_CARD.seats) / SEAT_CARD.seats;
              const first = B.seats.count;
              K.quad(B.seats, cw, SEAT.cardH, [cs, r.h + (SEAT.cardH / 2) * Math.cos(tilt), dSeat + form.cardForward - (SEAT.cardH / 2) * Math.sin(tilt)],
                { rx: -tilt, uv: { r: [u0, -cardUp / SEAT.cardH, u0 + half.seats / SEAT_CARD.seats, 1 - cardUp / SEAT.cardH] } });
              stats.cards += 1;
              // (its corners by their map coordinates: low u / high u along the row, low v the foot, high v the top)
              if (B.seats.count - first === 4) {
                const at = (i) => ({ p: B.seats.pos.slice(3 * (first + i), 3 * (first + i) + 3), u: B.seats.uv[2 * (first + i)], v: B.seats.uv[2 * (first + i) + 1] });
                const q = [0, 1, 2, 3].map(at), um = (Math.min(...q.map((x) => x.u)) + Math.max(...q.map((x) => x.u))) / 2, vm = (Math.min(...q.map((x) => x.v)) + Math.max(...q.map((x) => x.v))) / 2;
                const pick = (hiU, hiV) => q.find((x) => (x.u > um) === hiU && (x.v > vm) === hiV)?.p ?? q[0].p;
                // (`block`, `row`, `half`, and the card's two ends along the block's own s axis, low u first: the seats' table's places)
                const lowU = q.find((x) => x.u <= um), sLow = Math.abs(lowU.p[blk.frame.axis === 'x' ? 0 : 2] * blk.frame.sign - (cs - cw / 2)) < Math.abs(lowU.p[blk.frame.axis === 'x' ? 0 : 2] * blk.frame.sign - (cs + cw / 2)) ? cs - cw / 2 : cs + cw / 2;
                rowCards.push({ batch: B.seats, first, ends: q.map((x) => (x.u > um ? 1 : 0)), bl: pick(false, false), br: pick(true, false), tl: pick(false, true), tr: pick(true, true),
                  block: blk.id, row: r.row + 1, half: hi, s0: sLow, s1: 2 * cs - sLow, off: Math.round(u0 * SEAT_CARD.seats), seats: half.seats });
              }
              // the two ends of the row are real: a standard and its armrest. Looking along a row from beyond its end (the
              // flattest view the camera has of a card, about 7 degrees) the eye meets a seat's side, not a sheet's edge
              if (full) for (const es of [half.first - S.pitch / 2, half.first + (half.seats - 0.5) * S.pitch]) standardAt(es, r.h, dSeat + 0.03);
            }
            // the seats' own darkening on the deck under them (contact size: it stays under a bake)
            if (look.seats && full) strip(B.contact, cw, 0.5, cs, dSeat + 0.1, r.h + 0.004, r.row === 0 ? 'blobBox' : 'aoBox');
          }
          // the guard rail in front of the first row: posts, a top rail, a mid rail and a kick plate (the lite room: a bar on two posts)
          const gd = r0.d - 0.035, gt = r0.h + S.guardRailH;
          if (full) {
            const n = Math.max(1, Math.round((len - 0.1) / SEAT.railPost));
            for (let i = 0; i <= n; i++) tube([half.s0 + 0.05 + (i * (len - 0.1)) / n, r0.h, gd], [half.s0 + 0.05 + (i * (len - 0.1)) / n, gt, gd], 0.021, 'hoop');
            tube([half.s0 + 0.05, gt, gd], [half.s1 - 0.05, gt, gd], 0.021, 'hoop');
            tube([half.s0 + 0.05, r0.h + S.guardRailH * 0.56, gd], [half.s1 - 0.05, r0.h + S.guardRailH * 0.56, gd], 0.014, 'hoop');
            K.box(B.deck, [len - 0.1, SEAT.kick, 0.008], [sc, r0.h + 0.012 + SEAT.kick / 2, gd], { uv: sw('kick') });
          } else {
            K.box(B.deck, [len - 0.1, 0.04, 0.04], [sc, gt - 0.02, gd], { uv: sw('hoop') });
            for (const ps of [half.s0 + 0.07, half.s1 - 0.07]) K.box(B.deck, [0.04, S.guardRailH - 0.04, 0.04], [ps, r0.h + (S.guardRailH - 0.04) / 2, gd], { uv: sw('hoop') });
          }
          // where the block meets the carpet
          strip(B.contact, len, 0.24, sc, r0.d + 0.02, 0.003, 'blobBox');
          strip(B.cast, len, 1.1, sc, r0.d + 0.2, 0.002, 'aoBox');
        }
        // the stair aisle: two steps per row, a pale anti-slip nosing on each (the nosings' albedo is the law's 0.45), a
        // pair of step lights in the riser of each row's first step. A step light is a small source seen directly; it
        // has no emitter and, from round A3, no painted pool on the tread (paint is not light: levels.js STEP)
        const step = (top, dFront, going, lights) => {
          K.box(B.deck, [aw, top, going], [ac, top / 2, dFront - going / 2], { uv: sw('tread') });
          if (full) K.box(B.deck, [aw - 0.004, 0.032, 0.052], [ac, top - 0.014, dFront - 0.022], { uv: sw('nosing') });
          if (!lights || !look.steps) return;
          for (const sgn of [-1, 1]) {
            const ls = ac + sgn * (aw / 2 - 0.2), ly = top - SEAT.stepRise * 0.5 - 0.01;
            if (high) K.box(B.deck, [0.12, 0.04, 0.008], [ls, ly, dFront + 0.003], { uv: sw('bezel') });
            K.quad(B.emit, 0.085, 0.02, [ls, ly, dFront + 0.008], { uv: sw('stepLight'), k: STEP.level });
            stats.stepLights += 1;
          }
        };
        // (the steps from the carpet up to the first deck stay the surround's: the floor part's note of 00:53Z says it builds
        // none at the layout's `floor.steps`, because these stand there)
        const approach = Math.max(0, Math.round(r0.h / SEAT.stepRise) - 1);
        for (let j = approach; j >= 1; j--) step(r0.h - j * SEAT.stepRise, r0.d + j * 0.3, 0.3, null);
        for (const r of blk.rows) { step(r.h, r.d, tread / 2, true); step(r.h + SEAT.stepRise, r.d - tread / 2, tread / 2, null); }
        if (approach > 0) blob(B.contact, aw + 0.3, approach * 0.3 + 0.3, ac, r0.d + approach * 0.15, 0.0035);
        // the hoop handrails at the aisle's two edges: a black tube hoop per row (every second row below the high tier),
        // its front leg on the row's first step, its rear leg on the second, a level top
        if (full) {
          const Hp = SEAT.hoop, bends = high ? 3 : 1;
          for (const r of blk.rows) {
            if (!high && r.row % 2 === 1) continue;
            for (const hs of [blk.aisle.s0 + Hp.inset, blk.aisle.s1 - Hp.inset]) {
              const d1 = r.d - Hp.front, d2 = d1 - Hp.depth, top = r.h + Hp.h;
              const pts = [[hs, r.h, d1], [hs, top - Hp.bend, d1]];
              for (let i = 1; i <= bends; i++) { const a = (Math.PI / 2) * (i / bends); pts.push([hs, top - Hp.bend + Hp.bend * Math.sin(a), d1 - Hp.bend * (1 - Math.cos(a))]); }
              for (let i = 0; i <= bends; i++) { const a = (Math.PI / 2) * (i / bends); pts.push([hs, top - Hp.bend + Hp.bend * Math.cos(a), d2 + Hp.bend * (1 - Math.sin(a))]); }
              pts.push([hs, r.h + SEAT.stepRise, d2]);
              for (let i = 1; i < pts.length; i++) tube(pts[i - 1], pts[i], Hp.tube, 'hoop');
              if (high) for (const [fy, fd] of [[r.h, d1], [r.h + SEAT.stepRise, d2]]) K.box(B.deck, [0.09, 0.006, 0.09], [hs, fy + 0.003, fd], { uv: sw('hoop') });
              stats.hoops += 1;
            }
          }
        }
      })));
    }

    // ---- the scoreboard (the wall behind it is the hall's) -----------------------------------------------------------
    const sb = plan.scoreboard;
    inGroup('west', () => marked(sb.mark, () => within(new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(sb.x, Y + sb.h, sb.z), () => {
      const w = sb.width, h = sb.height, bz = sb.bezel, zf = sb.depth / 2;
      // the LED cabinet, its face set back in a black bezel, a thin aluminium trim round it
      K.box(B.deck, [w + 2 * bz, h + 2 * bz, sb.depth], [0, 0, 0], { uv: sw('housing') });
      if (look.score) K.quad(B.score, w, h, [0, 0, zf + 0.008], { uv: { r: [0, 0, 1, 1] } });
      for (const sy of [-1, 1]) KB.box(B.deck, [w + 2 * bz, bz - 0.004, 0.03], [0, sy * (h / 2 + bz / 2 + 0.002), zf + 0.015], { uv: sw('bezel'), b: 0.004 });
      for (const sx of [-1, 1]) KB.box(B.deck, [bz - 0.004, h + 0.004, 0.03], [sx * (w / 2 + bz / 2 + 0.002), 0, zf + 0.015], { uv: sw('bezel'), b: 0.004 });
      for (const sy of [-1, 1]) K.box(B.metal, [w + 2 * bz + 0.016, 0.008, sb.depth + 0.016], [0, sy * (h / 2 + bz + 0.004), 0], { uv: sw('aluDark') });
      for (const sx of [-1, 1]) K.box(B.metal, [0.008, h + 2 * bz, sb.depth + 0.016], [sx * (w / 2 + bz + 0.004), 0, 0], { uv: sw('aluDark') });
      // two steel wall rails from under the cabinet to the top of the backdrop, and (high) the cable down the wall
      const up = sb.top - sb.h - 0.05, down = h / 2 + bz + 0.25;
      for (const sx of [-1, 1]) K.box(B.deck, [0.05, up + down, 0.012], [sx * w * 0.3, (up - down) / 2, -zf + 0.006], { uv: sw('steel') });
      if (high) tube([w * 0.38, -(h / 2 + bz), -zf + 0.02], [w * 0.38, -(sb.h - 0.02), -zf + 0.02], 0.009, 'rubber');
    })));

    // ---- meshes ------------------------------------------------------------------------------------------------------
    const g = new THREE.Group();
    g.name = `arena.surround.detail${detail}`;
    const out = [];
    const byMaterial = {};
    let triangles = 0, drawCalls = 0;
    const order = ['board', 'deck', 'metal', 'seats', 'emit', 'score', 'contact', 'cast'];
    const bySide = {};
    for (const side of ['north', 'east', 'south', 'west']) {
      const set = sets[side];
      if (!set) continue;
      bySide[side] = 0;
      for (const key of order) {
        const batch = set[key];
        if (!batch || !batch.count || (key === 'metal' && batch === set.deck)) continue;
        const mat = key === 'seats' ? made.need.card(rowCards) : mats[key];
        if (!mat) continue;
        const mesh = batch.toMesh(mat);
        // round A7: each card vertex's place in the row table (x: along the card, on the table's texel centres; y: its card's line)
        if (key === 'seats' && rowCards.length) {
          const uvRow = new Float32Array(2 * batch.count), n = CARD_ROW.samples;
          rowCards.forEach((c, k) => { if (c.batch === batch) c.ends.forEach((e, i) => { uvRow[2 * (c.first + i)] = (0.5 + e * (n - 1)) / n; uvRow[2 * (c.first + i) + 1] = (2 * k + 0.5) / (2 * rowCards.length); }); });
          mesh.geometry.setAttribute('arenaRowUV', new THREE.Float32BufferAttribute(uvRow, 2));
        }
        // overlays: drawn after the opaque hall, never a ray target
        if (key === 'contact' || key === 'cast') { mesh.renderOrder = 1; mesh.raycast = () => {}; }
        if (key === 'emit' || key === 'score') out.push(mesh);
        // The rail's raster: the size in pixels of what is being drawn into (the frame, a cell of a sheet, a face of an
        // environment capture), for the slit's reconstruction filter (levels.js RAIL.filterPx). Nothing else is set per
        // draw: the rail is the same surface, at the same level, in the frame and in every capture (round A2 boosted it
        // in captures and switched its strip by the eye's height: both are gone)
        if (key === 'emit') mesh.onBeforeRender = (renderer) => {
          try { renderer.getCurrentViewport(_viewport); if (_viewport.z > 0 && _viewport.w > 0) made.railUniforms.px.value.set(_viewport.z, _viewport.w, rail.filterpx); } catch { /* a renderer without a viewport: the last size stands */ }
          // (round A7: the cards' row table follows the room light's bake: a counter is compared, nothing else is read)
          try { followBake(); } catch { /* the tables keep what they hold */ }
        };
        g.add(mesh);
        byMaterial[mat.name] = (byMaterial[mat.name] ?? 0) + batch.triangles; triangles += batch.triangles; drawCalls += 1; bySide[side] += 1;
      }
    }
    // detail 2: every seat of the hall, two instanced meshes for all three blocks (seat.js): the backs (shell and pad, the
    // fabric's weave) and the tipped-up pans (black moulded undersides). Each seat's matrix comes from the plan's fixed
    // seed: the pan's fold (a few have not come up all the way), the back's lean and turn; its instance colour is its
    // fabric's wear. No row shade: a row's level is the light that reaches it.
    if (realSeats) {
      const weave = made.need.realSeats();
      // (round A6: from the revision that builds it, the back's panels are bolsters and the cushion has a waterfall edge: seat.js)
      const backGeo = (form.upholstered ? seatBackUpholstered : seatBackGeometry)({ tile: SURFACE.fabric.tile, flatUV: weave.flatUV, color: made.seatC }), panGeo = seatPanGeometry({ color: made.seatC });
      // round A5: the pan's cushion (cloth: the fabric's material, the pan's matrix) and the armrest caps (the shells' material)
      const cushionGeo = (form.upholstered ? seatCushionUpholstered : seatCushionGeometry)({ tile: SURFACE.fabric.tile, color: made.seatC }), armGeo = seatArmGeometry({ color: made.seatC });
      const seats = plan.seats, n = seats.length;
      const backs = new THREE.InstancedMesh(backGeo, mats.fabric, n), pans = new THREE.InstancedMesh(panGeo, mats.shell, n);
      const cushions = new THREE.InstancedMesh(cushionGeo, mats.fabric, n), arms = new THREE.InstancedMesh(armGeo, mats.shell, armsAt.length);
      backs.name = 'arena.surround.seatback'; pans.name = 'arena.surround.seatpan'; cushions.name = 'arena.surround.seatcushion'; arms.name = 'arena.surround.seatarm';
      const sidesB = new Float32Array(n), sidesP = new Float32Array(n), sidesC = new Float32Array(n), sidesA = new Float32Array(armsAt.length);
      const base = new THREE.Matrix4(), m4 = new THREE.Matrix4(), loc = new THREE.Matrix4(), rot = new THREE.Matrix4();
      const euler = new THREE.Euler(), tint = new THREE.Color();
      const frames = {};
      const napOn = weave.nap === true;
      const napB = napOn ? new Float32Array(4 * n) : null, napC = napOn ? new Float32Array(4 * n) : null, wearB = napOn ? new Float32Array(n) : null, wearC = napOn ? new Float32Array(n) : null;
      seats.forEach((s, i) => {
        const blk = blockOf[s.block];
        frames[s.block] ??= frameMatrix(blk.frame);
        const fold = look.vary ? s.fold : SEAT.fold, lean = look.vary ? s.lean : SEAT.lean, yaw = look.vary ? s.yaw : 0;
        base.copy(frames[s.block]).multiply(loc.makeTranslation(s.s, s.h, s.d));
        m4.copy(base).multiply(loc.makeTranslation(0, SEAT.back.y, 0)).multiply(rot.makeRotationFromEuler(euler.set(-lean, yaw, 0, 'YXZ')));
        backs.setMatrixAt(i, m4);
        m4.copy(base).multiply(loc.makeTranslation(0, SEAT.pan.pivotY, SEAT.pan.pivotZ)).multiply(rot.makeRotationFromEuler(euler.set(-fold, yaw * 0.5, 0, 'YXZ')));
        pans.setMatrixAt(i, m4); cushions.setMatrixAt(i, m4);
        const tone = look.vary ? s.tone : 1;
        backs.setColorAt(i, tint.setRGB(tone, tone, tone)); cushions.setColorAt(i, tint);
        // round A7 (levels.js NAP): this seat's pile: its lean as a vector of the pad's plane in each part's own frame
        // (the back's x and y, the cushion's x and z), its seed, the wear of its cushion's front roll
        if (napB) {
          const m = look.vary ? NAP.lean * s.napM : 0, cx = m * Math.cos(s.napA), cy = m * Math.sin(s.napA), seed = s.napA / (2 * Math.PI);
          napB.set([cx, cy, 0, seed], 4 * i); napC.set([cx, 0, cy, seed], 4 * i); wearB[i] = 0; wearC[i] = look.vary ? s.wear : 0;
        }
        sidesB[i] = blk.mark; sidesP[i] = blk.mark; sidesC[i] = blk.mark;
        if (s.open && look.vary) stats.openSeats += 1;
      });
      armsAt.forEach((a, i) => {
        const blk = blockOf[a.block];
        frames[a.block] ??= frameMatrix(blk.frame);
        arms.setMatrixAt(i, m4.copy(frames[a.block]).multiply(loc.makeTranslation(a.s, a.h, a.d)));
        sidesA[i] = blk.mark;
      });
      stats.armCaps = armsAt.length;
      if (napOn) for (const [geo, nap, wear] of [[backGeo, napB, wearB], [cushionGeo, napC, wearC]]) {
        geo.setAttribute('arenaNap', new THREE.InstancedBufferAttribute(nap, 4));
        geo.setAttribute('arenaWear', new THREE.InstancedBufferAttribute(wear, 1));
      }
      for (const [inst, sides] of [[backs, sidesB], [pans, sidesP], [cushions, sidesC], [arms, sidesA]]) {
        inst.geometry.setAttribute('roomSide', new THREE.InstancedBufferAttribute(sides, 1));
        inst.instanceMatrix.needsUpdate = true;
        if (inst.instanceColor) inst.instanceColor.needsUpdate = true;
        inst.computeBoundingSphere?.(); inst.computeBoundingBox?.();
        inst.matrixAutoUpdate = false;
        g.add(inst);
        const tris = (inst.geometry.getIndex().count / 3) * inst.count;
        const key = `${inst.material.name} (instanced)`;
        byMaterial[key] = (byMaterial[key] ?? 0) + tris; triangles += tris; drawCalls += 1;
      }
      stats.realSeats = n;
      stats.seatTriangles = { back: backGeo.getIndex().count / 3, pan: panGeo.getIndex().count / 3, cushion: cushionGeo.getIndex().count / 3, arm: armGeo.getIndex().count / 3 };
    }
    const emitters = look.emitters ? plan.emitters.filter((e) => (look.wash || !/^arena\.boardwash\./.test(e.id)) && (look.score || e.id !== 'arena.scoreboard')) : [];
    const counts = {
      detail, drawCalls, drawCallsBySide: bySide, triangles, byMaterial, ...stats,
      seats: { total: S.total, perBlock: S.perBlock, perRow: Object.fromEntries(S.blocks.map((x) => [x.id, x.perRow])), rows: S.rows.length, real: stats.realSeats, onCards: look.seats ? S.total - stats.realSeats : 0 },
      emitters: emitters.map((e) => e.id), emitterShare: A.emitters?.surround ?? null,
    };
    // what a bake of the hall depends on in this level: the plan's geometry and emitter places, and the switches that remove geometry
    const signature = `${planSignature(plan)}|seats:${look.seats ? 1 : 0}|shadow:${look.shadow ? 1 : 0}${high && !look.real ? '|real:0' : ''}${plan.kind !== BOARDS.default ? `|boards:${plan.kind}` : ''}${look.seatColor !== SEATS.default ? `|seatcolor:${look.seatColor}` : ''}`;
    // round A7 (levels.js NAP.seats): every card seat's record is its own seat's in the plan: the tone the real seat's
    // instance carries, its pile's lean (along the card: toward the card's high-u end) and its roll's wear
    const rhythm = made.seatTable?.();
    if (rhythm && rowCards.length) {
      const bySeat = new Map();
      for (const seat of plan.seats) { const key = `${seat.block}|${seat.row + 1}|${seat.half}`; if (!bySeat.has(key)) bySeat.set(key, []); bySeat.get(key).push(seat); }
      rhythm.fill((c, j) => {
        const card = rowCards[c], i = j - card.off;
        if (!card || i < 0 || i >= card.seats || card.off + card.seats > SEAT_TABLE.w) return null;
        const at = card.s0 + ((card.s1 - card.s0) * (i + 0.5)) / card.seats, dir = Math.sign(card.s1 - card.s0) || 1;
        let seat = null;
        for (const q of bySeat.get(`${card.block}|${card.row}|${card.half}`) ?? []) if (!seat || Math.abs(q.s - at) < Math.abs(seat.s - at)) seat = q;
        if (!seat || Math.abs(seat.s - at) > S.pitch / 2 || !look.vary) return null;
        const m = NAP.lean * seat.napM;
        return [seat.tone, m * Math.cos(seat.napA) * dir, m * Math.sin(seat.napA), seat.wear];
      });
    }
    return { group: g, emissives: out, emitters, counts, signature, rowCards };
  }

  // (per draw, from the rail's hook: a counter is compared; the row table follows the room light's bake)
  function followBake() {
    made?.rowTable()?.sync();
  }

  // an emitter's level as registered (a board wash follows the tool's `wash` number when one is given)
  const levelOf = (e) => (rail.wash !== null && /^arena\.boardwash\./.test(e.id) ? (e.intensity * rail.wash) / capOf(look.boards).perMetre : e.intensity);

  function registerEmitters(level) {
    if (!made?.lit || typeof roomLight.addEmitter !== 'function') return;
    const live = new Set();
    for (const e of level.emitters) {
      roomLight.addEmitter({
        id: e.id, type: e.type, position: new THREE.Vector3(e.p[0], Y + e.p[1], e.p[2]), color: new THREE.Color(e.color), intensity: levelOf(e), radius: e.radius, size: e.size,
        axis: e.axis ? new THREE.Vector3(...e.axis) : null, normal: e.normal ? new THREE.Vector3(...e.normal) : null,
      });
      live.add(e.id); registered.add(e.id);
    }
    // an emitter of a level that is no longer shown is withdrawn
    for (const id of [...registered]) if (!live.has(id)) { try { roomLight.removeEmitter?.(id); } catch { /* it stays, dark levels only */ } registered.delete(id); }
  }

  function show(detail) {
    let level = levels.get(detail);
    if (!level) { level = buildLevel(detail); levels.set(detail, level); group.add(level.group); }
    for (const l of levels.values()) l.group.visible = l === level;
    emissives.length = 0;
    emissives.push(...level.emissives);
    registerEmitters(level);
    current = level;
  }

  try {
    const bad = checkAll();
    if (bad.length) throw new Error(`the content audit fails: ${bad[0]}`);
    for (const w of wordsDrawn()) if (!(layout?.WORDS ?? WORDS).includes(w.text)) throw new Error(`a word outside the layout's list: ${w.text}`);
    madeDetail = knobDetail();
    made = makeMaterials(club, roomLight, madeDetail, palette, look, rail, steps);
    show(madeDetail);
  } catch (e) {
    failure = String(e?.message ?? e);
    console.warn('[club] arena surround is unavailable — the hall stands without it:', e);
  }

  // what the bake role needs to hold the rail's and the scoreboard's light (CONTRACT 14.2): the emitters as registered
  const emitterTable = () => (current?.emitters ?? []).map((e) => ({ id: e.id, type: e.type, p: e.p.slice(), axis: e.axis ? e.axis.slice() : null, normal: e.normal ? e.normal.slice() : null, size: e.size.slice(), color: e.color, intensity: levelOf(e), radius: e.radius }));

  const state = () => ({
    enabled: !!current, reason: failure, detail: current?.counts.detail ?? null, texturesFor: madeDetail, lit: made?.lit ?? false, look: { ...look }, bloom,
    floorY: Y, levelsBuilt: levels.size, contentHash: contentHash(), words: wordsDrawn().map((w) => `${w.list}:${w.text}`),
    emitters: [...registered], emitterTable: emitterTable(), signature: current?.signature ?? 'none',
    // the lit rail: its section and its optics as numbers (no cut-off, no capture level: there is none to report)
    // (`hiddenBelowDeg`: the eye's elevation over the rail, on the table's side, below which the near lip hides all of the
    // opal: atan(recess / slot) less the slope's tilt: negative = no eye inside the ring is that low)
    rail: { level: rail.level, power: rail.power, slot: BOARD.profile.slot, recess: BOARD.profile.recess, tiltDeg: BOARD.profile.tilt, hiddenBelowDeg: +((Math.atan(BOARD.profile.recess / BOARD.profile.slot) * 180) / Math.PI - BOARD.profile.tilt).toFixed(2),
      wallShare: +wallShare(BOARD.profile.slot, BOARD.profile.recess, RAIL.wallAlbedo, rail.power).toFixed(5), filterPx: rail.filterpx, washPerMetre: rail.wash ?? capOf(look.boards).perMetre, tool: rail.tool },
    // what the boards are (round A4): LED panels or a front-lit print, the cap's nose, the wash's aim, the display's level
    boards: { kind: look.boards, default: BOARDS.default, cap: capOf(look.boards), led: look.boards === 'led' ? { gain: rail.led, pitch: [...BOARD_LED.pitch], fill: BOARD_LED.fill } : null },
    // what the albedo law did to the painted pictures: each panel's and the seat card's measured mean before and after
    albedoLaw: { panels: made?.atlas?.law ?? null, card: made?.cardLaw?.value ?? null },
    // round A7's steps as built: the tool's switches, the cards' row table, whether the metal reads the hall's reflection
    steps: { ...steps }, rowTable: made?.rowTable?.()?.state?.() ?? null, hall: typeof made?.hallRead === 'function' ? made.hallRead() : null,
    shadowNames: { contact: 'arena.surround.contactshadow', cast: 'arena.surround.castshadow' },
    box: box?.min && box?.max ? { min: box.min.toArray?.() ?? null, max: box.max.toArray?.() ?? null } : null,
    tableBounds: tableBounds ? { ...tableBounds } : null,
  });

  return {
    group,
    emissives,
    /** Switch to another tier's detail level ('lite' | 'base' | 'high'); a level is built the first time it is shown. The
     * canvases keep the size they were painted at (the tier of the page load). */
    setTier(tier) {
      const k = TIERS[tier];
      if (!k || !made) return false;
      try { show(k.roomDetail === 0 || k.roomDetail === 2 ? k.roomDetail : 1); return true; } catch (e) { console.warn('[club] arena surround: tier switch failed:', e); return false; }
    },
    counts() {
      if (!current) return { enabled: false, reason: failure ?? 'not built' };
      return {
        enabled: true, lit: made.lit, ...current.counts,
        textures: made.textures.map((t) => ({ name: t.name, w: t.w, h: t.h, bytes: t.bytes })),
        textureBytes: made.textures.reduce((n, t) => n + t.bytes, 0),
        levelsBuilt: levels.size, look: { ...look },
      };
    },
    state,
    // (`seatRhythm(card, texel)`: what the seats' table says of one card seat, as the card's shader reads it; null without a table)
    api: { seatRhythm: (card, texel) => made?.seatTable?.()?.read(card, texel) ?? null },
    /** The bake's signature of the level shown (arena/room.js reads it for the light map's signature): geometry and emitter places, no levels. */
    signature() { return current?.signature ?? 'none'; },
    dispose() {
      try {
        for (const id of registered) { try { roomLight?.removeEmitter?.(id); } catch { /* nothing to withdraw */ } }
        registered.clear();
        group.traverse((o) => { if (o.isMesh) o.geometry?.dispose?.(); });
        if (made) { for (const t of made.textures) t.texture.dispose(); for (const m of Object.values(made.mats)) m?.dispose?.(); }
        group.parent?.remove(group);
      } catch (e) { console.warn('[club] arena surround: dispose failed:', e); }
      levels.clear(); current = null;
    },
  };
}
